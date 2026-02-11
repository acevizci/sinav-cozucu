// js/app/render.js
// Zero-behavior refactor: UI refresh functions extracted from app.js
// This module is intentionally stateful: app.js must call bindRenderContext() once during init.

import { el } from "../utils.js";
import {
  updateModeUI,
  updateStats,
  buildNav,
  refreshNavColors,
  refreshFocusMiniNav,
  renderExam,
} from "../ui.js";
import { wrongBookStats } from "../wrongBook.js";

let _ctx = null;

/**
 * Bind runtime dependencies that live in app.js scope.
 * Must be called once after app.js creates state/timer and defines helpers.
 */
export function bindRenderContext(ctx){
  _ctx = ctx || null;
}

function _requireCtx(){
  if (!_ctx || !_ctx.state) {
    throw new Error("[render] bindRenderContext() çağrılmadı veya ctx.state yok.");
  }
  return _ctx;
}

/* ===== MULTI-ANSWER HELPERS (same logic as app.js) ===== */
function toLetterSet(v){
  if (!v) return new Set();
  if (Array.isArray(v)) return new Set(v.map(x=>String(x).toUpperCase().trim()));
  // Tekil string ise temizle
  return new Set([String(v).toUpperCase().trim()]);
}

function setsEqual(a,b){
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/* ================= SUMMARY (GÜÇLENDİRİLMİŞ) ================= */
export function updateSummary(){
  const { state } = _requireCtx();
  if (!state.parsed) return;

  const total = state.parsed.questions.length;
  const answered = state.answers.size;
  const keyMap = state.parsed.answerKey || {};

  let correct = 0;
  for (const q of state.parsed.questions){
    const userVal = state.answers.get(q.n);
    if (!userVal) continue;

    let correctId = keyMap[q.n] || 
                    keyMap[String(q.n)] || 
                    keyMap[Number(q.n)] ||
                    q.answer || 
                    q.correctAnswer ||
                    q.dogruCevap ||
                    q._answerFromSolution;

    if (!correctId) continue;

    const chosenSet = toLetterSet(userVal);
    const correctSet = toLetterSet(correctId);
    
    if (chosenSet.size && correctSet.size && setsEqual(chosenSet, correctSet)) {
        correct++;
    }
  }

  const score = total ? Math.round((correct/total)*100) : 0;

  // Özet tablosu güncelle
  const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
  set("sumQ", total);
  set("sumA", answered);
  set("sumC", correct);
  set("sumS", score);
  
  // Modal içi değerler (varsa)
  set("mSumQ", total);
  set("mSumA", answered);
  set("mSumC", correct);
  set("mScoreDisplay", score);
}

/* ================= MOD A UI (AI Key) ================= */
export function updateAiSolveUI(){
  const { state } = _requireCtx();
  const wrap = el("aiSolveWrap");
  if (!wrap) return;
  const parsed = state.parsed;
  if (!parsed){ wrap.style.display = "none"; return; }

  const totalQ = parsed.questions?.length || 0;
  const keyCount = parsed.keyCount || 0;
  const cov = parsed.meta?.keyCoverage ?? (totalQ ? keyCount/totalQ : 0);

  // show AI solve if key is missing or partial (coverage < 95%) and we're not already on AI key
  const isAi = parsed.meta?.keySource === "ai";
  const shouldShow = (totalQ > 0) && !isAi && (keyCount === 0 || cov < 0.95);
  wrap.style.display = shouldShow ? "block" : "none";
}

/* ================= UI REFRESH (ROZETLİ VERSİYON) ================= */
export function paintAll(){
  const { state, setupQuestionObserver, updateFocusHUD } = _requireCtx();

  const wrongStats = wrongBookStats();
  updateModeUI(state, wrongStats);
  updateAiSolveUI();
  
  // 1. Soruları Çiz (Standart)
  renderExam(state);
  
  buildNav(state);
  refreshNavColors(state);
  refreshFocusMiniNav?.(state);
  updateStats(state);
  updateSummary();

  try { setupQuestionObserver?.(); } catch {}
  try { updateFocusHUD?.(); } catch {}

  // 🔥 YENİ: ROZET SİSTEMİ (BADGE INJECTOR)
  // Soru kartlarına "Kaç kere yanlış yapıldı" bilgisini ekler.
  if (state.parsed?.questions) {
      state.parsed.questions.forEach(q => {
          // Eğer soru verisinde _wrongCount varsa (wrongBook'tan geldiyse)
          if (q._wrongCount && q._wrongCount > 0) {
              // DOM'daki kartı bul
              const card = document.querySelector(`.q-card[data-n="${q.n}"]`) || document.getElementById(`q-${q.n}`);
              
              // Rozet zaten yoksa ekle
              if (card && !card.querySelector('.retry-badge')) {
                  // Renk belirle (Sarı -> Kırmızı)
                  let badgeColor = "#f59e0b"; // Turuncu (Hafif)
                  let badgeText = `${q._wrongCount}. Kez Yanlış`;
                  
                  if (q._wrongCount >= 3) {
                      badgeColor = "#ef4444"; // Kırmızı (Kritik)
                      badgeText = `⚠️ Kritik Hata (${q._wrongCount})`;
                  }

                  // HTML Oluştur
                  const badge = document.createElement("div");
                  badge.className = "retry-badge";
                  badge.style.cssText = `
                      display: inline-block;
                      background: ${badgeColor}15; 
                      color: ${badgeColor};
                      border: 1px solid ${badgeColor}40;
                      font-size: 11px;
                      font-weight: 700;
                      padding: 4px 8px;
                      border-radius: 6px;
                      margin-bottom: 12px;
                      margin-left: 2px;
                      animation: fadeIn 0.5s ease;
                  `;
                  badge.innerHTML = `<span>↺</span> ${badgeText}`;
                  
                  // Kartın en tepesine (soru metninden önce) ekle
                  const body = card.querySelector(".q-body") || card;
                  if(body.firstChild) body.insertBefore(badge, body.firstChild);
                  else body.appendChild(badge);
              }
          }
      });
  }

  // İkon güncelleme (Sınav başlığı yanındaki)
  const iconEl = document.querySelector(".exam-icon");
  const titleEl = document.getElementById("examTitle");
  const metaEl = document.getElementById("examMeta");

  if (state.parsed) {
    if (titleEl) titleEl.textContent = state.parsed.title || "İsimsiz Sınav";
    
    // SVG İkon varsa bas
    if (iconEl) {
        const defaultIcon = `<svg viewBox="0 0 24 24" fill="none" style="width:24px;height:24px;"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#9E9E9E"/><path d="M14 2V8H20" fill="#E0E0E0"/></svg>`;
        iconEl.innerHTML = state.parsed.meta?.icon || defaultIcon;
    }

    if (metaEl) {
      const qCount = state.parsed.questions ? state.parsed.questions.length : 0;
      const keyCount = state.parsed.keyCount || 0;
      metaEl.textContent = `${qCount} soru • Anahtar: ${keyCount}`;
    }
  } else {
    if (titleEl) titleEl.textContent = "Sınav";
    if (metaEl) metaEl.textContent = "Hazır olduğunda başlat.";
    if (iconEl) {
        iconEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:24px;height:24px;"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" fill="#9E9E9E"/><path d="M14 2V8H20" fill="#E0E0E0"/></svg>`;
    }
  }

  // Mobil Scroll Fix
  setTimeout(() => {
    const activeBtn = document.querySelector('.navBtn.active');
    const navGrid = document.getElementById('navGrid');
    if (activeBtn && navGrid && window.innerWidth <= 900) {
      activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, 50);

  // 👇 TEST İÇİN BUNU EKLE:
 // console.log("🎨 PaintAll çalıştı. Rozet kontrolü yapıldı.");
 // if (state.parsed?.questions) {
   //   const badged = state.parsed.questions.filter(q => q._wrongCount > 0);
    //  console.log(`🏷️ Rozet takılacak soru sayısı: ${badged.length}`);
  //}
}