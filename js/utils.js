export const el = (id) => document.getElementById(id);

export function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

export function normalizeText(t){
  return String(t ?? "")
    .replace(/\r\n/g,"\n")
    .replace(/\r/g,"\n")
    .replace(/\u00A0/g," ")
    .replace(/[ \t]+\n/g,"\n")
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

export function formatTime(sec){
  sec = Math.max(0, sec|0);
  const m = Math.floor(sec/60);
  const s = sec%60;
  return `${m}:${String(s).padStart(2,"0")}`;
}

export function shuffleArray(arr){
  // in-place Fisher-Yates
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashStr(input){
  // djb2 (safe for null/undefined)
  const s = String(input ?? "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

export function downloadBlob(content, filename, type){
  const blob = new Blob([content], { type: type || "application/octet-stream" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "download";
  a.rel = "noopener";

  // Safari/kurumsal ortamlarda daha stabil
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
