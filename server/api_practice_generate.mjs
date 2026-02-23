// server/api_practice_generate.mjs
// POST /api/practice/generate
// - Auto summarization pipeline for long multi-note sources
// - Generates ACUMEN-compatible parsedExam (questions + answerKey) via Gemini
//
// ENV:
//   GEMINI_API_KEY=...
//   GEMINI_MODEL=models/gemini-1.5-flash  (optional)
//   GEMINI_MODEL_PRO=models/gemini-1.5-pro (optional)

import express from "express";
import { geminiGenerateText, extractJson } from "./gemini_http_client.mjs";

export const router = express.Router();

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "models/gemini-1.5-flash";
const PRO_MODEL = process.env.GEMINI_MODEL_PRO || "models/gemini-1.5-pro";

// Text budget (chars). Tweak per deployment.
const MAX_TOTAL_CHARS = 60000;
const MAX_SOURCE_CHARS = 22000;
const SUMMARY_TARGET_CHARS = 6000; // per source

function clampInt(v, a, b){
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return a;
  return Math.min(b, Math.max(a, n));
}
function safeStr(s){ return String(s || "").trim(); }

function allocationBalanced(total, n){
  const base = Math.floor(total / n);
  let rem = total - base*n;
  const out = Array.from({length:n}, ()=>base);
  for (let i=0;i<n;i++){
    if (rem<=0) break;
    out[i] += 1; rem -= 1;
  }
  return out;
}

function allocationPriority(total, n){
  const weights = Array.from({length:n}, (_,i)=> (n-i));
  const sum = weights.reduce((a,b)=>a+b,0);
  let out = weights.map(w => Math.floor((w/sum)*total));
  let cur = out.reduce((a,b)=>a+b,0);
  let i=0;
  while (cur < total){ out[i % n] += 1; cur++; i++; }
  while (cur > total){
    const idx = out.findIndex(x=>x>0);
    if (idx<0) break;
    out[idx] -= 1; cur--;
  }
  return out;
}

function needSummarize(sources){
  const total = sources.reduce((acc,s)=> acc + (s.text?.length||0), 0);
  if (total > MAX_TOTAL_CHARS) return true;
  if (sources.some(s => (s.text?.length||0) > MAX_SOURCE_CHARS)) return true;
  return false;
}

async function summarizeSource({ apiKey, title, text }){
  const prompt = `
Aşağıdaki ders notunu soru üretimine uygun, YOĞUN ve KAPSAMLI bir özet haline getir.

KURALLAR:
- Türkçe yaz.
- Kısa ama bilgi yoğun olsun: tanımlar, formüller, kritik kavramlar, örnek tipleri, sık yapılan hatalar.
- Madde işaretleri kullanabilirsin ama Markdown başlıkları (#) kullanma.
- Gereksiz giriş/cümle yok, sadece içerik.
- Yaklaşık ${SUMMARY_TARGET_CHARS} karakteri aşma.
- Not içeriğinde geçen terimleri KORU, uydurma bilgi ekleme.

NOT BAŞLIĞI: ${safeStr(title)}

NOT METNİ:
${safeStr(text)}
`.trim();

  const raw = await geminiGenerateText({
    apiKey,
    model: DEFAULT_MODEL,
    prompt,
    temperature: 0.3,
    topP: 0.9,
    responseMimeType: null
  });
  return safeStr(raw);
}

function buildGeneratePrompt({ sources, allocation, settings, previous }){
  const total = clampInt(settings?.questionCount ?? 20, 1, 60);
  const choices = clampInt(settings?.choices ?? 5, 4, 6);

  const prevStems = Array.isArray(previous?.stemsHash) ? previous.stemsHash.slice(0, 400) : [];
  const weakTags = Array.isArray(previous?.weakTags) ? previous.weakTags.slice(0, 30) : [];

  const sourceBlocks = sources.map((s, idx) => {
    const cnt = allocation[idx] || 0;
    return `
=== SOURCE ${idx+1} ===
sourceId: ${safeStr(s.id)}
sourceTitle: ${safeStr(s.title)}
requiredQuestionCount: ${cnt}
content:
${safeStr(s.text)}
`.trim();
  }).join("\n\n");

  return `
SENARYO:
Sen deneyimli bir öğretmensin. Aşağıdaki kaynak ders notlarına dayanarak ${total} adet çoktan seçmeli soru üreteceksin.

ZORUNLU KURALLAR:
- Her soru 5 şıklı olacak (A,B,C,D,E). (choices=${choices})
- Her sorunun TEK doğru cevabı olacak.
- Şıklar mantıklı çeldiriciler olmalı. Rastgele/komik şık yok.
- "Hepsi/Hiçbiri" türü şıklar kullanma.
- Soru metni kaynak içeriğe dayanmalı; uydurma bilgi ekleme.
- Her soru için: sourceId, stem, choices{A..E}, correct (A..E), explanation, difficulty(1-5), tags[] üret.
- Dağılımı mutlaka uygula: Her source için requiredQuestionCount kadar soru üret.
- Daha önce sorulmuşlara BENZER soru üretme: previousStemsHash listesi ile çakışmasın.

WEAK TAG ODAĞI:
- Eğer weakTags verildiyse, bu konulardan daha fazla soru üretmeyi tercih et (ama dağılım kuralını bozma).

FORMAT:
- SADECE geçerli JSON döndür. Başka hiçbir şey yazma.
- JSON şeması:
{
  "questions": [
    {
      "id": "q1",
      "sourceId": "s1",
      "stem": "...",
      "choices": {"A":"...","B":"...","C":"...","D":"...","E":"..."},
      "correct": "A",
      "explanation": "...",
      "difficulty": 3,
      "tags": ["..."]
    }
  ],
  "answerKey": {"q1":"A"},
  "meta": {"questionCount": ${total}}
}

previousStemsHash:
${JSON.stringify(prevStems)}

weakTags:
${JSON.stringify(weakTags)}

KAYNAKLAR:
${sourceBlocks}
`.trim();
}

