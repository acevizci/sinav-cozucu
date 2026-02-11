// layered_parser.js
// Entry points: parseExam, parseFromFile, readFileAsText
//
// ✅ PATCH: Supports Word/PDF exams that keep "CEVAP ANAHTARI" at the end.
// - Preserves existing per-question "Çözüm" parsing (no behavior change).
// - Only fills missing keys from the answer-key section (never overwrites).

import { normalizeText } from "./utils.js";
import { FileLoader, normalizeTextToLines } from "./parser/text_pipeline.js";
import { buildQuestionBlocks } from "./parser/blocker.js";
import { parseBlockToQuestion } from "./parser/qa_parser.js";

const ENGINE_VERSION = "v15.2-layered-stable+answerkey-tail";

const ANSWER_KEY_MARK_RE = /(CEVAP\s*ANAHTARI|YANIT\s*ANAHTARI|ANSWER\s*KEY)/i;
// 1-C, 1)C, 1. C, 1C, C, ACEF hepsini yakala
const ANSWER_SEG_RE = /^(?:(\d+)\s*(?:[\.)\-:]?\s*)?)?([A-F]{1,6})$/i;


function _parseAnswerKeyFromTail(lines, { maxQ = 9999 } = {}) {
  // Find the last "CEVAP ANAHTARI" marker (in case it appears earlier too)
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = String(lines[i] || "").trim();
    if (t && ANSWER_KEY_MARK_RE.test(t)) { start = i + 1; break; }
  }
  if (start < 0) return {};

  const key = {};
  let nextN = 1;

  for (let i = start; i < lines.length; i++) {
    const raw = String(lines[i] || "").trim();
    if (!raw) continue;

   
    // If a line looks nothing like key data, stop (prevents false positives).
    if (!/[A-F]/i.test(raw) || raw.length > 400) break;

    const parts = raw
      .replace(/\u00A0/g, " ")
      .split(/\s*\|\s*|\s*[,;•·]\s*|\s+/)
      .map(s => String(s).trim())
      .filter(Boolean);

    // If it doesn't contain any plausible segment, stop.
    if (parts.length === 0) continue;

    for (const seg of parts) {
      const m = seg.match(ANSWER_SEG_RE);
      if (!m) continue;

      const nRaw = m[1];
      const letters = String(m[2] || "").toUpperCase();

      if (!letters) continue;

      if (nRaw) {
        const n = parseInt(nRaw, 10);
        if (!Number.isFinite(n) || n < 1 || n > maxQ) continue;
        key[n] = letters;
        if (n >= nextN) nextN = n + 1;
      } else {
        // Unnumbered segment => use sequential numbering
        if (nextN < 1 || nextN > maxQ) continue;
        key[nextN] = letters;
        nextN += 1;
      }
    }
  }

  return key;
}

export function parseExam(text, { debug = false } = {}) {
  const raw = normalizeText(text || "");
  const lines = normalizeTextToLines(raw);

  let questionLines = lines;
  let answerKeyMarkIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = String(lines[i] || "").trim();
    if (t && ANSWER_KEY_MARK_RE.test(t)) { answerKeyMarkIdx = i; break; }
  }
  // Heuristik: marker dokümanın sonlarına yakınsa kırp
  if (answerKeyMarkIdx >= 0 && answerKeyMarkIdx > Math.floor(lines.length * 0.4) && (lines.length - answerKeyMarkIdx) < 400) {
    questionLines = lines.slice(0, answerKeyMarkIdx);
  }


  const blocks = buildQuestionBlocks(questionLines);

  const answerKey = {};
  const questions = [];

  for (const blk of blocks) {
    const q = parseBlockToQuestion(blk);
    if (!q) continue;

    if (q._answerFromSolution) answerKey[q.n] = q._answerFromSolution;
    delete q._answerFromSolution;

    questions.push(q);
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
    meta: { engine: ENGINE_VERSION, blocks: blocks.length, lines: lines.length },
  };

  // Keep debug hook (but avoid noisy logs in production)
  window.__lastParseResult = result;
  if (debug) console.log("PARSE RESULT:", result);

  if (debug) {
    result.__debug = {
      engine: ENGINE_VERSION,
      textLen: raw.length,
      lines: lines.length,
      blocks: blocks.length,
      tailKeyCount: Object.keys(tailKey).length,
    };
  }

  return result;
}

export async function readFileAsText(file) {
  return await FileLoader.readAsText(file);
}

export async function parseFromFile(file, { debug = false } = {}) {
  const text = await readFileAsText(file);
  return parseExam(text, { debug });
}
