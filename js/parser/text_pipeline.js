// layered_text_pipeline.js
// Deterministic text -> lines pipeline (DOCX/PDF/TXT)

import { normalizeText } from "../utils.js";


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

  // "A)Metin" => "A) Metin"  (🔥 A-F)
  s = s.replace(/(^|\n)\s*([A-F])\)\s*(\S)/g, "$1$2) $3");

  // "12 . " -> "12."
  s = s.replace(/(^|\n)\s*(\d{1,4})\s*([.)])\s+/g, "$1$2$3 ");

  const base = splitLines(s).filter(Boolean);

  // split inline solution markers
  const exploded = [];
  for (const ln of base) {
    const parts = normalizeInlineSolutionToNewLine(ln);
    for (const p of parts) if (p) exploded.push(p);
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
    throw new Error("Desteklenmeyen format. Sadece .txt, .docx, .pdf");
  },

  async _readDocx(file) {
    if (typeof mammoth === "undefined") throw new Error("mammoth.js kütüphanesi eksik.");
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
    if (typeof pdfjsLib === "undefined") throw new Error("pdf.js kütüphanesi eksik.");
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
