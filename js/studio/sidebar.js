import { State } from "./state.js";
import { Dom } from "./dom.js";
import { toast } from "./ui.js";
import { renderOverlays } from "./overlays.js";
import { clamp } from "./math.js";
import { renderPdfPage } from "./render.js";

export function updateQuestionList(){
  const list = Dom.qList;
  if (!list) return;

  if (!State.questions.length) {
    list.innerHTML = `
      <div class="glass-card" style="box-shadow:none; background: rgba(255,255,255,0.04);">
        <div class="section-title" style="margin-bottom:8px;">
          <span class="material-icons-round" style="font-size:14px">playlist_add</span> Sorular
        </div>
        <div style="font-size:12px; color:var(--muted); line-height:1.4;">
          Henüz soru işaretlemedin. Doküman üzerinde kutu çizerek başlayabilirsin.
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = State.questions.map(q => `
    <div class="q-item ${State.highlightQ === q.number ? 'active' : ''}" onclick="goToQuestion(${q.number})" title="Tıkla: göster & vurgula">
      <div style="font-size:13px;">
        <b>Soru ${q.number}</b>
        <span style="opacity:0.65; font-size:11px;">(${State.pdfDoc ? `Sayfa ${q.page}` : `Resim`})</span>
      </div>
      <button class="btn ghost icon" style="width:36px; height:34px; padding:0;" onclick="event.stopPropagation(); removeQuestion(${q.number});" title="Sil">
        <span class="material-icons-round" style="font-size:18px;">delete</span>
      </button>
    </div>
  `).join('');
}

export async function goToQuestion(n){
  const q = State.questions.find(x => x.number === n);
  if (!q) return;
  State.highlightQ = n;

  if (State.pdfDoc && State.currentPage !== q.page) {
    State.currentPage = q.page;
    await renderPdfPage(State.currentPage);
  } else {
    updateQuestionList();
    renderOverlays();
  }

  const targetY = (q.y * State.scale) - 40;
  Dom.wrapper.scrollTo({ top: clamp(targetY, 0, Dom.wrapper.scrollHeight), behavior: 'smooth' });
  toast("Vurgu", `Soru ${n} gösteriliyor.`, 1200);
}

export function removeQuestion(n){
  State.questions = State.questions.filter(q => q.number !== n).map((q,i)=>({ ...q, number:i+1 }));
  State.undoStack = State.questions.map(q => q.number);
  State.highlightQ = null;
  updateQuestionList();
  renderOverlays();
  toast("Silindi", `Soru ${n} silindi.`, 1400);
}
