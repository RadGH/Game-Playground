// node --test prototypes/farhold/tests/round17-build.test.js
//
// R17 — stations, the build panel and research.
//
// The first test in this file is the one the round exists for, and it is a transcript of a bug
// report rather than a unit test:
//
//   "I built a furnace, campfire, kiln, and loom, but I still cannot figure out how to convert iron
//    ore into ingots."
//   "Since I still can't craft an iron ingot, I can't build a chest, so I can't complete the
//    building onboarding."
//
// So `the landing chain` below lands a player with nothing but what bare hands take off the ground
// and walks them to an iron ingot through the REAL modules — the build ledger, the storage pools,
// the refining engine and the work board — with no research, no iron in the purse to start with and
// no test-only shortcut anywhere in it. If that test ever goes red, the game is unplayable from
// minute one, whatever else is green.
//
// Everything under it is the small print that chain rests on.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createBuildPlan, alignCatalogue, realCost, MATERIAL_ALIASES, bankAdapter, makeBag } from '../js/buildplan.js';
import { createStoreNetwork } from '../js/stores.js';
import { createWorks } from '../js/refine.js';
import { createResearch } from '../js/research.js';
import { catsForTool, TOOLS } from '../js/build-ui.js';
import { Materials } from '../js/craft.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, p), 'utf8'));

const STRUCTURES = read('../data/structures.json');
const REFINING = read('../data/refining.json');
const RESOURCES = read('../data/resources.json');
const POWER = read('../data/power.json');
const RESEARCH = read('../data/research.json');
const COLONY = read('../data/colony.json');

const CATALOGUE = alignCatalogue(STRUCTURES, RESOURCES);
const BY_ID = Object.fromEntries(CATALOGUE.structures.map(s => [s.id, s]));
const RAW_BY_ID = Object.fromEntries(STRUCTURES.structures.map(s => [s.id, s]));
const RECIPES = Object.fromEntries(REFINING.recipes.map(r => [r.id, r]));

/** Flat ground, no water, no slope: this file is about rules, not about terrain. */
const FLAT = { heightAt: () => 0, slopeAt: () => 0, waterAt: () => false };

// ============================================================================ the landing chain

/**
 * A player standing on a planet, exactly as js/main.js models one.
 *
 * The purse is the SHAPE js/main.js hands `createBuild` — `take(id, n)` and `give(id, n)`, one line
 * at a time, paying out of the store pool you are standing in first and the bag on your back
 * second. That shape matters: js/buildplan.js spends a whole bill at once, the two contracts did
 * not meet, and until this round every structure in the game was free. See `bankAdapter`.
 */
function land({ carrying = {} } = {}) {
  const bag = new Materials(carrying);
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES.materials });
  const at = { x: 0, z: 0 };
  const poolHere = () => stores.poolAt(at.x, at.z);

  const purse = {
    have: id => {
      const pool = poolHere();
      return (pool ? stores.count(pool, id) : 0) + bag.count(id);
    },
    take: (id, n) => {
      const pool = poolHere();
      const fromPool = pool ? Math.min(n, stores.count(pool, id)) : 0;
      if (fromPool > 0) stores.take(pool, id, fromPool);
      const rest = n - fromPool;
      if (rest > 0) bag.spend({ [id]: rest });
      return n;
    },
    give: (id, n) => {
      const pool = poolHere();
      const stored = pool ? stores.put(pool, id, n) : 0;
      if (n - stored > 0) bag.add(id, n - stored);
      return n;
    },
  };

  const research = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  const plan = createBuildPlan({
    catalogue: CATALOGUE, terrain: FLAT, store: purse,
    locked: def => research.lockReason(def),
  });
  const works = createWorks({
    refining: REFINING, resources: RESOURCES, stores,
    labour: COLONY.labour,                    // the game runs with the labour rule ON
  });

  /**
   * js/main.js's `joinSystems`, to the letter: a piece with a `store` block joins the pools and a
   * piece that is a js/refining.json machine joins the works. Copying it rather than importing it
   * is deliberate — js/main.js cannot be imported outside a browser — and the copy is four lines,
   * so a test that passed while the real one had drifted would be obvious.
   */
  function build(id, x, z) {
    const out = plan.place({ id, x, z });
    if (!out.ok) return out;
    const def = BY_ID[id];
    if (def.store?.slots) stores.add({ id: out.entry.id, type: id, name: def.name, x, z });
    if (REFINING.machines[id]) works.place({ id: out.entry.id, type: id, x, z, name: def.name });
    return out;
  }

  /** Somebody stands at a bench and works it. One unit is thirty seconds of machine. */
  function workIt(machineId, units) {
    works.credit(machineId, units);
    works.catchUp(units * 30);
  }

  return { bag, stores, plan, works, research, purse, build, workIt, at, pool: poolHere };
}

