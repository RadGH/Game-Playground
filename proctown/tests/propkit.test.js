// node --test proctown/tests/propkit.test.js
//
// The set-piece kit is drawn by games as instanced unit shapes, so these are the guarantees they rely on:
// every model builds out of the eight MESHES with real sizes and colours, the same seed is the same model,
// nothing is buried deep in the ground, every named model stream E's set pieces ask for exists, crop fields
// stay inside their plot and under the part cap, and a fence line follows its points.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROP_MESHES, propModel, cropField, fenceLine, PROP_MODEL_IDS, PROP_MODEL_INFO, PROP_GROUPS, CROP_IDS, CROP_PART_CAP, FENCE_LINE_KINDS } from '../js/propkit.js';
import { MESHES } from '../js/buildkit.js';

const HEX = /^#[0-9a-f]{6}$/i;
const SEEDS = [1, 2, 7, 42, 20261005];
const allParts = m => [...m.parts, ...m.spin.flatMap(s => s.parts)];

function checkPart(p, where) {
  assert.ok(MESHES.includes(p.mesh) || PROP_MESHES.includes(p.mesh), `${where}: unknown mesh ${p.mesh}`);
  for (const k of ['x', 'y', 'z', 'yaw', 'rx', 'rz']) assert.ok(Number.isFinite(p[k]), `${where}: ${k} not finite`);
  for (const k of ['w', 'h', 'd']) assert.ok(Number.isFinite(p[k]) && p[k] > 0, `${where}: ${k} must be positive (${p[k]})`);
  assert.match(p.colour, HEX, `${where}: colour ${p.colour}`);
}

test('every model builds from the eight unit shapes with real sizes and colours', () => {
  assert.ok(PROP_MODEL_IDS.length >= 85);
  for (const id of PROP_MODEL_IDS) for (const seed of SEEDS) {
    const m = propModel(id, { seed });
    assert.ok(m && m.id === id, id);
    assert.ok(m.parts.length > 0, `${id}: no parts`);
    for (const p of allParts(m)) checkPart(p, `${id}#${seed}`);
    assert.ok(m.radius > 0 && m.radius < 20, `${id}: radius ${m.radius}`);
    for (const s of m.spin) { assert.ok(['x', 'z'].includes(s.axis)); assert.ok(Number.isFinite(s.speed)); }
    for (const f of [...m.fires, ...m.glows]) for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(f[k]));
    for (const g of m.glows) assert.match(g.color, HEX);
  }
});

test('the same seed is the same model; seeds do vary the small things', () => {
  let differ = 0;
  for (const id of PROP_MODEL_IDS) {
    assert.deepEqual(propModel(id, { seed: 9 }), propModel(id, { seed: 9 }), id);
    if (JSON.stringify(propModel(id, { seed: 1 })) !== JSON.stringify(propModel(id, { seed: 2 }))) differ++;
  }
  assert.ok(differ > PROP_MODEL_IDS.length * 0.3, `only ${differ} models vary by seed`);
});

test('nothing is buried: every part starts at or above 0.6 m below the ground', () => {
  for (const id of PROP_MODEL_IDS) for (const p of propModel(id, { seed: 3 }).parts) assert.ok(p.y >= -0.6, `${id}: part ${p.mesh} at y ${p.y}`);
});

test('unknown ids are null; every model has info with a known group', () => {
  assert.equal(propModel('no_such_thing'), null);
  for (const id of PROP_MODEL_IDS) { const i = PROP_MODEL_INFO[id]; assert.ok(i && i.label && i.desc && PROP_GROUPS.includes(i.group), id); }
});

test("every named model stream E's set pieces ask for exists in the kit", () => {
  const sp = JSON.parse(readFileSync(new URL('../../prototypes/thousandvale/data/vignettes/setpieces.json', import.meta.url)));
  const want = new Set(Object.keys(sp.models || {}).filter(k => !k.startsWith('_')));
  for (const v of sp.vignettes || []) for (const m of v.models || []) want.add(m.id);
  const missing = [...want].filter(id => !PROP_MODEL_IDS.includes(id));
  assert.deepEqual(missing, []);
  for (const extra of ['mausoleum', 'iron_gate', 'windmill', 'barn', 'well', 'cherry_tree', 'ruined_wall', 'lumber_tent', 'campfire', 'lantern_post', 'sheaf_stook', 'pig_sty']) assert.ok(PROP_MODEL_IDS.includes(extra), extra);
});

test('the turning parts turn: water wheel, windmill sails, the gear cog', () => {
  for (const id of ['watermill_wheel', 'windmill', 'gear_housing']) assert.ok(propModel(id).spin.length > 0 && propModel(id).spin[0].parts.length > 3, id);
  for (const id of ['campfire', 'smoking_rack']) assert.ok(propModel(id).fires.length > 0, id);
  for (const id of ['inn_sign', 'sigil_slab', 'lantern_post']) assert.ok(propModel(id).glows.length > 0, id);
  for (const id of ['barn', 'windmill', 'mausoleum', 'broken_tower']) assert.ok(propModel(id).solid?.r > 0, id);
});

test('crop fields stay inside their plot and under the part cap', () => {
  for (const crop of [...CROP_IDS, 'something_new']) for (const [w, d] of [[4, 4], [12, 20], [40, 60]]) {
    const parts = cropField({ w, d, crop, seed: 5 });
    assert.ok(parts.length > 0, `${crop} ${w}x${d}: empty`);
    assert.ok(parts.length <= CROP_PART_CAP, `${crop} ${w}x${d}: ${parts.length} parts`);
    for (const p of parts) {
      checkPart(p, crop);
      const reach = Math.max(p.w, p.d) / 2 + 0.6;
      assert.ok(Math.abs(p.x) <= w / 2 + reach && Math.abs(p.z) <= d / 2 + reach, `${crop}: part outside the plot at ${p.x},${p.z}`);
    }
  }
  assert.deepEqual(cropField({ w: 10, d: 10, crop: 'wheat', seed: 3 }), cropField({ w: 10, d: 10, crop: 'wheat', seed: 3 }));
  assert.notDeepEqual(cropField({ w: 10, d: 10, crop: 'wheat' }).map(p => p.colour), cropField({ w: 10, d: 10, crop: 'cabbage' }).map(p => p.colour));
});

test('a fence line follows its points, for every kind', () => {
  const pts = [[0, 0], [10, 0], [10, 8]];
  const segDist = (x, z) => {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
    }
    return best;
  };
  for (const kind of FENCE_LINE_KINDS) {
    const parts = fenceLine(pts, { kind, seed: 2 });
    assert.ok(parts.length > 4, kind);
    for (const p of parts) { checkPart(p, kind); assert.ok(segDist(p.x, p.z) < 1.6, `${kind}: part ${p.x},${p.z} strays from the line`); }
    // it covers both legs (something near each end and the corner)
    for (const [x, z] of [[0.5, 0], [10, 0], [10, 7.5]]) assert.ok(parts.some(p => Math.hypot(p.x - x, p.z - z) < 1.8), `${kind}: nothing near ${x},${z}`);
  }
  assert.deepEqual(fenceLine([], {}), []);
});
