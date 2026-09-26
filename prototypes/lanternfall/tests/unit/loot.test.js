// Loot (docs/08 §14, §21 loot.tables / loot.gates): table ids, the act gate as a real knob, weights over
// 100k seeded rolls, elite step, chest minimums, relic once-per-save, strand dupes -> dust, pots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../../js/core/data.js';
import { createRng } from '../../js/core/rng.js';
import { createHero } from '../../js/rpg/hero.js';
import { rollLoot, resolveTable, pickRarity, rollPot, relicAllowed } from '../../js/rpg/loot.js';
import { addToSatchel } from '../../js/rpg/items.js';

const data = await loadData();
const TABLES = ['lt_act1', 'lt_act2', 'lt_act3', 'lt_act4', 'lt_act5', 'lt_act6', 'lt_unlit', 'lt_knell', 'lt_miniboss', 'lt_boss_act1', 'lt_boss_act2', 'lt_boss_act3', 'lt_boss_act4', 'lt_boss_act5', 'lt_boss_act6', 'lt_chest_plain', 'lt_chest_fine', 'lt_chest_rare'];
const items = drops => drops.filter(d => d.kind === 'item').map(d => d.item);
const within = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg}: ${got.toFixed(4)} vs ${want.toFixed(4)}`);

test('exactly the 18 table ids of 08 §14.3 (aliases aside); every id they and enemies.json name exists', () => {
  assert.deepEqual(data.loot.list.filter(t => !t.alias).map(t => t.id).sort(), [...TABLES].sort());
  for (const t of data.loot.list) {
    if (t.alias) { assert.ok(data.loot.byId[t.alias], t.id); continue; }
    for (const g of [...(t.guaranteed || []), ...Object.values(t.byEnemy || {}).flat()]) { if (g.kind === 'table') assert.ok(data.loot.byId[g.id]); else if (g.id) assert.ok(data.items.byId[g.id], g.id); }
    for (const id of t.strandPick?.options || []) assert.ok(data.items.byId[id], id);
  }
  for (const e of data.enemies.list) if (e.loot) assert.doesNotThrow(() => resolveTable(data, e.loot), e.loot);
  for (const T of Object.values(data.loot.tiers)) for (const w of Object.values(T.rarity)) assert.ok(!('relic' in w));
  for (const p of Object.values(data.loot.pools)) for (const x of p) assert.ok(data.items.byId[x.id], x.id);
  assert.ok(!data.loot.byId.lt_boss_act6.guaranteed.some(g => g.id?.startsWith('relic_')));
});

test('the Act 2 affix gate is read from the data: 10,000 Act 1 rolls give no affixes; move the gate to 1 and they appear', () => {
  const rng = createRng(1); let aff = 0, gear = 0;
  for (let k = 0; k < 10000; k++) for (const it of items(rollLoot('lt_act1', { data, rng, level: 4, tier: 'heavy', elite: k % 3 === 0 }))) { gear++; aff += it.affixes.length; }
  assert.ok(gear > 500); assert.equal(aff, 0);
  const moved = { ...data, loot: { ...data.loot, affixFromAct: 1 } }; let aff2 = 0;
  for (let k = 0; k < 3000; k++) for (const it of items(rollLoot('lt_act1', { data: moved, rng, level: 4, tier: 'heavy', elite: true }))) aff2 += it.affixes.length;
  assert.ok(aff2 > 100, `affixes after moving the gate: ${aff2}`);
});

test('rarity weights over 100k seeded picks land within 1% (standard, Act 2+; elite; Act 1)', () => {
  const rng = createRng(77), N = 100000;
  for (const tier of ['standard', 'elite', 'fodder']) {
    const T = data.loot.tiers[tier], w = T.rarity.late, sum = Object.values(w).reduce((a, b) => a + b, 0), c = { common: 0, fine: 0, rare: 0 };
    for (let k = 0; k < N; k++) c[pickRarity(data, T, 3, 1, rng)]++;
    for (const r of Object.keys(c)) within(c[r] / N, w[r] / sum, 0.01, `${tier} ${r}`);
  }
  for (let k = 0; k < 20000; k++) assert.equal(pickRarity(data, data.loot.tiers.elite, 1, 1.6, rng), 'common');
});

test('drop chances over 100k kills land within 1%: gear, oil blob, consumable pool', () => {
  const rng = createRng(5), N = 100000, T = data.loot.tiers.standard; let gear = 0, oil = 0, cons = 0; const pool = {};
  for (let k = 0; k < N; k++) {
    const d = rollLoot('lt_act1', { data, rng, level: 3, tier: 'standard' });
    if (d.some(x => x.kind === 'item')) gear++; if (d.some(x => x.kind === 'oil')) oil++;
    for (const x of d) if (x.kind === 'consumable') { cons++; pool[x.id] = (pool[x.id] || 0) + 1; }
  }
  within(gear / N, T.gearChance, 0.01, 'gear'); within(oil / N, T.oilChance, 0.01, 'oil'); within(cons / N, T.consumableChance, 0.01, 'consumable');
  const P = data.loot.pools[1], sum = P.reduce((a, b) => a + b.w, 0);
  for (const x of P) within(pool[x.id] / cons, x.w / sum, 0.03, `pool ${x.id}`); // ~6k samples: 3% is the honest band
  const rng2 = createRng(6), cnt = {}; // pool weights themselves over 100k picks
  for (let k = 0; k < N; k++) { const id = rng2.weighted(data.loot.pools[3]).id; cnt[id] = (cnt[id] || 0) + 1; }
  const s3 = data.loot.pools[3].reduce((a, b) => a + b.w, 0); for (const x of data.loot.pools[3]) within(cnt[x.id] / N, x.w / s3, 0.01, `pool3 ${x.id}`);
});

test('pennies: the monster range × the act; knell ×1.5; elites use their row', () => {
  const rng = createRng(2);
  for (let k = 0; k < 500; k++) { const p = rollLoot('lt_act1_fodder', { data, rng, level: 2, pennies: [1, 3] }).find(d => d.kind === 'pennies'); assert.ok(p.amount >= 1 && p.amount <= 3); }
  for (let k = 0; k < 500; k++) { const p = rollLoot('lt_act3', { data, rng, level: 12, tier: 'standard', pennies: [2, 4] }).find(d => d.kind === 'pennies'); assert.ok(p.amount >= 6 && p.amount <= 12); }
  for (let k = 0; k < 500; k++) { const p = rollLoot('lt_knell', { data, rng, level: 8, act: 2, pennies: [2, 2] }).find(d => d.kind === 'pennies'); assert.equal(p.amount, 6); }
  for (let k = 0; k < 500; k++) { const p = rollLoot('lt_act2', { data, rng, level: 8, tier: 'standard', elite: true, pennies: [1, 1] }).find(d => d.kind === 'pennies'); assert.ok(p.amount >= 50 && p.amount <= 80); }
});

test('elite step: an elite\'s first gear roll is never common from Act 2; chests keep their minimum', () => {
  const rng = createRng(12);
  for (let k = 0; k < 3000; k++) { const it = items(rollLoot('lt_act2', { data, rng, level: 8, tier: 'standard', elite: true }))[0]; if (it) assert.notEqual(it.rarity, 'common'); }
  for (let k = 0; k < 500; k++) { const it = items(rollLoot('lt_chest_rare', { data, rng, level: 12, act: 3 }))[0]; assert.equal(it.rarity, 'rare'); }
  for (let k = 0; k < 500; k++) { const it = items(rollLoot('lt_chest_rare', { data, rng, level: 3, act: 1 }))[0]; assert.equal(it.rarity, 'common'); }
  for (let k = 0; k < 500; k++) { const it = items(rollLoot('lt_chest_fine', { data, rng, level: 8, act: 2 }))[0]; if (it) assert.notEqual(it.rarity, 'common'); }
  for (let k = 0; k < 300; k++) assert.ok(items(rollLoot('lt_chest_plain', { data, rng, level: 3, act: 1 })).length === 1);
});

test('bosses: great wick, relic, dust; relics drop once, then 15% only when you no longer own one', () => {
  const rng = createRng(4), hero = createHero('lamplighter', data);
  const d = rollLoot('lt_boss_act1', { data, rng, level: 6, hero });
  assert.ok(d.some(x => x.kind === 'key' && x.id === 'great_wick_act1'));
  const relic = items(d).find(i => i.type === 'relic'); assert.equal(relic.base, 'relic_tallow_heart');
  assert.ok(d.some(x => x.kind === 'dust' && x.amount === 3)); assert.ok(items(d).filter(i => i.type === 'gear').every(i => i.rarity === 'common'));
  addToSatchel(hero, data, relic);
  for (let k = 0; k < 200; k++) assert.ok(!items(rollLoot('lt_boss_act1', { data, rng, level: 6, hero })).some(i => i.type === 'relic'));
  hero.satchel = []; let n = 0; for (let k = 0; k < 4000; k++) if (relicAllowed(data, hero, 'relic_tallow_heart', rng)) n++;
  within(n / 4000, 0.15, 0.02, 'repeat relic');
  assert.equal(rollLoot('lt_boss_act6', { data, rng, level: 30 }).filter(x => x.kind === 'item').length, 0);
  assert.ok(items(rollLoot('lt_boss_act6', { data, rng, level: 30, mode: 'bossrush' })).length === 4);
  assert.ok(rollLoot('lt_boss_act3', { data, rng, level: 15 }).some(x => x.kind === 'pearls' && x.amount === 5));
});

test('minibosses: per-enemy lines (Lockmaster relic, Sewer-King rare chest roll) plus 2 dust', () => {
  const rng = createRng(8);
  const lock = rollLoot('lt_miniboss', { data, rng, level: 13, act: 3, enemyId: 'mb_lockmaster' });
  assert.ok(items(lock).some(i => i.base === 'relic_mb_act3')); assert.ok(lock.some(x => x.kind === 'dust' && x.amount === 2));
  const king = rollLoot('lt_miniboss', { data, rng, level: 8, act: 2, enemyId: 'mb_sewer_king' });
  assert.ok(!items(king).some(i => i.type === 'relic')); assert.ok(items(king).length >= 4); // 3 miniboss rolls + the chest's
});

test('strands: the boss pick skips what you know; a known strand becomes 1 Strand Dust', () => {
  const rng = createRng(3), hero = createHero('lamplighter', data); // knows ring from the start
  for (let k = 0; k < 50; k++) { const s = rollLoot('lt_boss_act1', { data, rng, level: 6, hero }).find(x => x.kind === 'strand'); assert.ok(!s.options.includes('strand_shape_ring')); assert.ok(s.options.includes(s.id)); }
  hero.unlocked.shapes.push('arc', 'wave');
  const d = rollLoot('lt_boss_act1', { data, rng, level: 6, hero }); assert.ok(!d.some(x => x.kind === 'strand')); assert.equal(d.filter(x => x.kind === 'dust').reduce((a, b) => a + b.amount, 0), 4);
  hero.unlocked.shapes.push('beam'); const s3 = rollLoot('lt_boss_act3', { data, rng, level: 15, hero }).find(x => x.kind === 'strand');
  assert.ok(s3.options.every(id => id.startsWith('strand_charm_')));
});

test('pots: fodder pennies × act, scrap 20% of the time', () => {
  const rng = createRng(9); let scrap = 0; const N = 20000;
  for (let k = 0; k < N; k++) { const d = rollPot({ data, rng, act: 2 }); const p = d.find(x => x.kind === 'pennies'); assert.ok(p.amount >= 2 && p.amount <= 6); if (d.some(x => x.kind === 'scrap')) scrap++; }
  within(scrap / N, 0.2, 0.01, 'pot scrap');
});
