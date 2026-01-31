export const el = (id) => document.getElementById(id);

export function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

export function normalizeText(t){
  return (t||"")
    .replace(/\r\n/g,"\n").replace(/\r/g,"\n").replace(/\u00A0/g," ")
    .replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n")
    .trim();
}

export function formatTime(sec){
  sec = Math.max(0, sec|0);
  const m = Math.floor(sec/60);
  const s = sec%60;
  return `${m}:${String(s).padStart(2,"0")}`;
}

export function shuffleArray(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashStr(s){
  // djb2
  let h = 5381;
  for (let i=0;i<s.length;i++) h = ((h<<5)+h) + s.charCodeAt(i);
  return (h>>>0).toString(16);
}

export function downloadBlob(content, filename, type){
  const blob = new Blob([content], {type});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

