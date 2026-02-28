// js/parserV5/strategies/mcqStrategy.js
// MCQ Strategy (FINAL / Production Safe)
//
// Goals:
// 1) MCQ detection must be conservative (avoid misclassifying open-ended as MCQ)
// 2) Inferred options alone must NOT make a question MCQ
// 3) Multi-select (selectCount>1) must be conservative:
//    - Only if the stem explicitly signals "pick/select N" (TR/EN), or
//    - (Optionally) if the stem has multi-select cues AND solution indicates multiple answers.
// 4) Keep ACUMEN output shape + pro-grade diagnostics.

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function toIntSafe(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function numberFromTurkishWord(w) {
  const s = String(w || "").toLowerCase();
  const map = {
    "iki": 2,
    "üç": 3, "uc": 3,
    "dört": 4, "dort": 4,
    "beş": 5, "bes": 5,
    "altı": 6, "alti": 6
  };
  return map[s] || null;
}

function hasSolutionAnswers(node) {
  return Array.isArray(node?._answerFromSolution) && node._answerFromSolution.length > 0;
}

// Broad MCQ cues (NOT multi-select specific). Used only as supporting evidence.
function hasMcqCue(text) {
  const t = String(text || "").toLowerCase();
  return /(aşağıdakilerden|hangisi|hangileridir|doğru|yanlış|dogru|yanlis|seçiniz|seciniz|seçin|secin|işaretle|isaretle|choose|select|pick|mark)\b/i.test(t);
}

// Strict multi-select cue: requires a number + select/mark verb nearby.
function detectSelectCountFromText(text) {
  const t = String(text || "");

  // (2'yi seçin) (4’u seçiniz) etc.
  let m = t.match(/\(\s*([2-6])\s*(?:['’`´]?(?:u|ü|i|ı)?\s*)?(?:yi|yı|yu|yü|u|ü|i|ı)?\s*(?:seç|sec|işaretle|isaretle|choose|select|pick|mark)\w*/i);
  if (m) return toIntSafe(m[1]);

  // 2'yi seçin / 4'ü işaretleyiniz (not necessarily in parentheses)
  m = t.match(/\b([2-6])\s*(?:['’`´]?(?:u|ü|i|ı))\s*(?:seç|sec|işaretle|isaretle|choose|select|pick|mark)\w*/i);
  if (m) return toIntSafe(m[1]);

  // iki/üç/dört ... seçin
  m = t.match(/\b(iki|üç|uc|dört|dort|beş|bes|altı|alti)\b[^\n]{0,40}\b(seç|sec|işaretle|isaretle)\w*/i);
  if (m) return numberFromTurkishWord(m[1]);

  // EN: choose/select/pick/mark any 2
  m = t.match(/\b(?:choose|select|pick|mark)\s+(?:any\s+)?([2-6])\b/i);
  if (m) return toIntSafe(m[1]);

  // EN words: choose two/three/four...
  m = t.match(/\b(?:choose|select|pick|mark)\s+(?:any\s+)?(two|three|four|five|six)\b/i);
  if (m) {
    const w = m[1].toLowerCase();
    const map = { two: 2, three: 3, four: 4, five: 5, six: 6 };
    return map[w] || null;
  }

  return 1;
}

// Conservative selectCount:
// - Default: 1
// - If stem explicitly says pick N -> N
// - Only then (and only then), allow solution multi-answers to raise it if needed.
function detectSelectCount(node) {
  const stem = String(node?.stem || "");
  const fromText = detectSelectCountFromText(stem);

  // If text explicitly signals multi-select, trust/merge with solution count.
  if (fromText > 1) {
    const fromSolution = Array.isArray(node?._answerFromSolution) ? node._answerFromSolution.length : 0;
    return Math.max(fromText || 1, fromSolution || 1);
  }

  // Otherwise: stay single-select (do NOT upgrade based on solution alone).
  return 1;
}

function computeConfidence(node, selectCount, optionsByLetter) {
  const optCount = Object.keys(optionsByLetter || {}).length;
  const inferred = !!node?._optionsInferred;
  const hasSolution = hasSolutionAnswers(node);
  const cue = hasMcqCue(node?.stem || "");

  // Base confidence: explicit > inferred
  let c = inferred ? 0.78 : 0.90;

  if (optCount >= 4 && optCount <= 6) c += 0.06;
  else if (optCount >= 2) c += 0.02;
  else c -= 0.25;

  if (selectCount > 1) c += 0.02;
  if (hasSolution) c += 0.05;

  // Sanity: answer list longer than option set
  if (hasSolution && node._answerFromSolution.length > optCount) c -= 0.20;

  // Inferred options regain a little confidence if we have cue or solution
  if (inferred && (cue || hasSolution)) c += 0.03;

  return clamp01(c);
}

export const mcqStrategy = {
  id: "mcq",

  // Production-safe scoring:
  // - Inferred options require strong evidence (cue OR solution).
  // - Without explicit options AND without solution => not MCQ.
  score(node) {
    const optCount = node?.options?.length || 0;
    const inferred = !!node?._optionsInferred;
    const hasSolution = hasSolutionAnswers(node);
    const cue = hasMcqCue(node?.stem || "");

    const hasExplicitOptions = !inferred && optCount >= 2;

    // If inferred options, require strong evidence.
    if (inferred && !cue && !hasSolution) return 0;

    // If no explicit options and no solution, it's not MCQ.
    if (!hasExplicitOptions && !hasSolution) return 0;

    // Normal MCQ ranges
    if (optCount >= 4 && optCount <= 6) return 100;
    if (optCount >= 2 && optCount <= 8) return 60;

    // Some banks have 2-3 options (rare). Only score if we have explicit options or solution.
    if ((hasExplicitOptions || hasSolution) && optCount >= 2) return 55;

    return 0;
  },

  parse(node) {
    const optionsByLetter = {};
    for (const opt of node.options || []) {
      if (!opt?.id || !opt?.text) continue;
      const id = String(opt.id || "").trim().toUpperCase();
      if (!id) continue;
      optionsByLetter[id] = { id, text: String(opt.text || "").trim() };
    }

    const selectCount = detectSelectCount(node);
    const confidence = computeConfidence(node, selectCount, optionsByLetter);

    const inferred = !!node?._optionsInferred;
    const hasSolution = hasSolutionAnswers(node);
    const cue = hasMcqCue(node?.stem || "");

    const detectionReason = [
      node?._optionDetectReason || (inferred ? "inferred-options" : "explicit-options"),
      selectCount > 1 ? `multi-select(${selectCount})` : "single-select",
      hasSolution ? "solution-present" : "no-solution",
      cue ? "cue-present" : "no-cue",
      inferred ? "guard:inferred" : "guard:explicit"
    ].join("|");

    const signals = {
      optionsInferred: inferred,
      optionDetectReason: node?._optionDetectReason || null,
      solutionAnswers: node?._answerFromSolution || null,
      optionCount: Object.keys(optionsByLetter).length,
      selectCount,
      cuePresent: cue,
      // Helpful debug: whether selectCount came from text
      selectCountFromText: detectSelectCountFromText(node?.stem || "")
    };

    return {
      n: node.qn,
      kind: "mcq",
      text: node.stem || "Soru metni bulunamadı",
      subject: node.subject || "Genel",
      selectCount,
      optionsByLetter,
      explanation: node.explanation || null,
      _answerFromSolution: node._answerFromSolution || null,
      confidence,
      detectionReason,
      signals
    };
  }
};