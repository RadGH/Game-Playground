// M1.5 "safe to share": the save journal (≤ 2 s loss), fencing a zombie process, the atomic trade window,
// the human check on guest creation, and the zone's named encounters.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { memoryTokenStore } from '../../js/net/client.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { applyJournal, heldUids } from '../../js/sim/journal.js';
import { unpackChar } from '../../js/sim/save-fields.js';
import { makeServer, makeClient, joinAs, run, until, waitP, ent, roomOf, loadAll } from './helpers.js';

test('journal replay: deltas and adds on top of the blob, skipping rows the blob already has', () => {
  const ch = { id: 1, gold: 10, xp: 5, level: 1, bag: [{ uid: 'a' }], jseq: 3, opened: {} };
  applyJournal(ch, [
    { seq: 2, kind: 'gold', payload: { d: 1000 } },                 // already in the blob
    { seq: 4, kind: 'gold', payload: { d: 7 } },
    { seq: 5, kind: 'bagAdd', payload: { item: { uid: 'b' } } },
    { seq: 6, kind: 'bagAdd', payload: { item: { uid: 'a' } } },    // already held: no duplicate
    { seq: 7, kind: 'bagDel', payload: { uid: 'a' } },
    { seq: 8, kind: 'xp', payload: { d: 100, level: 2 } },
    { seq: 9, kind: 'pos', payload: { room: 'town', x: 1, y: 2, z: 3, yaw: 0, exit: null } },
    { seq: 10, kind: 'set', payload: { k: 'mutedUntil', v: 99 } },
  ]);
  assert.equal(ch.gold, 17); assert.deepEqual(ch.bag.map(i => i.uid), ['b']); assert.equal(ch.xp, 105); assert.equal(ch.level, 2);
  assert.equal(ch.room, 'town'); assert.equal(ch.mutedUntil, 99); assert.equal(ch.jseq, 10);
});

test('crash: loot granted more than 2 s before the crash survives without any blob save', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  let srv = makeServer({ clock, store, worldOpts: { saveEveryMs: 10 * 60000 } });
  await srv.ready;
  const tok = memoryTokenStore();
  const a = makeClient(() => srv, clock, { tokenStore: tok });
  await waitP(clock, a.ready);
  const ch = await waitP(clock, a.createChar({ name: 'Journaled', cls: 'warrior' }));
  await waitP(clock, a.play(ch.id));
  const W = srv.world, o = W.online.get(ch.id);
  const versionBefore = Object.values(store.data.chars)[0].version;
  W.grant(o, { items: [{ name: 'Old boot', rarity: 'common', value: 1 }, { name: 'Bent nail', rarity: 'common', value: 1 }], gold: 40, reason: 'kill' });
  await run(clock, 2600);                                    // one journal flush
  W.grant(o, { items: [{ name: 'Fresh fang', rarity: 'common', value: 1 }], gold: 5, reason: 'kill' });
  await run(clock, 300);                                     // crash before the next flush
  assert.equal(Object.values(store.data.chars)[0].version, versionBefore, 'no blob save happened');
  srv.crash();
  srv = makeServer({ clock, store, worldOpts: { saveEveryMs: 10 * 60000 } });
  await srv.ready;
  await until(clock, () => a.status === 'online' && a.joined && a.joined.you.bag.length >= 2, 15000);
  const names = a.joined.you.bag.map(i => i.name);
  assert.ok(names.includes('Old boot') && names.includes('Bent nail'), 'journaled loot back: ' + names);
  assert.ok([40, 45].includes(a.joined.you.gold), 'journaled gold back (the last 0.3 s may be lost): ' + a.joined.you.gold);
  a.close(); await srv.stop();
});

