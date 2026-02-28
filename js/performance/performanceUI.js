// js/performance/performanceUI.js
// Performance Center modal: history list + v17 intelligence (growth score, profile, sparklines, AI coach).

import { listExamHistory, computeHistorySummary, clearExamHistory } from "./historyStore.js";
import { filterHistoryByRange, calculatePerformance, computeSeriesChronological } from "./analytics.js";
import { getLearningProfile } from "./profile.js";
import { drawSparkline, getNearestSparkIndex } from "./sparkline.js";
import { generateCoachNote } from "./coach.js";
import { formatTime, formatDurationHuman } from "../utils.js";

const LS_SPARK_N = "acumen_perf_spark_n_v1";

function getSparkN(){
  const raw = localStorage.getItem(LS_SPARK_N);
  const n = Number(raw);
  return [5,10,20].includes(n) ? n : 10;
}

function setSparkN(n){
  if (![5,10,20].includes(n)) return;
  localStorage.setItem(LS_SPARK_N, String(n));
}

function ensureStyles(){
  if (document.getElementById("acumenPerfStyles")) return;
  const style = document.createElement("style");
  style.id = "acumenPerfStyles";
  style.textContent = `
  .perfModalCard{max-width:1040px;width:min(1040px, 96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden;}
  #perfBody{overflow:auto;padding-right:2px;}
  .perfHeader{position:sticky;top:0;z-index:2;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;
    background:rgba(10,10,16,.72);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:10px;}
  .perfTitle{display:flex;align-items:center;gap:10px;}
  .perfTitle .ico{width:38px;height:38px;border-radius:14px;display:flex;align-items:center;justify-content:center;
    background:rgba(168,85,247,.14);border:1px solid rgba(168,85,247,.22);}
  .perfTitle h3{margin:0;font-size:18px;}
  .perfActions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
  .perfMiniBtn{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;
    border:1px solid rgba(168,85,247,.28);background:rgba(168,85,247,.18);color:var(--text);
    font-weight:900;font-size:12px;cursor:pointer;transition:.15s ease;white-space:nowrap;}
  .perfMiniBtn:hover{transform:translateY(-1px);background:rgba(168,85,247,.26);border-color:rgba(168,85,247,.52);}
  .perfMiniBtn:disabled{opacity:.55;cursor:not-allowed;transform:none;}
  .perfDangerBtn{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.22);}
  .perfSelect{padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:var(--text);font-weight:900;font-size:12px;}
  .perfGrid{display:grid;grid-template-columns:repeat(4, minmax(0,1fr));gap:10px;margin:10px 0 14px;}
  @media (max-width:820px){ .perfGrid{grid-template-columns:repeat(2, minmax(0,1fr));} }

  .perfHeroWrap{display:grid;grid-template-columns: 1.25fr .75fr .75fr;gap:10px;margin:10px 0 14px;}
  @media (max-width:900px){ .perfHeroWrap{grid-template-columns:1fr;}}
  .perfHero{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(255,255,255,.04);
    border-radius:16px;
    padding:16px 14px;
    text-align:center;
    position:relative;
    overflow:hidden;
  }
  .perfHero:before{
    content:"";
    position:absolute;inset:-30%;
    background:radial-gradient(circle at 30% 30%, rgba(140,80,255,.22), transparent 55%),
               radial-gradient(circle at 70% 60%, rgba(0,212,255,.18), transparent 55%);
    filter: blur(0px);
    pointer-events:none;
  }
  .perfHeroNum{
    position:relative;
    font-size:60px;
    line-height:1;
    font-weight:1000;
    letter-spacing:-1px;
    margin-top:6px;
    background:linear-gradient(90deg, rgba(140,80,255,.95), rgba(0,212,255,.95));
    -webkit-background-clip:text;
    -webkit-text-fill-color:transparent;
    text-shadow:0 0 22px rgba(140,80,255,.18);
  }
  .perfHeroLabel{position:relative;font-size:12px;color:var(--muted);font-weight:900;margin-top:6px;display:flex;align-items:center;justify-content:center;gap:8px;}
  .perfInfoBtn{width:22px;height:22px;border-radius:8px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.06);color:rgba(255,255,255,.88);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;font-weight:1000;}
  .perfInfoBtn:hover{background:rgba(255,255,255,.10);}
  .perfHeroTrend{position:relative;margin-top:10px;font-size:12px;color:rgba(255,255,255,.85);font-weight:900;}
  .perfCard{
    border:1px solid rgba(255,255,255,.10);
    background:rgba(255,255,255,.04);
    border-radius:16px;
    padding:12px 12px;
  }
  .perfCardTitle{font-size:11px;color:var(--muted);font-weight:1000;margin-bottom:6px;}
  .perfCardValue{font-size:14px;font-weight:1000;}
  .perfCardHint{margin-top:6px;font-size:12px;color:rgba(255,255,255,.82);line-height:1.45;}

  .perfSparks{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:10px 0 14px;}
  @media (max-width:900px){ .perfSparks{grid-template-columns:1fr;}}
  .perfSparkCanvas{width:100%;height:72px;display:block;}
  .perfSparkMeta{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:12px;color:rgba(255,255,255,.82);font-weight:900;}
  .perfSparkToolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
  .perfMiniSelect{appearance:none;padding:6px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);color:var(--text);font-weight:1000;font-size:12px;cursor:pointer;}
  .perfMiniSelect:hover{background:rgba(255,255,255,.06);}

  .perfPopover{position:fixed;z-index:100010;width:min(420px, calc(100vw - 40px));background:rgba(20,20,30,.84);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:12px 12px;box-shadow:0 18px 60px rgba(0,0,0,.45);color:rgba(255,255,255,.92);}
  .perfPopover h4{margin:0 0 6px 0;font-size:13px;}
  .perfPopover p{margin:0;font-size:12px;color:rgba(255,255,255,.72);line-height:1.35;}
  .perfPopover code{font-size:11px;color:rgba(255,255,255,.85);}

  .perfTooltip{position:fixed;z-index:99999;pointer-events:none;background:rgba(20,20,30,.86);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:8px 10px;box-shadow:0 14px 50px rgba(0,0,0,.45);color:rgba(255,255,255,.92);font-size:12px;backdrop-filter:blur(12px);white-space:nowrap;}
  .perfStat{border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.04);border-radius:14px;padding:10px 12px;}
  .perfStat b{display:block;font-size:16px;margin-bottom:2px;}
  .perfStat span{font-size:11px;color:var(--muted);font-weight:700;}

  .perfTableWrap{border:1px solid rgba(255,255,255,.10);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.03);}
  .perfTable{width:100%;border-collapse:collapse;font-size:12px;}
  .perfTable th,.perfTable td{padding:10px 10px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left;vertical-align:middle;}
  .perfTable th{font-size:11px;color:var(--muted);font-weight:900;background:rgba(255,255,255,.03);}
  .perfRow{cursor:pointer;}
  .perfRow:hover{background:rgba(255,255,255,.04);}
  .perfBadge{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid rgba(168,85,247,.22);background:rgba(168,85,247,.12);font-size:11px;font-weight:900;}

  .perfCoach{margin-top:12px;border:1px solid rgba(255,255,255,.10);border-radius:14px;background:rgba(255,255,255,.03);padding:10px 12px;}
  .perfCoachHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;}
  .perfCoachText{font-size:12.5px;line-height:1.55;color:rgba(255,255,255,.88);white-space:pre-wrap;}

  /* detail modal */
  .perfDetailCard{max-width:760px;width:min(760px, 96vw);}
  .perfDetailGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px;}
  @media (max-width:760px){ .perfDetailGrid{grid-template-columns:1fr;}}
  `;
  document.head.appendChild(style);
}

