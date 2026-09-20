// node --test prototypes/farhold/tests/ground-vehicles.test.js
//
//   "I definitely want the ability to craft a motorcycle and a car and eventually a truck."
//
// The trap with a vehicle ladder is that the top rung quietly deletes everything under it — and the
// horse with it, which would be a strange way to repay the animal that has carried the game this
// far. So the tests that matter here are not "does a truck exist", they are:
//
//   · the ladder costs more as it climbs (or a rung is free)
//   · NOTHING is strictly dominated, the horse included (or a rung is a trap)
//   · every craft can actually be made out of things that come out of the ground
//   · each vehicle beats the horse at something and loses to it at something
//
// The last one is the design decision in one assertion: a vehicle must not be a faster horse.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  GROUND_VEHICLES, HORSE_ROW, GROUND_FUEL, LADDER, MATERIALS, STATIONS, isGathered, recipeFor,
  costValue, rawInputs, canBuild, buildVehicle, refuel, repair, drive, speedOn,
  driveFor, selectVehicle, ownedVehicles, rigState, rangeLeft, describeVehicle,
  dominated, comparisonRows, modelFor, carryBonus, seats,
} from '../js/vehicles.js';
import { hasLongDecimal } from '../../../shared/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const balance = JSON.parse(readFileSync(join(here, '../data/balance.json'), 'utf8'));

/** Every machine in the game, for the tests that are not about machines. */
const ALL_STATIONS = Object.keys(STATIONS);
/** Enough of everything, for the tests that are not about materials. */
const rich = () => Object.fromEntries(Object.keys(MATERIALS).map(id => [id, 999]));

// ------------------------------------------------------------------ the ladder

test('the ladder is motorcycle, car, truck, and it climbs', () => {
  assert.deepEqual(LADDER, ['motorcycle', 'car', 'truck']);
  let last = 0;
  for (const key of LADDER) {
    const cost = costValue(GROUND_VEHICLES[key].craft.cost);
    assert.ok(cost > last,
      `${GROUND_VEHICLES[key].name} costs ${cost} and the rung below it costs ${last} — a ladder that ` +
      'does not climb is a list');
    last = cost;
  }
});

test('the rungs above the first need a workshop the rung below did not', () => {
  // the truck should not be buildable the moment the motorcycle is, or the middle of the game has
  // no shape to it
  let last = 0;
  for (const key of LADDER) {
    const n = GROUND_VEHICLES[key].craft.stations.length;
    assert.ok(n >= last, `${key} asks for fewer benches than the rung below it`);
    for (const s of GROUND_VEHICLES[key].craft.stations) {
      assert.ok(STATIONS[s], `${key} wants a "${s}", which is not a machine in data/refining.json`);
    }
    last = n;
  }
  assert.ok(GROUND_VEHICLES.truck.craft.stations.length > GROUND_VEHICLES.motorcycle.craft.stations.length,
    'a truck should take more industry than a motorcycle');
});

test('nothing is strictly dominated — not one vehicle, and not the horse', () => {
  assert.deepEqual(dominated(), [],
    'one of these rows is worse than another row at everything, which makes it a trap; look at the ' +
    'comparison in js/vehicles.js and give it something of its own');
});

test('each machine beats the horse at something AND loses to it at something', () => {
  const horse = comparisonRows().find(r => r.key === 'horse');
  for (const row of comparisonRows().filter(r => r.key !== 'horse')) {
    const beats = ['speed', 'carry', 'seats', 'ford'].filter(s => row[s] > horse[s]);
    const loses = ['maxSlope', 'thrift'].filter(s => row[s] < horse[s]);
    assert.ok(beats.length, `${row.name} is not better than a horse at anything, so why build it`);
    assert.ok(loses.length, `${row.name} is better than a horse at everything — it is a faster horse`);
  }
  assert.equal(horse.perKm, 0, 'the horse must never want fuel; that is its whole argument');
});

test('the horse row is the same horse the rest of the game rides', () => {
  const b = balance.player || {};
  const pace = (b.moveSpeed ?? 5.4) * (b.mountSpeed ?? 2.1);
  assert.ok(Math.abs(HORSE_ROW.speed - pace) < 0.01,
    `the yardstick in data/vehicles.json says ${HORSE_ROW.speed} and balance.json works out at ${pace}`);
});

