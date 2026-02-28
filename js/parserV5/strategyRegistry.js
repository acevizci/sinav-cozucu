
// js/parserV5/strategyRegistry.js

const _strategies = [];

export function registerStrategy(strategy) {
  if (!strategy || typeof strategy.score !== "function" || typeof strategy.parse !== "function") return;
  _strategies.push(strategy);
}

export function detectAndParse(ast) {
  const out = [];
  for (const node of (ast?.nodes || [])) {
    let best = null;
    let bestScore = -1;

    for (const s of _strategies) {
      let sc = 0;
      try { sc = Number(s.score(node) || 0); } catch { sc = 0; }
      if (sc > bestScore) { bestScore = sc; best = s; }
    }

    let parsed = null;
    if (best) {
      try { parsed = best.parse(node); } catch { parsed = null; }
    }

    // Fallback: plain question object (still renders stem)
    out.push(parsed || {
      n: node.qn,
      text: node.stem,
      subject: "Genel",
      kind: "text"
    });
  }
  return out;
}
