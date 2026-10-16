// Chibi 4 step 10a — what a Chibi 4 hand does with each held thing. PURE (no three.js): node tests and tools read it.
//
// The models themselves are NOT remodelled: chibi4-held.js builds every held / off-hand item with the Chibi 2
// procedural builders (avatar-3d/js/chibi2-gear*.js, chibi2-weapons*.js) and lifts the item's triangles out of the
// Chibi 2 body. This file says how to turn that doll-sized piece into a real one in a real hand:
//
//   heldSpec(id, slot)  -> { id, slot, kind, family, type, mount, frame, length, cross, hands, paired, … }
//   holdState(clip)     -> 'free' | 'gait' | 'idle' | 'ready' | 'strike' | 'shoot' | 'cast' | 'seat'
//   FAMILY_POSE         per family and state: how the hand carries it (see chibi4-held.js "The hold pose")
//
// CANONICAL ITEM FRAME. Every item is first turned into one frame, whatever way Chibi 2 built it:
//   +Y  the business end (a blade's point, a hammer's head, a staff's topper, a bow's upper limb, a crossbow's muzzle)
//   +X  the striking side (a sword's edge, an axe's bit, a hammer's face, a bow's back — the side toward the target)
//   origin  where the fist closes (the handle's centre line, at the palm)
// `frame` below names, per kind, which Chibi 2 axis becomes +Y / +X and where the origin is (Chibi 2 bone space).
// Then the hand: +Y goes out of the THUMB side of the fist, tilted `tilt` toward the fingertips (a real fist's
// handle crosses the palm diagonally, index knuckle to the heel of the hand), +X faces the way the knuckles punch.
//
// SIZES are real-world lengths per weapon type (a Chibi 2 sword is sized for a doll's arm), with `cross` thinning the
// cross-section a little more than the length (a doll's sword is also fat: 10 cm wide blades, 5 cm grips).

import { holdFor } from '../../js/chibi2-weapon-ids.js';
import { BOW_IDS } from '../../js/chibi2-gear5-ids.js';

/** Real overall lengths (metres) per catalog weapon type; the longest axis of the item for things that are not poles. */
export const REAL_LENGTH = {
  dagger: 0.40, sword: 0.98, sword2h: 1.50, axe: 0.72, axe2h: 1.30, mace: 0.72, hammer: 0.66, hammer2h: 1.25,
  spear: 2.05, polearm: 2.15, javelin: 1.55, bow: 1.35, crossbow: 0.80, wand: 0.36, staff: 1.75, quarterstaff: 1.85,
  scepter: 0.62, orb: 0.22, tome: 0.30, spell: 0.30, focus: 0.30, instrument: 0.95, torch: 0.62, quiver: 0.66,
  shield: 0.80, prop: 0.30,
};
/** Per-id overrides where one catalog type covers very different things. */
export const REAL_LENGTH_ID = {
  fh_rapier: 1.12, rapier: 1.12, fh_longsword: 1.12, cleaver: 0.55, saber: 0.92, fh_sabre: 0.92, tv_scimitar: 0.9,
  fh_daggers: 0.40, daggers: 0.40, tv_club: 0.78, tv_glaive: 1.9, tv_warpick: 1.15, fh_javelin: 1.5,
  g5_recurve: 1.25, bow: 1.4, g5_kris: 0.42, hourglass: 0.22, ring_rune: 0.34, flame: 0.30, lightning: 0.32, map: 0.34,
  // shields by size: a buckler is a fist, a tower shield covers a crouching man
  buckler: 0.40, g5_targe: 0.48, round_shield: 0.72, heater_shield: 0.74, fh_heater_shield: 0.74, g5_scutcheon: 0.74,
  kite_shield: 1.0, fh_kite_shield: 1.0, g5_almond: 1.0, tower_shield: 1.28, fh_tower_shield: 1.28, g5_pavise: 1.22,
  // foci
  orb: 0.24, relic: 0.30, idol: 0.30, tv_ward: 0.30, tv_totem: 0.32, book: 0.28, g5_folio: 0.30, g5_codex: 0.32,
  g5_starglass: 0.30, g5_thurible: 0.42, g5_seeingmask: 0.30, g5_sigilplate: 0.30, g5_antlerrod: 0.42, g5_armillary: 0.26,
  quiver: 0.68, g5_hipquiver: 0.58, torch: 0.62, g5_cresset: 0.66, dagger: 0.40, g5_crownsceptre: 0.64, fh_scepter: 0.62,
};

