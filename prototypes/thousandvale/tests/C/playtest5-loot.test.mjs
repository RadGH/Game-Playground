// node --test prototypes/thousandvale/tests/C/playtest5-loot.test.mjs
//
// Owner play-test 5, the item side of the rules:
//   T5   starter kits reach a character (applyKit / starterGear) and the casters in them attack the way they say
//   T9   crates: a random item of the promised kind, at least the promised rarity, for the opener's class and level
//   T10  champions and rares roll from level 2, at the measured rates
//   T17  the conversion affix: uncommon, physical weapons only, the damage really is that element
//   T20  a gift box opens into a rare-or-better item
//   T23  stream F's gear catalog becomes item bases (and a missing / broken file is not an error)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createRules, rulesEngine, kitsFor, validKit, starterGear, makeCrate, crateLabel, isCrate } from '../../js/rules/index.js';
import { engineFor, loadData } from './setup.mjs';
import { createEngine } from '../../js/rules/engine.js';
import { installTvGear, canConvert, convertWeapon, catalogRows, baseFromRow } from '../../js/rules/tv-gear.js';
import { openCrate, normalizeCrate, crateBases, fitsCrate, CRATE_LADDER } from '../../js/rules/crates.js';
import { makeRng } from '../../js/rules/rng.js';
import { elementOf } from '../../js/rules/farhold.js';

const engine = rulesEngine();
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;
let n = 0;
function world() {
  const events = [];
  const id = `pt5l-${++n}`;
  const room = createRoom({ id, terrain, seed: 8, camps: [], createRules, hooks: { log: () => {} } });
  const ev0 = room.host.event;
  room.host.event = ev => { events.push(ev); return ev0(ev); };
  let pid = 20;
  const add = (cls, level = 10) => room.addPlayer({ id: ++pid, name: `${cls}${pid}`, cls, level, xp: 0, gold: 0, room: id, x: SX, z: SZ }, null);
  return { room, events, add };
}
const CLASSES = engine.classes.map(c => c.id);
const rank = it => CRATE_LADDER.indexOf(it.rarity);

// ============================================================================ T9 / T20

test('T9: a crate is a bag item that says what it holds; every vocabulary (E\'s, A\'s) reads the same', () => {
  const c = makeCrate({ slot: 'feet', min: 'uncommon' }, { level: 2 });
  assert.equal(c.kind, 'crate'); assert.equal(c.type, 'crate'); assert.equal(c.id, 'crate');
  assert.ok(isCrate(c));
  assert.deepEqual(c.crate, { slot: 'feet', min: 'uncommon', minRarity: 'magic', forClass: true, level: 2, maxLevel: 5 });
  assert.equal(c.name, 'Boot Crate');
  assert.equal(c.rarity, 'magic', 'drawn as the least it can hold');
  assert.match(c.desc, /boots your class can use, uncommon or better.*never above level 5/);
  assert.equal(crateLabel({ slot: 'weapon', min: 'rare' }), 'Open it for a weapon your class can use, rare or better. It is rolled at your level when you open it.');
  // A's words
  assert.deepEqual(normalizeCrate(engine.crates, { type: 'armour', minRarity: 'rare' }), { slot: 'armor', min: 'rare', minRarity: 'rare', forClass: true });
  assert.equal(normalizeCrate(engine.crates, { slot: 'nonsense' }).slot, 'any');
});

test('T9: every slot x every rarity opens into that kind of item, at least that rare, wearable at the opener\'s level', () => {
  const w = world();
  const me = w.add('warrior', 6);
  const floors = { common: 0, uncommon: 1, rare: 2, epic: 2, legendary: 3 };
  let opened = 0;
  for (const slot of ['weapon', 'offhand', 'head', 'chest', 'legs', 'hands', 'feet', 'ring', 'neck', 'armor', 'jewellery', 'any']) {
    for (const [min, floor] of Object.entries(floors)) {
      for (let k = 0; k < 6; k++) {
        const crate = w.room.rules.makeCrate(me, { slot, min });
        assert.ok(crate.uid, 'a crate has a uid');
        const got = w.room.rules.openCrate(me, crate);
        assert.equal(got.length, 1, `${slot}/${min}: one item`);
        const it = got[0];
        opened++;
        assert.ok(it.uid && it.name && it.type, `${slot}/${min}: a real item`);
        assert.ok(rank(it) >= floor, `${slot}/${min}: ${it.name} is ${it.rarity}`);
        assert.ok(fitsCrate(engine.crates, engine, slot, it), `${slot}/${min}: ${it.name} (${it.baseKey}) is the promised kind`);
        assert.equal(w.room.rules.canEquip(me, it).ok, true, `${slot}/${min}: ${it.name} can be worn at level 6: ${w.room.rules.canEquip(me, it).text}`);
        assert.equal(it.from, 'crate');
      }
    }
  }
  assert.equal(opened, 12 * 5 * 6);
});

