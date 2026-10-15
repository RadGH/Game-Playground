// Round 11 (Market stream, owner report #25): the player market and full-bag safety.
// The Market: list (fee from the shop sell value, paid up front), browse with filters, buy (item + gold by mail), cancel
// (item back by mail, fee kept), 30-day expiry, the cap, the gates; every move all-or-nothing — two players racing for one
// listing, a store that fails mid-buy, and conservation over many random moves + a crash.
// Full bags: a letter's items stay in the letter, a reward that does not fit goes to the post (never into gold), a crate
// refuses to open before anything is rolled out of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVirtualClock } from '../../js/net/clock.js';
import { createMemoryStore } from '../../js/sim/store-memory.js';
import { MARKET, feeFor, listRefusal, browseFilter, letter, describe, sortRows, matches } from '../../js/sim/market-rules.js';
import { m3Server, claimedAs, joinAs, run, until } from './m3-helpers.js';
import { loadAll } from './helpers.js';
import { tabCounts } from '../../js/sim/bag-tabs.js';

let itemN = 0;
const sword = (n = '') => ({ name: 'Market blade ' + n + (++itemN), rarity: 'magic', slot: 'weapon', type: 'weapon', value: 40, level: 3 });
const ore = (count = 5) => ({ kind: 'material', id: 'copper_ore', name: 'Copper Ore', rarity: 'normal', count, price: 2, value: 2 });
function rec(srv, c) { return srv.world.online.get(c.joined.you.char); }
function give(srv, c, items, gold = 0) { const o = rec(srv, c); srv.world.grant(o, { items, gold, reason: 'test' }); return o; }
const answers = (c, t = 'marketR') => { const l = []; c.on(t, m => l.push(m)); return l; };
async function ask(clock, c, list, op, a) { await run(clock, 550); const n = list.length;      // (2 a second: the protocol's rate)
  c.market(op, a); assert.ok(await until(clock, () => list.length > n), 'no answer to ' + op); return list.at(-1); }
async function save(srv, ...cs) { for (const c of cs) { const o = rec(srv, c); if (o) await srv.world.saveNow(o); } await srv.world.flushJournal(); }
/** Every item and gold coin that exists: bags (durable) + escrow (letters AND listings) + gold sunk as fees/postage. */
async function totals(store, srv) {
  let items = 0, gold = 0;
  for (const ch of loadAll(store)) { items += (ch.bag || []).length; gold += ch.gold || 0; }
  const esc = await store.escrow();
  const by = srv.world.econ.lastHour().sink.byReason;
  const sunk = (by.marketFee || { gold: 0 }).gold + (by.postage || { gold: 0 }).gold;
  return { items: items + esc.items, gold: gold + esc.gold + sunk, esc };
}

test('rules: fee is 20% of the sell value (at least 1), kept things refused, filters and sorts', () => {
  assert.equal(MARKET.feePct, 20); assert.equal(MARKET.cap, 20); assert.equal(MARKET.lastsMs, 30 * 86400000);
  assert.equal(feeFor(0), 1); assert.equal(feeFor(3), 1); assert.equal(feeFor(10), 2); assert.equal(feeFor(101), 21);
  assert.equal(listRefusal({ uid: 'a', id: 'recall_charm', name: 'Recall Charm', noSell: true, keep: true }), 'keep');
  assert.equal(listRefusal({ uid: 'q', name: 'Parcel', kind: 'good', quest: 'x', noSell: true }), 'keep');
  assert.equal(listRefusal({ uid: 'c', kind: 'crate', name: 'Crate', crate: {} }), 'keep');
  assert.equal(listRefusal({ uid: 's', ...sword() }), null);
  assert.equal(listRefusal({ uid: 'o', ...ore() }), null);
  assert.deepEqual(describe({ ...ore(12) }).tab, 'items'); assert.equal(describe(ore(12)).sub, 'material'); assert.equal(describe(ore(12)).count, 12);
  assert.equal(describe(sword()).sub, 'weapon'); assert.equal(describe({ name: 'Cap', slot: 'head', type: 'armor' }).sub, 'head');
  const f = browseFilter({ q: ' COPPER ', tab: 'items', slot: 'material', sort: 'each', page: -3 });
  assert.deepEqual(f, { q: 'copper', tab: 'items', sub: 'material', sort: 'each', page: 0 });
  assert.equal(browseFilter({ tab: 'gear', slot: 'material' }).sub, '', 'a sub that is not in the tab is dropped');
  const rows = [{ id: 1, price: 10, count: 5, listedAt: 1, expiresAt: 9e15, name_lower: 'copper ore', tab: 'items', sub: 'material' }, { id: 2, price: 8, count: 1, listedAt: 2, expiresAt: 9e15, name_lower: 'copper ore', tab: 'items', sub: 'material' }];
  assert.deepEqual(sortRows(rows, 'cheap').map(r => r.id), [2, 1]);
  assert.deepEqual(sortRows(rows, 'each').map(r => r.id), [1, 2], 'per unit: 2 each beats 8 each');
  assert.deepEqual(sortRows(rows, 'new').map(r => r.id), [2, 1]);
  assert.equal(matches(rows[0], f, 0), true); assert.equal(matches(rows[0], { ...f, q: 'iron' }, 0), false); assert.equal(matches({ ...rows[0], expiresAt: 5 }, f, 6), false);
  assert.match(letter('sold', { name: 'Copper Ore', count: 5, price: 10, buyer: 'Bo' }).body, /Bo bought your 5 x Copper Ore on the Market\. Your 10 gold/);
  assert.match(letter('expired', { name: 'X' }).body, /30 days/);
});

