// js/drive.js - Google Drive API Client (Auto-Patch Version)
// Uses OAuth access token provided by auth.js

import { showToast, setLoading } from "./ui.js";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

// 🔥 1. NET VE RENKLİ SVG İKONLAR
const ICONS = {
    folder: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><path d="M10 4H4C2.9 4 2.01 4.9 2.01 6L2 18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V8C22 6.9 21.1 6 20 6H12L10 4Z" fill="#FFC107"/><path d="M20 6H12L10 4H4C2.9 4 2.01 4.9 2.01 6L2 8H22V6H20Z" fill="#FFCA28"/></svg>`,
    
    pdf: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><path d="M20 2H8C6.9 2 6 2.9 6 4V16C6 17.1 6.9 18 8 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#F44336"/><path d="M4 6H2V20C2 21.1 2.9 22 4 22H18V20H4V6Z" fill="#D32F2F"/><text x="7" y="14" fill="white" font-family="Arial" font-weight="bold" font-size="6">PDF</text></svg>`,
    
    word: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><path d="M20 2H8C6.9 2 6 2.9 6 4V16C6 17.1 6.9 18 8 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#4285F4"/><path d="M4 6H2V20C2 21.1 2.9 22 4 22H18V20H4V6Z" fill="#1976D2"/><text x="7" y="14" fill="white" font-family="Arial" font-weight="bold" font-size="6">DOC</text></svg>`,
    
    excel: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><path d="M20 2H8C6.9 2 6 2.9 6 4V16C6 17.1 6.9 18 8 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#4CAF50"/><path d="M4 6H2V20C2 21.1 2.9 22 4 22H18V20H4V6Z" fill="#388E3C"/><text x="7" y="14" fill="white" font-family="Arial" font-weight="bold" font-size="6">XLS</text></svg>`,
    
    ppt: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><path d="M20 2H8C6.9 2 6 2.9 6 4V16C6 17.1 6.9 18 8 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2Z" fill="#FF9800"/><path d="M4 6H2V20C2 21.1 2.9 22 4 22H18V20H4V6Z" fill="#F57C00"/><text x="7" y="14" fill="white" font-family="Arial" font-weight="bold" font-size="6">PPT</text></svg>`,
    
    image: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><rect x="2" y="2" width="20" height="20" rx="2" fill="#9C27B0"/><circle cx="8.5" cy="8.5" r="1.5" fill="#E1BEE7"/><path d="M21 15L16 10L10 16L8 14L3 19H21V15Z" fill="#F3E5F5"/></svg>`,
    
    default: `<svg viewBox="0 0 24 24" fill="none" style="width:28px;height:28px;display:block;"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#9E9E9E"/><path d="M14 2V8H20" fill="#E0E0E0"/></svg>`
};

// 🔥 2. İKON SEÇİCİ (Uzantı Öncelikli)
export function getFileIcon(mimeType, fileName = "") {
  const name = fileName ? fileName.toLowerCase() : "";
  const mime = (mimeType || "").toLowerCase();
  
  // Önce Klasör
  if (mime.includes("folder")) return ICONS.folder;

  // Sonra Dosya Uzantısı (En Kesin Yöntem)
  if (name.endsWith(".pdf")) return ICONS.pdf;
  if (name.endsWith(".docx") || name.endsWith(".doc")) return ICONS.word;
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) return ICONS.excel;
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return ICONS.ppt;
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")) return ICONS.image;

  // Sonra Mime Type (Yedek)
  if (mime.includes("pdf")) return ICONS.pdf;
  if (mime.includes("word") || mime.includes("document")) return ICONS.word;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return ICONS.excel;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return ICONS.ppt;
  if (mime.includes("image")) return ICONS.image;
  
  return ICONS.default;
}

let gToken = null;
export function setDriveToken(t) { gToken = t; }

// Auth Helper
async function authedFetch(url, { retry401=true } = {}){
  let token = gToken || window.__GOOGLE_ACCESS_TOKEN || null;

  if (!token){
    if (!window.getGoogleAccessToken) throw new Error("Google token yok. auth.js yüklenmedi.");
    token = await window.getGoogleAccessToken({ forcePopup: true });
  }

  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (res.status === 401 && retry401){
    token = await window.getGoogleAccessToken({ forcePopup: true });
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }

  if (!res.ok){
    const txt = await res.text().catch(() => "");
    throw new Error(`Drive hata (${res.status}): ${txt || res.statusText}`);
  }
  return res;
}