test('T9: a weapon / off-hand / armour crate holds something the opener\'s CLASS uses — all 30 classes', () => {
  const heavier = ['cloth', 'light', 'medium', 'heavy'];
  for (const cls of CLASSES) {
    const def = engine.classById(cls);
    const fams = new Set(crateBases(engine.crates, engine, 'weapon', def, 5).map(b => b.family));
    assert.ok(fams.size >= 1, `${cls}: weapon families ${[...fams]}`);
    const rng = makeRng(cls.length * 97 + 5);
    for (let k = 0; k < 12; k++) {
      const [wpn] = openCrate(engine, makeCrate({ slot: 'weapon', min: 'uncommon' }), { cls, level: 5, rng });
      assert.ok(wpn && wpn.type === 'weapon', `${cls}: a weapon`);
      assert.ok(fams.has(crateBases(engine.crates, engine, 'weapon', def, 5).find(b => b.key === (wpn.catalogBase || wpn.baseKey))?.family), `${cls}: ${wpn.name} (${wpn.baseKey}) is one of its weapon kinds`);
      const [arm] = openCrate(engine, makeCrate({ slot: 'chest', min: 'common' }), { cls, level: 5, rng });
      const tier = engine.items.armorBases[arm.baseKey].tier;
      assert.ok(heavier.indexOf(tier) <= heavier.indexOf(def.armorTier), `${cls} (${def.armorTier}): chest ${arm.name} is ${tier}`);
    }
    const [off] = openCrate(engine, makeCrate({ slot: 'offhand', min: 'common' }), { cls, level: 5, rng });
    assert.ok(off, `${cls}: an off-hand item`);
    if (def.primaryAttr === 'INT' && !def.shield) assert.ok(!off.isShield, `${cls}: a caster gets a focus, not a shield (${off.name})`);
  }
});

test('T9: a crate rolls at the opener\'s level but never above the level it was earned at + 3', () => {
  const w = world();
  const low = w.add('ranger', 2);
  const crate = w.room.rules.makeCrate(low, { slot: 'weapon', min: 'uncommon' });
  assert.equal(crate.crate.maxLevel, 5);
  const high = w.add('ranger', 40);
  for (let k = 0; k < 10; k++) {
    const [it] = w.room.rules.openCrate(high, crate);
    assert.ok((it.dropLevel || 1) <= 5, `${it.name} was rolled at level ${it.dropLevel}`);
  }
});

test('T20: a gift box opens into a rare-or-better item, for anybody, from one call', () => {
  const w = world();
  for (const cls of ['mage', 'knight', 'ranger']) {
    const me = w.add(cls, 8);
    const gift = w.room.rules.makeCrate(me, { gift: true, minRarity: 'rare' });
    assert.equal(gift.kind, 'gift'); assert.equal(gift.id, 'gift'); assert.equal(gift.name, 'Gift Box');
    assert.equal(gift.gift.minRarity, 'rare');
    assert.match(gift.desc, /^A gift\./);
    for (let k = 0; k < 8; k++) {
      const [it] = w.room.rules.openCrate(me, gift);
      assert.ok(it && rank(it) >= 2, `${cls}: ${it?.name} is ${it?.rarity}`);
      assert.equal(it.from, 'gift');
      assert.equal(w.room.rules.canEquip(me, it).ok, true, `${cls}: can wear ${it.name}`);
    }
    // A's own shape (it builds `{ gift: { minRarity } }` itself) opens the same way
    const [it2] = w.room.rules.openCrate(me, { id: 'gift', kind: 'gift', gift: { minRarity: 'rare' } });
    assert.ok(rank(it2) >= 2);
  }
});

