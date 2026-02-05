// js/ui.js - (FİNAL DÜZELTİLMİŞ SÜRÜM)

// ================= IMPORTS =================
import { el, escapeHtml } from "./utils.js";
import { LETTERS_CONST, getCorrectDisplayLetter, getChosenOptionId } from "./shuffle.js";
import { loadWrongBook, saveWrongBook, wrongBookDashboard, makeKeyFromQuestion } from "./wrongBook.js";

// ================= SAFE HELPERS =================

function isMissingOptionText(t){
  const s = String(t ?? "").trim();
  if (!s) return true;
  const low = s.toLowerCase();
  if (low === "görseldeki seçenek" || low === "gorseldeki secenek") return true;
  return false;
}
function safe(id){ return document.getElementById(id); }
function safeShow(id, display="block"){ const e=safe(id); if(e) e.style.display=display; }
function safeHide(id){ const e=safe(id); if(e) e.style.display="none"; }
function safeText(id, v){ const e=safe(id); if(e) e.textContent=v; }

import {
  handleGamification,
  startPatiMotivation
} from "./pati.js";


/* ================= SÜRÜM YÖNETİMİ ================= */

// 1. GÜNCEL SÜRÜM BİLGİLERİ (Burası senin kumanda merkezin)
const CURRENT_VER = "1.2.0"; // Her güncellemede burayı değiştir (Örn: 1.2.1)

const UPDATE_NOTES = [
  { text: "🧠 <b>AI Konu Analizi:</b> Artık soruların konuları otomatik tespit ediliyor.", icon: "✨" },
  { text: "📊 <b>Gelişmiş Rapor:</b> Hata raporu artık konu dağılımını gösteriyor.", icon: "📈" },
  { text: "💅 <b>Yeni Tasarım:</b> Arayüz daha modern ve cam (Glassmorphism) efektli hale geldi.", icon: "🎨" },
  { text: "🐞 Bazı hatalar giderildi ve performans iyileştirildi.", icon: "🔧" }
];

// 2. KONTROL FONKSİYONU
window.checkAppVersion = function() {
  const savedVer = localStorage.getItem('app_version');
  
  // Eğer kayıtlı sürüm yoksa veya kodun sürümü daha yeniyse
  if (savedVer !== CURRENT_VER) {
    showUpdateModal();
  }
};

// 3. MODALI GÖSTERME
function showUpdateModal() {
  const modal = document.getElementById('updateModal');
  const badge = document.getElementById('updateVersionBadge');
  const content = document.getElementById('updateContent');
  
  if (!modal) return;

  // Başlığı güncelle
  badge.textContent = `Sürüm ${CURRENT_VER} yayında!`;
  
  // Listeyi oluştur
  content.innerHTML = UPDATE_NOTES.map(note => `
    <div style="display:flex; gap:12px; align-items:start; padding:10px; margin-bottom:8px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid var(--stroke);">
      <span style="font-size:18px;">${note.icon}</span>
      <span style="font-size:14px; color:var(--text); line-height:1.4;">${note.text}</span>
    </div>
  `).join('');

  modal.style.display = 'flex';
}

// 4. MODALI KAPATMA VE KAYDETME
window.closeUpdateModal = function() {
  const modal = document.getElementById('updateModal');
  if (modal) {
    modal.style.display = 'none';
    // Yeni sürümü kaydet ki tekrar sormasın
    localStorage.setItem('app_version', CURRENT_VER);
  }
};

// Sayfa yüklendiğinde kontrol et
window.addEventListener('load', () => {
  // Hoş geldin modalı ile çakışmaması için biraz gecikmeli çalıştırabiliriz
  setTimeout(checkAppVersion, 1000);
});

// ================= THEME PATCHES (UI polish) =================
// Only injects styles if not already present (non-destructive).
function ensureThemePatches(){
  if (document.getElementById("uiThemePatchesV1")) return;
  const st = document.createElement("style");
  st.id = "uiThemePatchesV1";
  st.textContent = `
    /* Subject chip on question cards */
    .subject-chip{
      background: rgba(255,255,255,0.04) !important;
      border: 1px solid rgba(255,255,255,0.10) !important;
      color: var(--text-main) !important;
      border-radius: 999px;
      padding: 4px 10px;
      font-size: 12px;
      line-height: 1;
      backdrop-filter: blur(6px);
    }

    /* SRS subject chips */
    .srs-subject-chip{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-main);
      background: rgba(255,255,255,0.035);
      border: 1px solid rgba(255,255,255,0.10);
      cursor: pointer;
      transition: transform .15s ease, box-shadow .15s ease, background .15s ease, border-color .15s ease;
      backdrop-filter: blur(8px);
    }
    .srs-subject-chip b{ font-weight: 700; }
    .srs-subject-chip:hover{
      transform: translateY(-1px);
      background: rgba(255,255,255,0.06);
      border-color: rgba(168,85,247,0.55);
      box-shadow: 0 6px 18px rgba(168,85,247,0.20);
    }
    .srs-subject-chip[data-subject="Genel"]{ opacity: .55; }
  `;
  document.head.appendChild(st);
}

// Call once on module load (safe)
try { ensureThemePatches(); } catch {}


// ================= SUBJECT HELPERS =================
// Öncelik: q.subject (AI / parser) → fallback: q.text içindeki "[Konu]" → "Genel"
function getQuestionSubject(q){
  const direct = (q && q.subject != null) ? String(q.subject).trim() : "";
  if (direct) return direct;

  const t = q && q.text ? String(q.text) : "";
  const m = t.match(/^\[(.*?)\]\s*/);
  if (m && m[1]) return String(m[1]).trim() || "Genel";
  return "Genel";
}

// DOM'da görünen "subject chip" güncellemesi (tam rerender gerekmeden)
export function refreshSubjectChips(){
  const state = window.__APP_STATE;
  const qs = state?.parsed?.questions || [];
  for (const q of qs){
    const n = q?.n;
    if (!n) continue;
    const chip = document.getElementById(`subj-chip-${n}`);
    if (!chip) continue;
    chip.textContent = getQuestionSubject(q);
  }
}

// ================= STATUS & TOASTS =================
export function setStatus(msg){
  safeText("parseStatus", msg);
}

export function showWarn(msg){
  const wb = safe("warnBox");
  if (wb){
    if (!msg){ wb.style.display="none"; wb.textContent=""; }
    else { wb.style.display="block"; wb.textContent = msg; }
  }
  if (msg) showToast({ title:"Bildirim", msg, kind:"warn" });
}

export function showToast({ title="Bildirim", msg="", kind="ok", timeout=3600 }){
  const host = document.getElementById("toastHost");
  if (!host) return;

  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = `
    <div>
      <div class="tTitle">${escapeHtml(title)}</div>
      <div class="tMsg">${escapeHtml(msg)}</div>
    </div>
  `;
  host.appendChild(t);

  setTimeout(() => {
    t.style.opacity = "0";
    t.style.transform = "translateY(6px)";
    setTimeout(() => t.remove(), 180);
  }, timeout);
}

// ================= LOADING =================
export function setLoading(on, text="Ayrıştırılıyor…"){
  const ov = document.getElementById("loadingOverlay");
  if (!ov) return;
  const t = ov.querySelector(".loadingText");
  if (t) t.textContent = text;
  
  if (on) {
    ov.style.display = "flex";
    ov.setAttribute("aria-hidden", "false");
  } else {
    ov.style.display = "none";
    ov.setAttribute("aria-hidden", "true");
  }
}

// ================= MODE UI =================
export function updateModeUI(state, wrongStats){
  safeText("modeLabel", state.mode === "prep" ? "Hazırlık" : state.mode === "exam" ? "Sınav" : "Sonuç");

  // Key label: yok / kısmi / var / AI
  if (!state.parsed){
    safeText("keyLabel", "—");
  } else {
    const totalQ = state.parsed.questions?.length || 0;
    const keyCount = state.parsed.keyCount || 0;
    const cov = state.parsed.meta?.keyCoverage ?? (totalQ ? keyCount/totalQ : 0);
    const src = state.parsed.meta?.keySource;

    if (src === "ai") safeText("keyLabel", "AI");
    else if (!keyCount) safeText("keyLabel", "yok");
    else if (cov < 0.95) safeText("keyLabel", "kısmi");
    else safeText("keyLabel", "var");
  }

  const btn = (id, cond) => { const b=safe(id); if(b) b.disabled=!cond; };
  btn("btnStart", state.parsed && state.mode==="prep");
  btn("btnFinish", state.parsed && state.mode==="exam");


  if (safe("resultTools"))
    safe("resultTools").style.display = (state.parsed && state.mode==="result") ? "flex" : "none";

  const total = (typeof wrongStats === "number") ? wrongStats : (wrongStats?.total || 0);
  const due   = (typeof wrongStats === "number") ? wrongStats : (wrongStats?.due ?? total);

  const wbtn = safe("btnWrongMode");
  if (wbtn){
    wbtn.disabled = !(total>0 && state.mode!=="exam");
    wbtn.textContent = total>0 ? `♻ Tekrar (Bugün ${due} / Toplam ${total})` : "♻ Tekrar (0)";
  }
}

