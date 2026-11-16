// The sound mix for a zoomable city view: effects get quieter as the camera pulls back (and quieter still off screen),
// while an ambient bed — the city's hum and traffic, the wilds' wind, alien birds by day and alien insects by night,
// rain and storms — fades in to take their place. Owner 2026-11-16: "the sound effects should get quieter and replaced
// by ambient sound (partially) when you zoom out."
//
//   import { mix } from './mix.js';
//   mix.attach(sfx)                       after the Sound Lab is up (sound.js startSound does this)
//   mix.setZoom(z) · mix.setNight(0..1) · mix.setWeather({ rain, storm }) · mix.setCity(0..1)   each frame, cheap
//   mix.setActive(bool)                    false on screens without a map (title, world map): no ambient bed
//   mix.locate((x, z) => screens outside the view, 0 = on screen)                                for off-screen effects
//   mix.setLevels({ master, effects, ambience, music, muted })                                   the settings sliders
//   mix.update(dt)                         once a frame: moves the bed's levels, schedules birds/insects
//   mix.effectGain(id, { x, z, global }) → 0..1   sound.js multiplies every effect by this (global: no zoom/distance)
//   mix.musicOut                           GainNode a music player connects into (master volume + mute apply)
//   mix.onDuck(fn)                         fn(depth 0..1, seconds) when a big explosion should push the music down
//   mix.state()                            numbers for tests and game-eye
//
// Pure helpers (zoomGain, ambienceLevel, offscreenGain, bedMix, levelsFrom) are exported for node tests. Every bed
// layer except rain and storm is synthesized here (original sounds); rain/storm use the Sound Lab's CC0 loops.

