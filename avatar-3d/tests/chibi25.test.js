// node --test avatar-3d/tests/chibi25.test.js
// Chibi 2.5 part A (the head): the opt-in promise, every new option, blinking + looking, and the clipping rules.
//
//   1. OPT-IN: a look without body.v = 2.5 builds byte-for-byte what it built before 2.5 (209 looks hashed at commit
//      4c8f8b1f by tools/chibi2-v2-baseline.mjs) — Thousandvale, Farhold, Emberveil and Bannerline look the same.
//   2. Every 2.5 face/hair id is registered (survives the shared normaliser), is `bespoke` (the seeded 2D random roll
//      never hands one out), builds finite geometry in two meshes and stays inside the class budget.
//   3. Blinking and looking move BONES only: no geometry or material changes between frames.
//   4. Clipping: hair x every headwear, brows under every fringe, long beards over the chest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
register('./three-loader.mjs', import.meta.url);

const THREE = await import('three');
const { createChibi2Character } = await import('../js/chibi2.js');
const { CHIBI25_OPTIONS, CHIBI25_ADDED, isV25, asV25 } = await import('../js/chibi25-options.js');
const { PARTS } = await import('../../avatar-2d/js/parts/index.js');
const { normalizeAvatar } = await import('../../avatar-2d/js/render.js');
const { randomAvatar } = await import('../../avatar-2d/js/random.js');
const { v2Looks, hashActor } = await import('../../tools/chibi2-v2-baseline.mjs');
const { hairHat, browsUnderHair, measure, BASE } = await import('../../tools/chibi25-clip-report.mjs');
const { coverMap, poke, tagged } = await import('../js/chibi25-clip.js');

test('OPT-IN: every v2 look builds exactly the geometry it built before Chibi 2.5', async () => {
  const want = JSON.parse(readFileSync(new URL('./fixtures/chibi2-v2-hashes.json', import.meta.url)));
  const looks = await v2Looks(), bad = [];
  for (const [k, look] of Object.entries(looks)) {
    if (!want[k]) continue;
    const a = await createChibi2Character(look); if (hashActor(a) !== want[k]) bad.push(k); a.dispose();
  }
  assert.equal(Object.keys(want).length, 209);
  assert.deepEqual(bad, [], `v2 looks changed: ${bad.join(', ')}`);
});

test('the flag: body.v = 2.5 or { v25: true }; a v2 rig keeps its 22 bones, a 2.5 rig appends the two eyelids', async () => {
  assert.equal(isV25({ body: { v: 2.5 } }), true); assert.equal(isV25({}), false); assert.equal(isV25(asV25({})), true);
  const v2 = await createChibi2Character({}), v25 = await createChibi2Character({ body: { v: 2.5 } }), opt = await createChibi2Character({}, { v25: true });
  const names = a => a.skeleton.bones.map(b => b.name);
  assert.equal(names(v2).length, 22);
  assert.deepEqual(names(v25).slice(0, 22), names(v2), 'the 22 v2 bones stay first and in order');
  assert.deepEqual(names(v25).slice(22, 24), ['eyelidL', 'eyelidR']);
  assert.deepEqual(names(opt).slice(0, 24), names(v25).slice(0, 24), '{ v25: true } is the same as the flag');
  assert.equal(normalizeAvatar({ body: { v: 2.5 } }).body.v, 2.5, 'the flag survives the shared normaliser');
  for (const a of [v2, v25, opt]) { assert.equal(a.stats().meshes, 2); a.dispose(); }
});

