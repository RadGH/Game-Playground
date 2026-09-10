// "Ours" — a bespoke rule-based formant synthesizer, MIT-style (no third-party synthesis code). Text → phonemes via the
// CMU dictionary (BSD) + our letter-to-sound rules, phonemes → formant/voicing/noise tracks, tracks → audio through a
// Klatt-style resonator bank. Every knob maps to a physical parameter of the voice.
import { textToPhonemes, loadDictionary, addPronunciation, dictionarySize } from './g2p.js';
import { buildFrames } from './tracks.js';
import { synthesize, SR } from './synth.js';

export const meta = {
  id: 'formant', name: 'Formant (ours)', license: 'ours (MIT-style) + CMUdict (BSD)', commercial: 'yes',
  licenseNote: 'Written for this playground. The pronunciation dictionary is the CMU Pronouncing Dictionary (BSD, notice kept in data/cmudict/LICENSE).',
  offline: true, size: '3.3 MB dictionary + 40 KB code', quality: 'Rule-based robot voice, like espeak. Intelligibility depends on the rules; every knob is a physical parameter.',
  crowd: 'Very cheap (pure JS, faster than real time). Pre-render lines and play dozens at once.',
  pros: ['No license problems', 'Phoneme input and custom pronunciations for invented words', 'Physical knobs: vocal tract size, glottal open quotient, breath, jitter, tilt', 'Deterministic', 'All code readable and tweakable by Claude'],
  cons: ['Robotic', 'English only', 'Letter-to-sound rules are approximate for unknown words (give names a pronunciation)'],
  knobs: ['pitch', 'speed', 'depth', 'tone', 'breath', 'rough', 'flutter', 'intonation', 'wordgap', 'gender'],
  supportsPhonemes: true, yieldsBuffer: true,
};
export async function load() { await loadDictionary(); }
export { addPronunciation, textToPhonemes };

/** Generic knobs → physical parameters. */
export function mapKnobs(v) {
  const g = v.gender === 'f' ? { f0: 205, fs: 1.17, oq: 0.68 } : v.gender === 'n' ? { f0: 150, fs: 1.08, oq: 0.62 } : { f0: 112, fs: 1.0, oq: 0.58 };
  return {
    f0: g.f0 * Math.pow(2.6, (v.pitch ?? 0.5) - 0.5),                 // ±1.35 octaves around the gender base
    speed: 0.55 + (v.speed ?? 0.3) * 1.5,                              // 0.55 .. 2.05× (default knob 0.3 ≈ 1.0)
    formantScale: g.fs * (1.28 - (v.depth ?? 0.5) * 0.56),             // 1.28 (tiny tract) .. 0.72 (huge)
    tone: v.tone ?? 0.5, breath: v.breath ?? 0.1, intonation: 0.3 + ((v.intonation ?? 2) - 1) * 0.4,
    jitter: v.rough ?? 0.1, shimmer: (v.rough ?? 0.1) * 0.6, flutter: v.flutter ?? 0.1, oq: g.oq + (v.breath ?? 0) * 0.15,
    wordGapMs: (v.wordgap ?? 0) * 220,
  };
}

export async function synth(text, v) {
  await load();
  const t0 = performance.now(); const p = mapKnobs(v);
  const g2p = textToPhonemes(text);
  const { frames, segs } = buildFrames(g2p.words, p);
  const samples = synthesize(frames, { jitter: p.jitter, shimmer: p.shimmer, flutter: p.flutter, oq: p.oq, breath: p.breath });
  return { samples, sampleRate: SR, info: { engine: 'formant', ms: performance.now() - t0, phonemes: g2p.words.map(w => `${w.text}[${w.source[0]}] ${w.phones.join(' ')}${w.punct}`).join('  '), words: g2p.words, opts: p, frames: frames.length, dictionary: dictionarySize() } };
}
