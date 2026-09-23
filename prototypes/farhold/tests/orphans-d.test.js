// Farhold — the Hauler Drone pays in power, which data/colony.json has said all along.
//
// R19. `carriers.hauler_drone.powerAtOrigin: 12` had no reader anywhere in js/. The drone is the
// only carrier in the table with `upkeep: 0` and its own blurb says why — "it dies with the grid" —
// so with the knob unread it was simply the fastest carrier in the game, free to run, with no
// condition on it at all: 200 kg at 7.5 m/s against a Covered Wagon's 620 at 3.0 for 34 gold a trip.
//
// Two halves, and the second is the one the blurb is about:
//   1. plan() refuses a drone the origin cannot power.
//   2. tick() sets one down when the grid behind it goes dark, and puts it up again when it comes
//      back. It LANDS rather than being lost — a full hold gone to a cloudy afternoon is a reload.

import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createTrade } from '../js/trade.js';
import { createGrid } from '../js/power.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = f => JSON.parse(readFileSync(join(here, '..', 'data', f), 'utf8'));
const colonyData = read('colony.json');
const goodsData = read('tradegoods.json');
const powerData = read('power.json');

const DRONE = (colonyData.carriers || []).find(c => c.key === 'hauler_drone');

const here_ = { id: 'a', name: 'Ashfall', x: 0, z: 0 };
const there = { id: 'b', name: 'Kelmoor', x: 900, z: 0 };

/** A manifest light enough for any carrier in the table, built from whatever goods exist. */
function smallLoad() {
  const g = (goodsData.goods || []).slice().sort((a, b) => (a.weight || 1) - (b.weight || 1))[0];
  return { [g.id]: 1 };
}

const tradeWith = powerAt => createTrade({ goods: goodsData.goods || [], data: colonyData, seed: 3, powerAt });

test('R19.D1 — the drone is still the carrier that costs power instead of gold', () => {
  assert.ok(DRONE, 'data/colony.json no longer has a hauler_drone to test');
  assert.ok(DRONE.powerAtOrigin > 0, 'the drone stopped asking for power');
  assert.equal(DRONE.upkeep, 0, 'the drone now costs gold as well, which changes what this tests');
});

test('R19.D2 — no grid at the origin, no drone', () => {
  const trade = tradeWith(() => 0);
  const p = trade.plan({ from: here_, to: there, carrier: 'hauler_drone', manifest: smallLoad() });
  assert.equal(p.ok, false, 'a drone was dispatched from a place with no power at all');
  assert.match(p.why, /no power/i, `the refusal does not say why: ${p.why}`);
});

test('R19.D3 — a grid that is short says by how much, and a full one lets it go', () => {
  const short = tradeWith(() => DRONE.powerAtOrigin - 3);
  const ps = short.plan({ from: here_, to: there, carrier: 'hauler_drone', manifest: smallLoad() });
  assert.equal(ps.ok, false, 'a short grid still dispatched the drone');
  assert.match(ps.why, new RegExp(`${DRONE.powerAtOrigin} kW`), `the refusal does not quote the draw: ${ps.why}`);

  const full = tradeWith(() => DRONE.powerAtOrigin + 50);
  const pf = full.plan({ from: here_, to: there, carrier: 'hauler_drone', manifest: smallLoad() });
  assert.equal(pf.ok, true, `a grid with room refused the drone: ${pf.why}`);
  assert.equal(pf.needsPower, DRONE.powerAtOrigin, 'a good plan does not report the draw');
});

test('R19.D4 — nothing else in the table is affected by any of it', () => {
  const dark = tradeWith(() => 0);
  for (const c of colonyData.carriers || []) {
    if (c.powerAtOrigin) continue;
    const p = dark.plan({ from: here_, to: there, carrier: c.key, manifest: smallLoad() });
    assert.equal(p.ok, true, `a ${c.name} was refused for want of power it does not use: ${p.why}`);
    assert.ok(!p.needsPower, `a ${c.name} reports a power draw`);
  }
});

test('R19.D5 — with no grid wired in at all, every carrier still dispatches', () => {
  // the away catch-up, a node test and a replayed save all run with no grid; a drone that cannot
  // be dispatched at ALL is worse than one that is not yet gated
  const trade = tradeWith(null);
  const p = trade.plan({ from: here_, to: there, carrier: 'hauler_drone', manifest: smallLoad() });
  assert.equal(p.ok, true, `no grid supplied and the drone was refused anyway: ${p.why}`);
});