// 🔥 3. OTOMATİK İKON YAMASI (Auto-Patcher)
// Bu fonksiyon events.js listeyi çizdikten SONRA çalışır ve ikonları düzeltir.
function applyIconPatch() {
    const list = document.getElementById("driveList");
    if (!list) return;
    
    const items = list.children; // Listelenen tüm dosyalar
    for (let item of items) {
        // Dosya adını bul
        const nameEl = item.querySelector(".driveX-name") || item.querySelector("[class*='name']");
        const iconEl = item.querySelector(".driveX-icon-box") || item.querySelector("[class*='icon']");
        
        if (nameEl && iconEl) {
            // Zaten düzelttiysek atla
            if (iconEl.getAttribute("data-patched") === "true") continue;

            const fileName = nameEl.textContent.trim();
            const mime = item.dataset.mime || ""; // Eğer events.js dataset'e yazıyorsa
            
            // Doğru ikonu bul
            const svg = getFileIcon(mime, fileName);
            
            // İkonu değiştir
            iconEl.innerHTML = svg;
            iconEl.setAttribute("data-patched", "true");
            
            // Görsel hizalama
            iconEl.style.display = "flex";
            iconEl.style.alignItems = "center";
            iconEl.style.justifyContent = "center";
        }
    }
}

// Gözlemciyi başlat (Sürekli takip eder)
let observer = null;
function startIconObserver() {
    if (observer) return;
    const list = document.getElementById("driveList");
    if (!list) return;

    observer = new MutationObserver(() => {
        applyIconPatch();
    });
    
    observer.observe(list, { childList: true, subtree: true });
}

function _statusLog(...args){
  //console.log(...args);
}

export function parseDriveFolderId(input){
  if (!input) return null;
  const s = String(input).trim();
  const m1 = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

function normalizeFile(f){
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    size: f.size,
    parents: f.parents,
  };
}

const DEFAULT_FIELDS = "files(id,name,mimeType,modifiedTime,size,parents)";

const QUERY_MIME = "(" +
  "mimeType='application/vnd.google-apps.folder' or " +
  "mimeType='application/pdf' or " +
  "mimeType='application/vnd.google-apps.document' or " +
  "mimeType contains 'text/' or " +
  "mimeType='application/json' or " +
  "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or " +
  "mimeType='application/msword'" +
")";

// --- API Functions ---

export async function listMyDriveBooklets({ folderLinkOrId=null, pageSize=200 } = {}){
  let fId = null;
  if (folderLinkOrId && typeof folderLinkOrId === 'string') fId = folderLinkOrId;
  else if (folderLinkOrId && typeof folderLinkOrId === 'object' && folderLinkOrId.folderLinkOrId) fId = folderLinkOrId.folderLinkOrId;
  
  let q;
  if (fId) {
      q = encodeURIComponent(`'${fId}' in parents and trashed=false and ${QUERY_MIME}`);
  } else {
      q = encodeURIComponent(`'root' in parents and trashed=false and ${QUERY_MIME}`);
  }

  const url =
    `${DRIVE_API}/files?q=${q}` +
    `&pageSize=${pageSize}` +
    `&fields=${encodeURIComponent(DEFAULT_FIELDS)}` +
    `&orderBy=${encodeURIComponent("folder, modifiedTime desc")}` +
    `&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  _statusLog("GET", url);
  
  try {
    const res = await authedFetch(url);
    const data = await res.json();
    const files = (data.files || []).map(normalizeFile);
    
    // UI Güncelleme (Başlık)
    const st = document.getElementById("driveStatus");
    if(st) st.textContent = fId ? "Klasör İçeriği" : "Drive Ana Dizin";

    // 🔥 Gözlemciyi başlat ve yamayı tetikle
    startIconObserver();
    
    // events.js render ettikten sonra çalışması için gecikmeli çağrılar
    setTimeout(applyIconPatch, 50);
    setTimeout(applyIconPatch, 150);
    setTimeout(applyIconPatch, 500);

    return files;
  } catch (e) {
    console.error("Drive list hatası:", e);
    return [];
  }
}

export async function listFolderBooklets({ folderLinkOrId, pageSize=200 } = {}){
  const folderId = parseDriveFolderId(folderLinkOrId);
  if (!folderId) throw new Error("Klasör ID çözülemedi.");
  return await listMyDriveBooklets({ folderLinkOrId: folderId, pageSize });
}

export async function fetchBookletText(fileId, mimeType){
  if (!fileId) throw new Error("fileId yok");
  let url = null;

  if (mimeType === "application/vnd.google-apps.document"){
    url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`;
  } else {
    url = `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`;
  }

  const res = await authedFetch(url);
  return await res.text();
}

export async function fetchDriveFileAsFileOrText({ id, mimeType, name }){
  if (!id) throw new Error("fileId yok");
  if (mimeType === "application/vnd.google-apps.document"){
    const text = await fetchBookletText(id, mimeType);
    return { kind: "text", text, name };
  }

  const url = `${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`;
  const res = await authedFetch(url);
  const blob = await res.blob();

  if (mimeType === "application/pdf" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/msword"){
    const file = new File([blob], name || "drive_file", { type: mimeType || blob.type || "" });
    return { kind: "file", file, name };
  }

  const text = await blob.text();
  return { kind: "text", text, name };
}

// Not: listBooklets exportunu sildim çünkü listFolderBooklets zaten var.