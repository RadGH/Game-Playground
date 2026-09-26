// node --test prototypes/farhold/tests/round27-roadside.test.js
//
// Farhold round 27, M8 — roads you can read — and the round's leftovers M8 took on.
//
//   * three road classes, told apart by the colour on the drawn ribbon (one mesh, one draw call)
//   * signposts at junctions and town links whose every arm names the place that ROAD leads to
//     (checked here by an independent flood over the drawn carriageways, not by the planner's own
//     graph), with the round-10 reveal rule; milestones every 2 km; lamps on a town's approach
//   * the light pool: road lamps are lit last, never at the cost of a spell, a torch or your lamp
//   * the player's roads are roads: roadAt, grass, pace, hauls (never twice) and save/load
//   * where two roads' ground meets there is no step (5 seeds, both planet sizes)
//   * a companion obeys a cliff the way the player and an enemy do
//   * the switchback cache gives the same world back, faster
//   * a beast's meshes folded into one skinned mesh per material draw the same picture, and move
//   * a stronghold junction slot is covered in tests/round27-roads.test.js
//
// Everything is the real module on a real generated world (createWorld + makeTerrain +
// createFeatures), read back from the drawn buffers where the thing is drawn.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const P = await import('../js/planet.js');
const { createFeatures, ROAD_LOOKS, KERB } = await import('../js/features.js');
const R = await import('../js/roadside.js');
const { createLight } = await import('../js/light.js');
const { createRoadBook } = await import('../js/roadplan.js');
const { grassAt } = await import('../js/grass-plan.js');
const { createController } = await import('../js/player.js');
const { createLogistics } = await import('../js/logistics.js');
const { createStoreNetwork } = await import('../js/stores.js');
const { findHaulPath } = await import('../js/haulpath.js');
const { townExtent } = await import('../js/town-plan.js');
const { createPets } = await import('../js/pets.js');
const G = await import('../js/ground.js');
const { compactCreature } = await import('../js/mesh-merge.js');
const { createCreature, CREATURE_TYPES } = await import('../../../avatar-3d/js/creatures.js');

const read = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));
const balance = read('../data/balance.json');
const POW = read('../data/power.json');
const RES = read('../data/resources.json');

const SEEDS = [25392, 7, 4477, 101, 1337];
const worlds = new Map();
const quiet = fn => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
function world(seed, scale = 0.1, { features = true } = {}) {
  const key = `${seed}@${scale}`;
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  if (worlds.has(key)) return worlds.get(key);
  const made = P.createWorld({ seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const w = { seed, scale, made, terrain, features: null };
  if (features) w.features = quiet(() => createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 2600 }));
  worlds.set(key, w);
  return w;
}

// ------------------------------------------------------------------------------ class looks

