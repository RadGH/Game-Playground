// node --test prototypes/farhold/tests/shipyard.test.js
//
// BUILDING_EXPANSION.md §9 — the ship gate:
//
//   "You do not start with a ship and you cannot buy one. You build a base, you dig up ore, you
//    refine it, you make fuel, and only then does the sky open."
//
// The four subsystems are made by the REFINING chain (data/refining.json's `build_hull` and its
// three siblings). js/shipyard.js is the layer above: which tier of each you have, the pad, the
// fuel per flight, the warp coil, the orbital yard, and the migration. So these tests run across
// both — they refine real materials through the real recipes and then take the ship off the ground.
//
// Two of them matter more than the rest and they are the two the brief asked for by name:
//
//   1. **The gate is completable from a fresh start on a low-band world.** Not "the numbers look
//      fine" — the test gathers what the chain says it needs, refines it, builds the four
//      subsystems, lays the pad, assembles a lander, synthesises fuel and launches.
//
//   2. **An existing save keeps its ship.** §9.19. Somebody who has been flying a Surveyor Lander
//      for six hours does not lose it because the design changed underneath them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SUBSYSTEMS, SHIPS, STATION, PAD, FUEL, MARKET, GATE_VERSION, PART_IDS,
  yard, migrateSave, rareInputFor, partsNeedingElement, routesFor,
  partCost, canBuildPart, buildPart, buyPart, buildPad, shipReady, assembleShip,
  fuelFor, tankCapacity, loadFuel, canLaunch, spendFlightFuel,
  stationProgress, stationGate, buildStationModule, nextStep, describeGate, gateValue,
  stationGrants, refuel,
} from '../js/shipyard.js';
import { MATERIALS, isGathered, recipeFor, recipesFor, rawInputs, costValue } from '../js/vehicles.js';
import { startingVehicles, unlockVehicle, SHIP_GATE_VERSION, VEHICLES } from '../js/gear.js';
import { hasLongDecimal } from '../../../shared/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const elements = JSON.parse(readFileSync(join(here, '../../../universe/data/elements.json'), 'utf8'));
const shipyardData = JSON.parse(readFileSync(join(here, '../data/shipyard.json'), 'utf8'));
const vehicleData = JSON.parse(readFileSync(join(here, '../data/vehicles.json'), 'utf8'));
const refining = JSON.parse(readFileSync(join(here, '../data/refining.json'), 'utf8'));

const ALL_STATIONS = Object.keys(refining.machines);

// ------------------------------------------------------------------ a bot that actually refines

/**
 * Refine `id` up out of whatever is in the bag, running the real recipes on the way.
 *
 * This stands in for js/refine.js, and it follows data/refining.json exactly — so if a craft is
 * impossible the bot gets stuck and the test says so, rather than the game finding out later. A
 * recipe's `rareInput` is spent out of the `rare` pile, which is how js/refine.js models "whichever
 * element this planet happens to hold".
 */
function refineTo(bag, id, need) {
  if (isGathered(id)) return (bag[id] || 0) >= need;
  let guard = 0;
  while ((bag[id] || 0) < need) {
    if (++guard > 4000) return false;
    // try every route and take the first one whose inputs we can get hold of
    const routes = recipesFor(id);
    if (!routes.length) return false;
    let ran = false;
    for (const r of routes) {
      if (r.rareInput && (bag.rare || 0) < r.rareInput) continue;
      if (!Object.entries(r.inputs).every(([sub, n]) => refineTo(bag, sub, n))) continue;
      for (const [sub, n] of Object.entries(r.inputs)) bag[sub] -= n;
      if (r.rareInput) bag.rare -= r.rareInput;
      for (const [out, n] of Object.entries(r.outputs)) bag[out] = (bag[out] || 0) + n;
      ran = true;
      break;
    }
    if (!ran) return false;
  }
  return true;
}

/**
 * Make sure a whole cost table is in the bag.
 *
 * It goes round more than once on purpose: refining a hull plate eats machine parts, so topping the
 * parts up first and the plates up second can leave you short of the parts you just made. Real
 * refining has exactly the same problem and the answer is the same — make some more.
 */
