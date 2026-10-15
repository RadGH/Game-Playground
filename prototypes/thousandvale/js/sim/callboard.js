// THE CALLBOARD (stream A, PLAN §0 / §5.6 / §6.3 / §6.5) — the in-world group finder, part of the gateway. Pure.
// "The Callboard" is the board in every town where you put your name down for a dungeon; the UI says
// "Callboard". It opens at level 8 (the unlock ladder).
//
//   join     {dungeon: '<province>:<door>' | 'any', role: 'tank'|'healer'|'dps'}. A party is queued by its
//            leader, whole (every member online); the leader's role is its own, the rest fill whatever is open.
//            'any' = every dungeon whose level band holds you.
//   a group  1 tank + 1 healer + 3 damage, everyone able to do the same dungeon, first come first served.
//   pop      everybody gets `callboard {state:'pop'}` and 30 s to accept. All accept: one party is made (the
//            queued party, joined by the rest), and every member is sent INTO the dungeon together (the province
//            process makes the party's instance; another province = a relocation that lands inside it).
//            A decline or a timeout drops the decliner; the others go back in line keeping their place.
//   backfill a queue that has waited `backfillMs` (5 min) pops with whoever fits and FOLLOWERS fill the empty
//            seats (PLAN §6.3: normal dungeons only; the province calls `rules.backfill(entity, n)` — stream C).
//
//   const B = createCallboard({ parties, presence, gwByChar, partyChanged, sendTo, procOf, now, log, opts })
//   B.addDungeons(list) ; B.op(s, m) ; B.step() ; B.drop(charId) ; B.partyGone(partyId) ; B.status()

export const CALLBOARD = Object.freeze({ minLevel: 8, popMs: 30000, backfillMs: 5 * 60000, size: 5, slots: { tank: 1, healer: 1, dps: 3 }, bandSlack: 2 });
export const ROLES = Object.freeze(['tank', 'healer', 'dps']);
export const CALLBOARD_OPS = Object.freeze(['join', 'leave', 'accept', 'decline', 'list']);