/** CIE76 ΔE between two linear-RGB colours. */
function deltaE(a, b) {
  const lab = ([r, g, bl]) => {
    let x = r * 0.4124 + g * 0.3576 + bl * 0.1805, y = r * 0.2126 + g * 0.7152 + bl * 0.0722, z = r * 0.0193 + g * 0.1192 + bl * 0.9505;
    x /= 0.95047; z /= 1.08883;
    const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const p = lab(a), q = lab(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

test('three road classes you can tell apart, read off the drawn ribbon — and still one mesh', () => {
  // the drawn road mesh near a highway (25392 has the user's highway) and a trail (seed 7)
  const seen = { highway: [], road: [], trail: [] }, looks = {};
  for (const seed of [25392, 7]) {
    const { terrain, features } = world(seed);
    for (const klass of ['highway', 'road', 'trail']) {
      const path = terrain.roadPaths.find(p => p.klass === klass && p.points.length > 6 && !p.lift?.some(v => v > 0.5));
      if (!path) continue;
      const [x, z] = path.points[Math.floor(path.points.length / 2)];
      features.update(x, z, true);
      const g = features.roadMesh.geometry;
      assert.ok(g.attributes.color, 'the road mesh carries vertex colours');
      assert.equal(features.roadMesh.material.vertexColors, true);
      const pos = g.attributes.position.array, col = g.attributes.color.array, idx = g.index.array;
      // every drawn vertex within the carriageway of this road here: its colour and how far out it is
      for (let v = 0; v < pos.length / 3; v++) {
        const d = Math.hypot(pos[v * 3] - x, pos[v * 3 + 2] - z);
        if (d > path.half + 0.01) continue;
        if (terrain.roadClassAt(pos[v * 3], pos[v * 3 + 2]) !== klass) continue;
        seen[klass].push([col[v * 3], col[v * 3 + 1], col[v * 3 + 2], d]);
      }
      // …and what the surface LOOKS like from a little way off: the area-weighted colour of every
      // drawn triangle within 8 m of the point (a triangle's colour is the mean of its corners)
      let area = 0;
      const sum = [0, 0, 0];
      for (let t = 0; t < idx.length; t += 3) {
        const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
        const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3;
        if (Math.hypot(cx - x, cz - z) > 8 || terrain.roadClassAt(cx, cz) !== klass) continue;
        const ux = pos[b * 3] - pos[a * 3], uz = pos[b * 3 + 2] - pos[a * 3 + 2], vx = pos[c * 3] - pos[a * 3], vz = pos[c * 3 + 2] - pos[a * 3 + 2];
        const A = Math.abs(ux * vz - uz * vx) / 2;
        for (let k = 0; k < 3; k++) sum[k] += A * (col[a * 3 + k] + col[b * 3 + k] + col[c * 3 + k]) / 3;
        area += A;
      }
      if (area > 0) looks[klass] = sum.map(v => v / area);
    }
  }
  for (const k of ['highway', 'trail']) assert.ok(seen[k].length > 4 && looks[k], `no ${k} ribbon read back`);
  const dE = deltaE(looks.highway, looks.trail);
  console.log(`# the drawn surface, area-weighted: highway vs trail ΔE ${dE.toFixed(1)}${looks.road ? `, road vs trail ${deltaE(looks.road, looks.trail).toFixed(1)}, highway vs road ${deltaE(looks.highway, looks.road).toFixed(1)}` : ''}`);
  assert.ok(dE > 20, `highway and trail are only ΔE ${dE.toFixed(1)} apart`);
  // the kerb is IN the ribbon: kerb-coloured highway vertices, and only on the outer 0.4 m
  const kerb = new THREE.Color(ROAD_LOOKS.highway.kerb);
  const isKerb = c => Math.abs(c[0] - kerb.r) < 1e-3 && Math.abs(c[1] - kerb.g) < 1e-3 && Math.abs(c[2] - kerb.b) < 1e-3;
  const kerbs = seen.highway.filter(isKerb);
  assert.ok(kerbs.length > 0, 'no kerb-coloured vertex on the highway');
  const hw = worlds.get('25392@0.1').terrain.roadPaths.find(p => p.klass === 'highway');
  for (const c of kerbs) assert.ok(c[3] >= hw.half - KERB - 0.05, `a kerb vertex ${c[3].toFixed(2)} m from the centre of a ${hw.half} m half-width`);
  // …and the trail has its crown: crown-coloured vertices, all near the middle
  const crown = new THREE.Color(ROAD_LOOKS.trail.crown);
  const crowns = seen.trail.filter(c => Math.abs(c[0] - crown.r) < 1e-3 && Math.abs(c[1] - crown.g) < 1e-3);
  assert.ok(crowns.length > 0, 'no grass crown on the trail');
  // one mesh for all of it: the road is a single Mesh with a single material
  const { features } = world(25392);
  assert.ok(features.roadMesh.isMesh && !Array.isArray(features.roadMesh.material));
  assert.ok(KERB === 0.4);
});

// ------------------------------------------------------------------------------ signposts

/**
 * AN INDEPENDENT CHECK OF "THIS ROAD LEADS THERE": flood the drawn carriageways on a 2 m grid (the
 * union of every road's width, sampled along its points), starting a little way out along the arm
 * with a disc round the junction blocked, and see whether the named settlement's centre is reached.
 * It knows nothing about the planner's graph — only where road is.
 */
function floodReaches(terrain, from, dir, target, blockR, radius = 6000) {
  const C = 2;
  const road = new Set();
  const key = (i, j) => i * 100003 + j;
  for (const p of terrain.roadPaths) {
    const pts = p.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
      if (Math.min(Math.hypot(ax - from[0], az - from[1]), Math.hypot(bx - from[0], bz - from[1])) > radius) continue;
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 1);
      for (let q = 0; q <= n; q++) {
        const x = ax + (bx - ax) * q / n, z = az + (bz - az) * q / n;
        const r = Math.max(1, p.half - 0.5);
        for (let dx = -r; dx <= r; dx += C) for (let dz = -r; dz <= r; dz += C) {
          road.add(key(Math.round((x + dx) / C), Math.round((z + dz) / C)));
        }
      }
    }
  }
  const start = [from[0] + dir[0] * (blockR + 3), from[1] + dir[1] * (blockR + 3)];
  const si = Math.round(start[0] / C), sj = Math.round(start[1] / C);
  // the start may sit a cell off the rasterised line: take the nearest road cell within 3
  let s0 = null;
  for (let r = 0; r <= 3 && !s0; r++) for (let di = -r; di <= r && !s0; di++) for (let dj = -r; dj <= r && !s0; dj++) {
    if (road.has(key(si + di, sj + dj))) s0 = [si + di, sj + dj];
  }
  if (!s0) return { ok: false, why: 'the arm does not start on road' };
  const seen = new Set([key(...s0)]);
  const queue = [s0];
  const tx = target.wx / C, tz = target.wz / C, reach = Math.max(40, target.ring) / C;
  const bx = from[0] / C, bz = from[1] / C, br = blockR / C;
  while (queue.length) {
    const [i, j] = queue.shift();
    if (Math.hypot(i - tx, j - tz) < reach) return { ok: true };
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const ni = i + di, nj = j + dj, k = key(ni, nj);
      if (seen.has(k) || !road.has(k) || Math.hypot(ni - bx, nj - bz) < br) continue;
      seen.add(k); queue.push([ni, nj]);
    }
  }
  return { ok: false, why: 'the flood never reached it' };
}

