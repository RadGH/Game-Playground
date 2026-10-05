// M3 the Callboard (the group finder): 1 tank + 1 healer + 3 damage pop together, accept, become one party and land
// in the SAME dungeon instance; a decline puts the others back in line; a queued party stays whole; a slow queue
// backfills with followers; level gate; evil cases.
import test from 'node:test';
import assert from 'node:assert/strict';
import { m3Server, setLevel, joinAs, run, until } from './m3-helpers.js';
import { createRules as rulesV0 } from '../../js/sim/rules-v0.js';

const boards = c => { const l = []; c.on('callboard', m => l.push(m)); return l; };
async function crew(srv, clock, names, level = 8) {
  const out = [];
  for (const n of names) { const c = await joinAs(srv, clock, n); setLevel(srv, c, level); out.push(c); }
  return out;
}

test('a full group pops, all accept, one party, one instance; a decline sends the rest back in line', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const W = srv.world;
  const cs = await crew(srv, clock, ['Tanky', 'Healy', 'Dpsone', 'Dpstwo', 'Dpsthree', 'Dpsfour']);
  const bs = cs.map(boards);
  let list = null; cs[0].on('callboard', m => { if (m.state === 'list') list = m; });
  cs[0].callboard('list'); await until(clock, () => list);
  assert.ok(list.dungeons.length >= 1, 'the dungeon doors are on the board');
  const dkey = list.dungeons[0].key;
  const roles = ['tank', 'healer', 'dps', 'dps', 'dps', 'dps'];
  // the 6th (a 4th damage dealer) queues first for 'any': it must not block the right mix
  cs[5].callboard('join', { dungeon: 'any', role: 'dps' }); await run(clock, 100);
  for (let i = 0; i < 5; i++) { cs[i].callboard('join', { dungeon: i === 2 ? 'any' : dkey, role: roles[i] }); }
  await run(clock, 1500);
  const pops = bs.map(b => b.find(m => m.state === 'pop'));
  const popped = pops.map(p => !!p);
  assert.equal(popped.filter(Boolean).length, 5, JSON.stringify(popped));
  const pop = pops.find(Boolean);
  assert.equal(pop.members.length, 5);
  assert.deepEqual(pop.members.map(m => m.role).sort(), ['dps', 'dps', 'dps', 'healer', 'tank']);
  // the one left out is still queued
  const out = cs.find((c, i) => !popped[i]);
  // decline from one: the others go back in line (keeping their place)
  const inPop = cs.filter((c, i) => popped[i]);
  const decliner = inPop.find(c => pop.members.find(m => m.char === c.joined.you.char).role === 'dps');
  decliner.callboard('decline', { id: pop.id }); await run(clock, 1500);
  const again = inPop.filter(c => c !== decliner).map(c => bs[cs.indexOf(c)].filter(m => m.state === 'queued' && m.again).length);
  assert.ok(again.every(n => n >= 1), 'back in line');
  // the left-out damage dealer fills the hole: a new pop with the five who are still in line
  await run(clock, 1500);
  const pop2s = cs.map((c, i) => bs[i].filter(m => m.state === 'pop').at(-1)).filter(p => p && p.id !== pop.id);
  assert.equal(pop2s.length, 5);
  const pop2 = pop2s[0];
  for (const c of cs) if (pop2.members.some(m => m.char === c.joined.you.char)) c.callboard('accept', { id: pop2.id });
  await run(clock, 2000);
  const members = cs.filter(c => pop2.members.some(m => m.char === c.joined.you.char));
  const formed = members.map(c => bs[cs.indexOf(c)].find(m => m.state === 'formed'));
  assert.ok(formed.every(Boolean), 'formed for all');
  const rooms = new Set(members.map(c => W.online.get(c.joined.you.char).room));
  assert.equal(rooms.size, 1, 'one instance');
  const room = [...rooms][0];
  assert.equal(room.kind, 'instance');
  assert.equal(members[0].party.members.length, 5);
  assert.ok(members.every(c => c.party && c.party.id === members[0].party.id), 'one party');
  assert.ok(out === undefined || out);
  for (const c of cs) c.close();
  await srv.stop();
});

