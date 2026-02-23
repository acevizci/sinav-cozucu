// js/openEndedPro/openEndedProAdapter.js
// Parser'a dokunmadan open-ended (şıksız hukuk pratiği) desteği.
// - rawText içinden OLAY + alt soruları (1), (2) ... ayrıştırır
// - parsed'i "her alt soru = ayrı kart" olacak şekilde adapte eder
//
// Bu modül aynı zamanda UI katmanının kullandığı helper'ları export eder:
// - detectOpenEndedQuestion(q)
// - parseOpenEnded(qOrText)

function _toLines(text){
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(l => String(l || "").replace(/\u00A0/g, " "));
}

function _trimJoin(lines){
  return lines
    .map(s => String(s || "").trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function _findMarkerIdx(lines, re){
  for (let i = 0; i < lines.length; i++){
    const t = String(lines[i] || "").trim();
    if (!t) continue;
    if (re.test(t)) return i;
  }
  return -1;
}

function _findFirstSubIdx(lines){
  // 1) , 1. , (1) , 1- , 1:
  const re = /^\s*\(?\d{1,2}\)?\s*[\).\-:]\s+\S+/;
  for (let i = 0; i < lines.length; i++){
    const t = String(lines[i] || "");
    if (re.test(t)) return i;
  }
  return -1;
}

function _splitSubs(lines){
  // Supports: 1) , 1. , (1) , 1- , 1:
  const startRe = /^\s*(\(?\d{1,2}\)?)[\s]*[\).\-:]\s+(.*)$/;
  const subs = [];

  let cur = null;
  for (const raw of lines){
    const line = String(raw || "");
    const m = line.match(startRe);
    if (m){
      if (cur) subs.push(cur);
      const id = String(m[1] || "").replace(/[()\s]/g, "");
      const first = String(m[2] || "").trim();
      cur = { id: id || String(subs.length + 1), textLines: [first] };
      continue;
    }
    if (!cur) continue;

    // continuation line
    const t = line.trim();
    if (!t && cur.textLines.length && cur.textLines[cur.textLines.length - 1] === "") continue;
    cur.textLines.push(line.trimEnd());
  }
  if (cur) subs.push(cur);

  return subs
    .map(s => ({
      id: String(s.id),
      text: _trimJoin(s.textLines).replace(/^\s+/gm, "").trim(),
    }))
    .filter(s => s.text);
}

export function extractCaseAndSubs(rawText){
  const lines = _toLines(rawText);

  const OLAY_RE = /^\s*OLAY\b/i;
  const SORU_RE = /^\s*(SORULAR?|ALT\s+SORULAR?)\b/i;

  const olayIdx = _findMarkerIdx(lines, OLAY_RE);
  const soruIdx = _findMarkerIdx(lines, SORU_RE);

  // Prefer explicit OLAY -> SORULAR split
  if (olayIdx >= 0 && soruIdx >= 0 && soruIdx > olayIdx){
    const caseText = _trimJoin(lines.slice(olayIdx + 1, soruIdx));
    const subs = _splitSubs(lines.slice(soruIdx + 1));
    return { caseText, subQuestions: subs };
  }

  // Fallback: first subquestion determines boundary
  const firstSubIdx = _findFirstSubIdx(lines);
  if (firstSubIdx >= 0){
    const caseText = _trimJoin(lines.slice(0, firstSubIdx));
    const subs = _splitSubs(lines.slice(firstSubIdx));
    return { caseText, subQuestions: subs };
  }

  // Nothing detected
  return { caseText: _trimJoin(lines), subQuestions: [] };
}

/**
 * Detect if a rawText looks like open-ended (numbered subquestions) and not MCQ.
 */
