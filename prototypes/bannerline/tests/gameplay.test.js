// Unit tests for the M1 game rules: economy, waves, tides, combat, heroes, commands, skills,
// talents, traits (every trait id in units.json changes the sim), and query helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, config, data, hero, run, dataWith } from './_sim.mjs';
import { spawnUnit } from '../js/sim/economy.js';
import { TRAIT_IDS } from '../js/sim/traits.js';
import { planFor } from '../js/sim/talents.js';
import * as Q from '../js/sim/query.js';

const twoHumans = (over = {}) => sim(config({ players: [
  { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' },
  { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }], ...over }));
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => { s._queue.push({ ...f, type, tick: s.state.tick }); } });
/** spawn a send of `uid` owned by player `owner` into `field` at (dx, z) relative to the field centre */
function put(s, uid, owner, field, dx, z, extra = {}) {
  const f = s.map.fields[field];
  const e = spawnUnit(ctxOf(s), field, owner, uid, { x: f.cx + dx, z });
  Object.assign(e, extra);
  return e;
}
/** park both heroes far away so they do not interfere */
function parkHeroes(s) { for (const p of s.state.players) { const h = hero(s, p.id); h.x = s.map.fields[h.field].x0 + 1; h.z = 2; h._ord.k = 'stop'; } }
const events = (s, type) => s.drainEvents().filter(e => e.type === type);

// ── economy ──────────────────────────────────────────────────────────────────────────────────
test('start gold and income come from econ.json; Pay adds income every 10 s', () => {
  const s = twoHumans();
  const p = s.state.players[0];
  assert.equal(p.gold, data.econ.start.gold);
  run(s, 199); assert.equal(p.gold, data.econ.start.gold);
  run(s, 1); assert.equal(p.gold, data.econ.start.gold + data.econ.start.income);
});

test('a send costs gold and a stock charge, adds income at once, and leaves on the next Pay into the rival field', () => {
  const s = twoHumans();
  const p = s.state.players[0], levy = data.derived.units.levy;
  s.step([{ p: 0, type: 'send', unit: 'levy' }]);
  assert.equal(p.gold, data.econ.start.gold - levy.cost);
  assert.equal(p.income, data.econ.start.income + levy.income);
  assert.equal(p.stock.find(x => x.unit === 'levy').n, levy.stock - 1);
  assert.deepEqual(p.queued, ['levy']);
  assert.ok(!s.state.ents.some(e => e.type === 'levy'));
  run(s, 199);
  const u = s.state.ents.find(e => e.type === 'levy');
  assert.ok(u, 'spawned on the Pay');
  assert.equal(u.field, 1, 'into the rival field');
  assert.equal(u.team, 0);
  assert.equal(p.queued.length, 0);
});

test('send refusals: locked tier, empty stock, not enough gold, wrong race', () => {
  const s = twoHumans();
  const rej = cmd => { s.drainEvents(); s.step([cmd]); return events(s, 'reject').map(e => e.reason)[0] || null; };
  assert.equal(rej({ p: 0, type: 'send', unit: 'shieldbearer' }), 'locked');
  assert.equal(rej({ p: 0, type: 'send', unit: 'brute' }), 'roster');
  for (let i = 0; i < 3; i++) assert.equal(rej({ p: 0, type: 'send', unit: 'levy' }), null);
  assert.equal(rej({ p: 0, type: 'send', unit: 'levy' }), 'stock');
  s.state.players[0].gold = 5;
  assert.equal(rej({ p: 0, type: 'send', unit: 'hill_slinger' }), 'gold');
});

test('stock refills one charge per restock period', () => {
  const s = twoHumans();
  s.step([{ p: 0, type: 'send', unit: 'levy' }]);
  const st = s.state.players[0].stock.find(x => x.unit === 'levy');
  run(s, st.every - 2); assert.equal(st.n, st.max - 1);
  run(s, 2); assert.equal(st.n, st.max);
});

