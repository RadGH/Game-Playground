// THE VOYAGE (Expansion 1 §6, stream V): the only way between the two continents. Pure. Runs data/provinces/ships.json
// (harbours, the Harbourmaster at each, the sailings with their fare and the sea route the client draws) the same way
// js/sim/carts.js runs the ox carts.
//
//   placeHarbours(L)                      once per layout, BEFORE its rooms are made: puts each harbour's Harbourmaster
//                                         (an NPC, role 'harbourmaster') into the town it stands in (or the wilds)
//   const S = createShips({ data, online, journal, econ, setTimeoutTicks, moveTo, questEvent, fighting, dismount,
//                           provinceLoaded, partyOf, tickMs, log, counters, wallNow })
//   S.harbourFor(obj) -> harbour | null   the harbour a Harbourmaster stands for (data.npc.harbour, else the nearest)
//   S.list(o, obj) -> `shipList` body     the sailings from here, with the fare and — when you may not go — why
//   S.op(o, m)                            the `ship` message: {op:'list', id} | {op:'go', id, to, party?} | {op:'skip'}
//   S.onUse(o, obj) -> bool               talking to a Harbourmaster: the sailing list follows the NPC's hello
//   S.place(harbourId) -> { province, x, z }   where a voyage to that harbour puts you ashore
//
// A voyage: talk to the Harbourmaster, pick the far harbour, pay the fare (gold) -> `shipR {ok}` then `shipSail` (the
// route, the time, who is aboard). You are HELD where you stand (js/sim/room.js `e.held`) while the client draws the
// crossing; `voyageSec` later (or sooner, when you skip after `skipAfterSec`) you are moved to the other province at the
// far dock (`moveTo(o, province, dock, 'ship')`). Cut short — you died, you left the game — the fare comes back.
// A party sails together: `go` with `party: true` boards every member standing near the same Harbourmaster who can
// pay their own fare and is not busy; each is told who else is on deck (`crew`).
// A harbour whose province is not loaded in this realm (the far island's content is not ready) is "not sailing yet".
// The first voyage a character makes is written in their logbook (`char.flags.voyages`, shown in the journal) and
// every arrival is a quest event `{ kind: 'voyage', from, to }`.

export const SHIP_DEFAULTS = Object.freeze({ boardM: 6, partyM: 30, voyageSec: 40, skipAfterSec: 5, minLevel: 1, fare: 60 });

/** Pure: the harbourmaster objects a layout should hold. -> [{ obj, harbour }] in WORLD metres. */
export function harbourObjects(data, provinceKey) {
  const out = [];
  for (const h of (data && data.harbours) || []) {
    if (h.province !== provinceKey || !h.master || !Number.isFinite(h.master.x)) continue;
    const m = h.master;
    out.push({ harbour: h, obj: { type: 'npc', name: m.name || 'Harbourmaster', x: m.x, z: m.z, yaw: m.yaw || 0, key: 'harbourmaster:' + h.id, title: m.title || 'Harbourmaster',
      npc: { role: 'harbourmaster', harbour: h.id, titled: true, title: m.title || 'Harbourmaster', says: Array.isArray(m.says) ? m.says.slice() : [] } } });
  }
  return out;
}

/**
 * Put the Harbourmasters of `L.ships` (data/provinces/ships.json, loaded with the province's other files) into the
 * layout: the town room it stands in (within the town's radius) or the wilds. Call before the rooms are made.
 * Safe to run more than once (a Harbourmaster already placed is not added again).
 */
export function placeHarbours(L) {
  if (!L || !L.ships) return 0;
  let n = 0;
  for (const { obj } of harbourObjects(L.ships, L.key)) {
    const all = [...(L.objects || []), ...((L.townObjects || []).flat())];
    if (all.some(o => o && o.key === obj.key)) continue;
    const ti = (L.towns || []).findIndex(t => Math.hypot(obj.x - t.x, obj.z - t.z) < (t.r || 40) - 2);
    if (ti >= 0 && L.townObjects && L.townObjects[ti]) L.townObjects[ti].push(obj);
    else (L.objects ||= []).push(obj);
    n++;
  }
  return n;
}

