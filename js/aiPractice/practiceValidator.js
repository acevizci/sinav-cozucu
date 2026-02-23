import { appError } from "../ui/uiAlert.js";
// js/aiPractice/practiceValidator.js
// Minimal validation for ACUMEN parsed exam.

const LETTERS = ["A","B","C","D","E"];

export function validateParsedExam(parsed){
  if (!parsed || !Array.isArray(parsed.questions)) throw appError("ERR_GECERSIZ_SINAV_FORMATI");
  if (parsed.questions.length !== 20) throw appError("ERR_EXPECTED_20_QUESTIONS", { got: parsed.questions.length });

  for (const q of parsed.questions){
    if (typeof q.n !== "number") throw appError("ERR_SORU_NUMARASI_EKSIK");
    if (!q.text || String(q.text).trim().length < 2) throw appError("ERR_QUESTION_TEXT_EMPTY", { n: q.n });
    const ob = q.optionsByLetter || {};
    for (const L of LETTERS){
      if (!ob[L] || !ob[L].text || String(ob[L].text).trim() === "")
        throw appError("ERR_OPTION_MISSING", { n: q.n, opt: L });
    }
  }

  // answerKey optional but recommended
  if (parsed.answerKey && typeof parsed.answerKey !== "object") throw appError("ERR_ANSWERKEY_FORMATI_HATALI");
  return true;
}