function stock(bag, cost) {
  const have = () => Object.entries(cost).every(([id, n]) => (bag[id] || 0) >= n);
  for (let pass = 0; pass < 12; pass++) {
    if (have()) return true;
    for (const [id, n] of Object.entries(cost)) if (!refineTo(bag, id, n)) return false;
  }
  return have();
}

/** A day's mining, cutting and hunting, plus whatever rare element this world holds. */
function gathered(rare = 40) {
  const bag = { rare };
  for (const id of Object.keys(MATERIALS)) if (isGathered(id)) bag[id] = 5000;
  return bag;
}

/** What a fresh character carries out of the character screen. */
const freshPlayer = () => ({ gold: 0, vehicles: startingVehicles() });

// ------------------------------------------------------------------ §9.1, §9.2

test('a fresh character has no ship and is told exactly why they cannot fly', () => {
  const player = freshPlayer();
  const gate = canLaunch(player);
  assert.equal(gate.ok, false);
  assert.match(gate.why, /no ship/i);
  assert.match(gate.why, /hull, drive, tanks, avionics/i, 'the refusal has to say what to do about it');
});

test('the gate stamp in js/gear.js and data/shipyard.json are the same number', () => {
  assert.equal(SHIP_GATE_VERSION, GATE_VERSION,
    'gear.js repeats this number because it cannot import shipyard.js; keep the two in step');
});

/**
 * §9.5 — "Each needs a different refined material", checked against the REFINING data rather than
 * against this module's own word for it. Each of the four is mostly one tier-3 material, and no two
 * of them lean on the same one, which is what stops a single furnace being the whole industry.
 */
test('each subsystem is made of a different tier-3 material', () => {
  const sigs = PART_IDS.map(id => SUBSYSTEMS[id].signature);
  assert.equal(new Set(sigs).size, sigs.length, 'two subsystems share a signature material');
  for (const id of PART_IDS) {
    const sub = SUBSYSTEMS[id];
    const recipe = recipeFor(sub.part);
    assert.ok(recipe, `nothing in data/refining.json makes ${sub.part}`);
    assert.ok(recipe.inputs[sub.signature] > 0,
      `${id} claims ${sub.signature} but ${recipe.id} does not use any`);
    // "a different material each" is about what a part is MOSTLY made of, not about the four
    // sharing nothing at all — they all want machine parts, and that is fine
    for (const other of PART_IDS.filter(o => o !== id)) {
      const theirs = recipeFor(SUBSYSTEMS[other].part).inputs[sub.signature] || 0;
      assert.ok(recipe.inputs[sub.signature] > theirs,
        `${other} uses more ${sub.signature} than ${id} does, so it is not ${id}'s signature`);
    }
  }
  // and between them the four use most of the top of the chain, which is the point of §9.5
  const used = new Set(PART_IDS.flatMap(id => Object.keys(recipeFor(SUBSYSTEMS[id].part).inputs)));
  assert.ok(used.size >= 6, `the four subsystems between them use only ${used.size} materials`);
});

test('every craft in the gate can be made out of things you dig up', () => {
  const tables = [
    ['the pad', PAD.cost],
    ...Object.values(SHIPS).map(s => [`the ${s.key} assembly`, s.assembly]),
    ...STATION.modules.map(m => [m.name, m.cost]),
    ...Object.entries(SUBSYSTEMS).flatMap(([id, s]) => s.tiers.map((t, i) => [`${id} tier ${i + 1}`, t.cost])),
    ['a batch of lift fuel', { lift_fuel: 1 }],
  ];
  for (const [what, cost] of tables) {
    for (const id of Object.keys(cost)) assert.ok(MATERIALS[id], `${what} wants "${id}", which is not a material`);
    const raw = rawInputs(cost);
    assert.ok(raw, `${what} needs something the refining chain cannot produce`);
    for (const id of Object.keys(raw)) {
      assert.ok(isGathered(id) || id === 'rare', `${what} bottoms out at "${id}", which nobody gathers`);
    }
  }
});

