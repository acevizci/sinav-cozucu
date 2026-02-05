// js/parser.js (parser_v11 - Auto Engine Universal Parser)
// Goal: formatı otomatik algıla; soru/şık kaçırmadan ayrıştır; output kontratını garanti et.
//
// Output contract:
// parseExam(text) -> {
//   title,
//   questions:[{ n, origN, text, subject, optionsByLetter }],
//   answerKey:{[n]:'A'..'E'},
//   keyCount,
//   meta
// }
//
// NOTE: pdf.js + mammoth global olmalı.

import { normalizeText } from "./utils.js";

const ENGINE_VERSION = "v11";
const LETTERS = ["A","B","C","D","E"];
const SOLUTION_MARK = /^(çözüm|cozum|cevap|answer)\b/i;

function cleanLine(s){
  return (s || "")
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}
function splitLines(text){
  return normalizeText(text).replace(/\r/g, "").split("\n").map(cleanLine);
}

function isStandaloneNumberLine(line){ return /^\d+\s*[\.\)]\s*$/.test(line); }
function isInlineNumberLine(line){ return /^\d+\.\s+/.test(line); }
function isQuestionStart(line){ return isStandaloneNumberLine(line) || isInlineNumberLine(line); }

function findSolutionIndex(lines){ return lines.findIndex(l => SOLUTION_MARK.test(l)); }
function extractAnswerFromSolution(lines){
  const joined = lines.join(" ");
  const m = joined.match(/\b([A-E])\b/i);
  return m ? m[1].toUpperCase() : null;
}

/* ================================
   ANSWER KEY PARSERS
================================ */

function sliceAnswerKeySection(text){
  const idx = text.search(/CEVAP\s+ANAHTAR|Cevap\s+Anahtar/i);
  if (idx < 0) return null;
  return text.slice(idx);
}

function parseAnswerKeyDashPipe(text){
  const key = {};
  const re = /(\d{1,4})\s*[-:]\s*([A-E])\b/gi;
  let m;
  while ((m = re.exec(text)) !== null){
    key[Number(m[1])] = m[2].toUpperCase();
  }
  return key;
}

function parseAnswerKeyClassic(text){
  const key = {};
  const re = /(?:^|\n)\s*(\d{1,4})\s*[\)\.\-:\t ]\s*([A-E])\b/gi;
  let m;
  while ((m = re.exec(text)) !== null){
    key[Number(m[1])] = m[2].toUpperCase();
  }
  return key;
}

function parseAnswerKeyPipes(text){
  const part = sliceAnswerKeySection(text);
  if (!part) return {};
  const lines = part.split("\n").map(cleanLine).filter(Boolean);

  let q = 1;
  const key = {};
  for (const ln of lines){
    if (/CEVAP\s+ANAHTAR|Cevap\s+Anahtar/i.test(ln)) continue;

    const chunks = ln.split("|").map(x => cleanLine(x)).filter(Boolean);
    for (const ch of chunks){
      let m = ch.match(/^(\d{1,4})\s*[\.\)\-:]?\s*([A-E])\b/i);
      if (m){
        q = Number(m[1]);
        key[q] = m[2].toUpperCase();
        q += 1;
        continue;
      }
      m = ch.match(/^([A-E])\b/i);
      if (m){
        key[q] = m[1].toUpperCase();
        q += 1;
      }
    }
  }
  return key;
}

function parseAnswerKeyDot(text){
  const key = {};
  const re = /(?:^|\n)\s*(\d{1,4})\.\s*([A-E])\b/gi;
  let m;
  while ((m = re.exec(text)) !== null){
    key[Number(m[1])] = m[2].toUpperCase();
  }
  return key;
}

function parseAnswerKeyAll(raw){
  const section = sliceAnswerKeySection(raw) || raw;
  // daha genel -> daha spesifik override
  const k1 = parseAnswerKeyClassic(section);
  const k2 = parseAnswerKeyDot(section);
  const k3 = parseAnswerKeyPipes(raw);
  const k4 = parseAnswerKeyDashPipe(section);
  return { ...k1, ...k2, ...k3, ...k4 };
}

/* ================================
   OPTIONS PARSERS
================================ */

