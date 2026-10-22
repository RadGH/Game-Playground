// node --test avatar-3d/tests/gear-catalog.test.js
// The gear catalog and the round-5 (g5_) models — Thousandvale play-test 5, T23 + the model half of T15.
//
//   * the catalog and the code agree, both ways: a model built in code and missing from the catalog fails, and so does
//     a catalog row nothing builds
//   * every g5_ id has a builder and survives the shared normaliser (Farhold normalises every look it builds)
//   * there is a NEW model for every armour slot x archetype, every weapon type in the item data, every shield and
//     focus kind, every drawn accessory slot, and every magic attack form as a wand, a staff and a focus
//   * every existing look still builds the geometry it built before this round (vertex counts recorded from the
//     commit before: tests/fixtures/gear5-baseline.json) — the opt-in promise to Farhold / Emberveil / Bannerline
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';
import { G5_TABLES, G5_HELD, G5_OFFHAND, isG5, ATTACK_FORMS } from '../js/chibi2-gear5-ids.js';
import { holdFor, HELD_WEAPON_IDS } from '../js/chibi2-weapon-ids.js';
import { loadGearCatalog, createGearCatalog, applyGear, lookFor, ARCHETYPES, WEAPON_TYPES, FOCUS_KINDS, SHIELD_KINDS, weaponTypeOf } from '../js/gear-catalog.js';
import { dressAs } from '../js/class-outfits.js';

register('./three-loader.mjs', import.meta.url);
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = p => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const CATALOG = read('../data/gear-catalog.json');
const cat = createGearCatalog(CATALOG);
const ITEMS = read('../../prototypes/emberveil/data/items.json');
const WEAR_SLOTS = ['held', 'offhand', 'hat', 'top', 'bottom', 'shoes', 'cape', 'decor', 'accessory'];

const vertices = async avatar => {
  const { createChibi2Character } = await import('../js/chibi2.js');
  const a = await createChibi2Character(avatar); let n = 0;
  for (const m of a.group.children[0].children) n += m.geometry?.attributes?.position?.count || 0;
  a.dispose(); return n;
};

