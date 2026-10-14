// The browser's line to the server: one WebSocket, JSON messages, and it comes back by itself when the line drops
// (a phone that slept, a tunnel hiccup) — it says hello with the saved token and rejoins the room it was in.
import { PROTOCOL } from '../shared/protocol.js';

const TOKEN_KEY = 'tumblefair.token';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

export function connect({ url = null } = {}) {
  const handlers = new Map();
  const net = { status: 'connecting', me: null, room: null, code: null, display: false, ping: 0 };
  let ws = null, tries = 0, pingTimer = null, wanted = true;
  const wsUrl = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const fire = (t, m) => { for (const fn of handlers.get(t) || []) fn(m); };
  net.on = (t, fn) => { if (!handlers.has(t)) handlers.set(t, []); handlers.get(t).push(fn); return net; };
  net.send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function open() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => { tries = 0; net.send({ t: 'hello', v: PROTOCOL, ...(store.get(TOKEN_KEY) ? { token: store.get(TOKEN_KEY) } : {}) }); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        store.set(TOKEN_KEY, m.token); net.me = m; setStatus('online');
        if (net.code) net.send({ t: 'join', code: net.code, ...(net.display ? { display: true } : {}) });    // back after a drop: same room, same seat
      }
      if (m.t === 'me') net.me = { ...net.me, ...m };
      if (m.t === 'wallet') net.me = { ...net.me, coins: m.coins };
      if (m.t === 'room') { net.room = m; net.code = m.code; }
      if (m.t === 'left' || m.t === 'kicked') { net.room = null; net.code = null; }
      if (m.t === 'err' && m.code === 'noroom') { net.room = null; net.code = null; }
      if (m.t === 'pong') net.ping = Math.round(performance.now() - m.at);
      fire(m.t, m);
    };
    ws.onclose = () => { if (!wanted) return; setStatus('reconnecting'); setTimeout(open, [300, 800, 1500, 3000, 5000][Math.min(tries++, 4)]); };
    ws.onerror = () => {};
  }
  function setStatus(s) { if (net.status !== s) { net.status = s; fire('status', s); } }
  pingTimer = setInterval(() => net.send({ t: 'ping', at: Math.round(performance.now()) }), 3000);
  // Come straight back when the phone wakes up or the tab is shown again, rather than waiting out the back-off.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && ws && ws.readyState > 1) { tries = 0; } });
  net.join = (code, display = false) => { net.code = code; net.display = display; net.send({ t: 'join', code, ...(display ? { display: true } : {}) }); };
  net.create = () => net.send({ t: 'create' });
  net.leave = () => { net.code = null; net.room = null; net.send({ t: 'leave' }); };
  net.close = () => { wanted = false; clearInterval(pingTimer); ws?.close(); };
  open();
  return net;
}
