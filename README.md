# Oratio

**Local speech refinement pipeline: STT → transcript cleanup → prosody metrics → optional TTS**

Oratio is a local speech-refinement demo that turns raw spoken audio into a cleaner, more polished delivery.

It accepts an audio recording, transcribes it with speech-to-text, refines the transcript with a local LLM or fallback cleanup layer, calculates delivery metrics, generates a simple prosody plan, and can optionally synthesize a cleaner spoken version using text-to-speech.

The project is designed as a small local orchestration system, not just a single model call.

Recruiters or reviewers can start with the `demo_assets/` folder to see generated sample inputs, placeholder reference audio, and example outputs. These assets demonstrate the before-and-after workflow without exposing personal voice recordings.

---

## At a glance

| Part | What it does |
|---|---|
| `server.js` | Main Node/Express orchestration layer. Handles upload, STT, refinement, metrics, optional TTS, and saved records. |
| `stt_service.py` | Local speech-to-text service using FastAPI and `faster-whisper`. |
| `refine.js` | Transcript cleanup using Ollama, with regex fallback if the local LLM is unavailable. |
| `prosody.js` | Filler counting, words-per-minute, pause planning, and SSML helpers. |
| `tts_service.py` | Optional local text-to-speech service using Coqui XTTS. |
| `demo_assets/` | Safe generated demo audio and example output files for GitHub. |
| `voice_samples/` | Local reference voice folder. Personal reference audio should stay local. |
| `uploads/` | Runtime upload folder, created/used locally and ignored by Git. |
| `data/` | Runtime output folder for saved JSON records and generated TTS, ignored by Git. |
| `UPLOAD_ONLY=1` | Lightweight mode for demoing upload flow without loading STT/TTS models. |

---

## Core idea

Spoken communication is naturally messy.

People pause, repeat themselves, speak too quickly or too slowly, and use filler words such as:

```text
um
uh
like
you know
I mean
sort of
```

Oratio turns that messy input into a structured delivery record:

```text
Audio input
   ↓
Speech-to-text
   ↓
Transcript refinement
   ↓
Prosody + speaking metrics
   ↓
Optional text-to-speech output
   ↓
Saved processing record
```

The main value is the orchestration:

```text
raw speech
→ transcript
→ cleaned transcript
→ delivery metrics
→ prosody plan
→ optional generated speech
→ saved JSON record
```

---

## Demo example

### Raw spoken input

```text
Um, I think small habits can be useful, maybe, because they sort of make change feel a bit more manageable.

Instead of trying to change everything at once, I guess maybe it is better to start with something simple, like reading for ten minutes, taking a short walk, or planning one task for the day.

I’m not saying small habits solve everything, and I might be wrong, but they can maybe help people build routine and confidence over time.

So, I guess the main point is that small actions can become meaningful if you keep doing them consistently, or at least I think that is the idea.
```

### Example refined output

```text
I think small habits can be useful because they make change feel more manageable. Instead of trying to change everything at once, it can help to start with something simple, like reading for 10 minutes, taking a short walk, or planning one task for the day. I am not saying small habits solve everything, but they can help people build routine and confidence over time.
```

### What changed

```text
Removed filler words
Reduced hesitant phrasing
Improved punctuation
Preserved the original meaning
Generated delivery metrics
Generated a prosody structure
Optionally generated TTS output
```

---

## Demo assets

This repository can include generated demo files under:

```text
demo_assets/
```

These files are only for showing the expected input/output format. They should not contain personal voice recordings or private user audio.

Example:

```text
demo_assets/
├── stutter_filler_sample.wav
├── reference_placeholder.wav
├── refined_output_sample.wav
└── demo_result_example.json
```

Suggested purpose of each file:

| File | Purpose |
|---|---|
| `stutter_filler_sample.wav` | Generated messy speech input with filler words and hesitation. |
| `reference_placeholder.wav` | Generated placeholder reference voice. Not a real person's voice. |
| `refined_output_sample.wav` | Example generated TTS output from the cleaned transcript. |
| `demo_result_example.json` | Example saved processing record. |

