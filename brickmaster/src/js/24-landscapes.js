// Landscapes: calm scenes after famous real places, painted from a small set of parts.
// A recipe lists sky, light, ridges, water, trees, extras and drifting particles; the painter
// builds the static part once (cached) and animates the rest. Past the last recipe the list
// repeats in new times of day, so stages never run out. Add places by adding recipes.

const PAL = {
  cool: ['#7fcfe0', '#8fa8ee', '#b59af0', '#f29ac2', '#f7b98a'],
  bloom: ['#8ad9b8', '#7fc4ea', '#a99cf0', '#f28fb0', '#f7a982'],
  sea: ['#6fe0cf', '#5cbdf0', '#7d9cf5', '#f48fb8', '#ffad7a'],
  night: ['#6ff2c6', '#62cdf5', '#8a9cff', '#c38cff', '#ff8fcf'],
  warm: ['#ffcf7a', '#ffa98a', '#ff8fa6', '#e08fd0', '#9d8cf5'],
  earth: ['#9fd8a0', '#f7d083', '#f6a57e', '#e98aa0', '#a58ee8'],
  green: ['#8fe0b0', '#6fcfd8', '#8ab0f0', '#c69cf0', '#f59ab8'],
};

// ---------- painting helpers ----------
function seeded(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); }
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
function bumps(g, y, r, col, seed) {
  const rnd2 = seeded(seed);
  g.fillStyle = col; g.beginPath();
  for (let x = -r; x < W + r; x += r * 0.9) { const rr = r * (0.75 + rnd2() * 0.5); g.moveTo(x + rr, y); g.arc(x, y, rr, 0, Math.PI * 2); }
  g.rect(0, y, W, H - y); g.fill();
}
const wrapN = (v, m) => ((v % m) + m) % m;

function ridge(g, L) {
  const base = L.b * H, amp = (L.a || 0) * H, r = seeded(L.p * 97 + 13);
  g.fillStyle = L.c;
  if (L.k === 'smooth' || L.k === 'dunes') {
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 5) {
      const s = L.k === 'dunes' ? -Math.pow(Math.abs(Math.sin(x * L.f + L.p)), 0.7) : Math.sin(x * L.f + L.p) + 0.35 * Math.sin(x * L.f * 2.3 + L.p * 1.7);
      g.lineTo(x, base + s * amp);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  } else if (L.k === 'peaks') {
    const n = L.f, pts = [[0, base - amp * 0.2]];
    for (let i = 0; i < n; i++) {
      const x0 = (i + 0.2 + r() * 0.3) / n * W, x1 = (i + 0.7 + r() * 0.3) / n * W;
      pts.push([x0, base - amp * (0.55 + r() * 0.45)], [x1, base - amp * (0.05 + r() * 0.25)]);
    }
    pts.push([W, base - amp * 0.2]);
    g.beginPath(); g.moveTo(0, H); pts.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(W, H); g.closePath(); g.fill();
    if (L.snow) {
      g.fillStyle = L.snow;
      for (let i = 1; i < pts.length - 1; i += 2) {
        const [px, py] = pts[i], [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1], k = 0.28;
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + (bx - px) * k, py + (by - py) * k);
        g.lineTo(px + (bx - px) * k * 0.5, py + (by - py) * k * 0.7); g.lineTo(px + (ax - px) * k * 0.5, py + (ay - py) * k * 0.7);
        g.lineTo(px + (ax - px) * k, py + (ay - py) * k); g.closePath(); g.fill();
      }
    }
  } else if (L.k === 'mesa') {
    g.beginPath(); g.moveTo(0, H);
    let x = 0;
    while (x < W) {
      const w = 40 + r() * 70, top = base - amp * (0.3 + r() * 0.7);
      g.lineTo(x, base); g.lineTo(x + 8, top); g.lineTo(x + w - 8, top); g.lineTo(x + w, base); x += w;
    }
    g.lineTo(W, H); g.closePath(); g.fill();
    g.save(); g.clip(); g.fillStyle = 'rgba(0,0,0,.07)';
    for (let y = base - amp; y < H; y += 7) g.fillRect(0, y, W, 2);
    g.restore();
  } else if (L.k === 'pillars') {
    const n = L.f;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5 + (r() - 0.5) * 0.6) / n * W, w = (14 + r() * 22) * (L.w || 1), h = amp * (0.55 + r() * 0.45);
      g.fillStyle = L.c; g.beginPath(); g.moveTo(x - w / 2, base + 30); g.lineTo(x - w / 2 + 3, base - h + w / 2);
      g.quadraticCurveTo(x, base - h - w * 0.3, x + w / 2 - 3, base - h + w / 2); g.lineTo(x + w / 2, base + 30); g.fill();
      if (L.cap) { g.fillStyle = L.cap; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (k - 1.5) * w / 4, base - h + 2 + (k % 2) * 3, w / 3.2, 0, Math.PI * 2); g.fill(); } }
    }
  } else if (L.k === 'cliffs') {
    const top = L.top * H;
    g.beginPath(); g.moveTo(0, top); g.lineTo(W * L.w * 0.7, top + 20); g.lineTo(W * L.w, base); g.lineTo(W * L.w, H); g.lineTo(0, H); g.fill();
    g.beginPath(); g.moveTo(W, top + 30); g.lineTo(W * (1 - L.w * 0.7), top + 45); g.lineTo(W * (1 - L.w), base); g.lineTo(W * (1 - L.w), H); g.lineTo(W, H); g.fill();
  } else if (L.k === 'terraces') {
    const n = L.n, step = (H - base) / n;
    for (let i = 0; i < n; i++) {
      const y = base + i * step;
      g.fillStyle = L.cols[i % L.cols.length]; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * 0.012 + i * 0.9) * step * 0.6);
      g.lineTo(W, H); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.2; g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * 0.012 + i * 0.9) * step * 0.6);
      g.stroke();
    }
  } else if (L.k === 'rows') {
    g.fillStyle = L.c2; g.fillRect(0, base, W, H - base);
    g.fillStyle = L.c; const vx = W * 0.5, vy = base - 10;
    for (let i = -L.n; i <= L.n; i++) {
      const x0 = vx + i * 70, x1 = vx + (i + 0.45) * 70;
      g.beginPath(); g.moveTo(vx + i * 3, vy + 12); g.lineTo(vx + (i + 0.45) * 3, vy + 12); g.lineTo(x1, H); g.lineTo(x0, H); g.fill();
    }
  } else if (L.k === 'field') {
    g.fillStyle = L.c; g.fillRect(0, base, W, H - base);
    g.fillStyle = L.dot;
    for (let i = 0; i < 260; i++) { const y = base + Math.pow(r(), 0.7) * (H - base); g.beginPath(); g.arc(r() * W, y, 0.8 + (y - base) / (H - base) * 2.4, 0, Math.PI * 2); g.fill(); }
  } else if (L.k === 'canopy') {
    bumps(g, base, L.r || 24, L.c, L.p * 31);
  }
}