// ------------------------------------------------------------------ §9.6 — the rare element

/**
 * THE RULE THAT KEEPS A SEED FROM KILLING A RUN.
 *
 * `build_avionics` asks for `rareInput: 4` — a COUNT, not a named element — so js/refine.js spends
 * whichever rare element the world under you holds. That is what makes §9.6 ("not every planet has
 * every element") a reason to travel rather than a reason to start again, and it is why this test
 * checks the shape of the requirement rather than a list of element keys.
 */
test('the rare element is a count, not a named element, so no world is the wrong world', () => {
  assert.deepEqual(partsNeedingElement(), ['avionics', 'warp'], 'one subsystem and the coil, and no others');
  assert.equal(rareInputFor('avionics'), 4);
  assert.ok(rareInputFor('warp') > rareInputFor('avionics'), 'the coil is the second, dearer hunt (§9.15)');
  for (const id of ['hull', 'drive', 'tanks']) {
    assert.equal(rareInputFor(id), 0, `${id} should not send you hunting as well`);
  }
  // nothing in the chain names a particular element, which is the property that matters
  for (const r of refining.recipes) {
    for (const input of Object.keys(r.inputs)) {
      assert.ok(!elements.rare.some(e => e.key === input),
        `${r.id} names the element ${input}; a recipe that names one can be impossible on a world`);
    }
  }
  // and every kind of world holds at least one rare element to spend
  for (const world of new Set(elements.rare.flatMap(e => e.worlds))) {
    assert.ok(elements.rare.some(e => e.worlds.includes(world)), `a ${world} world holds nothing rare`);
  }
});

test('fuel has more than one route, so a world with no gas vents is not a world you die on', () => {
  assert.ok(routesFor(FUEL.id) >= 2,
    'lift fuel needs a second recipe — one route means a world without that input can never leave');
  const inputs = recipesFor(FUEL.id).map(r => Object.keys(r.inputs));
  assert.ok(inputs.some(list => list.includes('vent_gas')) && inputs.some(list => list.includes('sulphur')),
    'the two routes should want genuinely different things, or they are the same route twice');
});

// ------------------------------------------------------------------ the whole arc

/**
 * THE TEST THE BRIEF ASKED FOR: completable from a fresh start.
 *
 * It plays the gate through the real modules — gather, refine through data/refining.json, build,
 * lay the pad, assemble, synthesise, launch. A low-band world is a thin world, not a different one
 * (js/resources.js scales node richness by band), so what this proves is that the RECIPES close:
 * anything that makes the gate impossible — a typo in an id, a recipe that needs itself, a part
 * nothing produces — fails here rather than in somebody's save.
 */
test('the gate is completable from nothing, on a low-band world with one rare seam', () => {
  const player = freshPlayer();
  const bag = gathered(rareInputFor('avionics'));     // exactly enough element for the avionics

  assert.ok(stock(bag, PAD.cost), 'could not refine the pad');
  assert.equal(buildPad(player, bag, { stations: ALL_STATIONS }).ok, true, 'pad');

  for (const id of PART_IDS) {
    const next = partCost(player, id);
    assert.ok(stock(bag, next.cost), `could not refine the ${SUBSYSTEMS[id].name}`);
    const built = buildPart(player, id, bag, { stations: ALL_STATIONS });
    assert.equal(built.ok, true, `${id} — ${built.why}`);
  }
  assert.equal(bag.rare, 0, 'the avionics should have spent the element this world gave you');

  assert.ok(stock(bag, SHIPS.lander.assembly), 'could not refine the assembly');
  const ship = assembleShip(player, 'lander', bag, {});
  assert.equal(ship.ok, true, `assembly — ${ship.why}`);
  assert.deepEqual(player.vehicles.owned.ship, ['lander'], 'the ship was not handed over');

  const need = fuelFor('lander', 'launch') + fuelFor('lander', 'land');
  assert.ok(stock(bag, { lift_fuel: Math.ceil(need) }), 'could not synthesise fuel');
  assert.equal(loadFuel(player, bag).ok, true, 'fuelling');

  const gate = canLaunch(player);
  assert.equal(gate.ok, true, `still cannot fly — ${gate.why}`);
  assert.equal(spendFlightFuel(player, 'launch').ok, true, 'launch');
  assert.ok(yard(player).fuel >= fuelFor('lander', 'land'),
    'launched with nothing left to land on, which is a save nobody can rescue');
});

