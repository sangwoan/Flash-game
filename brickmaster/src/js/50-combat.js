// Damage, kills, explosions, lasers, XP and gold.

function gainXp(n) {
  S.xp += n * (S.xpBase + 0.4 * S.lv.xp);
  while (S.xp >= S.xpNeed) {
    S.xp -= S.xpNeed; S.level++; S.pendingLevels++; S.xpFlash = 1;
    S.xpNeed = BAL.xpNeed(S.level);
    texts.push(mkText(W / 2, 360, 'LEVEL UP!', TH.css.gold, 1.1, 18));
    sfx.lvl();
  }
}
// n is in base gold; the level's inflation multiplies it.
function addGold(n, x, y) {
  const g = n * STG.goldMul;
  S.gold += g;
  if (x !== undefined) {
    texts.push(mkText(x, y, '+' + withG(fmtBig(g)), TH.css.gold, 1.2, 12));
    for (let i = 0; i < Math.min(12, 2 + n / 3); i++) flyCoin(x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 20);
  }
}
// A cosmetic coin that arcs up to the HUD gold counter.
function flyCoin(x, y) {
  if (flyers.length > 60) return;
  flyers.push({ sx: x, sy: y, cx: x + (rnd() - 0.5) * 160, cy: y - 60 - rnd() * 80, t: 0, dur: 0.55 + rnd() * 0.3 });
}
const COMBO_MILES = [8, 15, 25, 40, 60];

function dealDamage(br, d, crit) {
  if (br.dead || isItem(br)) return;
  br.col = brickColor(br); // colour while still alive, for shards
  if (S.meter) { S.meter.raw += d; S.meter.eff += Math.min(d, br.hp); } // balance benches only
  br.hp -= d; br.flash = 1;
  br.kx = (br.kx || 0) + (br.kdx || 0) * 2.5; br.ky = (br.ky || 0) + (br.kdy || 0) * 2.5;
  if (crit) texts.push(mkText(br.X + br.Wd / 2, br.Y, 'CRIT ' + fmtDmg(Math.round(d * 10) / 10), TH.css.gold, 0.7, 9));
  if (br.hp <= 1e-6) { if (br.type === 'slime' && !br.shrunk) shrinkSlime(br); else kill(br); }
}

