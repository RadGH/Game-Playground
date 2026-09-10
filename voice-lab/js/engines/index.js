// Engine registry. Each engine module exports: meta, load(), and either synth(text, voice) → {samples, sampleRate, info}
// or speakDirect(text, voice) when it cannot produce a buffer (Web Speech).
import * as webspeech from './webspeech.js';
import * as espeak from './espeak.js';
import * as babble from './babble.js';
import * as piper from './piper.js';
export const ENGINES = { espeak, babble, webspeech, piper };
export const ENGINE_ORDER = ['espeak', 'babble', 'piper', 'webspeech'];
export function getEngine(id) { const e = ENGINES[id]; if (!e) throw new Error('unknown engine ' + id); return e; }