test('tiers unlock on the clock and emit unlock events', () => {
  const s = twoHumans();
  run(s, 90 * 20 - 1); assert.equal(s.state.unlocked, 1);
  s.drainEvents(); run(s, 1);
  assert.equal(s.state.unlocked, 2);
  assert.deepEqual(events(s, 'unlock').map(e => e.tier), [2]);
});

test('auto-send buys whenever stock and gold allow', () => {
  const s = twoHumans();
  s.step([{ p: 0, type: 'auto', index: 0, on: true }]);
  assert.equal(s.state.players[0].stock.find(x => x.unit === 'levy').n, 0);
  assert.equal(s.state.players[0].queued.length, 3);
});

test('Muster ranks raise sent units, Drilled Muster makes them cheaper', () => {
  const s = twoHumans();
  const p = s.state.players[0];
  p.gold = 5000;
  s.step([{ p: 0, type: 'muster' }]);
  assert.equal(p.muster, 1);
  assert.equal(5000 - p.gold, Math.round(data.econ.muster.ranks[0].cost * data.races.traits.drilled_muster.musterCost));
  s.step([{ p: 0, type: 'send', unit: 'levy' }]);
  run(s, 200);
  const u = s.state.ents.find(e => e.type === 'levy');
  assert.ok(Math.abs(u.hpMax - data.derived.units.levy.hp * 1.1) < 1e-9);
});

test('gear steps: cheapest first, locked by time, raise hero HP and damage', () => {
  const s = twoHumans();
  const p = s.state.players[0], h = hero(s);
  const hp0 = h.hpMax;
  p.gold = 100000;
  s.step([{ p: 0, type: 'upgrade' }]);
  assert.equal(p.gear.filter(g => g === 0).length, 1);
  assert.equal(h.hpMax, hp0 + data.econ.items.tiers[0].hp);
  s.drainEvents();
  s.step([{ p: 0, type: 'upgrade', slot: 0 }]);
  assert.deepEqual(events(s, 'reject').map(e => e.reason), ['locked'], 'step 2 unlocks at 2:00');
  assert.equal(Q.gearInfo(s.state, data, 0).cheapest.cost, data.econ.items.tiers[0].cost);
});

test('bounty for a kill goes to the defending team, XP to its hero within 20 m', () => {
  const s = twoHumans();
  const h0 = hero(s, 0);
  const u = put(s, 'levy', 1, 0, h0.x - s.map.fields[0].cx, h0.z - 3);
  const g0 = s.state.players[0].gold;
  u.hp = 1;
  run(s, 30);
  assert.ok(!s.state.ents.includes(u), 'killed');
  const expect = data.derived.units.levy.cost * data.derived.units.levy.bounty;
  assert.ok(Math.abs(s.state.players[0].gold - g0 - expect) < 1e-6);
  assert.ok(s.state.players[0].xp > 0);
});

test('a unit reaching the Keep tears down banners (per purchase) and Rising Tide multiplies leaks', () => {
  const s = twoHumans();
  parkHeroes(s);
  put(s, 'shieldbearer', 1, 0, 0, 129);
  run(s, 30);
  assert.equal(s.state.teams[0].banners, data.econ.banners['1v1'] - data.units.units.shieldbearer.leak);
  assert.equal(s.state.teams[1].dealt, data.units.units.shieldbearer.leak);
  const s2 = twoHumans();
  s2.state.tick = data.econ.clock.risingTide * 20;
  parkHeroes(s2);
  put(s2, 'levy', 1, 0, 0, 129);
  run(s2, 30);
  assert.equal(s2.state.rising, 1);
  assert.equal(s2.state.teams[0].banners, data.econ.banners['1v1'] - data.econ.clock.risingLeakMult);
});