/**
 * How each hold kind (chibi2-weapon-ids.js holdFor) is turned into the canonical frame. Axes are Chibi 2 bone-space
 * axes ('+x', '-y', …); `at` is the Chibi 2 point that lands in the fist (or on the anchor); `mount` is the Chibi 4
 * anchor: 'grip' (closed fist), 'palm' (sits on / floats above the open palm), 'forearm' (strapped), 'back', 'hip',
 * 'chest' (an instrument across the body).
 */
const GRIP_AT = [0, -0.035, 0.055];          // Chibi 2: palm centre y -0.035, every handle runs along x = 0, z = 0.055
export const KIND_FRAME = {
  blade: { y: '-y', x: 'edge', at: GRIP_AT, mount: 'grip', cross: 0.72 },
  dagger: { y: '-y', x: 'edge', at: GRIP_AT, mount: 'grip', cross: 0.78 },
  haft: { y: '-y', x: 'edge', at: GRIP_AT, mount: 'grip', cross: 0.8 },
  heavy: { y: '-y', x: 'edge', at: GRIP_AT, mount: 'grip', cross: 0.8 },
  polearm: { y: '-y', x: 'edge', at: GRIP_AT, mount: 'grip', cross: 0.85 },
  staff: { y: '+y', x: '+x', at: GRIP_AT, mount: 'grip', cross: 0.85 },        // staves carry their topper at +y
  wand: { y: '-y', x: 'edge', at: GRIP_AT, mount: 'grip', cross: 0.85 },
  torch: { y: '-y', x: '+x', at: GRIP_AT, mount: 'grip', cross: 0.85 },
  crossbow: { y: '+z', x: '+y', at: [0, -0.05, 0.03], mount: 'stock', cross: 1 },       // muzzle +z; the prod is up (+y… see held.html)
  bow: { y: '+z', x: '-y', at: GRIP_AT, mount: 'grip', cross: 1 },             // limbs along z, the back toward the target at -y
  shield: { y: '-y', x: '-x', at: 'centre', mount: 'forearm', cross: 1 },       // elbowL space: forearm down -y, face out -x
  book: { y: '-y', x: '+z', at: 'centre', mount: 'palm', cross: 1 },
  orb: { y: '+y', x: '+z', at: 'base', mount: 'palm', cross: 1 },               // foci stand up out of the fist (Chibi 2 S6)
  caster: { y: '+y', x: '+z', at: 'centre', mount: 'palm', cross: 1 },          // spells, the hourglass, the map: in front of the palm
  instrument: { y: '+y', x: '+z', at: 'centre', mount: 'chest', cross: 1 },
  quiver: { y: '+y', x: '+z', at: 'centre', mount: 'back', cross: 1 },
  hipquiver: { y: '+y', x: '+z', at: 'centre', mount: 'hip', cross: 1 },
};

/** Catalog `type` -> clip family (what the hold-aware poses switch on). */
export const FAMILY_OF_TYPE = {
  dagger: 'dagger', sword: 'sword', sword2h: 'twohander', axe: 'axe', axe2h: 'twohander', mace: 'mace', hammer: 'mace',
  hammer2h: 'twohander', spear: 'spear', polearm: 'polearm', javelin: 'spear', bow: 'bow', crossbow: 'crossbow',
  wand: 'wand', staff: 'staff', quarterstaff: 'staff', scepter: 'mace', orb: 'focus', tome: 'focus', spell: 'focus',
  focus: 'focus', instrument: 'instrument', shield: 'shield', torch: 'torch', quiver: 'worn', prop: 'focus',
};
export const FAMILIES = ['sword', 'dagger', 'axe', 'mace', 'spear', 'polearm', 'staff', 'wand', 'bow', 'crossbow', 'shield',
  'twohander', 'dual', 'unarmed', 'focus', 'torch', 'instrument', 'worn'];

