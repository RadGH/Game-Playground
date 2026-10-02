// node --test prototypes/farhold/tests/round28-building.test.js
//
// Round 28, the building half: walls that close at their corners, gates that are gates and not
// gaps, fences and hedges laid as runs, Move that keeps a piece's id, Upgrade limited to walls,
// a floor that refuses when its ground cannot be levelled, built walls that collide as the shape
// that is drawn, and the key strip / live line every tool shows.
//
// Every test here moves the rule and asks the module, rather than comparing the data file to a
// constant (see the memory note "testing dead data rules").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  createBuildPlan, makeBag, runSpots, runPiecesClash, solidsFor, lineSpots, boxesOverlap, upgradeCost, realCost,
} from '../js/buildplan.js';
import { createTerraform } from '../js/terraform.js';
import { ObstacleField } from '../js/collide.js';
import { keysForTool, liveLine, BUILD_KEYS } from '../js/build-keys.js';
import { TOOLS } from '../js/build-ui.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalogue = JSON.parse(readFileSync(join(here, '../data/structures.json'), 'utf8'));
const def = id => catalogue.structures.find(s => s.id === id);

const flat = { heightAt: () => 0, slopeAt: () => 0, waterAt: () => null };
/** A purse holding plenty of every material anything in the catalogue costs. */
const rich = () => {
  const all = {};
  for (const s of catalogue.structures) for (const k of Object.keys(realCost(s.cost))) all[k] = 1e6;
  return makeBag(all);
};
const planOf = (opts = {}) => createBuildPlan({ catalogue, terrain: flat, store: rich(), ...opts });

// ------------------------------------------------------------------ wall runs close at the corners

