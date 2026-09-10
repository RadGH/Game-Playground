// Pure-math DSP helpers that work on Float32Array sample data (mono). No Web Audio dependency, so they
// can run in a worker or offline. All functions return a NEW Float32Array unless noted.

/** Two-pole biquad filter (Direct Form I). type: 'lowpass' | 'highpass' | 'bandpass' | 'peaking' */
export class Biquad {
  constructor(type, freq, sr, q = 0.707, gainDb = 0) { this.set(type, freq, sr, q, gainDb); this.x1 = this.x2 = this.y1 = this.y2 = 0; }
  set(type, freq, sr, q = 0.707, gainDb = 0) {
    const w0 = 2 * Math.PI * Math.min(freq, sr * 0.49) / sr, cos = Math.cos(w0), sin = Math.sin(w0), alpha = sin / (2 * q), A = Math.pow(10, gainDb / 40);
    let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lowpass': b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
      case 'highpass': b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
      case 'bandpass': b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cos; a2 = 1 - alpha; break;
      case 'peaking': b0 = 1 + alpha * A; b1 = -2 * cos; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cos; a2 = 1 - alpha / A; break;
      default: throw new Error('unknown biquad type ' + type);
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  step(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y;
  }
  process(input) { const out = new Float32Array(input.length); for (let i = 0; i < input.length; i++) out[i] = this.step(input[i]); return out; }
}

/** Read the signal at a different rate. ratio > 1 = faster/higher (chipmunk), < 1 = slower/lower. Linear interpolation. */
export function resample(input, ratio) {
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio, i0 = Math.floor(pos), frac = pos - i0, a = input[i0] ?? 0, b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/**
 * WSOLA time stretch: changes duration without changing pitch. factor 2 = twice as long.
 * Window ~30 ms, half-overlap, ±6 ms search for the best-matching splice point.
 */
export function timeStretch(input, factor, sr) {
  if (Math.abs(factor - 1) < 1e-3) return Float32Array.from(input);
  const win = Math.max(64, Math.round(sr * 0.03)) & ~1, half = win / 2, search = Math.round(sr * 0.006);
  const hann = new Float32Array(win); for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / win);
  const outLen = Math.ceil(input.length * factor) + win;
  const out = new Float32Array(outLen), norm = new Float32Array(outLen);
  const hopIn = half / factor;
  let prevStart = 0; // where the previous frame was taken from in the input
  for (let outPos = 0, k = 0; outPos + win <= outLen; outPos += half, k++) {
    const nominal = Math.round(k * hopIn);
    if (nominal + win > input.length) break;
    // natural continuation of the previous frame
    const target = prevStart + half;
    let bestOff = 0, bestCorr = -Infinity;
    if (k > 0 && target + half <= input.length) {
      const lo = Math.max(-search, -nominal), hi = Math.min(search, input.length - win - nominal);
      for (let off = lo; off <= hi; off += 2) {
        let c = 0; const s = nominal + off;
        for (let i = 0; i < half; i += 2) c += input[s + i] * input[target + i];
        if (c > bestCorr) { bestCorr = c; bestOff = off; }
      }
    }
    const start = nominal + bestOff; prevStart = start;
    for (let i = 0; i < win; i++) { out[outPos + i] += input[start + i] * hann[i]; norm[outPos + i] += hann[i]; }
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-3) out[i] /= norm[i];
  return out.subarray(0, Math.ceil(input.length * factor));
}

/** Shift pitch by semitones without changing duration (stretch then resample). */
export function pitchShift(input, semitones, sr) {
  if (Math.abs(semitones) < 0.01) return Float32Array.from(input);
  const ratio = Math.pow(2, semitones / 12);
  return resample(timeStretch(input, ratio, sr), ratio);
}

/** Shift formants (vocal-tract size) by semitones while keeping pitch: resample then shift pitch back. */
export function formantShift(input, semitones, sr) {
  if (Math.abs(semitones) < 0.01) return Float32Array.from(input);
  const ratio = Math.pow(2, semitones / 12);
  return pitchShift(resample(input, ratio), -semitones, sr).subarray(0, Math.floor(input.length / ratio));
}

/** Multiply by a sine (robot / dalek sound). amount 0..1 mixes dry/wet. */
export function ringMod(input, freq, amount, sr) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) { const m = Math.sin(2 * Math.PI * freq * i / sr); out[i] = input[i] * (1 - amount + amount * m); }
  return out;
}

/** Bit-depth + sample-rate reduction. bits 2..16, holdSamples >= 1 */
export function bitcrush(input, bits, holdSamples) {
  const out = new Float32Array(input.length), levels = Math.pow(2, bits) / 2; let held = 0;
  for (let i = 0; i < input.length; i++) { if (i % holdSamples === 0) held = Math.round(input[i] * levels) / levels; out[i] = held; }
  return out;
}

