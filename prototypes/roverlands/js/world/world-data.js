// Roverlands world tables — the data the world generator reads. Plain data, no code paths.
//
// Why a JS module and not data/world.json: `generateWorld()` is synchronous and runs in Node (tests, a future server)
// AND in the browser. A JSON file would need fs in one and fetch in the other, which makes the generator async on one
// side only. A plain data module imports the same way everywhere. Change numbers here, not in worldgen.js.

/** Ground surfaces. index = surface id. Ids are part of the contract (docs/PLAN.md) — never renumber, only append.
 *  grip = tyre friction multiplier, sink = how far a wheel sinks (m), drag = rolling resistance multiplier,
 *  rut = how deep a track it leaves (0..1), dust = particle colour. */
export const SURFACES = [
  { id: 0, name: 'grass',    grip: 1.0,  sink: 0.00, drag: 1.0, rut: 0.15, dust: '#7a8a4a' },
  { id: 1, name: 'dirt',     grip: 0.95, sink: 0.01, drag: 1.1, rut: 0.45, dust: '#8a6a44' },
  { id: 2, name: 'mud',      grip: 0.55, sink: 0.12, drag: 2.6, rut: 1.00, dust: '#4a3a28' },
  { id: 3, name: 'sand',     grip: 0.70, sink: 0.06, drag: 1.8, rut: 0.70, dust: '#d8c08a' },
  { id: 4, name: 'gravel',   grip: 0.85, sink: 0.01, drag: 1.2, rut: 0.30, dust: '#9a948a' },
  { id: 5, name: 'rock',     grip: 1.05, sink: 0.00, drag: 1.0, rut: 0.00, dust: '#8a8a8a' },
  { id: 6, name: 'snow',     grip: 0.50, sink: 0.08, drag: 1.6, rut: 0.80, dust: '#f0f4f8' },
  { id: 7, name: 'road',     grip: 1.15, sink: 0.00, drag: 0.9, rut: 0.05, dust: '#6a6660' },
  { id: 8, name: 'ice',      grip: 0.25, sink: 0.00, drag: 0.9, rut: 0.05, dust: '#dfeefa' },
  { id: 9, name: 'farm',     grip: 0.90, sink: 0.03, drag: 1.3, rut: 0.55, dust: '#9a7a4a' },
  { id: 10, name: 'shallows', grip: 0.70, sink: 0.05, drag: 2.0, rut: 0.30, dust: '#9ab8c8' },
];
export const SURF = Object.fromEntries(SURFACES.map(s => [s.name, s.id]));

/** Biomes. index = biome id (world.biome holds one per sample). `label` is what the map / HUD shows.
 *  `map` = the colour on the top-down map. `tint` = vertex colour the ground shader multiplies its textures by. */
export const BIOMES = [
  { id: 0, key: 'meadow', label: 'Long Meadow',      map: '#7f9a4c', tint: [1.00, 1.00, 0.92] },
  { id: 1, key: 'pine',   label: 'Pine ridge',       map: '#3f6a3c', tint: [0.86, 0.94, 0.86] },
  { id: 2, key: 'birch',  label: 'Birch wood',       map: '#8aa556', tint: [1.04, 1.04, 0.90] },
  { id: 3, key: 'bog',    label: 'Mudflats',         map: '#6a5e3e', tint: [0.86, 0.86, 0.76] },
  { id: 4, key: 'river',  label: 'River valley',     map: '#6f9a5a', tint: [0.94, 1.02, 0.94] },
  { id: 5, key: 'canyon', label: 'Red-rock canyon',  map: '#b4643c', tint: [1.38, 0.80, 0.56] },
  { id: 6, key: 'dunes',  label: 'Dunes',            map: '#d9bf86', tint: [1.04, 0.98, 0.88] },
  { id: 7, key: 'snow',   label: 'Snowy uplands',    map: '#e4eaee', tint: [0.98, 1.00, 1.04] },
  { id: 8, key: 'farm',   label: 'Farmland',         map: '#b5a160', tint: [1.04, 1.00, 0.86] },
  { id: 9, key: 'lot',    label: 'Sandbox lot',      map: '#9a8a6a', tint: [1.00, 0.96, 0.90] },
];
export const BIOME = Object.fromEntries(BIOMES.map(b => [b.key, b.id]));

/**
 * Where each biome sits: anchor points (before a domain warp of about +-80 m). A sample belongs to the biome of its
 * nearest anchor; heights blend between the nearest few. Coordinates in metres, x east, z south, origin = map centre.
 * Home is at the SOUTH edge (z ~ +640); the river crosses the whole map east-west around z ~ +200, so every drive
 * north crosses it — by one of two fords or the bridge.
 */
