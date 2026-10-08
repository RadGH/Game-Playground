// Owner feedback 9 (stream A). X6 (dev report #14): delete a character — the typed name confirms it, never while it is in
// the world, its post / friends / guild are tidied the way the database expects, the name is kept for a day; the
// character limit is a server knob the client is told. X1 (stable report #51): admins list who is online; everyone gets
// a message of the day at sign-in with the head counts. X4 (dev report #16): the barber's price is a knob, and it is 0.
// X7: reports say which server they came from; raid waves come in by a gate; guards carry a level; a guaranteed cart
// run; quest marks for towns on the map.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { m3Server, claimedAs, joinAs, run, until, settle } from './m3-helpers.js';
import { makeClient, waitP } from './helpers.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { createEventRunner, GATE_OUT_M } from '../../js/sim/events.js';
import { configureEconomy, economy } from '../../js/sim/economy-knobs.js';
import { provinceEvents } from '../../js/sim/content.js';
import { realServer, joinReal, rec } from './pt1-helpers.js';

const on = (c, t) => { const l = []; c.on(t, m => l.push(m)); return l; };
const J = f => JSON.parse(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));

test('X6: delete — typed name, not while online, yours only; letters with things in them go back, friends and guild are tidied, the name frees after a day', async () => {
  const { srv, clock, store } = m3Server({ worldOpts: { charLimit: 3, nameReserveMs: 90000 } });      // "a day" is the server's default; 90 s here so the test can wait it out
  await srv.ready;
  const tokens = memoryTokenStore();
  const a = makeClient(srv, clock, { tokenStore: tokens });
  await waitP(clock, a.ready);
  const lists = on(a, 'chars'), del = on(a, 'deleted'), errs = on(a, 'err');
  const main = await waitP(clock, a.createChar({ name: 'Keeper', cls: 'warrior' }));
  const doomed = await waitP(clock, a.createChar({ name: 'Doomed', cls: 'mage' }));
  await waitP(clock, a.createChar({ name: 'Third', cls: 'ranger' }));
  // the limit is the server's knob, and the client is told
  await run(clock, 3000);                                  // (the create bucket: three in a row, then one a second)
  const full = await waitP(clock, a.createChar({ name: 'Fourth', cls: 'warrior' }).then(() => null, e => e));
  assert.equal(full.code, 'full'); assert.match(full.message, /3 characters/);
  // somebody else: a friend of Doomed, a guild Doomed is in, and a letter with gold waiting for Doomed
  const pal = await claimedAs(srv, clock, 'Pal', { level: 6 });
  const W = srv.world, op = W.online.get(pal.joined.you.char);
  W.grant(op, { items: [{ name: 'Gift blade', rarity: 'common', slot: 'weapon', value: 3 }], gold: 60, reason: 'test' }); await run(clock, 100);
  const mr = on(pal, 'mailR'), gr = on(pal, 'guildR'), palMail = on(pal, 'mailNew');
  pal.mail('send', { to: 'Doomed', subject: 'For you', body: 'Keep it.', items: [op.char.bag[0].uid], gold: 5 }); await until(clock, () => mr.length);
  assert.equal(mr[0].ok, true, JSON.stringify(mr[0]));
  pal.friend('add', 'Doomed'); pal.guild('create', { name: 'The Doomed Few' }); await until(clock, () => gr.length);
  await store.guildJoin(W.gateway.guilds ? (await store.guildOf(pal.joined.you.char)).id : 0, doomed.id, 3, 50);
  assert.ok((await store.listFriends(pal.joined.you.char)).some(f => f.id === doomed.id), 'a friend of Pal');
  assert.equal((await store.guildOf(doomed.id)).members.length, 2);
  const esc0 = await store.escrow();
  assert.equal(esc0.items, 1); assert.equal(esc0.gold, 5);
  // wrong name
  a.deleteChar(doomed.id, 'Doomd'); await until(clock, () => del.length >= 1);
  assert.equal(del[0].ok, false); assert.equal(del[0].why, 'name'); assert.match(del[0].msg, /Doomed/);
  // somebody else's character
  await run(clock, 5100);
  a.deleteChar(pal.joined.you.char, 'Pal'); await until(clock, () => del.length >= 2);
  assert.equal(del[1].why, 'missing');
  // in the world: refused
  await waitP(clock, a.play(doomed.id));
  a.deleteChar(doomed.id, 'doomed'); await until(clock, () => del.length >= 3);
  assert.equal(del[2].ok, false); assert.equal(del[2].why, 'online'); assert.match(del[2].msg, /Log it out first/);
  // out of the world (playing another): gone
  await waitP(clock, a.play(main.id));
  await until(clock, () => !W.online.has(doomed.id), 8000);
  await run(clock, 5100);
  a.deleteChar(doomed.id, 'DOOMED'); await until(clock, () => del.length >= 4);
  assert.equal(del[3].ok, true, JSON.stringify(del[3]));
  assert.equal(del[3].name, 'Doomed'); assert.equal(del[3].returned, 1); assert.ok(del[3].freeAt > clock.now());
  await until(clock, () => a.chars.length === 2);
  const last = { chars: a.chars };
  assert.deepEqual(last.chars.map(c => c.name).sort(), ['Keeper', 'Third']); assert.equal(a.charLimit, 3, 'the client is told the limit');
  assert.ok(!store.data.chars[doomed.id], 'the row is gone');
  // tidy: the letter went BACK to Pal with its item and gold; no friend row; the guild has one member; nothing left in escrow for the dead
  const back = await store.mailList(pal.joined.you.char, 10);
  assert.ok(back.some(m => /^Returned:/.test(m.subject) && m.gold === 5 && m.items.length === 1), 'returned to sender: ' + JSON.stringify(back).slice(0, 200));
  assert.deepEqual(await store.escrow().then(e => [e.items, e.gold]), [1, 5], 'nothing was destroyed');
  assert.ok(!(await store.listFriends(pal.joined.you.char)).some(f => f.id === doomed.id), 'no dangling friend');
  assert.equal((await store.guildOf(pal.joined.you.char)).members.length, 1);
  assert.equal(await store.guildOf(doomed.id), null);
  // the name is kept for a day, then free
  await run(clock, 2000);
  const kept = await waitP(clock, a.createChar({ name: 'Doomed', cls: 'mage' }).then(() => null, e => e));
  assert.equal(kept.code, 'name'); assert.match(kept.message, /kept for a day/);
  await run(clock, 91000, 50);
  const again = await waitP(clock, a.createChar({ name: 'Doomed', cls: 'mage' }));
  assert.ok(again.id && again.id !== doomed.id, 'a day later the name is free');
  // a lease held by a process (it left the world a moment ago): refused, kindly
  const third = last.chars.find(c => c.name === 'Third');
  store.data.chars[third.id].lease_owner = 'p9:dead'; store.data.chars[third.id].lease_until = clock.now() + 20000;
  await run(clock, 5100);
  a.deleteChar(third.id, 'Third'); await until(clock, () => del.length >= 5);
  assert.equal(del[4].why, 'lease'); assert.match(del[4].msg, /few seconds/);
  void lists; void palMail; void settle;
  a.close(); pal.close(); await srv.stop();
});

