// W9 (P-client): the view-model of the eight profession mini-games (js/client/ui/prof-games.js) over P-core's
// patterns and scorer (js/rules/professions-games.js). What the player SEES must be what the server SCORES.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_TYPES, GAME_OF, HOW, GAME_INPUT, makeGame, createRun, replay, perfectPlay, endsAt, MAX_PAIRS } from '../../js/client/ui/prof-games.js';
import { scoreGame, checkInputs, qualityOf, perfectInputs } from '../../js/rules/professions-games.js';

const DATA = JSON.parse(readFileSync(new URL('../../data/rules/professions.json', import.meta.url), 'utf8'));
const SEEDS = [1, 2, 3, 7, 11, 42, 99, 1234, 20261007, 555];
const game = (type, seed, ease = 0) => makeGame(type, { seed, ease, base: DATA.games?.[type] });
/** Play a replay list at one "event" per input, no frames in between. */
function play(g, inputs) { const run = createRun(g); for (const [t, k, v] of inputs) { run.advanceTo(t); if (k === 'p') run.press(v); else if (k === 'a') run.aim(v); else run.hold(!!v); } run.advanceTo(g.ms + 50); return run; }

test('every making and gathering profession of the data file has a game here, with a how-to line for every device', () => {
  for (const p of DATA.professions) { if (p.own) continue; assert.equal(GAME_OF[p.id], p.game, p.id); }
  for (const t of GAME_TYPES) { for (const dev of ['keyboard', 'pad', 'touch']) assert.ok(HOW[t][dev].length > 10, `${t} ${dev}`); assert.ok(GAME_INPUT[t].length); }
});

test('3 to 7 seconds: no game can run longer than its time limit, and a flawless one takes at least a second', () => {
  for (const t of GAME_TYPES) for (const seed of SEEDS) {
    const g = game(t, seed); assert.ok(g.ms >= 3000 && g.ms <= 7200, `${t}: ${g.ms} ms`); assert.ok(endsAt(g) <= g.ms);
    const run = play(g, perfectPlay(g)); assert.ok(run.done); assert.ok(run.t >= 1000, `${t} seed ${seed}: over in ${run.t} ms`);
  }
});

test('a flawless player is Perfect; doing nothing fails — and the run ends by itself', () => {
  for (const t of GAME_TYPES) for (const seed of SEEDS) {
    const g = game(t, seed), best = play(g, perfectPlay(g)).result();
    assert.equal(best.quality, 'perfect', `${t} seed ${seed}: ${best.score} ${JSON.stringify(best.marks)} ${best.flags}`);
    const idle = createRun(g); idle.advanceTo(g.ms + 100);
    assert.ok(idle.done, `${t}: never ends when nobody plays`);
    if (t !== 'trace') assert.equal(idle.result().score, 0, `${t} seed ${seed}`);
    assert.ok(['fail', 'poor'].includes(idle.result().quality), `${t} seed ${seed}: idle is ${idle.result().quality}`);
  }
});

test('what is sent is what the server accepts and scores the same: checkInputs passes, scoreGame agrees', () => {
  for (const t of GAME_TYPES) for (const seed of SEEDS) {
    const g = game(t, seed), run = play(g, perfectPlay(g)), r = run.result();
    assert.ok(r.inputs.length <= MAX_PAIRS * 2);
    const chk = checkInputs(g, r.inputs, { elapsedMs: r.ms + 40 });
    assert.ok(chk.ok, `${t} seed ${seed}: refused (${chk.why})`);
    const theirs = scoreGame(g, chk.inputs);
    assert.deepEqual(theirs.marks, r.marks, `${t} seed ${seed}`); assert.equal(theirs.score, r.score);
    assert.equal(qualityOf(theirs.score, DATA.quality.min), r.quality);
  }
});

test('mashing: presses closer than 90 ms are not taken (the server would drop them), and mashing never reaches Fine', () => {
  for (const t of GAME_TYPES) {
    let total = 0;
    for (const seed of SEEDS) {
      const g = game(t, seed), run = createRun(g);
      for (let ms = 0; ms < g.ms + 100 && !run.done; ms += 20) { run.advanceTo(ms); if (ms % 120 === 0) run.press(); }
      run.advanceTo(g.ms + 100);
      const r = run.result(), chk = checkInputs(g, r.inputs, { elapsedMs: r.ms + 40 });
      assert.ok(chk.ok, `${t}: ${chk.why}`); assert.equal(chk.inputs.length * 2, r.inputs.length, `${t}: the server dropped presses the client showed`);
      assert.equal(scoreGame(g, chk.inputs).score, r.score);
      total += r.score;
    }
    assert.ok(total / SEEDS.length < 0.65, `${t}: mashing averages ${(total / SEEDS.length).toFixed(2)}`);
  }
});

