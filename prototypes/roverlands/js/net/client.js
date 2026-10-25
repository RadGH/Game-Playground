// The game's one line to its room — online (a WebSocket to the Roverlands server) or solo (js/net/loopback.js running
// the same referee in this page). docs/PLAN.md "Net contract" is the spec; the game code calls exactly this:
//
//   import { connect } from './js/net/client.js';
//   const net = await connect({ online: true|false, url?, code?, create?: { mode: 'flag'|'sandbox', public, seed, flagId, start? },
//                               spectate?, name, look, ticket?, sites?, vehicles? });
//   net.you  net.room  net.on('room', fn)  net.on('msg', fn)  net.send(msg)  net.close()
//
// net.last (lead, 2026-10-25): the newest `ents`, `flag`, `run`, `room`, the last FULL `state`, every `broken` id so
// far and every pin — so a game that starts listening after connect() resolves can catch up on the join-time messages.
// Extras (docs/PLAN.md "Net contract additions"): net.on('status', s => …) 'online' | 'reconnecting' | 'closed';
// net.on('<type>', fn) for one message type; net.off(type, fn); net.status, net.online, net.code, net.ping (ms),
// net.serverNow() (the room's clock, for the run timer), net.stats().
// `sites` + `vehicles` are only read for solo play (the server builds its own from the seed and data/vehicles.json).
//
// A dropped line comes back by itself (a phone that slept, a wifi hiccup): it says hello with this tab's token and asks
// for the same room, and the room gives the same player back — seat, flag and all — within 90 s while driving and
// 5 minutes in the lobby. The tab also remembers its room, so a refresh can rejoin (lastRoom()).
//
// `serverAvailable()` is true only when a Roverlands server sent this page (GitHub Pages and plain file servers are not
// one), so the title only offers online play where it can work. Never throws.
import { PROTOCOL } from './protocol.js';
import { createLoopback } from './loopback.js';

const TOKEN_KEY = 'roverlands.token', ROOM_KEY = 'roverlands.room';     // per TAB: two tabs are two players, a refresh is the same one
const ss = { get: k => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* private mode */ } } };
export const apiRoot = () => (typeof window !== 'undefined' && window.ROVERLANDS_API) ? String(window.ROVERLANDS_API).replace(/\/$/, '') + '/' : new URL('../../../../', import.meta.url).href;
export const wsUrlFor = (root = apiRoot()) => { const b = new URL(root); return `${b.protocol === 'https:' ? 'wss' : 'ws'}://${b.host}${b.pathname.replace(/\/$/, '')}/ws`; };
/** The room this tab was last in ({ code, spectate }), so a reloaded page can go straight back. */
export const lastRoom = () => { try { return JSON.parse(ss.get(ROOM_KEY) || 'null'); } catch { return null; } };
export const forgetRoom = () => ss.set(ROOM_KEY, null);

let avail = null;
export function serverAvailable() {
  if (avail) return avail;
  avail = (async () => {
    try {
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      if (!window.ROVERLANDS_API && nav && Array.isArray(nav.serverTiming) && !nav.serverTiming.some(t => t.name === 'roverlands')) return false;
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(apiRoot() + 'status', { cache: 'no-store', signal: ctl.signal }); clearTimeout(timer);
      if (!r.ok) return false;
      const j = await r.json().catch(() => null);
      return j?.server === 'roverlands';
    } catch { return false; }
  })();
  return avail;
}
/** "Find a game": the public rooms, or [] when there is no server. */
export async function listRooms() {
  try { const r = await fetch(apiRoot() + 'rooms', { cache: 'no-store' }); if (!r.ok) return []; return (await r.json()).list || []; } catch { return []; }
}

