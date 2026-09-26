// node --test prototypes/farhold/tests/round27-towns.test.js
//
// Round 27, M2 — "One town size, and the planner's own gates".
//
// Two faults, both of the "two owners" kind this project keeps finding:
//
//   1. SIX answers to "how big is this town". The planner grows a crowded site's ring 1.3x or
//      1.65x and reports the wall it really built as `plan.wallRadius`; js/features.js read it (since
//      R22) and nothing else did. js/town.js's no-spawn circle, js/waypoints.js's boundary, "you are
//      in town", the town hall's walled/open label and the muster all worked it out again from
//      `16 + size * 13` — so a pack could spawn forty metres inside a grown city's wall.
//   2. The planner cut a gate at the end of every main street and Farhold threw them all away. The
//      only openings were where a world road crossed; every other high street ran into masonry,
//      and a walled town with no road got one gate at a random bearing.
//
// Everything here runs the real modules on real worlds: js/planet.js builds the world,
// js/features.js plans and builds the towns (through the proctown planner), js/town.js answers the
// safe circles, js/actors.js's EnemyField does the spawning, js/collide.js is what the player walks
// into. Standard seeds, Super tiny (0.1) and Normal (1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('./three-loader.mjs', import.meta.url);
const P = await import('../js/planet.js');
const { createFeatures } = await import('../js/features.js');
const { townExtent, planOf, wallTier, footprintOf, musterFacts, sentryPosts } = await import('../js/town-plan.js');
const { boundaryOf } = await import('../js/waypoints.js');
const { createTownFolk } = await import('../js/town.js');
const { EnemyField } = await import('../js/actors.js');
const { buildZones } = await import('../js/zones.js');
const { bandForPlanet } = await import('../js/rpg.js');

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));
const bestiary = JSON.parse(readFileSync(new URL('../data/enemies.json', import.meta.url), 'utf8'));

const SEEDS = [25392, 7, 4477, 101, 1337, 47];
const SCALES = [0.1, 1];
const TAU = Math.PI * 2;

/**
 * One world, with every settlement planned and its walls built. `radius: 400` builds one town per
 * `update` (the game builds 2600 m around the player; the gates of one town do not depend on its
 * neighbours), and each town's wall and gate books are read straight after its own rebuild —
 * which is also the point, since R27 empties those books on every rebuild.
 */
const worlds = new Map();
function worldFor(seed, scale) {
  const key = `${seed}@${scale}`;
  if (worlds.has(key)) return worlds.get(key);
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  const made = P.createWorld({
    seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128,
    regionScale: 2, habitable: true, liveable: true,
  });
  const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
  const features = createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 400 });
  const towns = [];
  for (const t of features.settlements) {
    features.update(t.wx, t.wz, true);
    towns.push({ t, plan: planOf(t), wall: features.wallOf(t.id), gates: features.gatesOf(t.id) });
  }
  const w = { seed, scale, made, terrain, features, towns };
  worlds.set(key, w);
  return w;
}
const eachWorld = fn => { for (const scale of SCALES) for (const seed of SEEDS) fn(worldFor(seed, scale)); };

// ------------------------------------------------------------------------------ one town size

test('every system agrees where a town ends: safe circle, "in town", waypoint boundary — 6 seeds x 2 sizes', () => {
  let towns = 0, grown = 0, oldShort = 0;
  eachWorld(({ seed, scale, terrain, features, towns: list }) => {
    const folk = createTownFolk({ add() {}, remove() {} }, terrain, { features, looks: [] });
    const zones = new Map(folk.safeZones().map((z, i) => [features.settlements[i].id, z]));
    for (const { t, plan } of list) {
      towns++;
      const where = `${t.name} (seed ${seed} @${scale})`;
      assert.ok(plan, `${where} was never planned`);
      const ext = townExtent(t);
      assert.equal(ext.wall, Math.max(footprintOf(t.size || 1).wall, plan.wallRadius), `${where}: extent is not the plan's wall`);
      const real = plan.wallRadius;
      if (real > footprintOf(t.size || 1).wall + 0.5) grown++;
      // the pre-R27 safe circle: `16 + size * 13`, +14 for a wall, +18 margin
      const size = t.size || 1;
      if ((16 + size * 13 + (size >= 4 ? 14 : 0) + 18) < real + 10) oldShort++;

      const zone = zones.get(t.id);
      assert.ok(zone.r >= real + 10, `${where}: safe circle ${zone.r.toFixed(1)} m, wall ${real.toFixed(1)} m`);
      assert.ok(boundaryOf(t) >= real, `${where}: waypoint boundary ${boundaryOf(t)} inside the wall ${real}`);
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * TAU;
        const x = t.wx + Math.cos(a) * (real - 1), z = t.wz + Math.sin(a) * (real - 1);
        const here = features.settlementAt(x, z);
        assert.ok(here, `${where}: "not in town" 1 m inside the wall at bearing ${k}`);
      }
    }
  });
  assert.ok(towns > 400, `only ${towns} towns`);
  assert.ok(grown > 20, `only ${grown} grown towns — the check is not reaching the case it is for`);
  assert.ok(oldShort > 20, `the old formula was short on ${oldShort} towns — this is not measuring the bug`);
});

