// In-run upgrade cards. desc(n) describes the card at its next level n.
const zapEvery = l => Math.max(4, 10 - l * 2);
const fmtDmg = d => d >= 100 ? fmtBig(d) : String(Math.round(d * 10) / 10);
const UPG = {
  multi:  { tag: 'BALL+3', name: '공 추가',   max: 99, col: '#3ee6ff', w: 3,   desc: () => '발사하는 공 +3개', apply() { S.balls += 3; } },
  power:  { tag: 'DMG+',   name: '공격력',    max: 99, col: '#ff6b6b', w: 3,   desc: () => `모든 공격 피해 +${fmtDmg(S.unit)} (현재 ${fmtDmg(S.dmg)})`, apply() { S.dmg += S.unit; } },
  crit:   { tag: 'CRIT',   name: '치명타',    max: 4,  col: '#ffd23f', w: 2,   desc: n => `${12 * n}% 확률로 3배 피해`, apply() { S.crit = 0.12 * S.lv.crit; } },
  fire:   { tag: 'FIRE',   name: '화염탄',    max: 5,  col: '#ff8a3d', w: 2,   desc: n => `벽돌을 부수면 주변에 불꽃 폭발 (공격력 ×${n + 1})`, apply() {} },
  chain:  { tag: 'ZAP',    name: '연쇄 번개', max: 5,  col: '#a5e9ff', w: 2,   desc: n => `${zapEvery(n)}번 맞힐 때마다 가까운 벽돌 ${n + 1}개에 번개가 떨어짐`, apply() {} },
  pierce: { tag: 'PIERCE', name: '관통',      max: 4,  col: '#b98cff', w: 1.5, desc: n => `${15 * n}% 확률로 벽돌을 뚫고 지나감`, apply() { S.pierce = 0.15 * S.lv.pierce; } },
  split:  { tag: 'SPLIT',  name: '분열',      max: 4,  col: '#ff9be0', w: 2,   desc: n => `공이 처음 맞힐 때 ${n + 1}갈래로 갈라짐`, apply() {} },
  rush:   { tag: 'RUSH',   name: '폭주',      max: 4,  col: '#ff6a3d', w: 2,   desc: n => `벽돌을 맞힐 때마다 그 공의 피해 +${12 * n}%, 속도도 빨라짐`, apply() {} },
  iron:   { tag: 'IRON',   name: '철구',      max: 3,  col: '#b8c2d9', w: 1.6, desc: n => `매 턴 ${n >= 3 ? '처음 두 공이' : '첫 공이'} 쇠공이 되어 벽돌을 모두 뚫고 ${n + 2}배 피해`, apply() {} },
  encore: { tag: 'ENCORE', name: '앙코르',    max: 3,  col: '#ffe14d', w: 1.6, desc: n => `공이 모두 돌아오면 ${15 * n}% 확률로 같은 방향으로 한 번 더 발사`, apply() {} },
  bounce: { tag: 'BOUNCE', name: '바운스 패드', max: 3, col: '#5effa8', w: 1.8, desc: n => `바닥에 닿은 공이 ${n}번 더 튕겨 오름`, apply() {} },
  acid:   { tag: 'ACID',   name: '부식',      max: 4,  col: '#a6ff3d', w: 1.8, desc: n => `맞힐 때마다 부식이 ${n}씩 쌓이고, 턴이 끝날 때 쌓인 만큼 한꺼번에 피해`, apply() {} },
  xp:     { tag: 'XP',     name: '학습',      max: 4,  col: '#c6ff5e', w: 1,   desc: n => `경험치 획득 +${40 * n}%`, apply() {} },
};

