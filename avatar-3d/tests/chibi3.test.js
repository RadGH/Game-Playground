// Chibi 3 unit tests (node --test). The pure modules run directly; the ones that build Three.js
// geometry go through the loader hook that maps 'three' to the vendored copy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);
await import('./fake-dom.mjs');

const sdf = await import('../js/chibi3/sdf.js');
const { meshField } = await import('../js/chibi3/mesher.js');
const { decimate } = await import('../js/chibi3/decimate.js');
const { layoutRig } = await import('../js/chibi3/rig.js');
const { jointWeights, CHAIN } = await import('../js/chibi3/skin.js');
const { CHIBI3_RACES, C3_DIALS, dial } = await import('../js/chibi3/races.js');
const { visemeTrack, MORPHS, EXPRESSIONS } = await import('../js/chibi3/face.js');
const outfit = await import('../js/chibi3/outfit.js');
const { hairStyle, beardStyle } = await import('../js/chibi3/hair.js');
const { hatFamily } = await import('../js/chibi3/headwear.js');
import fs from 'node:fs';

const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);
const boundaryEdges = m => { const c = new Map(), k = (a, b) => a < b ? a + ',' + b : b + ',' + a; for (let t = 0; t < m.indices.length; t += 3) for (let i = 0; i < 3; i++) { const key = k(m.indices[t + i], m.indices[t + (i + 1) % 3]); c.set(key, (c.get(key) || 0) + 1); } return [...c.values()].filter(v => v !== 2).length; };

test('primitives give exact distances where they should', () => {
  const s = sdf.sphere([0, 0, 0], 1);
  close(s.d(2, 0, 0), 1, 1e-9, 'sphere outside'); close(s.d(0, 0, 0), -1, 1e-9, 'sphere centre');
  const c = sdf.cone([0, 0, 0], [0, 1, 0], 0.2, 0.2);
  close(c.d(0.5, 0.5, 0), 0.3, 1e-6, 'capsule side'); close(c.d(0, 1.5, 0), 0.3, 1e-6, 'capsule cap');
  const b = sdf.roundBox([0, 0, 0], [1, 1, 1], 0);
  close(b.d(2, 0, 0), 1, 1e-9, 'box face'); close(b.d(0, 0, 0), -1, 1e-9, 'box inside');
  const e = sdf.ellipsoid([0, 0, 0], [1, 2, 3]);
  close(e.d(1, 0, 0), 0, 1e-6, 'ellipsoid surface x'); close(e.d(0, 2, 0), 0, 1e-6, 'ellipsoid surface y');
  assert.ok(e.d(0, 0, 0) < 0 && e.d(5, 0, 0) > 0, 'ellipsoid sign');
});

test('smooth union never adds material beyond the blend radius', () => {
  for (const [a, b] of [[0.3, 0.1], [0.05, 0.06], [-0.1, 0.2]]) {
    assert.ok(sdf.smin(a, b, 0.05) <= Math.min(a, b) + 1e-12, 'smin is below min');
    assert.ok(sdf.smin(a, b, 0.05) >= Math.min(a, b) - 0.05 / 4 - 1e-12, 'by at most k/4');
  }
});

test('indexed evaluation matches the plain loop at the surface, and the wide one off it', () => {
  const sh = new sdf.Shape([]);
  for (let i = 0; i < 20; i++) sh.add(Object.assign(sdf.sphere([i * 0.05, Math.sin(i) * 0.1, 0], 0.04), { k: 0.02 }));
  const plain = new sdf.Shape(sh.prims.slice()); plain.unindexed = true;
  sh.buildIndex();
  for (let i = 0; i < 300; i++) {
    const p = [Math.random() * 1.0 - 0.05, Math.random() * 0.4 - 0.2, Math.random() * 0.2 - 0.1];
    const exact = plain.evalWide(...p);
    if (Math.abs(exact) < 0.002) close(sh.eval(...p), exact, 1e-9, 'tight index near the surface');
    if (exact < 0.05) close(sh.evalWide(...p), exact, 1e-9, 'wide index within reach');
  }
});