test('Tides arrive every 40 s in every field with level-scaled stats', () => {
  const s = twoHumans();
  run(s, 800);
  const tides = s.state.ents.filter(e => e.kind === 'tide');
  assert.equal(tides.length, data.econ.tide.bodies * 2);
  assert.equal(tides[0].hpMax, data.econ.tide.hpBase + data.econ.tide.hpPerLevel);
  run(s, 800);
  assert.equal(s.state.tideLevel, 2);
});

test('banners at zero ends the match; surrender ends it; the hard cap ends it', () => {
  const s = twoHumans();
  s.state.teams[1].banners = 0.5;
  parkHeroes(s);
  put(s, 'levy', 0, 1, 0, 130);
  run(s, 30);
  assert.deepEqual([s.state.result.winner, s.state.result.reason], [0, 'banners']);
  const t = twoHumans(); t.step([{ p: 1, type: 'surrender' }]);
  assert.deepEqual([t.state.result.winner, t.state.result.reason], [0, 'surrender']);
  const c = twoHumans(); c.state.tick = data.econ.clock.hardCap * 20 - 1; c.state.teams[0].banners = 10;
  c.step([]);
  assert.deepEqual([c.state.result.winner, c.state.result.reason], [1, 'cap']);
  const d = twoHumans(); d.state.tick = data.econ.clock.hardCap * 20 - 1; d.state.teams[1].dealt = 3;
  d.step([]);
  assert.equal(d.state.result.winner, 1, 'equal banners: more damage dealt to Keeps wins');
  const before = d.hash(); d.step([{ p: 0, type: 'send', unit: 'levy' }]); assert.equal(d.hash(), before, 'nothing moves after the end');
});

test('Rally: +bounty per 20% of banners behind, up to the cap', () => {
  const { rally } = awaitImport.economy;
  const s = twoHumans();
  const R = data.econ.rally;
  s.state.teams[0].banners = 70 * (1 - 0.41);
  assert.ok(Math.abs(rally(s.state, data, 0) - 2 * R.perStep) < 1e-9);
  assert.equal(rally(s.state, data, 1), 0);
  s.state.teams[0].banners = 1;
  assert.equal(rally(s.state, data, 0), R.cap);
});

test('field cap: sends past the body cap wait at the gate', () => {
  const s = twoHumans();
  parkHeroes(s);
  const fs = s.state.fields[1];
  for (let i = 0; i < data.econ.field.cap + 5; i++) fs.waiting.push({ owner: 0, unit: 'levy', group: 900 + i, body: 0, bodies: 1, slot: i, gx: s.map.fields[1].gates[0].x, gz: 3, mk: 1 });
  s.step([]);
  assert.equal(fs.bodies, data.econ.field.cap);
  assert.equal(fs.waiting.length, 5);
});

// ── combat + heroes ─────────────────────────────────────────────────────────────────────────
test('damage uses the type table and hero armour', () => {
  const s = twoHumans();
  const h = hero(s, 0);
  const light = put(s, 'levy', 1, 0, h.x - s.map.fields[0].cx + 1.2, h.z);   // light armour: blade 115%
  const heavy = put(s, 'shieldbearer', 1, 0, h.x - s.map.fields[0].cx - 1.2, h.z);   // heavy: blade 90%
  s.drainEvents();
  s.step([{ p: 0, type: 'attack', target: light.id }]);
  run(s, 25);
  const hits = events(s, 'hit').filter(e => e.src === h.id);
  const toLight = hits.find(e => e.dst === light.id);
  assert.ok(toLight);
  s.step([{ p: 0, type: 'attack', target: heavy.id }]);
  run(s, 25);
  const toHeavy = events(s, 'hit').find(e => e.src === h.id && e.dst === heavy.id);
  assert.ok(toHeavy);
  assert.ok(Math.abs(toLight.amount / toHeavy.amount - 115 / 90) < 0.02, `${toLight.amount} vs ${toHeavy.amount}`);
});