export function detectOpenEnded(rawText){
  const t = String(rawText || "");
  if (!t.trim()) return false;

  // Has numbered subs and does NOT look like MCQ options
  const hasSubs = /(^|\n)\s*\(?\d{1,2}\)?\s*[\).\-:]\s+\S+/m.test(t);
  const hasOlayOrSorular = /(^|\n)\s*OLAY\b/m.test(t) || /(^|\n)\s*SORULAR?\b/m.test(t);
  const looksLikeMCQ = /(^|\n)\s*[A-F][\).:-]\s+\S+/m.test(t) || /(^|\n)\s*[A-F]\)\s+\S+/m.test(t);

  return (hasSubs && !looksLikeMCQ) && (hasOlayOrSorular || t.length > 800);
}

/**
 * UI helper: decide whether a parsed question should be treated as open-ended.
 * Works with both:
 * - adapted questions (q.kind === "openEndedPro" and q.openEnded)
 * - legacy: raw block text that looks open-ended
 */
export function detectOpenEndedQuestion(q){
  if (!q) return false;
  if (q.kind === "openEndedPro") return true;
  if (q.openEnded && typeof q.openEnded === "object") return true;
  // legacy fallback
  const txt = q.text || q.stem || "";
  return detectOpenEnded(txt);
}

/**
 * UI helper: parse a question into { scenario, parts }.
 * Accepts either:
 * - a question object (preferred)
 * - a raw text string (legacy fallback)
 */
export function parseOpenEnded(qOrText){
  // Preferred path: question object with openEnded metadata
  if (qOrText && typeof qOrText === "object" && !Array.isArray(qOrText)){
    const q = qOrText;
    const oe = q.openEnded || q.openEndedPro || null;

    if (oe && typeof oe === "object"){
      const scenario = String(oe.caseText || oe.scenario || "");
      // Multi-question mode stores a single subQuestion on the card
      if (oe.subQuestion && typeof oe.subQuestion === "object"){
        const id = String(oe.subQuestion.id || q.n || "1");
        const text = String(oe.subQuestion.text || "");
        return { scenario, parts: text ? [{ id, text }] : [] };
      }
      // Legacy single-card mode (kept for backward compat)
      if (Array.isArray(oe.subQuestions)){
        const parts = oe.subQuestions
          .map(x => ({ id: String(x.id), text: String(x.text || "") }))
          .filter(x => x.text);
        return { scenario, parts };
      }
    }

    // Fallback: parse from question text
    const raw = String(q.text || q.stem || "");
    const { caseText, subQuestions } = extractCaseAndSubs(raw);
    return { scenario: caseText || "", parts: subQuestions || [] };
  }

  // Legacy: raw text string
  const rawText = String(qOrText || "");
  const { caseText, subQuestions } = extractCaseAndSubs(rawText);
  return { scenario: caseText || "", parts: subQuestions || [] };
}

/**
 * Main adaptor:
 * - If rawText looks like open-ended, replace parsed.questions with N separate questions
 * - Each question = one subquestion (kart)
 */
export function adaptParsedToOpenEndedPro(parsed, rawText){
  if (!parsed) return parsed;

  parsed.meta = parsed.meta || {};
  // If already adapted, do nothing
  if (parsed.meta.openEndedPro === true && parsed.meta.openEndedSplit === true) return parsed;

  if (!detectOpenEnded(rawText)) return parsed;

  const { caseText, subQuestions } = extractCaseAndSubs(rawText);
  if (!subQuestions || subQuestions.length === 0) return parsed;

  const qs = subQuestions.map((sq, i) => ({
    n: i + 1,
    kind: "openEndedPro",
    text: sq.text || "", // legacy safe
    openEnded: {
      caseText: caseText || "",
      subQuestion: { id: String(sq.id), text: String(sq.text || "") },
      total: subQuestions.length,
      index: i + 1,
    },
    subject: "Pratik",
  }));

  parsed.questions = qs;
  parsed.answerKey = {};
  parsed.keyCount = 0;
  parsed.meta.openEndedPro = true;
  parsed.meta.openEndedSplit = true;
  parsed.meta.openEndedSubCount = subQuestions.length;
  parsed.meta.openEndedCaseChars = (caseText || "").length;

  return parsed;
}
