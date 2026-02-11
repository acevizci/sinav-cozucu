// layered_qa_parser.js
// V6.7 - Final Proof (F Option Guarantee + Aggressive Dedupe)

import { cleanLine, SOLUTION_ANY_RE } from "./text_pipeline.js";


const DEBUG_PARSER = !!(typeof window !== "undefined" && window.DEBUG_PARSER);
const dlog = (...args) => { if (DEBUG_PARSER) console.log(...args); };
const LETTERS = ["A", "B", "C", "D", "E", "F"];

// Çözüm satırı tespiti
function isSolutionLine(line) {
  const l = cleanLine(line);
  return !!l && (SOLUTION_ANY_RE.test(l) || /^(Çözüm|Cevap|Yanıt)\s*[:\.]?/i.test(l));
}

function extractQNumber(firstLine) {
  const a = cleanLine(firstLine);
  // "1.", "1)", "1-"
  const m = a.match(/^(\d+)\s*[\.\)\-]\s+(.+)$/);
  if (m) return { n: Number(m[1]), seed: cleanLine(m[2]) };
  
  // Sadece sayı: "1."
  const m2 = a.match(/^(\d+)\s*[\.\)\-]?$/);
  if (m2) return { n: Number(m2[1]), seed: "" };

  return { n: null, seed: a };
}

function splitBeforeAfterSolution(block) {
  const idx = block.findIndex((l) => isSolutionLine(l));
  if (idx === -1) return { before: block.slice(), after: [] };
  return { before: block.slice(0, idx), after: block.slice(idx) };
}

function extractAnswerFromSolutionLines(lines) {
  if (!lines?.length) return null;
  const text = lines.map(cleanLine).join(" "); 
  
  // Örn: "Çözüm: A, C, E ve F."
  const prefixMatch = text.match(/(?:Çözüm|Cevap|Yanıt)\s*[:\.]?\s*([A-F\s,ve&]+)(?:[\.\-]|$)/i);
  if (prefixMatch) {
      const rawLetters = prefixMatch[1];
      const letters = rawLetters.match(/\b[A-F]\b/g);
      if (letters) return [...new Set(letters)].join("");
  }
  
  const fallback = text.match(/^\s*(?:Çözüm|Cevap)?\s*([A-F])\b/i);
  if (fallback) return fallback[1];

  return null;
}

// YENİ: Çok Agresif Tekrar Temizleyici (Duplicate Remover)
// Word'den gelen "Ürün vizyonu" (satır 1) ve "Ürün vizyonu" (satır 2) kopyalarını siler.
function removeConsecutiveDuplicates(lines) {
  return lines.filter((line, index) => {
    if (index === 0) return true;
    
    // Satırları "çırılçıplak" hale getirip kıyasla (boşluksuz, küçük harf)
    const curr = cleanLine(line).toLowerCase().replace(/[^a-z0-9ğüşıöç]/g, "");
    const prev = cleanLine(lines[index - 1]).toLowerCase().replace(/[^a-z0-9ğüşıöç]/g, "");
    
    // Eğer satırlar neredeyse aynıysa, ikincisini at (duplicate)
    // "Performans dizinlerini" vs "Performans dizinlerini"
    return curr !== prev;
  });
}

/**
 * ANA AYRIŞTIRMA MANTIĞI
 */
