// Turn flow, overlays (level-up, revive, results, workshop) and the per-frame update.
let curChoices = [];

function fire() {
  S.kick = 1; rings.push({ x: S.launchX, y: LY, r: 40, life: 0.25, max: 0.25, col: TH.accent });
  S.phase = 'fire'; S.toFire = S.balls; S.fireTimer = 0; S.turnTime = 0; S.timeScale = 1;
  S.combo = 0; S.nextLaunchX = null; S.aiming = false;
  S.encoreChecked = false; S.acidDone = false;
  S.ironLeft = S.lv.iron ? (S.lv.iron >= 3 ? 2 : 1) : 0;
}
// Encore: every ball fires again from where the first one landed, without spending a turn.
function encore() {
  S.toFire = S.balls; S.fireTimer = 0;
  S.launchX = S.nextLaunchX ?? S.launchX; S.nextLaunchX = null;
  S.ironLeft = S.lv.iron ? (S.lv.iron >= 3 ? 2 : 1) : 0;
  bigWords.push({ s: 'ENCORE!', life: 1, max: 1, y: H * 0.36, size: 20, col: UPG.encore.col });
  sfx.clear(); shake(5); buzz(40);
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
  if (S.cleared) { S.phase = 'cleared'; S.dieTimer = 0.9; return; }
  if (S.combo >= 8) texts.push(mkText(W / 2, 420, comboWord(S.combo) + ' x' + S.combo, TH.accent, 1.2, 16));
  S.launchX = S.nextLaunchX ?? S.launchX; S.nextLaunchX = null;
  if (S.orbsGot) { S.balls += S.orbsGot; S.orbsGot = 0; }
  S.bricks = S.bricks.filter(b => !b.dead);
  shiftDown(true);
  let hurt = 0;
  for (const br of S.bricks) {
    if (br.r < ROWS || br.dead) continue;
    br.dead = true;
    if (isItem(br)) continue;
    if (S.shield > 0) {
      // shield: absorb the hit and blow the brick up against the barrier
      S.shield--;
      const cx = br.X + br.Wd / 2;
      rings.push({ x: cx, y: FB - 10, r: 90, life: 0.35, max: 0.35, col: UPG.shield.col });
      burst(cx, FB - 10, UPG.shield.col, 24, 300);
      for (const o of S.bricks) if (!o.dead && !isItem(o) && o.r >= ROWS - 2 && Math.abs(o.X + o.Wd / 2 - cx) < CW * 1.6) dealDamage(o, S.dmg * 3, false);
      texts.push(mkText(cx, FB - 40, 'BLOCK', UPG.shield.col, 1, 12));
      shake(6); sfx.boom();
      continue;
    }
    hurt += br.type === 'boss' ? 2 : 1;
    burst(br.X + br.Wd / 2, FB - 10, TH.css.hot, 16, 260);
  }
  if (hurt) {
    S.hp -= hurt; shake(12); S.flash = 0.55; S.flashCol = '255,79,123'; sfx.hurt(); buzz(120);
    texts.push(mkText(W / 2, FB - 40, 'HP -' + hurt, TH.css.hot, 1.1, 16));
  }
  S.bricks = S.bricks.filter(b => !b.dead);
  rebuildGrid();
  S.turn++;
  addGold(BAL.goldPerTurn);
  if (S.turn % BAL.bossEvery === 1) {
    const ch = chapterOf(S.turn);
    if (S.lv.shield && S.shield < S.lv.shield) { S.shield = S.lv.shield; texts.push(mkText(W / 2, FB - 20, 'SHIELD FULL', UPG.shield.col, 1.2, 10)); }
    showBanner(`CHAPTER ${ch}`, chapterName(ch), TH.accent);
  }
  if (S.worldPending) switchWorld();
  spawnRow(S.turn, true);
  S.combo = 0; S.timeScale = 1; S.fever = false; S.comboMile = 0;
  if (S.hp <= 0) { S.hp = 0; S.phase = 'dying'; S.dieTimer = 0.9; sfx.over(); return; }
  if (S.pendingLevels > 0) { showLevel(); sfx.lvl(); shake(4); }
  else S.phase = 'aim';
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
  $('lvlNum').textContent = S.level > 0 ? 'LV ' + S.level : 'BONUS';
  $('lvlLeft').textContent = S.pendingLevels > 1 ? `능력 하나를 고르세요 · 남은 선택 ${S.pendingLevels}` : '능력 하나를 고르세요';
  for (const k of curChoices) {
    const u = UPG[k], l = S.lv[k];
    const lvl = u.max <= 6
      ? `<span class="lv">${Array.from({ length: u.max }, (_, i) => `<i class="${i < l ? 'on' : i === l ? 'nx' : ''}"></i>`).join('')}</span>`
      : `<span class="lvt">LV ${l} &gt; ${l + 1}</span>`;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'card'; b.style.setProperty('--c', u.col);
    b.innerHTML = `${l === 0 ? '<span class="new">NEW</span>' : ''}<span class="ic"><svg viewBox="0 0 24 24">${ICONS[k]}</svg></span>`
      + `<span class="cn">${u.name}</span>${lvl}<span class="cd">${u.desc(l + 1)}</span>`;
    b.onclick = () => pickCard(k, b);
    cardsEl.appendChild(b);
  }
  // restart the entrance animations when the overlay is reused for a second pick
  lvlEl.hidden = true; void lvlEl.offsetWidth; lvlEl.hidden = false;
  lvlEl.classList.add('locked');
  setTimeout(() => lvlEl.classList.remove('locked'), 200);
}
// Tap feedback: the chosen card pops, the others fade, then the choice applies.
function pickCard(k, el) {
  if (lvlEl.classList.contains('locked') || S.phase !== 'levelup') return;
  lvlEl.classList.add('locked');
  for (const c of cardsEl.children) c.classList.add(c === el ? 'chosen' : 'dim');
  const r = el.getBoundingClientRect(), cr = cv.getBoundingClientRect();
  const x = (r.left + r.width / 2 - cr.left) / scale, y = (r.top + r.height / 2 - cr.top) / scale;
  burst(x, y, UPG[k].col.length === 7 ? UPG[k].col : TH.accent, 50, 420);
  rings.push({ x, y, r: 160, life: 0.35, max: 0.35, col: UPG[k].col });
  sfx.clear(); buzz(30);
  setTimeout(() => choose(k), 230);
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
  showBanner('REVIVE', '다시 한 번!', TH.accent);
  if (S.pendingLevels > 0) showLevel(); else S.phase = 'aim';
}
let runGold = 0, runCleared = false;
function showResults(cleared = false) {
  reviveEl.hidden = true;
  S.phase = 'over';
  runCleared = cleared;
  const reached = S.turn - 1, ch = chapterOf(Math.max(1, reached));
  let stars = 0, bonus = 0, first = false, note = '';
  if (STG.endless) {
    const newBest = reached > SAVE.bestTurn;
    SAVE.bestTurn = Math.max(SAVE.bestTurn, reached);
    SAVE.bestChapter = Math.max(SAVE.bestChapter, ch);
    if (newBest) note = '무한 모드 최고 기록!';
  } else if (cleared) {
    stars = S.hp >= S.maxHp && !S.revived ? 3 : S.hp * 2 >= S.maxHp ? 2 : 1;
    const prev = SAVE.stars[STG.n] || 0;
    first = prev === 0;
    SAVE.stars[STG.n] = Math.max(prev, stars);
    const before = SAVE.unlocked;
    SAVE.unlocked = Math.max(SAVE.unlocked, STG.n + 1);
    bonus = clearBonus(STG, first);
    if (SAVE.unlocked > before && STG.n + 1 < STAGES.length && STAGES[STG.n + 1].w !== STG.w) note = `새 월드 해금: ${THEMES[STAGES[STG.n + 1].world].name}`;
    else if (SAVE.unlocked >= ENDLESS_UNLOCK && before < ENDLESS_UNLOCK) note = '무한 모드 해금!';
    SAVE.worlds = Math.max(SAVE.worlds, Math.min(WORLD_ORDER.length, Math.floor(SAVE.unlocked / STAGES_PER_WORLD) + 1));
  }
  SAVE.runs++; writeSave();
  runGold = Math.floor((S.gold * (1 + 0.15 * SAVE.meta.gold) + bonus) * STG.gold);
  $('overTitle').textContent = cleared ? 'STAGE CLEAR' : 'GAME OVER';
  overEl.classList.toggle('win', cleared);
  $('stars').hidden = !cleared;
  $('stars').innerHTML = [0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.22}s">★</i>`).join('');
  const rows = STG.endless
    ? [['모드', '무한'], ['버틴 턴', reached], ['도달 챕터', ch], ['최고 기록', SAVE.bestTurn + '턴'], ['레벨', S.level], ['최대 콤보', S.maxCombo]]
    : [['스테이지', STG.id], ['처치한 보스', `${Math.min(S.bosses, STG.bosses)}/${STG.bosses}`], ['버틴 턴', reached], ['레벨', S.level], ['최대 콤보', S.maxCombo], ['부순 벽돌', S.kills]];
  $('stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  $('build').innerHTML = Object.keys(UPG).filter(k => S.lv[k]).map(k => `<span style="--c:${UPG[k].col}">${UPG[k].tag} ${S.lv[k]}</span>`).join('');
  $('earned').textContent = `골드 +${runGold}` + (bonus ? ` (클리어 보너스 ${Math.round(bonus * STG.gold)}${first ? ' · 첫 클리어 2배' : ''})` : '');
  $('overNote').textContent = note; $('overNote').hidden = !note;
  const hasNext = cleared && !STG.endless && STG.n + 1 < STAGES.length;
  $('again').textContent = hasNext ? `NEXT ${STAGES[STG.n + 1].id}` : 'RETRY';
  $('claimRow').hidden = false; $('afterRow').hidden = true;
  overEl.hidden = false;
  if (cleared) { sfx.clear(); buzz(80); }
}
function claim(mult) {
  const got = runGold * mult;
  SAVE.gold += got; writeSave(); sfx.coin();
  $('earned').textContent = `골드 +${got} 받음 · 보유 ${SAVE.gold}G`;
  $('claimRow').hidden = true; $('afterRow').hidden = false;
}
function againOrNext() {
  if (STG.endless) startEndless();
  else startStage(runCleared && STG.n + 1 < STAGES.length ? STG.n + 1 : STG.n);
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
  const nx = STAGES[nextStageIndex()];
  applyTheme(nx.world);
  const allStars = Object.values(SAVE.stars).reduce((a, b) => a + b, 0);
  $('titleGold').textContent = `보유 골드 ${SAVE.gold}G · ★ ${allStars}/${STAGES.length * 3}`;
  $('start').textContent = `PLAY ${nx.id}`;
  $('nextInfo').textContent = `${TH.name} · 보스 ${nx.bosses}마리`;
  const open = SAVE.unlocked >= ENDLESS_UNLOCK;
  $('endless').disabled = !open;
  $('endless').textContent = open ? '무한 모드' : `무한 모드 (1-${STAGES_PER_WORLD} 클리어 시 열림)`;
  $('best').textContent = SAVE.bestTurn ? `ENDLESS BEST ${SAVE.bestTurn} TURNS` : '';
}

// ---------- stage map ----------
let mapSel = 0, mapReturn = null;
function openMap(from) {
  mapReturn = from; if (from) from.hidden = true;
  mapSel = nextStageIndex();
  renderMap(); $('map').hidden = false;
  const sel = document.querySelector('#mapList .node.sel');
  if (sel) sel.closest('.world').scrollIntoView({ block: 'center' });
}
function renderMap() {
  const list = $('mapList'); list.innerHTML = '';
  const allStars = Object.values(SAVE.stars).reduce((a, b) => a + b, 0);
  $('mapInfo').textContent = `★ ${allStars}/${STAGES.length * 3} · 보유 골드 ${SAVE.gold}G`;
  WORLD_ORDER.forEach((wid, w) => {
    const th = THEMES[wid], open = w * STAGES_PER_WORLD <= SAVE.unlocked;
    const sec = document.createElement('section');
    sec.className = 'world' + (open ? '' : ' locked');
    sec.style.cssText = `--wb:${th.css.bg};--wp:${th.css.panel};--wa:${th.accent};--wi:${th.css.ink};--wd:${th.css.dim};--wf:${th.disp}`;
    sec.innerHTML = `<header><b>WORLD ${w + 1}</b><span>${th.name}</span></header><p>${WORLD_MODS[w].text}</p>`;
    const path = document.createElement('div'); path.className = 'path';
    for (let i = 0; i < STAGES_PER_WORLD; i++) {
      const st = STAGES[w * STAGES_PER_WORLD + i], lock = st.n > SAVE.unlocked, stars = SAVE.stars[st.n] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'node' + (lock ? ' lock' : '') + (st.n === SAVE.unlocked && !lock ? ' cur' : '') + (st.n === mapSel ? ' sel' : '');
      b.innerHTML = `<span class="dot">${lock ? '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' : st.id}</span>`
        + `<span class="st">${[0, 1, 2].map(k => `<i class="${k < stars ? 'on' : ''}">★</i>`).join('')}</span>`;
      b.onclick = () => { mapSel = st.n; sfx.pick(); renderMap(); };
      path.appendChild(b);
    }
    sec.appendChild(path); list.appendChild(sec);
  });
  const st = STAGES[mapSel], lock = st.n > SAVE.unlocked, first = !(SAVE.stars[st.n] > 0);
  applyTheme(st.world);
  $('mapSelInfo').innerHTML = `<b>STAGE ${st.id}</b> · 보스 ${st.bosses}마리 · 벽돌 체력 ×${st.hpMul.toFixed(1)}<br>`
    + `${first ? '첫 클리어 보상' : '클리어 보상'} ${Math.round(clearBonus(st, first) * st.gold)}G`;
  $('mapPlay').disabled = lock;
  $('mapPlay').textContent = lock ? 'LOCKED' : `PLAY ${st.id}`;
}
function closeMap() {
  $('map').hidden = true;
  if (mapReturn) mapReturn.hidden = false;
  refreshTitle();
}
function hideMenus() { for (const el of [titleEl, overEl, shopEl, $('map')]) el.hidden = true; }
function beginRun() {
  ensureAudio();
  hideMenus();
  newRun();
  if (S.pendingLevels > 0) showLevel();
}
function startStage(n) {
  STG = STAGES[clamp(n, 0, STAGES.length - 1)];
  applyTheme(STG.world);
  beginRun();
  showBanner(`STAGE ${STG.id}`, `보스 ${STG.bosses}마리를 처치하라`, TH.accent);
}
function startEndless() {
  STG = ENDLESS;
  applyTheme('neon');
  beginRun();
  showBanner('ENDLESS', '보스 3마리마다 다음 월드로', TH.accent);
}

// Every BOSSES_PER_WORLD bosses the run moves to the next world (full visual theme).
function switchWorld() {
  S.worldPending = false;
  S.world = (S.world + 1) % WORLD_ORDER.length;
  applyTheme(WORLD_ORDER[S.world]);
  S.wipe = 1; shake(10); sfx.clear(); buzz(120);
  showBanner(`WORLD ${S.world + 1}`, TH.name, TH.accent);
  S.banner.life = S.banner.max = 2.6;
  for (let i = 0; i < 4; i++) burst(W * (0.2 + 0.2 * i), H * 0.45, TH.accent, 30, 360);
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
      const sp = BAL.ballSpeed;
      while (S.toFire > 0 && S.fireTimer <= 0) {
        const b = mkBall(S.launchX, LY - 0.5, S.aim.x * sp, S.aim.y * sp, false);
        if (S.ironLeft > 0) { S.ironLeft--; b.iron = true; b.r = IRON_R; }
        S.movers.push(b);
        S.toFire--; S.fireTimer += BAL.fireGap; sfx.shoot();
      }
    }
    for (const b of S.movers) if (b.alive) moveBall(b, gdt);
    S.movers = S.movers.filter(b => b.alive);
    processBlasts(gdt);
    if (S.toFire === 0 && S.movers.length === 0 && S.blasts.length === 0) {
      // end of a volley: maybe encore, then acid settles, then the turn ends
      if (!S.encoreChecked && (S.encoreChecked = true) && S.lv.encore && rnd() < 0.15 * S.lv.encore) encore();
      else if (S.lv.acid && !S.acidDone) { S.acidDone = true; acidTick(); }
      else endTurn();
    }
  } else if (S.phase === 'cleared') {
    S.dieTimer -= dt; if (S.dieTimer <= 0) showResults(true);
  } else if (S.phase === 'dying') {
    S.dieTimer -= dt;
    if (S.dieTimer <= 0) { if (S.revived) showResults(); else showRevive(); }
  }
  updateFx(dt);
}
function updateFx(dt) {
  for (const p of parts) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.kind === 'confetti' || p.kind === 'spark') { p.vx *= 1 - dt * 2.5; p.vy *= 1 - dt * 1.5; } }
  parts = parts.filter(p => p.life > 0);
  for (const r of rings) r.life -= dt; rings = rings.filter(r => r.life > 0);
  for (const b of bolts) b.life -= dt; bolts = bolts.filter(b => b.life > 0);
  for (const b of beams) b.life -= dt; beams = beams.filter(b => b.life > 0);
  for (const p of pops) p.life -= dt; pops = pops.filter(p => p.life > 0);
  for (const w of bigWords) w.life -= dt; bigWords = bigWords.filter(w => w.life > 0);
  for (const c of flyers) { c.t += dt; if (c.t >= c.dur) { c.done = true; S.goldBump = 1; sfx.tick(); } }
  flyers = flyers.filter(c => !c.done);
  for (const p of parts) p.rot += p.vr * dt;
  for (const t of texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.94; } texts = texts.filter(t => t.life > 0);
  const tx = S.nextLaunchX ?? S.launchX;
  for (const h of homers) { const d = tx - h.x; h.x += Math.sign(d) * Math.min(Math.abs(d), 900 * dt); if (Math.abs(d) < 1) h.done = true; }
  homers = homers.filter(h => !h.done);
  for (const br of S.bricks) {
    if (br.flash > 0) br.flash = Math.max(0, br.flash - dt * 9);
    if (br.oy) { br.oy += (0 - br.oy) * Math.min(1, dt * 14); if (Math.abs(br.oy) < 0.3) br.oy = 0; }
  }
  if (S.banner) { S.banner.life -= dt; if (S.banner.life <= 0) S.banner = null; }
  S.wipe = Math.max(0, S.wipe - dt * 1.4);
  S.shake = Math.max(0, S.shake - dt * 40);
  S.flash = Math.max(0, S.flash - dt * 2.2);
  S.comboPulse = Math.max(0, S.comboPulse - dt * 6);
  S.kick = Math.max(0, S.kick - dt * 5);
  S.goldBump = Math.max(0, S.goldBump - dt * 6);
  S.xpFlash = Math.max(0, S.xpFlash - dt * 4);
}