test('surface nets: a closed sphere, vertices on the surface, normals outward', () => {
  const s = new sdf.Shape([Object.assign(sdf.sphere([0, 0, 0], 0.1), { k: 0 })]);
  const m = meshField(s, [-0.13, -0.13, -0.13, 0.13, 0.13, 0.13], 0.01);
  assert.equal(boundaryEdges(m), 0, 'closed');
  for (let v = 0; v < m.positions.length; v += 3) {
    const r = Math.hypot(m.positions[v], m.positions[v + 1], m.positions[v + 2]);
    close(r, 0.1, 0.0005, 'on the surface');
    const dotp = (m.positions[v] * m.normals[v] + m.positions[v + 1] * m.normals[v + 1] + m.positions[v + 2] * m.normals[v + 2]) / r;
    assert.ok(dotp > 0.98, 'normal points out');
  }
});

test('the simplifier thins a mesh, stays closed and stays on the surface', () => {
  const s = new sdf.Shape([Object.assign(sdf.ellipsoid([0, 0, 0], [0.1, 0.2, 0.08]), { k: 0 })]);
  const m = meshField(s, [-0.13, -0.23, -0.11, 0.13, 0.23, 0.11], 0.006);
  const d = decimate(m, { maxError: 0.0006, field: s });
  assert.ok(d.indices.length < m.indices.length * 0.6, `fewer triangles (${m.indices.length / 3} -> ${d.indices.length / 3})`);
  assert.equal(boundaryEdges(d), 0, 'still closed');
  for (let v = 0; v < d.positions.length; v += 3) assert.ok(Math.abs(s.eval(d.positions[v], d.positions[v + 1], d.positions[v + 2])) < 0.0015, 'near the surface');
  const e = decimate(m, { maxError: 0.002, endpointsOnly: true });
  const orig = new Set(); for (let v = 0; v < m.positions.length; v += 3) orig.add(m.positions[v] + ',' + m.positions[v + 1] + ',' + m.positions[v + 2]);
  for (let v = 0; v < e.positions.length; v += 3) assert.ok(orig.has(e.positions[v] + ',' + e.positions[v + 1] + ',' + e.positions[v + 2]), 'endpoints only keeps original vertices');
});

test('skeleton: 66 bones, every parent exists, left is +x, races change stature', () => {
  const R = layoutRig({ body: { race: 'human' } });
  assert.equal(R.bones.length, 66);
  assert.equal(new Set(R.bones.map(b => b.name)).size, 66, 'unique names');
  for (const b of R.bones) if (b.parent) assert.ok(R.byName[b.parent], b.name + ' parent');
  assert.ok(R.byName.handL.pos[0] > 0 && R.byName.handR.pos[0] < 0, 'L is +x');
  const h = id => layoutRig({ body: { race: id } }).height;
  assert.ok(h('orc') > h('human') && h('human') > h('dwarf') && h('dwarf') > h('goblin'), 'orc > human > dwarf > goblin');
  for (const id of Object.keys(CHIBI3_RACES)) { const r = layoutRig({ body: { race: id } }); assert.ok(r.height > 0.8 && r.height < 2.8, id + ' height'); }
});

test('skin weights: normalised, at most four, and continuous across a joint', () => {
  const R = layoutRig({ body: {} });
  const el = R.byName.foreArmL.pos;
  const a = new Map(jointWeights(R, el[0], el[1], el[2], 'upperArmL')), b = new Map(jointWeights(R, el[0], el[1], el[2], 'foreArmL'));
  for (const k of new Set([...a.keys(), ...b.keys()])) close(a.get(k) || 0, b.get(k) || 0, 1e-9, 'same weights at the elbow from either side');
  for (let i = 0; i < 200; i++) {
    const owner = R.bones[Math.floor(Math.random() * R.bones.length)].name;
    const w = jointWeights(R, Math.random() - 0.5, Math.random() * 2, Math.random() - 0.5, owner);
    assert.ok(w.length <= 4); close(w.reduce((s, [, x]) => s + x, 0), 1, 1e-9, 'sum');
  }
  for (const [p, c] of Object.entries(CHAIN)) assert.ok(R.byName[p] && R.byName[c], `chain ${p} -> ${c}`);
});

