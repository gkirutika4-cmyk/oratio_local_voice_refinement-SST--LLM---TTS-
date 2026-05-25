# Oratio
 
**Local speech refinement pipeline: STT → transcript cleanup → prosody metrics → optional TTS**
 
Oratio turns raw spoken audio into a cleaner, more structured delivery. It transcribes speech locally, refines the transcript with a local LLM or fallback cleanup layer, calculates delivery metrics, generates a prosody plan, and optionally synthesizes a polished spoken version.
 
The project is a small local orchestration system, not a single model call.
 
> Reviewers can start with `demo_assets/` to see generated sample inputs and example outputs without needing to run the app.
 
---
 
## At a glance
 
| Part | What it does |
|---|---|
| `server.js` | Node/Express orchestration layer. Handles upload, STT, refinement, metrics, optional TTS, and saved records. |
| `stt_service.py` | Local speech-to-text service using FastAPI and `faster-whisper`. |
| `refine.js` | Transcript cleanup using Ollama, with regex fallback if the local LLM is unavailable. |
| `prosody.js` | Filler counting, words-per-minute, pause planning, and SSML helpers. |
| `tts_service.py` | Optional local text-to-speech service using Coqui XTTS. |
| `demo_assets/` | Generated demo audio and example output files. No personal recordings. |
 
---
 
## Core idea
 
Spoken communication is naturally messy. People pause, repeat themselves, speak too quickly, and use filler words.
 
Oratio turns that into a structured delivery record:
 
```text
Audio input
   ↓
Speech-to-text (faster-whisper)
   ↓
Transcript refinement (Ollama or regex fallback)
   ↓
Prosody + delivery metrics
   ↓
Optional TTS output (Coqui XTTS)
   ↓
Saved JSON record
```
 
---
 
## Demo example
 
**Raw input:**
 
```text
Um, I think small habits can be useful, maybe, because they sort of make change feel a bit more manageable.
Instead of trying to change everything at once, I guess maybe it is better to start with something simple,
like reading for ten minutes, taking a short walk, or planning one task for the day.
```
 
**Refined output:**
 
```text
I think small habits can be useful because they make change feel more manageable. Instead of trying to change
everything at once, it can help to start with something simple, like reading for 10 minutes, taking a short
walk, or planning one task for the day.
```
 
**What changed:**
 
```text
Filler words removed
Hesitant phrasing reduced
Punctuation improved
Original meaning preserved
Delivery metrics generated
Prosody structure generated
```
 
---
 
## Architecture
 
The STT and TTS components run as separate Python FastAPI services because most speech ML tooling is stronger in Python. The Node server owns the application flow, API responses, file handling, health checks, and saved records.
 
```text
Browser frontend
      |
      v
Node / Express API (server.js)
      |
      |---> STT Service          FastAPI + faster-whisper
      |
      |---> Transcript Refinement    Ollama LLM → regex fallback
      |
      |---> Prosody + Metrics        filler count, WPM, pause plan, SSML
      |
      |---> TTS Service          FastAPI + Coqui XTTS
```
 
**Graceful degradation:** if TTS is offline, Oratio still returns the transcript, refined text, metrics, and saved record. If Ollama is unavailable, the refinement layer falls back to offline regex cleanup. One failed service does not break the pipeline.
 
Each service exposes its own health check endpoint. The orchestration layer polls them independently and reports status.
 
---
 
## Safety properties
 
| Property | How it works |
|---|---|
| Ollama unavailable | Regex fallback handles transcript cleanup automatically. |
| TTS unavailable | Transcript, metrics, and saved record are still returned. |
| Upload-only mode | Set `UPLOAD_ONLY=1` to skip STT/TTS entirely for lightweight demos. |
| Health checks | Each service reports its own status independently via `/health`. |
| No external APIs | Everything runs locally. No OpenAI key or hosted backend required. |
 
---
 
## Transcript refinement
 
The refinement layer is a cleanup engine, not a chatbot.
 
Rules:
 
```text
Remove obvious filler words
Preserve the speaker's meaning exactly
Do not add new information
Do not answer the speaker
Add light punctuation
Return only the cleaned transcript
```
 
If Ollama is unavailable or returns invalid output, Oratio falls back to regex-based offline cleanup automatically.
 
---
 
## Flag model
 
The prosody layer calculates:
 
```text
filler count       (um, uh, like, you know, sort of, etc.)
words per minute
sentence fragments
pause plan
SSML output
```
 
Example prosody output:
 
```json
{
  "target_wpm": 150,
  "sentences": [
    {
      "sentence": "I think small habits can be useful.",
      "fragments": [{ "text": "I think small habits can be useful.", "pause_ms_after": 0 }],
      "pause_ms_after": 400
    }
  ]
}
```
 
---
 
## How to run
 
### 1. Install dependencies
 
```bash
npm install
python -m pip install -r requirements.txt
```
 
### 2. Create your local `.env`
 
```bash
cp .env.example .env
```
 
Example `.env`:
 
