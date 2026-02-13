// js/app.js - ACUMEN Core (Clean V2 - Default ShuffleO Fixed)

import { getPatiLevel, _getStreak, startPatiMotivation } from "./pati.js";
import { el, normalizeText, downloadBlob, formatTime } from "./utils.js";
import { parseExam, readFileAsText } from "./parser.js";
import { applyShuffle } from "./shuffle.js";
import { createTimer } from "./timer.js";
import { saveState, loadState, clearSaved } from "./storage.js";
import { addToWrongBookFromExam, buildWrongOnlyParsed, exportWrongBook, clearWrongBook, wrongBookStats, wrongBookDashboard, getSrsInfoForParsed, setSrsQualityByQuestion } from "./wrongBook.js";
import {
  setStatus, showWarn, setLoading, showToast,
  updateModeUI, updateStats, buildNav, refreshNavColors,
  renderFocusMiniNav, refreshFocusMiniNav,
  renderExam, attachKeyboardShortcuts,
  openSummaryModal, closeSummaryModal,
  openSrsModal, closeSrsModal,
  initTheme,
  generateAnswerKeyWithGemini,
} from "./ui.js";
// AI Fonksiyonları
import { runGeminiAnalysis, runGeminiGenerator } from "./ui/ai.js";

import { listMyDriveBooklets, listFolderBooklets, fetchDriveFileAsFileOrText } from "./drive.js";
import { bindRenderContext, paintAll } from "./app/render.js";
import { createExamFlow } from "./app/examFlow.js";
import { bindEvents } from "./app/events.js";
import { installSrsBridge } from "./app/srsBridge.js";
import { createFocusHelpers } from "./app/focus.js";

import { initNotesTab } from "./aiPractice/practiceUI.js";


// js/app.js - İmza

console.log(
    "%c ACUMEN %c v1.3 - Clean ",
    "background:#a855f7; color:white; font-weight:bold; padding:4px 8px; border-radius:4px 0 0 4px;",
    "background:#3b82f6; color:white; font-weight:bold; padding:4px 8px; border-radius:0 4px 4px 0;"
);

console.log(
    "%c👨‍💻 Developed by Aykut Cevizci",
    "color: #a855f7; font-family: monospace; font-size: 14px; font-weight: bold;"
);

console.log(
    "%c Bu uygulama sevgi ve kod ile yapılmıştır. ❤️",
    "color: #71717a; font-size: 11px;"
);

// Window'a AI fonksiyonlarını bağla
if (typeof window !== 'undefined') {
    window.runGeminiAnalysis = runGeminiAnalysis;
    window.runGeminiGenerator = runGeminiGenerator;
}

// ================= SUMMARY: SUBJECT BREAKDOWN (VISUAL CHART INJECTOR) =================
// Bu kısım UI/Görselleştirme yaması olduğu için burada kalabilir veya ui.js'e taşınabilir.
// Şimdilik görsel bütünlüğü bozmamak için burada tutuyoruz.
function ensureSummarySubjectBreakdown(parsed){
  try{
    if (!parsed?.questions?.length) return;

    const overlay = document.getElementById("summaryModal");
    if (!overlay) return;

    const card = overlay.querySelector(".modalCard") || overlay.querySelector(".modal") || overlay.firstElementChild;
    if (!card) return;

    if (card.querySelector("#summarySubjectBreakdown")) return;

    const getSub = (q)=>{
      const direct = (q && q.subject != null) ? String(q.subject).trim() : "";
      if (direct) return direct;
      const t = q && q.text ? String(q.text) : "";
      const m = t.match(/^\[(.*?)\]\s*/);
      if (m && m[1]) return String(m[1]).trim() || "Genel";
      return "Genel";
    };

    const counts = new Map();
    for (const q of parsed.questions){
      const s = getSub(q);
      counts.set(s, (counts.get(s)||0) + 1);
    }

    const total = parsed.questions.length || 1;
    const rows = [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 14);

    const wrap = document.createElement("div");
    wrap.id = "summarySubjectBreakdown";
    wrap.style.marginTop = "16px";
    wrap.style.paddingTop = "14px";
    wrap.style.borderTop = "1px solid var(--border)";

    wrap.innerHTML = `<div style="font-weight:700; margin-bottom:12px; font-size:14px;">📊 Konu Dağılımı</div>`;

    for (const [sub, c] of rows){
      const pct = Math.round((c/total)*100);
      let hash = 0;
      for (let i = 0; i < sub.length; i++) hash = sub.charCodeAt(i) + ((hash << 5) - hash);
      const h = Math.abs(hash % 360);
      const color = `hsl(${h}, 70%, 60%)`;

      const barHtml = `
        <div style="margin-bottom: 10px;">
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px; color:var(--text);">
            <span style="font-weight:500; opacity:0.9;">${sub}</span>
            <span style="opacity:0.7;">${c} soru (%${pct})</span>
          </div>
          <div style="height:6px; background:rgba(128,128,128,0.15); border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${pct}%; background:${color}; border-radius:3px; transition: width 0.5s ease;"></div>
          </div>
        </div>
      `;
      wrap.innerHTML += barHtml;
    }

    if (!card.querySelector("#aiSubjectPanelMount")){
      const mount = document.createElement("div");
      mount.id = "aiSubjectPanelMount";
      mount.style.marginTop = "12px";
      wrap.appendChild(mount);
    }

    card.appendChild(wrap);
  } catch {}
}

