// M3 mail (PLAN §9.2 / §13): letters with gold and items move out of the sender's blob and into escrow in ONE
// transaction, and out of escrow into the receiver's blob in one transaction. Conservation over many random
// letters (+ a crash), the evil-client cases (items you don't have, replayed uids, negative gold, double takes,
// mail while trading, full bags, strangers who ignore you), expiry and returned mail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { m3Server, claimedAs, joinAs, run, until } from './m3-helpers.js';
import { loadAll } from './helpers.js';

const replies = c => { const l = []; c.on('mailR', m => l.push(m)); return l; };
let itemN = 0;
function give(srv, c, n = 3, gold = 0) {
  const o = srv.world.online.get(c.joined.you.char);
  const items = Array.from({ length: n }, () => ({ name: 'Test blade ' + (++itemN), rarity: 'common', slot: 'weapon', value: 3 }));
  srv.world.grant(o, { items, gold, reason: 'test' });
  return o;
}
/** Total items and gold that exist: every character (durable: blob + journal) + everything in escrow + postage spent. */
async function totals(store, srv) {
  const chars = loadAll(store);
  let items = 0, gold = 0;
  for (const ch of chars) { items += (ch.bag || []).length; gold += ch.gold || 0; }
  const esc = await store.escrow();
  const sunk = (srv && srv.world.econ.lastHour().sink.byReason.postage || { gold: 0 }).gold;
  return { items: items + esc.items, gold: gold + esc.gold + sunk, escrow: esc };
}
async function save(srv, ...cs) { for (const c of cs) { const o = srv.world.online.get(c.joined.you.char); if (o) await srv.world.saveNow(o); } await srv.world.flushJournal(); }

test('send -> list -> read -> take: items + gold move, postage is a sink, the letter empties; a guest can receive', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Sender'), b = await joinAs(srv, clock, 'Getter');
  const ra = replies(a), rb = replies(b);
  const oa = give(srv, a, 3, 50);
  await run(clock, 100);
  const uids = oa.char.bag.slice(0, 2).map(i => i.uid);
  let note = null; b.on('mailNew', m => { note = m; });
  a.mail('send', { to: 'getter', subject: 'Swords', body: 'Two for you.', items: uids, gold: 20 });
  await until(clock, () => ra.length);
  assert.equal(ra[0].ok, true, JSON.stringify(ra[0]));
  assert.equal(ra[0].cost, 21);
  assert.equal(oa.char.gold, 50 - 21); assert.equal(oa.char.bag.length, 1);
  assert.equal(a.joined.you.bag.length, 1, 'the client bag follows');
  await until(clock, () => note);
  assert.equal(note.unread, 1);
  let list = null; b.on('mailList', m => { list = m; });
  b.mail('list'); await until(clock, () => list);
  assert.equal(list.mail.length, 1); assert.equal(list.mail[0].from, 'Sender'); assert.equal(list.mail[0].gold, 20); assert.equal(list.mail[0].items.length, 2);
  let open = null; b.on('mailOpen', m => { open = m.mail; });
  b.mail('read', { id: list.mail[0].id }); await until(clock, () => open);
  assert.equal(open.body, 'Two for you.'); assert.equal(open.items[0].uid, uids[0]);
  const ob = srv.world.online.get(b.joined.you.char);
  b.mail('take', { id: list.mail[0].id }); await until(clock, () => rb.length);
  assert.equal(rb[0].ok, true, JSON.stringify(rb[0]));
  assert.deepEqual(ob.char.bag.map(i => i.uid).sort(), uids.slice().sort(), 'the same uids arrive');
  assert.equal(ob.char.gold, 20);
  assert.equal((await store.escrow()).items, 0);
  b.mail('take', { id: list.mail[0].id }); await until(clock, () => rb.length >= 2);
  assert.equal(rb[1].ok, false, 'nothing left to take');
  b.mail('delete', { id: list.mail[0].id }); await until(clock, () => rb.length >= 3);
  assert.equal(rb[2].ok, true);
  assert.equal(srv.world.econ.lastHour().sink.byReason.postage.gold, 1);
  a.close(); b.close(); await srv.stop();
});