export const ANCHORS = [
  // south band — home side
  ['meadow', 0, 610], ['meadow', -120, 470], ['meadow', 170, 470], ['meadow', 40, 360], ['meadow', 300, 700],
  ['farm', -440, 560], ['farm', -620, 420], ['farm', -330, 690], ['farm', -650, 650],
  ['birch', 400, 380], ['birch', 640, 330], ['birch', 260, 300], ['birch', 680, 520],
  ['lot', 470, 610],
  // north of the river
  ['bog', -470, 40], ['bog', -640, 110], ['bog', -300, 70], ['bog', -560, -60],
  ['pine', -60, -90], ['pine', 160, -40], ['pine', -250, -230], ['pine', 60, 30], ['pine', 210, -260], ['pine', -380, -160],
  ['snow', 40, -590], ['snow', 230, -640], ['snow', -160, -520], ['snow', -40, -700],
  ['canyon', 520, -260], ['canyon', 640, -40], ['canyon', 400, -470], ['canyon', 660, -520], ['canyon', 420, -100],
  ['dunes', -560, -470], ['dunes', -360, -620], ['dunes', -680, -290], ['dunes', -650, -680],
];

/** Fixed places. Everything the roads join, plus the four flags. */
export const PLACES = {
  home:    { x: 0, z: 640, r: 34, padW: 120, padD: 64 },
  sandbox: { x: 470, z: 610, w: 190, d: 140 },
  // the river: centreline z = RIVER.z0 + sum(a * sin(x * f + p)) + a little noise; water drops toward the east
  river:   { z0: 205, waves: [[62, 0.0062, 0.6], [30, 0.0165, 2.1]], width: [10, 15], levelWest: -1.0, fall: 0.0030 },
  fords:   [{ id: 'ford_w', x: -330, name: 'Shingle Ford' }, { id: 'ford_e', x: 330, name: 'Otter Ford' }],
  bridge:  { x: 80, w: 6.4, name: 'Old Timber Bridge' },
  lake:    { x: -190, z: 430, r: 46, name: 'Glassmere' },
  icePond: { x: -170, z: -430, r: 34, name: 'Rime Pond' },
  runway:  { x: -80, z: 525, len: 300, w: 20 },   // east-west, open meadow between the lake and home
  mesa:    { x: 540, z: -340, r: 48, top: 72, apronZ: [-292, -212] },
  summit:  { x: 60, z: -610 },
  flags: [
    { id: 'river',  name: 'River Bluff',     note: 'across the river' },
    { id: 'bog',    name: 'Fen Heart',       note: 'middle of the mudflats' },
    { id: 'canyon', name: 'Mesa Crown',      note: 'top of the red-rock canyon' },
    { id: 'summit', name: 'Whitecap Summit', note: 'snowy summit' },
  ],
};

/** Names drawn on the map (biome names come from the biome table where a biome is big). */
export const PLACE_NAMES = {
  home: 'Home base', sandbox: 'Sandbox lot', river: 'Wending River', bog: 'Brackwater Fen',
  pine: 'Tallpine Ridge', birch: 'Paleleaf Wood', farm: 'Haystead Farms', canyon: 'Rustgate Canyon',
  dunes: 'Saltwind Dunes', snow: 'Whitecap Heights', meadow: 'Long Meadow',
};

/** Road classes. halfW = half the drivable width (m); shoulder = the blend back into the land; maxGrade is what the
 *  router aims for (the profile is clamped to `clamp`). surface = the SURFACES id it paints. */
export const ROAD_CLASSES = {
  road:   { halfW: 3.6, shoulder: 7, maxGrade: 0.40, clamp: 0.18, surface: 7, smooth: 7 },
  gravel: { halfW: 2.7, shoulder: 6, maxGrade: 0.45, clamp: 0.19, surface: 4, smooth: 6 },
  track:  { halfW: 1.9, shoulder: 4, maxGrade: 0.60, clamp: 0.34, surface: 1, smooth: 3 },
};

/**
 * Object kinds. Collider sizes are AT s = 1 and scale with s. breakAt = impulse (N·s) that breaks it, null = never.
 * fall: what a broken one does. h = nominal visual height at s = 1 (the renderer scales its model to it).
 */
