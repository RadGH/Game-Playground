// Every block a ship (or rock, or station) can be made of. One block = one 1 m cube cell.
// Structure blocks are bought by the block in the Shipyard; parts (cat 'part' / 'turret') are items with a tier
// (Mk I-IV) and a rarity, and their numbers come from sim/items.js partStats — the ONE place part numbers are made.
//
// `smooth: true` blocks take part in the automatic corners (sim/corners.js). Parts never do, and the cell in front
// of a turret's mount face or a thruster's nozzle is always kept clear.

export const PAINTS = [
  { id: 'steel', name: 'Steel', color: '#8d98a6' },
  { id: 'snow', name: 'Snow', color: '#d9dee4' },
  { id: 'graphite', name: 'Graphite', color: '#3d434c' },
  { id: 'navy', name: 'Navy', color: '#2f4f7a' },
  { id: 'teal', name: 'Teal', color: '#2b7c7a' },
  { id: 'moss', name: 'Moss', color: '#5d7343' },
  { id: 'sand', name: 'Sand', color: '#b49a6a' },
  { id: 'rust', name: 'Rust', color: '#9a4f30' },
  { id: 'crimson', name: 'Crimson', color: '#8f2a35' },
  { id: 'violet', name: 'Violet', color: '#5e4a8c' },
  { id: 'gold', name: 'Gold', color: '#c49a2c' },
  { id: 'hazard', name: 'Hazard', color: '#d8a521' },
];

export const DAMAGE_TYPES = {
  kinetic: { name: 'Kinetic', color: '#ffcf7a' },
  energy: { name: 'Energy', color: '#7ad8ff' },
  explosive: { name: 'Explosive', color: '#ff8a4a' },
};

/** Structure blocks: unlimited, priced per block, painted. */
export const STRUCTURE = {
  frame: { name: 'Light frame', cat: 'structure', hp: 14, mass: 0.45, cost: 6, smooth: true, desc: 'Cheap and light. Fills out a shape.' },
  hull: { name: 'Hull block', cat: 'structure', hp: 30, mass: 1, cost: 14, smooth: true, desc: 'The everyday building block.' },
  armor: { name: 'Armor block', cat: 'structure', hp: 85, mass: 2.6, cost: 45, smooth: true, resist: { kinetic: 0.55, explosive: 0.75, energy: 0.9 }, desc: 'Heavy plating. Takes 45% less from kinetic hits.' },
  window: { name: 'Window', cat: 'structure', hp: 12, mass: 0.5, cost: 18, smooth: true, glow: '#9fdcff', desc: 'Lit glass. Looks only.' },
  // big blocks (round 2): a 2×2×2 cube that counts as ONE block toward the bridge's block limit, a little tougher and
  // cheaper per cell than eight small ones. Unlocked by the Heavy frames research.
  frame2: { name: 'Heavy frame (2×2)', cat: 'structure', size: 2, hp: 146, mass: 3.4, cost: 41, smooth: true, big: 'frame', needs: 'blocks2x2', desc: 'Eight light frames in one: counts as one block.' },
  hull2: { name: 'Heavy hull (2×2)', cat: 'structure', size: 2, hp: 312, mass: 7.6, cost: 95, smooth: true, big: 'hull', needs: 'blocks2x2', desc: 'Eight hull blocks in one: counts as one block.' },
  armor2: { name: 'Heavy armor (2×2)', cat: 'structure', size: 2, hp: 884, mass: 19.8, cost: 306, smooth: true, big: 'armor', needs: 'blocks2x2', resist: { kinetic: 0.55, explosive: 0.75, energy: 0.9 }, desc: 'Eight armor blocks in one: counts as one block. Takes 45% less from kinetic hits.' },
};

