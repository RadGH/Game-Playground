// Persistence chaos (PLAN §16): 500 crashes at random moments while four players trade, equip and walk,
// against a store whose writes land after a random delay (so crashes cut through in-flight saves, journal
// commits and trades). After every restart: every item is held exactly once and the gold total is unchanged.
// In-process with virtual time (fast); stream G runs the real-process `kill -9` version against Postgres.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { heldUids } from '../../js/sim/journal.js';
import { makeServer, makeClient, run, until, waitP, loadAll } from './helpers.js';
import { seedStream, next, int } from '../../js/sim/rng.js';

/** Writes land 5-60 ms later; kill() drops whatever has not landed (a crash mid-write). */
function slowStore(base, clock, rng) {
  let dead = false;
  const later = fn => new Promise(resolve => {
    clock.setTimeout(() => { if (!dead) fn().then(resolve); }, 5 + next(rng) * 55);
  });
  return {
    ...base, kind: 'slow',
    saveChar: (ch, f) => later(() => base.saveChar(ch, f)),
    appendJournal: rows => later(() => base.appendJournal(rows)),
    tradeChars: list => later(() => base.tradeChars(list)),
    releaseChar: (id, o) => later(() => base.releaseChar(id, o)),
    kill() { dead = true; },
  };
}

const ROUNDS = +(process.env.TV_CHAOS_ROUNDS || 500);

