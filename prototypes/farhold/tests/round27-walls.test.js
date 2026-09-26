// node --test prototypes/farhold/tests/round27-walls.test.js
//
// Round 27, M3 — "Walls by culture, fences by size, and a banner at the gate".
//
//   1. `CULTURES[*].wall` named a wall material for every culture and nothing read it: an orc war
//      camp and an elf grove had the same masonry ring in a different colour. Each wall kind is its
//      own InstancedMesh now, and a town's wall goes into the one its culture names.
//   2. A settlement under size 4 had no edge at all. Size 2-3 gets a low fence (decoration, no
//      collider) with a gap for every road and street; a hamlet gets boundary stones at the road.
//   3. Towers stood at `gate +/- 0.26 rad` and four fixed quarter bearings, cut at ten. They are
//      spaced along the wall now, and slide off water and kerbs instead of being dropped.
//   4. A banner at every gate, and an arrival card that fires once per walk in, on the town's real
//      edge (`townExtent`) — never a third radius.
//
// Everything is measured on real worlds (js/planet.js), real towns (js/features.js through the
// proctown planner) and the drawn meshes' own instance buffers; collision is js/collide.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const P = await import('../js/planet.js');
const { createFeatures } = await import('../js/features.js');
const {
  townExtent, planOf, wallTier, edgeKey, streetLanes, BUILDING_INFO,
  createArrivalWatch, arrivalRadius, arrivalCard, ARRIVAL_REARM,
} = await import('../js/town-plan.js');
const { ringCrossings } = await import('../js/roadplan.js');
const { createTownFolk } = await import('../js/town.js');
const { CULTURES, cultureFor } = await import('../../../proctown/js/townplan.js');
const { CULTURE_KIT, WALL_KINDS, FENCE_KINDS, FENCE_SEG, fenceKindFor } = await import('../../../proctown/js/buildkit.js');

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));

const SCALE = 0.1;
const SEEDS = [25392, 7, 47];
/** …and one full-size world, where a metre of wall is a smaller share of a cell. */
const WORLDS = [...SEEDS.map(seed => [seed, SCALE]), [4477, 1]];
const TAU = Math.PI * 2;

const worlds = new Map();
function worldFor(seed, scale = SCALE) {
  const key = `${seed}@${scale}`;
  // the cell size is module state in js/planet.js, so it is set again whenever a world is picked
  // back up — a town rebuilt on a Super-tiny world under a full-size cell is a different town
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  if (worlds.has(key)) return worlds.get(key);
  const made = P.createWorld({
    seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128,
    regionScale: 2, habitable: true, liveable: true,
  });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  // 400 m: one town per rebuild, so the instances near a town are that town's
  const features = createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 400 });
  const w = { seed, scale, terrain, features };
  worlds.set(key, w);
  return w;
}

/** Every instance of a mesh as { x, y, z, yaw, sz, colour }. */
function instancesOf(features, key) {
  const mesh = features.instanced[key];
  if (!mesh) return [];
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const e = new THREE.Euler(), c = new THREE.Color();
  const out = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m); m.decompose(p, q, s); e.setFromQuaternion(q, 'YXZ');
    mesh.getColorAt(i, c);
    out.push({ x: p.x, y: p.y, z: p.z, yaw: e.y, sz: s.z, colour: '#' + c.getHexString() });
  }
  return out;
}
const near = (list, x, z, r) => list.filter(o => Math.hypot(o.x - x, o.z - z) < r);
const onRing = (list, cx, cz, r, tol) => list.filter(o => Math.abs(Math.hypot(o.x - cx, o.z - cz) - r) < tol);
const apart = (a, b) => Math.abs(((a - b + Math.PI * 3) % TAU) - Math.PI);

/** The culture a town builds in, and how to make a node build in a given one. */
const cultureOf = t => cultureFor({ race: t.race, biome: t.biome });
const AS = {
  human: { race: 'human', biome: 'grassland' }, elf: { race: 'elf', biome: 'forest' },
  dwarf: { race: 'dwarf', biome: 'hills' }, undead: { race: 'undead', biome: 'grassland' },
  orc: { race: 'orc', biome: 'grassland' }, halfling: { race: 'halfling', biome: 'grassland' },
  desert: { race: 'human', biome: 'desert' },
};

