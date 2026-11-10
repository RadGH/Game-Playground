// Solo / offline play: the same room referee (js/net/room-core.js) the server runs, running in this page instead, behind
// a pretend socket that speaks exactly the server's frames (hello -> welcome, create -> room, the same validation and
// rate limits, `state` 20 times a second). js/net/client.js uses it when `online` is false, so the game code cannot
// tell solo from online. "Latency" is 0 ms, but every reply still arrives a moment later (a microtask), like a socket.
//
//   const sock = createLoopback({ sites, vehicles, bests, shop, jobs, achievements, profiles });   sock.onmessage = text => …;  sock.send(text);  sock.close();
//
// Solo play keeps the player's profile (gold, what they own — Expansion 1 M2) in localStorage `roverlands.profile`,
// written the moment the room changes it. `profiles` (tests) replaces that store.
import { PROTOCOL, STATE_HZ, MODES, parseFrame, createBuckets } from './protocol.js';
import { createRoomCore } from './room-core.js';
import { cleanProfile } from '../game/profile.js';

const BESTS_KEY = 'roverlands.solo.bests';
const store = {
  get() { try { return JSON.parse(localStorage.getItem(BESTS_KEY) || '{}') || {}; } catch { return {}; } },
  set(v) { try { localStorage.setItem(BESTS_KEY, JSON.stringify(v)); } catch { /* private window: bests last this visit */ } },
};

export const PROFILE_KEY = 'roverlands.profile';
/** The solo profile store: ONE profile (this browser's), in localStorage. Never throws (a private window keeps it for the visit). */
export function localProfiles(storage = globalThis.localStorage) {
  let live = null;
  const read = () => { try { const t = storage?.getItem(PROFILE_KEY); return t ? JSON.parse(t) : null; } catch { return null; } };
  return {
    get(key, look) { if (!live) { const saved = read(); live = cleanProfile(saved); if (!saved && look) live.look = look; if (!saved) this.changed(); } return live; },
    changed() { try { storage?.setItem(PROFILE_KEY, JSON.stringify(live)); } catch { /* private window / full */ } },
  };
}

export function createLoopback({ sites = {}, vehicles = {}, bests = null, shop = {}, jobs = {}, achievements = {}, profiles = null, now = () => Date.now(), timers = globalThis, report = () => {} } = {}) {
  const B = bests || store.get();
  let core = null, pid = null, closed = false, timer = null, saved = JSON.stringify(B);
  const buckets = createBuckets(now);
  const sock = { onmessage: null, onclose: null, readyState: 1, bad: 0 };
  const deliver = obj => { const s = JSON.stringify(obj); queueMicrotask(() => { if (!closed) sock.onmessage?.(s); }); };
  function tick() {
    if (!core) return;
    core.tick();
    const s = JSON.stringify(B); if (s !== saved && !bests) { saved = s; store.set(B); }
  }
  sock.send = text => {
    if (closed) return;
    const f = parseFrame(text);
    if (f.bad) { sock.bad++; return; }
    const msg = f.msg;
    if (!buckets.take(msg.t)) return;
    if (msg.t === 'hello') return deliver(msg.v === PROTOCOL ? { t: 'welcome', token: 'solo-local-token-0000', build: 'solo' } : { t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
    if (msg.t === 'create') {
      core = createRoomCore({ code: 'SOLO', mode: MODES.includes(msg.mode) ? msg.mode : 'flag', seed: msg.seed ?? 7, flagId: msg.flagId || null, public: false, now, sites, vehicles, bests: B, report,
        shop, jobs, achievements, profiles: profiles || localProfiles(),
        send: (to, m) => { if (to === pid) deliver(m); } });
      // join() speaks before it returns the pid: the room's first words are for the only player there is
      pid = 1;
      const r = core.join({ token: 'solo-local-token-0000', name: msg.name, look: msg.look, profileKey: 'solo' });
      pid = r.pid;
      if (msg.start) core.message(pid, { t: 'start' });
      timer = timers.setInterval(tick, 1000 / STATE_HZ);
      return;
    }
    if (msg.t === 'join') return deliver({ t: 'err', code: 'noroom', msg: 'Solo play has no rooms to join.' });
    if (msg.t === 'leave') { core = null; return deliver({ t: 'left' }); }
    if (core && pid != null) core.message(pid, msg);
  };
  sock.close = () => { if (closed) return; closed = true; sock.readyState = 3; if (timer) timers.clearInterval(timer); if (!bests) store.set(B); sock.onclose?.(); };
  Object.defineProperty(sock, 'core', { get: () => core });
  return sock;
}
