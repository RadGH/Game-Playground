// Sounds: one-shots through the playground's Sfx (sfx/js/sfx.js — one loudness for everything), plus live ENGINE
// voices made here, because an engine is a continuous sound whose pitch follows the vehicle.
//
//   const snd = await createSounds({ volume });   snd.unlock() on the first press (browsers need a gesture)
//   snd.play('crash' | 'thud' | 'crack' | 'rustle' | 'shot' | 'splash' | 'horn' | 'flag' | 'capture' | 'ui', { at, gain })
//   snd.engines(list, listener)   every frame: list = [{ id, kind: 'car'|'bike'|..., rpm 0..1, load 0..1, slide 0..1, at, mine }]
//
// The engine: two detuned sawtooths an octave apart through a low-pass whose cut-off opens with the throttle, and a
// little noise for the knock of a big diesel. "rpm" climbs through fake gears (the pitch rises and drops back at each
// change) so a car at speed does not just whine higher and higher. Tyre skids are band-passed noise.
import { Sfx } from '../../../../sfx/js/sfx.js';

const IDS = { crash: 'spell.physical.impact', thud: 'melee.hit', crack: 'wood.chop', rustle: 'ui.hover', shot: 'tower.shot', splash: 'water.splash.big',
  flag: 'loot.rare', capture: 'loot.legendary', ui: 'ui.click', open: 'ui.open', close: 'ui.close' };
const VOICE = { car: { base: 42, span: 110, gears: 5, gain: 0.32, cut: 900 }, bike: { base: 70, span: 190, gears: 5, gain: 0.26, cut: 1600 },
  truck: { base: 30, span: 70, gears: 6, gain: 0.4, cut: 600 }, tank: { base: 26, span: 50, gears: 3, gain: 0.45, cut: 500 } };

