// node --test tests/D/armour-tier2.test.js
// Play-test 4 S18: a themed armour piece (stream C/E's armour-tiers.json: `info.gear.<slot>.theme`, from level 15) or one
// with a numeric tier 2 / item level >= 15 shows the second tier: the theme's trim, its emblem on chest, back, shoulders
// (the wearer's class t2 kit) and helm brow. Plain, magic, rare and unique pieces without a theme keep the tier-1 look.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gearLook, gearKey } from '../../js/client/gear-look.js';
import { ITEM_TIER2_LEVEL } from '../../../../avatar-3d/js/class-outfits.js';
import { register } from 'node:module';
register('../../../../avatar-3d/tests/three-loader.mjs', import.meta.url);
const { EMBLEMS } = await import('../../../../avatar-3d/js/chibi2-armour2.js');

const T2 = JSON.parse(readFileSync(new URL('../../../../avatar-3d/data/class-outfits-t2.json', import.meta.url))).classes;
const AT = JSON.parse(readFileSync(new URL('../../data/rules/armour-tiers.json', import.meta.url)));
const bases = JSON.parse(readFileSync(new URL('../../../emberveil/data/items.json', import.meta.url)));
const B = { ...bases.weaponBases, ...bases.armorBases };
const baseOf = k => B[k] || null;
const themes = AT.themes;

test('S18: untheme armour keeps the tier-1 look whatever its rarity', () => {
  for (const r of ['normal', 'magic', 'rare', 'legendary']) {
    const a = gearLook({ chest: { base: 'heavy_chest', rarity: r }, head: { base: 'heavy_helm', rarity: r } }, { baseOf, tier2: T2.pyromancer, themes });
    assert.ok(!a.top.emblem, r); assert.equal(a.decor.id, 'none', r); assert.ok(!a.hat.emblem, r);
  }
});

test('S18: a themed piece draws ITS theme (emblem, trim, glow) with the class kit; head and chest independently', () => {
  for (const [id, th] of Object.entries(themes)) {
    const a = gearLook({ chest: { base: 'medium_chest', rarity: 'magic', theme: id }, head: { base: 'heavy_helm', rarity: 'normal', theme: id } }, { baseOf, tier2: T2.warrior, themes });
    assert.equal(EMBLEMS[a.top.emblem], EMBLEMS[th.emblem], id);
    assert.equal(a.top.emblemColor, th.glow, id); assert.equal(a.top.color2, th.trim, id); assert.equal(a.decor.color2, th.trim, id);
    assert.equal(a.decor.id, T2.warrior.decor.id, id);
    assert.equal(EMBLEMS[a.hat.emblem], EMBLEMS[th.emblem], id); assert.equal(a.hat.color2, th.trim, id);
  }
  const headOnly = gearLook({ chest: { base: 'medium_chest', rarity: 'magic' }, head: { base: 'heavy_helm', theme: 'storm' } }, { baseOf, tier2: T2.warrior, themes });
  assert.ok(!headOnly.top.emblem); assert.equal(headOnly.decor.id, 'none'); assert.equal(headOnly.hat.emblem, 'bolt');
  // the armour weight still picks the part (a themed tier-2 item carrying `tier: 2` must not break that)
  const t = gearLook({ chest: { base: 'heavy_chest', tier: 2, theme: 'frost' } }, { baseOf, tier2: T2.mage, themes });
  assert.equal(t.top.id, 'plate');
});

test('S18: a numeric tier 2 / item level >= 15 with no theme wears the class theme; no tables = the old look', () => {
  for (const [cls, o] of Object.entries(T2)) {
    const a = gearLook({ chest: { base: 'medium_chest', rarity: 'magic', lvl: ITEM_TIER2_LEVEL } }, { baseOf, tier2: o, themes });
    assert.equal(a.top.emblem, o.top.emblem, cls);
  }
  assert.ok(!gearLook({ chest: { base: 'heavy_chest', theme: 'flame' } }, { baseOf }).top.emblem);
  assert.notEqual(gearKey({ chest: { base: 'x', rarity: 'magic' } }), gearKey({ chest: { base: 'x', rarity: 'magic', theme: 'flame' } }));
  assert.notEqual(gearKey({ chest: { base: 'x', rarity: 'magic', lvl: 3 } }), gearKey({ chest: { base: 'x', rarity: 'magic', lvl: 20 } }));
});
