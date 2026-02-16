// js/ui/ai.js - Gemini entegrasyonu + konu tamamlama (Final Full Version)

import { escapeHtml, loadWrongBook, saveWrongBook, wrongBookDashboard, makeKeyFromQuestion } from "./shared.js";
import { getChosenOptionId, UI_LETTERS } from "./shared.js";
import { showToast, setLoading, msg } from "./status.js";
import { refreshSubjectChips, refreshSubjectChart } from "./subjects.js";
import { appError } from "./uiAlert.js";

// =========================================================
// AI KEY HEALTH (Badge / Settings indicator)
// =========================================================
const AI_KEY_HEALTH_KEY = "GEMINI_KEY_HEALTH";      // ok | bad | unknown
const AI_KEY_HEALTH_TS  = "GEMINI_KEY_HEALTH_TS";

// NUDGE SNOOZE (when user clicks 'Sonra' / closes)
const AI_KEY_SNOOZE_UNTIL = "ACUMEN_AI_KEY_SNOOZE_UNTIL"; // epoch ms
   // epoch ms

function _setAiKeyHealth(state){
  try{
    if (!state) {
      localStorage.removeItem(AI_KEY_HEALTH_KEY);
      localStorage.removeItem(AI_KEY_HEALTH_TS);
      return;
    }
    localStorage.setItem(AI_KEY_HEALTH_KEY, state);
    localStorage.setItem(AI_KEY_HEALTH_TS, String(Date.now()));
  }catch{}
}

export function updateAiKeyBadges(){
  try{
    const badge = document.getElementById("aiReadyBadge");
    const pill  = document.getElementById("aiKeyStatusPill");
    const dot   = document.getElementById("aiKeyStatusDot");

    const key = (localStorage.getItem("GEMINI_KEY") || "").trim();
    const health = (localStorage.getItem(AI_KEY_HEALTH_KEY) || "").trim();
    const ts = Number(localStorage.getItem(AI_KEY_HEALTH_TS) || "0") || 0;
    const ageMin = ts ? Math.round((Date.now() - ts) / 60000) : 0;

    // Quick badge near AI actions
    if (badge) {
      badge.style.display = (key && health === "ok") ? "inline-flex" : "none";
      badge.textContent = "✅ AI hazır";
    }

    // Modal status pill
    if (pill || dot) {
      const show = !!(pill || dot);
      if (pill) pill.style.display = show ? "inline-flex" : "none";
      if (dot) dot.style.display = show ? "inline-block" : "none";

      let text = "Durum: —";
      let color = "rgba(255,255,255,0.35)";

      if (!key) {
        text = "Durum: Anahtar girilmedi";
        color = "rgba(245,158,11,0.55)";
      } else if (health === "ok") {
        text = `Durum: Doğrulandı${ageMin ? ` • ${ageMin} dk önce` : ""}`;
        color = "rgba(72,187,120,0.75)";
      } else if (health === "bad") {
        text = "Durum: Geçersiz anahtar";
        color = "rgba(239,68,68,0.75)";
      } else if (health === "unknown") {
        text = "Durum: Kontrol edilemedi";
        color = "rgba(245,158,11,0.55)";
      } else {
        text = "Durum: Bilinmiyor";
        color = "rgba(255,255,255,0.35)";
      }

      if (pill) pill.textContent = text;
      if (dot) dot.style.background = color;
    }
  }catch{}
// =========================================================
// AI BUTTON LOCKS (when key missing / invalid)
// =========================================================
let _aiLockBound = false;

function applyAiLocks({ key, health }) {
  const needKey = !key;
  const badKey  = !!key && health === "bad";

  const lockReason = needKey ? msg("AI_KEY_REQUIRED_SHORT") : (badKey ? msg("AI_KEY_INVALID_SHORT") : "");

  const targets = [
    { id: "btnAiSolve", wrapId: "aiSolveWrap" },
    { id: "btnAiSubjects", wrapId: null },
  ];

  targets.forEach(t => {
    const btn = document.getElementById(t.id);
    if (!btn) return;

    const locked = needKey || badKey;
    btn.disabled = locked;
    btn.classList.toggle("ai-locked", locked);
    btn.setAttribute("aria-disabled", locked ? "true" : "false");
    btn.setAttribute("data-lock-reason", locked ? lockReason : "");
    btn.title = locked ? lockReason : "";

    // show small lock icon inside button if possible
    if (locked) {
      if (!btn.querySelector(".ai-lock-ico")) {
        const s = document.createElement("span");
        s.className = "ai-lock-ico";
        s.textContent = "🔒";
        s.style.cssText = "margin-left:8px; opacity:.8;";
        btn.appendChild(s);
      }
    } else {
      const s = btn.querySelector(".ai-lock-ico");
      if (s) s.remove();
    }
  });

  if (!_aiLockBound) bindAiLockClicks();
}

function bindAiLockClicks() {
  _aiLockBound = true;

  const openKey = async () => {
    const existing = (localStorage.getItem("GEMINI_KEY") || "").trim();
    // If already there but invalid, still open modal to change
    const k = await requestApiKeyFromModal();
    if (k) {
      localStorage.setItem("GEMINI_KEY", String(k).trim());
      _setAiKeyHealth("unknown"); // will be validated on save inside modal flow
      try { updateAiKeyBadges(); } catch {}
      try { showToast?.({ id: "AI_KEY_SAVED", kind: "ok" }); } catch {}
    }
  };

  ["btnAiSolve", "btnAiSubjects"].forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", (ev) => {
      const locked = btn.classList.contains("ai-locked") || btn.disabled;
      if (!locked) return;
      ev.preventDefault();
      ev.stopPropagation();
      try { showToast?.({ id: "AI_KEY_REQUIRED", kind: "warn" }); } catch {}
      openKey();
    }, true);
  });
}


}

