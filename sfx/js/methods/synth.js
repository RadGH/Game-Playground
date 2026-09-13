// Method "synth": every sound is made from scratch with Web Audio, driven by the layer recipes in
// data/catalog.json. Nothing is downloaded, the licence is ours, and a seed shifts each play a
// little so twenty fireballs in a row do not sound like the same file twenty times.
//
// A recipe is { dur, jitter, layers: [ ... ] }. Layer types:
//   noise  filtered noise burst      { color, filter:{type,f0,f1,q}, env, dur, delay, gain }
//   tone   oscillator with a sweep   { wave, f0, f1, env, vib:{rate,depth}, dur, delay, gain }
//   fm     2-operator FM             { wave, f0, f1, ratio, index, index1, env, dur, delay, gain }
//   pluck  Karplus-Strong string     { freq, damp, dur, delay, gain }
//   grain  a scatter of tiny grains  { n, freq:[lo,hi], gdur:[lo,hi], wave, noisy, sweep, spread }
//   chord  stacked tones             { freqs, wave, stagger, env, dur, delay, gain }
//   drone  steady bed for loops      { color, filter:{type,f0,f1,q}, lfo, depth, dur, gain }
//
// Everything is rendered offline into a mono buffer once, then cached and normalized by sfx.js.

export const meta = {
  id: 'synth',
  name: 'Synth (ours)',
  license: 'Ours — no third-party rights',
  licenseUrl: '',
  badge: 'ours',
  pros: ['No downloads: nothing to ship but code', 'Every catalog id is covered', 'Seeded variation, so repeats do not sound identical', 'Free to retune per sound'],
  cons: ['Reads as synthetic — it will never sound like a recording', 'Costs a little CPU the first time each sound is built', 'Ambience beds are plausible, not real field recordings'],
};

