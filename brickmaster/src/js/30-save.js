// Progress lives in this browser only (localStorage). Every access is guarded:
// private windows and blocked storage must still give a playable game.
const SAVE_KEY = 'brickmaster.save.v1';
let SAVE = { gold: 0, bestTurn: 0, bestChapter: 0, runs: 0, meta: {}, worlds: 1, theme: 'neon', stars: {}, unlocked: 0 };
function loadSave() {
  try {
    // inside the Expo app the native copy (window.__BM_SAVE) wins; it survives WebView storage resets
    let raw = typeof window.__BM_SAVE === 'string' && window.__BM_SAVE ? window.__BM_SAVE : null;
    if (!raw) { try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {} }
    const s = JSON.parse(raw || 'null');
    if (s && typeof s === 'object') SAVE = Object.assign(SAVE, s, { meta: Object.assign({}, s.meta) });
    if (!SAVE.bestTurn) SAVE.bestTurn = +localStorage.getItem('brickrogue.best') || 0; // prototype record
  } catch (e) {}
  SAVE.worlds = clamp(Math.floor(+SAVE.worlds) || 1, 1, WORLD_ORDER.length);
  SAVE.unlocked = clamp(Math.floor(+SAVE.unlocked) || 0, 0, 999);
  if (!SAVE.stars || typeof SAVE.stars !== 'object') SAVE.stars = {};
  for (const k of Object.keys(META)) SAVE.meta[k] = clamp(+SAVE.meta[k] || 0, 0, META[k].max);
}
function writeSave() {
  const json = JSON.stringify(SAVE);
  try { localStorage.setItem(SAVE_KEY, json); } catch (e) {}
  // inside the Expo app the save is also kept in native storage
  try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'save', data: json })); } catch (e) {}
}
