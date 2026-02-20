// js/ui/onboarding.js
// Lightweight, dependency-free onboarding tour for ACUMEN
// Features: spotlight (box-shadow cutout), tooltip card, next/prev/skip, versioned first-run storage,
// contextual tips, and a manual reopen button (❔).

const STORAGE_KEY = "ACUMEN_ONBOARDING_V1_DONE";
const STORAGE_VER = "v7";
const MODE_KEY = "ACUMEN_ONBOARDING_MODE_V1"; // bump when steps or UX changes // bump when steps or UX changes

const TIP_KEYS = {
  notes: "ACUMEN_TIP_NOTES_V1",
  ai: "ACUMEN_TIP_AI_V1",
  studio: "ACUMEN_TIP_STUDIO_V1",
  nav: "ACUMEN_TIP_NAV_V1",
  pati: "ACUMEN_TIP_PATI_V1",
  drive: "ACUMEN_TIP_DRIVE_V1",
};

function qs(sel, root=document){ return root.querySelector(sel); }

function getPatiIcon(){
  // Prefer the live Pati avatar emoji if present
  const el = qs('#patiAvatar');
  const t = (el?.textContent || '').trim();
  return t || '🐶';
}

function isVisible(el){
  if (!el) return false;
  const r = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return r.width > 2 && r.height > 2;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function safeScrollIntoView(el){
  try{
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center", inline: "nearest" });
  }catch{}
}

function prefersReducedMotion(){
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function isTourRunning(){
  return !!qs("#acumenTourRoot");
}

function isAnyBlockingModalOpen(){
  // ACUMEN has modal overlays in DOM even when closed. We must check computed style instead of presence.
  const overlays = Array.from(document.querySelectorAll(".modalOverlay, .modal-overlay, .overlay, .modal"));
  for (const el of overlays){
    try{
      const st = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const shown = st.display !== "none" && st.visibility !== "hidden" && st.opacity !== "0" && r.width > 10 && r.height > 10;
      if (shown) return true;
    }catch{}
  }
  return false;
}

function storeDone(){
  try{
    localStorage.setItem(STORAGE_KEY, `${STORAGE_VER}|1`);
  }catch{}
}

function hasDone(){
  try{
    const v = localStorage.getItem(STORAGE_KEY);
    return typeof v === "string" && v.startsWith(`${STORAGE_VER}|1`);
  }catch{
    return false;
  }
}

export function resetOnboarding(){
  try{ localStorage.removeItem(STORAGE_KEY); }catch{}
}

function buildSteps(){
  const steps = [];

  const pushIf = (selector, step, opts={}) => {
    const el = qs(selector);
    if (!el) return;
    if (opts.requireVisible && !isVisible(el)) return;
    steps.push({ selector, allowSkip: opts.allowSkip ?? true, quick: opts.quick ?? true, ...step, ...opts });
  };

  pushIf("#brandLogo", {
    title: "ACUMEN'e hoş geldin 👋",
    body: "Ben Pati 🐾  — bu kısa turda (≈30 sn) sana temel alanları göstereceğim. İstediğin an atlayabilir ya da sonra ❔ ile tekrar açabilirsin.",
    placement: "bottom"
  });

  // Pati & Besleme
  pushIf("#patiWidget", {
    title: "Pati ve Bakım 🐾",
    body: "Pati sen çözünce motive olur. Doğru yaptıkça mama kazanırsın ve 🍖 Besle ile Pati’yi besleyebilirsin. Eğer uzun süre beslemezsen keyfi düşer — arada bir mama ver 😉",
    placement: "left"
  });

  pushIf("#patiWidget .btn-feed", {
    title: "🍖 Besle",
    body: "Bu buton mama stokundan 1 harcar ve Pati’nin enerjisini artırır. Mama bitince yine doğru sayını artırarak mama toplayabilirsin.",
    placement: "left"
  }, { requireVisible: true });



  pushIf(".nav-pills", {
    title: "Kaynak seçimi",
    body: "Soruları dosyadan, metinden, Drive'dan veya Notlar'dan alabilirsin. İlk kez deniyorsan “Dosya” ile başlamak kolay.",
    placement: "bottom"
  });

  // Drive deep-dive (deneme üretimi)
  pushIf("#tabbtn-drive", {
    title: "Drive ile deneme üretimi",
    body: "Drive sekmesiyle PDF/Doc dosyalarını açıp hızlıca deneme hazırlayabilirsin. PDF'ler otomatik Stüdyo'ya gider.",
    placement: "bottom"
  }, { quick:false });

  const ensureDriveTab = () => {
    try{ qs('#tabbtn-drive')?.click(); }catch{}
  };

  const ensureDetailsOpen = (detailsSelector) => {
    try{
      const d = qs(detailsSelector);
      if (!d) return;
      if (!d.open) d.open = true;
    }catch{}
  };

  const ensureAdvSettingsOpen = () => ensureDetailsOpen("#advSettings");
  const ensureToolsOpen = () => ensureDetailsOpen("#toolsCollapsible");

  pushIf("#btnDriveList", {
    title: "Drive → Listele",
    body: "Drive’ım (root) ya da özel klasör modunda “Listele” ile içeriği getir. İstersen filtreyle arayabilirsin.",
    placement: "bottom",
    onEnter: ensureDriveTab,
    pulseSelector: "#btnDriveList",
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnModeFolder", {
    title: "Özel klasör modu",
    body: "Sadece belirli bir klasörden çalışacaksan “Klasör” moduna geçip klasör link/ID yapıştırabilirsin.",
    placement: "bottom",
    onEnter: ensureDriveTab,
  }, {quick:false,  requireVisible: true, waitForVisible: true });

  pushIf("#driveList", {
    title: "Dosya seç",
    body: "Listeden bir dosya seç. PDF seçersen “Seçileni Aç” seni otomatik Stüdyo’ya götürür (soru işaretleme → şablon).",
    placement: "right",
    onEnter: ensureDriveTab,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnDriveOpen", {
    title: "Seçileni Aç → Stüdyo",
    body: "PDF’te stüdyo açılır. Soruları işaretleyip şablonu kaydedince ACUMEN denemeyi otomatik hazırlar (BAŞLAT aktif olur).",
    placement: "bottom",
    onEnter: ensureDriveTab,
    pulseSelector: "#btnDriveOpen",
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf(".panel-left", {
    title: "Kontrol Merkezi",
    body: "Sınav ayarlarını buradan yaparsın. Hazır olunca BAŞLAT ile sınavı başlat.",
    placement: "right"
  });

  // Gelişmiş ayarlar (Focus / Otomasyon / Karıştırma)
  pushIf("#advSettings .adv-summary", {
    title: "Gelişmiş ayarlar",
    body: "Burada Focus Mod, Oto. Başlat ve karıştırma seçeneklerini yönetirsin. Sınav deneyimini kişiselleştirmen için önemli.",
    placement: "bottom",
    onEnter: ensureAdvSettingsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#focusMode", {
    title: "Focus Mod",
    body: "Dikkatini dağıtan öğeleri azaltır. Özellikle uzun denemelerde odaklanmayı kolaylaştırır.",
    placement: "left",
    onEnter: ensureAdvSettingsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#autoStart", {
    title: "Oto. Başlat",
    body: "Açıcınca sınavı otomatik başlatır. Hızlı pratik için açık tutabilirsin; ayar yapmak istiyorsan kapat.",
    placement: "left",
    onEnter: ensureAdvSettingsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#shuffleQ", {
    title: "Soru Karıştır",
    body: "Soruları her seferinde farklı sırayla getirir. Ezber etkisini azaltır.",
    placement: "left",
    onEnter: ensureAdvSettingsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#shuffleO", {
    title: "Şık Karıştır",
    body: "Şıkları (A/B/C/D/E) karıştırır. Şık ezberini kırmak için iyi bir seçenek.",
    placement: "left",
    onEnter: ensureAdvSettingsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  // Araçlar & Analiz
  pushIf("#toolsCollapsible .adv-summary", {
    title: "Araçlar & Analiz",
    body: "Yanlışlarını tekrar et, SRS ile kalıcı öğren, rapor indir. Performansını buradan yönetirsin.",
    placement: "bottom",
    onEnter: ensureToolsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnWrongMode", {
    title: "Yanlışlar",
    body: "Yanlış yaptığın soruları hızlı tekrar modunda çözebilirsin. Zayıf noktaları hedefler.",
    placement: "bottom",
    onEnter: ensureToolsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnSrsDash", {
    title: "SRS Hafıza 🧠",
    body: "Aralıklı tekrar (SRS) ile kalıcı öğrenme. Tekrar planını buradan görürsün.",
    placement: "bottom",
    onEnter: ensureToolsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnExportWrongBook", {
    title: "Detaylı Rapor",
    body: "İlerlemeni HTML rapor olarak indirip saklayabilirsin. Özellikle dönem sonu değerlendirmesinde işe yarar.",
    placement: "bottom",
    onEnter: ensureToolsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnClearWrongBook", {
    title: "Yanlışları Temizle",
    body: "Yanlış listesini sıfırlar. Yeni bir çalışma dönemine temiz başlamak için kullan.",
    placement: "top",
    onEnter: ensureToolsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnClearSave", {
    title: "Sıfırla",
    body: "Tüm ilerlemeyi sıfırlar. Geri dönüşü zor olabilir — kullanmadan önce emin ol.",
    placement: "top",
    onEnter: ensureToolsOpen,
  }, { requireVisible: true, waitForVisible: true, quick:false });

  pushIf("#btnStart", {
    title: "Başlat / Bitir",
    body: "BAŞLAT sınavı başlatır. Bitir ile özet/analiz ekranlarını açarsın.",
    placement: "bottom",
    pulseSelector: "#btnStart"
  });

  pushIf("#btn-open-studio", {
    title: "Şablon Stüdyosu",
    body: "“Oluştur” ile stüdyo akışına gidersin. PDF/Docx gibi kaynaklardan soru çıkarma için burası kritik.",
    placement: "bottom",
    pulseSelector: "#btn-open-studio"
  }, { quick:false });

  pushIf("#examArea", {
    title: "Sınav alanı",
    body: "Sorular burada akar. Çözerken şık işaretleyebilir, boş bırakabilir veya ‘emin değilim’ (?) gibi işaretler kullanabilirsin.",
    placement: "left"
  });

  // Nav panel may not be visible until exam starts.
  const navPanel = qs("#navPanel");
  if (navPanel && isVisible(navPanel)){
    steps.push({
      selector: "#navPanel",
      title: "Soru haritası",
      body: "Buradan soru atlayabilir ve durumları renklerden takip edebilirsin.",
      placement: "left",
      requireVisible: true
    });
  } else {
    // fallback: anchor to start button (always present)
    pushIf("#btnStart", {
      title: "Soru haritası (sınav başlayınca)",
      body: "Sınav başladığında soru haritası açılır. Oradan soru atlayabilir ve durumları renklerden takip edebilirsin.",
      placement: "bottom"
    });
  }

  pushIf("#btnScratchpad", {
    title: "Karalama Defteri (W)",
    body: "Eliminasyon ve kısa notlar için. Çözüm esnasında hız kazandırır.",
    placement: "bottom"
  }, { quick:false });

  pushIf('button[aria-controls="tab-notes"]', {
    title: "Notlar → Practice üretimi",
    body: "Notlarını seçip ACUMEN'in deneme üretmesine izin verebilirsin. (Dengeli/Öncelikli dağıtım seçenekleri var.)",
    placement: "bottom"
  }, { quick:false });

  pushIf("#btnThemeToggle", {
    title: "Tema ve Tur",
    body: "Buradan temayı değiştirebilirsin. Yanındaki ❔ ile tanıtım turunu istediğin zaman tekrar açabilirsin.",
    placement: "left"
  });

  return steps;
}

function createTourUI(){
  const root = document.createElement("div");
  root.id = "acumenTourRoot";
  root.innerHTML = `
    <div class="acumenTourSpot"></div>
    <div class="acumenTourCard" role="dialog" aria-modal="true" aria-label="ACUMEN Tanıtım Turu">
      <div class="acumenTourTop">
        <div class="acumenTourHeading">
          <div class="acumenTourMascot" aria-hidden="true">
            <span class="acumenTourMascotIcon">🐶</span>
            <span class="acumenTourMascotName">Pati</span>
          </div>
          <div class="acumenTourTitle"></div>
        </div>
        <div class="acumenTourMeta">
          <div class="acumenTourStep" aria-label="Adım"></div>
          <button class="acumenTourMode" type="button" data-act="mode" aria-label="Tur Modu">Hızlı</button>
          <button class="acumenTourX" type="button" aria-label="Kapat">✕</button>
        </div>
      </div>
      <div class="acumenTourBody"></div>

      <label class="acumenTourOnce">
        <input type="checkbox" class="acumenTourOnceChk" checked />
        <span>Bu turu bir daha gösterme</span>
      </label>

      <div class="acumenTourBottom">
        <div class="acumenTourDots"></div>
        <div class="acumenTourBtns">
          <button class="acumenTourBtn ghost" type="button" data-act="prev">Geri</button>
          <button class="acumenTourBtn ghost" type="button" data-act="skip">Atla</button>
          <button class="acumenTourBtn ghost mini" type="button" data-act="stepSkip">Geç</button>
          <button class="acumenTourBtn primary" type="button" data-act="next">İleri</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  return root;
}

function applyPulse(el){
  if (!el) return;
  try{ el.classList.add('acumenPulse'); }catch{}
}

function clearPulse(el){
  if (!el) return;
  try{ el.classList.remove('acumenPulse'); }catch{}
}

function setStudioReturnFlag(from){
  try{
    sessionStorage.setItem('ACUMEN_STUDIO_RETURN', JSON.stringify({ from: from || 'unknown', t: Date.now() }));
  }catch{}
}

function popStudioReturnFlag(){
  try{
    const raw = sessionStorage.getItem('ACUMEN_STUDIO_RETURN');
    if (!raw) return null;
    sessionStorage.removeItem('ACUMEN_STUDIO_RETURN');
    return JSON.parse(raw);
  }catch{ return null; }
}

function positionFor(el, card, placement){
  const pad = 12;
  const r = el.getBoundingClientRect();
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = r.left + (r.width/2) - (cw/2);
  let top  = r.bottom + pad;

  const p = placement || "bottom";
  if (p === "top") top = r.top - ch - pad;
  if (p === "left") { left = r.left - cw - pad; top = r.top + (r.height/2) - (ch/2); }
  if (p === "right"){ left = r.right + pad; top = r.top + (r.height/2) - (ch/2); }
  if (p === "bottom") { top = r.bottom + pad; }

  left = clamp(left, 12, vw - cw - 12);
  top  = clamp(top, 12, vh - ch - 12);
  return { left, top };
}

function setSpotRect(spot, el){
  const r = el.getBoundingClientRect();
  const pad = 6;
  spot.style.left = `${Math.max(0, r.left - pad)}px`;
  spot.style.top = `${Math.max(0, r.top - pad)}px`;
  spot.style.width = `${Math.max(10, r.width + pad*2)}px`;
  spot.style.height = `${Math.max(10, r.height + pad*2)}px`;
}

/* ================= Contextual Tips ================= */

function hasTip(key){
  try{ return localStorage.getItem(key) === "1"; }catch{ return false; }
}
function setTip(key){
  try{ localStorage.setItem(key, "1"); }catch{}
}

function createTipUI(){
  const tip = document.createElement("div");
  tip.className = "acumenTip";
  tip.innerHTML = `
    <div class="acumenTipHead">
      <div class="acumenTipMascot" aria-hidden="true">
        <span class="acumenTipMascotIcon">🐶</span>
        <span class="acumenTipMascotName">Pati</span>
      </div>
      <div class="acumenTipTitle"></div>
    </div>
    <div class="acumenTipBody"></div>
    <div class="acumenTipActions">
      <button type="button" class="acumenTipBtn">Anladım</button>
    </div>
  `;
  document.body.appendChild(tip);
  return tip;
}

function showTip({ anchorSelector, title, body, storageKey, placement="bottom" }){
  if (!anchorSelector) return;
  if (!storageKey || hasTip(storageKey)) return;
  if (isTourRunning()) return; // don't overlap
  const anchor = qs(anchorSelector);
  if (!anchor || !isVisible(anchor)) return;

  const tip = createTipUI();
  const titleEl = qs(".acumenTipTitle", tip);
  const bodyEl = qs(".acumenTipBody", tip);
  const btn = qs(".acumenTipBtn", tip);

  // mascot
  const mi = qs('.acumenTipMascotIcon', tip);
  if (mi) mi.textContent = getPatiIcon();

  titleEl.textContent = title || "İpucu";
  bodyEl.textContent = body || "";

  function place(){
    const r = anchor.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 10;

    let left = r.left + r.width/2 - tw/2;
    let top = r.bottom + pad;

    if (placement === "top") top = r.top - th - pad;
    if (placement === "left") { left = r.left - tw - pad; top = r.top + r.height/2 - th/2; }
    if (placement === "right"){ left = r.right + pad; top = r.top + r.height/2 - th/2; }

    left = clamp(left, 10, vw - tw - 10);
    top = clamp(top, 10, vh - th - 10);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  const onRelayout = () => requestAnimationFrame(place);
  const close = () => {
    setTip(storageKey);
    window.removeEventListener("resize", onRelayout, { passive:true });
    window.removeEventListener("scroll", onRelayout, true);
    tip.remove();
  };

  btn.addEventListener("click", close);
  tip.addEventListener("click", (e) => {
    if (e.target === tip) close();
  });

  window.addEventListener("resize", onRelayout, { passive:true });
  window.addEventListener("scroll", onRelayout, true);

  requestAnimationFrame(() => requestAnimationFrame(place));
}

/* ================= Public API ================= */

export function initOnboarding(){
  // Inject reopen button near theme toggle
  try{
    const themeBtn = qs("#btnThemeToggle");
    if (themeBtn && !qs("#btnTourHelp")){
      const b = document.createElement("button");
      b.id = "btnTourHelp";
      b.className = "theme-btn-icon tour-btn-icon";
      b.type = "button";
      b.title = "Tanıtım turunu tekrar göster";
      b.setAttribute("aria-label", "Tanıtım turunu tekrar göster");
      b.textContent = "❔";
      themeBtn.insertAdjacentElement("afterend", b);
      b.addEventListener("click", () => startTour({ force:true }));
    }
  }catch{}

  // Contextual tips (shown once, when user actually touches the feature)
  try{
    const notesBtn = qs('button[aria-controls="tab-notes"]');
    if (notesBtn){
      notesBtn.addEventListener("click", () => {
        showTip({
          anchorSelector: 'button[aria-controls="tab-notes"]',
          title: "Notlar = tekrar gücü",
          body: "Notlarını düzenli tut. Sonra “Practice üret” ile zayıf konularına odaklı deneme çıkarabilirsin.",
          storageKey: TIP_KEYS.notes,
          placement: "bottom"
        });
      }, { passive:true });
    }

    const aiBtn = qs("#btnAi, #btn-ai, #btnGemini, #btn-gemini");
    if (aiBtn){
      aiBtn.addEventListener("click", () => {
        showTip({
          anchorSelector: "#btnAi, #btn-ai, #btnGemini, #btn-gemini",
          title: "AI ile hızlan",
          body: "Analiz / cevap anahtarı üretimi gibi işler için AI butonlarını kullanabilirsin. Önce anahtarını eklemeyi unutma.",
          storageKey: TIP_KEYS.ai,
          placement: "bottom"
        });
      }, { passive:true });
    }

    const studioBtn = qs("#btn-open-studio");
    if (studioBtn){
      studioBtn.addEventListener("click", () => {
        showTip({
          anchorSelector: "#btn-open-studio",
          title: "Stüdyo = kaynak üretimi",
          body: "PDF/Docx kaynaklardan soru çıkarmak için stüdyo akışını kullan. Büyük dosyalarda en çok burada zaman kazanırsın.",
          storageKey: TIP_KEYS.studio,
          placement: "bottom"
        });
      }, { passive:true });
    }

    const driveTabBtn = qs('#tabbtn-drive');
    if (driveTabBtn){
      driveTabBtn.addEventListener('click', () => {
        showTip({
          anchorSelector: '#tabbtn-drive',
          title: 'Drive ile hızlı deneme',
          body: 'Drive’dan PDF seç → “Seçileni Aç” → Stüdyo’da soruları işaretle → şablonu kaydet. ACUMEN BAŞLAT’ı otomatik hazırlar.',
          storageKey: TIP_KEYS.drive,
          placement: 'bottom'
        });
      }, { passive:true });
    }

    // Premium: if user opens Studio from Drive PDF, guide them back to BAŞLAT when they return
    const driveOpenBtn = qs('#btnDriveOpen');
    if (driveOpenBtn){
      driveOpenBtn.addEventListener('click', () => {
        // Only set the flag if a PDF is likely selected (best-effort)
        setStudioReturnFlag('drive');
      }, { passive:true });
    }


    const feedBtn = qs("#patiWidget .btn-feed");
    if (feedBtn){
      feedBtn.addEventListener("click", () => {
        showTip({
          anchorSelector: "#patiWidget .btn-feed",
          title: "Pati acıkınca hatırlatır",
          body: "Çözdükçe mama kazanırsın. Pati’nin keyfi/enerjisi düşünce 🍖 ile besle. Bu mini sistem motivasyon için — seni disipline sokar 🙂",
          storageKey: TIP_KEYS.pati,
          placement: "left"
        });
      }, { passive:true });
    }

    const startBtn = qs("#btnStart");
    if (startBtn){
      startBtn.addEventListener("click", () => {
        // After starting, nav panel may appear; show tip once
        window.setTimeout(() => {
          const nav = qs("#navPanel");
          if (nav && isVisible(nav)){
            showTip({
              anchorSelector: "#navPanel",
              title: "Soru haritası açıldı",
              body: "Buradan hızlı atlama yapabilir ve işaret durumlarını tek bakışta görebilirsin.",
              storageKey: TIP_KEYS.nav,
              placement: "left"
            });
          }
        }, prefersReducedMotion() ? 50 : 350);
      }, { passive:true });
    }
  }catch{}

  // Premium: on return from Studio (new tab), show a one-time nudge if BAŞLAT is now ready
  try{
    const onReturnCheck = () => {
      if (isTourRunning()) return;
      const flag = popStudioReturnFlag();
      if (!flag) return;

      // Wait a beat: app may update template state after focus
      window.setTimeout(() => {
        const startBtn = qs('#btnStart');
        if (!startBtn) return;
        const ready = !startBtn.disabled;
        if (!ready) {
          // If not ready, put the flag back once (short window)
          try{ sessionStorage.setItem('ACUMEN_STUDIO_RETURN', JSON.stringify(flag)); }catch{}
          return;
        }

        showTip({
          anchorSelector: '#btnStart',
          title: 'Deneme hazır ✅',
          body: 'Stüdyo şablonunu kaydettin. Şimdi BAŞLAT ile denemeyi başlatabilirsin. (İstersen Soru Karıştır/Şık Karıştır ayarlarını da kontrol et.)',
          storageKey: 'ACUMEN_TIP_STUDIO_RETURN_V1',
          placement: 'top'
        });

        // Extra: pulse BAŞLAT briefly
        try{
          applyPulse(startBtn);
          window.setTimeout(() => clearPulse(startBtn), prefersReducedMotion() ? 600 : 1400);
        }catch{}
      }, prefersReducedMotion() ? 60 : 260);
    };

    window.addEventListener('focus', onReturnCheck);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') onReturnCheck();
    });
  }catch{}

  // Auto-start (first run only) — with retries to wait for render
  if (!hasDone()){
    startTourWhenReady();
  }
}

function startTourWhenReady(){
  if (isTourRunning()) return;

  const delay = prefersReducedMotion() ? 60 : 220;
  const maxAttempts = 18; // ~4s total
  let n = 0;

  const tick = () => {
    n++;
    if (hasDone() || isTourRunning()) return;

    // If a blocking modal is open, keep waiting (auto-start only)
    if (isAnyBlockingModalOpen()){
      if (n < maxAttempts) return window.setTimeout(tick, delay);
      return;
    }

    const started = startTour({ force:false, _internalAuto:true });
    if (!started && n < maxAttempts){
      window.setTimeout(tick, delay);
    }
  };

  window.setTimeout(tick, prefersReducedMotion() ? 30 : 180);
}

export function startTour({ force=false, _internalAuto=false } = {}){
  if (isTourRunning()) return true;
  if (!force && hasDone()) return false;

  // If a modal is open, skip auto start (but allow manual start)
  if (!force && _internalAuto){
    if (isAnyBlockingModalOpen()) return false;
  }

  let stepsAll = buildSteps();

  // Mode: full vs quick (stored)
  let mode = "full";
  try{ mode = localStorage.getItem(MODE_KEY) || "full"; }catch{}
  let steps = (mode === "quick") ? stepsAll.filter(s => s.quick !== false) : stepsAll;


  // If nothing is ready yet, let the caller retry
  if (!steps.length) return false;

  const ui = createTourUI();
  const spot = qs(".acumenTourSpot", ui);
  const card = qs(".acumenTourCard", ui);
  const titleEl = qs(".acumenTourTitle", ui);
  const bodyEl  = qs(".acumenTourBody", ui);
  const dotsEl  = qs(".acumenTourDots", ui);
  const btnPrev = qs('[data-act="prev"]', ui);
  const btnNext = qs('[data-act="next"]', ui);
  const btnSkip = qs('[data-act="skip"]', ui);
  const btnStepSkip = qs('[data-act="stepSkip"]', ui);
  const btnMode = qs('[data-act="mode"]', ui);
  const btnX    = qs(".acumenTourX", ui);
  const onceChk = qs(".acumenTourOnceChk", ui);
  const stepMetaEl = qs('.acumenTourStep', ui);

  // Mode button UI
  function getMode(){
    try{ return localStorage.getItem(MODE_KEY) || "full"; }catch{ return "full"; }
  }
  function setMode(m){
    try{ localStorage.setItem(MODE_KEY, m); }catch{}
  }
  function syncModeButton(){
    if (!btnMode) return;
    const m = getMode();
    // Button shows CURRENT mode (clearer UX)
    btnMode.textContent = (m === "quick") ? "Hızlı" : "Tam";
    btnMode.title = (m === "quick") ? "Hızlı tur (kısa) — tıkla: Tam tur" : "Tam tur (detay) — tıkla: Hızlı tur";
  }
  syncModeButton();

  // mascot
  const mascotIcon = qs('.acumenTourMascotIcon', ui);
  if (mascotIcon) mascotIcon.textContent = getPatiIcon();

  let idx = 0;
  let enteredIdx = -1;
  let raf = 0;
  let lastPulsed = null;

  function recalcStepsFromMode(){
    stepsAll = buildSteps();
    const m = getMode();
    steps = (m === "quick") ? stepsAll.filter(s => s.quick !== false) : stepsAll;
    if (!steps.length) steps = stepsAll;
    idx = clamp(idx, 0, Math.max(0, steps.length-1));
  }


  function shouldStoreDone(){
    try { return !!onceChk?.checked; } catch { return true; }
  }

  function cleanup(done=false){
    window.removeEventListener("resize", onRelayout, { passive:true });
    window.removeEventListener("scroll", onRelayout, true);
    document.removeEventListener("keydown", onKey, true);
    cancelAnimationFrame(raf);
    clearPulse(lastPulsed);
    ui.remove();
    if (done && shouldStoreDone()) storeDone();
  }

  function onKey(e){
    if (e.key === "Escape") { e.preventDefault(); cleanup(true); }
    if (e.key === "ArrowRight" || e.key === "Enter") { e.preventDefault(); next(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
  }

  function onRelayout(){
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => render());
  }

function renderDots(){
  // dots kaldırıldı (layout bozulmasın diye element duruyor)
  if (!dotsEl) return;
  dotsEl.innerHTML = "";
}

  function render(){
    const step = steps[idx];

    // Step counter
    if (stepMetaEl){
      stepMetaEl.textContent = `Adım ${idx+1}/${steps.length}`;
    }

    // Run step enter hook once
    if (idx !== enteredIdx){
      enteredIdx = idx;
      try{ step.onEnter?.(); }catch{}
    }

    let el = qs(step.selector);

    // Optionally wait for visibility (e.g., switching tabs)
    if (el && step.requireVisible && !isVisible(el)){
      if (step.waitForVisible){
        step.__waitCount = (step.__waitCount || 0) + 1;
        if (step.__waitCount <= 14){
          return window.setTimeout(render, prefersReducedMotion() ? 40 : 110);
        }
      }
      // Skip if not visible
      if (idx < steps.length-1) { idx++; return render(); }
      cleanup(true);
      return;
    }

    if (!el){
      if (idx < steps.length-1) { idx++; return render(); }
      cleanup(true);
      return;
    }

    safeScrollIntoView(el);

    // Pulse the most important control for this step (premium guidance)
    clearPulse(lastPulsed);
    lastPulsed = null;
    const pulseEl = step.pulseSelector ? qs(step.pulseSelector) : null;
    if (pulseEl && isVisible(pulseEl)){
      applyPulse(pulseEl);
      lastPulsed = pulseEl;
    }

    titleEl.textContent = step.title || "";
    bodyEl.textContent = step.body || "";

    renderDots();

    btnPrev.disabled = idx === 0;
    btnNext.textContent = (idx === steps.length-1) ? "Bitir" : "İleri";

    if (btnStepSkip){
      const can = !(step && step.allowSkip === false);
      btnStepSkip.style.display = can ? "" : "none";
    }

    setSpotRect(spot, el);

    const place = step.placement || "bottom";
    card.dataset.place = place;
    const { left, top } = positionFor(el, card, place);
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  }

  function next(){
    if (idx >= steps.length-1){
      cleanup(true);
      return;
    }
    idx++;
    render();
  }

  function prev(){
    if (idx <= 0) return;
    idx--;
    render();
  }

  function stepSkip(){
    const step = steps[idx];
    if (step && step.allowSkip === false) return;
    // behaves like next but without any special side effects
    if (idx >= steps.length-1){
      cleanup(true);
      return;
    }
    idx++;
    render();
  }

  function toggleMode(){
    const cur = getMode();
    const nextMode = (cur === "quick") ? "full" : "quick";
    setMode(nextMode);
    syncModeButton();
    // Recompute steps and restart from the closest matching selector
    const curSel = steps[idx]?.selector;
    recalcStepsFromMode();
    let newIdx = 0;
    if (curSel){
      const found = steps.findIndex(s => s.selector === curSel);
      if (found >= 0) newIdx = found;
    }
    idx = newIdx;
    render();
  }

  ui.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.matches(".acumenTourX")) return cleanup(true);
    const act = t.getAttribute("data-act");
    if (act === "next") return next();
    if (act === "prev") return prev();
    if (act === "skip") return cleanup(true);
    if (act === "stepSkip") return stepSkip();
    if (act === "mode") return toggleMode();
  });

  window.addEventListener("resize", onRelayout, { passive:true });
  window.addEventListener("scroll", onRelayout, true);
  document.addEventListener("keydown", onKey, true);

  requestAnimationFrame(() => requestAnimationFrame(render));
  return true;
}
