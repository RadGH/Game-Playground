// Voice Lab public API. Import this from a game or from the combined demo:
//   import { synthesize, play, say, stopAll, DEFAULT_VOICE, normalizeVoice } from './voice-lab/js/voice.js';
//   const { result } = await say("Hello there", { ...DEFAULT_VOICE, pitch: 0.8 });
// A "voice" is the JSON object documented in README.md (generic knobs + engine id + fx). synthesize() renders it to
// PCM once and caches it, so repeating a line costs nothing; play() mixes any number of results at once.
import { ENGINES, getEngine } from './engines/index.js';
import { applyFx, FX_DEFAULTS } from './fx.js';
import * as piper from './engines/piper.js';

export const DEFAULT_VOICE = {
  engine: 'espeak', pitch: 0.5, speed: 0.3, depth: 0.5, tone: 0.5, breath: 0.1, rough: 0.1, flutter: 0.1, intonation: 2, wordgap: 0,
  gender: 'm', accent: 'en-us', variant: 'custom', babbleMode: 'letters', fx: {},
};
export const KNOB_RANGES = {
  pitch: [0, 1, 'Pitch: 0 = deepest, 1 = highest'], speed: [0, 1, 'Speed: 0 = slowest, 1 = fastest'],
  depth: [0, 1, 'Depth / body size: 0 = tiny vocal tract (child), 1 = giant'], tone: [0, 1, 'Tone: 0 = dull/muffled, 1 = bright/sharp'],
  breath: [0, 1, 'Breathiness'], rough: [0, 1, 'Roughness / gravel'], flutter: [0, 1, 'Flutter: wobbly, elderly'],
  intonation: [1, 4, 'Intonation style 1–4 (1 = flat, 4 = sing-song)'], wordgap: [0, 1, 'Extra pause between words'],
};

/** Fill in defaults and drop unknown fields so a voice from any source is safe to use. */
export function normalizeVoice(v = {}) {
  const out = { ...DEFAULT_VOICE, ...v, fx: { ...(v.fx || {}) } };
  if (!ENGINES[out.engine]) out.engine = DEFAULT_VOICE.engine;
  for (const k of Object.keys(KNOB_RANGES)) { const [lo, hi] = KNOB_RANGES[k]; out[k] = Math.min(hi, Math.max(lo, Number(out[k]) || 0)); }
  return out;
}

const cache = new Map(); const CACHE_MAX = 300;
function cacheKey(text, v) { return JSON.stringify([text, v]); }

/**
 * Render text with a voice to PCM. Returns { samples, sampleRate, duration, info, engine }.
 * Throws for engines without buffers (webspeech) — use say() for those.
 */
export async function synthesize(text, voice, { noCache = false } = {}) {
  const v = normalizeVoice(voice);
  const key = cacheKey(text, v);
  if (!noCache && cache.has(key)) { const r = cache.get(key); cache.delete(key); cache.set(key, r); return r; }
  const eng = getEngine(v.engine);
  if (!eng.meta.yieldsBuffer) throw new Error(`${v.engine} cannot produce an audio buffer`);
  const t0 = performance.now();
  const raw = await eng.synth(text, v);
  let fx = { ...v.fx };
  if (v.engine === 'piper') { const d = piper.derivedFx(v); fx = { ...d, ...fx, pitchShift: (fx.pitchShift || 0) + d.pitchShift, formant: (fx.formant || 0) + d.formant, speed: (fx.speed || 1) * d.speed }; }
  const samples = applyFx(raw.samples, raw.sampleRate, fx);
  const result = { samples, sampleRate: raw.sampleRate, duration: samples.length / raw.sampleRate, engine: v.engine, info: { ...raw.info, totalMs: performance.now() - t0, fxApplied: fx } };
  if (!noCache) { cache.set(key, result); if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); }
  return result;
}

let ctx = null; const active = new Set();
export function getContext() { if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); return ctx; }

/** Play a synthesized result. Options: when (seconds from now), volume 0..1, pan -1..1, rate. Returns { source, done }. */
export function play(result, { when = 0, volume = 1, pan = 0, rate = 1, context } = {}) {
  const c = context || getContext();
  const buf = c.createBuffer(1, result.samples.length, result.sampleRate); buf.copyToChannel(result.samples, 0);
  const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
  const g = c.createGain(); g.gain.value = volume;
  let node = src.connect(g);
  if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; node = g.connect(p); } else node = g;
  node.connect(c.destination);
  const done = new Promise(res => { src.onended = () => { active.delete(src); res(); }; });
  active.add(src); src.start(c.currentTime + when);
  return { source: src, done };
}

/** Convenience: synthesize + play (or speak directly for Web Speech). Returns { result, done }. */
export async function say(text, voice, opts = {}) {
  const v = normalizeVoice(voice);
  if (!getEngine(v.engine).meta.yieldsBuffer) { const done = getEngine(v.engine).speakDirect(text, v); return { result: null, done }; }
  const result = await synthesize(text, v, opts);
  return { result, ...play(result, opts) };
}

export function stopAll() { for (const s of active) { try { s.stop(); } catch {} } active.clear(); if (window.speechSynthesis) speechSynthesis.cancel(); }
export function activeCount() { return active.size; }
export function clearCache() { cache.clear(); }
export { ENGINES, FX_DEFAULTS };