test('list -> browse -> buy: fee up front, item to the buyer by mail, gold to the seller by mail; own listing refused', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Sellerone'), b = await claimedAs(srv, clock, 'Buyerone');
  const ra = answers(a), rb = answers(b);
  const oa = give(srv, a, [sword('A'), ore(12)], 100), ob = give(srv, b, [], 500);
  await run(clock, 100);
  // the fee quote the window shows BEFORE you confirm
  let mine = null; a.on('marketMine', m => { mine = m; });
  a.market('mine'); await until(clock, () => mine);
  const blade = oa.char.bag.find(i => i.slot === 'weapon'), pile = oa.char.bag.find(i => i.kind === 'material');
  const q = mine.quotes.find(x => x.uid === blade.uid);
  assert.ok(q && q.sell >= 1 && q.fee === feeFor(q.sell), JSON.stringify(q));
  assert.equal(mine.cap, 20); assert.equal(mine.feePct, 20); assert.equal(mine.canSell, null);
  assert.ok(!mine.quotes.some(x => oa.char.bag.find(i => i.uid === x.uid && listRefusal(i))), 'no quote for a kept item');
  const g0 = oa.char.gold;
  let r = await ask(clock, a, ra, 'sell', { uid: blade.uid, price: 250 });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.fee, q.fee);
  assert.equal(oa.char.gold, g0 - q.fee, 'the fee is paid now');
  assert.ok(!oa.char.bag.some(i => i.uid === blade.uid), 'the item left the bag');
  assert.equal(srv.world.econ.lastHour().sink.byReason.marketFee.gold, q.fee, 'the fee is a sink');
  r = await ask(clock, a, ra, 'sell', { uid: pile.uid, price: 30 }); assert.equal(r.ok, true);
  // anyone browses; filters work
  let page = null; b.on('marketList', m => { page = m; });
  const browse = async x => { await run(clock, 550); page = null; b.market('browse', x); await until(clock, () => page); return page; };
  let p = await browse({});
  assert.equal(p.total, 2); assert.equal(p.list[0].price, 30, 'cheapest first'); assert.ok(p.list[0].item && p.list[0].item.name, 'the full item rides along for the card');
  assert.equal((await browse({ tab: 'gear' })).total, 1);
  assert.equal((await browse({ tab: 'items', slot: 'material' })).list[0].count, 12);
  assert.equal((await browse({ q: 'market blade' })).total, 1);
  assert.equal((await browse({ q: 'nothing like it' })).total, 0);
  p = await browse({ sort: 'dear' });
  const swordRow = p.list[0];
  assert.equal(swordRow.price, 250); assert.equal(swordRow.seller, 'Sellerone'); assert.ok(!swordRow.mine);
  // the seller cannot buy their own
  r = await ask(clock, a, ra, 'buy', { id: swordRow.id, price: 250 }); assert.equal(r.ok, false); assert.equal(r.why, 'own');
  // a stale price is refused
  r = await ask(clock, b, rb, 'buy', { id: swordRow.id, price: 200 }); assert.equal(r.ok, false); assert.equal(r.why, 'changed');
  assert.equal(ob.char.gold, 500);
  // buy
  let noteA = null, noteB = null; a.on('mailNew', m => { noteA = m; }); b.on('mailNew', m => { noteB = m; });
  r = await ask(clock, b, rb, 'buy', { id: swordRow.id, price: 250 });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(ob.char.gold, 250);
  await until(clock, () => noteA && noteB);
  // the buyer's letter holds the sword; it is taken anywhere (kind market)
  let lb = null; b.on('mailList', m => { lb = m; }); b.mail('list'); await until(clock, () => lb);
  const got = lb.mail.find(m => m.kind === 'market');
  assert.ok(got && got.items.length === 1 && /Bought/.test(got.subject), JSON.stringify(lb.mail));
  const mb = answers(b, 'mailR');
  b.mail('take', { id: got.id }); await until(clock, () => mb.length);
  assert.equal(mb[0].ok, true, JSON.stringify(mb[0]));
  assert.ok(ob.char.bag.some(i => i.uid === blade.uid), 'the same item (uid) arrives');
  // the seller's letter holds the gold, with a note
  let la = null; a.on('mailList', m => { la = m; }); a.mail('list'); await until(clock, () => la);
  const paid = la.mail.find(m => m.kind === 'market');
  assert.equal(paid.gold, 250); assert.match(paid.subject, /^Sold: /);
  assert.equal((await browse({})).total, 1, 'the sold listing is gone');
  // gone now
  r = await ask(clock, b, rb, 'buy', { id: swordRow.id, price: 250 }); assert.equal(r.why, 'gone');
  a.close(); b.close(); await srv.stop();
});