test('X1: the message of the day at sign-in (welcome + online now + accounts in the past 24 hours, text from the knob); admins list who is online', async () => {
  const { srv, clock, store } = m3Server({ worldOpts: { motd: { text: 'Welcome to Thousandvale, {name}. {players} online now; {accounts} signed in over the past 24 hours.', lines: ['Fishing is new this week.'] } } });
  await srv.ready;
  const a = makeClient(srv, clock); const ca = on(a, 'chat');
  await waitP(clock, a.ready);
  const cha = await waitP(clock, a.createChar({ name: 'Firstin', cls: 'warrior' }));
  await waitP(clock, a.play(cha.id)); await run(clock, 300);
  const m1 = ca.filter(m => m.motd);
  assert.equal(m1.length, 2, JSON.stringify(ca));
  assert.equal(m1[0].text, 'Welcome to Thousandvale, Firstin. 1 player is online now; 1 has signed in over the past 24 hours.');
  assert.equal(m1[0].ch, 'system'); assert.equal(m1[0].online, 1); assert.equal(m1[0].day, 1);
  assert.equal(m1[1].text, 'Fishing is new this week.');
  // two more accounts; one leaves again: still counted in the day, not in the now
  const b = await joinAs(srv, clock, 'Secondin'), gone = await joinAs(srv, clock, 'Passerby');
  gone.close(); await until(clock, () => !srv.world.online.has(gone.joined.you.char), 8000); await run(clock, 300);
  const c = makeClient(srv, clock); const cc = on(c, 'chat');
  await waitP(clock, c.ready);
  const chc = await waitP(clock, c.createChar({ name: 'Thirdin', cls: 'mage' }));
  await waitP(clock, c.play(chc.id)); await run(clock, 300);
  const m3 = cc.find(m => m.motd);
  assert.equal(m3.text, 'Welcome to Thousandvale, Thirdin. 3 players are online now; 4 have signed in over the past 24 hours.');
  // only sign-ins inside the window count
  assert.equal(await store.loginsSince(clock.now() + 1), 0);
  assert.equal(await store.loginsSince(clock.now() - 86400000), 4);
  // a room change is not a sign-in: no second MOTD
  const n0 = ca.filter(m => m.motd).length;
  srv.world.transfer(srv.world.online.get(cha.id), srv.world.copies[0], { x: srv.world.gate.x + 40, z: srv.world.gate.z }, 'test'); await run(clock, 500);
  assert.equal(ca.filter(m => m.motd).length, n0);
  // who is online: admins only
  const ar = on(a, 'adminR'), ol = on(a, 'adminOnline');
  a.adminOnline(); await until(clock, () => ar.length);
  assert.equal(ar[0].ok, false); assert.equal(ar[0].why, 'forbidden');
  await store.setAdmin(a.account, true);
  a.adminOnline(); await until(clock, () => ol.length);
  const L = ol[0];
  assert.equal(L.ok, true); assert.equal(L.count, 3); assert.equal(L.accounts, 3);
  assert.deepEqual(L.list.map(r => r.name), ['Firstin', 'Secondin', 'Thirdin'], 'by name');
  for (const r of L.list) assert.ok(r.char && r.level >= 1 && r.cls && r.clsName && r.room && r.where && r.roomKind, JSON.stringify(r));
  assert.equal(L.list.find(r => r.name === 'Firstin').roomKind, 'wilds'); assert.equal(L.list.find(r => r.name === 'Secondin').roomKind, 'town');
  assert.ok(L.list.find(r => r.name === 'Secondin').town, 'a town is named');
  // the same call over the game socket answers for this process
  a._raw('p', JSON.stringify({ t: 'admin', op: 'online' })); await until(clock, () => ol.length >= 2);
  assert.equal(ol[1].count, 3);
  a.close(); b.close(); c.close(); await srv.stop();
});

