// js/ui/scratchpad.js - Whitepaper (karalama) alanı
// Session boyunca saklanır (sessionStorage). Sonuç ekranında da erişilir.
// Minimal, bağımsız: app.js'e dokunmadan index.html'den yüklenebilir.

import { showToast } from "./status.js";

const STORE_KEY = "ACUMEN_SCRATCHPAD_V1";

// ======================
//  FINISH GUARD (Scratchpad doluyken uyarı)
// ======================
function _scratchpadIsDirty(data){
  try{
    const t = String(data?.text || "").trim();
    const hasText = t.length > 0;
    const hasStrokes = Array.isArray(data?.strokes) && data.strokes.length > 0;
    return hasText || hasStrokes;
  }catch(e){ return false; }
}

// Global helper (keyboard.js ve btnFinish click için)
function _acumenConfirmModal({
  title = "Onay",
  message = "",
  confirmText = "Evet",
  cancelText = "Vazgeç",
  icon = "↻",
  danger = false,
} = {}){
  // Theme-first: modalOverlay + modalCard (app.js'deki Sıfırdan Başla modaliyle aynı)
  // Eğer DOM yoksa (beklenmedik durum), native confirm'e düş.
  if (typeof document === "undefined") return Promise.resolve(true);

  return new Promise((resolve)=>{
    // varsa açık kalan eski modalı temizle
    const old = document.getElementById("scratchpadFinishModal");
    if (old) old.remove();

    const modal = document.createElement("div");
    modal.id = "scratchpadFinishModal";
    modal.className = "modalOverlay";
    modal.style.display = "flex";
    modal.style.zIndex = "100000";

    const dangerStyle = danger
      ? "background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4);"
      : "";

    modal.innerHTML = `
      <div class="modalCard" role="dialog" aria-modal="true" style="max-width: 380px; text-align: center; animation: popIn 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28);">
        <div style="font-size: 42px; margin-bottom: 12px; filter: drop-shadow(0 4px 12px rgba(168,85,247,0.4));">${icon}</div>
        <h3 class="modalTitle" style="margin-bottom: 8px; font-size: 20px;">${title}</h3>
        <p class="modalSub" style="margin-bottom: 24px; line-height: 1.5; color: #a1a1aa; font-size: 14px;">
          ${message}
        </p>
        <div class="modalActions" style="justify-content: center; gap: 12px; width: 100%;">
          <button id="btnScratchpadFinishCancel" class="btn secondary" style="flex:1; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);">${cancelText}</button>
          <button id="btnScratchpadFinishOk" class="btn primary" style="flex:1; ${dangerStyle}">${confirmText}</button>
        </div>
      </div>
    `;

    const done = (val)=>{
      try{ document.removeEventListener("keydown", onKey, true); }catch(e){}
      modal.style.opacity = "0";
      setTimeout(()=>{ try{ modal.remove(); }catch(e){} }, 180);
      resolve(!!val);
    };

    const onKey = (e)=>{
      if (e.key === "Escape") { e.preventDefault(); done(false); }
      if (e.key === "Enter")  { e.preventDefault(); done(true); }
    };
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(modal);

    modal.querySelector("#btnScratchpadFinishCancel")?.addEventListener("click", ()=> done(false));
    modal.querySelector("#btnScratchpadFinishOk")?.addEventListener("click", ()=> done(true));
    modal.addEventListener("click", (e)=>{ if (e.target === modal) done(false); });
  });
}

window.confirmFinishIfScratchpadDirty = async function(){
  try{
    const cur = loadStore();
    if (!_scratchpadIsDirty(cur)) return true;
    const ok = await _acumenConfirmModal({
      title: "Karalama dolu",
      message: "Karalama alanında içerik var. Yine de sınavı bitirmek istiyor musun?",
      confirmText: "Evet, Bitir",
      cancelText: "Vazgeç",
      icon: "↻",
      danger: true,
    });
    // Finish onaylandıysa karalama defterini sıfırla (sonuç ekranında temiz başlasın)
    if (ok){
      try{ window.resetScratchpad?.({ silent:true }); }
      catch(e){
        try{ sessionStorage.removeItem(STORE_KEY); }catch(e2){}
      }
    }
    return !!ok;
  }catch(e){
    return true;
  }
};

