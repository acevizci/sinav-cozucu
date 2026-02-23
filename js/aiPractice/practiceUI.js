// js/aiPractice/practiceUI.js
// Notes Tab UI + Multi-select + AI Practice Generation

import { normalizeText } from "../utils.js";
import { readFileAsText } from "../parser.js";
import { listNotes, upsertNote, removeNote, renameNote, makeSelectionHash } from "./notesStore.js";
import { appError } from "../ui/uiAlert.js";
// ✅ DÜZELTME: deleteAttempt buraya eklendi
import { getNextAttempt, setNextAttempt, recordAttempt, getPreviousHints, deleteAttempt } from "./practiceHistoryStore.js";
import { buildSourcesFromNotes, computeBalancedAllocation, computePriorityAllocation } from "./multiSourceMerge.js";
import { generatePracticeOnServer as generatePractice } from "./practiceGenerator.js";
import { toParsedExam } from "./practiceAdapter.js";
import { validateParsedExam } from "./practiceValidator.js";

const DEFAULT_SETTINGS = {
  questionCount: 20,
  choices: 5,
  difficulty: "mixed",
  distribution: "balanced",
  language: "tr",
};

// --- YARDIMCI FONKSİYONLAR (GLOBAL SCOPE) ---

// -----------------------------------------------------
// DOCX LIB LOADER (tek kaynak: window.docx)
// -----------------------------------------------------
function ensureDocxLib(){
  // docx is expected to be loaded globally (UMD) as window.docx
  const docxLib = (typeof window !== "undefined") ? (window.docx || window.docxLib) : null;
  if (!docxLib) {
    return Promise.reject(new Error("DOCX kütüphanesi yüklenemedi (window.docx yok). index.html içinde docx UMD dosyasını yüklediğinden emin ol."));
  }

  // saveAs may be provided globally (FileSaver.js). If not, fallback to native download.
  const saveAs = (typeof window !== "undefined" && typeof window.saveAs === "function")
    ? window.saveAs
    : function(blob, filename){
        try{
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename || "dosya.docx";
          document.body.appendChild(a);
          a.click();
          setTimeout(()=>{ try{ a.remove(); }catch(e){}; try{ URL.revokeObjectURL(url); }catch(e){}; }, 0);
        }catch(e){}
      };

  return Promise.resolve({ docxLib, saveAs });
}

// --- DOCX Export visibility (for generated practice exams) ---
function shouldShowDocxExport(note){
  const t = String(note?.title || "");
  const src = String(note?.source || "").toLowerCase();
  // Show for generated/practice items or anything labeled as "deneme"
  return src === "practice" || src === "generated" || /\bdeneme\b/i.test(t) || /deneme\d+/i.test(t);
}

function createNoteRow(note, selectedIds){
  const li = document.createElement("div");
  li.className = "noteRow";
  li.dataset.id = note.id;

  const checked = selectedIds.has(note.id);

  li.innerHTML = `
    <label class="noteChk">
      <input type="checkbox" ${checked ? "checked" : ""} />
      <span class="noteTitle">${escapeHtml(note.title)}</span>
    </label>
    <div class="noteMeta">
      <span class="badge">${escapeHtml(note.source || "local")}</span>
      
      <button class="btn ghost noteRename" title="Yeniden adlandır">✎</button>
      <button class="btn ghost noteDelete" title="Sil">🗑</button>
    </div>
  `;

  return li;
}

function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[ch]));
}