function parseInlineOptionsFromLine(line){
  const s = String(line || "");
  const re = /([A-E])\s*[\)\.\:\-]\s*/g;
  const hits = [...s.matchAll(re)];
  if (hits.length < 3) return null;

  const before = s.slice(0, hits[0].index).trim();
  if (before.length < 8) return null;

  const optionsByLetter = {};
  for (let i=0;i<hits.length;i++){
    const L = hits[i][1].toUpperCase();
    const start = hits[i].index + hits[i][0].length;
    const end = (i+1 < hits.length) ? hits[i+1].index : s.length;
    const text = cleanLine(s.slice(start, end));
    if (text) optionsByLetter[L] = { id: L, text };
  }
  if (Object.keys(optionsByLetter).length < 3) return null;

  return { before, optionsByLetter };
}

function extractOptionsLettered(blockLines){
  // 1) inline
  const joined = blockLines.join(" ");
  const inline = parseInlineOptionsFromLine(joined);
  if (inline) return inline;

  // 2) multi-line A) ...
  const blockText = blockLines.join("\n");
  const optionsByLetter = {};
  const re = /(^|\n)\s*([A-E])\s*[\)\.\-:]\s*(.+?)(?=(\n\s*[A-E]\s*[\)\.\-:]|\n\s*(çözüm|cozum|cevap|answer)\b|$))/gis;

  let any = false;
  let m;
  while ((m = re.exec(blockText)) !== null){
    any = true;
    const L = String(m[2]).toUpperCase();
    const t = cleanLine(m[3]);
    if (t) optionsByLetter[L] = { id: L, text: t };
  }
  return any ? { before: null, optionsByLetter } : null;
}

function looksLikeOptionLine(s){
  const t = cleanLine(s);
  if (!t) return false;
  if (SOLUTION_MARK.test(t)) return false;
  if (/\?\s*$/.test(t)) return false; // soru satırı olabilir
  if (t.length < 3 || t.length > 260) return false;
  return true;
}

function inferOptionCount(answerLetter, candidatesCount){
  if (answerLetter === "E") return 5;
  if (answerLetter === "D") return 4;
  if (candidatesCount >= 5) return 5;
  if (candidatesCount >= 4) return 4;
  if (candidatesCount >= 3) return 3;
  return 0;
}

function guessOptionsStart(lines){
  const qMarkIdx = lines.findIndex(l => l.includes("?"));
  if (qMarkIdx !== -1) return qMarkIdx + 1;

  const letterIdx = lines.findIndex(l => /^[A-E]\s*[\)\.\-:]\s+/.test(l));
  if (letterIdx !== -1) return letterIdx;

  // fallback: ilk satır numara ise 1, değilse 0
  return 1;
}

function extractOptionsUnlettered(lines, startIdx, endIdx, answerLetter){
  const raw = lines.slice(startIdx, endIdx).map(cleanLine).filter(Boolean);
  const candidates = raw.filter(looksLikeOptionLine);
  const takeN = inferOptionCount(answerLetter, candidates.length);
  if (takeN < 3) return null;

  const picked = candidates.slice(-takeN);
  const optionsByLetter = {};
  picked.forEach((t, i) => {
    const L = LETTERS[i];
    optionsByLetter[L] = { id: L, text: t };
  });
  return { before: null, optionsByLetter };
}

function ensureAE(optionsByLetter){
  const out = {};
  for (const L of LETTERS){
    const txt = (optionsByLetter?.[L]?.text || "").trim();
    out[L] = { id: L, text: txt || "Görseldeki Seçenek" };
  }
  return out;
}

/* ================================
   BLOCK BUILDER
================================ */

function buildBlocks(lines){
  const blocks = [];
  let current = [];

  for (let i=0;i<lines.length;i++){
    const l = cleanLine(lines[i]);
    if (!l) continue;

    if (isQuestionStart(l)){
      if (current.length) blocks.push(current);
      current = [l];
      continue;
    }

    current.push(l);
  }

  if (current.length) blocks.push(current);
  return blocks;
}

function extractNumberAndSeed(firstLine, nextLine){
  const a = cleanLine(firstLine);

  // "1. Soru..."
  let m = a.match(/^(\d+)\.\s+(.+)$/);
  if (m) return { n: Number(m[1]), seedText: m[2].trim() };

  // "1." / "1)"
  m = a.match(/^(\d+)\s*[\.\)]\s*$/);
  if (m) return { n: Number(m[1]), seedText: cleanLine(nextLine || "") };

  // weak fallback
  m = a.match(/^(\d+)\D/);
  if (m) return { n: Number(m[1]), seedText: a.replace(/^\d+\D+/, "").trim() };

  return { n: null, seedText: a };
}

