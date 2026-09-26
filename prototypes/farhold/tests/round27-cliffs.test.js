// node --test prototypes/farhold/tests/round27-cliffs.test.js
//
// Round 27 M7 — cliffs are rock, and roads are faster.
//
// Round 21 put real cliff faces in the ground (2-4 m across and 5-20 m tall at Super tiny) and
// nothing treated them as anything but a hill: the player walked up a face at a fifth of the pace,
// and an enemy had no slope term at all and ran straight up it. The faces were bare grass-green at
// their foot, went green again from the third terrain ring out, and — separately — no peak on any
// planet size was ever painted snow.
//
// Everything below drives the REAL modules on real generated worlds: js/player.js's controller,
// js/actors.js's EnemyField, js/props.js's instanced meshes (Three.js loads in node through
// three-loader.mjs) and js/planet.js's colour. Nothing asserts a sentence or a tuning number; the
// knobs are moved to odd values and the modules are asked (the dead-data rule).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);
const THREE = await import('three');
const P = await import('../js/planet.js');
const { createController } = await import('../js/player.js');
const { EnemyField } = await import('../js/actors.js');
const { createProps } = await import('../js/props.js');
const { rockSteep } = await import('../js/terrain.js');
const G = await import('../js/ground.js');
const { laneRibbon } = await import('../js/roadplan.js');

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));
const GRADE = Math.tan(63 * Math.PI / 180);