// ------------------------------------------------------------------------ the tier and the kit

test('wallTier: a hamlet has none, a village or small town a low edge, size 4+ a wall', () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(wallTier), ['none', 'low', 'low', 'wall', 'wall']);
  // the low edge is decoration: it never makes a town "walled"
  for (const size of [2, 3]) assert.equal(townExtent({ size }).walled, false);
  // one mesh per kind, each with the stone wall's own budget and collision
  for (const kind of WALL_KINDS) {
    for (const piece of ['wall', 'tower', 'gatehouse']) {
      const key = edgeKey(kind, piece);
      assert.ok(BUILDING_INFO[key], `${key} has no catalogue entry`);
      assert.deepEqual(BUILDING_INFO[key].solid, BUILDING_INFO[piece].solid, `${key} collides differently from stone`);
      assert.equal(BUILDING_INFO[key].cap, BUILDING_INFO[piece].cap);
    }
  }
  for (const k of [...FENCE_KINDS.map(f => 'fence_' + f), 'boundstone', 'banner']) {
    assert.deepEqual(BUILDING_INFO[k].solid, [0, 0], `${k} files a collider — it is decoration`);
  }
});

// ------------------------------------------------------------------------ culture walls

test('the wall you see is the culture\'s wall: 7 cultures x 3 seeds, read from the mesh that holds it', () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    const t = w.features.settlements.find(s => (s.size || 1) >= 4);
    assert.ok(t, `seed ${seed}: no walled town`);
    const keep = { race: t.race, biome: t.biome };
    try {
      for (const [culture, as] of Object.entries(AS)) {
        Object.assign(t, as);
        assert.equal(cultureOf(t), culture);
        w.features.update(t.wx, t.wz, true);
        const ring = w.features.wallOf(t.id);
        const want = CULTURES[culture].wall;
        assert.equal(ring.kind, want, `${t.name} as ${culture}: record says ${ring.kind}`);
        for (const piece of ['wall', 'tower', 'gatehouse']) {
          // which mesh actually holds this town's pieces?
          const holders = WALL_KINDS.map(k => [k, onRing(instancesOf(w.features, edgeKey(k, piece)), ring.cx, ring.cz, ring.r, 4).length])
            .filter(([, n]) => n > 0);
          assert.deepEqual(holders.map(([k]) => k), [want], `${t.name} as ${culture}: ${piece}s drawn in ${JSON.stringify(holders)}`);
        }
        // tinted with the culture's own wall colour
        const tint = '#' + new THREE.Color(CULTURE_KIT.cultures[culture].townWall.colour).getHexString();
        const walls = onRing(instancesOf(w.features, edgeKey(want, 'wall')), ring.cx, ring.cz, ring.r, 4);
        assert.ok(walls.every(p => p.colour === tint), `${t.name} as ${culture}: wall not ${tint}`);
        checked++;
      }
    } finally {
      Object.assign(t, keep);
      w.features.update(t.wx, t.wz, true);
    }
  }
  assert.equal(checked, 21);
});

/** Round 23's walk: every 0.5 m of dry wall line is solid, except the gate openings. */
function ringHoles(w, ring) {
  const ringPoint = i => {
    const a = (i / ring.segments) * TAU;
    return [ring.cx + Math.cos(a) * ring.r, ring.cz + Math.sin(a) * ring.r];
  };
  const inRun = i => ring.gates.some(g => {
    for (let k = g.lo; k <= g.hi; k++) if (((k % ring.segments) + ring.segments) % ring.segments === i) return true;
    return false;
  });
  const inOpening = (x, z) => ring.gates.some(g => {
    const along = (x - g.x) * g.tx + (z - g.z) * g.tz, across = (x - g.x) * g.ox + (z - g.z) * g.oz;
    return Math.abs(along) < g.open / 2 + 0.3 && Math.abs(across) < 3;
  });
  let dry = 0;
  const holes = [];
  const walk = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    for (let s = 0; s <= len; s += 0.5) {
      const x = ax + ((bx - ax) * s) / len, z = az + ((bz - az) * s) / len;
      if (w.terrain.underwater(x, z) || w.terrain.bridgedAt(x, z, 1)) continue;
      if (inOpening(x, z)) continue;
      dry++;
      if (!w.features.solids.blocked(x, z, 0.3)) holes.push(`${x.toFixed(1)},${z.toFixed(1)}`);
    }
  };
  for (let i = 0; i < ring.segments; i++) {
    if (inRun(i)) continue;
    walk(...ringPoint(i), ...ringPoint(i + 1));
  }
  for (const g of ring.gates) walk(...g.run);
  return { dry, holes };
}

