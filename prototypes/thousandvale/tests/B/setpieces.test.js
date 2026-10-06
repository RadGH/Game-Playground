// Stream B — owner play-test 2: Q18 bespoke areas (set pieces) and Q10 town offices, on the CHECKED-IN bake.
//   node --test prototypes/thousandvale/tests/B/setpieces.test.js
// zone-bake.test.js proves the checked-in files match a fresh bake; this checks what the set pieces promise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseTerrain, parseNav, parseScatter, NAV, SCATTER_KINDS } from '../../js/rules/terrain-read.js';
import { makeRect, inRect, toLocal } from '../../tools/lib/zone-setpieces.mjs';

const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT));
const PMAP = JSON.parse(read('data/world/province-map.json')).provinces.torbor_downs.map;
const ZONES = Object.values(PMAP);
const START = ['z12_02', 'z12_01', 'z11_02', 'z13_02', 'z12_03'];
const OFFICES = JSON.parse(read('data/world/town-offices.json'));
const cache = new Map();
const zone = id => {
  if (!cache.has(id)) cache.set(id, { t: parseTerrain(read(`data/zones/${id}/terrain.bin`)), nav: parseNav(read(`data/zones/${id}/nav.bin`)), sc: parseScatter(read(`data/zones/${id}/scatter.bin`)), P: JSON.parse(read(`data/zones/${id}/placements.json`)).placements });
  return cache.get(id);
};
const rectOf = d => makeRect((d.poly[0][0] + d.poly[2][0]) / 2, (d.poly[0][1] + d.poly[2][1]) / 2, d.w, d.d, d.angle);
const keyAt = (t, x, z) => t.biomes[t.biomeAt(x, z)].key;

test('surfaces: the set-piece surfaces sit before road, and road is still the last biome entry', () => {
  const { t } = zone('z12_02');
  const keys = t.biomes.map(b => b.key);
  assert.equal(keys[keys.length - 1], 'road');
  for (const k of ['field', 'crop', 'pasture', 'yard', 'graveyard', 'orchard', 'gravel']) assert.ok(keys.includes(k), k);
  assert.deepEqual(SCATTER_KINDS.slice(9).map(k => k.key), ['tree_fruit', 'hedge']);
});

test('the start zone is hand-made: an inn at a crossroads, graveyards, farms with fields, orchards, a mill pond, clearings, stones, folds, copses', () => {
  const { P } = zone('z12_02');
  const kinds = {}; for (const p of P.filter(p => p.kind === 'set_piece')) kinds[p.data.piece] = (kinds[p.data.piece] || 0) + 1;
  for (const [k, n] of Object.entries({ inn: 1, graveyard: 3, farm: 4, orchard: 2, mill_pond: 1, clearing: 2, stone_circle: 1, sheepfold: 2, copse: 2, belt: 2 })) assert.ok((kinds[k] || 0) >= n, `${k}: ${kinds[k] || 0} < ${n}`);
  assert.ok(P.filter(p => p.kind === 'field').length >= 40, 'farmland: at least 40 fields in the start zone');
  // the inn sits by the crossing of its two lanes, and the signpost names where they go
  const inn = P.find(p => p.kind === 'set_piece' && p.data.piece === 'inn');
  assert.ok(Math.hypot(inn.x - inn.data.crossing.x, inn.z - inn.data.crossing.z) < 45, 'inn is at its crossroads');
  const sign = P.find(p => p.kind === 'signpost');
  assert.ok(sign && sign.data.arms.length >= 3 && sign.data.arms.every(a => a.to && Number.isFinite(a.yaw)), 'signpost arms');
  assert.ok(P.filter(p => p.kind === 'road' && p.data.lane).length >= 2, 'two graded lanes');
  // the neighbours are not uniform noise either
  for (const id of START.slice(1)) {
    const n = zone(id).P.filter(p => p.kind === 'set_piece' && !p.data.auto).length;
    assert.ok(n >= 6, `${id}: only ${n} authored pieces`);
  }
});

test('every zone: every planned settlement has a graveyard and a field belt', () => {
  for (const id of ZONES) {
    const { P } = zone(id);
    for (const st of P.filter(p => p.kind === 'settlement' && p.data.planned)) {
      const near = P.filter(p => p.kind === 'set_piece' && p.data.town === st.data.name);
      assert.ok(near.some(p => p.data.piece === 'graveyard'), `${id} ${st.data.name}: no graveyard`);
      assert.ok(near.some(p => p.data.piece === 'belt' && p.data.fields > 0), `${id} ${st.data.name}: no fields`);
    }
  }
});

