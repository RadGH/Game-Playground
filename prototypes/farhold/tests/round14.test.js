// node --test prototypes/farhold/tests/round14.test.js
//
// Round 14: no claim stones, outposts, goods that take time to arrive, a base that runs while you
// are off the planet, and roads that are roads instead of rows of tiles.
//
// The one test in here that matters more than the rest is **"every piece in the catalogue is
// reachable from a bare-handed start"**. It is the test that would have caught the bug the user
// actually reported — *"I can't build a claim stone because it requires 2 iron ingots. I can't
// refine iron without a furnace. I can't build a furnace without a claim stone."* — and when it was
// first written it found two MORE of exactly the same shape that nobody had noticed:
//
//   * a loom cost four rope, and the only thing in the game that makes rope is a loom;
//   * an assembler cost ten machine parts, and the only thing that makes a machine part is an
//     assembler — which took the smelter, the crusher, the washer, the drill, the wind turbine and
//     twelve other pieces down with it.
//
// Three self-gates, all of them invisible to every other test in the suite, because each individual
// file was internally consistent. A cost you cannot obtain is not a price, it is a wall.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createBuildPlan, makeBag, realCost } from '../js/buildplan.js';
import { createTerraform } from '../js/terraform.js';
import { createStoreNetwork } from '../js/stores.js';
import { createWorks } from '../js/refine.js';
import { createLogistics, createAwayClock, TRAVEL_DEFAULTS } from '../js/logistics.js';
import { createRoadBook, planLane, laneRibbon, laneGap, levelLane, slabGroundLevel, LANE_SPACING } from '../js/roadplan.js';
import { groupOutposts, outpostAt, LINK_GAP } from '../js/outposts.js';
import { streetLanes } from '../js/town-plan.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, f), 'utf8'));
const STR = read('../data/structures.json');
const RES = read('../data/resources.json');
const REF = read('../data/refining.json');
const POW = read('../data/power.json');

/** Rolling ground with nothing flat on it, the same stand-in js/building.test.js uses. */
function fakeTerrain({ amplitude = 6 } = {}) {
  const natural = (x, z) => Math.sin(x * 0.11) * amplitude + Math.cos(z * 0.09) * amplitude * 0.7;
  const t = { heightAt: natural, waterAt: () => null, underwater: () => false };
  t.slopeAt = (x, z, step = 3) => {
    const l = t.heightAt(x - step, z), r = t.heightAt(x + step, z);
    const u = t.heightAt(x, z - step), d = t.heightAt(x, z + step);
    return Math.hypot(r - l, d - u) / (2 * step);
  };
  return t;
}

// ==================================================================== the reachability walk

/**
 * EVERYTHING YOU CAN GET OUT OF THE GROUND WITH A TOOL OF THIS TIER.
 *
 * `hardness` on a node kind is the tool tier it needs (data/resources.json `tools`): bare hands and
 * a stone or iron weapon are tier 1, a steel weapon is tier 2, a built Drill is tier 3. That ladder
 * is part of the gating and has to be walked too — crystal is hardness 2, so a lens is behind steel,
 * and vent gas is hardness 3, so lift fuel is behind a drill.
 */
function gatherableAt(tier) {
  const out = new Set();
  for (const kind of Object.values(RES.nodeKinds)) {
    if ((kind.hardness || 0) > tier) continue;
    if (kind.handMinable === false && tier < 3) continue;
    for (const res of Object.keys(kind.resources || {})) out.add(res);
  }
  return out;
}

/**
 * Walk the whole game forward from nothing in your hands and return what a player can ever hold.
 *
 * A fixed-point loop over three rules, which is all the gating there is:
 *   1. a machine can be built once everything in its catalogue cost is obtainable;
 *   2. a recipe can be run once its machine is built and its inputs are obtainable;
 *   3. a tool tier opens when the thing it is made of is obtainable, which opens harder nodes.
 *
 * Anything still outside the closure at the end is gated behind something that gates it.
 */
