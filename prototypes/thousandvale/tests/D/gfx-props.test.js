// Graphics pass 2026-10-16 (G-PROPS): the pure halves — surface tables + tiers, the painted layers, the clutter models and
// planners, the harbour dressing, the painted-portrait resolver and filter. Run: node --test tests/D/gfx-props.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LAYERS, SURF, LAYER_COUNT, WALL_SURF, ROOF_SURF, surfaceByColour, surfaceForPart, PROP_TIERS, propTier, layerBytes, propsOff } from '../../js/client/surface-plan.js';
import { paintLayers, layerMean } from '../../js/client/surface-paint.js';
import { CLUTTER_MODELS, CLUTTER_IDS, CLUTTER_R, placeModel, buildingTrim, doorClutter, squareClutter } from '../../js/client/prop-clutter.js';
import { harbourParts, harbourExtras, portDressing } from '../../js/client/harbour-view.js';
import { artKey, paintFilter, ROLE_ART } from '../../js/client/ui/painted-portraits.js';
import { describeBuilding, partsFor, MESHES, KIT } from '../../../../proctown/js/buildkit.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const J = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const rng = (s = 1) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const MESH_KINDS = new Set([...MESHES, 'barrel', 'sack']);

test('every proctown wall and roof material has a surface, and every code is a real layer', () => {
  for (const m of Object.keys(KIT.wallMaterials)) assert.ok(SURF[WALL_SURF[m]], `wall material ${m}`);
  for (const m of Object.keys(KIT.roofMaterials)) assert.ok(SURF[ROOF_SURF[m]], `roof material ${m}`);
  assert.equal(LAYER_COUNT, LAYERS.length);
  for (const l of LAYERS) assert.ok(l.size > 0.2 && l.size < 4 && l.rough > 0 && l.rough <= 1, l.id);
});

test('the colour fallback reads a palette the way a person would', () => {
  assert.equal(surfaceByColour('#8a6a44'), SURF.planks, 'brown is wood');
  assert.equal(surfaceByColour('#7d776c'), SURF.ashlar, 'grey is stone');
  assert.equal(surfaceByColour('#2d2622'), SURF.metal, 'near-black is iron');
  assert.equal(surfaceByColour('#d8c060'), SURF.thatch, 'straw yellow is thatch');
  assert.equal(surfaceByColour('#7b2a26'), SURF.cloth, 'a banner red is cloth');
  assert.equal(surfaceByColour('#e8dcc4'), SURF.plaster, 'pale cream is plaster');
  // a building's own parts follow its materials, whatever their paint
  const desc = { wallMaterial: 'brick', roofMaterial: 'clay_tile' };
  assert.equal(surfaceForPart({ tag: 'wall', colour: '#e8dcc4' }, desc), SURF.brick);
  assert.equal(surfaceForPart({ tag: 'roof', colour: '#333333' }, desc), SURF.tile);
  assert.equal(surfaceForPart({ tag: 'door', colour: '#2b4a5a' }, desc), SURF.planks);
  assert.equal(surfaceForPart({ surf: 'rope', colour: '#000' }), SURF.rope, 'an explicit surface wins');
});

test('tiers: low draws exactly as before, a phone (medium) has no relief and a small texture, ?props=0 is the old look', () => {
  assert.equal(PROP_TIERS.low.detail, false);
  assert.equal(PROP_TIERS.medium.bump, false, 'no per-pixel relief on a phone');
  assert.ok(layerBytes(PROP_TIERS.medium) < 1.1e6, `phone texture ${layerBytes(PROP_TIERS.medium)} bytes`);
  assert.ok(layerBytes(PROP_TIERS.high) < 4.5e6);
  assert.equal(propTier('nonsense'), PROP_TIERS.high);
  const off = propTier('high', { off: true });
  assert.ok(!off.detail && !off.trim && off.clutter === 0 && !off.painted);
  assert.equal(propsOff('?a=1&props=0'), true); assert.equal(propsOff('?props=01'), false); assert.equal(propsOff(''), false);
});

test('painted layers tile, keep the palette (mean ~0.97) and are the same every time', () => {
  const px = 64, a = paintLayers(px), b = paintLayers(px);
  assert.deepEqual(a, b, 'deterministic');
  for (let li = 0; li < LAYER_COUNT; li++) {
    const m = layerMean(a, px, li);
    assert.ok(m > 0.9 && m < 1.04, `${LAYERS[li].id} mean ${m.toFixed(3)}`);
    // the seam where the tile wraps (last column -> first) is no harsher than the picture's own column-to-column change
    const base = li * px * px * 4, at = (x, y) => a[base + (y * px + x) * 4 + 3];
    let wrap = 0, inner = 0;
    for (let y = 0; y < px; y++) { wrap += Math.abs(at(px - 1, y) - at(0, y)); for (let x = 1; x < px; x++) inner += Math.abs(at(x, y) - at(x - 1, y)) / (px - 1); }
    assert.ok(wrap <= inner * 3.5 + px * 6, `${LAYERS[li].id} wraps (seam ${wrap.toFixed(0)} vs ${inner.toFixed(0)})`);
  }
});

