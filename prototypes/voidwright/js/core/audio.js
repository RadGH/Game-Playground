// Sound. Weapons get their own synthesized voices (dozens, no files, each varied a little every shot);
// explosions, loot and interface sounds come from the shared sfx/ library of real recordings.
// Positional: volume falls off with distance from the camera, pan follows screen x.

let ctx = null, master = null, comp = null, sfxLib = null, muted = false, vol = 0.7, loops = new Map();
const last = new Map();

export async function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC();
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 6; comp.connect(ctx.destination);
  master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(comp);
  try {
    const { Sfx } = await import('../../../../sfx/js/sfx.js');
    sfxLib = await Sfx.create({ method: 'hybrid', volume: 0.6 });
  } catch (e) { console.info('[voidwright] shared sfx unavailable', e?.message); }
}
export function resumeAudio() { if (ctx?.state === 'suspended') ctx.resume(); }
export function setVolume(v) { vol = v; if (master) master.gain.value = muted ? 0 : v; sfxLib?.setVolume?.(v * 0.85); }
export function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : vol; sfxLib?.setMuted?.(m); }

function noiseBuf() {
  if (noiseBuf.b) return noiseBuf.b;
  const b = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate); const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseBuf.b = b);
}
const v = (x) => x * (0.92 + Math.random() * 0.16);

function out(gain, pan) {
  const g = ctx.createGain(); g.gain.value = gain;
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(master); } else g.connect(master);
  return g;
}
function env(g, t, a, d, peak = 1) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function osc(type, f0, f1, dur, dst, t, a = 0.003, peak = 1) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain(); env(g, t, a, dur, peak); o.connect(g); g.connect(dst); o.start(t); o.stop(t + a + dur + 0.05);
}
function noise(dst, t, dur, type = 'bandpass', f = 1000, q = 1, peak = 1, f1 = null, a = 0.003) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf(); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain(); env(g, t, a, dur, peak); s.connect(fl); fl.connect(g); g.connect(dst); s.start(t, Math.random()); s.stop(t + a + dur + 0.05);
}

/** An oscillator through a resonant lowpass that sweeps with the pitch — the "zap" in a laser. */
function zap(type, f0, f1, dur, dst, t, peak = 1, cut0 = 6000, cut1 = 600, q = 6, detune = 0) {
  const o = ctx.createOscillator(); o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = q;
  f.frequency.setValueAtTime(cut0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, cut1), t + dur);
  const g = ctx.createGain(); env(g, t, 0.002, dur, peak);
  o.connect(f); f.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.06);
}

