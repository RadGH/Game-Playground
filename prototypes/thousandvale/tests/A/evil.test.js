// The evil-client suite (PLAN §16): every cheat is refused, logged, and the server stays up for everyone
// else. Over the real protocol (loopback sockets); stream G runs the same over WebSockets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run, until, ent, roomOf } from './helpers.js';

async function setup(clock) {
  const srv = makeServer({ clock });
  await srv.ready;
  const evil = await joinAs(srv, clock, 'Mallory'), good = await joinAs(srv, clock, 'Honest');
  const W = srv.world;
  W.grant(W.online.get(good.joined.you.char), { items: [{ name: 'Honest blade', rarity: 'rare', value: 5 }], gold: 50, reason: 'test' });
  W.transfer(W.online.get(evil.joined.you.char), W.townRoom, { x: W.town.x, z: W.town.z }, 't');
  W.transfer(W.online.get(good.joined.you.char), W.townRoom, { x: W.town.x + 2, z: W.town.z }, 't');
  await run(clock, 300);
  const errs = []; evil.on('err', m => errs.push(m.code));
  const used = []; evil.on('used', m => used.push(m));
  return { srv, W, evil, good, errs, used };
}

test('speed hack and teleport: movement is bounded by real time and the step size', async () => {
  const clock = createVirtualClock();
  const { srv, evil, good } = await setup(clock);
  const e = ent(srv, evil), x0 = e.x;
  let s = 0;
  for (let i = 0; i < 20; i++) { for (let k = 0; k < 3; k++) evil.input({ s: ++s, dt: 100, mx: 50, mz: 0, yaw: 0, b: 1 }); await run(clock, 50, 50); }
  const moved = ent(srv, evil).x - x0;
  assert.ok(moved < 8.1 * 1.6, 'moved ' + moved.toFixed(1) + ' m in 1 s even claiming 6 s at 50x');
  // a raw teleport attempt: inputs carry no position at all, only a direction
  evil._raw('p', JSON.stringify({ t: 'in', s: ++s, dt: 50, mx: 0, mz: 0, yaw: 0, b: 0, x: 0, z: 0 }));
  await run(clock, 100);
  assert.ok(srv.world.status().bad >= 1, 'extra fields refused');
  assert.equal(good.status, 'online');
  evil.close(); good.close(); await srv.stop();
});

test('cast off cooldown / out of range / a dead target: refused; nobody hurt', async () => {
  const clock = createVirtualClock();
  const { srv, W, evil, good } = await setup(clock);
  const r = W.copies[0];
  const wolf = [...r.entities.values()].find(e => e.kind === 'monster');
  W.transfer(W.online.get(evil.joined.you.char), r, { x: wolf.x + 60, z: wolf.z }, 't');   // 60 m away
  await run(clock, 300);
  const refused = []; evil.on('castR', m => refused.push(m.why));
  const hp0 = wolf.hp;
  for (let i = 0; i < 10; i++) evil.cast({ slot: 0, target: wolf.id });
  await run(clock, 300);
  assert.equal(wolf.hp, hp0, 'out of range: no damage');
  W.transfer(W.online.get(evil.joined.you.char), r, { x: wolf.x + 1.5, z: wolf.z }, 't');
  await run(clock, 300);
  for (let i = 0; i < 10; i++) evil.cast({ slot: 0, target: wolf.id });   // 10 in one tick: one swing
  await run(clock, 300);
  assert.ok(refused.includes('cooldown'));
  const hits = evil.evs.filter(e => e.type === 'hit' && e.s === ent(srv, evil).id && e.d === wolf.id).length;
  assert.ok(hits <= 1, 'one swing landed, not ten: ' + hits);
  evil.close(); good.close(); await srv.stop();
});

test('loot a chest 300 m away, use a door from across the map: refused', async () => {
  const clock = createVirtualClock();
  const { srv, W, evil, good, used } = await setup(clock);
  const door = [...W.copies[0].objects.values()].find(o => o.type === 'portal');
  W.transfer(W.online.get(evil.joined.you.char), W.copies[0], { x: door.x + 300, z: door.z }, 't');
  await run(clock, 300);
  evil.use(door.id);
  await run(clock, 200);
  assert.equal(used[0].why, 'far');
  assert.equal(roomOf(srv, evil).kind, 'wilds');
  evil.use(60000); await run(clock, 200);
  assert.equal(used[1].why, 'unknown');
  evil.close(); good.close(); await srv.stop();
});

test('item fraud: someone else\'s uid, a made-up uid, a replayed uid, a trade offer of what you do not own', async () => {
  const clock = createVirtualClock();
  const { srv, W, evil, good, errs } = await setup(clock);
  const blade = good.joined.you.bag[0];
  evil.item('equip', blade.uid); evil.item('destroy', blade.uid); evil.item('destroy', 'p0-00000000-1');
  await run(clock, 200);
  assert.deepEqual(errs, ['item', 'item', 'item']);
  // trade: offer the honest player's blade, and more gold than you have
  let ask = null; good.on('tradeAsk', m => { ask = m; });
  evil.tradeOp('ask', { id: good.you });
  await until(clock, () => ask);
  good.tradeOp('accept', { id: ask.trade }); await run(clock, 200);
  evil.tradeOp('offer', { id: ask.trade, items: [blade.uid], gold: 0 });
  evil.tradeOp('offer', { id: ask.trade, items: [], gold: 1e6 });
  evil.tradeOp('offer', { id: ask.trade, items: ['x', 'x'], gold: 0 });     // the same uid twice
  await run(clock, 200);
  assert.deepEqual(errs.slice(3), ['item', 'trade', 'item']);
  assert.ok(good.joined.you.bag.some(i => i.uid === blade.uid));
  assert.equal(W.status().trades.done, 0);
  evil.close(); good.close(); await srv.stop();
});

test('oversized, malformed and flooding sockets are dropped or kicked; everyone else plays on', async () => {
  const clock = createVirtualClock();
  const { srv, W, evil, good } = await setup(clock);
  evil._raw('p', 'x'.repeat(20000));
  evil._raw('p', '{"t":"say","text":');
  evil._raw('p', JSON.stringify({ t: 'say', text: 'y'.repeat(5000) }));
  evil._raw('p', new Uint8Array([1, 2, 3]));
  await run(clock, 200);
  assert.ok(W.status().bad >= 4);
  assert.equal(evil.status, 'online', 'a few bad frames are only dropped');
  // 1,000 messages a second for a second: kicked
  for (let i = 0; i < 1000; i++) { evil._raw('p', JSON.stringify({ t: 'target', id: 1 })); if (i % 50 === 0) await run(clock, 50, 50); }
  await run(clock, 500);
  assert.equal(evil.status, 'kicked');
  assert.equal(evil.lastKick.code, 'abuse');
  // the honest player still moves and is unharmed
  const e = ent(srv, good), z0 = e.z;
  let s = 5000;
  for (let i = 0; i < 10; i++) { good.input({ s: ++s, dt: 50, mx: 0, mz: 1, yaw: 0, b: 0 }); await run(clock, 50, 50); }
  assert.ok(ent(srv, good).z > z0 + 2);
  assert.equal(good.status, 'online');
  good.close(); await srv.stop();
});