test('evil mail: not yours, replayed uids, bad gold, guests, outside town, while trading, ignored, full bag, double take', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const W = srv.world;
  const a = await claimedAs(srv, clock, 'Evilsender'), b = await claimedAs(srv, clock, 'Victimtwo'), g = await joinAs(srv, clock, 'Guestly');
  const ra = replies(a), rb = replies(b), rg = replies(g);
  const oa = give(srv, a, 4, 30), ob = give(srv, b, 2, 0);
  give(srv, g, 1, 10);
  await run(clock, 100);
  const send = async (c, r, x) => { await run(clock, 600); const n = r.length; c.mail('send', x); assert.ok(await until(clock, () => r.length > n), 'no answer'); return r.at(-1); };
  // someone else's item
  let r = await send(a, ra, { to: 'Victimtwo', items: [ob.char.bag[0].uid] });
  assert.equal(r.ok, false); assert.equal(r.why, 'item');
  // the same uid twice in one letter
  r = await send(a, ra, { to: 'Victimtwo', items: [oa.char.bag[0].uid, oa.char.bag[0].uid] });
  assert.equal(r.ok, false);
  // negative / too much gold (negative never passes; validate refuses non-integers before it gets here)
  r = await send(a, ra, { to: 'Victimtwo', gold: -5 }); assert.equal(r.ok, false);
  r = await send(a, ra, { to: 'Victimtwo', gold: 30 }); assert.equal(r.ok, false, 'gold + postage over what you have');
  const bad0 = W.counters.bad;
  a._raw('p', JSON.stringify({ t: 'mail', op: 'send', to: 'Victimtwo', gold: 1.5 })); await run(clock, 100);
  assert.equal(W.counters.bad, bad0 + 1, 'a non-integer is a bad message');
  // too many items, nobody, yourself
  r = await send(a, ra, { to: 'Victimtwo', items: oa.char.bag.map(i => i.uid).concat(['x1', 'x2', 'x3']) }); assert.equal(r.ok, false);
  r = await send(a, ra, { to: 'Nobodyatall' }); assert.equal(r.why, 'notFound');
  r = await send(a, ra, { to: 'evilsender' }); assert.equal(r.why, 'self');
  // a guest cannot send (it can receive)
  r = await send(g, rg, { to: 'Victimtwo', gold: 1 }); assert.equal(r.why, 'gate');
  // outside a town
  W.transfer(oa, W.copies[0], { x: W.gate.x + 30, z: W.gate.z }, 't');
  r = await send(a, ra, { to: 'Victimtwo', gold: 1 }); assert.equal(r.why, 'town');
  W.transfer(oa, W.townRoom, { x: W.town.x, z: W.town.z }, 't');
  // an item in an open trade window
  W.transfer(ob, W.townRoom, { x: W.town.x + 1, z: W.town.z }, 't');
  await run(clock, 200);
  let ask = null; b.on('tradeAsk', m => { ask = m; });
  a.tradeOp('ask', { id: ob.entity.id }); await until(clock, () => ask);
  b.tradeOp('accept', { id: ask.trade }); await run(clock, 100);
  a.tradeOp('offer', { id: ask.trade, items: [oa.char.bag[0].uid], gold: 0 }); await run(clock, 100);
  r = await send(a, ra, { to: 'Victimtwo', items: [oa.char.bag[0].uid] }); assert.equal(r.why, 'trade');
  a.tradeOp('cancel'); await run(clock, 100);
  // ignored by the recipient
  b.ignore('Evilsender', true); await run(clock, 200);
  await save(srv, b);                          // the ignore list is read from the saved character
  r = await send(a, ra, { to: 'Victimtwo', gold: 1 }); assert.equal(r.why, 'ignored');
  b.ignore('Evilsender', false); await run(clock, 200); await save(srv, b);
  // a uid already in escrow (an item duplicated into the bag by a bug) refuses the whole letter
  const u0 = oa.char.bag[0].uid;
  r = await send(a, ra, { to: 'Victimtwo', items: [u0] }); assert.equal(r.ok, true);
  oa.char.bag.push({ name: 'Duped', rarity: 'common', uid: u0 });
  const before = oa.char.gold;
  r = await send(a, ra, { to: 'Victimtwo', items: [u0], gold: 2 }); assert.equal(r.ok, false);
  assert.equal(oa.char.gold, before, 'nothing moved');
  oa.char.bag.pop();
  // full bag on the receiving side: refused, the letter keeps everything
  let list = null; b.on('mailList', m => { list = m; });
  b.mail('list'); await until(clock, () => list);
  const id = list.mail[0].id;
  const fill = ob.char.bag.length;
  // round 11 (#11): the bag is tabs — Equipment and Items each hold the size, so fill both
  for (let i = 0; i < 120; i++) ob.char.bag.push({ name: 'Pebble', uid: 'pebble' + i }, { name: 'Blade', uid: 'blade' + i, type: 'weapon', slot: 'weapon' });
  const takeOnce = async () => { const n = rb.length; b.mail('take', { id }); await until(clock, () => rb.length > n); return rb.at(-1); };
  r = await takeOnce(); assert.equal(r.why, 'bagFull');
  ob.char.bag.length = fill;
  // double take in the same tick: one wins, the other is refused, the item arrives once
  b.mail('take', { id }); b.mail('take', { id });
  await until(clock, () => rb.filter(x => x.op === 'take').length >= 3);
  const takes = rb.filter(x => x.op === 'take').slice(-2);
  assert.equal(takes.filter(x => x.ok).length, 1, JSON.stringify(takes));
  assert.equal(ob.char.bag.filter(i => i.uid === u0).length, 1);
  // a letter that is not yours
  const rg2 = rg.length; g.mail('take', { id }); await until(clock, () => rg.length > rg2);
  assert.equal(rg.at(-1).ok, false);
  a.close(); b.close(); g.close(); await srv.stop();
});

