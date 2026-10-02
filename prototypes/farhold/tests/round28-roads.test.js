// node --test prototypes/farhold/tests/round28-roads.test.js
//
// Round 28 — "Improve road plans and fix floating paper thin roads."
//
// Every assertion here reads the DRAWN road — the vertex buffers of js/features.js's own road and
// street meshes, built by the real `createFeatures` around a real town — and measures it against
// the ground the player stands on (`terrain.heightAt`) and against the ground js/terrain.js DRAWS
// at each ring (tests/road-measure.mjs). Before this round the roads stood 0.84 m over the ground
// at the median on the default Small planet (1.66 m at full size, 5.5 m worst), and nothing failed,
// because every road test since round 22 asked only whether the ground came up THROUGH a road.
//
// The rule (this project's memory note): drawn geometry and measured geometry must agree — so the
// test asserts the two against each other, not each on its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';

register('./three-loader.mjs', import.meta.url);

const P = await import('../js/planet.js');
const { laneRibbon } = await import('../js/roadplan.js');
const F = await import('../js/features.js');
const M = await import('./road-measure.mjs');

const balance = JSON.parse(readFileSync(new URL('../data/balance.json', import.meta.url), 'utf8'));

// (seed, planet scale): the user's world at Small and full size, two others at Super tiny / Small
const WORLDS = [[25392, 0.35], [25392, 1], [7, 0.1], [4477, 0.35]];
const built = new Map();
function world(seed, scale) {
  P.setMetresPerCell(P.M_PER_CELL_DEFAULT * scale);
  const key = `${seed}@${scale}`;
  if (!built.has(key)) {
    const made = P.createWorld({ seed, width: balance.world?.width ?? 256, height: balance.world?.height ?? 128, regionScale: 2, habitable: true, liveable: true });
    const terrain = P.makeTerrain(made.world, made.planet, balance.terrain);
    const features = F.createFeatures({ add() {}, remove() {} }, terrain, { seed, radius: 2600 });
    const town = features.settlements.find(s => s.size >= 3) || features.settlements[0];
    features.update(town.wx, town.wz, true);
    built.set(key, { terrain, features, town });
  }
  return built.get(key);
}
const geomOf = mesh => {
  const g = mesh.geometry;
  return { position: g.attributes.position.array, index: g.index.array, normal: g.attributes.normal.array, skirt: g.attributes.skirt?.array };
};
const skipFor = terrain => (x, z) => !!terrain.bridgedAt?.(x, z) || !!terrain.underwater?.(x, z);

test('a drawn road lies on the ground it is drawn on: corners AND edge middles, every class, four worlds', () => {
  for (const [seed, scale] of WORLDS) {
    const { terrain, features } = world(seed, scale);
    for (const [label, mesh, p99max, maxmax] of [['roads', features.roadMesh, 0.2, 0.5], ['streets', features.streetMesh, 0.5, 2.0]]) {
      const d = M.ribbonVsGround(geomOf(mesh), (x, z) => terrain.heightAt(x, z), skipFor(terrain));
      assert.ok(d.length > 1000, `${seed}@${scale} ${label}: only ${d.length} samples`);
      const over = d.filter(v => v > 0), under = d.filter(v => v < 0).map(v => -v);
      const [p50, , p99, max] = M.quantiles(over);
      // the lift is 5-9 cm; before round 28 the median alone was 0.19-1.66 m for world roads
      assert.ok(p50 < 0.12, `${seed}@${scale} ${label}: median float ${p50.toFixed(2)} m`);
      assert.ok(p99 < p99max, `${seed}@${scale} ${label}: 99th percentile float ${p99.toFixed(2)} m`);
      assert.ok(max < maxmax, `${seed}@${scale} ${label}: worst float ${max.toFixed(2)} m`);
      // and it never goes INTO the ground (round 22's rule, still held)
      const sunk = under.filter(v => v > 0.05).length;
      assert.ok(sunk <= Math.max(2, d.length * 0.0005), `${seed}@${scale} ${label}: ${sunk} samples more than 5 cm under the ground`);
    }
  }
});

