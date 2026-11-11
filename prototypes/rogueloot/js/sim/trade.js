// Trading (M18, ruling 5: "trading anywhere"): two heroes in the same game, wherever each one stands. Pure; lives on
// the realm (both heroes may be in different areas). The sim is the referee: what is offered must still be in the
// bag when both say yes, and must fit in the other bag; gold too. Any change to an offer clears both "yes" marks.
//   ops: ask { to } -> the other sees an ask; accept { from }; offer { items: [uid], gold }; ok; cancel
import { findSpot } from '../rules/bag.js';
import { isCurrency, stackInto } from '../rules/crafting.js';

export function createTrades(realm) {
  const trades = new Map();                        // id -> { id, a, b, offer: { [pid]: { items, gold } }, ok: { [pid]: bool } }
  const asks = new Map();                          // target pid -> from pid
  const hero = pid => realm.worldOf(pid)?.players.get(pid);
  const tell = (pid, e) => { const w = realm.worldOf(pid); if (w) w.events.push({ ...e, to: pid }); };
  const of = pid => [...trades.values()].find(t => t.a === pid || t.b === pid);
  const other = (t, pid) => t.a === pid ? t.b : t.a;
  function view(t, pid) {
    const me = hero(pid), them = hero(other(t, pid));
    const items = (p, side) => (t.offer[side].items || []).map(uid => (p?.char.bag || []).find(i => i.uid === uid)).filter(Boolean);
    return { k: 'trade', id: t.id, with: other(t, pid), name: them?.name, mine: { items: items(me, pid), gold: t.offer[pid].gold }, theirs: { items: items(them, other(t, pid)), gold: t.offer[other(t, pid)].gold }, ok: t.ok[pid], theyOk: t.ok[other(t, pid)] };
  }
  const push = t => { tell(t.a, view(t, t.a)); tell(t.b, view(t, t.b)); };
  function act(pid, a) {
    const me = hero(pid); if (!me) return { err: 'Not here.' };
    switch (a.op) {
      case 'ask': { const to = String(a.to || ''); if (to === pid || !hero(to)) return { err: 'Nobody to trade with.' }; if (of(to) || of(pid)) return { err: 'Already trading.' }; asks.set(to, pid); tell(to, { k: 'trade-ask', from: pid, name: me.name }); return { ok: true }; }
      case 'accept': { const from = String(a.from || ''); if (asks.get(pid) !== from || !hero(from)) return { err: 'That offer is gone.' }; asks.delete(pid); if (of(from) || of(pid)) return { err: 'Already trading.' };
        const t = { id: 't' + Date.now().toString(36) + pid, a: from, b: pid, offer: { [from]: { items: [], gold: 0 }, [pid]: { items: [], gold: 0 } }, ok: { [from]: false, [pid]: false } }; trades.set(t.id, t); push(t); return { ok: true }; }
      case 'offer': {
        const t = of(pid); if (!t) return { err: 'Not trading.' };
        const bag = me.char.bag || [], items = [...new Set((a.items || []).map(String))].filter(uid => bag.some(i => i.uid === uid)).slice(0, 20);
        const gold = Math.max(0, Math.min(me.char.gold || 0, Math.floor(+a.gold || 0)));
        t.offer[pid] = { items, gold }; t.ok[t.a] = t.ok[t.b] = false; push(t); return { ok: true };
      }
      case 'ok': { const t = of(pid); if (!t) return { err: 'Not trading.' }; t.ok[pid] = true; if (t.ok[t.a] && t.ok[t.b]) return finish(t); push(t); return { ok: true }; }
      case 'cancel': { const t = of(pid); asks.delete(pid); if (!t) return { ok: true }; trades.delete(t.id); tell(t.a, { k: 'trade-end', why: 'cancelled' }); tell(t.b, { k: 'trade-end', why: 'cancelled' }); return { ok: true }; }
    }
    return { err: 'unknown trade step' };
  }
  function finish(t) {
    const A = hero(t.a), B = hero(t.b); trades.delete(t.id);
    const fail = why => { for (const p of [t.a, t.b]) tell(p, { k: 'trade-end', why }); return { err: why }; };
    if (!A || !B) return fail('Your friend left.');
    const D = realm.content.items, C = realm.content.currency;
    const pick = (p, side) => t.offer[side].items.map(uid => (p.char.bag || []).find(i => i.uid === uid));
    const ga = pick(A, t.a), gb = pick(B, t.b);
    if (ga.some(x => !x) || gb.some(x => !x)) return fail('Something offered is no longer in the bag.');
    if ((A.char.gold || 0) < t.offer[t.a].gold || (B.char.gold || 0) < t.offer[t.b].gold) return fail('Not enough gold any more.');
    const place = (bag, items) => { let out = bag; for (const it of items) { const { pos: _, ...clean } = it; if (isCurrency(clean) && C) { const r = stackInto(C, out, clean); out = r.list; if (!r.rest) continue; const p = findSpot(D, out, r.rest); if (!p) return null; out = [...out, { ...r.rest, pos: p }]; continue; } const p = findSpot(D, out, clean); if (!p) return null; out = [...out, { ...clean, pos: p }]; } return out; };
    const bagA = place((A.char.bag || []).filter(i => !t.offer[t.a].items.includes(i.uid)), gb);
    const bagB = place((B.char.bag || []).filter(i => !t.offer[t.b].items.includes(i.uid)), ga);
    if (!bagA || !bagB) return fail('Not enough room in a bag.');
    A.char = { ...A.char, bag: bagA, gold: (A.char.gold || 0) - t.offer[t.a].gold + t.offer[t.b].gold };
    B.char = { ...B.char, bag: bagB, gold: (B.char.gold || 0) - t.offer[t.b].gold + t.offer[t.a].gold };
    realm.worldOf(t.a).charDirty.add(t.a); realm.worldOf(t.b).charDirty.add(t.b);
    for (const p of [t.a, t.b]) tell(p, { k: 'trade-end', why: 'done' });
    return { ok: true };
  }
  const drop = pid => { asks.delete(pid); const t = of(pid); if (t) { trades.delete(t.id); tell(other(t, pid), { k: 'trade-end', why: 'Your friend left.' }); } };
  return { act, drop, of };
}
