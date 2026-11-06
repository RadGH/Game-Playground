// Every block you can put on a ship.
//
// Shared fields:
//   cat      frame | armor | core | power | engine | gyro | cpu | crew | cargo | shield | weapon | utility | drone
//   size     cells per side (1, 2 or 4). A hull class says the biggest size it can mount.
//   hp, mass, armor (an ARMOR id from types.js)
//   power    + makes power, - uses it (per second budget)
//   cpu      CPU it takes up (hard limit when building)
//   crew     crew it needs to run at full strength (soft: short crew = slower)
//   cost     { cr, mats: { ferrite: 2 } }
//   module   true = an item you own (bought / looted) — you place it from your parts hold.
//            false = structure built straight from materials as you place it.
// Extras by category: thrust, turn, cargo, crewCap, cpuCap, shield{...}, weapon (WEAPONS id), drones, repair, scan, jump.

import { ALL_WEAPONS } from './weapons.js';

const B = {};
const add = (id, def) => { B[id] = { id, size: 1, tier: 1, module: false, power: 0, cpu: 0, crew: 0, armor: 'frame', ...def }; };

/** Structure in three sizes: a 2x2 is 4 cells of the same thing but tougher per cell and cheaper per cell. */
function structure(id, base) {
  add(id, base);
  const big = (n, mult) => ({
    ...base,
    name: `${base.name} ${n}×${n}`,
    size: n,
    tier: Math.max(base.tier || 1, n === 2 ? 3 : 5),
    hp: Math.round(base.hp * n * n * mult),
    mass: +(base.mass * n * n * 0.95).toFixed(2),
    cost: { cr: Math.round((base.cost?.cr || 0) * n * n * 0.9), mats: Object.fromEntries(Object.entries(base.cost?.mats || {}).map(([k, v]) => [k, Math.ceil(v * n * n * 0.85)])) },
    cargo: base.cargo ? base.cargo * n * n * 1.2 : undefined,
    crewCap: base.crewCap ? base.crewCap * n * n * 1.2 : undefined,
  });
  add(`${id}_2`, big(2, 1.25));
  add(`${id}_4`, big(4, 1.5));
}

// ------------------------------------------------------------- frames and armour (built from materials)
structure('frame', { name: 'Hull frame', cat: 'frame', hp: 40, mass: 1, armor: 'frame', cost: { cr: 2, mats: { ferrite: 2 } }, blurb: 'Cheap, light structure. Connects everything.' });
structure('steel', { name: 'Steel armour', cat: 'armor', hp: 80, mass: 2.4, armor: 'steel', cost: { cr: 6, mats: { ferrite: 5 } }, blurb: 'Great against bullets and shells. Plasma melts it.' });
structure('ceramic', { name: 'Ceramic armour', cat: 'armor', hp: 60, mass: 1.6, armor: 'ceramic', cost: { cr: 8, mats: { silicate: 5 } }, blurb: 'Shrugs off lasers and plasma. Cracks under shells.' });
structure('reactive', { name: 'Reactive armour', cat: 'armor', hp: 70, mass: 2.2, armor: 'reactive', tier: 2, cost: { cr: 14, mats: { ferrite: 3, carbon: 3 } }, blurb: 'Blows outward when hit. Halves explosions.' });
structure('ablative', { name: 'Ablative armour', cat: 'armor', hp: 55, mass: 1.2, armor: 'ablative', tier: 2, cost: { cr: 12, mats: { carbon: 4, silicate: 2 } }, blurb: 'Boils away under lasers instead of the hull.' });
structure('insulated', { name: 'Insulated armour', cat: 'armor', hp: 60, mass: 1.5, armor: 'insulated', tier: 2, cost: { cr: 14, mats: { cuprite: 3, carbon: 2 } }, blurb: 'Grounds lightning. Barely scratched by arcs.' });
structure('titanium', { name: 'Titanium armour', cat: 'armor', hp: 120, mass: 1.8, armor: 'titanium', tier: 3, cost: { cr: 30, mats: { titanium: 4 } }, blurb: 'Good against everything. Not cheap.' });
structure('iridium', { name: 'Iridium armour', cat: 'armor', hp: 220, mass: 4.5, armor: 'iridium', tier: 4, cost: { cr: 70, mats: { iridium: 4, ferrite: 4 } }, blurb: 'Capital-grade plate. Light guns do almost nothing.' });
structure('neutronium', { name: 'Neutronium armour', cat: 'armor', hp: 420, mass: 9, armor: 'neutronium', tier: 6, cost: { cr: 200, mats: { neutronium: 2, iridium: 2 } }, blurb: 'The heaviest thing that flies.' });
structure('chitin', { name: 'Grown chitin', cat: 'armor', hp: 90, mass: 1.6, armor: 'chitin', tier: 2, cost: { cr: 20, mats: { chitin: 3 } }, regrow: 1.5, blurb: 'Alien shell that slowly heals itself.' });
structure('lattice', { name: 'Lattice plating', cat: 'armor', hp: 75, mass: 1.4, armor: 'lattice', tier: 2, cost: { cr: 22, mats: { nanite: 2, ferrite: 2 } }, regrow: 0.8, blurb: 'Machine alloy that grounds lightning and knits back together.' });
structure('prism', { name: 'Prism plating', cat: 'armor', hp: 60, mass: 1.0, armor: 'prism', tier: 3, cost: { cr: 30, mats: { lumen: 2, silicate: 2 } }, blurb: 'Crystal that scatters almost any laser.' });
structure('basalt', { name: 'Forge basalt', cat: 'armor', hp: 160, mass: 4, armor: 'basalt', tier: 3, cost: { cr: 30, mats: { basaltcore: 2, ferrite: 3 } }, blurb: 'Kharr heat-stone. Heavy and stubborn.' });
structure('cargo', { name: 'Cargo bay', cat: 'cargo', hp: 40, mass: 1, armor: 'frame', cargo: 25, cost: { cr: 10, mats: { ferrite: 3 } }, blurb: 'Holds 25 units of ore or goods.' });
structure('quarters', { name: 'Crew quarters', cat: 'crew', hp: 40, mass: 1.2, armor: 'frame', crewCap: 4, cost: { cr: 20, mats: { ferrite: 2, carbon: 2 } }, blurb: 'Bunks for 4 crew.' });

