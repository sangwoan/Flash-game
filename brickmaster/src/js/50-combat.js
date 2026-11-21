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
function addGold(n, x, y) {
  S.gold += n;
  if (x !== undefined) {
    texts.push(mkText(x, y, '+' + Math.round(n) + 'G', TH.css.gold, 1.2, 12));
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
  br.hp -= d; br.flash = 1;
  if (crit) texts.push(mkText(br.X + br.Wd / 2, br.Y, 'CRIT ' + fmtDmg(Math.round(d * 10) / 10), TH.css.gold, 0.7, 9));
  if (br.hp <= 1e-6) kill(br);
}

function kill(br) {
  br.dead = true; clearCells(br);
  const cx = br.X + br.Wd / 2, cy = br.Y + br.Ht / 2, boss = br.type === 'boss';
  burst(cx, cy, brickColor(br), boss ? 70 : 14, boss ? 380 : 240);
  pops.push({ x: br.X, y: br.Y, w: br.Wd, h: br.Ht, life: 0.22, max: 0.22 });
  S.combo++; S.kills++; S.comboPulse = 1; S.maxCombo = Math.max(S.maxCombo, S.combo);
  if (S.comboMile < COMBO_MILES.length && S.combo >= COMBO_MILES[S.comboMile]) {
    bigWords.push({ s: TH.words[S.comboMile], life: 1.1, max: 1.1, y: H * 0.3, size: 16 + S.comboMile * 2 });
    S.comboMile++; shake(5); sfx.clear(); buzz(40);
  }
  if (S.combo >= 20 && !S.fever) { S.fever = true; S.flash = 0.35; S.flashCol = '255,255,255'; }
  if (!boss && rnd() < (S.fever ? 0.5 : 0.25)) flyCoin(cx, cy);
  shake(boss ? 14 : 1.6);
  sfx.brk(S.combo); buzz(boss ? 60 : 8);
  const bonus = Math.floor(S.turn / 10);
  if (boss) {
    gainXp(25);
    S.bosses++; S.hitstop = 0.16; S.flash = 0.6; S.flashCol = '255,255,255';
    addGold(BAL.goldBoss + BAL.goldChapter(br.chapter), cx, cy);
    showBanner(`CHAPTER ${br.chapter} CLEAR`, '보스 격파! 다음 챕터로', TH.css.gold);
    sfx.clear();
  } else if (br.type === 'steel') { gainXp(3 + bonus); addGold(2, cx, cy); }
  else { gainXp(1 + bonus); addGold(BAL.goldPerKill); }
  if (br.type === 'bomb') S.blasts.push({ x: cx, y: cy, rad: CW * 1.6, dmg: Math.ceil(S.turn * 1.5) + S.dmg * 2, kind: 'bomb', t: 0.06 });
  if (br.type === 'chest') { S.pendingLevels++; texts.push(mkText(cx, cy, '+LV', TH.css.gold, 1, 14)); sfx.lvl(); }
  if (br.type === 'slime') splitSlime(br);
  if (S.lv.fire > 0) S.blasts.push({ x: cx, y: cy, rad: CW * 1.15, dmg: S.dmg * (1 + S.lv.fire), kind: 'fire', t: 0.07 });
}

// A slime splits into up to two small bricks in free neighbouring cells.
function splitSlime(br) {
  const cand = [[br.r, br.c - 1], [br.r, br.c + 1], [br.r + 1, br.c], [br.r - 1, br.c]]
    .filter(([r, c]) => r >= 0 && r < ROWS - 1 && c >= 0 && c < COLS && !grid[r * COLS + c]);
  let n = 0;
  for (const [r, c] of cand) {
    if (n >= 2) break;
    const X = c * CW + 2, Y = TOP + r * RH + 2;
    if (S.movers.some(b => b.x + b.r > X && b.x - b.r < X + CW - 4 && b.y + b.r > Y && b.y - b.r < Y + RH - 4)) continue;
    const kid = addBrick({ c, r, span: 1, type: 'n', hp: Math.max(1, Math.ceil(br.maxHp / 3)) }, false);
    kid.flash = 1; n++;
  }
  if (n) { sfx.slime(); burst(br.X + br.Wd / 2, br.Y + br.Ht / 2, '#7dffb0', 10, 160); }
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
      if (dx * dx + dy * dy <= (b.rad * 0.55) ** 2) dealDamage(br, b.dmg, false);
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
    dealDamage(b, S.dmg * 2, false);
    px = tx; py = ty;
  }
  if (cand.length) sfx.zap();
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
