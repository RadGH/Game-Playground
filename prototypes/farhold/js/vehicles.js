// Farhold — the things you build to get across the ground: a motorcycle, a car and a truck.
//
//   "I would also like to have more craftable equipment: lanterns, boats, vehicles (besides just
//    horse), and eventually space station. I definitely want the ability to craft a motorcycle and
//    a car and eventually a truck."
//
// **The design decision this module is built around: a vehicle must not be a faster horse.** The
// quickest way to ruin a mount is to sell something that is better than it at everything, because
// then the horse is deleted and the player has simply swapped one W key for another. So every rung
// here gives something up, and the horse keeps two things nothing on wheels can take from it — it
// needs no fuel, and it climbs ground a wheel will not look at.
//
//   motorcycle  fastest thing on the planet · one seat · drowns in a stream · stops at the first hill
//   car         four seats and a roof · quickest on a road · wallows off it · thirsty
//   truck       slowest of the three · carries a camp · fords a river · the only thing that can move
//               a ship's hull plate across a valley (see js/shipyard.js)
//
// A vehicle is an **unlockable, not loot** — the same dividing line js/gear.js draws for boats and
// ships. You build one, you own it for the run, and you pick which one you are on from a dropdown.
// No rarity, no affixes, never in a drop table.
//
//   import { GROUND_VEHICLES, buildVehicle, driveFor, drive } from './vehicles.js';
//   buildVehicle(player, 'motorcycle', materials, { stations });
//   const spec = driveFor(player);              // what you are sitting on, or null
//   drive(player, metres, materials, { surface: 'road', slope: 0.1 });
//
// Nothing in here touches the DOM or Three.js, so the node tests run it directly. The body that
// gets drawn is avatar-3d/js/ground-vehicles.js.

// The JSON is the source of truth for every number — house rule, and it means a balance pass never
// opens a .js file. Imported as a module (the pattern proctown/js/buildkit.js already uses) rather
// than fetched, so this module also works in a test with nothing wired to it.
import DATA from '../data/vehicles.json' with { type: 'json' };
import WORKSHOP from '../data/workshop.json' with { type: 'json' };
import { fmt, pct } from '../../../shared/format.js';

/** Every ground vehicle, keyed. */
export const GROUND_VEHICLES = DATA.vehicles;
/** The horse row — the yardstick every vehicle is measured against, not something you build. */
export const HORSE_ROW = DATA.horse;
/** What an engine drinks, and what a full tank is worth. */
export const GROUND_FUEL = DATA.fuel;
/** Which slot of `player.vehicles` these live in, beside `boat` and `ship`. */
export const GROUND_SLOT = 'ground';
/** The ladder, cheapest first. */
export const LADDER = Object.values(GROUND_VEHICLES).sort((a, b) => a.rung - b.rung).map(v => v.key);

/**
 * THE MATERIAL CHAIN, and why it lives in this file.
 *
 * These three helpers belong in a `js/workshop.js` of their own. The file list this round did not
 * include one and inventing files nobody else knows about is how two agents end up with two
 * material tables, so they sit here — the first module that needed them — and js/shipyard.js
 * imports them from here. If a refining module ever lands, move these three and delete this note.
 */
export const MATERIALS = WORKSHOP.materials;
export const STATIONS = WORKSHOP.stations;

/** A material's rough worth. Unknown ids are worth 1 rather than nothing, so a typo cannot make a craft free. */
export function valueOf(id) { return MATERIALS[id]?.value ?? 1; }

/** What a whole cost table is worth, which is how the ladder is proved to climb. */
export function costValue(cost) {
  return Object.entries(cost || {}).reduce((sum, [id, n]) => sum + valueOf(id) * n, 0);
}

/**
 * Everything a cost eventually comes out of the ground as.
 *
 * Walks the chain down to the raw ids, so a test can ask "is this craft actually producible?" and
 * get a real answer rather than trusting that somebody spelled `plate_steel` right. Returns null
 * the moment it meets an id that is neither gathered nor made by anything, which is the failure we
 * want loudly rather than quietly.
 */
