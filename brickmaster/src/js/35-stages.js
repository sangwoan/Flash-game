// Classic mode: stages of 5 levels, without end. Stage s uses landscape s (see 24-landscapes.js).
// Every level has two bosses: a sub-boss on turn 10, then the wider, tougher main boss on turn 15.
// Beating both clears the level. On the 5th level of a stage the main boss is the stage boss.
// Brick HP grows with the overall level index g, so workshop upgrades carry the player forward.
// Each stage also gets one of five brick mixes on top of the base chances in BAL.
const LEVELS_PER_STAGE = 5;
const GIMMICKS = [
  { text: '기본 규칙', mod: {} },
  { text: '레이저 아이템과 강철 벽돌이 많음', mod: { laser: 0.12, steel: 0.05 } },
  { text: '깨지면 갈라지는 슬라임이 많음', mod: { slime: 0.12, orb: 0.1 } },
  { text: '폭탄이 많고 벽돌이 빽빽함', mod: { bomb: 0.1, density: 0.06 } },
  { text: 'XP 상자와 강철 벽돌이 많음, 골드 2배', mod: { chest: 0.025, steel: 0.1 }, gold: 2 },
];
function levelInfo(g) {
  const s = Math.floor(g / LEVELS_PER_STAGE), l = g % LEVELS_PER_STAGE, G = GIMMICKS[s % GIMMICKS.length];
  return { g, s, l, id: `${s + 1}-${l + 1}`, bosses: 2, stageBoss: l === LEVELS_PER_STAGE - 1, hpMul: BAL.levelHp(g), goldMul: Math.pow(BAL.goldGrowth, g), mod: G.mod, gold: G.gold || 1, text: G.text, land: s };
}
// Endless: one long run; every boss raises the level and moves to the next landscape.
// Brick HP is scaled by the player's workshop damage multiplier, so 기본 화력 doesn't trivialise it
// (and the weekly ranking stays fair); gold pays like the furthest classic level reached.
const ENDLESS = { endless: true, id: 'ENDLESS', bosses: Infinity, hpMul: 1, goldMul: 1, mod: {}, gold: 1, land: 0 };
const endlessInfo = () => ({ ...ENDLESS, hpMul: dmgMult(SAVE.meta.power), goldMul: Math.pow(BAL.goldGrowth, SAVE.unlocked) });
const ENDLESS_UNLOCK = LEVELS_PER_STAGE; // levels cleared before endless opens
let STG = levelInfo(0);

// The boss that arrives on turn t, if any. rank: sub / main / stage (classic) or boss (endless).
function bossAt(t) {
  if (STG.endless) return t % BAL.bossEvery === 0 ? { rank: 'boss', span: 3, hpMul: BAL.bossHp } : null;
  if (t === BAL.subBossTurn) return { rank: 'sub', span: 3, hpMul: BAL.bossHp };
  if (t === BAL.mainBossTurn) return STG.stageBoss ? { rank: 'stage', span: 5, hpMul: BAL.stageBossHp } : { rank: 'main', span: 5, hpMul: BAL.mainBossHp };
  return null;
}
const isBigBoss = br => br.rank === 'main' || br.rank === 'stage';

// Spawn chance for a brick kind in the current level.
function chance(k, t) {
  const base = typeof BAL[k] === 'function' ? BAL[k](t) : BAL[k];
  return base + (STG.mod[k] || 0);
}
// Clear reward: 60 base gold (x2 the first time), inflated like everything else in the level.
const clearBonus = (L, first) => Math.round(60 * (first ? 2 : 1) * L.goldMul);
const nextLevelIndex = () => SAVE.unlocked;
