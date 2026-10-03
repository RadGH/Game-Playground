// Ranger and Druid skills (M6): pen, distance bonus, snares, split, Tracker's Leap + empower,
// Arrow Storm scatter + Quarry consume, the Quarry passive; Thornlash lockout + pet heal, the
// Briarback form (stats, gore arc, onEnter taunt, per-skill overrides), Thornswell barrier +
// reflect, Call the Pack (wolves, howl) and Den Guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, config, data, hero, run, dataWith } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { heroStats } from '../js/sim/heroes.js';
import { petsOf } from '../js/sim/pets.js';

const lab = (heroId, d = data) => {
  const s = createSim(config({ players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: heroId },
    { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), d);
  const p = s.state.players[0], h = hero(s, 0);
  p.level = 6; p.skillPts = 0;
  for (const sk of p.skills) sk.rank = 1;
  h.x = s.map.fields[0].cx; h.z = 60; h.mp = h.mpMax = 9999; h._ord.k = 'stop';
  const o = hero(s, 1); o.x = s.map.fields[1].x0 + 1; o.z = 2;
  return { s, p, h };
};
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });
const put = (s, uid, dx, z, hp = 1e6) => { const f = s.map.fields[0]; const e = spawnUnit(ctxOf(s), 0, 1, uid, { x: f.cx + dx, z }); e.hp = e.hpMax = hp; e._spd = 0; return e; };
const evs = (s, type) => s.drainEvents().filter(e => e.type === type);
const cast = (s, slot, x, z) => { const sk = s.state.players[0].skills.find(k => k.slot === slot); sk.readyAt = 0; s.step([{ p: 0, type: 'cast', slot, x, z }]); };

test('Long Draw: pen closes a resistance gap; more damage the further it flies', () => {
  const { s, h } = lab('ranger');
  const near = put(s, 'gravecreeper', 0, 63), far = put(s, 'gravecreeper', 6, 72);
  near._traits = []; far._traits = [];
  s.drainEvents(); cast(s, 'Q', near.x, near.z); run(s, 10);
  const a = s.drainEvents().find(e => e.type === 'hit' && e.dst === near.id).amount;
  cast(s, 'Q', far.x, far.z); run(s, 20);
  const b = s.drainEvents().find(e => e.type === 'hit' && e.dst === far.id).amount;
  assert.ok(b > a * 1.05, `far ${b} vs near ${a}`);
  const nopen = lab('ranger', dataWith(r => { r.heroes.skills.aimed_shot.pen = 0; }));
  const n2 = put(nopen.s, 'gravecreeper', 0, 63); n2._traits = [];
  nopen.s.drainEvents(); cast(nopen.s, 'Q', n2.x, n2.z); run(nopen.s, 10);
  const c = nopen.s.drainEvents().find(e => e.type === 'hit' && e.dst === n2.id).amount;
  assert.ok(a > c, `pen ${a} vs none ${c}`);
});

test("Hunter's Snare: arms, springs on the first enemy, roots + marks Quarry; two at most", () => {
  const { s, h } = lab('ranger');
  cast(s, 'W', h.x, 66);
  assert.equal(s.state.zones.filter(z => z.kind === 'trap').length, 1);
  cast(s, 'W', h.x + 3, 66); cast(s, 'W', h.x - 3, 66);
  run(s, 1);
  assert.equal(s.state.zones.filter(z => z.kind === 'trap').length, data.heroes.skills.hunters_snare.place.max, 'oldest goes');
  const u = put(s, 'levy', 3, 66); u._spd = 0;
  s.drainEvents(); run(s, 25);
  assert.ok(s.drainEvents().some(e => e.type === 'trap'));
  assert.ok(u.statuses.some(x => x.id === 'root'));
  assert.ok(u.statuses.some(x => x.id === 'quarry'));
});

test('Broadhead Fan: 5 arrows; an arrow on Quarry splits into shards within split.range', () => {
  const { s, h } = lab('ranger');
  const t = put(s, 'iron_golem', 0, 66); const side = put(s, 'iron_golem', 4, 67); const farOne = put(s, 'iron_golem', -9, 70);
  t.statuses.push({ id: 'quarry', until: 9999, stacks: 1, power: 0.2, src: h.id });
  s.drainEvents(); cast(s, 'E', t.x, t.z);
  const bolts = s.drainEvents().filter(e => e.type === 'bolt' && e.skill === 'multi_shot');
  assert.equal(bolts.length, data.heroes.skills.multi_shot.projectiles);
  run(s, 10);
  const shards = s.drainEvents().filter(e => e.type === 'bolt' && e.shard);
  assert.ok(shards.some(e => e.dst === side.id));
  assert.ok(!shards.some(e => e.dst === farOne.id), 'beyond split.range');
});

