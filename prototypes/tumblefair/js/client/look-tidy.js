// Friendlier random looks (owner 2026-10-22: "the randomize button … gives you random EVERYTHING, dirt on your face,
// freckles… Can we have a weighted system so that it's more likely to pick None for those optional features — and lower
// weights for anything ugly, unusual"). The shared seeded random face (avatar-2d randomAvatar, used by other games too)
// is left alone; Tumblefair tidies its result here, from the same seed, so a look is still just { race, seed }:
//   * a part the look editor does not offer (e.g. 2.5's removed 'soot', 'dirt', 'mud') becomes the slot's default, so
//     what you see on the character is always something the editor can show and change;
//   * optional extras (face marks, glasses and other accessories, beards) are usually 'none';
//   * unusual picks (angry or hollow eyes, fangs, a bald or tonsure cut…) are mostly swapped for an everyday one.
// Choices the player made in the editor (`look.custom`) are laid on AFTER this, so they always win.
// Also PRESETS: ready-made faces for the editor's "Quick looks" row. Pure (no DOM, no Three.js).
import { FACE_SLOTS } from '../../../thousandvale/js/client/ui/appearance-core.js';
import { makeRng } from '../../../../avatar-2d/js/random.js';

const OFFERED = Object.fromEntries(FACE_SLOTS.map(s => [s.slot, s.ids]));
/** slot -> [chance the slot is left empty, { id: weight } of everyday picks]. Ids the editor lacks are skipped. */
const TIDY = {
  extras: [0.86, { freckles: 3, blush: 4, freckles_nose: 2, beauty_mark: 1, blush_soft: 3 }],
  accessory: [0.84, { glasses: 3, round_glasses: 3, earrings: 3, sunglasses: 1, pendant: 1, scarf: 1 }],
  facialHair: [0.72, { stubble: 3, mustache: 2, short_beard: 3, full: 2, goatee: 1 }],
};
/** slot -> [chance an unusual pick is swapped, everyday picks]. Anything not listed as everyday counts as unusual. */
const EVERYDAY = {
  hair: [0.75, { short: 4, side_part: 3, bangs: 3, bob: 3, long: 3, wavy: 3, ponytail: 3, bun: 2, curly: 3, afro: 2, braids: 2, pixie: 2, spiky: 2, buns: 2, twin_tails: 1, messy: 2, half_up: 2, wolf_cut: 1, curly_bob: 2, high_ponytail: 2, puff: 1 }],
  eyes: [0.8, { round: 4, almond: 4, happy: 3, wide: 2, anime: 2, doe: 2, sparkle: 1, storybook: 2, button: 1 }],
  brows: [0.8, { straight: 4, arched: 4, thick: 2, thin: 2, soft: 3, raised: 1, curved: 2 }],
  mouth: [0.8, { smile: 5, grin: 3, neutral: 2, smirk: 2, laugh: 1 }],
  nose: [0.6, { small: 4, button: 3, dot: 2, upturned: 2, round: 2 }],
};
function weighted(rng, table, offered) {
  const rows = Object.entries(table).filter(([id]) => offered.includes(id));
  if (!rows.length) return null;
  let r = rng() * rows.reduce((t, [, w]) => t + w, 0);
  for (const [id, w] of rows) { r -= w; if (r <= 0) return id; }
  return rows[rows.length - 1][0];
}
/** The avatar with a friendlier face, decided by the look's seed (same seed = same result on every phone). */
export function tidyFace(av, seed) {
  const rng = makeRng(((seed >>> 0) ^ 0x5eed7) >>> 0), out = { ...av };
  for (const [slot, [empty, table]] of Object.entries(TIDY)) {
    const offered = OFFERED[slot] || [];
    const id = rng() < empty ? 'none' : weighted(rng, table, offered) || 'none';
    out[slot] = { ...(av[slot] || {}), id };
  }
  if (av.race === 'dwarf' && out.facialHair.id === 'none' && rng() < 0.7) out.facialHair = { ...out.facialHair, id: weighted(rng, { full: 3, braided_beard: 2, short_beard: 2, long: 1 }, OFFERED.facialHair) || 'full' };
  for (const [slot, [swap, table]] of Object.entries(EVERYDAY)) {
    const offered = OFFERED[slot] || [], id = av[slot]?.id;
    const odd = !offered.includes(id), unusual = !(id in table);
    if (odd || (unusual && rng() < swap)) out[slot] = { ...(av[slot] || {}), id: weighted(rng, table, offered) || offered[0] };
  }
  if (!OFFERED.headShape.includes(out.headShape)) out.headShape = 'round';
  if (av.ears?.id && !OFFERED.ears.includes(av.ears.id)) out.ears = { ...av.ears, id: 'normal' };
  return out;
}