test('R19.D6 — it dies with the grid, and comes back with it', () => {
  let spare = 100;
  const trade = tradeWith(() => spare);
  const p = trade.plan({ from: here_, to: there, carrier: 'hauler_drone', manifest: smallLoad() });
  assert.ok(p.ok, `could not dispatch: ${p.why}`);
  const { route } = trade.open(p, { gold: 9999 });
  assert.ok(route, 'the route did not open');

  // a normal tick moves it
  const before = route.left;
  trade.tick(60, { day: 1 });
  assert.ok(route.left < before, 'a powered drone is not moving');

  // the grid goes dark: it lands, and the clock stops
  spare = 0;
  const out = trade.tick(60, { day: 1 });
  assert.equal(out.grounded.length, 1, 'the drone kept flying through a blackout');
  assert.equal(route.grounded, true);
  const stopped = route.left;
  trade.tick(600, { day: 1 });
  assert.equal(route.left, stopped, 'a grounded drone went on covering ground');

  // …and it is not LOST: the hold is still there to come back to
  assert.equal(route.state, 'travelling', 'a blackout destroyed the route');

  // the power comes back
  spare = 100;
  const back = trade.tick(60, { day: 1 });
  assert.equal(back.flying.length, 1, 'nothing said the drone was up again');
  assert.equal(route.grounded, false);
  trade.tick(60, { day: 1 });
  assert.ok(route.left < stopped, 'the drone never resumed');
});

test('R19.D7 — the plan carries the origin position, or tick can never ask about it', () => {
  // This was a bug in the fix: `tick` asked `powerAt({ id, name })` with no x/z, `spareAt` answered
  // null for want of a point, and the drone could never be grounded by anything.
  const seen = [];
  const trade = tradeWith(place => { seen.push(place); return 100; });
  const p = trade.plan({ from: here_, to: there, carrier: 'hauler_drone', manifest: smallLoad() });
  trade.open(p, { gold: 9999 });
  trade.tick(30, { day: 1 });
  const inTick = seen[seen.length - 1];
  assert.ok(Number.isFinite(inTick.x) && Number.isFinite(inTick.z),
    'tick asks the grid about a place with no coordinates, so it can never get a real answer');
  assert.equal(inTick.x, here_.x, 'tick asked about the wrong end of the route');
});

// ------------------------------------------------------------------ the grid's side of it

test('R19.D8 — spareAt answers about a POINT, and tells "no grid" apart from "no power"', () => {
  const grid = createGrid({ power: powerData });
  // nowhere near anything: there is no grid here, which is not the same as a flat one
  assert.equal(grid.spareAt(0, 0), null, 'bare ground reported a grid');

  /**
   * Straight out of data/power.json's own `generators` block — the first draft of this test looked
   * for `powerData.units`, which does not exist in this file, hit its own "this build states
   * suppliers differently" early return, and passed while checking nothing at all. A test that
   * skips itself is worse than no test, because it reports green.
   */
  const gens = Object.entries(powerData.generators || {});
  assert.ok(gens.length, 'data/power.json has no generators at all');
  /**
   * A generator that burns something, with no `stores` wired into the grid, honestly makes nothing
   * — the second thing this test caught. So it has to be one of the ones that runs on the weather.
   */
  const [type, def] = gens.find(([, d]) => (d.supplyRadius ?? 0) > 0 && (d.gen ?? 0) > 0 && !d.fuel);
  assert.ok(type, 'no fuel-free generator both makes power and supplies a radius');

  grid.add({ id: 1, type, x: 0, z: 0 });
  grid.tick(1, { daylight: 1, wind: 1 });

  const at = grid.spareAt(0, 0);
  assert.ok(at != null, "a point inside a supplier's reach still reports no grid");
  assert.ok(at > 0, `a ${def.name} making ${def.gen} kW with nothing drawing on it reported ${at} spare`);
  assert.equal(grid.spareAt(1e6, 1e6), null, 'a point far outside every supply radius found a grid');

  // just outside its own radius is still no grid — the radius is the answer, not a guess
  assert.equal(grid.spareAt(def.supplyRadius + 5, 0), null,
    'a point beyond the supply radius was counted as on the grid');
});