test('THE ONE THAT MATTERS — land with nothing, and get an iron ingot without researching anything', () => {
  /**
   * Everything in this bag comes off the ground with bare hands or the weapon you landed holding:
   * a tree gives logs, a boulder gives stone, a clay bank at the water's edge gives clay, an iron
   * outcrop gives ore. Not one ingot, not one plank, not one unit of anything a bench makes.
   */
  const g = land({ carrying: { log: 40, stone: 60, clay: 20, iron_ore: 12 } });

  // 1. NOTHING IN THIS CHAIN IS BEHIND THE TECH TREE. Assert it before building anything, because
  //    a chain that works only because the test happened to unlock something proves nothing.
  for (const id of ['crafting_table', 'storage_crate', 'storage_chest', 'campfire', 'furnace', 'kiln']) {
    assert.equal(g.research.lockReason(id), null, `${id} is research-gated and the first hour needs it`);
  }

  // 2. A CRAFTING TABLE: six logs and two stone, and it carries its own shelf, so it is a storage
  //    pool the moment it is down. That is the rung that was missing — a machine draws only from a
  //    pool, and before this round the first pool cost planks that only a machine could make.
  const table = g.build('crafting_table', 0, 0);
  assert.ok(table.ok, `the crafting table would not go down: ${table.why}`);
  assert.ok(g.pool(), 'the crafting table is not a storage pool, so nothing can ever run on it');
  assert.equal(g.bag.count('log'), 34, 'building the table did not cost six logs');

  // 3. SPLIT PLANKS. Tip the logs into the shelf, queue it, and work it by hand.
  assert.ok(g.plan.pay({ log: 12 }) && g.plan.giveBack({ log: 12 }), 'the logs would not go into the store');
  assert.equal(g.works.queue(table.entry.id, 'split_planks', 6).ok, true);
  g.workIt(table.entry.id, 6);
  assert.ok(g.purse.have('plank') >= 6, `only ${g.purse.have('plank')} planks came off the table`);

  // 4. A STORAGE BOX out of six of them, and no metal anywhere in the price.
  const box = g.build('storage_crate', 4, 0);
  assert.ok(box.ok, `the storage box would not go down: ${box.why}`);
  // R26 — six LOGS, not planks: "the basic one should just require 6 regular wood NOT plank"
  assert.equal(Object.keys(realCost(RAW_BY_ID.storage_crate.cost)).join(), 'log',
    'the Storage Box costs something other than logs');

  // 5. A FURNACE: sixteen stone and six clay, both off the ground.
  const furnace = g.build('furnace', 8, 0);
  assert.ok(furnace.ok, `the furnace would not go down: ${furnace.why}`);
  assert.ok(g.stores.poolAt(8, 0), 'the furnace is not standing in a pool, so it can reach nothing');

  // 6. LOAD IT AND LIGHT IT. Ore and fuel out of the pack and into the stores, which is exactly
  //    what the station screen's "Load it from your pack" button does with the same two calls.
  const bill = { iron_ore: 12, log: 10 };
  assert.ok(g.plan.pay(bill) && g.plan.giveBack(bill));

  assert.equal(g.works.queue(furnace.entry.id, 'smelt_iron', 5).ok, true);
  g.workIt(furnace.entry.id, 4);

  const made = g.purse.have('iron_ingot');
  assert.ok(made >= 1, `the furnace made no iron at all (${g.works.stateText(g.works.get(furnace.entry.id))})`);

  // 7. …AND THE CHEST THE ONBOARDING ASKS FOR IS NOW PAYABLE.
  const chest = BY_ID.storage_chest;
  assert.ok(chest, 'there is no Storage Chest');
  assert.equal(g.research.lockReason('storage_chest'), null);
  assert.ok(Object.keys(chest.cost).includes('iron_ingot'), 'the Chest does not cost iron');
});