// ================= STATS PANEL =================
export function updateStats(state){
  if (!state.parsed) return;

  const total = state.parsed.questions.length;
  const answered = state.answers.size;
  let correctCount = 0;

  for (const q of state.parsed.questions){
    const chosen = state.answers.get(q.n);
    const correctId = state.parsed.answerKey[q.n];
    if (!chosen || !correctId) continue;
    const chosenId = getChosenOptionId(q, chosen);
    if (chosenId && chosenId === correctId) correctCount++;
  }

  const score = total ? Math.round((correctCount/total)*100) : 0;
  safeShow("statsBox","grid");
  safeText("kpiQ", total);
  safeText("kpiA", answered);
  safeText("kpiC", correctCount);
  safeText("kpiS", score);
}

// ================= AI: ÖZEL GİRİŞ PENCERESİ MANTIĞI =================
function requestApiKeyFromModal() {
  return new Promise((resolve) => {
    
    // 🔥 KRİTİK DÜZELTME: Modal açılacağı zaman "Yükleniyor..." perdesini kaldırıyoruz.
    // Bu sayede giriş penceresi arkada kalmaz, tıklanabilir olur.
    setLoading(false);

    const modal = document.getElementById("apiKeyModal");
    const input = document.getElementById("inpApiKeyUi");
    const errorBox = document.getElementById("keyErrorUi");
    const btnSave = document.getElementById("btnSaveKeyUi");
    const btnCancel = document.getElementById("btnCancelKeyUi");

    // HTML'de modal yoksa (eski sürümse) prompt kullan
    if (!modal || !input) {
      const pKey = window.prompt("Lütfen Gemini API Anahtarınızı girin:\n(AIza... ile başlayan kod)");
      resolve(pKey ? pKey.trim() : null);
      return;
    }

    // Modalı Aç
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false"); // Erişilebilirlik
    input.value = "";
    input.style.borderColor = "#444";
    if(errorBox) errorBox.style.display = "none";
    input.focus();

    const handleSave = () => {
      const val = input.value.trim();
      // Basit doğrulama
      if (val.length > 20 && val.startsWith("AIza")) {
        cleanup();
        resolve(val);
      } else {
        if(errorBox) {
          errorBox.textContent = "⚠️ Geçersiz anahtar! 'AIza' ile başlamalı.";
          errorBox.style.display = "block";
        }
        input.style.borderColor = "#ff453a";
        input.oninput = () => {
             input.style.borderColor = "#444";
             if(errorBox) errorBox.style.display = "none";
        };
      }
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    const handleEnter = (e) => {
      if (e.key === "Enter") handleSave();
    };

    btnSave.onclick = handleSave;
    btnCancel.onclick = handleCancel;
    input.onkeydown = handleEnter;

    function cleanup() {
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true"); // Erişilebilirlik
      btnSave.onclick = null;
      btnCancel.onclick = null;
      input.onkeydown = null;
      if(input) input.oninput = null;
    }
  });
}

// ================= AI: ORTAK ÇAĞRI FONKSİYONU =================
async function callGeminiApi(apiKey, promptText, onSuccess, onError) {
  try {
    // Otomatik Model Seçimi
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

    // İstek At
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || response.statusText);
    }

    const data = await response.json();
    if(!data.candidates || data.candidates.length === 0) {
        throw new Error("Model boş cevap döndürdü.");
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
      <button onclick="localStorage.removeItem('GEMINI_KEY'); this.parentElement.innerHTML='Anahtar silindi. Tekrar deneyin.';" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
        Anahtarı Sil ve Tekrar Dene
      </button>
    </div>
  `;
}

// ================= AI 0: CEVAP ANAHTARI ÜRETİMİ (Mod A) =================
// parsed: applyShuffle sonrası (display A-E). Dönen anahtar: displayN -> correctOptionId
export async function generateAnswerKeyWithGemini(parsed, { limit=80, batchSize=10 } = {}) {
  if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length) {
    throw new Error("AI anahtar üretimi için soru bulunamadı.");
  }

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    // Modal açılırken loading kapanacak (requestApiKeyFromModal içinde yapıldı)
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) throw new Error("Gemini API anahtarı girilmedi.");
    localStorage.setItem("GEMINI_KEY", apiKey);
    
    // 🔥 EKLENEN KISIM: Anahtarı aldık, şimdi işlem başlıyor. Loading'i tekrar açalım.
    setLoading(true, "AI cevap anahtarı üretiliyor...");
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
      return {
        n: q.n,
        text: (q.text || "").slice(0, 1200),
        options: {
          A: String(A).slice(0, 600),
          B: String(B).slice(0, 600),
          C: String(C).slice(0, 600),
          D: String(D).slice(0, 600),
          E: String(E).slice(0, 600),
        }
      };
    });

    return [
      `Sen çoktan seçmeli sınav çözücüsün.`,
      `Her soru için yalnızca A/B/C/D/E harfi döndür.`,
      `Emin değilsen null döndür (uydurma).`,
      `ÇIKTI SADECE JSON olacak. Açıklama yazma.`,
      `Beklenen format: {"1":"B","2":null,"3":"D"} (anahtarlar soru numarası, değerler A-E veya null)`,
      `Sorular:`,
      JSON.stringify(items, null, 2)
    ].join("\n");
  };

  for (let i = 0; i < qList.length; i += batchSize) {
    const batch = qList.slice(i, i + batchSize);
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
      if (!m) throw new Error("AI çıktısı JSON değil.");
      obj = JSON.parse(m[0]);
    }

    for (const q of batch) {
      const v = obj?.[String(q.n)] ?? obj?.[q.n];
      if (!v) continue;
      const letter = String(v).trim().toUpperCase();
      if (!["A","B","C","D","E"].includes(letter)) continue;

      // AI display harfi verdi: gerçek optionId'ye çevir (shuffle varsa şart)
      const optId = (q.optionsByLetter?.[letter]?.id || "").toUpperCase();
      if (optId) outKey[q.n] = optId;
    }
  }

  return outKey;
}


// ================= AI 1: SORU AÇIKLAYICI (EXPLAINER) =================
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
  if (!state || !state.parsed) { box.innerHTML="<span style='color:red'>Hata: Veri yok.</span>"; return; }
  const q = state.parsed.questions.find(x => x.n === qN);
  const correctId = state.parsed.answerKey[qN];
  
  let correctText = "Belirtilmemiş";
  let correctLetter = "";
  if (q.optionsByLetter) {
    for (let [L, opt] of Object.entries(q.optionsByLetter)) {
      if (opt.id === correctId) {
        correctText = opt.text;
        correctLetter = L;
      }
    }
  }

  const aiPrompt = `
    Öğretmen gibi davran. Aşağıdaki test sorusunu analiz et.
    SORU: ${q.text}
    DOĞRU CEVAP: (${correctLetter}) ${correctText}
    GÖREV:
    1. Bu cevabın neden doğru olduğunu açıkla.
    2. Çeldiricilerin neden yanlış olduğunu kısaca belirt.
    3. Kısa ve samimi ol. Türkçe cevap ver.
  `;

// ui.js - runGeminiAnalysis içindeki callGeminiApi bölümü:
await callGeminiApi(apiKey, aiPrompt, (text) => {
    const formatted = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
    box.innerHTML = `<strong>🤖 Gemini Açıklaması:</strong><br><br>${formatted}`;

    // 🔥 ANALİZİ DEFTERE İŞLEME MANTIĞI
    try {
        const book = loadWrongBook();
        // Mevcut soru objesini kullanarak anahtarı (key) oluştur
        const key = makeKeyFromQuestion(q); 
        
        if (book[key]) {
            // Analiz verisini q objesinin içine göm
            book[key].q.analysis = text; 
            saveWrongBook(book);
            console.log("✅ Analiz başarıyla kaydedildi:", key);
        } else {
            console.warn("⚠️ Soru defterde bulunamadı. Key:", key);
        }
    } catch (e) {
        console.error("❌ Kayıt hatası:", e);
    }
}, (err) => {
    renderGeminiError(box, err);
});
}

// ================= AI 2: BENZER SORU ÜRETİCİ (GENERATOR) =================
export async function runGeminiGenerator(qN) {
  const box = document.getElementById(`ai-gen-box-${qN}`);
  if (!box) return;

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) return;
    localStorage.setItem("GEMINI_KEY", apiKey);
  }

  box.style.display = "block";
  box.innerHTML = `<div class="ai-loading" style="color:#f59e0b">♻️ Yapay zeka benzer bir soru üretiyor...</div>`;

  const state = window.__APP_STATE;
  const q = state.parsed.questions.find(x => x.n === qN);
  
  const aiPrompt = `
    Sen profesyonel bir soru yazarısın. Aşağıdaki soruya BENZER mantıkta, aynı zorlukta ama farklı değerler veya senaryo içeren YENİ bir soru üret.
    
    REFERANS SORU: ${q.text}
    
    ÇIKTI FORMATI (Sadece saf JSON ver, markdown yok):
    {
      "question": "Soru metni buraya",
      "options": {"A": "Şık A", "B": "Şık B", "C": "Şık C", "D": "Şık D", "E": "Şık E"},
      "correct": "A",
      "explanation": "Cevabın neden A olduğuna dair kısa açıklama."
    }
  `;

  await callGeminiApi(apiKey, aiPrompt, (text) => {
    try {
      let jsonStr = text.replace(/```json/g, "").replace(/```/g, "").trim();
      const data = JSON.parse(jsonStr);
      renderChallengeBox(box, data);
    } catch (e) {
      console.error(e);
      box.innerHTML = `<div style="color:#ef4444">Veri işlenirken hata oluştu. Lütfen tekrar dene.</div>`;
    }
  }, (err) => {
    renderGeminiError(box, err);
  });
}

function renderChallengeBox(container, data) {
  container.innerHTML = `
    <div class="ai-challenge-header">🤖 AI Meydan Okuması</div>
    <div class="ai-new-q-text">${escapeHtml(data.question)}</div>
    <div class="ai-opts-area"></div>
    <div class="ai-explanation" id="exp-${Math.random().toString(36).substr(2,9)}">${escapeHtml(data.explanation)}</div>
  `;

  const optsArea = container.querySelector(".ai-opts-area");
  const expBox = container.querySelector(".ai-explanation");
  
  Object.entries(data.options).forEach(([letter, text]) => {
    const btn = document.createElement("button");
    btn.className = "ai-opt-btn";
    btn.innerHTML = `<b>${letter})</b> ${escapeHtml(text)}`;
    
    btn.onclick = () => {
      const allBtns = optsArea.querySelectorAll(".ai-opt-btn");
      allBtns.forEach(b => b.classList.add("disabled"));
      
      if (letter === data.correct) {
        btn.classList.add("correct");
        showToast({ title:"Tebrikler!", msg:"Doğru cevap!", kind:"ok" });
      } else {
        btn.classList.add("wrong");
        allBtns.forEach(b => {
          if (b.innerHTML.includes(`<b>${data.correct})</b>`)) b.classList.add("correct");
        });
        showToast({ title:"Yanlış", msg:"Doğru cevap işaretlendi.", kind:"warn" });
      }
      expBox.style.display = "block";
    };
    optsArea.appendChild(btn);
  });
}

// ================= AI 3: KONU TAMAMLAMA (Sadece "Genel" kalanlar) =================
// Özellikler: Batch + cache + confidence + progress UI + öneri listesi (low confidence).
// Contract: fillMissingSubjectsWithGemini(parsed, opts) parsed.questions[*].subject alanını günceller.
function _djb2Hash(str){
  let h = 5381;
  for (let i=0;i<str.length;i++){
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  // unsigned 32-bit
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
  ].join("\n");
  return _djb2Hash(parts);
}

function _backfillWrongBookSubjectsFromCache(parsed){
  try{
    const cacheKey = "sinav_v3_ai_subject_cache_v1";
    const cache = JSON.parse(localStorage.getItem(cacheKey) || "{}");

    const book = loadWrongBook();
    let changed = 0;

    for (const k of Object.keys(book || {})){
      const rec = book[k];
      const q = rec?.q;
      if (!q) continue;

      const cur = (q.subject != null) ? String(q.subject).trim() : "";
      if (cur && cur !== "Genel") continue;

      // Cache fingerprint ile bul
      const fp = _qFingerprint({ text: q.text, optionsByLetter: q.optionsByLetter });
      const cached = cache?.[fp]?.subject ? String(cache[fp].subject).trim() : "";

      // Parsed içinde eşleşme (fallback)
      let fromParsed = "";
      if (!cached && parsed?.questions?.length){
        // hızlı fingerprint map (tek seferlik)
        // (küçük setlerde bile yeterince hızlı)
        for (const pq of parsed.questions){
          const pfp = _qFingerprint(pq);
          if (pfp === fp){
            fromParsed = getQuestionSubject(pq);
            break;
          }
        }
      }

      const next = cached || fromParsed || "";
      if (next && next !== cur){
        q.subject = next;
        rec.q = q;
        changed++;
      }
    }

    if (changed){
      saveWrongBook(book);
    }
    return changed;
  } catch {
    return 0;
  }
}


function _loadSubjectCache(){
  try {
    const raw = localStorage.getItem("SUBJECT_CACHE_V1");
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch { return {}; }
}
function _saveSubjectCache(cache){
  try { localStorage.setItem("SUBJECT_CACHE_V1", JSON.stringify(cache || {})); } catch {}
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

  // Close behavior (safe)
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

  // İş bittiyse Durdur butonunu gizle
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
    const snippet = escapeHtml(String(it.text || "").replace(/\s+/g," ").slice(0, 120));

    row.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="font-weight:600;">${qTitle}</div>
        <div style="color:#8e8e93; font-size:12px;">Güven: ${confPct}%</div>
      </div>
      <div style="color:#8e8e93; font-size:12px; margin-top:6px;">${snippet}${snippet.length>=120?"…":""}</div>
      <div style="display:flex; gap:8px; align-items:center; margin-top:10px; flex-wrap:wrap;">
        <input class="aiSubInp" value="${escapeHtml(it.subject || "")}" style="flex:1; min-width:180px; background:#0f0f10; border:1px solid #2c2c2e; color:#e5e5ea; border-radius:8px; padding:8px;" />
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
        if (!val) { showToast({ title:"Bildirim", msg:"Konu boş olamaz.", kind:"warn" }); return; }
        onApply?.({ n: it.n, subject: val });
        row.style.opacity = "0.55";
        btnApply.disabled = true;
        if (btnIgnore) btnIgnore.disabled = true;
      });
    }
    if (btnIgnore){
      btnIgnore.addEventListener("click", () => {
        row.remove();
      });
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
    throw new Error("AI konu tamamlamak için soru bulunamadı.");
  }

  let apiKey = localStorage.getItem("GEMINI_KEY");
  if (!apiKey) {
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) throw new Error("Gemini API anahtarı girilmedi.");
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

  // 대상: subject boş veya Genel
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
    showToast({ title:"AI Konu", msg:`Tamamlandı. Uygulanan: ${applied}`, kind:"ok" });
    // İş bitti: Durdur butonunu gizle
    try { _updateAiSubjectModal({ total, done: total, applied, suggested: 0, status: "Tamamlandı. Öneriler aşağıda." }); } catch {}
    // WrongBook subject backfill + SRS refresh
    try { _backfillWrongBookSubjectsFromCache(parsed); } catch {}
    try { const srs = document.getElementById("srsModal"); if (srs && srs.style.display !== "none") openSrsModal(wrongBookDashboard()); } catch {}
    // UI'ı anında güncelle
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
    showToast({ title:"Konu", msg:`Soru ${n} → ${subject}`, kind:"ok" });
    // UI'ı anında güncelle
    try { refreshSubjectChips(); } catch {}
    try { refreshSubjectChart(); } catch {}
  });

  _updateAiSubjectModal({ total, done, applied, suggested, status: cancelled ? "Durduruldu. Öneriler aşağıda." : "Tamamlandı. Öneriler aşağıda." });

  // UI'ı anında güncelle
  try { refreshSubjectChips(); } catch {}
  try { refreshSubjectChart(); } catch {}

  // WrongBook subject backfill + SRS refresh
  try { _backfillWrongBookSubjectsFromCache(parsed); } catch {}
  try { const srs = document.getElementById("srsModal"); if (srs && srs.style.display !== "none") openSrsModal(wrongBookDashboard()); } catch {}

  showToast({
    title:"AI Konu",
    msg: cancelled
      ? `Durduruldu. Uygulanan: ${applied}, Öneri: ${suggested}`
      : `Tamamlandı. Uygulanan: ${applied}, Öneri: ${suggested}`,
    kind:"ok"
  });

  return { applied, suggested, total, cancelled };
}

// Testler için (opsiyonel)
try { window.fillMissingSubjectsWithGemini = fillMissingSubjectsWithGemini; } catch {}

// ================= EXAM RENDER =================
function shouldShowQuestion(state, qN){
  if (state.mode!=="result") return true;
  const onlyWrong = safe("showOnlyWrong")?.checked;
  const onlyBlank = safe("showOnlyBlank")?.checked;
  const chosen = state.answers.get(qN);
  const q = state.parsed.questions.find(x=>x.n===qN);
  const correctId = state.parsed.answerKey[qN];

  if (onlyBlank && chosen) return false;
  if (onlyWrong){
    if (!chosen || !correctId) return false;
    const chosenId = q ? getChosenOptionId(q, chosen) : null;
    return chosenId && chosenId !== correctId;
  }
  return true;
}

export function renderExam(state){
  window.__APP_STATE = state;

  const area = safe("examArea");
  if (!area) return;
  area.innerHTML = "";

  if (!state.parsed){
    area.innerHTML = `<div class="hint">Sınav burada görünecek.</div>`;
    safeText("examTitle","Sınav");
    safeText("examMeta","Henüz ayrıştırılmadı.");
    return;
  }

  safeText("examTitle", state.parsed.title);
  safeText("examMeta", `${state.parsed.questions.length} soru • Anahtar: ${state.parsed.keyCount||0}`);

  for (const q of state.parsed.questions){
    if (!shouldShowQuestion(state, q.n)) continue;

    const chosen = state.answers.get(q.n);
    const correctId = state.parsed.answerKey[q.n];
    const correctLetter = correctId ? getCorrectDisplayLetter(q, correctId) : null;
    const chosenId = q ? getChosenOptionId(q, chosen) : null;
    const hasKey = !!correctId;
    const isCorrectNow = hasKey && chosen && (chosen === correctLetter);

    

    let badge = `<span class="badge">Soru</span>`;
    if (state.mode==="exam") badge = chosen ? `<span class="badge warn">İşaretli</span>` : `<span class="badge">Boş</span>`;
    if (state.mode==="result"){
      if (!correctId) badge=`<span class="badge">Anahtar yok</span>`;
      else if (chosen===correctLetter) badge=`<span class="badge ok">Doğru</span>`;
      else if (!chosen) badge=`<span class="badge warn">Boş</span>`;
      else badge=`<span class="badge bad">Yanlış</span>`;
    }

    // AI Butonları
    let aiBtnsHtml = "";
    const showAi = (state.mode === "result" && correctId && chosenId !== correctId);
    if (showAi) {
      aiBtnsHtml = `
        <button class="btn-ai-explain ai-explain-trigger" data-qn="${q.n}">✨ Neden?</button>
        <button class="btn-ai-similar ai-gen-trigger" data-qn="${q.n}">♻️ Benzer Soru Üret</button>
      `;
    }

    const qDiv = document.createElement("div");
    qDiv.className="q";
    qDiv.dataset.q=q.n;
    qDiv.innerHTML=`
      <div class="qTop">
        <div class="qNum">${q.n}.</div>
        <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
          ${badge}
          <span class="badge subject-chip" id="subj-chip-${q.n}">${escapeHtml(getQuestionSubject(q))}</span>
          ${aiBtnsHtml}
        </div>
      </div>
      <div class="qText">${q.text}</div>
      <div class="opts"></div>
      <div id="ai-box-${q.n}" class="ai-box"></div>
      <div id="ai-gen-box-${q.n}" class="ai-challenge-box" style="display:none"></div>
    `;

    // Click Event Bağla
    if (showAi) {
        const expBtn = qDiv.querySelector('.ai-explain-trigger');
        if (expBtn) expBtn.addEventListener('click', (e) => runGeminiAnalysis(parseInt(e.target.dataset.qn)));
        
        const genBtn = qDiv.querySelector('.ai-gen-trigger');
        if (genBtn) genBtn.addEventListener('click', (e) => runGeminiGenerator(parseInt(e.target.dataset.qn)));
    }

    const opts = qDiv.querySelector(".opts");
    for (const L of LETTERS_CONST){
      const opt = q.optionsByLetter?.[L];
      const rawText = (opt?.text ?? "");
      const missing = isMissingOptionText(rawText);
      const optHtml = missing ? `<span class="opt-missing-chip">PDF görsel</span>` : escapeHtml(String(rawText));


      const label=document.createElement("label");
      label.className="opt";
      if (state.mode==="result" && correctLetter){
        if (L===correctLetter) label.classList.add("correct");
        if (L===chosen && L!==correctLetter) label.classList.add("wrong");
      }
      label.innerHTML=`
        <input type="radio" name="q${q.n}" value="${L}" ${chosen===L?"checked":""} ${state.mode!=="exam"?"disabled":""}>
        <div><b>${L})</b> ${optHtml}</div>
      `;
      
      // ---------------------------------------------------------
      // 🔥 GAMIFICATION & CEVAPLAMA TETİKLEYİCİSİ BURADA 🔥
      // ---------------------------------------------------------
     const input = label.querySelector("input");
if (input && state.mode === "exam") {
  input.addEventListener("change", () => {
    const firstTime = !state.answers.has(q.n); // ✅ sadece ilk işaretleme

    state.answers.set(q.n, L);
    refreshNavColors(state);

    // isCorrect burada bilinmiyor (anahtar olsa bile exam modunda ödül yok dedin)
    try { handleGamification(null, { firstTime }); } catch {}
  });
}

      // ---------------------------------------------------------

      opts.appendChild(label);
    }
    
    // SRS Widget
    if (state.mode==="result" && state.srsReview){
      const info = state.srsInfo?.[q.n] || null;
      const srsWrap = document.createElement("div");
      srsWrap.className = "srsWrap";
      srsWrap.dataset.q = q.n;

      if (!hasKey){
        srsWrap.innerHTML = `<div class="srsLine muted">SRS: Anahtar yok</div>`;
      } else if (!chosen){
        srsWrap.innerHTML = `<div class="srsLine">SRS: Boş → yarın tekrar</div>`;
      } else if (!isCorrectNow){
        srsWrap.innerHTML = `<div class="srsLine">SRS: Yanlış → yarın tekrar</div>`;
      } else {
        const dueTxt = info?.due ? new Date(info.due).toLocaleDateString("tr-TR") : "—";
        const meta = info ? `EF ${info.ef.toFixed(2)} • ${info.interval}g • ${dueTxt}` : "—";
        srsWrap.innerHTML = `
          <div class="srsLine">
            <span><b>SRS</b> • ${meta}</span>
          <button class="srsBtn" data-quality="3"
         data-tip="Zor: Hatırladın ama zorlandın. Genelde yarın tekrar.">
         Zor
        </button>

        <button class="srsBtn" data-quality="4"
         data-tip="Orta: Rahat hatırladın. Aralık birkaç gün uzar.">
         Orta
        </button>

        <button class="srsBtn" data-quality="5"
         data-tip="Kolay: Çok netti. Uzun süre tekrar gelmez.">
         Kolay
        </button>


          </div>
          <div class="srsHint muted">Bu sorunun tekrar aralığını seç.</div>
        `;
      }
      qDiv.appendChild(srsWrap);
    }
    area.appendChild(qDiv);
  }
}

// ================= NAVIGATION =================
export function buildNav(state){
  // 1. Gerekli elementleri seçelim
  const grid = document.getElementById("navGrid"); // veya safe("navGrid")
  const panel = document.getElementById("navPanel");
  const layout = document.getElementById("layoutExam");

  if (!grid) return;

  const total = state.parsed ? state.parsed.questions.length : 0;

  // --- GÜNCELLEME BAŞLANGICI ---
  
  // DURUM 1: Hiç soru yoksa paneli gizle ve alanı genişlet
  if (total === 0) {
    grid.innerHTML = "";
    if (panel) panel.style.display = "none";
    // Paneli gizleyince, sağdaki alanın (sınav alanı) tam genişlik olması için:
    if (layout) layout.style.gridTemplateColumns = "1fr"; 
    return;
  }

  // DURUM 2: Soru varsa paneli göster ve orijinal düzene dön
  // Daha önce gizlendiyse tekrar görünür yap (flex veya block, CSS yapına göre)
  if (panel) panel.style.display = "flex"; 
  // CSS dosyasındaki orijinal grid ayarına (240px 1fr) dönmesi için inline stili temizle
  if (layout) layout.style.gridTemplateColumns = "";

  // --- GÜNCELLEME BİTİŞİ ---

  // Burası senin orijinal kodun (Değişmedi)
  if (grid.childElementCount === total) {
    refreshNavColors(state);
    return;
  }

  grid.innerHTML = "";
  if (!state.parsed) return;

  for (const q of state.parsed.questions){
    const b = document.createElement("button");
    b.className = "navBtn";
    b.textContent = q.n;
    b.dataset.qn = q.n;
    b.onclick = () => {
      state.activeQn = q.n;
      if (document.body.classList.contains("focusMode")) {
        const PAGE_SIZE = 20;
        state.navPage = Math.floor((q.n - 1) / PAGE_SIZE);
      }
      const target = document.querySelector(`.q[data-q="${q.n}"]`);
      if (target) target.scrollIntoView({behavior:"smooth", block:"start"});
      refreshNavColors(state);
    };
    grid.appendChild(b);
  }
  refreshNavColors(state);
}

export function refreshNavColors(state) {
  if (typeof renderFocusMiniNav === 'function') renderFocusMiniNav(state);

  const grid = document.getElementById("navGrid");
  if (!grid || !state.parsed) return;

  const buttons = grid.querySelectorAll(".navBtn");
  const answers = state.answers || new Map();
  const activeQn = Number(state.activeQn || 1);
  const isResult = state.mode === "result";
  const keyMap = state.parsed.answerKey || {};

  buttons.forEach(btn => {
    const qn = Number(btn.dataset.qn);
    btn.className = "navBtn"; 

    if (qn === activeQn) btn.classList.add("active");

    // answers bir Map olduğu için has() kontrolü en güvenlisidir
    const hasAnswer = answers.has(qn) && answers.get(qn) !== null;
    const myAns = answers.get(qn);

    if (isResult) {
      const correctId = keyMap[qn];
      const qObj = state.parsed.questions.find(x => x.n === qn);
      const chosenId = qObj ? getChosenOptionId(qObj, myAns) : null;
      
      if (!hasAnswer) btn.classList.add("empty-result");
      else if (!correctId) btn.classList.add("answered");
      else if (chosenId === correctId) btn.classList.add("correct");
      else btn.classList.add("wrong");
    } else {
      // ✅ SINAV ANI DÜZELTMESİ:
      // Sadece 'myAns' kontrolü yetmez, Map'te bu soru var mı diye bakmalıyız.
      if (hasAnswer) {
        btn.classList.add("answered");
      }
    }
  });
}

// ================= KEYBOARD =================
export function attachKeyboardShortcuts(state, onPickLetter, onFinish){
  function mostVisibleQuestion(){
    const qs = [...document.querySelectorAll(".q[data-q]")];
    if (!qs.length) return null;
    const vh = window.innerHeight || 800;
    let best = null;
    let bestScore = -1;
    for (const el of qs){
      const r = el.getBoundingClientRect();
      const visibleTop = Math.max(0, r.top);
      const visibleBottom = Math.min(vh, r.bottom);
      const visible = Math.max(0, visibleBottom - visibleTop);
      const score = visible - Math.abs(r.top) * 0.25; 
      if (score > bestScore){ bestScore = score; best = el; }
    }
    return best;
  }
  document.addEventListener("keydown", e=>{
    if (state.mode!=="exam") return;
    if (e.ctrlKey && e.key==="Enter"){
      e.preventDefault(); onFinish?.(); return;
    }
    const k = e.key.toUpperCase();
    if (!LETTERS_CONST.includes(k)) return;
    const top = mostVisibleQuestion();
    if (!top) return;
    const qN = Number(top.dataset.q);
    e.preventDefault(); onPickLetter?.(qN, k);
  });
}

// js/ui.js - openSummaryModal Güncellemesi

let summaryChartInstance = null;
let subjectChartInstance = null; // Konu grafiği için yeni instance


// Konu grafiğini (özet modalındaki) tek yerden yeniden çiz.
export function refreshSubjectChart(){
  const sCtx = document.getElementById("subjectChart");
  const state = window.__APP_STATE;
  if (!sCtx || !window.Chart || !state?.parsed) return;

  if (subjectChartInstance) subjectChartInstance.destroy();

  const subjMap = {}; // { "Matematik": 3, "Türkçe": 1 }

  state.parsed.questions.forEach(q => {
    if (!q) return;

    const subject = getQuestionSubject(q);
    const userAns = state.answers?.get?.(q.n);
    const correctId = state.parsed.answerKey?.[q.n];

    // "Konu Bazlı Hata Analizi": sadece yanlışları say
    if (userAns && correctId) {
      const chosenId = getChosenOptionId(q, userAns);
      if (chosenId && String(chosenId) !== String(correctId)) {
        subjMap[subject] = (subjMap[subject] || 0) + 1;
      }
    }
  });

  const labels = Object.keys(subjMap);
  const dataValues = Object.values(subjMap);

  const wrap = document.getElementById("subjectAnalysisWrap");
  if (!labels.length){
    if (wrap) wrap.style.display = "none";
    return;
  }
  if (wrap) wrap.style.display = "block";

  subjectChartInstance = new Chart(sCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Hatalı Soru",
        data: dataValues,
        backgroundColor: "rgba(255, 69, 58, 0.6)",
        borderColor: "#FF453A",
        borderWidth: 1,
        borderRadius: 5
      }]
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { display: false }, ticks: { stepSize: 1, color: "#8e8e93" } },
        y: { grid: { display: false }, ticks: { color: "#8e8e93" } }
      }
    }
  });
}

export function openSummaryModal({ total, answered, correct, score, wrong=0, blank=0, keyMissing=0, timeSpent='0:00', title }){
  const overlay = document.getElementById("summaryModal");
  if (!overlay) return;

  const sub = document.getElementById("summarySub");
  if (sub) sub.textContent = title ? `"${title}" sonuçları` : "Sonuçlar";

  // Veri Yaz
  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent = String(v ?? 0); };
  set("mSumQ", total); set("mSumA", answered); set("mSumC", correct);
  set("mSumW", wrong); set("mSumB", blank); set("mScoreDisplay", score);

  // Süre Hesap
  let avgText = "-";
  if (answered > 0 && timeSpent) {
    const parts = timeSpent.split(":");
    if (parts.length === 2) {
      const totalSec = (parseInt(parts[0]) * 60) + parseInt(parts[1]);
      const avg = Math.round(totalSec / answered);
      avgText = avg + "sn";
    }
  }
  set("mSumAvg", avgText);

// ============================================================
  // 🔥 YENİ EKLENEN KISIM: TOPLU ÖDÜL TÖRENİ 🔥
  // ============================================================
  
  // Eğer en az 1 doğru varsa ve bu bir sınav sonucuysa ödül ver
  if (correct > 0) {
      
      // 1. Pati'ye Mamaları Yükle (Doğru sayısı kadar)
      if (window.PatiManager) {
          // Kullanıcıya bildirim gösterelim (Toast mesajı gibi)
          showToast({ 
              title: "Harika İş! 🎉", 
              msg: `${correct} doğru cevap için ${correct} mama kazandın!`, 
              kind: "ok" 
          });
          
          window.PatiManager.addFood(correct);
      }

      // 2. BÜYÜK KUTLAMA (Konfeti Şöleni)
      // Daha uzun ve görkemli bir patlama olsun
      var duration = 3 * 1000;
      var animationEnd = Date.now() + duration;
      var defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

      function random(min, max) { return Math.random() * (max - min) + min; }

      var interval = setInterval(function() {
        var timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) { return clearInterval(interval); }
        var particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } }));
      }, 250);
  }
  // ============================================================
  
  // --- 1. GRAFİK: Genel Doughnut ---
  const ctx = document.getElementById('summaryChart');
  if (ctx && window.Chart) {
    if (summaryChartInstance) summaryChartInstance.destroy();
    summaryChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ["Doğru", "Yanlış", "Boş"],
        datasets: [{
          data: [correct, wrong, blank],
          backgroundColor: ['#34C759', '#FF453A', '#3a3a3c'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: true } }
      }
    });
  }

  // --- 2. GRAFİK: Konu Analizi ---
  refreshSubjectChart();

// --- Buton ve Modal Mantığı (Değişmedi) ---
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden","false");
  const close = () => closeSummaryModal();

  const btnX = document.getElementById("btnCloseSummary");
  const btnOk = document.getElementById("btnOkSummary");
  if (btnX) btnX.onclick = close;
  if (btnOk) btnOk.onclick = close;

  const btnReview = document.getElementById("btnReviewWrongs");
  if (btnReview) {
    btnReview.style.display = (wrong > 0) ? "block" : "none";
    const newBtnRev = btnReview.cloneNode(true);
    btnReview.parentNode.replaceChild(newBtnRev, btnReview);
    newBtnRev.onclick = () => {
      close();
      const chkWrong = document.getElementById("showOnlyWrong");
      if (chkWrong) { chkWrong.checked = true; chkWrong.dispatchEvent(new Event('change')); }
      const firstWrong = document.querySelector(".navBtn.wrong");
      if (firstWrong) firstWrong.click();
    };
  }

  const btnRetry = document.getElementById("btnRetryWrongs");
  if (btnRetry) {
    btnRetry.style.display = (wrong > 0) ? "block" : "none";
    const newBtnRetry = btnRetry.cloneNode(true);
    btnRetry.parentNode.replaceChild(newBtnRetry, btnRetry);
newBtnRetry.onclick = () => {
  try {
    const state = window.__APP_STATE;
    const paintAll = window.__APP_PAINT_ALL;
    const persist  = window.__APP_PERSIST;

    if (!state || !state.parsed) { alert("Sınav verisi bulunamadı."); return; }

    const wrongQuestions = (state.parsed.questions || []).filter(q => {
      const userAns = state.answers?.get?.(q.n);
      const correctId = state.parsed.answerKey?.[q.n];
      if (!correctId) return false;
      const correctLetter = getCorrectDisplayLetter(q, correctId);
      return userAns && userAns !== correctLetter;
    });

    if (wrongQuestions.length === 0) { alert("Tekrarlanacak yanlış soru bulunamadı."); return; }

    // ⚠️ Not: Burada orijinal parsed'ı ezmek yerine istersen clone yapabiliriz.
    state.parsed.questions = wrongQuestions;
    state.answers = new Map();
    state.mode = "exam";
    state.startedAt = new Date().toISOString(); // app.js formatıyla uyumlu
    state.timeLeftSec = state.durationSec ?? (20*60);

    // En garantisi: tek yerden render akışı
    paintAll?.();
    persist?.();

    close();

    const chkWrong = document.getElementById("showOnlyWrong");
    if (chkWrong) chkWrong.checked = false;

    showToast?.({ title:"Tekrar Başladı", msg:`${wrongQuestions.length} yanlış soru hazırlanıyor.`, kind:"warn" });
    window.scrollTo({ top: 0, behavior: "smooth" });

  } catch (e) {
    console.error(e);
    alert("Hata oluştu: " + e.message);
  }
};

  }

  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  function esc(e){ if (e.key === "Escape"){ close(); document.removeEventListener("keydown", esc); } }
  document.addEventListener("keydown", esc);
}

export function closeSummaryModal(){
  const overlay = document.getElementById("summaryModal");
  if (overlay){ 
    overlay.style.display = "none"; 
    overlay.setAttribute("aria-hidden","true");
  }
}

// ================= SRS MODAL (GELİŞMİŞ & TÜRKÇE) =================
let srsChartInstance = null;

export function openSrsModal(data) {
  const overlay = document.getElementById("srsModal");
  if (!overlay) return;

  // 1. HTML Şablonunu Oluştur (Türkçe ve İkonlu)
  const template = `
    <div class="modalCard">
      <div class="modalTop">
        <div>
          <div class="modalTitle">🧠 Hafıza Analizi</div>
          <div class="modalSub">Aralıklı Tekrar (SM-2) İstatistikleri</div>
        </div>
        <button id="btnCloseSrsInternal" class="modalClose">✕</button>
      </div>

      <div class="srs-grid">
        <div class="srs-card highlight">
          <div class="srs-val" id="srsTotal">-</div>
          <div class="srs-label">📂 Toplam Soru</div>
        </div>
        <div class="srs-card urgent">
          <div class="srs-val" id="srsDue">-</div>
          <div class="srs-label">🔥 Bugün Çözülecek</div>
        </div>
        <div class="srs-card">
          <div class="srs-val" id="srsTomorrow">-</div>
          <div class="srs-label">📅 Yarına Kalan</div>
        </div>
        <div class="srs-card">
          <div class="srs-val" id="srsAvgEf">-</div>
          <div class="srs-label">⚡ Ort. Kolaylık (EF)</div>
        </div>
        <div class="srs-card">
          <div class="srs-val" id="srsLearning">-</div>
          <div class="srs-label">🌱 Öğrenme Aşamasında</div>
        </div>
        <div class="srs-card good">
          <div class="srs-val" id="srsMature">-</div>
          <div class="srs-label">🧠 Kalıcı Hafıza</div>
        </div>
      </div>

      <div class="chart-wrapper">
        <canvas id="srsChart"></canvas>
      </div>

      <div class="divider" style="margin: 12px 0;"></div>

      <div class="modalSub muted" style="margin:0; font-size:13px;">Bugun konu bazli tekrar</div>
      <div id="srsSubjectToday" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"></div>

      <div class="modalSub muted" style="margin-top:12px; font-size:13px;">Yarin konu bazli</div>
      <div id="srsSubjectTomorrow" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;"></div>

      <div class="modalActions">
        <button id="btnOkSrsInternal" class="primary">Tamam</button>
      </div>
    </div>
  `;

  // HTML'i bas
  overlay.innerHTML = template;

  // 2. Verileri Doldur
  const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = String(v ?? 0); };
  
  set("srsTotal", data?.total ?? 0);
  set("srsDue", data?.dueToday ?? data?.due ?? 0);
  set("srsTomorrow", data?.dueTomorrow ?? 0);
  set("srsLearning", data?.learning ?? 0);
  set("srsMature", data?.mature ?? 0);
  
  const efEl = document.getElementById("srsAvgEf");
  if (efEl) efEl.textContent = (data?.avgEf ?? 2.5).toFixed(2);

  // 2.5 Konu bazli ozet (opsiyonel)
  const bySubject = data?.bySubject || {};
  const renderSubjectChips = (mountId, field) => {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const entries = Object.entries(bySubject)
      .map(([name, v]) => [name, Number(v?.[field] || 0)])
      .filter(([,c]) => c > 0)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 12);

    if (!entries.length) {
      mount.innerHTML = '<span class="muted" style="font-size:12px; opacity:0.9;">Bu aralikta konu verisi yok.</span>';
      return;
    }

    mount.innerHTML = entries.map(([name, c]) => {
      const safe = String(name || 'Genel');
      return `<button type="button" class="pill srs-subject-chip" data-subject="${safe}" title="${safe} için tekrar başlat">${safe} <b class="mono">${c}</b></button>`;
    }).join('');

    // Click -> start SRS for this subject (delegates to app.js global)
    mount.querySelectorAll(".srs-subject-chip").forEach(btn => {
      const sub = btn.getAttribute("data-subject") || "Genel";

      // Deterministic accent per subject (theme-friendly, no external deps)
      let h = 0;
      for (let i=0;i<sub.length;i++){
        h = (h * 31 + sub.charCodeAt(i)) % 360;
      }
      const col = `hsl(${h}, 78%, 62%)`;

      btn.style.borderColor = col;
      btn.onmouseenter = () => { btn.style.boxShadow = `0 0 14px ${col}`; };
      btn.onmouseleave = () => { btn.style.boxShadow = ""; };

      btn.onclick = () => {
        try { closeSrsModal(); } catch (e) {}
        if (typeof window.startSrsBySubject === "function") {
          window.startSrsBySubject(sub);
        } else {
          showWarn?.("SRS başlatıcı bulunamadı (startSrsBySubject)");
        }
      };
    });

  };

  renderSubjectChips('srsSubjectToday', 'dueToday');
  renderSubjectChips('srsSubjectTomorrow', 'dueTomorrow');

  // 3. Grafiği Çiz
  // 3. Grafiği Çiz (GÜNCELLENMİŞ VERSİYON)
  const ctx = document.getElementById('srsChart');
  if (ctx && window.Chart) {
    if (srsChartInstance) srsChartInstance.destroy();
    
    const b = data?.buckets || {};
    
    // Tema Rengi Kontrolü (Grafik yazıları için)
    const isLight = document.body.classList.contains("light-mode") || document.body.classList.contains("sepia-mode");
    const textColor = isLight ? '#666' : '#aaa';
    const gridColor = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';

    srsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ["Yeni", "Başlangıç", "Gelişiyor", "İyi", "Uzman"],
        datasets: [{
          label: 'Soru Sayısı',
          data: [b["0"]||0, b["1"]||0, b["2"]||0, b["3"]||0, b["4+"]||0],
          backgroundColor: [
            '#ef4444', // Yeni (Kırmızı)
            '#f97316', // Başlangıç (Turuncu)
            '#eab308', // Gelişiyor (Sarı)
            '#22c55e', // İyi (Yeşil)
            '#3b82f6'  // Uzman (Mavi)
          ],
          borderRadius: 4,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { 
            backgroundColor: 'rgba(0,0,0,0.8)',
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 10,
            cornerRadius: 8,
            displayColors: false
          }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 } }
          },
          y: { 
            beginAtZero: true, 
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 10 } }
          }
        }
      }
    });
  }

  // 4. Modalı Göster ve Kapatma Olaylarını Bağla
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden", "false");

  const close = () => closeSrsModal();
  
  // Yeni oluşturulan butonlara event bağla
  document.getElementById("btnCloseSrsInternal").onclick = close;
  document.getElementById("btnOkSrsInternal").onclick = close;
  
  // Dışarı tıklama ve ESC
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  
  // Önceki listenerları temizlemek için (closure sorunu olmaması adına)
  const escHandler = (e) => { if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); } };
  document.addEventListener("keydown", escHandler);
}

export function closeSrsModal(){
  const overlay = document.getElementById("srsModal");
  if(overlay) {
    overlay.style.display="none";
    overlay.setAttribute("aria-hidden", "true");
  }
}

// ================= FOCUS NAV (FULL SÜRÜM) =================
const FOCUS_PAGE_SIZE = 20;

function ensureFocusMiniNav(){
  let el = document.getElementById("focusMiniNav");
  if (el) return el;
  el = document.createElement("div");
  el.id = "focusMiniNav";
  el.className = "focusMiniNav";
  document.body.appendChild(el);
  el.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    if (btn.classList.contains("navDot")) {
      const qn = Number(btn.dataset.qn);
      const qEl = document.querySelector(`.q[data-q="${qn}"]`);
      if (qEl) qEl.scrollIntoView({behavior:"smooth", block:"start"});
      const winState = window.__APP_STATE; 
      if (winState) {
        winState.activeQn = qn;
        winState.navPage = Math.floor((qn-1)/FOCUS_PAGE_SIZE);
        refreshFocusMiniNav(winState);
      }
      return;
    }
    const act = btn.dataset.act;
    if (!act) return;
    const st = window.__APP_STATE;
    if (!st?.parsed) return;
    const total = st.parsed.questions.length;
    const maxPage = Math.max(0, Math.ceil(total / FOCUS_PAGE_SIZE) - 1);
    if (act === "prev") st.navPage = Math.max(0, (st.navPage || 0) - 1);
    if (act === "next") st.navPage = Math.min(maxPage, (st.navPage || 0) + 1);
    renderFocusMiniNav(st);
  });
  return el;
}

export function renderFocusMiniNav(state) {
  const isFocus = document.body.classList.contains("focusMode");
  const el = ensureFocusMiniNav();
  if (!isFocus) { el.style.display = "none"; return; }
  el.style.display = "flex";
  
  const qs = state?.parsed?.questions || [];
  const total = qs.length;
  const pages = Math.max(1, Math.ceil(total / FOCUS_PAGE_SIZE));
  const page = clampInt(state?.navPage ?? 0, 0, pages - 1);
  if (state) state.navPage = page;
  window.__APP_STATE = state;

  const start = page * FOCUS_PAGE_SIZE + 1;
  const end = Math.min(total, start + FOCUS_PAGE_SIZE - 1);
  const currentRangeKey = `${start}-${end}-${total}`;
  if (el.dataset.rangeKey === currentRangeKey) {
    refreshFocusMiniNav(state);
    return; 
  }
  el.dataset.rangeKey = currentRangeKey;
  el.innerHTML = "";

  const btnPrev = document.createElement("button");
  btnPrev.className = "navPageBtn";
  btnPrev.textContent = "‹";
  btnPrev.dataset.act = "prev";
  btnPrev.disabled = page <= 0;
  el.appendChild(btnPrev);

  const dots = document.createElement("div");
  dots.className = "dots";
  el.appendChild(dots);

  for (let qn = start; qn <= end; qn++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "navDot";
    b.dataset.qn = String(qn);
    b.textContent = String(qn);
    dots.appendChild(b);
  }

  const btnNext = document.createElement("button");
  btnNext.className = "navPageBtn";
  btnNext.textContent = "›";
  btnNext.dataset.act = "next";
  btnNext.disabled = page >= pages - 1;
  el.appendChild(btnNext);
  refreshFocusMiniNav(state);
}

export function refreshFocusMiniNav(state){
  const el = document.getElementById("focusMiniNav");
  if (!el || el.style.display === "none") return;
  const activeQn = Number(state?.activeQn || 1);
  const answered = state?.answers || new Map();
  const dots = el.querySelector(".dots");
  if (!dots) return;
  const buttons = dots.querySelectorAll(".navDot");
  buttons.forEach(btn => {
    const qn = Number(btn.dataset.qn);
    const isDone = answered.has(qn) && answered.get(qn) != null;
    const isActive = (qn === activeQn);
    if (isDone) btn.classList.add("done"); else btn.classList.remove("done");
    if (isActive) btn.classList.add("active"); else btn.classList.remove("active");
  });
  const total = state?.parsed?.questions?.length || 0;
  const pages = Math.max(1, Math.ceil(total / FOCUS_PAGE_SIZE));
  const page = state?.navPage || 0;
  const prev = el.querySelector('[data-act="prev"]');
  const next = el.querySelector('[data-act="next"]');
  if (prev) prev.disabled = page <= 0;
  if (next) next.disabled = page >= pages - 1;
}

function clampInt(v, a, b) {
  const n = Number.isFinite(Number(v)) ? Number(v) : a;
  return Math.max(a, Math.min(b, n));
}

// ================= TEMA YÖNETİMİ =================
export function initTheme() {
  const btn = document.getElementById("btnThemeToggle");
  if (!btn) return;

  const savedTheme = localStorage.getItem("APP_THEME") || "dark";
  applyTheme(savedTheme);

  btn.onclick = () => {
    let current = document.body.classList.contains("light-mode") ? "light" 
                : document.body.classList.contains("sepia-mode") ? "sepia" 
                : "dark";
    
    let next = "dark";
    if (current === "dark") next = "light";
    else if (current === "light") next = "sepia";
    
    applyTheme(next);
  };
}

function applyTheme(themeName) {
  document.body.classList.remove("light-mode", "sepia-mode");
  
  if (themeName === "light") document.body.classList.add("light-mode");
  if (themeName === "sepia") document.body.classList.add("sepia-mode");
  
  const btn = document.getElementById("btnThemeToggle");
  if (btn) {
    if (themeName === "dark") btn.textContent = "🌙 Koyu";
    if (themeName === "light") btn.textContent = "☀️ Açık";
    if (themeName === "sepia") btn.textContent = "📖 Kitap";
  }
  localStorage.setItem("APP_THEME", themeName);
}

/* ================= TANITIM TURU MANTIĞI ================= */
let currentStep = 0;

// Tanıtım İçeriği Verisi (GÜNCELLENDİ: 4 ADIM OLDU)
const onboardingData = [
  {
    title: "🚀 Başlangıç & Hazırlık",
    step: "Adım 1 / 4: Dosya ve Ayarlar", // 1/4 oldu
    items: [
      { icon: "📂", t: "Esnek Yükleme", d: "PDF, DOCX veya metin kopyalayarak sınavlarını saniyeler içinde içeri aktar." },
      { icon: "⏱️", t: "Süre Yönetimi", d: "Gerçek sınav provası için kronometreni kur ve zamanı verimli kullan." },
      { icon: "🔀", t: "Akıllı Karıştırma", d: "Soru ve şıkları karıştırarak her seferinde benzersiz bir deneme oluştur." },
      { icon: "🌙", t: "Göz Dostu Temalar", d: "Karanlık, Aydınlık ve Sepya modları ile her ortamda konforlu çalış." }
    ]
  },
  {
    title: "✨ Yapay Zeka Desteği",
    step: "Adım 2 / 4: Akıllı Çözümler", // 2/4 oldu
    items: [
      { icon: "🤖", t: "AI Cevap Anahtarı", d: "Anahtarı olmayan dosyaları Gemini ile çözdür." },
      { icon: "🏷️", t: "AI Konu Tespiti", d: "Sorularının konularını (Örn: Paragraf, Türev) otomatik etiketle." },
      { icon: "🔍", t: "Neden Doğru?", d: "Hatalı cevaplarında 'Neden?' butonuna basarak detaylı açıklama al." },
      { icon: "♻️", t: "Benzer Soru Üret", d: "Hatalı olduğun sorunun mantığında yeni bir soru üretilmesini sağla." }
    ],
    footer: `<div style="margin-top:15px; font-size:12px; text-align:center; padding:12px; background:rgba(168, 85, 247, 0.1); border-radius:10px; border:1px solid rgba(168, 85, 247, 0.3);">
      🔑 <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#a855f7; text-decoration:underline; font-weight:600;">Buraya tıklayarak ücretsiz Gemini API anahtarını alabilirsin.</a>
    </div>`
  },
  {
    title: "🧠 Öğrenme ve Analiz",
    step: "Adım 3 / 4: Kalıcı Hafıza", // 3/4 oldu
    items: [
      { icon: "📄", t: "Gelişmiş Hata Raporu", d: "HTML raporunda konu dağılımını ve eksiklerini grafiklerle incele." },
      { icon: "📅", t: "SM-2 Algoritması", d: "SRS sistemi, hatalarını unutmana izin vermeden sana tekrar hatırlatır." },
      { icon: "📊", t: "Performans Karnesi", d: "Sınav sonu grafiklerini inceleyerek başarı oranını anlık takip et." },
      { icon: "🎯", t: "Focus Modu", d: "Tüm arayüzü gizle, sadece soruya odaklan ve sınav stresini yönet." }
    ]
  },
  // --- YENİ EKLENEN ADIM ---
  {
    title: "🐶 Oyunlaştırma & Motivasyon",
    step: "Adım 4 / 4: Pati Seni Bekliyor!",
    items: [
      { icon: "🍖", t: "Mama Kazan", d: "Her doğru cevap sana mama (kemik) kazandırır. Sınav bitince toplu ödül alırsın!" },
      { icon: "🥺", t: "Pati Acıkabilir", d: "Pati zamanla acıkır. Eğer uzun süre soru çözmezsen üzülür, onu ihmal etme." },
      { icon: "🆙", t: "Seviye Atla", d: "Kazandığın mamalarla Pati'yi besle, tokluk barını doldur ve seviyesini (LVL) yükselt." },
      { icon: "🎉", t: "Kutlama", d: "Sınavı başarıyla bitirdiğinde konfeti şöleniyle başarını kutla." }
    ]
  }
];

// Sayfa Değiştirme Fonksiyonu
window.changeStep = function(dir) {
  currentStep += dir;
  // Son adımdan sonra "Başlayalım" denirse kapat
  if (currentStep >= onboardingData.length) {
    closeWelcomeModal();
    return;
  }
  renderStep();
};

// Modalı Kapatma ve Kaydetme
window.closeWelcomeModal = function() {
  const modal = document.getElementById('welcomeModal');
  if(modal) {
      modal.style.display = 'none';
      localStorage.setItem('welcome_shown', 'true');
  }
};

// İçeriği Ekrana Basma Fonksiyonu
function renderStep() {
  const data = onboardingData[currentStep];
  
  // Başlıkları Güncelle
  document.getElementById('welcomeTitle').textContent = data.title;
  document.getElementById('welcomeStepText').textContent = data.step;
  
  // Listeyi Oluştur
  const content = document.getElementById('onboardingContent');
  content.innerHTML = `
    <div class="onboarding-page" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; animation: fadeIn 0.4s ease;">
      ${data.items.map(item => `
        <div class="step-item" style="background: rgba(255,255,255,0.03); padding: 12px; border-radius: 12px; border: 1px solid var(--stroke); display: flex; gap: 12px; align-items: start;">
          <div class="step-icon" style="font-size: 20px; background:rgba(255,255,255,0.05); width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:8px;">${item.icon}</div>
          <div class="step-text" style="font-size: 13px; color: var(--text-muted); line-height: 1.4;">
            <strong style="display: block; color: var(--text-main); margin-bottom: 2px;">${item.t}</strong>
            ${item.d}
          </div>
        </div>
      `).join('')}
    </div>
    ${data.footer || ''}
  `;

  // Butonları Yönet
  const btnPrev = document.getElementById('btnPrevStep');
  const btnNext = document.getElementById('btnNextStep');
  
  btnPrev.style.display = currentStep === 0 ? 'none' : 'block';
  btnNext.textContent = currentStep === onboardingData.length - 1 ? 'Başlayalım! 🚀' : 'Devam Et';
  
  // Noktaları (Dots) Güncelle
  const dots = document.querySelectorAll('#stepDots .dot');
  dots.forEach((dot, idx) => {
    if (idx === currentStep) {
        dot.style.background = 'var(--accent)';
        dot.style.width = '24px';
        dot.style.opacity = '1';
    } else {
        dot.style.background = 'var(--glass2)';
        dot.style.width = '8px';
        dot.style.opacity = '0.5';
    }
  });
}

// Başlatma (Sayfa Yüklendiğinde)
window.addEventListener('load', () => {
  if (!localStorage.getItem('welcome_shown')) {
    const m = document.getElementById('welcomeModal');
    if(m) {
        m.style.display = 'flex';
        renderStep();
    }
  }
});

/* ================= AI UYARISI TOGGLE ================= */
window.toggleDisclaimer = function() {
  const bar = document.getElementById('aiDisclaimer');
  if (!bar) return;
  
  // Sınıfı değiştir (Aç/Kapa)
  bar.classList.toggle('minimized');
  
  // Tercihi kaydet (İstersen bu kısmı silebilirsin, her açılışta açık gelir)
  const isMinimized = bar.classList.contains('minimized');
  localStorage.setItem('ai_disclaimer_minimized', isMinimized);
}

// Sayfa yüklendiğinde tercihi hatırla
window.addEventListener('load', () => {
  const isMinimized = localStorage.getItem('ai_disclaimer_minimized') === 'true';
  const bar = document.getElementById('aiDisclaimer');
  if (isMinimized && bar) {
    bar.classList.add('minimized');
  }
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".srsBtn");
  if (!btn) return;

  const quality = Number(btn.dataset.quality);
  const qWrap = btn.closest(".srsWrap");
  if (!qWrap) return;

  const qn = Number(qWrap.dataset.q);
  if (!qn || !window.__APP_STATE) return;

  const q = window.__APP_STATE.parsed.questions.find(x => x.n === qn);
  if (!q) return;

  const reviewId = window.__APP_STATE.reviewId || null;

  // 🔥 SM-2 override
  if (typeof setSrsQualityByQuestion === "function") {
    setSrsQualityByQuestion(q, quality, reviewId);
  }

// ✅ Mini feedback: Zor/Orta/Kolay açıklaması + animasyon
const wrap = btn.closest(".srsWrap");
const hint = wrap?.querySelector(".srsHint");
if (hint) {
  const msg =
    quality === 3 ? "Zor seçtin → hafıza taze değil. Bu yüzden yarın tekrar planlanır." :
    quality === 4 ? "Orta → iyi gidiyor. Aralık uzatılır." :
    "Kolay → çok net. Aralık daha da uzar.";

  hint.textContent = msg;

  // küçük “pulse” animasyonu (CSS class)
  wrap.classList.remove("srsPulse");
  // reflow trick
  void wrap.offsetWidth;
  wrap.classList.add("srsPulse");
}

  // UI feedback
  btn.closest(".srsWrap").querySelectorAll(".srsBtn")
    .forEach(b => b.classList.remove("active"));
  btn.classList.add("active");

  // İsteğe bağlı: toast
  showToast?.({
    title: "SRS",
    msg: `Tekrar aralığı güncellendi (${quality})`,
    kind: "ok"
  });
});



