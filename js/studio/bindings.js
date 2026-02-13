import { Dom } from "./dom.js";
import { loadFromFile } from "./loaders.js";
import { undoLast } from "./undo.js";

export function bindFileInput(){
  Dom.fileInp.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await loadFromFile(file); }
    catch (err) { alert("Dosya yüklenemedi: " + (err?.message || String(err))); }
    finally { try { Dom.fileInp.value = ""; } catch {} }
  };
}

export function bindKeyboard(){
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undoLast();
    }
  });
}
