// node --test prototypes/farhold/tests/round13.test.js
//
// Round 13 is a play-test round, and almost every item in it turned out to be the same shape of
// fault the last two rounds found: a rule that was written down and never read, or a module that was
// finished and never called.
//
//   * `deep_vein` carried `indoors: true` from the day it landed and `kindsForBiome` never looked,
//     so the one seam in the game that needs a steel tool was scattered across open grassland —
//     "I found iron ore but it says I need a steel tool. How do I get steel if I can't mine iron?"
//   * `props.clearAround` did not exist, and `onClear` called it with `?.()`, so the Clear tool
//     reported success and did nothing for the whole life of the building expansion.
//   * `build.js`'s `clear()` passed the whole materials bag to `store.give(id, n)` as the id.
//   * a haul route measured `Math.hypot` between its ends, so a crate across a lake delivered as if
//     the hauler swam.
//   * Titan's Grip only let a two-hander into the off hand when the equip path was ASKED for the
//     off hand by name, and the one click the inventory has never asks.
//
// Everything here is pure arithmetic or pure data, so it runs without a browser. The parts that
// need Three.js — the harvest ledger, the Clear tool, the run preview — are in round13.spec.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { kindsForBiome, haulReport, createNodeField, createNodePatch, placedNode, mine } from '../js/resources.js';
import { findHaulPath, bestStoreFor, stepCost, MAX_SLOPE } from '../js/haulpath.js';
import { createMining } from '../js/mining.js';
import { createStoreNetwork } from '../js/stores.js';
import { alignCatalogue, realCost, MATERIAL_ALIASES } from '../js/buildplan.js';
import { makeRng } from '../../emberveil/js/rng.js';

const DATA = JSON.parse(readFileSync(new URL('../data/resources.json', import.meta.url)));
const POWER = JSON.parse(readFileSync(new URL('../data/power.json', import.meta.url)));
const STRUCTURES = JSON.parse(readFileSync(new URL('../data/structures.json', import.meta.url)));
const REFINING = JSON.parse(readFileSync(new URL('../data/refining.json', import.meta.url)));

// ---------------------------------------------------------------- the iron/steel wall

test('no seam that needs a tool you cannot have yet is scattered on the open ground', () => {
  // The rule, stated once: whatever the surface offers, a brand new player holding a starting
  // weapon (tier 1) must be able to work it. Anything harder belongs underground or is placed by
  // hand, or it is a wall with no door in it.
  const surface = new Set();
  for (const biome of Object.keys(DATA.nodeKinds).flatMap(k => DATA.nodeKinds[k].biomes || []).concat(['grassland', 'hills', 'desert', 'marsh', 'volcanic'])) {
    for (const [id] of kindsForBiome(DATA, biome)) surface.add(id);
  }
  const ironOnSurface = [...surface].filter(id => (DATA.nodeKinds[id].resources || {}).iron_ore);
  assert.ok(ironOnSurface.length, 'there is no iron on the surface at all');
  for (const id of ironOnSurface) {
    assert.ok((DATA.nodeKinds[id].hardness ?? 0) <= 1,
      `${id} holds iron ore, is on the surface and needs a tier ${DATA.nodeKinds[id].hardness} tool`);
  }
});

test('an indoors seam is underground and a placed-only seam is nowhere in the scatter', () => {
  const surface = new Set(kindsForBiome(DATA, 'grassland').map(([id]) => id));
  assert.ok(!surface.has('deep_vein'), 'the deep vein is still scattered on open grassland');
  assert.ok(!surface.has('rare_seam'), 'the rare seam is scattered as well as placed');
  const under = new Set(kindsForBiome(DATA, 'grassland', { indoors: true }).map(([id]) => id));
  assert.ok(under.has('deep_vein'), 'the deep vein is now nowhere at all, which is worse');
  // …and the dungeon patch really can hold one
  const vein = placedNode({ data: DATA, rng: makeRng(4), kindId: 'deep_vein', x: 5, z: 5 });
  const patch = createNodePatch([vein], DATA);
  assert.equal(patch.at(5, 5)?.id, vein.id);
  assert.equal(patch.near(200, 200, 10).length, 0);
});

