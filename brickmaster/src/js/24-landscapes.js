// Landscapes: famous real places drawn as neon line art on black, one per stage.
// A recipe lists ridges, water, trees, extras and drifting particles (its sky colours are
// unused in the neon look). Past the last recipe the list repeats as colour remixes, so stages
// never run out. Add places by adding recipes.

// ---------- neon line-art renderer ----------
// The scene is drawn as glowing outlines on black: dark silhouettes hide the lines behind them,
// so the layers still read in depth. The static art is cached; the game dims or brightens it
// with combo energy (see drawBackdrop in 80-render.js).
// Zones: every 5 stages the mood changes (palettes, backdrop light show, brick shape).
// Stages 1-5 NEON DAWN, 6-10 DEEP BLUE, 11-15 INFERNO, 16-20 AURORA, 21-25 COSMOS, then again
// as remixes. The 25 places in LANDS are grouped to suit their zone.
const ZONES = [
  { key: 'dawn', name: 'NEON DAWN', ko: '네온 새벽', style: 'grid', shape: 'round', pals: [['#00e5ff', '#ff2bd6'], ['#7c4dff', '#00f0ff'], ['#00ffd5', '#ff4dc4']] },
  { key: 'blue', name: 'DEEP BLUE', ko: '딥 블루', style: 'waves', shape: 'pill', pals: [['#00d9ff', '#7c4dff'], ['#00ffc8', '#3d7bff'], ['#4dd6ff', '#b14dff']] },
  { key: 'inferno', name: 'INFERNO', ko: '인페르노', style: 'embers', shape: 'chamfer', pals: [['#ff6a3d', '#ffd000'], ['#ff2b6a', '#ffb000'], ['#ff4d1a', '#ff2bd6']] },
  { key: 'aurora', name: 'AURORA', ko: '오로라', style: 'crystal', shape: 'facet', pals: [['#39ff88', '#b14dff'], ['#00ffd5', '#7c4dff'], ['#a6ff3d', '#00b3ff']] },
  { key: 'cosmos', name: 'COSMOS', ko: '코스모스', style: 'warp', shape: 'orb', pals: [['#b14dff', '#ffd000'], ['#ff4dc4', '#4d7cff'], ['#9b4dff', '#00e5ff']] },
];
const STAGES_PER_ZONE = 5;
// zone of stage s (classic) or of endless level s, with a roman numeral once the cycle repeats
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
function zoneOf(s) {
  const n = Math.floor(s / STAGES_PER_ZONE), Z = ZONES[n % ZONES.length], cyc = Math.floor(n / ZONES.length);
  return { ...Z, n, title: Z.name + (cyc ? ROMAN[cyc] || ` ${cyc + 1}` : ''), first: s % STAGES_PER_ZONE === 0 };
}
function seeded(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
const wrapN = (v, m) => ((v % m) + m) % m;
const SHADE = '#05060c';

function neonStroke(g, path, col, w = 1.6) {
  g.save(); g.lineJoin = 'round'; g.lineCap = 'round'; g.globalCompositeOperation = 'lighter'; g.strokeStyle = col;
  g.globalAlpha = 0.16; g.lineWidth = w * 5; g.stroke(path);
  g.globalAlpha = 0.45; g.lineWidth = w * 2.2; g.stroke(path);
  g.globalAlpha = 1; g.lineWidth = w; g.stroke(path);
  g.restore();
}
function neonDot(g, x, y, r, col, a = 1) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 3); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 3, 0, Math.PI * 2); g.fill(); g.restore();
}

