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

  // NOTE:
  // Earlier versions treated ANY numbered lines as "subquestions".
  // But MCQ exams also have numbered questions (1., 2., ...), especially in DOCX.
  // So we require stronger evidence:
  //  - Either explicit markers (OLAY / SORULAR)
  //  - Or a long scenario-like prefix before the first numbered subquestion
  // And we must aggressively rule out MCQ by detecting option labels ANYWHERE
  // (including inline: "... A) ... B) ...").

  const hasNumberedItems = /(^|\n)\s*\(?\d{1,3}\)?\s*[\).\-:]\s+\S+/m.test(t);
  if (!hasNumberedItems) return false;

  // --- Helpers
  const stripParenVars = (s) => String(s || "").replace(/\(\s*[A-ZÇĞİÖŞÜ]\s*\)/g, "");

  // Treat lines like "F) SORULAR" as headers, never as MCQ options.
  const isSorularHeaderLine = (line) => /\bSORULAR\b/i.test(line) && /^\s*[A-Z]\s*[\).:-]\s*\bSORULAR\b/i.test(line);

  const detectStrongMCQ = (s) => {
    const text = stripParenVars(s);
    const lines = text.split(/\r?\n/);
    const hits = [];

    // Line-start options: A) ... / B. ... / C- ...
    for (let i = 0; i < lines.length; i++){
      const ln = lines[i];
      if (!ln || !ln.trim()) continue;
      if (isSorularHeaderLine(ln)) continue;
      const m = ln.match(/^\s*([A-H])\s*[\).\-:]\s+\S+/i);
      if (m) hits.push({ letter: m[1].toUpperCase(), idx: i });
    }

    // Inline options on the same line: "... A) ... B) ... C) ..."
    // Important: ignore "(A)" variable-like references by stripping them above.
    const inline = [];
    const inlineRe = /(?:^|\s)([A-H])\s*\)\s+\S+/gi;
    let m;
    while ((m = inlineRe.exec(text))){
      inline.push(m[1].toUpperCase());
      if (inline.length > 20) break; // safety
    }

    const uniq = (arr) => Array.from(new Set(arr));

    // Strong MCQ if we see >=4 distinct option letters in line-start OR inline.
    const distinctLine = uniq(hits.map(h => h.letter));
    const distinctInline = uniq(inline);
    if (distinctLine.length >= 4) return true;
    if (distinctInline.length >= 4) return true;
    return false;
  };

  const hasOlay = /(^|\n)\s*OLAY\b/m.test(t);
  const hasSorular = /(^|\n)\s*SORULAR?\b/m.test(t);
  const hasOlayOrSorular = hasOlay || hasSorular;

  // --- Open-ended priority path:
  // If there is an explicit SORULAR header and numbered subquestions after it,
  // it is open-ended even if the scenario contains "A)" lists or (A) variables.
  if (hasSorular){
    const lines = t.split(/\r?\n/);
    const sorIdx = lines.findIndex(ln => /\bSORULAR\b/i.test(ln));
    if (sorIdx >= 0){
      const after = lines.slice(sorIdx + 1).join("\n");
      const subCount = (after.match(/(^|\n)\s*\(?\d{1,3}\)?\s*[\).\-:]\s+\S+/gm) || []).length;
      if (subCount >= 1){
        // If the section AFTER SORULAR clearly looks like MCQ (real A-D options),
        // then it's not open-ended.
        if (!detectStrongMCQ(after)) return true;
      }
    }
  }

  // --- Non-marker path:
  // Rule out MCQ only when MCQ evidence is strong.
  if (detectStrongMCQ(t)) return false;

  // Heuristic: long scenario prefix before the first numbered item
  const firstIdx = t.search(/(^|\n)\s*\(?\d{1,3}\)?\s*[\).\-:]\s+\S+/m);
  const prefix = firstIdx > 0 ? t.slice(0, firstIdx).trim() : "";
  const hasLongPrefix = prefix.length > 500;

  return hasOlayOrSorular || hasLongPrefix;
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