// ------------------------------------------------------------- modules (items in your parts hold)
const mod = (id, def) => add(id, { module: true, ...def });

// cores: losing the core loses the ship
mod('bridge', { name: 'Bridge', cat: 'core', hp: 120, mass: 2, armor: 'steel', core: true, power: 4, cpuCap: 6, crewCap: 2, repair: 1.5, cost: { cr: 200 }, blurb: 'The heart of a small ship. Lose it and the ship is lost. Its crew patch the hull out of combat.' });
mod('command_deck', { name: 'Command Deck', cat: 'core', size: 2, tier: 3, hp: 700, mass: 8, armor: 'titanium', core: true, power: 20, cpuCap: 30, crewCap: 10, repair: 10, cost: { cr: 6000 }, blurb: 'A frigate-class bridge.' });
mod('flag_bridge', { name: 'Flag Bridge', cat: 'core', size: 4, tier: 5, hp: 4200, mass: 40, armor: 'iridium', core: true, power: 120, cpuCap: 160, crewCap: 40, repair: 60, cost: { cr: 90000 }, blurb: 'The command centre of a capital ship.' });

// power
mod('battery', { name: 'Fuel cell', cat: 'power', hp: 30, mass: 0.8, power: 6, cost: { cr: 120 }, explode: 20, blurb: '+6 power.' });
mod('reactor', { name: 'Fission reactor', cat: 'power', tier: 2, hp: 60, mass: 2.2, power: 16, crew: 1, cost: { cr: 600 }, explode: 60, blurb: '+16 power. Explodes when destroyed.' });
mod('reactor_2', { name: 'Fusion reactor', cat: 'power', size: 2, tier: 3, hp: 380, mass: 9, power: 80, crew: 3, cost: { cr: 5200 }, explode: 160, blurb: '+80 power.' });
mod('reactor_4', { name: 'Zero-point core', cat: 'power', size: 4, tier: 5, hp: 2400, mass: 40, power: 420, crew: 10, cost: { cr: 64000 }, explode: 500, blurb: '+420 power.' });