test('gates and refusals: guests, low level, kept items, bad prices, gold for the fee, the cap, the hourly limit', async () => {
  const { srv, clock } = m3Server({ worldOpts: { marketOpts: { cap: 3, perHour: 5 } } });
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Gatedone'), g = await joinAs(srv, clock, 'Guestseller'), lo = await claimedAs(srv, clock, 'Lowlevel', { level: 2 });
  const ra = answers(a), rg = answers(g), rl = answers(lo);
  const oa = give(srv, a, [sword(), sword(), sword(), sword(), sword(), sword(), sword()], 1000);
  const og = give(srv, g, [sword()], 50), ol = give(srv, lo, [sword()], 50);
  await run(clock, 100);
  let r = await ask(clock, g, rg, 'sell', { uid: og.char.bag.find(i => i.slot).uid, price: 5 }); assert.equal(r.why, 'gate');
  r = await ask(clock, lo, rl, 'sell', { uid: ol.char.bag.find(i => i.slot).uid, price: 5 }); assert.equal(r.why, 'gate'); assert.match(r.msg, /level 5/);
  oa.char.bag.push({ uid: 'charm-1', id: 'recall_charm', name: 'Recall Charm', kind: 'good', noSell: true, noDrop: true, keep: true, use: { type: 'recall' } });
  r = await ask(clock, a, ra, 'sell', { uid: 'charm-1', price: 5 }); assert.equal(r.why, 'keep');
  const blades = oa.char.bag.filter(i => i.slot === 'weapon');
  for (const bad of [0, -5, 10000001]) { r = await ask(clock, a, ra, 'sell', { uid: blades[0].uid, price: bad }); assert.equal(r.why, 'price', 'price ' + bad); }
  r = await ask(clock, a, ra, 'sell', { uid: 'not-mine', price: 5 }); assert.equal(r.why, 'item');
  const gold = oa.char.gold; oa.char.gold = 0;
  r = await ask(clock, a, ra, 'sell', { uid: blades[0].uid, price: 5 }); assert.equal(r.why, 'gold', 'the fee needs gold');
  oa.char.gold = gold;
  for (let i = 0; i < 3; i++) { r = await ask(clock, a, ra, 'sell', { uid: blades[i].uid, price: 5 + i }); assert.equal(r.ok, true, JSON.stringify(r)); }
  r = await ask(clock, a, ra, 'sell', { uid: blades[3].uid, price: 9 }); assert.equal(r.why, 'cap');
  assert.ok(oa.char.bag.some(i => i.uid === blades[3].uid), 'a refused listing leaves the item where it was');
  // cancel one: the item comes back by mail, the fee does not
  let mine = null; a.on('marketMine', m => { mine = m; }); a.market('mine'); await until(clock, () => mine);
  assert.equal(mine.list.length, 3); assert.ok(mine.list.every(x => x.mine && x.fee >= 1));
  const ids = mine.list.map(x => x.id);      // (the window's list refreshes after every change)
  const g1 = oa.char.gold;
  r = await ask(clock, a, ra, 'cancel', { id: ids[0] }); assert.equal(r.ok, true);
  assert.equal(oa.char.gold, g1, 'no refund');
  let la = null; a.on('mailList', m => { la = m; }); a.mail('list'); await until(clock, () => la);
  assert.ok(la.mail.some(m => m.kind === 'market' && /Taken off the Market/.test(m.subject) && m.items.length === 1));
  r = await ask(clock, a, ra, 'cancel', { id: ids[0] }); assert.equal(r.why, 'gone', 'twice');
  r = await ask(clock, g, rg, 'cancel', { id: ids[1] }); assert.equal(r.why, 'gone', 'not yours');
  r = await ask(clock, a, ra, 'sell', { uid: blades[3].uid, price: 9 }); assert.equal(r.ok, true, 'room again after a cancel');
  r = await ask(clock, a, ra, 'sell', { uid: blades[4].uid, price: 9 }); assert.equal(r.why, 'cap');
  // hourly limit: five listings made in this hour (4 ok + the cap refusals do not count)
  r = await ask(clock, a, ra, 'cancel', { id: ids[1] }); assert.equal(r.ok, true);
  r = await ask(clock, a, ra, 'sell', { uid: blades[4].uid, price: 9 }); assert.equal(r.ok, true);
  r = await ask(clock, a, ra, 'cancel', { id: ids[2] }); assert.equal(r.ok, true);
  r = await ask(clock, a, ra, 'sell', { uid: blades[5].uid, price: 9 }); assert.equal(r.why, 'slow');
  a.close(); g.close(); lo.close(); await srv.stop();
});

