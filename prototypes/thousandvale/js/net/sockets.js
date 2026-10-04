// Socket shims (stream A): three ways to reach the server, one WebSocket-like shape, so js/net/client.js
// and the server sim never know which is in use (docs/protocol.md §1).
//
//   const open = socketFactory(mode, opts)     mode: 'ws' | 'worker' | 'loopback'
//   const sock = open('/gw')                   { readyState, onopen, onmessage({data}), onclose({code, reason}), send(d), close() }
//
//   ws:       opts.url = 'ws://host:port' (default: the page's host)
//   worker:   opts.worker = a Worker running js/sim/worker.js (or omitted: one is started)
//   loopback: opts.server = createLoopbackServer(...) (js/sim/loopback.js)

export const OPEN = 1, CLOSED = 3;

export function socketFactory(mode, opts = {}) {
  if (mode === 'ws') return wsFactory(opts);
  if (mode === 'worker') return workerFactory(opts);
  if (mode === 'loopback') {
    if (!opts.server) throw new Error("loopback sockets need opts.server (js/sim/loopback.js)");
    return path => (typeof opts.server === 'function' ? opts.server() : opts.server).connect(path);   // a function lets a test swap in a restarted server
  }
  throw new Error('unknown socket mode ' + mode);
}

function wsFactory({ url } = {}) {
  let base = url;
  if (!base) {
    const loc = globalThis.location;
    base = (loc && loc.protocol === 'https:' ? 'wss://' : 'ws://') + (loc ? loc.host : '127.0.0.1:8491');
  }
  return path => {
    const ws = new WebSocket(base.replace(/\/$/, '') + path);
    ws.binaryType = 'arraybuffer';
    const s = {
      get readyState() { return ws.readyState; },
      onopen: null, onmessage: null, onclose: null,
      send(d) { if (ws.readyState === 1) ws.send(d); },
      close() { try { ws.close(); } catch { /* ignore */ } },
    };
    let closedOnce = false;
    const fireClose = (code, reason) => { if (closedOnce) return; closedOnce = true; s.onclose && s.onclose({ code, reason }); };
    ws.onopen = () => s.onopen && s.onopen();
    ws.onmessage = ev => s.onmessage && s.onmessage({ data: ev.data });
    ws.onclose = ev => fireClose(ev.code, ev.reason);
    // Node 22's WebSocket fires only 'error' (never 'close') when the connection is refused and sits at
    // readyState 0 — report it as a close so client.js retries (found by stream G's kill -9 test).
    ws.onerror = () => { if (ws.readyState !== 1) fireClose(1006, 'error'); };
    return s;
  };
}

let sharedWorker = null;
let nextWorkerSock = 1;    // module-wide: several connections may share one Worker
function workerFactory({ worker, workerUrl } = {}) {
  const w = worker || sharedWorker || (sharedWorker = new Worker(workerUrl || new URL('../sim/worker.js', import.meta.url), { type: 'module' }));
  const socks = new Map();
  w.addEventListener('message', e => {
    const m = e.data;
    if (!m || !m.op) return;
    const s = socks.get(m.id);
    if (!s) return;
    if (m.op === 'open') { s._state = OPEN; s.onopen && s.onopen(); }
    else if (m.op === 'msg') s.onmessage && s.onmessage({ data: m.data });
    else if (m.op === 'close') { s._state = CLOSED; socks.delete(m.id); s.onclose && s.onclose({ code: m.code || 1000, reason: m.reason || '' }); }
  });
  return path => {
    const id = nextWorkerSock++;
    const s = {
      _state: 0,
      get readyState() { return s._state; },
      onopen: null, onmessage: null, onclose: null,
      send(d) { if (s._state === OPEN) w.postMessage({ op: 'msg', id, data: d }); },
      close() {
        if (s._state === CLOSED) return;
        s._state = CLOSED; socks.delete(id);
        w.postMessage({ op: 'close', id });
        const f = s.onclose; if (f) setTimeout(() => f({ code: 1000, reason: 'client' }), 0);
      },
    };
    socks.set(id, s);
    w.postMessage({ op: 'open', id, path });
    return s;
  };
}