const H = { black: '#111111', brown: '#3b2a1a', chestnut: '#6b4a2a', ginger: '#d94a2a', blond: '#d9c27a', platinum: '#f2e2b0', grey: '#888888', blue: '#4a3a8a' };
/** Ready-made faces for the editor (a custom blob each; the race, body and skin stay the player's own). */
export const PRESETS = [
  { id: 'sunny', name: 'Sunny', custom: { hair: { id: 'short', color: H.chestnut }, eyes: { id: 'happy' }, brows: { id: 'arched' }, mouth: { id: 'smile' }, facialHair: { id: 'none' }, accessory: { id: 'none' }, extras: { id: 'none' } } },
  { id: 'sporty', name: 'Sporty', custom: { hair: { id: 'ponytail', color: H.brown }, eyes: { id: 'almond' }, brows: { id: 'straight' }, mouth: { id: 'grin' }, facialHair: { id: 'none' }, accessory: { id: 'none' }, extras: { id: 'none' } } },
  { id: 'bookworm', name: 'Bookworm', custom: { hair: { id: 'bob', color: H.black }, eyes: { id: 'round' }, brows: { id: 'soft' }, mouth: { id: 'smirk' }, facialHair: { id: 'none' }, accessory: { id: 'round_glasses' }, extras: { id: 'none' } } },
  { id: 'freckles', name: 'Freckles', custom: { hair: { id: 'curly', color: H.ginger }, eyes: { id: 'round' }, brows: { id: 'arched' }, mouth: { id: 'smile' }, facialHair: { id: 'none' }, accessory: { id: 'none' }, extras: { id: 'freckles' } } },
  { id: 'cool', name: 'Cool', custom: { hair: { id: 'slicked', color: H.black }, eyes: { id: 'almond' }, brows: { id: 'straight' }, mouth: { id: 'smirk' }, facialHair: { id: 'none' }, accessory: { id: 'sunglasses' }, extras: { id: 'none' } } },
  { id: 'dreamer', name: 'Dreamer', custom: { hair: { id: 'wavy', color: H.blond }, eyes: { id: 'anime' }, brows: { id: 'soft' }, mouth: { id: 'smile' }, facialHair: { id: 'none' }, accessory: { id: 'none' }, extras: { id: 'blush' } } },
  { id: 'bearded', name: 'Bearded', custom: { hair: { id: 'side_part', color: H.brown }, eyes: { id: 'round' }, brows: { id: 'thick' }, mouth: { id: 'smile' }, facialHair: { id: 'full', color: H.brown }, accessory: { id: 'none' }, extras: { id: 'none' } } },
  { id: 'spiky', name: 'Spiky', custom: { hair: { id: 'spiky', color: H.blue }, eyes: { id: 'wide' }, brows: { id: 'raised' }, mouth: { id: 'grin' }, facialHair: { id: 'none' }, accessory: { id: 'none' }, extras: { id: 'none' } } },
  { id: 'buns', name: 'Twin Buns', custom: { hair: { id: 'buns', color: H.black }, eyes: { id: 'happy' }, brows: { id: 'arched' }, mouth: { id: 'smile' }, facialHair: { id: 'none' }, accessory: { id: 'earrings' }, extras: { id: 'none' } } },
  { id: 'silver', name: 'Silver Fox', custom: { hair: { id: 'short', color: H.grey }, eyes: { id: 'almond' }, brows: { id: 'thick' }, mouth: { id: 'smirk' }, facialHair: { id: 'stubble', color: H.grey }, accessory: { id: 'glasses' }, extras: { id: 'none' } } },
];
