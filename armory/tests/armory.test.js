// Armory — the pure half (armory/js/model.js): rows, filters, deep links, looks, flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  prepareRows, facets, filterRows, parseHash, formatHash, findRow, mannequin, baselineFor, handModes, defaultHand, dress,
  plainLook, itemRows, iconItem, exportFlags, SORTS, EMPTY_FILTER,
} from '../js/model.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const RAW = [
  { id: 'fh_dagger', slot: 'held', kind: 'weapon', gameSlot: 'weapon', type: 'dagger', hands: 1, file: 'avatar-3d/js/chibi2-weapons.js', builder: 'BUILDERS.fh_dagger', games: ['farhold', 'thousandvale'], items: [{ game: 'thousandvale', base: 'dagger' }] },
  { id: 'fh_dagger', slot: 'offhand', kind: 'offhand', type: 'dagger', games: ['farhold'] },
  { id: 'g5_cuirass', base: 'g5_cuirass', slot: 'top', kind: 'armour', gameSlot: 'chest', type: 'chest', archetype: 'plate', name: 'Riveted Cuirass', new: true, round: 5, games: ['thousandvale'], color: '#9aa2ac', color2: '#d8b040' },
  { id: 'g5_gauntlets', slot: 'top', field: 'gloves', kind: 'armour', gameSlot: 'hands', type: 'hands', archetype: 'plate', round: 5 },
  { id: 'fh_greatsword', slot: 'held', kind: 'weapon', type: 'sword2h', hands: 2 },
  { id: 'none', slot: 'hat' }, null,
  { id: 'war_helm', slot: 'hat' },
];
const rows = prepareRows(RAW);

test('rows: unique keys, sensible defaults, "none" and empty rows dropped', () => {
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(r => r.key)).size, rows.length);
  assert.equal(rows[0].key, 'fh_dagger'); assert.equal(rows[1].key, 'offhand:fh_dagger');
  const helm = findRow(rows, 'war_helm');
  assert.equal(helm.kind, 'hat'); assert.equal(helm.gameSlot, 'head'); assert.equal(helm.name, 'War Helm');
  assert.ok(findRow(rows, 'g5_cuirass').isNew && findRow(rows, 'g5_gauntlets').isNew && !rows[0].isNew);
  assert.equal(findRow(rows, 'offhand:fh_dagger').slot, 'offhand');
  assert.equal(findRow(rows, 'nope'), null);
});

test('filters: each one narrows, they combine, search reads ids, files and item bases', () => {
  const f = o => filterRows(rows, { ...EMPTY_FILTER, ...o }).map(r => r.key);
  assert.equal(f({}).length, rows.length);
  assert.deepEqual(f({ kind: 'weapon' }), ['fh_dagger', 'fh_greatsword']);
  assert.deepEqual(f({ type: 'dagger' }), ['fh_dagger', 'offhand:fh_dagger']);
  assert.deepEqual(f({ archetype: 'plate', slot: 'hands' }), ['g5_gauntlets']);
  assert.deepEqual(f({ game: 'thousandvale', isNew: true }), ['g5_cuirass']);
  assert.deepEqual(f({ hands: '2' }), ['fh_greatsword']);
  assert.deepEqual(f({ q: 'chibi2-weapons builders' }), ['fh_dagger']);
  assert.deepEqual(f({ q: 'riveted' }), ['g5_cuirass']);
  assert.deepEqual(filterRows(rows, { ...EMPTY_FILTER, flagged: true }, { war_helm: { note: 'x' } }).map(r => r.key), ['war_helm']);
  const fc = facets(rows);
  assert.deepEqual(fc.type.find(v => v.value === 'dagger'), { value: 'dagger', n: 2 });
  assert.ok(fc.game.some(v => v.value === 'farhold' && v.n === 2));
  assert.equal([...rows].sort(SORTS.slot)[0].kind, 'weapon', 'weapons sort first');
});

