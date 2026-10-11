// W9 (P-client): the 3D side and the windows' pure parts, without a browser — every model builds and is sane, ore
// chunks sit ON their boulder, nodes are instanced (and a spent one loses its ore), the work clips exist and move the
// right arm, the stations follow the data file's roles, the Professions list says true things, the sounds exist.
// Run: node --test prototypes/thousandvale/tests/P/client-world.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
globalThis.fetch = async url => { const p = new URL(url); return { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) }; };
const THREE = await import('three');
const M = await import('../../js/client/prof-models.js');
const { createProfView, roleStations, stationSpots, twinkle } = await import('../../js/client/prof-view.js');
const P = await import('../../../../avatar-3d/js/chibi2-motion-prof.js');
const MOTION = await import('../../../../avatar-3d/js/chibi2-motion.js');
const { createRig } = await import('../../../../avatar-3d/js/chibi2-geometry.js');
const { normalizeAvatar } = await import('../../../../avatar-2d/js/render.js');
const { nextUnlock, unlockText, teachersOf, levelFraction } = await import('../../js/client/ui/prof-skills.js');
const { PROF_SOUND_IDS } = await import('../../js/client/prof-sound.js');

const json = f => JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
const numbers = json('data/rules/professions.json'), content = json('data/provinces/professions.json'), FX = json('js/client/gallery/fixtures/professions.json');
const box = g => { g.computeBoundingBox(); return g.boundingBox; };
const finite = g => { const a = g.attributes.position.array; for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return false; return a.length > 0; };

test('every node part, tool and station builds: finite, indexed, coloured, and small enough to instance by the hundred', () => {
  let total = 0;
  for (const [part, make] of Object.entries(M.PART_GEOMETRY)) {
    const g = make(); assert.ok(finite(g), part); assert.ok(g.index && g.attributes.color && g.attributes.normal, part);
    const tris = g.index.count / 3; total += tris;
    assert.ok(tris <= 900, `${part}: ${tris} triangles`);
    assert.ok(box(g).min.y > -0.5, `${part} is not underground`);
  }
  for (const k of M.TOOL_KINDS) { const g = M.toolGeometry(k); assert.ok(finite(g), k); assert.ok(g.index.count / 3 <= 400, k); const b = box(g); assert.ok(b.max.y > 0.15 && b.min.y > -0.35, `${k}: along +y from the grip (${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)})`); }
  for (const k of M.STATION_KINDS) { const s = M.stationGeometry(k), b = box(s.geometry); assert.ok(finite(s.geometry), k); assert.ok(s.geometry.index.count / 3 <= 1500, `${k}: ${s.geometry.index.count / 3}`); assert.ok(b.min.y >= -0.01 && b.max.y > 0.8 && b.max.x - b.min.x < 3.2, `${k}: stands on the ground, about 2 m wide`); }
  assert.ok(total < 9000, `all node parts together: ${total} triangles`);
});

test('a boulder is one unit tall with its foot on the ground (so `size` IS its height: 1.6–2.1 m, a player is 1.8), and no wider than 1.6 x its height', () => {
  for (let v = 0; v < 4; v++) { const b = box(M.boulderGeometry(v)); assert.ok(Math.abs(b.max.y - 1) < 0.12 && Math.abs(b.min.y) < 0.01, `shape ${v}: ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)}`); assert.ok(b.max.x - b.min.x < 1.6 && b.max.z - b.min.z < 1.6, `shape ${v} is ${(b.max.x - b.min.x).toFixed(2)} wide`); }
  for (const k of Object.values(content.nodeKinds)) if (k && k.prof === 'mining') assert.ok(k.look.size >= 1.5 && k.look.size <= 2.2, k.id);
});

test('ore chunks: five different silhouettes by tier; each sits on the rock, above the ground, pointing outward', () => {
  const shapes = [1, 2, 3, 4, 5].map(t => { const b = box(M.oreChunkGeometry(t)); return [b.max.x - b.min.x, b.max.y - b.min.y, M.oreChunkGeometry(t).index.count].map(n => +n.toFixed(2)).join('/'); });
  assert.equal(new Set(shapes).size, 5, shapes.join(' '));
  for (let v = 0; v < 4; v++) for (const n of [5, 7, 9]) {
    const list = M.chunkPlacements(v, n); assert.equal(list.length, n);
    assert.deepEqual(M.chunkPlacements(v, n), list, 'stable');
    const bb = box(M.boulderGeometry(v));
    for (const c of list) {
      assert.ok(c.pos[1] > 0.3 && c.pos[1] < bb.max.y + 0.05, `v${v}: a chunk at height ${c.pos[1].toFixed(2)}`);
      assert.ok(c.pos[0] >= bb.min.x - 0.05 && c.pos[0] <= bb.max.x + 0.05 && c.pos[2] >= bb.min.z - 0.05 && c.pos[2] <= bb.max.z + 0.05, 'on the rock, not beside it');
      assert.ok(c.normal[1] > 0, 'never underneath');
    }
  }
});