export const KINDS = {
  tree_pine:   { h: 16, r: 0.26, colH: 7.0, mass: 1100, fall: 'topple' },
  tree_birch:  { h: 12, r: 0.15, colH: 6.0, mass: 420,  fall: 'topple' },
  tree_oak:    { h: 13, r: 0.42, colH: 5.0, mass: 2600, fall: 'topple' },
  sapling:     { h: 2.4, r: 0.06, colH: 1.8, mass: 60, breakAt: 3000, fall: 'topple' },
  bush:        { h: 1.1, r: 0.55, colH: 1.0, mass: 20, breakAt: 800, fall: 'flatten' },
  reeds:       { h: 1.4, r: 0.45, colH: 1.2, mass: 5, breakAt: 250, fall: 'flatten' },
  fence:       { hx: 1.2, hy: 0.6, hz: 0.06, mass: 25, breakAt: 4000, fall: 'topple' },
  fence_post:  { r: 0.08, colH: 1.25, mass: 12, breakAt: 2500, fall: 'topple' },
  log:         { r: 0.35, mass: 900, breakAt: null, fall: 'topple' },
  rock_s:      { r: 0.45, colH: 0.55, breakAt: null },
  rock_m:      { r: 0.95, colH: 1.1, breakAt: null },
  rock_l:      { r: 1.8, colH: 2.0, breakAt: null },
  boulder:     { r: 2.8, colH: 3.2, breakAt: null },
  ramp:        { breakAt: null },
  crate:       { hx: 0.5, hy: 0.5, hz: 0.5, mass: 30, breakAt: 2500, fall: 'shatter' },
  barrel:      { r: 0.36, colH: 1.0, mass: 60, breakAt: 3000, fall: 'topple' },
  hay_bale:    { r: 0.75, colH: 1.25, mass: 250, breakAt: 6000, fall: 'topple' },
  sign:        { r: 0.1, colH: 2.2, mass: 15, breakAt: 3500, fall: 'topple' },
  bridge_deck: { breakAt: null },
  bridge_rail: { breakAt: null },
  bridge_pier: { breakAt: null },
  shed:        { breakAt: null },
};

/**
 * Scatter rules per biome. `step` = jittered grid spacing (m) for the candidate points. Each candidate rolls once
 * against the list in order; `p` is the chance per candidate where the clump noise is at its densest.
 * `clump` (0..1) = how much a slow noise gathers that kind into groves (0 = even everywhere).
 * look = the model the renderer draws (a highdef-3d kit species); `s` = [min, max] scale.
 */
