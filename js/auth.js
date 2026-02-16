// js/auth.js (module) - Firebase init + UI overlay + Google Drive OAuth token helper
// Single source of truth for auth globals.
// Supports both ES Module imports and window globals.

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { appError } from "./ui/uiAlert.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ACUMEN projesi için güncel Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCy9ThyC6Oojht0lsFyngTFnJOupDngAtQ",
  authDomain: "acumen-sinav.firebaseapp.com",
  projectId: "acumen-sinav",
  storageBucket: "acumen-sinav.firebasestorage.app",
  messagingSenderId: "888520085772",
  appId: "1:888520085772:web:d9bc814c06a8b140057929",
  measurementId: "G-9ZREWM2734"
}; 

// Init once
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Provider (Drive scope included)
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/drive.readonly");
googleProvider.setCustomParameters({ prompt: "consent", include_granted_scopes: "true" });

// --- EXPORT GLOBAL VARS (Module Support) ---
export { auth, googleProvider, signInWithPopup, signOut };

// --- WINDOW GLOBALS (Legacy Support) ---
window.auth = auth;
window.googleProvider = googleProvider;
window.signInWithPopup = signInWithPopup;
window.signOut = signOut;

// ---- Drive OAuth access token cache ----
// SECURITY NOTE:
// - We intentionally DO NOT persist OAuth access tokens in localStorage.
// - sessionStorage limits persistence to the current tab/session (reduced blast radius if XSS happens).
const TOKEN_SESSION_KEY = "acumen_google_access_token";

// Choose safest available store (sessionStorage), fall back to in-memory only if blocked.
let _tokenStore = null;
try { _tokenStore = window.sessionStorage; } catch (e) { _tokenStore = null; }

window.__GOOGLE_ACCESS_TOKEN = (_tokenStore && _tokenStore.getItem(TOKEN_SESSION_KEY)) || null;

let __AUTH_POPUP_IN_FLIGHT = false;

function _saveAccessToken(t) {
  window.__GOOGLE_ACCESS_TOKEN = t || null;
  if (!_tokenStore) return; // in-memory only
  if (t) _tokenStore.setItem(TOKEN_SESSION_KEY, t);
  else _tokenStore.removeItem(TOKEN_SESSION_KEY);
}

// Safer global sign-out helper: always clears access token + cached name.
// Keeps existing module export `signOut` (firebase) intact, but overrides window.signOut
// so any legacy/global calls also clean up.
async function acumenSignOut() {
  try {
    await signOut(auth);
  } finally {
    _saveAccessToken(null);
    try { _tokenStore && _tokenStore.removeItem("user_name"); } catch (e) {}
  }
}

window.acumenSignOut = acumenSignOut;
window.signOut = acumenSignOut;

// ✅ EXPORT EDİLEN FONKSİYON (Sorunu Çözen Kısım)
export async function getGoogleAccessToken({ forcePopup = false } = {}) {
  if (!forcePopup && window.__GOOGLE_ACCESS_TOKEN) return window.__GOOGLE_ACCESS_TOKEN;

  if (__AUTH_POPUP_IN_FLIGHT) throw appError("ERR_LOGIN_POPUP_ZATEN_ACIK");
  __AUTH_POPUP_IN_FLIGHT = true;

  try {
    const res = await signInWithPopup(auth, googleProvider);
    const cred = GoogleAuthProvider.credentialFromResult(res);
    const accessToken = cred?.accessToken || null;

    //console.log("[DriveToken] accessToken:", accessToken ? (accessToken.slice(0, 12) + "...") : accessToken);

    if (!accessToken) {
      _saveAccessToken(null);
      throw appError("ERR_GOOGLE_OAUTH_ACCESS_TOKEN_ALINAMADI");
    }

    _saveAccessToken(accessToken);
    return accessToken;
  } finally {
    __AUTH_POPUP_IN_FLIGHT = false;
  }
}

// Window global olarak da erişilebilir olsun
window.getGoogleAccessToken = getGoogleAccessToken;

