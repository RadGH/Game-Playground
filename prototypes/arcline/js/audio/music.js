// Arcline's music: original synthwave made live with WebAudio — no recordings, no third-party tracks.
// Three moods crossfade into each other: CALM (day, building — warm pads, a gliding arpeggio, a soft beat), NIGHT
// (slower, dreamier, more echo, no kick) and TENSION (a swarm is announced or the city is under attack — driving bass,
// four-on-the-floor, a pulsing alarm line). The game picks the mood with pickMood(); every 8 bars a seeded phrase
// planner chooses which layers play, the arpeggio's shape and a short bell motif, swaps the chord progression every few
// phrases and sometimes moves the key, so the music keeps changing without wandering. Big explosions duck it briefly.
//
//   const m = new Music({ ctx, out, seed });   m.start(); m.setMood('night'); m.duck(0.3, 1.5); m.state(); m.stop();
//   pickMood({ screen, night, alert, creatures, now }, memory) → { mood, memory }   (pure, node-tested)
//   planPhrase(rng, mood, phraseNo) → { layers, arp, motif, rest }                 (pure, node-tested)
//
// Notes are scheduled a quarter second ahead on the audio clock (the standard lookahead pattern) so a stutter in the
// page never makes the beat stumble; a page that was hidden skips the missed notes instead of playing them all at once.

// ------------------------------------------------------------------ pure parts
export const TENSION_CREATURES = 24;      // this many creatures alive at once counts as an attack
export const TENSION_HOLD = 22;           // seconds the tension music stays after the last sign of trouble
export const NIGHT_ON = 0.62, NIGHT_OFF = 0.35;

/** Which mood fits the game right now. Hysteresis keeps it from flickering: tension holds for a while after the
 *  fight, night starts late in the dusk and ends early in the dawn. Off the city screen it's always calm. */
export function pickMood({ screen = 'city', night = 0, alert = false, creatures = 0, now = 0 } = {}, mem = {}) {
  const m = { mood: mem.mood || 'calm', tensionUntil: mem.tensionUntil ?? -1, nightOn: !!mem.nightOn };
  if (screen !== 'city') { m.mood = 'calm'; m.tensionUntil = -1; return { mood: 'calm', memory: m }; }
  if (alert || creatures >= TENSION_CREATURES) m.tensionUntil = now + TENSION_HOLD;
  m.nightOn = m.nightOn ? night > NIGHT_OFF : night >= NIGHT_ON;
  m.mood = now < m.tensionUntil ? 'tension' : m.nightOn ? 'night' : 'calm';
  return { mood: m.mood, memory: m };
}

/** A small seeded random (mulberry32): same seed, same music. */
export function rng(seed) { let a = seed >>> 0 || 1; const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; f.int = n => Math.floor(f() * n); f.pick = a => a[Math.floor(f() * a.length)]; return f; }

const SCALES = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11] };
/** Each mood: tempo, scales, chord progressions (scale steps, one chord per `barsPerChord` bars), the chance of each
 *  layer in a phrase, and the mix. */
export const MOODS = {
  calm: { bpm: 96, scales: ['aeolian', 'dorian'], barsPerChord: 1, swing: 0,
    progs: [[0, 5, 2, 6], [0, 3, 5, 4], [5, 3, 0, 6], [0, 6, 5, 6], [3, 4, 0, 0], [0, 2, 5, 4]],
    odds: { bass: 0.85, arp: 0.8, drums: 0.7, bell: 0.45, rest: 0.1 }, arps: ['up', 'updown', 'pattern', 'down'],
    mix: { pad: 0.16, bass: 0.2, arp: 0.08, bell: 0.06, kick: 0.34, snare: 0.12, hat: 0.04 }, arpRate: 2, cutoff: 1500 },
  night: { bpm: 76, scales: ['dorian', 'aeolian'], barsPerChord: 2, swing: 0.12,
    progs: [[0, 5, 3, 6], [0, 3, 0, 5], [5, 6, 0, 0], [0, 2, 3, 4]],
    odds: { bass: 0.6, arp: 0.75, drums: 0.45, bell: 0.6, rest: 0.18 }, arps: ['pattern', 'updown', 'up'],
    mix: { pad: 0.15, bass: 0.17, arp: 0.065, bell: 0.065, kick: 0, snare: 0.1, hat: 0.035 }, arpRate: 2, cutoff: 1100 },
  tension: { bpm: 122, scales: ['phrygian', 'harmonic'], barsPerChord: 1, swing: 0,
    progs: [[0, 0, 1, 0], [0, 5, 6, 4], [0, 1, 5, 4], [0, 0, 5, 6]],
    odds: { bass: 1, arp: 0.9, drums: 0.95, bell: 0.15, rest: 0 }, arps: ['up', 'pattern', 'down'],
    mix: { pad: 0.11, bass: 0.2, arp: 0.07, bell: 0.05, kick: 0.42, snare: 0.16, hat: 0.045 }, arpRate: 4, cutoff: 2100 },
};

