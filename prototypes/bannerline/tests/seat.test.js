// Pad stick movement survives death / respawn / teleport (code review, js/input/commands.js): the
// sim drops a 'dir' order on death and on Recall, so a player holding the stick steady must get a
// fresh moveDir without wiggling it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSeat } from '../js/input/commands.js';

function rig() {
  const hero = { id: 1, kind: 'hero', team: 0, field: 0, x: 0, z: 0, alive: true, act: 'idle' };
  const state = { players: [{ team: 0, heroEnt: 1, skills: [] }], ents: [hero], result: null };
  const seat = createSeat({ player: 0, device: 'pad0', viewport: { rect: { x: 0, y: 0, w: 800, h: 600 } }, camera: {}, actors: { hover() {}, pick() { return null; } }, getState: () => state });
  const frame = (x, y) => ({ device: 'pad0', pressed: new Set(), held: new Set(), released: new Set(), rawPressed: [], stickL: { x, y }, stickR: { x: 0, y: 0 } });
  const moves = () => seat.take().filter((c) => c.type === 'moveDir');
  return { hero, seat, frame, moves };
}

test('holding the stick sends one moveDir, not one per frame', () => {
  const { hero, seat, frame, moves } = rig();
  seat.update(frame(0, -1), 0.016);
  assert.equal(moves().length, 1);
  hero.act = 'walk';
  for (let i = 0; i < 20; i++) seat.update(frame(0, -1), 0.016);
  assert.equal(moves().length, 0);
});

test('a stick held through death and respawn walks again without a wiggle', () => {
  const { hero, seat, frame, moves } = rig();
  seat.update(frame(1, 0), 0.016); moves(); hero.act = 'walk';
  hero.alive = false; hero.act = 'dead';
  for (let i = 0; i < 5; i++) seat.update(frame(1, 0), 0.016);
  assert.equal(moves().length, 0, 'nothing sent while down (the sim would reject it)');
  hero.alive = true; hero.act = 'idle';                       // respawned, order cleared
  seat.update(frame(1, 0), 0.016);
  const m = moves();
  assert.equal(m.length, 1); assert.equal(m[0].speed, 3);
});

test('a stick held through a teleport (order reset to idle) is resent after a few frames', () => {
  const { hero, seat, frame, moves } = rig();
  seat.update(frame(0, 1), 0.016); moves(); hero.act = 'walk';
  hero.act = 'idle';                                          // Recall: the sim dropped the order
  let sent = 0;
  for (let i = 0; i < 8; i++) { seat.update(frame(0, 1), 0.016); sent += moves().length; }
  assert.equal(sent, 1);
});