// ---------- break feel ----------
// A dying brick shatters into triangular shards that fly along the hit direction.
function shatter(br) {
  const w = br.Wd, h = br.Ht, col = br.col || brickColor(br), nx = br.span > 1 ? 6 : 3, ny = 2;
  const jx = w / nx * 0.3, jy = h / ny * 0.3;
  const P = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
    const edge = i === 0 || i === nx || j === 0 || j === ny;
    P.push([i * w / nx + (edge ? 0 : (rnd() - 0.5) * jx * 2), j * h / ny + (edge ? 0 : (rnd() - 0.5) * jy * 2)]);
  }
  const at = (i, j) => P[j * (nx + 1) + i];
  const kx = br.kdx || 0, ky = br.kdy || -1, power = isBigBoss(br) ? 640 : br.type === 'boss' ? 520 : 300;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
    for (const tri of (rnd() < 0.5 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]])) {
      const gx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3, gy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
      const ox = gx - w / 2, oy = gy - h / 2, sp = power * (0.45 + rnd() * 0.75);
      shards.push({
        x: br.X + gx, y: br.Y + gy, pts: tri.map(p => [p[0] - gx, p[1] - gy]),
        vx: ox * 7 + kx * sp + (rnd() - 0.5) * 120, vy: oy * 7 + ky * sp - 140 - rnd() * 160,
        rot: 0, vr: (rnd() - 0.5) * 22, col, shade: rnd() * 0.35 - 0.15, life: 1.1 + rnd() * 0.5, max: 1.6, bounced: 0,
      });
    }
  }
  if (shards.length > 480) shards.splice(0, shards.length - 480);
}
// Neighbours of a broken brick get shoved away from it (they spring back).
function shockwave(cx, cy, rad, force) {
  for (const o of S.bricks) {
    if (o.dead || isItem(o)) continue;
    const dx = o.X + o.Wd / 2 - cx, dy = o.Y + o.Ht / 2 - cy, d = Math.hypot(dx, dy);
    if (d > 0 && d < rad) { const f = force * (1 - d / rad); o.kx = (o.kx || 0) + dx / d * f; o.ky = (o.ky || 0) + dy / d * f; }
  }
}
// Several bricks broken within a quarter second escalate into slow motion and a camera punch.
const MULTI = [
  { n: 4, word: 'BREAK', shake: 6, zoom: 0.02, slow: 0, chroma: 0, hap: 30 },
  { n: 8, word: 'SMASH', shake: 10, zoom: 0.035, slow: 0.28, chroma: 0.35, hap: 60 },
  { n: 14, word: 'DEVASTATION', shake: 14, zoom: 0.05, slow: 0.45, chroma: 0.6, hap: 90 },
  { n: 22, word: 'ANNIHILATION', shake: 16, zoom: 0.07, slow: 0.6, chroma: 0.9, hap: 140 },
];
function countBurst() {
  S.burstN++; S.burstT = 0.28;
  const lv = MULTI.findIndex(m => m.n === S.burstN);
  if (lv < 0) return;
  const m = MULTI[lv];
  S.score += 100 * (lv + 1) * S.burstN;
  shake(m.shake); S.camZ = Math.max(S.camZ, m.zoom); S.camR = (rnd() < 0.5 ? -1 : 1) * m.zoom * 0.5;
  S.chroma = Math.max(S.chroma, m.chroma);
  if (m.slow) { S.slowmo = Math.max(S.slowmo, m.slow); sfx.whoosh(); }
  bigWords.push({ s: `${m.word} x${S.burstN}`, life: 1.1, max: 1.1, y: H * 0.46, size: 15 + lv * 3, style: 'slam' });
  sfx.slam(lv); buzz(m.hap);
  if (lv >= 1) { S.flash = 0.25 + lv * 0.08; S.flashCol = '255,255,255'; }
}
function lineClear(br) {
  S.score += 200;
  const y = br.Y + br.Ht / 2;
  beams.push({ x: 0, y: y - 8, w: W, h: 16, life: 0.3, max: 0.3 });
  for (let x = 20; x < W; x += 40) burst(x, y, TH.accent, 3, 200);
  texts.push(mkText(W / 2, y - 6, 'LINE CLEAR', TH.css.gold, 1.1, 14));
  addGold(3, W / 2, y); shake(5); S.camZ = Math.max(S.camZ, 0.02); sfx.laser(); buzz(40);
}
function perfectClear() {
  S.score += 1000;
  S.perfectDone = true;
  bigWords.push({ s: 'PERFECT!', life: 1.8, max: 1.8, y: H * 0.38, size: 30, style: 'slam' });
  S.slowmo = Math.max(S.slowmo, 0.8); S.flash = 0.7; S.flashCol = '255,255,255'; S.chroma = 1; S.camZ = 0.08; shake(14);
  for (let i = 0; i < 8; i++) burst(W * (i + 0.5) / 8, TOP + 120 + rnd() * 300, TH.accent, 24, 420);
  addGold(10 + S.turn, W / 2, H * 0.45); sfx.whoosh(); sfx.slam(3); sfx.clear(); buzz(200);
}

// The main boss goes down: slow motion, a slam word and light along its whole body.
function mainBossDown(br) {
  S.slowmo = Math.max(S.slowmo, 0.7); S.chroma = 1; S.camZ = 0.08; S.pulse = 1;
  bigWords.push({ s: 'BOSS DOWN', life: 1.6, max: 1.6, y: H * 0.24, size: 26, style: 'slam' });
  for (let i = 0; i < 5; i++) burst(br.X + br.Wd * (i + 0.5) / 5, br.Y + br.Ht / 2, i % 2 ? TH.accent : TH.css.gold, 26, 420);
  for (let i = 0; i < 3; i++) if (pillars.length < 24) pillars.push({ x: br.X + br.Wd * (i + 0.5) / 3, y: br.Y + br.Ht / 2, w: 44, col: TH.css.gold, life: 0.5, max: 0.5 });
  sfx.slam(3); buzz(220);
}

