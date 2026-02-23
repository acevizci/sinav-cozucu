import { appError } from "../ui/uiAlert.js";
import { callGeminiJSON } from "./geminiClient.js";
// js/aiPractice/practiceGenerator.js
// CLIENT-SIDE Gemini Practice Generator (Temporary Dev Mode)
// Model is auto-resolved via ListModels (shared geminiClient.js)

// practiceGenerator historically used appError(); we keep the same surface by mapping geminiClient errors.
async function callGeminiJSON_AppError(prompt){
  const onStep = (id) => { try { window.setLoading?.(true, { sub:{ id } }); } catch {} };
  try {
    return await callGeminiJSON(prompt, { temperature: 0.4, topP: 0.9, responseMimeType: "application/json", onStep });
  } catch (e){
    const code = e?.code || "ERR_GEMINI_UNKNOWN";
    const extra = e?.extra || {};
    // map to existing error ids used across ACUMEN
    if (code === "ERR_NO_GEMINI_KEY") throw appError("ERR_GEMINI_API_KEY_BULUNAMADI_LOCALSTORA");
    if (code === "ERR_AI_LIST_MODELS_FAILED") throw appError("ERR_AI_LIST_MODELS_FAILED", extra);
    if (code === "ERR_GEMINI_CALL_FAILED") throw appError("ERR_GEMINI_CALL_FAILED", extra);
    if (code === "ERR_GEMINI_EMPTY_RESPONSE") throw appError("ERR_GEMINI_BOS_CEVAP_DONDU");
    if (code === "ERR_GEMINI_JSON_PARSE_FAILED") throw appError("ERR_GEMINI_JSON_PARSE_EDILEMEDI");
    if (code === "ERR_NO_VIABLE_GEMINI_MODEL") throw appError("ERR_GENERATECONTENT_DESTEKLEYEN_MODEL_BU");
    throw e;
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
  const out = await callGeminiJSON_AppError(prompt);
  if (!out?.questions?.length) throw appError("ERR_GEMINI_GECERLI_SORU_URETMEDI");
  return out;
}

export async function generatePracticeSet(payload){
  return await generatePractice(payload);
}

// UI bazı sürümlerde bunu import ediyor (alias)
export const generatePracticeOnServer = generatePractice;