// node --test prototypes/farhold/tests/round23-bridge-gate.test.js
//
// Round 23, items 4 and 5 — two reports from one town (seed 47, Sheithyadmia V, Fenkeep):
//
//   4. "The bridge at (x 13269, z 2876, altitude 29) has no physics and characters are clipping
//      through it. The ends are also not flush with the ground."
//   5. "The gate at (x 13212, z 2916, altitude 26) does not properly connect to the walls, you can
//      just walk through the wall. Also the gray part of the gate should match the green color of
//      the walls (in this particular town). Also the gate doors appear closed, let's make them open
//      instead and have a guard by each entrance."
//
// The rule these tests hold to is "drawn geometry vs measured geometry: assert the two AGREE". Each
// half of the old bridge was fine on its own terms — the mesh was a tidy flat box and the collider
// chain followed the road — and they were half a metre apart. So nothing here compares a number to
// a constant: the drawn bridge is read back out of `features.bridgeMesh`'s own vertex buffer and
// the drawn wall out of the instanced meshes, and each is measured against the obstacle field the
// player actually collides with.
//
// Everything runs the REAL modules: js/planet.js builds the world, js/features.js builds the towns
// and bridges (Three.js loads in node through tests/three-loader.mjs — a BufferGeometry is
// arithmetic), js/collide.js answers the collision questions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const P = await import('../js/planet.js');
const { generatePlanetMap } = await import('../../../universe/js/planetmap.js');
const { createFeatures } = await import('../js/features.js');
const { planBridge, deckTopAlong, DECK_RISE, END_REACH } = await import('../js/bridge-plan.js');
const { groundAt, deckAt, wetAt } = await import('../js/ground.js');
const { sentryPosts } = await import('../js/town-plan.js');
const { CULTURE_KIT } = await import('../../../proctown/js/buildkit.js');
const { cultureFor } = await import('../../../proctown/js/townplan.js');
const { ObstacleField } = await import('../js/collide.js');

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));

/**
 * The worlds. Super tiny (0.1) is the planet size the report was played on — a metre means
 * nothing without it (see tools/probe-worldgen.mjs). Seed 47's START world is Sheithyadmia V, the
 * reported planet; the other two are here so this is not a one-spot fix.
 */
const SCALE = 0.1;
const SEEDS = [47, 7, 4477];
const worlds = new Map();
function worldFor(seed) {
  if (worlds.has(seed)) return worlds.get(seed);
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * SCALE);
  const mapSize = { width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2 };
  const made = P.createWorld({ seed, ...mapSize, habitable: true, liveable: true });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const features = createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 2600 });
  const w = { seed, planet: made.planet, terrain, features };
  worlds.set(seed, w);
  return w;
}

// ------------------------------------------------------------------------ reading the drawn mesh

/**
 * The top of the DRAWN bridge deck at (x, z), read from `features.bridgeMesh`'s vertex buffer: the
 * highest upward-facing triangle over that point. Rails are excluded by where the caller samples
 * (never within a metre of a deck edge); piers sit under the deck, so the highest face is the deck.
 */
function drawnTops(features) {
  const g = features.bridgeMesh.geometry;
  const pos = g.attributes.position?.array, nrm = g.attributes.normal?.array, idx = g.index?.array;
  const tris = [];
  if (!pos) return { at: () => null, count: 0 };
  const CELL = 8, grid = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (nrm[a * 3 + 1] < 0.5) continue;                     // only faces that look up
    const tri = [a, b, c].map(i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]]);
    const x0 = Math.min(...tri.map(p => p[0])), x1 = Math.max(...tri.map(p => p[0]));
    const z0 = Math.min(...tri.map(p => p[2])), z1 = Math.max(...tri.map(p => p[2]));
    for (let gx = Math.floor(x0 / CELL); gx <= Math.floor(x1 / CELL); gx++) {
      for (let gz = Math.floor(z0 / CELL); gz <= Math.floor(z1 / CELL); gz++) {
        const k = gx + ',' + gz;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(tri);
      }
    }
    tris.push(tri);
  }
  const at = (x, z) => {
    let best = null;
    for (const [p, q, r] of grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []) {
      // barycentric in XZ
      const d = (q[2] - r[2]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[2] - r[2]);
      if (Math.abs(d) < 1e-12) continue;
      const l1 = ((q[2] - r[2]) * (x - r[0]) + (r[0] - q[0]) * (z - r[2])) / d;
      const l2 = ((r[2] - p[2]) * (x - r[0]) + (p[0] - r[0]) * (z - r[2])) / d;
      const l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const y = l1 * p[1] + l2 * q[1] + l3 * r[1];
      if (best === null || y > best) best = y;
    }
    return best;
  };
  return { at, count: tris.length };
}