test('the three of them are genuinely different things, not three numbers', () => {
  const { motorcycle, car, truck } = GROUND_VEHICLES;
  assert.ok(motorcycle.speed > car.speed && car.speed > truck.speed, 'speed falls as the ladder climbs');
  assert.ok(truck.carry > car.carry && car.carry > motorcycle.carry, 'and load rises');
  assert.ok(car.seats > truck.seats && truck.seats > motorcycle.seats, 'the car is the one that takes people');
  assert.ok(truck.ford > car.ford && truck.ford > motorcycle.ford, 'only the truck takes water seriously');
  assert.ok(truck.haul > 0 && car.haul === 0 && motorcycle.haul === 0,
    'the truck is the only thing that can move a ship subsystem — that is its tie into js/shipyard.js');
  assert.ok(truck.perKm > car.perKm && car.perKm > motorcycle.perKm, 'and it pays for all of it at the pump');
});

// ------------------------------------------------------------------ can it be made at all

test('every craft is made of things that come out of the ground', () => {
  for (const spec of Object.values(GROUND_VEHICLES)) {
    const raw = rawInputs(spec.craft.cost);
    assert.ok(raw, `${spec.name} needs something nothing produces — check the ids against data/resources.json`);
    for (const [id, n] of Object.entries(raw)) {
      assert.ok(isGathered(id), `${spec.name} bottoms out at "${id}", which nobody gathers`);
      assert.ok(n > 0 && n < 900, `${spec.name} wants ${n} ${id}; that is a second job, not a craft`);
    }
  }
});

/**
 * ONE MATERIAL CHAIN, and it is the refining layer's.
 *
 * This file used to check a material table of this module's own. The refining layer landed
 * (data/resources.json + data/refining.json, driven by js/refine.js) while these vehicles were
 * being written, and two chains would have meant two kinds of steel, so the table went and these
 * costs are spelled the way resources.json spells them. What is checked now is that every id a
 * vehicle asks for is real, and that the route down to the ground actually exists.
 */
test('every id a vehicle asks for is a material the refining chain knows', () => {
  for (const spec of Object.values(GROUND_VEHICLES)) {
    for (const id of Object.keys(spec.craft.cost)) {
      assert.ok(MATERIALS[id], `${spec.name} wants "${id}", which is not in data/resources.json`);
      assert.ok(isGathered(id) || recipeFor(id), `nothing makes "${id}" and nobody digs it up`);
    }
  }
  assert.ok(MATERIALS[GROUND_FUEL.id], 'the fuel an engine burns has to be a real material');
});

// ------------------------------------------------------------------ building and driving one

test('you cannot build what you have no bench for, and it says which bench', () => {
  const player = {};
  const r = canBuild(player, 'truck', rich(), { stations: ['workbench'] });
  assert.equal(r.ok, false);
  assert.match(r.why, /Assembler/);
});

test('building one takes the materials once and puts you on it', () => {
  const player = {};
  const bag = rich();
  const before = bag.steel_ingot;
  const r = buildVehicle(player, 'motorcycle', bag, { stations: ALL_STATIONS });
  assert.equal(r.ok, true);
  assert.equal(bag.steel_ingot, before - GROUND_VEHICLES.motorcycle.craft.cost.steel_ingot, 'the steel went somewhere');
  assert.deepEqual(ownedVehicles(player), ['motorcycle']);
  assert.equal(driveFor(player).key, 'motorcycle', 'what you just built is what you are on');

  const again = buildVehicle(player, 'motorcycle', bag, { stations: ALL_STATIONS });
  assert.equal(again.ok, false);
  assert.match(again.why, /already built/);
});

test('short of materials, nothing is taken and the shortfall is named in words', () => {
  const player = {};
  const bag = { steel_ingot: 1 };
  const r = buildVehicle(player, 'car', bag, { stations: ALL_STATIONS });
  assert.equal(r.ok, false);
  assert.match(r.why, /Machine Part/, 'the refusal names the material, not the id');
  assert.equal(bag.steel_ingot, 1, 'a refused build costs nothing');
  assert.deepEqual(ownedVehicles(player), []);
});

test('it comes out of the shed dry, and a dry engine stops rather than coasting', () => {
  const player = {};
  const bag = rich();
  buildVehicle(player, 'car', bag, { stations: ALL_STATIONS });
  assert.equal(rigState(player, 'car').fuel, 0, 'no free petrol');

  const stopped = drive(player, 100, bag);
  assert.equal(stopped.moving, false);
  assert.match(stopped.why, /Charcoal/);

  const filled = refuel(player, 'car', bag, 10);
  assert.equal(filled.ok, true);
  assert.equal(filled.added, 10);
  const rolling = drive(player, 1000, bag, { surface: 'road' });
  assert.equal(rolling.moving, true);
  assert.ok(Math.abs(rolling.fuelUsed - GROUND_VEHICLES.car.perKm) < 1e-6, 'a kilometre costs a kilometre');
  assert.ok(rolling.speed > GROUND_VEHICLES.car.speed, 'a road is faster than open ground');
});

