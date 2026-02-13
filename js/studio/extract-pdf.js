import { normalizeText, splitStemAndOptions, optionsByLetterFromMap } from "./text.js";
import { cropCanvas } from "./preview.js";

export async function extractFromPdfDoc(pdfDoc, questionsList){
  const byPage = new Map();
  for (const q of questionsList){
    if (!byPage.has(q.page)) byPage.set(q.page, []);
    byPage.get(q.page).push(q);
  }

  const extractedByNumber = new Map();

  for (const [pageNo, pageQuestions] of byPage.entries()){
    const page = await pdfDoc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.0 });
    const textContent = await page.getTextContent({ includeMarkedContent: true, disableCombineTextItems: false });

    const items = textContent.items.map(it => {
      const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const w = Math.abs(it.width || 0);
      const h = Math.abs(it.height || tx[3] || 0);
      const left = tx[4];
      const top  = tx[5];
      return { str: it.str, bbox: { left:left-1, top:top-1, right:left+w+2, bottom:top+h+2 } };
    }).filter(it => it.str && it.str.trim());
    // --- Preview render (once per page) ---
    // Render scale > 1 for crisp crops; kept compact via webp + downscale.
    const renderScale = 1.6;
    const pvViewport = page.getViewport({ scale: renderScale });
    const pvCanvas = document.createElement("canvas");
    pvCanvas.width = Math.ceil(pvViewport.width);
    pvCanvas.height = Math.ceil(pvViewport.height);
    await page.render({ canvasContext: pvCanvas.getContext("2d"), viewport: pvViewport }).promise;


    for (const q of pageQuestions){
      const pad = 1.5;
      const sel = { left:q.x-pad, top:q.y-pad, right:q.x+q.w+pad, bottom:q.y+q.h+pad };
      const inBox = items.filter(o => !(o.bbox.left>sel.right || o.bbox.right<sel.left || o.bbox.top>sel.bottom || o.bbox.bottom<sel.top));
      inBox.sort((a,b)=> (Math.abs(a.bbox.top-b.bbox.top)>5) ? a.bbox.top-b.bbox.top : a.bbox.left-b.bbox.left);

      const fullText = normalizeText(inBox.map(i=>i.str).join(" "));
      const parsed = splitStemAndOptions(fullText);

      extractedByNumber.set(q.number, {
        n: q.number,
        origN: q.number,
        text: (parsed.stem || "").trim() || "...",
        subject: "Genel",
        optionsByLetter: optionsByLetterFromMap(parsed.options || {}),
        preview: (() => {
          // q coords are template (scale 1.0); preview canvas is rendered at renderScale
          const sx = (q.x) * renderScale;
          const sy = (q.y) * renderScale;
          const sw = (q.w) * renderScale;
          const sh = (q.h) * renderScale;
          const { dataUrl } = cropCanvas(pvCanvas, sx, sy, sw, sh, 900);
          return dataUrl ? {
            kind: "crop",
            dataUrl,
            source: { type: "pdf", page: q.page, x: q.x, y: q.y, w: q.w, h: q.h }
          } : null;
        })(),
      });
    }
  }

  return {
    title: "Studio Sınavı",
    questions: Array.from(extractedByNumber.values()).sort((a,b)=>a.n-b.n),
    answerKey: {},
    keyCount: 0,
    meta: { format: "template-studio", source: "pdf" }
  };
}