test('units walk down the field, fight a hero in their way, and ranged units shoot projectiles', () => {
  const s = twoHumans();
  parkHeroes(s);
  const u = put(s, 'levy', 1, 0, 0, 10);
  run(s, 100);
  assert.ok(u.z > 10 + 5 * 3 * 0.9, `walked to ${u.z}`);
  const h = hero(s, 0); h._ord.k = 'idle'; h.x = u.x; h.z = u.z + 3;
  const sl = put(s, 'hill_slinger', 1, 0, h.x - s.map.fields[0].cx, h.z - 8);
  s.drainEvents();
  run(s, 40);
  const ev = s.drainEvents();
  assert.ok(ev.some(e => e.type === 'attack' && e.src === u.id && e.dst === h.id), 'melee attacks the hero');
  assert.ok(ev.some(e => e.type === 'shot' && e.src === sl.id), 'slinger shoots');
});

test('at most econ.field.engagedBodies units fight one hero; the rest walk on', () => {
  const s = twoHumans();
  const h = hero(s, 0); h.x = s.map.fields[0].cx; h.z = 60; h._ord.k = 'stop';
  for (let i = 0; i < 10; i++) put(s, 'levy', 1, 0, (i - 5) * 0.8, 56, { hp: 1e6, hpMax: 1e6 });
  run(s, 5);
  const engaged = s.state.ents.filter(e => e.target === h.id).length;
  assert.equal(engaged, data.econ.field.engagedBodies);
});

test('heroes level from XP, gain a skill point per level, die and respawn at the Armory', () => {
  const s = twoHumans();
  const p = s.state.players[0], h = hero(s, 0);
  s.drainEvents();
  p.xp = data.econ.hero.xpTable[5] - 1;
  put(s, 'levy', 1, 0, h.x - s.map.fields[0].cx, h.z - 2, { hp: 1 });
  run(s, 30);
  assert.equal(p.level, 6);
  assert.equal(p.skillPts, 6);
  const ev = s.drainEvents();
  assert.equal(ev.filter(e => e.type === 'levelUp').length, 5);
  assert.ok(ev.some(e => e.type === 'talentReady'));
  h.hp = 1;
  put(s, 'iron_golem', 1, 0, h.x - s.map.fields[0].cx, h.z - 2);
  run(s, 40);
  assert.equal(h.alive, false);
  assert.ok(h.respawnAt > s.tick);
  s.drainEvents();
  s.step([{ p: 0, type: 'move', x: 0, z: 0 }]);
  assert.equal(s.drainEvents().find(e => e.type === 'reject').reason, 'dead');
  run(s, h.respawnAt - s.tick);
  assert.equal(h.alive, true);
  assert.equal(h.hp, h.hpMax);
  assert.equal(h.x, s.map.fields[0].spawn.x);
});

test('moveDir walks in the 16-direction convention (dir 8 = up the screen = -z)', () => {
  const s = twoHumans();
  const h = hero(s, 0);
  const z0 = h.z, x0 = h.x;
  s.step([{ p: 0, type: 'moveDir', dir: 8, speed: 3 }]);
  run(s, 20);
  assert.ok(h.z < z0 - 4, `z ${h.z}`);
  assert.ok(Math.abs(h.x - x0) < 0.01);
  s.step([{ p: 0, type: 'moveDir', dir: 4, speed: 0 }]);
  const z1 = h.z; run(s, 10);
  assert.equal(h.z, z1, 'speed 0 stops');
});

test('potions: buy, drink heals 40%, belt limits', () => {
  const s = twoHumans();
  const p = s.state.players[0], h = hero(s, 0);
  h.hp = h.hpMax * 0.2;
  s.step([{ p: 0, type: 'drink' }]);
  assert.ok(h.hp >= h.hpMax * 0.6 - 1e-9 && h.hp < h.hpMax * 0.602, 'heals 40% (plus one tick of regen)');
  assert.equal(p.belt, 1);
  s.drainEvents();
  s.step([{ p: 0, type: 'potion' }, { p: 0, type: 'potion' }]);
  assert.equal(p.belt, 2);
  assert.equal(events(s, 'reject')[0].reason, 'belt');
});