/** What the next 8 bars do. Pure: same rng state, same plan. A "rest" phrase is pads alone, to breathe. */
export function planPhrase(r, mood, phraseNo = 0) {
  const M = MOODS[mood] || MOODS.calm, o = M.odds;
  const rest = phraseNo > 1 && r() < o.rest;
  const intro = phraseNo === 0;
  const layers = { pad: true, bass: !rest && !intro && r() < o.bass, arp: !rest && r() < o.arp, drums: !rest && !intro && r() < o.drums, bell: !rest && r() < o.bell };
  if (mood === 'tension' && !intro) layers.bass = layers.drums = true;
  const arp = { shape: r.pick(M.arps), octaves: 1 + r.int(2), pattern: Array.from({ length: 8 }, () => r.int(4)) };
  const motif = Array.from({ length: 8 }, () => (r() < 0.45 ? null : r.int(5)));   // chord-tone steps on 8th-note slots, two beats each pair
  return { layers, arp, motif, rest };
}
/** The notes of chord `deg` in a scale (MIDI, root `key`): a triad, sometimes with the 7th. */
export function chordNotes(key, scale, deg, seventh = false) {
  const s = SCALES[scale] || SCALES.aeolian, at = i => key + s[(deg + i) % 7] + 12 * Math.floor((deg + i) / 7);
  return seventh ? [at(0), at(2), at(4), at(6)] : [at(0), at(2), at(4)];
}
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

// ------------------------------------------------------------------ the player
export class Music {
  constructor({ ctx, out, seed = 1 }) {
    this.ctx = ctx; this.out = out; this.seed = seed >>> 0; this.r = rng(this.seed);
    this.mood = null; this.players = []; this.timer = null; this.notes = 0; this.playing = false;
    // shared effects: a long generated reverb, a dotted-8th echo, a gentle glue compressor, the duck
    const c = ctx;
    this.duckG = c.createGain(); this.duckG.connect(out);
    this.glue = c.createDynamicsCompressor(); this.glue.threshold.value = -18; this.glue.ratio.value = 3; this.glue.attack.value = 0.02; this.glue.release.value = 0.3;
    this.glue.connect(this.duckG);
    this.bus = c.createGain(); this.bus.gain.value = 1; this.bus.connect(this.glue);
    this.verb = c.createConvolver(); this.verb.buffer = this._impulse(3.2); const vg = c.createGain(); vg.gain.value = 0.55; this.verb.connect(vg).connect(this.bus);
    this.echo = c.createDelay(2); const fb = c.createGain(); fb.gain.value = 0.38; const elp = c.createBiquadFilter(); elp.type = 'lowpass'; elp.frequency.value = 2600;
    this.echo.connect(elp).connect(fb).connect(this.echo); const eg = c.createGain(); eg.gain.value = 0.5; elp.connect(eg).connect(this.bus); eg.connect(this.verb);
    this.noise = this._noiseBuf();
  }
  start() { if (this.playing) return; this.playing = true; this.timer = setInterval(() => this._tick(), 50); if (!this.mood) this.setMood('calm'); }
  stop() { this.playing = false; clearInterval(this.timer); this.timer = null; for (const p of this.players) p.fade(0, 0.5); this.players = []; this.mood = null; }
  /** Crossfade to a mood: tension comes in fast (2 s), the others drift in over 5 s. */
  setMood(mood) {
    if (!MOODS[mood] || mood === this.mood) return;
    const t = this.ctx.currentTime, fadeIn = mood === 'tension' ? 2 : 5, fadeOut = this.mood === 'tension' ? 6 : 4;
    for (const p of this.players) { p.fade(0, fadeOut); p.dieAt = t + fadeOut * 1.2; }
    const p = new MoodPlayer(this, mood, (this.seed + this.r.int(1e9)) >>> 0);
    p.fade(1, fadeIn);
    this.players.push(p); this.mood = mood;
  }
  /** Push the music down to `depth` (0..1) for about `sec` seconds — under a big blast. Deeper ducks win. */
  duck(depth = 0.35, sec = 1.5) {
    const g = this.duckG.gain, t = this.ctx.currentTime;
    if (this._duckUntil > t && depth >= this._duckDepth) return;
    this._duckUntil = t + sec; this._duckDepth = depth;
    g.cancelScheduledValues(t); g.setTargetAtTime(depth, t, 0.03); g.setTargetAtTime(1, t + sec * 0.4, sec * 0.25);
  }
  state() {
    const p = this.players[this.players.length - 1];
    return { playing: this.playing, mood: this.mood, players: this.players.length, notes: this.notes, bpm: p?.M.bpm ?? 0, key: p?.key ?? null, scale: p?.scale ?? null, bar: p?.bar ?? 0, phrase: p?.phraseNo ?? 0, layers: p?.plan?.layers ?? null, duck: +this.duckG.gain.value.toFixed(3) };
  }