/** The type for an id the catalog does not carry (callers usually pass the catalog row's `type`). */
function guessType(id, slot, hold) {
  const k = slot === 'offhand' ? hold.left : hold.right;
  if (/shield|buckler|targe|scutcheon|almond|pavise/.test(id)) return 'shield';
  if (/quiver/.test(id)) return 'quiver';
  if (/torch|cresset/.test(id)) return 'torch';
  if (BOW_IDS.has(id)) return 'bow';
  return { blade: 'sword', dagger: 'dagger', haft: 'mace', heavy: 'sword2h', polearm: 'spear', staff: 'staff', wand: 'wand',
    crossbow: 'crossbow', book: 'tome', orb: 'focus', caster: 'focus' }[k] || 'sword';
}

/**
 * Everything chibi4-held.js needs to build and carry one item. `type` is the catalog row's type when known.
 * Returned `kind` is the frame kind (KIND_FRAME), `family` the clip family, `hand` 'R' | 'L' for the fist it is in.
 */
export function heldSpec(id, slot = 'held', type = null) {
  const hold = holdFor(slot === 'offhand' ? { held: { id: 'none' }, offhand: { id } } : { held: { id }, offhand: { id: 'none' } });
  type = type || guessType(id, slot, hold);
  let kind = slot === 'offhand' ? hold.left : hold.right;
  if (BOW_IDS.has(id)) kind = 'bow';
  if (type === 'quiver') kind = /hip/.test(id) ? 'hipquiver' : 'quiver';
  if (type === 'instrument') kind = 'instrument';
  if (type === 'tome' || kind === 'book') kind = 'book';
  if (type === 'shield') kind = 'shield';
  if (type === 'torch') kind = 'torch';
  if (type === 'scepter' && kind === 'caster') kind = 'haft';
  if (kind === 'none' || !KIND_FRAME[kind]) kind = type === 'focus' || type === 'orb' || type === 'spell' || type === 'prop' ? 'caster' : 'blade';
  if (id === 'g5_armillary' || id === 'orb' && slot === 'held') kind = 'orb';
  const f = KIND_FRAME[kind];
  const edge = slot === 'offhand' ? hold.edgeL : hold.edgeR;
  const family = FAMILY_OF_TYPE[type] || 'sword';
  const twoHanded = slot === 'held' && hold.twoHand && ['twohander', 'polearm', 'staff', 'crossbow'].includes(family);
  return {
    id, slot, type, kind, family, mount: f.mount,
    frame: { y: f.y, x: f.x === 'edge' ? (edge || '+x') : f.x, at: f.at },
    length: REAL_LENGTH_ID[id] ?? REAL_LENGTH[type] ?? 0.9,
    cross: f.cross,
    hand: kind === 'bow' || slot === 'offhand' ? 'L' : 'R',
    twoHanded, paired: id === 'fh_daggers' || id === 'daggers' || id === 'lightning',
  };
}

// ---------------------------------------------------------------- clips -> what the hands are doing
/** Clips that put whatever is held away (Chibi 2's HANDS_FREE: emotes, swimming, punches, angling, professions). */
export const HANDS_FREE = new Set(['wave', 'talk', 'cheer', 'bowGreet', 'point', 'shrug', 'nod', 'headShake', 'laugh', 'clap',
  'salute', 'kneel', 'sitGround', 'pray', 'dance', 'lookAround', 'crossArms', 'stretch', 'drink', 'sleep', 'swim', 'swimBack',
  'swimSide', 'punch', 'kick', 'fishCast', 'fishWait', 'fishReel', 'fishShow', 'forage', 'profGather', 'profSkin', 'profStitch',
  'profStir', 'profHammer', 'sit', 'boat', 'standUp']);
const GAIT = new Set(['walk', 'run', 'sprint', 'walkFormal', 'swimSide']);
const READY = new Set(['ready', 'guard', 'block', 'parry']);
const SHOOT = new Set(['shoot', 'reload']);
const CAST = new Set(['cast', 'castPoint', 'castStaff', 'channel', 'castBook', 'throw']);
const SEAT = new Set(['ride', 'rideGallop']);