test('every arm of every signpost names a place its road reaches — checked by flooding the drawn roads (5 seeds)', () => {
  let arms = 0, posts = 0;
  const bad = [];
  for (const seed of SEEDS) {
    const { terrain, features } = world(seed);
    const byId = new Map(features.settlements.map(s => [s.id, s]));
    for (const post of features.roadside.posts()) {
      posts++;
      for (const arm of post.arms) {
        arms++;
        const s = byId.get(arm.settlement);
        const got = floodReaches(terrain, post.at, arm.dir, { wx: s.wx, wz: s.wz, ring: townExtent(s).ring }, 2.5, arm.metres + 2000);
        if (!got.ok && bad.length < 6) bad.push(`seed ${seed} post at ${post.at.map(Math.round)} → ${s.name}: ${got.why}`);
      }
    }
  }
  console.log(`# ${posts} signposts, ${arms} arms on ${SEEDS.length} worlds`);
  assert.ok(posts > 100 && arms > 200, `only ${posts} posts / ${arms} arms`);
  assert.deepEqual(bad, []);
});

test('the walk names the FIRST place down each road: an arm\'s place is never passed on the way to it', () => {
  // a planner self-check on the graph itself: along the path the walk took, no settlement comes
  // before the one it names
  for (const seed of SEEDS) {
    const { features } = world(seed);
    const g = features.roadside.graph();
    for (const post of features.roadside.posts().filter(p => p.kind === 'junction')) {
      for (const e of g.adj[post.node]) {
        const got = R.walkBranch(g, post.node, e);
        if (!got) continue;
        const towns = got.via.slice(1, -1).filter(n => g.nodes[n].kind === 'town');
        assert.deepEqual(towns, [], `seed ${seed}: the walk passed a town before the one it named`);
      }
    }
  }
});

test('a signpost stands off every carriageway, beside its junction, and never in a town', () => {
  let n = 0, worstGap = 0;
  for (const seed of SEEDS) {
    const { terrain, features } = world(seed);
    for (const post of features.roadside.posts()) {
      n++;
      // clear of every road's carriageway by its own footing (the waystone rule: half + footing)
      for (const p of terrain.roadPaths) {
        for (let k = 0; k + 1 < p.points.length; k++) {
          const [ax, az] = p.points[k], [bx, bz] = p.points[k + 1];
          const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
          const t = l2 > 0 ? Math.max(0, Math.min(1, ((post.x - ax) * vx + (post.z - az) * vz) / l2)) : 0;
          const d = Math.hypot(ax + vx * t - post.x, az + vz * t - post.z);
          assert.ok(d >= p.half + R.FOOTING.signpost, `seed ${seed}: a signpost stands ${d.toFixed(2)} m from road ${p.id}'s centre (half ${p.half})`);
        }
      }
      assert.ok(!terrain.underwater(post.x, post.z) && !terrain.bridgedAt(post.x, post.z));
      const gap = Math.hypot(post.x - post.at[0], post.z - post.at[1]);
      worstGap = Math.max(worstGap, gap);
      if (post.kind === 'junction') {
        // the plan's 8 m is for a T; a four-way crossing of two highways puts the nearest clear
        // corner 8.3 m out, and a post is allowed four 1 m steps further if that corner is wet
        assert.ok(gap <= 13, `seed ${seed}: a junction post ${gap.toFixed(1)} m from its junction`);
        assert.equal(features.roadside.inTown(post.x, post.z), null, `seed ${seed}: a junction post inside a town`);
      }
    }
  }
  console.log(`# ${n} posts, all clear of every carriageway; furthest ${worstGap.toFixed(1)} m from its junction`);
});

test('a sign names only what you know: a fresh save reads "?" except in the region you started in', () => {
  const { features } = world(7);
  const zoneOf = (x, z) => ({ id: Math.floor(x / 3000) * 1000 + Math.floor(z / 3000) });   // any partition works
  const posts = features.roadside.posts();
  const post = posts.find(p => p.arms.length >= 2);
  const start = zoneOf(post.x, post.z).id;
  const text = R.readSign(post, { settlements: features.settlements, zoneOf, knowsZone: id => id === start });
  const byId = new Map(features.settlements.map(s => [s.id, s]));
  for (const arm of post.arms) {
    const s = byId.get(arm.settlement);
    const known = zoneOf(s.wx, s.wz).id === start;
    if (known) assert.ok(text.includes(s.name), `a known place is not named: ${text}`);
    else assert.ok(!text.includes(s.name), `an unknown place is named: ${text}`);
  }
  // nothing known at all: every arm is "?"
  const blind = R.readSign(post, { settlements: features.settlements, zoneOf, knowsZone: () => false });
  assert.equal((blind.match(/\? \d/g) || []).length, post.arms.length, blind);
  // and the distance is by road, in km, on every arm
  assert.equal((text.match(/ km/g) || []).length, post.arms.length);
});