function reachable() {
  const byId = Object.fromEntries(STR.structures.map(s => [s.id, s]));
  const costOf = id => realCost(byId[id]?.cost || REF.machines[id]?.build || {});
  let tier = 1;
  const have = gatherableAt(tier);
  const machines = new Set();
  for (let pass = 0; pass < 60; pass++) {
    const before = have.size + machines.size + tier;
    for (const id of Object.keys(REF.machines)) {
      if (Object.keys(costOf(id)).every(k => have.has(k))) machines.add(id);
    }
    for (const r of REF.recipes) {
      if (!machines.has(r.machine)) continue;
      if (r.rareInput) continue;                       // a rare element is a place, not a gate
      if (!Object.keys(r.inputs || {}).every(k => have.has(k))) continue;
      for (const out of Object.keys(r.outputs || {})) have.add(out);
    }
    // a steel weapon is a tier-2 tool; a built Drill is a tier-3 one
    if (tier < 2 && have.has('steel_ingot')) { tier = 2; for (const r of gatherableAt(2)) have.add(r); }
    if (tier < 3 && Object.keys(costOf('drill')).every(k => have.has(k))) { tier = 3; for (const r of gatherableAt(3)) have.add(r); }
    if (have.size + machines.size + tier === before) break;
  }
  return { have, machines, tier };
}

test('THE ONE THAT MATTERS — nothing in the build catalogue is gated behind something that gates itself', () => {
  const { have, machines } = reachable();

  const stuckMachines = Object.keys(REF.machines).filter(m => !machines.has(m));
  assert.deepEqual(stuckMachines, [],
    `these machines can never be built: ${stuckMachines.join(', ')} — check what they cost against what makes it`);

  const stuck = [];
  for (const piece of STR.structures) {
    const missing = Object.keys(realCost(piece.cost || {})).filter(k => !have.has(k));
    if (missing.length) stuck.push(`${piece.id} needs ${missing.join(', ')}`);
  }
  assert.deepEqual(stuck, [],
    'a cost you cannot obtain is not a price, it is a wall:\n  ' + stuck.join('\n  '));
});

test('the three self-gates round 14 found stay fixed', () => {
  const byId = Object.fromEntries(STR.structures.map(s => [s.id, s]));
  // the claim stone: it cost iron, and iron was behind a furnace that needed a claim
  assert.ok(!('iron' in (byId.claim_stone.cost || {})), 'the marker stone is back to costing iron');
  // the loom: it cost the one thing only a loom makes
  assert.ok(!('rope' in (byId.loom.cost || {})), 'the loom costs rope again, and only a loom makes rope');
  // the assembler: every machine part in the game came out of an assembler
  const partMakers = REF.recipes.filter(r => 'machine_part' in (r.outputs || {}));
  assert.ok(partMakers.length >= 2, 'machine parts have one maker again — the assembler that costs ten of them');
  assert.ok(partMakers.some(r => r.machine !== 'assembler'),
    'every machine-part recipe runs on the assembler, which cannot be built without machine parts');
});

// ==================================================================== building anywhere

test('build mode asks about the world and never about paperwork', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const plan = createBuildPlan({ catalogue: STR, terrain });
  plan.place({ id: 'campfire', x: 0, z: 0 });

  // nine hundred metres out, with nothing between here and there
  const far = plan.check({ id: 'storage_crate', x: 900, z: -450 });
  assert.equal(far.ok, true, far.why);

  // …and the world rules are all still in force
  const wet = createBuildPlan({ catalogue: STR, terrain: { ...terrain, waterAt: () => true } });
  assert.match(wet.check({ id: 'campfire', x: 0, z: 0 }).why, /water/);

  const steep = createBuildPlan({ catalogue: STR, terrain: fakeTerrain({ amplitude: 40 }) });
  const why = steep.check({ id: 'furnace', x: 14, z: 0 }).why;
  assert.match(why, /steep|uneven/);
});

