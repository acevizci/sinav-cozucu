// js/ui/exam.js - Sınav Render Modülü (Tam Sürüm - Fix V2)

import { escapeHtml, UI_LETTERS, getCorrectDisplayLetter } from "./shared.js";
import { isMissingOptionText, getQuestionSubject, safe, safeText } from "./shared.js";
import { handleGamification } from "./shared.js";
import { refreshNavColors } from "./nav.js";
import { runGeminiAnalysis, runGeminiGenerator } from "./ai.js";
import { lookupWrongRecord } from "../wrongBook.js";


/* ================= MULTI-SELECT HELPERS (Çoklu Seçim Yardımcıları) ================= */

function _lettersFromAny(x) {
  if (!x) return [];
  if (x instanceof Set) return Array.from(x);
  if (Array.isArray(x)) return x;
  if (typeof x === "string") {
    // "A" ise ["A"], "Cevap A" ise ["A"], "ACE" ise ["A","C","E"]
    const clean = x.trim().toUpperCase();
    if (clean.length === 1) return [clean];
    const m = clean.match(/[A-F]/g);
    return m || [];
  }
  return [];
}

function _toLetterSet(x) {
  return new Set(_lettersFromAny(x).map(s => String(s).toUpperCase()).filter(Boolean));
}

function _isBlankChoice(chosen) {
  const s = _toLetterSet(chosen);
  return s.size === 0;
}

function _setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

function _isMultiAnswerKey(correctId) {
  const letters = _lettersFromAny(correctId);
  return letters.length > 1;
}

function _isCorrectNow(q, chosen, correctId) {
  if (!correctId) return false;
  const isMulti = (q?.selectCount || 1) > 1 || _isMultiAnswerKey(correctId);

  if (!isMulti) {
    const correctLetter = getCorrectDisplayLetter(q, correctId);
    return !!chosen && chosen === correctLetter;
  }

  const chosenSet = _toLetterSet(chosen);
  const correctSet = _toLetterSet(correctId);
  if (chosenSet.size === 0) return false;
  return _setsEqual(chosenSet, correctSet);
}

function _multiScoreNoPenalty(chosenSet, correctSet){
  const K = correctSet?.size || 0;
  if (!K) return 0;
  let C = 0;
  for (const x of chosenSet) if (correctSet.has(x)) C++;
  return C / K; // 0..1 arası puan
}

// Global scoring: single -> 1/0, multi -> C/K
function _questionScore(q, chosen, correctId, { selectCount=1, mode="result" } = {}){
  if (!correctId) return null;

  const isMulti = (selectCount || 1) > 1 || _isMultiAnswerKey(correctId);
  if (!isMulti){
    const correctLetter = getCorrectDisplayLetter(q, correctId);
    if (!chosen) return 0;
    return (chosen === correctLetter) ? 1 : 0;
  }

  const chosenSet = _toLetterSet(chosen);
  const correctSet = _toLetterSet(correctId);

  // Sınav anında seçim bitmeden puan yok
  if (mode === "exam" && chosenSet.size !== (selectCount||1)) return null;

  // Sonuç modunda eksik seçim 0 puan değil, kısmi puan olabilir (veya 0)
  // Buradaki mantık: Eksikse 0 kabul edelim
  if (mode !== "exam" && chosenSet.size !== (selectCount||1)) return 0;

  return _multiScoreNoPenalty(chosenSet, correctSet);
}

/* ================= SORU FİLTRELEME ================= */
function shouldShowQuestion(state, qN){
  if (state.mode!=="result") return true;

  const onlyWrong = safe("showOnlyWrong")?.checked;
  const onlyBlank = safe("showOnlyBlank")?.checked;

  const answersRaw = state.answers;
  const answers = (answersRaw instanceof Map) ? answersRaw : {
    has(qn){ return answersRaw && (answersRaw[qn] ?? answersRaw[String(qn)]) !== undefined; },
    get(qn){ return answersRaw ? (answersRaw[qn] ?? answersRaw[String(qn)]) : undefined; }
  };

  const chosen = answers.get(qN);
  const q = state.parsed.questions.find(x=>x.n===qN);
  
  // 🔥 FIX: Filtreleme yaparken de doğru cevabı her yerden ara
  const keyMap = state.parsed.answerKey || {};
  const correctId = keyMap[qN] || 
                    keyMap[String(qN)] || 
                    keyMap[Number(qN)] || 
                    q.answer || 
                    q.correctAnswer || 
                    q.dogruCevap ||
                    q._answerFromSolution;

  if (onlyBlank && !_isBlankChoice(chosen)) return false;

  if (onlyWrong){
    if (!correctId) return false;
    if (_isBlankChoice(chosen)) return false;
    return !_isCorrectNow(q, chosen, correctId);
  }

  return true;
}


