// The server sim (stream A): gateway + province process in one object (stage 1, PLAN §8.1). Pure — no
// DOM, no Node APIs — so the same code runs in a Web Worker (js/sim/worker.js), under Node with `ws`
// (server/main.mjs) and in-process for tests (js/sim/loopback.js).
//
//   const world = createWorld({ store, terrain, build, createRules, classes, camps, now, log })
//   await world.init()
//   const h = world.accept('/gw' | '/p/0', conn)   conn = { send(stringOrBytes), close(code, reason), ip? }
//   h.message(data) ; h.close()                    feed frames in / tell it the socket closed
//   world.step()                                   one 20 Hz tick (the host schedules it)
//   world.status() ; await world.shutdown()

import { PROTOCOL_VERSION, TICK_MS, CODES, parseFrame, createBuckets, cleanName } from '../net/protocol.js';
import { createRoom } from './room.js';
import { createRules as rulesV0 } from './rules-v0.js';
import { createTickStats } from './tickstats.js';
import { randomHex } from './sha256.js';

const TICKET_MS = 30000, LEASE_MS = 30000, HEARTBEAT_MS = 10000;
const BAD_LIMIT = 20, BAD_WINDOW_MS = 10000;

/** The M0 room's monster camps (a few wolf packs around the spawn). */
export function defaultCamps(spawn) {
  const out = [];
  const rings = [[25, 10], [-35, 30], [20, -45], [70, 60], [-90, -40], [130, -20]];
  rings.forEach(([dx, dz], i) => out.push({ type: 'wolf', level: 1 + (i >> 1), x: spawn.x + dx, z: spawn.z + dz, count: 3 + (i % 2), radius: 10, respawnMs: 30000 }));
  return out;
}

