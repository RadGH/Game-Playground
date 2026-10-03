// Pyromancer skills: bolt, ground (line + delay), pools, burn stacking, detonate, trail; Oil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, config, data, hero, run } from './_sim.mjs';
import { spawnUnit } from '../js/sim/economy.js';
import { planFor } from '../js/sim/talents.js';

const lab = (heroId = 'pyromancer') => {
  const s = sim(config({ players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: heroId },
    { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }));
  const p = s.state.players[0], h = hero(s, 0);
  p.level = 6; p.skillPts = 0;
  for (const sk of p.skills) sk.rank = 1;
  h.x = s.map.fields[0].cx; h.z = 60; h.mp = 999; h.mpMax = 999; h._ord.k = 'stop';
  const o = hero(s, 1); o.x = s.map.fields[1].x0 + 1; o.z = 2;
  return { s, p, h };
};
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });
const put = (s, uid, dx, z, hp = 1e6) => { const f = s.map.fields[0]; const e = spawnUnit(ctxOf(s), 0, 1, uid, { x: f.cx + dx, z }); e.hp = e.hpMax = hp; e._spd = 0; return e; };
const evs = (s, type) => s.drainEvents().filter(e => e.type === type);

test('Firebolt flies to the first enemy on its line, splashes, and stacks Burning', () => {
  const { s, h } = lab();
  const a = put(s, 'levy', 0, 66), b = put(s, 'levy', 1.5, 66.5), far = put(s, 'levy', 0, 72);
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'Q', x: h.x, z: 80 }]);
  const bolt = evs(s, 'bolt')[0];
  assert.equal(bolt.dst, a.id, 'stops at the first body');
  assert.ok(bolt.ticks >= 1);
  run(s, bolt.ticks + 1);
  const hits = s.drainEvents().filter(e => e.type === 'hit' && e.skill === 'firebolt').map(e => e.dst);
  assert.ok(hits.includes(a.id) && hits.includes(b.id), 'splash');
  assert.ok(!hits.includes(far.id));
  assert.equal(a.statuses.find(x => x.id === 'burn').stacks, 1);
  // stacks up to the max
  for (let i = 0; i < 6; i++) { s.state.players[0].skills[0].readyAt = 0; s.step([{ p: 0, type: 'cast', slot: 'Q', x: h.x, z: 80 }]); run(s, 10); }
  assert.equal(a.statuses.find(x => x.id === 'burn').stacks, data.heroes.skills.firebolt.stack.max);
});

test('Burning deals damage over time from the stacks', () => {
  const { s, h } = lab();
  const a = put(s, 'levy', 0, 66);
  s.step([{ p: 0, type: 'cast', slot: 'Q', x: h.x, z: 80 }]);
  run(s, 10);
  const hp0 = a.hp;
  s.drainEvents();
  run(s, 40);
  const dots = s.drainEvents().filter(e => e.type === 'hit' && e.dst === a.id && !e.skill);
  assert.ok(dots.length >= 3, `burn ticks ${dots.length}`);
  assert.ok(a.hp < hp0);
});

test('Cinder Spray fans three bolts; Slow Burner leaves a fire patch', () => {
  const { s, p, h } = lab();
  s.step([{ p: 0, type: 'talent', choice: 0 }]);
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'Q', x: h.x, z: 80 }]);
  assert.equal(evs(s, 'bolt').length, 3);
  assert.ok(Math.abs(planFor(data, p, 'firebolt').mult - data.heroes.skills.firebolt.mult * 0.65) < 1e-9);
  const t = lab(); t.s.step([{ p: 0, type: 'talent', choice: 1 }]);
  put(t.s, 'levy', 0, 66);
  t.s.drainEvents();
  t.s.step([{ p: 0, type: 'cast', slot: 'Q', x: t.h.x, z: 80 }]);
  run(t.s, 10);
  assert.equal(t.s.drainEvents().filter(e => e.type === 'zone' && e.skill === 'firebolt').length, 1);
  assert.equal(t.s.state.zones.length, 1);
});

