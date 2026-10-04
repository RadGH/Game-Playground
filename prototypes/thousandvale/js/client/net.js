// The connection: one object the rest of the client sends to and listens on, whatever is underneath.
//
//   ws      a WebSocket to the game server (default: same host, path /gw — PLAN §8.1)
//   worker  an in-browser server in a Worker (one tab)            ?offline=1&shared=0
//   shared  an in-browser server in a SharedWorker (all tabs)     ?offline=1  (default offline mode)
//
// Messages are plain JSON objects (protocol.js owns their shapes). The WebSocket reconnects on its own
// with backoff; the HUD shows the status. `latency` (ms) can be added on any mode to feel a real network
// on the LAN (`?lag=120`) — it delays both directions by half each, with a little jitter.

const STATUS = ['connecting', 'open', 'reconnecting', 'closed'];

export function connectionOptionsFromQuery(search = location.search, loc = location) {
  const q = new URLSearchParams(search);
  const offline = q.has('offline') && q.get('offline') !== '0';
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return {
    mode: offline ? (q.get('shared') === '0' || typeof SharedWorker === 'undefined' ? 'worker' : 'shared') : 'ws',
    url: q.get('server') || `${proto}//${loc.host}/gw`,
    workerUrl: q.get('worker') ? new URL(q.get('worker'), loc.href).href : new URL('./dev/standin-worker.js', import.meta.url).href,
    lag: Math.max(0, Math.min(1000, +q.get('lag') || 0)),
  };
}

export function createConnection(opts) {
  const listeners = new Set(), statusListeners = new Set();
  let status = 'connecting', sock = null, port = null, closedByUs = false, retry = 0, retryTimer = 0;
  const stats = { sent: 0, recv: 0, bytesIn: 0, bytesOut: 0, opened: 0 };
  const lagged = fn => (opts.lag ? (...a) => setTimeout(() => fn(...a), opts.lag / 2 + Math.random() * opts.lag * 0.1) : fn);

  function setStatus(s, detail) { if (!STATUS.includes(s)) return; status = s; for (const f of statusListeners) f(s, detail); }
  const deliver = lagged(msg => { stats.recv++; for (const f of listeners) f(msg); });

  function openWs() {
    try { sock = new WebSocket(opts.url); } catch (e) { scheduleRetry(); return; }
    sock.onopen = () => { retry = 0; stats.opened++; setStatus('open'); };
    sock.onmessage = e => {
      if (typeof e.data !== 'string') return;          // binary snapshots arrive at M1; protocol.js will own them
      stats.bytesIn += e.data.length;
      let msg; try { msg = JSON.parse(e.data); } catch { return; }
      deliver(msg);
    };
    sock.onclose = () => { sock = null; if (closedByUs) setStatus('closed'); else scheduleRetry(); };
    sock.onerror = () => {};
  }
  function scheduleRetry() {
    setStatus('reconnecting', { attempt: retry + 1 });
    const wait = Math.min(10000, 500 * 2 ** retry++) * (0.8 + Math.random() * 0.4);
    clearTimeout(retryTimer); retryTimer = setTimeout(openWs, wait);
  }
  function openWorker(shared) {
    try {
      if (shared) { const w = new SharedWorker(opts.workerUrl, { type: 'module', name: 'thousandvale-offline' }); port = w.port; port.start(); w.onerror = e => setStatus('closed', { error: e.message }); }
      else { const w = new Worker(opts.workerUrl, { type: 'module' }); port = w; w.onerror = e => setStatus('closed', { error: e.message }); }
    } catch (e) { setStatus('closed', { error: e.message }); return; }
    port.onmessage = e => deliver(e.data);
    stats.opened++;
    // A worker is "open" as soon as it exists; give the module a tick to load.
    setTimeout(() => setStatus('open'), 0);
  }

  if (opts.mode === 'ws') openWs(); else openWorker(opts.mode === 'shared');

  const rawSend = lagged(msg => {
    if (sock && sock.readyState === 1) { const s = JSON.stringify(msg); stats.bytesOut += s.length; sock.send(s); }
    else if (port) port.postMessage(msg);
  });

  return {
    get status() { return status; },
    get mode() { return opts.mode; },
    stats,
    send(msg) { stats.sent++; rawSend(msg); },
    on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    onStatus(fn) { statusListeners.add(fn); return () => statusListeners.delete(fn); },
    close() {
      closedByUs = true; clearTimeout(retryTimer);
      if (port) { try { port.postMessage({ t: '__close' }); } catch {} if (port.terminate && opts.mode === 'worker') port.terminate(); }
      if (sock) sock.close();
      setStatus('closed');
    },
  };
}
