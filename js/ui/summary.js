// js/ui/summary.js - Sonuç Özeti Modalı (V2 - Akıllı Hesaplama)

import { escapeHtml, wrongBookDashboard } from "./shared.js";
import { showToast } from "./status.js";
import { refreshSubjectChart } from "./subjects.js";

// ✅ YENİ HELPER: Kesin Doğru Cevabı Bul (Her yere bakar)
function getCorrectAnswerSafe(q, keyMap) {
  if (!q) return null;
  
  // 1. Cevap anahtarından dene (Sayı ve String olarak)
  let val = keyMap?.[q.n] || keyMap?.[String(q.n)] || keyMap?.[Number(q.n)];

  // 2. Sorunun içinden dene
  if (!val) {
    val = q.answer || q.correctAnswer || q.dogruCevap || q._answerFromSolution;
  }

  // 3. Temizle (Boşlukları at, büyük harf yap)
  if (val && typeof val === 'string') {
    const m = val.match(/[A-F]/i);
    if (m) return m[0].toUpperCase();
    return val.trim().toUpperCase();
  }
  
  return val;
}

// ✅ summary.js local helper: shuffle olsa bile correctId -> görünen harf (A-F)
function getCorrectDisplayLetter(q, correctId) {
  if (!q || !correctId) return null;

  const cid = String(correctId).toUpperCase().trim();

  // Eğer zaten harf geliyorsa (A-F) direkt döndür
  if (/^[A-F]$/.test(cid)) return cid;

  // Bazı akışlarda correctId option.id olabilir (shuffle sonrası id -> harf map)
  const opts = q.optionsByLetter || {};
  for (const L of ["A", "B", "C", "D", "E", "F"]) {
    const opt = opts[L];
    if (!opt) continue;
    const oid = String(opt.id || "").toUpperCase().trim();
    if (oid && oid === cid) return L;
  }

  // Fallback: içinden harf yakalamaya çalış
  const m = cid.match(/[A-F]/);
  return m ? m[0] : null;
}

// ✅ multi destek gerekiyorsa: "ACEF" -> Set("A","C","E","F")
function _toLetterSet(v) {
  if (!v) return new Set();
  const s = String(v).toUpperCase();
  const letters = s.match(/[A-F]/g) || [];
  return new Set(letters);
}

let summaryChartInstance = null;

