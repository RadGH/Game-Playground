// Character looks. The wire carries only `{ race, cls, seed }` for a player (a few bytes); every client
// builds the same Chibi 2 avatar from it: a race-weighted random face and body (avatar-3d's
// randomChibi2, the generator Farhold's Randomise button uses), dressed in the class outfit
// (avatar-3d/data/class-outfits.json). Same input -> same look on every screen.

import { randomAvatar, makeRng } from '../../../../avatar-2d/js/random.js';
import { partIds } from '../../../../avatar-2d/js/parts/index.js';
import { randomChibi2, CHIBI2_RACES } from '../../../../avatar-3d/js/chibi2-races.js';
import { loadClassOutfits, dressAs } from '../../../../avatar-3d/js/class-outfits.js';
import { randomCreature } from '../../../../avatar-3d/js/creatures.js';

export const PLAYABLE_RACES = ['human', 'elf', 'dwarf', 'halfling'];
export const RACE_NAMES = Object.fromEntries(PLAYABLE_RACES.map(r => [r, CHIBI2_RACES[r]?.name?.replace(/^Chibi 2 /, '') || r]));

let presets = null, outfits = null;
export async function loadLookData() {
  if (!presets) presets = fetch(new URL('../../../../avatar-2d/data/presets.json', import.meta.url)).then(r => r.json());
  if (!outfits) outfits = loadClassOutfits();
  const [p, o] = await Promise.all([presets, outfits]);
  return { presets: p, outfits: o };
}

/** The avatar JSON for a player look. Cached by key: a crowd of the same class+seed builds once. */
const cache = new Map();
export async function avatarFor(look) {
  const race = PLAYABLE_RACES.includes(look?.race) ? look.race : 'human';
  const cls = look?.cls || 'warrior';
  const seed = (look?.seed >>> 0) || 1;
  const key = `${race}|${cls}|${seed}`;
  if (cache.has(key)) return cache.get(key);
  const { presets: data, outfits: o } = await loadLookData();
  const base = randomChibi2(randomAvatar, data, { race, seed, makeRng, known: (slot, id) => partIds(slot).includes(id) });
  const outfit = o[cls] || o.warrior;
  const a = outfit ? dressAs(base, outfit) : base;
  cache.set(key, a);
  return a;
}

/** A creature spec from what the server sent: `{ type, size, seed }` (+ optional colours). */
export function creatureFor(spec) {
  const type = spec?.type || 'wolf';
  const c = randomCreature(type, (spec?.seed >>> 0) || 1);
  if (spec?.size) c.size = +(c.size * spec.size).toFixed(2);
  if (spec?.colors) c.colors = { ...c.colors, ...spec.colors };
  return c;
}
