import { State } from "./state.js";
import { toast, downloadJson, getSafeOrigin, setOcrUI } from "./ui.js";
import { extractFromPdfDoc } from "./extract-pdf.js";
import { extractFromImageOcr } from "./extract-image-ocr.js";

export async function exportToApp(){
  if (!State.questions.length) { alert("Lütfen en az bir soru işaretleyin."); return; }

  try{
    toast("Aktarım", "Metinler çıkarılıyor…");

    let finalData;
    if (State.pdfDoc) finalData = await extractFromPdfDoc(State.pdfDoc, State.questions);
    else if (State.img) finalData = await extractFromImageOcr(State.img, State.questions);
    else throw new Error("Doküman yok.");

    const origin = getSafeOrigin();

    if (window.opener && typeof window.opener.postMessage === "function") {
      try {
        window.opener.postMessage({ type: 'ACUMEN_EXAM_DATA', payload: finalData }, origin);
        toast("Aktarım", "Ana uygulamaya gönderildi. Kapatıyorum…", 1800);
        setTimeout(() => window.close(), 900);
        return;
      } catch {}
    }

    downloadJson("acumen_exam_data.json", finalData);
    toast("Aktarım", "Pencere bağlantısı yok. JSON indirildi.", 2600);
  } catch (err) {
    setOcrUI(false);
    alert("Hata: " + (err?.message || String(err)));
  }
}
