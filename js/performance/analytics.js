// js/performance/analytics.js
// Deterministic analytics for Performance Center (v17)

function toDateMs(iso){
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

export function filterHistoryByRange(items, rangeKey){
  const list = Array.isArray(items) ? items.slice() : [];
  if (!rangeKey || rangeKey === "all") return list;
  const days = rangeKey === "7" ? 7 : rangeKey === "30" ? 30 : null;
  if (!days) return list;

  const now = Date.now();
  const min = now - days*24*60*60*1000;
  return list.filter(it => toDateMs(it?.finishedAt) >= min);
}

// Return a 0-100 "score" used for trends / growth.
// Prefer MCQ accuracy, else open-ended pct, else null.
export function getExamScore(it){
  const mcq = it?.mcq;
  const oe = it?.openEnded;
  if (mcq && typeof mcq.accuracyPct === "number") return clamp100(mcq.accuracyPct);
  if (oe && typeof oe.pct === "number") return clamp100(oe.pct);
  return null;
}

export function getDurationMin(it){
  const s = Number(it?.durationSec || 0);
  // Unknown / not measured durations should not skew averages
  return s > 0 ? (s/60) : NaN;
}

export function computeSeriesChronological(items){
  // items may be newest first; return oldest->newest
  const list = Array.isArray(items) ? items.slice() : [];
  list.sort((a,b)=> (toDateMs(a?.finishedAt) - toDateMs(b?.finishedAt)));
  const scoreSeries = [];
  const durationSeries = [];
  const labels = [];
  for (const it of list){
    const sc = getExamScore(it);
    if (sc == null) continue; // ignore unscorable
    scoreSeries.push(sc);
    durationSeries.push(getDurationMin(it));
    labels.push((it?.finishedAt||"").slice(0,10));
  }
  return { scoreSeries, durationSeries, labels, chronological: list };
}

export function computeTrend(last5Avg, prev5Avg){
  const delta = last5Avg - prev5Avg;
  const dir = delta > 3 ? "up" : delta < -3 ? "down" : "stable";
  return { dir, delta: Math.round(delta) };
}

export function mean(arr){
  const a = (arr||[]).filter(n=> Number.isFinite(n));
  if (!a.length) return 0;
  return a.reduce((x,y)=>x+y,0)/a.length;
}

export function stddev(arr){
  const a = (arr||[]).filter(n=> Number.isFinite(n));
  if (a.length < 2) return 0;
  const m = mean(a);
  const v = mean(a.map(x => (x-m)*(x-m)));
  return Math.sqrt(v);
}

export function clamp100(n){
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, x));
}

export function calculatePerformance(items){
  const { scoreSeries, durationSeries } = computeSeriesChronological(items);
  const n = scoreSeries.length;
  if (!n){
    return { hasData:false, count:0 };
  }

  const overallAccuracy = Math.round(mean(scoreSeries));

  const last5 = scoreSeries.slice(-5);
  const prev5 = scoreSeries.slice(-10, -5);
  const last5Avg = mean(last5);
  const prev5Avg = prev5.length ? mean(prev5) : last5Avg;
  const trend = (n >= 5) ? computeTrend(last5Avg, prev5Avg) : null;

  const avgDurationMin = Math.round(mean(durationSeries));
  const last5Dur = durationSeries.slice(-5);
  const prev5Dur = durationSeries.slice(-10, -5);
  const last5DurAvg = mean(last5Dur);
  const prev5DurAvg = prev5Dur.length ? mean(prev5Dur) : last5DurAvg;

  // speed trend in minutes (negative means faster)
  const durDelta = last5DurAvg - prev5DurAvg;
  const speedTrend = (n >= 5) ? (durDelta < -2 ? "faster" : durDelta > 2 ? "slower" : "stable") : null;

  // consistency: lower stddev -> higher score
  const sd = stddev(scoreSeries);
  const consistencyScore = (n >= 3) ? Math.max(0, Math.min(100, Math.round(100 - sd))) : null;

  const growthScore = (n >= 5 && trend && typeof consistencyScore === 'number')
    ? computeGrowthScore({
        overallAccuracy,
        trendDelta: trend.delta,
        consistencyScore
      })
    : null;

  return {
    hasData:true,
    count:n,
    overallAccuracy,
    last5Accuracy: Math.round(last5Avg),
    avgDurationMin,
    trend,
    speedTrend,
    consistencyScore,
    growthScore
  };
}

function computeGrowthScore({ overallAccuracy, trendDelta, consistencyScore }){
  // 60% accuracy, 20% trend, 20% consistency
  const score = overallAccuracy * 0.6 + (trendDelta * 2) + (consistencyScore * 0.2);
  return clamp100(Math.round(score));
}
