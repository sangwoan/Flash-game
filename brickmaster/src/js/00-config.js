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
  chapterLen: 10, // turns per chapter: boss gold grows with it and the backdrop shifts
  // A run opens with startRows rows of easy bricks. From turn doubleRowFrom on, a player who keeps
  // every brick within the top doubleRowDepth+1 rows gets two new rows at once (DOUBLE ROW), at most
  // once every doubleRowGap turns.
  startRows: 6, doubleRowFrom: 4, doubleRowDepth: 3, doubleRowGap: 3,
  // Classic bosses come on set turns, each moved by up to +-bossJitter at random: the boss on turn
  // 20 and the main boss on 40 (the 5th level of a stage: 20, 30, then the stage boss on 40).
  // Only one boss at a time: if the previous one is still alive the next waits until bossRest
  // turns after it dies. Endless sends a boss on a random turn in endlessFirst, then endlessGap
  // turns after the previous one arrived. Boss HP = that turn's brick HP x the multiplier.
  bossTurns: [20, 40], stageBossTurns: [20, 30, 40], bossJitter: 3, bossRest: 2,
  endlessFirst: [11, 14], endlessGap: [8, 10],
  // Classic levels are long (the main boss comes around turn 40), so there brick HP and row density
  // climb per turn at this fraction of the endless speed.
  classicPace: 0.58,
  bossHp: 6, mainBossHp: 9, stageBossHp: 8,
  // Number inflation (classic): brick HP and gold both grow x1.13 per level (x1.84 per stage), so the
  // numbers climb from tens into K, M, B and beyond. 기본 화력 in the workshop multiplies damage by
  // dmgStep per level to keep up.
  hpGrowth: 1.13, goldGrowth: 1.13, dmgStep: 1.25,
  // Brick HP multiplier for classic level g (0-based). Stage 1 eases in (x0.35 of the curve at 1-1)
  // so a first-time player with no upgrades gets through 1-1; from 2-1 on it is plain x1.13 per level.
  // classicHp: a run levels up 10+ times before its main boss, so classic bricks start tougher.
  levelHp: g => BAL.classicHp * Math.pow(BAL.hpGrowth, g) * Math.min(1, 0.35 + 0.13 * g),
  classicHp: 2.2,
  // v1.7: a run builds up over a long level: about LV 5 by the boss on turn 20 and LV 9 by the main
  // boss on turn 40. XP chests give a whole level.
  xpNeed: lvl => Math.round(5 + 1.5 * lvl + 0.06 * lvl * lvl),
  xpBrick: 0.38, xpSteel: 2, xpBoss: 15, xpTurnBonus: 0, // xpTurnBonus: +1 XP per that many turns (0 = off)
  goldPerKill: 0.1, goldPerTurn: 0.5, goldBoss: 25, goldChapter: ch => ch * 15,
};

const chapterOf = t => Math.ceil(t / BAL.chapterLen);
const randIn = ([a, b]) => a + Math.floor(rnd() * (b - a + 1));

// DOM
const cv = $('cv'), ctx = cv.getContext('2d');
const stage = $('stage'), wrap = $('wrap');
const titleEl = $('title'), lvlEl = $('lvl'), cardsEl = $('cards'), overEl = $('over'), shopEl = $('shop');
const recallEl = $('recall'), pauseBtn = $('pauseBtn');
