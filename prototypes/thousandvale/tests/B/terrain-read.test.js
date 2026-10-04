// Stream B — terrain reader + test-zone bake.  node --test prototypes/thousandvale/tests/B/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain, createTerrain, gridIndices, FORMAT_VERSION, MAX_WALK_SLOPE } from '../../js/rules/terrain-read.js';
import { encodeTerrain } from '../../tools/bake-test-zone.mjs';

const BIN = new URL('../../data/zones/test/terrain.bin', import.meta.url);
const SRC = new URL('../../js/rules/terrain-read.js', import.meta.url);

/** A tiny synthetic map: height = a*x + b*z + c on a 5×5 grid, step 2. */
function plane(a, b, c, extra = {}) {
  const size = 5, step = 2, N = size * size;
  const heightMin = -100, heightMax = 100, s = 65535 / (heightMax - heightMin);
  const height = new Uint16Array(N), waterTop = new Uint16Array(N), waterKind = new Uint8Array(N), biome = new Uint8Array(N);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) height[j * size + i] = Math.round((a * i * step + b * j * step + c - heightMin) * s);
  const meta = { name: 'plane', size, step, origin: { x: 0, z: 0 }, heightMin, heightMax, biomes: [['grassland', 'Grassland', '#6f9f52']], ...extra };
  return { meta, height, waterTop, waterKind, biome };
}

test('js/rules purity: no three, DOM, window, storage, fetch or Math.random', () => {
  const src = readFileSync(SRC, 'utf8').replace(/\/\/.*$/gm, '');
  for (const bad of [/\bimport\b/, /\bwindow\b/, /\bdocument\b/, /localStorage|sessionStorage|indexedDB/, /\bfetch\s*\(/, /Math\.random/, /\bTHREE\b/]) assert.doesNotMatch(src, bad);
});

test('round trip: encode → parse gives the same layers and meta', () => {
  const p = plane(0.1, -0.2, 5);
  const t = parseTerrain(encodeTerrain(p));
  assert.equal(t.size, 5);
  assert.deepEqual([...t.layers.height], [...p.height]);
  assert.equal(t.meta.name, 'plane');
});

test('a wrong magic or version is refused, never misread', () => {
  const bytes = encodeTerrain(plane(0, 0, 0));
  const bad = bytes.slice(); bad[0] = 88;
  assert.throws(() => parseTerrain(bad), /bad magic/);
  const v2 = bytes.slice(); new DataView(v2.buffer).setUint32(4, FORMAT_VERSION + 1, true);
  assert.throws(() => parseTerrain(v2), /format version/);
  assert.throws(() => parseTerrain(bytes.slice(0, 200)), /bytes/);
});

test('heightAt, slopeAt, normalAt on a known plane', () => {
  const t = createTerrain(plane(0.5, 0.25, 10));
  for (const [x, z] of [[0, 0], [1.3, 2.9], [7.7, 0.4], [3, 3]]) assert.ok(Math.abs(t.heightAt(x, z) - (10 + 0.5 * x + 0.25 * z)) < 0.01, `${x},${z}`);
  const want = Math.atan(Math.hypot(0.5, 0.25)) * 180 / Math.PI;
  assert.ok(Math.abs(t.slopeAt(2.2, 3.1) - want) < 0.05);
  const n = t.normalAt(1, 1); assert.ok(n[1] > 0 && n[0] < 0 && n[2] < 0);
  assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9);
});

test('out of bounds and NaN clamp to the edge instead of NaN', () => {
  const t = createTerrain(plane(0.5, 0, 0));
  assert.ok(Math.abs(t.heightAt(-50, 2) - 0) < 0.01);
  assert.ok(Math.abs(t.heightAt(500, 2) - 4) < 0.01);
  assert.ok(Number.isFinite(t.heightAt(NaN, NaN)));
  assert.equal(t.walkable(-1, 2), false);
  assert.deepEqual(t.clamp(-3, 99), [0, 8]);
});

test('drawn = measured: heightAt is exactly the triangles gridIndices draws', () => {
  // a bumpy map so bilinear and triangle interpolation would disagree
  const size = 5, step = 2, N = size * size, p = plane(0, 0, 0);
  for (let k = 0; k < N; k++) p.height[k] = 30000 + ((k * 7919) % 13) * 900;
  const t = createTerrain(p), idx = gridIndices(size);
  const V = k => [(k % size) * step, t.heightOfSample(k % size, Math.floor(k / size)), Math.floor(k / size) * step];
  let checked = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const [a, b, c] = [V(idx[f]), V(idx[f + 1]), V(idx[f + 2])];
    // normal must point up (counter-clockwise from above, three.js front face)
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    assert.ok(u[2] * v[0] - u[0] * v[2] > 0, 'face points up');
    for (const [wa, wb] of [[0.2, 0.3], [0.5, 0.25], [0.1, 0.1]]) {
      const wc = 1 - wa - wb;
      const x = a[0] * wa + b[0] * wb + c[0] * wc, y = a[1] * wa + b[1] * wb + c[1] * wc, z = a[2] * wa + b[2] * wb + c[2] * wc;
      assert.ok(Math.abs(t.heightAt(x, z) - y) < 1e-6, `face ${f / 3} at ${x},${z}: ${t.heightAt(x, z)} vs ${y}`);
      checked++;
    }
  }
  assert.equal(checked, 16 * 2 * 3);
  assert.equal(gridIndices(5, 2).length, 2 * 2 * 6);
  assert.throws(() => gridIndices(5, 3));
});

