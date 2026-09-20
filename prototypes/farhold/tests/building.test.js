// node --test prototypes/farhold/tests/building.test.js
//
// The building expansion's rules, checked where they are written rather than where they are drawn.
// `js/terraform.js`, `js/buildplan.js` and `js/portal.js` have no Three.js in them precisely so
// that these can run: the things worth testing here are not how a brazier looks, they are
//
//   * a terrain edit survives a save and comes back as the same ground (§4.13);
//   * a structure never floats and never intersects another (§4.6);
//   * exactly one portal exists, always (§6.3), and it survives a reload (§6.11);
//   * a waypoint the player built joins the same network as the towns' (§5.8) and a dark one
//     cannot be travelled to (§5.10).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createTerraform, applyEdit, areaOf, rectDist, segmentHit } from '../js/terraform.js';
import { createBuildPlan, makeBag, boxesOverlap, cornersOf, scaleCost, MATERIAL_ALIASES } from '../js/buildplan.js';
import { createPortals, nudgeTo } from '../js/portal.js';
import { createWaypoints } from '../js/waypoints.js';

const here = dirname(fileURLToPath(import.meta.url));
const catalogue = JSON.parse(readFileSync(join(here, '../data/structures.json'), 'utf8'));

/**
 * A stand-in planet: rolling noise, no libraries, same shape as the object `js/planet.js` returns.
 * Bumpy enough that nothing in the catalogue will sit on it untouched, which is the point.
 */
function fakeTerrain({ amplitude = 6 } = {}) {
  const natural = (x, z) => Math.sin(x * 0.11) * amplitude + Math.cos(z * 0.09) * amplitude * 0.7;
  const t = {
    heightAt: natural,
    waterAt: () => null,
  };
  t.slopeAt = (x, z, step = 3) => {
    const l = t.heightAt(x - step, z), r = t.heightAt(x + step, z);
    const u = t.heightAt(x, z - step), d = t.heightAt(x, z + step);
    return Math.hypot(r - l, d - u) / (2 * step);
  };
  return t;
}

/** The steepest spot in a patch of the fake world — so "too steep to build on" proves something. */
function steepSpot(terrain, { from = 0, to = 60, step = 3 } = {}) {
  let best = { x: from, z: from, slope: -1 };
  for (let x = from; x < to; x += step) {
    for (let z = from; z < to; z += step) {
      const slope = terrain.slopeAt(x, z, 2);
      if (slope > best.slope) best = { x, z, slope };
    }
  }
  return best;
}

// ---------------------------------------------------------------- terrain deltas

test('the smoothing tool actually levels ground, and eases out at the edge', () => {
  const terrain = fakeTerrain();
  const ground = createTerraform();
  const target = terrain.heightAt(100, 100);
  const res = ground.level({ x: 100, z: 100, r: 10, h: target, feather: 5 });
  assert.equal(res.ok, true);

  // dead flat inside the radius
  for (const [dx, dz] of [[0, 0], [6, 0], [0, -8], [5, 5]]) {
    const h = ground.apply(100 + dx, 100 + dz, terrain.heightAt(100 + dx, 100 + dz));
    assert.ok(Math.abs(h - target) < 1e-6, `not level at ${dx},${dz}: ${h} vs ${target}`);
  }
  // partly pulled in the feather, untouched beyond it
  const mid = ground.apply(112.5, 100, terrain.heightAt(112.5, 100));
  assert.notEqual(mid, terrain.heightAt(112.5, 100));
  const outside = ground.apply(130, 100, terrain.heightAt(130, 100));
  assert.equal(outside, terrain.heightAt(130, 100), 'the brush reached past its own feather');
});

test('terrain deltas survive a save and rebuild the same ground', () => {
  const terrain = fakeTerrain();
  const a = createTerraform();
  a.level({ x: 40, z: -20, r: 9, h: 3, claim: 'c1' });
  a.raise({ x: 55, z: -20, r: 5, amount: 2.5, claim: 'c1' });
  a.strip({ x1: 0, z1: 0, x2: 60, z2: 40, half: 3, h1: 1, h2: 8, claim: 'c1' });
  a.slab({ x: -30, z: 10, w: 8, d: 6, rot: 0.6, h: -2, claim: 'c1' });

  const json = JSON.parse(JSON.stringify(a.toJSON()));
  const b = createTerraform({ saved: json });
  assert.equal(b.count, 4);

  // 400 sample points across the whole edited area, including every feather and every gap
  for (let i = 0; i < 400; i++) {
    const x = -60 + (i * 37) % 160, z = -50 + (i * 53) % 120;
    const nat = terrain.heightAt(x, z);
    assert.ok(Math.abs(a.apply(x, z, nat) - b.apply(x, z, nat)) < 1e-3,
      `the ground changed over a save at ${x},${z}`);
  }
});

