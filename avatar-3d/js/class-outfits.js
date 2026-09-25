// Class outfits for Chibi 2 — clothes, headwear and carried items for each of the 30 classes, kept
// apart from faces and bodies so any game can dress any body as any class.
//
//   import { loadClassOutfits, dressAs } from '../../avatar-3d/js/class-outfits.js';
//   const outfits = await loadClassOutfits();              // avatar-3d/data/class-outfits.json
//   const look = dressAs(myAvatar, outfits.fighter);       // a NEW avatar; myAvatar is untouched
//   const look2 = dressAs(myAvatar, outfits.mage, { hands: false });   // clothes only
//
// No Three.js here, so node tests and non-3D tools can read it.

export const OUTFIT_SLOTS = ['hat', 'top', 'bottom', 'shoes', 'cape', 'decor', 'held', 'offhand'];
const HAND_SLOTS = new Set(['held', 'offhand']);
const clone = v => JSON.parse(JSON.stringify(v));

/** The outfit table, keyed by class id. Never throws: a failed fetch gives an empty table. */
export async function loadClassOutfits(url = new URL('../data/class-outfits.json', import.meta.url).href) {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()).classes || {}) : {};
  } catch { return {}; }
}

/**
 * A copy of `avatar` wearing `outfit`. Only the slots the outfit names are replaced; a class that
 * lists just a hat (the shaman) keeps everything else it had. `hands: false` leaves `held` and
 * `offhand` alone, for a game that draws the hands from real equipment.
 */
export function dressAs(avatar, outfit, { hands = true } = {}) {
  const out = clone(avatar || {});
  for (const slot of OUTFIT_SLOTS) {
    if (!outfit?.[slot]) continue;
    if (!hands && HAND_SLOTS.has(slot)) continue;
    out[slot] = clone(outfit[slot]);
  }
  return out;
}