function extractSubjectAndStripPrefix(questionText){
  let text = String(questionText || "").trim();
  let subject = "Genel";

  // "[Konu] ..." -> subject
  const mSub = text.match(/^\[(.*?)\]\s*/);
  if (mSub && mSub[1]) {
    subject = mSub[1].trim() || "Genel";
    text = text.replace(/^\[.*?\]\s*/, "");
  }

  // "1." "1)" prefix
  text = text.replace(/^\d+\s*[\.\)]\s*/, "").trim();

  return { subject, text };
}

// Answer key gibi yoğun pattern blokları ele (guard)
function looksLikeAnswerKeyBlock(blockLines){
  const t = blockLines.join(" ");
  const hits = (t.match(/\b\d{1,4}\s*[-:\.]\s*[A-E]\b/gi) || []).length;
  // 8+ eşleşme genelde anahtar listesi
  return hits >= 8 && blockLines.length <= 12;
}

/* ================================
   ENGINE: build question from block
================================ */

function buildQuestionFromBlock(block){
  if (!block || !block.length) return null;
  if (looksLikeAnswerKeyBlock(block)) return null;

  const solIdx = findSolutionIndex(block);
  const before = solIdx === -1 ? block : block.slice(0, solIdx);
  const after  = solIdx === -1 ? []    : block.slice(solIdx);

  const { n, seedText } = extractNumberAndSeed(before[0], before[1]);
  if (!n) return null;

  const ansFromSolution = extractAnswerFromSolution(after);

  // 1) lettered (inline or multiline)
  const lettered = extractOptionsLettered(before);
  let optionsByLetter = lettered?.optionsByLetter || null;

  // 2) questionText candidate
  let questionText = null;
  if (lettered && lettered.before){
    questionText = lettered.before.trim();
  }

  // 3) unlettered heuristic (StudyHall)
  if (!optionsByLetter){
    const startIdx = guessOptionsStart(before);
    const un = extractOptionsUnlettered(before, startIdx, before.length, ansFromSolution);
    optionsByLetter = un?.optionsByLetter || null;
  }

  // 4) fallback question text: up to first option
  if (!questionText){
    let cut = before.length;

    const firstOpt = before.findIndex(x => /^[A-E]\s*[\)\.\-:]\s+/.test(cleanLine(x)));
    if (firstOpt !== -1) cut = firstOpt;

    if (optionsByLetter && cut === before.length){
      cut = Math.min(guessOptionsStart(before), before.length);
    }

    const composed = before
      .slice(0, cut)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    questionText = composed || seedText || "";
  }

  const { subject, text } = extractSubjectAndStripPrefix(questionText);

  if (!text || !text.trim()){
    console.warn("Empty question text:", { n, block });
  }

  return {
    n,                 // ✅ contract
    origN: n,
    text: text || "",
    subject,
    optionsByLetter: ensureAE(optionsByLetter),
    _answerFromSolution: ansFromSolution || null
  };
}

/* ================================
   AUTO DETECT
================================ */

function detectFormat(raw, lines){
  const hasSolution = /\bÇözüm\b/i.test(raw) || /\bCOZUM\b/i.test(raw);
  const hasInlineOpts = /A\)\s*.+B\)\s*.+C\)/i.test(raw) || /A\.\s*.+B\.\s*.+C\./i.test(raw);
  const hasStandaloneNums = lines.slice(0, 200).some(l => isStandaloneNumberLine(l));
  const hasKeyDash = /(\d+)\s*-\s*[A-E]\b/.test(raw);
  const hasKeyDot = /(?:^|\n)\s*\d+\.\s*[A-E]\b/.test(raw);
  const hasKeyTitle = /CEVAP\s+ANAHTAR|Cevap\s+Anahtar/i.test(raw);

  if (hasSolution) return "studyhall";
  if (hasInlineOpts) return "inline";
  if (hasStandaloneNums) return "standalone-num";
  if (hasKeyTitle && (hasKeyDash || hasKeyDot)) return "classic";
  return "classic";
}

/* ================================
   MAIN
================================ */

