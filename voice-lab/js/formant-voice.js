// Stable entry point for OUR voice model (the formant engine) so other projects can depend on one file and a version.
//   import { VERSION, load, synthesize, say, meta } from '.../voice-lab/js/formant-voice.js';
//   await load();                                   // loads the dictionary once
//   const { samples, sampleRate } = await synthesize('Hello there.', { pitch: 0.4, speed: 0.5, gender: 'f' });
//   await say('Hello there.', voiceJson);           // browser only: plays through Web Audio via voice-lab/js/voice.js
// Knobs are the shared voice JSON (voice-lab/README.md): pitch/speed/depth/tone/breath/rough/flutter/intonation/wordgap 0..1, gender m|f|n.
// Version rules are in engines/formant/CHANGELOG.md; module.json carries the same version for tooling.
import { synth, load as loadDict, meta as engineMeta, addPronunciation, textToPhonemes, mapKnobs } from './engines/formant/index.js';
export const VERSION = '1.1.0';
export const meta = { ...engineMeta, version: VERSION };
export async function load() { await loadDict(); return VERSION; }
/** Render text to PCM. Returns { samples: Float32Array, sampleRate, info }. Works in node and browsers. */
export async function synthesize(text, voice = {}) { return synth(text, { engine: 'formant', pitch: 0.5, speed: 0.5, depth: 0.5, tone: 0.5, breath: 0.2, rough: 0.1, flutter: 0.1, intonation: 0.5, wordgap: 0.3, gender: 'n', ...voice }); }
/** Browser convenience: synthesize + play with the shared player. */
export async function say(text, voice = {}, opts = {}) { const v = await import('./voice.js'); return v.say(text, { ...voice, engine: 'formant' }, opts); }
export { addPronunciation, textToPhonemes, mapKnobs };
