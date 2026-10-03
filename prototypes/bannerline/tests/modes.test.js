// Team modes (PLAN §4.2, §19 test 1 "every mode, 6 AI slots"): 2v2 and 3v3 on vale with per-gate lanes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { spawnUnit } from '../js/sim/economy.js';

const RACES = ['freeholds', 'ashtusk', 'unburied', 'thornmane'], HEROES = ['warrior', 'pyromancer', 'ranger', 'druid'];
function cfg(mode, seed = 5, kind = 'ai') {
  const n = +mode[0], players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < n; i++) players.push({ team: t, kind, ai: { difficulty: 'veteran' }, race: RACES[(t * n + i) % 4], hero: HEROES[(t + i) % 4] });
  return { seed, mode, map: 'vale', players };
}

test('3v3 with six AI slots is deterministic to the end, and 2v2 ends too', () => {
  const play = c => { const s = createSim(c, data, { events: false }); const hs = []; while (!s.over && s.tick < 32 * 1200) { s.step([]); if (s.tick % 600 === 0) hs.push(s.hash()); } return { hs, r: s.state.result }; };
  const a = play(cfg('3v3')), b = play(cfg('3v3'));
  assert.deepEqual(a.hs, b.hs);
  assert.ok(a.r, '3v3 ends');
  assert.ok(play(cfg('2v2', 9)).r, '2v2 ends');
});

test('each sender has its own gate; lane walls keep ground units in their lane, heroes cross at the gaps', () => {
  const s = createSim(cfg('3v3', 3, 'human'), data);
  const f = s.map.fields[1];
  assert.equal(f.gates.length, 3);
  assert.equal(f.laneWalls.length, 2);
  const ctx = { state: s.state, data, map: s.map, emit: () => {} };
  // three senders on team 0 -> three different gates of field 1
  for (const pid of [0, 1, 2]) s.state.players[pid].gold = 100;
  s.step([0, 1, 2].map(p => ({ p, type: 'send', unit: data.races.races[s.state.players[p].race].units[0] })));
  for (let i = 0; i < 10; i++) s.step([]);
  const xs = s.state.ents.filter(e => e.kind === 'unit').map(e => e.x);
  const lanes = new Set(xs.map(x => Math.floor((x - f.x0) / (s.map.width / 3))));
  assert.equal(lanes.size, 3, 'one lane each');
  // a ground unit pushed at a lane wall stays out of it
  const w = f.laneWalls[0];
  const u = spawnUnit(ctx, 1, 0, 'levy', { x: w.x0 - 0.6, z: 40 });
  u._spd = 0; u.x = (w.x0 + w.x1) / 2; u.px = w.x0 - 0.8;
  s.step([]);
  assert.ok(u.x < w.x0, 'pushed back out');
  // a hero walks through a gap
  const hero = s.state.ents.find(e => e.kind === 'hero' && e.field === 1);
  const gz = (w.gaps[0].z0 + w.gaps[0].z1) / 2;
  hero.x = w.x0 - 2; hero.z = gz; hero.px = hero.x; hero.pz = hero.z;
  s.step([{ p: s.state.players.findIndex(p => p.heroEnt === hero.id), type: 'move', x: w.x1 + 3, z: gz }]);
  for (let i = 0; i < 40; i++) s.step([]);
  assert.ok(hero.x > w.x1, 'through the gap');
});

test('bounty is split across the defending team', () => {
  const s = createSim(cfg('2v2', 3, 'human'), data);
  const ctx = { state: s.state, data, map: s.map, emit: () => {} };
  const before = s.state.players.map(p => p.gold);
  const f = s.map.fields[1];
  const u = spawnUnit(ctx, 1, 0, 'levy', { x: f.cx, z: 60 });
  const { dealDamage } = awaitImport;
  dealDamage(ctx, null, u, 1e6, 'blade');
  const gain = s.state.players.map((p, i) => p.gold - before[i]);
  assert.equal(gain[0] + gain[1], 0);
  assert.ok(gain[2] > 0 && Math.abs(gain[2] - gain[3]) < 1e-9);
});

const awaitImport = await import('../js/sim/combat.js');
