// js/wrongBook.js - Wrong Book Manager (Shuffle-Proof Fix Full)

import { hashStr } from "./utils.js";
import { getChosenOptionId } from "./shuffle.js";

const WRONG_BOOK_KEY = "sinav_v2_wrong_book_modular";
const MAX_ITEMS = 1200;

// ---------- Subject helpers (UI/analytics) ----------
function normSubject(s){
  const t = String(s || "Genel").trim();
  return t || "Genel";
}

// ---------- Helpers ----------
function nowMs(){ return Date.now(); }
function nowIso(){ return new Date().toISOString(); }
const DAY = 24 * 3600 * 1000;

/* ===== MULTI-ANSWER HELPERS ===== */
function toLetterSet(v){
  if (!v) return new Set();
  if (v instanceof Set) return new Set(Array.from(v).map(x=>String(x).toUpperCase()));
  if (Array.isArray(v)) return new Set(v.map(x=>String(x).toUpperCase()));
  const s = String(v).toUpperCase();
  const letters = s.match(/[A-F]/g) || [];
  return new Set(letters);
}
function setsEqual(a,b){
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function _multiScoreNoPenalty(chosenSet, correctSet){
  const K = correctSet.size || 0;
  if (!K) return 0;
  let C = 0;
  for (const x of chosenSet) if (correctSet.has(x)) C++;
  return C / K;
}

// 🔥🔥 KRİTİK DÜZELTME: SHUFFLE-PROOF KEY GENERATOR 🔥🔥
// İki farklı anahtar üretme yöntemi kullanıyoruz.

// YÖNTEM 1: SMART (Yeni) - Şıkların içeriğini alfabetik sıralar.
// A şıkkı C olsa bile, metin aynı olduğu için anahtar değişmez.
function normalizeBlobSmart(q){
  const parts = [
    normSubject(q.subject),
    (q.text || "").trim()
  ];

  // Şık metinlerini topla
  let opts = [];
  if (q.optionsByLetter) {
      opts = Object.values(q.optionsByLetter).map(o => (o.text || "").trim());
  } else if (Array.isArray(q.options)) {
      opts = q.options.map(o => (typeof o === 'string' ? o : o.text || "").trim());
  }

  // 🚨 SIRALA: İşte sihir burada. Karışıklığı yok eder.
  opts = opts.filter(x => x).sort();

  return parts.concat(opts).join("||");
}

// YÖNTEM 2: LEGACY (Eski) - Şıkların pozisyonuna bakar.
// Eski kayıtlarını bulmak için bunu kullanacağız.
function normalizeBlobLegacy(q){
  const parts = [
    normSubject(q.subject),
    (q.text || "").trim(),
    "A:" + (q.optionsByLetter?.A?.text || ""),
    "B:" + (q.optionsByLetter?.B?.text || ""),
    "C:" + (q.optionsByLetter?.C?.text || ""),
    "D:" + (q.optionsByLetter?.D?.text || ""),
    "E:" + (q.optionsByLetter?.E?.text || ""),
    "F:" + (q.optionsByLetter?.F?.text || ""),
  ];
  return parts.join("||").replace(/\s+/g," ").trim();
}

export function makeKeyFromQuestion(q, useLegacy = false){
  const blob = useLegacy ? normalizeBlobLegacy(q) : normalizeBlobSmart(q);
  return `${blob.length}:${hashStr(blob)}:${hashStr(blob.split("").reverse().join(""))}`;
}

export function getWrongBookKeyFromQuestion(q){
  return makeKeyFromQuestion(q);
}

// ---------- SRS Logic ----------
function ensureSrs(rec){
  if (!rec.srs) rec.srs = {};
  
  if (rec.srs && rec.srs.level != null && rec.srs.sm2 == null){
    const level = Number(rec.srs.level)||0;
    const legacyDays = [1,3,7,14,30][Math.max(0, Math.min(4, level))];
    rec.srs.sm2 = {
      ef: 2.5,
      interval: legacyDays,
      reps: level,
      due: typeof rec.srs.nextReview==="number" ? rec.srs.nextReview : Date.parse(rec.srs.nextReview || "") || (nowMs()+legacyDays*DAY),
      lastQuality: 4
    };
    delete rec.srs.level;
    delete rec.srs.nextReview;
  }

  if (!rec.srs.sm2){
    rec.srs.sm2 = {
      ef: 2.5,
      interval: 0,
      reps: 0,
      due: nowMs() + DAY,
      lastQuality: 0
    };
  } else {
    const s = rec.srs.sm2;
    if (!Number.isFinite(s.ef)) s.ef = 2.5;
    if (!Number.isFinite(s.interval)) s.interval = 0;
    if (!Number.isFinite(s.reps)) s.reps = 0;
    if (!Number.isFinite(s.due)) s.due = nowMs() + DAY;
    if (!Number.isFinite(s.lastQuality)) s.lastQuality = 0;
  }
  return rec;
}

function isDue(rec){
  ensureSrs(rec);
  return rec.srs.sm2.due <= nowMs();
}

function snapshotSm2(rec){
  ensureSrs(rec);
  const s = rec.srs.sm2;
  return { ef: s.ef, interval: s.interval, reps: s.reps, due: s.due, lastQuality: s.lastQuality };
}

function restoreSm2(rec, snap){
  ensureSrs(rec);
  rec.srs.sm2.ef = snap.ef;
  rec.srs.sm2.interval = snap.interval;
  rec.srs.sm2.reps = snap.reps;
  rec.srs.sm2.due = snap.due;
  rec.srs.sm2.lastQuality = snap.lastQuality;
}

function sm2Apply(rec, quality){
  ensureSrs(rec);
  const s = rec.srs.sm2;
  const q = Math.max(0, Math.min(5, Number(quality)||0));

  const diff = 5 - q;
  s.ef = s.ef + (0.1 - diff*(0.08 + diff*0.02));
  if (s.ef < 1.3) s.ef = 1.3;

  if (q < 3){
    s.reps = 0;
    s.interval = 1;
  } else {
    if (s.reps === 0) s.interval = 1;
    else if (s.reps === 1) s.interval = 6;
    else s.interval = Math.round(s.interval * s.ef);
    s.reps += 1;
  }

  s.lastQuality = q;
  s.due = nowMs() + s.interval * DAY;
}

// ---------- Storage Operations ----------
export function loadWrongBook(){
  const LETTERS = ["A","B","C","D","E","F"];
  let book = {};
  try { book = JSON.parse(localStorage.getItem(WRONG_BOOK_KEY) || "{}") || {}; }
  catch { book = {}; }

  // Migration logic
  let changed = false;
  for (const [k, it] of Object.entries(book)){
    if (!it) continue;
    if (!it.q) { it.q = { text: it.text || "" }; changed = true; }

    if (!it.q.subject && it.subject){ it.q.subject = it.subject; delete it.subject; changed = true; }
    if (!it.q.subject){ it.q.subject = "Genel"; changed = true; }
    
    if (!it.q.optionsByLetter) {
        it.q.optionsByLetter = {};
        changed = true;
    }
  }

  if (changed){
    try { localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(book)); } catch {}
  }

  return book;
}

