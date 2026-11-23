// Design drafts (v0.8): three refined art directions x five calm, painted worlds.
// A direction sets bricks, type, particles and UI; a world sets the backdrop and palette.
// Preview with #glass / #clay / #flat (whole game) or #clay-blossom (one world on the title).

const HEAL_FONT = {
  outfit: '"Outfit", "IBM Plex Sans KR", system-ui, sans-serif',
  fredoka: '"Fredoka", "Jua", system-ui, sans-serif',
  sora: '"Sora", "IBM Plex Sans KR", system-ui, sans-serif',
  plex: '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  jua: '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
};

// ---------- painting helpers ----------
function hill(g, base, amp, freq, phase, col) {
  g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 6) g.lineTo(x, base + Math.sin(x * freq + phase) * amp + Math.sin(x * freq * 2.3 + phase * 1.7) * amp * 0.35);
  g.lineTo(W, H); g.closePath(); g.fill();
}
function vgrad(g, y0, y1, stops) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  return gr;
}
function softBlob(g, x, y, rx, ry, col, a) {
  g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(rx / ry, 1);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, ry);
  gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, ry, 0, Math.PI * 2); g.fill(); g.restore();
}
function cloudBank(g, y, r, col, seed) {
  g.fillStyle = col; g.beginPath();
  for (let x = -r; x < W + r; x += r * 0.9) { const rr = r * (0.75 + ((x * 13 + seed) % 7) / 14); g.moveTo(x + rr, y); g.arc(x, y, rr, 0, Math.PI * 2); }
  g.rect(0, y, W, H - y); g.fill();
}
const wrapN = (v, m) => ((v % m) + m) % m;

