import { shuffleArray } from "./utils.js";

const LETTERS = ["A","B","C","D","E"];

export function applyShuffle(parsed, { shuffleQ=true, shuffleO=true }){
  const srcQuestions = parsed.questions.map(q => ({...q}));

  if (shuffleQ) shuffleArray(srcQuestions);

  const mapOriginalToDisplay = {};

  const questions = srcQuestions.map((q, idx) => {
    const displayN = idx + 1;

    const orig = q.origN ?? q.n ?? displayN;
    mapOriginalToDisplay[orig] = displayN;

    let opts;
    if (Array.isArray(q.options)) {
      opts = q.options.map(o => ({...o}));
    } else {
      opts = LETTERS.map(L => ({
        id: L,
        text: (q.optionsByLetter?.[L]?.text || "")
      }));
    }

    if (shuffleO){
      const filled = opts.filter(o => (o.text||"").trim() !== "");
      shuffleArray(filled);

      const byLetter = {};

      for (let i=0;i<LETTERS.length;i++){
        const L = LETTERS[i];

        if (filled[i]){
          byLetter[L] = {
            id: filled[i].id,
            text: filled[i].text
          };
        } else {
          byLetter[L] = { id: null, text: "" };
        }
      }

      return {
        n: displayN,
        origN: orig,
        text: q.text,
        subject: q.subject || "Genel",
        optionsByLetter: byLetter
      };

    } else {
      const byLetter = {};
      for (const L of LETTERS){
        const found = opts.find(o => o.id === L) || { id: L, text: "" };
        byLetter[L] = { id: found.id, text: found.text };
      }

      return {
        n: displayN,
        origN: orig,
        text: q.text,
        subject: q.subject || "Genel",
        optionsByLetter: byLetter
      };
    }
  });

  const answerKeyDisplay = {};

  for (const [origNStr, correctId] of Object.entries(parsed.answerKey || {})){
    const origN = Number(origNStr);
    const displayN = mapOriginalToDisplay[origN];
    if (!displayN) continue;

    answerKeyDisplay[displayN] = String(correctId).toUpperCase();
  }

  return {
    title: parsed.title,
    questions,
    answerKey: answerKeyDisplay,
    keyCount: Object.keys(answerKeyDisplay).length,
    mapOriginalToDisplay
  };
}

export function getCorrectDisplayLetter(question, correctOptionId){
  if (!question || !correctOptionId) return null;

  for (const L of LETTERS){
    if (
      (question.optionsByLetter?.[L]?.id || "")
        .toUpperCase() === correctOptionId.toUpperCase()
    ){
      return L;
    }
  }
  return null;
}

export function getChosenOptionId(question, chosenLetter){
  if (!question || !chosenLetter) return null;
  return question.optionsByLetter?.[chosenLetter]?.id || null;
}

export const LETTERS_CONST = LETTERS;
