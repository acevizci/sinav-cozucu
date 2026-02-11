// js/auth.js (module) - Firebase init + UI overlay + Google Drive OAuth token helper
// Single source of truth for auth globals: window.auth, window.googleProvider, window.signInWithPopup
// Keeps the rest of the app unchanged (app.js can keep using window.auth if it does).

import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
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

// Init once (avoid "already exists" if index.html or other module initializes too)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Provider (Drive scope included)
const googleProvider = new GoogleAuthProvider();
googleProvider.addScope("https://www.googleapis.com/auth/drive.readonly");
googleProvider.setCustomParameters({ prompt: "consent", include_granted_scopes: "true" });

// Expose globals for backward compatibility
window.auth = auth;
window.googleProvider = googleProvider;
window.signInWithPopup = signInWithPopup;
window.signOut = signOut;

// ---- Drive OAuth access token cache (for Google Drive REST API) ----
const TOKEN_LS_KEY = "acumen_google_access_token";
window.__GOOGLE_ACCESS_TOKEN = localStorage.getItem(TOKEN_LS_KEY) || null;

let __AUTH_POPUP_IN_FLIGHT = false;

function _saveAccessToken(t) {
  window.__GOOGLE_ACCESS_TOKEN = t || null;
  if (t) localStorage.setItem(TOKEN_LS_KEY, t);
  else localStorage.removeItem(TOKEN_LS_KEY);
}

// Gets a Google OAuth access token with Drive scope.
// It first tries cached token; if missing/forced, triggers a popup (user gesture required).
window.getGoogleAccessToken = async function getGoogleAccessToken({ forcePopup = false } = {}) {
  if (!forcePopup && window.__GOOGLE_ACCESS_TOKEN) return window.__GOOGLE_ACCESS_TOKEN;

  if (__AUTH_POPUP_IN_FLIGHT) throw new Error("Login popup zaten açık.");
  __AUTH_POPUP_IN_FLIGHT = true;

  try {
    const res = await signInWithPopup(auth, googleProvider);
    const cred = GoogleAuthProvider.credentialFromResult(res);
    const accessToken = cred?.accessToken || null;

    console.log("[DriveToken] accessToken:", accessToken ? (accessToken.slice(0, 12) + "...") : accessToken);

    if (!accessToken) {
      _saveAccessToken(null);
      throw new Error("Google OAuth access token alınamadı. Drive izni verilmemiş olabilir.");
    }

    _saveAccessToken(accessToken);
    return accessToken;
  } finally {
    __AUTH_POPUP_IN_FLIGHT = false;
  }
};

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
      (localStorage.getItem("user_name") || "Şampiyon");

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
      console.log("Giriş Başarılı:", user.displayName);

      if (loginOverlay) loginOverlay.style.display = "none";

      const firstName = getFirstNameFromUser(user);
      if (btnLogout) {
        btnLogout.style.display = "flex";
        setLogoutLabelSafe(btnLogout, `Çıkış (${firstName})`);
      }
      if (headerName) headerName.textContent = firstName;

      if (user.displayName) localStorage.setItem("user_name", String(user.displayName));
      hideError();
    } else {
      if (loginOverlay) loginOverlay.style.display = "flex";
      if (btnLogout) btnLogout.style.display = "none";
      // also clear cached drive token on logout/state reset
      _saveAccessToken(null);
    }
  });

  if (btnLogin) {
    btnLogin.addEventListener("click", async () => {
      hideError();
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
    btnLogout.addEventListener("click", async () => {
      try {
        await signOut(auth);
      } catch (err) {
        console.error("Çıkış Hatası:", err);
      } finally {
        _saveAccessToken(null);
      }
    });
  }
});