test('illegal and malformed commands are refused without throwing', () => {
  const s = twoHumans();
  const bad = [null, {}, { p: 9, type: 'send' }, { p: 0, type: 'warp' }, { p: 0, type: 'move', x: NaN, z: 1 }, { p: 0, type: 'cast', slot: 'Z' },
    { p: 0, type: 'attack', target: 99999 }, { p: 0, type: 'deck', units: ['levy'] }, { p: 0, type: 'auto', index: 7, on: true }, { p: 0, type: 'talent', choice: 0 },
    { p: 0, type: 'learn', slot: 'R' }, { p: 0, type: 'upgrade', slot: 'x' }];
  const h0 = s.hash();
  s.step(bad);
  const rej = events(s, 'reject');
  assert.equal(rej.length, bad.length);
  assert.ok(rej.every(r => typeof r.reason === 'string'));
  assert.notEqual(s.hash(), h0, 'the tick still advanced');
});

// ── skills + talents ────────────────────────────────────────────────────────────────────────
function skillLab(level = 1) {
  const s = twoHumans();
  const p = s.state.players[0], h = hero(s, 0);
  p.level = level; p.skillPts = 0;
  for (const sk of p.skills) sk.rank = 1;
  h.x = s.map.fields[0].cx; h.z = 60; h.mp = 999; h.mpMax = 999; h._ord.k = 'stop';
  return { s, p, h };
}

test('learning ranks follows the level rules; R needs level 6', () => {
  const s = twoHumans();
  const p = s.state.players[0];
  s.drainEvents();
  s.step([{ p: 0, type: 'learn', slot: 'R' }]);
  assert.equal(events(s, 'reject')[0].reason, 'level');
  s.step([{ p: 0, type: 'learn', slot: 'Q' }]);
  assert.equal(p.skills.find(x => x.slot === 'Q').rank, 1);
  assert.equal(p.skillPts, 0);
  p.skillPts = 1; s.drainEvents();
  s.step([{ p: 0, type: 'learn', slot: 'Q' }]);
  assert.equal(events(s, 'reject')[0].reason, 'level', 'rank 2 needs level 3');
});

test('Cleave hits everything in its radius, scales with crowd, costs mana and goes on cooldown', () => {
  const { s, p, h } = skillLab();
  const near = [put(s, 'levy', 1, 0, 2, 60, { hp: 1e5, hpMax: 1e5 }), put(s, 'levy', 1, 0, -2, 61, { hp: 1e5, hpMax: 1e5 }), put(s, 'levy', 1, 0, 0, 57, { hp: 1e5, hpMax: 1e5 })];
  const far = put(s, 'levy', 1, 0, 0, 70, { hp: 1e5, hpMax: 1e5 });
  s.drainEvents();
  const mp = h.mp;
  s.step([{ p: 0, type: 'cast', slot: 'Q' }]);
  const hits = events(s, 'hit').filter(e => e.skill === 'cleave');
  assert.deepEqual(hits.map(e => e.dst).sort(), near.map(e => e.id).sort());
  assert.ok(!hits.some(e => e.dst === far.id));
  const plan = planFor(data, p, 'cleave');
  assert.equal(Math.round((mp - h.mp) * 1000) / 1000, Math.round((plan.mp - data.heroes.heroes.warrior.mpRegen / 20) * 1000) / 1000);
  s.drainEvents(); s.step([{ p: 0, type: 'cast', slot: 'Q' }]);
  assert.equal(events(s, 'reject')[0].reason, 'cooldown');
});