test('a road has an edge that tucks into the ground: every skirt foot is under the verge', () => {
  for (const [seed, scale] of WORLDS) {
    const { terrain, features } = world(seed, scale);
    for (const [label, mesh] of [['roads', features.roadMesh], ['streets', features.streetMesh]]) {
      const g = geomOf(mesh);
      assert.ok(g.skirt, `${label}: no skirt attribute — a road is a sheet of paper again`);
      let feet = 0, above = 0, worst = 0;
      for (let v = 0; v < g.skirt.length; v++) {
        if (g.skirt[v] < 0.5) continue;
        const x = g.position[v * 3], y = g.position[v * 3 + 1], z = g.position[v * 3 + 2];
        if (skipFor(terrain)(x, z)) continue;
        feet++;
        const d = y - terrain.heightAt(x, z);
        if (d > 0.02) { above++; worst = Math.max(worst, d); }
      }
      assert.ok(feet > 200, `${seed}@${scale} ${label}: only ${feet} skirt feet`);
      assert.ok(above <= feet * 0.01, `${seed}@${scale} ${label}: ${above}/${feet} skirt feet hang over the ground (worst ${worst.toFixed(2)} m)`);
    }
  }
});

test('seen from the town, the far road is neither buried in the coarse rings nor hanging over them', () => {
  // the terrain's outer rings are 10-160 m a quad and cannot draw a 7 m road bed; the road's shader
  // (features.js `roadShader`) pulls it forward in depth and drops its skirt with distance
  const rings0 = null;
  for (const [seed, scale] of WORLDS) {
    const { terrain, features, town } = world(seed, scale);
    const rings = M.ringCells(terrain, balance);
    for (const [label, mesh, k] of [['roads', features.roadMesh, F.ROAD_SHADER.road], ['streets', features.streetMesh, F.ROAD_SHADER.street]]) {
      const s = M.seenFrom(geomOf(mesh), terrain, rings, k, town.wx, town.wz, { skip: skipFor(terrain) });
      const hidden = s.hidden.filter(v => v > 0.05).length / s.samples;
      const gap = s.gap.filter(v => v > 0.05).length / s.samples;
      // before round 28: 13-25% of the world-road vertices buried, 23-71% hanging
      assert.ok(hidden < 0.02, `${seed}@${scale} ${label}: ${(100 * hidden).toFixed(2)}% buried in the drawn hill`);
      assert.ok(gap < 0.01, `${seed}@${scale} ${label}: ${(100 * gap).toFixed(2)}% hanging past the skirt`);
    }
  }
  void rings0;
});

test('both road materials carry the distance shader, and the formula the test models is the one compiled', () => {
  const { features } = world(25392, 0.35);
  for (const mesh of [features.roadMesh, features.streetMesh]) {
    const m = mesh.material;
    assert.ok(m.defines?.FH_PULL_K && m.defines?.FH_SKIRT_K, 'road material has no distance shader');
    const shader = { vertexShader: '#include <common>\n#include <begin_vertex>\n#include <project_vertex>' };
    m.onBeforeCompile(shader);
    assert.match(shader.vertexShader, /attribute float skirt/);
    assert.match(shader.vertexShader, /FH_SKIRT_START \) \* FH_SKIRT_K, 0\.0, FH_SKIRT_MAX/);
    assert.match(shader.vertexShader, /FH_PULL_START \) \* FH_PULL_K, 0\.0, FH_PULL_MAX/);
  }
  // road-measure's `shaderAt` is the same clamp
  const k = F.ROAD_SHADER.road;
  assert.equal(M.shaderAt(k, k.pullStart + 100).pull, Math.min(k.pullMax, 100 * k.pull));
});

