// js/storage.js
// QUOTA FIX + LITE FALLBACK + MINIMAL VERSIONING

const LS_KEY = "sinav_v2_state_modular";
const SCHEMA_VERSION = 2;

function safeParse(raw){
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeStringify(obj){
  try { return JSON.stringify(obj); } catch { return null; }
}

// parsed.questions içindeki image alanını ayıkla (mevcut yaklaşım)
function stripQuestionImages(parsed){
  if (!parsed || !Array.isArray(parsed.questions)) return parsed;
  return {
    ...parsed,
    questions: parsed.questions.map(q => {
      if (!q || typeof q !== "object") return q;
      const { image, ...textOnlyQ } = q;
      return textOnlyQ;
    })
  };
}

// Quota patlarsa daha da küçült: questions'ı komple çıkar
function ultraLiteParsed(parsed){
  if (!parsed || typeof parsed !== "object") return parsed;
  return {
    title: parsed.title,
    meta: parsed.meta || {},
    keyCount: parsed.keyCount || 0,
    answerKey: parsed.answerKey || {}
  };
}

export function saveState(payload){
  try {
    if (!payload || typeof payload !== "object") return;

    // Shallow copy: amacımız RAM'deki objeyi bozmayıp "temizlenmiş" versiyonu yazmak
    const stateToSave = { ...payload, v: SCHEMA_VERSION };

    // 1) parsed varsa sorulardaki image alanını ayıkla
    if (stateToSave.parsed) {
      stateToSave.parsed = stripQuestionImages(stateToSave.parsed);
    }

    // 2) Root'ta images varsa sil
    if (stateToSave.images) delete stateToSave.images;

    const json = safeStringify(stateToSave);
    if (!json) return;

    localStorage.setItem(LS_KEY, json);

  } catch (e) {
    // ✅ Quota/serializasyon hatasında ULTRA-LITE fallback dene
    try {
      if (!payload || typeof payload !== "object") return;

      const fallback = { ...payload, v: SCHEMA_VERSION };

      if (fallback.parsed) fallback.parsed = ultraLiteParsed(fallback.parsed);
      if (fallback.images) delete fallback.images;

      // rawText devasa olabiliyor — kırp
      if (typeof fallback.rawText === "string" && fallback.rawText.length > 20000) {
        fallback.rawText = fallback.rawText.slice(0, 20000);
      }

      const json2 = safeStringify(fallback);
      if (!json2) return;

      // Önce eskiyi sil, sonra yaz
      try { localStorage.removeItem(LS_KEY); } catch {}
      localStorage.setItem(LS_KEY, json2);

    } catch (e2) {
      // Hâlâ olmuyorsa sessiz kal; sınav akışı bozulmasın
      console.warn("⚠️ State kaydedilemedi (Storage dolu):", e2);
    }
  }
}

export function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  const st = safeParse(raw);
  if (!st) return null;

  // Minimal normalize/migration
  const v = Number(st.v || 1);

  // v1 kayıtlarında v yoktu
  if (v === 1) st.v = SCHEMA_VERSION;

  // answersArr beklenen tip değilse düzelt
  if (st.answersArr && !Array.isArray(st.answersArr)) st.answersArr = [];

  return st;
}

export function clearSaved(){
  try { localStorage.removeItem(LS_KEY); } catch {}
}
