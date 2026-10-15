// Play-test 8, W18 — "Mountains in the distance lack trees": the far horizon's tree cover (js/client/horizon-grid.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prepareGrid, buildChunk, chunkCounts, treeCover, patchNoise, hash2, TREE_COVER, TREE_LINE, TREE_SLOPE, TREE_SPIRES, CANOPY, SPIRE } from '../../js/client/horizon-grid.js';
// play-test 11 (Z25): a spire is now a two-tier six-sided conifer — SPIRE.verts (14) vertices, SPIRE.tris (12) triangles,
// the crown's apex last (vertex 13); the triangle budgets below were raised with it (owner: 'their low model is bad')
const SV = SPIRE.verts, ST = SPIRE.tris, APEX = SPIRE.verts - 1;

const buf = readFileSync(new URL('../../data/world/horizon.bin', import.meta.url));
const g = prepareGrid(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

test('W18: the cover rule — forests are solid, hills and mountains are wooded, nothing grows on water, sand, snow, cliffs or above the tree line', () => {
  assert.ok(treeCover('temperateForest', 200, 0.05, 0.5) > 0.85);
  assert.ok(treeCover('borealForest', 400, 0.1, 0.1) > 0.75, 'a forest has no big clearings');
  assert.ok(treeCover('mountains', 500, 0.15, 0.7) > 0.5, 'the owner\'s mountains are wooded');
  assert.ok(treeCover('hills', 150, 0.05, 0.9) > 0.5); assert.ok(treeCover('hills', 150, 0.05, 0.05) < 0.25, 'hills: stands of trees with open ground between');
  for (const bare of ['ocean', 'lake', 'beach', 'desert', 'ice', 'snowyPeaks', 'tundra', 'volcanic', 'ashPlain', 'field', 'crop', 'road', 'gravel', 'yard', 'badlands', undefined]) assert.equal(treeCover(bare, 100, 0, 1), 0, String(bare));
  assert.equal(treeCover('mountains', TREE_LINE.to + 1, 0, 1), 0, 'above the tree line');
  assert.ok(treeCover('mountains', TREE_LINE.from - 50, 0, 1) > treeCover('mountains', (TREE_LINE.from + TREE_LINE.to) / 2, 0, 1), 'thinning toward it');
  assert.equal(treeCover('temperateForest', 100, TREE_SLOPE.to + 0.01, 1), 0, 'a cliff is rock');
  assert.ok(treeCover('temperateForest', 100, TREE_SLOPE.from, 1) > 0.8, 'a steep hillside is still forest (the old rock tint began at a third of this)');
  assert.ok(TREE_SLOPE.from >= 0.3 && TREE_SLOPE.to <= 0.55, 'trees climb steep ground but not cliffs');
  assert.equal(treeCover('temperateForest', -2, 0, 1), 0, 'not under water');
  for (const k of Object.keys(TREE_COVER)) assert.ok(g.keys.includes(k), `${k} is a biome of horizon.bin`);
  for (const k of Object.keys(CANOPY)) assert.ok(k === 'default' || g.keys.includes(k), k);
  // every value is in range and the noise is stable
  for (let i = 0; i < 400; i++) { const v = treeCover('hills', i * 2, (i % 40) / 100, patchNoise(i * 7, i * 3)); assert.ok(v >= 0 && v <= 1); }
  assert.equal(patchNoise(123, 456), patchNoise(123, 456)); assert.equal(hash2(5, 9, 2), hash2(5, 9, 2)); assert.notEqual(hash2(5, 9, 2), hash2(9, 5, 2));
});

test('W18: wooded land is painted canopy green — the Hills and Mountains round Torborhold are darker and greener than before', () => {
  const ci = Math.floor(23000 / 2048), cj = Math.floor(6200 / 2048);             // the range the report looks at
  const lum = c => { let s = 0, gsum = 0, n = c.col.length / 3; for (let i = 0; i < n; i++) { s += c.col[i * 3] + c.col[i * 3 + 1] + c.col[i * 3 + 2]; gsum += c.col[i * 3 + 1] / Math.max(1e-6, c.col[i * 3] + c.col[i * 3 + 2]); } return { mean: s / n, green: gsum / n }; };
  let greener = 0, total = 0;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const off = buildChunk(g, ci + a, cj + b, 64, 2, null, { trees: false }), on = buildChunk(g, ci + a, cj + b, 64, 2, null, {});
    assert.equal(on.tris, off.tris, 'the tint adds no geometry'); assert.equal(on.spires, 0, 'no shapes past the nearest ring');
    total++; if (lum(on).green > lum(off).green * 1.05 && lum(on).mean < lum(off).mean) greener++;
  }
  assert.ok(greener >= 6, `${greener} of ${total} chunks near the range read as wooded`);
});

