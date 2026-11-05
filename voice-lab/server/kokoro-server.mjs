// Kokoro TTS as a small background service for the Voice Lab (and later, games).
//
// Why: running the model inside a browser takes 10–35 s per line on plain-http pages and does not start at all on an
// iPhone. Natively on the VM it takes ~1.5 s. So the page sends text here and gets a WAV back.
//
//   node voice-lab/server/kokoro-server.mjs            listens on 127.0.0.1:8402 (tools/serve.py forwards /api/kokoro/* here)
//   systemctl --user start kokoro-tts                  the same thing as a user service (see tools/kokoro-tts.service)
//
// Endpoints (all JSON in, all CORS-open):
//   GET  /health   → { ok, loaded, dtype, queue, cached }
//   POST /tts      { text, voice: 'af_heart', mix?: 'bm_george', mixAmt?: 0..1, speed?: 0.5..2 }
//                  → audio/wav (24 kHz mono 16-bit), headers X-Synth-Ms, X-Cache (hit|miss), X-Phonemes
//
// Every result is cached on disk (voice-lab/server/cache/, git-ignored) keyed by the request, so a line that has been
// said once comes back instantly — that is how a game would use it too. Requests are run one at a time.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { env, Tensor } from '@huggingface/transformers';
import { KokoroTTS, phonemize, voiceCache } from './kokoro-node.js';
import { parseRequest, VOICES, MAX_TEXT } from './request.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '../..');
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const MODELS = path.join(ROOT, 'vendor/kokoro/models');
const PORT = Number(process.env.KOKORO_PORT || 8402);
const HOST = process.env.KOKORO_HOST || '127.0.0.1';
const CACHE = path.join(HERE, 'cache');
const CACHE_MAX = 5000; // files; oldest are pruned past this
// fp32 is the fastest AND best-sounding choice natively (measured 2026-11-04: ~1.5 s vs ~3.5 s for q8 on a 4 s line).
const DTYPE = process.env.KOKORO_DTYPE || (fs.existsSync(path.join(MODELS, MODEL, 'onnx/model.onnx')) ? 'fp32' : 'q8');
env.localModelPath = MODELS + '/'; env.allowLocalModels = true; env.allowRemoteModels = true;
fs.mkdirSync(CACHE, { recursive: true });

let tts = null, readyP = null;
const ready = () => readyP ??= (async () => {
  const t0 = Date.now();
  tts = await KokoroTTS.from_pretrained(MODEL, { dtype: DTYPE, device: 'cpu' });
  console.log(`kokoro: model ${DTYPE} loaded in ${Date.now() - t0} ms`);
})();