For real local XTTS testing, place your own private reference file at:

```text
voice_samples/reference.wav
```

Do not commit personal voice samples, uploaded recordings, or private generated outputs.

---

## Voice sample privacy

The following folders are intended to stay local and should not contain public personal recordings:

```text
uploads/
data/
voice_samples/
```

They may contain:

```text
personal voice recordings
uploaded audio
generated speech
local test outputs
private reference voice samples
```

Only safe generated demo files should be placed in:

```text
demo_assets/
```

---

## Important note about local AI

This project does **not** require an OpenAI API key or a paid external LLM API.

Transcript refinement is handled locally through Ollama when available.

If Ollama is unavailable, Oratio falls back to offline regex cleanup.

```text
Ollama available     → local LLM refinement
Ollama unavailable   → regex cleanup fallback
```

Speech-to-text and text-to-speech also run locally.

---

## Features

- Upload or record speech audio
- Transcribe audio locally with `faster-whisper`
- Refine transcripts with a local LLM through Ollama
- Fall back to regex cleanup if Ollama is unavailable
- Remove common filler words
- Reduce repeated words
- Calculate words per minute
- Count filler words
- Generate a simple prosody plan
- Convert refined text into SSML
- Optionally synthesize cleaned speech with Coqui XTTS
- Store each processed clip as a JSON record
- Expose health checks for dependent services
- Support upload-only mode for lightweight demos

---

## Architecture

Oratio is built as a local multi-service pipeline.

The browser frontend sends an audio file to the Node/Express server. The Express server acts as the orchestration layer: it saves the upload, calls the speech-to-text service, sends the transcript to the refinement layer, calculates delivery metrics, optionally calls the text-to-speech service, and saves a JSON record of the result.

```text
Frontend
   |
   v
Node / Express API
   |
   |---> STT Service
   |       FastAPI + faster-whisper
   |
   |---> Transcript Refinement
   |       Ollama local LLM
   |       Regex fallback
   |
   |---> Prosody + Metrics
   |       filler count
   |       words per minute
   |       pause plan
   |       SSML
   |
   |---> TTS Service
           FastAPI + Coqui XTTS
```

The STT and TTS components are separated into Python FastAPI services because most speech models and audio tooling are easier to run from Python.

The Node server remains responsible for the application flow, API responses, file handling, health checks, and saved records.

This separation makes the system easier to debug. If TTS is unavailable, Oratio can still return the transcript, refined text, metrics, and saved record. If Ollama is unavailable, the refinement layer falls back to a simpler offline cleanup step.

The architecture is intentionally local-first: the app does not require a hosted backend or external LLM API. Each part runs on the user's machine and communicates over local HTTP services.

---

## Folder architecture

### Repository files

These are the main source files that should be uploaded to GitHub:

```text
oratio/
├── README.md
├── .gitignore
├── .env.example
├── package.json
├── package-lock.json
├── requirements.txt
├── server.js
├── refine.js
├── prosody.js
├── stt_service.py
├── tts_service.py
├── public/
├── demo_assets/
└── voice_samples/
```

### Full local folder layout

When running locally, the project may look like this:

```text
oratio/
├── .venv/                 # Local Python virtual environment, ignored by Git
├── data/                  # Runtime JSON records and generated TTS outputs, ignored by Git
├── demo_assets/           # Safe generated demo files that can be uploaded
├── node_modules/          # Node dependencies, ignored by Git
├── public/                # Frontend files
├── uploads/               # Runtime uploaded audio, ignored by Git
├── voice_samples/         # Local reference voice samples
├── .env                   # Local private config, ignored by Git
├── .env.example           # Safe example config for GitHub
├── .gitignore
├── package.json
├── package-lock.json
├── prosody.js
├── README.md
├── refine.js
├── requirements.txt
├── server.js
├── stt_service.py
└── tts_service.py
```

