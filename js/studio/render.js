import { State } from "./state.js";
import { Dom } from "./dom.js";
import { updateZoomUI } from "./ui.js";
import { updateQuestionList } from "./sidebar.js";
import { renderOverlays } from "./overlays.js";

export async function render(){
  if (State.pdfDoc) return renderPdfPage(State.currentPage);
  if (State.img) return renderImage();
  updateZoomUI(); updateQuestionList(); renderOverlays();
}

export async function renderPdfPage(pageNo){
  const page = await State.pdfDoc.getPage(pageNo);
  const viewport = page.getViewport({ scale: State.scale });

  Dom.canvas.width = viewport.width;
  Dom.canvas.height = viewport.height;

  Dom.overlayLayer.style.width = viewport.width + "px";
  Dom.overlayLayer.style.height = viewport.height + "px";

  await page.render({ canvasContext: Dom.ctx, viewport }).promise;

  if (Dom.pageInfo) Dom.pageInfo.textContent = `Sayfa ${pageNo} / ${State.pdfDoc.numPages}`;
  if (Dom.pageControls) Dom.pageControls.style.display = "flex";

  updateZoomUI(); updateQuestionList(); renderOverlays();
}

export function renderImage(){
  const w = (State.img.naturalWidth || State.img.width) * State.scale;
  const h = (State.img.naturalHeight || State.img.height) * State.scale;

  Dom.canvas.width = Math.round(w);
  Dom.canvas.height = Math.round(h);

  Dom.overlayLayer.style.width = Dom.canvas.width + "px";
  Dom.overlayLayer.style.height = Dom.canvas.height + "px";

  Dom.ctx.setTransform(1,0,0,1,0,0);
  Dom.ctx.clearRect(0,0,Dom.canvas.width,Dom.canvas.height);
  Dom.ctx.drawImage(State.img, 0, 0, Dom.canvas.width, Dom.canvas.height);

  if (Dom.pageInfo) Dom.pageInfo.textContent = "Resim";
  if (Dom.pageControls) Dom.pageControls.style.display = "none";

  updateZoomUI(); updateQuestionList(); renderOverlays();
}
