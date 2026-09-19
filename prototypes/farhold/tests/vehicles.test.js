// node --test prototypes/farhold/tests/vehicles.test.js
//
// "Where shops sell boats and ship, they should also sell torches and mounts. 3 of each should be
// implemented. Boats should automatically equip when you start swimming and increase water travel
// movement speed."
//
// Three of each was already true in the data and false on the shelf: `stockFor` guaranteed the
// cheapest mount and the cheapest light and then picked ONE of the remaining better ones at random,
// so the Dray Elk and the Wisp Lamp could go unseen for a long time. These tests pin the rack open.
//
// The boat side is split: the numbers and the ownership rules are checked here, and the actual
// "walk into a lake and the boat appears under you" is a page test in tests/vehicles.spec.js,
// because js/player.js needs Three.js and a real terrain.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  GEAR_BASES, SHOP_GEAR, VEHICLES, VEHICLE_SLOTS,
  createGearShop, categoryOf, startingVehicles, vehicleFor, unlockVehicle, selectVehicle,
} from '../js/gear.js';

const here = dirname(fileURLToPath(import.meta.url));
const balance = JSON.parse(readFileSync(join(here, '../data/balance.json'), 'utf8'));

/** A seeded generator, so a failure is reproducible rather than "it happened once". */
function rngFor(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const SEEDS = [1, 2, 3, 5, 8, 13, 42, 77, 99, 256, 777, 1337, 20260918];
const shop = createGearShop({ rpg: null });

// ------------------------------------------------------------------ the rack is always complete

test('every shop carries all three mounts and all three lights, on every seed', () => {
  assert.equal(SHOP_GEAR.mounts.length, 3, 'three mounts');
  assert.equal(SHOP_GEAR.lights.length, 3, 'three lights');

  for (const seed of SEEDS) {
    for (const level of [1, 7, 24, 50]) {
      const stock = shop.stockFor({ role: 'merchant' }, level, rngFor(seed + level));
      const keys = stock.map(i => i.baseKey);
      for (const key of [...SHOP_GEAR.mounts, ...SHOP_GEAR.lights]) {
        assert.ok(keys.includes(key),
          `seed ${seed} level ${level}: the shelf is missing ${key} (${GEAR_BASES[key].name})`);
      }
    }
  }
});

test('the cheapest mount and the cheapest light are always plain, so their price is the base price', () => {
  for (const seed of SEEDS) {
    const stock = shop.stockFor({ role: 'merchant' }, 10, rngFor(seed));
    for (const key of [SHOP_GEAR.mounts[0], SHOP_GEAR.lights[0]]) {
      const item = stock.find(i => i.baseKey === key);
      assert.equal(item.rarity, 'normal', `${key} should never roll a rarity on the cheap shelf`);
      assert.equal(item.basePrice, GEAR_BASES[key].price);
    }
  }
});

test('a light and a mount can still be an interesting find, so the dearer two do roll', () => {
  // over enough seeds the two dearer ones must produce something better than plain at least once,
  // otherwise the "even in shops" part of the ask has quietly regressed to a fixed price list
  const rolled = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    for (const item of shop.stockFor({ role: 'merchant' }, 20, rngFor(seed))) {
      if (item.rarity !== 'normal') rolled.add(item.baseKey);
    }
  }
  for (const key of [...SHOP_GEAR.mounts.slice(1), ...SHOP_GEAR.lights.slice(1)]) {
    assert.ok(rolled.has(key), `${key} never rolled above plain in 200 shelves`);
  }
});

test('a torch is cheap enough that a new character is never left in the dark', () => {
  assert.ok(GEAR_BASES.torch.price <= 25, 'the starting torch has to be affordable at level 1');
});

test('mounts and lights file under Other, next to the boats and ships', () => {
  const stock = shop.stockFor({ role: 'merchant' }, 5, rngFor(4));
  for (const item of stock) assert.equal(categoryOf(item), 'other');
});

// ------------------------------------------------------------------ three boats, three ships

test('there are three boats and three ships, and one of each is free to start with', () => {
  assert.deepEqual(VEHICLE_SLOTS, ['boat', 'ship']);
  for (const slot of VEHICLE_SLOTS) {
    const kinds = Object.values(VEHICLES[slot].kinds);
    assert.equal(kinds.length, 3, `three ${slot}s`);
    const free = kinds.filter(k => k.price === 0);
    assert.equal(free.length, 1, `exactly one free ${slot}`);
    assert.equal(free[0].key, VEHICLES[slot].starter);
  }
});

test('the shop offers the two you have to pay for, and never the one you were given', () => {
  const rows = shop.vehiclesFor();
  assert.equal(rows.length, 4, 'two boats and two ships are for sale');
  for (const row of rows) assert.ok(row.price > 0, `${row.key} is on the shelf at no price`);
  const keys = rows.map(r => r.key);
  assert.ok(!keys.includes('raft') && !keys.includes('lander'), 'the starters are not sold');
});

// ------------------------------------------------------------------ the boat is worth having

