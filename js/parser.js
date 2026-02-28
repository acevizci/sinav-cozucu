// js/parser.js
// ACUMEN V5 Parser Entry (Structure-Driven Core)
// - Lesson-agnostic tokenizer/AST + strategy plugins (parserV5)
// - Keeps answer-key tail extraction for DOCX/PDF dumps (never overwrites per-question solution)
//
// Exports: parseExam, parseFromFile, readFileAsText

import { normalizeText } from "./utils.js";
import { FileLoader, normalizeTextToLines } from "./parser/text_pipeline.js"; // reuse stable file loading + line normalization
import { parseRawToQuestions } from "./parserV5/index.js";

const ENGINE_VERSION = "v5-structure-driven+answerkey-tail";


function _inferSelectCountFromText(text) {
  const lower = String(text || "").toLowerCase();

  // Turkish: "(3'ü seçin)", "3'ü seçiniz", "3 adet/tane seç"
  let m = lower.match(/\(\s*(\d{1,2})\s*['’]?(?:u|ü)?\s*(?:seç(?:in|iniz)?|sec(?:in|iniz)?)\s*\)/i);
  if (!m) m = lower.match(/(?:^|\b)(\d{1,2})\s*['’]?(?:u|ü)?\s*(?:seç(?:in|iniz)?|seçiniz)\b/i);
  if (!m) m = lower.match(/(?:^|\b)(\d{1,2})\s*(?:tane|adet)\s*seç\b/i);

  // English: "Select 3", "(Choose 3)"
  if (!m) m = lower.match(/\bselect\s*(\d{1,2})\b/i);
  if (!m) m = lower.match(/\bchoose\s*(\d{1,2})\b/i);

  if (!m) return null;
  const n = Number(m[1] || m[2]);
  if (!Number.isFinite(n)) return null;
  if (n < 2 || n > 8) return null;
  return n;
}

function _postprocessQuestions(questions) {
  if (!Array.isArray(questions)) return questions;

  for (const q of questions) {
    if (!q || typeof q !== "object") continue;

    const optCount = q.optionsByLetter ? Object.keys(q.optionsByLetter).length : 0;
    const inferred = _inferSelectCountFromText(q.text);

    // Reconcile selectCount using stem hints when plausible.
    if (q.kind === "mcq" && inferred && optCount >= inferred) {
      q.selectCount = inferred;

      if (q.meta) {
        q.meta.signals = q.meta.signals || {};
        q.meta.signals.selectCount = inferred;
      }
      if (q.signals) q.signals.selectCount = inferred;
    }

    // If solution answers exist but conflict with inferred/selectCount => needsReview
    const sol = (q.meta && Array.isArray(q.meta.solutionAnswers)) ? q.meta.solutionAnswers : null;
    if (q.kind === "mcq" && sol && sol.length) {
      const target = inferred || q.selectCount || 1;
      if (target > 1 && sol.length !== target) {
        q.meta = q.meta || {};
        q.meta.needsReview = true;
        q.meta.reviewReasons = q.meta.reviewReasons || [];
        if (!q.meta.reviewReasons.includes("solution-selectcount-mismatch")) {
          q.meta.reviewReasons.push("solution-selectcount-mismatch");
        }
      }
    }
  }

  return questions;
}



const ANSWER_KEY_MARK_RE = /(CEVAP\s*ANAHTARI|YANIT\s*ANAHTARI|ANSWER\s*KEY)/i;
// 1-C, 1)C, 1. C, 1C, C, ACEF
const ANSWER_SEG_RE = /^(?:(\d+)\s*(?:[\.)\-:]?\s*)?)?([A-H])\b/i;

function _parseAnswerKeyFromTail(lines, { maxQ = 9999 } = {}) {
  try {
    // find marker near end
    let mark = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = String(lines[i] || "").trim();
      if (t && ANSWER_KEY_MARK_RE.test(t)) { mark = i; break; }
    }
    if (mark < 0) return {};

    const tail = lines.slice(mark + 1).join("\n");
    const out = {};

    // Pattern 1: per line "12 C"
    const tl = tail.split(/\r?\n/);
    for (const ln of tl) {
      const m = String(ln || "").trim().match(ANSWER_SEG_RE);
      if (!m) continue;
      const n = m[1] ? parseInt(m[1], 10) : null;
      const letter = String(m[2] || "").toUpperCase();
      if (!letter) continue;

      if (n != null && n > 0 && n <= maxQ) {
        if (!out[n]) out[n] = letter;
      }
    }

    // Pattern 2: compact string like "ABCD..." (map sequentially)
    const compact = tail.replace(/[^A-H]/gi, "").toUpperCase();
    if (compact.length >= 5) {
      for (let i = 0; i < compact.length && (i + 1) <= maxQ; i++) {
        const n = i + 1;
        if (!out[n]) out[n] = compact[i];
      }
    }

    return out;
  } catch {
    return {};
  }
}

export function parseExam(text, { debug = false } = {}) {
  // Keep existing normalizeText to be consistent with app's expectations
  const raw = normalizeText(text || "");
  const lines = normalizeTextToLines(raw);

  // If there's an answer key marker near the end, crop the question section.
  let questionLines = lines;
  let answerKeyMarkIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = String(lines[i] || "").trim();
    if (t && ANSWER_KEY_MARK_RE.test(t)) { answerKeyMarkIdx = i; break; }
  }
  if (answerKeyMarkIdx >= 0 && answerKeyMarkIdx > Math.floor(lines.length * 0.4) && (lines.length - answerKeyMarkIdx) < 400) {
    questionLines = lines.slice(0, answerKeyMarkIdx);
  }

  const questionText = questionLines.join("\n");
  let questions = parseRawToQuestions(questionText, { debug });
  questions = _postprocessQuestions(questions);

  // answerKey: merge per-question solution-derived keys (if any) + tail key (fill only)
  const answerKey = {};
  for (const q of questions) {
    // In V5 core we don't parse solution yet; keep hook for future
    if (q && q._answerFromSolution) {
      answerKey[q.n] = q._answerFromSolution;
      delete q._answerFromSolution;
    }
  }

  const tailKey = _parseAnswerKeyFromTail(lines, { maxQ: questions.length || 9999 });
  for (const [nStr, v] of Object.entries(tailKey)) {
    const n = parseInt(nStr, 10);
    if (!answerKey[n]) answerKey[n] = v;
  }

  const result = {
    title: "Sınav",
    questions,
    answerKey,
    keyCount: Object.keys(answerKey).length,
    meta: { engine: ENGINE_VERSION, lines: lines.length },
  };

  try { window.__lastParseResult = result; } catch {}
  if (debug) { try { console.log("[ParserV5] result", result); } catch {} }

  return result;
}

// ---- DOCX SAFE READER (tables/textboxes/header/footer) ----
// Uses global JSZip (already loaded in index.html). Falls back to FileLoader if unavailable.
async function readDocxAllText(file) {
  const JSZipLib = (typeof JSZip !== "undefined") ? JSZip : (window && window.JSZip);
  if (!JSZipLib) {
    try { console.warn("[DOCX] JSZip not found; falling back to default loader."); } catch {}
    return await FileLoader.readAsText(file);
  }

  const buf = await file.arrayBuffer();
  const zip = await JSZipLib.loadAsync(buf);

  // Collect likely WordprocessingML parts
  const paths = Object.keys(zip.files).filter(p =>
    p.startsWith("word/") && p.endsWith(".xml")
  );

  let full = "";
  for (const p of paths) {
    const xml = await zip.file(p).async("string");
    full += "\n" + extractTextFromWordXml(xml);
  }

  // Keep line breaks; normalizeText will also clean NBSP etc.
  return normalizeText(full);
}

function extractTextFromWordXml(xml) {
  // Prefer DOM parsing to avoid leaking Word XML markup into text output.
  // Keeps paragraph boundaries so parserV5 can segment questions/options reliably.
  try {
    const dom = new DOMParser().parseFromString(String(xml || ""), "application/xml");
    const paras = Array.from(dom.getElementsByTagName("w:p"));
    const lines = [];

    if (paras.length) {
      for (const p of paras) {
        let line = "";
        // Walk nodes in-order and reconstruct paragraph text, honoring tabs/line breaks.
        const walker = dom.createTreeWalker(p, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          if (node.nodeType === 3) { // TEXT_NODE
            line += node.nodeValue || "";
          } else if (node.nodeType === 1) { // ELEMENT_NODE
            const tag = (node.tagName || "").toLowerCase();
            if (tag === "w:tab") line += "\t";
            if (tag === "w:br") line += "\n";
          }
          node = walker.nextNode();
        }
        line = String(line || "").replace(/\u00A0/g, " ").trim();
        if (line) lines.push(line);
      }
      return lines.join("\n");
    }

    // Fallback: no paragraph blocks; join all w:t nodes
    const tNodes = Array.from(dom.getElementsByTagName("w:t"));
    if (tNodes.length) {
      return tNodes.map(n => (n.textContent || "")).join(" ").replace(/\u00A0/g, " ").trim();
    }
  } catch (e) {
    try { console.warn("[DOCX] DOM parse failed, falling back to regex extractor.", e); } catch {}
  }

  // Regex fallback (best-effort): preserve paragraph boundaries
  const PAR_RE = /<w:p[\s>][\s\S]*?<\/w:p>/g;
  const T_RE = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
  const TAB_RE = /<w:tab\/>/g;
  const BR_RE  = /<w:br\/>/g;

  const decodeXml = (s) => String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");

  const pullText = (chunk) => {
    let c = String(chunk || "")
      .replace(TAB_RE, "\t")
      .replace(BR_RE, "\n");
    let out = "";
    let m;
    T_RE.lastIndex = 0;
    while ((m = T_RE.exec(c)) !== null) out += decodeXml(m[1]);
    return out;
  };

  const paras = String(xml || "").match(PAR_RE) || [];
  if (paras.length) {
    const lines = [];
    for (const p of paras) {
      const s = pullText(p).replace(/\u00A0/g, " ").trim();
      if (s) lines.push(s);
    }
    return lines.join("\n");
  }

  return pullText(xml).replace(/\u00A0/g, " ").trim();
}

export async function readFileAsText(file) {
  const name = String(file && file.name || "").toLowerCase();
  if (name.endsWith('.docx')) {
    return await readDocxAllText(file);
  }
  return await FileLoader.readAsText(file);
}
export async function parseFromFile(file, { debug = false } = {}) {
  const text = await readFileAsText(file);
  return parseExam(text, { debug });
}