/** What the hands are doing in a Chibi 2 clip name. */
export function holdState(name = 'idle') {
  if (HANDS_FREE.has(name)) return 'free';
  if (SEAT.has(name)) return 'seat';
  if (GAIT.has(name)) return 'gait';
  if (READY.has(name)) return 'ready';
  if (SHOOT.has(name)) return 'shoot';
  if (CAST.has(name)) return 'cast';
  if (name === 'idle' || name === 'hit' || name === 'jump' || name === 'dead' || name === 'lookAround') return 'idle';
  return 'strike';
}

/**
 * The hold pose per family and state. Two modes (the Z63 rule, CHIBI2.md "A gait carries a one-fist weapon IN the
 * fist"):
 *   'fist'    the clip moves the arm; the wrist keeps ONE turn for the whole clip (sampled at the clip's first frame and
 *             corrected so the item points `aim` there), so the item rides the fist — its angle to the forearm is fixed
 *   'steady'  the hand is placed (`at`: metres in the chest's frame, x = the character's own left, z forward) and the
 *             item is aimed (`aim`: the item's +Y in the chest frame; `face`: its +X) — a planted staff, a shouldered
 *             greatsword, a bow held up
 * `second: true` puts the other hand on the handle too (`secondAt`: metres down the handle from the fist).
 * `aim` for 'fist' is the direction the item's +Y should face at the clip's neutral frame (chest frame).
 */
