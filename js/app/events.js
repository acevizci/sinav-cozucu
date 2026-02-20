import { downloadBlob } from "../utils.js";
import { getPatiLevel, _getStreak } from "../pati.js";
import { msg } from "../ui.js";
import { appError } from "../ui/uiAlert.js";
import { openAiKeySetup } from "../ui/ai.js";


function __getSubject(q) {
  if (q && q.subject && q.subject.trim() !== "") {
    return q.subject;
  }
  return "Genel";
}

function syncGlobals() {
    //console.log("🔄 Stüdyo verileri ana uygulamaya işleniyor...");

    // 1. Eğer renderQuiz (veya benzeri bir render fonksiyonun) varsa çağır:
    if (typeof renderQuiz === "function") {
        renderQuiz();
    } else if (typeof initExam === "function") {
        initExam();
    } else if (window.renderQuiz) {
        window.renderQuiz();
    }

    // 2. İstatistikleri güncelle (varsa)
    if (typeof updateStats === "function") {
        updateStats();
    }

    //console.log("✅ Senkronizasyon ve Render tamamlandı.");
}

export function bindEvents(ctx = {}) {
  const state = ctx.state || window.__APP_STATE;
  if (!state) throw appError("ERR_BINDEVENTS_STATE_MISSING");

  const el = ctx.el || (id => document.getElementById(id));

  // keep the same helper used in app.js
  function safeBind(id, handler) {
    const element = document.getElementById(id);
    if (element) element.onclick = handler;
  }

  const safeStyle = ctx.safeStyle || ((id, fn) => { const e = el(id); if (e) fn(e); });
  const applyFocusMode = ctx.applyFocusMode || (() => {});

  // actions
  const doParse = ctx.doParse;
  const startExam = ctx.startExam;
  const finishExam = ctx.finishExam;
  const resetAll = ctx.resetAll;

  const paintAll = ctx.paintAll || (() => {});
  const persist = ctx.persist || (() => {});

  // ui deps
  const showWarn = ctx.showWarn || window.showWarn;
  const showToast = ctx.showToast || window.showToast;
  const setLoading = ctx.setLoading || window.setLoading;
  const generateAnswerKeyWithGemini = ctx.generateAnswerKeyWithGemini || window.generateAnswerKeyWithGemini;
  const refreshNavColors = ctx.refreshNavColors || window.refreshNavColors;
  const attachKeyboardShortcuts = ctx.attachKeyboardShortcuts || window.attachKeyboardShortcuts;
  const scrollToQuestion = ctx.scrollToQuestion;

  // wrong book / srs deps
  const buildWrongOnlyParsed = ctx.buildWrongOnlyParsed || window.buildWrongOnlyParsed;
  const applyShuffle = ctx.applyShuffle || window.applyShuffle;
  const wrongBookDashboard = ctx.wrongBookDashboard || window.wrongBookDashboard;
  const exportWrongBook = ctx.exportWrongBook || window.exportWrongBook;
  const clearWrongBook = ctx.clearWrongBook || window.clearWrongBook;
  const openSrsModal = ctx.openSrsModal || window.openSrsModal;
  const setSrsQualityByQuestion = ctx.setSrsQualityByQuestion || window.setSrsQualityByQuestion;

  // drive deps (optional)
  const listMyDriveBooklets = ctx.listMyDriveBooklets;
  const listFolderBooklets = ctx.listFolderBooklets;
  const fetchDriveFileAsFileOrText = ctx.fetchDriveFileAsFileOrText;

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
      if (!state?.parsed?.questions?.length) return showWarn({id:"EXAM_LOAD_FIRST"});
      if (typeof window.fillMissingSubjectsWithGemini !== "function") return showWarn({id:"AI_SUBJECT_MODULE_MISSING"});

      btnAiSubjects.disabled = true;
      await window.fillMissingSubjectsWithGemini(state.parsed, {
        batchSize: 12,
        confidenceThreshold: 0.75,
        // ui.js mount alanı varsa kullanır; yoksa kendi panelini açar
        mountId: "aiSubjectPanelMount",
      });
    }catch(e){
      console.error(e);
      showWarn(e?.message || {id:"AI_SUBJECT_FILL_ERROR"});
    }finally{
      btnAiSubjects.disabled = false;
    }
  };
}