test('a delta stores brushes, not a heightfield — and stays small', () => {
  const ground = createTerraform();
  for (let i = 0; i < 40; i++) ground.level({ x: i * 12, z: 0, r: 8, h: i, claim: 'c1' });
  const bytes = JSON.stringify(ground.toJSON()).length;
  assert.ok(bytes < 6000, `40 edits cost ${bytes} bytes; a heightfield would be megabytes`);
  // and it is really the brush list, not sampled ground
  assert.equal(ground.toJSON().edits.length, 40);
  assert.ok(!('heights' in ground.toJSON()));
});

test('undo takes the last brush back, and a claim can be put back the way it was', () => {
  const ground = createTerraform();
  ground.level({ x: 0, z: 0, r: 6, h: 5, claim: 'c1' });
  ground.level({ x: 30, z: 0, r: 6, h: 5, claim: 'c2' });
  ground.undo();
  assert.equal(ground.count, 1);
  assert.equal(ground.apply(30, 0, 99), 99, 'the undone brush is still biting');

  ground.level({ x: 30, z: 0, r: 6, h: 5, claim: 'c2' });
  assert.equal(ground.removeClaim('c2'), 1);
  assert.equal(ground.apply(0, 0, 99), 5, "razing one claim took another claim's ground with it");
});

test('a claim may not reshape the whole planet', () => {
  const ground = createTerraform({ budget: 4000 });
  assert.equal(ground.level({ x: 0, z: 0, r: 20, h: 0, claim: 'c1' }).ok, true);
  const second = ground.level({ x: 200, z: 0, r: 20, h: 0, claim: 'c1' });
  assert.equal(second.ok, false);
  assert.match(second.why, /allows/);
  // …but a different claim has its own allowance
  assert.equal(ground.level({ x: 200, z: 0, r: 20, h: 0, claim: 'c2' }).ok, true);
});

test('wrapping a terrain puts the edits in front of height, slope and normal together', () => {
  const terrain = fakeTerrain();
  const ground = createTerraform();
  ground.wrap(terrain);
  const { x, z, slope: before } = steepSpot(terrain);
  ground.level({ x, z, r: 12, h: terrain.heightAt(x, z), feather: 6 });
  assert.ok(before > 0.2, 'the fake world was not bumpy enough to prove anything');
  assert.ok(terrain.slopeAt(x, z, 2) < 1e-6, 'the ground is level but still reads as a slope');
  const n = terrain.normalAt(x, z, 2);
  assert.ok(n[1] > 0.999, 'the normal did not follow the levelled ground');
});

test('the brush maths itself: areas, rectangles and segments', () => {
  assert.ok(Math.abs(areaOf({ shape: 'circle', reach: 10 }) - Math.PI * 100) < 1e-6);
  assert.equal(rectDist(0, 0, 0, 0, 4, 4, 0) < 0, true, 'inside a rectangle should be negative');
  assert.ok(Math.abs(rectDist(4, 0, 0, 0, 4, 4, 0) - 2) < 1e-6);
  const hit = segmentHit(5, 3, 0, 0, 10, 0);
  assert.equal(hit.dist, 3);
  assert.equal(hit.t, 0.5);
  // a raise is capped, so nobody builds a pillar to orbit
  const capped = createTerraform({ maxLift: 3 });
  capped.raise({ x: 0, z: 0, r: 4, amount: 99 });
  assert.ok(capped.apply(0, 0, 0) <= 3.0001);
  assert.equal(applyEdit({ shape: 'circle', kind: 'level', x: 0, z: 0, inner: 1, reach: 2, h: 7 }, 50, 50, 1), 1);
});

// ---------------------------------------------------------------- the catalogue

