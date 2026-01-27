const LS_KEY = "sinav_v2_state_modular";

export function saveState(payload){
  localStorage.setItem(LS_KEY, JSON.stringify(payload));
}

export function loadState(){
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); }
  catch { return null; }
}

export function clearSaved(){
  localStorage.removeItem(LS_KEY);
}