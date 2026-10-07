// Parts added for Chibi 2's 2026-09-24 overhaul, registered here so the shared `normalizeAvatar`
// keeps them (it throws any id it has never heard of back to the slot default — which is how Farhold,
// which normalises every look before building it, would otherwise lose a gambeson or a second sword).
//
// Most draw the nearest existing 2D art under the new name (the 3D models are the new part); a few are
// drawn. Off-hand WEAPONS reuse the main-hand drawing, moved to the left hand, so a character with a
// sword in each hand shows two swords in the portrait too.
import { top, bottom, shoes } from './clothes.js';
import { cape, held, offhand as offhandCatalog } from './gear.js';
import { accessory } from './accessories.js';
import { G5_TABLES } from '../../../avatar-3d/js/chibi2-gear5-ids.js';
const offhandCat = () => offhandCatalog;
import { hat } from './accessories.js';
import { decor } from './decor.js';
import { facialHair } from './face.js';

const alias = (catalog, from, name) => ({ name, alias: from, get pieces() { return catalog[from].pieces; } });
/** The main-hand drawing of `from`, moved across to the left hand (x 212 → 88) on the off-hand layer. */
const offWeapon = (from, name) => ({
  name: name + ' (off hand)', alias: from,
  get pieces() { return (held[from]?.pieces || []).filter(p => p.layer === 'held').map(p => ({ layer: 'offhand', svg: `<g transform="translate(-124 0)">${p.svg}</g>` })); },
});

export const CHIBI2_2D = {
  // 2026-09-25 class headwear: the 3D models are in avatar-3d/js/chibi2-hats.js (great_helm and
  // plate_helm already had 2D art and only needed a 3D model, so they are not listed here)
  hat: {
    war_helm: alias(hat, 'helmet', "Warrior's helm (nasal and cheek guards)"),
    wolf_helm: alias(hat, 'hood', 'Wolf helm'),
    bone_headdress: alias(hat, 'feather_band', 'Feathered headdress'),
    rune_helm: alias(hat, 'helmet', "Runesmith's helm"),
    tricorn: alias(hat, 'wide_brim', 'Tricorn'),
  },
  top: {
    gi: alias(top, 'sash_robe', 'Fitted wrap jacket (gi)'),
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
    // play-test 4 (S18): tier-2 class armour kits, 3D models in avatar-3d/js/chibi2-armour2.js (2D draws the nearest kin)
    t2_pauldrons: alias(decor, 'pauldrons', 'Tier 2: crested plate pauldrons and gorget'),
    t2_mantle: alias(decor, 'rune_halo', 'Tier 2: high-collared mantle and stole'),
    t2_harness: alias(decor, 'knife_rig', 'Tier 2: great pauldron, baldric and bracers'),
    t2_vestments: alias(decor, 'tabard', 'Tier 2: long tabard and shoulder caps'),
    t2_wildmantle: alias(decor, 'bone_charms', 'Tier 2: horned fur mantle'),
  },
  facialHair: {
    braided_beard: alias(facialHair, 'long', 'Braided beard'),
  },
  // play-test 4 (S17): Thousandvale's new weapon silhouettes (3D in avatar-3d/js/chibi2-weapons.js); 2D draws the nearest kin
  held: {
    tv_scimitar: alias(held, 'fh_sabre', 'Scimitar'),
    tv_warpick: alias(held, 'fh_greataxe', 'War pick (two-handed)'),
    tv_club: alias(held, 'fh_mace', 'Spiked club'),
    tv_glaive: alias(held, 'fh_javelin', 'Glaive'),
  },
  offhand: Object.fromEntries([
    'sword', 'rapier', 'saber', 'cleaver', 'hammer', 'mace', 'greatsword', 'greataxe', 'warhammer',
    'fh_sword', 'fh_longsword', 'fh_sabre', 'fh_rapier', 'fh_axe', 'fh_hammer', 'fh_mace', 'fh_scepter',
    'fh_greatsword', 'fh_greataxe', 'fh_maul', 'fh_dagger',
  ].filter(id => held[id]).map(id => [id, offWeapon(id, held[id].name || id)])),
};
// play-test 4: a second WAND in the off hand (S15), the new weapons as second weapons, and two caster foci (S17)
Object.assign(CHIBI2_2D.offhand, {
  ...(held.fh_wand ? { fh_wand: offWeapon('fh_wand', 'Wand') } : {}),
  ...(held.fh_javelin ? { fh_javelin: offWeapon('fh_javelin', 'Javelin') } : {}),
  tv_scimitar: offWeapon('fh_sabre', 'Scimitar'),
  tv_club: offWeapon('fh_mace', 'Spiked club'),
  tv_ward: { name: 'Warded focus', alias: 'orb', get pieces() { return offhandCat().orb?.pieces || []; } },
  tv_totem: { name: 'Totem', alias: 'idol', get pieces() { return offhandCat().idol?.pieces || []; } },
});

