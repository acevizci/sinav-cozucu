// js/template-based-parser.js
// V2.2 - ROBUST GEOMETRY PARSER (rotation/scale safe) + Contract fixes
// - Selection uses true text bounding boxes (viewport ∘ textMatrix)
// - Caches per-page textContent for speed
// - Better option parsing (multiline + inline)
// - Output contract aligns with app/parser: {n, origN, text, subject, optionsByLetter(A-E)}

import { normalizeText } from "./utils.js";

const LETTERS = ["A","B","C","D","E"];

/**
 * 1) Dosyadan okuma (upload senaryosu)
 */
export async function parseWithTemplate(pdfFile, templateFile) {
  const templateText = await templateFile.text();
  const template = JSON.parse(templateText);

  if (typeof pdfjsLib === "undefined") throw new Error("pdf.js yüklenemedi");

  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  return await extractFromPdfDoc(pdfDoc, template.questions);
}

/**
 * 2) Doğrudan hafızadan okuma (Template Studio)
 */
export async function parseDirectly(pdfDoc, questions) {
  return await extractFromPdfDoc(pdfDoc, questions);
}

/* ===================== CORE ===================== */

async function extractFromPdfDoc(pdfDoc, questionsList) {
  // 1) Soruları sayfaya göre grupla (sayfa + textContent cache)
  const byPage = new Map();
  for (const q of questionsList) {
    if (!byPage.has(q.page)) byPage.set(q.page, []);
    byPage.get(q.page).push(q);
  }

  // 2) Çıktı listesi: sıralamayı Q.number’a göre koruyacağız
  const extractedByNumber = new Map();

  // 3) Her sayfayı 1 kez işle
  for (const [pageNo, pageQuestions] of byPage.entries()) {
    const page = await pdfDoc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.0 }); // template normalize: scale 1.0 (top-left)

    const textContent = await page.getTextContent({
      includeMarkedContent: true,
      disableCombineTextItems: false,
    });

    // Sayfadaki tüm item'ların viewport koordinatında bbox'larını önceden hesapla (performans)
    const items = textContent.items
      .map((it) => {
        const bbox = itemToViewportBBox(it, viewport);
        if (!bbox) return null;
        return { it, bbox };
      })
      .filter(Boolean);

    // 4) Her soru için selection rect ile kesişen item'ları al
    for (const q of pageQuestions) {
      const sel = {
        left: q.x,
        top: q.y,
        right: q.x + q.w,
        bottom: q.y + q.h,
      };

      const inBox = [];
      for (const obj of items) {
        if (rectsIntersect(sel, obj.bbox, 2)) {
          inBox.push(obj);
        }
      }

      // 5) Satırlaştır & birleştir
      const fullText = normalizeText(buildReadingOrderText(inBox).trim());

      // 6) Şık + soru ayrıştırma
      const { subject, text: qText } = extractSubjectAndStripPrefix(extractQuestionTextRobust(fullText));
      const options = extractOptionsRobust(fullText);

      extractedByNumber.set(q.number, {
        n: q.number,            // ✅ contract
        origN: q.number,
        text: qText,
        subject,
        optionsByLetter: ensureAE(options),
      });
    }
  }

  // 7) Çıkışı orijinal sıraya sok (questionsList sırası/numarası ile)
  const extractedQuestions = questionsList
    .slice()
    .sort((a, b) => a.number - b.number)
    .map((q) => extractedByNumber.get(q.number) || fallbackQuestion(q.number));

  return {
    title: "Şablon Sınavı",
    questions: extractedQuestions,
    answerKey: {},
    keyCount: 0,
    meta: { format: "template-direct", parserVersion: "2.2-robust-bbox" },
  };
}

function fallbackQuestion(n) {
  return {
    n,
    origN: n,
    text: "...",
    subject: "Genel",
    optionsByLetter: ensureAE({}),
  };
}

function ensureAE(optionsByLetter) {
  const out = {};
  for (const L of LETTERS) {
    const t = (optionsByLetter?.[L]?.text || "").trim();
    out[L] = { id: L, text: t };
  }
  return out;
}

/* ===================== GEOMETRY ===================== */

// Matrix multiply (2D affine): [a b c d e f]
function mulM(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function applyM(m, x, y) {
  return {
    x: m[0] * x + m[2] * y + m[4],
    y: m[1] * x + m[3] * y + m[5],
  };
}

/**
 * PDF.js text item -> viewport (top-left origin) axis-aligned bbox
 * - item.transform: text space -> page space
 * - viewport.transform: page space -> viewport/canvas space
 */
function itemToViewportBBox(item, viewport) {
  if (!item.str || !item.str.trim()) return null;

  const w = Math.abs(item.width || 0);
  const h = Math.abs(item.height || 0);

  // Birleşik transform
  const M = mulM(viewport.transform, item.transform);

  // Item bbox için 4 köşe (text space)
  const p1 = applyM(M, 0, 0);
  const p2 = applyM(M, w || 1, 0);
  const p3 = applyM(M, 0, h || 1);
  const p4 = applyM(M, w || 1, h || 1);

  const xs = [p1.x, p2.x, p3.x, p4.x];
  const ys = [p1.y, p2.y, p3.y, p4.y];

  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) return null;
  return { left, top, right, bottom };
}