// ============================================================================ T17

test('T17: the conversion affix — only on physical magic/rare weapons, about 1 in 18 of them, and never on a caster', () => {
  const rng = makeRng(1717);
  let phys = 0, conv = 0, casters = 0;
  const seen = new Set();
  for (let i = 0; i < 9000; i++) {
    const it = engine.rpg.rollDrop({ level: 12, rng, chance: 1 });
    if (!it || it.type !== 'weapon') continue;
    if (it.weaponCategory === 'magic' || it.castElement) { casters++; assert.ok(!it.converted, `${it.name}: a caster never converts`); continue; }
    if (it.isUnique || it.setId || it.rarity === 'normal' || it.rarity === 'legendary') { assert.ok(!it.converted, `${it.name} (${it.rarity})`); continue; }
    const road = (engine.items.weaponBases[it.baseKey]?.intrinsic || []).some(f => /^cond_brand/.test(f.stat));
    if (road) { assert.ok(!it.converted, `${it.name}: already branded`); continue; }
    phys++;
    if (it.converted) {
      conv++;
      seen.add(it.brand);
      const a = it.affixes.find(x => x.tvConvert);
      assert.ok(a && /^tv_convert_/.test(a.id) && a.value >= 0.04 && a.value <= 0.1, JSON.stringify(a));
      assert.equal(elementOf(it), it.brand, 'the weapon\'s element IS the conversion');
      assert.ok(it.name.startsWith(a.name + ' '), `${it.name} says so`);
      assert.match(it.convertText, new RegExp(`Every hit deals ${it.brand} damage instead of physical`));
      assert.equal(it.affixes.filter(x => /^cond_brand/.test(x.stat)).length, 1, 'one conversion');
    }
  }
  assert.ok(phys > 800 && casters > 200, `${phys} physical magic/rare weapons, ${casters} casters`);
  const rate = conv / phys;
  assert.ok(rate > 0.035 && rate < 0.08, `conversion rate ${(rate * 100).toFixed(1)}% (${conv}/${phys}) — uncommon`);
  assert.ok(seen.size >= 6, `elements seen: ${[...seen]}`);
});

test('T17: a converted sword really deals its element (and leaves that element\'s status), in a real room', () => {
  const w = world();
  const me = w.add('warrior', 20);
  const sword = engine.makeItem({ base: 'longsword', rarity: 'rare', level: 20, rng: makeRng(4) });
  assert.ok(canConvert(engine.tvGear, engine.items, sword));
  convertWeapon(engine.tvGear, sword, 'ice', 0.08);
  assert.ok(!canConvert(engine.tvGear, engine.items, sword), 'never twice');
  assert.ok(w.room.rules.equip(me, sword, 'weapon').ok);
  const m = w.room.spawn({ kind: 'monster', type: 'wolf', level: 20, x: SX, z: SZ + 2, data: { noRank: true } });
  m.r.unit.attackEvery = 99; m.r.unit.speed = 0; m.r.unit.maxHp = m.r.unit.hp = 1e6;
  const from = w.events.length;
  assert.ok(w.room.intent(me, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } }).ok);
  for (let i = 0; i < 20; i++) w.room.step();
  const hit = w.events.slice(from).find(e => e.type === 'hit' && e.d === m.id && e.kind === 'dmg');
  assert.equal(hit?.el, 'ice', 'the hit is ice');
  assert.ok(m.r.unit.statuses.chill, 'and it chills');
  const wand = engine.makeItem({ base: 'wand', rarity: 'rare', level: 20, rng: makeRng(5) });
  assert.equal(canConvert(engine.tvGear, engine.items, wand), false, 'a wand cannot take it');
  const qs = engine.makeItem({ base: 'scepter', rarity: 'rare', level: 20, rng: makeRng(6) });
  assert.equal(canConvert(engine.tvGear, engine.items, qs), false, 'nor a sceptre');
});

// ============================================================================ T23

