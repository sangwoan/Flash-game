// Turn flow, overlays (level-up, revive, results, workshop) and the per-frame update.
let curChoices = [];

function fire() {
  S.phase = 'fire'; S.toFire = S.balls; S.fireTimer = 0; S.turnTime = 0; S.timeScale = 1;
  S.combo = 0; S.nextLaunchX = null; S.aiming = false;
}
function recall() {
  if (S.phase !== 'fire') return;
  for (const b of S.movers) b.alive = false;
  S.movers = [];
  if (S.nextLaunchX === null) S.nextLaunchX = S.launchX;
  S.toFire = 0;
}

function comboWord(c) { return c >= 40 ? 'INSANE' : c >= 25 ? 'AMAZING' : c >= 15 ? 'GREAT' : 'NICE'; }
function endTurn() {
  recallEl.hidden = true;
  if (S.combo >= 8) texts.push(mkText(W / 2, 420, comboWord(S.combo) + ' x' + S.combo, '#3ee6ff', 1.2, 16));
  S.launchX = S.nextLaunchX ?? S.launchX; S.nextLaunchX = null;
  if (S.orbsGot) { S.balls += S.orbsGot; S.orbsGot = 0; }
  S.bricks = S.bricks.filter(b => !b.dead);
  shiftDown(true);
  let hurt = 0;
  for (const br of S.bricks) {
    if (br.r < ROWS) continue;
    br.dead = true;
    if (isItem(br)) continue;
    hurt += br.type === 'boss' ? 2 : 1;
    burst(br.X + br.Wd / 2, FB - 10, '#ff4f7b', 16, 260);
  }
  if (hurt) {
    S.hp -= hurt; shake(12); S.flash = 0.55; S.flashCol = '255,79,123'; sfx.hurt(); buzz(120);
    texts.push(mkText(W / 2, FB - 40, 'HP -' + hurt, '#ff4f7b', 1.1, 16));
  }
  S.bricks = S.bricks.filter(b => !b.dead);
  rebuildGrid();
  S.turn++;
  addGold(BAL.goldPerTurn);
  if (S.turn % BAL.bossEvery === 1) {
    const ch = chapterOf(S.turn);
    showBanner(`CHAPTER ${ch}`, themeOf(ch).name, '#3ee6ff');
  }
  spawnRow(S.turn, true);
  S.combo = 0; S.timeScale = 1;
  if (S.hp <= 0) { S.hp = 0; S.phase = 'dying'; S.dieTimer = 0.9; sfx.over(); return; }
  if (S.pendingLevels > 0) showLevel(); else S.phase = 'aim';
}

// ---------- level-up ----------
function pickUpgrades(n) {
  const pool = Object.keys(UPG).filter(k => S.lv[k] < UPG[k].max)
    .map(k => ({ k, w: k === 'heal' ? (S.hp < S.maxHp ? 2.5 : 0.8) : UPG[k].w }));
  const out = [];
  while (out.length < n && pool.length) {
    let x = rnd() * pool.reduce((a, p) => a + p.w, 0), i = 0;
    while (x > pool[i].w) { x -= pool[i].w; i++; }
    out.push(pool.splice(i, 1)[0].k);
  }
  return out;
}
function showLevel() {
  S.phase = 'levelup';
  curChoices = pickUpgrades(3);
  cardsEl.innerHTML = '';
  $('lvlLeft').textContent = S.pendingLevels > 1 ? `남은 선택 ${S.pendingLevels}` : `LV ${S.level}`;
  for (const k of curChoices) {
    const u = UPG[k], l = S.lv[k];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.style.setProperty('--c', u.col);
    b.innerHTML = `<span class="tag">${u.tag}</span><span class="ct"><span class="cn">${u.name}<span class="cl">LV ${l} &gt; ${l + 1}</span></span><span class="cd">${u.desc(l + 1)}</span></span>`;
    b.onclick = () => { if (!lvlEl.classList.contains('locked')) choose(k); };
    cardsEl.appendChild(b);
  }
  lvlEl.hidden = false;
  lvlEl.classList.add('locked');
  setTimeout(() => lvlEl.classList.remove('locked'), 350);
}
function choose(k) {
  S.lv[k]++; UPG[k].apply(); S.pendingLevels--; sfx.pick();
  if (S.pendingLevels > 0) showLevel(); else { lvlEl.hidden = true; S.phase = 'aim'; }
}

// ---------- death, revive, results ----------
function showRevive() { S.phase = 'revive'; reviveEl.hidden = false; }
function revive() {
  reviveEl.hidden = true; S.revived = true;
  for (const br of S.bricks) {
    if (br.dead || br.r < ROWS - 5) continue;
    br.dead = true;
    if (!isItem(br)) burst(br.X + br.Wd / 2, br.Y + br.Ht / 2, brickColor(br), 10, 260);
  }
  S.bricks = S.bricks.filter(b => !b.dead); rebuildGrid();
  S.hp = Math.max(1, Math.ceil(S.maxHp / 2));
  shake(10); S.flash = 0.6; S.flashCol = '62,230,255'; sfx.clear();
  showBanner('REVIVE', '다시 한 번!', '#3ee6ff');
  if (S.pendingLevels > 0) showLevel(); else S.phase = 'aim';
}
let runGold = 0;
function showResults() {
  reviveEl.hidden = true;
  S.phase = 'over';
  const reached = S.turn - 1, ch = chapterOf(Math.max(1, reached));
  const newBest = reached > SAVE.bestTurn;
  SAVE.bestTurn = Math.max(SAVE.bestTurn, reached);
  SAVE.bestChapter = Math.max(SAVE.bestChapter, ch);
  SAVE.runs++; writeSave();
  runGold = Math.floor(S.gold * (1 + 0.15 * SAVE.meta.gold));
  $('stats').innerHTML = [
    ['버틴 턴', reached + (newBest ? ' NEW' : '')], ['도달 챕터', ch], ['최고 기록', SAVE.bestTurn + '턴'],
    ['레벨', S.level], ['부순 벽돌', S.kills], ['최대 콤보', S.maxCombo],
  ].map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  $('build').innerHTML = Object.keys(UPG).filter(k => S.lv[k]).map(k => `<span style="--c:${UPG[k].col}">${UPG[k].tag} ${S.lv[k]}</span>`).join('');
  $('earned').textContent = `골드 +${runGold}`;
  $('claimRow').hidden = false; $('afterRow').hidden = true;
  overEl.hidden = false;
}
function claim(mult) {
  const got = runGold * mult;
  SAVE.gold += got; writeSave(); sfx.coin();
  $('earned').textContent = `골드 +${got} 받음 · 보유 ${SAVE.gold}G`;
  $('claimRow').hidden = true; $('afterRow').hidden = false;
}

