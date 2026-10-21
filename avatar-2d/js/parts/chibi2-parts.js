// Parts added for Chibi 2's 2026-09-24 overhaul, registered here so the shared `normalizeAvatar`
// keeps them (it throws any id it has never heard of back to the slot default — which is how Farhold,
// which normalises every look before building it, would otherwise lose a gambeson or a second sword).
//
// Most draw the nearest existing 2D art under the new name (the 3D models are the new part); a few are
// drawn. Off-hand WEAPONS reuse the main-hand drawing, moved to the left hand, so a character with a
// sword in each hand shows two swords in the portrait too.
import { top, bottom, shoes } from './clothes.js';
import { cape, held, offhand as offhandCatalog, EXTRA_ACCESSORIES } from './gear.js';
import { accessory } from './accessories.js';
import { G5_TABLES } from '../../../avatar-3d/js/chibi2-gear5-ids.js';
import { OUTFIT25 } from '../../../avatar-3d/js/chibi25-outfits.js';
const offhandCat = () => offhandCatalog;
import { hat } from './accessories.js';
import { decor } from './decor.js';
import { facialHair, eyes, brows, nose, mouth, ears } from './face.js';
import { hair } from './hair.js';
import { extras } from './accessories.js';

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

// CHIBI 2.5 (2026-10-16, part A — the head): new face and hair ids. The 3D models are in avatar-3d/js/chibi25-face.js and
// chibi25-hair.js (a 2.5 look only: body.v = 2.5); the menu list is avatar-3d/js/chibi25-options.js. Every entry is
// `bespoke`, so the seeded 2D random roll (and every game's random NPCs built from it) never hands one out and stays
// exactly as it was. Face parts are a small drawing round the origin (left eye / brow, mouth, nose); hair, ears, beards
// and marks reuse the nearest 2D picture or draw a simple one.
{
  const E = 'var(--eye)', HD = 'var(--hair-dark)', HR = 'var(--hair)', MO = 'var(--mouth)', SD = 'var(--skin-dark)', X = 'var(--extra)', S = 'var(--skin)';
  const svgAlias = (cat, from, name) => ({ name, alias: from, bespoke: true, get svg() { return cat[from].svg; }, get right() { return cat[from].right; } });
  const pieceAlias = (cat, from, name) => ({ name, alias: from, bespoke: true, get pieces() { return cat[from].pieces; } });
  const drawn = (name, svg) => ({ name, bespoke: true, svg });
  const piece = (name, layer, svg) => ({ name, bespoke: true, pieces: [{ layer, svg }] });
  // hair pictures: an optional back piece (behind the head) and a front piece; CAP is the plain crown, SHAVE stubble sides
  const hair2 = (name, backSvg, frontSvg) => ({ name, bespoke: true, pieces: [...(backSvg ? [{ layer: 'hairBack', svg: backSvg }] : []), { layer: 'hairFront', svg: frontSvg }] });
  const CAP = `<path d="M78 134 C78 76 102 56 150 56 C198 56 222 76 222 134 C218 112 196 100 150 100 C104 100 82 112 78 134 Z" fill="var(--hair)"/>`;
  const SHAVE = `<path d="M80 130 C80 90 100 70 130 62 L136 100 C110 100 90 112 80 130 Z M220 130 C220 90 200 70 170 62 L164 100 C190 100 210 112 220 130 Z" fill="var(--hair-dark)" opacity=".4"/>`;
  const irisAt = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${E}"/><circle cx="${cx}" cy="${cy}" r="${r / 2}" fill="#111"/><circle cx="${cx - 2}" cy="${cy - 2.5}" r="1.8" fill="#fff"/>`;
  Object.assign(CHIBI2_2D, {
    eyes: {
      cat: drawn('Cat (upswept)', `<path d="M-14 3 Q-2 -11 15 -7 Q2 9 -14 3 Z" fill="#fff"/>${irisAt(1, -1, 5.5)}<path d="M-14 3 Q-2 -11 15 -7 L18 -10" stroke="#222" stroke-width="2.5" fill="none"/>`),
      doe: drawn('Doe (big, lower lashes)', `<ellipse rx="13" ry="16" fill="#fff"/>${irisAt(0, 2, 9)}<path d="M-12 -6 Q0 -18 12 -6" stroke="#222" stroke-width="2.5" fill="none"/><path d="M-6 15 L-8 19 M0 16 L0 20 M6 15 L8 19" stroke="#222" stroke-width="1.5"/>`),
      droopy: drawn('Droopy (downturned)', `<path d="M-13 -3 Q2 -12 14 4 Q0 9 -13 -3 Z" fill="#fff"/>${irisAt(0, 0, 5.5)}<path d="M-13 -3 Q2 -12 14 4" stroke="#222" stroke-width="2.5" fill="none"/>`),
      sharp: drawn('Sharp (slanted)', `<path d="M-15 3 L15 -6 Q2 7 -15 3 Z" fill="#fff"/>${irisAt(1, 0, 4)}<path d="M-15 3 L15 -6 L18 -9" stroke="#222" stroke-width="3" fill="none"/>`),
      button: drawn('Button (beady)', `<ellipse rx="8" ry="9" fill="#1a1c22"/><circle cx="-2.5" cy="-3" r="2.5" fill="#fff"/><circle cx="2.5" cy="3" r="1.2" fill="#fff"/>`),
      sparkle: drawn('Sparkle', `<ellipse rx="13" ry="16" fill="#fff"/><ellipse cy="2" rx="10" ry="12" fill="${E}"/><ellipse cy="3" rx="5" ry="6" fill="#111"/><path d="M-4 -8 L-3 -4 L1 -3 L-3 -2 L-4 2 L-5 -2 L-9 -3 L-5 -4 Z" fill="#fff"/><circle cx="4" cy="7" r="1.6" fill="#fff"/>`),
      hooded: drawn('Hooded', `<ellipse rx="12" ry="12" fill="#fff"/>${irisAt(1, 2, 6.5)}<path d="M-13 -3 L13 -3 L13 -13 L-13 -13 Z" fill="${S}"/><path d="M-13 -3 L13 -3" stroke="#222" stroke-width="2.5"/><path d="M-11 -8 Q0 -11 11 -8" stroke="${SD}" stroke-width="1.5" fill="none"/>`),
      lashes: drawn('Long lashes', `<ellipse rx="12" ry="13" fill="#fff"/>${irisAt(1, 1, 7)}<path d="M-12 -4 Q0 -17 12 -4 M5 -11 L9 -16 M9 -8 L14 -12 M12 -4 L17 -6" stroke="#222" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
      // owner review 2026-10-21 (the reference picture): big iris with a dark rim, bold upper lash with a wing, two highlights
      storybook: drawn('Storybook', `<ellipse rx="13" ry="15" fill="#fff"/><circle cx="0" cy="1" r="11" fill="#1a2a30" opacity=".85"/><circle cx="0" cy="1" r="9.5" fill="${E}"/><circle cx="0" cy="2" r="5" fill="#111"/><ellipse cx="-4" cy="-4" rx="3" ry="3.6" fill="#fff"/><circle cx="4" cy="6" r="1.5" fill="#fff"/><path d="M-13 -2 Q-2 -19 13 -5 L17 -8" stroke="#1a1414" stroke-width="4" fill="none" stroke-linecap="round"/>`),
      heart: drawn('Heart pupils', `<ellipse rx="12" ry="13" fill="#fff"/><circle cx="1" cy="1" r="8" fill="${E}"/><path d="M1 6 L-4 0 C-6 -3 -2 -6 1 -3 C4 -6 8 -3 6 0 Z" fill="#c8304a"/>`),
    },
    brows: {
      bushy: drawn('Bushy', `<path d="M-16 3 Q0 -10 16 -1 Q0 -1 -16 3 Z M-8 -3 L-6 -8 M0 -5 L2 -10 M8 -4 L10 -8" fill="${HD}" stroke="${HD}" stroke-width="2.5"/>`),
      unibrow: drawn('Unibrow', `<path d="M-14 0 Q0 -6 14 -1 L24 2" stroke="${HD}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`),
      slanted: drawn('Slanted', `<path d="M-14 -6 L14 4" stroke="${HD}" stroke-width="4" stroke-linecap="round"/>`),
      soft: drawn('Soft short', `<ellipse cx="-2" cy="-1" rx="7" ry="2.6" fill="${HD}"/>`),
      split: drawn('Split (scarred)', `<path d="M-14 0 L-3 -2 M3 -2 L14 -1" stroke="${HD}" stroke-width="4" stroke-linecap="round"/>`),
      dots: drawn('Dots (noble)', `<ellipse cx="2" cy="-3" rx="4" ry="3" fill="${HD}"/>`),
      bold: drawn('Bold', `<path d="M-15 4 Q-6 -6 15 -3 L14 1 Q-4 -1 -15 4 Z" fill="${HD}" stroke="${HD}" stroke-width="2" stroke-linejoin="round"/>`),
      curved: drawn('High curve', `<path d="M-14 3 Q-4 -12 14 -2" stroke="${HD}" stroke-width="3.5" stroke-linecap="round" fill="none"/>`),
    },
    mouth: {
      laugh: drawn('Laugh (open)', `<path d="M-14 -3 Q0 -1 14 -3 Q12 14 0 15 Q-12 14 -14 -3 Z" fill="#3a1518"/><path d="M-12 -2 Q0 0 12 -2 L11 2 Q0 3 -11 2 Z" fill="#fff"/><ellipse cy="10" rx="6" ry="3.5" fill="#d4636b"/>`),
      cat: drawn('Cat (:3)', `<path d="M-10 -1 Q-5 6 0 0 Q5 6 10 -1" stroke="${MO}" stroke-width="3" fill="none" stroke-linecap="round"/>`),
      pout: drawn('Pout', `<ellipse cy="-1" rx="6" ry="3" fill="${MO}"/><ellipse cy="3" rx="5.5" ry="3" fill="${MO}" opacity=".8"/>`),
      gritted: drawn('Gritted teeth', `<rect x="-14" y="-5" width="28" height="10" rx="3" fill="#fff" stroke="${MO}" stroke-width="2"/><path d="M-14 0 L14 0 M-7 -5 L-7 5 M0 -5 L0 5 M7 -5 L7 5" stroke="#aaa" stroke-width="1"/>`),
      wavy: drawn('Nervous (wavy)', `<path d="M-12 0 L-8 -3 L-4 2 L0 -3 L4 2 L8 -3 L12 0" stroke="${MO}" stroke-width="3" fill="none" stroke-linejoin="round"/>`),
      buck: drawn('Buck teeth', `<path d="M-14 -2 Q0 10 14 -2" stroke="${MO}" stroke-width="3.5" fill="none" stroke-linecap="round"/><rect x="-4" y="2" width="4" height="5" fill="#fff" stroke="#ccc" stroke-width=".8"/><rect x="0" y="2" width="4" height="5" fill="#fff" stroke="#ccc" stroke-width=".8"/>`),
      fang: drawn('One fang', `<path d="M-14 -2 Q0 10 14 -2" stroke="${MO}" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M5 2 L7 9 L9 1 Z" fill="#fff"/>`),
      shark: drawn('Shark teeth', `<path d="M-15 -4 Q0 -1 15 -4 Q10 10 0 11 Q-10 10 -15 -4 Z" fill="#3a1518"/><path d="M-13 -3 L-10 3 L-7 -2 L-4 3 L-1 -2 L2 3 L5 -2 L8 3 L11 -2 L13 -3 Z M-10 9 L-7 4 L-4 9 L-1 4 L2 9 L5 4 L8 9 Z" fill="#fff"/>`),
    },
    nose: {
      pointed: svgAlias(nose, 'long', 'Pointed'),
      round: drawn('Round (bulb)', `<circle cy="1" r="8" fill="${SD}" opacity=".5"/><circle cx="-2.5" cy="-2" r="2.5" fill="${S}"/>`),
      flat: drawn('Flat (broad)', `<path d="M-12 4 Q-10 -2 0 -1 Q10 -2 12 4 Q0 8 -12 4 Z" fill="${SD}" opacity=".5"/>`),
    },
    ears: {
      long_pointed: piece('Long pointed (high elf)', 'ears', `<path d="M84 152 L22 104 C50 124 70 128 86 122 Z" fill="${S}"/><path d="M216 152 L278 104 C250 124 230 128 214 122 Z" fill="${S}"/>`),
      swept: piece('Swept back', 'ears', `<path d="M84 150 L40 140 C58 132 72 128 86 126 Z" fill="${S}"/><path d="M216 150 L260 140 C242 132 228 128 214 126 Z" fill="${S}"/>`),
      notched: piece('Notched (torn)', 'ears', `<path d="M84 150 L50 120 L60 132 L52 128 C66 130 74 128 86 124 Z" fill="${S}"/><path d="M216 150 L250 120 L240 132 L248 128 C234 130 226 128 214 124 Z" fill="${S}"/>`),
      small: piece('Small round', 'ears', `<ellipse cx="81" cy="141" rx="8" ry="11" fill="${S}"/><ellipse cx="219" cy="141" rx="8" ry="11" fill="${S}"/>`),
      cat_ears: piece('Cat ears (on top)', 'hatFront', `<path d="M96 84 L104 34 L134 70 Z M204 84 L196 34 L166 70 Z" fill="${HR}"/><path d="M104 74 L107 48 L124 70 Z M196 74 L193 48 L176 70 Z" fill="#e8a0b0"/>`),
      wolf_ears: piece('Wolf ears (on top)', 'hatFront', `<path d="M98 84 L100 20 L136 68 Z M202 84 L200 20 L164 68 Z" fill="${HR}"/><path d="M106 72 L106 40 L124 66 Z M194 72 L194 40 L176 66 Z" fill="#e8a0b0"/>`),
    },
    hair: {
      // hair pass 2 (2026-10-16): every 2.5 style has its own picture now (part A's ten were aliases of older ones)
      undercut: hair2('Undercut', null, `${SHAVE}<path d="M88 104 C92 64 140 44 192 56 C216 62 226 84 222 108 C204 94 172 90 142 96 C118 100 100 102 88 104 Z" fill="${HR}"/><path d="M110 78 Q150 60 200 70" stroke="${HD}" stroke-width="2.5" fill="none" opacity=".6"/>`),
      topknot: hair2('Top knot', `<circle cx="150" cy="44" r="15" fill="${HR}"/><rect x="138" y="54" width="24" height="6" rx="2" fill="${HD}"/>`, `<path d="M80 130 C80 82 104 62 150 62 C196 62 220 82 220 130 C214 104 196 88 150 88 C104 88 86 104 80 130 Z" fill="${HR}"/><path d="M112 88 L144 64 M130 88 L148 64 M170 88 L152 64 M188 88 L156 64" stroke="${HD}" stroke-width="2" opacity=".6"/>`),
      high_ponytail: hair2('High ponytail', `<path d="M150 52 C202 30 236 70 224 130 C216 180 230 220 216 262 C202 242 202 200 198 160 C194 122 182 86 150 74 Z" fill="${HR}"/>`, `${CAP}<path d="M96 104 C86 130 88 160 94 186 M204 104 C214 130 212 160 206 186" stroke="${HR}" stroke-width="7" fill="none" stroke-linecap="round"/>`),
      twin_tails: hair2('Twin tails', `<path d="M76 100 C40 120 44 200 60 250 C66 230 70 170 90 120 Z M224 100 C260 120 256 200 240 250 C234 230 230 170 210 120 Z" fill="${HR}"/>`, `<path d="M76 130 C76 70 110 52 150 52 C190 52 224 70 224 130 L224 112 L208 100 L192 112 L176 100 L160 112 L144 100 L128 112 L112 100 L96 112 L76 112 Z" fill="${HR}"/>`),
      messy: hair2('Messy', null, `<path d="M78 136 C76 96 82 74 96 62 C92 54 100 44 108 52 C116 40 130 36 136 46 C146 32 162 34 166 46 C178 36 194 42 194 54 C206 52 216 62 210 72 C222 86 224 110 222 136 C216 114 204 104 192 102 C198 92 190 86 182 96 C170 90 158 98 150 92 C140 100 126 92 118 98 C108 92 100 100 104 106 C92 108 82 118 78 136 Z" fill="${HR}"/>`),
      pompadour: piece('Pompadour', 'hairFront', `<path d="M80 130 C76 70 100 40 150 34 C200 30 226 60 220 130 C214 104 200 92 186 92 C170 70 120 70 100 100 C90 106 84 118 80 130 Z" fill="${HR}"/>`),
      locs: hair2('Locs', `${[84, 100, 116, 184, 200, 216].map((x, i) => `<rect x="${x - 6}" y="110" width="13" height="${120 + (i % 3) * 18}" rx="6" fill="${HR}"/>`).join('')}`, `${CAP}${[112, 132, 168, 188].map(x => `<rect x="${x - 5}" y="88" width="10" height="26" rx="5" fill="${HR}"/>`).join('')}`),
      long_braid: hair2('Long braid', null, `${CAP}${[64, 76, 88].map(y => `<ellipse cx="150" cy="${y}" rx="11" ry="8" fill="${HD}" opacity=".55"/>`).join('')}`),
      mullet: hair2('Mullet', `<path d="M84 130 L80 236 C110 246 190 246 220 236 L216 130 Z" fill="${HR}"/>`, `<path d="M80 130 C80 90 86 66 100 58 L200 58 C214 66 220 90 220 130 C216 112 196 100 150 100 C104 100 84 112 80 130 Z" fill="${HR}"/><path d="M110 60 L110 74 M130 58 L130 72 M150 58 L150 72 M170 58 L170 72 M190 60 L190 74" stroke="${HD}" stroke-width="2.5" opacity=".6"/>`),
      side_swept: hair2('Side swept', `<path d="M76 130 C74 160 76 180 80 196 L90 196 L90 130 Z M224 130 C226 160 224 180 220 196 L210 196 L210 130 Z" fill="${HR}"/>`, `<path d="M78 138 C76 78 104 52 152 52 C200 52 224 80 222 132 C214 108 196 98 176 98 C150 100 120 110 96 126 C88 130 82 134 78 138 Z" fill="${HR}"/><path d="M200 86 C170 84 130 92 104 110" stroke="${HD}" stroke-width="2.5" fill="none" opacity=".55"/>`),
      crown_braid: hair2('Braided crown', null, `${CAP}${Array.from({ length: 9 }, (_, i) => { const t = i / 8, x = 82 + t * 136, y = 112 - Math.sin(t * Math.PI) * 30; return `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="11" ry="8" transform="rotate(${(i % 2 ? 30 : -30)} ${x.toFixed(0)} ${y.toFixed(0)})" fill="${i % 2 ? HD : HR}"/>`; }).join('')}`),
      side_shave: hair2('Side shave', `<path d="M210 120 C226 140 228 180 222 206 C214 190 210 160 200 140 Z" fill="${HR}"/>`, `<path d="M80 130 C80 96 92 76 114 64 L120 100 C102 104 86 114 80 130 Z" fill="${HD}" opacity=".4"/><path d="M108 74 C138 50 200 52 220 90 C232 120 230 170 222 204 C214 184 214 152 204 128 C190 108 162 102 118 98 Z" fill="${HR}"/>`),
      wolf_cut: hair2('Wolf cut', `<path d="M74 130 C70 70 108 48 150 48 C192 48 230 70 226 130 L238 186 L220 178 L232 214 L206 196 L202 222 L184 200 L116 200 L98 222 L94 196 L68 214 L80 178 L62 186 Z" fill="${HR}"/>`, `<path d="M76 138 C74 76 108 52 150 52 C192 52 226 76 224 138 C220 116 206 106 196 104 L182 120 L166 100 L150 116 L134 100 L118 120 L104 104 C94 106 80 116 76 138 Z" fill="${HR}"/>`),
      half_up: hair2('Half-up knot', `<path d="M74 135 C70 64 110 48 150 48 C190 48 230 64 226 135 L230 250 C220 258 200 256 196 248 L104 248 C100 256 80 258 70 250 Z" fill="${HR}"/><circle cx="150" cy="52" r="12" fill="${HD}"/>`, `${CAP}<path d="M118 94 C100 98 88 108 82 124 M182 94 C200 98 212 108 218 124" stroke="${HD}" stroke-width="3" fill="none" opacity=".6"/>`),
      ribbon_loops: hair2('Ribbon loops', `<circle cx="104" cy="62" r="18" fill="${HR}"/><circle cx="196" cy="62" r="18" fill="${HR}"/><ellipse cx="86" cy="98" rx="11" ry="20" fill="none" stroke="${HR}" stroke-width="9"/><ellipse cx="214" cy="98" rx="11" ry="20" fill="none" stroke="${HR}" stroke-width="9"/>`, `<path d="M78 135 C78 76 102 56 150 56 C198 56 222 76 222 135 L218 112 L180 112 C172 100 162 90 150 90 C138 90 128 100 120 112 L82 112 Z" fill="${HR}"/>`),
      cornrows: hair2('Cornrows', null, `<path d="M80 132 C80 82 104 60 150 60 C196 60 220 82 220 132 C214 112 196 102 150 102 C104 102 86 112 80 132 Z" fill="${HD}"/>${[[92, 118], [108, 106], [128, 102], [150, 100], [172, 102], [192, 106], [208, 118]].map(([x, y]) => `<path d="M${x} ${y} Q${(150 + (x - 150) * 0.6).toFixed(0)} 74 ${(150 + (x - 150) * 0.3).toFixed(0)} 62" stroke="${HR}" stroke-width="8" fill="none" stroke-linecap="round"/>`).join('')}`),
      warrior_braids: hair2('Warrior braids', null, `${SHAVE}<path d="M132 102 L150 114 L168 102 C172 80 164 60 150 56 C136 60 128 80 132 102 Z" fill="${HR}"/>`),
      feathered: hair2('Feathered', `<path d="M72 135 C68 64 108 48 150 48 C192 48 232 64 228 135 C236 160 244 190 236 210 L210 196 L90 196 L64 210 C56 190 64 160 72 135 Z" fill="${HR}"/>`, `<path d="M76 140 C72 76 106 50 150 50 C194 50 228 76 224 140 C222 112 210 96 196 92 C180 86 160 92 150 66 C140 92 120 86 104 92 C90 96 78 112 76 140 Z" fill="${HR}"/><path d="M146 70 C130 90 108 92 92 108 M154 70 C170 90 192 92 208 108" stroke="${HD}" stroke-width="2.5" fill="none" opacity=".55"/>`),
      curly_bob: hair2('Curly bob', `${[[80, 120], [76, 150], [80, 180], [96, 198], [220, 120], [224, 150], [220, 180], [204, 198]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="${HR}"/>`).join('')}`, `${CAP}${[124, 142, 160, 178].map(x => `<circle cx="${x}" cy="104" r="7" fill="none" stroke="${HR}" stroke-width="5"/>`).join('')}`),
      puff: hair2('Top puff', `<circle cx="150" cy="40" r="34" fill="${HR}"/>`, `<path d="M80 132 C80 82 104 62 150 62 C196 62 220 82 220 132 C216 112 196 102 150 102 C104 102 84 112 80 132 Z" fill="${HR}"/><rect x="126" y="62" width="48" height="9" rx="4" fill="${HD}"/><path d="M98 108 q6 -8 12 -2 q-4 6 -10 4 M202 108 q-6 -8 -12 -2 q4 6 10 4" stroke="${HD}" stroke-width="2" fill="none"/>`),
      rolled_tail: hair2('Rolled tail', `<path d="M204 160 C232 180 238 230 224 272 C214 262 210 222 198 190 Z" fill="${HR}"/>`, `${CAP}<ellipse cx="118" cy="76" rx="30" ry="14" fill="${HR}" stroke="${HD}" stroke-width="2.5"/><ellipse cx="182" cy="76" rx="30" ry="14" fill="${HR}" stroke="${HD}" stroke-width="2.5"/>`),
      bowl: hair2('Bowl cut', null, `<path d="M74 132 C74 70 108 52 150 52 C192 52 226 70 226 132 C226 120 224 112 214 110 L86 110 C76 112 74 120 74 132 Z" fill="${HR}"/><path d="M84 110 L216 110" stroke="${HD}" stroke-width="5" stroke-linecap="round" opacity=".5"/>`),
      court_cut: hair2('Court cut', `<path d="M74 135 C70 64 110 48 150 48 C190 48 230 64 226 135 L232 300 L68 300 Z" fill="${HR}"/>`, `${CAP}<path d="M74 112 L94 112 L94 192 L74 192 Z M206 112 L226 112 L226 192 L206 192 Z" fill="${HR}"/>${[122, 136, 150, 164, 178].map(x => `<path d="M${x} 94 L${x + 2} 114" stroke="${HR}" stroke-width="3" stroke-linecap="round"/>`).join('')}`),
    },
    extras: {
      freckles_nose: pieceAlias(extras, 'freckles', 'Freckles over the nose'),
      beauty_mark: piece('Beauty mark', 'extras', `<circle cx="168" cy="186" r="2.2" fill="#3a2420"/>`),
      scar_brow: piece('Scar through the brow', 'extras', `<path d="M118 112 L124 136" stroke="${X}" stroke-width="3" stroke-linecap="round"/>`),
      scar_lip: piece('Scar on the lip', 'extras', `<path d="M156 182 L160 204" stroke="${X}" stroke-width="2.5" stroke-linecap="round"/>`),
      war_mask: piece('War paint (band over the eyes)', 'extras', `<rect x="82" y="138" width="136" height="24" rx="6" fill="${X}" opacity=".85"/>`),
      chin_lines: piece('Chin tattoo lines', 'extras', `<path d="M138 200 L136 214 M146 202 L145 216 M154 202 L155 216 M162 200 L164 214" stroke="${X}" stroke-width="2.5" stroke-linecap="round"/>`),
      tear_mark: piece('Tear mark', 'extras', `<path d="M172 162 L176 170 L172 178 L168 170 Z" fill="${X}"/>`),
      star_mark: piece('Star mark', 'extras', `<path d="M190 166 L193 174 L201 174 L195 179 L197 187 L190 182 L183 187 L185 179 L179 174 L187 174 Z" fill="${X}"/>`),
      moon_mark: piece('Moon mark', 'extras', `<path d="M192 168 A10 10 0 1 0 192 188 A7 8 0 1 1 192 168 Z" fill="${X}"/>`),
      blush_soft: pieceAlias(extras, 'blush', 'Soft blush'),
    },
  });
  Object.assign(CHIBI2_2D.facialHair, {
    mutton_chops: pieceAlias(facialHair, 'chinstrap', 'Mutton chops'),
    handlebar: pieceAlias(facialHair, 'mustache', 'Handlebar moustache'),
    van_dyke: { name: 'Van Dyke', bespoke: true, get pieces() { return [...facialHair.goatee.pieces, ...facialHair.mustache.pieces]; } },
    short_beard: pieceAlias(facialHair, 'full', 'Short beard'),
    forked_beard: pieceAlias(facialHair, 'long', 'Forked beard'),
    sideburns: pieceAlias(facialHair, 'stubble', 'Sideburns'),
  });
  void eyes; void brows; void mouth; void ears;
}

// CHIBI 2.5 (part B, 2026-10-16): new tops, bottoms, shoes and capes (avatar-3d/js/chibi25-outfits.js). `bespoke` keeps them
// out of every seeded random roll, so no game's random NPCs change; the paper doll draws each one's nearest kin.
{
  const cats = { top, bottom, shoes, cape, accessory: { ...accessory, ...EXTRA_ACCESSORIES } };
  for (const [slot, table] of Object.entries(OUTFIT25)) {
    CHIBI2_2D[slot] = CHIBI2_2D[slot] || {};
    for (const [id, row] of Object.entries(table)) {
      if (CHIBI2_2D[slot][id] || cats[slot][id]) continue;
      const from = row.alias2d, src = cats[row.alias2dSlot || slot];
      // (2026-10-21: a scarf in the cape slot draws the accessory scarf, recoloured with the cape's colour)
      const recolour = row.alias2dSlot && row.alias2dSlot !== slot ? svg => svg.replaceAll('--acc', '--' + slot) : svg => svg;
      CHIBI2_2D[slot][id] = { name: row.name, alias: from, bespoke: true, get pieces() { return (src[from]?.pieces || []).map(p => ({ ...p, svg: recolour(p.svg) })); } };
    }
  }
}