(function watchSummaryModal(){
  try{
    const overlay = document.getElementById("summaryModal");
    if (!overlay || overlay.__subjectWatch) return;
    overlay.__subjectWatch = true;

    const run = ()=> ensureSummarySubjectBreakdown(window.__APP_STATE?.parsed);

    const obs = new MutationObserver(() => {
      const shown = overlay.style.display !== "none" && overlay.getAttribute("aria-hidden") !== "true";
      if (shown) setTimeout(run, 0);
    });
    obs.observe(overlay, { attributes:true, attributeFilter:["style","aria-hidden","class"] });

    setTimeout(run, 0);
  }catch{}
})();

/* ================= SAFE DOM ================= */
window.el = id => document.getElementById(id);

let safeStyle = null;
let applyFocusMode = null;
let scrollToQuestion = null;
let updateFocusHUD = null;
let setupQuestionObserver = null;

/* ================= STATE ================= */
const state = {
  activeQn: 1,
  navPage: 0,
  rawText: "",
  parsed: null,
  mode: "prep",
  answers: new Map(),
  startedAt: null,
  durationSec: 20*60,
  timeLeftSec: null,
  shuffleQ: true,
  shuffleO: false, // 🔥 GÜNCELLEME: Başlangıçta pasif
  questionTimes: new Map(), 
  lastActionAt: null,       

  srsReview: false,
  srsInfo: {},
  lastReviewId: null,
};

// ---- focus/nav helpers ----
({
  safeStyle,
  applyFocusMode,
  scrollToQuestion,
  updateFocusHUD,
  setupQuestionObserver,
} = createFocusHelpers({
  state,
  el,
  renderExam,
  refreshFocusMiniNav,
  renderFocusMiniNav,
}));

/* ================= EXAM FLOW ================= */
// createExamFlow artık güncellenmiş finishExam'i içeriyor
let doParse, startExam, finishExam, resetAll;

/* ================= TIMER ================= */
const timer = createTimer({
  onTick: () => { persist(); updateFocusHUD(); },
  onDone: () => {
    showWarn("⏰ Süre doldu. Sınav otomatik bitirildi.");
    try { finishExam?.(); } catch (e) { console.error(e); }
  }
});

bindRenderContext({ state, setupQuestionObserver, updateFocusHUD });

function persist(){
  saveState({
    rawText: state.rawText,
    parsed: state.parsed,
    mode: state.mode,
    answersArr: [...state.answers.entries()],
    startedAt: state.startedAt,
    durationSec: state.durationSec,
    timeLeftSec: state.timeLeftSec,
    shuffleQ: state.shuffleQ,
    shuffleO: state.shuffleO,
  });
}

// ---- SRS subject bridge ----
installSrsBridge({
  state,
  timer,
  paintAll,
  persist,
  showWarn,
  showToast,
  buildWrongOnlyParsed,
  applyShuffle,
});

/* ================= RESTORE ================= */
function restore(){
  const d = loadState();
  if (!d) return;

  if (d.parsed && d.mode === "exam"){
    const overlay = document.getElementById("resumeModal");
    if (!overlay) return;
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden","false");

    const close = () => {
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden","true");
    };

    const doDiscard = () => {
      close();
      clearSaved();
      resetAll();
      showToast?.({ title:"Sıfırlandı", msg:"Kayıt silindi.", kind:"warn" });
    };

    const doResume = () => {
      close();
      Object.assign(state, d);
      state.answers = new Map(d.answersArr || []);
      startExam({ resume:true });
      showToast?.({ title:"Devam", msg:"Kaldığın yerden devam ediyorsun.", kind:"ok" });
    };

    { const b = document.getElementById("btnCloseResume"); if (b) b.onclick = close; }
    { const b = document.getElementById("btnDiscardResume"); if (b) b.onclick = doDiscard; }
    { const b = document.getElementById("btnResume"); if (b) b.onclick = doResume; }
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
    return;
  }

  Object.assign(state, d);
  state.answers = new Map(d.answersArr || []);
}


function syncGlobals(){
  window.__APP_STATE = state;
  window.__APP_TIMER = timer;
  window.__APP_PAINT_ALL = paintAll;
  window.__APP_PERSIST = persist;
}

// ---- exam flow bindings ----
({
  doParse,
  startExam,
  finishExam,
  resetAll,
} = createExamFlow({
  state,
  timer,
  el,
  safeStyle,
  applyFocusMode,
  normalizeText,
  readFileAsText,
  parseExam,
  applyShuffle,
  formatTime,
  addToWrongBookFromExam,
  buildWrongOnlyParsed,
  getSrsInfoForParsed,
  setStatus,
  showWarn,
  setLoading,
  openSummaryModal,
  closeSummaryModal,
  showToast,
  syncGlobals,
  persist,
  paintAll,
}));

