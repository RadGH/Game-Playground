// node --test avatar-3d/tests/class-outfits-t2.test.js
// Tier-2 class armour (Thousandvale play-test 4, S18): every class has a complete tier-2 outfit whose ids
// survive the shared normaliser, every emblem builds, every kit builds, and a look naming neither builds
// exactly the geometry it did before (the opt-in promise to Farhold/Emberveil/Bannerline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { dressAs, tier2Dress, isTier2Item, OUTFIT_SLOTS, ITEM_TIER2_LEVEL } from '../js/class-outfits.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';

register('./three-loader.mjs', import.meta.url);

const T2 = JSON.parse(readFileSync(new URL('../data/class-outfits-t2.json', import.meta.url))).classes;
const T1 = JSON.parse(readFileSync(new URL('../data/class-outfits.json', import.meta.url))).classes;
const CLASSES = JSON.parse(readFileSync(new URL('../../prototypes/farhold/data/classes.json', import.meta.url)));
const classIds = (Array.isArray(CLASSES.classes || CLASSES) ? (CLASSES.classes || CLASSES).map(c => c.id) : Object.keys(CLASSES.classes || CLASSES));
const LOOKS = JSON.parse(readFileSync(new URL('../../prototypes/emberveil/data/class-looks.json', import.meta.url)));

test('every one of the 30 classes has a complete tier-2 outfit with an emblem and a t2 kit', async () => {
  const { EMBLEM_IDS, T2_DECOR } = await import('../js/chibi2-armour2.js');
  assert.equal(classIds.length, 30);
  for (const cls of classIds) {
    const o = T2[cls];
    assert.ok(o, `${cls}: no tier-2 outfit`);
    for (const slot of OUTFIT_SLOTS) assert.ok(o[slot]?.id, `${cls}.${slot} missing`);
    assert.ok(EMBLEM_IDS.includes(o.top.emblem), `${cls}: emblem ${o.top.emblem}`);
    assert.ok(T2_DECOR.includes(o.decor.id), `${cls}: decor ${o.decor.id}`);
  }
  // the iconography the owner named is all there
  const used = new Set(Object.values(T2).map(o => o.top.emblem));
  for (const e of ['flame', 'bolt', 'drop', 'frost', 'sun', 'skull', 'leaf', 'rune', 'eye', 'claw', 'cog']) assert.ok(used.has(e), `no class wears ${e}`);
});

test('every tier-2 part id (and the emblem fields) survives the shared normaliser', () => {
  for (const [cls, outfit] of Object.entries(T2)) {
    const n = normalizeAvatar(dressAs(LOOKS.classes[cls]?.avatar || {}, outfit));
    for (const slot of OUTFIT_SLOTS) {
      const id = outfit[slot].id;
      assert.ok(id === 'none' || PARTS[slot]?.[id], `${cls}.${slot} = ${id} is not a registered part`);
      assert.equal(n[slot].id, id, `${cls}.${slot} = ${id} was dropped by the normaliser`);
    }
    assert.equal(n.top.emblem, outfit.top.emblem, `${cls}: emblem dropped`);
    assert.equal(n.decor.color2, outfit.decor.color2, `${cls}: trim dropped`);
  }
});

test('isTier2Item: explicit look tier, a theme, a numeric tier, an item level — never rarity alone', () => {
  assert.equal(isTier2Item({ rarity: 'normal' }), false);
  assert.equal(isTier2Item({ rarity: 'rare' }), false);
  assert.equal(isTier2Item({ rarity: 'legendary', unique: 'x' }), false, 'uniques keep their own look');
  assert.equal(isTier2Item({ rarity: 'magic', theme: 'flame' }), true);
  assert.equal(isTier2Item({ base: 'heavy_chest', tier: 2 }), true);
  assert.equal(isTier2Item({ base: 'heavy_chest', tier: 'heavy' }), false, 'an armour weight is not a tier');
  assert.equal(isTier2Item({ rarity: 'magic', level: ITEM_TIER2_LEVEL }), true);
  assert.equal(isTier2Item({ rarity: 'magic', lvl: ITEM_TIER2_LEVEL - 1 }), false);
  assert.equal(isTier2Item({ theme: 'flame', look: { tier: 1 } }), false);
  assert.equal(isTier2Item({ rarity: 'normal', look: { tier: 2 } }), true);
});

