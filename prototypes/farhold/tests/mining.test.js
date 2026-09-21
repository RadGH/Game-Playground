// js/mining.js — ore out of the ground, and the route that decides how fast it gets home.
//
// "set up resources to be mined at a location, route between them determines transfer rate."
// That sentence is the whole specification, so most of this file is about the rate.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMining } from '../js/mining.js';
import { createNodeWorld, createNodeField, placedNode } from '../js/resources.js';
import { createStoreNetwork } from '../js/stores.js';

const DATA = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));
const POWER = JSON.parse(readFileSync(new URL('../data/power.json', import.meta.url)));

/** A seam, a drill on it, and a crate `metres` away. The smallest thing that has a route in it. */
function rig({ metres = 40 } = {}) {
  const stores = createStoreNetwork({ power: POWER, materials: DATA });
  const node = placedNode({ data: DATA, kindId: Object.keys(DATA.nodeKinds)[0], x: 0, z: 0, band: 'medium' });
  node.id = 'seam1';
  node.infinite = true;                       // this file is about rates, not about running out
  const ore = { byId: id => (id === node.id ? node : null), noteWorked() {} };
  const drill = { id: 'd1', name: 'Drill', x: 0, z: 0, powered: true };
  stores.add({ id: 'c1', type: 'storage_crate', name: 'Crate', x: metres, z: 0 });
  const mining = createMining({ data: DATA, ore, stores });
  mining.bindDrill(drill, node);
  const pool = stores.poolAt(metres, 0);
  return { stores, node, drill, mining, pool, ore };
}

test('a drill has to stand on a seam, and only one drill per seam', () => {
  const { mining, node } = rig();
  assert.equal(mining.bindDrill({ id: 'd2', x: 0, z: 0, powered: true }, null).ok, false);
  const second = mining.bindDrill({ id: 'd2', name: 'Drill', x: 1, z: 1, powered: true }, node);
  assert.equal(second.ok, false);
  assert.match(second.why, /already drilling/);
});

test('THE ROUTE DECIDES THE RATE: double the distance, roughly half the delivery', () => {
  const near = rig({ metres: 30 });
  const far = rig({ metres: 120 });
  near.mining.route('d1', near.pool.id);
  far.mining.route('d1', far.pool.id);

  const a = near.mining.rateOf(near.mining.routes[0]);
  const b = far.mining.rateOf(far.mining.routes[0]);
  assert.ok(a.perSecond > b.perSecond, 'the longer route was not slower');
  assert.equal(Math.round(a.metres), 30);
  assert.equal(Math.round(b.metres), 120);

  // and it really is the distance doing it, not a constant: four times as far, and the cycle time
  // (two loading stops plus the round trip) has grown by the travel part alone
  const ratio = a.perSecond / b.perSecond;
  assert.ok(ratio > 1.5 && ratio < 6, `expected a real falloff, got ${ratio.toFixed(2)}x`);
});

test('a drill standing IN the pool has no trip to make', () => {
  const { stores, node, mining } = rig({ metres: 40 });
  // put a second crate right on the drill, joining it to the pool
  stores.add({ id: 'c2', type: 'storage_crate', name: 'Crate', x: 2, z: 0 });
  const pool = stores.poolAt(0, 0);
  mining.route('d1', pool.id);
  const rate = mining.rateOf(mining.routes[0]);
  assert.equal(rate.direct, true);
  assert.equal(rate.perSecond, Infinity);
  assert.match(rate.why, /No trip to make/);
});

test('the drill digs, the route carries, and the crate fills', () => {
  const { mining, stores, pool, node } = rig({ metres: 30 });
  mining.route('d1', pool.id);
  for (let i = 0; i < 60; i++) mining.tick(1);
  const got = stores.count(pool, node.resource);
  assert.ok(got > 0, 'a minute of drilling delivered nothing');
});