/** Every weapon's voice. */
const VOICES = {
  // Lasers: a bright transient, two detuned saws diving through a resonant sweep (the "pew"),
  // a sine body for punch and a faint shimmer tail. The old two thin beeps sounded like a toy.
  laser_pulse: (d, t) => {
    const f = v(1500);
    noise(d, t, 0.025, 'highpass', 3000, 0.8, 0.5, null, 0.001);
    zap('sawtooth', f, 170, 0.15, d, t, 0.5, 7000, 700, 7, -12);
    zap('sawtooth', f * 1.01, 175, 0.15, d, t, 0.35, 7000, 700, 7, 12);
    osc('sine', v(260), 55, 0.13, d, t, 0.002, 0.9);
    osc('sine', v(3200), 1400, 0.2, d, t + 0.01, 0.004, 0.06);
  },
  laser_heavy: (d, t) => {
    const f = v(900);
    noise(d, t, 0.05, 'highpass', 2200, 0.7, 0.7, null, 0.001);
    zap('sawtooth', f, 90, 0.3, d, t, 0.6, 5000, 300, 9, -15);
    zap('sawtooth', f * 1.012, 92, 0.3, d, t, 0.45, 5000, 300, 9, 15);
    zap('square', f * 0.5, 60, 0.26, d, t, 0.3, 2400, 200, 4);
    osc('sine', v(150), 32, 0.32, d, t, 0.002, 1.2);
    noise(d, t + 0.02, 0.25, 'bandpass', 1800, 1.2, 0.25, 400);
    osc('sine', v(2400), 900, 0.3, d, t + 0.02, 0.006, 0.07);
  },
  gatling: (d, t) => { noise(d, t, 0.035, 'bandpass', v(2200), 1.2, 0.8); osc('square', v(140), 60, 0.04, d, t, 0.001, 0.3); },
  cannon_light: (d, t) => { noise(d, t, 0.18, 'lowpass', 2400, 0.8, 0.9, 300); osc('sine', v(120), 40, 0.2, d, t, 0.002, 0.8); },
  cannon_heavy: (d, t) => { noise(d, t, 0.45, 'lowpass', 1800, 0.7, 1, 120); osc('sine', v(80), 28, 0.5, d, t, 0.003, 1); osc('triangle', v(200), 60, 0.2, d, t, 0.002, 0.3); },
  siege: (d, t) => { noise(d, t, 0.9, 'lowpass', 1400, 0.7, 1, 60); osc('sine', v(60), 20, 1.0, d, t, 0.004, 1.2); noise(d, t + 0.05, 0.6, 'bandpass', 400, 0.5, 0.4, 100); },
  mass_driver: (d, t) => { osc('sine', v(70), 30, 0.35, d, t, 0.002, 1); noise(d, t, 0.25, 'bandpass', 900, 2, 0.6, 3000); osc('triangle', v(1600), 700, 0.4, d, t + 0.01, 0.002, 0.15); },
  scatter: (d, t) => { noise(d, t, 0.22, 'bandpass', v(1300), 0.6, 0.9, 400); osc('sawtooth', v(500), 120, 0.15, d, t, 0.002, 0.3); },
  rocket: (d, t) => { noise(d, t, 0.35, 'bandpass', v(700), 0.8, 0.7, 2400, 0.02); osc('sawtooth', v(90), 140, 0.3, d, t, 0.02, 0.2); },
  missile: (d, t) => { noise(d, t, 0.5, 'bandpass', v(500), 1, 0.6, 2600, 0.04); osc('triangle', v(300), 900, 0.4, d, t, 0.03, 0.15); },
  // missile kinds (#57): a whip-crack hiss for ram darts, a deep thump + long roar for blastcaps, a rising
  // electric whine for ion seekers, a crackling woosh for firebrands
  ram_missile: (d, t) => { noise(d, t, 0.18, 'highpass', v(2600), 0.9, 0.7, 6000, 0.002); zap('sawtooth', v(1800), 420, 0.16, d, t, 0.35, 8000, 1200, 5); osc('sine', v(160), 60, 0.1, d, t, 0.002, 0.6); },
  he_missile: (d, t) => { osc('sine', v(70), 38, 0.35, d, t, 0.004, 1); noise(d, t + 0.03, 0.9, 'lowpass', v(500), 1, 0.8, 1400, 0.08); osc('sawtooth', v(70), 110, 0.6, d, t + 0.05, 0.05, 0.18); },
  emp_missile: (d, t) => { noise(d, t, 0.4, 'bandpass', v(700), 1, 0.45, 2200, 0.03); osc('square', v(220), 1700, 0.4, d, t, 0.02, 0.14); for (let i = 0; i < 3; i++) noise(d, t + 0.08 + i * 0.07, 0.03, 'highpass', 4500, 1, 0.35); },
  fire_missile: (d, t) => { noise(d, t, 0.55, 'bandpass', v(400), 0.7, 0.75, 1800, 0.05); for (let i = 0; i < 5; i++) noise(d, t + 0.05 + Math.random() * 0.4, 0.025, 'bandpass', v(2600), 2, 0.3); osc('triangle', v(140), 220, 0.4, d, t, 0.03, 0.12); },
  decoy: (d, t) => { for (let i = 0; i < 3; i++) { noise(d, t + i * 0.06, 0.12, 'highpass', 3000, 1, 0.45, 1500); osc('sine', 1800 - i * 200, 900, 0.1, d, t + i * 0.06, 0.002, 0.12); } },
  torpedo: (d, t) => { noise(d, t, 1.1, 'lowpass', 400, 1, 0.9, 1500, 0.1); osc('sine', v(50), 90, 1.0, d, t, 0.1, 0.6); },
  beam: (d, t) => { osc('sawtooth', v(220), 210, 0.25, d, t, 0.02, 0.25); osc('sine', v(880), 860, 0.25, d, t, 0.02, 0.15); },
  beam_heavy: (d, t) => { osc('sawtooth', v(110), 100, 0.3, d, t, 0.02, 0.35); noise(d, t, 0.3, 'bandpass', 1400, 3, 0.2); },
  mining: (d, t) => { osc('triangle', v(420), 400, 0.2, d, t, 0.02, 0.18); noise(d, t, 0.2, 'bandpass', 2400, 4, 0.15); },
  tractor: (d, t) => { osc('sine', v(160), 180, 0.3, d, t, 0.05, 0.2); },
  arc: (d, t) => { for (let i = 0; i < 4; i++) noise(d, t + i * 0.02 + Math.random() * 0.02, 0.03, 'highpass', v(3000), 1, 0.7); osc('square', v(60), 50, 0.12, d, t, 0.002, 0.2); },
  tesla: (d, t) => { for (let i = 0; i < 6; i++) noise(d, t + i * 0.025, 0.04, 'bandpass', v(4000), 2, 0.6); osc('sawtooth', v(55), 55, 0.18, d, t, 0.005, 0.3); },
  flak: (d, t) => { noise(d, t, 0.08, 'bandpass', v(1600), 1, 0.7); osc('sine', v(300), 90, 0.06, d, t, 0.001, 0.3); },
  pd: (d, t) => { osc('square', v(3200), 2400, 0.04, d, t, 0.001, 0.15); },
  plasma: (d, t) => { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(v(260), t); o.frequency.exponentialRampToValueAtTime(70, t + 0.35); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(300, t + 0.35); f.Q.value = 8; const g = ctx.createGain(); env(g, t, 0.005, 0.35, 0.5); o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + 0.42); },
  rail: (d, t) => { osc('sawtooth', 200, v(4000), 0.18, d, t, 0.15, 0.25); noise(d, t + 0.17, 0.3, 'highpass', 1500, 0.5, 1, 400); osc('sine', v(90), 30, 0.4, d, t + 0.17, 0.002, 0.9); },
  lance: (d, t) => { osc('sawtooth', 100, v(1800), 0.5, d, t, 0.45, 0.25); noise(d, t + 0.48, 0.8, 'lowpass', 3000, 0.6, 1, 100); osc('sine', v(55), 22, 0.9, d, t + 0.48, 0.003, 1.2); },
  mine: (d, t) => { osc('sine', v(900), 900, 0.06, d, t, 0.002, 0.2); osc('sine', v(600), 600, 0.06, d, t + 0.08, 0.002, 0.2); },
  ion: (d, t) => { osc('sine', v(1200), 150, 0.3, d, t, 0.003, 0.4); osc('square', v(80), 40, 0.25, d, t, 0.003, 0.15); },
  harpoon: (d, t) => { noise(d, t, 0.12, 'bandpass', 900, 2, 0.8); osc('triangle', v(180), 80, 0.15, d, t, 0.002, 0.5); for (let i = 0; i < 6; i++) noise(d, t + 0.05 + i * 0.03, 0.02, 'highpass', 5000, 1, 0.25); },
  acid: (d, t) => { noise(d, t, 0.18, 'lowpass', v(900), 4, 0.6, 200); osc('sine', v(400), 120, 0.15, d, t, 0.005, 0.3); },
  spore: (d, t) => { osc('sine', v(200), 500, 0.2, d, t, 0.02, 0.4); osc('sine', v(520), 220, 0.18, d, t + 0.05, 0.02, 0.2); },
  prism: (d, t) => { for (const f of [1320, 1760, 2640]) osc('sine', v(f), f * 0.98, 0.35, d, t, 0.002, 0.15); },
  drone_bolt: (d, t) => { osc('square', v(2400), 900, 0.06, d, t, 0.001, 0.12); },
  drone_bullet: (d, t) => { noise(d, t, 0.02, 'bandpass', 3000, 1, 0.3); },
  drone_rocket: (d, t) => { noise(d, t, 0.2, 'bandpass', 900, 1, 0.3, 2000); },
  drone_missile: (d, t) => { noise(d, t, 0.25, 'bandpass', 600, 1, 0.3, 2400); },
  drone_plasma: (d, t) => { osc('sawtooth', v(400), 120, 0.15, d, t, 0.003, 0.2); },
  drone_pulse: (d, t) => { osc('square', v(3000), 2000, 0.03, d, t, 0.001, 0.1); },
  // impacts and other world sounds
  hit_kinetic: (d, t) => { noise(d, t, 0.05, 'bandpass', v(3200), 2, 0.5); osc('triangle', v(900), 500, 0.05, d, t, 0.001, 0.15); },
  hit_laser: (d, t) => { noise(d, t, 0.07, 'highpass', 3500, 1, 0.45); noise(d, t, 0.12, 'bandpass', v(1400), 2, 0.3, 500); osc('sine', v(500), 140, 0.08, d, t, 0.001, 0.3); },
  hit_plasma: (d, t) => { noise(d, t, 0.15, 'lowpass', 1200, 3, 0.4, 300); },
  hit_lightning: (d, t) => { noise(d, t, 0.04, 'highpass', 5000, 1, 0.4); },
  hit_explosive: (d, t) => { noise(d, t, 0.1, 'lowpass', 1500, 1, 0.5); },
  shield: (d, t) => { osc('sine', v(520), 260, 0.18, d, t, 0.002, 0.35); osc('sine', v(1040), 700, 0.12, d, t, 0.002, 0.15); noise(d, t, 0.1, 'bandpass', 2000, 6, 0.15); },
  shielddown: (d, t) => { osc('sawtooth', 800, 60, 0.6, d, t, 0.003, 0.5); noise(d, t, 0.5, 'highpass', 2000, 1, 0.4, 400); },
  blockdie: (d, t) => { noise(d, t, 0.25, 'lowpass', v(1600), 1, 0.6, 200); osc('sine', v(110), 40, 0.2, d, t, 0.002, 0.4); for (let i = 0; i < 3; i++) noise(d, t + 0.04 + i * 0.05, 0.03, 'bandpass', v(3500), 3, 0.2); },
  boom: (d, t) => { noise(d, t, 0.6, 'lowpass', v(1800), 0.8, 1, 90); osc('sine', v(70), 25, 0.6, d, t, 0.003, 0.9); },
  death: (d, t) => { noise(d, t, 1.6, 'lowpass', 2400, 0.6, 1.2, 50); osc('sine', v(55), 18, 1.6, d, t, 0.004, 1.4); noise(d, t + 0.15, 0.8, 'bandpass', 600, 0.8, 0.6, 150); for (let i = 0; i < 5; i++) noise(d, t + 0.2 + Math.random() * 0.8, 0.12, 'lowpass', 1200, 1, 0.5, 200); },
  clang: (d, t) => { osc('triangle', v(320), 300, 0.4, d, t, 0.001, 0.5); osc('triangle', v(763), 740, 0.3, d, t, 0.001, 0.25); noise(d, t, 0.08, 'bandpass', 2000, 1, 0.4); },
  hook: (d, t) => { osc('triangle', v(220), 110, 0.12, d, t, 0.001, 0.6); noise(d, t, 0.06, 'bandpass', 2500, 2, 0.5); },
  pickup: (d, t) => { osc('sine', v(880), 1320, 0.08, d, t, 0.002, 0.2); },
  coin: (d, t) => { osc('square', 1568, 1568, 0.05, d, t, 0.001, 0.12); osc('square', 2093, 2093, 0.1, d, t + 0.05, 0.001, 0.12); },
  rebuilt: (d, t) => { osc('sine', v(600), 900, 0.1, d, t, 0.002, 0.12); },
  jump: (d, t) => { osc('sawtooth', 60, 1200, 2.4, d, t, 2.2, 0.4); noise(d, t, 2.6, 'bandpass', 200, 1, 0.5, 4000, 2.2); osc('sine', 40, 20, 1.2, d, t + 2.4, 0.003, 1.2); },
  warn: (d, t) => { osc('square', 660, 660, 0.1, d, t, 0.002, 0.15); osc('square', 440, 440, 0.12, d, t + 0.14, 0.002, 0.15); },
  lock: (d, t) => { osc('sine', 1400, 1400, 0.04, d, t, 0.001, 0.15); osc('sine', 1800, 1800, 0.06, d, t + 0.06, 0.001, 0.15); },
  dock: (d, t) => { osc('sine', 300, 600, 0.3, d, t, 0.05, 0.3); osc('sine', 450, 900, 0.3, d, t + 0.15, 0.05, 0.25); },
  rare: (d, t) => { [880, 1108, 1318, 1760].forEach((f, i) => osc('sine', f, f, 0.5, d, t + i * 0.07, 0.003, 0.18)); },
  legendary: (d, t) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { osc('triangle', f, f, 0.9, d, t + i * 0.08, 0.003, 0.2); osc('sine', f * 2, f * 2, 0.6, d, t + i * 0.08, 0.003, 0.08); }); },
};
const LIMIT = { gatling: 0.05, hit_kinetic: 0.04, hit_laser: 0.04, hit_plasma: 0.06, hit_lightning: 0.05, hit_explosive: 0.06, blockdie: 0.04, shield: 0.05, laser_pulse: 0.03, pd: 0.04, drone_bullet: 0.05, boom: 0.06, pickup: 0.05, coin: 0.04 };

