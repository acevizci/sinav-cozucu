// js/ui/mode_stats.js - mode rozeti + KPI

import { safe, safeText, safeShow } from "./shared.js";
import { getChosenOptionId, getCorrectDisplayLetter } from "./shared.js";

function setControlStatus(type, text){
  const label = document.getElementById("parseStatus");
  const indicator = document.querySelector(".status-indicator");
  if (label) {
    label.textContent = text;
    label.classList.remove("ready","loading","running","finished");
    label.classList.add(type);
  }
  if (indicator) {
    indicator.classList.remove("ready","loading","running","finished");
    indicator.classList.add(type);
  }
}

export function updateModeUI(state, wrongStats) {
  // --- 1. HEADER ROZET VE RENK AYARLARI ---
  const modeBadge = document.getElementById("statusBadgeMode");
  const modeLabel = document.getElementById("modeLabel");

  const title = state?.parsed ? (state.parsed.title || "") : "";
  const isSrsTitle = /Tekrar\s*\(SRS\)/i.test(title);
  const isSrs = !!(state?.srsReview || isSrsTitle); // ✅ title + flag birlikte

  if (modeBadge && modeLabel) {
    // reset (inline)
    modeBadge.style.background = "";
    modeBadge.style.borderColor = "";
    modeBadge.style.color = "";

    if (state?.mode === "exam") {
      // 🟠 SINAV MODU
      modeLabel.textContent = "Sınav Modu";
      modeBadge.style.background = "rgba(249, 115, 22, 0.15)";
      modeBadge.style.borderColor = "rgba(249, 115, 22, 0.3)";
      modeBadge.style.color = "#fb923c";
    }
    else if (state?.mode === "result") {
      // 🟣 SONUÇ MODU
      modeLabel.textContent = "Sonuçlar";
      modeBadge.style.background = "rgba(168, 85, 247, 0.15)";
      modeBadge.style.borderColor = "rgba(168, 85, 247, 0.3)";
      modeBadge.style.color = "#d8b4fe";
    }
    else {
      // Hazırlık / Tekrar
      if (isSrs) {
        modeLabel.textContent = "Tekrar (SRS)";
        modeBadge.style.background = "rgba(16, 185, 129, 0.15)";
        modeBadge.style.borderColor = "rgba(16, 185, 129, 0.3)";
        modeBadge.style.color = "#34d399";
      } else {
        modeLabel.textContent = "Hazırlık";
        // cam görünüm CSS'ten gelsin
      }
    }
  } else {
    // fallback
    safeText("modeLabel",
      state?.mode === "prep" ? "Hazırlık" :
      state?.mode === "exam" ? "Sınav" :
      state?.mode === "result" ? "Sonuç" : "—"
    );
  }

  // --- 2. KEY LABEL ---
  if (!state?.parsed) {
    safeText("keyLabel", "—");
  } else {
    const totalQ = state.parsed.questions?.length || 0;
    const keyCount = state.parsed.keyCount || 0;
    const cov = state.parsed.meta?.keyCoverage ?? (totalQ ? keyCount / totalQ : 0);
    const src = state.parsed.meta?.keySource;

    if (src === "ai") safeText("keyLabel", "AI (Gemini)");
    else if (!keyCount) safeText("keyLabel", "Yok");
    else if (cov < 0.95) safeText("keyLabel", "Kısmi");
    else safeText("keyLabel", "Mevcut");
  }

  // --- 3. BUTON KİLİTLERİ ---
  const btn = (id, cond) => {
    const b = safe(id);
    if (b) b.disabled = !cond;
  };
  btn("btnStart", !!(state?.parsed && state.mode === "prep"));
  btn("btnFinish", !!(state?.parsed && state.mode === "exam"));

  // Sonuç araçlarını gizle/göster
  const rt = safe("resultTools");
  if (rt) rt.style.display = (state?.parsed && state.mode === "result") ? "flex" : "none";

  // --- 4. YANLIŞ DEFTERİ BUTONU ---
  const total = (typeof wrongStats === "number") ? wrongStats : (wrongStats?.total || 0);
  const due   = (typeof wrongStats === "number") ? wrongStats : (wrongStats?.due ?? total);

  const wbtn = safe("btnWrongMode");
  if (wbtn) {
    wbtn.disabled = !(total > 0 && state?.mode !== "exam");
    wbtn.textContent = total > 0 ? `♻ Tekrar (Bugün ${due} / Toplam ${total})` : "♻ Tekrar (0)";
  }
  
  // --- 5. KONTROL MERKEZİ DURUMU (Hazır / Sınav / Bitti) ---
try {
  const m = state?.mode;
  const isParsing = !!(state?.isParsing || state?.parsing || state?.loading || state?.isLoading || state?.busy);
  if (isParsing && !state?.parsed) {
    setControlStatus("loading", "Yükleniyor");
  } else if (m === "exam") {
    setControlStatus("running", "Sınav");
  } else if (m === "result") {
    setControlStatus("finished", "Bitti");
  } else {
    setControlStatus("ready", "Hazır");
  }
} catch {}

// --- SCRATCHPAD (Karalama) - single source of truth ---
try {
  const spBtn = document.getElementById("btnScratchpad");
  if (spBtn) spBtn.style.display = (state?.mode === "exam") ? "inline-flex" : "none";

  window.Scratchpad?.onModeChange?.(state);

 if (state?.mode === "result") {
  try { window.clearScratchpad?.(); } catch (e) {}
}
} catch (e) {}
}

// ✅ Adil skor: yalnızca anahtarı olan sorular paydada.
export function updateStats(state){
  if (!state?.parsed) return;

  const qs = state.parsed.questions || [];
  const total = qs.length;

  // Map + Object uyumu
  const answersRaw = state.answers;
  const answers = (answersRaw instanceof Map) ? answersRaw : {
    size: answersRaw ? Object.keys(answersRaw).length : 0,
    get(qn){
      if (!answersRaw) return undefined;
      return answersRaw[qn] ?? answersRaw[String(qn)];
    }
  };

  const answered = answers.size || 0;

  const keyMap = state.parsed.answerKey || {};

  let correctCount = 0;
  let keyedTotal = 0;      // ✅ payda: anahtarlı soru sayısı
  let keyedAnswered = 0;   // opsiyonel: anahtarlı ve cevaplanmış

  for (const q of qs){
    if (!q) continue;

    const correctId = keyMap[q.n];
    if (!correctId) continue;     // ✅ anahtar yoksa paydadan düş

    keyedTotal++;

    const chosen = answers.get(q.n);
    if (!chosen) continue;

    keyedAnswered++;

    const chosenId = getChosenOptionId(q, chosen);
    if (chosenId && String(chosenId) === String(correctId)) {
      correctCount++;
    }
  }

  // ✅ Adil skor
  const score = keyedTotal ? Math.round((correctCount / keyedTotal) * 100) : 0;

  safeShow("statsBox","grid");
  safeText("kpiQ", total);
  safeText("kpiA", answered);
  safeText("kpiC", correctCount);
  safeText("kpiS", score);

  // Opsiyonel KPI’lar (HTML’de varsa doldur, yoksa sessiz geç)
  safeText?.("kpiKQ", keyedTotal);       // "Anahtarlı Soru"
  safeText?.("kpiKA", keyedAnswered);    // "Anahtarlı Cevap"
}