/* ================= ANA RENDER FONKSİYONU ================= */
export function renderExam(state){
  window.__APP_STATE = state;

  const area = safe("examArea");
  if (!area) return;
  area.innerHTML = "";

  if (!state.parsed){
    area.innerHTML = `<div class="hint">Sınav burada görünecek.</div>`;
    safeText("examTitle","Sınav");
    safeText("examMeta","Henüz ayrıştırılmadı.");
    return;
  }

  safeText("examTitle", state.parsed.title);
  safeText("examMeta", `${state.parsed.questions.length} soru • Anahtar: ${state.parsed.keyCount||0}`);

  // Adapter: Answers (Map veya Object)
  const answersRaw = state.answers;
  const answers = (answersRaw instanceof Map) ? answersRaw : {
    has(qn){ return answersRaw && (answersRaw[qn] ?? answersRaw[String(qn)]) !== undefined; },
    get(qn){ return answersRaw ? (answersRaw[qn] ?? answersRaw[String(qn)]) : undefined; },
    set(qn, v){
      if (answersRaw instanceof Map) return answersRaw.set(qn, v);
      state.answers = answersRaw || {};
      state.answers[qn] = v;
    }
  };

  const keyMap = state.parsed.answerKey || {};

  // --- SORU DÖNGÜSÜ ---
  for (const q of state.parsed.questions){
    if (!shouldShowQuestion(state, q.n)) continue;

    const chosen = answers.get(q.n);
    
    // 🔥 FIX: Cevabı Kurşun Geçirmez Şekilde Bul
    // Anahtar listesi, String ID, Number ID veya sorunun kendisi
    const correctId = keyMap[q.n] || 
                      keyMap[String(q.n)] || 
                      keyMap[Number(q.n)] || 
                      q.answer || 
                      q.correctAnswer || 
                      q.dogruCevap || 
                      q._answerFromSolution;

    const keyLetters = _lettersFromAny(correctId);
    const selectCount = Math.max((q.selectCount || 1), (keyLetters.length || 1));
    const isMulti = selectCount > 1;

    const correctLetter = (!isMulti && correctId) ? getCorrectDisplayLetter(q, correctId) : null;
    const hasKey = !!correctId;

    const isCorrectNow = hasKey && !_isBlankChoice(chosen) && _isCorrectNow(q, chosen, correctId);

    // Rozet ve Skor Hesaplama
    let resultScore = null;
    let badge = `<span class="badge">Soru</span>`;
    const isBlank = _isBlankChoice(chosen);

    if (state.mode==="exam") {
      badge = isBlank ? `<span class="badge">Boş</span>` : `<span class="badge warn">İşaretli</span>`;
    }

    if (state.mode==="result"){
      if (!correctId) badge=`<span class="badge">Anahtar yok</span>`;
      else if (isBlank) badge=`<span class="badge warn">Boş</span>`;
      else {
        resultScore = _questionScore(q, chosen, correctId, { selectCount, mode: "result" });

        if (resultScore === 1) badge=`<span class="badge ok">Doğru</span>`;
        else if (resultScore === 0) badge=`<span class="badge bad">Yanlış</span>`;
        else badge=`<span class="badge warn">Kısmi • %${Math.round(resultScore*100)}</span>`;
      }
    }

    // WrongBook Rozeti (Yanlış Defteri kaydı varsa kart üstünde göster)
    let wbBadge = "";
    try{
      const wr = lookupWrongRecord?.(q);
      const wc = wr ? (wr.wrongCount ?? wr.count ?? wr.times ?? wr.wrong ?? 0) : 0;
      if (wc > 0){
        wbBadge = `<span class="badge bad" title="Yanlış Defteri"> ${wc} Kez Yanlış Yaptın</span>`;
      }
    }catch(e){ /* no-op */ }

    // AI Butonları (Sadece yanlışlarda veya boşlarda gösterilebilir, şu an hepsinde açık)
    let aiBtnsHtml = "";
    const showAi = (state.mode === "result" && correctId && !isBlank && !isCorrectNow);
    if (showAi) {
      aiBtnsHtml = `
        <button class="btn-ai-explain ai-explain-trigger" data-qn="${q.n}">✨ Neden?</button>
        <button class="btn-ai-similar ai-gen-trigger" data-qn="${q.n}">♻️ Benzer</button>
      `;
    }

    // Soru HTML Yapısı
    const qDiv = document.createElement("div");
    qDiv.className="q";
    if (resultScore !== null) qDiv.dataset.score = String(resultScore);

    qDiv.dataset.q=q.n;
    qDiv.innerHTML=`
      <div class="qTop">
        <div class="qNum">${q.n}.</div>
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
          ${badge}${wbBadge}
          <span class="badge subject-chip" id="subj-chip-${q.n}">${escapeHtml(getQuestionSubject(q))}</span>
          ${aiBtnsHtml}
        </div>
      </div>
      <div class="qText">${q.text}</div>
      <div class="opts"></div>
      <div id="ai-box-${q.n}" class="ai-box"></div>
      <div id="ai-gen-box-${q.n}" class="ai-challenge-box" style="display:none"></div>
    `;

    // AI Event Listeners
    if (showAi) {
      const expBtn = qDiv.querySelector('.ai-explain-trigger');
      if (expBtn) expBtn.addEventListener('click', (e) => runGeminiAnalysis(parseInt(e.target.dataset.qn)));
      const genBtn = qDiv.querySelector('.ai-gen-trigger');
      if (genBtn) genBtn.addEventListener('click', (e) => runGeminiGenerator(parseInt(e.target.dataset.qn)));
    }

    const opts = qDiv.querySelector(".opts");
    const chosenSet = isMulti ? _toLetterSet(chosen) : null;
    const correctSet = (isMulti && correctId) ? _toLetterSet(correctId) : null;

    // --- ŞIK DÖNGÜSÜ (A-F) ---
    for (const L of UI_LETTERS){
      const opt = q.optionsByLetter?.[L];
      if (!opt) continue; 

      const rawText = (opt?.text ?? "");
      const missing = isMissingOptionText(rawText);
      const optHtml = missing ? `<span class="opt-missing-chip">PDF görsel</span>` : escapeHtml(String(rawText));

      const label=document.createElement("label");
      label.className="opt";

      // Renklendirme (Sonuç Modu)
      if (state.mode==="result" && hasKey){
        if (!isMulti && correctLetter){
          if (L===correctLetter) label.classList.add("correct");
          if (L===chosen && L!==correctLetter) label.classList.add("wrong");
        } else if (isMulti){
          const isC = correctSet.has(L);
          const isCh = chosenSet.has(L);
          if (isC) label.classList.add("correct");
          if (isCh) label.classList.add("chosen");
          if (isCh && !isC) label.classList.add("wrong");
          if (isCh && isC) label.classList.add("correct-chosen");
        }
      }

      const isKey = (state.mode === "result" && hasKey && correctSet && correctSet.has(L));
      const keyMark = isKey ? `<span class="keyTick" title="Doğru şık">✓</span>` : "";

      label.innerHTML=`
        <input type="${isMulti ? "checkbox" : "radio"}" name="q${q.n}" value="${L}"
          ${ (isMulti ? (chosenSet?.has(L) ? "checked" : "") : (chosen===L ? "checked" : "")) }
          ${state.mode!=="exam" ? "disabled" : ""}>
        <div><b>${L})</b> ${optHtml} ${keyMark}</div>
      `;

      // Gamification ve Cevaplama Event'i
      const input = label.querySelector("input");
      if (input && state.mode === "exam") {
        if (!input.dataset.boundChange) {
          input.dataset.boundChange = "1";
          input.addEventListener("change", () => {
            const prev = answers.get(q.n);
            const firstTime = !answers.has(q.n) || _isBlankChoice(prev);

            if (!isMulti) {
              answers.set(q.n, L);
            } else {
              let cur = prev instanceof Set ? new Set(prev) : _toLetterSet(prev);
              if (input.checked) {
                if (cur.size >= selectCount) {
                  input.checked = false;
                  window.showToast?.({ title: "Seçim limiti", msg: `En fazla ${selectCount} şık seçebilirsin.`, kind: "warn" });
                  return;
                }
                cur.add(L);
              } else {
                cur.delete(L);
              }
              answers.set(q.n, cur);
            }

            refreshNavColors(state);

            // Anlık Puan Hesaplama (Pati XP için)
            const chosenNow = answers.get(q.n);
            // 🔥 FIX: Buradaki anlık hesaplama da güçlendirildi
            const correctIdNow = keyMap[q.n] || 
                                 keyMap[String(q.n)] || 
                                 keyMap[Number(q.n)] || 
                                 q.answer || 
                                 q.correctAnswer;
            
            let score = null;
            if (correctIdNow) {
              score = _questionScore(q, chosenNow, correctIdNow, { selectCount, mode: "exam" });
            }
            try { handleGamification(score, { firstTime }); } catch {}
          });
        }
      }
      opts.appendChild(label);
    }

    // --- SRS WIDGET (Hafıza Kartı Butonları) ---
    // Bu kısım "Hataları Tekrarla" veya "SRS Modu" aktifse görünür
    if (state.mode==="result" && state.srsReview){
      const info = state.srsInfo?.[q.n] || null;
      const srsWrap = document.createElement("div");
      srsWrap.className = "srsWrap";
      srsWrap.dataset.q = q.n;

      if (!hasKey){
        srsWrap.innerHTML = `<div class="srsLine muted">SRS: Anahtar yok</div>`;
      } else if (isBlank){
        srsWrap.innerHTML = `<div class="srsLine">SRS: Boş → yarın tekrar</div>`;
      } else if (!isCorrectNow){
        srsWrap.innerHTML = `<div class="srsLine">SRS: Yanlış → yarın tekrar</div>`;
      } else {
        const dueTxt = info?.due ? new Date(info.due).toLocaleDateString("tr-TR") : "—";
        const meta = info ? `EF ${info.ef.toFixed(2)} • ${info.interval}g • ${dueTxt}` : "—";
        srsWrap.innerHTML = `
          <div class="srsLine">
            <span><b>SRS</b> • ${meta}</span>

            <button class="srsBtn" data-quality="3"
              data-tip="Zor: Hatırladın ama zorlandın. Genelde yarın tekrar.">
              Zor
            </button>

            <button class="srsBtn" data-quality="4"
              data-tip="Orta: Rahat hatırladın. Aralık birkaç gün uzar.">
              Orta
            </button>

            <button class="srsBtn" data-quality="5"
              data-tip="Kolay: Çok netti. Uzun süre tekrar gelmez.">
              Kolay
            </button>

          </div>
          <div class="srsHint muted">Bu sorunun tekrar aralığını seç.</div>
        `;
      }

      qDiv.appendChild(srsWrap);
    }

    area.appendChild(qDiv);
  }

  // --- GLOBAL SKOR HESAPLAMA (KARNE İÇİN) ---
  // 🔥 FIX: Burası artık "Kurşun Geçirmez"
  if (state.mode === "result") {
    let sum = 0;
    let max = 0;

    for (const qq of state.parsed.questions) {
      // 1. Cevabı her yerden ara
      const cId = keyMap[qq.n] || 
                  keyMap[String(qq.n)] || 
                  keyMap[Number(qq.n)] ||
                  qq.answer || 
                  qq.correctAnswer || 
                  qq.dogruCevap ||
                  qq._answerFromSolution;

      if (!cId) continue;

      const ch = answers.get(qq.n);
      const keyLetters = _lettersFromAny(cId);
      const scCount = Math.max((qq.selectCount || 1), (keyLetters.length || 1));
      
      const s = _questionScore(qq, ch, cId, { selectCount: scCount, mode: "result" });
      if (s === null) continue;

      sum += Number(s) || 0;
      max += 1;
    }

    const pct = max ? Math.round((sum / max) * 100) : 0;
    state.examScore = { sum, max, pct };
    
    // Global erişim için (Summary ekranı buradan okuyabilir)
    window.__EXAM_SCORE = state.examScore;
  }
}