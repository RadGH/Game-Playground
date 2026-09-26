// Items (docs/08 §2-7, §15, §21 items.data / pricing / oil): data counts, rolling, value, equip, tooltips, satchel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../js/core/data.js';
import { createRng } from '../../js/core/rng.js';
import { createHero, deriveStats } from '../../js/rpg/hero.js';
import { rollItem, baseValue, tooltipLines, itemScore, compare, equip, unequip, meleeWeapon, isOffClass, addToSatchel, takeItem, countOf, satchelFree,
  giveCurrency, spendCurrency, refillFlask, drinkFlask, flaskOf, giveStartingGear, sortSatchel, refreshItem } from '../../js/rpg/items.js';

const data = await loadData();
const I = data.items.list, by = t => I.filter(i => i.type === t);

// Stats hero.js deriveStats reads today, plus the extras this layer adds (listed in the agent's Integration note).
const DERIVE = ['health', 'healthPct', 'oil', 'oilRegenPct', 'armour', 'resistAll', 'critChance', 'critMult', 'meleePct', 'wickPct', 'spellPct', 'castSpeed', 'lightRadius', 'lightRadiusPct', 'lootFind', 'lifeSteal', 'moveSpeed'];
const EXTRA = ['oilPct', 'armourPct', 'oilCostPct', 'oilOnKill', 'buildSpeedPct', 'swimSpeed', 'ropeClimb', 'jumpApex', 'penniesFind', 'xpPct', 'breath', 'chillDur'];
const known = k => DERIVE.includes(k) || EXTRA.includes(k) || /^flame_(ember|rime|spark|bile|gleam|tide|shade)$/.test(k) || /^resist_/.test(k);

test('data: 30 bases (6/10/5/5/4), 2 weapons per class, 4 rarities, 12 affixes, 8 relics, 12 consumables + the bowl, unique ids', () => {
  const g = by('gear'), n = s => g.filter(x => x.slot === s).length;
  assert.equal(g.length, 30); assert.deepEqual([n('lantern'), n('weapon'), n('coat'), n('boots'), n('trinket')], [6, 10, 5, 5, 4]);
  for (const c of data.classes.list) { assert.equal(g.filter(x => x.slot === 'weapon' && x.class === c.id).length, 2, c.id); assert.ok(data.items.byId[c.weapon], c.weapon); assert.ok(data.items.byId[c.lantern], c.lantern); }
  assert.deepEqual(data.items.rarities.map(r => r.id), ['common', 'fine', 'rare', 'relic']);
  assert.equal(data.affixes.list.length, 12);
  assert.equal(by('relic').length, 8); for (const r of by('relic')) assert.ok(r.source && r.power?.text, r.id);
  assert.equal(by('consumable').length + by('meal').filter(m => !m.mystery).length, 12); assert.ok(data.items.byId.meal_mystery);
  const ids = I.map(i => i.id); assert.equal(new Set(ids).size, ids.length);
  for (const id of ['guild_flask', 'scrap', 'strand_dust', 'key_lockhouse', 'hollis_brother_lantern', ...[1, 2, 3, 4, 5, 6].map(a => `great_wick_act${a}`)]) assert.ok(data.items.byId[id], id);
  assert.equal(by('strand').length, 7 + 8 + 8);
});

test('every stat key on items and affixes is one deriveStats reads (or a listed extra)', () => {
  for (const d of I) for (const k of [...Object.keys(d.implicit || {}), ...Object.keys(d.core || {}), ...Object.keys(d.stats || {}), ...Object.keys(d.buff || {})]) assert.ok(known(k), `${d.id}: ${k}`);
  for (const a of data.affixes.list) for (const f of ['ember', 'rime']) assert.ok(known(a.stat.replace('{flame}', f)), a.id);
});

test('pricing: the four 08 §15 examples', () => {
  const v = (base, ilvl, rarity, n) => ({ base, type: 'gear', slot: data.items.byId[base].slot, ilvl, rarity, affixes: Array(n).fill({}) });
  const sell = x => Math.round(baseValue(data, x) * 0.25);
  assert.equal(Math.round(baseValue(data, v('wpn_pole', 1, 'common', 0))), 28); assert.equal(sell(v('wpn_pole', 1, 'common', 0)), 7);
  assert.equal(Math.round(baseValue(data, v('coat_wader', 12, 'fine', 1))), 138); assert.equal(sell(v('coat_wader', 12, 'fine', 1)), 35);
  assert.equal(Math.round(baseValue(data, v('lantern_cage', 18, 'rare', 2))), 775); assert.equal(sell(v('lantern_cage', 18, 'rare', 2)), 194);
  const clapper = rollItem(data, { base: 'relic_bell_clapper', ilvl: 25, rng: createRng(1) });
  assert.equal(clapper.value, 2038); assert.equal(sell(clapper), 510);
});