test('and the run goes on: a hauler, a warp coil and an orbital yard off the same chain', () => {
  const player = freshPlayer();
  const bag = gathered(200);
  assert.ok(stock(bag, PAD.cost), 'could not refine the pad');
  assert.equal(buildPad(player, bag, {}).ok, true, 'pad');
  for (const id of [...PART_IDS, 'warp']) {
    for (let tier = 0; tier < SUBSYSTEMS[id].tiers.length; tier++) {
      const next = partCost(player, id);
      if (!next) break;
      assert.ok(stock(bag, next.cost), `could not refine ${id} tier ${next.tier.tier}`);
      const out = buildPart(player, id, bag, {});
      assert.equal(out.ok, true, `${id} tier ${next.tier.tier} — ${out.why}`);
    }
  }
  assert.ok(stock(bag, SHIPS.hauler.assembly));
  const put = assembleShip(player, 'hauler', bag, {});
  assert.equal(put.ok, true, `the hauler would not go together — ${put.why}`);
  assert.equal(canLaunch(player, { leg: 'warp' }).ok, false, 'no fuel yet, and it should say so');

  const y = yard(player);
  assert.ok(stock(bag, { lift_fuel: tankCapacity(player) }));
  loadFuel(player, bag);
  assert.equal(canLaunch(player, { leg: 'warp' }).ok, true, 'a coil and a full tank is a star hop');

  for (const mod of STATION.modules) {
    assert.ok(stock(bag, mod.cost), `could not refine ${mod.name}`);
    y.fuel = Math.max(y.fuel, STATION.fuelPerModule);
    const out = buildStationModule(player, mod.id, bag, {});
    assert.equal(out.ok, true, `${mod.name} — ${out.why}`);
  }
  assert.equal(stationProgress(player).complete, true, 'the far end of the ladder is reachable');
});

test('the whole first ship is a milestone, not an afternoon, and not a second career', () => {
  const worth = gateValue();
  assert.ok(worth > costValue(vehicleData.vehicles.truck.craft.cost),
    'leaving the planet should cost more than the biggest thing you drive on it');
  assert.ok(worth < 40000, `the gate is worth ${worth} in materials, which is a grind rather than an arc`);
});

// ------------------------------------------------------------------ fuel is per flight

test('fuel is charged per flight, and a launch always keeps enough back to land', () => {
  const player = freshPlayer();
  unlockVehicle(player, 'ship', 'lander', { granted: true });
  const y = yard(player);
  y.pad = true;
  y.built.tanks = 1;

  y.fuel = fuelFor('lander', 'launch');                   // exactly enough to go up and no more
  const refused = canLaunch(player);
  assert.equal(refused.ok, false);
  assert.match(refused.why, /Lift Fuel/);

  y.fuel = fuelFor('lander', 'launch') + fuelFor('lander', 'land');
  assert.equal(canLaunch(player).ok, true);
  spendFlightFuel(player, 'launch');
  assert.ok(Math.abs(y.fuel - fuelFor('lander', 'land')) < 1e-6, 'a launch costs a launch');

  // §9.10: every leg costs, not just the first one off the ground
  for (const leg of ['launch', 'land', 'jump', 'warp']) assert.ok(fuelFor('lander', leg) > 0, `${leg} is free`);
});

test('the three ships are good at different things, which is what makes them tiers worth climbing', () => {
  assert.ok(fuelFor('runner', 'launch') < fuelFor('lander', 'launch'), 'the runner is the cheap one off a world');
  assert.ok(fuelFor('hauler', 'jump') < fuelFor('lander', 'jump'), 'the hauler is the cheap one between them');
  assert.ok(fuelFor('hauler', 'launch') > fuelFor('lander', 'launch'), 'and it pays for that on the way up');
  const caps = SUBSYSTEMS.tanks.capacity;
  for (let i = 1; i < caps.length; i++) assert.ok(caps[i] > caps[i - 1], 'tank tiers have to hold more');
});

