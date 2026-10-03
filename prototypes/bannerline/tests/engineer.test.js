// Engineer (owner round 2, R2.8): turrets 1/2/3 by rank that shoot, can be destroyed and expire;
// Shrapnel Mine; Field Repair; Grapnel; Overcharge; the two Bolt Turret talents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data, config, hero, run } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';
import { turretsOf } from '../js/sim/turrets.js';
import { planFor } from '../js/sim/talents.js';

const lab = () => {
  const s = createSim(config({ players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: 'engineer' },
    { team: 1, kind: 'human', race: 'freeholds', hero: 'warrior' }] }), data);
  const p = s.state.players[0], h = hero(s, 0);
  p.level = 11; p.skillPts = 0;
  for (const sk of p.skills) sk.rank = 1;
  h.x = s.map.fields[0].cx; h.z = 60; h.mp = h.mpMax = 9999; h._ord.k = 'stop';
  const o = hero(s, 1); o.x = s.map.fields[1].x0 + 1; o.z = 2;
  return { s, p, h };
};
const ctxOf = s => ({ state: s.state, data: s.data, map: s.map, emit: (type, f) => s._queue.push({ ...f, type, tick: s.state.tick }) });
const put = (s, uid, dx, z, hp = 1e6) => { const f = s.map.fields[0]; const e = spawnUnit(ctxOf(s), 0, 1, uid, { x: f.cx + dx, z }); e.hp = e.hpMax = hp; return e; };
const cast = (s, slot, x, z) => { const sk = s.state.players[0].skills.find(k => k.slot === slot); sk.readyAt = 0; s.step([{ p: 0, type: 'cast', slot, x, z }]); };

test('Bolt Turret: one at rank 1, two at rank 2, three at rank 3; building past the limit takes down the oldest', () => {
  const { s, p, h } = lab();
  const T = data.heroes.skills.bolt_turret.turret;
  for (const rank of [1, 2, 3]) {
    p.skills.find(k => k.slot === 'Q').rank = rank;
    for (let i = 0; i < 4; i++) cast(s, 'Q', h.x + i, 64);
    run(s, 1);
    assert.equal(turretsOf(s.state, 0).length, T.max[rank - 1], `rank ${rank}`);
  }
});

test('a turret shoots enemies in range, can be destroyed, and expires', () => {
  const { s, h } = lab();
  cast(s, 'Q', h.x, 64);
  const t = turretsOf(s.state, 0)[0];
  assert.equal(t.kind, 'turret');
  const u = put(s, 'levy', 0, 70); u._spd = 0;
  s.drainEvents(); run(s, 60);
  assert.ok(s.drainEvents().some(e => e.type === 'shot' && e.src === t.id), 'shoots');
  assert.ok(u.hp < u.hpMax);
  assert.equal(t.x, s.map.fields[0].cx, 'never moves');
  // destroyed by units
  const b = put(s, 'iron_golem', 0, 65.2); b._spd = 3;
  t.hp = 50; run(s, 60);
  assert.ok(!s.state.ents.includes(t), 'destroyed');
  // expires
  const { s: s2, h: h2 } = lab();
  cast(s2, 'Q', h2.x, 64);
  run(s2, data.heroes.skills.bolt_turret.turret.seconds * 20 + 2);
  assert.equal(turretsOf(s2.state, 0).length, 0);
});

test('Shrapnel Mine springs and slows; Field Repair heals turrets; Overcharge speeds them up; Grapnel pulls the hero', () => {
  const { s, h } = lab();
  cast(s, 'W', h.x, 66); run(s, 25);
  const u = put(s, 'levy', 0, 66); u._spd = 0;
  s.drainEvents(); run(s, 3);
  assert.ok(s.drainEvents().some(e => e.type === 'trap'));
  assert.ok(u.statuses.some(x => x.id === 'slow'));
  cast(s, 'Q', h.x + 2, 62);
  const t = turretsOf(s.state, 0)[0];
  t.hp = t.hpMax * 0.3;
  cast(s, 'E');
  assert.ok(Math.abs(t.hp - t.hpMax * (0.3 + data.heroes.skills.field_repair.repair.share)) < 1e-6);
  cast(s, 'R');
  assert.ok(t.statuses.some(x => x.id === 'overcharge' && x.buff.attackSpeed > 0));
  const z0 = h.z;
  cast(s, 'D', h.x, h.z - 20);
  assert.ok(z0 - h.z > data.heroes.skills.grapnel.dash.range - 0.5, 'pulled toward the aim');
});

test('Field Repair repairs only turrets within its radius', () => {
  const { s, h } = lab();
  s.state.players[0].skills.find(k => k.slot === 'Q').rank = 2;
  cast(s, 'Q', h.x, 63); cast(s, 'Q', h.x, 63);
  const [near, far] = turretsOf(s.state, 0);
  far.x = h.x + data.heroes.skills.field_repair.repair.radius + 2;
  near.hp = near.hpMax / 2; far.hp = far.hpMax / 2;
  cast(s, 'E');
  assert.ok(near.hp > near.hpMax / 2); assert.equal(far.hp, far.hpMax / 2);
});

test('three mines at most: a fourth takes up the oldest', () => {
  const { s, h } = lab();
  for (let i = 0; i < 4; i++) cast(s, 'W', h.x + i * 2 - 3, 66);
  run(s, 1);
  assert.equal(s.state.zones.filter(z => z.kind === 'trap').length, data.heroes.skills.shrapnel_mine.place.max);
});

test('Bolt Turret talents change the turret', () => {
  const { s, p } = lab();
  p.level = 6;
  s.step([{ p: 0, type: 'talent', choice: 1 }]);
  const pl = planFor(data, p, 'bolt_turret');
  assert.ok(pl.turret.hp > data.heroes.skills.bolt_turret.turret.hp && pl.turret.seconds > data.heroes.skills.bolt_turret.turret.seconds);
});

test('an AI Engineer builds turrets and they fight', () => {
  const s = createSim(config({ seed: 4, players: [
    { team: 0, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'freeholds', hero: 'engineer' },
    { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'ashtusk', hero: 'warrior' }] }), data);
  let built = 0, shots = 0;
  while (!s.over && s.tick < 12 * 1200) { s.step([]); for (const e of s.drainEvents()) { if (e.type === 'spawn' && e.kind === 'turret') built++; if (e.type === 'shot' && s.state.ents.find(x => x.id === e.src && x.kind === 'turret')) shots++; } }
  assert.ok(built >= 2 && shots > 10, `built ${built}, shots ${shots}`);
});
