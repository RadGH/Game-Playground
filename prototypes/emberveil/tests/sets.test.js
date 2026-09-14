// E29: the item sets — every set generates, every piece is real, the 2/3/4/5-piece bonuses apply,
// the set powers reach the fight, and the new sets can actually drop.
import { test } from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { Loot } from '../js/loot.js';
import { makeRng } from '../js/rng.js';
import { EFFECTS } from '../js/effects.js';
import { derive } from '../js/rules.js';

const items = JSON.parse(fs.readFileSync(new URL('../data/items.json', import.meta.url)));
const loot = new Loot(items);
/** Sets added in this round (E29), on top of the 24 ported from the original. */
const NEW_SETS = ['roadwardens_vigil', 'foragers_covenant', 'grudgekeepers_ledger', 'pilgrims_choir'];

test('the four new sets exist, are 3-5 pieces, and have 2- and 4-piece style bonuses', () => {
  for (const id of NEW_SETS) {
    const set = items.sets.find(s => s.id === id);
    assert.ok(set, `${id} is in items.json`);
    assert.ok(set.items.length >= 3 && set.items.length <= 5, `${id} has ${set.items.length} pieces`);
    assert.equal(set.pieces, set.items.length, `${id} pieces count matches`);
    assert.ok(set.partialBonuses['2'], `${id} has a 2-piece bonus`);
    const top = String(set.items.length);
    assert.ok(set.partialBonuses[top], `${id} has a full-set bonus at ${top}`);
    if (set.items.length >= 4) assert.ok(set.partialBonuses['4'], `${id} has a 4-piece bonus`);
    assert.equal(set.activationPieces, set.items.length);
    assert.ok(EFFECTS['legendary:' + set.legendaryEffect], `${id} power ${set.legendaryEffect} is in the registry`);
    assert.ok(['low', 'mid', 'endgame'].includes(set.tier), `${id} tier`);
  }
});

test('every set piece in the game names a real base, slot and affix stat', () => {
  const bases = { ...items.weaponBases, ...items.armorBases };
  const rng = makeRng(3);
  for (const set of items.sets) {
    for (let i = 0; i < set.items.length; i++) {
      const piece = set.items[i];
      assert.ok(bases[piece.baseItemId], `${set.id}: base ${piece.baseItemId}`);
      const it = loot.generateSetItem(set.id, i, 'high', rng);
      assert.ok(it, `${set.id} piece ${i} generates`);
      assert.equal(it.setId, set.id);
      assert.equal(it.rarity, 'legendary');
      assert.ok(it.affixes.length > 0);
      for (const a of it.affixes) assert.ok(typeof a.value === 'number' && isFinite(a.value), `${set.id}: ${a.stat}`);
    }
  }
});

test('wearing the pieces turns the bonuses on, one threshold at a time', () => {
  const rng = makeRng(9);
  const set = items.sets.find(s => s.id === 'pilgrims_choir');
  const slots = ['weapon', 'head', 'chest', 'offhand', 'necklace'];
  const eq = {};
  let lastCount = 0;
  for (let i = 0; i < set.items.length; i++) {
    eq[slots[i]] = loot.generateSetItem(set.id, i, 'high', rng);
    const active = loot.activeSets(eq).find(s => s.set.id === set.id);
    assert.ok(active, `after ${i + 1} pieces the set is seen`);
    assert.ok(active.count > lastCount); lastCount = active.count;
    // the 5th piece carries cond_extraSetPiece, so the set counts one higher than it really is
    const effective = i === 4 ? active.count + 1 : active.count;
    assert.equal(active.bonuses.length, Object.keys(set.partialBonuses).filter(t => effective >= +t).length);
  }
  assert.ok(loot.activeSets(eq)[0].legendaryActive, 'the full set switches its power on');
  assert.ok(loot.legendaryEffects(eq).includes(set.legendaryEffect));
});

test('set bonuses actually reach a hero\'s derived stats', () => {
  const rng = makeRng(21);
  const hero = {
    id: 'h', level: 10, attrs: { STR: 12, DEX: 10, INT: 10, CON: 12 }, passiveRanks: {},
    equipment: {}, talents: {}, skills: [],
  };
  const bare = derive(hero, loot);
  hero.equipment = {
    head: loot.generateSetItem('roadwardens_vigil', 0, 'high', rng),
    chest: loot.generateSetItem('roadwardens_vigil', 1, 'high', rng),
    feet: loot.generateSetItem('roadwardens_vigil', 2, 'high', rng),
  };
  const worn = derive(hero, loot);
  assert.ok(worn.maxHp > bare.maxHp, 'more health');
  assert.ok(worn.armor > bare.armor, 'more armour');
  assert.ok(worn.legendary.includes('no_night_raids'), 'and the set power is live');
});

test('the world hooks on the new set pieces are registered affixes', () => {
  const rng = makeRng(31);
  for (const id of NEW_SETS) {
    const set = items.sets.find(s => s.id === id);
    for (let i = 0; i < set.items.length; i++) {
      const it = loot.generateSetItem(id, i, 'high', rng);
      for (const a of it.affixes) {
        if (!String(a.stat).startsWith('cond_')) continue;
        assert.ok(EFFECTS['affix:' + a.stat], `${id} piece ${i}: ${a.stat} has no effect entry`);
      }
    }
  }
});

test('set pieces drop: a long run of kills in every act turns up each tier', () => {
  const rng = makeRng(5);
  const byTier = { low: 0, mid: 0, endgame: 0 };
  const ids = new Set();
  for (const [act, tier] of [[1, 'low'], [3, 'mid'], [6, 'endgame']]) {
    for (let i = 0; i < 20000; i++) {
      const it = loot.maybeSetItem(act, rng, 0.03);
      if (it) { byTier[tier]++; ids.add(it.setId); }
    }
  }
  for (const [tier, n] of Object.entries(byTier)) assert.ok(n > 100, `${tier}: only ${n} drops in 20000 kills`);
  for (const id of NEW_SETS) assert.ok(ids.has(id), `${id} never dropped`);
});

test('zoneDrop can return a set piece', () => {
  const rng = makeRng(13);
  let sets = 0, drops = 0;
  for (let i = 0; i < 40000; i++) {
    const it = loot.zoneDrop('thornwood', rng, { act: 1 });
    if (it) { drops++; if (it.setId) sets++; }
  }
  assert.ok(drops > 100, 'the zone drops things at all');
  assert.ok(sets > 0, 'and some of them are set pieces');
});
