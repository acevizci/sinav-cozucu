// js/parserV5/strategies/trueFalseStrategy.js
// Detects True/False style questions (Doğru/Yanlış, True/False) and emits ACUMEN-compatible shape.
export const trueFalseStrategy = {
  id: "truefalse",
  score(node) {
    const opts = (node?.options || []).map(o => String(o?.text || "").toLowerCase());
    if (opts.length !== 2) return 0;
    const joined = opts.join(" ");
    // Turkish + English lexicon (allow missing diacritics)
    if (/(doğru|dogru|yanlış|yanlis|true|false)/i.test(joined)) return 98;
    return 0;
  },
  parse(node) {
    const opts = Array.isArray(node?.options) ? node.options : [];
    const by = {};
    for (const o of opts) {
      const id = String(o?.id || "").trim().toUpperCase();
      if (!id) continue;
      by[id] = { id, text: String(o?.text || "").trim() };
    }
    const optionCount = Object.keys(by).length;

    // ACUMEN shape: keep kind separate so guardrails/analytics can treat TF differently,
    // but UI can still render like MCQ since it consumes optionsByLetter.
    return {
      kind: "truefalse",
      n: node?.n,
      text: String(node?.stem || "").trim(),
      subject: "Genel",
      selectCount: 1,
      optionsByLetter: by,
      explanation: null,
      confidence: 0.93,
      detectionReason: "truefalse|explicit-options|single-select|no-solution",
      signals: {
        optionsInferred: false,
        optionDetectReason: "explicit-options",
        tfLexicon: true,
        optionCount,
        selectCount: 1,
        solutionAnswers: null
      }
    };
  }
};