test('a refusal says what tool you need AND where that tool comes from', () => {
  // "How do I get steel if I can't mine iron?" is a question the old message could not answer,
  // because nothing anywhere in Farhold says the tool tier is read off the weapon in your hands.
  const spire = placedNode({ data: DATA, rng: makeRng(2), kindId: 'crystal_spire', x: 0, z: 0 });
  const why = haulReport(spire, { data: DATA, tool: 'iron_tool' }).why;
  assert.match(why, /Steel Tool/);
  assert.match(why, /weapon/i, 'the refusal does not say where a tool tier comes from');
  assert.match(why, /Alloy Forge/, 'the refusal does not say how to get steel');
  // and bare hands do not read as "too hard for a Bare Hands"
  const outcrop = placedNode({ data: DATA, rng: makeRng(3), kindId: 'ore_outcrop', x: 0, z: 0 });
  assert.match(haulReport(outcrop, { data: DATA, tool: 'hands' }).why, /by hand/);
  // every tool says where it comes from, or the message above is empty for that tier
  for (const [id, t] of Object.entries(DATA.tools)) assert.ok(t.from, `${id} does not say where it comes from`);
});

// ---------------------------------------------------------------- the walk, not the line

/** A world with a lake in the middle of it, and a hill you cannot get a cart up. */
const pond = {
  underwater: (x, z) => x > 20 && x < 60 && z > -40 && z < 40,
  slopeAt: (x) => (x > 100 && x < 140 ? 0.9 : 0.1),
};

test('a haul route walks round the water instead of through it', () => {
  const straight = findHaulPath({ from: { x: 0, z: 0 }, to: { x: 100, z: 0 }, terrain: null });
  assert.equal(straight.metres, 100);
  assert.equal(straight.direct, true);

  const round = findHaulPath({ from: { x: 0, z: 0 }, to: { x: 100, z: 0 }, terrain: pond });
  assert.equal(round.ok, true);
  assert.ok(round.metres > 120, `the path is ${round.metres} m — it went straight across the lake`);
  // …and not one of its points is standing in it
  const inner = round.points.slice(1, -1);
  assert.ok(inner.every(([x, z]) => !pond.underwater(x, z)), 'the route walks on water');
});

test('a cliff is a wall, and somewhere with no way to it answers instead of searching the planet', () => {
  const walled = { underwater: () => false, slopeAt: (x) => (x > 20 && x < 400 ? 0.95 : 0.1) };
  const out = findHaulPath({ from: { x: 0, z: 0 }, to: { x: 500, z: 0 }, terrain: walled, budget: 1500 });
  assert.equal(out.ok, false);
  assert.ok(out.why);
  assert.ok(stepCost(0) < stepCost(0.5), 'a bank costs no more than the flat');
  assert.ok(MAX_SLOPE < 1);
});

test('the best store is the one that DELIVERS most, not the one that is nearest', () => {
  const pools = [
    { id: 'near', x: 40, z: 0 },      // straight across the lake: a long walk round
    { id: 'far', x: -70, z: 0 },      // further as the crow flies, clear ground all the way
  ];
  const pick = bestStoreFor({
    from: { x: 0, z: 0 }, pools, terrain: pond,
    rateFor: metres => ({ perSecond: 1 / Math.max(1, metres) }),
  });
  assert.equal(pick.pool.id, 'far', 'it picked the crate on the far side of the lake');
  // the pool the drill is standing in wins outright — there is no trip at all
  const inside = bestStoreFor({ from: { x: 0, z: 0 }, pools, terrain: pond, insidePoolId: 'near' });
  assert.equal(inside.direct, true);
});

// ---------------------------------------------------------------- the route lays itself

function rig({ metres = 40, terrain = null } = {}) {
  const stores = createStoreNetwork({ power: POWER, materials: DATA });
  const node = placedNode({ data: DATA, kindId: 'ore_outcrop', x: 0, z: 0, band: 'medium' });
  node.id = 'seam1';
  node.infinite = true;
  const ore = { byId: id => (id === node.id ? node : null), noteWorked() {} };
  const drill = { id: 'd1', name: 'Drill', x: 0, z: 0, powered: true };
  stores.add({ id: 'c1', type: 'storage_crate', name: 'Crate', x: metres, z: 0 });
  const mining = createMining({ data: DATA, ore, stores, terrain });
  mining.bindDrill(drill, node);
  return { mining, stores, drill, node };
}

