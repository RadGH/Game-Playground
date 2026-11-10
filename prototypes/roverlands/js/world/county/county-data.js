// Wayfare County — the layout tables the county generator reads. Plain data, no code paths (see world-data.js for why
// it is a JS module and not JSON). Coordinates in metres: x east, z SOUTH, origin = the middle of the map, which runs
// from -1536 to +1536 on both axes. Every name here is original.
//
//   z = -1536 north   Greyspine Mountains (ridged peaks to ~330 m, snow) ................ Rustwild badlands (mesas)
//                     Elderwood (giant trees)     Highgate on its plateau (cliffs, switchback up the south face)
//                     Lindell Water + Port Lindell        Wayfare Vale        Tollen Gorge (sheer walls)
//            ~~~~~~~~~~~~~~~~~~ Tollen River, west -> east, through the lake and the gorge ~~~~~~~~~~~~~~~~~~~~
//                     Marrow Flats + the farm belt          Copper Hills + Copperton
//   z = +1536 south                      Wayfare Field (1.1 km runway)                    Skyreach launch site

export const COUNTY = { size: 3072, cell: 2 };

export const C = {
  // the river: a function of x (one centreline z per column), like the classic river, so the water view works as-is
  river: { z0: 230, waves: [[60, 0.0021, 0.4], [34, 0.0057, 1.3]], noise: 26, width: [14, 19], fall: 0.0028,
    gorge: { x0: 250, x1: 790, ramp: 70, drop: 5.0 } },
  lake: { x: -880, r: 205, name: 'Lindell Water' },          // z = the river's z at lake.x; the river runs through it
  ford: { x: -60, name: 'Pebblerun Ford' },
  bridges: [
    { id: 'lindell', x: -330, name: 'Lindell Crossing', extra: 14 },
    { id: 'gorge', x: 520, name: 'Tollen Gorge Bridge', extra: 12, high: true },
    { id: 'east', x: 1150, name: 'Eastwater Bridge', extra: 14 },
  ],
  plateau: { x: 160, z: -940, r: 330, top: 176, cliff: 74, cliffW: 13, name: 'Highgate Plateau' },
  // the switchback up the plateau's south face, on a spur of ground that runs out of the rim to the vale:
  // x = the spur's crest line (it wanders by `wobble` m), gA = its fall along the crest, W = its half width before the
  // flanks steepen, drop = how much lower the core's edges are than its crest. The road: `grade` on the legs,
  // `hairGrade` round the hairpins (radius R), each leg turning `legEnd` m from the crest (picked per leg), the first
  // leg starting `startX` m west of the crest.
  switchback: { x: 175, wobble: 22, gA: 0.35, W: 125, drop: 10, grade: 0.1, hairGrade: 0.055, R: [14, 18], legEnd: [62, 118], startX: 50 },
  mountains: [[-1760, -620], [-1300, -880], [-940, -1240], [-420, -1390], [240, -1500], [860, -1530]],
  // named peaks: within r m the range is lifted toward a summit about `h` m high (the range's own ridges carry on up it)
  peaks: [
    { id: 'thornhorn', name: 'Thornhorn', x: -1150, z: -1080, h: 400, r: 430 },
    { id: 'wardenspire', name: 'Wardenspire', x: -560, z: -1335, h: 380, r: 360 },
  ],
  // scree: how much of the hollow at a cliff's foot fills with fallen rock (0..1), by region
  scree: { mountain: 0.7, badlands: 0.42, hills: 0.5, blur: 6 },
  hills: { x: 560, z: 430, rx: 500, rz: 400 },
  giantwood: { x: -1120, z: -330, r: 330 },
  badlands: { x0: 470, z0: -260 },                           // east of x0 and north of z0 (warped edges)
  farmBelt: { x0: -230, z0: 560 },                           // west of x0 and south of z0
  airport: { x: 400, z: 1190, len: 1100, w: 30, name: 'Wayfare Field' },
  launch: { x: 1290, z: 1250, r: 70, name: 'Skyreach Launch Site' },
  junction: { x: -40, z: -170, name: 'Vale Crossroads' },
  // a cuesta across the vale: a cliff step `h` m up to the north (sheer, `width` m), a gentle dip slope behind it.
  // At each x in `gaps` the step widens to a ramp (roads find it).
  scarp: { name: 'Brokenback Scarp', line: [[-620, -470], [-300, -390], [40, -420], [360, -330], [600, -300]], h: 30, width: 8, gaps: [10, -420] },
};

