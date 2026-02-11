// js/app/srsBridge.js
// Zero-behavior refactor: window.startSrsBySubject extracted from app.js

function getSubject(q) {
  const direct = (q && q.subject != null) ? String(q.subject).trim() : "";
  if (direct) return direct;

  const t = q && q.text ? String(q.text) : "";
  const m = t.match(/^\[(.*?)\]\s*/);
  if (m && m[1]) return String(m[1]).trim() || "Genel";
  return "Genel";
}

/**
 * Installs global SRS starter used by ui.js subject chips:
 *   window.startSrsBySubject(subject, opts)
 *
 * ctx deps are passed explicitly to avoid hidden module-scope coupling.
 */
export function installSrsBridge(ctx = {}) {
  const state = ctx.state || window.__APP_STATE;
  const timer = ctx.timer || window.__APP_TIMER;
  const paintAll = ctx.paintAll || window.__APP_PAINT_ALL;
  const persist = ctx.persist || window.__APP_PERSIST;

  const showWarn = ctx.showWarn || window.showWarn;
  const showToast = ctx.showToast || window.showToast;
  const buildWrongOnlyParsed = ctx.buildWrongOnlyParsed || window.buildWrongOnlyParsed;
  const applyShuffle = ctx.applyShuffle || window.applyShuffle;

  window.startSrsBySubject = function startSrsBySubject(subject, opts = {}) {
    const st = state || window.__APP_STATE;
    if (!st) {
      showWarn?.("Uygulama state yok (window.__APP_STATE).");
      return;
    }

    const sub = String(subject || "Genel").trim() || "Genel";
    const limit = Number(opts.limit ?? 80);

    const base = buildWrongOnlyParsed?.({ limit, onlyDue: true, fallbackAll: true });
    if (!base?.questions?.length) {
      showWarn?.("Yanlış Defteri boş");
      return;
    }

    const filteredQs = base.questions.filter((q) => getSubject(q) === sub);

    let qs = filteredQs;
    if (!qs.length) {
      const baseAll = buildWrongOnlyParsed?.({ limit: 300, onlyDue: false, fallbackAll: true });
      qs = (baseAll?.questions || []).filter((q) => getSubject(q) === sub).slice(0, limit);
    }

    if (!qs.length) {
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

    st.parsed = applyShuffle ? applyShuffle(parsed, { shuffleQ: true, shuffleO: true }) : parsed;
    st.mode = "prep";
    st.answers?.clear?.();

    try { timer?.stop?.(); } catch {}
    try { paintAll?.(); } catch {}
    try { persist?.(); } catch {}

    showToast?.({ title: "SRS", msg: `"${sub}" tekrarı hazır (${qs.length} soru)`, kind: "ok" });
  };
}
