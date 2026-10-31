// A siren, made in the browser: the shared sound library has no siren and this is two oscillators, so nothing to credit and nothing to load.
// Loudness goes by how far the camera is from the nearest one.
export function createSiren() {
  let ctx = null, gain = null, osc = null, lfo = null;
  function start() {
    if (ctx) return;
    const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext; if (!AC) return;
    ctx = new AC(); gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    osc = ctx.createOscillator(); osc.type = 'triangle'; osc.frequency.value = 680; osc.connect(gain); osc.start();
    lfo = ctx.createOscillator(); lfo.frequency.value = 0.9; const depth = ctx.createGain(); depth.gain.value = 210; lfo.connect(depth); depth.connect(osc.frequency); lfo.start();
  }
  return {
    /** The context died (audio-wake.js): the next siren builds a new one. */
    reset() { ctx = null; gain = null; osc = null; lfo = null; },
    /** dist in metres, null when there is no siren. volume 0..1. */
    set(dist, volume) {
      if (dist == null || !volume) { if (gain) gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2); return; }
      start(); if (!gain) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      gain.gain.setTargetAtTime(Math.max(0, 1 - dist / 260) * 0.08 * volume, ctx.currentTime, 0.15);
    },
  };
}
