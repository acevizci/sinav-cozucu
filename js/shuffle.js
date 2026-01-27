import { shuffleArray } from "./utils.js";

const LETTERS = ["A","B","C","D","E"];

export function applyShuffle(parsed, { shuffleQ=true, shuffleO=true }){
  const srcQuestions = parsed.questions.map(q => ({...q}));

  if (shuffleQ) shuffleArray(srcQuestions);

  // origN -> displayN
  const mapOriginalToDisplay = {};
  const questions = srcQuestions.map((q, idx) => {
    const displayN = idx + 1;
    mapOriginalToDisplay[q.origN] = displayN;

    // optionsByLetter: A..E -> {id,text}
    let opts;
    if (Array.isArray(q.options)) {
      opts = q.options.map(o => ({...o}));
    } else {
      // fallback: optionsByLetter -> array
      opts = LETTERS.map(L => ({ id: L, text: (q.optionsByLetter?.[L]?.text || "") }));
    }

    if (shuffleO){
      const filled = opts.filter(o => (o.text||"").trim() !== "");
      shuffleArray(filled);

      const byLetter = {};
      for (let i=0;i<LETTERS.length;i++){
        const L = LETTERS[i];
        const picked = filled[i] ? filled[i] : { id: null, text: "" };
        byLetter[L] = picked;
      }
      return { n: displayN, origN: q.origN, text: q.text, optionsByLetter: byLetter };
    } else {
      const byLetter = {};
      for (const L of LETTERS){
        const found = opts.find(o => o.id === L) || { id: L, text: "" };
        byLetter[L] = found;
      }
      return { n: displayN, origN: q.origN, text: q.text, optionsByLetter: byLetter };
    }
  });

  // answerKeyDisplay: displayN -> correctOptionId (A-E)
  // (doğru harf değil, doğru şıkkın "id"si)
  const answerKeyDisplay = {};
  for (const [origNStr, correctId] of Object.entries(parsed.answerKey || {})){
    const origN = Number(origNStr);
    const displayN = mapOriginalToDisplay[origN];
    if (!displayN) continue;
    answerKeyDisplay[displayN] = String(correctId).toUpperCase();
  }

  const keyCount = Object.keys(answerKeyDisplay).length;

  return {
    title: parsed.title,
    questions,
    answerKey: answerKeyDisplay, // displayN -> optionId
    keyCount,
    mapOriginalToDisplay
  };
}

export function getCorrectDisplayLetter(question, correctOptionId){
  // correctOptionId: 'A'..'E'
  if (!correctOptionId) return null;
  for (const L of LETTERS){
    if ((question.optionsByLetter[L]?.id || "").toUpperCase() === correctOptionId.toUpperCase()) return L;
  }
  return null;
}

export function getChosenOptionId(question, chosenLetter){
  if (!chosenLetter) return null;
  return question.optionsByLetter?.[chosenLetter]?.id || null;
}

export const LETTERS_CONST = LETTERS;