// Silhouette (to hide what is behind) and top edge (to glow) for one ridge layer.
function ridgePaths(L) {
  const base = L.b * H, amp = (L.a || 0) * H, r = seeded(L.p * 97 + 13);
  const fill = new Path2D(), edge = new Path2D(), tips = [];
  const line = pts => {
    pts.forEach(([x, y], i) => i ? edge.lineTo(x, y) : edge.moveTo(x, y));
    fill.moveTo(0, H); pts.forEach(([x, y]) => fill.lineTo(x, y)); fill.lineTo(W, H); fill.closePath();
  };
  if (L.k === 'smooth' || L.k === 'dunes' || L.k === 'field') {
    const pts = [];
    for (let x = 0; x <= W; x += 5) {
      const sh = L.k === 'dunes' ? -Math.pow(Math.abs(Math.sin(x * L.f + L.p)), 0.7) : L.k === 'field' ? 0 : Math.sin(x * L.f + L.p) + 0.35 * Math.sin(x * L.f * 2.3 + L.p * 1.7);
      pts.push([x, base + sh * amp]);
    }
    line(pts);
  } else if (L.k === 'peaks') {
    const n = L.f, pts = [[0, base - amp * 0.2]];
    for (let i = 0; i < n; i++) {
      const x0 = (i + 0.2 + r() * 0.3) / n * W, x1 = (i + 0.7 + r() * 0.3) / n * W, p0 = [x0, base - amp * (0.55 + r() * 0.45)];
      pts.push(p0, [x1, base - amp * (0.05 + r() * 0.25)]); tips.push(p0);
    }
    pts.push([W, base - amp * 0.2]); line(pts);
  } else if (L.k === 'mesa') {
    const pts = [[0, base]]; let x = 0;
    while (x < W) { const w = 40 + r() * 70, top = base - amp * (0.3 + r() * 0.7); pts.push([x, base], [x + 8, top], [x + w - 8, top], [x + w, base]); x += w; }
    line(pts);
    for (let y = base - amp * 0.5; y < H; y += 14) { edge.moveTo(0, y); edge.lineTo(W, y); } // strata
  } else if (L.k === 'pillars') {
    for (let i = 0; i < L.f; i++) {
      const x = (i + 0.5 + (r() - 0.5) * 0.6) / L.f * W, w = (14 + r() * 22) * (L.w || 1), h = amp * (0.55 + r() * 0.45);
      for (const P of [fill, edge]) {
        P.moveTo(x - w / 2, base + 30); P.lineTo(x - w / 2 + 3, base - h + w / 2);
        P.quadraticCurveTo(x, base - h - w * 0.3, x + w / 2 - 3, base - h + w / 2); P.lineTo(x + w / 2, base + 30);
      }
      fill.closePath(); tips.push([x, base - h - w * 0.1]);
    }
  } else if (L.k === 'cliffs') {
    const top = L.top * H;
    for (const P of [fill, edge]) {
      P.moveTo(0, top); P.lineTo(W * L.w * 0.7, top + 20); P.lineTo(W * L.w, base); P.lineTo(W * L.w, H);
      P.moveTo(W, top + 30); P.lineTo(W * (1 - L.w * 0.7), top + 45); P.lineTo(W * (1 - L.w), base); P.lineTo(W * (1 - L.w), H);
    }
    fill.lineTo(W, H); fill.closePath(); fill.moveTo(0, H); fill.lineTo(0, top); fill.lineTo(W * L.w * 0.7, top + 20); fill.lineTo(W * L.w, base); fill.lineTo(W * L.w, H); fill.closePath();
  } else if (L.k === 'terraces') {
    const step = (H - base) / L.n;
    for (let i = 0; i < L.n; i++) {
      const pts = []; for (let x = 0; x <= W; x += 6) pts.push([x, base + i * step + Math.sin(x * 0.012 + i * 0.9) * step * 0.6]);
      pts.forEach(([x, y], k) => k ? edge.lineTo(x, y) : edge.moveTo(x, y));
      if (i === 0) { fill.moveTo(0, H); pts.forEach(([x, y]) => fill.lineTo(x, y)); fill.lineTo(W, H); fill.closePath(); }
    }
  } else if (L.k === 'rows') {
    fill.rect(0, base, W, H - base);
    const vx = W * 0.5, vy = base - 10;
    for (let i = -L.n; i <= L.n; i++) { edge.moveTo(vx + i * 3, vy + 12); edge.lineTo(vx + i * 70, H); }
    edge.moveTo(0, base); edge.lineTo(W, base);
  } else if (L.k === 'canopy') {
    const rad = L.r || 24, rr2 = seeded(L.p * 31);
    for (let x = -rad; x < W + rad; x += rad * 0.9) {
      const rr = rad * (0.75 + rr2() * 0.5);
      edge.moveTo(x - rr, base); edge.arc(x, base, rr, Math.PI, 0);
      fill.moveTo(x + rr, base); fill.arc(x, base, rr, 0, Math.PI * 2);
    }
    fill.rect(0, base, W, H - base);
  }
  return { fill, edge, tips };
}

function treePath(kind, x, y, s) {
  const P = new Path2D();
  if (kind === 'pine') {
    for (let k = 0; k < 3; k++) { const w = (16 - k * 3.5) * s, ty = y - (k * 14 + 22) * s; P.moveTo(x, ty - 12 * s); P.lineTo(x + w, ty + 14 * s); P.lineTo(x - w, ty + 14 * s); P.closePath(); }
    P.moveTo(x, y); P.lineTo(x, y - 8 * s);
  } else if (kind === 'cypress') {
    P.ellipse(x, y - 30 * s, 7 * s, 30 * s, 0, 0, Math.PI * 2);
  } else if (kind === 'palm') {
    P.moveTo(x, y); P.quadraticCurveTo(x + 10 * s, y - 30 * s, x + 4 * s, y - 56 * s);
    for (let k = 0; k < 6; k++) { const a = -2.6 + k * 0.9; P.moveTo(x + 4 * s, y - 56 * s); P.quadraticCurveTo(x + 4 * s + Math.cos(a) * 16 * s, y - 56 * s + Math.sin(a) * 16 * s - 6 * s, x + 4 * s + Math.cos(a) * 28 * s, y - 56 * s + Math.sin(a) * 28 * s + 4 * s); }
  } else if (kind === 'baobab') {
    P.moveTo(x - 7 * s, y); P.lineTo(x - 5 * s, y - 50 * s); P.lineTo(x + 5 * s, y - 50 * s); P.lineTo(x + 7 * s, y);
    for (let k = -2; k <= 2; k++) { P.moveTo(x + k * 6 * s + 6 * s, y - 56 * s); P.ellipse(x + k * 6 * s, y - 56 * s, 6 * s, 3.5 * s, 0, 0, Math.PI * 2); }
  } else {
    P.moveTo(x, y); P.lineTo(x, y - 30 * s);
    for (let k = 0; k < 5; k++) { const cx = x + Math.cos(k * 1.25) * 13 * s, cy = y - 40 * s + Math.sin(k * 1.7) * 8 * s; P.moveTo(cx + 11 * s, cy); P.arc(cx, cy, 11 * s, 0, Math.PI * 2); }
  }
  return P;
}

