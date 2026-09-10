// espeak engine via meSpeak.js (espeak 1.47 compiled to asm.js). GPL-3.0 — see vendor/README.md.
// The closest analog to Tomodachi Life's knobs: real formant / breath / roughness / intonation control through a
// generated "voice variant" file. Also accepts phoneme input: [[h@l'oU]] (espeak's ASCII phoneme alphabet).
import { decodeWav } from '../dsp.js';

export const meta = {
  id: 'espeak', name: 'espeak (meSpeak.js)', license: 'GPL-3.0', commercial: 'conditional',
  licenseNote: 'GPL-3.0: a shipped game that bundles it must be GPL-compatible (or swap engines before release). Fine for prototypes.',
  offline: true, size: '2.4 MB', quality: 'Robotic-formant, intelligible. The classic "computer voice".',
  crowd: 'Very cheap. Synthesizes faster than real time; pre-render lines to buffers and play dozens at once.',
  pros: ['Real timbre knobs (8 formants, breath, roughness, flutter, intonation)', 'Accents: US, UK-RP, Scottish, Northern, West Midlands', 'Phoneme input for invented words', 'Deterministic: same settings → same audio', 'Tiny, offline, fast'],
  cons: ['GPL license', 'Sounds robotic (that is also its charm)', 'English dictionary from 2013-era espeak'],
  knobs: ['pitch', 'speed', 'depth', 'tone', 'breath', 'rough', 'flutter', 'intonation', 'wordgap', 'gender', 'accent', 'variant'],
  supportsPhonemes: true, yieldsBuffer: true,
};

const BASE = new URL('../../../vendor/mespeak/', import.meta.url).href;
let loading = null, loadedVoice = null;

function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('failed ' + src)); document.head.append(s); }); }

export function load() {
  if (loading) return loading;
  loading = (async () => {
    if (!window.meSpeak) await loadScript(BASE + 'mespeak.js');
    meSpeak.loadConfig(BASE + 'mespeak_config.json'); // its callback is unreliable; poll instead
    for (let i = 0; i < 200 && !meSpeak.isConfigLoaded(); i++) await new Promise(r => setTimeout(r, 50));
    if (!meSpeak.isConfigLoaded()) throw new Error('meSpeak config failed to load');
    await ensureAccent('en-us');
  })();
  return loading;
}

export const ACCENTS = [
  { value: 'en-us', label: 'American (en-us)' }, { value: 'en', label: 'British (en)' }, { value: 'en-rp', label: 'Received Pronunciation (en-rp)' },
  { value: 'en-sc', label: 'Scottish (en-sc)' }, { value: 'en-n', label: 'Northern English (en-n)' }, { value: 'en-wm', label: 'West Midlands (en-wm)' },
];
export const VARIANTS = ['custom', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'f1', 'f2', 'f3', 'f4', 'f5', 'croak', 'whisper', 'whisperf', 'klatt', 'klatt2', 'klatt3'];

const accentsLoaded = new Set();
async function ensureAccent(id) {
  if (accentsLoaded.has(id)) return;
  await new Promise((res, rej) => meSpeak.loadVoice(BASE + 'voices/' + id + '.json', (ok) => ok ? res() : rej(new Error('voice load failed ' + id))));
  accentsLoaded.add(id);
}
/** meSpeak registers voices under "en/<id>" (the voice_id inside the JSON). */
function voiceId(accent) { return 'en/' + accent;
}

/**
 * Build an espeak voice-variant file from the generic knobs. Ranges documented in README.
 * depth: 0 = small vocal tract (child), 1 = huge (giant). tone: 0 = dull/muffled, 1 = bright/harsh.
 */
export function buildVariant(v) {
  const depth = v.depth ?? 0.5, tone = v.tone ?? 0.5, breath = v.breath ?? 0, rough = v.rough ?? 0, flutter = v.flutter ?? 0.1;
  const fscale = Math.round(125 - depth * 50);           // formant frequency %, 125 (tiny) .. 75 (deep)
  const hiStrength = Math.round(40 + tone * 120);         // upper formant strength %
  const loStrength = Math.round(120 - tone * 40);         // lower formant strength %
  const gender = v.gender === 'f' ? 'female' : v.gender === 'n' ? 'male' : 'male';
  const pitchLine = v.gender === 'f' ? 'pitch 140 200' : v.gender === 'n' ? 'pitch 105 160' : 'pitch 82 118';
  const b = Math.round(breath * 10);
  const lines = ['language variant', 'name custom', `gender ${gender}`, pitchLine];
  for (let i = 0; i <= 8; i++) {
    const strength = i <= 1 ? loStrength : i <= 3 ? 100 : hiStrength;
    lines.push(`formant ${i} ${fscale} ${strength} ${i === 0 ? 100 : 100 + Math.round((tone - 0.5) * 40)}`);
  }
  if (b > 0) { lines.push(`breath 0 ${b} ${b} ${b} ${b} ${b} ${b} ${b}`); lines.push('breathw 150 150 200 200 400 400'); }
  lines.push(`roughness ${Math.round(rough * 7)}`);
  lines.push(`flutter ${Math.round(flutter * 20)}`);
  lines.push(`intonation ${Math.min(4, Math.max(1, Math.round(v.intonation ?? 2)))}`);
  if (v.voicing != null) lines.push(`voicing ${Math.round(40 + v.voicing * 120)}`);
  lines.push(`consonants ${Math.round(80 + tone * 70)} ${Math.round(80 + tone * 70)}`);
  return lines.join('\n') + '\n';
}

/** Variant files cannot be overwritten in meSpeak's in-memory FS, so each distinct knob set gets a content-hashed name. */
function registerVariant(text) {
  let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return meSpeak.addVariant('k' + (h >>> 0).toString(36), text);
}

/** Map generic knobs to espeak CLI options. */
export function mapKnobs(v) {
  return {
    pitch: Math.round((v.pitch ?? 0.5) * 99),                 // 0..99
    speed: Math.round(80 + (v.speed ?? 0.3) * 320),          // 80..400 words per minute
    wordgap: Math.round((v.wordgap ?? 0) * 20),               // units of 10 ms
    amplitude: 100,
  };
}

/** Synthesize. Returns { samples, sampleRate, info }. Text may include [[phonemes]]. */
export async function synth(text, v) {
  await load();
  const accent = v.accent || 'en-us'; await ensureAccent(accent);
  const variant = v.variant && v.variant !== 'custom' ? v.variant : registerVariant(buildVariant(v));
  const opts = { ...mapKnobs(v), voice: voiceId(accent), variant, rawdata: 'array' };
  const t0 = performance.now();
  const arr = meSpeak.speak(text, opts);
  if (!arr) throw new Error('meSpeak returned nothing (not loaded?)');
  const { samples, sampleRate } = decodeWav(Uint8Array.from(arr));
  return { samples, sampleRate, info: { engine: 'espeak', ms: performance.now() - t0, opts: { ...opts, rawdata: undefined }, variantText: variant.startsWith('k') ? buildVariant(v) : `built-in ${variant}` } };
}
