import { normalizeText, splitStemAndOptions, optionsByLetterFromMap } from "./text.js";
import { cropCanvas } from "./preview.js";
import { setOcrUI } from "./ui.js";

export async function extractFromImageOcr(imgEl, questionsList){
  if (typeof Tesseract === "undefined") throw new Error("Tesseract.js yüklenemedi");

  const src = document.createElement("canvas");
  const w = imgEl.naturalWidth || imgEl.width;
  const h = imgEl.naturalHeight || imgEl.height;
  src.width = w; src.height = h;
  src.getContext("2d").drawImage(imgEl, 0, 0, w, h);

  setOcrUI(true, "OCR hazırlanıyor…", 0);

  const worker = await Tesseract.createWorker("tur+eng");
  const out = [];

  for (let i=0; i<questionsList.length; i++){
    const q = questionsList[i];
    const crop = document.createElement("canvas");
    crop.width = Math.max(1, Math.floor(q.w));
    crop.height = Math.max(1, Math.floor(q.h));
    crop.getContext("2d").drawImage(
      src,
      Math.max(0, Math.floor(q.x)),
      Math.max(0, Math.floor(q.y)),
      Math.max(1, Math.floor(q.w)),
      Math.max(1, Math.floor(q.h)),
      0, 0,
      Math.max(1, Math.floor(q.w)),
      Math.max(1, Math.floor(q.h)),
    );

    const { data } = await worker.recognize(crop);
    const fullText = normalizeText(data?.text || "");
    const parsed = splitStemAndOptions(fullText);

    out.push({
      n: q.number,
      origN: q.number,
      text: (parsed.stem || "").trim() || "...",
      subject: "Genel",
      optionsByLetter: optionsByLetterFromMap(parsed.options || {}),
      preview: (() => {
        const { dataUrl } = cropCanvas(src, q.x, q.y, q.w, q.h, 900);
        return dataUrl ? {
          kind: "crop",
          dataUrl,
          source: { type: "image", x: q.x, y: q.y, w: q.w, h: q.h }
        } : null;
      })(),
    });

    const p01 = (i+1) / Math.max(1, questionsList.length);
    setOcrUI(true, `OCR: Soru ${q.number} işlendi (${i+1}/${questionsList.length})`, p01);
  }

  await worker.terminate();
  setOcrUI(false);

  return {
    title: "Studio Sınavı",
    questions: out.sort((a,b)=>a.n-b.n),
    answerKey: {},
    keyCount: 0,
    meta: { format: "template-studio", source: "image", ocr: "tesseract.js" }
  };
}
