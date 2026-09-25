// Klatt-style cascade/parallel formant synthesizer, pure JS, mono Float32 output.
// Input: an array of frames (every FRAME_MS) with parameters; output: samples at SR.
// frame = { f0, av, ah, af, F1,F2,F3, B1,B2,B3, nasal (0..1), bands: [[f,bw,gain]...], bypass, tilt (0..1), burst (0..1) }
// Sources: voicing = differentiated glottal flow pulse (KLGLOTT88-like polynomial) with jitter/shimmer/flutter;
// aspiration + frication = white noise. Cascade: nasal pole/zero pair, R1..R4 (+R5 fixed). Parallel: frication bands.
export const SR = 22050, FRAME_MS = 5, FRAME_LEN = Math.round(SR * FRAME_MS / 1000);

class Resonator { // y = A x + B y1 + C y2 (Klatt 1980)
  constructor() { this.y1 = 0; this.y2 = 0; this.A = 1; this.B = 0; this.C = 0; }
  set(F, BW) { const r = Math.exp(-Math.PI * BW / SR); this.C = -r * r; this.B = 2 * r * Math.cos(2 * Math.PI * Math.min(F, SR * 0.48) / SR); this.A = 1 - this.B - this.C; }
  step(x) { const y = this.A * x + this.B * this.y1 + this.C * this.y2; this.y2 = this.y1; this.y1 = y; return y; }
}
class AntiResonator { // inverse response, for the nasal zero
  constructor() { this.x1 = 0; this.x2 = 0; this.A = 1; this.B = 0; this.C = 0; }
  set(F, BW) { const r = Math.exp(-Math.PI * BW / SR); const C = -r * r, B = 2 * r * Math.cos(2 * Math.PI * F / SR), A = 1 - B - C; this.A = 1 / A; this.B = -B / A; this.C = -C / A; }
  step(x) { const y = this.A * x + this.B * this.x1 + this.C * this.x2; this.x2 = this.x1; this.x1 = x; return y; }
}

/**
 * Render frames to samples. voice: { jitter 0..1, shimmer 0..1, flutter 0..1, breath 0..1, oq (open quotient 0.4..0.8) }
 */
export function synthesize(frames, voice = {}) {
  const jitter = (voice.jitter ?? 0) * 0.06, shimmer = (voice.shimmer ?? 0) * 0.4, flutter = (voice.flutter ?? 0.1) * 0.05, oq = voice.oq ?? 0.6;
  const n = frames.length * FRAME_LEN; const out = new Float32Array(n);
  const RNP = new Resonator(), RNZ = new AntiResonator(), R1 = new Resonator(), R2 = new Resonator(), R3 = new Resonator(), R4 = new Resonator(), R5 = new Resonator();
  const par = [new Resonator(), new Resonator(), new Resonator()];
  R4.set(3300, 250); R5.set(3850, 200);
  let phase = 1, period = SR / 120, pulseGain = 1, tiltState = 0, aspLp = 0, seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 - 0.5; };
  let prev = frames[0];
  for (let fi = 0; fi < frames.length; fi++) {
    const fr = frames[fi], next = frames[fi + 1] || fr;
    for (let i = 0; i < FRAME_LEN; i++) {
      const t = i / FRAME_LEN; // per-sample interpolation of the continuous parameters
      const f0 = fr.f0 + (next.f0 - fr.f0) * t, F1 = fr.F1 + (next.F1 - fr.F1) * t, F2 = fr.F2 + (next.F2 - fr.F2) * t, F3 = fr.F3 + (next.F3 - fr.F3) * t;
      const av = fr.av + (next.av - fr.av) * t, ah = fr.ah + (next.ah - fr.ah) * t, af = fr.af + (next.af - fr.af) * t, nasal = fr.nasal;
      if ((i & 7) === 0) { // update filter coefficients every 8 samples (cheap and smooth enough)
        R1.set(F1, fr.B1); R2.set(F2, fr.B2); R3.set(F3, fr.B3);
        RNP.set(270, 100); RNZ.set(270 + 220 * nasal, 100 + 60 * nasal); // zero moves away from the pole only when nasal
        for (let k = 0; k < 3; k++) { const b = fr.bands?.[k]; if (b) par[k].set(b[0], b[1]); }
      }
      // ---- voicing source: differentiated glottal flow, one pulse per period
      const sampleIdx = fi * FRAME_LEN + i; const time = sampleIdx / SR;
      const flut = 1 + flutter * (Math.sin(2 * Math.PI * 12.7 * time) + Math.sin(2 * Math.PI * 7.1 * time) + Math.sin(2 * Math.PI * 4.7 * time)) / 3;
      let voice_s = 0;
      if (av > 0.001 && f0 > 20) {
        phase += 1 / period;
        if (phase >= 1) { phase -= 1; period = SR / (f0 * flut * (1 + jitter * rnd() * 2)); pulseGain = 1 + shimmer * rnd() * 2; }
        const open = oq; // fraction of the period the glottis is open
        if (phase < open) { const x = phase / open; voice_s = (2 * x - 3 * x * x) * pulseGain; } // d/dt of x²(1-x) shape → pulse with sharp closure
        else voice_s = 0;
        voice_s *= 4;
      }
      // spectral tilt (breathy/dull voices): one-pole lowpass mixed in
      const tilt = fr.tilt ?? 0.2; tiltState += (voice_s - tiltState) * (1 - tilt * 0.9); const vs = voice_s * (1 - tilt) + tiltState * tilt;
      // ---- aspiration: lowpassed noise into the cascade
      const noise = rnd() * 2; aspLp += (noise - aspLp) * 0.35;
      let cascadeIn = vs * av + aspLp * ah * 0.9;
      // ---- cascade branch
      let y = RNZ.step(RNP.step(cascadeIn)); y = R5.step(R4.step(R3.step(R2.step(R1.step(y)))));
      // ---- parallel frication branch
      let fricOut = 0;
      if (af > 0.001) { let s = 0; for (let k = 0; k < 3; k++) { const b = fr.bands?.[k]; if (b) s += par[k].step(noise) * b[2]; } fricOut = (s + noise * (fr.bypass || 0)) * af * 0.5; }
      out[sampleIdx] = y * 0.35 + fricOut;
    }
    prev = fr;
  }
  // gentle de-click + normalize
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = peak > 0 ? 0.85 / peak : 1; for (let i = 0; i < n; i++) { const v = out[i] * g; out[i] = v > 0.95 ? 0.95 : v < -0.95 ? -0.95 : v; }
  return out;
}