test('an outpost is worked out from the geometry, and a road you laid joins two of them', () => {
  const entries = [
    { id: 'b1', key: 'furnace', cat: 'refine', name: 'Furnace', x: 0, z: 0, w: 3, d: 2 },
    { id: 'b2', key: 'storage_crate', cat: 'store', name: 'Crate', x: 14, z: 4, w: 2, d: 2 },
    { id: 'b3', key: 'drill', cat: 'refine', name: 'Drill', x: 600, z: 0, w: 3, d: 3 },
    { id: 'b4', key: 'storage_crate', cat: 'store', name: 'Crate', x: 612, z: 6, w: 2, d: 2 },
  ];
  const posts = groupOutposts(entries);
  assert.equal(posts.length, 2, 'six hundred metres apart should be two places');
  assert.ok(posts.every(p => p.name), 'every outpost needs a name to be listed under');
  assert.equal(outpostAt(posts, 605, 2)?.members.length, 2);

  // a track between them says they are one holding
  const lane = planLane([[6, 1], [300, 0], [606, 2]], { terrain: fakeTerrain({ amplitude: 0 }), half: 2 });
  const joined = groupOutposts(entries, { lanes: [lane] });
  assert.equal(joined.length, 1, 'a road between two clusters should make them one outpost');
});

test('an outpost marker only lends its name — it permits nothing', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const plan = createBuildPlan({ catalogue: STR, terrain });
  plan.place({ id: 'drill', x: 500, z: 0 });                       // no marker anywhere
  assert.equal(plan.entries.length, 1);
  plan.place({ id: 'claim_stone', x: 504, z: 0, name: 'Coldreach' });
  const posts = plan.outposts();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].name, 'Coldreach');
  assert.equal(posts[0].named, true);
});

// ==================================================================== timed delivery

/**
 * A base with two store pools, `metres` apart, and nothing between them but flat ground.
 *
 * SILOS, not crates. A crate will only hold a quarter of its capacity in any one resource (the share
 * caps in js/stores.js, which exist so three drills cannot fill every box with ore) — so a test that
 * sends a hundred ore into a crate is really testing the share caps and not the delivery. A silo
 * takes one kind of bulk and nothing else, so the caps do not apply and the only thing left to
 * measure is the trip.
 */
function twoPools(metres = 400) {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'home', type: 'storage_silo', name: 'Home', x: 0, z: 0 });
  stores.add({ id: 'mine', type: 'storage_silo', name: 'Mine', x: metres, z: 0 });
  const pools = stores.pools();
  return {
    stores,
    home: pools.find(p => p.members.some(s => s.id === 'home')),
    mine: pools.find(p => p.members.some(s => s.id === 'mine')),
  };
}

test('inside one pool nothing moves; outside it, a load takes the time the walk takes', () => {
  const { stores } = twoPools(400);
  // two stores five metres apart are one pool, and one pool is free — js/stores.js's own rule
  stores.add({ id: 'home2', type: 'storage_crate', name: 'Home 2', x: 5, z: 0 });
  // …and somewhere twice as far out, to prove the wait doubles with the distance
  stores.add({ id: 'outer', type: 'storage_silo', name: 'Outer', x: 800, z: 0 });
  const ship = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });

  const near = ship.quote({ from: { x: 0, z: 0 }, to: { x: 4, z: 0 } });
  assert.equal(near.instant, true, 'two crates in one pool should not need a cart');

  const far = ship.quote({ from: { x: 0, z: 0 }, to: { x: 400, z: 0 } });
  assert.equal(far.instant, false);
  const cart = POW.haulers.hand_cart;
  const expect = 8 + 400 / cart.speed;                       // HANDLING + metres / speed
  assert.ok(Math.abs(far.seconds - expect) < 3, `a 400 m haul should be about ${expect | 0} s, not ${far.seconds}`);

  // and twice the distance is about twice the wait, which is the lesson the whole system teaches
  const twice = ship.quote({ from: { x: 0, z: 0 }, to: { x: 800, z: 0 } });
  const ratio = (twice.seconds - 8) / (far.seconds - 8);
  assert.ok(ratio > 1.9 && ratio < 2.1, `doubling the distance changed the wait by ${ratio.toFixed(2)}x`);
});

