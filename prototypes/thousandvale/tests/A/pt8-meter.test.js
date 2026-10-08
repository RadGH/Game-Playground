// Owner feedback 8, W21 (report #42): the damage meter's per-hit feed. Off by default — nobody is sent a `hits` message
// unless they asked (`meter {on:true}`); then every landed hit, heal and miss where the source or the target is you or a
// member of your party arrives in compact rows, a stranger's fight never does, and `meter {on:false}` stops it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { makeServer, joinAs, run, until } from './helpers.js';

const rec = (W, c) => W.online.get(c.joined.you.char);
async function party(srv, clock) {
  const a = await joinAs(srv, clock, 'Metera'), b = await joinAs(srv, clock, 'Meterb'), c = await joinAs(srv, clock, 'Stranger');
  const W = srv.world;
  let inv = null; b.on('partyInvite', m => { inv = m; });
  a.partyOp('invite', { name: 'Meterb' }); await until(clock, () => !!inv, 2000);
  b.partyOp('accept', { party: inv.party }); await run(clock, 300);
  for (const x of [a, b, c]) W.transfer(rec(W, x), W.copies[0], { x: W.gate.x + 60, z: W.gate.z + 60 }, 'test');
  await run(clock, 300);
  return { a, b, c, W };
}

test('W21: `hits` rows reach only a client that turned the meter on — its own and its party\'s hits, heals and misses, never a stranger\'s', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const { a, b, c, W } = await party(srv, clock);
  const ha = [], hb = [], hc = [], mr = [];
  a.on('hits', m => ha.push(...m.l)); b.on('hits', m => hb.push(...m.l)); c.on('hits', m => hc.push(...m.l)); a.on('meterR', m => mr.push(m));
  const ea = rec(W, a).entity, eb = rec(W, b).entity, ec = rec(W, c).entity, r = ea.room;
  const wolf = r.spawn({ kind: 'monster', type: 'wolf', level: 1, x: ea.x + 2, z: ea.z, team: 2 });
  const hit = (s, d, n, x = {}) => r.event({ type: 'hit', s: s.id, d: d.id, n, kind: 'dmg', skill: 'melee', ...x });
  // nobody asked: nothing is sent to anybody
  hit(ea, wolf, 7); await run(clock, 600);
  assert.equal(ha.length + hb.length + hc.length, 0, 'off by default');
  // A turns it on
  a.meter(true); await until(clock, () => mr.length);
  assert.equal(mr[0].on, true);
  hit(ea, wolf, 11, { crit: true, ab: 'cleave', el: 'fire' });          // mine
  hit(eb, wolf, 5);                                                      // my party's
  hit(wolf, eb, 3, { ab: 'bite' });                                      // taken by my party
  hit(ec, wolf, 99);                                                     // a stranger's: not mine to see
  r.event({ type: 'hit', s: eb.id, d: ea.id, n: 20, kind: 'heal' });     // a heal on me
  r.event({ type: 'miss', s: wolf.id, d: ea.id, why: 'dodge' });         // a miss on me
  r.event({ type: 'hit', s: 0, d: wolf.id, n: 4, kind: 'dmg', skill: 'dot' });      // a tick with no source: nobody's
  await run(clock, 600);
  assert.equal(ha.length, 5, JSON.stringify(ha));
  assert.deepEqual(ha[0], [ea.id, wolf.id, 11, 2, 'cleave', 'fire', 0, 0]);
  assert.deepEqual(ha[1], [eb.id, wolf.id, 5, 0, 'melee', '', 0, 0]);
  assert.deepEqual(ha[2], [wolf.id, eb.id, 3, 0, 'bite', '', 0, 0]);
  assert.deepEqual(ha[3].slice(0, 4), [eb.id, ea.id, 20, 1], 'a heal has flag 1');
  assert.deepEqual(ha[4].slice(0, 4), [wolf.id, ea.id, 0, 4 | 64], 'a dodge: miss + dodged');
  assert.ok(!ha.some(row => row[0] === ec.id), 'the stranger\'s 99 is not in my meter');
  assert.equal(hb.length + hc.length, 0, 'the others did not ask and got nothing');
  // a pet's hit counts for its owner's party; a killing blow is flagged
  const pet = r.spawn({ kind: 'npc', type: 'wolf', name: 'Fang', level: 1, x: eb.x + 1, z: eb.z, team: 1, data: { pet: true, owner: eb.id } });
  hit(pet, wolf, 6);
  wolf.kill(ea); hit(ea, wolf, 30);
  await run(clock, 600);
  assert.deepEqual(ha[5].slice(0, 3), [pet.id, wolf.id, 6]);
  assert.equal(ha[6][3] & 8, 8, 'killing blow');
  // off again
  a.meter(false); await until(clock, () => mr.length >= 2);
  hit(ea, ec, 1); hit(ea, wolf, 1); await run(clock, 600);
  assert.equal(ha.length, 7, 'nothing after it is turned off');
  a.close(); b.close(); c.close(); await srv.stop();
});
