// Farhold — the ship gate. BUILDING_EXPANSION.md §9, which is the reason the rest of the industry
// exists.
//
//   "You do not start with a ship and you cannot buy one. You build a base, you dig up ore, you
//    refine it, you make fuel, and only then does the sky open."
//
// Four subsystems — hull, drive, tanks, avionics — each mostly made of a DIFFERENT refined material
// so no single furnace is the whole industry (§9.5). The drive needs a charged core, and a core is
// where the planet's own rare element goes (§9.6). Fuel is separate, consumable and paid per flight
// rather than per launch (§9.7, §9.10), the pad is a structure (§9.8), and the three hulls that used
// to sit in a shop are buildable tiers now (§9.11). Past all that, the far end of the ladder is an
// orbital yard (§9.15).
//
// **The one rule that outranks the rest: the gate must never hard-lock a run.** A seed that put you
// on a world whose rare element does not suit is not a difficulty setting, it is a dead save. So
// there are four core recipes covering every element in universe/data/elements.json between them,
// and a city will sell you a finished part at a price that hurts (§9.18). You can always get off.
//
//   import { migrateSave, buildPart, assembleShip, canLaunch, spendFlightFuel } from './shipyard.js';
//   migrateSave(player);                       // once, on load — §9.19
//   buildPart(player, 'hull', materials, { stations });
//   assembleShip(player, 'lander', materials);
//   const gate = canLaunch(player); if (!gate.ok) hud.log(gate.why, 'bad');
//
// Pure data and arithmetic: no DOM, no Three.js, so the node tests drive the whole arc end to end.

import DATA from '../data/shipyard.json' with { type: 'json' };
import { bagOf, costText, MATERIALS, STATIONS, costValue } from './vehicles.js';
import { VEHICLES, unlockVehicle } from './gear.js';
import { fmt } from '../../../shared/format.js';

export const SUBSYSTEMS = DATA.subsystems;
export const CORES = DATA.cores;
export const SHIPS = DATA.ships;
export const STATION = DATA.station;
export const PAD = DATA.pad;
export const FUEL = DATA.fuel;
export const MARKET = DATA.market;
export const GATE_VERSION = DATA.gate.version;

/** The order a player meets them in, and the order the journal lists them. */
export const PART_IDS = ['hull', 'drive', 'tanks', 'avionics'];

// ---------------------------------------------------------------------------- state

/**
 * The yard lives inside `player.vehicles`, which looks odd until you see why.
 *
 * js/save.js snapshots a FIXED list of fields off the player and this round's file list does not
 * include it, so a `player.shipyard` of my own would be thrown away on every save. `vehicles` is
 * already on that list — it carries the boats and the ships because they are unlockables — so the
 * yard rides along inside it and persists with no change to the save code whatsoever.
 */
export function yard(player) {
  player.vehicles = player.vehicles || { owned: {}, active: {} };
  const v = player.vehicles;
  // Field by field rather than "the whole block or a fresh one", because js/gear.js's
  // `startingVehicles()` writes a block with only the version stamp in it — and a half-filled yard
  // whose `fuel` is undefined would sail through every `fuel < needed` check there is.
  const y = (v.shipyard = v.shipyard || {});
  if (y.gate == null) y.gate = GATE_VERSION;
  y.built = y.built || { hull: 0, drive: 0, tanks: 0, avionics: 0, warp: 0 };
  for (const id of ['hull', 'drive', 'tanks', 'avionics', 'warp']) y.built[id] = y.built[id] || 0;
  if (y.driveFamily === undefined) y.driveFamily = null;   // which family of element charged the drive's core
  if (y.warpFamily === undefined) y.warpFamily = null;     // and the coil's, which has to be a different one
  if (typeof y.fuel !== 'number') y.fuel = 0;
  y.pad = !!y.pad;
  y.station = y.station || {};
  y.bought = y.bought || [];                               // parts paid for rather than built, for the journal
  return y;
}

/**
 * §9.19 — ANYONE MID-RUN KEEPS THEIR SHIP.
 *
 * A save written before the gate existed has a `vehicles` block with no `shipyard` stamp in it. That
 * character has been flying a Surveyor Lander for hours and taking it away because the design
 * changed is the rudest thing this module could do. So: no stamp means an old save, and an old save
 * keeps every ship it owns, gets the subsystems that ship implies marked as built, gets the pad it
 * has obviously been launching from, and gets a tank of fuel so the next launch is not a wall.
 *
 * Safe to run more than once — the stamp is what it checks, and it writes the stamp.
 */