test('a furnace nobody works makes nothing, so the chain above proves the work and not a timer', () => {
  const g = land({ carrying: { log: 40, stone: 60, clay: 20, iron_ore: 12 } });
  g.build('crafting_table', 0, 0);
  const f = g.build('furnace', 6, 0);
  const bill = { iron_ore: 8, log: 10 };
  g.plan.pay(bill); g.plan.giveBack(bill);
  g.works.queue(f.entry.id, 'smelt_iron', 4);
  g.works.catchUp(600);                       // ten minutes, and not one unit of work
  assert.equal(g.works.get(f.entry.id).made, 0);
  assert.equal(g.works.get(f.entry.id).state, 'unworked');
});

// ============================================================================ the purse

test('R17 BUG — a per-line store really pays now: building was free for the whole expansion', () => {
  /**
   * js/main.js's store speaks `take(id, n)`; js/buildplan.js spends `take(cost)`. The cost object
   * arrived as the material id, `n` arrived as `undefined`, the arithmetic went to NaN, and the
   * placement went ahead anyway because `check` had already approved it off `have(id)` — which is
   * the one method both shapes agree on. So every structure in Farhold was free and no deconstruct
   * ever gave anything back.
   */
  const bag = { log: 20, stone: 20 };
  const perLine = {
    have: id => bag[id] || 0,
    take: (id, n) => { bag[id] = (bag[id] || 0) - n; return n; },
    give: (id, n) => { bag[id] = (bag[id] || 0) + n; return n; },
  };
  const plan = createBuildPlan({ catalogue: CATALOGUE, terrain: FLAT, store: perLine });
  assert.ok(plan.place({ id: 'crafting_table', x: 0, z: 0 }).ok);
  assert.equal(bag.log, 14, 'the build did not take its six logs');
  assert.equal(bag.stone, 18, 'the build did not take its two stone');

  // …and a whole-bill store is untouched, which is what every node test has always driven
  const whole = makeBag({ log: 20, stone: 20 });
  const plan2 = createBuildPlan({ catalogue: CATALOGUE, terrain: FLAT, store: whole });
  assert.ok(plan2.place({ id: 'crafting_table', x: 0, z: 0 }).ok);
  assert.equal(whole.contents().log, 14);
});

test('a bill that is half payable buys nothing at all', () => {
  const bag = { log: 20, stone: 1 };
  const perLine = {
    have: id => bag[id] || 0,
    take: (id, n) => { bag[id] = (bag[id] || 0) - n; return n; },
    give: (id, n) => { bag[id] = (bag[id] || 0) + n; return n; },
  };
  const bank = bankAdapter(perLine);
  assert.equal(bank.take({ log: 6, stone: 2 }), false);
  assert.equal(bag.log, 20, 'a refused bill still took the line it could pay');
});

// ============================================================================ round 13's rule