/** Play a synth voice at a world position. `cam` = { x, y, zoom, w } for falloff/pan. */
export function play(id, x = null, y = null, cam = null, gain = 1) {
  if (!ctx || muted) return;
  const fn = VOICES[id]; if (!fn) return;
  const now = ctx.currentTime; const lim = LIMIT[id] ?? 0.025;
  if ((last.get(id) || -1) > now - lim) return; last.set(id, now);
  let g = gain, pan = 0;
  if (x != null && cam) {
    const dx = (x - cam.x) * cam.zoom, dy = (y - cam.y) * cam.zoom; const d = Math.hypot(dx, dy) / (cam.w || 800);
    g *= Math.max(0, 1 - d * 0.8) ** 2; pan = dx / ((cam.w || 800) * 0.6);
    if (g < 0.02) return;
  }
  fn(out(g * 0.5, pan), now);
}

/** Shared-library sounds (real recordings): explosions, loot, interface. */
export function lib(id, opts) { try { sfxLib?.play(id, opts); } catch { /* ignore */ } }

/** A quiet space bed under everything (shared library; only ambience beds loop). */
let bed = null;
export function ambience(id) { if (!sfxLib || bed === id) return; bed = id; try { sfxLib.ambience?.(id); } catch { /* */ } }

/** A continuous loop (beams, mining) whose loudness follows how many are on. */
export function loopLevel(id, level) {
  if (!ctx) return;
  let L = loops.get(id);
  if (!L) {
    const o = ctx.createOscillator(); const o2 = ctx.createOscillator(); const g = ctx.createGain(); const f = ctx.createBiquadFilter();
    const conf = { beam: [180, 'sawtooth', 361, 2400], mining: [330, 'triangle', 662, 3200], beam_heavy: [95, 'sawtooth', 191, 1400], tractor: [140, 'sine', 210, 800] }[id] || [200, 'sine', 400, 1000];
    o.frequency.value = conf[0]; o.type = conf[1]; o2.frequency.value = conf[2]; o2.type = 'sine'; f.type = 'lowpass'; f.frequency.value = conf[3]; f.Q.value = 3;
    g.gain.value = 0; o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
    L = { g, o, f }; loops.set(id, L);
  }
  const target = Math.min(0.18, level * 0.06);
  L.g.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.05);
  L.o.frequency.setTargetAtTime((id === 'mining' ? 330 : 180) * (1 + Math.random() * 0.02), ctx.currentTime, 0.1);
}