export function saveWrongBook(book){
  localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(book));
}

export function clearWrongBook(){
  localStorage.removeItem(WRONG_BOOK_KEY);
}

// 🔥 SİLME (MEZUN ETME) FONKSİYONU
export function removeQuestionFromBook(key){
  const book = loadWrongBook();
  if (book[key]) {
    delete book[key];
    saveWrongBook(book);
    return true; 
  }
  return false;
}

// 🔥 ROZET SORGULAMA (HİBRİT)
// Hem yeni (karışık) hem eski (sıralı) kayıtları kontrol eder.
export function lookupWrongRecord(q) {
  const data = loadWrongBook();
  
  // 1. Önce SMART Key (Yeni sistem, karışıma dayanıklı)
  let key = makeKeyFromQuestion(q, false); 
  let rec = data[key];

  // 2. Bulamazsa LEGACY Key (Eski kayıtlar için)
  if (!rec) {
     key = makeKeyFromQuestion(q, true);
     rec = data[key];
  }
  
  if (rec && (rec.wrongCount > 0 || rec.blankCount > 0)) {
    return {
      wrongCount: rec.wrongCount || 0,
      blankCount: rec.blankCount || 0,
      isDue: (rec.srs?.sm2?.due || 0) < Date.now(),
      realKey: key // Bulunan doğru anahtarı döndür
    };
  }
  return null;
}

