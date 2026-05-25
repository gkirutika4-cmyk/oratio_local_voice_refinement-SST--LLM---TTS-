# tts_service.py - Debug version with extensive logging
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

from fastapi import FastAPI, Body
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import uuid, sys, traceback, torch
from datetime import datetime

print(f"Python: {sys.version}")
print(f"PyTorch: {torch.__version__}")

# Fix for PyTorch 2.6+ compatibility with Coqui XTTS checkpoints
original_load = torch.load

def load_wrapper(*args, **kwargs):
    kwargs["weights_only"] = False
    return original_load(*args, **kwargs)

torch.load = load_wrapper
print("Using torch.load weights_only=False compatibility patch")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUT_DIR = os.path.join(os.getcwd(), "data", "tts_outputs")
os.makedirs(OUT_DIR, exist_ok=True)
print(f"Output directory: {OUT_DIR}")

SPEAKER_WAV = os.getenv("SPEAKER_WAV")
DEVICE = os.getenv("DEVICE", "cpu")
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"

print(f"\n{'='*60}")
print(f" TTS Service Starting")
print(f"{'='*60}")
print(f"Model:       {MODEL_NAME}")
print(f"Device:      {DEVICE}")
print(f"Speaker WAV: {SPEAKER_WAV or '(using default voice)'}")
print(f"{'='*60}\n")

_tts = None
_tts_error = None

try:
    print("Loading TTS model... (this may take a few minutes on first run)")
    from TTS.api import TTS
    _tts = TTS(MODEL_NAME).to(DEVICE)
    print(" TTS model loaded successfully!\n")
except Exception as e:
    _tts_error = str(e)
    print(f"\n FAILED to load TTS model!")
    print(f"Error: {e}")
    traceback.print_exc()
    print("\n  Service will start but synthesis will fail until model loads")

@app.get("/")
def root():
    return {
        "service": "TTS",
        "model": MODEL_NAME,
        "device": DEVICE,
        "status": "running" if _tts else "model_not_loaded",
        "error": _tts_error
    }

@app.get("/health")
def health():
    if not _tts:
        return JSONResponse(
            {
                "ok": False,
                "model": MODEL_NAME,
                "device": DEVICE,
                "error": _tts_error or "Model not loaded"
            },
            status_code=503
        )
    return {
        "ok": True,
        "model": MODEL_NAME,
        "device": DEVICE,
        "speaker_wav": bool(SPEAKER_WAV)
    }

@app.post("/synthesize")
def synthesize(payload = Body(...)):
    try:
        print(f"\n{'='*60}")
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Received synthesis request")
        print(f"Payload: {payload}")
        
        if not _tts:
            error_msg = f"TTS model not loaded: {_tts_error}"
            print(f" {error_msg}")
            return JSONResponse(
                {"error": "model_not_loaded", "detail": error_msg},
                status_code=503
            )
        
        text = (payload.get("text") or "").strip()
        print(f"Text to synthesize: '{text[:200]}...'")
        
        if not text:
            print(" Empty text received")
            return JSONResponse({"error": "empty_text"}, status_code=400)
        
        uid = uuid.uuid4().hex
        out_path = os.path.join(OUT_DIR, f"{uid}.wav")
        print(f"Output path: {out_path}")
        
        start_time = datetime.now()
        print("Starting synthesis...")
        
        try:
            if SPEAKER_WAV and os.path.exists(SPEAKER_WAV):
                print(f"Using speaker WAV: {SPEAKER_WAV}")
                _tts.tts_to_file(
                    text=text,
                    speaker_wav=SPEAKER_WAV,
                    language="en",
                    file_path=out_path
                )
            else:
                print("Using default voice")
                _tts.tts_to_file(
                    text=text,
                    language="en",
                    file_path=out_path
                )
        except Exception as synthesis_error:
            print(f" Synthesis failed: {synthesis_error}")
            traceback.print_exc()
            return JSONResponse(
                {"error": "synthesis_failed", "detail": str(synthesis_error)},
                status_code=500
            )
        
        duration = (datetime.now() - start_time).total_seconds()
        
        if not os.path.exists(out_path):
            print(f"Output file not created: {out_path}")
            return JSONResponse(
                {"error": "output_file_missing"},
                status_code=500
            )
        
        file_size = os.path.getsize(out_path)
        print(f"Done in {duration:.1f}s")
        print(f"  File: {os.path.basename(out_path)}")
        print(f"  Size: {file_size:,} bytes")
        print(f"{'='*60}\n")
        
        return {
            "url": f"/outputs/{os.path.basename(out_path)}",
            "duration_seconds": duration,
            "file_size": file_size
        }
        
    except Exception as e:
        print(f"\nUnexpected error in synthesize endpoint:")
        print(f"Error type: {type(e).__name__}")
        print(f"Error message: {e}")
        traceback.print_exc()
        print(f"{'='*60}\n")
        return JSONResponse(
            {"error": "synthesis_failed", "detail": str(e)},
            status_code=500
        )

app.mount("/outputs", StaticFiles(directory=OUT_DIR), name="outputs")

if __name__ == "__main__":
    import uvicorn
    print(f"\n{'='*60}")
    print(f"TTS service starting at http://127.0.0.1:9001")
    print(f"{'='*60}\n")
    uvicorn.run(app, host="0.0.0.0", port=9001, log_level="info")