test('the tanks you built are the tanks you have, and fuel over the brim does not go in', () => {
  const player = freshPlayer();
  yard(player).built.tanks = 1;
  const bag = { lift_fuel: 999 };
  const r = loadFuel(player, bag);
  assert.equal(r.ok, true);
  assert.equal(r.fuel, tankCapacity(player));
  assert.equal(bag.lift_fuel, 999 - tankCapacity(player), 'only what fitted was taken');
  assert.equal(loadFuel(player, bag).ok, false, 'a full tank takes nothing');
});

// ------------------------------------------------------------------ §9.19 — an existing save

test('a save from before the gate keeps the ship it has been flying', () => {
  // exactly what js/save.js wrote for a character mid-run: a vehicles block, no yard in it
  const old = {
    gold: 400,
    vehicles: { owned: { boat: ['raft', 'skiff'], ship: ['lander'] }, active: { boat: 'skiff', ship: 'lander' } },
  };
  const out = migrateSave(old);
  assert.equal(out.migrated, true);
  assert.deepEqual(out.kept, ['lander']);
  assert.deepEqual(old.vehicles.owned.ship, ['lander'], 'the ship is still theirs');
  assert.equal(old.vehicles.active.ship, 'lander');

  const y = yard(old);
  for (const id of PART_IDS) assert.ok(y.built[id] >= 1, `${id} should be marked built — they flew here`);
  assert.equal(y.pad, true, 'they were obviously launching from somewhere');
  assert.equal(canLaunch(old).ok, true, 'and they can still fly, which is the whole point of the migration');
});

test('a save that had bought the best ship keeps the tiers that implies', () => {
  const old = { vehicles: { owned: { ship: ['lander', 'hauler'] }, active: { ship: 'hauler' } } };
  migrateSave(old);
  const y = yard(old);
  for (const id of PART_IDS) assert.equal(y.built[id], SHIPS.hauler.tier, `${id} should be at the hauler's tier`);
});

test('the migration is safe to run more than once, and never touches a new character', () => {
  const old = { vehicles: { owned: { ship: ['lander'] }, active: { ship: 'lander' } } };
  migrateSave(old);
  yard(old).built.hull = 3;
  assert.equal(migrateSave(old).migrated, false, 'a second run must not happen');
  assert.equal(yard(old).built.hull, 3, 'and must not undo work done since');

  const fresh = freshPlayer();
  migrateSave(fresh);
  assert.deepEqual(fresh.vehicles.owned.ship, [], 'a new character is never handed a ship by the migration');
});

test('an old save keeps its ship even if nobody ever calls the migration', () => {
  // The belt and braces: `yard()` runs the same check, so the worst outcome of a missed call in the
  // load path is not somebody's ship quietly vanishing. Loading straight into `canLaunch` — which
  // is what js/main.js's `launch()` would do — has to find a ship, a pad and a tank of fuel.
  const old = { vehicles: { owned: { ship: ['runner'] }, active: { ship: 'runner' } } };
  const gate = canLaunch(old);
  assert.equal(gate.ok, true, `an old save was refused a launch: ${gate.why}`);
  assert.equal(yard(old).pad, true, 'they were obviously launching from somewhere');
  assert.ok(yard(old).fuel >= fuelFor('runner', 'launch') + fuelFor('runner', 'land'),
    'and they get enough fuel to go up and come back down, rather than one trip they cannot finish');
});

// ------------------------------------------------------------------ the pad, the yard, the way out

test('the pad wants level ground and power, and says which one is missing', () => {
  const player = freshPlayer();
  const bag = gathered();
  stock(bag, PAD.cost);
  assert.match(buildPad(player, bag, { flat: false }).why, /level ground/);
  assert.match(buildPad(player, bag, { powered: false }).why, /kW/);
  assert.equal(buildPad(player, bag, {}).ok, true);
  assert.match(buildPad(player, bag, {}).why, /already/);
});