export function migrateSave(player) {
  if (!player) return { migrated: false };
  const v = player.vehicles;
  const stamped = v?.shipyard?.gate;
  if (stamped >= GATE_VERSION) return { migrated: false, kept: [...(v?.owned?.ship || [])] };

  const owned = [...(v?.owned?.ship || [])];
  const y = yard(player);
  y.gate = GATE_VERSION;
  if (!owned.length) return { migrated: true, kept: [] };

  // the best ship they already own decides how far along the yard is: you cannot have been flying a
  // Deepfield Hauler without, in this new telling, having built tier-3 everything
  const tier = Math.max(...owned.map(k => SHIPS[k]?.tier || 1));
  for (const id of PART_IDS) y.built[id] = Math.max(y.built[id] || 0, tier);
  y.driveFamily = y.driveFamily || 'arcane';      // it flew, so something was in the core
  y.pad = true;
  y.fuel = Math.max(y.fuel, fuelFor(owned[0], 'launch') + fuelFor(owned[0], 'land'));
  player.vehicles.active.ship = player.vehicles.active.ship || owned[0];
  return { migrated: true, kept: owned, tier };
}

// ---------------------------------------------------------------------------- cores

/** Which family of core a rare element can charge, or null if nothing here knows it. */
export function coreForElement(elementKey) {
  for (const core of Object.values(CORES)) if (core.elements.includes(elementKey)) return core;
  return null;
}

/** Given what a world actually holds, which cores you could build standing on it. */
export function coresFor(elementKeys = []) {
  const out = [];
  for (const key of elementKeys) { const c = coreForElement(key); if (c && !out.includes(c)) out.push(c); }
  return out;
}

/** The bag id a rare element arrives under — the contract in data/workshop.json. */
export const elementId = key => `el_${key}`;

/**
 * Build a charged core. Takes the element out of the bag and puts the core in, so a core is a
 * thing you can carry, trade and lose rather than a flag on a save.
 */
export function buildCore(player, coreId, bag, { stations = [], element = null } = {}) {
  const core = CORES[coreId];
  if (!core) return { ok: false, why: 'No such core.' };
  if (stations.length && !stations.includes(core.station)) {
    return { ok: false, why: `You need ${STATIONS[core.station]?.name || core.station} for that.` };
  }
  const purse = bagOf(bag);
  // whichever of this family's elements you are actually holding; the named one wins if given
  const useKey = [element, ...core.elements].find(k => k && core.elements.includes(k) && purse.count(elementId(k)) >= core.elementCost);
  if (!useKey) {
    const names = core.elements.join(', ');
    return { ok: false, why: `A ${core.name} needs ${core.elementCost} of ${names}, and you have none of them.` };
  }
  const cost = { ...core.cost, [elementId(useKey)]: core.elementCost };
  if (!purse.spend(cost)) return { ok: false, why: `Short ${costText(purse.missing(cost))}.` };
  purse.add(coreId, 1);
  return { ok: true, core, element: useKey };
}

// ---------------------------------------------------------------------------- the four subsystems

/** The next tier of a subsystem, or null when it is already at the top. */
export function nextTier(player, id) {
  const sub = SUBSYSTEMS[id];
  if (!sub) return null;
  const at = yard(player).built[id] || 0;
  return sub.tiers[at] || null;
}

/** What building the next tier of this subsystem costs, cores included. */
export function partCost(player, id) {
  const tier = nextTier(player, id);
  if (!tier) return null;
  const sub = SUBSYSTEMS[id];
  const cores = sub.coresPerTier ? (sub.coresPerTier[tier.tier - 1] || 0) : 0;
  return { cost: { ...tier.cost }, cores, tier };
}

/**
 * Can the next tier of this subsystem be built? The refusals are deliberately specific — a player
 * staring at a locked Drive should be told it is the core that is missing, not "cannot build".
 */
export function canBuildPart(player, id, bag, { stations = [] } = {}) {
  const sub = SUBSYSTEMS[id];
  if (!sub) return { ok: false, why: 'No such subsystem.' };
  const next = partCost(player, id);
  if (!next) return { ok: false, why: `The ${sub.name} is already as good as it gets.` };
  if (stations.length && !stations.includes(sub.station)) {
    return { ok: false, why: `The ${sub.name} needs ${STATIONS[sub.station]?.name || sub.station}.` };
  }
  const purse = bagOf(bag);
  const missing = purse.missing(next.cost);
  if (Object.keys(missing).length) return { ok: false, why: `Short ${costText(missing)}.`, missing };

  if (next.cores > 0) {
    const y = yard(player);
    const held = Object.values(CORES).filter(c => purse.count(c.id) >= next.cores);
    // §9.15: the coil's core must come from a different family than the drive's, which is what
    // sends you to another world for it rather than mining the same hillside twice
    const allowed = sub.coreMustDifferFromDrive && y.driveFamily
      ? held.filter(c => c.family !== y.driveFamily)
      : held;
    if (!allowed.length) {
      const why = sub.coreMustDifferFromDrive && y.driveFamily && held.length
        ? `The ${sub.name} cannot run on the same family of core as the drive. Find an element that is not ${y.driveFamily}.`
        : `The ${sub.name} needs ${next.cores} charged core${next.cores === 1 ? '' : 's'}.`;
      return { ok: false, why, needsCore: next.cores };
    }
    return { ok: true, tier: next.tier, cost: next.cost, core: allowed[0], cores: next.cores };
  }
  return { ok: true, tier: next.tier, cost: next.cost, cores: 0 };
}

