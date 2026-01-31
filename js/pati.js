
/* ================= GAMIFICATION (OYUN & PATİ) ================= */

// 1. Değişkenler
let currentCombo = 0;

// =======================
// 🎯 DAILY GOAL + 🔥 STREAK (minimal, non-breaking)
// =======================
const PATI_DAILY_GOAL_KEY   = "PATI_DAILY_GOAL";     // default 20
const PATI_DAILY_DATE_KEY   = "PATI_DAILY_DATE";     // YYYY-MM-DD
const PATI_DAILY_SOLVED_KEY = "PATI_DAILY_SOLVED";   // int
const PATI_STREAK_KEY       = "PATI_STREAK";         // int
const PATI_STREAK_LAST_KEY  = "PATI_STREAK_LAST";    // YYYY-MM-DD (son tamamlanan gün)

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

function getDailyGoal(){
  const raw = parseInt(localStorage.getItem(PATI_DAILY_GOAL_KEY) || "20", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

function setDailyGoal(v){
  const n = Math.max(1, parseInt(v, 10) || 20);
  localStorage.setItem(PATI_DAILY_GOAL_KEY, String(n));
}

function _loadDailySolved(){
  const today = _todayKey();
  const rawDate = localStorage.getItem(PATI_DAILY_DATE_KEY) || "";
  if (rawDate !== today){
    localStorage.setItem(PATI_DAILY_DATE_KEY, today);
    localStorage.setItem(PATI_DAILY_SOLVED_KEY, "0");
  }
  const n = parseInt(localStorage.getItem(PATI_DAILY_SOLVED_KEY) || "0", 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function _saveDailySolved(n){
  localStorage.setItem(PATI_DAILY_SOLVED_KEY, String(Math.max(0, n|0)));
}

function _getStreak(){
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

  const elSolved = document.getElementById("patiDailySolved");
  if (elSolved) elSolved.textContent = String(solved);

  const elGoal = document.getElementById("patiDailyGoal");
  if (elGoal) elGoal.textContent = String(goal);

  const elStreak = document.getElementById("patiStreak");
  if (elStreak) elStreak.textContent = String(streak);

  const bar = document.getElementById("patiGoalBar");
  if (bar) {
    const pct = goal ? Math.min(100, Math.round((solved/goal)*100)) : 0;
    bar.style.width = pct + "%";
  }
}

// her “işaretleme”yi 1 soru sayıyoruz (çaba bazlı)
// isCorrect sadece mesaj/bonus için, sayımı etkilemez.
function recordSolvedForToday(isCorrect, firstTime = true){
  // ✅ Aynı soruda işaret değiştirildiyse sayma
  if (!firstTime) {
    return {
      solved: _loadDailySolved(),
      goal: getDailyGoal(),
      streak: _getStreak(),
      isCorrect: !!isCorrect
    };
  }

  const goal = getDailyGoal();
  let solved = _loadDailySolved();

  solved++;
  _saveDailySolved(solved);

  // Günlük hedef tamamlandı
  if (solved === goal){
    window.PatiManager?.showSpeech?.(`Bugünün hedefi tamam! ${goal}/${goal} 🎯🐶`, 3500);
    showToast?.({ title:"Günlük Hedef", msg:`${goal} soru tamamlandı!`, kind:"ok" });
    if (window.confetti) confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
  } else if (solved === 10 || solved === 20 || (solved % 25 === 0)) {
    // mini checkpoint (spam değil)
    window.PatiManager?.showSpeech?.(`Checkpoint: ${solved} soru! Devam mı? 🐾`, 2500);
  }

  // Streak: 10 soru/gün eşiğinde artar (günde bir kere)
  const today = _todayKey();
  if (solved === 10) {
    const lastDone = _getStreakLastDone();
    const yest = _yesterdayKey();
    let streak = _getStreak();

    if (lastDone !== today) {
      streak = (lastDone === yest) ? (streak + 1) : 1;
      _setStreak(streak);
      _setStreakLastDone(today);

      window.PatiManager?.showSpeech?.(`Streak yandııı 🔥 ${streak} gün! (10 soru/gün)`, 3500);
      showToast?.({ title:"Streak", msg:`Seri: ${streak} gün (10 soru/gün)`, kind:"ok" });
    }
  }

  updateDailyStreakUI();
  return { solved, goal, streak: _getStreak(), isCorrect: !!isCorrect };
}



// =======================
// 🐶 PATI LEVEL HELPERS (AI / Motivasyon Level'i)
// =======================
const PATI_LEVEL_KEY = "PATI_LEVEL";

// ✅ NEW: Besleme zamanı (LVL yavaşlama için)
const PATI_LAST_FED_TS_KEY = "PATI_LAST_FED_TS";

function getPatiLevel(){
  const raw = localStorage.getItem(PATI_LEVEL_KEY);
  const lv = parseInt(raw, 10);
  return Number.isFinite(lv) && lv > 0 ? lv : 1;
}

// ✅ NEW: Son besleme zamanı oku/yaz
function getLastFedTs(){
  const raw = localStorage.getItem(PATI_LAST_FED_TS_KEY);
  const ts = parseInt(raw, 10);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
}
function setLastFedTs(ts){
  localStorage.setItem(PATI_LAST_FED_TS_KEY, String(ts));
}

// ✅ NEW: Uzun süre beslenmezse level-up daha seyrek olsun
// 0-6 saat: 5'te 1
// 6-24 saat: 10'da 1
// 24+ saat: 15'te 1
function getLevelUpStride(){
  const lastFed = getLastFedTs();
  if (!lastFed) return 5;
  const hours = (Date.now() - lastFed) / (1000 * 60 * 60);
  if (hours >= 24) return 15;
  if (hours >= 6) return 10;
  return 5;
}

// Başarı anında çağıracağız (handleGamification içinde)
export function increasePatiLevel(){
  const current = getPatiLevel();
  const next = current + 1;
  localStorage.setItem(PATI_LEVEL_KEY, String(next));
  console.log("🐶 Pati level up:", current, "→", next);
  return next;
}



/* ================= PATİ YÖNETİCİSİ (AKILLI SÜRÜM) ================= */
window.PatiManager = {
  foodStock: 0,
  totalFed: 0,
  satiety: 100,
  lastUpdate: Date.now(),

  _lastQuestionStartTs: 0,
  _qCounter: 0,

  // 🔥 Mood konuşma spam freni
  _lastMoodTalkTs: 0,


  init: function() {
    // 1. Verileri Yükle
    this.foodStock = parseInt(localStorage.getItem('pati_food') || 0);
    this.totalFed = parseInt(localStorage.getItem('pati_total_fed') || 0);
    this.satiety = parseFloat(localStorage.getItem('pati_satiety') || 100);
    const lastTime = parseInt(localStorage.getItem('pati_last_time') || Date.now());

    // Daily/streak init
    try {
      if (!localStorage.getItem(PATI_DAILY_GOAL_KEY)) setDailyGoal(20);
      _loadDailySolved();
      updateDailyStreakUI();
    } catch {}

    // 2. Acıkma Hesabı (Geçen zamana göre)
    // Her 1 saatte %5 acıkır (Saatte 5 puan)
    // 2. Acıkma Hesabı (offline)
const now = Date.now();
const hoursPassed = (now - lastTime) / (1000 * 60 * 60);

if (hoursPassed > 0.1) { // 6 dk+
  const hungerDrop = hoursPassed * 6; // açgözlü: saatte 6 puan
  this.satiety = Math.max(0, this.satiety - hungerDrop);
  this.save();
}


    if (hoursPassed > 0.1) { // En az 6 dk geçtiyse hesapla
      const hungerDrop = hoursPassed * 6;
      this.satiety = Math.max(0, this.satiety - 2);
      this.save();
    }

    // 3. Arayüzü Başlat
    this.updateUI();
    this.checkMood(); // Mutlu mu üzgün mü?

    // 4. Zamanlayıcı (Sayfa açıkken de acıksın)
    setInterval(() => {
      if (this.satiety > 0) {
        this.satiety = Math.max(0, this.satiety - 2); // Canlıyken yavaş acıkır
        this.updateUI();
      }
    }, 60000); // Her dakika güncelle
  },

  // ✅ UPDATED: Her soruda -3 yerine, her 5 soruda bir -4 (spam ve drama bitti)
  onQuestionStart: function() {
    const now = Date.now();
    // hızlı tıklamada spam olmasın
    if (now - this._lastQuestionStartTs < 600) return;
    this._lastQuestionStartTs = now;

    this._qCounter++;

    // Her 5 soruda bir acıkma
    if (this._qCounter % 5 === 0) {
      this.satiety = Math.max(0, this.satiety - 4);
      this.save();
      this.updateUI();
      this.checkMood();
    }
  },

  // Sınavdan mama kazanma
  addFood: function(amount) {
    this.foodStock += amount;
    this.showSpeech(`Yaşasın! +${amount} mama kazandık! 🍖`, 3000);
    this.save();
    this.updateUI();
  },

  // Besleme Fonksiyonu
  feed: function() {
    if (this.foodStock <= 0) {
      alert("Stokta mama yok! Sınav çözerek kazanmalısın. 🥺");
      return;
    }

    if (this.satiety >= 100) {
      this.showSpeech("Çok tokum, teşekkürler! 🤢", 2000);
      return;
    }

    // İşlemler
    this.foodStock--;
    this.totalFed++;
    this.satiety = Math.min(100, this.satiety + 20); // Her mama %20 doyurur

    // ✅ NEW: Son besleme zamanını kaydet (LVL yavaşlama için)
    setLastFedTs(Date.now());

    this.save();
    this.updateUI();
    this.checkMood();

    // Efektler
    const avatar = document.getElementById('patiAvatar');
    if(avatar) {
      avatar.classList.remove('sad'); // Üzgünse düzelsin
      avatar.classList.add('eating');
      setTimeout(()=>avatar.classList.remove('eating'), 500);
    }

    // Kalp Konfetisi
    if(window.confetti) confetti({ particleCount: 15, spread: 40, origin: { x: 0.9, y: 0.9 }, colors: ['#ff0000'] });

    // Rastgele Teşekkür
    const msgs = ["Nyam nyam! 😋", "Çok lezzetli! ❤️", "Güçlendim! 💪", "Sen bir harikasın! 🥰"];
    this.showSpeech(msgs[Math.floor(Math.random() * msgs.length)]);
  },

  // Ruh Halini Kontrol Et (Açsa uyar)
  checkMood: function() {
  const avatar = document.getElementById('patiAvatar');
  if (!avatar) return;

  const now = Date.now();
  const canTalk = (now - (this._lastMoodTalkTs || 0)) > 45000; // 45sn spam freni

  if (this.satiety < 30) {
    avatar.innerText = "🥺";
    avatar.classList.add('sad');
    if (canTalk) {
      this._lastMoodTalkTs = now;
      this.showSpeech("Karnım gurulduyor... Soru çözüp beni doyurur musun?", 5000);
    }
  } else {
    avatar.innerText = "🐶";
    avatar.classList.remove('sad');
  }
},


  updateUI: function() {
    // Stok
    const elFood = document.getElementById('patiFoodCount');
    if(elFood) elFood.textContent = this.foodStock;

    // Toplam
    const elTotal = document.getElementById('patiTotalFed');
    if(elTotal) elTotal.textContent = this.totalFed;

    // ✅ UPDATED: 2 seviye birden göster
    const aiLevel = getPatiLevel();
    const feedLevel = Math.floor(this.totalFed / 5) + 1;
    const elLvl = document.getElementById('patiLevelBadge');
    if(elLvl) elLvl.textContent = `LVL ${aiLevel} • BESLEME ${feedLevel}`;

    // Tokluk Barı
    const elBar = document.getElementById('patiSatietyBar');
    if(elBar) {
      elBar.style.width = `${this.satiety}%`;

      // Renk Değişimi
      if (this.satiety < 30) elBar.classList.add('critical');
      else elBar.classList.remove('critical');
    }

    // Daily/streak UI varsa güncelle
    try { updateDailyStreakUI(); } catch {}
  },

  showSpeech: function(text, duration=3000) {
    const el = document.getElementById('patiSpeech');
    if(!el) return;
    el.textContent = text;
    el.style.display = 'block';
    if(this.speechTimer) clearTimeout(this.speechTimer);
    this.speechTimer = setTimeout(() => {
      el.style.display = 'none';
    }, duration);
  },

  save: function() {
    localStorage.setItem('pati_food', this.foodStock);
    localStorage.setItem('pati_total_fed', this.totalFed);
    localStorage.setItem('pati_satiety', this.satiety.toFixed(1));
    localStorage.setItem('pati_last_time', Date.now());
  }
};

// Başlat
window.addEventListener('load', () => window.PatiManager.init());


// 3. ANA FONKSİYON: HANDLE GAMIFICATION
export function handleGamification(isCorrect, { firstTime=false } = {}) {
  const hud = document.getElementById('comboHUD');
  const countEl = document.getElementById('comboCount');
  const layout = document.getElementById('layoutExam');

  if (window.PatiManager?.onQuestionStart) window.PatiManager.onQuestionStart();

  // ✅ sadece ilk işaretleme sayılır
  try { recordSolvedForToday(!!isCorrect, firstTime); } catch {}

  // ⚠️ Senin istediğin gibi: exam sırasında "doğru ödülü" yoksa,
  // burada doğruya göre mama verme/confetti/level-up'ı KALDIRMALISIN.
  // Aşağıda bunu minimal şekilde kapatıyorum.

  // --- DOĞRU/YANLIŞA göre ödül verme yok ---
  // Combo HUD istersen sadece "çaba" için devam edebilir:
  if (firstTime) {
    currentCombo++;
    if (currentCombo > 1 && hud) {
      hud.style.display = 'block';
      if (countEl) countEl.textContent = currentCombo;
    }
  }

  // yanlışta combo sıfırlamak istiyorsan isCorrect'e göre sıfırla,
  // ama bu "ödül" değil, sadece görsel:
  if (isCorrect === false) {
    currentCombo = 0;
    if (hud) hud.style.display = 'none';
    if (layout) {
      layout.classList.add('shake-screen');
      setTimeout(() => layout.classList.remove('shake-screen'), 400);
    }
  }
}



// =======================
// 1. AI Yardımcı Fonksiyonu
// =======================
async function fetchPatiMessageFromAI(userName, level) {
  const apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) return null;

  const lv = Number.isFinite(+level) ? +level : 1;

  // ✅ Tokluk < 30 ise daha sızlanan üslup
  const sat = window.PatiManager?.satiety ?? 100;
  const moodHint = sat < 30
    ? "ÇOK AÇ ve sızlanan, dramatik ama komik bir köpek gibi konuş. Karnın guruldasın."
    : "Neşeli, tatlı ve komik bir köpek gibi konuş.";

  const styleByLevel =
    lv <= 2 ? "çok basit ve çocukça" :
    lv <= 5 ? "daha motive edici ve hafif esprili" :
    "daha meydan okuyan, özgüven artıran";

  const prompt = `
Sen 4. sınıfa giden ${userName} adında bir öğrencinin "Pati" adındaki sanal köpeğisin.
Pati seviyesi: ${lv}.
Tokluk: ${sat}/100.
Ruh hali talimatı: ${moodHint}
Üslup: ${styleByLevel}.
Ona çok kısa (maksimum 1 cümle), komik, tatlı ve motive edici bir şey söyle.

KURALLAR:
1. Cümlenin içinde mutlaka "${userName}" ismini geçir.
2. Köpek gibi konuş (hav, kemik, mama, kuyruk).
3. Bol emoji kullan.
4. Level yükseldikçe mesaj daha "challenge" içersin ama 4. sınıf dilinde kalsın.
5. Tokluk < 30 ise biraz sızlan ama motive etmeyi bırakma.

SADECE MESAJI YAZ. Tırnak işareti koyma.
`.trim();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            maxOutputTokens: 60,
            temperature: 1.0
          }
        })
      }
    );

    if (!response.ok) {
      console.error("AI HTTP Hatası:", response.status);
      return null;
    }

    const data = await response.json();

    return (
      data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        .filter(Boolean)
        .join(" ")
        .trim()
      || null
    );

  } catch (e) {
    console.error("AI Hatası:", e);
    return null;
  }
}