test('EVERY build cost is a material this game actually produces — the new entries included', () => {
  const made = new Set();
  for (const r of REFINING.recipes) for (const id of Object.keys(r.outputs || {})) made.add(id);
  const dug = new Set();
  for (const kind of Object.values(RESOURCES.nodeKinds)) for (const id of Object.keys(kind.resources || {})) dug.add(id);

  for (const piece of CATALOGUE.structures) {
    for (const id of Object.keys(piece.cost || {})) {
      assert.ok(RESOURCES.materials[id], `${piece.id} costs "${id}", which is not a material`);
      assert.ok(made.has(id) || dug.has(id),
        `${piece.id} costs "${id}", which is neither dug out of the ground nor made at a bench`);
    }
  }
  // and the alias table is still honest both ways
  for (const [short, real] of Object.entries(MATERIAL_ALIASES)) {
    assert.ok(RESOURCES.materials[real], `the alias ${short} -> ${real} points at nothing`);
  }
});

test('R17 — two prices nothing in the early game could ever have paid', () => {
  /**
   * Round 13's rule catches a cost that names a material NOBODY makes. These two named materials
   * that somebody makes at the far end of the tech tree, which the rule cannot see and is just as
   * unpayable in practice: a tier-1 Power Pole cost `wire`, which is drawn on a Smelter, which
   * needs a grid, which needs poles; and a street lamp cost `fuel`, which aliases to `lift_fuel`,
   * which comes out of the Fuel Synthesiser — the last structure in the game.
   */
  assert.ok(!('wire' in RAW_BY_ID.power_pole.cost), 'the first power pole is behind the grid again');
  assert.ok(!('fuel' in RAW_BY_ID.lamp_post.cost), 'a street lamp is priced in rocket propellant again');
});

// ============================================================================ stations

test('every structure with a station names recipes that exist and run on that structure', () => {
  let stations = 0;
  for (const s of STRUCTURES.structures) {
    if (!s.station) continue;
    stations++;
    assert.ok(s.station.title, `${s.id}'s station has no title`);
    assert.ok(s.station.blurb && s.station.blurb.length > 20, `${s.id}'s station does not say what it is for`);
    for (const id of s.station.recipes || []) {
      const r = RECIPES[id];
      assert.ok(r, `${s.id}'s station names recipe "${id}", which does not exist`);
      assert.equal(r.machine, s.id, `${s.id}'s station offers ${id}, which runs on a ${r.machine}`);
    }
    for (const p of s.station.panels || []) {
      assert.ok(['tools', 'garage', 'shipyard'].includes(p), `${s.id} wants an unknown panel "${p}"`);
    }
  }
  assert.ok(stations >= 20, `only ${stations} structures have a station screen`);
});

test('every refining machine has a structure, and every one of them has a station screen', () => {
  /**
   * The join E depends on. js/main.js's `interactTarget` offers a `machine` only when the thing you
   * are standing at is in `works.machineDefs` — so a bench that is a structure and not a machine has
   * no door at all, which is exactly what a Crafting Table, an Anvil, a Workbench and a Garage were
   * before this round.
   */
  for (const id of Object.keys(REFINING.machines)) {
    assert.ok(RAW_BY_ID[id], `data/refining.json has a "${id}" and the catalogue has no such building`);
    assert.ok(RAW_BY_ID[id].station, `${id} is a machine with no station screen — E would open nothing`);
  }
  for (const s of STRUCTURES.structures) {
    if (!s.station?.recipes?.length) continue;
    assert.ok(REFINING.machines[s.id], `${s.id} offers recipes and is not a machine, so nothing can run them`);
  }
});

test('every recipe in the game is offered by the station of the machine that runs it', () => {
  for (const r of REFINING.recipes) {
    const st = RAW_BY_ID[r.machine]?.station;
    assert.ok(st, `${r.id} runs on a ${r.machine}, which has no station screen`);
    assert.ok((st.recipes || []).includes(r.id),
      `${r.id} runs on a ${r.machine} and the ${r.machine}'s screen does not list it — it is unreachable`);
  }
});

// ============================================================================ research