const FWD_DOWN = [0, -0.45, 1], FWD = [0, 0.05, 1], UP_FWD = [0, 1, 0.35], UP = [0, 1, 0.08];
export const FAMILY_POSE = {
  sword: { idle: { mode: 'fist', aim: FWD_DOWN }, gait: { mode: 'fist', aim: FWD_DOWN }, ready: { mode: 'fist', aim: [0, 0.55, 1] }, strike: { mode: 'fist', aim: UP_FWD }, cast: { mode: 'fist', aim: FWD_DOWN }, shoot: { mode: 'fist', aim: FWD } },
  dagger: { idle: { mode: 'fist', aim: FWD_DOWN }, gait: { mode: 'fist', aim: FWD_DOWN }, ready: { mode: 'fist', aim: FWD }, strike: { mode: 'fist', aim: FWD }, cast: { mode: 'fist', aim: FWD_DOWN }, shoot: { mode: 'fist', aim: FWD } },
  axe: { idle: { mode: 'fist', aim: [0, 0.2, 1] }, gait: { mode: 'fist', aim: [0, 0.2, 1] }, ready: { mode: 'fist', aim: UP_FWD }, strike: { mode: 'fist', aim: UP_FWD }, cast: { mode: 'fist', aim: [0, 0.2, 1] }, shoot: { mode: 'fist', aim: FWD } },
  mace: { idle: { mode: 'fist', aim: [0, 0.2, 1] }, gait: { mode: 'fist', aim: [0, 0.2, 1] }, ready: { mode: 'fist', aim: UP_FWD }, strike: { mode: 'fist', aim: UP_FWD }, cast: { mode: 'fist', aim: [0, 0.2, 1] }, shoot: { mode: 'fist', aim: FWD } },
  wand: { idle: { mode: 'fist', aim: FWD_DOWN }, gait: { mode: 'fist', aim: FWD_DOWN }, ready: { mode: 'fist', aim: FWD }, strike: { mode: 'fist', aim: FWD }, cast: { mode: 'fist', aim: FWD }, shoot: { mode: 'fist', aim: FWD } },
  torch: { idle: { mode: 'steady', at: [-0.24, -0.12, 0.3], aim: UP_FWD }, gait: { mode: 'steady', at: [-0.24, -0.1, 0.32], aim: UP_FWD }, ready: { mode: 'steady', at: [-0.24, 0.0, 0.36], aim: UP_FWD }, strike: { mode: 'fist', aim: UP_FWD }, cast: { mode: 'steady', at: [-0.24, -0.1, 0.32], aim: UP_FWD }, shoot: { mode: 'steady', at: [-0.24, -0.1, 0.32], aim: UP_FWD } },
  focus: { idle: { mode: 'steady', at: [-0.2, -0.2, 0.3], aim: UP, face: [0, 0, 1] }, gait: { mode: 'steady', at: [-0.21, -0.18, 0.3], aim: UP, face: [0, 0, 1] }, ready: { mode: 'steady', at: [-0.18, -0.05, 0.38], aim: UP, face: [0, 0, 1] }, strike: { mode: 'steady', at: [-0.16, 0.0, 0.42], aim: UP, face: [0, 0, 1] }, cast: { mode: 'steady', at: [-0.14, 0.04, 0.44], aim: UP, face: [0, 0, 1] }, shoot: { mode: 'steady', at: [-0.16, 0.0, 0.42], aim: UP, face: [0, 0, 1] } },
  staff: { idle: { mode: 'steady', at: [-0.27, -0.12, 0.2], aim: UP }, gait: { mode: 'steady', at: [-0.27, -0.12, 0.24], aim: [0, 1, 0.22] }, ready: { mode: 'steady', at: [-0.22, -0.02, 0.36], aim: [0, 1, 0.45], second: true, secondAt: -0.32 }, strike: { mode: 'steady', at: [-0.12, 0.05, 0.5], aim: [0.1, 0.6, 1], second: true, secondAt: -0.36 }, cast: { mode: 'steady', at: [-0.22, 0.08, 0.36], aim: [0, 1, 0.35] }, shoot: { mode: 'steady', at: [-0.22, 0.08, 0.36], aim: [0, 1, 0.35] } },
  spear: { idle: { mode: 'steady', at: [-0.27, -0.1, 0.18], aim: UP }, gait: { mode: 'steady', at: [-0.27, -0.1, 0.22], aim: [0, 1, 0.2] }, ready: { mode: 'steady', at: [-0.2, -0.1, 0.3], aim: [0, 0.35, 1], second: true, secondAt: -0.5 }, strike: { mode: 'steady', at: [-0.12, 0.0, 0.62], aim: [0, 0.12, 1], second: true, secondAt: -0.5, thrust: 0.3 }, cast: { mode: 'steady', at: [-0.27, -0.1, 0.22], aim: UP }, shoot: { mode: 'steady', at: [-0.12, 0.0, 0.62], aim: [0, 0.12, 1], second: true, secondAt: -0.5 } },
  polearm: { idle: { mode: 'steady', at: [-0.27, -0.1, 0.18], aim: UP }, gait: { mode: 'steady', at: [-0.27, -0.1, 0.22], aim: [0, 1, 0.2] }, ready: { mode: 'steady', at: [-0.2, -0.05, 0.32], aim: [0, 0.6, 1], second: true, secondAt: -0.55 }, strike: { mode: 'steady', at: [-0.12, 0.05, 0.55], aim: [0, 0.3, 1], second: true, secondAt: -0.55, thrust: 0.25 }, cast: { mode: 'steady', at: [-0.27, -0.1, 0.22], aim: UP }, shoot: { mode: 'steady', at: [-0.12, 0.05, 0.55], aim: [0, 0.3, 1], second: true, secondAt: -0.55 } },
  // a two-hander rests on the right shoulder at idle and on the march; both hands in the guard and the swing
  twohander: { idle: { mode: 'steady', at: [-0.2, 0.02, 0.2], aim: [0.15, 0.5, -1], face: [0, 1, 0] }, gait: { mode: 'steady', at: [-0.2, 0.02, 0.2], aim: [0.15, 0.5, -1], face: [0, 1, 0] }, ready: { mode: 'steady', at: [-0.06, -0.1, 0.36], aim: [0.1, 0.75, 1], second: true, secondAt: -0.14 }, strike: { mode: 'fist', aim: UP_FWD, second: true, secondAt: -0.14 }, cast: { mode: 'steady', at: [-0.2, 0.02, 0.2], aim: [0.15, 0.5, -1], face: [0, 1, 0] }, shoot: { mode: 'fist', aim: UP_FWD, second: true, secondAt: -0.14 } },
  // the bow is in the LEFT hand; at rest it hangs forward of the thigh, in the shot the arm is out and the right hand draws
  bow: { idle: { mode: 'steady', at: [0.24, -0.22, 0.18], aim: [0, 1, 0.5], face: [0, -0.3, 1] }, gait: { mode: 'steady', at: [0.24, -0.2, 0.2], aim: [0, 1, 0.5], face: [0, -0.3, 1] }, ready: { mode: 'steady', at: [0.1, 0.12, 0.5], aim: [0.1, 1, 0], face: [0, 0, 1], draw: 0.3 }, strike: { mode: 'steady', at: [0.06, 0.2, 0.58], aim: [0.12, 1, 0], face: [0, 0, 1], draw: 1 }, shoot: { mode: 'steady', at: [0.06, 0.2, 0.58], aim: [0.12, 1, 0], face: [0, 0, 1], draw: 1 }, cast: { mode: 'steady', at: [0.24, -0.2, 0.2], aim: [0, 1, 0.5], face: [0, -0.3, 1] } },
  crossbow: { idle: { mode: 'steady', at: [-0.2, -0.16, 0.32], aim: [0, -0.15, 1], face: [0, 1, 0], second: true, secondAt: 0.2 }, gait: { mode: 'steady', at: [-0.2, -0.14, 0.32], aim: [0, -0.1, 1], face: [0, 1, 0], second: true, secondAt: 0.2 }, ready: { mode: 'steady', at: [-0.1, 0.12, 0.42], aim: [0, 0, 1], face: [0, 1, 0], second: true, secondAt: 0.22 }, strike: { mode: 'steady', at: [-0.08, 0.18, 0.44], aim: [0, 0, 1], face: [0, 1, 0], second: true, secondAt: 0.22 }, shoot: { mode: 'steady', at: [-0.08, 0.18, 0.44], aim: [0, 0, 1], face: [0, 1, 0], second: true, secondAt: 0.22 }, cast: { mode: 'steady', at: [-0.2, -0.14, 0.32], aim: [0, -0.1, 1], face: [0, 1, 0], second: true, secondAt: 0.2 } },
  // a strapped shield rides the forearm; the guard brings the arm across the chest, face to the front
  shield: { idle: { mode: 'clip' }, gait: { mode: 'clip' }, ready: { mode: 'steady', at: [0.06, -0.02, 0.38], aim: [-0.3, 1, 0.1], face: [0, 0, 1], forearm: true }, strike: { mode: 'clip' }, cast: { mode: 'clip' }, shoot: { mode: 'clip' } },
  instrument: { idle: { mode: 'body' }, gait: { mode: 'body' }, ready: { mode: 'body' }, strike: { mode: 'body' }, cast: { mode: 'body' }, shoot: { mode: 'body' } },
  worn: { idle: { mode: 'body' }, gait: { mode: 'body' }, ready: { mode: 'body' }, strike: { mode: 'body' }, cast: { mode: 'body' }, shoot: { mode: 'body' } },
};
FAMILY_POSE.dual = FAMILY_POSE.sword;