test('the extent is the planner\'s number, and the footprint only a floor before planning', () => {
  const node = { id: 'unplanned-town', size: 5 };
  assert.deepEqual(
    (({ ring, wall, walled }) => ({ ring, wall, walled }))(townExtent(node)),
    footprintOf(5), 'an unplanned town should fall back to its footprint');
  // dead-data rule: move the plan's own number to something odd and ask again
  const fake = { ring: 133.3, wallRadius: 147.7, plots: new Array(7) };
  const ext = townExtent(node, fake);
  assert.equal(ext.wall, 147.7);
  assert.equal(ext.ring, 133.3);
  assert.equal(ext.plots, 7);
  // …and a plan can never make a town SMALLER than its footprint
  assert.equal(townExtent(node, { ring: 1, wallRadius: 2, plots: [] }).wall, footprintOf(5).wall);
});

test('no enemy spawns inside a walled town — 500 live `spawnNear` bodies around each, 3 worlds', async () => {
  for (const seed of [25392, 7, 47]) {
    const w = worldFor(seed, 0.1);
    P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
    const { terrain, features, made } = w;
    const band = bandForPlanet(made.planet);
    const spawn = terrain.spawnPoint();
    const zones = buildZones(made.world, {
      spawn: [spawn.x, spawn.z], maxLevel: band.max, startLevel: band.min, bandWidth: balance.zones?.bandWidth ?? 4,
    });
    const rpg = { rollRank: () => 'normal', pickModifiers: () => [] };
    const field = new EnemyField({ scene: { add() {} }, terrain, rpg, defs: bestiary.enemies.slice(), zones, balance: { ...balance, seed } });
    const placed = [];
    field.add = async (def, level, x, z) => { placed.push({ x, z }); return { name: def.name }; };
    const folk = createTownFolk({ add() {}, remove() {} }, terrain, { features, looks: [] });
    field.safeZones = folk.safeZones();
    let walled = 0;
    for (const { t, plan } of w.towns.filter(x => townExtent(x.t).walled)) {
      walled++;
      placed.length = 0;
      const R = plan.wallRadius;
      // stand the player in the square and all round the wall, so the 45-130 m spawn ring
      // sweeps the whole inside of the town
      let tries = 0;
      while (placed.length < 500 && tries++ < 20000) {
        const a = field.rng() * TAU, r = field.rng() * (R + 20);
        await field.spawnNear(t.wx + Math.cos(a) * r, t.wz + Math.sin(a) * r, 10);
      }
      assert.ok(placed.length >= 500, `${t.name}: only ${placed.length} spawns in ${tries} tries`);
      const inside = placed.filter(p => Math.hypot(p.x - t.wx, p.z - t.wz) < R);
      assert.equal(inside.length, 0, `${t.name} (seed ${seed}): ${inside.length} of ${placed.length} spawns inside the ${R.toFixed(0)} m wall`);
    }
    assert.ok(walled >= 3, `seed ${seed}: only ${walled} walled towns`);
  }
});

// ------------------------------------------------------------------------------ gates

/** How far a street end is from the nearest drawn opening, measured where the street meets its wall line. */
function gapDistance(gates, x, z, px, pz) {
  let best = Infinity;
  for (const g of gates) {
    const along = (x - g.x) * g.tx + (z - g.z) * g.tz, across = (x - g.x) * g.ox + (z - g.z) * g.oz;
    const pAlong = (px - g.x) * g.tx + (pz - g.z) * g.tz, pAcross = (px - g.x) * g.ox + (pz - g.z) * g.oz;
    let at = null;
    if (Math.abs(across - pAcross) > 1e-6) {
      const u = across / (across - pAcross);           // where the street's last span meets this wall line
      if (u >= -0.01 && u <= 1.01) at = along + (pAlong - along) * u;
    }
    best = Math.min(best, at !== null
      ? Math.max(0, Math.abs(at) - g.open / 2)
      : Math.hypot(Math.max(0, Math.abs(along) - g.open / 2), across));
  }
  return best;
}

