import { el, normalizeText, downloadBlob, formatTime } from "./utils.js";
import { parseExam } from "./parser.js";
import { applyShuffle } from "./shuffle.js";
import { createTimer } from "./timer.js";
import { saveState, loadState, clearSaved } from "./storage.js";
import { addToWrongBookFromExam, buildWrongOnlyParsed, exportWrongBook, clearWrongBook, wrongBookStats, wrongBookDashboard, getSrsInfoForParsed, setSrsQualityByQuestion } from "./wrongBook.js";
import { exportCSV, exportJSON } from "./export.js";
import { setStatus, showWarn, showToast, setLoading, updateModeUI, updateStats, buildNav, refreshNavColors, renderFocusMiniNav, refreshFocusMiniNav, renderExam, attachKeyboardShortcuts, openSummaryModal, closeSummaryModal, openSrsModal, closeSrsModal } from "./ui.js";

/* ================= SAFE DOM ================= */
window.el = id => document.getElementById(id);

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

/* ================= FILE READ ================= */
async function readFileAsText(file){
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt")) return file.text();
  if (name.endsWith(".docx")){
    const buf = await file.arrayBuffer();

    // RawText bazı DOCX'lerde paragrafları tek satıra indirip
    // şıkları/çözümü birbirine yapıştırabiliyor. Bu yüzden HTML'e çevirip
    // paragraf/öğe sınırlarını koruyarak metin topluyoruz.
    const r = await mammoth.convertToHtml({ arrayBuffer: buf });
    const html = r.value || "";
    const doc = new DOMParser().parseFromString(html, "text/html");

    const parts = [];
    // p, li ve başlıkları satır olarak al
    doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li").forEach(node => {
      const t = (node.textContent || "").replace(/\s+/g, " ").trim();
      if (t) parts.push(t);
    });

    return parts.join("\n");
  }
  throw new Error("Sadece DOCX veya TXT");
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

    state.mode = "prep";
    state.answers.clear();
    timer.stop();
    safeStyle("timer", e => e.textContent="--:--");

    setStatus("hazır");
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

  const score = total ? Math.round((correct/total)*100) : 0;

  const spent = state.durationSec - (state.timeLeftSec ?? state.durationSec);
  const timeSpent = formatTime(spent);

  paintAll();
  persist();

  openSummaryModal?.({
    total, answered, correct, score,
    wrong, blank, keyMissing, timeSpent,
    title: state.parsed.title
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
  renderExam(state);
  buildNav(state);
  refreshNavColors(state);
refreshFocusMiniNav?.(state);
  updateStats(state);
  updateSummary();

  setupQuestionObserver();
  updateFocusHUD();
}

/* ================= EVENTS ================= */
el("btnStart").onclick = startExam;
el("btnFinish").onclick = finishExam;
const _btnFinishFocus = document.getElementById("btnFinishFocus");
if (_btnFinishFocus) _btnFinishFocus.onclick = (e)=>{ e.preventDefault(); finishExam(); };
el("btnReset").onclick = resetAll;

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
el("btnWrongMode").onclick = () => {
  const base = buildWrongOnlyParsed({ limit: 80, onlyDue: true, fallbackAll: true });
  if (!base) return showWarn("Yanlış Defteri boş");
  state.parsed = applyShuffle(base, { shuffleQ:true, shuffleO:true });
  state.mode="prep";
  state.answers.clear();
  paintAll();
};


el("btnSrsDash").onclick = () => {
  const d = wrongBookDashboard();
  openSrsModal(d);
};


el("btnExportCSV").onclick = () => downloadBlob(exportCSV(state.parsed, state.answers),"sonuc.csv","text/csv");
el("btnExportJSON").onclick = () => downloadBlob(JSON.stringify(exportJSON(state.parsed, state.answers, { mode: state.mode, startedAt: state.startedAt, durationSec: state.durationSec }),null,2),"sonuc.json","application/json");
// Wrong book tools
// app.js - YENİ "HTML RAPOR" İNDİRME FONKSİYONU
// app.js - GÜNCELLENMİŞ "SADECE YANLIŞLAR" HTML RAPORU
const btnEW = el("btnExportWrongBook");
if (btnEW) btnEW.onclick = () => {
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
    
    .card { background:var(--card); border:1px solid var(--border); border-radius:12px; padding:24px; margin-bottom:24px; position:relative; overflow:hidden; }
    .card::before { content:''; position:absolute; left:0; top:0; bottom:0; width:4px; background:var(--bad); }
    
    .q-meta { display:flex; justify-content:space-between; margin-bottom:16px; font-size:12px; color:var(--muted); font-weight:600; letter-spacing:0.5px; text-transform:uppercase; }
    .q-text { font-size:17px; margin-bottom:20px; color:#fafafa; font-weight:500; }
    
    .opt { padding:10px 14px; margin:6px 0; border-radius:8px; background:rgba(255,255,255,0.03); font-size:15px; display:flex; gap:12px; align-items:center; border:1px solid transparent; }
    
    /* Sadece Yanlış ve Doğruyu vurgula */
    .opt.wrong { background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.5); color:#fca5a5; }
    .opt.correct { background:rgba(34,197,94,0.15); border-color:rgba(34,197,94,0.5); color:#86efac; }
    
    .stat-row { margin-top:20px; padding-top:15px; border-top:1px solid var(--border); font-size:12px; color:var(--muted); display:flex; gap:20px; }
  `;

  const itemsHtml = onlyWrongs.map((item, idx) => {
    const q = item.q;
    
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
      <div class="card">
        <div class="q-meta">
          <span>Soru #${idx+1}</span>
          <span style="color:#ef4444">Hatalı Cevap</span>
        </div>
        <div class="q-text">${q.text}</div>
        <div class="options">${optionsHtml}</div>
        <div class="stat-row">
          <span>📅 ${new Date(item.addedAt).toLocaleDateString()}</span>
          <span>📉 ${item.wrongCount} kez yanlış yapıldı</span>
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
      ${itemsHtml}
    </body>
    </html>
  `;

  downloadBlob(fullHtml, `hata_raporu_${new Date().toISOString().slice(0,10)}.html`, "text/html");
  showWarn("📄 Sadece yanlışlardan oluşan hata raporu indirildi.");
};

const btnCW = el("btnClearWrongBook");
if (btnCW) btnCW.onclick = () => {
  clearWrongBook();
  paintAll();
  showWarn("🧽 Yanlış Defteri sıfırlandı.");
};

const btnCS = el("btnClearSave");
if (btnCS) btnCS.onclick = () => {
  clearSaved();
  showWarn("🧨 Kayıt silindi (sayfayı yenilersen tertemiz).");
};


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

/* ================= INIT ================= */
restore();
setStatus("hazır");
paintAll();