test('fencing: a frozen old process that wakes up after a restart cannot write journal rows or blobs', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const old = makeServer({ clock, store });
  await old.ready;
  let cur = old;
  const a = makeClient(() => cur, clock);
  await waitP(clock, a.ready);
  const cc = await waitP(clock, a.createChar({ name: 'Zombieproof', cls: 'warrior' }));
  await waitP(clock, a.play(cc.id));
  const charId = a.joined.you.char;
  const zo = old.world.online.get(charId);
  // the old process "freezes": stop it ticking but keep its memory; the network drops
  old.crash();
  const fresh = makeServer({ clock, store });               // clears p0 leases and takes the character
  await fresh.ready;
  cur = fresh;
  await until(clock, () => a.status === 'online', 15000);
  assert.ok(fresh.world.online.has(charId));
  // the zombie wakes and tries to write
  old.world.grant(zo, { items: [{ name: 'Ghost gold bar', rarity: 'common', value: 1 }], gold: 999, reason: 'kill' });
  await old.world.flushJournal();
  const ok = await old.world.saveNow(zo);
  assert.equal(ok, false, 'blob save fenced out');
  void 0;
  assert.ok(old.world.counters.journalRefused >= 1, 'journal rows fenced out');
  const loaded = loadAll(store).find(c => c.id === charId);
  assert.ok(!loaded.bag.some(i => i.name === 'Ghost gold bar') && loaded.gold < 999);
  a.close(); await fresh.stop();
});

async function tradePair(clock, srv) {
  const W = srv.world;
  const a = await joinAs(srv, clock, 'Trader A'), b = await joinAs(srv, clock, 'Trader B');
  W.grant(W.online.get(a.joined.you.char), { items: [{ name: 'Sword', rarity: 'rare', slot: 'mainhand', value: 9 }, { name: 'Cap', rarity: 'common', value: 1 }], gold: 100, reason: 'test' });
  W.grant(W.online.get(b.joined.you.char), { items: [{ name: 'Ring', rarity: 'common', value: 4 }], gold: 30, reason: 'test' });
  W.transfer(W.online.get(a.joined.you.char), W.townRoom, { x: W.town.x, z: W.town.z }, 't');
  W.transfer(W.online.get(b.joined.you.char), W.townRoom, { x: W.town.x + 2, z: W.town.z }, 't');
  await run(clock, 300);
  return { a, b, W };
}
async function openTrade(clock, a, b) {
  let ask = null; const off = b.on('tradeAsk', m => { ask = m; });
  a.tradeOp('ask', { id: b.you });
  await until(clock, () => ask, 2000); off();
  b.tradeOp('accept', { id: ask.trade });
  await until(clock, () => a.trade && a.trade.state === 'open');
  return ask.trade;
}

test('trade: items + gold move in one store write; both bags and the store agree; nothing duplicated', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store });
  await srv.ready;
  const { a, b, W } = await tradePair(clock, srv);
  const id = await openTrade(clock, a, b);
  const sword = a.joined.you.bag.find(i => i.name === 'Sword'), ring = b.joined.you.bag.find(i => i.name === 'Ring');
  a.tradeOp('offer', { id, items: [sword.uid], gold: 25 });
  b.tradeOp('offer', { id, items: [ring.uid], gold: 0 });
  await run(clock, 200);
  assert.deepEqual(b.trade.them.items.map(i => i.name), ['Sword']);
  // a change after locking unlocks both
  a.tradeOp('lock', { id }); b.tradeOp('lock', { id }); await run(clock, 100);
  a.tradeOp('offer', { id, items: [sword.uid], gold: 20 }); await run(clock, 100);
  assert.equal(b.trade.you.locked, false);
  // confirm too early is refused
  const errs = []; a.on('err', m => errs.push(m.code));
  a.tradeOp('confirm', { id }); await run(clock, 100);
  assert.deepEqual(errs, ['trade']);
  // the sword cannot be destroyed while it is in the window
  a.item('destroy', sword.uid); await run(clock, 100);
  assert.equal(errs.at(-1), 'item');
  a.tradeOp('lock', { id }); b.tradeOp('lock', { id }); await run(clock, 100);
  const done = []; a.on('trade', m => { if (m.trade === null) done.push(m.done); });
  a.tradeOp('confirm', { id }); b.tradeOp('confirm', { id });
  await run(clock, 400);
  assert.deepEqual(done, [true]);
  assert.ok(b.joined.you.bag.some(i => i.uid === sword.uid) && !a.joined.you.bag.some(i => i.uid === sword.uid));
  assert.ok(a.joined.you.bag.some(i => i.uid === ring.uid));
  assert.equal(a.joined.you.gold, 80); assert.equal(b.joined.you.gold, 50);
  const all = loadAll(store);
  const uids = all.flatMap(heldUids);
  assert.equal(uids.length, new Set(uids).size, 'no uid held twice');
  assert.equal(all.reduce((s, c) => s + c.gold, 0), 130);
  assert.ok(all.find(c => c.name === 'Trader B').bag.some(i => i.uid === sword.uid), 'the store has it where it went');
  assert.equal(W.status().trades.done, 1);
  a.close(); b.close(); await srv.stop();
});

