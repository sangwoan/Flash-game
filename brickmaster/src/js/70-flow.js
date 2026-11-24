// Turn flow, overlays (level-up, shield offer, results, workshop) and the per-frame update.
let curChoices = [];

function fire() {
  S.kick = 1; rings.push({ x: S.launchX, y: LY, r: 40, life: 0.25, max: 0.25, col: TH.accent });
  S.phase = 'fire'; S.toFire = S.balls; S.fireTimer = 0; S.turnTime = 0; S.timeScale = 1;
  S.combo = 0; S.nextLaunchX = null; S.aiming = false;
  S.encoreChecked = false; S.acidDone = false; S.perfectDone = false; S.burstN = 0;
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
      S.shield--; S.shieldUsed = true;
      const cx = br.X + br.Wd / 2;
      rings.push({ x: cx, y: FB - 10, r: 90, life: 0.35, max: 0.35, col: SHIELD_COL });
      burst(cx, FB - 10, SHIELD_COL, 24, 300);
      for (const o of S.bricks) if (!o.dead && !isItem(o) && o.r >= ROWS - 2 && Math.abs(o.X + o.Wd / 2 - cx) < CW * 1.6) dealDamage(o, S.dmg * 3, false);
      texts.push(mkText(cx, FB - 40, 'BLOCK', SHIELD_COL, 1, 12));
      shake(6); sfx.boom();
      continue;
    }
    hurt += br.type === 'boss' ? 2 : 1;
    burst(br.X + br.Wd / 2, FB - 10, TH.css.hot, 16, 260);
  }
  if (hurt) {
    S.hp = 0; shake(16); S.flash = 0.8; S.flashCol = '255,79,123'; sfx.hurt(); buzz(200);
    texts.push(mkText(W / 2, FB - 40, 'BREACH!', TH.css.hot, 1.1, 18));
  }
  S.bricks = S.bricks.filter(b => !b.dead);
  rebuildGrid();
  S.turn++;
  addGold(BAL.goldPerTurn);
  if (S.worldPending) switchWorld();
  spawnRow(S.turn, true);
  S.combo = 0; S.timeScale = 1; S.fever = false; S.comboMile = 0;
  let low = 0;
  for (const br of S.bricks) if (!br.dead && !isItem(br)) low = Math.max(low, br.r);
  S.deepest = Math.max(S.deepest, low);
  S.danger = clamp((low - (ROWS - 6)) / 5, 0, 1); S.beat = 0.2;
  if (S.hp <= 0) { S.hp = 0; S.phase = 'dying'; S.dieTimer = 0.9; sfx.over(); return; }
  maybeOfferShield();
  if (S.pendingLevels > 0) { showLevel(); sfx.lvl(); shake(4); }
  else S.phase = 'aim';
}