function separateStemAndOptions(lines, qNumber, knownAnswer) {
  // 1. Temizlik ve Tekrar Giderme
  let cleanLines = lines.map(cleanLine).filter(Boolean);
  cleanLines = removeConsecutiveDuplicates(cleanLines); 
  
  // ✅ INLINE OPTIONS (DOCX): "1. ... ? A) ... B) ... C) ..."
// Stabilite: sadece tek/iki satırda olup en az 2 adet şık etiketi barındırıyorsa devreye girer.
if (cleanLines.length <= 2) {
    const one = cleanLines.join(" ").trim();
    const hits = (one.match(/\b[A-F]\)\s+/g) || []).length;
    if (hits >= 2) {
        const firstIdx = one.search(/\b[A-F]\)\s+/);
        const stem = firstIdx > 0 ? one.slice(0, firstIdx).trim() : "";
        const tail = firstIdx > 0 ? one.slice(firstIdx).trim() : one;

        // parçala: "A) xxx B) yyy ..." -> {A:xxx, B:yyy,...}
        const parts = tail.split(/\b(?=[A-F]\)\s+)/).map(s => s.trim()).filter(Boolean);
        const optMap = {};
        for (const p of parts) {
            const mm = p.match(/^([A-F])\)\s*(.*)$/);
            if (!mm) continue;
            const L = mm[1].toUpperCase();
            let txt = (mm[2] || "").trim();

// A) B) İnsanlar... gibi çift etiketleri temizle
txt = txt.replace(/^([A-F]\)\s*)+/i, "").trim();

// Bazı dosyalarda ikinci etiket boşluksuz geliyor: B)A)...
txt = txt.replace(/^[A-F]\)/i, "").trim();

if (txt) optMap[L] = txt;

        }
        const optionLines = LETTERS.map(L => optMap[L]).filter(Boolean);

        // Eğer F varsa ve 6 şık gerçekten var ise koru
        if (knownAnswer?.includes("F") && optionLines.length >= 6) {
            const last6 = optionLines.slice(-6);
            return { stemLines: [stem].filter(Boolean), optionLines: last6 };
        }

        if (optionLines.length >= 2) {
            return { stemLines: [stem].filter(Boolean), optionLines };
        }
    }
}

if (cleanLines.length < 3) {
    return { stemLines: cleanLines, optionLines: [] };
}

  // 15. Soru Debug
  if (qNumber === 15) {
      dlog(`[Q15 V6.7 INPUT] Lines: ${cleanLines.length}, Answer: ${knownAnswer}`);
  }

  // YÖNTEM 0: CEVAP ANAHTARI ZORLAMASI (FORCE MODE)
  // Cevap F içeriyorsa, sondan 6 satırı kesinlikle şık yap.
  if (knownAnswer?.includes("F") && cleanLines.length >= 6) {
      dlog(`[Q${qNumber}] Force Mode: F detected. Forcing 6 options.`);
      const cut = cleanLines.length - 6;
      return {
          stemLines: cleanLines.slice(0, cut),
          optionLines: cleanLines.slice(cut)
      };
  }

  let splitIndex = -1;
  let signalConfidence = "NONE";

  // YÖNTEM 1: Sinyal Arama
  for (let i = cleanLines.length - 1; i >= 0; i--) {
      const l = cleanLines[i];
      // Soru işareti, iki nokta, parantezli seçim
      if (l.endsWith("?") || l.endsWith(":")) {
          splitIndex = i;
          signalConfidence = "STRONG";
          break;
      }
      // "seçin" ifadesini yakala
      if (/[\(\[]\s*.*?(seçin|seçiniz).*?[\)\]]/i.test(l)) {
          splitIndex = i;
          signalConfidence = "STRONG";
          break;
      }
      if (/(hangisidir|değildir|yapmalıdır|gerekir|izlenmelidir)[\.\?]?$/i.test(l)) {
          splitIndex = i;
          signalConfidence = "STRONG";
          break;
      }
  }

  if (signalConfidence === "STRONG") {
      const optCount = cleanLines.length - 1 - splitIndex;
      if (optCount >= 2 && optCount <= 8) { 
          return {
              stemLines: cleanLines.slice(0, splitIndex + 1),
              optionLines: cleanLines.slice(splitIndex + 1)
          };
      }
  }

  // YÖNTEM 2: İstatistiksel (Fallback)
  const tailVariance = (k) => {
      if (cleanLines.length <= k) return 999;
      const tail = cleanLines.slice(-k);
      const lens = tail.map(s => s.length);
      const avg = lens.reduce((a,b)=>a+b,0)/k;
      return lens.reduce((a,b)=>a+Math.abs(b-avg),0)/k;
  };
  
  const isShort = (k) => cleanLines.slice(-k).every(s => s.length < 300);
  const hasQuestionMark = (k) => cleanLines.slice(-k).some(l => l.trim().endsWith("?"));

  let takeCount = 0;

  // 6 Şık Kontrolü
  if (cleanLines.length >= 7 && !hasQuestionMark(6) && isShort(6) && tailVariance(6) < 60) {
      takeCount = 6;
  }
  else if (cleanLines.length >= 6 && !hasQuestionMark(5) && isShort(5) && tailVariance(5) < 50) {
      takeCount = 5;
  }
  else if (cleanLines.length >= 5 && !hasQuestionMark(4) && isShort(4) && tailVariance(4) < 50) {
      takeCount = 4;
  }
  else if (cleanLines.length === 5) takeCount = 4; 
  else if (cleanLines.length === 6) takeCount = 6; 
  else if (cleanLines.length === 7) takeCount = 6; 
  else if (cleanLines.length === 8) takeCount = 6;

  if (takeCount > 0) {
      const cut = cleanLines.length - takeCount;
      return {
          stemLines: cleanLines.slice(0, cut),
          optionLines: cleanLines.slice(cut)
      };
  }

  return { stemLines: cleanLines, optionLines: [] };
}