test('a ship will not go together until all four are built, and it names the one that is behind', () => {
  const player = freshPlayer();
  const y = yard(player);
  y.pad = true;
  y.built.hull = 1; y.built.drive = 1; y.built.tanks = 1;
  const r = shipReady(player, 'lander');
  assert.equal(r.ok, false);
  assert.match(r.why, /Avionics/);
  y.built.avionics = 1;
  assert.equal(shipReady(player, 'lander').ok, true);
  // and a runner is a real step up rather than a rename
  assert.equal(shipReady(player, 'runner').ok, false);
});

test('a locked subsystem says the assembler has not made the part yet, not "cannot build"', () => {
  const player = freshPlayer();
  assert.match(canBuildPart(player, 'hull', {}, { stations: ALL_STATIONS }).why, /Hull Section/);
  assert.match(canBuildPart(player, 'avionics', {}, { stations: ALL_STATIONS }).why, /rare element/);
  assert.match(canBuildPart(player, 'hull', {}, { stations: ['furnace'] }).why, /Assembler/);
});

test('§9.18 — a city will sell you a way out, at a price that hurts', () => {
  const player = { gold: MARKET.parts.drive, vehicles: startingVehicles() };
  assert.match(buyPart(player, 'drive', { settlement: 'village' }).why, /city/);
  const r = buyPart(player, 'drive', { settlement: 'city' });
  assert.equal(r.ok, true);
  assert.equal(player.gold, 0);
  assert.equal(yard(player).built.drive, 1);
  assert.ok(MARKET.parts.drive > 5000, 'if it does not hurt, nobody ever builds one');
});

test('§9.15 — you cannot leave the star without the coil, and it says so', () => {
  const player = freshPlayer();
  unlockVehicle(player, 'ship', 'hauler', { granted: true });
  const y = yard(player);
  y.built.tanks = 3;
  y.fuel = 100;
  assert.match(canLaunch(player, { leg: 'warp' }).why, /warp coil/);
  y.built.warp = 1;
  assert.equal(canLaunch(player, { leg: 'warp' }).ok, true);
});

test('the orbital yard is a stated goal with stated requirements', () => {
  const player = freshPlayer();
  assert.equal(stationGate(player).ok, false, 'you cannot start one without the ship that lifts the modules');
  assert.match(stationGate(player).why, new RegExp(VEHICLES.ship.kinds.hauler.name));

  unlockVehicle(player, 'ship', STATION.requires.ship, { granted: true });
  const y = yard(player);
  y.pad = true;
  y.built.tanks = 3;
  assert.equal(stationGate(player).ok, true);

  const bag = gathered();
  assert.ok(stock(bag, STATION.modules[0].cost), 'could not refine the first module');
  const dry = buildStationModule(player, STATION.modules[0].id, bag, { stations: ALL_STATIONS });
  assert.equal(dry.ok, false, 'a module has to be LIFTED, so it costs fuel');
  assert.match(dry.why, /Lift Fuel/);
  const before = bag[Object.keys(STATION.modules[0].cost)[0]];

  y.fuel = STATION.fuelPerModule * STATION.modules.length;
  for (const mod of STATION.modules) {
    // one module at a time: refining a composite plate eats the steel the last one topped up, which
    // is the same thing that happens on the ground
    assert.ok(stock(bag, mod.cost), `could not refine ${mod.name}`);
    const out = buildStationModule(player, mod.id, bag, { stations: ALL_STATIONS });
    assert.equal(out.ok, true, `${mod.name} — ${out.why}`);
  }
  assert.ok(bag[Object.keys(STATION.modules[0].cost)[0]] < before,
    'a refused lift must not have eaten the materials, and a real one must');
  assert.equal(stationProgress(player).complete, true);
  assert.equal(y.fuel, 0, 'four lifts, four tanks of fuel');
});

// ------------------------------------------------------------------ saying what to do next