### What should be committed

Upload these to GitHub:

```text
README.md
.gitignore
.env.example
package.json
package-lock.json
requirements.txt
server.js
refine.js
prosody.js
stt_service.py
tts_service.py
public/
demo_assets/
voice_samples/.gitkeep
```

### What should not be committed

Do not upload these:

```text
.env
.venv/
node_modules/
uploads/
data/
voice_samples/reference.wav
personal voice recordings
private generated TTS outputs
```

The app creates `uploads/` and `data/` automatically when it runs, so those folders do not need to be uploaded.

---

## Tech stack

### Backend

- Node.js
- Express
- Multer
- node-fetch
- music-metadata
- UUID

### Speech-to-text

- Python
- FastAPI
- faster-whisper
- Uvicorn

### Transcript refinement

- Ollama
- Local model, for example `llama3.2:3b`
- Regex fallback when Ollama is unavailable

### Text-to-speech

- Python
- FastAPI
- Coqui TTS
- XTTS v2
- PyTorch

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/oratio.git
cd oratio
```

Replace `YOUR_USERNAME` with your GitHub username.

---

### 2. Install dependencies

Install Node dependencies:

```bash
npm install
```

Install Python dependencies:

```bash
python -m pip install -r requirements.txt
```

On Windows, this may also work:

```bash
py -m pip install -r requirements.txt
```

---

### 3. Create your local `.env`

Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
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

Do not commit your real `.env` file to GitHub.

Only `.env.example` should be uploaded.

---

## Running locally

Start all services:

```bash
npm run dev
```

This starts:

```text
STT service:  http://127.0.0.1:9000
TTS service:  http://127.0.0.1:9001
Web server:   http://localhost:8080
```

Open the app in your browser:

```text
http://localhost:8080
```

or:

```text
http://127.0.0.1:8080
```

---

## Running services manually

If you do not want to use `npm run dev`, start each service separately.

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

Then open:

```text
http://localhost:8080
```

---

## Ollama setup

Oratio can refine transcripts using a local Ollama model.

Install and run Ollama, then pull a small model:

```bash
ollama pull llama3.2:3b
```

The refinement layer calls Ollama at:

```text
http://127.0.0.1:11434/api/generate
```

If Ollama is unavailable, Oratio falls back to offline regex cleanup.

---

## Lightweight demo mode

If you want to demo the upload flow without loading Whisper or XTTS, set this in `.env`:

```env
UPLOAD_ONLY=1
```

Then run:

```bash
npm run dev
```

In upload-only mode, Oratio saves the uploaded audio and creates a record, but skips transcription, LLM refinement, prosody generation, and TTS.

This is useful when demoing on a slower machine or when the TTS model takes too long to load.

---

## API overview

### Health check

```http
GET /api/health
```

Example:

```bash
curl http://localhost:8080/api/health
```

Example response:

```json
{
  "ok": true,
  "mode": "full",
  "stt_url": "http://127.0.0.1:9000",
  "tts_url": "http://127.0.0.1:9001",
  "services": {
    "stt": "online",
    "tts": "online"
  }
}
```

If a dependent service is offline, the health endpoint reports it.

---

### Upload audio

```http
POST /api/upload
```

The request should include a multipart form field named:

```text
audio
```

Example:

```bash
curl -F "audio=@sample.wav" http://localhost:8080/api/upload
```

Example response:

```json
{
  "clipId": "example-id",
  "status": "processed",
  "originalUrl": "/uploads/example.wav",
  "refinedPreview": "I think small habits can be useful because they make change feel more manageable.",
  "kuralUrl": "http://127.0.0.1:9001/outputs/example.wav",
  "metrics": {
    "fillerCount": 6,
    "wpm": 135,
    "duration": 28
  }
}
```

---

### Get recording details

```http
GET /api/recording/:id
```

Example:

```bash
curl http://localhost:8080/api/recording/YOUR_CLIP_ID
```

Returns the saved record for a processed clip.

The record can include:

```text
original audio path
raw transcript
refined transcript
speaking metrics
prosody plan
SSML
STT status
TTS status
generated TTS URL
```

---

## Transcript refinement

The refinement layer is designed to behave like a cleanup engine, not a chatbot.

It should:

```text
remove obvious filler words
preserve the speaker's meaning
avoid adding new information
avoid answering the speaker
add light punctuation
keep separate ideas readable
return only the cleaned transcript
```

If the local LLM fails or returns invalid output, the project falls back to regex cleanup.

This makes the demo more robust because the app can still run even when Ollama is not available.

---

## Prosody and metrics

The prosody helper calculates:

```text
filler count
words per minute
sentence fragments
pause plan
SSML output
```

Example pause plan:

```json
{
  "target_wpm": 150,
  "sentences": [
    {
      "sentence": "I think small habits can be useful.",
      "fragments": [
        {
          "text": "I think small habits can be useful.",
          "pause_ms_after": 0
        }
      ],
      "pause_ms_after": 400
    }
  ]
}
```

This is intentionally simple.

The goal is to show how speech can be converted into structured delivery feedback.

---

## Text-to-speech

The TTS service uses Coqui XTTS.

If a speaker reference file is configured through `SPEAKER_WAV`, the service can use it for voice-conditioned synthesis.

Example:

```env
SPEAKER_WAV=voice_samples/reference.wav
```

Do not upload private or personal voice samples to GitHub.

If no suitable TTS model or speaker file is available, the rest of the pipeline can still be demonstrated through upload-only mode or transcript processing.

---

## Environment variables

| Variable | Example | Purpose |
|---|---|---|
| `KMP_DUPLICATE_LIB_OK` | `TRUE` | Windows/OpenMP compatibility fix for ML libraries. |
| `STT_URL` | `http://127.0.0.1:9000` | URL of the local STT service. |
| `TTS_URL` | `http://127.0.0.1:9001` | URL of the local TTS service. |
| `PORT` | `8080` | Port for the Node/Express web server. |
| `DEVICE` | `cpu` | Device used by the TTS service. Use `cuda` if supported. |
| `UPLOAD_ONLY` | `0` or `1` | If `1`, skips STT/TTS and only saves uploads. |
| `SPEAKER_WAV` | `voice_samples/reference.wav` | Optional local reference voice sample for XTTS. |
| `OLLAMA_URL` | `http://127.0.0.1:11434/api/generate` | Local Ollama generation endpoint. |
| `OLLAMA_MODEL` | `llama3.2:3b` | Local model used for transcript cleanup. |
| `OLLAMA_TEMPERATURE` | `0.2` | Local model refinement temperature. |

