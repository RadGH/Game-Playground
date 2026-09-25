// Method "retro": a deliberately cheap chiptune voice — square, triangle and noise channels only,
// stepped envelopes, notes quantized to semitones. Two oscillators at a time, nothing else.
//
// It exists partly as a style option (a pixel-art game may want this) and partly as proof that the
// catalog is a real interface: this method knows nothing about fire or frostbite, it just picks a
// pattern from the sound's category and tunes it with a hash of the id, and every one of the 118
// ids still plays.

export const meta = {
  id: 'retro',
  name: 'Retro (chiptune)',
  license: 'Ours — no third-party rights',
  licenseUrl: '',
  badge: 'ours',
  pros: ['Tiny and instant: two oscillators, no samples', 'Consistent 8-bit character across the whole catalog', 'Covers every id automatically — no per-sound authoring'],
  cons: ['Wrong for a serious tone', 'No texture: a dragon and a rat die the same way', 'Loops are a hum, not an atmosphere'],
};

export function has(entry) { return !!entry; }

/** Stable hash of an id, so "spell.fire.impact" always lands on the same note. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0);
}

const SEMI = f => 55 * Math.pow(2, f / 12);

/** The note list and channel for one id. */
export function patternFor(entry) {
  const r = entry.retro || {};
  const h = hash(entry.id);
  const root = 12 + (h % 30);                       // a semitone step off A1
  const pat = r.pattern || 'blip';
  const wave = r.wave || 'square';
  const dur = r.dur || 0.2;
  const steps = [];
  if (pat === 'arp') { for (let i = 0; i < 4; i++) steps.push({ n: root + i * 4, t: i * dur / 4, d: dur / 3.2 }); }
  else if (pat === 'rise') { for (let i = 0; i < 3; i++) steps.push({ n: root + 12 + i * 5, t: i * dur / 3, d: dur / 2.4 }); }
  else if (pat === 'fall') { for (let i = 0; i < 4; i++) steps.push({ n: root + 12 - i * 5, t: i * dur / 4, d: dur / 3 }); }
  else if (pat === 'fanfare') { [0, 4, 7, 12].forEach((s, i) => steps.push({ n: root + 12 + s, t: i * dur / 4.4, d: dur / 2.6 })); }
  else if (pat === 'hit') { steps.push({ n: root, t: 0, d: dur, drop: 18 }); }
  else if (pat === 'hum') { steps.push({ n: root - 12, t: 0, d: dur, hold: true }, { n: root - 12 + 7, t: 0, d: dur, hold: true, det: 1.007 }); }
  else steps.push({ n: root + 12, t: 0, d: dur });
  return { steps, wave, dur, noise: wave === 'noise', loop: !!r.loop };
}

function noiseBuf(ctx, seconds, seed) {
  let a = (seed >>> 0) || 7;
  const rnd = () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const n = Math.max(1, Math.ceil(seconds * ctx.sampleRate));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // A 1-bit LFSR-ish noise: hold each value for a few samples so it sounds coarse, not hissy.
  const hold = Math.max(1, Math.round(ctx.sampleRate / 11025));
  let v = 1;
  for (let i = 0; i < n; i++) { if (i % hold === 0) v = rnd() < 0.5 ? -0.8 : 0.8; d[i] = v; }
  return buf;
}

export async function render(entry, { sampleRate = 48000, seed = 1, OfflineCtx = null } = {}) {
  const Off = OfflineCtx || (typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null);
  if (!Off) throw new Error('retro.render needs an OfflineAudioContext');
  const p = patternFor(entry);
  const total = Math.max(0.06, p.dur + (p.loop ? 0.05 : 0.2));
  const ctx = new Off(1, Math.ceil(total * sampleRate), sampleRate);
  const bus = ctx.createGain(); bus.gain.value = 0.55; bus.connect(ctx.destination);

  for (const s of p.steps) {
    const g = ctx.createGain();
    // stepped envelope: chip hardware had 16 volume levels and no ramps
    const lvl = s.hold ? 0.5 : 0.9;
    g.gain.setValueAtTime(lvl, s.t);
    if (!s.hold) {
      const steps = 6;
      for (let i = 1; i <= steps; i++) g.gain.setValueAtTime(lvl * (1 - i / steps), s.t + s.d * i / steps);
      g.gain.setValueAtTime(0, s.t + s.d);
    }
    g.connect(bus);
    if (p.noise) {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf(ctx, s.d + 0.02, hash(entry.id) + seed);
      src.playbackRate.value = Math.max(0.25, Math.min(4, SEMI(s.n) / 220));
      src.connect(g); src.start(s.t); src.stop(s.t + s.d + 0.02);
    } else {
      const osc = ctx.createOscillator();
      osc.type = p.wave === 'triangle' ? 'triangle' : 'square';
      const f = SEMI(s.n) * (s.det || 1);
      osc.frequency.setValueAtTime(f, s.t);
      if (s.drop) {
        // a pitch drop in whole steps, the chip way
        for (let i = 1; i <= 6; i++) osc.frequency.setValueAtTime(SEMI(s.n - s.drop * i / 6), s.t + s.d * i / 6);
      }
      osc.connect(g); osc.start(s.t); osc.stop(s.t + s.d + 0.02);
    }
  }
  const rendered = await ctx.startRendering();
  return { samples: rendered.getChannelData(0).slice(), sampleRate: rendered.sampleRate };
}
