// Stream D — the fine far horizon (js/client/horizon-grid.js over B's data/world/horizon.bin).
//   node --test prototypes/thousandvale/tests/D/horizon-grid.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHorizon } from '../../js/rules/horizon-read.js';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { prepareGrid, buildChunk, gridHeightAt, lodFor, chunkCounts, chunkRect, coveredBy, rectDistance, CHUNK, LOD_RINGS, skirtDepth } from '../../js/client/horizon-grid.js';

const G = new URL('../../', import.meta.url);
const bin = readFileSync(new URL('data/world/horizon.bin', G));
const g = prepareGrid(bin);

test('grid: one chunk per zone on high (64 x 32 m = 2,048 m), four zones on low; the world tiles exactly', () => {
  assert.equal(g.step, 32);
  assert.equal(CHUNK.high * g.step, 2048);
  const hi = chunkCounts(g, CHUNK.high), lo = chunkCounts(g, CHUNK.low);
  assert.equal(hi.cx * CHUNK.high, g.W - 1); assert.equal(hi.cz * CHUNK.high, g.H - 1);
  assert.ok(lo.cx * lo.cz * 4 >= hi.cx * hi.cz, 'low covers the same world with a quarter of the chunks');
  const r = chunkRect(g, 12, 2, 64);
  assert.deepEqual(r, { minX: 24576, minZ: 4096, maxX: 26624, maxZ: 6144 }, 'chunk (12,2) is zone z12_02');
});

test('drawn height: the land is horizon.bin\'s own height, water is flat at its surface', () => {
  const h = parseHorizon(bin);
  let land = 0, wet = 0;
  for (let k = 0; k < 4000; k++) {
    const x = (k * 7919) % 36000 + 100.5, z = (k * 104729) % 28000 + 100.5;
    const w = h.waterAt(x, z);
    if (!w) { land++; const i = Math.round(x / 32), j = Math.round(z / 32); assert.ok(Math.abs(g.drawn[j * g.W + i] - h.heightOfSample(i, j)) < 1e-3); }
    else { wet++; assert.ok(gridHeightAt(g, x, z) >= h.heightAt(x, z) - 0.01, 'water is never drawn under its bed'); }
  }
  // (2026-10-14: the world is two islands in open sea, so about one sample in eight is land)
  assert.ok(land > 300 && wet > 100, `sampled both (${land} land, ${wet} wet)`);
});

test('baked zones: the horizon sample IS the zone\'s ground sample, so the far mesh meets a loaded zone', () => {
  const t = parseTerrain(readFileSync(new URL('data/zones/z12_02/terrain.bin', G)));
  let n = 0, worst = 0;
  for (let a = 0; a <= 64; a += 4) for (const b of [0, 64]) {
    const x = 24576 + a * 32, z = 4096 + b * 32;
    const lx = a * 32, lz = b * 32;              // zone-local metres (a zone bake's origin is its own corner)
    if (t.waterAt?.(lx, lz)?.depth > 0) continue;
    worst = Math.max(worst, Math.abs(gridHeightAt(g, x, z) - t.heightAt(lx, lz))); n++;
  }
  assert.ok(n > 10, 'border samples checked');
  assert.ok(worst < 0.05, `zone border vs horizon worst ${worst.toFixed(3)} m`);
});

test('chunks: vertex/triangle counts per stride, a skirt below every edge, coarse chunks are cheap', () => {
  for (const stride of [1, 2, 4, 8, 16]) {
    const c = buildChunk(g, 12, 2, 64, stride);
    const n = 64 / stride + 1, core = n * n, ring = 4 * n - 4;
    assert.equal(c.pos.length / 3, core + ring, `stride ${stride} vertices`);
    assert.equal(c.tris, (n - 1) * (n - 1) * 2 + ring * 2);
    assert.equal(c.idx.length, c.tris * 3);
    for (let k = 0; k < c.idx.length; k++) if (c.idx[k] >= core + ring) assert.fail('index out of range');
    // skirt vertex e sits skirtDepth below its edge vertex
    const y0 = c.pos[1], ys = c.pos[core * 3 + 1];
    assert.ok(Math.abs(y0 - ys - skirtDepth(stride)) < 1e-3, 'first skirt vertex hangs under the first edge vertex');
    for (let k = 1; k < c.nor.length; k += 3) assert.ok(c.nor[k] > 0, 'normals point up');
  }
  assert.ok(buildChunk(g, 0, 0, 64, 8).tris < 200, 'a far chunk is a couple of hundred triangles');
  // edge chunks of a world that is not a multiple of the chunk size still close
  const lo = chunkCounts(g, 128); const last = buildChunk(g, lo.cx - 1, lo.cz - 1, 128, 16);
  assert.ok(last.bounds.maxX <= (g.W - 1) * 32 && last.bounds.maxZ <= (g.H - 1) * 32);
});

