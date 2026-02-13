import { State } from "./state.js";
import { Dom } from "./dom.js";
import { toast, updateZoomUI } from "./ui.js";
import { render } from "./render.js";

export async function loadFromFile(file){
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (isPdf) return loadPdf(file);
  if (file.type.startsWith("image/")) return loadImage(file);
  throw new Error("Desteklenmeyen dosya tipi.");
}

export async function loadPdf(file){
  if (typeof pdfjsLib === "undefined") throw new Error("pdf.js yüklenemedi");
  toast("PDF", "Yükleniyor…");

  const arrayBuffer = await file.arrayBuffer();
  State.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  State.img = null;

  State.scale = 1.0; State.currentPage = 1; State.questions = []; State.undoStack = []; State.highlightQ = null;
  updateZoomUI();

  const empty = document.getElementById('emptyState');
  const cont = document.getElementById('canvasContainer');
  if (empty) empty.style.display = 'none';
  if (cont) cont.style.display = 'block';

  try { Dom.wrapper.scrollTop = 0; Dom.wrapper.scrollLeft = 0; } catch {}

  await render();
  toast("PDF", "Hazır. Kutu çizerek soruları işaretle.");
}

export async function loadImage(file){
  toast("Resim", "Yükleniyor…");

  State.pdfDoc = null;
  State.highlightQ = null;

  const img = new Image();
  img.decoding = "async";
  img.src = URL.createObjectURL(file);
  await new Promise((res, rej) => {
    img.onload = () => res();
    img.onerror = () => rej(new Error("Resim okunamadı"));
  });

  State.img = img;
  State.scale = 1.0; State.currentPage = 1; State.questions = []; State.undoStack = [];
  updateZoomUI();

  const empty = document.getElementById('emptyState');
  const cont = document.getElementById('canvasContainer');
  if (empty) empty.style.display = 'none';
  if (cont) cont.style.display = 'block';

  try { Dom.wrapper.scrollTop = 0; Dom.wrapper.scrollLeft = 0; } catch {}

  await render();
  toast("Resim", "Hazır. Kutu çizerek soruları işaretle.");
}
