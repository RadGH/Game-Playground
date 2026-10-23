// The front desk: every socket lands here. It says hello (hands out or recognises the player's token), creates and
// finds rooms by their four-letter code, checks every frame against the protocol and the rate limits, and passes the
// rest to the room. Also the shop (buy / wear a costume), since that is the player's, not a room's.
import { PROTOCOL, parseFrame, createBuckets, cleanCode, newCode } from '../shared/protocol.js';
import { createRoom, TIMES } from './room.js';

// `report(kind, data)` (round 7): the rooms' insights (ratings, plays, votes) go to the server's log (server/insights.mjs).
export const PUBLIC_LIST_MAX = 30;
export function createHub({ now = () => Date.now(), data, profiles, build = 'dev', seed = Date.now(), maxRooms = 200, log = () => {}, report = () => {} }) {
  const rooms = new Map();
  let seedN = seed >>> 0;
  const stats = { sockets: 0, bad: 0, limited: 0, roomsMade: 0 };
  const rand = () => { seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0; return seedN / 4294967296; };

  function accept(conn) {
    stats.sockets++;
    const buckets = createBuckets(now);
    const S = { profile: null, room: null, member: null };
    const send = obj => conn.send(JSON.stringify(obj));
    const raw = s => conn.send(s);
    const me = () => ({ t: 'me', ...profiles.view(S.profile) });
    function leave() { if (S.room && S.member) { S.room.remove(S.member); } S.room = null; S.member = null; }
    function enter(room, display) {
      leave();
      S.room = room;
      S.member = room.join({ token: S.profile.token, name: S.profile.name, look: S.profile.look, costume: S.profile.costume, send: raw, display });
    }
    function message(frame) {
      const f = parseFrame(frame);
      if (f.bad) { stats.bad++; return; }
      const msg = f.msg;
      if (!buckets.take(msg.t)) { stats.limited++; return; }
      if (msg.t === 'ping') return send({ t: 'pong', at: msg.at });
      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL) return send({ t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
        S.profile = profiles.get(msg.token) || profiles.create();
        return send({ t: 'welcome', token: S.profile.token, build, ...profiles.view(S.profile) });
      }
      if (!S.profile) return send({ t: 'err', code: 'hello', msg: 'Say hello first.' });
      switch (msg.t) {
        case 'create': {
          if (rooms.size >= maxRooms) return send({ t: 'err', code: 'full', msg: 'The fair is full right now. Try again in a minute.' });
          let code; do { code = newCode(rand); } while (rooms.has(code));
          const room = createRoom({ code, now, seed: Math.floor(rand() * 2 ** 31), data, profiles, log, report: (kind, d) => report(kind, d) });
          rooms.set(code, room); stats.roomsMade++;
          return enter(room, false);
        }
        case 'join': {
          const code = cleanCode(msg.code), room = code && rooms.get(code);
          if (!room) return send({ t: 'err', code: 'noroom', msg: 'No room with that code. Check the letters.' });
          return enter(room, !!msg.display);
        }
        case 'leave': leave(); return send({ t: 'left' });
        case 'rooms': return send({ t: 'rooms', list: publicList() });
        case 'profile': {
          const out = profiles.update(S.profile.token, msg);
          send(me());
          if (S.room && S.member && out) S.room.message(S.member, { t: 'profile', ...out });
          return;
        }
        case 'buy': { const r = profiles.buy(S.profile.token, msg.id); if (!r.ok) send({ t: 'err', code: 'buy', msg: r.msg }); return send(me()); }
        case 'equip': {
          if (profiles.equip(S.profile.token, msg.id) && S.room && S.member) S.room.message(S.member, { t: 'profile', costume: S.profile.costume });
          return send(me());
        }
        default: if (S.room && S.member && S.room.members.has(S.member.pid)) S.room.message(S.member, msg);
      }
    }
    function close() { if (S.room && S.member) S.room.disconnect(S.member); S.room = null; S.member = null; }
    return { message, close };
  }
  function tick() {
    for (const [code, room] of rooms) {
      room.tick();
      if (room.size === 0 || room.emptyFor > TIMES.EMPTY_MS) rooms.delete(code);
    }
  }
  /** Round 7: the public games — lobbies with a free seat first (fullest first: they start soonest), then games under way. */
  function publicList() {
    const L = [];
    for (const r of rooms.values()) { const x = r.listing?.(); if (x) L.push(x); }
    const open = x => x.phase === 'lobby' && x.players < x.seats;
    L.sort((a, b) => open(b) - open(a) || b.players - a.players || a.code.localeCompare(b.code));
    return L.slice(0, PUBLIC_LIST_MAX);
  }
  const status = () => ({ rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.size, 0), ...stats });
  return { accept, tick, status, rooms, publicList };
}
