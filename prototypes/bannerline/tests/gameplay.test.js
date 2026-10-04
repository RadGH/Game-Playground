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

test('a send costs gold, adds income at once, and leaves within the 0.5 s grouping window into the rival field', () => {
  const s = twoHumans();
  const p = s.state.players[0], levy = data.derived.units.levy;
  s.step([{ p: 0, type: 'send', unit: 'levy' }]);
  assert.equal(p.gold, data.econ.start.gold - levy.cost);
  assert.equal(p.income, data.econ.start.income + levy.income);
  assert.deepEqual(p.queued, ['levy']);
  run(s, 9);
  const u = s.state.ents.find(e => e.type === 'levy');
  assert.ok(u, 'out within 10 ticks, no wait for the Pay');
  assert.equal(u.field, 1, 'into the rival field');
  assert.equal(u.team, 0);
  assert.equal(p.queued.length, 0);
});

test('buying is limited only by gold: no stock, no time locks, any tier at once', () => {
  const s = twoHumans();
  const p = s.state.players[0];
  p.gold = 100000;
  const cmds = [];
  for (let i = 0; i < 25; i++) cmds.push({ p: 0, type: 'send', unit: 'levy' });
  cmds.push({ p: 0, type: 'send', unit: 'banner_marshal' }, { p: 0, type: 'send', unit: 'banner_marshal' });
  s.drainEvents();
  s.step(cmds);
  assert.equal(events(s, 'reject').length, 0, 'nothing refused at tick 1');
  assert.equal(p.queued.length, 27);
  const rej = cmd => { s.drainEvents(); s.step([cmd]); return events(s, 'reject').map(e => e.reason)[0] || null; };
  assert.equal(rej({ p: 0, type: 'send', unit: 'brute' }), 'roster');
  p.gold = 5;
  assert.equal(rej({ p: 0, type: 'send', unit: 'hill_slinger' }), 'gold');
});

test('a field at its body cap holds extra sends in the gate queue (never refused), oldest first', () => {
  const s = twoHumans();
  const p = s.state.players[0];
  p.gold = 1e6;
  const cmds = [];
  for (let i = 0; i < data.econ.field.cap + 12; i++) cmds.push({ p: 0, type: 'send', unit: 'levy' });
  s.drainEvents();
  s.step(cmds);
  assert.equal(events(s, 'reject').length, 0);
  run(s, 10);
  assert.equal(s.state.fields[1].bodies, data.econ.field.cap);
  assert.equal(Q.gateQueue(s.state, 1), 12);
  assert.equal(Q.teamInfo(s.state, data, 1).waiting, 12);
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
  assert.equal(rally(s.state, data, 0), R.cap);  // the knobs are really read: odd values change the answer
  const odd = dataWith(raw => { raw.econ.rally.behindStep = 0.13; raw.econ.rally.perStep = 0.07; raw.econ.rally.cap = 0.9; });
  s.state.teams[0].banners = 70 * (1 - 0.41);
  assert.ok(Math.abs(rally(s.state, odd, 0) - 3 * 0.07) < 1e-9);
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
  const front = put(s, 'levy', 1, 0, 0, 62, { hp: 1e5, hpMax: 1e5, _spd: 0 });
  const behind = put(s, 'levy', 1, 0, 0, 58, { hp: 1e5, hpMax: 1e5 });
  s.step([{ p: 0, type: 'cast', slot: 'W', x: h.x, z: h.z + 5 }]);
  assert.ok(front.statuses.some(st => st.id === 'stun'));
  assert.ok(front.z < 62 + 2, 'a push, not a teleport: one tick of slide on the cast tick');
  run(s, 25);
  assert.ok(front.z > 62 + 3, `slid to ${front.z}`);
  assert.equal(front._kvx, 0); assert.equal(front._kvz, 0);
  assert.ok(Math.abs(behind.z - 58) < 0.7, 'behind the arc is untouched');
});

