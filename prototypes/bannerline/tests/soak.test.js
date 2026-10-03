// Soak (PLAN §19 test 12, §15.1): a long 3v3 with six AI slots and the Rising Tide running, endless so
// it never stops early: the tick stays inside the 2 ms budget and state does not grow without bound.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { data } from './_sim.mjs';
import { createSim } from '../js/sim/sim.js';

const RACES = ['freeholds', 'ashtusk', 'unburied', 'thornmane'], HEROES = ['warrior', 'pyromancer', 'ranger', 'druid', 'engineer'];

test('40-minute 3v3 soak: under 2 ms a tick, state size bounded', () => {
  const players = [];
  for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) players.push({ team: t, kind: 'ai', ai: { difficulty: 'veteran' }, race: RACES[(t * 3 + i) % 4], hero: HEROES[(t * 3 + i) % 5] });
  const s = createSim({ seed: 31, mode: 'linewar', format: '3v3', players, rules: { endless: true } }, data, { events: false });
  const sizes = [];
  const t0 = process.hrtime.bigint();
  for (let t = 0; t < 40 * 60 * 20; t++) {
    s.step([]);
    if (t % (5 * 60 * 20) === 0) sizes.push(JSON.stringify(s.state).length);
  }
  const msPerTick = Number(process.hrtime.bigint() - t0) / 1e6 / (40 * 60 * 20);
  assert.ok(msPerTick < 2, `${msPerTick.toFixed(3)} ms a tick`);
  // state grows with the field (bodies are capped, waiting queues exist), not without bound
  const late = sizes.slice(-3);
  assert.ok(Math.max(...late) < 3 * Math.min(...late) + 200000, `state sizes ${sizes.join(', ')}`);
  for (const f of s.state.fields) assert.ok(f.bodies <= data.econ.field.cap);
  assert.ok(s.state.timers.length < 5000 && s.state.zones.length < 500, `timers ${s.state.timers.length} zones ${s.state.zones.length}`);
});