function extraPaint(g, e, pal) {
  const P = new Path2D();
  if (e.k === 'waterfall') { for (let i = 0; i < 4; i++) { const x = e.x * W - e.w / 2 + (i + 0.5) * e.w / 4; P.moveTo(x, e.y0 * H); P.lineTo(x, e.y1 * H); } neonStroke(g, P, '#bff6ff', 1.2); return; }
  if (e.k === 'rainbow') { ['#ff2b6a', '#ffb000', '#ffe600', '#39ff88', '#00b3ff', '#b14dff'].forEach((c, i) => { const A = new Path2D(); A.arc(e.x * W, e.y * H, e.r - i * 7, Math.PI, 0); neonStroke(g, A, c, 1.2); }); return; }
  if (e.k === 'icebergs') { for (const [x, y, s] of e.items) { const X = x * W, Y = y * H; P.moveTo(X - 38 * s, Y); P.lineTo(X - 24 * s, Y - 30 * s); P.lineTo(X - 8 * s, Y - 36 * s); P.lineTo(X + 6 * s, Y - 48 * s); P.lineTo(X + 22 * s, Y - 26 * s); P.lineTo(X + 38 * s, Y); P.closePath(); } g.fillStyle = SHADE; g.fill(P); neonStroke(g, P, '#bff6ff', 1.4); return; }
  if (e.k === 'yurt') { const x = e.x * W, y = e.y * H; P.moveTo(x - 18, y); P.lineTo(x - 18, y - 12); P.quadraticCurveTo(x, y - 30, x + 18, y - 12); P.lineTo(x + 18, y); g.fillStyle = SHADE; g.fill(P); neonStroke(g, P, pal[0], 1.4); neonDot(g, x, y - 5, 4, '#ffd000'); return; }
  if (e.k === 'boat') { const x = e.x * W, y = e.y * H; P.moveTo(x - 16, y - 4); P.lineTo(x + 16, y - 4); P.lineTo(x + 10, y + 2); P.lineTo(x - 10, y + 2); P.closePath(); P.moveTo(x, y - 4); P.lineTo(x, y - 30); P.lineTo(x + 12, y - 6); neonStroke(g, P, pal[1], 1.3); return; }
  if (e.k === 'sheep') { const r = seeded(7); for (let i = 0; i < 16; i++) neonDot(g, r() * W, (e.y0 + r() * (e.y1 - e.y0)) * H, 1.6, '#ffffff', 0.8); return; }
  if (e.k === 'coral') { for (const [x, y, s, col] of e.items) { const C = new Path2D(); for (let k = 0; k < 6; k++) { const h = Math.abs(Math.sin(k * 1.3)) * 30 * s + 6 * s, cx = x * W + (k - 2.5) * 7 * s; C.moveTo(cx, y * H); C.lineTo(cx, y * H - h + 7 * s); C.moveTo(cx + 7 * s, y * H - h); C.arc(cx, y * H - h, 7 * s, 0, Math.PI * 2); } neonStroke(g, C, col, 1.3); } }
}

// Static line art of a place, on a transparent canvas (cached by the theme).
function neonStatic(g, R, pal) {
  const stops = R.layers || [], n = Math.max(1, stops.length - 1);
  const colOf = i => lerpHex(pal[0], pal[1], Math.min(1, i / n));
  if (R.stars) { const r = seeded(3); for (let i = 0; i < R.stars; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; g.fillRect(r() * W, r() * H * 0.6, 1.3, 1.3); } }
  if (R.milky) { const r = seeded(11); for (let i = 0; i < 160; i++) { const t = r(); g.fillStyle = `rgba(200,210,255,${0.15 + r() * 0.35})`; g.fillRect(W * t + (r() - 0.5) * 50, H * (0.45 - t * 0.35) + (r() - 0.5) * 40, 1.2, 1.2); } }
  if (R.sun) {
    // a striped neon sun
    const x = R.sun.x * W, y = R.sun.y * H, rad = Math.max(30, R.sun.r * 2.2);
    neonDot(g, x, y, rad * 0.9, pal[1], 0.35);
    g.save(); g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.clip();
    const gr = g.createLinearGradient(0, y - rad, 0, y + rad); gr.addColorStop(0, pal[1]); gr.addColorStop(1, pal[0]);
    g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); g.globalAlpha = 1;
    g.fillStyle = SHADE; for (let k = 0; k < 6; k++) g.fillRect(x - rad, y + rad * (0.05 + k * 0.16), rad * 2, 2 + k * 1.3);
    g.restore();
    const C = new Path2D(); C.arc(x, y, rad, 0, Math.PI * 2); neonStroke(g, C, pal[1], 1.4);
  }
  if (R.moon) {
    const m = R.moon, x = m.x * W, y = m.y * H, C = new Path2D();
    C.arc(x, y, m.r, Math.PI * 0.35, Math.PI * 1.65); C.arc(x + m.r * 0.45, y - m.r * 0.2, m.r * 0.95, Math.PI * 1.55, Math.PI * 0.45, true);
    neonStroke(g, C, '#f6f3e6', 1.4); neonDot(g, x, y, m.r, '#9fb4ff', 0.25);
  }
  const drawLayer = (L, i) => {
    const P = ridgePaths(L), col = colOf(i);
    g.fillStyle = SHADE; g.fill(P.fill);
    neonStroke(g, P.edge, col, L.k === 'mesa' || L.k === 'terraces' || L.k === 'rows' ? 1.1 : 1.7);
    for (const [x, y] of P.tips) neonDot(g, x, y, 2.2, '#ffffff', 0.9);
    if (L.k === 'field') { const r = seeded(L.p * 5 + 1); for (let k = 0; k < 120; k++) neonDot(g, r() * W, L.b * H + Math.pow(r(), 0.7) * (H - L.b * H), 1.2, col, 0.7); }
  };
  const drawTrees = front => { for (const T of R.trees || []) if (!!T.front === front) for (const [x, y, s] of T.items) { const P = treePath(T.k, x * W, y * H, s); g.fillStyle = SHADE; g.fill(P); neonStroke(g, P, T.k === 'blossom' ? '#ff7ad9' : T.k === 'maple' ? '#ff8a3d' : pal[0], 1.2); } };
  stops.forEach((L, i) => { if (!L.front) drawLayer(L, i); });
  drawTrees(false);
  for (const e of R.extras || []) if (!e.front) extraPaint(g, e, pal);
  if (R.water) {
    const wy = R.water.y * H;
    g.save(); g.beginPath(); g.rect(0, wy, W, H - wy); g.clip();
    g.fillStyle = SHADE; g.fillRect(0, wy, W, H - wy);
    g.translate(0, wy * 2); g.scale(1, -1); g.globalAlpha = R.water.mirror ? 0.6 : 0.28;
    g.drawImage(g.canvas, 0, 0, W, H); g.restore();
    const Hz = new Path2D(); Hz.moveTo(0, wy); Hz.lineTo(W, wy); neonStroke(g, Hz, pal[0], 1.4);
  }
  stops.forEach((L, i) => { if (L.front) drawLayer(L, i); });
  drawTrees(true);
  for (const e of R.extras || []) if (e.front) extraPaint(g, e, pal);
}