function kill(br) {
  br.dead = true; clearCells(br);
  const cx = br.X + br.Wd / 2, cy = br.Y + br.Ht / 2, boss = br.type === 'boss';
  shatter(br);
  // light: a bloom where it broke, a pillar of light, and a flash on the black behind it
  const lc = br.col || brickColor(br);
  if (blooms.length < 40) blooms.push({ x: cx, y: cy, r: boss ? 160 : 70, col: lc, life: 0.3, max: 0.3 });
  if (pillars.length < 24) pillars.push({ x: cx, y: cy, w: boss ? br.Wd * 0.6 : 26, col: lc, life: 0.35, max: 0.35 });
  if (bgFlashes.length < 14) bgFlashes.push({ x: cx, y: cy, col: lc, life: 0.5, max: 0.5 });
  S.pulse = Math.min(1, (S.pulse || 0) + (boss ? 1 : 0.22));
  burst(cx, cy, br.col || brickColor(br), boss ? 50 : 5, boss ? 380 : 220);
  pops.push({ x: br.X, y: br.Y, w: br.Wd, h: br.Ht, life: 0.22, max: 0.22 });
  shockwave(cx, cy, CW * (boss ? 4 : 1.7), boss ? 14 : 5);
  countBurst();
  // endless score: combo and how deep into the run you are both multiply it
  S.score += Math.round(10 * (1 + S.combo * 0.1) * (1 + S.turn / 20));
  sfx.crunch(S.burstN);
  if (!boss && br.rowSize >= 4 && !S.bricks.some(o => !o.dead && !isItem(o) && o.r === br.r)) lineClear(br);
  if (!S.perfectDone && S.phase === 'fire' && !S.bricks.some(o => !o.dead && !isItem(o))) perfectClear();
  S.combo++; S.kills++; S.comboPulse = 1; S.maxCombo = Math.max(S.maxCombo, S.combo);
  if (S.comboMile < COMBO_MILES.length && S.combo >= COMBO_MILES[S.comboMile]) {
    bigWords.push({ s: TH.words[S.comboMile], life: 1.1, max: 1.1, y: H * 0.3, size: 16 + S.comboMile * 2 });
    S.comboMile++; shake(5); sfx.clear(); buzz(40);
  }
  if (S.combo >= 20 && !S.fever) { S.fever = true; S.flash = 0.35; S.flashCol = '255,255,255'; }
  if (!boss && rnd() < (S.fever ? 0.5 : 0.25)) flyCoin(cx, cy);
  shake(boss ? 14 : 1.2);
  sfx.brk(S.combo); buzz(boss ? 80 : 8);
  const bonus = BAL.xpTurnBonus ? Math.floor(S.turn / BAL.xpTurnBonus) : 0;
  if (boss) {
    const big = isBigBoss(br);
    S.bosses++; S.hitstop = big ? 0.24 : 0.16;
    if (big) S.mainDown = true;
    if (STG.endless) { S.worldPending = true; S.score += 500 * (S.world + 1); }
    else if (S.bosses >= STG.bosses) S.cleared = true;
    // time the next boss: a random gap after this one arrived, and a short rest after this kill
    if (!S.cleared) S.nextBossTurn = Math.max(S.bossTurns ? S.bossTurns[S.bossIdx] : S.lastBossTurn + randIn(BAL.endlessGap), S.turn + BAL.bossRest);
    if (!S.cleared) gainXp(BAL.xpBoss); // no level-up popping over the clear
    S.flash = 0.6; S.flashCol = '255,255,255';
    addGold((BAL.goldBoss + BAL.goldChapter(br.chapter)) * (big ? 2 : 1), cx, cy);
    if (big) mainBossDown(br);
    if (S.cleared) showBanner('LEVEL CLEAR', `레벨 ${STG.id} 돌파!`, TH.css.gold);
    else if (STG.endless) showBanner(`LEVEL ${S.world + 1} CLEAR`, '보스 격파!', TH.css.gold);
    else {
      const next = nextBossRank(), left = S.nextBossTurn - S.turn;
      showBanner('BOSS DOWN', `${next === 'main' ? '메인 보스' : next === 'stage' ? '스테이지 보스' : '다음 보스'}까지 ${left}턴`, TH.css.gold);
    }
    sfx.clear();
  } else if (br.type === 'steel') { gainXp(BAL.xpSteel + bonus); addGold(2, cx, cy); }
  else { gainXp(BAL.xpBrick + bonus); addGold(BAL.goldPerKill); }
  if (br.type === 'bomb') S.blasts.push({ x: cx, y: cy, rad: CW * 1.6, dmg: Math.ceil(effTurn(S.turn) * 1.5 * STG.hpMul) + S.dmg * 2, kind: 'bomb', t: 0.06 });
  if (br.type === 'chest') { S.level++; S.pendingLevels++; texts.push(mkText(cx, cy, '+LV', TH.css.gold, 1, 14)); sfx.lvl(); } // counts toward the boss gates
  if (S.lv.fire > 0) S.blasts.push({ x: cx, y: cy, rad: CW * 1.15, dmg: S.dmg * (1.5 + S.lv.fire), kind: 'fire', t: 0.07 });
}

