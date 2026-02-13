// js/aiPractice/inExamRegenerate.js
// Adds an in-exam "Regenerate this question" control for AI-generated practice exams.
// Minimal intrusion: DOM-injection + a single global handler.

import { regenerateOneQuestion } from "./practiceGenerator.js";
import { buildSourcesPayloadFromIds } from "./notesStore.js";

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function isAiPractice(parsed){
  return !!(parsed && parsed.meta && (parsed.meta.isAiPractice || parsed.meta.isAiGeneratedPractice || parsed.meta.aiPractice));
}

function getPracticeMeta(parsed){
  const meta = parsed?.meta || {};
  const ap = meta.aiPractice || {};
  return {
    attemptNo: ap.attemptNo || meta.attemptNo || 1,
    distribution: ap.distribution || meta.distribution || "balanced",
    sourceIds: ap.sourceIds || meta.sourceIds || [],
    selectionHash: ap.selectionHash || meta.selectionHash || null,
  };
}

function extractQuestionPayload(parsed, n){
  const q = (parsed?.questions || []).find(x => Number(x.n) === Number(n));
  if (!q) return null;

  // Normalize choices for backend (A-E).
  const letters = ["A","B","C","D","E"];
  const choices = {};
  if (q.optionsByLetter){
    for (const L of letters){
      const opt = q.optionsByLetter[L];
      if (opt) choices[L] = (opt.text || opt.label || opt.value || opt.id || "").toString();
    }
  } else if (Array.isArray(q.options)){
    for (let i=0;i<Math.min(5,q.options.length);i++){
      choices[letters[i]] = (q.options[i]?.text || q.options[i] || "").toString();
    }
  }

  return {
    n: Number(q.n),
    stem: (q.stem || q.text || q.question || "").toString(),
    choices,
    subject: q.subject || q.topic || null,
    difficulty: q.difficulty || null,
    // Let backend decide correct option; client updates answerKey accordingly.
  };
}

function applyRegeneratedQuestionToParsed(parsed, regenerated){
  // regenerated expected: { n, stem, choices:{A..E}, correct:'A'..'E', explanation?, subject? }
  const n = Number(regenerated?.n);
  const idx = (parsed?.questions || []).findIndex(q => Number(q.n) === n);
  if (idx < 0) return false;

  const q = parsed.questions[idx];
  q.stem = regenerated.stem ?? q.stem;
  q.text = q.stem; // some renderers use text
  q.subject = regenerated.subject ?? q.subject;

  // optionsByLetter is used widely in scoring helpers (finishExam resolves ids from optionsByLetter) fileciteturn8file0
  q.optionsByLetter = q.optionsByLetter || {};
  for (const L of ["A","B","C","D","E"]){
    const txt = regenerated.choices?.[L];
    if (!txt) continue;
    const prev = q.optionsByLetter[L] || {};
    q.optionsByLetter[L] = { ...prev, id: prev.id || L, text: txt };
  }

  // Also keep a plain options array if it exists.
  if (Array.isArray(q.options)){
    q.options = ["A","B","C","D","E"].map(L => q.optionsByLetter[L]?.text || regenerated.choices?.[L] || "");
  }

  // Update answer key (keyMap uses q.n) fileciteturn8file0
  parsed.answerKey = parsed.answerKey || {};
  if (regenerated.correct) parsed.answerKey[q.n] = regenerated.correct;

  // Optional explanation
  if (regenerated.explanation) q.explanation = regenerated.explanation;

  return true;
}

function ensureButtons(ctx){
  const { state } = ctx;
  if (state.mode !== "exam") return;
  if (!isAiPractice(state.parsed)) return;

  const qs = $all(".q");
  if (!qs.length) return;

  for (const card of qs){
    const nRaw = card.getAttribute("data-n") || (card.id || "").replace("q-","");
    const n = Number(nRaw);
    if (!n) continue;

    if (card.querySelector(".ai-practice-btn-group")) continue;

    const top = card.querySelector(".qTop") || card;
    const group = document.createElement("div");
    group.className = "ai-practice-btn-group";
    group.style.display = "flex";
    group.style.gap = "10px";
    group.style.flexWrap = "wrap";
    group.style.marginTop = "10px";

    const btn = document.createElement("button");
    btn.className = "ghost";
    btn.textContent = "♻️ Soruyu Yenile";
    btn.title = "Bu soruyu Gemini ile yeniden üret (aynı notlardan).";
    btn.onclick = () => window.__ACUMEN_REGEN_AI_Q?.(n);

    group.appendChild(btn);
    top.appendChild(group);
  }
}

export function initInExamRegenerate(ctx){
  if (typeof window === "undefined") return;

  window.__ACUMEN_REGEN_AI_Q = async (n) => {
    try{
      const { state, setLoading, showToast, paintAll, persist } = ctx;
      if (!state?.parsed) return;

      const meta = getPracticeMeta(state.parsed);
      const target = extractQuestionPayload(state.parsed, n);
      if (!target) throw new Error("Soru bulunamadı.");

      setLoading?.(true, "Soru yeniden üretiliyor…");

      const sources = await buildSourcesPayloadFromIds(meta.sourceIds);
      if (!sources.length) throw new Error("Kaynak not bulunamadı (sourceIds boş).");

      const res = await regenerateOneQuestion({
        attemptNo: meta.attemptNo,
        distribution: meta.distribution,
        sources,
        target,
        previous: {
          stemsHash: state.parsed?.meta?.aiPractice?.stemsHash || [],
          weakTags: state.parsed?.meta?.aiPractice?.weakTags || [],
        }
      });

      const ok = applyRegeneratedQuestionToParsed(state.parsed, res);
      if (!ok) throw new Error("Soru güncellenemedi.");

      // Clear existing answer for that question
      try{
        if (state.answers instanceof Map){
          state.answers.delete(n);
          state.answers.delete(String(n));
        } else if (state.answers) {
          delete state.answers[n];
          delete state.answers[String(n)];
        }
      }catch{}

      paintAll?.();
      persist?.();
      showToast?.({ title: "Güncellendi", msg: `Soru ${n} yenilendi.`, kind: "ok" });
    }catch(e){
      console.error(e);
      ctx.showToast?.({ title: "Hata", msg: e?.message || "Soru yenilenemedi.", kind: "bad" });
    }finally{
      ctx.setLoading?.(false);
    }
  };

  // Observe DOM changes and inject button when exam renders.
  const obs = new MutationObserver(() => ensureButtons(ctx));
  obs.observe(document.body, { childList:true, subtree:true });
  setTimeout(() => ensureButtons(ctx), 0);
}