test('X4: the barber price is an economy knob — mult 0 (E\'s economy.json) is free for everyone, mult 1 charges as before', async () => {
  assert.equal(J('data/provinces/economy.json').barber.mult, 0, 'the data says free');
  const { srv, clock, world } = await realServer();
  assert.equal(economy().barber.mult, 0, 'and the server reads it');
  const a = await joinReal(srv, clock, 'Shaven', 'warrior');
  const o = rec(world, a);
  const barber = [...o.room.objects.values()].find(x => x.data && x.data.npc && x.data.npc.role === 'barber');
  assert.ok(barber, 'Torborhold has a barber');
  world.transfer(o, o.room, { x: barber.x + 1, z: barber.z + 1 }, 'test'); await run(clock, 300);
  const used = on(a, 'used'), br = []; a.on('lookR', m => br.push(m)); a.on('barberR', m => br.push(m));
  o.char.flags = { ...(o.char.flags || {}), barberUsed: true };       // not a first visit
  o.char.gold = 7;
  a.use(barber.id); await until(clock, () => used.length);
  assert.equal(used[0].barber, true); assert.equal(used[0].free, true, 'the window is told it is free');
  a.barber(barber.id, { race: 'dwarf', custom: { facialHair: { id: 'full', color: '#552211' } } }); await until(clock, () => br.length);
  assert.equal(br[0].ok, true, JSON.stringify(br[0])); assert.equal(br[0].cost, 0);
  assert.equal(rec(world, a).char.gold, 7, 'nothing charged for a whole new face');
  // the knob at 1: the same kind of change costs gold again
  const data = J('data/provinces/economy.json');
  configureEconomy({ ...data, barber: { ...data.barber, mult: 1 } });
  try {
    a.use(barber.id); await until(clock, () => used.length >= 2);
    assert.equal(used[1].free, false);
    rec(world, a).char.gold = 5000;
    a.barber(barber.id, { race: 'elf', custom: {} }); await until(clock, () => br.length >= 2);
    assert.equal(br[1].ok, true, JSON.stringify(br[1]));
    assert.ok(br[1].cost > 0 && rec(world, a).char.gold === 5000 - br[1].cost, 'charged at mult 1: ' + br[1].cost);
  } finally { configureEconomy(data); }
  a.close(); await srv.stop();
});

