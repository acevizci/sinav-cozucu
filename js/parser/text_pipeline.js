// layered_text_pipeline.js
// Deterministic text -> lines pipeline (DOCX/PDF/TXT)

import { normalizeText } from "../utils.js";
import { appError } from "../ui/uiAlert.js";


const RX = {
  docHyphenation: /([A-Za-zÀ-ÖØ-öø-ÿĞğİıŞşÇçÖöÜü])-\n([A-Za-zÀ-ÖØ-öø-ÿĞğİıŞşÇçÖöÜü])/g,
};

function spacedWord(word) {
  return word
    .split("")
    .map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
}

export const SOLUTION_WORD_RE = new RegExp(spacedWord("çözüm"), "i");
export const SOLUTION_ANY_RE = new RegExp(
  [
    spacedWord("çözüm"),
    spacedWord("cozum"),
    spacedWord("cevap"),
    spacedWord("solution"),
    spacedWord("answer"),
  ].join("|"),
  "i"
);

export function cleanLine(s) {
  return (s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function splitLines(text) {
  return normalizeText(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map(cleanLine);
}


function normalizeInlineOptionLabels(s) {
  // Ensure there is a space after option labels anywhere: "A)Metin" -> "A) Metin"
  // Also normalize "A." / "A:" / "A-" to "A)" when it looks like an option label.
  return (s || "")
    .replace(/\b([A-F])\s*[\.\:\-]\s*(?=\S)/g, "$1) ")
    .replace(/\b([A-F])\)\s*(?=\S)/g, "$1) ");
}

function explodeInlineOptions(line) {
  // Turn: "... ? A) ... B) ... C) ..." into multiple lines.
  const l0 = cleanLine(normalizeInlineOptionLabels(line));
  if (!l0) return [];
  // Count option labels on same line
  // Allow "A )" variants coming from DOCX runs (space between letter and ')')
  const hits = (l0.match(/\b[A-F]\s*\)\s+/g) || []).length;
  if (hits < 2) return [l0];

  const firstIdx = l0.search(/\b[A-F]\s*\)\s+/);
  if (firstIdx <= 0) return [l0];

  const before = cleanLine(l0.slice(0, firstIdx));
  const tail = cleanLine(l0.slice(firstIdx));

  // Split tail into "A) ...", "B) ...", ...
  const parts = tail
    .split(/\b(?=[A-F]\s*\)\s+)/)
    .map((s) => cleanLine(s))
    .filter(Boolean);

  // Only accept if we really got multiple parts
  if (parts.length < 2) return [l0];

  const out = [];
  if (before) out.push(before);
  for (const p of parts) out.push(p);
  return out;
}

function normalizeInlineSolutionToNewLine(line) {
  // if "... Çözüm: B ..." in same line, split into two lines
  const l = cleanLine(line);
  if (!l) return [];
  const m = l.match(SOLUTION_ANY_RE);
  if (!m) return [l];

  const idx = l.toLowerCase().indexOf(m[0].toLowerCase());
  if (idx <= 0) return [l];

  const before = cleanLine(l.slice(0, idx));
  const after = cleanLine(l.slice(idx));
  if (!before || before.length < 2) return [l];
  return [before, after];
}

function mergeBrokenLines(lines) {
  // DOCX sometimes yields:
  // A
  // option text
  // or bullet only, etc.
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = cleanLine(lines[i]);
    if (!cur) continue;

    const next = i + 1 < lines.length ? cleanLine(lines[i + 1]) : "";

    // single letter line
    if (/^[A-F]$/i.test(cur) && next) {
      out.push(`${cur}) ${next}`);
      i++;
      continue;
    }

    // bullet-only line
    if (/^(?:[-•\u2022–—])$/.test(cur) && next) {
      out.push(`${cur} ${next}`);
      i++;
      continue;
    }

    out.push(cur);
  }
  return out;
}

