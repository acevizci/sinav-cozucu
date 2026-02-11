// js/ui/focusNav.js - focus mini navigasyon

const FOCUS_PAGE_SIZE = 20;

function ensureFocusMiniNav(){
  let el = document.getElementById("focusMiniNav");
  // Eğer element zaten varsa döndür (Hata burada çıkıyordu, fonksiyon içinde olmalı)
  if (el) return el; 

  el = document.createElement("div");
  el.id = "focusMiniNav";
  el.className = "focusMiniNav";
  document.body.appendChild(el);

  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    // 1. NOKTAYA TIKLAMA (Soruya Git)
if (btn.classList.contains("navDot")) {
  const qn = Number(btn.dataset.qn);

  const st = window.__APP_STATE;
  if (st?.parsed?.questions?.length) {
    const total = st.parsed.questions.length;
    const maxPage = Math.max(0, Math.ceil(total / FOCUS_PAGE_SIZE) - 1);

    st.activeQn = qn;

    const newPage = clampInt(Math.floor((qn - 1) / FOCUS_PAGE_SIZE), 0, maxPage);
    const oldPage = st.navPage ?? 0;
    st.navPage = newPage;

    // UI: sayfa değiştiyse yeniden render, değilse refresh
    if (newPage !== oldPage) renderFocusMiniNav(st);
    else refreshFocusMiniNav(st);
  }

  // scroll
  if (typeof scrollToQuestion === "function") {
    scrollToQuestion(qn);
  } else {
    const qEl = document.querySelector(`.q[data-q="${qn}"]`);
    if (qEl) qEl.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return;
}


    // 2. SAYFA DEĞİŞTİRME (< >)
    const act = btn.dataset.act;
    if (!act) return;
    const st = window.__APP_STATE;
    if (!st?.parsed) return;
    
    const total = st.parsed.questions.length;
    const maxPage = Math.max(0, Math.ceil(total / FOCUS_PAGE_SIZE) - 1);
    
    if (act === "prev") st.navPage = Math.max(0, (st.navPage || 0) - 1);
    if (act === "next") st.navPage = Math.min(maxPage, (st.navPage || 0) + 1);
    
    renderFocusMiniNav(st);
  });
  
  return el; // Fonksiyonun dönüş değeri
}

export function renderFocusMiniNav(state) {
  const isFocus = document.body.classList.contains("focusMode");
  const el = ensureFocusMiniNav();
  if (!isFocus) { el.style.display = "none"; return; }
  el.style.display = "flex";

  const qs = state?.parsed?.questions || [];
  const total = qs.length;
  const pages = Math.max(1, Math.ceil(total / FOCUS_PAGE_SIZE));
  const maxPage = pages - 1;

  // ✅ mode güvenli
  const modeKey = state?.mode || "exam";

  // ✅ activeQn -> navPage senkron (bozmadan UX düzeltir)
  const activeQn = Number(state?.activeQn || 1);
  const desiredPage = clampInt(Math.floor((activeQn - 1) / FOCUS_PAGE_SIZE), 0, maxPage);

  // Eğer state.navPage yoksa veya aktif soru başka sayfadaysa düzelt
  let page = clampInt(state?.navPage ?? desiredPage, 0, maxPage);
  if (page !== desiredPage && Number.isFinite(activeQn) && activeQn > 0) {
    page = desiredPage;
  }

  if (state) state.navPage = page;
  window.__APP_STATE = state;

  const start = page * FOCUS_PAGE_SIZE + 1;
  const end = Math.min(total, start + FOCUS_PAGE_SIZE - 1);
  const currentRangeKey = `${start}-${end}-${total}-${modeKey}`;

  if (el.dataset.rangeKey === currentRangeKey) {
    refreshFocusMiniNav(state);
    return;
  }

  el.dataset.rangeKey = currentRangeKey;
  el.innerHTML = "";

  // Önceki Sayfa
  const btnPrev = document.createElement("button");
  btnPrev.className = "navPageBtn";
  btnPrev.textContent = "‹";
  btnPrev.dataset.act = "prev";
  btnPrev.disabled = page <= 0;
  el.appendChild(btnPrev);

  // Noktalar
  const dots = document.createElement("div");
  dots.className = "dots";
  el.appendChild(dots);

  for (let qn = start; qn <= end; qn++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "navDot";
    b.dataset.qn = String(qn);
    b.textContent = String(qn);
    dots.appendChild(b);
  }

  // Sonraki Sayfa
  const btnNext = document.createElement("button");
  btnNext.className = "navPageBtn";
  btnNext.textContent = "›";
  btnNext.dataset.act = "next";
  btnNext.disabled = page >= maxPage;
  el.appendChild(btnNext);

  refreshFocusMiniNav(state);
}


export function refreshFocusMiniNav(state){
  const el = document.getElementById("focusMiniNav");
  if (!el || el.style.display === "none") return;

  const activeQn = Number(state?.activeQn || 1);

  const answeredRaw = state?.answers;

  const getGiven = (qn) => {
    if (!answeredRaw) return null;
    if (answeredRaw instanceof Map) return answeredRaw.get(qn);
    return answeredRaw[qn] ?? answeredRaw[String(qn)] ?? null;
  };

  const hasGiven = (qn) => {
    const v = getGiven(qn);
    if (v == null) return false;
    // normal modda da boş-string'i done sayma (bozmadan daha doğru)
    if (typeof v === "string" && v.trim() === "") return false;
    return true;
  };

  const isResult = (state?.mode === "result");

  const dots = el.querySelector(".dots");
  if (!dots) return;

  const buttons = dots.querySelectorAll(".navDot");
  buttons.forEach(btn => {
    const qn = Number(btn.dataset.qn);
    const isActive = (qn === activeQn);

    btn.className = "navDot";
    if (isActive) btn.classList.add("active");

    if (isResult) {
      const given = getGiven(qn);

      const ak = state?.parsed?.answerKey;
      const key = ak?.[qn] ?? ak?.[qn - 1]; // ✅ 1-index/0-index fallback

      if (given == null || String(given).trim() === "") {
        // boş
      } else if (key && String(given).toUpperCase() === String(key).toUpperCase()) {
        btn.classList.add("is-correct");
      } else {
        btn.classList.add("is-wrong");
      }
    } else {
      if (hasGiven(qn)) btn.classList.add("done");
    }
  });

  // Sayfa butonları durumu
  const total = state?.parsed?.questions?.length || 0;
  const pages = Math.max(1, Math.ceil(total / FOCUS_PAGE_SIZE));
  const page = state?.navPage || 0;

  const prev = el.querySelector('[data-act="prev"]');
  const next = el.querySelector('[data-act="next"]');
  if (prev) prev.disabled = page <= 0;
  if (next) next.disabled = page >= pages - 1;
}

function clampInt(v, a, b) {
  const n = Number.isFinite(Number(v)) ? Number(v) : a;
  return Math.max(a, Math.min(b, n));
}
