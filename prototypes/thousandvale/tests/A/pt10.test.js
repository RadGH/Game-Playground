// Owner feedback 10 (stream A): Y37 a reconnect never shows you twice in your own party (REAL sockets, dropped and
// reconnected); Y11 `eventSync` after every join + a dead event says `gone`; Y23 every death has its own respawn clock
// and nothing comes back inside a minute in view; Y24 waystones claim at 30 m; Y8 an emptied corpse is no target; Y5
// emotes; Y17 training dummies; Y21 a rescued wanderer's thanks; Y15 angling is learned; Y30 the changelog marker; Y36
// tracking a friend; Y32 the Starcaller is a class the server takes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../server/main.mjs';
import { connect } from '../../js/net/client.js';
import { nodeSafeWsFactory } from '../../tools/bot-client.mjs';
import { createVirtualClock } from '../../js/net/clock.js';
import { createRoom, CAMP_RESPAWN_MS, RESPAWN_IN_VIEW_MS } from '../../js/sim/room.js';
import { standInTerrain } from '../../js/sim/terrain.js';
import { EVENT_TYPES, EVENT_FIELDS } from '../../js/net/protocol.js';
import { loadClasses, loadClassNames } from '../../server/load.mjs';
import { makeServer, joinAs, run, until, waitP, makeClient } from './helpers.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { m3Server, claimedAs } from './m3-helpers.js';
import { realServer, joinReal, rec } from './pt1-helpers.js';
import { gainResource } from '../../js/rules/farhold.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (fn()) return true; await sleep(20); } return !!fn(); };
const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };

test('Y32 + teleM: the Starcaller is a class id the server knows; C\'s new event has its fields', () => {
  assert.ok(loadClasses().includes('starcaller') && loadClasses().includes('warrior'));
  assert.equal(loadClassNames().starcaller, 'Starcaller');
  assert.ok(EVENT_TYPES.includes('teleM') && EVENT_FIELDS.teleM.join() === 'id,x,z');
  assert.ok(EVENT_TYPES.includes('emote'));
});

test('Y37: after a REAL socket drop and reconnect the party lists each member once, and says which one is you', { timeout: 60000 }, async () => {
  const port = 19100 + Math.floor(Math.random() * 300);
  const quiet = console.log; console.log = () => {};
  const out = process.stdout.write.bind(process.stdout); process.stdout.write = (c, ...a) => (typeof c === 'string' && c.startsWith('{"t":"') ? true : out(c, ...a));
  const S = await startServer({ port, host: '127.0.0.1', db: 'memory', build: 'dev', rules: 'auto', procs: 0, linger: 5000, maxPerIp: 50, saveEvery: 60000, process: 't', env: 'dev', adminPort: 0, director: {}, unlimitedIp: [], feedbackFile: false, journalMs: 2000 });
  console.log = quiet;
  try {
    const mk = async (name, cls) => {
      const base = nodeSafeWsFactory('ws://127.0.0.1:' + port), socks = [];
      const n = connect({ mode: 'ws', socketFactory: path => { const s = base(path); socks.push(s); return s; }, build: 'dev' });
      n.socks = socks; n.parties = []; n.on('party', p => n.parties.push(p)); n.frames = []; n.on('partyFrames', f => n.frames.push(f)); n.joins = 0; n.on('joined', () => n.joins++); n.inv = []; n.on('partyInvite', m => n.inv.push(m));
      await n.ready; const ch = await n.createChar({ name, cls }); await n.play(ch.id); n.me = ch.id; return n;
    };
    const a = await mk('Phoneuser', 'starcaller'), b = await mk('Deskuser', 'warrior');
    assert.equal(S.world.online.get(a.me).char.cls, 'starcaller', 'a Starcaller was created and is in the world (Y32)');
    a.partyOp('invite', { name: 'Deskuser' });
    assert.ok(await waitFor(() => b.inv.length));
    b.partyOp('accept', { party: b.inv[0].party });
    assert.ok(await waitFor(() => a.parties.at(-1) && a.parties.at(-1).members.length === 2));
    assert.equal(a.parties.at(-1).me, a.me, 'partyState says which member is me');
    // the phone goes dark: both of A's sockets die; the client reconnects by itself
    const j0 = a.joins, p0 = a.parties.length;
    for (const s of a.socks.splice(0)) s.close();
    assert.ok(await waitFor(() => a.joins > j0 && a.status === 'online', 15000), 'reconnected: ' + a.status);
    assert.ok(await waitFor(() => a.parties.length > p0 && a.parties.at(-1) && a.parties.at(-1).members.length === 2), 'the party came again after the rejoin');
    await sleep(1200);
    for (const n of [a, b]) {
      const p = n.parties.at(-1);
      assert.deepEqual(p.members.map(m => m.char).sort(), [a.me, b.me].sort(), 'two members, no duplicate: ' + JSON.stringify(p.members.map(m => m.name)));
      assert.equal(p.me, n.me, 'and each client is told which one it is');
      assert.equal(p.members.filter(m => m.char === n.me).length, 1, 'I am in it once');
      const f = n.frames.at(-1);
      assert.equal(new Set(f.map(r => r.char)).size, f.length, 'no char twice in the frames'); assert.equal(f.length, 2);
    }
    assert.ok(a.parties.some(p => p && p.me === a.me), 'me rode on the rejoin copy too');
    a.close(); b.close();
  } finally { await S.stop(); }
});