/** Ship systems (items). `base` holds the Mk I common numbers that partStats scales. */
export const PARTS = {
  bridge: { name: 'Bridge', cat: 'part', hp: 260, mass: 3, color: '#c9d4e0', glow: '#8fd3ff', desc: 'Flies the ship. Lose it and the ship is lost.', base: { maxBlocks: 90, auto: 2, power: 4 }, tierScale: { maxBlocks: [90, 180, 360, 720], auto: [2, 3, 4, 6] } },
  reactor: { name: 'Reactor', cat: 'part', hp: 40, mass: 2, color: '#6d7b8c', glow: '#ffb347', desc: 'Makes power for guns and shields.', base: { power: 12 } },
  thruster: { name: 'Thruster', cat: 'part', hp: 30, mass: 1.2, color: '#59616c', glow: '#69c8ff', facing: 'nozzle', desc: 'Pushes the ship away from its nozzle.', base: { thrust: 150 } },
  gyro: { name: 'Gyroscope', cat: 'part', hp: 35, mass: 1.6, color: '#7c6f58', glow: '#ffd166', desc: 'Turns the ship faster.', base: { torque: 34 } },
  shield: { name: 'Shield emitter', cat: 'part', hp: 32, mass: 1.4, color: '#4d6e8a', glow: '#7ad8ff', desc: 'A bubble that soaks damage and refills after 3 s out of fire.', base: { shield: 70, regen: 9, power: 4 } },
  cargo: { name: 'Cargo bay', cat: 'part', hp: 35, mass: 1, color: '#7a6a4d', desc: 'Room for ore.', base: { cargo: 40 } },
  // world: round 2 parts — each Drone bay holds one drone (sim/drones.js); a Scanner reaches further than the bridge's
  // own 1.5 km scan (sim/scan.js)
  dronebay: { name: 'Drone bay', cat: 'part', hp: 45, mass: 1.8, color: '#5f7a6a', glow: '#7affd8', desc: 'Launches and rebuilds one drone (B).', base: { bays: 1, power: 2 } },
  scanner: { name: 'Scanner', cat: 'part', hp: 22, mass: 0.9, color: '#4f6a86', glow: '#9fdcff', desc: 'Your scan pulse (V) reaches further.', base: { scan: 2500, power: 1.5 }, tierScale: { scan: [2500, 3500, 5000, 7000] } },
  targeting: { name: 'Targeting computer', cat: 'part', hp: 25, mass: 0.8, color: '#3f5a52', glow: '#73f0b4', desc: 'Lets more turrets aim and fire on their own.', base: { auto: 2, power: 1 }, tierScale: { auto: [2, 3, 4, 6] } },
};

/** Turrets (items). Each has its own model and animation in render/turrets.js. */
export const TURRETS = {
  autocannon: { name: 'Autocannon', cat: 'turret', hp: 38, mass: 1.6, dmgType: 'kinetic', fire: 'shell', color: '#7d8590', glow: '#ffcf7a',
    desc: 'Twin barrels, steady shells.', base: { dmg: 13, rate: 4, speed: 520, range: 430, spread: 0.005, turn: 2.6, power: 2 } },
  gatling: { name: 'Gatling', cat: 'turret', hp: 34, mass: 1.5, dmgType: 'kinetic', fire: 'shell', spin: true, color: '#6b6f78', glow: '#ffdd8a',
    desc: 'Six spinning barrels. Spins up, then shreds.', base: { dmg: 4.8, rate: 16, speed: 560, range: 340, spread: 0.012, turn: 3.2, power: 3 } },
  laser: { name: 'Pulse laser', cat: 'turret', hp: 30, mass: 1.2, dmgType: 'energy', fire: 'beam', color: '#cfd8e3', glow: '#5fe3ff',
    desc: 'Hits the instant it fires, in short pulses.', base: { dmg: 66, rate: 1.1, pulse: 0.35, range: 360, turn: 2.4, power: 6 } },
  railgun: { name: 'Railgun', cat: 'turret', hp: 42, mass: 2.4, dmgType: 'kinetic', fire: 'rail', color: '#5d6b7d', glow: '#6fb6ff',
    desc: 'Charges, then fires one huge slug that goes clean through a block.', base: { dmg: 120, rate: 0.42, speed: 1700, range: 780, charge: 0.7, turn: 1.2, power: 8 } },
  flak: { name: 'Flak cannon', cat: 'turret', hp: 38, mass: 1.7, dmgType: 'explosive', fire: 'flak', color: '#727a5e', glow: '#ff9b52',
    desc: 'Bursting shells. Shoots down missiles first.', base: { dmg: 10, rate: 3, speed: 440, range: 310, splash: 6, turn: 3, power: 3 } },
  missile: { name: 'Missile pod', cat: 'turret', hp: 40, mass: 1.8, dmgType: 'explosive', fire: 'missile', color: '#6d6152', glow: '#ff6a4a',
    desc: 'Homing missiles at your locked target.', base: { dmg: 48, rate: 0.36, salvo: 2, speed: 170, range: 900, splash: 5, turn: 1.6, power: 2 } },
  plasma: { name: 'Plasma lance', cat: 'turret', hp: 38, mass: 1.9, dmgType: 'energy', fire: 'plasma', color: '#4f6d5b', glow: '#8dff6a',
    desc: 'Slow glowing bolts that splash.', base: { dmg: 50, rate: 0.8, speed: 280, range: 370, splash: 2.6, turn: 1.8, power: 7 } },
  mining: { name: 'Mining laser', cat: 'turret', hp: 28, mass: 1.1, dmgType: 'energy', fire: 'mine', color: '#a78c3d', glow: '#ffe066',
    desc: 'Cuts rock fast; weak against ships. Fires where you aim.', base: { dmg: 16, rate: 1, range: 76, turn: 3, power: 4, rockMul: 5 } },
};

