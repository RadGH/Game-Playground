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

// ---------------------------------------------------------------- round 22 (E49): a set for every class
const classes = JSON.parse(fs.readFileSync(new URL('../data/classes.json', import.meta.url))).classes;
const balance = JSON.parse(fs.readFileSync(new URL('../data/balance.json', import.meta.url)));
const bases = { ...items.weaponBases, ...items.armorBases };

test('every class has a set made for it, and can wear every piece of it', () => {
  for (const c of classes) {
    const mine = items.sets.filter(s => (s.classes || []).includes(c.id));
    assert.ok(mine.length >= 1, `${c.id} has no set`);
    for (const s of mine) for (const p of s.items) {
      const b = bases[p.baseItemId];
      if (b.type === 'weapon') assert.ok(c.weapons.includes(b.subtype) || c.weapons.includes(p.baseItemId), `${c.name} cannot use ${s.name}'s ${p.baseItemId}`);
    }
  }
  const classSets = items.sets.filter(s => s.classSet);
  assert.ok(classSets.length >= 26, `${classSets.length} class sets`);
  const sizes = new Set(classSets.map(s => s.items.length));
  assert.ok(Math.min(...sizes) === 2 && Math.max(...sizes) === 6 && sizes.size >= 4, `varied sizes: ${[...sizes]}`);
  const names = items.sets.map(s => s.name); assert.equal(new Set(names).size, names.length, 'no two sets share a name');
});

test('class sets: thresholds 2/3/4/6, bonuses that really reach the hero, powers that are registered', () => {
  for (const s of items.sets.filter(x => x.classSet)) {
    const n = s.items.length;
    const want = { 2: [2], 3: [2, 3], 4: [2, 3, 4], 5: [2, 3, 4, 5], 6: [2, 3, 4, 6] }[n];
    assert.deepEqual(Object.keys(s.partialBonuses).map(Number), want, `${s.id} thresholds`);
    assert.equal(s.activationPieces, n); assert.equal(s.pieces, n);
    for (const b of Object.values(s.partialBonuses)) for (const k of Object.keys(b)) {
      const e = EFFECTS['affix:' + k]; assert.ok(e, `${s.id}: ${k} is not an effect`);
      // set bonuses reach rules.derive (applyDeriveEffects), never the combat hooks: a cond_* bonus needs a derive hook
      if (k.startsWith('cond_') || k.startsWith('barrier')) assert.ok(typeof e.derive === 'function', `${s.id}: bonus ${k} has no derive hook, so it would do nothing`);
    }
    for (const id of [s.legendaryEffect, ...Object.values(s.thresholdPowers || {})]) assert.ok(EFFECTS['legendary:' + id], `${s.id}: power ${id}`);
    for (const p of s.items) { assert.ok(p.name, `${s.id}: every class-set piece has its own name`); for (const f of [...p.fixedAffixes, ...p.randomAffixes]) assert.ok(EFFECTS['affix:' + f.stat], `${s.id}: ${f.stat}`); }
  }
});

test('a threshold power turns on at its step and shows in derive()', () => {
  const rng = makeRng(41);
  const set = items.sets.find(s => s.id === 'oathbound_bulwark');
  const hero = { id: 'k', level: 20, attrs: { STR: 20, DEX: 10, INT: 8, CON: 18 }, passiveRanks: {}, talents: {}, skills: [], equipment: {} };
  const slotOf = p => p.slot === 'ring' ? 'ring1' : p.slot;
  for (let i = 0; i < 3; i++) hero.equipment[slotOf(set.items[i])] = loot.generateSetItem(set.id, i, 'elite', rng);
  assert.ok(!derive(hero, loot).legendary.includes('kill_party_heal'), 'not at 3 pieces');
  hero.equipment[slotOf(set.items[3])] = loot.generateSetItem(set.id, 3, 'elite', rng);
  const four = derive(hero, loot);
  assert.ok(four.legendary.includes('kill_party_heal'), 'the 4-piece power is on');
  assert.ok(!four.legendary.includes('cheat_death_once'), 'the full-set power waits for 6');
  for (let i = 4; i < 6; i++) hero.equipment[slotOf(set.items[i])] = loot.generateSetItem(set.id, i, 'elite', rng);
  const six = derive(hero, loot);
  assert.ok(six.legendary.includes('cheat_death_once')); assert.ok(six.thornsFlat >= 10, 'the derive-hook bonus (cond_thornsFlat) arrived');
  const info = loot.setInfo(hero.equipment.head, hero.equipment);
  assert.equal(info.worn, 6); assert.ok(info.steps.every(s => s.on));
});

test('set drops lean towards the party\'s classes', () => {
  const l = new Loot(items, { setChance: 1, classSetShare: 0.6 });
  l.partyClasses = () => ['warrior', 'ranger', 'mage', 'cleric'];
  const rng = makeRng(77); let mine = 0; const N = 4000;
  for (let i = 0; i < N; i++) { const it = l.maybeSetItem(1, rng); const s = items.sets.find(x => x.id === it.setId); if ((s.classes || []).some(c => l.partyClasses().includes(c))) mine++; }
  assert.ok(mine / N > 0.55 && mine / N < 0.8, `${(100 * mine / N).toFixed(0)}% of set drops were for the party`);
});

test('drop frequency: an average run finds a few set pieces per act (kills per act from the simulator)', () => {
  // Average kills per act for a run that reaches it, read off tools/sim-emberveil.mjs (100 runs, seed 1, round 22):
  // 66 / 48 / 74 / 63 / 62 / 52. Each kill rolls loot.zoneDrop in that act's zones.
  const KILLS = { 1: 66, 2: 48, 3: 74, 4: 63, 5: 62, 6: 52 };
  const ZONES = { 1: ['border_roads', 'thornwood'], 2: ['dust_roads', 'ember_plateau'], 3: ['hell_breach', 'shattered_core'], 4: ['cosmic_rift', 'eternal_void'], 5: ['abyssal_depths', 'primordial_nexus'], 6: ['dragons_reach', 'dragon_throne'] };
  const l = new Loot(items, { ...balance.loot, dropRate: balance.economy.globalMultipliers.dropRate });
  const rng = makeRng(2026); const RUNS = 400; const perAct = {};
  for (let act = 1; act <= 6; act++) {
    let sets = 0;
    for (let r = 0; r < RUNS; r++) for (let k = 0; k < KILLS[act]; k++) { const it = l.zoneDrop(ZONES[act][k % 2], rng, { act }); if (it?.setId) sets++; }
    perAct[act] = sets / RUNS;
  }
  const line = Object.entries(perAct).map(([a, v]) => `act ${a}: ${v.toFixed(1)}`).join(', ');
  for (const [a, v] of Object.entries(perAct)) assert.ok(v >= 1 && v <= 6, `set pieces per run in act ${a} = ${v.toFixed(2)} (${line})`);
  console.log(`# set pieces per run, per act — ${line}`);
});
