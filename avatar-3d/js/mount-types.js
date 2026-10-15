// Mount catalog + spec normalising (play-test 2, Q16 "the owner wants to try a mount"). Pure: no Three.js,
// so servers, data tools and node tests read the same table the 3D builder (mounts.js) uses — the same
// split as creature-types.js / creatures.js.
//
// A MOUNT is a creature body (creatures.js) plus TACK (saddle, bridle, reins, maybe barding) plus a SEAT
// the rider's hips go on, and three gaits. The creature carries the proportions; this table only says
// which creature, how big, what colours and what it wears.
//
//   import { MOUNT_TYPES, mountSpecFor } from './mount-types.js';
//   mountSpecFor('riding_horse')                       // Thousandvale's mount ids
//   mountSpecFor({ creature: 'deer', size: 1.25 })     // stream A's `look` object
//   mountSpecFor('ram')                                // a MOUNT_TYPES key

/**
 * breed (play-test 4, S22): the hoofed mounts ride a body built for them (equine.js — a lofted barrel, an arched
 * neck, a long head, jointed legs with hooves, real walk / trot / gallop leg patterns). A type without a breed
 * (ram, drake) still rides its creatures.js body. `creature` stays for the creature table and stream A's looks.
 *
 * gaits: speeds in metres a second (at size 1). Below `walk` the mount stands; up to `trot` it walks;
 * up to `gallop` it trots (the quad's walk clip, which already moves the legs in diagonal pairs, run
 * faster); past that it gallops (the run clip). `pace` is the ground speed each clip covers at rate 1,
 * so the legs keep up with the ground instead of skating.
 */
const GAITS = { walk: 0.35, trot: 2.6, gallop: 5.2, pace: { walk: 1.6, run: 6.5 } };

export const MOUNT_TYPES = {
  horse: {
    label: 'Riding horse', creature: 'horse', breed: 'horse', size: 1,
    colors: { body: '#5a3e2a', belly: '#7a5a40', accent: '#1e1612' },
    tack: { kind: 'saddle', leather: '#5a3a22', cloth: '#7a2a24', metal: '#b8b0a0', bags: true },
    gaits: GAITS,
  },
  pony: {
    label: 'Moorland pony', creature: 'pony', breed: 'pony', size: 1,
    colors: { body: '#8a6a48', belly: '#c9b08a', accent: '#3a2a1c' },
    tack: { kind: 'saddle', leather: '#6a4a2a', cloth: '#3a5a3a', metal: '#a89a80', bags: true },
    gaits: { ...GAITS, trot: 2.2, gallop: 4.6, pace: { walk: 1.2, run: 5 } },
  },
  courser: {
    label: 'Grey courser', creature: 'courser', breed: 'courser', size: 1,
    colors: { body: '#9a9a96', belly: '#c8c8c2', accent: '#3a3a3a' },
    tack: { kind: 'saddle', leather: '#3a2a20', cloth: '#2a3a6a', metal: '#d0c8b0', bags: false },
    gaits: { ...GAITS, gallop: 5.6, pace: { walk: 1.8, run: 7.5 } },
  },
  warhorse: {
    label: 'Barded warhorse', creature: 'horse', breed: 'draft', size: 1.12,
    colors: { body: '#2e2a28', belly: '#4a423c', accent: '#8a1e1e', hair: '#141110' },
    tack: { kind: 'barding', leather: '#2a1e16', cloth: '#8a1e1e', trim: '#d8b060', metal: '#9aa0a8', bags: false },
    gaits: { ...GAITS, gallop: 5.4 },
  },
  stag: {
    label: 'Moor stag', creature: 'elk', breed: 'elk', size: 1,
    colors: { body: '#7a5634', belly: '#d8c2a0', accent: '#e8e0d0' },
    tack: { kind: 'saddle', leather: '#4a3018', cloth: '#5a7a3a', metal: '#c8b890', bags: false },
    gaits: { ...GAITS, gallop: 5.6, pace: { walk: 1.8, run: 7.5 } },
  },
  // play-test 4 (S22): Thousandvale's level-15 'Dray Elk' had no type and fell back to a plain horse. A heavy elk with
  // a broad breast-collar harness and packs: the beast of burden of the mounts.
  dray: {
    label: 'Dray elk', creature: 'elk', breed: 'elk_dray', size: 1.15,
    colors: { body: '#6a5a48', belly: '#b8a684', accent: '#3a2c1c' },
    tack: { kind: 'harness', leather: '#3a2618', cloth: '#6a4a2a', metal: '#a89a78', bags: true },
    gaits: { ...GAITS, trot: 2.3, gallop: 5.0 },
  },
  ram: {
    label: 'Crag ram', creature: 'ram', size: 1.25,
    colors: { body: '#8a7a66', belly: '#cfc2a8', accent: '#d8ccb0' },
    tack: { kind: 'ram_saddle', leather: '#4a3424', cloth: '#a8885a', fur: '#e8e0d0', metal: '#8a8a80', bags: true },
    gaits: { ...GAITS, trot: 2.2, gallop: 4.8, pace: { walk: 1.3, run: 5.2 } },
  },
  drake: {
    label: 'Mire drake', creature: 'drake', size: 1.7,
    colors: { body: '#4a6a3a', belly: '#b8b878', accent: '#2a3a20' },
    tack: { kind: 'drake_saddle', leather: '#3a2418', cloth: '#6a3a5a', metal: '#b0a070', bags: false },
    gaits: { ...GAITS, trot: 2.2, gallop: 4.8, pace: { walk: 1.4, run: 5.6 } },
  },
  // Thousandvale round 11 (owner live #48, World stream; opt-in rows — no other game names these keys): Vharlen's two
  // island lizards. The Ash Strider is the drake frame in soot and ochre, lighter-built; the Slag Basker is the crocodile
  // frame (broad, low, plated) in slag-black with ember-orange stripes.
  ash_strider: {
    label: 'Ash strider', creature: 'ash_strider', size: 1.45,          // (D-world round 11: its own long-legged build, creature-types.js)
    colors: { body: '#5a4a42', belly: '#c89a5a', accent: '#d0562a' },
    tack: { kind: 'drake_saddle', leather: '#2e1e16', cloth: '#a8452a', metal: '#c8a868', bags: false },
    gaits: { ...GAITS, trot: 2.4, gallop: 5.2, pace: { walk: 1.6, run: 6.2 } },
  },
  slag_basker: {
    label: 'Slag basker', creature: 'slag_basker', size: 1.5,          // (D-world round 11: broad, low and plated, creature-types.js)
    colors: { body: '#3a3634', belly: '#8a7a5a', accent: '#e07a2a' },
    tack: { kind: 'saddle', leather: '#3a2a1e', cloth: '#5a5048', metal: '#9a9080', bags: true },
    gaits: { ...GAITS, trot: 2.0, gallop: 4.4, pace: { walk: 1.2, run: 5.0 } },
  },
};

