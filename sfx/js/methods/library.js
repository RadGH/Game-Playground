// Method "library": real recorded samples.
//
// Since 2026-10-29 every catalog id has recordings: sfx/assets/fs/ holds CC0 (public domain)
// recordings from freesound.org, each with a `<file>.json` credit beside it, fetched and trimmed by
// sfx/tools/freesound.py and mapped to ids in sfx/data/recordings/*.json; sfx/assets/kenney/ holds the
// three Kenney CC0 packs still used for a few clicks and footsteps. Credits for all of them are in
// sfx/data/credits.json (sfx/tools/build-credits.mjs) and shown by shared/credits.js.

export const meta = {
  id: 'library',
  name: 'Recordings (freesound + Kenney, CC0)',
  license: 'CC0 1.0 — public domain, commercial use fine',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  badge: 'CC0',
  pros: ['Real recordings for every sound in the catalog', 'Public domain: no fee; authors credited anyway on the credits page', 'Cheap at runtime — decode once and replay'],
  cons: ['Ships a few MB of audio files, fetched the first time each sound plays', 'Variety is limited to the 1-3 takes mapped per id (plus a small pitch wobble)'],
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