test('Y23: every death has its own clock (the second kill is not "back" 3 s later), and nothing returns inside a minute while a player stands by', () => {
  assert.ok(CAMP_RESPAWN_MS[0] >= 90000, 'wilds default 90-150 s');
  const mkRoom = respawnMs => createRoom({ id: 'r', terrain: standInTerrain(3, 1024), seed: 5, camps: [{ type: 'wolf', level: 1, x: 300, z: 300, count: 3, radius: 6, ...(respawnMs !== undefined ? { respawnMs } : {}) }], createRules: () => ({ addEntity(e) { e.setMax(100, 10); e.setHp(100); } }) });
  const alive = r => [...r.entities.values()].filter(m => m.kind === 'monster' && !m.dead && !m.removed);
  const step = (r, ms) => { for (let t = 0; t < ms; t += 50) r.step(); };
  // the old timer (30 s, as the stand-in world still uses): kill one at 0 s, one at 27 s
  const r = mkRoom(30000);
  step(r, 200);
  assert.equal(alive(r).length, 3);
  const [w1, w2] = alive(r);
  w1.kill(null); step(r, 27000);
  w2.kill(null); step(r, 3500);                              // 30.5 s after the first death: ONE body is due, and it is the first one's
  assert.equal(alive(r).length, 2, 'the first body is back after its own 30 s');
  step(r, 20000);                                            // 50.5 s: the second died 23.5 s ago — under the old one-clock rule it was already back
  assert.equal(alive(r).length, 2, 'the second is NOT back 3 s after it died');
  step(r, 7000);                                             // 57.5 s = 30.5 s after the second death
  assert.equal(alive(r).length, 3, 'it comes back after ITS 30 s');
  // a player standing by: nothing returns inside a minute, whatever the camp's own timer says
  const r2 = mkRoom(5000);
  step(r2, 200);
  const p = r2.addPlayer({ id: 9, name: 'Watcher', cls: 'warrior', level: 1 }, { send() {}, sendJSON() {}, you() {} }, { x: 310, z: 300 });
  assert.ok(p, 'a player by the camp');
  const [v] = alive(r2); v.kill(null);
  step(r2, 30000);
  assert.equal(alive(r2).length, 2, 'half a minute on, with me watching: still down');
  step(r2, RESPAWN_IN_VIEW_MS - 30000 + 1000);
  assert.equal(alive(r2).length, 3, 'after the minute it returns');
  // the default: not before 90 s
  const r3 = mkRoom(undefined);
  step(r3, 200); alive(r3)[0].kill(null);
  step(r3, 89000); assert.equal(alive(r3).length, 2, '89 s: not yet');
  step(r3, 62000); assert.equal(alive(r3).length, 3, 'by 151 s: back');
});