test('T23: a catalog row becomes an item base with its template\'s numbers; a missing, empty or broken catalog injects nothing and throws nothing', async () => {
  const data = await loadData();
  for (const bad of [null, undefined, {}, { rows: 'nope' }, { rows: [null, 5, { id: 'x' }, { id: 'g5_bad', base: 'g5_bad', new: true, kind: 'weapon', type: 'no_such_type' }] }, 'garbage', []]) {
    const d = await loadData();
    const rep = installTvGear(d.items, d.tvGear, bad);
    assert.deepEqual(rep.catalog, [], JSON.stringify(bad)?.slice(0, 40));
    assert.deepEqual(rep.added, ['cloth_gloves', 'cloth_shoes', 'travel_cloak', 'leather_belt', 'sling_satchel', 'trail_rucksack', 'expedition_pack', 'woodsman_axe', 'militia_sabre'], 'Thousandvale\'s own bases are added regardless');
  }
  // a whole engine boots without the file
  const e0 = createEngine({ ...(await loadData()), gearCatalog: null }, { seed: 3 });
  assert.ok(e0.items.armorBases.cloth_gloves && e0.gearReport.catalog.length === 0);
  // a hand-made catalog
  const rows = [
    { id: 'g5_t_sword', base: 'g5_t_sword', new: true, kind: 'weapon', type: 'sword', name: 'Test Falchion', minLevel: 4 },
    { id: 'g5_t_wand', base: 'g5_t_wand', new: true, kind: 'weapon', type: 'wand', name: 'Test Lens', form: 'beam', element: 'frost', minLevel: 2 },
    { id: 'g5_t_staff', base: 'g5_t_staff', new: true, kind: 'weapon', type: 'staff', name: 'Test Aegis', form: 'shield' },
    { id: 'g5_t_bo', base: 'g5_t_bo', new: true, kind: 'weapon', type: 'quarterstaff', name: 'Test Bo' },
    { id: 'g5_t_gloves', base: 'g5_t_gloves', new: true, kind: 'armour', gameSlot: 'hands', archetype: 'cloth', name: 'Test Mitts' },
    { id: 'g5_t_plate', base: 'g5_t_plate', new: true, kind: 'armour', gameSlot: 'chest', archetype: 'plate', name: 'Test Cuirass', minLevel: 9 },
    { id: 'g5_t_focus', base: 'g5_t_focus', new: true, kind: 'offhand', type: 'focus', form: 'shield', name: 'Test Sigil' },
    { id: 'g5_t_kite', base: 'g5_t_kite', new: true, kind: 'offhand', type: 'shield', tags: ['shield:kite'], name: 'Test Kite' },
    { id: 'g5_t_ring', base: 'g5_t_ring', new: true, kind: 'accessory', type: 'ring', name: 'Test Band' },
    { id: 'g5_t_cloak', base: 'g5_t_cloak', new: true, kind: 'accessory', type: 'cloak', name: 'Test Cloak' },
    { id: 'old_sword', kind: 'weapon', type: 'sword', name: 'Old', items: [{ game: 'thousandvale', base: 'longsword' }] },
  ];
  assert.equal(catalogRows({ rows }).length, 10, 'old rows are not injected');
  const e = createEngine({ ...data, gearCatalog: { rows } }, { seed: 4 });
  assert.deepEqual(e.gearReport.skipped, [], 'nothing skipped: a cloak has its own slot now (the slots addendum)');
  assert.equal(e.gearReport.catalog.length, 10);
  assert.equal(e.makeItem({ base: 'g5_t_cloak', rarity: 'magic', level: 12, rng: makeRng(1) }).slot, 'back');
  const mk = (base, level = 12) => e.makeItem({ base, rarity: 'magic', level, rng: makeRng(base.length) });
  const sword = mk('g5_t_sword');
  assert.equal(sword.g5, 'g5_t_sword'); assert.deepEqual(sword.look, { g5: 'g5_t_sword' });
  assert.equal(sword.baseKey, 'sword', 'it answers as its template to every rule'); assert.equal(sword.catalogBase, 'g5_t_sword');
  assert.match(sword.name, /Test Falchion/);
  assert.deepEqual(e.items.weaponBases.g5_t_sword.dmg, e.items.weaponBases.sword.dmg, 'the numbers are the plain sword\'s');
  const wand = mk('g5_t_wand');
  assert.equal(wand.castStyle, 'beam'); assert.equal(wand.castForm, 'beam'); assert.equal(wand.castElement, 'ice', 'frost -> ice');
  assert.match(wand.attackText, /instant beam of ice 18 m long/);
  const staff = mk('g5_t_staff');
  assert.equal(staff.castStyle, 'ward'); assert.match(staff.attackText, /Aegis Ring/);
  const bo = mk('g5_t_bo');
  assert.equal(bo.baseKey, 'quarterstaff'); assert.equal(bo.weaponCategory, 'light'); assert.equal(bo.castElement, null, 'a bo is a pole, not a spell');
  assert.equal(mk('g5_t_gloves').baseKey, 'cloth_gloves');
  assert.equal(mk('g5_t_focus').focusRider, 'ward');
  assert.equal(mk('g5_t_kite').baseKey, 'kite_shield');
  // they drop, from their first level on
  assert.ok(e.lootPool.families.sword.bases.some(b => b.key === 'g5_t_sword' && b.from === 4));
  assert.ok(e.lootPool.families.chest.bases.some(b => b.key === 'g5_t_plate' && b.from === 9));
  assert.ok(e.lootPool.families.staff.bases.some(b => b.key === 'g5_t_bo'), 'a catalog quarterstaff is pooled with the staves');
  const rng = makeRng(23);
  let saw = 0;
  for (let i = 0; i < 4000; i++) { const it = e.rpg.rollDrop({ level: 12, rng, chance: 1 }); if (it?.g5) saw++; }
  assert.ok(saw > 40, `${saw} catalog items in 4000 drops`);
});