export function createWorld(opts) {
  const {
    store, terrain, build = 'dev', seed = 1, createRules = rulesV0, classes = null,
    now = () => Date.now(), log = () => {}, processName = 'p0', lingerMs = 5000, saveEveryMs = 10000,
    roomId = 'vale-test', roomName = 'The Test Vale', perfNow = now,
  } = opts;
  const owner = processName + ':' + randomHex(4);
  const classSet = classes ? new Set(classes) : null;
  const room = createRoom({
    id: roomId, name: roomName, terrain, seed, createRules,
    camps: opts.camps || defaultCamps(terrain.spawn),
    hooks: { log, dirty: (ch, urgent) => { const o = online.get(ch.id); if (o) { o.dirty = true; if (urgent) saveNow(o); } } },
  });
  const rooms = new Map([[room.id, room]]);
  const tickets = new Map();     // ticket -> { char, account, room, exp }
  const online = new Map();      // char id -> { char, fence, entity, room, conn(session)|null, lingerUntil, dirty, saving, savePending, lastSaveAt }
  const sessions = new Set();
  const tickStats = createTickStats({ tickMs: TICK_MS });
  const counters = { msgsIn: 0, bytesIn: 0, bytesOut: 0, bad: 0, saves: 0, saveFails: 0, saveMs: 0, kicks: 0, logins: 0 };
  const rateWin = { at: now(), msgsIn: 0, bytesOut: 0, perSec: { msgsIn: 0, bytesOut: 0 } };
  let lastHeartbeat = now();
  const started = now();

  // ---------------------------------------------------------------------------------------------
  function accept(path, conn) {
    const kind = path === '/gw' ? 'gw' : /^\/p\/\d+$/.test(path) ? 'p' : null;
    if (!kind) { conn.close(4404, 'no such path'); return { message() {}, close() {} }; }
    const s = {
      kind, conn, state: 'hello', account: null, buckets: createBuckets(now), bad: [], closed: false,
      ip: conn.ip || null, charId: null, client: null,
      sendJSON(o) { s.send(JSON.stringify(o)); },
      send(d) {
        if (s.closed) return;
        counters.bytesOut += typeof d === 'string' ? d.length : d.length;
        try { conn.send(d); } catch { /* socket gone; close() will follow */ }
      },
      kick(code) { if (s.closed) return; counters.kicks++; s.sendJSON({ t: 'kick', code, msg: CODES[code] || code }); s.closeSoon(code); },
      closeSoon(reason) { if (s.closed) return; try { conn.close(4000, String(reason)); } catch { /* ignore */ } handleClose(s); },
    };
    sessions.add(s);
    return {
      message(data) { if (!s.closed) onFrame(s, data); },
      close() { handleClose(s); },
    };
  }

  function bad(s, why) {
    counters.bad++;
    const t = now();
    s.bad.push(t);
    while (s.bad.length && s.bad[0] < t - BAD_WINDOW_MS) s.bad.shift();
    if (s.bad.length >= BAD_LIMIT) s.kick('abuse');
    return why;
  }

  function onFrame(s, data) {
    counters.msgsIn++; rateWin.msgsIn++;
    counters.bytesIn += typeof data === 'string' ? data.length : (data.byteLength || 0);
    const r = parseFrame(data, s.kind);
    if (r.bad) return bad(s, r.bad);
    const m = r.msg;
    if (!s.buckets.take(m.t)) return bad(s, 'rate');
    if (s.state === 'hello' && m.t !== 'hello') return bad(s, 'order');
    try { return s.kind === 'gw' ? onGateway(s, m) : onProvince(s, m); } catch (err) {
      log('handler error', m.t, err && err.stack);
      return bad(s, 'error');
    }
  }

  function hello(s, m) {
    if (m.v !== PROTOCOL_VERSION) { s.sendJSON({ t: 'refuse', code: 'version', msg: CODES.version }); return s.closeSoon('version'); }
    if (m.build !== build) { s.sendJSON({ t: 'refuse', code: 'build', msg: CODES.build }); return s.closeSoon('build'); }
    s.state = s.kind === 'gw' ? 'anon' : 'await';
    s.sendJSON({ t: 'welcome', v: PROTOCOL_VERSION, build, server: 'thousandvale', tickMs: TICK_MS, time: room.now() });
  }
  function pong(s, m) { s.sendJSON({ t: 'pong', c: m.c, s: room.now(), k: room.tick }); }

  // ---- gateway ----
  function onGateway(s, m) {
    switch (m.t) {
      case 'hello': return s.state === 'hello' ? hello(s, m) : bad(s, 'order');
      case 'ping': return pong(s, m);
      case 'guest':
        if (s.state !== 'anon') return bad(s, 'order');
        s.state = 'busy';
        return store.createGuest(m.name ? cleanName(m.name) : null).then(({ account, token }) => {
          s.account = account; s.state = 'authed'; counters.logins++;
          s.sendJSON({ t: 'authed', account, token, claimed: false });
        }, err => { log('guest failed', err); s.state = 'anon'; s.sendJSON({ t: 'err', code: 'auth', msg: CODES.auth }); });
      case 'auth':
        if (s.state !== 'anon') return bad(s, 'order');
        s.state = 'busy';
        return store.authToken(m.token).then(a => {
          if (!a) { s.state = 'anon'; return s.sendJSON({ t: 'err', code: 'auth', msg: CODES.auth }); }
          s.account = a.account; s.state = 'authed'; counters.logins++;
          s.sendJSON({ t: 'authed', account: a.account, claimed: a.claimed });
        }, err => { log('auth failed', err); s.state = 'anon'; s.sendJSON({ t: 'err', code: 'auth', msg: CODES.auth }); });
      case 'chars':
        if (s.state !== 'authed') return bad(s, 'order');
        return store.listChars(s.account).then(chars => s.sendJSON({ t: 'charList', chars }));
      case 'create': {
        if (s.state !== 'authed') return bad(s, 'order');
        const name = cleanName(m.name);
        if (!name) return s.sendJSON({ t: 'err', code: 'name', msg: CODES.name });
        if (classSet ? !classSet.has(m.cls) : !/^[a-z][a-z0-9_]{1,31}$/.test(m.cls)) return s.sendJSON({ t: 'err', code: 'cls', msg: CODES.cls });
        let look = null;
        if (m.look) { const j = JSON.stringify(m.look); if (j.length > 4096) return s.sendJSON({ t: 'err', code: 'state', msg: 'Look too big.' }); look = JSON.parse(j); }
        return store.createChar(s.account, { name, cls: m.cls, look }).then(r => {
          if (r.err) return s.sendJSON({ t: 'err', code: r.err, msg: CODES[r.err] || r.err });
          s.sendJSON({ t: 'created', char: r.char });
        });
      }
      case 'play': {
        if (s.state !== 'authed') return bad(s, 'order');
        return store.listChars(s.account).then(chars => {
          const c = chars.find(x => x.id === m.char);
          if (!c) return s.sendJSON({ t: 'err', code: 'state', msg: 'No such character.' });
          const ticket = randomHex(16);
          tickets.set(ticket, { char: c.id, account: s.account, room: room.id, exp: now() + TICKET_MS });
          s.sendJSON({ t: 'ticket', path: '/p/0', ticket, room: room.id });
        });
      }
      case 'leave': return s.closeSoon('leave');
      default: return bad(s, 'socket');
    }
  }

  // ---- province ----
  function onProvince(s, m) {
    switch (m.t) {
      case 'hello': return s.state === 'hello' ? hello(s, m) : bad(s, 'order');
      case 'ping': return pong(s, m);
      case 'enter': return enter(s, m);
      case 'leave': return s.closeSoon('leave');
    }
    if (s.state !== 'in') return bad(s, 'order');
    const o = online.get(s.charId);
    if (!o || o.conn !== s) return bad(s, 'state');
    const e = o.entity;
    switch (m.t) {
      case 'in': return room.input(e, m);
      case 'cast': case 'target': {
        const r = room.intent(e, m);
        if (m.t === 'cast' && r && r.ok === false) s.sendJSON({ t: 'castR', slot: m.slot, ok: false, why: r.why || 'unknown' });
        return;
      }
      case 'say': {
        const text = m.text.replace(/[\u0000-\u001f\u007f]/g, '').trim();
        if (text) room.say(e, text);
        return;
      }
      case 'respawn': { room.respawn(e); return; }
      default: return bad(s, 'socket');
    }
  }

  function enter(s, m) {
    if (s.state !== 'await') return bad(s, 'order');
    const tk = tickets.get(m.ticket);
    tickets.delete(m.ticket);
    if (!tk || tk.exp < now()) { s.sendJSON({ t: 'err', code: 'ticket', msg: CODES.ticket }); return s.closeSoon('ticket'); }
    s.state = 'busy'; s.account = tk.account; s.charId = tk.char;
    const existing = online.get(tk.char);
    if (existing) { takeOver(existing, s); return; }
    return store.takeChar(tk.account, tk.char, owner, LEASE_MS).then(r => {
      if (s.closed) { if (!r.err) store.releaseChar(tk.char, owner); return; }
      if (r.err) { s.sendJSON({ t: 'err', code: 'state', msg: r.err === 'lease' ? 'That character is still logged in elsewhere. Try again in a few seconds.' : 'No such character.' }); return s.closeSoon(r.err); }
      const again = online.get(tk.char);    // a parallel enter won the race
      if (again) { takeOver(again, s); return; }
      const client = makeClient(s);
      const e = room.addPlayer(r.char, client);
      const o = { char: r.char, fence: r.fence, entity: e, room, conn: s, lingerUntil: 0, dirty: false, saving: false, savePending: false, lastSaveAt: now() };
      online.set(r.char.id, o);
      s.state = 'in'; s.client = client;
      joined(s, o);
    }, err => { log('takeChar failed', err); s.sendJSON({ t: 'err', code: 'state', msg: 'Could not load the character.' }); s.closeSoon('load'); });
  }

  function takeOver(o, s) {
    const old = o.conn;
    if (old && old !== s) { o.conn = null; old.charId = null; old.kick('elsewhere'); }
    const client = makeClient(s);
    o.room.attach(o.entity, client);
    o.conn = s; o.lingerUntil = 0;
    s.state = 'in'; s.client = client;
    joined(s, o);
  }

  function makeClient(s) {
    return {
      send: d => s.send(d),
      you: patch => s.sendJSON({ t: 'you', ...patch }),
    };
  }

  function joined(s, o) {
    const e = o.entity, ch = o.char, rules = o.room.rules;
    s.sendJSON({
      t: 'joined', room: o.room.describe(), tickMs: TICK_MS, tick: o.room.tick, time: o.room.now(),
      you: {
        id: e.id, char: ch.id, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp || 0,
        xpNext: rules.xpFor ? rules.xpFor((ch.level || 1) + 1) : null, gold: ch.gold || 0,
        x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, hpMax: e.hpMax, mp: Math.round(e.mp), mpMax: e.mpMax,
      },
    });
  }

  function handleClose(s) {
    if (s.closed) return;
    s.closed = true;
    sessions.delete(s);
    if (s.kind !== 'p' || !s.charId) return;
    const o = online.get(s.charId);
    if (!o || o.conn !== s) return;
    o.conn = null;
    o.room.detach(o.entity);
    o.lingerUntil = now() + lingerMs;
    if (lingerMs <= 0) logout(o);
  }

  // ---- saving ----
  function syncChar(o) {
    const e = o.entity, ch = o.char;
    ch.x = e.x; ch.y = e.y; ch.z = e.z; ch.yaw = e.yaw; ch.hp = e.dead ? 0 : e.hp; ch.mp = Math.round(e.mp);
    ch.level = e.level; ch.room = o.room.id;
  }
  function sig(o) { const e = o.entity, ch = o.char; return [Math.round(e.x * 4), Math.round(e.z * 4), e.hp, ch.xp, ch.gold, ch.level].join(','); }
  function saveNow(o) {
    if (o.saving) { o.savePending = true; return o.savingP; }
    syncChar(o);
    o.saving = true; o.dirty = false; o.lastSig = sig(o);
    const t0 = now();
    o.savingP = store.saveChar(o.char, o.fence).then(ok => {
      o.saving = false; o.lastSaveAt = now();
      counters.saveMs = now() - t0;
      if (ok) counters.saves++;
      else {
        counters.saveFails++;
        log('save refused (lease lost?)', o.char.id);
        if (o.conn) o.conn.kick('elsewhere');
        online.delete(o.char.id); o.room.remove(o.entity);
        return false;
      }
      if (o.savePending) { o.savePending = false; return saveNow(o); }
      return true;
    }, err => { o.saving = false; counters.saveFails++; log('save failed', err && err.message); return false; });
    return o.savingP;
  }
  function logout(o) {
    if (o.loggingOut) return o.loggingOut;
    online.delete(o.char.id);
    o.room.remove(o.entity);
    o.loggingOut = Promise.resolve(saveNow(o)).then(() => store.releaseChar(o.char.id, owner));
    return o.loggingOut;
  }

  // ---- tick ----
  function step() {
    const t0 = perfNow();
    room.step();
    const t = now();
    for (const o of online.values()) {
      if (!o.conn && o.lingerUntil && o.lingerUntil <= t) { logout(o); continue; }
      if (!o.saving && t - o.lastSaveAt >= saveEveryMs && (o.dirty || sig(o) !== o.lastSig)) saveNow(o);
    }
    if (t - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = t;
      const ids = [...online.keys()];
      if (ids.length) store.heartbeat(owner, ids, LEASE_MS).catch(err => log('heartbeat failed', err && err.message));
      for (const [k, v] of tickets) if (v.exp < t) tickets.delete(k);
    }
    if (t - rateWin.at >= 1000) {
      const secs = (t - rateWin.at) / 1000;
      rateWin.perSec = { msgsIn: Math.round(rateWin.msgsIn / secs), bytesOut: Math.round((counters.bytesOut - rateWin.bytesOut) / secs) };
      rateWin.at = t; rateWin.msgsIn = 0; rateWin.bytesOut = counters.bytesOut;
    }
    const ms = perfNow() - t0;
    tickStats.add(ms);
    return ms;
  }

  async function init() {
    await store.init();
    const n = await store.clearLeases(processName + ':');
    if (n) log(`cleared ${n} stale lease(s) from a previous run of ${processName}`);
  }

  async function shutdown(code = 'restart') {
    for (const s of [...sessions]) if (s.kind === 'p') s.kick(code);
    await Promise.all([...online.values()].map(o => logout(o)));
    for (const s of [...sessions]) s.closeSoon(code);
  }

  function status() {
    const monsters = [...room.entities.values()].filter(e => e.kind === 'monster').length;
    return {
      server: 'thousandvale', build, protocol: PROTOCOL_VERSION, process: processName,
      uptime: Math.round((now() - started) / 1000),
      ccu: [...online.values()].filter(o => o.conn).length, online: online.size,
      rooms: [...rooms.values()].map(r => ({ id: r.id, name: r.name, players: r.clients.size, monsters, entities: r.entities.size, tick: r.tick })),
      tick: tickStats.summary(),
      msgsInPerSec: rateWin.perSec.msgsIn, bytesOutPerSec: rateWin.perSec.bytesOut,
      bad: counters.bad, kicks: counters.kicks, logins: counters.logins,
      rulesErrors: room.stats.rulesErrors,
      saves: { done: counters.saves, failed: counters.saveFails, lastMs: counters.saveMs, inFlight: [...online.values()].filter(o => o.saving).length },
      sessions: sessions.size,
      db: store.kind,
    };
  }

  return { accept, step, init, shutdown, status, rooms, room, online, tickStats, owner, counters, saveNow, logout };
}
