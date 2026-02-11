// js/ui/version.js - sürüm modalı (side-effect)

/* ================= SÜRÜM YÖNETİMİ ================= */

// 1. GÜNCEL SÜRÜM BİLGİLERİ (Burası senin kumanda merkezin)
const CURRENT_VER = "1.2.2"; // Her güncellemede burayı değiştir

const UPDATE_NOTES = [
  { text: "🐞 <b>Hata Düzeltmesi:</b> 4 şıklı sorularda çıkan boş 'E' şıkkı (PDF Görsel) sorunu giderildi.", icon: "🔧" },
  { text: "🧠 <b>AI Konu Analizi:</b> Artık soruların konuları otomatik tespit ediliyor.", icon: "✨" },
  { text: "📊 <b>Gelişmiş Rapor:</b> Hata raporu artık konu dağılımını gösteriyor.", icon: "📈" },
  { text: "💅 <b>Yeni Tasarım:</b> Arayüz daha modern ve cam (Glassmorphism) efektli hale geldi.", icon: "🎨" }
];

// 2. KONTROL FONKSİYONU
window.checkAppVersion = function() {
  const savedVer = localStorage.getItem("app_version");

  // Eğer kayıtlı sürüm yoksa veya kodun sürümü daha yeniyse
  if (savedVer !== CURRENT_VER) {
    showUpdateModal();
  }
};

// 3. MODALI GÖSTERME
function showUpdateModal() {
  const modal = document.getElementById("updateModal");
  const badge = document.getElementById("updateVersionBadge");
  const content = document.getElementById("updateContent");

  if (!modal) return;

  // Bazı eski HTML sürümlerinde badge/content olmayabilir -> güvenli geç
  if (badge) badge.textContent = `Sürüm ${CURRENT_VER} yayında!`;

  // Listeyi oluştur (content yoksa patlama)
  if (content) {
    content.innerHTML = UPDATE_NOTES.map(note => `
      <div style="display:flex; gap:12px; align-items:start; padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid var(--stroke);">
        <span style="font-size:18px;">${note.icon || "✨"}</span>
        <span style="font-size:14px; color:var(--text); line-height:1.4;">${note.text || ""}</span>
      </div>
    `).join("");
  }

  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");

  // UX: ESC ile kapat (bozmaz)
  const esc = (e) => {
    if (e.key === "Escape") {
      try { window.closeUpdateModal?.(); } catch {}
      document.removeEventListener("keydown", esc);
    }
  };
  document.addEventListener("keydown", esc);
}

// 4. MODALI KAPATMA VE KAYDETME
window.closeUpdateModal = function() {
  const modal = document.getElementById("updateModal");
  if (modal) {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    // Yeni sürümü kaydet ki tekrar sormasın
    localStorage.setItem("app_version", CURRENT_VER);
  }
};

// Sayfa yüklendiğinde kontrol et
window.addEventListener("load", () => {
  // Hoş geldin modalı ile çakışmaması için biraz gecikmeli
  setTimeout(() => {
    try { window.checkAppVersion?.(); } catch {}
  }, 1000);
});
