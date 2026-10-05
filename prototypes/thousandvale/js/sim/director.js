// The realm EVENT DIRECTOR (stream A, PLAN §5.2), part of the gateway. Pure.
// One big event at a time (a world boss, a town under attack, a warband siege): announced realm-wide
// `announceMs` ahead (10 min in production), sized to the players online in its level band, with FREE
// waystone travel to it while it runs (the province processes do the travel: `travel {to:'event'}`).
//
//   const d = createDirector({ now, wallNow, events, online, broadcast, procOf, sendTo, ... })
//   d.step() ; d.onState(m) ; d.status()
//
// events = [{ id, name, province, x, z, r, encounter, body, level, band:[lo,hi], durationMs?, kind? }]
// (stream E's realm events: data/provinces/*.json `realmEvents`, or the zone event sites as a fallback).
// Messages to clients (gateway socket): realm {kind:'eventSoon'|'eventStart'|'eventEnd', ev, at?, won?}
// Bus to province processes: event {op:'live', ev} (all processes: travel target) / {op:'start', ev}
// (the hosting one: spawn it) / {op:'stop', id}.

export const DIRECTOR = Object.freeze({ everyMs: 45 * 60000, announceMs: 10 * 60000, durationMs: 20 * 60000, firstMs: 2 * 60000 });

/** Boss health and add count for `n` players in band: never weaker than one party's worth. */
export function eventScale(n) {
  const players = Math.max(1, n | 0);
  return { players, hp: Math.max(1, 1 + 0.55 * (players - 1)), adds: Math.min(12, Math.floor(players / 8)) };
}

export function createDirector({ now, wallNow = now, log = () => {}, events = null, online, broadcast, procOf, sendTo, procList = null, everyMs = DIRECTOR.everyMs, announceMs = DIRECTOR.announceMs, firstMs = DIRECTOR.firstMs }) {
  const list = (events || []).slice();
  let cur = null, next = now() + firstMs, n = 0;
  // every province process learns the live event (any of them may send a player to it)
  const allProcs = () => { if (procList) return procList(); const s = new Set(); for (const e of list) { const p = procOf(e.province); if (p !== undefined) s.add(p); } return s; };

  function pick() {
    if (!list.length) return null;
    // the event whose band holds the most online players; ties rotate
    const on = online();
    let best = null, bestN = -1;
    list.forEach((e, i) => {
      const [lo, hi] = e.band || [1, 50];
      const k = on.filter(p => (p.level || 1) >= lo - 2 && (p.level || 1) <= hi + 2).length * 100 + ((i + n) % list.length === 0 ? 1 : 0);
      if (k > bestN) { bestN = k; best = e; }
    });
    return best;
  }

  return {
    step() {
      const t = now();
      if (!cur) {
        if (t < next) return;
        const e = pick();
        if (!e || procOf(e.province) === undefined) { next = t + everyMs; return; }
        n++;
        cur = { ev: { ...e, uid: e.id + ':' + n }, state: 'soon', startAt: t + announceMs, endAt: t + announceMs + (e.durationMs || DIRECTOR.durationMs) };
        broadcast({ t: 'realm', kind: 'eventSoon', ev: view(cur.ev), at: wallNow() + announceMs });
        return;
      }
      if (cur.state === 'soon' && t >= cur.startAt) {
        const on = online();
        const [lo, hi] = cur.ev.band || [1, 50];
        cur.ev.scale = eventScale(on.filter(p => (p.level || 1) >= lo - 2 && (p.level || 1) <= hi + 2).length);
        cur.state = 'live';
        sendTo(procOf(cur.ev.province), { k: 'event', op: 'start', ev: cur.ev });
        for (const p of allProcs()) sendTo(p, { k: 'event', op: 'live', ev: cur.ev });
        broadcast({ t: 'realm', kind: 'eventStart', ev: view(cur.ev) });
        return;
      }
      if (cur.state === 'live' && t >= cur.endAt) end(false, 'time');
    },
    onState(m) {
      if (!cur || m.uid !== cur.ev.uid) return;
      if (m.state === 'won' || m.state === 'lost') end(m.state === 'won', m.state);
      else cur.live = m;
    },
    status() { return cur ? { state: cur.state, ev: view(cur.ev), scale: cur.ev.scale || null, startsIn: Math.max(0, Math.round((cur.startAt - now()) / 1000)), live: cur.live || null } : { state: 'idle', nextIn: Math.max(0, Math.round((next - now()) / 1000)), events: list.length }; },
    /** Tests/admin: start the next event now (skips the wait and the announcement delay). */
    force(id = null, { announce = 0 } = {}) {
      const e = id ? list.find(x => x.id === id) : pick();
      if (!e) return false;
      if (cur) end(false, 'replaced');
      n++;
      cur = { ev: { ...e, uid: e.id + ':' + n }, state: 'soon', startAt: now() + announce, endAt: now() + announce + (e.durationMs || DIRECTOR.durationMs) };
      broadcast({ t: 'realm', kind: 'eventSoon', ev: view(cur.ev), at: wallNow() + announce });
      return true;
    },
    get current() { return cur; },
    addEvents(evs) { for (const e of evs) if (!list.some(x => x.id === e.id)) list.push(e); },
  };

  function end(won, why) {
    const ev = cur.ev;
    for (const p of allProcs()) sendTo(p, { k: 'event', op: 'stop', uid: ev.uid });
    broadcast({ t: 'realm', kind: 'eventEnd', ev: view(ev), won: !!won, why });
    log('event ended', ev.uid, why);
    cur = null; next = now() + everyMs;
  }
  function view(e) { return { id: e.id, uid: e.uid, name: e.name, province: e.province, x: e.x, z: e.z, r: e.r || 50, level: e.level, kind: e.kind || 'boss' }; }
}
