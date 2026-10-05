// Play-test 1, P8 + P9 (stream A): bodies stand on the ground the client draws, and dead bodies stay put.
//  P9: the mirror kept the y of an entity's last FULL record, so a monster walking downhill floated and one walking
//      uphill sank until it crossed into the next AOI cell. Now a grounded entity has no y in the mirror and the
//      renderer stands it on its own ground reader; airborne/swimming entities keep the server's y.
//  P9: the server's ground is stream B's reader (heightAt includes bridge decks), so a body on a bridge is ON it.
//  P8: a dead body never moves (Entity.moveTo), a respawn revives before it moves, revive clears combat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMirror } from '../../js/net/mirror.js';
import { STATE } from '../../js/net/protocol.js';
import { createRoom } from '../../js/sim/room.js';
import { createRules as rulesV0 } from '../../js/sim/rules-v0.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { realContent } from './pt1-helpers.js';

test('P9: a grounded entity\'s y is not kept from its FULL record; airborne/swimming ones keep the server y', () => {
  const m = createMirror({ tickMs: 50 });
  m.snap({ tick: 1, left: [], ents: [{ id: 7, full: true, kind: 'monster', x: 10, z: 10, y: 25, yaw: 0, hp: 1, state: 0 }] });
  m.snap({ tick: 2, left: [], ents: [{ id: 7, x: 30, z: 10 }] });        // walked 20 m downhill: no y on a delta
  assert.equal(m.ents.get(7).y, undefined, 'no stale y (it used to stay 25 while the ground fell away)');
  assert.equal(m.sample(7, 100).y, undefined, 'the renderer fills the ground itself');
  m.snap({ tick: 3, left: [], ents: [{ id: 8, full: true, kind: 'player', x: 5, z: 5, y: 12.5, yaw: 0, hp: 1, state: STATE.airborne }] });
  m.snap({ tick: 4, left: [], ents: [{ id: 8, x: 6, z: 5, y: 13.25 }] });
  assert.equal(m.ents.get(8).y, 13.25, 'airborne keeps the server y');
  m.snap({ tick: 5, left: [], ents: [{ id: 8, x: 7, z: 5, y: 11, state: 0 }] });   // landed
  assert.equal(m.ents.get(8).y, undefined);
  m.snap({ tick: 6, left: [], ents: [{ id: 9, full: true, kind: 'player', x: 5, z: 5, y: 8.9, yaw: 0, hp: 1, state: STATE.swimming }] });
  assert.equal(m.ents.get(9).y, 8.9, 'a swimmer floats where the server says');
});

test('P8: a dead body does not move; respawn revives first; revive clears the fight flag', () => {
  const terrain = standInTerrain(2, 512);
  const room = createRoom({ id: 'r', terrain, createRules: rulesV0, camps: [] });
  const ch = { id: 1, name: 'Corpse', cls: 'warrior', level: 1, hp: 50 };
  const e = room.addPlayer(ch, null, { x: 100, z: 100 });
  e.setState(STATE.combat, true);
  e.kill();
  e.moveTo(130, 140);                                   // a knock / a leash step / a queued chase on a corpse
  assert.deepEqual([e.x, e.z], [100, 100], 'the corpse stayed where it fell');
  e.moveTo(120, 120, undefined, true);                  // the server itself may still teleport a body
  assert.deepEqual([e.x, e.z], [120, 120]);
  assert.ok(room.respawn(e));
  assert.equal(e.dead, false);
  assert.deepEqual([e.x, e.z], [room.spawnPoint.x, room.spawnPoint.z], 'respawn moved the revived body to the spawn');
  assert.equal(e.state & (STATE.dead | STATE.combat), 0, 'alive and out of combat');
  // a dead monster cannot be dragged either
  const mon = room.spawn({ kind: 'monster', type: 'wolf', x: 50, z: 50 });
  mon.kill(); mon.moveTo(60, 60);
  assert.deepEqual([mon.x, mon.z], [50, 50]);
});

test('P9: the server stands bodies on stream B\'s reader — bridge decks included — the surface the client draws', async () => {
  const C = await realContent();
  const T = C.layouts[0].terrain;
  // every baked bridge deck: a body put on the middle of it is at deck height, not down in the river
  const room = createRoom({ id: 'deck', terrain: T, createRules: rulesV0, camps: [] });
  let checked = 0;
  const R = T.reader;
  if (typeof R.deckAt !== 'function') return;          // B's deck layer not in this tree: nothing to check
  const b = T.bounds;
  for (let x = b.minX; x < b.maxX && checked < 3; x += 4) for (let z = b.minZ; z < b.maxZ && checked < 3; z += 4) {
    const d = R.deckAt(x, z);
    if (!Number.isFinite(d)) continue;
    const g = R.groundAt ? R.groundAt(x, z) : -Infinity;
    if (!(d > g + 0.3)) continue;
    const m = room.spawn({ kind: 'monster', type: 'wolf', x, z });
    assert.ok(Math.abs(m.y - d) < 1e-6, `a body on the deck at (${x}, ${z}) stands at ${d}, got ${m.y}`);
    m.moveTo(x + 0.01, z);
    assert.ok(Math.abs(m.y - T.heightAt(x + 0.01, z)) < 1e-6);
    checked++;
    x += 200;
  }
  console.log('# decks checked: ' + checked);
});