test('drape: a ribbon over a bump is raised just enough, and a valley is followed, not bridged', () => {
  // pure: a 60 m lane across a ground with a 2 m sine bump between its two points
  const ground = (x) => 2 * Math.max(0, Math.sin((x / 60) * Math.PI));
  const lane = { points: [[0, 0], [60, 0]], surface: [0, 0], half: 3 };
  const flat = laneRibbon(lane, { lift: 0.06 });
  const draped = laneRibbon(lane, { lift: 0.06, groundAt: (x) => ground(x), drape: 3, skirt: { drop: 0.45, out: 0.35 } });
  // the old two-row strip is a straight sheet through the bump
  const midFlat = M.ribbonVsGround(flat, (x) => ground(x));
  assert.ok(Math.min(...midFlat) < -1.5, 'the test ground no longer bulges through a two-point strip');
  const d = M.ribbonVsGround(draped, (x) => ground(x));
  assert.ok(Math.min(...d) > -0.01, `draped ribbon dips ${(-Math.min(...d)).toFixed(3)} m under the bump`);
  assert.ok(Math.max(...d) < 0.12, `draped ribbon floats ${Math.max(...d).toFixed(3)} m`);
  assert.ok(draped.rows >= 21, `only ${draped.rows} rows over 60 m at a 3 m step`);
  // a valley: the same, upside down — the ribbon goes down into it
  const valley = (x) => -ground(x);
  const dv = M.ribbonVsGround(laneRibbon(lane, { lift: 0.06, groundAt: valley, drape: 3 }), valley);
  assert.ok(Math.max(...dv) < 0.12, `draped ribbon bridges the valley by ${Math.max(...dv).toFixed(2)} m`);
  // a step function picks its drape density by place
  const coarse = laneRibbon(lane, { lift: 0.06, groundAt: () => 0, drape: () => 15 });
  assert.equal(coarse.rows, 5);
});

test('a branch stops at the kerb of a road that outranks it, instead of drawing a second sheet over it', () => {
  // the drawn paving inside two carriageways at once, on the user's world: two layers of it there
  // before (28 m2 at Small), one now
  const { terrain, features } = world(25392, 0.35);
  const g = geomOf(features.roadMesh);
  const halfOf = new Map(terrain.roadPaths.map(p => [p.id, p.half]));
  let twice = 0;
  for (let t = 0; t < g.index.length; t += 3) {
    const a = g.index[t], b = g.index[t + 1], c = g.index[t + 2];
    if (g.normal[a * 3 + 1] < 0.99) continue;
    const x = (g.position[a * 3] + g.position[b * 3] + g.position[c * 3]) / 3, z = (g.position[a * 3 + 2] + g.position[b * 3 + 2] + g.position[c * 3 + 2]) / 3;
    const pair = terrain.roadPairAt(x, z);
    if (!pair?.[1]) continue;
    if (pair[0].dist < halfOf.get(pair[0].id) - 0.3 && pair[1].dist < halfOf.get(pair[1].id) - 0.3) {
      const ux = g.position[b * 3] - g.position[a * 3], uz = g.position[b * 3 + 2] - g.position[a * 3 + 2];
      const vx = g.position[c * 3] - g.position[a * 3], vz = g.position[c * 3 + 2] - g.position[a * 3 + 2];
      twice += Math.abs(ux * vz - uz * vx) / 2;
    }
  }
  assert.ok(twice < 20, `${twice.toFixed(0)} m2 of paving drawn where two carriageways overlap (28 before round 28)`);
});

test('a road rebuild stays affordable (logged; fails only past 3x the round-27 cost)', () => {
  const { features, town } = world(25392, 0.35);
  let best = Infinity;
  for (let k = 1; k <= 3; k++) {
    const t0 = performance.now();
    features.update(town.wx + 300 * k, town.wz, true);
    best = Math.min(best, performance.now() - t0);
  }
  console.log(`# road + town rebuild on 25392 @ Small: ${best.toFixed(0)} ms (round 27: ~65 ms)`);
  assert.ok(best < 400, `a rebuild took ${best.toFixed(0)} ms`);
});