// =========================================================
// 1. API KEY MODAL
// =========================================================
function requestApiKeyFromModal() {
  return new Promise((resolve) => {

    // 🔥 KRİTİK: Modal açılacağı zaman "Yükleniyor..." perdesini kaldır
    try { setLoading(false); } catch {}

    const modal   = document.getElementById("apiKeyModal");
    const input   = document.getElementById("inpApiKeyUi");
    const errorBox= document.getElementById("keyErrorUi");
    const btnSave = document.getElementById("btnSaveKeyUi");
    const btnCancel = document.getElementById("btnCancelKeyUi");

    // HTML'de modal yoksa kullanıcıyı prompt ile sıkıştırmayalım; tek merkez UI mesajı göster.
    if (!modal || !input || !btnSave || !btnCancel) {
      try { window.showWarn?.({ id: "AI_KEY_MODAL_MISSING" }); } catch {}
      resolve(null);
      return;
    }

    // Temizlik
    btnSave.onclick = null;
    btnCancel.onclick = null;
    input.onkeydown = null;
    input.oninput = null;

    // Modalı Aç
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    // Status pill + badge update (shows current state if key exists)
    try { updateAiKeyBadges(); } catch {}
    input.value = "";
    input.style.borderColor = "#444";
    if (errorBox) errorBox.style.display = "none";

    setTimeout(() => { try { input.focus(); } catch {} }, 0);

    let finished = false;

    // Gemini API key doğrulama (AI Studio key)
    async function validateGeminiKey(apiKey) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (!res.ok) return false;
        const data = await res.json().catch(() => ({}));
        const models = Array.isArray(data.models) ? data.models : [];
        // generateContent destekli en az 1 model olmalı
        const has = models.some(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes("generateContent"));
        return !!has;
      } catch {
        // network error etc.
        throw appError("NETWORK_ERROR");
      }
    }


    const cleanup = () => {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      btnSave.onclick = null;
      btnCancel.onclick = null;
      input.onkeydown = null;
      input.oninput = null;
      modal.removeEventListener("click", handleOverlayClick);
      try { updateAiKeyBadges(); } catch {}
    };

    const handleSave = async () => {
      if (finished) return;
      const val = String(input.value || "").trim();

      // Basic format guard (fast)
      if (!(val.length > 20 && val.startsWith("AIza"))) {
        if (errorBox) {
          errorBox.textContent = msg("AI_KEY_INVALID");
          errorBox.style.display = "block";
        }
        input.style.borderColor = "#ff453a";
        return;
      }

      // Live validation (pro UX)
      try {
        btnSave.disabled = true;
        btnSave.style.opacity = "0.7";
        if (errorBox) {
          errorBox.textContent = msg("AI_KEY_VALIDATING");
          errorBox.style.display = "block";
        }

        const ok = await validateGeminiKey(val);

        if (ok === true) {
          _setAiKeyHealth("ok");
          try { showToast({ id: "AI_KEY_VALID", kind: "ok" }); } catch {}
          finished = true;
          cleanup();
          resolve(val);
          try { updateAiKeyBadges(); } catch {}
          return;
        }

        // Explicit invalid key (400/401)
        _setAiKeyHealth("bad");
        if (errorBox) {
          errorBox.textContent = msg("AI_KEY_INVALID_SERVER");
          errorBox.style.display = "block";
        }
        input.style.borderColor = "#ff453a";
        try { updateAiKeyBadges(); } catch {}
      }
  catch (e) {
    try { window.__acumenKeyPrompting = false; } catch {}
        // Network / CORS / transient: allow save but warn
        _setAiKeyHealth("unknown");
        try { showToast({ id: "AI_KEY_VALIDATE_NET_FAIL", kind: "warn" }); } catch {}
        finished = true;
        cleanup();
        resolve(val);
        try { updateAiKeyBadges(); } catch {}
      } finally {
        btnSave.disabled = false;
        btnSave.style.opacity = "";
      }
    };

    const handleCancel = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(null);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter") { e.preventDefault(); handleSave(); }
      if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
    };

    const handleInput = () => {
      input.style.borderColor = "#444";
      if (errorBox) errorBox.style.display = "none";
    };

    const handleOverlayClick = (e) => {
      if (e.target === modal) handleCancel();
    };

    // Eventleri Bağla
    btnSave.onclick = handleSave;
    btnCancel.onclick = handleCancel;
    input.onkeydown = handleKeyDown;
    input.oninput = handleInput;
    modal.addEventListener("click", handleOverlayClick);
  });
}

// =========================================================
// 2. GEMINI API CALLER
// =========================================================
async function callGeminiApi(apiKey, promptText, onSuccess, onError) {
  try {
    let selectedModel = "models/gemini-1.5-flash"; 
    try {
        const listReq = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if(listReq.ok) {
            const listData = await listReq.json();
            const viableModels = (listData.models || []).filter(m => 
                m.supportedGenerationMethods && 
                m.supportedGenerationMethods.includes("generateContent")
            );
            // Flash > Pro sıralaması
            const bestModel = viableModels.find(m => m.name.includes("flash")) || 
                              viableModels.find(m => m.name.includes("pro")) ||
                              viableModels[0];
            if (bestModel) selectedModel = bestModel.name;
        }
    } catch (e) {
        console.warn("Model listesi alınamadı, varsayılan kullanılıyor:", e);
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw appError("ERR_GEMINI_API", { details: errData.error?.message || response.statusText });
    }

    const data = await response.json();
    if(!data.candidates || data.candidates.length === 0) {
        throw appError("ERR_MODEL_BOS_CEVAP_DONDURDU");
    }
    
    onSuccess(data.candidates[0].content.parts[0].text);

  } catch (err) {
    console.error("Gemini Hatası:", err);
    onError(err);
  }
}

