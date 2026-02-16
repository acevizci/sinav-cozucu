// js/ui/uiAlert.js
// ACUMEN - Single source of truth for: warn/status/toast/loading (+ message IDs)

import { escapeHtml, safe, safeText } from "./shared.js";
import { msg as _msg, toastMsg as _toastMsg, M } from "./uiMessages.js";

// ----------------------------
// Message helpers
// ----------------------------
export const MSG = M;
export function msg(id, vars, fallback) { return _msg(id, vars, fallback); }

// ----------------------------
// Status (top bar)
// ----------------------------
export function setStatus(input = "") {
  // supports: setStatus('text') OR setStatus({ id:'EXAM_LOAD_FIRST', vars:{...} })
  const text = resolveText(input);
  safeText("parseStatus", text);
}

// ----------------------------
// AppError helper (ID-based errors)
// ----------------------------
export function appError(id, vars = {}, fallback) {
  const e = new Error(msg(id, vars, fallback));
  e.code = id;
  e.vars = vars;
  return e;
}


// ----------------------------
// Warn box (inline) + optional toast
// ----------------------------
export function showWarn(input = "", opts = {}) {
  const text = resolveText(input);

  const wb = safe("warnBox");
  if (wb) {
    if (!text) {
      wb.style.display = "none";
      wb.textContent = "";
    } else {
      wb.style.display = "block";
      wb.textContent = text;
    }
  }

  const alsoToast = opts?.toast ?? true;
  if (text && alsoToast) {
    try {
      showToast({ title: opts?.title || "Bildirim", msg: text, kind: "warn", timeout: opts?.timeout ?? 3600 });
    } catch {}
  }
}

// ----------------------------
// Toasts (bottom-right)
// ----------------------------
export function showToast(input, typeArg = "neutral") {
  // Backward compatible signatures:
  // 1) showToast({title,msg,kind,timeout})
  // 2) showToast("mesaj", "warn/success/error/neutral")
  // 3) showToast({ id:'REPORT_SENT', kind:'ok' })  (message id)

  ensureToastHost();
  const host = document.getElementById("toastHost");
  if (!host) return;

  let msgText = "";
  let kind = "ok";
  let title = null;
  let timeout = 3500;

  if (typeof input === "object" && input !== null) {
    // message id support
    if (input.id) {
      const vars = input.vars || input.params || {};
      const tt = _toastMsg(input.id, vars);
      msgText = tt.msg;
      // title from catalog unless explicitly overridden
      title = (input.title ?? null) ?? tt.title;
    } else {
      msgText = String(input.msg || input.message || "");
      title = input.title ?? null;
    }

    timeout = Number.isFinite(Number(input.timeout)) ? Number(input.timeout) : timeout;

    const k = input.kind || "neutral";
    kind = normalizeKind(k);
  } else {
    msgText = String(input ?? "");
    kind = normalizeKind(typeArg);
  }

  // Title auto
  if (!title) {
    if (kind === "ok") title = "BİLDİRİM";
    else if (kind === "warn") title = "DİKKAT";
    else if (kind === "bad") title = "HATA";
    else title = "BİLDİRİM";
  }

  const MAX = 6;
  while (host.childElementCount >= MAX) host.firstElementChild?.remove();

  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `
    <div>
      <div class="tTitle">${escapeHtml(title)}</div>
      <div class="tMsg">${escapeHtml(msgText)}</div>
    </div>
  `;
  host.appendChild(t);

  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 180);
  }, timeout);
}

function ensureToastHost() {
  if (document.getElementById("toastHost")) return;
  const h = document.createElement("div");
  h.id = "toastHost";
  h.className = "toastHost";
  h.style.zIndex = "2147483600";
  document.body.appendChild(h);
}

function normalizeKind(k) {
  const kk = String(k || "").toLowerCase();
  if (kk === "ok" || kk === "success") return "ok";
  if (kk === "bad" || kk === "error") return "bad";
  if (kk === "warn" || kk === "warning") return "warn";
  return "ok";
}

