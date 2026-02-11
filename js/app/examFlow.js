// js/app/examFlow.js
// Exam lifecycle (parse/start/finish/reset) - V4 + Full Badge Integration

import { getFileIcon } from "../drive.js"; 
// 🔥 GÜNCEL: lookupWrongRecord ve diğer fonksiyonlar eksiksiz import edildi
import { 
    removeQuestionFromBook, 
    addToWrongBookFromExam, 
    buildWrongOnlyParsed, 
    getSrsInfoForParsed, 
    lookupWrongRecord 
} from "../wrongBook.js";

export function createExamFlow(ctx) {
  const {
    state, timer, el, safeStyle, applyFocusMode,
    normalizeText, readFileAsText, parseExam, applyShuffle, formatTime,
    setStatus, showWarn, setLoading, openSummaryModal, closeSummaryModal, showToast,
    syncGlobals, persist, paintAll,
  } = ctx;

  // -------------------------------------------------------------------------
  // 1. DO PARSE: Dosyayı Okur, Ayrıştırır ve GEÇMİŞ HATALARI İŞLER
  // -------------------------------------------------------------------------
  async function doParse({ autoStartHint = true } = {}) {
    try {
      showWarn("");
      setStatus("okunuyor...");
      setLoading(true, "Ayrıştırılıyor…");

      const file = el("fileInput").files?.[0];
      const pasted = el("pasteArea").value;
      const text = file ? await readFileAsText(file) : pasted;
      
      if (!normalizeText(text)) throw new Error("Metin yok");

      // Dosya İkonunu Belirle
      let fileIcon = null;
      if (file) fileIcon = getFileIcon(file.type, file.name);
      else if (pasted) fileIcon = getFileIcon("text/plain", "paste.txt");

      state.rawText = text;
      state.shuffleQ = el("shuffleQ").checked;
      state.shuffleO = el("shuffleO").checked;

      // Ayrıştır
      const base = parseExam(text);
      state.parsed = applyShuffle(base, { shuffleQ: state.shuffleQ, shuffleO: state.shuffleO });

      // Meta Verileri
      state.parsed.meta = state.parsed.meta || {};
      if (fileIcon) state.parsed.meta.icon = fileIcon;

      // Key coverage
      const totalQ = state.parsed?.questions?.length || 0;
      const keyCount = state.parsed?.keyCount || 0;
      state.parsed.meta.keyCoverage = totalQ ? (keyCount / totalQ) : 0;
      if (!state.parsed.meta.keySource) state.parsed.meta.keySource = keyCount ? "doc" : "none";

      // 🔥🔥🔥 KRİTİK EKLENTİ: GEÇMİŞ HATALARI SORGU LA 🔥🔥🔥
      // Bu blok sayesinde normal bir sınav yüklesen bile, daha önce yanlış yaptığın
      // soruların üzerinde "X. Kez Yanlış" rozeti çıkar.
if (state.parsed.questions) {
  state.parsed.questions.forEach(q => {
    const rec = lookupWrongRecord(q);
    if (rec) {
      q._wrongCount = rec.wrongCount;
      q._hash = rec.realKey;     // ✅ ileride remove/graduation için
      q._wrongBlank = rec.blankCount || 0;
    } else {
      q._wrongCount = 0;
      q._hash = null;
    }
  });
}


      // 🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥

      state.mode = "prep";
      state.answers.clear();
      timer.stop();
      safeStyle("timer", (e) => (e.textContent = "--:--"));

      setStatus("hazır");
      syncGlobals();
      paintAll();
      persist();

      const as = el("autoStart");
      if (autoStartHint && as && as.checked) {
        startExam();
      } else {
        showToast?.({ title: "Hazır", msg: "Sınav ayrıştırıldı.", kind: "ok" });
      }
    } catch (e) {
      setStatus("hata");
      showWarn(e.message);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------------------
  // 2. START EXAM: Sınavı Başlatır
  // -------------------------------------------------------------------------
  function startExam({ resume = false } = {}) {
    if (!state.parsed) return;

    state.mode = "exam";
    state.lastActionAt = Date.now();

    if (!resume || !state.questionTimes) {
      state.questionTimes = new Map();
    }

    syncGlobals();
    if (!state.startedAt) state.startedAt = new Date().toISOString();

    state.durationSec = Number(el("durationMin").value) * 60;

    if (!resume) {
      state.timeLeftSec = state.durationSec;
    } else {
      if (state.timeLeftSec == null) state.timeLeftSec = state.durationSec;
    }

    timer.start(() => state.timeLeftSec, (v) => (state.timeLeftSec = v));

    const fm = el("focusMode");
    applyFocusMode(!!(fm && fm.checked));

    el("patiWidget")?.classList.add("mini");

    paintAll();
    persist();
  }

  // -------------------------------------------------------------------------
  // 3. FINISH EXAM: Puanlar, Kaydeder ve TEMİZLİK YAPAR
  // -------------------------------------------------------------------------
  function finishExam() {
    if (!state.parsed) return;
    
    state.mode = "result";
    
    // Studio Sync (Global değişken kontrolü)
    if (typeof window !== 'undefined' && window.parsedExam) {
        if (!state.parsed || state.parsed.questions.length !== window.parsedExam.questions.length) {
            state.parsed = window.parsedExam;
        }
    }

    syncGlobals();
    timer.stop();
    applyFocusMode(false);
    el("patiWidget")?.classList.remove("mini");

    state.srsReview = /Tekrar \(SRS\)/i.test(state.parsed.title || "");
    state.lastReviewId = state.srsReview ? new Date().toISOString() : null;

    // A. Normal Kayıt: Yanlışları Deftere Ekle
    addToWrongBookFromExam({
      parsed: state.parsed,
      answersMap: state.answers,
      questionTimes: state.questionTimes,
      reviewId: state.lastReviewId,
    });

    state.srsInfo = state.srsReview ? getSrsInfoForParsed(state.parsed) : {};

    // B. Smart Retry Logic: Temizlik & Kutlama
    // "Hataları Tekrarla" modunda mıyız?
    const isRetryMode = state.parsed.meta?.isSmartRetry === true;
    let graduatedCount = 0;

    const qs = state.parsed.questions || [];
    const keyMap = state.parsed.answerKey || {};
    let correct = 0, wrong = 0, blank = 0, keyedTotal = 0;

    // Helper Functions
    const norm = (v) => {
      if (!v) return [];
      if (typeof v === "string") return [v.trim().toUpperCase()];
      if (v instanceof Set) return Array.from(v).map(x => x.toUpperCase());
      return [];
    };
    const isEq = (a, b) => {
      if (a.length !== b.length) return false;
      const s = new Set(a);
      for (const x of b) if (!s.has(x)) return false;
      return true;
    };
    const resolveIds = (q, displayRaw) => {
      const letters = norm(displayRaw);
      if (!q.optionsByLetter) return letters; 
      return letters.map(L => {
        const opt = q.optionsByLetter[L];
        return opt ? (opt.id || L).toUpperCase() : L;
      });
    };

    // Puanlama Döngüsü
    for (const q of qs) {
      let rawKey = keyMap[q.n] || keyMap[String(q.n)] || q.answer || q.correctAnswer;
      // Tek soru varsa ve anahtar uyumsuzsa düzelt
      if (!rawKey && qs.length === 1 && Object.keys(keyMap).length === 1) {
          rawKey = Object.values(keyMap)[0];
      }

      if (!rawKey) continue; 
      keyedTotal++;

      let uRaw = state.answers instanceof Map ? state.answers.get(q.n) : state.answers[q.n];
      if(!uRaw && state.answers instanceof Map) uRaw = state.answers.get(String(q.n)) || state.answers.get(Number(q.n));

      const uArrIds = resolveIds(q, uRaw);
      const kArrIds = norm(rawKey);
      const isCorrect = isEq(kArrIds, uArrIds);

      if (uArrIds.length === 0) blank++;
      else if (isCorrect) {
          correct++;
          // 🔥 SİLME İŞLEMİ: Retry modundaysak ve doğruysa sil
          if (isRetryMode && q._hash) {
              const deleted = removeQuestionFromBook(q._hash);
              if (deleted) graduatedCount++;
          }
      }
      else wrong++;
    }

    const score = keyedTotal ? Math.round((correct / keyedTotal) * 100) : 0;
    state.examScore = { sum: correct, max: keyedTotal, pct: score };
    if (typeof window !== 'undefined') window.__EXAM_SCORE = state.examScore;

    const spent = state.durationSec - (state.timeLeftSec ?? state.durationSec);
    const timeSpent = formatTime(spent);

    paintAll();
    persist();

    // Kutlama: Konfeti ve Toast
    if (graduatedCount > 0) {
        setTimeout(() => {
            if (typeof confetti === 'function') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#a855f7', '#3b82f6', '#ffffff'] });
            }
            showToast?.({ 
                title: "Harikasın! 🎉", 
                msg: `${graduatedCount} soruyu Yanlış Defteri'nden sildik!`, 
                kind: "ok" 
            });
        }, 600);
    }

    // AI Butonlarını Ekle (Studio/Gemini)
    setTimeout(() => {
        const cards = document.querySelectorAll(".q-card, .question-card");
        cards.forEach(card => {
            const isWrong = card.classList.contains("wrong") || 
                            card.querySelector(".status-badge.wrong") || 
                            card.style.borderColor === "var(--danger)";
            
            if (!isWrong) return;

            const nRaw = card.getAttribute("data-n") || card.id.replace("q-", "");
            const n = Number(nRaw);
            if (!n) return;
            if (card.querySelector(".ai-btn-group")) return;

            const body = card.querySelector(".q-body") || card;
            const btnGroup = document.createElement("div");
            btnGroup.className = "ai-btn-group";
            btnGroup.style.marginTop = "15px";
            btnGroup.style.display = "flex";
            btnGroup.style.gap = "10px";
            btnGroup.style.flexWrap = "wrap";
            btnGroup.innerHTML = `
              <button onclick="window.runGeminiAnalysis(${n})" class="btn sm ghost" style="color:#a855f7; border:1px solid rgba(168,85,247,0.3); background:rgba(168,85,247,0.05);">🤖 Neden Yanlış?</button>
              <button onclick="window.runGeminiGenerator(${n})" class="btn sm ghost" style="color:#f59e0b; border:1px solid rgba(245,158,11,0.3); background:rgba(245,158,11,0.05);">✨ Benzer Soru Çöz</button>
            `;
            const box1 = document.createElement("div"); box1.id = `ai-box-${n}`; box1.className = "ai-box"; box1.style.display = "none"; box1.style.marginTop = "12px";
            const box2 = document.createElement("div"); box2.id = `ai-gen-box-${n}`; box2.className = "ai-box"; box2.style.display = "none"; box2.style.marginTop = "12px";
            body.appendChild(btnGroup);
            body.appendChild(box1);
            body.appendChild(box2);
        });
    }, 150);

    openSummaryModal?.({
      total: qs.length,
      answered: correct + wrong,
      correct, wrong, blank, score,
      keyMissing: (qs.length - keyedTotal),
      timeSpent,
      title: state.parsed.title,
      isAiKey: state.parsed?.meta?.keySource === "ai",
    });

    showToast?.({ title: "Bitti", msg: "Sınav tamamlandı.", kind: "ok" });
  }

  // -------------------------------------------------------------------------
  // 4. RESET ALL: Her Şeyi Sıfırla
  // -------------------------------------------------------------------------
  function resetAll() {
    timer.stop();
    applyFocusMode(false);
    closeSummaryModal?.();

    Object.assign(state, {
      rawText: "",
      parsed: null,
      mode: "prep",
      answers: new Map(),
      startedAt: null,
      timeLeftSec: null,
    });

    syncGlobals();
    if(el("fileInput")) el("fileInput").value = "";
    if(el("pasteArea")) el("pasteArea").value = "";
    setStatus("hazır");

    paintAll();
    persist();
  }

  return { doParse, startExam, finishExam, resetAll };
}