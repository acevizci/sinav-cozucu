// js/aiPractice/multiSourceMerge.js
// Build source payload for AI generation from selected notes.

import { normalizeText } from "../utils.js";

export function buildSourcesFromNotes(notes){
  const sources = (notes || [])
    .filter(Boolean)
    .map(n => ({
      id: n.id,
      title: String(n.title || "Ders Notu").trim() || "Ders Notu",
      text: normalizeText(n.text || ""),
    }))
    .filter(s => s.text && s.text.length >= 50);

  return sources;
}

export function computeBalancedAllocation(total, n){
  const count = Math.max(0, total|0);
  const k = Math.max(1, n|0);
  const base = Math.floor(count / k);
  const rem = count - base * k;

  const alloc = new Array(k).fill(base);
  for (let i = 0; i < rem; i++) alloc[i] += 1;
  return alloc;
}

// Priority allocation: earlier sources get more questions.
// n sources -> weights: n, n-1, ..., 1
// Then distribute `total` proportionally and fix rounding.
export function computePriorityAllocation(total, n){
  const count = Math.max(0, total|0);
  const k = Math.max(1, n|0);
  if (k === 1) return [count];

  const weights = Array.from({ length: k }, (_, i) => (k - i));
  const sumW = weights.reduce((a,b)=>a+b,0) || 1;

  // Initial allocation by floor
  const alloc = weights.map(w => Math.floor(count * (w / sumW)));
  let used = alloc.reduce((a,b)=>a+b,0);

  // Distribute remaining questions from first to last
  let i = 0;
  while (used < count){
    alloc[i % k] += 1;
    used += 1;
    i += 1;
  }

  // Guard: if somehow exceeded (shouldn't), remove from last
  while (used > count){
    for (let j = k - 1; j >= 0 && used > count; j--){
      if (alloc[j] > 0){
        alloc[j] -= 1;
        used -= 1;
      }
    }
  }

  return alloc;
}