export function createShips({ data = null, online, journal = () => {}, econ = null, setTimeoutTicks, moveTo, questEvent = () => {}, fighting = () => false, dismount = () => {},
  provinceLoaded = () => true, partyOf = () => null, tickMs = 50, log = () => {}, counters = {}, wallNow = () => Date.now() }) {
  const D = data || {};
  const R = { ...SHIP_DEFAULTS, ...(D.rules || {}) };
  const harbours = new Map((D.harbours || []).map(h => [h.id, h]));
  const sailings = new Map();          // from -> [sailing]
  for (const s of D.sailings || []) { if (!harbours.has(s.from) || !harbours.has(s.to)) continue; if (!sailings.has(s.from)) sailings.set(s.from, []); sailings.get(s.from).push(s); }
  const fill = (str, tok) => String(str || '').replace(/\{(\w+)\}/g, (m, k) => (tok[k] != null ? String(tok[k]) : m));
  const refuse = (k, def, tok = {}) => fill((R.refuse && R.refuse[k]) || def, tok);
  const fareOf = s => (Number.isFinite(s.gold) ? s.gold : R.fare);
  const msOf = s => Math.round((Number.isFinite(s.sec) ? s.sec : R.voyageSec) * 1000);
  const minLevelOf = (s, to) => Math.max(R.minLevel || 0, s.minLevel || 0, to.minLevel || 0);

  /** Where a voyage to harbour `id` ends: its dock (on the quay), in that harbour's province. */
  function place(id) {
    const h = harbours.get(id);
    if (!h) return null;
    const p = h.dock || h.master;
    return p && Number.isFinite(p.x) ? { province: h.province, x: p.x, z: p.z } : null;
  }
  function harbourFor(obj) {
    const d = (obj && obj.data) || {};
    if (d.npc && d.npc.harbour) return harbours.get(d.npc.harbour) || null;
    if (d.npc && d.npc.role === 'harbourmaster') {          // a Harbourmaster with no harbour named: the nearest one's
      let best = null, bd = 60;
      for (const h of harbours.values()) { const p = h.master || h.dock; if (!p) continue; const dd = Math.hypot(p.x - obj.x, p.z - obj.z); if (dd < bd) { bd = dd; best = h; } }
      return best;
    }
    return null;
  }

  /** Why `o` may not take sailing `s` (null = may). Returns { why, msg }. */
  function refusal(o, s, { ignoreGold = false } = {}) {
    const ch = o.char, to = harbours.get(s.to);
    if (!to) return { why: 'harbour', msg: 'No ship sails there.' };
    if (!provinceLoaded(to.province)) return { why: 'closed', msg: refuse('closed', 'The ship to {town} is not sailing yet. Come back another day.', { town: to.name }) };
    const need = minLevelOf(s, to);
    if (need && (ch.level || 1) < need) return { why: 'level', msg: refuse('level', 'The Harbourmaster will not take anyone under level {level} to {town}.', { level: need, town: to.name }) };
    const fare = fareOf(s);
    if (!ignoreGold && (ch.gold || 0) < fare) return { why: 'gold', fare, msg: refuse('gold', 'The passage to {town} is {fare} gold.', { fare, town: to.name }) };
    return null;
  }
  function rows(o, from) {
    return (sailings.get(from.id) || []).map(s => {
      const to = harbours.get(s.to), fare = fareOf(s);
      const row = { id: to.id, name: to.name, province: to.province, land: to.land || null, fare, s: Math.round(msOf(s) / 1000), ...(to.band ? { band: to.band } : {}), ...(s.ship ? { ship: s.ship } : {}) };
      const no = refusal(o, s);
      if (no) Object.assign(row, { locked: true, why: no.why, msg: no.msg });
      return row;
    });
  }
  const logOf = ch => (ch.flags && ch.flags.voyages) || null;
  function list(o, obj) {
    const from = harbourFor(obj);
    if (!from) return null;
    const says = Array.isArray(R.says) && R.says.length ? R.says[((obj.id | 0) + (o.char.id | 0)) % R.says.length] : undefined;
    return { t: 'shipList', id: obj.id, from: from.id, name: from.name, master: obj.name, says, service: D.service || null, sailings: rows(o, from), gold: o.char.gold || 0, log: logOf(o.char) };
  }

  function busy(o) { return !!(o.voyage || o.cartRide || o.travelling || o.relocating); }

  /** Board one rider: pay, hold, tell the client. Returns the voyage record. */
  function board(o, s, from, to, crew, startedAt) {
    const s2 = o.conn, e = o.entity, ch = o.char, fare = fareOf(s), ms = msOf(s);
    ch.gold -= fare;
    journal(o, 'gold', { d: -fare });
    if (econ) econ.add('sink', 'shipFare', { gold: fare }, ch.level || 1);
    if (s2) s2.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
    o.dirty = true;
    dismount(o, 'ship');
    e.held = 'ship';
    counters.voyages = (counters.voyages || 0) + 1;
    const voyage = o.voyage = { from: from.id, to: to.id, fare, ms, at: startedAt, entity: e, slot: crew.indexOf(e.id) };
    if (s2) s2.sendJSON({ t: 'shipSail', from: { id: from.id, name: from.name, province: from.province }, to: { id: to.id, name: to.name, province: to.province },
      ship: s.ship || (D.service && D.service.ship) || null, ms, skipMs: Math.round(R.skipAfterSec * 1000), fare, path: s.path || null, crew, berth: { from: from.berth || null, to: to.berth || null }, volcano: D.volcano || null });
    setTimeoutTicks(() => finish(o, voyage, 'arrive'), Math.max(1, Math.round(ms / tickMs)));
    return voyage;
  }

  /** The end of a voyage (its time is up, or it was skipped): ashore at the far dock — or, cut short, the fare back. */
  function finish(o, voyage, how) {
    if (o.voyage !== voyage) return false;
    o.voyage = null;
    if (voyage.entity.held === 'ship') voyage.entity.held = null;
    const ch = o.char, to = harbours.get(voyage.to), from = harbours.get(voyage.from);
    const here = online.get(ch.id) === o && o.conn && !o.entity.dead && !o.relocating;
    const at = place(voyage.to);
    if (!here || !at || !provinceLoaded(at.province)) {
      ch.gold = (ch.gold || 0) + voyage.fare; journal(o, 'gold', { d: voyage.fare });
      if (econ) econ.add('faucet', 'shipRefund', { gold: voyage.fare }, ch.level || 1);
      o.dirty = true;
      if (o.conn) { o.conn.sendJSON({ t: 'shipR', op: 'arrive', ok: false, to: voyage.to, why: 'interrupted', msg: 'The voyage was called off. Your fare came back.' }); o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold }); }
      counters.voyageRefunds = (counters.voyageRefunds || 0) + 1;
      return false;
    }
    // the logbook: the first crossing is a journal entry of its own
    const prev = logOf(ch) || { n: 0 };
    const entry = { from: from.name, to: to.name, at: wallNow() };
    const book = { n: (prev.n || 0) + 1, first: prev.first || entry, last: entry };
    const firstTime = !prev.first;
    ch.flags = { ...(ch.flags || {}), voyages: book };
    journal(o, 'set', { k: 'flags', v: ch.flags });
    o.dirty = true;
    // slot: party members step ashore a pace apart, not on top of each other
    const k = Math.max(0, voyage.slot | 0), off = k ? { x: Math.cos(k * 2.1) * 1.4 * Math.ceil(k / 2), z: Math.sin(k * 2.1) * 1.4 * Math.ceil(k / 2) } : { x: 0, z: 0 };
    const spot = { x: at.x + off.x, z: at.z + off.z };
    // said BEFORE the move: a crossing to another process closes this socket
    o.conn.sendJSON({ t: 'shipR', op: 'arrive', ok: true, to: to.id, name: to.name, province: to.province, skipped: how === 'skip' || undefined, first: firstTime || undefined, log: book });
    if (firstTime) o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'Journal', text: `Journal: your first voyage — ${from.name} to ${to.name}, across the open sea.` });
    try { moveTo(o, at.province, spot, 'ship'); } catch (err) { log('ship arrive', err && err.stack); }
    questEvent(o, { kind: 'voyage', from: from.id, to: to.id, x: spot.x, z: spot.z, first: firstTime });
    return true;
  }

  function go(o, m, obj) {
    const s = o.conn, e = o.entity, ch = o.char;
    const reply = x => { if (s) s.sendJSON({ t: 'shipR', op: 'go', to: m.to || null, ...x }); };
    const from = harbourFor(obj);
    if (!from) return reply({ ok: false, why: 'harbour', msg: 'There is no harbour here.' });
    if (Math.hypot(obj.x - e.x, obj.z - e.z) > R.boardM + 0.5) return reply({ ok: false, why: 'far', msg: 'Walk over to the Harbourmaster first.' });
    if (e.dead) return reply({ ok: false, why: 'dead', msg: 'You are dead.' });
    if (busy(o)) return reply({ ok: false, why: 'busy', msg: 'You are already on your way.' });
    if (fighting(o, e)) return reply({ ok: false, why: 'fight', msg: refuse('combat', 'Not while you are in a fight.') });
    if (m.to === from.id) return reply({ ok: false, why: 'same', msg: refuse('same', 'You are standing in {town}.', { town: from.name }) });
    const sail = (sailings.get(from.id) || []).find(x => x.to === m.to), to = sail && harbours.get(sail.to);
    if (!sail || !to) return reply({ ok: false, why: 'harbour', msg: 'No ship sails there from here.' });
    const no = refusal(o, sail);
    if (no) return reply({ ok: false, ...no });
    // who sails: you, and (party: true) every party member close by who can go
    const riders = [o], left = [];
    const p = m.party ? partyOf(ch.id) : null;
    if (p && Array.isArray(p.members)) for (const cid of p.members) {
      if (cid === ch.id) continue;
      const mo = online.get(cid);
      if (!mo || !mo.conn || mo.room !== o.room) continue;
      if (Math.hypot(mo.entity.x - obj.x, mo.entity.z - obj.z) > R.partyM) continue;
      const why = mo.entity.dead ? { why: 'dead' } : busy(mo) ? { why: 'busy' } : fighting(mo, mo.entity) ? { why: 'fight' } : refusal(mo, sail);
      if (why) { left.push({ name: mo.char.name, why: why.why }); continue; }
      riders.push(mo);
    }
    const crew = riders.map(r => r.entity.id), t0 = wallNow();
    reply({ ok: true, name: to.name, fare: fareOf(sail), ms: msOf(sail), crew: riders.map(r => r.char.name), ...(left.length ? { left } : {}) });
    for (const r of riders) {
      board(r, sail, from, to, crew, t0);
      if (r !== o && r.conn) r.conn.sendJSON({ t: 'shipR', op: 'go', ok: true, to: to.id, name: to.name, fare: fareOf(sail), ms: msOf(sail), with: ch.name });
    }
    return true;
  }

  /** Skip the rest of the crossing (the client's button, after `skipAfterSec`). */
  function skip(o) {
    const v = o.voyage;
    const reply = x => { if (o.conn) o.conn.sendJSON({ t: 'shipR', op: 'skip', ...x }); };
    if (!v) return reply({ ok: false, why: 'none', msg: 'You are not at sea.' });
    if (wallNow() - v.at < R.skipAfterSec * 1000 - 50) return reply({ ok: false, why: 'early', msg: 'The ship has only just cast off.' });
    finish(o, v, 'skip');
    return true;
  }

  function op(o, m, findObj) {
    const s = o.conn, e = o.entity;
    if (m.op === 'skip') return skip(o);
    const near = findObj(m.id);
    if (!near || near.removed || !harbourFor(near)) return s.sendJSON({ t: 'shipR', op: m.op, ok: false, why: 'harbour', msg: 'There is no harbour here.' });
    if (m.op === 'go') return go(o, m, near);
    if (m.op !== 'list') return s.sendJSON({ t: 'shipR', op: m.op, ok: false, why: 'op', msg: 'Unknown.' });
    if (Math.hypot(near.x - e.x, near.z - e.z) > R.boardM + 0.5) return s.sendJSON({ t: 'shipR', op: 'list', ok: false, why: 'far', msg: 'Walk over to the Harbourmaster first.' });
    return s.sendJSON(list(o, near));
  }

  /** `use` on a Harbourmaster: answered as an NPC by the caller; the sailing list follows one tick later. Never swallows the use. */
  function onUse(o, obj) {
    if (!harbourFor(obj)) return false;
    setTimeoutTicks(() => { if (o.conn && online.get(o.char.id) === o && !obj.removed) { const l = list(o, obj); if (l) o.conn.sendJSON(l); } }, 1);
    return false;
  }

  return { harbours, sailings, R, harbourFor, list, go, skip, op, onUse, place, finish, refusal, fareOf, msOf };
}