test("Tracker's Leap: leaps back, splashes where you stood, empowers the next basic", () => {
  const { s, h } = lab('ranger');
  const u = put(s, 'iron_golem', 0, 61.5);
  const z0 = h.z;
  s.drainEvents(); cast(s, 'D', u.x, u.z);
  assert.ok(h.z < z0 - 3, 'leapt away from the aim');
  assert.ok(s.drainEvents().some(e => e.type === 'hit' && e.dst === u.id && e.skill === 'trackers_leap'));
  assert.ok(h.statuses.some(x => x.id === 'empower'));
  h._atkAt = 0; s.step([{ p: 0, type: 'attack', target: u.id }]); run(s, 15);
  assert.ok(!h.statuses.some(x => x.id === 'empower' && x.stacks > 0), 'used up');
});

test('Arrow Storm: volleys scatter; Quarry takes extra and loses the mark', () => {
  const { s, h } = lab('ranger');
  const u = put(s, 'iron_golem', 0, 68);
  u.statuses.push({ id: 'quarry', until: 9999, stacks: 1, power: 0.2, src: h.id });
  s.drainEvents(); cast(s, 'R', u.x, u.z); run(s, 90);
  const pulses = s.drainEvents().filter(e => e.type === 'pulse' && e.skill === 'rain_of_arrows');
  assert.ok(new Set(pulses.map(p => p.x)).size > 2, 'scattered');
  assert.ok(!u.statuses.some(x => x.id === 'quarry' && x.until > s.tick), 'Quarry consumed');
});

test('Quarry passive: every 4th basic attack marks the target', () => {
  const { s, h } = lab('ranger');
  const u = put(s, 'iron_golem', 0, 66);
  s.step([{ p: 0, type: 'attack', target: u.id }]); run(s, 90);
  assert.ok(u.statuses.some(x => x.id === 'quarry'));
});

test('Thornlash roots, then not again within the lockout; wolves heal on its hits', () => {
  const { s, h, p } = lab('druid');
  cast(s, 'R', h.x, 66);
  const wolves = petsOf(s.state, 0);
  assert.equal(wolves.length, 2);
  for (const w of wolves) w.hp = w.hpMax / 2;
  const u = put(s, 'iron_golem', 0, 66);
  cast(s, 'Q', u.x, u.z); run(s, 6);
  assert.ok(u.statuses.some(x => x.id === 'root'));
  assert.ok(wolves.every(w => w.hp > w.hpMax / 2), 'healPet');
  run(s, 14);
  cast(s, 'Q', u.x, u.z); run(s, 6);
  assert.ok(!u.statuses.some(x => x.id === 'root'), 'locked out');
});

test('Briarback: tougher, gores everything in its arc, taunts on entering, swaps the other skills', () => {
  const { s, h, p } = lab('druid');
  const hp0 = heroStats(data, p).hpMax, ar0 = heroStats(data, p).armor;
  const front = [put(s, 'iron_golem', -1.2, 62), put(s, 'iron_golem', 1.2, 62)], behind = put(s, 'iron_golem', 0, 57);
  front[0]._spd = front[1]._spd = 0;
  for (let i = 0; i < 8; i++) put(s, 'levy', (i - 4) * 1.2, 55);
  s.drainEvents(); cast(s, 'D');
  assert.equal(p.form, 'briarback');
  const F = data.heroes.skills.briarback_shape.form;
  assert.ok(Math.abs(heroStats(data, p).hpMax - hp0 * (1 + F.stats.maxHpPct)) < 1e-6);
  assert.ok(Math.abs(heroStats(data, p).armor - ar0 * (1 + F.stats.armorPct)) < 1e-6);
  assert.ok(s.drainEvents().filter(e => e.type === 'taunt').length >= 6, 'onEnter taunt (past the engage cap)');
  h._atkAt = 0; s.step([{ p: 0, type: 'attack', target: front[0].id }]); run(s, 3);
  const hit = s.drainEvents().filter(e => e.type === 'hit' && e.src === h.id && !e.skill).map(e => e.dst);
  assert.ok(hit.includes(front[0].id) && hit.includes(front[1].id), 'gore arc');
  assert.ok(!hit.includes(behind.id), 'not behind');
  // overrides: Bramble Gore, Thornswell, Den Guard
  s.drainEvents(); cast(s, 'Q', h.x, h.z + 3);
  assert.equal(s.drainEvents().find(e => e.type === 'cast').shape, 'melee');
  assert.ok(front.some(u => u.statuses.some(x => x.id === 'taunt')), 'Bramble Gore taunts what it hits');
  cast(s, 'W');
  const bar = h.statuses.find(x => x.id === 'barrier');
  assert.ok(Math.abs(bar.power - h.hpMax * data.heroes.skills.renew.forms.briarback.barrier.share) < 1e-6);
  cast(s, 'D'); assert.equal(p.form, null, 'toggles back');
});

