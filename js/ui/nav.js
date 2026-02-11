// js/ui/nav.js - navigasyon paneli

import { safe } from "./shared.js";
import { getChosenOptionId } from "./shared.js";
import { renderFocusMiniNav } from "./focusNav.js";

export function buildNav(state){
  const grid = document.getElementById("navGrid");
  const panel = document.getElementById("navPanel");
  const layout = document.getElementById("layoutExam");

  if (!grid) return;

  const total = state.parsed ? state.parsed.questions.length : 0;

  // DURUM 1: Hiç soru yoksa paneli gizle ve alanı genişlet
  if (total === 0) {
    grid.innerHTML = "";
    if (panel) panel.style.display = "none";
    if (layout) layout.style.gridTemplateColumns = "1fr";
    return;
  }

  // DURUM 2: Soru varsa paneli göster ve orijinal düzene dön
  if (panel) panel.style.display = "flex";
  if (layout) layout.style.gridTemplateColumns = "";

  // Orijinal akış (aynı)
  if (grid.childElementCount === total) {
    refreshNavColors(state);
    return;
  }

  grid.innerHTML = "";
  if (!state.parsed) return;

  for (const q of state.parsed.questions){
    // ✅ BOZMADAN: bozuk soru kaydı gelirse atla (crash engeli)
    if (!q || q.n == null) continue;

    const b = document.createElement("button");
    b.className = "navBtn";
    b.textContent = q.n;
    b.dataset.qn = q.n;

    b.onclick = () => {
      state.activeQn = q.n;
      if (document.body.classList.contains("focusMode")) {
        const PAGE_SIZE = 20;
        state.navPage = Math.floor((q.n - 1) / PAGE_SIZE);
      }
      const target = document.querySelector(`.q[data-q="${q.n}"]`);
      if (target) target.scrollIntoView({behavior:"smooth", block:"start"});
      refreshNavColors(state);
    };

    grid.appendChild(b);
  }

  refreshNavColors(state);
}


export function refreshNavColors(state) {
  try { renderFocusMiniNav(state); } catch {}

  const grid = document.getElementById("navGrid");
  if (!grid || !state?.parsed) return;

  const buttons = grid.querySelectorAll(".navBtn");

  // ✅ BOZMADAN: answers Map değilse patlamasın diye adapter
  const answersRaw = state.answers;
  const answers = (answersRaw instanceof Map) ? answersRaw : {
    has(qn) {
      if (!answersRaw) return false;
      const v = answersRaw[qn] ?? answersRaw[String(qn)];
      return v !== undefined;
    },
    get(qn) {
      if (!answersRaw) return undefined;
      return answersRaw[qn] ?? answersRaw[String(qn)];
    }
  };

  const activeQn = Number(state.activeQn || 1);
  const isResult = state.mode === "result";
  const keyMap = state.parsed.answerKey || {};

  buttons.forEach(btn => {
    const qn = Number(btn.dataset.qn);
    btn.className = "navBtn";

    if (qn === activeQn) btn.classList.add("active");

    // (senin orijinal mantığın aynen)
    const hasAnswer = answers.has(qn) && answers.get(qn) !== null;
    const myAns = answers.get(qn);

    if (isResult) {
      const correctId = keyMap[qn];
      const qObj = state.parsed.questions.find(x => x.n === qn);
      const chosenId = qObj ? getChosenOptionId(qObj, myAns) : null;

      if (!hasAnswer) btn.classList.add("empty-result");
      else if (!correctId) btn.classList.add("answered");
      else if (chosenId === correctId) btn.classList.add("correct");
      else btn.classList.add("wrong");
    } else {
      if (hasAnswer) {
        btn.classList.add("answered");
      }
    }
  });
}