test('clutter models are finite unit parts on known shapes, and placing one turns it', () => {
  for (const id of CLUTTER_IDS) {
    const parts = CLUTTER_MODELS[id](rng(3));
    assert.ok(parts.length > 0 && CLUTTER_R[id] > 0, id);
    for (const p of parts) {
      assert.ok(MESH_KINDS.has(p.mesh), `${id}: ${p.mesh}`);
      for (const k of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(p[k]), `${id}.${k}`);
      assert.ok(p.w > 0 && p.h > 0 && p.d > 0, id);
      if (p.surf) assert.ok(SURF[p.surf], `${id} surf ${p.surf}`);
    }
  }
  const [p] = placeModel('bench', 10, 2, 20, Math.PI / 2, rng());
  assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.z - 20) < 1e-9 && p.y === 2.42 && Math.abs(p.yaw - Math.PI / 2) < 1e-9);
});

test('building trim: a frame on every window, jambs + a step at the door, a cap on every gable; door clutter never blocks the door', () => {
  let windows = 0, frames = 0, gables = 0, caps = 0, doors = 0;
  for (const culture of Object.keys(KIT.cultures || { human: 1 }).slice(0, 8)) for (let seed = 1; seed <= 12; seed++) {
    const plot = { cx: 0, cz: 0, w: 9, d: 8, angle: 0, facing: 0, want: seed % 3 ? 'house' : 'shop', district: 'residential' };
    const desc = describeBuilding({ plot, culture, townSeed: 7, seed, want: plot.want });
    const parts = partsFor(desc), trim = buildingTrim(parts, desc);
    windows += parts.filter(p => p.tag === 'window').length; frames += trim.filter(p => p.tag === 'frame').length;
    gables += parts.filter(p => p.tag === 'roof' && p.mesh === 'gable').length; caps += trim.filter(p => p.tag === 'ridge').length;
    for (const t of trim) for (const k of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(t[k]), `${culture} ${t.tag}.${k}`);
    const door = desc.door;
    for (const lit of [true, false]) for (const c of doorClutter({ desc, lit }, rng(seed), 1)) {
      doors++;
      const r = CLUTTER_R[c.id];
      assert.ok(Math.abs(c.lx - door.x) >= door.w / 2 + 0.5 + r - 1e-9, `${culture}/${seed}: ${c.id} stands in the doorway`);
    }
  }
  assert.ok(frames >= windows * 4 - 1e-9, `${frames} frame parts for ${windows} windows`);
  assert.equal(caps, gables);
  assert.ok(doors > 20, `${doors} door groups`);
});

test('square clutter stays inside the square, benches face its middle', () => {
  const sq = { x: 100, z: 200, r: 9 };
  const spots = [0, 1.6, 3.3, 4.8].map(a => ({ x: 100 + Math.sin(a) * 8, z: 200 + Math.cos(a) * 8, yaw: a }));
  const out = squareClutter(sq, spots, rng(5), 1);
  assert.ok(out.some(c => c.id === 'bench') && out.some(c => c.id === 'bucket'));
  for (const c of out) assert.ok(Math.hypot(c.x - 100, c.z - 200) < sq.r + 2.5, `${c.id} at ${c.x},${c.z}`);
});

test('harbour: the extra quay clutter keeps off pier roots, the harbourmaster and the dock; the coast test shape is unchanged', () => {
  const pl = J('data/zones/z14_02/placements.json'), hb = (pl.placements || pl).find(p => p.kind === 'harbour');
  const ox = 14 * 2048, oz = 2 * 2048;
  const extra = harbourExtras(hb, { ox, oz, density: 1 });
  assert.ok(extra.length > 30, `${extra.length} parts`);
  for (const q of extra) for (const k of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(q[k]), k);
  const m = hb.data.master;
  assert.ok(extra.every(q => q.d < 10 || q.colour !== '#7a6048'), 'no new plank deck');
  assert.ok(extra.filter(q => q.y < hb.data.quay.h + 0.5 && q.mesh !== 'box').every(q => Math.hypot(q.x - (m.x + ox), q.z - (m.z + oz)) > 1.8), 'nothing at the harbourmaster\'s feet');
  assert.deepEqual(harbourExtras({ id: 'h', data: { town: 'x', deep: [0, 0] } }), []);
  assert.ok(harbourParts(hb, { ox, oz }).parts.every(q => !q.surf || SURF[q.surf]));
});

