// The front desk: every socket lands here. It says hello (hands out or recognises the browser's token), creates and
// finds rooms by their four-letter code, lists the public ones ("Find a game"), checks every frame against the
// protocol and its rate limits, and passes the rest to the room's referee (js/net/room-core.js). Pure apart from what
// it is handed (no sockets, no timers): server/main.mjs wires it, tests/net-room.test.js drives it through real sockets.
// Modelled on Knockabout's server/hub.js.
//
// The token is only a "this is the same browser tab as before" key, so a phone that slept or a refreshed page gets its
// seat back. Nothing is stored with it; the room forgets it when it closes.
import { PROTOCOL, MODES, EMPTY_ROOM_MS, parseFrame, createBuckets, cleanCode, newCode } from '../js/net/protocol.js';
import { createRoomCore } from '../js/net/room-core.js';

export const PUBLIC_LIST_MAX = 30;

/**
 * sitesFor(seed) -> world.sites for that seed (may return a promise: the server builds the world once per seed).
 * vehicles = data/vehicles.json (any shape js/net/room-core.js vehicleTable() reads). bests = { 'seed:site': ms }.
 */
export function createHub({ now = () => Date.now(), build = 'dev', seed = Date.now(), maxRooms = 60, randomToken, log = () => {}, report = () => {},
  sitesFor = () => ({}), vehicles = {}, bests = {}, defaultSeed = 7 } = {}) {
  const rooms = new Map();                 // code -> { core, conns: Map(pid -> send), made }
  let seedN = seed >>> 0;
  const stats = { sockets: 0, bad: 0, limited: 0, roomsMade: 0 };
  const rand = () => { seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0; return seedN / 4294967296; };
  const token = randomToken || (() => { let s = ''; for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]; return s; });

  function makeRoom(code, msg, sites) {
    const R = { conns: new Map(), made: now(), core: null, joining: null };
    R.core = createRoomCore({ code, mode: MODES.includes(msg.mode) ? msg.mode : 'flag', seed: msg.seed ?? defaultSeed, flagId: msg.flagId || null, public: !!msg.public, now,
      sites, vehicles: typeof vehicles === 'function' ? vehicles() : vehicles, bests, report,
      // a player who is joining right now has no line registered yet: R.joining carries it for that one call
      send: (pid, m) => { const s = R.conns.get(pid) || R.joining; if (s) s(JSON.stringify(m)); } });
    return R;
  }

  function accept(conn) {
    stats.sockets++;
    const buckets = createBuckets(now);
    const S = { token: null, code: null, pid: null, busy: false };
    const send = obj => conn.send(JSON.stringify(obj));
    const room = () => (S.code ? rooms.get(S.code) : null);
    function enter(R, msg) {
      if (S.code && S.code !== R.core.code) leave();
      const line = d => conn.send(d);
      R.joining = line;
      let r; try { r = R.core.join({ token: S.token, name: msg.name, look: msg.look, spectate: !!msg.spectate }); } finally { R.joining = null; }
      if (r.err) return send({ t: 'err', code: r.err, msg: r.msg });
      S.code = R.core.code; S.pid = r.pid;
      R.conns.set(r.pid, line);
    }
    function leave() {
      const R = room();
      if (R && S.pid != null) { R.conns.delete(S.pid); R.core.leave(S.pid); }
      S.code = null; S.pid = null;
    }
    async function message(frame) {
      const f = parseFrame(frame);
      if (f.bad) { stats.bad++; return; }
      const msg = f.msg;
      if (!buckets.take(msg.t)) { stats.limited++; return; }
      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL) return send({ t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
        S.token = msg.token && /^[A-Za-z0-9_-]{16,64}$/.test(msg.token) ? msg.token : token();
        return send({ t: 'welcome', token: S.token, build });
      }
      if (!S.token) return send({ t: 'err', code: 'hello', msg: 'Say hello first.' });
      switch (msg.t) {
        case 'create': {
          if (S.busy) return;
          if (rooms.size >= maxRooms) return send({ t: 'err', code: 'busy', msg: 'Every room is busy right now. Try again in a minute.' });
          let code; do { code = newCode(rand); } while (rooms.has(code));
          S.busy = true;
          let sites;
          try { sites = await sitesFor(msg.seed ?? defaultSeed); } catch (e) { log('sites.fail', { msg: String(e?.message || e).slice(0, 200) }); sites = {}; }
          S.busy = false;
          const R = makeRoom(code, msg, sites || {});
          rooms.set(code, R); stats.roomsMade++;
          log('room.create', { code, mode: R.core.mode });
          enter(R, msg);
          if (msg.start && S.pid != null) R.core.message(S.pid, { t: 'start' });
          return;
        }
        case 'join': {
          const code = cleanCode(msg.code), R = code && rooms.get(code);
          if (!R) return send({ t: 'err', code: 'noroom', msg: 'No room with that code. Check the letters.' });
          return enter(R, msg);
        }
        case 'leave': leave(); return send({ t: 'left' });
        default: {
          const R = room();
          if (R && S.pid != null) R.core.message(S.pid, msg);
        }
      }
    }
    function close() {
      const R = room();
      if (R && S.pid != null) { R.conns.delete(S.pid); R.core.disconnect(S.pid); }
      S.code = null; S.pid = null;
    }
    return { message, close, get pid() { return S.pid; }, get code() { return S.code; } };
  }
  /** STATE_HZ times a second. Rooms with nobody in them close after EMPTY_ROOM_MS. */
  function step() {
    for (const [code, R] of rooms) {
      try { R.core.tick(); }
      catch (e) { log('room.crash', { code, msg: String(e?.stack || e).slice(0, 400) }); rooms.delete(code); continue; }
      if (R.core.players.size === 0 || R.core.emptyFor > EMPTY_ROOM_MS) { rooms.delete(code); log('room.close', { code, runs: R.core.runs }); }
    }
  }
  /** Public rooms: lobbies first (they are waiting for people), fullest first. */
  function publicList() {
    const L = [];
    for (const R of rooms.values()) { const x = R.core.listing(); if (x) L.push(x); }
    L.sort((a, b) => (a.phase === 'lobby' ? 0 : 1) - (b.phase === 'lobby' ? 0 : 1) || b.players - a.players || a.code.localeCompare(b.code));
    return L.slice(0, PUBLIC_LIST_MAX);
  }
  function status() {
    let players = 0, playing = 0;
    for (const R of rooms.values()) { players += R.core.connected; if (R.core.phase === 'play') playing++; }
    return { rooms: rooms.size, playing, players, ...stats };
  }
  return { accept, step, status, rooms, publicList };
}