test('Y8 + Y5 + Y15 + Y11 on the stand-in world: empty corpses, emotes, learning to fish, event sync', async () => {
  const clock = createVirtualClock();
  const srv = makeServer({ clock }); await srv.ready;
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Actor'), b = await joinAs(srv, clock, 'Audience');
  const oa = () => W.online.get(a.joined.you.char);
  for (const c of [a, b]) W.transfer(W.online.get(c.joined.you.char), W.copies[0], { x: W.gate.x + 60, z: W.gate.z + 60 + (c === b ? 3 : 0) }, 'test');
  await run(clock, 400);
  // Y11: a sync follows every join; nothing is running
  const sync = on(a, 'eventSync'), tr = on(a, 'travelR');
  W.transfer(oa(), W.townRoom, { x: W.town.x, z: W.town.z }, 'test'); await run(clock, 300);
  W.transfer(oa(), W.copies[0], { x: W.gate.x + 62, z: W.gate.z + 60 }, 'test'); await run(clock, 300);
  assert.ok(sync.length >= 2 && Array.isArray(sync.at(-1).live) && sync.at(-1).realm === null, 'a sync after each room entry: ' + JSON.stringify(sync));
  const n0 = sync.length;
  a.travel('event'); await until(clock, () => tr.length);
  await until(clock, () => sync.length > n0);
  assert.equal(tr[0].ok, false); assert.equal(tr[0].why, 'noEvent'); assert.equal(tr[0].gone, true); assert.equal(tr[0].msg, 'That event is over.');
  // Y8: a dead wolf with nothing on it for me is not a target; one that holds my loot is
  const r = oa().room, e = oa().entity;
  const bare = r.spawn({ kind: 'monster', type: 'wolf', level: 1, x: e.x + 2, z: e.z, team: 2 }), rich = r.spawn({ kind: 'monster', type: 'wolf', level: 1, x: e.x - 2, z: e.z, team: 2 });
  bare.kill(e); rich.kill(e);
  W.corpses.holdFor(r, rich, oa().char.id, { gold: 4, items: [] });
  const tg = on(a, 'targetR');
  a.target(bare.id); await until(clock, () => tg.length);
  assert.equal(tg[0].ok, false); assert.equal(tg[0].why, 'empty');
  a.target(rich.id); await run(clock, 200);
  assert.equal(e.target, rich.id, 'a corpse with my loot on it can be targeted');
  a.target(0); await run(clock, 100);
  // Y5: emotes reach those in view; sit ends on a step; dance refuses in a fight; unknown ids are answered
  const er = on(a, 'emoteR');
  const seen = () => b.evs.filter(x => x.type === 'emote' && x.id === e.id);
  a.emote('wave'); await until(clock, () => seen().length);
  assert.equal(seen()[0].e, 'wave'); assert.ok(seen()[0].ms > 0); assert.equal(er[0].ok, true);
  a.emote('juggle'); await until(clock, () => er.length >= 2);
  assert.equal(er[1].ok, false); assert.equal(er[1].why, 'unknown');
  await run(clock, 1600);
  a.emote('sit'); await until(clock, () => er.length >= 3);
  assert.equal(er[2].ok, true); assert.equal(e.sitting, true); assert.equal(e.info().sit, 1, 'info says sitting');
  await run(clock, 200);
  assert.ok(seen().some(x => x.e === 'sit' && !x.end), 'others are told you sat down');
  for (let k = 0; k < 4; k++) { a.input({ s: 50 + k, dt: 50, mx: 1, mz: 0, yaw: 0, b: 0 }); await run(clock, 50); }
  await run(clock, 400);
  assert.equal(e.sitting, false, 'a step stands you up'); assert.ok(seen().some(x => x.e === 'sit' && x.end === 1), 'and everyone is told the sit ended');
  await run(clock, 1600);
  a.emote('dance'); await until(clock, () => er.length >= 4);
  assert.equal(er[3].ok, true);
  await run(clock, 21000);
  assert.ok(seen().some(x => x.e === 'dance' && x.end === 1), 'a dance stops by itself after 20 s');
  oa().lastHitAt = clock.now();
  a.emote('dance'); await until(clock, () => er.length >= 5);
  assert.equal(er[4].why, 'combat');
  // Y15: never fished, no rod -> not learned; cast refused; the angler teaches (and hands over a rod when the shop data has one)
  assert.equal(a.joined.you.angling.learned, false);
  const fr = on(a, 'fishR'), used = on(a, 'used'), you = on(a, 'you');
  a.fish('cast'); await until(clock, () => fr.length);
  if (fr[0].why !== 'notReady') { assert.equal(fr[0].why, 'unlearned'); assert.match(fr[0].msg, /Learn Angling from an angler/); }
  const angler = r.spawn({ kind: 'npc', type: 'npc', name: 'Tam Sedgeley', x: e.x + 1, z: e.z + 1, team: 1, data: { npc: { role: 'angler', says: [] }, key: 'test:angler' } });
  a.use(angler.id); await until(clock, () => used.length);
  assert.equal(used[0].taught, 'angling');
  assert.equal(oa().char.angling.learned, true); assert.ok(you.some(y => y.angling && y.angling.learned === true), 'the client hears it');
  a.use(angler.id); await until(clock, () => used.length >= 2);
  assert.ok(!used[1].taught, 'taught once');
  a.close(); b.close(); await srv.stop();
});

