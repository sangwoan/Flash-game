// Screen fit, input, buttons and the main loop.
let scale = 1, dpr = 1;
function resize() {
  scale = Math.min(wrap.clientWidth / W, wrap.clientHeight / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  stage.style.width = W * scale + 'px'; stage.style.height = H * scale + 'px';
  stage.style.setProperty('--s', scale);
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
}
addEventListener('resize', resize);
resize();

// Aim by pointing where the shot should go; drag below the launcher line to cancel.
function toLocal(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale }; }
function setAim(e) {
  const p = toLocal(e);
  if (p.y > LY - 8) { S.aimOk = false; return; }
  let dx = p.x - S.launchX, dy = p.y - LY;
  const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
  const minDy = -0.14;
  if (dy > minDy) { dy = minDy; dx = Math.sign(dx || 1) * Math.sqrt(1 - dy * dy); }
  S.aim = { x: dx, y: dy }; S.aimOk = true;
}
cv.addEventListener('pointerdown', e => {
  ensureAudio();
  if (S.phase !== 'aim') return;
  S.aiming = true;
  try { cv.setPointerCapture(e.pointerId); } catch (err) {}
  setAim(e);
});
cv.addEventListener('pointermove', e => { if (S.aiming) setAim(e); });
cv.addEventListener('pointerup', () => { if (S.aiming) { S.aiming = false; if (S.aimOk && S.phase === 'aim') fire(); } });
cv.addEventListener('pointercancel', () => { S.aiming = false; });

pauseBtn.onclick = pauseGame;
$('resume').onclick = resumeGame;
$('restart').onclick = restartRun;
$('pauseHome').onclick = quitToHome;
$('overHome').onclick = goHome;
$('titleSettings').onclick = openSettings;
$('settingsClose').onclick = () => { $('settings').hidden = true; };
$('resetSave').onclick = askReset;
$('confirmYes').onclick = () => closeConfirm(true);
$('confirmNo').onclick = () => closeConfirm(false);
for (const el of document.querySelectorAll('.optSound')) el.onclick = () => toggleOption('sound');
for (const el of document.querySelectorAll('.optVibe')) el.onclick = () => toggleOption('vibe');
// Android back button (from the Expo app): close the top-most thing, pause a run, leave from home.
window.__bmPause = pauseGame;
window.__bmBack = () => {
  if (!$('confirm').hidden) return closeConfirm(false);
  for (const id of ['settings', 'shop', 'map', 'rank']) if (!$(id).hidden) {
    if (id === 'settings') $('settings').hidden = true; else if (id === 'shop') closeShop(); else if (id === 'map') closeMap(); else closeRank();
    return;
  }
  if (S.phase === 'paused') return resumeGame();
  if (canPause()) return pauseGame();
  if (!overEl.hidden && $('claimRow').hidden) return goHome();
  if (!titleEl.hidden && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'exit' }));
};
// leaving the app (home button, call, tab switch) pauses a run; Escape pauses and resumes
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('confirm').hidden) closeConfirm(false);
  else if (S.phase === 'paused') resumeGame();
  else pauseGame();
});
recallEl.onclick = recall;
$('start').onclick = () => startLevel(nextLevelIndex());
$('again').onclick = againOrNext;
$('endless').onclick = startEndless;
$('titleMap').onclick = () => openMap(titleEl);
$('overMap').onclick = () => openMap(overEl);
$('mapClose').onclick = closeMap;
$('mapPlay').onclick = () => startLevel(mapSel);
$('titleRank').onclick = () => openRank(titleEl);
$('overRank').onclick = () => openRank(overEl);
$('rankClose').onclick = closeRank;
$('titleShop').onclick = () => openShop(titleEl);
$('overShop').onclick = () => openShop(overEl);
$('shopClose').onclick = closeShop;
$('shieldTake').onclick = takeShield; // ad placeholder: a rewarded ad would play here
$('shieldSkip').onclick = hideShieldOffer;
$('claim').onclick = () => claim(1);
$('claim2x').onclick = () => claim(2); // ad placeholder

// ---------- boot ----------
loadSave();
STG = levelInfo(nextLevelIndex());
applyTheme(STG.land);
newRun(); S.phase = 'title'; S.bricks = []; rebuildGrid();
buildFloaters();
refreshTitle();
rankInit();
// #land-7 previews landscape 7 on the title screen (for browsing the places)
function previewFromHash() { const m = location.hash.match(/^#land-(\d+)$/); if (m && S.phase === 'title') applyTheme(+m[1]); }
addEventListener('hashchange', previewFromHash);
previewFromHash();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  update(dt); draw(now);
  const showPause = canPause(); // the pause button only shows while a run can be paused
  if (pauseBtn.hidden === showPause) pauseBtn.hidden = !showPause;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Debug and balance-simulation hook (used by the headless balance bot).
window.__bm = {
  get state() { return S; },
  get save() { return SAVE; },
  BAL,
  tick(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); },
  shoot(angle) { if (S.phase !== 'aim') return; S.aim = { x: Math.cos(angle), y: Math.sin(angle) }; fire(); },
  pick(i) { if (S.phase === 'levelup' && curChoices[i]) choose(curChoices[i]); },
  give(k) { S.lv[k]++; UPG[k].apply(); }, // balance benches: add a card without a level-up
  UPG,
  newRun(meta, stage) { if (meta) Object.assign(SAVE.meta, meta); STG = stage === undefined ? STG : stage < 0 ? endlessInfo() : levelInfo(stage); newRun(); if (S.pendingLevels > 0) showLevel(); },
  theme(id) { applyTheme(id); },
  levelInfo, landOf, LANDS, META, metaCost, clearBonus,
  // render landscape s (with its animated parts) to an image, for galleries
  landShot(s, w = 210, now = 4000) {
    const c = document.createElement('canvas'); c.width = w * 2; c.height = Math.round(w * H / W) * 2;
    const g = c.getContext('2d'); g.scale(c.width / W, c.height / H);
    const L = landOf(s); g.fillStyle = '#04050a'; g.fillRect(0, 0, W, H); neonStatic(g, L.R, L.pal); neonAnim(g, L.R, L.pal, now, 1);
    return c.toDataURL('image/jpeg', 0.85);
  },
  word(i) { bigWords.push({ s: TH.words[i], life: 0.85, max: 1.1, y: H * 0.3, size: 16 + i * 2 }); },
  draw(now = performance.now()) { draw(now); },
};
