// Sound effects with pluggable methods and one loudness for everything.
//
//   import { Sfx } from '../../sfx/js/sfx.js';
//   const sfx = await Sfx.create({ method: 'hybrid', volume: 0.8 });
//   sfx.play('spell.fire.impact', { pan: -0.4 });
//   sfx.play('ambience.cave');                       // a loop id starts a loop and replaces the old one
//   sfx.setMethod('synth');                          // swap the whole sound set at runtime
//
// Three things make this more than a wrapper around AudioBufferSourceNode:
//
// 1. A **catalog** (data/catalog.json) of logical ids — "melee.crit", "status.burn.tick",
//    "ambience.marsh". A game asks for meaning, never for a file. Swapping methods swaps every
//    sound at once because the ids do not change.
// 2. **Methods**: synth (ours, procedural), library (Kenney CC0 samples), hybrid (samples where
//    they exist, synth elsewhere), retro (chiptune). Each declares its licence and its trade-offs.
// 3. **Normalization**: every clip is measured when it is first built and a fixed gain is baked in
//    so it lands on its category's target loudness. That is the fix for "some effects were far too
//    quiet and some were way too loud" — a recorded punch and a synthesized fireball now arrive at
//    the same level, and only the per-category targets decide what is loud.
//
// The mixer is: source -> normalizing gain -> play gain -> panner -> category bus -> master ->
// limiter -> speakers. Category buses (sfx / ui / ambience) have their own volume and mute.
import { analyze, normalize, normalizeGain, applyGain, softLimit, loopify, dbToGain, gainToDb } from './loudness.js';
import * as synth from './methods/synth.js';
import * as library from './methods/library.js';
import * as hybrid from './methods/hybrid.js';
import * as retro from './methods/retro.js';

export { analyze, normalize, normalizeGain, softLimit, loopify, dbToGain, gainToDb };

export const METHODS = { synth, library, hybrid, retro };
export const METHOD_ORDER = ['hybrid', 'synth', 'library', 'retro'];

/** Description of every method, for a dropdown with licence badges. */
export function methodList() {
  return METHOD_ORDER.map(id => ({ ...METHODS[id].meta }));
}

const BUSES = ['sfx', 'ui', 'ambience'];

/** Where this catalog file lives, so assets and the catalog resolve no matter who imports us. */
const BASE = new URL('../', import.meta.url).href;

/** How many different takes of one sound we keep. More variants = less repetition, more memory. */
function variantCount(entry, methodId) {
  if ((methodId === 'library' || methodId === 'hybrid') && library.has(entry)) {
    return Math.min(4, entry.library.files.length);
  }
  return entry.loop ? 1 : 3;
}

export class Sfx {
  /**
   * @param {object} opts
   * @param {string} [opts.method]     'hybrid' | 'synth' | 'library' | 'retro'
   * @param {number} [opts.volume]     master volume 0..1
   * @param {object} [opts.catalog]    a pre-loaded catalog (node tests pass one; the browser fetches)
   * @param {string} [opts.base]       url of the sfx/ folder (defaults to this module's folder)
   * @param {AudioContext} [opts.context]
   * @param {boolean} [opts.muted]
   */
  static async create(opts = {}) {
    const catalog = opts.catalog || await loadCatalog(opts.base || BASE);
    return new Sfx({ ...opts, catalog });
  }

  constructor({ catalog, method = 'hybrid', volume = 0.8, base = BASE, context = null, muted = false, seed = 1 } = {}) {
    if (!catalog) throw new Error('Sfx needs a catalog — use await Sfx.create()');
    this.catalog = catalog;
    this.base = base;
    this.byId = new Map(catalog.sounds.map(s => [s.id, s]));
    this.categories = catalog.categories;
    this.ceiling = catalog.peakCeilingDb == null ? -1 : catalog.peakCeilingDb;
    this.methodId = METHODS[method] ? method : 'hybrid';
    this.muted = !!muted;
    this.seed = seed;
    this._cache = new Map();        // `${method}:${id}:${variant}` -> { buffer, gain, levels }
    this._pending = new Map();
    this._loops = new Map();        // id -> { src, gain }
    this._ctx = context || null;
    this._volume = volume;
    this._busVolume = { sfx: 1, ui: 1, ambience: 0.8 };
    this._busMuted = { sfx: false, ui: false, ambience: false };
    this.lastError = null;
    if (this._ctx) this._buildGraph();
  }

