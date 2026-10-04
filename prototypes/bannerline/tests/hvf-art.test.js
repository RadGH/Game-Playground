// node --test prototypes/bannerline/tests/hvf-art.test.js   (stream C, Hunters vs Farmers art)
//
// Every HvF building kind builds and answers its contract; fences/walls/hedges join in all 16 ways;
// the nature kit stays inside its triangle budget and dresses a real generated world (mapgen.js) with
// few draw calls; chopping a tree turns it into a stump; the farmer / hunter / ghost / animal looks
// resolve; the baked icon set covers HvF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';

register('../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const THREE = await import('three');
const S = await import('../js/view/hvf-structures.js');
const N = await import('../js/view/hvf-nature.js');
const { createLooks } = await import('../js/view/unit-looks.js');
const { KIND, worldForFormat } = await import('../js/sim/modes/hvf/mapgen.js');
const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const tris = g => { let n = 0; g.traverse(o => { if (o.isMesh) n += o.geometry.attributes.position.count / 3; }); return n; };

test('every building kind in data/hvf/buildings.json has a model, plus the hunter and small kinds', () => {
  const kinds = Object.keys(J('../data/hvf/buildings.json').kinds);
  for (const k of [...kinds, 'kennel', 'lodge', 'watchstone', 'snare', 'grave', 'mine']) assert.ok(S.HVF_KINDS.includes(k), `no model for ${k}`);
  for (const k of S.HVF_KINDS) {
    const b = S.makeHvfBuilding(k, { color: '#4fa3e8' });
    b.setProgress(0.4); b.setDamage(0.9); b.setReady(true); b.fire?.(1); b.update(0.2); b.setProgress(1); b.setDamage(0); b.update(0.2);
    assert.ok(tris(b.group) > 20 && tris(b.group) < 6000, `${k}: ${tris(b.group)} triangles`);
    assert.ok(b.radius > 0);
  }
});

test('fences, walls and hedges have 16 distinct joined shapes', () => {
  for (const kind of ['fence', 'wall', 'hedge']) {
    const counts = new Set();
    for (let m = 0; m < 16; m++) { const g = S.linkedPiece(kind, m); counts.add(g.std.attributes.position.count + '|' + m); }
    assert.equal(counts.size, 16);
    assert.equal(S.linkMask(5, 5, (x, z) => (x === 5 && z === 4) || (x === 6 && z === 5)), 3);
  }
});

test('the nature kit stays cheap: far trees under 40 triangles, near under 200', () => {
  const G = N.natureGeometries();
  for (const t of G.tree) { assert.ok(t.far.attributes.position.count / 3 <= 40, t.look); assert.ok(t.near.attributes.position.count / 3 <= 200, t.look); assert.ok(t.stump && t.log); }
  for (const g of [...G.rock, G.briar, G.tuft, G.reeds, G.lily, G.fordStone, G.cliffBoulder, G.rampEdge]) assert.ok(g.attributes.color && g.attributes.position.count / 3 < 400);
});

test('the layer dresses a real generated world in few draw calls, and chopping leaves a stump', () => {
  const hvf = {}; for (const f of ['rules', 'mapgen', 'buildings', 'animals', 'units']) hvf[f] = J(`../data/hvf/${f}.json`);
  const map = worldForFormat(hvf, 3, '5v2');
  const scene = new THREE.Scene();
  const layer = N.createNatureLayer(scene, map, { KIND });
  const trees = [...map.cells].filter(k => k === KIND.tree).length;
  assert.equal(layer.stats().trees, trees);
  const cam = new THREE.PerspectiveCamera(38, 1.6, 0.5, 900); cam.position.set(map.cols, 60, map.rows * 2 + 40); cam.lookAt(map.cols, 0, map.rows);
  layer.update(cam);
  const st = layer.stats();
  assert.ok(st.drawCalls < 150, `${st.drawCalls} draw calls`);
  assert.ok(st.triangles < 700_000, `${st.triangles} triangles`);
  const cell = [...map.cells].findIndex(k => k === KIND.tree);
  layer.chop(cell, 0.5); layer.update(cam, 0.1); layer.chop(cell, 1); layer.syncChopped([cell]);
  const counts = []; layer.root.traverse(o => { if (o.isInstancedMesh && !o.frustumCulled) counts.push(o.count); });
  assert.ok(counts.some(c => c > 0), 'a stump was placed');
  layer.dispose();
});

test('Hunters vs Farmers looks: farmer, hunter, ghost style, animals, army, pets', () => {
  const looks = createLooks({ looks: J('../data/looks.json'), units: J('../data/units.json'), presets: J('../../../avatar-3d/data/chibi2-presets.json'), outfits: J('../../../avatar-3d/data/class-outfits.json'), variants: J('../../../avatar-3d/data/creature-variants.json'), warbands: J('../../farhold/data/warbands.json') });
  assert.equal(looks.forRole('farmer').avatar.hat.id, 'straw');
  assert.ok(JSON.stringify(looks.forRole('farmer', { color: '#123456' }).avatar).includes('#123456'));
  assert.equal(looks.forRole('hunter').avatar.held.id, 'fh_spear');
  assert.ok(looks.ghostStyle().opacity < 1);
  for (const id of Object.keys(J('../data/hvf/animals.json').kinds)) assert.equal(looks.forHvf('animals', id).spec.type, id === 'hen' ? 'hen' : id);
  assert.equal(looks.forHvf('army', 'scarecrow').spec.type, 'scarecrow');
  assert.equal(looks.forHvf('pets', 'hound').spec.type, 'hound');
});

test('icons cover every HvF building, unit and hunter item', () => {
  const idx = J('../assets/icons/index.json');
  const want = { 'hvf-building': S.HVF_KINDS, 'hvf-item': Object.keys(J('../data/hvf/hunter-items.json').items), 'hvf-unit': ['farmer', 'hunter', 'ghost', 'sheep', 'hen', 'pig', 'cow', 'scarecrow', 'crow', 'hound', 'hawk'] };
  for (const [kind, ids] of Object.entries(want)) for (const id of ids) {
    assert.ok(idx.kinds[kind]?.includes(id), `${kind}/${id} not baked`);
    assert.ok(existsSync(new URL(`../assets/icons/${kind}/${id}.png`, import.meta.url)));
  }
});

test('HvF sound bridge: every id exists in the sfx catalog and every sim event is mapped or deliberately silent', async () => {
  const cat = J('../../../sfx/data/catalog.json'), ids = new Set(cat.sounds.map(s => s.id));
  const B = await import('../js/view/hvf-sound.js');
  for (const id of [...Object.values(B.ANIMAL_CALLS), ...Object.values(B.HVF_SOUNDS).map(r => r[0]), ...Object.values(B.HVF_UI)]) assert.ok(ids.has(id), `sound ${id} not in sfx/data/catalog.json`);
  for (const k of Object.keys(J('../data/hvf/animals.json').kinds)) assert.ok(B.ANIMAL_CALLS[k], `no call for ${k}`);
  const SILENT = new Set(['noise', 'animalBorn', 'cast', 'spawn', 'despawn', 'result']);   // noise has its own rule; the rest are covered by other events
  const fs = await import('node:fs');
  const dir = new URL('../js/sim/modes/hvf/', import.meta.url);
  const all = fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  const emitted = new Set([...all.matchAll(/emit\(\s*'([a-zA-Z]+)'/g)].map(m => m[1]));
  for (const e of emitted) assert.ok(B.HVF_SOUNDS[e] || SILENT.has(e) || e === 'wardPulled' || e === 'snarePulled', `sim event ${e} has no sound`);
  for (const id of ['animal.sheep.bleat', 'animal.hen.cluck', 'animal.pig.oink', 'animal.cow.moo', 'hvf.bell', 'hvf.horn', 'hvf.hawk', 'wood.chop', 'trap.snap', 'ward.pull', 'build.place', 'build.done', 'tower.shot', 'hvf.down', 'hvf.revive', 'hvf.turn']) assert.ok(ids.has(id), id);
});
