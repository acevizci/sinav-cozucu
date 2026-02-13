// js/aiPractice/practiceUI.js
// Notes Tab UI + Multi-select + AI Practice Generation

import { normalizeText } from "../utils.js";
import { readFileAsText } from "../parser.js";
import { listNotes, upsertNote, removeNote, renameNote, makeSelectionHash } from "./notesStore.js";
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
        <button class="ghost btnCancel">${escapeHtml(cancelText)}</button>
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
                if (typeof showToast === "function") showToast({ title: "Başarılı", msg: `Deneme #${attemptNo} çöpe atıldı.`, kind: "ok" });
            } else {
                 if (typeof showWarn === "function") showWarn("Silinemedi. Kayıt bulunamadı.");
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
      if (typeof setLoading === "function") setLoading(true, `Deneme #${attemptNo} yükleniyor...`);
      
      const rawData = localStorage.getItem("acumen_practice_history_v1");
      const db = rawData ? JSON.parse(rawData) : { bySel: {} };
      const row = db.bySel[selHash];
      
      if (!row || !row.attempts || !row.attempts[attemptNo]) {
        throw new Error("Kayıt bulunamadı.");
      }

      const savedExam = row.attempts[attemptNo].parsedData; 
      if (!savedExam) {
         // Eski kayıtlarda veri olmadığı için buraya düşer
         throw new Error("Bu deneme eski sürümle oluşturulmuş, içeriği yüklenemiyor. Lütfen yeni bir deneme üret.");
      }

      state.parsed = JSON.parse(JSON.stringify(savedExam));
      state.mode = "prep";
      state.answers?.clear?.();

      if (typeof paintAll === "function") paintAll();
      if (typeof persist === "function") persist();
      
      if (typeof startExam === "function") {
        startExam();
        if (typeof showToast === "function") showToast({ title: "Başarılı", msg: `Deneme #${attemptNo} yüklendi.`, kind: "ok" });
      }
    } catch (err) {
      console.error(err);
      if (typeof showWarn === "function") showWarn(err.message);
    } finally {
      if (typeof setLoading === "function") setLoading(false);
    }
  }

  // Fonksiyonu global'e ata (HTML onclick için)
  window.loadPastAttempt = loadPastAttempt;

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
        if (!text || String(text).trim().length < 80) throw new Error("Not çok kısa. Biraz daha içerik ekle.");
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
        showToast?.({ title:"Not", msg:"Dosya notlara eklendi", kind:"ok" });
      } catch (err){
        console.error(err);
        showWarn?.(err?.message || "Dosya okunamadı");
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
      showWarn?.("Drive entegrasyonu bulunamadı");
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
      cancelText: "Kapat",
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
          return `
            <button class="drivePickItem ${isFolder(mt) ? "isFolder":""}"
              data-id="${escapeHtml(id)}"
              data-name="${escapeHtml(name)}"
              data-mime="${escapeHtml(mt)}">
              <span class="drivePickName">${escapeHtml(name)}</span>
              <span class="drivePickBadge">${escapeHtml(labelOf(mt))}</span>
            </button>
          `;
        }).join("");

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
                throw new Error("Drive içeriği alınamadı veya çok kısa.");

              const note = upsertNote({
                title: name,
                text,
                source: "drive",
                driveMeta: { id, mimeType: mt }
              });

              selectedIds.add(note.id);
              showToast?.({ title:"Drive", msg:"Not eklendi", kind:"ok" });
              refresh();
            } catch(err){
              console.error(err);
              showWarn?.(err?.message || "Drive not eklenemedi");
            } finally {
              setLoading?.(false);
            }
          });
        });
      } catch (e){
        console.error(e);
        showWarn?.(e?.message || "Drive listesi alınamadı");
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
      showWarn?.("Seçili notlarda yeterli içerik yok.");
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
      setLoading?.(true, `Deneme ${attemptNo} üretiliyor…`);
      const previous = getPreviousHints(selectionHash);
      const resp = await generatePractice({ sources, attemptNo, settings, previous });
      const parsed = toParsedExam(resp, { fallbackTitle: `Deneme ${attemptNo}` });
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
        recordAttempt(selectionHash, attemptNo, finalParsed);
        setNextAttempt(selectionHash, attemptNo + 1);
        if (inpAttempt) inpAttempt.value = String(attemptNo + 1);
      } catch (e) { console.error(e); }

      try { startExam?.(); } catch (e) { console.error(e); }
      showToast?.({ title:"AI", msg:`Deneme ${attemptNo} hazır. Başlatıldı.`, kind:"ok" });
    } catch (err){
      console.error(err);
      showWarn?.(err?.message || "Deneme üretilemedi");
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