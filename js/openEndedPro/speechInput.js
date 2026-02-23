// js/openEndedPro/speechInput.js
// Web Speech API ile textarea'ya sesli yazma (feature-detect + graceful fallback)
//
// Kullanım:
//   import { attachSpeechToTextarea } from "./speechInput.js";
//   attachSpeechToTextarea(textarea, { lang: "tr-TR" });
//
// Notlar:
// - Chrome/Edge genelde destekler. Safari/Firefox sınırlı olabilir.
// - start() çağrısı bazen "already started" atabilir, yakalanır.
// - UI donmaması için ağır iş yok; sadece event tabanlı.


// Basit Türkçe noktalama/komut normalizasyonu
// Örn: "nokta", "virgül", "soru işareti", "yeni satır", "parantez aç/kapa"
function normalizeSpeechText(input) {
  let s = (input || "").trim();
  if (!s) return s;

  // Çok kelimeli komutlar önce
  const map = [
    [/\b(noktalı\s+virgül)\b/gi, ";"],
    [/\b(iki\s+nokta)\b/gi, ":"],
    [/\b(üç\s+nokta)\b/gi, "..."],
    [/\b(soru\s+işareti)\b/gi, "?"],
    [/\b(ünlem\s+işareti)\b/gi, "!"],
    [/\b(yeni\s+satır)\b/gi, "\n"],
    [/\b(parantez\s+aç)\b/gi, "("],
    [/\b(parantez\s+kapa|parantez\s+kapat)\b/gi, ")"],
    [/\b(tırnak\s+aç)\b/gi, '"'],
    [/\b(tırnak\s+kapa|tırnak\s+kapat)\b/gi, '"'],
    [/\b(virgül)\b/gi, ","],
    [/\b(nokta)\b/gi, "."],
  ];

  for (const [rx, rep] of map) s = s.replace(rx, rep);

  // Boşluk temizliği: noktalama öncesi boşlukları sil
  s = s.replace(/\s+([,.;:!?])/g, "$1");
  // Noktalama sonrası boşluk ekle (satır sonu/boşluk hariç)
  s = s.replace(/([,;:!?])(?!\s|\n)/g, "$1 ");
  // Nokta sonrası boşluk (ellipsis "..." korunur)
  const ELL = "__ACUMEN_ELLIPSIS__";
  s = s.replace(/\.\.\./g, ELL);
  s = s.replace(/\.(?!\s|\n)/g, ". ");
  s = s.replace(new RegExp(ELL, "g"), "...");

  // Parantez boşlukları
  s = s.replace(/\(\s+/g, "(");
  s = s.replace(/\s+\)/g, ")");

  // Çoklu boşluk
  s = s.replace(/[ \t]{2,}/g, " ");

  return s.trim();
}

function insertAtCursor(textarea, chunk){
  const text = String(chunk || "");
  if (!text) return;

  const start = (typeof textarea.selectionStart === "number") ? textarea.selectionStart : (textarea.value || "").length;
  const end   = (typeof textarea.selectionEnd === "number") ? textarea.selectionEnd : start;

  const val = textarea.value || "";
  const before = val.slice(0, start);
  const after  = val.slice(end);

  // Akıllı boşluk: önceki karakter boşluk değilse ve chunk newline/punct ile başlamıyorsa araya boşluk koy
  const needsSpace = before && !/\s$/.test(before) && !/^[\n,.;:!?)]/.test(text);
  const prefix = needsSpace ? " " : "";

  const nextVal = before + prefix + text + after;
  const nextPos = before.length + prefix.length + text.length;

  textarea.value = nextVal;
  try{
    textarea.selectionStart = textarea.selectionEnd = nextPos;
  }catch(_){ }

  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

export function attachSpeechToTextarea(textarea, { lang = "tr-TR" } = {}) {
  try {
    if (!textarea || textarea.dataset?.oeMicAttached === "1") return;
    textarea.dataset.oeMicAttached = "1";

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // Parent yoksa sonra denensin (UI injector bazen order değiştiriyor)
    if (!textarea.parentNode) return;

    // textarea'yı saran container
    const wrap = document.createElement("div");
    wrap.className = "oeproTAWrap";

    // textarea'yı wrap içine taşı
    const parent = textarea.parentNode;
    parent.insertBefore(wrap, textarea);
    wrap.appendChild(textarea);

    // mic button
    const micBtn = document.createElement("button");
    micBtn.type = "button";
    micBtn.className = "oeproMicBtn";
    micBtn.innerHTML = `
      <span class="oeproMicIc oeproMicIc--mic" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="oeproMicSvg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
          <path d="M19 11a7 7 0 0 1-14 0" />
          <path d="M12 18v3" />
        </svg>
      </span>
      <span class="oeproMicIc oeproMicIc--stop" aria-hidden="true">
        <svg viewBox="0 0 24 24" class="oeproMicSvg" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="7" y="7" width="10" height="10" rx="2" />
        </svg>
      </span>
    `;
    micBtn.title = SpeechRecognition ? "Sesli yaz (TR)" : "Sesli yazma desteklenmiyor";
    wrap.appendChild(micBtn);

    if (!SpeechRecognition) {
      micBtn.disabled = true;
      micBtn.classList.add("is-disabled");
      return;
    }

    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;

    let listening = false;
    let stopTimer = null;
    let lastResultAt = 0;

    const setListeningUI = (on) => {
      listening = on;
      micBtn.classList.toggle("is-listening", on);
      micBtn.title = on ? "Durdur" : "Sesli yaz (TR)";
      wrap.classList.toggle("is-listening", on);
    };

    const scheduleAutoStop = () => {
      clearTimeout(stopTimer);
      stopTimer = setTimeout(() => {
        // 3.2sn sessizlikte otomatik durdur
        if (listening && Date.now() - lastResultAt > 3000) {
          try { rec.stop(); } catch(_) {}
        }
      }, 3200);
    };

    rec.onresult = (e) => {
      lastResultAt = Date.now();
      scheduleAutoStop();

      let finalChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = (e.results[i][0]?.transcript || "");
        if (e.results[i].isFinal) finalChunk += t;
      }

      if (finalChunk.trim()) {
        const chunk = normalizeSpeechText(finalChunk);
        if (!chunk) return;
        insertAtCursor(textarea, chunk);
      }
    };

    rec.onerror = () => {
      setListeningUI(false);
      clearTimeout(stopTimer);
    };

    rec.onend = () => {
      setListeningUI(false);
      clearTimeout(stopTimer);
    };

    micBtn.addEventListener("click", () => {
      if (listening) {
        try { rec.stop(); } catch(_) {}
        setListeningUI(false);
        clearTimeout(stopTimer);
        return;
      }
      try {
        lastResultAt = Date.now();
        setListeningUI(true);
        scheduleAutoStop();
        rec.start();
      } catch (err) {
        // already started vb.
        setListeningUI(false);
        clearTimeout(stopTimer);
      }
    });

  } catch(_) {
    // sessizce geç
  }
}
