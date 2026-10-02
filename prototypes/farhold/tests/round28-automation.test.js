// node --test prototypes/farhold/tests/round28-automation.test.js
//
// R28 — automation. "Improve building system and automation."
//
// Three groups:
//
//   1. THE BUGS THE AUDIT FOUND — each one played through the real modules: a reloaded Small Drill
//      stays a Small Drill, a digging drill is billed as busy, the away clock runs the drills (and
//      cannot overfill a pile in one long slice), the next-step hint reads a field the drill rows
//      actually carry, a real housing register no longer throws in the population reading, and a
//      recipe's own `power` reaches the grid.
//   2. KEEP-IN-STOCK — the new kind of job: stops at the line, starts again below it, takes turns
//      with a second keep order, posts no work while satisfied, survives a save.
//   3. js/production.js — the overview: rated rates, the meter counting at the source, the
//      upstream diagnosis, the store-share explanation, and alerts that wait out a blip.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createStoreNetwork } from '../js/stores.js';
import { createWorks } from '../js/refine.js';
import { createGrid } from '../js/power.js';
import { createMining } from '../js/mining.js';
import { createLogistics, createAwayClock } from '../js/logistics.js';
import { createProduction } from '../js/production.js';
import { createHousing } from '../js/housing.js';
import { population } from '../js/population.js';
import { WorkBoard } from '../js/work.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(readFileSync(join(here, p), 'utf8'));
const REFINING = read('../data/refining.json');
const RESOURCES = read('../data/resources.json');
const POWER = read('../data/power.json');
const COLONY = read('../data/colony.json');
const MAIN = readFileSync(join(here, '../js/main.js'), 'utf8');

/** A chest at the origin and whatever is asked for in it. */
function base({ chest = true, grid: withGrid = false, labour = null } = {}) {
  const stores = createStoreNetwork({ power: POWER, materials: RESOURCES });
  if (chest) stores.add({ id: 'chest', type: 'storage_chest', x: 0, z: 0 });
  const grid = withGrid ? createGrid({ power: POWER, stores }) : null;
  const works = createWorks({ refining: REFINING, resources: RESOURCES, stores, grid, labour });
  const pool = () => stores.poolAt(0, 0);
  const give = (res, n) => stores.put(pool(), res, n);
  return { stores, grid, works, pool, give, count: res => stores.count(pool(), res) };
}

/** A seam js/mining.js can work, without the world generator. */
function seam(over = {}) {
  const node = { id: 'n1', kind: 'ore_outcrop', resource: 'iron_ore', amount: 100000, richness: 1, band: 'rich', x: 0, z: 0, ...over };
  return { node, ore: { byId: id => (id === node.id ? node : null), noteWorked() {} } };
}

// ============================================================================ 1. the audit's bugs

test('R28 bug — a Small Drill is still a Small Drill after a save and a load', () => {
  const { stores } = base();
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores });
  const entry = { id: 'd1', key: 'small_drill', name: 'Small Drill', x: 0, z: 0, powered: true };
  assert.ok(mining.bindDrill(entry, node).ok);
  const before = mining.overview()[0].digPerSecond;
  const saved = JSON.parse(JSON.stringify(mining.toJSON()));
  assert.equal(saved.drills[0].tool, 'small_drill', 'the kind of drill has to be in the save');

  const again = createMining({ data: RESOURCES, ore, stores });
  again.load(saved, () => entry);
  assert.equal(again.overview()[0].digPerSecond, before, 'a reload must not change how fast it digs');

  // an OLD save has no `tool` at all: it is worked out from the piece standing there
  delete saved.drills[0].tool;
  const old = createMining({ data: RESOURCES, ore, stores });
  old.load(saved, () => entry);
  assert.equal(old.drills[0].tool, 'small_drill');
  assert.equal(old.overview()[0].digPerSecond, before, 'an old save turned every Small Drill into a full Drill');
});

test('R28 bug — a digging drill tells the grid it is busy', () => {
  const { stores } = base();
  const grid = createGrid({ power: POWER, stores });
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores, grid });
  grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  grid.add({ id: 'd1', type: 'drill', x: 2, z: 0, draw: 18, priority: 'extraction' });
  const entry = { id: 'd1', key: 'drill', name: 'Drill', x: 2, z: 0, powered: true };
  mining.bindDrill(entry, node);
  mining.tick(0.5);
  assert.equal(grid.get('d1').busy, true);
  grid.tick(1, { wind: 1 });
  assert.equal(grid.overview()[0].use, 18, 'a working 18 kW drill was billed at the 25% idle share');
});

