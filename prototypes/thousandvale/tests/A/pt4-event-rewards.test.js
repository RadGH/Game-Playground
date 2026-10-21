// Play-test 4 S24 (stream A + E): "Raiders at Torborhold — beat the boss, it dropped only 20 gold, no item". Every event
// pays EACH participant personally: at least one rare-or-better item (as their own share on the boss's body), plus bonus
// experience and gold scaled by the event's level and how long it ran, said as "Event complete: +N XP, +G gold".
// Root causes: the raid had no boss, so the runner raised a WOLF named after the event; the reward was a flat 20 gold
// and a `rare` roll that could come back empty; nothing told the player what they got.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { realServer, joinReal, rec, run, until, realContent } from './pt1-helpers.js';
import { eventReward, RARE_UP, lengthFactor } from '../../js/sim/events.js';

const EV = JSON.parse(readFileSync(new URL('../../data/quests/events.json', import.meta.url), 'utf8'));

test('S24 data: every event has a real boss (an encounter or a monster) and a reward table', () => {
  for (const e of [...EV.realm, ...EV.zone]) {
    assert.ok(e.boss || e.encounter || e.monster, e.id + ': a boss to beat (else the runner raises a wolf)');
    assert.ok(e.reward && e.reward.xp > 0 && e.reward.gold > 0, e.id + ': a reward table');
  }
});

test('S24: every event pays every participant a rare-or-better and scaled bonus xp + gold (world boss more)', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Eventgoer', 'warrior');
  const o = rec(world, a);
  const L = world.layouts[0];
  const C = await realContent();
  const all = [...L.zoneEvents, ...(C.events || [])].filter(Boolean);
  assert.ok(all.some(e => e.id === 'siege_torborhold') && all.some(e => e.kind === 'worldboss'), 'the realm events too');
  assert.ok(all.length >= 10, 'events: ' + all.length);
  for (const ev of all) for (let i = 0; i < 6; i++) {
    const short = eventReward(ev, o.room.rules, o.entity, Math.random, { minutes: 2 });
    assert.ok(short.items.some(it => RARE_UP.has(it.rarity)), ev.id + ': a rare+ every time: ' + short.items.map(x => x.rarity));
    const long = eventReward(ev, o.room.rules, o.entity, Math.random, { minutes: 12 });
    assert.ok(long.xp > short.xp && long.gold > short.gold, ev.id + ': a longer event pays more');
  }
  assert.equal(lengthFactor(1), 1); assert.equal(lengthFactor(100), 2.5);
  const torb = all.find(e => e.id === 'siege_torborhold');
  { assert.equal(torb.monster, 'brigand_captain'); const r = eventReward(torb, o.room.rules, o.entity, Math.random, { minutes: 8 }); assert.ok(r.gold > 20 * 1.5, 'more than the flat 20 gold: ' + r.gold); }
  const wb = all.find(e => e.kind === 'worldboss');
  { const r = eventReward(wb, o.room.rules, o.entity, Math.random, { minutes: 8 }); assert.ok(r.items.length >= 2, 'a world boss pays more'); }
  a.close(); await srv.stop();
});

test('S24 / #109: winning a zone event: "Event complete" with the numbers, the rare goes straight into my bag', async () => {
  const { srv, clock, world } = await realServer();
  const P = world.province, L = world.layouts[0];
  const def = L.zoneEvents.find(e => e.boss === 'event_grandmother_skein') || L.zoneEvents.find(e => e.eid === 'test');
  const a = await joinReal(srv, clock, 'Victor');
  const o = rec(world, a), room = P.copies[0];
  P.devSetLevel(o.char.id, 25);
  const done = [], spark = [], chat = [];
  a.on('eventDone', m => done.push(m)); a.on('lootable', m => spark.push(m)); a.on('chat', m => chat.push(m));
  const zev = []; a.on('zoneEvent', m => zev.push(m));
  if (o.entity.dead) o.entity.revive(1);
  P.transfer(o, room, { x: def.x + (def.r || 40) + 10, z: def.z }, 'test');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'start'), 30000), 'it starts');
  const mine = () => [...room.entities.values()].filter(e => e.kind === 'monster' && e.data && String(e.data.event || '').startsWith(def.id) && !e.dead);
  let boss = null;
  for (let k = 0; k < 60 && !done.length; k++) {
    for (const m of mine()) { if (m.rank === 'boss') boss = m; o.entity.x = m.x + 1; o.entity.z = m.z; room.event({ type: 'hit', s: o.entity.id, d: m.id, n: 5, kind: 'dmg' }); m.kill(o.entity); }
    await run(clock, 2000);
  }
  assert.ok(done.length, 'eventDone arrived');
  const d = done[0];
  assert.match(d.text, /^Event complete: \+\d+ XP, \+\d+ gold/);
  assert.ok(d.xp > 0 && d.gold > 0 && d.items.some(it => RARE_UP.has(it.rarity)), JSON.stringify(d));
  assert.ok(chat.some(m => m.ch === 'system' && /Event complete/.test(m.text)), 'said in chat');
  assert.equal(d.onBody, undefined, '#109: nothing waits on a body that may be gone');
  assert.ok(d.items.every(it => o.char.bag.some(b => b.name === it.name)), 'the share is in the bag');
  if (d.onBody) {
    assert.ok(spark.some(m => m.id === d.onBody && m.on && RARE_UP.has(m.best)), 'the body sparkles in the item\'s rarity for me');
    if (o.entity.dead) o.entity.revive(1);              // the waves may have dropped the watcher; standing again to loot
    o.entity.x = boss.x + 1; o.entity.z = boss.z;
    const bag0 = o.char.bag.length;
    const lr = []; a.on('lootR', m => lr.push(m));
    a.loot('all', { id: d.onBody }); await run(clock, 300);
    assert.ok(o.char.bag.length > bag0, 'taken from the boss');
  }
  a.close(); await srv.stop();
});