function toParsedExam({ attemptNo, sources, outJson }){
  const qs = Array.isArray(outJson?.questions) ? outJson.questions : [];
  const answerKey = outJson?.answerKey || {};

  const questions = qs.map((q, i) => {
    const n = i + 1;
    const choices = q.choices || {};
    const optionsByLetter = {
      A: { id: "A", text: safeStr(choices.A) },
      B: { id: "B", text: safeStr(choices.B) },
      C: { id: "C", text: safeStr(choices.C) },
      D: { id: "D", text: safeStr(choices.D) },
      E: { id: "E", text: safeStr(choices.E) },
    };
    return {
      n,
      id: safeStr(q.id) || `q${n}`,
      text: safeStr(q.stem),
      optionsByLetter,
      subject: (Array.isArray(q.tags) && q.tags[0]) ? safeStr(q.tags[0]) : "Genel",
      explanation: safeStr(q.explanation),
      _ai: {
        sourceId: safeStr(q.sourceId),
        difficulty: clampInt(q.difficulty ?? 3, 1, 5),
        tags: Array.isArray(q.tags) ? q.tags.map(safeStr) : []
      }
    };
  });

  const key = {};
  for (let i=0;i<questions.length;i++){
    const q = questions[i];
    const id = q.id;
    let corr = answerKey[id] || answerKey[String(i+1)] || answerKey[i+1] || null;
    corr = safeStr(corr).toUpperCase();
    if (!/^[A-E]$/.test(corr)) corr = null;
    if (corr) key[q.n] = corr;
  }

  return {
    title: `AI Deneme ${attemptNo || 1}`,
    questions,
    answerKey: key,
    keyCount: Object.keys(key).length,
    mapOriginalToDisplay: {},
    meta: {
      isAiGenerated: true,
      attemptNo: attemptNo || 1,
      sourceIds: sources.map(s=>safeStr(s.id)),
      sourceTitles: sources.map(s=>safeStr(s.title)),
      keySource: "generator"
    }
  };
}

router.post("/practice/generate", express.json({ limit: "2mb" }), async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const attemptNo = clampInt(req.body?.attemptNo ?? 1, 1, 999);
    const settings = req.body?.settings || { questionCount: 20, choices: 5 };
    const distribution = safeStr(req.body?.settings?.distribution || req.body?.distribution || "balanced");

    let sources = Array.isArray(req.body?.sources) ? req.body.sources : [];
    sources = sources
      .map(s => ({ id: safeStr(s.id), title: safeStr(s.title), text: safeStr(s.text) }))
      .filter(s => s.id && s.text);

    if (!sources.length) return res.status(400).json({ error: "sources boş" });

    const totalQ = clampInt(settings?.questionCount ?? 20, 1, 60);
    const n = sources.length;
    const allocation = (distribution === "priority")
      ? allocationPriority(totalQ, n)
      : allocationBalanced(totalQ, n);

    const previous = req.body?.previous || {};
    const doSumm = Boolean(req.body?.autoSummarize ?? true);

    let summarized = false;
    if (doSumm && needSummarize(sources)) {
      summarized = true;
      const newSources = [];
      for (const s of sources) {
        const sum = await summarizeSource({ apiKey, title: s.title, text: s.text });
        newSources.push({ ...s, text: sum });
      }
      sources = newSources;
    }

    const prompt = buildGeneratePrompt({ sources, allocation, settings, previous });

    const raw = await geminiGenerateText({
      apiKey,
      model: PRO_MODEL,
      prompt,
      temperature: 0.45,
      topP: 0.9,
      responseMimeType: "application/json"
    });

    const outJson = extractJson(raw);
    const parsedExam = toParsedExam({ attemptNo, sources, outJson });

    res.json({ parsedExam, meta: { summarized, sourceCount: sources.length, allocation } });
  } catch (e) {
    console.error("[practice/generate] error:", e);
    res.status(500).json({ error: e?.message || "Server error" });
  }
});