test('R28 bug — the away clock runs the drills, and a long slice cannot overfill a pile', () => {
  const { stores } = base({ chest: false });          // no store: the pile is the only place it goes
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores });
  mining.bindDrill({ id: 'd1', key: 'small_drill', name: 'Small Drill', x: 0, z: 0, powered: true }, node);
  mining.tick(100000);
  assert.ok(mining.drills[0].stock <= 200 + 1e-6, `one long step dug ${mining.drills[0].stock} into a 200 pile`);

  // and with a store beside it, an hour away really digs
  const b = base();
  const m2 = createMining({ data: RESOURCES, ore: seam().ore, stores: b.stores });
  m2.bindDrill({ id: 'd2', key: 'small_drill', name: 'Small Drill', x: 1, z: 0, powered: true }, seam().node);
  m2.autoRoute('d2', { quiet: true });
  let t = 0;
  const away = createAwayClock({ mining: m2, stores: b.stores, now: () => t });
  away.mark(0);
  t = 3600 * 1000;
  const back = away.resume();
  assert.ok(b.count('iron_ore') > 50, `an hour away dug ${b.count('iron_ore')} iron ore`);
  assert.ok(back.made.some(m => m.res === 'iron_ore'), 'the away card says so');
});

test('R28 bug — the next-step hint reads a field the drill rows actually carry', () => {
  const { stores } = base();
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores });
  mining.bindDrill({ id: 'd1', key: 'small_drill', name: 'Small Drill', x: 1, z: 0, powered: true }, node);
  mining.autoRoute('d1', { quiet: true });
  const row = mining.overview()[0];
  const line = MAIN.split('\n').find(l => /^\s*hasRoute:/.test(l));
  assert.ok(line, 'main.js no longer computes hasRoute');
  const fields = [...line.matchAll(/\bd\.(\w+)/g)].map(m => m[1]);
  assert.ok(fields.length, line);
  for (const f of fields) assert.ok(f in row, `main.js reads d.${f}, which a mining.overview() row never has`);
  assert.ok(row.route, 'a routed drill');
});

test('R28 bug — the population reading takes the REAL housing register (houses is a function)', () => {
  const housing = createHousing({ data: COLONY });
  housing.rebuild([{ id: 'h1', key: 'bunkhouse', x: 0, z: 0 }], () => ({ home: { beds: 4, comfort: 0.2 } }));
  assert.equal(typeof housing.houses, 'function');
  const pop = population({ colony: { citizens: [] }, housing });
  assert.equal(pop.houses, 1);
  assert.equal(pop.open, true);
});

test('R28 dead data — a recipe\'s own `power` is drawn while it is the job', () => {
  const b = base({ grid: true });
  b.grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  b.works.place({ id: 's1', type: 'smelter', x: 2, z: 0 });
  assert.equal(b.grid.get('s1').draw, 14);
  b.give('copper_ingot', 10);
  b.works.queue('s1', 'draw_wire', 5);
  b.works.tick(0.1);
  const recipe = REFINING.recipes.find(r => r.id === 'draw_wire');
  assert.equal(b.grid.get('s1').draw, 14 + recipe.power, 'the recipe draw was read by nothing');
});

// ============================================================================ 2. keep in stock

function furnaceWithOre(opts = {}) {
  const b = base(opts);
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.give('iron_ore', 60);
  b.give('copper_ore', 60);
  b.give('coal', 40);
  return b;
}

test('R28 keep — a keep order stops at the line and starts again below it', () => {
  const b = furnaceWithOre();
  const out = b.works.queue('f1', 'smelt_iron', 0, { keep: 3 });
  assert.ok(out.ok);
  b.works.catchUp(400);
  assert.equal(b.count('iron_ingot'), 3, 'it made more than it was asked to keep');
  const m = b.works.get('f1');
  assert.equal(m.state, 'stocked');
  assert.match(b.works.stateText(m), /Stocked — 3 Iron Ingot on hand, keeping 3/);
  assert.ok(POWER.machineStates.includes('stocked'), 'a new badge must be declared in data/power.json');

  // somebody takes two away: it starts again by itself
  b.stores.take(b.pool(), 'iron_ingot', 2);
  b.works.catchUp(400);
  assert.equal(b.count('iron_ingot'), 3);
});

test('R28 keep — two keep orders on one furnace take turns', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 2 });
  b.works.queue('f1', 'smelt_copper', 0, { keep: 2 });
  b.works.catchUp(600);
  assert.equal(b.count('iron_ingot'), 2);
  assert.equal(b.count('copper_ingot'), 2, 'the second keep order never got a turn');
  assert.equal(b.works.get('f1').state, 'stocked');
  // asking again for the same recipe moves the line instead of adding a row
  b.works.queue('f1', 'smelt_iron', 0, { keep: 4 });
  assert.equal(b.works.get('f1').queue.length, 2);
  b.works.catchUp(600);
  assert.equal(b.count('iron_ingot'), 4);
});

