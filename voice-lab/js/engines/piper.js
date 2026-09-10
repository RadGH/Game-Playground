// Piper (VITS neural TTS) in the browser via @diffusionstudio/vits-web + ONNX Runtime Web. MIT code; voices are
// mostly permissive (check each model card on Hugging Face). Needs internet on first use (downloads 20 MB runtime
// from cdnjs + 60-110 MB voice model from Hugging Face), then cached in the browser's private file storage.
// No native knobs beyond the voice itself; pitch/speed/size are applied through the effects chain.
import { decodeWav } from '../dsp.js';

export const meta = {
  id: 'piper', name: 'Piper neural (vits-web)', license: 'MIT (code) / per-voice', commercial: 'yes',
  licenseNote: 'MIT library. Each Piper voice has its own model card/license (most are permissive). Runtime + model are fetched from the internet on first use.',
  offline: 'after first download', size: '~20 MB runtime + 60–110 MB per voice', quality: 'Natural human voice.',
  crowd: 'Seconds per line on CPU (no WebGPU here). Pre-render a few lines, never real-time crowds. At most one "hero" line at a time.',
  pros: ['Sounds like a person', 'Many voices/languages', 'Free'],
  cons: ['Large download, needs internet first time', 'Slow to synthesize', 'No timbre knobs (only post-effects)', 'Not deterministic across versions'],
  knobs: ['variant', 'pitch', 'speed', 'depth'], supportsPhonemes: false, yieldsBuffer: true,
};
export const VOICES = [
  { value: 'en_US-hfc_female-medium', label: 'US female (hfc, medium)' }, { value: 'en_US-hfc_male-medium', label: 'US male (hfc, medium)' },
  { value: 'en_US-lessac-medium', label: 'US female (lessac, medium)' }, { value: 'en_US-ryan-medium', label: 'US male (ryan, medium)' },
  { value: 'en_US-amy-low', label: 'US female (amy, low — small)' }, { value: 'en_US-danny-low', label: 'US male (danny, low — small)' },
  { value: 'en_GB-alan-medium', label: 'UK male (alan, medium)' }, { value: 'en_GB-alba-medium', label: 'UK female (alba, medium)' },
];
let tts = null, progressCb = null;
export function onProgress(cb) { progressCb = cb; }
export async function load() { if (!tts) tts = await import('../../../vendor/vits-web/vits-web.js'); }
export async function stored() { await load(); try { return await tts.stored(); } catch { return []; } }
export async function download(voiceId) { await load(); await tts.download(voiceId, p => progressCb?.(p)); }
export async function synth(text, v) {
  await load();
  const voiceId = v.variant || 'en_US-hfc_female-medium', t0 = performance.now();
  const wav = await tts.predict({ text: text.replace(/\[\[|\]\]/g, ''), voiceId }, p => progressCb?.(p));
  const { samples, sampleRate } = decodeWav(new Uint8Array(await wav.arrayBuffer()));
  return { samples, sampleRate, info: { engine: 'piper', ms: performance.now() - t0, voiceId } };
}
/** Piper has no knobs; derive effects from the generic knobs so presets still mean something. */
export function derivedFx(v) {
  return { pitchShift: ((v.pitch ?? 0.5) - 0.5) * 16, speed: 0.6 + (v.speed ?? 0.5) * 0.9, formant: (0.5 - (v.depth ?? 0.5)) * 8 };
}