export function normalizeTextToLines(rawText) {
  let s = String(rawText || "");
  s = s.replace(/\u00A0/g, " ").replace(/[\u200B-\u200D\uFEFF]/g, "");
  s = s.replace(RX.docHyphenation, "$1$2");
  s = s.replace(/[ \t]+/g, " ");

  // Normalize option labels globally (inline / no-space variants)
  s = normalizeInlineOptionLabels(s);

  // "A)Metin" => "A) Metin"  (🔥 A-F)
  s = s.replace(/(^|\n)\s*([A-F])\)\s*(\S)/g, "$1$2) $3");

  // "12 . " -> "12."
  s = s.replace(/(^|\n)\s*(\d{1,4})\s*([.)])\s+/g, "$1$2$3 ");

  const base = splitLines(s).filter(Boolean);

  // explode inline options first (DOCX often puts A) B) C) on same line)
  const exploded = [];
  for (const ln of base) {
    const optParts = explodeInlineOptions(ln);
    for (const op of optParts) {
      const solParts = normalizeInlineSolutionToNewLine(op);
      for (const sp of solParts) if (sp) exploded.push(sp);
    }
  }

  // merge broken A\ntext, bullet\ntext patterns
  return mergeBrokenLines(exploded).filter(Boolean);
}


// ---------------- FileLoader ----------------

export const FileLoader = {
  async readAsText(file) {
    const name = (file?.name || "").toLowerCase();
    if (name.endsWith(".txt")) return await file.text();
    if (name.endsWith(".docx")) return await this._readDocx(file);
    if (name.endsWith(".pdf")) return await this._readPdf(file);
    throw appError("ERR_DESTEKLENMEYEN_FORMAT_SADECE_TXT_DOC");
  },

  async _readDocx(file) {
    if (typeof mammoth === "undefined") throw appError("ERR_MAMMOTH_JS_KUTUPHANESI_EKSIK");
    const buf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    const html = result.value || "";
    const doc = new DOMParser().parseFromString(html, "text/html");

    // deterministic-ish line extraction: treat p/li/td/th as line breaks
    const parts = [];
    const walk = (node) => {
      if (!node) return;

      // Text node
      if (node.nodeType === 3) {
        parts.push(node.textContent || "");
        return;
      }

      const tag = (node.nodeName || "").toLowerCase();

      // Hard line breaks
      if (tag === "br" || tag === "tr") {
        parts.push("\n");
        return;
      }

      // Treat block-ish containers as line boundaries, but DO NOT also dump textContent here
      // (otherwise we duplicate content because child text nodes are walked too).
      if (["p", "li", "h1", "h2", "h3", "td", "th"].includes(tag)) {
        parts.push("\n");
        node.childNodes && node.childNodes.forEach(walk);
        parts.push("\n");
        return;
      }

      // Default: just walk children
      node.childNodes && node.childNodes.forEach(walk);
    };
    walk(doc.body);

    return parts.join("").replace(/\n{3,}/g, "\n\n");
  },

  async _readPdf(file) {
    if (typeof pdfjsLib === "undefined") throw appError("ERR_PDF_JS_KUTUPHANESI_EKSIK");
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    }

    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    const parts = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const items = (content.items || [])
        .map((it) => ({
          str: (it.str || "").trim(),
          y: (it.transform && it.transform[5]) || 0,
          x: (it.transform && it.transform[4]) || 0,
        }))
        .filter((it) => it.str);

      items.sort((a, b) => b.y - a.y || a.x - b.x);

      let lastY = null;
      let line = [];
      const flush = () => {
        const s = line.join(" ").replace(/\s+/g, " ").trim();
        if (s) parts.push(s);
        line = [];
      };

      for (const it of items) {
        if (lastY !== null && Math.abs(it.y - lastY) > 4.5) flush();
        line.push(it.str);
        lastY = it.y;
      }
      flush();
      parts.push("");
    }

    return parts.join("\n").trim();
  },
};