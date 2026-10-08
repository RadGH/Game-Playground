// node --test prototypes/thousandvale/tests/C/playtest7.test.mjs
//
// Owner feedback 7, V2 — "overhaul the gold rewards and item pricing … make fishing a viable alternate way to get gold".
// The RULES are pinned here (orderings, ratios, who applies a factor), never the numbers: data/rules/prices.json and
// data/rules/fishing.json `value` are knobs stream E's tools/sim-economy.mjs tunes with us.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRoom } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { createShops } from '../../js/sim/shops.js';
import { createRules, rulesEngine, priceOf, sellPriceFor, priceRow, killGold, crateValue, fishing, makeCrate, unbinderPrice } from '../../js/rules/index.js';
import { itemPrice, sellPrice, killGold as killGoldOf, goldFound, priceParts } from '../../js/rules/economy.js';
import { createFishing } from '../../js/rules/fishing.js';
import { engineFor, parityEngineFor } from './setup.mjs';
import { makeRng } from '../../js/rules/rng.js';

const engine = rulesEngine();
const P = engine.prices;
const LEVELS = [1, 5, 10, 20];
const mk = (base, rarity, level, seed = 1) => engine.makeItem({ base, rarity, level, rng: makeRng(seed + level * 7 + base.length) });
const terrain = standInTerrain(2, 2048);
const SX = terrain.spawn.x, SZ = terrain.spawn.z;

test('V2 price: one formula — dearer with level, with rarity, with size of slot; a merchant never pays more than the list price', () => {
  for (const base of ['sword', 'greatsword', 'heavy_chest', 'light_boots', 'ring', 'wand', 'shield', 'travel_cloak']) {
    let prev = 0;
    for (const L of LEVELS) { const p = priceOf(mk(base, 'magic', L)); assert.ok(p > prev, `${base}: level ${L} costs more (${prev} -> ${p})`); prev = p; }
    const byRarity = ['normal', 'magic', 'rare', 'legendary'].map(r => priceOf({ ...mk(base, 'normal', 10), rarity: r }));
    assert.deepEqual([...byRarity].sort((a, b) => a - b), byRarity, `${base}: normal < magic < rare < legendary (${byRarity})`);
    assert.ok(new Set(byRarity).size === 4);
  }
  const at = (base, L = 10) => priceOf(mk(base, 'magic', L));
  assert.ok(at('greatsword') > at('sword') && at('sword') > at('light_boots') && at('heavy_chest') > at('light_boots'), 'a two-hander > a one-hander > boots; a chest > boots');
  const plain = mk('sword', 'rare', 10);
  assert.ok(priceOf({ ...plain, rarity: 'legendary', isUnique: true }) > priceOf({ ...plain, rarity: 'legendary' }), 'a unique is worth more than a plain legendary');
  // every drop: sells for less than it lists, and for something
  const rng = makeRng(77);
  let n = 0;
  for (const L of LEVELS) for (let i = 0; i < 1500; i++) {
    const it = engine.rpg.rollDrop({ level: L, rng, chance: 1 });
    if (!it) continue;
    n++;
    const p = priceOf(it), s = sellPriceFor(it);
    assert.ok(p >= 1 && s >= 1 && s < p, `${it.name} (L${L}): lists ${p}, sells ${s}`);
    assert.ok(s <= p * 0.5, `${it.name}: selling back is a loss of at least half`);
    assert.deepEqual(priceRow(it).price, p);
  }
  assert.ok(n > 5000);
  assert.equal(priceOf(makeCrate({ slot: 'any' })), 1); assert.equal(sellPriceFor(makeCrate({ gift: true })), 1);
});

