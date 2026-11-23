// Neon: the game's single visual direction. Black stage, sleek neon bricks, and a backdrop
// that stays dark until combos build, then lights up (drawBackdrop in 80-render.js).
// Each stage (and each endless level) takes its accent pair from its landscape.
const FONT = {
  display: '"Chakra Petch", "IBM Plex Sans KR", system-ui, sans-serif',
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

// Bricks use one neon ramp everywhere (low HP cyan ... high HP gold) so players learn it;
// each stage brings its own pair of accent colours for the backdrop, beams and UI.
const NEON_RAMP = ['#00e5ff', '#3d7bff', '#9b4dff', '#ff2bd6', '#ff6a3d', '#ffd000'];
function makeLandTheme(s) {
  const L = landOf(s), [A, B] = L.pal;
  return {
    id: 'land-' + s, land: s, name: L.name, tag: L.R.place, light: false, landKey: L.key, R: L.R, pal: L.pal, zone: L.Z,
    num: FONT.display, numSize: 15, numWeight: '700', disp: FONT.display, dw: '700', dsz: 1.35, ko: FONT.plex,
    css: {
      bg: '#04050a', panel: 'rgba(12,14,26,.9)', line: 'rgba(255,255,255,.12)', ink: '#f2f4ff', dim: '#8f96b8',
      gold: '#ffd000', hot: '#ff2b6a', cool: A, ov: 'rgba(3,4,9,.8)', btnInk: '#04050a', logo2: B,
    },
    hud: { bg: 'rgba(6,8,16,.78)', line: 'rgba(255,255,255,.08)', ink: '#f2f4ff', dim: '#8f96b8', accent: '#ffd000', xpBg: 'rgba(255,255,255,.08)', xp: A, heart: '#ff2b6a', heartOff: 'rgba(255,255,255,.15)', ch: A },
    outline: '#04050a', brick: 'neonx', numInk: '#ffffff', heartStyle: 'vector',
    ramp: rampOf(NEON_RAMP),
    special: { bomb: '#ff3355', chest: '#ffd000', steel: '#c8d0e0', slime: '#39ff88', boss: [A, B] },
    ball: { core: SAVE.champion ? '#ffd84d' : '#ffffff', glow: A, temp: B }, particle: 'spark',
    words: ['NICE', 'GREAT', 'EXCELLENT', 'UNREAL', 'LEGENDARY'], wordStyle: 'neon', accent: A, accent2: B, fever: '#ffd000', line2: '#ff2b6a',
    field(g, now) { drawBackdrop(now); },
  };
}
let TH = null;
// s: the landscape index (classic: the stage, endless: the level).
function applyTheme(s) {
  TH = makeLandTheme(s);
  stage.dataset.th = TH.id; stage.dataset.dir = 'neon';
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
