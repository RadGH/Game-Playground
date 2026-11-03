// Every room on one server: codes, limits, who is in which room, sleep and wake. No sockets and no clock of its own, so tests can drive it in memory; server/main.mjs brings both.
//
//   const hub = createHub({ data, town, store, redeem, log, options });
//   const c = hub.accept({ ip, send, close, busy });   c.message(text, nowMs);   c.closed(nowMs);
//   hub.pump(nowMs);   hub.status();   hub.list();   hub.shutdown();
//
// A socket goes hello -> (host | join) -> room. Nothing reaches the sim before that, and from then on every message passes js/sim/protocol.js and the room's own permission check.
import { randomInt } from 'node:crypto';
import { createRoom } from '../js/sim/room.js';
import { PROTOCOL, LIMITS, CODE_LETTERS, isCode, cleanName, createBucket } from '../js/sim/protocol.js';

export const HUB_OPTIONS = Object.freeze({
  maxRooms: 20,           // rooms running at once; the rest wait on disk. Memory is the limit: about 16 MB a room (tools/load-rooms.mjs, README "Numbers")
  maxSockets: 200, socketsPerIp: 24, roomsPerIpHour: 10, joinsPerIpMinute: 20,
  sleepEmptyMs: 120000,   // nobody connected for this long: saved and closed
  sleepIdleMs: 3600000,   // connected, but nobody has done anything: the same
  autosaveMs: 60000, helloMs: 8000, maxErrors: 5, dev: false,
});
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export function createHub({ data, town, store = null, redeem = null, log = () => {}, options = {}, roomOptions = {} }) {
  const opt = { ...HUB_OPTIONS, ...options }, rooms = new Map(), sockets = new Set(), ips = new Map();
  const counts = { refused: 0, closedForAbuse: 0, badFrames: 0, wrongCodes: 0, hosted: 0, woken: 0, slept: 0, errors: 0 };
  let last = 0;
  const ipOf = ip => { let r = ips.get(ip); if (!r) ips.set(ip, r = { sockets: 0, joins: createBucket(opt.joinsPerIpMinute / 60, opt.joinsPerIpMinute), hosts: createBucket(opt.roomsPerIpHour / 3600, opt.roomsPerIpHour) }); return r; };
  const freshCode = () => { for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += CODE_LETTERS[randomInt(CODE_LETTERS.length)]; if (!rooms.has(c) && !store?.has(c)) return c; } };
  const roomOpts = () => ({ ...roomOptions, dev: opt.dev });

  function open(code, args) {
    const room = createRoom({ data, town, ...args, options: roomOpts() });
    room.set({ code });
    const r = { code, room, emptyAt: 0, savedAt: 0, errors: 0 };
    rooms.set(code, r);
    return r;
  }
  /** Saved and out of memory. A room that was taken home has no reason to stay on disk. */
  function close(r, nowMs, { sync = false, keep = true } = {}) {
    rooms.delete(r.code);
    for (const c of r.room.seats.values()) if (c.online) c.close?.();
    if (!keep) { store?.remove(r.code); return; }
    if (store) { const d = r.room.dump(nowMs), at = Date.now(); if (sync) store.saveNow(r.code, d, at); else store.save(r.code, d, at, e => { if (e) log('room.save.fail', { code: r.code, msg: String(e.message) }); }); }
    counts.slept++;
  }
  function wake(code, nowMs) {
    if (rooms.size >= opt.maxRooms || !store?.has(code)) return null;
    const file = store.load(code), r = open(code, { save: file.text, meta: file.meta });
    r.room.sim.catchUp(Math.max(0, Date.now() - (file.at ?? Date.now())));
    r.room.sim.drainEvents();
    r.emptyAt = nowMs;
    counts.woken++;
    return r;
  }

  function accept({ ip = '?', send, close: hang = () => {}, busy = null }) {
    const me = { ip, send, hang, busy, bucket: createBucket(LIMITS.rate, LIMITS.burst), strikes: 0, token: null, name: '', account: null, code: null, id: null, wait: [], hello: false, born: last, gone: false };
    const say = m => { try { send(JSON.stringify(m)); } catch (e) { log('send.fail', { msg: String(e?.message) }); } };
    const shut = (why, abuse = false) => { if (me.gone) return; say({ type: 'closed', why }); if (abuse) counts.closedForAbuse++; hang(); };
    const row = ipOf(ip);
    if (sockets.size >= opt.maxSockets || (row.sockets >= opt.socketsPerIp && !opt.dev)) { counts.refused++; say({ type: 'refused', why: 'busy' }); hang(); return { message() {}, closed() {} }; }
    sockets.add(me); row.sockets++;
    const strike = n => { me.strikes += n; if (me.strikes >= LIMITS.strikes) shut('too many bad messages', true); };
    const into = (r, nowMs) => {
      const id = r.room.join(say, { token: me.token, name: me.name, busy, close: hang, account: me.account });
      if (id) { me.code = r.code; me.id = id; r.emptyAt = 0; } else hang();
      void nowMs;
    };
    function first(m, nowMs) {
      if (m.type === 'host') {
        if (!row.hosts.take(nowMs) && !opt.dev) { counts.refused++; return say({ type: 'refused', why: 'slow down' }); }
        if (rooms.size >= opt.maxRooms) { counts.refused++; return say({ type: 'refused', why: 'busy' }); }
        const save = typeof m.save === 'string' && m.save.length <= LIMITS.saveChars ? m.save : null;
        if (m.save !== undefined && m.save !== null && !save) return say({ type: 'refused', why: 'bad save' });
        let r;
        try { r = open(freshCode(), { seed: Number.isInteger(m.seed) ? m.seed : 1, save, meta: { settings: { name: cleanName(m.room) || `${me.name || 'A friend'}'s town`, public: !!m.public }, lines: Array.isArray(m.lines) ? m.lines.slice(0, 4000).filter(l => typeof l?.[0] === 'string' && Number.isFinite(l?.[1])) : [] } }); } catch (e) { log('room.host.bad', { msg: String(e?.message).slice(0, 200) }); return say({ type: 'refused', why: 'bad save' }); }
        r.room.driver.command({ kind: 'release', owner: 'solo' });      // a save made mid-play: whoever it was comes back through the page
        counts.hosted++;
        log('room.open', { code: r.code, ip });
        return into(r, nowMs);
      }
      if (m.type === 'join') {
        if (!row.joins.take(nowMs) && !opt.dev) { counts.refused++; return say({ type: 'refused', why: 'slow down' }); }
        const code = opt.dev ? String(m.code ?? '') : String(m.code ?? '').toUpperCase();
        if (!isCode(code, opt.dev)) { counts.wrongCodes++; return say({ type: 'refused', why: 'no such room' }); }
        let r = rooms.get(code);
        if (r?.room.closed) r = null;
        if (!r && store?.has(code)) {
          try { r = wake(code, nowMs); } catch (e) { log('room.wake.fail', { code, msg: String(e?.message).slice(0, 200) }); return say({ type: 'refused', why: 'no such room' }); }
          if (!r) return say({ type: 'refused', why: 'busy' });
        }
        if (!r && opt.dev && m.create) r = open(code, { seed: Number.isInteger(m.create.seed) ? m.create.seed : 1, save: typeof m.create.save === 'string' ? m.create.save : null, paused: !!m.create.paused });
        if (!r) { counts.wrongCodes++; return say({ type: 'refused', why: 'no such room' }); }
        return into(r, nowMs);
      }
      return strike(5);
    }
    function hello(m, nowMs) {
      if (m.type !== 'hello') return strike(5);
      if (m.v !== PROTOCOL) { say({ type: 'refused', why: 'update' }); hang(); return; }
      if (typeof m.token !== 'string' || !TOKEN.test(m.token)) { say({ type: 'refused', why: 'bad hello' }); hang(); return; }
      me.token = m.token; me.name = cleanName(m.name);
      if (m.ticket && redeem) {
        redeem(String(m.ticket)).then(u => {       // an account is the only thing that outlives a browser: the same seat on your phone and your PC
          if (u) { me.account = { id: u.id, name: u.name ?? u.username ?? '' }; me.token = `acct:${u.id}`; if (!me.name) me.name = cleanName(me.account.name); }
        }).catch(() => {}).finally(() => { me.hello = true; for (const q of me.wait.splice(0)) first(q, nowMs); });
        return;
      }
      me.hello = true;
    }
    return {
      message(text, nowMs) {
        if (me.gone) return;
        if (!me.bucket.take(nowMs)) { counts.badFrames++; strike(1); return; }
        const limit = me.code ? LIMITS.frame : LIMITS.saveFrame;
        if (typeof text !== 'string' || text.length > limit) { counts.badFrames++; strike(25); return; }
        let m;
        try { m = JSON.parse(text); } catch { counts.badFrames++; strike(5); return; }
        if (m === null || typeof m !== 'object' || Array.isArray(m)) { counts.badFrames++; strike(5); return; }
        try {
          if (!me.token) return hello(m, nowMs);
          if (!me.code) { if (!me.hello) { if (me.wait.length < 4) me.wait.push(m); return; } return first(m, nowMs); }
          const r = rooms.get(me.code);
          if (!r) return shut('room closed');
          const ok = r.room.message(me.id, m, nowMs);
          if (ok === false) { counts.badFrames++; strike(1); }
          if (m.type === 'takeHome' && r.room.closing && r.room.seats.get(me.id)?.host) { close(r, nowMs, { keep: false }); log('room.home', { code: r.code }); }
        } catch (e) { counts.errors++; log('message.fail', { msg: String(e?.stack ?? e).slice(0, 300) }); strike(10); }
      },
      closed(nowMs) {
        if (me.gone) return;
        me.gone = true; sockets.delete(me);
        if (--row.sockets <= 0) row.sockets = 0;
        const r = me.code ? rooms.get(me.code) : null;
        if (r) r.room.drop(me.id, nowMs, say);
      },
      get info() { return { code: me.code, id: me.id }; },
    };
  }

  const self = {
    accept, rooms, counts,
    pump(nowMs) {
      last = nowMs;
      if (ips.size > 5000) for (const [ip, r] of ips) if (!r.sockets) ips.delete(ip);       // a long-lived server should not keep every address it has ever seen
      for (const s of sockets) if (!s.code && !s.gone && !s.told && nowMs - s.born > opt.helloMs) { s.told = true; s.hang(); }      // a socket that never says who it is
      for (const r of rooms.values()) {
        try { r.room.pump(nowMs); r.errors = 0; } catch (e) {
          counts.errors++; log('room.pump.fail', { code: r.code, msg: String(e?.stack ?? e).slice(0, 300) });
          if (++r.errors >= opt.maxErrors) { for (const c of r.room.seats.values()) if (c.online) c.send({ type: 'closed', why: 'broken' }); rooms.delete(r.code); for (const c of r.room.seats.values()) if (c.online) c.close?.(); continue; }
        }
        if (r.room.clients) r.emptyAt = 0; else if (!r.emptyAt) r.emptyAt = nowMs;
        if (r.emptyAt && nowMs - r.emptyAt > opt.sleepEmptyMs) { close(r, nowMs); log('room.sleep', { code: r.code, why: 'empty' }); continue; }
        if (r.room.clients && r.room.lastInput && nowMs - r.room.lastInput > opt.sleepIdleMs) { for (const c of r.room.seats.values()) if (c.online) c.send({ type: 'closed', why: 'idle' }); close(r, nowMs); log('room.sleep', { code: r.code, why: 'idle' }); continue; }
        if (store && nowMs - r.savedAt > opt.autosaveMs) { r.savedAt = nowMs; store.save(r.code, r.room.dump(nowMs), Date.now(), e => { if (e) log('room.save.fail', { code: r.code, msg: String(e.message) }); }); }
      }
    },
    /** What "Find a game" shows: public rooms only, and only what a stranger should see. */
    list: () => [...rooms.values()].filter(r => r.room.settings.public && !r.room.closed && r.room.players < LIMITS.players).map(r => { const s = r.room.summary(); return { code: r.code, name: s.name, players: s.players, day: s.day }; }),
    status: () => ({ rooms: rooms.size, players: [...rooms.values()].reduce((n, r) => n + r.room.clients, 0), sockets: sockets.size, onDisk: store?.count() ?? 0, counts }),
    /** A restart: every room saved, then everyone told to come back. */
    shutdown() { for (const r of [...rooms.values()]) { for (const c of r.room.seats.values()) if (c.online) c.send({ type: 'closed', why: 'restart' }); try { close(r, last, { sync: true }); } catch (e) { log('room.save.fail', { code: r.code, msg: String(e?.message) }); } } },
  };
  return self;
}