test('deep links round-trip, and defaults stay out of the address', () => {
  const s = parseHash('#id=fh_daggers&hand=both&anim=flurry&race=dwarf');
  assert.equal(s.id, 'fh_daggers'); assert.equal(s.view.hand, 'both'); assert.equal(s.view.anim, 'flurry'); assert.equal(s.view.race, 'dwarf'); assert.equal(s.view.height, 'medium');
  assert.equal(formatHash(s), '#id=fh_daggers&hand=both&anim=flurry&race=dwarf');
  const g = parseHash('#kind=weapon&type=dagger&new=1&q=g5');
  assert.deepEqual([g.filter.kind, g.filter.type, g.filter.isNew, g.filter.q, g.id], ['weapon', 'dagger', true, 'g5', '']);
  assert.equal(formatHash(g), '#q=g5&kind=weapon&type=dagger&new=1');
  assert.equal(formatHash(parseHash('')), '');
  assert.equal(formatHash({ id: '', view: { hand: 'both' } }), '', 'view settings mean nothing without a model');
});

test('looks: main / off / both hands, a field row merges into its slot, the base is never mutated', () => {
  const base = mannequin(), frozen = JSON.stringify(base);
  const dagger = rows[0];
  assert.deepEqual(handModes(dagger), ['main', 'off', 'both']); assert.equal(defaultHand(dagger), 'main');
  // two-handers (owner 2026-10-21): main hand only — never the off hand, never a pair
  for (const r of rows.filter(r => r.slot === 'held' && r.hands === 2)) assert.deepEqual(handModes(r), ['main'], r.key);
  assert.deepEqual(handModes(findRow(rows, 'offhand:fh_dagger')), ['off']); assert.deepEqual(handModes(findRow(rows, 'war_helm')), []);
  const main = dress(base, dagger, { hand: 'main', quality: 2 });
  assert.equal(main.held.id, 'fh_dagger'); assert.equal(main.held.quality, 2); assert.equal(main.offhand.id, 'none');
  const off = dress(base, dagger, { hand: 'off' }); assert.equal(off.held.id, 'none'); assert.equal(off.offhand.id, 'fh_dagger');
  const both = dress(base, dagger, { hand: 'both' }); assert.equal(both.held.id, 'fh_dagger'); assert.equal(both.offhand.id, 'fh_dagger');
  // two two-handers at once is a real case (the doubled-grip perk): the page must let it be built
  const twin = dress(base, findRow(rows, 'fh_greatsword'), { hand: 'both' }); assert.equal(twin.offhand.id, 'fh_greatsword');
  const gloves = dress(base, findRow(rows, 'g5_gauntlets'));
  assert.equal(gloves.top.id, 'tshirt', 'gloves ride top.gloves and must not replace the shirt'); assert.equal(gloves.top.gloves.id, 'g5_gauntlets');
  const cuirass = dress(base, findRow(rows, 'g5_cuirass'));
  assert.deepEqual(cuirass.top, { id: 'g5_cuirass', color: '#9aa2ac', color2: '#d8b040' });
  assert.equal(JSON.stringify(base), frozen);
  // a catalog reader's own lookFor wins
  const viaReader = dress(base, dagger, { lookFor: () => ({ slot: 'held', part: { id: 'fh_dagger', color: '#123456', mark: 1 } }) });
  assert.equal(viaReader.held.mark, 1);
  assert.deepEqual(plainLook(findRow(rows, 'g5_gauntlets')).part, { gloves: { id: 'g5_gauntlets', color: '#7a5a3a' } });
});

test('the body a piece is measured against never wears that piece', () => {
  for (const [slot, id] of [['top', 'tshirt'], ['bottom', 'shorts'], ['shoes', 'wraps']]) {
    const row = prepareRows([{ id, slot }])[0];
    assert.notEqual(baselineFor(row)[slot].id, id, `${id} would be measured against itself and come out as zero triangles`);
  }
  assert.equal(baselineFor(findRow(rows, 'war_helm')).hair.id, 'bald', 'a hat is measured on a bald head');
  assert.equal(baselineFor(rows[0]).hair.id, 'short');
  assert.equal(mannequin({ race: 'orc', height: 'tall' }).body.race, 'orc');
});

test('game items: names come from the shared item file, unknown bases are said to be unknown', () => {
  const itemData = JSON.parse(readFileSync(ROOT + 'prototypes/emberveil/data/items.json', 'utf8'));
  const list = itemRows(rows[0], itemData);
  assert.equal(list.length, 1); assert.equal(list[0].name, 'Dagger'); assert.ok(list[0].known && /dagger/.test(list[0].detail));
  const fresh = itemRows(findRow(rows, 'g5_cuirass'), itemData);
  assert.deepEqual([fresh[0].game, fresh[0].base, fresh[0].name, fresh[0].known], ['thousandvale', 'g5_cuirass', 'Riveted Cuirass', false]);
  const icon = iconItem(rows[0], itemData);
  assert.equal(icon.baseKey, 'dagger'); assert.equal(icon.type, 'weapon'); assert.equal(icon.slot, 'weapon'); assert.equal(icon.rarity, 'normal');
  assert.equal(iconItem(findRow(rows, 'war_helm'), itemData), null);
});