test('§9.16 — there is always one plain line saying what to build next', () => {
  const player = freshPlayer();
  const bag = gathered(200);
  const seen = new Set();
  const step = () => { const s = nextStep(player); seen.add(s.id); assert.ok(s.text.length > 10, 'a step has to say something'); return s; };

  assert.equal(step().id, 'pad');
  stock(bag, PAD.cost); buildPad(player, bag, {});
  assert.equal(step().id, 'hull');
  for (const id of PART_IDS) { stock(bag, partCost(player, id).cost); buildPart(player, id, bag, {}); }
  assert.equal(step().id, 'assemble');
  stock(bag, SHIPS.lander.assembly); assembleShip(player, 'lander', bag, {});
  assert.equal(step().id, 'fuel');
  stock(bag, { lift_fuel: 18 }); loadFuel(player, bag);
  assert.equal(step().id, 'warp');
  assert.ok(seen.size >= 5, 'the chain has to actually move along');
});

test('the journal page is plain language, and no number on it runs to four decimals', () => {
  const player = freshPlayer();
  yard(player).fuel = 8.333333;
  for (const line of describeGate(player)) {
    assert.ok(!hasLongDecimal(line), `"${line}" is not something a person reads`);
  }
});

// ------------------------------------------------------------------ the data itself

test('the data files this round added carry their _doc block', () => {
  for (const [name, data] of [['shipyard.json', shipyardData], ['vehicles.json', vehicleData]]) {
    assert.ok(data._doc && data._doc.length > 40, `data/${name} has no _doc worth reading`);
  }
});

test('nothing anywhere in the gate names a material that does not exist', () => {
  const costs = [
    PAD.cost,
    ...Object.values(SHIPS).map(s => s.assembly),
    ...Object.values(SUBSYSTEMS).flatMap(s => s.tiers.map(t => t.cost)),
    ...STATION.modules.map(m => m.cost),
    ...Object.values(vehicleData.vehicles).map(v => v.craft.cost),
    vehicleData.repair.cost,
  ];
  for (const cost of costs) {
    for (const id of Object.keys(cost)) assert.ok(MATERIALS[id], `"${id}" is not a material`);
  }
  assert.ok(MATERIALS[FUEL.id], 'the ship fuel itself has to be in the chain');
  assert.ok(MATERIALS[vehicleData.fuel.id], 'and so does the fuel an engine burns');
});

/**
 * R18 — FINISHING THE ORBITAL YARD GRANTS WHAT IT SAYS IT GRANTS.
 *
 * `data/shipyard.json`'s `station.grants` — refuel, returnPad, warpFitting — was read by NOTHING,
 * so the top of the tech tree paid out a sentence. §9's own history is why the refuel half matters:
 * `canLaunch` refused while `spendFlightFuel` spent and nothing ever put fuel in, which is why
 * `refuel()` had to be written at all — and then it still demanded you carry lift fuel up to the
 * very thing whose job is to make fuel available in orbit.
 */
test('R18 — a completed station grants its own list, and an unfinished one grants nothing', () => {
  const bare = { vehicles: { owned: {} } };
  const none = stationGrants(bare);
  assert.equal(none.complete, false, 'an empty yard reads as complete');
  for (const k of ['refuel', 'returnPad', 'warpFitting']) {
    assert.equal(none[k], false, `an unfinished station grants ${k}`);
  }

  // finish every module the data declares, however many there are
  // the yard lives at `player.vehicles.shipyard` — see `yard()`; the first version of this test
  // put it at `player.shipyard`, which `yard()` quietly replaced with an empty one
  const done = { vehicles: { owned: {}, shipyard: { station: {} } } };
  for (const m of STATION.modules) done.vehicles.shipyard.station[m.id] = true;
  const all = stationGrants(done);
  assert.equal(all.complete, true, 'every module is built and the station is not complete');
  for (const [k, v] of Object.entries(STATION.grants || {})) {
    if (typeof v !== 'boolean') continue;
    assert.equal(all[k], v, `the data grants ${k} and stationGrants does not`);
  }
  assert.ok(Object.keys(STATION.grants || {}).some(k => typeof STATION.grants[k] === 'boolean'),
    'station.grants has no flags left — re-aim this test');
});

