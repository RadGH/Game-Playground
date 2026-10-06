// Play-test 3, R2 (stream A side): E's extra monsters near the start (data/vignettes/placements/<zone>.hunt.json) are
// merged into the province's camps, and a DORMANT camp (no player within awakeR) wakes when someone walks up to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realServer, realContent, joinReal, rec, run } from './pt1-helpers.js';

test('R2: hunt camps are in the province, and one far from everything wakes when a player walks up', async () => {
  const C = await realContent();
  const L = C.layouts[0];
  const hunt = L.camps.filter(c => String(c.place || '').startsWith('hunt_'));
  assert.ok(hunt.length >= 300, `${hunt.length} hunt camps in the province`);
  assert.ok(hunt.every(c => c.level <= 4 || (Array.isArray(c.level) && c.level[1] <= 4)), 'low level');
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Hunter');
  const o = rec(world, a);
  const P = world.province;
  const room = P.copies[0];
  // a hunt camp with no other camp within 150 m (so what wakes is it)
  const lone = hunt.find(c => !L.camps.some(d => d !== c && Math.hypot(d.x - c.x, d.z - c.z) < 150) && !L.towns.some(t => Math.hypot(t.x - c.x, t.z - c.z) < t.r + 60)) || hunt[0];
  const near = () => [...room.entities.values()].filter(e => e.kind === 'monster' && !e.dead && Math.hypot(e.x - lone.x, e.z - lone.z) < 30);
  assert.equal(near().length, 0, 'asleep while nobody is near');
  P.transfer(o, room, { x: lone.x + 25, z: lone.z }, 'test');
  await run(clock, 3000);
  assert.ok(near().length >= 1, `the camp woke: ${near().length} monster(s) by it`);
  a.close(); await srv.stop();
});