// ------------------------------------------------------------------------------ milestones

test('milestones: every 2 km (± 50 m) along every highway and road lane, beside it, at full size', () => {
  let n = 0;
  for (const seed of [25392, 7]) {
    const { terrain, features } = world(seed, 1);
    const stones = features.roadside.milestones();
    for (const m of stones) {
      n++;
      const path = terrain.roadPaths.find(p => p.id === m.path);
      assert.ok(path && (path.klass === 'highway' || path.klass === 'road'), `seed ${seed}: a milestone on a ${path?.klass}`);
      // measured independently: its arc length along the lane to the point it stands beside
      let s = 0, best = null;
      for (let k = 0; k + 1 < path.points.length; k++) {
        const [ax, az] = path.points[k], [bx, bz] = path.points[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const vx = bx - ax, vz = bz - az, l2 = len * len;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((m.along[0] - ax) * vx + (m.along[1] - az) * vz) / l2)) : 0;
        const d = Math.hypot(ax + vx * t - m.along[0], az + vz * t - m.along[1]);
        if (!best || d < best.d) best = { d, s: s + len * t };
        s += len;
      }
      const off = best.s - Math.round(best.s / R.MILESTONE_EVERY) * R.MILESTONE_EVERY;
      assert.ok(Math.abs(off) <= 50, `seed ${seed}: a milestone ${off.toFixed(0)} m off its 2 km mark on road ${m.path}`);
      const side = Math.hypot(m.x - m.along[0], m.z - m.along[1]);
      assert.ok(Math.abs(side - (path.half + R.FOOTING.milestone + 1)) < 0.01, 'the waystone rule: half + footing + 1');
    }
    // consecutive stones on one lane are a whole number of 2 km apart
    const byPath = new Map();
    for (const m of stones) (byPath.get(m.path) || byPath.set(m.path, []).get(m.path)).push(m.s);
    for (const [id, list] of byPath) {
      list.sort((a, b) => a - b);
      for (let i = 1; i < list.length; i++) {
        const gap = list[i] - list[i - 1];
        const k = Math.round(gap / R.MILESTONE_EVERY);
        assert.ok(k >= 1 && Math.abs(gap - k * R.MILESTONE_EVERY) <= 100, `seed ${seed}: road ${id} stones ${gap.toFixed(0)} m apart`);
      }
    }
  }
  console.log(`# ${n} milestones at full size on 2 worlds`);
  assert.ok(n > 50, `only ${n} milestones`);
});

// ------------------------------------------------------------------------------ lamps

test('lamps: every 30 m on the approach to a size-3+ town, none on the carriageway and none inside a wall', () => {
  let n = 0, towns = 0;
  for (const seed of SEEDS) {
    const { terrain, features } = world(seed);
    for (const s of features.settlements.filter(q => (q.size || 1) >= R.LAMP_MIN_SIZE)) {
      // plan the town first (as the game does), so its real wall is the one measured
      features.update(s.wx, s.wz, true);
      const ext = townExtent(s);
      const lamps = features.roadside.lampsFor(s);
      if (lamps.length) towns++;
      for (const l of lamps) {
        n++;
        for (const p of terrain.roadPaths) {
          for (let k = 0; k + 1 < p.points.length; k++) {
            const [ax, az] = p.points[k], [bx, bz] = p.points[k + 1];
            const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
            const t = l2 > 0 ? Math.max(0, Math.min(1, ((l.x - ax) * vx + (l.z - az) * vz) / l2)) : 0;
            assert.ok(Math.hypot(ax + vx * t - l.x, az + vz * t - l.z) >= p.half + 1, `seed ${seed}: a lamp on road ${p.id}`);
          }
        }
        for (const t of features.settlements) {
          const e = townExtent(t);
          assert.ok(Math.hypot(t.wx - l.x, t.wz - l.z) >= Math.max(e.wall, e.ring), `seed ${seed}: a lamp inside ${t.name}`);
        }
        assert.ok(Math.hypot(s.wx - l.x, s.wz - l.z) <= Math.max(ext.wall, ext.ring) + R.LAMP_REACH + 12, 'a lamp past 400 m');
      }
      // …and the spacing along each approach is 30 m (consecutive lamps on one road)
      const byPath = new Map();
      for (const l of lamps) (byPath.get(l.path) || byPath.set(l.path, []).get(l.path)).push(l);
      for (const list of byPath.values()) {
        for (let i = 1; i < list.length; i++) {
          const d = Math.hypot(list[i].x - list[i - 1].x, list[i].z - list[i - 1].z);
          if (d < 80) assert.ok(d > 20, `seed ${seed}: two lamps ${d.toFixed(1)} m apart`);
        }
      }
    }
  }
  console.log(`# ${n} lamps on the approaches to ${towns} towns (5 worlds)`);
  assert.ok(n > 200);
});

