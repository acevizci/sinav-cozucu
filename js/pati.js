import { appError } from "./ui/uiAlert.js";
/* ================= GAMIFICATION (OYUN & PATİ) ================= */

/* ===============================================================
   EVENT-DRIVEN PATI SPEECH + AI (TEK TURDA TEK MESAJ)
   - Konuşmalar event-driven: goal/streak/checkpoint/hizli_uyari/tebrik/mood...
   - AI mesajı akışa entegre: context param ile
   - Tek turda çift mesaj YOK: merkezi Speech Arbiter (turn bazlı kilit)
   - Fallback mesajlar da dinamik ve template’li
   =============================================================== */

// =======================
// 1) DEĞİŞKENLER VE ANAHTARLAR
// =======================
const PATI_DAILY_GOAL_KEY   = "PATI_DAILY_GOAL";     // default 20
const PATI_DAILY_DATE_KEY   = "PATI_DAILY_DATE";     // YYYY-MM-DD
const PATI_DAILY_SOLVED_KEY = "PATI_DAILY_SOLVED";   // int

const PATI_STREAK_KEY       = "PATI_STREAK";         // int
const PATI_STREAK_LAST_KEY  = "PATI_STREAK_LAST";    // YYYY-MM-DD (son tamamlanan gün)

const PATI_CHECKPOINT_SEEN_PREFIX = "PATI_CHECKPOINT_SEEN_"; // + YYYY-MM-DD => JSON map

const PATI_DAILY_CORRECT_KEY = "PATI_DAILY_CORRECT";       // bugün doğru sayısı
const PATI_DAILY_FOOD_AWARD_KEY = "PATI_DAILY_FOOD_AWARD"; // bugün kaç mama ödülü verildi

const PATI_LEVEL_KEY = "PATI_LEVEL";
const PATI_LEVEL_XP_KEY = "PATI_LEVEL_XP";
const PATI_LAST_FED_TS_KEY = "PATI_LAST_FED_TS";

// =======================
// APP OPEN / WELCOME
// =======================
const PATI_LAST_SEEN_TS_KEY = "PATI_LAST_SEEN_TS";
const PATI_WELCOME_SEEN_PREFIX = "PATI_WELCOME_SEEN_"; // + YYYY-MM-DD

// =======================
// DAVRANIŞ EŞİKLERİ (EĞİTİM)
// =======================
// Hızlı çözüm uyarısı (dikkatsizlik savar)
const PATI_FAST_THRESHOLD_SEC = 3;
// Yavaş çözüm desteği/övgüsü
const PATI_SLOW_THRESHOLD_SEC = 80;

// =======================
// GEMINI MODEL SEÇİMİ (404 olursa otomatik fallback)
// Not: Gemini 1.5 ailesi kapatıldı (Sep 29 2025); bu yüzden 1.5 isimleri 404 dönebilir.
// Bu listeyi istersen localStorage('GEMINI_MODEL') ile override edebilirsin.
const GEMINI_MODEL_KEY = "GEMINI_MODEL";
const GEMINI_MODEL_CANDIDATES = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash"
];
function _getGeminiModel(){
  const override = (localStorage.getItem(GEMINI_MODEL_KEY) || "").trim();
  if (override) return override;
  return GEMINI_MODEL_CANDIDATES[0];
}

// =======================
// 2) YARDIMCILAR (İSİM + DATE + TEMPLATE)
// =======================
function _getDynamicUserName() {
  const rawName = (localStorage.getItem('user_name') || "Şampiyon").trim();
  const first = rawName.split(/\s+/)[0] || "Şampiyon";
  return first.length >= 2 ? first : "Şampiyon";
}