// ================= AI KEY (Mod A) =================
async function runAiSolve(){
  if (!state.parsed) return;
  try {
    setLoading(true, { id:"AI_KEY_LOADING" });

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

    showToast?.({ id:"AI_KEY_CREATED", vars:{ done: state.parsed.keyCount, total: totalQ }, kind:"ok" });
    paintAll();
    persist();
  } catch (e) {
    console.error(e);
    showToast?.({ id:"AI_KEY_FAILED", vars:{ reason: (e?.message || msg("AI_KEY_FAILED_DEFAULT")) }, kind:"warn" });
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
  if (!base) return showWarn({id:"WRONG_BOOK_EMPTY"});
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
// =============================
// ✅ Export Wrong Book (REPORT)
// =============================
safeBind("btnExportWrongBook", () => {
  const data = exportWrongBook();
  if (!data || !data.items || data.items.length === 0) {
    showWarn({id:"WRONG_BOOK_ALL_EMPTY"});
    return;
  }

  // ✅ NEW: artık kısmi yanlışlar da analize girsin
  const onlyWrongs = data.items.filter(item => {
    if (!item) return false;

    if (item.status === "YANLIS") return true;
    if (item.status === "KISMI") return true;

    if (typeof item.lastScore === "number" && item.lastScore < 1) return true;
    return false;
  });

  if (onlyWrongs.length === 0) {
    showWarn({id:"WRONGS_NOT_FOUND_FOR_ANALYSIS"});
    return;
  }

  // ✅ DEDUPE: aynı soruyu raporda 1 kez göster (en güncel kaydı tut) — shuffle-proof
  const _dedupeKey = (it) => {
    if (it?.key) return it.key;
    if (it?.q?.key) return it.q.key;
    if (it?.q?.fingerprint) return it.q.fingerprint;

    const q = it?.q || {};
    const opts = q.optionsByLetter || {};

    // shuffle-proof: şık metinlerini topla + sırala
    const blob = ["A","B","C","D","E","F"]
      .map(L => String(opts[L]?.text || "").trim())
      .filter(Boolean)
      .sort()
      .join("|");

    return `${String(q.subject || "").trim()}||${String(q.text || "").trim()}||${blob}`;
  };

  const _ts = (it) => it?.updatedAt || it?.lastSeenAt || it?.ts || it?.lastTs || 0;

  const uniq = new Map();
  for (const it of onlyWrongs) {
    const k = _dedupeKey(it);
    const prev = uniq.get(k);
    if (!prev || _ts(it) >= _ts(prev)) uniq.set(k, it);
  }

  const reportItems = Array.from(uniq.values());
  if (reportItems.length === 0) {
    showWarn({id:"WRONGS_NOT_FOUND_FOR_ANALYSIS"});
    return;
  }

  // ---------- Anchor helpers (sağ panelden soruya zıplama) ----------
  const _safeId = (s) => String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 90);

  // reportItems -> anchorId map
  const anchorByItem = new Map();
  const used = new Set();

  for (let i = 0; i < reportItems.length; i++) {
    const it = reportItems[i];
    const base = "q_" + _safeId(it?._key || _dedupeKey(it) || (i + 1));
    let id = base;
    let n = 1;
    while (used.has(id)) { n++; id = `${base}_${n}`; }
    used.add(id);
    anchorByItem.set(it, id);
  }

  // ---------- Summary meta ----------
  const now = new Date().toLocaleDateString("tr-TR");
  const totalWrongUnique = reportItems.length;

  // --- 1. VERİ ANALİZİ ---
  const subjectMap = {};
  reportItems.forEach(it => {
    const s = it?.q?.subject || "Genel";
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

  // --- 1B. EN PROBLEMLİ 5 SORU (wrongCount'e göre) ---
  const worst5 = [...reportItems]
    .sort((a, b) => (b?.wrongCount || 0) - (a?.wrongCount || 0))
    .slice(0, 5);

  const worst5Html = worst5.map((it, i) => {
    const q = it?.q || {};
    const wc = it?.wrongCount || 0;

    const color = wc >= 3 ? "#ef4444" : "#f59e0b";
    const title = (q.text || "").trim().replace(/\s+/g, " ");
    const short = title.length > 70 ? (title.slice(0, 70) + "…") : title;

    const targetId = anchorByItem.get(it) || "";

    return `
      <a href="#${targetId}" style="text-decoration:none; color:inherit; display:block;">
        <div style="display:flex; align-items:flex-start; gap:12px; margin-bottom:14px;">
          <span style="background:${color}22; color:${color}; min-width:24px; height:24px; display:flex; align-items:center; justify-content:center; border-radius:50%; font-size:11px; font-weight:900; border:1px solid ${color}44;">
            ${i + 1}
          </span>
          <div style="flex:1;">
            <div style="font-size:12px; font-weight:700; color:#fff; line-height:1.35;">${short || "Soru"}</div>
            <div style="font-size:10px; color:var(--muted); opacity:0.9; margin-top:4px;">
              <span style="color:${color}; font-weight:900;">${wc}x</span> yanlış • ${q.subject || "Genel"}
            </div>
          </div>
        </div>
      </a>
    `;
  }).join("");

  // --- 2. PATİ VERİLERİ ---
  const patiLevel = getPatiLevel();
  const patiSatiety = window.PatiManager?.satiety || 100;
  const patiStreak = _getStreak();
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

  // --- 3. CSS ---
  const css = `
    :root { 
      --bg: #050508; --glass: rgba(255, 255, 255, 0.03);
      --accent: #a855f7; --text: #f4f4f5; --muted: #a1a1aa;
      --border: rgba(255, 255, 255, 0.1);
      --red-glass: rgba(239, 68, 68, 0.15);
      --green-glass: rgba(34, 197, 94, 0.15);
      --amber-glass: rgba(245, 158, 11, 0.15);
    }

    html { scroll-behavior: smooth; }

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
    .card:target {
      outline: 2px solid rgba(168,85,247,0.7);
      box-shadow: 0 0 0 6px rgba(168,85,247,0.15);
      animation: pulseGlow 800ms ease-out 1;
    }

    @keyframes pulseGlow {
      0%   { box-shadow: 0 0 0 6px rgba(168,85,247,0.00); }
      40%  { box-shadow: 0 0 0 10px rgba(168,85,247,0.22); }
      100% { box-shadow: 0 0 0 6px rgba(168,85,247,0.15); }
    }

    .q-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
    .q-subject-pill { background: rgba(168, 85, 247, 0.18); color: #d8b4fe; padding: 5px 12px; border-radius: 10px; font-size: 10px; font-weight: 800; text-transform: uppercase; border: 1px solid rgba(168, 85, 247, 0.3); }
    .q-time-pill { padding: 5px 12px; border-radius: 10px; font-size: 10px; font-weight: 800; display: flex; align-items: center; gap: 6px; border: 1px solid transparent; }

    .q-text { font-size: 16px; margin-bottom: 18px; font-weight: 500; color: #fff; }
    .opt { padding: 12px; margin: 8px 0; border-radius: 12px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border); display: flex; align-items: center; gap: 12px; font-size: 14px; }
    .opt.wrong { background: var(--red-glass) !important; border-color: rgba(239, 68, 68, 0.4) !important; color: #fca5a5; }
    .opt.correct { background: var(--green-glass) !important; border-color: rgba(34, 197, 94, 0.4) !important; color: #86efac; }
    .opt.partial { background: var(--amber-glass) !important; border-color: rgba(245, 158, 11, 0.45) !important; color: #fde68a; }

    .ai-analysis { margin-top: 18px; padding: 16px; border-radius: 14px; background: rgba(168, 85, 247, 0.08); border: 1px dashed rgba(168, 85, 247, 0.3); }
    .panel-section-title { font-size: 12px; font-weight: 800; margin-bottom: 20px; color: var(--accent); text-transform: uppercase; letter-spacing: 1px; }
    .bar-bg { height: 7px; background: rgba(255,255,255,0.08); border-radius: 4px; overflow: hidden; margin-top: 5px; }
    .bar-fill { height: 100%; background: linear-gradient(to right, #a855f7, #6366f1); }
    .divider { height: 1px; background: var(--border); margin: 20px 0; }

    .pati-badge { font-size: 45px; margin: 0 auto 15px; background: rgba(255,255,255,0.05); width: 85px; height: 85px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid ${patiColor}44; box-shadow: 0 0 20px ${patiColor}22; }

    @media (max-width: 1300px) {
      body { flex-direction: column; align-items: center; }
      .panel { position: relative; top: 0; width: 100%; max-width: 700px; margin-bottom: 25px; }
    }
  `;

  // --- helpers: multi-id support ---
  const toLetterSet = (v) => {
    if (!v) return new Set();
    const s = String(v).toUpperCase();
    const letters = s.match(/[A-F]/g) || [];
    return new Set(letters);
  };

  // --- 4. SORU SATIRLARI ---
  const rows = reportItems.map((item, idx) => {
    const q = item.q || {};
    const time = item.lastTimeSpent || 0;

    // ✅ kaç kez yanlış yapılmış
    const wrongTimes = item.wrongCount ?? 0;
    const wcColor = wrongTimes >= 3 ? "#ef4444" : "#f59e0b";
    const wcText  = wrongTimes >= 3 ? `⚠️ Kritik (${wrongTimes})` : `${wrongTimes}. Kez Yanlış`;

    // 🕒 Zaman Rozeti Mantığı
    let timeStatus = "Normal";
    let timeColor = "var(--muted)";
    let timeEmoji = "⏱️";
    if (time > 0 && time < 12) { timeStatus = "Fırtına Hızı"; timeColor = "#fbbf24"; timeEmoji = "⚡"; }
    else if (time > 90) { timeStatus = "Derin Analiz"; timeColor = "#f87171"; timeEmoji = "🐢"; }

    const correctSet = toLetterSet(item.correctId);
    const yourSet = toLetterSet(item.yourId);

    const letters = ["A","B","C","D","E","F"].filter(L => {
      const opt = q.optionsByLetter?.[L];
      return opt && (String(opt.text || "").trim().length > 0);
    });

    const optionsHtml = letters.map(L => {
      const opt = q.optionsByLetter?.[L];
      if (!opt) return "";

      const isUserChoice = yourSet.has(String(opt.id || L).toUpperCase());
      const isCorrect = correctSet.has(String(opt.id || L).toUpperCase());

      let cls = "";
      let icon = "⚪";
      if (isCorrect) { cls = "correct"; icon = "✅"; }
      if (isUserChoice && !isCorrect) { cls = "wrong"; icon = "❌"; }
      if (isUserChoice && isCorrect) { cls = "correct"; icon = "✅"; }

      return `<div class="opt ${cls}"><span>${icon}</span><span><b style="opacity:0.6; margin-right:5px;">${L}:</b> ${opt.text || "..."}</span></div>`;
    }).join("");

    let scoreBadge = "";
    if (typeof item.lastScore === "number" && item.lastScore > 0 && item.lastScore < 1) {
      scoreBadge = ` <span style="font-size:10px; font-weight:800; color:#fde68a; opacity:.95;">• Kısmi %${Math.round(item.lastScore*100)}</span>`;
    }

    const anchorId = anchorByItem.get(item) || `q_${idx + 1}`;

    return `
      <div class="card" id="${anchorId}">
        <div class="q-header-row">
          <div class="q-subject-pill">
            📍 ${q.subject || "Genel"}${scoreBadge}
            ${wrongTimes > 0 ? `
              <span style="
                margin-left:8px;
                padding:3px 8px;
                border-radius:999px;
                font-size:10px;
                font-weight:900;
                border:1px solid ${wcColor}55;
                background:${wcColor}18;
                color:${wcColor};
                text-transform:none;
              ">${wcText}</span>
            ` : ``}
          </div>

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
    const pct = Math.round((count / totalWrongUnique) * 100);
    return `
      <div class="chart-row">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--muted);">
          <span>${sub}</span><span>%${pct}</span>
        </div>
        <div class="bar-bg"><div class="bar-fill" style="width:${pct}%"></div></div>
      </div>
    `;
  }).join("");

  // --- 6. FİNAL BİRLEŞTİRME ---
  const fullHtml = `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <title>Acumen Stratejik Analiz</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
      <style>${css}</style>
    </head>
    <body>
      <div id="jumpToast" style="
        position: fixed;
        left: 50%;
        top: 18px;
        transform: translateX(-50%);
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(17, 17, 20, 0.65);
        border: 1px solid rgba(255,255,255,0.12);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        color: #fff;
        font-family: Inter, system-ui, sans-serif;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .2px;
        display: none;
        z-index: 9999;
        box-shadow: 0 16px 40px rgba(0,0,0,0.45);
      ">✅ Buradasın</div>

      <div class="panel left-panel">
        <div class="header" style="border:none; margin-bottom:10px;">
          <h1>ACUMEN</h1>
          <p style="color:var(--muted); font-size:11px; font-weight:600; letter-spacing:1px; margin-top:5px;">ANALİZ RAPORU</p>
        </div>

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
          <div style="font-size:18px; font-weight:800; color:#fff;">Toplam ${totalWrongUnique} Hata Analizi</div>
        </div>
        ${rows}
      </div>

      <div class="panel right-panel">
        <div class="panel-section-title">📊 KONU DAĞILIMI</div>
        ${chartRows}
        <div class="divider"></div>

        <div class="panel-section-title">🔥 EN PROBLEMLİ 5 SORU</div>
        ${worst5Html || `<div style="font-size:11px; color:var(--muted);">Veri yok.</div>`}
        <div class="divider"></div>

        <div class="panel-section-title">🎯 ODAK NOKTALARI</div>
        ${focusHtml}
      </div>

      <script>
      (function(){
        const toast = document.getElementById("jumpToast");

        function show(msg){
          if (!toast) return;
          toast.textContent = msg || "✅ Buradasın";
          toast.style.display = "block";
          toast.style.opacity = "0";
          toast.style.transition = "opacity 140ms ease";
          requestAnimationFrame(()=> toast.style.opacity = "1");

          clearTimeout(window.__jumpToastT);
          window.__jumpToastT = setTimeout(()=>{
            toast.style.opacity = "0";
            setTimeout(()=> toast.style.display = "none", 160);
          }, 1400);
        }

        function onHash(){
          const id = (location.hash || "").slice(1);
          if (!id) return;
          const el = document.getElementById(id);
          if (!el) return;

          const titleEl = el.querySelector(".q-text");
          const raw = titleEl ? titleEl.textContent.trim() : "";
          const short = raw.length > 60 ? (raw.slice(0,60) + "…") : raw;

          show("✅ Buradasın • " + (short || "Soru"));
        }

        window.addEventListener("hashchange", onHash);
        setTimeout(onHash, 0);
      })();
      </script>
    </body>
    </html>`;

  downloadBlob(fullHtml, `Acumen_Strateji_${now.replace(/\./g,'_')}.html`, "text/html");
  showToast({ id:"STRATEGY_EXPORT_READY", kind:"ok" });
});




// Yanlışları Temizle
// events.js içinde bu bloğu bul ve değiştir:
safeBind("btnClearWrongBook", () => {
  // confirm satırını sildik! doğrudan işleme geçiyoruz.
  clearWrongBook({ force: true, reason: "user" });
  paintAll();
  
  // Senin özel Toast sistemin devreye giriyor:
  window.showToast?.({ id:"WRONGBOOK_CLEARED", kind:"ok" });
});


// events.js içinde bu bloğu bul ve değiştir:
safeBind("btnClearSave", () => {
  // Tarayıcı onay kutusunu (confirm) buradan da kaldırdık.
  window.clearSaved?.({ force: true, reason: "user" });
  
  window.showToast?.({ id:"LOCALDATA_CLEARED", kind:"bad" });
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







// ================= USER MENU: AI ANAHTARI (GUARANTEE ITEM EXISTS) =================
function ensureAiKeyMenuItem() {
  try {
    const dropdown = document.getElementById("userDropdown");
    const logout = document.getElementById("btnLogout");
    if (!dropdown || !logout) return;

    let aiBtn = document.getElementById("btnAiKey");
    if (aiBtn) return;

    aiBtn = document.createElement("div");
    aiBtn.className = "dropdown-item";
    aiBtn.id = "btnAiKey";
    aiBtn.innerHTML = `
      <span class="item-icon">✨</span>
      <span class="item-text">AI Anahtarı</span>
    `;
    dropdown.insertBefore(aiBtn, logout);
  } catch {}
}
ensureAiKeyMenuItem();

// ================= ÇIKIŞ ONAY MODALI (TEK MERKEZ) =================

const uiAiKeyBtn = document.getElementById("btnAiKey");
const uiUserMenuWrap = document.querySelector(".user-menu-wrapper");
if (uiAiKeyBtn) {
  uiAiKeyBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try { uiUserMenuWrap?.classList?.remove("active"); } catch {}
    try { await openAiKeySetup({ skipNudge: false }); } catch {}
  });
}

const uiLogoutBtn = document.getElementById("btnLogout");
const uiLogoutModal = document.getElementById("logoutModal");
const uiCancelBtn = document.getElementById("btnCancelLogout");
const uiConfirmBtn = document.getElementById("btnConfirmLogout");

// Modal hiçbir koşulda kendiliğinden açık kalmasın
if (uiLogoutModal) uiLogoutModal.style.display = "none";

function openLogoutModal() {
  if (!uiLogoutModal) return;
  uiLogoutModal.style.display = "flex";
}

function closeLogoutModal() {
  if (!uiLogoutModal) return;
  uiLogoutModal.style.display = "none";
}

// Çıkış butonu: SADECE modal açar
if (uiLogoutBtn) {
  uiLogoutBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openLogoutModal();
  });
}

// Vazgeç
if (uiCancelBtn) {
  uiCancelBtn.addEventListener("click", (e) => {
    e.preventDefault();
    closeLogoutModal();
  });
}

// Evet, çıkış yap
if (uiConfirmBtn) {
  uiConfirmBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const prevLabel = uiConfirmBtn.textContent;
    uiConfirmBtn.textContent = "Çıkılıyor...";
    uiConfirmBtn.disabled = true;

    try {
      // Tercih: auth.js içinde tanımlı merkezi signOut
      if (typeof window.acumenSignOut === "function") {
        await window.acumenSignOut();
      } else if (window.auth && window.signOut) {
        await window.signOut(window.auth);
      }
    } catch (err) {
      console.error("Çıkış işlemi sırasında hata:", err);
    }

    // Her durumda yerel veriyi temizle ve yenile
    try {
      localStorage.removeItem("isLoggedIn");
      localStorage.removeItem("user_name");
    } catch (_) {}
    window.location.reload();

    // (reload olmazsa) UI restore
    uiConfirmBtn.textContent = prevLabel;
    uiConfirmBtn.disabled = false;
  });
}

// Dışarı tıklayınca kapat
window.addEventListener("click", (e) => {
  if (e.target === uiLogoutModal) closeLogoutModal();
});

/* =========================================
   SORUN BİLDİRİM SİSTEMİ (FORMSPREE)
   ========================================= */

const uiReportModal  = document.getElementById("reportModal");
const uiReportText   = document.getElementById("reportText");
const uiSendReport   = document.getElementById("btnSendReport");
const uiCancelReport = document.getElementById("btnCancelReport");
const uiReportBtn    = document.getElementById("btnReportBug");

const openModal = () => {
  if (!uiReportModal) return;
  uiReportModal.style.display = "flex";
  if (uiReportText) uiReportText.value = "";
};

const closeModal = () => {
  if (!uiReportModal) return;
  uiReportModal.style.display = "none";
};

uiReportBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  openModal();
});

uiCancelReport?.addEventListener("click", (e) => {
  e.preventDefault();
  closeModal();
});

// Dışarı tıklayınca kapat (modal overlay’e tıklanırsa)
uiReportModal?.addEventListener("click", (e) => {
  if (e.target === uiReportModal) closeModal();
});

// ESC ile kapat
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

uiSendReport?.addEventListener("click", async (e) => {
  e.preventDefault(); // form submit olmasın

  const selectedOption = document.querySelector('input[name="reportType"]:checked');
  const category = selectedOption?.value || "Genel";
  const message = uiReportText?.value.trim() || "";

  if (!message) {
    window.showToast?.({id:"REPORT_EMPTY", kind:"warn"});
    return;
  }

  uiSendReport.textContent = "Roketleniyor... 🚀";
  uiSendReport.disabled = true;

  try {
    const payload = {
      kategori: category,
      mesaj: message,
      kullanici: localStorage.getItem("user_name") || "Anonim Kullanıcı",
      sayfa: window.location.href,
      tarayici: navigator.userAgent
    };

    const response = await fetch("https://formspree.io/f/xzdadqvz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // Hata ayıklamayı kolaylaştır
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("Formspree hata:", response.status, data);
      throw appError("ERR_REPORT_SEND_FAILED", { status: response.status, details: (data && data.error) ? data.error : "" });
    }

    window.showToast?.({id:"REPORT_SENT", kind:"ok"});
    closeModal();
    if (uiReportText) uiReportText.value = "";

  } catch (err) {
    console.error("Gönderim hatası:", err);
    window.showToast?.({id:"REPORT_FAILED", kind:"bad"});
  } finally {
    uiSendReport.textContent = "Gönder Gitsin! 🚀";
    uiSendReport.disabled = false;
  }
});



/* =========================================
   Toast sistemi artık js/ui/uiAlert.js tarafından yönetiliyor.
   (window.showToast vb. global binding app.js içinde yapılır.)
   ========================================= */

/* =========================================
   2. RAPOR GÖNDERME (DEPRECATED - FIREBASE KALDIRILDI)
   Not: Rapor sistemi artık yukarıdaki Formspree bloğu ile çalışır.
   Bu blok, window.collection/addDoc hatasına sebep olduğu için devre dışı bırakıldı.
   ========================================= */

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
    //console.log("📦 Stüdyo Verisi Alındı:", examData);
	
// events.js - FIX V2: Re-indexing (Tür Garantili)
// Değişken adı: examData

// 🔥 FIX START: Numaraları ve Anahtarı Sıfırdan İnşa Et
const reindexedQuestions = [];
const reindexedKey = {};
const rawKey = examData.answerKey || {}; 

// Eğer sorular tanımlı değilse boş dizi ata
const questions = examData.questions || [];

questions.forEach((q, index) => {
    // Yeni numara her zaman 1, 2, 3... şeklinde gider
    const newSeq = index + 1; 
    
    // Eski numarayı al (Hem sayı hem string olarak sakla)
    const oldN = q.n;         

    // Sorunun numarasını güncelle
    q.n = newSeq; 
    reindexedQuestions.push(q);

    // Cevap anahtarını bulmaya çalış (Hem "3" hem 3 olarak dene)
    let correctOption = rawKey[oldN] || rawKey[String(oldN)] || rawKey[Number(oldN)];

    // Eğer cevap anahtarında bulamadıysak ve sadece 1 soru varsa,
    // belki anahtarın kendisi direkt "A" diye gelmiştir veya tek bir kayıt vardır.
    if (!correctOption && questions.length === 1 && Object.keys(rawKey).length === 1) {
        correctOption = Object.values(rawKey)[0];
    }

    // Yeni anahtara ekle
    if (correctOption) {
        reindexedKey[newSeq] = correctOption;        // Sayısal indeks: 1: "A"
        reindexedKey[String(newSeq)] = correctOption; // String indeks: "1": "A" (Garanti olsun diye)
    }
});

// Veriyi güncelle
examData.questions = reindexedQuestions;
examData.answerKey = reindexedKey;
examData.keyCount = Object.keys(reindexedKey).length;

// 👆 FIX END 👆



    if (!isValidTemplatePayload(examData)) {
      showWarn?.({id:"TEMPLATE_INVALID"});
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
        // ✅ Dinamik şıklar: sadece gerçekten gelen harfleri koru (4 şık ise E üretme)
        const letters = Object.keys(optionsByLetter)
          .map(x => String(x).toUpperCase())
          .filter(x => /^[A-F]$/.test(x))
          .sort();
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

    showToast?.({ id:"TEMPLATE_Q_LOADED", vars:{ count: state.parsed.questions.length }, kind:"ok" });

    const as = el("autoStart");
    if (as && as.checked) startExam();

  } catch (e){
    console.error(e);
    showWarn?.(e?.message || {id:"TEMPLATE_INTEGRATION_ERROR"});
  }
});




/* ===================== DRIVE TAB (v23 - Ultimate: Nested + Robust) ===================== */
(function initDriveTab(){
  // ---- 1. Yardımcılar ve Ayarlar ----
  const statusEl = document.getElementById("driveStatus");
  const setDriveStatus = (msg, isErr=false) => {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.toggle("err", !!isErr);
  };

const driveErrorBox = document.getElementById("driveErrorBox");

function showDriveAuthError(){
  if (!driveErrorBox) return;

  driveErrorBox.innerHTML = `
    <div class="drive-error-card">
      <div class="drive-error-icon">⚠️</div>
      <div class="drive-error-text">
        <div class="drive-error-title">Drive bağlantısı süresi doldu</div>
        <div class="drive-error-desc">
          Google oturumu geçersiz. Lütfen tekrar bağlanın.
        </div>
      </div>
      <button class="drive-error-btn" id="btnReconnectDrive">
        Yeniden Bağlan
      </button>
    </div>
  `;

  driveErrorBox.style.display = "block";

  document.getElementById("btnReconnectDrive")?.addEventListener("click", () => {
    btnList?.click(); // mevcut listeleme akışını tekrar tetikle
  });
}

function clearDriveError(){
  if (driveErrorBox) driveErrorBox.style.display = "none";
}

  const LS_LAST_FOLDER = "acumen_drive_last_folder";

  // Element Seçimleri
  const btnModeMy = document.getElementById("btnModeMy");
  const btnModeFolder = document.getElementById("btnModeFolder");
  const folderRow = document.getElementById("driveFolderRow");
  const inpFolder = document.getElementById("inpDriveFolder");
  const inpFilter = document.getElementById("inpDriveFilter");
  const btnClear = document.getElementById("btnDriveClear");
  const listHost = document.getElementById("driveList");
  const btnList = document.getElementById("btnDriveList");
  const btnOpen = document.getElementById("btnDriveOpen"); // new UI button

  // Eğer kritik elementler yoksa sessizce çık
  if (!btnList || !btnOpen) return;

  // Breadcrumb (Yol Çubuğu) Alanı Oluştur
  let breadcrumbHost = document.querySelector(".driveX-crumbs");
  if (!breadcrumbHost && listHost) {
    breadcrumbHost = document.createElement("div");
    breadcrumbHost.className = "driveX-crumbs";
    breadcrumbHost.style.display = "none"; 
    listHost.parentNode.insertBefore(breadcrumbHost, listHost);
  }

  // ---- 2. Durum Değişkenleri (State) ----
  let __driveItems = [];      // O anki klasörün içeriği
  let __driveSelected = null; // Seçili dosya
  let navigationStack = [ { id: 'root', name: "Drive'ım" } ]; // Gezinme geçmişi

  // Son klasör ID'sini hatırla
  if (inpFolder){
    const last = localStorage.getItem(LS_LAST_FOLDER);
    if (last && !inpFolder.value) inpFolder.value = last;
  }

  // ---- 3. Mod Yönetimi (Drive'ım / Manuel Klasör) ----
  function setMode(isFolder){
    if (btnModeMy && btnModeFolder){
      btnModeMy.classList.toggle("is-active", !isFolder);
      btnModeFolder.classList.toggle("is-active", !!isFolder);
    }
    if (folderRow) folderRow.style.display = isFolder ? "flex" : "none";
  }

  function getIsManualMode(){
    return btnModeFolder && btnModeFolder.classList.contains("is-active");
  }

  btnModeMy?.addEventListener("click", () => setMode(false));
  btnModeFolder?.addEventListener("click", () => setMode(true));
  // Başlangıç ayarı
  setMode(getIsManualMode());

  // ---- 4. Yardımcı Format Fonksiyonları (Eksilmemesi gerekenler) ----
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function humanMime(m){
    if (!m) return "";
    if (m === "application/vnd.google-apps.folder") return "Klasör";
    if (m === "application/pdf") return "PDF";
    if (m === "application/vnd.google-apps.document") return "Google Doküman";
    if (m === "application/vnd.google-apps.spreadsheet") return "Sheet";
    if (m === "application/vnd.google-apps.presentation") return "Slide";
    if (m.startsWith("text/")) return "Metin";
    return "Dosya";
  }

  // ---- 5. Breadcrumb (Yol Çubuğu) Çizimi ----
  function renderBreadcrumbs(){
    if (!breadcrumbHost) return;
    
    // Eğer kök dizindeysek gizleyebiliriz, ama kullanıcı yerini bilsin diye açık tutuyoruz
    breadcrumbHost.style.display = navigationStack.length > 0 ? "flex" : "none";

    breadcrumbHost.innerHTML = navigationStack.map((folder, index) => {
      const isActive = index === navigationStack.length - 1;
      // İlk eleman ev ikonu, diğerleri klasör ikonu
      const icon = index === 0 ? '🏠' : '📂';
      return `
        <div class="crumb-item ${isActive ? 'active' : ''}" data-idx="${index}">
          ${icon} ${escapeHtml(folder.name)}
        </div>
        ${!isActive ? '<span class="crumb-sep">›</span>' : ''}
      `;
    }).join("");

    // Tıklama olayları (Geri gitmek için)
    breadcrumbHost.querySelectorAll(".crumb-item").forEach(item => {
      item.onclick = () => {
        const idx = Number(item.dataset.idx);
        // Zaten o klasördeysek işlem yapma
        if (idx === navigationStack.length - 1) return;
        
        // Stack'i o noktaya kadar geri sar
        navigationStack = navigationStack.slice(0, idx + 1);
        fetchCurrentFolder(); // Yeni konumu yükle
      };
    });
  }

  // ---- 6. Liste Çizimi (Render) ----
  function driveRenderList(items){
    // Listeyi sakla
    __driveItems = items || [];
    __driveSelected = null; // Sayfa değişince seçim sıfırlanır

    if (!listHost) return;

    if (__driveItems.length === 0){
      listHost.innerHTML = `<div class="driveX-meta" style="padding:20px; text-align:center;">Bu klasör boş.</div>`;
      return;
    }

    listHost.innerHTML = __driveItems.map(f => {
      const isFolder = f.mimeType === "application/vnd.google-apps.folder";
      // Klasörse sarı ikon, PDF ise kırmızı, diğerleri gri
      let iconColor = "";
      let icon = "📄";
      
      if (isFolder) { 
          icon = "📁"; 
          // CSS ile renklendirme yapılıyor (.driveX-icon-box içindeki kurallar)
      } else if (f.mimeType === "application/pdf") {
          icon = "📕";
      } else if (f.mimeType.includes("document")) {
          icon = "📝";
      }

      const badge = (f.mimeType === "application/pdf") ? '<span class="driveX-badge"><span class="dot"></span>PDF → Stüdyo</span>' : "";

      return `
        <div class="driveX-item" 
             data-id="${f.id}" 
             data-mime="${escapeHtml(f.mimeType||"")}" 
             data-name="${encodeURIComponent(f.name||"")}" 
             role="button" tabindex="0">
          
          <div style="display:flex; gap:10px; align-items:center;">
            <div class="driveX-icon-box">${icon}</div>
            <div>
              <div class="driveX-name">${escapeHtml(f.name||"(adsız)")}${badge}</div>
              <div class="driveX-meta">${escapeHtml(humanMime(f.mimeType))}</div>
            </div>
          </div>
          
          <div class="driveX-meta">›</div>
        </div>
      `;
    }).join("");

    // Tıklama Olayları
    listHost.querySelectorAll(".driveX-item").forEach(elm => {
      const clickHandler = () => {
        const isFolder = elm.dataset.mime === "application/vnd.google-apps.folder";
        const name = decodeURIComponent(elm.dataset.name || "");
        const id = elm.dataset.id;

        if (isFolder) {
          // KLASÖRE GİR
          navigationStack.push({ id: id, name: name });
          fetchCurrentFolder();
        } else {
          // DOSYA SEÇ (Mavi vurgu yap)
          listHost.querySelectorAll(".driveX-item").forEach(x => x.classList.remove("is-selected"));
          elm.classList.add("is-selected");
          __driveSelected = {
            id: id,
            mimeType: elm.dataset.mime,
            name: name
          };
        }
      };
      
      elm.onclick = clickHandler;
      elm.addEventListener("keydown", (e) => { 
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); clickHandler(); }
      });
    });
  }

  // ---- 7. Filtreleme (Arama) ----
  function applyFilter(){
    const q = (inpFilter?.value || "").trim().toLowerCase();
    if (!q){
      driveRenderList(__driveItems); // Filtre yoksa hepsini göster
      return;
    }
    // O anki listede arama yap
    const filtered = __driveItems.filter(f => (f.name||"").toLowerCase().includes(q));
    
    // Geçici render (ana listeyi bozmadan)
    // Not: driveRenderList fonksiyonu __driveItems'ı günceller, bu yüzden
    // sadece HTML'i güncellemek için özelleştirilmiş bir yol veya
    // __driveItems'ı yedekleyip geri yükleyen bir yapı kullanabiliriz.
    // Ancak basitlik adına filtrelenmiş array'i renderlayacağız.
    // *Dikkat*: Bu __driveItems'ı filtreli haliyle ezerse breadcrumb geri dönüşünde sorun olmaz çünkü fetchCurrentFolder taze veri çeker.
    // Ama anlık silme durumunda veri kaybı olmaması için render fonksiyonunu 'items' parametresiyle çağırmak yeterli.
    
    // Render fonksiyonunu modifiye etmeden doğrudan HTML üretimi (DRY için render fonksiyonunu kullanıyoruz)
    // driveRenderList(filtered) çağırmak __driveItems'ı filtered ile değiştirir.
    // Bu yüzden __driveItems'ı koruyarak sadece görseli güncelleyelim:
    
    const backupItems = [...__driveItems]; 
    driveRenderList(filtered);
    __driveItems = backupItems; // Orijinal listeyi geri yükle (hafızada kalsın)
  }

  let _deb;
  inpFilter?.addEventListener("input", () => {
    clearTimeout(_deb);
    _deb = setTimeout(applyFilter, 200);
  });

  btnClear?.addEventListener("click", () => {
    if (inpFilter) inpFilter.value = "";
    driveRenderList(__driveItems);
  });

  // ---- 8. Veri Çekme (Fetch Logic) ----
  async function fetchCurrentFolder() {
    setDriveStatus("Yükleniyor...");
    listHost.innerHTML = `<div class="spinner" style="margin:20px auto;"></div>`; 
    renderBreadcrumbs(); // Üstteki yolu güncelle

    try {
      // Stack'in en sonundaki konumu al
      const current = navigationStack[navigationStack.length - 1];
      let files = [];

      if (current.id === 'root') {
        // Ana dizini getir
        files = await listMyDriveBooklets(); 
      } else {
        // Alt klasörü getir
        files = await listFolderBooklets({ folderLinkOrId: current.id });
      }

      // Veriyi hafızaya al ve çiz
      __driveItems = files || [];
      driveRenderList(__driveItems);
      setDriveStatus(`${files.length} öğe bulundu.`);

} catch (e) {
  console.error(e);

  // Google API error formatları:
  // 1) { error: { code: 401, status: "UNAUTHENTICATED", message: "..." } }
  // 2) { status: 401, message: "..." }
  // 3) message içinde "401" / "UNAUTHENTICATED" geçebilir
  const code =
    e?.error?.code ??
    e?.status ??
    e?.code ??
    null;

  const statusText = String(e?.error?.status || "");
  const msgText = String(e?.error?.message || e?.message || "");

  const is401 =
    code === 401 ||
    statusText === "UNAUTHENTICATED" ||
    /401|Invalid Credentials|UNAUTHENTICATED/i.test(msgText);

  if (is401) {
    // ✅ Tema uyumlu glass kart (senin CSS classlarını kullanır)
    // Not: msg'i kısa ve kullanıcı dostu tutuyoruz
    showDriveAuthError?.(
      "Google Drive oturumun geçersiz veya süresi dolmuş. Lütfen yeniden bağlan."
    );

    // status satırı (toast basıyorsa burada çağırma)
    setDriveStatus?.("Drive: yeniden giriş gerekli", true);

  } else {
    // ✅ Genel hata: kartı kapat, status'a kısa mesaj yaz
    clearDriveError?.();
    setDriveStatus?.("Drive hata: " + (msgText || "Bilinmeyen hata"), true);
  }

  // Hata olduysa stack'ten son eklenen hatalı klasörü çıkarıp bir geri gel
  if (navigationStack.length > 1) {
    navigationStack.pop();
    renderBreadcrumbs();
    // İstersen burada önceki klasörü otomatik yükleyebilirsin:
    // await loadFolder(navigationStack[navigationStack.length - 1]?.id);
  }
}


  }

  // ---- 9. Buton Aksiyonları ----

  // [Listele] Butonu
 btnList.addEventListener("click", async () => {
  const isManual = getIsManualMode();
  
  if (isManual) {
    const folderInput = (inpFolder?.value || "").trim();
    if(!folderInput) {
      // confirm veya alert yerine senin toast sistemin:
      if(window.showToast) {
        window.showToast({ id:"DRIVE_FOLDER_ID_REQUIRED", kind:"warn" });
      }
      return;
    }
        localStorage.setItem(LS_LAST_FOLDER, folderInput);
        navigationStack = [{ id: folderInput, name: "Özel Klasör" }];
    } else {
        // Drive'ım (Root) ile başlat
        navigationStack = [{ id: 'root', name: "Drive'ım" }];
    }
    
    await fetchCurrentFolder();
  });

  // PDF Stüdyosu için Özel Fonksiyon
  async function openStudioForDrivePdf({ fileId, name }){
    try {
      if (!window.__GOOGLE_ACCESS_TOKEN && window.getGoogleAccessToken){
        await window.getGoogleAccessToken({ forcePopup: true });
      }
    } catch (e) {
      console.warn("Token yenileme uyarısı:", e);
    }
    const url = `question-marker.html?from=drive&fileId=${encodeURIComponent(fileId)}&name=${encodeURIComponent(name||"")}`;
    window.open(url, "_blank");
  }

  // [Seçileni Aç] Butonu
  btnOpen.addEventListener("click", async () => {
    // Seçim kontrolü
    if (!__driveSelected) {
        if(window.showToast) window.showToast({ id:"FILE_SELECT_FIRST", kind:"warn" });
        return;
    }

    const { id, mimeType, name } = __driveSelected;

    try {
      // PDF ise Stüdyo aç
      if (mimeType === "application/pdf"){
        setDriveStatus("Stüdyo açılıyor...");
        return openStudioForDrivePdf({ fileId: id, name: name });
      }

      // Diğer dosyalar için indir
      setDriveStatus("İndiriliyor...");
      const got = await fetchDriveFileAsFileOrText({ id, mimeType, name });

      // Metin tabanlıysa (Doc, Txt) -> Paste Area'ya at ve Parse et
      if (got.kind === "text"){
        const ta = document.getElementById("pasteArea");
        if (ta) ta.value = got.text;

        try {
          // doParse (app.js global scope'unda) çağırılır
          if (typeof doParse === 'function') {
              await doParse({ autoStartHint: true });
          } else {
              throw appError("ERR_DOPARSE_FONKSIYONU_BULUNAMADI");
          }
          
          setDriveStatus("Hazır. Normal akışa geçildi.");
          if(window.showToast) window.showToast({ id:"DRIVE_BOOKLET_UPLOADED", kind:"ok" });

        } catch (parseErr) {
            console.error("Parse hatası:", parseErr);
            setDriveStatus("Ayrıştırma hatası!", true);
        }

      } 
      // Binary dosyaysa (Word vb) -> File Input'a at (mammoth vb. işlesin diye)
      else if (got.kind === "file"){
        const fileInput = document.getElementById("fileInput");
        if (fileInput){
          const dt = new DataTransfer();
          dt.items.add(got.file);
          fileInput.files = dt.files;
          // Change eventini tetikle ki app.js'deki dinleyici yakalasın
          fileInput.dispatchEvent(new Event("change", { bubbles: true }));
          setDriveStatus("Dosya yüklendi. İşleniyor...");
        } else {
          setDriveStatus("Dosya indirildi ama input bulunamadı.", true);
        }
      }
    } catch (e){
      console.error(e);
      setDriveStatus(e?.message || "Drive yükleme hatası", true);
      if(window.showWarn) window.showWarn(e?.message || {id:"DRIVE_ERROR_GENERIC"});
    }
  });

})();

/* ================= HEADER USER MENU LOGIC ================= */

const getUserMenuWrapper = () =>
  document.querySelector('.user-menu-wrapper');

// 1. Menüyü Aç/Kapa
window.toggleUserMenu = function(event) {
  const wrapper = getUserMenuWrapper();
  if (!wrapper) return;

  // document click'e çarpmaması için
  event?.stopPropagation();

  wrapper.classList.toggle('active');
};

// 2. Boşluğa Tıklayınca Menüyü Kapat
document.addEventListener('click', function(event) {
  const wrapper = getUserMenuWrapper();
  if (!wrapper) return;

  // Menü dışında tıklanınca kapat
  if (!wrapper.contains(event.target)) {
    wrapper.classList.remove('active');
  }
});
}