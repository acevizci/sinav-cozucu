import { State } from "./state.js";
import { clamp } from "./math.js";
import { render, renderPdfPage } from "./render.js";

const SCALE_MIN = 0.85, SCALE_MAX = 2.8;

export async function changePage(dir){
  if (!State.pdfDoc) return;
  State.currentPage = clamp(State.currentPage + dir, 1, State.pdfDoc.numPages);
  State.highlightQ = null;
  await renderPdfPage(State.currentPage);
}

export async function zoomBy(delta){
  if (!State.pdfDoc && !State.img) return;
  const old = State.scale;
  State.scale = clamp(State.scale + delta, SCALE_MIN, SCALE_MAX);
  if (Math.abs(State.scale - old) < 0.001) return;
  await render();
}

export async function resetZoom(){
  if (!State.pdfDoc && !State.img) return;
  State.scale = 1.0;
  await render();
}
