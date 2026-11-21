// The front desk: every socket lands here. It says hello (hands out or recognises the browser's token), creates and
// finds rooms by their four-letter code, lists the public ones ("Find a game"), checks every frame against the
// protocol and the rate limits, and passes the rest to the room. Pure (no sockets, no timers): server/main.mjs wires
// it, tests/net drive it with fake sockets. Copied from Overdrive Frame's server/hub.js (round 4).
//
// The token is only a "this is the same browser as before" key, so a phone that slept or a refreshed page gets its
// seat back. Nothing is stored with it; the server forgets it when the room closes.
import { PROTOCOL, parseFrame, createBuckets, cleanCode, newCode } from '../js/net/protocol.js';
import { createRoom, TIMES } from './room.js';

export const PUBLIC_LIST_MAX = 30;
export function createHub({ now = () => Date.now(), data, T, build = 'dev', seed = Date.now(), maxRooms = 60, randomToken, log = () => {}, clock, testHooks = false }) {
  const rooms = new Map();
  let seedN = seed >>> 0;
  const stats = { sockets: 0, bad: 0, limited: 0, roomsMade: 0 };
  const rand = () => { seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0; return seedN / 4294967296; };
  const token = randomToken || (() => { let s = ''; for (let i = 0; i < 24; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]; return s; });
  let open = 0;

  function accept(conn) {
    stats.sockets++; open++;
    const buckets = createBuckets(now);
    const S = { token: null, room: null, dev: null };
    const send = obj => conn.send(JSON.stringify(obj));
    function leave() { if (S.room && S.dev) S.room.remove(S.dev); S.room = null; S.dev = null; }
    function enter(room) {
      if (S.room && S.room !== room) leave();
      const dev = room.join({ token: S.token, send: d => conn.send(d) });
      if (dev) { S.room = room; S.dev = dev; }
    }
    function message(frame) {
      const f = parseFrame(frame);
      if (f.bad) { stats.bad++; return; }
      const msg = f.msg;
      if (!buckets.take(msg.t)) { stats.limited++; return; }
      if (msg.t === 'ping') return send({ t: 'pong', at: msg.at });
      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL) return send({ t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
        S.token = msg.token && /^[A-Za-z0-9_-]{16,64}$/.test(msg.token) ? msg.token : token();
        return send({ t: 'welcome', token: S.token, build });
      }
      if (!S.token) return send({ t: 'err', code: 'hello', msg: 'Say hello first.' });
      switch (msg.t) {
        case 'create': {
          if (rooms.size >= maxRooms) return send({ t: 'err', code: 'busy', msg: 'Every room is busy right now. Try again in a minute.' });
          let code; do { code = newCode(rand); } while (rooms.has(code));
          const room = createRoom({ code, now, seed: Math.floor(rand() * 2 ** 31), data, T, log, clock, testHooks });
          if (msg.public) room.opts.public = true;
          rooms.set(code, room); stats.roomsMade++;
          log('room.create', { code, public: !!msg.public });
          return enter(room);
        }
        case 'join': {
          const code = cleanCode(msg.code), room = code && rooms.get(code);
          if (!room) return send({ t: 'err', code: 'noroom', msg: 'No room with that code. Check the letters.' });
          return enter(room);
        }
        case 'leave': leave(); return send({ t: 'left' });
        case 'rooms': return send({ t: 'rooms', list: publicList() });
        default: if (S.room && S.dev && S.room.devices.has(S.dev.id)) S.room.message(S.dev, msg);
      }
    }
    function close() { open--; if (S.room && S.dev) S.room.disconnect(S.dev); S.room = null; S.dev = null; }
    return { message, close };
  }
  /** One sim step for every room (60 a second). Rooms nobody is connected to close after a minute. */
  function step() {
    for (const [code, room] of rooms) {
      try { room.step(); }
      catch (e) { log('room.crash', { code, msg: String(e?.stack || e).slice(0, 600) }); room.close('crash'); rooms.delete(code); continue; }
      if (room.size === 0 || room.emptyFor > TIMES.EMPTY_MS) { room.close(); rooms.delete(code); log('room.close', { code }); }
    }
  }
  /** Public rooms: rooms with a free seat first (fullest first), then full ones. */
  function publicList() {
    const L = [];
    for (const r of rooms.values()) { const x = r.listing(); if (x) L.push(x); }
    const free = x => x.players < x.seats;
    L.sort((a, b) => free(b) - free(a) || b.players - a.players || a.code.localeCompare(b.code));
    return L.slice(0, PUBLIC_LIST_MAX);
  }
  function status() {
    let players = 0, playing = 0, stepMs = 0, steps = 0, bytesOut = 0, maxStepMs = 0, qSum = 0, qN = 0;
    for (const r of rooms.values()) {
      players += r.size; if (r.phase === 'play') playing++;
      stepMs += r.stats.stepMs; steps += r.stats.steps; bytesOut += r.stats.bytesOut; qSum += r.stats.qSum || 0; qN += r.stats.qN || 0; maxStepMs = Math.max(maxStepMs, r.stats.maxStepMs);
    }
    return { rooms: rooms.size, playing, players, sockets: open, avgStepMs: steps ? Math.round(stepMs / steps * 1000) / 1000 : 0, maxStepMs: Math.round(maxStepMs * 100) / 100, bytesOut, inputQueue: qN ? Math.round(qSum / qN * 100) / 100 : 0, ...stats, socketsEver: stats.sockets };
  }
  /** Every room, for the admin feed. */
  function detail() {
    return [...rooms.values()].map(r => ({ code: r.code, public: r.opts.public, phase: r.phase, chapter: r.pick, players: r.seats.map(s => ({ name: s.name, cls: s.hero?.cls || null, level: s.hero?.level || null, host: s.host, away: s.away })) }));
  }
  /** Tell everyone the server is restarting (graceful restart: their pages reconnect and see the rooms are gone). */
  function shutdown() { for (const room of rooms.values()) room.close('restart'); rooms.clear(); }
  return { accept, step, status, detail, shutdown, rooms, publicList };
}