test('a road along the route cuts the wait substantially, in proportion to how much of it is paved', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const { stores } = twoPools(400);
  const roads = createRoadBook({ terrain });

  const bare = createLogistics({ stores, terrain, power: POW, materials: RES.materials })
    .quote({ from: { x: 0, z: 0 }, to: { x: 400, z: 0 } });

  roads.lay([[0, 0], [400, 0]], { half: 3 });
  const paved = createLogistics({ stores, terrain, roads, power: POW, materials: RES.materials })
    .quote({ from: { x: 0, z: 0 }, to: { x: 400, z: 0 } });

  assert.ok(paved.roadFraction > 0.9, `only ${Math.round(paved.roadFraction * 100)}% of the route read as road`);
  // the moving part is roadFactor times quicker; the loading is not, so the whole trip is a bit less
  const moving = (bare.seconds - 8) / (paved.seconds - 8);
  assert.ok(Math.abs(moving - TRAVEL_DEFAULTS.roadFactor) < 0.25, `a road only saved ${moving.toFixed(2)}x`);
  assert.ok(paved.seconds < bare.seconds * 0.55, 'laying a road should be worth the stone');

  // half a road is half the saving, so finishing one is worth doing
  const roads2 = createRoadBook({ terrain });
  roads2.lay([[0, 0], [200, 0]], { half: 3 });
  const half = createLogistics({ stores, terrain, roads: roads2, power: POW, materials: RES.materials })
    .quote({ from: { x: 0, z: 0 }, to: { x: 400, z: 0 } });
  assert.ok(half.seconds > paved.seconds && half.seconds < bare.seconds);
});

test('goods leave the source now and land at the far end when the clock runs out', () => {
  const { stores, home, mine } = twoPools(300);
  stores.put(mine, 'iron_ore', 60);
  const ship = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });

  const sent = ship.send({ from: mine, to: home, res: 'iron_ore', n: 60 });
  assert.equal(sent.ok, true, sent.why);
  // it is in neither pile while it is on the road, or a base could spend the same ore twice
  assert.equal(stores.count(mine, 'iron_ore'), 0);
  assert.equal(stores.count(home, 'iron_ore'), 0);
  assert.equal(ship.pending().length, 1);

  ship.tick(sent.seconds / 2);
  assert.equal(stores.count(home, 'iron_ore'), 0, 'it arrived halfway through the trip');

  ship.tick(sent.seconds / 2 + 0.1);
  assert.equal(stores.count(home, 'iron_ore'), 60);
  assert.equal(ship.pending().length, 0);
});

test('a load that arrives at a full store waits at the gate instead of vanishing', () => {
  const { stores, home, mine } = twoPools(200);
  stores.put(mine, 'iron_ore', 60);
  const ship = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });
  const sent = ship.send({ from: mine, to: home, res: 'iron_ore', n: 60 });

  // fill the destination to the brim with something else before the cart gets there
  stores.put(home, 'coal', 1200);
  ship.catchUp(sent.seconds + 60);
  assert.equal(ship.pending().length, 1, 'the load should still exist');
  assert.equal(ship.pending()[0].waiting, true);

  // make room and it goes in
  stores.take(home, 'coal', 1200);
  ship.tick(1);
  assert.equal(stores.count(home, 'iron_ore'), 60);
});

test('a standing order ships whatever the outpost piles up, one cart at a time', () => {
  const { stores, home, mine } = twoPools(250);
  const ship = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });
  assert.equal(ship.link(mine.id, home.id).ok, true);

  stores.put(mine, 'iron_ore', 80);
  ship.tick(0.1);
  assert.equal(ship.pending().length, 1, 'the standing order did not load anything');
  assert.equal(stores.count(mine, 'iron_ore'), 0);

  // …and it does not send a second cart down the same road while the first is on it
  stores.put(mine, 'iron_ore', 80);
  ship.tick(0.1);
  assert.equal(ship.pending().length, 1);

  ship.catchUp(600);
  assert.ok(stores.count(home, 'iron_ore') >= 80);
});

test('a delivery survives a save', () => {
  const { stores, home, mine } = twoPools(300);
  stores.put(mine, 'coal', 40);
  const ship = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });
  ship.send({ from: mine, to: home, res: 'coal', n: 40 });
  const json = JSON.parse(JSON.stringify(ship.toJSON()));

  const back = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });
  back.load(json);
  assert.equal(back.pending().length, 1);
  back.catchUp(600);
  assert.equal(stores.count(home, 'coal'), 40);
});

// ==================================================================== the away clock

