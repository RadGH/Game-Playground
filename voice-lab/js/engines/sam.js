// SAM — Software Automatic Mouth (Commodore 64, 1982) JS port. NO LICENSE (abandonware). Prototype-only.
export const meta = {
  id: 'sam', name: 'SAM (1982 retro)', license: 'none (abandonware)', commercial: 'no',
  licenseNote: 'Reverse-engineered commercial software with no license grant. Legally murky — do not ship. Kept here for comparison and because it is charming.',
  offline: true, size: '110 KB', quality: '8-bit C64 robot. Very retro.',
  crowd: 'Near-zero CPU. Hundreds of voices at once are fine.',
  pros: ['Instant, tiny', 'Four knobs (pitch, speed, mouth, throat) give a wide range of creatures', 'Phonetic input', 'Sing mode (flat pitch per phoneme)'],
  cons: ['No license — cannot be used commercially', '22 kHz 8-bit character; unintelligible at extremes', 'English only'],
  knobs: ['pitch', 'speed', 'depth', 'tone', 'sing'], supportsPhonemes: true, yieldsBuffer: true,
};
let SamJs = null;
export async function load() { if (!SamJs) SamJs = (await import('../../../vendor/sam/samjs.esm.js')).default; }

/** Generic knobs → SAM 0..255 values. SAM's pitch/speed are inverted (lower value = higher/faster). */
export function mapKnobs(v) {
  return {
    pitch: Math.round(120 - (v.pitch ?? 0.5) * 100),   // 0.5 → 70 (SAM default 64); above ~120 SAM turns into a buzz
    speed: Math.round(180 - (v.speed ?? 0.5) * 160),   // 0.5 → 100, 0.67 → 73 (SAM default 72)
    throat: Math.round((1 - (v.depth ?? 0.5)) * 255),   // SAM: higher throat = higher formant 1, so deep voices need LOW throat
    mouth: Math.round((v.tone ?? 0.5) * 255),
    singmode: !!v.sing,
  };
}
export async function synth(text, v) {
  await load();
  const opts = mapKnobs(v), t0 = performance.now();
  const sam = new SamJs(opts);
  const phonetic = /^\s*\[\[.*\]\]\s*$/.test(text);
  const clean = phonetic ? text.replace(/^\s*\[\[|\]\]\s*$/g, '') : text;
  // this build of sam-js logs every text→phoneme rule unconditionally; mute console.log while it runs
  const log = console.log; console.log = () => {};
  let samples; try { samples = sam.buf32(clean, phonetic); } finally { console.log = log; }
  return { samples, sampleRate: 22050, info: { engine: 'sam', ms: performance.now() - t0, opts } };
}
