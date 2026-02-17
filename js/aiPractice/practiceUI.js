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
      ${shouldShowDocxExport(note) ? `<button class="btn ghost noteExport" title="Word olarak indir (Deneme + Cevap Anahtarı)">⬇️</button>` : ``}
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
             ${deleteBtn}
          </div>

        </div>
      </div>
    `}).join("");
  }

  // --- SİLME İŞLEVİNİ TETİKLEYEN FONKSİYON ---
// --- SİLME İŞLEVİNİ TETİKLEYEN FONKSİYON (MODAL İLE) ---
  async function deletePastAttempt(selHash, attemptNo) {
    // Tarayıcı confirm'i yerine kendi şık modalımızı kullanıyoruz
    showModal({
      title: "Denemeyi Sil",
      okText: "Evet, Sil",
      cancelText: "Vazgeç",
      bodyHtml: `
        <div style="text-align: center; padding: 10px 0;">
          <div style="font-size: 42px; margin-bottom: 12px;">🗑️</div>
          <div style="font-size: 15px; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">
            Deneme #${attemptNo} silinecek.
          </div>
          <div style="font-size: 13px; color: var(--muted); line-height: 1.4;">
            Bu işlem geri alınamaz ve sınav verisi kalıcı olarak kaybolur.<br>Devam etmek istiyor musun?
          </div>
        </div>
      `,
      onOk: async (modalEl) => {
        // Silme işlemi onaylandıktan sonra burada çalışır
        if (typeof deleteAttempt === "function") {
            const success = deleteAttempt(selHash, attemptNo);
            if (success) {
                renderPracticeHistory(selHash);
                if (typeof showToast === "function") showToast({ id:"PRACTICE_ATTEMPT_TRASHED", vars:{ attemptNo }, kind:"ok" });
            } else {
                 if (typeof showWarn === "function") showWarn({id:"NOTE_RECORD_NOT_FOUND"});
            }
        } else {
            console.error("deleteAttempt fonksiyonu bulunamadı.");
        }
      }
    });
  }

  // Fonksiyonu global'e ata (HTML onclick için)
  window.deletePastAttempt = deletePastAttempt;
  
  // HTML onclick'ten erişebilmesi için window'a atıyoruz
  window.deletePastAttempt = deletePastAttempt;

  async function loadPastAttempt(selHash, attemptNo) {
    try {
      if (typeof setLoading === "function") setLoading(true, { id:"PRACTICE_LOADING_ATTEMPT", vars:{ attemptNo } });
      
      const rawData = localStorage.getItem("acumen_practice_history_v1");
      const db = rawData ? JSON.parse(rawData) : { bySel: {} };
      const row = db.bySel[selHash];
      
      if (!row || !row.attempts || !row.attempts[attemptNo]) {
        throw appError("ERR_KAYIT_BULUNAMADI");
      }

      const savedExam = row.attempts[attemptNo].parsedData; 
      if (!savedExam) {
         // Eski kayıtlarda veri olmadığı için buraya düşer
         throw appError("ERR_BU_DENEME_ESKI_SURUMLE_OLUSTURULMUS");
      }

      state.parsed = JSON.parse(JSON.stringify(savedExam));
      state.mode = "prep";
      state.answers?.clear?.();

      if (typeof paintAll === "function") paintAll();
      if (typeof persist === "function") persist();
      
      if (typeof startExam === "function") {
        startExam();
        if (typeof showToast === "function") showToast({ id:"PRACTICE_ATTEMPT_LOADED", vars:{ attemptNo }, kind:"ok" });
      }
    } catch (err) {
      console.error(err);
      if (typeof showWarn === "function") showWarn(err);
    } finally {
      if (typeof setLoading === "function") setLoading(false);
    }
  }

  // Fonksiyonu global'e ata (HTML onclick için)
  // --- DOCX EXPORT (Notes / Generated Exams) ---------------------------------
async function ensureDocxLib(){
  // Supports CDN globals
  const docxLib = window.docx;
  const saver = window.saveAs;
  if (!docxLib || !docxLib.Document || !docxLib.Packer) {
    throw new Error("DOCX kütüphanesi yüklenemedi. (docx)");
  }
  if (typeof saver !== "function") {
    throw new Error("İndirme kütüphanesi yüklenemedi. (FileSaver)");
  }
  return { docxLib, saveAs: saver };
}

function safeFileName(name){
  return String(name || "deneme")
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "deneme";
}

function pickQuestions(exam){
  if (!exam || typeof exam !== "object") return [];
  const q = exam.questions || exam.items || exam.qs || exam.quiz || [];
  return Array.isArray(q) ? q : [];
}

function pickOptions(q){
  const opts = q?.options || q?.choices || q?.answers || q?.items || [];
  return Array.isArray(opts) ? opts : [];
}

function pickQuestionText(q){
  return String(q?.text ?? q?.question ?? q?.stem ?? q?.prompt ?? q?.title ?? "").trim();
}

function pickCorrect(q){
  const raw = q?.correctIndex ?? q?.answerIndex ?? q?.correct ?? q?.answer ?? q?.key ?? q?.correctOption ?? null;
  let letter = null;

  if (typeof raw === "number" && raw >= 0 && raw < 26) {
    letter = String.fromCharCode(65 + raw);
  } else if (typeof raw === "string") {
    const s = raw.trim();
    const m = s.match(/^([A-E])\b/i);
    if (m) letter = m[1].toUpperCase();
  }
  return { letter, raw };
}

function extractExamForDocx(note){
  // 1) Structured payloads
  const exam = note?.parsedData || note?.exam || note?.meta?.exam || null;
  if (exam) return { kind: "structured", exam };

  // 2) Try to parse plain text exports into a structured exam
  const text = String(note?.text || "");
  const parsed = parseExamTextToStructured(text);
  if (parsed) return { kind: "parsed", parsed };

  // 3) Fallback: raw text
  return { kind: "text", text };
}

function parseExamTextToStructured(rawText){
  const text = String(rawText || "").replace(/\r/g, "").trim();
  if (!text) return null;

  // Split answer key section if exists
  const keySplit = text.split(/✅\s*CEVAP\s*ANAHTARI[\s\S]*/i);
  const mainPart = keySplit[0].trim();

  // Extract key lines (best effort)
  let keyMap = new Map(); // no -> letter
  const keyMatch = text.match(/✅\s*CEVAP\s*ANAHTARI[\s\S]*?(\n[\s\S]*)$/i);
  if (keyMatch && keyMatch[1]) {
    const keyText = keyMatch[1]
      .replace(/\|/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // patterns like 1-C 2-C ...
    const rePair = /(\d+)\s*[-–—]\s*([A-E])/gi;
    let m;
    while ((m = rePair.exec(keyText))) {
      keyMap.set(parseInt(m[1], 10), m[2].toUpperCase());
    }
  }

  // Parse header lines (before first question)
  const qStart = mainPart.search(/^\s*\d+\.\s+/m);
  const headerText = (qStart >= 0 ? mainPart.slice(0, qStart) : "").trim();
  const bodyText = (qStart >= 0 ? mainPart.slice(qStart) : mainPart).trim();

  const headerLines = headerText.split("\n").map(l => l.trim()).filter(Boolean);

  // Heuristics: course line + exam line
  let course = "";
  let examTitle = "";
  let meta = "";

  if (headerLines.length) {
    // Example:
    // REKLAMCILIK 1
    // DENEME SINAVI – 3
    // (20 Soru / 5 Şık)
    course = headerLines[0] || "";
    examTitle = headerLines[1] || "";
    meta = headerLines.slice(2).join(" ");
  }

  // Parse questions:
  // Format:
  // 1. question...
  // A) ...
  // B) ...
  const qBlocks = bodyText.split(/^\s*(\d+)\.\s+/m).filter(s => s.trim() !== "");
  // split keeps numbers? Using split with capture yields [pre, num, rest, num, rest...]
  // We want pairs
  const parts = bodyText.split(/^\s*(\d+)\.\s+/m);
  const questions = [];
  for (let i = 1; i < parts.length; i += 2) {
    const no = parseInt(parts[i], 10);
    const block = String(parts[i+1] || "").trim();

    // options lines start with A) B)...
    // We'll find all option starts and split
    const optParts = block.split(/^\s*([A-E])\)\s+/m);
    // optParts: [qText, "A", optA, "B", optB, ...]
    const qText = (optParts[0] || "").trim().replace(/\n+/g, " ");
    const options = [];
    for (let j = 1; j < optParts.length; j += 2) {
      const letter = optParts[j];
      const optText = (optParts[j+1] || "").trim().split("\n")[0].trim(); // stop at newline to avoid bleeding
      options.push({ letter: letter.toUpperCase(), text: optText });
    }

    // If options didn't parse, try line-based fallback (A) lines)
    const optsClean = options.map(o => o.text).filter(Boolean);

    const correctLetter = keyMap.get(no) || null;
    questions.push({
      no,
      text: qText,
      options: optsClean,
      correctLetter
    });
  }

  if (!questions.length) return null;

  return {
    course,
    examTitle,
    meta,
    questions
  };
}



async function exportNoteAsDocx(noteId){
  const { docxLib, saveAs } = await ensureDocxLib();
  const {
    Document, Packer, Paragraph, TextRun,
    HeadingLevel, AlignmentType,
    Table, TableRow, TableCell,
    WidthType, Footer
  } = docxLib;

  const note = listNotes().find(n => n.id === noteId);
  if (!note) throw new Error("Not bulunamadı.");

  const titleRaw = String(note.title || "Deneme").trim();
  const createdAt = note.createdAt ? new Date(note.createdAt) : null;

  // ---- Small docx helpers ----
  const TR = (text, opts={}) => new TextRun({ text: String(text ?? ""), ...opts });
  const PARA = (children, opts={}) => new Paragraph({ children, ...opts });
  const SP_TIGHT  = { before: 0, after: 40,  line: 260 };
  const SP_NORMAL = { before: 0, after: 80,  line: 260 };
  const SP_LOOSE  = { before: 0, after: 120, line: 260 };

  const children = [];

  // ---------- HEADER ----------
  children.push(PARA(
    [TR(titleRaw, { bold: true })],
    { alignment: AlignmentType.CENTER, spacing: SP_TIGHT, heading: HeadingLevel.HEADING_1 }
  ));

  if (createdAt && !isNaN(createdAt.getTime())) {
    children.push(PARA(
      [TR(`Tarih: ${createdAt.toLocaleDateString("tr-TR")}`, { color: "666666" })],
      { alignment: AlignmentType.CENTER, spacing: SP_NORMAL }
    ));
  }

  // Divider
  children.push(new Paragraph({
    spacing: { before: 0, after: 140 },
    border: { bottom: { color: "BBBBBB", space: 1, value: "single", size: 6 } }
  }));

  const extracted = extractExamForDocx(note);

  // ---------- QUESTIONS ----------
  let questions = [];
  let parsedHeader = null;

  if (extracted.kind === "structured") {
    questions = pickQuestions(extracted.exam);
  } else if (extracted.kind === "parsed") {
    parsedHeader = extracted.parsed;
    questions = extracted.parsed.questions || [];
  }

  // If parsed header exists, use it for a cleaner header (course / exam title / meta)
  if (parsedHeader) {
    // Replace the H1-like header with a more exam-like layout:
    // (We can't remove already-added paragraphs, so we just add a clean block on top of questions.)
    children.push(PARA([TR(parsedHeader.course || titleRaw, { bold: true })], { alignment: AlignmentType.CENTER, spacing: SP_TIGHT }));
    if (parsedHeader.examTitle) {
      children.push(PARA([TR(parsedHeader.examTitle, { bold: true })], { alignment: AlignmentType.CENTER, spacing: SP_TIGHT }));
    }
    if (parsedHeader.meta) {
      children.push(PARA([TR(parsedHeader.meta, { color: "666666" })], { alignment: AlignmentType.CENTER, spacing: SP_LOOSE }));
    } else {
      children.push(new Paragraph({ spacing: { before: 0, after: 160 } }));
    }
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    // Fallback: plain text, but formatted
    const text = (extracted.kind === "text" ? extracted.text : String(note?.text || "")).trim();
    children.push(PARA(
      [TR(text || "(İçerik yok)")],
      { spacing: SP_NORMAL }
    ));
  } else {
    questions.forEach((q, idx) => {
      const no = q?.no ?? q?.number ?? (idx + 1);
      const qText = pickQuestionText(q) || "(Soru metni yok)";

      // Question paragraph (bold number only)
      children.push(new Paragraph({
        spacing: SP_NORMAL,
        children: [
          TR(`${no}) `, { bold: true }),
          TR(qText)
        ]
      }));

      // Options (indented)
      const opts = (extracted.kind === "parsed") ? (q.options || []) : pickOptions(q);
      opts.forEach((opt, i) => {
        const letter = String.fromCharCode(65 + i);
        const optText = (typeof opt === "string")
          ? opt
          : String(opt?.text ?? opt?.label ?? opt?.value ?? "");

        children.push(new Paragraph({
          spacing: { before: 0, after: 20, line: 240 },
          indent: { left: 720 },
          children: [
            TR(`${letter}) `, { bold: true }),
            TR(optText)
          ]
        }));
      });

      // Extra gap after each question block
      children.push(new Paragraph({ spacing: { before: 0, after: 80 } }));
    });

    // ---------- ANSWER KEY ----------
    children.push(PARA(
      [TR("CEVAP ANAHTARI", { bold: true })],
      { spacing: SP_NORMAL, heading: HeadingLevel.HEADING_2 }
    ));

    // Build compact grid: 5 entries per row, each entry = (No | Answer)
    const entries = questions.map((q, idx) => {
      const no = q?.no ?? q?.number ?? (idx + 1);
      let ans = "-";
      if (extracted.kind === "parsed") {
        ans = String(q?.correctLetter || "-");
      } else {
        const c = pickCorrect(q);
        ans = String(c.letter || "-");
      }
      return { no: String(no), ans };
    });

    const rows = [];
    for (let i = 0; i < entries.length; i += 5) {
      const slice = entries.slice(i, i + 5);

      const cells = [];
      slice.forEach((e) => {
        // No cell
        cells.push(new TableCell({
          width: { size: 8, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [TR(e.no, { bold: true })] })]
        }));
        // Answer cell
        cells.push(new TableCell({
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [TR(e.ans)] })]
        }));
      });

      // Pad to 5 entries (10 cells) for consistent width
      while (cells.length < 10) {
        cells.push(new TableCell({ children: [new Paragraph("")] }));
      }

      rows.push(new TableRow({ children: cells }));
    }

    // If Table is not available (older builds), fallback to text line
    if (typeof Table === "function") {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows
      }));
    } else {
      const line = entries.map(e => `${e.no}-${e.ans}`).join(" | ");
      children.push(new Paragraph({ text: line || "-", spacing: SP_NORMAL }));
    }
  }

  const doc = new Document({
  sections: [{
    properties: {
      page: {
        margin: { top: 720, right: 720, bottom: 720, left: 720 }
      }
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0, line: 240 },
            children: [
              new TextRun({ text: "ACUMEN • Intelligent Exam System", color: "999999", size: 18 })
            ]
          })
        ]
      })
    },
    children
  }]
});
  const blob = await Packer.toBlob(doc);
  const fileName = safeFileName(titleRaw) + ".docx";
  saveAs(blob, fileName);
}


  window.loadPastAttempt = loadPastAttempt;
  window.exportNoteAsDocx = exportNoteAsDocx;

  function refresh() {
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

      

      // ⬇️ Word Export (Deneme + Cevap Anahtarı)
      if (e.target?.classList?.contains("noteExport")) {
        e.preventDefault();
        e.stopPropagation();
        try {
          await exportNoteAsDocx(id);
        } catch (err) {
          console.error(err);
          if (typeof showWarn === "function") showWarn(err);
        }
        return;
      }
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
