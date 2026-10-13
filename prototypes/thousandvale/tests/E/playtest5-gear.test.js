// Stream E — play-test 5 T15 / T23: the new wands, staves, focuses and the new gear types reach the shops
// (tools/content-gear.mjs, from stream F's avatar-3d/data/gear-catalog.json). Drops are stream C's (the injected bases
// join the loot pool at their minLevel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { shelfFor, shelveCatalog, CATALOG, START_CAP } from '../../tools/content-gear.mjs';

const root = new URL('../../', import.meta.url);
const SHOPS = () => JSON.parse(readFileSync(new URL('data/provinces/shops.json', root), 'utf8'));
const row = (o) => ({ new: true, minLevel: 1, ...o, base: o.base || o.id });

test('T15/T23: every kind of new thing has a shelf — casters at the apothecary, foci at the tailor, armour by weight', () => {
  const shelf = r => shelfFor(row(r)).map(x => x.join('/'));
  for (const t of ['wand', 'staff', 'quarterstaff', 'scepter', 'tome']) assert.ok(shelf({ id: 'g5_x_' + t, kind: 'weapon', type: t }).includes('apothecary/weapon'), t);
  // round 10: an orb is an off-hand implement even though the item table calls it a weapon — it is shelved with the foci and on NO weapon shelf
  for (const id of ['g5_x_orb', 'g5_a_orb', 'g5_b_orb', 'g5_c_orb']) assert.deepEqual(shelf({ id, kind: 'weapon', type: 'orb' }), ['tailor/other'], id);
  { const S = SHOPS(), cat = JSON.parse(readFileSync(new URL('../../avatar-3d/data/gear-catalog.json', root), 'utf8'));
    const orbs = new Set(['orb', ...(Array.isArray(cat) ? cat : cat.rows || []).filter(r => r.kind === 'weapon' && r.type === 'orb').map(r => r.base || r.id)]);
    assert.ok(orbs.size >= 2, 'the catalog has orbs to check');
    const isOrb = b => orbs.has(b);
    for (const [k, kind] of Object.entries(S.kinds)) for (const [c, cat] of Object.entries(kind.categories || {})) if (c === 'weapon') assert.deepEqual(cat.bases.filter(isOrb), [], `${k}/${c} sells an orb as a weapon`);
    assert.ok(S.kinds.tailor.categories.other.bases.includes('orb'), 'the plain orb is with the caster\'s off-hand things'); }
  for (const t of ['bow', 'crossbow', 'javelin']) assert.ok(shelf({ id: 'g5_x_' + t, kind: 'weapon', type: t }).includes('bowyer/weapon'), t);
  for (const t of ['sword', 'dagger', 'axe', 'axe2h', 'sword2h', 'mace', 'hammer', 'hammer2h', 'spear', 'polearm']) assert.ok(shelf({ id: 'g5_x_' + t, kind: 'weapon', type: t }).includes('weaponsmith/weapon'), t);
  for (const t of ['tome', 'orb', 'relic', 'idol', 'ward', 'totem']) assert.deepEqual(shelf({ id: 'g5_f_' + t, kind: 'offhand', type: t }), ['tailor/other'], t);
  assert.deepEqual(shelf({ id: 'g5_s', kind: 'offhand', type: 'shield' }), ['weaponsmith/armor', 'armourer/other']);
  assert.deepEqual(shelf({ id: 'g5_q', kind: 'offhand', type: 'quiver' }), ['bowyer/other']);
  for (const slot of ['head', 'chest', 'legs', 'hands', 'feet']) {
    assert.deepEqual(shelf({ id: 'g5_c_' + slot, kind: 'armour', gameSlot: slot, type: slot, archetype: 'cloth' }), ['tailor/armor']);
    assert.deepEqual(shelf({ id: 'g5_l_' + slot, kind: 'armour', gameSlot: slot, type: slot, archetype: 'leather' }), ['tailor/armor', 'armourer/armor']);
    for (const a of ['mail', 'plate']) assert.deepEqual(shelf({ id: 'g5_' + a + slot, kind: 'armour', gameSlot: slot, type: slot, archetype: a }), ['armourer/armor']);
  }
  assert.deepEqual(shelf({ id: 'g5_r', kind: 'accessory', gameSlot: 'ring', type: 'ring' }), ['jeweller/other']);
  assert.deepEqual(shelf({ id: 'g5_a', kind: 'accessory', gameSlot: 'necklace', type: 'amulet' }), ['jeweller/other']);
  assert.deepEqual(shelf({ id: 'g5_k', kind: 'accessory', gameSlot: 'cape', type: 'cloak' }), ['tailor/armor']);
});