/**
 * Cities: a street grid of nx x nz blocks (B m square, streets S m wide between and around them), flattened to one
 * height. `special` claims whole blocks for landmarks, by [column, row] (0,0 = north-west block). `style` picks the
 * building look. Gates are where the outer streets meet the county roads.
 */
export const CITIES = [
  { id: 'marrow_flats', name: 'Marrow Flats', x: -700, z: 900, nx: 4, nz: 3, B: 58, S: 10, style: 'farm',
    special: { garage: [1, 1], depot: [3, 2], market: [2, 1], fire_station: [0, 2], outfitter: [2, 0], supply: [1, 0], tow_yard: [3, 0] } },
  { id: 'port_lindell', name: 'Port Lindell', x: -470, z: -70, nx: 5, nz: 4, B: 56, S: 10, style: 'port',
    special: { garage: [3, 3], depot: [4, 2], hospital: [2, 1], fire_station: [1, 3], outfitter: [1, 1], supply: [3, 1], tow_yard: [0, 2] } },
  { id: 'highgate', name: 'Highgate', x: 175, z: -965, nx: 4, nz: 4, B: 54, S: 10, style: 'stone',
    special: { garage: [1, 3], depot: [3, 3], hospital: [2, 1], survey_office: [1, 1], outfitter: [3, 1], supply: [0, 2] } },
  { id: 'copperton', name: 'Copperton', x: 720, z: 650, nx: 4, nz: 3, B: 56, S: 10, style: 'brick',
    special: { garage: [0, 1], depot: [3, 1], tow_yard: [2, 2], outfitter: [1, 0], supply: [2, 0] } },
];

export const PLACE_LABELS = {
  garage: 'Garage', depot: 'Freight Depot', market: 'Produce Market', fire_station: 'Fire Station', outfitter: 'Outfitter',
  supply: 'Supply Store', tow_yard: 'Tow Yard', hospital: 'Hospital', survey_office: 'Survey Office',
};

/** Building looks per city style: wall colours, roof colours, heights (m), roof kind. */
export const STYLES = {
  farm:  { walls: [[0.86, 0.80, 0.68], [0.74, 0.62, 0.48], [0.92, 0.88, 0.80], [0.68, 0.70, 0.62]], roofs: [[0.46, 0.24, 0.20], [0.34, 0.30, 0.28]], h: [4, 8], roof: 'gable', lot: [14, 22] },
  port:  { walls: [[0.78, 0.80, 0.82], [0.62, 0.66, 0.72], [0.86, 0.82, 0.74], [0.55, 0.58, 0.60]], roofs: [[0.30, 0.32, 0.34]], h: [8, 30], roof: 'flat', lot: [16, 26] },
  stone: { walls: [[0.72, 0.70, 0.66], [0.80, 0.78, 0.72], [0.62, 0.60, 0.58]], roofs: [[0.28, 0.30, 0.36], [0.36, 0.30, 0.28]], h: [6, 18], roof: 'gable', lot: [14, 22] },
  brick: { walls: [[0.62, 0.36, 0.28], [0.70, 0.44, 0.32], [0.54, 0.40, 0.34], [0.78, 0.66, 0.52]], roofs: [[0.30, 0.26, 0.24]], h: [5, 14], roof: 'flat', lot: [14, 22] },
};

/** Vehicles waiting on each garage's pads (data/vehicles.json ids), and at the other yards. */
export const GARAGE_VEHICLES = {
  marrow_flats: ['trail_jeep', 'sedan', 'quad', 'dirtbike'],
  port_lindell: ['sedan', 'police_car', 'ambulance', 'fire_truck'],
  highgate: ['trail_jeep', 'dune_buggy', 'quad', 'motorcycle'],
  copperton: ['army_truck', 'tank', 'hover_tank', 'dune_buggy'],
};
export const DEPOT_VEHICLES = ['semi_truck', 'trailer_box'];

/** Region labels on the map (fixed spots). */
export const REGION_LABELS = [
  [-900, -1180, 'Greyspine Mountains'], [160, -1180, 'Highgate Plateau'], [1050, -900, 'Rustwild'],
  [-1120, -330, 'Elderwood'], [-60, 140, 'Wayfare Vale'], [560, 380, 'Copper Hills'], [-1000, 1150, 'Marrow Flats farms'],
  [520, 120, 'Tollen Gorge'],
];

