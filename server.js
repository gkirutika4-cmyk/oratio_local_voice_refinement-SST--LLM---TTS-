// server.js - Enhanced with better error handling and debugging
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fsp from "fs/promises";
import fetch from "node-fetch";
import FormData from "form-data";
import * as mm from "music-metadata";
import { v4 as uuidv4 } from "uuid";

import { countFillers, wordsPerMinute, buildProsodyPlan, toSSML } from "./prosody.js";
import { refineTranscript } from "./refine.js";

// --- config (env) ---
const STT_URL = process.env.STT_URL || "http://127.0.0.1:9000";
const TTS_URL = process.env.TTS_URL || "http://127.0.0.1:9001";
const UPLOAD_ONLY = process.env.UPLOAD_ONLY === "1";

// Use AbortController so STT/TTS/health requests cannot hang forever.
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

// --- boilerplate paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure folders exist
for (const dir of ["public", "uploads", "data"]) {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());

// static
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

// health
app.get("/api/health", async (_req, res) => {
  const health = {
    ok: false,
    mode: UPLOAD_ONLY ? "upload-only" : "full",
    stt_url: STT_URL,
    tts_url: TTS_URL,
    services: {
      stt: "unknown",
      tts: "unknown"
    }
  };
  
  // Check STT
  try {
    const sttRes = await fetchWithTimeout(`${STT_URL}/health`, { method: "GET" }, 2000);
    health.services.stt = sttRes.ok ? "online" : "unreachable";
  } catch {
    health.services.stt = "offline";
  }
  
  // Check TTS
  try {
    const ttsRes = await fetchWithTimeout(`${TTS_URL}/health`, { method: "GET" }, 2000);
    health.services.tts = ttsRes.ok ? "online" : "unreachable";
  } catch {
    health.services.tts = "offline";
  }

  health.ok = UPLOAD_ONLY
    ? true
    : health.services.stt === "online" && health.services.tts === "online";
  
  res.status(health.ok ? 200 : 503).json(health);
});

// error visibility
process.on("unhandledRejection", (e) => console.error("[unhandledRejection]", e));
process.on("uncaughtException", (e) => console.error("[uncaughtException]", e));

// upload pipe
const upload = multer({ dest: path.join(__dirname, "uploads/") });