// A slime splits into up to two small bricks in free neighbouring cells.
// A slime's first break doesn't kill it: it shrinks in place with 40% of its HP and holds on.
// (It used to split into new bricks next to it, which looked like bricks popping up mid-turn.)
function shrinkSlime(br) {
  br.shrunk = true; br.maxHp = br.hp = Math.max(1, Math.ceil(br.maxHp * 0.4)); br.pop = 1; br.flash = 1; br.cracks = null;
  const cx = br.X + br.Wd / 2, cy = br.Y + br.Ht / 2;
  burst(cx, cy, TH.special.slime, 12, 200);
  rings.push({ x: cx, y: cy, r: 40, life: 0.3, max: 0.3, col: TH.special.slime });
  texts.push(mkText(cx, br.Y, 'SPLAT', TH.special.slime, 0.7, 9));
  sfx.slime(); shake(1.5);
}

function processBlasts(dt) {
  if (!S.blasts.length) return;
  for (const b of S.blasts) b.t -= dt;
  const due = S.blasts.filter(b => b.t <= 0);
  S.blasts = S.blasts.filter(b => b.t > 0);
  for (const b of due) {
    const col = b.kind === 'bomb' ? TH.css.hot : '#ff8a3d';
    rings.push({ x: b.x, y: b.y, r: b.rad, life: 0.3, max: 0.3, col });
    burst(b.x, b.y, col, b.kind === 'bomb' ? 22 : 8, 260);
    if (b.kind === 'bomb') { shake(7); sfx.boom(); buzz(30); S.hitstop = Math.max(S.hitstop, 0.04); } else shake(1.2);
    for (const br of S.bricks) {
      if (br.dead || isItem(br)) continue;
      const dx = Math.max(br.X - b.x, 0, b.x - (br.X + br.Wd)), dy = Math.max(br.Y - b.y, 0, b.y - (br.Y + br.Ht));
      if (dx * dx + dy * dy <= (b.rad * 0.55) ** 2) {
        const ux = br.X + br.Wd / 2 - b.x, uy = br.Y + br.Ht / 2 - b.y, ul = Math.hypot(ux, uy) || 1;
        br.kdx = ux / ul; br.kdy = uy / ul;
        dealDamage(br, b.dmg, false);
      }
    }
  }
}

function zap(from) {
  const fx = from.X + from.Wd / 2, fy = from.Y + from.Ht / 2;
  const cand = S.bricks.filter(b => !b.dead && b !== from && !isItem(b))
    .map(b => ({ b, d: (b.X + b.Wd / 2 - fx) ** 2 + (b.Y + b.Ht / 2 - fy) ** 2 }))
    .sort((a, b) => a.d - b.d).slice(0, S.lv.chain + 1);
  let px = fx, py = fy;
  for (const { b } of cand) {
    const tx = b.X + b.Wd / 2, ty = b.Y + b.Ht / 2, pts = [[px, py]];
    for (let i = 1; i < 6; i++) pts.push([px + (tx - px) * i / 6 + (rnd() - 0.5) * 16, py + (ty - py) * i / 6 + (rnd() - 0.5) * 16]);
    pts.push([tx, ty]);
    bolts.push({ pts, life: 0.16, max: 0.16 });
    dealDamage(b, S.dmg * 1.5, false);
    px = tx; py = ty;
  }
  if (cand.length) sfx.zap();
}