function loadStore(){
  try{
    const raw = sessionStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : { text:"", strokes:[], meta:{} };
  }catch(e){
    return { text:"", strokes:[], meta:{} };
  }
}
function saveStore(data){
  try{ sessionStorage.setItem(STORE_KEY, JSON.stringify(data)); }catch(e){}
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

export function initScratchpad(){
  const btn = document.getElementById("btnScratchpad");
  const ov  = document.getElementById("scratchpadOverlay");
  const card= ov?.querySelector?.(".scratchpadCard");
  const closeBtn = document.getElementById("btnScratchpadClose");
  const pinBtn   = document.getElementById("btnScratchpadPin");
  const canvas = document.getElementById("scratchpadCanvas");
  const ta = document.getElementById("scratchpadText");

  if (!btn || !ov || !card || !canvas || !ta) return;

  // 🔒 Exam Finish Guard: Scratchpad doluyken "Yine de bitir?" sor
  // Capture phase ile diğer handler'lardan önce çalışır.
  const btnFinish = document.getElementById("btnFinish");
  btnFinish?.addEventListener("click", async (e)=>{
    try{
      // sadece sınav modunda anlamlı
      // (state yoksa da sor; bu sadece güvenlik)
      const ok = await window.confirmFinishIfScratchpadDirty?.();
      if (!ok){
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
      }
    }catch(err){}
  }, true);

  // Tabs
  const tabBtns = Array.from(ov.querySelectorAll(".scratchpadTab"));
  const panes   = Array.from(ov.querySelectorAll(".scratchpadPane"));
  function setTab(name){
    tabBtns.forEach(b=>{
      const on = b.dataset.tab === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    panes.forEach(p=> p.classList.toggle("is-active", p.dataset.pane === name));
    if (name === "text") ta.focus();
  }
  tabBtns.forEach(b=> b.addEventListener("click", ()=> setTab(b.dataset.tab)));

  // Open/Close
  function open(){
    ov.style.display = "flex";
    ov.setAttribute("aria-hidden","false");
    // Default tab: draw
    setTab("draw");
    resizeCanvas();
  }
  function close(){
    ov.style.display = "none";
    ov.setAttribute("aria-hidden","true");
  }

  btn.addEventListener("click", ()=>{
    if (ov.style.display === "flex") close(); else open();
  });
  closeBtn?.addEventListener("click", close);
  ov.addEventListener("click", (e)=>{ if (e.target === ov) close(); });

  // Hotkey: W
  document.addEventListener("keydown", (e)=>{
    if (e.key?.toLowerCase?.() !== "w") return;
    // don't steal typing in textarea/inputs
    const tag = (document.activeElement?.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    e.preventDefault();
    if (ov.style.display === "flex") close(); else open();
  });

  // ======================
  //   TEXT (auto-save)
  // ======================
  const store = loadStore();
  ta.value = String(store.text || "");
  ta.addEventListener("input", ()=>{
    store.text = ta.value;
    saveStore(store);
  });

  // Text actions
  const btnCopy = document.getElementById("spCopy");
  const btnClearText = document.getElementById("spClearText");
  btnCopy?.addEventListener("click", async ()=>{
    try{
      await navigator.clipboard.writeText(ta.value || "");
      showToast?.({ id:"SCRATCHPAD_COPIED", kind:"ok", text:"Not kopyalandı." });
    }catch(e){
      showToast?.({ id:"SCRATCHPAD_COPY_FAIL", kind:"warn", text:"Kopyalanamadı." });
    }
  });
  btnClearText?.addEventListener("click", ()=>{
    ta.value = "";
    store.text = "";
    saveStore(store);
    showToast?.({ id:"SCRATCHPAD_TEXT_CLEARED", kind:"ok", text:"Not temizlendi." });
  });

  // ======================
  //   DRAW (canvas)
  // ======================
  const ctx = canvas.getContext("2d", { alpha: true });

  let tool = "pen"; // pen | eraser
  const btnPen = document.getElementById("spPen");
  const btnEraser = document.getElementById("spEraser");
  const btnUndo = document.getElementById("spUndo");
  const btnClear = document.getElementById("spClear");

  function setTool(next){
    tool = next;
    btnPen?.classList.toggle("is-active", tool==="pen");
    btnEraser?.classList.toggle("is-active", tool==="eraser");
  }
  btnPen?.addEventListener("click", ()=> setTool("pen"));
  btnEraser?.addEventListener("click", ()=> setTool("eraser"));

  // Stroke model: {tool:"pen"|"eraser", w:number, pts:[[x,y,t],...]}
  store.strokes = Array.isArray(store.strokes) ? store.strokes : [];

  function dpr(){
    return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  }

  function resizeCanvas(){
    // Keep content: redraw from strokes after resize
    const wrap = canvas.parentElement;
    if (!wrap) return;

    const r = wrap.getBoundingClientRect();
    const W = Math.max(320, Math.floor(r.width));
    const H = Math.max(240, Math.floor(r.height));
    const scale = dpr();

    canvas.width  = Math.floor(W * scale);
    canvas.height = Math.floor(H * scale);
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    renderAll();
  }

  function clearCtx(){
    const w = canvas.width / dpr();
    const h = canvas.height / dpr();
    ctx.clearRect(0,0,w,h);
  }

  function drawStroke(s){
    const pts = s?.pts || [];
    if (pts.length < 2) return;

    const isE = s.tool === "eraser";
    ctx.save();
    ctx.globalCompositeOperation = isE ? "destination-out" : "source-over";
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = clamp(Number(s.w || 3), 1, 22);

    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i=1;i<pts.length;i++){
      ctx.lineTo(pts[i][0], pts[i][1]);
    }
    ctx.stroke();
    ctx.restore();
  }

  function renderAll(){
    clearCtx();
    for (const s of store.strokes) drawStroke(s);
  }

  // Expose: finish sonrası / manuel sıfırlama
  // opts.silent=true ise toast göstermeden temizler.
  window.resetScratchpad = function(opts = {}){
    try{
      store.text = "";
      store.strokes = [];
      store.meta = {};
      saveStore(store);
    }catch(e){
      try{ sessionStorage.removeItem(STORE_KEY); }catch(e2){}
    }
    try{ ta.value = ""; }catch(e){}
    try{ renderAll(); }catch(e){}
    if (!opts.silent){
      showToast?.({ id:"SCRATCHPAD_RESET", kind:"ok", text:"Karalama temizlendi." });
    }
  };

  btnUndo?.addEventListener("click", ()=>{
    if (!store.strokes.length) return;
    store.strokes.pop();
    saveStore(store);
    renderAll();
  });
  btnClear?.addEventListener("click", ()=>{
    store.strokes = [];
    saveStore(store);
    renderAll();
    showToast?.({ id:"SCRATCHPAD_CLEARED", kind:"ok", text:"Whitepaper temizlendi." });
  });

  // Drawing input
  let drawing = false;
  let cur = null;

  function posFromEvent(e){
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left);
    const y = (e.clientY - rect.top);
    return [clamp(x, 0, rect.width), clamp(y, 0, rect.height)];
  }

  function start(e){
    drawing = true;
    canvas.setPointerCapture?.(e.pointerId);
    const [x,y] = posFromEvent(e);

    cur = {
      tool,
      w: tool==="eraser" ? 18 : 3.2,
      pts: [[x,y,Date.now()]]
    };
    // draw a dot immediately for taps
    ctx.save();
    ctx.globalCompositeOperation = (tool==="eraser") ? "destination-out" : "source-over";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(x,y, (cur.w/2), 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function move(e){
    if (!drawing || !cur) return;
    const [x,y] = posFromEvent(e);
    cur.pts.push([x,y,Date.now()]);
    // incremental draw
    drawStroke({ ...cur, pts: cur.pts.slice(-2) });
  }

  function end(){
    if (!drawing || !cur) return;
    drawing = false;

    // normalize points relative to current canvas size (for stable re-render)
    // stored in CSS pixels; ok because we setTransform(dpr) and use CSS px coords.
    store.strokes.push(cur);
    saveStore(store);
    cur = null;
  }

  canvas.addEventListener("pointerdown", (e)=>{ e.preventDefault(); start(e); });
  canvas.addEventListener("pointermove", (e)=>{ e.preventDefault(); move(e); });
  canvas.addEventListener("pointerup",   (e)=>{ e.preventDefault(); end(); });
  canvas.addEventListener("pointercancel",(e)=>{ e.preventDefault(); end(); });

  // Pin suggestion (manual) — later: call window.scratchpadSuggestPin(...)
  pinBtn?.addEventListener("click", ()=>{
    const last = store?.meta?.pinSuggestion;
    if (!last){
      showToast?.({ id:"SCRATCHPAD_NO_PIN", kind:"warn", text:"Pin önerisi yok. '?' koyduğunda öneri düşecek." });
      return;
    }
    // Insert a small template into text area (no auto-writing unless user clicks pin)
    const tag = `📌 Soru ${last.n}${last.subject ? " • "+last.subject : ""}\n`;
    const next = (ta.value ? (ta.value.trimEnd()+"\n\n") : "") + tag + "→ Not:\n";
    ta.value = next;
    store.text = next;
    saveStore(store);
    setTab("text");
    showToast?.({ id:"SCRATCHPAD_PIN_APPLIED", kind:"ok", text:"Pin önerisi eklendi." });
  });

  // Expose simple API for other modules (unsure toggle vs.)
  window.openScratchpad = open;
  window.closeScratchpad = close;
  window.scratchpadSuggestPin = function(n, subject){
    store.meta = store.meta || {};
    store.meta.pinSuggestion = { n, subject: subject || "" , at: Date.now() };
    saveStore(store);
    // show a tiny non-intrusive toast (no auto-writing)
    showToast?.({ id:"SCRATCHPAD_PIN_SUGGEST", kind:"info", text:`Pin önerisi hazır: Soru ${n}` });
  };

  // Resize handling
  window.addEventListener("resize", ()=>{ if (ov.style.display === "flex") resizeCanvas(); });
  // initial render
  resizeCanvas();
}
try{
  // Auto-init (index.html loads this module before app.js)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initScratchpad);
  } else {
    initScratchpad();
  }
} catch (e) {}