test('pieces sit on dry walkable ground, off roads, towns and each other, inside the zone', () => {
  const bad = [];
  for (const id of ZONES) {
    const { t, P } = zone(id);
    const towns = P.filter(p => p.kind === 'settlement');
    const rects = [...P.filter(p => p.kind === 'field').map(p => ({ id: p.id, R: rectOf(p.data) })), ...P.filter(p => p.kind === 'set_piece' && p.data.poly && p.data.piece !== 'mill_pond').map(p => ({ id: p.id, R: rectOf(p.data) }))];
    for (const { id: pid, R } of rects) {
      for (const [lx, lz] of [[0, 0], [-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]]) {
        const c = Math.cos(R.a), s = Math.sin(R.a), x = R.cx + lx * R.w * c - lz * R.d * s, z = R.cz + lx * R.w * s + lz * R.d * c;
        if (t.waterAt(x, z).kind !== 'none') { bad.push(`${id} ${pid} wet at ${x.toFixed(0)},${z.toFixed(0)}`); break; }
        if (keyAt(t, x, z) === 'road') { bad.push(`${id} ${pid} on a road at ${x.toFixed(0)},${z.toFixed(0)}`); break; }
        if (towns.some(tw => Math.hypot(tw.x - x, tw.z - z) < tw.data.radius)) { bad.push(`${id} ${pid} inside a town`); break; }
        if (Math.min(x, z, 2048 - x, 2048 - z) < 100) { bad.push(`${id} ${pid} near the zone edge`); break; }
      }
    }
    // fields never overlap each other (centre of one outside every other)
    const fields = P.filter(p => p.kind === 'field').map(p => ({ id: p.id, R: rectOf(p.data) }));
    for (const a of fields) for (const b of fields) if (a !== b && inRect(b.R, a.R.cx, a.R.cz, -0.5)) bad.push(`${id} ${a.id} overlaps ${b.id}`);
  }
  assert.deepEqual(bad.slice(0, 20), []);
});

