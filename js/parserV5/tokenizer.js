// js/parserV5/tokenizer.js
// HOTFIX: NBSP-safe tokenization for DOCX exports
// - Converts \u00A0 (non-breaking space) to normal space per-line BEFORE regex checks
// - Keeps option markers with/without space: A)Metin, A.Metin, A. Metin
// - Keeps SOLUTION blocks + inline options
// - Keeps normalizeRawText alias

export function normalize(raw) {
  return String(raw || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
export const normalizeRawText = normalize;

const RE_QNUM = /^\s*(?:\d{1,3}\)\s+|\d{1,3}\.(?!\d)\s+)/;
const RE_OPTION_LINE = /^\s*([A-H])\s*[\)\.\:\-]\s*(?=\S)/i;
const RE_NUM_ITEM = /^\s*\(?\d{1,2}\)?\s*[\)\.\:\-]\s*(?=\S)/;
const RE_SOLUTION_HEADER = /^\s*(çözüm|cozum|cevap|yanıt|yanit|açıklama|aciklama|feedback|geri\s*bildirim)\b\s*:?\s*/i;

function splitInlineOptions(line) {
  const pattern = /([A-H])\s*[\)\.\:\-]\s*/g;
  const matches = [...String(line).matchAll(pattern)];
  if (matches.length < 2) return null;

  const parts = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : line.length;
    parts.push(line.slice(start, end).trim());
  }
  return parts;
}

export function tokenize(text) {
  const lines = String(text || "").split("\n");
  const tokens = [];

  let currentOption = null;
  let inSolution = false;

  function flushOption() {
    if (currentOption) {
      tokens.push({ type: "OPTION", raw: currentOption.trim() });
      currentOption = null;
    }
  }
  function push(type, raw) { tokens.push({ type, raw }); }

  for (let rawLine of lines) {
    // ✅ Normalize NBSP per-line before any trim/regex logic.
    const safeLine = String(rawLine ?? "").replace(/\u00A0/g, " ");
    const t = safeLine.trim();

    if (!t) {
      flushOption();
      push("EMPTY", rawLine);
      continue;
    }

    if (RE_QNUM.test(t)) {
      flushOption();
      inSolution = false;
      push("QNUM", t);
      continue;
    }

    if (RE_SOLUTION_HEADER.test(t)) {
      flushOption();
      inSolution = true;
      push("SOLUTION", t);
      continue;
    }

    if (inSolution) {
      push("SOLUTION", t);
      continue;
    }

    const inline = splitInlineOptions(t);
    if (inline) {
      flushOption();
      for (const opt of inline) push("OPTION", opt);
      continue;
    }

    if (RE_OPTION_LINE.test(t)) {
      flushOption();
      currentOption = t;
      continue;
    }

    if (currentOption) {
      if (RE_OPTION_LINE.test(t) || RE_NUM_ITEM.test(t) || RE_SOLUTION_HEADER.test(t)) {
        flushOption();
        // fall-through
      } else {
        currentOption += " " + t;
        continue;
      }
    }

    if (RE_NUM_ITEM.test(t)) {
      flushOption();
      push("NUM_ITEM", t);
      continue;
    }

    push("PARA", t);
  }

  flushOption();
  return tokens;
}