export function wrongBookCount(){
  return Object.keys(loadWrongBook()).length;
}

export function wrongBookStats(){
  const d = wrongBookDashboard();
  return { total: d.total, due: d.due, intervals: [1,3,7,14,30] };
}

export function wrongBookDashboard(){
  const book = loadWrongBook();
  const items = Object.values(book);
  const now = nowMs();
  const tomorrow = now + DAY;
  const next7 = now + 7*DAY;

  let due=0, dueToday=0, dueTomorrow=0, dueNext7=0, later=0;
  let learning=0, mature=0;
  let efSum=0, efCount=0;

  const levelBuckets = { "0":0, "1":0, "2":0, "3":0, "4+":0 };
  const bySubject = {};

  for (const it of items){
    ensureSrs(it);
    const s = it.srs.sm2;
    const t = s.due;

    if (t <= now) { due++; dueToday++; }
    else if (t <= tomorrow) { dueTomorrow++; }
    else if (t <= next7) { dueNext7++; }
    else { later++; }

    if (s.reps < 2) learning++; else mature++;

    efSum += s.ef; efCount++;
    const r = s.reps;
    if (r <= 0) levelBuckets["0"]++;
    else if (r === 1) levelBuckets["1"]++;
    else if (r === 2) levelBuckets["2"]++;
    else if (r === 3) levelBuckets["3"]++;
    else levelBuckets["4+"]++;

    const subj = normSubject(it?.q?.subject);
    if (!bySubject[subj]){
      bySubject[subj] = { total: 0, dueToday: 0, dueTomorrow: 0, dueNext7: 0, later: 0, learning: 0, mature: 0, efSum: 0, efCount: 0 };
    }
    const b = bySubject[subj];
    b.total++;

    if (t <= now) b.dueToday++;
    else if (t <= tomorrow) b.dueTomorrow++;
    else if (t <= next7) b.dueNext7++;
    else b.later++;

    if (s.reps < 2) b.learning++; else b.mature++;
    b.efSum += s.ef; b.efCount++;
  }

  for (const k in bySubject){
    const b = bySubject[k];
    b.avgEf = b.efCount ? (b.efSum / b.efCount) : 0;
    delete b.efSum; delete b.efCount;
  }

  return { total: items.length, due, dueToday, dueTomorrow, dueNext7, later, learning, mature, avgEf: efCount ? (efSum/efCount) : 0, buckets: levelBuckets, bySubject };
}

// ---------- Build Retry Exam ----------
export function buildWrongOnlyParsed({ limit=60, onlyDue=false, fallbackAll=true, subject=null, keys=null } = {}){
  const book = loadWrongBook();
  // Hash (_realKey) bilgisi ile listele
  let items = Object.entries(book).map(([k, v]) => ({ ...v, _realKey: k }));
  if (!items.length) return null;

  if (Array.isArray(keys) && keys.length){
    items = items.filter(it => keys.includes(it._realKey));
    if (!items.length) return null;
  }

  if (subject){
    const target = normSubject(subject).toLowerCase();
    items = items.filter(it => normSubject(it?.q?.subject).toLowerCase() === target);
    if (!items.length) return null;
  }

  if (onlyDue){
    const dueItems = items.filter(isDue);
    if (dueItems.length) items = dueItems;
    else if (!fallbackAll) return null;
  }

  items.sort((a,b)=>{
    const da = isDue(a) ? 1 : 0;
    const db = isDue(b) ? 1 : 0;
    if (db !== da) return db - da;

    const wa = (a.wrongCount||0) * 3 + (a.blankCount||0);
    const wb = (b.wrongCount||0) * 3 + (b.blankCount||0);
    if (wb !== wa) return wb - wa;

    ensureSrs(a); ensureSrs(b);
    return a.srs.sm2.due - b.srs.sm2.due;
  });

  items = items.slice(0, limit);

  const questions = items.map((it, idx) => ({
    n: idx + 1,
    origN: (it.q?.origN ?? it.q?.n ?? idx + 1),
    text: it.q?.text || "",
    subject: normSubject(it.q?.subject),
    optionsByLetter: it.q?.optionsByLetter || {},
    _wrongCount: it.wrongCount || 0,
    _hash: it._realKey,
    _isRetryItem: true
  }));

  const answerKey = {};
  for (let i=0;i<items.length;i++){
    const cid = items[i].correctId;
    if (cid) answerKey[i+1] = cid;
  }

  const keyCount = Object.keys(answerKey).length;

  return {
    title: subject ? `Tekrar • ${normSubject(subject)}` : (onlyDue ? "Tekrar (SRS)" : "Yanlış Defteri"),
    questions,
    answerKey,
    keyCount,
    mapOriginalToDisplay: {},
    meta: { 
        isSmartRetry: true,
        source: "wrong_book" 
    }
  };
}

