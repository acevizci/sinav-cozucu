export const normalizeText = (t) => String(t ?? "")
  .replace(/\r\n/g,"\n")
  .replace(/\r/g,"\n")
  .replace(/\u00A0/g," ")
  .replace(/[ \t]+\n/g,"\n")
  .replace(/\n{3,}/g,"\n\n")
  .trim();

export function splitStemAndOptions(fullText){
  const raw = normalizeText(fullText || "");
  if (!raw) return { stem: "", options: {} };

  const prepared = raw
    .replace(/\s+([A-Ea-e])\s*[\)\.\:\-]\s+/g, "\n$1) ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const optRe = /(^|\n)\s*([A-Ea-e])\s*[\)\.\:\-]\s*/g;
  const hits = [];
  let m;
  while ((m = optRe.exec(prepared)) !== null) {
    hits.push({
      idx: m.index + (m[1] ? m[1].length : 0),
      letter: m[2].toUpperCase(),
      matchLen: m[0].length - (m[1] ? m[1].length : 0)
    });
  }
  if (hits.length < 2) return { stem: prepared.trim(), options: {} };

  const stem = prepared.slice(0, hits[0].idx).trim();
  const options = {};
  for (let i = 0; i < hits.length; i++) {
    const cur = hits[i];
    const next = hits[i+1];
    const start = cur.idx + cur.matchLen;
    const end = next ? next.idx : prepared.length;
    const val = prepared.slice(start, end).trim();
    if (val) options[cur.letter] = val;
  }
  return { stem, options };
}

export function optionsByLetterFromMap(opt){
  const letters = ["A","B","C","D","E"];
  const out = {};
  for (const L of letters){
    out[L] = { id: L, text: String(opt?.[L] || "").trim() };
  }
  return out;
}
