// js/app.js - ACUMEN Core (Clean V2 - Default ShuffleO Fixed)

import { getPatiLevel, _getStreak, startPatiMotivation } from "./pati.js";
import { el, normalizeText, downloadBlob, formatTime } from "./utils.js";
import { parseExam, readFileAsText } from "./parser.js";
import { applyShuffle } from "./shuffle.js";
import { createTimer } from "./timer.js";
import { saveState, loadState, clearSaved } from "./storage.js";
import { addToWrongBookFromExam, buildWrongOnlyParsed, exportWrongBook, clearWrongBook, wrongBookStats, wrongBookDashboard, getSrsInfoForParsed, setSrsQualityByQuestion } from "./wrongBook.js";
import {
  setStatus, showWarn, setLoading, showToast, bindAlertGlobals,
  updateModeUI, updateStats, buildNav, refreshNavColors,
  renderFocusMiniNav, refreshFocusMiniNav,
  renderExam, attachKeyboardShortcuts,
  openSummaryModal, closeSummaryModal,
  openSrsModal, closeSrsModal,
  initTheme,
  generateAnswerKeyWithGemini,
} from "./ui.js";
// AI Fonksiyonları
import { runGeminiAnalysis, runGeminiGenerator, updateAiKeyBadges, ensureGeminiKeyOnEntry } from "./ui/ai.js";

import { initOnboarding } from "./ui/onboarding.js";
import { initOpenEndedPro } from "./openEndedPro/examHookOpenEnded.js";

import { listMyDriveBooklets, listFolderBooklets, fetchDriveFileAsFileOrText } from "./drive.js";
import { bindRenderContext, paintAll } from "./app/render.js";
import { createExamFlow } from "./app/examFlow.js";
import { bindEvents } from "./app/events.js";
import { installSrsBridge } from "./app/srsBridge.js";
import { createFocusHelpers } from "./app/focus.js";

// Generated practice session history
import { addSession, updateSession, listSessions, getSession, deleteSession } from "./app/sessionStore.js";

import { initNotesTab } from "./aiPractice/practiceUI.js";


// js/app.js - İmza (only when debug is enabled)
try {
  if (typeof window !== 'undefined' && window.ACUMEN_DEBUG) {
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
  }
} catch (e) {}

// Window'a AI fonksiyonlarını bağla
// Alerts/toasts/status globals (legacy compatibility)
try { bindAlertGlobals(); } catch (e) {}
// AI readiness indicators (badge + settings pill)
try { updateAiKeyBadges(); } catch (e) {}
// After login: prompt for Gemini key (after welcome/version modals)
try{
  window.addEventListener("acumen:auth", (ev)=>{
    if (ev?.detail?.state === "in") {
      try { ensureGeminiKeyOnEntry(); } catch {}
    }
  });
} catch(e) {}


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

  // generated practice linkage (runtime)
  _parentSnapshot: null,
  _parentExamId: null,
  _parentBaseline: null,
  lastPracticeDelta: null,
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
    showWarn({id:"TIME_UP_AUTO_FINISH"});
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
    overlay.removeAttribute("inert");
    overlay.setAttribute("aria-hidden","false");
    overlay.style.display = "flex";
    try{ const b = document.getElementById("btnResume") || document.getElementById("btnDiscardResume"); b?.focus?.(); }catch(_){ }

    const close = () => {
      try{
        // If focus is inside the modal, blur it first to avoid aria-hidden warnings.
        const ae = document.activeElement;
        if (ae && overlay.contains(ae)) {
          try{ ae.blur(); }catch(_){}
        }

        // Prefer moving focus to a stable control outside the modal.
        const safe = document.getElementById("btnStart")
          || document.getElementById("btnParse")
          || document.querySelector("[data-focus-safe]")
          || document.body;
        if (safe && typeof safe.focus === "function") safe.focus();
      }catch(_){}

      // Make modal non-interactive + hidden
      try{ overlay.setAttribute("inert",""); }catch(_){}
      overlay.style.display = "none";
      overlay.setAttribute("aria-hidden","true");
    };

    const doDiscard = () => {
      close();
      clearSaved();
      resetAll();
      showToast?.({ id:"RESUME_DISCARDED", kind:"warn" });
    };

    const doResume = () => {
      close();
      Object.assign(state, d);
      state.answers = new Map(d.answersArr || []);
      startExam({ resume:true });
      showToast?.({ id:"RESUME_CONTINUED", kind:"ok" });
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
} = createExamFlow((() => {
  const ctx = {
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
};
  try{ initOpenEndedPro(ctx); }catch(e){ console.error(e); }
  return ctx;
})()));;

// ================= GENERATED PRACTICE (from Open-Ended improvements) =================
function _safeJsonClone(obj){
  try { return JSON.parse(JSON.stringify(obj)); } catch { return null; }
}

function _answersMapToObj(m){
  try {
    if (!(m instanceof Map)) return (m && typeof m === 'object') ? m : {};
    const o = {};
    for (const [k,v] of m.entries()) o[String(k)] = v;
    return o;
  } catch { return {}; }
}

function _computeRubricAveragesFromAnswers(answersObj){
  // answersObj: { [n]: {__type:'open-ended', parts:{...}} }
  const sums = new Map();
  const counts = new Map();
  try {
    const keys = Object.keys(answersObj || {});
    for (const n of keys){
      const a = answersObj[n];
      if (!a || a.__type !== 'open-ended') continue;
      const parts = a.parts || {};
      for (const pk of Object.keys(parts)){
        const g = parts[pk]?.grade;
        const subs = g?.subscores;
        if (!subs || typeof subs !== 'object') continue;
        for (const [k,v] of Object.entries(subs)){
          const num = Number(v);
          if (!Number.isFinite(num)) continue;
          sums.set(k, (sums.get(k)||0) + num);
          counts.set(k, (counts.get(k)||0) + 1);
        }
      }
    }
  } catch {}
  const out = {};
  for (const [k,sum] of sums.entries()){
    const c = counts.get(k)||0;
    if (c) out[k] = Math.round((sum / c) * 10) / 10;
  }
  return out;
}