test('a pushed body shoves the body it runs into; a wall stops it', () => {
  const { s, h } = skillLab();
  const front = put(s, 'levy', 1, 0, 0, 62, { hp: 1e5, hpMax: 1e5 }), next = put(s, 'levy', 1, 0, 0, 63.3, { hp: 1e5, hpMax: 1e5 });
  front._spd = next._spd = 0;
  s.step([{ p: 0, type: 'cast', slot: 'W', x: h.x, z: h.z + 5 }]);
  run(s, 30);
  assert.ok(next.z > 64.5, `the second body was shoved to ${next.z}`);
  // the field edge stops a push
  const t = skillLab(); const e = put(t.s, 'levy', 1, 0, 0, 62, { hp: 1e5, hpMax: 1e5 });
  t.h.x = t.s.map.fields[0].x1 - 3; t.h.z = 62; e.x = t.s.map.fields[0].x1 - 1.2; e._spd = 0;
  t.s.step([{ p: 0, type: 'cast', slot: 'W', x: t.s.map.fields[0].x1, z: 62 }]);
  run(t.s, 30);
  assert.ok(e.x <= t.s.map.fields[0].x1 - e.r + 1e-9, 'stopped at the edge');
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

test('new traits: ward, unstoppable, volatile, regrow, shred, split, stealth each change the sim', () => {
  const { dealDamage } = awaitImport.combat;
  // ward: hero skills hit it 30% softer, basic attacks do not
  { const s = twoHumans(); const c = ctxOf(s); const w = put(s, 'lantern_warden', 1, 0, 0, 20);
    const sk = dealDamage(c, null, w, 100, 'blade', { skill: 'cleave' }); const ba = dealDamage(c, null, w, 100, 'blade');
    assert.ok(Math.abs(sk / ba - 0.7) < 1e-9, 'ward'); }
  // unstoppable: no stun / root / slow / taunt / knockback
  { const { s, h } = skillLab(); const u = put(s, 'halberdier', 1, 0, 0, 62, { hp: 1e5, hpMax: 1e5 });
    s.step([{ p: 0, type: 'cast', slot: 'W', x: h.x, z: h.z + 5 }]);
    assert.ok(!u.statuses.some(x => x.id === 'stun'), 'no stun'); assert.ok(u.z < 63, 'no knockback'); }
  // volatile: bursts on the hero when it dies
  { const s = twoHumans(); const h = hero(s, 0); h.x = s.map.fields[0].cx; h.z = 60; h._ord.k = 'stop';
    const v = put(s, 'pyre_runner', 1, 0, 0, 58.5); v.hp = 1; s.drainEvents(); run(s, 25);
    assert.ok(s.drainEvents().some(e => e.type === 'hit' && e.dst === h.id && e.src === -1), 'volatile burst'); }
  // regrow
  { const s = twoHumans(); parkHeroes(s); const b = put(s, 'bear_warden', 1, 0, 0, 20); b.hp = b.hpMax / 2; b._spd = 0; run(s, 40);
    assert.ok(b.hp > b.hpMax / 2, 'regrow'); }
  // shred: strips hero armour
  { const s = twoHumans(); const h = hero(s, 0); h.x = s.map.fields[0].cx; h.z = 60; h.hp = h.hpMax = 1e6; h._ord.k = 'stop';
    const a0 = awaitImport.heroes.heroArmor(ctxOf(s), h); put(s, 'skullsplitter', 1, 0, 0, 58.5, { hp: 1e6, hpMax: 1e6 }); run(s, 40);
    assert.ok(awaitImport.heroes.heroArmor(ctxOf(s), h) < a0, 'shred'); }
  // split: two shamblers when it dies
  { const s = twoHumans(); parkHeroes(s); const c = ctxOf(s); const hk = put(s, 'carrion_hulk', 1, 0, 0, 20);
    dealDamage(c, null, hk, 1e7, 'blade'); assert.equal(s.state.ents.filter(e => e.type === 'shambler' && e.alive && !e._gone).length, 2, 'split'); }
  // stealth: the hero does not notice it from 6 m, does at 2 m
  { const s = twoHumans(); const h = hero(s, 0); h.x = s.map.fields[0].cx; h.z = 60; h._ord.k = 'idle';
    const st = put(s, 'briar_stalker', 1, 0, 0, 54, { hp: 1e5, hpMax: 1e5 }); st._spd = 0; run(s, 3);
    assert.notEqual(h.target, st.id, 'hidden at 6 m'); st.z = 58.2; run(s, 3); assert.equal(h.target, st.id, 'seen at 2 m'); }
});

test('a human wave that counters the defence sends the defender a counter notice (throttled)', () => {
  const s = twoHumans();
  s.state.players[0].gold = 1e5;
  const wave = () => { const c = []; for (let i = 0; i < 3; i++) c.push({ p: 0, type: 'send', unit: 'halberdier' }); return c; };
  s.drainEvents(); s.step(wave()); run(s, 12);
  const ev = s.drainEvents().filter(e => e.type === 'counter');
  assert.equal(ev.length, 1);
  assert.equal(ev[0].player, 0); assert.equal(ev[0].target, 1); assert.equal(ev[0].unit, 'halberdier'); assert.equal(ev[0].count, 3);
  assert.ok(ev[0].reason.length > 5 && ev[0].key);
  s.step(wave()); run(s, 12);
  assert.equal(s.drainEvents().filter(e => e.type === 'counter').length, 0, 'throttled');
  const t = twoHumans(); t.state.players[0].gold = 1e5;
  t.drainEvents(); t.step([{ p: 0, type: 'send', unit: 'levy' }, { p: 0, type: 'send', unit: 'levy' }]); run(t, 12);
  assert.equal(t.drainEvents().filter(e => e.type === 'counter').length, 0, 'no notice for a wave that does not counter');
});

test('the Keep guard splashes a swarm near the Keep; a big unit walks through; it hits harder later', () => {
  const s = twoHumans();
  parkHeroes(s);
  const f = s.map.fields[0], G = f.keep.guard;
  assert.ok(G && G.range > 0);
  const swarm = [];
  for (let i = 0; i < 6; i++) swarm.push(put(s, 'levy', 1, 0, (i - 3) * 0.8, f.keep.z - 12, { _spd: 0 }));
  const golem = put(s, 'iron_golem', 1, 0, 6, f.keep.z - 12, { _spd: 0 });
  const far = put(s, 'levy', 1, 0, 0, 40, { _spd: 0 });
  s.drainEvents();
  run(s, 220);
  assert.ok(events(s, 'keepShot').length >= 3);
  assert.ok(swarm.every(u => !s.state.ents.includes(u)), 'the swarm melted');
  assert.ok(s.state.ents.includes(golem) && golem.hp > golem.hpMax * 0.8, 'the golem walks on');
  assert.ok(s.state.ents.includes(far) && far.hp === far.hpMax, 'out of range');
  // damage grows with time
  const late = twoHumans(); parkHeroes(late); late.state.tick = 20 * 60 * 20;
  const g2 = put(late, 'iron_golem', 1, 0, 0, f.keep.z - 12, { _spd: 0 });
  late.drainEvents(); run(late, 20);
  const hits = late.drainEvents().filter(e => e.type === 'hit' && e.skill === 'keep');
  assert.ok(hits.length && hits[0].amount > G.damage * 2);
  assert.ok(g2.hp < g2.hpMax);
});

// ── query helpers ───────────────────────────────────────────────────────────────────────────
test('query helpers describe the state for the UI', () => {
  const s = twoHumans();
  const c = Q.clock(s.state, data);
  assert.equal(c.payIn, 200);
  const ros = Q.roster(s.state, data, 0);
  assert.equal(ros.length, 12);
  const sb = ros.find(r => r.unit === 'shieldbearer');
  assert.equal(ros.find(r => r.unit === 'gate_warden').reason, 'gold');
  assert.ok(sb.paybackSeconds > 0 && sb.traitsText.length === 1 && sb.counters.lines.length > 0 && sb.roleText);
  assert.equal(ros.find(r => r.unit === 'banner_marshal').paybackSeconds, null, 'champions add no income');
  assert.equal(typeof sb.vsRival.taken, 'number');
  const hi = Q.heroInfo(s.state, data, 0);
  assert.equal(hi.skills.length, 5); assert.equal(hi.skills[0].canLearn, true);
  assert.equal(hi.talent.choices.length, 2);
  s.step([{ p: 1, type: 'send', unit: 'levy' }, { p: 1, type: 'send', unit: 'levy' }]);
  assert.deepEqual(Q.gatePreview(s.state, data, 0), [{ player: 1, unit: 'levy', count: 2 }], 'sends in the grouping window');
  assert.equal(Q.teamInfo(s.state, data, 0).shown, data.econ.banners['1v1']);
  assert.equal(Q.rivalInfo(s.state, data, 0).player, 1);
  assert.equal(Q.entName(s.state, data, s.state.ents.find(e => e.kind === 'hero')), `${s.state.players[0].name} (Warrior)`);
});

test('config validation gives readable errors', () => {
  assert.throws(() => sim(config({ players: [{ team: 0, kind: 'human', race: 'elves', hero: 'warrior' }, { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] })), /Unknown race/);
  assert.throws(() => sim(config({ players: [{ team: 0, kind: 'human', race: 'freeholds', hero: 'bard' }, { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] })), /Unknown hero/);
  assert.throws(() => sim(config({ mode: 'tag' })), /Unknown game mode/);
  assert.throws(() => sim(config({ mode: 'linewar', format: '5v5' })), /no format/);
  assert.throws(() => sim(config({ mode: 'linewar', format: '1v1', players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' }, { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' },
    { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] })), /allows 1 player/);
});

// imports used by the trait tests
const awaitImport = { combat: await import('../js/sim/combat.js'), traits: await import('../js/sim/traits.js'), economy: await import('../js/sim/economy.js'), heroes: await import('../js/sim/heroes.js') };