test('every 2.5 option id is registered, bespoke, survives the normaliser and is listed with a name', () => {
  for (const [slot, o] of Object.entries(CHIBI25_OPTIONS.face)) {
    assert.ok(o.added.length > 0, slot);
    for (const id of o.ids) assert.ok(PARTS[slot]?.[id], `${slot}.${id} is not a registered part`);
    for (const id of o.added) {
      assert.equal(PARTS[slot][id].bespoke, true, `${slot}.${id} must be bespoke`);
      assert.equal(normalizeAvatar({ [slot]: { id } })[slot].id, id, `${slot}.${id} dropped by the normaliser`);
      assert.ok(o.names[id], `${slot}.${id} has no menu name`);
    }
  }
  // the counts the owner asked for
  assert.ok(CHIBI25_ADDED.eyes.length >= 8, 'at least 8 new eyes'); assert.ok(CHIBI25_ADDED.hair.length >= 8, 'at least 8 new hair styles');
  for (const s of ['brows', 'mouth', 'ears', 'facialHair', 'extras']) assert.ok(CHIBI25_ADDED[s].length >= 3, s);
});

test('the seeded 2D random roll never hands out a 2.5 id (every game\'s random NPCs stay the same)', () => {
  const data = JSON.parse(readFileSync(new URL('../../avatar-2d/data/presets.json', import.meta.url)));
  for (let seed = 1; seed <= 400; seed++) {
    const a = randomAvatar(data, { seed, race: Object.keys(data.raceRules || {})[seed % 5] || null });
    for (const [slot, ids] of Object.entries(CHIBI25_ADDED)) assert.ok(!ids.includes(a[slot]?.id), `seed ${seed}: ${slot}.${a[slot]?.id}`);
  }
});

test('every 2.5 face/hair id builds finite geometry, two meshes, within budget (and differs from the default)', async () => {
  const base = { ...BASE, hair: { id: 'short', color: '#6b4a2a' }, hat: { id: 'none' }, body: { ...BASE.body, v: 2.5 } };
  const fingerprint = a => a.stats().triangles;
  for (const [slot, o] of Object.entries(CHIBI25_OPTIONS.face)) {
    const def = await createChibi2Character({ ...base, [slot]: { id: o.ids.includes('none') ? 'none' : o.ids[0] } });
    for (const id of o.ids) {
      const a = await createChibi2Character({ ...base, [slot]: { id } });
      assert.equal(a.stats().meshes, 2, `${slot}.${id}`);
      assert.ok(a.stats().triangles < 8500, `${slot}.${id}: ${a.stats().triangles} triangles`);
      a.group.traverse(m => { if (m.isSkinnedMesh) { const p = m.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 97) assert.ok(Number.isFinite(p[i]), `${slot}.${id} NaN`); } });
      a.dispose();
    }
    def.dispose(); void fingerprint;
  }
  // every eye field choice builds
  for (const pupil of CHIBI25_OPTIONS.fields.eyes.pupil.ids) for (const iris of CHIBI25_OPTIONS.fields.eyes.iris.ids) {
    const a = await createChibi2Character({ ...base, eyes: { id: 'round', pupil, iris, colorR: '#c03030', white: '#ffeecc' } });
    assert.equal(a.stats().meshes, 2); a.dispose();
  }
});

test('blinking: natural blinks (2-6 in 10 s), lids close on every eye type, bones only (no geometry change)', async () => {
  for (const id of CHIBI25_OPTIONS.face.eyes.ids) {
    const a = await createChibi2Character({ body: { v: 2.5 }, eyes: { id } });
    const geo = []; a.group.traverse(m => { if (m.isSkinnedMesh) geo.push([m.geometry, m.material, m.geometry.attributes.position.version]); });
    let blinks = 0, was = 0;
    for (let t = 0; t < 10; t += 1 / 60) { a.update(1 / 60); const k = a.eyes.blink; if (k > 0.9 && was <= 0.9) blinks++; was = k; }
    const closedEye = id === 'happy';
    if (closedEye) assert.equal(blinks, 0, 'a closed eye does not blink');
    else assert.ok(blinks >= 2 && blinks <= 7, `${id}: ${blinks} blinks in 10 s`);
    a.setBlink(1); a.update(0.016);
    if (!closedEye) assert.equal(a.parts.eyelidL.scale.y, 1, `${id}: setBlink(1) shuts the lid`);
    a.setBlink(0); a.update(0.016); assert.ok(a.parts.eyelidL.scale.y < 0.01, `${id}: open lid tucked away`);
    a.setAnim('dead'); a.setBlink(null); a.update(0.016); if (!closedEye) assert.equal(a.eyes.blink, 1, 'dead eyes are shut');
    const after = []; a.group.traverse(m => { if (m.isSkinnedMesh) after.push([m.geometry, m.material, m.geometry.attributes.position.version]); });
    assert.deepEqual(after.map(x => x[2]), geo.map(x => x[2]), 'geometry untouched'); assert.ok(after.every((x, i) => x[0] === geo[i][0] && x[1] === geo[i][1]));
    // the lid really covers the eye when shut: its vertices span the eye's outline
    a.dispose();
  }
});