export function rawInputs(cost, seen = new Set()) {
  const out = {};
  for (const [id, n] of Object.entries(cost || {})) {
    const m = MATERIALS[id];
    // rare elements arrive in the bag as `el_<key>` from js/resources.js — see workshop.json's contract
    if (!m && id.startsWith('el_')) { out[id] = (out[id] || 0) + n; continue; }
    if (!m) return null;                                   // nothing makes this and nobody digs it up
    if (!m.inputs) { out[id] = (out[id] || 0) + n; continue; }
    if (seen.has(id)) return null;                         // a recipe that needs itself is a dead end
    const deeper = rawInputs(m.inputs, new Set([...seen, id]));
    if (!deeper) return null;
    const runs = Math.ceil(n / (m.out || 1));
    for (const [rid, rn] of Object.entries(deeper)) out[rid] = (out[rid] || 0) + rn * runs;
  }
  return out;
}

// ---------------------------------------------------------------------------- the bag

/**
 * Anything with count/canAfford/spend/missing will do — which is exactly the `Materials` class in
 * js/craft.js, so the bench's bag and this module's bag are the same bag. A plain `{ steel: 4 }`
 * object works too, so a test does not have to import the crafting module to check a cost.
 */
export function bagOf(bag) {
  if (bag && typeof bag.canAfford === 'function') return bag;
  const held = bag || {};
  return {
    count: id => held[id] || 0,
    canAfford: cost => Object.entries(cost || {}).every(([id, n]) => (held[id] || 0) >= n),
    missing: cost => {
      const out = {};
      for (const [id, n] of Object.entries(cost || {})) { const short = n - (held[id] || 0); if (short > 0) out[id] = short; }
      return out;
    },
    spend: cost => {
      if (!Object.entries(cost || {}).every(([id, n]) => (held[id] || 0) >= n)) return false;
      for (const [id, n] of Object.entries(cost || {})) held[id] -= n;
      return true;
    },
    add: (id, n = 1) => { held[id] = (held[id] || 0) + n; return held[id]; },
  };
}

/** A cost, written the way a button says it: "8 Steel, 5 Machine Part". */
export function costText(cost) {
  return Object.entries(cost || {})
    .map(([id, n]) => `${fmt(n)} ${MATERIALS[id]?.name || id}`)
    .join(', ');
}

// ---------------------------------------------------------------------------- owning one

/** The vehicles block, made if the character has not got one. Ground vehicles ride inside the block
 *  js/save.js already writes, so they persist with no change to the save at all. */
function block(player) {
  player.vehicles = player.vehicles || { owned: {}, active: {} };
  player.vehicles.owned = player.vehicles.owned || {};
  player.vehicles.active = player.vehicles.active || {};
  player.vehicles.owned[GROUND_SLOT] = player.vehicles.owned[GROUND_SLOT] || [];
  player.vehicles.rigs = player.vehicles.rigs || {};
  return player.vehicles;
}

/** Which ones this character has built. */
export function ownedVehicles(player) { return [...(player?.vehicles?.owned?.[GROUND_SLOT] || [])]; }

/** The per-vehicle state: how much is in the tank and how bent it is. */
export function rigState(player, key) {
  const v = block(player);
  const spec = GROUND_VEHICLES[key];
  if (!spec) return null;
  return (v.rigs[key] = v.rigs[key] || { fuel: 0, condition: 100 });
}

/** The spec of whatever is selected, or null — on foot and on a horse are both "no vehicle". */
export function driveFor(player) {
  const key = player?.vehicles?.active?.[GROUND_SLOT];
  return (key && GROUND_VEHICLES[key]) || null;
}

/** Switch which one you are on. `null` gets off. */
export function selectVehicle(player, key) {
  const v = block(player);
  if (key == null) { v.active[GROUND_SLOT] = null; return true; }
  if (!v.owned[GROUND_SLOT].includes(key)) return false;
  v.active[GROUND_SLOT] = key;
  return true;
}

// ---------------------------------------------------------------------------- building one

/**
 * Can this be built right now? Says which materials are short AND which structure is missing,
 * because "you need an assembler" is a far more useful refusal than a greyed-out button.
 */
export function canBuild(player, key, bag, { stations = [] } = {}) {
  const spec = GROUND_VEHICLES[key];
  if (!spec) return { ok: false, why: 'No such vehicle.' };
  if (ownedVehicles(player).includes(key)) return { ok: false, why: `You have already built a ${spec.name}.` };
  const have = new Set(stations);
  const shortStations = (spec.craft.stations || []).filter(s => !have.has(s));
  if (shortStations.length) {
    const names = shortStations.map(s => STATIONS[s]?.name || s).join(' and a ');
    return { ok: false, why: `You need a ${names} first.`, stations: shortStations };
  }
  const purse = bagOf(bag);
  const missing = purse.missing(spec.craft.cost);
  if (Object.keys(missing).length) return { ok: false, why: `Short ${costText(missing)}.`, missing };
  return { ok: true, spec };
}