test('R28 keep — a stocked machine posts no new work order', () => {
  const b = furnaceWithOre({ labour: COLONY.labour });
  const board = new WorkBoard();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 1 });
  b.give('iron_ingot', 5);                 // already over the line
  b.works.tick(0.1);
  assert.equal(b.works.get('f1').state, 'stocked');
  assert.equal(b.works.postLabour(board, { at: 0 }), 0, 'a stocked furnace asked for a worker');
  b.stores.take(b.pool(), 'iron_ingot', 5);
  b.works.tick(0.1);
  assert.notEqual(b.works.get('f1').state, 'stocked');
  assert.equal(b.works.postLabour(board, { at: 1 }), 1, 'below the line it asks again');
});

test('R28 keep — survives a save, and setKeep moves the line', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 0, { keep: 7 });
  const json = JSON.parse(JSON.stringify(b.works.toJSON()));
  assert.equal(json.machines[0].queue[0].keep, 7);
  const b2 = base();
  b2.works.load(json);
  assert.equal(b2.works.get('f1').queue[0].keep, 7);
  assert.ok(b2.works.setKeep('f1', 0, 12));
  assert.equal(b2.works.get('f1').queue[0].keep, 12);
  assert.equal(b2.works.mainOutput(b2.works.recipes.smelt_iron), 'iron_ingot', 'slag is waste, not the point');
});

// ============================================================================ 3. the overview

function prodFor(b, extra = {}) {
  return createProduction({
    works: b.works, stores: b.stores, grid: b.grid, materials: RESOURCES.materials,
    refining: REFINING, nodeKinds: RESOURCES.nodeKinds, ...extra,
  });
}

test('R28 production — rated numbers per machine', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 5);
  const p = prodFor(b);
  const r = p.rated(b.works.get('f1'));
  assert.equal(r.perMin, 60 / 16);
  assert.equal(r.makes.iron_ingot, 60 / 16);
  assert.equal(r.eats.iron_ore, 2 * 60 / 16);
  assert.match(p.ratedText(b.works.get('f1')), /^Makes 3\.8 iron ingot a minute from 7\.5 iron ore, while it runs\.$/);
  assert.doesNotMatch(p.ratedText(b.works.get('f1')), /slag/, 'waste is not what a machine is for');
});

test('R28 production — the meter counts what was MADE, not what the stores happened to hold', () => {
  const b = furnaceWithOre();
  b.works.queue('f1', 'smelt_iron', 0);
  const p = prodFor(b);
  for (let t = 0; t <= 60; t++) { p.sample(t); b.works.tick(1); }
  // you empty the crate of ingots into your pack mid-minute: not a production figure
  b.stores.take(b.pool(), 'iron_ingot', 99);
  p.sample(61);
  const row = p.flows().find(f => f.res === 'iron_ingot');
  assert.ok(row.made >= 2.5 && row.made <= 4.5, `made ${row.made}/min, rated 3.75 (whole batches of 16 s)`);
  assert.ok(row.trend <= 0, 'the stock trend shows the crate being emptied');
  const ore = p.flows().find(f => f.res === 'iron_ore');
  assert.ok(ore.used >= 5, `used ${ore.used} ore/min`);
});

test('R28 production — starved, traced upstream to the drill that has no power', () => {
  const b = base();
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.give('coal', 10);
  b.works.queue('f1', 'smelt_iron', 5);
  const { node, ore } = seam();
  const mining = createMining({ data: RESOURCES, ore, stores: b.stores });
  mining.bindDrill({ id: 'd1', key: 'drill', name: 'Drill', x: 1, z: 0, powered: false }, node);
  mining.autoRoute('d1', { quiet: true });
  b.works.tick(0.5);
  const p = prodFor(b, { mining });
  const d = p.diagnose('f1');
  assert.equal(d.word, 'starved');
  assert.ok(d.chain.some(l => /drill on iron ore has no power/.test(l)), d.chain.join(' | '));

  // and with no drill at all, it says where iron ore comes from
  const lone = base();
  lone.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  lone.give('coal', 10);
  lone.works.queue('f1', 'smelt_iron', 5);
  lone.works.tick(0.5);
  const d2 = prodFor(lone).diagnose('f1');
  assert.match(d2.fix, /E on a seam, or put a drill on one/);
});

