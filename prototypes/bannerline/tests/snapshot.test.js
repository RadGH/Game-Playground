// Serialise at tick N -> restore -> same hash at N+1000 (PLAN §19 test 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, config, aiVsAi, data, dataWith } from './_sim.mjs';
import { restoreSim } from '../js/sim/sim.js';

test('snapshot round-trip keeps the hash and the future', () => {
  const a = sim(aiVsAi(21), { events: false });
  for (let t = 0; t < 9000; t++) a.step([]);
  const snap = a.snapshot();
  const text = JSON.stringify(snap);
  const b = restoreSim(JSON.parse(text), data, { events: false });
  assert.equal(b.hash(), a.hash());
  assert.equal(b.tick, a.tick);
  for (let t = 0; t < 1000; t++) { a.step([]); b.step([]); }
  assert.equal(b.hash(), a.hash());
});

test('snapshot with a human slot and pending timers restores mid-fight', () => {
  const cmds = t => (t % 37 === 0 ? [{ p: 0, type: 'send', unit: 'levy' }] : t % 53 === 0 ? [{ p: 0, type: 'cast', slot: 'Q' }, { p: 0, type: 'learn', slot: 'Q' }] : []);
  const a = sim(config({ seed: 5 }), { events: false });
  for (let t = 1; t <= 4000; t++) a.step(cmds(t));
  const b = restoreSim(a.snapshot(), data, { events: false });
  for (let t = 4001; t <= 5000; t++) { a.step(cmds(t)); b.step(cmds(t)); }
  assert.equal(b.hash(), a.hash());
});

test('state is plain JSON data (no NaN/Infinity, no functions)', () => {
  const a = sim(aiVsAi(8), { events: false });
  for (let t = 0; t < 12000; t++) a.step([]);
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isFinite(v), `non-finite number at ${path}`);
    else if (typeof v === 'function') assert.fail(`function at ${path}`);
    else if (v && typeof v === 'object') {
      assert.ok(Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype, `non-plain object at ${path}`);
      for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`);
    }
  };
  walk(a.state, 'state');
});

test('a snapshot from different data is refused with a version message', () => {
  const a = sim(aiVsAi(1), { events: false });
  const other = dataWith(raw => { raw.units.units.levy.hp += 1; });
  assert.notEqual(other.hash, data.hash);
  assert.throws(() => restoreSim(a.snapshot(), other), /Version mismatch/);
});