// Moving parts of a place; `e` (0..1) is the combo energy, which brings more of them out.
function neonAnim(g, R, pal, now, e) {
  g.save(); g.globalCompositeOperation = 'lighter';
  if (R.aurora) {
    R.aurora.forEach((col, k) => {
      g.strokeStyle = col; g.lineWidth = 2; g.globalAlpha = 0.25 + 0.4 * e; g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, H * 0.18 + Math.sin(x * 0.011 + now / 2400 + k * 1.3) * 34 + k * 20);
      g.stroke();
    });
  }
  if (R.water && R.water.shimmer) {
    const x0 = R.sun ? R.sun.x * W : W / 2; g.fillStyle = pal[1];
    for (let i = 0; i < 8; i++) { const w = 54 - i * 5 + Math.sin(now / 500 + i) * 12; g.globalAlpha = 0.25 + 0.35 * e; g.fillRect(x0 - w / 2, R.water.y * H + 5 + i * 11, w, 1.6); }
  }
  for (const ex of R.extras || []) if (ex.k === 'waterfall') {
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { const x = ex.x * W - ex.w / 2 + (i + 0.5) * ex.w / 6, y = ex.y0 * H + wrapN(now * 0.25 + i * 37, (ex.y1 - ex.y0) * H); g.globalAlpha = 0.6; g.fillRect(x - 0.6, y, 1.2, 12); }
  }
  const P = R.particles || {}, n = Math.round((P.n || 0) * (0.5 + 0.5 * e));
  for (let i = 0; i < n; i++) {
    const k = P.k;
    let x, y, col = pal[i % 2], r = 1.6;
    if (k === 'snow') { x = wrapN(i * 61 + Math.sin(now / 1200 + i) * 16, W); y = wrapN(i * 97 + now * 0.03 * (1 + i % 3), H); col = '#ffffff'; r = 1.2; }
    else if (k === 'bubbles') { y = H - wrapN(i * 71 + now * 0.04 * (1 + i % 3), H); x = wrapN(i * 53, W) + Math.sin(now / 600 + i) * 6; g.globalAlpha = 0.6; g.strokeStyle = pal[0]; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 2 + i % 4, 0, Math.PI * 2); g.stroke(); continue; }
    else if (k === 'petals' || k === 'leaves') { x = wrapN(i * 137 + now * 0.018 * (1 + i % 3) + Math.sin(now / 900 + i) * 14, W + 40) - 20; y = wrapN(i * 91 + now * 0.035 * (1 + i % 4), H + 40) - 20; col = k === 'petals' ? '#ff7ad9' : '#ff8a3d'; }
    else if (k === 'birds') { x = wrapN(i * 90 + now * 0.012, W + 60) - 30; y = H * (0.2 + (i % 5) * 0.05) + Math.sin(now / 900 + i) * 6; const f = 4 + Math.sin(now / 200 + i) * 2; g.globalAlpha = 0.7; g.strokeStyle = pal[0]; g.lineWidth = 1.3; g.beginPath(); g.moveTo(x - 7, y - f); g.quadraticCurveTo(x - 3, y - 1, x, y); g.quadraticCurveTo(x + 3, y - 1, x + 7, y - f); g.stroke(); continue; }
    else { x = wrapN(i * 97 + Math.sin(now / 2600 + i) * 18, W); y = wrapN(H * 0.1 + i * 53 - now * 0.01 * (1 + i % 3), H * 0.85); }
    g.globalAlpha = Math.max(0, 0.35 + 0.45 * Math.sin(now / 500 + i * 1.7));
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