test('Thornswell: the barrier soaks damage and reflects a share', () => {
  const { s, h, p } = lab('druid');
  p.form = 'briarback';
  const u = put(s, 'iron_golem', 0, 61.6);
  cast(s, 'W');
  const bar = h.statuses.find(x => x.id === 'barrier'), b0 = bar.power, uh0 = u.hp, hh0 = h.hp;
  assert.equal(bar.until - s.tick, Math.round(data.heroes.skills.renew.forms.briarback.barrier.seconds * 20), 'lasts barrier.seconds');
  run(s, 40);
  assert.ok(bar.power < b0, 'soaked');
  assert.ok(u.hp < uh0, 'reflected (on the full blow, before the barrier soaks it)');
  assert.ok(hh0 > 0);
});

test('Call the Pack: two wolves (two at most), howl Hastens them; Den Guard: wolves resist + taunt', () => {
  const { s, h, p } = lab('druid');
  cast(s, 'R', h.x, 66); cast(s, 'R', h.x, 66);
  assert.equal(petsOf(s.state, 0).length, data.heroes.pets.grove_wolf.max);
  assert.ok(petsOf(s.state, 0).every(w => w.statuses.some(x => x.id === 'haste')));
  const u = put(s, 'levy', 0, 64); u._spd = 0;
  run(s, 60);
  assert.ok(u.hp < u.hpMax || !u.alive, 'wolves fight');
  p.form = 'briarback';
  const v = put(s, 'iron_golem', petsOf(s.state, 0)[0].x - s.map.fields[0].cx + 1, petsOf(s.state, 0)[0].z);
  s.drainEvents(); cast(s, 'R');
  assert.ok(petsOf(s.state, 0).every(w => w.statuses.some(x => x.id === 'call_wolf')), 'Den Guard on the wolves');
  assert.ok(s.drainEvents().some(e => e.type === 'taunt' && e.id === v.id), 'wolves taunt');
});

test('enemy units fight wolves too', () => {
  const { s, h } = lab('druid');
  h.x = s.map.fields[0].x0 + 1; h.z = 2;
  cast(s, 'R', h.x, 66);
  const w = petsOf(s.state, 0)[0]; w.x = s.map.fields[0].cx; w.z = 60;
  const u = put(s, 'levy', 0, 58.5); u._spd = 3;
  run(s, 40);
  assert.equal(u.target === w.id || w.hp < w.hpMax, true);
});

test('Wolf form: toggles on E, faster and quicker, and the other skills become wolf abilities', () => {
  const { s, h, p } = lab('druid');
  const z0 = h.z;
  s.drainEvents(); cast(s, 'E');
  assert.equal(p.form, 'wolf');
  const F = data.heroes.skills.wolf_shape.form;
  // faster
  s.step([{ p: 0, type: 'move', x: h.x, z: 20 }]); run(s, 20);
  assert.ok(z0 - h.z > data.heroes.heroes.druid.moveSpeed * (1 + F.stats.movePct) * 0.95, 'wolf speed');
  h.z = 60;
  const u = put(s, 'iron_golem', 0, 66);
  // Throat Leap: a pounce onto the target that bleeds it
  s.drainEvents(); cast(s, 'Q', u.x, u.z);
  const ev = s.drainEvents();
  assert.ok(ev.some(e => e.type === 'dash' && e.skill === 'thornlash'));
  assert.ok(h.z > 62, 'leapt in');
  assert.ok(u.statuses.some(x => x.id === 'bleed'));
  // Rending Bite adds 2 stacks
  const b0 = u.statuses.find(x => x.id === 'bleed').stacks;
  cast(s, 'W', u.x, u.z);
  assert.equal(u.statuses.find(x => x.id === 'bleed').stacks, Math.min(5, b0 + 2));
  // Pack Run instead of Briarback; Running Howl hastes without summoning
  cast(s, 'D');
  assert.equal(p.form, 'wolf', 'D does not take the Briarback shape while a wolf');
  assert.ok(h.statuses.some(x => x.id === 'briarback_shape' && x.buff && x.buff.movePct > 0), 'Pack Run');
  cast(s, 'R');
  assert.equal(petsOf(s.state, 0).length, 0, 'no wolves summoned as a wolf');
  assert.ok(h.statuses.some(x => x.id === 'haste'));
  cast(s, 'E'); assert.equal(p.form, null);
});

test('Running Howl reaches allied heroes within its radius', () => {
  const s = createSim(config({ mode: '2v2', players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: 'druid' }, { team: 0, kind: 'human', race: 'freeholds', hero: 'warrior' },
    { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }, { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), data);
  const p = s.state.players[0], h = hero(s, 0), ally = hero(s, 1);
  p.level = 6; for (const sk of p.skills) sk.rank = 1; h.mp = 999; p.form = 'wolf';
  ally.x = h.x + 5; ally.z = h.z; ally.px = ally.x;
  s.step([{ p: 0, type: 'cast', slot: 'R' }]);
  assert.ok(ally.statuses.some(x => x.id === 'haste'));
});