---

## Suggested `.gitignore`

```gitignore
# secrets
.env
.env.local

# python
.venv/
venv/
env/
__pycache__/
*.pyc

# node
node_modules/

# generated audio / local runtime data
uploads/
data/

# private voice samples
voice_samples/*
!voice_samples/.gitkeep

# ignore audio files by default
*.wav
*.mp3
*.webm
*.m4a
*.ogg

# allow safe demo assets
!demo_assets/
!demo_assets/*.wav
!demo_assets/*.mp3
!demo_assets/*.webm
!demo_assets/*.m4a
!demo_assets/*.ogg
!demo_assets/*.json

# system
.DS_Store
Thumbs.db
```

---

## Demo script

A short live demo can be done in a few minutes.

### 1. Introduce the project

```text
This is Oratio, a local speech-refinement pipeline. It takes a raw spoken audio clip, transcribes it, cleans up the transcript, calculates delivery metrics, and optionally generates a polished spoken version.
```

### 2. Start the app

```bash
npm run dev
```

Show that it starts three services:

```text
STT
TTS
WEB
```

### 3. Open the app

```text
http://localhost:8080
```

### 4. Upload a sample audio clip

Use a short generated clip with filler words and repeated phrases.

### 5. Walk through the result

Point out:

```text
original uploaded audio
raw transcript
refined transcript
filler count
words per minute
prosody plan
generated TTS output, if available
```

