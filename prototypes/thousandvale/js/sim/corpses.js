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
//   C.holdFor(room, body, charId, {gold, items}) / C.freeOn(room, body, items) / C.forgetBody / C.hasLoot
//                           play-test 4 S5: any entity can hold loot (a treasure chest is a room object) — same window
//
// Play-test 4:
//   S12 "looting a corpse loots all nearby corpses at once": `open` (and `all`) gather every body within LOOT_NEAR_M of
//       you that holds something for you into ONE window (`lootWin.group`, each item tagged `corpse`); `near:false` keeps
//       the old one-body window. A take finds the item on whichever grouped body holds it. Same shares, same rolls.
//   S23 "corpse shows an indicator when it holds loot, coloured by best rarity": every `lootable {on:true}` carries
//       `best` = the best rarity of what is on it FOR YOU (normal | magic | rare | legendary | unique) and `n` = how many
//       things (gold counts as one); re-sent whenever that changes. Cheap: no item list until you open it.

import { LOOT_OPS, ROLL_CHOICES } from '../net/protocol.js';
import { locksForRoll, normalizeThreshold, rollWinner, lootTier, RARITY_RANK } from '../rules/loot-rules.js';   // stream C's ladder: one ranking for server, client and tests

export const CORPSE_MS = 5 * 60000;     // a body with loot on it lasts this long after the kill
export const LOOT_RANGE = 6;            // metres from the body to open / take
export const ROLL_MS = 30000;           // Need / Greed / Skip: time to answer
export const ROLL_R = 60;               // party members this close to the body (same room) are in the roll
export const DEFAULT_LOOT_MIN = 'rare';
export const LOOT_NEAR_M = 8;           // S12: bodies this close to YOU join the one loot window