function _todayKey(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function _yesterdayKey(){
  const d = new Date(Date.now() - 24*60*60*1000);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}

function _checkpointSeenKey(){
  return `${PATI_CHECKPOINT_SEEN_PREFIX}${_todayKey()}`;
}
function _getCheckpointSeen(){
  try { return JSON.parse(localStorage.getItem(_checkpointSeenKey()) || "{}"); }
  catch { return {}; }
}
function _setCheckpointSeen(obj){
  try { localStorage.setItem(_checkpointSeenKey(), JSON.stringify(obj || {})); } catch {}
}

function _fmt(tpl, ctx){
  return String(tpl).replace(/\$\{(\w+)\}/g, (_, k) => {
    const v = ctx?.[k];
    return (v === undefined || v === null) ? "" : String(v);
  });
}
function _pick(arr){
  if (!arr || !arr.length) return "";
  return arr[Math.floor(Math.random() * arr.length)];
}

function _getPatiContext(extra = {}){
  return {
    name: _getDynamicUserName(),
    lv: getPatiLevel(),
    sat: window.PatiManager?.satiety ?? 100,
    food: window.PatiManager?.foodStock ?? 0,
    solved: _loadDailySolved(),
    goal: getDailyGoal(),
    correct: _loadDailyCorrect(),
    streak: _getStreak(),
    combo: (typeof currentCombo === "number") ? currentCombo : 0,
    correctStreak: (typeof correctStreak === "number") ? correctStreak : 0,
    ...extra
  };
}

// =======================
// 🫧 PATI BUBBLE (KÜÇÜK BALON) + METİN KISALTMA
// =======================
function _trimPatiText(text){
  let t = String(text || "").trim();
  if (!t) return "";
  // İlk cümleye kırp (çok uzatmasın)
  t = t.split(/[.!?]/)[0].trim();
  // Emoji/son ek için min kalsın
  if (t.length > 90) t = t.slice(0, 90).trim() + "…";
  return t;
}

function _showInPatiBubble(text, duration=2800){
  const bubble = document.getElementById("patiBubble");
  const t = _trimPatiText(text);
  if (!bubble) return false;

  bubble.textContent = t;
  bubble.style.opacity = "1";
  bubble.style.transform = "translateY(0)";

  // timer
  if (bubble._patiTimer) clearTimeout(bubble._patiTimer);
  bubble._patiTimer = setTimeout(() => {
    bubble.style.opacity = "0";
    bubble.style.transform = "translateY(10px)";
  }, Math.max(1200, duration|0));

  return true;
}

function _sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// =======================
// 👋 APP OPEN: PATI KARŞILAMA (SPAM YOK)
// =======================
function _welcomeSeenKey(){
  return `${PATI_WELCOME_SEEN_PREFIX}${_todayKey()}`;
}

async function patiWelcomeOnAppOpen(){
  const now = Date.now();
  const lastSeen = parseInt(localStorage.getItem(PATI_LAST_SEEN_TS_KEY) || "0", 10);
  const minsAway = lastSeen ? (now - lastSeen) / 60000 : null;

  // son görüldü güncelle
  try { localStorage.setItem(PATI_LAST_SEEN_TS_KEY, String(now)); } catch {}

  // aynı gün içinde sadece 1 kez
  if (localStorage.getItem(_welcomeSeenKey())) return;

  // çok kısa aç-kapa -> sus (2 dk)
  if (minsAway !== null && minsAway < 2) return;

  // UI otursun
  await _sleep(350);

  const sat = window.PatiManager?.satiety ?? 100;

  let eventKey = "welcome";
  let aiCtx = "genel";
  let prio = 30;

  if (sat < 30) {
    eventKey = "welcome_hungry";
    aiCtx = "aclik_kriz";
    prio = 35;
  } else if (minsAway !== null && minsAway > 180) { // 3 saat+
    eventKey = "welcome_long";
    aiCtx = "genel";
    prio = 40;
  }

  // ✅ açılış konuşmasını da bir “tur” gibi yönet
  PatiSpeech.beginTurn("welcome-" + _todayKey());

  await speakEvent(eventKey, {
    duration: 3200,
    priority: prio,
    aiContext: aiCtx,
    aiChance: 0.35
  });

  try { localStorage.setItem(_welcomeSeenKey(), "1"); } catch {}
}

// =======================
// 3) TEK MERKEZ: SPEECH ARBITER (TEK TURDA TEK MESAJ)
// =======================
const PatiSpeech = {
  _turnId: null,
  _spoken: false,
  _bestPriority: -999,
  _lastGlobalTs: 0, // global spam kesici

  beginTurn(turnId){
    this._turnId = String(turnId || Date.now());
    this._spoken = false;
    this._bestPriority = -999;
  },

  // turn içinde tek mesaj; ayrıca global cooldown (çok kısa aralıkta patlamasın)
  trySpeak(text, duration=2800, { priority=0, globalCooldownMs=250 } = {}){
    const now = Date.now();
    if (now - (this._lastGlobalTs || 0) < globalCooldownMs) return false;

    if (this._spoken) return false;

    // aynı turda farklı yerlerden yarış gelirse: en yüksek öncelik kazansın
    if (priority < this._bestPriority) return false;

    this._bestPriority = priority;
    this._spoken = true;
    this._lastGlobalTs = now;

    if (!_showInPatiBubble(text, duration)) {
      window.PatiManager?.showSpeech?.(text, duration);
    }
    return true;
  }
};

// =======================
// 4) MESAJ HAVUZU (FALLBACK) + EVENT -> TEXT
// =======================
const PATI_LINES = {
  // general
  genel: [
    "${name} 🐾 1 dakika: 1 soru… sonra ben 1 mama isterim 😋🍖",
    "${name} hedef ${goal}. Şu an ${solved}/${goal}… hadi bitirelim 😎🐶",
    "Hav hav! ${name} odak mod: aç-kapa değil, kilitle 🔒🧠🐶"
  ],
  hungry: [
    "${name} karnım gurulduyor… ama sen çözersen mama gelir 😭🍖🐶",
    "Off ${name} tok değilim… 3 doğruya 1 mama var, hadi saldır! 🥺🐾",
    "${name} açım diye drama yapıyorum ama sen efsanesin, devam 😤🐶"
  ],
  welcome: [
    "Hoş geldin ${name}! 🐶 Bugün ${goal} hedef var, hadi ısınalım! 🐾",
    "${name} geri döndün ya… kuyruk helikopter! 🌀🐾",
    "Selam ${name}! 3 doğruya 1 mama var 😋🍖"
  ],
  welcome_long: [
    "${name} neredeydin! Ben seni bekledim 🥺🐶 Hadi devam!",
    "Hoş geldin ${name}! Uzun olmuş… şimdi patileri açıp başlayalım 🐾🔥"
  ],
  welcome_hungry: [
    "Hoş geldin ${name}… ben açım 😭🍖 Ama sen çözersen mama gelir!",
    "${name} geldin mi? Karnım gurulduyor… hadi soru! 🥺🐾"
  ],
  hizli_uyari: [
    "${name} çok hızlısın ⚡ Emin misin? 🐶",
    "Hop ${name}! Bu hız roket… bir daha kontrol et 🧐🐾"
  ],
  tebrik: [
    "Helal ${name}! Seri güzel gidiyor 🏆🔥🐶",
    "${name} kuyruk helikopter! Devam devam 🌀🐾"
  ],
  challenge: [
    "${name} çok rahatsın 😎 Şimdi BOSS mod: daha zor soru seç! 🐶⚔️",
    "Ooo ${name} hız+doğru… bu işte seviye atladın. Meydan okuma başlıyor! 🔥🐾"
  ],
  yavas_destek: [
    "${name} takıldın gibi… dur, parçalayalım: önce soruyu bir daha oku 🧩🐾",
    "Sakin ${name}. Nefes al, ipucu ara, sonra saldır 😤🐶"
  ],
  yavas_ovgu: [
    "${name} ağır ağır ama tertemiz… işte bu! 👑🐶",
    "Sabır var ${name}! Böyle çözmek gerçek güç 💪🐾"
  ],
  rastgele_isaretleme: [
    "${name} bu hızla tıklıyorsun… ben bile patiyle yanlış basarım 😅🐾 Yavaşla!",
    "Hop ${name}! Sallama mod açık. Bir saniye kontrol et 🧐🐶"
  ],
  moral_destek: [
    "${name} moral bozulmak yok. 3 yanlış=ısınma turu, şimdi geri dönüyoruz 😤🐾",
    "Bak ${name}, yanlışlar seni öğretmen yapar. Devam! 🧠🐶"
  ],
  aclik_kriz: [
    "${name} ben bayılıyorum açlıktan… ama sen çözüyorsun, efsanesin 😵‍💫🍖🐶",
    "Açlık kritik 🚨 ${name}… 3 doğruya 1 mama var, hadi kurtar beni! 🥺🐾"
  ],
  goalDone: [
    "Bugünün hedefi TAMAM ${name}! ${goal}/${goal} 🎯🔥🐶",
    "${name} hedef bitti… gururdan pati-pati 😭🏆🐾"
  ],
  checkpoint: [
    "Checkpoint: ${solved} soru! ${name} devam mı? 🐾😄",
    "${name} ${solved} oldu! Şimdi bırakırsan ben de ağlarım 🥺🐶"
  ],
  streakUp: [
    "Streak yandııı ${name}! 🔥 ${streak} gün! (10 soru/gün) 🐶",
    "${name} seri ${streak}! Kuyruk pervane 🌀🐾"
  ],
  levelUp: [
    "Level up ${name}! 🐶✨ LVL ${lv}",
    "${name} LVL ${lv}! Boss soru gelsin 😎🐾"
  ],
  foodGain: [
    "+${foodAdd} mama! 🍖 ${name} şimdi beni beslersin ha 😋🐶",
    "${name} ${foodAdd} mama geldi! (Ben saydım, hile yok 😎🍖)"
  ],
  wrong: [
    "Olsun ${name}! Bir yanlış = bir ders. Geri saldır! 🐾😤",
    "${name} takılma… bir sonraki doğru senin! 🐶✨"
  ]
};

function _fallbackLine(key, extraCtx = {}){
  const ctx = _getPatiContext(extraCtx);
  // mood auto
  const useKey = (key === "genel" && ctx.sat < 30) ? "hungry" : key;
  return _fmt(_pick(PATI_LINES[useKey] || PATI_LINES.genel), ctx);
}

// =======================
// 5) DAILY GOAL / COUNTERS
// =======================
function getDailyGoal(){
  const raw = parseInt(localStorage.getItem(PATI_DAILY_GOAL_KEY) || "20", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}
function setDailyGoal(v){
  const n = Math.max(1, parseInt(v, 10) || 20);
  localStorage.setItem(PATI_DAILY_GOAL_KEY, String(n));
}

function _ensureDailyCounters(){
  const today = _todayKey();
  const rawDate = localStorage.getItem(PATI_DAILY_DATE_KEY) || "";
  if (rawDate !== today){
    localStorage.setItem(PATI_DAILY_DATE_KEY, today);
    localStorage.setItem(PATI_DAILY_SOLVED_KEY, "0");
    localStorage.setItem(PATI_DAILY_CORRECT_KEY, "0");
    localStorage.setItem(PATI_DAILY_FOOD_AWARD_KEY, "0");
  }
}
function _loadDailySolved(){
  _ensureDailyCounters();
  const n = parseInt(localStorage.getItem(PATI_DAILY_SOLVED_KEY) || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function _saveDailySolved(n){
  localStorage.setItem(PATI_DAILY_SOLVED_KEY, String(Math.max(0, n|0)));
}
function _loadDailyCorrect(){
  _ensureDailyCounters();
  const n = parseInt(localStorage.getItem(PATI_DAILY_CORRECT_KEY) || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function _saveDailyCorrect(n){
  localStorage.setItem(PATI_DAILY_CORRECT_KEY, String(Math.max(0, n|0)));
}
function _loadDailyFoodAward(){
  _ensureDailyCounters();
  const n = parseInt(localStorage.getItem(PATI_DAILY_FOOD_AWARD_KEY) || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function _saveDailyFoodAward(n){
  localStorage.setItem(PATI_DAILY_FOOD_AWARD_KEY, String(Math.max(0, n|0)));
}

// =======================
// 6) STREAK + UI
// =======================
export function _getStreak(){
  const s = parseInt(localStorage.getItem(PATI_STREAK_KEY) || "0", 10);
  return Number.isFinite(s) && s >= 0 ? s : 0;
}
function _setStreak(n){
  localStorage.setItem(PATI_STREAK_KEY, String(Math.max(0, n|0)));
}
function _getStreakLastDone(){
  return localStorage.getItem(PATI_STREAK_LAST_KEY) || "";
}
function _setStreakLastDone(dateKey){
  localStorage.setItem(PATI_STREAK_LAST_KEY, String(dateKey || ""));
}

function updateDailyStreakUI(){
  const solved = _loadDailySolved();
  const goal = getDailyGoal();
  const streak = _getStreak();
  const correct = _loadDailyCorrect();

  const elSolved = document.getElementById("patiDailySolved");
  if (elSolved) elSolved.textContent = String(solved);

  const elGoal = document.getElementById("patiDailyGoal");
  if (elGoal) elGoal.textContent = String(goal);

  const elStreak = document.getElementById("patiStreak");
  if (elStreak) elStreak.textContent = String(streak);

  const elCorrect = document.getElementById("patiDailyCorrect");
  if (elCorrect) elCorrect.textContent = String(correct);

  const bar = document.getElementById("patiGoalBar");
  if (bar) {
    const pct = goal ? Math.min(100, Math.round((solved/goal)*100)) : 0;
    bar.style.width = pct + "%";
  }
}

// =======================
// 7) LEVEL
// =======================
export function getPatiLevel(){
  const raw = localStorage.getItem(PATI_LEVEL_KEY);
  const lv = parseInt(raw, 10);
  return Number.isFinite(lv) && lv > 0 ? lv : 1;
}
function _getLevelXp(){
  const raw = localStorage.getItem(PATI_LEVEL_XP_KEY);
  const n = parseFloat(raw || "0");
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function _setLevelXp(n){
  localStorage.setItem(PATI_LEVEL_XP_KEY, String(Math.max(0, Number(n)||0)));
}
function getLastFedTs(){
  const raw = localStorage.getItem(PATI_LAST_FED_TS_KEY);
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}
function setLastFedTs(ts){
  localStorage.setItem(PATI_LAST_FED_TS_KEY, String(ts));
}
function getLevelUpStride(){
  const lastFed = getLastFedTs();
  if (!lastFed) return 5;
  const hours = (Date.now() - lastFed) / (1000 * 60 * 60);
  if (hours >= 24) return 15;
  if (hours >= 6) return 10;
  return 5;
}
function _levelUp(){
  const current = getPatiLevel();
  const next = current + 1;
  localStorage.setItem(PATI_LEVEL_KEY, String(next));
  //console.log("🐶 Pati level up:", current, "→", next);
  return next;
}
function onCorrectFirstTimeLevelProgress(delta=1){
  const stride = getLevelUpStride();
  let xp = _getLevelXp();
  xp += Math.max(0, Math.min(1, Number(delta)||0));
  if (xp >= stride) {
    xp = 0;
    const newLv = _levelUp();

    // ✅ TEK TURDA TEK MESAJ (priority yüksek)
    const text = _fallbackLine("levelUp", { lv: newLv });
    PatiSpeech.trySpeak(text, 3000, { priority: 80, globalCooldownMs: 150 });

    try { showToast?.({ id:"PATI_LEVEL_UP", vars:{ lvl: newLv }, kind:"ok" }); } catch {}
    if (window.confetti) confetti({ particleCount: 60, spread: 55, origin: { y: 0.7 } });
  }
  _setLevelXp(xp);
}

// =======================
// 8) ÇABA / GOAL / CHECKPOINT / STREAK (EVENT-DRIVEN)
// =======================
function recordSolvedForToday(firstTime = true){
  if (!firstTime) {
    return { solved: _loadDailySolved(), goal: getDailyGoal(), streak: _getStreak() };
  }

  const goal = getDailyGoal();
  let solved = _loadDailySolved();

  solved++;
  _saveDailySolved(solved);

  const seen = _getCheckpointSeen();

  // Öncelik sırası: goalDone(90) > streakUp(85) > checkpoint(50)
  if (solved === goal){
    const text = _fallbackLine("goalDone", { goal, solved });
    PatiSpeech.trySpeak(text, 3500, { priority: 90, globalCooldownMs: 150 });

    try { showToast?.({ id:"PATI_DAILY_GOAL", vars:{ goal }, kind:"ok" }); } catch {}
    if (window.confetti) confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  } else {
    const hit =
      (solved === 10) ? "10" :
      (solved === 20) ? "20" :
      (solved % 25 === 0) ? String(solved) :
      null;

    if (hit && !seen[hit]) {
      seen[hit] = Date.now();
      _setCheckpointSeen(seen);

      const text = _fallbackLine("checkpoint", { solved });
      PatiSpeech.trySpeak(text, 2500, { priority: 50, globalCooldownMs: 150 });
    }
  }

  // ✅ Streak: günde bir kez, solved >= 10 olduğunda
  const today = _todayKey();
  const lastDone = _getStreakLastDone();
  if (solved >= 10 && lastDone !== today) {
    const yest = _yesterdayKey();
    let streak = _getStreak();
    streak = (lastDone === yest) ? (streak + 1) : 1;
    _setStreak(streak);
    _setStreakLastDone(today);

    const text = _fallbackLine("streakUp", { streak });
    PatiSpeech.trySpeak(text, 3500, { priority: 85, globalCooldownMs: 150 });

    try { showToast?.({ id:"PATI_STREAK", vars:{ streak }, kind:"ok" }); } catch {}
  }

  updateDailyStreakUI();
  return { solved, goal, streak: _getStreak() };
}

// =======================
// 9) PATI MANAGER (TOKLUK/MAMA UI) — KONUŞMALAR ARBITER'DAN GEÇER
// =======================
window.PatiManager = {
  foodStock: 0,
  totalFed: 0,
  satiety: 100,
  lastUpdate: Date.now(),

  _lastQuestionStartTs: 0,
  _questionShownTs: 0, // ✅ soru gerçekten ekrana geldiği an
  _qCounter: 0,
  _lastMoodTalkTs: 0,
  _lastLiveSaveTs: 0,

  init: function() {
    this.foodStock = parseInt(localStorage.getItem('pati_food') || 0, 10);
    this.totalFed  = parseInt(localStorage.getItem('pati_total_fed') || 0, 10);
    this.satiety   = parseFloat(localStorage.getItem('pati_satiety') || 100);
    const lastTime = parseInt(localStorage.getItem('pati_last_time') || Date.now(), 10);

    try {
      if (!localStorage.getItem(PATI_DAILY_GOAL_KEY)) setDailyGoal(20);
      _ensureDailyCounters();
      updateDailyStreakUI();
    } catch {}

    // Offline açlık hesabı
    const now = Date.now();
    const hoursPassed = (now - lastTime) / (1000 * 60 * 60);
    if (hoursPassed > 0.1) {
      const hungerDrop = hoursPassed * 6; // saatte 6
      this.satiety = Math.max(0, this.satiety - hungerDrop);
      this.save();
    }

    this.updateUI();
    this.checkMood();

    // 👋 Karşılama (app açılışında)
    try { patiWelcomeOnAppOpen(); } catch {}

    setInterval(() => {
      if (this.satiety <= 0) return;
      this.satiety = Math.max(0, this.satiety - 2);
      this.updateUI();

      const t = Date.now();
      if (t - (this._lastLiveSaveTs || 0) > 5 * 60 * 1000) {
        this._lastLiveSaveTs = t;
        this.save();
      }
    }, 60000);
  },

  // ✅ UI bunu çağırmalı: soru ekrana geldiğinde (render sonrası)
  // Bu fonksiyon hem süre ölçümü için ts set eder, hem de eski tokluk azaltma mantığını tetikler.
  onQuestionShown: function() {
    const now = Date.now();
    this._questionShownTs = now;
    // eski mekanizma: soru başlangıcı sayacı (spam kilidi içeriyor)
    this.onQuestionStart();
  },

  onQuestionStart: function() {
    const now = Date.now();
    if (now - this._lastQuestionStartTs < 600) return;
    this._lastQuestionStartTs = now;

    this._qCounter++;
    if (this._qCounter % 5 === 0) {
      this.satiety = Math.max(0, this.satiety - 4);
      this.save();
      this.updateUI();
      this.checkMood();
    }
  },

  addFood: function(amount) {
    const n = Number(amount) || 0;
    if (n <= 0) return;
    this.foodStock += n;

    // Not: addFood genelde turn dışı olabilir; global cooldown ile zaten spam kesiliyor
    const text = _fallbackLine("foodGain", { foodAdd: n });
    PatiSpeech.trySpeak(text, 2400, { priority: 10, globalCooldownMs: 250 });

    this.save();
    this.updateUI();
  },

  feed: function() {
    if (this.foodStock <= 0) {
      window.showToast?.({id:"PATI_NO_FOOD", kind:"warn"}); if(!window.showToast) (window.showWarn?.({ id:"PATI_NO_FOOD", vars: {} })) || console.warn(window.uiMsg ? window.uiMsg("PATI_NO_FOOD", {}) : "");
      return;
    }
    if (this.satiety >= 100) {
      this.showSpeech("Çok tokum, teşekkürler! 🤢", 2000);
      return;
    }

    this.foodStock--;
    this.totalFed++;
    this.satiety = Math.min(100, this.satiety + 20);
    setLastFedTs(Date.now());

    this.save();
    this.updateUI();
    this.checkMood();

    // 👋 Karşılama (app açılışında)
    try { patiWelcomeOnAppOpen(); } catch {}

    const avatar = document.getElementById('patiAvatar');
    if(avatar) {
      avatar.classList.remove('sad');
      avatar.classList.add('eating');
      setTimeout(()=>avatar.classList.remove('eating'), 500);
    }

    if(window.confetti) confetti({ particleCount: 15, spread: 40, origin: { x: 0.9, y: 0.9 } });

    const msgs = ["Nyam nyam! 😋", "Çok lezzetli! ❤️", "Güçlendim! 💪", "Sen bir harikasın! 🥰"];
    this.showSpeech(msgs[Math.floor(Math.random() * msgs.length)]);
  },

  checkMood: function() {
    const avatar = document.getElementById('patiAvatar');
    if (!avatar) return;

    const now = Date.now();
    const canTalk = (now - (this._lastMoodTalkTs || 0)) > 45000;

    if (this.satiety < 30) {
      avatar.innerText = "🥺";
      avatar.classList.add('sad');
      if (canTalk) {
        this._lastMoodTalkTs = now;

        // turn dışında: düşük öncelik + global cooldown
        const text = _fallbackLine("hungry");
        PatiSpeech.trySpeak(text, 4500, { priority: 5, globalCooldownMs: 800 });
      }
    } else {
      avatar.innerText = "🐶";
      avatar.classList.remove('sad');
    }
  },

// ... checkMood fonksiyonundan sonra buraya ekle ...

  // =======================
  // CANLI PATİ MOTORU (RASTGELE DAVRANIŞLAR)
  // =======================
  startLiving: function() {
    const avatar = document.getElementById('patiAvatar');
    if (!avatar) return;

    // Rastgele hareket döngüsü
    const triggerRandomAction = () => {
      // Eğer yemek yiyorsa veya üzgünse rastgele hareket yapma (atmosferi bozmasın)
      if (avatar.classList.contains('eating') || avatar.classList.contains('sad')) {
        setTimeout(triggerRandomAction, 5000);
        return;
      }

      // Olası hareketler listesine 'action-spin' eklendi!
      const actions = [
          'action-tilt', 
          'action-sniff', 
          'action-jump', 
          'action-spin', // 🌪️ YENİ: Kendi etrafında dönme
          'none', 'none', 'none' // 'none' sayısı ile hiperaktiviteyi dengeliyoruz
      ];
      
	  
      const action = actions[Math.floor(Math.random() * actions.length)];

      if (action !== 'none') {
        avatar.classList.add(action);
        
        // Animasyon bitince class'ı temizle (ki tekrar çalışabilsin)
        setTimeout(() => {
          avatar.classList.remove(action);
        }, 1200); // En uzun animasyondan biraz fazla süre
      }

      // Bir sonraki hareket için rastgele süre (3 ile 7 saniye arası)
      const nextTime = 3000 + Math.random() * 4000;
      setTimeout(triggerRandomAction, nextTime);
    };

    // İlk tetikleme
    triggerRandomAction();
  },

  // ... (diğer fonksiyonlar devam eder)
  
  updateUI: function() {
    const elFood = document.getElementById('patiFoodCount');
    if(elFood) elFood.textContent = this.foodStock;

    const elTotal = document.getElementById('patiTotalFed');
    if(elTotal) elTotal.textContent = this.totalFed;

    const aiLevel = getPatiLevel();
    const feedLevel = Math.floor(this.totalFed / 5) + 1;
    const elLvl = document.getElementById('patiLevelBadge');
    if(elLvl) elLvl.textContent = `LVL ${aiLevel} • BESLEME ${feedLevel}`;

    const elBar = document.getElementById('patiSatietyBar');
    if(elBar) {
      elBar.style.width = `${this.satiety}%`;
      if (this.satiety < 30) elBar.classList.add('critical');
      else elBar.classList.remove('critical');
    }

    try { updateDailyStreakUI(); } catch {}
  },

  showSpeech: function(text, duration=3000) {
    const el = document.getElementById('patiSpeech');
    if(!el) return;
    el.textContent = text;
    el.style.display = 'block';
    if(this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => { el.style.display = 'none'; }, duration);
  },

  save: function() {
    localStorage.setItem('pati_food', String(this.foodStock|0));
    localStorage.setItem('pati_total_fed', String(this.totalFed|0));
    localStorage.setItem('pati_satiety', String(Number(this.satiety).toFixed(1)));
    localStorage.setItem('pati_last_time', String(Date.now()));
  }
};

window.addEventListener('load', () => window.PatiManager.init());

// ✅ UI HOOK: soru ekrana geldiğinde çağır
// Örnek: yeni soru render edildikten sonra `window.PatiQuestionShown?.()`
window.PatiQuestionShown = function(){
  try { window.PatiManager?.onQuestionShown?.(); } catch {}
};

// =======================
// 10) OYUN DÖNGÜSÜ (EVENT-DRIVEN) + AI ENTEGRASYON
// =======================
let currentCombo = 0;
let correctStreak = 0;
let wrongStreak = 0;

// Son cevap geçmişi (spam click / adaptif davranış için)
const _recentAnswers = []; // [{ts, isCorrect, durationSec}]
function _pushRecent(score, durationSec){
  _recentAnswers.push({ ts: Date.now(), score, durationSec });
  if (_recentAnswers.length > 20) _recentAnswers.shift();
}
function _lastN(n){
  return _recentAnswers.slice(Math.max(0, _recentAnswers.length - n));
}

function _awardFoodDeterministicIfNeeded(){
  const correct = _loadDailyCorrect();
  const shouldHaveAwarded = Math.floor(correct / 3);
  const awarded = _loadDailyFoodAward();
  const delta = shouldHaveAwarded - awarded;
  if (delta > 0) {
    window.PatiManager?.addFood?.(delta);
    _saveDailyFoodAward(awarded + delta);
  }
}

// =======================
// 11) AI MESAJ MOTORU (v1beta + gemini-1.5-flash)
// =======================
async function fetchPatiMessageFromAI(userName, level, context = "genel") {
  const apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) return null;

  const lv = Number.isFinite(+level) ? +level : 1;
  const sat = window.PatiManager?.satiety ?? 100;

  let moodHint = sat < 30
    ? "ÇOK AÇ ve sızlanan, dramatik ama komik bir köpek gibi konuş. Karnın guruldasın."
    : "Neşeli, tatlı ve komik bir köpek gibi konuş.";

  if (context === "hizli_uyari") {
    moodHint = "Çok hızlı soru çözen sahibini uyaran, 'Dikkatsiz mi davranıyorsun?' diye soran, şaşkın bir köpek ol.";
  } else if (context === "tebrik") {
    moodHint = "Sahibi üst üste doğru yaptığı için kuyruğu helikopter gibi dönen, çok mutlu bir köpek ol.";
  } else if (context === "yavas_destek") {
    moodHint = "Sahibi uzun süre düşünmüş; ona küçük bir strateji öner (oku-parçala-kontrol et).";
  } else if (context === "yavas_ovgu") {
    moodHint = "Sahibi sabırla çözmüş; sabrını ve dikkatini öv.";
  } else if (context === "rastgele_isaretleme") {
    moodHint = "Sahibi çok hızlı tıklayıp sallıyor gibi; tatlı bir uyarı yap.";
  } else if (context === "moral_destek") {
    moodHint = "Sahibi moral kaybediyor; kısa ve sıcak bir destek ver.";
  } else if (context === "challenge") {
    moodHint = "Sahibi iyi gidiyor; tatlı bir meydan okuma yap.";
  } else if (context === "aclik_kriz") {
    moodHint = "Çok açsın; dramatik ama komik şekilde sızlan, yine de motive et.";
  }

  const styleByLevel =
    lv <= 2 ? "çok basit ve çocukça" :
    lv <= 5 ? "daha motive edici ve hafif esprili" :
    "daha meydan okuyan, özgüven artıran";

  const prompt = `
Sen 4. sınıfa giden ${userName} adında bir öğrencinin "Pati" adındaki sanal köpeğisin.
Pati seviyesi: ${lv}. Tokluk: ${sat}/100. Durum: ${context}.
Ruh hali talimatı: ${moodHint} | Üslup: ${styleByLevel}.
Ona çok kısa (maksimum 1 cümle), komik, tatlı ve motive edici bir şey söyle.

KURALLAR:
1. Cümlenin içinde mutlaka "${userName}" ismini geçir.
2. Köpek gibi konuş (hav, kemik, mama, kuyruk).
3. Bol emoji kullan.
4. Tek cümle yaz. 12-14 kelimeyi geçme.
5. SADECE mesajı yaz. Tırnak koyma.
`.trim();

  const modelsToTry = (() => {
    const primary = _getGeminiModel();
    const set = new Set([primary, ...GEMINI_MODEL_CANDIDATES]);
    return Array.from(set);
  })();

  // Geçici servis hataları (503/429) için hızlı retry + model fallback
  for (const model of modelsToTry) {
    const maxAttempts = 2;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2500);

      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 28, temperature: 0.9 }
            }),
            signal: ctrl.signal
          }
        );

        // Model yok/kapalı
        if (response.status === 404) break;

        // Geçici: kota/servis
        if (response.status === 429 || response.status === 503 || response.status === 500 || response.status === 502 || response.status === 504) {
          if (attempt < maxAttempts) {
            await _sleep(150 * (attempt + 1));
            continue;
          }
          // bu model şu an veremiyor -> sıradaki modele geç
          break;
        }

        if (!response.ok) return null;

        const data = await response.json();
        const raw =
          data?.candidates?.[0]?.content?.parts
            ?.map(p => p.text)
            .filter(Boolean)
            .join(" ")
            .trim()
          || null;

        return raw ? _trimPatiText(raw) : null;
      } catch (e) {
        // abort/network: kısa retry, sonra model fallback
        if (attempt < maxAttempts) {
          await _sleep(150 * (attempt + 1));
          continue;
        }
        break;
      } finally {
        clearTimeout(t);
      }
    }
  }

  return null;
}