test('a drill lays its own route, with no Route tool and no clicks', () => {
  const { mining } = rig({ metres: 60 });
  const out = mining.autoRoute('d1');
  assert.equal(out.ok, true, out.why);
  assert.equal(mining.routes.length, 1);
  assert.ok(mining.routes[0].rate.perMinute > 0);
});

test('with nowhere to send it, the drill says what to build rather than failing silently', () => {
  const stores = createStoreNetwork({ power: POWER, materials: DATA });
  const node = placedNode({ data: DATA, kindId: 'ore_outcrop', x: 0, z: 0 });
  node.id = 's';
  const mining = createMining({ data: DATA, ore: { byId: () => node, noteWorked() {} }, stores });
  mining.bindDrill({ id: 'd1', name: 'Drill', x: 0, z: 0, powered: true }, node);
  const out = mining.autoRoute('d1');
  assert.equal(out.ok, false);
  assert.match(out.why, /storage/i);
});

test('re-routing a drill moves it rather than refusing — the Route tool is an override', () => {
  const { mining, stores } = rig({ metres: 30 });
  stores.add({ id: 'c2', type: 'storage_crate', name: 'Far Crate', x: 300, z: 0 });
  mining.autoRoute('d1');
  const first = mining.routes[0].toPoolId;
  const pool2 = stores.pools().find(p => p.members.some(m => m.id === 'c2'));
  const again = mining.route('d1', pool2.id);
  assert.equal(again.ok, true, again.why);
  assert.equal(mining.routes.length, 1, 'the drill ended up with two routes');
  assert.notEqual(mining.routes[0].toPoolId, first);
});

test('the route the panel draws is the route the rate was worked out from', () => {
  const { mining } = rig({ metres: 90, terrain: pond });
  mining.autoRoute('d1');
  const row = mining.overview()[0];
  assert.ok(row.route, 'no route on the overview row');
  assert.ok(row.route.points.length >= 2, 'the route has no path to draw');
  let drawn = 0;
  for (let i = 0; i + 1 < row.route.points.length; i++) {
    const [ax, az] = row.route.points[i], [bx, bz] = row.route.points[i + 1];
    drawn += Math.hypot(bx - ax, bz - az);
  }
  assert.ok(Math.abs(drawn - row.route.metres) < 1.5, 'the drawn path is not the measured one');
  assert.ok(row.route.detour > 1, 'the lake cost the route nothing');
});

// ---------------------------------------------------------------- what a prop is made of