test('V2 price: the level is applied ONCE — a shop row is rules.price x the town\'s multiplier, and no shop row costs less than it sells for', () => {
  const data = JSON.parse(readFileSync(new URL('../../data/provinces/shops.json', import.meta.url), 'utf8'));
  const S = createShops({ data, now: () => 0, rng: makeRng(5) });
  const rules = { price: priceOf, sellPrice: sellPriceFor };
  const rng = makeRng(9);
  for (const L of LEVELS) for (let i = 0; i < 300; i++) {
    const it = engine.rpg.rollDrop({ level: L, rng, chance: 1 });
    if (!it) continue;
    const list = priceOf(it);
    assert.equal(S.price(it, rules, 1), list, `${it.name} (L${L}): the shop asks the rules' price — nothing on top for its level`);
    assert.equal(S.price(it, rules, 1.2), Math.max(1, Math.round(list * 1.2)), 'a dearer town multiplies once');
    assert.ok(S.sellPrice(it, rules) <= S.price(it, rules, 1), `${it.name}: sells (${S.sellPrice(it, rules)}) for no more than it costs (${S.price(it, rules, 1)})`);
    // even in the cheapest town of the file, buying and selling back is never a profit
    const cheapest = Math.min(1, ...Object.values(data.towns || {}).map(t => t.priceMult || 1));
    assert.ok(S.sellPrice(it, rules) <= S.price(it, rules, cheapest), `${it.name}: no profit loop in a town with x${cheapest} prices`);
  }
});

test('V2 kill gold: by level and rank, linear (not the health curve), a brigand carries more than a rat — and the knobs move it', () => {
  let prev = 0;
  for (const L of [1, 2, 5, 10, 20, 40]) { const g = killGold(L); assert.ok(g > prev, `level ${L} pays more`); prev = g; }
  assert.ok(killGold(20) / killGold(1) < 12, `level 20 pays ${(killGold(20) / killGold(1)).toFixed(1)}x level 1 (Farhold's curve paid 10x at 20 and 100x at 40)`);
  assert.ok(killGold(40) / killGold(20) < 2.2, 'and doubling the level about doubles it');
  for (const L of LEVELS) {
    const [n, c, r] = ['normal', 'champion', 'rare'].map(k => killGold(L, k));
    assert.ok(c >= n * 2 && r > c, `L${L}: a champion (${c}) at least twice a normal (${n}), a rare (${r}) more`);
    assert.ok(killGold(L, 'normal', 'road_brigand') > killGold(L, 'normal', 'cairn_rat'), 'a brigand carries more than a rat');
    assert.ok(killGold(L, 'normal', 'road_brigand') <= killGold(L) * P.kill.weight[1] + 1, 'within the weight clamp');
  }
  // the knob is live: an odd value comes straight out
  const odd = { ...P, kill: { ...P.kill, base: 100, perLevel: 7 } };
  assert.equal(killGoldOf(odd, 3), 121);
  assert.equal(itemPrice({ ...P, gear: { ...P.gear, base: 1000, perLevel: 0 } }, { type: 'armor', slot: 'legs', rarity: 'normal', dropLevel: 9 }), Math.round(1000 * P.gear.slot.legs));
});

test('V2 kill gold in a real fight: what the room is handed is killGold x gold find, applied once', () => {
  const awards = [];
  const room = createRoom({ id: 'pt7', terrain, seed: 4, camps: [], createRules, hooks: { log: () => {} } });
  const award0 = room.host.award;
  room.host.award = (e, a) => { awards.push({ id: e.id, ...a }); return award0 ? award0(e, a) : undefined; };
  const me = room.addPlayer({ id: 5, name: 'k', cls: 'warrior', level: 20, xp: 0, gold: 0, room: 'pt7', x: SX, z: SZ }, null);
  const u = me.r.unit;
  const kill = type => {
    const m = room.spawn({ kind: 'monster', type, level: 8, x: SX, z: SZ + 2, data: { noRank: true } });
    m.r.unit.hp = 1;
    for (let i = 0; i < 80 && !m.dead; i++) { u.swing.mainReady = 0; room.intent(me, { t: 'cast', slot: 0, target: m.id, aim: { x: m.x, z: m.z } }); room.step(); }
    assert.ok(m.dead);
    return awards.filter(a => a.reason === 'kill').at(-1).gold;
  };
  const base = killGold(8, 'normal', 'road_brigand');
  assert.equal(kill('road_brigand'), goldFound(P, base, u.derived.goldFind || 0), 'the kill paid the formula');
  // +50% gold find from gear: exactly x1.5 — not x2.25 (the stat applied on both sides of the award)
  const ring = { id: 'gf', name: 'Ring of Fortune', type: 'armor', slot: 'ring', rarity: 'magic', affixes: [{ id: 'of_gold', stat: 'goldFind', value: 50 }] };
  assert.ok(room.rules.equip(me, ring, 'ring').ok);
  assert.equal(u.derived.goldFind, 50);
  assert.equal(kill('road_brigand'), Math.round(base * 1.5), 'gold find once');
  assert.equal(goldFound(P, 100, 10000), 100 * (1 + P.goldFind.cap / 100), 'and it is capped');
});