test('the light pool: road lamps are lit last — a spell, a carried torch and your own lamp are never the ones left dark', () => {
  const scene = new THREE.Scene();
  const light = createLight(scene, { balance });
  const pool = light.pool.length;
  const at = { x: 0, y: 0, z: 0 };
  // thirty lamps around you, the nearest at 2 m; a spell 40 m out and two torches 60 m out
  const lamps = Array.from({ length: 30 }, (_, i) => ({ x: 2 + i * 3, y: 3, z: 1, color: '#ffc877', range: 16, intensity: 1.3, tier: -1, lamp: true }));
  const spell = { x: 40, y: 1, z: 0, color: '#66aaff', range: 12, intensity: 3, priority: 6, spell: true };
  const torches = [{ x: 60, y: 1.5, z: 0, priority: 2, torch: true }, { x: 0, y: 1.5, z: 60, priority: 2, torch: true }];
  light.setTorch(true);
  light.setSources([...lamps, spell, ...torches]);
  light.update(1 / 60, at, { day: 0 });
  const lit = light.pool.filter(l => l.visible);
  assert.ok(lit.length <= pool, `${lit.length} lights on with a pool of ${pool}`);
  const litAt = (x, z) => lit.some(l => Math.abs(l.position.x - x) < 1e-6 && Math.abs(l.position.z - z) < 1e-6);
  assert.ok(litAt(spell.x, spell.z), 'the spell lost its light to a road lamp');
  for (const t of torches) assert.ok(litAt(t.x, t.z), 'a carried torch lost its light to a road lamp');
  assert.ok(light.torch.intensity > 0, 'the player lamp went out');
  assert.equal(lit.length, pool, 'the pool is used to the full');
  // with nothing else asking, the nearest lamps get the whole pool
  light.setSources(lamps);
  light.update(1 / 60, at, { day: 0 });
  assert.equal(light.pool.filter(l => l.visible).length, Math.min(pool, lamps.length));
});

// ------------------------------------------------------------------------------ player roads

/** Open, dry, gentle ground well away from any world road on seed 7, with 120 m of room east. */
function openGround(t) {
  for (let z = 1500; z < t.depthM - 1500; z += 173) for (let x = 1500; x < t.widthM - 1500; x += 211) {
    let ok = true;
    for (let d = -10; d <= 130 && ok; d += 5) {
      if (t.roadAt(x + d, z) > 0 || t.underwater(x + d, z) || t.slopeAt(x + d, z, 4) > 0.15 || t.riverAt(x + d, z) > 0) ok = false;
    }
    if (ok) return { x, z };
  }
  return null;
}

test('player roads are roads: roadAt, grass, walking pace, and it survives a save', () => {
  const { terrain } = world(7, 0.1, { features: false });
  const spot = openGround(terrain);
  assert.ok(spot, 'no open ground to lay a road on');
  const book = createRoadBook({ terrain });
  terrain.setLaneBook(book);
  try {
    const before = terrain.roadAt(spot.x + 60, spot.z);
    const v0 = terrain.laneVersion;
    const laid = book.lay([[spot.x, spot.z], [spot.x + 120, spot.z]], { half: 2, level: false });
    assert.ok(laid.ok);
    assert.ok(terrain.laneVersion !== v0, 'laying a lane does not tell the grass bake');
    const on = terrain.roadAt(spot.x + 60, spot.z);
    assert.equal(before, 0);
    assert.ok(on > 0.45, `roadAt on the lane is ${on}`);
    // grass reads `road` straight through
    assert.equal(grassAt({ plantable: true, biomeKey: 'grassland', road: on }), 0);
    assert.ok(grassAt({ plantable: true, biomeKey: 'grassland', road: terrain.roadAt(spot.x + 60, spot.z + 30) }) > 0, 'grass gone off the road too');
    // a walker on it is ×1.15 (balance.roads.walk), measured on js/player.js
    const step = (x, z, roads) => {
      const c = createController(terrain, { ...balance, roads: { ...balance.roads, ...roads } }, new THREE.PerspectiveCamera(), { obstacles: [] });
      c.teleport(x, z);
      c.update(1 / 30, { keys: new Set(), pressed: new Set(), look: [0, 0], forward: 0, strafe: 0, run: false });
      c.yaw = Math.PI / 2;
      const x0 = c.x;
      c.update(1 / 30, { keys: new Set(), pressed: new Set(), look: [0, 0], forward: 1, strafe: 0, run: false });
      return c.x - x0;
    };
    const k = step(spot.x + 40, spot.z, {}) / step(spot.x + 40, spot.z, { walk: 1, mount: 1, highway: 1 });
    assert.ok(Math.abs(k - balance.roads.walk) < 1e-6, `a walker on your road is ×${k.toFixed(4)}`);
    // save and load: the same roadAt after the round trip
    const saved = JSON.parse(JSON.stringify(book.toJSON()));
    const again = createRoadBook({ terrain, saved });
    terrain.setLaneBook(again);
    assert.equal(terrain.roadAt(spot.x + 60, spot.z).toFixed(6), on.toFixed(6));
    // and no lanes at all is exactly the world's own answer
    terrain.setLaneBook(createRoadBook({ terrain }));
    assert.equal(terrain.roadAt(spot.x + 60, spot.z), 0);
  } finally {
    terrain.setLaneBook(null);
  }
});