test('an unrouted drill stockpiles and says so, rather than looking like it works', () => {
  const { mining } = rig();
  for (let i = 0; i < 30; i++) mining.tick(1);
  const row = mining.overview()[0];
  assert.ok(row.stock > 0, 'the drill dug nothing');
  assert.equal(row.limit, 'no route');
  assert.equal(row.route, null);
});

test('a drill with no power digs nothing, and the overview blames the power', () => {
  const { mining, drill, pool } = rig();
  mining.route('d1', pool.id);
  drill.powered = false;
  for (let i = 0; i < 30; i++) mining.tick(1);
  const row = mining.overview()[0];
  assert.equal(row.stock, 0);
  assert.equal(row.limit, 'power');
});

test('digging faster than the route can carry is called hauling, not digging', () => {
  const { mining, pool } = rig({ metres: 900 });   // a very long walk
  mining.route('d1', pool.id);
  for (let i = 0; i < 200; i++) mining.tick(1);
  const row = mining.overview()[0];
  assert.equal(row.limit, 'hauling');
  assert.ok(row.stock > 0, 'nothing piled up at the far end of a 900 m route');
});

test('swinging at a seam by hand puts the ore in the pool you are standing in', () => {
  const { mining, stores, node } = rig({ metres: 2 });     // the crate is at your feet
  const out = mining.swing(node, 5, { tool: 'iron_tool' });
  assert.ok(out.got > 0, 'five seconds of swinging got nothing');
  assert.equal(out.intoPool, true);
  assert.ok(stores.count(stores.poolAt(0, 0), node.resource) > 0);
});

test('…and into your bag when there is no pool', () => {
  const stores = createStoreNetwork({ power: POWER, materials: DATA });
  const node = placedNode({ data: DATA, kindId: Object.keys(DATA.nodeKinds)[0], x: 0, z: 0 });
  node.infinite = true;
  const held = {};
  const mining = createMining({ data: DATA, stores, bag: { add: (id, n) => { held[id] = (held[id] || 0) + n; } } });
  const out = mining.swing(node, 5, { tool: 'iron_tool' });
  assert.equal(out.intoPool, false);
  assert.ok(held[node.resource] > 0, 'the ore went nowhere');
});

test('the routes survive a save and a load', () => {
  const { mining, pool } = rig();
  mining.route('d1', pool.id);
  for (let i = 0; i < 20; i++) mining.tick(1);
  const json = JSON.parse(JSON.stringify(mining.toJSON()));
  assert.equal(json.drills.length, 1);
  assert.equal(json.routes.length, 1);

  const back = rig();
  back.mining.load(json, id => (id === 'd1' ? back.drill : null));
  assert.equal(back.mining.drills.length, 1);
  assert.equal(back.mining.routes.length, 1);
  // a route whose drill did not come back must not come back either
  const orphan = rig();
  orphan.mining.load(json, () => null);
  assert.equal(orphan.mining.routes.length, 0);
});

// ---------------------------------------------------------------- the world of seams

test('ore is generated around the PLAYER, not around the origin', () => {
  // the bug this replaced: createNodeField({ data, seed, terrain }) takes none of those, so every
  // seam in the game was scattered around 0,0 — about 29 km from where the player lands
  const world = createNodeWorld({ data: DATA, seed: 11, band: 'medium' });
  const here = world.around(29000, 7000);
  assert.ok(here.length > 0, 'nothing to mine anywhere near the player');
  for (const n of here) {
    assert.ok(Math.abs(n.x - 29000) < 1600 && Math.abs(n.z - 7000) < 1600, `a seam turned up at ${n.x},${n.z}`);
  }
});

test('a seam is in the same place every time you walk back to it', () => {
  const a = createNodeWorld({ data: DATA, seed: 11 });
  const b = createNodeWorld({ data: DATA, seed: 11 });
  const one = a.around(5000, 5000).map(n => `${n.id}@${n.x},${n.z}`).sort();
  const two = b.around(5000, 5000).map(n => `${n.id}@${n.x},${n.z}`).sort();
  assert.deepEqual(one, two);
  // …and a different world has different ore
  const other = createNodeWorld({ data: DATA, seed: 12 });
  assert.notDeepEqual(other.around(5000, 5000).map(n => n.id + n.x).sort(), one);
});

