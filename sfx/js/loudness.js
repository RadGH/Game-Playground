// Loudness measurement and normalization. Pure maths over Float32Array — no Web Audio, so node
// can test it and the browser can run it on a rendered buffer.
//
// The problem this solves: a sample pack and a synthesizer disagree wildly about how loud a sound
// is. One clip arrives at -6 dB and takes your head off, the next sits at -34 dB and vanishes under
// the music. So every clip is measured once when it loads, and a fixed gain is baked in to bring it
// to the target for its category (interface sounds quiet, impacts loud). A peak ceiling stops the
// gain from pushing anything into clipping, and the mixer still has a limiter behind it.
//
//   import { analyze, normalizeGain, applyGain } from './loudness.js';
//   const m = analyze(samples, 48000);          // { lufs, rms, peak, rmsDb, peakDb, dur }
//   const g = normalizeGain(m, { target: -19, ceiling: -1, trim: 0 });   // linear gain
//
// "lufs" is an estimate, not a certified BS.1770 meter: the K-weighting pre-filters are the real
// ones, but a 200 ms sound effect is far shorter than the 400 ms blocks the standard gates on, so
// short clips fall back to a single ungated block. Good enough to line 118 sounds up by ear.

export const SILENCE_DB = -70;

export const dbToGain = db => Math.pow(10, db / 20);
export const gainToDb = g => 20 * Math.log10(Math.max(1e-12, g));

/**
 * One biquad section, applied in place over a copy of the samples.
 * Coefficients follow the Audio EQ Cookbook so any sample rate works.
 */
function biquad(x, { b0, b1, b2, a1, a2 }) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xn = x[i];
    const yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xn; y2 = y1; y1 = yn;
    y[i] = yn;
  }
  return y;
}

/** BS.1770 stage 1: a +4 dB high shelf at 1681 Hz (the "head" filter). */
function highShelf(sampleRate, f0 = 1681.974, gainDb = 3.999, q = 0.7071752) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = 2 * Math.PI * f0 / sampleRate;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  const tsa = 2 * Math.sqrt(A) * alpha;
  const b0 = A * ((A + 1) + (A - 1) * cw + tsa);
  const b1 = -2 * A * ((A - 1) + (A + 1) * cw);
  const b2 = A * ((A + 1) + (A - 1) * cw - tsa);
  const a0 = (A + 1) - (A - 1) * cw + tsa;
  const a1 = 2 * ((A - 1) - (A + 1) * cw);
  const a2 = (A + 1) - (A - 1) * cw - tsa;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** BS.1770 stage 2: a high-pass at 38 Hz (the "RLB" filter). */
function highPass(sampleRate, f0 = 38.13547, q = 0.5003271) {
  const w0 = 2 * Math.PI * f0 / sampleRate;
  const cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * q);
  const b0 = (1 + cw) / 2, b1 = -(1 + cw), b2 = (1 + cw) / 2;
  const a0 = 1 + alpha, a1 = -2 * cw, a2 = 1 - alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}

/** Run the two K-weighting filters over a signal. Exported so a test can check the shape. */
export function kWeight(samples, sampleRate) {
  return biquad(biquad(samples, highShelf(sampleRate)), highPass(sampleRate));
}

/**
 * Accept either a raw Float32Array (+ sample rate) or an AudioBuffer, so callers can pass whichever
 * they happen to be holding.
 */
function coerce(input, sampleRate) {
  if (input && typeof input.getChannelData === 'function') {
    return { samples: input.getChannelData(0), sampleRate: input.sampleRate || sampleRate || 48000 };
  }
  return { samples: input, sampleRate: sampleRate || 48000 };
}

/**
 * Measure a mono signal.
 * @param {Float32Array|AudioBuffer} input
 * @param {number} [rate]  sample rate, when the first argument is a plain array
 * @returns {{lufs:number, rms:number, rmsDb:number, peak:number, peakDb:number, dur:number, blocks:number, silent:boolean}}
 */
export function analyze(input, rate = 48000) {
  const { samples, sampleRate } = coerce(input, rate);
  const n = samples.length;
  if (!n) return { lufs: -Infinity, rms: 0, rmsDb: -Infinity, peak: 0, peakDb: -Infinity, dur: 0, blocks: 0, silent: true };
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const v = samples[i];
    if (!Number.isFinite(v)) throw new Error('analyze: sample ' + i + ' is not finite');
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / n);
  const dur = n / sampleRate;

  // K-weighted, 400 ms blocks with 75% overlap, gated the way BS.1770 gates — but a short clip
  // gets one block over its whole length instead, or the gate would throw the whole sound away.
  const k = kWeight(samples, sampleRate);
  const blockLen = Math.min(n, Math.max(64, Math.round(0.4 * sampleRate)));
  const hop = Math.max(1, Math.round(blockLen / 4));
  const powers = [];
  for (let start = 0; start + blockLen <= n || powers.length === 0; start += hop) {
    const end = Math.min(n, start + blockLen);
    let s = 0;
    for (let i = start; i < end; i++) s += k[i] * k[i];
    powers.push(s / (end - start));
    if (end >= n) break;
  }
  const loudOf = p => -0.691 + 10 * Math.log10(Math.max(1e-12, p));
  let kept = powers.filter(p => loudOf(p) > SILENCE_DB);           // absolute gate
  if (kept.length > 1) {
    const meanAll = kept.reduce((a, b) => a + b, 0) / kept.length;
    const rel = loudOf(meanAll) - 10;                               // relative gate, -10 LU
    const kept2 = kept.filter(p => loudOf(p) > rel);
    if (kept2.length) kept = kept2;
  }
  const mean = kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : 0;
  const lufs = kept.length ? loudOf(mean) : -Infinity;

  return {
    lufs, rms, rmsDb: gainToDb(rms), peak, peakDb: gainToDb(peak), dur,
    blocks: powers.length, silent: peak < dbToGain(SILENCE_DB),
  };
}

