import { Dom } from "./dom.js";
import { loadFromFile } from "./loaders.js";

function show(el, v){ if (!el) return; el.style.display = v ? "flex" : "none"; }

export function openShortcuts(){
  const bd = document.getElementById("shortcutsBackdrop");
  show(bd, true);
}
export function closeShortcuts(){
  const bd = document.getElementById("shortcutsBackdrop");
  show(bd, false);
}

export function bindShortcutsModal(){
  const bd = document.getElementById("shortcutsBackdrop");
  if (!bd) return;

  bd.addEventListener("click", (e) => {
    if (e.target === bd) closeShortcuts();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && bd.style.display !== "none") closeShortcuts();
  });
}

export function bindDropzone(){
  // Drop anywhere on the page (safe), but highlight the empty hint if present
  const hint = document.querySelector("[data-dropzone]");
  const toggle = (on) => { if (hint) hint.classList.toggle("is-dragover", on); };

  const onDragOver = (e) => {
    e.preventDefault();
    toggle(true);
  };
  const onDragLeave = (e) => {
    // Only reset when leaving window
    if (e.target === document || e.target === document.documentElement) toggle(false);
  };
  const onDrop = async (e) => {
    e.preventDefault();
    toggle(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    try { await loadFromFile(file); }
    catch (err) { alert("Dosya yüklenemedi: " + (err?.message || String(err))); }
  };

  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragleave", onDragLeave);
  window.addEventListener("drop", onDrop);
}

// Expose tiny UX namespace for HTML onclicks
export function bindUxGlobals(){
  window.ACUMEN_STUDIO_UX = {
    openShortcuts,
    closeShortcuts,
  };
}
