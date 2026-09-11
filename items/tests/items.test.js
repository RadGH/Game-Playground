import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ItemCatalog, RARITY } from '../js/items.js';
import { NameGen } from '../../namegen/js/namegen.js';
const r = f => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const cat = new ItemCatalog({ items: r('items.json'), materials: r('materials.json') });
const rn = f => JSON.parse(readFileSync(new URL('../../namegen/data/' + f, import.meta.url)));
const gen = new NameGen({ languages: rn('languages.json'), concepts: rn('concepts.json'), patterns: rn('patterns.json') });

test('catalog is large, well-formed, unique ids, valid rarities and materials', () => {
  assert.ok(cat.items.length >= 300, 'items: ' + cat.items.length);
  const ids = new Set(); const matIds = new Set(cat.materials.map(m => m.id));
  for (const i of cat.items) { assert.ok(!ids.has(i.id), 'dup ' + i.id); ids.add(i.id); assert.ok(RARITY.includes(i.rarity), i.id); assert.ok(i.value[0] <= i.value[1], i.id); assert.ok(i.tags.length >= 1, i.id); for (const m of i.materials) assert.ok(matIds.has(m), `${i.id}: material ${m}`); assert.ok(i.desc.length > 5, i.id); }
  assert.ok(cat.categories.length >= 10, cat.categories.join(','));
});
test('every race has favoured items and exclusives; goblets lean dwarf, bows lean elf', () => {
  for (const race of ['human', 'elf', 'dwarf', 'halfling', 'gnome', 'giant', 'troll', 'orc', 'goblin', 'dragon', 'undead', 'fey']) { assert.ok(cat.items.filter(i => (i.affinity[race] ?? 0) >= 2).length >= 15, race + ' favoured'); assert.ok(cat.items.some(i => i.exclusive === race), race + ' exclusive'); }
  assert.ok(cat.byId.goblet.affinity.dwarf > (cat.byId.goblet.affinity.elf ?? 0)); assert.ok(cat.byId.longbow.affinity.elf >= 2); assert.equal(cat.byId.livingwood_bow.exclusive, 'elf');
});
test('query respects race exclusives, tags, category and rarity', () => {
  assert.ok(!cat.query({ race: 'orc' }).some(x => x.item.exclusive && x.item.exclusive !== 'orc'));
  assert.ok(cat.query({ race: 'elf', tags: ['bow'] }).every(x => x.item.tags.includes('bow')));
  assert.ok(cat.query({ category: 'vessel', tags: ['drinking'] }).length >= 8);
  assert.ok(cat.query({ rarity: 'epic' }).length >= 4);
});
test('roll: seeded, respects race + rarity, names artifacts for epics, exports to lingo', () => {
  const a = cat.roll({ race: 'dwarf', rarity: 'rare', seed: 3, namegen: gen }), b = cat.roll({ race: 'dwarf', rarity: 'rare', seed: 3, namegen: gen });
  assert.equal(a.fullName, b.fullName); assert.equal(a.rarity, 'rare'); assert.ok(a.value > 0); assert.ok(a.lore.length > 10);
  let named = 0; for (let i = 0; i < 20; i++) { const e = cat.roll({ race: 'elf', rarity: 'epic', seed: 100 + i, namegen: gen }); assert.equal(e.rarity, 'epic'); if (e.artifact) named++; assert.ok(!(e.base.exclusive && e.base.exclusive !== 'elf')); }
  assert.ok(named >= 15, 'epics should be named: ' + named);
  const e = cat.toLexiconEntry(a); assert.equal(e.type, 'item'); assert.ok(e.forms.pl); assert.ok(e.tags.includes(a.rarity));
  for (let i = 0; i < 200; i++) { const x = cat.roll({ seed: i, namegen: gen }); assert.ok(x && x.fullName && !/undefined|NaN/.test(x.fullName + x.lore), JSON.stringify(x)); }
});
test('affinity shows in rolls: dwarves get more dwarf-favoured items than elves do', () => {
  const score = race => { let n = 0; for (let i = 0; i < 150; i++) { const x = cat.roll({ race, seed: 500 + i, lore: false }); if ((x.base.affinity.dwarf ?? 0) >= 2) n++; } return n; };
  assert.ok(score('dwarf') > score('elf') * 1.5);
});