test('W18: tree shapes — only on the nearest ring, inside the budget, on the ground, never under a loaded zone, the same every time', () => {
  const { cx, cz } = chunkCounts(g, 64);
  let most = 0, withTrees = 0;
  for (let cj = 0; cj < cz; cj += 2) for (let ci = 0; ci < cx; ci += 2) {
    const c = buildChunk(g, ci, cj, 64, 1, null, { spires: TREE_SPIRES.high });
    most = Math.max(most, c.spires); if (c.spires) withTrees++;
    assert.ok(c.spires <= TREE_SPIRES.high * 1.05, `chunk ${ci},${cj}: ${c.spires}`);
    assert.equal(c.pos.length, c.nor.length); assert.equal(c.pos.length, c.col.length);
    let maxI = 0; for (const i of c.idx) if (i > maxI) maxI = i;
    assert.ok(maxI < c.pos.length / 3, 'every index points at a vertex');
  }
  // (2026-10-14: only the two islands carry land, so far fewer of the sampled chunks have trees at all)
  assert.ok(withTrees >= 6 && most > 500, `${withTrees} chunks carry trees, the densest ${most}`);
  const ci = Math.floor(23000 / 2048), cj = Math.floor(6200 / 2048);
  const hi = buildChunk(g, ci, cj, 64, 1, null, { spires: TREE_SPIRES.high }), again = buildChunk(g, ci, cj, 64, 1, null, { spires: TREE_SPIRES.high });
  assert.ok(hi.spires > 100, `${hi.spires} spires on the range's chunk`);
  assert.deepEqual(Array.from(hi.pos.slice(-60)), Array.from(again.pos.slice(-60)), 'deterministic');
  const med = buildChunk(g, ci, cj, 64, 1, null, { spires: TREE_SPIRES.medium }), low = buildChunk(g, ci, cj, 64, 1, null, { spires: TREE_SPIRES.low }), far = buildChunk(g, ci, cj, 64, 2, null, { spires: TREE_SPIRES.high });
  assert.ok(med.spires <= TREE_SPIRES.medium * 1.05 && med.spires <= hi.spires); assert.equal(low.spires, 0, 'Low: the tint only'); assert.equal(far.spires, 0, 'stride 2 and beyond: the tint only');
  assert.equal(TREE_SPIRES.low, 0);
  assert.equal(hi.tris, buildChunk(g, ci, cj, 64, 1, null, { trees: false }).tris + hi.spires * ST, 'twelve triangles a spire');
  // each spire: an apex 9-18 m over four feet that stand in the ground, inside the chunk
  const V = hi.pos.length / 3, first = V - hi.spires * SV;
  for (let s = 0; s < hi.spires; s += 7) {
    const o = (first + s * SV) * 3, apexY = hi.pos[o + APEX * 3 + 1], footY = hi.pos[o + 1];
    assert.ok(apexY - footY > 9 && apexY - footY < 21, `height ${(apexY - footY).toFixed(1)}`);
    assert.ok(hi.pos[o + APEX * 3] >= hi.bounds.minX - 1 && hi.pos[o + APEX * 3] <= hi.bounds.maxX + 1 && hi.pos[o + APEX * 3 + 2] >= hi.bounds.minZ - 1 && hi.pos[o + APEX * 3 + 2] <= hi.bounds.maxZ + 1);
    assert.ok(apexY < TREE_LINE.to + 60, 'none above the tree line');
  }
  // a loaded zone over half the chunk: no spire stands in it
  const b = hi.bounds, hole = { minX: b.minX, minZ: b.minZ, maxX: (b.minX + b.maxX) / 2, maxZ: b.maxZ };
  const cut = buildChunk(g, ci, cj, 64, 1, [hole], { spires: TREE_SPIRES.high });
  const V2 = cut.pos.length / 3, f2 = V2 - cut.spires * SV;
  for (let s = 0; s < cut.spires; s++) assert.ok(cut.pos[(f2 + s * SV + APEX) * 3] > hole.maxX - 1, 'a spire under the real ground');
  assert.ok(cut.spires < hi.spires);
  // the whole ring round the starter town stays inside the triangle budget (about a third of it is in view at once)
  let ring = 0; const ti = Math.floor(25183 / 2048), tj = Math.floor(5388 / 2048);
  for (let a = -2; a <= 2; a++) for (let c2 = -2; c2 <= 2; c2++) if (a || c2) ring += buildChunk(g, ti + a, tj + c2, 64, 1, null, { spires: TREE_SPIRES.high }).spires;
  assert.ok(ring * ST / 3 < 130000, `${Math.round(ring * ST / 3)} tree triangles in view on High`);      // (round 8: 60k at 4 a spire; 120k measured with the two-tier tree)
});

