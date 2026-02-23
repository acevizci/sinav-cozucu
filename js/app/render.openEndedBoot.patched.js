// js/app/render.js
// Zero-behavior refactor: UI refresh functions extracted from app.js
// This module is intentionally stateful: app.js must call bindRenderContext() once during init.

import { el } from "../utils.js";
import { appError } from "../ui/uiAlert.js";
import {
  updateModeUI,
  updateStats,
  buildNav,
  refreshNavColors,
  refreshFocusMiniNav,
  renderExam,
} from "../ui.js";
import { wrongBookStats } from "../wrongBook.js";
import { initOpenEndedPro } from "../openEndedPro/examHookOpenEnded.js";

let _ctx = null;

/**
 * Bind runtime dependencies that live in app.js scope.
 * Must be called once after app.js creates state/timer and defines helpers.
 */
export function bindRenderContext(ctx){
  _ctx = ctx || null;

  // Open-ended PRO injector must be booted from a guaranteed codepath.
  // app.js may not call it explicitly; render is always bound during init.
  try{
    if (typeof window !== "undefined"){
      window.__ACUMEN_OE_BOOTED = window.__ACUMEN_OE_BOOTED || false;
      if (!window.__ACUMEN_OE_BOOTED) {
        initOpenEndedPro(_ctx);
        window.__ACUMEN_OE_BOOTED = true;
      }
    }
  }catch(e){
    console.error("[OpenEndedPro] boot error", e);
  }
}

function _requireCtx(){
  if (!_ctx || !_ctx.state) {
    throw appError("ERR_RENDER_BINDRENDERCONTEXT_CAGRILMADI");
  }
  return _ctx;
}

/* ===== MULTI-ANSWER HELPERS (same logic as app.js) ===== */
function toLetterSet(v){
  if (!v) return new Set();
  if (Array.isArray(v)) return new Set(v.map(x=>String(x).toUpperCase().trim()));
  // Tekil string ise temizle
  return new Set([String(v).toUpperCase().trim()]);
}

function setsEqual(a,b){
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}


/* ===== ANSWER NORMALIZATION (letter/id safe) ===== */
function _normTokens(raw){
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(x=>String(x).toUpperCase().trim()).filter(Boolean);
  return [String(raw).toUpperCase().trim()].filter(Boolean);
}

/**
 * Build a comparable Set for user/correct values.
 * - If question has optionsByLetter and token is a letter that exists, map to option.id (fallback letter)
 * - Otherwise keep token as-is
 */
function toComparableSet(q, raw){
  const tokens = _normTokens(raw);
  if (!tokens.length) return new Set();
  if (!q || !q.optionsByLetter) return new Set(tokens);

  const mapped = tokens.map(t => {
    const L = String(t).toUpperCase().trim();
    const opt = q.optionsByLetter[L];
    if (!opt) return L;
    const id = opt.id || L;
    return String(id).toUpperCase().trim();
  });
  return new Set(mapped);
}

/* ================= SUMMARY (GÜÇLENDİRİLMİŞ) ================= */
export function updateSummary(){
  const { state } = _requireCtx();
  if (!state.parsed) return;

  const questions = state.parsed.questions || [];
  const rawTotal = questions.length;
  const keyMap = state.parsed.answerKey || {};

  const isOpenEndedExam =
    (state.parsed.meta?.openEndedPro === true) ||
    (questions.some(q => q?.kind === "openEndedPro"));

  // Open-ended exams are evaluated elsewhere; keep summary stable and avoid misleading scoring
  if (isOpenEndedExam) {
    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set("sumQ", rawTotal);
    set("sumA", 0);
    set("sumC", 0);
    set("sumS", 0);
    set("mSumQ", rawTotal);
    set("mSumA", 0);
    set("mSumC", 0);
    set("mScoreDisplay", 0);
    return;
  }

  let scorableTotal = 0;
  let answered = 0;
  let correct = 0;

  for (const q of questions){
    // Skip non-scorable items (open-ended) if they appear mixed
    if (q?.kind === "openEndedPro") continue;

    const correctRaw =
      keyMap[q.n] ||
      keyMap[String(q.n)] ||
      keyMap[Number(q.n)] ||
      q.answer ||
      q.correctAnswer ||
      q.dogruCevap ||
      q._answerFromSolution;

    // If we cannot find an answer key, do not score this question (keep consistent with finishExam())
    if (!correctRaw) continue;

    scorableTotal++;

    const userRaw = state.answers.get(q.n);
    if (!userRaw) continue;
    answered++;

    const chosenSet = toComparableSet(q, userRaw);
    const correctSet = toComparableSet(q, correctRaw);

    if (chosenSet.size && correctSet.size && setsEqual(chosenSet, correctSet)) {
      correct++;
    }
  }

  const score = scorableTotal ? Math.round((correct/scorableTotal)*100) : 0;

  // Özet tablosu güncelle
  const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };

  // sumQ: show scorable count to avoid "keyless questions lower the score" confusion
  const shownTotal = scorableTotal || rawTotal;

  // UI hint: make it explicit what "score" is based on (no layout change)
  const hintText = scorableTotal
    ? (scorableTotal === rawTotal
        ? "Skor, cevap anahtarı olan çoktan seçmeli sorular üzerinden hesaplanır."
        : `Skor, cevap anahtarı olan ${scorableTotal}/${rawTotal} çoktan seçmeli soru üzerinden hesaplanır.`)
    : "Skor hesaplanamadı (cevap anahtarı bulunamadı).";

  set("sumQ", shownTotal);
  set("sumA", answered);
  set("sumC", correct);
  set("sumS", score);

  // Modal içi değerler (varsa)
  set("mSumQ", shownTotal);
  set("mSumA", answered);
  set("mSumC", correct);
  set("mScoreDisplay", score);

  const _t = (id) => { const e = el(id); if (e) e.setAttribute("title", hintText); };
  _t("sumQ");
  _t("sumS");
  _t("mSumQ");
  _t("mScoreDisplay");
}


