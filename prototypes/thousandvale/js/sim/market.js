// THE MARKET (stream Market, round 11, owner report #25) — run by the PROVINCE PROCESS that holds the character, because
// the item and the gold live in the character's blob. Every move is ONE store transaction (js/sim/store-memory-m3.js,
// server/db/pg-social.js), like a letter or a trade: it all happens or none of it does. The listings themselves are in the
// shared database, so every province process (and so the whole realm) sees one Market.
//
//   browse   anyone, anywhere: search + tab (gear / items) + sub (slot / kind) + sort, 30 rows a page
//   mine     my listings, the cap, the fee share, and a fee quote for every bag item that may be listed
//   sell     a claimed account at account level 5 (the mail gate); a bag item that is not kept / not "Other" / not in a
//            trade; whole gold 1 .. 10,000,000 for the lot; pays the fee (20% of the shop sell value, at least 1) NOW
//   buy      not your own; enough gold; the item comes in a letter, the seller's gold goes in a letter
//   cancel   your own listing: the item comes back in a letter (the fee is not paid back)
//   (expiry) the gateway's sweep sends a listing older than 30 days back to its seller by mail
// Letters from the Market are mail kind 'market': read and taken anywhere, never expire, cannot be sent back.
//
//   const M = createMarket({ store, online, syncChar, econ, trades, send, wallNow, sellValue, filter, log, counters, saveNow, refreshItem, opts })
//   M.op(o, m)          m = market {op, ...}

import { MARKET_OPS } from '../net/protocol.js';
import { MARKET, feeFor, listRefusal, browseFilter, countOf } from './market-rules.js';