test('every class emblem agrees with Thousandvale armour-tiers.json (theme, trim, glow)', async () => {
  const AT = JSON.parse(readFileSync(new URL('../../prototypes/thousandvale/data/rules/armour-tiers.json', import.meta.url)));
  const { EMBLEMS } = await import('../js/chibi2-armour2.js');
  for (const [cls, o] of Object.entries(T2)) {
    const th = AT.themes[AT.classes[cls].theme];
    assert.equal(o.theme, AT.classes[cls].theme, cls);
    assert.equal(EMBLEMS[o.top.emblem], EMBLEMS[th.emblem], `${cls}: ${o.top.emblem} vs ${th.emblem}`);
    assert.equal(o.top.emblemColor, th.glow, cls); assert.equal(o.decor.color2, th.trim, cls);
  }
  for (const t of Object.values(AT.themes)) assert.ok(EMBLEMS[t.emblem], `no emblem for theme emblem ${t.emblem}`);
});

test('tier2Dress lays trim, emblem and kit over a gear look; element swaps the emblem', () => {
  const gear = { top: { id: 'plate', color: '#a0a8b2' }, hat: { id: 'horned_helm', color: '#8a9098' }, decor: { id: 'none' } };
  const snap = JSON.stringify(gear);
  const a = tier2Dress(gear, T2.warrior, { chest: true, head: true });
  assert.equal(JSON.stringify(gear), snap, 'the input look was changed');
  assert.equal(a.top.id, 'plate'); assert.equal(a.top.color, '#a0a8b2');
  assert.equal(a.top.emblem, T2.warrior.top.emblem); assert.equal(a.decor.id, 't2_pauldrons'); assert.equal(a.hat.color2, T2.warrior.hat.color2);
  assert.equal(a.hat.emblem, T2.warrior.top.emblem);
  const themed = tier2Dress(gear, T2.warrior, { emblem: 'skull', trim: '#123456', emblemColor: '#abcdef' });
  assert.deepEqual([themed.top.emblem, themed.top.emblemColor, themed.decor.color2], ['skull', '#abcdef', '#123456']);
  assert.equal(tier2Dress(gear, T2.mage, { element: 'fire' }).top.emblem, 'flame');
  assert.equal(tier2Dress(gear, T2.warrior, { chest: false }).decor.id, 'none');
});

test('every emblem and every kit builds; looks naming neither build the same geometry as before', async () => {
  const { createChibi2Character } = await import('../js/chibi2.js');
  const { EMBLEM_IDS, emblemGeometries } = await import('../js/chibi2-armour2.js');
  for (const id of EMBLEM_IDS) for (const { geometry } of emblemGeometries(id)) {
    assert.ok(geometry.attributes.position.count > 0, id);
    const p = geometry.attributes.position.array;
    for (let i = 0; i < p.length; i++) assert.ok(Number.isFinite(p[i]), `${id}: NaN`);
    assert.ok(Math.max(...p) <= 1.2 && Math.min(...p) >= -1.2, `${id} leaves its unit box`);
  }
  const count = c => c.stats().triangles;
  const { buildArmour2 } = await import('../js/chibi2-armour2.js');
  const base = LOOKS.classes.warrior.avatar;
  // tier 1, and every Emberveil class look: buildArmour2 must not add a single piece (byte-identical builds)
  const looks = [...Object.values(T1).map(o => dressAs(base, o)), ...Object.values(LOOKS.classes).map(c => c.avatar)];
  for (const look of looks) {
    let added = 0;
    buildArmour2(normalizeAvatar(look), { add: () => { added++; }, W: 1, T: 1, chestZ: () => 0.15, hipsZ: () => 0.15, topStyle: {} });
    assert.equal(added, 0, `buildArmour2 drew on a look with no emblem/t2 kit (${look.top?.id})`);
  }
  // tier 2: every class builds, adds geometry over its tier-1 self, and stays inside a budget
  for (const cls of classIds) {
    const look = dressAs(base, T2[cls]);
    const c2 = await createChibi2Character(look);
    const tris = count(c2);
    const noKit = await createChibi2Character({ ...look, decor: { id: 'none' }, top: { ...look.top, emblem: null }, hat: { ...look.hat, emblem: null } });
    assert.ok(tris > count(noKit) + 200, `${cls}: tier-2 kit + emblem added only ${tris - count(noKit)} triangles`);
    assert.ok(tris < 16000, `${cls}: ${tris} triangles is over the tier-2 budget`);
  }
});
