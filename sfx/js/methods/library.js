// Method "library": real recorded samples from a CC0 pack.
//
// The pack vendored under sfx/assets/kenney/ is three of Kenney's CC0 audio sets (RPG Audio,
// Impact Sounds, Interface Sounds) — see sfx/assets/kenney/README.md for the download commands and
// the licence files that came in the zips. CC0 means public domain: usable in a commercial game
// with no credit required (crediting Kenney is still the decent thing to do).
//
// The pack does not cover everything. Fire, ice, shadow, holy, arcane, lightning and most statuses
// have no matching recording, so those catalog ids simply have no "library" block and `has()`
// answers false. That is what the "hybrid" method exists for.

export const meta = {
  id: 'library',
  name: 'Sample pack (Kenney CC0)',
  license: 'CC0 1.0 — public domain, commercial use fine',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  badge: 'CC0',
  pros: ['Recorded, so hits and interface clicks sound real', 'Public domain: no credit or fee required', 'Cheap at runtime — decode once and replay'],
  cons: ['Only covers about a third of the catalog (no spell elements, no ambience)', 'Ships ~3 MB of audio files', 'Every play of one id is the same recording unless variants are mapped'],
};

/** True when this catalog entry has files mapped to it. */
export function has(entry) { return !!(entry && entry.library && entry.library.files && entry.library.files.length); }

/** The file this seed picks — exported so the gallery can show which sample it played. */
export function fileFor(entry, seed = 1) {
  const files = entry.library.files;
  return files[Math.abs(seed | 0) % files.length];
}

/**
 * Fetch and decode one sample to mono.
 * @param {object} entry
 * @param {object} opts  { seed, base (url of sfx/), decode (fn: ArrayBuffer -> Promise<AudioBuffer>) }
 */
export async function render(entry, { seed = 1, base = './', decode = null, fetchFn = null } = {}) {
  if (!has(entry)) throw new Error('no library sample for ' + entry.id);
  if (!decode) throw new Error('library.render needs a decode() function');
  const file = fileFor(entry, seed);
  const url = new URL('assets/' + file, base).href;
  const res = await (fetchFn || fetch)(url);
  if (!res.ok) throw new Error('sample ' + file + ' failed to load (' + res.status + ')');
  const bytes = await res.arrayBuffer();
  const buf = await decode(bytes);
  // Downmix to mono: the mixer pans with a single StereoPanner, so a stereo source would fight it.
  const n = buf.length;
  const out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += ch[i];
  }
  if (buf.numberOfChannels > 1) for (let i = 0; i < n; i++) out[i] /= buf.numberOfChannels;
  return { samples: out, sampleRate: buf.sampleRate, file };
}
