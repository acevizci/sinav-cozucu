// layered_blocker.js
// V2.1 - Non-sequential numbering + DOCX number-only lines + option-block merge (SAFE)
//
// Goals:
// - Keep your current stable parsing behavior (don't over-split, don't over-merge)
// - Support DOCX where question number can be alone on a line: "12."
// - Fix cases where DOCX breaks options into a separate paragraph-block (A/B/C...) and UI shows 0-3 options
// - Ignore stray lines like "+1" that appear between questions

import { cleanLine } from "./text_pipeline.js";

function extractLeadingNumber(line) {
  // "1.", "204)", "1-" gibi başlangıçları yakalar
  const m = cleanLine(line).match(/^(\d{1,4})[.)]/);
  return m ? Number(m[1]) : null;
}

export function isQuestionStartLine(line) {
  const l = cleanLine(line);

  // ✅ Soru başlangıcı:
  // - "12. Soru metni..."  (aynı satırda metin)
  // - "12." / "12)"        (metin bir sonraki satırda olabilir, özellikle DOCX)
  return /^\d{1,4}[.)]\s+\S+/.test(l) || /^\d{1,4}[.)]\s*$/.test(l);
}

function looksLikeOptionLine(line) {
  const l = cleanLine(line);
  if (!l) return false;

  // A) ... / A. ... / A: ... / A - ...
  if (/^\s*[A-F]\s*[\)\.\:\-]\s+\S+/i.test(l)) return true;

  // Inline: "A) ... B) ... C) ..."
  const hits = l.match(/[A-F]\s*[\)\.\:\-]/gi) || [];
  if (hits.length >= 2) return true;

  return false;
}

function hasQuestionSignal(blockLines) {
  // Blok içinde soru işareti veya şık benzeri yapılar var mı?
  const joined = blockLines.join(" ");
  const low = joined.toLowerCase();

  // klasik sinyaller
  if (joined.includes("?") || low.includes("çözüm") || low.includes("cevap") || low.includes("yanıt")) return true;

  // ✅ Şık sinyali
  if (/(^|\s)[A-F]\s*[\)\.\:\-]\s+\S/.test(joined)) return true;

  // ✅ DOCX: "1." satırı + devamında metin/şık gelebilir
  // En az 2 satır varsa ve ilk satır soru numarasıysa kabul et
  const first = cleanLine(blockLines[0] || "");
  if (/^\d{1,4}[.)]\s*$/.test(first) && blockLines.length >= 2) return true;

  // Eğer soru işareti yoksa ama en az 4 satır varsa yine kabul et
  if (blockLines.length >= 4) return true;

  return false;
}

function isNoiseLine(line) {
  const l = cleanLine(line);
  if (!l) return true;

  // DOCX bazen araya "+1" gibi tek satırlar sokabiliyor
  if (/^\+\d+$/.test(l)) return true;

  // sayfa numarası / ayraç gibi tek başına kalan çizgiler
  if (/^[\-–—]{2,}$/.test(l)) return true;

  return false;
}

function countOptionSignals(block) {
  let c = 0;
  for (let i = 0; i < block.length && i < 12; i++) {
    if (looksLikeOptionLine(block[i])) c++;
  }
  return c;
}

function isOptionOnlyContinuationBlock(block) {
  if (!block || block.length === 0) return false;

  // Asla soru numarasıyla başlamasın
  const first = cleanLine(block[0] || "");
  if (isQuestionStartLine(first)) return false;

  // İlk satırlarda güçlü şık sinyali olmalı
  const optHits = countOptionSignals(block);
  if (optHits >= 2) return true;

  // Bazı DOCX'lerde seçenekler unlabeled gelebiliyor; ama bu durumda
  // blok genelde kısa ve satırlar benzer uzunlukta olur. Burada agresif olmayalım.
  return false;
}

function previousLooksIncomplete(prev) {
  if (!prev || prev.length === 0) return false;

  // Eğer zaten şık sinyali bol ise, birleştirmeyelim
  if (countOptionSignals(prev) >= 2) return false;

  // Son satır "Bir" gibi kesik kalmış olabilir
  const last = cleanLine(prev[prev.length - 1] || "");
  if (!last) return true;

  if (last.length <= 6) return true;               // "Bir", "Ve", "I." vs.
  if (!/[\?\.!:]$/.test(last) && last.length < 80) return true; // kısa ve noktasız bitiş

  return false;
}

export function buildQuestionBlocks(lines) {
  const blocks = [];
  let current = [];

  const pushIfValid = (blk) => {
    if (!blk || !blk.length) return;
    if (hasQuestionSignal(blk)) blocks.push(blk);
  };

  for (const raw of lines) {
    const l = cleanLine(raw);
    if (isNoiseLine(l)) continue;

    if (isQuestionStartLine(l)) {
      const n = extractLeadingNumber(l);
      if (n !== null) {
        pushIfValid(current);
        current = [l];
        continue;
      }
    }

    current.push(l);
  }

  pushIfValid(current);

  // ✅ PASS 2: Merge option-only continuation blocks back into previous question block (SAFE)
  // This fixes cases where DOCX breaks the options into a separate paragraph group.
  const merged = [];
  for (const blk of blocks) {
    if (merged.length === 0) {
      merged.push(blk);
      continue;
    }

    const prev = merged[merged.length - 1];

    if (isOptionOnlyContinuationBlock(blk) && previousLooksIncomplete(prev)) {
      merged[merged.length - 1] = prev.concat(blk);
      continue;
    }

    merged.push(blk);
  }

  return merged;
}
