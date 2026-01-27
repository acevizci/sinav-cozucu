// ================= IMPORTS =================
import { el, escapeHtml } from "./utils.js";
import { LETTERS_CONST, getCorrectDisplayLetter, getChosenOptionId } from "./shuffle.js";

// ================= SAFE HELPERS =================
function safe(id){ return document.getElementById(id); }
function safeShow(id, display="block"){ const e=safe(id); if(e) e.style.display=display; }
function safeHide(id){ const e=safe(id); if(e) e.style.display="none"; }
function safeText(id, v){ const e=safe(id); if(e) e.textContent=v; }

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

export function showToast({ title="Bildirim", msg="", kind="ok", timeout=2600 }){
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
  ov.style.display = on ? "flex" : "none";
  ov.setAttribute("aria-hidden", on ? "false" : "true");
}

// ================= MODE UI =================
export function updateModeUI(state, wrongStats){
  safeText("modeLabel", state.mode === "prep" ? "Hazırlık" : state.mode === "exam" ? "Sınav" : "Sonuç");
  safeText("keyLabel", state.parsed ? (state.parsed.keyCount ? "var" : "yok") : "—");

  const btn = (id, cond) => { const b=safe(id); if(b) b.disabled=!cond; };
  btn("btnStart", state.parsed && state.mode==="prep");
  btn("btnFinish", state.parsed && state.mode==="exam");
  btn("btnExportCSV", state.parsed && state.mode==="result");
  btn("btnExportJSON", state.parsed && state.mode==="result");

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

// ================= NAVIGATION =================
export function buildNav(state){
  const grid = safe("navGrid");
  if (!grid) return;
  
  const total = state.parsed ? state.parsed.questions.length : 0;
  if (total === 0) {
    grid.innerHTML = "";
    return;
  }
  
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

    const myAns = answers.get(qn);
    if (isResult) {
      const correctId = keyMap[qn];
      const qObj = state.parsed.questions.find(x=>x.n===qn);
      const chosenId = qObj ? getChosenOptionId(qObj, myAns) : null;
      
      if (!myAns) btn.classList.add("empty-result");
      else if (!correctId) btn.classList.add("answered");
      else if (chosenId === correctId) btn.classList.add("correct");
      else btn.classList.add("wrong");
    } else {
      if (myAns) btn.classList.add("answered");
    }
  });
}

