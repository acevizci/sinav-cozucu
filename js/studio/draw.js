import { State } from "./state.js";
import { Dom } from "./dom.js";
import { clamp, snapPx } from "./math.js";
import { toast } from "./ui.js";
import { renderOverlays } from "./overlays.js";
import { updateQuestionList } from "./sidebar.js";

const GRID_PX = 6;
const MIN_W_PX = 32;
const MIN_H_PX = 22;

function pointInCanvasFromClient(e){
  const rect = Dom.canvas.getBoundingClientRect();
  return {
    x: clamp(e.clientX - rect.left, 0, Dom.canvas.width),
    y: clamp(e.clientY - rect.top, 0, Dom.canvas.height)
  };
}

let activePointerId = null;
let opMode = null; // draw|move|resize
let resizeHandle = null;
let dragStart = null;
let rectStart = null;
let activeQ = null;

let startX = 0, startY = 0;
let currentRect = null;

function qToScreen(q){ return { x: q.x * State.scale, y: q.y * State.scale, w: q.w * State.scale, h: q.h * State.scale }; }
function screenToQ(r){ return { x: r.x / State.scale, y: r.y / State.scale, w: r.w / State.scale, h: r.h / State.scale }; }

function pickRectTarget(target){
  const h = target.closest?.('[data-handle]');
  if (h) return { type:"handle", qnum: parseInt(h.getAttribute('data-qnum'),10), handle: h.getAttribute('data-handle') };
  const r = target.closest?.('[data-qrect]');
  if (r) return { type:"rect", qnum: parseInt(r.getAttribute('data-qrect'),10) };
  return null;
}

function ensureBounds(r){
  r.w = clamp(r.w, MIN_W_PX, Dom.canvas.width);
  r.h = clamp(r.h, MIN_H_PX, Dom.canvas.height);
  r.x = clamp(r.x, 0, Dom.canvas.width - r.w);
  r.y = clamp(r.y, 0, Dom.canvas.height - r.h);
  return r;
}

function applyResize(handle, startRect, dx, dy){
  let {x,y,w,h} = startRect;
  if (handle.includes('e')) w += dx;
  if (handle.includes('s')) h += dy;
  if (handle.includes('w')) { x += dx; w -= dx; }
  if (handle.includes('n')) { y += dy; h -= dy; }

  if (w < MIN_W_PX) { const diff = MIN_W_PX - w; if (handle.includes('w')) x -= diff; w = MIN_W_PX; }
  if (h < MIN_H_PX) { const diff = MIN_H_PX - h; if (handle.includes('n')) y -= diff; h = MIN_H_PX; }

  x = snapPx(x, GRID_PX); y = snapPx(y, GRID_PX); w = snapPx(w, GRID_PX); h = snapPx(h, GRID_PX);
  return ensureBounds({x,y,w,h});
}

function showSelection(r){
  Dom.selectionRect.style.display = 'block';
  Dom.selectionRect.style.left = r.x + 'px';
  Dom.selectionRect.style.top = r.y + 'px';
  Dom.selectionRect.style.width = r.w + 'px';
  Dom.selectionRect.style.height = r.h + 'px';
}
function hideSelection(){ Dom.selectionRect.style.display = 'none'; }

function cancelOp(){
  opMode = null; resizeHandle = null; activePointerId = null; dragStart = null; rectStart = null; activeQ = null; currentRect = null;
  hideSelection();
}

function selectQuestion(n){
  activeQ = n;
  State.highlightQ = n;
  updateQuestionList();
  renderOverlays();
}

async function finalizeNewRect(){
  if (!currentRect) return;
  if (currentRect.w <= 30 || currentRect.h <= 20) { cancelOp(); return; }

  const num = State.questions.length + 1;
  State.questions.push({
    number: num,
    page: State.pdfDoc ? State.currentPage : 1,
    ...screenToQ(currentRect),
    correct: null
  });

  State.undoStack.push(num);
  selectQuestion(num);

  toast("Eklendi", `Soru ${num} işaretlendi.`, 1400);
  cancelOp();
}

function commitEdit(screenRect){
  const q = State.questions.find(x => x.number === activeQ);
  if (!q) return;
  const r = ensureBounds(screenRect);
  const upd = screenToQ(r);
  q.x = upd.x; q.y = upd.y; q.w = upd.w; q.h = upd.h;
  renderOverlays();
}

export function bindDraw(){
  Dom.canvasContainer.addEventListener('pointerdown', (e) => {
    if (!State.pdfDoc && !State.img) return;
    if (e.button !== 0) return;

    const picked = pickRectTarget(e.target);
    activePointerId = e.pointerId;
    Dom.canvasContainer.setPointerCapture(activePointerId);

    const p = pointInCanvasFromClient(e);

    if (picked && typeof picked.qnum === 'number') {
      const q = State.questions.find(x => x.number === picked.qnum);
      if (!q) return;
      selectQuestion(q.number);
      rectStart = qToScreen(q);
      dragStart = { x: p.x, y: p.y };
      opMode = (picked.type === "handle") ? "resize" : "move";
      resizeHandle = (picked.type === "handle") ? picked.handle : null;
      hideSelection();
      return;
    }

    opMode = "draw";
    startX = p.x; startY = p.y;
    currentRect = { x: snapPx(startX, GRID_PX), y: snapPx(startY, GRID_PX), w: 0, h: 0 };
    showSelection(currentRect);

    State.highlightQ = null;
    updateQuestionList();
    renderOverlays();
  });

  Dom.canvasContainer.addEventListener('pointermove', (e) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    const p = pointInCanvasFromClient(e);

    if (opMode === "draw") {
      const x1 = snapPx(Math.min(startX, p.x), GRID_PX);
      const y1 = snapPx(Math.min(startY, p.y), GRID_PX);
      const x2 = snapPx(Math.max(startX, p.x), GRID_PX);
      const y2 = snapPx(Math.max(startY, p.y), GRID_PX);
      currentRect = ensureBounds({ x: x1, y: y1, w: Math.max(0, x2-x1), h: Math.max(0, y2-y1) });
      showSelection(currentRect);
      return;
    }

    if ((opMode === "move" || opMode === "resize") && State.highlightQ && rectStart && dragStart) {
      const dx = p.x - dragStart.x;
      const dy = p.y - dragStart.y;

      if (opMode === "move") {
        const nx = snapPx(rectStart.x + dx, GRID_PX);
        const ny = snapPx(rectStart.y + dy, GRID_PX);
        commitEdit({ x: nx, y: ny, w: rectStart.w, h: rectStart.h });
      } else {
        const next = applyResize(resizeHandle, rectStart, dx, dy);
        commitEdit(next);
      }
    }
  });

  Dom.canvasContainer.addEventListener('pointerup', async (e) => {
    if (activePointerId === null || e.pointerId !== activePointerId) return;
    try { Dom.canvasContainer.releasePointerCapture(activePointerId); } catch {}
    activePointerId = null;

    if (opMode === "draw") { await finalizeNewRect(); return; }

    opMode = null; resizeHandle = null; dragStart = null; rectStart = null; activeQ = null;
  });

  Dom.canvasContainer.addEventListener('pointercancel', () => cancelOp());

  window.addEventListener('keydown', (e) => {
    if (e.key === "Escape" && opMode === "draw") cancelOp();
  });
}