// PLAY-TEST 5 (T23): the g5_ models (3D in avatar-3d/js/chibi2-gear5-*.js, listed in chibi2-gear5-ids.js). The
// paper doll draws each one's nearest kin (`alias2d`); a one-handed g5_ weapon is also an off-hand part (dual wield).
{
  const cats = { top, bottom, shoes, cape, decor, hat, held, offhand: offhandCatalog, accessory };
  for (const t of G5_TABLES) {
    if (t.field) continue;                          // gloves and rings ride an extra field: nothing to register
    CHIBI2_2D[t.slot] = CHIBI2_2D[t.slot] || {};
    for (const [id, row] of Object.entries(t.table)) {
      const from = row.alias2d;
      CHIBI2_2D[t.slot][id] = { name: row.name, alias: from, get pieces() { return cats[t.slot][from]?.pieces || []; } };
      if (t.slot === 'held' && row.hands === 1 && !['caster', 'none', 'crossbow', 'staff'].includes(row.hold)) {
        CHIBI2_2D.offhand[id] = offWeapon(from, row.name);
      }
    }
  }
}

// PLAY-TEST 5 (T7: "the 2x 2h perk must allow two two-handers to be equipped" — and be SEEN): every two-hander is an
// off-hand part too — war picks, polearms, quarterstaves, the caster staves and the two-handed g5_ models. Until now
// the normaliser threw a second halberd or staff back to "nothing in the off hand" (greatswords, greataxes and mauls
// were already listed). New ids only; nothing that exists changes.
{
  const kin = { tv_warpick: 'fh_greataxe', tv_glaive: 'fh_javelin' };
  for (const id of ['tv_warpick', 'tv_glaive', 'fh_halberd', 'fh_spear', 'fh_quarterstaff', 'quarterstaff', 'staff_orb', 'staff_skull', 'staff_crook', 'staff_crystal', 'staff_totem']) {
    const from = held[id] ? id : kin[id];
    if (from && held[from] && !CHIBI2_2D.offhand[id] && !offhandCatalog[id]) CHIBI2_2D.offhand[id] = offWeapon(from, held[id]?.name || CHIBI2_2D.held[id]?.name || id);
  }
  const G5_HELD_TABLE = G5_TABLES.find(t => t.slot === 'held' && !t.field)?.table || {};
  for (const [id, row] of Object.entries(G5_HELD_TABLE)) {
    if (row.hands === 2 && !row.bow && !['caster', 'none', 'crossbow'].includes(row.hold) && !CHIBI2_2D.offhand[id]) CHIBI2_2D.offhand[id] = offWeapon(row.alias2d, row.name);
    if (row.hands === 1 && row.hold === 'staff' && !CHIBI2_2D.offhand[id]) CHIBI2_2D.offhand[id] = offWeapon(row.alias2d, row.name);
  }
}
