// The Farhold weapon kit's catalogue, with no Three.js in it.
//
// Same reason `creature-types.js` exists: the node tests and the tools have no `three` to import,
// and "every id a game asks for resolves to a builder" is exactly the sort of thing that should be
// checked without a browser. `chibi2-weapons.js` imports this and asserts it matches its own
// builder table, so the two cannot drift.
//
// `haft` says the head is on a pole; `bladeY` / `buttY` are where the business end and the butt sit
// in hand space, and the rule they encode is the bug this kit was written to fix: in hand space
// `-y` is out past the fingertips and `+y` runs up the forearm, and every hafted weapon in the
// original kit had its head at +0.40 or worse — behind the fist, travelling the wrong way through
// the swing.

/** id -> what it is, and where its two ends are. */
export const FARHOLD_WEAPON_INFO = {
  fh_dagger: { family: 'dagger', hands: 1, haft: false, headY: -0.36, buttY: 0.07 },
  fh_daggers: { family: 'dagger', hands: 1, haft: false, headY: -0.36, buttY: 0.07, paired: true },
  fh_sword: { family: 'sword', hands: 1, haft: false, headY: -0.73, buttY: 0.09 },
  fh_longsword: { family: 'sword', hands: 1, haft: false, headY: -0.81, buttY: 0.13 },
  fh_greatsword: { family: 'greatsword', hands: 2, haft: false, headY: -1.16, buttY: 0.18 },
  fh_sabre: { family: 'sabre', hands: 1, haft: false, headY: -0.69, buttY: 0.08 },
  fh_rapier: { family: 'rapier', hands: 1, haft: false, headY: -0.74, buttY: 0.09 },
  fh_axe: { family: 'axe', hands: 1, haft: true, headY: -0.46, buttY: 0.10 },
  fh_greataxe: { family: 'axe', hands: 2, haft: true, headY: -0.78, buttY: 0.24 },
  fh_hammer: { family: 'hammer', hands: 1, haft: true, headY: -0.56, buttY: 0.10 },
  fh_maul: { family: 'hammer', hands: 2, haft: true, headY: -0.82, buttY: 0.22 },
  fh_mace: { family: 'mace', hands: 1, haft: true, headY: -0.44, buttY: 0.08 },
  fh_scepter: { family: 'mace', hands: 1, haft: true, headY: -0.40, buttY: 0.09 },
  fh_spear: { family: 'polearm', hands: 1, haft: true, headY: -1.22, buttY: 0.60 },
  fh_javelin: { family: 'polearm', hands: 1, haft: true, headY: -0.84, buttY: 0.40 },
  fh_halberd: { family: 'polearm', hands: 2, haft: true, headY: -1.30, buttY: 0.66 },
  fh_quarterstaff: { family: 'staff', hands: 2, haft: true, headY: -0.78, buttY: 0.78 },
  fh_wand: { family: 'wand', hands: 1, haft: false, headY: -0.32, buttY: 0.02 },
};

export const FARHOLD_HELD = Object.keys(FARHOLD_WEAPON_INFO);

/** Off-hand ids, and the bone each one rides. A heater shield is STRAPPED, not gripped. */
export const FARHOLD_OFFHAND_INFO = {
  fh_heater_shield: { bone: 'elbowL', kind: 'heater' },
  fh_kite_shield: { bone: 'elbowL', kind: 'kite' },
  fh_tower_shield: { bone: 'elbowL', kind: 'tower' },
};
export const FARHOLD_OFFHAND = Object.keys(FARHOLD_OFFHAND_INFO);

// ---------------------------------------------------------------- what is in each hand

/**
 * The family each held id belongs to, for the animation clips (see `HOLD_NONE` in chibi2-motion.js).
 * Covers the original vocabulary and every `fh_` id; anything unknown is carried like a sword.
 */
const RIGHT_KIND = {
  sword: 'blade', rapier: 'blade', saber: 'blade', cleaver: 'blade',
  fh_sword: 'blade', fh_longsword: 'blade', fh_sabre: 'blade', fh_rapier: 'blade',
  greatsword: 'heavy', greataxe: 'heavy', warhammer: 'heavy', fh_greatsword: 'heavy', fh_greataxe: 'heavy', fh_maul: 'heavy',
  hammer: 'haft', mace: 'haft', fh_axe: 'haft', fh_hammer: 'haft', fh_mace: 'haft', fh_scepter: 'haft',
  daggers: 'dagger', fh_dagger: 'dagger', fh_daggers: 'dagger',
  fh_spear: 'polearm', fh_halberd: 'polearm', fh_javelin: 'polearm', fh_quarterstaff: 'polearm',
  quarterstaff: 'staff', staff_orb: 'staff', staff_skull: 'staff', staff_crook: 'staff', staff_crystal: 'staff', staff_totem: 'staff',
  fh_wand: 'wand', wand: 'wand',
  lute: 'caster', book: 'caster', hourglass: 'caster', orb: 'caster', flame: 'caster', lightning: 'caster', ring_rune: 'caster',
  crossbow: 'crossbow', bow: 'none', none: 'none',
};
const TWO_HANDED = new Set(['greatsword', 'greataxe', 'warhammer', 'fh_greatsword', 'fh_greataxe', 'fh_maul', 'fh_halberd', 'fh_quarterstaff', 'quarterstaff']);
const LEFT_KIND = {
  heater_shield: 'shield', kite_shield: 'shield', round_shield: 'shield', tower_shield: 'shield', buckler: 'shield',
  fh_heater_shield: 'shield', fh_kite_shield: 'shield', fh_tower_shield: 'shield',
  dagger: 'dagger', book: 'book', orb: 'orb', torch: 'torch', map: 'caster', quiver: 'none', none: 'none',
};

/**
 * Which of an item's own axes is its striking EDGE (the rest are '+x', like a sword's edges): an axe
 * head is extruded on its side and faces -z, a hammer's face plate is at -x, a crossbow's muzzle is
 * +z and a bow's belly -y with its limbs along z. The clips' grip solve reads this.
 */
const EDGE_AXIS = { fh_axe: '-z', fh_greataxe: '-z', fh_halberd: '-z', fh_hammer: '-x', fh_maul: '-x', crossbow: '-z', bow: '-z' };

/** Held ids that are weapons a hand can swing — the ones an off hand may carry as a second weapon. */
export const HELD_WEAPON_IDS = Object.keys(RIGHT_KIND).filter(id => !['caster', 'none', 'crossbow', 'staff', 'wand'].includes(RIGHT_KIND[id]));

/** `{ right, left, twoHand, dualTwo, dual }` for an avatar — see chibi2-motion.js. */
export function holdFor(a) {
  const hid = a?.held?.id || 'none', oid = a?.offhand?.id || 'none';
  let right = RIGHT_KIND[hid] ?? 'blade';
  let left = LEFT_KIND[oid] ?? (RIGHT_KIND[oid] && RIGHT_KIND[oid] !== 'none' ? RIGHT_KIND[oid] : 'none');
  if (hid === 'bow') left = 'bow';
  if ((hid === 'daggers' || hid === 'fh_daggers') && oid === 'none') left = 'dagger';
  const dualTwo = right === 'heavy' && left === 'heavy';
  const twoHand = TWO_HANDED.has(hid) && left === 'none';
  const edgeOf = id => EDGE_AXIS[id] || '+x';
  return {
    right, left, twoHand, dualTwo, dual: left !== 'none' && ['blade', 'dagger', 'haft', 'heavy'].includes(left),
    edgeR: edgeOf(hid), edgeL: hid === 'bow' ? '-z' : edgeOf(oid),
  };
}
