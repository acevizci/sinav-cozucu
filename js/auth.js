// js/auth.js (module) - Firebase init + UI overlay
// Single source of truth for auth globals: window.auth, window.googleProvider, window.signInWithPopup
// Keeps the rest of the app unchanged (app.js can keep using window.auth if it does).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Firebase config (moved from index.html)
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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// Expose globals for backward compatibility
window.auth = auth;
window.googleProvider = googleProvider;
window.signInWithPopup = signInWithPopup;
window.signOut = signOut;

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

  function showError(msg){
    if (!errorBox) return;
    errorBox.textContent = msg;
    errorBox.style.display = "block";
  }
  function hideError(){
    if (!errorBox) return;
    errorBox.style.display = "none";
  }
  function getFirstNameFromUser(user){
    const raw =
      (user && user.displayName && String(user.displayName).trim()) ||
      (localStorage.getItem("user_name") || "Şampiyon");

    const first = String(raw).trim().split(/\s+/)[0];
    return first || "Şampiyon";
  }
  function setLogoutLabelSafe(btn, label){
    if (!btn) return;
    if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;

    const hasChildEls = btn.children && btn.children.length > 0;
    if (!hasChildEls){
      btn.textContent = label;
      return;
    }
    btn.innerHTML = btn.dataset.originalHtml;
    btn.appendChild(document.createTextNode(` ${label}`));
  }

  // Default: show overlay until auth state known
  if (loginOverlay) loginOverlay.style.display = "flex";

  onAuthStateChanged(auth, (user) => {
    if (user){
      console.log("Giriş Başarılı:", user.displayName);

      if (loginOverlay) loginOverlay.style.display = "none";

      const firstName = getFirstNameFromUser(user);
      if (btnLogout){
        btnLogout.style.display = "flex";
        setLogoutLabelSafe(btnLogout, `Çıkış (${firstName})`);
      }
      if (headerName) headerName.textContent = firstName;

      if (user.displayName) localStorage.setItem("user_name", String(user.displayName));
      hideError();
    } else {
      if (loginOverlay) loginOverlay.style.display = "flex";
      if (btnLogout) btnLogout.style.display = "none";
    }
  });

  if (btnLogin){
    btnLogin.addEventListener("click", async () => {
      hideError();
      try {
        await signInWithPopup(auth, googleProvider);
      } catch (err){
        console.error("Giriş Hatası:", err);
        showError("Hata: " + (err?.message || "Bilinmeyen hata"));
      }
    });
  }
});
