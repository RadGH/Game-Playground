// The front desk + the rooms. Pure (no sockets, no timers): server/main.mjs wires sockets and calls step() at 20 Hz;
// the solo Worker runs the very same hub with one seat.
//
// A room is one shared world (js/sim/world.js) for up to 4 players.
//   * Seats: a browser is known by its token (welcome). If its socket drops, its hero stays in the world, standing still,
//     for SEAT_KEEP_MS; the same browser saying hello again gets `resume {code}` and joins straight back into its seat.
//   * Host: the first player in. The host can make the game public (listed in "Find a game") or invite-only, and remove
//     a player (removed tokens cannot rejoin that room). When the host leaves for good, the next player becomes host.
//     The server runs the world, so nothing stalls when the host goes (ruling 36).
//   * An empty room closes after EMPTY_KEEP_MS (everyone dropped at once — e.g. a phone network blip — can come back).
import { PROTOCOL, parseFrame, createBuckets, cleanCode, newCode, SNAP_EVERY } from './protocol.js';
import * as World from '../sim/world.js';

export const MAX_PLAYERS = 4;
export const SEAT_KEEP_MS = 90_000;
export const EMPTY_KEEP_MS = 120_000;
export const PUBLIC_LIST_MAX = 30;

export function createHub({ now = () => Date.now(), build = 'dev', seed = Date.now(), maxRooms = 200, log = () => {}, checkCharacter = c => ({ ok: true, character: c }), content = null } = {}) {
  const rooms = new Map();
  let s = seed >>> 0, serial = 0;
  const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const token = () => { let t = ''; for (let i = 0; i < 24; i++) t += 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]; return t; };

  function makeRoom(isPublic) {
    const code = newCode(rand, c => rooms.has(c)); if (!code) return null;
    const room = { code, world: World.createWorld({ seed: (rand() * 2 ** 31) >>> 0, content }), seats: new Map(), host: null, made: now(), public: !!isPublic, banned: new Set(), emptySince: null };
    rooms.set(code, room); log('room', { code, public: room.public });
    return room;
  }
  const present = room => [...room.seats.values()].filter(x => x.conn);
  function broadcast(room, obj) { const d = JSON.stringify(obj); for (const seat of room.seats.values()) seat.conn?.send(d); }
  /** Who is here and what they look like: sent whenever someone joins, drops, comes back or leaves. */
  function roster(room) {
    broadcast(room, { t: 'roster', code: room.code, host: room.host, public: room.public,
      players: [...room.seats.values()].map(x => { const p = room.world.players.get(x.id); return { id: x.id, name: p?.name, look: p?.look, away: !x.conn }; }) });
  }
  function pickHost(room) {
    if (room.host && room.seats.has(room.host) && room.seats.get(room.host).conn) return;
    const next = present(room)[0] || [...room.seats.values()][0];
    room.host = next ? next.id : null;
  }
  function dropSeat(room, id, why = 'left') {
    room.seats.delete(id); World.removePlayer(room.world, id);
    pickHost(room);
    broadcast(room, { t: 'left', id, host: room.host, why });
    roster(room);
  }

  function accept(conn) {
    const buckets = createBuckets(now), S = { token: null, room: null, id: null };
    const send = obj => conn.send(JSON.stringify(obj));
    const seatOf = () => S.room?.seats.get(S.id);
    /** Leave on purpose: the seat is gone. */
    function leave() {
      const room = S.room; if (!room) return;
      const id = S.id; S.room = null; S.id = null;
      if (room.seats.has(id)) dropSeat(room, id, 'left');
    }
    /** The socket closed: keep the seat for a while. */
    function close() {
      const room = S.room; if (!room) return;
      const seat = seatOf(); S.room = null; S.id = null;
      if (!seat) return;
      seat.conn = null; seat.awaySince = now();
      World.setInput(room.world, seat.id, { mx: 0, mz: 0 });     // no seq: stop at once
      pickHost(room); roster(room);
    }
    function sit(room, seat) {
      seat.conn = conn; seat.awaySince = null;
      S.room = room; S.id = seat.id;
      room.emptySince = null;
      pickHost(room);
      send({ t: 'joined', code: room.code, you: seat.id, host: room.host, public: room.public, seed: room.world.seed, area: room.world.area.id });
      roster(room);
    }
    function enter(room, character) {
      if (S.room === room && seatOf()) return sit(room, seatOf());
      if (room.banned.has(S.token)) return send({ t: 'err', code: 'removed', msg: 'The host removed you from that game.' });
      // the same browser coming back (a refresh, a new tab) takes its own seat back
      for (const seat of room.seats.values()) if (seat.token === S.token) { if (S.room && S.room !== room) leave(); return sit(room, seat); }
      if (room.seats.size >= MAX_PLAYERS) return send({ t: 'err', code: 'full', msg: 'That game is full (4 players).' });
      const chk = checkCharacter(character);
      if (!chk.ok) return send({ t: 'err', code: 'character', msg: chk.msg || 'That character could not join.' });
      leave();
      const seat = { id: 'p' + (++serial), token: S.token, conn: null, awaySince: null };
      room.seats.set(seat.id, seat);
      World.addPlayer(room.world, seat.id, chk.character || {});
      sit(room, seat);
    }
    function message(frame) {
      const f = parseFrame(frame); if (f.bad) return;
      const msg = f.msg; if (!buckets.take(msg.t)) return;
      if (msg.t === 'ping') return send({ t: 'pong', at: msg.at });
      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL) return send({ t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
        S.token = typeof msg.token === 'string' && /^[a-z0-9]{16,64}$/.test(msg.token) ? msg.token : token();
        send({ t: 'welcome', token: S.token, build });
        // a seat still kept for this browser: offer it straight back
        for (const room of rooms.values()) for (const seat of room.seats.values()) if (seat.token === S.token && !seat.conn) return send({ t: 'resume', code: room.code });
        return;
      }
      if (!S.token) return;
      switch (msg.t) {
        case 'create': {
          if (rooms.size >= maxRooms) return send({ t: 'err', code: 'busy', msg: 'The server is full right now. Try again soon.' });
          const r = makeRoom(msg.public); if (r) enter(r, msg.character); return;
        }
        case 'join': { const r = rooms.get(cleanCode(msg.code)); if (!r) return send({ t: 'err', code: 'nocode', msg: 'No game with that code. It may have ended.' }); return enter(r, msg.character); }
        case 'list': return send({ t: 'list', rooms: publicList() });
        case 'leave': return leave();
        case 'input': if (S.room) World.setInput(S.room.world, S.id, msg); return;
        case 'act': { if (!S.room) return; const r = World.act(S.room.world, S.id, msg); if (r?.err) send({ t: 'nope', msg: r.err, n: msg.n }); return; }
        case 'host': {
          const room = S.room; if (!room || room.host !== S.id) return;
          if (typeof msg.public === 'boolean') { room.public = msg.public; roster(room); }
          if (typeof msg.remove === 'string' && msg.remove !== S.id && room.seats.has(msg.remove)) {
            const gone = room.seats.get(msg.remove);
            room.banned.add(gone.token);
            gone.conn?.send(JSON.stringify({ t: 'removed', msg: 'The host removed you from the game.' }));
            dropSeat(room, gone.id, 'removed');
          }
          return;
        }
      }
    }
    return { message, close, leave };
  }

  function publicList() {
    const out = [];
    for (const r of rooms.values()) {
      if (!r.public || r.seats.size >= MAX_PLAYERS || !present(r).length) continue;
      const host = r.world.players.get(r.host);
      out.push({ code: r.code, host: host?.name || '?', players: r.seats.size, area: r.world.area.name });
      if (out.length >= PUBLIC_LIST_MAX) break;
    }
    return out;
  }

  function step() {
    const t = now();
    for (const room of rooms.values()) {
      // seats nobody came back to, and rooms nobody is in
      for (const seat of [...room.seats.values()]) if (!seat.conn && t - seat.awaySince > SEAT_KEEP_MS) dropSeat(room, seat.id, 'timeout');
      if (!present(room).length) {
        room.emptySince ??= t;
        if (!room.seats.size || t - room.emptySince > EMPTY_KEEP_MS) { rooms.delete(room.code); log('room-closed', { code: room.code }); continue; }
      }
      World.step(room.world);
      // a hero's saved sheet changed (experience, levels): hand it back to its own browser, which saves it (ruling 1)
      for (const id of room.world.charDirty) { const p = room.world.players.get(id), seat = room.seats.get(id); if (p && seat?.conn) seat.conn.send(JSON.stringify({ t: 'char', character: p.char })); }
      room.world.charDirty.clear();
      if (room.world.tick % SNAP_EVERY === 0) broadcast(room, { t: 'snap', ...World.snapshot(room.world) });
    }
  }
  const status = () => ({ rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + present(r).length, 0), public: [...rooms.values()].filter(r => r.public).length });
  return { accept, step, status, rooms, publicList };
}
