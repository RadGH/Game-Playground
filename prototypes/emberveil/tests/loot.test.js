import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Loot } from '../js/loot.js'; import { makeRng } from '../js/rng.js';
const data = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url))); const loot = new Loot(data);
test('every base generates; normal items have no affixes, magic 2, rare 3, legendary 5-6 (+1 on accessories)', () => {
  const rng = makeRng(7); for (const key of Object.keys(loot.bases)) { const it = loot.generate(key, 'magic', 'medium', { rng }); assert.ok(it, key); assert.equal(it.affixes.filter(a => !a.baseIntrinsic).length, it.type === 'accessory' ? 3 : 2, key); }
  assert.equal(loot.generate('sword', 'normal', 'medium', { rng }).affixes.length, 0);
  assert.equal(loot.generate('sword', 'rare', 'medium', { rng }).affixes.length, 3);
  const leg = loot.generate('sword', 'legendary', 'medium', { rng }).affixes.length; assert.ok(leg >= 5 && leg <= 6);
});
test('names compose prefix + base + suffix and quality scales damage', () => {
  const rng = makeRng(3); let seen = 0; for (let i = 0; i < 40; i++) { const it = loot.generate('longsword', 'rare', 'exotic', { rng, extended: false }); if (/ of /.test(it.name) && it.name !== 'Longsword') seen++; assert.ok(it.name.includes('Longsword')); assert.equal(it.dmg[0], Math.round(8 * 1.6)); } assert.ok(seen > 5);
});
test('restrictions: Potent never rolls on a hammer, Sharp never on a wand, Bulwark only on shields', () => {
  const rng = makeRng(11); for (let i = 0; i < 200; i++) { const h = loot.generate('hammer', 'legendary', 'medium', { rng }); assert.ok(!h.affixes.some(a => a.id === 'potency' || a.id === 'block_chance')); const w = loot.generate('wand', 'legendary', 'medium', { rng }); assert.ok(!w.affixes.some(a => a.id === 'sharp')); }
  const s = loot.generate('tower_shield', 'legendary', 'medium', { rng }); assert.ok(s.affixes.some(a => a.id === 'base_block_chance'));
});
test('uniques, sets, prices, salvage, blacksmith', () => {
  const rng = makeRng(5); const u = loot.generateUnique('thornblade', rng); assert.equal(u.rarity, 'legendary'); assert.ok(u.affixes.some(a => a.stat === 'dex' && a.value === 10)); assert.ok(u.affixes.some(a => a.id === 'legendary_effect'));
  const s = loot.generateSetItem('iron_brigade', 0, 'high', rng); assert.equal(s.setId, 'iron_brigade'); const sets = loot.activeSets({ head: s, chest: loot.generateSetItem('iron_brigade', 1, 'high', rng) }); assert.equal(sets[0].count, 2); assert.ok(sets[0].legendaryActive);
  assert.equal(loot.price({ quality: 'medium', rarity: 'normal' }), 15); assert.equal(loot.price({ quality: 'exotic', rarity: 'legendary' }), 600); assert.equal(loot.sellPrice({ quality: 'medium', rarity: 'magic' }), 12);
  const y = loot.salvage({ rarity: 'rare' }, rng); assert.ok(y.magic_essence >= 1);
  const it = loot.generate('sword', 'magic', 'medium', { rng }); const mats = { rare_dust: 2 }; const r = loot.addAffix(it, 'rare_dust', mats, rng); assert.ok(r.ok === false); // magic cap 2 already full
  const n = loot.generate('sword', 'normal', 'medium', { rng }); assert.ok(loot.promote(n, { magic_essence: 3 }).ok); assert.equal(n.rarity, 'magic'); assert.ok(loot.addAffix(n, 'rare_dust', mats, rng).ok); assert.equal(mats.rare_dust, 0);
});
test('merchant stock is seeded and boss loot rolls', () => {
  const a = loot.merchantStock('emberglen', 1, { seed: 42 }), b = loot.merchantStock('emberglen', 1, { seed: 42 }); assert.equal(a.length, 10); assert.deepEqual(a.map(i => i.name), b.map(i => i.name));
  const rng = makeRng(9); const drops = loot.bossLoot('the_architect', rng); assert.ok(drops.length >= 3);
  let any = 0; for (let i = 0; i < 300; i++) if (loot.zoneDrop('thornwood', rng, { act: 1 })) any++; assert.ok(any > 20 && any < 120);
});
