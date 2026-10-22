// Chibi 2.5 (part B): the BODY builder options — pure data, no Three.js, so node tests, tools and game menus read it.
// Every field lives on `avatar.body` (the shared 2D normaliser keeps unknown keys there) and is read ONLY for a 2.5
// look (`body.v = 2.5`); a v2 look ignores all of it. Reached as `CHIBI25_OPTIONS.body` from chibi25-options.js.
//
//   body.shape     id from SHAPES       a body type: multipliers on the race's own proportions
//   body.shoulders 0..1 (0.5 = as the race has them)   shoulder width
//   body.legs      0..1 (0.5)            leg length against the torso
//   body.arms      0..1 (0.5)            arm thickness (and a little of the hands)
//   body.posture   id from POSTURES      a lean folded into every clip, on top of the race's own
//   body.tail      id from TAILS         a tail on the hips (any race; beastkin roll one)
//   body.height    0..1, as in v2 — but a 2.5 body maps it over a WIDER range (0 is shorter, 1 taller; 0.5 is the same)
import { OUTFIT25 } from './chibi25-outfits.js';

/** Body types. Each value multiplies the race's body numbers (width, shoulders, leg, torso, arm length) or, for
 *  `round`, is ADDED to the roundness; `armT` / `legT` thicken the limbs. */
export const SHAPES = {
  average: { name: 'Average' },
  slim: { name: 'Slim', width: 0.88, shoulders: 0.94, round: -0.1, armT: 0.86, legT: 0.88, leg: 1.03 },
  athletic: { name: 'Athletic', width: 1.0, shoulders: 1.1, round: -0.05, armT: 1.12, legT: 1.05 },
  broad: { name: 'Broad', width: 1.06, shoulders: 1.18, armT: 1.15, legT: 1.06, torso: 1.03 },
  stocky: { name: 'Stocky', width: 1.1, shoulders: 1.06, round: 0.12, armT: 1.12, legT: 1.12, leg: 0.9, torso: 0.97 },
  heavy: { name: 'Heavy', width: 1.14, shoulders: 1.04, round: 0.3, armT: 1.2, legT: 1.2, leg: 0.95 },
  petite: { name: 'Petite', width: 0.92, shoulders: 0.9, round: 0, armT: 0.9, legT: 0.92, leg: 0.94, torso: 0.95 },
  lanky: { name: 'Lanky', width: 0.9, shoulders: 0.98, round: -0.1, armT: 0.88, legT: 0.9, leg: 1.1, arm: 1.06 },
};

/** Postures: radians added to the race's chest / head lean (positive = forward) and knee bend. */
export const POSTURES = {
  neutral: { name: 'Neutral', chest: 0, head: 0, knees: 0 },
  upright: { name: 'Upright', chest: -0.05, head: -0.02, knees: 0 },
  proud: { name: 'Proud (chest out)', chest: -0.1, head: -0.06, knees: 0 },
  relaxed: { name: 'Relaxed', chest: 0.05, head: 0.03, knees: 0.03 },
  slouch: { name: 'Slouched', chest: 0.12, head: 0.06, knees: 0.04 },
  hunched: { name: 'Hunched', chest: 0.2, head: -0.1, knees: 0.1 },
};

/** Tails, built on the hips in chibi25-body-parts.js. */
export const TAILS = {
  none: { name: 'None' },
  wolf: { name: 'Wolf (bushy)' },
  cat: { name: 'Cat (thin, curled)' },
  fox: { name: 'Fox (bushy, white tip)' },
  lizard: { name: 'Lizard (thick, tapering)' },
  imp: { name: 'Imp (thin, arrow tip)' },
};

/** Which tail suits each race best (first = what a builder offers when the race changes). */
export const RACE_TAILS = { beast: ['wolf', 'cat', 'fox', 'lizard'], goblin: ['none', 'imp'], undead: ['none'], orc: ['none'], human: ['none'], elf: ['none'], dwarf: ['none'], giant: ['none'], halfling: ['none'] };

const slot = (table) => ({ ids: Object.keys(table), names: Object.fromEntries(Object.entries(table).map(([k, v]) => [k, v.name])) });

export const CHIBI25_BODY_OPTIONS = {
  shape: slot(SHAPES),
  posture: slot(POSTURES),
  tail: slot(TAILS),
  sliders: {
    height: { min: 0, max: 1, default: 0.5, note: '2.5 maps it over a wider range than v2 (0.5 is the same)' },
    width: { min: 0, max: 1, default: 0.5 },
    round: { min: 0, max: 1, default: null, note: 'unset = the race default' },
    shoulders: { min: 0, max: 1, default: 0.5 },
    legs: { min: 0, max: 1, default: 0.5, note: 'leg length against the torso' },
    arms: { min: 0, max: 1, default: 0.5, note: 'arm thickness' },
    headSize: { min: 0, max: 1, default: 0.5, note: '2.5 maps it over 0.72x..1.28x (v2: 0.86x..1.14x; 0.5 is the same); halflings and giants carry a 2.5 head tune (chibi25-body.js RACE25_TUNE)' },
  },
  raceTails: RACE_TAILS,
  /** The new clothes (any body may wear them; long hems want a 2.5 body). */
  outfit: Object.fromEntries(Object.entries(OUTFIT25).map(([s, t]) => [s, slot(t)])),
};
