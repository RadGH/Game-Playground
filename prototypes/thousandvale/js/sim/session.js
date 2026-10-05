// Socket sessions shared by the gateway and the province processes (stream A). Pure.
//   const kit = createSessionKit({ now, log, counters })
//   const s = kit.session(kind, conn, onClose)     kind 'gw' | 'p'
//   kit.frame(s, data, dispatch)                    parse + validate + rate-limit, then dispatch(s, msg)
//   kit.bad(s, why)                                 count a bad message (20 in 10 s kicks)

import { CODES, parseFrame, createBuckets } from '../net/protocol.js';

export const BAD_LIMIT = 20, BAD_WINDOW_MS = 10000;
export const FLOOD_LIMIT = 300;      // over-rate messages are dropped quietly; this many in BAD_WINDOW_MS is a flood

export function createSessionKit({ now, log = () => {}, counters }) {
  const sessions = new Set();
  function session(kind, conn, onClose) {
    const s = {
      kind, conn, state: 'hello', account: null, buckets: createBuckets(now), badAt: [], closed: false,
      ip: conn.ip || null, charId: null, client: null,
      sendJSON(o) { s.send(JSON.stringify(o)); },
      send(d) {
        if (s.closed) return;
        counters.bytesOut += d.length;
        try { conn.send(d); } catch { /* socket gone; close() will follow */ }
      },
      kick(code) { if (s.closed) return; counters.kicks++; s.sendJSON({ t: 'kick', code, msg: CODES[code] || code }); s.closeSoon(code); },
      closeSoon(reason) { if (s.closed) return; try { conn.close(4000, String(reason)); } catch { /* ignore */ } s.handleClose(); },
      handleClose() { if (s.closed) return; s.closed = true; sessions.delete(s); onClose(s); },
      err(code, msg) { s.sendJSON({ t: 'err', code, msg: msg || CODES[code] || code }); },
    };
    sessions.add(s);
    return s;
  }
  function bad(s, why) {
    counters.bad++;
    const t = now();
    s.badAt.push(t);
    while (s.badAt.length && s.badAt[0] < t - BAD_WINDOW_MS) s.badAt.shift();
    if (s.badAt.length >= BAD_LIMIT) s.kick('abuse');
    return why;
  }
  function frame(s, data, dispatch) {
    counters.msgsIn++;
    counters.bytesIn += typeof data === 'string' ? data.length : (data.byteLength || 0);
    const r = parseFrame(data, s.kind);
    if (r.bad) return bad(s, r.bad);
    const m = r.msg;
    if (!s.buckets.take(m.t)) {           // mashing a key is not abuse: drop it; only a flood gets you kicked
      counters.rateDrops = (counters.rateDrops || 0) + 1;
      const t = now();
      s.flood ||= [];
      s.flood.push(t);
      while (s.flood.length && s.flood[0] < t - BAD_WINDOW_MS) s.flood.shift();
      if (s.flood.length >= FLOOD_LIMIT) s.kick('abuse');
      return 'rate';
    }
    if (s.state === 'hello' && m.t !== 'hello') return bad(s, 'order');
    try { return dispatch(s, m); } catch (err) {
      log('handler error', m.t, err && err.stack);
      return bad(s, 'error');
    }
  }
  return { sessions, session, bad, frame };
}

/**
 * The bus between the gateway and the province processes (stage 1: in one JS context; stage 2: the
 * server's IPC channel to child processes, same messages). Delivery is async, in order.
 *   const [a, b] = createLocalBus(); a.send(msg); b.on(msg => …)
 */
export function createLocalBus() {
  const make = () => ({ handlers: [], peer: null });
  const A = make(), B = make();
  A.peer = B; B.peer = A;
  const end = me => ({
    send(msg) { const copy = JSON.parse(JSON.stringify(msg)); queueMicrotask(() => { for (const h of me.peer.handlers) h(copy); }); },
    on(fn) { me.handlers.push(fn); },
  });
  return [end(A), end(B)];
}
