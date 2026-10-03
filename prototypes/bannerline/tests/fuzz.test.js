// Fuzz (PLAN §19 test 7): random and illegal commands from every slot for 5 sim minutes — no throw,
// no NaN anywhere in state, and two sims fed the same garbage stay hash-identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';
import { seedStream, next, int } from '../js/sim/rng.js';

const TYPES = ['move', 'amove', 'attack', 'stop', 'moveDir', 'cast', 'learn', 'talent', 'send', 'surrender', 'toll', 'buy', 'sell', 'swap', 'use', 'upgradeUnit', 'power', 'nonsense', null];
function garbage(r, players, ents) {
  const out = [];
  const n = int(r, 4);
  for (let i = 0; i < n; i++) {
    const v = () => [next(r) * 200 - 100, NaN, Infinity, -1, 'x', null, undefined, 1e9, 3.5][int(r, 9)];
    const type = TYPES[int(r, TYPES.length)];
    if (type === 'surrender' && next(r) < 0.98) continue;   // keep most runs going
    out.push({
      p: next(r) < 0.95 ? int(r, players) : v(), type,
      x: v(), z: v(), target: next(r) < 0.5 && ents.length ? ents[int(r, ents.length)].id : v(),
      slot: ['Q', 'W', 'E', 'D', 'R', 'Z', 0, 3, 7, -1][int(r, 10)],
      unit: next(r) < 0.6 ? Object.keys(data.units.units)[int(r, 48)] : v(),
      dir: v(), speed: v(), choice: [0, 1, 2, -1][int(r, 4)], id: v(), a: v(), b: v(),
    });
  }
  return out;
}

test('random and illegal commands for 5 minutes in 2v2: no throw, no NaN, two sims agree', () => {
  const cfg = { seed: 77, mode: 'linewar', format: '2v2', players: [
    { team: 0, kind: 'human', race: 'freeholds', hero: 'engineer' }, { team: 0, kind: 'human', race: 'unburied', hero: 'druid' },
    { team: 1, kind: 'human', race: 'ashtusk', hero: 'ranger' }, { team: 1, kind: 'ai', ai: { difficulty: 'veteran' }, race: 'thornmane', hero: 'pyromancer' }] };
  const a = createSim(cfg, data, { events: false }), b = createSim(cfg, data, { events: false });
  const ra = seedStream(5, 'fuzz'), rb = seedStream(5, 'fuzz');
  for (const p of a.state.players) p.gold = 1e5;
  for (const p of b.state.players) p.gold = 1e5;
  for (let t = 0; t < 5 * 60 * 20 && !a.over; t++) {
    a.step(garbage(ra, 4, a.state.ents));
    b.step(garbage(rb, 4, b.state.ents));
    if (t % 200 === 0) assert.equal(a.hash(), b.hash(), `tick ${a.tick}`);
  }
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `non-finite at ${path}`);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
  };
  walk(a.state, 'state');
});