test('dials: 0.5 is the race value; every dial is in the menu table', () => {
  assert.equal(dial({ body: { c3: { jaw: 0.5 } } }, 'jaw', 1.3, 0.2), 1.3);
  assert.equal(dial({ body: {} }, 'jaw', 1.3, 0.2), 1.3);
  close(dial({ body: { c3: { jaw: 1 } } }, 'jaw', 1, 0.2), 1.2, 1e-9, 'top of the range');
  for (const d of Object.values(C3_DIALS)) assert.ok(['Body', 'Face'].includes(d.group));
});

test('every Chibi 2 class outfit id lands on a Chibi 3 family', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../data/class-outfits.json', import.meta.url)));
  for (const [cls, o] of Object.entries(data.classes)) {
    assert.ok(outfit.topFamily(o.top?.id), cls + ' top'); assert.ok(outfit.bottomFamily(o.bottom?.id), cls + ' bottom');
    assert.ok(outfit.shoeFamily(o.shoes?.id), cls + ' shoes'); assert.ok(hatFamily(o.hat?.id), cls + ' hat');
    assert.ok(outfit.decorFamily(o.decor?.id), cls + ' decor'); assert.ok(outfit.capeFamily(o.cape?.id), cls + ' cape');
  }
  assert.equal(outfit.topFamily('plate'), 'plate'); assert.equal(outfit.topFamily('trim_robe'), 'robe'); assert.equal(outfit.topFamily('surcoat'), 'surcoat');
  assert.equal(hairStyle('ponytail'), 'ponytail'); assert.equal(hairStyle('afro'), 'wavy'); assert.equal(beardStyle('long_beard'), 'long'); assert.equal(hatFamily('plate_helm'), 'bascinet');
});

test('lip shapes from text, and every expression names real morphs', () => {
  const track = visemeTrack('Hold the line!');
  assert.ok(track.length > 5 && track[0].t === 0 && track.at(-1).v === 'rest');
  for (let i = 1; i < track.length; i++) assert.ok(track[i].t >= track[i - 1].t, 'time only moves forward');
  for (const [name, e] of Object.entries(EXPRESSIONS)) for (const k of Object.keys(e)) assert.ok(MORPHS.includes(k) || k === 'jaw' || k === 'lids', `${name}.${k}`);
});

test('a real build: bare human, then a bake round trip', async () => {
  const { createChibi3Character, bakeLook } = await import('../js/chibi3/index.js');
  const { readBaked } = await import('../js/chibi3/bake.js');
  const look = { body: { race: 'human', skin: '#e2b08a' }, hair: { id: 'short' }, top: { id: 'tunic', color: '#3a6a3a' }, bottom: { id: 'pants' }, shoes: { id: 'boots' } };
  const c = await createChibi3Character(look, { lod: 0, cache: false });
  const s = c.stats();
  assert.equal(s.bones, 66); assert.ok(s.triangles > 15000 && s.triangles < 90000, 'triangles ' + s.triangles); assert.equal(s.morphs, MORPHS.length);
  const g = c.group.getObjectByName('chibi3-lod0').geometry;
  const pos = g.attributes.position.array, w = g.attributes.skinWeight.array;
  for (let i = 0; i < pos.length; i++) assert.ok(Number.isFinite(pos[i]), 'finite positions');
  for (let v = 0; v < w.length; v += 4) close(w[v] + w[v + 1] + w[v + 2] + w[v + 3], 1, 1e-4, 'weights sum to 1');
  const nrm = g.attributes.normal.array; for (let v = 0; v < nrm.length; v += 3) assert.ok(Math.hypot(nrm[v], nrm[v + 1], nrm[v + 2]) > 0.5, 'no zero normals');
  const [b0] = bakeLook(look);
  const back = readBaked(b0);
  assert.equal(back.geometry.index.count, g.index.count, 'same triangles after a bake');
  close(back.geometry.attributes.position.array[30], pos[30], 1e-6, 'positions survive');
  c.dispose();
});