/** The reported bridge: Fenkeep's, on the highway, just east of x 13269 z 2876. */
function reportedBridge(w) {
  return w.features.bridgePlans.find(p => Math.hypot(p.crossing.x - 13306, p.crossing.z - 2879) < 8);
}

// ------------------------------------------------------------------------------------ item 4

test('seed 47 lands on the reported world, and the reported spot is next to a bridge', () => {
  const w = worldFor(47);
  assert.equal(w.planet.name, 'Sheithyadmia V');
  w.features.update(13269, 2876, true);
  const plan = reportedBridge(w);
  assert.ok(plan, 'no bridge drawn near x 13306 z 2879');
  // the reported point is on the deck's own line, a few metres in from its east end
  const d = (13269 - plan.crossing.x) * plan.tx + (2876 - plan.crossing.z) * plan.tz;
  assert.ok(Math.abs(d) <= plan.halfLength, `the reported spot is ${d.toFixed(1)} m along a ${plan.halfLength.toFixed(1)} m half-length`);
});

test('the bridge you see is the bridge you stand on — every metre, every bridge, three worlds', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    const t = w.features.settlements.find(s => (s.size || 1) >= 4) || w.features.settlements[0];
    w.features.update(seed === 47 ? 13269 : t.wx, seed === 47 ? 2876 : t.wz, true);
    const drawn = drawnTops(w.features);
    const plans = w.features.bridgePlans;
    assert.ok(plans.length > 0, `seed ${seed}: no bridges drawn`);
    let checked = 0, worst = 0, where = '';
    for (const plan of plans) {
      const { crossing: c, halfWidth: hw, nx, nz } = plan;
      for (let d = plan.from + 0.05; d <= plan.to - 0.05; d += 0.7) {
        for (const off of [-(hw - 1.2), 0, hw - 1.2]) {
          const x = c.x + plan.tx * d + nx * off, z = c.z + plan.tz * d + nz * off;
          const seen = drawn.at(x, z);
          assert.notEqual(seen, null, `seed ${seed}: no drawn deck at ${x.toFixed(1)},${z.toFixed(1)} inside a bridge`);
          // what the player's controller stands on: `standAt` over the same field it collides with
          const stood = w.features.solids.standAt(x, z, seen + 0.2, 0);
          assert.notEqual(stood, null, `seed ${seed}: nothing to stand on at ${x.toFixed(1)},${z.toFixed(1)}`);
          const gap = Math.abs(stood - seen);
          if (gap > worst) { worst = gap; where = `${x.toFixed(1)},${z.toFixed(1)}`; }
          checked++;
        }
      }
    }
    assert.ok(worst < 0.02, `seed ${seed}: the drawn deck and the collider disagree by ${worst.toFixed(3)} m at ${where}`);
    assert.ok(checked > 200, `seed ${seed}: only ${checked} deck points measured`);
  }
});

test('the reported bridge: the old flat box stood half a metre over its collider; this one does not', () => {
  const w = worldFor(47);
  w.features.update(13269, 2876, true);
  const plan = reportedBridge(w);
  const drawn = drawnTops(w.features);
  // the spot the user stood on
  const seen = drawn.at(13269, 2876);
  const stood = w.features.solids.standAt(13269, 2876, seen + 0.2, 0);
  assert.ok(Math.abs(seen - stood) < 0.02, `drawn ${seen.toFixed(2)} vs stood ${stood.toFixed(2)}`);
  // and the deck follows its road down the east approach instead of staying flat over it: the
  // old box's top was the road at the middle + 0.26 (29.93 m) all the way to 40 m out
  const mid = deckTopAlong(plan, 0), east = deckTopAlong(plan, 40);
  const road = w.terrain.roadSurfaceAt(plan.crossing.x + plan.tx * 40, plan.crossing.z + plan.tz * 40);
  assert.ok(east < mid - 0.3, `the deck is flat: ${mid.toFixed(2)} in the middle, ${east.toFixed(2)} at 40 m`);
  assert.ok(Math.abs(east - (road + DECK_RISE)) < 0.35, `at 40 m the deck is ${east.toFixed(2)} over a road at ${road.toFixed(2)}`);
});

