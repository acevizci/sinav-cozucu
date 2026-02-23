// js/ui/theme.js - tema yönetimi

export function initTheme() {
  const btn = document.getElementById("btnThemeToggle");
  if (!btn) return;

  const saved = localStorage.getItem("APP_THEME");
  const initial = normalizeTheme(saved) || "dark";
  applyTheme(initial);

  btn.onclick = () => {
    const current = getCurrentThemeFromBody();
    const next = (current === "dark") ? "light"
              : (current === "light") ? "sepia"
              : "dark";
    applyTheme(next);
  };
}

function normalizeTheme(v) {
  const s = String(v || "").toLowerCase();
  return (s === "dark" || s === "light" || s === "sepia") ? s : null;
}

function getCurrentThemeFromBody() {
  if (document.body.classList.contains("light-mode")) return "light";
  if (document.body.classList.contains("sepia-mode")) return "sepia";
  return "dark";
}

function applyTheme(themeName) {
  const t = normalizeTheme(themeName) || "dark";

  document.body.classList.remove("light-mode", "sepia-mode");
  if (t === "light") document.body.classList.add("light-mode");
  if (t === "sepia") document.body.classList.add("sepia-mode");

  // İsteğe bağlı: CSS tarafında [data-theme="sepia"] gibi kullanmak için
  document.body.dataset.theme = t;

  const btn = document.getElementById("btnThemeToggle");
  if (btn) {
    btn.textContent =
      t === "dark"  ? "🌙 Koyu" :
      t === "light" ? "☀️ Açık" :
                      "📖 Kitap";
  }

  localStorage.setItem("APP_THEME", t);

  // İsteğe bağlı: diğer modüller dinleyebilsin
  window.dispatchEvent(new CustomEvent("app:theme", { detail: { theme: t } }));
}


/* ================= TANITIM TURU MANTIĞI ================= */
let currentStep = 0;

const onboardingData = [
  {
    title: "🚀 Başlangıç & Hazırlık",
    step: "Adım 1 / 4: Dosya ve Ayarlar",
    items: [
      { icon: "📂", t: "Esnek Yükleme", d: "PDF, DOCX veya metin kopyalayarak sınavlarını saniyeler içinde içeri aktar." },
      { icon: "⏱️", t: "Süre Yönetimi", d: "Gerçek sınav provası için kronometreni kur ve zamanı verimli kullan." },
      { icon: "🔀", t: "Akıllı Karıştırma", d: "Soru ve şıkları karıştırarak her seferinde benzersiz bir deneme oluştur." },
      { icon: "🌙", t: "Göz Dostu Temalar", d: "Karanlık, Aydınlık ve Sepya modları ile her ortamda konforlu çalış." }
    ]
  },
  {
    title: "✨ Yapay Zeka Desteği",
    step: "Adım 2 / 4: Akıllı Çözümler",
    items: [
      { icon: "🤖", t: "AI Cevap Anahtarı", d: "Anahtarı olmayan dosyaları Gemini ile çözdür." },
      { icon: "🏷️", t: "AI Konu Tespiti", d: "Sorularının konularını (Örn: Paragraf, Türev) otomatik etiketle." },
      { icon: "🔍", t: "Neden Doğru?", d: "Hatalı cevaplarında 'Neden?' butonuna basarak detaylı açıklama al." },
      { icon: "♻️", t: "Benzer Soru Üret", d: "Hatalı olduğun sorunun mantığında yeni bir soru üretilmesini sağla." }
    ],
    footer: `<div style="margin-top:15px; font-size:12px; text-align:center; padding:12px; background:rgba(168, 85, 247, 0.1); border-radius:10px; border:1px solid rgba(168, 85, 247, 0.3);">
      🔑 <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#a855f7; text-decoration:underline; font-weight:600;">Buraya tıklayarak ücretsiz Gemini API anahtarını alabilirsin.</a>
    </div>`
  },
  {
    title: "🧠 Öğrenme ve Analiz",
    step: "Adım 3 / 4: Kalıcı Hafıza",
    items: [
      { icon: "📄", t: "Gelişmiş Hata Raporu", d: "HTML raporunda konu dağılımını ve eksiklerini grafiklerle incele." },
      { icon: "📅", t: "SM-2 Algoritması", d: "SRS sistemi, hatalarını unutmana izin vermeden sana tekrar hatırlatır." },
      { icon: "📊", t: "Performans Karnesi", d: "Sınav sonu grafiklerini inceleyerek başarı oranını anlık takip et." },
      { icon: "🎯", t: "Focus Modu", d: "Tüm arayüzü gizle, sadece soruya odaklan ve sınav stresini yönet." }
    ]
  },
  {
    title: "🐶 Oyunlaştırma & Motivasyon",
    step: "Adım 4 / 4: Pati Seni Bekliyor!",
    items: [
      { icon: "🍖", t: "Mama Kazan", d: "Her doğru cevap sana mama (kemik) kazandırır. Sınav bitince toplu ödül alırsın!" },
      { icon: "🥺", t: "Pati Acıkabilir", d: "Pati zamanla acıkır. Eğer uzun süre soru çözmezsen üzülür, onu ihmal etme." },
      { icon: "🆙", t: "Seviye Atla", d: "Kazandığın mamalarla Pati'yi besle, tokluk barını doldur ve seviyesini (LVL) yükselt." },
      { icon: "🎉", t: "Kutlama", d: "Sınavı başarıyla bitirdiğinde konfeti şöleniyle başarını kutla." }
    ]
  }
];

