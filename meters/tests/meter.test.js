import { test } from 'node:test'; import assert from 'node:assert/strict';
import { Meter, simulateFight } from '../js/meter.js';
function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
test('records aggregate per actor, per source, per hit; overkill and crits are kept; dps uses the fight duration', () => {
  const m = new Meter(); m.startFight('t'); m.record({ t: 0, source: 'a', sourceName: 'A', target: 'x', kind: 'damage', amount: 10, via: 'attack', viaName: 'Sword', itemId: 'w1' }); m.record({ t: 2, source: 'a', sourceName: 'A', target: 'x', kind: 'damage', amount: 30, crit: true, overkill: 5, via: 'skill:cleave', viaName: 'Cleave', dtype: 'physical' }); m.record({ t: 4, source: 'b', sourceName: 'B', target: 'x', kind: 'damage', amount: 15, via: 'attack', viaName: 'Bow', itemId: 'w2', killingBlow: true }); m.endFight();
  const rows = m.report('damage'); assert.equal(rows[0].name, 'A'); assert.equal(rows[0].total, 40); assert.equal(rows[0].dps, 10); assert.equal(rows[0].pct, 100); assert.equal(rows[1].pct, 37.5); assert.equal(rows[0].sources[0].name, 'Cleave'); assert.equal(rows[0].sources[0].crits, 1); assert.equal(rows[0].sources[0].overkill, 5); assert.equal(rows[0].sources[0].hitsList.length, 1);
  assert.equal(m.itemStats.w2.kills, 1); assert.equal(m.itemStats.w1.damage, 10); assert.ok(m.describeHit(rows[0].sources[0].hitsList[0]).includes('crit'));
});
test('taken mode groups by target; heal mode isolates heals; all-fights scope merges', () => {
  const m = simulateFight(rng(1)); const taken = m.report('taken'); assert.ok(taken.length >= 4); assert.ok(taken[0].sources[0].name.includes(':')); const heals = m.report('heal'); assert.ok(heals.length ? heals[0].name === 'Mirelle' : true); m.startFight('two'); m.record({ t: 0, source: 'z', sourceName: 'Z', target: 'q', kind: 'damage', amount: 999, via: 'attack' }); m.endFight(); const all = m.report('damage', 'all'); assert.equal(all[0].name, 'Z'); assert.equal(m.summary('all').fights, 2);
  const j = JSON.parse(JSON.stringify(m)); const back = Meter.fromJSON(j); assert.equal(back.fights.length, 2); assert.equal(back.report('damage', 'all')[0].total, 999);
});