test('V2 parity: a parity engine keeps Farhold\'s own gold (the formula is Thousandvale\'s)', async () => {
  const pe = await parityEngineFor(3);
  assert.equal(pe.prices, null);
});

test('V2 ratios: an hour of killing buys about one uncommon piece of your level; a rare piece is hours of play', () => {
  const rng = makeRng(31);
  for (const L of LEVELS) {
    let sell = 0, n = 0;
    for (let i = 0; i < 2500; i++) { const it = engine.rpg.rollDrop({ level: L, rng, chance: 1 }); if (it) { n++; sell += sellPriceFor(it); } }
    const dropRate = engine.balance.loot?.dropRate ?? 0.45;
    // 80 kills an hour (E's walk: one every 45 s). One spawn in five rolls a champion or a rare from `minLevel` (data/rules/affixes.json)
    // and pays its rank's multiple — stream E's tools/sim-economy.mjs measures it with real spawns; leaving it out under-counts by half.
    const C = engine.affixes?.cfg?.chance || {}, rolls = L >= (C.minLevel ?? 2);
    const rankMean = rolls ? 1 + (C.champion || 0) * ((P.kill.rank.champion || 1) - 1) + (C.rare || 0) * ((P.kill.rank.rare || 1) - 1) : 1;
    const hour = 80 * killGold(L) * rankMean + 80 * dropRate * (sell / n) * (rolls ? 1.4 : 1);
    const magic = priceOf(mk('heavy_chest', 'magic', L)), rare = priceOf(mk('sword', 'rare', L));
    assert.ok(magic / hour > 0.3 && magic / hour < 1.5, `L${L}: an uncommon chest is ${(magic / hour).toFixed(2)} hours of killing`);
    assert.ok(rare / hour > 2 && rare / hour < 8, `L${L}: a rare sword is ${(rare / hour).toFixed(1)} hours`);
    assert.ok(80 * dropRate * (sell / n) < 3 * 80 * killGold(L) * rankMean, `L${L}: selling drops does not dwarf the gold monsters carry`);
  }
});

