// Tiny synthesized sound effects (no audio files needed).

let ctx = null;
let master = null;
let noiseBuf = null;
const last = {};

function tone(t, freq, dur, type = 'sine', vol = 0.3, slide = null, attack = 0.005) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(t, dur, freq = 1200, vol = 0.3, type = 'bandpass', q = 1, slideTo = null) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (slideTo) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t);
  s.stop(t + dur);
}

const SOUNDS = {
  swing: (t) => noise(t, 0.16, 900, 0.22, 'bandpass', 0.8, 3200),
  hit: (t) => { noise(t, 0.08, 1800, 0.3, 'bandpass', 1.5); tone(t, 180, 0.12, 'square', 0.1, 70); },
  crit: (t) => { noise(t, 0.1, 2600, 0.35); tone(t, 900, 0.15, 'triangle', 0.18, 1600); },
  bow: (t) => { tone(t, 420, 0.18, 'triangle', 0.22, 170); noise(t, 0.08, 4000, 0.1, 'highpass'); },
  arrowHit: (t) => noise(t, 0.06, 2200, 0.18),
  coin: (t) => { tone(t, 1320, 0.07, 'square', 0.05); tone(t + 0.06, 1760, 0.12, 'square', 0.05); },
  hurt: (t) => tone(t, 220, 0.2, 'sawtooth', 0.13, 90),
  petHurt: (t) => tone(t, 760, 0.15, 'square', 0.08, 420),
  heal: (t) => tone(t, 520, 0.3, 'sine', 0.14, 900),
  tame: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, f, 0.25, 'triangle', 0.16)),
  fail: (t) => [400, 290].forEach((f, i) => tone(t + i * 0.12, f, 0.2, 'square', 0.09)),
  buy: (t) => { tone(t, 880, 0.1, 'triangle', 0.18); tone(t + 0.08, 1320, 0.22, 'triangle', 0.18); },
  pickup: (t) => tone(t, 660, 0.12, 'triangle', 0.18, 990),
  wave: (t) => [196, 247, 294].forEach((f) => tone(t, f, 0.9, 'sawtooth', 0.06)),
  clear: (t) => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.07, f, 0.3, 'triangle', 0.14)),
  die: (t) => { noise(t, 0.25, 600, 0.25, 'lowpass', 1, 150); tone(t, 300, 0.25, 'square', 0.07, 60); },
  fireball: (t) => noise(t, 0.3, 500, 0.16, 'lowpass', 1, 2000),
  zap: (t) => { noise(t, 0.12, 5000, 0.16, 'highpass'); tone(t, 1200, 0.1, 'sawtooth', 0.05, 300); },
  boss: (t) => { tone(t, 55, 1.6, 'sawtooth', 0.18, 40); tone(t, 82, 1.6, 'square', 0.07, 60); },
  chest: (t) => [392, 523, 659, 784].forEach((f, i) => tone(t + i * 0.06, f, 0.22, 'sine', 0.18)),
  slam: (t) => { noise(t, 0.5, 300, 0.45, 'lowpass', 1, 60); tone(t, 70, 0.4, 'sine', 0.35, 35); },
  down: (t) => [500, 400, 300, 200].forEach((f, i) => tone(t + i * 0.1, f, 0.18, 'triangle', 0.14)),
  gameover: (t) => [392, 330, 262, 196].forEach((f, i) => tone(t + i * 0.25, f, 0.5, 'triangle', 0.16)),
  click: (t) => tone(t, 800, 0.05, 'square', 0.05),
  portal: (t) => { noise(t, 0.7, 300, 0.25, 'bandpass', 2, 3000); tone(t, 220, 0.7, 'sine', 0.16, 880); tone(t + 0.1, 330, 0.6, 'triangle', 0.08, 1320); },
  roar: (t) => { noise(t, 1.4, 260, 0.5, 'lowpass', 3, 90); tone(t, 95, 1.3, 'sawtooth', 0.2, 50); tone(t + 0.05, 140, 1.1, 'square', 0.07, 70); },
  breath: (t) => noise(t, 0.35, 700, 0.18, 'bandpass', 0.6, 300),
  boom: (t) => { noise(t, 0.9, 200, 0.6, 'lowpass', 1, 40); tone(t, 60, 0.7, 'sine', 0.4, 28); },
  wings: (t) => { noise(t, 0.12, 500, 0.2, 'lowpass', 1); noise(t + 0.18, 0.12, 500, 0.16, 'lowpass', 1); },
  relic: (t) => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(t + i * 0.09, f, 0.4, 'triangle', 0.15)),
  empower: (t) => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.12, f, 0.7, 'sine', 0.16)); noise(t, 1.2, 2000, 0.1, 'highpass', 1); },
  victory: (t) => [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(t + i * 0.14, f, 0.5, 'triangle', 0.17)),
  error: (t) => tone(t, 180, 0.15, 'square', 0.08),
};

export const Audio = {
  muted: false,
  init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      ctx = null;
    }
  },
  toggle() {
    this.muted = !this.muted;
    if (master) master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  },
  play(name) {
    if (!ctx || this.muted || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (last[name] && now - last[name] < 0.045) return;
    last[name] = now;
    const f = SOUNDS[name];
    if (f) f(now);
  },
};
