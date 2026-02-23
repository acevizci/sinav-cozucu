// js/debug.js
// Quiet console by default. Enable debug via:
//   - URL: ?debug=1
//   - localStorage: acumen_debug=1
// Keeps console.error always visible.

const qs = (typeof location !== 'undefined') ? new URLSearchParams(location.search) : null;
const fromQuery = qs ? (qs.get('debug') === '1' || qs.get('debug') === 'true') : false;
let fromStorage = false;
try { fromStorage = localStorage.getItem('acumen_debug') === '1'; } catch (e) {}

export const ACUMEN_DEBUG = !!(fromQuery || fromStorage);

if (typeof window !== 'undefined') {
  window.ACUMEN_DEBUG = ACUMEN_DEBUG;
}

if (!ACUMEN_DEBUG && typeof console !== 'undefined') {
  // Preserve error
  const err = console.error ? console.error.bind(console) : () => {};
  console.log = () => {};
  console.info = () => {};
  console.debug = () => {};
  console.warn = () => {};
  console.error = err;
}
