// In-process transport for node tests (PLAN §11.4): every endpoint lives in one hub that delivers
// messages after a sampled latency on VIRTUAL time. Knobs:
//   latency [min, max] ms per message (jitter = the spread; unreliable messages therefore REORDER),
//   drop     chance an UNRELIABLE message is lost (reliable ones never drop and stay in order per pair),
//   seed     the hub's own PRNG (not the sim's).
// Virtual clock: hub.clock = { now, setTimeout, clearTimeout, setInterval, clearInterval }; nothing
// happens until the test calls hub.advance(ms) (or hub.runUntil(fn, maxMs)).

import { listeners, NetError } from './transport.js';

function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function createLoopbackHub({ seed = 1, latency = [0, 0], drop = 0 } = {}) {
  const rand = lcg(seed);
  let now = 0, seq = 0, nextTimer = 1;
  const queue = [];          // { at, seq, fn, timer? }
  const endpoints = new Map();
  const rooms = new Map();   // code -> host id
  const lastAt = new Map();  // `${from}>${to}` -> last reliable delivery time (keeps order)
  const cancelled = new Set();
  const stats = { sent: 0, dropped: 0, delivered: 0 };
  let knobs = { latency, drop };

  function schedule(at, fn, timer = 0) {
    const ev = { at, seq: seq++, fn, timer };
    let i = queue.length;
    while (i > 0 && (queue[i - 1].at > at || (queue[i - 1].at === at && queue[i - 1].seq > ev.seq))) i--;
    queue.splice(i, 0, ev);
  }
  const clock = {
    now: () => now,
    setTimeout(fn, ms) { const id = nextTimer++; schedule(now + Math.max(0, ms), () => { if (!cancelled.has(id)) fn(); }, id); return id; },
    clearTimeout(id) { cancelled.add(id); },
    setInterval(fn, ms) {
      const id = nextTimer++;
      const loop = () => { if (cancelled.has(id)) return; fn(); schedule(now + Math.max(1, ms), loop, id); };
      schedule(now + Math.max(1, ms), loop, id);
      return id;
    },
    clearInterval(id) { cancelled.add(id); },
  };
  function sample() { const [a, b] = knobs.latency; return a + (b - a) * rand(); }

  function deliver(from, to, msg, reliable) {
    stats.sent++;
    if (!reliable && rand() < knobs.drop) { stats.dropped++; return; }
    let at = now + sample();
    if (reliable) { const k = from + '>' + to; at = Math.max(at, lastAt.get(k) || 0); lastAt.set(k, at); }
    const copy = JSON.parse(JSON.stringify(msg));   // what serialisation would do
    schedule(at, () => { const ep = endpoints.get(to); if (ep && ep.open && ep.linked.has(from)) { stats.delivered++; ep.l.emitMessage(from, copy); } });
  }

  function transport(id) {
    id = id || 'ep' + (endpoints.size + 1);
    const l = listeners();
    const ep = { id, l, open: true, linked: new Set(), isHost: false, hostId: null };
    endpoints.set(id, ep);
    const link = (a, b) => { endpoints.get(a).linked.add(b); endpoints.get(b).linked.add(a); };
    const unlink = (a, b) => {
      const A = endpoints.get(a), B = endpoints.get(b);
      if (A) A.linked.delete(b);
      if (B && B.linked.has(a)) { B.linked.delete(a); schedule(now + sample(), () => { if (B.open) B.l.emitPeer({ type: 'leave', id: a }); }); }
    };
    const t = {
      id, get hostId() { return ep.hostId; },
      async host(code) {
        if (rooms.has(code) && endpoints.get(rooms.get(code))?.open) throw new NetError('taken', 'room code taken');
        rooms.set(code, id); ep.isHost = true; ep.hostId = id;
      },
      join(code) {
        return new Promise((resolve, reject) => {
          const hid = rooms.get(code);
          const host = hid && endpoints.get(hid);
          if (!host || !host.open) { schedule(now + sample(), () => reject(new NetError('no-room', 'no such room'))); return; }
          schedule(now + sample(), () => {
            if (!host.open || !ep.open) { reject(new NetError('timeout', 'host gone')); return; }
            link(id, hid); ep.hostId = hid;
            host.l.emitPeer({ type: 'join', id });
            resolve();
          });
        });
      },
      send(to, msg, opts = {}) { if (ep.open && ep.linked.has(to)) deliver(id, to, msg, opts.reliable !== false); },
      broadcast(msg, opts = {}) { for (const to of ep.linked) t.send(to, msg, opts); },
      onMessage: l.onMessage, onPeer: l.onPeer,
      peers: () => [...ep.linked],
      close() {
        if (!ep.open) return;
        for (const o of [...ep.linked]) unlink(id, o);
        ep.open = false;
        if (ep.isHost) for (const [c, h] of rooms) if (h === id) rooms.delete(c);
      },
    };
    return t;
  }

  return {
    clock, stats, transport,
    set(k) { knobs = { ...knobs, ...k }; },
    /** Advance virtual time by ms, running every due message and timer in order. */
    advance(ms) {
      const end = now + ms;
      while (queue.length && queue[0].at <= end) { const ev = queue.shift(); now = Math.max(now, ev.at); ev.fn(); }
      now = end;
    },
    /** Advance in steps until fn() is true (or maxMs passes). Returns whether fn() became true. */
    runUntil(fn, maxMs = 60000, step = 5) {
      const end = now + maxMs;
      while (now < end) { if (fn()) return true; this.advance(step); }
      return fn();
    },
    get now() { return now; },
  };
}
