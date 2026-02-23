// js/aiPractice/geminiClient.js
// Shared Gemini client utilities (browser)
// - Auto-resolves model via ListModels (robust against model name changes)
// - Returns JSON (strict parse) from generateContent
//
// Usage:
//   import { callGeminiJSON } from "./geminiClient.js";
//   const obj = await callGeminiJSON(prompt, { temperature: 0.2, onStep: (id)=>... });

const DEFAULT_CACHE_KEY = "ACUMEN_GEMINI_MODEL";
const DEFAULT_CACHE_TS_KEY = "ACUMEN_GEMINI_MODEL_TS";
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function getGeminiKey() {
  try {
    return (localStorage.getItem("GEMINI_KEY") || localStorage.getItem("GEMINI_API_KEY") || "").trim();
  } catch (_) {
    return "";
  }
}

function normalizeJsonText(text) {
  const s = String(text || "").trim();
  return s.replace(/```json/gi, "").replace(/```/g, "").trim();
}

function makeError(message, code, extra) {
  const e = new Error(message);
  if (code) e.code = code;
  if (extra && typeof extra === "object") e.extra = extra;
  return e;
}

async function listModels(apiKey, { onStep } = {}) {
  try { onStep?.("AI_STEP_LISTING_MODELS"); } catch (_) {}
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw makeError("ListModels failed", "ERR_AI_LIST_MODELS_FAILED", { status: res.status, details: t.slice(0, 300) });
  }
  const data = await res.json();
  return data?.models || [];
}

async function resolveModel(apiKey, {
  onStep,
  cacheKey = DEFAULT_CACHE_KEY,
  cacheTsKey = DEFAULT_CACHE_TS_KEY,
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  try { onStep?.("AI_STEP_RESOLVING_MODEL"); } catch (_) {}

  let ts = 0, cached = "";
  try {
    ts = Number(localStorage.getItem(cacheTsKey) || 0);
    cached = localStorage.getItem(cacheKey) || "";
  } catch (_) {}

  if (cached && (Date.now() - ts) < ttlMs) return cached;

  const models = await listModels(apiKey, { onStep });
  const viable = (models || []).filter(m =>
    Array.isArray(m.supportedGenerationMethods) &&
    m.supportedGenerationMethods.includes("generateContent")
  );

  const best =
    viable.find(m => (m.name || "").includes("flash")) ||
    viable.find(m => (m.name || "").includes("pro")) ||
    viable[0];

  if (!best?.name) throw makeError("generateContent destekleyen model bulunamadı", "ERR_NO_VIABLE_GEMINI_MODEL");

  try {
    localStorage.setItem(cacheKey, best.name);
    localStorage.setItem(cacheTsKey, String(Date.now()));
  } catch (_) {}

  return best.name; // usually "models/...."
}

async function callGeminiJSON(prompt, {
  temperature = 0.4,
  topP = 0.9,
  responseMimeType = "application/json",
  onStep,
  // allow caller to override caching keys to avoid collisions if needed
  cacheKey,
  cacheTsKey,
  ttlMs,
} = {}) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw makeError("Gemini API anahtarı bulunamadı (localStorage: GEMINI_KEY)", "ERR_NO_GEMINI_KEY");

  try { onStep?.("AI_STEP_PREPARING_PROMPT"); } catch (_) {}

  const selectedModel = await resolveModel(apiKey, { onStep, cacheKey, cacheTsKey, ttlMs });
  const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    generationConfig: { temperature, topP, responseMimeType },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  try { onStep?.("AI_STEP_GENERATING"); } catch (_) {}

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    // In case model rotated, clear cache once (best-effort); caller can retry if desired
    try {
      if (cacheKey) localStorage.removeItem(cacheKey);
      else localStorage.removeItem(DEFAULT_CACHE_KEY);
    } catch (_) {}
    throw makeError("Gemini call failed", "ERR_GEMINI_CALL_FAILED", { status: res.status, details: t.slice(0, 500) });
  }

  const data = await res.json();
  try { onStep?.("AI_STEP_PARSING"); } catch (_) {}

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw makeError("Gemini boş cevap döndü", "ERR_GEMINI_EMPTY_RESPONSE");

  const clean = normalizeJsonText(raw);
  try {
    return JSON.parse(clean);
  } catch (_) {
    console.error("[Gemini RAW]", raw);
    throw makeError("Gemini JSON parse edilemedi", "ERR_GEMINI_JSON_PARSE_FAILED");
  }
}

export {
  getGeminiKey,
  normalizeJsonText,
  listModels,
  resolveModel,
  callGeminiJSON,
};
