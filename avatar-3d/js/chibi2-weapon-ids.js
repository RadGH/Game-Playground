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