test('T23: F\'s real catalog (when it is there): every new wearable row is an item, every caster row a working form', () => {
  const rep = engine.gearReport;
  if (!rep.catalog.length) return;                 // F has not written it yet: nothing to check (and nothing broke)
  for (const key of rep.catalog) {
    const it = engine.makeItem({ base: key, rarity: 'magic', level: 20, rng: makeRng(key.length * 3) });
    assert.ok(it && it.g5 && it.look?.g5 === it.g5, `${key}: carries its model id`);
    assert.ok(engine.items.weaponBases[it.baseKey] || engine.items.armorBases[it.baseKey], `${key}: template ${it.baseKey} exists`);
    if (it.castStyle) assert.ok(it.attackText, `${key}: a caster with a card`);
  }
  for (const s of rep.skipped) assert.ok(s.why, `${s.id}: skipped with a reason`);
});

test('T23 (E\'s ask): every base injected from F\'s REAL catalog is in the drop pool at its own minLevel, and drops', () => {
  const rep = engine.gearReport;
  if (!rep.catalog.length) return;
  const where = new Map();
  for (const f of Object.values(engine.lootPool.families)) for (const b of f.bases) where.set(b.key, { fam: f.id, from: b.from });
  for (const key of rep.catalog) {
    const base = engine.items.weaponBases[key] || engine.items.armorBases[key];
    assert.ok(where.has(key), `${key} is in the pool`);
    assert.equal(where.get(key).from, base.minLevel || 1, `${key} opens at its minLevel`);
  }
  const rng = makeRng(2323);
  const seen = new Set();
  for (let i = 0; i < 30000; i++) { const it = engine.rpg.rollDrop({ level: 30, rng, chance: 1 }); if (it?.catalogBase) seen.add(it.catalogBase); }
  assert.deepEqual(rep.catalog.filter(k => !seen.has(k)), [], 'every catalog base dropped at least once in 30,000 level-30 drops');
  const low = new Set();
  for (let i = 0; i < 6000; i++) { const it = engine.rpg.rollDrop({ level: 1, rng, chance: 1 }); if (it?.catalogBase) low.add(it.catalogBase); }
  for (const k of low) assert.ok(((engine.items.weaponBases[k] || engine.items.armorBases[k]).minLevel || 1) <= 1, `${k} dropped at level 1 before its minLevel`);
});

// ============================================================================ T5

