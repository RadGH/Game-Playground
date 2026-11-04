// Which Chibi Thousandvale draws people with — THE one switch. 2.6 is the default; query values retain comparisons.
//
// Every humanoid body in the game (players incl. old saved characters, townsfolk, guards, humanoid monsters and
// warbands, the title-screen figure, the creation preview, static portraits, the mannequin that wears armour icons) is
// built through `createTvBody` here, which asks avatar-3d's chibi2.js for a Chibi 2.6 body (`{ v25: true, v26: true }` —
// the look itself is not changed, so the wire, the saves and the look caches stay as they were. `?chibi=2.5` selects
// the prior version; `?chibi=2` selects the original body for comparison.
//
// Building is also SLICED here: `prepareChibi2` bakes a new template a few clips at a time and gives the thread back in
// between (a robed template is ~80-150 ms of clip baking, the skirt drive runs on every baked frame), so the
// stand-in -> body swap never holds the main thread in one long task. A cached look skips straight to the build.
//
//   import { createTvBody, CHIBI_V } from './chibi-version.js';
//   const body = await createTvBody(avatar, { anims });          // same options as createChibi2Character

import { createChibi2Character, prepareChibi2 } from '../../../../avatar-3d/js/chibi2.js';
import { dropRetired } from './retired-parts.js';      // #77

/** Chibi version from a page's query string (pure — exported for tests). */
export function chibiVersion(search = '') {
  const q = String(search || '');
  if (/(?:^|[?&])chibi=2(?:&|$)/.test(q)) return 2;
  if (/(?:^|[?&])chibi=2\.5(?:&|$)/.test(q)) return 2.5;
  return 2.6;
}
export const CHIBI_V = chibiVersion(typeof location !== 'undefined' ? location.search : '');
/** createChibi2Character options with the version switch applied (pure — exported for tests). */
export const tvChibiOpts = (opts = {}, v = CHIBI_V) => v >= 2.6
  ? { ...opts, v25: true, v26: true }
  : v >= 2.5 ? { ...opts, v25: true } : { ...opts };

// KESTREL (batch 1, 2026-10-27): `?chars=kestrel` draws every humanoid with the Kestrel kit body (chars-mode.js,
// kestrel-body.js). Anything else = Chibi 2.5 exactly as before (the kit is never even loaded). Batch 5: the item icons'
// shop mannequin is a Kestrel mannequin under the switch too (kestrel-body.js `mannequin`, ui/item-icons.js).
import { CHARS, KESTREL, charsMode } from './chars-mode.js';
export { CHARS, KESTREL, charsMode };

const breathe = () => new Promise(r => setTimeout(r, 0));
/** A Chibi body for Thousandvale: the template baked in slices (no long task), then built from the cache. */
export async function createTvBody(avatar, opts = {}) {
  avatar = dropRetired(avatar);      // play-test 12 (#77): a monster's designed look or an old save may still name a blindfold
  if (KESTREL) return (await import('./kestrel-body.js')).createKestrelTvBody(avatar, { ...opts, slice: opts.slice || breathe });   // batch 5: the icon mannequin too
  const o = tvChibiOpts(opts);
  if (opts.trace == null) { try { await prepareChibi2(avatar, { ...o, slice: opts.slice || breathe, budget: opts.budget ?? 10 }); } catch { /* the build below reports it */ } }
  return createChibi2Character(avatar, o);
}