test('two players race for one listing: exactly one gets it, the other keeps their gold; a store that fails mid-buy changes nothing', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const { srv } = m3Server({ clock, store });
  await srv.ready;
  const s = await claimedAs(srv, clock, 'Racesell'), b1 = await claimedAs(srv, clock, 'Raceone'), b2 = await claimedAs(srv, clock, 'Racetwo');
  const rs = answers(s), r1 = answers(b1), r2 = answers(b2);
  const os = give(srv, s, [sword(), sword()], 100), o1 = give(srv, b1, [], 300), o2 = give(srv, b2, [], 300);
  await run(clock, 100);
  const [x, y] = os.char.bag.filter(i => i.slot === 'weapon');
  assert.equal((await ask(clock, s, rs, 'sell', { uid: x.uid, price: 120 })).ok, true);
  await save(srv, s, b1, b2);
  const t0 = await totals(store, srv);
  const id = (await store.marketMine(os.char.id))[0].id;
  b1.market('buy', { id, price: 120 }); b2.market('buy', { id, price: 120 });      // the same tick
  await until(clock, () => r1.length && r2.length);
  const wins = [r1[0], r2[0]].filter(r => r.ok);
  assert.equal(wins.length, 1, JSON.stringify([r1[0], r2[0]]));
  const lose = [r1[0], r2[0]].find(r => !r.ok);
  assert.equal(lose.why, 'gone'); assert.match(lose.msg, /Someone else bought it first/);
  assert.equal(o1.char.gold + o2.char.gold, 600 - 120, 'only one paid');
  await save(srv, s, b1, b2);
  const t1 = await totals(store, srv);
  assert.equal(t1.items, t0.items); assert.equal(t1.gold, t0.gold, 'gold whole (the seller\'s 120 sits in a letter)');
  // a store that fails in the middle: nothing moves
  assert.equal((await ask(clock, s, rs, 'sell', { uid: y.uid, price: 50 })).ok, true);
  await save(srv, s, b1, b2);
  const t2 = await totals(store, srv);
  const id2 = (await store.marketMine(os.char.id))[0].id;
  const realBuy = store.marketBuy;
  store.marketBuy = async () => { throw new Error('database went away'); };
  const loser = o1.char.gold >= 50 ? b1 : b2, ol = rec(srv, loser), rl = loser === b1 ? r1 : r2;
  const gl = ol.char.gold;
  const r = await ask(clock, loser, rl, 'buy', { id: id2, price: 50 });
  assert.equal(r.ok, false); assert.equal(r.why, 'failed'); assert.match(r.msg, /gold is still yours/);
  assert.equal(ol.char.gold, gl);
  store.marketBuy = realBuy;
  assert.ok(await store.marketGet(id2), 'the listing is still there');
  assert.equal((await ask(clock, loser, rl, 'buy', { id: id2, price: 50 })).ok, true, 'and can be bought after');
  await save(srv, s, b1, b2);
  const t3 = await totals(store, srv);
  assert.equal(t3.items, t2.items); assert.equal(t3.gold, t2.gold);
  s.close(); b1.close(); b2.close(); await srv.stop();
});