/**
 * Build one. Takes the materials, adds it to what you own, and selects it — what you just spent a
 * day of work on is what you want to be sitting on.
 *
 * It comes out of the shed with an EMPTY tank on purpose: the first thing a new owner does is find
 * out where their fuel comes from, and that is a better first minute than free petrol.
 */
export function buildVehicle(player, key, bag, opts = {}) {
  const check = canBuild(player, key, bag, opts);
  if (!check.ok) return check;
  const purse = bagOf(bag);
  if (!purse.spend(check.spec.craft.cost)) return { ok: false, why: `Short ${costText(purse.missing(check.spec.craft.cost))}.` };
  const v = block(player);
  v.owned[GROUND_SLOT].push(key);
  v.active[GROUND_SLOT] = key;
  rigState(player, key);
  return { ok: true, spec: check.spec };
}

/** Pour fuel in, up to the tank. Returns how much actually went in — a full tank takes nothing. */
export function refuel(player, key, bag, units = Infinity) {
  const spec = GROUND_VEHICLES[key];
  if (!spec) return { ok: false, why: 'No such vehicle.', added: 0 };
  const rig = rigState(player, key);
  const purse = bagOf(bag);
  const room = Math.max(0, spec.tank - rig.fuel);
  const take = Math.min(room, units, purse.count(GROUND_FUEL.id));
  if (take <= 0) return { ok: false, why: room <= 0 ? `The ${spec.name} is full.` : `No ${GROUND_FUEL.name}.`, added: 0 };
  purse.spend({ [GROUND_FUEL.id]: take });
  rig.fuel += take;
  return { ok: true, added: take, fuel: rig.fuel };
}

/** Patch one up. Wear is gentle, so this is an occasional evening rather than a chore. */
export function repair(player, key, bag) {
  const spec = GROUND_VEHICLES[key];
  if (!spec) return { ok: false, why: 'No such vehicle.' };
  const rig = rigState(player, key);
  if (rig.condition >= 100) return { ok: false, why: `The ${spec.name} is in good order.` };
  const purse = bagOf(bag);
  if (!purse.spend(DATA.repair.cost)) return { ok: false, why: `Short ${costText(purse.missing(DATA.repair.cost))}.` };
  rig.condition = Math.min(100, rig.condition + DATA.repair.restores);
  return { ok: true, condition: rig.condition };
}

// ---------------------------------------------------------------------------- driving it

/**
 * How fast this thing goes HERE — which is the whole point of the ladder.
 *
 * The surface and the slope do the work: a car on a road is the fastest thing in the game and the
 * same car on a marsh is slower than walking. Above the vehicle's own slope limit it returns 0, and
 * the caller should say "the wheels will not take it" rather than silently crawling, because a
 * player who does not know why they stopped will think the game is broken.
 */
export function speedOn(spec, { surface = 'open', slope = 0, condition = 100 } = {}) {
  if (!spec) return 0;
  if (slope > spec.maxSlope) return 0;
  const rule = DATA.surfaces[surface];
  const mult = rule === 'road' ? spec.road : rule === 'offroad' ? spec.offroad : (typeof rule === 'number' ? rule : 1);
  // the last stretch before the limit is not free: at the very edge of what it can climb, it crawls
  const slopeBite = spec.maxSlope > 0 ? 1 - 0.45 * Math.max(0, slope / spec.maxSlope) : 1;
  const worn = condition <= 0 ? DATA.repair.brokenSpeed : 1;
  return spec.speed * mult * slopeBite * worn;
}

/**
 * A stretch of driving: burn the fuel, put the wear on, and say plainly when it stops.
 *
 * Whoever wires the controller calls this once per frame with the metres actually covered. It is
 * the ONE call the game needs — everything else about a vehicle is a lookup.
 */
