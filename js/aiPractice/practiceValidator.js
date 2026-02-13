// js/aiPractice/practiceValidator.js
// Minimal validation for ACUMEN parsed exam.

const LETTERS = ["A","B","C","D","E"];

export function validateParsedExam(parsed){
  if (!parsed || !Array.isArray(parsed.questions)) throw new Error("Geçersiz sınav formatı");
  if (parsed.questions.length !== 20) throw new Error(`20 soru bekleniyordu, ${parsed.questions.length} geldi.`);

  for (const q of parsed.questions){
    if (typeof q.n !== "number") throw new Error("Soru numarası eksik");
    if (!q.text || String(q.text).trim().length < 2) throw new Error(`Soru ${q.n}: boş metin`);
    const ob = q.optionsByLetter || {};
    for (const L of LETTERS){
      if (!ob[L] || !ob[L].text || String(ob[L].text).trim() === "")
        throw new Error(`Soru ${q.n}: ${L} şıkkı eksik`);
    }
  }

  // answerKey optional but recommended
  if (parsed.answerKey && typeof parsed.answerKey !== "object") throw new Error("answerKey formatı hatalı");
  return true;
}