test('every main street that reaches the wall goes through a gate, and every walled town has two or more', () => {
  let walled = 0, ends = 0, planner = 0;
  const fails = [];
  eachWorld(({ seed, scale, terrain, towns }) => {
    for (const { t, plan, wall, gates } of towns) {
      if (!townExtent(t).walled) { assert.equal(wall, null, `${t.name} has a wall at size ${t.size}`); continue; }
      walled++;
      assert.ok(wall, `${t.name} (seed ${seed}) is size ${t.size} and has no wall`);
      assert.ok(gates.length >= 2, `${t.name} (seed ${seed} @${scale}): ${gates.length} gate(s)`);
      planner += gates.filter(g => g.source === 'street').length;
      for (const st of plan.streets) {
        if (st.cls !== 'main') continue;
        for (const [e, p] of [[st.pts[0], st.pts[1]], [st.pts[st.pts.length - 1], st.pts[st.pts.length - 2]]]) {
          if (Math.abs(Math.hypot(e[0], e[1]) - plan.wallRadius) > 3) continue;
          const x = t.wx + e[0], z = t.wz + e[1];
          if (terrain.underwater(x, z)) continue;            // a street that ends in the river
          ends++;
          const d = gapDistance(gates, x, z, t.wx + p[0], t.wz + p[1]);
          if (d > 4) fails.push(`${t.name} (seed ${seed} @${scale}): a main street meets the wall ${d.toFixed(1)} m from any opening`);
        }
      }
    }
  });
  assert.deepEqual(fails, []);
  assert.ok(walled > 80 && ends > 150, `${walled} walled towns, ${ends} main-street ends — not enough to mean anything`);
  assert.ok(planner > 40, `only ${planner} gates came from the plan — the planner's gates are not being used`);
});

test('a walled town no road reaches gets the planner\'s gates, each at a street end — not one at random', () => {
  let found = 0;
  eachWorld(({ seed, scale, towns }) => {
    for (const { t, plan, gates } of towns) {
      if (!townExtent(t).walled || gates.some(g => g.source === 'road')) continue;
      found++;
      assert.ok(gates.length >= 2, `${t.name} (seed ${seed} @${scale}): ${gates.length} gate(s) and no road`);
      const ends = plan.streets.flatMap(st => [st.pts[0], st.pts[st.pts.length - 1]]).map(e => [t.wx + e[0], t.wz + e[1]]);
      for (const g of gates) {
        const d = Math.min(...ends.map(([x, z]) => Math.hypot(x - g.x, z - g.z)));
        assert.ok(d <= 4, `${t.name} (seed ${seed} @${scale}): a gate stands ${d.toFixed(1)} m from the nearest street end`);
      }
    }
  });
  assert.ok(found >= 2, `found only ${found} walled towns with no road — the case is not being exercised`);
});

test('from every gate you can walk to the town square (flood fill over the real colliders)', () => {
  for (const seed of SEEDS) {
    const w = worldFor(seed, 0.1);
    P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
    let checked = 0;
    for (const { t, plan } of w.towns.filter(x => townExtent(x.t).walled).slice(0, 3)) {
      w.features.update(t.wx, t.wz, true);                   // this town's colliders, live
      const gates = w.features.gatesOf(t.id);
      const solids = w.features.solids;
      const R = plan.wallRadius + 10, STEP = 1;
      const N = Math.ceil((2 * R) / STEP) + 1;
      const x0 = t.wx - R, z0 = t.wz - R;
      const seen = new Uint8Array(N * N);
      const free = (x, z) => !solids.blocked(x, z, 0.45);
      // flood out from the square; every gate's outside threshold must be reached
      const sq = [t.wx + plan.square.cx, t.wz + plan.square.cz];
      let start = null;
      for (let r = 0; r < 12 && !start; r += 1) {
        for (let a = 0; a < TAU && !start; a += 0.3) {
          const x = sq[0] + Math.cos(a) * r, z = sq[1] + Math.sin(a) * r;
          if (free(x, z)) start = [Math.round((x - x0) / STEP), Math.round((z - z0) / STEP)];
        }
      }
      assert.ok(start, `${t.name}: nowhere to stand in the square`);
      const queue = [start];
      seen[start[1] * N + start[0]] = 1;
      while (queue.length) {
        const [i, j] = queue.pop();
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const a = i + di, b = j + dj;
          if (a < 0 || b < 0 || a >= N || b >= N || seen[b * N + a]) continue;
          const x = x0 + a * STEP, z = z0 + b * STEP;
          if (Math.hypot(x - t.wx, z - t.wz) > R || !free(x, z)) { seen[b * N + a] = 2; continue; }
          seen[b * N + a] = 1;
          queue.push([a, b]);
        }
      }
      for (const [k, g] of gates.entries()) {
        if (g.wet) continue;
        const ox = g.x + g.ox * 5, oz = g.z + g.oz * 5;       // just outside the passage
        let reached = false;
        for (let d = -1; d <= 1 && !reached; d++) {
          for (let e = -1; e <= 1 && !reached; e++) {
            const a = Math.round((ox - x0) / STEP) + d, b = Math.round((oz - z0) / STEP) + e;
            if (a >= 0 && b >= 0 && a < N && b < N && seen[b * N + a] === 1) reached = true;
          }
        }
        assert.ok(reached, `${t.name} (seed ${seed}): gate ${k} (${g.source}) cannot be walked to from the square`);
        checked++;
      }
    }
    assert.ok(checked >= 4, `seed ${seed}: only ${checked} gates checked`);
  }
});