function rectsIntersect(r1, r2, pad = 0) {
  return !(
    r2.left > r1.right + pad ||
    r2.right < r1.left - pad ||
    r2.top > r1.bottom + pad ||
    r2.bottom < r1.top - pad
  );
}

/* ===================== TEXT ORDERING ===================== */

function buildReadingOrderText(inBox) {
  if (!inBox.length) return "";

  const tokens = inBox.map(({ it, bbox }) => ({
    str: it.str,
    y: (bbox.top + bbox.bottom) / 2,
    left: bbox.left,
    right: bbox.right,
    top: bbox.top,
    height: Math.max(1, bbox.bottom - bbox.top),
  }));

  // y artan, sonra x artan (top-left)
  tokens.sort((a, b) => (a.y === b.y ? a.left - b.left : a.y - b.y));

  const avgH = tokens.reduce((s, t) => s + t.height, 0) / tokens.length;
  const lineTol = Math.max(6, Math.min(14, avgH * 0.6));

  const lines = [];
  let current = [];
  let lastY = null;

  for (const t of tokens) {
    if (lastY === null || Math.abs(t.y - lastY) <= lineTol) {
      current.push(t);
      lastY = lastY === null ? t.y : (lastY * 0.7 + t.y * 0.3);
    } else {
      lines.push(current);
      current = [t];
      lastY = t.y;
    }
  }
  if (current.length) lines.push(current);

  const out = [];
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left);

    let lineText = "";
    let lastRight = null;

    for (const t of line) {
      if (lastRight !== null && t.left - lastRight > 2) lineText += " ";
      lineText += t.str;
      lastRight = t.right;
    }

    out.push(lineText.trim());
  }

  return out.join("\n");
}

/* ===================== PARSING (ROBUST) ===================== */

function extractOptionsRobust(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const options = {};
  const optionRe = /^([A-E])\s*([\)\.\-:])\s*(.+)$/;

  let lastL = null;

  for (const line of lines) {
    const m = line.match(optionRe);
    if (m) {
      const L = m[1].toUpperCase();
      options[L] = { id: L, text: m[3].trim() };
      lastL = L;
      continue;
    }

    // Çok satırlı şık devamı: önceki şık varsa ekle
    if (lastL && line.length < 160 && !/^\d+\s*[\.\)]/.test(line) && !/^([A-E])\s*[\)\.\-:]/.test(line)) {
      options[lastL].text = (options[lastL].text + " " + line).trim();
    }
  }

  // Inline fallback: "A) ... B) ... C) ..."
  if (Object.keys(options).length < 2) {
    const inline = findInlineOptions(text);
    for (const [L, t] of Object.entries(inline)) {
      options[L] = { id: L, text: t };
    }
  }

  return options;
}

function findInlineOptions(text) {
  const re = /(^|[\n\r\s])([A-E])\s*([\)\.\-:])\s*/g;
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    hits.push({ idx: m.index + m[1].length, L: m[2].toUpperCase() });
  }

  const out = {};
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].idx;
    const end = i + 1 < hits.length ? hits[i + 1].idx : text.length;
    const L = hits[i].L;

    const chunk = text
      .slice(start, end)
      .replace(/^([A-E])\s*[\)\.\-:]\s*/, "")
      .trim();

    if (chunk.length >= 2) out[L] = chunk;
  }
  return out;
}

function extractQuestionTextRobust(text) {
  const lines = text.split("\n").map((l) => l.trim());
  const cutIdx = lines.findIndex((l) => /^([A-E])\s*[\)\.\-:]\s+/.test(l));

  const qPart = (cutIdx === -1 ? lines : lines.slice(0, cutIdx))
    .filter(Boolean)
    .join(" ")
    .trim();

  const cleaned = qPart
    .replace(/^(soru\s*)?\d+\s*[\.\)\-:]\s*/i, "")
    .replace(/^(\(\s*\d+\s*\))\s*/i, "")
    .trim();

  return cleaned || "...";
}

function extractSubjectAndStripPrefix(questionText) {
  let text = String(questionText || "").trim();
  let subject = "Genel";

  const mSub = text.match(/^\[(.*?)\]\s*/);
  if (mSub && mSub[1]) {
    subject = mSub[1].trim() || "Genel";
    text = text.replace(/^\[.*?\]\s*/, "");
  }

  text = text.replace(/^\d+\s*[\.\)]\s*/, "").trim();
  return { subject, text: text || "..." };
}
