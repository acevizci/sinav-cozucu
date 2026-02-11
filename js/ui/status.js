// js/ui/status.js - status, toast, loading (V8 - Compact Premium Design)

import { escapeHtml, safe, safeText } from "./shared.js";

export function setStatus(msg){
  safeText("parseStatus", msg);
}

export function showWarn(msg){
  const wb = safe("warnBox");
  if (wb){
    if (!msg){ wb.style.display="none"; wb.textContent=""; }
    else { wb.style.display="block"; wb.textContent = msg; }
  }
  if (msg) {
    try { showToast?.({ title:"Bildirim", msg, kind:"warn" }); } catch {}
  }
}

export function showToast({ title="Bildirim", msg="", kind="ok", timeout=3600 } = {}){
  const host = document.getElementById("toastHost");
  if (!host) {
      const h = document.createElement("div");
      h.id = "toastHost";
      h.style.zIndex = "2147483600"; 
      document.body.appendChild(h);
  }
  
  const targetHost = document.getElementById("toastHost");
  const MAX = 6;
  while (targetHost.childElementCount >= MAX) {
    targetHost.firstElementChild?.remove();
  }

  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `
    <div>
      <div class="tTitle">${escapeHtml(title)}</div>
      <div class="tMsg">${escapeHtml(msg)}</div>
    </div>
  `;
  targetHost.appendChild(t);
  const ms = Number.isFinite(Number(timeout)) ? Number(timeout) : 3600;
  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 180);
  }, ms);
}

// 🔥 FIX: Compact Premium AI Glass Loading
export function setLoading(on, text="AI işlem yapıyor..."){
  let ov = document.getElementById("loadingOverlay");
  
  // 🧹 TEMİZLİK: Eski versiyonları temizle
  if (ov && !ov.classList.contains("ai-glass-overlay-v8")) {
      ov.remove();
      ov = null;
  }

  // 1. Overlay yoksa SIFIRDAN YARAT
  if (!ov) {
      if (!document.getElementById("aiLoadingStyleV8")) {
          const s = document.createElement("style");
          s.id = "aiLoadingStyleV8";
          s.textContent = `
            .ai-glass-overlay-v8 {
                background: rgba(8, 8, 12, 0.75) !important; /* Arka plan biraz daha şeffaf */
                backdrop-filter: blur(8px) !important;
                position: fixed !important;
                top: 0; left: 0; width: 100vw; height: 100vh;
                display: flex; align-items: center; justify-content: center;
                z-index: 2147483647 !important;
                flex-direction: column;
            }
            .ai-glass-card {
                position: relative;
                background: linear-gradient(145deg, rgba(35, 35, 45, 0.9), rgba(15, 15, 25, 0.95));
                border: 1px solid rgba(255, 255, 255, 0.12);
                box-shadow: 0 20px 50px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.05);
                border-radius: 20px; /* Daha kompakt köşe */
                padding: 25px 35px; /* İç boşluklar azaltıldı */
                display: flex;
                flex-direction: column;
                align-items: center;
                min-width: 220px; /* Genişlik azaltıldı */
                transform: translateY(0);
                animation: aiFloat 3s ease-in-out infinite;
            }
            .ai-icon-container {
                position: relative;
                width: 56px; /* İkon alanı küçültüldü */
                height: 56px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-bottom: 16px; /* Ara boşluk azaltıldı */
            }
            .ai-ring {
                position: absolute;
                width: 100%; height: 100%;
                border: 2.5px solid transparent; /* Çizgi inceltildi */
                border-top-color: #a855f7;
                border-right-color: #3b82f6;
                border-radius: 50%;
                animation: aiSpin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
                box-shadow: 0 0 12px rgba(168, 85, 247, 0.3);
            }
            .ai-icon-svg {
                width: 32px; /* İkon küçültüldü */
                height: 32px;
                filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6));
                animation: aiPulse 2s ease-in-out infinite;
            }
            .ai-loading-text {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
                font-family: 'Segoe UI', system-ui, sans-serif;
                font-size: 14px; /* Yazı boyutu dengelendi */
                font-weight: 600;
                letter-spacing: 0.4px;
                text-align: center;
                text-shadow: 0 2px 8px rgba(0,0,0,0.9);
                margin-top: 4px;
                opacity: 1 !important;
                visibility: visible !important;
                display: block !important;
            }
            @keyframes aiSpin { 100% { transform: rotate(360deg); } }
            @keyframes aiPulse { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.08); opacity: 1; } }
            @keyframes aiFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
          `;
          document.head.appendChild(s);
      }

      ov = document.createElement("div");
      ov.id = "loadingOverlay";
      ov.className = "modalOverlay ai-glass-overlay-v8";
      
      const svgIcon = `
        <svg class="ai-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fill="url(#grad1)" opacity="0.2"/>
            <path d="M12 6C13.66 6 15 7.34 15 9C15 10.66 13.66 12 12 12C10.34 12 9 10.66 9 9C9 7.34 10.34 6 12 6Z" fill="url(#grad1)"/>
            <circle cx="9" cy="14" r="2" fill="url(#grad2)"/>
            <circle cx="15" cy="14" r="2" fill="url(#grad2)"/>
            <path d="M12 15V18" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
            <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#a855f7;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
                </linearGradient>
                <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#06b6d4;stop-opacity:1" />
                </linearGradient>
            </defs>
        </svg>
      `;

      ov.innerHTML = `
        <div class="ai-glass-card">
            <div class="ai-icon-container">
                <div class="ai-ring"></div>
                ${svgIcon}
            </div>
            <div class="ai-loading-text" style="color:white !important;">Yükleniyor...</div>
        </div>
      `;
      
      document.body.appendChild(ov);
  }

  // 2. Metni Güncelle
  const t = ov.querySelector(".ai-loading-text");
  if (t) {
      const safeTxt = String(text ?? "AI işlem yapıyor...");
      t.textContent = safeTxt;
      t.style.setProperty('color', '#ffffff', 'important');
      t.style.setProperty('display', 'block', 'important');
  }

  // 3. Göster / Gizle
  if (on) {
    ov.style.display = "flex";
    ov.setAttribute("aria-hidden", "false");
    document.body.appendChild(ov);
  } else {
    ov.style.display = "none";
    ov.setAttribute("aria-hidden", "true");
  }
}