// =======================
// 12) EVENT SPEAKER: AI varsa dene, yoksa fallback (ama TEK TURDA TEK MESAJ)
// =======================
async function speakEvent(eventKey, { duration=3000, priority=0, contextExtra={}, aiContext=null, aiChance=1.0 } = {}){
  const ctx = _getPatiContext(contextExtra);

  // AI denemesi
  let text = null;
  if (aiContext && Math.random() < Math.max(0, Math.min(1, aiChance))) {
    text = await fetchPatiMessageFromAI(ctx.name, ctx.lv, aiContext);
  }
  if (!text) {
    // fallback
    text = _fallbackLine(eventKey, contextExtra);
  }

  // arbiter karar verir
  return PatiSpeech.trySpeak(text, duration, { priority, globalCooldownMs: 150 });
}

// =======================
// 13) handleGamification (AI & DİKKATSİZLİK SAVAR + TEK TUR KİLİDİ)
// =======================
export async function handleGamification(isCorrect, { firstTime = false } = {}) {
  const now = Date.now();

  // ✅ Yeni tur başlat (bu çağrı = 1 tur)
  PatiSpeech.beginTurn(now);

  // ✅ isCorrect: boolean | null OR score number (0..1)
  const score = (typeof isCorrect === "number" && Number.isFinite(isCorrect))
    ? Math.max(0, Math.min(1, isCorrect))
    : (isCorrect === true ? 1 : (isCorrect === false ? 0 : null));


  // Ölçüm: cevap verme süresi (onQuestionStart'ı çağırmadan ÖNCE!)
  // ✅ Süre ölçümü: önce 'soru ekrana geldi' ts, yoksa eski fallback
  const pm = window.PatiManager;
  const qStart = (pm?._questionShownTs && pm._questionShownTs > 0)
    ? pm._questionShownTs
    : (pm?._lastQuestionStartTs || now);
  const durationSec = Math.max(0, (now - qStart) / 1000);

  // Not: tokluk azaltma artık ideal olarak onQuestionShown() ile tetiklenir.
  // Geriye dönük uyumluluk için UI bunu çağırmıyorsa burada bir kez tetikliyoruz.
  if (firstTime && (!pm?._questionShownTs || pm._questionShownTs <= 0)) {
    pm?.onQuestionStart?.();
  }

  // 1) DİKKATSİZLİK SAVAR (çok hızlı çözüm)
  if (firstTime && durationSec > 0 && durationSec < PATI_FAST_THRESHOLD_SEC) {
    await speakEvent("hizli_uyari", {
      duration: 4000,
      priority: 95,
      aiContext: "hizli_uyari",
      aiChance: 0.95
    });

    const avatar = document.getElementById('patiAvatar');
    if (avatar) {
      //avatar.classList.add('shake-screen');
      setTimeout(() => avatar.classList.remove('shake-screen'), 400);
    }
  }

  // 2) ÇABA KAYDI (goal/checkpoint/streak konuşmak isteyebilir)
  try { recordSolvedForToday(firstTime); } catch {}

  // 3) BAŞARI / HATA AKIŞI (firstTime)
  if (firstTime === true) {
    // geçmişe yaz (spam click tespiti için)
    _pushRecent(score, durationSec);
    // ✅ Aynı soruya ikinci kez submit olursa süreyi yeniden ölçmesin
    if (pm && pm._questionShownTs) pm._questionShownTs = 0;

    if (score === 1) {
      wrongStreak = 0;

      const c = _loadDailyCorrect() + 1;
      _saveDailyCorrect(c);

      _awardFoodDeterministicIfNeeded();
      onCorrectFirstTimeLevelProgress();

      correctStreak++;
      currentCombo++;

      const hud = document.getElementById('comboHUD');
      const countEl = document.getElementById('comboCount');
      if (hud && currentCombo > 1) {
        hud.style.display = 'block';
        if (countEl) countEl.textContent = String(currentCombo);
      }

      // 3A) YAVAŞ AMA DOĞRU -> ÖVGÜ (goal/streak/uyarı yoksa konuşur)
      if (durationSec >= PATI_SLOW_THRESHOLD_SEC) {
        await speakEvent("yavas_ovgu", {
          duration: 3200,
          priority: 60,
          aiContext: "yavas_ovgu",
          aiChance: 0.75,
          contextExtra: { durationSec: Math.round(durationSec) }
        });
      }

      // 3B) Seri tebrik (her 5 doğru)
      if (correctStreak % 5 === 0) {
        await speakEvent("tebrik", {
          duration: 3500,
          priority: 40,
          aiContext: "tebrik",
          aiChance: 0.85,
          contextExtra: { correctStreak }
        });
      }

      // 3C) Challenge modu (hız+doğru seri)
      if (correctStreak >= 5 && durationSec <= Math.max(6, PATI_FAST_THRESHOLD_SEC * 2)) {
        await speakEvent("challenge", {
          duration: 3200,
          priority: 35,
          aiContext: "challenge",
          aiChance: 0.65
        });
      }

      // 3D) Açlık kritik + çalışmaya devam
      const sat = window.PatiManager?.satiety ?? 100;
      if (sat < 15) {
        await speakEvent("aclik_kriz", {
          duration: 3400,
          priority: 15,
          aiContext: "aclik_kriz",
          aiChance: 0.55
        });
      }

    } else if (score !== null && score > 0) {
      // ✅ Kısmi doğru: puan var ama tam değil (yanlış doğruyu götürmez modeli)
      wrongStreak = 0;

      // günlük solved zaten sayıldı; dailyCorrect / mama ödülü sadece tam doğruya
      // Level XP: kısmi doğru oranında ilerle
      onCorrectFirstTimeLevelProgress(score);

      // küçük combo hissi (abartmadan)
      currentCombo = Math.max(1, currentCombo + 1);
      correctStreak = Math.max(1, correctStreak + 1);

      await speakEvent("tebrik", {
        duration: 2600,
        priority: 22,
        aiContext: "tebrik",
        aiChance: 0.35,
        contextExtra: { partial: Math.round(score*100) }
      });

} else if (score === 0) {
      wrongStreak++;
      correctStreak = 0;
      currentCombo = 0;

      const hud = document.getElementById('comboHUD');
      if (hud) hud.style.display = 'none';

      const layout = document.getElementById('layoutExam');
      if (layout) {
        //layout.classList.add('shake-screen');
        setTimeout(() => layout.classList.remove('shake-screen'), 400);
      }

      // 3E) YAVAŞ + YANLIŞ -> DESTEK
      if (durationSec >= PATI_SLOW_THRESHOLD_SEC) {
        await speakEvent("yavas_destek", {
          duration: 3600,
          priority: 65,
          aiContext: "yavas_destek",
          aiChance: 0.75,
          contextExtra: { durationSec: Math.round(durationSec) }
        });
      } else {
        // normal yanlış
        await speakEvent("wrong", { duration: 2600, priority: 20, aiContext: null });
      }

      // 3F) Moral desteği (3 yanlış seri)
      if (wrongStreak >= 3) {
        await speakEvent("moral_destek", {
          duration: 3300,
          priority: 25,
          aiContext: "moral_destek",
          aiChance: 0.55
        });
      }
    }

    // 4) SPAM CLICK / SALLAMA tespiti (son 3'te 2 hızlı yanlış)
    const last3 = _lastN(3);
    const fastWrong = last3.filter(x => (Number(x.score)||0) === 0 && x.durationSec > 0 && x.durationSec < 6).length;
    if (fastWrong >= 2) {
      await speakEvent("rastgele_isaretleme", {
        duration: 3800,
        priority: 92,
        aiContext: "rastgele_isaretleme",
        aiChance: 0.65
      });
    }
  }

  updateDailyStreakUI();
}