function renderGeminiError(container, err) {
  container.innerHTML = `
    <div style="color:#ef4444; font-size:12px; border:1px solid #ef4444; padding:8px; border-radius:6px; background:rgba(239,68,68,0.1);">
      <strong>⚠️ Hata:</strong> ${err.message}<br><br>
      <button id="btnResetGeminiKey" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
        Anahtarı Sil ve Tekrar Dene
      </button>
    </div>
  `;

  try{
    const btn = container.querySelector("#btnResetGeminiKey");
    if (btn) {
      btn.onclick = () => {
        try { localStorage.removeItem("GEMINI_KEY"); } catch {}
        try { _setAiKeyHealth(null); } catch {}
        try { updateAiKeyBadges(); } catch {}
        container.innerHTML = "Anahtar silindi. Tekrar deneyin.";
      };
    }
  }catch{}
}

// =========================================================
// 3. CEVAP ANAHTARI OLUŞTURUCU (FIXED: Loading)
// =========================================================
export async function generateAnswerKeyWithGemini(parsed, { limit=80, batchSize=10 } = {}) {
  
  // 🔥 FIX: İşlem başlar başlamaz loading'i aç (API key olsa bile)
  setLoading(true, { id:"AI_KEY_LOADING" });

  if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
    setLoading(false);
    throw appError("ERR_AI_ANAHTAR_URETIMI_ICIN_SORU_BULUNAM");
  }

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    // Modal açılırken loading kapanır (requestApiKeyFromModal içinde)
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) {
      setLoading(false); // İptal edilirse loading'i tamamen kapat
      throw appError("ERR_GEMINI_API_ANAHTARI_GIRILMEDI_2");
    }
    localStorage.setItem("GEMINI_KEY", apiKey);
    try { updateAiKeyBadges(); } catch {}
    
    // Anahtar alındıktan sonra loading'i TEKRAR aç
    setLoading(true, { id:"AI_KEY_LOADING" });
  }

  const qList = parsed.questions.slice(0, Math.max(1, limit));
  const outKey = {};

  const call = (promptText) => new Promise((resolve, reject) => {
    callGeminiApi(apiKey, promptText, resolve, reject);
  });

  const buildPrompt = (batch) => {
    const items = batch.map(q => {
      const A = q.optionsByLetter?.A?.text || "";
      const B = q.optionsByLetter?.B?.text || "";
      const C = q.optionsByLetter?.C?.text || "";
      const D = q.optionsByLetter?.D?.text || "";
      const E = q.optionsByLetter?.E?.text || "";
      const F = q.optionsByLetter?.F?.text || "";
      return {
        n: q.n,
        text: (q.text || "").slice(0, 1200),
        options: {
          A: String(A).slice(0, 600),
          B: String(B).slice(0, 600),
          C: String(C).slice(0, 600),
          D: String(D).slice(0, 600),
          E: String(E).slice(0, 600),
          F: String(F).slice(0, 600),
        }
      };
    });

    return [
      `Sen çoktan seçmeli sınav çözücüsün.`,
      `Her soru için yalnızca A/B/C/D/E/F harfi döndür.`,
      `Emin değilsen null döndür (uydurma).`,
      `ÇIKTI SADECE JSON olacak. Açıklama yazma.`,
      `Beklenen format: {"1":"B","2":null,"3":"D"} (anahtarlar soru numarası, değerler A-F veya null)`,
      `Sorular:`,
      JSON.stringify(items, null, 2)
    ].join("\n");
  };

  try {
    for (let i = 0; i < qList.length; i += batchSize) {
      const batch = qList.slice(i, i + batchSize);
      
      // Kullanıcıya ilerleme durumu göster
      setLoading(true, { id:"AI_KEY_PROGRESS", vars:{ pct: Math.round((i / qList.length) * 100) } });

      const promptText = buildPrompt(batch);
      const raw = await call(promptText);

      const cleaned = String(raw || "")
        .replace(/^```(?:json)?/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      let obj;
      try { obj = JSON.parse(cleaned); }
      catch {
        const m = cleaned.match(/\{[\s\S]*\}/);
        if (!m) throw appError("ERR_AI_CIKTISI_JSON_DEGIL");
        obj = JSON.parse(m[0]);
      }

      for (const q of batch) {
        const v = obj?.[String(q.n)] ?? obj?.[q.n];
        if (!v) continue;
        const letter = String(v).trim().toUpperCase();
        
        if (!UI_LETTERS.includes(letter)) continue;
        if (!q.optionsByLetter || !(letter in q.optionsByLetter)) continue;

        const optId = (q.optionsByLetter?.[letter]?.id || "").toUpperCase();
        if (optId) outKey[q.n] = optId;
      }
    }
  } catch (error) {
    setLoading(false); // Hata durumunda loading'i kapat
    throw error;
  }
  
  // Not: Başarı durumunda loading'i çağıran fonksiyon kapatacak (genelde ui.js)
  return outKey;
}

// =========================================================
// 4. SORU ANALİZİ (Neden/Nasıl)
// =========================================================
export async function runGeminiAnalysis(qN) {
  const box = document.getElementById(`ai-box-${qN}`);
  if (!box) return;

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) return;
    localStorage.setItem("GEMINI_KEY", apiKey);
  }

  box.style.display = "block";
  box.innerHTML = `<div class="ai-loading" style="color:#a855f7">✨ Gemini soruyu inceliyor...</div>`;

  const state = window.__APP_STATE;
  if (!state || !state.parsed) {
    box.innerHTML = "<span style='color:red'>Hata: Veri yok.</span>";
    return;
  }

  const q = state.parsed.questions.find(x => x.n === qN);
  if (!q) {
    box.innerHTML = "<span style='color:red'>Hata: Soru bulunamadı.</span>";
    return;
  }

  const correctIdRaw = state.parsed.answerKey?.[qN];
  const correctIds = new Set(String(correctIdRaw || "").toUpperCase().match(/[A-F]/g) || []);

  const correctPairs = [];
  if (correctIds.size && q.optionsByLetter) {
    for (const [L, opt] of Object.entries(q.optionsByLetter)) {
      const oid = String(opt?.id || "").toUpperCase();
      if (oid && correctIds.has(oid)) {
        correctPairs.push({ letter: L, text: opt?.text ?? "Belirtilmemiş" });
      }
    }
  }

  const isMulti = correctPairs.length > 1 || correctIds.size > 1;
  const correctBlock = correctPairs.length
    ? correctPairs.map(x => `(${x.letter}) ${x.text}`).join("\n")
    : "(?) Belirtilmemiş";

  const aiPrompt = `
Öğretmen gibi davran. Aşağıdaki test sorusunu analiz et.
SORU: ${q.text}
DOĞRU CEVAP${isMulti ? "LAR" : ""}: ${isMulti ? "\n" : ""}${correctBlock}
GÖREV:
1. Doğru cevabın/cevapların neden doğru olduğunu açıkla.
2. Çeldiricilerin neden yanlış olduğunu kısaca belirt.
3. Kısa ve samimi ol. Türkçe cevap ver.
  `.trim();

  const safeFormat = (rawText) => {
    const esc = escapeHtml(String(rawText || ""));
    return esc.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
  };

  await callGeminiApi(
    apiKey,
    aiPrompt,
    (text) => {
      const formatted = safeFormat(text);
      box.innerHTML = `<strong>🤖 Gemini Açıklaması:</strong><br><br>${formatted}`;
      try {
        const book = loadWrongBook() || {};
        const key = makeKeyFromQuestion(q);
        if (!book[key]) book[key] = { q: { ...q } };
        book[key].q.analysis = String(text || "");
        saveWrongBook(book);
      } catch (e) { console.error("❌ Kayıt hatası:", e); }
    },
    (err) => { renderGeminiError(box, err); }
  );
}

// =========================================================
// 5. BENZER SORU ÜRETİCİ
// =========================================================
export async function runGeminiGenerator(qN) {
  const box = document.getElementById(`ai-gen-box-${qN}`);
  if (!box) return;

  const state = window.__APP_STATE;
  const q = state?.parsed?.questions?.find?.(x => x.n === qN);
  if (!q) {
    box.style.display = "block";
    box.innerHTML = `<div style="color:#ef4444">Soru bulunamadı.</div>`;
    return;
  }

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) return;
    localStorage.setItem("GEMINI_KEY", apiKey);
  }

  box.style.display = "block";
  box.innerHTML = `<div class="ai-loading" style="color:#f59e0b">♻️ Yapay zeka benzer bir soru üretiyor...</div>`;

  const optA = String(q?.optionsByLetter?.A?.text || "");
  const optB = String(q?.optionsByLetter?.B?.text || "");
  const optC = String(q?.optionsByLetter?.C?.text || "");
  const optD = String(q?.optionsByLetter?.D?.text || "");
  const optE = String(q?.optionsByLetter?.E?.text || "");
  const optF = String(q?.optionsByLetter?.F?.text || "");

  const aiPrompt = `
Sen profesyonel bir soru yazarısın. Aşağıdaki soruya BENZER mantıkta YENİ bir soru üret.
REFERANS SORU: ${q.text}
REFERANS ŞIKLAR: A) ${optA} B) ${optB} C) ${optC} D) ${optD} E) ${optE} F) ${optF}
ÇIKTI FORMATI (Sadece saf JSON):
{
  "question": "Soru metni",
  "options": {"A": "...", "B": "...", "C": "...", "D": "...", "E": "...", "F": "..."},
  "correct": "A",
  "explanation": "Açıklama"
}
  `.trim();

  const cleanJson = (text) => {
    const s = String(text || "").trim().replace(/^```(?:json)?/i, "").replace(/```\s*$/i, "").trim();
    try { return JSON.parse(s); } catch {}
    const m = s.match(/\{[\s\S]*\}/);
    if (!m) throw appError("ERR_JSON_BULUNAMADI");
    return JSON.parse(m[0]);
  };

  await callGeminiApi(
    apiKey,
    aiPrompt,
    (text) => {
      try {
        const data = cleanJson(text);
        if (!data || !data.question || !data.options || !data.correct) {
          box.innerHTML = `<div style="color:#ef4444">AI format hatası. Tekrar dene.</div>`;
          return;
        }
        data.correct = String(data.correct).trim().toUpperCase();
        renderChallengeBox(box, data);
      } catch (e) {
        console.error(e);
        box.innerHTML = `<div style="color:#ef4444">Hata oluştu.</div>`;
      }
    },
    (err) => { renderGeminiError(box, err); }
  );
}

function renderChallengeBox(container, data) {
  const expId = `exp-${Math.random().toString(36).slice(2, 11)}`;
  container.innerHTML = `
    <div class="ai-challenge-header">🤖 AI Meydan Okuması</div>
    <div class="ai-new-q-text">${escapeHtml(data.question)}</div>
    <div class="ai-opts-area"></div>
    <div class="ai-explanation" id="${expId}" style="display:none">${escapeHtml(data.explanation || "")}</div>
  `;
  const optsArea = container.querySelector(".ai-opts-area");
  const expBox = container.querySelector(`#${expId}`);
  const order = Object.keys(data.options || {}).map(x => String(x).toUpperCase()).filter(x => /^[A-F]$/.test(x)).sort();
  const correct = String(data.correct || "").trim().toUpperCase();

  order.forEach(letter => {
    if (!(letter in data.options)) return;
    const btn = document.createElement("button");
    btn.className = "ai-opt-btn";
    btn.innerHTML = `<b>${letter})</b> ${escapeHtml(data.options[letter])}`;
    btn.onclick = () => {
      const allBtns = optsArea.querySelectorAll(".ai-opt-btn");
      allBtns.forEach(b => b.classList.add("disabled"));
      if (letter === correct) {
        btn.classList.add("correct");
        showToast?.({ id:"AI_CORRECT", kind:"ok" });
      } else {
        btn.classList.add("wrong");
        allBtns.forEach(b => {
          if (b.innerHTML.includes(`<b>${correct})</b>`)) b.classList.add("correct");
        });
        showToast?.({ id:"AI_WRONG_MARKED", kind:"warn" });
      }
      if (expBox) expBox.style.display = "block";
    };
    optsArea.appendChild(btn);
  });
}