export async function createSounds({ volume = 0.8 } = {}) {
  let sfx = null, ctx = null, master = null, unlocked = false, vol = volume;
  const voices = new Map(), sirens = new Map();
  let listener = { x: 0, y: 0, z: 0 };
  const self = {
    async unlock() {
      if (unlocked) return;
      unlocked = true;
      try { sfx = await Sfx.create({ method: 'hybrid', volume: vol }); ctx = sfx.context; } catch (e) { console.warn('[roverlands] sfx', e); }
      try {
        ctx ||= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = vol * 0.8; master.connect(ctx.destination);
        if (ctx.state === 'suspended') ctx.resume();
      } catch { ctx = null; }
    },
    setVolume(v) { vol = v; sfx?.setVolume?.(v); if (master) master.gain.value = v * 0.8; },
    play(name, { at = null, gain = 1 } = {}) {
      if (!sfx) return;
      let g = gain, pan = 0;
      if (at) {
        const dx = at.x - listener.x, dz = at.z - listener.z, d = Math.hypot(dx, (at.y ?? 0) - listener.y, dz);
        g *= Math.max(0, 1 - d / 90);
        if (g < 0.03) return;
        pan = Math.max(-1, Math.min(1, dx / (d + 4) * (listener.rx ?? 1)));
      }
      if (name === 'horn') return horn(g);
      sfx.play(IDS[name] || name, { pan, gain: g })?.catch?.(() => {});
    },
    engines(list, lis) {
      listener = lis || listener;
      if (!ctx || !master) return;
      const keep = new Set();
      // only the four nearest engines are voiced (and mine always)
      const near = list.map(e => ({ e, d: Math.hypot(e.at.x - listener.x, e.at.z - listener.z) })).filter(x => x.e.mine || x.d < 70)
        .sort((a, b) => (b.e.mine - a.e.mine) || a.d - b.d).slice(0, 4);
      for (const { e, d } of near) {
        keep.add(e.id);
        let v = voices.get(e.id);
        if (!v) { v = makeVoice(VOICE[e.voice] || VOICE[e.kind] || VOICE.car); voices.set(e.id, v); }
        const P = v.p;
        // gears: rpm runs 0..1 inside each gear, the pitch is base + span x that
        const g = Math.min(P.gears - 1, Math.floor(e.rpm * P.gears));
        const inGear = e.rpm * P.gears - g;
        const f = P.base * (1 + g * 0.18) + P.span * (0.25 + inGear * 0.75) * (0.6 + e.load * 0.4);
        const t = ctx.currentTime;
        v.o1.frequency.setTargetAtTime(f, t, 0.05); v.o2.frequency.setTargetAtTime(f * 0.5 * 1.01, t, 0.05);
        v.lp.frequency.setTargetAtTime(P.cut * (0.5 + e.load), t, 0.08);
        const dist = Math.max(0, 1 - d / 70);
        v.g.gain.setTargetAtTime(P.gain * (e.mine ? 1 : 0.7) * dist * (0.45 + e.load * 0.55), t, 0.08);
        v.skid.gain.setTargetAtTime(Math.min(0.5, e.slide) * 0.35 * dist, t, 0.05);
      }
      for (const [id, v] of voices) if (!keep.has(id)) { v.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); v.skid.gain.setTargetAtTime(0, ctx.currentTime, 0.1); if (!v.dying) { v.dying = setTimeout(() => { v.stop(); voices.delete(id); }, 600); } }
    },
    /** A two-tone siren loop on vehicle `id`, panned / faded by distance each frame through sirenAt(). */
    siren(id, on) {
      if (!ctx || !master) return;
      const old = sirens.get(id);
      if (!on) { if (old) { old.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1); setTimeout(() => old.stop(), 400); sirens.delete(id); } return; }
      if (old) return;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 0.9;
      const depth = ctx.createGain(); depth.gain.value = 180;
      lfo.connect(depth).connect(o.frequency); o.frequency.value = 760;
      const lp = ctx.createBiquadFilter(); lp.frequency.value = 2200;
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(lp).connect(g).connect(master); o.start(); lfo.start();
      sirens.set(id, { g, stop() { try { o.stop(); lfo.stop(); } catch { /* done */ } } });
    },
    sirenAt(id, at) {
      const v = sirens.get(id); if (!v || !ctx) return;
      const d = Math.hypot(at.x - listener.x, at.z - listener.z);
      v.g.gain.setTargetAtTime(0.12 * Math.max(0, 1 - d / 150), ctx.currentTime, 0.1);
    },
    stopAll() { for (const v of sirens.values()) v.stop(); sirens.clear(); for (const v of voices.values()) v.stop(); voices.clear(); },
  };
  function noiseBuffer() {
    if (noiseBuffer.b) return noiseBuffer.b;
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return (noiseBuffer.b = b);
  }
  function makeVoice(p) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = 'sawtooth'; o2.type = 'square';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    const g = ctx.createGain(); g.gain.value = 0;
    const mix2 = ctx.createGain(); mix2.gain.value = 0.5;
    o1.connect(lp); o2.connect(mix2).connect(lp); lp.connect(g).connect(master);
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(); n.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const skid = ctx.createGain(); skid.gain.value = 0;
    n.connect(bp).connect(skid).connect(master);
    o1.start(); o2.start(); n.start();
    return { p, o1, o2, lp, g, skid, stop() { try { o1.stop(); o2.stop(); n.stop(); } catch { /* done */ } } };
  }
  function horn(g) {
    if (!ctx || !master) return;
    const t = ctx.currentTime, gg = ctx.createGain();
    gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(0.25 * g, t + 0.02); gg.gain.setValueAtTime(0.25 * g, t + 0.45); gg.gain.linearRampToValueAtTime(0, t + 0.55);
    gg.connect(master);
    for (const f of [392, 494]) { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; const lp = ctx.createBiquadFilter(); lp.frequency.value = 1500; o.connect(lp).connect(gg); o.start(t); o.stop(t + 0.6); }
  }
  return self;
}
