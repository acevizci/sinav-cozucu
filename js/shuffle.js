import { shuffleArray } from "./utils.js";

export const LETTERS_CONST = ["A","B","C","D","E","F"];

const LETTERS = LETTERS_CONST;


function getPresentLetters(q){
  return Object.keys(q?.optionsByLetter || {})
    .map(k => String(k).toUpperCase())
    .filter(k => /^[A-F]$/.test(k))
    .sort();
}

function toOptionList(q){
  const present = getPresentLetters(q);
  if (present.length){
    return present.map(L => ({
      id: String(q.optionsByLetter?.[L]?.id ?? L),
      text: String(q.optionsByLetter?.[L]?.text ?? "")
    }));
  }

  if (Array.isArray(q.options) && q.options.length){
    return q.options
      .map((o, idx) => ({
        id: String(o?.id ?? LETTERS[idx] ?? ""),
        text: String(o?.text ?? "")
      }))
      .filter(o => o.id);
  }

  return [];
}

export function applyShuffle(parsed, { shuffleQ=true, shuffleO=true }){
  const srcQuestions = (parsed?.questions || []).map(q => ({...q}));

  if (shuffleQ) shuffleArray(srcQuestions);

  const mapOriginalToDisplay = {};
  const questions = srcQuestions.map((q, idx) => {
    const displayN = idx + 1;

    const orig = q.origN ?? q.n ?? displayN;
    mapOriginalToDisplay[orig] = displayN;

    const opts = toOptionList(q);

    if (shuffleO){
      const filled = opts.filter(o => (o.text || "").trim() !== "");
      shuffleArray(filled);

      // ✅ Dynamic: only as many letters as exist (no padding!)
      const byLetter = {};
      for (let i=0; i<filled.length && i<LETTERS.length; i++){
        const L = LETTERS[i];
        byLetter[L] = { id: filled[i].id, text: filled[i].text };
      }

      return {
        n: displayN,
        origN: orig,
        text: q.text,
        subject: q.subject || "Genel",
        optionsByLetter: byLetter
      };
    }

    // no shuffleO: preserve original letters exactly
    const present = getPresentLetters(q);
    const byLetter = {};
    for (const L of present){
      byLetter[L] = {
        id: String(q.optionsByLetter?.[L]?.id ?? L),
        text: String(q.optionsByLetter?.[L]?.text ?? "")
      };
    }

    return {
      n: displayN,
      origN: orig,
      text: q.text,
      subject: q.subject || "Genel",
      optionsByLetter: byLetter
    };
  });

  const answerKeyDisplay = {};
  for (const [origNStr, correctId] of Object.entries(parsed?.answerKey || {})){
    const origN = Number(origNStr);
    const displayN = mapOriginalToDisplay[origN];
    if (!displayN) continue;
    answerKeyDisplay[displayN] = String(correctId).toUpperCase();
  }

  return {
    title: parsed?.title || "Sınav",
    questions,
    answerKey: answerKeyDisplay,
    keyCount: Object.keys(answerKeyDisplay).length,
    mapOriginalToDisplay
  };
}

export function getCorrectDisplayLetter(question, correctOptionId){
  if (!question || !correctOptionId) return null;
  const target = String(correctOptionId).toUpperCase();

  for (const [L, opt] of Object.entries(question.optionsByLetter || {})){
    if (!/^[A-F]$/.test(L)) continue;
    if (String(opt?.id || "").toUpperCase() === target) return L;
  }
  return null;
}

export function getChosenOptionId(question, chosenLetter){
  if (!question || !chosenLetter) return null;
  return question.optionsByLetter?.[String(chosenLetter).toUpperCase()]?.id || null;
}