test('the collider is the same straight wall for every kind: round 23\'s ring walk passes for all 7 cultures', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed);
    const t = w.features.settlements.find(s => (s.size || 1) >= 4);
    const keep = { race: t.race, biome: t.biome };
    try {
      for (const [culture, as] of Object.entries(AS)) {
        Object.assign(t, as);
        w.features.update(t.wx, t.wz, true);
        const { dry, holes } = ringHoles(w, w.features.wallOf(t.id));
        assert.ok(dry > 200, `${t.name} as ${culture}: only ${dry} dry wall points`);
        assert.deepEqual(holes.slice(0, 6), [], `${t.name} as ${culture} (seed ${seed}): ${holes.length} of ${dry} points walk through`);
      }
    } finally {
      Object.assign(t, keep);
      w.features.update(t.wx, t.wz, true);
    }
  }
});

// ------------------------------------------------------------------------ towers by spacing

test('towers are spread along the wall: 25-70 m apart except across a gate or the water, none in water', () => {
  let towns = 0, pairs = 0;
  const spacings = [];
  for (const [seed, scale] of WORLDS) {
    const w = worldFor(seed, scale);
    for (const t of w.features.settlements.filter(s => (s.size || 1) >= 4)) {
      w.features.update(t.wx, t.wz, true);
      const ring = w.features.wallOf(t.id);
      const drawn = onRing(instancesOf(w.features, ring.keys.tower), ring.cx, ring.cz, ring.r, 1.5)
        .map(o => ({ ...o, a: ((Math.atan2(o.z - ring.cz, o.x - ring.cx) % TAU) + TAU) % TAU }))
        .sort((p, q) => p.a - q.a);
      towns++;
      assert.ok(drawn.length >= 3, `${t.name}: ${drawn.length} towers on a ${ring.r.toFixed(0)} m wall`);
      assert.equal(drawn.length, ring.towers.length, `${t.name}: the record and the mesh disagree`);
      for (const o of drawn) {
        assert.ok(!w.terrain.underwater(o.x, o.z) && !w.terrain.waterAt(o.x, o.z), `${t.name}: a tower stands in water at ${o.x.toFixed(0)},${o.z.toFixed(0)}`);
        assert.ok(w.terrain.roadAt(o.x, o.z) <= 0.45, `${t.name}: a tower stands on the road`);
      }
      // is there a break in the wall (a gate's run, water or a bridge) between two bearings?
      const broken = i => {
        const k = ((i % ring.segments) + ring.segments) % ring.segments;
        return ring.kinds[k] === 'water' || ring.kinds[k] === 'bridge'
          || ring.gates.some(g => { for (let j = g.lo; j <= g.hi; j++) if (((j % ring.segments) + ring.segments) % ring.segments === k) return true; return false; });
      };
      const breakBetween = (a0, a1) => {
        const s0 = Math.floor((a0 / TAU) * ring.segments), s1 = Math.floor((a1 / TAU) * ring.segments);
        for (let i = s0; i <= s1; i++) if (broken(i)) return true;
        return false;
      };
      for (let i = 0; i < drawn.length; i++) {
        const p = drawn[i], q = drawn[(i + 1) % drawn.length];
        const a1 = i + 1 < drawn.length ? q.a : q.a + TAU;
        if (breakBetween(p.a, a1)) continue;
        const along = (a1 - p.a) * ring.r;
        pairs++; spacings.push(along);
        assert.ok(along >= 25 && along <= 70, `${t.name} (seed ${seed}): two towers ${along.toFixed(1)} m apart along the wall`);
      }
      // every gatehouse has a tower on at least one flank, within 15 m of the end of its run
      for (const g of ring.gates.filter(x => x.gatehouse)) {
        const ends = [[g.run[0], g.run[1]], [g.run[2], g.run[3]]];
        const flanked = ends.some(([x, z]) => near(drawn, x, z, 15).length > 0);
        assert.ok(flanked, `${t.name}: a gatehouse with no flank tower`);
      }
    }
  }
  assert.ok(towns >= 10 && pairs >= 40, `${towns} towns, ${pairs} tower pairs`);
  spacings.sort((a, b) => a - b);
  console.log(`# towers: ${towns} towns, ${pairs} pairs, spacing ${spacings[0].toFixed(1)}..${spacings[spacings.length - 1].toFixed(1)} m, median ${spacings[spacings.length >> 1].toFixed(1)}`);
});

