// Farhold — the ship gate. BUILDING_EXPANSION.md §9, which is the reason the rest of the industry
// exists.
//
//   "You do not start with a ship and you cannot buy one. You build a base, you dig up ore, you
//    refine it, you make fuel, and only then does the sky open."
//
// Four subsystems — hull, drive, tanks, avionics — each made of a DIFFERENT tier-3 material so no
// single furnace is the whole industry (§9.5), and the avionics carrying the rare element (§9.6).
// Those four are built by the REFINING chain (data/refining.json's `build_hull` and its three
// siblings, run by js/refine.js); this module is the layer above it — which tier of each you have,
// the pad they go together on (§9.8), the fuel every flight burns (§9.7, §9.10), the warp coil
// (§9.15), the orbital yard, and the migration that lets anyone mid-run keep their ship (§9.19).
// The three hulls that used to sit in a shop are the three tiers (§9.11).
//
// **The one rule that outranks the rest: the gate must never hard-lock a run.** A seed that put you
// on a world whose rare element does not suit is not a difficulty setting, it is a dead save. Two
// things make that impossible and neither of them is in this file: `build_avionics` asks for a
// COUNT of rare element rather than a particular one, and lift fuel has a gas route and a sulphur
// route. This file adds the third — a city will sell you a finished part at a price that hurts
// (§9.18). You can always get off.
//
//   import { migrateSave, buildPart, assembleShip, canLaunch, spendFlightFuel } from './shipyard.js';
//   migrateSave(player);                       // once, on load — §9.19
//   buildPart(player, 'hull', materials, { stations });
//   assembleShip(player, 'lander', materials);
//   const gate = canLaunch(player); if (!gate.ok) hud.log(gate.why, 'bad');
//
// Pure data and arithmetic: no DOM, no Three.js, so the node tests drive the whole arc end to end.

import DATA from '../data/shipyard.json' with { type: 'json' };
import { bagOf, costText, MATERIALS, STATIONS, costValue, recipeFor, recipesFor } from './vehicles.js';
import { VEHICLES, unlockVehicle } from './gear.js';
import { fmt } from '../../../shared/format.js';

export const SUBSYSTEMS = DATA.subsystems;
export const SHIPS = DATA.ships;
export const STATION = DATA.station;
export const PAD = DATA.pad;
export const FUEL = DATA.fuel;
export const MARKET = DATA.market;
export const GATE_VERSION = DATA.gate.version;

/** The order a player meets them in, and the order the journal lists them. */
export const PART_IDS = ['hull', 'drive', 'tanks', 'avionics'];

/** "a Hull Section", "an Avionics Rack" — small thing, but the log reads like a person wrote it. */
const an = name => `${/^[aeiou]/i.test(name || '') ? 'an' : 'a'} ${name}`;

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
  const stamped = v.shipyard?.gate != null;
  const y = (v.shipyard = v.shipyard || {});
  y.built = y.built || { hull: 0, drive: 0, tanks: 0, avionics: 0, warp: 0 };
  for (const id of ['hull', 'drive', 'tanks', 'avionics', 'warp']) y.built[id] = y.built[id] || 0;
  if (typeof y.fuel !== 'number') y.fuel = 0;
  y.pad = !!y.pad;
  y.station = y.station || {};
  y.bought = y.bought || [];                               // parts paid for rather than built, for the journal
  // A save written before the gate existed has a vehicles block with no stamp in it. Catching that
  // HERE rather than only in `migrateSave()` means an old character keeps their ship even if nobody
  // ever wires the migration into the load path — the worst outcome of a missed call should not be
  // somebody's ship quietly vanishing.
  if (!stamped) { y.gate = GATE_VERSION; keepExistingShip(player, y); }
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
  if (v?.shipyard?.gate >= GATE_VERSION) return { migrated: false, kept: [...(v?.owned?.ship || [])] };
  const owned = [...(v?.owned?.ship || [])];
  yard(player);                                   // does the work; see `keepExistingShip` below
  return { migrated: true, kept: owned, tier: owned.length ? Math.max(...owned.map(k => SHIPS[k]?.tier || 1)) : 0 };
}

/**
 * The half of the migration that touches the yard: whatever ship they already own stays theirs, and
 * the yard is back-filled to the state that ship implies.
 *
 * The best ship they own decides how far along it is — you cannot have been flying a Deepfield
 * Hauler without, in this new telling, having built tier-3 everything — and they get a tank of fuel
 * so the next launch is not a wall they never agreed to.
 */
function keepExistingShip(player, y) {
  const owned = player.vehicles?.owned?.ship || [];
  if (!owned.length) return;
  const tier = Math.max(...owned.map(k => SHIPS[k]?.tier || 1));
  for (const id of PART_IDS) y.built[id] = Math.max(y.built[id] || 0, tier);
  y.pad = true;
  y.fuel = Math.max(y.fuel, fuelFor(owned[0], 'launch') + fuelFor(owned[0], 'land'));
  player.vehicles.active = player.vehicles.active || {};
  player.vehicles.active.ship = player.vehicles.active.ship || owned[0];
}