/* ================= EVENTS ================= */
bindEvents({
  state,
  el,
  safeStyle,
  applyFocusMode,
  scrollToQuestion,

  doParse,
  startExam,
  finishExam, // Artık orijinal modülden gelen güncel fonksiyon
  resetAll,

  paintAll,
  persist,

  showWarn,
  showToast,
  setLoading,
  generateAnswerKeyWithGemini,
  refreshNavColors,
  attachKeyboardShortcuts,

  buildWrongOnlyParsed,
  applyShuffle,
  wrongBookDashboard,
  exportWrongBook,
  clearWrongBook,
  openSrsModal,
  setSrsQualityByQuestion,

  listMyDriveBooklets,
  listFolderBooklets,
  fetchDriveFileAsFileOrText,
});

// ================= NOTES (AI Practice) =================
try {
  initNotesTab({
    state,
    setLoading,
    showToast,
    showWarn,
    applyShuffle,
    startExam,
    paintAll,
    persist,
    listMyDriveBooklets,
    listFolderBooklets,
    fetchDriveFileAsFileOrText,
  });
} catch (e) { console.error('Notes init error', e); }

/* ================= INIT ================= */
initTheme();           
startPatiMotivation(); 
restore();             
setStatus("hazır");    

(function handleReportReplay(){
  try {
    if (!location.hash || !/replay=1/.test(location.hash)) return;
    const key = localStorage.getItem('sinav_replay_key');
    if (!key) return;
    localStorage.removeItem('sinav_replay_key');

    const base = buildWrongOnlyParsed({ keys: [key], limit: 1, onlyDue: false, fallbackAll: true });
    if (!base) return;
    state.parsed = applyShuffle(base, { shuffleQ:false, shuffleO:false });
    state.mode = 'prep';
    state.answers.clear();
    history.replaceState(null, "", location.pathname + location.search);
  } catch (e) { }
})();

paintAll();
// Override kodları silindi, artık temiz.

// 🚨🚨 LOGO RELOAD (Özel Tasarım Modal + Tam Sıfırlama) 🚨🚨
const brandLogo = document.getElementById('brandLogo');
if (brandLogo) {
    brandLogo.onclick = (e) => {
        // Varsa açık kalan eski modalı temizle
        const old = document.getElementById('customReloadModal');
        if (old) old.remove();

        // Yeni Modalı Yarat (Senin CSS sınıflarını kullanır: modalOverlay, modalCard)
        const modal = document.createElement('div');
        modal.id = 'customReloadModal';
        modal.className = 'modalOverlay'; 
        modal.style.display = 'flex';     
        modal.style.zIndex = '100000'; // En üstte dursun
        
        modal.innerHTML = `
            <div class="modalCard" style="max-width: 380px; text-align: center; animation: popIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);">
                <div style="font-size: 42px; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(168,85,247,0.4));">↻</div>
                
                <h3 class="modalTitle" style="margin-bottom: 8px; font-size: 20px;">Sıfırdan Başla?</h3>
                
                <p class="modalSub" style="margin-bottom: 24px; line-height: 1.5; color: #a1a1aa; font-size: 14px;">
                    Sayfa yenilenecek. Mevcut sınav ilerlemen ve yüklediğin dosyalar <b>silinecek</b>.
                </p>
                
                <div class="modalActions" style="justify-content: center; gap: 12px; width: 100%;">
                    <button id="btnCancelReload" class="btn secondary" style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">Vazgeç</button>
                    <button id="btnConfirmReload" class="btn primary" style="flex:1; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);">Evet, Yenile</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);

        // BUTON İŞLEVLERİ
        // 1. Vazgeç
        document.getElementById('btnCancelReload').onclick = () => {
            modal.style.opacity = "0";
            setTimeout(() => modal.remove(), 200);
        };
        
        // 2. Evet, Yenile (Tam Temizlik)
        document.getElementById('btnConfirmReload').onclick = () => {
            // Kullanıcıya geri bildirim ver
            const btn = document.getElementById('btnConfirmReload');
            btn.textContent = "Temizleniyor...";
            btn.style.opacity = "0.7";

            setTimeout(() => {
                // A. Uygulama hafızasını (LocalStorage) temizle
                try { 
                    if (typeof clearSaved === 'function') clearSaved(); 
                } catch (err) { console.log(err); }
                
                // Yedek temizlik (app.js'deki saveState key'i genelde 'acumen_state' olur)
                localStorage.removeItem('acumen_state'); 
                localStorage.removeItem('sinav_replay_key');

                // B. Sayfayı yenile
                window.location.reload();
            }, 300);
        };
        
        // Dışarı tıklayınca kapatma
        modal.onclick = (ev) => {
            if (ev.target === modal) {
                modal.style.opacity = "0";
                setTimeout(() => modal.remove(), 200);
            }
        };
    };
}