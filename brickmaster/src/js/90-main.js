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

sndEl.onclick = () => { muted = !muted; sndEl.textContent = muted ? 'SND OFF' : 'SND ON'; ensureAudio(); };
recallEl.onclick = recall;
$('start').onclick = () => startStage(nextStageIndex());
$('again').onclick = againOrNext;
$('endless').onclick = startEndless;
$('titleMap').onclick = () => openMap(titleEl);
$('overMap').onclick = () => openMap(overEl);
$('mapClose').onclick = closeMap;
$('mapPlay').onclick = () => startStage(mapSel);
$('titleShop').onclick = () => openShop(titleEl);
$('overShop').onclick = () => openShop(overEl);
$('shopClose').onclick = closeShop;
$('reviveBtn').onclick = revive;   // ad placeholder: a rewarded ad would play here
$('giveUp').onclick = () => showResults(false);
$('claim').onclick = () => claim(1);
$('claim2x').onclick = () => claim(2); // ad placeholder

// ---------- boot ----------
loadSave();
STG = STAGES[nextStageIndex()];
applyTheme(STG.world);
newRun(); S.phase = 'title';
refreshTitle();
// A link ending in #synth, #candy, ... previews that world's look on the title screen.
function previewFromHash() { const id = location.hash.slice(1); if (THEMES[id] && S.phase === 'title') applyTheme(id); }
addEventListener('hashchange', previewFromHash);
previewFromHash();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  update(dt); draw(now);
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
  newRun(meta, stage) { if (meta) Object.assign(SAVE.meta, meta); STG = stage === undefined ? STG : stage < 0 ? ENDLESS : STAGES[stage]; newRun(); if (S.pendingLevels > 0) showLevel(); },
  theme(id) { applyTheme(id); },
  STAGES,
  word(i) { bigWords.push({ s: TH.words[i], life: 0.85, max: 1.1, y: H * 0.3, size: 16 + i * 2 }); },
  draw(now = performance.now()) { draw(now); },
};