export function createCorpses({ now, newUid, rng = Math.random, partyOf, online, grant, log = () => {}, counters = {}, bagMax = 120 }) {
  const capOf = o => (typeof bagMax === 'function' ? bagMax(o) : bagMax);      // W19: a backpack changes it per player
  const bodies = new Map();       // `${room.id}:${entity.id}` -> body
  const windows = new Map();      // S12: char id -> { room, keys: [body keys], main: entity id } (a grouped window)
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

  /** S23: what is on body `b` for char `c` — { n, best } (best = top rarity tier; gold alone = 'normal'). */
  function bestFor(c, b) {
    const s = b.shares.get(c);
    const list = [...(s ? s.items : []), ...(b.pileFor.has(c) ? b.pile : []), ...b.free];
    let best = null, rank = -1;
    for (const it of list) { const t = lootTier(it), r = RARITY_RANK[t] ?? 0; if (r > rank) { rank = r; best = t; } }
    const n = list.length + (s && s.gold ? 1 : 0);
    return { n, best: best || (n ? 'normal' : null) };
  }
  /** The sparkle for char `c` on body `b`, with its colour (S23). */
  function sparkle(c, b, extra = {}) {
    const on = lootableFor(c, b);
    tell(c, on ? { t: 'lootable', id: b.e.id, on: true, ...bestFor(c, b), ...extra } : { t: 'lootable', id: b.e.id, on: false });
  }
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
    if (!shareEmpty(share)) sparkle(c, b);
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
    if (b.pile.length) for (const c of chars) sparkle(c, b);
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
    const able = out.filter(x => x.o && x.o.conn && x.o.room === r.body.room && x.o.char.bag && x.o.char.bag.length < capOf(x.o));
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
    for (const o of online.values()) if (o.conn && o.room === b.room && o.entity && Math.hypot(o.entity.x - b.e.x, o.entity.z - b.e.z) <= 40) { sparkle(o.char.id, b, { free: true }); b.freeTold.add(o.char.id); }
  }

  function view(b, c) {
    const s = b.shares.get(c) || { items: [], gold: 0 };
    const pile = b.pileFor.has(c) ? b.pile.map(it => ({ ...it, shared: true })) : [];
    const v = { t: 'lootWin', id: b.e.id, name: b.name, items: [...s.items, ...pile], gold: s.gold };
    if (b.free.length) v.free = b.free;
    return v;
  }
  /**
   * S12: one window over every body in char `c`'s group: `items` / `free` are all of them, each tagged `corpse` (the body
   * that holds it — send it back as the take's `id`), `gold` the sum, `group` the per-body breakdown. `id`/`name` = the
   * body you clicked (or the first one left). Null when nothing is left for you on any of them.
   */
  function groupView(c) {
    const w = windows.get(c);
    if (!w) return null;
    const list = w.keys.map(k => bodies.get(k)).filter(b => b && !b.e.removed && lootableFor(c, b));
    if (!list.length) return null;
    const main = list.find(b => b.e.id === w.main) || list[0];
    // wrap-up (report #58): the window is now led by THIS body — `sendWin`'s closing word must name the id the client
    // was last sent. It used to name the body first clicked; with that one emptied first the client (which follows the
    // id of the last window it drew) ignored the close, kept the last row on screen, and the next E met a body that was gone.
    w.main = main.e.id;
    const parts = list.map(b => { const v = view(b, c); return { id: b.e.id, name: b.name, items: v.items.map(it => ({ ...it, corpse: b.e.id })), gold: v.gold, free: (v.free || []).map(it => ({ ...it, corpse: b.e.id })) }; });
    const v = { t: 'lootWin', id: main.e.id, name: list.length > 1 ? main.name + ' and ' + (list.length - 1) + ' more' : main.name, items: parts.flatMap(p => p.items), gold: parts.reduce((a, p) => a + (p.gold || 0), 0), group: parts.map(p => ({ id: p.id, name: p.name, n: p.items.length + p.free.length, gold: p.gold })), corpses: parts.map(p => p.id) };
    const free = parts.flatMap(p => p.free);
    if (free.length) v.free = free;
    return v;
  }
  function sendWin(c) {
    const o = online.get(c), w = windows.get(c);
    if (!o || !o.conn || !w) return;
    const v = groupView(c);
    if (!v) { o.conn.sendJSON({ t: 'lootWin', id: w.main, closed: true }); closeWin(c); return; }
    o.conn.sendJSON(v);
  }
  function closeWin(c) {
    const w = windows.get(c);
    if (!w) return;
    windows.delete(c);
    for (const k of w.keys) { const b = bodies.get(k); if (b) b.watchers.delete(c); }
  }
  /** Bodies in `o`'s room within LOOT_NEAR_M of them holding something for them, `first` leading. */
  function nearBodies(o, first) {
    const c = o.char.id, e = o.entity, out = [first];
    // W24 (round 8, report #45): a CONTAINER (an event chest) opens only in its own window. Looting the corpse beside it used to
    // sweep the chest's share into the same "take all", so the chest read "nothing left on it" and packed up unopened.
    if (first.e.kind === 'object') return out;
    for (const b of bodies.values()) {
      if (b === first || b.room !== o.room || b.e.removed || b.e.kind === 'object' || !lootableFor(c, b)) continue;
      if (Math.hypot(b.e.x - e.x, b.e.z - e.z) <= LOOT_NEAR_M) out.push(b);
    }
    return out;
  }
  function refreshWatchers(b) {
    for (const c of [...b.watchers]) {
      const o = online.get(c);
      if (!o || !o.conn || o.room !== b.room) { b.watchers.delete(c); continue; }
      if (windows.has(c) && windows.get(c).keys.includes(b.key)) { sendWin(c); continue; }
      if (!lootableFor(c, b)) { o.conn.sendJSON({ t: 'lootWin', id: b.e.id, closed: true }); b.watchers.delete(c); }
      else o.conn.sendJSON(view(b, c));
    }
  }
  function lootableFor(c, b) { return !shareEmpty(b.shares.get(c)) || b.free.length > 0 || (b.pile.length > 0 && b.pileFor.has(c)); }
  /** After a take: refresh this player's window and sparkle, and everyone else's open window. */
  function after(o, b) {
    const c = o.char.id;
    const grouped = windows.has(c) && windows.get(c).keys.includes(b.key);
    if (!lootableFor(c, b)) { if (!grouped) o.conn.sendJSON({ t: 'lootWin', id: b.e.id, closed: true }); o.conn.sendJSON({ t: 'lootable', id: b.e.id, on: false }); if (!grouped) b.watchers.delete(c); }
    else sparkle(c, b);                                                         // S23: the colour may have dropped
    if (!b.pile.length && b.pileFor.size) { for (const x of b.pileFor) if (x !== c && !lootableFor(x, b)) tell(x, { t: 'lootable', id: b.e.id, on: false }); }
    else if (b.pileFor.size) for (const x of b.pileFor) if (x !== c) sparkle(x, b);
    if (!b.free.length && b.freeTold.size) { for (const x of b.freeTold) if (shareEmpty(b.shares.get(x))) tell(x, { t: 'lootable', id: b.e.id, on: false }); b.freeTold.clear(); }
    refreshWatchers(b);
    if (grouped) sendWin(c);
    if (!hasAny(b)) forget(b);
  }

  function forget(b, gone = false) {
    if (bodies.get(b.key) !== b) return;
    bodies.delete(b.key);
    for (const rid of b.rolls) { const r = rolls.get(rid); if (r) resolveGone(r); }
    const told = new Set([...b.shares.keys(), ...b.freeTold, ...b.pileFor]);
    for (const c of told) tell(c, { t: 'lootable', id: b.e.id, on: false });
    for (const c of b.watchers) { if (windows.has(c) && windows.get(c).keys.includes(b.key)) sendWin(c); else tell(c, { t: 'lootWin', id: b.e.id, closed: true }); }
  }
  function resolveGone(r) { rolls.delete(r.id); }

  function keepBody(e, room) {
    if (!e || (e.kind !== 'monster' && !bodies.has(keyOf(room, e)))) return 0;
    const b = bodies.get(keyOf(room, e));
    if (!b || b.e !== e) return 0;
    if (!hasAny(b)) { forget(b); return 0; }
    const left = b.until - now();
    if (left <= 0) { forget(b, true); return 0; }
    return Math.min(left, 10000);
  }

  function reach(o, id, range = LOOT_RANGE) {
    const b = bodies.get(keyOf(o.room, { id }));
    if (!b || b.e.removed) return { why: 'gone', msg: 'There is nothing left on it.' };
    const e = o.entity;
    if (Math.hypot(b.e.x - e.x, b.e.z - e.z) > range + 0.5) return { why: 'far', msg: 'Walk over to it first.' };
    return { b };
  }
  /** S12: a take's item may be on any body of the open group (an old client sends the clicked body's id). */
  function findInGroup(o, b, uid) {
    const c = o.char.id, w = windows.get(c);
    const has = x => { const s = x.shares.get(c); return (s && s.items.some(i => i.uid === uid)) || (x.pileFor.has(c) && x.pile.some(i => i.uid === uid)) || x.free.some(i => i.uid === uid); };
    // #58: the window's gold is the SUM over its bodies; a gold take names only the leading one — pay from whichever still holds some
    if (uid === 'gold') { const gold = x => (x.shares.get(c)?.gold || 0) > 0; if (gold(b) || !w) return b; for (const k of w.keys) { const x = bodies.get(k); if (x && x.room === o.room && !x.e.removed && gold(x)) return x; } return b; }
    if (has(b) || !w) return b;
    for (const k of w.keys) { const x = bodies.get(k); if (x && x.room === o.room && !x.e.removed && has(x) && Math.hypot(x.e.x - o.entity.x, x.e.z - o.entity.z) <= LOOT_NEAR_M + 1) return x; }
    return b;
  }
  /** Move one item (or the gold) from a share / the free pile to the bag. Returns 'bagFull' | null. */
  function takeOne(o, b, uid) {
    const c = o.char.id, s = b.shares.get(c);
    if (uid === 'gold') { if (!s || !s.gold) return 'item'; const g = s.gold; s.gold = 0; grant(o, { items: [], gold: g, reason: 'kill', from: b.e }); return null; }
    let list = s && s.items, i = list ? list.findIndex(x => x.uid === uid) : -1;
    if (i < 0 && b.pileFor.has(c)) { list = b.pile; i = list.findIndex(x => x.uid === uid); }
    if (i < 0) { list = b.free; i = list.findIndex(x => x.uid === uid); }
    if (i < 0) return 'item';
    if ((o.char.bag || []).length >= capOf(o)) return 'bagFull';
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
    const c = o.char.id;
    if (m.op === 'close') { const b = bodies.get(keyOf(o.room, { id: m.id })); if (b) b.watchers.delete(c); closeWin(c); return null; }
    if (o.entity.dead) return R({ ok: false, why: 'dead', msg: 'You are dead.' });
    const w0 = windows.get(c);
    const inGroup = w0 && w0.room === o.room && w0.keys.includes(keyOf(o.room, { id: m.id }));
    const q = reach(o, m.id, m.op !== 'open' && inGroup ? LOOT_NEAR_M + 1 : LOOT_RANGE);
    if (q.why) return R({ ok: false, why: q.why, msg: q.msg });
    let b = q.b;
    if (!lootableFor(c, b) && !(m.op !== 'open' && inGroup && groupView(c))) return R({ ok: false, why: 'gone', msg: 'There is nothing on it for you.' });
    if (o.frozen) return R({ ok: false, why: 'busy', msg: 'Busy, try again in a moment.' });
    const near = m.near !== false;
    const hadWin = !!w0 && near;
    if (m.op === 'open' || (m.op === 'all' && !inGroup)) {
      // S12: one window over every body near you that holds something for you
      closeWin(c);
      const group = near ? nearBodies(o, b) : [b];
      windows.set(c, { room: o.room, keys: group.map(x => x.key), main: b.e.id });
      for (const x of group) x.watchers.add(c);
      if (m.op === 'open') { s.sendJSON(near ? groupView(c) : view(b, c)); if (!near) windows.delete(c); return null; }
    }
    if (m.op === 'take') {
      const uid = m.gold ? 'gold' : (m.uid || '');
      b = findInGroup(o, b, uid);
      const why = takeOne(o, b, uid);
      if (why) return R({ ok: false, why, msg: why === 'bagFull' ? 'Your bag is full.' : 'That is not there any more.' });
      b.watchers.add(c);
      after(o, b);
      // the gold row is one row for the whole window: one take empties it on every body
      if (uid === 'gold' && inGroup) for (let x = findInGroup(o, b, uid), n = 0; n < 40 && x !== b && (x.shares.get(c)?.gold || 0) > 0; x = findInGroup(o, b, uid), n++) { takeOne(o, x, 'gold'); x.watchers.add(c); after(o, x); }
      if (hadWin && b.e.kind !== 'object') nextNear(o);
      return null;
    }
    // all: the gold, then every item that fits — from every body of the window (S12)
    const w = windows.get(c);
    const list = w ? w.keys.map(k => bodies.get(k)).filter(x => x && x.room === o.room && !x.e.removed) : [b];
    let full = false;
    for (const x of list) {
      const sh = x.shares.get(c);
      if (sh && sh.gold) takeOne(o, x, 'gold');
      for (const it of [...(sh ? sh.items : []), ...(x.pileFor.has(c) ? x.pile : []), ...x.free]) { if (takeOne(o, x, it.uid) === 'bagFull') { full = true; break; } }
      x.watchers.add(c);
      if (full) break;
    }
    for (const x of list) if (bodies.get(x.key) === x) after(o, x);
    if (w) sendWin(c);
    if (full) R({ ok: false, why: 'bagFull', msg: 'Your bag is full.' });
    else if (near && b.e.kind !== 'object') nextNear(o);
    return null;
  }
  /**
   * #58: the window just emptied and closed — if another body within reach holds something for this player (one that fell
   * after the window opened, or lay outside it), the window moves on to THAT body instead of leaving them to press again.
   * Never a container: a chest opens only when it is opened (W24).
   */
  function nextNear(o) {
    const c = o.char.id, e = o.entity;
    if (windows.has(c) || !o.conn || !e) return false;
    let best = null, bd = LOOT_RANGE + 0.5;
    for (const b of bodies.values()) {
      if (b.room !== o.room || b.e.removed || b.e.kind === 'object' || !lootableFor(c, b)) continue;
      const d = Math.hypot(b.e.x - e.x, b.e.z - e.z);
      if (d <= bd) { bd = d; best = b; }
    }
    if (!best) return false;
    const group = nearBodies(o, best);
    windows.set(c, { room: o.room, keys: group.map(x => x.key), main: best.e.id });
    for (const x of group) x.watchers.add(c);
    o.conn.sendJSON(groupView(c));
    return true;
  }

  function tick() {
    const t = now();
    for (const r of [...rolls.values()]) if (t >= r.until) resolve(r);
    for (const b of [...bodies.values()]) if (b.e.removed || t >= b.until + 60000) forget(b, true);
  }
  function leftRoom(o) { for (const b of bodies.values()) b.watchers.delete(o.char.id); windows.delete(o.char.id); }

  // ---- S5 containers: any entity (a treasure chest object) can hold loot, opened with the same window ----
  /** A personal share for `charId` on `bodyEnt` (an entity in `room`; a chest object is fine). */
  function holdFor(room, bodyEnt, charId, { gold = 0, items = [] } = {}) {
    if (!bodyEnt || charId == null) return false;
    items = (items || []).filter(it => it && typeof it === 'object');
    if (!gold && !items.length) return false;
    const b = body(room, bodyEnt);
    const share = shareOf(b, charId);
    share.gold += Math.max(0, Math.round(gold));
    for (const raw of items) { const it = JSON.parse(JSON.stringify(raw)); if (it.uid) it.ruid = it.uid; it.uid = newUid(); share.items.push(it); }
    sparkle(charId, b);
    return true;
  }
  /** Items on `bodyEnt` that anyone may take (told to players within 40 m). */
  function freeOn(room, bodyEnt, items = []) {
    const b = body(room, bodyEnt);
    for (const raw of items || []) { if (!raw || typeof raw !== 'object') continue; const it = JSON.parse(JSON.stringify(raw)); if (it.uid) it.ruid = it.uid; it.uid = newUid(); b.free.push(it); }
    if (b.free.length) freeNote(b);
    return true;
  }
  const hasLoot = (room, e) => { const b = bodies.get(keyOf(room, e)); return !!(b && hasAny(b)); };
  /** W24: is there anything left on this body FOR this character? ; keep a container's body alive until `untilMs` (room ms). */
  const hasLootFor = (room, e, charId) => { const b = bodies.get(keyOf(room, e)); return !!(b && lootableFor(charId, b)); };
  /** W24: lift what is left of one character's personal share off a body (the event posts it to them) -> { gold, items } | null. */
  function takeShare(room, e, charId) {
    const b = bodies.get(keyOf(room, e)); const s = b && b.shares.get(charId);
    if (!s || shareEmpty(s)) return null;
    const out = { gold: s.gold, items: s.items.splice(0) }; s.gold = 0;
    tell(charId, { t: 'lootable', id: b.e.id, on: false });
    if (!hasAny(b)) forget(b);
    return out;
  }
  const holdUntil = (room, e, untilMs) => { const b = bodies.get(keyOf(room, e)); if (b) b.until = Math.max(b.until, untilMs); };
  const forgetBody = (room, e) => { const b = bodies.get(keyOf(room, e)); if (b) forget(b, true); };

  return { hold, partyDrop, keepBody, op, tick, leftRoom, bodies, rolls, view, holdFor, freeOn, hasLoot, hasLootFor, holdUntil, takeShare, forgetBody, bestFor, windows, _resolve: id => { const r = rolls.get(id); if (r) resolve(r); } };
}