async function loadVoice(id) {
  if (voiceCache.has(id)) return voiceCache.get(id);
  const local = path.join(MODELS, MODEL, 'voices', id + '.bin');
  let buf;
  if (fs.existsSync(local)) buf = fs.readFileSync(local);
  else { const r = await fetch(`https://huggingface.co/${MODEL}/resolve/main/voices/${id}.bin`); if (!r.ok) throw new Error('voice download failed: ' + id); buf = Buffer.from(await r.arrayBuffer()); }
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  voiceCache.set(id, data); return data;
}
/** Two voices mixed into a new one (straight mix of their style vectors), cached under its own key. */
async function voiceKey(a, b, amt) {
  const va = await loadVoice(a);
  if (!b || b === a || !(amt > 0)) return a;
  const t = Math.min(1, Math.max(0, amt)), key = `mix:${a}:${b}:${t.toFixed(2)}`;
  if (voiceCache.has(key)) return key;
  const vb = await loadVoice(b), out = new Float32Array(va.length);
  for (let i = 0; i < out.length; i++) out[i] = va[i] * (1 - t) + vb[i] * t;
  voiceCache.set(key, out); return key;
}
/** The model takes ~510 phoneme tokens at most; long text goes a few sentences at a time. */
function chunks(text) {
  if (text.length <= 300) return [text];
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text];
  const out = []; let cur = '';
  for (const p of parts) { if ((cur + p).length > 300 && cur) { out.push(cur.trim()); cur = ''; } cur += p; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function synth({ text, voice, mix, mixAmt, speed }) {
  await ready();
  const key = await voiceKey(voice, mix, mixAmt);
  const lang = voice[0] === 'b' ? 'b' : 'a';
  const pieces = [], phon = [];
  for (const c of chunks(text)) {
    const ph = await phonemize(c, lang); phon.push(ph);
    const { input_ids } = tts.tokenizer(ph, { truncation: true });
    const n = Math.min(Math.max(input_ids.dims.at(-1) - 2, 0), 509);
    const style = voiceCache.get(key).slice(n * 256, n * 256 + 256);
    const { waveform } = await tts.model({ input_ids, style: new Tensor('float32', style, [1, 256]), speed: new Tensor('float32', [speed], [1]) });
    pieces.push(waveform.data);
  }
  const gap = Math.round(24000 * 0.12), total = pieces.reduce((s, p) => s + p.length, 0) + gap * (pieces.length - 1);
  const samples = new Float32Array(total); let o = 0;
  for (const p of pieces) { samples.set(p, o); o += p.length + gap; }
  return { wav: wav16(samples, 24000), phonemes: phon.join(' | ') };
}

function wav16(samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}

function pruneCache() {
  const files = fs.readdirSync(CACHE).filter(f => f.endsWith('.wav'));
  if (files.length <= CACHE_MAX) return;
  files.map(f => [f, fs.statSync(path.join(CACHE, f)).mtimeMs]).sort((a, b) => a[1] - b[1])
    .slice(0, files.length - CACHE_MAX).forEach(([f]) => { fs.rmSync(path.join(CACHE, f), { force: true }); fs.rmSync(path.join(CACHE, f.replace(/\.wav$/, '.txt')), { force: true }); });
}

// one request at a time: the model already uses every core, so running two at once only makes both slower
let chain = Promise.resolve(), queued = 0;
const enqueue = fn => { queued++; const p = chain.then(fn).finally(() => queued--); chain = p.catch(() => {}); return p; };

function send(res, code, body, headers = {}) {
  res.writeHead(code, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Expose-Headers': 'X-Synth-Ms, X-Cache, X-Phonemes', ...headers });
  res.end(body);
}
const json = (res, code, obj) => send(res, code, JSON.stringify(obj), { 'Content-Type': 'application/json' });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'), route = url.pathname.replace(/^\/api\/kokoro/, '');
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '');
    if (route === '/health') return json(res, 200, { ok: true, loaded: !!tts, dtype: DTYPE, queue: queued, cached: fs.readdirSync(CACHE).filter(f => f.endsWith('.wav')).length, voices: VOICES });
    if (route === '/tts' && req.method === 'POST') {
      let raw = ''; for await (const c of req) { raw += c; if (raw.length > 20000) throw new Error('request too large'); }
      const q = parseRequest(JSON.parse(raw || '{}'));
      const id = crypto.createHash('sha1').update(JSON.stringify([DTYPE, q])).digest('hex'), file = path.join(CACHE, id + '.wav');
      if (fs.existsSync(file)) {
        const now = new Date(); fs.utimesSync(file, now, now);
        const ph = fs.existsSync(file.replace(/\.wav$/, '.txt')) ? fs.readFileSync(file.replace(/\.wav$/, '.txt'), 'utf8') : '';
        return send(res, 200, fs.readFileSync(file), { 'Content-Type': 'audio/wav', 'X-Synth-Ms': '0', 'X-Cache': 'hit', 'X-Phonemes': encodeURIComponent(ph) });
      }
      const t0 = Date.now();
      const r = await enqueue(() => synth(q));
      const ms = Date.now() - t0;
      fs.writeFileSync(file, r.wav); fs.writeFileSync(file.replace(/\.wav$/, '.txt'), r.phonemes); pruneCache();
      console.log(`kokoro: ${ms} ms ${q.voice}${q.mix ? '+' + q.mix : ''} "${q.text.slice(0, 50)}"`);
      return send(res, 200, r.wav, { 'Content-Type': 'audio/wav', 'X-Synth-Ms': String(ms), 'X-Cache': 'miss', 'X-Phonemes': encodeURIComponent(r.phonemes) });
    }
    json(res, 404, { error: 'unknown endpoint' });
  } catch (e) { json(res, 400, { error: e.message }); }
});

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  server.listen(PORT, HOST, () => { console.log(`kokoro: listening on http://${HOST}:${PORT} (model ${DTYPE})`); ready(); });
}
