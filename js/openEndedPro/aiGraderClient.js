// js/openEndedPro/aiGraderClient.js
// Open-ended PRO grading client
// - Uses existing Gemini integration via js/aiPractice/geminiClient.js
// - Optional backend endpoint (if you have one), but avoids POST spam on static servers
// - Named exports only (no default export, no window attach)

import { callGeminiJSON } from "../aiPractice/geminiClient.js";

const DEFAULT_ENDPOINT = "/api/grade/open-ended";
const LS_ENDPOINT = "acumen:openEndedGradeEndpoint";
const LS_NO_BACKEND = "acumen:openEndedNoBackend";

const LS_MODEL_GRADING = "acumen:geminiModel_grading";

function getCachedGradingModel() {
  try { return localStorage.getItem(LS_MODEL_GRADING) || ""; } catch (_) { return ""; }
}

function resolveEndpoint() {
  try {
    if (window.__ACUMEN_CONFIG?.openEndedGradeEndpoint) return window.__ACUMEN_CONFIG.openEndedGradeEndpoint;
    const ls = localStorage.getItem(LS_ENDPOINT);
    if (ls) return ls;
  } catch (_) {}
  return DEFAULT_ENDPOINT;
}

function getNoBackendCached() {
  try { return localStorage.getItem(LS_NO_BACKEND) === "1"; } catch (_) { return false; }
}
function setNoBackendCached(v) {
  try { localStorage.setItem(LS_NO_BACKEND, v ? "1" : "0"); } catch (_) {}
}

function clamp(n, min, max) {
  n = Number(n);
  if (Number.isNaN(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizePayload(j) {
  if (!j || typeof j !== "object") throw new Error("Invalid AI payload");
  return {
    score: clamp(j.score, 0, 100),
    subscores: (j.subscores && typeof j.subscores === "object") ? j.subscores : {},
    missing_points: Array.isArray(j.missing_points) ? j.missing_points : [],
    outline: Array.isArray(j.outline) ? j.outline : [],
    brief_feedback: String(j.brief_feedback || ""),
    confidence: clamp(j.confidence, 0, 1),
  
    meta: {
      provider: String(j.provider || j.meta?.provider || ""),
      model: String(j.model || j.meta?.model || ""),
      rubric: String(j.rubric || j.meta?.rubric || ""),
    },
  };
}

function buildPrompt({ caseText, question, answer }) {
  return `Sen bir hukuk sınavı değerlendiricisisin.
Yalnızca GEÇERLİ JSON döndür. Markdown yok, açıklama yok.

ÖNEMLİ:
- Öğrenci cevabı çok kısa, eksik veya BOŞ olsa bile soruyu yorumla.
- Önce ideal cevap iskeletini çıkar; sonra öğrencinin cevabını buna göre değerlendir.
- Cevap yetersizse puanı düşür ama yine de: outline + missing_points + brief_feedback DOLDUR.
- Varsayım yapman gerekiyorsa bunu missing_points veya brief_feedback içinde açıkça belirt.

Şema:
{
  "score": 0-100,
  "subscores": { "kriter": 0-100 },
  "missing_points": ["..."],
  "outline": ["..."],
  "brief_feedback": "...",
  "confidence": 0-1
}

OLARAK ÇIKTIYI HER ZAMAN DOLDUR:
- outline en az 4 madde,
- missing_points en az 3 madde (cevap boşsa daha fazla olabilir),
- brief_feedback en az 2 cümle.

OLAY:
${caseText}

SORU:
${question}

ÖĞRENCİ CEVABI:
${answer || ""}

JSON dışında hiçbir şey döndürme.    `;
}

async function tryBackend({ caseText, question, answer }) {
  if (getNoBackendCached()) {
    const err = new Error("NO_BACKEND_CACHED");
    err.code = "NO_BACKEND";
    throw err;
  }

  const endpoint = resolveEndpoint();

  // If using default endpoint on common static dev servers, skip immediately
  if (endpoint === DEFAULT_ENDPOINT && (location.protocol === "file:" || String(location.port) === "5500")) {
    setNoBackendCached(true);
    const err = new Error("NO_BACKEND_STATIC_SERVER");
    err.code = "NO_BACKEND";
    throw err;
  }

  // Python's `http.server` (commonly used at :8000) returns 501 for POST.
  // In practice mode, we skip backend probing unless explicitly configured to avoid noisy console errors.
  if (endpoint === DEFAULT_ENDPOINT && location.hostname && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && ["8000","8080","8888"].includes(String(location.port||""))) {
    setNoBackendCached(true);
    const err = new Error("NO_BACKEND_PY_HTTP_SERVER");
    err.code = "NO_BACKEND";
    throw err;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ caseText, question, answer }),
  });

  if (res.ok) return await res.json();

  if ([501, 404, 405].includes(res.status)) {
    setNoBackendCached(true);
    const err = new Error("NO_BACKEND_ENDPOINT");
    err.code = "NO_BACKEND";
    throw err;
  }

  const t = await res.text().catch(() => "");
  const err = new Error("AI grading failed: " + res.status + (t ? " - " + t.slice(0, 200) : ""));
  err.code = "BAD_RESPONSE";
  throw err;
}

export async function gradeSubQuestion({ caseText, question, answer }) {
  // 1) backend (if available)
  try {
    const json = await tryBackend({ caseText, question, answer });
    const norm = normalizePayload(json);
    if (!norm.meta.provider) norm.meta.provider = "backend";
    return norm;
  } catch (_) {
    // 2) fallback to Gemini (existing integration)
    const out = await callGeminiJSON(buildPrompt({ caseText, question, answer }), {
      // keep grading model cache separate from practice generation
      cacheKey: "acumen:geminiModel_grading",
      cacheTsKey: "acumen:geminiModel_grading_ts",
      ttlMs: 1000 * 60 * 60 * 24 * 7,
    });
    const norm = normalizePayload(out);
    if (!norm.meta.provider) norm.meta.provider = "gemini";
    if (!norm.meta.model) norm.meta.model = getCachedGradingModel();
    return norm;
  }
}

/**
 * gradeAll signature used by Open-ended PRO UI
 * @param {object} args
 * @param {string} args.caseText
 * @param {Array<{id:string,text:string}>} args.questions
 * @param {Record<string,string>} args.answers
 * @param {number} [args.concurrency=2]
 * @param {(done:number,total:number,id:string)=>void} [args.onProgress]
 */
export async function gradeAll({ caseText, questions, answers, concurrency = 2, onProgress }) {
  const results = {};
  const qs = Array.isArray(questions) ? questions : [];
  const total = qs.length;

  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < total) {
      const i = idx++;
      const q = qs[i];
      const id = q.id;
      const a = (answers && Object.prototype.hasOwnProperty.call(answers, id)) ? (answers[id] || "") : "";
try {
        results[id] = await gradeSubQuestion({ caseText, question: q.text, answer: a });
      } catch (e) {
        results[id] = { error: e.message || String(e) };
      } finally {
        done++;
        if (typeof onProgress === "function") {
          try { onProgress(done, total, id); } catch (_) {}
        }
      }
    }
  }

  const workers = [];
  for (let k = 0; k < Math.max(1, concurrency); k++) workers.push(worker());
  await Promise.all(workers);
  return results;
}


// Optional global hook for review/regrade flows (best-effort)
try {
  if (typeof window !== "undefined") {
    window.__ACUMEN_GRADE_OPEN_ENDED = async ({ caseText = "", question = "", answer = "" } = {}) => {
      return await gradeSubQuestion({ caseText, question, answer });
    };
  }
} catch {}