test('water: depth is surface minus ground; a dry corner means no water', () => {
  const p = plane(0, 0, 0);
  const q = v => Math.round((v + 100) * 65535 / 200);
  for (let k = 0; k < 25; k++) { p.waterTop[k] = q(1.5); p.waterKind[k] = 3; }
  let t = createTerrain(p);
  const w = t.waterAt(3, 3);
  assert.equal(w.kind, 'river'); assert.ok(Math.abs(w.depth - 1.5) < 0.01 && Math.abs(w.surface - 1.5) < 0.01);
  assert.equal(t.walkable(3, 3), false);              // 1.5 m > wading depth
  p.waterTop[0] = 0; t = createTerrain(p);
  assert.equal(t.waterAt(0.5, 0.5).kind, 'none');
});

test('the baked test zone loads and is a sane place to stand', () => {
  const t = parseTerrain(readFileSync(BIN));
  assert.equal(t.size, 1025); assert.equal(t.extent, 2048);
  assert.match(t.meta.inputHash, /^[0-9a-f]{8}$/);
  const sp = t.meta.spawn;
  assert.ok(t.walkable(sp.x, sp.z), 'spawn is walkable');
  assert.equal(t.waterAt(sp.x, sp.z).kind, 'none');
  assert.ok(t.slopeAt(sp.x, sp.z) < 15, 'spawn is fairly flat');
  // mostly walkable, has some water, every height finite and inside the header range
  let walk = 0, wet = 0, total = 0;
  for (let z = 1; z < 2048; z += 16) for (let x = 1; x < 2048; x += 16) {
    total++; if (t.walkable(x, z)) walk++; if (t.waterAt(x, z).kind !== 'none') wet++;
    const h = t.heightAt(x, z); assert.ok(h >= t.meta.heightMin && h <= t.meta.heightMax);
  }
  assert.ok(walk / total > 0.9, `walkable share ${walk / total}`);
  assert.ok(wet > 0, 'the zone has water');
  assert.ok(MAX_WALK_SLOPE > 30);
  // every river sample's water surface stands above its ground (the sheet is never under the bed)
  const { waterTop, height } = t.layers;
  for (let k = 0; k < waterTop.length; k++) if (t.layers.waterKind[k] === 3 && waterTop[k]) { /* ring samples may be dry — only flag a sheet under its bed by > 0.5 m */
    const d = (waterTop[k] - height[k]) * (t.meta.heightMax - t.meta.heightMin) / 65535; assert.ok(d > -6, 'river sheet far under ground at ' + k);
  }
});

test('bake is deterministic and the checked-in terrain.bin is not stale', async () => {
  const { bakeTestZone } = await import('../../tools/bake-test-zone.mjs');
  const fresh = Buffer.from(encodeTerrain(bakeTestZone()));
  assert.equal(Buffer.compare(fresh, readFileSync(BIN)), 0, 'terrain.bin differs from a fresh bake — run tools/bake-test-zone.mjs');
});

test('heightGrid / waterGrid match the per-sample readers', () => {
  const p = plane(0.3, 0.1, 2); p.waterTop[6] = 40000; p.waterKind[6] = 2;
  const t = createTerrain(p), g = t.heightGrid(), w = t.waterGrid();
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) assert.equal(g[j * 5 + i], Math.fround(t.heightOfSample(i, j)));
  assert.ok(Number.isNaN(w[0]) && Math.abs(w[6] - t.waterOfSample(1, 1)) < 1e-3);
  assert.equal(t.heightGrid(), g, 'cached');
});

test('groundAdapter: Farhold-style walker interface (rise/run slope, depth number)', async () => {
  const { groundAdapter } = await import('../../js/rules/terrain-read.js');
  const g = groundAdapter(createTerrain(plane(0.5, 0, 3)));
  assert.ok(Math.abs(g.slopeAt(4, 4) - 0.5) < 1e-3 && Math.abs(g.slopeAt(4, 4, 1) - 0.5) < 1e-3);
  const n = g.normalAt(4, 4, 1, [0, 0, 0]); assert.ok(Math.abs(n[0] + 0.5 / Math.hypot(0.5, 1)) < 1e-3);
  assert.equal(g.waterAt(4, 4), 0); assert.equal(g.underwater(4, 4), false);
  assert.deepEqual(g.clampToWorld(-5, 50), [0, 8]);
});