test('the catalog file is what the code generates (a model in code and not in the catalog, or the reverse, fails here)', () => {
  // the generator derives every row from the code: the id tables, the normaliser's vocabulary, and a real build of each part
  const out = execFileSync(process.execPath, ['--import', './avatar-3d/tests/three-register.mjs', 'tools/build-gear-catalog.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /current/);
});

test('every g5_ id in the tables has a builder, and every builder is in the tables', async () => {
  const g5 = await import('../js/chibi2-gear5.js');
  for (const t of G5_TABLES) {
    const builders = g5[t.export];
    assert.ok(builders, `${t.export} is not exported by chibi2-gear5.js`);
    assert.deepEqual(Object.keys(builders).sort(), Object.keys(t.table).sort(), `${t.export} and its id table disagree`);
    for (const id of Object.keys(t.table)) assert.equal(typeof builders[id], 'function', id);
  }
});

test('every catalog row is a real model: its file exists and names it, and putting it on a body changes the body', async () => {
  const seen = new Set();
  for (const r of cat.rows) {
    const key = r.id + '|' + r.slot + '|' + (r.field || '');
    assert.ok(!seen.has(key), `duplicate row ${key}`); seen.add(key);
    assert.ok(existsSync(ROOT + r.file), `${r.id}: ${r.file} does not exist`);
    const src = readFileSync(ROOT + r.file, 'utf8');
    if (r.new) assert.ok(src.includes(r.id), `${r.id}: not named in ${r.file}`);   // (old builders have catch-all branches: the generator's build check covers them)
    assert.ok(r.name && typeof r.name === 'string', `${r.id}: no name`);
    assert.ok(['weapon', 'armour', 'offhand', 'accessory', 'hat'].includes(r.kind), `${r.id}: kind ${r.kind}`);
    assert.ok(WEAR_SLOTS.includes(r.slot), `${r.id}: slot ${r.slot}`);
    if (r.kind === 'weapon') assert.ok(r.hands === 1 || r.hands === 2, `${r.id}: hands`);
    if (r.new) { assert.ok(isG5(r.id)); assert.equal(r.base, r.id); assert.equal(r.round, 5); assert.ok(r.minLevel >= 1, `${r.id}: minLevel`); }
  }
  // the new rows, one by one: named alone on a plain body they must add geometry (the old ones are checked by the generator)
  const plain = { top: { id: 'tshirt' }, bottom: { id: 'pants' }, shoes: { id: 'sneakers' }, hair: { id: 'bald' } };   // bald: a helm hides hair, which would hide what it adds
  const base = await vertices(plain);
  for (const r of cat.find({ isNew: true })) {
    const n = await vertices(applyGear(plain, [r]));
    assert.ok(n > base + 20, `${r.id} adds nothing to a body (${n} vs ${base})`);
  }
});

test('every wearable id the normaliser lets through is either in the catalog or builds nothing in 3D', async () => {
  // (the reverse of the generator's filter, stated on its own: nothing that draws may be missing)
  for (const slot of WEAR_SLOTS) for (const id of Object.keys(PARTS[slot])) {
    if (id === 'none' || cat.byId(id, slot)) continue;
    if (slot === 'offhand' && PARTS.held[id]) { assert.ok(cat.byId(id, 'held')?.offhandToo, `${id}: an off-hand weapon whose held row does not say offhandToo`); continue; }
    if (['top', 'bottom', 'shoes'].includes(slot)) continue;      // an unstyled garment id falls back to the default garment
    const none = await vertices({ [slot]: { id: 'none' } });
    assert.equal(await vertices({ [slot]: { id } }), none, `${slot}:${id} builds a model but has no catalog row`);
  }
});

test('every g5_ part survives the shared normaliser, in its slot or its field', () => {
  for (const r of cat.find({ isNew: true })) {
    const worn = normalizeAvatar(applyGear({}, [r]));
    const got = r.field ? worn[r.slot][r.field]?.id : worn[r.slot].id;
    assert.equal(got, r.id, `${r.id} was dropped by the normaliser`);
    if (!r.field) assert.ok(PARTS[r.slot][r.id].pieces, `${r.id}: no 2D stand-in`);
    if (r.offhandToo) assert.equal(normalizeAvatar({ offhand: { id: r.id } }).offhand.id, r.id, `${r.id} cannot be dual wielded`);
  }
  // gloves ride the top and rings the accessory, and survive both being re-dressed through applyGear
  const a = applyGear({}, ['g5_plate_gauntlets', 'g5_signet', 'g5_plate_cuirass', 'g5_torc'], {}, cat);
  assert.equal(a.top.id, 'g5_plate_cuirass'); assert.equal(a.top.gloves.id, 'g5_plate_gauntlets');
  assert.equal(a.accessory.id, 'g5_torc'); assert.equal(a.accessory.ring.id, 'g5_signet');
  assert.equal(lookFor(cat.byId('g5_signet'), { field: 'ring2' }).part.ring2.id, 'g5_signet');
  assert.equal(lookFor(cat.byId('g5_kris'), { hand: 'off' }).slot, 'offhand');
});

test('a NEW model for every armour slot x archetype', () => {
  for (const gameSlot of ['head', 'chest', 'legs', 'hands', 'feet']) for (const archetype of ARCHETYPES) {
    assert.equal(cat.find({ isNew: true, kind: 'armour', gameSlot, archetype }).length, 1, `${archetype} ${gameSlot}`);
  }
  // and every armour base in the item data resolves to one
  for (const [key, b] of Object.entries(ITEMS.armorBases)) {
    if (!['head', 'chest', 'legs', 'hands', 'feet'].includes(b.slot)) continue;
    assert.ok(cat.forItem({ ...b, baseKey: key }), `armour base ${key} (${b.slot}/${b.tier}) has no new model`);
  }
});

test('a NEW model for every weapon type the item data has, held the way its kin are', () => {
  for (const type of WEAPON_TYPES) assert.ok(cat.find({ isNew: true, kind: 'weapon', type }).length >= 1, `no new ${type}`);
  for (const [key, b] of Object.entries(ITEMS.weaponBases)) {
    const type = weaponTypeOf({ ...b, baseKey: key });
    assert.ok(type, `weapon base ${key}: subtype ${b.subtype} has no catalog type`);
    const row = cat.forItem({ ...b, baseKey: key });
    assert.ok(row?.new, `weapon base ${key} (${type}) has no new model`);
    assert.equal(row.hands === 2, !!b.twoHanded, `${key}: ${row.id} is ${row.hands}-handed, the base is ${b.twoHanded ? 2 : 1}`);
  }
  // the clips carry each g5_ weapon as its family: the hold table knows every id
  for (const [id, r] of Object.entries(G5_HELD)) {
    const h = holdFor({ held: { id }, offhand: { id: 'none' } });
    if (r.bow) { assert.equal(h.left, 'bow', `${id} is a bow: it belongs in the left hand`); continue; }
    assert.equal(h.right, r.hold, `${id}: hold`);
    if (r.hands === 1 && !['caster', 'none', 'crossbow', 'staff'].includes(r.hold)) assert.ok(HELD_WEAPON_IDS.includes(id), `${id} should work in the off hand`);
    // the grip rule: the head is out past the fingers and the butt behind the fist — staves alone carry the topper up
    if (r.headY != null) { if (r.hold === 'staff') assert.ok(r.headY > 0.5 && r.buttY < 0); else assert.ok(r.headY < -0.25 && r.buttY > 0, `${id}: head ${r.headY}, butt ${r.buttY}`); }
  }
  for (const [id, r] of Object.entries(G5_OFFHAND)) assert.equal(holdFor({ held: { id: 'none' }, offhand: { id } }).left, r.left, `${id}: left hold`);
});

test('the grip rule, measured: each g5_ weapon passes through the fist and has its business end where the table says', async () => {
  const THREE = await import('three');
  const { createRig, SkinBuilder } = await import('../js/chibi2-geometry.js');
  const { G5_WEAPON_BUILDERS } = await import('../js/chibi2-gear5-weapons.js');
  for (const [id, r] of Object.entries(G5_HELD)) {
    if (r.headY == null) continue;                              // bows, crossbows, orbs and tomes are not gripped along y
    const rig = createRig({}); rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3(); let nearFist = false;
    const c = { trim: '#d9b477', add(g, bone, colour, o = {}) {
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...(o.position || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(o.rotation || [0, 0, 0]))), new THREE.Vector3(...(o.scale || [1, 1, 1]))));
      assert.equal(bone, 'handR', `${id}: built on ${bone}`);
      // a piece is "in the fist" when it spans y = 0 and is a thin thing centred on the grip line (x 0, z 0.055)
      g.computeBoundingBox(); const b = g.boundingBox; box.union(b);
      if (b.min.y < -0.01 && b.max.y > 0.01 && Math.abs((b.min.x + b.max.x) / 2) < 0.02 && Math.abs((b.min.z + b.max.z) / 2 - 0.055) < (r.hold === 'wand' ? 0.1 : 0.03) && b.max.x - b.min.x < 0.09) nearFist = true;
    } };
    void SkinBuilder;
    G5_WEAPON_BUILDERS[id](c, '#c8ccd6', 3, {}, {});
    assert.ok(nearFist, `${id}: nothing passes through the fist (y 0, z 0.055)`);
    const far = r.hold === 'staff' ? box.max.y : box.min.y, near = r.hold === 'staff' ? box.min.y : box.max.y;
    assert.ok(Math.abs(far - r.headY) < 0.12, `${id}: the head ends at y ${far.toFixed(2)}, the table says ${r.headY}`);
    assert.ok(Math.abs(near - r.buttY) < 0.08, `${id}: the butt ends at y ${near.toFixed(2)}, the table says ${r.buttY}`);
  }
});