export function exportWrongBook(){
  const book = loadWrongBook();
  const items = Object.entries(book).map(([key, it]) => ({ ...it, _key: key }));
  return { exportedAt: nowIso(), count: Object.keys(book).length, items };
}

// ---------- Core Add Logic ----------
export function addToWrongBookFromExam({ parsed, answersMap, questionTimes = new Map(), reviewId=null }){
  if (!parsed) return;

  const book = loadWrongBook();
  const now = nowIso();
  const isReview = /tekrar/i.test(parsed.title || "");
  const rid = reviewId || (parsed.title + "|" + now);
  const allowBlank = isReview || ((answersMap?.size || 0) > 0);

  for (const q of parsed.questions){
    const chosenRaw = answersMap.get(q.n) ?? null;
    const correctId = parsed.answerKey?.[q.n] || null;

    const correctSet = toLetterSet(correctId);
    const keyLettersLen = correctSet.size || 0;
    const selectCount = Math.max((q.selectCount || 1), (keyLettersLen || 1));
    const isMulti = selectCount > 1;

    const chosenSet = toLetterSet(chosenRaw);
    const chosenLetter = isMulti
      ? (chosenSet.size ? Array.from(chosenSet).sort().join("") : null)
      : (typeof chosenRaw === "string" ? chosenRaw : (chosenSet.size ? Array.from(chosenSet)[0] : null));

    const chosenId = isMulti ? (chosenLetter || null) : getChosenOptionId(q, chosenLetter);
    const saniye = questionTimes instanceof Map ? (questionTimes.get(q.n) || 0) : (questionTimes?.[q.n] || 0);

    const isBlank = allowBlank && (!chosenLetter || !String(chosenLetter).trim());
    const hasKey = !!correctId;

    let score = null;
    if (hasKey && !isBlank){
      if (!isMulti){
        score = setsEqual(toLetterSet(chosenId), toLetterSet(correctId)) ? 1 : 0;
      } else {
        if (chosenSet.size !== selectCount) score = 0;
        else score = _multiScoreNoPenalty(chosenSet, correctSet);
      }
    }

    const isCorrect = (score === 1);
    const isWrong = (hasKey && !isBlank && score !== null && score < 1);
    const isPartial = (hasKey && !isBlank && score !== null && score > 0 && score < 1);

    // 🔥 HASH OLUŞTURMA: Önce var olanı bul, yoksa yenisini (Smart) oluştur
    // Bu mantık duplicate (çift kayıt) oluşmasını engeller.
    let key = makeKeyFromQuestion(q, false); // Smart Key
    let rec = book[key];

    // Eğer Smart Key ile bulamazsak, Legacy Key (Eski kayıt) var mı diye bak
    if (!rec) {
       const legacyKey = makeKeyFromQuestion(q, true);
       if (book[legacyKey]) {
           rec = book[legacyKey];
           key = legacyKey; // Eski anahtar üzerinden güncellemeye devam et
       }
    }

    if (!rec && !(isWrong || isBlank)) continue;

    if (!rec){
      // Yeni Kayıt -> Smart Key ile oluştur
      rec = {
        title: parsed.title,
        addedAt: now,
        firstSeenAt: now,
        lastSeenAt: now,
        lastTitle: parsed.title,
        totalCount: 0,
        wrongCount: 0,
        blankCount: 0,
        note: "",
        q: { text: q.text, subject: normSubject(q.subject), optionsByLetter: q.optionsByLetter },
        correctId: correctId || null,
        yourLetter: chosenLetter,
        yourId: chosenId || null,
        status: "YOK",
        lastTimeSpent: 0 
      };
      ensureSrs(rec);
    }

    rec.lastSeenAt = now;
    rec.lastTitle = parsed.title;
    rec.totalCount = (rec.totalCount || 0) + 1;
    rec.q = { text: q.text, subject: normSubject(q.subject || rec.q?.subject), optionsByLetter: q.optionsByLetter };
    rec.correctId = correctId || rec.correctId || null;
    rec.yourLetter = chosenLetter;
    rec.yourId = chosenId || null;
    rec.lastTimeSpent = saniye;
    rec.lastScore = (score === null ? null : Number(score));

    if (isReview){
      ensureSrs(rec);
      if (rec.srs.lastReviewId !== rid || !rec.srs._before){
        rec.srs._before = snapshotSm2(rec);
        rec.srs.lastReviewId = rid;
      }

      if (!hasKey){
        rec.status = "ANAHTAR_YOK";
      } else if (isCorrect){
        rec.status = "DOGRU";
        sm2Apply(rec, 4);
      } else {
        rec.status = isBlank ? "BOS" : (isPartial ? "KISMI" : "YANLIS");
        if (isBlank) rec.blankCount = (rec.blankCount||0) + 1;
        if (isWrong) rec.wrongCount = (rec.wrongCount||0) + 1;
        sm2Apply(rec, (isPartial ? 3 : 1));
      }
      book[key] = rec;
      continue;
    }

    if (!(isWrong || isBlank)) {
      book[key] = rec;
      continue;
    }

    rec.status = isBlank ? "BOS" : (isPartial ? "KISMI" : "YANLIS");
    if (isBlank) rec.blankCount = (rec.blankCount || 0) + 1;
    if (isWrong) rec.wrongCount = (rec.wrongCount || 0) + 1;

    sm2Apply(rec, (isPartial ? 3 : 1));
    book[key] = rec;
  }

  const keys = Object.keys(book);
  if (keys.length > 300){ 
    keys.sort((a,b) => Date.parse(book[a].lastSeenAt) - Date.parse(book[b].lastSeenAt));
    keys.slice(0, keys.length - 300).forEach(k => delete book[k]);
  }

  saveWrongBook(book);
}

