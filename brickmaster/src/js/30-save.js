// Progress lives in this browser only (localStorage). Every access is guarded:
// private windows and blocked storage must still give a playable game.
const SAVE_KEY = 'brickmaster.save.v1';
let SAVE = { gold: 0, bestTurn: 0, bestChapter: 0, runs: 0, meta: {}, worlds: 1, theme: 'neon' };
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (s && typeof s === 'object') SAVE = Object.assign(SAVE, s, { meta: Object.assign({}, s.meta) });
    if (!SAVE.bestTurn) SAVE.bestTurn = +localStorage.getItem('brickrogue.best') || 0; // prototype record
  } catch (e) {}
  SAVE.worlds = clamp(Math.floor(+SAVE.worlds) || 1, 1, WORLD_ORDER.length);
  for (const k of Object.keys(META)) SAVE.meta[k] = clamp(+SAVE.meta[k] || 0, 0, META[k].max);
}
function writeSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
}
