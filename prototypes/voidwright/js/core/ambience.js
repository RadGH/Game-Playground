// Ambience: the sound of being somewhere, apart from the music (owner 2026-11-16: "if [music is] disabled, keep the
// ambient sfx"). Everything here is synthesized (original); the shared sfx/ library's recorded "ambience.void" bed
// still plays underneath on its own ambience bus. Layers, each faded in and out by bedMix():
//
//   void     a deep, slowly breathing space rumble (always there in flight, softer when docked)
//   engine   your ship's hum: rises in pitch and loudness with speed and thrust, a little lower for big hulls
//   station  docked: the hangar's mains hum, air through vents, radio chatter bursts and the odd far-off clank
//   alien    alien space / anomalies: high glassy tones that slide past each other and a whispering breath
//   ping     dangerous stars: a faint far-off sonar ping every several seconds
//
//   const bed = new Bed({ ctx, out });   bed.update(dt, state) each frame;   bed.state() for tests
//   bedMix(state) → { void, engine, station, alien, ping } 0..1                                (pure, node-tested)

const clamp01 = v => Math.max(0, Math.min(1, v));

/** Each layer's level 0..1 from the game. state: { mode, speed (px/s), thrust 0..1, size (ship radius), alien 0..1, tier }. */
export function bedMix({ mode = 'fly', speed = 0, thrust = 0, alien = 0, tier = 1 } = {}) {
  const docked = mode === 'docked', flying = mode === 'fly' || mode === 'jumping';
  const sp = clamp01(speed / 600);
  return {
    void: mode === 'title' ? 0.8 : docked ? 0.3 : 1,
    engine: flying ? 0.25 + 0.45 * sp + 0.3 * clamp01(thrust) : 0,
    station: docked ? 1 : 0,
    alien: docked || mode === 'title' ? 0 : clamp01(alien),
    ping: flying && tier >= 5 ? clamp01((tier - 4) / 4) : 0,
  };
}

const GAIN = { void: 0.2, engine: 0.2, station: 0.2, alien: 0.06, ping: 0.05 };   // measured: the bed sits ~5 dB under the music at default sliders (README › Sound)

