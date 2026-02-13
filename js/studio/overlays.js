import { State } from "./state.js";
import { Dom } from "./dom.js";

export function renderOverlays(){
  Dom.overlayLayer.innerHTML = "";
  const scale = State.scale;

  const pageQs = State.pdfDoc
    ? State.questions.filter(q => q.page === State.currentPage)
    : State.questions;

  for (const q of pageQs) {
    const el = document.createElement('div');
    el.className = 'q-rect' + (State.highlightQ === q.number ? ' highlight' : '');
    el.setAttribute('data-qrect', String(q.number));
    el.style.left = (q.x * scale) + 'px';
    el.style.top = (q.y * scale) + 'px';
    el.style.width = (q.w * scale) + 'px';
    el.style.height = (q.h * scale) + 'px';

    const lab = document.createElement('div');
    lab.className = 'label';
    lab.textContent = `#${q.number}`;
    el.appendChild(lab);

    if (State.highlightQ === q.number) {
      for (const h of ["nw","n","ne","e","se","s","sw","w"]) {
        const hd = document.createElement('div');
        hd.className = 'handle handle-' + h;
        hd.setAttribute('data-handle', h);
        hd.setAttribute('data-qnum', String(q.number));
        el.appendChild(hd);
      }
    }

    Dom.overlayLayer.appendChild(el);
  }
}