test('every structure in the catalogue is complete and its materials are declared', () => {
  const seen = new Set();
  const cats = Object.keys(catalogue.categories);
  for (const s of catalogue.structures) {
    assert.ok(!seen.has(s.id), `duplicate structure id ${s.id}`);
    seen.add(s.id);
    for (const field of ['name', 'cat', 'w', 'd', 'h', 'cost']) {
      assert.ok(s[field] !== undefined, `${s.id} has no ${field}`);
    }
    assert.ok(cats.includes(s.cat), `${s.id} is in category "${s.cat}", which does not exist`);
    assert.ok(s.w > 0 && s.d > 0 && s.h > 0, `${s.id} has no size`);
    assert.ok(Object.keys(s.cost).length > 0, `${s.id} is free`);
    for (const mat of Object.keys(s.cost)) {
      assert.ok(catalogue.materials[mat] || MATERIAL_ALIASES[mat],
        `${s.id} costs "${mat}", which is neither a declared material nor an alias for one`);
    }
    assert.ok(typeof s.desc === 'string' && s.desc.length > 10, `${s.id} has no description`);
  }
  // the document asks for roughly this much, and a shrunken catalogue is the failure mode
  assert.ok(catalogue.structures.filter(s => s.cat === 'decor' || s.cat === 'light').length >= 35,
    '§4c asks for about 35 decorative pieces');
  assert.ok(catalogue.structures.some(s => s.waypoint), '§5.5 needs a buildable waypoint pad');
  assert.ok(catalogue.structures.filter(s => s.light).length >= 8, 'street lights that genuinely light');
  assert.ok(catalogue.structures.filter(s => s.cat === 'defence').length >= 16, '§4e lists sixteen');
});

// ---------------------------------------------------------------- placement

/** A plan with unlimited materials on a levelled patch, which is most of what the rules need. */
function bench({ amplitude = 6 } = {}) {
  const terrain = fakeTerrain({ amplitude });
  const ground = createTerraform();
  ground.wrap(terrain);
  // no `store`: the default lets anything be built, so these tests are about the RULES
  const plan = createBuildPlan({ catalogue, terrain, terraform: ground });
  return { terrain, ground, plan };
}

test('you cannot build on Farhold until you have levelled it — and then you can', () => {
  const { terrain, ground, plan } = bench();
  const steep = steepSpot(terrain);
  const spot = { id: 'furnace', x: steep.x, z: steep.z, rot: 0 };
  const no = plan.check(spot);
  assert.equal(no.ok, false);
  assert.match(no.why, /steep|uneven/);

  ground.level({ x: spot.x, z: spot.z, r: 9, h: terrain.heightAt(spot.x, spot.z) });
  const yes = plan.check(spot);
  assert.equal(yes.ok, true, yes.why);
});

test('a structure never floats and never intersects another one', () => {
  const { terrain, ground, plan } = bench();
  ground.level({ x: 0, z: 0, r: 40, h: 10, feather: 10 });
  const tol = catalogue.rules.footingTolerance;

  const ids = ['furnace', 'anvil', 'storage_crate', 'lamp_post', 'watchtower', 'bench', 'statue'];
  let x = -24;
  for (const id of ids) {
    const def = plan.byId(id);
    const res = plan.place({ id, x, z: 0, rot: 0 });
    assert.equal(res.ok, true, `${id}: ${res.why}`);
    x += def.w + 3;
  }
  assert.equal(plan.entries.length, ids.length);

  for (const e of plan.entries) {
    // …it stands ON the ground
    assert.ok(Math.abs(e.y - terrain.heightAt(e.x, e.z)) < 1e-6, `${e.name} is not on the ground`);
    for (const [cx, cz] of cornersOf(e)) {
      assert.ok(Math.abs(terrain.heightAt(cx, cz) - e.y) <= tol + 1e-6,
        `${e.name} has a corner ${(terrain.heightAt(cx, cz) - e.y).toFixed(2)} m off the ground`);
    }
  }
  // …and no two of them share a square metre
  for (let i = 0; i < plan.entries.length; i++) {
    for (let j = i + 1; j < plan.entries.length; j++) {
      assert.equal(boxesOverlap(plan.entries[i], plan.entries[j]), false,
        `${plan.entries[i].name} stands inside ${plan.entries[j].name}`);
    }
  }
});

