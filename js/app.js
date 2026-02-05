import { getPatiLevel, _getStreak } from "./pati.js";
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
  questionTimes: new Map(), // Soru Numarası -> Saniye
  lastActionAt: null,       // Son etkileşim zamanı (timestamp)

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
function startExam({ resume = false } = {}) {
  if (!state.parsed) return;

  state.mode = "exam";
  
  // ✨ ZAMAN TAKİBİ GÜNCELLEMESİ
  state.lastActionAt = Date.now(); 
  
  // Eğer yeni sınavsa Map'i sıfırla, devam ediyorsa mevcut Map'i koru veya yoksa oluştur
  if (!resume || !state.questionTimes) {
    state.questionTimes = new Map();
  }

  syncGlobals();
  if (!state.startedAt) state.startedAt = new Date().toISOString();

  state.durationSec = Number(el("durationMin").value) * 60;

  if (!resume) {
    state.timeLeftSec = state.durationSec;
  } else {
    if (state.timeLeftSec == null) state.timeLeftSec = state.durationSec;
  }

  timer.start(() => state.timeLeftSec, (v) => (state.timeLeftSec = v));

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

  // SRS review session id
  state.srsReview = /Tekrar \(SRS\)/i.test(state.parsed.title || "");
  state.lastReviewId = state.srsReview ? (new Date().toISOString()) : null;

  // ✨ KRİTİK GÜNCELLEME: Zaman haritasını deftere gönderiyoruz
  addToWrongBookFromExam({ 
    parsed: state.parsed, 
    answersMap: state.answers, 
    questionTimes: state.questionTimes, // Zaman verisi artık deftere işlenecek
    reviewId: state.lastReviewId 
  });

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

// app.js - Süre Rozetli, Çift Panel Sabitlenmiş ve Glassmorphism Dashboard
safeBind("btnExportWrongBook", () => {
  const data = exportWrongBook();
  if (!data || !data.items || data.items.length === 0) {
    showWarn("Yanlış defterin tamamen boş.");
    return;
  }

  const onlyWrongs = data.items.filter(item => item.status === "YANLIS");
  if (onlyWrongs.length === 0) {
    showWarn("Analiz edilecek hatalı soru bulunamadı.");
    return;
  }

  const now = new Date().toLocaleDateString("tr-TR");
  const wrongCount = onlyWrongs.length;

  // --- 1. VERİ ANALİZİ ---
  const subjectMap = {};
  onlyWrongs.forEach(it => {
    const s = it.q.subject || "Genel";
    subjectMap[s] = (subjectMap[s] || 0) + 1;
  });

  const topSubjects = Object.entries(subjectMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const focusHtml = topSubjects.map(([sub, count], i) => `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:14px;">
      <span style="background:linear-gradient(135deg, #a855f7, #6366f1); color:white; min-width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:11px; font-weight:800; box-shadow: 0 4px 12px rgba(168,85,247,0.3);">${i+1}</span>
      <div style="flex:1;">
        <div style="font-size:13px; font-weight:600; color:#fff;">${sub}</div>
        <div style="font-size:10px; color:var(--muted); opacity:0.8;">${count} Hata</div>
      </div>
    </div>
  `).join("");

  // --- 2. PATİ VERİLERİ (pati.js Entegrasyonu) ---
  const patiLevel = typeof getPatiLevel === "function" ? getPatiLevel() : 1;
  const patiSatiety = window.PatiManager?.satiety || 100;
  const patiStreak = typeof _getStreak === "function" ? _getStreak() : 0;
  const userName = (localStorage.getItem('user_name') || "Elif").split(' ')[0];

  let patiTitle = "Gelişmekte Olan Pati";
  let patiMsg = `${userName}, hataların üzerine giderek beni çok mutlu ediyorsun! 🌟`;
  let patiIcon = "🐾";
  let patiColor = "var(--accent)";

  if (patiSatiety < 30) {
    patiIcon = "🥺";
    patiMsg = `Karnım çok acıktı... 🍖 Beni beslemeyi unutma ${userName}, yoksa odaklanamıyorum! 🥣✨`;
    patiColor = "#fbbf24";
  } else if (patiStreak >= 5) {
    patiIcon = "🔥";
    patiTitle = "Efsanevi İz Sürücü";
    patiMsg = `${patiStreak} gündür süper gidiyoruz! 🏆 Gurur duyuyorum! 🚀💪`;
    patiColor = "#ef4444";
  } else {
    patiIcon = "🐕‍🦺";
    patiMsg = `Selam ${userName}! Bugün harika bir analiz günü. 🌈 Hatalarını beraber temizleyelim mi? 🧼💎`;
  }

  // --- 3. CSS TASARIMI (SABİT BG + GERÇEK GLASSMORPHISM) ---
  const css = `
    :root { 
      --bg: #050508; --glass: rgba(255, 255, 255, 0.03);
      --accent: #a855f7; --text: #f4f4f5; --muted: #a1a1aa;
      --border: rgba(255, 255, 255, 0.1);
      --red-glass: rgba(239, 68, 68, 0.15);
      --green-glass: rgba(34, 197, 94, 0.15);
    }
    body { 
      background: radial-gradient(circle at 0% 0%, #1e1b4b 0%, #050508 50%) fixed; 
      color: var(--text); font-family: 'Inter', system-ui, sans-serif; padding: 40px 20px; 
      margin: 0; line-height: 1.6; display: flex; gap: 35px; justify-content: center; align-items: flex-start;
    }
    .main-content { max-width: 700px; width: 100%; }
    
    .panel { position: sticky; top: 40px; background: rgba(255, 255, 255, 0.04); backdrop-filter: blur(25px) saturate(180%); -webkit-backdrop-filter: blur(25px) saturate(180%); border: 1px solid var(--border); border-radius: 28px; padding: 25px; box-shadow: 0 20px 50px rgba(0,0,0,0.4); }
    .left-panel { width: 280px; min-width: 280px; border-color: ${patiColor}44; }
    .right-panel { width: 300px; min-width: 300px; }

    .header { margin-bottom: 30px; border-bottom: 1px solid var(--border); padding-bottom: 20px; }
    .header h1 { font-size: 24px; margin: 0; background: linear-gradient(to right, #fff, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; }

    .card { background: rgba(255, 255, 255, 0.03); backdrop-filter: blur(10px); border: 1px solid var(--border); border-radius: 22px; padding: 24px; margin-bottom: 30px; }
    
    .q-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .q-subject-pill { background: rgba(168, 85, 247, 0.18); color: #d8b4fe; padding: 5px 12px; border-radius: 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; border: 1px solid rgba(168, 85, 247, 0.3); }
    .q-time-pill { padding: 5px 12px; border-radius: 10px; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; border: 1px solid transparent; }

    .q-text { font-size: 16px; margin-bottom: 18px; font-weight: 500; color: #fff; }
    .opt { padding: 12px; margin: 8px 0; border-radius: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); display: flex; align-items: center; gap: 12px; font-size: 14px; }
    .opt.wrong { background: var(--red-glass) !important; border-color: rgba(239, 68, 68, 0.4) !important; color: #fca5a5; }
    .opt.correct { background: var(--green-glass) !important; border-color: rgba(34, 197, 94, 0.4) !important; color: #86efac; }
    
    .ai-analysis { margin-top: 18px; padding: 16px; border-radius: 14px; background: rgba(168, 85, 247, 0.08); border: 1px dashed rgba(168, 85, 247, 0.3); }
    .panel-section-title { font-size: 12px; font-weight: 800; margin-bottom: 20px; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; }
    .bar-bg { height: 7px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 5px; }
    .bar-fill { height: 100%; background: linear-gradient(to right, #a855f7, #6366f1); }
    .divider { height: 1px; background: var(--border); margin: 20px 0; }
    
    .pati-badge { font-size: 45px; margin: 0 auto 15px; background: rgba(255,255,255,0.05); width: 85px; height: 85px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid ${patiColor}44; box-shadow: 0 0 20px ${patiColor}22; }

    @media (max-width: 1300px) { body { flex-direction: column; align-items: center; } .panel { position: relative; top: 0; width: 100%; max-width: 700px; margin-bottom: 25px; } }
  `;

  // --- 4. SORU SATIRLARI ---
  const rows = onlyWrongs.map((item, idx) => {
    const q = item.q;
    const time = item.lastTimeSpent || 0;
    
    // 🕒 Zaman Rozeti Mantığı
    let timeStatus = "Normal";
    let timeColor = "var(--muted)";
    let timeEmoji = "⏱️";
    if (time > 0 && time < 12) { 
      timeStatus = "Fırtına Hızı"; timeColor = "#fbbf24"; timeEmoji = "⚡"; 
    } else if (time > 90) { 
      timeStatus = "Derin Analiz"; timeColor = "#f87171"; timeEmoji = "🐢"; 
    }

    const optionsHtml = ["A", "B", "C", "D", "E"].map(L => {
      const opt = q.optionsByLetter?.[L];
      if (!opt || (!opt.text && L !== "A")) return "";
      const isUserChoice = (opt.id === item.yourId);
      const isCorrect = (opt.id === item.correctId);
      let cls = isUserChoice && !isCorrect ? "wrong" : isCorrect ? "correct" : "";
      let icon = isUserChoice && !isCorrect ? "❌" : isCorrect ? "✅" : "⚪";
      return `<div class="opt ${cls}"><span>${icon}</span><span><b style="opacity:0.6; margin-right:5px;">${L}:</b> ${opt.text || "..."}</span></div>`;
    }).join("");

    return `
      <div class="card">
        <div class="q-header-row">
          <div class="q-subject-pill">📍 ${q.subject || "Genel"}</div>
          <div class="q-time-pill" style="background:${timeColor}15; color:${timeColor}; border-color:${timeColor}44;">
             <span>${timeEmoji}</span>
             <span>${time} sn</span>
             <span style="opacity:0.6; font-size:8px; margin-left:4px;">• ${timeStatus}</span>
          </div>
        </div>
        
        <div class="q-text"><strong>${idx + 1}.</strong> ${q.text}</div>
        <div class="options">${optionsHtml}</div>
        
        ${q.analysis ? `
          <div class="ai-analysis">
            <div style="color:var(--accent); font-size:10px; font-weight:800; margin-bottom:8px;">✨ PATİ'NİN NOTU</div>
            <div style="font-size:13px; color:#d1d1d6; font-style:italic; line-height:1.5;">${q.analysis.replace(/\n/g, '<br>')}</div>
          </div>
        ` : ''}
      </div>`;
  }).join("");

  // --- 5. GRAFİK SATIRLARI ---
  const chartRows = Object.entries(subjectMap).sort((a,b)=>b[1]-a[1]).map(([sub, count]) => {
      const pct = Math.round((count / wrongCount) * 100);
      return `<div class="chart-row"><div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted);"><span>${sub}</span><span>%${pct}</span></div><div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div></div>`;
  }).join("");

  // --- 6. FİNAL BİRLEŞTİRME ---
  const fullHtml = `
    <!DOCTYPE html>
    <html lang="tr">
    <head><meta charset="UTF-8"><title>Acumen Stratejik Analiz</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>${css}</style></head>
    <body>
      <div class="panel left-panel">
        <div class="header" style="border:none; margin-bottom:10px;"><h1>ACUMEN</h1><p style="color:var(--muted); font-size:11px; font-weight:600; letter-spacing:1px; margin-top:5px;">ANALİZ RAPORU</p></div>
        <div style="text-align:center;">
          <div class="pati-badge">${patiIcon}</div>
          <div style="font-size:18px; font-weight:800; color:#fff; margin-bottom:10px;">${patiTitle}</div>
          <div style="font-size:13px; color:#d1d1d6; font-style:italic; line-height:1.5; padding: 0 5px;">"${patiMsg}"</div>
          <div class="divider"></div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid var(--border);">
              <div style="font-size:9px; color:var(--muted); text-transform:uppercase;">Seviye</div>
              <div style="font-size:14px; font-weight:800; color:var(--accent);">LVL ${patiLevel}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:10px; border-radius:12px; border:1px solid var(--border);">
              <div style="font-size:9px; color:var(--muted); text-transform:uppercase;">Seri</div>
              <div style="font-size:14px; font-weight:800; color:#ef4444;">${patiStreak} 🔥</div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="main-content">
        <div style="margin-bottom:30px; padding-left:10px; border-left:4px solid var(--accent);">
          <div style="font-size:13px; color:var(--muted); font-weight:600;">${now}</div>
          <div style="font-size:18px; font-weight:800; color:#fff;">Toplam ${wrongCount} Hata Analizi</div>
        </div>
        ${rows}
      </div>
      
      <div class="panel right-panel">
        <div class="panel-section-title">📊 KONU DAĞILIMI</div>
        ${chartRows}
        <div class="divider"></div>
        <div class="panel-section-title">🎯 ODAK NOKTALARI</div>
        ${focusHtml}
      </div>
    </body>
    </html>`;

  downloadBlob(fullHtml, `Acumen_Strateji_${now.replace(/\./g,'_')}.html`, "text/html");
  showToast({ title: "Başarılı", msg: "Yeni tasarım hazır!", kind: "ok" });
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


document.addEventListener("change", e => {
  if (state.mode !== "exam" || e.target.type !== "radio") return;
  
  const q = Number(e.target.name.slice(1));
  const L = e.target.value; 
  
  // ✨ ZAMAN HESAPLAMA (0 Sorununu çözen kısım)
  const now = Date.now();
  // Son etkileşimden bu yana geçen süreyi hesapla (saniye)
  const delta = Math.round((now - (state.lastActionAt || now)) / 1000);
  const currentTotal = state.questionTimes.get(q) || 0;
  state.questionTimes.set(q, currentTotal + delta);
  // Bir sonraki soru/işlem için zamanı güncelle
  state.lastActionAt = now;

  // 1. Veriyi kaydet
  state.answers.set(q, L);

  // 2. Navigasyonu ZORLA ve ANINDA güncelle
  if (typeof refreshNavColors === "function") {
    refreshNavColors(state);
  }

  // 3. Focus mod mantığı
  if (document.body.classList.contains("focusMode")) {
    const total = state.parsed?.questions?.length || 0;
    const nextQn = Math.min(q + 1, total || q);
    if (total && nextQn !== q) {
      state.activeQn = nextQn;
      state.navPage = Math.floor((nextQn - 1) / 20);
      if (typeof scrollToQuestion === "function") {
        scrollToQuestion(nextQn);
      }
    } else {
      state.activeQn = q;
    }
  } else {
    state.activeQn = q;
  }

  // 4. Pati ve Gamification sistemini tetikle
  try { 
    const firstTime = true; 
    if (typeof handleGamification === "function") {
      handleGamification(null, { firstTime }); 
    }
  } catch(err) {}

  // 5. Ekranı genel olarak yenile ve kaydet
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

// ---- Report modal helpers (robust + idempotent) ----
function openReportModal(){
  if (!uiReportModal) return;
  uiReportModal.style.display = "flex";
  if (uiReportText){
    uiReportText.value = "";
    // focus next tick to ensure visible
    setTimeout(() => uiReportText.focus(), 0);
  }
}
function closeReportModal(){
  if (!uiReportModal) return;
  uiReportModal.style.display = "none";
}

// 1) Modal open (use addEventListener; avoid overwrite + survive re-renders)
if (uiReportBtn){
  uiReportBtn.setAttribute("type","button");
  uiReportBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openReportModal();
  });
} else {
  console.warn("[report] #btnReportBug bulunamadı (index.html kontrol)");
}

// 2) Close buttons
if (uiCloseReport) uiCloseReport.addEventListener("click", (e) => { e.preventDefault(); closeReportModal(); });
if (uiCancelReport) uiCancelReport.addEventListener("click", (e) => { e.preventDefault(); closeReportModal(); });

// 3) Overlay click to close (optional UX)
if (uiReportModal){
  uiReportModal.addEventListener("click", (e) => {
    if (e.target === uiReportModal) closeReportModal();
  });
}


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

// ==========================================
// 🧩 TEMPLATE STUDIO ENTEGRASYONU (STATEFUL / WORKFLOW-SAFE)
// ==========================================

const btnOpenStudio = document.getElementById('btn-open-studio');
if (btnOpenStudio) {
  btnOpenStudio.addEventListener('click', () => {
    const w = 1200, h = 800;
    const left = (screen.width - w) / 2;
    const top = (screen.height - h) / 2;
    window.open('question-marker.html', 'AcumenStudio', `width=${w},height=${h},top=${top},left=${left}`);
  });
}

// Güvenlik: istersen origin whitelist ekle (aynı origin bekleniyor)
// const ALLOWED_ORIGINS = new Set([window.location.origin]);

function isValidTemplatePayload(examData){
  if (!examData || typeof examData !== "object") return false;
  if (!Array.isArray(examData.questions) || examData.questions.length === 0) return false;
  for (const q of examData.questions){
    if (!q) return false;
    if (q.n == null && q.origN == null) return false;
    if (typeof q.text !== "string") return false;
    if (!q.optionsByLetter || typeof q.optionsByLetter !== "object") return false;
  }
  return true;
}

window.addEventListener('message', async (event) => {
  try {
    // if (!ALLOWED_ORIGINS.has(event.origin)) return;

    if (!event.data || event.data.type !== 'ACUMEN_EXAM_DATA') return;

    const examData = event.data.payload;
    console.log("📦 Stüdyo Verisi Alındı:", examData);

    if (!isValidTemplatePayload(examData)) {
      showWarn?.("⚠️ Şablon verisi geçersiz/eksik geldi.");
      return;
    }

    // 1) Contract normalize
    const normalized = {
      ...examData,
      title: examData.title || "Şablon Sınavı",
      meta: { ...(examData.meta || {}), keySource: examData?.meta?.keySource || "template" },
      questions: examData.questions.map((q, i) => {
        const n = Number(q.n ?? q.origN ?? (i+1));
        const subject = __getSubject(q);
        const optionsByLetter = q.optionsByLetter || {};
        const letters = ["A","B","C","D","E"];
        const outOpt = {};
        for (const L of letters){
          const t = String(optionsByLetter?.[L]?.text ?? "").trim();
          outOpt[L] = { id: L, text: t };
        }
        return {
          ...q,
          n,
          origN: Number(q.origN ?? n),
          subject,
          optionsByLetter: outOpt,
        };
      })
    };

    // 2) Uygulama state’ine yaz
    state.rawText = "";
    state.shuffleQ = !!el("shuffleQ")?.checked;
    state.shuffleO = !!el("shuffleO")?.checked;

    state.parsed = applyShuffle(normalized, { shuffleQ: state.shuffleQ, shuffleO: state.shuffleO });
    state.mode = "prep";
    state.answers.clear();
    state.startedAt = null;
    state.timeLeftSec = null;

    try { timer.stop(); } catch {}
    safeStyle("timer", e => e.textContent="--:--");

    // 3) keyCoverage meta
    {
      const totalQ = state.parsed?.questions?.length || 0;
      const keyCount = state.parsed?.keyCount || Object.keys(state.parsed?.answerKey || {}).length;
      state.parsed.keyCount = keyCount;
      state.parsed.meta = state.parsed.meta || {};
      state.parsed.meta.keyCoverage = totalQ ? (keyCount / totalQ) : 0;
      if (!state.parsed.meta.keySource) state.parsed.meta.keySource = keyCount ? "template" : "none";
    }

    // 4) UI status + rozet
    const status = document.getElementById('parseStatus');
    if (status){ status.textContent = "✅ Şablon Hazır"; status.style.color = "#22c55e"; }

    const badge = document.getElementById('template-active-badge');
    if (badge){
      badge.style.display = 'flex';
      badge.innerHTML = `<span class="material-icons-round" style="font-size:1rem">check_circle</span> ${state.parsed.questions.length} Soru`;
    }

    // 5) Başlat butonu: normal akıştaki görünümü KORU (CSS class'lar belirler)
// Sadece disabled durumunu kaldır ve etiketi (istersen) çok hafif güncelle.
    const btnStart = document.getElementById('btnStart');
    if (btnStart){
      btnStart.disabled = false;
      btnStart.removeAttribute('disabled');

      // Normal akışta buton: '<span class="btn-icon">🚀</span> BAŞLAT'
      // Aynı görünümü koruyoruz. Template bilgisi zaten rozet + parseStatus'ta.
      btnStart.innerHTML = '<span class="btn-icon">🚀</span> BAŞLAT';
    }
syncGlobals();
    paintAll();
    persist();

    showToast?.({ title:"Şablon", msg:`${state.parsed.questions.length} soru yüklendi.`, kind:"ok" });

    const as = el("autoStart");
    if (as && as.checked) startExam();

  } catch (e){
    console.error(e);
    showWarn?.(e?.message || "Şablon entegrasyonu hatası");
  }
});