  // ---- context and mixer ------------------------------------------------------------------

  /** The live AudioContext, created on the first sound (browsers want a user gesture first). */
  get context() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this._ctx = new AC();
      this._buildGraph();
    }
    if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    return this._ctx;
  }

  _buildGraph() {
    const c = this._ctx;
    // A limiter on the master bus: a compressor with a high ratio and a fast attack. Nothing here
    // should ever hit it — the normalizer keeps peaks under -1 dBFS — but ten spells landing in the
    // same frame add up, and this is what stops that from crackling.
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.08;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : this._volume;
    this.master.connect(this.limiter).connect(c.destination);
    this.bus = {};
    for (const b of BUSES) {
      const g = c.createGain();
      g.gain.value = this._busMuted[b] ? 0 : this._busVolume[b];
      g.connect(this.master);
      this.bus[b] = g;
    }
  }

  /** Master volume 0..1. */
  setVolume(v) { this._volume = Math.max(0, Math.min(1, v)); if (this.master) this.master.gain.value = this.muted ? 0 : this._volume; return this; }
  get volume() { return this._volume; }
  /** Volume of one bus: 'sfx', 'ui' or 'ambience'. */
  setBusVolume(bus, v) {
    if (!BUSES.includes(bus)) return this;
    this._busVolume[bus] = Math.max(0, Math.min(1, v));
    if (this.bus) this.bus[bus].gain.value = this._busMuted[bus] ? 0 : this._busVolume[bus];
    return this;
  }
  busVolume(bus) { return this._busVolume[bus]; }
  setBusMuted(bus, on) {
    if (!BUSES.includes(bus)) return this;
    this._busMuted[bus] = !!on;
    if (this.bus) this.bus[bus].gain.value = on ? 0 : this._busVolume[bus];
    if (on && bus === 'ambience') this.stopLoops();
    return this;
  }
  busMuted(bus) { return this._busMuted[bus]; }
  /** Mute everything (the game's "mute sfx" checkbox). */
  setMuted(on) {
    this.muted = !!on;
    if (this.master) this.master.gain.value = on ? 0 : this._volume;
    if (on) this.stopLoops();
    return this;
  }

  // ---- catalog ----------------------------------------------------------------------------

  /** Every method, with licence and pros/cons — feed this straight into a dropdown. */
  methods() { return methodList(); }
  /** The method in use. */
  method() { return this.methodId; }
  /** Swap methods. Cached buffers for the old method are kept, so switching back is instant. */
  setMethod(id) {
    if (!METHODS[id]) throw new Error('unknown sfx method: ' + id);
    if (id === this.methodId) return this;
    const playing = [...this._loops.keys()];
    this.stopLoops();
    this.methodId = id;
    for (const loopId of playing) this.play(loopId);
    return this;
  }

  /** Catalog entry for an id, or null. */
  entry(id) { return this.byId.get(id) || null; }
  /** Every id, in catalog order. */
  ids() { return this.catalog.sounds.map(s => s.id); }
  /** Ids grouped by category, in catalog order. */
  byCategory() {
    const out = new Map();
    for (const s of this.catalog.sounds) {
      if (!out.has(s.category)) out.set(s.category, []);
      out.get(s.category).push(s);
    }
    return out;
  }
  /** Does the current method have real content for this id, or is it falling back? */
  sourceOf(id, methodId = this.methodId) {
    const e = this.entry(id); if (!e) return null;
    if (methodId === 'hybrid') return hybrid.sourceFor(e);
    return METHODS[methodId].has(e) ? methodId : null;
  }
  /** The loudness target this id is normalized to, in dBFS-ish LUFS. */
  targetFor(id) {
    const e = this.entry(id); if (!e) return null;
    return (this.categories[e.category] || {}).target ?? -19;
  }
  busFor(id) {
    const e = this.entry(id); if (!e) return 'sfx';
    return (this.categories[e.category] || {}).bus || 'sfx';
  }

  // ---- building and normalizing -------------------------------------------------------------

  _key(id, variant, methodId = this.methodId) { return methodId + ':' + id + ':' + variant; }

  /**
   * Build (or fetch from cache) one take of a sound: the AudioBuffer plus the gain that brings it
   * to its category target, and the measured levels before and after.
   * @returns {Promise<{buffer: AudioBuffer, gain: number, levels: object, via: string}>}
   */
  async load(id, variant = 0) {
    const e = this.entry(id);
    if (!e) throw new Error('unknown sound id: ' + id);
    const key = this._key(id, variant);
    if (this._cache.has(key)) return this._cache.get(key);
    if (this._pending.has(key)) return this._pending.get(key);

    const p = (async () => {
      const ctx = this.context;
      const sr = ctx.sampleRate;
      const m = METHODS[this.methodId];
      const out = await m.render(e, {
        sampleRate: sr,
        seed: (this.seed * 7919 + variant * 104729 + hashId(id)) >>> 0,
        base: this.base,
        decode: bytes => ctx.decodeAudioData(bytes),
        OfflineCtx: window.OfflineAudioContext || window.webkitOfflineAudioContext,
      });
      let samples = out.samples;
      if (e.loop) samples = loopify(samples, out.sampleRate, Math.min(0.25, samples.length / out.sampleRate / 4));
      const target = this.targetFor(id);
      // Normalization is baked into the buffer, not applied at play time: measure once, write the
      // levelled samples, and every later play is a plain buffer source at gain 1.
      const res = normalize(samples, out.sampleRate, { target, ceiling: this.ceiling, trim: e.trim || 0 });
      const buffer = ctx.createBuffer(1, res.samples.length, out.sampleRate);
      buffer.copyToChannel(res.samples, 0);
      const rec = {
        buffer, gain: 1, gainDb: res.gainDb, limitedDb: res.limitedDb, aim: res.aim,
        levels: { before: res.before, after: res.after },
        via: out.via || (this.methodId === 'hybrid' ? hybrid.sourceFor(e) : this.methodId),
        file: out.file || null, target, id, variant, method: this.methodId,
      };
      this._cache.set(key, rec);
      this._pending.delete(key);
      return rec;
    })().catch(err => {
      this._pending.delete(key);
      this.lastError = err;
      throw err;
    });
    this._pending.set(key, p);
    return p;
  }

  /** Build a list of ids ahead of time (one take each) so the first play does not stutter. */
  async preload(ids = null, { variants = 1 } = {}) {
    const list = ids && ids.length ? ids : this.ids();
    const done = [];
    for (const id of list) {
      const e = this.entry(id);
      if (!e) continue;
      const n = Math.min(variants, variantCount(e, this.methodId));
      for (let v = 0; v < n; v++) {
        try { done.push(await this.load(id, v)); }
        catch (err) { console.warn('[sfx] could not build', id, err.message); }
      }
    }
    return done;
  }

  /** The measured before/after levels for a take, if it has been built. */
  levels(id, variant = 0) {
    const rec = this._cache.get(this._key(id, variant));
    return rec ? rec.levels : null;
  }

  /** Everything built so far, as rows for a loudness table / export. */
  normalizationTable() {
    return [...this._cache.values()].map(r => ({
      id: r.id, method: r.method, via: r.via, variant: r.variant, file: r.file,
      target: r.target, aim: r.aim, trim: this.entry(r.id)?.trim || 0, limitedDb: round1(r.limitedDb),
      beforeLufs: round1(r.levels.before.lufs), beforePeakDb: round1(r.levels.before.peakDb),
      gainDb: round1(r.gainDb),
      afterLufs: round1(r.levels.after.lufs), afterPeakDb: round1(r.levels.after.peakDb),
      durationMs: Math.round(r.levels.before.dur * 1000),
    })).sort((a, b) => a.id.localeCompare(b.id));
  }

  // ---- playing -------------------------------------------------------------------------------

  /**
   * Play a sound.
   * @param {string} id
   * @param {object} opts
   * @param {number} [opts.pan]    -1 left .. 1 right (a character's x position on the stage)
   * @param {number} [opts.pitch]  playback rate multiplier; 1 = as built
   * @param {number} [opts.gain]   extra gain on top of normalization (1 = the normalized level)
   * @param {number} [opts.at]     seconds from now
   * @param {number} [opts.variant] pick a specific take instead of a random one
   * @param {boolean} [opts.loop]  force looping (loop ids do this on their own)
   * @returns {Promise<{source, gain, done, levels}|null>} null when the sound is muted or unknown
   */
  async play(id, opts = {}) {
    const e = this.entry(id);
    if (!e) { console.warn('[sfx] unknown id', id); return null; }
    const bus = this.busFor(id);
    if (this.muted || this._busMuted[bus]) return null;
    const loop = opts.loop == null ? !!e.loop : !!opts.loop;
    if (loop && this._loops.has(id)) return this._loops.get(id).handle;

    const nVar = variantCount(e, this.methodId);
    const variant = opts.variant != null ? (opts.variant % nVar) : Math.floor(Math.random() * nVar);
    let rec;
    try { rec = await this.load(id, variant); }
    catch (err) { console.warn('[sfx]', id, 'failed:', err.message); return null; }
    if (this.muted || this._busMuted[bus]) return null;

    const ctx = this.context;
    const src = ctx.createBufferSource();
    src.buffer = rec.buffer;
    src.loop = loop;
    const jitter = e.loop ? 1 : (opts.pitch == null ? randRange(0.97, 1.03) : opts.pitch);
    src.playbackRate.value = Math.max(0.25, Math.min(4, jitter));

    const g = ctx.createGain();
    g.gain.value = rec.gain * (opts.gain == null ? 1 : opts.gain);
    let node = src.connect(g);
    if (opts.pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      node = g.connect(p);
    } else node = g;
    node.connect(this.bus[bus]);

    const when = ctx.currentTime + Math.max(0, opts.at || 0);
    if (loop) {
      // fade a loop in so starting one mid-scene is not a click
      g.gain.setValueAtTime(0.0001, when);
      g.gain.linearRampToValueAtTime(rec.gain * (opts.gain == null ? 1 : opts.gain), when + 0.4);
    }
    src.start(when);
    const done = loop ? new Promise(() => {}) : new Promise(r => { src.onended = r; });
    const handle = { id, source: src, gain: g, done, levels: rec.levels, via: rec.via, file: rec.file, stop: () => this._stopNode(src, g) };
    if (loop) this._loops.set(id, { src, gain: g, handle });
    return handle;
  }

  /** Fire and forget: the same as play() but never returns a promise a caller has to handle. */
  cue(id, opts = {}) { this.play(id, opts).catch(() => {}); return this; }

  _stopNode(src, g, fade = 0.25) {
    const ctx = this._ctx; if (!ctx) return;
    try {
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      src.stop(t + fade + 0.02);
    } catch { try { src.stop(); } catch { /* already stopped */ } }
  }

  /** Stop one looping sound (ambience, campfire, a spell's travel loop). */
  stopLoop(id, fade = 0.4) {
    const l = this._loops.get(id);
    if (!l) return this;
    this._loops.delete(id);
    this._stopNode(l.src, l.gain, fade);
    return this;
  }
  /** Stop every loop. */
  stopLoops(fade = 0.3) { for (const id of [...this._loops.keys()]) this.stopLoop(id, fade); return this; }
  /** Ids currently looping. */
  loopingIds() { return [...this._loops.keys()]; }

  /**
   * Switch the ambience bed: start `id` and fade out any other ambience.* loop.
   * Passing null or an unknown id just stops the current bed.
   */
  ambience(id) {
    for (const cur of this.loopingIds()) {
      if (cur.startsWith('ambience.') && cur !== id) this.stopLoop(cur, 0.8);
    }
    if (id && this.entry(id)) this.play(id).catch(() => {});
    return this;
  }

  /** Stop everything that is playing right now. */
  stopAll() {
    this.stopLoops(0.1);
    return this;
  }
}

function round1(v) { return Number.isFinite(v) ? Math.round(v * 10) / 10 : null; }
function randRange(a, b) { return a + Math.random() * (b - a); }
function hashId(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** Fetch data/catalog.json relative to a base url. */
export async function loadCatalog(base = BASE) {
  const res = await fetch(new URL('data/catalog.json', base).href);
  if (!res.ok) throw new Error('sfx catalog failed to load (' + res.status + ')');
  return res.json();
}

export default Sfx;