test('an overlapping placement is refused by name, and a rotated one too', () => {
  const { ground, plan } = bench();
  ground.level({ x: 0, z: 0, r: 30, h: 4, feather: 8 });
  assert.equal(plan.place({ id: 'sawmill', x: 0, z: 0, rot: 0 }).ok, true);
  const clash = plan.check({ id: 'anvil', x: 1, z: 0, rot: 0 });
  assert.equal(clash.ok, false);
  assert.match(clash.why, /inside the Sawmill/);
  // turned 90°, the sawmill's long side is now across the other axis — and still occupied
  assert.equal(plan.check({ id: 'anvil', x: 0, z: 1.2, rot: Math.PI / 2 }).ok, false);
  // clear of it is fine
  assert.equal(plan.check({ id: 'anvil', x: 6, z: 0, rot: 0 }).ok, true);
});

test('a piece that flattens its own ground may land on a slope, and does not float afterwards', () => {
  const { terrain, plan } = bench({ amplitude: 9 });
  const steep = steepSpot(terrain, { from: -40, to: 40 });
  const res = plan.place({ id: 'foundation', x: steep.x, z: steep.z, rot: 0.3 });
  assert.equal(res.ok, true, res.why);
  for (const [cx, cz] of cornersOf(res.entry)) {
    assert.ok(Math.abs(terrain.heightAt(cx, cz) - res.entry.y) < 0.01,
      'a foundation left its own corners in the air');
  }
  assert.ok(steep.slope > 0.2, 'the fake world was not steep enough to prove anything');
  // and now something that will NOT flatten can stand on it
  assert.equal(plan.check({ id: 'crafting_table', x: steep.x, z: steep.z, rot: 0.3 }).ok, true);
});

test('you are told what you are short of, and deconstruct gives most of it back', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const ground = createTerraform();
  ground.wrap(terrain);
  const bag = makeBag({ stone: 10, clay: 6 });
  const plan = createBuildPlan({ catalogue, terrain, terraform: ground, store: bag });

  const short = plan.check({ id: 'furnace', x: 0, z: 0 });      // wants 16 stone, 6 clay
  assert.equal(short.ok, false);
  assert.match(short.why, /short of 6 rough stone/);

  bag.give({ stone: 10 });
  const built = plan.place({ id: 'furnace', x: 0, z: 0 });
  assert.equal(built.ok, true, built.why);
  assert.equal(bag.have('stone'), 4);

  const back = plan.remove(built.entry.id);
  assert.equal(back.ok, true);
  assert.deepEqual(back.refund, scaleCost({ stone: 16, clay: 6 }, catalogue.rules.refund));
  assert.equal(bag.have('stone'), 4 + 12);
  assert.equal(plan.entries.length, 0);
});

test('undo is a full refund; the deconstruct tool is not', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const bag = makeBag({ plank: 20, iron_ingot: 20 });
  const plan = createBuildPlan({ catalogue, terrain, store: bag });
  plan.place({ id: 'crafting_table', x: 0, z: 0 });
  plan.undo();
  assert.equal(bag.have('plank'), 20, 'undo should cost nothing at all');
});

/**
 * ROUND 14 REWROTE THE SECOND HALF OF THIS TEST, AND THE REASON IS THE WHOLE POINT OF THE ROUND.
 *
 * It used to assert that building 400 m from home was REFUSED with "put down a claim stone first",
 * and then that placing a claim stone opened it up. That rule was a deadlock the moment you wanted a
 * second site: a claim stone cost two iron ingots, iron needs a furnace, and a furnace had to stand
 * inside a claim. The user hit it and said so, and the fix is to delete the rule rather than to
 * price it differently — *"I would rather just allow building arbitrarily anywhere."*
 *
 * So what is asserted now is the opposite: the far-away furnace goes down on its own, and doing so
 * makes a second group by itself. The waypoint rule is untouched, because one pad per place is about
 * the travel network and not about permission to build.
 */
test('you can build anywhere, and a cluster out on its own becomes its own outpost', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const plan = createBuildPlan({ catalogue, terrain });
  plan.place({ id: 'campfire', x: 0, z: 0 });
  assert.equal(plan.claims.length, 1, 'the first placement did not make a group');

  assert.equal(plan.place({ id: 'waypoint_pad', x: 12, z: 0 }).ok, true);
  const second = plan.check({ id: 'waypoint_pad', x: 26, z: 0 });
  assert.equal(second.ok, false);
  assert.match(second.why, /One per base/);

  // …and far away, with no stone, no permit and nothing but the ground rules
  const outside = plan.check({ id: 'furnace', x: 400, z: 400 });
  assert.equal(outside.ok, true, outside.why);
  assert.equal(plan.place({ id: 'furnace', x: 400, z: 400 }).ok, true);
  assert.equal(plan.claims.length, 2, 'a distant build should make its own group');

  // and the geometry agrees: two places, not one
  const posts = plan.outposts();
  assert.equal(posts.length, 2);
  assert.ok(posts.every(p => p.name && p.count > 0));
});