// ---------- 25 places (name, sky, light, layers, details) ----------
const LANDS = [
  // zone 1: NEON DAWN
  { key: 'moraine', name: '모레인 호수의 새벽', place: 'CANADA', pal: 'cool', accent: '#7a8cf0', accent2: '#f29ac2',
    sky: ['#9fb7f0', '#d9c6ee', '#ffe0c8'], skyEnd: 0.6, sun: { x: 0.68, y: 0.56, r: 22 }, clouds: [[0.2, 0.17, 120, 24, 0.5], [0.75, 0.26, 100, 20, 0.4]],
    layers: [{ k: 'peaks', b: 0.5, a: 0.18, f: 5, p: 1, c: '#b9b4e4', snow: '#f4f1ff' }, { k: 'peaks', b: 0.57, a: 0.08, f: 8, p: 4, c: '#9a95d2' }],
    water: { y: 0.58, c: ['#cfe0f5', '#8fb6e0'], shimmer: true }, trees: [{ k: 'pine', c: '#5d6aa8', front: true, items: [[0.04, 0.62, 1], [0.1, 0.64, 0.8], [0.88, 0.62, 1.1], [0.95, 0.63, 0.8]] }],
    particles: { k: 'motes', n: 20 } },
  { key: 'kyoto', name: '교토 벚꽃 언덕', place: 'JAPAN', pal: 'bloom', accent: '#ef7fa6', accent2: '#7fc4ea',
    sky: ['#ffdbe7', '#fff0e4', '#fff7ee'], clouds: [[0.3, 0.16, 160, 40, 0.7], [0.8, 0.3, 120, 30, 0.6]],
    layers: [{ k: 'smooth', b: 0.58, a: 0.03, f: 0.012, p: 0.5, c: '#d6eed8' }, { k: 'smooth', b: 0.67, a: 0.025, f: 0.016, p: 2, c: '#bfe5c6' }, { k: 'smooth', b: 0.79, a: 0.02, f: 0.02, p: 4, c: '#a7dab3' }],
    trees: [{ k: 'blossom', items: [[0.12, 0.66, 1], [0.3, 0.7, 0.8], [0.82, 0.64, 1.1], [0.62, 0.76, 0.9]] }], particles: { k: 'petals', n: 34 } },
  { key: 'provence', name: '프로방스 라벤더 들판', place: 'FRANCE', pal: 'bloom', accent: '#9b7fd4', accent2: '#f7a982',
    sky: ['#a8c6f5', '#ffe1c2', '#ffd29a'], skyEnd: 0.6, sun: { x: 0.3, y: 0.5, r: 20 },
    layers: [{ k: 'smooth', b: 0.52, a: 0.02, f: 0.01, p: 2, c: '#c9b8d8' }, { k: 'rows', b: 0.57, n: 8, c: '#9b7fd4', c2: '#c7b2ec' }],
    trees: [{ k: 'cypress', c: '#4f6b5a', items: [[0.18, 0.56, 0.9], [0.22, 0.56, 0.7], [0.84, 0.55, 1]] }], particles: { k: 'butterflies', n: 10 } },
  { key: 'bali', name: '발리 계단식 논', place: 'INDONESIA', pal: 'earth', accent: '#6fb86a', accent2: '#f6a57e',
    sky: ['#bde3f2', '#e9f6e6'],
    layers: [{ k: 'canopy', b: 0.44, r: 20, p: 2, c: '#7cbf8a' }, { k: 'terraces', b: 0.5, n: 9, cols: ['#b8e08a', '#9fd47a', '#c9e89c'] }],
    trees: [{ k: 'palm', c: '#3f7d55', items: [[0.08, 0.6, 1], [0.9, 0.56, 1.2], [0.75, 0.62, 0.8]] }], particles: { k: 'butterflies', n: 10 } },
  { key: 'newzealand', name: '뉴질랜드 초원 언덕', place: 'NEW ZEALAND', pal: 'green', accent: '#5fbf7a', accent2: '#8ab0f0',
    sky: ['#a9d4f5', '#e6f3fb'], clouds: [[0.25, 0.15, 110, 34, 0.85], [0.7, 0.22, 90, 28, 0.8]],
    layers: [{ k: 'peaks', b: 0.5, a: 0.1, f: 4, p: 2, c: '#b9cbe6', snow: '#f4f8ff' }, { k: 'smooth', b: 0.6, a: 0.04, f: 0.01, p: 1, c: '#b6e3a0' }, { k: 'smooth', b: 0.72, a: 0.035, f: 0.014, p: 3, c: '#93d18a' }, { k: 'smooth', b: 0.84, a: 0.03, f: 0.02, p: 5, c: '#78c07a' }],
    extras: [{ k: 'sheep', y0: 0.66, y1: 0.8, front: true }], particles: { k: 'birds', n: 4 } },
  // zone 2: DEEP BLUE
  { key: 'maldives', name: '몰디브 산호 바다', place: 'MALDIVES', pal: 'sea', accent: '#2fb5c8', accent2: '#f48fb8',
    sky: ['#c8f4ef', '#86d8dc', '#4fa9c4', '#2f7aa8'],
    layers: [{ k: 'smooth', b: 0.88, a: 0.012, f: 0.018, p: 1, c: '#f1ddb4' }, { k: 'smooth', b: 0.92, a: 0.01, f: 0.025, p: 3, c: '#e8cf9f' }],
    extras: [{ k: 'coral', items: [[0.12, 0.9, 1, '#ff9fb8'], [0.36, 0.92, 0.8, '#ffb48a'], [0.7, 0.9, 1, '#c7a0ff'], [0.9, 0.92, 0.7, '#ff9fb8']] }, { k: 'rays' }, { k: 'seaweed', xs: [0.05, 0.35, 0.65, 0.95] }],
    particles: { k: 'bubbles', n: 22 } },
  { key: 'halong', name: '하롱베이 에메랄드 바다', place: 'VIETNAM', pal: 'sea', accent: '#3fb8a8', accent2: '#ffad7a',
    sky: ['#b9e2f0', '#e8f4ee', '#fff3df'],
    layers: [{ k: 'pillars', b: 0.62, a: 0.14, f: 7, p: 3, c: '#9cc8b8', w: 2.2 }, { k: 'pillars', b: 0.64, a: 0.2, f: 4, p: 8, c: '#6fae9a', w: 2.6 }],
    water: { y: 0.63, c: ['#9fe0d0', '#4fb3a8'] }, extras: [{ k: 'boat', x: 0.7, y: 0.72, c: '#b06a5a', front: true }], particles: { k: 'birds', n: 4 } },
  { key: 'boracay', name: '보라카이 하얀 해변', place: 'PHILIPPINES', pal: 'sea', accent: '#2fb8c8', accent2: '#ffad7a',
    sky: ['#9fdcf5', '#dff4fb'], clouds: [[0.3, 0.2, 100, 26, 0.8], [0.75, 0.14, 90, 22, 0.7]],
    water: { y: 0.6, c: ['#7fe0e0', '#3fb7c9'] },
    layers: [{ k: 'smooth', b: 0.8, a: 0.015, f: 0.012, p: 2, c: '#fbe8c8', front: true }],
    trees: [{ k: 'palm', c: '#3f8d65', front: true, items: [[0.1, 0.82, 1.2], [0.88, 0.8, 1.1]] }], extras: [{ k: 'waves', y: 0.77 }], particles: { k: 'sparkles', n: 16, c: '#ffffff' } },
  { key: 'uyuni', name: '우유니 하늘 거울', place: 'BOLIVIA', pal: 'cool', accent: '#6fa8ff', accent2: '#f59ab8',
    sky: ['#8fc3ff', '#c9dcff', '#ffe9f2'], skyEnd: 0.5,
    clouds: [[0.2, 0.18, 90, 36, 0.9], [0.55, 0.12, 110, 40, 0.9], [0.85, 0.24, 80, 30, 0.85], [0.4, 0.33, 70, 22, 0.8]],
    layers: [{ k: 'smooth', b: 0.495, a: 0.008, f: 0.02, p: 1, c: '#b9c3e8' }],
    water: { y: 0.5, c: ['#d7e4ff', '#f5e4f0'], mirror: true }, particles: { k: 'sparkles', n: 18, c: '#ffffff' } },
  { key: 'fjord', name: '노르웨이 피오르', place: 'NORWAY', pal: 'cool', accent: '#5f9fc0', accent2: '#f29ac2',
    sky: ['#9cc4e8', '#d5e7f2', '#f3efe6'],
    layers: [{ k: 'cliffs', b: 0.66, top: 0.22, w: 0.42, c: '#9ab3c6' }, { k: 'cliffs', b: 0.7, top: 0.34, w: 0.3, c: '#6f8fa6' }],
    water: { y: 0.66, c: ['#9fc6d6', '#5f97ad'] }, extras: [{ k: 'waterfall', x: 0.2, y0: 0.38, y1: 0.66, w: 8 }, { k: 'boat', x: 0.58, y: 0.74, front: true }], particles: { k: 'mist', n: 4 } },
  // zone 3: INFERNO
  { key: 'sahara', name: '사하라 사막의 별밤', place: 'MOROCCO', pal: 'night', accent: '#f6b26b', accent2: '#8a9cff', dark: true,
    sky: ['#141a3d', '#3a2f6b', '#c47a8a'], stars: 130, milky: true, moon: { x: 0.76, y: 0.16, r: 15 },
    layers: [{ k: 'dunes', b: 0.72, a: 0.05, f: 0.008, p: 1, c: '#c98a6a' }, { k: 'dunes', b: 0.8, a: 0.05, f: 0.011, p: 3, c: '#a96c56' }, { k: 'dunes', b: 0.9, a: 0.04, f: 0.015, p: 6, c: '#8a5446' }],
    particles: { k: 'sparkles', n: 30 } },
  { key: 'canyon', name: '그랜드 캐니언 노을', place: 'USA', pal: 'warm', accent: '#e9895f', accent2: '#8a8ee8',
    sky: ['#6d7fd6', '#f2a07b', '#ffd8a0'], skyEnd: 0.6, sun: { x: 0.72, y: 0.46, r: 18 },
    layers: [{ k: 'mesa', b: 0.6, a: 0.12, p: 1, c: '#e3a585' }, { k: 'mesa', b: 0.72, a: 0.14, p: 4, c: '#c97a5e' }, { k: 'mesa', b: 0.86, a: 0.12, p: 7, c: '#a85a48' }],
    particles: { k: 'birds', n: 4 } },
  { key: 'baobab', name: '마다가스카르 바오밥 길', place: 'MADAGASCAR', pal: 'warm', accent: '#e9895f', accent2: '#8a8ee8',
    sky: ['#7d8ae0', '#f5a98a', '#ffd9a3'], skyEnd: 0.8, sun: { x: 0.55, y: 0.7, r: 36, glow: 160, halo: '#ffe2b0' },
    layers: [{ k: 'smooth', b: 0.79, a: 0.006, f: 0.01, p: 1, c: '#c98b6b' }],
    trees: [{ k: 'baobab', c: '#6b4a5e', items: [[0.1, 0.8, 1.3], [0.28, 0.8, 1], [0.46, 0.8, 1.2], [0.72, 0.8, 1.1], [0.9, 0.8, 1.4]] }], particles: { k: 'birds', n: 5 } },
  { key: 'haleakala', name: '할레아칼라 구름 위 노을', place: 'HAWAII', pal: 'warm', accent: '#f2789a', accent2: '#9d8cf5',
    sky: ['#7b73ea', '#c98bd9', '#ff9fb0', '#ffd49c'], skyEnd: 0.75, sun: { x: 0.5, y: 0.62, r: 34, glow: 150, halo: '#fff0c8' },
    clouds: [[0.25, 0.2, 140, 22, 0.6], [0.78, 0.34, 120, 18, 0.6]],
    layers: [{ k: 'canopy', b: 0.68, r: 26, p: 3, c: '#ffd8cc' }, { k: 'canopy', b: 0.76, r: 30, p: 7, c: '#ffc2cf' }, { k: 'canopy', b: 0.86, r: 34, p: 11, c: '#f4aacb' }],
    particles: { k: 'birds', n: 5 } },
  { key: 'aegean', name: '에게해 노을 바다', place: 'GREECE', pal: 'warm', accent: '#e9789a', accent2: '#8a8ee8',
    sky: ['#7f86e6', '#f39fb5', '#ffd29e'], skyEnd: 0.6, sun: { x: 0.5, y: 0.57, r: 28, glow: 140 },
    layers: [{ k: 'smooth', b: 0.59, a: 0.015, f: 0.02, p: 2, c: '#8e7fb8' }],
    water: { y: 0.6, c: ['#f6b9b0', '#9a8fd8'], shimmer: true }, extras: [{ k: 'boat', x: 0.25, y: 0.7, c: '#6a5a8a', front: true }], particles: { k: 'birds', n: 5 } },
  // zone 4: AURORA
  { key: 'iceland', name: '아이슬란드 오로라', place: 'ICELAND', pal: 'night', accent: '#6ff2c6', accent2: '#c38cff', dark: true,
    sky: ['#0a1430', '#172c58', '#2b4a7c'], stars: 90, aurora: ['#6ff2c6', '#62cdf5', '#c38cff'],
    layers: [{ k: 'smooth', b: 0.8, a: 0.018, f: 0.014, p: 2, c: '#cfdcf2' }, { k: 'smooth', b: 0.86, a: 0.013, f: 0.02, p: 5, c: '#e6eefa' }],
    trees: [{ k: 'pine', c: '#132a48', items: [[0.03, 0.82, 0.9], [0.12, 0.82, 1.1], [0.22, 0.83, 0.8], [0.7, 0.82, 1], [0.8, 0.82, 1.2], [0.9, 0.83, 0.8], [0.97, 0.82, 1]] }],
    particles: { k: 'snow', n: 40 } },
  { key: 'antarctica', name: '남극 빙산의 바다', place: 'ANTARCTICA', pal: 'cool', accent: '#5f9fd8', accent2: '#c69cf0',
    sky: ['#9fc0ea', '#d8e7f8', '#f4f8ff'],
    layers: [{ k: 'peaks', b: 0.61, a: 0.06, f: 6, p: 3, c: '#e9f2fc', snow: '#ffffff' }],
    water: { y: 0.62, c: ['#8fc0e6', '#5a92c4'] }, extras: [{ k: 'icebergs', front: true, items: [[0.22, 0.7, 1.3], [0.62, 0.67, 0.8], [0.84, 0.78, 1.6]] }],
    particles: { k: 'snow', n: 24 } },
  { key: 'patagonia', name: '파타고니아 분홍 봉우리', place: 'ARGENTINA', pal: 'cool', accent: '#e98aa0', accent2: '#7f9fd0',
    sky: ['#9fb1ea', '#f3bfd0', '#ffd9b8'], skyEnd: 0.7,
    layers: [{ k: 'peaks', b: 0.6, a: 0.34, f: 3, p: 7, c: '#e9a6b8', snow: '#fff0f4' }, { k: 'peaks', b: 0.68, a: 0.1, f: 6, p: 2, c: '#8b88b8' }],
    water: { y: 0.7, c: ['#a6c3e6', '#7f9fd0'] }, particles: { k: 'motes', n: 16, c: '#ffe8f0' } },
  { key: 'zhangjiajie', name: '장가계 구름 기둥', place: 'CHINA', pal: 'green', accent: '#6f9f96', accent2: '#c69cf0',
    sky: ['#cfdcec', '#eef2f5'],
    layers: [{ k: 'pillars', b: 0.7, a: 0.45, f: 10, p: 4, c: '#a9bcb8', cap: '#b9d4b0' }, { k: 'pillars', b: 0.8, a: 0.42, f: 6, p: 9, c: '#6f8f88', cap: '#8fbf86', w: 1.3 }],
    extras: [{ k: 'mistband', y: 0.62 }, { k: 'mistband', y: 0.78 }], particles: { k: 'mist', n: 6 } },
  { key: 'guilin', name: '계림 안개 산수', place: 'CHINA', pal: 'green', accent: '#5fae95', accent2: '#f59ab8',
    sky: ['#d7e6e0', '#eef3ea', '#f6f1e6'],
    layers: [{ k: 'pillars', b: 0.62, a: 0.3, f: 9, p: 2, c: '#b8cfc5' }, { k: 'pillars', b: 0.7, a: 0.26, f: 6, p: 5, c: '#8fb3a5', w: 1.6 }],
    water: { y: 0.72, c: ['#cfe3dc', '#a7c9bf'] }, extras: [{ k: 'boat', x: 0.4, y: 0.78, front: true }, { k: 'mistband', y: 0.55 }], particles: { k: 'mist', n: 5 } },
  // zone 5: COSMOS
  { key: 'mongolia', name: '몽골 초원의 은하수', place: 'MONGOLIA', pal: 'night', accent: '#8a9cff', accent2: '#ffd27a', dark: true,
    sky: ['#0b1030', '#1c2a5a', '#3b4f7a'], stars: 160, milky: true,
    layers: [{ k: 'smooth', b: 0.8, a: 0.012, f: 0.01, p: 2, c: '#2f4d4a' }, { k: 'smooth', b: 0.88, a: 0.008, f: 0.015, p: 4, c: '#26403d' }],
    extras: [{ k: 'yurt', x: 0.7, y: 0.81 }], particles: { k: 'sparkles', n: 30 } },
  { key: 'amazon', name: '아마존 열대우림 안개', place: 'PERU', pal: 'green', accent: '#4fae7a', accent2: '#ffd166',
    sky: ['#cfe8d8', '#eef6ea'],
    layers: [{ k: 'canopy', b: 0.5, r: 26, p: 1, c: '#9cc9a0' }, { k: 'canopy', b: 0.64, r: 30, p: 5, c: '#76b083' }, { k: 'canopy', b: 0.8, r: 34, p: 9, c: '#559a6b' }],
    extras: [{ k: 'mistband', y: 0.56 }, { k: 'mistband', y: 0.72 }], particles: { k: 'butterflies', n: 12 } },
  { key: 'iguazu', name: '이구아수 폭포와 무지개', place: 'BRAZIL', pal: 'green', accent: '#45b38c', accent2: '#ff9ec7',
    sky: ['#bfe4ef', '#e6f5ee'],
    layers: [{ k: 'canopy', b: 0.34, r: 18, p: 4, c: '#7fbf8f' }, { k: 'cliffs', b: 0.78, top: 0.36, w: 0.5, c: '#5f9b7a' }],
    water: { y: 0.8, c: ['#bfe3e0', '#7fbfbd'] },
    extras: [{ k: 'waterfall', x: 0.36, y0: 0.4, y1: 0.8, w: 22 }, { k: 'waterfall', x: 0.5, y0: 0.38, y1: 0.8, w: 30 }, { k: 'waterfall', x: 0.64, y0: 0.42, y1: 0.8, w: 18 }, { k: 'rainbow', x: 0.5, y: 0.82, r: 120 }],
    particles: { k: 'mist', n: 5 } },
  { key: 'maple', name: '캐나다 단풍 숲', place: 'QUEBEC', pal: 'earth', accent: '#e7804f', accent2: '#8ab0f0',
    sky: ['#c7d8f0', '#f5e2cf'],
    layers: [{ k: 'smooth', b: 0.6, a: 0.03, f: 0.01, p: 1, c: '#e8b08a' }, { k: 'smooth', b: 0.75, a: 0.02, f: 0.015, p: 3, c: '#d98a5e' }],
    trees: [{ k: 'maple', items: [[0.08, 0.66, 1], [0.24, 0.7, 0.9], [0.42, 0.66, 0.8], [0.6, 0.71, 1], [0.78, 0.66, 0.9], [0.94, 0.7, 1.1]] }], particles: { k: 'leaves', n: 26 } },
  { key: 'jeju', name: '제주 유채꽃과 한라산', place: 'KOREA', pal: 'earth', accent: '#f2b632', accent2: '#6fa8ff',
    sky: ['#a7d0f5', '#e6f3fb'], clouds: [[0.3, 0.15, 120, 30, 0.8], [0.78, 0.25, 90, 24, 0.7]],
    layers: [{ k: 'smooth', b: 0.5, a: 0.07, f: 0.006, p: 4.2, c: '#8fb5a6' }, { k: 'smooth', b: 0.62, a: 0.015, f: 0.012, p: 1, c: '#a9d39a' }, { k: 'field', b: 0.66, c: '#ffe680', dot: '#f2b400' }, { k: 'smooth', b: 0.78, a: 0.012, f: 0.02, p: 3, c: 'rgba(120,180,100,.55)' }, { k: 'field', b: 0.8, c: '#ffdf5a', dot: '#e9a800' }],
    particles: { k: 'butterflies', n: 12 } },
];
// Once every place has been seen they return as colour remixes, so stages never run out.
const VARIANTS = [null, { suffix: 'REMIX' }, { suffix: 'HYPER' }, { suffix: 'OVERDRIVE' }];
const landOf = s => {
  const i = wrapN(s, LANDS.length), R = LANDS[i], cyc = Math.floor(s / LANDS.length), V = VARIANTS[cyc % VARIANTS.length];
  const Z = zoneOf(s), pal = Z.pals[(s + cyc) % Z.pals.length];
  return { R, V, Z, pal, name: V ? `${R.name} · ${V.suffix}` : R.name, key: `${R.key}-${Z.key}-${cyc}` };
};
// A small thumbnail of a stage's scene for the map.
const thumbCache = {};
function landThumb(s) {
  const L = landOf(s);
  if (thumbCache[L.key]) return thumbCache[L.key];
  const c = document.createElement('canvas'); c.width = 168; c.height = 312;
  const g = c.getContext('2d'); g.fillStyle = '#04050a'; g.fillRect(0, 0, 168, 312);
  g.scale(168 / W, 312 / H); neonStatic(g, L.R, L.pal);
  return (thumbCache[L.key] = c.toDataURL('image/jpeg', 0.85));
}