test('a haul over your road is quoted like one over a world road — and a road on a road is not paid twice', () => {
  const { terrain } = world(7, 0.1, { features: false });
  // two stores on a straight stretch of a world road whose haul path runs on it all the way
  let onWorld = null;
  for (const p of terrain.roadPaths) {
    if (p.lift?.some(v => v > 0.5)) continue;
    for (let i = 0; i + 8 < p.points.length && !onWorld; i++) {
      const a = p.points[i], b = p.points[i + 8];
      const path = findHaulPath({ from: { x: a[0], z: a[1] }, to: { x: b[0], z: b[1] }, terrain });
      if (!path.ok || path.metres < 60) continue;
      let all = true;
      for (const q of path.points) if (terrain.roadAt(q[0], q[1]) <= 0.45) { all = false; break; }
      if (all) onWorld = { a, b };
    }
    if (onWorld) break;
  }
  assert.ok(onWorld, 'no straight stretch of world road for a haul');
  const quoteBetween = (a, b, roads) => {
    const stores = createStoreNetwork({ power: POW, materials: RES.materials });
    stores.add({ id: 'A', type: 'storage_silo', name: 'A', x: a[0], z: a[1] });
    stores.add({ id: 'B', type: 'storage_silo', name: 'B', x: b[0], z: b[1] });
    return createLogistics({ stores, terrain, roads, power: POW, materials: RES.materials }).quote({ from: { x: a[0], z: a[1] }, to: { x: b[0], z: b[1] } });
  };
  const world1 = quoteBetween(onWorld.a, onWorld.b, null);
  assert.ok(world1.ok && world1.roadFraction > 0.99, `the world road read as ${world1.roadFraction}`);
  // the same haul on open ground, over a lane of your own laid along its path
  const spot = openGround(terrain);
  const b2 = [spot.x + Math.hypot(onWorld.b[0] - onWorld.a[0], onWorld.b[1] - onWorld.a[1]), spot.z];
  const bare = quoteBetween([spot.x, spot.z], b2, null);
  const book = createRoadBook({ terrain });
  terrain.setLaneBook(book);
  try {
    book.lay(bare.path.points, { half: 2, level: false });
    const mine = quoteBetween([spot.x, spot.z], b2, book);
    assert.ok(mine.roadFraction > 0.99, `your road read as ${mine.roadFraction}`);
    assert.ok(Math.abs(mine.speed / world1.speed - 1) < 0.01, `your road hauls at ${mine.speed} m/s, a world road at ${world1.speed}`);
    // a lane laid on top of the world road: still one road
    book.lay(world1.path.points, { half: 2, level: false });
    const both = quoteBetween(onWorld.a, onWorld.b, book);
    assert.ok(Math.abs(both.speed / world1.speed - 1) < 1e-9, `a road on a road hauls at ${both.speed} against ${world1.speed}`);
    assert.ok(both.roadFraction <= 1);
    console.log(`# haul speed: world road ${world1.speed.toFixed(2)} m/s, your road ${mine.speed.toFixed(2)}, both ${both.speed.toFixed(2)}, bare ${bare.speed.toFixed(2)}`);
  } finally {
    terrain.setLaneBook(null);
  }
});

// ------------------------------------------------------------------------------ steps

/**
 * THE GROUND WHERE TWO ROADS MEET HAS NO STEP. For every road point within reach of another
 * road's carriageway, `heightAt` is walked every 0.2 m from the point to the other road's nearest
 * point: no two neighbouring samples may differ by more than 0.1 m. Before M8 this found 1.37 m at
 * Stonecrown on seed 7 (road 18 held up by water onto 42), 0.83 m and 0.47 m on shallow joins.
 */