test('T15/T23: shelving adds each base once, gates late ones by the town\'s level cap, grows the shelf, and is the same on a second run', () => {
  const cat = { rows: [
    row({ id: 'g5_test_wand', kind: 'weapon', type: 'wand', minLevel: 1 }), row({ id: 'g5_test_staff', kind: 'weapon', type: 'staff', minLevel: 9 }),
    row({ id: 'g5_test_cuirass', kind: 'armour', gameSlot: 'chest', type: 'chest', archetype: 'plate', minLevel: 12 }),
    row({ id: 'g5_test_idol', kind: 'offhand', type: 'idol', minLevel: 4 }), { id: 'old_sword', kind: 'weapon', type: 'sword' },      // an old row: not new, never shelved
    row({ id: 'g5_test_lantern', kind: 'offhand', type: 'lantern' }) ] };
  const base = SHOPS(), before = base.kinds.apothecary.categories.weapon.countBase ?? base.kinds.apothecary.categories.weapon.count - Math.ceil((base.kinds.apothecary.categories.weapon.catalog || []).length / 3);
  const a = shelveCatalog(SHOPS(), cat);
  const ap = a.data.kinds.apothecary.categories.weapon;
  assert.ok(ap.bases.includes('g5_test_wand') && ap.bases.includes('g5_test_staff'));
  assert.deepEqual(ap.minCap, { g5_test_staff: 9 });
  assert.ok(START_CAP < 9 && !('g5_test_wand' in ap.minCap));
  assert.equal(ap.count, before + 1);
  assert.equal(a.data.kinds.armourer.categories.armor.minCap.g5_test_cuirass, 12);
  assert.ok(a.data.kinds.tailor.categories.other.bases.includes('g5_test_idol'));
  // W22 (owner feedback 8): light items left the game — a lantern row is shelved NOWHERE
  assert.deepEqual(a.unshelved.map(x => x.id || x), ['g5_test_lantern']);
  assert.equal(a.shelved, 4);
  assert.ok(!JSON.stringify(a.data.kinds).includes('g5_test_lantern'));
  assert.ok(!JSON.stringify(a.data).includes('old_sword'));
  assert.ok(a.data.roles.apothecary.sells.some(s => s.base === 'g5_test_wand') || a.data.roles.apothecary.sells.length >= ap.count, 'roles rebuilt');
  const b = shelveCatalog(JSON.parse(JSON.stringify(a.data)), cat);
  assert.deepEqual(b.data, a.data);
  // and an empty catalog takes everything out again
  const c = shelveCatalog(JSON.parse(JSON.stringify(a.data)), { rows: [] });
  assert.ok(!JSON.stringify(c.data).includes('g5_test_'));
});

test('T15/T23: with stream F\'s catalog on disk, every new wand, staff, focus and armour piece is on a shelf and shops.json is current', { skip: !existsSync(CATALOG) && 'avatar-3d/data/gear-catalog.json is not there yet' }, () => {
  const cat = JSON.parse(readFileSync(CATALOG, 'utf8'));
  const rows = (Array.isArray(cat) ? cat : cat.rows).filter(r => r.new && r.base);
  const S = SHOPS(), text = JSON.stringify(S);
  const r = shelveCatalog(JSON.parse(text), cat);
  assert.deepEqual(r.data, S, 'run tools/content-gear.mjs');
  const all = new Set(Object.values(S.kinds).flatMap(k => Object.values(k.categories || {}).flatMap(c => c.bases)));
  const isLight = x => ['lantern', 'torch'].includes(x.type) || x.gameSlot === 'light';
  for (const x of rows) if (!isLight(x)) assert.ok(all.has(x.base), x.id + ' is in no shop');
  // play-test 5 slots addendum: cloaks and belts at the tailor, worn lights at the general store — plain bases and catalog rows
  for (const b of ['travel_cloak', 'leather_belt', ...rows.filter(q => ['cloak', 'belt'].includes(q.type)).map(q => q.base)]) assert.ok(S.kinds.tailor.categories.armor.bases.includes(b), b + ' not at the tailor');
  // W22: no light anywhere on a shelf
  for (const b of ['hand_lantern', 'pitch_torch', ...rows.filter(isLight).map(q => q.base)]) assert.ok(!all.has(b), b + ' is still sold');
  assert.ok(!S.kinds.general.categories.light, 'the Lanterns & torches shelf is gone');
  for (const t of ['wand', 'staff']) assert.ok(rows.some(x => x.kind === 'weapon' && x.type === t && S.kinds.apothecary.categories.weapon.bases.includes(x.base)), 'no new ' + t + ' at the apothecary');
  assert.ok(rows.some(x => x.kind === 'offhand' && S.kinds.tailor.categories.other.bases.includes(x.base)), 'no new focus at the tailor');
});
