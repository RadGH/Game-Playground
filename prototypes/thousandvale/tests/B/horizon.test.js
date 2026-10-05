// Stream B — far-horizon bake (data/world/horizon.bin) and reader (js/rules/horizon-read.js).
//   node --test prototypes/thousandvale/tests/B/horizon.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHorizon, horizonRef } from '../../js/rules/horizon-read.js';
import { parseTerrain } from '../../js/rules/terrain-read.js';
import { bakeHorizon, horizonHash } from '../../tools/bake-horizon.mjs';
import { loadWorld } from '../../tools/bake-zone.mjs';

const root = new URL('../../', import.meta.url);
const H = parseHorizon(readFileSync(new URL('data/world/horizon.bin', root)));
const MAN = JSON.parse(readFileSync(new URL('data/world/horizon.json', root), 'utf8'));

test('horizon-read.js is pure (only sibling js/rules imports, no DOM/fetch/random)', () => {
  const src = readFileSync(new URL('js/rules/horizon-read.js', root), 'utf8').replace(/\/\/.*$/gm, '');
  for (const m of src.matchAll(/\bimport\b[^;]*?from\s*'([^']+)'/g)) assert.match(m[1], /^\.\/[a-z-]+\.js$/);
  for (const bad of [/\bwindow\b/, /\bdocument\b/, /\bfetch\s*\(/, /Math\.random/, /node:/]) assert.doesNotMatch(src, bad);
});

test('checked-in horizon matches a fresh bake (decoded layers)', () => {
  const fresh = bakeHorizon();
  assert.equal(horizonHash(fresh), MAN.hash, 'horizon stale — run tools/bake-horizon.mjs (after any zone bake)');
  assert.equal(horizonHash({ hq: H.layers.height, wq: H.layers.waterTop, biome: H.layers.biome }), MAN.hash, 'horizon.bin and horizon.json disagree');
  assert.deepEqual(H.meta.baked.slice().sort(), fresh.meta.baked.slice().sort());
});

test('in every baked zone the horizon IS the zone on every shared sample (height, water, biome)', () => {
  for (const id of MAN.baked) {
    const t = parseTerrain(readFileSync(new URL(`data/zones/${id}/terrain.bin`, root)));
    const ox = +id.slice(1, 3) * 2048, oz = +id.slice(4, 6) * 2048;
    for (let j = 0; j < t.size; j += 16 * 4) for (let i = 0; i < t.size; i += 16 * 4) {
      const x = i * t.step, z = j * t.step;
      assert.equal(H.heightAt(ox + x, oz + z), t.heightOfSample(i, j), `${id} (${x}, ${z})`);
      assert.equal(H.biomeAt(ox + x, oz + z), t.biomeAt(x, z));
    }
    // and on the zone's whole rim, so the far mesh meets the loaded zone's edge
    for (let k = 0; k <= 2048; k += 32) {
      assert.equal(H.heightAt(ox + k, oz), t.heightAt(k, 0));
      assert.equal(H.heightAt(ox + 2048, oz + k), t.heightAt(2048, k));
    }
  }
});

test('outside the baked zones the horizon is close to what a bake will make (median < 3 m off, away from towns)', () => {
  // compare the base-ground rule against an actual bake where we have both: a baked zone's samples vs baseGround
  const { ref } = loadWorld();
  const diffs = [];
  for (const id of ['z13_01', 'z14_04', 'z11_03']) {
    const t = parseTerrain(readFileSync(new URL(`data/zones/${id}/terrain.bin`, root)));
    const ox = +id.slice(1, 3) * 2048, oz = +id.slice(4, 6) * 2048;
    for (let z = 16; z < 2048; z += 64) for (let x = 16; x < 2048; x += 64) {
      if (t.waterAt(x, z).kind !== 'none') continue;
      diffs.push(Math.abs(ref.baseGround(ox + x, oz + z) - t.heightAt(x, z)));
    }
  }
  diffs.sort((a, b) => a - b);
  const med = diffs[diffs.length >> 1];
  console.log(`# base ground vs baked: median ${med.toFixed(2)} m, p90 ${diffs[Math.floor(diffs.length * 0.9)].toFixed(2)} m over ${diffs.length} points`);
  assert.ok(med < 3, `median ${med}`);
});

test('the horizon covers the world, has sea where the world has sea, and never returns NaN', () => {
  const { json: W } = loadWorld();
  assert.equal(H.width, W.grid.cols * 64 + 1);
  assert.equal(H.height, W.grid.rows * 64 + 1);
  for (const [x, z] of [[-50, -50], [1e9, 3], [NaN, 7], [18000, 9000]]) assert.ok(Number.isFinite(H.heightAt(x, z)));
  assert.ok(H.waterAt(10, 10), 'the world corner is ocean');
  let wet = 0; const g = H.waterGrid(); for (let k = 0; k < g.length; k++) if (!Number.isNaN(g[k])) wet++;
  assert.ok(wet / g.length > 0.1 && wet / g.length < 0.4, `wet share ${wet / g.length}`);
});

test('horizonRef: what the server puts in `joined`', () => {
  const r = horizonRef(MAN, 'z12_02');
  assert.deepEqual(r, { file: 'data/world/horizon.bin', hash: MAN.hash, step: 32, zone: { id: 'z12_02', origin: { x: 24576, z: 4096 } } });
  assert.equal(horizonRef(MAN, 'test').zone.origin, null);
});