// ---------------------------------------------------------------------------- the rare element

/**
 * §9.6 — which part needs something only a planet can give you, and how much.
 *
 * The answer is not in this file and should not be: `build_avionics` in data/refining.json carries
 * `rareInput: 4`, a COUNT rather than an id, so js/refine.js spends whichever rare element the
 * ground under you actually holds. That is the design decision that makes the gate impossible to
 * hard-lock — no world needs a *particular* element, it just needs one — and this function only
 * reads it back out so a quest pin or a journal line can say so.
 */
export function rareInputFor(id) {
  const part = SUBSYSTEMS[id]?.part;
  return part ? (recipeFor(part)?.rareInput || 0) : 0;
}

/** Every subsystem whose refining recipe wants a rare element, in the order you meet them. */
export function partsNeedingElement() {
  return Object.keys(SUBSYSTEMS).filter(id => rareInputFor(id) > 0);
}

/** How many ways there are to make a thing — two routes to lift fuel is why no world is a dead end. */
export function routesFor(materialId) { return recipesFor(materialId).length; }

// ---------------------------------------------------------------------------- the four subsystems

/** The next tier of a subsystem, or null when it is already at the top. */
export function nextTier(player, id) {
  const sub = SUBSYSTEMS[id];
  if (!sub) return null;
  const at = yard(player).built[id] || 0;
  return sub.tiers[at] || null;
}

/** What building the next tier of this subsystem costs, and whether a rare element goes into it. */
export function partCost(player, id) {
  const tier = nextTier(player, id);
  if (!tier) return null;
  return { cost: { ...tier.cost }, tier, rare: rareInputFor(id) };
}

/**
 * Can the next tier of this subsystem be built? The refusals are deliberately specific — a player
 * staring at a locked Drive should be told that the assembler has not made a Drive Assembly yet,
 * not "cannot build".
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
  if (Object.keys(missing).length) {
    // the tier-1 refusal is nearly always "you have not made the part yet", so say THAT rather than
    // listing a material the player has never seen a recipe for
    const part = sub.part;
    if (missing[part]) {
      const rare = rareInputFor(id);
      const extra = rare ? ` It also wants ${fmt(rare)} of whatever rare element this world holds.` : '';
      return { ok: false, why: `The assembler has not built ${an(MATERIALS[part]?.name || part)} yet.${extra}`, missing };
    }
    return { ok: false, why: `Short ${costText(missing)}.`, missing };
  }
  return { ok: true, tier: next.tier, cost: next.cost };
}

/** Build the next tier of a subsystem. */
export function buildPart(player, id, bag, opts = {}) {
  const check = canBuildPart(player, id, bag, opts);
  if (!check.ok) return check;
  const purse = bagOf(bag);
  if (!purse.spend(check.cost)) return { ok: false, why: `Short ${costText(purse.missing(check.cost))}.` };
  const y = yard(player);
  y.built[id] = check.tier.tier;
  return { ok: true, id, tier: check.tier.tier, name: check.tier.name };
}

/**
 * §9.18 — buy a finished part in a city, at a price that is meant to make you wince.
 *
 * It exists so a bad seed can never wall a player in, and it is priced so that nobody does it
 * twice. Villages and camps do not stock it; a city does.
 */
