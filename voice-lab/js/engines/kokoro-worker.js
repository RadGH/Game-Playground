// Kokoro runs here, in a Web Worker, so the page does not freeze while the model thinks (a line takes about a second or more on CPU).
// Messages in:  { id, type: 'init', dtype, device }      → { id, type: 'ready', ms, device, dtype, local }
//               { id, type: 'synth', text, voice, mix, mixAmt, speed, dtype, device } → { id, type: 'audio', samples, sampleRate, info }
// Messages out also include { type: 'progress', p } while files download, and { id, type: 'error', message }.
//
// Files come from vendor/kokoro/models/ on this server when tools/fetch-kokoro.sh has been run, and from Hugging Face /
// jsDelivr otherwise (transformers.js tries the local path first, then the remote one, file by file).
import { KokoroTTS, env, transformersEnv, phonemize, voiceCache } from '../../../vendor/kokoro/kokoro.web.js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const LOCAL = new URL('../../../vendor/kokoro/models/', import.meta.url).href;
const HF = `https://huggingface.co/${MODEL}/resolve/main/`;

let tts = null, loadedKey = '', loading = null, localRuntime = false, usedDevice = 'wasm';

const stage = t => postMessage({ type: 'stage', stage: t });
self.addEventListener('unhandledrejection', e => postMessage({ type: 'fatal', message: e.reason?.message || String(e.reason) }));
self.addEventListener('error', e => postMessage({ type: 'fatal', message: e.message || 'error' }));

async function exists(url) { try { const r = await fetch(url, { method: 'HEAD' }); return r.ok; } catch { return false; } }

async function init(dtype = 'q8', device = 'wasm') {
  const key = dtype + '|' + device;
  if (tts && loadedKey === key) return { ms: 0, cached: true, device: usedDevice };
  if (loading && loading.key === key) return loading.promise;
  const promise = (async () => {
    const t0 = performance.now();
    transformersEnv.allowLocalModels = true; transformersEnv.allowRemoteModels = true; transformersEnv.localModelPath = LOCAL;
    localRuntime = await exists(LOCAL + 'ort/ort-wasm-simd-threaded.jsep.wasm');
    if (localRuntime) env.wasmPaths = LOCAL + 'ort/';
    stage('loading model');
    const progress_callback = p => { postMessage({ type: 'progress', p }); if (p.status === 'done' && /onnx$/.test(p.file || '')) stage('starting model (can take a few seconds)'); };
    let used = device;
    try { tts = await KokoroTTS.from_pretrained(MODEL, { dtype, device, progress_callback }); }
    catch (err) {
      // WebGPU can be advertised by the browser with no usable graphics card behind it; fall back to the CPU.
      if (device !== 'webgpu') throw err;
      used = 'wasm'; tts = await KokoroTTS.from_pretrained(MODEL, { dtype, device: 'wasm', progress_callback });
    }
    loadedKey = key; usedDevice = used;
    return { ms: performance.now() - t0, cached: false, device: used };
  })();
  loading = { key, promise };
  try { return await promise; } finally { loading = null; }
}

/** Fetch a voice's style vectors (510 × 256 floats) into the library's own cache, local copy first. */
async function loadVoice(id) {
  if (voiceCache.has(id)) return voiceCache.get(id);
  let buf = null;
  for (const url of [LOCAL + MODEL + '/voices/' + id + '.bin', HF + 'voices/' + id + '.bin']) {
    try { const r = await fetch(url); if (r.ok) { buf = await r.arrayBuffer(); break; } } catch {}
  }
  if (!buf) throw new Error('could not download Kokoro voice ' + id);
  const data = new Float32Array(buf); voiceCache.set(id, data); return data;
}

/** A blended voice is a straight mix of two voices' style vectors, cached under its own key. */
async function voiceKey(a, b, amt) {
  const va = await loadVoice(a);
  if (!b || b === a || !(amt > 0)) return a;
  const t = Math.min(1, Math.max(0, amt)), key = `mix:${a}:${b}:${t.toFixed(2)}`;
  if (voiceCache.has(key)) return key;
  const vb = await loadVoice(b), out = new Float32Array(va.length);
  for (let i = 0; i < out.length; i++) out[i] = va[i] * (1 - t) + vb[i] * t;
  voiceCache.set(key, out); return key;
}

/** The model takes at most ~510 phoneme tokens, so long text is spoken a sentence group at a time. */
function chunks(text) {
  if (text.length <= 300) return [text];
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + p).length > 300 && cur) { out.push(cur.trim()); cur = ''; } cur += p; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function synth({ text, voice = 'af_heart', mix = '', mixAmt = 0, speed = 1, dtype, device }) {
  const load = await init(dtype, device);
  const t0 = performance.now();
  stage('loading voice'); const key = await voiceKey(voice, mix, mixAmt);
  stage('speaking');
  const lang = voice[0] === 'b' ? 'b' : 'a'; // a = American English, b = British English
  const pieces = [], phon = [];
  for (const c of chunks(text)) {
    const ph = await phonemize(c, lang); phon.push(ph);
    const { input_ids } = tts.tokenizer(ph, { truncation: true });
    const audio = await tts.generate_from_ids(input_ids, { voice: key, speed });
    pieces.push(audio.audio);
  }
  const gap = Math.round(24000 * 0.12), total = pieces.reduce((n, p) => n + p.length, 0) + gap * (pieces.length - 1);
  const samples = new Float32Array(total); let o = 0;
  for (const p of pieces) { samples.set(p, o); o += p.length + gap; }
  return { samples, sampleRate: 24000, info: { engine: 'kokoro', ms: performance.now() - t0, modelLoadMs: load.ms, voice: key, phonemes: phon.join(' | '), dtype, device: usedDevice, localRuntime } };
}

self.onmessage = async e => {
  const m = e.data;
  try {
    if (m.type === 'init') { const r = await init(m.dtype, m.device); postMessage({ id: m.id, type: 'ready', ...r, localRuntime }); }
    else if (m.type === 'synth') { const r = await synth(m); postMessage({ id: m.id, type: 'audio', ...r }, [r.samples.buffer]); }
  } catch (err) { postMessage({ id: m.id, type: 'error', message: err?.message || String(err) }); }
};