// engines (arcade: only totals matter) and gyros
mod('thruster', { name: 'Ion thruster', cat: 'engine', hp: 35, mass: 0.7, power: -1, thrust: 60, cost: { cr: 80 }, blurb: 'Speed and acceleration.' });
mod('afterburner', { name: 'Afterburner', cat: 'engine', tier: 2, hp: 40, mass: 1, power: -3, thrust: 120, boost: 0.5, cost: { cr: 450 }, blurb: 'Strong thrust and a bigger Boost.' });
mod('thruster_2', { name: 'Plasma drive', cat: 'engine', size: 2, tier: 3, hp: 260, mass: 5, power: -10, thrust: 520, crew: 1, cost: { cr: 4200 }, blurb: 'Frigate engine.' });
mod('thruster_4', { name: 'Torch drive', cat: 'engine', size: 4, tier: 5, hp: 1600, mass: 26, power: -50, thrust: 3200, crew: 4, cost: { cr: 52000 }, blurb: 'Pushes a battleship.' });
mod('gyro', { name: 'Gyroscope', cat: 'gyro', hp: 30, mass: 0.6, power: -1, turn: 40, cost: { cr: 90 }, blurb: 'Swings your nose round faster.' });
mod('gyro_2', { name: 'Control moment gyro', cat: 'gyro', size: 2, tier: 3, hp: 200, mass: 4, power: -6, turn: 300, cost: { cr: 3600 }, blurb: 'Turning for big hulls.' });

// computing and crew
mod('cpu', { name: 'CPU node', cat: 'cpu', hp: 25, mass: 0.4, power: -1, cpuCap: 4, cost: { cr: 160 }, blurb: '+4 CPU for weapons and tools.' });
mod('cpu_2', { name: 'Compute block', cat: 'cpu', size: 2, tier: 3, hp: 180, mass: 3, power: -6, cpuCap: 26, cost: { cr: 4000 }, blurb: '+26 CPU.' });
mod('cpu_4', { name: 'Mind core', cat: 'cpu', size: 4, tier: 5, hp: 1100, mass: 14, power: -24, cpuCap: 130, cost: { cr: 46000 }, blurb: '+130 CPU.' });

// shields
mod('shield_bubble', { name: 'Bubble shield', cat: 'shield', hp: 40, mass: 1, power: -4, cpu: 2, crew: 1, shield: { kind: 'bubble', hp: 120, regen: 14, delay: 3, pad: 1.4 }, cost: { cr: 500 }, blurb: 'Wraps the whole ship. Recharges after you stop taking hits.' });
mod('shield_arc', { name: 'Deflector', cat: 'shield', hp: 40, mass: 1, power: -3, cpu: 1, crew: 0, shield: { kind: 'arc', hp: 160, regen: 22, delay: 2, arc: 100, pad: 2.2 }, rot: true, cost: { cr: 420 }, blurb: 'A strong curved shield facing one way. Point it where the fire comes from.' });
mod('shield_bubble_2', { name: 'Shield dome', cat: 'shield', size: 2, tier: 3, hp: 260, mass: 6, power: -18, cpu: 8, crew: 2, shield: { kind: 'bubble', hp: 900, regen: 70, delay: 4, pad: 2 }, cost: { cr: 6200 }, blurb: 'Frigate-class bubble.' });
mod('shield_arc_2', { name: 'Bulwark projector', cat: 'shield', size: 2, tier: 3, hp: 260, mass: 6, power: -14, cpu: 6, crew: 1, shield: { kind: 'arc', hp: 1300, regen: 110, delay: 3, arc: 110, pad: 3 }, rot: true, cost: { cr: 5400 }, blurb: 'A wall of light on one side.' });
mod('shield_bubble_4', { name: 'Aegis lattice', cat: 'shield', size: 4, tier: 5, hp: 1600, mass: 30, power: -80, cpu: 40, crew: 6, shield: { kind: 'bubble', hp: 7000, regen: 420, delay: 5, pad: 3 }, cost: { cr: 70000 }, blurb: 'A capital shield.' });