export function parseExam(text){
  const raw = normalizeText(text);
  if (!raw) return { title:"Sınav", questions:[], answerKey:{}, keyCount:0, meta:{ format:"empty", engine: ENGINE_VERSION } };

  const lines = splitLines(raw);

  // Key başlığı varsa soru bloğu üretmesin diye öncesini al
  const keyStartIdx = lines.findIndex(l => /CEVAP\s+ANAHTAR|Cevap\s+Anahtar/i.test(l));
  const contentLines = keyStartIdx === -1 ? lines : lines.slice(0, keyStartIdx);

  const format = detectFormat(raw, lines);
  const answerKey = parseAnswerKeyAll(raw);

  const blocks = buildBlocks(contentLines);

  const questions = [];
  for (const b of blocks){
    const q = buildQuestionFromBlock(b);
    if (!q) continue;

    // ✅ Keep contract stable
    questions.push({
      n: q.n,
      origN: q.origN,
      text: q.text,
      subject: q.subject,
      optionsByLetter: q.optionsByLetter
    });

    // Solution answer -> fill if missing
    if (q._answerFromSolution && !answerKey[q.n]){
      answerKey[q.n] = q._answerFromSolution;
    }
  }

  return {
    title: "Sınav",
    questions,
    answerKey,
    keyCount: Object.keys(answerKey).length,
    meta: { format, blocks: blocks.length, engine: ENGINE_VERSION }
  };
}

/* ================= DOCX helpers ================= */

async function docxArrayBufferToText(buf){
  if (typeof mammoth === "undefined"){
    throw new Error("mammoth bulunamadı. index.html'de mammoth.js yüklü olmalı.");
  }
  const r = await mammoth.convertToHtml({ arrayBuffer: buf });
  const html = r.value || "";
  const doc = new DOMParser().parseFromString(html, "text/html");

  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.nodeName === "BR"){
      parts.push("\n");
      return;
    }
    if (node.nodeType === 3){
      parts.push(node.textContent || "");
      return;
    }
    if (node.nodeType === 1){
      const tag = node.nodeName.toLowerCase();
      if (["p","li","h1","h2","h3","h4","h5","h6"].includes(tag)){
        const t = cleanLine(node.textContent || "");
        if (t) parts.push(t + "\n");
        return;
      }
      for (const ch of Array.from(node.childNodes || [])) walk(ch);
    }
  };
  walk(doc.body);

  return parts.join("")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map(s => cleanLine(s))
    .filter(s => s !== "")
    .join("\n");
}

/* ================= PDF helpers ================= */

async function pdfArrayBufferToText(buf){
  if (typeof pdfjsLib === "undefined"){
    throw new Error("pdf.js bulunamadı. index.html'de pdf.js yüklü olmalı.");
  }

  if (!pdfjsLib.GlobalWorkerOptions.workerSrc){
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  const parts = [];
  for (let p = 1; p <= pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items || [])
      .map(it => ({
        str: (it.str || "").trim(),
        x: it.transform?.[4] ?? 0,
        y: it.transform?.[5] ?? 0
      }))
      .filter(it => it.str);

    // ✅ deterministic reading order
    items.sort((a,b) => (b.y - a.y) || (a.x - b.x));

    let lastY = null;
    let line = [];

    const flush = () => {
      const s = line.join(" ").replace(/\s+/g, " ").trim();
      if (s) parts.push(s);
      line = [];
    };

    for (const it of items){
      const y = it.y;
      if (lastY == null){
        lastY = y;
        line.push(it.str);
        continue;
      }

      // line threshold: PDF'ler arası tolerans için biraz büyüttük
      if (Math.abs(y - lastY) > 3.5){
        flush();
        lastY = y;
      }
      line.push(it.str);
    }

    flush();
    parts.push(""); // page separator
  }

  return parts.join("\n").trim();
}

export async function readFileAsText(file){
  const name = (file?.name || "").toLowerCase();

  if (name.endsWith(".txt")) return await file.text();

  if (name.endsWith(".docx")){
    const buf = await file.arrayBuffer();
    return await docxArrayBufferToText(buf);
  }

  if (name.endsWith(".pdf")){
    const buf = await file.arrayBuffer();
    return await pdfArrayBufferToText(buf);
  }

  throw new Error("Sadece DOCX / TXT / PDF");
}

export async function parseFromFile(file){
  const t = await readFileAsText(file);
  if (!normalizeText(t)) throw new Error("Metin yok");
  return parseExam(t);
}
