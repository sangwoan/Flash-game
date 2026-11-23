'use strict';
// Field geometry (logical units; the canvas is scaled to the screen).
const W = 420, H = 780, COLS = 7, CW = 60, RH = 36, TOP = 76, ROWS = 17;
const FB = TOP + ROWS * RH;   // red line (688): a brick reaching it costs HP
const LY = 716;               // launcher line
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rnd = Math.random;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const $ = id => document.getElementById(id);

// Balance knobs. Every tuning number lives here; t = turn number.
const BAL = {
  startBalls: 5, startHp: 3,
  ballSpeed: 760, fireGap: 0.055,
  hp: t => Math.max(1, Math.round(t * (1 + t / 12) * Math.pow(1.045, t))), // exponential tail ends runaway builds
  density: t => Math.min(0.82, 0.48 + t * 0.012),
  doubleHp: 0.15,
  bomb: t => t > 2 ? 0.06 : 0,
  chest: t => t > 3 ? 0.025 : 0,
  steel: t => t > 8 ? 0.05 : 0,
  slime: t => t > 5 ? 0.06 : 0,
  orb: 0.4,
  laser: t => t > 4 ? 0.14 : 0,
  bossEvery: 10, bossHp: 6,
  stageHp: n => 1 + 0.22 * n, // brick HP multiplier for stage n (0-based)
  xpNeed: lvl => Math.round(3 + lvl * 2 + 0.25 * Math.pow(lvl, 2.2)), // fast early levels, slow after ~15
  goldPerKill: 0.25, goldPerTurn: 1, goldBoss: 25, goldChapter: ch => ch * 15,
};

const chapterOf = t => Math.ceil(t / BAL.bossEvery);
const chapterName = ch => TH.chapters[(ch - 1) % TH.chapters.length];

// DOM
const cv = $('cv'), ctx = cv.getContext('2d');
const stage = $('stage'), wrap = $('wrap');
const titleEl = $('title'), lvlEl = $('lvl'), cardsEl = $('cards'), overEl = $('over'), reviveEl = $('revive'), shopEl = $('shop');
const recallEl = $('recall'), sndEl = $('snd');