test('W18: built off the main thread, with the horizon\'s own material (no new mesh, no new shader), and a switch to turn it off', () => {
  const hz = readFileSync(new URL('../../js/client/horizon.js', import.meta.url), 'utf8'), wk = readFileSync(new URL('../../js/client/horizon-worker.js', import.meta.url), 'utf8');
  assert.match(wk, /buildChunk\(grid, data\.ci, data\.cj, data\.chunk, data\.stride, data\.holes, data\.opts/);
  assert.match(hz, /horizonTrees/); assert.match(hz, /TREE_SPIRES\[quality\]/);
  const fine = hz.slice(hz.indexOf('async function createFineHorizon'), hz.indexOf('async function createMacroHorizon'));
  assert.equal((fine.match(/new THREE\.Mesh\w+Material\(/g) || []).length, 1, 'still ONE material for the fine horizon');
});

test('W18: inside loaded zones the bare Mountains slopes get a canopy of their own (spires only, under the zones, inside the budget)', async () => {
  const { buildCanopy, CANOPY_SPIRES, CANOPY_BIOMES } = await import('../../js/client/horizon-grid.js');
  const ci = 11, cj = 3, rect = { minX: ci * 2048, minZ: cj * 2048, maxX: (ci + 1) * 2048, maxZ: (cj + 1) * 2048 };     // the range west of Torborhold
  const c = buildCanopy(g, ci, cj, 64, [rect], { spires: CANOPY_SPIRES.high });
  assert.ok(c && c.spires > 1200, `${c?.spires} canopy spires on the range's own zone`);
  assert.ok(c.spires <= CANOPY_SPIRES.high); assert.equal(c.tris, c.spires * ST); assert.equal(c.pos.length, c.spires * SV * 3); assert.equal(c.roots.length, c.spires * 5, 'a root per spire (near-trees.js)');
  for (let s = 0; s < c.spires; s += 5) { const x = c.pos[(s * SV + APEX) * 3], z = c.pos[(s * SV + APEX) * 3 + 2]; assert.ok(x > rect.minX && x < rect.maxX && z > rect.minZ && z < rect.maxZ, 'under the loaded zone'); }
  assert.equal(buildCanopy(g, ci, cj, 64, [], { spires: 3600 }), null, 'no loaded zone: nothing (the horizon chunk has its own)');
  assert.equal(buildCanopy(g, ci, cj, 64, [rect], { spires: CANOPY_SPIRES.low }), null, 'Low: none');
  assert.deepEqual(CANOPY_BIOMES, ['mountains'], 'only the biome the bake leaves bare — hills and forests already have real trees');
  // half the zone loaded: only that half is dressed
  const half = buildCanopy(g, ci, cj, 64, [{ ...rect, maxX: rect.minX + 1024 }], { spires: CANOPY_SPIRES.high });
  if (half) for (let s = 0; s < half.spires; s++) assert.ok(half.pos[(s * SV + APEX) * 3] < rect.minX + 1024 + 1);
  // the whole 3 x 3 round the starter town: a few thousand triangles
  let n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const r = { minX: (12 + a) * 2048, minZ: (2 + b) * 2048, maxX: (13 + a) * 2048, maxZ: (3 + b) * 2048 }; n += buildCanopy(g, 12 + a, 2 + b, 64, [r], { spires: CANOPY_SPIRES.high })?.spires || 0; }
  assert.ok(n > 2000 && n * ST < 100000, `${n} spires, ${n * ST} triangles`);      // (92k measured; the nearest few hundred are real kit trees instead)
});