test('a full tank is a stated range, and the gauge agrees with the arithmetic', () => {
  const player = {};
  const bag = rich();
  buildVehicle(player, 'truck', bag, { stations: ALL_STATIONS });
  refuel(player, 'truck', bag);
  const spec = GROUND_VEHICLES.truck;
  assert.equal(rigState(player, 'truck').fuel, spec.tank, 'a full tank is a full tank');
  assert.ok(Math.abs(rangeLeft(player) - (spec.tank / spec.perKm) * 1000) < 1,
    'the range the HUD would show has to be the range you actually get');
});

test('a slope the wheels will not take is refused out loud, and the horse walks up it', () => {
  const player = {};
  const bag = rich();
  buildVehicle(player, 'motorcycle', bag, { stations: ALL_STATIONS });
  refuel(player, 'motorcycle', bag);
  const steep = HORSE_ROW.maxSlope - 0.05;          // ground a horse takes in its stride
  assert.ok(steep > GROUND_VEHICLES.motorcycle.maxSlope, 'the fixture has to actually be too steep');
  const out = drive(player, 50, bag, { slope: steep });
  assert.equal(out.moving, false);
  assert.match(out.why, /slope/);
  assert.ok(speedOn(HORSE_ROW, { slope: steep }) > 0, 'and the horse is fine, which is the point');
});

test('wear is gentle, and a repair is an evening rather than a chore', () => {
  const player = {};
  const bag = rich();
  buildVehicle(player, 'car', bag, { stations: ALL_STATIONS });
  refuel(player, 'car', bag);
  drive(player, 100_000, bag);                       // a hundred kilometres
  const rig = rigState(player, 'car');
  assert.ok(rig.condition < 100, 'a hundred kilometres should show');
  assert.ok(rig.condition > 0, 'but a hundred kilometres must not destroy it');
  const before = rig.condition;
  assert.equal(repair(player, 'car', bag).ok, true);
  assert.ok(rigState(player, 'car').condition > before);
});

test('carrying and seating read off whatever you are on, and off nothing when you are walking', () => {
  const player = {};
  const bag = rich();
  assert.equal(carryBonus(player), 0);
  assert.equal(seats(player), 1);
  buildVehicle(player, 'car', bag, { stations: ALL_STATIONS });
  assert.equal(carryBonus(player), GROUND_VEHICLES.car.carry);
  assert.equal(seats(player), 4, 'the car is how your companions come along');
  selectVehicle(player, null);
  assert.equal(driveFor(player), null, 'and getting off means getting off');
  assert.equal(carryBonus(player), 0);
});

// ------------------------------------------------------------------ the body and the card

test('every vehicle has a body to draw, and it is built facing +z like the boat', () => {
  const src = readFileSync(join(here, '../../../avatar-3d/js/ground-vehicles.js'), 'utf8');
  for (const key of LADDER) {
    assert.ok(modelFor(key), `${key} has no model id`);
    assert.match(src, new RegExp(`${modelFor(key)}`), `avatar-3d/js/ground-vehicles.js has no ${key}`);
  }
  assert.match(src, /facing \+z/, 'the +z convention is the one thing that must stay written down');
});

test('the card is plain language and no number on it has four decimals', () => {
  for (const key of LADDER) {
    const card = describeVehicle(key);
    assert.ok(card.gives && card.costs, `${key} has to say what it gives up`);
    for (const line of [...card.lines, card.cost]) {
      assert.ok(!hasLongDecimal(line), `"${line}" has a number nobody wants to read`);
    }
    assert.match(card.cost, /[A-Z]/, 'a cost is written with material names, not ids');
  }
  assert.match(describeVehicle('motorcycle').lines[0], /horse does/, 'the card compares itself to the horse');
});

test('the fuel every engine burns is cheap, early, and not the ship fuel', () => {
  const fuel = MATERIALS[GROUND_FUEL.id];
  assert.ok(fuel, 'the engine fuel has to exist in the chain');
  assert.notEqual(GROUND_FUEL.id, 'lift_fuel',
    'a motorcycle must not wait on a fuel synthesiser — that structure is the end of the game');
  const made = recipeFor(GROUND_FUEL.id);
  assert.ok(made, 'and it has to be makeable');
  assert.ok(STATIONS[made.machine].tier <= 1,
    `it is made at a ${STATIONS[made.machine].name}, which is too far up the chain for a first engine`);
});