test('both ends of every bridge land on something: the ground, a landing, or the next bridge — no step on, no step off', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    const t = w.features.settlements.find(s => (s.size || 1) >= 4) || w.features.settlements[0];
    w.features.update(seed === 47 ? 13269 : t.wx, seed === 47 ? 2876 : t.wz, true);
    let ends = 0, drops = 0, landings = 0, worst = 0, where = '';
    for (const plan of w.features.bridgePlans) {
      const { crossing: c } = plan;
      for (const [side, d, kind] of [[-1, plan.from, plan.ends.back], [1, plan.to, plan.ends.fwd]]) {
        // a road that ends at the sea: nothing to land on within reach, and it is counted
        if (kind === 'drop') { drops++; continue; }
        if (kind === 'landing') landings++;
        const top = deckTopAlong(plan, d);
        const px = c.x + plan.tx * (d + side * 0.15), pz = c.z + plan.tz * (d + side * 0.15);
        // what you step on next: the ground, or the next bridge's deck where two roads meet
        const next = kind === 'bridge'
          ? w.features.solids.standAt(px, pz, top + 0.35, 0, { decksOnly: true })
          : w.terrain.heightAt(px, pz);
        assert.notEqual(next, null, `seed ${seed}: the bridge at ${c.x.toFixed(0)},${c.z.toFixed(0)} says it meets another and does not`);
        const step = Math.abs(top - next);
        if (step > worst) { worst = step; where = `${c.x.toFixed(0)},${c.z.toFixed(0)} side ${side} (${kind})`; }
        ends++;
      }
    }
    assert.ok(ends > 4, `seed ${seed}: only ${ends} bridge ends measured`);
    assert.ok(worst < 0.1, `seed ${seed}: a bridge end stands ${worst.toFixed(3)} m off what it meets at ${where}`);
    // the only ends allowed to stop short are roads that run out into water with no bank in reach
    assert.ok(drops <= Math.max(1, (ends + drops) * 0.1), `seed ${seed}: ${drops} of ${ends + drops} ends meet nothing`);
    console.log(`# seed ${seed}: ${ends + drops} bridge ends — ${landings} landings, ${drops} drops, worst step ${worst.toFixed(3)} m`);
  }
});

test('every walker, not only the player, stands on the deck — and a swimmer under it stays under it', () => {
  const w = worldFor(47);
  w.features.update(13269, 2876, true);
  const plan = reportedBridge(w);
  const { crossing: c } = plan;
  // the middle of the bridge, over the river
  const bed = w.terrain.heightAt(c.x, c.z);
  const top = deckTopAlong(plan, 0);
  assert.ok(top - bed > 3, 'the reported bridge is not over a channel');
  // walking on from the road: the body's feet are at the deck, so the deck holds it
  assert.ok(Math.abs(groundAt(w.terrain, c.x, c.z, top) - top) < 0.02, 'a walker at deck height is not on the deck');
  // spawned with no idea of height (Infinity): on the deck, not on the river bed
  assert.ok(Math.abs(groundAt(w.terrain, c.x, c.z) - top) < 0.02, 'a spawn on a bridge lands on the river bed');
  // something at the bottom of the river is NOT snatched up on to the deck above it
  assert.ok(Math.abs(groundAt(w.terrain, c.x, c.z, bed) - bed) < 0.02, 'a body on the river bed was lifted to the deck');
  // the water is under the deck, so "never walk into water" rules let a walker cross
  assert.equal(w.terrain.underwater(c.x, c.z), true, 'the middle of the bridge should be over water');
  assert.equal(wetAt(w.terrain, c.x, c.z, top), false, 'a walker on the deck is treated as in the river');
  assert.equal(wetAt(w.terrain, c.x, c.z, bed), true, 'a body in the river is treated as dry');
  // and the walker index is the same plan the features drew
  assert.ok(Math.abs(deckAt(w.terrain, c.x, c.z, top) - w.features.solids.standAt(c.x, c.z, top + 0.2, 0)) < 1e-6);
});

