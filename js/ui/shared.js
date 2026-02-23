// js/ui/shared.js - ortak importlar + yardımcılar

import { el, escapeHtml } from "../utils.js";
import { LETTERS_CONST, getCorrectDisplayLetter, getChosenOptionId } from "../shuffle.js";
import { loadWrongBook, saveWrongBook, wrongBookDashboard, makeKeyFromQuestion } from "../wrongBook.js";
import { handleGamification, startPatiMotivation } from "../pati.js";

// 🔥 YENİ: Arayüz ve Klavye için 6 şıklı liste (F şıkkı eklendi)
export const UI_LETTERS = ["A", "B", "C", "D", "E", "F"];

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

// ================= THEME PATCHES (UI polish) =================
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

    /* Light/Sepia uyumu */
    body.light-mode .subject-chip,
    body.sepia-mode .subject-chip{
      background: rgba(0,0,0,0.03) !important;
      border-color: rgba(0,0,0,0.08) !important;
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

    .srs-subject-chip[data-subject="Genel"]{
      opacity: .55;
    }

    /* Light/Sepia uyumu */
    body.light-mode .srs-subject-chip,
    body.sepia-mode .srs-subject-chip{
      background: rgba(0,0,0,0.03);
      border-color: rgba(0,0,0,0.08);
    }

    body.light-mode .srs-subject-chip:hover,
    body.sepia-mode .srs-subject-chip:hover{
      background: rgba(0,0,0,0.05);
      box-shadow: 0 6px 18px rgba(168,85,247,0.15);
    }
  `;

  document.head.appendChild(st);
}

function getQuestionSubject(q){
  const direct = (q && q.subject != null) ? String(q.subject).trim() : "";
  if (direct) return direct;

  const t = q && q.text ? String(q.text) : "";

  // Başta boşluk olsa bile [Konu] yakalanır
  const m = t.match(/^\s*\[(.*?)\]\s*/);
  if (m && m[1]) return String(m[1]).trim() || "Genel";

  return "Genel";
}

export {
  el,
  escapeHtml,
  LETTERS_CONST,
  getCorrectDisplayLetter,
  getChosenOptionId,
  loadWrongBook,
  saveWrongBook,
  wrongBookDashboard,
  makeKeyFromQuestion,
  handleGamification,
  startPatiMotivation,
  // helpers
  isMissingOptionText,
  safe,
  safeShow,
  safeHide,
  safeText,
  ensureThemePatches,
  getQuestionSubject
};