// js/openEndedPro/openEndedProUI.js
// Open-ended PRO UI: DOM injection (opts alanını textarea + AI değerlendirme ile değiştirir)
//
// Bu sürüm:
// - Görseldeki karanlık/mor UI tasarımını birebir yansıtır.
// - "Olayı Göster" butonu şık bir mercek ikonu (🔎) olarak aksiyon grubuna eklenmiştir.
// - Scope (kapsam) hatası giderilmiştir.
// - "her alt soru = ayrı kart" modunu destekler (adapter split).

import { detectOpenEndedQuestion, parseOpenEnded } from "./openEndedProAdapter.js";
import { gradeSubQuestion } from "./aiGraderClient.js";
import { attachSpeechToTextarea } from "./speechInput.js";

const OE_STYLE_ID = "oepro_style_embed_v2";
function ensureStyles(){
  if (document.getElementById(OE_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = OE_STYLE_ID;
  s.textContent = `
  /* Open-Ended PRO: Görseldeki tam tasarım */
  :root{
    --oe-bg: rgba(0, 0, 0, 0.35);
    --oe-bd: rgba(168, 85, 247, 0.7);
    --oe-text: var(--text-strong, rgba(255,255,255,.92));
    --oe-muted: var(--text-muted, rgba(255,255,255,.5));
    --oe-accent: #a855f7;
    --oe-accent2: #3b82f6;
  }
  
  /* Textarea: Görseldeki karanlık iç alan ve belirgin mor çerçeve */
  .oeproTA{
    width: 100%;
    margin-top: 10px;
    padding: 14px 16px;
    border-radius: 12px;
    border: 2px solid var(--oe-bd);
    background: var(--oe-bg);
    color: var(--oe-text);
    outline: none;
    resize: none;
    line-height: 1.6;
    font-size: 14px;
    font-family: monospace, sans-serif;
    transition: all 0.2s ease;
  }
  .oeproTA:focus{
    border-color: #c084fc;
    box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.15);
  }

  /* Alt Bilgi ve Aksiyonlar Satırı */
  .oeproMetaRow{ 
    display: flex; 
    align-items: center; 
    justify-content: space-between; 
    gap: 10px; 
    margin-top: 12px; 
  }
  .oeproHint{ font-size: 12px; color: var(--oe-muted); font-weight: 500; }
  
  /* Butonları Yan Yana Tutan Grup */
  .oeproActionGroup {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Standart Buton Stili */
  .oeproBtn{
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: var(--oe-text);
    padding: 10px 16px;
    border-radius: 12px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  .oeproBtn:hover:not(:disabled){ background: rgba(255,255,255,0.1); transform: translateY(-1px); }
  .oeproBtn:disabled{ opacity: .55; cursor: not-allowed; }
  
  /* İkon Buton Stili (Olayı Göster vb. için) */
  .oeproIconBtn{
    border: 1px solid rgba(255,255,255,0.1);
    background: rgba(255,255,255,0.05);
    color: var(--oe-text);
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 18px;
  }
  .oeproIconBtn:hover{ background: rgba(255,255,255,0.1); transform: translateY(-1px); }

  /* Ana Değerlendir Butonu */
  .oeproPrimary{
    background: linear-gradient(90deg, #a855f7 0%, #3b82f6 100%);
    border: none;
    color: white;
  }
  .oeproPrimary:hover:not(:disabled){ filter: brightness(1.1); box-shadow: 0 4px 12px rgba(168, 85, 247, 0.3); }

  /* Sonuç Çıktısı */
  .oeproResult{ margin-top:16px; border-top:1px solid rgba(255,255,255,0.1); padding-top:16px; display:flex; flex-direction:column; gap:10px; }
  .oeproResultTop{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .oeproChip{ padding:6px 12px; border-radius:999px; font-size:12px; font-weight: 600; border:1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.05); color: var(--oe-text); }
  .oeproChipGood{ border-color: rgba(74,222,128,.3); color: #4ade80; background: rgba(74,222,128,.1); }
  .oeproChipWarn{ border-color: rgba(251,191,36,.3); color: #fbbf24; background: rgba(251,191,36,.1); }
  .oeproChipBad{ border-color: rgba(248,113,113,.3); color: #f87171; background: rgba(248,113,113,.1); }
  .oeproFeedback{ color: rgba(255,255,255,.9); line-height:1.5; }
  
  .oeproDetails details{ border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:12px; background: rgba(0,0,0,0.2); }
  .oeproDetails summary{ cursor:pointer; color: var(--oe-text); font-weight:600; }
  .oeproDetails ul{ margin:8px 0 0 18px; color: rgba(255,255,255,.7); font-size: 13px; }
  .oeproSkeleton{ display:inline-block; width:86px; height:12px; border-radius:999px; background: rgba(255,255,255,.10); animation: oeproPulse 1.1s ease-in-out infinite; }
  @keyframes oeproPulse{ 0%{opacity:.5} 50%{opacity:.85} 100%{opacity:.5} }

  /* meta left group */
  .oeproMetaLeft{ display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .oeproTime{ color: rgba(255,255,255,.45); font-size: 12px; }
  .oeproBadge{
    display:none;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 12px;
    color: rgba(255,255,255,.85);
    border: 1px solid rgba(251, 191, 36, .55);
    background: rgba(251, 191, 36, .10);
  }
  .oeproBadge.is-on{ display:inline-flex; }

  /* soft highlight */
  .oeproFlash{
    animation: oeproFlash 900ms ease-out 1;
  }
  @keyframes oeproFlash{
    0%   { box-shadow: 0 0 0 0 rgba(168,85,247,.0); }
    20%  { box-shadow: 0 0 0 6px rgba(168,85,247,.18); }
    60%  { box-shadow: 0 0 0 10px rgba(168,85,247,.10); }
    100% { box-shadow: 0 0 0 14px rgba(168,85,247,0); }
  }

  /* global non-blocking overlay */
  #oeproOverlay{
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 9999;
    display:none;
    min-width: 260px;
    max-width: 360px;
    padding: 12px 12px;
    border-radius: 16px;
    background: rgba(0,0,0,.55);
    border: 1px solid rgba(168,85,247,.55);
    backdrop-filter: blur(10px);
    color: rgba(255,255,255,.92);
    box-shadow: 0 20px 60px rgba(0,0,0,.45);
  }
  #oeproOverlay.is-on{ display:block; }
  #oeproOverlay .row{ display:flex; align-items:center; justify-content:space-between; gap:10px; }
  #oeproOverlay .title{ font-size: 13px; color: rgba(255,255,255,.92); }
  #oeproOverlay .sub{ font-size: 12px; color: rgba(255,255,255,.55); margin-top: 6px; }
  #oeproOverlay .actions{ display:flex; align-items:center; gap:8px; }
  #oeproOverlay .btnStop{
    border: 1px solid rgba(255,255,255,.22);
    background: rgba(255,255,255,.06);
    color: rgba(255,255,255,.9);
    border-radius: 12px;
    padding: 8px 10px;
    cursor:pointer;
  }
  #oeproOverlay .btnStop:disabled{ opacity:.5; cursor:default; }
  #oeproOverlay .spinner{
    width: 14px; height: 14px; border-radius: 999px;
    border: 2px solid rgba(255,255,255,.25);
    border-top-color: rgba(168,85,247,.95);
    animation: oeproSpin 800ms linear infinite;
  }
  @keyframes oeproSpin{ to{ transform: rotate(360deg); } }

  
  /* Mic (Sesli yazma) */
  .oeproTAWrap{ position: relative; }
  .oeproMicBtn{
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    border: 1px solid rgba(255,255,255,.14);
    background: linear-gradient(180deg, rgba(168,85,247,.95), rgba(88,28,135,.92));
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    color: rgba(255,255,255,.96);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
  }
  .oeproMicSvg{ width: 20px; height: 20px; stroke: rgba(255,255,255,.96); stroke-width: 1.7; fill: none; }
  .oeproMicIc{ display:inline-flex; align-items:center; justify-content:center; }
  .oeproMicIc--stop{ display:none; }
  .oeproMicBtn:hover{ transform: translateY(-1px); }
  .oeproMicBtn:active{ transform: translateY(0px) scale(.98); }
  .oeproMicBtn.is-disabled{ opacity: .45; cursor: not-allowed; }
  .oeproMicBtn.is-listening{
    box-shadow:
      0 0 0 3px rgba(168,85,247,.22),
      0 0 24px rgba(168,85,247,.45);
    animation: oeproPulse 1.2s infinite ease-in-out;
  }
  .oeproMicBtn.is-listening .oeproMicIc--mic{ display:none; }
  .oeproMicBtn.is-listening .oeproMicIc--stop{ display:inline-flex; }
  @keyframes oeproPulse{
    0%{ transform: scale(1); }
    50%{ transform: scale(1.06); }
    100%{ transform: scale(1); }
  }

`;
  document.head.appendChild(s);
}

function escapeHtml(s){
  return String(s||"")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/\"/g,"&quot;")
    .replace(/'/g,"&#39;");
}

function softTime(ts){
  try{
    if (!ts) return "";
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    return `${hh}:${mm}`;
  }catch{ return ""; }
}


function formatTR(ts){
  const n = Number(ts || 0);
  if (!n) return "";
  try{
    return new Date(n).toLocaleString("tr-TR", { dateStyle:"short", timeStyle:"short" });
  }catch(_){
    return new Date(n).toLocaleString();
  }
}

function ensureOverlay(){
  if (typeof document === "undefined") return null;
  if (!document.body) return null;
  try{ ensureStyles(); }catch(_){ }
  let el = document.getElementById("oeproOverlay");
  if (el) return el;

  el = document.createElement("div");
  el.id = "oeproOverlay";
  el.innerHTML = `
    <div class="row">
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="spinner" aria-hidden="true"></div>
        <div class="title">Değerlendiriliyor…</div>
      </div>
      <div class="actions">
        <button class="btnStop" type="button">Durdur</button>
      </div>
    </div>
    <div class="sub" data-oepro-sub>0/0</div>
  `;
  document.body.appendChild(el);
  return el;
}

function setOverlay({ on, done=0, total=0, onStop=null }){
  const el = ensureOverlay();
  if (!el) return;
  if (on) el.classList.add("is-on");
  else el.classList.remove("is-on");

  const sub = el.querySelector('[data-oepro-sub]');
  if (sub) sub.textContent = `${done}/${total}`;

  const btn = el.querySelector(".btnStop");
  if (btn){
    btn.disabled = !on;
    btn.onclick = (e) => { e.preventDefault(); try{ onStop?.(); }catch(_){ } };
  }
}

function flashEl(el){
  try{
    if (!el) return;
    el.classList.remove("oeproFlash");
    // reflow
    void el.offsetWidth;
    el.classList.add("oeproFlash");
  }catch(_){ }
}

function findEvalButton(qn, partId){
  try{
    return document.querySelector(`button[data-oepro-eval="1"][data-qn="${Number(qn)}"][data-part-id="${String(partId)}"]`);
  }catch(_){ return null; }
}

/**
 * Lightweight async queue (single worker) for background batch grading.
 * - yields between items so UI stays responsive
 * - survives navigation; if UI for a task is not mounted, it still updates state
 */
function getQueue(){
  if (typeof window === "undefined") return null;
  window.__OEPRO_QUEUE = window.__OEPRO_QUEUE || {
    running: false,
    abort: false,
    tasks: [],
  };
  return window.__OEPRO_QUEUE;
}

// Allow top bar to stop the async queue (toggle behavior).
export function stopOpenEndedQueue(){
  try{
    const q = getQueue();
    if (q) q.abort = true;
  }catch(_){ }
}

async function yieldToUI(){
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => (typeof requestAnimationFrame === "function") ? requestAnimationFrame(()=>r()) : r());
}

function ensureMapAnswers(state){
  if (!state) return;
  if (state.answers instanceof Map) return;
  const obj = state.answers || {};
  const m = new Map();
  for (const k of Object.keys(obj)) m.set(Number(k) || k, obj[k]);
  state.answers = m;
}

function getOpenEndedAnswer(state, qn){
  ensureMapAnswers(state);
  const cur = state.answers.get(qn);
  if (cur && typeof cur === "object" && cur.__type === "open-ended") return cur;
  const fresh = { __type:"open-ended", parts:{}, overall:null };
  state.answers.set(qn, fresh);
  return fresh;
}

function setPartText(state, qn, partId, text){
  const rec = getOpenEndedAnswer(state, qn);
  rec.parts[partId] = rec.parts[partId] || { text:"", grade:null, updatedAt:0 };
  rec.parts[partId].text = String(text || "");
  rec.parts[partId].updatedAt = Date.now();
}

function setPartGrade(state, qn, partId, grade){
  const rec = getOpenEndedAnswer(state, qn);
  rec.parts[partId] = rec.parts[partId] || { text:"", grade:null, updatedAt:0 };
  rec.parts[partId].grade = grade || null;
  rec.parts[partId].gradedAt = Date.now();
}

function computeOverall(rec){
  try{
    const parts = Object.values(rec?.parts || {});
    const scores = parts.map(p => Number(p?.grade?.score)).filter(n => Number.isFinite(n));
    if (!scores.length) return null;
    const avg = Math.round(scores.reduce((a,b)=>a+b,0) / scores.length);
    return { score: avg, updatedAt: Date.now() };
  }catch{ return null; }
}

function ensureScenarioCardInserted(card, scenario){
  try{
    if (!scenario || !String(scenario).trim()) return;
    const first = document.querySelector('.q[data-q="1"], .q-card[data-q="1"], .question-card[data-q="1"]') 
      || document.querySelector('.q[data-q="1"]')
      || card;
    if (!first) return;

    const parent = first.parentElement;
    if (!parent) return;

    if (parent.querySelector('.oe-scenarioCard')) return;

    const scenCard = document.createElement("div");
    scenCard.className = "q oe-scenarioCard";
    scenCard.dataset.oeScenario = "1";
    scenCard.innerHTML = `
      <div class="qTop">
        <div class="qMeta">
          <div class="qNum">OLAY</div>
        </div>
      </div>
      <div class="qText">
        <details class="oe-scenario" open>
          <summary class="oe-scn-title">Olay metni</summary>
          <div class="oe-scn-body">${escapeHtml(String(scenario)).replace(/\n/g,"<br>")}</div>
        </details>
      </div>
      <div class="opts"></div>
    `;
    parent.insertBefore(scenCard, first);
  }catch(e){
    console.warn("[OpenEndedPro] scenario card insert failed", e);
  }
}

function scoreBadge(score){
  const s = Number(score);
  if (!Number.isFinite(s)) return { txt:"—", cls:"" };
  if (s >= 80) return { txt:`${s}`, cls:"oe-score ok" };
  if (s >= 50) return { txt:`${s}`, cls:"oe-score mid" };
  return { txt:`${s}`, cls:"oe-score bad" };
}

function renderGradeBox(box, grade){
  if (!box) return;
  if (!grade){ box.innerHTML = ""; return; }
  const b = scoreBadge(grade.score);
  const subs = grade.subscores && typeof grade.subscores === 'object'
    ? Object.entries(grade.subscores)
        .map(([k,v])=>`<div class="oe-sub"><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("")
    : "";
  const missing = Array.isArray(grade.missing_points)
    ? grade.missing_points.slice(0,8).map(x=>`<li>${escapeHtml(x)}</li>`).join("")
    : "";
  const outline = Array.isArray(grade.outline)
    ? grade.outline.slice(0,10).map(x=>`<li>${escapeHtml(x)}</li>`).join("")
    : "";
  const conf = (grade.confidence != null) ? Number(grade.confidence) : null;
  const confTxt = Number.isFinite(conf) ? `${Math.round(conf*100)}%` : "—";

  box.innerHTML = `
    <div class="oe-gradeTop">
      <div class="${b.cls}">${b.txt}</div>
      <div class="oe-gradeMeta">
        <div class="oe-gradeFeedback">${escapeHtml(grade.brief_feedback || "")}</div>
        <div class="oe-gradeConf">Güven: <b>${confTxt}</b></div>
        ${grade.meta && (grade.meta.model || grade.meta.provider || grade.meta.rubric) ? `<div class="oe-gradeModel">Kaynak: <b>${escapeHtml(grade.meta.provider||"")}</b>${grade.meta.model?` · Model: <b>${escapeHtml(grade.meta.model)}</b>`:""}${grade.meta.rubric?` · Rubrik: <b>${escapeHtml(grade.meta.rubric)}</b>`:""}</div>` : ""}
      </div>
    </div>
    ${subs ? `<div class="oe-subs">${subs}</div>` : ""}
    ${missing ? `<details class="oe-details" open><summary>Eksik Noktalar</summary><ul>${missing}</ul></details>` : ""}
    ${outline ? `<details class="oe-details"><summary>Önerilen İskelet</summary><ul>${outline}</ul></details>` : ""}
  `;
}

function buildRubric(){
  return {
    criteria: [
      { key:"hukuki_nitelendirme", weight:30 },
      { key:"dayanak_norm", weight:25 },
      { key:"olay_uygulama", weight:25 },
      { key:"sonuc_talep", weight:20 },
    ]
  };
}

async function gradeOne({ ctx, qn, scenario, part, answer }){
  const payload = {
    examId: ctx.state?.parsed?.meta?.id || ctx.state?.parsed?.title || "acumen",
    questionNo: qn,
    scenario,
    subQuestion: part?.text || "",
    userAnswer: answer || "",
    rubric: buildRubric(),
  };

  const fn = ctx.aiPracticeGradeOpenEnded || window.aiPracticeGradeOpenEnded;
  if (typeof fn === "function") return await fn(payload);

  return await gradeSubQuestion({
    caseText: String(payload.scenario || ""),
    question: String(payload.subQuestion || ""),
    answer: String(payload.userAnswer || ""),
  });
}

function hideBaseAnswerArea(card){
  try{
    const ta = card.querySelector("textarea");
    if (!ta) return;
    const box = ta.closest?.(".answer, .answer-box, .q-answer, .qAnswer, .answerArea") || ta.parentElement;
    if (box && box.style) box.style.display = "none";
  }catch{}
}

export function injectOpenEndedCard({ ctx, card, q }){
  if (!ctx?.state || !card || !q) return false;
  if (!detectOpenEndedQuestion(q)) return false;
  // same card: avoid double-mount
  if (card?.dataset?.oeproInjected === "1" || card?.dataset?.oeInjected === "1") return true;
  
  try{
    const n = Number(q?.n);
    if (Number.isFinite(n) && n > 0){
      let numEl = card.querySelector(".qNum");
      if (!numEl){
        const meta = card.querySelector(".qMeta") || card.querySelector(".qTop");
        if (meta){
          numEl = document.createElement("div");
          numEl.className = "qNum";
          meta.prepend(numEl);
        }
      }
      if (numEl){
        numEl.textContent = String(n);
      }
    }
  }catch(_){}

  let parsed = parseOpenEnded(q);

  // Eğer parts boşsa ama soru açık uçlu işaretliyse (Tekrar modundan gelen eski kayıtlar),
  // q.text'i tek bir part olarak kullan
  if (!parsed || !Array.isArray(parsed.parts) || parsed.parts.length === 0) {
    const fallbackText = String(q.text || q.stem || "").trim();
    if (!fallbackText) return false;
    parsed = { scenario: "", parts: [{ id: String(q.n || "1"), text: fallbackText }] };
  }

  card.dataset.oeproInjected = "1";
  card.dataset.oeInjected = "1";
  card.classList.add("oe-card");

  const oe = (q.openEnded && typeof q.openEnded === "object") ? q.openEnded : null;
  const isSplit = !!(oe && oe.total && oe.total > 1 && oe.index);
  const shouldShowScenario = !isSplit || Number(oe.index) === 1;

  const qTextEl = card.querySelector(
    ".qText, .q-text, .question-text, .stem, .qStem, .q-body .stem, .q-body .question-text"
  );

  // Olay Metni Eklenmesi
  if (qTextEl && shouldShowScenario){
    if (isSplit){
      ensureScenarioCardInserted(card, parsed.scenario || "");
    } else {
      const scen = parsed.scenario || "";
      if (scen.trim()){
        qTextEl.innerHTML = `
          <details class="oe-scenario">
            <summary class="oe-scn-title">OLAY</summary>
            <div class="oe-scn-body">${escapeHtml(scen).replace(/\n/g,"<br>")}</div>
          </details>
        `;
      }
    }
  }

  const host = card.querySelector(".opts") || card.querySelector(".q-body") || card;
  hideBaseAnswerArea(card);

// Inject momentum bar into card top (non-destructive)
try{
  const top = card.querySelector(".qMeta") || card.querySelector(".qTop") || card.querySelector(".q-header-row") || card;
  if (top && (deltaHtml || formdaHtml || sparkHtml)){
    const box = document.createElement("div");
    box.className = "oe-momentum";
    box.style.cssText = "margin-top:10px;";
    box.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:8px;">
        ${formdaHtml || ""}
        ${deltaHtml || ""}
      </div>
      ${sparkHtml || ""}
    `;
    top.appendChild(box);
  }
}catch(_){}

  const qn = Number(q.n);
  const rec = getOpenEndedAnswer(ctx.state, qn);

  ensureStyles();

// SRS + Open-ended dashboard (once)
_ensureSrsOeDashboard(ctx);

// Open-ended momentum widgets (sparkline + delta + formda)
const prog = Array.isArray(q.progress) ? q.progress : [];
const _spark = _oeRenderDualSparkline(prog);
const sparkHtml = _spark?.html || "";
const st = _spark?.stats || { deltaPct:0, streakUp:0, isFormda:false, lastPct:null };
const delta = Number(st.deltaPct || 0);
const deltaHtml = (Number.isFinite(delta) && delta !== 0)
  ? `<span class="oe-delta ${delta<0?'oe-delta--down':''}" style="
      display:inline-flex;align-items:center;gap:6px;
      padding:6px 10px;border-radius:999px;
      font-size:11px;font-weight:900;
      border:1px solid ${delta<0?'rgba(239,68,68,.35)':'rgba(168,85,247,.32)'};
      background:${delta<0?'rgba(239,68,68,.12)':'rgba(168,85,247,.12)'};
      color:${delta<0?'#fecaca':'#e9d5ff'};
    ">🔥 ${delta>0?'+':''}${delta}%</span>`
  : "";

const formdaHtml = st.isFormda
  ? `<span class="oe-formda" style="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.12);color:#86efac;font-size:11px;font-weight:900;">🏆 Formda</span>`
  : "";

  const sq = q.openEnded?.subQuestion || { id: String(qn), text: String(q.text || "") };
  const partId = String(sq.id || qn);

  const wrap = document.createElement("div");

  const ta = document.createElement("textarea");
  ta.className = "oeproTA";
  ta.placeholder = "Cevabınızı buraya yazın…";
  ta.value = rec.parts?.[partId]?.text || "";

  const autoGrow = () => {
    ta.style.height = "auto";
    ta.style.height = Math.min(420, ta.scrollHeight + 2) + "px";
  };
  setTimeout(autoGrow, 0);

  // Alt Kısım
  const meta = document.createElement("div");
  meta.className = "oeproMetaRow";

  const hint = document.createElement("div");
  hint.className = "oeproHint";
  hint.textContent = (rec.parts?.[partId]?.updatedAt ? "Kaydedildi" : "");

  // Buton Grubu (Olayı Göster İkonu ve Değerlendir yan yana)
  const actions = document.createElement("div");
  actions.className = "oeproActionGroup";

  // Olayı Göster İkon Butonu
  // Split modunda (OLAY + alt sorular) tüm kartlarda aynı aksiyon seti görünsün.
  // 1. kartta olay metni zaten görünür olsa bile, ikon yine de yer alır.
  if (isSplit) {
    const btnScn = document.createElement("button");
    btnScn.type = "button";
    btnScn.className = "oeproIconBtn";
    btnScn.innerHTML = "🔎"; // Büyüteç ikonu kullanıldı
    btnScn.title = "Olay Metnini Göster";
    btnScn.addEventListener("click", ()=>{
      try {
        // Önce mevcut kartın içindeki olay metnini açmayı dene
        const selfDet = card?.querySelector?.("details.oe-scenario");
        if (selfDet){
          selfDet.open = true;
          selfDet.scrollIntoView({ behavior: "smooth", block: "nearest" });
          return;
        }
        // Yoksa olay kartına (genelde 1. kart / scenarioCard) odaklan
        const first = document.querySelector('.oe-scenarioCard')
          || document.querySelector('.q[data-q="1"], .q-card[data-q="1"], .question-card[data-q="1"]')
          || document.querySelector('.q[data-q="1"]')
          || document.querySelector('.q');
        if (first){
          first.scrollIntoView({ behavior: "smooth", block: "start" });
          const det = first.querySelector("details.oe-scenario");
          if (det) det.open = true;
        }
      } catch(_) {}
    });
    actions.appendChild(btnScn);
  }

  const btnOne = document.createElement("button");
  btnOne.type = "button";
  btnOne.className = "oeproBtn oeproPrimary";
  btnOne.textContent = "Bu soruyu değerlendir (AI)";
  btnOne.dataset.oeproEval = "1";
  btnOne.dataset.qn = String(qn);
  btnOne.dataset.partId = String(partId);

  actions.appendChild(btnOne);
  
  const left = document.createElement("div");
  left.className = "oeproMetaLeft";

  const timeEl = document.createElement("div");
  timeEl.className = "oeproTime";

  // ===============================
  // EF tabanlı "Gelişim Rozeti" (SRS)
  // - sadece SRS (Tekrar) modunda görünür
  // - state.srsInfo yoksa (bazı akışlarda) lazy hesaplar
  // ===============================
  const efChip = document.createElement("div");
  efChip.className = "oeproChip";
  efChip.style.display = "none";

  function _oeproEnsureSrsInfo(){
    try{
      const parsed0 = ctx?.state?.parsed;
      const isSrs = /Tekrar \(SRS\)/i.test(parsed0?.title || "") || ctx?.state?.srsReview === true;
      if (!isSrs) return false;
      if (ctx.state.srsInfo && typeof ctx.state.srsInfo === "object" && Object.keys(ctx.state.srsInfo).length) return true;
      const fn = (typeof window !== "undefined") ? window.getSrsInfoForParsed : null;
      if (typeof fn === "function" && parsed0) {
        ctx.state.srsInfo = fn(parsed0) || {};
        return true;
      }
    }catch(_){}
    return false;
  }

  function _oeproEfTier(ef){
    const v = Number(ef);
    if (!Number.isFinite(v)) return null;
    // EF tiering (playful)
    // - "Usta" eşiği: 2.70+
    if (v >= 2.70) return { label: "Usta 🧙‍♂️", cls: "oeproChipGood" };
    if (v >= 2.30) return { label: "İyi 💪", cls: "oeproChipGood" };
    if (v >= 2.00) return { label: "Gelişiyor 🌱", cls: "oeproChipWarn" };
    return { label: "Zorlanıyor 😵‍💫", cls: "oeproChipBad" };
  }

  function _oeproRefreshEf(){
    try{
      const parsed0 = ctx?.state?.parsed;
      const isSrs = /Tekrar \(SRS\)/i.test(parsed0?.title || "") || ctx?.state?.srsReview === true;
      if (!isSrs) { efChip.style.display = "none"; return; }

      _oeproEnsureSrsInfo();
      const info = ctx?.state?.srsInfo?.[qn];
      const ef = info?.ef;
      const tier = _oeproEfTier(ef);
      if (!tier) { efChip.style.display = "none"; return; }

      efChip.className = "oeproChip " + tier.cls;
      efChip.textContent = `EF ${Number(ef).toFixed(2)} • ${tier.label}`;
      efChip.style.display = "inline-flex";
    }catch(_){
      try{ efChip.style.display = "none"; }catch(__){}
    }
  }

  const badgeEl = document.createElement("div");
  badgeEl.className = "oeproBadge";
  badgeEl.textContent = "Yeniden değerlendirilmeli";

  left.appendChild(hint);
  left.appendChild(timeEl);
  left.appendChild(efChip);
  left.appendChild(badgeEl);

  meta.appendChild(left);
  meta.appendChild(actions);

  // initial EF badge render
  _oeproRefreshEf();

  const resultHost = document.createElement("div");

  function refreshStatus(){
    try{
      const part = rec.parts?.[partId] || {};
      const upd = Number(part.updatedAt || 0);
      const grd = Number(part.gradedAt || 0);
      const hasGrade = !!part.grade && !part.grade?.error;
      const hasText = !!String(part.text || "").trim();
      timeEl.textContent = grd ? (`Son değerlendirme: ${formatTR(grd)}`) : "";
      const needs = hasText && hasGrade && upd && grd && grd < upd;
      if (needs) badgeEl.classList.add("is-on");
      else badgeEl.classList.remove("is-on");
      _oeproRefreshEf();
    }catch(_){ }
  }


  ta.addEventListener("input", ()=>{
    autoGrow();
    setPartText(ctx.state, qn, partId, ta.value);
    hint.textContent = "Kaydediliyor…";
    refreshStatus();
    try{ ctx.persist?.(); }catch(_){ }
    setTimeout(()=>{ hint.textContent = "Kaydedildi"; refreshStatus(); }, 520);
  });

  function clamp(n, min, max){
    n = Number(n);
    if (Number.isNaN(n)) return min;
    return Math.min(max, Math.max(min, n));
  }
  function srsFromScore(score){
    const s = clamp(score, 0, 100);
    if (s >= 80) return "pass";
    if (s >= 50) return "partial";
    return "retry";
  }
  function chipClassForSrs(s){
    if (s === "pass") return "oeproChipGood";
    if (s === "partial") return "oeproChipWarn";
    return "oeproChipBad";
  }

  function renderResult(){
    const g = rec.parts?.[partId]?.grade;
    if (!g || g.error) {
      resultHost.innerHTML = "";
      return;
    }

    const score = Math.round(clamp(g.score, 0, 100));
    const confPct = Math.round(clamp(g.confidence, 0, 1) * 100);
    const srs = srsFromScore(score);

    const miss = Array.isArray(g.missing_points) ? g.missing_points : [];
    const outl = Array.isArray(g.outline) ? g.outline : [];

    resultHost.innerHTML = "";
    const res = document.createElement("div");
    res.className = "oeproResult";
    res.innerHTML = `
      <div class="oeproResultTop">
        <span class="oeproChip ${chipClassForSrs(srs)}">Puan: ${score}</span>
        <span class="oeproChip">Güven: ${confPct}%</span>
        <span class="oeproChip ${chipClassForSrs(srs)}">${srs === "pass" ? "Başarılı" : (srs === "partial" ? "Kısmi" : "Tekrar")}</span>
      </div>
      ${g.brief_feedback ? `<div class="oeproFeedback">${escapeHtml(String(g.brief_feedback))}</div>` : ``}
      <div class="oeproDetails">
        <details>
          <summary>Eksik Noktalar</summary>
          <ul>${miss.slice(0, 12).map(x => `<li>${escapeHtml(String(x))}</li>`).join("") || "<li>—</li>"}</ul>
        </details>
        <div style="height:10px"></div>
        <details>
          <summary>Önerilen Cevap İskeleti</summary>
          <ul>${outl.slice(0, 12).map(x => `<li>${escapeHtml(String(x))}</li>`).join("") || "<li>—</li>"}</ul>
        </details>
      </div>
    `;
    resultHost.appendChild(res);
  }

  function needsEvaluation(){
    const part = rec.parts?.[partId];
    const txt = String(part?.text ?? ta.value ?? "").trim();
    if (!txt) return { ok:false, reason:"empty" };
    const upd = Number(part?.updatedAt || 0);
    const grd = Number(part?.gradedAt || 0);
    if (part?.grade && grd && grd >= upd) return { ok:false, reason:"unchanged" };
    return { ok:true, reason:"" };
  }

  async function runEval({ silent=false } = {}){
    const chk = needsEvaluation();
    if (!chk.ok){
      if (!silent){
        if (chk.reason === "empty") {
          try{ ctx.showWarn?.("Cevap boş olamaz"); }catch(_){ }
        } else {
          try{ ctx.showToast?.("Zaten değerlendirildi"); }catch(_){ }
        }
      }
      return { skipped:true, reason: chk.reason };
    }

    const answer = (ta.value || "").trim();

    btnOne.disabled = true;
    const oldTxt = btnOne.textContent;
    btnOne.textContent = "Değerlendiriliyor…";
    hint.innerHTML = `<span class="oeproSkeleton"></span>`;

    try{
      const r = await gradeOne({ ctx, qn, scenario: parsed.scenario || q.openEnded?.caseText || "", part: sq, answer });
      setPartGrade(ctx.state, qn, partId, r);
      rec.overall = computeOverall(rec);
      try{ ctx.persist?.(); }catch(_){ }
      renderResult();
      refreshStatus();
      hint.textContent = "Kaydedildi";
      // soft highlight (if mounted)
      try{ flashEl(wrap); }catch(_){ }
      if (!silent){
        try{ ctx.showToast?.("Değerlendirildi"); }catch(_){ }
      }
      return { skipped:false, ok:true };
    }catch(e){
      console.error(e);
      if (!silent){
        try{ ctx.showWarn?.(e?.message || "AI değerlendirme hatası"); }catch(_){ }
      }
      hint.textContent = "Kaydedildi";
      return { skipped:false, ok:false, error: e };
    }finally{
      btnOne.disabled = false;
      btnOne.textContent = oldTxt;
    }
  }

  // Expose evaluator for "Tümünü Değerlendir"
  btnOne.__oeproEval = runEval;
  btnOne.addEventListener("click", () => runEval({ silent:false }));

  wrap.appendChild(ta);
  attachSpeechToTextarea(ta, { lang: "tr-TR" });
  wrap.appendChild(meta);
  wrap.appendChild(resultHost);
  
  if (host && host.classList && host.classList.contains("opts")){
    host.innerHTML = "";
    host.appendChild(wrap);
  }else if (host){
    host.appendChild(wrap);
  }

  refreshStatus();
  return true;
}

// ---------- Open-ended momentum helpers (Quality + EF sparkline) ----------
function _oeSparkY(p){
  try{
    if (!p || typeof p !== "object") return null;
    if (typeof p.score === "number" && Number.isFinite(p.score)) return Math.max(0, Math.min(1, p.score));
    if (typeof p.quality === "number" && Number.isFinite(p.quality)) return Math.max(0, Math.min(1, p.quality / 5));
    return null;
  }catch(_){ return null; }
}

function _oeNormalizeEf01(ef){
  if (ef == null || !Number.isFinite(Number(ef))) return null;
  const v = Number(ef);
  const lo = 1.3, hi = 3.2;
  const y = (v - lo) / (hi - lo);
  return Math.max(0, Math.min(1, y));
}

function _oeCalcStats(progress = []){
  const arr = Array.isArray(progress) ? progress : [];
  const q = arr.map(_oeSparkY).filter(v => typeof v === "number" && Number.isFinite(v));
  if (q.length < 2){
    return { deltaPct: 0, streakUp: 0, isFormda: false, lastPct: q.length ? Math.round(q[q.length-1]*100) : null };
  }
  const last = q[q.length-1];
  const prev = q[q.length-2];
  const deltaPct = Math.round((last - prev) * 100);

  let streakUp = 0;
  for (let i=q.length-1; i>=1 && streakUp<5; i--){
    if (q[i] > q[i-1]) streakUp++;
    else break;
  }
  return { deltaPct, streakUp, isFormda: streakUp >= 5, lastPct: Math.round(last*100) };
}

function _oeRenderDualSparkline(progress = []){
  try{
    const arr = Array.isArray(progress) ? progress : [];
    const pts = arr.map(p => ({
      ts: Number(p?.ts)||0,
      qy: _oeSparkY(p),
      ef01: _oeNormalizeEf01(p?.ef)
    })).filter(p => p.ts && (p.qy != null || p.ef01 != null));

    const stats = _oeCalcStats(arr);
    if (pts.length < 2) return { html:"", stats };

    pts.sort((a,b)=>a.ts-b.ts);

    const w=240, h=54, pad=5;
    const minT=pts[0].ts, maxT=pts[pts.length-1].ts;
    const dx=(t)=> (maxT===minT) ? pad : pad + ((t-minT)/(maxT-minT))*(w-pad*2);
    const dy=(y)=> pad + (1-y)*(h-pad*2);

    const qPts = pts.filter(p=>p.qy!=null).map(p=>({ts:p.ts,y:p.qy}));
    const efPts = pts.filter(p=>p.ef01!=null).map(p=>({ts:p.ts,y:p.ef01}));

    const mk=(pp)=>pp.map((p,i)=>`${i===0?'M':'L'} ${dx(p.ts).toFixed(2)} ${dy(p.y).toFixed(2)}`).join(" ");
    const qPath = qPts.length>=2 ? mk(qPts) : "";
    const efPath = efPts.length>=2 ? mk(efPts) : "";
    const lastQ = qPts.length ? qPts[qPts.length-1] : null;

    const html = `
      <div class="oe-spark" style="margin-top:10px;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div style="display:flex;flex-direction:column;gap:4px;">
            <div style="font-size:11px;font-weight:900;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.65);">Cevap Kalitesi (Zaman)</div>
            <div style="display:flex;gap:10px;font-size:11px;color:rgba(255,255,255,.75);">
              <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:2px;background:rgba(168,85,247,.95);border-radius:2px;display:inline-block;"></span>Kalite</span>
              <span style="display:inline-flex;align-items:center;gap:6px;"><span style="width:10px;height:2px;background:rgba(59,130,246,.95);border-radius:2px;display:inline-block;"></span>EF</span>
            </div>
          </div>
          <div style="font-size:11px;font-weight:900;color:#fff;white-space:nowrap;">Son: ${stats.lastPct!=null?stats.lastPct+"%":"—"}</div>
        </div>

        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="display:block;width:100%;max-width:${w}px;height:auto;">
          ${qPath ? `<path d="${qPath}" fill="none" stroke="rgba(168,85,247,.95)" stroke-width="2.3" stroke-linecap="round"/>` : ``}
          ${efPath ? `<path d="${efPath}" fill="none" stroke="rgba(59,130,246,.95)" stroke-width="2.0" stroke-linecap="round" stroke-dasharray="4 3"/>` : ``}
          ${lastQ ? `<circle cx="${dx(lastQ.ts).toFixed(2)}" cy="${dy(lastQ.y).toFixed(2)}" r="3.2" fill="rgba(255,255,255,.95)"/>` : ``}
        </svg>
      </div>
    `;
    return { html, stats };
  }catch(_){
    return { html:"", stats:{ deltaPct:0, streakUp:0, isFormda:false, lastPct:null } };
  }
}

function _ensureSrsOeDashboard(ctx){
  try{
    if (!ctx?.state?.parsed?.questions?.length) return;
    if (document.getElementById("oeDashSrs")) return;

    const qs = ctx.state.parsed.questions.filter(q => q?.kind === "openEndedPro");
    if (!qs.length) return;

    const lastVals = qs.map(q=>{
      const prog = Array.isArray(q.progress)?q.progress:[];
      const vals = prog.map(_oeSparkY).filter(v=>typeof v==="number" && Number.isFinite(v));
      return vals.length ? vals[vals.length-1] : null;
    }).filter(v=>v!=null);

    const avg = lastVals.length ? (lastVals.reduce((a,b)=>a+b,0)/lastVals.length) : null;

    const formda = qs.filter(q=>{
      const prog = Array.isArray(q.progress)?q.progress:[];
      const vals = prog.map(_oeSparkY).filter(v=>typeof v==="number" && Number.isFinite(v));
      if (vals.length < 6) return false;
      for (let i=vals.length-1, c=0; i>=1 && c<5; i--, c++){
        if (!(vals[i] > vals[i-1])) return false;
      }
      return true;
    }).length;

    const host = document.getElementById("examArea") || document.body;
    if (!host) return;

    const box = document.createElement("div");
    box.id = "oeDashSrs";
    box.style.cssText = "margin:10px 0 14px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.10);";
    box.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
        <div style="font-size:12px;font-weight:900;letter-spacing:.8px;text-transform:uppercase;color:rgba(255,255,255,.65);">Open-ended Dashboard</div>
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:11px;font-weight:900;color:#fff;">Ortalama: ${avg!=null?Math.round(avg*100)+"%":"—"}</span>
          <span style="font-size:11px;font-weight:900;color:#86efac;">🏆 Formda: ${formda}</span>
        </div>
      </div>
    `;
    host.prepend(box);
  }catch(_){}
}


// Global batch evaluation (used by the top bar button)
export async function evaluateAllOpenEnded(ctx){
  try{
    const btns = Array.from(document.querySelectorAll('button[data-oepro-eval="1"]'));
    if (!btns.length) return;

    // Determine which items actually need evaluation
    let total = 0;
    const tasks = [];

    for (const b of btns){
      if (!b) continue;
      const qn = Number(b.dataset.qn);
      const partId = String(b.dataset.partId || "");
      if (!qn || !partId) continue;

      // state record
      let part = null;
      try{
        ensureMapAnswers(ctx?.state);
        const rec = ctx?.state?.answers?.get(qn);
        part = rec?.parts?.[partId] || null;
      }catch(_){ part = null; }

      const txt = String(part?.text || "").trim();
      const upd = Number(part?.updatedAt || 0);
      const grd = Number(part?.gradedAt || 0);
      const hasGrade = !!part?.grade && !part?.grade?.error;

      const needs = !!txt && (!hasGrade || !grd || grd < upd);
      if (needs){
        total++;
        tasks.push({ qn, partId });
      }
    }

    const api = (typeof window !== "undefined") ? (window.__ACUMEN_OPEN_ENDED || {}) : {};
    const onProgress = (typeof api.onProgress === "function") ? api.onProgress : null;

    if (total === 0){
      try{ ctx?.showToast?.("Değerlendirilecek cevap yok"); }catch(_){}
      if (onProgress) onProgress(0, 0);
      return;
    }

    const q = getQueue();
    if (!q) return;

    // Dedupe + merge tasks into queue
    const key = (t) => `${Number(t.qn)}::${String(t.partId)}`;
    const existing = new Set(q.tasks.map(key));
    for (const t of tasks){
      const k = key(t);
      if (!existing.has(k)){
        q.tasks.push(t);
        existing.add(k);
      }
    }

    // If already running, just return (overlay/progress is already active)
    if (q.running) return;

    q.running = true;
    q.abort = false;

    let done = 0;
    const grandTotal = q.tasks.length;

    if (onProgress) onProgress(done, grandTotal);
    setOverlay({ on:true, done, total: grandTotal, onStop: ()=>{ q.abort = true; } });

    // Worker loop
    while (q.tasks.length && !q.abort){
      const t = q.tasks.shift();
      if (!t) continue;

      // Yield to keep the UI responsive (async queue mode)
      await yieldToUI();

      const b = findEvalButton(t.qn, t.partId);
      const fn = b && b.__oeproEval;
      if (typeof fn === "function"){
        await fn({ silent:true });
      }else{
        // Headless mode (user navigated away). Still update state.
        try{
          const parsed = ctx?.state?.parsed;
          const qObj = (parsed?.questions || []).find(x => Number(x?.n) === Number(t.qn));
          if (qObj && detectOpenEndedQuestion(qObj)){
            const po = parseOpenEnded(qObj);
            const part = (po?.subs || []).find(s => String(s.id) === String(t.partId)) || null;
            ensureMapAnswers(ctx?.state);
            const rec = ctx?.state?.answers?.get(Number(t.qn));
            const ans = String(rec?.parts?.[String(t.partId)]?.text || "");
            if (String(ans).trim()){
              const r = await gradeOne({ ctx, qn: Number(t.qn), scenario: po?.scenario || "", part, answer: ans });
              setPartGrade(ctx.state, Number(t.qn), String(t.partId), r);
              rec.overall = computeOverall(rec);
              try{ ctx.persist?.(); }catch(_){ }
            }
          }
        }catch(e){
          console.error('[OpenEndedPro] headless grade error', e);
        }
      }

      done++;
      if (onProgress) onProgress(done, grandTotal);
      setOverlay({ on:true, done, total: grandTotal, onStop: ()=>{ q.abort = true; } });
    }

    q.running = false;
    const aborted = q.abort;
    q.abort = false;
    q.tasks = [];

    // Ensure UI (top bar) gets the final state even if aborted.
    if (onProgress) onProgress(done, grandTotal);

    setOverlay({ on:false, done: grandTotal, total: grandTotal });

    try{
      if (aborted) ctx?.showToast?.("Değerlendirme durduruldu");
      else ctx?.showToast?.(`Değerlendirme tamamlandı (${done}/${grandTotal})`);
    }catch(_){ }
  }catch(e){
    console.error('[OpenEndedPro] evaluateAll failed', e);
  }
}

// ================================
// OpenEndedPro: SAFE AUTO-INJECTOR
// - mevcut render akışına zarar vermez
// - kartlar DOM'a sonradan gelse bile (SRS/Tekrar) inject eder
// ================================
export function scanAndInjectOpenEnded(ctx = {}, root = null) {
  try {
    if (!ctx?.state?.parsed?.questions?.length) return;

    const doc = (root && root.querySelectorAll) ? root : document;

    // -----------------------------
    // helper: parsed -> q map
    // -----------------------------
    const byN = new Map();
    for (const q of (ctx.state.parsed.questions || [])) {
      const n = Number(q?.n);
      if (Number.isFinite(n) && n > 0) byN.set(n, q);
    }

    // -----------------------------
    // 1) Normal yol: data-q olan kartları tara
    // -----------------------------
    const cards = Array.from(
      doc.querySelectorAll('.q[data-q], .q-card[data-q], .question-card[data-q], [data-q]')
    );

    let injectedAny = false;

    for (const card of cards) {
      const qn = Number(card?.dataset?.q || card?.getAttribute?.("data-q"));
      if (!Number.isFinite(qn) || qn <= 0) continue;

      const q = byN.get(qn);
      if (!q) continue;

      injectOpenEndedCard({ ctx, card, q });
      injectedAny = true;
    }

    if (injectedAny) return;

    // -----------------------------
    // 2) SRS fallback: data-q yoksa
    // - Sol haritada seçili soru numarasını yakala
    // - Ana panelde "Soru/Pratik" pill'lerini barındıran kartı bul
    // -----------------------------

    // 2a) aktif soru numarası (sol panel)
    let activeQn = null;

    const navCandidates = Array.from(doc.querySelectorAll('button, [role="button"], a, div'))
      .filter(el => {
        const t = (el.textContent || "").trim();
        return /^\d{1,4}$/.test(t);
      });

    const activeNav =
      navCandidates.find(el => /active|selected|current/i.test(el.className || "")) ||
      navCandidates.find(el => el.getAttribute?.("aria-current") === "true") ||
      navCandidates.find(el => el.getAttribute?.("aria-selected") === "true") ||
      null;

    if (activeNav) {
      const t = (activeNav.textContent || "").trim();
      const n = Number(t);
      if (Number.isFinite(n) && n > 0) activeQn = n;
    }

    if (!activeQn && navCandidates[0]) {
      const n = Number((navCandidates[0].textContent || "").trim());
      if (Number.isFinite(n) && n > 0) activeQn = n;
    }

    if (!activeQn) return;

    const q = byN.get(activeQn);
    if (!q) return;

    // SRS fallback: sadece gerçek openEndedPro
    if (q.kind !== "openEndedPro") return;

    // 2b) aktif kartı bul: içinde "Soru" ve "Pratik" pill'leri olan en yakın container
    const pills = Array.from(doc.querySelectorAll("button, div, span"))
      .filter(el => {
        const t = (el.textContent || "").trim().toLowerCase();
        return t === "soru" || t === "pratik";
      });

    let card = null;

    const soruEl = pills.find(el => (el.textContent || "").trim().toLowerCase() === "soru");
    const pratikEl = pills.find(el => (el.textContent || "").trim().toLowerCase() === "pratik");

    const climb = (el, max = 10) => {
      const out = [];
      let cur = el;
      for (let i = 0; i < max && cur; i++) {
        out.push(cur);
        cur = cur.parentElement;
      }
      return out;
    };

    if (soruEl && pratikEl) {
      const a = climb(soruEl);
      const b = new Set(climb(pratikEl));
      card = a.find(x => b.has(x)) || null;
    }

    if (!card && pratikEl) {
      card = climb(pratikEl, 8).find(x => (x.className || "").toString().match(/card|panel|question|content/i)) || pratikEl.parentElement;
    }

    if (!card) {
      const blocks = Array.from(doc.querySelectorAll("div"))
        .filter(d => (d.className || "").toString().match(/card|panel|question/i));
      card = blocks.sort((x, y) => (y.innerText || "").length - (x.innerText || "").length)[0] || null;
    }

    if (!card) return;

    injectOpenEndedCard({ ctx, card, q });

  } catch (_) { /* no-op */ }
}

export function installOpenEndedAutoInjector(ctx = {}, opts = {}) {
  try {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // tek sefer kur
    if (window.__OEPRO_AUTO_INJECTOR_ON) return;
    window.__OEPRO_AUTO_INJECTOR_ON = true;

    const root =
      opts.root ||
      (typeof opts.rootId === "string" ? document.getElementById(opts.rootId) : null) ||
      document.getElementById("examArea") ||
      document.body;

    if (!root) return;

    // ilk tarama
    setTimeout(() => scanAndInjectOpenEnded(ctx, root), 0);
    setTimeout(() => scanAndInjectOpenEnded(ctx, root), 250);

    // DOM değişince tekrar tara (debounce)
    let t = null;
    const ping = () => {
      clearTimeout(t);
      t = setTimeout(() => scanAndInjectOpenEnded(ctx, root), 50);
    };

    const obs = new MutationObserver(() => ping());
    obs.observe(root, { childList: true, subtree: true });

    // SRS'de soru değişimi tıklama ile olabiliyor; ekstra ping (zararsız)
try{
  if (!window.__OEPRO_CLICK_PING_ON){
    window.__OEPRO_CLICK_PING_ON = true;
    document.addEventListener("click", () => {
      setTimeout(() => {
        try{ scanAndInjectOpenEnded(ctx, root); }catch(_){}
      }, 0);
    }, true);
  }
}catch(_){}

window.__OEPRO_OBS = obs;
  } catch (_) { /* no-op */ }
}

// global short-hands (opsiyonel)
try {
  if (typeof window !== "undefined") {
    window.scanAndInjectOpenEnded = scanAndInjectOpenEnded;
    window.installOpenEndedAutoInjector = installOpenEndedAutoInjector;
  }
} catch (_) {}