test('Y30 + Y36: the changelog marker per account (a new account starts at the latest); tracking a mutual friend with their leave', async () => {
  const changelog = { entries: [{ id: '2026-10-09', title: 'Newer' }, { id: '2026-10-08', title: 'Older' }] };
  const store0 = createMemoryStore({ now: () => 0 });
  await store0.setWorld('settings:2', { changelogSeen: '2026-10-08' });      // account 2 last read the older entry
  const clock0 = createVirtualClock();
  const { srv, clock, store } = m3Server({ clock: clock0, store: Object.assign(store0, {}), worldOpts: { changelog } });
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Tracker'), b = await claimedAs(srv, clock, 'Quarry'), c = await claimedAs(srv, clock, 'Stranger');
  // Y30
  a.listChars ? a.listChars() : a._raw('gw', JSON.stringify({ t: 'chars' }));
  await until(clock, () => a.changelog);
  assert.deepEqual({ latest: a.changelog.latest, seen: a.changelog.seen }, { latest: '2026-10-09', seen: '2026-10-09' }, 'a new account has nothing to catch up on');
  // an account that last read the older entry: the popup case
  assert.equal(b.account, 2, 'the second account');
  const cl = on(b, 'changelog');
  b._raw('gw', JSON.stringify({ t: 'chars' })); await until(clock, () => cl.length);
  assert.deepEqual({ latest: cl.at(-1).latest, seen: cl.at(-1).seen }, { latest: '2026-10-09', seen: '2026-10-08' });
  const st = on(b, 'settings');
  b._raw('gw', JSON.stringify({ t: 'settings', op: 'set', data: { changelogSeen: '2026-10-09' } })); await until(clock, () => st.length);
  assert.equal(st.at(-1).data.changelogSeen, '2026-10-09');
  b._raw('gw', JSON.stringify({ t: 'settings', op: 'set', data: { changelogSeen: '2026-10-08' } })); await until(clock, () => st.length >= 2);
  assert.equal(st.at(-1).data.changelogSeen, '2026-10-09', 'never backwards');
  b._raw('gw', JSON.stringify({ t: 'settings', op: 'set', data: { changelogSeen: 'nonsense' } })); await until(clock, () => st.length >= 3);
  assert.equal(st.at(-1).data.changelogSeen, '2026-10-09', 'only a real entry');
  // Y36
  const W = srv.world, ob = () => W.online.get(b.joined.you.char);
  const tr = on(a, 'trackR'), wh = on(a, 'whereabouts');
  a.track(b.joined.you.char); await until(clock, () => tr.length);
  assert.equal(tr[0].ok, false); assert.equal(tr[0].why, 'notFriend');
  a.friend('add', 'Quarry'); await run(clock, 300);
  a.track(b.joined.you.char); await until(clock, () => tr.length >= 2);
  assert.equal(tr[1].why, 'notFriend', 'one-sided is not enough'); assert.match(tr[1].msg, /not added you/);
  b.friend('add', 'Tracker'); await run(clock, 300);
  a.track(b.joined.you.char); await until(clock, () => tr.length >= 3);
  assert.equal(tr[2].ok, true, JSON.stringify(tr[2])); assert.deepEqual(tr[2].tracking, [b.joined.you.char]);
  W.transfer(ob(), W.copies[0], { x: W.gate.x + 200, z: W.gate.z + 150 }, 'test');
  await until(clock, () => wh.some(m => m.l[0] && m.l[0][7] === 'wilds'), 6000);
  const row = wh.at(-1).l[0];
  assert.equal(row[0], b.joined.you.char); assert.equal(row[1], 'Quarry');
  assert.ok(Math.abs(row[5] - ob().entity.x) < 2 && Math.abs(row[6] - ob().entity.z) < 2, 'their real position, a room away: ' + JSON.stringify(row));
  assert.equal(row[7], 'wilds');
  const others = on(c, 'whereabouts'); await run(clock, 2200);
  assert.equal(others.length, 0, 'nobody who did not ask is sent anything');
  // they switch sharing off: the tracker is told, the feed stops
  const n0 = wh.length;
  b._raw('gw', JSON.stringify({ t: 'settings', op: 'set', data: { shareLocation: false } })); await until(clock, () => tr.length >= 4);
  assert.equal(tr[3].why, 'hidden');
  await run(clock, 2500);
  assert.ok(wh.length <= n0 + 1, 'no more whereabouts');
  a.track(b.joined.you.char); await until(clock, () => tr.length >= 5);
  assert.equal(tr[4].why, 'hidden');
  a.close(); b.close(); c.close(); await srv.stop();
});