function tree(g, kind, x, y, s, col) {
  if (kind === 'pine') {
    g.fillStyle = col;
    for (let k = 0; k < 3; k++) { const w = (16 - k * 3.5) * s, ty = y - (k * 14 + 22) * s; g.beginPath(); g.moveTo(x, ty - 12 * s); g.lineTo(x + w, ty + 14 * s); g.lineTo(x - w, ty + 14 * s); g.fill(); }
    g.fillRect(x - 1.5 * s, y - 8 * s, 3 * s, 8 * s);
  } else if (kind === 'cypress') {
    g.fillStyle = col; g.beginPath(); g.ellipse(x, y - 30 * s, 7 * s, 30 * s, 0, 0, Math.PI * 2); g.fill();
  } else if (kind === 'palm') {
    g.strokeStyle = '#8a6a55'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 10 * s, y - 30 * s, x + 4 * s, y - 56 * s); g.stroke();
    g.fillStyle = col;
    for (let k = 0; k < 6; k++) { g.save(); g.translate(x + 4 * s, y - 56 * s); g.rotate(-2.6 + k * 0.9); g.beginPath(); g.ellipse(14 * s, 0, 15 * s, 4 * s, 0.25, 0, Math.PI * 2); g.fill(); g.restore(); }
  } else if (kind === 'baobab') {
    g.fillStyle = col; g.beginPath(); g.moveTo(x - 7 * s, y); g.lineTo(x - 5 * s, y - 50 * s); g.lineTo(x + 5 * s, y - 50 * s); g.lineTo(x + 7 * s, y); g.fill();
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.ellipse(x + k * 6 * s, y - 56 * s - Math.abs(k) * -2 * s, 6 * s, 3.5 * s, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    const crowns = { blossom: ['#ffc4d6', '#ffadc8'], maple: ['#f59a5a', '#e7704f', '#f6c35d'], birch: ['#bfe3a8', '#a6d690'] }[kind] || [col];
    g.strokeStyle = kind === 'birch' ? '#f3f1ea' : '#a07a6a'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 34 * s); g.stroke();
    for (let k = 0; k < 7; k++) { g.fillStyle = crowns[k % crowns.length]; g.beginPath(); g.arc(x + Math.cos(k * 0.9) * 16 * s, y - 40 * s + Math.sin(k * 1.7) * 9 * s, 13 * s, 0, Math.PI * 2); g.fill(); }
  }
}