/** Rock and ore cells (asteroids). */
export const ROCKS = {
  rock: { name: 'Rock', cat: 'rock', hp: 10, mass: 1.5, smooth: true, color: '#5c544c' },
  ore_iron: { name: 'Iron ore', cat: 'rock', hp: 14, mass: 1.8, smooth: true, ore: 'iron', color: '#8a7f78', fleck: '#c9b8a8' },
  ore_copper: { name: 'Copper ore', cat: 'rock', hp: 16, mass: 1.8, smooth: true, ore: 'copper', color: '#6f5a48', fleck: '#ff9d5c' },
  ore_cobalt: { name: 'Cobalt ore', cat: 'rock', hp: 19, mass: 1.9, smooth: true, ore: 'cobalt', color: '#4a5468', fleck: '#5fa8ff' },
  ore_iridium: { name: 'Iridium ore', cat: 'rock', hp: 22, mass: 2, smooth: true, ore: 'iridium', color: '#5a4d63', fleck: '#e07bff' },
  ore_solar: { name: 'Sunstone ore', cat: 'rock', hp: 26, mass: 2, smooth: true, ore: 'sunstone', color: '#6a5a3a', fleck: '#ffe25a' },
};

/** Station hull (never damaged). */
export const STATION = {
  station: { name: 'Station hull', cat: 'station', hp: 1e9, mass: 4, smooth: true },
  station_lit: { name: 'Station light', cat: 'station', hp: 1e9, mass: 4, smooth: true, glow: '#ffd38a' },
  station_dock: { name: 'Docking light', cat: 'station', hp: 1e9, mass: 4, smooth: true, glow: '#62f0a8' },
};

export const ORES = {
  iron: { name: 'Iron ore', color: '#c9b8a8', price: 6 },
  copper: { name: 'Copper ore', color: '#ff9d5c', price: 11 },
  cobalt: { name: 'Cobalt ore', color: '#5fa8ff', price: 19 },
  iridium: { name: 'Iridium ore', color: '#e07bff', price: 32 },
  sunstone: { name: 'Sunstone ore', color: '#ffe25a', price: 52 },
};

export const BLOCKS = { ...STRUCTURE, ...PARTS, ...TURRETS, ...ROCKS, ...STATION };
export const isItemKind = t => !!(PARTS[t] || TURRETS[t]);
export const blockName = t => BLOCKS[t]?.name || 'Block';

export const RARITY = [
  { id: 'common', name: 'Common', color: '#b8c0c8', lift: 1 },
  { id: 'uncommon', name: 'Uncommon', color: '#5fd17a', lift: 1.14 },
  { id: 'rare', name: 'Rare', color: '#4fa3ff', lift: 1.32 },
  { id: 'epic', name: 'Epic', color: '#b46cff', lift: 1.58 },
  { id: 'legendary', name: 'Legendary', color: '#ff9a2e', lift: 1.95 },
];
export const TIER_NAMES = ['Mk I', 'Mk II', 'Mk III', 'Mk IV'];
/** How much each Mk multiplies a part's main numbers. */
export const TIER_LIFT = [1, 1.5, 2.2, 3.1];
