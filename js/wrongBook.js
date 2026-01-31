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

/* ===== MULTI-ANSWER HELPERS ===== */
function toLetterSet(v){
  if (!v) return new Set();
  if (Array.isArray(v)) return new Set(v.map(x=>String(x).toUpperCase()));
  return new Set([String(v).toUpperCase()]);
}
function setsEqual(a,b){
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function nowIso(){ return new Date().toISOString(); }
const DAY = 86400000;

function normalizeBlob(q){
  const parts = [
    q.text || "",
    "A:" + (q.optionsByLetter?.A?.text || ""),
    "B:" + (q.optionsByLetter?.B?.text || ""),
    "C:" + (q.optionsByLetter?.C?.text || ""),
    "D:" + (q.optionsByLetter?.D?.text || ""),
    "E:" + (q.optionsByLetter?.E?.text || ""),
  ];
  return parts.join("||").replace(/\s+/g," ").trim();
}

function makeKeyFromQuestion(q){
  const blob = normalizeBlob(q);
  // fingerprint: length + double hash (reverse)
  return `${blob.length}:${hashStr(blob)}:${hashStr(blob.split("").reverse().join(""))}`;
}

export function getWrongBookKeyFromQuestion(q){
  return makeKeyFromQuestion(q);
}

function ensureSrs(rec){
  if (!rec.srs) rec.srs = {};
  // migrate legacy fields if present
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

/**
 * SM-2 scheduling.
 * quality: 0..5
 * - <3 => reset (reps=0, interval=1)
 * - >=3 => update ef, interval, reps
 */
function sm2Apply(rec, quality){
  ensureSrs(rec);
  const s = rec.srs.sm2;
  const q = Math.max(0, Math.min(5, Number(quality)||0));

  // EF update (standard SM-2)
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

// ---------- Storage ----------
export function loadWrongBook(){
  const LETTERS = ["A","B","C","D","E"];
  let book = {};
  try { book = JSON.parse(localStorage.getItem(WRONG_BOOK_KEY) || "{}") || {}; }
  catch { book = {}; }

  // --- schema migration for older records (optionsByLetter missing) ---
  let changed = false;
  for (const [k, it] of Object.entries(book)){
    if (!it) continue;

    // normalize container
    if (!it.q) { it.q = { text: it.text || "" }; changed = true; }

    // subject migration/normalization (older records may store at root)
    if (!it.q.subject && it.subject){
      it.q.subject = it.subject;
      delete it.subject;
      changed = true;
    }
    if (!it.q.subject){
      it.q.subject = "Genel";
      changed = true;
    }
    const ns = normSubject(it.q.subject);
    if (it.q.subject !== ns){ it.q.subject = ns; changed = true; }

    // if optionsByLetter already good, skip
    const hasOBL = it.q.optionsByLetter && Object.values(it.q.optionsByLetter).some(o => (o?.text||"").trim());
    if (hasOBL) continue;

    // attempt to rebuild from alternative shapes
    const byLetter = {};

    // 1) legacy at root
    const rootOBL = it.optionsByLetter;
    if (rootOBL && Object.values(rootOBL).some(o => (o?.text||"").trim())){
      it.q.optionsByLetter = rootOBL;
      changed = true;
      continue;
    }

    // 2) legacy array: it.q.options or it.options
    const arr = it.q.options || it.options || it.q.opts || it.opts || null;
    if (Array.isArray(arr) && arr.length){
      // array of strings
      const isStr = typeof arr[0] === "string";
      if (isStr){
        for (let i=0;i<LETTERS.length;i++){
          const L = LETTERS[i];
          const t = (arr[i] || "").trim();
          byLetter[L] = { id: L, text: t };
        }
        it.q.optionsByLetter = byLetter;
        changed = true;
        continue;
      }

      // array of {id,text}
      for (const L of LETTERS){
        const found = arr.find(o => String(o.id||"").toUpperCase() === L);
        if (found && (found.text||"").trim()){
          byLetter[L] = { id: L, text: found.text };
        }
      }

      // if not keyed by id, fallback to index order
      if (!Object.keys(byLetter).length){
        for (let i=0;i<LETTERS.length;i++){
          const L = LETTERS[i];
          const o = arr[i] || {};
          byLetter[L] = { id: L, text: (o.text||"").trim() };
        }
      } else {
        // fill missing letters
        for (let i=0;i<LETTERS.length;i++){
          const L = LETTERS[i];
          if (!byLetter[L]) byLetter[L] = { id: L, text: "" };
        }
      }

      it.q.optionsByLetter = byLetter;
      changed = true;
      continue;
    }

    // 3) legacy raw option lines
    const lines = it.q.optionLines || it.optionLines || it.q.lines || it.lines || null;
    if (Array.isArray(lines) && lines.length){
      for (let i=0;i<LETTERS.length;i++){
        const L = LETTERS[i];
        byLetter[L] = { id: L, text: (lines[i] || "").trim() };
      }
      it.q.optionsByLetter = byLetter;
      changed = true;
      continue;
    }

    // Nothing to rebuild; keep empty object to avoid crashes
    if (!it.q.optionsByLetter){ it.q.optionsByLetter = {}; changed = true; }
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

export function wrongBookCount(){
  return Object.keys(loadWrongBook()).length;
}

export function wrongBookStats(){
  // kept for backward compatibility (older UI)
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

  // ✅ NEW: konu bazlı istatistik
  const bySubject = {};

  for (const it of items){
    ensureSrs(it);
    const s = it.srs.sm2;
    const t = s.due;

    // global buckets (eski davranış)
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

    // ✅ NEW: per-subject aggregation (UI/SRS ekranı için)
    const subj = normSubject(it?.q?.subject);
    if (!bySubject[subj]){
      bySubject[subj] = {
        total: 0,
        dueToday: 0,
        dueTomorrow: 0,
        dueNext7: 0,
        later: 0,
        learning: 0,
        mature: 0,
        efSum: 0,
        efCount: 0
      };
    }
    const b = bySubject[subj];
    b.total++;

    if (t <= now) b.dueToday++;
    else if (t <= tomorrow) b.dueTomorrow++;
    else if (t <= next7) b.dueNext7++;
    else b.later++;

    if (s.reps < 2) b.learning++;
    else b.mature++;

    b.efSum += s.ef;
    b.efCount++;
  }

  // ✅ NEW: finalize avgEf per subject (ek alanları temizle)
  for (const k in bySubject){
    const b = bySubject[k];
    b.avgEf = b.efCount ? (b.efSum / b.efCount) : 0;
    delete b.efSum;
    delete b.efCount;
  }

  return {
    total: items.length,
    due,
    dueToday,
    dueTomorrow,
    dueNext7,
    later,
    learning,
    mature,
    avgEf: efCount ? (efSum/efCount) : 0,
    buckets: levelBuckets,

    // ✅ NEW
    bySubject
  };
}

// ---------- Wrong Book Export ----------
export function exportWrongBook(){
  const book = loadWrongBook();
  // include stable key for each item (used by HTML report for deep-link replay)
  const items = Object.entries(book).map(([key, it]) => ({ ...it, _key: key }));
  return {
    exportedAt: nowIso(),
    count: Object.keys(book).length,
    items
  };
}

// ---------- Core integration ----------
/**
 * Update wrong book from an exam.
 * - wrong/blank => ensure exists, SM-2 quality=1 (reset + due tomorrow)
 * - review exam (Tekrar/SRS): correct answers progress via SM-2 quality default=4 (Good)
 *   and store snapshot for this reviewId so user can override rating later.
 */
export function addToWrongBookFromExam({ parsed, answersMap, reviewId=null }){
  if (!parsed) return;

  const book = loadWrongBook();
  const now = nowIso();
  const isReview = /tekrar/i.test(parsed.title || "");
  const rid = reviewId || (parsed.title + "|" + now);

  for (const q of parsed.questions){
    const chosenLetter = answersMap.get(q.n) || null;
    const correctId = parsed.answerKey?.[q.n] || null;
    const chosenId = getChosenOptionId(q, chosenLetter);

    const isBlank = !chosenLetter;
    const hasKey = !!correctId;
    const isWrong = !!(hasKey && chosenId && !setsEqual(toLetterSet(chosenId), toLetterSet(correctId)));
    const isCorrect = !!(hasKey && chosenId && chosenId === correctId);

    const key = makeKeyFromQuestion(q);
    let rec = book[key];

    // Create record if needed (only when wrong/blank or already exists)
    if (!rec && !(isWrong || isBlank)) continue;

    if (!rec){
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
        status: "YOK"
      };
      ensureSrs(rec);
    }

    // Update common fields
    rec.lastSeenAt = now;
    rec.lastTitle = parsed.title;
    rec.totalCount = (rec.totalCount || 0) + 1;
    rec.q = { text: q.text, subject: normSubject(q.subject || rec.q?.subject), optionsByLetter: q.optionsByLetter };
    rec.correctId = correctId || rec.correctId || null;
    rec.yourLetter = chosenLetter;
    rec.yourId = chosenId || null;

    // If review exam: we want to schedule both correct & wrong answers
    if (isReview){
      // snapshot once per reviewId so overrides can revert
      ensureSrs(rec);
      if (rec.srs.lastReviewId !== rid){
        rec.srs._before = snapshotSm2(rec);
        rec.srs.lastReviewId = rid;
      }

      if (!hasKey){
        // no key => don't schedule
        rec.status = "ANAHTAR_YOK";
      } else if (isCorrect){
        rec.status = "DOGRU";
        // default: Good (4)
        sm2Apply(rec, 4);
      } else {
        // wrong or blank => low quality
        rec.status = isBlank ? "BOS" : "YANLIS";
        if (isBlank) rec.blankCount = (rec.blankCount||0) + 1;
        if (isWrong) rec.wrongCount = (rec.wrongCount||0) + 1;
        sm2Apply(rec, 1);
      }

      book[key] = rec;
      continue;
    }

    // Normal exams: only track wrong/blank and reset schedule
    if (!(isWrong || isBlank)) {
      // correct in normal exam does not change schedule
      book[key] = rec;
      continue;
    }

    rec.status = isBlank ? "BOS" : "YANLIS";
    if (isBlank) rec.blankCount = (rec.blankCount || 0) + 1;
    if (isWrong) rec.wrongCount = (rec.wrongCount || 0) + 1;

    // reset-like behaviour: quality=1
    sm2Apply(rec, 1);

    book[key] = rec;
  }

  // prune if over limit: drop oldest lastSeen
  const keys = Object.keys(book);
  if (keys.length > MAX_ITEMS){
    keys.sort((a,b) => {
      const ta = Date.parse(book[a].lastSeenAt || book[a].addedAt || 0);
      const tb = Date.parse(book[b].lastSeenAt || book[b].addedAt || 0);
      return ta - tb;
    });
    const drop = keys.slice(0, keys.length - MAX_ITEMS);
    for (const k of drop) delete book[k];
  }

  saveWrongBook(book);
}

/**
 * Override SM-2 rating for a specific question during the same review session.
 * quality: 0..5
 */
export function setSrsQualityByQuestion(q, quality, reviewId){
  const key = makeKeyFromQuestion(q);
  const book = loadWrongBook();
  const rec = book[key];
  if (!rec) return null;

  ensureSrs(rec);
  const rid = reviewId || rec.srs.lastReviewId || null;
  if (rid && rec.srs.lastReviewId === rid && rec.srs._before){
    restoreSm2(rec, rec.srs._before);
  }

  // snapshot remains the same; re-apply with new rating
  sm2Apply(rec, quality);

  // keep reviewId
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
    const key = makeKeyFromQuestion(q);
    const rec = book[key];
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

// Build a parsed exam object from wrong book items (due-first if onlyDue)
export function buildWrongOnlyParsed({ limit=60, onlyDue=false, fallbackAll=true, subject=null, keys=null } = {}){
  const book = loadWrongBook();
  let items = Object.values(book);
  if (!items.length) return null;

  // Optional: build from explicit wrong-book keys (single-question replay)
  if (Array.isArray(keys) && keys.length){
    items = keys.map(k => book[k]).filter(Boolean);
    if (!items.length) return null;
  }

  // Optional: filter by subject (case-insensitive exact match)
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

  // Priority: due first, then by wrong intensity, then by oldest due
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
    origN: idx + 1,
    text: it.q?.text || "",
    subject: normSubject(it.q?.subject),
    optionsByLetter: it.q?.optionsByLetter || {}
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
    mapOriginalToDisplay: {}
  };
}
