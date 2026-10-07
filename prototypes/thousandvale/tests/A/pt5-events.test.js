// Play-test 5 (stream A) — T12 "an event started, a few wolves spawned, I killed them, the event did not end. No indication of
// what the event was, what to do, how long it lasts or what the reward is" and T11 "the 'teleport there now' notice stays
// on screen when you are already there".
//   * the bug: a wave used to stand on a ring 32-40 m round the arena centre; monsters notice a player at ~26 m, so the ones
//     nobody walked up to never came and the wave never cleared. Now a wave arrives next to the players in the arena and
//     hunts them: a player who only ever fights what comes to them finishes the event.
//   * every second: `eventTrack` with name, what, objective + live progress, stage, time left, reward, inside, credited
//   * every event ENDS: success (eventDone with what you got) or fail (time / everyone left), for everyone who was there
//   * `eventAt` when you walk into / out of an event's area; travel 'event' when already there answers 'here'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEventRunner, rewardPreview, WAVE_NEAR_M } from '../../js/sim/events.js';
import { realServer, joinReal, rec, run, until } from './pt1-helpers.js';

const EV = JSON.parse(readFileSync(new URL('../../data/quests/events.json', import.meta.url), 'utf8'));

test('T12 data: every event says what it is, what to do, how long it lasts and what it pays (E\'s info block reaches the runner)', async () => {
  const { srv, world } = await realServer();
  const L = world.layouts[0];
  assert.ok(L.zoneEvents.length >= 10);
  for (const d of L.zoneEvents) {
    assert.ok(d.info && d.info.what && d.info.objective && d.info.objective.text && d.info.rewardText && d.info.onSuccess && d.info.onFail, d.id + ': info block');
    assert.ok(d.durationMs > 0 || d.info.durationSec > 0, d.id + ': a time limit');
    const pv = rewardPreview(d, world.province.copies[0].rules, d.level);
    assert.ok(pv.xp > 0 && pv.gold > 0 && pv.items.length && pv.text, d.id + ': a reward to show');
  }
  for (const e of EV.realm) assert.ok(e.info && e.info.what, e.id + ': realm events too');
  await srv.stop();
});

test('T12 the bug: a player who stands in the arena and only fights what comes to them still finishes every wave (waves arrive at the players and hunt)', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false });
  const P = world.province, L = world.layouts[0];
  const def = L.zoneEvents.find(e => e.boss === 'event_grandmother_skein') || L.zoneEvents.find(e => e.eid === 'test');
  const a = await joinReal(srv, clock, 'Standfast');
  const o = rec(world, a), room = P.copies[0];
  P.devSetLevel(o.char.id, 30);
  const tracks = [], done = [], zev = [], at = [];
  a.on('eventTrack', m => tracks.push(m)); a.on('eventDone', m => done.push(m)); a.on('zoneEvent', m => zev.push(m)); a.on('eventAt', m => at.push(m));
  // stand a little off the middle of the arena and do not move again
  const here = { x: def.x + 12, z: def.z + 5 };
  P.transfer(o, room, here, 'test');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'soon'), 4000), 'the countdown');
  // the tracker is already there during the countdown, with a start time
  assert.ok(await until(clock, () => tracks.some(t => t.state === 'soon'), 3000), 'a tracker during the countdown');
  const soon = tracks.find(t => t.state === 'soon');
  assert.ok(soon.name && soon.what && soon.startsAt > 0 && soon.reward && soon.reward.text && soon.inside === true, 'soon: ' + JSON.stringify(soon).slice(0, 300));
  assert.ok(at.some(m => m.uid), 'eventAt: you are standing in it');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'start'), 20000), 'it starts');
  const mine = () => [...room.entities.values()].filter(e => e.kind === 'monster' && e.data && String(e.data.event || '').startsWith(def.id) && !e.dead);
  assert.ok(await until(clock, () => mine().length > 0, 6000), 'the first wave');
  // every monster of the wave landed within reach of where I stand (not on a far ring)
  for (const m of mine()) assert.ok(Math.hypot(m.x - here.x, m.z - here.z) <= WAVE_NEAR_M[1] + 6, 'a wave monster ' + Math.round(Math.hypot(m.x - here.x, m.z - here.z)) + ' m away');
  // the owner's fight: I only ever kill what is within 12 m of me (what came for me). No walking, no searching.
  let waves = new Set(), sawKill = false, sawBoss = false, lastObjective = null;
  for (let k = 0; k < 400 && !done.length; k++) {
    if (o.entity.dead) o.entity.revive(1);
    o.entity.setHp(o.entity.hpMax);
    if (o.entity.r && o.entity.r.unit) { o.entity.r.unit.hp = o.entity.r.unit.maxHp; }
    for (const m of mine()) if (Math.hypot(m.x - o.entity.x, m.z - o.entity.z) <= 12) { m.kill(o.entity); if (m.r && m.r.unit) m.r.unit.hp = 0; }
    await run(clock, 1000);
    const t = tracks.at(-1);
    if (t && t.state === 'live') {
      lastObjective = t.objective;
      if (t.objective.kind === 'kill') { waves.add(t.stage.n); if (t.objective.n > 0) sawKill = true; }
      if (t.objective.kind === 'boss') sawBoss = true;
    }
  }
  assert.ok(done.length, 'the event ENDED (it used to stand until its ten minutes ran out): last objective ' + JSON.stringify(lastObjective) + ', waves seen ' + [...waves]);
  assert.equal(done[0].result, 'success', JSON.stringify(done[0]));
  assert.ok(waves.size >= def.waves.length, 'every wave came to me: ' + [...waves]);
  assert.ok(sawKill, 'the objective counted my kills');
  assert.ok(sawBoss, 'then the boss, as its own objective');
  // the live tracker said everything
  const live = tracks.filter(t => t.state === 'live');
  const t0 = live[0];
  assert.ok(t0.name === def.name && typeof t0.what === 'string' && t0.what.length > 10, 'what is happening');
  assert.ok(t0.objective && t0.objective.text && Number.isInteger(t0.objective.n) && t0.objective.of >= 1, 'objective with progress');
  assert.ok(t0.stage && t0.stage.of === def.waves.length + 1, 'stages = waves + the boss');
  assert.ok(t0.leftMs > 0 && t0.endsAt > Date.now() - 86400000, 'time left');
  assert.ok(t0.reward && t0.reward.xp > 0 && t0.rewardText, 'the reward');
  assert.equal(t0.inside, true); assert.equal(t0.inRange, true);
  assert.ok(live.some(t => t.credited === true), 'credited once I had done something');
  // the result: what I got, in one line, and the zone hears the end with a result
  assert.ok(done[0].credited && done[0].xp > 0 && done[0].gold > 0 && /^Event complete: \+\d+ XP/.test(done[0].text), done[0].text);
  const end = zev.find(m => m.kind === 'end');
  assert.ok(end && end.result === 'success' && end.text, 'zoneEvent end carries the result');
  assert.ok(at.at(-1).uid === null, 'eventAt cleared when it ended');
  a.close(); await srv.stop();
});