export function openSummaryModal({ total, answered, correct, score, wrong=0, blank=0, keyMissing=0, timeSpent='0:00', title }){
  const overlay = document.getElementById("summaryModal");
  if (!overlay) return;

  const sub = document.getElementById("summarySub");
  if (sub) sub.textContent = title ? `"${title}" sonuçları` : "Sonuçlar";

  // Veri Yaz
  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent = String(v ?? 0); };
  set("mSumQ", total); set("mSumA", answered); set("mSumC", correct);
  set("mSumW", wrong); set("mSumB", blank); set("mScoreDisplay", score);

  // Süre Hesap
  let avgText = "-";
  if (answered > 0 && timeSpent) {
    const parts = timeSpent.split(":");
    if (parts.length === 2) {
      const totalSec = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
      const avg = Math.round(totalSec / answered);
      avgText = avg + "sn";
    }
  }
  set("mSumAvg", avgText);

  // --- 1. GRAFİK: Genel Doughnut ---
  const ctx = document.getElementById('summaryChart');
  if (ctx && window.Chart) {
    if (summaryChartInstance) summaryChartInstance.destroy();
    summaryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ["Doğru", "Yanlış", "Boş"],
        datasets: [{
          data: [correct, wrong, blank],
          backgroundColor: ['#34C759', '#FF453A', '#3a3a3c'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: true } }
      }
    });
  }

  // --- 2. GRAFİK: Konu Analizi ---
  refreshSubjectChart();

  // --- Buton ve Modal Mantığı ---
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden","false");
  
  const close = () => closeSummaryModal();

  const btnX = document.getElementById("btnCloseSummary");
  const btnOk = document.getElementById("btnOkSummary");
  if (btnX) btnX.onclick = close;
  if (btnOk) btnOk.onclick = close;

  const btnReview = document.getElementById("btnReviewWrongs");
  if (btnReview) {
    btnReview.style.display = (wrong > 0) ? "block" : "none";
    // Eski listener'ı temizlemek için clone
    const newBtnRev = btnReview.cloneNode(true);
    btnReview.parentNode.replaceChild(newBtnRev, btnReview);
    
    newBtnRev.onclick = () => {
      close();
      const chkWrong = document.getElementById("showOnlyWrong");
      if (chkWrong) { 
        chkWrong.checked = true; 
        chkWrong.dispatchEvent(new Event('change')); 
      }
      // İlk yanlış soruya git
      const firstWrong = document.querySelector(".navBtn.wrong");
      if (firstWrong) firstWrong.click();
    };
  }

  const btnRetry = document.getElementById("btnRetryWrongs");
  if (btnRetry) {
    btnRetry.style.display = (wrong > 0) ? "block" : "none";
    const newBtnRetry = btnRetry.cloneNode(true);
    btnRetry.parentNode.replaceChild(newBtnRetry, btnRetry);

    // 🔥 FIX: Hataları Tekrarla Mantığı (GÜÇLENDİRİLMİŞ)
    newBtnRetry.onclick = () => {
      try {
        const state = window.__APP_STATE;
        
        // Eğer global değişkenlerde fonksiyonlar yoksa uyarı ver
        if (!state || !state.parsed) { 
           console.error("APP STATE EKSİK");
           return; 
        }

        const keyMap = state.parsed.answerKey || {};

        // Yanlışları Filtrele
        const wrongQuestions = (state.parsed.questions || []).filter(q => {
            const userAns = state.answers?.get?.(q.n);
            if (!userAns) return false; // Boşları yanlış sayma (isteğe bağlı)

            // Doğru cevabı akıllıca bul
            const correctRaw = getCorrectAnswerSafe(q, keyMap);
            if (!correctRaw) return false; // Cevap anahtarı yoksa geç

            // Ekranda görünen harfi bul (Shuffle desteği)
            const correctLetter = getCorrectDisplayLetter(q, correctRaw);
            
            // Kıyasla
            return userAns !== correctLetter;
        });

        if (wrongQuestions.length === 0) { 
            window.showToast?.({id:"NO_REPEAT_WRONG_FOUND", kind:"warn"}); 
            return; 
        }

        // State Güncelleme
        state.parsed.questions = wrongQuestions;
        state.answers = new Map();
        state.mode = "exam";
        state.startedAt = new Date().toISOString();
        state.timeLeftSec = state.durationSec ?? (20*60); // Süreyi sıfırla

        // Global fonksiyonları çağır (window üzerinden)
        if (window.__APP_PAINT_ALL) window.__APP_PAINT_ALL();
        if (window.__APP_PERSIST) window.__APP_PERSIST();

        close();

        // Filtreyi temizle
        const chkWrong = document.getElementById("showOnlyWrong");
        if (chkWrong) chkWrong.checked = false;

        if (window.showToast) {
            window.showToast({ id:"SUMMARY_RETRY_STARTED", vars:{ count: wrongQuestions.length }, kind:"warn" });
        }
        
        window.scrollTo({ top: 0, behavior: "smooth" });

      } catch (e) {
        console.error("Retry Error:", e);
        window.showToast?.({ id:"SUMMARY_RETRY_FAILED", vars:{ reason: (e?.message||"") }, kind:"bad" });
      }
    };
  }

  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  function esc(e){ if (e.key === "Escape"){ close(); document.removeEventListener("keydown", esc); } }
  document.addEventListener("keydown", esc);
}

export function closeSummaryModal(){
  const overlay = document.getElementById("summaryModal");
  if (overlay){ 
    overlay.style.display = "none"; 
    overlay.setAttribute("aria-hidden","true");
  }
}