// =======================
// 14) MOTİVASYON DÖNGÜSÜ (BUBBLE): AI + DİNAMİK FALLBACK
// =======================
export function startPatiMotivation() {
  const bubble = document.getElementById("patiBubble");
  if (!bubble) return;

  let lastBackupIdx = -1;

  const showMessage = async () => {
    const ctx = _getPatiContext();
    let textToDisplay = "";

    try {
      bubble.style.opacity = "0.5";

      // KOTA KORUMA: açsa daha çok fallback
      const fallbackChance = ctx.sat < 30 ? 0.45 : 0.25;
      if (Math.random() < fallbackChance) throw appError("ERR_RANDOM_FALLBACK");

      const aiText = await fetchPatiMessageFromAI(ctx.name, ctx.lv, "genel");
      if (!aiText) throw appError("ERR_AI_BOS");
      textToDisplay = aiText;
    } catch {
      // yedek sözler de template’li (dinamik)
      const backups = [
        "Harikasın ${name}! Böyle devam! 🚀",
        "Bu soru keklik ${name}! Halledersin. 🐦",
        "Dikkatini topla ${name}, derin nefes… 🧘‍♀️",
        "Ben acıktım ama sen çalışmaya devam et ${name}! 🍖",
        "Hata yapmaktan korkma ${name}, yanlışlar öğretir! 🧠",
        "Süper gidiyorsun ${name}! Pati gurur duyuyor! 🏆",
        "Kuyruğumu senin için sallıyorum ${name}! 🐕"
      ];
      let idx = Math.floor(Math.random() * backups.length);
      if (backups.length > 1 && idx === lastBackupIdx) idx = (idx + 1) % backups.length;
      lastBackupIdx = idx;
      textToDisplay = _fmt(backups[idx], ctx);
    }

    bubble.textContent = _trimPatiText(textToDisplay);
    bubble.style.opacity = "1";
    bubble.style.transform = "translateY(0)";

    setTimeout(() => {
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(10px)";
    }, 8000);
  };

  setTimeout(showMessage, 3000);
  setInterval(showMessage, 60000);
}