// Card icons: 24x24 stroke paths drawn in the card's colour circle.
const ICONS = {
  multi: '<circle cx="7" cy="16" r="3.2"/><circle cx="17" cy="16" r="3.2"/><circle cx="12" cy="7" r="3.2"/>',
  power: '<path d="M14.5 3.5h6v6l-9.5 9.5-6-6z"/><path d="M4 16l4 4M2.5 21.5l3-3"/>',
  crit: '<circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5"/><circle cx="12" cy="12" r="1.2"/>',
  fire: '<path d="M12 2.5c1 4 6.5 6 6.5 11.5a6.5 6.5 0 0 1-13 0c0-3 2-4.5 2.2-7.5 2 1.2 3 3 3 5 1.3-2 1.6-5.6 1.3-9z"/>',
  chain: '<path d="M13.5 2L5 13.5h6.5L10 22l9-12h-6.5z"/>',
  pierce: '<rect x="9" y="4.5" width="6" height="15" rx="1.5"/><path d="M1.5 12h21M18.5 8l4 4-4 4"/>',
  split: '<path d="M12 22v-9M12 13L6 4.5M12 13l6-8.5M3.5 6.5L6 4.5l2.2 2.3M20.5 6.5L18 4.5l-2.2 2.3"/>',
  rush: '<path d="M3 17c4 0 5-3 8-3s4 3 8 3M3 11c4 0 5-3 8-3s4 3 8 3"/><path d="M17 4l3 3-3 3"/>',
  iron: '<circle cx="12" cy="12" r="8.5"/><path d="M8 9.5a4.5 4.5 0 0 1 4-3"/><path d="M3.5 12h-2M22.5 12h-2"/>',
  encore: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7M20 3.5v5.2h-5.2"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3M4 20.5v-5.2h5.2"/>',
  bounce: '<path d="M2.5 19.5h19"/><path d="M5 19.5l2-4h10l2 4"/><circle cx="12" cy="6.5" r="3"/><path d="M12 10.5v2"/>',
  acid: '<path d="M12 2.8s-6 6.6-6 11a6 6 0 0 0 12 0c0-4.4-6-11-6-11z"/><path d="M9.5 15a2.5 2.5 0 0 0 2.5 2.5"/>',
  shield: '<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  xp: '<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/>',
  heal: '<path d="M12 20.5s-8-4.8-8-10.8a4.4 4.4 0 0 1 8-2.6 4.4 4.4 0 0 1 8 2.6c0 6-8 10.8-8 10.8z"/><path d="M12 9v6.5M8.8 12.2h6.4"/>',
};

// The one-off shield that can be offered once per run (rewarded-ad placeholder).
const SHIELD_COL = '#6ec8ff';

// Permanent upgrades bought with gold in the workshop. Each next level costs the last price times a
// step that itself grows (r0, r0 + dr, r0 + 2dr ...), so prices climb faster and faster. 기본 화력
// has no cap: multiplying damage is how the player keeps up with inflating brick HP.
const dmgMult = P => Math.pow(BAL.dmgStep, P);
const META = {
  balls: { name: '시작 공',   max: 10,       base: 60,   r0: 3,    dr: 0.3, desc: l => `시작할 때 공 +1 (지금 ${BAL.startBalls + l}개)` },
  power: { name: '기본 화력', max: Infinity, base: 200,  r0: 1.32, dr: 0,   desc: l => `공격력 ×${BAL.dmgStep}씩 곱해짐 (지금 ×${fmtMul(dmgMult(l))})` },
  xp:    { name: '훈련',      max: 5,        base: 250,  r0: 4,    dr: 1,   desc: l => `경험치 획득 +10% (지금 +${10 * l}%)` },
  start: { name: '선행 연구', max: 2,        base: 8000, r0: 50,   dr: 0,   desc: l => `시작할 때 능력 1개 선택 (지금 ${l}개)` },
  gold:  { name: '수집가',    max: 5,        base: 300,  r0: 4,    dr: 1,   desc: l => `골드 획득 +15% (지금 +${15 * l}%)` },
};
// Prices keep 3 significant digits (5G steps under 1,000), so the price shown is the price paid.
const niceCost = c => c < 1000 ? Math.max(5, Math.round(c / 5) * 5) : (p => Math.round(c / p) * p)(Math.pow(10, Math.floor(Math.log10(c)) - 2));
function metaCost(k, l) { const m = META[k]; let c = m.base; for (let i = 0; i < l; i++) c *= m.r0 + m.dr * i; return niceCost(c); }