  _tick() {
    if (!this.playing) return;
    const t = this.ctx.currentTime;
    this.players = this.players.filter(p => { if (p.dieAt && t > p.dieAt) { p.out.disconnect(); return false; } return true; });
    for (const p of this.players) p.schedule(t + 0.25);
  }
  _impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) { const k = i / n; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - k, 2.6) * (k < 0.01 ? k * 100 : 1); } }
    return b;
  }
  _noiseBuf() { const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
}

/** One mood playing: its own clock, key, progression and phrase plan, through its own fade gain. */
class MoodPlayer {
  constructor(music, mood, seed) {
    this.m = music; this.ctx = music.ctx; this.mood = mood; this.M = MOODS[mood]; this.r = rng(seed);
    this.out = this.ctx.createGain(); this.out.gain.value = 0.0001; this.out.connect(music.bus);
    this.sendVerb = this.ctx.createGain(); this.sendVerb.gain.value = mood === 'night' ? 0.55 : 0.35; this.sendVerb.connect(music.verb);
    this.sendEcho = this.ctx.createGain(); this.sendEcho.gain.value = mood === 'night' ? 0.5 : 0.32; this.sendEcho.connect(music.echo);
    this.key = 45 + this.r.int(8);                         // A2..E3 for the bass's root
    this.scale = this.r.pick(this.M.scales); this.prog = this.r.pick(this.M.progs);
    this.step = 0; this.bar = 0; this.phraseNo = 0; this.next = this.ctx.currentTime + 0.1;
    this.beat = 60 / this.M.bpm; this.sixteenth = this.beat / 4;
    music.echo.delayTime.setValueAtTime(this.beat * 0.75, this.ctx.currentTime);   // dotted 8th
    this.plan = planPhrase(this.r, mood, 0);
  }
  fade(v, sec) { const g = this.out.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(Math.max(0.0001, v), t + sec); }

  schedule(until) {
    const now = this.ctx.currentTime;
    if (this.next < now - 0.1) { const skip = Math.ceil((now - this.next) / this.sixteenth); this.step += skip; this.next += skip * this.sixteenth; }   // came back from a hidden tab
    while (this.next < until) { this._step(this.step, this.next); this.step++; this.next += this.sixteenth; }
  }