/** Build the next tier of a subsystem. */
export function buildPart(player, id, bag, opts = {}) {
  const check = canBuildPart(player, id, bag, opts);
  if (!check.ok) return check;
  const purse = bagOf(bag);
  const cost = { ...check.cost };
  if (check.cores) cost[check.core.id] = (cost[check.core.id] || 0) + check.cores;
  if (!purse.spend(cost)) return { ok: false, why: `Short ${costText(purse.missing(cost))}.` };
  const y = yard(player);
  y.built[id] = check.tier.tier;
  if (check.core) {
    if (id === 'warp') y.warpFamily = check.core.family;
    else y.driveFamily = check.core.family;
  }
  return { ok: true, id, tier: check.tier.tier, name: check.tier.name };
}

/**
 * §9.18 — buy a finished part in a city, at a price that is meant to make you wince.
 *
 * It exists so a bad seed can never wall a player in, and it is priced so that nobody does it
 * twice. Villages and camps do not stock it; a city does.
 */
export function buyPart(player, id, { gold = 0, settlement = 'city', spend } = {}) {
  const price = MARKET.parts[id] ?? (CORES[id] ? MARKET.core : null);
  const sub = SUBSYSTEMS[id];
  if (price == null) return { ok: false, why: 'Nobody sells that.' };
  if (settlement !== MARKET.minSettlement) return { ok: false, why: 'Only a city deals in ship parts.' };
  const purse = player.gold != null ? player : { gold };
  if ((purse.gold || 0) < price) return { ok: false, why: `That is ${fmt(price)} gold and you have ${fmt(purse.gold || 0)}.` };
  purse.gold -= price;
  if (typeof spend === 'function') spend(price);
  const y = yard(player);
  if (sub) { y.built[id] = Math.max(y.built[id] || 0, 1); y.bought.push(id); }
  return { ok: true, id, price };
}

// ---------------------------------------------------------------------------- the pad

/** §9.8 — the pad is a structure: flat ground, clearance, power, and a lot of cut block. */
export function buildPad(player, bag, { stations = [], flat = true, powered = true } = {}) {
  const y = yard(player);
  if (y.pad) return { ok: false, why: 'You already have a pad.' };
  if (!flat) return { ok: false, why: `The pad needs ${fmt(PAD.flatRadius)} metres of level ground. Use the smoothing tool.` };
  if (!powered) return { ok: false, why: `The pad draws ${fmt(PAD.power)} kW and the grid is not carrying it.` };
  const purse = bagOf(bag);
  if (!purse.spend(PAD.cost)) return { ok: false, why: `Short ${costText(purse.missing(PAD.cost))}.` };
  y.pad = true;
  return { ok: true };
}

// ---------------------------------------------------------------------------- the ship itself

/** Is everything in place for this ship? Says exactly which subsystem is behind. */
export function shipReady(player, kind) {
  const ship = SHIPS[kind];
  if (!ship) return { ok: false, why: 'No such ship.' };
  const y = yard(player);
  const behind = Object.entries(ship.needs).filter(([id, tier]) => (y.built[id] || 0) < tier);
  if (behind.length) {
    const names = behind.map(([id, tier]) => `${SUBSYSTEMS[id].name} (tier ${tier}, yours is ${y.built[id] || 0})`);
    return { ok: false, why: `Not yet: ${names.join(', ')}.`, behind: behind.map(b => b[0]) };
  }
  if (!y.pad) return { ok: false, why: 'Nowhere to put it together. Build a launch pad.', behind: ['pad'] };
  return { ok: true, ship };
}

/**
 * Put the four subsystems together into a ship and hand it over.
 *
 * The handover goes through js/gear.js's `unlockVehicle` with `granted: true`, because the ship
 * slot is still the unlockable it always was — what changed is that the only door into it is this
 * function rather than a merchant's shelf.
 */