test('a wall run lays every section, corners included, for every run piece and every shape', () => {
  const shapes = {
    L: [[0, 0], [10, 0], [10, 10]],
    square: [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    shortLeg: [[0, 0], [5, 0]],                       // not a whole number of sections long
    sharp: [[0, 0], [7, 3], [2, 9]],                   // an acute corner
  };
  const runs = catalogue.structures.filter(s => s.run && !s.road);
  assert.ok(runs.some(s => s.cat === 'decor'), 'no decor run piece to test (fence / hedge)');
  for (const piece of runs) {
    for (const [name, points] of Object.entries(shapes)) {
      const plan = planOf();
      const res = plan.run({ id: piece.id, points });
      const want = runSpots(piece, points).length;
      assert.equal(res.skipped.length, 0, `${piece.id} ${name}: ${res.skipped[0]?.why}`);
      assert.equal(res.placed.length, want, `${piece.id} ${name}: laid ${res.placed.length} of ${want}`);
    }
  }
});

test('the corner rule still refuses a wall on top of a wall, or alongside it closer than its depth', () => {
  const plan = planOf();
  plan.run({ id: 'palisade', points: [[0, 0], [10, 0]] });
  assert.equal(plan.check({ id: 'palisade', x: 3, z: 0, rot: 0 }).ok, false, 'a section laid on top of a section');
  assert.equal(plan.check({ id: 'palisade', x: 3, z: 0.3, rot: 0 }).ok, false, 'a section 0.3 m alongside a 0.5 m wall');
  assert.equal(plan.check({ id: 'palisade', x: 3, z: 1.2, rot: 0 }).ok, true, 'a parallel wall a step away');
  // and the trim is a property of run pieces only: a crate still may not overlap the wall at all
  assert.equal(plan.check({ id: 'storage_crate', x: 4, z: 0.5, rot: 0 }).ok, false);
  assert.ok(runPiecesClash({ x: 0, z: 0, w: 2, d: 0.5, rot: 0 }, { x: 0.2, z: 0, w: 2, d: 0.5, rot: 0 }));
  assert.ok(!runPiecesClash({ x: 0, z: 0, w: 2, d: 0.5, rot: 0 }, { x: 1.7, z: 0, w: 2, d: 0.5, rot: 0 }));
});

// ------------------------------------------------------------------ a gap is not a gate

test('a gate clicked at a corner is laid, at its own width, and the wall closes up to its posts', () => {
  for (const [wallId, gateId] of [['palisade', 'gate'], ['stone_wall', 'gate'], ['fence', 'fence_gate'], ['hedge', 'fence_gate']]) {
    assert.equal(def(wallId).gateId, gateId, `${wallId} names its gate`);
    for (const corner of [0, 1, 2]) {
      const plan = planOf();
      const res = plan.run({ id: wallId, points: [[0, 0], [12, 0], [12, 12]], gateCorners: [corner] });
      const gates = res.placed.filter(e => e.key === gateId);
      assert.equal(gates.length, 1, `${wallId} corner ${corner}: ${gates.length} gates, refused: ${res.skipped.map(s => s.why)}`);
      assert.equal(res.skipped.length, 0, `${wallId} corner ${corner}: ${res.skipped[0]?.why}`);
      // the gate stands on the run's line, and no section stands inside its opening
      const g = gates[0], gd = def(gateId);
      for (const e of res.placed) {
        if (e === g) continue;
        assert.ok(!boxesOverlap({ ...g, w: gd.w - 0.4, d: 0.05 }, { x: e.x, z: e.z, w: e.w, d: 0.05, rot: e.rot }, 1e-6),
          `${wallId} corner ${corner}: a ${e.key} stands in the gate's opening`);
      }
    }
  }
});

test('a gate fits on a leg too short for its width, and the old gateAt form makes a gate, not a gap', () => {
  // the roast's case: gateAt:[2] on a palisade swapped a 4 m gate into a 2 m slot and got refused
  const plan = planOf();
  const res = plan.run({ id: 'palisade', points: [[0, 0], [12, 0]], gateAt: [2] });
  assert.equal(res.skipped.length, 0, res.skipped[0]?.why);
  assert.equal(res.placed.filter(e => e.key === 'gate').length, 1, 'gateAt made no gate');
  // a 4 m gate on a 4 m leg is the whole leg
  const short = planOf().run({ id: 'palisade', points: [[0, 0], [4, 0], [4, 8]], gateCorners: [0] });
  assert.equal(short.skipped.length, 0, short.skipped[0]?.why);
  assert.equal(short.placed.filter(e => e.key === 'gate').length, 1);
  // runBill prices the same spots the run lays
  const bill = planOf().runBill({ id: 'fence', points: [[0, 0], [10, 0]], gateCorners: [0] });
  assert.equal(bill.gates, 1);
  assert.equal(bill.count, runSpots(def('fence'), [[0, 0], [10, 0]], { gateCorners: [0], gateDef: def('fence_gate') }).length);
});

// ------------------------------------------------------------------ what is solid

test('a built gate is two posts with an opening a body fits through; a wall is a segment', () => {
  const gate = solidsFor({ x: 0, z: 0, rot: 0 }, def('gate'));
  assert.equal(gate.length, 2);
  const gap = Math.hypot(gate[1].x - gate[0].x, gate[1].z - gate[0].z) - gate[0].r - gate[1].r;
  assert.ok(gap > 1.6, `the opening is ${gap.toFixed(2)} m`);
  const fgate = solidsFor({ x: 0, z: 0, rot: 0 }, def('fence_gate'));
  const fgap = Math.hypot(fgate[1].x - fgate[0].x, fgate[1].z - fgate[0].z) - fgate[0].r - fgate[1].r;
  assert.ok(fgap > 0.9, `a fence gate's opening is ${fgap.toFixed(2)} m`);
  const wall = solidsFor({ x: 0, z: 0, rot: Math.PI / 2 }, def('palisade'));
  assert.equal(wall[0].kind, 'seg');
  assert.ok(Math.abs(Math.hypot(wall[0].bx - wall[0].ax, wall[0].bz - wall[0].az) - 2) < 1e-9);
});

test('a floorless band is a wall you can jump and that nothing without feet walks through', () => {
  const f = new ObstacleField().setGround(() => 0);
  f.addSegment(-1, 0, 1, 0, 0.25, 1.1, { band: [-Infinity, 1.1 - 0.35] });
  const out = [0, 0];
  // an enemy (no feet) walking into it is pushed out, and cannot step through it in one frame
  f.resolve(0, 0.1, 0.4, out);
  assert.ok(Math.abs(out[1]) >= 0.65 - 1e-6, 'a body with no feet stood inside the fence');
  f.resolve(0, -0.7, 0.4, out, null, [0, 0.7]);
  assert.ok(out[1] > 0, 'stepped clean through the fence in one frame');
  assert.ok(f.blocked(0, 0, 0.4), 'blocked() does not see it');
  // a player whose feet are above its top goes over
  f.resolve(0, 0.1, 0.4, out, 1.0);
  assert.equal(out[1], 0.1);
  // a rail (a finite band) is unchanged: it never stops a body that does not say where its feet are
  const rail = new ObstacleField().setGround(() => 0);
  rail.addSegment(-1, 0, 1, 0, 0.25, 1, { band: [2, 3] });
  rail.resolve(0, 0.1, 0.4, out);
  assert.equal(out[1], 0.1);
});

// ------------------------------------------------------------------ ground

test('a floor is refused, not placed floating, when the claim cannot reshape any more ground', () => {
  const terrain = { heightAt: (x) => x * 0.3, slopeAt: () => 0.3, waterAt: () => null };
  const tf = createTerraform();
  // move the knob: one square metre of reshaping per claim (the plan hands the catalogue's rules
  // to the terraform book, so the knob is turned in the catalogue)
  const cat1 = structuredClone(catalogue);
  cat1.rules.terraformBudget = 1;
  const plan = createBuildPlan({ catalogue: cat1, terrain: tf.wrap(terrain), terraform: tf, store: rich() });
  const flatPiece = catalogue.structures.find(s => s.flatten && s.flatten !== 'pit' && s.flatten !== 'strip' && !s.needs && !s.power);
  const res = plan.place({ id: flatPiece.id, x: 20, z: 0, rot: 0 });
  assert.equal(res.ok, false, `${flatPiece.id} was placed on ground nobody levelled`);
  assert.equal(plan.entries.length, 0);
  assert.equal(plan.claims.length, 0, 'a refused placement left an empty outpost behind');
});

test('a small hummock levels itself; a big drop still asks for the Level tool', () => {
  const bump = { heightAt: x => x * 0.4, slopeAt: () => 0.4, waterAt: () => null };
  const tf = createTerraform();
  const plan = createBuildPlan({ catalogue, terrain: tf.wrap(bump), terraform: tf, store: rich() });
  const c = plan.check({ id: 'storage_crate', x: 0, z: 0, rot: 0 });
  assert.equal(c.ok, true, c.why);
  assert.equal(c.levels, true);
  const res = plan.place({ id: 'storage_crate', x: 0, z: 0, rot: 0 });
  assert.ok(res.ok && res.levelled && res.tf.length, 'it was placed without levelling');
  const cliff = { heightAt: x => (x > 0 ? 4 : 0), slopeAt: () => 1, waterAt: () => null };
  const p2 = createBuildPlan({ catalogue, terrain: cliff, terraform: createTerraform(), store: rich() });
  assert.match(p2.check({ id: 'storage_crate', x: 0, z: 0, rot: 0 }).why, /Level it first/);
});

// ------------------------------------------------------------------ move keeps the id

test('Move keeps the piece id, charges nothing, and refuses anything a system keeps a position for', () => {
  const bag = rich();
  const plan = createBuildPlan({ catalogue, terrain: flat, store: bag });
  const statue = catalogue.structures.find(s => s.cat === 'decor' && !s.run && !s.store && !s.power && s.h > 0.5);
  const placed = plan.place({ id: statue.id, x: 0, z: 0, rot: 0 }).entry;
  const before = JSON.stringify(bag.contents());
  const mv = plan.relocate(placed.id, { x: 9, z: 4, rot: Math.PI / 2 });
  assert.ok(mv.ok, mv.why);
  assert.equal(mv.entry.id, placed.id, 'the moved piece has a new id');
  assert.equal(plan.entries.length, 1);
  assert.deepEqual([mv.entry.x, mv.entry.z], [9, 4]);
  assert.deepEqual(mv.from, { x: 0, z: 0, rot: 0 });
  assert.equal(JSON.stringify(bag.contents()), before, 'moving cost something');
  // it does not collide with where it used to stand, and it cannot be dropped inside a neighbour
  plan.place({ id: statue.id, x: 0, z: 0, rot: 0 });
  assert.equal(plan.relocate(placed.id, { x: 0, z: 0 }).ok, false);
  for (const id of ['storage_crate', 'furnace']) {
    if (!def(id)) continue;
    const e = plan.place({ id, x: 30 + (id.length * 7), z: 0, rot: 0 }).entry;
    assert.equal(plan.movable(e).ok, false, `${id} could be moved`);
    assert.equal(plan.relocate(e.id, { x: 60, z: 30 }).ok, false);
  }
});

// ------------------------------------------------------------------ upgrade is walls only

test('Upgrade turns a wall into the next one where it stands, for the difference, and nothing else', () => {
  const bag = rich();
  const plan = createBuildPlan({ catalogue, terrain: flat, store: bag });
  const run = plan.run({ id: 'palisade', points: [[0, 0], [8, 0]] });
  const mid = run.placed[1];
  const up = plan.upgrade(mid.id);
  assert.ok(up.ok, up.why);
  assert.equal(up.entry.id, mid.id);
  assert.equal(up.entry.key, 'stone_wall');
  assert.equal(up.entry.maxHp, def('stone_wall').hp || 0);
  assert.deepEqual(up.paid, upgradeCost(def('palisade').cost, def('stone_wall').cost));
  // every upgradesTo in the catalogue is a run piece going to a run piece
  for (const s of catalogue.structures.filter(x => x.upgradesTo)) {
    assert.ok(s.run && def(s.upgradesTo)?.run, `${s.id} → ${s.upgradesTo} is not a wall-to-wall upgrade`);
  }
  // and the rule is in the code, not only the data: give a turret an upgradesTo and ask
  const cat2 = structuredClone(catalogue);
  const turret = cat2.structures.find(s => s.turret);
  turret.upgradesTo = cat2.structures.find(s => s.turret && s.id !== turret.id).id;
  const p2 = createBuildPlan({ catalogue: cat2, terrain: flat, store: rich() });
  const t = p2.place({ id: turret.id, x: 0, z: 0, rot: 0 });
  assert.ok(t.ok, t.why);
  assert.equal(p2.upgradeOf(t.entry).ok, false, 'a turret was upgraded in place');
});

// ------------------------------------------------------------------ lines, mounts, keys

test('a Shift+click line is spaced by the footprint along the line and capped', () => {
  assert.equal(lineSpots({ w: 2, d: 0.2, from: { x: 0, z: 0 }, to: { x: 10, z: 0 }, rot: 0 }).length, 5);
  assert.equal(lineSpots({ w: 2, d: 0.2, from: { x: 0, z: 0 }, to: { x: 10, z: 0 }, rot: Math.PI / 2 }).length, 33);
  assert.equal(lineSpots({ w: 1, d: 1, from: { x: 0, z: 0 }, to: { x: 500, z: 0 }, max: 40 }).length, 40);
  const plan = planOf();
  plan.place({ id: 'lamp_post', x: 0, z: 0, rot: 0 });
  const line = plan.placeLine({ id: 'lamp_post', from: plan.entries[0], to: { x: 12, z: 0 } });
  assert.ok(line.placed.length >= 5, `${line.placed.length} lamps`);
});

test('a wall-mounted piece hangs on a wall when there is one, and stands on open ground when not', () => {
  const plan = planOf();
  const mounted = catalogue.structures.find(s => s.snap === 'wall' && !s.needs);
  assert.ok(mounted, 'no snap: wall piece');
  plan.run({ id: 'stone_wall', points: [[0, 0], [10, 0]] });
  const on = plan.snap({ id: mounted.id, x: 5, z: 1.2 });
  assert.ok(on.mount, 'it did not find the wall');
  assert.ok(on.z > 0.4 && on.z < 1.2, `it hangs ${on.z} m off the wall`);
  const off = plan.snap({ id: mounted.id, x: 40, z: 40 });
  assert.ok(!off.mount);
  assert.equal(plan.check({ id: mounted.id, x: off.x, z: off.z, rot: off.rot }).ok, true, 'it cannot stand on open ground');
});

test('every tool has a key strip, and the live line says what a run will cost before Enter', () => {
  for (const t of TOOLS) assert.ok(keysForTool(t.key).length > 10, `${t.key} has no key strip`);
  assert.equal(keysForTool('build', { moving: true }), BUILD_KEYS.moving);
  assert.match(keysForTool('wall'), /twice for a gate/);
  // no Alt anywhere — releasing it hands the browser's menu bar the focus
  for (const s of Object.values(BUILD_KEYS)) assert.doesNotMatch(s, /Alt/);
  const fake = { tool: 'wall', runInfo: { metres: 12.4, count: 6, gates: 1, text: '30 log', ok: true } };
  assert.equal(liveLine(fake).text, '12 m · 6 sections, 1 gate · 30 log');
  const red = { tool: 'build', selected: 'x', lastCheck: { x: 0, ok: false, why: 'You cannot build on water.' } };
  assert.deepEqual(liveLine(red), { text: 'You cannot build on water.', tone: 'bad' });
  const amber = { tool: 'build', selected: 'x', lastCheck: { x: 0, ok: true, levels: true } };
  assert.equal(liveLine(amber).tone, 'level');
});

test('the costs a run and an upgrade quote are in the materials the pools hold', () => {
  const plan = planOf();
  const bill = plan.runBill({ id: 'palisade', points: [[0, 0], [10, 0]] });
  for (const k of Object.keys(bill.cost)) assert.ok(!(k in { timber: 1, iron: 1, block: 1 }), `${k} is a catalogue short name`);
  assert.deepEqual(Object.keys(upgradeCost(def('fence').cost, def('palisade').cost)).sort(),
    Object.keys(realCost(def('palisade').cost)).filter(k => realCost(def('palisade').cost)[k] > (realCost(def('fence').cost)[k] || 0)).sort());
});
