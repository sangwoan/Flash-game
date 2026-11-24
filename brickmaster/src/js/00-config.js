'use strict';
// Field geometry (logical units; the canvas is scaled to the screen).
const W = 420, H = 780, COLS = 7, CW = 60, RH = 36, TOP = 76, ROWS = 17;
const FB = TOP + ROWS * RH;   // red line (688): a brick reaching it costs HP
const LY = 716;               // launcher line
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
// Big numbers: 999, 1.23K, 45.6M, 7.89B, 1.2T, then aa, ab, ac ... (each step x1000).
// Cut (not rounded) to 3 significant digits, so a balance never reads higher than it is.
const BIG = ['', 'K', 'M', 'B', 'T'];
function fmtBig(n) {
  if (!(n >= 1000)) return String(Math.max(0, Math.floor(n + 1e-9)));
  if (!isFinite(n)) return '\u221e';
  const e = Math.floor(Math.log10(n) / 3 + 1e-12), m = n / Math.pow(1000, e), d = m < 10 ? 100 : m < 100 ? 10 : 1;
  const s = e < BIG.length ? BIG[e] : String.fromCharCode(97 + Math.floor((e - BIG.length) / 26) % 26, 97 + (e - BIG.length) % 26);
  return String(Math.floor(m * d + 1e-9) / d) + s;
}
const fmtN = n => n < 1e5 ? Math.floor(n).toLocaleString('ko-KR') : fmtBig(n); // 31000 -> "31,000", 2.5e6 -> "2.5M"
const withG = s => s + (/[A-Za-z]$/.test(s) ? ' G' : 'G'); // "45,000G" but "188K G"
const fmtGold = n => withG(fmtN(n));
const fmtMul = x => x < 10 ? String(Math.round(x * 100) / 100) : x < 100 ? String(Math.round(x * 10) / 10) : fmtBig(x); // x1.13, x21.2, x9.6K
const $ = id => document.getElementById(id);

// Balance knobs. Every tuning number lives here; t = turn number.
const BAL = {
  startBalls: 5,
  ballSpeed: 760, fireGap: 0.055,
  hp: t => Math.max(1, Math.round(t * (1 + t / 12) * Math.pow(1.045, t))), // exponential tail ends runaway builds
  density: t => Math.min(0.82, 0.48 + t * 0.012),
  doubleHp: 0.15,
  bomb: t => t > 2 ? 0.06 : 0,
  chest: t => t > 3 ? 0.015 : 0,
  steel: t => t > 8 ? 0.05 : 0,
  slime: t => t > 5 ? 0.06 : 0,
  orb: 0.4,
  laser: t => t > 4 ? 0.14 : 0,
  bossEvery: 10, bossHp: 6, // endless: a boss every 10 turns. Boss HP = that turn's brick HP x bossHp
  // classic: a sub-boss (3 cells, x bossHp) on turn 10, then the main boss (5 cells wide) on turn 15
  subBossTurn: 10, mainBossTurn: 15, mainBossHp: 8, stageBossHp: 10,
  // Number inflation (classic): brick HP and gold both grow x1.13 per level (x1.84 per stage), so the
  // numbers climb from tens into K, M, B and beyond. 기본 화력 in the workshop multiplies damage by
  // dmgStep per level to keep up.
  hpGrowth: 1.13, goldGrowth: 1.13, dmgStep: 1.25,
  // Brick HP multiplier for classic level g (0-based). Stage 1 eases in from x0.5 so a first-time
  // player gets through 1-1 even with fewer level-ups; from 2-1 on it is the plain x1.13 per level.
  levelHp: g => Math.pow(BAL.hpGrowth, g) * Math.min(1, 0.5 + 0.1 * g),
  xpNeed: lvl => Math.round(6 + lvl * 5 + 0.8 * Math.pow(lvl, 2.2)),
  // XP per kill. Ordinary bricks give little; XP chests (a level each) carry the big moments.
  // v1.4: about 40% fewer level-ups than v1.3 (rarer XP chests, less XP per brick, steeper curve).
  xpBrick: 0.42, xpSteel: 2, xpBoss: 12, xpTurnBonus: 0, // xpTurnBonus: +1 XP per that many turns (0 = off)
  goldPerKill: 0.25, goldPerTurn: 1, goldBoss: 25, goldChapter: ch => ch * 15,
};

const chapterOf = t => Math.ceil(t / BAL.bossEvery);

// DOM
const cv = $('cv'), ctx = cv.getContext('2d');
const stage = $('stage'), wrap = $('wrap');
const titleEl = $('title'), lvlEl = $('lvl'), cardsEl = $('cards'), overEl = $('over'), shopEl = $('shop');
const recallEl = $('recall'), sndEl = $('snd');