app.post("/api/upload", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "no_file", detail: "Expected field 'audio' with a file." });
    }

    const src = path.join(__dirname, "uploads", req.file.filename);

    // pick extension from original name or mimetype
    const orig = (req.file.originalname || "").toLowerCase();
    const mt = (req.file.mimetype || "").toLowerCase();
    const ext =
      orig.endsWith(".wav") ? ".wav" :
      orig.endsWith(".ogg") ? ".ogg" :
      orig.endsWith(".m4a") || mt.includes("mp4") || mt.includes("aac") ? ".m4a" :
      ".webm";

    const storedName = req.file.filename + ext;
    const dst = path.join(__dirname, "uploads", storedName);
    await fsp.rename(src, dst);
    console.log("[/api/upload] saved:", storedName);

    // duration (best-effort)
    const meta = await mm.parseFile(dst).catch(() => null);
    const durationSecFromMeta = meta?.format?.duration || 0;

    // ---------- FAST PATH: upload-only mode ----------
    if (UPLOAD_ONLY) {
      const id = uuidv4();
      const record = {
        id,
        created_at: new Date().toISOString(),
        original_path: `/uploads/${storedName}`,
        transcript: "",
        refined_text: "",
        metrics: null,
        prosody: null,
        kural_url: null
      };
      await fsp.writeFile(path.join(__dirname, "data", `${id}.json`), JSON.stringify(record, null, 2));
      return res.json({
        clipId: id,
        status: "uploaded",
        originalUrl: record.original_path,
        refinedPreview: null,
        kuralUrl: null,
        metrics: null
      });
    }
    // --------------------------------------------------

    // ---------- STT (best-effort; never crash) ----------
    let transcript = "";
    let duration = durationSecFromMeta || 0;
    let sttStatus = "skipped";
    try {
      const form = new FormData();
      form.append("file", fs.createReadStream(dst), { 
        filename: storedName, 
        contentType: mt || "audio/webm" 
      });
      
      console.log("[STT] Sending to:", `${STT_URL}/transcribe`);
      const sttRes = await fetchWithTimeout(`${STT_URL}/transcribe`, { 
        method: "POST", 
        body: form
      }, 60000);
      
      if (sttRes.ok) {
        const stt = await sttRes.json();
        transcript = (stt.text || "").trim();
        duration = stt.duration || duration;
        sttStatus = "ok";
        console.log("[STT] Success:", transcript.substring(0, 100) + "...");
      } else {
        const errText = await sttRes.text();
        sttStatus = `http_${sttRes.status}`;
        console.warn("[STT] non-OK", sttRes.status, errText);
      }
    } catch (e) {
      sttStatus = "unreachable";
      console.warn("[STT] unreachable – continuing without transcript:", e?.message || e);
    }

    // ---------- Refine + Prosody (only if we have text) ----------
    let refined = "";
    let plan = null;
    let ssml = null;
    if (transcript) {
      console.log("[Refine] Processing transcript...");
      refined = await refineTranscript(transcript);
      console.log("[Refine] Result:", refined.substring(0, 100) + "...");
      
      const refinedPlain = refined.replace(/\[PAUSE-200\]|\[PAUSE-400\]/g, " ").trim();
      plan = buildProsodyPlan(refinedPlain);
      ssml = toSSML(refinedPlain, plan);
    }

    // ---------- TTS (optional; best-effort) ----------
    let kuralUrl = null;
    let ttsStatus = "skipped";
    if (refined) {
      try {
        const refinedPlain = refined.replace(/\[PAUSE-200\]|\[PAUSE-400\]/g, " ").trim();
        console.log("[TTS] Sending to:", `${TTS_URL}/synthesize`);
        console.log("[TTS] Text length:", refinedPlain.length);
        console.log("[TTS] Text preview:", refinedPlain.substring(0, 100) + "...");
        
        const ttsRes = await fetchWithTimeout(`${TTS_URL}/synthesize`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({ text: refinedPlain })
        }, 300000);
        
        console.log("[TTS] Response status:", ttsRes.status);
        
        if (ttsRes.ok) {
          const tts = await ttsRes.json();
          console.log("[TTS] Response body:", JSON.stringify(tts, null, 2));
          
          if (tts.url) {
            kuralUrl = `${TTS_URL}${tts.url}`;
            ttsStatus = "ok";
            console.log("[TTS] Success:", kuralUrl);
            console.log("[WEB] Open app: http://127.0.0.1:8080");
          } else {
            ttsStatus = "no_url";
            console.warn("[TTS] No URL in response:", tts);
          }
        } else {
          const errText = await ttsRes.text();
          ttsStatus = `http_${ttsRes.status}`;
          console.error("[TTS] Error response:", errText);
          
          // Try to parse error as JSON
          try {
            const errJson = JSON.parse(errText);
            console.error("[TTS] Error details:", errJson);
          } catch {
            console.error("[TTS] Raw error:", errText);
          }
        }
      } catch (e) {
        ttsStatus = "unreachable";
        console.error("[TTS] Exception:", e?.message || e);
        console.error("[TTS] Stack:", e?.stack);
      }
    }

    // Calculate metrics
    const metrics = transcript ? {
      fillerCount: countFillers(transcript),
      wpm: wordsPerMinute(transcript, Math.max(1, duration * 1000)),
      duration: Math.round(duration)
    } : null;

    // Save JSON record
    const id = uuidv4();
    const record = {
      id,
      created_at: new Date().toISOString(),
      original_path: `/uploads/${storedName}`,
      transcript,
      refined_text: refined,
      metrics,
      prosody: refined ? { plan, ssml } : null,
      kural_url: kuralUrl,
      stt_status: sttStatus,
      tts_status: ttsStatus
    };
    await fsp.writeFile(path.join(__dirname, "data", `${id}.json`), JSON.stringify(record, null, 2));

    // Always succeed the upload, even if STT/TTS were unavailable
    res.json({
      clipId: id,
      status: transcript ? "processed" : "uploaded",
      sttStatus,
      ttsStatus,
      originalUrl: record.original_path,
      kuralUrl: kuralUrl,
      metrics: record.metrics,
      refinedPreview: refined || null
    });
  } catch (e) {
    console.error("[/api/upload] error:", e);
    res.status(500).json({ error: "processing_failed", detail: String(e?.message || e) });
  }
});

// Get recording details
app.get("/api/recording/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const dataPath = path.join(__dirname, "data", `${id}.json`);
    
    if (!fs.existsSync(dataPath)) {
      return res.status(404).json({ error: "not_found" });
    }
    
    const data = JSON.parse(await fsp.readFile(dataPath, "utf-8"));
    res.json(data);
  } catch (e) {
    console.error("[/api/recording/:id] error:", e);
    res.status(500).json({ error: "fetch_failed", detail: String(e?.message || e) });
  }
});

// fallback homepage
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ONE listen only
const PORT = process.env.PORT || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🎙️  Voice Refinement Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Server:  http://localhost:${PORT}`);
  console.log(`STT:     ${STT_URL}`);
  console.log(`TTS:     ${TTS_URL}`);
  console.log(`Mode:    ${UPLOAD_ONLY ? "upload-only" : "full pipeline"}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});