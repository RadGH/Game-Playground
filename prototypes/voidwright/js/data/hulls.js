// Hull classes and the premade ships the shipyards sell.
//
// A layout is rows of characters, nose pointing RIGHT (+x). Each character is one cell; `legend` maps
// it to a block id and an optional facing (0-7, x45 degrees, 0 = forward, 4 = backward, 2 = down/starboard,
// 6 = up/port). A 2x2 or 4x4 block is written with its letter in every one of its cells.

export const CLASSES = {
  skiff:      { name: 'Skiff',      rank: 0, baseCargo: 10, grid: 9,  maxBlock: 1, baseCpu: 2,  baseCrew: 2,  price: 0,      tier: 1, speed: 1.0,  blurb: 'A tiny starter hull. Quick and fragile.' },
  corvette:   { name: 'Corvette',   rank: 1, baseCargo: 20, grid: 13, maxBlock: 1, baseCpu: 4,  baseCrew: 4,  price: 5000,   tier: 1, speed: 0.9, blurb: 'Room for a real loadout.' },
  frigate:    { name: 'Frigate',    rank: 2, baseCargo: 60, grid: 21, maxBlock: 2, baseCpu: 10, baseCrew: 10, price: 30000,  tier: 3, speed: 0.72, blurb: 'Unlocks 2x2 parts: heavy turrets, hangars, fusion reactors.' },
  destroyer:  { name: 'Destroyer',  rank: 3, baseCargo: 90, grid: 31, maxBlock: 2, baseCpu: 20, baseCrew: 20, price: 90000,  tier: 4, speed: 0.66,  blurb: 'Long and fast for its size. A gun platform.' },
  cruiser:    { name: 'Cruiser',    rank: 4, baseCargo: 200, grid: 45, maxBlock: 4, baseCpu: 40, baseCrew: 40, price: 260000, tier: 5, speed: 0.5,  blurb: 'Unlocks 4x4 capital parts.' },
  battleship: { name: 'Battleship', rank: 5, baseCargo: 400, grid: 65, maxBlock: 4, baseCpu: 80, baseCrew: 80, price: 800000, tier: 6, speed: 0.42,  blurb: 'Capital guns and capital armour.' },
  carrier:    { name: 'Carrier',    rank: 5, baseCargo: 400, grid: 65, maxBlock: 4, baseCpu: 90, baseCrew: 90, price: 760000, tier: 6, speed: 0.42, droneBonus: 1.5, blurb: 'Carries 50% more drones per bay.' },
  dreadnought:{ name: 'Dreadnought',rank: 6, baseCargo: 800, grid: 90, maxBlock: 4, baseCpu: 160,baseCrew: 160,price: 2600000,tier: 7, speed: 0.34,  blurb: 'The biggest hull ever built. About 100 times your first ship.' },
  station:    { name: 'Station',    rank: 9, baseCargo: 0, grid: 200, maxBlock: 4, baseCpu: 999, baseCrew: 999, price: 0, tier: 1, speed: 0, blurb: '' },
};
export const CLASS_ORDER = ['skiff', 'corvette', 'frigate', 'destroyer', 'cruiser', 'battleship', 'carrier', 'dreadnought'];

const L = {
  '#': 'frame', S: 'steel', C: 'ceramic', B: 'bridge', E: ['thruster', 4], G: 'gyro', P: 'battery', U: 'cpu',
  Q: 'quarters', K: 'cargo', M: ['mining_laser', 0], L: ['pulse_laser', 0], l: ['pulse_laser', 4], g: ['gatling', 0],
  h: ['harpoon', 0], D: ['shield_bubble', 0], A: ['autocannon', 0], R: ['rocket_pod', 0], m: ['missile_rack', 0],
  F: ['mass_driver', 0], d: ['drone_bay', 0], Y: 'reactor', r: 'repair_bay', T: ['arc_caster', 0], W: ['shield_arc', 0],
  w: ['shield_arc', 4], Z: ['flak', 0], H: ['heavy_laser', 0], O: 'reactor_2', N: ['thruster_2', 4], I: 'command_deck',
  X: 'steel_2', J: 'frame_2', V: 'shield_bubble_2', k: 'cargo_2', u: 'cpu_2', b: ['drone_bay_2', 0], n: ['howitzer', 0],
  j: ['jump_drive', 0], s: 'scanner', p: ['plasma_cannon', 0], e: ['beam_laser', 0], t: ['tesla_coil', 0],
  y: ['flak_battery', 0], q: 'quarters_2', x: 'titanium', c: 'cpu_2', o: ['rocket_pod', 0], i: ['railgun', 0],
};