  _step(step, t) {
    const s16 = step % 16;
    if (s16 === 0) this._bar(step / 16 | 0, t);
    const M = this.M, L = this.plan.layers, mix = M.mix, chord = this.chord;
    const swing = (s16 % 2 === 1) ? M.swing * this.sixteenth : 0, ts = t + swing;
    // drums
    if (L.drums) {
      if (mix.kick && (this.mood === 'tension' ? s16 % 4 === 0 : s16 === 0 || s16 === 8 || (s16 === 10 && this.r() < 0.3))) this._kick(t, mix.kick);
      if (s16 === 4 || s16 === 12) this._snare(t, mix.snare * (this.mood === 'night' ? 0.6 : 1));
      const hatEvery = this.mood === 'tension' ? 1 : 2;
      if (s16 % hatEvery === 0) this._hat(ts, mix.hat * (s16 % 4 === 2 ? 1.2 : 0.7), s16 === 14 && this.r() < 0.3);
    } else if (this.mood !== 'tension' && s16 % 4 === 2 && this.bar % 2 === 1 && !this.plan.rest) this._hat(ts, mix.hat * 0.5, false);
    // bass
    if (L.bass) {
      const root = chord[0] - 12 - (chord[0] - 12 - this.key >= 7 ? 12 : 0);   // stay low: fold anything a fifth or more above the key down
      if (this.mood === 'tension') { if (s16 % 2 === 0) this._bass(t, s16 % 4 === 0 ? root : root + 12, this.sixteenth * 1.7, mix.bass); }
      else if (this.mood === 'night') { if (s16 === 0) this._bass(t, root, this.beat * 3.5, mix.bass); else if (s16 === 12 && this.r() < 0.5) this._bass(t, root + 7, this.beat * 0.9, mix.bass * 0.7); }
      else if (s16 % 4 === 0 || s16 === 6 || s16 === 14) this._bass(t, s16 === 8 && this.r() < 0.4 ? root + 7 : root, this.sixteenth * (s16 % 4 === 0 ? 3 : 1.6), mix.bass * (s16 % 4 === 0 ? 1 : 0.7));
    }
    // arpeggio
    const rate = M.arpRate;   // notes per beat
    if (L.arp && s16 % (4 / rate) === 0) {
      const tones = []; for (let o = 0; o < this.plan.arp.octaves + 1; o++) for (const n of chord) tones.push(n + 12 + 12 * o);
      const i = (s16 / (4 / rate)) | 0, a = this.plan.arp, N = tones.length;
      const idx = a.shape === 'up' ? i % N : a.shape === 'down' ? N - 1 - (i % N) : a.shape === 'updown' ? (() => { const k = i % (2 * N - 2 || 1); return k < N ? k : 2 * N - 2 - k; })() : a.pattern[i % 8] % N;
      this._arp(ts, tones[idx], mix.arp * (i % 4 === 0 ? 1 : 0.75));
    }
    // bell motif: a short tune on chord tones, two bars long, repeated through the phrase
    if (L.bell && s16 % 2 === 0) {
      const slot = ((this.bar % 2) * 8 + s16 / 2) | 0, v = this.plan.motif[slot % 8];
      if (v != null && (slot < 8 || this.r() < 0.8)) { const tone = chord[v % chord.length] + 12 + (v >= 3 ? 12 : 0); this._bell(ts, tone, mix.bell); }
    }
    this.m.notes++;
  }

  _bar(bar, t) {
    this.bar = bar;
    if (bar > 0 && bar % 8 === 0) {
      this.phraseNo++;
      if (this.phraseNo % 4 === 0) this.prog = this.r.pick(this.M.progs);
      if (this.phraseNo % 6 === 0 && this.r() < 0.6) { this.key = 45 + ((this.key - 45 + this.r.pick([5, 7, -2, 3])) % 8 + 8) % 8; this.scale = this.r.pick(this.M.scales); }
      this.plan = planPhrase(this.r, this.mood, this.phraseNo);
    }
    const ci = Math.floor(bar / this.M.barsPerChord) % this.prog.length, deg = this.prog[ci];
    this.chord = chordNotes(this.key + 12, this.scale, deg, this.r() < 0.35);
    if (bar % this.M.barsPerChord === 0) this._pad(t, this.chord, this.beat * 4 * this.M.barsPerChord, this.M.mix.pad * (this.plan.rest ? 1.2 : 1));
  }

