// The socket to a room server. Where the server is (`roomBase`, pure), whether there is one at all (`findServer`), and a link that speaks the Worker's language with a few more words:
// it says hello, keeps the room's clock, and if the line goes it keeps trying for as long as the room keeps your seat, then says so. Nothing here knows about the game.
import { PROTOCOL } from '../sim/protocol.js';
import { createClock } from './smooth.js';

export const PUBLIC_SERVER = 'https://oddhaven.games.radgh.com';
const PORTS = { 8400: 8560, 8401: 8561, 8442: 8562, 8441: 8563 };      // the playground's own servers: stable, dev, and their https ports, each to the same kind of room server
const ROOM_PORTS = new Set(['8560', '8561', '8562', '8563']);

/** The room server for a page at this address, as an http(s) origin, or null. `port` is ?roomPort=, for tests. */
export function roomBase(loc, port = null) {
  const { protocol, hostname, port: here } = loc;
  if (port === 'none') return null;
  if (port) return `${protocol}//${hostname}:${port}`;
  if (ROOM_PORTS.has(here) || hostname === 'oddhaven.games.radgh.com') return loc.origin;        // it served this page
  if (PORTS[here]) return `${protocol}//${hostname}:${PORTS[here]}`;
  if (/(^|\.)games\.radgh\.com$|\.github\.io$/.test(hostname)) return PUBLIC_SERVER;
  return null;
}
export const socketUrl = base => `${base.replace(/^http/, 'ws')}/ws`;

/** Is a room server there? Asked only when somebody wants to play together, so a solo game never waits on it or logs a failure. */
export async function findServer(base, ms = 2500) {
  if (!base) return null;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(`${base}/status`, { signal: ctl.signal, cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return j.server === 'oddhaven' ? j : null; } catch { return null; } finally { clearTimeout(timer); }
}
export async function publicRooms(base) {
  try { const r = await fetch(`${base}/rooms`, { cache: 'no-store' }); return r.ok ? (await r.json()).rooms : []; } catch { return []; }
}

/** A random name for this browser's seat. Only this browser and the room ever see it. */
export function seatToken(store) {
  let t = store.get();
  if (!t) { const a = new Uint8Array(18); crypto.getRandomValues(a); t = [...a].map(b => b.toString(16).padStart(2, '0')).join(''); store.set(t); }
  return t;
}

/**
 * hello = async () => ({ token, name, ticket }), first = what to say after hello: { type:'host', ... } or { type:'join', code }. It may be a function, because after a reconnect `first` is a join with the code we were given.
 * onState('open' | 'down' | 'lost'): down = trying again, lost = given up.
 */
export function roomLink({ url, hello, first, onState = () => {}, retryMs = 100000 }) {
  let ws = null, handlers = [], stopped = false, ever = false, downAt = 0, tries = 0, timer = 0, ping = 0, opened = false, bytesIn = 0, bytesOut = 0, msgsIn = 0;
  const clock = createClock();
  const say = t => { if (ws?.readyState === 1) { ws.send(t); bytesOut += t.length; return true; } return false; };
  function connect() {
    try { ws = new WebSocket(url); } catch { schedule(); return; }
    opened = false;
    const sock = ws;
    ws.addEventListener('open', async () => {
      opened = true; tries = 0; downAt = 0;
      const who = await hello();     // a sign-in ticket works once, so every connection asks for its own
      if (sock !== ws) return;
      say(JSON.stringify({ type: 'hello', v: PROTOCOL, ...who }));
      say(JSON.stringify(typeof first === 'function' ? first() : first));
      ever = true;
      onState('open');
      clearInterval(ping);
      ping = setInterval(() => say(JSON.stringify({ type: 'ping', t: performance.now() })), 2000);
      say(JSON.stringify({ type: 'ping', t: performance.now() }));
    });
    ws.addEventListener('message', e => {
      bytesIn += e.data.length; msgsIn++;
      const m = JSON.parse(e.data);
      if (m.type === 'pong') { clock.sample(m.t, m.at, performance.now()); return; }
      if ((m.type === 'closed' && m.why !== 'restart') || m.type === 'refused' || m.type === 'home') stopped = true;
      for (const f of handlers) f(m);
    });
    ws.addEventListener('close', () => { clearInterval(ping); if (stopped) return; if (!opened && !ever) { for (const f of handlers) f({ type: 'nolink' }); onState('lost'); stopped = true; return; } schedule(); });
    ws.addEventListener('error', () => {});
  }
  function schedule() {
    if (stopped) return;
    if (!downAt) { downAt = performance.now(); onState('down'); }
    if (performance.now() - downAt > retryMs) { stopped = true; onState('lost'); return; }
    clearTimeout(timer);
    timer = setTimeout(connect, Math.min(4000, 400 * 2 ** tries++));
  }
  connect();
  return {
    post(m) { say(JSON.stringify(m)); },
    on(f) { handlers.push(f); },
    stop() { stopped = true; clearTimeout(timer); clearInterval(ping); try { ws?.close(); } catch { /* gone */ } },
    /** Tests: cut the line as a tunnel would, without saying goodbye. */
    cut() { try { ws?.close(); } catch { /* gone */ } },
    clock, isRoom: true,
    get bytes() { return { in: bytesIn, out: bytesOut, msgs: msgsIn }; },
    get up() { return ws?.readyState === 1; },
  };
}