/** A furnace with ore in front of it, so there is something to find on your return. */
function runningBase() {
  const stores = createStoreNetwork({ power: POW, materials: RES.materials });
  stores.add({ id: 'crate', type: 'storage_crate', name: 'Crate', x: 0, z: 0 });
  const pool = stores.pools()[0];
  stores.put(pool, 'iron_ore', 120);
  stores.put(pool, 'coal', 40);
  const works = createWorks({ refining: REF, resources: RES, stores });
  works.place({ id: 'f1', type: 'furnace', x: 1, z: 0 });
  works.queue('f1', 'smelt_iron', 0);            // keep going until told otherwise
  return { stores, pool, works };
}

test('the works keep running while you are off the planet, and say what they made', () => {
  const { stores, pool, works } = runningBase();
  let clock = 1_000_000;
  const away = createAwayClock({ works, stores, materials: RES.materials, now: () => clock });

  away.mark();
  clock += 30 * 60 * 1000;                        // half an hour on another world
  const back = away.resume();

  assert.ok(Math.abs(back.seconds - 1800) < 2, `it thought ${back.seconds} s had passed`);
  assert.equal(back.capped, false);
  assert.ok(stores.count(pool, 'iron_ingot') > 0, 'nothing was smelted while the player was away');
  assert.ok(back.made.some(m => m.res === 'iron_ingot'));
  assert.match(back.text, /You were away/);
});

test('the catch-up is capped, so a week away is not a mountain of iron', () => {
  const short = runningBase();
  let clockA = 0;
  const awayA = createAwayClock({ works: short.works, stores: short.stores, now: () => clockA });
  awayA.mark();
  clockA += 6 * 3600 * 1000;
  const six = awayA.resume();

  const long = runningBase();
  let clockB = 0;
  const awayB = createAwayClock({ works: long.works, stores: long.stores, now: () => clockB });
  awayB.mark();
  clockB += 7 * 24 * 3600 * 1000;                 // a week
  const week = awayB.resume();

  assert.equal(week.capped, true, 'a week away should be capped');
  assert.equal(Math.round(week.seconds), Math.round(six.seconds), 'the cap should stop the clock at six hours');
  assert.equal(
    short.stores.count(short.pool, 'iron_ingot'),
    long.stores.count(long.pool, 'iron_ingot'),
    'a week away produced more than six hours did, so the cap is not being applied',
  );
});

test('the away clock keeps its stamp across a save, and an unstamped clock does nothing', () => {
  let clock = 500_000;
  const away = createAwayClock({ now: () => clock });
  assert.equal(away.elapsed(), 0, 'a clock that was never marked cannot say time has passed');
  away.mark();
  const json = JSON.parse(JSON.stringify(away.toJSON()));

  clock += 120_000;
  const back = createAwayClock({ now: () => clock });
  back.load(json);
  assert.ok(Math.abs(back.elapsed() - 120) < 0.01, 'the stamp did not survive the save');
});

test('the carts keep rolling while you are away too', () => {
  const { stores, home, mine } = twoPools(600);
  stores.put(mine, 'iron_ore', 100);
  const ship = createLogistics({ stores, terrain: fakeTerrain({ amplitude: 0 }), power: POW, materials: RES.materials });
  ship.send({ from: mine, to: home, res: 'iron_ore', n: 100 });

  let clock = 0;
  const away = createAwayClock({ logistics: ship, stores, now: () => clock });
  away.mark();
  clock += 20 * 60 * 1000;
  const back = away.resume();
  assert.equal(stores.count(home, 'iron_ore'), 100);
  assert.equal(back.deliveries, 1);
});

// ==================================================================== roads

test('a laid road has no gaps in it', () => {
  const terrain = fakeTerrain({ amplitude: 9 });
  const lane = planLane([[0, 0], [60, 40], [160, 30], [220, -10]], { terrain, half: 2.5 });

  assert.ok(lane.points.length > 60, `only ${lane.points.length} points over 250-odd metres`);
  assert.ok(laneGap(lane) <= LANE_SPACING * 1.05,
    `the biggest step along the road is ${laneGap(lane).toFixed(2)} m and the spacing is ${LANE_SPACING} m`);

  /**
   * …AND THE TRIANGLES AGREE, which is the half a points test cannot see.
   *
   * The old road was a row of independent boxes: each quad had four vertices of its own, and two
   * neighbours only lined up if their heights happened to. A ribbon shares the previous quad's two
   * vertices by index, so a seam is not something that can happen — and that is what this checks,
   * by walking the index buffer and proving each quad reuses the one before it.
   */
  const geom = laneRibbon(lane, { lift: 0.06 });
  const quads = geom.index.length / 6;
  assert.equal(quads, lane.points.length - 1);
  for (let q = 1; q < quads; q++) {
    const prev = geom.index.slice((q - 1) * 6, q * 6);
    const here = geom.index.slice(q * 6, (q + 1) * 6);
    const shared = here.filter(i => prev.includes(i));
    assert.ok(shared.length >= 2, `section ${q} does not share an edge with the one before it`);
  }
});

