// Canvas drawing. Everything is drawn in logical units (420x780).
const glowCache = {};
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
  ctx.fillStyle = on ? '#ff4f7b' : '#2a3060';
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (HEART[r][c] === '1') ctx.fillRect(x + c * 3, y + r * 3, 3, 3);
}
const PX = s => `${s}px "Press Start 2P", ui-monospace, monospace`;
const KO = s => `${s}px "Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;
function fmt(n) { n = Math.ceil(n - 1e-6); return n >= 10000 ? Math.round(n / 1000) + 'K' : n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n); }
function outlined(s, x, y, col, size, font = PX) {
  ctx.font = font(size); ctx.lineWidth = Math.max(3, size / 3); ctx.strokeStyle = '#0a0c1c';
  ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function ballColor() { return S.lv.fire ? '#ffb36b' : S.lv.chain ? '#bfefff' : '#ffffff'; }

function drawItem(br, now) {
  const cx = br.X + br.Wd / 2, cy = br.Y + br.oy + br.Ht / 2, p = 1 + Math.sin(now / 160 + br.id) * 0.12;
  if (br.type === 'orb') {
    ctx.strokeStyle = '#3ee6ff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, 9 * p, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#3ee6ff'; ctx.font = PX(6); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('+1', cx + 0.5, cy + 1);
    return;
  }
  // laser item: a bar with arrow tips along its firing axis
  const hz = br.type === 'lzh', L = 13 * p, f = br.flash;
  ctx.save(); ctx.translate(cx, cy); if (!hz) ctx.rotate(Math.PI / 2);
  ctx.drawImage(glow('#ffd23f'), -18, -18, 36, 36);
  ctx.fillStyle = f > 0.2 ? '#ffffff' : '#ffd23f';
  ctx.fillRect(-L, -2, L * 2, 4);
  ctx.beginPath(); ctx.moveTo(-L - 6, 0); ctx.lineTo(-L, -6); ctx.lineTo(-L, 6); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(L + 6, 0); ctx.lineTo(L, -6); ctx.lineTo(L, 6); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawBrick(br, now) {
  if (isItem(br)) { drawItem(br, now); return; }
  const x = br.X, y = br.Y + br.oy, w = br.Wd, h = br.Ht, f = br.flash;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  const sc = 1 + f * 0.08; ctx.scale(sc, sc);
  ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = brickColor(br); ctx.fillRect(0, 0, w, h);
  if (br.type === 'bomb') {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.strokeStyle = 'rgba(10,12,28,.38)'; ctx.lineWidth = 5; ctx.beginPath();
    for (let i = -h; i < w + h; i += 12) { ctx.moveTo(i, h); ctx.lineTo(i + h, 0); }
    ctx.stroke(); ctx.restore();
  } else if (br.type === 'boss') {
    const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#ff4fa3'); g.addColorStop(1, '#ff8a3d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } else if (br.type === 'steel') {
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#c9d0de'); g.addColorStop(1, '#6d768b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#3b4255'; for (const [rx, ry] of [[3, 4], [w - 6, 4], [3, h - 7], [w - 6, h - 7]]) ctx.fillRect(rx, ry, 3, 3);
  } else if (br.type === 'slime') {
    ctx.fillStyle = '#3fcf86';
    const wob = Math.sin(now / 200 + br.id) * 2;
    ctx.fillRect(6, h - 3, 6, 5 + wob); ctx.fillRect(w - 16, h - 3, 6, 3 - wob); ctx.fillRect(w / 2, h - 3, 5, 6);
  }
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(0, 0, w, 3);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, h - 3, w, 3);
  if (br.type === 'chest') {
    if ((now / 400 + br.id) % 3 < 1) { ctx.fillStyle = '#fff'; ctx.fillRect(6, 6, 3, 3); ctx.fillRect(5, 7, 5, 1); ctx.fillRect(7, 5, 1, 5); }
    ctx.fillStyle = '#0a0c1c'; ctx.font = PX(6); ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('XP', w - 3, 4);
  }
  if (br.r >= ROWS - 2) {
    ctx.strokeStyle = `rgba(255,79,123,${0.5 + 0.5 * Math.sin(now / 120)})`; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, h - 2);
  }
  ctx.fillStyle = '#0a0c1c'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = PX(br.type === 'boss' ? 12 : 10);
  ctx.fillText(br.type === 'boss' ? 'BOSS ' + fmt(br.hp) : fmt(br.hp), w / 2, h / 2 + 1);
  if (f > 0) { ctx.fillStyle = `rgba(255,255,255,${f * 0.85})`; ctx.fillRect(0, 0, w, h); }
  ctx.restore();
}

function drawAim() {
  const { pre, post, hit } = aimPath(), r = ballR();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < pre.length; i += 2) { ctx.globalAlpha = 0.95 - (i / pre.length) * 0.45; ctx.fillRect(pre[i] - 2, pre[i + 1] - 2, 4, 4); }
  ctx.fillStyle = '#ffd23f';
  for (let i = 0; i < post.length; i += 2) { ctx.globalAlpha = 0.7 * (1 - i / post.length); ctx.fillRect(post[i] - 1.5, post[i + 1] - 1.5, 3, 3); }
  ctx.globalAlpha = 1;
  if (hit) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hit.x, hit.y, r, 0, Math.PI * 2); ctx.stroke(); }
}

function draw(now) {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.fillStyle = '#0a0c1c'; ctx.fillRect(0, 0, W, H);
  const sx = S.shake ? (rnd() - 0.5) * 2 * S.shake : 0, sy = S.shake ? (rnd() - 0.5) * 2 * S.shake : 0;
  const ch = chapterOf(S.turn), th = themeOf(ch);
  ctx.save(); ctx.translate(sx, sy);

  // field
  ctx.fillStyle = th.field; ctx.fillRect(0, TOP, W, LY - TOP);
  ctx.strokeStyle = `rgba(${th.grid},.16)`; ctx.lineWidth = 1; ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(c * CW + 0.5, TOP); ctx.lineTo(c * CW + 0.5, FB); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(0, TOP + r * RH + 0.5); ctx.lineTo(W, TOP + r * RH + 0.5); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,79,123,.6)'; ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, FB + 1); ctx.lineTo(W, FB + 1); ctx.stroke(); ctx.setLineDash([]);

  // bricks and items, clipped so slide-ins come from under the HUD
  ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, H - TOP); ctx.clip();
  for (const br of S.bricks) if (!br.dead) drawBrick(br, now);
  ctx.restore();

  // laser beams
  ctx.globalCompositeOperation = 'lighter';
  for (const b of beams) {
    const k = b.life / b.max;
    ctx.globalAlpha = k; ctx.fillStyle = '#ffd23f'; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ffffff';
    if (b.w > b.h) ctx.fillRect(b.x, b.y + b.h / 2 - 1.5, b.w, 3); else ctx.fillRect(b.x + b.w / 2 - 1.5, b.y, 3, b.h);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;

  if (S.phase === 'aim' && S.aiming && S.aimOk) drawAim();

  // balls
  const r = ballR(), bc = ballColor(), gl = glow(bc), glT = glow('#ff9be0');
  ctx.globalCompositeOperation = 'lighter';
  for (const b of S.movers) {
    const g = b.temp ? glT : gl, t = b.trail;
    for (let i = 0; i < t.length; i += 2) {
      ctx.globalAlpha = 0.07 + 0.05 * i; const s = b.r * (1.4 + i * 0.12);
      ctx.drawImage(g, t[i] - s, t[i + 1] - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 0.9; ctx.drawImage(g, b.x - b.r * 2.6, b.y - b.r * 2.6, b.r * 5.2, b.r * 5.2);
  }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = bc; ctx.beginPath();
  for (const b of S.movers) if (!b.temp) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); }
  for (const h of homers) { ctx.moveTo(h.x + r * 0.7, LY); ctx.arc(h.x, LY, r * 0.7, 0, Math.PI * 2); }
  ctx.fill();
  ctx.fillStyle = '#ffd0f0'; ctx.beginPath();
  for (const b of S.movers) if (b.temp) { ctx.moveTo(b.x + b.r, b.y); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); }
  ctx.fill();

  // launcher
  ctx.strokeStyle = '#2a3270'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, LY + r + 1); ctx.lineTo(W, LY + r + 1); ctx.stroke();
  if (S.phase !== 'fire' || S.toFire > 0) {
    ctx.drawImage(gl, S.launchX - r * 2.6, LY - r * 2.6, r * 5.2, r * 5.2);
    ctx.fillStyle = bc; ctx.beginPath(); ctx.arc(S.launchX, LY, r, 0, Math.PI * 2); ctx.fill();
  }
  if (S.nextLaunchX !== null) { ctx.strokeStyle = bc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S.nextLaunchX, LY, r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const cnt = S.phase === 'fire' ? S.toFire : S.balls;
  if (cnt > 0) outlined('x' + cnt, clamp(S.launchX, 30, W - 30), LY + 26, '#eef0ff', 10);
  if (S.orbsGot) outlined('+' + S.orbsGot, clamp(S.nextLaunchX ?? S.launchX, 30, W - 30), LY + 42, '#3ee6ff', 8);

  // particles, rings, bolts, floating text
  for (const p of parts) { ctx.globalAlpha = Math.min(1, p.life / p.max * 1.6); ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  ctx.globalAlpha = 1;
  for (const g of rings) {
    const t = 1 - g.life / g.max;
    ctx.globalAlpha = 1 - t; ctx.strokeStyle = g.col; ctx.lineWidth = 5 * (1 - t) + 1;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (0.35 + 0.65 * t), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 0.18 * (1 - t); ctx.fillStyle = g.col; ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const b of bolts) {
    ctx.globalAlpha = b.life / b.max;
    for (const [col, lw] of [['#3ee6ff', 5], ['#ffffff', 2]]) {
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
    const s = 1 + S.comboPulse * 0.35, size = Math.min(22, 12 + S.combo * 0.2);
    ctx.save(); ctx.translate(W / 2, TOP + 54); ctx.scale(s, s); ctx.globalAlpha = 0.9;
    outlined('COMBO ' + S.combo, 0, 0, S.combo >= 25 ? '#ff4fa3' : S.combo >= 15 ? '#ffd23f' : '#3ee6ff', size);
    ctx.restore(); ctx.globalAlpha = 1;
  }
  ctx.restore(); // end shake

  // chapter / boss banner
  if (S.banner) {
    const b = S.banner, k = b.life / b.max, a = Math.min(1, k * 4, (1 - k) * 8);
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10,12,28,.78)'; ctx.fillRect(0, H * 0.4 - 46, W, 92);
    ctx.fillStyle = b.col; ctx.fillRect(0, H * 0.4 - 46, W, 3); ctx.fillRect(0, H * 0.4 + 43, W, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined(b.title, W / 2, H * 0.4 - 12, b.col, 18);
    outlined(b.sub, W / 2, H * 0.4 + 20, '#eef0ff', 20, KO);
    ctx.globalAlpha = 1;
  }

  // HUD
  ctx.fillStyle = '#141939'; ctx.fillRect(0, 0, W, TOP - 4);
  ctx.fillStyle = '#2a3270'; ctx.fillRect(0, TOP - 4, W, 4);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left'; ctx.fillStyle = '#8c93c9'; ctx.font = PX(8); ctx.fillText('TURN', 16, 22);
  ctx.fillStyle = '#eef0ff'; ctx.font = PX(18); ctx.fillText(String(S.turn), 16, 46);
  ctx.textAlign = 'right'; ctx.fillStyle = '#8c93c9'; ctx.font = PX(8); ctx.fillText('LEVEL', W - 16, 22);
  ctx.fillStyle = '#ffd23f'; ctx.font = PX(18); ctx.fillText(String(S.level), W - 16, 46);
  if (S.maxHp <= 9) {
    const hw = S.maxHp * 19 - 4, hx = W / 2 - hw / 2;
    for (let i = 0; i < S.maxHp; i++) heart(hx + i * 19, 24, i < S.hp);
  } else { heart(W / 2 - 34, 24, true); ctx.textAlign = 'left'; ctx.fillStyle = '#eef0ff'; ctx.font = PX(12); ctx.fillText(`${S.hp}/${S.maxHp}`, W / 2 - 12, 38); }
  ctx.textAlign = 'center'; ctx.font = PX(7);
  ctx.fillStyle = '#3ee6ff'; ctx.fillText(`CH${ch}`, W / 2 - 64, 16);
  ctx.fillStyle = '#8c93c9'; ctx.fillText(`DMG ${fmtDmg(Math.round(S.dmg * 10) / 10)} BALL ${S.balls}`, W / 2 + 8, 16);
  ctx.fillStyle = '#ffd23f'; ctx.fillText(`${Math.floor(S.gold)}G`, W / 2, 50);
  ctx.fillStyle = '#232a5c'; ctx.fillRect(16, 58, W - 32, 6);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(16, 58, (W - 32) * clamp(S.xp / S.xpNeed, 0, 1), 6);

  if (S.phase === 'fire' && S.timeScale > 1) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    outlined('FAST x' + S.timeScale, W / 2, H - 22, '#7dffb0', 9);
  } else if (S.phase === 'aim' && !S.aiming) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(now / 300);
    outlined('HOLD & AIM', W / 2, H - 22, '#8c93c9', 8); ctx.globalAlpha = 1;
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(${S.flashCol},${S.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
}
