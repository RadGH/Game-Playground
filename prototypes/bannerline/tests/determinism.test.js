// Same seed + same command log -> same state hash every tick (PLAN §19 test 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, config, aiVsAi } from './_sim.mjs';
import { seedStream, next, int } from '../js/sim/rng.js';

// a scripted "human": random but seeded commands, legal and illegal
function scriptedCommands(seed) {
  const r = seedStream(seed, 'script');
  const units = ['levy', 'hill_slinger', 'shieldbearer', 'hedge_priest', 'iron_golem', 'banner_marshal', 'nope'];
  return tick => {
    const out = [];
    if (next(r) < 0.08) out.push({ p: 0, type: 'send', unit: units[int(r, units.length)] });
    if (next(r) < 0.05) out.push({ p: 0, type: 'amove', x: -44 + (next(r) - 0.5) * 40, z: 20 + next(r) * 100 });
    if (next(r) < 0.02) out.push({ p: 0, type: 'cast', slot: ['Q', 'W', 'E', 'D', 'R'][int(r, 5)], x: -44, z: 60 });
    if (next(r) < 0.01) out.push({ p: 0, type: 'learn', slot: ['Q', 'W', 'E', 'D', 'R'][int(r, 5)] });
    if (next(r) < 0.01) out.push({ p: 0, type: 'upgrade' });
    if (next(r) < 0.005) out.push({ p: 0, type: 'auto', index: int(r, 4), on: next(r) < 0.5 });
    if (next(r) < 0.004) out.push({ p: 0, type: 'moveDir', dir: int(r, 16), speed: int(r, 4) });
    if (next(r) < 0.003) out.push({ p: 1, type: 'send', unit: 'levy' });   // commands for an AI slot are refused
    return out;
  };
}

test('two sims with the same seed and commands hash the same every tick for 20 sim minutes', () => {
  const a = sim(config({ seed: 99 }), { events: false }), b = sim(config({ seed: 99 }), { events: false });
  const ca = scriptedCommands(5), cb = scriptedCommands(5);
  for (let t = 0; t < 20 * 60 * 20 && !a.over; t++) {
    a.step(ca(t)); b.step(cb(t));
    if (t % 20 === 0 || a.over) assert.equal(a.hash(), b.hash(), `hash differs at tick ${a.tick}`);
  }
  assert.equal(a.hash(), b.hash());
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test('AI vs AI full matches are reproducible, and a different seed gives a different match', () => {
  const play = seed => { const s = sim(aiVsAi(seed), { events: false }); while (!s.over && s.tick < 32 * 1200) s.step([]); return { h: s.hash(), r: s.state.result, t: s.tick }; };
  const x = play(3), y = play(3), z = play(4);
  assert.deepEqual(x, y);
  assert.notEqual(x.h, z.h);
});

test('events on or off does not change the outcome', () => {
  const a = sim(aiVsAi(11), { events: true }), b = sim(aiVsAi(11), { events: false });
  for (let t = 0; t < 6000; t++) { a.step([]); b.step([]); a.drainEvents(); }
  assert.equal(a.hash(), b.hash());
});