  // ---------------------------------------------------------------- instruments
  _env(g, t, a, peak, d, sustain, rel, end) {
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
    if (d) g.gain.setTargetAtTime(peak * sustain, t + a, d);
    g.gain.setTargetAtTime(0.0001, end, rel);
  }
  _voice(dest, verb = 0, echo = 0) {
    const g = this.ctx.createGain(); g.connect(dest || this.out);
    if (verb) { const s = this.ctx.createGain(); s.gain.value = verb; g.connect(s).connect(this.sendVerb); }
    if (echo) { const s = this.ctx.createGain(); s.gain.value = echo; g.connect(s).connect(this.sendEcho); }
    return g;
  }
  _pad(t, notes, dur, level) {
    const c = this.ctx, f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(this.M.cutoff * 0.5, t); f.frequency.linearRampToValueAtTime(this.M.cutoff, t + dur * 0.5); f.frequency.linearRampToValueAtTime(this.M.cutoff * 0.6, t + dur);
    const g = this._voice(null, 0.9); f.connect(g);
    const end = t + dur, stopAt = end + 3;
    this._env(g, t, Math.min(1.2, dur * 0.3), level, 0, 1, 0.6, end);
    for (const n of notes) for (const det of [-8, 7]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(n); o.detune.value = det + (this.r() - 0.5) * 4;
      const og = c.createGain(); og.gain.value = 1 / (notes.length * 2.4); o.connect(og).connect(f); o.start(t); o.stop(stopAt);
    }
    const sub = c.createOscillator(); sub.type = 'sine'; sub.frequency.value = hz(notes[0] - 12); const sg = c.createGain(); sg.gain.value = 0.25; sub.connect(sg).connect(f); sub.start(t); sub.stop(stopAt);
  }
  _bass(t, n, dur, level) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = this._voice();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = hz(n); o2.frequency.value = hz(n - 12);
    const g2 = c.createGain(); g2.gain.value = 0.35; o2.connect(g2).connect(f);
    f.type = 'lowpass'; f.Q.value = 4; f.frequency.setValueAtTime(this.mood === 'tension' ? 1400 : 900, t); f.frequency.setTargetAtTime(220, t, dur * 0.35);
    o.connect(f).connect(g); this._env(g, t, 0.008, level, 0.15, 0.7, 0.05, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.4); o2.stop(t + dur + 0.4);
  }
  _arp(t, n, level) {
    const c = this.ctx, o = c.createOscillator(), f = c.createBiquadFilter(), g = this._voice(null, 0.3, 1);
    o.type = this.mood === 'night' ? 'triangle' : 'square'; o.frequency.value = hz(n);
    f.type = 'lowpass'; f.frequency.setValueAtTime(this.M.cutoff * 2.2, t); f.frequency.exponentialRampToValueAtTime(this.M.cutoff * 0.6, t + 0.16);
    o.connect(f).connect(g); this._env(g, t, 0.004, level, 0.05, 0.3, 0.06, t + 0.12);
    o.start(t); o.stop(t + 0.6);
  }
  _bell(t, n, level) {
    const c = this.ctx, car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = this._voice(null, 0.8, 0.6);
    car.type = 'sine'; mod.type = 'sine'; car.frequency.value = hz(n); mod.frequency.value = hz(n) * 3.5;
    mg.gain.setValueAtTime(hz(n) * 2.2, t); mg.gain.exponentialRampToValueAtTime(hz(n) * 0.05, t + 0.9);
    mod.connect(mg).connect(car.frequency); car.connect(g); this._env(g, t, 0.005, level, 0.25, 0.4, 0.35, t + 0.3);
    car.start(t); mod.start(t); car.stop(t + 2.4); mod.stop(t + 2.4);
  }
  _kick(t, level) {
    const c = this.ctx, o = c.createOscillator(), g = this._voice();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g); o.start(t); o.stop(t + 0.4);
  }
  _snare(t, level) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = this._voice(null, 1.2);
    s.buffer = this.m.noise; f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(f).connect(g); s.start(t, Math.random() * 0.5); s.stop(t + 0.22);
    const o = c.createOscillator(), og = this._voice(); o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    og.gain.setValueAtTime(level * 0.5, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1); o.connect(og); o.start(t); o.stop(t + 0.12);
  }
  _hat(t, level, open) {
    const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = this._voice(null, 0.15);
    s.buffer = this.m.noise; f.type = 'highpass'; f.frequency.value = 7200;
    const len = open ? 0.22 : 0.045;
    g.gain.setValueAtTime(level, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g); s.start(t, Math.random() * 0.5); s.stop(t + len + 0.02);
  }
}
