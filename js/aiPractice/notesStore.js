// js/aiPractice/notesStore.js
// Local-only notes storage for AI Practice. (No dependencies on ACUMEN core)

const LS_KEY = "ACUMEN_NOTES_V1";

function _now() { return Date.now(); }

function _uid(){
  // short uid, stable enough for local storage
  return "n_" + Math.random().toString(16).slice(2) + "_" + _now().toString(16);
}

function _safeParse(raw){
  try { return JSON.parse(raw); } catch { return null; }
}

function _load(){
  const raw = localStorage.getItem(LS_KEY);
  const data = _safeParse(raw);
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  return [];
}

function _save(items){
  try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch {}
}

function _cleanTitle(t){
  const s = String(t ?? "").trim();
  return s || "Ders Notu";
}

function _cleanText(t){
  return String(t ?? "").replace(/\r\n/g, "\n").trim();
}

/** ✅ EXPORT: listNotes() */
export function listNotes(){
  const items = _load();
  // newest first
  items.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0));
  return items;
}

/** ✅ EXPORT: upsertNote({title,text,source,sourceRef}) */
export function upsertNote({ id=null, title="", text="", source="local", sourceRef=null } = {}){
  const items = _load();
  const clean = {
    id: id || _uid(),
    title: _cleanTitle(title),
    text: _cleanText(text),
    source: String(source || "local"),
    sourceRef: sourceRef || null, // e.g. drive file id
    createdAt: _now(),
    updatedAt: _now(),
  };

  const idx = items.findIndex(x => x.id === clean.id);
  if (idx >= 0){
    const prev = items[idx] || {};
    items[idx] = {
      ...prev,
      ...clean,
      createdAt: prev.createdAt || clean.createdAt,
      updatedAt: _now(),
    };
  } else {
    items.push(clean);
  }

  _save(items);
  return clean;
}

/** ✅ EXPORT: removeNote(id) */
export function removeNote(id){
  const items = _load();
  const next = items.filter(x => x.id !== id);
  _save(next);
}

/** ✅ EXPORT: renameNote(id, newTitle) */
export function renameNote(id, newTitle){
  const items = _load();
  const idx = items.findIndex(x => x.id === id);
  if (idx < 0) return;
  items[idx].title = _cleanTitle(newTitle);
  items[idx].updatedAt = _now();
  _save(items);
}

/** ✅ EXPORT: getNoteById(id) (opsiyonel ama işine yarar) */
export function getNoteById(id){
  return _load().find(x => x.id === id) || null;
}

/** ✅ EXPORT: makeSelectionHash(ids[]) */
export function makeSelectionHash(ids = []){
  const arr = Array.from(ids || []).map(String).sort();
  // small stable hash string (not crypto)
  let h = 2166136261;
  for (const s of arr){
    for (let i=0;i<s.length;i++){
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return "sel_" + (h >>> 0).toString(16);
}

/** (opsiyonel) dev/test: clear all notes */
export function clearAllNotes(){
  try { localStorage.removeItem(LS_KEY); } catch {}
}