/** The pose for a family in a state (seat and free fall back to idle / nothing). */
export function poseFor(family, state) {
  const t = FAMILY_POSE[family] || FAMILY_POSE.sword;
  if (state === 'free') return null;
  if (state === 'seat') return t.gait;
  return t[state] || t.idle;
}

/** Finger curl around a handle (radians per joint: knuckle, middle, tip) and the thumb's wrap. */
export const FIST = { fingers: [1.15, 1.35, 0.85], thumb: [0.35, 0.45, 0.5] };
/** A loose curl for a hand carrying a strapped shield or nothing in particular. */
export const LOOSE = { fingers: [0.45, 0.6, 0.35], thumb: [0.15, 0.2, 0.2] };

/** The handle's tilt toward the fingertips on the thumb side (a real fist crosses the palm diagonally), radians. */
export const GRIP_TILT = 0.36;
/** Where the closed fist's tunnel is, in the hand's anatomical frame: metres along the hand and toward the palm. */
export const FIST_AT = { along: 0.082, palm: 0.028 };

// ---------------------------------------------------------------- seats
/**
 * A Chibi 4 rider's seat: how far above the saddle's seat point the pelvis sits in each seated clip (metres, the
 * kit's own size), and the clip a vehicle kind plays. chibi4-held.js measures the pelvis in the clip itself; these are
 * the clearances on top (a saddle's leather, a thwart's plank).
 */
export const SEAT_CLEARANCE = { ride: 0.07, rideGallop: 0.07, boat: 0.05, sit: 0.04 };
export const SEAT_CLIP = { mount: 'ride', boat: 'sit', bench: 'sit' };
