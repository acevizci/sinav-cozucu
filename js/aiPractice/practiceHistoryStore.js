// js/aiPractice/practiceHistoryStore.js
// Stores practice attempt history per selected notes group (selectionHash)
// Used for Deneme 2/3/4 repeat-avoidance, weak-topic weighting AND restoring past exams.

import { hashStr, normalizeText } from "../utils.js";

const KEY = "acumen_practice_history_v1";

// --- HELPERS ---

function safeParse(raw){
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeStringify(obj){
  try { return JSON.stringify(obj); } catch { return null; }
}

function load(){
  const raw = localStorage.getItem(KEY);
  const data = safeParse(raw);
  if (!data || typeof data !== "object") return { v: 1, bySel: {} };
  if (!data.bySel || typeof data.bySel !== "object") data.bySel = {};
  if (!data.v) data.v = 1;
  return data;
}

function save(data){
  const raw = safeStringify(data);
  if (raw) localStorage.setItem(KEY, raw);
}

function nowIso(){ return new Date().toISOString(); }

function stemHashFromQuestion(q){
  const t = normalizeText(String(q?.text ?? q?.stem ?? "")).slice(0, 600);
  if (!t) return null;
  return hashStr(t.toLowerCase());
}

// --- EXPORTED FUNCTIONS ---

export function getNextAttempt(selHash){
  const db = load();
  const row = db.bySel[selHash] || {};
  const next = Number(row.nextAttempt || 1) || 1;
  return Math.max(1, next);
}

export function setNextAttempt(selHash, nextAttempt){
  const db = load();
  const row = db.bySel[selHash] || {};
  row.nextAttempt = Math.max(1, Number(nextAttempt) || 1);
  row.updatedAt = nowIso();
  db.bySel[selHash] = row;
  save(db);
}

export function recordAttempt(selHash, attemptNo, parsed){
  const db = load();
  const row = db.bySel[selHash] || { attempts: {}, weakTags: [] };

  const stems = [];
  for (const q of (parsed?.questions || [])){
    const h = stemHashFromQuestion(q);
    if (h) stems.push(h);
  }

  row.attempts = row.attempts || {};
  
  // 🌟 KRİTİK: Hem hash'leri hem de TÜM SINAV VERİSİNİ kaydediyoruz.
  // Bu sayede geçmiş denemeye tıklandığında soru verileri buradan okunur.
  row.attempts[String(attemptNo)] = {
    attemptNo: Number(attemptNo) || 1,
    createdAt: nowIso(),
    stemsHash: Array.from(new Set(stems)),
    parsedData: parsed 
  };

  // Bir sonraki deneme numarasını güncelle
  const next = Math.max(getNextAttempt(selHash), (Number(attemptNo)||1) + 1);
  row.nextAttempt = next;
  row.updatedAt = nowIso();

  db.bySel[selHash] = row;
  save(db);
  return row;
}

export function getPreviousHints(selHash, { maxStem = 120, maxWeak = 20 } = {}){
  const db = load();
  const row = db.bySel[selHash];
  if (!row) return { stemsHash: [], weakTags: [] };

  const allStems = [];
  const attempts = row.attempts || {};
  
  // En son denemelerden başlayarak soru hashlerini topla
  const keys = Object.keys(attempts).sort((a,b)=>Number(b)-Number(a));
  for (const k of keys){
    const arr = attempts[k]?.stemsHash || [];
    for (const h of arr) allStems.push(h);
    if (allStems.length >= maxStem) break;
  }

  const stemsUniq = Array.from(new Set(allStems)).slice(0, maxStem);
  const weak = Array.isArray(row.weakTags) ? row.weakTags.slice(0, maxWeak) : [];
  return { stemsHash: stemsUniq, weakTags: weak };
}

export function recordOutcome(selHash, attemptNo, { wrongBySubject = {} } = {}){
  const db = load();
  const row = db.bySel[selHash] || { attempts: {}, weakTags: [] };

  // Zayıf konuları hesapla
  const entries = Object.entries(wrongBySubject || {}).filter(([k,v])=>k && (Number(v)||0) > 0);
  entries.sort((a,b)=>(Number(b[1])||0)-(Number(a[1])||0));
  row.weakTags = entries.slice(0, 10).map(([k])=>String(k).trim()).filter(Boolean);

  row.attempts = row.attempts || {};
  const akey = String(attemptNo);
  
  // Mevcut deneme verisini koruyarak outcome ekle
  const existing = row.attempts[akey] || {};
  row.attempts[akey] = { ...existing, outcome: { wrongBySubject }, updatedAt: nowIso() };
  
  row.updatedAt = nowIso();

  db.bySel[selHash] = row;
  save(db);
  return row;
}

// ✅ SİLME FONKSİYONU
export function deleteAttempt(selHash, attemptNo){
  const db = load();
  const row = db.bySel[selHash];
  
  if (row && row.attempts && row.attempts[String(attemptNo)]){
    delete row.attempts[String(attemptNo)]; // Kaydı sil
    row.updatedAt = nowIso();
    
    // Eğer hiç deneme kalmadıysa row'u temizleyebiliriz ama
    // şimdilik sadece attempt'i siliyoruz.
    db.bySel[selHash] = row;
    save(db);
    return true;
  }
  return false;
}

// Global hook for debug (optional)
try {
  if (typeof window !== "undefined"){
    window.__ACUMEN_PRACTICE_HISTORY__ = {
      recordOutcome,
      recordAttempt,
      deleteAttempt
    };
  }
} catch {}