test('every node kind of the content file has a model here; every look field is used', () => {
  for (const k of Object.values(content.nodeKinds)) { if (!k || !k.look) continue; assert.ok(M.NODE_PARTS[k.look.model], `${k.id}: model ${k.look.model}`); assert.match(k.look.tint, /^#[0-9a-f]{6}$/i); for (const p of M.NODE_PARTS[k.look.model](0)) assert.ok(M.PART_GEOMETRY[p.part], p.part); }
  assert.ok(M.trunkRadius(7) > 0.2 && M.trunkRadius(11) < 0.6);
});

/** A stand-in scene: just enough of three's Object3D for the view. */
function world() {
  const scene = new THREE.Scene(), ups = [];
  const objects = { upsert: o => ups.push(o), remove: id => ups.push({ id, gone: true }) };
  const actors = { map: new Map(), get(id) { return this.map.get(id) || null; }, working: new Map(), setWorking(id, c) { this.working.set(id, c); } };
  const view = createProfView(scene, { actors, objects, camera: { position: new THREE.Vector3(0, 5, 0) }, groundY: () => 3 });
  return { scene, view, ups, actors };
}
test('nodes are INSTANCED: a hundred nodes are a handful of meshes; a spent boulder has no ore and gains rubble; the prompt follows', async () => {
  const { view, ups } = world(), I = FX.nodeInfo.info;
  for (let i = 0; i < 100; i++) { const kinds = Object.values(content.nodeKinds).filter(k => k && k.look), kd = kinds[i % kinds.length]; view.setNode(100 + i, { x: (i % 10) * 4, z: Math.floor(i / 10) * 4, yaw: i }, { key: 'node:t' + i, name: kd.name, node: { prof: kd.prof, kind: kd.id, tier: kd.tier, look: { ...kd.look, v: i % 4 } } }); }
  view.update(0.016);
  assert.equal(view.stats.nodes, 100);
  assert.ok(view.stats.meshes <= 24, `${view.stats.meshes} instanced meshes for 100 nodes`);
  assert.ok(view.stats.instances > 250);
  assert.equal(view.group.children.filter(c => c.isInstancedMesh).length, view.stats.meshes + 1, 'nothing but instanced meshes (+ the glints)');
  assert.equal(new Set(view.group.children.map(c => c.material.uuid)).size, 3, 'three materials in all: plain, tinted, glint');
  assert.equal(view.stats.glints, 100, 'every unspent node twinkles');
  const r0 = view.stats.rebuilds; view.update(0.016); view.update(0.016);
  assert.equal(view.stats.rebuilds, r0, 'nothing is rebuilt while nothing changes');
  // the recorded copper boulder
  const { view: v2, ups: u2 } = world();
  v2.setNode(I.id, { x: 10, z: 10 }, I); v2.update(0.016);
  const ore = () => v2.group.children.find(c => c.name === 'prof:ore1')?.count || 0, rubble = () => v2.group.children.find(c => c.name === 'prof:rubble')?.count || 0;
  assert.equal(ore(), I.node.look.n); assert.equal(rubble(), 0);
  assert.deepEqual(u2.at(-1), { id: I.id, verb: 'Mine', spent: false, prof: 'mining' });
  v2.setSpent(I.key, Date.now() + 60000); v2.update(0.016);
  assert.equal(ore(), 0, 'bare'); assert.equal(rubble(), 1); assert.equal(u2.at(-1).spent, true); assert.equal(v2.stats.spent, 1);
  v2.setSpent(I.key, 0); v2.update(0.016);
  assert.equal(ore(), I.node.look.n, 'and back when it reopens');
  assert.ok(ups.length >= 100);
});

test('a worker gets the clip and the tool of the trade; an fx end puts both away; a craftsman gets the stations of his role', async () => {
  const { view, actors } = world();
  await new Promise(r => setTimeout(r, 30));          // the data file
  actors.map.set(7, { id: 7, pos: { x: 0, y: 3, z: 0 }, speed: 0, lod: 'near', body: { parts: { handR: new THREE.Group() } } });
  for (const [prof, clip] of Object.entries(P.PROF_CLIP)) {
    view.onEvent({ type: 'fx', kind: prof === 'mining' ? 'gather' : 'craft', id: 7, phase: 'start', prof }); view.update(0.016);
    assert.equal(actors.working.get(7), clip, prof); assert.equal(view.workers.get(7).tool, P.PROF_TOOL[prof]);
    assert.equal(view.workers.get(7).mesh.parent, actors.map.get(7).body.parts.handR, `${prof}: the tool is in the hand`);
    view.onEvent({ type: 'fx', kind: 'gather', id: 7, phase: 'end', prof }); assert.equal(actors.working.get(7), null); assert.equal(view.workers.size, 0);
  }
  view.setWorking(7, { prof: 'mining', anim: 'mine' }); assert.equal(actors.working.get(7), 'profMine'); view.setWorking(7, null);
  // stations
  assert.deepEqual(roleStations(numbers, 'smith'), ['forge', 'temper']); assert.deepEqual(roleStations(numbers, 'apothecary'), ['still']); assert.deepEqual(roleStations(numbers, 'tailor'), ['workbench']); assert.deepEqual(roleStations(numbers, 'prospector'), []);
  for (const [role, row] of Object.entries(numbers.roles)) if (row && row.stations) for (const s of row.stations) assert.ok(s === 'cooking' || roleStations(numbers, role).length, `${role}: a station for ${s}`);
  const spots = stationSpots({ x: 100, z: 50, yaw: 0.7 }, ['forge', 'temper']);
  for (const s of spots) { const d = Math.hypot(s.x - 100, s.z - 50); assert.ok(d > 1.6 && d < numbers.craft.stationM, `a prop ${d.toFixed(1)} m from the craftsman — inside the ${numbers.craft.stationM} m the server calls "at the station"`); }
  assert.ok(Math.hypot(spots[0].x - spots[1].x, spots[0].z - spots[1].z) > 3, 'the two do not stand in each other');
  view.setNpc(9, { x: 100, z: 50, yaw: 0.7 }, 'smith'); assert.equal(view.stats.stations, 2);
  view.setNpc(10, { x: 0, z: 0 }, 'prospector'); assert.equal(view.stats.stations, 2);
  view.clear(); assert.equal(view.npcs.size, 0);
  for (let t = 0; t < 20; t += 0.1) { const k = twinkle(t, 1); assert.ok(k >= 0.15 && k <= 1); }
});

test('the seven work clips are registered, loop, are hands-free, and move the working arm', () => {
  assert.equal(P.CHIBI2_PROF_ANIMS.length, 7);
  const rig = createRig(normalizeAvatar({ body: { race: 'human' } }));
  for (const name of P.CHIBI2_PROF_ANIMS) {
    assert.ok(MOTION.MOTION_KIT.clip(name), name); assert.ok(P.CHIBI2_PROF_SECONDS[name] >= 0.9 && P.CHIBI2_PROF_SECONDS[name] <= 2.4);
    const frames = [0, 0.25, 0.5, 0.75, 0.999].map(u => MOTION.sampleClip(rig, name, u));
    for (const f of frames) for (const [bone, r] of Object.entries(f.pose)) for (const v of r) assert.ok(Number.isFinite(v) && Math.abs(v) < 3.3, `${name} ${bone} ${v}`);
    const arm = frames.map(f => f.pose.armR[0] + f.pose.elbowR[0] + f.pose.armR[1]);
    assert.ok(Math.max(...arm) - Math.min(...arm) > 0.15, `${name}: the right arm works (${arm.map(a => a.toFixed(2))})`);
    const a = MOTION.sampleClip(rig, name, 0.0001), b = MOTION.sampleClip(rig, name, 0.9999);
    assert.ok(Math.abs(a.pose.armR[0] - b.pose.armR[0]) < 0.12, `${name} loops without a jump`);
  }
  for (const prof of Object.keys(P.PROF_CLIP)) { assert.ok(P.CHIBI2_PROF_ANIMS.includes(P.PROF_CLIP[prof])); assert.ok(P.PROF_TOOL_MOUNT[P.PROF_TOOL[prof]], prof); assert.ok(M.TOOL_KINDS.includes(P.PROF_TOOL[prof])); }
  for (const p of numbers.professions) if (!p.own) assert.ok(P.PROF_CLIP[p.id], `${p.id} has a work clip`);
});

test('the Professions list says true things: what the next band opens comes from the content, the bar from the curve', () => {
  const rows = FX.professionsSeasoned.list, by = id => rows.find(r => r.id === id);
  const u = nextUnlock(by('mining'), numbers, content);
  assert.equal(u.at, numbers.tiers.find(t => t.minSkill > by('mining').level).minSkill);
  for (const n of u.names) assert.ok(Object.values(content.nodeKinds).some(k => k && k.name === n && k.tier === u.tier), n);
  assert.match(unlockText(by('outfitting'), numbers, content), /Not learned\. Taught by .*(tailor|bowyer)/);
  assert.equal(teachersOf('mining', numbers), 'a mining trainer or a smith');
  for (const r of rows) { const f = levelFraction(r, numbers); assert.ok(f >= 0 && f <= 1, r.id); const t = unlockText(r, numbers, content); assert.ok(!/undefined|NaN|null/.test(t), `${r.id}: ${t}`); }
  // a fresh level is an empty bar, one point short of the next is nearly full
  const K = numbers.skill, at = l => K.xpBase * (l - 1) + K.xpPerLevel * (l - 1) * l / 2;
  assert.equal(levelFraction({ known: true, id: 'mining', level: 5, next: at(6) - at(5) }, numbers), 0);
  assert.ok(levelFraction({ known: true, id: 'mining', level: 5, next: 1 }, numbers) > 0.9);
});

test('every sound the mini-games ask for is in the Sound Lab catalog', () => {
  const cat = JSON.parse(readFileSync(new URL('../../../../sfx/data/catalog.json', import.meta.url), 'utf8')), ids = new Set(Array.isArray(cat.sounds) ? cat.sounds.map(s => s.id) : Object.keys(cat.sounds));
  for (const id of PROF_SOUND_IDS) assert.ok(ids.has(id), id);
});

test('the crafting window\'s pure parts: a batch is what the materials, the gold and the server\'s cap allow; a legendary power is read from the quote / the result', async () => {
  globalThis.document ||= { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, querySelector: () => ({}), classList: { add() {}, remove() {}, toggle() {} } }), getElementById: () => null, querySelector: () => null, head: { appendChild() {} }, body: { appendChild() {} } };
  const { batchTimes, powerOf, gearChances, recipeRows, craftTabs, temperCandidates } = await import('../../js/client/ui/prof-craft.js');
  const L = FX.craftListLegend, smelt = { id: 'x', kind: 'material', can: true, gold: 0, needs: [{ n: 1, have: 7 }, { n: 2, have: 9 }] };
  assert.equal(batchTimes(smelt, 10), 4); assert.equal(batchTimes(smelt, 3), 3); assert.equal(batchTimes({ ...smelt, gold: 5 }, 10, 12), 2);
  assert.equal(batchTimes({ ...smelt, can: false }, 10), 1); assert.equal(batchTimes({ ...smelt, kind: 'gear' }, 10), 1);
  // round 9: the server's own messages
  assert.equal(powerOf(FX.legendDone), FX.legendDone.now.descriptor); assert.ok(powerOf(FX.legendDone).length > 10);
  assert.equal(powerOf(FX.legendQuote), null, 'the quote does not name the power (it is rolled when the work succeeds)');
  assert.equal(powerOf(FX.temperDone), null, 'an ordinary tempering is not a legendary power');
  assert.ok(FX.legendQuote.needs.some(n => n.kept && n.id === 'sovereign_core') && FX.legendQuote.to === 'legendary');
  assert.deepEqual(FX.legendMiss.kept, ['sovereign_core']); assert.equal(FX.legendQuoteRefused.can, false); assert.match(FX.legendQuoteRefused.why, /cannot hold a legendary power/);
  assert.ok(L.recipes.find(r => r.id === 'temper_promote').legendary.skill >= 1);
  assert.deepEqual(craftTabs(L), ['smithing', 'tempering']);
  assert.ok(recipeRows(L.recipes, 'smithing').length > 3 && recipeRows(L.recipes, 'smithing').every(r => r.kind !== 'temper'));
  assert.ok(temperCandidates(FX.bagLegend, 'temper_promote').some(i => i.uid === FX.legendUid));
  for (const c of gearChances(numbers, 12)) assert.ok(c.magic >= 0 && c.magic + c.rare <= 1.0001, JSON.stringify(c));
});
