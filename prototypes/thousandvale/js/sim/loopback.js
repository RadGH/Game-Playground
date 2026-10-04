// Loopback harness (stream A): the whole server sim in-process, reached through WebSocket-like sockets
// (js/net/sockets.js mode 'loopback'). Virtual clock by default, so a test of 10 minutes of play runs in
// a second and is repeatable; pass clock: realClock for wall time.
//
//   const srv = createLoopbackServer({ worldOpts: { store, terrain }, latencyMs: 40 })
//   await srv.ready
//   const sock = srv.connect('/gw')        // or connect({ mode:'loopback', server: srv }) in client.js
//   srv.clock.advance(1000)                // virtual time: ticks, messages, timers
//   srv.crash()                            // like kill -9: sockets drop (1006), no saves, ticker stops
//   srv.stop()                             // graceful: world.shutdown() then stop

import { createWorld } from './world.js';
import { createVirtualClock, startTicker } from '../net/clock.js';
import { OPEN, CLOSED } from '../net/sockets.js';

export function createLoopbackServer({ clock = createVirtualClock(), latencyMs = 0, jitterMs = 0, world = null, worldOpts = {}, seed = 7 } = {}) {
  const w = world || createWorld({ now: clock.now, ...worldOpts });
  let s = seed >>> 0 || 1;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const lat = () => latencyMs + (jitterMs ? rand() * jitterMs : 0);
  const live = new Set();
  let ticker = null, alive = true;
  const stats = { toServer: 0, toClient: 0, bytesToClient: 0 };
  const lastAt = { up: new Map(), down: new Map() };
  const copy = d => (typeof d === 'string' ? d : d instanceof Uint8Array ? d.slice() : new Uint8Array(d).slice());

  const ready = w.init().then(() => { ticker = startTicker(() => w.step(), { ms: 50, clock }); });

  function deliver(dir, id, fn) {
    // keep order per socket and direction even with jitter
    const at = Math.max(clock.now() + lat(), lastAt[dir].get(id) || 0);
    lastAt[dir].set(id, at);
    clock.setTimeout(fn, at - clock.now());
  }

  let nextId = 1;
  function connect(path) {
    const id = nextId++;
    const sock = {
      _state: 0, path,
      get readyState() { return sock._state; },
      onopen: null, onmessage: null, onclose: null,
      send(d) {
        if (sock._state !== OPEN) return;
        const c = copy(d);
        stats.toServer++;
        deliver('up', id, () => { if (handler && alive && sock._state === OPEN) handler.message(c); });
      },
      close() {
        if (sock._state === CLOSED) return;
        sock._state = CLOSED; live.delete(sock);
        deliver('up', id, () => { if (handler) handler.close(); });
        clock.setTimeout(() => sock.onclose && sock.onclose({ code: 1000, reason: 'client' }), 0);
      },
      _drop(code, reason) {       // server side went away
        if (sock._state === CLOSED) return;
        sock._state = CLOSED; live.delete(sock);
        sock.onclose && sock.onclose({ code, reason });
      },
    };
    let handler = null;
    const conn = {
      ip: '127.0.0.1',
      send(d) {
        if (sock._state !== OPEN) return;
        const c = copy(d);
        stats.toClient++; stats.bytesToClient += c.length;
        deliver('down', id, () => { if (sock._state === OPEN) sock.onmessage && sock.onmessage({ data: c }); });
      },
      close(code = 1000, reason = '') { deliver('down', id, () => sock._drop(code, reason)); },
    };
    deliver('down', id, () => {
      if (!alive) { sock._drop(1006, 'refused'); return; }
      sock._state = OPEN; live.add(sock);
      handler = w.accept(path, conn);
      sock.onopen && sock.onopen();
    });
    return sock;
  }

  return {
    world: w, clock, stats, ready, connect,
    get alive() { return alive; },
    /** Like kill -9: no shutdown, no saves; every socket drops with 1006. */
    crash() {
      alive = false;
      if (ticker) ticker.stop();
      for (const sk of [...live]) sk._drop(1006, 'crash');
    },
    async stop() {
      await w.shutdown();
      alive = false;
      if (ticker) ticker.stop();
      for (const sk of [...live]) sk._drop(1001, 'stop');
    },
  };
}