/**
 * Boost engines (report #36): a rising whoosh when the boost lights, a roaring loop while it burns (pitch and
 * loudness follow how hard you are pushing, `level` 0..1), and a quick fade when it stops. Call every frame.
 */
let boostL = null, boostWas = false;
export function boostSound(on, level = 1) {
  if (!ctx) return;
  if (!boostL) {
    const src = ctx.createBufferSource(); src.buffer = noiseBuf(); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.Q.value = 0.7;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.8;
    const rum = ctx.createOscillator(); rum.type = 'sawtooth'; rum.frequency.value = 46;
    const rumF = ctx.createBiquadFilter(); rumF.type = 'lowpass'; rumF.frequency.value = 180;
    const rumG = ctx.createGain(); rumG.gain.value = 0.35;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(lp); lp.connect(g); src.connect(bp); bp.connect(g); rum.connect(rumF); rumF.connect(rumG); rumG.connect(g); g.connect(master);
    src.start(); rum.start();
    boostL = { g, lp, bp, rum };
  }
  const now = ctx.currentTime;
  if (on && !boostWas && !muted) {
    // ignition: a noise sweep up plus a low thump
    const d = out(0.55, 0);
    noise(d, now, 0.55, 'bandpass', 300, 1.2, 0.9, 3200, 0.04);
    osc('sine', 90, 45, 0.35, d, now, 0.01, 0.8);
    noise(d, now + 0.02, 0.25, 'highpass', 2500, 0.7, 0.3, null, 0.01);
  }
  if (!on && boostWas && !muted) { const d = out(0.3, 0); noise(d, now, 0.4, 'bandpass', 1800, 1, 0.5, 250, 0.01); }   // the burn dies away
  boostWas = on;
  const L = on ? Math.max(0.3, Math.min(1, level)) : 0;
  boostL.g.gain.setTargetAtTime(muted ? 0 : L * 0.16, now, on ? 0.08 : 0.12);
  boostL.lp.frequency.setTargetAtTime(380 + L * 520, now, 0.1);
  boostL.bp.frequency.setTargetAtTime(1100 + L * 900, now, 0.1);
  boostL.rum.frequency.setTargetAtTime(40 + L * 16, now, 0.15);
}

export const VOICE_IDS = Object.keys(VOICES);