test('30 days: an unsold listing goes back to its seller by mail (the gateway sweep)', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const { srv } = m3Server({ clock, store, worldOpts: { marketOpts: { lastsMs: 2000 } } });
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Expirer');
  const ra = answers(a);
  const oa = give(srv, a, [sword()], 100);
  await run(clock, 100);
  assert.equal((await ask(clock, a, ra, 'sell', { uid: oa.char.bag.find(i => i.slot).uid, price: 77 })).ok, true);
  let note = null; a.on('mailNew', m => { note = m; });
  await run(clock, 2500);
  assert.equal((await store.marketBrowse(browseFilter({}), clock.now())).total, 0, 'not on show once it has expired');
  await run(clock, 61000);      // the gateway's sweep runs once a minute, beside the mail sweep
  assert.equal((await store.marketMine(oa.char.id)).length, 0, 'swept');
  assert.ok(note, 'the seller hears about the letter');
  let la = null; a.on('mailList', m => { la = m; }); a.mail('list'); await until(clock, () => la);
  const back = la.mail.find(m => m.kind === 'market');
  assert.ok(back && /^Unsold: /.test(back.subject) && back.items.length === 1 && back.expiresAt == null, JSON.stringify(back));
  a.close(); await srv.stop();
});

test('conservation: 150 random lists, buys, cancels and takes, then a crash — no item or gold appears or vanishes', async () => {
  const clock = createVirtualClock();
  const store = createMemoryStore({ now: clock.now });
  const { srv } = m3Server({ clock, store });
  await srv.ready;
  const names = ['Mktone', 'Mkttwo', 'Mktthree'];
  const cs = [];
  for (const n of names) cs.push(await claimedAs(srv, clock, n));
  for (const c of cs) give(srv, c, [sword(), sword(), sword(), ore(4), ore(9)], 400);
  await run(clock, 200);
  await save(srv, ...cs);
  const t0 = await totals(store, srv);
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pages = new Map(), mails = new Map(), mines = new Map();
  for (const c of cs) { c.on('marketList', m => pages.set(c, m.list)); c.on('mailList', m => mails.set(c, m.mail)); c.on('marketMine', m => mines.set(c, m.list)); }
  for (let k = 0; k < 150; k++) {
    const c = cs[Math.floor(rnd() * cs.length)], o = rec(srv, c), roll = rnd();
    if (roll < 0.3) { const it = o.char.bag.filter(i => !listRefusal(i))[Math.floor(rnd() * o.char.bag.length)]; if (it) c.market('sell', { uid: it.uid, price: 1 + Math.floor(rnd() * 40) }); else c.market('browse', {}); }
    else if (roll < 0.55) { const l = (pages.get(c) || []).filter(x => !x.mine); const x = l[Math.floor(rnd() * l.length)]; if (x) c.market('buy', { id: x.id, price: x.price }); else c.market('browse', {}); }
    else if (roll < 0.65) { const l = mines.get(c) || []; if (l.length) c.market('cancel', { id: l[0].id }); else c.market('mine'); }
    else if (roll < 0.85) { const m = (mails.get(c) || []).find(x => !x.taken && (x.gold || x.items.length)); if (m) c.mail('take', { id: m.id }); else c.mail('list'); }
    else c.market(rnd() < 0.5 ? 'browse' : 'mine', {});
    await run(clock, 60);
  }
  await run(clock, 500);
  await save(srv, ...cs);
  const t1 = await totals(store, srv);
  assert.equal(t1.items, t0.items, 'items conserved');
  assert.equal(t1.gold, t0.gold, 'gold conserved (fees counted as spent)');
  assert.ok(srv.world.counters.marketListed > 10, 'listed ' + srv.world.counters.marketListed);
  assert.ok(srv.world.counters.marketSold > 3, 'sold ' + srv.world.counters.marketSold);
  const seen = new Set();
  for (const ch of loadAll(store)) for (const it of ch.bag) { assert.ok(!seen.has(it.uid), 'uid twice ' + it.uid); seen.add(it.uid); }
  for (const u of t1.esc.uids) { assert.ok(!seen.has(u), 'uid in a bag AND in escrow ' + u); seen.add(u); }
  // a burst of listings and buys, then the process dies: the store is still whole
  for (const c of cs) { const o = rec(srv, c); const it = o.char.bag.find(i => !listRefusal(i)); if (it) c.market('sell', { uid: it.uid, price: 3 }); }
  for (const c of cs) { const l = (pages.get(c) || []).filter(x => !x.mine); if (l[0]) c.market('buy', { id: l[0].id, price: l[0].price }); }
  await run(clock, 60);
  const fees = (srv.world.econ.lastHour().sink.byReason.marketFee || { gold: 0 }).gold;
  srv.crash();
  let items = 0, gold = 0; for (const ch of loadAll(store)) { items += ch.bag.length; gold += ch.gold; }
  const esc = await store.escrow();
  assert.equal(items + esc.items, t0.items, 'after a crash: items whole');
  assert.equal(gold + esc.gold + fees, t0.gold, 'after a crash: gold whole');
  for (const c of cs) c.close();
});