test('the walker modules all ask js/ground.js for their feet, none of them heightAt alone', () => {
  // the reason the report said "characters", plural: enemies, companions and townsfolk each set
  // `y = terrain.heightAt(...)`, which under a bridge is the river bed
  for (const file of ['actors.js', 'pets.js', 'town.js']) {
    const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/ground\.js'/, `${file} does not import js/ground.js`);
    const bare = src.split('\n').filter(l => /\.y = [^;]*\bheightAt\(/.test(l) && !/groundAt/.test(l));
    assert.deepEqual(bare, [], `${file} still stands a body on bare terrain:\n${bare.join('\n')}`);
  }
});

// ------------------------------------------------------------------------------------ item 5

/** Every walled town near a point on a world, with its ring as built. */
function walledTowns(w, n = 2) {
  const out = [];
  for (const t of w.features.settlements.filter(s => (s.size || 1) >= 4)) {
    if (out.length >= n) break;
    w.features.update(t.wx, t.wz, true);
    const ring = w.features.wallOf(t.id);
    if (ring) out.push({ t, ring });
  }
  return out;
}

const ringPoint = (ring, i) => {
  const a = (i / ring.segments) * Math.PI * 2;
  return [ring.cx + Math.cos(a) * ring.r, ring.cz + Math.sin(a) * ring.r];
};
const inRun = (ring, i) => ring.gates.some(g => {
  for (let k = g.lo; k <= g.hi; k++) if (((k % ring.segments) + ring.segments) % ring.segments === i) return true;
  return false;
});
const inOpening = (ring, x, z, pad = 0) => ring.gates.some(g => {
  const along = (x - g.x) * g.tx + (z - g.z) * g.tz, across = (x - g.x) * g.ox + (z - g.z) * g.oz;
  return Math.abs(along) < g.open / 2 + pad && Math.abs(across) < 3;
});

test('the wall has no hole anywhere on dry ground except the gate openings — three worlds, two towns each', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    const towns = walledTowns(w, seed === 47 ? 7 : 2);
    assert.ok(towns.length > 0, `seed ${seed}: no walled town`);
    for (const { t, ring } of towns) {
      w.features.update(t.wx, t.wz, true);
      let dry = 0;
      const holes = [];
      const walk = (ax, az, bx, bz) => {
        const len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s <= len; s += 0.5) {
          const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
          if (w.terrain.underwater(x, z) || w.terrain.bridgedAt(x, z, 1)) continue;
          if (inOpening(ring, x, z, 0.3)) continue;
          dry++;
          if (!w.features.solids.blocked(x, z, 0.3)) holes.push(`${x.toFixed(1)},${z.toFixed(1)}`);
        }
      };
      // every ordinary segment on its own chord, every gate's run on the chord the gate sits on
      for (let i = 0; i < ring.segments; i++) {
        if (inRun(ring, i)) continue;
        const [ax, az] = ringPoint(ring, i), [bx, bz] = ringPoint(ring, i + 1);
        walk(ax, az, bx, bz);
      }
      for (const g of ring.gates) walk(...g.run);
      assert.ok(dry > 300, `${t.name}: only ${dry} dry wall points`);
      assert.deepEqual(holes.slice(0, 8), [], `${t.name} (seed ${seed}): ${holes.length} of ${dry} dry points on the wall line can be walked through`);
    }
  }
});