// =======================
// 2. Ana Fonksiyon
// =======================
export function startPatiMotivation() {
  const bubble = document.getElementById("patiBubble");
  if (!bubble) return;

  // ✅ NEW: aynı backup mesaj üst üste gelmesin
  let lastBackupIdx = -1;

  const showMessage = async () => {
    const rawName = localStorage.getItem('user_name') || "Şampiyon";
    const firstName = rawName.split(' ')[0];

    const level = getPatiLevel();

    const backupQuotes = [
      `Harikasın ${firstName}! Böyle devam! 🚀`,
      `Bu soru keklik ${firstName}! Halledersin. 🐦`,
      `Dikkatini topla ${firstName}, derin bir nefes al. 🧘‍♀️`,
      `Ben acıktım ama sen çalışmaya devam et ${firstName}! 🍖`,
      `Hata yapmaktan korkma ${firstName}, yanlışlar öğretir! 🧠`,
      `Süper gidiyorsun ${firstName}! Pati seninle gurur duyuyor! 🏆`,
      `Kuyruğumu senin için sallıyorum ${firstName}! 🐕`
    ];

    let textToDisplay = "";

    try {
      bubble.style.opacity = "0.5";

      // ✅ Toksa %25, açsa %45 yedek ihtimali
      const sat = window.PatiManager?.satiety ?? 100;
      const fallbackChance = sat < 30 ? 0.45 : 0.25;

      if (Math.random() < fallbackChance) {
        throw new Error("Random fallback");
      }

      const aiText = await fetchPatiMessageFromAI(firstName, level);
      if (aiText) {
        textToDisplay = aiText;
      } else {
        throw new Error("AI yanıtı boş");
      }

    } catch (error) {
      // ✅ aynı backup mesaj arka arkaya gelmesin
      let idx = Math.floor(Math.random() * backupQuotes.length);
      if (backupQuotes.length > 1 && idx === lastBackupIdx) {
        idx = (idx + 1) % backupQuotes.length;
      }
      lastBackupIdx = idx;

      textToDisplay = backupQuotes[idx];
    }

    bubble.textContent = textToDisplay;
    bubble.style.opacity = "1";
    bubble.style.transform = "translateY(0)";

    setTimeout(() => {
      bubble.style.opacity = "0";
      bubble.style.transform = "translateY(10px)";
    }, 8000);
  };

  // İlk mesaj
  setTimeout(showMessage, 3000);

  // Sonra her 60 saniyede
  setInterval(showMessage, 60000);
}
