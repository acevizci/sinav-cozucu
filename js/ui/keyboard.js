// js/ui/keyboard.js - kısayollar

// 🔥 UI_LETTERS import et
import { UI_LETTERS } from "./shared.js";

export function attachKeyboardShortcuts(state, onPickLetter, onFinish){
  function mostVisibleQuestion(){
    const qs = [...document.querySelectorAll(".q[data-q]")];
    if (!qs.length) return null;
    const vh = window.innerHeight || 800;
    let best = null;
    let bestScore = -1;
    for (const el of qs){
      const r = el.getBoundingClientRect();
      const visibleTop = Math.max(0, r.top);
      const visibleBottom = Math.min(vh, r.bottom);
      const visible = Math.max(0, visibleBottom - visibleTop);
      const score = visible - Math.abs(r.top) * 0.25; 
      if (score > bestScore){ bestScore = score; best = el; }
    }
    return best;
  }
  document.addEventListener("keydown", e=>{
    if (state.mode!=="exam") return;
    if (e.ctrlKey && e.key==="Enter"){
      e.preventDefault(); onFinish?.(); return;
    }
    
    const k = e.key.toUpperCase();
    // 🔥 FIX: A-F kontrolü
    if (!UI_LETTERS.includes(k)) return;
    
    const top = mostVisibleQuestion();
    if (!top) return;
    const qN = Number(top.dataset.q);
    e.preventDefault(); onPickLetter?.(qN, k);
  });
}