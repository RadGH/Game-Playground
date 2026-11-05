import { decodeWav } from '../dsp.js';
// Kokoro-82M neural TTS in the browser (kokoro-js 1.2.1 + transformers.js + ONNX Runtime Web), run in a Web Worker.
// Sounds like a real person. Measured on the dev VM (Ryzen 5900X guest): ~7–10 s for a 4 s line in single-threaded WebAssembly,
// ~5.5 s with threads (https + cross-origin isolation), ~1.5 s natively in node with fp32. WebGPU (https only) should beat all of these.
// Voice JSON fields it reads:
//   variant   — Kokoro voice id, e.g. 'af_heart' (a = American, b = British; f = female, m = male)
//   kokoroMix — optional second voice id to blend in; kokoroMixAmt 0..1 — how much of it (0.5 = halfway between the two)
//   speed     — native speaking rate (0.5 knob = normal); pitch / depth — gentle post-effects so presets still mean something
// Engine-level settings (not part of a voice): configure({ dtype: 'q8'|'fp32'|'fp16'|'q4', device: 'wasm'|'webgpu' }).

export const meta = {
  id: 'kokoro', name: 'Kokoro neural (82M)', license: 'Apache-2.0 model + code; phonemizer is eSpeak NG (GPL-3.0)', commercial: 'conditional',
  licenseNote: 'The Kokoro model weights and kokoro-js are Apache-2.0 (commercial use OK). Text → sounds goes through eSpeak NG compiled to WebAssembly, which is GPL-3.0 — swap that step (e.g. for our CMU-dictionary phonemes) before shipping a closed-source game.',
  offline: 'yes, once tools/fetch-kokoro.sh has put the model on this server (otherwise downloads from Hugging Face on first use)',
  size: '~92 MB model (q8) + 0.5 MB per voice + ~21 MB runtime',
  quality: 'Very natural human voice; best free quality in the lab.',
  crowd: 'About 2 s per new line from the voice service (instant once a line has been said before, it is cached on disk). In-browser: 10–35 s per line on CPU. Generate lines ahead of time; not for 20 NPCs at once.',
  pros: ['Sounds like a person, with natural rhythm', '28 English voices (US + UK)', 'Blend two voices into a new one per character', 'Runs on our own VM (or in the browser), no API key or per-line fees', 'Apache-2.0 model'],
  cons: ['Needs the voice service running (or a ~110 MB download to run in the browser)', 'Seconds, not milliseconds, per new line', 'No real timbre knobs (pitch/size are post-effects)', 'Phonemizer is GPL-3.0 (replaceable)', 'Invented words are guessed by eSpeak rules'],
  knobs: ['variant', 'speed', 'pitch', 'depth'], supportsPhonemes: false, yieldsBuffer: true,
};

// Voice list with the grades the Kokoro authors give each voice (A = best trained). Ordered best first within each group.
export const VOICES = [
  { value: 'af_heart', label: 'US female — Heart (A)' }, { value: 'af_bella', label: 'US female — Bella (A-)' },
  { value: 'af_nicole', label: 'US female — Nicole (B-, soft)' }, { value: 'af_aoede', label: 'US female — Aoede (C+)' },
  { value: 'af_kore', label: 'US female — Kore (C+)' }, { value: 'af_sarah', label: 'US female — Sarah (C+)' },
  { value: 'af_nova', label: 'US female — Nova (C)' }, { value: 'af_alloy', label: 'US female — Alloy (C)' },
  { value: 'af_sky', label: 'US female — Sky (C-)' }, { value: 'af_jessica', label: 'US female — Jessica (D)' }, { value: 'af_river', label: 'US female — River (D)' },
  { value: 'am_fenrir', label: 'US male — Fenrir (C+)' }, { value: 'am_michael', label: 'US male — Michael (C+)' },
  { value: 'am_puck', label: 'US male — Puck (C+)' }, { value: 'am_echo', label: 'US male — Echo (D)' },
  { value: 'am_eric', label: 'US male — Eric (D)' }, { value: 'am_liam', label: 'US male — Liam (D)' },
  { value: 'am_onyx', label: 'US male — Onyx (D, deep)' }, { value: 'am_santa', label: 'US male — Santa (D-)' }, { value: 'am_adam', label: 'US male — Adam (F+)' },
  { value: 'bf_emma', label: 'UK female — Emma (B-)' }, { value: 'bf_isabella', label: 'UK female — Isabella (C)' },
  { value: 'bf_alice', label: 'UK female — Alice (D)' }, { value: 'bf_lily', label: 'UK female — Lily (D)' },
  { value: 'bm_fable', label: 'UK male — Fable (C)' }, { value: 'bm_george', label: 'UK male — George (C)' },
  { value: 'bm_lewis', label: 'UK male — Lewis (D+)' }, { value: 'bm_daniel', label: 'UK male — Daniel (D)' },
];
export const isVoice = id => VOICES.some(v => v.value === id);
export const DTYPES = [
  { value: 'q8', label: 'q8 — 92 MB, good (default)' }, { value: 'fp32', label: 'fp32 — 326 MB, best, slower' },
  { value: 'fp16', label: 'fp16 — 163 MB' }, { value: 'q4', label: 'q4 — smaller download, lower quality' },
];
export const webgpuAvailable = () => typeof navigator !== 'undefined' && !!navigator.gpu && globalThis.isSecureContext;
/** Stronger check: the browser offers WebGPU AND there is a graphics adapter behind it. */
export async function webgpuUsable() { if (!webgpuAvailable()) return false; try { return !!(await navigator.gpu.requestAdapter()); } catch { return false; } }

