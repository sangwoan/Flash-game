// Soft Glass: the game's single visual direction. Each stage (and each endless level) takes
// its colours from its landscape; bricks are frosted glass tinted by that landscape's palette.
const FONT = {
  outfit: '"Outfit", "IBM Plex Sans KR", system-ui, sans-serif',
  plex: '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
};
const lerpHex = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = s => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
};
const rampOf = stops => k => {
  const x = clamp(k, 0, 0.9999) * (stops.length - 1), i = Math.floor(x);
  return lerpHex(stops[i], stops[i + 1], x - i);
};

// Static landscape layers are cached (2x resolution); only a few are kept at once.
const fieldCache = new Map();
function cachedLayer(key, paint) {
  if (fieldCache.has(key)) return fieldCache.get(key);
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d'); g.scale(2, 2); paint(g);
  fieldCache.set(key, c);
  if (fieldCache.size > 3) fieldCache.delete(fieldCache.keys().next().value);
  return c;
}

function makeLandTheme(s) {
  const L = landOf(s), R = L.R, light = !L.dark;
  const ink = light ? '#2c2a4a' : '#f2f4ff', dim = light ? '#6b6890' : '#a8b3d6';
  const ramp = PAL[R.pal];
  return {
    id: 'land-' + s, land: s, name: L.name, tag: R.place, light,
    num: FONT.outfit, numSize: 15, numWeight: '700', disp: FONT.outfit, dw: '800', dsz: 1.35, ko: FONT.plex,
    css: {
      bg: light ? '#f6f1fb' : '#0b1430', panel: light ? 'rgba(255,255,255,.86)' : 'rgba(22,34,70,.88)', line: light ? 'rgba(80,70,140,.18)' : 'rgba(170,190,255,.22)',
      ink, dim, gold: '#f2a541', hot: '#ff6b8b', cool: R.accent, ov: light ? 'rgba(248,244,255,.72)' : 'rgba(10,18,44,.72)', btnInk: '#ffffff', logo2: R.accent2,
    },
    hud: { bg: light ? 'rgba(255,255,255,.55)' : 'rgba(10,18,44,.5)', line: light ? 'rgba(80,70,140,.12)' : 'rgba(170,190,255,.15)', ink, dim, accent: '#f2a541', xpBg: light ? 'rgba(80,70,140,.12)' : 'rgba(170,190,255,.15)', xp: R.accent, heart: '#ff6b8b', heartOff: 'rgba(120,110,160,.3)', ch: R.accent },
    outline: light ? '#ffffff' : '#0b1430', brick: 'frost', numInk: 'auto', heartStyle: 'vector',
    ramp: rampOf(ramp),
    special: { bomb: '#ff6b81', chest: '#ffc857', steel: '#9aa6bd', slime: '#7bd88f', boss: [R.accent, R.accent2] },
    ball: { core: SAVE.champion ? '#ffd84d' : '#ffffff', glow: R.accent, temp: R.accent2 }, particle: 'dust',
    words: ['NICE', 'GREAT', 'EXCELLENT', 'UNREAL', 'LEGENDARY'], wordStyle: 'clean', accent: R.accent, fever: '#f2a541', line2: '#ff6b8b',
    field(g, now) {
      g.drawImage(cachedLayer(L.key, c => paintStatic(c, R, L.V)), 0, 0, W, H);
      paintAnim(g, R, now);
    },
  };
}
let TH = null;
// s: the landscape index (classic: the stage, endless: the level).
function applyTheme(s) {
  TH = makeLandTheme(s);
  stage.dataset.th = TH.id; stage.dataset.dir = 'glass';
  const st = stage.style;
  for (const [k, v] of Object.entries(TH.css)) st.setProperty('--' + k, v);
  st.setProperty('--disp', TH.disp); st.setProperty('--ko', TH.ko); st.setProperty('--dsz', TH.dsz);
  document.body.style.background = TH.css.bg;
  for (const k in glowCache) delete glowCache[k];
}
// Readable brick numbers on any fill: dark ink on light colours, white on dark ones.
function inkFor(col) {
  let r, g, b;
  if (col[0] === '#') { const n = parseInt(col.slice(1), 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
  else { const m = col.match(/\d+/g); if (!m) return '#ffffff'; [r, g, b] = m.map(Number); }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.66 ? '#2c2a4a' : '#ffffff';
}