test('ground: fields are painted and smooth, a graveyard and an inn yard are flat, a field never steeper than 14 degrees', () => {
  const bad = [];
  for (const id of START) {
    const { t, P } = zone(id);
    for (const f of P.filter(p => p.kind === 'field')) {
      const R = rectOf(f.data);
      if (keyAt(t, R.cx, R.cz) !== f.data.crop) bad.push(`${id} ${f.id}: centre painted ${keyAt(t, R.cx, R.cz)} not ${f.data.crop}`);
      if (t.slopeAt(R.cx, R.cz) > 14) bad.push(`${id} ${f.id}: ${t.slopeAt(R.cx, R.cz).toFixed(1)} deg`);
    }
    for (const g of P.filter(p => p.kind === 'set_piece' && (p.data.piece === 'graveyard' || p.data.piece === 'inn'))) {
      const R = rectOf(g.data); let lo = Infinity, hi = -Infinity;
      for (let u = -0.4; u <= 0.41; u += 0.2) for (let v = -0.4; v <= 0.41; v += 0.2) { const c = Math.cos(R.a), s = Math.sin(R.a), x = R.cx + u * R.w * c - v * R.d * s, z = R.cz + u * R.w * s + v * R.d * c; const h = t.groundAt(x, z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi - lo > 0.6) bad.push(`${id} ${g.id}: not flat (${(hi - lo).toFixed(2)} m)`);
      if (g.data.piece === 'graveyard' && keyAt(t, R.cx + Math.cos(R.a) * R.w * 0.3, R.cz + Math.sin(R.a) * R.w * 0.3) === 'grassland') bad.push(`${id} ${g.id}: unpainted`);
    }
  }
  assert.deepEqual(bad, []);
});

test('graveyards: walled with one gate, graves in rows inside the wall and off the path', () => {
  for (const id of START) {
    const { P, nav } = zone(id);
    for (const g of P.filter(p => p.kind === 'set_piece' && p.data.piece === 'graveyard')) {
      const R = rectOf(g.data);
      assert.ok(g.data.graves.length >= 10, `${g.id}: ${g.data.graves.length} graves`);
      for (const [x, z] of g.data.graves) assert.ok(inRect(R, x, z, -1.2), `${g.id}: a grave outside its wall`);
      const wall = P.find(p => p.kind === 'wall' && p.data.setPiece === g.id);
      assert.ok(wall && wall.data.pts.length === 6, `${g.id}: one wall with one gap`);
      // the wall is solid in nav, the gate is not
      const c0 = wall.data.pts[2]; assert.ok(nav.at(c0[0], c0[1]) & NAV.SOLID, `${g.id}: wall corner not solid`);
      assert.ok(!(nav.at(g.data.gate.x, g.data.gate.z) & NAV.SOLID), `${g.id}: gate blocked`);
      // the path from the gate is clear of graves
      const along = g.data.gate && (() => { const [lx, lz] = toLocal(R, g.data.gate.x, g.data.gate.z); return Math.abs(lz) > Math.abs(lx) ? 'x' : 'z'; })();
      for (const [x, z] of g.data.graves) { const [lx, lz] = toLocal(R, x, z); assert.ok((along === 'x' ? Math.abs(lx) : Math.abs(lz)) > 1.6, `${g.id}: a grave on the path`); }
    }
  }
});

test('orchards have fruit trees in rows; hedges line fields; buildings stamp nav; mill ponds hold water', () => {
  for (const id of START) {
    const { t, P, sc, nav } = zone(id);
    for (const o of P.filter(p => p.kind === 'set_piece' && p.data.piece === 'orchard')) {
      const R = rectOf(o.data); let n = 0;
      for (let i = 0; i < sc.count; i++) if (sc.kind[i] === 9 && inRect(R, sc.x[i], sc.z[i])) n++;
      assert.ok(n >= 15, `${id} ${o.id}: ${n} fruit trees`);
    }
    const hedges = P.filter(p => p.kind === 'hedge');
    if (hedges.length) { let n = 0; for (let i = 0; i < sc.count; i++) if (sc.kind[i] === 10) n++; assert.ok(n > hedges.length * 5, `${id}: hedge lines have hedge bushes`); }
    for (const b of P.filter(p => p.kind === 'set_building')) assert.ok(nav.at(b.x, b.z) & NAV.BUILDING, `${id} ${b.id} not in nav`);
    for (const m of P.filter(p => p.kind === 'set_piece' && p.data.piece === 'mill_pond')) {
      const w = t.waterAt(m.data.pond.x, m.data.pond.z);
      assert.equal(w.kind, 'lake', `${id} ${m.id}: no water`); assert.ok(w.depth > 0.8 && w.depth < 2.5, `${id} ${m.id}: depth ${w.depth}`);
      assert.ok(t.waterAt(m.data.wheel.x, m.data.wheel.z).depth < 1.2, `${id} ${m.id}: the wheel is in deep water`);
      const mill = P.find(p => p.kind === 'set_building' && p.data.setPiece === m.id);
      assert.ok(mill && t.waterAt(mill.x, mill.z).kind === 'none', `${id} ${m.id}: the mill is wet`);
    }
  }
});

test('Q10 offices: every town role has its own building, never shared, with role / lit / label', () => {
  const bad = [];
  for (const id of ZONES) {
    const { P } = zone(id);
    for (const st of P.filter(p => p.kind === 'settlement' && p.data.planned)) {
      const blds = P.filter(p => p.kind === 'building' && p.data.town === st.id);
      const offices = blds.filter(b => b.data.office);
      const wants = offices.map(b => b.data.office);
      if (new Set(wants).size !== wants.length) bad.push(`${id} ${st.id}: an office twice`);
      for (const b of offices) {
        if (!(b.data.label && typeof b.data.lit === 'boolean')) bad.push(`${b.id}: label/lit`);
        if (OFFICES.offices[b.data.office].lit !== b.data.lit) bad.push(`${b.id}: lit flag`);
      }
      // a town's core service roles all have a building: smith, merchant, elder, innkeeper, healer, unbinder, broker, stablehand, barber
      const roles = new Set(offices.map(b => b.data.role));
      const need = st.data.kind === 'hamlet' ? ['innkeeper', 'merchant'] : st.data.kind === 'village' ? ['innkeeper', 'merchant', 'smith'] : ['smith', 'merchant', 'elder', 'innkeeper', 'healer', 'unbinder', 'broker', 'stablehand', 'barber'];
      for (const r of need) if (!roles.has(r)) bad.push(`${id} ${st.id} (${st.data.kind}): no office for ${r}`);
    }
  }
  assert.deepEqual(bad, []);
});
