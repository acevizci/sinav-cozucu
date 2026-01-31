import { el, normalizeText, downloadBlob, formatTime } from "./utils.js";
import { parseExam, readFileAsText } from "./parser.js";
import { applyShuffle } from "./shuffle.js";
import { createTimer } from "./timer.js";
import { saveState, loadState, clearSaved } from "./storage.js";
import { addToWrongBookFromExam, buildWrongOnlyParsed, exportWrongBook, clearWrongBook, wrongBookStats, wrongBookDashboard, getSrsInfoForParsed, setSrsQualityByQuestion } from "./wrongBook.js";
// app.js - En üst satır (Eklendi: initTheme)
import {
  setStatus, showWarn, showToast, setLoading,
  updateModeUI, updateStats, buildNav, refreshNavColors,
  renderFocusMiniNav, refreshFocusMiniNav,
  renderExam, attachKeyboardShortcuts,
  openSummaryModal, closeSummaryModal,
  openSrsModal, closeSrsModal,
  initTheme,
  generateAnswerKeyWithGemini,
} from "./ui.js";
import { startPatiMotivation } from "./pati.js";


// js/app.js - İmza

console.log(
    "%c ACUMEN %c v1.2 ",
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


// ================= SRS: Konu bazlı tekrar başlatıcı (GLOBAL) =================
// ui.js içindeki konu chip'leri bunu çağırıyor:
// window.startSrsBySubject(sub)  :contentReference[oaicite:2]{index=2}

// Basit subject çıkarımı: q.subject öncelikli; yoksa "[Konu]" prefix; yoksa "Genel"
function __getSubject(q){
  const direct = (q && q.subject != null) ? String(q.subject).trim() : "";
  if (direct) return direct;

  const t = q && q.text ? String(q.text) : "";
  const m = t.match(/^\[(.*?)\]\s*/);
  if (m && m[1]) return String(m[1]).trim() || "Genel";
  return "Genel";
}

window.startSrsBySubject = function(subject, opts = {}){
  const state = window.__APP_STATE;          // <-- KRİTİK
  const timer = window.__APP_TIMER;          // <-- opsiyonel (aşağıda nasıl set edeceğiz)
  const paintAll = window.__APP_PAINT_ALL;   // <-- opsiyonel
  const persist  = window.__APP_PERSIST;     // <-- opsiyonel

  if (!state){
    showWarn?.("Uygulama state yok (window.__APP_STATE).");
    return;
  }

  const sub = String(subject || "Genel").trim() || "Genel";
  const limit = Number(opts.limit ?? 80);

  const base = buildWrongOnlyParsed({ limit, onlyDue: true, fallbackAll: true });
  if (!base?.questions?.length){
    showWarn?.("Yanlış Defteri boş");
    return;
  }

  const filteredQs = base.questions.filter(q => __getSubject(q) === sub);

  let qs = filteredQs;
  if (!qs.length){
    const baseAll = buildWrongOnlyParsed({ limit: 300, onlyDue: false, fallbackAll: true });
    qs = (baseAll?.questions || []).filter(q => __getSubject(q) === sub).slice(0, limit);
  }

  if (!qs.length){
    showWarn?.(`"${sub}" için tekrar sorusu yok.`);
    return;
  }

  const parsed = {
    ...base,
    title: `Tekrar (SRS) - ${sub}`,
    questions: qs,
    answerKey: base.answerKey || {},
    meta: { ...(base.meta || {}), keySource: base?.meta?.keySource || "none" },
  };

  state.parsed = applyShuffle(parsed, { shuffleQ: true, shuffleO: true });
  state.mode = "prep";
  state.answers.clear();

  try { timer?.stop?.(); } catch {}
  try { paintAll?.(); } catch {}
  try { persist?.(); } catch {}

  showToast?.({ title:"SRS", msg:`"${sub}" tekrarı hazır (${qs.length} soru)`, kind:"ok" });
};


/* ================= SAFE DOM ================= */
window.el = id => document.getElementById(id);

// Bunu dosyanın en üstüne, importların altına ekle:
function safeBind(id, handler) {
    const element = document.getElementById(id);
    if (element) {
        element.onclick = handler;
    }
}

function safeStyle(id, fn){
  const e = el(id);
  if (e) fn(e);
}

function applyFocusMode(on){
  const fb = document.getElementById("focusBar");
  if (on){
    document.body.classList.add("focusMode");
    if (fb) fb.style.display = "flex";
  } else {
    document.body.classList.remove("focusMode");
    if (fb) fb.style.display = "none";
  }
  // Mini nav UI update
  renderFocusMiniNav?.(state);
}

/* ================= FOCUS HUD (progress) ================= */
let __qObs = null;
let __activeQ = null;

function setActiveQuestion(n) {
  state.activeQn = n;
  // Keep a single active marker (optional, subtle)
  document.querySelectorAll('.q.active').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.q[data-q="${n}"]`);
  if (el) el.classList.add('active');
}

// Focus mini-nav uses this to jump to a question.
// Rules:
// - 20 questions per page
// - Active dot = current question
// - After selecting an answer, app.js will auto-advance; this helper must not break that.
function scrollToQuestion(qn, opts = {}) {
  const total = state.parsed?.questions?.length || 0;
  if (!total) return;

  let n = Number(qn);
  if (!Number.isFinite(n)) return;
  n = Math.max(1, Math.min(total, Math.round(n)));

  // Ensure paging is consistent: 1 page = 20 questions
  const perPage = 20;
  const page = Math.floor((n - 1) / perPage);
  if (state.navPage !== page) state.navPage = page;

  // Re-render if needed (e.g., page changed)
  // renderExam is idempotent; cost is small.
  renderExam(state);

  setActiveQuestion(n);

  const el = document.querySelector(`.q[data-q="${n}"]`);
  if (el) {
    const behavior = opts.instant ? 'auto' : 'smooth';
    el.scrollIntoView({ behavior, block: 'start' });
  }

  // Keep nav colors in sync
  refreshFocusMiniNav(state);
}


function updateFocusHUD() { /* HUD removed */ }

function setupQuestionObserver() { /* observer disabled - use nav */ }

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
  shuffleO: true,

  // SRS / Review
  srsReview: false,
  srsInfo: {},
  lastReviewId: null,
};

/* ================= TIMER ================= */
const timer = createTimer({
  onTick: () => { persist(); updateFocusHUD(); },
  onDone: () => {
    showWarn("⏰ Süre doldu. Sınav otomatik bitirildi.");
    finishExam();
  }
});


/* ===== MULTI-ANSWER HELPERS ===== */
function toLetterSet(v){
  if (!v) return new Set();
  if (Array.isArray(v)) return new Set(v.map(x=>String(x).toUpperCase()));
  return new Set([String(v).toUpperCase()]);
}
function setsEqual(a,b){
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/* ================= SUMMARY ================= */
function updateSummary(){
  if (!state.parsed) return;

  const total = state.parsed.questions.length;
  const answered = state.answers.size;

  let correct = 0;
  for (const q of state.parsed.questions){
    const chosenLetter = state.answers.get(q.n);
    const correctId = state.parsed.answerKey[q.n];
    if (!chosenLetter || !correctId) continue;

    const chosenSet = toLetterSet(chosenLetter);
    const correctSet = toLetterSet(correctId);
    if (chosenSet.size && correctSet.size && setsEqual(chosenSet, correctSet)) correct++;
  }

  const score = total ? Math.round((correct/total)*100) : 0;

  // (Eski navSummary kaldırıldı; ids yoksa sessizce geç)
  const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  set("sumQ", total);
  set("sumA", answered);
  set("sumC", correct);
  set("sumS", score);
}

/* ================= MOD A UI (AI Key) ================= */
function updateAiSolveUI(){
  const wrap = el("aiSolveWrap");
  if (!wrap) return;
  const parsed = state.parsed;
  if (!parsed){ wrap.style.display = "none"; return; }

  const totalQ = parsed.questions?.length || 0;
  const keyCount = parsed.keyCount || 0;
  const cov = parsed.meta?.keyCoverage ?? (totalQ ? keyCount/totalQ : 0);

  // show AI solve if key is missing or partial (coverage < 95%) and we're not already on AI key
  const isAi = parsed.meta?.keySource === "ai";
  const shouldShow = (totalQ > 0) && !isAi && (keyCount === 0 || cov < 0.95);
  wrap.style.display = shouldShow ? "block" : "none";
}

/* ================= SAVE ================= */
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

/* ================= RESTORE ================= */
function restore(){
  const d = loadState();
  if (!d) return;

  // yarım kalan sınav varsa önce sor
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

    document.addEventListener("keydown", function esc(e){
      if (e.key === "Escape"){ close(); document.removeEventListener("keydown", esc); }
    });

    return;
  }

  Object.assign(state, d);
  state.answers = new Map(d.answersArr || []);
}

/* ================= PARSE ================= */
async function doParse({ autoStartHint=true } = {}){
  try{
    showWarn("");
    setStatus("okunuyor...");
    setLoading(true, "Ayrıştırılıyor…");

    const file = el("fileInput").files?.[0];
    const pasted = el("pasteArea").value;
    const text = file ? await readFileAsText(file) : pasted;
    if (!normalizeText(text)) throw new Error("Metin yok");

    state.rawText = text;
    state.shuffleQ = el("shuffleQ").checked;
    state.shuffleO = el("shuffleO").checked;

    const base = parseExam(text);
    state.parsed = applyShuffle(base, { shuffleQ: state.shuffleQ, shuffleO: state.shuffleO });

    // Key coverage meta (0..1). PDF'lerde anahtar tamamen veya kısmen eksik olabiliyor.
    {
      const totalQ = state.parsed?.questions?.length || 0;
      const keyCount = state.parsed?.keyCount || 0;
      state.parsed.meta = state.parsed.meta || {};
      state.parsed.meta.keyCoverage = totalQ ? (keyCount / totalQ) : 0;
      // keySource: 'doc' (dosyadan) varsayımı; AI üretince 'ai' yapılacak.
      if (!state.parsed.meta.keySource) state.parsed.meta.keySource = keyCount ? "doc" : "none";
    }

    state.mode = "prep";
    state.answers.clear();
    timer.stop();
    safeStyle("timer", e => e.textContent="--:--");

    setStatus("hazır");
    syncGlobals();
	paintAll();
	persist();
	paintAll();
    persist();

    const as = el("autoStart");
    if (autoStartHint && as && as.checked){
      startExam();
    } else {
      showToast?.({ title:"Hazır", msg:"Sınav ayrıştırıldı.", kind:"ok" });
    }
  }
  catch(e){
    setStatus("hata");
    showWarn(e.message);
  }
  finally{
    setLoading(false);
  }
}

/* ================= EXAM FLOW ================= */
function startExam({ resume=false } = {}){
  if (!state.parsed) return;

  state.mode = "exam";
  syncGlobals();
  if (!state.startedAt) state.startedAt = new Date().toISOString();

  state.durationSec = Number(el("durationMin").value) * 60;

  if (!resume){
    state.timeLeftSec = state.durationSec;
  } else {
    if (state.timeLeftSec == null) state.timeLeftSec = state.durationSec;
  }

  timer.start(() => state.timeLeftSec, v => state.timeLeftSec = v);

  const fm = el("focusMode");
  applyFocusMode(!!(fm && fm.checked));

  paintAll();
  persist();
}

function finishExam(){
  if (!state.parsed) return;

  state.mode = "result";
  syncGlobals();
  timer.stop();
  applyFocusMode(false);

  // SRS review session id (needed for SM-2 override buttons)
  state.srsReview = /Tekrar \(SRS\)/i.test(state.parsed.title || "");
  state.lastReviewId = state.srsReview ? (new Date().toISOString()) : null;

  addToWrongBookFromExam({ parsed: state.parsed, answersMap: state.answers, reviewId: state.lastReviewId });
  state.srsInfo = state.srsReview ? getSrsInfoForParsed(state.parsed) : {};

  const total = state.parsed.questions.length;

  let answered = 0;
  let correct = 0;
  let wrong = 0;
  let blank = 0;
  let keyMissing = 0;

  for (const q of state.parsed.questions){
    const chosenLetter = state.answers.get(q.n);
    const correctId = state.parsed.answerKey[q.n];

    if (!correctId) keyMissing++;

    if (!chosenLetter){
      blank++;
      continue;
    }
    answered++;

    if (!correctId) continue;

    const chosenSet = toLetterSet(chosenLetter);
    const correctSet = toLetterSet(correctId);
    if (chosenSet.size && correctSet.size && setsEqual(chosenSet, correctSet)) correct++;
    else wrong++;
  }

  const denom = total - keyMissing;
  // Eğer hiç anahtar yoksa skor hesaplanamaz.
  // Anahtar kısmi ise, skoru sadece anahtarı olan sorular üzerinden hesapla.
  const score = denom > 0 ? Math.round((correct/denom)*100) : null;

  const spent = state.durationSec - (state.timeLeftSec ?? state.durationSec);
  const timeSpent = formatTime(spent);

  paintAll();
  persist();

  openSummaryModal?.({
    total, answered, correct, score,
    wrong, blank, keyMissing, timeSpent,
    title: state.parsed.title,
    isAiKey: state.parsed?.meta?.keySource === "ai",
  });

  showToast?.({ title:"Bitti", msg:"Sınav tamamlandı.", kind:"ok" });
}


/* ================= RESET ================= */
function resetAll(){
  timer.stop();
  applyFocusMode(false);
  closeSummaryModal?.();

  Object.assign(state, {
    rawText:"", parsed:null, mode:"prep",
    answers:new Map(), startedAt:null, timeLeftSec:null
  });

  // 🔑 KRİTİK: state değişti → globale tekrar bağla
  syncGlobals();

  el("fileInput").value="";
  el("pasteArea").value="";
  setStatus("hazır");

  paintAll();
  persist();
}


/* ================= UI REFRESH ================= */
function paintAll(){
  const wrongStats = wrongBookStats();
  updateModeUI(state, wrongStats);
  updateAiSolveUI();
  renderExam(state);
  buildNav(state);
  refreshNavColors(state);
refreshFocusMiniNav?.(state);
  updateStats(state);
  updateSummary();

  setupQuestionObserver();
  updateFocusHUD();
}
function syncGlobals(){
  window.__APP_STATE = state;
  window.__APP_TIMER = timer;
  window.__APP_PAINT_ALL = paintAll;
  window.__APP_PERSIST = persist;
}

/* ================= EVENTS ================= */
el("btnStart").onclick = startExam;
el("btnFinish").onclick = finishExam;
const _btnFinishFocus = document.getElementById("btnFinishFocus");
if (_btnFinishFocus) _btnFinishFocus.onclick = (e)=>{ e.preventDefault(); finishExam(); };
el("btnReset").onclick = resetAll;

// ================= AI SUBJECTS (Konu Tamamlama) =================
const btnAiSubjects = el("btnAiSubjects");
if (btnAiSubjects){
  btnAiSubjects.onclick = async () => {
    try{
      if (!state?.parsed?.questions?.length) return showWarn("Önce sınavı yükle.");
      if (typeof window.fillMissingSubjectsWithGemini !== "function") return showWarn("AI konu modülü bulunamadı (ui.js).");

      btnAiSubjects.disabled = true;
      await window.fillMissingSubjectsWithGemini(state.parsed, {
        batchSize: 12,
        confidenceThreshold: 0.75,
        // ui.js mount alanı varsa kullanır; yoksa kendi panelini açar
        mountId: "aiSubjectPanelMount",
      });
    }catch(e){
      console.error(e);
      showWarn(e?.message || "AI konu tamamlama hatası");
    }finally{
      btnAiSubjects.disabled = false;
    }
  };
}



// ================= AI KEY (Mod A) =================
async function runAiSolve(){
  if (!state.parsed) return;
  try {
    setLoading(true, "AI cevap anahtarı üretiliyor…");

    const totalQ = state.parsed?.questions?.length || 0;
    const existing = state.parsed.answerKey || {};

    // ui.js fonksiyonu: Gemini ile key üretir (JSON-only batch prompt)
    const aiKey = await generateAnswerKeyWithGemini(state.parsed, { limit: totalQ, batchSize: 10 });
    const merged = { ...existing, ...(aiKey || {}) };

    state.parsed.answerKey = merged;
    state.parsed.keyCount = Object.keys(merged).length;
    state.parsed.meta = state.parsed.meta || {};
    state.parsed.meta.keySource = "ai";
    state.parsed.meta.keyCoverage = totalQ ? (state.parsed.keyCount / totalQ) : 0;

    showToast?.({ title:"AI", msg:`Anahtar üretildi: ${state.parsed.keyCount}/${totalQ}`, kind:"ok" });
    paintAll();
    persist();
  } catch (e) {
    console.error(e);
    showToast?.({ title:"AI", msg: (e?.message || "AI anahtar üretilemedi"), kind:"warn" });
  } finally {
    setLoading(false);
  }
}

const __btnAiSolve = el("btnAiSolve");
if (__btnAiSolve) __btnAiSolve.onclick = runAiSolve;

// Focus bar
const btnExitFocus = el("btnExitFocus");
if (btnExitFocus) btnExitFocus.onclick = () => applyFocusMode(false);


// Otomatik ayrıştırma: dosya seçilince parse et (butona gerek yok)
el("fileInput")?.addEventListener("change", () => {
  // Dosya seçildiyse textarea'yı da temiz tutalım (karışmasın)
  try { el("pasteArea").value = ""; } catch {}
  doParse();
});

// Metin yapıştırma için de otomatik ayrıştırma (debounce)
let __pasteT = null;
el("pasteArea")?.addEventListener("input", () => {
  clearTimeout(__pasteT);
  __pasteT = setTimeout(() => {
    // dosya seçili değilse ve metin varsa parse et
    const hasFile = !!(el("fileInput")?.files?.[0]);
    if (!hasFile) doParse();
  }, 600);
});
safeBind("btnWrongMode", () => {
  const base = buildWrongOnlyParsed({ limit: 80, onlyDue: true, fallbackAll: true });
  if (!base) return showWarn("Yanlış Defteri boş");
  state.parsed = applyShuffle(base, { shuffleQ:true, shuffleO:true });
  state.mode="prep";
  state.answers.clear();
  paintAll();
});


// SRS Paneli
safeBind("btnSrsDash", () => {
  const d = wrongBookDashboard();
  openSrsModal(d);
});

/// Hata Raporu İndir (HTML) - GÜVENLİ BAĞLAMA
safeBind("btnExportWrongBook", () => {
  const data = exportWrongBook();

  if (!data || !data.items || data.items.length === 0) {
    showWarn("Yanlış defterin tamamen boş.");
    return;
  }

  // --- FİLTRELEME: Sadece 'YANLIS' olanları al (Boşları at) ---
  const onlyWrongs = data.items.filter(item => item.status === "YANLIS");

  if (onlyWrongs.length === 0) {
    showWarn("Harika! Hiç yanlışın yok (Sadece boşlar var).");
    return;
  }

  // --- HTML OLUŞTURMA ---
  const now = new Date().toLocaleDateString("tr-TR");

  // Basitleştirilmiş CSS (Sadece Yanlış odaklı)
  const css = `
    :root { --bg:#09090b; --card:#18181b; --text:#e4e4e7; --bad:#ef4444; --ok:#22c55e; --muted:#71717a; --border:#27272a; }
    body { background:var(--bg); color:var(--text); font-family:'Segoe UI', system-ui, sans-serif; padding:40px 20px; max-width:800px; margin:0 auto; line-height:1.5; }
    h1 { font-size:24px; font-weight:800; margin-bottom:10px; color:#fff; display:flex; align-items:center; gap:10px; }
    .meta { color:var(--muted); font-size:13px; margin-bottom:40px; border-bottom:1px solid var(--border); padding-bottom:20px; }

    .filters { margin:-10px 0 26px; padding:14px 14px 16px; border:1px solid var(--border); border-radius:12px; background:rgba(255,255,255,0.02); }
    .filtersTitle { font-size:12px; text-transform:uppercase; letter-spacing:0.6px; color:var(--muted); margin-bottom:10px; }
    .chips { display:flex; flex-wrap:wrap; gap:8px; }
    .chip { cursor:pointer; border:1px solid var(--border); background:rgba(255,255,255,0.03); color:var(--text); padding:8px 10px; border-radius:999px; font-size:12px; display:inline-flex; align-items:center; gap:8px; }
    .chip:hover { background:rgba(255,255,255,0.06); }
    .chip.active { border-color:rgba(168,85,247,0.6); box-shadow:0 0 0 2px rgba(168,85,247,0.12) inset; }
    .chipCount { background:rgba(255,255,255,0.07); padding:2px 8px; border-radius:999px; font-variant-numeric:tabular-nums; }
    .filtersHint { margin-top:10px; font-size:12px; color:var(--muted); line-height:1.4; }
    
    .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:24px; margin-bottom:24px; position:relative; overflow:hidden; }
    .card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--bad); }
    
    .q-meta { display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px; color:var(--muted); font-weight:600; letter-spacing:0.5px; text-transform:uppercase; }
    .q-text { font-size:17px; margin-bottom:20px; color:#fafafa; font-weight:500; }
    .subjLine { margin:-10px 0 14px; color:var(--muted); font-size:12px; }
    .actions { margin:14px 0 0; display:flex; justify-content:flex-end; }
    .btnReplay { cursor:pointer; border:1px solid var(--border); background:rgba(168,85,247,0.12); color:#e9d5ff; padding:9px 12px; border-radius:10px; font-size:12px; font-weight:650; }
    .btnReplay:hover { background:rgba(168,85,247,0.18); }
    
    .opt { padding:10px 14px; margin:6px 0; border-radius:8px; background:rgba(255,255,255,0.03); font-size:15px; display:flex; gap:12px; align-items:center; border:1px solid transparent; }
    
    /* Sadece Yanlış ve Doğruyu vurgula */
    .opt.wrong { background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.5); color:#fca5a5; }
    .opt.correct { background:rgba(34,197,94,0.15); border-color:rgba(34,197,94,0.5); color:#86efac; }
    
    .stat-row { margin-top:16px; padding-top:15px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); display:flex; flex-wrap:wrap; gap:12px 18px; }
  `;

  // subject chips (for filtering)
  const subjCounts = {};
  for (const it of onlyWrongs){
    const s = String(it?.q?.subject || "Genel").trim() || "Genel";
    subjCounts[s] = (subjCounts[s] || 0) + 1;
  }
  const subjOrder = Object.keys(subjCounts).sort((a,b)=> subjCounts[b]-subjCounts[a] || a.localeCompare(b));
  const chipsHtml = subjOrder.map(s => {
    const c = subjCounts[s];
    return `<button class="chip" data-subject="${s.replace(/"/g,'&quot;')}">${s} <span class="chipCount">${c}</span></button>`;
  }).join("");

  const itemsHtml = onlyWrongs.map((item, idx) => {
    const q = item.q;
    const subject = String(q?.subject || "Genel").trim() || "Genel";

    // SRS meta
    const sm2 = item?.srs?.sm2 || null;
    const dueStr = sm2?.due ? new Date(sm2.due).toLocaleDateString("tr-TR") : "—";
    const efStr = (sm2 && Number.isFinite(sm2.ef)) ? sm2.ef.toFixed(2) : "—";
    const intStr = (sm2 && Number.isFinite(sm2.interval)) ? `${sm2.interval}g` : "—";
    const repsStr = (sm2 && Number.isFinite(sm2.reps)) ? String(sm2.reps) : "—";
    const replayKey = item?._key || "";
    
    let optionsHtml = "";
    if (q.optionsByLetter) {
      ["A","B","C","D","E"].forEach(L => {
        const opt = q.optionsByLetter[L];
        if (!opt || !opt.text) return;

        let extraClass = "";
        let icon = "⚪"; // Nötr şık

        // 1. Kullanıcının YANLIŞ seçimi
        if (item.yourLetter === L) {
          extraClass = "wrong";
          icon = "❌"; 
        }
        // 2. DOĞRU cevap
        if (opt.id === item.correctId) {
          extraClass = "correct";
          icon = "✅";
        }

        optionsHtml += `
          <div class="opt ${extraClass}">
            <span style="font-size:1.2em">${icon}</span>
            <span><b style="opacity:0.5; margin-right:6px;">${L})</b> ${opt.text}</span>
          </div>`;
      });
    }

    return `
      <div class="card" data-subject="${subject.replace(/"/g,'&quot;')}">
        <div class="q-meta">
          <span>Soru #${idx+1}</span>
          <span style="color:#ef4444">Hatalı Cevap</span>
        </div>
        <div class="q-text">${q.text}</div>
        <div class="subjLine">📘 Konu: <b>${subject}</b></div>
        <div class="options">${optionsHtml}</div>
        <div class="actions">
          <button class="btnReplay" data-replay="${replayKey}">♻️ Bu hatayı tekrar sor</button>
        </div>
        <div class="stat-row">
          <span>📅 ${new Date(item.addedAt).toLocaleDateString()}</span>
          <span>📉 ${item.wrongCount} kez yanlış yapıldı</span>
          <span>⏱️ SRS: ${dueStr} • EF ${efStr} • ${intStr} • reps ${repsStr}</span>
        </div>
      </div>
    `;
  }).join("");

  const fullHtml = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Hata Raporu - ${now}</title>
      <style>${css}</style>
    </head>
    <body>
      <h1>🚨 Hata Analiz Raporu</h1>
      <div class="meta">
        Tarih: ${now} • Toplam Hata: ${onlyWrongs.length} adet<br>
        <i>Boş bırakılan sorular bu rapora dahil edilmemiştir. Sadece yanlış yapılanlar listelenmektedir.</i>
      </div>
      <div class="filters">
        <div class="filtersTitle">Konu filtresi</div>
        <div class="chips">
          <button class="chip chipAll" data-subject="__ALL__">Tümü <span class="chipCount">${onlyWrongs.length}</span></button>
          ${chipsHtml}
        </div>
        <div class="filtersHint">İpucu: “♻️ Bu hatayı tekrar sor” butonu, raporu <b>aynı klasörde</b> bir sunucu üzerinden (ör. Live Server) açtıysan çalışır.</div>
      </div>
      ${itemsHtml}

      <script>
        (function(){
          const chips = Array.from(document.querySelectorAll('.chip'));
          const cards = Array.from(document.querySelectorAll('.card'));
          const setActive = (btn) => {
            chips.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          };
          const applyFilter = (subj) => {
            cards.forEach(c => {
              const s = c.getAttribute('data-subject') || 'Genel';
              c.style.display = (subj==='__ALL__' || s===subj) ? '' : 'none';
            });
          };
          chips.forEach(btn => {
            btn.addEventListener('click', () => {
              const s = btn.getAttribute('data-subject');
              setActive(btn);
              applyFilter(s);
            });
          });
          // default active
          const all = document.querySelector('.chipAll');
          if (all){ setActive(all); applyFilter('__ALL__'); }

          document.body.addEventListener('click', (e) => {
            const b = e.target.closest('.btnReplay');
            if (!b) return;
            const key = b.getAttribute('data-replay') || '';
            if (!key){ alert('Replay anahtarı yok. (Eski kayıt olabilir)'); return; }
            try {
              localStorage.setItem('sinav_replay_key', key);
              // same folder assumption: open the app
              const url = './index.html#replay=1';
              window.open(url, '_blank');
            } catch(err){
              alert('Replay için localStorage erişimi gerekli. Raporu bir sunucu üzerinden açmayı dene.');
            }
          });
        })();
      </script>
    </body>
    </html>
  `;

  downloadBlob(fullHtml, `hata_raporu_${new Date().toISOString().slice(0,10)}.html`, "text/html");
  showWarn("📄 Sadece yanlışlardan oluşan hata raporu indirildi.");
});

// Yanlışları Temizle
safeBind("btnClearWrongBook", () => {
    clearWrongBook();
    paintAll();
    showWarn("🧽 Yanlış Defteri sıfırlandı.");
});

// Kayıtları Sıfırla
safeBind("btnClearSave", () => {
    clearSaved();
    showWarn("🧨 Kayıt silindi.");
});


// Result filters refresh
["showOnlyWrong","showOnlyBlank"].forEach(id=>{
  const cb = el(id);
  if (cb) cb.addEventListener("change", () => {
    paintAll();
    persist();
  });
});

// Focus mode toggle: sınav devam ederken aç/kapat
const fmToggle = el("focusMode");
if (fmToggle){
  fmToggle.addEventListener("change", () => {
    if (state.mode === "exam") applyFocusMode(!!fmToggle.checked);
  });
}


document.addEventListener("change", e=>{
  if (state.mode!=="exam" || e.target.type!=="radio") return;
  const q = Number(e.target.name.slice(1));
    state.answers.set(q, e.target.value);

  // Focus mod: cevaplandıktan sonra sıradaki soruyu aktif yap
  if (document.body.classList.contains("focusMode")) {
    const total = state.parsed?.questions?.length || 0;
    const nextQn = Math.min(q + 1, total || q);
    if (total && nextQn !== q) {
      state.activeQn = nextQn;
      state.navPage = Math.floor((nextQn - 1) / 20);
      scrollToQuestion(nextQn);
    } else {
      state.activeQn = q;
    }
  } else {
    state.activeQn = q;
  }

  paintAll();
  persist();
});

// ESC: focus moddan çık (sınav devam eder)
document.addEventListener("keydown", e=>{
  if (e.key !== "Escape") return;
  if (state.mode !== "exam") return;
  if (!document.body.classList.contains("focusMode")) return;
  applyFocusMode(false);
});


// SRS rating buttons (only visible in 'Tekrar (SRS)' result mode)
el("examArea")?.addEventListener("click", (e) => {
  const btn = e.target?.closest?.(".srsBtn");
  if (!btn) return;
  if (!state.parsed || !state.srsReview || state.mode !== "result") return;

  const wrap = btn.closest(".srsWrap");
  const qn = Number(wrap?.dataset?.q);
  if (!qn) return;

  const qObj = state.parsed.questions.find(x => x.n === qn);
  if (!qObj) return;

  const quality = Number(btn.dataset.quality || 4);
  const info = setSrsQualityByQuestion(qObj, quality, state.lastReviewId);
  if (info){
    state.srsInfo[qn] = info;
    paintAll();
    persist();
  }
});

attachKeyboardShortcuts(state,(q,l)=>{
  state.answers.set(q,l);
  paintAll();
  persist();
}, finishExam);



/* ================= INIT (BAŞLATMA) ================= */

// 1. Önce Görünümü Ayarla (Ekran beyaz/siyah yanıp sönmesin)
initTheme();           // <-- Temayı (Koyu/Açık/Sepya) yükler

// 2. Pati'yi Uyandır
startPatiMotivation(); // <-- Köpeğin animasyonlarını başlatır

// 3. Eski Verileri Geri Getir
restore();             // <-- Yarım kalan sınav varsa yükler
setStatus("hazır");    // <-- Sol üstte "Hazır" yazar

// 4. (Opsiyonel) Hata Raporundan Gelindiyse "Tekrar Sor"u Çalıştır
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

// 5. Son Olarak Her Şeyi Ekrana Çiz
paintAll();            // <-- Tüm butonları, soruları ve renkleri oluşturur


// ================= ÖZEL ÇIKIŞ MODALI BAĞLANTISI (app.js en altı) =================

const btnLogout = document.getElementById("btnLogout");
const logoutModal = document.getElementById("logoutModal");
const btnCancel = document.getElementById("btnCancelLogout");
const btnConfirm = document.getElementById("btnConfirmLogout");

if (btnLogout) {
    btnLogout.onclick = function(e) {
        e.preventDefault(); 
        if (logoutModal) logoutModal.style.display = "flex";
    };
}

if (btnCancel) {
    btnCancel.onclick = function() {
        if (logoutModal) logoutModal.style.display = "none";
    };
}

if (btnConfirm) {
    btnConfirm.onclick = function() {
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("user_name");
        window.location.reload();
    };
}

window.addEventListener("click", function(e) {
    if (e.target === logoutModal) logoutModal.style.display = "none";
});

/* ================= ÖZEL ÇIKIŞ MODALI BAĞLANTISI (FİNAL TEMİZ) ================= */

// 1. Elemanları Seç
const uiLogoutBtn = document.getElementById("btnLogout");
const uiLogoutModal = document.getElementById("logoutModal");
const uiCancelBtn = document.getElementById("btnCancelLogout");
const uiConfirmBtn = document.getElementById("btnConfirmLogout");

// 2. Çıkış Butonuna Tıklanınca Modalı AÇ
if (uiLogoutBtn) {
    uiLogoutBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (uiLogoutModal) {
             uiLogoutModal.style.display = "flex";
        }
    };
}

// 3. Vazgeç Butonu
if (uiCancelBtn) {
    uiCancelBtn.onclick = function() {
        if (uiLogoutModal) uiLogoutModal.style.display = "none";
    };
}

// 4. "EVET, ÇIKIŞ YAP" BUTONU
if (uiConfirmBtn) {
    uiConfirmBtn.onclick = async function() {
        // Butonu pasif yap ve yazıyı değiştir
        uiConfirmBtn.textContent = "Çıkılıyor...";
        uiConfirmBtn.disabled = true;

        try {
            // Firebase çıkışını bekle
            if (window.auth && window.signOut) {
                await window.signOut(window.auth);
            }
        } catch (e) {
            console.error("Çıkış işlemi sırasında sessiz hata:", e);
        }
        
        // Her durumda yerel veriyi temizle ve yenile
        localStorage.removeItem("isLoggedIn");
        localStorage.removeItem("user_name");
        window.location.reload();
    };
}

// 5. Pencere Dışına Tıklanınca Kapat
window.addEventListener("click", function(e) {
    if (e.target === uiLogoutModal) {
        uiLogoutModal.style.display = "none";
    }
});

/* =========================================
   SORUN BİLDİRİM SİSTEMİ (BUG REPORT)
   ========================================= */

// Gerekli Firebase Fonksiyonlarını Alalım (Eğer import sorunu yaşarsan en tepeye ekle)
// import { getFirestore, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";
// NOT: Zaten window.db tanımlıysa gerek yok. Biz window.db kullanacağız.

const uiReportBtn = document.getElementById("btnReportBug");
const uiReportModal = document.getElementById("reportModal");
const uiCloseReport = document.getElementById("btnCloseReport");
const uiCancelReport = document.getElementById("btnCancelReport");
const uiSendReport = document.getElementById("btnSendReport");
const uiReportText = document.getElementById("reportText");

// 1. Modalı Aç
if (uiReportBtn) {
    uiReportBtn.onclick = () => {
        if(uiReportModal) {
            uiReportModal.style.display = "flex";
            uiReportText.value = ""; // Önceki yazıyı temizle
            uiReportText.focus();
        }
    };
}

// 2. Modalı Kapat (X ve Vazgeç)
const closeReportModal = () => {
    if(uiReportModal) uiReportModal.style.display = "none";
};

if(uiCloseReport) uiCloseReport.onclick = closeReportModal;
if(uiCancelReport) uiCancelReport.onclick = closeReportModal;

/* =========================================
   1. TOAST BİLDİRİM FONKSİYONU (Alert Yerine)
   ========================================= */
window.showToast = function(message, type = 'neutral') {
    const host = document.getElementById('toastHost');
    if (!host) return; 

    const div = document.createElement('div');
    div.className = `toast-msg ${type}`;
    
    let icon = '🔔';
    if (type === 'error') icon = '🛑';
    if (type === 'success') icon = '✅';
    
    div.innerHTML = `<span class="toast-icon">${icon}</span> <span>${message}</span>`;
    
    host.appendChild(div);

    // 3 saniye sonra sil
    setTimeout(() => {
        div.classList.add('hiding');
        div.addEventListener('animationend', () => div.remove());
    }, 3000);
};

/* =========================================
   2. GÜNCELLENMİŞ RAPOR GÖNDERME
   ========================================= */
if (uiSendReport) {
    uiSendReport.onclick = async () => {
        
        // A. Kategori Seçimini Al (Böcek, Fikir, Sevgi)
        const selectedOption = document.querySelector('input[name="reportType"]:checked');
        const category = selectedOption ? selectedOption.value : "Genel";

        // B. Mesajı Al
        const rawMsg = uiReportText.value.trim();

        // C. Boş mu Kontrol Et (Toast ile Uyar)
        if (!rawMsg) {
            window.showToast("Lütfen boş mesaj gönderme şampiyon! 😊", "error");
            return;
        }

        // D. Butonu Kilitle (Animasyon)
        uiSendReport.textContent = "Roket Kalkıyor... 🚀";
        uiSendReport.disabled = true;

        try {
            // E. Mesajı Formatla: "[Fikir] Mesaj içeriği..."
            const finalMsg = `[${category}] ${rawMsg}`;

            // F. Firebase'e Kaydet
            await window.addDoc(window.collection(window.db, "reports"), {
                message: finalMsg,
                sender: localStorage.getItem("user_name") || "Gizli Kahraman",
                date: new Date(),
                userAgent: navigator.userAgent,
                location: window.location.href
            });

            // G. Başarılı! (Toast Göster)
            window.showToast("Mesajın başarıyla ışınlandı! 🕵️‍♂️", "success");
            
            closeReportModal();
            uiReportText.value = ""; // Kutuyu temizle

        } catch (error) {
            console.error("Rapor hatası:", error);
            // Hata Durumu (Toast Göster)
            window.showToast("Hata oluştu: " + error.message, "error");
        } finally {
            // H. Butonu Eski Haline Getir
            uiSendReport.textContent = "Gönder Gitsin! 🚀";
            uiSendReport.disabled = false;
        }
    };
}

// Pencere dışına tıklayınca kapat
window.addEventListener("click", (e) => {
    if (e.target === uiReportModal) closeReportModal();
});