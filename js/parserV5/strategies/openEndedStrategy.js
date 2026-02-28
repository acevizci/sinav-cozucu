// js/parserV5/strategies/openEndedStrategy.js
// OpenEndedPro strategy with pro-grade diagnostics:
// - confidence (0..1)
// - detectionReason string
// - signals object
//
// Keeps output compatible with the app-level OpenEnded Pro adapter.
// Also keeps base fallback behavior (essay) when no parts.

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function hasSolution(node) {
  return !!(node?.explanation || (Array.isArray(node?._answerFromSolution) && node._answerFromSolution.length));
}

function hasCaseCue(text) {
  const t = String(text || "").toLowerCase();
  return /(olay|vaka|senaryo|case|durum)\b/.test(t);
}

function computeConfidence(node, parts) {
  const partN = parts.length;
  const optN = Array.isArray(node?.options) ? node.options.length : 0;
  const stemLen = (node?.stem || "").length;

  let c = 0.80;

  if (partN >= 1) c += 0.08;
  if (partN >= 2) c += 0.04;
  if (partN >= 4) c += 0.02;

  if (optN === 0) c += 0.04; else c -= 0.25;
  if (stemLen >= 300) c += 0.03;

  if (hasCaseCue(node?.stem || "")) c += 0.03;
  if (hasSolution(node)) c += 0.03;

  // Guard: if stem is extremely short, it might be misclassified
  if (stemLen < 120 && partN <= 1) c -= 0.12;

  return clamp01(c);
}

export const openEndedStrategy = {
  id: "openEndedPro",

  score(node) {
    const partN = Array.isArray(node.parts) ? node.parts.length : 0;
    const optN = Array.isArray(node.options) ? node.options.length : 0;
    if (partN >= 1 && optN === 0) return 93;
    if (partN === 0 && optN === 0 && (node.stem || "").length > 350) return 55;
    return 0;
  },

  parse(node) {
    const parts = (node.parts || [])
      .map(p => ({ id: String(p.id || ""), text: String(p.text || "") }))
      .filter(p => p.text);

    // If parts exist, treat scenario as stem (OLAY) and each part as a subquestion (index 1 for now)
    if (parts.length) {
      const confidence = computeConfidence(node, parts);
      const stemLen = (node?.stem || "").length;

      const detectionReason = [
        `openEndedPro:parts-detected(${parts.length})`,
        `stemLen:${stemLen}`,
        hasCaseCue(node?.stem || "") ? "case-cue" : "no-case-cue",
        hasSolution(node) ? "solution-present" : "no-solution"
      ].join("|");

      const signals = {
        partsCount: parts.length,
        optionCount: Array.isArray(node?.options) ? node.options.length : 0,
        stemLen,
        hasCaseCue: hasCaseCue(node?.stem || ""),
        hasSolution: hasSolution(node),
        solutionAnswers: node?._answerFromSolution || null,
        optionsInferred: !!node?._optionsInferred,
        optionDetectReason: node?._optionDetectReason || null
      };

      return {
        n: node.qn,
        kind: "openEndedPro",
        text: parts[0]?.text || node.stem || "",
        subject: node.subject || "Genel",
        selectCount: 1,
        optionsByLetter: {},

        openEnded: {
          caseText: node.stem || "",
          subQuestion: parts[0] ? { id: parts[0].id || String(node.qn || 1), text: parts[0].text } : null,
          total: parts.length,
          index: 1,
        },

        explanation: node.explanation || null,
        confidence,
        detectionReason,
        signals
      };
    }

    // Fallback to essay with its own diagnostics style
    const len = (node?.stem || "").length;
    const confidence = clamp01(0.68 + (len > 350 ? 0.06 : 0) + (hasSolution(node) ? 0.03 : 0));
    const detectionReason = ["essay-fallback-from-openEnded", `len:${len}`, hasSolution(node) ? "solution-present" : "no-solution"].join("|");
    const signals = { stemLen: len, partsCount: 0, optionCount: 0, hasSolution: hasSolution(node) };

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
