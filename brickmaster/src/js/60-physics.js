// Ball movement. The ball collides as a square (AABB) against bricks, one axis at a time,
// in sub-steps shorter than its radius so it never tunnels through a brick.
function mkBall(x, y, vx, vy, temp) {
  return { x, y, vx, vy, r: ballR(), alive: true, temp, split: false, ghost: new Set(), touched: new Set(), trail: [] };
}
function overlaps(b, br) { return b.x + b.r > br.X && b.x - b.r < br.X + br.Wd && b.y + b.r > br.Y && b.y - b.r < br.Y + br.Ht; }

function touchItem(b, br, r, c) {
  const dx = b.x - (br.X + br.Wd / 2), dy = b.y - (br.Y + br.Ht / 2);
  if (dx * dx + dy * dy >= (b.r + 10) ** 2) return;
  if (br.type === 'orb') {
    br.dead = true; grid[r * COLS + c] = null; S.orbsGot++;
    texts.push(mkText(br.X + br.Wd / 2, br.Y + 6, '+1', TH.accent, 0.8, 11));
    rings.push({ x: br.X + br.Wd / 2, y: br.Y + br.Ht / 2, r: 30, life: 0.25, max: 0.25, col: TH.accent });
    sfx.orb();
  } else if (!b.touched.has(br)) {
    b.touched.add(br); fireLaser(br);
  }
}

function collide(b, axis) {
  const c0 = Math.max(0, Math.floor((b.x - b.r) / CW)), c1 = Math.min(COLS - 1, Math.floor((b.x + b.r) / CW));
  const r0 = Math.max(0, Math.floor((b.y - b.r - TOP) / RH)), r1 = Math.min(ROWS - 1, Math.floor((b.y + b.r - TOP) / RH));
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const br = grid[r * COLS + c];
    if (!br || br.dead) continue;
    if (isItem(br)) { touchItem(b, br, r, c); continue; }
    if (b.ghost.has(br) || !overlaps(b, br)) continue;
    if (S.pierce && rnd() < S.pierce) { b.ghost.add(br); hitBrick(br, b); continue; }
    // Push out on the side the ball's centre is on (not by velocity sign), and never
    // through a wall: a ball squeezed between a brick and the wall bounces vertically.
    let nx = null;
    if (axis === 0) {
      const left = b.x < br.X + br.Wd / 2;
      nx = left ? br.X - b.r - 0.01 : br.X + br.Wd + b.r + 0.01;
      if (nx >= b.r && nx <= W - b.r) { b.x = nx; b.vx = left ? -Math.abs(b.vx) : Math.abs(b.vx); }
      else nx = null;
    }
    if (nx === null) {
      const up = b.y < br.Y + br.Ht / 2;
      b.y = up ? br.Y - b.r - 0.01 : br.Y + br.Ht + b.r + 0.01;
      b.vy = up ? -Math.abs(b.vy) : Math.abs(b.vy);
    }
    hitBrick(br, b);
    return;
  }
}

function moveBall(b, dt) {
  const sp = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil(sp * dt / (b.r * 0.9)));
  for (let i = 0; i < n && b.alive; i++) {
    b.x += b.vx * dt / n;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); sfx.wall(); }
    else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); sfx.wall(); }
    collide(b, 0);
    b.y += b.vy * dt / n;
    if (b.y < TOP + b.r) { b.y = TOP + b.r; b.vy = Math.abs(b.vy); sfx.wall(); }
    collide(b, 1);
    if (b.ghost.size) for (const g of b.ghost) if (g.dead || !overlaps(b, g)) b.ghost.delete(g);
    if (b.vy > 0 && b.y >= LY) {
      b.alive = false;
      if (!b.temp) {
        if (S.nextLaunchX === null) S.nextLaunchX = clamp(b.x, 12, W - 12);
        homers.push({ x: b.x });
      }
    }
  }
  b.trail.push(b.x, b.y);
  if (b.trail.length > 10) b.trail.splice(0, 2);
}

// Aim guide: trace the shot through its first bounce, using the same collision rules.
function hitTest(x, y, r) {
  const c0 = Math.max(0, Math.floor((x - r) / CW)), c1 = Math.min(COLS - 1, Math.floor((x + r) / CW));
  const r0 = Math.max(0, Math.floor((y - r - TOP) / RH)), r1 = Math.min(ROWS - 1, Math.floor((y + r - TOP) / RH));
  for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) {
    const br = grid[rr * COLS + c];
    if (br && !br.dead && !isItem(br) && x + r > br.X && x - r < br.X + br.Wd && y + r > br.Y && y - r < br.Y + br.Ht) return true;
  }
  return false;
}
function aimPath() {
  const r = ballR(), st = 4;
  let x = S.launchX, y = LY, dx = S.aim.x * st, dy = S.aim.y * st;
  const pre = [], post = []; let hit = null, after = 0;
  for (let i = 0; i < 600; i++) {
    let bounced = false;
    x += dx;
    if (x < r || x > W - r || hitTest(x, y, r)) { x -= dx; dx = -dx; bounced = true; }
    y += dy;
    if (y < TOP + r || hitTest(x, y, r)) { y -= dy; dy = -dy; bounced = true; }
    if (bounced && hit) break;
    if (bounced) hit = { x, y };
    if (!hit) { if (i % 4 === 3) pre.push(x, y); }
    else { after += st; if (i % 4 === 3) post.push(x, y); if (after > 120) break; }
    if (dy > 0 && y >= LY) break;
  }
  return { pre, post, hit };
}