test('nothing needed for the first hour is research-gated, and age 1 has nothing to research', () => {
  const research = createResearch({ data: RESEARCH, catalogue: CATALOGUE });

  /** The pieces the landing chain and the onboarding actually name. */
  const earlyGame = [
    'crafting_table', 'storage_crate', 'storage_chest', 'campfire', 'furnace', 'kiln',
    'sawmill', 'stonecutter', 'loom', 'tannery', 'anvil', 'workbench', 'small_drill',
    'logistics_pole', 'burner_generator', 'claim_stone', 'bedroll', 'palisade', 'road_dirt',
  ];
  for (const id of earlyGame) {
    assert.ok(BY_ID[id], `${id} is not in the catalogue at all`);
    assert.equal(research.lockReason(id), null, `${id} is behind research and the early game needs it`);
  }

  // the first age is the one with no nodes in it. That is not decoration — it is the rule.
  const first = RESEARCH.ages[0];
  assert.equal(RESEARCH.nodes.filter(n => n.age === first.id).length, 0,
    'the first age has nodes in it, so a player lands unable to build something');
});

test('the tech gates and the tree agree in both directions', () => {
  const nodes = new Map(RESEARCH.nodes.map(n => [n.id, n]));
  const ages = new Set(RESEARCH.ages.map(a => a.id));
  const claimed = new Map();

  for (const n of RESEARCH.nodes) {
    assert.ok(ages.has(n.age), `${n.id} is in age "${n.age}", which does not exist`);
    assert.ok(n.cost > 0, `${n.id} costs nothing`);
    assert.ok((n.unlocks || []).length > 0, `${n.id} opens nothing — a node has to be a visible change`);
    for (const need of n.needs || []) assert.ok(nodes.has(need), `${n.id} waits on "${need}", which does not exist`);
    for (const sid of n.unlocks) {
      assert.ok(RAW_BY_ID[sid], `${n.id} unlocks "${sid}", which is not a structure`);
      assert.ok(!claimed.has(sid), `${sid} is unlocked by both ${claimed.get(sid)} and ${n.id}`);
      claimed.set(sid, n.id);
      assert.equal(RAW_BY_ID[sid].tech, n.id,
        `${sid} is unlocked by ${n.id} and its own tech key says "${RAW_BY_ID[sid].tech}"`);
    }
    for (const rid of n.grants || []) assert.ok(RECIPES[rid], `${n.id} grants "${rid}", which is not a recipe`);
  }
  for (const s of STRUCTURES.structures) {
    if (!s.tech) continue;
    assert.ok(nodes.has(s.tech), `${s.id} names tech "${s.tech}", which is not a node`);
    assert.equal(claimed.get(s.id), s.tech, `${s.id} names ${s.tech} and that node does not unlock it`);
  }
});

test('the tree can actually be finished, and nothing in it is stranded', () => {
  const research = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  assert.equal(research.points, 0);
  assert.equal(research.canBuy('ironworking').ok, false, 'a node was free');

  // the three sources the user named, and nothing else pays
  research.award('quest', 4);
  research.award('region', 3);
  research.award('boss', 2);
  assert.equal(research.points, 4 + 3 + 6);

  assert.equal(research.canBuy('steelwork').blocked, true, 'a late node was buyable out of order');
  assert.ok(research.canBuy('ironworking').ok);
  assert.ok(research.buy('ironworking').ok);
  assert.equal(research.lockReason('smelter'), null, 'buying the node did not open its structures');
  assert.equal(research.points, 13 - 2);

  // …and enough deeds finish it, with every node reachable
  for (let i = 0; i < 12; i++) research.award('boss', 1);
  let guard = 0;
  while (guard++ < 50) {
    const next = RESEARCH.nodes.find(n => research.canBuy(n.id).ok);
    if (!next) break;
    research.buy(next.id);
  }
  for (const n of RESEARCH.nodes) {
    assert.ok(research.isTaken(n.id), `${n.id} could never be reached — the tree is stranded`);
  }
  for (const s of STRUCTURES.structures) {
    assert.equal(research.lockReason(s.id), null, `${s.id} is still locked with the whole tree bought`);
  }
});