function showModal({ title, bodyHtml, onOk, okText="Kaydet", cancelText="İptal" }){
  const overlay = document.createElement("div");
  overlay.className = "modalOverlay";

  const hasCancel = !(cancelText == null || String(cancelText).trim() === "");

  overlay.innerHTML = `
    <div class="modalCard" role="dialog" aria-modal="true">
      <div class="modalTop">
        <div>
          <div class="modalTitle">${escapeHtml(title)}</div>
          <div class="modalSub">Ders Notları</div>
        </div>
        <button class="modalClose">✕</button>
      </div>
      <div class="divider"></div>
      <div class="modalBody">${bodyHtml}</div>
      <div class="modalActions">
        ${hasCancel ? `<button class="ghost btnCancel">${escapeHtml(cancelText)}</button>` : ``}
        <button class="primary btnOk">${escapeHtml(okText)}</button>
      </div>
    </div>
  `;

  function close(){
    try { overlay.remove(); } catch (e) {}
  }

  overlay.querySelector(".modalClose")?.addEventListener("click", close);
  overlay.querySelector(".btnCancel")?.addEventListener("click", close);
  overlay.addEventListener("click", (e)=>{ if (e.target === overlay) close(); });

  overlay.querySelector(".btnOk")?.addEventListener("click", async ()=>{
    try {
      await onOk?.(overlay);
      close();
    } catch (err) {
      console.error(err);
      const box = overlay.querySelector(".modalBody");
      if (box){
        const warn = document.createElement("div");
        warn.className = "warnBox";
        warn.style.display = "block";
        warn.textContent = err?.message || "Hata";
        box.prepend(warn);
      }
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

function getSelectedNotes(selectedIds){
  const all = listNotes();
  return all.filter(n => selectedIds.has(n.id));
}

// --- ANA FONKSİYON (INIT) ---

export function initNotesTab(ctx){
  const state = ctx.state;
  const setLoading = ctx.setLoading;
  const showToast = ctx.showToast;
  const showWarn = ctx.showWarn;
  const applyShuffle = ctx.applyShuffle;
  const paintAll = ctx.paintAll;
  const persist = ctx.persist;
  const startExam = ctx.startExam;

  // drive deps
  const listMyDriveBooklets = ctx.listMyDriveBooklets;
  const listFolderBooklets = ctx.listFolderBooklets;
  const fetchDriveFileAsFileOrText = ctx.fetchDriveFileAsFileOrText;

  const tab = document.getElementById("tab-notes");
  if (!tab) return;

  const listHost = document.getElementById("notesList");
  const selCount = document.getElementById("notesSelCount");
  const preview = document.getElementById("notesPreview");
  const btnGen = document.getElementById("btnGeneratePractice");

  // ✅ error box (Drive ile aynı bileşen stili)
  
const notesErrorBox = document.getElementById("notesErrorBox");

function clearNotesError(){
  if (!notesErrorBox) return;
  notesErrorBox.style.display = "none";
  notesErrorBox.innerHTML = "";
}

function showNotesError(msg){
  if (!notesErrorBox) return;

  // escapeHtml is available in this module (prevents any HTML injection)
  const safeMsg = escapeHtml(String(msg || "Bir hata oluştu."));

  notesErrorBox.innerHTML = `
    <div class="drive-error-card" role="status" aria-live="polite">
      <div class="drive-error-icon" aria-hidden="true">⚠️</div>
      <div class="drive-error-text">
        <div class="drive-error-title">Notlar</div>
        <div class="drive-error-desc">${safeMsg}</div>
      </div>
      <button class="drive-error-btn" type="button" data-notes-err-dismiss>Tamam</button>
    </div>
  `;

  notesErrorBox.style.display = "block";

  notesErrorBox
    .querySelector("[data-notes-err-dismiss]")
    ?.addEventListener("click", clearNotesError);
}

  const btnAddPaste = document.getElementById("btnAddNotePaste");
  const btnAddFile = document.getElementById("btnAddNoteFile");
  const btnAddDrive = document.getElementById("btnAddNoteDrive");
  const btnSelectAll = document.getElementById("btnNotesSelectAll");
  const btnClearSel = document.getElementById("btnNotesClearSel");
  const inpAttempt = document.getElementById("practiceAttemptNo");

  // distribution controls
  const btnDistBalanced = document.getElementById("btnDistBalanced");
  const btnDistPriority = document.getElementById("btnDistPriority");
  const prioWrap = document.getElementById("notesPriorityWrap");
  const prioList = document.getElementById("notesPriorityList");

  let distribution = "balanced"; // balanced | priority
  let selectedOrder = []; // ordered note IDs for priority mode
  let dragId = null;

  const selectedIds = new Set();


  // --- İÇ YARDIMCI FONKSİYONLAR ---

  function syncSelectedOrder(){
    const next = [];
    for (const id of selectedOrder){ if (selectedIds.has(id)) next.push(id); }
    for (const id of selectedIds){ if (!next.includes(id)) next.push(id); }
    selectedOrder = next;
  }

  function getSelectedNotesOrdered(){
    const all = listNotes();
    const byId = new Map(all.map(n => [n.id, n]));
    const ids = selectedOrder.length ? selectedOrder : Array.from(selectedIds);
    return ids.map(id => byId.get(id)).filter(Boolean);
  }

  function updatePatiOnSelection(count) {
    const speech = document.getElementById("patiSpeech");
    const avatar = document.getElementById("patiAvatar");
    if (speech && avatar) {
      speech.textContent = "Harika notlar! Bunlardan çok zor sorular çıkarabilirim! 💪";
      speech.style.display = "block";
      avatar.classList.add("action-jump");
      
      setTimeout(() => {
        speech.style.display = "none";
        avatar.classList.remove("action-jump");
      }, 3000);
    }
  }

  function renderPriorityList(){
    if (!prioWrap || !prioList) return;
    const sel = getSelectedNotesOrdered();
    const show = distribution === "priority" && sel.length > 1;
    prioWrap.style.display = show ? "block" : "none";
    if (!show){ prioList.innerHTML = ""; return; }

    prioList.innerHTML = "";
    sel.forEach((n, idx) => {
      const item = document.createElement("div");
      item.className = "prioItem";
      item.draggable = true;
      item.dataset.id = n.id;
      item.innerHTML = `
        <div class="prioLeft">
          <span class="prioHandle">::</span>
          <span class="prioTitle">${escapeHtml(n.title)}</span>
        </div>
        <span class="prioBadge">${idx + 1}</span>
      `;

      item.addEventListener("dragstart", (e) => {
        dragId = n.id;
        try { e.dataTransfer.effectAllowed = "move"; } catch (err) {}
      });
      item.addEventListener("dragend", () => {
        dragId = null;
        prioList.querySelectorAll(".prioItem").forEach(el => el.classList.remove("is-dragover"));
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        item.classList.add("is-dragover");
      });
      item.addEventListener("dragleave", () => {
        item.classList.remove("is-dragover");
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        item.classList.remove("is-dragover");
        const targetId = item.dataset.id;
        if (!dragId || !targetId || dragId === targetId) return;

        const cur = selectedOrder.slice();
        const from = cur.indexOf(dragId);
        const to = cur.indexOf(targetId);
        if (from < 0 || to < 0) return;
        cur.splice(from, 1);
        cur.splice(to, 0, dragId);
        selectedOrder = cur;
        refresh();
      });

      prioList.appendChild(item);
    });
  }

  function renderPracticeHistory(selHash) {
    const historyHost = document.getElementById("practiceHistoryList");
    const historySection = document.getElementById("historySection");
    const historyCount = document.getElementById("historyCount");
    
    const rawData = localStorage.getItem("acumen_practice_history_v1");
    const db = rawData ? JSON.parse(rawData) : { bySel: {} };
    const row = db.bySel[selHash];

    if (!row || !row.attempts || Object.keys(row.attempts).length === 0) {
      if (historySection) historySection.style.display = "none";
      return;
    }

    if (historySection) historySection.style.display = "block";
    const attempts = Object.values(row.attempts).sort((a,b) => b.attemptNo - a.attemptNo);
    if (historyCount) historyCount.textContent = `${attempts.length} Kayıt`;

    historyHost.innerHTML = attempts.map(attempt => {
      // 🌟 KONTROL: Eğer 'parsedData' yoksa bu eski bir kayıttır, tıklanmasın.
      const hasData = !!attempt.parsedData;
      const clickAction = hasData ? `onclick="loadPastAttempt('${selHash}', ${attempt.attemptNo})"` : "";
      const cursorStyle = hasData ? "cursor: pointer;" : "cursor: not-allowed; opacity: 0.6;";
      
      const btnHtml = hasData 
        ? `<button class="btn ghost sm" style="font-size: 9px; padding: 4px 8px; border-radius: 8px;">Tekrar Çöz</button>` 
        : `<span style="font-size:9px; color:var(--muted); font-style:italic;">Veri Yok</span>`;

      // 🗑 SİLME BUTONU
      // event.stopPropagation() -> Ana satıra tıklanmış gibi davranmasını engeller
      const deleteBtn = `
        <button onclick="event.stopPropagation(); deletePastAttempt('${selHash}', ${attempt.attemptNo})" 
                class="btn ghost sm bad" 
                style="padding: 4px 6px; border-radius: 6px; margin-left: 5px;" 
                title="Bu denemeyi sil">🗑</button>
      `;

 

      // 📝 WORD İNDİRME BUTONU
      const wordBtn = hasData 
        ? `
        <button onclick="event.stopPropagation(); downloadPastAttemptWord('${selHash}', ${attempt.attemptNo})" 
                class="btn ghost sm" 
                style="padding: 4px 6px; border-radius: 6px; margin-left: 5px;" 
                title="Word olarak indir">📝</button>
      `
        : ``;

      return `
      <div class="noteRow" 
           ${clickAction}
           style="padding: 10px; margin-bottom: 6px; border-left: 3px solid var(--accent); ${cursorStyle} transition: transform 0.2s;"
           onmouseover="${hasData ? "this.style.transform='scale(1.02)'" : ""}" 
           onmouseout="this.style.transform='scale(1)'">
        <div class="row" style="justify-content: space-between; width: 100%;">
          
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 16px;">${hasData ? '⏳' : '⚠️'}</span>
            <div>
              <div style="font-size: 12px; font-weight: 700;">Deneme #${attempt.attemptNo}</div>
              <div style="font-size: 10px; color: var(--muted);">${new Date(attempt.createdAt).toLocaleDateString('tr-TR')}</div>
            </div>
          </div>

          <div class="noteMeta" style="display:flex; align-items:center;">
             ${btnHtml}
             ${wordBtn}
             ${deleteBtn}
          </div>

        </div>
      </div>
    `}).join("");
  }

  
  // -------------------------------------------------------------------------
  // WORD EXPORT (Denemeyi Word olarak indir)
  // -------------------------------------------------------------------------
    async function downloadPastAttemptWord(selHash, attemptNo){
  try{
    const rawData = localStorage.getItem("acumen_practice_history_v1");
    const db = rawData ? JSON.parse(rawData) : { bySel: {} };
    const row = db.bySel?.[selHash];
    const attempt = row?.attempts?.[String(attemptNo)];
    const parsed = attempt?.parsedData;

    if (!parsed){
      if (typeof showWarn === "function") showWarn({ id:"ERR_BU_DENEME_ESKI_SURUMLE_OLUSTURULMUS" });
      return;
    }

    // Ensure docx lib is available
    const { docxLib, saveAs } = await ensureDocxLib();
    const {
      Document, Packer, Paragraph, TextRun,
      HeadingLevel, AlignmentType,
      Table, TableRow, TableCell,
      WidthType, Footer, PageNumber
    } = docxLib;

    const title = parsed?.title || `Deneme #${attemptNo}`;
    const createdAt = attempt?.createdAt ? new Date(attempt.createdAt).toLocaleString("tr-TR") : "";
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : [];
    const answerKey = parsed?.answerKey || parsed?.meta?.answerKey || {};

    const children = [];

    // Title
    children.push(new Paragraph({
      text: String(title),
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 }
    }));

    if (createdAt){
      children.push(new Paragraph({
        children: [new TextRun({ text: createdAt, color: "777777", size: 18 })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 120 }
      }));
    }

// Meta line (compact)
children.push(new Paragraph({
  children: [
    new TextRun({ text: `Soru: ${questions.length}`, color: "777777", size: 18 }),
    new TextRun({ text: `  •  Anahtar: ${Object.keys(answerKey||{}).length}`, color: "777777", size: 18 })
  ],
  alignment: AlignmentType.CENTER,
  spacing: { before: 0, after: 120 }
}));


    // Questions (compact)
    for (const q of questions){
      const n = q?.n ?? "";
      const qText = String(q?.text || q?.q || q?.question || "").trim();
      const opts = Array.isArray(q?.options) ? q.options : [];

      children.push(new Paragraph({
        children: [
          new TextRun({ text: `${n}) `, bold: true }),
          new TextRun({ text: qText })
        ],
        spacing: { before: 0, after: 60 }
      }));

      
// Options (A,B,C...) — supports multiple parsed shapes
const letters = ["A","B","C","D","E","F","G","H"];

function pickOptionText(v){
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v.text || v.label || v.value || v.content || v.title || "").trim();
}

let optTexts = [];
// 1) common: q.options = [{text}] or ["..."]
if (Array.isArray(opts) && opts.length){
  optTexts = opts.map(pickOptionText).filter(Boolean);
}
// 2) common: q.optionsByLetter = {A:{text}, B:{text}...}
if (!optTexts.length && q && typeof q.optionsByLetter === "object" && q.optionsByLetter){
  const keys = Object.keys(q.optionsByLetter).sort();
  optTexts = keys.map(k => pickOptionText(q.optionsByLetter[k])).filter(Boolean);
}
// 3) other: q.choices = [...]
if (!optTexts.length && Array.isArray(q?.choices) && q.choices.length){
  optTexts = q.choices.map(pickOptionText).filter(Boolean);
}
// 4) other: q.optionsMap = {A:".."} etc.
if (!optTexts.length && q && typeof q.optionsMap === "object" && q.optionsMap){
  const keys = Object.keys(q.optionsMap).sort();
  optTexts = keys.map(k => pickOptionText(q.optionsMap[k])).filter(Boolean);
}

for (let i=0; i<optTexts.length; i++){
  const oText = optTexts[i];
  const L = letters[i] || String.fromCharCode(65 + i);
  children.push(new Paragraph({
    children: [
      new TextRun({ text: `${L}) `, bold: true }),
      new TextRun({ text: oText })
    ],
    spacing: { before: 0, after: 0 }
  }));
}
// Small topic line if exists
      const subj = (q?.subject || q?.topic || q?.konu || "").toString().trim();
      if (subj){
        children.push(new Paragraph({
          children: [new TextRun({ text: `Konu: ${subj}`, color:"666666", size: 16 })],
          spacing: { before: 20, after: 60 }
        }));
      } else {
        children.push(new Paragraph({ text: "", spacing: { before: 0, after: 120 } }));
      }
    }

    // Answer Key (compact)
    const keyCount = answerKey ? Object.keys(answerKey).length : 0;
    if (keyCount){
      
// =====================
// CEVAP KAĞIDI (Optik) — kağıt dostu
// =====================
try{
  const optikCols = ["A","B","C","D","E"];
  // Başlık
  children.push(new Paragraph({
    children: [new TextRun({ text: "CEVAP KAĞIDI", bold: true })],
    spacing: { before: 120, after: 60 }
  }));

  // Tablo: Q | A | B | C | D | E
  const headerRow = new TableRow({
    children: [
      new TableCell({ width: { size: 9, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children:[new TextRun({ text:"S", bold:true })], spacing:{ before:0, after:0 } })] }),
      ...optikCols.map(L => new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children:[new TextRun({ text: L, bold:true })], spacing:{ before:0, after:0 } })]
      }))
    ]
  });

  const optikRows = [headerRow];

  // Daire karakteri: ○ (boş), ● (dolu) — burada hep boş bırakıyoruz