// ------------------------------------------------------------------------ fences and stones

/** The streets js/features.js actually draws for a town, the same way it asks for them. */
function drawnLanes(w, t) {
  const terrain = w.terrain;
  return streetLanes(planOf(t), {
    cx: t.wx, cz: t.wz, terrain, prune: true,
    skip: (x, z) => terrain.underwater(x, z) || terrain.riverAt(x, z) > 0.3
      || !!terrain.bridgedAt?.(x, z) || terrain.roadAt(x, z) > 0.45,
  });
}

test('every village and small town has a fence with a gap at each street and road — and no collider', () => {
  let towns = 0, ends = 0, samples = 0;
  const coverage = [];
  for (const [seed, scale] of WORLDS) {
    const w = worldFor(seed, scale);
    for (const t of w.features.settlements.filter(s => wallTier(s.size || 1) === 'low')) {
      w.features.update(t.wx, t.wz, true);
      const edge = w.features.edgeOf(t.id);
      const R = townExtent(t).ring + 4;
      const wantKind = fenceKindFor(CULTURES[cultureOf(t)].wall);
      assert.equal(edge?.kind, wantKind, `${t.name}: fence kind ${edge?.kind}, culture wants ${wantKind}`);
      assert.ok(Math.abs(edge.r - R) < 1e-6, `${t.name}: fence at ${edge.r}, extent ring + 4 is ${R}`);
      const pieces = onRing(instancesOf(w.features, 'fence_' + wantKind), t.wx, t.wz, R, 1.5);
      towns++;
      // a point on the ring is fenced if a drawn piece's length covers it
      const fenced = (x, z) => pieces.some(p => {
        const ux = Math.sin(p.yaw), uz = Math.cos(p.yaw);
        const along = (x - p.x) * ux + (z - p.z) * uz, across = (x - p.x) * uz - (z - p.z) * ux;
        return Math.abs(along) <= (p.sz * FENCE_SEG) / 2 && Math.abs(across) < 1;
      });
      // the town HAS an edge: of the ring that could carry a fence — dry, off the road and the
      // river, and not one of its openings — at least 80% does (a harbour village standing
      // mostly in the sea has very little ring to fence, and that is not a missing fence)
      let fenceable = 0, covered = 0;
      for (let s = 0; s < TAU * R; s += 1) {
        const a = s / R, x = t.wx + Math.cos(a) * R, z = t.wz + Math.sin(a) * R;
        if (w.terrain.underwater(x, z) || w.terrain.riverAt(x, z) > 0.3 || w.terrain.roadAt(x, z) > 0.45 || w.terrain.bridgedAt(x, z)) continue;
        if (edge.gaps.some(g => apart(g.angle, a) * R < g.half + FENCE_SEG)) continue;
        fenceable++;
        if (fenced(x, z)) covered++;
      }
      if (fenceable >= 20) assert.ok(covered / fenceable >= 0.8, `${t.name}: fence covers ${covered} of ${fenceable} m it could stand on`);
      coverage.push(fenceable ? covered / fenceable : 1);
      // every drawn street end that reaches the fence, heading out, has a gap within 2 m
      for (const lane of drawnLanes(w, t)) {
        const lp = lane.points;
        for (const [e, prev] of [[lp[0], lp[1]], [lp[lp.length - 1], lp[lp.length - 2]]]) {
          const lx = e[0] - t.wx, lz = e[1] - t.wz, r = Math.hypot(lx, lz);
          if (r < R - 6) continue;
          const dx = e[0] - prev[0], dz = e[1] - prev[1];
          if ((lx * dx + lz * dz) / (r * (Math.hypot(dx, dz) || 1)) < 0.35) continue;
          ends++;
          const a = Math.atan2(lz, lx);
          let open = false;
          for (let s = -2; s <= 2 && !open; s += 0.25) {
            const b = a + s / R;
            if (!fenced(t.wx + Math.cos(b) * R, t.wz + Math.sin(b) * R)) open = true;
          }
          assert.ok(open, `${t.name} (seed ${seed}): a street reaches the fence at ${(a * 180 / Math.PI).toFixed(0)} deg with no gap`);
        }
      }
      // a walker carries on out of every street end that reaches the fence, straight through the
      // fence line, and is never stopped: nothing there files a collider
      for (const lane of drawnLanes(w, t)) {
        const lp = lane.points;
        for (const [e, prev] of [[lp[0], lp[1]], [lp[lp.length - 1], lp[lp.length - 2]]]) {
          const r = Math.hypot(e[0] - t.wx, e[1] - t.wz);
          if (r < R - 6) continue;
          const dx = e[0] - prev[0], dz = e[1] - prev[1], dl = Math.hypot(dx, dz) || 1;
          for (let s = 0; s <= 10; s += 0.5) {
            const x = e[0] + (dx / dl) * s, z = e[1] + (dz / dl) * s;
            if (w.terrain.underwater(x, z)) break;
            samples++;
            assert.equal(w.features.solids.blocked(x, z, 0.3), false, `${t.name}: a street end is blocked ${s} m on, at the fence line`);
          }
        }
      }
      // …and every road through it
      for (const c of ringCrossings(w.features.roads, t.wx, t.wz, R)) {
        if (w.terrain.underwater(c.x, c.z)) continue;
        assert.equal(fenced(c.x, c.z), false, `${t.name}: the fence crosses a road`);
      }
      // no collider was filed: the middle of every fence piece is open ground
      for (const p of pieces) {
        assert.equal(w.features.solids.blocked(p.x, p.z, 0.3), false, `${t.name}: a fence piece is solid`);
      }
    }
  }
  assert.ok(towns >= 20 && ends >= 30, `${towns} villages, ${ends} street ends`);
  coverage.sort((a, b) => a - b);
  console.log(`# fences: ${towns} villages, ${ends} street ends at the fence, ${samples} street points on the fence line, worst coverage ${(coverage[0] * 100).toFixed(0)}%`);
});