test('Fenkeep\'s west gate — the reported one — meets its wall at both ends, and the gate itself is open', () => {
  const w = worldFor(47);
  w.features.update(13212, 2916, true);
  const t = w.features.settlements.find(s => s.name === 'Fenkeep');
  const ring = w.features.wallOf(t.id);
  // R27 M5: the west gate is where road 1 crosses the wall, and the wall is where the planner put
  // it — a 9 m highway through Fenkeep takes more of its ground, the plan grew, and the crossing
  // moved 31 m out along the same road. The nearest gate to the reported spot is still that gate.
  const gate = ring.gates
    .map(g => ({ g, d: Math.hypot(g.x - 13212, g.z - 2916) }))
    .filter(e => e.d < 40).sort((a, b) => a.d - b.d)[0]?.g;
  assert.ok(gate?.gatehouse, 'no gatehouse at the reported spot');
  // the old gap: the kerb segment at 152.7 degrees was dropped by `place()`'s road test. Walk the
  // whole run from end to end along the wall line and count the metres you could walk through
  const [ax, az, bx, bz] = gate.run;
  const len = Math.hypot(bx - ax, bz - az);
  let leaks = 0;
  for (let s = 0; s <= len; s += 0.25) {
    const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
    const along = (x - gate.x) * gate.tx + (z - gate.z) * gate.tz;
    if (Math.abs(along) < gate.open / 2 + 0.3) continue;
    if (!w.features.solids.blocked(x, z, 0.3)) leaks++;
  }
  assert.equal(leaks, 0, `${leaks * 0.25} m of the reported gate's wall line can be walked through`);
  // the passage is clear from outside the gate to inside it, between the doors
  const player = 0.45;
  for (let a = -(gate.open / 2 - 0.9); a <= gate.open / 2 - 0.9; a += 0.5) {
    for (let o = -6; o <= 6; o += 0.5) {
      const x = gate.x + gate.tx * a + gate.ox * o, z = gate.z + gate.tz * a + gate.oz * o;
      assert.equal(w.features.solids.blocked(x, z, player), false, `the passage is blocked ${a.toFixed(1)} across, ${o} out`);
    }
  }
});

/** The instance of `key` nearest a point, as { pos, quat, scale, colour }. */
function instanceNear(features, key, x, z, within = 3) {
  const mesh = features.instanced[key];
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const c = new THREE.Color();
  let best = null, bd = within;
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); m.decompose(p, q, s);
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bd) { bd = d; mesh.getColorAt(i, c); best = { i, pos: p.clone(), quat: q.clone(), scale: s.clone(), colour: '#' + c.getHexString() }; }
  }
  return best;
}
function instancesNear(features, key, x, z, within) {
  const mesh = features.instanced[key];
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); m.decompose(p, q, s);
    if (Math.hypot(p.x - x, p.z - z) < within) out.push({ pos: p.clone(), quat: q.clone(), scale: s.clone() });
  }
  return out;
}

test('a gate is the colour of its own town\'s wall — green in Fenkeep, and right in every walled town', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    for (const { t, ring } of walledTowns(w, seed === 47 ? 7 : 2)) {
      w.features.update(t.wx, t.wz, true);
      const want = CULTURE_KIT.cultures[cultureFor({ race: t.race, biome: t.biome })]?.townWall?.colour
        || CULTURE_KIT.cultures.human.townWall.colour;
      for (const g of ring.gates.filter(x => x.gatehouse)) {
        // R27 M3: each wall kind is its own mesh — the ring record says which one this town's is in
        const gh = instanceNear(w.features, ring.keys?.gatehouse || 'gatehouse', g.x, g.z, 1);
        assert.ok(gh, `${t.name}: no gatehouse instance at its record`);
        // the geometry is white, so the instance colour IS the colour
        assert.equal(gh.colour, new THREE.Color(want).getHexString().replace(/^/, '#'), `${t.name}: gate is ${gh.colour}, wall is ${want}`);
        // and it matches the wall pieces either side of it, which are what the eye compares it to
        const [ax, az] = g.run;
        const wall = instanceNear(w.features, ring.keys?.wall || 'wall', ax + g.tx * 3, az + g.tz * 3, 6);
        if (wall) assert.equal(gh.colour, wall.colour, `${t.name}: gate ${gh.colour} beside wall ${wall.colour}`);
      }
      if (t.name === 'Fenkeep') assert.equal(want, '#4d6b42', 'Fenkeep is a halfling town with a green hedge wall');
    }
  }
});

