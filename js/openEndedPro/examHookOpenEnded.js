// js/openEndedPro/examHookOpenEnded.js
// Minimal-invaziv entegrasyon: MutationObserver ile open-ended kartlarını dönüştür.

import { injectOpenEndedCard, evaluateAllOpenEnded } from "./openEndedProUI.js";

function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function findQuestion(parsed, n){
  const nn = Number(n);
  return (parsed?.questions || []).find(q => Number(q.n) === nn) || null;
}


function isOpenEndedParsed(parsed){
  try{
    return (parsed?.meta?.openEndedPro === true) || (parsed?.questions || []).some(q => q?.kind === "openEndedPro");
  }catch{ return false; }
}

function ensureTopControls(ctx){
  try{
    const parsed = ctx?.state?.parsed;
    const wrap = document.getElementById("aiSolveWrap");
    const btnSolve = document.getElementById("btnAiSolve");
    const badge = document.getElementById("aiReadyBadge");
    const hint = wrap ? wrap.querySelector(".ai-hint span") : null;

    if (!wrap) return;

    if (!isOpenEndedParsed(parsed)) {
      // Restore defaults (MCQ mode)
      if (btnSolve) btnSolve.style.display = "";
      const btnAll = document.getElementById("btnAiEvalAll");
      if (btnAll) btnAll.remove();
      if (hint) hint.textContent = "Anahtar yoksa yapay zeka devreye girer.";
      if (badge) badge.style.display = badge.style.display; // no-op, ui/ai.js manages it
      return;
    }

    // Open-ended PRO: hide "AI ile Tahmini Çöz"
    if (btnSolve) btnSolve.style.display = "none";

    // Show wrap and add "Tümünü Değerlendir"
    wrap.style.display = "block";

    let btnAll = document.getElementById("btnAiEvalAll");
    if (!btnAll){
      btnAll = document.createElement("button");
      btnAll.id = "btnAiEvalAll";
      btnAll.className = btnSolve ? btnSolve.className : "btn-ai-magic";
      btnAll.innerHTML = `<span>✨</span> Tümünü Değerlendir`;
      wrap.insertBefore(btnAll, wrap.firstChild);
    }

    if (hint) hint.textContent = "Açık uçlu cevapları AI ile puanla.";

    btnAll.onclick = async () => {
      try{
        btnAll.disabled = true;
        await evaluateAllOpenEnded(ctx);
      }finally{
        btnAll.disabled = false;
      }
    };
  }catch(e){
    console.error('[OpenEndedPro] top controls error', e);
  }
}

function ensureInjected(ctx){
  try{
    if (!ctx?.state) return;
    // Fast exit to keep the app responsive on login/idle screens.
    // We still try to keep top controls in sync when relevant.
    ensureTopControls(ctx);

    const parsed = ctx.state.parsed;
    if (!isOpenEndedParsed(parsed)) return;
    if (ctx.state.mode !== "exam" && ctx.state.mode !== "result") return;
    if (!parsed?.questions?.length) return;

    const cards = $all('.q, .q-card, .question-card');
    if (!cards.length) return;

    for (const card of cards){
      const nRaw = card.getAttribute('data-q') || card.getAttribute('data-n') || card.getAttribute('data-qn') || card.dataset?.q || card.dataset?.qn || (card.id || '').replace('q-','');
      const n = Number(nRaw);
      if (!n) continue;
      const q = findQuestion(ctx.state.parsed, n);
      if (!q) continue;
      injectOpenEndedCard({ ctx, card, q });
    }
  }catch(e){
    console.error('[OpenEndedPro] inject error', e);
  }
}

export function initOpenEndedPro(ctx){
  if (typeof window === 'undefined') return;

  // Public API for the top bar (render.js)
  try{
    window.__ACUMEN_OPEN_ENDED = window.__ACUMEN_OPEN_ENDED || {};
    window.__ACUMEN_OPEN_ENDED.evaluateAll = () => evaluateAllOpenEnded(ctx);

    // Total open-ended items (best-effort)
    const qs = ctx?.state?.parsed?.questions || [];
    const total = qs.filter(q => q?.kind === 'openEndedPro' || q?.openEnded).length;
    window.__ACUMEN_OPEN_ENDED.total = total;
  }catch(_){ }

  // İlk render sonrası
  setTimeout(() => ensureInjected(ctx), 0);

  // DOM değiştikçe yeniden dene (exam render/nav vb.)
  // Not: bazı giriş ekranı senaryolarında bindRenderContext() body oluşmadan çalışabilir.
  // Bu yüzden observer'ı body hazır olunca başlatıyoruz.
  // Debounce MutationObserver callbacks; observing <body> can fire extremely often
  // (animations, nav, theme, etc.) and must not block the main thread.
  let _scheduled = false;
  const scheduleEnsure = () => {
    if (_scheduled) return;
    _scheduled = true;
    setTimeout(() => {
      _scheduled = false;
      ensureInjected(ctx);
    }, 120);
  };

  const bootObserver = () => {
    try{
      if (!document.body) return false;
      if (window.__ACUMEN_OE_OBS) return true;
      const obs = new MutationObserver(() => scheduleEnsure());
      obs.observe(document.body, { childList:true, subtree:true });
      window.__ACUMEN_OE_OBS = obs;
      return true;
    }catch(e){
      console.error('[OpenEndedPro] observer boot error', e);
      return false;
    }
  };

  if (!bootObserver()) {
    try { window.addEventListener('DOMContentLoaded', () => bootObserver(), { once:true }); } catch {}
    setTimeout(() => bootObserver(), 50);
  }
}