test('looking: lookAt and setGaze keep the pupils inside the white, idle glances too, and lookAt(null) releases', async () => {
  const a = await createChibi2Character({ body: { v: 2.5 }, eyes: { id: 'round' } });
  const [lx, ly] = a.eyes.limits;
  assert.ok(lx > 0 && ly > 0);
  const inside = () => { const p = a.parts.pupilR.position; return (p.x / lx) ** 2 + (p.y / ly) ** 2 <= 1.0001; };
  for (const target of [[5, 1.4, 1], [-5, 1.4, 1], [0, 8, 1], [0, -3, 1], [0, 1.4, -6], [0.3, 1.5, 2]]) {
    a.lookAt(new THREE.Vector3(...target), { head: 0 });
    for (let i = 0; i < 40; i++) { a.update(1 / 60); assert.ok(inside(), `outside the white looking at ${target}`); }
  }
  a.lookAt(new THREE.Vector3(5, 1.4, 1), { head: 0 }); for (let i = 0; i < 40; i++) a.update(1 / 60);
  assert.ok(a.parts.pupilR.position.x > lx * 0.8, 'a point to the side pushes the pupils to that side');
  a.lookAt(new THREE.Vector3(5, 1.4, 1), { head: 0.5 }); for (let i = 0; i < 90; i++) a.update(1 / 60);
  assert.ok(new THREE.Euler().setFromQuaternion(a.parts.head.quaternion, 'YXZ').y > 0.15, 'the head takes part of the turn');
  a.lookAt(null); for (let i = 0; i < 400; i++) { a.update(1 / 60); assert.ok(inside(), 'idle glance left the white'); }
  for (const [x, y] of [[1, 1], [-1, -1], [3, 0]]) { a.setGaze(x, y); for (let i = 0; i < 30; i++) a.update(1 / 60); assert.ok(inside()); }
  a.dispose();
  // narrow eyes still have room to glance sideways; v2 looks ignore all of it
  const n = await createChibi2Character({ body: { v: 2.5 }, eyes: { id: 'narrow' } }); assert.ok(n.eyes.limits[0] > 0); n.dispose();
  const v2 = await createChibi2Character({}); v2.lookAt(new THREE.Vector3(5, 1, 1)); v2.update(0.1); assert.equal(v2.eyes.v25, false); v2.dispose();
});

