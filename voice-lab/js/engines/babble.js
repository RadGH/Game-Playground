// Babble — Animal Crossing / Simlish style gibberish synthesized from scratch (no samples, no license).
// Each letter or syllable becomes a short vowel-like tone (glottal pulse → 3 formant filters) or a noise burst,
// so the "speech" follows the rhythm and length of the real text. Cheapest option by far, and the only one that
// makes invented fantasy words sound like anything without a pronunciation dictionary.
import { Biquad } from '../dsp.js';

export const meta = {
  id: 'babble', name: 'Babble (gibberish, Animalese-style)', license: 'ours (MIT-style)', commercial: 'yes',
  licenseNote: 'Written for this playground; no third-party code.',
  offline: true, size: '8 KB', quality: 'Intentional gibberish (like Animal Crossing / The Sims): rhythm, pitch and emotion follow the text, but no real words. Pair with subtitles.',
  crowd: 'Practically free. Hundreds of simultaneous talkers.',
  pros: ['No license, no download', 'Works for any language or invented words', 'Rhythm follows the text length, pitch follows punctuation', 'Simlish mode: the same word always sounds the same', 'Every knob is meaningful (formant size, breath, jitter, contour)'],
  cons: ['Not intelligible — needs subtitles', 'Can grate if overused (keep syllables short, vary pitch per character)'],
  knobs: ['pitch', 'speed', 'depth', 'tone', 'breath', 'rough', 'intonation', 'wordgap', 'babbleMode'], supportsPhonemes: false, yieldsBuffer: true,
};
export async function load() {}

const VOWELS = { a: [730, 1090, 2440], e: [530, 1840, 2480], i: [270, 2290, 3010], o: [570, 840, 2410], u: [300, 870, 2240], y: [270, 2100, 2900] };
const CONS = {
  // kind: plosive (silence + burst), fric (noise), nasal (voiced hum), liquid (voiced, formants), h (breathy)
  p: ['plosive', 1500], b: ['plosive', 800], t: ['plosive', 4000], d: ['plosive', 2500], k: ['plosive', 2000], g: ['plosive', 1200], c: ['plosive', 2500], q: ['plosive', 2000],
  s: ['fric', 6000], z: ['fric', 5000], f: ['fric', 3500], v: ['fric', 2500], x: ['fric', 4500], j: ['fric', 3000],
  m: ['nasal', 250], n: ['nasal', 300], l: ['liquid', [400, 1100, 2600]], r: ['liquid', [450, 1200, 1600]], w: ['liquid', [300, 700, 2300]], h: ['h', 0],
};
const SIMLISH_SYL = ['sul', 'dag', 'nerb', 'plerg', 'vad', 'ish', 'oo', 'ka', 'meh', 'fro', 'bli', 'dee', 'gah', 'nu', 'ro', 'zep', 'wib', 'tay', 'lo', 'mip', 'sha', 'kra', 'vee', 'ba', 'du', 'eem', 'ol', 'ti'];

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Turn text into a list of units: { kind:'v'|'c'|'gap'|'pause', letter, stress, punct } */
export function tokenize(text, mode = 'letters') {
  const units = [];
  const words = text.toLowerCase().split(/(\s+)/);
  for (const w of words) {
    if (!w) continue;
    if (/^\s+$/.test(w)) { units.push({ kind: 'gap' }); continue; }
    const punct = /[?!.,;:]+$/.exec(w)?.[0] || '';
    let letters = w.replace(/[^a-z]/g, '');
    if (mode === 'simlish') { const r = mulberry(hash(letters)); const n = Math.max(1, Math.min(4, Math.round(letters.length / 2.5))); letters = Array.from({ length: n }, () => SIMLISH_SYL[Math.floor(r() * SIMLISH_SYL.length)]).join(''); }
    if (mode === 'syllables') letters = letters.replace(/([aeiouy])([^aeiouy]{2,})/g, (m, v, c) => v + c[0]); // thin out clusters
    let firstVowel = true;
    for (const ch of letters) {
      if (VOWELS[ch]) { units.push({ kind: 'v', letter: ch, stress: firstVowel }); firstVowel = false; }
      else if (CONS[ch]) units.push({ kind: 'c', letter: ch });
    }
    if (punct) units.push({ kind: 'pause', punct });
  }
  return units;
}

export function mapKnobs(v) {
  return {
    f0: 90 * Math.pow(4.5, v.pitch ?? 0.5),                  // 90..405 Hz (0.5 → ~190 Hz)
    unitMs: 130 - (v.speed ?? 0.5) * 95,                      // 130..35 ms per letter
    fscale: 1.3 - (v.depth ?? 0.5) * 0.6,                     // formant scale 1.3 (tiny) .. 0.7 (huge)
    bright: v.tone ?? 0.5, breath: v.breath ?? 0.1, jitter: v.rough ?? 0.2,
    contour: ((v.intonation ?? 2) - 1) / 3,                   // 0..1
    gapMs: 40 + (v.wordgap ?? 0) * 200, mode: v.babbleMode || 'letters',
  };
}