function worstStep(t) {
  let worst = 0, where = '';
  const paths = t.roadPaths;
  for (const A of paths) for (const B of paths) {
    if (A === B) continue;
    for (let i = 0; i < A.points.length; i++) {
      const [x, z] = A.points[i];
      let best = null;
      for (let k = 0; k + 1 < B.points.length; k++) {
        const [ax, az] = B.points[k], [bx, bz] = B.points[k + 1];
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
        const u = l2 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
        const d = Math.hypot(ax + vx * u - x, az + vz * u - z);
        if (!best || d < best.d) best = { d, x: ax + vx * u, z: az + vz * u };
      }
      if (!best || best.d > A.half + B.half + 2) continue;
      const n = Math.max(1, Math.ceil(best.d / 0.2));
      let prev = null;
      for (let s = 0; s <= n; s++) {
        const px = x + (best.x - x) * s / n, pz = z + (best.z - z) * s / n;
        if (t.bridgedAt(px, pz)) { prev = null; continue; }
        const h = t.heightAt(px, pz);
        if (prev !== null && Math.abs(h - prev) > worst) { worst = Math.abs(h - prev); where = `roads ${A.id}/${B.id} at ${px | 0},${pz | 0}`; }
        prev = h;
      }
    }
  }
  return { worst, where };
}

test('where two roads meet, their ground meets: no step over 0.1 m (5 seeds, both planet sizes)', () => {
  const rows = [];
  for (const scale of [0.1, 1]) {
    for (const seed of SEEDS) {
      const { terrain } = world(seed, scale, { features: false });
      const { worst, where } = worstStep(terrain);
      rows.push(`${seed}@${scale} ${worst.toFixed(3)}`);
      assert.ok(worst <= 0.1, `seed ${seed} at scale ${scale}: a ${worst.toFixed(2)} m step, ${where}`);
    }
  }
  console.log('# worst step where roads meet: ' + rows.join(', '));
});

test('the seam and the overlap pass are real: turned off, the Stonecrown step comes back', () => {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
  const { made } = world(7, 0.1, { features: false });
  const off = P.makeTerrain(made.world, made.planet, { ...balance.terrain, conformRoads: false, roadSeam: 0 });
  const { worst } = worstStep(off);
  assert.ok(worst > 1, `without the fix the worst step is only ${worst.toFixed(2)} m — the test is not measuring it`);
});

// ------------------------------------------------------------------------------ companions and cliffs

test('a companion obeys a cliff like the player and an enemy: it does not run up a 63-degree face after you', async () => {
  const t = world(7, 0.1, { features: false }).terrain;
  const GRADE = Math.tan(63 * Math.PI / 180);
  // the M7 face finder, in short: a face past the line with a dry foot 4 m below and a lip 4 m up
  let s = 7 * 7919 + 13;
  const rng = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const faces = [];
  for (let tries = 0; faces.length < 12 && tries < 400000; tries++) {
    const x = rng() * t.widthM, z = 200 + rng() * (t.depthM - 400);
    if (t.underwater(x, z) || G.steepAt(t, x, z) < GRADE || t.roadAt(x, z) > 0.2) continue;
    const n = t.normalAt(x, z, 1), l = Math.hypot(n[0], n[2]) || 1, ux = -n[0] / l, uz = -n[2] / l;
    const fx = x - ux * 4, fz = z - uz * 4;
    if (t.underwater(fx, fz) || G.steepAt(t, fx, fz) >= GRADE) continue;
    const foot = t.heightAt(fx, fz);
    let lip = -Infinity;
    for (let d = 0; d <= 12; d += 0.5) lip = Math.max(lip, t.heightAt(x + ux * d, z + uz * d));
    if (lip - foot < 4 || faces.some(p => Math.hypot(p.x - x, p.z - z) < 150)) continue;
    faces.push({ x, z, ux, uz, fx, fz, lip });
  }
  assert.ok(faces.length >= 8, `only ${faces.length} faces`);
  const def = { id: 'test_hound', name: 'Hound', speed: 6.5, look: { creature: { type: 'hound' } } };
  const rpg = { fx: { product: () => 1 }, strike: () => ({ amount: 0 }) };
  const run = async (f) => {
    const pets = createPets({ scene: { add() {}, remove() {} }, terrain: t, rpg, defs: [def], balance });
    const owner = { x: f.x + f.ux * 14, z: f.z + f.uz * 14, y: t.heightAt(f.x + f.ux * 14, f.z + f.uz * 14), level: 1, hp: 100 };
    const [p] = await pets.summon(def.id, owner, { at: { x: f.fx, z: f.fz } });
    p.x = f.fx; p.z = f.fz; p.y = t.heightAt(f.fx, f.fz);
    for (let k = 0; k < 150; k++) pets.update(1 / 30, owner, owner);
    return p;
  };
  let climbed = 0, before = 0;
  for (const f of faces) {
    const p = await run(f);
    if (p.y >= f.lip) climbed++;
    // the A/B: with the line moved out of reach the same companion walks straight up
    const was = { deg: G.CLIFF.deg, capDeg: G.CLIFF.capDeg };
    G.CLIFF.deg = 89.9; G.CLIFF.capDeg = 89.9;
    try { const q = await run(f); if (q.y >= f.lip - 0.5) before++; } finally { Object.assign(G.CLIFF, was); }
  }
  console.log(`# companion: ${climbed}/${faces.length} faces climbed in 5 s with the rule, ${before}/${faces.length} without`);
  assert.equal(climbed, 0);
  assert.ok(before > 0, 'without the rule the companion never reached the top either — the test is not measuring the rule');
});