test('R18 — a finished yard fills the tanks in orbit, with nothing in your bag', () => {
  const done = { vehicles: { owned: {}, shipyard: { station: {}, fuel: 0 } } };
  for (const m of STATION.modules) done.vehicles.shipyard.station[m.id] = true;
  const empty = { count: () => 0, spend: () => true };
  const out = refuel(done, empty);
  assert.equal(out.ok, true, `a completed station would not refuel: ${out.why}`);
  assert.ok(out.fuel > 0, 'the tanks are still empty');
  assert.equal(out.fromStation, true, 'the fuel came from somewhere other than the station');

  // …and without the station it still asks for fuel, as it always did
  const bare = { vehicles: { owned: {}, shipyard: { station: {}, fuel: 0 } } };
  const no = refuel(bare, empty);
  assert.equal(no.ok, false, 'an empty bag and no station still filled the tanks');
});

/**
 * R18 — AND THE OTHER TWO GRANTS REACH A REAL GATE.
 *
 * I first wrote these off as "the call sites do not exist", which is a reason to make them, not to
 * skip them. Both grants name exactly what they free, and both had an obvious gate already:
 *   `warpFitting` — "fit the warp coil without a refinery on the ground": every subsystem demands an
 *                   assembler within reach, which is the right rule right up until you own an
 *                   orbital yard, which is the point at which you are no longer building on a planet.
 *   `returnPad`   — "return to it from anywhere in the system": a launch wants the pad you built,
 *                   and the yard IS the pad you are returning to.
 */
test('R18 — a finished yard fits the warp coil with no assembler on the ground', () => {
  const done = { vehicles: { owned: {}, shipyard: { station: {} } } };
  for (const m of STATION.modules) done.vehicles.shipyard.station[m.id] = true;
  const rich = { count: () => 9999, missing: () => ({}), spend: () => true };

  // no station within reach at all
  const warp = canBuildPart(done, 'warp', rich, { stations: ['furnace'] });
  assert.ok(!/needs .*[Aa]ssembler/.test(warp.why || ''),
    'a completed orbital yard still demands a ground assembler for the warp coil');

  // …and the rule still holds for everything else, which is what makes it a grant and not a hole
  const hull = canBuildPart({ vehicles: { owned: {} } }, 'hull', rich, { stations: ['furnace'] });
  assert.match(hull.why || '', /[Aa]ssembler/, 'the ground rule is gone for every subsystem, not just the coil');
});

/**
 * NOTE THE `gate: GATE_VERSION` IN THESE FIXTURES. Without it `yard()` sees a yard with no version
 * stamp, treats it as a save written before the gate existed, and MIGRATES it — which hands out a
 * pad and starter fuel. The first version of this test read `ok: true` on empty tanks and looked
 * like a broken fuel check; the fuel check was fine and the fixture was a pre-gate save.
 */
test('R18 — a finished yard lets you lift off without a pad, but not without fuel', () => {
  const done = { vehicles: { owned: { ship: ['runner'] }, active: { ship: 'runner' }, shipyard: { gate: GATE_VERSION, station: {}, pad: false, fuel: 0 } } };
  for (const m of STATION.modules) done.vehicles.shipyard.station[m.id] = true;

  const dry = canLaunch(done, { leg: 'launch' });
  assert.equal(dry.ok, false, 'it launched with empty tanks');
  assert.ok(!/pad/i.test(dry.why || ''),
    'a completed station still refuses for want of a ground pad — that is what returnPad buys off');

  // with fuel in the tanks it goes, pad or no pad
  done.vehicles.shipyard.fuel = 9999;
  assert.equal(canLaunch(done, { leg: 'launch' }).ok, true, `a fuelled ship would not lift: ${canLaunch(done).why}`);

  // and without the station, no pad is still no launch
  const bare = { vehicles: { owned: { ship: ['runner'] }, active: { ship: 'runner' }, shipyard: { gate: GATE_VERSION, station: {}, pad: false, fuel: 9999 } } };
  const no = canLaunch(bare, { leg: 'launch' });
  assert.equal(no.ok, false, 'no pad and no station still launched');
  assert.match(no.why || '', /pad/i);
});