test('shields, foci and the drawn accessory slots each have a NEW model', () => {
  for (const k of SHIELD_KINDS) assert.equal(cat.find({ isNew: true, type: 'shield', tag: 'shield:' + k }).length, 1, `shield ${k}`);
  for (const k of FOCUS_KINDS) assert.equal(cat.find({ isNew: true, type: 'focus', tag: 'focus:' + k }).length, 1, `focus ${k}`);
  for (const gameSlot of ['cape', 'necklace', 'ring', 'light', 'belt']) assert.ok(cat.find({ isNew: true, gameSlot }).length >= 1, `no new ${gameSlot}`);
  for (const type of ['quiver', 'torch', 'lantern']) assert.ok(cat.find({ isNew: true, type }).length >= 1, `no new ${type}`);
  // every off-hand base in the item data, and Farhold's foci, resolve to a new model
  for (const [key, b] of Object.entries(ITEMS.armorBases)) if (b.slot === 'offhand') assert.ok(cat.forItem({ ...b, baseKey: key })?.new, `off-hand base ${key}`);
  for (const key of ['grimoire', 'psalter', 'seer_orb', 'reliquary', 'effigy', 'totem']) assert.ok(cat.forItem({ slot: 'offhand', baseKey: key, isFocus: true })?.new, `focus ${key}`);
});

test('every magic attack form has a wand, a staff and a focus whose row says so (T15)', () => {
  for (const form of ATTACK_FORMS) {
    for (const type of ['wand', 'staff', 'focus']) assert.equal(cat.find({ isNew: true, type, form }).length, 1, `${form} ${type}`);
    assert.equal(cat.forItem({ type: 'weapon', subtype: 'wand', form }).form, form);
    assert.equal(cat.forItem({ type: 'weapon', subtype: 'staff', twoHanded: true, castForm: form }).form, form);
    assert.equal(cat.forItem({ slot: 'offhand', isFocus: true, form }).form, form);
  }
});