```env
KMP_DUPLICATE_LIB_OK=TRUE
STT_URL=http://127.0.0.1:9000
TTS_URL=http://127.0.0.1:9001
PORT=8080
DEVICE=cpu
UPLOAD_ONLY=0
SPEAKER_WAV=voice_samples/reference.wav
OLLAMA_URL=http://127.0.0.1:11434/api/generate
OLLAMA_MODEL=llama3.2:3b
OLLAMA_TEMPERATURE=0.2
```
 
### 3. Start all services
 
```bash
npm run dev
```
 
This starts:
 
```text
STT service:  http://127.0.0.1:9000
TTS service:  http://127.0.0.1:9001
Web server:   http://localhost:8080
```
 
Open `http://localhost:8080` in your browser.
 
### Lightweight demo mode
 
To demo without loading STT/TTS models:
 
```env
UPLOAD_ONLY=1
```
 
---
 
## Running services manually
 
Terminal 1:
 
```bash
python stt_service.py
```
 
Terminal 2:
 
```bash
python tts_service.py
```
 
Terminal 3:
 
```bash
node server.js
```
 
---
 
## Ollama setup
 
```bash
ollama pull llama3.2:3b
```
 
If Ollama is unavailable, Oratio falls back to regex cleanup automatically.
 
---
 
## API
 
### Health check
 
```http
GET /api/health
```
 
```json
{
  "ok": true,
  "mode": "full",
  "services": { "stt": "online", "tts": "online" }
}
```
 
### Upload audio
 
```http
POST /api/upload
```
 
```bash
curl -F "audio=@sample.wav" http://localhost:8080/api/upload
```
 
```json
{
  "clipId": "example-id",
  "status": "processed",
  "refinedPreview": "I think small habits can be useful...",
  "metrics": { "fillerCount": 6, "wpm": 135, "duration": 28 }
}
```
 
### Get recording details
 
```http
GET /api/recording/:id
```
 
Returns the full saved record: raw transcript, refined transcript, metrics, prosody plan, SSML, STT status, TTS status, and generated TTS URL.
 
---
 
## Configuration
 
| Variable | Example | Purpose |
|---|---|---|
| `KMP_DUPLICATE_LIB_OK` | `TRUE` | Windows/OpenMP compatibility fix for ML libraries. |
| `STT_URL` | `http://127.0.0.1:9000` | URL of the local STT service. |
| `TTS_URL` | `http://127.0.0.1:9001` | URL of the local TTS service. |
| `PORT` | `8080` | Port for the Node/Express server. |
| `DEVICE` | `cpu` | Device for TTS. Use `cuda` if supported. |
| `UPLOAD_ONLY` | `0` or `1` | Skip STT/TTS and only save uploads. |
| `SPEAKER_WAV` | `voice_samples/reference.wav` | Optional reference voice for XTTS. |
| `OLLAMA_URL` | `http://127.0.0.1:11434/api/generate` | Local Ollama endpoint. |
| `OLLAMA_MODEL` | `llama3.2:3b` | Local model for transcript cleanup. |
| `OLLAMA_TEMPERATURE` | `0.2` | Refinement temperature. |
 
---
 
## Project structure
 
```text
oratio/
├── README.md
├── .gitignore
├── .env.example
├── package.json
├── package-lock.json
├── requirements.txt
├── server.js              # Orchestration layer
├── refine.js              # LLM refinement + regex fallback
├── prosody.js             # Filler count, WPM, pause plan, SSML
├── stt_service.py         # FastAPI + faster-whisper
├── tts_service.py         # FastAPI + Coqui XTTS
├── public/                # Frontend
├── demo_assets/           # Safe generated demo files
└── voice_samples/         # Local reference voice (not committed)
```
 
---
 
## Voice sample privacy
 
The following folders stay local and are ignored by Git:
 
```text
uploads/          runtime uploaded audio
data/             saved JSON records and generated TTS
voice_samples/    personal reference voice samples
```
 
Only generated demo files under `demo_assets/` should be committed. Do not commit personal voice recordings or private generated outputs.
 
---
 
## Tech stack
 
- **Node.js / Express** — orchestration, API, file handling
- **Python / FastAPI / Uvicorn** — STT and TTS services
- **faster-whisper** — local speech-to-text
- **Ollama** — local LLM transcript refinement
- **Coqui TTS / XTTS v2 / PyTorch** — local text-to-speech
- **Multer / music-metadata / UUID** — upload handling and record management
---
 
## Known limitations
 
This is a local prototype, not a production speech platform.
 
```text
No user authentication
No background job queue
No database layer
No streaming transcription
TTS is slow on CPU
XTTS first load can take several minutes
Local model quality depends on machine resources
```
 
---
 
## Core takeaway
 
The value of Oratio is not any single model call.
 
It is the orchestration: separate STT and TTS services, a local LLM cleanup layer with fallback behaviour, per-service health checks, delivery metrics, and saved records — all running locally with no external APIs.
 
```text
Audio input → speech-to-text → local refinement → delivery metrics → optional voice output → saved record
```