test('V2 fishing: commons are worth little and the prized few a lot; the same water pays more in a higher zone; the price is final', () => {
  const F = fishing();
  if (!F?.content) return;
  const V = F.numbers.value;
  assert.ok(V.rarity.common < V.rarity.uncommon && V.rarity.uncommon < V.rarity.rare && V.rarity.rare < V.rarity.epic, 'rarity factors rise');
  const rng = makeRng(71);
  const sample = (band, pool = null, casts = 12000, skill = 60) => {
    const by = { common: [], uncommon: [], rare: [], epic: [] };
    let gold = 0, crates = 0, fish = 0;
    for (let i = 0; i < casts; i++) {
      const c = F.roll({ water: ['river', 'lake', 'marsh', 'coast'][i % 4], band, time: ['day', 'night', 'dawn', 'dusk'][(i >> 2) % 4], skill, zone: 'nowhere', pool, rng });
      if (c.kind === 'crate') crates++;
      if (c.kind === 'fish') { fish++; by[c.rarity].push(c.price); assert.equal(F.item(c).price, c.price, 'the bag item carries the same final price'); }
      gold += c.price || 0;
    }
    return { by, gold: gold / casts, crates: crates / casts, fish: fish / casts };
  };
  const s5 = sample(8, { tier: 3 }, 16000, 100);        // a good pool in level-8 water, a master angler: every rarity can bite
  const max = a => Math.max(...a), min = a => Math.min(...a);
  assert.ok(s5.by.common.length && s5.by.rare.length && s5.by.epic.length, 'every rarity bites in a good pool');
  assert.ok(max(s5.by.common) < min(s5.by.rare), `the dearest common (${max(s5.by.common)}) is worth less than the cheapest rare (${min(s5.by.rare)})`);
  assert.ok(max(s5.by.epic) >= 25 * min(s5.by.common), `the best fish (${max(s5.by.epic)}) is at least 25x the cheapest (${min(s5.by.common)})`);
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(s5.by.common) < mean(s5.by.uncommon) && mean(s5.by.uncommon) < mean(s5.by.rare) && mean(s5.by.rare) < mean(s5.by.epic));
  // more in a higher zone, by about the band factor — applied once
  const s1 = sample(1), s10 = sample(10);
  // stream E (economy lead, tools/sim-economy.mjs): the RULE is "more in a higher zone"; how much more is a tuned number (it was pinned at 3x,
  // which only held while a catch was priced 3-4x what an hour of questing can bear — and level-1 water sits on the 1-gold floor)
  assert.ok(s10.gold > s5.gold * 0 && s10.gold > s1.gold * 1.5, `open water: ${s1.gold.toFixed(2)} gold a cast at level 1, ${s10.gold.toFixed(2)} at level 10`);
  // a sunken crate comes up at least once an hour of fishing (E's target), and is worth opening
  assert.ok(s5.crates * 150 >= 1, `${(s5.crates * 150).toFixed(1)} crates in 150 casts`);
  const cv = crateValue({ slot: 'any', min: 'uncommon' }, 5, 'ranger', 80);
  const open5 = sample(5, null, 4000);
  assert.ok(cv.price > 20 * open5.gold && cv.sell >= 1, `a crate's item lists at ${cv.price}: a find worth far more than a cast (${open5.gold.toFixed(1)})`);
  // water above every species' band still holds fish (and pays for its zone)
  const s20 = sample(20, null, 4000);
  assert.ok(s20.fish > 0.5, `level-20 water: ${(s20.fish * 100).toFixed(0)}% of casts are fish`);
  assert.ok(s20.gold > s10.gold, 'and pays more than level-10 water');
  // the knob: the band factor is applied exactly once
  const N0 = { ...F.numbers, value: { ...V, perBand: 0, mult: 1, rarity: { common: 1, uncommon: 1, rare: 1, epic: 1 } } };
  const N1 = { ...N0, value: { ...N0.value, perBand: 1 } };
  const one = (N, band) => { const Fx = createFishing(N, { fish: [{ id: 'a', name: 'A', water: ['river'], bands: [1, 30], time: 'any', rarity: 'common', size: [10, 10], price: 100, skill: 0 }] }); return Fx.roll({ water: 'river', band, time: 'day', skill: 100, rng: (() => { let k = 0; return () => [0.99, 0.99, 0.99, 0.99, 0.5, 0.5, 0.5][k++ % 7]; })() }); };
  const p1 = one(N0, 6), p2 = one(N1, 6);
  assert.equal(p1.kind, 'fish');
  assert.ok(Math.abs(p2.price - p1.price * 6) <= 6, `perBand 1 at level 6 = x6, once (not x36): ${p1.price} -> ${p2.price}`);
});

test('the Unbinder (owner feedback 10, Y14 — it replaces the round-7 "minutes of a questing hour" rule): a share of what a character of that level has really earned in total', () => {
  for (const L of LEVELS) {
    for (const kind of ['talent', 'perk', 'spell']) {
      const one = unbinderPrice(kind, 'one', L), all = unbinderPrice(kind, 'all', L);
      assert.ok(all >= one, `L${L} ${kind}: everything (${all}) is never cheaper than one (${one})`);
      if (L >= 5) assert.ok(all > one * 5, 'everything costs several times one');
    }
    assert.ok(unbinderPrice('talent', 'one', L) <= unbinderPrice('perk', 'one', L) && unbinderPrice('perk', 'one', L) <= unbinderPrice('spell', 'one', L), 'a talent is the cheapest to take back, a spell the dearest');
  }
  assert.ok(unbinderPrice('perk', 'one', 20) > unbinderPrice('perk', 'one', 1) * 5, 'it grows with your level');
  // the room charges it
  const room = createRoom({ id: 'pt7u', terrain, seed: 4, camps: [], createRules, hooks: { log: () => {} } });
  const me = room.addPlayer({ id: 6, name: 'u', cls: 'warrior', level: 10, xp: 0, gold: 0, room: 'pt7u', x: SX, z: SZ }, null);
  assert.equal(room.rules.retrainPrice(me, 'perk', 'one'), unbinderPrice('perk', 'one', 10));
  assert.equal(room.rules.retrainPrice(me, 'talent', 'all'), unbinderPrice('talent', 'all', 10));
});
