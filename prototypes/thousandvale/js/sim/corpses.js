// LOOT ON THE CORPSE (stream A, play-test 2: Q3 + Q4). Pure — no DOM, no Node APIs.
//
// "Enemy loot stays on the corpse until looted, like other MMOs." A kill's items AND gold no longer jump into the bag:
// the room hands them here (room.award -> hooks.holdKill) and they wait on the dead monster's body, each player's share
// PERSONAL (only they see the sparkle and only they can take it). The body is kept past its normal despawn while
// anything is left on it (room.js asks keepBody), up to CORPSE_MS after the kill.
//
// PARTY ROLLS (Q4): in a party, an item at or above the party's threshold (`lootMin`, default 'rare', the leader can
// lower it to 'magic' or raise it to 'legendary') is not anybody's share — it goes to a Need / Greed / Skip roll among
// the members in the same room within ROLL_R metres. ROLL_MS to answer (silence = skip). The highest Need roll wins,
// else the highest Greed; the winner gets it in the bag. If everyone skips it stays on the corpse, FREE for anyone.
//
//   const C = createCorpses({ now, newUid, rng, partyOf, online, grant, log, counters, bagMax })
//   C.hold(room, killerEntity, monsterEntity, { gold, items }) -> true when held (the room then adds nothing)
//   C.partyDrop(room, memberEntities, items, monster, partyId)  C's one-drop-per-party hook (host.partyLoot)
//   C.keepBody(entity, room) -> ms to keep the body (0 = let it go)
//   C.op(o, msg)            the `loot` message: open | take | all | close | roll
//   C.tick()                1 Hz: time out rolls, forget bodies that are gone
//   C.leftRoom(o)           a player left a room: their open window closes

import { LOOT_OPS, ROLL_CHOICES } from '../net/protocol.js';
import { locksForRoll, normalizeThreshold, rollWinner } from '../rules/loot-rules.js';   // stream C's ladder: one ranking for server, client and tests

export const CORPSE_MS = 5 * 60000;     // a body with loot on it lasts this long after the kill
export const LOOT_RANGE = 6;            // metres from the body to open / take
export const ROLL_MS = 30000;           // Need / Greed / Skip: time to answer
export const ROLL_R = 60;               // party members this close to the body (same room) are in the roll
export const DEFAULT_LOOT_MIN = 'rare';

