import os
from pathlib import Path

# Load .env file if it exists
env_file = Path(__file__).parent / '.env'
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key.strip()] = value.strip()

# Set OpenMP fix BEFORE importing any ML libraries
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import uvicorn, tempfile

app = FastAPI()

# Model sizes: tiny/base/small/medium/large-v3
# "small" + int8 runs on CPU and is a good starting point.
print("Loading Whisper model...")
model = WhisperModel("small", compute_type="int8")
print(" Whisper model loaded successfully!\n")

@app.get("/")
def root():
    return {"service": "STT", "model": "small", "status": "running"}

@app.get("/health")
def health():
    return {"ok": True, "model": "small"}

@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    name = file.filename or "audio.bin"
    _, ext = os.path.splitext(name)
    if not ext: ext = ".bin"
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    
    try:
        segments, info = model.transcribe(tmp_path, beam_size=1, vad_filter=True)
        text = " ".join(seg.text.strip() for seg in segments)
        return {
            "text": text,
            "language": info.language,
            "duration": info.duration
        }
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

if __name__ == "__main__":
    print("\n" + "="*60)
    print(" STT Service ready at http://127.0.0.1:9000")
    print("="*60 + "\n")
    uvicorn.run(app, host="127.0.0.1", port=9000)