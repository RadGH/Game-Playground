// The front desk: every socket lands here. It says hello (hands out or recognises the player's token), creates and
// finds rooms by their four-letter code, checks every frame against the protocol and the rate limits, and passes the
// rest to the room. Also the shop (buy / wear a costume), since that is the player's, not a room's.
//
// Accounts (2026-10-23): `hello` and `account` may carry a one-time `ticket` from games.radgh.com. The hub hands it to
// `redeem(ticket)` (server/rgs.mjs: async, -> user | null) and, for a user, plays on the ACCOUNT's profile
// (profiles.signIn). While a ticket is being redeemed this socket's other frames wait in a short queue. A failed
// redeem (bad ticket, rgs-api down) carries on as the guest. `account` without a ticket signs out: back to the guest.
import { PROTOCOL, parseFrame, createBuckets, cleanCode, newCode } from '../shared/protocol.js';
import { freshBadges } from '../games/fresh.js';
import { createRoom, TIMES } from './room.js';

// `report(kind, data)` (round 7): the rooms' insights (ratings, plays, votes) go to the server's log (server/insights.mjs).
export const PUBLIC_LIST_MAX = 30;
export function createHub({ now = () => Date.now(), data, profiles, build = 'dev', seed = Date.now(), maxRooms = 200, log = () => {}, report = () => {}, redeem = null, ratings = () => ({}), fresh = () => freshBadges() }) {
  const rooms = new Map();
  let seedN = seed >>> 0;
  const stats = { sockets: 0, bad: 0, limited: 0, roomsMade: 0 };
  const rand = () => { seedN = (Math.imul(seedN, 1664525) + 1013904223) >>> 0; return seedN / 4294967296; };

  function accept(conn) {
    stats.sockets++;
    const buckets = createBuckets(now);
    const S = { profile: null, room: null, member: null, guest: null, user: null, busy: false, queue: [], closed: false };
    const send = obj => conn.send(JSON.stringify(obj));
    const raw = s => conn.send(s);
    const me = () => ({ t: 'me', ...profiles.view(S.profile) });
    function leave() { if (S.room && S.member) { S.room.remove(S.member); } S.room = null; S.member = null; }
    function enter(room, display) {
      leave();
      S.room = room;
      S.member = room.join({ token: S.profile.token, name: S.profile.name, look: S.profile.look, costume: S.profile.costume, send: raw, display });
      if (!S.member) S.room = null;                       // kicked from this room earlier (round 10): it said so
    }
    const accountInfo = () => S.user ? { id: String(S.user.id), name: String(S.user.name || S.user.username || '').slice(0, 40) || 'Signed in', username: String(S.user.username || '').slice(0, 40) } : null;
    /** Moves this socket onto profile p, telling the room (name, look, costume) when it is in one. */
    function become(p) {
      S.profile = p;
      if (S.room && S.member) { S.member.token = p.token; S.room.message(S.member, { t: 'profile', name: p.name, look: p.look, costume: p.costume }); }
    }
    /** Redeem a ticket (or none = guest), then answer with `reply(note)`. Frames that arrive meanwhile wait. */
    function settle(ticket, reply) {
      const guestNow = () => { if (!S.guest) S.guest = profiles.create(); S.user = null; become(S.guest); };
      if (!ticket || !redeem) { guestNow(); reply(null); return; }
      S.busy = true;
      Promise.resolve().then(() => redeem(ticket)).catch(() => null).then(user => {
        if (S.closed) return;
        let note = null;
        if (user) {
          const r = profiles.signIn(user.id, S.guest?.token);
          if (r.note === 'moved') S.guest = null;          // the guest profile is the account's now; signing out makes a fresh guest
          S.user = user; note = r.note; become(r.profile);
          log('account.in', { note });
        } else { log('account.redeem_failed', {}); guestNow(); note = 'failed'; }
        reply(note);
        S.busy = false;
        const q = S.queue; S.queue = [];
        for (const fr of q) message(fr);
      });
    }
    function message(frame) {
      if (S.busy) { if (S.queue.length < 40) S.queue.push(frame); return; }
      const f = parseFrame(frame);
      if (f.bad) { stats.bad++; return; }
      const msg = f.msg;
      if (!buckets.take(msg.t)) { stats.limited++; return; }
      if (msg.t === 'ping') return send({ t: 'pong', at: msg.at });
      if (msg.t === 'hello') {
        if (msg.v !== PROTOCOL) return send({ t: 'err', code: 'version', msg: 'This page is out of date. Reload it.' });
        S.guest = profiles.guest(msg.token);
        if (!msg.ticket || !redeem) {
          S.profile = S.guest || profiles.create(); S.guest = S.profile;
          return send({ t: 'welcome', token: S.profile.token, build, account: null, ...profiles.view(S.profile) });
        }
        return settle(msg.ticket, note => send({ t: 'welcome', ...(S.guest ? { token: S.guest.token } : {}), build, account: accountInfo(), ...(note ? { note } : {}), ...profiles.view(S.profile) }));
      }
      if (msg.t === 'account') {
        if (!S.profile) return send({ t: 'err', code: 'hello', msg: 'Say hello first.' });
        return settle(msg.ticket || null, note => { send({ t: 'acct', ...(S.guest ? { token: S.guest.token } : {}), account: accountInfo(), ...(note ? { note } : {}) }); send(me()); });
      }
      if (!S.profile) return send({ t: 'err', code: 'hello', msg: 'Say hello first.' });
      switch (msg.t) {
        case 'create': {
          if (rooms.size >= maxRooms) return send({ t: 'err', code: 'full', msg: 'The fair is full right now. Try again in a minute.' });
          let code; do { code = newCode(rand); } while (rooms.has(code));
          const room = createRoom({ code, now, seed: Math.floor(rand() * 2 ** 31), data, profiles, log, ratings, fresh, report: (kind, d) => report(kind, d) });
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
        case 'mygames': return send({ t: 'mygames', list: profiles.history(S.profile.token) });   // round 10 (#28/#29)
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
    function close() { S.closed = true; if (S.room && S.member) S.room.disconnect(S.member); S.room = null; S.member = null; }
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