test('a hamlet has two boundary stones at each road in, and a banner — none of them solid', () => {
  let hamlets = 0, entrances = 0, skippedSides = 0;
  for (const [seed, scale] of WORLDS) {
    const w = worldFor(seed, scale);
    for (const t of w.features.settlements.filter(s => (s.size || 1) === 1)) {
      w.features.update(t.wx, t.wz, true);
      const R = townExtent(t).ring + 4;
      const stones = near(instancesOf(w.features, 'boundstone'), t.wx, t.wz, R + 3);
      const roads = ringCrossings(w.features.roads, t.wx, t.wz, R).filter(c => !w.terrain.underwater(c.x, c.z));
      hamlets++;
      for (const c of roads) {
        const onSide = side => stones.filter(s => {
          const a = Math.atan2(s.z - t.wz, s.x - t.wx);
          const d = ((a - c.angle + Math.PI * 3) % TAU) - Math.PI;
          return Math.sign(d) === side && Math.abs(d) * R < 20;
        }).length;
        entrances++;
        // a side can only go without when there is no ground to stand a stone on: road or water
        // for the whole 16 m the stone is allowed to slide (two roads forking into one hamlet)
        const standable = side => {
          for (let s = c.half ?? 3; s <= 16 + 4; s += 0.5) {
            const a = c.angle + side * s / R, x = t.wx + Math.cos(a) * R, z = t.wz + Math.sin(a) * R;
            if (w.terrain.roadAt(x, z) <= 0.45 && !w.terrain.underwater(x, z) && w.terrain.riverAt(x, z) <= 0.3) return true;
          }
          return false;
        };
        for (const side of [-1, 1]) {
          if (!standable(side)) { skippedSides++; continue; }
          assert.ok(onSide(side) >= 1, `${t.name}: a road in with no stone on the ${side < 0 ? 'left' : 'right'}`);
        }
      }
      for (const s of stones) assert.equal(w.features.solids.blocked(s.x, s.z, 0.2), false, `${t.name}: a boundary stone is solid`);
      if (roads.length) assert.ok(near(instancesOf(w.features, 'banner'), t.wx, t.wz, R + 3).length >= 1, `${t.name}: no banner`);
    }
  }
  assert.ok(hamlets >= 10 && entrances >= 10, `${hamlets} hamlets, ${entrances} entrances`);
  assert.ok(skippedSides <= entrances / 4, `${skippedSides} of ${entrances * 2} sides had no ground for a stone`);
  console.log(`# stones: ${hamlets} hamlets, ${entrances} road entrances, ${skippedSides} sides all road or water`);
});

