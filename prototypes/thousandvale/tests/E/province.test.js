// node --test prototypes/thousandvale/tests/E/province.test.js
// The M2 starter province (data/provinces/torbor_downs.json): 16 zones on a grid, every one with a ready
// archetype, a dungeon family, two rares, a hook, a quest file; neighbours never share an archetype; the
// vignette assignment meets the variety rule (any 5 connected zones >= 40 distinct vignettes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { FAMILIES } from '../../js/rules/dungeon-tiers.js';
import { connectedSets, gridDist } from '../../tools/province-graph.mjs';

const root = new URL('../../', import.meta.url);
const J = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const P = J('data/provinces/torbor_downs.json');
const ARCH = J('data/provinces/archetypes.json').archetypes;
const HOOKS = J('data/hooks.json').hooks;
const ENC = Object.fromEntries(readdirSync(new URL('data/encounters/', root)).filter(f => f.endsWith('.json')).map(f => J('data/encounters/' + f)).filter(d => d.id).map(d => [d.id, d]));
const ZONES = Object.entries(P.zones);

test('16 zones on a 4x4 grid, one per cell, neighbours never share an archetype, every archetype used', () => {
  assert.equal(ZONES.length, 16);
  assert.equal(new Set(ZONES.map(([, z]) => z.grid.join())).size, 16);
  for (const [a, za] of ZONES) for (const [b, zb] of ZONES) if (a < b && gridDist(za.grid, zb.grid) === 1) assert.notEqual(za.archetype, zb.archetype, `${a} / ${b}`);
  assert.equal(new Set(ZONES.map(([, z]) => z.archetype)).size, 12);
});

test('bands rise from the start zone: a neighbour is never more than 3 levels above', () => {
  for (const [a, za] of ZONES) for (const [b, zb] of ZONES) if (gridDist(za.grid, zb.grid) === 1) assert.ok(zb.band[0] - za.band[0] <= 3, `${a} -> ${b}`);
  assert.equal(P.zones[P.grid.start].band[0], 1);
});

test('every zone resolves: ready archetype, ready dungeon family, 2 rares of its own, a hook, a quest file', () => {
  const bad = [];
  for (const [id, z] of ZONES) {
    if (ARCH[z.archetype]?.status !== 'ready') bad.push(`${id}: archetype ${z.archetype}`);
    if (!FAMILIES[z.dungeon.family]?.ready) bad.push(`${id}: dungeon ${z.dungeon.family}`);
    if (z.rares?.length !== 2 || z.rares.some(r => ENC[r]?.tier !== 'rare')) bad.push(`${id}: rares ${z.rares}`);
    if (id !== 'test') for (const r of z.rares) if (ENC[r]?.zone !== id) bad.push(`${id}: ${r} is filed under ${ENC[r]?.zone}`);
    if (!HOOKS.some(h => h.id === z.hook && h.zone === id)) bad.push(`${id}: hook ${z.hook}`);
    if (!existsSync(new URL(z.quests, root))) bad.push(`${id}: ${z.quests}`);
  }
  if (ENC[P.worldBoss.id]?.tier !== 'world') bad.push('world boss');
  if (!P.zones[P.worldBoss.zone]) bad.push('world boss zone');
  assert.deepEqual(bad, []);
});

test('every ready archetype is complete', () => {
  const enemies = J('../farhold/data/enemies.json'); const B = new Set([...enemies.enemies, ...enemies.bosses].map(e => e.id));
  for (const [k, a] of Object.entries(ARCH)) {
    assert.equal(a.status, 'ready', k);
    for (const m of a.monsters) assert.ok(B.has(m), `${k}: ${m}`);
    for (const f of a.dungeonFamilies) assert.ok(FAMILIES[f], `${k}: ${f}`);
    assert.ok(Object.keys(a.vignetteWeights).length >= 12, `${k}: vignettes`);
    assert.ok(a.event && a.feel && a.extras, k);
  }
});

test('VARIETY: any 5 connected zones hold >= 40 distinct vignettes; no vignette twice within 2 zones', () => {
  const A = J('data/vignettes/assignment/torbor_downs.json').zones;
  const ids = ZONES.map(([id]) => id);
  const sets = connectedSets(ZONES.map(([, z]) => z.grid), 5);
  let worst = Infinity;
  for (const s of sets) worst = Math.min(worst, new Set(s.flatMap(i => A[ids[i]])).size);
  assert.ok(worst >= 40, `worst 5-zone set has ${worst} distinct`);
  for (const [a, za] of ZONES) {
    assert.equal(new Set(A[a]).size, A[a].length, `${a}: a repeat inside the zone`);
    assert.ok(A[a].length >= 8 && A[a].length <= 12, `${a}: ${A[a].length} vignettes`);
    for (const [b, zb] of ZONES) if (a < b && gridDist(za.grid, zb.grid) <= 2) assert.deepEqual(A[a].filter(v => A[b].includes(v)), [], `${a}/${b}`);
  }
});
