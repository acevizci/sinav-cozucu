import { State } from "./state.js";

export function toast(title, msg, ms=2400){
  const el = document.getElementById('toast');
  if (!el) return;
  el.querySelector('.t-title').textContent = title || '';
  el.querySelector('.t-msg').textContent = msg || '';
  el.style.display = 'block';
  el.style.opacity = '1';
  if (el._t) clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => { el.style.display = 'none'; }, 220);
  }, ms);
}

export function updateZoomUI(){
  const z = document.getElementById('zoomInfo');
  if (z) z.textContent = Math.round(State.scale * 100) + "%";
}

export function downloadJson(filename, data){
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function getSafeOrigin(){
  try { if (document.referrer) return new URL(document.referrer).origin; } catch {}
  return window.location.origin;
}

export function setOcrUI(visible, statusText="", progress01=0){
  const box = document.getElementById("ocrBox");
  const status = document.getElementById("ocrStatus");
  const bar = document.getElementById("ocrBar");
  if (!box || !status || !bar) return;
  box.style.display = visible ? "block" : "none";
  if (statusText) status.textContent = statusText;
  bar.style.width = Math.max(0, Math.min(1, progress01)) * 100 + "%";
}
