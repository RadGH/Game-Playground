// Halloween reskins (round 6): every game that dresses up for Halloween must still run from start to finish with
// season 'halloween' for 1-4 players, and a reskin changes looks only — the same seed and the same presses give
// exactly the same result as the plain game. One test per reskinned game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/shared/rng.js';
import { IN } from '../js/shared/protocol.js';
import * as balloon from '../js/games/balloon-stampede/sim.js';
import * as cannon from '../js/games/cannonball-catch/sim.js';
import * as jelly from '../js/games/jellybean-jar/sim.js';
import * as lantern from '../js/games/lantern-leap/sim.js';
import * as mole from '../js/games/mole-mallet/sim.js';
import * as sheep from '../js/games/sheep-shuffle/sim.js';
import * as coin from '../js/games/coinstorm/sim.js';
import * as snow from '../js/games/snowball-showdown/sim.js';
import * as paint from '../js/games/paint-panic/sim.js';
import * as heist from '../js/games/memory-heist/sim.js';
import * as trap from '../js/games/trapdoor-treasury/sim.js';
import { svg, layout } from '../js/games/jellybean-jar/jar-art.js';

const players = n => Array.from({ length: n }, (_, i) => ({ pid: i + 1, seat: i, name: 'P' + i }));
/** Play a whole game with seeded "players" (wandering sticks + presses for arena games, nothing for ui games). */
function play(mod, n, season, seed = 11) {
  const g = mod.create({ seed, rng: makeRng(seed), players: players(n), difficulty: 'normal', season });
  const drive = makeRng(seed * 31 + n), arena = mod.meta.kind === 'arena';
  g.init();
  let t = 0;
  for (; t < mod.meta.seconds + 3 && !g.over; t += 0.05) {
    if (arena) for (const p of players(n)) { const a = drive() * Math.PI * 2; g.input(p.pid, { s: 1, mx: Math.sin(a), mz: Math.cos(a), b: drive() < 0.08 ? IN.A : 0 }); }
    g.step(0.05); g.state(); if (g.events) g.events.length = 0;
  }
  return { g, r: g.result(), t };
}
function shape(r, n) {
  const seen = r.order.flat();
  assert.equal(seen.length, n, 'every player once'); assert.deepEqual([...seen].sort((a, b) => a - b), players(n).map(p => p.pid));
}

for (const [name, mod] of Object.entries({ balloon, cannon, jelly, lantern, mole, sheep, coin, snow, paint, heist, trap })) {
  test(`${mod.meta.id}: the Halloween version runs 1-4 players and plays exactly like the plain one`, () => {
    for (let n = mod.meta.min; n <= mod.meta.max; n++) {
      const hw = play(mod, n, 'halloween'), plain = play(mod, n, null);
      shape(hw.r, n);
      assert.ok(hw.t < mod.meta.seconds + 3.1, `${name} ${n}p: played no longer than the room's clock allows`);
      assert.deepEqual(hw.r, plain.r, `${name} ${n}p: same seed, same result`);
    }
  });
}

test('memory-heist: Halloween swaps the twelve treasures for spooky ones, the plain vault is untouched', () => {
  const mk = season => heist.create({ seed: 5, rng: makeRng(5), players: players(2), difficulty: 'normal', season });
  const a = mk(null), b = mk('halloween'), c = heist.create({ seed: 5, rng: makeRng(5), players: players(2), difficulty: 'normal' });
  assert.deepEqual(a.init(), c.init(), 'season null is the plain game');
  assert.equal(a.init().treasures, heist.TREASURES);
  assert.equal(b.init().treasures, heist.TREASURES_HW);
  assert.deepEqual(a.init().vault, b.init().vault, 'same vault layout, only the pictures and names differ');
  assert.equal(heist.TREASURES_HW.length, heist.TREASURES.length);
  assert.equal(new Set(heist.TREASURES_HW.map(t => t.id)).size, heist.TREASURES_HW.length);
  let g = b; while (g.state().phase !== 'q') g.step(0.05);
  const names = new Set(heist.TREASURES_HW.map(t => t.name));
  for (const o of g.state().q.opts) if (o.k != null) assert.ok(names.has(o.t), `a Halloween option: ${o.t}`);
});

test('jellybean-jar: the Halloween pictures hold exactly as many things as the plain ones', () => {
  for (const thing of ['beans', 'gumballs', 'ducks', 'balloons']) for (const n of [1, 17, 64]) {
    const count = s => (s.match(/class="jj-it"/g) || []).length;
    assert.equal(count(svg(thing, n, 9, 0.8, 'halloween')), n, `${thing} ${n}`);
    assert.equal(svg(thing, n, 9, 0.8), svg(thing, n, 9, 0.8, null), 'no season = the plain picture');
    assert.equal(layout(thing, n, 9, 0.8).items.length, n);
  }
});
