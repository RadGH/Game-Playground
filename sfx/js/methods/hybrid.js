// Method "hybrid": use the recording, and fall back to our synthesizer only if a file fails to load.
// This is the default in a game. Since 2026-10-29 every id has a recording (see library.js), so the
// synth is a safety net, not half the mix.
import * as library from './library.js';
import * as synth from './synth.js';

export const meta = {
  id: 'hybrid',
  name: 'Hybrid (samples + synth)',
  license: 'CC0 samples + our synth',
  licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  badge: 'CC0 + ours',
  pros: ['Full catalog coverage with the best source for each sound', 'Real recordings where they exist, synthesis where they do not', 'One switch away from pure synth if the pack is dropped'],
  cons: ['Two sources means two characters in one mix — the normalizer matters most here', 'Still ships the sample pack'],
};

/** Hybrid covers whatever either of its two halves covers, which is everything. */
export function has(entry) { return library.has(entry) || synth.has(entry); }

/** Which half will actually make this sound. */
export function sourceFor(entry) { return library.has(entry) ? 'library' : 'synth'; }

export async function render(entry, opts = {}) {
  if (library.has(entry)) {
    try { return { ...(await library.render(entry, opts)), via: 'library' }; }
    catch (e) { console.warn('[sfx] sample for', entry.id, 'failed, synthesizing instead:', e.message); }
  }
  return { ...(await synth.render(entry, opts)), via: 'synth' };
}
