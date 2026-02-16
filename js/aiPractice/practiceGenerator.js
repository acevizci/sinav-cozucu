import { appError } from "../ui/uiAlert.js";
// js/aiPractice/practiceGenerator.js
// CLIENT-SIDE Gemini Practice Generator (Temporary Dev Mode)
// Model is auto-resolved via ListModels (robust against model name changes)

async function listModels(apiKey){
  try { window.setLoading?.(true, { sub:{ id:"AI_STEP_LISTING_MODELS" } }); } catch {}
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw appError("ERR_AI_LIST_MODELS_FAILED", { status: res.status, details: t.slice(0,200) });
  }
  const data = await res.json();
  return data?.models || [];
}

async function resolveModel(apiKey){
  try { window.setLoading?.(true, { sub:{ id:"AI_STEP_RESOLVING_MODEL" } }); } catch {}
  // cache 24h
  const cacheKey = "ACUMEN_GEMINI_MODEL";
  const cacheTsKey = "ACUMEN_GEMINI_MODEL_TS";
  const ts = Number(localStorage.getItem(cacheTsKey) || 0);
  const cached = localStorage.getItem(cacheKey);

  if (cached && (Date.now() - ts) < 24*60*60*1000) return cached;

  const models = await listModels(apiKey);
  const viable = (models || []).filter(m =>
    Array.isArray(m.supportedGenerationMethods) &&
    m.supportedGenerationMethods.includes("generateContent")
  );

  // prefer flash > pro
  const best =
    viable.find(m => (m.name || "").includes("flash")) ||
    viable.find(m => (m.name || "").includes("pro")) ||
    viable[0];

  if (!best?.name) throw appError("ERR_GENERATECONTENT_DESTEKLEYEN_MODEL_BU");

  // best.name genelde "models/xxx" gelir -> endpoint'te biz "models/{model}:generateContent" kullanacağız
  localStorage.setItem(cacheKey, best.name);
  localStorage.setItem(cacheTsKey, String(Date.now()));
  return best.name;
}

function normalizeJsonText(text){
  const s = String(text || "").trim();
  // bazen ```json ... ``` dönebiliyor
  return s.replace(/```json/gi, "").replace(/```/g, "").trim();
}

async function callGeminiJSON(prompt){
  // ACUMEN ai.js de GEMINI_KEY kullanıyor
  const apiKey = localStorage.getItem("GEMINI_KEY") || localStorage.getItem("GEMINI_API_KEY");
  if (!apiKey) throw appError("ERR_GEMINI_API_KEY_BULUNAMADI_LOCALSTORA");

  try { window.setLoading?.(true, { sub:{ id:"AI_STEP_PREPARING_PROMPT" } }); } catch {}

  const selectedModel = await resolveModel(apiKey); // "models/...."
  const url = `https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const body = {
    generationConfig: {
      temperature: 0.4,
      topP: 0.9,
      responseMimeType: "application/json",
    },
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };

  try { window.setLoading?.(true, { sub:{ id:"AI_STEP_GENERATING" } }); } catch {}
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok){
    const t = await res.text().catch(()=> "");
    throw appError("ERR_GEMINI_CALL_FAILED", { status: res.status, details: t.slice(0,500) });
  }

  const data = await res.json();
  try { window.setLoading?.(true, { sub:{ id:"AI_STEP_PARSING" } }); } catch {}
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) throw appError("ERR_GEMINI_BOS_CEVAP_DONDU");

  const clean = normalizeJsonText(raw);
  try {
    return JSON.parse(clean);
  } catch {
    console.error("[Gemini RAW]", raw);
    throw appError("ERR_GEMINI_JSON_PARSE_EDILEMEDI");
  }
}

function buildPrompt({ attemptNo, sources, settings }){
  const qCount = settings?.questionCount || 20;

  const srcText = (sources || []).map((s,i)=>`
# SOURCE ${i+1}
ID:${s.id}
TITLE:${s.title}
TEXT:
${s.text}
`).join("\n");

  return `
Create exactly ${qCount} multiple choice questions in Turkish.
Each must have 5 options (A,B,C,D,E).
Only one correct.
Output strictly valid JSON only. No markdown.

Schema:
{
 "title":"Deneme ${attemptNo}",
 "questions":[
   {
     "id":"q1",
     "sourceId":"<source id>",
     "stem":"...",
     "choices":{"A":"...","B":"...","C":"...","D":"...","E":"..."},
     "correct":"A",
     "explanation":"...",
     "difficulty":1-5,
     "tags":["..."]
   }
 ]
}

Sources:
${srcText}
`.trim();
}

export async function generatePractice(payload){
  const prompt = buildPrompt(payload);
  const out = await callGeminiJSON(prompt);
  if (!out?.questions?.length) throw appError("ERR_GEMINI_GECERLI_SORU_URETMEDI");
  return out;
}

export async function generatePracticeSet(payload){
  return await generatePractice(payload);
}

// UI bazı sürümlerde bunu import ediyor (alias)
export const generatePracticeOnServer = generatePractice;