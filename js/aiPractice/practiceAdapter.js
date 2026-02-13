// js/aiPractice/practiceAdapter.js
// Converts backend response into ACUMEN parsed exam schema.

import { normalizeText } from "../utils.js";

const LETTERS = ["A","B","C","D","E"];

function toOptionMap(choices){
  // choices can be {A:..} or array
  const map = {};
  if (Array.isArray(choices)){
    for (let i = 0; i < Math.min(choices.length, 5); i++){
      const L = LETTERS[i];
      map[L] = { id: L, text: normalizeText(choices[i] ?? "") };
    }
  } else {
    for (const L of LETTERS){
      if (choices && choices[L] != null) map[L] = { id: L, text: normalizeText(choices[L]) };
    }
  }
  return map;
}

export function toParsedExam(resp, { fallbackTitle = "AI Deneme" } = {}){
  const parsed = resp?.parsedExam || resp?.parsed || resp;
  if (!parsed) throw new Error("Boş yanıt");

  // If already ACUMEN schema: { title, questions: [{n, text, optionsByLetter}], answerKey }
  if (Array.isArray(parsed.questions) && parsed.questions[0] && parsed.questions[0].optionsByLetter){
    const out = { ...parsed };
    out.title = out.title || fallbackTitle;
    out.answerKey = out.answerKey || {};
    out.keyCount = out.keyCount || Object.keys(out.answerKey).length;
    out.meta = out.meta || {};
    return out;
  }

  // Else: { questions:[{stem, choices, correct, explanation, sourceId...}], answerKey }
  const qArr = Array.isArray(parsed.questions) ? parsed.questions : [];
  const answerKey = parsed.answerKey || {};

  const out = {
    title: parsed.title || fallbackTitle,
    questions: [],
    answerKey: {},
    keyCount: 0,
    meta: { ...(parsed.meta || {}), isAiGenerated: true },
  };

  for (let i = 0; i < qArr.length; i++){
    const q = qArr[i] || {};
    const n = i + 1;
    const optMap = q.optionsByLetter || toOptionMap(q.choices || q.options);
    out.questions.push({
      n,
      text: normalizeText(q.text || q.stem || ""),
      optionsByLetter: optMap,
      subject: q.subject || (Array.isArray(q.tags) ? q.tags[0] : "") || "",
      explanation: q.explanation || "",
      meta: {
        sourceId: q.sourceId || q.source_id || null,
        sourceTitle: q.sourceTitle || q.source_title || null,
        difficulty: q.difficulty || null,
        tags: q.tags || null,
      }
    });

    const corr = q.answer || q.correct || q.correctAnswer || answerKey[q.id] || answerKey[String(n)] || answerKey[n];
    if (corr) out.answerKey[n] = String(corr).trim().toUpperCase();
  }

  out.keyCount = Object.keys(out.answerKey).length;
  out.meta.keySource = parsed.meta?.keySource || "ai";
  out.meta.keyCoverage = out.questions.length ? (out.keyCount / out.questions.length) : 0;

  return out;
}
