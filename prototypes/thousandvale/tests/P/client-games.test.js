// W9 (P-client): the eight profession mini-games as pure state machines (js/client/ui/prof-games.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_IDS, GAME_OF, createRun, autoplay, replay, maxSeconds, qualityOf, specFor, HOW, GAME_INPUT, DEFAULTS } from '../../js/client/ui/prof-games.js';

const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234, 20261007, 555];

test('eight professions, eight different games, each with a how-to line for every device', () => {
  assert.equal(Object.keys(GAME_OF).length, 8);
  assert.equal(new Set(Object.values(GAME_OF)).size, 8);
  for (const g of GAME_IDS) { for (const dev of ['keyboard', 'pad', 'touch']) assert.ok(HOW[g][dev].length > 10, `${g} ${dev}`); assert.ok(GAME_INPUT[g].length); assert.ok(DEFAULTS[g]); }
});

test('every game lasts 3 to 6.5 seconds at most, and a perfect player finishes inside that', () => {
  for (const g of GAME_IDS) {
    const max = maxSeconds(g);
    assert.ok(max >= 3 && max <= 6.6, `${g}: at most ${max.toFixed(2)} s`);
    for (const seed of SEEDS) { const r = autoplay(g, { seed }); assert.ok(r.ms / 1000 <= max + 0.05, `${g} seed ${seed}: ${r.ms} ms`); assert.ok(r.ms >= 1400, `${g} seed ${seed}: over in ${r.ms} ms`); }
  }
});

test('a perfect player gets Perfect; a player who does nothing gets Poor (it can be failed)', () => {
  for (const g of GAME_IDS) for (const seed of SEEDS) {
    const best = autoplay(g, { seed });
    assert.equal(best.quality, 'perfect', `${g} seed ${seed}: bot scored ${best.score} ${JSON.stringify(best.parts)}`);
    const idle = createRun(g, {}, seed); idle.advance(20);
    assert.ok(idle.state.done, `${g}: never ends when nobody plays`);
    assert.equal(idle.result().quality, 'poor', `${g} seed ${seed}: doing nothing scored ${idle.result().score}`);
  }
});

test('mashing the button is not a strategy', () => {
  for (const g of GAME_IDS) {
    let total = 0;
    for (const seed of SEEDS) {
      const run = createRun(g, {}, seed);
      for (let i = 0; i < 4000 && !run.state.done; i++) { run.advance(1 / 240); if (i % 29 === 0) run.press(); if (i % 29 === 14) run.release(); }   // about 8 presses a second
      total += run.result().score;
    }
    assert.ok(total / SEEDS.length < 0.7, `${g}: mashing averages ${(total / SEEDS.length).toFixed(2)}`);
  }
});

test('a player who looks only 20 times a second (a slow reaction) still reaches Good', () => {
  for (const g of GAME_IDS) for (const seed of SEEDS) {
    const r = autoplay(g, { seed, rate: 20 });
    assert.ok(['good', 'fine', 'perfect'].includes(r.quality), `${g} seed ${seed}: ${r.score} ${JSON.stringify(r.parts)}`);
  }
});

test('frame-rate independent: the same presses give the same result drawn at 240, 60 and 10 frames a second', () => {
  for (const g of GAME_IDS) for (const seed of SEEDS.slice(0, 5)) {
    const rec = autoplay(g, { seed, rate: 120 });
    const a = replay(g, { seed, inputs: rec.inputs, fps: 240 }), b = replay(g, { seed, inputs: rec.inputs, fps: 60 }), c = replay(g, { seed, inputs: rec.inputs, fps: 10 });
    assert.deepEqual(b, a, `${g} seed ${seed} at 60`); assert.deepEqual(c, a, `${g} seed ${seed} at 10`);
    assert.equal(a.score, rec.score, `${g} seed ${seed}: the replay is the game that was played`);
  }
});

test('skinning with one button (hold to lift) also reaches Good', () => {
  for (const seed of SEEDS) { const r = autoplay('trace', { seed, kind: 'hold' }); assert.ok(r.score >= 0.4, `seed ${seed}: ${r.score}`); }
});

test('logging: the wrong side is a miss; "any button" chops but never cleanly', () => {
  const run = createRun('chop', {}, 5); const b0 = run.state.beats[0];
  run.advanceTo(b0.at); run.press(b0.side === 'L' ? 'R' : 'L');
  assert.equal(run.state.parts[0], 0);
  const b1 = run.state.beats[1]; run.advanceTo(b1.at); run.press();
  assert.equal(run.state.parts[1], 0.75);
  const b2 = run.state.beats[2]; run.advanceTo(b2.at); run.press(b2.side);
  assert.equal(run.state.parts[2], 1);
});

test('foraging: a bud picked shut is bruised; picked late it is only good', () => {
  const run = createRun('pick', {}, 3), ps = [...run.state.plants].sort((a, b) => a.open - b.open);
  run.advanceTo(ps[0].open - 0.2); run.press(ps[0].slot); assert.equal(ps[0].grade, 0);
  run.advanceTo(ps[1].open + 0.1); run.press(ps[1].slot); assert.equal(ps[1].grade, 1);
  run.advanceTo(ps[2].close - 0.05); run.press(ps[2].slot); assert.equal(ps[2].grade, 0.7);
});

test('tempering: past the band is "over" (score 0); stopping short is weak but not over', () => {
  const over = createRun('gauge', {}, 4); over.advance(10); assert.equal(over.result().over, true); assert.equal(over.result().score, 0);
  const short = createRun('gauge', {}, 4); short.advanceTo(short.spec.lead + 0.9); short.press();
  assert.equal(short.result().over, false); assert.ok(short.result().score > 0 && short.result().score < 0.4);
});

test('alchemy: pouring past the mark spoils that pour', () => {
  const run = createRun('pour', {}, 8); run.press(); run.advance(8);
  assert.ok(run.state.done); assert.ok(run.result().score < 0.2, String(run.result().score));
});

test('smithing: a cold blow sends the bar back to the fire and counts for nothing', () => {
  const run = createRun('forge', {}, 1);
  while (run.state.heat > run.spec.lo - 0.02) run.advance(1 / 240);
  run.press(); assert.equal(run.state.parts[0], 0); assert.ok(run.state.fire > 0);
});

test('the hard dial makes a game harder, never impossible', () => {
  for (const g of GAME_IDS) {
    const easy = specFor(g, {}), hard = specFor(g, { hard: 1 });
    assert.notDeepEqual(hard, easy);
    for (const seed of SEEDS.slice(0, 4)) { const r = autoplay(g, { seed, spec: { hard: 1 } }); assert.ok(r.score >= 0.7, `${g} hard seed ${seed}: ${r.score}`); }
  }
});

test('quality bands', () => { assert.equal(qualityOf(0), 'poor'); assert.equal(qualityOf(0.4), 'good'); assert.equal(qualityOf(0.7), 'fine'); assert.equal(qualityOf(0.9), 'perfect'); });