/**
 * The gain that brings a measured clip to `target`, without letting its peak pass `ceiling`.
 * `trim` is a manual per-sound nudge in dB from the catalog.
 * @returns {number} a linear gain, clamped to a sane range so a near-silent clip is not multiplied
 *                   by a thousand (that only amplifies its noise floor).
 */
export function normalizeGain(measured, { target = -19, ceiling = -1, trim = 0, maxBoostDb = 24, maxCutDb = -24 } = {}) {
  if (!measured || measured.silent || !Number.isFinite(measured.lufs)) return 0;
  let db = target - measured.lufs + trim;
  db = Math.max(maxCutDb, Math.min(maxBoostDb, db));
  const headroom = ceiling - measured.peakDb;                      // never push the peak past the ceiling
  if (Number.isFinite(headroom)) db = Math.min(db, headroom);
  return dbToGain(db);
}

/** Multiply a signal by a gain (returns a new array; the original is left alone). */
export function applyGain(samples, gain) {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) out[i] = samples[i] * gain;
  return out;
}

/**
 * Soft ceiling. Peaks below the knee pass through untouched; above it they are bent along a tanh
 * curve that never reaches the ceiling, so the clip cannot go over it and there is no hard corner
 * to buzz. This is what lets a punchy transient still reach its loudness target: without it, one
 * 2 ms spike would drag the whole sound 8 dB quieter just to keep that spike under the ceiling.
 * @param {Float32Array} samples
 * @param {number} ceilingDb   the hard maximum, e.g. -1
 * @param {number} kneeDb      how far below the ceiling the bending starts
 */
export function softLimit(samples, ceilingDb = -1, kneeDb = 6) {
  const C = dbToGain(ceilingDb);
  const T = dbToGain(ceilingDb - kneeDb);
  const span = Math.max(1e-6, C - T);
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const a = v < 0 ? -v : v;
    if (a <= T) { out[i] = v; continue; }
    const bent = T + span * Math.tanh((a - T) / span);
    out[i] = v < 0 ? -bent : bent;
  }
  return out;
}

/**
 * The whole normalization pass for one clip: measure it, work out the gain that puts it on target,
 * apply that gain, bend the peaks under the ceiling, and measure again.
 *
 * `trim` is the catalog's manual nudge for this one sound, so the level it actually aims for is
 * target + trim. `maxLimitDb` caps how hard the soft ceiling is allowed to work — past that we back
 * the gain off instead, because squashing a sound 15 dB stops being limiting and starts being
 * distortion.
 *
 * @returns {{gain:number, gainDb:number, aim:number, limitedDb:number, samples:Float32Array, before:object, after:object}}
 */
export function normalize(input, rate = 48000, options = {}) {
  // Three call shapes all work, because different callers hold different things:
  //   normalize(samples, 48000, { target: -18 })   normalize(audioBuffer, -18)   normalize(audioBuffer)
  const rateIsTarget = typeof rate === 'number' && rate <= 0;              // a target is negative dB
  const { samples, sampleRate } = coerce(input, rateIsTarget ? undefined : rate);
  const opts = rateIsTarget ? { target: rate, ...options }
    : typeof options === 'number' ? { target: options }
      : options;
  const { target = -19, ceiling = -1, trim = 0, maxBoostDb = 24, maxCutDb = -24, maxLimitDb = 12, kneeDb = 6 } = opts;
  const before = analyze(samples, sampleRate);
  const aim = target + trim;
  if (before.silent || !Number.isFinite(before.lufs)) {
    return { gain: 0, gainDb: -Infinity, aim, limitedDb: 0, samples: samples.slice(), before, after: before };
  }
  const cap = db => {
    let v = Math.max(maxCutDb, Math.min(maxBoostDb, db));
    const over = before.peakDb + v - ceiling;          // how far the peak would pass the ceiling
    if (over > maxLimitDb) v -= over - maxLimitDb;     // past that, back the gain off instead
    return v;
  };
  const bake = db => softLimit(applyGain(samples, dbToGain(db)), ceiling, kneeDb);

  let db = cap(aim - before.lufs);
  let out = bake(db);
  let after = analyze(out, sampleRate);
  // Limiting a transient-heavy sound also takes loudness off it, so one pass usually lands a little
  // short. Two or three make-up passes close the gap; each is capped the same way, so a clip that
  // simply cannot get there (all spike, no body) stops instead of being crushed.
  for (let i = 0; i < 3 && Math.abs(after.lufs - aim) > 0.3; i++) {
    const next = cap(db + (aim - after.lufs));
    if (Math.abs(next - db) < 0.05) break;
    db = next;
    out = bake(db);
    after = analyze(out, sampleRate);
  }
  const limitedDb = Math.max(0, before.peakDb + db - ceiling);
  return { gain: dbToGain(db), gainDb: db, aim, limitedDb, samples: out, before, after };
}

/**
 * Make a buffer loop without a click: cross-fade the last `fade` seconds onto the head with an
 * equal-power curve and drop that much off the end, so the end already sounds like the start.
 */
export function loopify(samples, sampleRate, fade = 0.25) {
  const f = Math.min(Math.floor(fade * sampleRate), Math.floor(samples.length / 3));
  if (f < 8) return samples.slice();
  const out = samples.slice(0, samples.length - f);
  for (let i = 0; i < f; i++) {
    const t = i / f;
    const a = Math.cos(t * Math.PI / 2), b = Math.sin(t * Math.PI / 2);   // equal power
    out[i] = samples[i] * b + samples[samples.length - f + i] * a;
  }
  return out;
}