test(`chaos: ${ROUNDS} crashes mid-trade/mid-save; items held exactly once, gold conserved`, { timeout: 600000 }, async () => {
  const clock = createVirtualClock();
  const base = createMemoryStore({ now: clock.now });
  const rng = seedStream(2026, 'chaos');
  let store = slowStore(base, clock, rng);
  const opts = { journalMs: 2000, saveEveryMs: 3000, lingerMs: 1000 };
  let srv = makeServer({ clock, store, worldOpts: opts });
  await srv.ready;
  const bots = [];
  for (let i = 0; i < 4; i++) {
    const b = makeClient(() => srv, clock);
    await waitP(clock, b.ready);
    const ch = await waitP(clock, b.createChar({ name: 'Chaos ' + 'abcd'[i] + 'x', cls: 'warrior' }));
    await waitP(clock, b.play(ch.id));
    bots.push(b);
  }
  // starting goods, made durable
  const W0 = srv.world;
  bots.forEach((b, i) => {
    const o = W0.online.get(b.joined.you.char);
    W0.grant(o, { items: Array.from({ length: 4 }, (_, k) => ({ name: `Thing ${i}.${k}`, rarity: 'common', slot: ['head', 'ring', 'feet', 'chest'][k], value: 1 })), gold: 100, reason: 'test' });
    W0.transfer(o, W0.townRoom, { x: W0.town.x + i, z: W0.town.z }, 't');
  });
  for (const o of W0.online.values()) await waitP(clock, Promise.resolve(W0.saveNow(o)));
  await run(clock, 500);
  const before = loadAll(base);
  const allUids = new Set(before.flatMap(heldUids));
  const goldTotal = before.reduce((s, c) => s + c.gold, 0);
  assert.equal(allUids.size, 16); assert.equal(goldTotal, 400);

  // bots: answer trades by themselves
  for (const b of bots) {
    b.on('tradeAsk', m => b.tradeOp('accept', { id: m.trade }));
    b.on('trade', m => {
      const t = m.trade;
      if (!t || t.state !== 'open') return;
      const me = t.you;
      if (!me.offered) {
        const bag = b.joined ? b.joined.you.bag : [];
        const items = bag.length && next(rng) < 0.7 ? [bag[int(rng, bag.length)].uid] : [];
        b.tradeOp('offer', { id: t.id, items, gold: int(rng, Math.max(1, Math.min(30, (b.joined ? b.joined.you.gold : 0) + 1))) });
        me.offered = true; b._offered = t.id;
      } else if (!me.locked) b.tradeOp('lock', { id: t.id });
      else if (t.them.locked && !me.confirmed) b.tradeOp('confirm', { id: t.id });
    });
  }
  let trades = 0, checks = 0, crashedMidTrade = 0;
  for (let round = 0; round < ROUNDS; round++) {
    const span = 100 + int(rng, 2500);
    for (let t = 0; t < span; t += 50) {
      const W = srv.world;
      if (next(rng) < 0.15) {                                    // start a trade
        const [a, b] = [int(rng, 4), int(rng, 4)];
        if (a !== b && bots[a].status === 'online' && bots[b].status === 'online') bots[a].tradeOp('ask', { id: bots[b].you });
      }
      if (next(rng) < 0.05) {                                    // equip / unequip (bag <-> worn: still conserved)
        const b = bots[int(rng, 4)];
        if (b.joined) {
          const bag = b.joined.you.bag, eq = b.joined.you.equipment || {};
          const worn = Object.values(eq).filter(Boolean);
          if (bag.length && next(rng) < 0.6) b.item('equip', bag[int(rng, bag.length)].uid);
          else if (worn.length) b.item('unequip', worn[int(rng, worn.length)].uid);
        }
      }
      for (const b of bots) if (b.status === 'online' && next(rng) < 0.3) b.input({ s: (b._s = (b._s || 0) + 1), dt: 50, mx: next(rng) - 0.5, mz: next(rng) - 0.5, yaw: 0, b: 0 });
      await run(clock, 50, 50);
    }
    if (srv.world.trades.byId.size) crashedMidTrade++;
    trades += srv.world.status().trades.done;
    // CRASH: no goodbyes, unlanded writes are lost
    srv.crash(); store.kill();
    store = slowStore(base, clock, rng);
    srv = makeServer({ clock, store, worldOpts: opts });
    await srv.ready;
    const back = await until(clock, () => bots.every(b => b.status === 'online'), 20000, 50);
    assert.ok(back, `round ${round}: everyone reconnected`);
    // bring the walkers back together for trading
    for (const b of bots) { const o = srv.world.online.get(b.joined.you.char); if (o) srv.world.transfer(o, srv.world.townRoom, { x: srv.world.town.x + int(rng, 4), z: srv.world.town.z }, 't'); }
    // the store, as a restart would read it
    const now = loadAll(base);
    const uids = now.flatMap(heldUids);
    if (uids.length !== allUids.size) {
      const seen = {}; for (const c of now) for (const u of heldUids(c)) (seen[u] ||= []).push(c.name + (c.bag.some(i => i.uid === u) ? ':bag' : ':worn'));
      const d = Object.entries(seen).filter(([, v]) => v.length > 1);
      console.log('DUPES', JSON.stringify(d));
      for (const c of now) console.log(c.name, 'jseq', c.jseq, 'bag', c.bag.map(i => i.name).join('|'), 'eq', JSON.stringify(Object.fromEntries(Object.entries(c.equipment||{}).map(([k,v])=>[k,v&&v.name]))));
      for (const r of Object.values(base.data.chars)) console.log(r.id, 'blob jseq', r.cols.journal_seq, 'v', r.version, JSON.stringify((base.data.journal[r.id]||[]).map(j => [j.seq, j.kind, j.payload.item ? j.payload.item.name : j.payload.uid || (j.payload.equipment ? Object.values(j.payload.equipment).map(x=>x&&x.name).join('+') : '')])));
    }
    assert.equal(uids.length, allUids.size, `round ${round}: item count ${uids.length}`);
    assert.equal(new Set(uids).size, uids.length, `round ${round}: an item is held twice`);
    for (const u of uids) assert.ok(allUids.has(u), `round ${round}: unknown item ${u}`);
    assert.equal(now.reduce((s, c) => s + c.gold, 0), goldTotal, `round ${round}: gold total`);
    // and the live world (loaded from it) agrees
    const live = [...srv.world.online.values()].map(o => o.char);
    assert.equal(live.flatMap(heldUids).length, allUids.size, `round ${round}: live item count`);
    assert.equal(live.reduce((s, c) => s + c.gold, 0), goldTotal, `round ${round}: live gold`);
    checks++;
  }
  console.log(`# chaos: ${checks} crashes, ${trades} trades completed, ${crashedMidTrade} crashes with a trade open; all conserved`);
  assert.ok(trades > ROUNDS / 5, 'trades actually happened: ' + trades);
  for (const b of bots) b.close();
  await waitP(clock, srv.stop());
});
