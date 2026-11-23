// Visual themes (design drafts). Each theme owns its palette, fonts, brick style,
// particles, combo words and field background. Game logic never reads a theme.
const FONT = {
  pixel: '"Press Start 2P", ui-monospace, monospace',
  lilita: '"Lilita One", "Jua", system-ui, sans-serif',
  orbitron: '"Orbitron", "Black Han Sans", system-ui, sans-serif',
  bungee: '"Bungee", "Black Han Sans", system-ui, sans-serif',
  bangers: '"Bangers", "Black Han Sans", system-ui, sans-serif',
  chakra: '"Chakra Petch", "IBM Plex Sans KR", system-ui, sans-serif',
  plex: '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  doHyeon: '"Do Hyeon", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  jua: '"Jua", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  blackHan: '"Black Han Sans", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
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

// Static field layers are cached per theme and chapter.
const fieldCache = {};
function cachedLayer(key, paint) {
  if (fieldCache[key]) return fieldCache[key];
  const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2;
  const g = c.getContext('2d'); g.scale(2, 2); paint(g);
  return fieldCache[key] = c;
}

const THEMES = {
  neon: {
    chapters: ['미드나잇 시티', '딥 블루', '앰버 팩토리', '오로라 필드', '오비탈 스테이션'],
    name: '네온 글래스', tag: 'NEON GLASS', line: '유리처럼 맑은 벽돌과 은은한 오로라, 깔끔한 기본 월드',
    num: FONT.chakra, numSize: 15, numWeight: '700', disp: FONT.chakra, dw: '700', dsz: 1.45, ko: FONT.plex, crt: false,
    css: { bg: '#070912', panel: '#11152a', line: '#262d4d', ink: '#f2f4ff', dim: '#8a93b8', gold: '#ffc66b', hot: '#ff5d8f', cool: '#5ef2e0', ov: 'rgba(7,9,18,.78)', btnInk: '#070912', logo2: '#9d8cff' },
    hud: { bg: '#0a0d1b', line: '#1f2642', ink: '#f2f4ff', dim: '#7d86ab', accent: '#ffc66b', xpBg: '#1a1f36', xp: '#5ef2e0', heart: '#ff5d8f', heartOff: '#272c47', ch: '#5ef2e0' },
    outline: '#070912', brick: 'glass', numInk: '#ffffff', heartStyle: 'vector',
    ramp: rampOf(['#2fcfc0', '#3a8cff', '#6a62ff', '#a95cff', '#ff5d8f', '#ffa95c']),
    special: { bomb: '#ff4d6a', chest: '#ffb84d', steel: '#7f8aa8', slime: '#3fd98a', boss: ['#8a5cff', '#ff5d8f'] },
    ball: { core: '#ffffff', glow: '#5ef2e0', temp: '#ff8fc7' }, particle: 'dust',
    words: ['NICE', 'GREAT', 'EXCELLENT', 'UNREAL', 'LEGENDARY'], wordStyle: 'clean',
    accent: '#5ef2e0', fever: '#ffc66b', line2: '#ff5d8f',
    field(g, now, ch) {
      const au = [['#2fcfc0', '#6a62ff'], ['#3a8cff', '#2fcfc0'], ['#ffa95c', '#ff5d8f'], ['#3fd98a', '#3a8cff'], ['#a95cff', '#ff5d8f']][(ch - 1) % 5];
      g.drawImage(cachedLayer('neon' + ch, c => {
        const gr = c.createLinearGradient(0, TOP, 0, LY); gr.addColorStop(0, '#0c1024'); gr.addColorStop(1, '#06070f');
        c.fillStyle = gr; c.fillRect(0, TOP, W, LY - TOP);
        c.fillStyle = 'rgba(160,175,230,.07)';
        for (let y = TOP + RH; y < FB; y += RH) for (let x = CW; x < W; x += CW) c.fillRect(x - 1, y - 1, 2, 2);
      }), 0, 0, W, H);
      // two slow aurora blobs
      g.save(); g.beginPath(); g.rect(0, TOP, W, LY - TOP); g.clip();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.16;
      const t = now / 4000;
      g.drawImage(glow(au[0]), W * (0.25 + 0.2 * Math.sin(t)) - 260, TOP + 160 + 80 * Math.cos(t * 0.7) - 260, 520, 520);
      g.drawImage(glow(au[1]), W * (0.75 + 0.2 * Math.cos(t * 0.8)) - 240, TOP + 420 + 90 * Math.sin(t * 0.6) - 240, 480, 480);
      g.restore();
    },
  },

  candy: {
    chapters: ['딸기 언덕', '소다 바다', '캐러멜 공장', '민트 동굴', '솜사탕 구름'],
    name: '캔디 팝', tag: 'CANDY POP', line: '말랑한 젤리 벽돌, 파스텔 하늘, 터질 때마다 색종이',
    num: FONT.lilita, numSize: 17, disp: FONT.lilita, dsz: 1.7, ko: FONT.jua, crt: false, light: true,
    css: { bg: '#ffe6f2', panel: '#ffffff', line: '#f3c2dc', ink: '#5a2a5e', dim: '#a07aa6', gold: '#ff7eb6', hot: '#ff5c8a', cool: '#7a5cff', ov: 'rgba(255,236,246,.92)', btnInk: '#ffffff', logo2: '#ffc94d' },
    hud: { bg: '#ffffff', line: '#f6cfe4', ink: '#5a2a5e', dim: '#b58bb9', accent: '#ff5c8a', xpBg: '#f9dcec', xp: '#ff7eb6', heart: '#ff5c8a', heartOff: '#f3d6e6', ch: '#7a5cff' },
    outline: '#ffffff', brick: 'jelly', numInk: '#ffffff', numStroke: 'rgba(90,42,94,.55)',
    ramp: rampOf(['#5fd9c4', '#5cb8ff', '#9b7bff', '#ff6fb5', '#ff8a4c']),
    special: { bomb: '#ff4d6d', chest: '#ffc94d', steel: '#b8b4cc', slime: '#8ee86b', boss: ['#ff5ca8', '#ffb34d'] },
    ball: { core: '#ffffff', glow: '#ff7eb6', temp: '#ffd36e' }, particle: 'confetti',
    words: ['YUMMY!', 'JUICY!', 'SUGAR RUSH!', 'CANDY STORM!', 'SWEETQUAKE!'], wordStyle: 'bubble',
    accent: '#ff5c8a', fever: '#ffc94d', line2: '#ff5c8a',
    confetti: ['#ff5c8a', '#ffc94d', '#5fd9c4', '#7a5cff', '#5cb8ff', '#ff8a4c'],
    field(g, now, ch) {
      const pairs = [['#ffe6f2', '#e9e2ff'], ['#e2f7ff', '#ffe9f4'], ['#fff1dc', '#ffe0ec'], ['#e6fff4', '#e6ecff'], ['#f1e6ff', '#ffe6ea']][(ch - 1) % 5];
      g.drawImage(cachedLayer('candy' + ch, c => {
        const gr = c.createLinearGradient(0, TOP, 0, LY); gr.addColorStop(0, pairs[0]); gr.addColorStop(1, pairs[1]);
        c.fillStyle = gr; c.fillRect(0, TOP, W, LY - TOP);
      }), 0, 0, W, H);
      g.fillStyle = 'rgba(255,255,255,.55)';
      const off = (now / 60) % 40;
      for (let y = TOP - 40 + off; y < LY; y += 40) for (let x = (Math.floor(y / 40) % 2) * 20; x < W + 20; x += 40) {
        if (y < TOP) continue; g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      }
    },
  },

  synth: {
    chapters: ['선셋 대로', '사이버 항구', '레이저 사막', '크롬 시티', '하이퍼 궤도'],
    name: '신스웨이브', tag: 'SYNTHWAVE', line: '노을 진 80년대 레트로 퓨처, 네온 윤곽선과 지평선 그리드',
    num: FONT.orbitron, numSize: 13, disp: FONT.orbitron, dsz: 1.6, ko: FONT.blackHan, crt: true,
    css: { bg: '#12021f', panel: '#24073d', line: '#7a1f8f', ink: '#fff0ff', dim: '#c58fd6', gold: '#ffe14d', hot: '#ff3ea5', cool: '#39f3ff', ov: 'rgba(18,2,31,.86)', btnInk: '#12021f', logo2: '#39f3ff' },
    hud: { bg: '#1c0430', line: '#ff3ea5', ink: '#fff0ff', dim: '#c58fd6', accent: '#ffe14d', xpBg: '#3a0d55', xp: '#39f3ff', heart: '#ff3ea5', heartOff: '#3a0d55', ch: '#39f3ff' },
    outline: '#12021f', brick: 'neon', numInk: '#ffffff',
    ramp: rampOf(['#39f3ff', '#4d7bff', '#b44dff', '#ff3ea5', '#ffb03a']),
    special: { bomb: '#ff2d55', chest: '#ffe14d', steel: '#c9c9e6', slime: '#5dff9e', boss: ['#ff3ea5', '#ffb03a'] },
    ball: { core: '#ffffff', glow: '#ff3ea5', temp: '#39f3ff' }, particle: 'spark',
    words: ['RAD!', 'TUBULAR!', 'OUTRUN!', 'MAXIMUM!', 'HYPERDRIVE!'], wordStyle: 'chrome',
    accent: '#39f3ff', fever: '#ffe14d', line2: '#ff3ea5',
    field(g, now, ch) {
      const hz = 470, sky = [['#12021f', '#4a0c5e', '#ff4f8b'], ['#060b2b', '#1d2a7a', '#ff6f6f'], ['#1a0410', '#6b0f3a', '#ffa03a'], ['#04121f', '#0f4a6b', '#ff5fd2'], ['#150024', '#3d0f7a', '#ff9a3a']][(ch - 1) % 5];
      g.drawImage(cachedLayer('synth' + ch, c => {
        const gr = c.createLinearGradient(0, TOP, 0, hz); gr.addColorStop(0, sky[0]); gr.addColorStop(0.65, sky[1]); gr.addColorStop(1, sky[2]);
        c.fillStyle = gr; c.fillRect(0, TOP, W, hz - TOP);
        const sg = c.createLinearGradient(0, hz - 130, 0, hz); sg.addColorStop(0, '#ffe14d'); sg.addColorStop(1, '#ff3ea5');
        c.save(); c.beginPath(); c.arc(W / 2, hz, 120, Math.PI, 0); c.clip();
        c.fillStyle = sg; c.globalAlpha = 0.55; c.fillRect(0, hz - 130, W, 130); c.globalAlpha = 1;
        c.fillStyle = sky[1]; for (let i = 0; i < 7; i++) c.fillRect(0, hz - 60 + i * 9, W, 2 + i * 0.8);
        c.restore();
        c.fillStyle = '#12021f'; c.fillRect(0, hz, W, LY - hz);
      }), 0, 0, W, H);
      g.strokeStyle = 'rgba(255,62,165,.55)'; g.lineWidth = 1.2; g.beginPath();
      for (let i = -12; i <= 12; i++) { g.moveTo(W / 2 + i * 14, hz); g.lineTo(W / 2 + i * 70, LY); }
      const ph = (now / 900) % 1;
      for (let i = 0; i < 9; i++) { const k = (i + ph) / 9, y = hz + (LY - hz) * k * k; g.moveTo(0, y); g.lineTo(W, y); }
      g.stroke();
      g.fillStyle = '#ff3ea5'; g.fillRect(0, hz - 1, W, 2);
    },
  },

  jackpot: {
    chapters: ['에메랄드 홀', '루비 라운지', '사파이어 타워', '자수정 금고', '황금 펜트하우스'],
    name: '잭팟 골드', tag: 'JACKPOT', line: '금괴와 보석 벽돌, 쏟아지는 코인, 전광판 조명',
    num: FONT.bungee, numSize: 13, disp: FONT.bungee, dsz: 1.45, ko: FONT.blackHan, crt: false,
    css: { bg: '#04140e', panel: '#0b2a1d', line: '#c9a227', ink: '#fff6dc', dim: '#b9a774', gold: '#ffd54a', hot: '#ff3b3b', cool: '#4dffb0', ov: 'rgba(3,16,11,.88)', btnInk: '#2a1a00', logo2: '#ff3b3b' },
    hud: { bg: '#0a2418', line: '#c9a227', ink: '#fff6dc', dim: '#b9a774', accent: '#ffd54a', xpBg: '#163d2b', xp: '#ffd54a', heart: '#ff3b3b', heartOff: '#163d2b', ch: '#4dffb0' },
    outline: '#1a0f00', brick: 'gem', numInk: '#ffffff', numStroke: 'rgba(0,0,0,.6)',
    ramp: rampOf(['#20c97a', '#2a8cff', '#a64dff', '#ff2e63', '#ffc21a']),
    special: { bomb: '#ff2e2e', chest: '#ffd54a', steel: '#d9dde6', slime: '#7cff4d', boss: ['#ffd54a', '#ff8c1a'] },
    ball: { core: '#fff3b0', glow: '#ffd54a', temp: '#4dffb0' }, particle: 'coin',
    words: ['WIN!', 'BIG WIN!', 'MEGA WIN!', 'SUPER WIN!', 'JACKPOT!'], wordStyle: 'rays',
    accent: '#ffd54a', fever: '#ff3b3b', line2: '#ffd54a',
    field(g, now, ch) {
      const felt = [['#0f4a33', '#04140e'], ['#4a0f1c', '#14040a'], ['#0f2a4a', '#040a14'], ['#3a0f4a', '#0e0414'], ['#0f4a4a', '#041414']][(ch - 1) % 5];
      g.drawImage(cachedLayer('jackpot' + ch, c => {
        const gr = c.createRadialGradient(W / 2, (TOP + LY) / 2, 40, W / 2, (TOP + LY) / 2, 460);
        gr.addColorStop(0, felt[0]); gr.addColorStop(1, felt[1]);
        c.fillStyle = gr; c.fillRect(0, TOP, W, LY - TOP);
        c.strokeStyle = 'rgba(255,213,74,.07)'; c.lineWidth = 1; c.beginPath();
        for (let i = -20; i < 30; i++) { c.moveTo(i * 30, TOP); c.lineTo(i * 30 + (LY - TOP), LY); c.moveTo(i * 30, TOP); c.lineTo(i * 30 - (LY - TOP), LY); }
        c.stroke();
      }), 0, 0, W, H);
      // marquee bulbs along the field edges
      const on = Math.floor(now / 160) % 2;
      for (let y = TOP + 10, i = 0; y < FB; y += 22, i++) {
        g.fillStyle = (i + on) % 2 ? '#ffd54a' : 'rgba(255,213,74,.25)';
        g.fillRect(1, y, 3, 3); g.fillRect(W - 4, y, 3, 3);
      }
    },
  },

  comic: {
    chapters: ['1화 도시의 위기', '2화 지하 연구소', '3화 불타는 공장', '4화 얼음 요새', '5화 최후의 결전'],
    name: '코믹 팝아트', tag: 'COMIC POP', line: '굵은 먹선과 망점, 터질 때마다 POW! BAM! 효과음 글자',
    num: FONT.bangers, numSize: 19, disp: FONT.bangers, dsz: 1.9, ko: FONT.blackHan, crt: false, light: true,
    css: { bg: '#fff4cc', panel: '#ffffff', line: '#111111', ink: '#111111', dim: '#5b5140', gold: '#ffd400', hot: '#ff2a3d', cool: '#00a8e8', ov: 'rgba(255,244,204,.93)', btnInk: '#111111', logo2: '#00a8e8' },
    hud: { bg: '#ffd400', line: '#111111', ink: '#111111', dim: '#3d3420', accent: '#ff2a3d', xpBg: '#ffffff', xp: '#ff2a3d', heart: '#ff2a3d', heartOff: '#e8d9a0', ch: '#00a8e8' },
    outline: '#111111', brick: 'comic', numInk: '#111111',
    ramp: rampOf(['#5ee0ff', '#4d7cff', '#c04dff', '#ff2a3d', '#ff8c00']),
    special: { bomb: '#ff2a3d', chest: '#ffd400', steel: '#c8c8c8', slime: '#5ee05e', boss: ['#ff2a3d', '#ffd400'] },
    ball: { core: '#ffffff', glow: '#ffd400', temp: '#ff7ad9' }, particle: 'shard',
    words: ['POW!', 'BAM!', 'WHAM!', 'KAPOW!', 'KABOOM!'], wordStyle: 'burst',
    accent: '#ff2a3d', fever: '#00a8e8', line2: '#ff2a3d',
    field(g, now, ch) {
      const dot = ['255,42,61', '0,168,232', '255,140,0', '192,77,255', '0,180,90'][(ch - 1) % 5];
      g.drawImage(cachedLayer('comic' + ch, c => {
        c.fillStyle = '#fff4cc'; c.fillRect(0, TOP, W, LY - TOP);
        for (let y = TOP; y < LY; y += 10) for (let x = (Math.floor(y / 10) % 2) * 5; x < W; x += 10) {
          const k = (y - TOP) / (LY - TOP); c.fillStyle = `rgba(${dot},.16)`;
          c.beginPath(); c.arc(x, y, 0.8 + k * 2.2, 0, Math.PI * 2); c.fill();
        }
        c.strokeStyle = '#111'; c.lineWidth = 4; c.strokeRect(2, TOP + 2, W - 4, LY - TOP - 2);
      }), 0, 0, W, H);
    },
  },
};
// Worlds in play order: a run starts in its chosen world and moves on every 3 bosses.
const WORLD_ORDER = ['neon', 'synth', 'candy', 'comic', 'jackpot'];
const BOSSES_PER_WORLD = 3;
for (const k in THEMES) THEMES[k].id = k;
let TH = THEMES.neon;
function applyTheme(id) {
  TH = themeFor(id) || THEMES.neon;
  stage.dataset.th = TH.id;
  stage.dataset.dir = TH.dir || 'classic';
  const st = stage.style;
  for (const [k, v] of Object.entries(TH.css)) st.setProperty('--' + k, v);
  st.setProperty('--disp', TH.disp); st.setProperty('--ko', TH.ko); st.setProperty('--dsz', TH.dsz);
  document.body.style.background = TH.css.bg;
  document.querySelector('.crt').hidden = !TH.crt;
  for (const k in glowCache) delete glowCache[k];
}