/* ================= MOD A UI (AI Key) ================= */
export function updateAiSolveUI(){
  const { state } = _requireCtx();
  const wrap = el("aiSolveWrap");
  if (!wrap) return;

  const parsedState = state.parsed;
  if (!parsedState){ wrap.style.display = "none"; return; }

  const isOpenEnded =
    (parsedState.meta?.openEndedPro === true) ||
    (parsedState.questions?.some(q => q?.kind === "openEndedPro"));

  // Open-ended PRO: use the same bar position as MCQ "AI ile Tahmini Çöz"
  // but replace the CTA with "Tümünü değerlendir (AI)"
  if (isOpenEnded) {
    wrap.style.display = "block";

    const btn = el("aiSolveBtn");
    const readyChip = el("aiReadyChip");
    const hint = el("aiSolveHint");
    const counter = el("aiSolveCounter");

    // Toggleable batch button: start queue / stop queue
    const setBtnState = (running, done = 0, total2 = 0) => {
      if (!btn) return;
      if (running) {
        btn.textContent = `⏳ Çalışıyor… (${done}/${total2})`;
        btn.classList.add("is-running");
        if (readyChip) readyChip.textContent = "Çalışıyor";
      } else {
        btn.textContent = "✨ Tümünü değerlendir (AI)";
        btn.classList.remove("is-running");
        if (readyChip) readyChip.textContent = "Hazır";
      }
    };

    if (btn) {
      setBtnState(false, 0, 0);
      btn.onclick = async () => {
        try {
          const api = window.__ACUMEN_OPEN_ENDED;
          if (!api) return;

          // If already running, clicking acts as STOP.
          if (api._running && typeof api.stop === "function") {
            api.stop();
            setBtnState(false, 0, 0);
            return;
          }

          if (typeof api.evaluateAll !== "function") return;
          setBtnState(true, 0, (api.total || 0));
          await api.evaluateAll();
          // Final state will also be pushed by onProgress.
          setBtnState(false, 0, 0);
        } catch (e) {
          console.error(e);
          if (readyChip) readyChip.textContent = "Hata";
          if (btn) btn.classList.remove("is-running");
        }
      };
    }

    if (hint) hint.textContent = "Alt sorular için AI değerlendirme çalışır.";
    if (readyChip) {
      readyChip.style.display = "";
      if (!readyChip.textContent) readyChip.textContent = "Hazır";
    }

    const total =
      (window.__ACUMEN_OPEN_ENDED && window.__ACUMEN_OPEN_ENDED.total) ? window.__ACUMEN_OPEN_ENDED.total : 0;

    if (counter) counter.textContent = `0/${total || 0}`;

    // allow openEnded UI to push progress updates (0/5, 1/5, ...)
    // don't clobber an existing handler if another module already set it
    try {
      window.__ACUMEN_OPEN_ENDED = window.__ACUMEN_OPEN_ENDED || {};
      // Always (re)attach progress handler for this UI.
      window.__ACUMEN_OPEN_ENDED.onProgress = (done, total2) => {
        const c = el("aiSolveCounter");
        if (c) c.textContent = `${done}/${total2}`;

        // Derive running state from progress.
        const api = window.__ACUMEN_OPEN_ENDED;
        if (api) api._running = !!(total2 > 0 && done < total2);
        setBtnState(!!(total2 > 0 && done < total2), done, total2);
      };
    } catch (_) {}

    return; // do not run MCQ logic
  }

  // ===== MCQ logic (unchanged behavior) =====
  const totalQ = parsedState.questions?.length || 0;
  const keyCount = parsedState.keyCount || 0;
  const cov = parsedState.meta?.keyCoverage ?? (totalQ ? keyCount/totalQ : 0);

  // show AI solve if key is missing or partial (coverage < 95%) and we're not already on AI key
  const isAi = parsedState.meta?.keySource === "ai";
  const shouldShow = (totalQ > 0) && !isAi && (keyCount === 0 || cov < 0.95);
  wrap.style.display = shouldShow ? "block" : "none";
}