test('a wall run follows a polyline, corners itself and never overlaps', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const ground = createTerraform();
  ground.wrap(terrain);
  const plan = createBuildPlan({ catalogue, terrain, terraform: ground });
  plan.place({ id: 'claim_stone', x: 0, z: 0 });

  const res = plan.run({ id: 'palisade', points: [[-20, -20], [20, -20], [20, 20]] });
  assert.ok(res.placed.length >= 18, `only ${res.placed.length} sections went up`);
  const walls = plan.entries.filter(e => e.key === 'palisade');
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      assert.equal(boxesOverlap(walls[i], walls[j], 0.02), false, 'two wall sections overlap');
    }
  }
  // the run turned the corner: two different bearings are present
  const bearings = new Set(walls.map(w => Math.round(w.rot * 100)));
  assert.ok(bearings.size >= 2, 'the run did not corner');
});

test('a blueprint stamps the same cluster somewhere else', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const plan = createBuildPlan({ catalogue, terrain });
  plan.place({ id: 'claim_stone', x: 0, z: 0 });
  const a = plan.place({ id: 'furnace', x: 6, z: 0 }).entry;
  const b = plan.place({ id: 'anvil', x: 12, z: 0 }).entry;
  const bp = plan.blueprint([a.id, b.id], 'Smithy');
  assert.equal(bp.pieces.length, 2);
  /**
   * The bill is in MATERIAL ids, not the catalogue's short names.
   *
   * Round 13: the catalogue costs things in `timber`/`iron`/`parts` and the game produces `log`,
   * `iron_ingot`, `machine_part`, and the two had never been joined — a palisade cost six units of
   * a thing nothing in Farhold has ever made. `MATERIAL_ALIASES` is the join, and a bill comes back
   * in the words the storage pools and the refunds speak.
   */
  assert.deepEqual(plan.billFor(bp), { stone: 16, clay: 6, iron_ingot: 10, log: 3 });

  plan.place({ id: 'claim_stone', x: 300, z: 300 });
  const stamped = plan.stamp(bp, 300, 306, Math.PI / 2);
  assert.equal(stamped.placed.length, 2, JSON.stringify(stamped.skipped));
  // the two stamped pieces are the same distance apart as the originals
  const [p, q] = stamped.placed;
  assert.ok(Math.abs(Math.hypot(p.x - q.x, p.z - q.z) - Math.hypot(a.x - b.x, a.z - b.z)) < 1e-6);
});

test('lights only come from lit things, and go dark when the grid does', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const plan = createBuildPlan({ catalogue, terrain });
  plan.place({ id: 'lamp_post', x: 0, z: 0 });
  plan.place({ id: 'crystal_lamp', x: 8, z: 0 });         // this one draws power
  plan.place({ id: 'bench', x: 16, z: 0 });               // and this one is not a light at all
  assert.equal(plan.lights().length, 1, 'an unpowered crystal lamp was lighting the ground');

  plan.setPowered(plan.claims[0].id, true);
  const lit = plan.lights();
  assert.equal(lit.length, 2);
  const crystal = lit.find(l => l.range > 40);
  assert.ok(crystal, 'the crystal lamp should reach further than an oil lamp');
  assert.ok(crystal.y > 3, 'a lamp lights from its head, not from its feet');
});

test('the base survives a save', () => {
  const terrain = fakeTerrain({ amplitude: 0 });
  const plan = createBuildPlan({ catalogue, terrain });
  plan.place({ id: 'claim_stone', x: 5, z: 5 });
  plan.place({ id: 'furnace', x: 10, z: 5, rot: 0.4 });
  const json = JSON.parse(JSON.stringify(plan.toJSON()));

  const back = createBuildPlan({ catalogue, terrain, saved: json });
  assert.equal(back.entries.length, 2);
  assert.equal(back.claims.length, 1);
  // ids keep counting from where they were, so a reloaded base does not collide with itself
  const next = back.place({ id: 'anvil', x: 16, z: 5 });
  assert.equal(next.ok, true, next.why);
  assert.ok(!back.entries.slice(0, -1).some(e => e.id === next.entry.id));
});

