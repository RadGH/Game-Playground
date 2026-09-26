import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadJson } from './helpers.js';
import { createHero, deriveStats, xpNeed, grantXp, killXp, effAttr } from '../../js/rpg/hero.js';
const idx = f => { const j = loadJson(`data/${f}.json`); j.byId = Object.fromEntries(j.list.map(e => [e.id, e])); return j; };
const data = { classes: idx('classes') };
test('XP table matches 04 §17.1', () => { assert.equal(xpNeed(1), 100); assert.equal(xpNeed(2), 260); assert.equal(xpNeed(10), 2790); assert.equal(xpNeed(29), 14280); });
test('soft caps: Wick 40 with cap 25 = 32.5 effective', () => assert.equal(effAttr(40, 25), 32.5));
test('Lamplighter level 1 derived stats', () => {
  const h = createHero('lamplighter', data), s = deriveStats(h, data);
  assert.equal(s.maxHp, 92); // 60 + 8*4 = 92
  assert.equal(s.maxOil, Math.round((75 + 5 * 6) * 1.2));
  assert.equal(h.wicks[0].flame, 'ember'); assert.equal(h.unlocked.wickSlots, 1);
});
test('levelling: +3 attribute points and +1 skill point per level', () => {
  const h = createHero('tinker', data); grantXp(h, 100 + 260 + 5, data);
  assert.equal(h.level, 3); assert.equal(h.unspent.attr, 6); assert.equal(h.unspent.skill, 2);
});
test('kill XP: grey kills and trap bonus', () => {
  const def = { tier: 'standard' };
  assert.equal(killXp(def, 12, 12), 60); assert.equal(killXp(def, 12, 12, { trap: true }), 90);
  assert.equal(killXp(def, 4, 12), 0); assert.equal(killXp(def, 6, 12), Math.round(30 * 0.25));
});