// ------------------------------------------------------------------------ banners

test('every gatehouse flies the town\'s banner, in its culture\'s colour, clear of the passage', () => {
  let n = 0;
  for (const [seed, scale] of WORLDS) {
    const w = worldFor(seed, scale);
    for (const t of w.features.settlements.filter(s => (s.size || 1) >= 4)) {
      w.features.update(t.wx, t.wz, true);
      const ring = w.features.wallOf(t.id);
      const accent = '#' + new THREE.Color(CULTURE_KIT.cultures[cultureOf(t)].palette.accent).getHexString();
      const banners = instancesOf(w.features, 'banner');
      for (const g of ring.gates.filter(x => x.gatehouse)) {
        assert.ok(g.banner, `${t.name}: a gatehouse with no banner`);
        const b = near(banners, g.banner[0], g.banner[1], 0.5);
        assert.ok(b.length >= 1, `${t.name}: the banner on the gate record was never drawn`);
        assert.ok(Math.hypot(g.banner[0] - g.x, g.banner[1] - g.z) < g.span / 2 + 12, `${t.name}: the banner is not at its gate`);
        assert.equal(b[0].colour, accent, `${t.name}: banner ${b[0].colour}, culture accent ${accent}`);
        for (const o of b) {
          const along = (o.x - g.x) * g.tx + (o.z - g.z) * g.tz;
          assert.ok(Math.abs(along) > g.open / 2 + 0.5, `${t.name}: a banner stands in the gate`);
        }
        n++;
      }
    }
  }
  assert.ok(n >= 20, `${n} gatehouses`);
});

// ------------------------------------------------------------------------ the arrival card

/** Walk a road into a town: the road polyline from `out` metres outside, resampled at 0.5 m. */
function roadWalkIn(w, t, out) {
  const r0 = arrivalRadius(t) + out;
  for (const road of w.features.roads) {
    const pts = road.points;
    const hub = pts.findIndex(p => Math.hypot(p[0] - t.wx, p[1] - t.wz) < 3);
    if (hub < 0) continue;
    for (const dir of [-1, 1]) {
      let i = hub;
      while (i + dir >= 0 && i + dir < pts.length && Math.hypot(pts[i][0] - t.wx, pts[i][1] - t.wz) < r0) i += dir;
      if (Math.hypot(pts[i][0] - t.wx, pts[i][1] - t.wz) < r0) continue;
      const path = [];
      for (let k = i; k !== hub; k -= dir) {
        const [ax, az] = pts[k], [bx, bz] = pts[k - dir];
        const len = Math.hypot(bx - ax, bz - az);
        for (let s = 0; s < len; s += 0.5) path.push([ax + ((bx - ax) * s) / len, az + ((bz - az) * s) / len]);
      }
      path.push(pts[hub]);
      return path;
    }
  }
  return null;
}