test('the gate books describe what is built NOW — a rebuild elsewhere empties them', () => {
  const w = worldFor(7, 0.1);
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
  const [a, b] = w.towns.filter(x => townExtent(x.t).walled).map(x => x.t);
  w.features.update(a.wx, a.wz, true);
  assert.ok(w.features.gatesOf(a.id).length >= 2);
  w.features.update(b.wx, b.wz, true);                       // radius 400: town a is not rebuilt
  assert.equal(w.features.gatesOf(a.id).length, 0, 'town a still has gates filed after it was let go');
  assert.equal(w.features.wallOf(a.id), null);
  assert.ok(w.features.gatesOf(b.id).length >= 2);
});

// ------------------------------------------------------------------------------ one tier, the muster

test('one wall tier: exactly the towns of size 4 and up are walled, everywhere', () => {
  for (let size = 0; size <= 8; size++) {
    assert.equal(wallTier(size) === 'wall', size >= 4, `size ${size}`);
    assert.equal(footprintOf(size).walled, size >= 4);
  }
  eachWorld(({ towns }) => {
    for (const { t, wall } of towns) {
      const big = (t.size || 1) >= 4;
      assert.equal(!!wall, big, `${t.name}: size ${t.size}, wall ${!!wall}`);
      assert.equal(townExtent(t).walled, big);
    }
  });
  // …and no module still carries its own copy of the rule
  for (const file of ['town.js', 'waypoints.js', 'townhall.js', 'features.js', 'town-plan.js']) {
    const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
    const copies = src.split('\n').filter(l => /size\s*>=\s*4\s*\?/.test(l) || /if \(size >= 4\)/.test(l) || /T\.size >= 4/.test(l));
    assert.deepEqual(copies, [], `${file} still decides "walled" on its own`);
  }
});

test('the muster reads the TOWN: walled for every size-4+ town and not below, plots from the plan', () => {
  eachWorld(({ towns }) => {
    for (const { t, plan } of towns) {
      const facts = musterFacts(t, 3);
      assert.equal(facts.walled, (t.size || 1) >= 4, `${t.name}: size ${t.size} mustered walled=${facts.walled}`);
      assert.equal(facts.plots, plan.plots.length);
      assert.equal(facts.guards, 3);
    }
  });
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(src, /baseForTown\(town, musterFacts\(town, folk\.guardsOf/, 'main.js does not muster through musterFacts + the town\'s own guards');
});

// ------------------------------------------------------------------------------ the gate guards

test('gate guards are posted when the gates arrive, and none stand at a gate in the water', async () => {
  // the merchant's "$" badge is drawn on a canvas; node has none, so hand it a canvas that draws nothing
  globalThis.document ??= {
    createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {}, set: () => true }) }),
  };
  const w = worldFor(47, 0.1);
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * 0.1);
  const { t } = w.towns.find(x => townExtent(x.t).walled);
  w.features.update(t.wx, t.wz, true);
  const real = w.features.gatesOf(t.id);
  assert.ok(real.length >= 2);
  // a stand-in features that has not filed the wall yet (the first frame after a teleport)
  let gates = [];
  const features = { settlements: [t], gatesOf: () => gates };
  const folk = createTownFolk({ add() {}, remove() {} }, w.terrain, { features, looks: [], radius: 900 });
  const player = { x: t.wx, z: t.wz };
  const settle = async () => { for (let i = 0; i < 400; i++) { folk.update(0.016, player); await new Promise(r => setTimeout(r, 0)); } };
  await settle();
  const before = folk.roster().filter(n => n.post).length;
  assert.equal(before, 0, 'gate guards were posted with no gates');
  // the wall is filed — and one of its gates is (as far as the guards know) standing in a river
  gates = real.map((g, i) => (i === 0 ? { ...g, wet: true } : g));
  await settle();
  const posted = folk.roster().filter(n => n.post);
  const dryPosts = sentryPosts(gates).filter(p => !gates[p.gate].wet
    && !w.terrain.waterAt(p.x, p.z) && !(w.terrain.riverAt(p.x, p.z) > 0.3)).length;
  assert.ok(posted.length > 0, 'the gate guards never arrived once the gates did');
  assert.equal(posted.length, dryPosts, `${posted.length} gate guards for ${dryPosts} dry posts`);
  assert.ok(posted.every(n => n.post.gate !== 0), 'a guard was posted at the gate in the water');
  assert.equal(folk.guardsOf(t.id), folk.roster().filter(n => n.guards && n.node?.id === t.id).length);
});