/** Small seeded random so the same seed always gives the same variation. */
export function rngFrom(seed = 1) {
  let a = (seed >>> 0) || 1;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Every catalog entry has a synth recipe, so this method always answers yes. */
export function has(entry) { return !!(entry && entry.synth && entry.synth.layers && entry.synth.layers.length); }

const clampF = f => Math.max(10, Math.min(20000, f || 10));
const EPS = 0.0001;

function noiseBuffer(ctx, seconds, color, rnd) {
  const n = Math.max(1, Math.ceil(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  if (color === 'brown') {
    let last = 0;
    for (let i = 0; i < n; i++) { const w = rnd() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  } else if (color === 'pink') {
    // Paul Kellet's economy pink filter
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = rnd() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.35;
    }
  } else {
    for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
  }
  return buf;
}

/** attack / decay envelope on a gain node. Returns the node. */
function envGain(ctx, t0, { a = 0.005, d = 0.3, curve = 'exp' } = {}, peak = 1) {
  const g = ctx.createGain();
  const atk = Math.max(0.0005, a);
  g.gain.setValueAtTime(EPS, t0);
  g.gain.linearRampToValueAtTime(Math.max(EPS, peak), t0 + atk);
  if (curve === 'lin') g.gain.linearRampToValueAtTime(EPS, t0 + atk + Math.max(0.01, d));
  else g.gain.exponentialRampToValueAtTime(EPS, t0 + atk + Math.max(0.01, d));
  return g;
}

function sweepParam(param, t0, dur, from, to, log = true) {
  param.setValueAtTime(from, t0);
  if (Math.abs(to - from) < 1e-6) return;
  if (log && from > 0 && to > 0) param.exponentialRampToValueAtTime(to, t0 + Math.max(0.01, dur));
  else param.linearRampToValueAtTime(to, t0 + Math.max(0.01, dur));
}

/** Karplus-Strong plucked string, written straight into a buffer (cheaper than a node graph). */
function pluckBuffer(ctx, freq, dur, damp, rnd) {
  const sr = ctx.sampleRate;
  const n = Math.max(16, Math.ceil(dur * sr));
  const N = Math.max(2, Math.round(sr / clampF(freq)));
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(0);
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = rnd() * 2 - 1;
  const decay = 0.999 - Math.max(0, Math.min(1, damp)) * 0.012;
  let p = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const cur = line[p], nxt = line[(p + 1) % N];
    lp = 0.5 * (cur + nxt);
    const v = lp * decay;
    line[p] = v;
    d[i] = cur * (1 - i / n);
    p = (p + 1) % N;
  }
  return buf;
}

function buildLayer(ctx, layer, out, t0base, rnd, jit) {
  const t0 = t0base + (layer.delay || 0) * jit.time;
  const dur = Math.max(0.01, (layer.dur || 0.3) * jit.time);
  const gain = layer.gain == null ? 0.6 : layer.gain;
  const J = f => clampF(f * jit.freq);

  if (layer.type === 'noise' || layer.type === 'drone') {
    const isDrone = layer.type === 'drone';
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, dur + 0.05, layer.color || 'white', rnd);
    const filt = ctx.createBiquadFilter();
    const fl = layer.filter || {};
    filt.type = fl.type || 'bandpass';
    filt.Q.value = Math.max(0.0001, fl.q || 1);
    if (isDrone) {
      const mid = J((fl.f0 + fl.f1) / 2);
      filt.frequency.value = mid;
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = Math.max(0.01, layer.lfo || 0.2);
      const lg = ctx.createGain();
      lg.gain.value = Math.abs(J(fl.f1) - J(fl.f0)) / 2 * (layer.depth == null ? 0.5 : layer.depth);
      lfo.connect(lg).connect(filt.frequency);
      lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(filt).connect(g).connect(out);
    } else {
      sweepParam(filt.frequency, t0, dur, J(fl.f0), J(fl.f1 == null ? fl.f0 : fl.f1));
      const g = envGain(ctx, t0, layer.env, gain);
      src.connect(filt).connect(g).connect(out);
    }
    src.start(t0); src.stop(t0 + dur + 0.05);
    return;
  }

  if (layer.type === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = layer.wave || 'sine';
    sweepParam(osc.frequency, t0, dur, J(layer.f0), J(layer.f1 == null ? layer.f0 : layer.f1));
    if (layer.vib) {
      const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = layer.vib.rate;
      const lg = ctx.createGain(); lg.gain.value = J(layer.f0) * layer.vib.depth;
      lfo.connect(lg).connect(osc.frequency); lfo.start(t0); lfo.stop(t0 + dur);
    }
    const g = envGain(ctx, t0, layer.env, gain);
    osc.connect(g).connect(out);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
    return;
  }

  if (layer.type === 'fm') {
    const car = ctx.createOscillator(); car.type = layer.wave || 'sine';
    sweepParam(car.frequency, t0, dur, J(layer.f0), J(layer.f1 == null ? layer.f0 : layer.f1));
    const mod = ctx.createOscillator(); mod.type = 'sine';
    mod.frequency.value = J(layer.f0) * (layer.ratio || 2);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(Math.max(EPS, layer.index || 100), t0);
    mg.gain.exponentialRampToValueAtTime(Math.max(EPS, layer.index1 || EPS), t0 + dur);
    mod.connect(mg).connect(car.frequency);
    const g = envGain(ctx, t0, layer.env, gain);
    car.connect(g).connect(out);
    mod.start(t0); mod.stop(t0 + dur + 0.02);
    car.start(t0); car.stop(t0 + dur + 0.02);
    return;
  }

  if (layer.type === 'pluck') {
    const src = ctx.createBufferSource();
    src.buffer = pluckBuffer(ctx, J(layer.freq), dur, layer.damp == null ? 0.5 : layer.damp, rnd);
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g).connect(out);
    src.start(t0);
    return;
  }

  if (layer.type === 'chord') {
    const freqs = layer.freqs || [440];
    freqs.forEach((f0, i) => {
      const osc = ctx.createOscillator(); osc.type = layer.wave || 'sine';
      const st = t0 + i * (layer.stagger || 0) * jit.time;
      osc.frequency.setValueAtTime(J(f0), st);
      const g = envGain(ctx, st, layer.env, gain / Math.sqrt(freqs.length));
      osc.connect(g).connect(out);
      osc.start(st); osc.stop(st + dur + 0.02);
    });
    return;
  }

  if (layer.type === 'grain') {
    const n = Math.max(1, layer.n || 8);
    const [flo, fhi] = layer.freq || [400, 2000];
    const [glo, ghi] = layer.gdur || [0.008, 0.03];
    const spread = layer.spread == null ? 1 : layer.spread;
    for (let i = 0; i < n; i++) {
      const at = t0 + rnd() * dur * spread;
      const gd = glo + rnd() * (ghi - glo);
      const f = J(flo + rnd() * (fhi - flo));
      const g = envGain(ctx, at, { a: Math.min(0.004, gd / 3), d: gd, curve: 'exp' }, gain * (0.5 + rnd() * 0.8));
      g.connect(out);
      if (layer.noisy) {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(ctx, gd + 0.01, 'white', rnd);
        const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.Q.value = 4; filt.frequency.value = f;
        src.connect(filt).connect(g);
        src.start(at); src.stop(at + gd + 0.01);
      } else {
        const osc = ctx.createOscillator(); osc.type = layer.wave || 'sine';
        sweepParam(osc.frequency, at, gd, f, clampF(f * (layer.sweep == null ? 1 : layer.sweep)));
        osc.connect(g);
        osc.start(at); osc.stop(at + gd + 0.01);
      }
    }
  }
}

/**
 * Render one catalog entry to a mono Float32Array.
 * @param {object} entry     a catalog sound
 * @param {object} opts      { sampleRate, seed, OfflineCtx }
 * @returns {Promise<{samples: Float32Array, sampleRate: number}>}
 */
export async function render(entry, { sampleRate = 48000, seed = 1, OfflineCtx = null } = {}) {
  const Off = OfflineCtx || (typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null);
  if (!Off) throw new Error('synth.render needs an OfflineAudioContext');
  const spec = entry.synth;
  const rnd = rngFrom(seed);
  const jitter = spec.jitter || 0;
  const jit = { freq: 1 + (rnd() - 0.5) * 2 * jitter, time: 1 + (rnd() - 0.5) * 2 * jitter };
  const tail = entry.loop ? 0.05 : 0.25;                 // room for reverbless decays to finish
  const total = Math.max(0.05, spec.dur * jit.time + tail);
  const ctx = new Off(1, Math.ceil(total * sampleRate), sampleRate);

  const bus = ctx.createGain();
  bus.gain.value = 0.7;
  bus.connect(ctx.destination);

  for (const layer of spec.layers) buildLayer(ctx, layer, bus, 0, rnd, jit);

  const rendered = await ctx.startRendering();
  return { samples: rendered.getChannelData(0).slice(), sampleRate: rendered.sampleRate };
}