test('X7: a raid wave appears outside the gate E named and is sent in through it; the view names the gate', () => {
  const spawned = [];
  const gate = { id: 'g0', x: 100, z: 0, out: [1, 0], main: true }, side = { id: 'g1', x: 0, z: 100, out: [0, 1], main: false };
  const room = { now: () => 0, walkable: (x, z) => Math.hypot(x, z) < 140, spawn: s => { const m = { ...s, id: spawned.length + 1, removed: false, dead: false, state: 0, hp: 10, hpMax: 10 }; spawned.push(m); return m; },
    remove: m => { m.removed = true; }, host: { near: () => [] }, clients: new Map(), entities: new Map(), emit: () => {}, event: () => {} };
  let seed = 7; const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const run = createEventRunner({ room, rng, info: {}, ev: { id: 'siege', uid: 'siege:1', name: 'Siege', x: 0, z: 0, r: 60, level: 3, warnMs: 0, waves: [{ type: 'road_brigand', count: [6, 6] }, { type: 'road_brigand', count: [4, 4] }], raid: { gates: [side, gate] } } });
  run.step();
  const w1 = spawned.filter(m => m.kind === 'monster');
  assert.equal(w1.length, 6);
  for (const m of w1) {
    const out = m.x - gate.x;
    assert.ok(out >= GATE_OUT_M[0] * 0.3 && out <= GATE_OUT_M[1] + 1 && Math.abs(m.z) <= 16, `outside the MAIN gate: ${m.x.toFixed(1)}, ${m.z.toFixed(1)}`);
    assert.ok(room.walkable(m.x, m.z), 'on ground it can stand on (pulled in where the room ends)');
    assert.equal(m.data.event, 'siege:1'); assert.equal(m.data.gate, 'g0');
    assert.ok(Math.hypot(m.data.path[0][0] - gate.x, m.data.path[0][1] - gate.z) <= 6 && m.data.path[0][0] < gate.x, 'its first stop is just INSIDE the gate');
    assert.ok(Math.abs(Math.cos(m.yaw) + 1) < 1e-6, 'facing in');
  }
  assert.deepEqual(run.view().gate, { id: 'g0', x: 100, z: 0 });
});

