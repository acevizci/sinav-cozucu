// js/ui/subjects.js - konu yardımcıları + grafik

import { getQuestionSubject } from "./shared.js";
import { getChosenOptionId } from "./shared.js";

export function refreshSubjectChips(){
  const state = window.__APP_STATE;
  const qs = state?.parsed?.questions || [];

  for (const q of qs){
    const n = q?.n;
    if (!n) continue;

    const chip = document.getElementById(`subj-chip-${n}`);
    if (!chip) continue;

    chip.textContent = getQuestionSubject(q);
  }
}

// --- Summary modal içindeki konu grafiği ---
let subjectChartInstance = null;

export function refreshSubjectChart(){
  const sCtx = document.getElementById("subjectChart");
  const state = window.__APP_STATE;
  if (!sCtx || !window.Chart || !state?.parsed) return;

  if (subjectChartInstance) subjectChartInstance.destroy();

  const subjMap = {}; // { "Matematik": 3, "Türkçe": 1 }

  state.parsed.questions.forEach(q => {
    if (!q) return;

    const subject = getQuestionSubject(q);
    const userAns = state.answers?.get?.(q.n);
    const correctId = state.parsed.answerKey?.[q.n];

    // "Konu Bazlı Hata Analizi": sadece yanlışları say
    if (userAns && correctId) {
      const chosenId = getChosenOptionId(q, userAns);
      if (chosenId && String(chosenId) !== String(correctId)) {
        subjMap[subject] = (subjMap[subject] || 0) + 1;
      }
    }
  });

  const labels = Object.keys(subjMap);
  const dataValues = Object.values(subjMap);

  const wrap = document.getElementById("subjectAnalysisWrap");
  if (!labels.length){
    if (wrap) wrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "block";

  subjectChartInstance = new Chart(sCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Hatalı Soru",
        data: dataValues,
        backgroundColor: "rgba(255, 69, 58, 0.6)",
        borderColor: "#FF453A",
        borderWidth: 1,
        borderRadius: 5
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { display: false }, ticks: { stepSize: 1, color: "#8e8e93" } },
        y: { grid: { display: false }, ticks: { color: "#8e8e93" } }
      }
    }
  });
}