export const MOUNT_KEYS = Object.keys(MOUNT_TYPES);
export const MOUNT_GAITS = ['idle', 'walk', 'trot', 'gallop'];

/** Game ids (Thousandvale js/sim/mounts.js DEFAULT_MOUNTS) and creature ids that name a mount type. */
export const MOUNT_ALIASES = {
  riding_horse: 'horse', trail_horse: 'horse', grey_courser: 'courser', moor_stag: 'stag', barded_warhorse: 'warhorse',
  moor_pony: 'pony', crag_ram: 'ram', mire_drake: 'drake', dray_elk: 'dray',
  // creature ids (a `look.creature`)
  deer: 'stag', elk: 'stag', goat: 'ram', sheep: 'ram', dragon: 'drake',
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const typeOf = k => (typeof k === 'string' ? (MOUNT_TYPES[k] ? k : MOUNT_ALIASES[k] || null) : null);

/**
 * A normalised mount spec from a mount type key, a game id ('riding_horse'), or a look object
 * ({ id?, type?, creature?, size?, colors?, tack? }). Unknown -> a horse.
 *   -> { type, creature, size, colors: {body, belly, accent}, tack: {kind, ...} }
 */
export function mountSpecFor(input) {
  let type = null, look = null;
  if (typeof input === 'string') type = typeOf(input);
  else if (input && typeof input === 'object') {
    look = input;
    type = typeOf(input.type) || typeOf(input.id) || typeOf(input.mount) || null;
    // a horse look from a game: a warhorse when it is big and dark-cloth, else a plain horse
    if (!type && input.creature) type = input.creature === 'horse' ? ((input.size || 1) >= 1.1 ? 'warhorse' : (input.size || 1) < 0.9 ? 'pony' : 'horse') : typeOf(input.creature);
  }
  type = type || 'horse';
  const T = MOUNT_TYPES[type];
  const colors = { ...T.colors };
  if (look?.colors) for (const k of ['body', 'belly', 'accent']) if (typeof look.colors[k] === 'string' && HEX.test(look.colors[k])) colors[k] = look.colors[k];
  // The type carries the proportions, so its own size wins: a game's look sizes are for the creature frame
  // it guessed at (A sends the pony as a 0.82 horse; here the pony has its own frame). `look.scale` multiplies.
  let size = T.size;
  if (look && Number.isFinite(look.scale) && look.scale > 0) size = +Math.max(0.5, Math.min(2.5, T.size * look.scale)).toFixed(3);
  const tack = { ...T.tack, ...(look?.tack && typeof look.tack === 'object' ? look.tack : {}) };
  return { type, creature: T.creature, breed: T.breed || null, size, colors, tack, label: T.label };
}

/** Which gait a ground speed (m/s) is at, for a spec/type. Pure: the gallery, tests and games agree. */
export function gaitFor(speed, type = 'horse') {
  const G = (MOUNT_TYPES[typeof type === 'string' ? (typeOf(type) || 'horse') : type?.type || 'horse'] || MOUNT_TYPES.horse).gaits;
  const s = Math.abs(+speed || 0);
  return s < G.walk ? 'idle' : s < G.trot ? 'walk' : s < G.gallop ? 'trot' : 'gallop';
}
