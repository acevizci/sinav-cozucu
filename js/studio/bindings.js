import { Dom } from "./dom.js";
import { loadFromFile } from "./loaders.js";
import { undoLast } from "./undo.js";

export function bindFileInput(){
  Dom.fileInp.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try { await loadFromFile(file); }
    catch (err) { const r=(err?.message||String(err)); window.showToast?.({id:"FILE_UPLOAD_FAILED", vars:{reason:r}, kind:"bad"}); if(!window.showToast) (window.showWarn?.({ id:"FILE_UPLOAD_FAILED", vars: { reason: r } })) || console.warn(window.uiMsg ? window.uiMsg("FILE_UPLOAD_FAILED", { reason: r }) : ""); }
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