test('Breaching Shove: arc only, knocks back and stuns', () => {
  const { s, h } = skillLab();
  const front = put(s, 'levy', 1, 0, 0, 62, { hp: 1e5, hpMax: 1e5 });
  const behind = put(s, 'levy', 1, 0, 0, 58, { hp: 1e5, hpMax: 1e5 });
  s.step([{ p: 0, type: 'cast', slot: 'W', x: h.x, z: h.z + 5 }]);
  assert.ok(front.z > 62 + 3, `knocked to ${front.z}`);
  assert.ok(front.statuses.some(st => st.id === 'stun'));
  assert.ok(Math.abs(behind.z - 58) < 0.7, 'behind the arc is untouched');
});

test('War Cry taunts nearby units onto the hero (past the engage cap) and grants scaled Might', () => {
  const { s, p, h } = skillLab();
  const us = [];
  for (let i = 0; i < 9; i++) us.push(put(s, 'levy', 1, 0, (i - 4) * 1.0, 54, { hp: 1e5, hpMax: 1e5 }));
  s.step([{ p: 0, type: 'cast', slot: 'E' }]);
  const might = h.statuses.find(st => st.id === 'might');
  const t = data.heroes.skills.warcry.taunt;
  assert.ok(Math.abs(might.power - (data.heroes.statuses.might.damage + Math.min(t.perTauntCap, t.perTaunt * 9))) < 1e-9);
  run(s, 2);
  assert.equal(us.filter(u => u.target === h.id).length, 9);
});

test('Iron Resolve cuts damage per nearby foe and fires a shockwave every 4th hit', () => {
  const { s, h } = skillLab();
  for (let i = 0; i < 4; i++) put(s, 'levy', 1, 0, (i - 1.5) * 1.2, 58.5, { hp: 1e5, hpMax: 1e5 });
  s.step([{ p: 0, type: 'cast', slot: 'D' }]);
  s.drainEvents();
  run(s, 60);
  const ev = s.drainEvents();
  assert.ok(ev.some(e => e.type === 'pulse' && e.skill === 'iron_resolve'), 'shockwave');
  const st = h.statuses.find(x => x.id === 'iron_resolve');
  assert.ok(st.stacks >= 4);
});

test('Iron Gyre spins 5 times through timers, bleeds and pulls', () => {
  const { s, p } = skillLab(6);
  const u = put(s, 'iron_golem', 1, 0, 3.5, 60, { hp: 1e6, hpMax: 1e6 });
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'R' }]);
  run(s, 40);
  const ev = s.drainEvents();
  assert.equal(ev.filter(e => e.type === 'hit' && e.skill === 'whirlwind').length, 5);
  assert.equal(ev.filter(e => e.type === 'pulse' && e.skill === 'whirlwind').length, 4);
  assert.ok(u.statuses.some(st => st.id === 'bleed') || ev.some(e => e.type === 'status' && e.status === 'bleed'));
});

test('rank scaling and the level-6 talent change the cast plan', () => {
  const s = twoHumans();
  const p = s.state.players[0];
  p.skills.find(x => x.slot === 'Q').rank = 3;
  const base = data.heroes.skills.cleave;
  const plan = planFor(data, p, 'cleave');
  assert.ok(Math.abs(plan.mult - base.mult * 1.4) < 1e-9);
  assert.ok(Math.abs(plan.cooldown - base.cooldown * 0.8) < 1e-9);
  p.level = 6; s.step([{ p: 0, type: 'talent', choice: 0 }]);
  const reap = planFor(data, p, 'cleave');
  assert.equal(reap.shape, 'melee'); assert.equal(reap.reach, 5.5); assert.equal(reap.knock.push, 1.5);
  const t = twoHumans(); const p2 = t.state.players[0]; p2.level = 6;
  t.step([{ p: 0, type: 'talent', choice: 1 }]);
  assert.equal(planFor(data, p2, 'cleave').pullIn.metres, 2);
  t.drainEvents(); t.step([{ p: 0, type: 'talent', choice: 0 }]);
  assert.equal(events(t, 'reject')[0].reason, 'bad', 'one pick only');
});