function extraStatic(g, e) {
  if (e.k === 'waterfall') {
    const x = e.x * W, y0 = e.y0 * H, y1 = e.y1 * H, w = e.w;
    g.fillStyle = vgrad(g, y0, y1, ['rgba(255,255,255,.95)', 'rgba(220,240,255,.85)']); g.fillRect(x - w / 2, y0, w, y1 - y0);
    softBlob(g, x, y1, w * 1.6, 22, '#ffffff', 0.9);
  } else if (e.k === 'rainbow') {
    ['#ff9aa2', '#ffd29a', '#fff3a0', '#b5ead7', '#a0c4ff', '#c7a0ff'].forEach((c, i) => {
      g.strokeStyle = c; g.globalAlpha = 0.22; g.lineWidth = 6; g.beginPath(); g.arc(e.x * W, e.y * H, e.r - i * 6, Math.PI, 0); g.stroke();
    });
    g.globalAlpha = 1;
  } else if (e.k === 'icebergs') {
    for (const [x, y, s] of e.items) {
      const X = x * W, Y = y * H;
      g.fillStyle = 'rgba(70,120,170,.25)'; g.beginPath(); g.ellipse(X, Y + 3, 40 * s, 5 * s, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(X - 38 * s, Y); g.lineTo(X - 24 * s, Y - 30 * s); g.lineTo(X - 8 * s, Y - 36 * s); g.lineTo(X + 6 * s, Y - 48 * s); g.lineTo(X + 22 * s, Y - 26 * s); g.lineTo(X + 38 * s, Y); g.closePath(); g.fill();
      g.fillStyle = '#b9d6f0'; g.beginPath(); g.moveTo(X + 6 * s, Y - 48 * s); g.lineTo(X + 22 * s, Y - 26 * s); g.lineTo(X + 38 * s, Y); g.lineTo(X + 4 * s, Y); g.lineTo(X + 10 * s, Y - 24 * s); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(90,140,190,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X - 38 * s, Y); g.lineTo(X + 38 * s, Y); g.stroke();
    }
  } else if (e.k === 'yurt') {
    const x = e.x * W, y = e.y * H;
    g.fillStyle = '#eef0f8'; g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x - 18, y - 12); g.quadraticCurveTo(x, y - 30, x + 18, y - 12); g.lineTo(x + 18, y); g.fill();
    g.fillStyle = '#ffd27a'; g.fillRect(x - 4, y - 10, 8, 10); softBlob(g, x, y - 5, 26, 18, '#ffd27a', 0.5);
  } else if (e.k === 'boat') {
    const x = e.x * W, y = e.y * H;
    g.fillStyle = e.c || '#7a6a8a'; g.beginPath(); g.moveTo(x - 16, y - 4); g.lineTo(x + 16, y - 4); g.lineTo(x + 10, y + 2); g.lineTo(x - 10, y + 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.moveTo(x, y - 30); g.lineTo(x + 12, y - 6); g.lineTo(x, y - 6); g.fill();
  } else if (e.k === 'sheep') {
    const r = seeded(7);
    g.fillStyle = '#ffffff';
    for (let i = 0; i < 16; i++) { const x = r() * W, y = (e.y0 + r() * (e.y1 - e.y0)) * H; g.beginPath(); g.ellipse(x, y, 3.5, 2.5, 0, 0, Math.PI * 2); g.fill(); }
  } else if (e.k === 'coral') {
    for (const [x, y, s, col] of e.items) {
      g.fillStyle = col;
      for (let k = 0; k < 6; k++) { const h = Math.abs(Math.sin(k * 1.3)) * 30 * s + 6 * s; g.beginPath(); g.arc(x * W + (k - 2.5) * 7 * s, y * H - h, 7 * s, 0, Math.PI * 2); g.fill(); g.fillRect(x * W + (k - 2.5) * 7 * s - 2 * s, y * H - h, 4 * s, h + 4); }
    }
  }
}

function paintStatic(g, R, variant) {
  g.fillStyle = vgrad(g, 0, (R.skyEnd || 1) * H, R.sky); g.fillRect(0, 0, W, H);
  if (R.stars) { const r = seeded(3); for (let i = 0; i < R.stars; i++) { g.fillStyle = `rgba(255,255,255,${0.25 + r() * 0.6})`; g.fillRect(r() * W, r() * H * 0.6, 1.4, 1.4); } }
  if (R.milky) { for (let i = 0; i < 9; i++) softBlob(g, W * (0.05 + i * 0.12), H * (0.42 - i * 0.04), 70, 26, '#cdd6ff', 0.16); }
  if (R.sun) { const s = R.sun; softBlob(g, s.x * W, s.y * H, s.glow || 120, s.glow || 120, s.halo || '#fff2d6', 0.85); g.fillStyle = s.c || '#fffaf0'; g.beginPath(); g.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2); g.fill(); }
  if (R.moon) {
    const m = R.moon, k = 4, c = document.createElement('canvas'); c.width = c.height = m.r * 2 * k + 4;
    const mg = c.getContext('2d'); mg.scale(k, k);
    mg.fillStyle = '#f6f3e6'; mg.beginPath(); mg.arc(m.r, m.r, m.r, 0, Math.PI * 2); mg.fill();
    mg.globalCompositeOperation = 'destination-out'; mg.beginPath(); mg.arc(m.r * 1.45, m.r * 0.8, m.r, 0, Math.PI * 2); mg.fill();
    softBlob(g, m.x * W, m.y * H, 46, 46, '#dfe6ff', 0.35);
    g.drawImage(c, m.x * W - m.r, m.y * H - m.r, c.width / k, c.height / k);
  }
  (R.clouds || []).forEach(([x, y, rx, ry, a]) => softBlob(g, x * W, y * H, rx, ry, '#ffffff', a));
  const wy = R.water ? R.water.y * H : H + 1;
  for (const L of R.layers || []) { if (!L.front) ridge(g, L); }
  for (const T of R.trees || []) if (!T.front) for (const [x, y, s] of T.items) tree(g, T.k, x * W, y * H, s, T.c);
  for (const e of R.extras || []) if (!e.front) extraStatic(g, e);
  if (R.water) {
    // reflect everything above the waterline, then tint it as water
    g.save(); g.beginPath(); g.rect(0, wy, W, H - wy); g.clip();
    g.translate(0, wy * 2); g.scale(1, -1); g.globalAlpha = R.water.mirror ? 0.9 : 0.4;
    g.drawImage(g.canvas, 0, 0, W, H); g.restore();
    g.globalAlpha = R.water.mirror ? 0.25 : 0.62; g.fillStyle = vgrad(g, wy, H, R.water.c); g.fillRect(0, wy, W, H - wy); g.globalAlpha = 1;
    g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(0, wy, W, 1.5);
  }
  for (const L of R.layers || []) { if (L.front) ridge(g, L); }
  for (const T of R.trees || []) if (T.front) for (const [x, y, s] of T.items) tree(g, T.k, x * W, y * H, s, T.c);
  for (const e of R.extras || []) if (e.front) extraStatic(g, e);
  if (variant && variant.tint) { g.fillStyle = variant.tint; g.fillRect(0, 0, W, H); }
}