export function connect({ online = true, url = null, code = null, create = null, spectate = false, name = null, look = null, ticket = null, sites = {}, vehicles = {}, socket = null } = {}) {
  const handlers = new Map();
  const net = { you: null, room: null, code: null, status: 'connecting', online: !!online, ping: 0, build: null };
  let ws = null, tries = 0, wanted = true, joined = false, offset = 0, bytesIn = 0, bytesOut = 0, since = Date.now();
  let settle = null, token = ss.get(TOKEN_KEY);
  const ready = new Promise((res, rej) => { settle = { res, rej }; });
  // the newest copy of every "picture of the room" message, so a game that starts listening after joining can catch
  // up (net.last.ents, net.last.flag…; `broken` accumulates; the last FULL state is kept as net.last.state)
  const KEEP = new Set(['ents', 'flag', 'run', 'room']);
  // pins accumulate too: net.last.pins = { pid: [x, z] }
  net.last = { broken: { t: 'broken', objs: [] }, cut: { t: 'cut', cells: [] }, pins: {} };
  const keep = m => { if (KEEP.has(m.t)) net.last[m.t] = m; else if (m.t === 'broken') net.last.broken.objs.push(...(m.objs || [])); else if (m.t === 'cut') { for (const c of m.cells || []) net.last.cut.cells.push(c); } else if (m.t === 'state' && m.full) net.last.state = m; else if (m.t === 'pin') { if (m.p) net.last.pins[m.pid] = m.p; else delete net.last.pins[m.pid]; } };
  const fire = (t, m) => { for (const fn of (handlers.get(t) || []).slice()) { try { fn(m); } catch (e) { console.error('[roverlands] net handler', t, e); } } };
  net.on = (t, fn) => { if (!handlers.has(t)) handlers.set(t, []); handlers.get(t).push(fn); return net; };
  net.off = (t, fn) => { const L = handlers.get(t); if (L) { const i = L.indexOf(fn); if (i >= 0) L.splice(i, 1); } return net; };
  const raw = m => { if (ws && ws.readyState === 1) { const s = JSON.stringify(m); bytesOut += s.length; ws.send(s); return true; } return false; };
  net.send = m => raw(m);
  net.serverNow = () => Date.now() + offset;
  net.stats = () => { const s = Math.max(0.001, (Date.now() - since) / 1000); return { inPerSec: Math.round(bytesIn / s), outPerSec: Math.round(bytesOut / s), ping: net.ping, status: net.status }; };
  function setStatus(s) { if (net.status !== s) { net.status = s; fire('status', s); } }
  function afterWelcome() {
    if (net.code) return raw({ t: 'join', code: net.code, ...(spectate ? { spectate: true } : {}), ...(name ? { name } : {}), ...(look ? { look } : {}) });
    if (create) return raw({ t: 'create', mode: create.mode || 'flag', ...(create.public != null ? { public: !!create.public } : {}), ...(create.seed != null ? { seed: create.seed | 0 } : {}),
      ...(create.flagId ? { flagId: String(create.flagId) } : {}), ...(create.start ? { start: true } : {}), ...(name ? { name } : {}), ...(look ? { look } : {}) });
    if (code) { net.code = code; return afterWelcome(); }
  }
  function onText(text) {
    bytesIn += text.length;
    let m; try { m = JSON.parse(text); } catch { return; }
    switch (m.t) {
      case 'welcome':
        token = m.token; if (online) ss.set(TOKEN_KEY, m.token);
        net.build = m.build; tries = 0; setStatus('online');
        afterWelcome();
        return;
      case 'room': {
        net.room = m; net.you = m.you; net.code = m.code;
        if (online) ss.set(ROOM_KEY, JSON.stringify({ code: m.code, spectate: !!spectate }));
        if (!joined && !(create?.start && m.phase !== 'play')) { joined = true; settle.res(net); }
        fire('room', m);
        return;
      }
      case 'pong': {
        if (m.c >= 0) { const t = Date.now(), rtt = t - m.c; net.ping = Math.round(rtt); offset = m.s + rtt / 2 - t; }
        fire('pong', m);
        return;
      }
      case 'err':
        if (!joined) { const e = new Error(m.msg || 'Could not join.'); e.code = m.code; wanted = false; clearInterval(pingTimer); try { ws?.close(); } catch { /* closed */ } setStatus('closed'); settle.rej(e); return; }
        if (m.code === 'noroom' || m.code === 'kicked') { wanted = false; clearInterval(pingTimer); forgetRoom(); try { ws?.close(); } catch { /* closed */ } setStatus('closed'); }
        break;
      case 'kicked': wanted = false; clearInterval(pingTimer); forgetRoom(); break;
      case 'state': if (m.s) offset += ((m.s - Date.now()) - offset) * (net.ping ? 0 : 0.2); break;    // before the first pong: a rough clock from the stream
    }
    keep(m);
    fire(m.t, m);
    fire('msg', m);
  }
  function open() {
    if (!online) {
      ws = socket || createLoopback({ sites, vehicles });
      ws.onmessage = onText;
      ws.onclose = () => setStatus('closed');
      queueMicrotask(() => raw({ t: 'hello', v: PROTOCOL }));
      return;
    }
    try { ws = socket || new WebSocket(url || wsUrlFor()); } catch (e) { setStatus('closed'); settle.rej(Object.assign(new Error('Could not reach the server.'), { code: 'network' })); return; }
    ws.onopen = () => raw({ t: 'hello', v: PROTOCOL, ...(token ? { token } : {}), ...(ticket ? { ticket } : {}) });
    ws.onmessage = e => { if (typeof e.data === 'string') onText(e.data); };
    ws.onclose = () => {
      if (!wanted) return setStatus('closed');
      if (!joined && tries >= 3) { wanted = false; clearInterval(pingTimer); setStatus('closed'); settle.rej(Object.assign(new Error('Could not reach the server.'), { code: 'network' })); return; }
      setStatus('reconnecting');
      setTimeout(() => wanted && open(), [300, 800, 1500, 3000, 5000][Math.min(tries++, 4)]);
    };
    ws.onerror = () => {};
  }
  if (code) net.code = code;
  const pingTimer = setInterval(() => raw({ t: 'ping', c: Date.now() }), 2000);
  setTimeout(() => raw({ t: 'ping', c: Date.now() }), 300);
  const wake = () => { if (typeof document !== 'undefined' && !document.hidden && online && ws && ws.readyState > 1 && wanted) { tries = 0; } };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', wake);
  net.close = () => {
    if (!wanted && net.status === 'closed') return;
    wanted = false; clearInterval(pingTimer);
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', wake);
    raw({ t: 'leave' });
    if (online) forgetRoom();
    try { ws?.close(); } catch { /* closed */ }
    setStatus('closed');
  };
  /** Tests and the debug menu: drop the line as if the phone slept (no "leave"); it comes back by itself. */
  net.drop = () => { try { ws?.close(); } catch { /* closed */ } };
  open();
  return ready;
}