test('rolling: affix counts, distinct ids, coat rares are two prefixes, values inside ±15% of the line', () => {
  const rng = createRng(11);
  for (let k = 0; k < 2000; k++) {
    const base = rng.pick(by('gear')), rarity = rng.pick(['common', 'fine', 'rare']), ilvl = rng.int(1, 30);
    const it = rollItem(data, { base: base.id, ilvl, rarity, rng, act: 6 });
    assert.equal(it.affixes.length, { common: 0, fine: 1, rare: 2 }[rarity]);
    assert.equal(new Set(it.affixes.map(a => a.id)).size, it.affixes.length);
    if (base.slot === 'coat' && rarity === 'rare') assert.ok(it.affixes.every(a => a.kind === 'prefix'));
    for (const a of it.affixes) { const d = data.affixes.byId[a.id], line = d.lo + (d.hi - d.lo) * (ilvl - 1) / 29, step = d.step || (d.unit === 'pct' ? 0.001 : 1); assert.ok(Math.abs(a.value) <= Math.abs(line) * 1.15 + step / 2 + 1e-9 && Math.abs(a.value) >= Math.abs(line) * 0.85 - step / 2 - 1e-9, `${a.id} ${a.value} vs ${line}`); }
  }
});

test('flame affixes respect the act a flame opens (no shade before Act 4, no bile/gleam in Act 1)', () => {
  const rng = createRng(3), seen = { 1: new Set(), 3: new Set() };
  for (let k = 0; k < 3000; k++) for (const act of [1, 3]) { const it = rollItem(data, { base: 'lantern_guild', ilvl: 5, rarity: 'fine', rng, act }); for (const a of it.affixes) if (a.flame) seen[act].add(a.flame); }
  assert.deepEqual([...seen[1]].sort(), ['ember', 'rime', 'spark']);
  assert.ok(!seen[3].has('shade') && seen[3].has('tide') && seen[3].has('bile'));
});

test('names: fine = prefix + base name or base name + suffix; rares use the short noun or a keepsake noun', () => {
  const rng = createRng(9);
  for (let k = 0; k < 300; k++) {
    const it = rollItem(data, { base: 'wpn_pole', ilvl: 10, rarity: 'fine', rng, act: 4 }), a = it.affixes[0], d = data.affixes.byId[a.id], part = a.flame ? d.names[a.flame] : d.name;
    assert.equal(it.name, a.kind === 'prefix' ? `${part} Lamplighter's Pole` : `Lamplighter's Pole ${part}`);
  }
  const rare = rollItem(data, { base: 'wpn_pole', ilvl: 10, rarity: 'rare', rng: createRng(2), act: 4 });
  assert.ok(/ Pole | of |^.+ .+ .+$/.test(rare.name), rare.name);
});

test('equip / unequip: swaps through the satchel, feeds deriveStats, off-class weapons at ×0.8', () => {
  const rng = createRng(4), hero = createHero('lamplighter', data); giveStartingGear(hero, data, rng);
  assert.equal(hero.equipped.weapon.base, 'wpn_pole'); assert.equal(hero.equipped.lantern.base, 'lantern_guild');
  const a0 = deriveStats(hero, data).armour, coat = rollItem(data, { base: 'coat_bronze', ilvl: 1, rng }); addToSatchel(hero, data, coat);
  const r = equip(hero, coat, data); assert.ok(r.ok); assert.equal(hero.stats.armour, a0 + 18); assert.equal(hero.satchel.length, 0);
  const hook = rollItem(data, { base: 'wpn_hookstaff', ilvl: 1, rng }); addToSatchel(hero, data, hook); equip(hero, hook, data);
  assert.ok(isOffClass(hero, hook)); assert.equal(hero.satchel[0].base, 'wpn_pole');
  assert.deepEqual(meleeWeapon(hero, data).dmg, hook.weapon.dmg.map(d => d * 0.8));
  const bell = rollItem(data, { base: 'relic_bell_clapper', ilvl: 20, rng }); assert.ok(!isOffClass(hero, bell));
  hero.satchelSlots = hero.satchel.length; assert.equal(unequip(hero, 'coat', data).ok, false);
  hero.satchelSlots = 20; assert.ok(unequip(hero, 'coat', data).ok); assert.equal(hero.stats.armour, a0);
});

