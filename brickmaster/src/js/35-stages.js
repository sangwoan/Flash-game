// Stage map: 5 worlds x 4 stages. A stage is cleared by killing its bosses (one every 10 turns).
// Later stages scale brick HP, so permanent upgrades from the workshop carry the player forward.
// Each world adds its own brick mix on top of the base chances in BAL.
const WORLD_MODS = [
  { text: '기본 규칙', mod: {} },
  { text: '레이저 아이템과 강철 벽돌이 많음', mod: { laser: 0.12, steel: 0.05 } },
  { text: '깨지면 갈라지는 슬라임이 많음', mod: { slime: 0.12, orb: 0.1 } },
  { text: '폭탄이 많고 벽돌이 빽빽함', mod: { bomb: 0.1, density: 0.06 } },
  { text: 'XP 상자와 강철 벽돌이 많음, 골드 2배', mod: { chest: 0.05, steel: 0.1 }, gold: 2 },
];
const STAGES_PER_WORLD = 4;
const STAGE_BOSSES = [1, 1, 2, 3];
const STAGES = [];
WORLD_ORDER.forEach((world, w) => {
  for (let i = 0; i < STAGES_PER_WORLD; i++) {
    const n = w * STAGES_PER_WORLD + i;
    STAGES.push({
      n, w, i, world, id: `${w + 1}-${i + 1}`, bosses: STAGE_BOSSES[i],
      hpMul: BAL.stageHp(n), mod: WORLD_MODS[w].mod, gold: WORLD_MODS[w].gold || 1, text: WORLD_MODS[w].text,
    });
  }
});
// Endless: no goal, worlds rotate every BOSSES_PER_WORLD bosses. Opens after clearing world 1.
const ENDLESS = { endless: true, id: 'ENDLESS', bosses: Infinity, hpMul: 1, mod: {}, gold: 1, w: 0, world: 'neon' };
const ENDLESS_UNLOCK = STAGES_PER_WORLD; // stages cleared
let STG = STAGES[0];

// Spawn chance for a brick kind in the current stage.
function chance(k, t) {
  const base = typeof BAL[k] === 'function' ? BAL[k](t) : BAL[k];
  return base + (STG.mod[k] || 0);
}
const clearBonus = (s, first) => Math.round((30 + 12 * s.n) * (first ? 2 : 1));
const nextStageIndex = () => Math.min(SAVE.unlocked, STAGES.length - 1);
