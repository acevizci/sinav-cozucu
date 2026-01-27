import { csvCell } from "./utils.js";
import { getCorrectDisplayLetter, getChosenOptionId } from "./shuffle.js";

export function exportCSV(parsed, answersMap){
  const p = parsed;
  if (!p) return "";

  let csv = "Soru,Senin Cevap,Doğru,Durum\n";
  for (const q of p.questions){
    const chosenLetter = answersMap.get(q.n) || "";
    const correctId = p.answerKey[q.n] || "";
    const correctLetter = correctId ? (getCorrectDisplayLetter(q, correctId) || "") : "";

    const chosenId = chosenLetter ? (getChosenOptionId(q, chosenLetter) || "") : "";

    let status = "";
    if (correctId && chosenId) status = (chosenId === correctId) ? "DOGRU" : "YANLIS";
    else if (!chosenLetter) status = "BOS";
    else status = "ANAHTAR_YOK";

    csv += `${q.n},${csvCell(chosenLetter)},${csvCell(correctLetter)},${csvCell(status)}\n`;
  }
  return csv;
}

export function exportJSON(parsed, answersMap, meta={}){
  const p = parsed;
  if (!p) return null;

  return {
    title: p.title,
    mode: meta?.mode ?? null,
    startedAt: meta?.startedAt ?? null,
    durationSec: meta?.durationSec ?? null,
    exportedAt: new Date().toISOString(),
    questions: p.questions.map(q => {
      const yourLetter = answersMap.get(q.n) || null;
      const correctId = p.answerKey[q.n] || null;
      return {
        n: q.n,
        text: q.text,
        optionsByLetter: q.optionsByLetter,
        yourLetter,
        yourId: yourLetter ? (q.optionsByLetter?.[yourLetter]?.id || null) : null,
        correctId,
      };
    })
  };
}