test('conservation: 200 random letters, takes, returns and a crash — no item or gold appears or vanishes', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const { srv } = m3Server({ clock, store });
  await srv.ready;
  const names = ['Mailone', 'Mailtwo', 'Mailthree', 'Mailfour'];
  const cs = [];
  for (const n of names) cs.push(await claimedAs(srv, clock, n));
  for (const c of cs) give(srv, c, 6, 100);
  await run(clock, 200);
  await save(srv, ...cs);
  const t0 = await totals(store, srv);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const lists = new Map();
  for (const c of cs) { c.on('mailList', m => lists.set(c, m.mail)); }
  for (let k = 0; k < 200; k++) {
    const i = Math.floor(rnd() * cs.length), c = cs[i], o = srv.world.online.get(c.joined.you.char);
    const roll = rnd();
    if (roll < 0.5) {
      const to = names[(i + 1 + Math.floor(rnd() * 3)) % 4];
      const items = o.char.bag.filter(() => rnd() < 0.3).slice(0, 3).map(x => x.uid);
      c.mail('send', { to, items, gold: Math.floor(rnd() * 5) });
    } else if (roll < 0.85) {
      const l = lists.get(c) || [];
      const m = l.find(x => !x.taken && (x.gold || x.items.length));
      if (m) c.mail('take', { id: m.id }); else c.mail('list');
    } else if (roll < 0.95) {
      const l = lists.get(c) || [];
      const m = l.find(x => !x.taken && x.kind === 'player');
      if (m) c.mail('return', { id: m.id }); else c.mail('list');
    } else c.mail('list');
    await run(clock, 60);
  }
  await run(clock, 500);
  await save(srv, ...cs);
  const t1 = await totals(store, srv);
  assert.equal(t1.items, t0.items, 'items conserved');
  assert.equal(t1.gold, t0.gold, 'gold conserved (postage counted as spent)');
  assert.ok(srv.world.counters.mailSent > 20, 'letters went: ' + srv.world.counters.mailSent);
  assert.ok(srv.world.counters.mailTaken > 5, 'letters taken: ' + srv.world.counters.mailTaken);
  // no uid in two places
  const seen = new Set();
  for (const ch of loadAll(store)) for (const it of ch.bag) { assert.ok(!seen.has(it.uid), 'uid twice ' + it.uid); seen.add(it.uid); }
  for (const u of t1.escrow.uids) { assert.ok(!seen.has(u), 'uid in a bag AND in escrow ' + u); seen.add(u); }
  // a crash right after a burst of sends: what the store holds is still whole
  const sunkBefore = srv.world.econ.lastHour().sink.byReason.postage.gold;
  for (const c of cs) { const o = srv.world.online.get(c.joined.you.char); if (o.char.bag.length) c.mail('send', { to: names[(cs.indexOf(c) + 1) % 4], items: [o.char.bag[0].uid], gold: 1 }); }
  await run(clock, 60);
  const sunkAfter = srv.world.econ.lastHour().sink.byReason.postage.gold;
  srv.crash();
  const chars = loadAll(store);
  let items = 0, gold = 0; for (const ch of chars) { items += ch.bag.length; gold += ch.gold; }
  const esc = await store.escrow();
  assert.equal(items + esc.items, t0.items, 'after a crash: items whole');
  assert.equal(gold + esc.gold + sunkAfter, t0.gold, 'after a crash: gold whole');
  assert.ok(sunkAfter >= sunkBefore);
  for (const c of cs) c.close();
});