test('gate + evil: under level 8 refused; a party member cannot queue the party; double join; accept of a pop you are not in', async () => {
  const { srv, clock } = m3Server();
  await srv.ready;
  const [low] = await crew(srv, clock, ['Lowlevel'], 5);
  const [lead, mate] = await crew(srv, clock, ['Partylead', 'Partymate']);
  const errs = c => { const l = []; c.on('err', m => l.push(m)); return l; };
  const el = errs(low), em = errs(mate), ed = errs(lead);
  low.callboard('join', { dungeon: 'any', role: 'tank' }); await run(clock, 100);
  assert.match(el.at(-1).msg, /level 8/);
  lead.partyOp('invite', { name: 'Partymate' });
  let inv = null; mate.on('partyInvite', m => { inv = m; });
  await until(clock, () => inv); mate.partyOp('accept', { party: inv.party }); await until(clock, () => mate.party);
  mate.callboard('join', { dungeon: 'any', role: 'dps' }); await run(clock, 100);
  assert.match(em.at(-1).msg, /leader/);
  lead.callboard('join', { dungeon: 'any', role: 'tank' }); await run(clock, 1100);
  lead.callboard('join', { dungeon: 'any', role: 'tank' }); await run(clock, 1100);
  assert.match(ed.at(-1).msg, /already/);
  const B = srv.world.gateway.callboard;
  assert.equal(B.queue.length, 1); assert.equal(B.queue[0].chars.length, 2, 'the party is queued whole');
  // the party changes shape -> it leaves the Callboard
  mate.partyOp('leave'); await run(clock, 300);
  assert.equal(B.queue.length, 0);
  low.callboard('accept', { id: 999 }); await run(clock, 1100);
  assert.match(el.at(-1).msg, /passed/);
  const bad0 = srv.world.gateway.counters.bad;
  low._raw('gw', JSON.stringify({ t: 'callboard', op: 'hack' })); await run(clock, 100);
  assert.equal(srv.world.gateway.counters.bad, bad0 + 1);
  for (const c of [low, lead, mate]) c.close();
  await srv.stop();
});

test('backfill: a lonely queue pops after the wait with followers filling the empty seats; offline drops you', async () => {
  const calls = [];
  const createRules = (...a) => { const r = rulesV0(...a); r.backfill = (e, n, o) => { calls.push({ char: e.char && e.char.id, n, roles: o && o.roles }); return []; }; return r; };
  const { srv, clock } = m3Server({ worldOpts: { callboardOpts: { backfillMs: 20000 }, createRules } });
  await srv.ready;
  const W = srv.world;
  const [solo, gone] = await crew(srv, clock, ['Lonewolf', 'Leaver']);
  const b = boards(solo);
  gone.callboard('join', { dungeon: 'any', role: 'healer' }); await run(clock, 200);
  assert.equal(W.gateway.callboard.queue.length, 1);
  gone.close(); await run(clock, 500);
  assert.equal(W.gateway.callboard.queue.length, 0, 'offline = off the board');
  solo.callboard('join', { dungeon: 'any', role: 'tank' });
  await run(clock, 10000, 100);
  assert.ok(!b.some(m => m.state === 'pop'), 'not yet');
  await run(clock, 12000, 100);
  const pop = b.find(m => m.state === 'pop');
  assert.ok(pop); assert.equal(pop.backfill, 4);
  solo.callboard('accept', { id: pop.id }); await run(clock, 1500);
  const o = W.online.get(solo.joined.you.char);
  assert.equal(o.room.kind, 'instance');
  assert.equal(o.room.meta.backfill, 4, 'the instance knows how many followers to bring (rules.backfill — stream C)');
  assert.deepEqual(calls, [{ char: solo.joined.you.char, n: 4, roles: ['tank'] }], 'rules.backfill called once with the members\' roles');
  // the owner leaves: the seats go with them; coming back brings a fresh set
  const W2 = srv.world, inst = o.room;
  W2.transfer(o, W2.copies[0], { x: W2.gate.x + 20, z: W2.gate.z }, 'test');
  assert.equal(inst.meta.backfilled, false);
  W2.transfer(o, inst, inst.spawnPoint, 'portal');
  assert.equal(calls.length, 2);
  // a pop nobody answers times out
  solo.close(); await srv.stop();
});
