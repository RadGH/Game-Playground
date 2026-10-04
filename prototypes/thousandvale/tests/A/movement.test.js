import test from 'node:test';
import assert from 'node:assert/strict';
import { stepMove, MOVE } from '../../js/sim/movement.js';
import { IN } from '../../js/net/protocol.js';

const flat = { heightAt: () => 10, walkable: () => true, bounds: { minX: 0, minZ: 0, maxX: 100, maxZ: 100 } };

test('run and sprint speeds; diagonal input is normalised', () => {
  const s = { x: 50, y: 10, z: 50, vy: 0, airborne: false };
  for (let i = 0; i < 20; i++) stepMove(s, { mx: 1, mz: 0, b: 0 }, 50, flat);
  assert.ok(Math.abs(s.x - 50 - MOVE.run) < 1e-9);
  const t = { x: 50, y: 10, z: 50, vy: 0, airborne: false };
  for (let i = 0; i < 20; i++) stepMove(t, { mx: 3, mz: 3, b: IN.SPRINT }, 50, flat);
  assert.ok(Math.abs(Math.hypot(t.x - 50, t.z - 50) - MOVE.sprint) < 1e-9);
});

test('a single input never covers more than 100 ms; bounds clamp', () => {
  const s = { x: 99, y: 10, z: 50, vy: 0, airborne: false };
  stepMove(s, { mx: 1, mz: 0, b: 0 }, 5000, flat);
  assert.equal(s.x, 99 + MOVE.run * 0.1 > 100 ? 100 : 99 + MOVE.run * 0.1);
});

test('blocked ground slides along the open axis, else stops', () => {
  const wall = { heightAt: () => 0, walkable: (x, z) => x < 10 };
  const s = { x: 9.9, y: 0, z: 5, vy: 0, airborne: false };
  stepMove(s, { mx: 1, mz: 1, b: 0 }, 100, wall);
  assert.equal(s.x, 9.9); assert.ok(s.z > 5);
});

test('jump goes up and lands back on the ground', () => {
  const s = { x: 50, y: 10, z: 50, vy: 0, airborne: false };
  stepMove(s, { mx: 0, mz: 0, b: IN.JUMP }, 50, flat);
  assert.ok(s.airborne && s.y > 10);
  let peak = s.y;
  for (let i = 0; i < 40; i++) { stepMove(s, { mx: 0, mz: 0, b: 0 }, 50, flat); peak = Math.max(peak, s.y); }
  assert.equal(s.airborne, false); assert.equal(s.y, 10);
  assert.ok(peak > 10.8 && peak < 11.3, 'peak ' + peak);
});

test('client and server agree bit for bit on the same inputs', () => {
  const hill = { heightAt: (x, z) => Math.sin(x / 7) * 3 + Math.cos(z / 5) * 2, walkable: () => true };
  const inputs = Array.from({ length: 200 }, (_, i) => ({ mx: Math.cos(i / 9), mz: Math.sin(i / 13), b: i % 37 === 0 ? IN.JUMP : (i % 3 ? IN.SPRINT : 0) }));
  const a = { x: 10, y: 0, z: 10, vy: 0, airborne: false }, b = { ...a };
  for (const m of inputs) { stepMove(a, m, 50, hill); stepMove(b, { ...m }, 50, hill); }
  assert.deepEqual(a, b);
});
