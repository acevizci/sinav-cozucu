import { State } from "./state.js";
import { Dom } from "./dom.js";
import { zoomBy } from "./controls.js";

export function bindCtrlWheelZoom(){
  Dom.wrapper.addEventListener('wheel', async (e) => {
    if (!State.pdfDoc && !State.img) return;
    if (!e.ctrlKey) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -1 : 1;
    await zoomBy(dir * 0.12);
  }, { passive: false });
}