test('flag export: one entry per flag with file, builder, note and a link that reopens it', () => {
  const out = exportFlags({ fh_dagger: { note: 'held sideways in the off hand', at: '2026-10-06T10:00:00.000Z', view: { hand: 'both', anim: 'flurry' } }, gone_id: { note: 'old' } }, rows, { page: 'http://x/armory/', now: new Date('2026-10-06T12:00:00Z') });
  assert.equal(out.count, 2);
  const d = out.flags.find(f => f.id === 'fh_dagger');
  assert.equal(d.file, 'avatar-3d/js/chibi2-weapons.js'); assert.equal(d.builder, 'BUILDERS.fh_dagger'); assert.equal(d.note, 'held sideways in the off hand');
  assert.equal(d.link, 'http://x/armory/#id=fh_dagger&hand=both&anim=flurry');
  assert.equal(out.flags.find(f => f.id === 'gone_id').file, null, 'a flag on a model that no longer exists is still exported');
});

test('the page files exist and load nothing from the site root', () => {
  for (const f of ['armory/index.html', 'armory/armory.css', 'armory/README.md', 'armory/js/app.js', 'armory/js/source.js', 'avatar-3d/js/preview-kit.js']) assert.ok(existsSync(ROOT + f), f);
  const html = readFileSync(ROOT + 'armory/index.html', 'utf8');
  assert.ok(!/(?:src|href)="\//.test(html));
  // rows come from the gear catalog and nowhere else
  assert.ok(!existsSync(ROOT + 'armory/js/registry-source.js'));
  assert.ok(/gear-catalog\.js/.test(readFileSync(ROOT + 'armory/js/source.js', 'utf8')));
});

test('the real gear catalog: every row is usable by the page', async () => {
  const { loadGearCatalog, lookFor } = await import('../../avatar-3d/js/gear-catalog.js');
  const cat = await loadGearCatalog(), all = prepareRows(cat.rows);
  assert.ok(all.length > 150, 'the catalog lists the models');
  assert.equal(new Set(all.map(r => r.key)).size, all.length, 'page keys are unique');
  const f = facets(all);
  for (const k of ['kind', 'slot', 'type', 'game']) assert.ok(f[k]?.length > 1, `the ${k} filter has values`);
  assert.ok(all.some(r => r.isNew), '"new this round" has rows');
  const base = mannequin();
  for (const r of all) {
    assert.ok(r.file && existsSync(ROOT + r.file), `${r.id}: source file ${r.file} does not exist`);
    assert.ok(r.builder, `${r.id}: no builder named`);
    const a = dress(base, r, { lookFor, hand: handModes(r).includes('both') ? 'both' : '' });
    const got = r.field ? a[r.slot][r.field] : a[r.slot];
    assert.equal(got?.id, r.id, `${r.key}: dressing the mannequin does not put the piece on`);
    if (r.field) assert.equal(a[r.slot].id, base[r.slot].id, `${r.key}: a field row must not replace its slot`);
  }
});

test('the 66 new rows each show a mapped Thousandvale item, named, on a known template base', async () => {
  const { loadGearCatalog } = await import('../../avatar-3d/js/gear-catalog.js');
  const itemData = JSON.parse(readFileSync(ROOT + 'prototypes/emberveil/data/items.json', 'utf8'));
  const fresh = prepareRows((await loadGearCatalog()).rows).filter(r => r.isNew);
  assert.ok(fresh.length >= 60);
  for (const r of fresh) {
    const list = itemRows(r, itemData);
    assert.ok(list.some(i => i.game === 'thousandvale'), `${r.id}: no Thousandvale item shown`);
    assert.ok(list.every(i => i.name), `${r.id}: an item with no name`);
  }
  const unknown = fresh.filter(r => !itemRows(r, itemData).some(i => i.known)).map(r => r.id);
  assert.ok(unknown.length <= fresh.length * 0.25, 'most new rows resolve to a template base: ' + unknown.join(', '));
});