test('T5: kitsFor / validKit / starterGear from the booted rules; applyKit dresses a new character in exactly that', () => {
  for (const cls of CLASSES) {
    const k = kitsFor(cls);
    assert.equal(k.armour.length, 3, cls);
    assert.ok(k.weapons.length >= 4 && k.weapons.length <= 7, cls);
    for (const pack of k.weapons) for (const it of pack.items) {
      assert.ok(it.starter && it.name, `${cls}/${pack.id}`);
      if (it.type === 'weapon' && it.weaponCategory === 'magic' && it.castElement) assert.ok(it.attackText || it.focusText, `${cls}/${pack.id}: ${it.name} has its card line`);
      if (pack.style && it === pack.items[0]) { assert.equal(it.castStyle, pack.style, `${cls}/${pack.id}`); assert.ok(engine.casterForms.styles[pack.style], `${cls}/${pack.id}: ${pack.style} is a real style`); }
    }
  }
  assert.deepEqual(validKit('mage', { armour: 'nope', weapons: 'wand_burst' }), { ok: true, armour: kitsFor('mage').armour[0].id, weapons: 'wand_burst', fell: ['armour'] });
  const w = world();
  const me = w.add('mage', 1);
  const pick = { armour: kitsFor('mage').armour[2].id, weapons: 'wand_burst' };
  const r = w.room.rules.applyKit(me, pick);
  assert.ok(r.ok);
  assert.deepEqual(r.kit, pick);
  const gear = starterGear('mage', pick);
  assert.deepEqual(Object.keys(w.room.rules.gear(me)).filter(s => w.room.rules.gear(me)[s]).sort(), Object.keys(gear).sort());
  assert.equal(me.r.unit.equipment.weapon.castStyle, 'burst');
  assert.equal(w.room.rules.attackRange(me), engine.casterForms.styles.burst.range, 'and its reach is that style\'s');
  assert.equal(me.r.unit.hp, me.r.unit.maxHp);
  // the saved gear comes back the same on a fresh login
  const saved = w.room.rules.saveGear(me);
  const w2 = world();
  const again = w2.room.addPlayer({ id: 99, name: 'again', cls: 'mage', level: 1, xp: 0, gold: 0, room: 'x', x: SX, z: SZ, equipment: saved }, null);
  assert.equal(again.r.unit.equipment.weapon.castStyle, 'burst');
  assert.equal(again.r.unit.equipment.weapon.attackText, me.r.unit.equipment.weapon.attackText);
});

// ============================================================================ T10

test('T10: champions and rares roll from level 2 at the configured rate through the real spawn path (never at level 1, never with noRank)', () => {
  const c = engine.affixes.cfg.chance;
  assert.deepEqual([c.champion, c.rare, c.minLevel], [0.05, 0.06, 2]);
  const count = (level, data, N = 3000) => {
    const room = createRoom({ id: `rare-${level}-${JSON.stringify(data).length}`, terrain, seed: 31 + level, camps: [], createRules, hooks: { log: () => {} } });
    let rare = 0, champ = 0;
    for (let i = 0; i < N; i++) {
      const m = room.spawn({ kind: 'monster', type: 'wolf', level, x: SX + 300 + (i % 50) * 6, z: SZ + 300 + Math.floor(i / 50) * 6, data });
      if (m.r.unit.rank === 'rare') { rare++; assert.ok(m.aff?.length === 2 && m.sc > 1, 'a rare shows two affixes and is bigger'); }
      else if (m.r.unit.rank === 'champion') champ++;
      room.remove(m);
    }
    return { rare: rare / N, champ: champ / N };
  };
  assert.deepEqual(count(1, { camp: 'c' }), { rare: 0, champ: 0 }, 'level 1 never rolls');
  for (const level of [2, 5]) {
    const r = count(level, { camp: 'c' });
    assert.ok(Math.abs(r.rare - 0.06) < 0.02, `level ${level}: rare ${(r.rare * 100).toFixed(1)}%`);
    assert.ok(Math.abs(r.champ - 0.05) < 0.025, `level ${level}: champion ${(r.champ * 100).toFixed(1)}%`);
  }
  assert.deepEqual(count(5, { camp: 'c', noRank: true }, 600), { rare: 0, champ: 0 }, 'a camp marked noRank never rolls');
  assert.deepEqual(count(5, {}, 600), { rare: 0, champ: 0 }, 'nor does a body that is not a camp\'s');
});

// ============================================================================ T23 slots addendum: back, waist, light