test('two concurrent moves of one item: only one wins (second trade refused; a failed store write moves nothing)', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const srv = makeServer({ clock, store });
  await srv.ready;
  const { a, b, W } = await tradePair(clock, srv);
  const c = await joinAs(srv, clock, 'Trader C');
  W.transfer(W.online.get(c.joined.you.char), W.townRoom, { x: W.town.x + 1, z: W.town.z + 1 }, 't');
  await run(clock, 200);
  const id = await openTrade(clock, a, b);
  const errs = []; a.on('err', m => errs.push(m.code)); c.on('err', m => errs.push('c:' + m.code));
  a.tradeOp('ask', { id: c.you }); c.tradeOp('ask', { id: a.you });
  await run(clock, 200);
  assert.deepEqual(errs, ['tradeBusy', 'c:tradeBusy']);
  // now make the store refuse the write (someone else moved the version on): nothing changes hands
  const sword = a.joined.you.bag.find(i => i.name === 'Sword');
  a.tradeOp('offer', { id, items: [sword.uid], gold: 10 }); await run(clock, 100);
  a.tradeOp('lock', { id }); b.tradeOp('lock', { id }); await run(clock, 100);
  const realTrade = store.tradeChars;
  store.tradeChars = async list => false;
  const why = []; a.on('trade', m => { if (m.trade === null) why.push(m.why); });
  a.tradeOp('confirm', { id }); b.tradeOp('confirm', { id });
  await run(clock, 400);
  store.tradeChars = realTrade;
  assert.deepEqual(why, ['tradeFailed']);
  assert.ok(a.joined.you.bag.some(i => i.uid === sword.uid) && !b.joined.you.bag.some(i => i.uid === sword.uid));
  assert.equal(a.joined.you.gold, 100);
  // walking apart cancels an open trade
  const id2 = await openTrade(clock, a, b);
  void id2;
  W.transfer(W.online.get(b.joined.you.char), W.townRoom, { x: W.town.x + 30, z: W.town.z }, 't');
  await run(clock, 500);
  assert.equal(a.trade, null);
  a.close(); b.close(); c.close(); await srv.stop();
});