test('T12: an event everyone walks away from FAILS and says so (it does not stand for ten minutes); out of time fails too', async () => {
  const { srv, clock, world } = await realServer({ roadEvents: false, eventAbandonMs: 20000 });
  const P = world.province, L = world.layouts[0];
  const def = L.zoneEvents.find(e => e.eid === 'test');
  const a = await joinReal(srv, clock, 'Leaver');
  const o = rec(world, a), room = P.copies[0];
  P.devSetLevel(o.char.id, 30);
  const done = [], zev = [];
  a.on('eventDone', m => done.push(m)); a.on('zoneEvent', m => zev.push(m));
  P.transfer(o, room, { x: def.x + 10, z: def.z }, 'test');
  assert.ok(await until(clock, () => zev.some(m => m.kind === 'start'), 30000), 'started');
  await run(clock, 3000);
  P.transfer(o, room, { x: def.x + 900, z: def.z }, 'test');      // walk off
  assert.ok(await until(clock, () => done.length > 0, 40000), 'it ended without me');
  assert.equal(done[0].result, 'fail'); assert.equal(done[0].why, 'left');
  assert.match(done[0].text, /^Event failed: /);
  assert.equal(done[0].xp, 0);
  const mine = [...room.entities.values()].filter(e => e.kind === 'monster' && e.data && String(e.data.event || '').startsWith(def.id) && !e.dead);
  assert.equal(mine.length, 0, 'its monsters are gone');
  a.close(); await srv.stop();
});

test('T12 runner (unit): waves-only events end when the last wave is down (no stand-in "wolf" boss); time out = lost with why:time; objective counts', () => {
  let t = 0;
  const ents = new Map(); let id = 1;
  const player = { id: 900, kind: 'player', char: { id: 1 }, x: 5, z: 0, dead: false };
  const room = {
    now: () => t, walkable: () => true,
    host: { near: (x, z, r, f) => [player, ...ents.values()].filter(e => Math.hypot(e.x - x, e.z - z) <= r && (!f || f(e))), random: () => 0.5 },
    spawn(spec) { const e = { id: id++, ...spec, dead: false, removed: false, hp: 10, hpMax: 10, state: 0, r: {}, setMax() {}, setHp() {} }; ents.set(e.id, e); return e; },
    remove(e) { e.removed = true; ents.delete(e.id); },
  };
  const ev = { uid: 'u', id: 'siege', name: 'The Siege', x: 0, z: 0, r: 40, level: 3, durationMs: 60000, waves: [{ type: 'road_brigand', count: [3, 3] }, { type: 'brigand_archer', count: [2, 2] }], boss: null, monster: null, info: { what: 'Brigands at the gate.' } };
  const run1 = createEventRunner({ room, ev, rng: () => 0.5 });
  assert.equal(run1.step(), 'live');
  assert.equal(ents.size, 3);
  for (const e of ents.values()) assert.ok(Math.hypot(e.x - player.x, e.z - player.z) <= WAVE_NEAR_M[1] + 0.01, 'the wave lands by the player');
  let v = run1.view();
  assert.deepEqual([v.objective.kind, v.objective.n, v.objective.of, v.stage.n, v.stage.of], ['kill', 0, 3, 1, 2]);
  assert.match(v.objective.text, /road brigands/);
  [...ents.values()][0].dead = true;
  assert.equal(run1.view().objective.n, 1);
  for (const e of ents.values()) e.dead = true;
  t += 5000; assert.equal(run1.step(), 'live');                    // the second wave
  assert.equal([...ents.values()].filter(e => !e.dead).length, 2);
  for (const e of ents.values()) e.dead = true;
  t += 5000;
  assert.equal(run1.step(), 'won', 'no boss in the data: the last wave down wins it');
  assert.ok(![...ents.values()].some(e => e.type === 'wolf'), 'no stand-in wolf boss');
  // out of time
  t = 0; ents.clear();
  const run2 = createEventRunner({ room, ev: { ...ev, uid: 'v' }, rng: () => 0.5 });
  run2.step(); t += 61000;
  assert.equal(run2.step(), 'lost'); assert.equal(run2.why, 'time');
  assert.equal(ents.size, 0, 'cleared');
});