test('every skill description quotes its own rank-1 multiplier', () => {
  for (const [id, sk] of Object.entries(data.heroes.skills)) {
    if (sk.mult) assert.ok(sk.desc.includes(`${Math.round(sk.mult * 100)}%`), `${id}: "${sk.desc}"`);
    if (sk.selfBuff && sk.selfBuff.every) assert.ok(sk.desc.includes(`${Math.round(sk.selfBuff.every.mult * 100)}%`), id);
  }
});

// ── traits: every trait id used in data has a handler that changes the sim ─────────────────
test('every trait used in units.json is implemented', () => {
  const used = new Set(Object.values(data.units.units).flatMap(u => u.traits));
  for (const t of used) assert.ok(TRAIT_IDS.includes(t), `trait ${t} has no handler`);
});

function traitDiff(uid, setup, measure, ticks = 60) {
  // same scenario with the unit's traits and with them removed
  const go = strip => {
    const s = twoHumans();
    const e = setup(s, uid);
    if (strip) e._traits = [];
    run(s, ticks);
    return measure(s, e);
  };
  return [go(false), go(true)];
}
const heroAt = (s, z = 60) => { const h = hero(s, 0); h.x = s.map.fields[0].cx; h.z = z; h._ord.k = 'stop'; return h; };

test('trait guard: pierce damage to allies behind it is cut', () => {
  const s = twoHumans(); const ctx = ctxOf(s);
  const g = put(s, 'shieldbearer', 1, 0, 0, 62), back = put(s, 'levy', 1, 0, 0, 60);
  const { dealDamage } = awaitImport.combat;
  const a = dealDamage(ctx, null, back, 100, 'pierce');
  g._traits = [];
  const b = dealDamage(ctx, null, back, 100, 'pierce');
  assert.ok(a < b * 0.75);
});

test('trait heal / hardened / enrage / rise / feast / bleed / pounce / raise / champion / pack_call / flying / pack change the sim', () => {
  const { dealDamage } = awaitImport.combat;
  // heal
  let [w, wo] = traitDiff('hedge_priest', (s) => { parkHeroes(s); const pr = put(s, 'hedge_priest', 1, 0, 0, 20); const l = put(s, 'levy', 1, 0, 2, 20); l.hp = 10; s.__l = l; return pr; }, s => s.__l.hp);
  assert.ok(w > wo, 'heal');
  // hardened
  { const s = twoHumans(); const c = ctxOf(s); const g = put(s, 'iron_golem', 1, 0, 0, 20); const a = dealDamage(c, null, g, 100, 'blade'); const b = dealDamage(c, null, g, 100, 'blade'); assert.ok(Math.abs(a * 2 - b) < 1e-9, 'hardened'); }
  // enrage
  { const s = twoHumans(); const b = put(s, 'levy', 1, 0, 0, 20); b._traits = ['enrage']; b.hp = b.hpMax * 0.3; const { unitDamageFactor } = awaitImport.traits; assert.equal(unitDamageFactor(ctxOf(s), b), 1.5, 'enrage'); }
  // rise
  { const s = twoHumans(); const g = put(s, 'gravecreeper', 1, 0, 0, 20); dealDamage(ctxOf(s), null, g, 1e6, 'blade'); assert.ok(g.alive && g.hp === g.hpMax * 0.5, 'rise'); dealDamage(ctxOf(s), null, g, 1e6, 'blade'); assert.ok(!g.alive, 'only once'); }
  // feast
  { const s = twoHumans(); const h = heroAt(s); h.hp = 1; const gh = put(s, 'ghoul', 1, 0, 0, 58); gh.hp = gh.hpMax * 0.5; run(s, 40); assert.ok(!h.alive); assert.ok(gh.hp > gh.hpMax * 0.6, 'feast'); }
  // bleed
  { const s = twoHumans(); const h = heroAt(s); h.hp = 1e6; h.hpMax = 1e6; put(s, 'mauler', 1, 0, 0, 58); run(s, 40); assert.ok(h.statuses.some(st => st.id === 'bleed'), 'bleed'); }
  // pounce
  [w, wo] = traitDiff('saber_cat', s => { const h = heroAt(s); h.hp = 1e9; return put(s, 'saber_cat', 1, 0, 0, 54); }, (s, e) => e.z, 1);
  assert.ok(w > wo + 3, 'pounce');
  // raise
  [w, wo] = traitDiff('deathmarshal', s => { parkHeroes(s); return put(s, 'deathmarshal', 1, 0, 0, 10); }, s => s.state.ents.filter(e => e.type === 'shambler').length, 130);
  assert.ok(w > wo, 'raise');
  // pack_call
  [w, wo] = traitDiff('packlord', s => { parkHeroes(s); return put(s, 'packlord', 1, 0, 0, 10); }, s => s.state.ents.filter(e => e.type === 'wolf_pair').length, 250);
  assert.ok(w > wo, 'pack_call');
  // champion
  { const s = twoHumans(); const c = ctxOf(s); const m = put(s, 'banner_marshal', 1, 0, 0, 20); const l = put(s, 'levy', 1, 0, 3, 20); const a = dealDamage(c, null, l, 100, 'pierce'); m._traits = []; const b = dealDamage(c, null, l, 100, 'pierce'); assert.ok(a < b, 'champion escort'); }
  // flying ignores the ford
  [w, wo] = traitDiff('crow_murder', s => { parkHeroes(s); return put(s, 'crow_murder', 1, 0, 0, 64); }, (s, e) => e.z, 40);
  assert.ok(w > wo, 'flying');
  // pack: bodies per purchase
  assert.ok(data.units.units.raider_pair.bodies > 1 && data.units.units.raider_pair.traits.includes('pack'));
});

