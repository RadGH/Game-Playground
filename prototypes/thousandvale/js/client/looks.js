// Character looks. The wire carries only `{ race, cls, seed }` for a player (a few bytes); every client
// builds the same Chibi 2 avatar from it: a race-weighted random face and body (avatar-3d's
// randomChibi2, the generator Farhold's Randomise button uses), dressed in the class outfit
// (avatar-3d/data/class-outfits.json). Same input -> same look on every screen.

import { randomAvatar, makeRng } from '../../../../avatar-2d/js/random.js';
import { partIds } from '../../../../avatar-2d/js/parts/index.js';
import { randomChibi2, CHIBI2_RACES } from '../../../../avatar-3d/js/chibi2-races.js';
import { loadClassOutfits, dressAs } from '../../../../avatar-3d/js/class-outfits.js';
import { CREATURE_TYPES } from '../../../../avatar-3d/js/creature-types.js';

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
  // A full Chibi 2 avatar JSON (a later character editor may send one) is used as it is.
  if (look?.avatar) return look.avatar;
  if (look?.body && look?.headShape) return look;
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

/** The avatar-3d creature type for a server monster type id (a type with no body yet is drawn as a wolf). */
export function bodyTypeFor(type) { return MONSTER_BODIES[type] || (CREATURE_TYPES[type] ? type : 'wolf'); }

/** Monster type ids (server) whose avatar-3d body has a different name. */
export const MONSTER_BODIES = { grey_wolf: 'wolf', direwolf: 'dire_wolf', dire_wolf: 'dire_wolf' };

/** A stable look for a character that sent none (bots): human, seed from its id. */
export function defaultLook(charId, cls) {
  let h = 2166136261; for (const c of String(charId)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return { race: PLAYABLE_RACES[(h >>> 0) % 4], seed: (h >>> 0) || 1, cls };
}

/**
 * Monster looks by type id, from Farhold's bestiary (prototypes/farhold/data/enemies.json: enemies, bosses,
 * pets): `{ avatar }` = a Chibi 2 humanoid (brigands, cultists, knights), `{ creature }` = a beast spec.
 * Thousandvale-only monsters can add `data/monster-looks.json` ({ type: look }) later; it wins when present.
 */
let monsterLooks = null;
export function loadMonsterLooks() {
  if (!monsterLooks) monsterLooks = (async () => {
    const out = {};
    try {
      const d = await (await fetch(new URL('../../../farhold/data/enemies.json', import.meta.url))).json();
      for (const k of ['enemies', 'bosses', 'pets']) for (const e of d[k] || []) if (e.look) out[e.id] = e.look;
    } catch {}
    try { const r = await fetch(new URL('../../data/monster-looks.json', import.meta.url)); if (r.ok) Object.assign(out, await r.json()); } catch {}
    return out;
  })();
  return monsterLooks;
}