// ---------- the five worlds ----------
const HEAL_WORLDS = {
  dawn: {
    name: '새벽 호수', tag: 'DAWN LAKE', light: true,
    chapters: ['물안개 호숫가', '고요한 섬', '은빛 갈대밭', '첫 햇살', '잔잔한 물결'],
    ramp: ['#7fcfe0', '#8fa8ee', '#b59af0', '#f29ac2', '#f7b98a'], accent: '#7a8cf0', accent2: '#f29ac2',
    paint(g, now) {
      g.drawImage(cachedLayer('heal-dawn', c => {
        c.fillStyle = vgrad(c, 0, H * 0.58, ['#a9b9f3', '#e5c8ee', '#ffe1c4']); c.fillRect(0, 0, W, H * 0.58);
        softBlob(c, W * 0.66, H * 0.56, 120, 120, '#fff4dc', 0.9);
        c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(W * 0.66, H * 0.56, 26, 0, Math.PI * 2); c.fill();
        softBlob(c, W * 0.2, H * 0.18, 120, 26, '#ffffff', 0.5); softBlob(c, W * 0.75, H * 0.27, 100, 20, '#ffffff', 0.4);
        hill(c, H * 0.5, 26, 0.013, 1, '#c9bde9'); hill(c, H * 0.55, 16, 0.02, 3, '#ab9fdc');
        c.fillStyle = vgrad(c, H * 0.58, H, ['#dcd9f5', '#b8c5ee', '#97ade2']); c.fillRect(0, H * 0.58, W, H * 0.42);
        c.save(); c.globalAlpha = 0.25; c.translate(0, H * 1.16); c.scale(1, -1); hill(c, H * 0.55, 16, 0.02, 3, '#ab9fdc'); c.restore();
      }), 0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.5)';
      for (let i = 0; i < 9; i++) { const w = 60 - i * 5 + Math.sin(now / 500 + i) * 14; g.fillRect(W * 0.66 - w / 2, H * 0.6 + i * 11, w, 2); }
      for (let i = 0; i < 22; i++) {
        const x = wrapN(i * 97 + Math.sin(now / 2600 + i) * 18, W), y = wrapN(H * 0.1 + i * 53 - now * 0.008 * (1 + i % 3), H * 0.8);
        g.globalAlpha = 0.35 + 0.35 * Math.sin(now / 700 + i); softBlob(g, x, y, 5, 5, '#fff6d8', 1);
      }
      g.globalAlpha = 1;
    },
  },
  blossom: {
    name: '벚꽃 언덕', tag: 'BLOSSOM HILL', light: true,
    chapters: ['꽃길 산책', '분홍 언덕', '햇살 정원', '바람의 들판', '꽃비 내리는 밤'],
    ramp: ['#8ad9b8', '#7fc4ea', '#a99cf0', '#f28fb0', '#f7a982'], accent: '#ef7fa6', accent2: '#7fc4ea',
    paint(g, now) {
      g.drawImage(cachedLayer('heal-blossom', c => {
        c.fillStyle = vgrad(c, 0, H, ['#ffe0ea', '#fff0e4', '#fff7ee']); c.fillRect(0, 0, W, H);
        softBlob(c, W * 0.3, H * 0.16, 160, 40, '#ffffff', 0.7); softBlob(c, W * 0.8, H * 0.3, 120, 30, '#ffffff', 0.6);
        hill(c, H * 0.58, 22, 0.012, 0.5, '#d6eed8'); hill(c, H * 0.67, 18, 0.016, 2, '#bfe5c6'); hill(c, H * 0.79, 14, 0.02, 4, '#a7dab3');
        const tree = (x, y, s) => {
          c.strokeStyle = '#a07a6a'; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 34 * s); c.stroke();
          for (let k = 0; k < 7; k++) { c.fillStyle = k % 2 ? '#ffc4d6' : '#ffadc8'; c.beginPath(); c.arc(x + Math.cos(k * 0.9) * 16 * s, y - 40 * s + Math.sin(k * 1.7) * 9 * s, 13 * s, 0, Math.PI * 2); c.fill(); }
        };
        tree(W * 0.12, H * 0.66, 1); tree(W * 0.3, H * 0.7, 0.8); tree(W * 0.82, H * 0.64, 1.1); tree(W * 0.62, H * 0.76, 0.9);
        for (let i = 0; i < 60; i++) { c.fillStyle = i % 3 ? '#ffffff' : '#ffd1e0'; c.beginPath(); c.arc(wrapN(i * 71, W), H * 0.8 + (i * 37) % (H * 0.2), 1.8, 0, Math.PI * 2); c.fill(); }
      }), 0, 0, W, H);
      for (let i = 0; i < 34; i++) {
        const x = wrapN(i * 137 + now * 0.018 * (1 + i % 3) + Math.sin(now / 900 + i) * 14, W + 40) - 20;
        const y = wrapN(i * 91 + now * 0.035 * (1 + i % 4), H + 40) - 20;
        g.save(); g.translate(x, y); g.rotate(now / 600 + i); g.scale(1, 0.55 + 0.45 * Math.sin(now / 300 + i));
        g.fillStyle = i % 2 ? '#ffb7cf' : '#ffd3e1'; g.beginPath(); g.ellipse(0, 0, 4.5, 3, 0, 0, Math.PI * 2); g.fill(); g.restore();
      }
    },
  },
  coral: {
    name: '산호 바다', tag: 'CORAL SEA', light: true,
    chapters: ['얕은 물빛', '산호 정원', '해파리 길', '깊은 푸름', '진주 동굴'],
    ramp: ['#6fe0cf', '#5cbdf0', '#7d9cf5', '#f48fb8', '#ffad7a'], accent: '#2fb5c8', accent2: '#f48fb8',
    paint(g, now) {
      g.drawImage(cachedLayer('heal-coral', c => {
        c.fillStyle = vgrad(c, 0, H, ['#c8f4ef', '#86d8dc', '#4fa9c4', '#2f7aa8']); c.fillRect(0, 0, W, H);
        hill(c, H * 0.86, 10, 0.018, 1, '#f1ddb4'); hill(c, H * 0.9, 7, 0.025, 3, '#e8cf9f');
        const coral = (x, y, col, s) => { c.fillStyle = col; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(x + (k - 2.5) * 7 * s, y - Math.abs(Math.sin(k * 1.3)) * 30 * s - 6 * s, 7 * s, 0, Math.PI * 2); c.fill(); c.fillRect(x + (k - 2.5) * 7 * s - 2 * s, y - Math.abs(Math.sin(k * 1.3)) * 30 * s - 6 * s, 4 * s, 34 * s); } };
        coral(W * 0.12, H * 0.9, '#ff9fb8', 1); coral(W * 0.36, H * 0.92, '#ffb48a', 0.8); coral(W * 0.7, H * 0.9, '#c7a0ff', 1); coral(W * 0.9, H * 0.92, '#ff9fb8', 0.7);
      }), 0, 0, W, H);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const x = W * (0.1 + i * 0.22) + Math.sin(now / 3000 + i) * 24;
        const gr = g.createLinearGradient(0, 0, 0, H * 0.8); gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(x - 14, 0); g.lineTo(x + 14, 0); g.lineTo(x + 70, H * 0.8); g.lineTo(x + 10, H * 0.8); g.fill();
      }
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2;
      for (let i = 0; i < 22; i++) {
        const y = H - wrapN(i * 71 + now * 0.04 * (1 + i % 3), H), x = wrapN(i * 53, W) + Math.sin(now / 600 + i) * 6;
        g.beginPath(); g.arc(x, y, 2 + i % 4, 0, Math.PI * 2); g.stroke();
      }
      for (let i = 0; i < 4; i++) { // seaweed
        const bx = W * (0.05 + i * 0.3);
        g.strokeStyle = '#3fae8c'; g.lineWidth = 4; g.beginPath(); g.moveTo(bx, H);
        for (let k = 1; k <= 6; k++) g.lineTo(bx + Math.sin(now / 800 + k + i) * 6 * k / 3, H - k * 18);
        g.stroke();
      }
    },
  },
  aurora: {
    name: '오로라 설원', tag: 'AURORA FIELD', light: false,
    chapters: ['별빛 설원', '침엽수 숲', '얼음 호수', '북쪽 하늘', '오로라의 끝'],
    ramp: ['#6ff2c6', '#62cdf5', '#8a9cff', '#c38cff', '#ff8fcf'], accent: '#6ff2c6', accent2: '#c38cff',
    paint(g, now) {
      g.drawImage(cachedLayer('heal-aurora', c => {
        c.fillStyle = vgrad(c, 0, H, ['#0a1430', '#172c58', '#2b4a7c']); c.fillRect(0, 0, W, H);
        for (let i = 0; i < 90; i++) { c.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) / 8})`; c.fillRect(wrapN(i * 89, W), (i * 47) % (H * 0.6), 1.4, 1.4); }
        hill(c, H * 0.8, 14, 0.014, 2, '#cfdcf2'); hill(c, H * 0.86, 10, 0.02, 5, '#e6eefa');
        c.fillStyle = '#132a48';
        for (let i = 0; i < 11; i++) { const x = W * (i / 10) + (i % 2) * 12, y = H * 0.82, s = 0.7 + (i % 3) * 0.25; c.beginPath(); c.moveTo(x, y - 54 * s); c.lineTo(x + 16 * s, y); c.lineTo(x - 16 * s, y); c.fill(); }
      }), 0, 0, W, H);
      g.save(); g.globalCompositeOperation = 'lighter';
      [['#6ff2c6', 0], ['#62cdf5', 1.3], ['#c38cff', 2.6]].forEach(([col, k]) => {
        const gr = g.createLinearGradient(0, 0, 0, 130); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        for (let x = 0; x < W; x += 5) {
          const y = H * 0.18 + Math.sin(x * 0.011 + now / 2400 + k) * 34 + k * 20;
          g.globalAlpha = 0.07 + 0.05 * Math.sin(x * 0.03 + now / 900 + k);
          g.translate(x, y); g.fillRect(0, 0, 5, 130); g.translate(-x, -y);
        }
      });
      g.restore(); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.85)';
      for (let i = 0; i < 40; i++) { const x = wrapN(i * 61 + Math.sin(now / 1200 + i) * 16, W), y = wrapN(i * 97 + now * 0.03 * (1 + i % 3), H); g.beginPath(); g.arc(x, y, 1 + i % 3 * 0.6, 0, Math.PI * 2); g.fill(); }
    },
  },
  sunset: {
    name: '노을 구름', tag: 'SUNSET CLOUDS', light: true,
    chapters: ['구름 위 산책', '분홍 노을', '바람의 섬', '금빛 하늘', '별이 뜨는 시간'],
    ramp: ['#ffcf7a', '#ffa98a', '#ff8fa6', '#e08fd0', '#9d8cf5'], accent: '#f2789a', accent2: '#9d8cf5',
    paint(g, now) {
      g.drawImage(cachedLayer('heal-sunset', c => {
        c.fillStyle = vgrad(c, 0, H * 0.75, ['#7b73ea', '#c98bd9', '#ff9fb0', '#ffd49c']); c.fillRect(0, 0, W, H);
        softBlob(c, W * 0.5, H * 0.62, 150, 150, '#fff0c8', 0.85);
        c.fillStyle = '#fff4d8'; c.beginPath(); c.arc(W * 0.5, H * 0.62, 34, 0, Math.PI * 2); c.fill();
        softBlob(c, W * 0.25, H * 0.2, 140, 22, '#ffd6e6', 0.6); softBlob(c, W * 0.78, H * 0.34, 120, 18, '#ffe2d0', 0.6);
        cloudBank(c, H * 0.68, 26, '#ffd8cc', 3); cloudBank(c, H * 0.76, 30, '#ffc2cf', 7); cloudBank(c, H * 0.86, 34, '#f4aacb', 11);
      }), 0, 0, W, H);
      g.strokeStyle = 'rgba(90,60,120,.55)'; g.lineWidth = 1.6;
      for (let i = 0; i < 5; i++) {
        const x = wrapN(i * 90 + now * 0.012, W + 60) - 30, y = H * (0.3 + i * 0.05) + Math.sin(now / 900 + i) * 6, f = 4 + Math.sin(now / 200 + i) * 2;
        g.beginPath(); g.moveTo(x - 7, y - f); g.quadraticCurveTo(x - 3, y - 1, x, y); g.quadraticCurveTo(x + 3, y - 1, x + 7, y - f); g.stroke();
      }
    },
  },
};
const HEAL_ORDER = ['dawn', 'blossom', 'coral', 'aurora', 'sunset'];

// ---------- the three directions ----------
const DIRECTIONS = {
  glass: { name: '소프트 글래스', brick: 'frost', disp: HEAL_FONT.outfit, dw: '800', dsz: 1.35, num: HEAL_FONT.outfit, numSize: 15, numWeight: '700', ko: HEAL_FONT.plex, particle: 'dust', wordStyle: 'clean', words: ['NICE', 'GREAT', 'EXCELLENT', 'UNREAL', 'LEGENDARY'] },
  clay: { name: '말랑 클레이', brick: 'clay', disp: HEAL_FONT.fredoka, dw: '700', dsz: 1.45, num: HEAL_FONT.fredoka, numSize: 16, numWeight: '700', ko: HEAL_FONT.jua, particle: 'confetti', wordStyle: 'bubble', words: ['NICE!', 'YAY!', 'AWESOME!', 'AMAZING!', 'MAGICAL!'] },
  flat: { name: '미니멀 플랫', brick: 'flat', disp: HEAL_FONT.sora, dw: '800', dsz: 1.3, num: HEAL_FONT.sora, numSize: 14, numWeight: '700', ko: HEAL_FONT.plex, particle: 'spark', wordStyle: 'plain', words: ['NICE', 'GREAT', 'SUPERB', 'BRILLIANT', 'PERFECT'] },
};

function makeHealTheme(dirId, worldId) {
  const d = DIRECTIONS[dirId], w = HEAL_WORLDS[worldId], L = w.light;
  const ink = L ? '#2c2a4a' : '#f2f4ff', dim = L ? '#6b6890' : '#a8b3d6';
  return {
    id: `${dirId}-${worldId}`, dir: dirId, healWorld: worldId,
    name: w.name, tag: w.tag, line: `${d.name} · ${w.name}`, chapters: w.chapters,
    num: d.num, numSize: d.numSize, numWeight: d.numWeight, disp: d.disp, dw: d.dw, dsz: d.dsz, ko: d.ko, crt: false, light: L,
    css: {
      bg: L ? '#f6f1fb' : '#0b1430', panel: L ? 'rgba(255,255,255,.86)' : 'rgba(22,34,70,.88)', line: L ? 'rgba(80,70,140,.18)' : 'rgba(170,190,255,.22)',
      ink, dim, gold: '#f2a541', hot: '#ff6b8b', cool: w.accent, ov: L ? 'rgba(248,244,255,.72)' : 'rgba(10,18,44,.72)', btnInk: '#ffffff', logo2: w.accent2,
    },
    hud: { bg: L ? 'rgba(255,255,255,.55)' : 'rgba(10,18,44,.5)', line: L ? 'rgba(80,70,140,.12)' : 'rgba(170,190,255,.15)', ink, dim, accent: '#f2a541', xpBg: L ? 'rgba(80,70,140,.12)' : 'rgba(170,190,255,.15)', xp: w.accent, heart: '#ff6b8b', heartOff: 'rgba(120,110,160,.3)', ch: w.accent },
    outline: L ? '#ffffff' : '#0b1430', brick: d.brick, numInk: 'auto', heartStyle: 'vector',
    ramp: rampOf(w.ramp),
    special: { bomb: '#ff6b81', chest: '#ffc857', steel: '#9aa6bd', slime: '#7bd88f', boss: [w.accent, w.accent2] },
    ball: { core: '#ffffff', glow: w.accent, temp: w.accent2 }, particle: d.particle, confetti: w.ramp.concat(['#ffffff']),
    words: d.words, wordStyle: d.wordStyle, accent: w.accent, fever: '#f2a541', line2: '#ff6b8b',
    field(g, now) { w.paint(g, now); },
  };
}
// '#clay' restyles every world; old world ids map onto the calm worlds in order.
let PREVIEW_DIR = null;
function themeFor(id) {
  if (THEMES[id]) {
    if (PREVIEW_DIR && WORLD_ORDER.includes(id)) return themeFor(`${PREVIEW_DIR}-${HEAL_ORDER[WORLD_ORDER.indexOf(id)]}`);
    return THEMES[id];
  }
  const [dir, world] = String(id).split('-');
  if (DIRECTIONS[dir] && HEAL_WORLDS[world]) return (THEMES[id] = makeHealTheme(dir, world));
  return null;
}
// Readable brick numbers on any fill: dark ink on light colours, white on dark ones.
function inkFor(col) {
  let r, g, b;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else { const m = col.match(/\d+/g); if (!m) return '#ffffff'; [r, g, b] = m.map(Number); }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66 ? '#2c2a4a' : '#ffffff';
}