test('no player-facing name uses a banned word (CLAUDE.md convention 9)', () => {
  const banned = /\b(ember|veil|muster|heroic|mythic|keystone|horde|alliance|hearthstone|delve|renown|fury|rage|maul|rake|blink|starfall|soulbound|chi)\b/i;
  for (const r of cat.find({ isNew: true })) assert.ok(!banned.test(r.name), `${r.id}: "${r.name}"`);
  assert.equal(new Set(cat.find({ isNew: true }).map(r => r.name)).size, cat.find({ isNew: true }).length, 'two new models share a name');
});

test('every existing look builds the geometry it built before round 5', async () => {
  const BASE = read('./fixtures/gear5-baseline.json');
  const T1 = read('../data/class-outfits.json').classes, T2 = read('../data/class-outfits-t2.json').classes;
  const LOOKS = read('../../prototypes/emberveil/data/class-looks.json').classes;
  let n = 0;
  for (const [key, want] of Object.entries(BASE)) {
    const [kind, id] = key.split(':');
    const avatar = kind === 'class' ? dressAs(LOOKS[id]?.avatar || {}, T1[id]) : kind === 'class2' ? dressAs(LOOKS[id]?.avatar || {}, T2[id]) : { [kind]: { id } };
    assert.equal(await vertices(avatar), want, `${key} changed`); n++;
  }
  assert.ok(n > 250);
  // and the dispatch adds nothing at all for a look that names no g5_ id
  const { buildGear5 } = await import('../js/chibi2-gear5.js');
  let calls = 0; const spy = { add() { calls++; }, head() { calls++; } };
  buildGear5(normalizeAvatar(dressAs(LOOKS.warrior?.avatar || {}, T2.warrior)), spy);
  assert.equal(calls, 0);
});

test('every new row is mapped to an in-game item (the Armory shows them), and the plain cloak / belt / backpack bases land on a model', () => {
  for (const r of cat.find({ isNew: true })) {
    // Thousandvale removed light ITEMS (owner feedback 8, W22): the lantern and torch models stay in the catalog, unworn there
    if (r.gameSlot === 'light') { assert.ok(!r.items.some(i => i.game === 'thousandvale'), `${r.id}: a light is no longer an item`); continue; }
    const it = r.items.find(i => i.game === 'thousandvale');
    assert.ok(it, `${r.id}: no Thousandvale item is made from this row`);
    // a backpack model is worn by the game's own pack bases (sling_satchel …), not by an item named after the model
    if (r.type === 'pack') { assert.equal(it.slot, 'back', `${r.id}: a pack is worn on the back`); continue; }
    assert.equal(it.base, r.base); assert.ok(it.template, `${r.id}: no template base`); assert.ok(it.slot, `${r.id}: no slot`);
  }
  const mapped = new Set(cat.rows.flatMap(r => r.items.map(i => i.base)));
  for (const base of ['travel_cloak', 'leather_belt', 'sling_satchel', 'trail_rucksack', 'expedition_pack']) assert.ok(mapped.has(base), `${base} draws no catalog model`);
});

test('loadGearCatalog reads the same file', async () => {
  const c = await loadGearCatalog();
  assert.equal(c.rows.length, CATALOG.rows.length);
  assert.equal(c.byId('g5_wand_bell').form, 'cone');
});

test('every glove model covers the fingers, so it shows under a robe\'s sleeve (cloth gloves were bare-fingered wraps, 2026-10-22)', async () => {
  const THREE = await import('three');
  const { createChibi2Character } = await import('../js/chibi2.js');
  const { G5_GLOVE_BUILDERS } = await import('../js/chibi2-gear5-armour.js');
  // vertices on the hand bones, in the hand's own space, out at the fingers (below the knuckles, 9 cm+ down the hand)
  const fingers = async look => {
    const a = await createChibi2Character(look); let n = 0; const v = new THREE.Vector3();
    a.group.traverse(o => {
      if (!o.isSkinnedMesh) return;
      const bones = o.skeleton.bones, g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
      for (let i = 0; i < si.count; i++) {
        const b = si.getX(i); if (sw.getX(i) < 0.5 || !/^hand[LR]$/.test(bones[b].name)) continue;
        v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).applyMatrix4(o.skeleton.boneInverses[b]);
        if (v.y < -0.09) n++;
      }
    });
    a.dispose(); return n;
  };
  const robe = { body: { race: 'human', skin: '#c87850', v: 2.5 }, top: { id: 'robe', color: '#3a3a7a' }, bottom: { id: 'pants', color: '#2a2a40' } };
  const bare = await fingers(robe);
  for (const id of Object.keys(G5_GLOVE_BUILDERS)) {
    const n = await fingers({ ...robe, top: { ...robe.top, gloves: { id, color: '#9aa0b0', color2: '#4a4a6a' } } });
    assert.ok(n > bare + 10, `${id}: the fingers are bare (${n - bare} glove vertices past the knuckles)`);
  }
});