// Sayfa Değiştirme Fonksiyonu
window.changeStep = function(dir) {
  const next = currentStep + Number(dir || 0);

  // ✅ clamp: negatif veya overflow olmasın
  currentStep = Math.max(0, Math.min(onboardingData.length, next));

  // Son adımdan sonra "Başlayalım" denirse kapat
  if (currentStep >= onboardingData.length) {
    closeWelcomeModal();
    return;
  }
  renderStep();
};

// Modalı Kapatma ve Kaydetme
window.closeWelcomeModal = function() {
  const modal = document.getElementById('welcomeModal');
  if (modal) {
    modal.style.display = 'none';
    localStorage.setItem('welcome_shown', 'true');
  }
};

// İçeriği Ekrana Basma Fonksiyonu
function renderStep() {
  const data = onboardingData?.[currentStep];
  if (!data) return;

  const titleEl = document.getElementById('welcomeTitle');
  const stepEl  = document.getElementById('welcomeStepText');
  const content = document.getElementById('onboardingContent');

  // ✅ null-safe
  if (titleEl) titleEl.textContent = data.title || "";
  if (stepEl)  stepEl.textContent  = data.step || "";
  if (!content) return;

  content.innerHTML = `
    <div class="onboarding-page" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; animation: fadeIn 0.4s ease;">
      ${(data.items || []).map(item => `
        <div class="step-item" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--stroke); display: flex; gap: 12px; align-items: start;">
          <div class="step-icon" style="font-size: 20px; background:rgba(255,255,255,0.05); width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:8px;">${item.icon}</div>
          <div class="step-text" style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
            <strong style="display: block; color: var(--text-main); margin-bottom: 2px;">${item.t}</strong>
            ${item.d}
          </div>
        </div>
      `).join('')}
    </div>
    ${data.footer || ''}
  `;

  // Butonları Yönet
  const btnPrev = document.getElementById('btnPrevStep');
  const btnNext = document.getElementById('btnNextStep');

  if (btnPrev) btnPrev.style.display = currentStep === 0 ? 'none' : 'block';
  if (btnNext) btnNext.textContent =
    currentStep === onboardingData.length - 1 ? 'Başlayalım! 🚀' : 'Devam Et';

  // Noktaları (Dots) Güncelle
  const dots = document.querySelectorAll('#stepDots .dot');
  dots.forEach((dot, idx) => {
    if (idx === currentStep) {
      dot.style.background = 'var(--accent)';
      dot.style.width = '24px';
      dot.style.opacity = '1';
    } else {
      dot.style.background = 'var(--glass2)';
      dot.style.width = '8px';
      dot.style.opacity = '0.5';
    }
  });
}

// Başlatma (Sayfa Yüklendiğinde) — daha erken
document.addEventListener('DOMContentLoaded', () => {
  if (!localStorage.getItem('welcome_shown')) {
    const m = document.getElementById('welcomeModal');
    if (m) {
      m.style.display = 'flex';
      renderStep();
    }
  }
});
