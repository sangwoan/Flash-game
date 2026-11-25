// Chiptune blips synthesized with WebAudio. Audio starts on the first tap.
let AC = null, master = null, noiseBuf = null, muted = false;
const lastSfx = {};
function ensureAudio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const comp = AC.createDynamicsCompressor();
      master = AC.createGain(); master.gain.value = 0.7;
      master.connect(comp).connect(AC.destination);
      noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}
function gate(key, ms) {
  if (!AC || muted) return false;
  const t = AC.currentTime * 1000;
  if (lastSfx[key] && t - lastSfx[key] < ms) return false;
  lastSfx[key] = t; return true;
}
function tone(f, dur, type = 'square', vol = 0.05, slide = 0, delay = 0) {
  if (!AC || muted) return;
  const t = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq = 900) {
  if (!AC || muted) return;
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur);
}
const sfx = {
  shoot() { if (gate('shoot', 45)) tone(880, 0.025, 'square', 0.018); },
  hit() { if (gate('hit', 28)) tone(260 + rnd() * 80, 0.03, 'square', 0.03); },
  steel() { if (gate('steel', 40)) tone(1800 + rnd() * 300, 0.04, 'triangle', 0.03); },
  wall() { if (gate('wall', 60)) tone(180, 0.02, 'triangle', 0.02); },
  brk(c) { if (!gate('brk', 32)) return; const f = 330 * Math.pow(2, Math.min(c, 24) / 12); tone(f, 0.09, 'triangle', 0.09); tone(f * 2, 0.05, 'square', 0.02); },
  boom() { if (!gate('boom', 70)) return; noise(0.28, 0.22, 800); tone(120, 0.22, 'sine', 0.2, 0.35); },
  zap() { if (gate('zap', 60)) tone(1500, 0.09, 'sawtooth', 0.03, 0.25); },
  laser() { if (gate('laser', 50)) { tone(2200, 0.12, 'sawtooth', 0.035, 0.2); noise(0.08, 0.05, 4000); } },
  slime() { if (gate('slime', 60)) tone(200, 0.12, 'sine', 0.1, 2.2); },
  orb() { if (!gate('orb', 50)) return; tone(988, 0.05, 'square', 0.04); tone(1318, 0.08, 'square', 0.04, 0, 0.05); },
  lvl() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.1, 'square', 0.05, 0, i * 0.07)); },
  pick() { tone(784, 0.06, 'square', 0.05); tone(1175, 0.1, 'square', 0.05, 0, 0.06); },
  crunch(n) { if (!gate('crunch', 40)) return; noise(0.12, 0.07 + Math.min(n, 10) * 0.012, 5200); tone(95, 0.12, 'sine', 0.1, 0.5); },
  slam(lv) { noise(0.4 + lv * 0.1, 0.22 + lv * 0.04, 1600); tone(80 - lv * 8, 0.45, 'sine', 0.3, 0.35); if (lv >= 2) tone(1400, 0.3, 'sawtooth', 0.03, 0.3, 0.05); },
  whoosh() { noise(0.5, 0.1, 700); tone(500, 0.5, 'sine', 0.04, 0.3); },
  beat() { if (!gate('beat', 300)) return; tone(62, 0.12, 'sine', 0.28); tone(55, 0.14, 'sine', 0.22, 0, 0.17); },
  tick() { if (gate('tick', 45)) tone(1760 + rnd() * 400, 0.03, 'square', 0.02); },
  coin() { tone(1318, 0.06, 'square', 0.04); tone(1760, 0.14, 'square', 0.04, 0, 0.06); },
  hurt() { tone(170, 0.35, 'sawtooth', 0.12, 0.45); noise(0.2, 0.15, 400); },
  boss() { [196, 185, 175].forEach((f, i) => tone(f, 0.18, 'sawtooth', 0.08, 0, i * 0.2)); },
  clear() { [523, 659, 784, 1046, 1318, 1568].forEach((f, i) => tone(f, 0.12, 'square', 0.05, 0, i * 0.08)); },
  over() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, 0, i * 0.18)); },
};
let lastBuzz = 0;
function buzz(ms) {
  if (SAVE.settings && SAVE.settings.vibe === false) return;
  const t = performance.now(); if (t - lastBuzz < 70) return; lastBuzz = t;
  try {
    // inside the Expo app, native haptics (iOS has no navigator.vibrate)
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ t: 'haptic', s: ms >= 60 ? 'heavy' : ms >= 25 ? 'medium' : 'light' }));
    else if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}
