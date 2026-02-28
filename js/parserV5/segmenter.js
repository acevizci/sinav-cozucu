// js/parserV5/segmenter.js
// Groups tokens into QuestionBlocks beginning with QNUM.
// PRO version: filters fake QNUM like "2. Aşama"

function isRealQuestionHeader(tok, nextTok) {
  if (!tok || tok.type !== "QNUM") return false;

  const raw = String(tok.raw || "");

  // 🔥 Bölüm referansları: "4.6.1", "5.12.1", "3.24" gibi sayı.sayı formatları
  if (/^\s*\d+\.\d+/.test(raw)) {
    return false;
  }

  // numaradan sonraki metni al
  const after = raw.replace(/^\s*\d{1,3}\s*[).]\s*/, "").trim();

  // 🔥 Sahte başlık: numaradan hemen sonra gelen İLK KELİME aşama/adım vb. ise
  const firstWord = after.split(/\s+/)[0].replace(/[.,;:]/g, "");
  if (/^(aşama|adım|faz|bölüm|seviye|madde|kısım|section|step|phase)$/i.test(firstWord)) {
    return false;
  }

  return true;
}

export function segment(tokens) {
  const blocks = [];
  let cur = null;

  function push() {
    if (cur && cur.tokens && cur.tokens.length) {
      if (cur.type === "QuestionBlock") blocks.push(cur);
    }
    cur = null;
  }

  for (let i = 0; i < (tokens || []).length; i++) {
    const tok = tokens[i];
    const nextTok = tokens[i + 1];

    if (!tok) continue;

    if (tok.type === "QNUM") {

      if (!isRealQuestionHeader(tok, nextTok)) {
        // 🔥 Sahte QNUM ise paragraf gibi davran
        if (!cur) cur = { type: "LooseBlock", tokens: [] };
        cur.tokens.push({ ...tok, type: "PARA" });
        continue;
      }

      push();
      cur = { type: "QuestionBlock", tokens: [tok] };
      continue;
    }

    if (!cur) {
      cur = { type: "LooseBlock", tokens: [] };
    }

    cur.tokens.push(tok);
  }

  push();
  return blocks;
}