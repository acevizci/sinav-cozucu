// js/performance/snapshot.js
// Build exam snapshot from current state at finish time.

function hasTextAnswer(v){
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Set) return v.size > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return !!v;
}

function getAns(state, n){
  if (!state) return null;
  if (state.answers instanceof Map) {
    return state.answers.get(n) ?? state.answers.get(String(n)) ?? state.answers.get(Number(n));
  }
  return state.answers?.[n] ?? state.answers?.[String(n)];
}

export function buildExamSnapshot(state){
  if (!state || !state.parsed) return null;

  const parsed = state.parsed;
  const qs = Array.isArray(parsed.questions) ? parsed.questions : [];

  const finishedAt = new Date().toISOString();

  // Duration: prefer timestamp diff (most reliable), then timer diff.
  const startedAtIso = state.startedAt || null;
  const startedMs = startedAtIso ? Date.parse(startedAtIso) : NaN;
  const finishedMs = Date.parse(finishedAt);

  let spent = 0;
  if (Number.isFinite(startedMs) && Number.isFinite(finishedMs) && finishedMs > startedMs) {
    spent = Math.floor((finishedMs - startedMs) / 1000);
  } else {
    spent = Math.max(0, Number(state.durationSec || 0) - Number(state.timeLeftSec ?? state.durationSec ?? 0));
  }

  // Never store 0 duration if the user interacted; keeps analytics stable.
  const hasAnyAnswer = (() => {
    try {
      if (state.answers instanceof Map) {
        for (const v of state.answers.values()) if (hasTextAnswer(v)) return true;
      } else if (state.answers && typeof state.answers === "object") {
        for (const k of Object.keys(state.answers)) if (hasTextAnswer(state.answers[k])) return true;
      }
    } catch {}
    return false;
  })();
  if (spent <= 0 && hasAnyAnswer) spent = 1;

  // detect kinds
  const hasOpenEndedPro = qs.some(q => q?.kind === "openEndedPro");
  const hasMcqKey = parsed?.answerKey && Object.keys(parsed.answerKey || {}).length > 0;

  const type = hasOpenEndedPro && hasMcqKey ? "mixed"
             : hasOpenEndedPro ? "openEndedPro"
             : "mcq";

  // MCQ metrics (only keyed questions evaluated)
  let mcqCorrect=0, mcqWrong=0, mcqBlank=0, mcqKeyedTotal=0;
  try{
    const answerKey = parsed.answerKey || {};
    for (const q of qs) {
      const n = q?.n;
      if (!n) continue;
      const key = answerKey[n] ?? answerKey[String(n)];
      if (!key) continue; // not keyed
      mcqKeyedTotal += 1;

      const a = getAns(state, n);
      if (!hasTextAnswer(a)) { mcqBlank += 1; continue; }

      // normalize answer letters (support "A" / "A)" / "a" etc.)
      const norm = (x) => String(x).trim().toUpperCase().replace(/[^A-E]/g, "").slice(0,1);
      const ua = norm(a);
      const uk = norm(key);
      if (ua && uk && ua === uk) mcqCorrect += 1;
      else mcqWrong += 1;
    }
  } catch {}

  // Open-ended PRO aggregate
  let openEnded = null;
  try{
    const oe = state.openEndedScore || null;
    if (oe && typeof oe === "object") {
      openEnded = {
        pct: (typeof oe.pct === "number") ? Math.round(oe.pct) : null,
        total: Number(oe.total || 0),
        graded: Number(oe.graded || 0),
        pending: Number(oe.pending || 0),
        blank: Number(oe.blank || 0),
        error: Number(oe.error || 0),
        rubricAvg: oe.rubricAvg || null,
      };
    }
  } catch {}

  const id = `ex_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  return {
    id,
    title: parsed.title || "Sınav",
    examType: type,
    totalQuestions: qs.length,
    durationSec: spent,
    startedAt: startedAtIso,
    finishedAt,
    mcq: hasMcqKey ? {
      correct: mcqCorrect,
      wrong: mcqWrong,
      blank: mcqBlank,
      keyedTotal: mcqKeyedTotal,
      accuracyPct: mcqKeyedTotal ? Math.round((mcqCorrect/mcqKeyedTotal)*100) : null,
    } : null,
    openEnded,
  };
}