### 6. Explain the engineering design

```text
The interesting part is that this is not a single model call. It is an orchestrated local pipeline with separate STT and TTS services, a local LLM cleanup layer, fallback behaviour, health checks, and saved records.
```

### 7. Show failure tolerance

Open:

```bash
curl http://localhost:8080/api/health
```

Explain:

```text
Each dependency reports its own status. If TTS is offline, the app can still return the transcript, refined text, metrics, and saved record.
```

---

## Design decisions

### Local-first design

The app runs locally without requiring a hosted backend or external LLM API.

This makes it easier to demo, inspect, and modify.

### Separate ML services

STT and TTS are isolated as Python FastAPI services because most audio ML tooling is stronger in Python.

The Node server coordinates the workflow.

### Graceful degradation

The app is designed so that one failed dependency does not necessarily break the entire upload flow.

If Ollama is unavailable, regex cleanup is used.

If TTS is unavailable, the transcript, refined text, metrics, and saved record can still be returned.

### Conservative transcript refinement

The refinement layer is intentionally meaning-preserving.

It removes obvious filler words, reduces repeated words, and adds light punctuation, but should not add new information or change the speaker's intent.

---

## Troubleshooting

### TTS takes a long time to start

The XTTS model can take several minutes to download and load the first time.

For a faster demo, use:

```env
UPLOAD_ONLY=1
```

### TTS health check returns 503

The TTS service started, but the model did not load successfully.

Check the terminal logs for the underlying PyTorch, model, or device error.

### STT is offline

Check the STT service directly:

```bash
curl http://127.0.0.1:9000/health
```

### TTS is offline

Check the TTS service directly:

```bash
curl http://127.0.0.1:9001/health
```

### Ollama is not refining the transcript

Make sure Ollama is installed and the model is available:

```bash
ollama pull llama3.2:3b
```

If Ollama is unavailable, Oratio should use the offline fallback.

### Python command does not work

Depending on your system, use one of:

```bash
py
python
python3
```

If Python dependency installation fails, run:

```bash
python -m pip install -r requirements.txt
```

### Torch or OpenMP errors

The environment variable below helps avoid common OpenMP conflicts:

```env
KMP_DUPLICATE_LIB_OK=TRUE
```

---

## Known limitations

This is a local prototype, not a production speech platform.

Current limitations:

```text
no user authentication
no production file storage
no background job queue
no database layer
no streaming transcription
no production voice-consent system
no deployment configuration
local model performance depends on machine resources
TTS can be slow on CPU
XTTS setup may require additional system dependencies
```

---

## Future improvements

- Add Docker Compose for one-command startup
- Add a database for persistent recording history
- Add a job queue for longer STT/TTS tasks
- Add richer pacing analytics
- Add visual timelines for filler words and pauses
- Add side-by-side waveform playback
- Add user accounts and saved practice sessions
- Improve the frontend dashboard
- Add tests for the API and transcript refinement layer

---

## What I learned

This project helped me practice:

```text
building a multi-service local application
coordinating Node and Python services
designing failure-tolerant API flows
working with STT and TTS models
using local LLMs for controlled transformation tasks
turning unstructured audio into structured records
creating a product-style demo from ML components
```

---

## Core takeaway

Oratio connects STT, local transcript cleanup, prosody metrics, and optional TTS into one local workflow.

The main value is not any single model call.

The value is the orchestration:

```text
audio input
speech-to-text
local refinement
fallback cleanup
delivery metrics
prosody structure
optional voice output
saved record
health checks
```

It demonstrates how local AI services can be combined into a practical speech-improvement tool.

---

## License

This project is shared for portfolio and educational purposes.

Personal voice samples, uploaded recordings, and generated private audio outputs are not included and should not be committed or reused.

Demo audio under `demo_assets/` is provided only as sample material for demonstrating the application workflow.