test('the arrival card fires once per walk in, within 2 m of the town\'s edge, and never on a stroll round the market', () => {
  const w = worldFor(25392);
  const picks = [];
  for (const tier of ['wall', 'low', 'none']) {
    for (const t of w.features.settlements.filter(s => wallTier(s.size || 1) === tier)) {
      w.features.update(t.wx, t.wz, true);
      const path = roadWalkIn(w, t, 80);
      if (path) { picks.push({ t, path }); break; }
    }
  }
  assert.equal(picks.length, 3, 'need a walled town, a village and a hamlet with a road in');
  for (const { t, path } of picks) {
    w.features.update(t.wx, t.wz, true);
    const watch = createArrivalWatch();
    const R = arrivalRadius(t);
    const ext = townExtent(t);
    assert.equal(R, ext.walled ? ext.wall : ext.ring, 'the arrival radius is townExtent\'s, not a third answer');
    const fires = [];
    const step = (x, z) => { const hit = watch.step(x, z, w.features.settlements); if (hit === t) fires.push(Math.hypot(x - t.wx, z - t.wz)); else assert.equal(hit, null, `${t.name}: fired for ${hit?.name}`); };
    for (const [x, z] of path) step(x, z);
    assert.equal(fires.length, 1, `${t.name}: fired ${fires.length} times walking in`);
    assert.ok(Math.abs(fires[0] - R) <= 2, `${t.name}: fired at ${fires[0].toFixed(2)} m, the edge is ${R.toFixed(2)} m`);
    // round the market, and round the inside of the wall: nothing
    for (const rr of [8, R * 0.5, R - 1]) {
      for (let a = 0; a <= TAU; a += 0.5 / rr) step(t.wx + Math.cos(a) * rr, t.wz + Math.sin(a) * rr);
    }
    assert.equal(fires.length, 1, `${t.name}: fired again inside the town`);
    // out to just short of the re-arm distance and back: still nothing
    const back = [...path].reverse();
    // walk back out along the road to `lim` metres from the centre, then back in the same way
    const trip = lim => {
      const leg = [];
      for (const p of back) { if (Math.hypot(p[0] - t.wx, p[1] - t.wz) > lim) break; leg.push(p); }
      for (const [x, z] of leg) step(x, z);
      for (const [x, z] of [...leg].reverse()) step(x, z);
    };
    trip(R + ARRIVAL_REARM - 5);
    assert.equal(fires.length, 1, `${t.name}: re-armed ${ARRIVAL_REARM - 5} m out`);
    // right out past it and back in: exactly one more
    trip(R + ARRIVAL_REARM + 10);
    assert.equal(fires.length, 2, `${t.name}: did not fire on the second walk in`);
    assert.ok(Math.abs(fires[1] - R) <= 2);
  }
});

test('the arrival card names the town, its size, who holds it and what it offers', () => {
  const w = worldFor(25392);
  const folk = createTownFolk({ add() {}, remove() {} }, w.terrain, { features: w.features, looks: [] });
  for (const t of w.features.settlements.slice(0, 12)) {
    const card = arrivalCard(t, { roster: folk.rosterFor(t).roster, holder: 'the Cutwater' });
    assert.equal(card.name, t.name);
    assert.equal(card.size, t.kind || t.tier);
    assert.equal(card.holder, 'the Cutwater');
    assert.ok(card.services.includes('market'), `${t.name}: every settlement has a merchant`);
    if ((t.size || 1) >= 3) assert.ok(card.services.includes('smith') || card.services.includes('inn'), `${t.name}: ${card.services}`);
    assert.equal(new Set(card.services).size, card.services.length, 'no service twice');
  }
});