export const ZOOM = { min: 0.35, full: 1.2, floor: 0.25, bedClose: 0.3, bedFull: 0.45, bedMax: 1.4 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Effects volume for a camera zoom: 1 at zoom ≥ 1.2, easing down to 0.25 at the widest (0.35). */
export function zoomGain(z) { return ZOOM.floor + (1 - ZOOM.floor) * smooth(ZOOM.min, ZOOM.full, z); }
/** How much of the ambient bed plays: 0.3 when close in (it never vanishes — "partially"), 1 at the widest. */
export function ambienceLevel(z) { return ZOOM.bedClose + (1 - ZOOM.bedClose) * (1 - smooth(ZOOM.bedFull, ZOOM.bedMax, z)); }
/** An effect `d` screens outside the view: 1 on screen, 0.4 half a screen out, silent past 2.5 screens. */
export function offscreenGain(d) { if (!(d > 0)) return 1; if (d >= 2.5) return 0; return (1 / (1 + 3 * d)) * (1 - smooth(1.6, 2.5, d)); }

/** Each bed layer's level 0..1 from the view: zoom, night 0..1, rain/storm flags, city size 0..1. */
export function bedMix({ zoom = 1, night = 0, rain = false, storm = false, city = 0 } = {}) {
  const a = ambienceLevel(zoom), wet = storm ? 1 : rain ? 0.6 : 0, n = clamp(night, 0, 1), c = clamp(city, 0, 1);
  return {
    hum: a * (0.2 + 0.8 * c) * (1 - 0.25 * n),
    traffic: a * c * (1 - 0.55 * n),
    wind: a * (0.45 + 0.35 * (1 - c)) * (storm ? 1.5 : 1),
    birds: a * (1 - n) * (1 - 0.8 * wet) * (1 - 0.5 * c),
    insects: a * n * (1 - 0.7 * wet) * (1 - 0.4 * c),
    rain: rain && !storm ? 0.55 + 0.45 * a : 0,
    storm: storm ? 0.6 + 0.4 * a : 0,
  };
}
/** Settings → bus gains. master/effects/ambience/music 0..1; muted silences everything. */
export function levelsFrom(s = {}) {
  const v = (k, d) => clamp(Number.isFinite(+s[k]) && s[k] !== null && s[k] !== '' ? +s[k] : d, 0, 1);
  return { master: s.muted ? 0 : v('volume', 0.8), effects: v('sfxVol', 1), ambience: v('ambVol', 0.7), music: v('musicVol', 0.5), muted: !!s.muted };
}
/** Big sounds carry: even zoomed all the way out they stay at least this loud (an orbital strike must still boom). */
export const CARRY = { 'explosion.large': 0.7, 'quake.rumble': 0.6, 'fragment.crash.large': 0.55, 'meteor.fall': 0.6 };
/** Big sounds that push the music down for a moment: [depth (music level while ducked), seconds]. */
export const DUCK = { 'explosion.large': [0.3, 1.8], 'quake.rumble': [0.55, 1.2], 'explosion.small': [0.8, 0.45] };

// ------------------------------------------------------------------ the live mixer
const BED_GAIN = { hum: 0.5, traffic: 0.32, wind: 0.42, birds: 0.16, insects: 0.05, rain: 2.6, storm: 2.6 };   // rain/storm: the Sound Lab loops are mastered quiet (-40 LUFS)
const LOOPS = { rain: 'ambience.rain.light', storm: 'ambience.storm' };

export class Mix {
  constructor() {
    this.zoom = ZOOM.full; this.night = 0; this.rain = false; this.storm = false; this.city = 0;
    this.active = true; this.levels = levelsFrom({}); this.sfx = null; this.ctx = null; this._locate = null; this._duck = new Set();
    this.beds = bedMix({}); this._t = 0; this._birdT = 2; this._bugT = 0; this._carT = 0; this.ducked = 0;
  }
  get attached() { return !!this.ctx; }

  attach(sfx) {
    if (this.sfx === sfx && this.ctx) return this;
    this.sfx = sfx; const ctx = this.ctx = sfx.context;
    this.musicOut = ctx.createGain(); this.musicOut.gain.value = 0;
    this.bedOut = ctx.createGain(); this.bedOut.gain.value = 0;
    const dest = sfx.master || ctx.destination;
    this.musicOut.connect(dest); this.bedOut.connect(dest);
    this._buildBed();
    this.setLevels(this._pendingLevels || {});
    return this;
  }

  setZoom(z) { this.zoom = clamp(+z || 1, 0.1, 5); }
  setNight(n) { this.night = clamp(+n || 0, 0, 1); }
  setWeather({ rain = false, storm = false } = {}) { this.rain = !!rain; this.storm = !!storm; }
  setCity(c) { this.city = clamp(+c || 0, 0, 1); }
  /** false = no ambient bed (screens without a map under them). */
  setActive(on) { this.active = !!on; }
  locate(fn) { this._locate = fn; }
  onDuck(fn) { this._duck.add(fn); return () => this._duck.delete(fn); }

  setLevels(s) {
    this._pendingLevels = s; this.levels = levelsFrom(s);
    const sfx = this.sfx; if (!sfx) return;
    const L = this.levels;
    sfx.setVolume?.(L.master);
    sfx.setBusVolume?.('sfx', L.effects); sfx.setBusVolume?.('ui', L.effects);
    sfx.setBusVolume?.('ambience', L.ambience * 0.6);
    this._ramp(this.musicOut?.gain, L.music * 1.1, 0.15);
    this._ramp(this.bedOut?.gain, L.ambience * 1.3, 0.15);
  }

  /** The multiplier for one effect. Also fires the music duck for big blasts. */
  effectGain(id, { x, z, global = false, gain = 1 } = {}) {
    const d = DUCK[id];
    if (d && (id !== 'explosion.small' || gain >= 0.7)) for (const f of this._duck) try { f(d[0], d[1]); } catch { /* a listener failing must not stop the sound */ }
    if (global) return 1;
    let k = Math.max(CARRY[id] || 0, zoomGain(this.zoom));
    if (x != null && z != null && this._locate) k *= offscreenGain(this._locate(x, z));
    return k;
  }

  /** Once a frame: glide the bed toward the view's mix (10 times a second is plenty) and schedule the critters. */
  update(dt) {
    this.beds = bedMix(this);
    if (!this.active) for (const k in this.beds) this.beds[k] = 0;   // off the city view (title, world map): music only
    if (!this.ctx) return;
    if ((this._t += dt) >= 0.1) {
      this._t = 0;
      for (const [k, g] of Object.entries(this.bed)) this._ramp(g.gain, this.beds[k] * BED_GAIN[k], 0.6);
      for (const [k, id] of Object.entries(LOOPS)) {
        const want = this.beds[k] > 0.01, h = this._loops[k];
        if (want && !h && !this._loopWanted[k]) { this._loopWanted[k] = true; this.sfx.play(id, { loop: true, gain: 1 }).then(hd => { if (!hd) { setTimeout(() => { this._loopWanted[k] = false; }, 10000); return; } this._loops[k] = hd; try { hd.gain.disconnect(); hd.gain.connect(this.bed[k]); } catch { /* stays on the Sound Lab's ambience bus */ } if (!this.beds[k]) this._stopLoop(k); }).catch(() => setTimeout(() => { this._loopWanted[k] = false; }, 10000)); }
        else if (!want && (h || this._loopWanted[k])) this._stopLoop(k);
      }
    }
    if (this.ctx.state !== 'running') return;
    // alien birds by day, the bugs' pulses by night, cars passing in the city
    if (this.beds.birds > 0.05 && (this._birdT -= dt) <= 0) { this._birdT = 1.5 + Math.random() * 5 / (0.4 + this.beds.birds); this._bird(); }
    if (this.beds.insects > 0.05 && (this._bugT -= dt) <= 0) { this._bugT = 2 + Math.random() * 4; this._bugSwell(); }
    if (this.beds.traffic > 0.05 && (this._carT -= dt) <= 0) { this._carT = 0.4 + Math.random() * 2.2 / (0.3 + this.city); this._car(); }
  }

  state() {
    return { attached: this.attached, running: this.ctx?.state === 'running', zoom: this.zoom, effects: zoomGain(this.zoom), ambience: ambienceLevel(this.zoom),
      active: this.active, beds: { ...this.beds }, levels: { ...this.levels }, loops: Object.keys(this._loops || {}).filter(k => this._loops[k]), night: this.night, rain: this.rain, storm: this.storm, city: this.city,
      bedGains: this.bed ? Object.fromEntries(Object.entries(this.bed).map(([k, g]) => [k, +g.gain.value.toFixed(3)])) : null, ducked: this.ducked };
  }

  // ---------------------------------------------------------------- internals
  _ramp(p, v, tc) { if (!p || !this.ctx) return; const t = this.ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(v, t, tc); }
  _stopLoop(k) { const h = this._loops[k]; this._loops[k] = null; this._loopWanted[k] = false; if (h) { try { this.sfx.stopLoop(h.id, 2); } catch { h.stop?.(); } } }
  _noise(sec = 3) {
    const c = this.ctx, b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  _src(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * buf.duration); return s; }
  _osc(type, f) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
  _lfo(f, depth, param) { const o = this._osc('sine', f), g = this.ctx.createGain(); g.gain.value = depth; o.connect(g).connect(param); return o; }
  _filter(type, f, q = 0.7) { const n = this.ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; return n; }

  _buildBed() {
    const c = this.ctx, out = this.bedOut;
    this.noise = this._noise(4); this._loops = {}; this._loopWanted = {};
    const layer = () => { const g = c.createGain(); g.gain.value = 0; g.connect(out); return g; };
    this.bed = { hum: layer(), traffic: layer(), wind: layer(), birds: layer(), insects: layer(), rain: layer(), storm: layer() };   // rain/storm: the loops are routed in here
    // the city's hum: deep filtered rumble, a faint mains buzz and a slow machinery throb, all far away
    const rumble = this._src(this.noise), lp = this._filter('lowpass', 150), lp2 = this._filter('lowpass', 220);
    rumble.connect(lp).connect(lp2).connect(this.bed.hum);
    const throbG = c.createGain(); throbG.gain.value = 0.06;
    const throb = this._osc('sawtooth', 43), tl = this._filter('lowpass', 110); throb.connect(tl).connect(throbG).connect(this.bed.hum);
    this._lfo(0.37, 0.04, throbG.gain);
    const buzzG = c.createGain(); buzzG.gain.value = 0.012; this._osc('sine', 118).connect(buzzG).connect(this.bed.hum);
    const buzz2 = c.createGain(); buzz2.gain.value = 0.006; this._osc('sine', 236.6).connect(buzz2).connect(this.bed.hum);
    // traffic: a soft wash of tyres-on-road (hover-cars here) plus individual passes (see _car)
    const wash = this._src(this.noise), bp = this._filter('bandpass', 520, 0.6), washG = c.createGain(); washG.gain.value = 0.25;
    wash.connect(bp).connect(washG).connect(this.bed.traffic);
    this._carBus = this.bed.traffic;
    // wind: band-passed noise whose pitch and loudness wander in slow gusts
    const wsrc = this._src(this.noise), wbp = this._filter('bandpass', 380, 0.9), wg = c.createGain(); wg.gain.value = 0.6;
    wsrc.connect(wbp).connect(wg).connect(this.bed.wind);
    this._lfo(0.07, 160, wbp.frequency); this._lfo(0.11, 0.3, wg.gain); this._lfo(0.031, 90, wbp.frequency);
    const whistle = this._src(this.noise), wh = this._filter('bandpass', 1300, 9), whg = c.createGain(); whg.gain.value = 0.25;
    whistle.connect(wh).connect(whg).connect(this.bed.wind); this._lfo(0.05, 300, wh.frequency); this._lfo(0.09, 0.2, whg.gain);
    // alien insects: two high trills (a tone chopped by a fast pulse) that swell in and out — see _bugSwell
    this._bugs = [[4650, 37], [3120, 23], [5890, 51]].map(([f, rate]) => {
      const o = this._osc('sine', f), am = c.createGain(); am.gain.value = 0.5;
      const chop = this._osc('square', rate), cg = c.createGain(); cg.gain.value = 0.5; chop.connect(cg).connect(am.gain);
      const env = c.createGain(); env.gain.value = 0.15; const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      o.connect(am).connect(env); if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; env.connect(pan).connect(this.bed.insects); } else env.connect(this.bed.insects);
      return { env, o, f };
    });
    const peep = this._src(this.noise), pf = this._filter('bandpass', 2400, 18), pg = c.createGain(); pg.gain.value = 0.5;
    peep.connect(pf).connect(pg).connect(this.bed.insects); this._lfo(5.5, 0.5, pg.gain);
  }
  /** One car passing: a filtered whoosh that swells and pans across. */
  _car() {
    const c = this.ctx, t = c.currentTime, dur = 1.2 + Math.random() * 1.6, s = c.createBufferSource(); s.buffer = this.noise;
    const f = this._filter('bandpass', 380 + Math.random() * 300, 1.2), g = c.createGain(), pan = c.createStereoPanner?.();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35 + Math.random() * 0.4, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.frequency.setValueAtTime(f.frequency.value * 1.25, t); f.frequency.linearRampToValueAtTime(f.frequency.value * 0.8, t + dur);
    let n = s.connect(f).connect(g);
    if (pan) { const d = Math.random() < 0.5 ? -1 : 1; pan.pan.setValueAtTime(-0.8 * d, t); pan.pan.linearRampToValueAtTime(0.8 * d, t + dur); n = n.connect(pan); }
    n.connect(this._carBus); s.start(t, Math.random() * 3); s.stop(t + dur + 0.05);
  }
  /** One alien bird call: a few quick gliding notes with a wobble, somewhere left or right. Never the same twice. */
  _bird() {
    const c = this.ctx, t0 = c.currentTime + 0.02, notes = 2 + Math.floor(Math.random() * 4), base = 1500 + Math.random() * 1700;
    const shape = Math.floor(Math.random() * 3), pan = c.createStereoPanner?.(), out = c.createGain(); out.gain.value = 0.5 + Math.random() * 0.5;
    if (pan) { pan.pan.value = Math.random() * 1.8 - 0.9; out.connect(pan).connect(this.bed.birds); } else out.connect(this.bed.birds);
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const d = 0.06 + Math.random() * 0.14, o = c.createOscillator(), g = c.createGain(), mod = c.createOscillator(), mg = c.createGain();
      o.type = 'sine'; mod.type = 'sine'; mod.frequency.value = 18 + Math.random() * 40; mg.gain.value = base * 0.04; mod.connect(mg).connect(o.frequency);
      const f0 = base * (shape === 0 ? 1 + i * 0.12 : shape === 1 ? 1.4 - i * 0.1 : 1 + (i % 2) * 0.33);
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * (shape === 1 ? 0.62 : 1.45), t + d);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(out); o.start(t); mod.start(t); o.stop(t + d + 0.02); mod.stop(t + d + 0.02);
      t += d + 0.03 + Math.random() * 0.08;
    }
  }
  /** The insects' trills swell and fade on their own clocks so the night breathes. */
  _bugSwell() {
    const t = this.ctx.currentTime;
    for (const b of this._bugs) { const v = Math.random() < 0.35 ? 0.02 : 0.1 + Math.random() * 0.25; b.env.gain.setTargetAtTime(v, t, 0.8 + Math.random()); b.o.frequency.setTargetAtTime(b.f * (0.97 + Math.random() * 0.06), t, 1); }
  }
}

/** The one mixer the game and sound.js share. */
export const mix = new Mix();