export function parseBlockToQuestion(block) {
  const { before, after } = splitBeforeAfterSolution(block);
  
  // Önce cevabı bul (Zorlama modu için)
  const answer = extractAnswerFromSolutionLines(after);

  const rawLines = before
    .map(cleanLine)
    .filter(Boolean)
    .filter(l => !isSolutionLine(l));

  if (rawLines.length === 0) return null;

  const { n, seed } = extractQNumber(rawLines[0]);
  
  let contentLines = [];
  if (rawLines[0].match(/^\d+[\.\)\-]\s*$/)) {
      contentLines = rawLines.slice(1);
  } else {
      contentLines = [rawLines[0].replace(/^\d+[\.\)\-]\s*/, ""), ...rawLines.slice(1)];
  }

  // Ayrıştırma
  const { stemLines, optionLines } = separateStemAndOptions(contentLines, n, answer);

const finalOptions = {};
optionLines.forEach((txt, i) => {
  if (i >= LETTERS.length) return;

  let t = cleanLine(txt);

  // Baştaki tüm şık etiketlerini sök: A) B) C) ...
  t = t.replace(/^(\s*[A-F]\s*[\)\.\:\-]\s*)+/i, "").trim();

  finalOptions[LETTERS[i]] = {
    id: LETTERS[i],
    text: t
  };
});




  // JUNK FILTER - Boş soruları temizle ama cevap varsa (metin sorusu) tut.
  if (Object.keys(finalOptions).length === 0 && !answer) {
      return null;
  }

  let stemText = stemLines.join(" ").trim();
  if (!stemText && seed) stemText = seed;

  let selectCount = 1;
  const lowerStem = stemText.toLowerCase();
  
  if (lowerStem.includes("3'ü seçin") || lowerStem.includes("üç temel faktör")) selectCount = 3;
  else if (lowerStem.includes("dört tane seçin") || lowerStem.includes("4'ü seçin")) selectCount = 4;
  else if (lowerStem.includes("2'yi seçin") || lowerStem.includes("iki tanesini")) selectCount = 2;
  
  if (answer && answer.length > 1) {
     selectCount = Math.max(selectCount, answer.length);
  }

  return {
    n: n || 0,
    text: stemText || "Soru metni bulunamadı",
    subject: "Genel",
    selectCount: selectCount,
    optionsByLetter: finalOptions,
    _answerFromSolution: answer
  };
}