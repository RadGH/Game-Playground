// The trade window (stream A, PLAN §9.2, M1.5). Pure bookkeeping; the world validates distance and does
// the all-or-nothing commit (store.tradeChars: both blobs in one transaction, versions + fences checked).
//
// Flow: ask -> accept -> both set offers (items by uid + gold) -> both lock -> both confirm -> commit.
// Any offer change unlocks both sides. A character is in at most one trade. Items offered in an open
// trade cannot be destroyed, equipped or offered elsewhere (the world asks `offered(char, uid)`).
//
//   const T = createTrades()
//   T.ask(a, b) ; T.accept(b, id) ; T.offer(c, id, {items, gold}) ; T.lock(c, id) ; T.confirm(c, id)
//   T.cancel(c, why) ; T.of(c) ; T.offered(c, uid)
// Calls return { ok, trade, why?, ready? } (ready = both confirmed: commit now).

export const TRADE_MAX_ITEMS = 12;
export const TRADE_RANGE = 10;          // metres; walking further apart cancels
export const TRADE_OPS = Object.freeze(['ask', 'accept', 'offer', 'lock', 'confirm', 'cancel']);

export function createTrades() {
  const byId = new Map(), byChar = new Map();
  let nextId = 1;
  const side = (t, c) => (t.a.char === c ? t.a : t.b.char === c ? t.b : null);
  const T = {
    byId,
    of: c => byChar.get(c) || null,
    get: id => byId.get(id) || null,
    ask(a, b) {
      if (a === b) return { ok: false, why: 'trade' };
      if (byChar.has(a) || byChar.has(b)) return { ok: false, why: 'tradeBusy' };
      const t = { id: nextId++, state: 'asked', a: blank(a), b: blank(b), committing: false };
      byId.set(t.id, t); byChar.set(a, t); byChar.set(b, t);
      return { ok: true, trade: t };
    },
    accept(c, id) {
      const t = byId.get(id);
      if (!t || t.state !== 'asked' || t.b.char !== c) return { ok: false, why: 'trade' };
      t.state = 'open';
      return { ok: true, trade: t };
    },
    offer(c, id, { items = [], gold = 0 }) {
      const t = byId.get(id), s = t && side(t, c);
      if (!s || t.state !== 'open' || t.committing) return { ok: false, why: 'trade' };
      if (items.length > TRADE_MAX_ITEMS || new Set(items).size !== items.length) return { ok: false, why: 'trade' };
      s.items = [...items]; s.gold = Math.max(0, Math.floor(gold));
      t.a.locked = t.b.locked = false; t.a.confirmed = t.b.confirmed = false;
      return { ok: true, trade: t };
    },
    lock(c, id) {
      const t = byId.get(id), s = t && side(t, c);
      if (!s || t.state !== 'open' || t.committing) return { ok: false, why: 'trade' };
      s.locked = true;
      return { ok: true, trade: t };
    },
    confirm(c, id) {
      const t = byId.get(id), s = t && side(t, c);
      if (!s || t.state !== 'open' || t.committing || !t.a.locked || !t.b.locked) return { ok: false, why: 'trade' };
      s.confirmed = true;
      return { ok: true, trade: t, ready: t.a.confirmed && t.b.confirmed };
    },
    /** End the trade `c` is in (cancel, done, or a failure). */
    end(c) {
      const t = byChar.get(c);
      if (!t) return null;
      byId.delete(t.id); byChar.delete(t.a.char); byChar.delete(t.b.char);
      return t;
    },
    offered(c, uid) { const t = byChar.get(c), s = t && side(t, c); return !!(s && s.items.includes(uid)); },
    side,
  };
  return T;
}
function blank(char) { return { char, items: [], gold: 0, locked: false, confirmed: false }; }
