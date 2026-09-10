// Effects chain applied to synthesized samples. Works on plain Float32Array so any engine that yields PCM can use it.
// fx settings (all optional, defaults = no effect):
//   pitchShift  semitones, -24..24   pitch only, duration kept (WSOLA)
//   formant     semitones, -12..12   vocal-tract size only (body size), pitch kept
//   speed       ratio 0.25..4        playback rate WITHOUT pitch change (time stretch)
//   chipmunk    ratio 0.25..4        raw resample: pitch + formant + duration together (cheapest)
//   bright      -1..1                spectral tilt
//   robot       0..1 (+ robotHz)     ring modulation
//   vibrato     0..1 (+ vibratoHz)   pitch wobble
//   tremolo     0..1 (+ tremoloHz)   volume wobble
//   lofi        0..1                 bitcrush + sample-hold
//   lowpass Hz, highpass Hz          tone shaping (0 = off)
//   chorus 0..1, echo 0..1 (+ echoSec), reverb 0..1 (+ reverbSize 0..1)
//   gain 0..2
import * as D from './dsp.js';

export const FX_DEFAULTS = {
  pitchShift: 0, formant: 0, speed: 1, chipmunk: 1, bright: 0,
  robot: 0, robotHz: 60, vibrato: 0, vibratoHz: 5.5, tremolo: 0, tremoloHz: 6,
  lofi: 0, lowpass: 0, highpass: 0, chorus: 0, echo: 0, echoSec: 0.18, reverb: 0, reverbSize: 0.4, gain: 1,
};

/** Apply the chain. Returns a new Float32Array. Order matters: size/pitch first, then colour, then space. */
export function applyFx(samples, sr, fx = {}) {
  const f = { ...FX_DEFAULTS, ...fx };
  let s = samples;
  if (f.chipmunk !== 1) s = D.resample(s, f.chipmunk);
  if (f.speed !== 1) s = D.timeStretch(s, 1 / f.speed, sr);
  if (f.formant) s = D.formantShift(s, f.formant, sr);
  if (f.pitchShift) s = D.pitchShift(s, f.pitchShift, sr);
  if (f.vibrato > 0) s = D.vibrato(s, f.vibrato * 1.2, f.vibratoHz, sr);
  if (f.bright) s = D.tilt(s, f.bright, sr);
  if (f.highpass > 0) s = new D.Biquad('highpass', f.highpass, sr).process(s);
  if (f.lowpass > 0) s = new D.Biquad('lowpass', f.lowpass, sr).process(s);
  if (f.robot > 0) s = D.ringMod(s, f.robotHz, f.robot, sr);
  if (f.lofi > 0) s = D.bitcrush(s, Math.round(16 - f.lofi * 12), Math.max(1, Math.round(f.lofi * 12)));
  if (f.tremolo > 0) s = D.tremolo(s, f.tremolo, f.tremoloHz, sr);
  if (f.chorus > 0) s = D.chorus(s, f.chorus, sr);
  if (f.echo > 0) s = D.echo(s, f.echoSec, 0.35 + f.echo * 0.4, f.echo, sr);
  if (f.reverb > 0) s = D.reverb(s, f.reverb, f.reverbSize, sr);
  if (f.gain !== 1) s = D.gain(s, f.gain);
  return s;
}

/** Human-readable list of active effects (for the UI + docs). */
export function describeFx(fx = {}) {
  const f = { ...FX_DEFAULTS, ...fx }, parts = [];
  if (f.chipmunk !== 1) parts.push(`chipmunk ×${f.chipmunk.toFixed(2)}`);
  if (f.speed !== 1) parts.push(`speed ×${f.speed.toFixed(2)}`);
  if (f.formant) parts.push(`formant ${f.formant > 0 ? '+' : ''}${f.formant.toFixed(1)}st`);
  if (f.pitchShift) parts.push(`pitch ${f.pitchShift > 0 ? '+' : ''}${f.pitchShift.toFixed(1)}st`);
  if (f.vibrato) parts.push(`vibrato ${f.vibrato.toFixed(2)}`); if (f.bright) parts.push(`bright ${f.bright.toFixed(2)}`);
  if (f.highpass) parts.push(`hp ${f.highpass}Hz`); if (f.lowpass) parts.push(`lp ${f.lowpass}Hz`);
  if (f.robot) parts.push(`robot ${f.robot.toFixed(2)}@${f.robotHz}Hz`); if (f.lofi) parts.push(`lofi ${f.lofi.toFixed(2)}`);
  if (f.tremolo) parts.push(`tremolo ${f.tremolo.toFixed(2)}`); if (f.chorus) parts.push(`chorus ${f.chorus.toFixed(2)}`);
  if (f.echo) parts.push(`echo ${f.echo.toFixed(2)}`); if (f.reverb) parts.push(`reverb ${f.reverb.toFixed(2)}`);
  if (f.gain !== 1) parts.push(`gain ${f.gain.toFixed(2)}`);
  return parts.length ? parts.join(', ') : 'none';
}