/** Premade ships the shipyards sell (plus your starting ship). */
export const PREMADES = [
  {
    id: 'sparrow', name: 'Sparrow', cls: 'skiff', price: 0, start: true,
    blurb: 'Your first ship: a mining laser, two laser turrets and two cargo bays.',
    rows: [
      '  SS   ',
      ' EKL#S ',
      'EGBPM#S',
      ' EKL#S ',
      '  SS   ',
    ],
  },
  {
    id: 'wasp', name: 'Wasp', cls: 'skiff', price: 2600,
    blurb: 'A fighter: two gatlings, a mass driver, a deflector at the front.',
    rows: [
      ' EPg#S  ',
      'EGBPUFW ',
      ' E#g#S  ',
    ],
  },
  {
    id: 'mule', name: 'Mule', cls: 'corvette', price: 6200,
    blurb: 'A hauler with big holds, two mining lasers and a harpoon.',
    rows: [
      '  SSSSS    ',
      ' E#KKKK#M  ',
      'EGBPU#KK#hS',
      ' E#KKKK#M  ',
      '  SSSSS    ',
    ],
  },
  {
    id: 'hornet', name: 'Hornet', cls: 'corvette', price: 9800,
    blurb: 'A brawler: missiles, rockets, two mass drivers, a bubble shield and steel all round.',
    rows: [
      '   SSSS     ',
      '  E####S    ',
      ' EG#mPUoSS  ',
      'EGBPYDU#FFW ',
      ' EG#mPUoSS  ',
      '  E####S    ',
      '   SSSS     ',
    ],
  },
  {
    id: 'falcon', name: 'Falcon', cls: 'corvette', price: 12400,
    blurb: 'A drone carrier in miniature: a drone bay, arcs and ceramic plate.',
    rows: [
      '  CCCC     ',
      ' E#T##C    ',
      'EGUUd#PCC  ',
      'EGBPYsDLCW ',
      'EGU#d#PCC  ',
      ' E#T##C    ',
      '  CCCC     ',
    ],
  },
  // bigger hulls are generated from a fixed seed so every shipyard sells the same design
  { id: 'bastion', name: 'Bastion', cls: 'frigate', price: 38000, gen: { faction: 'guild', seed: 101, role: 'escort' }, blurb: 'A frigate: heavy turrets, a shield dome and fusion power.' },
  { id: 'kestrel', name: 'Kestrel', cls: 'frigate', price: 44000, gen: { faction: 'navy', seed: 77, role: 'carrier' }, blurb: 'A carrier frigate with two hangars of drones.' },
  { id: 'lancer', name: 'Lancer', cls: 'destroyer', price: 96000, gen: { faction: 'navy', seed: 12, role: 'gunship' }, blurb: 'Long, fast and bristling with guns.' },
  { id: 'harrow', name: 'Harrow', cls: 'destroyer', price: 88000, gen: { faction: 'redfang', seed: 33, role: 'brawler' }, blurb: 'A salvaged pirate destroyer. Rockets everywhere.' },
  { id: 'paladin', name: 'Paladin', cls: 'cruiser', price: 280000, gen: { faction: 'navy', seed: 5, role: 'capital' }, blurb: 'Your first capital ship: 4x4 guns and armour.' },
  { id: 'sovereign', name: 'Sovereign', cls: 'battleship', price: 840000, gen: { faction: 'navy', seed: 9, role: 'capital' }, blurb: 'A battleship. Fleets turn around when they see it.' },
  { id: 'aviary', name: 'Aviary', cls: 'carrier', price: 790000, gen: { faction: 'guild', seed: 21, role: 'carrier' }, blurb: 'A carrier with a whole wing of drones.' },
  { id: 'leviathan', name: 'Leviathan', cls: 'dreadnought', price: 2700000, gen: { faction: 'navy', seed: 3, role: 'capital' }, blurb: 'The largest hull for sale anywhere.' },
];

export const LEGEND = L;