// ---------------------------------------------------------------- the portal

const anchorAt = (x, z, extra = {}) => ({ x, z, world: { systemSeed: 1, planetId: 2 }, place: 'the Sunken Vault', ...extra });
const padAt = (x, z, extra = {}) => ({ x, z, world: { systemSeed: 1, planetId: 2 }, padId: 't1', place: 'Hollowcrown', ...extra });

test('EXACTLY ONE PORTAL EXISTS, however many times you travel', () => {
  const portals = createPortals();
  assert.equal(portals.isOpen, false);

  const first = portals.open({ anchor: anchorAt(10, 10), exit: padAt(500, 500) });
  assert.equal(first.ok, true);
  assert.equal(first.closed, null);

  for (let i = 0; i < 20; i++) {
    const next = portals.open({ anchor: anchorAt(i * 7, i * 3), exit: padAt(600 + i, 600) });
    assert.equal(next.ok, true);
    assert.ok(next.closed, 'opening a new portal did not report closing the old one');
    assert.equal(portals.portal.id, next.portal.id);
  }
  // there is nowhere for a second one to be
  assert.equal(portals.openedCount, 21);
  assert.equal(Object.keys(portals.toJSON()).filter(k => k === 'portal').length, 1);
  assert.equal(portals.portal.anchor.x, 19 * 7);
});

test('a portal leads back to exactly where you were standing', () => {
  const portals = createPortals();
  portals.open({ anchor: anchorAt(1234.5, -987.25, { inDungeon: true, dungeon: 'd3' }), exit: padAt(40, 40) });
  const out = portals.use('exit');
  assert.equal(out.ok, true);
  assert.equal(out.to.x, 1234.5);
  assert.equal(out.to.z, -987.25);
  // §6.6 — two-way, and §6.7 — it stays open
  assert.equal(portals.isOpen, true);
  const back = portals.use('anchor');
  assert.equal(back.to.x, 40);
  assert.equal(portals.isOpen, true);
});

test('a portal survives a save and reload', () => {
  const portals = createPortals();
  portals.open({ anchor: anchorAt(77, -33, { inDungeon: true, dungeon: 'd9' }), exit: padAt(900, 12) });
  const json = JSON.parse(JSON.stringify(portals.toJSON()));

  const back = createPortals({ saved: json });
  assert.equal(back.isOpen, true);
  assert.deepEqual(back.portal, portals.portal);
  assert.equal(back.use('exit').to.x, 77);
  assert.match(back.journalLine(), /Hollowcrown → the Sunken Vault/);
  // …and still only one after a reload: opening again replaces it
  const again = back.open({ anchor: anchorAt(0, 0), exit: padAt(1, 1) });
  assert.ok(again.closed);
});

test('a portal closes when its anchor stops being a real place, and says so', () => {
  const portals = createPortals();
  portals.open({ anchor: anchorAt(5, 5), exit: padAt(50, 50) });

  // still on the same world: nothing happens
  assert.equal(portals.check({ world: { systemSeed: 1, planetId: 2 } }), null);
  // flew somewhere else
  const gone = portals.check({ world: { systemSeed: 1, planetId: 7 } });
  assert.ok(gone);
  assert.match(gone.why, /another world/);
  assert.equal(portals.isOpen, false);

  // and the dungeon case
  portals.open({ anchor: anchorAt(2, 2, { inDungeon: true, dungeon: 'd1' }), exit: padAt(60, 60) });
  assert.equal(portals.check({ world: { systemSeed: 1, planetId: 2 }, dungeon: 'd1' }), null);
  const shut = portals.check({ world: { systemSeed: 1, planetId: 2 }, dungeon: null });
  assert.match(shut.why, /the way in has gone/);
  assert.equal(portals.isOpen, false);
});

test('no portal out of a boss room, and no portal anchored nowhere', () => {
  const portals = createPortals();
  const no = portals.open({ anchor: anchorAt(1, 1), exit: padAt(2, 2), boss: true });
  assert.equal(no.ok, false);
  assert.equal(portals.isOpen, false);
  assert.equal(portals.open({ anchor: { world: null }, exit: padAt(2, 2) }).ok, false);
  assert.equal(portals.openScroll({ at: anchorAt(1, 1), pad: null }).ok, false);
});