test('human check: guest creation needs a passing token when configured; welcome advertises the site key; per-network limit', async () => {
  const clock = createVirtualClock();
  const seen = [];
  const verifyHuman = async (token, ip) => { seen.push([token, ip]); return token === 'good-token'; };
  const srv = makeServer({ clock, worldOpts: { verifyHuman, humanSiteKey: '1x00000000000000000000AA', guestsPerIpPerHour: 2, unlimitedIps: [] } });
  await srv.ready;
  const bad = makeClient(srv, clock, { human: 'bad-token' });
  const errs = []; bad.on('err', m => errs.push(m.code));
  await run(clock, 300);
  assert.deepEqual(errs, ['human']);
  assert.equal(bad.humanCheck.siteKey, '1x00000000000000000000AA');
  const none = makeClient(srv, clock);
  const e2 = []; none.on('err', m => e2.push(m.code));
  await run(clock, 300);
  assert.deepEqual(e2, ['human'], 'no token: refused');
  let asked = null;
  const good = makeClient(srv, clock, { human: async hc => { asked = hc; return 'good-token'; } });
  await waitP(clock, good.ready);
  assert.equal(asked.provider, 'turnstile');
  const g2 = makeClient(srv, clock, { human: 'good-token' });
  await waitP(clock, g2.ready);
  const g3 = makeClient(srv, clock, { human: 'good-token' });
  const e3 = []; g3.on('err', m => e3.push(m.code));
  await run(clock, 300);
  assert.deepEqual(e3, ['tooMany'], 'third guest from one network in an hour');
  assert.equal(srv.world.status().humanFails, 2);
  for (const c of [bad, none, good, g2, g3]) c.close();
  await srv.stop();
});

test('Turnstile against Cloudflare\'s test keys (network; skipped offline)', async t => {
  const { turnstileFromEnv } = await import('../../server/turnstile.js');
  const pass = turnstileFromEnv({ TV_TURNSTILE_SECRET: '1x0000000000000000000000000000000AA' });
  const fail = turnstileFromEnv({ TV_TURNSTILE_SECRET: '2x0000000000000000000000000000000AA' });
  assert.equal(turnstileFromEnv({}), null, 'unset = no check');
  let a;
  try { a = await pass('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1'); } catch (err) { t.skip('no network: ' + err.message); return; }
  assert.equal(a, true);
  assert.equal(await fail('XXXX.DUMMY.TOKEN.XXXX', '127.0.0.1'), false);
});

test('zone encounters: the elite, two rares and the event boss stand at their sites with their script id and name', async () => {
  const { readFileSync } = await import('node:fs');
  const { loadZoneTerrain } = await import('../../js/sim/terrain.js');
  const { loadZoneContent } = await import('../../js/sim/content.js');
  const root = new URL('../../', import.meta.url);
  const terrain = loadZoneTerrain(readFileSync(new URL('data/zones/test/terrain.bin', root)), 'test');
  const content = await loadZoneContent(async f => JSON.parse(readFileSync(new URL(f, root), 'utf8')), 'test');
  const clock = createVirtualClock();
  const srv = makeServer({ clock, worldOpts: { terrain, zoneSheet: content.sheet, encounterInfo: content.encounterInfo } });
  await srv.ready;
  const r = srv.world.copies[0];
  const byEnc = id => [...r.entities.values()].find(e => e.data && e.data.encounter === id);
  const hobb = byEnc('elite_hobb_gallowsby'), skein = byEnc('event_grandmother_skein');
  assert.ok(hobb && hobb.rank === 'elite' && hobb.name === content.encounterInfo.elite_hobb_gallowsby.name);
  assert.ok(Math.hypot(hobb.x - 1618, hobb.z - 746) < 6, 'at B\'s camp site');
  assert.ok(skein && skein.rank === 'boss' && skein.name === 'Grandmother Skein');
  assert.ok(Math.hypot(skein.x - 731, skein.z - 552) < 6, 'at B\'s event site');
  assert.ok(byEnc('rare_grisel_thornhide') && byEnc('rare_sallowmaw'));
  assert.ok([...r.entities.values()].some(e => e.type === 'road_brigand'), 'escort');
  const types = new Set([...r.entities.values()].filter(e => e.kind === 'monster').map(e => e.type));
  assert.ok(types.has('moor_hound') && types.has('thicket_boar'), 'the sheet\'s monster mix: ' + [...types]);
  assert.ok(Math.hypot(srv.world.door.x - 863, srv.world.door.z - 1167) < 1, 'door at B\'s dungeon site');
  await srv.stop();
});
