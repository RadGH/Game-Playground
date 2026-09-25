// Farhold R26 — the four playable bodies: Human, Elf, Dwarf, Halfling.
//
// "Add human/elf/dwarf/halfling options to 'Body' presets in the character editor of Farhold."
//
// Chibi 2 has nine races (avatar-3d/js/chibi2-races.js). Four of them are people you can play; the
// other five (orc, giant, goblin, undead, beastkin) are the enemy warbands (js/warbands.js). A race
// is a PARAMETER SET on the one Chibi 2 body, stored at `avatar.body.race`, so a preset here is
// nothing more than "stamp the race, and move the sliders to where that race sits":
//
//   applyBodyPreset(avatar, 'dwarf')  →  a NEW avatar (the input is not touched) with
//     body.race      'dwarf'
//     body.height    the middle of the race's height range   (a dwarf 0.18, an elf 0.78)
//     body.width     the middle of its build range
//     body.headSize  the middle of its head-size range
//     body.round     the race's own roundness                (a dwarf 0.45, an elf 0)
//     body.skin      kept if it is one of the race's skins, else the race's second skin
//     ears / beard   swapped only when the current pick is one the race almost never has — an elf
//                    loses a goatee, a dwarf with no beard gets one; a human with a beard keeps it
//
// Everything else — the face you built, the hair, the clothes — stays exactly as it was, because a
// body preset that threw away ten minutes of face-building would be a trap.
//
// Pure: no DOM, no Three.js, so the node tests call it directly.

import { CHIBI2_RACES } from '../../../avatar-3d/js/chibi2-races.js';

/** The races a player may be, in the order the buttons show them. */
export const PLAYABLE_RACES = ['human', 'elf', 'dwarf', 'halfling'];

/** A pick whose weight is under this share of the race's favourite is "one the race almost never has". */
const RARE_SHARE = 0.15;

const mid = ([lo, hi]) => +((lo + hi) / 2).toFixed(2);

/** The id a race's weight table likes best (first one wins a tie, so it is stable). */
function favourite(weights) {
  let best = null, top = -1;
  for (const [id, w] of Object.entries(weights || {})) if (w > top) { best = id; top = w; }
  return best;
}

/**
 * Put a race's body on an avatar. Returns a new avatar; unknown races fall back to human.
 * `avatar` may be null (the class look has not loaded) — a bare body is made.
 */
export function applyBodyPreset(avatar, raceId) {
  const id = CHIBI2_RACES[raceId] ? raceId : 'human';
  const race = CHIBI2_RACES[id];
  const out = JSON.parse(JSON.stringify(avatar || {}));
  out.body = { ...(out.body || {}) };
  out.body.race = id;
  out.body.height = mid(race.ranges.height);
  out.body.width = mid(race.ranges.width);
  out.body.headSize = mid(race.ranges.headSize);
  out.body.round = race.body.round;
  const skin = String(out.body.skin || '').toLowerCase();
  if (!race.skin.some(s => s.toLowerCase() === skin)) out.body.skin = race.skin[Math.min(1, race.skin.length - 1)];
  for (const slot of ['ears', 'facialHair']) {
    const weights = race.weights?.[slot];
    if (!weights) continue;
    const cur = out[slot]?.id ?? (slot === 'facialHair' ? 'none' : 'normal');
    const top = Math.max(...Object.values(weights));
    if ((weights[cur] || 0) < top * RARE_SHARE) out[slot] = { ...(out[slot] || {}), id: favourite(weights) };
  }
  return out;
}

/** Which preset an avatar currently matches, for lighting the button — null when it is none of them. */
export function presetOf(avatar) {
  const r = avatar?.body?.race || 'human';
  return PLAYABLE_RACES.includes(r) ? r : null;
}