/* ================= UI REFRESH (ROZETLİ VERSİYON) ================= */
export function paintAll(){
  const { state, setupQuestionObserver, updateFocusHUD } = _requireCtx();

  const wrongStats = wrongBookStats();
  updateModeUI(state, wrongStats);
  updateAiSolveUI();
  
  // 1. Soruları Çiz (Standart)
  renderExam(state);
  
  buildNav(state);
  refreshNavColors(state);
  refreshFocusMiniNav?.(state);
  updateStats(state);
  updateSummary();

  try { setupQuestionObserver?.(); } catch {}
  try { updateFocusHUD?.(); } catch {}

  // 🔥 YENİ: ROZET SİSTEMİ (BADGE INJECTOR)
  // Soru kartlarına "Kaç kere yanlış yapıldı" bilgisini ekler.
  if (state.parsed?.questions) {
      state.parsed.questions.forEach(q => {
          // Eğer soru verisinde _wrongCount varsa (wrongBook'tan geldiyse)
          if (q._wrongCount && q._wrongCount > 0) {
              // DOM'daki kartı bul
              const card = document.querySelector(`.q-card[data-n="${q.n}"]`) || document.getElementById(`q-${q.n}`);
              
              // Rozet zaten yoksa ekle
              if (card && !card.querySelector('.retry-badge')) {
                  // Renk belirle (Sarı -> Kırmızı)
                  let badgeColor = "#f59e0b"; // Turuncu (Hafif)
                  let badgeText = `${q._wrongCount}. Kez Yanlış`;
                  
                  if (q._wrongCount >= 3) {
                      badgeColor = "#ef4444"; // Kırmızı (Kritik)
                      badgeText = `⚠️ Kritik Hata (${q._wrongCount})`;
                  }

                  // HTML Oluştur
                  const badge = document.createElement("div");
                  badge.className = "retry-badge";
                  badge.style.cssText = `
                      display: inline-block;
                      background: ${badgeColor}15; 
                      color: ${badgeColor};
                      border: 1px solid ${badgeColor}40;
                      font-size: 11px;
                      font-weight: 700;
                      padding: 4px 8px;
                      border-radius: 6px;
                      margin-bottom: 12px;
                      margin-left: 2px;
                      animation: fadeIn 0.5s ease;
                  `;
                  badge.innerHTML = `<span>↺</span> ${badgeText}`;
                  
                  // Kartın en tepesine (soru metninden önce) ekle
                  const body = card.querySelector(".q-body") || card;
                  if(body.firstChild) body.insertBefore(badge, body.firstChild);
                  else body.appendChild(badge);
              }
          }
      });
  }

  // İkon güncelleme (Sınav başlığı yanındaki)
  const iconEl = document.querySelector(".exam-icon");
  const titleEl = document.getElementById("examTitle");
  const metaEl = document.getElementById("examMeta");

if (state.parsed) {

  if (titleEl) {
    titleEl.textContent = state.parsed.title || "İsimsiz Sınav";
  }

  // SVG ikon
  if (iconEl) {
    const defaultIcon = `
      <svg viewBox="0 0 24 24" fill="none" style="width:24px;height:24px;">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#9E9E9E"/>
        <path d="M14 2V8H20" fill="#E0E0E0"/>
      </svg>
    `;
    iconEl.innerHTML = state.parsed.meta?.icon || defaultIcon;
  }

  if (metaEl) {

  const qCount = state.parsed.questions
    ? state.parsed.questions.length
    : 0;

  const keyCount = state.parsed.keyCount || 0;
  const diff = qCount - keyCount;

  let html = `
    ${qCount} soru • Anahtar: ${keyCount}
    <span id="examTimerInline" class="exam-timer-inline">⏱ --:--</span>
  `;

  // Anahtar eksik uyarısı
  if (diff > 0) {
    html += `
      <span class="answerkey-warning">
        ⚠ Anahtar eksik (${diff})
      </span>
    `;
  }

  metaEl.innerHTML = html;
}


} else {

  if (titleEl) titleEl.textContent = "Sınav";
  if (metaEl) metaEl.textContent = "Hazır olduğunda başlat.";

  if (iconEl) {
    iconEl.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" style="width:24px;height:24px;">
        <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#9E9E9E"/>
        <path d="M14 2V8H20" fill="#E0E0E0"/>
      </svg>
    `;
  }

}



  // Mobil Scroll Fix
  setTimeout(() => {
    const activeBtn = document.querySelector('.navBtn.active');
    const navGrid = document.getElementById('navGrid');
    if (activeBtn && navGrid && window.innerWidth <= 900) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 50);

  // 👇 TEST İÇİN BUNU EKLE:
 // console.log("🎨 PaintAll çalıştı. Rozet kontrolü yapıldı.");
 // if (state.parsed?.questions) {
   //   const badged = state.parsed.questions.filter(q => q._wrongCount > 0);
    //  console.log(`🏷️ Rozet takılacak soru sayısı: ${badged.length}`);
  //}
}