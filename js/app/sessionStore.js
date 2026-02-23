// js/app/sessionStore.js
// Lightweight session history store for ACUMEN.
// Stores completed sessions (exam / generated_practice) in localStorage.

const KEY = "acumen_sessions_v1";
const MAX_SESSIONS = 200;

function safeParse(raw){
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function safeStringify(obj){
  try { return JSON.stringify(obj); } catch { return null; }
}

function load(){
  const raw = localStorage.getItem(KEY);
  const data = safeParse(raw);
  if (!data || typeof data !== "object") return { v: 1, sessions: [] };
  if (!Array.isArray(data.sessions)) data.sessions = [];
  if (!data.v) data.v = 1;
  return data;
}

function save(db){
  const raw = safeStringify(db);
  if (raw) localStorage.setItem(KEY, raw);
}

function nowIso(){ return new Date().toISOString(); }

export function addSession(session){
  if (!session || typeof session !== "object") return null;
  const db = load();
  const s = { ...session };
  if (!s.id) s.id = `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  if (!s.createdAt) s.createdAt = nowIso();
  db.sessions.unshift(s);
  if (db.sessions.length > MAX_SESSIONS) db.sessions = db.sessions.slice(0, MAX_SESSIONS);
  save(db);
  return s;
}

export function listSessions({ type = null, parentExamId = null, limit = 50 } = {}){
  const db = load();
  let arr = db.sessions.slice();
  if (type) arr = arr.filter(s => s?.type === type);
  if (parentExamId) arr = arr.filter(s => String(s?.parentExamId || "") === String(parentExamId));
  return arr.slice(0, Math.max(1, Number(limit) || 50));
}

export function getSession(id){
  if (!id) return null;
  const db = load();
  return (db.sessions || []).find(s => String(s?.id) === String(id)) || null;
}


export function updateSession(id, patch){
  if (!id) return null;
  const db = load();
  const idx = (db.sessions || []).findIndex(s => String(s?.id) === String(id));
  if (idx === -1) {
    // if not found, add as new session
    const base = (patch && typeof patch === "object") ? { ...patch, id } : { id };
    return addSession(base);
  }
  const cur = db.sessions[idx] || {};
  const next = (patch && typeof patch === "object") ? { ...cur, ...patch, id } : { ...cur, id };
  db.sessions[idx] = next;
  save(db);
  return next;
}

export function deleteSession(id){
  if (!id) return false;
  const db = load();
  const before = db.sessions.length;
  db.sessions = (db.sessions || []).filter(s => String(s?.id) !== String(id));
  if (db.sessions.length !== before) {
    save(db);
    return true;
  }
  return false;
}

// Optional debug hook
try {
  if (typeof window !== "undefined") {
    window.__ACUMEN_SESSION_STORE__ = { addSession, updateSession, listSessions, getSession, deleteSession };
  }
} catch {}