test('every boat is faster than swimming, and each one is faster than the last', () => {
  const swim = balance.player?.swimSpeed ?? 2.7;
  const kinds = Object.values(VEHICLES.boat.kinds);
  for (const kind of kinds) {
    assert.ok(kind.speed > swim,
      `${kind.name} does ${kind.speed} m/s against a ${swim} m/s swim — a boat that is slower than ` +
      'swimming is a boat nobody boards');
  }
  // the ladder has to climb with the price, or the dear ones are a trap
  const byPrice = [...kinds].sort((a, b) => a.price - b.price);
  for (let i = 1; i < byPrice.length; i++) {
    assert.ok(byPrice[i].speed > byPrice[i - 1].speed,
      `${byPrice[i].name} costs more than ${byPrice[i - 1].name} and is not faster`);
  }
});

/**
 * THE YARDSTICK MOVED, and it moved because the user moved it.
 *
 * This used to assert that the best boat is slower than a sprint on dry land — "or water stops
 * being a choice". The ask was then: "make it so boats, at least the starting raft, goes faster -
 * approx the same speed as a horse", and a horse at moveSpeed x mountSpeed (11.34 m/s) is already
 * exactly a sprint on foot, because runMultiplier and mountSpeed happen to be the same 2.1. So the
 * old rule and the new one cannot both hold: the raft alone would fail it.
 *
 * The rule that survives is the one that was actually being protected — riding must still be the
 * fastest way to travel — so the ceiling is a MOUNTED sprint, not a sprint on foot.
 */
test('the raft is horse pace, and no boat beats a gallop', () => {
  const b = balance.player || {};
  const walk = b.moveSpeed ?? 5.4;
  const horse = walk * (b.mountSpeed ?? 2.1);
  const gallop = horse * (b.runMultiplier ?? 2.1);
  const raft = VEHICLES.boat.kinds[VEHICLES.boat.starter];
  const best = Math.max(...Object.values(VEHICLES.boat.kinds).map(k => k.speed));

  assert.ok(Math.abs(raft.speed - horse) / horse < 0.1,
    `the starting raft does ${raft.speed} m/s against a horse's ${horse.toFixed(2)} — "approx the ` +
    'same speed as a horse" means within about a tenth');
  assert.ok(best > walk, 'the best boat should beat a walk');
  assert.ok(best < gallop,
    `the best boat does ${best} m/s against a ${gallop.toFixed(2)} m/s gallop — a boat that outruns ` +
    'a mount makes the mount pointless');
});

// ------------------------------------------------------------------ owning one

test('a new character owns the raft and the lander, and nothing else', () => {
  const v = startingVehicles();
  assert.deepEqual(v.owned.boat, ['raft']);
  assert.deepEqual(v.owned.ship, ['lander']);
  assert.equal(v.active.boat, 'raft');
});

test('buying a boat takes the gold once, and you cannot buy it twice', () => {
  const player = { gold: 5000, vehicles: startingVehicles() };
  const first = unlockVehicle(player, 'boat', 'skiff');
  assert.equal(first.ok, true);
  assert.equal(player.gold, 5000 - VEHICLES.boat.kinds.skiff.price);
  assert.equal(player.vehicles.active.boat, 'skiff', 'what you just bought is what you want');

  const again = unlockVehicle(player, 'boat', 'skiff');
  assert.equal(again.ok, false);
  assert.match(again.why, /already own/);
  assert.equal(player.gold, 5000 - VEHICLES.boat.kinds.skiff.price, 'a refused buy costs nothing');
});

test('a boat you cannot afford says the price and the purse, and takes nothing', () => {
  const player = { gold: 10, vehicles: startingVehicles() };
  const r = unlockVehicle(player, 'boat', 'cutter');
  assert.equal(r.ok, false);
  assert.match(r.why, /1400 gold/);
  assert.match(r.why, /you have 10/);
  assert.equal(player.gold, 10);
});

test('you can only select a boat you actually own', () => {
  const player = { gold: 0, vehicles: startingVehicles() };
  assert.equal(selectVehicle(player, 'boat', 'cutter'), false, 'not owned, not selectable');
  assert.equal(player.vehicles.active.boat, 'raft');
  assert.equal(selectVehicle(player, 'boat', 'raft'), true);
});

test('vehicleFor falls back to the starter rather than returning nothing', () => {
  assert.equal(vehicleFor({}, 'boat').key, 'raft', 'a player with no vehicles block still has a raft');
  assert.equal(vehicleFor({ vehicles: { active: { boat: 'nonsense' }, owned: {} } }, 'boat').key, 'raft');
  assert.equal(vehicleFor({}, 'submarine'), null);
});

// ------------------------------------------------------------------ the wiring player.js expects

test('player.js boards on entering deep water and steps off on leaving', () => {
  // js/player.js needs Three.js and a terrain, so this reads the controller's source rather than
  // running it — enough to catch somebody deleting the hook. The behaviour itself is a page test.
  const src = readFileSync(join(here, '../js/player.js'), 'utf8');
  assert.match(src, /boating/, 'the controller tracks whether you are afloat');
  assert.match(src, /out\.boarded/, 'entering the water announces the boat');
  assert.match(src, /out\.leftBoat/, 'leaving the water puts it away');
  assert.match(src, /self\.boating\?\.speed/, 'the boat, not the flat swim speed, drives movement');
});