/** Raider camp spots in the Rustwild (jittered per seed, moved to the nearest flat ground). */
export const CAMPS = [
  { id: 'camp_redcut', name: 'Redcut Camp', x: 760, z: -560 },
  { id: 'camp_scrapper', name: 'Scrapper Hollow', x: 1150, z: -480 },
  { id: 'camp_dustjaw', name: 'Dustjaw Camp', x: 1320, z: -900 },
  { id: 'camp_ironbluff', name: 'Ironbluff Camp', x: 900, z: -1150 },
  { id: 'camp_saltpan', name: 'Saltpan Camp', x: 1250, z: -1330 },
];

/** Scatter rules per county biome (same shape as world-data.js SCATTER.biomes). */
export const COUNTY_SCATTER = {
  step: 6,
  density: 0.7,
  decorStep: 3.6,
  biomes: {
    river: [
      { kind: 'tree_oak', p: 0.02, clump: 0.7, s: [0.65, 1.0], look: ['willow', 'oak'] },
      { kind: 'bush', p: 0.03, clump: 0.5, s: [0.7, 1.2], look: ['shrub', 'bramble'] },
      { kind: 'rock_s', p: 0.008, clump: 0.4, s: [0.7, 1.3], look: ['stone', 'boulder'] },
    ],
    c_vale: [
      { kind: 'tree_oak', p: 0.018, clump: 0.85, s: [0.7, 1.2], look: ['oak', 'beech'] },
      { kind: 'tree_birch', p: 0.02, clump: 0.85, s: [0.6, 1.1], look: ['birch'] },
      { kind: 'bush', p: 0.012, clump: 0.5, s: [0.8, 1.4], look: ['shrub', 'berry_bush'] },
      { kind: 'rock_s', p: 0.005, clump: 0.3, s: [0.7, 1.3], look: ['stone', 'mossy_boulder'] },
      { kind: 'boulder', p: 0.0012, clump: 0.2, s: [0.6, 1.0], look: ['mossy_boulder', 'cracked_boulder'] },
    ],
    c_forest: [
      { kind: 'tree_pine', p: 0.16, clump: 0.55, s: [0.62, 1.2], look: ['pine', 'spruce', 'fir'] },
      { kind: 'sapling', p: 0.02, clump: 0.4, s: [0.7, 1.2], look: ['sapling'] },
      { kind: 'bush', p: 0.02, clump: 0.4, s: [0.7, 1.2], look: ['juniper', 'shrub'] },
      { kind: 'rock_m', p: 0.018, clump: 0.3, s: [0.7, 1.3], look: ['boulder', 'mossy_boulder', 'slab'] },
      { kind: 'log', p: 0.008, clump: 0.3, s: [0.8, 1.2], look: ['log'] },
    ],
    c_giantwood: [
      { kind: 'tree_giant', p: 0.05, clump: 0.25, s: [0.8, 1.2], look: ['giant_spruce', 'giant_fir', 'giant_pine'], space: 6 },
      { kind: 'tree_pine', p: 0.05, clump: 0.5, s: [0.6, 1.0], look: ['spruce', 'fir'] },
      { kind: 'bush', p: 0.03, clump: 0.5, s: [0.8, 1.4], look: ['shrub', 'berry_bush'] },
      { kind: 'rock_m', p: 0.012, clump: 0.4, s: [0.7, 1.3], look: ['mossy_boulder'] },
      { kind: 'log', p: 0.012, clump: 0.4, s: [0.9, 1.3], look: ['log'] },
    ],
    c_mountain: [
      { kind: 'tree_pine', p: 0.04, clump: 0.7, s: [0.5, 0.95], look: ['frost_fir', 'fir'] },
      { kind: 'rock_m', p: 0.02, clump: 0.4, s: [0.7, 1.3], look: ['boulder', 'slab'] },
      { kind: 'boulder', p: 0.008, clump: 0.4, s: [0.6, 1.1], look: ['boulder', 'cracked_boulder'], maxSlope: 0.8 },
      { kind: 'rock_l', p: 0.006, clump: 0.4, s: [0.7, 1.2], look: ['rock_cluster', 'slab'], tint: [0.94, 0.96, 1.02] },
    ],
    c_plateau: [
      { kind: 'tree_pine', p: 0.025, clump: 0.8, s: [0.6, 1.0], look: ['pine', 'fir'] },
      { kind: 'bush', p: 0.012, clump: 0.5, s: [0.6, 1.0], look: ['juniper', 'heather'] },
      { kind: 'rock_s', p: 0.008, clump: 0.3, s: [0.7, 1.2], look: ['stone', 'slab'] },
    ],
    c_badlands: [
      { kind: 'rock_m', p: 0.024, clump: 0.4, s: [0.7, 1.4], look: ['slab', 'boulder', 'cracked_boulder'], tint: [1.28, 0.82, 0.62] },
      { kind: 'boulder', p: 0.008, clump: 0.4, s: [0.6, 1.1], look: ['boulder', 'cracked_boulder'], tint: [1.28, 0.82, 0.62] },
      { kind: 'rock_l', p: 0.006, clump: 0.4, s: [0.7, 1.2], look: ['rock_cluster', 'slab'], tint: [1.28, 0.82, 0.62] },
      { kind: 'bush', p: 0.012, clump: 0.3, s: [0.5, 0.9], look: ['juniper', 'heather'] },
    ],
    c_hills: [
      { kind: 'tree_oak', p: 0.016, clump: 0.8, s: [0.7, 1.1], look: ['oak', 'beech'] },
      { kind: 'tree_pine', p: 0.03, clump: 0.8, s: [0.6, 1.0], look: ['pine'] },
      { kind: 'bush', p: 0.016, clump: 0.5, s: [0.7, 1.2], look: ['juniper', 'shrub'] },
      { kind: 'rock_m', p: 0.012, clump: 0.4, s: [0.7, 1.2], look: ['boulder', 'slab'], tint: [1.12, 0.92, 0.78] },
    ],
    c_farm: [{ kind: 'tree_oak', p: 0.003, clump: 0.6, s: [0.8, 1.2], look: ['oak'] }],
    c_shore: [
      { kind: 'tree_oak', p: 0.02, clump: 0.7, s: [0.65, 1.0], look: ['willow'] },
      { kind: 'reeds', p: 0.03, clump: 0.7, s: [0.8, 1.3], look: ['reed', 'cattail'] },
      { kind: 'rock_s', p: 0.008, clump: 0.4, s: [0.7, 1.2], look: ['stone'] },
    ],
    c_gorge: [
      { kind: 'rock_m', p: 0.02, clump: 0.4, s: [0.7, 1.3], look: ['slab', 'boulder'], tint: [1.12, 0.9, 0.76] },
      { kind: 'bush', p: 0.01, clump: 0.4, s: [0.6, 1.0], look: ['juniper'] },
    ],
    c_city: [], c_airfield: [],
  },
  decor: {
    river: [{ kind: 'flower', p: 0.02, look: ['daisy'] }, { kind: 'pebble', p: 0.02, look: ['pebble'] }],
    c_vale: [{ kind: 'flower', p: 0.04, look: ['daisy', 'bluebell', 'thistle'] }, { kind: 'pebble', p: 0.008, look: ['pebble'] }],
    c_forest: [{ kind: 'fern', p: 0.09, look: ['fern'] }, { kind: 'mushroom', p: 0.015, look: ['mushroom_cap', 'toadstool'] }, { kind: 'debris', p: 0.01, look: ['branch_pile'] }],
    c_giantwood: [{ kind: 'fern', p: 0.16, look: ['fern', 'broadleaf'] }, { kind: 'mushroom', p: 0.03, look: ['mushroom_cap', 'toadstool'] }, { kind: 'debris', p: 0.02, look: ['branch_pile'] }],
    c_mountain: [{ kind: 'pebble', p: 0.02, look: ['pebble'] }],
    c_plateau: [{ kind: 'flower', p: 0.03, look: ['thistle', 'bluebell'] }],
    c_badlands: [{ kind: 'pebble', p: 0.04, look: ['pebble'] }],
    c_hills: [{ kind: 'flower', p: 0.02, look: ['daisy'] }, { kind: 'pebble', p: 0.01, look: ['pebble'] }],
    c_farm: [{ kind: 'flower', p: 0.006, look: ['daisy'] }],
    c_shore: [{ kind: 'reed', p: 0.06, look: ['reed', 'cattail'] }, { kind: 'pebble', p: 0.02, look: ['pebble'] }],
    c_gorge: [{ kind: 'pebble', p: 0.03, look: ['pebble'] }],
    c_city: [], c_airfield: [{ kind: 'flower', p: 0.004, look: ['daisy'] }],
  },
};
