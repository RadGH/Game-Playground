import test from 'node:test';
import assert from 'node:assert/strict';
import { ByteWriter, encodeRecord, encodeClientSnap, decodeSnap, qYaw } from '../../js/net/snapshot.js';
import { F, STATE, ANIM_ID } from '../../js/net/protocol.js';

const ent = o => ({ id: 5, kind: 'monster', x: 100.3, y: 12.25, z: 2047.9, yaw: 1.0, hp: 30, hpMax: 60, animId: ANIM_ID.bite, animSeq: 7, state: STATE.combat, target: 9, ...o });

test('full record round-trips within the quantisation', () => {
  const w = new ByteWriter(8);
  encodeRecord(w, ent(), F.FULL, 0.125);
  const frame = encodeClientSnap({ tick: 1234, ack: 77, self: { x: 1.5, y: 2.5, z: 3.5, vy: -1 }, vitals: { hp: 90, hpMax: 100, mp: 5, mpMax: 50 }, left: [3, 4], chunks: [w.out()] });
  const s = decodeSnap(frame, 0.125);
  assert.equal(s.tick, 1234); assert.equal(s.ack, 77);
  assert.deepEqual(s.self, { x: 1.5, y: 2.5, z: 3.5, vy: -1 });
  assert.deepEqual(s.vitals, { hp: 90, hpMax: 100, mp: 5, mpMax: 50 });
  assert.deepEqual(s.left, [3, 4]);
  assert.equal(s.ents.length, 1);
  const r = s.ents[0];
  assert.equal(r.full, true); assert.equal(r.kind, 'monster');
  assert.ok(Math.abs(r.x - 100.3) <= 0.0625); assert.ok(Math.abs(r.z - 2047.9) <= 0.0625);
  assert.equal(r.y, 12.25);
  assert.ok(Math.abs(r.yaw - 1.0) < 0.013);
  assert.ok(Math.abs(r.hp - 0.5) < 0.0001);
  assert.equal(r.anim, 'bite'); assert.equal(r.animSeq, 7);
  assert.equal(r.state, STATE.combat); assert.equal(r.target, 9);
});

test('a walker costs 8 bytes (id, mask, x, z, yaw) and an idle entity 0', () => {
  const w = new ByteWriter();
  encodeRecord(w, ent(), F.POS | F.YAW, 0.125);
  assert.equal(w.n, 8);
  const empty = encodeClientSnap({ tick: 1, chunks: [] });
  assert.equal(empty.length, 1 + 1 + 4 + 4 + 1 + 2);
});

test('no target encodes as 0xFFFF and decodes as 0; positions clamp into the room', () => {
  const w = new ByteWriter();
  encodeRecord(w, ent({ target: 0, x: -50, z: 1e9 }), F.TARGET | F.POS, 0.125);
  const r = decodeSnap(encodeClientSnap({ tick: 1, chunks: [w.out()] }), 0.125).ents[0];
  assert.equal(r.target, 0);
  assert.equal(r.x, 0);
  assert.equal(r.z, 65535 * 0.125);
});

test('yaw wraps both ways', () => {
  assert.equal(qYaw(0), 0); assert.equal(qYaw(Math.PI * 2), 0); assert.equal(qYaw(-Math.PI / 2), 192);
});

test('a truncated frame throws instead of returning garbage', () => {
  const w = new ByteWriter();
  encodeRecord(w, ent(), F.FULL, 0.125);
  const f = encodeClientSnap({ tick: 1, chunks: [w.out()] });
  assert.throws(() => decodeSnap(f.slice(0, f.length - 3), 0.125), /short/);
  assert.throws(() => decodeSnap(new Uint8Array([2, 1]), 0.125), /not a snapshot/);
});