function ensureModal(){
  let modal = document.getElementById("perfModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "perfModal";
  modal.className = "modalOverlay";
  modal.style.display = "none";
  modal.style.zIndex = "100000";

  modal.innerHTML = `
    <div class="modalCard perfModalCard" role="dialog" aria-modal="true" aria-label="Sınav Geçmişi ve Performans">
      <div class="perfHeader">
        <div class="perfTitle">
          <div class="ico">📊</div>
          <div>
            <h3>Sınav Geçmişi & Performans</h3>
            <div style="font-size:11px;color:var(--muted);font-weight:700;">Kişisel koç merkezi</div>
          </div>
        </div>
        <div class="perfActions">
          <select id="perfRange" class="perfSelect" title="Filtre">
            <option value="all">Tümü</option>
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
          </select>
          <button id="perfBtnClear" class="perfMiniBtn perfDangerBtn" type="button">🗑️ Temizle</button>
          <button id="perfBtnClose" class="perfMiniBtn" type="button">Kapat</button>
        </div>
      </div>

      <div id="perfBody"></div>
    </div>
  `;

  modal.addEventListener("click", (e)=>{
    if (e.target === modal) closeModal();
  });

  document.body.appendChild(modal);
  return modal;
}

function ensureDetailModal(){
  let modal = document.getElementById("perfDetailModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "perfDetailModal";
  modal.className = "modalOverlay";
  modal.style.display = "none";
  modal.style.zIndex = "100001";

  modal.innerHTML = `
    <div class="modalCard perfDetailCard" role="dialog" aria-modal="true" aria-label="Sınav detayı">
      <div class="perfHeader">
        <div class="perfTitle">
          <div class="ico">🧾</div>
          <div>
            <h3 id="perfDetailTitle">Sınav Detayı</h3>
            <div id="perfDetailSub" style="font-size:11px;color:var(--muted);font-weight:700;"></div>
          </div>
        </div>
        <div class="perfActions">
          <button id="perfDetailClose" class="perfMiniBtn" type="button">Kapat</button>
        </div>
      </div>
      <div id="perfDetailBody"></div>
    </div>
  `;
  modal.addEventListener("click", (e)=>{
    if (e.target === modal) closeDetailModal();
  });
  document.body.appendChild(modal);
  return modal;
}

function closeModal(){
  const modal = document.getElementById("perfModal");
  if (!modal) return;
  modal.style.display = "none";
}
function closeDetailModal(){
  const modal = document.getElementById("perfDetailModal");
  if (!modal) return;
  modal.style.display = "none";
}

function fmtDate(iso){
  if (!iso) return "-";
  return String(iso).slice(0,10);
}

function buildRow(it){
  const date = fmtDate(it.finishedAt);
  const title = escapeHtml(it.title || "Sınav");
  const type = it.examType || "-";
  const total = it.totalQuestions || 0;

  const mcq = it.mcq;
  const oe = it.openEnded;

  const detail = (type === "mcq") ? `${total} soru` :
                 (type === "openEndedPro") ? `${total} soru` :
                 `${total} soru`;

  const mcqAcc = (mcq && mcq.accuracyPct != null) ? `%${mcq.accuracyPct}` : "-";
  const oePct = (oe && oe.pct != null) ? `${oe.pct}/100` : "-";
  const dur = formatTime ? formatTime(it.durationSec||0) : `${it.durationSec||0}s`;

  const badge = type === "mcq" ? "🧩 Test" : type === "openEndedPro" ? "📝 Open" : "🧪 Mixed";

  return `
    <tr class="perfRow" data-id="${it.id}">
      <td>${date}</td>
      <td>${title}</td>
      <td><span class="perfBadge">${badge}</span></td>
      <td>${detail}</td>
      <td>${mcqAcc}</td>
      <td>${oePct}</td>
      <td>${dur}</td>
    </tr>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function createTooltip(){
  let el = document.getElementById("perfTooltip");
  if (!el){
    el = document.createElement("div");
    el.id = "perfTooltip";
    el.className = "perfTooltip";
    el.style.display = "none";
    document.body.appendChild(el);
  }
  return {
    show(text, x, y){
      el.textContent = text;
      el.style.left = `${Math.round(x)}px`;
      el.style.top = `${Math.round(y)}px`;
      el.style.display = "block";
    },
    hide(){
      el.style.display = "none";
    }
  };
}

function showScoreInfoPopover(anchorEl){
  if (!anchorEl) return;
  // toggle
  const existing = document.getElementById("perfScorePopover");
  if (existing){
    existing.remove();
    return;
  }

  const pop = document.createElement("div");
  pop.id = "perfScorePopover";
  pop.className = "perfPopover";
  pop.innerHTML = `
    <h4>Gelişim Skoru nasıl hesaplanır?</h4>
    <p>Skor <b>0–100</b> aralığındadır ve 3 bileşenden oluşur:</p>
    <p style="margin-top:8px;">
      <code>%60</code> Genel doğruluk<br/>
      <code>%20</code> Trend (son 5 vs önceki 5)<br/>
      <code>%20</code> Tutarlılık (dalgalanma düşükse yüksek)
    </p>
    <p style="margin-top:8px;">Amaç: daha doğru, daha istikrarlı ve zamanla gelişen performansı ödüllendirmek.</p>
  `;
  document.body.appendChild(pop);

  const r = anchorEl.getBoundingClientRect();
  const x = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(12, r.left - pop.offsetWidth/2 + r.width/2));
  const y = Math.min(window.innerHeight - pop.offsetHeight - 12, r.bottom + 10);
  pop.style.left = `${Math.round(x)}px`;
  pop.style.top = `${Math.round(y)}px`;

  const onDown = (e)=>{
    if (pop.contains(e.target) || anchorEl.contains(e.target)) return;
    pop.remove();
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
  };
  const onKey = (e)=>{
    if (e.key === "Escape"){
      pop.remove();
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    }
  };
  document.addEventListener("mousedown", onDown, true);
  document.addEventListener("keydown", onKey, true);
}

function renderBody(){
  const body = document.getElementById("perfBody");
  if (!body) return;

  const rangeSel = document.getElementById("perfRange");
  const range = rangeSel?.value || "all";

  const allItems = listExamHistory();
  const items = filterHistoryByRange(allItems, range);

  const sum = computeHistorySummary(items);
  const perf = calculatePerformance(items);
  const profile = perf.hasData ? getLearningProfile({ trendDir: perf.trend?.dir || null, speedTrend: perf.speedTrend || null }) : null;

  const totalExams = sum.totalExams || 0;
  const avgDur = (typeof formatDurationHuman === "function") ? formatDurationHuman(sum.avgDurationSec||0) : (formatTime ? formatTime(sum.avgDurationSec||0) : `${sum.avgDurationSec||0}s`);
  const mcqAcc = (sum.mcq.accuracyPct != null) ? `%${sum.mcq.accuracyPct}` : "-";
  const oeAvg = (sum.openEnded.avgPct != null) ? `${sum.openEnded.avgPct}/100` : "-";

  const trendText = (!perf.hasData || !perf.trend)
    ? (perf.hasData ? "Trend için en az 5 sınav gerekir" : "Henüz yeterli veri yok")
    : perf.trend.dir === "up" ? `↑ +${Math.abs(perf.trend.delta)}% son 5 sınav` :
      perf.trend.dir === "down" ? `↓ ${Math.abs(perf.trend.delta)}% son 5 sınav` :
      `→ Stabil (±${Math.abs(perf.trend.delta)}%)`;

  const heroNum = (perf.hasData && typeof perf.growthScore === 'number') ? perf.growthScore : "--";

  body.innerHTML = `
    <div class="perfHeroWrap">
      <div class="perfHero">
        <div class="perfHeroNum">${heroNum}</div>
        <div class="perfHeroLabel">Gelişim Skoru <button id="perfBtnScoreInfo" class="perfInfoBtn" type="button" aria-label="Gelişim Skoru nasıl hesaplanır">i</button></div>
        <div class="perfHeroTrend">${trendText}</div>
      </div>

      <div class="perfCard">
        <div class="perfCardTitle">Öğrenme Profili</div>
        <div class="perfCardValue">${profile ? profile.label : "—"}</div>
        <div class="perfCardHint">${profile ? escapeHtml(profile.hint) : "En az 2 sınav çözünce profil oluşur."}</div>
      </div>

      <div class="perfCard">
        <div class="perfCardTitle">Özet</div>
        <div class="perfCardHint">
          <div style="display:flex;justify-content:space-between;gap:10px;"><span>Genel doğruluk</span><b>%${perf.hasData ? perf.overallAccuracy : "-"}</b></div>
          <div style="display:flex;justify-content:space-between;gap:10px;margin-top:6px;"><span>Ortalama süre</span><b>${perf.hasData ? avgDur : "-"}</b></div>
          <div style="display:flex;justify-content:space-between;gap:10px;margin-top:6px;"><span>Tutarlılık</span><b>${(perf.hasData && typeof perf.consistencyScore === 'number') ? perf.consistencyScore + "/100" : "-"}</b></div>
        </div>
      </div>
    </div>

    <div class="perfSparks">
      <div class="perfCard">
        <div class="perfSparkToolbar">
          <div class="perfCardTitle" style="margin:0;">Başarı Trend</div>
          <select id="perfSparkN" class="perfMiniSelect" title="Gösterilecek sınav sayısı">
            <option value="5">Son 5</option>
            <option value="10">Son 10</option>
            <option value="20">Son 20</option>
          </select>
        </div>
        <canvas id="perfSparkAcc" class="perfSparkCanvas"></canvas>
        <div class="perfSparkMeta">
          <span id="perfSparkMetaAccLeft">Son 10</span>
          <span>${perf.hasData ? `%${perf.last5Accuracy} (son 5)` : ""}</span>
        </div>
      </div>
      <div class="perfCard">
        <div class="perfSparkToolbar">
          <div class="perfCardTitle" style="margin:0;">Süre Trend</div>
          <div style="width:82px;"></div>
        </div>
        <canvas id="perfSparkDur" class="perfSparkCanvas"></canvas>
        <div class="perfSparkMeta">
          <span id="perfSparkMetaDurLeft">Son 10</span>
          <span>${(perf.hasData && perf.speedTrend) ? `${perf.speedTrend === "faster" ? "⏩" : perf.speedTrend === "slower" ? "🐢" : "→"} ${perf.avgDurationMin} dk ort.` : ""}</span>
        </div>
      </div>
    </div>

    <div class="perfGrid">
      <div class="perfStat"><b>${totalExams}</b><span>Toplam sınav</span></div>
      <div class="perfStat"><b>${avgDur}</b><span>Ortalama süre</span></div>
      <div class="perfStat"><b>${mcqAcc}</b><span>Test doğruluğu (ortalama)</span></div>
      <div class="perfStat"><b>${oeAvg}</b><span>Open-ended (ortalama)</span></div>
    </div>

    <div class="perfTableWrap">
      <table class="perfTable">
        <thead>
          <tr>
            <th>Tarih</th>
            <th>Sınav</th>
            <th>Tür</th>
            <th>Detay</th>
            <th>Test %</th>
            <th>OE Skor</th>
            <th>Süre</th>
          </tr>
        </thead>
        <tbody>
          ${items.length ? items.map(buildRow).join("") : `<tr><td colspan="7" style="padding:14px;color:var(--muted);">Henüz kayıt yok. Bir sınav bitirince burada görünecek.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="perfCoach">
      <div class="perfCoachHead">
        <div style="font-weight:1000;">🧠 AI Koç Yorumu</div>
        <button id="perfBtnCoach" class="perfMiniBtn" type="button">🤖 Analiz Et</button>
      </div>
      <div id="perfCoachText" class="perfCoachText" style="color:var(--muted);">
        Analiz için “Analiz Et”e tıkla. (Gemini anahtarı gerekiyorsa sorulacak.)
      </div>
    </div>
  `;

  // draw sparklines (v18: last N selector + tooltip)
  const series = computeSeriesChronological(items);
  let cAcc = document.getElementById("perfSparkAcc");
  let cDur = document.getElementById("perfSparkDur");
  const sparkSel = document.getElementById("perfSparkN");
  const metaAccLeft = document.getElementById("perfSparkMetaAccLeft");
  const metaDurLeft = document.getElementById("perfSparkMetaDurLeft");

  if (sparkSel){
    sparkSel.value = String(getSparkN());
  }

  const tooltip = createTooltip();
  let accMarker = -1;
  let durMarker = -1;
  let curAccVals = [];
  let curDurVals = [];
  let curLabels = [];

  let drawBusy = false;
  const requestRedraw = ()=>{
    if (drawBusy) return;
    drawBusy = true;
    requestAnimationFrame(()=>{
      drawBusy = false;
      drawAll();
    });
  };

  function drawAll(){
    const n = getSparkN();
    if (metaAccLeft) metaAccLeft.textContent = `Son ${n}`;
    if (metaDurLeft) metaDurLeft.textContent = `Son ${n}`;

    const start = Math.max(0, series.scoreSeries.length - n);
    curAccVals = series.scoreSeries.slice(start);
    curDurVals = series.durationSeries.slice(start);
    curLabels = series.labels.slice(start);

    if (cAcc) drawSparkline(cAcc, curAccVals, {
      color1:"rgba(140,80,255,0.95)",
      color2:"rgba(0,212,255,0.95)",
      glow:"rgba(140,80,255,0.55)",
      glowBlur:10,
      markerIndex: accMarker
    });
    if (cDur) drawSparkline(cDur, curDurVals, {
      color1:"rgba(255,140,80,0.92)",
      color2:"rgba(255,0,168,0.92)",
      glow:"rgba(255,140,80,0.45)",
      glowBlur:10,
      markerIndex: durMarker
    });
  }

  function bindSparkOnce(canvas, kind){
    if (!canvas || canvas.dataset.bound === "1") return;
    canvas.dataset.bound = "1";
    canvas.addEventListener("mousemove", (e)=>{
      const vals = kind === "acc" ? curAccVals : curDurVals;
      const idx = getNearestSparkIndex(canvas, vals, e.clientX);
      if (idx < 0) return;
      if (kind === "acc") accMarker = idx;
      else durMarker = idx;
      requestRedraw();

      const rect = canvas.getBoundingClientRect();
      const lab = curLabels[idx] || "";
      const v = vals[idx];
      const text = kind === "acc"
        ? `${lab}  •  %${Math.round(v)}`
        : `${lab}  •  ${Math.round(v)} dk`;
      tooltip.show(text, rect.left + (e.clientX-rect.left) + 12, rect.top + 10);
    });
    canvas.addEventListener("mouseleave", ()=>{
      tooltip.hide();
      if (kind === "acc") accMarker = -1;
      else durMarker = -1;
      requestRedraw();
    });
  }

  if (sparkSel){
    sparkSel.onchange = ()=>{
      setSparkN(Number(sparkSel.value));
      accMarker = -1;
      durMarker = -1;
      tooltip.hide();
      requestRedraw();
    };
  }

  // bind tooltip once and render
  bindSparkOnce(cAcc, "acc");
  bindSparkOnce(cDur, "dur");
  requestRedraw();

  // bind actions
  const closeBtn = document.getElementById("perfBtnClose");
  if (closeBtn) closeBtn.onclick = closeModal;

  const clearBtn = document.getElementById("perfBtnClear");
  if (clearBtn) clearBtn.onclick = ()=>{
    if (!confirm("Sınav geçmişi temizlensin mi?")) return;
    clearExamHistory();
    renderBody();
  };

  if (rangeSel) rangeSel.onchange = ()=> renderBody();

  const infoBtn = document.getElementById("perfBtnScoreInfo");
  if (infoBtn) infoBtn.onclick = ()=> showScoreInfoPopover(infoBtn);

  // row click -> detail
  body.querySelectorAll(".perfRow").forEach(row=>{
    row.addEventListener("click", ()=>{
      const id = row.getAttribute("data-id");
      const found = items.find(x=> String(x.id) === String(id));
      if (found) openDetail(found);
    });
  });

  const coachBtn = document.getElementById("perfBtnCoach");
  if (coachBtn) coachBtn.onclick = async ()=>{
    const out = document.getElementById("perfCoachText");
    if (!out) return;

    const items2All = listExamHistory();
    const items2 = filterHistoryByRange(items2All, range);
    if (!items2.length){
      out.textContent = "Henüz yeterli veri yok. En az 1 sınav çözünce analiz yapılabilir.";
      return;
    }

    const perf2 = calculatePerformance(items2);
    // trend can be null if there are fewer than 5 exams; guard to avoid runtime errors
    const trendDir = (perf2 && perf2.trend && perf2.trend.dir) ? perf2.trend.dir : null;
    const profile2 = perf2 && perf2.hasData
      ? getLearningProfile({ trendDir, speedTrend: perf2.speedTrend })
      : null;

    let apiKey = localStorage.getItem("GEMINI_KEY");
    if (!apiKey){
      apiKey = prompt("Gemini API anahtarını gir (GEMINI_KEY):");
      if (!apiKey) return;
      try { localStorage.setItem("GEMINI_KEY", apiKey); } catch {}
    }

    coachBtn.disabled = true;
    coachBtn.textContent = "⏳ Analiz…";
    out.textContent = "AI koç notu hazırlanıyor…";
    try{
      const note = await generateCoachNote({ analytics: perf2, profile: profile2, items: items2, apiKey });
      out.textContent = note || "AI yanıtı alınamadı.";
    } catch(e){
      console.warn(e);
      out.textContent = "AI analizinde hata oldu. (Anahtar/bağlantı kontrol et)";
    } finally {
      coachBtn.disabled = false;
      coachBtn.textContent = "🤖 Analiz Et";
    }
  };
}

function openDetail(snapshot){
  ensureDetailModal();
  const modal = document.getElementById("perfDetailModal");
  if (!modal) return;
  modal.style.display = "flex";

  const titleEl = document.getElementById("perfDetailTitle");
  const subEl = document.getElementById("perfDetailSub");
  const body = document.getElementById("perfDetailBody");

  if (titleEl) titleEl.textContent = snapshot.title || "Sınav";
  if (subEl) subEl.textContent = `${fmtDate(snapshot.finishedAt)} • ${snapshot.examType || "-"}`;

  const dur = formatTime ? formatTime(snapshot.durationSec||0) : `${snapshot.durationSec||0}s`;
  const total = snapshot.totalQuestions || 0;

  const mcq = snapshot.mcq;
  const oe = snapshot.openEnded;

  const mcqBlock = mcq ? `
    <div class="perfCard">
      <div class="perfCardTitle">Test Sonuç</div>
      <div class="perfCardHint">
        <div style="display:flex;justify-content:space-between;"><span>Doğru</span><b>${mcq.correct||0}</b></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Yanlış</span><b>${mcq.wrong||0}</b></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Boş</span><b>${mcq.blank||0}</b></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Doğruluk</span><b>${mcq.accuracyPct != null ? "%"+mcq.accuracyPct : "-"}</b></div>
      </div>
    </div>` : `
    <div class="perfCard"><div class="perfCardTitle">Test Sonuç</div><div class="perfCardHint">Bu sınavda test anahtarı yok.</div></div>`;

  const oeBlock = oe ? `
    <div class="perfCard">
      <div class="perfCardTitle">Open-ended Sonuç</div>
      <div class="perfCardHint">
        <div style="display:flex;justify-content:space-between;"><span>Skor</span><b>${oe.pct != null ? oe.pct+"/100" : "-"}</b></div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Değerlendirilen</span><b>${oe.graded||0}/${oe.total||0}</b></div>
        ${oe.pending ? `<div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Bekleyen</span><b>${oe.pending}</b></div>` : ``}
        ${oe.blank ? `<div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Boş</span><b>${oe.blank}</b></div>` : ``}
      </div>
    </div>` : `
    <div class="perfCard"><div class="perfCardTitle">Open-ended Sonuç</div><div class="perfCardHint">Bu sınavda open-ended değerlendirme yok.</div></div>`;

  if (body){
    body.innerHTML = `
      <div class="perfCard">
        <div class="perfCardTitle">Genel</div>
        <div class="perfCardHint">
          <div style="display:flex;justify-content:space-between;"><span>Toplam soru</span><b>${total}</b></div>
          <div style="display:flex;justify-content:space-between;margin-top:6px;"><span>Süre</span><b>${dur}</b></div>
        </div>
      </div>
      <div class="perfDetailGrid">
        ${mcqBlock}
        ${oeBlock}
      </div>
    `;
  }

  const closeBtn = document.getElementById("perfDetailClose");
  if (closeBtn) closeBtn.onclick = closeDetailModal;
}

export function openPerformanceCenter(){
  ensureStyles();
  ensureModal();
  ensureDetailModal();
  const modal = document.getElementById("perfModal");
  modal.style.display = "flex";
  renderBody();
}

export function initPerformanceCenter(){
  ensureStyles();
  ensureModal();
  ensureDetailModal();

  const btn = document.getElementById("btnPerformanceCenter");
  if (btn) {
    btn.addEventListener("click", ()=>{
      openPerformanceCenter();
    });
  }
}