export async function synth(text, v) {
  const p = mapKnobs(v), sr = 22050, t0 = performance.now();
  const units = tokenize(text, p.mode);
  const rnd = mulberry(hash(text) ^ 0x9e3779b9);
  // duration plan
  const plan = []; let total = 0;
  const voicedCount = units.filter(u => u.kind === 'v').length; let vi = 0;
  for (const u of units) {
    let ms = u.kind === 'gap' ? p.gapMs : u.kind === 'pause' ? (u.punct.includes(',') ? 120 : 220) : u.kind === 'v' ? p.unitMs * (u.stress ? 1.3 : 1) : p.unitMs * 0.55;
    ms *= 0.85 + rnd() * 0.3;
    // pitch contour: declination + final movement + jitter
    let semis = 0;
    if (u.kind === 'v') {
      const pos = voicedCount > 1 ? vi / (voicedCount - 1) : 0; vi++;
      semis += p.contour * (3 - 6 * pos);                                 // start high, fall
      if (u.stress) semis += p.contour * 2;
      const lastPunct = units.slice(units.indexOf(u)).find(x => x.kind === 'pause')?.punct || '';
      if (pos > 0.7 && lastPunct.includes('?')) semis += p.contour * 6 * (pos - 0.7) / 0.3;
      if (pos > 0.7 && lastPunct.includes('!')) semis += p.contour * 3;
      semis += (rnd() - 0.5) * 2 * p.jitter * 4;
    }
    plan.push({ u, samples: Math.round(ms * sr / 1000), semis }); total += Math.round(ms * sr / 1000);
  }
  const out = new Float32Array(total + sr * 0.05);
  let pos = 0, phase = 0;
  for (const { u, samples, semis } of plan) {
    if (u.kind === 'gap' || u.kind === 'pause') { pos += samples; continue; }
    const f0 = p.f0 * Math.pow(2, semis / 12);
    const kind = u.kind === 'v' ? 'v' : CONS[u.letter][0];
    let formants = null, noiseHz = 0, voiced = true, noiseMix = p.breath * 0.5;
    if (kind === 'v') formants = VOWELS[u.letter];
    else if (kind === 'liquid') formants = CONS[u.letter][1];
    else if (kind === 'nasal') { formants = [CONS[u.letter][1], 1000, 2200]; }
    else if (kind === 'plosive') { voiced = false; noiseHz = CONS[u.letter][1]; noiseMix = 1; }
    else if (kind === 'fric') { voiced = false; noiseHz = CONS[u.letter][1]; noiseMix = 1; }
    else if (kind === 'h') { voiced = false; noiseHz = 1200; noiseMix = 0.5; }
    const filters = formants ? formants.map((f, i) => new Biquad('bandpass', f * p.fscale, sr, i === 0 ? 6 : 8 + p.bright * 6)) : [new Biquad('bandpass', noiseHz * p.fscale, sr, 2)];
    const gains = formants ? [1, 0.5 + p.bright * 0.5, 0.15 + p.bright * 0.4] : [1];
    const lp = new Biquad('lowpass', 900 + p.bright * 3000, sr, 0.7);
    const n = samples, attack = Math.round(sr * 0.008), release = Math.round(sr * 0.02);
    const burstStart = kind === 'plosive' ? Math.round(n * 0.5) : 0;
    for (let i = 0; i < n && pos + i < out.length; i++) {
      let env = Math.min(1, i / attack, (n - i) / release); if (env < 0) env = 0;
      if (kind === 'plosive') env = i < burstStart ? 0 : Math.exp(-(i - burstStart) / (sr * 0.012));
      if (kind === 'nasal') env *= 0.6;
      let src = 0;
      if (voiced) { phase += f0 / sr; if (phase >= 1) phase -= 1; const saw = 2 * phase - 1; src = lp.step(saw) * (1 - noiseMix) + (Math.random() * 2 - 1) * noiseMix * 0.4; }
      else src = (Math.random() * 2 - 1);
      let y = 0; for (let k = 0; k < filters.length; k++) y += filters[k].step(src) * gains[k];
      out[pos + i] += y * env * (voiced ? 0.9 : 0.35);
    }
    pos += n;
  }
  // soft normalize
  let peak = 0; for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i])); if (peak > 0) for (let i = 0; i < out.length; i++) out[i] *= 0.8 / peak;
  return { samples: out, sampleRate: sr, info: { engine: 'babble', ms: performance.now() - t0, units: units.length, opts: p } };
}