// ---------- level-up ----------
function pickUpgrades(n) {
  const pool = Object.keys(UPG).filter(k => S.lv[k] < UPG[k].max)
    .map(k => ({ k, w: UPG[k].w }));
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

// ---------- shield offer: once per run, sometimes, when bricks get close ----------
// Accepting stands in for a rewarded ad. The shield blocks one brick at the red line.
let offerTimer = null;
function maybeOfferShield() {
  if (S.shieldOffered || S.shield > 0 || STG.chaos) return;
  const close = S.bricks.some(b => !b.dead && !isItem(b) && b.r >= ROWS - 4);
  if (!close || rnd() > 0.45) return;
  S.shieldOffered = true;
  const el = $('shieldOffer');
  el.hidden = false; el.classList.remove('go'); void el.offsetWidth; el.classList.add('go');
  sfx.orb(); buzz(20);
  clearTimeout(offerTimer); offerTimer = setTimeout(() => { el.hidden = true; }, 6000);
}
function takeShield() {
  $('shieldOffer').hidden = true; clearTimeout(offerTimer);
  if (!S || S.shield > 0) return;
  S.shield = 1;
  rings.push({ x: W / 2, y: FB, r: 260, life: 0.5, max: 0.5, col: SHIELD_COL });
  burst(W / 2, FB, SHIELD_COL, 40, 360);
  texts.push(mkText(W / 2, FB - 30, 'SHIELD ON', SHIELD_COL, 1.3, 14));
  sfx.clear(); buzz(60);
}
function hideShieldOffer() { $('shieldOffer').hidden = true; clearTimeout(offerTimer); }

// ---------- results ----------
let runGold = 0, runCleared = false;
function showResults(cleared = false) {
  hideShieldOffer();
  S.phase = 'over';
  runCleared = cleared;
  const reached = S.turn - 1;
  let stars = 0, bonus = 0, first = false, note = '';
  if (STG.endless) {
    SAVE.bestTurn = Math.max(SAVE.bestTurn, reached);
    if (S.score > SAVE.bestScore) { SAVE.bestScore = S.score; note = '내 최고 점수!'; }
    submitScore(S.score, S.world + 1, reached);
  } else if (cleared) {
    // stars: how close the bricks got to the red line (shield use caps it at 2)
    stars = S.deepest <= ROWS - 5 && !S.shieldUsed ? 3 : S.deepest <= ROWS - 3 ? 2 : 1;
    const prev = SAVE.stars[STG.g] || 0;
    first = prev === 0;
    SAVE.stars[STG.g] = Math.max(prev, stars);
    const before = SAVE.unlocked;
    SAVE.unlocked = Math.max(SAVE.unlocked, STG.g + 1);
    bonus = clearBonus(STG, first);
    if (SAVE.unlocked > before && STG.l === LEVELS_PER_STAGE - 1) note = `새 스테이지: ${landOf(STG.s + 1).name}`;
    if (SAVE.unlocked >= ENDLESS_UNLOCK && before < ENDLESS_UNLOCK) note = (note ? note + ' · ' : '') + '무한 모드 해금!';
  }
  SAVE.runs++; writeSave();
  runGold = Math.floor((S.gold * (1 + 0.15 * SAVE.meta.gold) + bonus) * STG.gold);
  $('overTitle').textContent = cleared ? 'LEVEL CLEAR' : STG.endless ? `SCORE ${S.score.toLocaleString()}` : 'GAME OVER';
  overEl.classList.toggle('win', cleared);
  $('stars').hidden = !cleared;
  $('stars').innerHTML = [0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="animation-delay:${0.25 + i * 0.22}s">★</i>`).join('');
  const rows = STG.endless
    ? [['점수', S.score.toLocaleString()], ['도달 레벨', S.world + 1], ['내 최고 점수', SAVE.bestScore.toLocaleString()], ['버틴 턴', reached], ['최대 콤보', S.maxCombo], ['부순 벽돌', S.kills]]
    : [['레벨', STG.id], ['보스', `서브 ${S.subDown ? '격파' : '—'} · ${STG.stageBoss ? '스테이지' : '메인'} ${S.mainDown ? '격파' : '—'}`], ['버틴 턴', reached], ['최대 콤보', S.maxCombo], ['부순 벽돌', S.kills], ['풍경', landOf(STG.s).name]];
  $('stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><span>${b}</span>`).join('');
  $('build').innerHTML = Object.keys(UPG).filter(k => S.lv[k]).map(k => `<span style="--c:${UPG[k].col}">${UPG[k].tag} ${S.lv[k]}</span>`).join('');
  $('earned').textContent = `골드 +${fmtN(runGold)}` + (bonus ? ` (클리어 보너스 ${fmtN(bonus * STG.gold)}${first ? ' · 첫 클리어 2배' : ''})` : '');
  $('overNote').textContent = note; $('overNote').hidden = !note;
  $('again').textContent = cleared && !STG.endless ? `NEXT ${levelInfo(STG.g + 1).id}` : 'RETRY';
  $('overRank').hidden = !STG.endless;
  $('claimRow').hidden = false; $('afterRow').hidden = true;
  overEl.hidden = false;
  if (cleared) { sfx.clear(); buzz(80); }
}
function claim(mult) {
  const got = runGold * mult;
  SAVE.gold += got; writeSave(); sfx.coin();
  $('earned').textContent = `골드 +${fmtN(got)} 받음 · 보유 ${fmtGold(SAVE.gold)}`;
  $('claimRow').hidden = true; $('afterRow').hidden = false;
}
function againOrNext() {
  if (STG.endless) startEndless();
  else startLevel(runCleared ? STG.g + 1 : STG.g);
}

// ---------- workshop ----------
let shopReturn = null;
function openShop(from) {
  shopReturn = from; from.hidden = true;
  renderShop(); shopEl.hidden = false;
}
function renderShop() {
  $('shopGold').textContent = `보유 골드 ${fmtGold(SAVE.gold)}`;
  const list = $('metaList'); list.innerHTML = '';
  for (const k of Object.keys(META)) {
    const m = META[k], l = SAVE.meta[k], maxed = l >= m.max, cost = metaCost(k, l);
    const row = document.createElement('div'); row.className = 'meta';
    // capped upgrades show pips; 기본 화력 has no cap and shows its level instead
    const pips = m.max <= 12 ? Array.from({ length: m.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('') : '';
    row.innerHTML = `<div><div class="mn">${m.name}${m.max > 12 ? ` <span class="lvtag">Lv ${l}</span>` : ''}</div><div class="md">${m.desc(l)}</div>${pips ? `<div class="pips">${pips}</div>` : ''}</div>`;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'buy';
    btn.textContent = maxed ? 'MAX' : fmtGold(cost);
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
function totalStars() { return Object.values(SAVE.stars).reduce((a, b) => a + b, 0); }
function refreshTitle() {
  const nx = levelInfo(nextLevelIndex());
  applyTheme(nx.land);
  $('titleGold').textContent = `보유 골드 ${fmtGold(SAVE.gold)} · ★ ${totalStars()}`;
  $('start').textContent = `PLAY ${nx.id}`;
  $('nextInfo').textContent = `ZONE ${TH.zone.n + 1} ${TH.zone.title} · ${TH.name} · 레벨 ${nx.l + 1}/${LEVELS_PER_STAGE}`;
  const open = SAVE.unlocked >= ENDLESS_UNLOCK;
  $('endless').disabled = !open;
  $('endless').textContent = open ? '무한 모드' : '무한 모드 (스테이지 1 클리어 시 열림)';
  $('best').textContent = SAVE.bestScore ? `ENDLESS BEST ${SAVE.bestScore.toLocaleString()}` + (SAVE.champion ? ' · CHAMPION' : '') : '';
}

// ---------- stage map: one card per stage (its landscape), five level nodes each ----------
let mapSel = 0, mapReturn = null;
function openMap(from) {
  mapReturn = from; if (from) from.hidden = true;
  mapSel = nextLevelIndex();
  renderMap(); $('map').hidden = false;
  const sel = document.querySelector('#mapList .node.sel');
  if (sel) sel.closest('.world').scrollIntoView({ block: 'center' });
}
function renderMap() {
  const list = $('mapList'); list.innerHTML = '';
  $('mapInfo').textContent = `★ ${totalStars()} · 보유 골드 ${fmtGold(SAVE.gold)}`;
  const lastStage = Math.floor(SAVE.unlocked / LEVELS_PER_STAGE) + 2; // show a little of what's ahead
  for (let st = 0; st <= lastStage; st++) {
    const L = landOf(st), R = L.R, open = st * LEVELS_PER_STAGE <= SAVE.unlocked, G = GIMMICKS[st % GIMMICKS.length];
    if (st % STAGES_PER_ZONE === 0) {
      const Z = zoneOf(st), hd = document.createElement('div');
      hd.className = 'zoneHead'; hd.style.cssText = `--wa:${Z.pals[0][0]};--wb:${Z.pals[0][1]}`;
      hd.innerHTML = `<b>ZONE ${Z.n + 1}</b><span>${Z.title}</span><em>${Z.ko}</em>`;
      list.appendChild(hd);
    }
    const sec = document.createElement('section');
    sec.className = 'world' + (open ? '' : ' locked');
    sec.style.cssText = `--wa:${R.accent};--thumb:url(${landThumb(st)})`;
    sec.innerHTML = `<header><b>STAGE ${st + 1}</b><span>${L.name}</span></header><p>${R.place} · ${G.text}</p>`;
    const path = document.createElement('div'); path.className = 'path';
    for (let l = 0; l < LEVELS_PER_STAGE; l++) {
      const lv = levelInfo(st * LEVELS_PER_STAGE + l), lock = lv.g > SAVE.unlocked, stars = SAVE.stars[lv.g] || 0;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'node' + (lock ? ' lock' : '') + (lv.g === SAVE.unlocked && !lock ? ' cur' : '') + (lv.g === mapSel ? ' sel' : '') + (lv.stageBoss ? ' boss' : '');
      b.innerHTML = `<span class="dot">${lock ? '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' : lv.id}</span>`
        + `<span class="st">${[0, 1, 2].map(k => `<i class="${k < stars ? 'on' : ''}">★</i>`).join('')}</span>`;
      b.onclick = () => { mapSel = lv.g; sfx.pick(); renderMap(); };
      path.appendChild(b);
    }
    sec.appendChild(path); list.appendChild(sec);
  }
  const lv = levelInfo(mapSel), lock = lv.g > SAVE.unlocked, first = !(SAVE.stars[lv.g] > 0);
  applyTheme(lv.land);
  $('mapSelInfo').innerHTML = `<b>LEVEL ${lv.id}</b> · 서브 보스 → ${lv.stageBoss ? '스테이지 보스' : '메인 보스'}<br>`
    + `벽돌 체력 ×${fmtMul(lv.hpMul)} · 내 화력 ×${fmtMul(dmgMult(SAVE.meta.power))} · ${first ? '첫 클리어 보상' : '클리어 보상'} ${fmtGold(clearBonus(lv, first) * lv.gold)}`;
  $('mapPlay').disabled = lock;
  $('mapPlay').textContent = lock ? 'LOCKED' : `PLAY ${lv.id}`;
}
function closeMap() {
  $('map').hidden = true;
  if (mapReturn) mapReturn.hidden = false;
  refreshTitle();
}
function hideMenus() { for (const el of [titleEl, overEl, shopEl, $('map'), $('rank')]) el.hidden = true; hideShieldOffer(); }
function beginRun() {
  ensureAudio();
  hideMenus();
  newRun();
  if (S.pendingLevels > 0) showLevel();
}
function startLevel(g) {
  STG = levelInfo(Math.max(0, g));
  applyTheme(STG.land);
  beginRun();
  if (STG.l === 0 && STG.s % STAGES_PER_ZONE === 0) zoneBanner(TH.zone);
  else showBanner(`LEVEL ${STG.id}`, STG.stageBoss ? `${TH.name} · 스테이지 보스` : TH.name, TH.accent);
}
function startEndless() {
  STG = endlessInfo();
  applyTheme(0);
  beginRun();
  showBanner('ENDLESS', '보스를 잡을 때마다 레벨과 풍경이 바뀝니다', TH.accent);
}
// Entering a new zone (every 5 stages): a longer banner and a light sweep.
function zoneBanner(Z) {
  showBanner(`ZONE ${Z.n + 1} · ${Z.title}`, `${Z.ko} · ${TH.name}`, TH.accent);
  S.banner.life = S.banner.max = 3.2;
  S.wipe = 1; S.pulse = 1; S.flash = 0.3; S.flashCol = '255,255,255';
  for (let i = 0; i < 5; i++) burst(W * (0.1 + 0.2 * i), H * 0.42, i % 2 ? TH.accent : TH.accent2, 26, 380);
}
// Endless: each boss raises the level and moves to the next landscape.
function switchWorld() {
  S.worldPending = false;
  S.world++;
  applyTheme(S.world);
  S.wipe = 1; shake(10); sfx.clear(); buzz(120);
  if (S.world % STAGES_PER_ZONE === 0) zoneBanner(TH.zone);
  else { showBanner(`LEVEL ${S.world + 1}`, TH.name, TH.accent); S.banner.life = S.banner.max = 2.6; }
  for (let i = 0; i < 4; i++) burst(W * (0.2 + 0.2 * i), H * 0.45, TH.accent, 30, 360);
}

// ---------- per-frame update ----------
function update(dt) {
  if (S.hitstop > 0) { S.hitstop -= dt; updateFx(dt * 0.2); return; }
  // slow motion after big multi-breaks: the world runs at 28%, effects at 45%
  const slow = S.slowmo > 0 ? 0.28 : 1;
  S.slowmo = Math.max(0, S.slowmo - dt);
  heartbeat(dt);
  if (slow < 1) { updateWorld(dt * slow); updateFx(dt * 0.45); return; }
  updateWorld(dt);
  updateFx(dt);
}
// one life: when bricks close in on the red line the heart beats faster
function heartbeat(dt) {
  if (S.danger <= 0 || (S.phase !== 'aim' && S.phase !== 'fire')) return;
  S.beat -= dt;
  if (S.beat <= 0) { S.beat = 1.0 - 0.45 * S.danger; S.beatPulse = 1; sfx.beat(); if (S.danger >= 0.75) buzz(15); }
}
function updateWorld(dt) {
  if (S.phase === 'fire') {
    S.turnTime += dt;
    S.timeScale = S.turnTime > 14 ? 4 : S.turnTime > 8 ? 3 : S.turnTime > 4 ? 2 : 1;
    if (S.turnTime > 1.5 && recallEl.hidden) recallEl.hidden = false;
    if (S.turnTime > 45 && S.movers.length) recall(); // safety: no turn runs forever (e.g. endless bounce loops)
    const gdt = dt * S.timeScale;
    if (S.burstT > 0) { S.burstT -= gdt; if (S.burstT <= 0) S.burstN = 0; }
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
    if (S.dieTimer <= 0) showResults(false);
  }
}
function updateFx(dt) {
  for (const p of parts) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.kind === 'confetti' || p.kind === 'spark') { p.vx *= 1 - dt * 2.5; p.vy *= 1 - dt * 1.5; } }
  parts = parts.filter(p => p.life > 0);
  for (const r of rings) r.life -= dt; rings = rings.filter(r => r.life > 0);
  for (const b of bolts) b.life -= dt; bolts = bolts.filter(b => b.life > 0);
  for (const b of beams) b.life -= dt; beams = beams.filter(b => b.life > 0);
  for (const p of pops) p.life -= dt; pops = pops.filter(p => p.life > 0);
  for (const p of pillars) p.life -= dt; pillars = pillars.filter(p => p.life > 0);
  for (const b of blooms) b.life -= dt; blooms = blooms.filter(b => b.life > 0);
  for (const f of bgFlashes) f.life -= dt; bgFlashes = bgFlashes.filter(f => f.life > 0);
  // stage lights follow the combo: rise fast, fade slowly once the volley is over
  const tgt = S.fever ? 1 : S.phase === 'fire' ? clamp(S.combo / 22, 0, 1) : 0;
  S.energy += (tgt - S.energy) * Math.min(1, dt * (tgt > S.energy ? 4 : 0.7));
  S.pulse = Math.max(0, (S.pulse || 0) - dt * 3.2);
  for (const h of shards) {
    h.vy += 1100 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.life -= dt;
    if (h.y > LY + 8 && h.vy > 0 && h.bounced < 2) { h.y = LY + 8; h.vy *= -0.38; h.vx *= 0.7; h.vr *= 0.6; h.bounced++; }
    if (h.x < 0 || h.x > W) h.vx *= -0.6;
  }
  shards = shards.filter(h => h.life > 0 && h.y < H + 40);
  const k = Math.min(1, dt * 16);
  for (const br of S.bricks) if (br.kx || br.ky) { br.kx -= br.kx * k; br.ky -= br.ky * k; if (Math.abs(br.kx) + Math.abs(br.ky) < 0.05) br.kx = br.ky = 0; }
  S.camZ *= Math.exp(-dt * 7); S.camR *= Math.exp(-dt * 7); S.chroma = Math.max(0, S.chroma - dt * 1.8);
  S.beatPulse = Math.max(0, (S.beatPulse || 0) - dt * 5);
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