test('what you took out of a seam is remembered when the tile is dropped', () => {
  const world = createNodeWorld({ data: DATA, seed: 11 });
  const node = world.around(5000, 5000).find(n => !n.infinite);
  if (!node) return;                                  // every kind here is infinite; nothing to check
  const before = node.amount;
  node.amount = Math.round(before / 2);
  node.worked = before - node.amount;
  world.noteWorked(node);
  // drop every tile the way a save/load does, then come back
  world.load(JSON.parse(JSON.stringify(world.toJSON())));
  const again = world.byId(node.id);
  assert.equal(again.amount, node.amount, 'the seam refilled itself when the tile was rebuilt');
});

test('createNodeField still does what it did, so nothing that used it moved', () => {
  const nodes = createNodeField({ data: DATA, count: 10, area: { x: 0, z: 0, radius: 200 } });
  assert.ok(nodes.length > 0);
  for (const n of nodes) assert.ok(Math.hypot(n.x, n.z) <= 220);
});

/**
 * R15 — THE SMALL DRILL.
 *
 *   "I would like to add a Small Drill crafted out of just iron ingots for earlier game use."
 *
 * The full Drill costs 14 steel and 5 machine parts, which is most of the way down the tech tree —
 * so between swinging at a rock by hand and an industrial base there was nothing at all. The rung
 * that was missing is automation WITHOUT a tech jump: iron only, no power, and tier 1 so it refuses
 * exactly the seams an iron weapon refuses.
 */
test('a small drill digs with no generator anywhere, and a real drill does not', () => {
  const data = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));
  const node = { id: 'n1', kind: 'ore_outcrop', resource: 'iron_ore', amount: 500, richness: 1, hardness: 1 };
  const ore = { byId: id => (id === 'n1' ? node : null), noteWorked() {} };
  const m = createMining({ data, ore, stores: null });

  // both stand on the same seam; neither has power
  const small = { id: 'e1', key: 'small_drill', x: 0, z: 0, powered: false };
  assert.equal(m.bindDrill(small, node).ok, true);
  m.tick(10);
  const dugSmall = m.overview()[0]?.stock ?? 0;
  assert.ok(dugSmall > 0, 'the small drill dug nothing without power — it is hand cranked');

  m.unbindDrill('e1');
  const big = { id: 'e2', key: 'drill', x: 0, z: 0, powered: false };
  assert.equal(m.bindDrill(big, node).ok, true);
  m.tick(10);
  assert.equal(m.overview()[0]?.stock ?? 0, 0, 'an unpowered real Drill dug anyway');
});

test('a small drill is slower than a real one and faster than swinging', () => {
  const data = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));
  const T = data.tools;
  assert.ok(T.small_drill, 'there is no small drill');
  assert.ok(T.small_drill.rate > T.iron_tool.rate,
    'the small drill is no better than standing there hitting it, so nobody would build one');
  assert.ok(T.small_drill.rate < T.drill.rate,
    'the small drill matches the powered one, so the powered one is not a promotion');
  // tier 1: it is automation, not a tech jump, and must refuse a hardness-2 seam
  assert.equal(T.small_drill.tier, 1);
  assert.ok(T.small_drill.handCranked, 'the no-power rule is a property of the drill, not a name in the code');
});

test('the small drill costs iron and nothing else, and iron is something you can actually make', () => {
  const S = JSON.parse(readFileSync(new URL('../data/structures.json', import.meta.url)));
  const p = (S.structures || []).find(x => x.id === 'small_drill');
  assert.ok(p, 'the small drill is not in the catalogue');
  assert.deepEqual(Object.keys(p.cost), ['iron'], `it costs ${JSON.stringify(p.cost)} — the ask was iron only`);
  assert.ok(!p.power, 'it asks for power, which is the whole thing it exists to avoid');
  assert.equal(p.needs, 'node', 'a drill that does not have to stand on a seam is not a drill');
});
