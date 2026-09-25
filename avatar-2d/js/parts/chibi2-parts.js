// Parts added for Chibi 2's 2026-09-24 overhaul, registered here so the shared `normalizeAvatar`
// keeps them (it throws any id it has never heard of back to the slot default — which is how Farhold,
// which normalises every look before building it, would otherwise lose a gambeson or a second sword).
//
// Most draw the nearest existing 2D art under the new name (the 3D models are the new part); a few are
// drawn. Off-hand WEAPONS reuse the main-hand drawing, moved to the left hand, so a character with a
// sword in each hand shows two swords in the portrait too.
import { top, bottom, shoes } from './clothes.js';
import { cape, held } from './gear.js';
import { decor } from './decor.js';
import { facialHair } from './face.js';

const alias = (catalog, from, name) => ({ name, alias: from, get pieces() { return catalog[from].pieces; } });
/** The main-hand drawing of `from`, moved across to the left hand (x 212 → 88) on the off-hand layer. */
const offWeapon = (from, name) => ({
  name: name + ' (off hand)', alias: from,
  get pieces() { return (held[from]?.pieces || []).filter(p => p.layer === 'held').map(p => ({ layer: 'offhand', svg: `<g transform="translate(-124 0)">${p.svg}</g>` })); },
});

export const CHIBI2_2D = {
  top: {
    travel_shirt: alias(top, 'tshirt', 'Travel shirt (rolled sleeves)'),
    gambeson: alias(top, 'leather', 'Quilted gambeson'),
  },
  bottom: {
    breeches: alias(bottom, 'shorts', 'Breeches and stockings'),
    leggings: alias(bottom, 'pants', 'Leggings'),
  },
  shoes: {
    shoes: alias(shoes, 'sneakers', 'Plain shoes'),
    wraps: alias(shoes, 'sandals', 'Foot wraps'),
  },
  cape: {
    travel_cloak: alias(cape, 'cape', 'Travel cloak (hood down)'),
    tattered_cape: alias(cape, 'cape', 'Tattered cape'),
  },
  decor: {
    belt_pouches: alias(decor, 'herb_satchel', 'Belt pouches'),
    bedroll_pack: alias(decor, 'gear_pack', 'Bedroll pack'),
    waterskin: alias(decor, 'herb_satchel', 'Waterskin'),
    trophy_belt: alias(decor, 'bone_charms', 'Trophy belt'),
  },
  facialHair: {
    braided_beard: alias(facialHair, 'long', 'Braided beard'),
  },
  offhand: Object.fromEntries([
    'sword', 'rapier', 'saber', 'cleaver', 'hammer', 'mace', 'greatsword', 'greataxe', 'warhammer',
    'fh_sword', 'fh_longsword', 'fh_sabre', 'fh_rapier', 'fh_axe', 'fh_hammer', 'fh_mace', 'fh_scepter',
    'fh_greatsword', 'fh_greataxe', 'fh_maul', 'fh_dagger',
  ].filter(id => held[id]).map(id => [id, offWeapon(id, held[id].name || id)])),
};