test('expiry: an untaken letter goes back to its sender after the time is up; returned mail keeps; a refused store write moves nothing', async () => {
  const { srv, clock, store } = m3Server({ worldOpts: { mailOpts: { expireMs: 60000 }, mailSweepMs: 1000 } });
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Oldsender'), b = await claimedAs(srv, clock, 'Away');
  const ra = replies(a);
  const oa = give(srv, a, 2, 10);
  await run(clock, 100);
  const uid = oa.char.bag[0].uid;
  a.mail('send', { to: 'Away', subject: 'Here', items: [uid], gold: 3 }); await until(clock, () => ra.length);
  assert.equal(ra[0].ok, true);
  let note = 0; a.on('mailNew', m => { note = m.unread; });
  await run(clock, 62000, 500);
  await until(clock, () => note === 1);
  let list = null; a.on('mailList', m => { list = m.mail; });
  a.mail('list'); await until(clock, () => list);
  assert.equal(list.length, 1); assert.equal(list[0].kind, 'return'); assert.match(list[0].subject, /^Returned: Here/);
  assert.equal(list[0].expiresAt, null, 'returned mail keeps');
  assert.equal(list[0].items[0].uid, uid); assert.equal(list[0].gold, 3);
  assert.equal(Object.values(store.data.mail).filter(m => m.to === b.joined.you.char).length, 0);
  // a store that refuses the write: nothing leaves the pack
  const real = store.mailSend;
  store.mailSend = async () => false;
  const g0 = oa.char.gold, n0 = oa.char.bag.length;
  a.mail('send', { to: 'Away', items: [oa.char.bag[0].uid], gold: 1 }); await until(clock, () => ra.length >= 2);
  assert.equal(ra.at(-1).ok, false); assert.equal(oa.char.gold, g0); assert.equal(oa.char.bag.length, n0);
  store.mailSend = async () => { throw new Error('db down'); };
  a.mail('send', { to: 'Away', items: [oa.char.bag[0].uid], gold: 1 }); await until(clock, () => ra.length >= 3);
  assert.equal(ra.at(-1).ok, false); assert.equal(oa.char.gold, g0);
  store.mailSend = real;
  // and the player can still act afterwards (not stuck frozen)
  a.mail('take', { id: list[0].id }); await until(clock, () => ra.length >= 4);
  assert.equal(ra.at(-1).ok, true, JSON.stringify(ra.at(-1)));
  assert.ok(oa.char.bag.some(i => i.uid === uid));
  a.close(); b.close(); await srv.stop();
});