/** Vibrato: sinusoidal pitch wobble. depthSemitones e.g. 0.5, rateHz e.g. 5.5 */
export function vibrato(input, depthSemitones, rateHz, sr) {
  const out = new Float32Array(input.length); let pos = 0;
  for (let i = 0; i < input.length; i++) {
    const rate = Math.pow(2, depthSemitones * Math.sin(2 * Math.PI * rateHz * i / sr) / 12);
    const i0 = Math.floor(pos), frac = pos - i0, a = input[i0] ?? 0, b = input[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac; pos += rate; if (pos >= input.length - 1) break;
  }
  return out;
}

/** Tremolo: amplitude wobble. */
export function tremolo(input, depth, rateHz, sr) {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * (1 - depth * 0.5 * (1 + Math.sin(2 * Math.PI * rateHz * i / sr)));
  return out;
}

/** Simple delay/echo with feedback. */
export function echo(input, delaySec, feedback, mix, sr) {
  const d = Math.max(1, Math.round(delaySec * sr)), tail = Math.round(sr * 1.5 * Math.min(0.95, feedback + 0.2));
  const out = new Float32Array(input.length + tail);
  for (let i = 0; i < out.length; i++) { const dry = input[i] ?? 0; const wet = i >= d ? out[i - d] * feedback : 0; out[i] = dry + wet * mix; }
  return out;
}

/** Chorus: mix with a slowly modulated short delay. */
export function chorus(input, amount, sr) {
  if (amount <= 0) return Float32Array.from(input);
  const out = new Float32Array(input.length), base = sr * 0.012, depth = sr * 0.004;
  for (let i = 0; i < input.length; i++) {
    const d = base + depth * Math.sin(2 * Math.PI * 0.8 * i / sr), p = i - d, i0 = Math.floor(p), frac = p - i0;
    const a = input[i0] ?? 0, b = input[i0 + 1] ?? a; out[i] = input[i] * (1 - amount * 0.5) + (a + (b - a) * frac) * amount * 0.6;
  }
  return out;
}

/** Cheap reverb: feedback comb filters + allpass (Schroeder). amount 0..1, size 0..1 */
export function reverb(input, amount, size, sr) {
  if (amount <= 0) return Float32Array.from(input);
  const tail = Math.round(sr * (0.3 + size * 1.2)), len = input.length + tail;
  const combs = [0.0297, 0.0371, 0.0411, 0.0437].map(t => ({ d: Math.round(t * (0.6 + size) * sr), buf: new Float32Array(len), fb: 0.7 + size * 0.2 }));
  const wet = new Float32Array(len);
  for (const c of combs) { for (let i = 0; i < len; i++) { const x = input[i] ?? 0; const y = x + (i >= c.d ? c.buf[i - c.d] * c.fb : 0); c.buf[i] = y; wet[i] += y * 0.25; } }
  // allpass
  const apD = Math.round(0.005 * sr), ap = new Float32Array(len);
  for (let i = 0; i < len; i++) { const x = wet[i]; const delayed = i >= apD ? ap[i - apD] : 0; ap[i] = -0.5 * x + delayed + 0.5 * (i >= apD ? wet[i - apD] : 0); }
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = (input[i] ?? 0) * (1 - amount * 0.5) + ap[i] * amount * 0.5;
  return out;
}

/** Gentle spectral tilt: boosts highs (bright > 0) or lows (bright < 0). bright -1..1 */
export function tilt(input, bright, sr) {
  if (Math.abs(bright) < 0.01) return Float32Array.from(input);
  const f = new Biquad('peaking', 3000, sr, 0.6, bright * 8), g = new Biquad('peaking', 300, sr, 0.6, -bright * 5);
  return g.process(f.process(input));
}

/** Peak-normalize to target (0..1). */
export function normalize(input, target = 0.9) {
  let peak = 0; for (let i = 0; i < input.length; i++) peak = Math.max(peak, Math.abs(input[i]));
  if (peak < 1e-6) return Float32Array.from(input);
  const g = target / peak, out = new Float32Array(input.length); for (let i = 0; i < input.length; i++) out[i] = input[i] * g; return out;
}

export function gain(input, g) { const out = new Float32Array(input.length); for (let i = 0; i < input.length; i++) out[i] = input[i] * g; return out; }

/** Trim leading/trailing silence below threshold, keeping a small pad. */
export function trimSilence(input, sr, threshold = 0.01, padSec = 0.02) {
  let s = 0, e = input.length - 1; while (s < e && Math.abs(input[s]) < threshold) s++; while (e > s && Math.abs(input[e]) < threshold) e--;
  const pad = Math.round(sr * padSec); s = Math.max(0, s - pad); e = Math.min(input.length, e + pad);
  return input.slice(s, e);
}

/** Decode a 16-bit or 8-bit PCM WAV byte array to { samples: Float32Array (mono), sampleRate }. */
export function decodeWav(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= dv.byteLength) {
    const id = String.fromCharCode(dv.getUint8(pos), dv.getUint8(pos + 1), dv.getUint8(pos + 2), dv.getUint8(pos + 3)), size = dv.getUint32(pos + 4, true);
    if (id === 'fmt ') fmt = { channels: dv.getUint16(pos + 10, true), sampleRate: dv.getUint32(pos + 12, true), bits: dv.getUint16(pos + 22, true) };
    else if (id === 'data') { data = { off: pos + 8, size: Math.min(size, dv.byteLength - pos - 8) }; }
    pos += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error('bad wav');
  const bytesPer = fmt.bits / 8, frames = Math.floor(data.size / bytesPer / fmt.channels), out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const p = data.off + i * bytesPer * fmt.channels; // take channel 0
    out[i] = fmt.bits === 8 ? (dv.getUint8(p) - 128) / 128 : fmt.bits === 16 ? dv.getInt16(p, true) / 32768 : fmt.bits === 32 ? dv.getFloat32(p, true) : 0;
  }
  return { samples: out, sampleRate: fmt.sampleRate };
}

/** Encode mono Float32 samples into a 16-bit WAV Blob (for download). */
export function encodeWav(samples, sr) {
  const buf = new ArrayBuffer(44 + samples.length * 2), dv = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}