// device: 'server' (default) = the Kokoro voice service on the VM (voice-lab/server/, reached through tools/serve.py at
// /api/kokoro/) — ~2 s per line natively, works on phones, nothing to download. 'wasm' / 'webgpu' = run the model in this
// browser tab instead (~110 MB download; 10–35 s per line on plain-http pages; does not start on iPhones).
let settings = { dtype: 'q8', device: 'server' }; // the worker falls back to wasm if a WebGPU load fails
/** dtype, device, and (tests only) deadlineMs — how long a silent worker is given before it is thrown away. */
export function configure(s) { settings = { ...settings, ...s }; }
export function getSettings() { return { ...settings }; }

let worker = null, nextId = 1, progressCb = null, stageCb = null; const pending = new Map();
export function onProgress(cb) { progressCb = cb; }
/** Plain-language status while Kokoro works: 'downloading model', 'starting model', 'speaking'… */
export function onStage(cb) { stageCb = cb; }

// A worker that runs out of memory or stalls on a download dies or hangs WITHOUT telling the page. Every call therefore has a
// deadline, pushed back whenever the worker reports progress; when it passes, the worker is thrown away and the call fails
// with a readable error, so the page never waits forever. The next call starts a fresh worker.
const DEADLINE = { init: 120000, synth: 120000 };

function failAll(message) {
  for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error(message)); }
  pending.clear();
  if (worker) { try { worker.terminate(); } catch {} worker = null; }
}
/** Stop whatever Kokoro is doing (the Stop button). Safe to call any time. */
export function reset(reason = 'Kokoro stopped') { failAll(reason); }

function arm(id) {
  const p = pending.get(id); if (!p) return;
  clearTimeout(p.timer);
  p.timer = setTimeout(() => failAll(`Kokoro did not answer for ${p.limit / 1000} s (${p.stage || 'working'}) — it may have run out of memory or the download stalled. Try again, or pick a smaller model size.`), p.limit);
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./kokoro-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'progress' || m.type === 'stage') {
      for (const [id, p] of pending) { if (m.type === 'stage') p.stage = m.stage; arm(id); }
      if (m.type === 'progress') progressCb?.(m.p); else stageCb?.(m.stage);
      return;
    }
    if (m.type === 'fatal') { failAll('Kokoro crashed: ' + m.message); return; }
    const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer);
    if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
  };
  worker.onerror = e => { e.preventDefault?.(); failAll('Kokoro failed to start: ' + (e.message || 'the worker script did not load')); };
  worker.onmessageerror = () => failAll('Kokoro sent back something unreadable');
  return worker;
}
function call(msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++, w = getWorker();
    pending.set(id, { resolve, reject, limit: settings.deadlineMs || DEADLINE[msg.type] || 120000, stage: '' }); arm(id);
    w.postMessage({ ...msg, id });
  });
}

const serverUrl = p => new URL('/api/kokoro' + p, globalThis.location?.origin || 'http://localhost:8401').href;
async function serverFetch(p, init = {}, ms = 90000) {
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(serverUrl(p), { ...init, signal: ac.signal });
    if (!r.ok) { let m = r.status + ''; try { m = (await r.json()).error || m; } catch {} throw new Error('Kokoro voice service: ' + m); }
    return r;
  } catch (e) { if (e.name === 'AbortError') throw new Error(`Kokoro voice service did not answer within ${ms / 1000} s`); throw e; }
  finally { clearTimeout(t); }
}
/** Is the voice service up? Resolves with its /health JSON, or null. */
export async function serverHealth() { try { return await (await serverFetch('/health', {}, 5000)).json(); } catch { return null; } }

/** Download and start the model ahead of time (the first line otherwise pays for it). Resolves with { ms, cached }. */
export async function load() {
  if (settings.device === 'server') { const t0 = performance.now(), h = await (await serverFetch('/health', {}, 10000)).json(); return { ms: performance.now() - t0, cached: h.loaded, device: 'server' }; }
  return call({ type: 'init', ...settings });
}

export async function synth(text, v) {
  const voice = isVoice(v.variant) ? v.variant : 'af_heart';
  const mix = isVoice(v.kokoroMix) ? v.kokoroMix : '';
  const req = { text: text.replace(/\[\[|\]\]/g, ''), voice, mix, mixAmt: Number(v.kokoroMixAmt) || 0, speed: nativeSpeed(v) };
  if (settings.device === 'server') {
    stageCb?.('speaking (voice service)');
    const t0 = performance.now();
    const r = await serverFetch('/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
    const { samples, sampleRate } = decodeWav(new Uint8Array(await r.arrayBuffer()));
    return { samples, sampleRate, info: { engine: 'kokoro', device: 'server', dtype: 'server', ms: Number(r.headers.get('X-Synth-Ms')) || 0, roundTripMs: performance.now() - t0, cache: r.headers.get('X-Cache'), voice: mix ? `mix:${voice}:${mix}:${req.mixAmt}` : voice, phonemes: decodeURIComponent(r.headers.get('X-Phonemes') || ''), modelLoadMs: 0 } };
  }
  const r = await call({ type: 'synth', ...req, ...settings });
  return { samples: r.samples, sampleRate: r.sampleRate, info: r.info };
}

/** Speed knob 0..1 → Kokoro's own rate 0.6..1.4 (0.5 = normal). Done in the model, so it does not sound stretched. */
export function nativeSpeed(v) { return 0.6 + (v.speed ?? 0.5) * 0.8; }

/** Pitch and size have no native control; apply gentle effects (smaller than Piper's, a real voice warps quickly). */
export function derivedFx(v) {
  return { pitchShift: ((v.pitch ?? 0.5) - 0.5) * 8, speed: 1, formant: (0.5 - (v.depth ?? 0.5)) * 4 };
}
