// js/app/focus.js
// Zero-behavior refactor: focus/nav helpers extracted from app.js

export function createFocusHelpers(ctx = {}) {
  const state = ctx.state || window.__APP_STATE;
  if (!state) throw new Error("createFocusHelpers: state missing");

  const el = ctx.el || (id => document.getElementById(id));
  const renderExam = ctx.renderExam;
  const refreshFocusMiniNav = ctx.refreshFocusMiniNav;
  const renderFocusMiniNav = ctx.renderFocusMiniNav;

  function safeStyle(id, fn) {
    const e = el(id);
    if (e) fn(e);
  }

  function applyFocusMode(on) {
    const fb = document.getElementById("focusBar");
    if (on) {
      document.body.classList.add("focusMode");
      if (fb) fb.style.display = "flex";
    } else {
      document.body.classList.remove("focusMode");
      if (fb) fb.style.display = "none";
    }
    // Mini nav UI update
    try { renderFocusMiniNav?.(state); } catch {}
  }

  let __activeQ = null;

  function setActiveQuestion(n) {
    state.activeQn = n;
    // Keep a single active marker (optional, subtle)
    document.querySelectorAll('.q.active').forEach(el => el.classList.remove('active'));
    const qEl = document.querySelector(`.q[data-q="${n}"]`);
    if (qEl) qEl.classList.add('active');
    __activeQ = n;
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
    try { renderExam?.(state); } catch {}

    setActiveQuestion(n);

    const qEl = document.querySelector(`.q[data-q="${n}"]`);
    if (qEl) {
      const behavior = opts.instant ? 'auto' : 'smooth';
      qEl.scrollIntoView({ behavior, block: 'start' });
    }

    // Keep nav colors in sync
    try { refreshFocusMiniNav?.(state); } catch {}
  }

  // HUD/observer were disabled in the current app.js; keep same behavior
  function updateFocusHUD() { /* HUD removed */ }
  function setupQuestionObserver() { /* observer disabled - use nav */ }

  return {
    safeStyle,
    applyFocusMode,
    scrollToQuestion,
    updateFocusHUD,
    setupQuestionObserver,
    // kept for parity / potential reuse
    setActiveQuestion,
    __activeQ,
  };
}