function _makeGeneratedParsedFromPracticeSet(practiceSet, { title = "Gelişim Pratiği" } = {}){
  const qs = (practiceSet || []).map((it, idx) => {
    const qText = String(it?.question || it?.text || "").trim();
    return {
      n: idx + 1,
      kind: "openEndedPro",
      text: qText,
      subject: it?.focus || it?.topic || "Pratik",
      meta: it?.meta || {},
      // Ensure openEndedPro UI can inject (needs parts)
      openEnded: {
        scenario: "",
        caseText: "",
        subQuestion: { id: String(idx + 1), text: qText },
        total: 1,
        index: 1,
      },
    };
  }).filter(q => q.text);
  return {
    title,
    questions: qs,
    answerKey: {},
    keyCount: 0,
    meta: { keySource: 'none', keyCoverage: 0 }
  };
}

function _startGeneratedPracticeSession(payload){
  try {
    const practiceSet = payload?.practiceSet || [];
    if (!Array.isArray(practiceSet) || !practiceSet.length) {
      showToast?.({ kind:"warn", id:"PRACTICE_SET_EMPTY", text:"Pratik seti boş." });
      return;
    }

    // Snapshot current exam to return later (runtime only)
    const snapshot = {
      rawText: state.rawText,
      parsed: _safeJsonClone(state.parsed),
      answersObj: _answersMapToObj(state.answers),
      questionTimesArr: Array.from(state.questionTimes?.entries?.() || []),
      startedAt: state.startedAt,
      durationSec: state.durationSec,
      timeLeftSec: state.timeLeftSec,
      shuffleQ: state.shuffleQ,
      shuffleO: state.shuffleO,
      mode: state.mode,
      openEndedScore: _safeJsonClone(state.openEndedScore),
      examScore: _safeJsonClone(state.examScore),
    };

    // Parent identifiers
    const parentExamId = String(state.parsed?.meta?.examId || state.parsed?.meta?.sourceId || "") || `exam_${Date.now()}`;
    const baselinePct = Number(state.openEndedScore?.pct);
    const baselineRubric = _computeRubricAveragesFromAnswers(snapshot.answersObj);

    state._parentSnapshot = snapshot;
    state._parentExamId = parentExamId;
    state._parentBaseline = {
      pct: Number.isFinite(baselinePct) ? baselinePct : null,
      rubricAvg: baselineRubric,
      openEndedScore: snapshot.openEndedScore || null,
      title: snapshot.parsed?.title || "",
    };
    state.lastPracticeDelta = null;

    // Build generated parsed (openEndedPro questions)
    const genParsed = _makeGeneratedParsedFromPracticeSet(practiceSet, { title: payload?.title || "Gelişim Pratiği" });
    genParsed.meta = genParsed.meta || {};
    genParsed.meta.generatedPractice = true;
    genParsed.meta.parentExamId = parentExamId;
    genParsed.meta.parentExamTitle = snapshot.parsed?.title || "";
    genParsed.meta.baselinePct = state._parentBaseline.pct;
    genParsed.meta.baselineRubricAvg = state._parentBaseline.rubricAvg;
    genParsed.meta.generator = payload?.generator || payload?.generatedFrom?.generator || null;
    genParsed.meta.examId = `gp_${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Switch state to new session
    state.parsed = genParsed;
    state.rawText = "";
    state.answers = new Map();
    state.questionTimes = new Map();
    state.startedAt = null;
    state.timeLeftSec = null;
    state.mode = "prep";
    state.openEndedScore = null;
    state.examScore = null;

    syncGlobals();
    paintAll();
    persist();

    // Start immediately
    startExam({ resume:false });

    try { showToast?.({ kind:"ok", id:"PRACTICE_STARTED", text:"Gelişim pratiği başlatıldı." }); } catch {}
  } catch (e) {
    console.error(e);
    try { showToast?.({ kind:"warn", id:"PRACTICE_START_FAILED", text:"Pratik başlatılamadı." }); } catch {}
  }
}

// Expose to AI modal
try {
  window.__ACUMEN_START_GENERATED_PRACTICE = _startGeneratedPracticeSession;
  window.__ACUMEN_SESSIONS_LIST = listSessions;
  window.__ACUMEN_SESSIONS_GET = getSession;
  window.__ACUMEN_SESSIONS_ADD = addSession;
  window.__ACUMEN_SESSIONS_UPDATE = updateSession;
  window.__ACUMEN_SESSIONS_DELETE = deleteSession;
} catch {}

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
setStatus({ id:"STATUS_READY" }); 

// First-run onboarding tour
try { initOnboarding(); } catch (e) {}
    

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
                } catch (err) { 
                    // Log kaldırıldı
                }
                
                // Yedek temizlik (app.js'deki saveState key'i genelde 'acumen_state' olur)
                localStorage.removeItem('acumen_state'); 
                localStorage.removeItem('sinav_replay_key');

                // ✅ EK: SessionStorage temizliği (scratchpad + emin değilim)
                try { 
                    // Eğer global reset fonksiyonların varsa (UI+store birlikte temizlesin)
                    window.resetScratchpad?.({ silent:true }); 
                } catch (e) {}

                try { sessionStorage.removeItem('ACUMEN_SCRATCHPAD_V1'); } catch (e) {}
                try { sessionStorage.removeItem('ACUMEN_UNSURE_V1'); } catch (e) {}

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