// =========================================================
// 6. KONU TAMAMLAMA VE CACHE
// =========================================================

const SUBJECT_CACHE_KEY = "SUBJECT_CACHE_V1"; 

function _djb2Hash(str){ 
  let h = 5381; 
  for (let i=0; i<str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i); 
  }
  return (h >>> 0).toString(16); 
}

function _qFingerprint(q){ 
  const parts = [
    String(q?.text || "").slice(0, 1600),
    "||",
    "A:", String(q?.optionsByLetter?.A?.text || "").slice(0, 400),
    "B:", String(q?.optionsByLetter?.B?.text || "").slice(0, 400),
    "C:", String(q?.optionsByLetter?.C?.text || "").slice(0, 400),
    "D:", String(q?.optionsByLetter?.D?.text || "").slice(0, 400),
    "E:", String(q?.optionsByLetter?.E?.text || "").slice(0, 400),
    "F:", String(q?.optionsByLetter?.F?.text || "").slice(0, 400)
  ].join("\n");
  return _djb2Hash(parts); 
}

function _escapeHtml(s){ 
  return String(s ?? "")
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;")
    .replace(/'/g,"&#39;"); 
}

function _escapeAttr(s){ 
  return _escapeHtml(s).replace(/`/g,"&#96;"); 
}

function _loadSubjectCache(){ 
  try { return JSON.parse(localStorage.getItem(SUBJECT_CACHE_KEY) || "{}"); } catch { return {}; } 
}

function _saveSubjectCache(cache){ 
  try { localStorage.setItem(SUBJECT_CACHE_KEY, JSON.stringify(cache || {})); } catch {} 
}

function _backfillWrongBookSubjectsFromCache(parsed){
  try{
    const cache = _loadSubjectCache();
    const book = loadWrongBook();
    let changed = 0;
    
    for (const k of Object.keys(book || {})){
      const rec = book[k];
      const q = rec?.q;
      if (!q) continue;
      const cur = (q.subject != null) ? String(q.subject).trim() : "";
      if (cur && cur !== "Genel") continue;
      
      const fp = _qFingerprint({ text: q.text, optionsByLetter: q.optionsByLetter });
      const cached = cache?.[fp]?.subject ? String(cache[fp].subject).trim() : "";
      
      let fromParsed = "";
      if (!cached && parsed?.questions?.length){
        for (const pq of parsed.questions){
          const pfp = _qFingerprint(pq);
          if (pfp === fp){ fromParsed = getQuestionSubject(pq); break; }
        }
      }
      
      const next = cached || fromParsed || "";
      if (next && next !== cur){ 
        q.subject = next; 
        rec.q = q; 
        changed++; 
      }
    }
    
    if (changed) saveWrongBook(book);
    return changed;
  } catch { return 0; }
}

function _ensureAiSubjectModal(){
  let modal = document.getElementById("aiSubjectModal");
  if (modal) return modal;
  
  modal = document.createElement("div");
  modal.id = "aiSubjectModal";
  modal.className = "modalOverlay";
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
  
  modal.innerHTML = `
    <div class="modalCard" style="max-width:760px; width:min(760px, 92vw);">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div style="font-weight:700; font-size:16px;">🤖 AI ile Konuları Tamamla</div>
          <div id="aiSubStatus" style="color:#8e8e93; font-size:12px; margin-top:4px;">Hazır.</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btnAiSubCancel" class="btn ghost">Durdur</button>
          <button id="btnAiSubClose" class="btn">Kapat</button>
        </div>
      </div>
      <div style="margin-top:12px;">
        <div style="height:10px; background:#1c1c1e; border:1px solid #2c2c2e; border-radius:999px; overflow:hidden;">
          <div id="aiSubBar" style="height:100%; width:0%; background:#0a84ff;"></div>
        </div>
        <div style="display:flex; gap:12px; margin-top:8px; flex-wrap:wrap; color:#8e8e93; font-size:12px;">
          <div>Toplam: <b id="aiSubTotal">0</b></div>
          <div>İşlenen: <b id="aiSubDone">0</b></div>
          <div>Uygulanan: <b id="aiSubApplied">0</b></div>
          <div>Öneri: <b id="aiSubSuggest">0</b></div>
        </div>
      </div>
      <div id="aiSubSuggestWrap" style="margin-top:14px; display:none;">
        <div style="font-weight:600; margin-bottom:6px;">Öneriler (düşük güven)</div>
        <div style="color:#8e8e93; font-size:12px; margin-bottom:8px;">
          Bunlar otomatik uygulanmadı. İstersen tek tek uygula veya düzenle.
        </div>
        <div id="aiSubSuggestList" style="display:flex; flex-direction:column; gap:10px; max-height:44vh; overflow:auto; padding-right:4px;"></div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  const btnClose = modal.querySelector("#btnAiSubClose");
  if (btnClose) btnClose.addEventListener("click", () => {
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
  });
  
  return modal;
}

function _openAiSubjectModal(){
  const modal = _ensureAiSubjectModal();
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  return modal;
}

function _updateAiSubjectModal({ total=0, done=0, applied=0, suggested=0, status="" } = {}){
  const modal = _ensureAiSubjectModal();
  const pct = total ? Math.max(0, Math.min(100, Math.round((done/total)*100))) : 0;
  
  const s = modal.querySelector("#aiSubStatus");
  const bar = modal.querySelector("#aiSubBar");
  const t = modal.querySelector("#aiSubTotal");
  const d = modal.querySelector("#aiSubDone");
  const a = modal.querySelector("#aiSubApplied");
  const sug = modal.querySelector("#aiSubSuggest");
  
  const cancelBtn = modal.querySelector("#btnAiSubCancel");
  if (cancelBtn){
    const finished = (total > 0 && done >= total);
    cancelBtn.style.display = finished ? "none" : "inline-flex";
    cancelBtn.disabled = finished;
  }
  
  if (s) s.textContent = status || "—";
  if (bar) bar.style.width = pct + "%";
  if (t) t.textContent = String(total);
  if (d) d.textContent = String(done);
  if (a) a.textContent = String(applied);
  if (sug) sug.textContent = String(suggested);
}

function _renderSubjectSuggestions(items, onApply){
  const modal = _ensureAiSubjectModal();
  const wrap = modal.querySelector("#aiSubSuggestWrap");
  const list = modal.querySelector("#aiSubSuggestList");
  if (!wrap || !list) return;
  
  if (!items || !items.length){
    wrap.style.display = "none";
    list.innerHTML = "";
    return;
  }
  
  wrap.style.display = "block";
  list.innerHTML = "";
  
  for (const it of items){
    const row = document.createElement("div");
    row.style.border = "1px solid #2c2c2e";
    row.style.borderRadius = "10px";
    row.style.padding = "10px";
    row.style.background = "#141416";
    
    const qTitle = `Soru ${it.n}`;
    const confPct = Math.round((it.confidence || 0) * 100);
    const snippetRaw = String(it.text || "").replace(/\s+/g," ").slice(0, 120);
    const snippet = _escapeHtml(snippetRaw);
    const subjVal = _escapeAttr(it.subject || "");
    
    row.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="font-weight:600;">${qTitle}</div>
        <div style="color:#8e8e93; font-size:12px;">Güven: ${confPct}%</div>
      </div>
      <div style="color:#8e8e93; font-size:12px; margin-top:6px;">${snippet}${snippetRaw.length>=120?"…":""}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap;">
        <input class="aiSubInp" value="${subjVal}" style="flex:1; min-width:180px; background:#0f0f10; border:1px solid #2c2c2e; color:#e5e5ea; border-radius:8px; padding:8px;" />
        <button class="btn aiSubApply">Uygula</button>
        <button class="btn ghost aiSubIgnore">Yoksay</button>
      </div>
    `;
    
    const inp = row.querySelector(".aiSubInp");
    const btnApply = row.querySelector(".aiSubApply");
    const btnIgnore = row.querySelector(".aiSubIgnore");
    
    if (btnApply){
      btnApply.addEventListener("click", () => {
        const val = inp ? String(inp.value || "").trim() : "";
        if (!val) { showToast({ id:"AI_SUBJECT_EMPTY", kind:"warn" }); return; }
        onApply?.({ n: it.n, subject: val });
        row.style.opacity = "0.55";
        btnApply.disabled = true;
        if (btnIgnore) btnIgnore.disabled = true;
      });
    }
    
    if (btnIgnore){
      btnIgnore.addEventListener("click", () => { row.remove(); });
    }
    
    list.appendChild(row);
  }
}

export async function fillMissingSubjectsWithGemini(parsed, {
  batchSize = 12,
  confidenceThreshold = 0.78,
  limit = 500
} = {}) {
  
  if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
    throw appError("ERR_AI_KONU_TAMAMLAMAK_ICIN_SORU_BULUNAM");
  }

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) throw appError("ERR_GEMINI_API_ANAHTARI_GIRILMEDI_2");
    localStorage.setItem("GEMINI_KEY", apiKey);
  }

  const modal = _openAiSubjectModal();

  let cancelled = false;
  const btnCancel = modal.querySelector("#btnAiSubCancel");
  if (btnCancel){
    btnCancel.disabled = false;
    btnCancel.textContent = "Durdur";
    btnCancel.onclick = () => { cancelled = true; btnCancel.disabled = true; btnCancel.textContent = "Durduruldu"; };
  }

  const all = parsed.questions
    .filter(q => q && ((q.subject == null) || (String(q.subject).trim() === "") || (String(q.subject).trim() === "Genel")))
    .slice(0, Math.max(1, limit));

  const total = all.length;
  let done = 0;
  let applied = 0;
  let suggested = 0;

  const cache = _loadSubjectCache();
  const suggestions = [];

  const call = (promptText) => new Promise((resolve, reject) => {
    callGeminiApi(apiKey, promptText, resolve, reject);
  });

  const buildPrompt = (batch) => {
    const items = batch.map(q => ({
      n: q.origN ?? q.n,
      text: String(q.text || "").slice(0, 1200),
      options: {
        A: String(q.optionsByLetter?.A?.text || "").slice(0, 350),
        B: String(q.optionsByLetter?.B?.text || "").slice(0, 350),
        C: String(q.optionsByLetter?.C?.text || "").slice(0, 350),
        D: String(q.optionsByLetter?.D?.text || "").slice(0, 350),
        E: String(q.optionsByLetter?.E?.text || "").slice(0, 350),
      }
    }));

    return [
      "Sen bir eğitim koçusun. Her soru için tek bir konu etiketi üret.",
      "Konu etiketi kısa olsun (ör: Paragraf, Üslup, Denklem, Kuvvet, Türev, Olasılık).",
      "ÇIKTI SADECE JSON olacak. Açıklama yazma.",
      'Beklenen format: {"12":{"subject":"Kuvvet","confidence":0.86},"13":{"subject":"Paragraf","confidence":0.72}}',
      "confidence 0-1 arası olsun. Emin değilsen düşük ver.",
      "Sorular:",
      JSON.stringify(items)
    ].join("\n");
  };

  // 1) Cache'ten uygula
  for (const q of all){
    const fp = _qFingerprint(q);
    const cached = cache?.[fp];
    if (cached && cached.subject){
      const s = String(cached.subject || "").trim();
      if (s && s !== "Genel"){
        q.subject = s;
        applied++;
      }
      done++;
    }
  }

  _updateAiSubjectModal({ total, done, applied, suggested, status: "Cache kontrol edildi." });

  // 2) Cache'te olmayanları topla
  const pending = all.filter(q => {
    const fp = _qFingerprint(q);
    return !(cache?.[fp]?.subject);
  });

  if (!pending.length){
    showToast({ id:"AI_SUBJECT_APPLIED", vars:{ applied }, kind:"ok" });
    try { _updateAiSubjectModal({ total, done: total, applied, suggested: 0, status: "Tamamlandı. Öneriler aşağıda." }); } catch {}
    try { _backfillWrongBookSubjectsFromCache(parsed); } catch {}
    try { const srs = document.getElementById("srsModal"); if (srs && srs.style.display !== "none") window.openSrsModal?.(wrongBookDashboard()); } catch {}
    try { refreshSubjectChips(); } catch {}
    try { refreshSubjectChart(); } catch {}
    return { applied, suggested: 0, total };
  }

  // 3) Batch AI çağrıları
  for (let i=0; i<pending.length; i+=batchSize){
    if (cancelled) break;

    const batch = pending.slice(i, i+batchSize);
    _updateAiSubjectModal({ total, done, applied, suggested, status: `AI işliyor… (${Math.min(i+batch.length, pending.length)}/${pending.length})` });

    const raw = await call(buildPrompt(batch));

    const cleaned = String(raw || "")
      .replace(/^```(?:json)?/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let obj;
    try { obj = JSON.parse(cleaned); }
    catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (!m) continue;
      obj = JSON.parse(m[0]);
    }

    for (const q of batch){
      const nKey = String(q.origN ?? q.n);
      const v = obj?.[nKey] ?? obj?.[Number(nKey)];
      const subj = String(v?.subject || "").trim();
      const conf = Number(v?.confidence || 0);

      const fp = _qFingerprint(q);
      if (subj){
        cache[fp] = { subject: subj, confidence: conf, ts: Date.now() };
      }

      if (subj && subj !== "Genel" && conf >= confidenceThreshold){
        q.subject = subj;
        applied++;
      } else if (subj && subj !== "Genel"){
        suggestions.push({ n: (q.origN ?? q.n), subject: subj, confidence: conf, text: q.text || "" });
        suggested++;
      }
      done++;
    }

    _saveSubjectCache(cache);
    _updateAiSubjectModal({ total, done, applied, suggested, status: cancelled ? "Durduruldu." : "Devam ediyor…" });
  }

  // 4) Öneri listesi UI
  _renderSubjectSuggestions(suggestions, ({ n, subject }) => {
    const q = parsed.questions.find(x => (x.origN ?? x.n) === n);
    if (q) q.subject = subject;
    showToast({ id:"AI_SUBJECT_SET_FOR_Q", vars:{ n, subject }, kind:"ok" });
    try { refreshSubjectChips(); } catch {}
    try { refreshSubjectChart(); } catch {}
  });

  _updateAiSubjectModal({ total, done, applied, suggested, status: cancelled ? "Durduruldu. Öneriler aşağıda." : "Tamamlandı. Öneriler aşağıda." });

  try { refreshSubjectChips(); } catch {}
  try { refreshSubjectChart(); } catch {}

  try { _backfillWrongBookSubjectsFromCache(parsed); } catch {}
  try { const srs = document.getElementById("srsModal"); if (srs && srs.style.display !== "none") window.openSrsModal?.(wrongBookDashboard()); } catch {}

  showToast({ id:"AI_SUBJECT_SUMMARY", vars:{ applied, suggested, status: (cancelled ? msg("LABEL_CANCELLED") : msg("LABEL_DONE")) }, kind:"ok" });
return { applied, suggested, total, cancelled };
}

// Testler için (opsiyonel)
try { window.fillMissingSubjectsWithGemini = fillMissingSubjectsWithGemini; } catch {}


// =========================================================
// PROACTIVE KEY CHECK ON LOGIN (after welcome/version modals)
// =========================================================

// =========================================================
// AI KEY NUDGE (Mini modal before asking for key)
// =========================================================
function requestAiKeyNudgeModal() {
  return new Promise((resolve) => {
    try { setLoading(false); } catch {}

    // If already present, don't nudge
    const existing = (localStorage.getItem("GEMINI_KEY") || "").trim();
    if (existing) { resolve(true); return; }

    let ov = document.getElementById("aiKeyNudgeModal");
    if (!ov) {
      ov = document.createElement("div");
      ov.id = "aiKeyNudgeModal";
      ov.className = "modalOverlay";
      ov.style.cssText = "display:none; z-index: 10000;";

      ov.innerHTML = `
        <div class="modalCard" style="max-width: 420px; text-align:center; position:relative;">
          <button id="btnAiNudgeClose" type="button" aria-label="Kapat" style="position:absolute; top:10px; right:10px; width:34px; height:34px; border-radius:12px;border:1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color:inherit; cursor:pointer;display:flex; align-items:center; justify-content:center; pointer-events:auto;"><span style="font-size:18px; line-height:1; opacity:.9;">✕</span></button>
          <div style="display:flex; align-items:center; justify-content:center; margin-bottom:10px;">
            <div class="ai-orb" style="width:56px; height:56px;">
              <span class="material-icons-round" style="font-size:22px; color:rgba(255,255,255,0.92);">auto_awesome</span>
            </div>
          </div>

          <h3 style="margin:0 0 6px; font-size:16px;">AI’ı etkinleştirelim</h3>
          <div class="modalSub" style="margin:0 auto 12px; max-width: 340px; opacity:.8;">
            ACUMEN’in AI özellikleri (deneme üretimi, konu tamamlama, tahmini çözüm) için Gemini API anahtarı gerekiyor.
          </div>

          
<div class="ai-nudge-checklist">
  <div class="ai-nudge-item" style="--d:0ms">
    <div class="ai-nudge-check" aria-hidden="true"></div>
    <div class="ai-nudge-txt">Deneme üretimi ve çözüm analizi hızlanır</div>
  </div>
  <div class="ai-nudge-item" style="--d:120ms">
    <div class="ai-nudge-check" aria-hidden="true"></div>
    <div class="ai-nudge-txt">Konu eksiklerini otomatik tamamlar</div>
  </div>
  <div class="ai-nudge-item" style="--d:240ms">
    <div class="ai-nudge-check" aria-hidden="true"></div>
    <div class="ai-nudge-txt">Anahtar cihazında saklanır (local)</div>
  </div>
</div>

<div style="display:flex; justify-content:center; gap:10px; margin-top:6px;">
            <button id="btnAiNudgeLater" class="btn-secondary" style="min-width:120px;">Sonra</button>
            <button id="btnAiNudgeNow" class="btn-secondary bad" style="min-width:160px;">Şimdi ekle</button>
          </div>

          <div style="margin-top:10px; font-size:11px; opacity:.55;">
            İstersen daha sonra Ayarlar → AI anahtarı bölümünden de ekleyebilirsin.
          </div>
        </div>
      `;
      document.body.appendChild(ov);
    }

    const btnNow = ov.querySelector("#btnAiNudgeNow");
    const btnLater = ov.querySelector("#btnAiNudgeLater");
    const btnClose = ov.querySelector("#btnAiNudgeClose");

    const cleanup = () => {
      try { ov.style.display = "none"; ov.setAttribute("aria-hidden","true"); } catch {}
      try { document.removeEventListener("keydown", onKey, true); } catch {}
      if (btnNow) btnNow.onclick = null;
      if (btnLater) btnLater.onclick = null;
      if (btnClose) btnClose.onclick = null;
    };

    ov.style.display = "flex";
    ov.setAttribute("aria-hidden","false");

    const onKey = (ev) => {
      // Do not allow ESC to close automatically
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); }
    };
    document.addEventListener("keydown", onKey, true);

    if (btnNow) btnNow.onclick = () => { cleanup(); resolve(true); }; 
    if (btnClose) btnClose.onclick = () => {
      try { localStorage.setItem(AI_KEY_SNOOZE_UNTIL, String(Date.now() + 60*60*1000)); } catch {}
      cleanup(); resolve(false);
    };
    if (btnLater) btnLater.onclick = () => {
      try { localStorage.setItem(AI_KEY_SNOOZE_UNTIL, String(Date.now() + 60*60*1000)); } catch {}
      cleanup(); resolve(false);
    };

    // Clicking outside should NOT close (explicit action required)
    ov.onclick = null;
  });
}