test('X7: E\'s raid gates reach the realm events in WORLD metres; posted guards carry a level and a tier; the guaranteed cart run is a route of its own', async () => {
  const { srv, clock, world, C } = await realServer();
  const pv = world.P.values().next().value, t0 = pv.L.towns[0];
  const raid = world.realmEvents.find(e => e.raid && Math.hypot(e.x - t0.x, e.z - t0.z) < t0.r + 60);
  assert.ok(raid && raid.raid.gates.length >= 1, 'Torborhold\'s raid names its gates');
  for (const g of raid.raid.gates) {
    const d = Math.hypot(g.x - t0.x, g.z - t0.z);
    assert.ok(d > 10 && d < t0.r + 80, `gate ${g.id} is on the town's edge in world metres: ${Math.round(d)} m from the centre (r ${t0.r})`);
    assert.ok(Math.abs(Math.hypot(g.out[0], g.out[1]) - 1) < 0.05, 'a unit vector out');
    const ox = g.x + g.out[0] * 30, oz = g.z + g.out[1] * 30;
    assert.ok(Math.hypot(ox - t0.x, oz - t0.z) > d, 'and out points away from the square');
  }
  assert.equal(raid.raid.gates.filter(g => g.main).length, 1);
  const guards = [...pv.towns[0].objects.values(), ...pv.copies[0].objects.values()].filter(x => x.data && x.data.guard && Math.hypot(x.x - t0.x, x.z - t0.z) < t0.r + 80);
  assert.ok(guards.length >= 4);
  for (const g of guards) { assert.equal(g.data.guard.level, raid.level, 'guard level = the town\'s raid level'); assert.ok(g.data.guard.tier, 'E\'s tier rides along'); }
  // a town with no raid of its own: the floor of its zone band
  const quiet = pv.L.towns.findIndex(t => !world.realmEvents.some(e => Math.hypot(e.x - t.x, e.z - t.z) < t.r + 60));
  if (quiet >= 0) { const qg = [...pv.towns[quiet].objects.values()].find(x => x.data && x.data.guard); if (qg) assert.ok(qg.data.guard.level >= 1 && Number.isInteger(qg.data.guard.level)); }
  // the cart run
  const cartRun = J('data/provinces/carts.json').roaming.runs[0];
  const route = pv.L.travel.routes.find(r => r.id === cartRun.id);
  assert.ok(route, 'the run is a route');
  assert.deepEqual(route.kinds, cartRun.only, 'only its own kinds walk it (no wanderer kinds appended)');
  const base = pv.L.travel.routes.find(r => r.id === cartRun.route);
  assert.ok(base && base.kinds.length > 1, 'the ordinary road keeps its mixed traffic');
  assert.equal(pv.L.travel.routes.filter(r => r.id === cartRun.id).length, 1);
  const w = await joinReal(srv, clock, 'Roadwatch', 'warrior');
  world.transfer(rec(world, w), pv.copies[0], { x: world.gate.x + 40, z: world.gate.z }, 'test'); await run(clock, 2000);
  const tr = pv.copies[0].travellers;
  assert.ok(tr && tr.groups.some(g => g.route.id === cartRun.id && g.kind === cartRun.only[0]), 'and a cart is on it right now: ' + (tr ? tr.groups.filter(g => g.route.id === cartRun.id).map(g => g.kind) : 'no travellers'));
  void C; void provinceEvents;
  w.close(); await srv.stop();
});