function paintAnim(g, R, now) {
  const P = R.particles || {}, n = P.n || 0, light = !R.dark;
  if (R.aurora) {
    g.save(); g.globalCompositeOperation = 'lighter';
    R.aurora.forEach((col, k) => {
      const gr = g.createLinearGradient(0, 0, 0, 130); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr;
      for (let x = 0; x < W; x += 5) {
        const y = H * 0.16 + Math.sin(x * 0.011 + now / 2400 + k * 1.3) * 34 + k * 20;
        g.globalAlpha = 0.07 + 0.05 * Math.sin(x * 0.03 + now / 900 + k); g.translate(x, y); g.fillRect(0, 0, 5, 130); g.translate(-x, -y);
      }
    });
    g.restore();
  }
  if (R.water && R.water.shimmer && R.sun) {
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (let i = 0; i < 9; i++) { const w = 60 - i * 5 + Math.sin(now / 500 + i) * 14; g.fillRect(R.sun.x * W - w / 2, R.water.y * H + 4 + i * 11, w, 2); }
  }
  for (const e of R.extras || []) {
    if (e.k === 'waterfall') { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; for (let i = 0; i < 6; i++) { const x = e.x * W - e.w / 2 + (i + 0.5) * e.w / 6, y = e.y0 * H + wrapN(now * 0.25 + i * 37, (e.y1 - e.y0) * H); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 14); g.stroke(); } }
    if (e.k === 'rays') { g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 5; i++) { const x = W * (0.1 + i * 0.22) + Math.sin(now / 3000 + i) * 24; const gr = g.createLinearGradient(0, 0, 0, H * 0.8); gr.addColorStop(0, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 14, 0); g.lineTo(x + 14, 0); g.lineTo(x + 70, H * 0.8); g.lineTo(x + 10, H * 0.8); g.fill(); } g.restore(); }
    if (e.k === 'seaweed') { g.strokeStyle = '#3fae8c'; g.lineWidth = 4; for (const bx of e.xs) { g.beginPath(); g.moveTo(bx * W, H); for (let k = 1; k <= 6; k++) g.lineTo(bx * W + Math.sin(now / 800 + k + bx * 9) * 6 * k / 3, H - k * 18); g.stroke(); } }
    if (e.k === 'waves') { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { const y = e.y * H + i * 8 + Math.sin(now / 700 + i) * 3; g.beginPath(); for (let x = 0; x <= W; x += 10) g.lineTo(x, y + Math.sin(x * 0.05 + now / 500 + i) * 2); g.stroke(); } }
    if (e.k === 'mistband') { for (let i = 0; i < 4; i++) softBlob(g, wrapN(i * 130 + now * 0.01 * (1 + i % 2), W + 200) - 100, e.y * H + i * 12, 150, 22, '#ffffff', 0.35); }
  }
  for (let i = 0; i < n; i++) {
    const k = P.k;
    if (k === 'petals' || k === 'leaves') {
      const x = wrapN(i * 137 + now * 0.018 * (1 + i % 3) + Math.sin(now / 900 + i) * 14, W + 40) - 20, y = wrapN(i * 91 + now * 0.035 * (1 + i % 4), H + 40) - 20;
      g.save(); g.translate(x, y); g.rotate(now / 600 + i); g.scale(1, 0.55 + 0.45 * Math.sin(now / 300 + i));
      g.fillStyle = k === 'petals' ? (i % 2 ? '#ffb7cf' : '#ffd3e1') : ['#f59a5a', '#e7704f', '#f6c35d'][i % 3];
      g.beginPath(); g.ellipse(0, 0, k === 'petals' ? 4.5 : 5.5, 3, 0, 0, Math.PI * 2); g.fill(); g.restore();
    } else if (k === 'snow') {
      const x = wrapN(i * 61 + Math.sin(now / 1200 + i) * 16, W), y = wrapN(i * 97 + now * 0.03 * (1 + i % 3), H);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(x, y, 1 + (i % 3) * 0.6, 0, Math.PI * 2); g.fill();
    } else if (k === 'motes' || k === 'sparkles') {
      const x = wrapN(i * 97 + Math.sin(now / 2600 + i) * 18, W), y = k === 'motes' ? wrapN(H * 0.1 + i * 53 - now * 0.008 * (1 + i % 3), H * 0.8) : wrapN(i * 71, H * 0.6);
      g.globalAlpha = Math.max(0, 0.3 + 0.4 * Math.sin(now / (k === 'motes' ? 700 : 400) + i * 1.7));
      softBlob(g, x, y, k === 'motes' ? 5 : 3, k === 'motes' ? 5 : 3, P.c || '#fff6d8', 1); g.globalAlpha = 1;
    } else if (k === 'bubbles') {
      const y = H - wrapN(i * 71 + now * 0.04 * (1 + i % 3), H), x = wrapN(i * 53, W) + Math.sin(now / 600 + i) * 6;
      g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 2 + i % 4, 0, Math.PI * 2); g.stroke();
    } else if (k === 'mist') {
      softBlob(g, wrapN(i * 150 + now * 0.012 * (1 + i % 2), W + 240) - 120, H * (0.35 + (i % 4) * 0.12), 160, 30, '#ffffff', 0.28);
    } else if (k === 'birds') {
      const x = wrapN(i * 90 + now * 0.012, W + 60) - 30, y = H * (0.2 + (i % 5) * 0.05) + Math.sin(now / 900 + i) * 6, f = 4 + Math.sin(now / 200 + i) * 2;
      g.strokeStyle = light ? 'rgba(80,60,110,.55)' : 'rgba(230,230,255,.6)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x - 7, y - f); g.quadraticCurveTo(x - 3, y - 1, x, y); g.quadraticCurveTo(x + 3, y - 1, x + 7, y - f); g.stroke();
    } else if (k === 'butterflies') {
      const x = wrapN(i * 113 + now * 0.02 + Math.sin(now / 700 + i) * 30, W), y = H * (0.45 + (i % 5) * 0.08) + Math.sin(now / 500 + i * 2) * 14, f = Math.abs(Math.sin(now / 90 + i));
      g.fillStyle = ['#ffd166', '#ff9ec7', '#a0c4ff', '#ffffff'][i % 4];
      g.beginPath(); g.ellipse(x - 3 * f, y, 3 * f + 0.5, 4, 0, 0, Math.PI * 2); g.ellipse(x + 3 * f, y, 3 * f + 0.5, 4, 0, 0, Math.PI * 2); g.fill();
    }
  }
}