export async function ensureGeminiKeyOnEntry({ minDelayMs = 1200 } = {}) {
  try{
    // prevent re-entrancy
    if (window.__acumenKeyPrompting) return;
    window.__acumenKeyPrompting = true;

    // If key already exists, nothing to do
    const existing = (localStorage.getItem("GEMINI_KEY") || "").trim();
    if (existing) { try { localStorage.removeItem(AI_KEY_SNOOZE_UNTIL); } catch {} ; window.__acumenKeyPrompting = false; return; }

    // Snooze (user clicked later / closed)
    try {
      const until = Number(localStorage.getItem(AI_KEY_SNOOZE_UNTIL) || 0);
      if (until && Date.now() < until) { window.__acumenKeyPrompting = false; return; }
    } catch {}

    // Give welcome/version modals a chance to appear first
    if (minDelayMs && minDelayMs > 0) await new Promise(r => setTimeout(r, minDelayMs));

    // Wait until onboarding/version modals are closed (or not present)
    const isVisible = (id) => {
      const el = document.getElementById(id);
      if (!el) return false;
      const style = window.getComputedStyle(el);
      return style && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    };

    const waitForClose = async (timeoutMs=30000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        // welcome + update modal
        const any = isVisible("welcomeModal") || isVisible("updateModal");
        if (!any) return true;
        await new Promise(r => setTimeout(r, 250));
      }
      return false;
    };

    await waitForClose(30000);

    // Still no key? show a soft nudge first
    const go = await requestAiKeyNudgeModal();
    if (!go) {
      try { showToast?.({ id: "AI_KEY_MISSING_LIMITED", kind: "warn" }); } catch {}
    try { localStorage.setItem(AI_KEY_SNOOZE_UNTIL, String(Date.now() + 60*60*1000)); } catch {}
      window.__acumenKeyPrompting = false;
      return;
    }

    // Open key modal
    const key = await requestApiKeyFromModal();
    if (key) {
      localStorage.setItem("GEMINI_KEY", String(key).trim());
      try { localStorage.removeItem(AI_KEY_SNOOZE_UNTIL); } catch {}
      try { updateAiKeyBadges(); } catch {}
      window.__acumenKeyPrompting = false;
      return;
    }

    // User canceled: show soft warning (features will be limited)
    try { showToast?.({ id: "AI_KEY_MISSING_LIMITED", kind: "warn" }); } catch {}
    try { localStorage.setItem(AI_KEY_SNOOZE_UNTIL, String(Date.now() + 60*60*1000)); } catch {}
    window.__acumenKeyPrompting = false;
  } catch (e) {
    // Never block entry on errors
    try { console.error(e); } catch {}
  }
}


// Open AI key setup from user menu / locked buttons
export async function openAiKeySetup({ skipNudge = true } = {}) {
  try {
    // If we want to show the nudge card first, use requestAiKeyNudgeModal()
    if (!skipNudge) {
      const go = await requestAiKeyNudgeModal();
      if (!go) return null;
    }
    const key = await requestApiKeyFromModal();
    if (key) {
      localStorage.setItem("GEMINI_KEY", String(key).trim());
      try { localStorage.removeItem(AI_KEY_SNOOZE_UNTIL); } catch {}
      try { updateAiKeyBadges(); } catch {}
      return key;
    }
    return null;
  } catch (e) {
    try { showToast?.(e); } catch {}
    return null;
  }
}