export function createCallboard({ parties, presence, gwByChar, partyChanged = () => {}, sendTo = () => {}, procOf = () => undefined, now, wallNow = () => Date.now(), log = () => {}, opts = {} }) {
  const R = { ...CALLBOARD, ...opts, slots: { ...CALLBOARD.slots, ...(opts.slots || {}) } };
  const dungeons = new Map();       // key -> { key, province, door, name, level, band: [lo, hi] }
  const queue = [];                 // entries { id, chars, roles: Map(char -> role|'any'), party, dungeon, at }
  const pops = new Map();           // pop id -> { id, entries, dungeon, members, ready: Set, at, backfill }
  let nextId = 1, lastMatch = 0;
  const counters = { pops: 0, formed: 0, declined: 0, backfilled: 0 };

  const tell = (c, msg) => { const g = gwByChar.get(c); if (g) g.sendJSON({ t: 'callboard', ...msg }); };
  const levelOf = c => (presence.get(c) || {}).level || 1;
  // Expansion 1 §6: the board never sends anyone across the sea — a dungeon on another island is not offered
  const sameSea = (d, c) => { const k = (presence.get(c) || {}).continent; return !d.continent || !k || d.continent === k; };
  const fits = (d, lv) => lv >= d.band[0] - R.bandSlack && lv <= d.band[1] + R.bandSlack;
  const entryOf = c => queue.find(e => e.chars.includes(c)) || null;
  const popOf = c => { for (const p of pops.values()) if (p.members.includes(c)) return p; return null; };
  const dView = d => ({ key: d.key, name: d.name, level: d.level, band: d.band, province: d.province });

  function addDungeons(list) { for (const d of list || []) if (d && d.key) dungeons.set(d.key, { ...d, band: d.band || [Math.max(1, (d.level || 3) - 2), (d.level || 3) + 3] }); }
  /** The dungeons an entry may do. */
  function choices(e) {
    const all = e.dungeon === 'any' ? [...dungeons.values()] : [dungeons.get(e.dungeon)].filter(Boolean);
    return all.filter(d => e.chars.every(c => fits(d, levelOf(c)) && sameSea(d, c)));
  }

  function list(s) {
    const lv = levelOf(s.charId);
    const counts = {};
    for (const e of queue) for (const d of choices(e)) { const k = counts[d.key] ||= { tank: 0, healer: 0, dps: 0, any: 0 }; for (const r of e.roles.values()) k[r] = (k[r] || 0) + 1; }
    const e = entryOf(s.charId);
    tell(s.charId, { state: 'list', minLevel: R.minLevel, dungeons: [...dungeons.values()].filter(d => sameSea(d, s.charId)).map(d => ({ ...dView(d), fits: fits(d, lv), waiting: counts[d.key] || null })), queued: e ? { dungeon: e.dungeon, since: e.since, waitedMs: Math.round(now() - e.at), role: e.roles.get(s.charId) } : null });
  }

  function op(s, m) {
    const me = s.charId;
    if (!me || !presence.get(me)) return s.err('state', 'Enter the world first.');
    if (!CALLBOARD_OPS.includes(m.op)) return 'op';
    switch (m.op) {
      case 'list': return list(s);
      case 'join': {
        if (entryOf(me) || popOf(me)) return s.err('callboard', 'You are already on the Callboard.');
        const p = parties.of(me);
        if (p && p.leader !== me) return s.err('callboard', 'Your party leader puts the party on the Callboard.');
        const chars = p ? p.members.slice() : [me];
        if (p && p.members.length >= R.size) return s.err('callboard', 'Your party is already full.');
        if (chars.some(c => !presence.get(c)?.online)) return s.err('callboard', 'Everyone in the party must be online.');
        if (chars.some(c => levelOf(c) < R.minLevel)) return s.err('callboard', 'The Callboard opens at level ' + R.minLevel + '.');
        if (chars.some(c => entryOf(c) || popOf(c))) return s.err('callboard', 'Someone in your party is already on the Callboard.');
        const role = ROLES.includes(m.role) ? m.role : 'dps';
        const dungeon = m.dungeon && m.dungeon !== 'any' ? String(m.dungeon) : 'any';
        const e = { id: nextId++, chars, roles: new Map(chars.map(c => [c, c === me ? role : 'any'])), party: p ? p.id : null, dungeon, at: now(), since: wallNow() };
        if (dungeon !== 'any' && !dungeons.has(dungeon)) return s.err('callboard', 'No such dungeon.');
        if (!choices(e).length) return s.err('callboard', 'No dungeon on the board fits your level' + (p ? 's' : '') + ' yet.');
        queue.push(e);
        for (const c of chars) tell(c, { state: 'queued', dungeon, since: e.since, waitedMs: Math.round(now() - e.at), role: e.roles.get(c), with: chars.length });
        lastMatch = 0;
        return;
      }
      case 'leave': {
        const e = entryOf(me);
        if (!e) return s.err('callboard', 'You are not on the Callboard.');
        unqueue(e, 'left');
        return;
      }
      case 'accept': case 'decline': {
        const p = popOf(me);
        if (!p || (m.id != null && p.id !== m.id)) return s.err('callboard', 'That call has passed.');
        if (m.op === 'accept') { p.ready.add(me); for (const c of p.members) tell(c, { state: 'ready', id: p.id, ready: [...p.ready] }); if (p.ready.size === p.members.length) form(p); return; }
        return breakPop(p, [me], 'declined');
      }
    }
    return 'op';
  }
  function unqueue(e, why) {
    const i = queue.indexOf(e); if (i >= 0) queue.splice(i, 1);
    for (const c of e.chars) tell(c, { state: 'left', why });
  }

  /** Try to make one group for dungeon d from the queue (in order). Returns entries or null. */
  function groupFor(d, allowShort) {
    const need = { ...R.slots };
    let open = R.size;
    const picked = [];
    const assign = e => {
      // fixed roles first, then 'any' into whatever is open
      const want = { ...need };
      for (const r of e.roles.values()) if (r !== 'any') { if (want[r] <= 0) return false; want[r]--; }
      let flex = [...e.roles.values()].filter(r => r === 'any').length;
      const free = Object.values(want).reduce((a, b) => a + b, 0);
      if (flex > free || e.chars.length > open) return false;
      for (const r of e.roles.values()) if (r !== 'any') need[r]--;
      for (const k of ROLES) { while (flex > 0 && need[k] > 0) { need[k]--; flex--; } }
      open -= e.chars.length;
      return true;
    };
    for (const e of queue) {
      if (!choices(e).includes(d)) continue;
      if (e.party && picked.some(x => x.party)) continue;           // one queued party per group (it becomes THE party)
      if (assign(e)) picked.push(e);
      if (!open) break;
    }
    if (!picked.length) return null;
    if (!open) return { entries: picked, backfill: 0 };
    if (allowShort) return { entries: picked, backfill: open };
    return null;
  }

  function match() {
    const t = now();
    // full groups first, oldest entry first
    for (const e of [...queue]) {
      if (!queue.includes(e)) continue;
      for (const d of choices(e)) {
        const g = groupFor(d, false);
        if (g && g.entries.includes(e)) { pop(g, d); break; }
      }
    }
    // backfill the ones that waited long enough
    for (const e of [...queue]) {
      if (!queue.includes(e) || t - e.at < R.backfillMs) continue;
      const d = choices(e)[0];
      if (!d) continue;
      const g = groupFor(d, true);
      if (g && g.entries.includes(e)) pop(g, d);
    }
  }
  function pop(g, d) {
    for (const e of g.entries) { const i = queue.indexOf(e); if (i >= 0) queue.splice(i, 1); }
    const roles = {}; for (const e of g.entries) for (const [c, r] of e.roles) roles[c] = r;
    const p = { id: nextId++, entries: g.entries, dungeon: d, members: g.entries.flatMap(e => e.chars), ready: new Set(), at: now(), backfill: g.backfill, roles };
    pops.set(p.id, p);
    counters.pops++;
    for (const c of p.members) tell(c, { state: 'pop', id: p.id, dungeon: dView(d), ms: R.popMs, members: p.members.map(x => ({ char: x, name: presence.get(x)?.name || '?', level: levelOf(x), role: roles[x] })), backfill: g.backfill });
  }
  function breakPop(p, out, why) {
    pops.delete(p.id);
    counters.declined++;
    for (const c of out) tell(c, { state: 'left', why });
    // everyone else goes back in line, keeping their place
    for (const e of p.entries) {
      if (e.chars.some(c => out.includes(c))) { for (const c of e.chars) if (!out.includes(c)) tell(c, { state: 'left', why: 'partner' }); continue; }
      queue.push(e);
      for (const c of e.chars) tell(c, { state: 'queued', dungeon: e.dungeon, since: e.since, waitedMs: Math.round(now() - e.at), role: e.roles.get(c), with: e.chars.length, again: true });
    }
    queue.sort((a, b) => a.at - b.at);
  }
  function form(p) {
    pops.delete(p.id);
    // the party: the queued party if there was one, else a new one led by the first in line
    const base = p.entries.find(e => e.party);
    let party = base ? parties.get(base.party) : null;
    const changed = [];
    if (!party) {
      const lead = p.members[0];
      const old = parties.of(lead);
      if (old) { parties.leave(lead); changed.push(old); }
      const r = parties.create(lead); party = r.party;
    }
    for (const c of p.members) {
      if (party.members.includes(c)) continue;
      const old = parties.of(c);
      if (old && old !== party) { parties.leave(c); changed.push(old); }
      const r = parties.join(c, party.code);
      if (!r.ok) log('callboard: could not seat', { char: c, why: r.why });
    }
    changed.push(party);
    partyChanged(changed);
    counters.formed++;
    if (p.backfill) counters.backfilled++;
    const d = p.dungeon;
    for (const c of p.members) {
      tell(c, { state: 'formed', id: p.id, dungeon: dView(d), party: party.id, backfill: p.backfill });
      const proc = procOf(c);
      if (proc !== undefined) sendTo(proc, { k: 'callboard', char: c, province: d.province, door: d.door, party: party.id, members: [...party.members], backfill: p.backfill, lead: party.leader, roles: p.roles });
    }
  }

  function step() {
    const t = now();
    for (const p of [...pops.values()]) if (t - p.at > R.popMs) breakPop(p, p.members.filter(c => !p.ready.has(c)), 'timeout');
    if (t - lastMatch >= 1000) { lastMatch = t; if (queue.length) match(); }
  }
  function drop(c) {
    const e = entryOf(c); if (e) unqueue(e, 'offline');
    const p = popOf(c); if (p) breakPop(p, [c], 'offline');
  }
  function partyGone(partyId) { for (const e of [...queue]) if (e.party === partyId) unqueue(e, 'party'); }

  return { addDungeons, op, step, drop, partyGone, dungeons, queue, pops, counters, status: () => ({ dungeons: dungeons.size, queued: queue.reduce((a, e) => a + e.chars.length, 0), pops: pops.size, ...counters }) };
}
