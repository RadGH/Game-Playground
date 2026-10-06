// node --test prototypes/thousandvale/tests/E/province.test.js
// The M2 starter province (data/provinces/torbor_downs.json): 16 zones on a grid, every one with a ready
// archetype, a dungeon family, two rares, a hook, a quest file; neighbours never share an archetype; the
// vignette assignment meets the variety rule (any 5 connected zones >= 40 distinct vignettes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { FAMILIES } from '../../js/rules/dungeon-tiers.js';
import { connectedSets, gridDist } from '../../tools/province-graph.mjs';
import { levelField } from '../../tools/content-place.mjs';

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

test('bands rise from the start zone (P26): the level field never jumps more than 1 across a zone border within 2 km of the hub (2.5 beyond), bands hold what the ramp gives', () => {
  // the hub of the start zone, as the placer uses it (tools/content-place.mjs levelField)
  const st = P.zones[P.grid.start], wid = J('data/world/province-map.json').provinces.torbor_downs.map[P.grid.start];
  const hubP = J(`data/zones/${wid}/placements.json`).placements.find(p => p.kind === 'settlement' && p.data.hub);
  const LF = levelField({ sheet: P, hub: { x: st.grid[0] * 2048 + hubP.x, z: st.grid[1] * 2048 + hubP.z } });
  assert.equal(st.band[0], 1);
  const bad = [];
  for (const [a, za] of ZONES) {
    if (LF.span(a)[0] !== za.band[0]) bad.push(`${a}: band starts ${za.band[0]} but the ramp starts ${LF.span(a)[0]}`);
    for (const [b, zb] of ZONES) {
      if (gridDist(za.grid, zb.grid) !== 1) continue;
      // walk the shared edge: a's side vs b's side, 1 m apart
      for (let t = 16; t < 2048; t += 64) {
        const dx = zb.grid[0] - za.grid[0], dz = zb.grid[1] - za.grid[1];
        const ax = dx ? (dx > 0 ? 2047.5 : 0.5) : t, az = dz ? (dz > 0 ? 2047.5 : 0.5) : t;
        const bx = dx ? (dx > 0 ? 0.5 : 2047.5) : t, bz = dz ? (dz > 0 ? 0.5 : 2047.5) : t;
        const j = Math.abs(LF.at(a, ax, az) - LF.at(b, bx, bz));
        const cap = LF.dist(a, ax, az) < 2000 ? 1 : 2.5;    // gentle near the start; a far border may step (blight country)
        if (j > cap) { bad.push(`${a} -> ${b} at ${t}: ${j.toFixed(2)}`); break; }
      }
    }
  }
  assert.deepEqual(bad, []);
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

test('M3: every zone dungeon has its own name — not "<zone>: <family>", not a family label, never twice', () => {
  const names = ZONES.map(([k, z]) => [k, z.dungeon && z.dungeon.name]);
  for (const [k, n] of names) {
    assert.ok(typeof n === 'string' && n.length >= 6 && n.length <= 28, `${k}: dungeon.name "${n}"`);
    assert.ok(!n.includes(':'), `${k}: "${n}" reads like "<zone>: <family>"`);
    const fam = P.zones[k].dungeon.family.replace(/_/g, ' ');
    assert.ok(!n.toLowerCase().includes(fam), `${k}: "${n}" is just the family label (${fam})`);
    assert.ok(!/ember|veil|muster/i.test(n), `${k}: "${n}" uses a word the owner vetoed`);
  }
  assert.equal(new Set(names.map(([, n]) => n.toLowerCase())).size, names.length, 'no two dungeons share a name');
});

test('M3: Grimtallow carries the structured on-demand rule A reads (schedule.onDemand)', () => {
  const ev = J('data/quests/events.json').realm.find(e => e.id === 'world_grimtallow');
  assert.ok(ev, 'world_grimtallow exists');
  assert.equal(ev.schedule.type, 'fixed');
  // play-test 3 R3: fewer than 5 players at a time — one in band walking up is enough, after a quiet hour
  assert.deepEqual(ev.schedule.onDemand, { minInBand: 1, quietMinutes: 60 });
  // the prose says the same thing as the numbers
  assert.match(ev.schedule.also, new RegExp(`>= ${ev.schedule.onDemand.minInBand}\\b.*${ev.schedule.onDemand.quietMinutes} minutes`));
});