test('the scroll opens one the other way round, under the same single-portal rule', () => {
  const portals = createPortals();
  portals.open({ anchor: anchorAt(10, 10), exit: padAt(500, 500) });
  const scroll = portals.openScroll({
    at: { x: -400, z: 320, world: { systemSeed: 1, planetId: 2 }, place: 'the Ashen Steps' },
    pad: { x: 500, z: 500, id: 't1', name: 'Hollowcrown' },
  });
  assert.equal(scroll.ok, true);
  assert.ok(scroll.closed, 'the scroll left the old portal open');
  assert.equal(portals.portal.anchor.place, 'the Ashen Steps');
  assert.equal(portals.use('exit').to.place, 'the Ashen Steps');
});

test('a portal never opens inside geometry, and both ends go on the map', () => {
  const blocked = (x, z) => Math.hypot(x - 100, z - 100) > 2.5;
  const portals = createPortals({ spotOk: blocked });
  portals.open({ anchor: anchorAt(0, 0), exit: padAt(100, 100) });
  assert.ok(blocked(portals.portal.exit.x, portals.portal.exit.z), 'it opened inside the rock');
  assert.ok(Math.hypot(portals.portal.exit.x - 100, portals.portal.exit.z - 100) < 7, 'it was nudged too far');

  const marks = portals.mapMarkers();
  assert.equal(marks.length, 2);
  assert.deepEqual(marks.map(m => m.end).sort(), ['anchor', 'exit']);

  // walking into a ring
  assert.equal(portals.endAt(0.5, 0.5), 'anchor');
  assert.equal(portals.endAt(9999, 9999), null);
  assert.deepEqual(nudgeTo(0, 0, () => true), { x: 0, z: 0, nudged: false });
});

// ---------------------------------------------------------------- the player's own waypoint

const town = (id, name, wx, wz, size = 2) => ({ id, name, wx, wz, size });

test('a waypoint you built joins the same network as the towns', () => {
  const waypoints = createWaypoints({ settlements: [town('t1', 'Hollowcrown', 1000, 1000)], seed: 3 });
  waypoints.visit(waypoints.settlementAt(1000, 1000));
  assert.equal(waypoints.list().length, 1);

  const added = waypoints.addBuilt({ id: 'wp_cl1', name: 'Ironrest', x: 4000, z: 2000, claim: 'cl1' });
  assert.equal(added.ok, true);
  assert.equal(waypoints.list().length, 2);
  assert.equal(waypoints.isLit('wp_cl1'), true, 'you built it, so you have obviously been there');
  assert.equal(waypoints.count, 2);

  // it travels like any other pad, including the time it costs
  const can = waypoints.canTravel('wp_cl1', { fromId: 't1' });
  assert.equal(can.ok, true, can.why);
  assert.ok(waypoints.hoursFor(1000, 1000, can.pad) > 0.5);
  // …and it looks like any other pad to the map
  const pad = waypoints.byId('wp_cl1');
  assert.equal(pad.kind, 'built');
  assert.equal(pad.x, 4000);
});

test('a dark waypoint cannot be travelled to, and the reason points at the grid', () => {
  const waypoints = createWaypoints({ settlements: [town('t1', 'Hollowcrown', 0, 0)] });
  waypoints.addBuilt({ id: 'wp_cl1', name: 'Ironrest', x: 500, z: 0, claim: 'cl1' });
  assert.equal(waypoints.setPowered('wp_cl1', false), true);

  const no = waypoints.canTravel('wp_cl1', {});
  assert.equal(no.ok, false);
  assert.match(no.why, /grid is down/);
  assert.equal(waypoints.isLit('wp_cl1'), false);
  assert.equal(waypoints.count, 0);

  waypoints.setPowered('wp_cl1', true);
  assert.equal(waypoints.canTravel('wp_cl1', {}).ok, true);
});

