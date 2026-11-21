// Run state, the brick grid and row spawning.
let S, uid = 0;
const grid = new Array(COLS * ROWS).fill(null);
let parts = [], rings = [], bolts = [], texts = [], beams = [], homers = [], pops = [], bigWords = [], flyers = [];

// Items sit in a cell like a brick, but balls pass through them.
const ITEMS = { orb: 1, lzh: 1, lzv: 1 };
const isItem = br => ITEMS[br.type] === 1;

function newRun() {
  const lv = {}; Object.keys(UPG).forEach(k => lv[k] = 0);
  const m = SAVE.meta;
  S = {
    phase: 'aim', turn: 1, hp: BAL.startHp + m.hp, maxHp: BAL.startHp + m.hp,
    level: 0, xp: 0, xpNeed: BAL.xpNeed(0), pendingLevels: m.start,
    balls: BAL.startBalls + m.balls, orbsGot: 0, launchX: W / 2, nextLaunchX: null,
    aim: { x: 0, y: -1 }, aimOk: false, aiming: false,
    bricks: [], movers: [], toFire: 0, fireTimer: 0, turnTime: 0, timeScale: 1, blasts: [],
    dmg: 1 + 0.1 * m.power, crit: 0, pierce: 0, xpBase: 1 + 0.1 * m.xp, lv,
    combo: 0, maxCombo: 0, hits: 0, kills: 0, bosses: 0, gold: 0, comboPulse: 0,
    shake: 0, flash: 0, flashCol: '255,255,255', hitstop: 0, dieTimer: 0,
    revived: false, banner: null,
    fever: false, comboMile: 0, kick: 0, goldBump: 0, xpFlash: 0, lvlT: 0,
  };
  grid.fill(null); parts = []; rings = []; bolts = []; texts = []; beams = []; homers = []; pops = []; bigWords = []; flyers = [];
  for (let i = 0; i < 3; i++) { shiftDown(false); rebuildGrid(); spawnRow(1, false); }
  rebuildGrid();
}

const ballR = () => 6 * (1 + 0.3 * S.lv.big);

function setRect(br) { br.X = br.c * CW + 2; br.Y = TOP + br.r * RH + 2; br.Wd = br.span * CW - 4; br.Ht = RH - 4; }
function addBrick(o, slide) {
  const br = Object.assign({ maxHp: o.hp, dead: false, flash: 0, oy: slide ? -RH : 0, id: ++uid }, o);
  setRect(br); S.bricks.push(br);
  for (let k = 0; k < br.span; k++) grid[br.r * COLS + br.c + k] = br;
  return br;
}
function clearCells(br) {
  for (let k = 0; k < br.span; k++) if (grid[br.r * COLS + br.c + k] === br) grid[br.r * COLS + br.c + k] = null;
}
function rebuildGrid() {
  grid.fill(null);
  for (const br of S.bricks) if (!br.dead && br.r < ROWS) for (let k = 0; k < br.span; k++) grid[br.r * COLS + br.c + k] = br;
}
function shiftDown(slide) {
  for (const br of S.bricks) if (!br.dead) { br.r++; if (slide) br.oy = -RH; setRect(br); }
}

function spawnRow(t, slide = true) {
  const h = BAL.hp(t), used = new Array(COLS).fill(false);
  if (t % BAL.bossEvery === 0) {
    const c = Math.floor(rnd() * (COLS - 2));
    addBrick({ c, r: 0, span: 3, type: 'boss', hp: h * BAL.bossHp, chapter: chapterOf(t) }, slide);
    used[c] = used[c + 1] = used[c + 2] = true;
    showBanner('BOSS', `챕터 ${chapterOf(t)} 보스가 나타났다`, TH.css.hot);
    sfx.boss();
  }
  let placed = 0;
  for (let c = 0; c < COLS; c++) {
    if (used[c] || rnd() > BAL.density(t)) continue;
    let type = 'n', hp = rnd() < BAL.doubleHp ? h * 2 : h, acc = 0;
    const r = rnd();
    if (r < (acc += BAL.bomb(t))) { type = 'bomb'; hp = Math.ceil(h * 0.6); }
    else if (r < (acc += BAL.chest(t))) { type = 'chest'; hp = h * 2; }
    else if (r < (acc += BAL.steel(t))) { type = 'steel'; hp = h * 3; }
    else if (r < (acc += BAL.slime(t))) { type = 'slime'; hp = Math.ceil(h * 1.2); }
    addBrick({ c, r: 0, span: 1, type, hp }, slide); used[c] = true; placed++;
  }
  const free = [];
  for (let c = 0; c < COLS; c++) if (!used[c]) free.push(c);
  const take = () => free.splice(Math.floor(rnd() * free.length), 1)[0];
  while (placed < 2 && t % BAL.bossEvery !== 0 && free.length > 1) { addBrick({ c: take(), r: 0, span: 1, type: 'n', hp: h }, slide); placed++; }
  if (free.length && rnd() < BAL.orb) addBrick({ c: take(), r: 0, span: 1, type: 'orb', hp: 1 }, slide);
  if (free.length && rnd() < BAL.laser(t)) addBrick({ c: take(), r: 0, span: 1, type: rnd() < 0.5 ? 'lzh' : 'lzv', hp: 1 }, slide);
}

// ---------- fx helpers ----------
function mkText(x, y, s, col, life = 0.9, size = 12) { return { x, y, s, col, life, max: life, size, vy: -40 }; }
// Particle look follows the theme: squares, confetti, sparks, coins or comic shards.
function burst(x, y, col, n, spd = 220) {
  const kind = TH.particle;
  if (typeof col !== 'string') col = TH.accent;
  for (let i = 0; i < n && parts.length < 700; i++) {
    const a = rnd() * Math.PI * 2, v = spd * (0.3 + rnd());
    const p = { x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.4 + rnd() * 0.4, max: 0.8, size: 2 + rnd() * 3, col, kind, rot: rnd() * 6.3, vr: (rnd() - 0.5) * 24, g: 700 };
    if (kind === 'confetti') { p.size = 4 + rnd() * 4; p.g = 260; p.life += 0.4; p.max = 1.2; if (rnd() < 0.65) p.col = TH.confetti[Math.floor(rnd() * TH.confetti.length)]; }
    else if (kind === 'coin') { if (rnd() < 0.5) { p.kind = 'coin'; p.size = 3 + rnd() * 2; } else p.kind = 'square'; }
    else if (kind === 'spark') { p.g = 120; p.size = 2 + rnd() * 2; p.vx *= 1.4; p.vy *= 1.4; }
    else if (kind === 'shard') { p.size = 3 + rnd() * 5; p.g = 900; }
    parts.push(p);
  }
}
function shake(a) { S.shake = Math.min(14, S.shake + a * (RM ? 0.25 : 1)); }
function showBanner(title, sub, col) { S.banner = { title, sub, col, life: 2, max: 2 }; }