export function createCorpses({ now, newUid, rng = Math.random, partyOf, online, grant, log = () => {}, counters = {}, bagMax = 120 }) {
  const bodies = new Map();       // `${room.id}:${entity.id}` -> body
  const rolls = new Map();        // roll id -> roll
  let rollN = 0;
  const keyOf = (room, e) => room.id + ':' + e.id;
  const tell = (charId, msg) => { const o = online.get(charId); if (o && o.conn) o.conn.sendJSON(msg); };
  const brief = it => ({ name: it.name, rarity: it.rarity || 'normal', uid: it.uid });

  function body(room, m) {
    const k = keyOf(room, m);
    let b = bodies.get(k);
    if (!b || b.e !== m) {
      b = { key: k, room, e: m, name: m.name, shares: new Map(), free: [], rolls: new Set(), until: now() + CORPSE_MS, watchers: new Set(), freeTold: new Set(), pile: [], pileFor: new Set() };
      bodies.set(k, b);
    }
    return b;
  }
  const shareOf = (b, c) => { let s = b.shares.get(c); if (!s) { s = { items: [], gold: 0 }; b.shares.set(c, s); } return s; };
  const shareEmpty = s => !s || (!s.items.length && !s.gold);
  const hasAny = b => b.free.length > 0 || b.pile.length > 0 || b.rolls.size > 0 || [...b.shares.values()].some(s => !shareEmpty(s));

  /** A kill's reward for `killer` (a player entity) from monster `m`: kept on the body. */
  function hold(room, killer, m, { gold = 0, items = [] }) {
    if (!killer || !killer.char || !m || m.kind !== 'monster') return false;
    const c = killer.char.id;
    const o = online.get(c);
    if (!o || o.entity !== killer) return false;
    items = (items || []).filter(it => it && typeof it === 'object');
    if (!gold && !items.length) return false;
    const b = body(room, m);
    const share = shareOf(b, c);
    share.gold += Math.max(0, Math.round(gold));
    const p = partyOf(c);
    const min = normalizeThreshold((p && p.lootMin) || DEFAULT_LOOT_MIN);
    for (const raw of items) {
      const it = JSON.parse(JSON.stringify(raw));
      if (it.uid) it.ruid = it.uid;
      it.uid = newUid();
      const voters = p && p.members && p.members.length > 1 && locksForRoll(it, min) ? votersFor(room, m, p) : null;
      if (voters && voters.length > 1) startRoll(b, it, voters);
      else share.items.push(it);
    }
    if (!shareEmpty(share)) tell(c, { t: 'lootable', id: m.id, on: true });
    counters.corpseHolds = (counters.corpseHolds || 0) + 1;
    return true;
  }
  /**
   * Stream C's ONE DROP PER CORPSE PER PARTY (host.partyLoot): the party that tagged a kill gets a single roll of loot
   * (C rolls it once, at the members' average magic find). Items under the party's line go to the PARTY PILE (any
   * member may take them — C's splitLoot `free`); items at/above it go to Need / Greed / Skip.
   */
  function partyDrop(room, members, items, m, partyId) {
    const chars = members.map(e => e && e.char && e.char.id).filter(c => c != null && online.get(c));
    if (!m || !chars.length) return false;
    const p = partyOf(chars[0]) || { id: partyId, members: chars, lootMin: DEFAULT_LOOT_MIN };
    const min = normalizeThreshold(p.lootMin || DEFAULT_LOOT_MIN);
    const b = body(room, m);
    const voters = votersFor(room, m, { members: chars });
    for (const raw of items || []) {
      if (!raw || typeof raw !== 'object') continue;
      const it = JSON.parse(JSON.stringify(raw));
      if (it.uid) it.ruid = it.uid;
      it.uid = newUid();
      if (locksForRoll(it, min) && voters.length > 1) startRoll(b, it, voters);
      else b.pile.push(it);
    }
    for (const c of chars) b.pileFor.add(c);
    if (b.pile.length) for (const c of chars) tell(c, { t: 'lootable', id: m.id, on: true });
    counters.partyDrops = (counters.partyDrops || 0) + 1;
    return true;
  }
  function votersFor(room, m, p) {
    const out = [];
    for (const c of p.members) {
      const o = online.get(c);
      if (o && o.conn && o.room === room && o.entity && Math.hypot(o.entity.x - m.x, o.entity.z - m.z) <= ROLL_R) out.push(c);
    }
    return out;
  }
  function startRoll(b, item, voters) {
    const r = { id: ++rollN, body: b, item, voters, choices: new Map(), until: now() + ROLL_MS };
    rolls.set(r.id, r); b.rolls.add(r.id);
    const members = voters.map(c => ({ char: c, name: (online.get(c) || {}).char ? online.get(c).char.name : '?' }));
    for (const c of voters) tell(c, { t: 'lootRoll', roll: r.id, corpse: b.e.id, item, ms: ROLL_MS, members });
    counters.lootRolls = (counters.lootRolls || 0) + 1;
    return r;
  }
  function resolve(r) {
    if (!rolls.has(r.id)) return;
    rolls.delete(r.id); r.body.rolls.delete(r.id);
    const out = r.voters.map(c => {
      const choice = r.choices.get(c) || 'skip';
      const o = online.get(c);
      const n = choice === 'skip' ? 0 : 1 + Math.floor(rng() * 100);
      return { char: c, name: o ? o.char.name : '?', choice, n, o };
    });
    // C's rollWinner (need beats greed, highest number inside it) over the players who can still receive it
    const able = out.filter(x => x.o && x.o.conn && x.o.room === r.body.room && x.o.char.bag && x.o.char.bag.length < bagMax);
    const best = rollWinner(able.map(x => ({ id: x.char, choice: x.choice, n: x.n })));
    const win = best ? able.find(x => x.char === best.id) : null;
    if (win) grant(win.o, { items: [r.item], gold: 0, reason: 'roll', from: r.body.e });
    else { r.body.free.push(r.item); freeNote(r.body); }
    const msg = { t: 'lootRolled', roll: r.id, corpse: r.body.e.id, item: { name: r.item.name, rarity: r.item.rarity || 'normal' }, rolls: out.map(({ char, name, choice, n }) => ({ char, name, choice, n })), winner: win ? { char: win.char, name: win.name } : null };
    for (const c of r.voters) tell(c, msg);
    refreshWatchers(r.body);
  }
  /** Something everyone skipped lies free: tell the players near the body. */
  function freeNote(b) {
    for (const o of online.values()) if (o.conn && o.room === b.room && o.entity && Math.hypot(o.entity.x - b.e.x, o.entity.z - b.e.z) <= 40) { o.conn.sendJSON({ t: 'lootable', id: b.e.id, on: true, free: true }); b.freeTold.add(o.char.id); }
  }

  function view(b, c) {
    const s = b.shares.get(c) || { items: [], gold: 0 };
    const pile = b.pileFor.has(c) ? b.pile.map(it => ({ ...it, shared: true })) : [];
    const v = { t: 'lootWin', id: b.e.id, name: b.name, items: [...s.items, ...pile], gold: s.gold };
    if (b.free.length) v.free = b.free;
    return v;
  }
  function refreshWatchers(b) {
    for (const c of [...b.watchers]) {
      const o = online.get(c);
      if (!o || !o.conn || o.room !== b.room) { b.watchers.delete(c); continue; }
      if (!lootableFor(c, b)) { o.conn.sendJSON({ t: 'lootWin', id: b.e.id, closed: true }); b.watchers.delete(c); }
      else o.conn.sendJSON(view(b, c));
    }
  }
  function lootableFor(c, b) { return !shareEmpty(b.shares.get(c)) || b.free.length > 0 || (b.pile.length > 0 && b.pileFor.has(c)); }
  /** After a take: refresh this player's window and sparkle, and everyone else's open window. */
  function after(o, b) {
    const c = o.char.id;
    if (!lootableFor(c, b)) { o.conn.sendJSON({ t: 'lootWin', id: b.e.id, closed: true }); o.conn.sendJSON({ t: 'lootable', id: b.e.id, on: false }); b.watchers.delete(c); }
    if (!b.pile.length && b.pileFor.size) { for (const x of b.pileFor) if (x !== c && !lootableFor(x, b)) tell(x, { t: 'lootable', id: b.e.id, on: false }); }
    if (!b.free.length && b.freeTold.size) { for (const x of b.freeTold) if (shareEmpty(b.shares.get(x))) tell(x, { t: 'lootable', id: b.e.id, on: false }); b.freeTold.clear(); }
    refreshWatchers(b);
    if (!hasAny(b)) forget(b);
  }

  function forget(b, gone = false) {
    if (bodies.get(b.key) !== b) return;
    bodies.delete(b.key);
    for (const rid of b.rolls) { const r = rolls.get(rid); if (r) resolveGone(r); }
    const told = new Set([...b.shares.keys(), ...b.freeTold, ...b.pileFor]);
    for (const c of told) tell(c, { t: 'lootable', id: b.e.id, on: false });
    for (const c of b.watchers) tell(c, { t: 'lootWin', id: b.e.id, closed: true });
  }
  function resolveGone(r) { rolls.delete(r.id); }

  function keepBody(e, room) {
    if (!e || e.kind !== 'monster') return 0;
    const b = bodies.get(keyOf(room, e));
    if (!b || b.e !== e) return 0;
    if (!hasAny(b)) { forget(b); return 0; }
    const left = b.until - now();
    if (left <= 0) { forget(b, true); return 0; }
    return Math.min(left, 10000);
  }

  function reach(o, id) {
    const b = bodies.get(keyOf(o.room, { id }));
    if (!b || b.e.removed) return { why: 'gone', msg: 'There is nothing left on it.' };
    const e = o.entity;
    if (Math.hypot(b.e.x - e.x, b.e.z - e.z) > LOOT_RANGE + 0.5) return { why: 'far', msg: 'Walk over to it first.' };
    return { b };
  }
  /** Move one item (or the gold) from a share / the free pile to the bag. Returns 'bagFull' | null. */
  function takeOne(o, b, uid) {
    const c = o.char.id, s = b.shares.get(c);
    if (uid === 'gold') { if (!s || !s.gold) return 'item'; const g = s.gold; s.gold = 0; grant(o, { items: [], gold: g, reason: 'kill', from: b.e }); return null; }
    let list = s && s.items, i = list ? list.findIndex(x => x.uid === uid) : -1;
    if (i < 0 && b.pileFor.has(c)) { list = b.pile; i = list.findIndex(x => x.uid === uid); }
    if (i < 0) { list = b.free; i = list.findIndex(x => x.uid === uid); }
    if (i < 0) return 'item';
    if ((o.char.bag || []).length >= bagMax) return 'bagFull';
    const [it] = list.splice(i, 1);
    grant(o, { items: [it], gold: 0, reason: 'kill', from: b.e });
    return null;
  }

  function op(o, m) {
    const s = o.conn;
    if (!LOOT_OPS.includes(m.op)) return 'op';
    const R = (x) => s.sendJSON({ t: 'lootR', op: m.op, ...x });
    if (m.op === 'roll') {
      const r = rolls.get(m.roll);
      if (!r || !r.voters.includes(o.char.id)) return R({ ok: false, why: 'roll', msg: 'That roll is over.' });
      if (!ROLL_CHOICES.includes(m.choice)) return 'choice';
      r.choices.set(o.char.id, m.choice);
      R({ ok: true, roll: r.id, choice: m.choice });
      if (r.choices.size >= r.voters.length) resolve(r);
      return null;
    }
    if (m.id == null) return 'id';
    if (m.op === 'close') { const b = bodies.get(keyOf(o.room, { id: m.id })); if (b) b.watchers.delete(o.char.id); return null; }
    if (o.entity.dead) return R({ ok: false, why: 'dead', msg: 'You are dead.' });
    const q = reach(o, m.id);
    if (q.why) return R({ ok: false, why: q.why, msg: q.msg });
    const b = q.b;
    if (!lootableFor(o.char.id, b)) return R({ ok: false, why: 'gone', msg: 'There is nothing on it for you.' });
    if (o.frozen) return R({ ok: false, why: 'busy', msg: 'Busy, try again in a moment.' });
    if (m.op === 'open') { b.watchers.add(o.char.id); s.sendJSON(view(b, o.char.id)); return null; }
    if (m.op === 'take') {
      const why = takeOne(o, b, m.gold ? 'gold' : (m.uid || ''));
      if (why) return R({ ok: false, why, msg: why === 'bagFull' ? 'Your bag is full.' : 'That is not there any more.' });
      b.watchers.add(o.char.id);
      after(o, b);
      return null;
    }
    // all: the gold, then every item that fits
    const c = o.char.id, sh = b.shares.get(c);
    let full = false;
    if (sh && sh.gold) takeOne(o, b, 'gold');
    for (const it of [...(sh ? sh.items : []), ...(b.pileFor.has(c) ? b.pile : []), ...b.free]) { if (takeOne(o, b, it.uid) === 'bagFull') { full = true; break; } }
    b.watchers.add(c);
    after(o, b);
    if (full) R({ ok: false, why: 'bagFull', msg: 'Your bag is full.' });
    return null;
  }

  function tick() {
    const t = now();
    for (const r of [...rolls.values()]) if (t >= r.until) resolve(r);
    for (const b of [...bodies.values()]) if (b.e.removed || t >= b.until + 60000) forget(b, true);
  }
  function leftRoom(o) { for (const b of bodies.values()) b.watchers.delete(o.char.id); }

  return { hold, partyDrop, keepBody, op, tick, leftRoom, bodies, rolls, view, _resolve: id => { const r = rolls.get(id); if (r) resolve(r); } };
}
