// js/ui/srs.js - SRS modal + buton handler

import { escapeHtml } from "./shared.js";
import { showToast } from "./status.js";

let srsChartInstance = null;

export function openSrsModal(data) {
  const overlay = document.getElementById("srsModal");
  if (!overlay) return;

  // 1) HTML Şablonu
  const template = `
    <div class="modalCard">
      <div class="modalTop">
        <div>
          <div class="modalTitle">🧠 Hafıza Analizi</div>
          <div class="modalSub">Aralıklı Tekrar (SM-2) İstatistikleri</div>
        </div>
        <button id="btnCloseSrsInternal" class="modalClose">✕</button>
      </div>

      <div class="srs-grid">
        <div class="srs-card highlight">
          <div class="srs-val" id="srsTotal">-</div>
          <div class="srs-label">📂 Toplam Soru</div>
        </div>
        <div class="srs-card urgent">
          <div class="srs-val" id="srsDue">-</div>
          <div class="srs-label">🔥 Bugün Çözülecek</div>
        </div>
        <div class="srs-card">
          <div class="srs-val" id="srsTomorrow">-</div>
          <div class="srs-label">📅 Yarına Kalan</div>
        </div>
        <div class="srs-card">
          <div class="srs-val" id="srsAvgEf">-</div>
          <div class="srs-label">⚡ Ort. Kolaylık (EF)</div>
        </div>
        <div class="srs-card">
          <div class="srs-val" id="srsLearning">-</div>
          <div class="srs-label">🌱 Öğrenme Aşamasında</div>
        </div>
        <div class="srs-card good">
          <div class="srs-val" id="srsMature">-</div>
          <div class="srs-label">🧠 Kalıcı Hafıza</div>
        </div>
      </div>

      <div class="chart-wrapper">
        <canvas id="srsChart"></canvas>
      </div>

      <div class="divider" style="margin: 12px 0;"></div>

      <div class="modalSub muted" style="margin:0; font-size:13px;">Bugün konu bazlı tekrar</div>
      <div id="srsSubjectToday" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"></div>

      <div class="modalSub muted" style="margin-top:12px; font-size:13px;">Yarın konu bazlı</div>
      <div id="srsSubjectTomorrow" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"></div>

      <div class="modalActions">
        <button id="btnOkSrsInternal" class="primary">Tamam</button>
      </div>
    </div>
  `;

  overlay.innerHTML = template;

  // 2) Sayısal verileri doldur
  const set = (id, v) => {
    const e = document.getElementById(id);
    if (e) e.textContent = String(v ?? 0);
  };

  set("srsTotal", data?.total ?? 0);
  set("srsDue", data?.dueToday ?? data?.due ?? 0);
  set("srsTomorrow", data?.dueTomorrow ?? 0);
  set("srsLearning", data?.learning ?? 0);
  set("srsMature", data?.mature ?? 0);

  const efEl = document.getElementById("srsAvgEf");
  if (efEl) efEl.textContent = Number(data?.avgEf ?? 2.5).toFixed(2);

  // 2.5) Konu bazlı özet (XSS-safe)
  const bySubject = data?.bySubject || {};

  const escHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const escAttr = (s) => escHtml(s).replace(/`/g, "&#96;");

  const renderSubjectChips = (mountId, field) => {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    const entries = Object.entries(bySubject)
      .map(([name, v]) => [name, Number(v?.[field] || 0)])
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    if (!entries.length) {
      mount.innerHTML =
        '<span class="muted" style="font-size:12px; opacity:0.9;">Bu aralıkta konu verisi yok.</span>';
      return;
    }

    mount.innerHTML = entries
      .map(([name, c]) => {
        const raw = String(name || "Genel");
        const label = escHtml(raw);
        const attr = escAttr(raw);
        return `<button type="button" class="pill srs-subject-chip" data-subject="${attr}" title="${label} için tekrar başlat">${label} <b class="mono">${c}</b></button>`;
      })
      .join("");

    // Click -> start SRS for this subject (delegates to app.js global)
    mount.querySelectorAll(".srs-subject-chip").forEach((btn) => {
      const sub = btn.getAttribute("data-subject") || "Genel";

      // Deterministic accent per subject (theme-friendly, no external deps)
      let h = 0;
      for (let i = 0; i < sub.length; i++) {
        h = (h * 31 + sub.charCodeAt(i)) % 360;
      }
      const col = `hsl(${h}, 78%, 62%)`;

      btn.style.borderColor = col;
      btn.onmouseenter = () => {
        btn.style.boxShadow = `0 0 14px ${col}`;
      };
      btn.onmouseleave = () => {
        btn.style.boxShadow = "";
      };

      btn.onclick = () => {
        try {
          closeSrsModal();
        } catch (e) {}
        if (typeof window.startSrsBySubject === "function") {
          window.startSrsBySubject(sub);
        } else {
          showWarn?.({id:"SRS_STARTER_MISSING"});
        }
      };
    });
  };

  renderSubjectChips("srsSubjectToday", "dueToday");
  renderSubjectChips("srsSubjectTomorrow", "dueTomorrow");

  // 3) Grafiği çiz (daha sağlam canvas ctx)
  const canvas = document.getElementById("srsChart");
  const ctx = canvas?.getContext?.("2d");

  if (ctx && window.Chart) {
    if (srsChartInstance) {
      try {
        srsChartInstance.destroy();
      } catch (e) {}
      srsChartInstance = null;
    }

    const b = data?.buckets || {};

    // Tema rengi kontrolü (grafik yazıları için)
    const isLight =
      document.body.classList.contains("light-mode") ||
      document.body.classList.contains("sepia-mode");
    const textColor = isLight ? "#666" : "#aaa";
    const gridColor = isLight
      ? "rgba(0,0,0,0.05)"
      : "rgba(255,255,255,0.05)";

    srsChartInstance = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Yeni", "Başlangıç", "Gelişiyor", "İyi", "Uzman"],
        datasets: [
          {
            label: "Soru Sayısı",
            data: [b["0"] || 0, b["1"] || 0, b["2"] || 0, b["3"] || 0, b["4+"] || 0],
            backgroundColor: [
              "#ef4444", // Yeni (Kırmızı)
              "#f97316", // Başlangıç (Turuncu)
              "#eab308", // Gelişiyor (Sarı)
              "#22c55e", // İyi (Yeşil)
              "#3b82f6", // Uzman (Mavi)
            ],
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            padding: 10,
            cornerRadius: 8,
            displayColors: false,
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } },
          },
        },
      },
    });
  }

  // 4) Modalı göster + kapatma eventleri (ESC leak yok)
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  const escHandler = (e) => {
    if (e.key === "Escape") close();
  };

  const close = () => {
    closeSrsModal();
    document.removeEventListener("keydown", escHandler);
  };

  const btnX = document.getElementById("btnCloseSrsInternal");
  const btnOk = document.getElementById("btnOkSrsInternal");
  if (btnX) btnX.onclick = close;
  if (btnOk) btnOk.onclick = close;

  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  document.addEventListener("keydown", escHandler);
}

export function closeSrsModal() {
  const overlay = document.getElementById("srsModal");
  if (overlay) {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }

  // Grafik instance temizliği (opsiyonel ama sağlıklı)
  if (srsChartInstance) {
    try {
      srsChartInstance.destroy();
    } catch (e) {}
    srsChartInstance = null;
  }
}

/* ================= AI UYARISI TOGGLE ================= */
window.toggleDisclaimer = function() {
  const bar = document.getElementById('aiDisclaimer');
  if (!bar) return;

  bar.classList.toggle('minimized');

  const isMinimized = bar.classList.contains('minimized');
  localStorage.setItem('ai_disclaimer_minimized', String(isMinimized));
};

// Sayfa yüklendiğinde tercihi hatırla
window.addEventListener('load', () => {
  const isMinimized = localStorage.getItem('ai_disclaimer_minimized') === 'true';
  const bar = document.getElementById('aiDisclaimer');
  if (isMinimized && bar) bar.classList.add('minimized');
});


/* ================= SRS BUTTON CLICK ================= */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".srsBtn");
  if (!btn) return;

  const wrap = btn.closest(".srsWrap");
  if (!wrap) return;

  const quality = Number(btn.dataset.quality);
  if (!Number.isFinite(quality)) return;

  const qn = Number(wrap.dataset.q);
  if (!Number.isFinite(qn) || qn <= 0) return;

  const st = window.__APP_STATE;
  const qs = st?.parsed?.questions;
  if (!st || !Array.isArray(qs)) return;

  const q = qs.find(x => Number(x?.n) === qn);
  if (!q) return;

  const reviewId = st.reviewId ?? null;

  // 🔥 SM-2 override
  if (typeof setSrsQualityByQuestion === "function") {
    setSrsQualityByQuestion(q, quality, reviewId);
  }

  // ✅ Mini feedback: Zor/Orta/Kolay açıklaması + animasyon
  const hint = wrap.querySelector(".srsHint");
  if (hint) {
    const msg =
      quality === 3 ? "Zor seçtin → hafıza taze değil. Bu yüzden yarın tekrar planlanır." :
      quality === 4 ? "Orta → iyi gidiyor. Aralık uzatılır." :
      "Kolay → çok net. Aralık daha da uzar.";

    hint.textContent = msg;

    // küçük “pulse” animasyonu
    wrap.classList.remove("srsPulse");
    void wrap.offsetWidth; // reflow trick
    wrap.classList.add("srsPulse");
  }

  // UI feedback
  wrap.querySelectorAll(".srsBtn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  // İsteğe bağlı: toast
  showToast?.({
    title: "SRS",
    msg: `Tekrar aralığı güncellendi (${quality})`,
    kind: "ok"
  });
});
