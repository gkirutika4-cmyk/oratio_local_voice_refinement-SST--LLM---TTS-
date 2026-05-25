import fetch from "node-fetch";

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2:3b";
const OLLAMA_TEMPERATURE = Number(process.env.OLLAMA_TEMPERATURE || 0.2);
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS || 45000);

const FILLERS = /\b(um+|uh+|erm+|like|you know|sort of|kind of|actually|basically|literally|i mean|so)\b/gi;

function normalizeWhitespace(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function offlineRefine(text = "") {
  let t = String(text || "");

  t = t.replace(FILLERS, " ");
  t = t.replace(/\b(\w+)\s+\1\b/gi, "$1");
  t = t.replace(/\s+([,.!?;:])/g, "$1");
  t = t.replace(/\s*,\s*/g, ", ");
  t = t.replace(/\s*\.\s*/g, ". ");

  return normalizeWhitespace(t);
}

function stripCodeFences(text = "") {
  let t = String(text || "").trim();

  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "");
    t = t.replace(/\s*```$/i, "");
  }

  return t.trim();
}

function extractJsonObject(text = "") {
  const t = stripCodeFences(text);
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("ollama_no_json_object");
  }

  return t.slice(start, end + 1);
}

function parseCleanedTranscript(raw = "") {
  const jsonText = extractJsonObject(raw);
  const parsed = JSON.parse(jsonText);

  const cleaned = normalizeWhitespace(parsed.cleaned_transcript || "");

  if (!cleaned) {
    throw new Error("ollama_empty_cleaned_transcript");
  }

  return cleaned;
}

function wordCount(text = "") {
  const t = normalizeWhitespace(text);
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function looksTooShort(original = "", refined = "") {
  const originalWords = wordCount(original);
  const refinedWords = wordCount(refined);

  if (originalWords < 20) return false;

  return refinedWords < originalWords * 0.35;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = OLLAMA_TIMEOUT_MS) {
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

async function refineWithOllama(text, {
  model = OLLAMA_MODEL,
  url = OLLAMA_URL,
  temperature = OLLAMA_TEMPERATURE
} = {}) {
  const system = `
You are a transcript cleanup engine.

Clean the spoken transcript for delivery.

Rules:
- Preserve the speaker's meaning.
- Do not add new information.
- Do not answer the speaker.
- Remove obvious filler words.
- Remove accidental repeated words.
- Improve punctuation lightly.
- Keep the result natural and readable.
- Return valid JSON only.
- Do not include notes.
- Do not include explanations.
- Do not include markdown.
- Do not include commentary.

Return exactly this JSON shape:
{"cleaned_transcript":"..."}
`.trim();

  const prompt = `${system}

Transcript:
${text}`;

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      temperature
    })
  });

  if (!response.ok) {
    throw new Error(`ollama_http_${response.status}`);
  }

  const data = await response.json();
  return parseCleanedTranscript(data.response || "");
}

export async function refineTranscript(rawTranscript = "") {
  const original = normalizeWhitespace(rawTranscript);

  if (!original) {
    return "";
  }

  const fallback = offlineRefine(original);

  try {
    console.log("[Refine] Processing transcript...");

    const refined = await refineWithOllama(original);

    if (looksTooShort(original, refined)) {
      console.warn(
        `[Refine] LLM output too short. Using offline fallback. ` +
        `Original words: ${wordCount(original)}, refined words: ${wordCount(refined)}`
      );
      console.log("[Refine] Fallback result:", fallback.slice(0, 200) + "...");
      return fallback;
    }

    console.log("[Refine] Result:", refined.slice(0, 200) + "...");
    return refined;
  } catch (error) {
    console.warn("[Refine] Ollama failed or returned invalid JSON. Using offline fallback:", error?.message || error);
    console.log("[Refine] Fallback result:", fallback.slice(0, 200) + "...");
    return fallback;
  }
}