test('Burning Line hits a line across the aim, then burns for its pool time', () => {
  const { s, h } = lab();
  const onLine = [put(s, 'levy', -4, 70), put(s, 'levy', 0, 70), put(s, 'levy', 4, 70)];
  const off = put(s, 'levy', 0, 75);
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'W', x: h.x, z: 70 }]);
  const hits = s.drainEvents().filter(e => e.type === 'hit' && e.skill === 'fire_wall').map(e => e.dst);
  for (const u of onLine) assert.ok(hits.includes(u.id), 'across the aim');
  assert.ok(!hits.includes(off.id));
  assert.equal(onLine[1].statuses.find(x => x.id === 'burn').stacks, 2);
  const z = s.state.zones[0];
  assert.equal(z.length, 10);
  run(s, 30);
  assert.ok(s.drainEvents().some(e => e.type === 'hit' && e.skill === 'fire_wall' && e.dst === onLine[0].id), 'the line keeps burning');
  run(s, 100);
  assert.equal(s.state.zones.length, 0, 'and goes out');
});

test('ground skills are clamped to range', () => {
  const { s, h, p } = lab();
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'E', x: h.x, z: 130 }]);
  const c = evs(s, 'cast')[0];
  const range = planFor(data, p, 'flashover').range;
  assert.ok(Math.abs(Math.sqrt((c.x - h.x) ** 2 + (c.z - h.z) ** 2) - range) < 0.01);   // eslint-disable-line
});

test('Flashover sets off Burning for a share of what it had left, keeping one stack', () => {
  const { s, h } = lab();
  const a = put(s, 'levy', 0, 66);
  for (let i = 0; i < 4; i++) { s.state.players[0].skills[0].readyAt = 0; s.step([{ p: 0, type: 'cast', slot: 'Q', x: h.x, z: 80 }]); run(s, 6); }
  const burn = a.statuses.find(x => x.id === 'burn');
  assert.ok(burn.stacks >= 3);
  const left = (burn.until - s.tick - 1) / 20 * burn.power * burn.stacks;
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'E', x: a.x, z: a.z }]);
  const det = s.drainEvents().filter(e => e.type === 'hit' && e.skill === 'flashover' && e.dst === a.id);
  assert.equal(det.length, 2, 'detonation + impact');
  assert.ok(det.some(e => Math.abs(e.amount - left * data.heroes.skills.flashover.detonate.share) < Math.max(2, left * 0.05)), `detonation ~${(left * 0.6).toFixed(1)}: ${det.map(e => e.amount)}`);
  assert.equal(a.statuses.find(x => x.id === 'burn').stacks, 1);
});

test('Fallstone lands after its delay', () => {
  const { s, h } = lab();
  const a = put(s, 'levy', 0, 70);
  s.drainEvents();
  s.step([{ p: 0, type: 'cast', slot: 'R', x: a.x, z: a.z }]);
  assert.equal(s.drainEvents().filter(e => e.type === 'hit').length, 0, 'nothing yet');
  run(s, Math.round(data.heroes.skills.meteor.delay * 20));
  const hits = s.drainEvents().filter(e => e.type === 'hit' && e.skill === 'meteor');
  assert.equal(hits.length, 1);
  assert.equal(a.statuses.find(x => x.id === 'burn').stacks, 3);
});

test('Cinder Stride: faster, burning trail behind, a pool where it started', () => {
  const { s, h } = lab();
  s.step([{ p: 0, type: 'cast', slot: 'D' }]);
  assert.equal(s.state.zones.length, 1, 'start pool');
  s.step([{ p: 0, type: 'move', x: h.x, z: 20 }]);
  const z0 = h.z;
  run(s, 40);
  assert.ok(z0 - h.z > 2 * 5 * 1.15, 'moves faster than walking');
  assert.ok(s.state.zones.length >= 4, `trail zones ${s.state.zones.length}`);
});
