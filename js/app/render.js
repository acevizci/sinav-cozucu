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

export function bindRenderContext(ctx){
  _ctx = ctx || null;

  // Expose a safe repaint hook for modules (e.g., AI key completion)
  try{
    if (typeof window !== "undefined"){
      window.__ACUMEN_PAINTALL = () => { try { paintAll(); } catch(e){} };
    }
  }catch{}

  // Install debug chip hook so ACUMEN_DEBUG setter auto-refreshes chips
  _installDebugChipHook();

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

/* ================= SHARED HELPERS ================= */
function _isOpenEndedExam(parsed){
  if (!parsed) return false;
  return (
    parsed.meta?.openEndedPro === true ||
    (parsed.questions?.some(q => q?.kind === "openEndedPro") ?? false)
  );
}

/* ================= SUMMARY (GÜÇLENDİRİLMİŞ) ================= */
export function updateSummary(){
  const { state } = _requireCtx();
  if (!state.parsed) return;

  const questions = state.parsed.questions || [];
  const rawTotal = questions.length;
  const keyMap = state.parsed.answerKey || {};

  // Open-ended exams are evaluated elsewhere; keep summary stable and avoid misleading scoring
  if (_isOpenEndedExam(state.parsed)) {
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

    // Normalize key once: keyMap may be keyed by string or number
    const qKey = String(q.n);
    const correctRaw =
      keyMap[qKey] ||
      keyMap[Number(qKey)] ||
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

  const isOpenEnded = _isOpenEndedExam(parsedState);

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
      // Guard: only bind once — paintAll may run many times
      if (!btn.__acumenBound) {
        btn.__acumenBound = true;
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
    try {
      window.__ACUMEN_OPEN_ENDED = window.__ACUMEN_OPEN_ENDED || {};
      // Always (re)attach progress handler for this UI.
      window.__ACUMEN_OPEN_ENDED.onProgress = (done, total2) => {
        const c = el("aiSolveCounter");
        if (c) c.textContent = `${done}/${total2}`;
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

/* ================= DEBUG CHIP (PARSER META) ================= */
// ── Exam scope cache (invalidated when element leaves DOM) ──────────────────
const EXAM_CONTAINER_SELECTORS = [
  "#examContent", "#exam-content", ".exam-content",
  "#examBody", "#exam-body", ".exam-body",
  "#examWrap", ".exam-wrap", ".exam-main",
  "main", "#main"
];
let _examScope = null;
function _getExamScope(){
  if (_examScope && _examScope.isConnected) return _examScope;
  for (const sel of EXAM_CONTAINER_SELECTORS) {
    const found = document.querySelector(sel);
    if (found) { _examScope = found; return found; }
  }
  return document;
}

// ── Module-level constants (built once, not per-call) ────────────────────────
const _NAV_SELECTORS = [
  ".question-map", ".qmap", ".q-map", ".nav-map", ".minimap",
  ".q-nav", ".qnav", ".question-nav", ".navGrid", "#navGrid",
  ".soru-haritasi", ".question-list-nav", ".mini-nav",
  ".soru-haritasi-container", "#soruHaritasi", "#questionMap",
  "nav", "aside", "header"
].join(",");

const _WIDGET_TAGS = new Set(["BUTTON", "A", "SPAN", "I", "SVG", "INPUT", "LABEL"]);

const _HEADER_CLASSES = new Set([
  "q-actions", "q-header", "q-meta", "q-top", "q-chips", "question-actions"
]);

const _CHIP_ROW_SELECTORS = [
  ".q-actions", ".q-header", ".q-meta", ".q-top",
  ".q-chips", ".question-actions", ".q-badges"
];

const _ONLY_NUMBER_RE = /^\d+$/;

// ── Per-card lookup: build a map of n→card once across all questions ─────────
// Avoids N×4 querySelectorAll calls — replaced with 4 bulk queries total.
function _buildCardMap(){
  const scope = _getExamScope();
  const map = new Map(); // n (string) → best card element

  const isNavEl  = (el) => { try { return !!el.closest(_NAV_SELECTORS); } catch { return false; } };
  const isWidget = (el) => {
    try {
      if (_WIDGET_TAGS.has(el.tagName)) return true;
      if (el.getAttribute("role") === "button") return true;
      const p = el.parentElement;
      if (p) for (const c of _HEADER_CLASSES) if (p.classList.contains(c)) return true;
      return false;
    } catch { return false; }
  };
  const isOnlyNumber = (el) => _ONLY_NUMBER_RE.test((el.textContent || "").trim());

  // Score without getBoundingClientRect to avoid layout reflow
  const score = (el) => {
    let s = 0;
    if (el.classList?.contains("q-card"))  s += 20;
    if (el.querySelector(".q-body"))        s += 50;
    if (el.querySelector(".q-options, .q-opts, .opt")) s += 30;
    if (el.querySelector("input[type=radio],input[type=checkbox]")) s += 30;
    if (isNavEl(el))     s -= 200;
    if (isWidget(el))    s -= 150;
    if (isOnlyNumber(el)) s -= 100;
    return s;
  };

  // scoreCache avoids calling score() twice per element during map.get comparison
  const scoreCache = new Map();
  const cachedScore = (el) => {
    if (scoreCache.has(el)) return scoreCache.get(el);
    const s = score(el);
    scoreCache.set(el, s);
    return s;
  };

  // 4 bulk queries instead of 4×N individual queries
  const buckets = [
    scope.querySelectorAll(".q-card[data-n]"),
    scope.querySelectorAll("[data-qn]"),
    scope.querySelectorAll("[data-n].q-card"),
  ];

  for (const list of buckets) {
    for (const el of list) {
      const n = String(el.dataset.n || el.dataset.qn || "");
      if (!n) continue;
      const existing = map.get(n);
      if (!existing || cachedScore(el) > cachedScore(existing)) {
        map.set(n, el);
      }
    }
  }

  // Also pick up #q-N style ids (less common)
  for (const el of scope.querySelectorAll("[id^=\"q-\"]")) {
    const n = el.id.replace(/^q-/, "");
    if (!n || isNaN(Number(n))) continue;
    const existing = map.get(n);
    if (!existing || cachedScore(el) > cachedScore(existing)) {
      map.set(n, el);
    }
  }

  return map;
}

const _CHIP_STYLE = [
  "display:inline-flex",
  "align-items:center",
  "gap:6px",
  "padding:4px 10px",
  "border-radius:999px",
  "font-size:11px",
  "font-weight:500",
  "line-height:1",
  "border:1px solid rgba(255,255,255,.18)",
  "background:rgba(0,0,0,.32)",
  "backdrop-filter:blur(10px)",
  "color:rgba(255,255,255,.85)",
  "white-space:nowrap",
  "pointer-events:none",
  "flex-shrink:0"
].join(";") + ";";

function _injectChip(card, chipText) {
  // Remove any existing chips first
  card.querySelectorAll(".acumen-debug-chip").forEach(c => c.remove());

  const chip = document.createElement("div");
  chip.className = "acumen-debug-chip";
  chip.textContent = chipText;
  chip.style.cssText = _CHIP_STYLE;

  // Find chip row once using a single querySelector with comma selector
  const chipRow = card.querySelector(_CHIP_ROW_SELECTORS.join(","));
  if (chipRow) {
    chipRow.appendChild(chip);
  } else {
    chip.style.cssText += "position:absolute;top:12px;right:12px;z-index:50;";
    try {
      if (window.getComputedStyle(card).position === "static") {
        card.style.position = "relative";
      }
    } catch {}
    card.appendChild(chip);
  }
}

function _ensureDebugChipsOnce(qs, cardMap) {
  // Accept an externally built cardMap to avoid double DOM walk when called from paintAll
  const map = cardMap || _buildCardMap();

  for (const q of qs) {
    const card = map.get(String(q.n));
    if (!card) continue;

    const meta     = q.meta || q;
    const conf     = meta?.confidence ?? meta?.meta?.confidence;
    const kind     = q.kind || meta?.kind || "";
    const optCount =
      (q.optionsByLetter ? Object.keys(q.optionsByLetter).length : 0) ||
      meta?.signals?.optionCount ||
      meta?.meta?.signals?.optionCount ||
      0;

    const confStr  = (typeof conf === "number") ? conf.toFixed(2) : "—";
    _injectChip(card, `${confStr} • ${kind} • ${optCount} opt`);
  }
}

function _ensureDebugChips(state){
  try {
    if (!window.ACUMEN_DEBUG) return;
    const qs = state?.parsed?.questions;
    if (!Array.isArray(qs) || !qs.length) return;

    _ensureDebugChipsOnce(qs);

    // Single retry after render settles — rAF is enough, 300ms timeout as safety net
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(() => { try { _ensureDebugChipsOnce(qs); } catch {} });
      setTimeout(() => { try { _ensureDebugChipsOnce(qs); } catch {} }, 300);
    }
  } catch {}
}

function _installDebugChipHook(){
  try {
    if (window.__ACUMEN_DEBUG_CHIP_HOOKED) return;
    window.__ACUMEN_DEBUG_CHIP_HOOKED = true;

    // Expose manual refresh
    window.__ACUMEN_REFRESH_DEBUG_CHIPS = () => {
      try {
        const { state } = _requireCtx();
        _ensureDebugChips(state);
      } catch {}
    };

    // Make window.ACUMEN_DEBUG setter auto-refresh chips
    const existing = Object.prototype.hasOwnProperty.call(window, "ACUMEN_DEBUG") ? window.ACUMEN_DEBUG : undefined;
    let _val = !!existing;

    Object.defineProperty(window, "ACUMEN_DEBUG", {
      configurable: true,
      enumerable: true,
      get(){ return _val; },
      set(v){
        _val = !!v;
        // refresh on next tick(s) to survive re-render
        if (_val) {
          requestAnimationFrame(() => { try { window.__ACUMEN_REFRESH_DEBUG_CHIPS?.(); } catch {} });
          setTimeout(() => { try { window.__ACUMEN_REFRESH_DEBUG_CHIPS?.(); } catch {} }, 120);
        } else {
          // remove any existing chips
          document.querySelectorAll(".acumen-debug-chip").forEach(el => el.remove());
        }
      }
    });

    // Re-apply existing value through setter
    window.ACUMEN_DEBUG = _val;
  } catch {}
}
/* ================= END DEBUG CHIP ================= */

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

  // Always strip any debug chips that ended up inside the nav/map panel.
  // One targeted query is faster than N nested querySelectorAll calls.
  try {
    const NAV_MAP_SELECTORS = "#navGrid .acumen-debug-chip, .navGrid .acumen-debug-chip, .question-map .acumen-debug-chip, .qmap .acumen-debug-chip, .q-map .acumen-debug-chip, .minimap .acumen-debug-chip, .q-nav .acumen-debug-chip, .soru-haritasi .acumen-debug-chip, .soru-haritasi-container .acumen-debug-chip, #soruHaritasi .acumen-debug-chip, #questionMap .acumen-debug-chip, nav .acumen-debug-chip, aside .acumen-debug-chip";
    document.querySelectorAll(NAV_MAP_SELECTORS).forEach(c => c.remove());
  } catch {}
  updateStats(state);
  updateSummary();

  try { setupQuestionObserver?.(); } catch {}
  try { updateFocusHUD?.(); } catch {}

  // 🔥 YENİ: ROZET SİSTEMİ (BADGE INJECTOR)
  const _examScope = _getExamScope();

  if (state.parsed?.questions) {
    state.parsed.questions.forEach(q => {
      // Eğer soru verisinde _wrongCount varsa (wrongBook'tan geldiyse)
      if (q._wrongCount && q._wrongCount > 0) {
        const card = _examScope.querySelector(`.q-card[data-n="${q.n}"]`) ||
                     _examScope.getElementById?.(`q-${q.n}`) ||
                     document.getElementById(`q-${q.n}`);

        // Rozet varsa temizle, sonra yeniden ekle (re-render sonrası tekrar eklenmemesi için)
        if (card) {
          card.querySelectorAll('.retry-badge').forEach(b => b.remove());

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
          if (body.firstChild) body.insertBefore(badge, body.firstChild);
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
      const qCount = state.parsed.questions ? state.parsed.questions.length : 0;
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

    // 🧪 Debug chips (parser meta) — always run, not gated on metaEl
    _ensureDebugChips(state);

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

}