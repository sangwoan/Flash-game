// Canvas drawing. Everything is drawn in logical units (420x780) and styled by the active theme TH.
const glowCache = {};
const RAINBOW = ['#ff3b3b', '#ff8c1a', '#ffd400', '#7dff4d', '#3ee6ff', '#4d7cff', '#b44dff', '#ff4fa3'];
// col must be #rrggbb: the gradient appends alpha digits to it.
function glow(col) {
  if (glowCache[col]) return glowCache[col];
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, col); gr.addColorStop(0.35, col + '88'); gr.addColorStop(1, col + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return glowCache[col] = c;
}
const HEART = ['01010', '11111', '11111', '01110', '00100'];
function heart(x, y, on) {
  ctx.fillStyle = on ? TH.hud.heart : TH.hud.heartOff;
  if (TH.heartStyle === 'vector') {
    const cx = x + 7.5, cy = y + 4;
    ctx.beginPath(); ctx.moveTo(cx, cy + 11);
    ctx.bezierCurveTo(cx - 9, cy + 5, cx - 8, cy - 4, cx - 3.6, cy - 4); ctx.bezierCurveTo(cx - 1.6, cy - 4, cx, cy - 2.6, cx, cy - 1);
    ctx.bezierCurveTo(cx, cy - 2.6, cx + 1.6, cy - 4, cx + 3.6, cy - 4); ctx.bezierCurveTo(cx + 8, cy - 4, cx + 9, cy + 5, cx, cy + 11);
    ctx.fill();
    if (on) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.beginPath(); ctx.arc(cx - 3.5, cy, 1.6, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (HEART[r][c] === '1') ctx.fillRect(x + c * 3, y + r * 3, 3, 3);
}
const DISP = s => `${TH.dw || ''} ${Math.round(s * TH.dsz)}px ${TH.disp}`;
const KO = s => `${s}px ${TH.ko}`;
function fmt(n) { n = Math.ceil(n - 1e-6); return n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n); }
function outlined(s, x, y, col, size, font = DISP) {
  ctx.font = font(size); ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 2.6); ctx.strokeStyle = TH.outline;
  ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function rr(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function brickColor(br) {
  const sp = TH.special[br.type];
  if (sp) return Array.isArray(sp) ? sp[0] : sp;
  return TH.ramp(br.hp / (BAL.hp(S.turn) * 2.2));
}
function ballColor() { return S.lv.fire ? '#ffb36b' : S.lv.chain ? '#bfefff' : TH.ball.core; }

// ---------- bricks ----------
function brickBody(br, w, h, col, now) {
  const st = TH.brick;
  if (st === 'jelly') {
    rr(0, 0, w, h, 10); ctx.fillStyle = col; ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(60,0,60,.22)');
    ctx.fillStyle = g; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; rr(6, 3, w * 0.45, 6, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(w - 9, 7, 2, 0, Math.PI * 2); ctx.fill();
  } else if (st === 'neon') {
    ctx.fillStyle = col; ctx.globalAlpha = 0.2; ctx.fillRect(0, 0, w, h); ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.globalAlpha = 0.35; ctx.lineWidth = 6; ctx.strokeRect(0, 0, w, h);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 6, 2); ctx.fillRect(0, 0, 2, 6); ctx.fillRect(w - 6, h - 2, 6, 2); ctx.fillRect(w - 2, h - 6, 2, 6);
  } else if (st === 'gem') {
    ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w - 6, 6); ctx.lineTo(6, 6); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.lineTo(w - 6, h - 6); ctx.lineTo(6, h - 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 6); ctx.lineTo(6, h - 6); ctx.lineTo(0, h); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w, h); ctx.fill();
    const gp = ((now / 1000 + br.id * 0.37) % 3) / 3 * (w + h * 2) - h;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(gp, h); ctx.lineTo(gp + h, 0); ctx.stroke(); ctx.restore();
    ctx.strokeStyle = 'rgba(255,213,74,.85)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  } else if (st === 'comic') {
    ctx.fillStyle = '#111'; ctx.fillRect(3, 3, w, h);
    ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,.2)';
    for (let y = h / 2; y < h; y += 5) for (let x = (y % 10 ? 2.5 : 0); x < w; x += 5) { ctx.beginPath(); ctx.arc(x, y, 1.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(4, 4, w * 0.3, 3);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, w, h);
  } else if (st === 'glass') {
    rr(0, 0, w, h, 7); ctx.fillStyle = col; ctx.fill();
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(255,255,255,.30)'); g.addColorStop(0.45, 'rgba(255,255,255,.04)'); g.addColorStop(1, 'rgba(0,0,20,.32)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.38)'; ctx.lineWidth = 1; rr(0.5, 0.5, w - 1, h - 1, 6.5); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(8, 2, w - 16, 1);
  } else {
    ctx.fillStyle = col; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(0, 0, w, 3);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, h - 3, w, 3);
  }
}
function drawItem(br, now) {
  const cx = br.X + br.Wd / 2, cy = br.Y + br.oy + br.Ht / 2, p = 1 + Math.sin(now / 160 + br.id) * 0.12;
  if (br.type === 'orb') {
    ctx.drawImage(glow(TH.accent), cx - 16, cy - 16, 32, 32);
    ctx.strokeStyle = TH.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 9 * p, 0, Math.PI * 2); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlined('+1', cx, cy + 1, TH.accent, 6);
    return;
  }
  const hz = br.type === 'lzh', L = 13 * p, f = br.flash;
  ctx.save(); ctx.translate(cx, cy); if (!hz) ctx.rotate(Math.PI / 2);
  ctx.drawImage(glow(TH.css.gold), -20, -20, 40, 40);
  ctx.fillStyle = f > 0.2 ? '#ffffff' : TH.css.gold;
  ctx.fillRect(-L, -2, L * 2, 4);
  ctx.beginPath(); ctx.moveTo(-L - 6, 0); ctx.lineTo(-L, -6); ctx.lineTo(-L, 6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(L + 6, 0); ctx.lineTo(L, -6); ctx.lineTo(L, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawBrick(br, now) {
  if (isItem(br)) { drawItem(br, now); return; }
  const x = br.X + (br.kx || 0), y = br.Y + br.oy + (br.ky || 0), w = br.Wd, h = br.Ht, f = br.flash;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(1 + f * 0.1, 1 - f * 0.06);
  ctx.translate(-w / 2, -h / 2);
  let col = brickColor(br);
  if (br.type === 'boss') {
    const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, TH.special.boss[0]); g.addColorStop(1, TH.special.boss[1]); col = g;
  }
  brickBody(br, w, h, col, now);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
  if (br.type === 'bomb') {
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 5; ctx.beginPath();
    for (let i = -h; i < w + h; i += 12) { ctx.moveTo(i, h); ctx.lineTo(i + h, 0); }
    ctx.stroke();
  } else if (br.type === 'steel') {
    ctx.fillStyle = 'rgba(30,34,48,.75)'; for (const [rx, ry] of [[4, 5], [w - 7, 5], [4, h - 8], [w - 7, h - 8]]) ctx.fillRect(rx, ry, 3, 3);
  } else if (br.type === 'slime') {
    const wob = Math.sin(now / 200 + br.id) * 2; ctx.fillStyle = 'rgba(0,90,40,.35)';
    ctx.fillRect(7, h - 6, 6, 6 + wob); ctx.fillRect(w - 16, h - 6, 6, 4 - wob); ctx.fillRect(w / 2, h - 6, 5, 6);
  } else if (br.type === 'chest') {
    if ((now / 400 + br.id) % 3 < 1) { ctx.fillStyle = '#fff'; ctx.fillRect(6, 6, 3, 3); ctx.fillRect(5, 7, 5, 1); ctx.fillRect(7, 5, 1, 5); }
  }
  ctx.restore();
  drawCracks(br, w, h);
  if (br.acid) { // acid stacks as green drops
    ctx.fillStyle = UPG.acid.col;
    for (let i = 0; i < Math.min(3, 1 + Math.floor(br.acid / 4)); i++) { ctx.beginPath(); ctx.arc(w - 7 - i * 7, 7, 2.6, 0, Math.PI * 2); ctx.fill(); }
  }
  if (br.r >= ROWS - 2) {
    ctx.strokeStyle = `rgba(255,60,90,${0.5 + 0.5 * Math.sin(now / 120)})`; ctx.lineWidth = 3; ctx.strokeRect(-1, -1, w + 2, h + 2);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const label = br.type === 'boss' ? 'BOSS ' + fmt(br.hp) : br.type === 'chest' ? 'XP ' + fmt(br.hp) : fmt(br.hp);
  ctx.font = `${TH.numWeight || ''} ${br.type === 'boss' ? TH.numSize + 2 : TH.numSize}px ${TH.num}`;
  if (TH.brick === 'glass') { ctx.fillStyle = 'rgba(0,0,30,.35)'; ctx.fillText(label, w / 2, h / 2 + 2.5); }
  if (TH.numStroke) { ctx.strokeStyle = TH.numStroke; ctx.lineWidth = 3; ctx.strokeText(label, w / 2, h / 2 + 1); }
  ctx.fillStyle = TH.numInk; ctx.fillText(label, w / 2, h / 2 + 1);
  if (f > 0) { ctx.fillStyle = `rgba(255,255,255,${f * 0.85})`; if (TH.brick === 'jelly' || TH.brick === 'glass') { rr(0, 0, w, h, TH.brick === 'glass' ? 7 : 10); ctx.fill(); } else ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}

// Cracks spread as a brick loses HP: one set below 70%, a second below 40%.
function crackSet(br, w, h) {
  let seed = br.id * 9301 + 49297;
  const r = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const lines = [];
  for (let n = 0; n < 4; n++) {
    const side = Math.floor(r() * 4);
    let px = side === 0 ? r() * w : side === 1 ? w : side === 2 ? r() * w : 0;
    let py = side === 0 ? 0 : side === 1 ? r() * h : side === 2 ? h : r() * h;
    const pts = [[px, py]], tx = w * (0.3 + r() * 0.4), ty = h * (0.3 + r() * 0.4);
    for (let k = 1; k <= 3; k++) { px += (tx - px) * 0.5 + (r() - 0.5) * 8; py += (ty - py) * 0.5 + (r() - 0.5) * 6; pts.push([px, py]); }
    lines.push(pts);
  }
  return lines;
}
function drawCracks(br, w, h) {
  const f = br.hp / br.maxHp;
  if (f > 0.7 || br.hp <= 0) return;
  br.cracks = br.cracks || crackSet(br, w, h);
  const n = f > 0.4 ? 2 : 4, dark = TH.brick === 'comic' ? '#111' : 'rgba(0,0,20,.5)';
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.lineJoin = 'round';
  for (const [col, lw, off] of [['rgba(255,255,255,.45)', 1, 0.8], [dark, TH.brick === 'comic' ? 2 : 1.4, 0]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    for (let i = 0; i < n; i++) br.cracks[i].forEach(([px, py], j) => j ? ctx.lineTo(px + off, py + off) : ctx.moveTo(px + off, py + off));
    ctx.stroke();
  }
  ctx.restore();
}
function drawShards() {
  const edge = TH.brick === 'comic' ? '#111' : TH.brick === 'glass' || TH.brick === 'neon' ? 'rgba(255,255,255,.55)' : null;
  for (const h of shards) {
    ctx.globalAlpha = Math.min(1, h.life / 0.4);
    ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot);
    ctx.beginPath(); ctx.moveTo(h.pts[0][0], h.pts[0][1]); ctx.lineTo(h.pts[1][0], h.pts[1][1]); ctx.lineTo(h.pts[2][0], h.pts[2][1]); ctx.closePath();
    ctx.fillStyle = h.col; ctx.fill();
    ctx.fillStyle = h.shade > 0 ? `rgba(255,255,255,${h.shade})` : `rgba(0,0,0,${-h.shade})`; ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = TH.brick === 'comic' ? 1.6 : 0.8; ctx.stroke(); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------- particles ----------
function drawParticles() {
  for (const p of parts) {
    const a = Math.min(1, p.life / p.max * 1.6), s = p.size;
    ctx.globalAlpha = a; ctx.fillStyle = p.col;
    if (p.kind === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(Math.cos(p.rot * 2), 1); ctx.fillRect(-s / 2, -s / 4, s, s / 2); ctx.restore();
    } else if (p.kind === 'coin') {
      ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.6, s * Math.abs(Math.cos(p.rot))), s, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd54a'; ctx.fill(); ctx.strokeStyle = '#a8740a'; ctx.lineWidth = 1; ctx.stroke();
    } else if (p.kind === 'spark') {
      ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.col; ctx.lineWidth = s * 0.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    } else if (p.kind === 'shard') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.6); ctx.lineTo(s, -s * 0.2); ctx.lineTo(-s * 0.2, s); ctx.closePath();
      ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    } else if (p.kind === 'dust') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = a * 0.35; ctx.beginPath(); ctx.arc(p.x, p.y, s * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
}

// ---------- big combo words ----------
function drawBigWord(bw, now) {
  const k = 1 - bw.life / bw.max, pop = k < 0.12 ? 0.4 + (k / 0.12) * 0.9 : 1.3 - Math.min(0.3, (k - 0.12) * 1.2);
  const a = Math.min(1, bw.life / (bw.max * 0.3));
  const x = W / 2, y = bw.y, size = bw.size;
  ctx.save(); ctx.globalAlpha = a; ctx.translate(x, y); ctx.scale(pop, pop);
  const style = bw.style || TH.wordStyle;
  if (style === 'slam') {
    // multi-break callout: drops in from 3x, shakes, then settles
    const k2 = 1 - bw.life / bw.max, sc = k2 < 0.1 ? 3 - k2 * 20 : 1 + Math.max(0, 0.15 - (k2 - 0.1)) ;
    ctx.restore(); ctx.save(); ctx.globalAlpha = Math.min(1, bw.life / (bw.max * 0.25));
    ctx.translate(W / 2 + (k2 < 0.3 ? (rnd() - 0.5) * 6 : 0), bw.y); ctx.rotate(-0.06); ctx.scale(sc, sc);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = DISP(bw.size); ctx.fillText(bw.s, 4, 5);
    outlined(bw.s, 0, 0, TH.css.gold, bw.size);
    ctx.restore(); return;
  }
  if (style === 'burst') {
    ctx.rotate(-0.08);
    ctx.beginPath();
    for (let i = 0; i < 24; i++) { const r = i % 2 ? 58 : 92, an = i / 24 * Math.PI * 2 + now / 900; ctx.lineTo(Math.cos(an) * r * 1.5, Math.sin(an) * r * 0.75); }
    ctx.closePath(); ctx.fillStyle = '#ffd400'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.stroke();
  } else if (style === 'rays') {
    ctx.save(); ctx.rotate(now / 700); ctx.fillStyle = 'rgba(255,213,74,.22)';
    for (let i = 0; i < 12; i++) { ctx.rotate(Math.PI / 6); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-24, -220); ctx.lineTo(24, -220); ctx.fill(); }
    ctx.restore();
  } else if (style === 'bubble') {
    ctx.font = DISP(size); const tw = ctx.measureText(bw.s).width;
    rr(-tw / 2 - 18, -size * TH.dsz * 0.75, tw + 36, size * TH.dsz * 1.5, size * TH.dsz * 0.75);
    ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = TH.accent; ctx.lineWidth = 4; ctx.stroke();
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (style === 'chrome' || style === 'rays') {
    ctx.font = DISP(size); ctx.lineJoin = 'round';
    const g = ctx.createLinearGradient(0, -size, 0, size);
    if (style === 'chrome') { g.addColorStop(0, '#39f3ff'); g.addColorStop(0.48, '#ffffff'); g.addColorStop(0.52, '#ff3ea5'); g.addColorStop(1, '#ffe14d'); }
    else { g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd54a'); g.addColorStop(1, '#c47a00'); }
    ctx.lineWidth = size / 2; ctx.strokeStyle = TH.outline; ctx.strokeText(bw.s, 0, 0);
    ctx.fillStyle = g; ctx.fillText(bw.s, 0, 0);
  } else if (style === 'burst') {
    outlined(bw.s, 0, 0, '#ff2a3d', size);
  } else if (style === 'bubble') {
    ctx.font = DISP(size); ctx.fillStyle = TH.accent; ctx.fillText(bw.s, 0, 0);
  } else if (style === 'clean') {
    ctx.font = DISP(size); const tw = ctx.measureText(bw.s).width;
    const g = ctx.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    g.addColorStop(0, bw.col || TH.accent); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, bw.col || '#9d8cff');
    ctx.shadowColor = bw.col || TH.accent; ctx.shadowBlur = 18;
    ctx.fillStyle = g; ctx.fillText(bw.s, 0, 0); ctx.shadowBlur = 0;
    const lw = tw * Math.min(1, k * 4);
    ctx.fillStyle = g; ctx.fillRect(-lw / 2, size * TH.dsz * 0.62, lw, 2);
  } else {
    const hue = (now / 4) % 360;
    outlined(bw.s, 0, 0, bw.col || `hsl(${hue},100%,65%)`, size);
  }
  ctx.restore();
}

function drawAim() {
  const { pre, post, hit } = aimPath(), r = ballR();
  ctx.fillStyle = TH.light ? TH.hud.ink : '#ffffff';
  for (let i = 0; i < pre.length; i += 2) { ctx.globalAlpha = 0.95 - (i / pre.length) * 0.45; ctx.beginPath(); ctx.arc(pre[i], pre[i + 1], 2.4, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = TH.accent;
  for (let i = 0; i < post.length; i += 2) { ctx.globalAlpha = 0.8 * (1 - i / post.length); ctx.beginPath(); ctx.arc(post[i], post[i + 1], 1.8, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (hit) { ctx.strokeStyle = TH.light ? TH.hud.ink : '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hit.x, hit.y, r, 0, Math.PI * 2); ctx.stroke(); }
}

function drawBalls(now) {
  const r = ballR(), bc = ballColor(), gl = glow(TH.ball.glow), glT = glow(TH.ball.temp);
  const fever = S.fever;
  ctx.globalCompositeOperation = TH.light ? 'source-over' : 'lighter';
  for (const b of S.movers) {
    const t = b.trail;
    for (let i = 0; i < t.length; i += 2) {
      ctx.globalAlpha = (TH.light ? 0.05 : 0.07) + 0.05 * i; const s = b.r * (1.4 + i * 0.12);
      const g = fever ? glow(RAINBOW[Math.floor(now / 60 + i + b.x / 40) % RAINBOW.length]) : b.temp ? glT : b.iron ? glow('#b8c2d9') : b.rush >= 4 ? glow('#ff6a3d') : gl;
      ctx.drawImage(g, t[i] - s, t[i + 1] - s, s * 2, s * 2);
    }
    ctx.globalAlpha = TH.light ? 0.55 : 0.9; ctx.drawImage(b.temp ? glT : b.rush >= 4 ? glow('#ff6a3d') : gl, b.x - b.r * 2.6, b.y - b.r * 2.6, b.r * 5.2, b.r * 5.2);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  const outline = TH.brick === 'comic' || TH.light;
  ctx.fillStyle = bc; ctx.beginPath();
  for (const b of S.movers) if (!b.temp && !b.iron) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); }
  for (const h of homers) { ctx.moveTo(h.x + r * 0.7, LY); ctx.arc(h.x, LY, r * 0.7, 0, Math.PI * 2); }
  ctx.fill(); if (outline) { ctx.strokeStyle = TH.outline === '#ffffff' ? TH.hud.ink : TH.outline; ctx.lineWidth = 1.6; ctx.stroke(); }
  ctx.fillStyle = TH.ball.temp; ctx.beginPath();
  for (const b of S.movers) if (b.temp) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); }
  ctx.fill(); if (outline) ctx.stroke();
  // iron balls: heavy steel spheres
  for (const b of S.movers) if (b.iron) {
    const g = ctx.createRadialGradient(b.x - b.r * 0.4, b.y - b.r * 0.4, 1, b.x, b.y, b.r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#c9d1e3'); g.addColorStop(1, '#4b5368');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2f3d'; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

function drawHud(now, ch) {
  const hd = TH.hud;
  ctx.fillStyle = hd.bg; ctx.fillRect(0, 0, W, TOP - 4);
  ctx.fillStyle = hd.line; ctx.fillRect(0, TOP - 4, W, 4);
  if (TH === THEMES.jackpot) {
    const on = Math.floor(now / 140) % 3;
    for (let x = 6, i = 0; x < W; x += 14, i++) { ctx.fillStyle = (i % 3) === on ? '#fff3b0' : '#7a5c0a'; ctx.beginPath(); ctx.arc(x, TOP - 2, 2, 0, Math.PI * 2); ctx.fill(); }
  } else if (TH === THEMES.synth) {
    ctx.drawImage(glow('#ff3ea5'), 0, TOP - 14, W, 24);
  }
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillStyle = hd.dim; ctx.font = DISP(8); ctx.fillText('TURN', 16, 22);
  ctx.fillStyle = hd.ink; ctx.font = DISP(18); ctx.fillText(String(S.turn), 16, 48);
  ctx.textAlign = 'right'; ctx.fillStyle = hd.dim; ctx.font = DISP(8); ctx.fillText('LEVEL', W - 16, 22);
  ctx.fillStyle = hd.accent; ctx.font = DISP(18); ctx.fillText(String(S.level), W - 16, 48);
  // one life: a single heart that beats faster as bricks close in
  {
    const bp = 1 + (S.beatPulse || 0) * 0.35;
    ctx.save(); ctx.translate(W / 2, 27); ctx.scale(1.3 * bp, 1.3 * bp); heart(-7.5, -6, true); ctx.restore();
    if (S.shield > 0) {
      const x = W / 2 + 22, y = 22;
      ctx.fillStyle = SHIELD_COL;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 10, y + 2.5); ctx.lineTo(x + 10, y + 9); ctx.lineTo(x + 5, y + 15); ctx.lineTo(x, y + 9); ctx.lineTo(x, y + 2.5); ctx.closePath(); ctx.fill();
    }
  }
  ctx.textAlign = 'center'; ctx.font = DISP(7);
  ctx.fillStyle = hd.ch; ctx.fillText(STG.endless ? `CH${ch}` : STG.id, W / 2 - 78, 15);
  // boss progress toward the next world: one diamond per boss in this world
  // stage mode: bosses killed of the stage goal; endless: progress toward the next world
  const pipN = STG.endless ? BOSSES_PER_WORLD : STG.bosses, pipOn = STG.endless ? S.bosses % BOSSES_PER_WORLD : S.bosses;
  ctx.textAlign = 'left'; ctx.fillStyle = hd.dim; ctx.font = DISP(5); ctx.fillText(STG.endless ? `W${S.world + 1}` : 'BOSS', 16, 72); ctx.textAlign = 'center';
  for (let i = 0; i < pipN; i++) {
    const x = 46 + i * 10, y = 69, on = i < pipOn;
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = on ? hd.accent : hd.xpBg; ctx.fillRect(-2.6, -2.6, 5.2, 5.2); ctx.restore();
  }
  ctx.fillStyle = hd.dim; ctx.fillText(`DMG ${fmtDmg(Math.round(S.dmg * 10) / 10)}  BALL ${S.balls}`, W / 2 + 10, 15);
  const gs = 1 + S.goldBump * 0.5;
  ctx.save(); ctx.translate(W / 2, 50); ctx.scale(gs, gs); ctx.fillStyle = hd.accent; ctx.font = DISP(8); ctx.fillText(`${Math.floor(S.gold)}G`, 0, 0); ctx.restore();
  ctx.fillStyle = hd.xpBg; ctx.fillRect(16, 58, W - 32, 6);
  ctx.fillStyle = S.xpFlash > 0 ? '#ffffff' : hd.xp; ctx.fillRect(16, 58, (W - 32) * clamp(S.xp / S.xpNeed, 0, 1), 6);
}

function draw(now) {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.fillStyle = TH.css.bg; ctx.fillRect(0, 0, W, H);
  const sx = S.shake ? (rnd() - 0.5) * 2 * S.shake : 0, sy = S.shake ? (rnd() - 0.5) * 2 * S.shake : 0;
  const ch = chapterOf(S.turn);
  ctx.save(); ctx.translate(sx, sy);
  if (S.camZ > 0.001) { // camera punch on big breaks
    ctx.translate(W / 2, H * 0.45); ctx.scale(1 + S.camZ, 1 + S.camZ); ctx.rotate(S.camR); ctx.translate(-W / 2, -H * 0.45);
  }

  TH.field(ctx, now, ch);
  ctx.strokeStyle = TH.line2; ctx.globalAlpha = 0.7; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FB + 1); ctx.lineTo(W, FB + 1); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  if (S.shield > 0) { // shield barrier on the red line
    ctx.globalAlpha = 0.55 + 0.25 * Math.sin(now / 200);
    ctx.drawImage(glow(SHIELD_COL), -40, FB - 12, W + 80, 26);
    ctx.fillStyle = SHIELD_COL; ctx.fillRect(0, FB, W, 2); ctx.globalAlpha = 1;
  }
  if (S.lv.bounce) { // bounce pad along the launcher line
    ctx.globalAlpha = 0.5; ctx.drawImage(glow(UPG.bounce.col), -40, LY + 1, W + 80, 18); ctx.globalAlpha = 1;
    ctx.fillStyle = UPG.bounce.col; ctx.fillRect(0, LY + ballR() + 2, W, 2);
  }

  ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, H - TOP); ctx.clip();
  for (const br of S.bricks) if (!br.dead) drawBrick(br, now);
  ctx.restore();

  // laser beams
  ctx.globalCompositeOperation = TH.light ? 'source-over' : 'lighter';
  for (const b of beams) {
    const k = b.life / b.max;
    ctx.globalAlpha = k; ctx.fillStyle = TH.css.gold; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    if (b.w > b.h) ctx.fillRect(b.x, b.y + b.h / 2 - 1.5, b.w, 3); else ctx.fillRect(b.x + b.w / 2 - 1.5, b.y, 3, b.h);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  // break pops: a quick expanding outline where a brick died
  for (const p of pops) {
    const k = 1 - p.life / p.max, e = 6 + k * 14;
    ctx.globalAlpha = 1 - k; ctx.strokeStyle = TH.light ? TH.hud.ink : '#ffffff'; ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.strokeRect(p.x - e, p.y - e, p.w + e * 2, p.h + e * 2);
  }
  ctx.globalAlpha = 1;

  drawShards();
  if (S.phase === 'aim' && S.aiming && S.aimOk) drawAim();
  drawBalls(now);

  // launcher
  const r = ballR(), bc = ballColor();
  ctx.strokeStyle = TH.hud.line; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, LY + r + 1); ctx.lineTo(W, LY + r + 1); ctx.stroke();
  if (S.phase !== 'fire' || S.toFire > 0) {
    const kick = 1 + S.kick * 0.5;
    ctx.drawImage(glow(TH.ball.glow), S.launchX - r * 3 * kick, LY - r * 3 * kick, r * 6 * kick, r * 6 * kick);
    ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(S.launchX, LY, r * kick, 0, Math.PI * 2); ctx.fill();
    if (TH.light) { ctx.strokeStyle = TH.hud.ink; ctx.lineWidth = 1.6; ctx.stroke(); }
  }
  if (S.nextLaunchX !== null) { ctx.strokeStyle = TH.accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S.nextLaunchX, LY, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cnt = S.phase === 'fire' ? S.toFire : S.balls;
  if (cnt > 0) outlined('x' + cnt, clamp(S.launchX, 30, W - 30), LY + 26, TH.css.ink, 10);
  if (S.orbsGot) outlined('+' + S.orbsGot, clamp(S.nextLaunchX ?? S.launchX, 30, W - 30), LY + 42, TH.accent, 8);

  drawParticles();
  for (const g of rings) {
    const t = 1 - g.life / g.max;
    ctx.globalAlpha = 1 - t; ctx.strokeStyle = g.col; ctx.lineWidth = 5 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (0.35 + 0.65 * t), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.18 * (1 - t); ctx.fillStyle = g.col; ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const b of bolts) {
    ctx.globalAlpha = b.life / b.max;
    for (const [col, lw] of [[TH.accent, 5], ['#ffffff', 2]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      b.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of texts) {
    const k = 1 - t.life / t.max, s = 1 + 0.5 * Math.max(0, 1 - k * 7);
    ctx.globalAlpha = Math.min(1, t.life / (t.max * 0.35));
    ctx.save(); ctx.translate(t.x, t.y); ctx.scale(s, s); outlined(t.s, 0, 0, t.col, t.size); ctx.restore();
  }
  ctx.globalAlpha = 1;
  if (S.phase === 'fire' && S.combo >= 5) {
    const s = 1 + S.comboPulse * 0.4, size = Math.min(22, 11 + S.combo * 0.2);
    const col = S.combo >= 20 ? `hsl(${(now / 3) % 360},100%,62%)` : S.combo >= 15 ? TH.css.gold : TH.accent;
    ctx.save(); ctx.translate(W / 2, TOP + 52); ctx.scale(s, s);
    outlined('COMBO ' + S.combo, 0, 0, col, size);
    ctx.restore();
  }
  for (const bw of bigWords) drawBigWord(bw, now);
  ctx.restore(); // end shake

  // impact ghosting: two offset copies of the frame right after a big break
  if (S.chroma > 0.02) {
    const off = S.chroma * 7 * dpr * scale;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = TH.light ? 'multiply' : 'lighter'; ctx.globalAlpha = S.chroma * 0.28;
    ctx.drawImage(cv, off, 0); ctx.drawImage(cv, -off, 0);
    ctx.restore();
  }
  // danger: red pulse from the bottom when bricks approach the red line
  if (S.danger > 0 && (S.phase === 'aim' || S.phase === 'fire')) {
    const a = S.danger * (0.18 + 0.22 * (S.beatPulse || 0));
    const g = ctx.createLinearGradient(0, FB - 220, 0, FB + 10);
    g.addColorStop(0, 'rgba(255,40,70,0)'); g.addColorStop(1, `rgba(255,40,70,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, FB - 220, W, 230);
    if (S.danger >= 0.5 && Math.floor(now / 350) % 2 === 0) { ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; outlined('DANGER', W / 2, FB - 16, '#ff2846', 10); }
  }
  // coins flying to the HUD gold counter
  for (const c of flyers) {
    const k = clamp(c.t / c.dur, 0, 1), e = k * k, x = (1 - e) * ((1 - k) * c.sx + k * c.cx) + e * W / 2, y = (1 - e) * ((1 - k) * c.sy + k * c.cy) + e * 50;
    ctx.drawImage(glow(TH.css.gold), x - 9, y - 9, 18, 18);
    ctx.beginPath(); ctx.ellipse(x, y, 4.5 * Math.abs(Math.cos(c.t * 14)) + 0.8, 4.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd54a'; ctx.fill(); ctx.strokeStyle = '#a8740a'; ctx.lineWidth = 1; ctx.stroke();
  }

  // fever frame
  if (S.fever) {
    const a = 0.45 + 0.35 * Math.sin(now / 90);
    ctx.strokeStyle = `hsla(${(now / 3) % 360},100%,60%,${a})`; ctx.lineWidth = 8; ctx.strokeRect(4, TOP + 4, W - 8, LY - TOP - 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined('FEVER!', W / 2, TOP + 84, TH.fever, 10);
  }

  // banner
  if (S.banner) {
    const b = S.banner, k = b.life / b.max, a = Math.min(1, k * 4, (1 - k) * 8);
    ctx.globalAlpha = a;
    ctx.fillStyle = TH.css.ov; ctx.fillRect(0, H * 0.4 - 46, W, 92);
    ctx.fillStyle = b.col; ctx.fillRect(0, H * 0.4 - 46, W, 4); ctx.fillRect(0, H * 0.4 + 42, W, 4);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined(b.title, W / 2, H * 0.4 - 12, b.col, 18);
    ctx.font = KO(22); ctx.fillStyle = TH.css.ink; ctx.fillText(b.sub, W / 2, H * 0.4 + 20);
    ctx.globalAlpha = 1;
  }

  // world change: a bright iris opening from the centre
  if (S.wipe > 0) {
    const k = 1 - S.wipe;
    ctx.save(); ctx.globalAlpha = S.wipe;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(W / 2, H * 0.45, k * 700, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = TH.accent; ctx.lineWidth = 10 * S.wipe; ctx.beginPath(); ctx.arc(W / 2, H * 0.45, k * 700, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  drawHud(now, ch);

  if (S.phase === 'fire' && S.timeScale > 1) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined('FAST x' + S.timeScale, W / 2, H - 22, TH.accent, 9);
  } else if (S.phase === 'aim' && !S.aiming) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 300);
    outlined('HOLD & AIM', W / 2, H - 22, TH.css.dim, 8); ctx.globalAlpha = 1;
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(${S.flashCol},${S.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
}