export function drive(player, metres, bag, { surface = 'open', slope = 0 } = {}) {
  const spec = driveFor(player);
  if (!spec) return { moving: false, why: 'On foot.' };
  const rig = rigState(player, spec.key);
  if (rig.fuel <= 0) return { moving: false, dry: true, why: `The ${spec.name} is out of ${GROUND_FUEL.name}.`, speed: 0 };
  const km = Math.max(0, metres) / 1000;
  const thirst = rig.condition <= 0 ? DATA.repair.brokenThirst : 1;
  const used = Math.min(rig.fuel, km * spec.perKm * thirst);
  rig.fuel = Math.max(0, rig.fuel - used);
  rig.condition = Math.max(0, rig.condition - km * spec.wearPerKm);
  const speed = speedOn(spec, { surface, slope, condition: rig.condition });
  return {
    moving: speed > 0, speed, fuelUsed: used, fuel: rig.fuel, condition: rig.condition,
    dry: rig.fuel <= 0,
    why: speed > 0 ? '' : `The ${spec.name} will not take that slope.`,
  };
}

/** How far what is in the tank will carry you, in metres — for the HUD gauge. */
export function rangeLeft(player, key = driveFor(player)?.key) {
  const spec = GROUND_VEHICLES[key];
  if (!spec) return 0;
  const rig = rigState(player, key);
  return spec.perKm > 0 ? (rig.fuel / spec.perKm) * 1000 : Infinity;
}

/** Extra load the selected vehicle carries, for whoever owns the bag size. */
export function carryBonus(player) { return driveFor(player)?.carry || 0; }
/** How many people ride along — companions in a car, one of them on the back of a bike. */
export function seats(player) { return driveFor(player)?.seats ?? 1; }
/** Can the selected vehicle move a ship subsystem to the pad in one trip? (js/shipyard.js asks.) */
export function haulCapacity(player) { return driveFor(player)?.haul || 0; }

// ---------------------------------------------------------------------------- saying so

/** The model id for avatar-3d/js/ground-vehicles.js. */
export function modelFor(key) { return GROUND_VEHICLES[key]?.model || null; }

/**
 * The card for one vehicle, in plain language and with every number through shared/format.js so
 * nothing ever reads "16.999999999 m/s".
 */
export function describeVehicle(key) {
  const spec = GROUND_VEHICLES[key];
  if (!spec) return null;
  const horse = HORSE_ROW;
  return {
    name: spec.name,
    lore: spec.lore,
    gives: spec.gives,
    costs: spec.costs,
    lines: [
      `${fmt(spec.speed)} m/s on the flat (a horse does ${fmt(horse.speed)})`,
      `${fmt(spec.speed * spec.road)} m/s on a road · ${fmt(spec.speed * spec.offroad)} m/s on broken ground`,
      `climbs a ${pct(spec.maxSlope)} slope (a horse manages ${pct(horse.maxSlope)})`,
      `${fmt(spec.seats)} seat${spec.seats === 1 ? '' : 's'} · carries ${fmt(spec.carry)} · fords ${fmt(spec.ford)} m of water`,
      `${fmt(spec.perKm)} ${GROUND_FUEL.name} a kilometre · a ${fmt(spec.tank)} unit tank goes ${fmt(spec.tank / spec.perKm)} km`,
    ],
    cost: costText(spec.craft.cost),
    stations: (spec.craft.stations || []).map(s => STATIONS[s]?.name || s),
  };
}

/**
 * The comparison table, including the horse — used by the garage screen and by the test that keeps
 * this module honest. The stats where BIGGER IS BETTER are listed once, here, so the "is anything
 * strictly dominated?" question has exactly one answer.
 */
export const BETTER_HIGHER = ['speed', 'road', 'offroad', 'maxSlope', 'seats', 'carry', 'ford', 'thrift'];

/** Every row, with `thrift` (how little fuel it drinks) worked out so the horse's zero wins it. */
export function comparisonRows() {
  return [HORSE_ROW, ...LADDER.map(k => GROUND_VEHICLES[k])].map(v => ({
    ...v, thrift: v.perKm > 0 ? 1 / v.perKm : Infinity,
  }));
}

/**
 * Which rows are strictly worse than some other row at everything.
 *
 * Should always come back empty — if it does not, one rung of the ladder is a trap and the test
 * fails. This is the check that keeps "a vehicle must not be a faster horse" true as numbers get
 * tuned, rather than it being a paragraph in a README that nobody re-reads.
 */
export function dominated() {
  const rows = comparisonRows();
  const out = [];
  for (const a of rows) {
    const beaten = rows.some(b => b !== a
      && BETTER_HIGHER.every(s => (b[s] ?? 0) >= (a[s] ?? 0))
      && BETTER_HIGHER.some(s => (b[s] ?? 0) > (a[s] ?? 0)));
    if (beaten) out.push(a.key);
  }
  return out;
}
