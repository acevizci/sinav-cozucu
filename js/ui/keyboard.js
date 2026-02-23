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
  document.addEventListener("keydown", async (e)=>{
    if (state.mode!=="exam") return;
// Scratchpad açıkken veya kullanıcı yazı yazarken arka kısayollar çalışmasın
const ov = document.getElementById("scratchpadOverlay");
const ovOpen = !!(ov && ov.style && ov.style.display === "flex");
if (ovOpen) return;

    if (e.ctrlKey && e.key==="Enter"){
      const ok = (typeof window.confirmFinishIfScratchpadDirty === "function")
        ? await window.confirmFinishIfScratchpadDirty()
        : true;
      if (!ok) { e.preventDefault(); return; }
      e.preventDefault(); onFinish?.(); return;
    }

const ae = document.activeElement;
const tag = (ae?.tagName || "").toLowerCase();
if (tag === "input" || tag === "textarea") return;
if (ae && ov && ov.contains(ae)) return;

    // (Ctrl+Enter yukarıda handle ediliyor)
    
    const k = e.key.toUpperCase();
    // 🔥 FIX: A-F kontrolü
    if (!UI_LETTERS.includes(k)) return;
    
    const top = mostVisibleQuestion();
    if (!top) return;
    const qN = Number(top.dataset.q);
    e.preventDefault(); onPickLetter?.(qN, k);
  });
}