test('the ground under a laid road comes up to meet it', () => {
  const terrain = fakeTerrain({ amplitude: 9 });
  const ground = createTerraform();
  ground.wrap(terrain);
  const roads = createRoadBook({ terrain, terraform: ground });
  const { lane } = roads.lay([[0, 0], [80, 20], [160, 0]], { half: 3 });

  let worst = 0;
  for (let i = 0; i < lane.points.length; i++) {
    const [x, z] = lane.points[i];
    worst = Math.max(worst, Math.abs(terrain.heightAt(x, z) - lane.surface[i]));
  }
  assert.ok(worst < 0.5, `the road surface sits up to ${worst.toFixed(2)} m off the ground it is drawn on`);
});

test('a corner is rounded in the plan, so two roads meeting at an angle have no wedge between them', () => {
  const flat = fakeTerrain({ amplitude: 0 });
  const lane = planLane([[0, 0], [100, 0], [100, 100]], { terrain: flat, half: 2 });
  // the sharpest turn between consecutive points, in degrees
  let sharpest = 0;
  for (let i = 1; i + 1 < lane.points.length; i++) {
    const a = Math.atan2(lane.points[i][1] - lane.points[i - 1][1], lane.points[i][0] - lane.points[i - 1][0]);
    const b = Math.atan2(lane.points[i + 1][1] - lane.points[i][1], lane.points[i + 1][0] - lane.points[i][0]);
    let turn = Math.abs(b - a);
    if (turn > Math.PI) turn = Math.PI * 2 - turn;
    sharpest = Math.max(sharpest, turn);
  }
  assert.ok(sharpest < Math.PI / 2 - 0.05,
    `the road still turns ${(sharpest * 180 / Math.PI).toFixed(0)}° in one step — the corner was not rounded`);
});

test('a road survives a save, and the book can still say what is on one', () => {
  const terrain = fakeTerrain({ amplitude: 4 });
  const roads = createRoadBook({ terrain });
  roads.lay([[0, 0], [120, 0]], { half: 3, key: 'road_gravel', name: 'Gravel Road' });
  assert.equal(roads.onRoad(60, 0), true);
  assert.equal(roads.onRoad(60, 40), false);

  const json = JSON.parse(JSON.stringify(roads.toJSON()));
  const back = createRoadBook({ terrain, saved: json });
  assert.equal(back.count, 1);
  assert.equal(back.onRoad(60, 0), true);
  assert.ok(Math.abs(back.metres - roads.metres) < 0.01);
  // a new road after a load does not take a name that is already in use
  const next = back.lay([[0, 40], [40, 40]], { half: 2 });
  assert.notEqual(next.lane.id, 'ln1');
});

// ==================================================================== tiles and slabs

test("a tile levels under itself, so its corners meet the ground it sits on", () => {
  const terrain = fakeTerrain({ amplitude: 9 });
  const ground = createTerraform();
  ground.wrap(terrain);
  const plan = createBuildPlan({ catalogue: STR, terrain, terraform: ground, store: makeBag({ cut_stone: 400, log: 400, stone: 400 }) });

  // a paving square on a bank — the thing that used to poke a corner through the hill
  const res = plan.place({ id: 'paving', x: 17, z: 11, rot: 0.4 });
  assert.equal(res.ok, true, res.why);

  const spot = { x: 17, z: 11, w: 2, d: 2, rot: 0.4 };
  const c = Math.cos(0.4), s = Math.sin(0.4);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    .map(([lx, lz]) => [spot.x + lx * c - lz * s, spot.z + lx * s + lz * c]);
  for (const [cx, cz] of corners) {
    const off = Math.abs(terrain.heightAt(cx, cz) - res.entry.y);
    assert.ok(off < 0.12, `a corner of the paving sits ${off.toFixed(2)} m off the ground under it`);
  }
});

