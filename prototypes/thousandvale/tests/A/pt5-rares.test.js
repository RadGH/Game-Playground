// Play-test 5 (stream A) — T10 "rare monsters much more frequent — I still haven't seen one". The rates are stream C's
// (data/rules/affixes.json) and the fixed roadside champions are stream E's placements; A's part is that a PLACED camp's
// rank, affixes and respawn reach the monster that is spawned (js/sim/placements.js, js/sim/room.js). This test measures what
// the server really spawns round the start: BEFORE (ranks not passed through: every placed champion is an ordinary monster)
// and AFTER.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, joinReal, rec, run } from './pt1-helpers.js';

/** Walk a player over a grid round the starting town and count the special monsters the server spawns there. */
async function census(strip) {
  const { srv, clock, world, C } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0];
  const placed = L.camps.filter(c => c.champion);
  const copy = P.copies[0];
  if (strip) for (const c of copy.camps) if (c.champion) { delete c.rank; delete c.affixes; }
  const a = await joinReal(srv, clock, strip ? 'Before' : 'After');
  const o = rec(world, a);
  P.devSetLevel(o.char.id, 40);
  const T = L.towns[0];
  const seen = new Map();
  for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
    const p = { x: T.x + gx * 180, z: T.z + gz * 180 };
    if (Math.hypot(p.x - T.x, p.z - T.z) < T.r + 20 || !L.terrain.walkable(p.x, p.z)) continue;
    if (o.entity.dead) o.entity.revive(1);
    P.transfer(o, copy, p, 'test');
    await run(clock, 1100);
    for (const m of copy.entities.values()) if (m.kind === 'monster' && !m.dead && Math.hypot(m.x - T.x, m.z - T.z) <= 800) seen.set(m.id, { rank: m.rank, aff: (m.aff || []).length, camp: !!(m.data && m.data.camp), fixed: !!(m.data && m.data.affixes) });
  }
  const all = [...seen.values()];
  const out = { monsters: all.length, champions: all.filter(m => m.rank === 'champion').length, rares: all.filter(m => m.rank === 'rare').length, fixed: all.filter(m => m.fixed).length, placedInProvince: placed.length };
  a.close(); await srv.stop();
  void C;
  return out;
}

test('T10: within 800 m of the starting town the server spawns special monsters — E\'s placed champions keep their rank and affixes, and several stand where a newcomer walks', async () => {
  const after = await census(false);
  console.log('T10 census within 800 m of Torborhold:', JSON.stringify(after));
  assert.ok(after.placedInProvince >= 20, 'E placed roadside champions: ' + after.placedInProvince);
  assert.ok(after.fixed >= 3, 'placed champions stand near the start with their affixes (0 before the rank was passed through): ' + after.fixed);
  assert.ok(after.champions + after.rares >= 4, 'several a newcomer will meet: ' + (after.champions + after.rares));
});

// MEASURED 2026-10-06 (the same census; `census(true)` = placed ranks not passed through):
//   before this round (old roll chances, placed ranks dropped): 0 champions + 2 rares among 367 monsters
//   A's pass-through alone:                                      5 champions + 2 rares among 371
//   with C's new chances too (champion 0.14, rare 0.05, from level 2): 36-40 champions + 16-20 rares among ~380
//   C's final dial (champion 0.05, rare 0.06, from level 2):          21 champions + 14 rares among 371