test('full bags (#25): a reward that does not fit goes to the post, never into gold; a letter keeps what will not fit; a crate stays shut', async () => {
  const { srv, clock, store } = m3Server();
  await srv.ready;
  const a = await claimedAs(srv, clock, 'Fullbag');
  const o = rec(srv, a);
  await run(clock, 100);
  const cap = srv.world.bagCap(o);
  const fill = [];
  for (let i = 0; i < cap; i++) fill.push({ uid: 'fb-g' + i, name: 'Spare blade', type: 'weapon', slot: 'weapon' }, { uid: 'fb-i' + i, name: 'Pebble', kind: 'junk' });
  o.char.bag = o.char.bag.filter(i => !i.slot && i.kind !== 'junk' && i.kind !== 'material').concat(fill);
  assert.equal(tabCounts(o.char.bag).gear, cap);
  const g0 = o.char.gold;
  let chat = null; a.on('chat', m => { if (/sent to your mailbox/.test(m.text || '')) chat = m; });
  let note = null; a.on('mailNew', m => { note = m; });
  srv.world.grant(o, { items: [{ name: 'Quest reward sword', rarity: 'rare', type: 'weapon', slot: 'weapon', value: 90 }], gold: 0, reason: 'quest' });
  await until(clock, () => chat && note);
  assert.equal(o.char.gold, g0, 'not turned into gold');
  let list = null; a.on('mailList', m => { list = m; }); a.mail('list'); await until(clock, () => list);
  const posted = list.mail.find(m => m.subject === 'Your bag was full');
  assert.ok(posted && posted.items.length === 1 && posted.items[0].name === 'Quest reward sword', JSON.stringify(list.mail));
  // taking it with the Equipment tab still full: refused, the letter keeps it, the words name the tab
  const rm = answers(a, 'mailR');
  a.mail('take', { id: posted.id }); await until(clock, () => rm.length);
  assert.equal(rm[0].ok, false); assert.equal(rm[0].why, 'bagFull');
  assert.match(rm[0].msg, /No room in your Equipment tab\. Make room for 1 more thing, then take it\. Everything stays in the letter\./);
  assert.equal((await store.mailGet(o.char.id, posted.id)).itemsFull.length, 1, 'still in the letter');
  // a crate with the Equipment tab full: refused BEFORE it opens, the crate stays
  const crate = { uid: 'fb-crate', id: 'crate', kind: 'crate', type: 'crate', name: 'Weapon Crate', rarity: 'magic', crate: { slot: 'weapon', minRarity: 'magic' } };
  o.char.bag.push(crate);
  const ri = answers(a, 'itemR');
  a.item('use', crate.uid); await until(clock, () => ri.length);
  assert.equal(ri[0].ok, false); assert.equal(ri[0].why, 'bagFull'); assert.match(ri[0].msg, /No room in your (Equipment|Items) tab.*then open it/);      // the stand-in rules roll any item
  assert.ok(o.char.bag.some(i => i.uid === 'fb-crate'), 'the crate is still in the bag, unopened');
  // make room: the letter can be emptied now
  o.char.bag = o.char.bag.filter(i => i.uid !== 'fb-g0');
  a.mail('take', { id: posted.id }); await until(clock, () => rm.length >= 2);
  assert.equal(rm[1].ok, true, JSON.stringify(rm[1]));
  assert.ok(o.char.bag.some(i => i.name === 'Quest reward sword'));
  a.close(); await srv.stop();
});