// utilities
mod('repair_bay', { name: 'Repair drones', cat: 'utility', hp: 30, mass: 0.8, power: -2, cpu: 2, crew: 1, repair: 4, cost: { cr: 700 }, blurb: 'Rebuilds broken blocks out of combat. Uses ferrite.' });
mod('repair_bay_2', { name: 'Repair yard', cat: 'utility', size: 2, tier: 3, hp: 220, mass: 5, power: -10, cpu: 6, crew: 3, repair: 40, cost: { cr: 7200 }, blurb: 'Fast repairs for big hulls.' });
mod('scanner', { name: 'Scanner', cat: 'utility', hp: 25, mass: 0.5, power: -1, cpu: 1, scan: 1, cost: { cr: 300 }, blurb: 'Shows enemy armour and shields, and finds ore further away.' });
mod('jump_drive', { name: 'Jump drive', cat: 'utility', hp: 40, mass: 1.2, power: -2, cpu: 1, jump: 2, cost: { cr: 900 }, blurb: 'Jump to star systems up to 2 links away.' });
mod('loot_magnet', { name: 'Salvage magnet', cat: 'utility', hp: 25, mass: 0.6, power: -1, cpu: 1, magnet: 220, cost: { cr: 350 }, blurb: 'Pulls loot and ore in from further away.' });
mod('cloak', { name: 'Cloak field', cat: 'utility', tier: 4, hp: 40, mass: 1.5, power: -12, cpu: 6, crew: 1, cloak: 6, cost: { cr: 9000 }, blurb: 'Vanish from enemy sensors for 6 seconds (Utility button).' });
mod('drone_bay', { name: 'Drone bay', cat: 'drone', tier: 1, hp: 60, mass: 1.5, power: -3, cpu: 3, crew: 1, drones: 2, cost: { cr: 1200 }, blurb: 'Launches 2 drones that fly ahead of you.' });
mod('drone_bay_2', { name: 'Hangar', cat: 'drone', size: 2, tier: 3, hp: 400, mass: 8, power: -12, cpu: 12, crew: 4, drones: 4, cost: { cr: 9000 }, blurb: 'Carries 4 drones.' });
mod('drone_bay_4', { name: 'Carrier deck', cat: 'drone', size: 4, tier: 5, hp: 2400, mass: 36, power: -40, cpu: 40, crew: 12, drones: 10, cost: { cr: 80000 }, blurb: 'A whole air wing: 10 drones.' });

// weapon blocks: one per weapon
for (const w of Object.values(ALL_WEAPONS)) {
  const size = w.bsize || 1;
  const n2 = size * size;
  const cpu = Math.max(1, Math.round((w.mode === 'tool' ? 1 : 2) * n2 * (w.tier >= 3 ? 1.5 : 1)));
  mod(w.id, {
    name: w.name, cat: 'weapon', size, tier: w.tier, weapon: w.id, rot: true, race: w.race,
    hp: Math.round(45 * n2 * (size > 1 ? 1.3 : 1)), mass: +(1.2 * n2).toFixed(2), armor: 'steel',
    power: -Math.max(1, Math.round((w.dmg * (w.rate || 1) * (w.count || 1)) / 14 * (w.mode === 'beam' ? 1.6 : 1))),
    cpu, crew: size >= 2 ? size : (w.mode === 'tool' ? 0 : 0),
    cost: { cr: Math.round(140 * Math.pow(w.tier, 1.6) * n2 * (w.race ? 1.6 : 1)) },
    blurb: w.blurb,
  });
}

export const BLOCKS = B;
export const BLOCK_IDS = Object.keys(B);

export const CATEGORIES = {
  frame: 'Hull', armor: 'Armour', core: 'Bridge', power: 'Power', engine: 'Engines', gyro: 'Gyros',
  cpu: 'CPU', crew: 'Crew', cargo: 'Cargo', shield: 'Shields', weapon: 'Weapons', utility: 'Utility', drone: 'Drones',
};

// ------------------------------------------------------------- asteroid and planet-crust cells (never placeable)
// A rock is a grid of these. `ore` = the material a cell drops when it is cut out.
import { MATERIALS } from './types.js';
B.rock = { id: 'rock', name: 'Rock', cat: 'rock', size: 1, tier: 1, hp: 26, mass: 2, armor: 'rock', power: 0, cpu: 0, crew: 0, nature: true, ore: null, color: '#5d544c' };
for (const [mid, m] of Object.entries(MATERIALS)) {
  if (m.alien && mid !== 'relic') continue;
  B['ore_' + mid] = { id: 'ore_' + mid, name: m.name + ' ore', cat: 'rock', size: 1, tier: m.tier, hp: 30 + m.tier * 22, mass: 2.4, armor: 'rock', power: 0, cpu: 0, crew: 0, nature: true, ore: mid, color: m.color };
}