export function buyPart(player, id, { gold = 0, settlement = 'city', spend } = {}) {
  const price = MARKET.parts[id] ?? null;
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

/**
 * Hand a finished ship over, no questions asked.
 *
 * For `?ship=1` and the tests that are about FLYING rather than about earning the thing. The gate
 * is §9's whole point and must stay real in ordinary play, but a test of how the drive handles
 * should not have to mine ore first — and it must not simulate the grant by poking at the player
 * object, because the shape of the yard is exactly the sort of thing that drifts.
 */
export function grantShip(player, kind = 'lander') {
  if (!player) return { ok: false, why: 'Nobody to give it to.' };
  const got = unlockVehicle(player, 'ship', kind, { granted: true });
  if (!got.ok) return got;
  const y = yard(player);
  const tier = SHIPS[kind]?.tier || 1;
  for (const id of PART_IDS) y.built[id] = Math.max(y.built[id] || 0, tier);
  y.pad = true;
  y.fuel = Math.max(y.fuel, (fuelFor(kind, 'launch') + fuelFor(kind, 'land')) * 4);
  player.vehicles.active = player.vehicles.active || {};
  player.vehicles.active.ship = kind;
  return { ok: true, kind };
}

// ---------------------------------------------------------------------------- fuel

/**
 * PUT FUEL IN THE TANKS.
 *
 * `canLaunch` refuses a flight the tanks cannot pay for and `spendFlightFuel` takes it out again —
 * and nothing anywhere put any IN. `y.fuel` only ever moved when the migration back-filled a save
 * that already had a ship, so a player who built one from nothing had a finished ship, a finished
 * pad, and a permanent refusal telling them the tanks were empty.
 *
 * `bag` is anything with `count`/`spend` — the materials bag or a storage pool — so you can fuel up
 * out of a tank beside the pad without carrying it.
 */
/**
 * R18 — WHAT FINISHING THE ORBITAL YARD ACTUALLY BUYS.
 *
 * `data/shipyard.json`'s `station.grants` — `refuel`, `returnPad`, `warpFitting` — was read by
 * NOTHING. Its own description says "Refuel in orbit, return to it from anywhere in the system, and
 * fit the warp coil without a refinery on the ground", and finishing the top of the tech tree
 * granted none of it.
 *
 * Exported so the grants are one question with one answer, rather than three call sites each
 * re-deriving "is the station done".
 */
export function stationGrants(player) {
  const done = stationProgress(player).complete;
  const g = STATION.grants || {};
  return {
    complete: done,
    refuel: done && !!g.refuel,
    returnPad: done && !!g.returnPad,
    warpFitting: done && !!g.warpFitting,
    desc: g.desc || '',
  };
}

export function refuel(player, bag, units = null) {
  const y = yard(player);
  const purse = bagOf(bag);
  const have = purse.count(FUEL.id);
  /**
   * R18 — a finished orbital yard fills the tanks itself.
   *
   * This is the concrete half of `station.grants.refuel`, and §9's own history is the argument for
   * it: `canLaunch` refused while `spendFlightFuel` spent, and nothing ever PUT fuel in, which is
   * why `refuel()` had to be written at all. Carrying lift fuel up to the thing whose job is to
   * make fuel available in orbit was the last version of the same knot.
   */
  if (have <= 0 && stationGrants(player).refuel) {
    const room = Math.max(0, (FUEL.capacity ?? 60) - y.fuel);
    if (room <= 0) return { ok: false, why: 'The tanks are full.' };
    y.fuel = Math.round((y.fuel + room) * 100) / 100;
    return { ok: true, added: room, fuel: y.fuel, fromStation: true };
  }
  if (have <= 0) {
    return { ok: false, why: `No ${MATERIALS[FUEL.id]?.name || 'lift fuel'} to hand. A fuel synthesiser makes it.` };
  }
  const room = Math.max(0, (FUEL.capacity ?? 60) - y.fuel);
  if (room <= 0) return { ok: false, why: 'The tanks are full.' };
  const take = Math.min(have, room, units == null ? Infinity : units);
  if (take <= 0) return { ok: false, why: 'Nothing to put in.' };
  purse.spend({ [FUEL.id]: take });
  y.fuel = Math.round((y.fuel + take) * 100) / 100;
  return { ok: true, added: take, fuel: y.fuel };
}

/** What one leg costs this ship, in units of Lift Fuel. */
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
    const fuelName = MATERIALS[FUEL.id]?.name || 'fuel';
    return { ok: false, why: `That flight wants ${fmt(need)} ${fuelName} and the tanks hold ${fmt(y.fuel)}.`, need, have: y.fuel };
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
  // the fuel is checked BEFORE anything is taken out of the bag: a module that is built and then
  // cannot be lifted would have quietly eaten twenty hull plates for nothing
  if (y.fuel < STATION.fuelPerModule) {
    return { ok: false, why: `Lifting it wants ${fmt(STATION.fuelPerModule)} ${MATERIALS[FUEL.id]?.name || 'fuel'}; you have ${fmt(y.fuel)}.` };
  }
  const purse = bagOf(bag);
  if (!purse.spend(mod.cost)) return { ok: false, why: `Short ${costText(purse.missing(mod.cost))}.` };
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
      const rare = rareInputFor(id);
      const extra = rare ? ` It needs ${fmt(rare)} of whatever rare element this world holds.` : '';
      return { id, text: `Have the assembler build ${an(MATERIALS[SUBSYSTEMS[id].part]?.name || id)}.${extra}` };
    }
  }
  if (!owned.length) return { id: 'assemble', text: `Put the four together on the pad: ${costText(SHIPS.lander.assembly)}.` };
  const kind = player?.vehicles?.active?.ship || owned[0];
  if (y.fuel < fuelFor(kind, 'launch') + fuelFor(kind, 'land')) {
    return { id: 'fuel', text: `Synthesise ${MATERIALS[FUEL.id]?.name || 'fuel'} — a launch and a landing is ${fmt(fuelFor(kind, 'launch') + fuelFor(kind, 'land'))} units.` };
  }
  if (!(y.built.warp > 0)) {
    return { id: 'warp', text: `A warp coil, which wants ${fmt(rareInputFor('warp'))} more rare element than this world was ever going to give you.` };
  }
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
