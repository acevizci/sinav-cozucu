// js/drive.js - Google Drive API Client (Robust & Feature Rich)
// Uses OAuth access token provided by auth.js

import { getGoogleAccessToken } from "./auth.js";
import { showToast, setLoading } from "./ui.js";

const DRIVE_API_V3 = "https://www.googleapis.com/drive/v3";

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

// 🔥 2. İKON SEÇİCİ
export function getFileIcon(mimeType, fileName = "") {
  const name = fileName ? fileName.toLowerCase() : "";
  const mime = (mimeType || "").toLowerCase();
  
  if (mime.includes("folder")) return ICONS.folder;

  if (name.endsWith(".pdf")) return ICONS.pdf;
  if (name.endsWith(".docx") || name.endsWith(".doc")) return ICONS.word;
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || name.endsWith(".csv")) return ICONS.excel;
  if (name.endsWith(".pptx") || name.endsWith(".ppt")) return ICONS.ppt;
  if (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png")) return ICONS.image;

  if (mime.includes("pdf")) return ICONS.pdf;
  if (mime.includes("word") || mime.includes("document")) return ICONS.word;
  if (mime.includes("spreadsheet") || mime.includes("excel")) return ICONS.excel;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return ICONS.ppt;
  if (mime.includes("image")) return ICONS.image;
  
  return ICONS.default;
}

// 🔥 3. ROBUST AUTH FETCH (401 Retry Mekanizması)
async function authedFetch(url, options = {}) {
  // 1. Mevcut token ile dene (Sessizce)
  let token = await getGoogleAccessToken(false); 
  
  if (!token) {
    // Token yoksa kullanıcıyı dürterek (popup) al
    token = await getGoogleAccessToken(true);
  }

  if (!token) throw new Error("Google Drive erişim izni alınamadı.");

  options.headers = {
    ...options.headers,
    "Authorization": `Bearer ${token}`
  };

  let res = await fetch(url, options);

  // 2. Eğer 401 (Yetkisiz) hatası alırsak, token süresi dolmuş olabilir.
  if (res.status === 401) {
    console.warn("[Drive] 401 Hatası alındı. Token yenileniyor...");
    
    // Token'ı ZORLA yenile (forcePopup: true mantığı auth.js içinde olmalı)
    token = await getGoogleAccessToken(true);
    
    if (token) {
      // Yeni token ile tekrar dene
      options.headers["Authorization"] = `Bearer ${token}`;
      res = await fetch(url, options);
    }
  }

  // 3. Hala hata varsa fırlat
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive API Hata (${res.status}): ${errText}`);
  }

  return res;
}

// 🔥 4. OTOMATİK İKON YAMASI (Auto-Patcher)
function applyIconPatch() {
    const list = document.getElementById("driveList");
    if (!list) return;
    
    const items = list.children;
    for (let item of items) {
        const nameEl = item.querySelector(".driveX-name") || item.querySelector("[class*='name']");
        const iconEl = item.querySelector(".driveX-icon-box") || item.querySelector("[class*='icon']");
        
        if (nameEl && iconEl) {
            if (iconEl.getAttribute("data-patched") === "true") continue;

            const fileName = nameEl.textContent.trim();
            const mime = item.dataset.mime || ""; 
            const svg = getFileIcon(mime, fileName);
            
            iconEl.innerHTML = svg;
            iconEl.setAttribute("data-patched", "true");
            
            iconEl.style.display = "flex";
            iconEl.style.alignItems = "center";
            iconEl.style.justifyContent = "center";
        }
    }
}

// Gözlemciyi başlat
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

export function parseDriveFolderId(input){
  if (!input) return null;
  if (typeof input === "object"){
    const cand = input.id || input.folderId || input.fileId || input.file_id;
    if (cand) input = cand;
    else if (input.folderLinkOrId) input = input.folderLinkOrId;
  }
  const s = String(input).trim();
  if (s === "root") return "root";
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

const QUERY_FILES = "(" +
  "mimeType='application/pdf' or " +
  "mimeType='application/vnd.google-apps.document' or " +
  "mimeType contains 'text/' or " +
  "mimeType='application/json' or " +
  "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document' or " +
  "mimeType='application/msword'" +
")";

const QUERY_FOLDER_OR_FILES = "(" +
  "mimeType='application/vnd.google-apps.folder' or " +
  QUERY_FILES.slice(1);


// --- EXPORTED API FUNCTIONS ---

export async function listMyDriveBooklets({ folderLinkOrId="root", pageSize=200, mode="folder", queryText=null } = {}){
  const folderId = (mode === "folder") ? parseDriveFolderId(folderLinkOrId) : null;
  let qParts = [];

  if (mode === "folder"){
    if (!folderId) throw new Error("Klasör ID çözülemedi.");
    qParts = [`'${folderId}' in parents`, "trashed=false", QUERY_FOLDER_OR_FILES];
  } else {
    qParts = ["trashed=false", QUERY_FILES];
  }

  if (queryText && String(queryText).trim()){
    const t = String(queryText).trim().replace(/'/g, "\\'");
    qParts.push(`(name contains '${t}' or fullText contains '${t}')`);
  }

  const q = encodeURIComponent(qParts.join(" and "));
  const url = `${DRIVE_API_V3}/files?q=${q}&pageSize=${pageSize}&fields=${encodeURIComponent(DEFAULT_FIELDS)}&orderBy=${encodeURIComponent("modifiedTime desc")}&supportsAllDrives=true&includeItemsFromAllDrives=true`;

  try {
    const res = await authedFetch(url);
    const data = await res.json();
    const files = (data.files || []).map(normalizeFile);

    const st = document.getElementById("driveStatus");
    if(st) st.textContent = (mode === "folder") ? "Klasör İçeriği" : "Drive Dosyaları (Tümü)";

    // İkon patch işlemleri
    startIconObserver();
    setTimeout(applyIconPatch, 50);
    setTimeout(applyIconPatch, 150);
    setTimeout(applyIconPatch, 500);

    return files;
  } catch (e) {
    console.error("Drive list hatası:", e);
    throw e; // Hatayı yukarı fırlat ki UI yakalayabilsin
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

  // Google Docs Export
  if (mimeType === "application/vnd.google-apps.document"){
    url = `${DRIVE_API_V3}/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent("text/plain")}`;
  } else {
    // Binary Download
    url = `${DRIVE_API_V3}/files/${encodeURIComponent(fileId)}?alt=media`;
  }

  const res = await authedFetch(url);
  return await res.text();
}

export async function fetchDriveFileAsFileOrText({ id, mimeType, name }){
  if (!id) throw new Error("fileId yok");
  
  // 1. Google Docs ise Text Export
  if (mimeType === "application/vnd.google-apps.document"){
    const text = await fetchBookletText(id, mimeType);
    return { kind: "text", text, name };
  }

  // 2. Diğer Dosyalar (Binary Download)
  const url = `${DRIVE_API_V3}/files/${encodeURIComponent(id)}?alt=media`;
  const res = await authedFetch(url);
  const blob = await res.blob();

  // PDF veya Word ise File objesi
  if (mimeType === "application/pdf" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || mimeType === "application/msword"){
    const file = new File([blob], name || "drive_file", { type: mimeType || blob.type || "" });
    return { kind: "file", file, name };
  }

  // Diğerleri text varsayılır
  const text = await blob.text();
  return { kind: "text", text, name };
}