test('tempering raises base stats by 8% a level, never affixes', () => {
  const it = rollItem(data, { base: 'coat_bronze', ilvl: 10, rarity: 'fine', rng: createRng(8), act: 3 }), aff = JSON.stringify(it.affixes), arm = it.implicit.armour;
  it.temper = 5; refreshItem(data, it); assert.equal(it.implicit.armour, Math.round(it.core.armour * 1.4)); assert.ok(it.implicit.armour > arm); assert.equal(JSON.stringify(it.affixes), aff);
});

test('tooltips: plain lines, no long decimals, compare says better or worse', () => {
  const rng = createRng(21), hero = createHero('tinker', data);
  for (let k = 0; k < 600; k++) {
    const base = rng.pick([...by('gear'), ...by('relic')]), it = rollItem(data, { base: base.id, ilvl: rng.int(1, 30), rarity: rng.pick(['common', 'fine', 'rare']), rng, act: 6 });
    const lines = tooltipLines(it, data, { hero, compareTo: null });
    for (const l of lines) { assert.ok(l.text && !/\d\.\d{3,}|NaN|undefined|\{/.test(l.text), l.text); }
  }
  const weak = rollItem(data, { base: 'coat_guild', ilvl: 1, rng }), strong = rollItem(data, { base: 'coat_bronze', ilvl: 20, rarity: 'rare', rng, act: 5 });
  assert.ok(itemScore(strong) > itemScore(weak)); assert.equal(compare(strong, weak, data).better, 1);
  assert.ok(tooltipLines(strong, data, { compareTo: weak }).some(l => l.text.includes('better')));
  for (const id of ['lamp_oil', 'strand_charm_echo', 'great_wick_act1']) assert.ok(tooltipLines({ base: id, type: data.items.byId[id].type, qty: 3 }, data).length >= 2);
});

test('satchel: stacks of 10, scrap to the sack, keys to the ring, full satchel refuses', () => {
  const hero = createHero('lamplighter', data);
  assert.equal(addToSatchel(hero, data, 'lamp_oil', 25).added, 25); assert.equal(hero.satchel.length, 3); assert.equal(countOf(hero, 'lamp_oil'), 25);
  assert.equal(takeItem(hero, 'lamp_oil', 6), 6); assert.equal(countOf(hero, 'lamp_oil'), 19);
  addToSatchel(hero, data, 'strand_charm_split', 7); assert.equal(hero.satchel.filter(x => x.base === 'strand_charm_split').map(x => x.qty).join(), '5,2');
  const r = addToSatchel(hero, data, 'scrap', 700); assert.equal(hero.scrap, 599); assert.equal(r.left, 101);
  addToSatchel(hero, data, 'great_wick_act1'); assert.ok(hero.keys.includes('great_wick_act1'));
  hero.satchelSlots = hero.satchel.length; assert.equal(satchelFree(hero), 0);
  assert.equal(addToSatchel(hero, data, rollItem(data, { base: 'boots_guild', rng: createRng(1) })).added, 0);
  assert.equal(addToSatchel(hero, data, 'lamp_oil', 1).added, 1); // room left in a stack
  sortSatchel(hero); assert.equal(hero.satchel[0].type, 'consumable');
});

test('purse caps and spending; the Guild flask refills only at a lamp-post', () => {
  const hero = createHero('lamplighter', data);
  giveCurrency(hero, data, 'pearls', 5000); assert.equal(hero.currency.pearls, 999);
  giveCurrency(hero, data, 'pennies', 50); assert.equal(spendCurrency(hero, 'pennies', 60), false); assert.ok(spendCurrency(hero, 'pennies', 50)); assert.equal(hero.currency.pennies, 0);
  const p = { oil: 0, maxOil: 100 }, f = flaskOf(hero, data);
  assert.equal(drinkFlask(hero, p, data), 40); drinkFlask(hero, p, data); assert.equal(f.charges, 0); assert.equal(drinkFlask(hero, p, data), 0);
  addToSatchel(hero, data, 'lamp_oil', 10); assert.equal(f.charges, 0);
  refillFlask(hero, data); assert.equal(f.charges, 2);
  assert.equal(data.items.byId.lamp_oil.stack, 10);
});