test('the gate doors stand open: two leaves per gatehouse, swung in along the passage, not across it', () => {
  const w = worldFor(47);
  for (const { t, ring } of walledTowns(w, 7)) {
    w.features.update(t.wx, t.wz, true);
    for (const g of ring.gates.filter(x => x.gatehouse)) {
      const leaves = instancesNear(w.features, 'gatedoor', g.x, g.z, g.open / 2 + 2.5);
      assert.equal(leaves.length, 2, `${t.name}: ${leaves.length} door leaves at a gate`);
      for (const leaf of leaves) {
        // the leaf's long axis is its local Z: it must run along the road (out/in), not across it
        const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(leaf.quat);
        assert.ok(Math.abs(axis.x * g.ox + axis.z * g.oz) > 0.99, `${t.name}: a door leaf lies across the opening`);
        // …at the edge of the opening, not in the middle of it
        const along = (leaf.pos.x - g.x) * g.tx + (leaf.pos.z - g.z) * g.tz;
        assert.ok(Math.abs(Math.abs(along) - g.open / 2) < 0.3, `${t.name}: a leaf hangs ${along.toFixed(2)} m from the middle of a ${g.open.toFixed(1)} m opening`);
        // and it is as long as half the opening, so shut they would meet in the middle
        assert.ok(Math.abs(leaf.scale.z - g.open / 2) < 0.01);
      }
    }
  }
});

test('two guards stand at every entrance: outside, either side of the road, facing out, clear of the wall', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    for (const { t, ring } of walledTowns(w, 2)) {
      w.features.update(t.wx, t.wz, true);
      const gates = w.features.gatesOf(t.id);
      assert.ok(gates.length > 0);
      const posts = sentryPosts(gates);
      assert.equal(posts.length, gates.length * 2, `${t.name}: ${posts.length} posts for ${gates.length} gates`);
      for (const [i, g] of gates.entries()) {
        const pair = posts.filter(p => p.gate === i);
        assert.deepEqual(pair.map(p => p.side).sort(), [-1, 1], 'one each side');
        for (const p of pair) {
          const out = (p.x - g.x) * g.ox + (p.z - g.z) * g.oz;
          const along = (p.x - g.x) * g.tx + (p.z - g.z) * g.tz;
          assert.ok(out > g.depth / 2, `${t.name}: a guard stands inside the gate (${out.toFixed(1)} m out)`);
          assert.ok(Math.abs(along) > g.open / 2, `${t.name}: a guard stands in the opening`);
          assert.equal(p.facing, g.yaw, 'a guard faces out along the road');
          assert.equal(w.features.solids.blocked(p.x, p.z, 0.45), false, `${t.name}: a guard post is inside something solid`);
        }
      }
    }
  }
});

