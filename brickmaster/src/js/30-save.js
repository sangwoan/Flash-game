// Progress lives in this browser only (localStorage). Every access is guarded:
// private windows and blocked storage must still give a playable game.
const SAVE_KEY = 'brickmaster.save.v1';
const freshSave = () => ({ gold: 0, bestTurn: 0, bestChapter: 0, bestScore: 0, runs: 0, meta: {}, stars: {}, unlocked: 0, layout: 2, champion: false, champSeasons: {}, settings: { sound: true, vibe: true } });
let SAVE = Object.assign(freshSave(), { layout: 0 });
function loadSave() {
  try {
    // inside the Expo app the native copy (window.__BM_SAVE) wins; it survives WebView storage resets
    let raw = typeof window.__BM_SAVE === 'string' && window.__BM_SAVE ? window.__BM_SAVE : null;
    if (!raw) { try { raw = localStorage.getItem(SAVE_KEY); } catch (e) {} }
    const s = JSON.parse(raw || 'null');
    if (s && typeof s === 'object') SAVE = Object.assign(SAVE, s, { meta: Object.assign({}, s.meta) });
    if (!SAVE.bestTurn) SAVE.bestTurn = +localStorage.getItem('brickrogue.best') || 0; // prototype record
  } catch (e) {}
  if (!SAVE.champSeasons || typeof SAVE.champSeasons !== 'object') SAVE.champSeasons = {};
  SAVE.unlocked = clamp(Math.floor(+SAVE.unlocked) || 0, 0, 999);
  if (!SAVE.stars || typeof SAVE.stars !== 'object') SAVE.stars = {};
  // v0.7 removed the armour upgrade (one life only): refund what was spent on it
  // v0.9: stages became 5-level stages; earlier progress maps onto the new levels by count
  if (SAVE.layout !== 2) { SAVE.layout = 2; SAVE.unlocked = Math.min(SAVE.unlocked, 4); SAVE.stars = {}; }
  if (SAVE.meta.hp > 0) {
    for (let l = 0; l < SAVE.meta.hp; l++) SAVE.gold += Math.round(120 * Math.pow(1.45, l) / 5) * 5;
    SAVE.refunded = true;
  }
  delete SAVE.meta.hp;
  for (const k of Object.keys(META)) SAVE.meta[k] = clamp(+SAVE.meta[k] || 0, 0, META[k].max);
  if (!SAVE.settings || typeof SAVE.settings !== 'object') SAVE.settings = { sound: true, vibe: true };
  muted = SAVE.settings.sound === false;
}
// Settings: wipe all progress (gold, upgrades, stars, stages). Sound/vibration and past ranking
// payouts are kept, so last week's prize is not paid twice.
function resetProgress() {
  SAVE = Object.assign(freshSave(), { settings: SAVE.settings, champSeasons: SAVE.champSeasons });
  for (const k of Object.keys(META)) SAVE.meta[k] = 0;
  writeSave();
}
function writeSave() {
  const json = JSON.stringify(SAVE);
  try { localStorage.setItem(SAVE_KEY, json); } catch (e) {}
  // inside the Expo app the save is also kept in native storage
  try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'save', data: json })); } catch (e) {}
}
