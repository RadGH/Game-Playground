// The browser's line to the server: one WebSocket, JSON messages, and it comes back by itself when the line drops
// (a phone that slept, a tunnel hiccup) — it says hello with the saved token and rejoins the room it was in.
import { PROTOCOL } from '../shared/protocol.js';

const TOKEN_KEY = 'tumblefair.token';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

// Accounts (2026-10-23): `getTicket()` (async, -> one-time games.radgh.com ticket | null) is asked before every hello, so a
// signed-in player who reconnects is still themself; net.signIn(ticket|null) signs in / out without reconnecting.
// The stored token is always the device's GUEST token; an account profile is never named by the browser.
export function connect({ url = null, getTicket = null } = {}) {
  const handlers = new Map();
  const net = { status: 'connecting', me: null, room: null, code: null, display: false, ping: 0, account: null, note: null };
  let ws = null, tries = 0, pingTimer = null, wanted = true;
  const wsUrl = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const fire = (t, m) => { for (const fn of handlers.get(t) || []) fn(m); };
  net.on = (t, fn) => { if (!handlers.has(t)) handlers.set(t, []); handlers.get(t).push(fn); return net; };
  net.send = m => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
  function open() {
    ws = new WebSocket(wsUrl);
    ws.onopen = async () => {
      tries = 0;
      const me = ws;
      let ticket = null;
      if (getTicket) { try { ticket = await Promise.race([getTicket(), new Promise(r => setTimeout(() => r(null), 4000))]); } catch { ticket = null; } }
      if (ws !== me || ws.readyState !== 1) return;
      net.send({ t: 'hello', v: PROTOCOL, ...(store.get(TOKEN_KEY) ? { token: store.get(TOKEN_KEY) } : {}), ...(ticket ? { ticket } : {}) });
    };
    ws.onmessage = e => {
      lastMsg = performance.now();
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') {
        if (m.token) store.set(TOKEN_KEY, m.token);
        net.me = m; net.account = m.account || null; net.note = m.note || null; setStatus('online');
        if (net.code) net.send({ t: 'join', code: net.code, ...(net.display ? { display: true } : {}) });    // back after a drop: same room, same seat
      }
      if (m.t === 'acct') { if (m.token) store.set(TOKEN_KEY, m.token); net.account = m.account || null; net.note = m.note || null; }
      if (m.t === 'me') net.me = { ...net.me, ...m };
      if (m.t === 'wallet') net.me = { ...net.me, coins: m.coins };
      if (m.t === 'room') { net.room = m; net.code = m.code; }
      if (m.t === 'left' || m.t === 'kicked') { net.room = null; net.code = null; }
      if (m.t === 'err' && m.code === 'noroom') { net.room = null; net.code = null; }
      if (m.t === 'pong') net.ping = Math.round(performance.now() - m.at);
      fire(m.t, m);
    };
    ws.onclose = () => { if (!wanted) return; setStatus('reconnecting'); clearTimeout(retry); retry = setTimeout(() => { retry = null; open(); }, [300, 800, 1500, 3000, 5000][Math.min(tries++, 4)]); };
    ws.onerror = () => {};
  }
  function setStatus(s) { if (net.status !== s) { net.status = s; fire('status', s); } }
  // A phone that was locked can come back with a socket that still says "open" but is dead (report #33, iPhone): the
  // server answers a ping every 3 s, so silence for 10 s while the page is showing means reconnect now.
  let lastMsg = performance.now(), retry = null;
  const stale = () => ws && ws.readyState === 1 && performance.now() - lastMsg > 10000;
  pingTimer = setInterval(() => { if (!document.hidden && stale()) { tries = 0; ws.close(); return; } net.send({ t: 'ping', at: Math.round(performance.now()) }); }, 3000);
  // Come straight back when the phone wakes up or the tab is shown again, rather than waiting out the back-off.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !ws) return;
    tries = 0;
    if (ws.readyState > 1 && retry) { clearTimeout(retry); retry = null; open(); }   // closed while asleep: straight back
    else if (ws.readyState === 1 && performance.now() - lastMsg > 4000) { lastMsg = performance.now(); ws.close(); }   // maybe dead: reopen
  });
  net.join = (code, display = false) => { net.code = code; net.display = display; net.send({ t: 'join', code, ...(display ? { display: true } : {}) }); };
  /** Sign in with a ticket, or out with null. The server answers 'acct' then 'me'. */
  net.signIn = ticket => net.send({ t: 'account', ...(ticket ? { ticket } : {}) });
  net.create = () => net.send({ t: 'create' });
  net.leave = () => { net.code = null; net.room = null; net.send({ t: 'leave' }); };
  net.close = () => { wanted = false; clearInterval(pingTimer); ws?.close(); };
  open();
  return net;
}