test('town.js stands the gate guards from the gate records, as guards with a post', () => {
  const src = readFileSync(new URL('../js/town.js', import.meta.url), 'utf8');
  assert.match(src, /sentryPosts\(/, 'town.js never asks for the posts');
  assert.match(src, /gatesOf\??\.?\(/, 'town.js does not read the gates features built');
  assert.match(src, /post:/, 'a gate guard has no post to hold');
});

// ------------------------------------------------------------------------------ the primitives

test('a wall segment is a box: square ends, solid through, and a fast step cannot pass it', () => {
  const f = new ObstacleField();
  f.addSegment(0, 0, 10, 0, 0.6, 4);
  assert.equal(f.blocked(5, 0.9, 0.4), true, 'inside the thickness plus the body');
  assert.equal(f.blocked(5, 1.1, 0.4), false, 'clear of it');
  // square ends: a point level with the end, just past it, is clear — a capsule would round it off
  assert.equal(f.blocked(10.5, 0.5, 0.4), false);
  assert.equal(f.blocked(-0.5, 0.5, 0.4), false);
  // a two-metre step straight across a 1.2 m wall (a gallop on a slow frame) is put back
  const out = f.resolve(5, -1.2, 0.4, [0, 0], null, [5, 1.2]);
  assert.ok(out[1] >= 1.0, `stepped through the wall to ${out[1].toFixed(2)}`);
  // sliding along it is untouched
  const slide = f.resolve(6, 1.2, 0.4, [0, 0], null, [5, 1.2]);
  assert.deepEqual(slide.map(v => +v.toFixed(3)), [6, 1.2]);
});

test('a sloped deck is a ramp, not a staircase', () => {
  const f = new ObstacleField();
  f.addDeck(0, 0, 0, 5, 2, 10, 0.1);                       // +Z along, rising 0.1 m a metre
  assert.ok(Math.abs(f.standAt(0, 4, 20, 0) - 10.4) < 1e-9);
  assert.ok(Math.abs(f.standAt(0, -4, 20, 0) - 9.6) < 1e-9);
  // under it is under it
  assert.equal(f.standAt(0, 4, 9, 0), null);
});

test('planBridge on a synthetic crossing: ends on the ground, deck on the road, colliders on the samples', () => {
  // a flat road at 5 m crossing a channel, ground at 5 m past both ends
  const terrain = {
    roadSurfaceAt: () => 5,
    heightAt: (x, z) => (Math.abs(z) < 20 ? 0 : 5),
  };
  const plan = planBridge({ x: 0, z: 0, tx: 0, tz: 1, angle: 0, halfLength: 25, halfWidth: 4, deck: 5 }, terrain);
  assert.ok(Math.abs(deckTopAlong(plan, 0) - (5 + DECK_RISE)) < 1e-9);
  assert.ok(Math.abs(deckTopAlong(plan, 25) - 5.02) < 1e-9);
  assert.ok(Math.abs(deckTopAlong(plan, -25) - 5.02) < 1e-9);
  const f = new ObstacleField();
  for (const p of plan.pieces) f.addDeck(p.x, p.z, p.angle, p.halfLength, p.halfWidth, p.top, p.slope);
  for (let d = -24.9; d <= 24.9; d += 0.37) {
    assert.ok(Math.abs(f.standAt(0, d, 10, 0) - deckTopAlong(plan, d)) < 1e-6, `collider off the plan at ${d}`);
  }
});

// R23b — "no physics": the deck held you up and nothing held you ON it. The rails are walls now,
// but only at deck height, so a swimmer in the river underneath is never stopped by one.
test('a bridge rail stops a walker on the deck and not a swimmer under it', async () => {
  const { railRuns } = await import('../js/bridge-plan.js');
  const bad = [];
  let checked = 0;
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    const t = w.terrain.crossings?.[0];
    w.features.update(seed === 47 ? 13269 : t?.x ?? 0, seed === 47 ? 2876 : t?.z ?? 0, true);
    const plans = w.features.bridgePlans;
    for (const plan of plans) {
      for (const { a, b, o } of railRuns(plan, plans)) {
        const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, top = (a.top + b.top) / 2;
        const s = Math.sign(o);
        // one step from just inside the rail to a metre past it
        const from = [mx + plan.nx * (o - s * 0.8), mz + plan.nz * (o - s * 0.8)];
        const to = [mx + plan.nx * (o + s * 1.0), mz + plan.nz * (o + s * 1.0)];
        const across = p => (p[0] - mx) * plan.nx + (p[1] - mz) * plan.nz;
        const walker = w.features.solids.resolve(to[0], to[1], 0.4, [0, 0], top, from);
        if (!(s * across(walker) < Math.abs(o))) bad.push(`seed ${seed} rail at ${mx.toFixed(0)}, ${mz.toFixed(0)} (feet ${top.toFixed(2)})`);
        // four metres down is a swimmer in the river: the rail is not there for them
        const swimmer = w.features.solids.resolve(to[0], to[1], 0.4, [0, 0], top - 4, from);
        const railHeld = s * across(swimmer) < Math.abs(o) && Math.abs(across(swimmer) - across(walker)) < 1e-6;
        if (railHeld && Math.hypot(swimmer[0] - to[0], swimmer[1] - to[1]) > 0.01) {
          // something else stopped them; only a rail doing it would be wrong, and a rail would stop
          // them at exactly the walker's spot — which is what `railHeld` asks
          bad.push(`seed ${seed}: a swimmer under the rail at ${mx.toFixed(0)}, ${mz.toFixed(0)} was stopped by it`);
        }
        checked++;
      }
    }
  }
  assert.ok(checked >= 50, `only ${checked} stretches of rail to test`);
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} of ${checked} rail stretches failed`);
});
