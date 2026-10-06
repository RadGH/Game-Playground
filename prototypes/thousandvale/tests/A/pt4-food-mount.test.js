// Play-test 4 (stream A): S20 eating is a SIT state — regen over time out of combat; a step, a jump, a cast, standing
// up or a hit ends it; others see you sitting. S21 calling a mount sends the channel start/end the cast bar draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run } from './helpers.js';
import { xpFor } from '../../js/sim/rules-v0.js';
import { ANIM_ID } from '../../js/net/protocol.js';

const rec = (W, c) => W.online.get(c.joined.you.char);
const box = (c, types) => { const b = []; for (const t of types) c.on(t, m => b.push(Array.isArray(m) ? { t, list: m } : { ...m, t })); return b; };
const ration = () => ({ kind: 'good', id: 'travel_rations', name: 'Travel rations', rarity: 'normal', use: { type: 'food', regen: 0.04, seconds: 20 } });
let seq = 1;
const step = (c, mx, b = 0) => c.input({ s: seq++, dt: 50, mx, mz: 0, yaw: 0, b });

async function eater(name) {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, name), b = await joinAs(srv, clock, name + 'Watch');
  for (const c of [a, b]) W.transfer(rec(W, c), W.copies[0], { x: W.gate.x + 30, z: W.gate.z + (c === b ? 3 : 0) }, 'test');
  await run(clock, 300);
  const o = rec(W, a), e = o.entity;
  W.grant(o, { items: [ration(), ration(), ration(), ration()], gold: 0, reason: 'test' }); await run(clock, 200);
  return { clock, srv, W, a, b, o, e };
}

test('S20: eating sits you down (anim + info.sit others see), mends over time, and ends on a step', async () => {
  const { clock, srv, a, b, o, e } = await eater('Sitter');
  const got = box(a, ['itemR', 'you']);
  e.setHp(Math.round(e.hpMax * 0.2)); const hp0 = e.hp;
  a.item('use', 'id:travel_rations'); await run(clock, 2100, 50);
  assert.ok(got.some(x => x.t === 'itemR' && x.ok && x.sit), 'sat down');
  assert.ok(got.some(x => x.t === 'you' && x.regen && x.regen.sit));
  assert.equal(e.sitting, true); assert.equal(e.animId, ANIM_ID.sit, 'the sit pose on the wire');
  assert.equal(b.mirror.infos.get(e.id).sit, 1, 'the other player sees them sitting');
  assert.ok(e.hp > hp0, 'mending');
  // standing still keeps the meal (idle input does not stand you up)
  step(a, 0); await run(clock, 1100, 50);
  assert.ok(o.regen, 'still eating with no movement');
  step(a, 1); await run(clock, 100);
  assert.equal(o.regen, null, 'a step ends the meal at once');
  assert.equal(e.sitting, false);
  assert.equal(got.filter(x => x.t === 'you' && x.regen === null).pop().why, 'moved');
  await run(clock, 600);
  assert.equal(b.mirror.infos.get(e.id).sit, undefined, 'standing for everyone');
  await run(clock, 2100, 50);
  assert.equal(o.regen, null, 'the meal stays over (only the slow natural regen from here)');
  a.close(); b.close(); await srv.stop();
});

test('S20: standing up, a jump, a cast and a hit each end the meal', async () => {
  const { clock, srv, a, b, o, e } = await eater('Quitter');
  const got = box(a, ['you']);
  const why = () => got.filter(x => x.t === 'you' && x.regen === null).pop().why;
  e.setHp(Math.round(e.hpMax * 0.2));
  a.item('use', 'id:travel_rations'); await run(clock, 200);
  a.stand(); await run(clock, 100);
  assert.equal(o.regen, null); assert.equal(why(), 'stood');
  a.item('use', 'id:travel_rations'); await run(clock, 200);
  step(a, 0, 2); await run(clock, 200);                       // IN.JUMP
  assert.equal(o.regen, null, 'a jump stands you up'); assert.equal(why(), 'moved');
  await run(clock, 1500);
  a.item('use', 'id:travel_rations'); await run(clock, 200);
  a.cast({ slot: 0 }); await run(clock, 100);
  assert.equal(o.regen, null); assert.equal(why(), 'cast');
  a.item('use', 'id:travel_rations'); await run(clock, 200);
  const wolf = e.room.spawn({ kind: 'monster', type: 'wolf', level: 1, x: e.x + 30, z: e.z, team: 2 });
  e.room.event({ type: 'hit', s: wolf.id, d: e.id, n: 1, kind: 'dmg' }); await run(clock, 1100, 50);
  assert.equal(o.regen, null); assert.equal(why(), 'hit');
  assert.equal(e.sitting, false);
  a.close(); b.close(); await srv.stop();
});

test('S21: calling a mount sends channel start (ms) and end done / broken for the cast bar', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Caller');
  const o = rec(W, a);
  o.room.award(o.entity, { xp: xpFor(5), reason: 'quest' }); await run(clock, 200);
  W.transfer(o, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 'test'); await run(clock, 300);
  const ch = () => a.evs.filter(x => x.type === 'fx' && x.kind === 'channel' && x.id === o.entity.id && x.ab === 'mount');
  const got = box(a, ['mountR']);
  a.mount('summon'); await run(clock, 300);
  const start = ch().pop();
  assert.equal(start.ms, 1500); assert.ok(/^Call /.test(start.name));
  assert.ok(got.pop().until > 0, 'mountR carries the end time');
  await run(clock, 1500);
  assert.equal(ch().pop().end, 'done');
  assert.equal(rec(W, a).entity.mount, 'trail_horse');
  a.mount('off'); await run(clock, 200);
  a.mount('summon'); await run(clock, 300);
  W.transfer(o, o.room, { x: o.entity.x + 3, z: o.entity.z }, 'test'); await run(clock, 300);
  const end = ch().pop();
  assert.equal(end.end, 'broken'); assert.equal(end.why, 'moved');
  a.close(); await srv.stop();
});