test('a locked piece refuses placement, and the refusal names the node and the age', () => {
  const research = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  const plan = createBuildPlan({
    catalogue: CATALOGUE, terrain: FLAT, store: makeBag({}),
    locked: def => research.lockReason(def),
  });
  const out = plan.check({ id: 'smelter', x: 0, z: 0 });
  assert.equal(out.ok, false);
  assert.match(out.why, /Ironworking/, 'the refusal does not name the node that opens it');
  assert.match(out.why, /Age of Iron/, 'the refusal does not name the age');
  assert.match(out.why, /2 points/, 'the refusal does not say what it costs');
  // the run tools price by the metre through `quote`, so the gate has to hold there too
  assert.equal(plan.quote('smelter', 1).ok, false);
  assert.ok(plan.lockOf('smelter'));
  assert.equal(plan.lockOf('furnace'), null);
});

test('research survives a save, and a save from before this round is a fresh tree', () => {
  const a = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  a.award('boss', 1);
  a.buy('ironworking');
  const json = JSON.parse(JSON.stringify(a.toJSON()));

  const b = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  b.load(json);
  assert.ok(b.isTaken('ironworking'));
  assert.equal(b.points, a.points);
  assert.equal(b.lockReason('smelter'), null);

  const old = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
  old.load(undefined);
  assert.equal(old.points, 0);
  assert.equal(old.lockReason('furnace'), null, 'an old save lost a low-tech piece');
});

test('a tech key naming a node that does not exist must not brick the piece', () => {
  const research = createResearch({
    data: { ...RESEARCH, nodes: [] },
    catalogue: CATALOGUE,
  });
  assert.equal(research.lockReason({ id: 'ghost', tech: 'nothing_at_all' }), null);
});

// ============================================================================ the build panel

test('the tool rail only offers the placement catalogue to a tool that places something', () => {
  const cats = Object.keys(STRUCTURES.categories);

  assert.deepEqual(catsForTool('build', cats), cats, 'Place lost the catalogue');
  assert.deepEqual(catsForTool('road', cats), ['road'], 'the Road tool offers more than roads');
  assert.deepEqual(catsForTool('wall', cats), ['defence'], 'the Wall tool offers more than walls');

  for (const key of ['scan', 'smooth', 'raise', 'lower', 'clear', 'remove', 'route']) {
    assert.deepEqual(catsForTool(key, cats), [],
      `the ${key} tool still puts the building categories on screen`);
  }
  // every tool in the rail has to declare which sort it is, or it silently falls through to Place
  for (const t of TOOLS) {
    assert.ok(['place', 'brush', 'scan', 'point'].includes(t.kind), `${t.key} has no kind`);
    assert.ok(t.hint && t.hint.length > 20, `${t.key} has no hint worth reading`);
  }
});

// ============================================================================ storage

test('the Storage Box is six slots and the Chest is twenty, and the old id did not move', () => {
  const box = RAW_BY_ID.storage_crate;
  const chest = RAW_BY_ID.storage_chest;

  assert.equal(box.name, 'Storage Box');
  assert.equal(box.store.slots, 6);
  assert.deepEqual(realCost(box.cost), { log: 6 }, 'the Box costs something besides six logs (R26)');

  assert.equal(chest.name, 'Storage Chest');
  assert.equal(chest.store.slots, 20);
  assert.equal(realCost(chest.cost).iron_ingot, 2, 'the Chest does not cost two iron ingots');

  // the capacity table is the thing that actually holds goods, and it has to agree with the slots
  const capBox = POWER.storage.storage_crate.cap;
  const capChest = POWER.storage.storage_chest.cap;
  assert.equal(capBox / box.store.slots, capChest / chest.store.slots, 'a slot is not worth the same in both');
  assert.ok(capChest > capBox * 3, 'the Chest is not a real upgrade');

  /**
   * THE ID. Every save in existence files its crates as `storage_crate` — in the build ledger, in
   * the store network and in data/power.json — so the id is deliberately unchanged and only the
   * NAME moved. A test, because "rename the crate" is exactly the sort of instruction somebody
   * follows to the letter six months from now.
   */
  assert.ok(POWER.storage.storage_crate, 'the old crate id is gone from the power book');
  assert.equal(POWER.storage.storage_crate.name, 'Storage Box', 'the two files disagree about its name');
});