// --- UI wiring ---
window.addEventListener("load", () => {
  const messages = [
    "Hav hav! Hoş geldin, kemiklerim... yani kalemlerin hazır mı? 🦴✏️",
    "Bugün harika bir gün! Beyin jimnastiği yapmaya ne dersin? 🧠🤸‍♀️",
    "Pati seni beklerken çok sıkıldı... Hadi biraz soru çözüp onu neşelendir! 🐶✨",
    "Dikkat dikkat! Yüksek zeka alarmı! Sisteme giriş yapılıyor! 🚨😎",
    "Mama saati yaklaşıyor ama önce biraz bilgi depolayalım! 🍖📚",
    "Uyku tulumumdan çıktım, seninle soru çözmeye hazırım şampiyon! 🏆💤",
    "Birileri rekor mu kırmak istiyor? Bence bugün tam günü! 🚀",
    "Bugün kaç net yapacağız? Pati çok merak ediyor! 🤔📈",
    "Sadece senin için kuyruğumu sallıyorum! Hadi başlayalım! 🐕❤️",
    "Soru canavarları korksun, Pati iş başında! 👻🚫"
  ];

  const msgEl = document.getElementById("welcomeMsg");
  if (msgEl) msgEl.textContent = messages[Math.floor(Math.random() * messages.length)];

  const loginOverlay = document.getElementById("loginOverlay");
  const btnLogin = document.getElementById("btnLoginGoogle");
  const btnLogout = document.getElementById("btnLogout");
  const errorBox = document.getElementById("loginError");
  const headerName = document.getElementById("headerUserName");

  function showError(msg) {
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }
  function hideError() {
    if (!errorBox) return;
    errorBox.style.display = "none";
  }
  function getFirstNameFromUser(user) {
    const raw =
      (user?.displayName && String(user.displayName).trim()) ||
      (_tokenStore && _tokenStore.getItem("user_name") || "Şampiyon");

    const first = String(raw).trim().split(/\s+/)[0];
    return first || "Şampiyon";
  }
  function setLogoutLabelSafe(btn, label) {
    if (!btn) return;
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;

    const hasChildEls = btn.children && btn.children.length > 0;
    if (!hasChildEls) {
      btn.textContent = label;
      return;
    }
    btn.innerHTML = btn.dataset.originalHtml;
    btn.appendChild(document.createTextNode(` ${label}`));
  }

  // Default: show overlay until auth state known
  if (loginOverlay) loginOverlay.style.display = "flex";

  onAuthStateChanged(auth, (user) => {
    if (user) {
      //console.log("Giriş Başarılı:", user.displayName);

      if (loginOverlay) loginOverlay.style.display = "none";

      const firstName = getFirstNameFromUser(user);
      if (btnLogout) {
        btnLogout.style.display = "flex";
        setLogoutLabelSafe(btnLogout, `Çıkış (${firstName})`);
      }
      if (headerName) headerName.textContent = firstName;

      if (user.displayName) _tokenStore && _tokenStore.setItem("user_name", String(user.displayName));
      hideError();
      try { window.__ACUMEN_LOGGED_IN = true; window.dispatchEvent(new CustomEvent("acumen:auth", { detail: { state: "in", user: { uid: user.uid, displayName: user.displayName || "" } } })); } catch (e) {}
    } else {
      if (loginOverlay) loginOverlay.style.display = "flex";
      if (btnLogout) btnLogout.style.display = "none";
      _saveAccessToken(null);
      try { _tokenStore && _tokenStore.removeItem("user_name"); } catch (e) {}
      try { window.__ACUMEN_LOGGED_IN = false; window.dispatchEvent(new CustomEvent("acumen:auth", { detail: { state: "out" } })); } catch (e) {}
    }
  });

  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      hideError();
      try { window.__ACUMEN_LOGGED_IN = true; window.dispatchEvent(new CustomEvent("acumen:auth", { detail: { state: "in", user: { uid: user.uid, displayName: user.displayName || "" } } })); } catch (e) {}
      try {
        const res = await signInWithPopup(auth, googleProvider);
        const cred = GoogleAuthProvider.credentialFromResult(res);
        _saveAccessToken(cred?.accessToken || null);
      } catch (err) {
        console.error("Giriş Hatası:", err);
        showError("Hata: " + (err?.message || "Bilinmeyen hata"));
      }
    });
  }

  if (btnLogout) {
    // Logout UX is handled by the dedicated confirmation modal (logoutModal).
    // Fallback: if modal is not present for any reason, do a direct sign-out.
    const logoutModal = document.getElementById("logoutModal");
    if (!logoutModal) {
      btnLogout.addEventListener("click", async () => {
        try {
          await acumenSignOut();
        } catch (err) {
          console.error("Çıkış Hatası:", err);
        }
      });
    }
  }
});