// ------------------------------------------------------------------------------ the fold cache

test('the switchback cache: the second build of a world skips the fold and comes out identical', () => {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 1);
  P.clearFoldCache();
  const made = P.createWorld({ seed: 25392, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
  const sig = t => t.roadPaths.map(p => p.id + ':' + p.points.map(q => q[0].toFixed(3) + ',' + q[1].toFixed(3) + (q.fold ? 'f' : '') + (q.steep ? 's' : '')).join(';')).join('|');
  const t0 = performance.now();
  const a = P.makeTerrain(made.world, made.planet, balance.terrain);
  const first = performance.now() - t0;
  const t1 = performance.now();
  const b = P.makeTerrain(made.world, made.planet, balance.terrain);
  const second = performance.now() - t1;
  console.log(`# makeTerrain 25392 @ full size: first ${first.toFixed(0)} ms (fold ${a.roadFoldMs.toFixed(0)} ms), second ${second.toFixed(0)} ms (fold ${b.roadFoldMs.toFixed(0)} ms)`);
  assert.ok(a.roadFolds > 0, 'the user\'s world has switchbacks to cache');
  assert.equal(sig(b), sig(a), 'the cached build is not the same world');
  assert.equal(b.roadFolds, a.roadFolds);
  assert.ok(b.roadFoldMs < a.roadFoldMs / 5, `the second fold still took ${b.roadFoldMs.toFixed(0)} ms`);
  // a different knob is a different key: nothing stale is read
  const c = P.makeTerrain(made.world, made.planet, { ...balance.terrain, foldCells: 1.2 });
  assert.ok(c.roadFoldMs > b.roadFoldMs, 'a changed fold knob was served from the cache');
});

// ------------------------------------------------------------------------------ draw calls

test('a beast folded into one skinned mesh per material: fewer draw calls, the same surface, and it still moves', async () => {
  let before = 0, after = 0;
  for (const type of Object.keys(CREATURE_TYPES)) {
    const a = await createCreature({ type }), b = await createCreature({ type });
    const count = g => { let n = 0; g.traverse(o => { if (o.isMesh) n++; }); return n; };
    const n0 = count(b.group);
    const got = compactCreature(b);
    before += n0; after += count(b.group);
    assert.ok(count(b.group) <= n0);
    // the same surface: the world-space bounding box of every drawn triangle agrees
    a.group.updateMatrixWorld(true); b.group.updateMatrixWorld(true);
    const boxA = new THREE.Box3().setFromObject(a.group, true), boxB = new THREE.Box3().setFromObject(b.group, true);
    for (const k of ['min', 'max']) for (const ax of ['x', 'y', 'z']) {
      assert.ok(Math.abs(boxA[k][ax] - boxB[k][ax]) < 1e-3, `${type}: the folded body is a different shape (${k}.${ax})`);
    }
    // the same colours: every original material colour is on the folded body's vertices
    const want = new Set(), have = new Set();
    a.group.traverse(o => { if (o.isMesh && !o.material.vertexColors) want.add(o.material.color.getHexString()); });
    b.group.traverse(o => {
      if (!o.isMesh) return;
      if (!o.material.vertexColors) { have.add(o.material.color.getHexString()); return; }
      const c = o.geometry.attributes.color.array;
      for (let i = 0; i < c.length; i += 3) have.add(new THREE.Color(c[i], c[i + 1], c[i + 2]).getHexString());
    });
    for (const h of want) assert.ok(have.has(h), `${type}: the colour #${h} went missing`);
    // it still animates: a clip moves the folded body
    b.setAnim('walk');
    // (a skinned body moves its VERTICES, not its matrix: read them through the bones)
    const snap = () => {
      const v = [], q = new THREE.Vector3();
      b.group.updateMatrixWorld(true);
      b.group.traverse(o => {
        if (!o.isMesh) return;
        const n = o.geometry.attributes.position.count;
        for (let i = 0; i < n; i += Math.max(1, n >> 5)) { o.getVertexPosition(i, q); q.applyMatrix4(o.matrixWorld); v.push(q.x.toFixed(4), q.y.toFixed(4), q.z.toFixed(4)); }
      });
      return v.join();
    };
    const s0 = snap(); b.update(0.2, 0.2); const s1 = snap();
    if (type !== 'turret') assert.notEqual(s0, s1, `${type}: the folded body no longer moves`);
    assert.ok(got.after <= got.before);
  }
  console.log(`# ${Object.keys(CREATURE_TYPES).length} creature types: ${before} meshes (draw calls) folded to ${after}`);
  assert.ok(after < before * 0.2);
});