test('an old save still loads its crates, and they keep the capacity they were written with', () => {
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES.materials });
  // exactly what js/stores.js `Store.toJSON` wrote before this round
  stores.load({ stores: [{ id: 'crate1', type: 'storage_crate', name: 'Storage Crate', x: 0, z: 0, cap: 250, linkRadius: 7, inv: { iron_ore: 30 } }] });
  const pool = stores.poolAt(0, 0);
  assert.ok(pool, 'an old crate no longer forms a pool');
  assert.equal(stores.count(pool, 'iron_ore'), 30, 'an old crate lost what was in it');
  assert.equal(stores.get('crate1').cap, 250, 'an old crate shrank under the player');
});

// ============================================================================ the crafting table

test('the crafting table is its own pool, and that is the only reason the chain starts', () => {
  const def = RAW_BY_ID.crafting_table;
  assert.ok(def.store?.slots > 0, 'the crafting table has no shelf, so it can run nothing');
  assert.ok(POWER.storage.crafting_table?.linkRadius > 0, 'the crafting table forms no pool');
  assert.deepEqual(Object.keys(realCost(def.cost)).sort(), ['log', 'stone'],
    'the first bench costs something a pair of hands cannot get');

  // and it makes the one material the first store is priced in
  const splits = REFINING.recipes.filter(r => r.machine === 'crafting_table');
  assert.ok(splits.some(r => r.outputs.plank > 0), 'nothing on the crafting table makes a plank');
  const sawmill = RECIPES.saw_planks;
  const table = splits.find(r => r.outputs.plank > 0);
  assert.ok(table.outputs.plank / table.time < sawmill.outputs.plank / sawmill.time,
    'the hand bench is not slower than the sawmill, so the sawmill is pointless');
});

// ============================================================================ the screens render

/**
 * R17 — THE SCREENS ARE DRAWN HERE, IN sixty LINES OF FAKE DOM, and it is worth the sixty lines.
 *
 * `node --check` proves a file parses. It does not prove that `works.setEnabled` is spelled the way
 * the panel spells it, that a helper renamed in one place was renamed in the other, or that a
 * `const` is not read above its own declaration — all three of which this project has shipped. The
 * browser suite catches them, and it is a separate run that takes minutes. See tests/tiny-dom.mjs
 * for what this DOM deliberately is not.
 */
test('the station screen draws a furnace and queueing a recipe from it really queues', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createStationScreen } = await import('../js/station-ui.js');
    const g = land({ carrying: { log: 40, stone: 60, clay: 20, iron_ore: 12 } });
    g.build('crafting_table', 0, 0);
    const furnace = g.build('furnace', 6, 0);
    const bill = { iron_ore: 10, log: 10 };
    g.plan.pay(bill); g.plan.giveBack(bill);

    const logged = [];
    const screen = createStationScreen({
      catalogue: CATALOGUE, works: g.works, store: g.purse, build: g.plan && { plan: g.plan, defOf: id => BY_ID[id] },
      onLog: (t, k) => logged.push([t, k]),
    });

    assert.equal(screen.open(furnace.entry), true, 'E at a furnace opened nothing');
    assert.match(screen.root.textContent, /Furnace/);
    assert.match(screen.root.textContent, /Smelt Iron/, 'the furnace screen does not offer smelting');

    const row = screen.root.querySelectorAll('.build-recipe')
      .find(r => /Smelt Iron/.test(r.textContent) && !r.classList.contains('locked'));
    assert.ok(row, 'no runnable recipe row on the furnace screen');
    row.click();
    assert.equal(g.works.get(furnace.entry.id).queue.length, 1, 'clicking the recipe queued nothing');
    assert.ok(logged.some(([t]) => /Smelt Iron/.test(t)), 'nothing was said about it');

    // …and the one that answers "I have forty ore and the furnace says it has none"
    assert.match(screen.root.textContent, /Load it from your pack/);

    assert.equal(screen.close(), true);
    assert.equal(screen.isOpen, false);

    // a piece that is not a station gets no screen, so E can fall through to whatever else it does
    assert.equal(screen.open({ id: 'b99', key: 'palisade', name: 'Palisade', x: 0, z: 0 }), false);
  } finally {
    dom.restore();
  }
});

