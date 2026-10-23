// The browser's line to the Knockabout server: one WebSocket, JSON text messages plus binary snapshot frames, and it
// comes back by itself when the line drops (a phone that slept, a wifi hiccup) — it says hello with the saved token
// and rejoins the room it was in, and the room gives this device its players back (within ~60 s).
// Modelled on Tumblefair's js/client/net.js.
//
//   const net = connect();                 net.on('room', m => …)  net.on('snap', arrayBuffer => …)  net.off(type, fn)
//   net.create({ public }) / net.join(code) / net.leave() / net.send(msg) / net.close()
//   net.status: 'connecting' | 'online' | 'reconnecting' | 'closed'      net.room: the last 'room' message
//
// `serverAvailable()` reads the page's Server-Timing mark, then asks GET <root>/status once: true only when a Knockabout server answers (GitHub Pages and the
// plain test servers do not), so the title only offers online play where it can work. Never throws.
import { PROTOCOL } from '../net/protocol.js';

// per TAB (sessionStorage): two tabs are two devices, a refresh is the same one
const TOKEN_KEY = 'knockabout.token';
const store = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } } };
const apiRoot = () => (typeof window !== 'undefined' && window.KNOCKABOUT_API) ? String(window.KNOCKABOUT_API).replace(/\/$/, '') + '/' : new URL('../../../../', import.meta.url).href;

let avail = null;
export function serverAvailable() {
  if (avail) return avail;
  avail = (async () => {
    try {
      // a Knockabout server marks the page it serves (Server-Timing, server/static.js); no mark = no server, no request
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      if (!window.KNOCKABOUT_API && nav && Array.isArray(nav.serverTiming) && !nav.serverTiming.some(t => t.name === 'knockabout')) return false;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(apiRoot() + 'status', { cache: 'no-store', signal: ctl.signal }); clearTimeout(timer);
      if (!r.ok) return false;
      const j = await r.json().catch(() => null);
      return j?.server === 'knockabout';
    } catch { return false; }
  })();
  return avail;
}

export function connect({ url = null } = {}) {
  const handlers = new Map();
  const net = { status: 'connecting', room: null, code: null, ping: 0, build: null, bytesIn: 0, since: performance.now() };
  let ws = null, tries = 0, wanted = true;
  const base = new URL(apiRoot());
  const wsUrl = url || `${base.protocol === 'https:' ? 'wss' : 'ws'}://${base.host}${base.pathname.replace(/\/$/, '')}/ws`;
  const fire = (t, m) => { for (const fn of (handlers.get(t) || []).slice()) { try { fn(m); } catch (e) { console.error('[knockabout] net handler', t, e); } } };
  net.on = (t, fn) => { if (!handlers.has(t)) handlers.set(t, []); handlers.get(t).push(fn); return net; };
  net.off = (t, fn) => { const L = handlers.get(t); if (L) { const i = L.indexOf(fn); if (i >= 0) L.splice(i, 1); } return net; };
  net.send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function open() {
    try { ws = new WebSocket(wsUrl); } catch { setStatus('closed'); return; }
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => { tries = 0; net.send({ t: 'hello', v: PROTOCOL, ...(store.get(TOKEN_KEY) ? { token: store.get(TOKEN_KEY) } : {}) }); };
    ws.onmessage = e => {
      if (typeof e.data !== 'string') { net.bytesIn += e.data.byteLength; fire('snap', e.data); return; }
      net.bytesIn += e.data.length;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        store.set(TOKEN_KEY, m.token); net.build = m.build; setStatus('online');
        if (net.code) net.send({ t: 'join', code: net.code });         // back after a drop: same room, same players
      }
      if (m.t === 'room') { net.room = m; net.code = m.code; }
      if (m.t === 'left') { net.room = null; net.code = null; }
      if (m.t === 'err' && m.code === 'noroom') { net.room = null; net.code = null; }
      if (m.t === 'pong') net.ping = Math.round(performance.now() - m.at);
      fire(m.t, m);
    };
    ws.onclose = () => { if (!wanted) return; setStatus('reconnecting'); setTimeout(() => wanted && open(), [300, 800, 1500, 3000, 5000][Math.min(tries++, 4)]); };
    ws.onerror = () => {};
  }
  function setStatus(s) { if (net.status !== s) { net.status = s; fire('status', s); } }
  const pingTimer = setInterval(() => net.send({ t: 'ping', at: Math.round(performance.now()) }), 3000);
  const wake = () => { if (!document.hidden && ws && ws.readyState > 1) tries = 0; };
  document.addEventListener('visibilitychange', wake);
  net.create = ({ public: pub = false } = {}) => net.send({ t: 'create', public: !!pub });
  net.join = code => { net.code = code; net.send({ t: 'join', code }); };
  net.leave = () => { net.code = null; net.room = null; net.send({ t: 'leave' }); };
  net.close = () => { wanted = false; clearInterval(pingTimer); document.removeEventListener('visibilitychange', wake); try { ws?.close(); } catch { /* closed */ } setStatus('closed'); };
  /** Bytes a second received since the line opened (for the debug readout and tests). */
  net.rate = () => Math.round(net.bytesIn / Math.max(0.001, (performance.now() - net.since) / 1000));
  open();
  return net;
}
