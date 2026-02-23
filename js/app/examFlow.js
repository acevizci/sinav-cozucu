// js/app/examFlow.js
// Exam lifecycle (parse/start/finish/reset) - V4 + Full Badge Integration

import { getFileIcon } from "../drive.js"; 
// 🔥 GÜNCEL: lookupWrongRecord ve diğer fonksiyonlar eksiksiz import edildi
import { 
    removeQuestionFromBook, 
    addToWrongBookFromExam, 
    addOpenEndedProToWrongBookFromExam,
    buildWrongOnlyParsed, 
    getSrsInfoForParsed, 
    lookupWrongRecord 
} from "../wrongBook.js";

import { adaptParsedToOpenEndedPro } from "../openEndedPro/openEndedProAdapter.js";

export function createExamFlow(ctx) {
  const {
    state, timer, el, safeStyle, applyFocusMode,
    normalizeText, readFileAsText, parseExam, applyShuffle, formatTime,
    setStatus, showWarn, setLoading, openSummaryModal, closeSummaryModal, showToast,
    syncGlobals, persist, paintAll,
  } = ctx;

  // -------------------------------------------------------------------------
  // THEMED CONFIRM (modalOverlay + modalCard)
  // -------------------------------------------------------------------------
  function themedConfirm({
    id = "customFinishModal",
    title = "Onay",
    message = "",
    confirmText = "Evet",
    cancelText = "Vazgeç",
    icon = "⚠️",
    danger = true,
  } = {}) {
    return new Promise((resolve) => {
      // Varsa açık kalan eski modalı temizle
      const old = document.getElementById(id);
      if (old) old.remove();

      const modal = document.createElement("div");
      modal.id = id;
      modal.className = "modalOverlay";
      modal.style.display = "flex";
      modal.style.zIndex = "100000";

      const okBtnStyle = danger
        ? "background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);"
        : "background: linear-gradient(135deg, rgba(168,85,247,0.95) 0%, rgba(59,130,246,0.95) 100%); box-shadow: 0 4px 12px rgba(168, 85, 247, 0.25);";

      modal.innerHTML = `
        <div class="modalCard" style="max-width: 420px; text-align: center; animation: popIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);">
          <div style="font-size: 42px; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(168,85,247,0.4));">${icon}</div>

          <h3 class="modalTitle" style="margin-bottom: 8px; font-size: 20px;">${title}</h3>

          <p class="modalSub" style="margin-bottom: 24px; line-height: 1.5; color: #a1a1aa; font-size: 14px;">
            ${message}
          </p>

          <div class="modalActions" style="justify-content: center; gap: 12px; width: 100%;">
            <button id="${id}__cancel" class="btn secondary"
              style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">
              ${cancelText}
            </button>

            <button id="${id}__ok" class="btn primary"
              style="flex:1; ${okBtnStyle}">
              ${confirmText}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const close = (val) => {
        modal.style.opacity = "0";
        setTimeout(() => {
          try { modal.remove(); } catch {}
          resolve(val);
        }, 160);
      };

      const okBtn = document.getElementById(`${id}__ok`);
      const cancelBtn = document.getElementById(`${id}__cancel`);

      if (okBtn) okBtn.onclick = () => close(true);
      if (cancelBtn) cancelBtn.onclick = () => close(false);

      // Dışarı tıklayınca kapatma (cancel)
      modal.onclick = (ev) => {
        if (ev.target === modal) close(false);
      };
    });
  }

  // -------------------------------------------------------------------------
  // 1. DO PARSE: Dosyayı Okur, Ayrıştırır ve GEÇMİŞ HATALARI İŞLER
  // -------------------------------------------------------------------------
  async function doParse({ autoStartHint = true } = {}) {
    try {
      showWarn("");
      setStatus({ id:"STATUS_READING" });
      setLoading(true, { id:"EXAM_PARSING_LOADING" });

      const file = el("fileInput").files?.[0];
      const pasted = el("pasteArea").value;
      const text = file ? await readFileAsText(file) : pasted;
      
      if (!normalizeText(text)) { showWarn({ id:"EXAM_NO_TEXT" }); return; }

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

      // ✅ Open-ended PRO adapter (parser'a dokunmadan)
      try {
        state.parsed = adaptParsedToOpenEndedPro(state.parsed, text);
      } catch (e) {
        console.warn("openEndedPro adapter failed", e);
      }

      // Meta Verileri
      state.parsed.meta = state.parsed.meta || {};
      if (fileIcon) state.parsed.meta.icon = fileIcon;

      // Stable-ish examId for linking generated practice sessions (per loaded exam)
      if (!state.parsed.meta.examId) {
        state.parsed.meta.examId = `exam_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      }

      // Key coverage
      const totalQ = state.parsed?.questions?.length || 0;
      const keyCount = state.parsed?.keyCount || 0;
      state.parsed.meta.keyCoverage = totalQ ? (keyCount / totalQ) : 0;
      if (!state.parsed.meta.keySource) state.parsed.meta.keySource = keyCount ? "doc" : "none";

      // ⚠️ Cevap anahtarı uyuşmazlığı: kullanıcıyı daha baştan bilgilendir.
      // Not: Değerlendirmede anahtarı olmayan sorular zaten dışarıda tutulur.
      const missingKeyCountOnLoad = Math.max(0, totalQ - keyCount);
      if (totalQ > 0 && missingKeyCountOnLoad > 0) {
        try {
          showToast?.({
            id: "ANSWERKEY_MISMATCH_ON_LOAD",
            vars: { missing: missingKeyCountOnLoad, keyed: keyCount, total: totalQ },
            kind: "warn",
            dedupeKey: "answerkey_mismatch_on_load",
            timeout: 4200,
          });
        } catch {}
      }

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

      state.mode = "prep";
      state.answers.clear();
      timer.stop();
      safeStyle("timer", (e) => (e.textContent = "--:--"));

      setStatus({ id:"STATUS_READY" });
      syncGlobals();
      paintAll();
      persist();

      const as = el("autoStart");
      if (autoStartHint && as && as.checked) {
        startExam();
      } else {
        showToast?.({ id:"EXAM_PARSED", kind:"ok" });
      }
    } catch (e) {
      setStatus({ id:"STATUS_ERROR" });
      showWarn(e);
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
  async function finishExam() {
    if (!state.parsed) return;

    // ✅ Bitirmeden önce "boş soru" kontrolü
    try {
      const qs0 = state.parsed?.questions || [];
      const blanks = [];

      const getAns = (n) => {
        if (state.answers instanceof Map) {
          return state.answers.get(n) ?? state.answers.get(String(n)) ?? state.answers.get(Number(n));
        }
        return state.answers?.[n] ?? state.answers?.[String(n)];
      };

      const hasAnswer = (v) => {
        if (v == null) return false;
        if (typeof v === "string") return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        if (v instanceof Set) return v.size > 0;
        if (typeof v === "object") return Object.keys(v).length > 0;
        return !!v;
      };

      for (const q of qs0) {
        const a = getAns(q?.n);
        if (!hasAnswer(a)) blanks.push(q?.n);
      }

      if (blanks.length > 0) {
        const preview = blanks.slice(0, 12).join(", ");
        const more = blanks.length > 12 ? ` … (+${blanks.length - 12})` : "";

        const ok = await themedConfirm({
          id: "customFinishBlankModal",
          title: "Boş soru var",
          message: `<b>${blanks.length}</b> soru boş bırakılmış görünüyor.<br/>
                    Boş sorular: <b>${preview}${more}</b><br/><br/>
                    Yine de sınavı bitirmek istediğinden emin misin?`,
          confirmText: "Evet, Bitir",
          cancelText: "Geri dön",
          icon: "⚠️",
          danger: true,
        });

        if (!ok) return; // kullanıcı geri döndü → bitirme iptal
      }
    } catch (e) {}

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

    // ---------------------------------------------------------------------
    // ✅ Pratik Modu: Open-ended PRO skorunu (bloklamadan) hesapla
    // ---------------------------------------------------------------------
    const getAns = (n) => {
      if (state.answers instanceof Map) {
        return state.answers.get(n) ?? state.answers.get(String(n)) ?? state.answers.get(Number(n));
      }
      return state.answers?.[n] ?? state.answers?.[String(n)];
    };

    const computeOpenEndedProAggregate = () => {
      const qs = state.parsed?.questions || [];
      const cards = [];
      let total = 0, graded = 0, pending = 0, blank = 0, error = 0;
      let sumPct = 0;
      const _metaCounts = new Map();
      let _lastMeta = null;

      for (const q of qs) {
        if (q?.kind !== "openEndedPro") continue;
        total += 1;

        const a = getAns(q.n);
        const parts = (a && typeof a === "object") ? (a.parts || null) : null;
        if (!parts || typeof parts !== "object") {
          pending += 1;
          cards.push({ n: q.n, score: null, status: "pending" });
          continue;
        }

        const partVals = Object.values(parts);
        const texts = partVals.map(p => (p?.text || "").trim());
        const hasText = texts.some(t => t.length > 0);

        const grades = partVals
          .map(p => p?.grade)
          .filter(g => g && Number.isFinite(Number(g.score)));

        if (!hasText) {
          blank += 1;
          cards.push({ n: q.n, score: null, status: "blank" });
          continue;
        }

        if (!grades.length) {
          // Cevap var ama puan yok: pending veya error ayrımı (minimum güvenli yaklaşım)
          // Eğer herhangi bir parça "error" bilgisi taşıyorsa error say.
          const hasErr = partVals.some(p => p?.gradeError || p?.error || p?.aiError);
          if (hasErr) error += 1;
          else pending += 1;
          cards.push({ n: q.n, score: null, status: hasErr ? "error" : "pending" });
          continue;
        }

        const avg = grades.reduce((s, g) => s + (Number(g.score) || 0), 0) / grades.length;
        const pct = Math.round(avg);
        const status = pct >= 80 ? "pass" : (pct >= 50 ? "partial" : "retry");
        graded += 1;
        sumPct += pct;
        cards.push({ n: q.n, score: pct, status });
      }

      if (!total) return null;

      const pct = graded ? Math.round(sumPct / graded) : null;
      const status = (graded === 0)
        ? (pending > 0 ? "pending" : (blank === total ? "none" : "pending"))
        : (pct >= 80 ? "pass" : (pct >= 50 ? "partial" : "retry"));

      let modelInfo = _lastMeta;
      if (_metaCounts.size) {
        let bestKey = null, bestN = -1;
        for (const [k,n] of _metaCounts.entries()) { if (n > bestN) { bestN = n; bestKey = k; } }
        if (bestKey) {
          const [provider, model, rubric] = String(bestKey).split('|');
          modelInfo = { provider: provider || '', model: model || '', rubric: rubric || '' };
        }
      }

      return {
        mode: "practice",
        pct,
        status,
        cards: { total, graded, pending, blank, error },
        modelInfo,
        perCard: cards,
        provisional: (pending > 0 || error > 0),
        updatedAt: Date.now(),
      };
    };

    state.openEndedScore = computeOpenEndedProAggregate();
    if (typeof window !== 'undefined') window.__OPEN_ENDED_SCORE = state.openEndedScore;

    // A. Normal Kayıt: (MCQ) Yanlışları Deftere Ekle
    addToWrongBookFromExam({
      parsed: state.parsed,
      answersMap: state.answers,
      questionTimes: state.questionTimes,
      reviewId: state.lastReviewId,
    });

    // ✅ Open-ended PRO (Pratik) → sadece "zayıf" olanları deftere ekle
    try {
      addOpenEndedProToWrongBookFromExam({ parsed: state.parsed, answersMap: state.answers, thresholdPct: 50 });
    } catch (e) {}

    state.srsInfo = state.srsReview ? getSrsInfoForParsed(state.parsed) : {};

    // B. Smart Retry Logic: Temizlik & Kutlama
    // "Hataları Tekrarla" modunda mıyız?
    const isRetryMode = state.parsed.meta?.isSmartRetry === true;
    let graduatedCount = 0;

    const qs = state.parsed.questions || [];
    const keyMap = state.parsed.answerKey || {};
    let correct = 0, wrong = 0, blank = 0, keyedTotal = 0;
    let missingKeyCount = 0;
    let extraKeyCount = 0;

    // Open-ended PRO aggregate artık computeOpenEndedProAggregate ile hesaplanıyor.

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

    // Anahtarın fazlalıklarını tespit et (soru numarasıyla eşleşmeyen key entry)
    const qNumSet = new Set(qs.map(q => String(q?.n)).filter(Boolean));
    extraKeyCount = Object.keys(keyMap || {}).filter(k => k && !qNumSet.has(String(k))).length;

    // Puanlama Döngüsü
    for (const q of qs) {
      // ✅ Open-ended PRO soruları MCQ puanlamasına dahil etme
      if (q?.kind === "openEndedPro") {
        continue;
      }

      let rawKey = keyMap[q.n] || keyMap[String(q.n)] || keyMap[Number(q.n)] || q.answer || q.correctAnswer || q.dogruCevap || q._answerFromSolution;
      // Tek soru varsa ve anahtar uyumsuzsa düzelt
      if (!rawKey && qs.length === 1 && Object.keys(keyMap).length === 1) {
          rawKey = Object.values(keyMap)[0];
      }

      // Anahtar yoksa bu soruyu değerlendirmeye dahil etmeyiz.
      if (!rawKey) { missingKeyCount++; continue; }
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

    // state.openEndedScore zaten hesaplandı (pratik modu). MCQ sonucu buna dokunmaz.

    const spent = state.durationSec - (state.timeLeftSec ?? state.durationSec);
    const timeSpent = formatTime(spent);

    paintAll();
    persist();

    // ⚠️ Anahtar uyuşmazlığı uyarısı: Anahtarı olmayan sorular değerlendirmeye alınmaz.
    // (Özellikle AI ile üretilen/eklenen sınavlarda kullanıcıya net bilgi vermek önemli.)
    if (missingKeyCount > 0) {
      showToast?.({
        id: "ANSWERKEY_MISSING_EXCLUDED",
        vars: { missing: missingKeyCount, total: qs.length, evaluated: keyedTotal },
        kind: "warn",
      });
    }
    if (extraKeyCount > 0) {
      showToast?.({
        id: "ANSWERKEY_EXTRA_IGNORED",
        vars: { extra: extraKeyCount },
        kind: "warn",
      });
    }

    // Kutlama: Konfeti ve Toast
    if (graduatedCount > 0) {
        setTimeout(() => {
            if (typeof confetti === 'function') {
                confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#a855f7', '#3b82f6', '#ffffff'] });
            }
            showToast?.({ id:"WRONGBOOK_GRADUATED", vars:{ count: graduatedCount }, kind:"ok" });
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

    // Generated practice bitiminde parent'a döneceğiz; ara summary açma.
    const isGeneratedPractice = (state.parsed?.meta?.generatedPractice === true);
    if (!isGeneratedPractice) {
      openSummaryModal?.({
        total: qs.length,
        answered: correct + wrong,
        correct, wrong, blank, score,
        keyMissing: (missingKeyCount || (qs.length - keyedTotal)),
        timeSpent,
        title: state.parsed.title,
        isAiKey: state.parsed?.meta?.keySource === "ai",
        openEndedScore: state.openEndedScore,
      });
    }

    // ✅ Generated practice completed: save as a separate session and return to parent exam summary
    if (state.parsed?.meta?.generatedPractice === true && state._parentSnapshot) {
      try {
        const answersObj = (() => {
          try {
            if (state.answers instanceof Map) {
              const o = {};
              for (const [k,v] of state.answers.entries()) o[String(k)] = v;
              return o;
            }
            return (state.answers && typeof state.answers === 'object') ? state.answers : {};
          } catch { return {}; }
        })();

        // Compute rubric averages for generated practice
        const computeRubricAvg = (obj) => {
          const sums = new Map();
          const counts = new Map();
          try {
            for (const n of Object.keys(obj||{})){
              const a = obj[n];
              if (!a || a.__type !== 'open-ended') continue;
              const parts = a.parts || {};
              for (const pk of Object.keys(parts)){
                const subs = parts[pk]?.grade?.subscores;
                if (!subs || typeof subs !== 'object') continue;
                for (const [k,v] of Object.entries(subs)){
                  const num = Number(v);
                  if (!Number.isFinite(num)) continue;
                  sums.set(k, (sums.get(k)||0) + num);
                  counts.set(k, (counts.get(k)||0) + 1);
                }
              }
            }
          } catch {}
          const out = {};
          for (const [k,sum] of sums.entries()){
            const c = counts.get(k)||0;
            if (c) out[k] = Math.round((sum / c) * 10) / 10;
          }
          return out;
        };

        const practiceRubric = computeRubricAvg(answersObj);
        const baselinePct = state.parsed?.meta?.baselinePct;
        const baselineRubric = state.parsed?.meta?.baselineRubricAvg || {};
        const newPct = (state.openEndedScore && typeof state.openEndedScore.pct === 'number') ? state.openEndedScore.pct : null;

        const rubricDelta = {};
        try {
          const keys = new Set([...(Object.keys(baselineRubric||{})), ...(Object.keys(practiceRubric||{}))]);
          for (const k of keys){
            const a = Number(baselineRubric?.[k]);
            const b = Number(practiceRubric?.[k]);
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            const d = Math.round((b - a) * 10) / 10;
            rubricDelta[k] = d;
          }
        } catch {}

        // Persist session (best-effort)
        try {
          const add = (window.__ACUMEN_SESSIONS_ADD || null);
          if (typeof add === 'function') {
            add({
              type: 'generated_practice',
              parentExamId: state.parsed?.meta?.parentExamId || null,
              parentExamTitle: state.parsed?.meta?.parentExamTitle || '',
              createdAt: state.parsed?.meta?.createdAt || null,
              finishedAt: new Date().toISOString(),
              title: state.parsed?.title || 'Gelişim Pratiği',
              generator: state.parsed?.meta?.generator || null,
              baseline: { pct: baselinePct ?? null, rubricAvg: baselineRubric || {} },
              result: { openEndedScore: state.openEndedScore || null, rubricAvg: practiceRubric || {} },
              delta: { pct: (newPct != null && baselinePct != null) ? (newPct - baselinePct) : null, rubricDelta },
              // minimal restore payload
              parsed: state.parsed,
              answers: answersObj,
            });
          }
        } catch {}

        // Restore parent snapshot
        const snap = state._parentSnapshot;
        state.rawText = snap.rawText || '';
        state.parsed = snap.parsed || null;
        state.answers = new Map(Object.entries(snap.answersObj || {}));
        state.questionTimes = new Map(snap.questionTimesArr || []);
        state.startedAt = snap.startedAt || null;
        state.durationSec = snap.durationSec || state.durationSec;
        state.timeLeftSec = snap.timeLeftSec;
        state.shuffleQ = !!snap.shuffleQ;
        state.shuffleO = !!snap.shuffleO;
        state.mode = snap.mode || 'exam';
        state.openEndedScore = snap.openEndedScore || state.openEndedScore;
        state.examScore = snap.examScore || state.examScore;

        // Attach delta for summary rendering
        state.lastPracticeDelta = {
          beforePct: (baselinePct != null ? Number(baselinePct) : null),
          afterPct: newPct,
          deltaPct: (newPct != null && baselinePct != null) ? (newPct - baselinePct) : null,
          rubricBefore: baselineRubric || {},
          rubricAfter: practiceRubric || {},
          rubricDelta,
          finishedAt: new Date().toISOString(),
        };

        // clear runtime link
        state._parentSnapshot = null;

        syncGlobals();
        paintAll();
        persist();

        // Re-open summary for parent exam (with delta card)
        const pqs = state.parsed?.questions || [];
        openSummaryModal?.({
          total: pqs.length,
          answered: (state.examScore?.sum != null && state.examScore?.max != null) ? (state.examScore.sum + (state.examScore.max - state.examScore.sum)) : (correct + wrong),
          correct: state.examScore?.sum ?? correct,
          wrong: (state.examScore?.max != null && state.examScore?.sum != null) ? (state.examScore.max - state.examScore.sum) : wrong,
          blank: blank,
          score: state.examScore?.pct ?? score,
          keyMissing: (missingKeyCount || (pqs.length - (state.examScore?.max ?? keyedTotal))),
          timeSpent,
          title: state.parsed?.title,
          isAiKey: state.parsed?.meta?.keySource === "ai",
          openEndedScore: state.openEndedScore,
          practiceDelta: state.lastPracticeDelta,
        });

        showToast?.({ id:"PRACTICE_FINISHED", kind:"ok", text:"Gelişim pratiği tamamlandı." });
        return;
      } catch (e) {
        console.error(e);
      }
    }

    showToast?.({ id:"EXAM_FINISHED", kind:"ok" });
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
    setStatus({ id:"STATUS_READY" });

    paintAll();
    persist();
  }

  return { doParse, startExam, finishExam, resetAll };
}