// ----------------------------
// Loading overlay (kept from your v8 glass design)
// ----------------------------
export function setLoading(on, payload = { id:"LOADING_DEFAULT" }) {
  // Supports:
  // - setLoading(true, "text")
  // - setLoading(true, { id, vars })                     -> main text
  // - setLoading(true, { main:{id,vars}, sub:{id,vars} }) -> main+sub
  // - setLoading(true, { sub:{id,vars} })                -> update only sub
  // - setLoading(true, { main:{id,vars} })               -> update only main
  const { mainText, subText } = resolveLoadingPayload(payload);
  // this is your existing v8 overlay logic (kept 1:1 as much as possible)
  let ov = document.getElementById("loadingOverlay");

  if (ov && !ov.classList.contains("ai-glass-overlay-v8")) {
    ov.remove();
    ov = null;
  }

  if (!ov) {
    if (!document.getElementById("aiLoadingStyleV8")) {
      const s = document.createElement("style");
      s.id = "aiLoadingStyleV8";
      s.textContent = `
        .ai-glass-overlay-v8 {
            background: rgba(8, 8, 12, 0.75) !important;
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
            border-radius: 20px;
            padding: 24px 34px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-width: 240px;
            transform: translateY(10px) scale(.98);
            opacity: 0;
            animation: aiCardIn .18s ease forwards;
        }
        .ai-orb {
            position: relative;
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(168, 85, 247, .28), transparent 70%);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 16px;
            animation: aiOrbBreathe 2.2s ease-in-out infinite;
        }
        .ai-orb::after {
            content: "";
            position: absolute;
            inset: -8px;
            border-radius: 50%;
            border: 1px solid rgba(168, 85, 247, .35);
            animation: aiOrbPulse 2.2s ease-out infinite;
            pointer-events: none;
        }
        .ai-ring {
            position: absolute;
            width: 100%; height: 100%;
            border: 2.5px solid transparent;
            border-top-color: #a855f7;
            border-right-color: #3b82f6;
            border-radius: 50%;
            animation: aiSpin 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite;
            box-shadow: 0 0 12px rgba(168, 85, 247, 0.3);
        }
        .ai-icon-svg {
            width: 32px;
            height: 32px;
            filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.6));
            animation: aiPulse 2s ease-in-out infinite;
        }
        .ai-loading-text {
            color: #ffffff !important;
            -webkit-text-fill-color: #ffffff !important;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 600;
            letter-spacing: 0.4px;
            text-align: center;
            text-shadow: 0 2px 8px rgba(0,0,0,0.9);
            margin-top: 4px;
            opacity: 1 !important;
            visibility: visible !important;
            display: block !important;
        }
        .ai-loading-sub {
            margin-top: 6px;
            font-size: 12px;
            opacity: .65;
            letter-spacing: .2px;
            text-align: center;
            text-shadow: 0 2px 8px rgba(0,0,0,0.9);
        }
        @keyframes aiSpin { 100% { transform: rotate(360deg); } }
        @keyframes aiPulse { 0%, 100% { transform: scale(1); opacity: 0.85; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes aiOrbBreathe { 0%,100% { transform: scale(1); opacity:.85; } 50% { transform: scale(1.05); opacity:1; } }
        @keyframes aiOrbPulse { 0% { transform: scale(1); opacity:.7; } 100% { transform: scale(1.35); opacity:0; } }
        @keyframes aiCardIn { from { transform: translateY(10px) scale(.98); opacity: 0; } to { transform: translateY(0) scale(1); opacity: 1; } }
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
          <div class="ai-orb">
              <div class="ai-ring"></div>
              ${svgIcon}
          </div>
          <div class="ai-loading-text" style="color:white !important;">${escapeHtml(msg("LOADING_DEFAULT"))}</div>
          <div class="ai-loading-sub">${escapeHtml(msg("LOADING_SUB"))}</div>
      </div>
    `;

    document.body.appendChild(ov);
  }

  const t = ov.querySelector(".ai-loading-text");
  const s = ov.querySelector(".ai-loading-sub");

  if (t && typeof mainText === "string") {
    const safeTxt = String(mainText || msg("LOADING_DEFAULT"));
    t.textContent = safeTxt;
    t.style.setProperty("color", "#ffffff", "important");
    t.style.setProperty("display", "block", "important");
  }

  if (s && typeof subText === "string") {
    s.textContent = String(subText || msg("LOADING_SUB"));
  }

  if (on) {
    ov.style.display = "flex";
    ov.setAttribute("aria-hidden", "false");
    document.body.appendChild(ov);
  } else {
    ov.style.display = "none";
    ov.setAttribute("aria-hidden", "true");
  }
}

// ----------------------------
// Global binding (optional)
// ----------------------------
export function bindGlobal() {
  // allow legacy code to keep working
  window.showToast = showToast;
  window.showWarn = showWarn;
  window.setStatus = setStatus;
  window.setLoading = setLoading;
  window.uiMsg = msg;
  window.UI_MSG = MSG;
  window.appError = appError;
}

// ----------------------------
// Internals
// ----------------------------
function resolveText(input) {
  // string -> string
  if (typeof input === "string") return input;

  // {id, vars} -> message
  if (input && typeof input === "object" && input.id) {
    return msg(input.id, input.vars || input.params || {}, input.fallback || "");
  }

  // Error
  if (input instanceof Error) return input.message || msg("UNKNOWN_ERROR");

  // anything else
  return String(input ?? "");
}

function resolveLoadingPayload(payload) {
  // String -> main
  if (typeof payload === "string") {
    return { mainText: payload, subText: undefined };
  }

  // Error -> main
  if (payload instanceof Error) {
    return { mainText: payload.message || msg("UNKNOWN_ERROR"), subText: undefined };
  }

  // {main, sub} form
  if (payload && typeof payload === "object" && (payload.main || payload.sub)) {
    const mainText = payload.main ? resolveText(payload.main) : undefined;
    const subText = payload.sub ? resolveText(payload.sub) : undefined;
    return { mainText, subText };
  }

  // {id, vars} -> main
  if (payload && typeof payload === "object" && payload.id) {
    return { mainText: resolveText(payload), subText: undefined };
  }

  // anything else -> string main
  return { mainText: String(payload ?? ""), subText: undefined };
}
