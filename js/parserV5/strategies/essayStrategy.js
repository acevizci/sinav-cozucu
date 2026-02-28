// js/parserV5/strategies/essayStrategy.js
// Essay strategy with pro-grade diagnostics:
// - confidence (0..1)
// - detectionReason string
// - signals object
//
// Keeps output compatible with app-level expectations (n/subject/selectCount/optionsByLetter)

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function hasSolution(node) {
  return !!(node?.explanation || (Array.isArray(node?._answerFromSolution) && node._answerFromSolution.length));
}

function computeConfidence(node) {
  const len = (node?.stem || "").length;
  const optN = Array.isArray(node?.options) ? node.options.length : 0;
  const partN = Array.isArray(node?.parts) ? node.parts.length : 0;

  // Base: essays are inherently fuzzier than MCQ.
  let c = 0.72;

  if (len >= 350) c += 0.06;
  if (len >= 700) c += 0.06;

  if (optN === 0) c += 0.05; else c -= 0.25;
  if (partN === 0) c += 0.04; else c -= 0.12;

  if (hasSolution(node)) c += 0.04;

  // If it's very short, reduce (might be a short stem MCQ missing options)
  if (len < 180) c -= 0.20;

  return clamp01(c);
}

export const essayStrategy = {
  id: "essay",

  score(node) {
    const optN = (node.options || []).length;
    const partN = (node.parts || []).length;
    const len = (node.stem || "").length;
    if (optN === 0 && partN === 0 && len >= 250) return 80;
    // Also catch short essays if solution/explanation exists (common in question banks)
    if (optN === 0 && partN === 0 && len >= 140 && hasSolution(node)) return 65;
    return 0;
  },

  parse(node) {
    const optN = Array.isArray(node?.options) ? node.options.length : 0;
    const partN = Array.isArray(node?.parts) ? node.parts.length : 0;
    const len = (node?.stem || "").length;

    const confidence = computeConfidence(node);

    const detectionReason = [
      "essay",
      `len:${len}`,
      `opt:${optN}`,
      `parts:${partN}`,
      hasSolution(node) ? "solution-present" : "no-solution"
    ].join("|");

    const signals = {
      stemLen: len,
      optionCount: optN,
      partsCount: partN,
      hasSolution: hasSolution(node),
      solutionAnswers: node?._answerFromSolution || null,
      optionsInferred: !!node?._optionsInferred,
      optionDetectReason: node?._optionDetectReason || null
    };

    return {
      n: node.qn,
      kind: "essay",
      text: node.stem || "",
      subject: node.subject || "Genel",
      selectCount: 1,
      optionsByLetter: {},

      explanation: node.explanation || null,
      confidence,
      detectionReason,
      signals
    };
  }
};
