// Procedural synthwave. A minor-key chord loop (i - VI - III - VII) with five layers — pad, bass,
// arpeggio, drums, lead — whose volumes follow the game's intensity:
//   0 menu: pad + slow arp · 1 build: + bass · 2 wave: + drums + lead, faster · 3 boss: fastest.
// Notes are scheduled slightly ahead of time on the audio clock (the standard lookahead pattern),
// so timing stays tight even if the page stutters. Each seed picks its own key and lead melody.

import { Rng } from '../core/rng.js';

const TEMPO = [80, 94, 112, 126];
const PROG = [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]]; // i, VI, III, VII (semitones from root)
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const MIX = [
  { pad: 0.5, bass: 0, arp: 0.25, drums: 0, lead: 0 },
  { pad: 0.45, bass: 0.35, arp: 0.3, drums: 0, lead: 0 },
  { pad: 0.35, bass: 0.45, arp: 0.3, drums: 0.5, lead: 0.28 },
  { pad: 0.35, bass: 0.5, arp: 0.35, drums: 0.6, lead: 0.34 },
];

const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

export class Music {
  constructor(ctx, out, noiseBuf) {
    this.ctx = ctx; this.out = out; this.noise = noiseBuf;
    this.layers = {};
    for (const k of ['pad', 'bass', 'arp', 'drums', 'lead']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(out); this.layers[k] = g;
    }
    // A little echo on the arp and lead for that synthwave space.
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = 0.28;
    this.fb = ctx.createGain(); this.fb.gain.value = 0.3;
    this.delay.connect(this.fb); this.fb.connect(this.delay);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    this.delay.connect(wet); wet.connect(out);
    this.step = 0; this.bar = 0; this.level = 0;
    this.timer = null;
    this.reseed(7);
  }

  reseed(seed) {
    const r = new Rng((seed >>> 0) * 31 + 5);
    this.root = 45 + r.int(0, 7);                // A2..E3 area
    this.lead = [];
    for (let b = 0; b < 4; b++) {
      const bar = [];
      for (let s = 0; s < 16; s++) bar.push(r.chance(s % 4 === 0 ? 0.7 : s % 2 === 0 ? 0.35 : 0.12) ? SCALE[r.int(0, SCALE.length - 1)] + (r.chance(0.3) ? 12 : 0) : null);
      this.lead.push(bar);
    }
    this.arpPattern = r.chance(0.5) ? [0, 1, 2, 1] : [0, 1, 2, 3];
  }

  start(seed, level) {
    this.reseed(seed);
    this.setIntensity(level);
    this.next = this.ctx.currentTime + 0.1;
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  setIntensity(level) {
    this.level = Math.max(0, Math.min(3, level));
    const m = MIX[this.level];
    const t = this.ctx.currentTime;
    for (const k in m) this.layers[k].gain.setTargetAtTime(m[k], t, 1.2);
  }

  schedule() {
    const c = this.ctx;
    if (c.state !== 'running') { this.next = c.currentTime + 0.1; return; }
    const spb = 60 / TEMPO[this.level] / 4; // seconds per 16th
    while (this.next < c.currentTime + 0.15) {
      this.play(this.step, this.next, spb);
      this.next += spb;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar = (this.bar + 1) % 4;
    }
  }

  play(s, t, spb) {
    const chord = PROG[this.bar];
    const root = this.root;
    const L = this.level;
    // Pad: whole-bar chord.
    if (s === 0) for (const iv of chord) this.voice('pad', 'sawtooth', hz(root + 12 + iv), t, spb * 16, 0.05, 0.6, 0.07, 900 + L * 400, 3);
    // Bass: eighths on the chord root, octave bounce.
    if (L >= 1 && s % 2 === 0) this.voice('bass', 'square', hz(root - 12 + chord[0] + (s % 8 === 6 ? 12 : 0)), t, spb * 1.6, 0.005, 0.1, 0.16, 500 + L * 150);
    // Arp: chord tones up two octaves; 8ths when calm, 16ths when busy.
    if (L <= 1 ? s % 2 === 0 : true) {
      const idx = this.arpPattern[(s >> (L <= 1 ? 1 : 0)) % this.arpPattern.length];
      const note = root + 24 + (chord[idx % 3] + (idx === 3 ? 12 : 0));
      this.voice('arp', 'triangle', hz(note), t, spb * 0.9, 0.003, 0.06, 0.12, 4000, 0, true);
    }
    // Drums.
    if (L >= 2) {
      if (s % 4 === 0 || (L >= 3 && s === 14)) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 1) this.hat(t, s % 4 === 3 ? 0.07 : 0.045);
    }
    // Lead.
    if (L >= 2) {
      const n = this.lead[this.bar][s];
      if (n !== null) this.voice('lead', 'square', hz(root + 24 + n), t, spb * 1.8, 0.005, 0.12, 0.08, 2600, 0, true);
    }
  }

  voice(layer, type, f, t, dur, a, rel, gain, cutoff, detune = 0, echo = false) {
    const c = this.ctx;
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + a);
    env.gain.setValueAtTime(gain, t + Math.max(a, dur - rel));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass'; flt.frequency.value = cutoff; flt.Q.value = 1.5;
    flt.connect(env); env.connect(this.layers[layer]);
    if (echo) env.connect(this.delay);
    const oscs = detune ? [-detune, detune] : [0];
    for (const dt of oscs) {
      const o = c.createOscillator();
      o.type = type; o.frequency.value = f; o.detune.value = dt * 3;
      o.connect(flt);
      o.start(t); o.stop(t + dur + rel + 0.05);
    }
  }

  kick(t) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g); g.connect(this.layers.drums);
    o.start(t); o.stop(t + 0.3);
  }

  snare(t) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    n.connect(f); f.connect(g); g.connect(this.layers.drums);
    n.start(t, Math.random()); n.stop(t + 0.2);
  }

  hat(t, vol) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    n.connect(f); f.connect(g); g.connect(this.layers.drums);
    n.start(t, Math.random()); n.stop(t + 0.06);
  }
}
