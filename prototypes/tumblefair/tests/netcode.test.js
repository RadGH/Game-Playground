// The server and a phone must agree on where the phone's own character is: the phone predicts by replaying its inputs
// through stepBody, so the server must apply every input exactly once, in order, however bunched up they arrive.
// (Round 4: the server used to "coast" a late phone on its last input and then apply the real inputs as well.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../js/sim/room.js';
import { DATA } from './helpers.js';
import { GAMES } from '../js/games/index.js';
import { stepBody, unpackBody } from '../js/shared/arena.js';

function soloArena(game) {
  let t = 1000; const got = [];
  const room = createRoom({ code: 'TEST', now: () => t, seed: 9, data: DATA });
  const m = room.join({ token: 'a', name: 'A', look: { race: 'human', seed: 1 }, costume: 'cos_none', send: s => got.push(JSON.parse(s)) });
  room.message(m, { t: 'opt', key: 'mode', value: 'marathon' });
  room.message(m, { t: 'opt', key: 'pool', value: [game] });
  room.message(m, { t: 'start' });
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { t += 50; room.tick(); } };
  for (let i = 0; i < 400 && room.phase !== 'game'; i++) tick();
  return { room, m, got, tick };
}

for (const game of ['paint-panic', 'balloon-stampede']) test(`${game}: bursts and gaps of input end where the phone predicted`, () => {
  const { room, m, got, tick } = soloArena(game);
  assert.equal(room.phase, 'game');
  const intro = got.filter(x => x.t === 'phase' && x.phase === 'intro').pop();
  const mine = unpackBody(intro.b[m.pid]), meta = GAMES[game].meta, arena = intro.init?.arena || meta.arena;
  let s = 0;
  const inputs = [];
  for (let i = 0; i < 60; i++) inputs.push({ s: ++s, mx: Math.sin(i / 7), mz: Math.cos(i / 5), b: 0 });
  // deliver them like a bad phone line: 4 at once, then nothing for 3 ticks, then 1, 1, 6 at once...
  const pattern = [4, 0, 0, 0, 1, 1, 6, 0, 0, 2, 3, 0, 5, 0, 0, 0, 0, 8];
  let i = 0, p = 0;
  while (i < inputs.length) { const k = pattern[p++ % pattern.length]; for (let j = 0; j < k && i < inputs.length; j++) room.message(m, { t: 'in', ...inputs[i++] }); tick(); }
  tick(20);
  for (const inp of inputs) stepBody(mine, inp, meta.move, arena);
  const last = got.filter(x => x.t === 's' && x.b).pop(), server = unpackBody(last.b[m.pid]);
  assert.equal(server.ack, s, 'every input acknowledged');
  assert.ok(Math.hypot(server.x - mine.x, server.z - mine.z) < 0.05, `server ${server.x},${server.z} vs phone ${mine.x},${mine.z}`);
});