export const SCATTER = {
  step: 6,
  density: 0.84,   // one knob over every rule's p: keeps the collidable count near 6k for the physics
  biomes: {
    meadow: [
      { kind: 'tree_oak', p: 0.020, clump: 0.8, s: [0.7, 1.15], look: ['oak', 'beech'] },
      { kind: 'bush', p: 0.012, clump: 0.5, s: [0.8, 1.4], look: ['shrub', 'berry_bush'] },
      { kind: 'sapling', p: 0.008, clump: 0.6, s: [0.8, 1.2], look: ['sapling'] },
      { kind: 'rock_s', p: 0.006, clump: 0.3, s: [0.7, 1.3], look: ['stone', 'mossy_boulder'] },
      { kind: 'boulder', p: 0.0015, clump: 0.2, s: [0.6, 1.0], look: ['mossy_boulder', 'cracked_boulder'] },
    ],
    pine: [
      { kind: 'tree_pine', p: 0.17, clump: 0.55, s: [0.62, 1.15], look: ['pine', 'spruce', 'fir'] },
      { kind: 'sapling', p: 0.025, clump: 0.4, s: [0.7, 1.2], look: ['sapling'] },
      { kind: 'bush', p: 0.02, clump: 0.4, s: [0.7, 1.2], look: ['juniper', 'shrub'] },
      { kind: 'rock_m', p: 0.020, clump: 0.3, s: [0.7, 1.3], look: ['boulder', 'mossy_boulder', 'slab'] },
      { kind: 'log', p: 0.010, clump: 0.3, s: [0.8, 1.2], look: ['log'] },
      { kind: 'boulder', p: 0.004, clump: 0.3, s: [0.6, 1.0], look: ['boulder', 'cracked_boulder'] },
    ],
    birch: [
      { kind: 'tree_birch', p: 0.22, clump: 0.5, s: [0.6, 1.15], look: ['birch'] },
      { kind: 'sapling', p: 0.03, clump: 0.4, s: [0.7, 1.2], look: ['sapling'] },
      { kind: 'bush', p: 0.025, clump: 0.4, s: [0.7, 1.3], look: ['shrub', 'bramble', 'berry_bush'] },
      { kind: 'log', p: 0.008, clump: 0.3, s: [0.7, 1.0], look: ['log'] },
      { kind: 'rock_s', p: 0.006, clump: 0.3, s: [0.7, 1.2], look: ['mossy_boulder'] },
    ],
    bog: [
      { kind: 'log', p: 0.050, clump: 0.5, s: [0.8, 1.4], look: ['log'] },
      { kind: 'reeds', p: 0.06, clump: 0.7, s: [0.8, 1.3], look: ['reed', 'cattail'] },
      { kind: 'tree_birch', p: 0.018, clump: 0.6, s: [0.45, 0.8], look: ['birch', 'dead_snag'] },
      { kind: 'bush', p: 0.02, clump: 0.5, s: [0.6, 1.0], look: ['bramble', 'heather'] },
      { kind: 'sapling', p: 0.015, clump: 0.5, s: [0.6, 1.0], look: ['sapling'] },
    ],
    river: [
      { kind: 'tree_oak', p: 0.016, clump: 0.7, s: [0.65, 1.0], look: ['willow', 'oak'] },
      { kind: 'bush', p: 0.03, clump: 0.5, s: [0.7, 1.2], look: ['shrub', 'bramble'] },
      { kind: 'rock_s', p: 0.008, clump: 0.4, s: [0.7, 1.3], look: ['stone', 'boulder'] },
    ],
    canyon: [
      { kind: 'rock_m', p: 0.028, clump: 0.4, s: [0.7, 1.4], look: ['slab', 'boulder', 'cracked_boulder'] },
      { kind: 'boulder', p: 0.010, clump: 0.4, s: [0.6, 1.1], look: ['boulder', 'cracked_boulder'] },
      { kind: 'rock_l', p: 0.008, clump: 0.4, s: [0.7, 1.2], look: ['rock_cluster', 'slab'] },
      { kind: 'bush', p: 0.020, clump: 0.3, s: [0.6, 1.0], look: ['juniper'] },
      { kind: 'rock_s', p: 0.012, clump: 0.3, s: [0.6, 1.2], look: ['stone', 'shard'] },
    ],
    dunes: [
      { kind: 'bush', p: 0.010, clump: 0.6, s: [0.5, 0.9], look: ['juniper', 'heather'] },
      { kind: 'rock_s', p: 0.004, clump: 0.4, s: [0.6, 1.2], look: ['stone', 'slab'] },
      { kind: 'rock_l', p: 0.0012, clump: 0.4, s: [0.6, 1.0], look: ['slab'] },
    ],
    snow: [
      { kind: 'tree_pine', p: 0.06, clump: 0.7, s: [0.5, 0.95], look: ['frost_fir'] },
      { kind: 'rock_m', p: 0.020, clump: 0.4, s: [0.7, 1.3], look: ['boulder', 'slab'] },
      { kind: 'boulder', p: 0.006, clump: 0.4, s: [0.6, 1.0], look: ['boulder'] },
      { kind: 'bush', p: 0.008, clump: 0.5, s: [0.5, 0.8], look: ['juniper'] },
    ],
    farm: [
      { kind: 'tree_oak', p: 0.004, clump: 0.6, s: [0.8, 1.2], look: ['oak'] },
    ],
    lot: [],
  },
  /** Ground plants that never collide: drawn, not simulated. `p` per decor candidate (step 3 m). */
  decorStep: 3.2,
  decor: {
    meadow: [{ kind: 'flower', p: 0.05, look: ['daisy', 'bluebell', 'thistle'] }, { kind: 'pebble', p: 0.01, look: ['pebble'] }],
    pine:   [{ kind: 'fern', p: 0.10, look: ['fern'] }, { kind: 'mushroom', p: 0.02, look: ['mushroom_cap', 'toadstool'] }, { kind: 'debris', p: 0.012, look: ['branch_pile'] }],
    birch:  [{ kind: 'fern', p: 0.10, look: ['fern', 'broadleaf'] }, { kind: 'flower', p: 0.03, look: ['bluebell'] }],
    bog:    [{ kind: 'reed', p: 0.12, look: ['reed', 'cattail'] }, { kind: 'debris', p: 0.01, look: ['branch_pile'] }],
    river:  [{ kind: 'flower', p: 0.025, look: ['daisy'] }, { kind: 'pebble', p: 0.02, look: ['pebble'] }],
    canyon: [{ kind: 'pebble', p: 0.04, look: ['pebble'] }],
    dunes:  [],
    snow:   [{ kind: 'pebble', p: 0.01, look: ['pebble'] }],
    farm:   [{ kind: 'flower', p: 0.01, look: ['daisy'] }],
    lot:    [],
  },
};