// ================= AI (GEMINI) ÖZEL GİRİŞ PENCERESİ MANTIĞI =================
function requestApiKeyFromModal() {
  return new Promise((resolve) => {
    const modal = document.getElementById("apiKeyModal");
    const input = document.getElementById("inpApiKeyUi");
    const errorBox = document.getElementById("keyErrorUi"); // YENİ
    const btnSave = document.getElementById("btnSaveKeyUi");
    const btnCancel = document.getElementById("btnCancelKeyUi");

    // Modal HTML'de yoksa (eski index.html varsa) fallback yap
    if (!modal || !input) {
      const pKey = window.prompt("Lütfen Gemini API Anahtarınızı girin:\n(AIza... ile başlayan kod)");
      resolve(pKey ? pKey.trim() : null);
      return;
    }

    // Modalı Aç ve Temizle
    modal.style.display = "flex";
    input.value = "";
    input.style.borderColor = "#444"; // Kenarlığı sıfırla
    if(errorBox) errorBox.style.display = "none"; // Hatayı gizle
    input.focus();

    // Kaydetme Mantığı
    const handleSave = () => {
      const val = input.value.trim();
      
      // Basit doğrulama (AIza... genelde 39 karakterdir, biz 20 diyelim)
      if (val.length > 20 && val.startsWith("AIza")) {
        cleanup();
        resolve(val);
      } else {
        // HATA DURUMU: Alert yerine UI güncellemesi
        if(errorBox) {
          errorBox.textContent = "⚠️ Geçersiz anahtar! 'AIza' ile başlamalı.";
          errorBox.style.display = "block";
        }
        input.style.borderColor = "#ff453a"; // Çerçeveyi kırmızı yap
        
        // Kullanıcı tekrar yazmaya başlarsa hatayı sil
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
      btnSave.onclick = null;
      btnCancel.onclick = null;
      input.onkeydown = null;
      if(input) input.oninput = null;
    }
  });
}

// ================= AI (GEMINI) FONKSİYONU (GÜNCELLENMİŞ) =================
async function runGeminiAnalysis(qN) {
  const box = document.getElementById(`ai-box-${qN}`);
  if (!box) return;

  // 1. API Key Kontrolü (MODAL İLE)
  let apiKey = localStorage.getItem("GEMINI_KEY");
  
  if (!apiKey) {
    apiKey = await requestApiKeyFromModal();
    if (!apiKey) return; // İptal edildi
    localStorage.setItem("GEMINI_KEY", apiKey);
  }

  // 2. UI Hazırla
  box.style.display = "block";
  box.innerHTML = `<div class="ai-loading" style="color:#a855f7">✨ Uygun model aranıyor ve soru inceleniyor...</div>`;
  
  // 3. Veriyi Çek
  const state = window.__APP_STATE;
  if (!state || !state.parsed) { 
      box.innerHTML="<span style='color:red'>Hata: Sınav verisi okunamadı.</span>"; return; 
  }
  
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

  // 4. Prompt Hazırla
  const aiPrompt = `
    Sen bir öğretmensin. Aşağıdaki test sorusunu analiz et.
    SORU: ${q.text}
    DOĞRU CEVAP: (${correctLetter}) ${correctText}
    GÖREV:
    1. Bu cevabın neden doğru olduğunu 1-2 cümleyle açıkla.
    2. Çeldiricilerin neden yanlış olduğuna kısaca değin.
    3. Kısa, eğitici ve samimi ol. Türkçe cevap ver.
  `;

  try {
    // --- ADIM 5: DOĞRU MODELİ OTOMATİK BUL ---
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
            
            if (bestModel) {
                console.log("Seçilen Model:", bestModel.name);
                selectedModel = bestModel.name;
            }
        }
    } catch (e) {
        console.warn("Model listesi alınamadı, varsayılan deneniyor:", e);
    }

    // --- ADIM 6: CEVAP ÜRET ---
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${selectedModel}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }] }] })
    });

    if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error?.message || response.statusText);
    }

    const data = await response.json();
    
    if(!data.candidates || data.candidates.length === 0) {
        throw new Error("Model boş cevap döndürdü.");
    }

    const aiText = data.candidates[0].content.parts[0].text;
    const formattedText = aiText
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");

    box.innerHTML = `<strong>🤖 Gemini Açıklaması (${selectedModel.replace('models/', '')}):</strong><br><br>${formattedText}`;

  } catch (err) {
    console.error("Gemini Hatası:", err);
    box.innerHTML = `
      <div style="color:#ef4444; font-size:12px; border:1px solid #ef4444; padding:8px; border-radius:6px; background:rgba(239,68,68,0.1);">
        <strong>⚠️ Hata:</strong> ${err.message}<br><br>
        <button onclick="localStorage.removeItem('GEMINI_KEY'); this.parentElement.innerHTML='Anahtar silindi. Tekrar deneyin.';" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
          Anahtarı Sil ve Tekrar Dene
        </button>
      </div>
    `;
  }
}

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
  // State'i global değişkene ata (Retry ve AI için)
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

    let badge = `<span class="badge">Soru</span>`;
    if (state.mode==="exam") badge = chosen ? `<span class="badge warn">İşaretli</span>` : `<span class="badge">Boş</span>`;
    if (state.mode==="result"){
      if (!correctId) badge=`<span class="badge">Anahtar yok</span>`;
      else if (chosen===correctLetter) badge=`<span class="badge ok">Doğru</span>`;
      else if (!chosen) badge=`<span class="badge warn">Boş</span>`;
      else badge=`<span class="badge bad">Yanlış</span>`;
    }

    // Buton HTML
    let aiBtnHtml = "";
    const showAiBtn = (state.mode === "result" && correctId && chosenId !== correctId);
    if (showAiBtn) {
      aiBtnHtml = `<button class="btn-ai-explain ai-trigger" data-qn="${q.n}">✨ Neden?</button>`;
    }

    const qDiv = document.createElement("div");
    qDiv.className="q";
    qDiv.dataset.q=q.n;
    qDiv.innerHTML=`
      <div class="qTop">
        <div class="qNum">${q.n}.</div>
        <div style="display:flex; align-items:center;">
          ${badge}
          ${aiBtnHtml}
        </div>
      </div>
      <div class="qText">${q.text}</div> <div class="opts"></div>
      <div id="ai-box-${q.n}" class="ai-box"></div>
    `;

    // Click Event Bağla
    if (showAiBtn) {
        const aiBtn = qDiv.querySelector('.ai-trigger');
        if (aiBtn) {
            aiBtn.addEventListener('click', (e) => {
                const qNum = parseInt(e.target.dataset.qn);
                runGeminiAnalysis(qNum);
            });
        }
    }

    const opts = qDiv.querySelector(".opts");
    for (const L of LETTERS_CONST){
      const opt = q.optionsByLetter?.[L];
      const text = (opt?.text||"").trim();
      if (!text) continue;

      const label=document.createElement("label");
      label.className="opt";
      if (state.mode==="result" && correctLetter){
        if (L===correctLetter) label.classList.add("correct");
        if (L===chosen && L!==correctLetter) label.classList.add("wrong");
      }
      label.innerHTML=`
        <input type="radio" name="q${q.n}" value="${L}" ${chosen===L?"checked":""} ${state.mode!=="exam"?"disabled":""}>
        <div><b>${L})</b> ${text}</div> `;
      opts.appendChild(label);
    }
    
    // SRS Widget
    if (state.mode==="result" && state.srsReview){
      const info = state.srsInfo?.[q.n] || null;
      const hasKey = !!correctId;
      const isCorrectNow = hasKey && chosen && correctLetter && chosen===correctLetter;
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
            <span class="srsBtns">
              <button class="srsBtn" data-quality="3">Zor</button>
              <button class="srsBtn" data-quality="4">Orta</button>
              <button class="srsBtn" data-quality="5">Kolay</button>
            </span>
          </div>
          <div class="srsHint muted">Bu sorunun tekrar aralığını seç.</div>
        `;
      }
      qDiv.appendChild(srsWrap);
    }
    area.appendChild(qDiv);
  }
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

// ================= SUMMARY MODAL (CHART & RETRY) =================
let summaryChartInstance = null;

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

  // Grafik
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
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  }

  // Butonlar
  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden","false");
  const close = () => closeSummaryModal();

  const btnX = document.getElementById("btnCloseSummary");
  const btnOk = document.getElementById("btnOkSummary");
  if (btnX) btnX.onclick = close;
  if (btnOk) btnOk.onclick = close;

  // 1. İncele
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

  // 2. Tekrarla (Re-Test)
  const btnRetry = document.getElementById("btnRetryWrongs");
  if (btnRetry) {
    btnRetry.style.display = (wrong > 0) ? "block" : "none";
    const newBtnRetry = btnRetry.cloneNode(true);
    btnRetry.parentNode.replaceChild(newBtnRetry, btnRetry);

    newBtnRetry.onclick = () => {
      try {
        const state = window.__APP_STATE;
        if (!state || !state.parsed) {
          alert("Sınav verisi bulunamadı."); return;
        }

        const wrongQuestions = state.parsed.questions.filter(q => {
          const userAns = state.answers.get(q.n);
          const correctId = state.parsed.answerKey[q.n];
          if (!correctId) return false;
          let correctLetter = null;
          if (q.optionsByLetter) {
             for(let [k,v] of Object.entries(q.optionsByLetter)){
               if(v.id === correctId) { correctLetter = k; break; }
             }
          }
          return userAns && userAns !== correctLetter;
        });

        if (wrongQuestions.length === 0) {
          alert("Tekrarlanacak yanlış soru bulunamadı."); return;
        }

        state.parsed.questions = wrongQuestions;
        state.answers = new Map();
        state.mode = "exam";
        state.startTime = Date.now();

        renderExam(state);
        updateModeUI(state, { total: wrongQuestions.length });
        buildNav(state);
        close();
        
        const chkWrong = document.getElementById("showOnlyWrong");
        if(chkWrong) chkWrong.checked = false;
        const chkBlank = document.getElementById("showOnlyBlank");
        if(chkBlank) chkBlank.checked = false;

        showToast({ title:"Tekrar Başladı", msg:`${wrongQuestions.length} yanlış soru hazırlanıyor.`, kind:"warn" });
        window.scrollTo({ top: 0, behavior: 'smooth' });

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
  if (overlay){ overlay.style.display = "none"; overlay.setAttribute("aria-hidden","true"); }
}

// ================= SRS MODAL =================
let srsChartInstance = null;
export function openSrsModal(data){
  const overlay = document.getElementById("srsModal");
  if (!overlay) return;
  const set = (id, v) => { const e=document.getElementById(id); if(e) e.textContent = String(v ?? 0); };
  set("srsTotal", data?.total ?? 0);
  set("srsDue", data?.dueToday ?? data?.due ?? 0);
  set("srsTomorrow", data?.dueTomorrow ?? 0);
  set("srsNext7", data?.dueNext7 ?? 0);
  set("srsLearning", data?.learning ?? 0);
  set("srsMature", data?.mature ?? 0);
  const efEl = document.getElementById("srsAvgEf");
  if (efEl) efEl.textContent = (data?.avgEf ?? 0).toFixed(2);

  const ctx = document.getElementById('srsChart');
  if (ctx && window.Chart) {
    if (srsChartInstance) srsChartInstance.destroy();
    const b = data?.buckets || {};
    srsChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ["Yeni", "L1", "L2", "L3", "Uzman"],
        datasets: [{
          label: 'Soru',
          data: [b["0"]||0, b["1"]||0, b["2"]||0, b["3"]||0, b["4+"]||0],
          backgroundColor: ['#ff453a','#ff9f0a','#ffd60a','#34c759','#0a84ff']
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x:{ grid:{display:false} }, y:{ beginAtZero:true, grid:{color:'rgba(255,255,255,0.1)'} } } }
    });
  }

  overlay.style.display = "flex";
  overlay.setAttribute("aria-hidden","false");
  const close = () => closeSrsModal();
  const btnX = document.getElementById("btnCloseSrs");
  const btnOk = document.getElementById("btnOkSrs");
  if (btnX) btnX.onclick = close;
  if (btnOk) btnOk.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener("keydown", function esc(e){ if (e.key === "Escape"){ close(); document.removeEventListener("keydown", esc); } });
}

export function closeSrsModal(){
  const overlay = document.getElementById("srsModal");
  if(overlay) overlay.style.display="none";
}

// ================= FOCUS NAV =================
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