test('R28 production — two machines deep: the forge waits on a furnace that waits on ore', () => {
  const b = base({ grid: true });
  b.grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.give('coal', 10);
  b.works.queue('f1', 'smelt_iron', 5);
  // anything in refining.json that eats an iron ingot and is not the furnace itself
  const eater = REFINING.recipes.find(r => r.inputs?.iron_ingot && r.machine !== 'furnace' && !r.rareInput && !r.unlock);
  assert.ok(eater, 'no recipe eats iron ingot');
  b.works.place({ id: 'e1', type: eater.machine, x: 1, z: 1 });
  assert.ok(b.works.queue('e1', eater.id, 1).ok);
  for (const [k, n] of Object.entries(eater.inputs)) if (k !== 'iron_ingot') b.give(k, n * 3);
  b.grid.tick(1, { wind: 1 });
  b.works.tick(0.5);
  const d = prodFor(b).diagnose('e1');
  assert.equal(d.word, 'starved', b.works.stateText(b.works.get('e1')));
  assert.ok(d.chain.some(l => /The Furnace that makes it is stopped too: waiting for iron ore/i.test(l)), d.chain.join(' | '));
});

test('R28 production — blocked by the store-share line says so, not "the stores are full"', () => {
  const b = base();
  b.works.place({ id: 'm1', type: 'sawmill', x: 2, z: 0 });
  // a chest is 400: one raw material may fill a quarter (100), all raw ones half (200)
  b.give('log', 100);
  b.give('resin', 100);
  b.works.completed.saw_planks = 4;          // Press Resin is learned by sawing planks first
  assert.ok(b.works.queue('m1', 'tap_resin', 1).ok);
  b.works.catchUp(300);
  const m = b.works.get('m1');
  assert.equal(m.state, 'blocked', b.works.stateText(m));
  const d = prodFor(b).diagnose('m1');
  assert.ok(d.chain.some(l => /at most a quarter of a store/.test(l)), d.chain.join(' | '));

  // and when it really is full, it says that instead
  const f = base();
  f.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  f.give('iron_ore', 20); f.give('coal', 20);
  f.works.queue('f1', 'smelt_iron', 3);
  f.works.tick(0.5);                          // the batch is loaded and burning
  f.give('plank', 10000);                     // …and then the chest is filled to the lid
  f.works.catchUp(100);
  assert.equal(f.works.get('f1').state, 'blocked');
  assert.ok(prodFor(f).diagnose('f1').chain.some(l => /stores here are full/.test(l)));
});

test('R28 production — alerts wait out a blip and say what to do', () => {
  const b = base();
  b.works.place({ id: 'f1', type: 'furnace', x: 2, z: 0 });
  b.works.queue('f1', 'smelt_iron', 3);
  b.works.tick(0.1);                                  // starved: no ore, no coal
  const p = prodFor(b);
  assert.equal(p.sample(0).length, 0, 'a machine stopped for one second is not an alert yet');
  assert.equal(p.sample(5).length, 0);
  const a = p.sample(20);
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'machine');
  assert.match(a[0].text, /^Furnace: Waiting for Iron Ore/);
  assert.ok(a[0].fix.length > 10);
  assert.equal(p.summary().alerts, 1);

  // fixed: it goes away the next sample
  b.give('iron_ore', 10); b.give('coal', 5);
  b.works.tick(0.1);
  assert.equal(p.sample(21).length, 0);
});

test('R28 production — a nearly full store is an alert; storage rows carry join advice', () => {
  const b = base();
  b.stores.add({ id: 'far', type: 'storage_chest', x: 40, z: 0 });
  b.give('iron_ingot', 380);
  const p = prodFor(b);
  const a = p.sample(0);
  assert.ok(a.some(x => x.kind === 'store' && /95% full/.test(x.text)), a.map(x => x.text).join(' | '));
  const rows = p.storage();
  const home = rows.find(r => r.id === b.pool().id);
  assert.ok(home.join, 'two pools forty metres apart and no advice on joining them');
  assert.match(home.join.text, /relay mast/);
  assert.equal(home.top[0].res, 'iron_ingot');
});

test('R28 production — supply routes carry their filters, and power rows read the grid report', () => {
  const b = base({ grid: true });
  b.stores.add({ id: 'far', type: 'storage_chest', x: 120, z: 0 });
  const logistics = createLogistics({ stores: b.stores, power: POWER, materials: RESOURCES.materials });
  const farPool = b.stores.poolAt(120, 0);
  const made = logistics.link(farPool.id, b.pool().id, { only: ['iron_ore'], keep: 10 });
  assert.ok(made.ok, made.why);
  b.grid.add({ id: 'g', type: 'wind_turbine', x: 0, z: 0 });
  b.works.place({ id: 's1', type: 'smelter', x: 2, z: 0 });
  b.grid.tick(1, { wind: 1 });
  const p = prodFor(b, { logistics });
  const l = p.links()[0];
  assert.deepEqual(l.only, ['iron_ore']);
  assert.equal(l.keep, 10);
  const pw = p.power()[0];
  assert.equal(pw.gen, 26);
  assert.match(pw.text, /kW wanted of 26 kW made/);
});