export class Bed {
  constructor({ ctx, out }) {
    this.ctx = ctx; this.out = out; this.levels = { void: 0, engine: 0, station: 0, alien: 0, ping: 0 }; this.st = {};
    this._chatT = 3; this._clankT = 6; this._pingT = 4; this._alienT = 0;
    const c = ctx, n = c.sampleRate * 4, b = c.createBuffer(2, n, c.sampleRate);
    // brown-ish noise, stereo, 4 s (long enough that the loop point never shows)
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let last = 0; for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } }
    this.brown = b;
    const wn = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), wd = wn.getChannelData(0); for (let i = 0; i < wd.length; i++) wd[i] = Math.random() * 2 - 1;
    this.white = wn;
    this.g = {};
    for (const k of Object.keys(GAIN)) { const g = c.createGain(); g.gain.value = 0; g.connect(out); this.g[k] = g; }
    this._buildVoid(); this._buildEngine(); this._buildStation(); this._buildAlien();
  }
  _loop(buf, rate = 1) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(this.ctx.currentTime + Math.random() * 0.1, Math.random() * 2); return s; }
  _buildVoid() {
    const c = this.ctx, s = this._loop(this.brown, 0.5), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.Q.value = 0.5;
    const breath = c.createGain(); breath.gain.value = 0.8; const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 0.3; lfo.connect(lg).connect(breath.gain); lfo.start();
    s.connect(lp).connect(breath).connect(this.g.void);
    // two very low tones beating slowly against each other
    for (const [f, v] of [[41.2, 0.18], [41.6, 0.14], [61.8, 0.06]]) { const o = c.createOscillator(); o.frequency.value = f; const og = c.createGain(); og.gain.value = v; o.connect(og).connect(this.g.void); o.start(); }
    // a faint high shimmer of "solar wind"
    const w = this._loop(this.white, 1), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.6; const wg = c.createGain(); wg.gain.value = 0.012;
    const wl = c.createOscillator(), wlg = c.createGain(); wl.frequency.value = 0.07; wlg.gain.value = 1400; wl.connect(wlg).connect(bp.frequency); wl.start();
    w.connect(bp).connect(wg).connect(this.g.void);
  }
  _buildEngine() {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 42;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 84.4;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.Q.value = 2;
    const og = c.createGain(); og.gain.value = 0.5; const o2g = c.createGain(); o2g.gain.value = 0.12;
    o.connect(og).connect(lp); o2.connect(o2g).connect(lp);
    const n = this._loop(this.brown, 1.4), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.9; const ng = c.createGain(); ng.gain.value = 0.9;
    n.connect(bp).connect(ng).connect(this.g.engine);
    lp.connect(this.g.engine); o.start(); o2.start();
    this.eng = { o, o2, lp, bp };
  }
  _buildStation() {
    const c = this.ctx;
    // mains hum: 50 Hz and its harmonics, through a soft lowpass
    for (const [f, v] of [[50, 0.18], [100, 0.1], [150, 0.05], [200, 0.025]]) { const o = c.createOscillator(); o.frequency.value = f; const g = c.createGain(); g.gain.value = v; o.connect(g).connect(this.g.station); o.start(); }
    // air through vents
    const n = this._loop(this.brown, 2.2), hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 900; hp.Q.value = 0.4; const g = c.createGain(); g.gain.value = 0.35;
    n.connect(hp).connect(g).connect(this.g.station);
  }
  _buildAlien() {
    const c = this.ctx; this.alienOsc = [];
    for (const [f, pan] of [[880, -0.6], [1174, 0.5], [1318, 0.1]]) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.25;
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.08 + Math.random() * 0.1; lg.gain.value = 0.25; lfo.connect(lg).connect(g.gain); lfo.start();
      let tail = g; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
      o.connect(g); tail.connect(this.g.alien); o.start(); this.alienOsc.push(o);
    }
    // whispering breath: noise through a formant-like band that wanders
    const n = this._loop(this.white, 1), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.value = 1200;
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.21; lg.gain.value = 700; lfo.connect(lg).connect(bp.frequency); lfo.start();
    const g = c.createGain(); g.gain.value = 0.6; n.connect(bp).connect(g).connect(this.g.alien);
  }

  /** Once a frame. Moves layer levels smoothly and schedules the one-off sounds (radio chatter, clanks, pings). */
  update(dt, st = {}) {
    const c = this.ctx, t = c.currentTime; this.st = st;
    const mix = bedMix(st);
    for (const k of Object.keys(GAIN)) {
      const target = mix[k] * GAIN[k];
      if (Math.abs(target - this.levels[k]) > 0.0005) this.g[k].gain.setTargetAtTime(target, t, k === 'engine' ? 0.25 : 1.2);
      this.levels[k] = target;
    }
    // the engine follows the ship
    const sp = clamp01((st.speed || 0) / 600), th = clamp01(st.thrust || 0), big = clamp01(((st.size || 20) - 20) / 200);
    const base = 46 - big * 14;
    this.eng.o.frequency.setTargetAtTime(base * (1 + sp * 0.5 + th * 0.12), t, 0.3);
    this.eng.o2.frequency.setTargetAtTime(base * 2.01 * (1 + sp * 0.5 + th * 0.12), t, 0.3);
    this.eng.lp.frequency.setTargetAtTime(180 + sp * 380 + th * 260, t, 0.2);
    this.eng.bp.frequency.setTargetAtTime(380 + sp * 900, t, 0.3);
    if (mix.station > 0.5) {
      if ((this._chatT -= dt) <= 0) { this._chatT = 4 + Math.random() * 9; this._chatter(t + 0.05); }
      if ((this._clankT -= dt) <= 0) { this._clankT = 7 + Math.random() * 14; this._clank(t + 0.05); }
    }
    if (mix.ping > 0 && (this._pingT -= dt) <= 0) { this._pingT = 7 + Math.random() * 8; this._ping(t + 0.05); }
    if (mix.alien > 0.1 && (this._alienT -= dt) <= 0) {
      this._alienT = 6 + Math.random() * 6;
      // the glassy tones slide to new notes now and then (a whole-tone set, so it never resolves)
      for (const o of this.alienOsc) o.frequency.setTargetAtTime(660 * Math.pow(2, (2 * Math.floor(Math.random() * 7)) / 12), t, 2.5);
    }
  }
  /** A burst of radio chatter: a squelch chirp, some "syllables" of band-limited noise and tone, a click off. */
  _chatter(t) {
    const c = this.ctx, out = c.createGain(); out.gain.value = 0.55; let tail = out;
    if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.random() * 1.4 - 0.7; out.connect(p); tail = p; }
    tail.connect(this.g.station);
    const beep = (at, f, len) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.25, at + 0.005); g.gain.setTargetAtTime(0.0001, at + len, 0.01); o.connect(g).connect(out); o.start(at); o.stop(at + len + 0.1); };
    beep(t, 1400 + Math.random() * 400, 0.06);
    const words = 3 + Math.floor(Math.random() * 6); let at = t + 0.12;
    const s = c.createBufferSource(); s.buffer = this.white; s.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; const g = c.createGain(); g.gain.value = 0.0001;
    const tone = c.createOscillator(); tone.type = 'sawtooth'; tone.frequency.value = 110 + Math.random() * 80; const tg = c.createGain(); tg.gain.value = 0.06; const tlp = c.createBiquadFilter(); tlp.type = 'bandpass'; tlp.frequency.value = 900; tlp.Q.value = 2;
    tone.connect(tlp).connect(tg).connect(g);
    s.connect(bp).connect(g).connect(out);
    for (let i = 0; i < words; i++) {
      const len = 0.08 + Math.random() * 0.22;
      bp.frequency.setValueAtTime(700 + Math.random() * 1600, at);
      tone.frequency.setValueAtTime(100 + Math.random() * 90, at);
      g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(0.45, at + 0.02); g.gain.setTargetAtTime(0.0001, at + len, 0.02);
      at += len + 0.04 + Math.random() * 0.12;
    }
    s.start(t + 0.1, Math.random()); s.stop(at + 0.2); tone.start(t + 0.1); tone.stop(at + 0.2);
    beep(at + 0.05, 900, 0.04);
  }
  /** Something heavy set down somewhere else in the station. */
  _clank(t) {
    const c = this.ctx, g = c.createGain(), lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; g.connect(lp).connect(this.g.station);
    for (const [f, v] of [[173, 0.3], [411, 0.18], [987, 0.07]]) { const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (0.9 + Math.random() * 0.2); const og = c.createGain(); og.gain.setValueAtTime(v, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); o.connect(og).connect(g); o.start(t); o.stop(t + 1.5); }
  }
  /** A far-off sonar ping with its own echo. */
  _ping(t) {
    const c = this.ctx;
    for (const [d, v] of [[0, 1], [0.45, 0.35], [0.9, 0.12]]) {
      const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = 1320;
      g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(v, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9);
      o.connect(g).connect(this.g.ping); o.start(t + d); o.stop(t + d + 1);
    }
  }
  state() { return { ...Object.fromEntries(Object.entries(this.levels).map(([k, v]) => [k, +v.toFixed(4)])) }; }
}