test('the research screen draws four ages and a node you can afford really buys', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createResearchScreen } = await import('../js/research-ui.js');
    const research = createResearch({ data: RESEARCH, catalogue: CATALOGUE });
    const screen = createResearchScreen({ research });
    screen.mount(dom.body);

    for (const age of RESEARCH.ages) assert.match(screen.root.textContent, new RegExp(age.name));
    assert.match(screen.root.textContent, /Nothing to research/, 'age 1 does not say it is free');
    assert.match(screen.root.textContent, /Bosses killed/, 'the screen never says where points come from');

    // nothing is buyable with no points, and the refusal is a sentence rather than a grey box
    const first = screen.root.querySelectorAll('.res-node').find(n => /Ironworking/.test(n.textContent));
    assert.ok(first);
    assert.match(first.textContent, /more research point/);

    research.award('boss', 1);
    screen.draw();
    const buy = screen.root.querySelectorAll('.res-buy').find(b => /Ironworking/.test(b.textContent));
    assert.equal(buy.disabled, false, 'three points did not make a two-point node buyable');
    buy.click();
    assert.ok(research.isTaken('ironworking'));
    screen.draw();
    assert.match(screen.root.textContent, /Done/);
  } finally {
    dom.restore();
  }
});

test('the build panel drops the catalogue for a non-placement tool, and the bench opens a station', async () => {
  const { installTinyDom } = await import('./tiny-dom.mjs');
  const dom = installTinyDom();
  try {
    const { createBuildUI } = await import('../js/build-ui.js');
    const g = land({ carrying: { log: 40, stone: 60, clay: 20, iron_ore: 12 } });
    const furnace = g.build('furnace', 2, 0);

    let tool = 'build';
    const build = {
      get tool() { return tool; },
      setTool(t) { tool = t; return t; },
      get entries() { return g.plan.entries; },
      get radius() { return 8; },
      setRadius: () => 8,
      select: () => null,
      defOf: id => BY_ID[id] || null,
      plan: g.plan,
      lastCheck: null,
      runPoints: [],
    };
    const ui = createBuildUI({
      catalogue: CATALOGUE, build, store: g.purse, works: g.works,
      nearest: () => furnace.entry,
      onLog: () => {},
    });
    ui.setOpen(true);

    assert.ok(ui.root.querySelectorAll('.build-row').length > 0, 'Place drew no catalogue');
    build.setTool('scan');
    ui.refresh();
    assert.equal(ui.root.querySelectorAll('.build-row').length, 0, 'Scan still lists buildings');
    assert.equal(ui.root.querySelectorAll('.build-cat').length, 0, 'Scan still lists categories');
    assert.deepEqual(ui.toolCategories, []);

    build.setTool('build');
    ui.refresh();
    // the bench section names the thing you are standing at and carries the door into its screen
    const bench = ui.root.querySelector('.build-bench');
    assert.match(bench.textContent, /Furnace/);
    const open = ui.root.querySelector('.build-open-station');
    assert.ok(open, 'the bench section has no way into the station screen');
    open.click();
    assert.equal(ui.station.isOpen, true, 'the button did not open the station screen');

    // …and the API js/main.js's E handler is meant to call
    ui.closeStation();
    assert.equal(ui.openStation(furnace.entry), true);
    assert.equal(ui.openStation(furnace.entry), true, 'pressing E twice closed it again');
  } finally {
    dom.restore();
  }
});