// ── query helpers ───────────────────────────────────────────────────────────────────────────
test('query helpers describe the state for the UI', () => {
  const s = twoHumans();
  const c = Q.clock(s.state, data);
  assert.equal(c.payIn, 200); assert.equal(c.nextUnlock.tier, 2);
  const deck = Q.deckInfo(s.state, data, 0);
  assert.equal(deck.length, 4);
  assert.equal(deck[0].canBuy, true);
  assert.equal(deck[2].reason, 'locked');
  const hi = Q.heroInfo(s.state, data, 0);
  assert.equal(hi.skills.length, 5); assert.equal(hi.skills[0].canLearn, true);
  assert.equal(hi.talent.choices.length, 2);
  s.step([{ p: 1, type: 'send', unit: 'levy' }, { p: 1, type: 'send', unit: 'levy' }]);
  assert.deepEqual(Q.gatePreview(s.state, data, 0), [{ player: 1, unit: 'levy', count: 2 }]);
  assert.equal(Q.teamInfo(s.state, data, 0).shown, data.econ.banners['1v1']);
  assert.equal(Q.rivalInfo(s.state, data, 0).player, 1);
  assert.equal(Q.musterInfo(s.state, data, 0).rank, 0);
  assert.equal(Q.entName(s.state, data, s.state.ents.find(e => e.kind === 'hero')), `${s.state.players[0].name} (Warrior)`);
});

test('config validation gives readable errors', () => {
  assert.throws(() => sim(config({ players: [{ team: 0, kind: 'human', race: 'elves', hero: 'warrior' }, { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] })), /Unknown race/);
  assert.throws(() => sim(config({ players: [{ team: 0, kind: 'human', race: 'freeholds', hero: 'bard' }, { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] })), /Unknown hero/);
  assert.throws(() => sim(config({ players: [{ team: 0, kind: 'human', race: 'freeholds', hero: 'warrior', deck: ['levy', 'brute', 'levy', 'levy'] }, { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] })), /not in The Freeholds/);
});

// imports used by the trait tests
const awaitImport = { combat: await import('../js/sim/combat.js'), traits: await import('../js/sim/traits.js'), economy: await import('../js/sim/economy.js') };