const emptyBubble = "○";
const filledBubble = "●";

// answerKey kaynakları (parsed şekline göre)
const keyMap = parsed?.answerKey || parsed?.meta?.answerKey || {};

// "A" / "A,B" / ["A","C"] / Set("A") gibi gelenleri normalize et
function normKey(v){
  if (!v) return [];
  if (typeof v === "string") {
    // "A", "A,B", "A C" gibi durumlar
    return v.replace(/[^A-Z]/gi, " ")
            .trim()
            .split(/\s+/)
            .map(x => x.toUpperCase())
            .filter(Boolean);
  }
  if (Array.isArray(v)) return v.map(x => String(x).toUpperCase());
  if (v instanceof Set) return Array.from(v).map(x => String(x).toUpperCase());
  return [String(v).toUpperCase()];
}

for (let i=1; i<=qCount; i++){
  const raw = keyMap[i] || keyMap[String(i)] || keyMap[Number(i)];
  const correct = new Set(normKey(raw)); // örn: {"B"} veya {"A","D"}

  optikRows.push(new TableRow({
    children: [
      new TableCell({
        width: { size: 9, type: WidthType.PERCENTAGE },
        children: [new Paragraph({ children:[new TextRun({ text: String(i) })], spacing:{ before:0, after:0 } })]
      }),
      ...optikCols.map((L) => new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children:[new TextRun({
            text: correct.has(L) ? filledBubble : emptyBubble,
            size: 18,
            color: correct.has(L) ? "111111" : "777777"
          })],
          spacing:{ before:0, after:0 }
        })]
      }))
    ]
  }));
}


  children.push(new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: optikRows
  }));

  // küçük boşluk
  children.push(new Paragraph({ children:[new TextRun({ text: "" })], spacing:{ before: 60, after: 60 } }));
}catch(e){}
children.push(new Paragraph({
        text: "CEVAP ANAHTARI",
        heading: HeadingLevel.HEADING_2,
        alignment: AlignmentType.CENTER,
        spacing: { before: 180, after: 80 }
      }));

      const cols = 7;
      const rows = [];
      let curRow = [];

      const qCount = questions.length || 0;
      for (let i=1;i<=qCount;i++){
        const ans = answerKey[i] || answerKey[String(i)] || "-";
        curRow.push(new TableCell({
          width: { size: 100/cols, type: WidthType.PERCENTAGE },
          margins: { top: 60, bottom: 60, left: 60, right: 60 },
          children: [new Paragraph({
            children: [
              new TextRun({ text: `${i}. `, bold: true }),
              new TextRun({ text: String(ans).trim().toUpperCase() })
            ],
            spacing: { before: 0, after: 0 }
          })]
        }));

        if (curRow.length === cols){
          rows.push(new TableRow({ children: curRow }));
          curRow = [];
        }
      }
      if (curRow.length){
        while (curRow.length < cols){
          curRow.push(new TableCell({
            width: { size: 100/cols, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ text: "" })]
          }));
        }
        rows.push(new TableRow({ children: curRow }));
      }

      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows
      }));
    }

    const doc = new Document({
      sections: [{
        properties: { pageNumberStart: 1, page: { size: { width: 11906, height: 16838 }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: 240 },
                children: [
                  new TextRun({ text: "Sayfa ", color: "999999", size: 18 }),
                  new TextRun({ children: [PageNumber.CURRENT], color: "999999", size: 18 }),
                  new TextRun({ text: " / ", color: "999999", size: 18 }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], color: "999999", size: 18 })
                ]
              })
            ]
          })
        },
        children
      }]
    });

    const blob = await Packer.toBlob(doc);
    const safeName = String(title || `Deneme_${attemptNo}`).replace(/[\/:*?"<>|]+/g, "_");
    saveAs(blob, `${safeName}.docx`);
    try{ showToast?.({ id:"PRACTICE_WORD_DOWNLOADED", kind:"ok" }); }catch(e){}
  }catch(e){
    try{ showToast?.({ id:"PRACTICE_WORD_FAIL", kind:"warn" }); }catch(err){}
  }
}



  // -------------------------------------------------------
  // Practice History actions (inline onclick hooks)
  // -------------------------------------------------------
  function loadPastAttempt(selHash, attemptNo){
    try{
      const rawData = localStorage.getItem("acumen_practice_history_v1");
      const db = rawData ? JSON.parse(rawData) : { bySel: {} };
      const row = db.bySel?.[selHash];
      const attempt = row?.attempts?.[String(attemptNo)];
      const parsed = attempt?.parsedData;

      if (!parsed){
        showWarn?.({ id:"ERR_BU_DENEME_ESKI_SURUMLE_OLUSTURULMUS" });
        return;
      }

      state.parsed = parsed;
      state.rawText = "";
      state.mode = "prep";
      try{ state.answers?.clear?.(); }catch(e){}

      paintAll?.();
      persist?.();

      try{ startExam?.(); }catch(e){}
    }catch(err){
      console.error(err);
      showWarn?.(err);
    }
  }

  function deletePastAttempt(selHash, attemptNo){
    try{
      deleteAttempt?.(selHash, attemptNo);

      // UI refresh (if current selection matches)
      const selectionHash = makeSelectionHash(Array.from(selectedIds));
      if (selectionHash === selHash){
        renderPracticeHistory(selHash);
        try{
          if (inpAttempt){
            const nextAttempt = getNextAttempt(selHash);
            inpAttempt.value = String(nextAttempt);
          }
        }catch(e){}
      }

      showToast?.({ id:"PRACTICE_ATTEMPT_DELETED", kind:"ok" });
    }catch(err){
      console.error(err);
      showWarn?.(err);
    }
  }

  // Expose for inline onclick usage
  window.loadPastAttempt = loadPastAttempt;
  window.deletePastAttempt = deletePastAttempt;
  window.downloadPastAttemptWord = downloadPastAttemptWord;
  function refresh(){
    syncSelectedOrder();
    const notes = listNotes();
    
    // 1. Not Listesi Render
    if (listHost) {
      listHost.innerHTML = "";
      if (notes.length === 0) {
        listHost.innerHTML = `
          <div class="emptyMini">
            <div class="t">Henüz not yok</div>
            <div class="s">Metin, dosya veya Drive üzerinden not ekleyebilirsin.</div>
          </div>`;
      } else {
        for (const n of notes) {
          const row = createNoteRow(n, selectedIds);
          listHost.appendChild(row);
        }
      }
    }

    const count = selectedIds.size;
    if (selCount) selCount.textContent = String(count);

    // --- YENİ: Dinamik Aksiyon Alanı, Pati ve Geçmiş Kontrolü ---
    const actionArea = document.getElementById("notesActionArea");
    const historySection = document.getElementById("historySection");
    
    if (count > 0) {
      const selectionHash = makeSelectionHash(Array.from(selectedIds));
      
      // Aksiyon alanı (Yöntem & Üret butonu) kontrolü
      if (actionArea) {
        if (actionArea.style.display === "none") {
          updatePatiOnSelection(count);
        }
        actionArea.style.display = "block";
      }

      // 📜 GEÇMİŞ DENEMELERİ LİSTELE
      if (historySection) {
        renderPracticeHistory(selectionHash);
      }

      // Auto attempt no
      try {
        if (inpAttempt) {
          const nextAttempt = getNextAttempt(selectionHash);
          inpAttempt.value = String(nextAttempt);
        }
      } catch (e) { console.error("Attempt no hatası:", e); }

    } else {
      if (actionArea) actionArea.style.display = "none";
      if (historySection) historySection.style.display = "none";
      if (inpAttempt) inpAttempt.value = "1";
    }

    // Preview
    if (preview) {
      const sel = getSelectedNotesOrdered();
      if (sel.length === 0) {
        preview.textContent = "Seçili not yok.";
      } else {
        const joined = sel.map(n => `=== ${n.title} ===\n${(n.text || "").slice(0, 1200)}`).join("\n\n");
        preview.textContent = joined.slice(0, 4000);
      }
    }

    renderPriorityList();
    if (btnGen) btnGen.disabled = count === 0;
  }

  function bindListEvents(){
    if (!listHost) return;
    listHost.addEventListener("click", async (e)=>{
      const row = e.target?.closest?.(".noteRow");
      if (!row) return;
      const id = row.dataset.id;
if (e.target?.classList?.contains("noteDelete")){
        removeNote(id);
        selectedIds.delete(id);
        refresh();
        return;
      }

      if (e.target?.classList?.contains("noteRename")){
        const note = listNotes().find(n => n.id === id);
        showModal({
          title: "Notu Yeniden Adlandır",
          bodyHtml: `<div class="inp-group"><label>Başlık</label><input id="renameTitle" value="${escapeHtml(note?.title||"")}" /></div>`,
          onOk: (ov)=>{
            const val = ov.querySelector("#renameTitle")?.value;
            renameNote(id, val);
            refresh();
          }
        });
        return;
      }

      const chk = row.querySelector('input[type="checkbox"]');
      if (e.target === chk){
        if (chk.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        refresh();
      }
    });

    listHost.addEventListener("change", (e)=>{
      const row = e.target?.closest?.(".noteRow");
      if (!row) return;
      if (e.target?.matches?.('input[type="checkbox"]')){
        const id = row.dataset.id;
        if (e.target.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        refresh();
      }
    });
  }

  async function addNoteFromPaste(){
    showModal({
      title: "Metinden Not Ekle",
      okText: "Notu Kaydet",
      bodyHtml: `
        <div class="inp-group" style="margin-bottom:10px;">
          <label>Başlık</label>
          <input id="noteTitle" placeholder="Örn: Fizik - Kuvvet" />
        </div>
        <div class="inp-group">
          <label>İçerik</label>
          <textarea id="noteText" placeholder="Ders notunu buraya yapıştır..."></textarea>
        </div>
      `,
      onOk: (ov)=>{
        const title = ov.querySelector("#noteTitle")?.value;
        const text = ov.querySelector("#noteText")?.value;
        if (!text || String(text).trim().length < 80) throw appError("ERR_NOT_COK_KISA_BIRAZ_DAHA_ICERIK_EKLE");
        const note = upsertNote({ title, text, source: "paste" });
        selectedIds.add(note.id);
        refresh();
      }
    });
  }

  async function addNoteFromFile(){
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".txt,.pdf,.docx,.md";
    inp.style.display = "none";
    document.body.appendChild(inp);

    inp.addEventListener("change", async ()=>{
      const f = inp.files?.[0];
      if (!f){ inp.remove(); return; }
      try {
        setLoading?.(true, "Not okunuyor…");
        const text = await readFileAsText(f);
        const note = upsertNote({ title: f.name, text, source: "file" });
        selectedIds.add(note.id);
        showToast?.({ id:"PRACTICE_FILE_ADDED_TO_NOTES", kind:"ok" });
      } catch (err){
        console.error(err);
        showWarn?.(err?.message || {id:"NOTE_FILE_READ_FAILED"});
      } finally {
        setLoading?.(false);
        inp.remove();
        refresh();
      }
    });

    inp.click();
  }

  async function addNoteFromDrive(){
    if (typeof listMyDriveBooklets !== "function" || typeof fetchDriveFileAsFileOrText !== "function"){
      showWarn?.({id:"DRIVE_INTEGRATION_MISSING"});
      return;
    }

    const pickable = (mt="") => (
      mt === "application/pdf" ||
      mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      mt === "application/msword" ||
      (mt||"").startsWith("text/") ||
      mt === "application/vnd.google-apps.document" ||
      mt === "application/vnd.google-apps.spreadsheet" ||
      mt === "application/vnd.google-apps.presentation"
    );

    const isFolder = (mt="") => mt === "application/vnd.google-apps.folder";

    const labelOf = (mt="") => {
      if (isFolder(mt)) return "KLASÖR";
      if (mt === "application/pdf") return "PDF";
      if (mt === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "DOCX";
      if (mt === "application/msword") return "DOC";
      if ((mt||"").startsWith("text/")) return "TXT";
      if (mt === "application/vnd.google-apps.document") return "G.DOC";
      if (mt === "application/vnd.google-apps.spreadsheet") return "G.SHEET";
      if (mt === "application/vnd.google-apps.presentation") return "G.SLIDE";
      return "FILE";
    };

    const bodyHtml = `
      <div class="drivePickTop">
        <div class="drivePickHint">Önce bir <b>klasör</b> seç, sonra içinden dosya seç (PDF/DOCX/DOC/TXT veya Google Doc)</div>
        <div class="drivePickNav">
          <button class="btn sm" id="driveUp" disabled>⬅︎ Geri</button>
          <div class="driveCrumb" id="driveCrumb">Root</div>
        </div>
      </div>
      <div class="drivePickList" id="drivePickList"></div>
    `;

    const ov = showModal({
      title: "Drive'dan Not Ekle",
      okText: "Kapat",
      cancelText: "",
      bodyHtml,
      onOk: async ()=>{}
    });

    const elList = ov.querySelector("#drivePickList");
    const elUp = ov.querySelector("#driveUp");
    const elCrumb = ov.querySelector("#driveCrumb");

    const stack = []; 
    let currentFolderId = "root";

    function renderCrumb(){
      elCrumb.textContent = stack.length ? ("Root / " + stack.map(x=>x.name).join(" / ")) : "Root";
      elUp.disabled = stack.length === 0;
    }

    async function loadFolder(folderId){
      setLoading?.(true, "Drive klasörü yükleniyor…");
      try{
        currentFolderId = folderId || "root";
        let items = await listMyDriveBooklets({ folderLinkOrId: currentFolderId });
        items = (items || []).filter(it => isFolder(it?.mimeType) || pickable(it?.mimeType));

        items.sort((a,b)=>{
          const af = isFolder(a?.mimeType) ? 0 : 1;
          const bf = isFolder(b?.mimeType) ? 0 : 1;
          if (af !== bf) return af - bf;
          return String(a?.name||"").localeCompare(String(b?.name||""), "tr");
        });

        if (!items.length){
          elList.innerHTML = `<div class="drivePickEmpty">Bu klasörde uygun dosya yok.</div>`;
          return;
        }

elList.innerHTML = items.map(it => {
  const id = it?.id || it?.fileId || it?.file_id;
  const name = it?.name || it?.title || "Drive";
  const mt = it?.mimeType || "";
  
  // Dosya tipine göre ikon belirleme
  const icon = isFolder(mt) ? "📁" : (mt.includes("pdf") ? "📄" : "📝");

  return `
    <button class="drivePickItem ${isFolder(mt) ? "isFolder":""}"
      data-id="${escapeHtml(id)}"
      data-name="${escapeHtml(name)}"
      data-mime="${escapeHtml(mt)}"
      title="${escapeHtml(name)}">
      <div class="drivePickIcon">${icon}</div>
      <span class="drivePickName">${escapeHtml(name)}</span>
      <span class="drivePickBadge">${escapeHtml(labelOf(mt))}</span>
    </button>
  `;
}).join("");;

        elList.querySelectorAll(".drivePickItem").forEach(btn=>{
          btn.addEventListener("click", async ()=>{
            const id = btn.dataset.id;
            const mt = btn.dataset.mime || "";
            const name = btn.dataset.name || btn.textContent.trim();

            if (isFolder(mt)){
              stack.push({ id, name });
              renderCrumb();
              await loadFolder(id);
              return;
            }

            try{
              setLoading?.(true, "Drive dosyası okunuyor…");
              const res = await fetchDriveFileAsFileOrText({ id, mimeType: mt, name });

              let text = "";
              if (res?.kind === "text" && typeof res.text === "string") text = res.text;
              else if (res?.kind === "file" && res.file) text = await readFileAsText(res.file);
              else if (typeof res === "string") text = res;
              else if (res && typeof res.text === "function") text = await res.text();
              else if (res?.text) text = res.text;

              if (!text || String(text).trim().length < 80)
                throw appError("ERR_DRIVE_ICERIGI_ALINAMADI_VEYA_COK_KIS");

              const note = upsertNote({
                title: name,
                text,
                source: "drive",
                driveMeta: { id, mimeType: mt }
              });

              selectedIds.add(note.id);
              showToast?.({ id:"PRACTICE_DRIVE_NOTE_ADDED", kind:"ok" });
              refresh();
            } catch (err){
  console.error(err);

  const code = err?.error?.code ?? err?.status ?? err?.code ?? null;
  const statusText = String(err?.error?.status || "");
  const msgText = String(err?.error?.message || err?.message || "");

  const is401 =
    code === 401 ||
    statusText === "UNAUTHENTICATED" ||
    /401|Invalid Credentials|UNAUTHENTICATED/i.test(msgText);

  if (is401){
    showNotesError?.("Drive bağlantısı süresi doldu. Yeniden bağlanın.");
  } else {
    showNotesError?.(msgText || "Drive not eklenemedi.");
  }

  // İstersen toast kalsın:
  // showWarn?.(msgText || "Drive not eklenemedi");

} finally {
  setLoading?.(false);
}
          });
        });
      } catch (e){
  console.error(e);

  const code = e?.error?.code ?? e?.status ?? e?.code ?? null;
  const statusText = String(e?.error?.status || "");
  const msgText = String(e?.error?.message || e?.message || "");

  const is401 =
    code === 401 ||
    statusText === "UNAUTHENTICATED" ||
    /401|Invalid Credentials|UNAUTHENTICATED/i.test(msgText);

  if (is401){
    showNotesError?.("Drive bağlantısı süresi doldu. Yeniden bağlanın.");
  } else {
    showNotesError?.(msgText || "Drive listesi alınamadı.");
  }

  elList.innerHTML = `<div class="drivePickEmpty">Drive listesi alınamadı.</div>`;
} finally {
        setLoading?.(false);
      }
    }

    elUp.addEventListener("click", async ()=>{
      stack.pop();
      renderCrumb();
      const parentId = stack.length ? stack[stack.length - 1].id : "root";
      await loadFolder(parentId);
    });

    renderCrumb();
    await loadFolder("root");
  }

async function generateSelectedPractice(){
  const sel = getSelectedNotesOrdered();
  const sources = buildSourcesFromNotes(sel);
  if (sources.length === 0){
    showWarn?.({id:"NOTES_EMPTY_SELECTION"});
    return;
  }

  const selIds = Array.from(selectedIds);
  const selectionHash = makeSelectionHash(selIds);

  let attemptNo = Number(inpAttempt?.value || 0) || 0;
  if (!attemptNo || attemptNo < 1){
    attemptNo = getNextAttempt(selectionHash);
    if (inpAttempt) inpAttempt.value = String(attemptNo);
  }

  const alloc = (distribution === "priority")
    ? computePriorityAllocation(DEFAULT_SETTINGS.questionCount, sources.length)
    : computeBalancedAllocation(DEFAULT_SETTINGS.questionCount, sources.length);

  const settings = { ...DEFAULT_SETTINGS, distribution, allocation: alloc };

  try {
    clearNotesError?.(); // ✅ önceki hata kartını temizle

    setLoading?.(true, { id:"PRACTICE_GENERATING_ATTEMPT", vars:{ attemptNo } });
    const previous = getPreviousHints(selectionHash);
    const resp = await generatePractice({ sources, attemptNo, settings, previous });
    setLoading?.(true, { sub:{ id:"AI_STEP_PARSING" } });
    const parsed = toParsedExam(resp, { fallbackTitle: `Deneme ${attemptNo}` });
    setLoading?.(true, { sub:{ id:"AI_STEP_VALIDATING" } });
    validateParsedExam(parsed);

    const finalParsed = (typeof applyShuffle === "function")
      ? applyShuffle(parsed, { shuffleQ: !!state.shuffleQ, shuffleO: !!state.shuffleO })
      : parsed;

    finalParsed.meta = finalParsed.meta || {};
    finalParsed.meta.isAiGenerated = true;
    finalParsed.meta.selectionHash = selectionHash;
    finalParsed.meta.attemptNo = attemptNo;
    finalParsed.meta.sourceIds = sources.map(s=>s.id);
    finalParsed.meta.sourceTitles = sources.map(s=>s.title);
    finalParsed.meta.distribution = distribution;
    finalParsed.meta.orderedSourceIds = sources.map(s=>s.id);
    finalParsed.meta.keySource = finalParsed.meta.keySource || "ai";

    state.parsed = finalParsed;
    state.rawText = "";
    state.mode = "prep";
    state.answers?.clear?.();

    paintAll?.();
    persist?.();

    try {
      setLoading?.(true, { sub:{ id:"AI_STEP_SAVING" } });
      recordAttempt(selectionHash, attemptNo, finalParsed);
      setNextAttempt(selectionHash, attemptNo + 1);
      if (inpAttempt) inpAttempt.value = String(attemptNo + 1);
    } catch (e) { console.error(e); }

    try { startExam?.(); } catch (e) { console.error(e); }
    showToast?.({ id:"PRACTICE_AI_ATTEMPT_READY", vars:{ attemptNo }, kind:"ok" });

  } catch (err){
    console.error(err);

    // ✅ Tema uyumlu glass uyarı kartı
    showNotesError?.(err?.message || "Deneme üretilemedi. Lütfen notları kontrol et.");

    // ✅ merkezi hata toast
    showWarn?.(err);

    return;

  } finally {
    setLoading?.(false);
  }
}


  function setDistribution(next){
    distribution = next === "priority" ? "priority" : "balanced";
    btnDistBalanced?.classList.toggle("is-active", distribution === "balanced");
    btnDistPriority?.classList.toggle("is-active", distribution === "priority");
    refresh();
  }

  // --- EVENT LISTENERS (BURASI ARTIK initNotesTab İÇİNDE) ---

  btnAddPaste?.addEventListener("click", addNoteFromPaste);
  btnAddFile?.addEventListener("click", addNoteFromFile);
  btnAddDrive?.addEventListener("click", addNoteFromDrive);
  btnGen?.addEventListener("click", generateSelectedPractice);

  btnDistBalanced?.addEventListener("click", () => setDistribution("balanced"));
  btnDistPriority?.addEventListener("click", () => setDistribution("priority"));

  btnSelectAll?.addEventListener("click", () => {
    for (const n of listNotes()) selectedIds.add(n.id);
    refresh();
  });

  btnClearSel?.addEventListener("click", () => {
    selectedIds.clear();
    refresh();
  });

  // Başlangıç ayarları
  bindListEvents();
  btnDistBalanced?.classList.toggle("is-active", distribution === "balanced");
  btnDistPriority?.classList.toggle("is-active", distribution === "priority");
  
  refresh();

} // <--- initNotesTab BURADA BİTİYOR