export function createMarket({ store, online, syncChar, econ, trades, send = () => {}, wallNow, sellValue, log = () => {}, counters = {}, saveNow = () => {}, refreshItem = null, opts = {} }) {
  const R = { ...MARKET, minLevel: 5, ...opts };
  const listedLog = new Map();       // char -> [wall ms] (the hourly limit)
  const fresh = it => { if (refreshItem && it && typeof it === 'object') { try { refreshItem(it); } catch { /* an item the rules do not know stays as it is */ } } return it; };
  const reply = (o, op, x) => { if (o.conn) o.conn.sendJSON({ t: 'marketR', op, ...x }); };
  const fail = (o, op, why, msg, x = {}) => reply(o, op, { ok: false, why, msg, ...x });
  const busy = o => o.frozen || o.saving || o.mailBusy || o.marketBusy;
  const view = (row, me) => ({ id: row.id, seller: row.seller, item: row.item ? fresh(row.item) : null, price: row.price, count: row.count, listedAt: row.listedAt, expiresAt: row.expiresAt, ...(row.sellerChar === me ? { mine: true } : {}), ...(row.fee != null && row.sellerChar === me ? { fee: row.fee } : {}) });
  /** The fee quote for one bag item: { uid, sell, fee } (sell = what a shop pays for the whole lot). */
  const quote = (o, it) => { const sell = Math.max(0, Math.floor(sellValue(o, it) || 0)) * countOf(it); return { uid: it.uid, sell, fee: feeFor(sell) }; };

  async function browse(o, m) {
    const f = browseFilter(m);
    const r = await store.marketBrowse({ ...f, per: R.per }, wallNow());
    if (o.conn) o.conn.sendJSON({ t: 'marketList', list: r.list.map(x => view(x, o.char.id)), total: r.total, page: f.page, per: R.per, q: f.q, tab: f.tab, sub: f.sub, sort: f.sort });
  }
  async function mine(o) {
    const list = await store.marketMine(o.char.id);
    const quotes = (o.char.bag || []).filter(it => !listRefusal(it) && !trades.offered(o.char.id, it.uid)).map(it => quote(o, it));
    if (o.conn) o.conn.sendJSON({ t: 'marketMine', list: list.map(x => view(x, o.char.id)), cap: R.cap, feePct: R.feePct, priceMax: R.priceMax, lastsMs: R.lastsMs, quotes, canSell: gate(o) || null });
  }
  /** null when this character may list; else the words that say why not. */
  function gate(o) {
    if (!o.claimed) return 'Selling on the Market needs a claimed account. Claim yours from the Account button — it is free.';
    if (Math.max(o.char.level || 1, o.alv || 1) < R.minLevel) return 'Selling on the Market opens when one of your characters reaches level ' + R.minLevel + '.';
    return null;
  }

  async function sell(o, m) {
    const ch = o.char, op = 'sell';
    const g = gate(o);
    if (g) return fail(o, op, 'gate', g);
    if (busy(o)) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    const price = m.price;
    if (!Number.isSafeInteger(price) || price < R.priceMin || price > R.priceMax) return fail(o, op, 'price', 'Ask between ' + R.priceMin + ' and ' + R.priceMax.toLocaleString('en') + ' gold.');
    const it = (ch.bag || []).find(i => i.uid === m.uid);
    if (!it) return fail(o, op, 'item', 'You do not have that item.');
    const no = listRefusal(it);
    if (no) return fail(o, op, no, no === 'keep' ? 'That cannot be sold.' : 'You do not have that item.');
    if (trades.of(ch.id) || trades.offered(ch.id, it.uid)) return fail(o, op, 'trade', 'Finish your trade first.');
    const recent = (listedLog.get(ch.id) || []).filter(t => t > wallNow() - 3600000);
    if (recent.length >= R.perHour) return fail(o, op, 'slow', 'That is a lot of listings in an hour. Try again later.');
    const { fee } = quote(o, it);
    if (fee > (ch.gold || 0)) return fail(o, op, 'gold', 'The listing fee is ' + fee + ' gold, and you have ' + (ch.gold || 0) + '.');
    if ((await store.marketCount(ch.id)) >= R.cap) return fail(o, op, 'cap', 'You already have ' + R.cap + ' things on the Market. Wait for a sale or take one off.');
    if (busy(o) || online.get(ch.id) !== o) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    // re-check after the awaits: the pack may have changed
    if (!(ch.bag || []).some(i => i.uid === it.uid) || fee > (ch.gold || 0)) return fail(o, op, 'item', 'You do not have that item.');
    o.frozen = true; o.saving = true; o.marketBusy = true;
    syncChar(o);
    const next = JSON.parse(JSON.stringify(ch));
    const carried = next.bag.find(i => i.uid === it.uid);
    next.bag = next.bag.filter(i => i.uid !== it.uid);
    next.gold = (next.gold || 0) - fee;
    const seq = o.seq, t = wallNow();
    let r;
    try { r = await store.marketList({ ch: next, fence: o.fence }, { seller: ch.id, sellerName: ch.name, item: carried, price, fee, cap: R.cap, listedAt: t, expiresAt: t + R.lastsMs }); }
    catch (err) { log('market list failed', err && err.message); r = false; }
    o.frozen = false; o.saving = false; o.marketBusy = false;
    if (r && r.err === 'cap') return fail(o, op, 'cap', 'You already have ' + R.cap + ' things on the Market. Wait for a sale or take one off.');
    if (!r || !r.id) { counters.marketFails = (counters.marketFails || 0) + 1; return fail(o, op, 'failed', 'It did not go on the Market. Nothing left your pack.'); }
    ch.bag = (ch.bag || []).filter(i => i.uid !== it.uid);
    ch.gold = (ch.gold || 0) - fee;
    ch.version = next.version;
    o.savedSeq = Math.max(o.savedSeq, seq);
    recent.push(t); listedLog.set(ch.id, recent);
    econ.add('sink', 'marketFee', { gold: fee }, ch.level || 1);
    counters.marketListed = (counters.marketListed || 0) + 1;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [it.uid], gold: ch.gold });
    reply(o, op, { ok: true, id: r.id, fee, price, name: it.name });
    if (o.savePending) { o.savePending = false; saveNow(o); }
    return mine(o);
  }

  async function buy(o, m) {
    const ch = o.char, op = 'buy';
    if (busy(o)) return fail(o, op, 'busy', 'Busy, try again in a moment.');
    if (trades.of(ch.id)) return fail(o, op, 'trade', 'Finish your trade first.');
    const id = m.id;
    if (!Number.isSafeInteger(id)) return fail(o, op, 'gone', 'That is not on the Market any more.', { id });
    const row = await store.marketGet(id);
    if (!row || row.expiresAt <= wallNow()) return fail(o, op, 'gone', 'That is not on the Market any more.', { id });
    if (row.sellerChar === ch.id) return fail(o, op, 'own', 'That is your own listing. Take it off instead.', { id });
    // the price the buyer saw must be the price (a listing never changes, but a stale page or a forged message might)
    if (Number.isSafeInteger(m.price) && m.price !== row.price) return fail(o, op, 'changed', 'The price is not what you saw. Look again.', { id });
    const price = row.price;
    if (price > (ch.gold || 0)) return fail(o, op, 'gold', 'You need ' + price + ' gold.', { id });
    if (busy(o) || online.get(ch.id) !== o) return fail(o, op, 'busy', 'Busy, try again in a moment.', { id });
    if (price > (ch.gold || 0)) return fail(o, op, 'gold', 'You need ' + price + ' gold.', { id });
    o.frozen = true; o.saving = true; o.marketBusy = true;
    syncChar(o);
    const next = JSON.parse(JSON.stringify(ch));
    next.gold = (next.gold || 0) - price;
    const seq = o.seq;
    let r;
    try { r = await store.marketBuy({ ch: next, fence: o.fence }, id, { buyer: ch.id, buyerName: ch.name, price, nowMs: wallNow() }); }
    catch (err) { log('market buy failed', err && err.message); r = false; }
    o.frozen = false; o.saving = false; o.marketBusy = false;
    if (r && r.err) return fail(o, op, r.err, r.err === 'own' ? 'That is your own listing.' : r.err === 'changed' ? 'The price is not what you saw. Look again.' : 'Someone else bought it first. Your gold is still yours.', { id });
    if (!r || !r.ok) { counters.marketFails = (counters.marketFails || 0) + 1; return fail(o, op, 'failed', 'The purchase did not go through. Your gold is still yours.', { id }); }
    ch.gold = (ch.gold || 0) - price;
    ch.version = next.version;
    o.savedSeq = Math.max(o.savedSeq, seq);
    counters.marketSold = (counters.marketSold || 0) + 1;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
    reply(o, op, { ok: true, id, price, name: r.item && r.item.name });
    send({ k: 'mailed', to: ch.id });
    if (r.seller != null) send({ k: 'mailed', to: r.seller });
    if (o.savePending) { o.savePending = false; saveNow(o); }
  }

  async function cancel(o, m) {
    const ch = o.char, op = 'cancel';
    if (!Number.isSafeInteger(m.id)) return fail(o, op, 'gone', 'That listing is not yours or is gone.');
    const r = await store.marketCancel(ch.id, m.id, wallNow());
    if (!r || !r.ok) return fail(o, op, 'gone', 'That listing is not yours or is gone.', { id: m.id });
    counters.marketCancelled = (counters.marketCancelled || 0) + 1;
    reply(o, op, { ok: true, id: m.id, name: r.item && r.item.name });
    send({ k: 'mailed', to: ch.id });
    return mine(o);
  }

  async function op(o, m) {
    if (!MARKET_OPS.includes(m.op)) return 'op';
    if (!store.marketBrowse) return fail(o, m.op, 'failed', 'The Market is closed on this server.');
    switch (m.op) {
      case 'browse': return browse(o, m);
      case 'mine': return mine(o);
      case 'sell': return sell(o, m);
      case 'buy': return buy(o, m);
      case 'cancel': return cancel(o, m);
    }
    return 'op';
  }

  return {
    op: (o, m) => Promise.resolve(op(o, m)).catch(err => { o.marketBusy = false; log('market op failed', err && err.stack); fail(o, m.op, 'failed', 'That did not work.'); }),
    R,
  };
}