export function assembleShip(player, kind, bag, opts = {}) {
  const check = shipReady(player, kind);
  if (!check.ok) return check;
  const purse = bagOf(bag);
  if (!purse.spend(check.ship.assembly)) {
    return { ok: false, why: `Short ${costText(purse.missing(check.ship.assembly))}.` };
  }
  const got = unlockVehicle(player, 'ship', kind, { granted: true });
  if (!got.ok) return got;
  return { ok: true, kind, name: VEHICLES.ship.kinds[kind].name };
}

// ---------------------------------------------------------------------------- fuel

/** What one leg costs this ship, in units of Drive Fuel. */
export function fuelFor(kind, leg) {
  const base = FUEL.legs[leg];
  if (base == null) return 0;
  return Math.round(base * (SHIPS[kind]?.fuel?.[leg] ?? 1) * 100) / 100;
}

/** How much the tanks you have built will hold. */
export function tankCapacity(player) {
  const tier = yard(player).built.tanks || 0;
  return SUBSYSTEMS.tanks.capacity[Math.max(0, tier - 1)] || 0;
}

/** Load synthesised fuel out of the bag and into the tanks. Over the brim simply does not go in. */
export function loadFuel(player, bag, units = Infinity) {
  const y = yard(player);
  const cap = tankCapacity(player);
  if (cap <= 0) return { ok: false, why: 'No tanks to put it in.', added: 0 };
  const purse = bagOf(bag);
  const take = Math.min(cap - y.fuel, units, purse.count(FUEL.id));
  if (take <= 0) {
    return { ok: false, why: y.fuel >= cap ? 'The tanks are full.' : `No ${MATERIALS[FUEL.id]?.name || FUEL.id}. That is what the synthesiser is for.`, added: 0 };
  }
  purse.spend({ [FUEL.id]: take });
  y.fuel = Math.round((y.fuel + take) * 100) / 100;
  return { ok: true, added: take, fuel: y.fuel, capacity: cap };
}

/**
 * May this flight happen? Checks the ship, the pad and — the part that matters — whether there is
 * enough fuel left over afterwards to PUT IT DOWN AGAIN. Stranding somebody in orbit with a dry
 * tank is not difficulty, it is a save they cannot recover.
 */
export function canLaunch(player, { leg = 'launch', fromPad = true } = {}) {
  const kind = player?.vehicles?.active?.ship;
  const owned = player?.vehicles?.owned?.ship || [];
  if (!kind || !owned.includes(kind)) {
    return { ok: false, why: 'You have no ship. Build one: hull, drive, tanks, avionics, then put them together on a pad.' };
  }
  const y = yard(player);
  if (leg === 'launch' && fromPad && !y.pad) return { ok: false, why: 'A ship lifts off a pad. You have not built one.' };
  if (leg === 'warp' && !(y.built.warp > 0)) return { ok: false, why: 'Leaving the star needs a warp coil.' };
  const need = fuelFor(kind, leg) + (leg === 'launch' ? fuelFor(kind, 'land') * FUEL.reserve : 0);
  if (y.fuel < need) {
    return { ok: false, why: `That flight wants ${fmt(need)} Drive Fuel and the tanks hold ${fmt(y.fuel)}.`, need, have: y.fuel };
  }
  return { ok: true, kind, need };
}

/** Burn the fuel for a leg. Call it when the flight actually starts, not when it is offered. */
export function spendFlightFuel(player, leg = 'launch') {
  const gate = canLaunch(player, { leg, fromPad: leg === 'launch' });
  if (!gate.ok) return gate;
  const y = yard(player);
  const burn = fuelFor(gate.kind, leg);
  y.fuel = Math.max(0, Math.round((y.fuel - burn) * 100) / 100);
  return { ok: true, burned: burn, fuel: y.fuel };
}

// ---------------------------------------------------------------------------- the orbital yard

/** §9.15 — the far end: four modules, each one lifted into orbit by a hauler. */
export function stationProgress(player) {
  const y = yard(player);
  const done = STATION.modules.filter(m => y.station[m.id]);
  return {
    done: done.map(m => m.id),
    left: STATION.modules.filter(m => !y.station[m.id]).map(m => m.id),
    complete: done.length === STATION.modules.length,
    fraction: done.length / STATION.modules.length,
  };
}

/** What the yard needs before a single module may go up. */
export function stationGate(player) {
  const y = yard(player);
  const owned = player?.vehicles?.owned?.ship || [];
  if (!owned.includes(STATION.requires.ship)) {
    return { ok: false, why: `A module is too heavy for anything but the ${VEHICLES.ship.kinds[STATION.requires.ship].name}.` };
  }
  if (STATION.requires.pad && !y.pad) return { ok: false, why: 'Nothing goes up without a pad.' };
  return { ok: true };
}

