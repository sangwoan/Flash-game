// In-run upgrade cards. desc(n) describes the card at its next level n.
const zapEvery = l => Math.max(4, 10 - l * 2);
const fmtDmg = d => Number.isInteger(d) ? String(d) : d.toFixed(1);
const UPG = {
  multi:  { tag: 'BALL+3', name: '공 추가',   max: 99, col: '#3ee6ff', w: 3,   desc: () => '발사하는 공 +3개', apply() { S.balls += 3; } },
  power:  { tag: 'DMG+1',  name: '공격력',    max: 99, col: '#ff6b6b', w: 3,   desc: () => `모든 공격 피해 +1 (현재 ${fmtDmg(S.dmg)})`, apply() { S.dmg += 1; } },
  crit:   { tag: 'CRIT',   name: '치명타',    max: 4,  col: '#ffd23f', w: 2,   desc: n => `${12 * n}% 확률로 3배 피해`, apply() { S.crit = 0.12 * S.lv.crit; } },
  fire:   { tag: 'FIRE',   name: '화염탄',    max: 5,  col: '#ff8a3d', w: 2,   desc: n => `벽돌을 부수면 주변에 불꽃 폭발 (공격력 ×${n + 1})`, apply() {} },
  chain:  { tag: 'ZAP',    name: '연쇄 번개', max: 5,  col: '#a5e9ff', w: 2,   desc: n => `${zapEvery(n)}번 맞힐 때마다 번개가 벽돌 ${n + 1}개를 지짐`, apply() {} },
  pierce: { tag: 'PIERCE', name: '관통',      max: 4,  col: '#b98cff', w: 1.5, desc: n => `${15 * n}% 확률로 벽돌을 뚫고 지나감`, apply() { S.pierce = 0.15 * S.lv.pierce; } },
  split:  { tag: 'SPLIT',  name: '분열',      max: 4,  col: '#ff9be0', w: 2,   desc: n => `공이 처음 맞힐 때 ${n + 1}갈래로 갈라짐`, apply() {} },
  speed:  { tag: 'SPEED',  name: '가속',      max: 3,  col: '#7dffb0', w: 1.2, desc: n => `공 속도 +${15 * n}%`, apply() {} },
  big:    { tag: 'BIG',    name: '거대화',    max: 3,  col: '#ffffff', w: 1.2, desc: n => `공 크기 +${30 * n}%`, apply() {} },
  xp:     { tag: 'XP',     name: '학습',      max: 4,  col: '#c6ff5e', w: 1,   desc: n => `경험치 획득 +${40 * n}%`, apply() {} },
  heal:   { tag: 'HP+1',   name: '수리',      max: 99, col: '#ff4f7b', w: 1,   desc: () => '체력 +1, 최대 체력 +1', apply() { S.maxHp++; S.hp++; } },
};

// Permanent upgrades bought with gold in the workshop.
const META = {
  balls: { name: '시작 공',   desc: '시작할 때 공 +1',          max: 10, base: 40 },
  power: { name: '기본 화력', desc: '기본 공격력 +10%',         max: 10, base: 50 },
  hp:    { name: '장갑',      desc: '최대 체력 +1',             max: 3,  base: 120 },
  xp:    { name: '훈련',      desc: '경험치 획득 +10%',         max: 5,  base: 60 },
  start: { name: '선행 연구', desc: '시작할 때 능력 1개 선택',  max: 2,  base: 150 },
  gold:  { name: '수집가',    desc: '골드 획득 +15%',           max: 5,  base: 80 },
};
const metaCost = (k, l) => Math.round(META[k].base * Math.pow(1.6, l) / 5) * 5;