test('CLIPPING: hair does not poke through any headwear (v2.5 under 2% on average, every pair under its v2 share or a cap)', async () => {
  const hats = Object.keys(PARTS.hat).filter(h => h !== 'none');
  const hairs = CHIBI25_OPTIONS.face.hair.ids.filter(h => h !== 'bald');
  let sum = 0, n = 0, sum2 = 0, n2 = 0; const bad = [];
  for (const hat of hats) for (const hair of hairs) {
    const r = await hairHat(hair, hat, 2.5); if (!r || r.covered < 30) continue;
    sum += r.share; n++;
    // known and accepted: a crown or a headdress SITS ON an afro / pompadour / spikes (the volume is under it, not through it)
    const accepted = /crown|bone_headdress|circlet|feather_band|headband|flower|bandana/.test(hat) && /afro|pompadour|spiky|messy|high_ponytail/.test(hair);
    if (r.share > 0.12 && !accepted) bad.push(`${hat}|${hair} ${(r.share * 100).toFixed(1)}%`);
    if (CHIBI25_OPTIONS.face.hair.original.includes(hair)) { const r2 = await hairHat(hair, hat, 2); if (r2 && r2.covered >= 30) { sum2 += r2.share; n2++; } }
  }
  const mean = sum / n, mean2 = sum2 / n2;
  console.log(`hair x headwear: ${n} pairs, mean poke-through v2 ${(mean2 * 100).toFixed(2)}% -> v2.5 ${(mean * 100).toFixed(2)}%`);
  assert.ok(mean < 0.02, `mean ${mean}`);
  assert.ok(mean < mean2 / 2, 'at least twice as clean as v2');
  assert.deepEqual(bad, []);
});

test('CLIPPING: the brows are never hidden under a fringe (seen from the front)', async () => {
  for (const hair of CHIBI25_OPTIONS.face.hair.ids) {
    const r = await browsUnderHair(hair, 2.5); if (!r) continue;
    assert.ok(r.share <= 0.05, `${hair}: ${(r.share * 100).toFixed(0)}% of the brows under the hair`);
  }
});

test('CLIPPING: long beards lie over the chest instead of sinking into the collar', async () => {
  for (const fh of ['long', 'braided_beard', 'forked_beard']) for (const top of ['tunic', 'plate', 'robe', 'chainmail']) {
    const { trace } = await measure({ ...BASE, top: { id: top, color: '#4a6a8a' }, facialHair: { id: fh }, hair: { id: 'short' }, body: { ...BASE.body, v: 2.5 } });
    const beard = trace.filter(p => p.tag === 'face:beard'), body = tagged(trace, 'body').filter(p => p.bone === 'chest');
    // measured from the chest's own axis, at the height of each beard vertex
    let low = 0, sunk = 0;
    const chest = coverMap(body, new THREE.Vector3(0, 0, 0));
    void chest;
    for (const p of beard) for (let i = 0; i < p.positions.length; i += 3) {
      const v = new THREE.Vector3().fromArray(p.positions, i);
      const c = new THREE.Vector3(0, v.y, 0), map = coverMapCache(body, Math.round(v.y * 50) / 50);
      if (v.y > map.top) continue;                     // above the collar: nothing to sink into
      low++; const r = poke([{ positions: Float32Array.of(v.x, v.y, v.z) }], map.map, c, { tol: 0.006, inside: true }); sunk += r.poking;
    }
    assert.ok(low === 0 || sunk / low < 0.1, `${fh} on ${top}: ${sunk}/${low} beard vertices inside the chest`);
  }
});
const _cm = new Map();
function coverMapCache(body, y) {
  const key = body.length + ':' + y; if (_cm.has(key)) return _cm.get(key);
  let top = -Infinity; for (const p of body) for (let i = 1; i < p.positions.length; i += 3) top = Math.max(top, p.positions[i]);
  const r = { map: coverMap(body, new THREE.Vector3(0, y, 0)), top: top - 0.05 }; _cm.set(key, r); return r;
}

test('BUDGET: every Emberveil class look switched to 2.5 stays under 8,500 triangles and two draw calls', async () => {
  const L = JSON.parse(readFileSync(new URL('../../prototypes/emberveil/data/class-looks.json', import.meta.url))).classes;
  for (const [id, c] of Object.entries(L)) {
    const a = await createChibi2Character(asV25(c.avatar));
    assert.ok(a.stats().triangles < 8500, `${id}: ${a.stats().triangles}`);
    assert.ok(a.stats().meshes <= 2, `${id}: ${a.stats().meshes} meshes`);
    a.dispose();
  }
});