test('frame-rate independent: the same inputs give the same result drawn at 240, 60 and 10 frames a second', () => {
  for (const t of GAME_TYPES) for (const seed of SEEDS.slice(0, 5)) {
    const g = game(t, seed), list = perfectPlay(g);
    const a = replay(g, list, 240), b = replay(g, list, 60), c = replay(g, list, 10);
    assert.deepEqual(b.inputs, a.inputs, `${t} seed ${seed} at 60`); assert.deepEqual(c.inputs, a.inputs, `${t} seed ${seed} at 10`);
    assert.equal(c.score, a.score); assert.equal(a.quality, 'perfect', `${t} seed ${seed}: ${a.score}`);
  }
});

test('a human-ish player (30 ms late on everything) still reaches Good', () => {
  for (const t of GAME_TYPES) for (const seed of SEEDS) {
    const g = game(t, seed), late = perfectPlay(g).map(([ms, k, v]) => [ms + 30, k, v]);
    const r = play(g, late).result();
    assert.ok(['good', 'fine', 'perfect'].includes(r.quality), `${t} seed ${seed}: ${r.score} ${JSON.stringify(r.marks)}`);
  }
});

test('skinning with ONE button (hold lifts, let go lowers) reaches Good', () => {
  for (const seed of SEEDS) {
    const g = game('trace', seed), run = createRun(g);
    for (let ms = 0; ms <= g.ms; ms += 16) { run.advanceTo(ms); run.hold(run.state.y < run.botNext()?.aim); }
    run.advanceTo(g.ms + 10);
    assert.ok(run.result().score >= 0.4, `seed ${seed}: ${run.result().score}`);
  }
});

test('the picture follows the scorer: views name the same marks', () => {
  // logging: the wrong side takes the beat and scores nothing
  let g = game('rhythm', 5), run = createRun(g); run.advanceTo(g.lead); run.press(1 - g.first);
  let v = run.view(); assert.equal(v.beats[0].taken, true); assert.equal(v.beats[0].mark, 0); assert.equal(run.state.note.kind, 'miss');
  run.advanceTo(g.lead + g.beat); run.press((g.first + 1) % 2); assert.equal(run.view().beats[1].mark, 2);
  // foraging: a shut bud is bruised and costs a mark; a ripe one in the middle is perfect
  g = game('pick', 3); run = createRun(g); const shut = [...Array(g.spots).keys()].find(i => !g.ripe.some(r => r.i === i));
  run.advanceTo(200); run.press(shut); v = run.view(); assert.equal(v.places[shut].state, 'bruised'); assert.equal(v.penalty, 1);
  const r0 = g.ripe[0]; run.advanceTo((r0.from + r0.to) / 2); assert.equal(run.view().places[r0.i].state, 'ripe'); run.press(r0.i);
  assert.equal(run.view().places[r0.i].state, 'picked'); assert.equal(run.state.note.kind, 'perfect');
  // smithing: in the fire nothing is taken; a cold blow is spent
  g = game('forge', 1); run = createRun(g); run.advanceTo(100); run.press(1); assert.equal(run.state.note.kind, 'reheat');
  run.advanceTo(300); assert.equal(run.press(), null); assert.equal(run.view().inFire, true);
  run.advanceTo(100 + g.reheat + 2600); assert.ok(run.view().heat < g.band[0]); run.press(); assert.equal(run.view().blows, 1); assert.equal(run.result().marks[0], 0);
  // alchemy: left alone it spills by itself and the next stage still begins
  g = game('pour', 8); run = createRun(g); run.advanceTo(g.ms); assert.ok(run.done); assert.ok(run.result().inputs.length >= 2); assert.ok(run.result().flags.includes('spilled')); assert.equal(run.result().score, 0);
  // tempering: past the band with no press = over, nothing sent
  g = game('gauge', 4); run = createRun(g); run.advanceTo(g.ms); assert.equal(run.result().over, true); assert.equal(run.result().inputs.length, 0);
});

test('the bot the spec uses: botNext() walks perfectInputs in order', () => {
  for (const t of GAME_TYPES.filter(x => x !== 'trace')) {
    const g = game(t, 9), run = createRun(g), want = perfectInputs(g);
    for (let k = 0; !run.done && k < 40; k++) { const n = run.botNext(); if (!n) break; assert.equal(n.t, want[k * 2]); run.advanceTo(n.t); run.press(n.v); }
    assert.equal(run.result().quality, 'perfect', t);
  }
});