test('one waypoint per claim, and the pads survive a save', () => {
  const waypoints = createWaypoints({ settlements: [town('t1', 'Hollowcrown', 0, 0)], seed: 9 });
  waypoints.visit(waypoints.settlementAt(0, 0));
  waypoints.addBuilt({ id: 'wp_a', name: 'Ironrest', x: 500, z: 0, claim: 'cl1' });

  const dupe = waypoints.addBuilt({ id: 'wp_b', name: 'Ironrest Two', x: 520, z: 0, claim: 'cl1' });
  assert.equal(dupe.ok, false);
  assert.match(dupe.why, /One per base/);
  // a SECOND base is allowed one of its own (§5.9 — one per claim, not one per player)
  assert.equal(waypoints.addBuilt({ id: 'wp_c', name: 'Saltmere', x: 9000, z: 9000, claim: 'cl2' }).ok, true);

  waypoints.noteDeparture(12, 34, 'Kerreth');
  const json = JSON.parse(JSON.stringify(waypoints.toJSON()));
  const back = createWaypoints({ settlements: [town('t1', 'Hollowcrown', 0, 0)], seed: 9 });
  back.load(json);
  assert.equal(back.list().length, 3);
  assert.equal(back.isLit('t1'), true);
  assert.equal(back.byId('wp_c').name, 'Saltmere');
  assert.equal(back.departure.world, 'Kerreth');

  // §5.12 — the pad can be knocked down without taking the town network with it
  assert.equal(back.removeBuilt('wp_a'), true);
  assert.equal(back.list().length, 2);
  assert.equal(back.isLit('t1'), true);
});

test('the journal lists the network, towns and bases together', () => {
  const waypoints = createWaypoints({ settlements: [town('t1', 'Hollowcrown', 0, 0), town('t2', 'Saltmere', 500, 0)] });
  waypoints.visit(waypoints.settlementAt(0, 0));
  waypoints.addBuilt({ id: 'wp_a', name: 'Ironrest', x: 900, z: 0, claim: 'cl1' });
  const rows = waypoints.journal({ zoneFor: p => ({ zone: 'The Reach', minLevel: p.kind === 'built' ? 12 : 1 }) });
  assert.equal(rows.length, 2, 'an unvisited town should not be in the journal');
  assert.deepEqual(rows.map(r => r.name), ['Hollowcrown', 'Ironrest']);
  assert.equal(rows[1].zone, 'The Reach');
});

// ---------------------------------------------------------------- the piece that joins them up

test('building a pad, joining the network and travelling home is one chain', () => {
  const terrain = fakeTerrain({ amplitude: 7 });
  const ground = createTerraform();
  ground.wrap(terrain);
  // in material ids, which is what a bill is priced in — see the blueprint test above
  const bag = makeBag({ concrete: 40, waypoint_core: 1, crystal_raw: 6, steel_ingot: 20, stone: 20, iron_ingot: 6 });
  const plan = createBuildPlan({ catalogue, terrain, terraform: ground, store: bag });
  const waypoints = createWaypoints({ settlements: [town('t1', 'Hollowcrown', 2000, 2000)] });
  waypoints.visit(waypoints.settlementAt(2000, 2000));
  const portals = createPortals();

  // level the ground first — on Farhold that is always the first move — then stake the base
  ground.level({ x: 4, z: 0, r: 18, h: terrain.heightAt(4, 0), feather: 8 });
  const staked = plan.place({ id: 'claim_stone', x: 0, z: 0 });
  assert.equal(staked.ok, true, staked.why);
  const claim = plan.claims[0].id;
  const pad = plan.place({ id: 'waypoint_pad', x: 8, z: 0 });
  assert.equal(pad.ok, true, pad.why);
  assert.equal(bag.have('waypoint_core'), 0, 'the core was not consumed');

  // it needs power before it lights
  plan.setPowered(claim, false);
  waypoints.addBuilt({ id: 'wp_' + claim, name: 'Ironrest', x: pad.entry.x, z: pad.entry.z, claim, powered: false });
  assert.equal(waypoints.canTravel('wp_' + claim, {}).ok, false);

  plan.setPowered(claim, true);
  waypoints.setPowered('wp_' + claim, true);
  const can = waypoints.canTravel('wp_' + claim, { fromId: 't1' });
  assert.equal(can.ok, true, can.why);

  // travel: note where you left from, then the portal opens on the sigils leading back there
  const from = waypoints.noteDeparture(2000, 2000, 'Kerreth');
  const opened = portals.open({
    anchor: { x: from.x, z: from.z, world: { systemSeed: 1, planetId: 2 }, place: 'Hollowcrown' },
    exit: { x: can.pad.x, z: can.pad.z, world: { systemSeed: 1, planetId: 2 }, padId: can.pad.id, place: can.pad.name },
  });
  assert.equal(opened.ok, true);
  assert.equal(portals.use('exit').to.x, 2000);
  assert.match(portals.journalLine(), /Ironrest → Hollowcrown/);
});