test('T23 slots: a cloak and a belt are worn in their own slots, count on the sheet, save and come back', () => {
  const w = world();
  const me = w.add('ranger', 10);
  const u = me.r.unit;
  assert.deepEqual(w.room.rules.SLOTS, ['weapon', 'offhand', 'head', 'chest', 'back', 'hands', 'waist', 'legs', 'feet', 'necklace', 'ring', 'ring2']);      // owner feedback 8 (W22): no `light` slot
  const mk = base => w.room.rules.makeItem(me, { base, rarity: 'normal', level: 10 });
  const before = { armor: u.derived.armor, hp: u.maxHp, mres: u.derived.magicResist };
  const cloak = mk('travel_cloak'), belt = mk('leather_belt');
  assert.equal(mk('hand_lantern'), null, 'W22: no lantern can be made');
  assert.deepEqual([cloak.slot, belt.slot], ['back', 'waist']);
  assert.equal(w.room.rules.canEquip(me, cloak).ok, true);
  assert.equal(w.room.rules.canEquip(me, cloak, 'waist').ok, false, 'a cloak is not a belt');
  assert.equal(w.room.rules.equip(me, belt, 'back').ok, false);
  for (const it of [cloak, belt]) { const r = w.room.rules.equip(me, it); assert.ok(r.ok, `${it.name}: ${r.text}`); assert.deepEqual(r.removed, []); }
  assert.equal(u.equipment.back, cloak); assert.equal(u.equipment.waist, belt);
  assert.equal(u.derived.armor, before.armor + 4, 'cloak +2 and belt +2 armour');
  assert.equal(u.derived.magicResist, before.mres + 2, 'cloak +2 magic resistance');
  assert.ok(u.maxHp >= before.hp + 8, `belt +8 health (${before.hp} -> ${u.maxHp})`);
  const buffs = w.room.rules.itemBuffs(me);
  assert.equal(buffs.light, undefined); assert.equal(buffs.lightRange, w.room.rules.LIGHT.radius); assert.equal(buffs.wornLight, undefined);
  // a second cloak takes the first one off and hands it back
  const cloak2 = mk('g5_swallowtail') || mk('travel_cloak');
  const swap = w.room.rules.equip(me, cloak2);
  assert.ok(swap.ok); assert.deepEqual(swap.removed, [cloak]);
  // saved, and back after a login
  const saved = w.room.rules.saveGear(me);
  assert.ok(saved.back && saved.waist && !saved.light, 'saveGear carries back / waist');
  const w2 = world();
  const again = w2.room.addPlayer({ id: 98, name: 'again', cls: 'ranger', level: 10, xp: 0, gold: 0, room: 'x', x: SX, z: SZ, equipment: saved }, null);
  const u2 = again.r.unit;
  assert.equal(u2.equipment.back?.name, cloak2.name); assert.equal(u2.equipment.waist?.name, belt.name);
  assert.equal(u2.derived.armor, u.derived.armor, 'the same sheet after a login');
  // off again
  const off = w.room.rules.unequip(me, 'waist');
  assert.ok(off.ok); assert.equal(off.item, belt); assert.equal(u.equipment.waist, null);
});

test('T23 slots: cloaks and belts drop, and a crate can promise one', () => {
  const rng = makeRng(909);
  const seen = { back: 0, waist: 0, light: 0 };      // `light` must stay 0 (W22)
  for (let i = 0; i < 12000; i++) { const it = engine.rpg.rollDrop({ level: 8, rng, chance: 1 }); if (it && seen[it.slot] != null) seen[it.slot]++; }
  assert.ok(seen.back > 20 && seen.waist > 20 && seen.light === 0, JSON.stringify(seen));
  const w = world();
  const me = w.add('mage', 6);
  for (const slot of ['back', 'waist']) for (let k = 0; k < 6; k++) {
    const crate = w.room.rules.makeCrate(me, { slot, min: 'uncommon' });
    const [it] = w.room.rules.openCrate(me, crate);
    assert.equal(it?.slot, slot, `${slot} crate: ${it?.name}`);
    assert.notEqual(it.rarity, 'normal');
    assert.equal(w.room.rules.canEquip(me, it).ok, true);
  }
  assert.equal(makeCrate({ slot: 'cloak' }).crate.slot, 'back', 'E may write cloak / belt / lantern');
  if (engine.gearReport.catalog.length) assert.deepEqual(engine.gearReport.skipped.filter(x => !/lantern|torch/.test(x.why)), [], 'F\'s whole catalog is injected: nothing skipped but the removed lights');
});