test('levelling a slab uses the average height under it, not the height at its middle', () => {
  // ground that rises steadily across the footprint: the middle and the mean agree here…
  const ramp = { heightAt: (x) => x * 0.2 };
  const even = slabGroundLevel({ x: 10, z: 0, w: 8, d: 4, rot: 0 }, ramp);
  assert.ok(Math.abs(even.h - 2) < 1e-9);
  assert.ok(Math.abs(even.fall - 1.6) < 1e-9, 'the fall across the footprint is what sizes the skirt');

  // …and on ground that peaks in the middle they do not, which is the case the old code got wrong
  const ridge = { heightAt: (x) => 4 - Math.abs(x - 10) * 0.4 };
  const peak = slabGroundLevel({ x: 10, z: 0, w: 10, d: 4, rot: 0 }, ridge);
  assert.ok(peak.h < 4 - 1e-6, 'a slab across a ridge levelled to the top of the ridge, leaving its ends in the air');
  assert.ok(peak.h > 2, 'and it should not have levelled to the bottom either');
});

test('levelLane paints a brush per straight stretch, not one per metre', () => {
  const ground = createTerraform();
  const lane = planLane([[0, 0], [300, 0]], { terrain: fakeTerrain({ amplitude: 5 }), half: 3 });
  const res = levelLane(lane, ground, { claim: 'cl1' });
  assert.equal(res.ok, true);
  // a hundred points, nowhere near a hundred brushes — a brush covers a stretch the road runs
  // straight along, and on rolling ground that is between a third and a half of the points
  assert.ok(res.painted < lane.points.length * 0.6, `${res.painted} brushes for ${lane.points.length} points`);
  assert.ok(ground.budgetLeft('cl1') > 0, 'one road should not spend the whole reshaping allowance');

  // …and on dead-flat ground the chord never drifts, so it is the ten-metre ceiling all the way
  const flat = createTerraform();
  const level = planLane([[0, 0], [300, 0]], { terrain: { heightAt: () => 4 }, half: 3 });
  const paint = levelLane(level, flat, { claim: 'cl1' });
  assert.ok(paint.painted <= 34, `${paint.painted} brushes for 300 m of flat road`);
});

test('LINK_GAP is about what a logistics pole reaches — outposts and pools should agree on "near"', () => {
  assert.ok(LINK_GAP >= POW.poles.logistics_pole.linkRadius,
    'two crates that share a pile should never be called two different outposts');
  assert.ok(LINK_GAP <= POW.poles.relay_mast.linkRadius * 2);
});

test('a town street is a lane too, and it breaks at the water instead of leaving a hole', () => {
  const terrain = fakeTerrain({ amplitude: 7 });
  const plan = {
    streets: [
      { pts: [[-40, 0], [0, 0], [40, 20]], cls: 'main', width: 5 },
      { pts: [[0, -30], [0, 30]], cls: 'alley', width: 2.2 },
    ],
  };
  const lanes = streetLanes(plan, { cx: 1000, cz: 500, terrain });
  assert.equal(lanes.length, 2);
  for (const lane of lanes) {
    assert.ok(laneGap(lane) <= LANE_SPACING * 1.05, 'a street with a gap in it is a row of tiles again');
    assert.ok(lane.points.every(([x, z]) => x > 900 && z > 400), 'streets come back in world metres');
  }
  assert.ok(Math.abs(lanes[0].half - 2.5) < 1e-9, 'a lane is half as wide as the street');

  // a river down the middle cuts the second street in two rather than punching a hole in it
  const cut = streetLanes(plan, { cx: 0, cz: 0, terrain, skip: (x, z) => Math.abs(z) < 4 && Math.abs(x) < 4 });
  const alleys = cut.filter(l => l.klass === 'alley');
  assert.equal(alleys.length, 2, 'the blocked street should become two streets, not one with a hole');
  for (const lane of alleys) assert.ok(laneGap(lane) <= LANE_SPACING * 1.05);
});