test('Port Vharl\'s beach is dressed on dry sand, clear of the jetty line', () => {
  const pl = J('data/zones/z13_10/placements.json'), hb = (pl.placements || pl).find(p => p.kind === 'harbour');
  const ox = 13 * 2048, oz = 10 * 2048;
  const out = portDressing(hb, { ox, oz, groundAt: () => 1, density: 1 });
  assert.ok(out.length > 20, `${out.length} parts`);
  const z = hb.z + oz;
  for (const q of out) { for (const k of ['x', 'y', 'z', 'w', 'h', 'd']) assert.ok(Number.isFinite(q[k]), k); }
  assert.ok(out.every(q => Math.abs(q.z - z) > 1.6 || q.x > hb.x + ox + 1), 'nothing on the jetty line');
  assert.deepEqual(portDressing(hb, { ox, oz, groundAt: () => -2 }), [], 'under water: nothing');
});

test('painted portraits: players keep their own look, elves keep their face, monsters / townsfolk get art', () => {
  const ids = new Set(['wolf', 'guard', 'brigand', 'scoria_crawler', 'centipede', 'goblin', 'merchant']);
  assert.equal(artKey({ kind: 'player', look: { race: 'human' } }, null, ids), null);
  assert.equal(artKey({ kind: 'npc', role: 'guard', look: { race: 'human' } }, null, ids), 'guard');
  assert.equal(artKey({ kind: 'npc', role: 'trader', look: {} }, null, ids), 'merchant', 'a trade borrows the nearest picture');
  assert.equal(artKey({ kind: 'npc', role: 'guard', look: { race: 'elf' } }, null, ids), null);
  assert.equal(artKey({ kind: 'monster', creature: { type: 'scoria_crawler' } }, { creature: { type: 'centipede' } }, ids), 'scoria_crawler');
  assert.equal(artKey({ kind: 'monster', creature: { type: 'grey_wolf' } }, { creature: { type: 'dire_wolf' } }, ids), 'wolf');
  assert.equal(artKey({ kind: 'monster', creature: { type: 'road_brigand' }, name: 'Road Brigand' }, { avatar: {} }, ids), 'brigand');
  assert.equal(artKey({ kind: 'monster', creature: { type: 'sootwick_x' }, name: 'Sootwick Cutter' }, { avatar: { body: { race: 'goblin' } } }, ids), 'goblin');
  assert.equal(artKey({ kind: 'monster', creature: { type: 'nope' } }, { creature: { type: 'kraken' } }, ids), null, 'no picture: the live one');
  for (const v of new Set(Object.values(ROLE_ART))) assert.match(v, /^[a-z_]+$/);
});

test('every listed portrait has its picture, small enough for a phone', () => {
  const dir = join(ROOT, 'assets/portraits'), idx = J('assets/portraits/index.json');
  assert.ok(idx.ids.length >= 20, `${idx.ids.length} portraits`);
  for (const id of idx.ids) { const f = join(dir, id + '.webp'); assert.ok(existsSync(f), id); assert.ok(readFileSync(f).length < 40000, `${id} too big`); }
  const webps = readdirSync(dir).filter(f => f.endsWith('.webp')).map(f => f.slice(0, -5)).sort();
  assert.deepEqual(webps, [...idx.ids].sort(), 'index.json lists exactly the pictures there are (run tools/portraits.sh)');
});

test('the painted-look filter keeps alpha and flattens noise', () => {
  const w = 24, h = 24, px = new Uint8ClampedArray(w * h * 4), r = rng(9);
  for (let i = 0; i < w * h; i++) { const v = 100 + (r() - 0.5) * 80; px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 200; }
  const spread = a => { let m = 0, q = 0; for (let i = 0; i < w * h; i++) { m += a[i * 4 + 1]; q += a[i * 4 + 1] ** 2; } m /= w * h; return Math.sqrt(q / (w * h) - m * m); };
  const before = spread(px); paintFilter(px, w, h, 2);
  assert.ok(spread(px) < before * 0.7, `noise ${before.toFixed(1)} -> ${spread(px).toFixed(1)}`);
  for (let i = 0; i < w * h; i++) assert.equal(px[i * 4 + 3], 200);
});

test('the client draws through the kit: no new draw call per prop', () => {
  const tv = readFileSync(join(ROOT, 'js/client/town-view.js'), 'utf8');
  assert.match(tv, /instancedKit\(unitGeometry\(kind\), kitMat, list, tier\)/);
  assert.doesNotMatch(tv, /new THREE\.Mesh\(/, 'town-view builds no single meshes');
});