test('the harvest table is complete, honest, and only ever drops real materials', async () => {
  // js/props.js needs Three.js, so the table is read out of the source rather than imported. It is
  // a plain literal on purpose — this is exactly the check that keeps it one.
  const src = readFileSync(new URL('../js/props.js', import.meta.url), 'utf8');
  const block = src.match(/export const PROP_HARVEST = \{([\s\S]*?)\n\};/);
  assert.ok(block, 'PROP_HARVEST is no longer a plain literal this test can read');
  const rows = [...block[1].matchAll(/^\s{2}(\w+):\s*\{(.*)\},$/gm)];
  assert.ok(rows.length >= 12, `only ${rows.length} props can be harvested`);
  for (const [, key, body] of rows) {
    const drops = [...body.matchAll(/(\w+):\s*[\d.]+/g)].map(m => m[1])
      .filter(k => !['hp', 'tier', 'regrow'].includes(k));
    assert.ok(drops.length, `${key} drops nothing`);
    for (const id of drops) assert.ok(DATA.materials[id], `${key} drops "${id}", which is not a material`);
    assert.match(body, /hp:\s*\d/, `${key} has no health`);
    assert.match(body, /tier:\s*[0-3]/, `${key} has no tool tier`);
    assert.match(body, /verb:\s*'/, `${key} has no verb, so the log line cannot be written`);
  }
  // a rock and a boulder never come back; a wood is a crop
  assert.match(block[1], /boulder:.*regrow: null/, 'a broken boulder regrows');
  assert.match(block[1], /broadleaf:.*regrow: \d/, 'a felled wood never comes back');
});

test('the scatter and the harvest agree about what a tree is worth', () => {
  // A felled tree gives logs and the ore data's own `tree` node gives logs. If those two ever
  // disagree the player has two different prices for timber and no way to tell which is real.
  const src = readFileSync(new URL('../js/props.js', import.meta.url), 'utf8');
  assert.match(src, /broadleaf: \{[^}]*log:/, 'a broadleaf no longer drops timber');
  assert.ok(DATA.nodeKinds.tree.resources.log, 'the tree seam no longer gives logs');
});

// ---------------------------------------------------------------- the scatter itself

test('a whole tile of surface seams is workable with a starting weapon', () => {
  const nodes = createNodeField({
    data: DATA, rng: makeRng(99), area: { x: 0, z: 0, radius: 256 },
    biome: 'hills', band: 'medium', count: 40,
  });
  assert.ok(nodes.length > 10);
  const stuck = nodes.filter(n => {
    const r = haulReport(n, { data: DATA, tool: 'iron_tool' });
    return !r.workable && !DATA.nodeKinds[n.kind]?.handMinable === false;
  });
  // crystal, obsidian and meteoric iron are meant to be a "come back later" — but nothing that
  // holds iron ore may be, and that is what the first test in this file pins down
  for (const n of stuck) {
    assert.ok(!(DATA.nodeKinds[n.kind].resources || {}).iron_ore,
      `${n.kind} on the surface holds iron and cannot be worked`);
  }
  // …and a swing with the right tool really does produce something
  const easy = nodes.find(n => haulReport(n, { data: DATA, tool: 'iron_tool' }).workable);
  assert.ok(mine(easy, 2, { data: DATA, tool: 'iron_tool' }).got > 0);
});

// ---------------------------------------------------------------- one vocabulary for materials

test('EVERY build cost is a material this game actually produces', () => {
  /**
   * The thirteenth join of this kind, and the one that makes felling a tree pointless.
   *
   * `data/structures.json` says it in its own header: "the ids in `cost` are a CONTRACT, not an
   * inventory. §1 (gathering) and §2 (refining) … will decide where `iron` or `plank` actually
   * comes from." They decided — on `iron_ingot`, `log`, `machine_part`, `cut_stone` — and nobody
   * went back and joined the two vocabularies. So a palisade cost 6 `timber` and nothing in the
   * game had ever produced one unit of anything called `timber`.
   *
   * This is the rule that keeps it joined: a cost you cannot obtain is not a price, it is a wall.
   */
  const aligned = alignCatalogue(STRUCTURES, DATA);
  const made = new Set();
  for (const r of REFINING.recipes) for (const id of Object.keys(r.outputs || {})) made.add(id);
  const dug = new Set();
  for (const kind of Object.values(DATA.nodeKinds)) for (const id of Object.keys(kind.resources || {})) dug.add(id);

  for (const piece of aligned.structures) {
    for (const id of Object.keys(piece.cost || {})) {
      assert.ok(DATA.materials[id], `${piece.id} costs "${id}", which is not a material`);
      assert.ok(made.has(id) || dug.has(id),
        `${piece.id} costs "${id}", which is neither dug out of the ground nor made at a bench`);
    }
  }
});

test('the alias table is honest: every short name points at a real material, both ways', () => {
  for (const [short, real] of Object.entries(MATERIAL_ALIASES)) {
    assert.ok(DATA.materials[real], `the alias ${short} -> ${real} points at nothing`);
    assert.ok(!DATA.materials[short], `${short} is BOTH a short name and a real material — pick one`);
  }
  // the catalogue's own short names are exactly the ones that needed aliasing, and no more
  const shortNames = new Set();
  for (const piece of STRUCTURES.structures) for (const id of Object.keys(piece.cost || {})) {
    if (!DATA.materials[id]) shortNames.add(id);
  }
  for (const id of shortNames) assert.ok(MATERIAL_ALIASES[id], `the catalogue spends "${id}" and nothing aliases it`);
});

test('aligning a catalogue twice is the same as aligning it once, and keeps the readable names', () => {
  const once = alignCatalogue(STRUCTURES, DATA);
  const twice = alignCatalogue(once, DATA);
  assert.deepEqual(twice.structures.map(s => s.cost), once.structures.map(s => s.cost));
  assert.equal(realCost({ timber: 6 }).log, 6);
  assert.equal(realCost({ log: 6 }).log, 6, 'realCost is not idempotent');
  // a fence is still made of timber on screen, whatever the storage pool calls it
  assert.equal(once.materials.log.name, 'Timber');
  assert.equal(once.materials.iron_ingot.name, 'Iron Ingot');
});