// ---------- workshop ----------
let shopReturn = null;
function openShop(from) {
  shopReturn = from; from.hidden = true;
  renderShop(); shopEl.hidden = false;
}
function renderShop() {
  $('shopGold').textContent = `보유 골드 ${SAVE.gold}G`;
  const list = $('metaList'); list.innerHTML = '';
  for (const k of Object.keys(META)) {
    const m = META[k], l = SAVE.meta[k], maxed = l >= m.max, cost = metaCost(k, l);
    const row = document.createElement('div'); row.className = 'meta';
    const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('');
    row.innerHTML = `<div><div class="mn">${m.name}</div><div class="md">${m.desc}</div><div class="pips">${pips}</div></div>`;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'buy';
    btn.textContent = maxed ? 'MAX' : cost + 'G';
    btn.disabled = maxed || SAVE.gold < cost;
    btn.onclick = () => buyMeta(k);
    row.appendChild(btn); list.appendChild(row);
  }
}
function buyMeta(k) {
  const l = SAVE.meta[k], cost = metaCost(k, l);
  if (l >= META[k].max || SAVE.gold < cost) return;
  SAVE.gold -= cost; SAVE.meta[k]++; writeSave(); sfx.coin(); renderShop();
}
function closeShop() {
  shopEl.hidden = true;
  if (shopReturn) shopReturn.hidden = false;
  refreshTitle();
}
function refreshTitle() {
  $('titleGold').textContent = `보유 골드 ${SAVE.gold}G`;
  $('best').textContent = SAVE.bestTurn ? `BEST TURN ${SAVE.bestTurn} · CHAPTER ${SAVE.bestChapter || chapterOf(SAVE.bestTurn)}` : '';
}
function startRun() {
  ensureAudio();
  titleEl.hidden = true; overEl.hidden = true;
  newRun();
  showBanner('CHAPTER 1', themeOf(1).name, '#3ee6ff');
  if (S.pendingLevels > 0) showLevel();
}

// ---------- per-frame update ----------
function update(dt) {
  if (S.hitstop > 0) { S.hitstop -= dt; updateFx(dt * 0.2); return; }
  if (S.phase === 'fire') {
    S.turnTime += dt;
    S.timeScale = S.turnTime > 14 ? 4 : S.turnTime > 8 ? 3 : S.turnTime > 4 ? 2 : 1;
    if (S.turnTime > 1.5 && recallEl.hidden) recallEl.hidden = false;
    const gdt = dt * S.timeScale;
    if (S.toFire > 0) {
      S.fireTimer -= gdt;
      const sp = BAL.ballSpeed * (1 + 0.15 * S.lv.speed);
      while (S.toFire > 0 && S.fireTimer <= 0) {
        S.movers.push(mkBall(S.launchX, LY - 0.5, S.aim.x * sp, S.aim.y * sp, false));
        S.toFire--; S.fireTimer += BAL.fireGap; sfx.shoot();
      }
    }
    for (const b of S.movers) if (b.alive) moveBall(b, gdt);
    S.movers = S.movers.filter(b => b.alive);
    processBlasts(gdt);
    if (S.toFire === 0 && S.movers.length === 0 && S.blasts.length === 0) endTurn();
  } else if (S.phase === 'dying') {
    S.dieTimer -= dt;
    if (S.dieTimer <= 0) { if (S.revived) showResults(); else showRevive(); }
  }
  updateFx(dt);
}
function updateFx(dt) {
  for (const p of parts) { p.vy += 700 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  parts = parts.filter(p => p.life > 0);
  for (const r of rings) r.life -= dt; rings = rings.filter(r => r.life > 0);
  for (const b of bolts) b.life -= dt; bolts = bolts.filter(b => b.life > 0);
  for (const b of beams) b.life -= dt; beams = beams.filter(b => b.life > 0);
  for (const t of texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.94; } texts = texts.filter(t => t.life > 0);
  const tx = S.nextLaunchX ?? S.launchX;
  for (const h of homers) { const d = tx - h.x; h.x += Math.sign(d) * Math.min(Math.abs(d), 900 * dt); if (Math.abs(d) < 1) h.done = true; }
  homers = homers.filter(h => !h.done);
  for (const br of S.bricks) {
    if (br.flash > 0) br.flash = Math.max(0, br.flash - dt * 9);
    if (br.oy) { br.oy += (0 - br.oy) * Math.min(1, dt * 14); if (Math.abs(br.oy) < 0.3) br.oy = 0; }
  }
  if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }
  S.shake = Math.max(0, S.shake - dt * 40);
  S.flash = Math.max(0, S.flash - dt * 2.2);
  S.comboPulse = Math.max(0, S.comboPulse - dt * 6);
}