// Acid: stacks left by hits all burst at the end of the turn, then halve.
function acidTick() {
  let any = false;
  for (const br of S.bricks) {
    if (br.dead || isItem(br) || !br.acid) continue;
    const d = br.acid * S.dmg * 0.3;
    texts.push(mkText(br.X + br.Wd / 2, br.Y + 4, fmtDmg(Math.round(d * 10) / 10), UPG.acid.col, 0.8, 9));
    burst(br.X + br.Wd / 2, br.Y + br.Ht / 2, UPG.acid.col, 4, 120);
    br.acid = Math.floor(br.acid / 2);
    dealDamage(br, d, false);
    any = true;
  }
  if (any) { sfx.slime(); shake(2); }
  return any;
}

// Laser items fire once per ball that passes through them.
function fireLaser(item) {
  item.flash = 1;
  if (item.type === 'lzh') {
    beams.push({ x: 0, y: item.Y + item.Ht / 2 - 5, w: W, h: 10, life: 0.18, max: 0.18 });
    for (const br of S.bricks) if (!br.dead && !isItem(br) && br.r === item.r) dealDamage(br, S.dmg, false);
  } else {
    beams.push({ x: item.X + item.Wd / 2 - 5, y: TOP, w: 10, h: FB - TOP, life: 0.18, max: 0.18 });
    for (const br of S.bricks) if (!br.dead && !isItem(br) && br.c <= item.c && item.c < br.c + br.span) dealDamage(br, S.dmg, false);
  }
  sfx.laser();
}

function hitBrick(br, b) {
  let d = S.dmg, crit = false;
  // knockback and shards push the brick away from the ball
  const ux = br.X + br.Wd / 2 - b.x, uy = br.Y + br.Ht / 2 - b.y, ul = Math.hypot(ux, uy) || 1;
  br.kdx = ux / ul; br.kdy = uy / ul;
  if (parts.length < 600) for (let i = 0; i < 2; i++) {
    const a = Math.atan2(b.vy, b.vx) + (rnd() - 0.5) * 1.2, v = 260 + rnd() * 220;
    parts.push({ x: b.x, y: b.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.18, max: 0.22, size: 2.4, col: '#ffffff', kind: 'spark', rot: 0, vr: 0, g: 0 });
  }
  if (b.iron) d *= S.lv.iron + 1;
  if (S.lv.rush) {
    d *= 1 + b.rush * 0.25 * S.lv.rush;
    b.rush = Math.min(20, b.rush + 1);
    if (Math.hypot(b.vx, b.vy) < BAL.ballSpeed * 1.6) { b.vx *= 1.03; b.vy *= 1.03; }
  }
  if (S.lv.acid && !isItem(br)) br.acid = (br.acid || 0) + S.lv.acid;
  if (S.crit && rnd() < S.crit) { d *= 3; crit = true; }
  if (br.type === 'steel') sfx.steel(); else sfx.hit();
  dealDamage(br, d, crit);
  S.hits++;
  if (S.lv.chain > 0 && S.hits % zapEvery(S.lv.chain) === 0) zap(br);
  if (S.lv.split > 0 && !b.temp && !b.split) {
    b.split = true;
    const sp = Math.hypot(b.vx, b.vy);
    for (let k = 1; k <= S.lv.split; k++) {
      const a = Math.atan2(b.vy, b.vx) + (k % 2 ? 1 : -1) * 0.32 * Math.ceil(k / 2);
      let vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
      if (Math.abs(vy) < sp * 0.14) { vy = Math.sign(vy || -1) * sp * 0.14; vx = Math.sign(vx || 1) * Math.sqrt(sp * sp - vy * vy); }
      S.movers.push(mkBall(b.x, b.y, vx, vy, true));
    }
  }
}