export function setSrsQualityByQuestion(q, quality, reviewId){
  let key = makeKeyFromQuestion(q, false);
  const book = loadWrongBook();
  let rec = book[key];

  if (!rec) {
      key = makeKeyFromQuestion(q, true);
      rec = book[key];
  }

  if (!rec) return null;

  ensureSrs(rec);
  const rid = reviewId || rec.srs.lastReviewId || null;
  if (rid && rec.srs.lastReviewId === rid && rec.srs._before){
    restoreSm2(rec, rec.srs._before);
  }

  sm2Apply(rec, quality);
  if (rid) rec.srs.lastReviewId = rid;

  book[key] = rec;
  saveWrongBook(book);
  return {
    key,
    reps: rec.srs.sm2.reps,
    interval: rec.srs.sm2.interval,
    ef: rec.srs.sm2.ef,
    due: rec.srs.sm2.due,
    lastQuality: rec.srs.sm2.lastQuality
  };
}

export function getSrsInfoForParsed(parsed){
  const book = loadWrongBook();
  const map = {};
  if (!parsed) return map;

  for (const q of parsed.questions){
    let key = makeKeyFromQuestion(q, false);
    let rec = book[key];
    
    if (!rec) {
        key = makeKeyFromQuestion(q, true);
        rec = book[key];
    }

    if (!rec) continue;
    ensureSrs(rec);
    map[q.n] = {
      key,
      reps: rec.srs.sm2.reps,
      interval: rec.srs.sm2.interval,
      ef: rec.srs.sm2.ef,
      due: rec.srs.sm2.due,
      lastQuality: rec.srs.sm2.lastQuality
    };
  }
  return map;
}