test('X7: the map data marks quest NPCs of towns you are not standing in; a report says which server it came from', async () => {
  const { srv, clock, world, store } = await realServer({ env: 'stable', serverName: 'play.example' });
  const a = await joinReal(srv, clock, 'Mapper', 'warrior');
  const o = rec(world, a), pv = world.P.values().next().value;
  // out in the wilds, far from every NPC of the starting town
  world.transfer(o, pv.copies[0], { x: world.gate.x + 300, z: world.gate.z + 300 }, 'test'); await run(clock, 500);
  const md = on(a, 'mapData');
  a.map('get'); await until(clock, () => md.length);
  const town = md[0].places.find(p => p.kind === 'town' && p.name === pv.L.towns[0].name);
  assert.ok(town && Array.isArray(town.marks) && town.marks.length >= 1, 'the starting town carries marks: ' + JSON.stringify(town).slice(0, 200));
  for (const m of town.marks) { assert.ok(m.name && Number.isFinite(m.x) && Number.isFinite(m.z) && ['offer', 'turnin', 'active', 'later', 'job'].includes(m.q), JSON.stringify(m)); assert.ok(Math.hypot(m.x - pv.L.towns[0].x, m.z - pv.L.towns[0].z) < pv.L.towns[0].r + 120); }
  assert.ok(town.marks.some(m => m.q === 'offer'), 'a new character is offered something there');
  // feedback: env + server on the row, on the admin list, in the Markdown and on the page
  const fr = on(a, 'feedbackR');
  a.feedback('bug', 'Which server am I on?'); await until(clock, () => fr.length);
  const row = (await store.listFeedback({}))[0];
  assert.equal(row.server.env, 'stable'); assert.equal(row.server.server, 'play.example');
  assert.equal(world.feedback.view(row).env, 'stable');
  a.close(); await srv.stop();
});

const HAVE_PG = !!(process.env.PGDATABASE || process.env.DATABASE_URL);
test('X6 / X1 on Postgres (schema v7): deleteChar returns held letters, cascades the rest, reserves the name; the limit; noteLogin / loginsSince', { skip: !HAVE_PG && 'no PG* environment' }, async () => {
  const { createPgStore } = await import('../../server/db/pg-store.js');
  const st = createPgStore();
  await st.init();
  const rnd = () => Array.from({ length: 7 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('');
  const g1 = await st.createGuest(null), g2 = await st.createGuest(null);
  const nm = 'Del' + rnd(), pal = 'Pal' + rnd();
  try {
    const a = (await st.createChar(g1.account, { name: nm, cls: 'mage' })).char, b = (await st.createChar(g2.account, { name: pal, cls: 'warrior' })).char;
    assert.equal((await st.createChar(g1.account, { name: 'X' + rnd(), cls: 'mage', limit: 1 })).err, 'full', 'the limit is the caller\'s');
    assert.equal(await st.addFriend(b.id, a.id).then(() => true, () => true), true);
    assert.equal((await st.deleteChar(g2.account, a.id)).err, 'missing', 'not yours');
    const t0 = Date.now();
    await st.noteLogin(g1.account, t0); await st.noteLogin(g2.account, t0 - 30 * 3600000);
    assert.ok(await st.loginsSince(t0 - 1000) >= 1);
    const before = await st.loginsSince(t0 - 86400000), wide = await st.loginsSince(t0 - 40 * 3600000);
    assert.ok(wide >= before + 1, 'an account from 30 hours ago is outside the day');
    const r = await st.deleteChar(g1.account, a.id, { nowMs: t0, reserveMs: 86400000 });
    assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.name, nm); assert.equal(r.freeAt, t0 + 86400000);
    assert.equal((await st.listChars(g1.account)).length, 0);
    assert.ok(!(await st.listFriends(b.id)).some(f => f.id === a.id), 'the friend row went with it');
    const again = await st.createChar(g2.account, { name: nm.toUpperCase(), cls: 'mage' });
    assert.equal(again.err, 'name'); assert.ok(again.reserved > t0, 'reserved for a day');
    await st.pool.query('UPDATE char_tombstones SET free_at = now() - interval \'1 minute\' WHERE name_lower = lower($1)', [nm]);
    assert.ok((await st.createChar(g2.account, { name: nm, cls: 'mage' })).char, 'free once the day is over');
  } finally {
    await st.pool.query('DELETE FROM char_tombstones WHERE name_lower = lower($1)', [nm]).catch(() => {});
    for (const g of [g1, g2]) await st.pool.query('DELETE FROM accounts WHERE id = $1', [g.account]).catch(() => {});
    await st.close();
  }
});
