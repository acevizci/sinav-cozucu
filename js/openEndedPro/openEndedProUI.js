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
  if (card.dataset.oeInjected === "1") return true;
  
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

  const parsed = parseOpenEnded(q);
  if (!parsed || !Array.isArray(parsed.parts) || parsed.parts.length === 0) return false;

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

  const qn = Number(q.n);
  const rec = getOpenEndedAnswer(ctx.state, qn);

  ensureStyles();

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
  // Eğer soru bir olay sorusuysa (isSplit) veya olayı varsa bu ikonu göster.
  if (isSplit && !shouldShowScenario) {
    const btnScn = document.createElement("button");
    btnScn.type = "button";
    btnScn.className = "oeproIconBtn";
    btnScn.innerHTML = "🔎"; // Büyüteç ikonu kullanıldı
    btnScn.title = "Olay Metnini Göster";
    btnScn.addEventListener("click", ()=>{
      try {
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
  
  meta.appendChild(hint);
  meta.appendChild(actions);

  const resultHost = document.createElement("div");

  ta.addEventListener("input", ()=>{
    autoGrow();
    setPartText(ctx.state, qn, partId, ta.value);
    hint.textContent = "Kaydediliyor…";
    try{ ctx.persist?.(); }catch(_){}
    setTimeout(()=>{ hint.textContent = "Kaydedildi"; }, 520);
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
      hint.textContent = "Kaydedildi";
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
  wrap.appendChild(meta);
  wrap.appendChild(resultHost);
  
  if (host && host.classList && host.classList.contains("opts")){
    host.innerHTML = "";
    host.appendChild(wrap);
  }else if (host){
    host.appendChild(wrap);
  }

  return true;
}

// Global batch evaluation (used by the top bar button)
export async function evaluateAllOpenEnded(ctx){
  try{
    const btns = Array.from(document.querySelectorAll('button[data-oepro-eval="1"]'));
    if (!btns.length) return;

    // Determine which items actually need evaluation
    let total = 0;
    const plan = [];

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
      const hasGrade = !!part?.grade;

      const needs = !!txt && (!hasGrade || !grd || grd < upd);
      if (needs){
        total++;
        plan.push(b);
      }
    }

    const api = (typeof window !== "undefined") ? (window.__ACUMEN_OPEN_ENDED || {}) : {};
    const onProgress = (typeof api.onProgress === "function") ? api.onProgress : null;
    if (onProgress) onProgress(0, total);

    let done = 0;
    for (const b of plan){
      if (!b || b.disabled) continue;
      const fn = b.__oeproEval;
      if (typeof fn !== 'function') continue;
      await fn({ silent:true });
      done++;
      if (onProgress) onProgress(done, total);
    }

    try{
      if (total === 0) ctx?.showToast?.("Değerlendirilecek cevap yok");
      else ctx?.showToast?.(`Değerlendirme tamamlandı (${done}/${total})`);
    }catch(_){ }
  }catch(e){
    console.error('[OpenEndedPro] evaluateAll failed', e);
  }
}