test('Y24 + Y17 + Y21 on the real world: a waystone lights from 25 m; training dummies stand in the first town and take hits for nothing; a rescued wanderer says thanks', async () => {
  const { srv, clock, world } = await realServer();
  const a = await joinReal(srv, clock, 'Wanderer', 'warrior');
  const pv = world.P.values().next().value;
  // Y24: Deepdene's stone, passed at 25 m (the old 15 m missed it)
  const w = pv.L.waystones.find(x => /deepdene/.test(x.key));
  const got = on(a, 'waystone');
  world.transfer(rec(world, a), pv.copies[0], { x: w.x + 25, z: w.z }, 'test'); await run(clock, 2500);
  assert.ok(got.some(m => m.op === 'learned' && m.key === w.key && m.how === 'near'), 'learned from 25 m: ' + JSON.stringify(got));
  // Y17: dummies in the starting town
  world.transfer(rec(world, a), pv.towns[0], { x: pv.L.towns[0].x, z: pv.L.towns[0].z }, 'test'); await run(clock, 2500);
  const o = rec(world, a), room = o.room;
  const dummies = [...room.entities.values()].filter(m => room.rules.isDummy && room.rules.isDummy(m));
  assert.ok(dummies.length >= 1, 'a training dummy stands in the first town');
  const d = dummies[0];
  assert.equal(d.info().type, 'training_dummy');
  world.transfer(o, room, { x: d.x + 1.5, z: d.z }, 'test'); await run(clock, 300);
  const xp0 = rec(world, a).char.xp || 0, hp0 = d.hp;
  const hits = []; a.on('hits', m => hits.push(...m.l)); a.meter(true);
  a.target(d.id); await run(clock, 200);
  for (let k = 0; k < 12; k++) { a.cast({ slot: 0, target: d.id }); await run(clock, 500); }
  assert.ok(d.hp < hp0 || hits.length > 0, 'it can be hit inside the town: hp ' + d.hp + '/' + hp0 + ' rows ' + hits.length);
  assert.ok(hits.some(h => h[1] === d.id && h[2] > 0), 'and the damage meter sees the hits');
  assert.equal(d.dead, false); assert.equal(rec(world, a).char.xp || 0, xp0, 'no experience from a dummy');
  // Y21: the rules' "you helped this NPC" call -> thanks out loud, and by the knobs a purse
  const npc = room.spawn({ kind: 'npc', type: 'npc', name: 'Hob the Tinker', x: o.entity.x + 2, z: o.entity.z, team: 1, data: { npc: { role: 'traveller', says: [] }, fighter: true, key: 'test:hob' } });
  const chat = on(a, 'chat');
  let paid = 0;
  for (let k = 0; k < 40 && !paid; k++) { const g0 = rec(world, a).char.gold || 0; rec(world, a).thankedAt = 0; room.host.npcHelped(npc, rec(world, a).entity, { kind: 'saved', level: 4, foes: 2, share: 1 }); await run(clock, 100); paid = (rec(world, a).char.gold || 0) - g0; }
  assert.ok(a.evs.some(x => x.type === 'say' && x.id === npc.id), 'the NPC says thanks');
  assert.ok(paid >= 4 && paid <= 12, 'sometimes a purse of 1-3 gold a level (level 4): ' + paid);
  assert.ok(chat.some(m => /Hob the Tinker thanks you: \+\d+ gold/.test(m.text)), JSON.stringify(chat.slice(-2)));
  a.close(); await srv.stop();
});

test('Y29 + Y32: saved title gear and live class resources reach the client', async () => {
  const { srv, clock, world, store } = await realServer();
  let a;
  try {
    a = await joinReal(srv, clock, 'Starlit', 'starcaller');
    const o = world.online.get(a.joined.you.char);
    const res = a.joined.you.res.find(r => r.id === 'starlight');
    assert.deepEqual(res, { id: 'starlight', n: 0, max: 5 }, 'the first frame can draw the empty pool');
    const updates = on(a, 'you');
    gainResource(o.entity.r.unit, 'starlight', 3);
    await run(clock, 300);
    assert.ok(updates.some(p => p.res?.some(r => r.id === 'starlight' && r.n === 3 && r.max === 5)), 'resource gains reach the HUD');
    updates.length = 0;
    await run(clock, 300);
    assert.equal(updates.filter(p => p.res).length, 0, 'an unchanged pool is not sent repeatedly');
    o.entity.r.unit.mech.res.starlight.n = 0;
    await run(clock, 300);
    assert.ok(updates.some(p => p.res?.some(r => r.id === 'starlight' && r.n === 0)), 'spending the pool clears the pips');
    const expected = o.room.rules.saveGear(o.entity);
    const account = o.char.account, id = o.char.id;
    a.close(); a = null;
    await run(clock, 500);
    const row = (await store.listChars(account)).find(c => c.id === id);
    assert.deepEqual(row.gear, expected, 'the title receives the saved equipped items on a fresh browser');
  } finally { a?.close(); await srv.stop(); }
});