/** Build one module and lift it. The lift is what makes this the far end rather than another bench. */
export function buildStationModule(player, id, bag, { stations = [] } = {}) {
  const mod = STATION.modules.find(m => m.id === id);
  if (!mod) return { ok: false, why: 'No such module.' };
  const gate = stationGate(player);
  if (!gate.ok) return gate;
  const y = yard(player);
  if (y.station[id]) return { ok: false, why: `The ${mod.name} is already up there.` };
  if (stations.length && !stations.includes('assembler')) return { ok: false, why: 'A module is assembler work.' };
  const purse = bagOf(bag);
  if (!purse.spend(mod.cost)) return { ok: false, why: `Short ${costText(purse.missing(mod.cost))}.` };
  if (y.fuel < STATION.fuelPerModule) {
    purse.add && Object.entries(mod.cost).forEach(([k, n]) => purse.add(k, n));   // nothing is taken for a flight that cannot happen
    return { ok: false, why: `Lifting it wants ${fmt(STATION.fuelPerModule)} Drive Fuel; you have ${fmt(y.fuel)}.` };
  }
  y.fuel = Math.round((y.fuel - STATION.fuelPerModule) * 100) / 100;
  y.station[id] = true;
  return { ok: true, id, name: mod.name, progress: stationProgress(player) };
}

// ---------------------------------------------------------------------------- saying what is next

/**
 * §9.16 — ONE LINE SAYING WHAT TO BUILD NEXT, so the player is never guessing.
 *
 * The order is the order the arc wants: a pad to stand it on, the four subsystems, the ship, fuel,
 * then the coil and the yard. Whatever this returns is what a quest pin should point at.
 */
export function nextStep(player) {
  const y = yard(player);
  const owned = player?.vehicles?.owned?.ship || [];
  if (!y.pad) return { id: 'pad', text: `Level some ground and lay a ${PAD.name}: ${costText(PAD.cost)}.` };
  for (const id of PART_IDS) {
    if ((y.built[id] || 0) < 1) {
      const next = partCost(player, id);
      const core = SUBSYSTEMS[id].coresPerTier ? ' and a charged core' : '';
      return { id, text: `Build the ${SUBSYSTEMS[id].name}: ${costText(next.cost)}${core}.` };
    }
  }
  if (!owned.length) return { id: 'assemble', text: `Put the four together on the pad: ${costText(SHIPS.lander.assembly)}.` };
  const kind = player?.vehicles?.active?.ship || owned[0];
  if (y.fuel < fuelFor(kind, 'launch') + fuelFor(kind, 'land')) {
    return { id: 'fuel', text: `Synthesise Drive Fuel — a launch and a landing is ${fmt(fuelFor(kind, 'launch') + fuelFor(kind, 'land'))} units.` };
  }
  if (!(y.built.warp > 0)) return { id: 'warp', text: `A warp coil needs a core from a different element family than the drive's ${y.driveFamily || 'core'}.` };
  const st = stationProgress(player);
  if (!st.complete) return { id: 'station', text: `The ${STATION.name}: ${st.left.length} module${st.left.length === 1 ? '' : 's'} left to lift.` };
  return { id: 'done', text: 'The yard is finished. There is nothing left down here that you need.' };
}

/** The whole gate as readable lines, for a journal page. Every number through shared/format.js. */
export function describeGate(player) {
  const y = yard(player);
  const kind = player?.vehicles?.active?.ship;
  return [
    ...PART_IDS.map(id => `${SUBSYSTEMS[id].name}: ${y.built[id] ? `tier ${fmt(y.built[id])}` : 'not built'}`),
    `Warp coil: ${y.built.warp ? 'fitted' : 'not fitted'}`,
    `Pad: ${y.pad ? 'laid' : 'not laid'}`,
    `Fuel: ${fmt(y.fuel)} of ${fmt(tankCapacity(player))}${kind ? ` · a launch costs ${fmt(fuelFor(kind, 'launch'))}` : ''}`,
    `Orbital yard: ${fmt(stationProgress(player).done.length)} of ${fmt(STATION.modules.length)} modules`,
  ];
}

/** What the whole gate is worth in materials, for a balance pass. */
export function gateValue() {
  let total = costValue(PAD.cost) + costValue(SHIPS.lander.assembly);
  for (const id of PART_IDS) total += costValue(SUBSYSTEMS[id].tiers[0].cost);
  return total;
}
