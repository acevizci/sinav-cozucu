// js/performance/historyStore.js
// Exam History (LocalStorage) - v1
// Stores immutable exam snapshots for individual users.

const LS_KEY = "acumen_exam_history_v1";
const LS_MIGRATED_V19 = "acumen_exam_history_migrated_v19";
const MAX_ITEMS = 500; // safety

function safeParse(raw){
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function safeStringify(obj){
  try { return JSON.stringify(obj); } catch { return null; }
}

export function listExamHistory(){
  const raw = localStorage.getItem(LS_KEY);
  let arr = safeParse(raw);

  // v19 migration: remove invalid "start snapshots" accidentally stored before exam finished.
  // Heuristic: duration is 0 AND no scorable outcome (no keyed MCQ and no graded OE).
  try {
    if (!localStorage.getItem(LS_MIGRATED_V19) && Array.isArray(arr) && arr.length) {
      const before = arr.length;
      arr = arr.filter(it => {
        const dur0 = Number(it?.durationSec || 0) <= 0;
        const mcq = it?.mcq;
        const oe = it?.openEnded;
        const mcqKeyed = Number(mcq?.keyedTotal || 0) > 0;
        const oeGraded = Number(oe?.graded || 0) > 0;
        const hasScore = mcqKeyed || oeGraded;
        return !(dur0 && !hasScore);
      });
      if (arr.length !== before) {
        const json = safeStringify(arr);
        if (json) localStorage.setItem(LS_KEY, json);
      }
      localStorage.setItem(LS_MIGRATED_V19, "1");
    }
  } catch { /* no-op */ }
  // newest first
  arr.sort((a,b)=> (b?.finishedAt||0).localeCompare?.(a?.finishedAt||0) || 0);
  return arr;
}

export function saveExamSnapshot(snapshot){
  try {
    if (!snapshot || typeof snapshot !== "object") return false;
    const arr = listExamHistory();
    arr.unshift(snapshot);
    if (arr.length > MAX_ITEMS) arr.length = MAX_ITEMS;
    const json = safeStringify(arr);
    if (!json) return false;
    localStorage.setItem(LS_KEY, json);
    return true;
  } catch (e) {
    console.warn("Exam history save failed:", e);
    return false;
  }
}

export function clearExamHistory(){
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export function computeHistorySummary(items){
  const list = Array.isArray(items) ? items : [];
  const totalExams = list.length;

  let totalDuration = 0;
  let durationCount = 0;
  let mcqCount = 0;
  let mcqCorrect = 0, mcqWrong = 0, mcqBlank = 0, mcqKeyed = 0;

  let oeCount = 0;
  let oeSumPct = 0;
  let oeGraded = 0;

  for (const it of list) {
    const d = Number(it?.durationSec || 0);
    if (d > 0) { totalDuration += d; durationCount += 1; }

    const mcq = it?.mcq || null;
    if (mcq && (Number.isFinite(mcq.correct) || Number.isFinite(mcq.keyedTotal))) {
      mcqCount += 1;
      mcqCorrect += Number(mcq.correct || 0);
      mcqWrong   += Number(mcq.wrong || 0);
      mcqBlank   += Number(mcq.blank || 0);
      mcqKeyed   += Number(mcq.keyedTotal || 0);
    }

    const oe = it?.openEnded || null;
    if (oe && oe.pct != null) {
      oeCount += 1;
      oeSumPct += Number(oe.pct || 0);
      oeGraded += Number(oe.graded || 0);
    }
  }

  const avgDuration = durationCount ? Math.round(totalDuration / durationCount) : 0;
  const mcqAccuracy = mcqKeyed ? Math.round((mcqCorrect / mcqKeyed) * 100) : null;
  const oeAvgPct = oeCount ? Math.round(oeSumPct / oeCount) : null;

  return {
    totalExams,
    avgDurationSec: avgDuration,
    mcq: {
      exams: mcqCount,
      correct: mcqCorrect,
      wrong: mcqWrong,
      blank: mcqBlank,
      keyedTotal: mcqKeyed,
      accuracyPct: mcqAccuracy
    },
    openEnded: {
      exams: oeCount,
      avgPct: oeAvgPct,
      graded: oeGraded
    }
  };
}