// the plan's standard seeds
const SEEDS = [25392, 7, 4477, 101, 1337];
const cache = new Map();
function world(seed, scale = 0.1) {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  const key = `${seed}@${scale}`;
  if (cache.has(key)) return cache.get(key);
  const made = P.createWorld({ seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
  const w = { seed, scale, made, terrain: P.makeTerrain(made.world, made.planet, balance.terrain) };
  cache.set(key, w);
  return w;
}

/** A small seeded stream, so the cliff points a test picks are the same every run. */
function stream(s) {
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const uphillOf = (t, x, z) => {
  const n = t.normalAt(x, z, 1);
  const l = Math.hypot(n[0], n[2]) || 1;
  return [-n[0] / l, -n[2] / l];
};

/**
 * MEASURED CLIFF POINTS: land steeper than the line, not on a road, a bridge or in water, with a
 * dry, walkable foot 4 m below it and a real face above it — the lip (the highest ground in the
 * 12 m uphill of the point) at least 4 m over the foot. A 2 m step you can jump is not a cliff.
 */
function cliffPoints(t, n, seed) {
  const rng = stream(seed * 7919 + 13);
  const out = [];
  let tries = 0;
  while (out.length < n && tries++ < 400000) {
    const x = rng() * t.widthM, z = 200 + rng() * (t.depthM - 400);
    if (t.underwater(x, z) || t.heightAt(x, z) <= t.seaLevel + 1) continue;
    if (G.steepAt(t, x, z) < GRADE) continue;
    if (t.roadAt(x, z) > 0.2 || t.bridgedAt?.(x, z)) continue;
    const [ux, uz] = uphillOf(t, x, z);
    const fx = x - ux * 4, fz = z - uz * 4;
    if (t.underwater(fx, fz) || t.roadAt(fx, fz) > 0.2 || G.steepAt(t, fx, fz) >= GRADE) continue;
    const foot = t.heightAt(fx, fz);
    let lip = -Infinity;
    for (let d = 0; d <= 12; d += 0.5) lip = Math.max(lip, t.heightAt(x + ux * d, z + uz * d));
    if (lip - foot < 4) continue;
    if (out.some(p => Math.hypot(p.x - x, p.z - z) < 150)) continue;
    out.push({ x, z, ux, uz, fx, fz, foot, lip });
  }
  return out;
}

const input = (forward = 1, strafe = 0) => ({ keys: new Set(), pressed: new Set(), look: [0, 0], forward, strafe, run: false });
const controller = (t, bal = balance) => createController(t, bal, new THREE.PerspectiveCamera(), { obstacles: [] });

/** Walk a controller for `seconds` with a fixed input at 60 fps. */
function walk(c, seconds, inp) {
  for (let s = 0; s < seconds; s += 1 / 60) c.update(1 / 60, inp);
}

/** Turn the cliff rule off (for the A/B), and back on. */
function withoutCliffs(fn) {
  const was = { deg: G.CLIFF.deg, capDeg: G.CLIFF.capDeg };
  G.CLIFF.deg = 89.9; G.CLIFF.capDeg = 89.9;
  try { return fn(); } finally { Object.assign(G.CLIFF, was); }
}

// ---------------------------------------------------------------------------------- the line

test('the share of land past the cliff line, per seed — never more than 3%', () => {
  const rows = [];
  for (const seed of SEEDS) {
    const t = world(seed).terrain;
    const rng = stream(seed);
    let land = 0, over = 0;
    for (let i = 0; i < 40000; i++) {
      const x = rng() * t.widthM, z = rng() * t.depthM;
      if (t.underwater(x, z) || t.heightAt(x, z) <= t.seaLevel) continue;
      land++;
      if (G.steepAt(t, x, z) >= GRADE) over++;
    }
    const share = over / land;
    rows.push(`${seed} ${(share * 100).toFixed(2)}%`);
    assert.ok(share <= 0.03, `seed ${seed}: ${(share * 100).toFixed(2)}% of the land is cliff`);
  }
  console.log(`# land past 63 degrees: ${rows.join(', ')}`);
});

test('a road is always a way up: every drawn road point is under the line, and a walker along every lane is never refused (5 seeds)', () => {
  /**
   * Two measurements. The GROUND: every point of every drawn lane (both edges and the middle, off
   * bridges and water) is under the cliff line — except where the steepest way is straight down a
   * river's channel or a bridge's hole beside the road (the road itself is flat there), which is
   * why the rule measures along the step. And the RULE: a walker taking 0.3 m steps along every
   * lane, both ways, on the real `climbable` with its feet on the real decks, is never refused.
   */
  let points = 0, worst = 0, where = '', steps = 0, refused = [];
  for (const seed of SEEDS) {
    const t = world(seed).terrain;
    for (const road of t.roadPaths) {
      const groundAt = (x, z) => (t.bridgedAt?.(x, z) ? -Infinity : t.heightAt(x, z));
      const pos = laneRibbon({ points: road.points, surface: road.surface, half: road.half }, { lift: 0.06, groundAt }).position;
      const n = pos.length / 6;
      for (const u of [0.15, 0.5, 0.85]) {
        const lane = [];
        for (let k = 0; k < n; k++) lane.push([pos[k * 6] + (pos[k * 6 + 3] - pos[k * 6]) * u, pos[k * 6 + 2] + (pos[k * 6 + 5] - pos[k * 6 + 2]) * u]);
        for (const [x, z] of lane) {
          if (t.bridgedAt?.(x, z, 4) || t.underwater(x, z)) continue;
          const r = t.riverInfoAt(x, z);
          if (r && r.dist < r.half + 8) continue;
          const s = G.steepAt(t, x, z);
          points++;
          if (s > worst) { worst = s; where = `seed ${seed} road ${road.id} at ${x | 0},${z | 0}`; }
        }
        for (const way of [lane, lane.slice().reverse()]) {
          let px = null, pz = null, feet = null;
          for (let k = 1; k < way.length; k++) {
            const [ax, az] = way[k - 1], [bx, bz] = way[k];
            const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.3));
            for (let j = 1; j <= m; j++) {
              const x = ax + (bx - ax) * j / m, z = az + (bz - az) * j / m;
              // swimming is not walking: the rule starts again on the far bank
              if (t.underwater(x, z) && G.deckAt(t, x, z, (feet ?? -Infinity) + 0.5) === null) { feet = null; continue; }
              if (feet !== null) {
                steps++;
                if (!G.climbable(t, x, z, px, pz, 0, feet)) refused.push(`seed ${seed} road ${road.id} at ${x | 0},${z | 0}`);
              }
              feet = G.groundAt(t, x, z, feet === null ? Infinity : feet + 0.5);
              px = x; pz = z;
            }
          }
        }
      }
    }
  }
  console.log(`# ${points} road lane points, steepest ${(Math.atan(worst) * 180 / Math.PI).toFixed(1)} degrees (${where}); ${steps} steps walked, ${refused.length} refused`);
  assert.ok(worst < GRADE, `a road point is a cliff: ${worst.toFixed(2)} at ${where}`);
  assert.deepEqual(refused.slice(0, 5), [], `${refused.length} steps along a road were refused`);
});

// ---------------------------------------------------------------------------------- walkers

/** A body that stands in for the Chibi 2 actor: everything js/actors.js calls on one, doing nothing. */
function fakeActor() {
  const v = () => ({ x: 0, y: 0, z: 0, set() {}, setScalar() {} });
  return {
    beast: true, anims: [],
    group: { position: v(), rotation: v(), scale: v(), add() {}, remove() {} },
    setAnim(name) { this.anims.push(name); }, update() {}, dispose() {},
  };
}

/** The REAL EnemyField, not spawning on its own, with one wolf-shaped body put down by hand. */
function wolfAt(t, x, z) {
  const field = new EnemyField({ scene: { add() {}, remove() {} }, terrain: t, rpg: {}, defs: [], balance: { ...balance, seed: 1 } });
  field.paused = true;
  const e = {
    id: 'w1', defId: 'wolf', name: 'Wolf', x, z, y: t.heightAt(x, z), state: 'chase', speed: 6.5, reach: 1.8,
    attackEvery: 1.4, swingTimer: 0, aggroRange: 60, stagger: 0, hitFlash: 0, facing: 0, hover: 0, bob: 0,
    hp: 100, maxHp: 100, dmg: [1, 2], armor: 0, level: 1, rank: 'normal', modifiers: [], bodyR: 0.6,
    actor: fakeActor(), dying: null, removed: false,
  };
  field.enemies.push(e);
  return { field, e };
}

test('a cliff stops the player and the wolf chasing them, on 20 measured faces each on seeds 7 and 25392 (and 25392 full size)', () => {
  const rows = [];
  for (const [seed, scale] of [[7, 0.1], [25392, 0.1], [25392, 1]]) {
    const t = world(seed, scale).terrain;
    const faces = cliffPoints(t, 20, seed);
    assert.equal(faces.length, 20, `seed ${seed}: only ${faces.length} measured cliff points`);
    let worstPlayer = -Infinity, worstWolf = -Infinity, before = 0;
    for (const f of faces) {
      // the player: from the foot, straight at the face, for five seconds
      const c = controller(t);
      c.teleport(f.fx, f.fz);
      c.yaw = Math.atan2(f.ux, f.uz);
      walk(c, 5, input(1));
      worstPlayer = Math.max(worstPlayer, c.y - f.lip);
      assert.ok(c.y < f.lip, `seed ${seed}: the player walked up the face at ${f.x | 0},${f.z | 0} (${c.y.toFixed(1)} vs lip ${f.lip.toFixed(1)})`);
      // …which they could before this milestone
      withoutCliffs(() => {
        const o = controller(t);
        o.teleport(f.fx, f.fz);
        o.yaw = Math.atan2(f.ux, f.uz);
        walk(o, 5, input(1));
        if (o.y >= f.lip - 0.5) before++;
      });
      // the wolf: from the same foot, chasing a player standing 14 m beyond the top of the face
      const { field, e } = wolfAt(t, f.fx, f.fz);
      const target = { x: f.x + f.ux * 14, z: f.z + f.uz * 14, derived: {} };
      for (let s = 0; s < 5; s += 1 / 30) field.update(1 / 30, target, { level: 1 }, {});
      worstWolf = Math.max(worstWolf, e.y - f.lip);
      assert.ok(e.y < f.lip, `seed ${seed}: the wolf ran up the face at ${f.x | 0},${f.z | 0} (${e.y.toFixed(1)} vs lip ${f.lip.toFixed(1)})`);
    }
    rows.push(`seed ${seed}@${scale}: player ends ${(-worstPlayer).toFixed(1)} m under the lip at worst, wolf ${(-worstWolf).toFixed(1)} m; without the rule ${before}/20 reached the top`);
  }
  console.log('# ' + rows.join('; '));
});

test('walking along the foot of a face costs nothing: within 5% of the same walk with the rule off', () => {
  let worst = 0, walked = 0;
  for (const seed of [7, 25392]) {
    const t = world(seed).terrain;
    for (const f of cliffPoints(t, 20, seed)) {
      // along the contour at the foot, both ways, one second
      for (const side of [1, -1]) {
        const yaw = Math.atan2(-f.uz * side, f.ux * side);
        const go = () => {
          const c = controller(t);
          c.teleport(f.fx, f.fz);
          c.yaw = yaw;
          walk(c, 1, input(1));
          return Math.hypot(c.x - f.fx, c.z - f.fz);
        };
        const on = go(), off = withoutCliffs(go);
        if (off < 1) continue;           // walked straight into something either way
        walked++;
        worst = Math.max(worst, Math.abs(on / off - 1));
      }
    }
  }
  console.log(`# ${walked} walks along the foot, worst difference ${(worst * 100).toFixed(2)}%`);
  assert.ok(walked >= 60, `only ${walked} foot walks measured`);
  assert.ok(worst <= 0.05, `walking along the foot is ${(worst * 100).toFixed(1)}% off the same walk without the rule`);
});

// ---------------------------------------------------------------------------------- escape + mounts

/** A made-up floor for the shapes a real world does not promise to have: a gully, a ramp. */
function synthetic(h) {
  const t = {
    heightAt: h, planet: { gravity: 1 }, seaLevel: -100, hasSea: false, crossings: [],
    slopeAt(x, z, s = 3) { return Math.hypot(h(x + s, z) - h(x - s, z), h(x, z + s) - h(x, z - s)) / (2 * s); },
    normalAt(x, z, s = 3, out = [0, 1, 0]) {
      const nx = h(x - s, z) - h(x + s, z), ny = 2 * s, nz = h(x, z - s) - h(x, z + s);
      const l = Math.hypot(nx, ny, nz);
      out[0] = nx / l; out[1] = ny / l; out[2] = nz / l;
      return out;
    },
    waterAt: () => null, underwater: () => false, roadAt: () => 0,
    clampToWorld: (x, z) => [x, z], spawnPoint: () => ({ x: 0, z: 0, height: h(0, 0) }),
  };
  return t;
}

test('escape: a walker in a three-sided gully, pushing at the dead end, is out within 8 s — and so is a wolf', () => {
  // floor at 0, 8 m wide, open to -z; walls 3.5 m high over 1.2 m (71 degrees) on the other three
  const W = 1.2, H = 3.5;
  const wall = d => (d <= 0 ? 0 : d < W ? (H * d) / W : H + (d - W) * 0.05);
  const t = synthetic((x, z) => Math.max(wall(Math.abs(x) - 4), wall(z - 10)));
  const out = (x, z) => Math.abs(x) >= 4 + W || z >= 10 + W;
  const c = controller(t);
  c.teleport(0, 5);
  c.yaw = 0;                                       // facing +z: the dead end
  let tOut = null;
  for (let s = 0; s < 12 && tOut === null; s += 1 / 60) {
    c.update(1 / 60, input(1));
    if (out(c.x, c.z)) tOut = s;
  }
  assert.ok(tOut !== null && tOut <= 8, `the walker was still in the gully after ${tOut ?? '12+'} s`);
  // …and it really was the escape: with no escape it never gets out
  const was = G.CLIFF.escape;
  G.CLIFF.escape = 1e9;
  try {
    const stuck = controller(t);
    stuck.teleport(0, 5);
    stuck.yaw = 0;
    walk(stuck, 10, input(1));
    assert.ok(!out(stuck.x, stuck.z), 'the walker climbed the dead end without the escape rule');
  } finally { G.CLIFF.escape = was; }

  const { field, e } = wolfAt(t, 0, 5);
  let wolfOut = null;
  for (let s = 0; s < 12 && wolfOut === null; s += 1 / 30) {
    field.update(1 / 30, { x: 0, z: 30, derived: {} }, { level: 1 }, {});
    if (out(e.x, e.z)) wolfOut = s;
  }
  assert.ok(wolfOut !== null && wolfOut <= 8, `the wolf was still in the gully after ${wolfOut ?? '12+'} s`);
  console.log(`# out of the gully: walker ${tOut.toFixed(2)} s, wolf ${wolfOut.toFixed(2)} s`);
});

test('a surefooted mount takes a little more (mountSlope is read, capped at 70 degrees); nothing walks up a wall', () => {
  // a 66-degree ramp, 6.7 m high: over the 63-degree line, under 68
  const g = Math.tan(66 * Math.PI / 180);
  const t = synthetic((x, z) => (z <= 0 ? 0 : z < 3 ? z * g : 3 * g));
  const ride = (sure, mounted = true) => {
    const c = createController(t, balance, new THREE.PerspectiveCamera(), { derived: () => ({ mountSlope: sure }) });
    c.teleport(0, -3);
    c.mounted = mounted;
    c.yaw = 0;
    walk(c, 2, input(1));
    return c.y;
  };
  const top = 3 * g - 0.1;
  assert.ok(ride(0, false) < 1, 'a walker went up a 66-degree face');
  assert.ok(ride(0.2) < 1, 'a mount with mountSlope 0.2 (65 degrees) went up a 66-degree face');
  assert.ok(ride(0.5) > top, 'a mount with mountSlope 0.5 (68 degrees) could not take a 66-degree face');
  // the cap: no amount of surefootedness passes 70
  assert.equal(G.cliffGrade(5), Math.tan(70 * Math.PI / 180));
  const wall = synthetic((x, z) => (z <= 0 ? 0 : z < 2 ? z * Math.tan(72 * Math.PI / 180) : 2 * Math.tan(72 * Math.PI / 180)));
  const c = createController(wall, balance, new THREE.PerspectiveCamera(), { derived: () => ({ mountSlope: 0.8 }) });
  c.teleport(0, -3); c.mounted = true; c.yaw = 0;
  walk(c, 2, input(1));
  assert.ok(c.y < 1, 'the surest mount there is went up a 72-degree wall');
});

test('a body standing ON a face slides back off it, down the terrain normal', () => {
  const g = Math.tan(75 * Math.PI / 180);
  const t = synthetic((x, z) => (z <= 0 ? 0 : z < 4 ? z * g : 4 * g));
  const c = controller(t);
  c.teleport(0, 2);                                // halfway up the face
  const y0 = c.y;
  walk(c, 1, input(0));
  assert.ok(c.z < 1.2 && c.y < y0 - 2, `stood on the face for a second and went from ${y0.toFixed(1)} to ${c.y.toFixed(1)} m`);
});

// ---------------------------------------------------------------------------------- road pace

/** A flat stretch of the given class on a real road, away from bridges and water. */
function roadSpot(t, klass) {
  for (const road of t.roadPaths) {
    if (road.klass !== klass) continue;
    for (let i = 2; i < road.points.length - 2; i++) {
      const [x, z] = road.points[i];
      if (t.roadAt(x, z) < 0.9 || t.bridgedAt?.(x, z, 10) || t.underwater(x, z)) continue;
      if (t.roadClassAt(x, z) !== klass) continue;
      const [nx, nz] = road.points[i + 1];
      return { x, z, yaw: Math.atan2(nx - x, nz - z) };
    }
  }
  return null;
}

/** One step's length on a road with the `roads` block set to `roads`, however the body is rigged. */
function stepOn(t, spot, roads, rig = () => {}) {
  const bal = { ...balance, roads: { ...balance.roads, ...roads } };
  const c = createController(t, bal, new THREE.PerspectiveCamera(), { obstacles: [] });
  c.teleport(spot.x, spot.z);
  c.update(1 / 30, input(0));
  rig(c);
  c.yaw = spot.yaw;
  const x0 = c.x, z0 = c.z;
  c.update(1 / 30, input(1));
  return Math.hypot(c.x - x0, c.z - z0);
}

test('a road is quicker on feet and hooves — by exactly the knob — and a vehicle is not paid twice', () => {
  // highways are rare (the user's world has one); a road off seed 7, the highway off 25392
  const t = world(7).terrain, th = world(25392).terrain;
  const road = roadSpot(t, 'road'), highway = roadSpot(th, 'highway');
  assert.ok(road && highway, 'no road stretch on seed 7, or no highway on 25392');
  highway.t = th;
  const none = { walk: 1, mount: 1, highway: 1 };
  const ratio = (spot, roads, rig) => stepOn(spot.t || t, spot, roads, rig) / stepOn(spot.t || t, spot, none, rig);
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ×${a.toFixed(6)}, not ×${b}`);
  // the shipped numbers
  close(ratio(road, { walk: balance.roads.walk }), balance.roads.walk, 'walking on a road');
  assert.equal(balance.roads.walk, 1.15);
  close(ratio(road, { mount: balance.roads.mount }, c => { c.mounted = true; }), balance.roads.mount, 'riding on a road');
  close(ratio(highway, { walk: 1.15, highway: 1.1 }), 1.15 * 1.1, 'walking on a highway');
  // the knob is read: move it to an odd value and the pace follows
  close(ratio(road, { walk: 1.37 }), 1.37, 'walking with roads.walk = 1.37');
  close(ratio(road, { mount: 1.61 }, c => { c.mounted = true; }), 1.61, 'riding with roads.mount = 1.61');
  close(ratio(highway, { walk: 1, highway: 1.29 }), 1.29, 'a highway with roads.highway = 1.29');
  // off the road nothing changes
  const off = { x: road.x + 40, z: road.z, yaw: road.yaw };
  if (t.roadAt(off.x, off.z) < 0.2 && !t.underwater(off.x, off.z)) close(ratio(off, { walk: 1.37 }), 1, 'walking off the road');
  // a ground vehicle already has its own road factor (js/vehicles.js spec.road): nothing here
  const drive = c => { c.driving = { speed: 9 }; };
  const a = stepOn(t, road, { walk: 1.37, mount: 1.61, highway: 1.29 }, drive), b = stepOn(t, road, none, drive);
  assert.equal(a.toFixed(3), b.toFixed(3), `a driver's step moved from ${b} to ${a}`);
});

// ---------------------------------------------------------------------------------- scree

const SCENE = { add() {}, remove() {} };
const quiet = fn => { const w = console.warn; console.warn = () => {}; try { return fn(); } finally { console.warn = w; } };
const instances = (mesh) => Array.from(mesh.instanceMatrix.array.subarray(0, mesh.count * 16));
const colours = (mesh) => (mesh.instanceColor ? Array.from(mesh.instanceColor.array.subarray(0, mesh.count * 3)) : []);

test('scree: every rock fell from a measured face, within 12 m and downhill, off roads and water — and nothing else moved', () => {
  let scree = 0, spots = 0, boulders = 0;
  const calls = [];
  for (const seed of [7, 25392]) {
    const t = world(seed).terrain;
    for (const f of cliffPoints(t, 3, seed + 1)) {
      const props = quiet(() => createProps(SCENE, t, { seed }));
      props.update(f.fx, f.fz);
      const on = props.stats();
      const snap = Object.fromEntries(Object.entries(props.meshes).map(([k, m]) => [k, { n: m.count, m: instances(m), c: colours(m) }]));
      props.setScree(false, f.fx, f.fz);
      const off = props.stats();
      calls.push(`${on.drawCalls}/${off.drawCalls}`);
      assert.equal(on.drawCalls, off.drawCalls, `seed ${seed}: scree changed the draw calls ${off.drawCalls} -> ${on.drawCalls}`);
      assert.ok(on.scree > 0, `seed ${seed}: no scree below the face at ${f.x | 0},${f.z | 0}`);
      spots++;
      for (const [key, m] of Object.entries(props.meshes)) {
        const was = snap[key];
        const bare = { n: m.count, m: instances(m), c: colours(m) };
        if (key !== 'rock' && key !== 'boulder') {
          assert.deepEqual(was.m, bare.m, `seed ${seed}: the ${key} instances moved when scree was switched on`);
          assert.deepEqual(was.c, bare.c, `seed ${seed}: the ${key} colours changed when scree was switched on`);
          continue;
        }
        // every ordinary rock is where it was, at the same index; the scree is after them
        assert.deepEqual(was.m.slice(0, bare.n * 16), bare.m, `seed ${seed}: an ordinary ${key} moved`);
        for (let i = bare.n; i < was.n; i++) {
          const x = was.m[i * 16 + 12], y = was.m[i * 16 + 13], z = was.m[i * 16 + 14];
          scree++;
          if (key === 'boulder') boulders++;
          // it may have rolled out of the cell its face is in
          let rec = null;
          for (let dz = -1; dz <= 1 && !rec; dz++) for (let dx = -1; dx <= 1 && !rec; dx++) {
            rec = props.screeFor(Math.round(x / 64) + dx, Math.round(z / 64) + dz).find(r => Math.abs(r.x - x) < 1e-3 && Math.abs(r.z - z) < 1e-3);
          }
          assert.ok(rec, `seed ${seed}: a ${key} at ${x | 0},${z | 0} is in no cell's scree list`);
          const [fx, fz] = rec.face;
          assert.ok(G.steepAt(t, fx, fz) >= GRADE, `seed ${seed}: the face over the ${key} at ${x | 0},${z | 0} is not past the line`);
          assert.ok(Math.hypot(x - fx, z - fz) <= 12 + 1e-6, `seed ${seed}: a ${key} ${Math.hypot(x - fx, z - fz).toFixed(1)} m from its face`);
          assert.ok(t.heightAt(x, z) < t.heightAt(fx, fz), `seed ${seed}: a ${key} uphill of its face`);
          assert.ok(t.roadAt(x, z) < 0.35, `seed ${seed}: a ${key} on a road at ${x | 0},${z | 0}`);
          assert.ok(t.plantable(x, z) && !t.underwater(x, z), `seed ${seed}: a ${key} in the water at ${x | 0},${z | 0}`);
          assert.ok(Math.abs(y - (t.heightAt(x, z) - 0.12 * rec.scale)) < 1e-3, `seed ${seed}: a ${key} is not on the ground`);
        }
      }
    }
  }
  console.log(`# ${spots} cliff spots, ${scree} scree instances (${boulders} boulders), draw calls on/off ${calls.join(' ')}`);
  assert.ok(boulders > 0, 'no scree boulder anywhere');
});

test('scree: a boulder is solid through the props\' own field, and a thinned far cell is a subset of the near one', () => {
  const t = world(25392).terrain;
  const f = cliffPoints(t, 1, 25392 + 1)[0];
  const props = quiet(() => createProps(SCENE, t, { seed: 25392 }));
  // a cell with enough scree in it to thin
  const cx = Math.round(f.x / 64), cz = Math.round(f.z / 64);
  let cell = null;
  for (let r = 0; r < 4 && !cell; r++) for (let dz = -r; dz <= r && !cell; dz++) for (let dx = -r; dx <= r && !cell; dx++) {
    const list = props.screeFor(cx + dx, cz + dz);
    if (list.length >= 8) cell = { cx: cx + dx, cz: cz + dz, list };
  }
  assert.ok(cell, 'no cell with 8+ scree near the face');
  const placed = () => {
    const out = new Set();
    for (const key of ['rock', 'boulder']) {
      const m = props.meshes[key];
      for (let i = 0; i < m.count; i++) {
        const x = m.instanceMatrix.array[i * 16 + 12], z = m.instanceMatrix.array[i * 16 + 14];
        const r = cell.list.find(e => Math.abs(e.x - x) < 1e-3 && Math.abs(e.z - z) < 1e-3);
        if (r) out.add(cell.list.indexOf(r));
      }
    }
    return out;
  };
  props.update(cell.cx * 64, cell.cz * 64);
  const near = placed();
  // the boulders are solid, in the props' own obstacle field
  const boulder = cell.list.find((e, i) => e.kind === 'boulder' && near.has(i));
  if (boulder) {
    const pushed = [0, 0];
    props.solids.resolve(boulder.x + 0.1, boulder.z, 0.45, pushed, boulder.y + 0.5);
    assert.ok(Math.hypot(pushed[0] - boulder.x, pushed[1] - boulder.z) > 0.5, 'a scree boulder is not solid');
  }
  props.update((cell.cx + 6) * 64, cell.cz * 64);     // the cell is now out near the rim
  const far = placed();
  assert.ok(far.size > 0 && far.size < near.size, `the far cell was not thinned (${far.size} of ${near.size})`);
  for (const i of far) assert.ok(near.has(i), `scree #${i} stands at the rim but not up close — the thinning is not a subset`);
  console.log(`# far cell keeps ${far.size} of ${near.size}${boulder ? ', boulder solid' : ''}`);
});

// ---------------------------------------------------------------------------------- colour

test('a cliff is grey from every ring: the rock weight at 20 cliff points differs by <= 0.15 between ring 0 and ring 4', () => {
  let worst = 0, before = 0, n = 0;
  for (const seed of [7, 25392]) {
    const t = world(seed).terrain;
    // the rings as the game builds them (js/terrain.js: extents shrink with the square root of scale)
    const shrink = Math.sqrt(t.metresPerCell / P.M_PER_CELL_DEFAULT);
    const cells = balance.terrain.rings.map(r => Math.max(96, Math.round(r.extent * shrink)) / r.res);
    const out = [0, 0, 0, 0, 0];
    const rockWith = (x, z, cell, probe) => {
      // what the ring measures on its own: across two of its quads
      const own = t.slopeAt(x, z, cell);
      t.colorAt(x, z, t.heightAt(x, z), probe ? rockSteep(t, x, z, cell, own) : own, out);
      return out[4];
    };
    for (const f of cliffPoints(t, 10, seed + 2)) {
      const r0 = rockWith(f.x, f.z, cells[0], true), r4 = rockWith(f.x, f.z, cells[4], true);
      worst = Math.max(worst, Math.abs(r0 - r4));
      before = Math.max(before, Math.abs(rockWith(f.x, f.z, cells[0], false) - rockWith(f.x, f.z, cells[4], false)));
      n++;
    }
  }
  console.log(`# ${n} cliff points: rock weight ring 0 vs ring 4 differs by ${worst.toFixed(3)} at worst (${before.toFixed(3)} without the probe)`);
  assert.equal(n, 20);
  assert.ok(worst <= 0.15, `a cliff changes colour with distance by ${worst.toFixed(2)}`);
});

test('snow and sand follow the relief: the snow share of the top 5% of land matches within 10 points at scale 0.1 and 1', () => {
  const rows = [];
  for (const seed of [25392, 4477, 7]) {
    const share = {};
    for (const scale of [0.1, 1]) {
      const t = world(seed, scale).terrain;
      const pts = [];
      for (let j = 0; j < 150; j++) for (let i = 0; i < 300; i++) {
        const x = ((i + 0.5) / 300) * t.widthM, z = ((j + 0.5) / 150) * t.depthM;
        const h = t.heightAt(x, z);
        if (h > t.seaLevel && !t.underwater(x, z)) pts.push([x, z, h]);
      }
      pts.sort((a, b) => b[2] - a[2]);
      const top = pts.slice(0, Math.ceil(pts.length * 0.05));
      const out = [0, 0, 0, 0, 0];
      let snowy = 0;
      for (const [x, z, h] of top) { t.colorAt(x, z, h, t.slopeAt(x, z), out); if (out[3] > 0.5) snowy++; }
      share[scale] = snowy / top.length;
    }
    rows.push(`${seed}: ${(share[0.1] * 100).toFixed(1)}% / ${(share[1] * 100).toFixed(1)}%`);
    assert.ok(Math.abs(share[0.1] - share[1]) <= 0.10, `seed ${seed}: snow ${(share[0.1] * 100).toFixed(1)}% at 0.1 and ${(share[1] * 100).toFixed(1)}% at 1`);
  }
  // …and the cold peaks really are white now (no peak on any standard world was, before)
  console.log(`# snow over the top 5% of land (0.1 / 1): ${rows.join(', ')}`);
  const t = world(4477).terrain;
  const out = [0, 0, 0, 0, 0];
  let peak = null;
  for (let j = 0; j < 150; j++) for (let i = 0; i < 300; i++) {
    const x = ((i + 0.5) / 300) * t.widthM, z = ((j + 0.5) / 150) * t.depthM, h = t.heightAt(x, z);
    if (!peak || h > peak[2]) peak = [x, z, h];
  }
  t.colorAt(peak[0], peak[1], peak[2], 0, out);
  assert.ok(out[3] > 0.5, `the highest peak on seed 4477 (${peak[2].toFixed(0)} m) is not under snow`);
});