test('LOD: rings by distance, coarser far away, low quality never at full detail, hysteresis at ring edges', () => {
  assert.equal(lodFor(0, 'high'), 1);
  assert.equal(lodFor(5000, 'high'), 2);
  assert.equal(lodFor(30000, 'high'), 8);
  assert.equal(lodFor(0, 'low'), 2);
  assert.equal(lodFor(30000, 'low'), 16);
  for (const q of Object.keys(LOD_RINGS)) { let prev = 0; for (let d = 0; d < 40000; d += 250) { const s = lodFor(d, q); assert.ok(s >= prev, `${q}: stride never gets finer further out`); prev = s; } }
  const edge = LOD_RINGS.high[0][0];
  assert.equal(lodFor(edge * 1.05, 'high', 1), 1, 'just past the edge: keep the fine stride');
  assert.equal(lodFor(edge * 1.2, 'high', 1), 2, 'well past it: go coarse');
  assert.equal(lodFor(edge * 0.95, 'high', 2), 2, 'just inside: keep the coarse one');
});

test('budget: a whole-world frame of chunks stays cheap on high and cheaper on low', () => {
  const tally = quality => {
    const size = CHUNK[quality], { cx, cz } = chunkCounts(g, size); let tris = 0, draws = 0;
    const cam = { x: 25168, z: 5360 };                    // Torborhold
    const loaded = [{ minX: 24576, minZ: 4096, maxX: 26624, maxZ: 6144 }];
    for (let cj = 0; cj < cz; cj++) for (let ci = 0; ci < cx; ci++) {
      const r = chunkRect(g, ci, cj, size);
      if (coveredBy(r, loaded)) continue;
      const s = lodFor(rectDistance(r, cam.x, cam.z), quality);
      const n = Math.ceil(size / s); tris += n * n * 2 + 8 * n; draws++;
    }
    return { tris, draws };
  };
  const hi = tally('high'), lo = tally('low');
  assert.ok(hi.tris < 260000, `high ${hi.tris} triangles`);
  console.log('# budget high', JSON.stringify(hi), 'low', JSON.stringify(lo));
  assert.ok(lo.tris < 80000 && lo.draws < 70 && lo.tris < hi.tris / 2.5, `low ${lo.tris} triangles in ${lo.draws} chunks`);
  assert.ok(coveredBy({ minX: 24576, minZ: 4096, maxX: 26624, maxZ: 6144 }, [{ minX: 24576, minZ: 4096, maxX: 26624, maxZ: 6144 }]));
  assert.ok(!coveredBy({ minX: 22528, minZ: 4096, maxX: 26624, maxZ: 8192 }, [{ minX: 24576, minZ: 4096, maxX: 26624, maxZ: 6144 }]), 'a four-zone chunk with one zone loaded still draws');
});

test('holes: a chunk partly under loaded zones leaves those cells out, at every stride, and nothing else', () => {
  const zone = { minX: 24576, minZ: 4096, maxX: 26624, maxZ: 6144 };      // z12_02, one quarter of low chunk (6,1)
  for (const stride of [2, 4, 8, 16]) {
    const whole = buildChunk(g, 6, 1, 128, stride), cut = buildChunk(g, 6, 1, 128, stride, [zone]);
    const n = 128 / stride, ring = 4 * (n + 1) - 4;
    assert.equal(whole.tris - cut.tris, (n / 2) * (n / 2) * 2, `stride ${stride}: exactly one quarter of the cells removed`);
    assert.ok(cut.holed && !whole.holed);
    // no remaining triangle has its centre inside the zone
    for (let k = 0; k < (cut.tris - ring * 2) * 3; k += 3) {
      let x = 0, z = 0; for (let c = 0; c < 3; c++) { x += cut.pos[cut.idx[k + c] * 3] / 3; z += cut.pos[cut.idx[k + c] * 3 + 2] / 3; }
      assert.ok(!(x > zone.minX && x < zone.maxX && z > zone.minZ && z < zone.maxZ), 'a triangle left under the loaded zone');
    }
  }
  assert.equal(buildChunk(g, 0, 0, 128, 8, [zone]).tris, buildChunk(g, 0, 0, 128, 8).tris, 'a chunk the hole does not touch is unchanged');
});