// ---------- 25 places (name, sky, light, layers, details) ----------
const LANDS = [
  { key: 'moraine', name: '모레인 호수의 새벽', place: 'CANADA', pal: 'cool', accent: '#7a8cf0', accent2: '#f29ac2',
    sky: ['#9fb7f0', '#d9c6ee', '#ffe0c8'], skyEnd: 0.6, sun: { x: 0.68, y: 0.56, r: 22 }, clouds: [[0.2, 0.17, 120, 24, 0.5], [0.75, 0.26, 100, 20, 0.4]],
    layers: [{ k: 'peaks', b: 0.5, a: 0.18, f: 5, p: 1, c: '#b9b4e4', snow: '#f4f1ff' }, { k: 'peaks', b: 0.57, a: 0.08, f: 8, p: 4, c: '#9a95d2' }],
    water: { y: 0.58, c: ['#cfe0f5', '#8fb6e0'], shimmer: true }, trees: [{ k: 'pine', c: '#5d6aa8', front: true, items: [[0.04, 0.62, 1], [0.1, 0.64, 0.8], [0.88, 0.62, 1.1], [0.95, 0.63, 0.8]] }],
    particles: { k: 'motes', n: 20 } },
  { key: 'kyoto', name: '교토 벚꽃 언덕', place: 'JAPAN', pal: 'bloom', accent: '#ef7fa6', accent2: '#7fc4ea',
    sky: ['#ffdbe7', '#fff0e4', '#fff7ee'], clouds: [[0.3, 0.16, 160, 40, 0.7], [0.8, 0.3, 120, 30, 0.6]],
    layers: [{ k: 'smooth', b: 0.58, a: 0.03, f: 0.012, p: 0.5, c: '#d6eed8' }, { k: 'smooth', b: 0.67, a: 0.025, f: 0.016, p: 2, c: '#bfe5c6' }, { k: 'smooth', b: 0.79, a: 0.02, f: 0.02, p: 4, c: '#a7dab3' }],
    trees: [{ k: 'blossom', items: [[0.12, 0.66, 1], [0.3, 0.7, 0.8], [0.82, 0.64, 1.1], [0.62, 0.76, 0.9]] }], particles: { k: 'petals', n: 34 } },
  { key: 'maldives', name: '몰디브 산호 바다', place: 'MALDIVES', pal: 'sea', accent: '#2fb5c8', accent2: '#f48fb8',
    sky: ['#c8f4ef', '#86d8dc', '#4fa9c4', '#2f7aa8'],
    layers: [{ k: 'smooth', b: 0.88, a: 0.012, f: 0.018, p: 1, c: '#f1ddb4' }, { k: 'smooth', b: 0.92, a: 0.01, f: 0.025, p: 3, c: '#e8cf9f' }],
    extras: [{ k: 'coral', items: [[0.12, 0.9, 1, '#ff9fb8'], [0.36, 0.92, 0.8, '#ffb48a'], [0.7, 0.9, 1, '#c7a0ff'], [0.9, 0.92, 0.7, '#ff9fb8']] }, { k: 'rays' }, { k: 'seaweed', xs: [0.05, 0.35, 0.65, 0.95] }],
    particles: { k: 'bubbles', n: 22 } },
  { key: 'iceland', name: '아이슬란드 오로라', place: 'ICELAND', pal: 'night', accent: '#6ff2c6', accent2: '#c38cff', dark: true,
    sky: ['#0a1430', '#172c58', '#2b4a7c'], stars: 90, aurora: ['#6ff2c6', '#62cdf5', '#c38cff'],
    layers: [{ k: 'smooth', b: 0.8, a: 0.018, f: 0.014, p: 2, c: '#cfdcf2' }, { k: 'smooth', b: 0.86, a: 0.013, f: 0.02, p: 5, c: '#e6eefa' }],
    trees: [{ k: 'pine', c: '#132a48', items: [[0.03, 0.82, 0.9], [0.12, 0.82, 1.1], [0.22, 0.83, 0.8], [0.7, 0.82, 1], [0.8, 0.82, 1.2], [0.9, 0.83, 0.8], [0.97, 0.82, 1]] }],
    particles: { k: 'snow', n: 40 } },
  { key: 'haleakala', name: '할레아칼라 구름 위 노을', place: 'HAWAII', pal: 'warm', accent: '#f2789a', accent2: '#9d8cf5',
    sky: ['#7b73ea', '#c98bd9', '#ff9fb0', '#ffd49c'], skyEnd: 0.75, sun: { x: 0.5, y: 0.62, r: 34, glow: 150, halo: '#fff0c8' },
    clouds: [[0.25, 0.2, 140, 22, 0.6], [0.78, 0.34, 120, 18, 0.6]],
    layers: [{ k: 'canopy', b: 0.68, r: 26, p: 3, c: '#ffd8cc' }, { k: 'canopy', b: 0.76, r: 30, p: 7, c: '#ffc2cf' }, { k: 'canopy', b: 0.86, r: 34, p: 11, c: '#f4aacb' }],
    particles: { k: 'birds', n: 5 } },
  { key: 'sahara', name: '사하라 사막의 별밤', place: 'MOROCCO', pal: 'night', accent: '#f6b26b', accent2: '#8a9cff', dark: true,
    sky: ['#141a3d', '#3a2f6b', '#c47a8a'], stars: 130, milky: true, moon: { x: 0.76, y: 0.16, r: 15 },
    layers: [{ k: 'dunes', b: 0.72, a: 0.05, f: 0.008, p: 1, c: '#c98a6a' }, { k: 'dunes', b: 0.8, a: 0.05, f: 0.011, p: 3, c: '#a96c56' }, { k: 'dunes', b: 0.9, a: 0.04, f: 0.015, p: 6, c: '#8a5446' }],
    particles: { k: 'sparkles', n: 30 } },
  { key: 'provence', name: '프로방스 라벤더 들판', place: 'FRANCE', pal: 'bloom', accent: '#9b7fd4', accent2: '#f7a982',
    sky: ['#a8c6f5', '#ffe1c2', '#ffd29a'], skyEnd: 0.6, sun: { x: 0.3, y: 0.5, r: 20 },
    layers: [{ k: 'smooth', b: 0.52, a: 0.02, f: 0.01, p: 2, c: '#c9b8d8' }, { k: 'rows', b: 0.57, n: 8, c: '#9b7fd4', c2: '#c7b2ec' }],
    trees: [{ k: 'cypress', c: '#4f6b5a', items: [[0.18, 0.56, 0.9], [0.22, 0.56, 0.7], [0.84, 0.55, 1]] }], particles: { k: 'butterflies', n: 10 } },
  { key: 'uyuni', name: '우유니 하늘 거울', place: 'BOLIVIA', pal: 'cool', accent: '#6fa8ff', accent2: '#f59ab8',
    sky: ['#8fc3ff', '#c9dcff', '#ffe9f2'], skyEnd: 0.5,
    clouds: [[0.2, 0.18, 90, 36, 0.9], [0.55, 0.12, 110, 40, 0.9], [0.85, 0.24, 80, 30, 0.85], [0.4, 0.33, 70, 22, 0.8]],
    layers: [{ k: 'smooth', b: 0.495, a: 0.008, f: 0.02, p: 1, c: '#b9c3e8' }],
    water: { y: 0.5, c: ['#d7e4ff', '#f5e4f0'], mirror: true }, particles: { k: 'sparkles', n: 18, c: '#ffffff' } },
  { key: 'guilin', name: '계림 안개 산수', place: 'CHINA', pal: 'green', accent: '#5fae95', accent2: '#f59ab8',
    sky: ['#d7e6e0', '#eef3ea', '#f6f1e6'],
    layers: [{ k: 'pillars', b: 0.62, a: 0.3, f: 9, p: 2, c: '#b8cfc5' }, { k: 'pillars', b: 0.7, a: 0.26, f: 6, p: 5, c: '#8fb3a5', w: 1.6 }],
    water: { y: 0.72, c: ['#cfe3dc', '#a7c9bf'] }, extras: [{ k: 'boat', x: 0.4, y: 0.78, front: true }, { k: 'mistband', y: 0.55 }], particles: { k: 'mist', n: 5 } },
  { key: 'canyon', name: '그랜드 캐니언 노을', place: 'USA', pal: 'warm', accent: '#e9895f', accent2: '#8a8ee8',
    sky: ['#6d7fd6', '#f2a07b', '#ffd8a0'], skyEnd: 0.6, sun: { x: 0.72, y: 0.46, r: 18 },
    layers: [{ k: 'mesa', b: 0.6, a: 0.12, p: 1, c: '#e3a585' }, { k: 'mesa', b: 0.72, a: 0.14, p: 4, c: '#c97a5e' }, { k: 'mesa', b: 0.86, a: 0.12, p: 7, c: '#a85a48' }],
    particles: { k: 'birds', n: 4 } },
  { key: 'fjord', name: '노르웨이 피오르', place: 'NORWAY', pal: 'cool', accent: '#5f9fc0', accent2: '#f29ac2',
    sky: ['#9cc4e8', '#d5e7f2', '#f3efe6'],
    layers: [{ k: 'cliffs', b: 0.66, top: 0.22, w: 0.42, c: '#9ab3c6' }, { k: 'cliffs', b: 0.7, top: 0.34, w: 0.3, c: '#6f8fa6' }],
    water: { y: 0.66, c: ['#9fc6d6', '#5f97ad'] }, extras: [{ k: 'waterfall', x: 0.2, y0: 0.38, y1: 0.66, w: 8 }, { k: 'boat', x: 0.58, y: 0.74, front: true }], particles: { k: 'mist', n: 4 } },
  { key: 'halong', name: '하롱베이 에메랄드 바다', place: 'VIETNAM', pal: 'sea', accent: '#3fb8a8', accent2: '#ffad7a',
    sky: ['#b9e2f0', '#e8f4ee', '#fff3df'],
    layers: [{ k: 'pillars', b: 0.62, a: 0.14, f: 7, p: 3, c: '#9cc8b8', w: 2.2 }, { k: 'pillars', b: 0.64, a: 0.2, f: 4, p: 8, c: '#6fae9a', w: 2.6 }],
    water: { y: 0.63, c: ['#9fe0d0', '#4fb3a8'] }, extras: [{ k: 'boat', x: 0.7, y: 0.72, c: '#b06a5a', front: true }], particles: { k: 'birds', n: 4 } },
  { key: 'bali', name: '발리 계단식 논', place: 'INDONESIA', pal: 'earth', accent: '#6fb86a', accent2: '#f6a57e',
    sky: ['#bde3f2', '#e9f6e6'],
    layers: [{ k: 'canopy', b: 0.44, r: 20, p: 2, c: '#7cbf8a' }, { k: 'terraces', b: 0.5, n: 9, cols: ['#b8e08a', '#9fd47a', '#c9e89c'] }],
    trees: [{ k: 'palm', c: '#3f7d55', items: [[0.08, 0.6, 1], [0.9, 0.56, 1.2], [0.75, 0.62, 0.8]] }], particles: { k: 'butterflies', n: 10 } },
  { key: 'maple', name: '캐나다 단풍 숲', place: 'QUEBEC', pal: 'earth', accent: '#e7804f', accent2: '#8ab0f0',
    sky: ['#c7d8f0', '#f5e2cf'],
    layers: [{ k: 'smooth', b: 0.6, a: 0.03, f: 0.01, p: 1, c: '#e8b08a' }, { k: 'smooth', b: 0.75, a: 0.02, f: 0.015, p: 3, c: '#d98a5e' }],
    trees: [{ k: 'maple', items: [[0.08, 0.66, 1], [0.24, 0.7, 0.9], [0.42, 0.66, 0.8], [0.6, 0.71, 1], [0.78, 0.66, 0.9], [0.94, 0.7, 1.1]] }], particles: { k: 'leaves', n: 26 } },
  { key: 'iguazu', name: '이구아수 폭포와 무지개', place: 'BRAZIL', pal: 'green', accent: '#45b38c', accent2: '#ff9ec7',
    sky: ['#bfe4ef', '#e6f5ee'],
    layers: [{ k: 'canopy', b: 0.34, r: 18, p: 4, c: '#7fbf8f' }, { k: 'cliffs', b: 0.78, top: 0.36, w: 0.5, c: '#5f9b7a' }],
    water: { y: 0.8, c: ['#bfe3e0', '#7fbfbd'] },
    extras: [{ k: 'waterfall', x: 0.36, y0: 0.4, y1: 0.8, w: 22 }, { k: 'waterfall', x: 0.5, y0: 0.38, y1: 0.8, w: 30 }, { k: 'waterfall', x: 0.64, y0: 0.42, y1: 0.8, w: 18 }, { k: 'rainbow', x: 0.5, y: 0.82, r: 120 }],
    particles: { k: 'mist', n: 5 } },
  { key: 'newzealand', name: '뉴질랜드 초원 언덕', place: 'NEW ZEALAND', pal: 'green', accent: '#5fbf7a', accent2: '#8ab0f0',
    sky: ['#a9d4f5', '#e6f3fb'], clouds: [[0.25, 0.15, 110, 34, 0.85], [0.7, 0.22, 90, 28, 0.8]],
    layers: [{ k: 'peaks', b: 0.5, a: 0.1, f: 4, p: 2, c: '#b9cbe6', snow: '#f4f8ff' }, { k: 'smooth', b: 0.6, a: 0.04, f: 0.01, p: 1, c: '#b6e3a0' }, { k: 'smooth', b: 0.72, a: 0.035, f: 0.014, p: 3, c: '#93d18a' }, { k: 'smooth', b: 0.84, a: 0.03, f: 0.02, p: 5, c: '#78c07a' }],
    extras: [{ k: 'sheep', y0: 0.66, y1: 0.8, front: true }], particles: { k: 'birds', n: 4 } },
  { key: 'zhangjiajie', name: '장가계 구름 기둥', place: 'CHINA', pal: 'green', accent: '#6f9f96', accent2: '#c69cf0',
    sky: ['#cfdcec', '#eef2f5'],
    layers: [{ k: 'pillars', b: 0.7, a: 0.45, f: 10, p: 4, c: '#a9bcb8', cap: '#b9d4b0' }, { k: 'pillars', b: 0.8, a: 0.42, f: 6, p: 9, c: '#6f8f88', cap: '#8fbf86', w: 1.3 }],
    extras: [{ k: 'mistband', y: 0.62 }, { k: 'mistband', y: 0.78 }], particles: { k: 'mist', n: 6 } },
  { key: 'mongolia', name: '몽골 초원의 은하수', place: 'MONGOLIA', pal: 'night', accent: '#8a9cff', accent2: '#ffd27a', dark: true,
    sky: ['#0b1030', '#1c2a5a', '#3b4f7a'], stars: 160, milky: true,
    layers: [{ k: 'smooth', b: 0.8, a: 0.012, f: 0.01, p: 2, c: '#2f4d4a' }, { k: 'smooth', b: 0.88, a: 0.008, f: 0.015, p: 4, c: '#26403d' }],
    extras: [{ k: 'yurt', x: 0.7, y: 0.81 }], particles: { k: 'sparkles', n: 30 } },
  { key: 'patagonia', name: '파타고니아 분홍 봉우리', place: 'ARGENTINA', pal: 'cool', accent: '#e98aa0', accent2: '#7f9fd0',
    sky: ['#9fb1ea', '#f3bfd0', '#ffd9b8'], skyEnd: 0.7,
    layers: [{ k: 'peaks', b: 0.6, a: 0.34, f: 3, p: 7, c: '#e9a6b8', snow: '#fff0f4' }, { k: 'peaks', b: 0.68, a: 0.1, f: 6, p: 2, c: '#8b88b8' }],
    water: { y: 0.7, c: ['#a6c3e6', '#7f9fd0'] }, particles: { k: 'motes', n: 16, c: '#ffe8f0' } },
  { key: 'aegean', name: '에게해 노을 바다', place: 'GREECE', pal: 'warm', accent: '#e9789a', accent2: '#8a8ee8',
    sky: ['#7f86e6', '#f39fb5', '#ffd29e'], skyEnd: 0.6, sun: { x: 0.5, y: 0.57, r: 28, glow: 140 },
    layers: [{ k: 'smooth', b: 0.59, a: 0.015, f: 0.02, p: 2, c: '#8e7fb8' }],
    water: { y: 0.6, c: ['#f6b9b0', '#9a8fd8'], shimmer: true }, extras: [{ k: 'boat', x: 0.25, y: 0.7, c: '#6a5a8a', front: true }], particles: { k: 'birds', n: 5 } },
  { key: 'amazon', name: '아마존 열대우림 안개', place: 'PERU', pal: 'green', accent: '#4fae7a', accent2: '#ffd166',
    sky: ['#cfe8d8', '#eef6ea'],
    layers: [{ k: 'canopy', b: 0.5, r: 26, p: 1, c: '#9cc9a0' }, { k: 'canopy', b: 0.64, r: 30, p: 5, c: '#76b083' }, { k: 'canopy', b: 0.8, r: 34, p: 9, c: '#559a6b' }],
    extras: [{ k: 'mistband', y: 0.56 }, { k: 'mistband', y: 0.72 }], particles: { k: 'butterflies', n: 12 } },
  { key: 'baobab', name: '마다가스카르 바오밥 길', place: 'MADAGASCAR', pal: 'warm', accent: '#e9895f', accent2: '#8a8ee8',
    sky: ['#7d8ae0', '#f5a98a', '#ffd9a3'], skyEnd: 0.8, sun: { x: 0.55, y: 0.7, r: 36, glow: 160, halo: '#ffe2b0' },
    layers: [{ k: 'smooth', b: 0.79, a: 0.006, f: 0.01, p: 1, c: '#c98b6b' }],
    trees: [{ k: 'baobab', c: '#6b4a5e', items: [[0.1, 0.8, 1.3], [0.28, 0.8, 1], [0.46, 0.8, 1.2], [0.72, 0.8, 1.1], [0.9, 0.8, 1.4]] }], particles: { k: 'birds', n: 5 } },
  { key: 'boracay', name: '보라카이 하얀 해변', place: 'PHILIPPINES', pal: 'sea', accent: '#2fb8c8', accent2: '#ffad7a',
    sky: ['#9fdcf5', '#dff4fb'], clouds: [[0.3, 0.2, 100, 26, 0.8], [0.75, 0.14, 90, 22, 0.7]],
    water: { y: 0.6, c: ['#7fe0e0', '#3fb7c9'] },
    layers: [{ k: 'smooth', b: 0.8, a: 0.015, f: 0.012, p: 2, c: '#fbe8c8', front: true }],
    trees: [{ k: 'palm', c: '#3f8d65', front: true, items: [[0.1, 0.82, 1.2], [0.88, 0.8, 1.1]] }], extras: [{ k: 'waves', y: 0.77 }], particles: { k: 'sparkles', n: 16, c: '#ffffff' } },
  { key: 'antarctica', name: '남극 빙산의 바다', place: 'ANTARCTICA', pal: 'cool', accent: '#5f9fd8', accent2: '#c69cf0',
    sky: ['#9fc0ea', '#d8e7f8', '#f4f8ff'],
    layers: [{ k: 'peaks', b: 0.61, a: 0.06, f: 6, p: 3, c: '#e9f2fc', snow: '#ffffff' }],
    water: { y: 0.62, c: ['#8fc0e6', '#5a92c4'] }, extras: [{ k: 'icebergs', front: true, items: [[0.22, 0.7, 1.3], [0.62, 0.67, 0.8], [0.84, 0.78, 1.6]] }],
    particles: { k: 'snow', n: 24 } },
  { key: 'jeju', name: '제주 유채꽃과 한라산', place: 'KOREA', pal: 'earth', accent: '#f2b632', accent2: '#6fa8ff',
    sky: ['#a7d0f5', '#e6f3fb'], clouds: [[0.3, 0.15, 120, 30, 0.8], [0.78, 0.25, 90, 24, 0.7]],
    layers: [{ k: 'smooth', b: 0.5, a: 0.07, f: 0.006, p: 4.2, c: '#8fb5a6' }, { k: 'smooth', b: 0.62, a: 0.015, f: 0.012, p: 1, c: '#a9d39a' }, { k: 'field', b: 0.66, c: '#ffe680', dot: '#f2b400' }, { k: 'smooth', b: 0.78, a: 0.012, f: 0.02, p: 3, c: 'rgba(120,180,100,.55)' }, { k: 'field', b: 0.8, c: '#ffdf5a', dot: '#e9a800' }],
    particles: { k: 'butterflies', n: 12 } },
];
// Times of day used once every place has been seen, so stages keep coming.
const VARIANTS = [
  null,
  { suffix: '황혼', tint: 'rgba(255,140,90,.16)' },
  { suffix: '달밤', tint: 'rgba(20,28,80,.5)', dark: true },
  { suffix: '새벽 안개', tint: 'rgba(255,255,255,.22)' },
];
const landOf = s => {
  const R = LANDS[wrapN(s, LANDS.length)], V = VARIANTS[Math.floor(s / LANDS.length) % VARIANTS.length];
  return { R, V, name: V ? `${R.name} · ${V.suffix}` : R.name, dark: !!(R.dark || (V && V.dark)), key: `${R.key}${V ? '-' + V.suffix : ''}` };
};
// A small static thumbnail of a stage's landscape for the map.
const thumbCache = {};
function landThumb(s) {
  const L = landOf(s);
  if (thumbCache[L.key]) return thumbCache[L.key];
  const c = document.createElement('canvas'); c.width = 168; c.height = 312;
  const g = c.getContext('2d'); g.scale(168 / W, 312 / H); paintStatic(g, L.R, L.V);
  return (thumbCache[L.key] = c.toDataURL('image/jpeg', 0.8));
}
