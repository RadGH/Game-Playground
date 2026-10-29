// Room sounds of the bunker, all synthesized with Web Audio (no files): knob detents (pitch climbs with each step),
// toggle slaps, push-button clunks, teletype hammers and bell, radio squelch, the klaxon, degauss thunk, the freight
// lift crate, the hatch, and the low hum + fan of the room. Volume and on/off come from Settings.
//
//   const room = createRoom(); room.unlock() (on the first gesture); room.play('detent', { step: 2, count: 6 });
//   room.klaxon(true/false); room.hum(true/false); room.setVolume(0..1); room.setEnabled(bool)

export function createRoom({ volume = 0.7, enabled = true } = {}) {
  let ctx = null, master = null, noiseBuf = null, humNodes = null, klax = null;
  let vol = volume, on = enabled, lastTick = 0, wantHum = false;
  const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;

  function ensure() {
    if (ctx || !AC) return !!ctx;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = on ? vol : 0;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp).connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); let s = 22222;
      for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    } catch { ctx = null; }
    return !!ctx;
  }
  const now = () => ctx.currentTime;
  function env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function noise(t, dur, { type = 'bandpass', freq = 2000, q = 1, peak = 0.3, attack = 0.002, out = master } = {}) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = 1;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); env(g, t, attack, peak, dur);
    src.connect(f).connect(g).connect(out); src.start(t, Math.random() * 0.5, dur + 0.05); src.stop(t + dur + 0.06);
  }
  function tone(t, dur, { freq = 440, to = null, type = 'sine', peak = 0.2, attack = 0.003, out = master } = {}) {
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); env(g, t, attack, peak, dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  const SOUNDS = {
    // a knob detent: a dry click with a body thump; pitch climbs with the step so you can hear where you are
    detent({ step = 0, count = 6, moved = 1 } = {}, t) {
      const k = count > 1 ? step / (count - 1) : 0;
      noise(t, 0.025, { freq: 2600 + k * 1800, q: 4, peak: 0.32 });
      tone(t, 0.05, { freq: 160 + k * 90, to: 90, type: 'triangle', peak: 0.18 });
      if (Math.abs(moved) > 1) noise(t + 0.03, 0.02, { freq: 3000 + k * 1800, q: 4, peak: 0.2 });
    },
    stop(_, t) { noise(t, 0.03, { freq: 900, q: 2, peak: 0.2 }); tone(t, 0.06, { freq: 80, type: 'square', peak: 0.05 }); },
    // a toggle switch slapping up (and the others dropping)
    slap({ dropped = 0 } = {}, t) {
      noise(t, 0.04, { freq: 1800, q: 1.5, peak: 0.45 }); tone(t, 0.09, { freq: 130, to: 60, type: 'triangle', peak: 0.3 });
      if (dropped) noise(t + 0.045, 0.035, { freq: 1300, q: 1.5, peak: 0.25 });
    },
    slapdown(_, t) { noise(t, 0.04, { freq: 1200, q: 1.5, peak: 0.35 }); tone(t, 0.08, { freq: 100, to: 55, type: 'triangle', peak: 0.25 }); },
    locked(_, t) { noise(t, 0.03, { freq: 700, q: 3, peak: 0.3 }); noise(t + 0.06, 0.03, { freq: 760, q: 3, peak: 0.22 }); },
    press(_, t) { noise(t, 0.03, { freq: 1500, q: 2, peak: 0.3 }); tone(t, 0.07, { freq: 220, to: 120, type: 'sine', peak: 0.16 }); },
    key(_, t) { noise(t, 0.012, { freq: 3800, q: 6, peak: 0.12 }); },
    bell(_, t) { tone(t, 0.6, { freq: 1760, type: 'sine', peak: 0.12 }); tone(t, 0.5, { freq: 2637, type: 'sine', peak: 0.05 }); },
    carriage(_, t) { noise(t, 0.12, { freq: 1100, q: 1, peak: 0.12, attack: 0.02 }); noise(t + 0.13, 0.03, { freq: 2400, q: 3, peak: 0.2 }); },
    squelch(_, t) { noise(t, 0.16, { type: 'highpass', freq: 2500, q: 0.7, peak: 0.16, attack: 0.005 }); },
    degauss(_, t) {
      tone(t, 0.12, { freq: 70, to: 40, type: 'square', peak: 0.25 });
      tone(t + 0.02, 0.9, { freq: 120, to: 50, type: 'sawtooth', peak: 0.08, attack: 0.05 });
      noise(t, 0.7, { type: 'lowpass', freq: 400, q: 0.5, peak: 0.12, attack: 0.04 });
    },
    crate(_, t) { tone(t, 0.25, { freq: 70, to: 35, type: 'triangle', peak: 0.5 }); noise(t, 0.2, { type: 'lowpass', freq: 600, peak: 0.4 }); noise(t + 0.25, 0.04, { freq: 2000, q: 2, peak: 0.25 }); },
    lift(_, t) { tone(t, 0.8, { freq: 90, to: 110, type: 'sawtooth', peak: 0.05, attack: 0.1 }); },
    hatch(_, t) {
      for (let i = 0; i < 4; i++) noise(t + i * 0.07, 0.05, { freq: 900 + i * 120, q: 3, peak: 0.25 });
      tone(t + 0.3, 0.6, { freq: 55, to: 38, type: 'triangle', peak: 0.4 }); noise(t + 0.3, 0.7, { type: 'lowpass', freq: 300, peak: 0.25, attack: 0.05 });
    },
    lamp(_, t) { noise(t, 0.015, { freq: 5000, q: 8, peak: 0.08 }); },
  };

  function startHum() {
    if (humNodes || !ctx) return;
    const g = ctx.createGain(); g.gain.value = 0.035; g.connect(master);
    const o1 = ctx.createOscillator(); o1.frequency.value = 50; const o2 = ctx.createOscillator(); o2.frequency.value = 100; o2.type = 'triangle';
    const g2 = ctx.createGain(); g2.gain.value = 0.35; o2.connect(g2).connect(g); o1.connect(g);
    const fan = ctx.createBufferSource(); fan.buffer = noiseBuf; fan.loop = true;
    const ff = ctx.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 380; const fg = ctx.createGain(); fg.gain.value = 0.5;
    fan.connect(ff).connect(fg).connect(g);
    o1.start(); o2.start(); fan.start();
    humNodes = { g, stop: () => { try { o1.stop(); o2.stop(); fan.stop(); } catch { /* stopped */ } g.disconnect(); } };
  }
  function stopHum() { humNodes?.stop(); humNodes = null; }

  return {
    unlock() { if (!ensure()) return; if (ctx.state === 'suspended') ctx.resume().catch(() => {}); if (wantHum) startHum(); },
    play(id, opts) {
      if (!on || !ensure() || ctx.state !== 'running') return;
      // teletype hammers: no more than one click every 28 ms
      if (id === 'key') { const n = performance.now(); if (n - lastTick < 28) return; lastTick = n; }
      try { SOUNDS[id]?.(opts, now() + 0.005); } catch { /* a node limit; never break the UI over a sound */ }
    },
    hum(v) { wantHum = v; if (!ctx) return; if (v && on) startHum(); else stopHum(); },
    klaxon(v) {
      if (!ensure()) return;
      if (v && !klax && on) {
        const g = ctx.createGain(); g.gain.value = 0.09; g.connect(master);
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.6;
        const lg = ctx.createGain(); lg.gain.value = 90; lfo.connect(lg).connect(o.frequency); o.frequency.value = 520;
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.8;
        o.connect(f).connect(g); o.start(); lfo.start();
        klax = () => { try { o.stop(); lfo.stop(); } catch { /* */ } g.disconnect(); };
      } else if (!v && klax) { klax(); klax = null; }
    },
    get klaxonOn() { return !!klax; },
    setVolume(v) { vol = v; if (master) master.gain.value = on ? vol : 0; },
    setEnabled(v) { on = v; if (master) master.gain.value = on ? vol : 0; if (!v) { stopHum(); if (klax) { klax(); klax = null; } } else if (wantHum && ctx) startHum(); },
    get state() { return ctx ? ctx.state : 'none'; },
  };
}
