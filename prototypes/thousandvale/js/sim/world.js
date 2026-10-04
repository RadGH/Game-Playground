// The server sim (stream A): gateway + province process in one object (stage 1, PLAN §8.1). Pure — no
// DOM, no Node APIs — so the same code runs in a Web Worker (js/sim/worker.js), under Node with `ws`
// (server/main.mjs) and in-process for tests (js/sim/loopback.js).
//
//   const world = createWorld({ store, terrain, build, createRules, classes, now, log, ... })
//   await world.init()
//   const h = world.accept('/gw' | '/p/0', conn)   conn = { send(stringOrBytes), close(code, reason), ip? }
//   h.message(data) ; h.close()                    feed frames in / tell it the socket closed
//   world.step()                                   one 20 Hz tick (the host schedules it)
//   world.status() ; await world.shutdown()
//
// ROOMS (PLAN §8.2, M1): one zone = a TOWN hub room (never copied, shared by every copy), WILDS copies
// (a new copy opens when every copy is at `copyCap`; extra copies close when empty), and DUNGEON
// INSTANCES (one per party, made on entry, torn down after `instanceIdleMs` empty). A player moves
// between rooms by walking through the town edge or using a portal/exit object; the move keeps the
// character's state (hp, mana, the rules' cooldowns) and is announced to the client as a new `joined`
// with `handoff` set (same game socket).
//
// SERVICES on the gateway socket: parties (+ the "join my party" code), party chat, ignore lists.

import { PROTOCOL_VERSION, TICK_MS, CODES, parseFrame, createBuckets, cleanName, cleanCode, PARTY_OPS, ITEM_OPS, CHAT_CHANNELS, STATE } from '../net/protocol.js';
import { createRoom } from './room.js';
import { createRules as rulesV0 } from './rules-v0.js';
import { createTickStats } from './tickstats.js';
import { randomHex } from './sha256.js';
import { createParties } from './party.js';
import { createEconomyLog } from './economy.js';
import { findTown, findDoor, townGate, wildsCamps } from './realm.js';
import { planDungeon as planStandIn, dungeonTerrain, dungeonRoomSpec, describeDungeon } from './dungeon.js';

const TICKET_MS = 30000, LEASE_MS = 30000, HEARTBEAT_MS = 10000;
const BAD_LIMIT = 20, BAD_WINDOW_MS = 10000;
const FLOOD_LIMIT = 300;               // over-rate messages are dropped quietly; this many in BAD_WINDOW_MS is a flood
export const BAG_MAX = 120;
export const TOWN_EDGE = 2;              // metres of hysteresis at the town edge (no flapping)
export const TARGET_RANGE = 60;          // a Tab target must be this close
const RARE = new Set(['rare', 'unique', 'legendary', 'set']);

export function createWorld(opts) {
  const {
    store, terrain, build = 'dev', seed = 1, createRules = rulesV0, classes = null,
    now = () => Date.now(), wallNow = () => Date.now(), log = () => {}, processName = 'p0', lingerMs = 5000, saveEveryMs = 10000,
    perfNow = now, copyCap = 300, copyIdleMs = 5 * 60000, instanceIdleMs = 30 * 60000, dungeonLevel = 3,
    planDungeon = planStandIn, filterText = t => t, chestResetMs = 30 * 60000, zoneName = 'The Test Vale',
  } = opts;
  const owner = processName + ':' + randomHex(4);
  const bootNonce = randomHex(4);
  let uidN = 0;
  const newUid = () => `${processName}-${bootNonce}-${(++uidN).toString(36)}`;
  const classSet = classes ? new Set(classes) : null;
  const tickets = new Map();     // ticket -> { char, account, exp, near }
  const online = new Map();      // char id -> o = { char, fence, entity, room, conn|null, lingerUntil, dirty, saving, savePending, lastSaveAt, homeCopy }
  const sessions = new Set();
  const gwByChar = new Map();    // char id -> gateway session (party + chat delivery)
  const names = new Map();       // char id -> { name, cls, level } (party rosters for offline members)
  const tickStats = createTickStats({ tickMs: TICK_MS });
  const counters = { msgsIn: 0, bytesIn: 0, bytesOut: 0, bad: 0, saves: 0, saveFails: 0, saveMs: 0, kicks: 0, logins: 0, transfers: 0, instancesMade: 0, instancesClosed: 0, copiesMade: 0 };
  const rateWin = { at: now(), msgsIn: 0, bytesOut: 0, perSec: { msgsIn: 0, bytesOut: 0 } };
  const parties = createParties();
  const econ = createEconomyLog({ now: wallNow });
  let lastHeartbeat = now(), lastEconFlush = now(), lastPartySweep = now(), ticks = 0;
  const started = now();

  // ---- the zone's rooms ----
  const town = findTown(terrain, opts.townRadius);
  const door = findDoor(terrain, town);
  const gate = townGate(terrain, town, door);
  const camps = opts.camps || wildsCamps(terrain, town, door);
  const rooms = new Map();
  const copies = [];
  const instances = new Map();   // key -> room
  let instanceN = 0, clock = 0;

  const roomHooks = {
    log,
    dirty: (ch, urgent) => { const o = online.get(ch.id); if (o) { o.dirty = true; if (urgent) saveNow(o); } },
    award: (e, a) => { const o = e.char && online.get(e.char.id); if (o && o.entity === e) grant(o, { ...a, goldAdded: true }); },
    newUid,
    // a rules module that announces loot itself ({type:'loot', to, items}) gets the items granted here
    loot: (ev, r) => { const e = r.entities.get(ev.to); const o = e && e.char && online.get(e.char.id); if (o && o.entity === e) grant(o, { items: ev.items, gold: 0, reason: 'kill', goldAdded: true }); },
  };
  function makeRoom(spec) {
    const r = createRoom({ terrain, seed, createRules, hooks: roomHooks, ...spec });
    rooms.set(r.id, r);
    return r;
  }
  const townRoom = makeRoom({ id: 'town', name: town.name, kind: 'town', camps: [], area: { x: town.x, z: town.z, r: town.r }, spawn: { x: town.x, z: town.z } });
  function makeCopy() {
    const n = copies.length ? Math.max(...copies.map(c => c.meta.n)) + 1 : 1;
    const r = makeRoom({
      id: 'wilds:' + n, name: zoneName, kind: 'wilds', camps, spawn: gate,
      safeZones: [{ x: town.x, z: town.z, r: town.r }], meta: { n, emptySince: 0 },
      objects: [{ type: 'portal', name: 'Barrow entrance', x: door.x, z: door.z, portal: { to: 'dungeon' } }],
      describeExtra: { town: { x: town.x, z: town.z, r: town.r, name: town.name } },
    });
    copies.push(r); counters.copiesMade++;
    return r;
  }
  makeCopy();
  const room = copies[0];          // the first copy (back-compat for tests and status)

  const players = r => r.clients.size + [...online.values()].filter(o => o.room === r && !o.conn).length;

  /** The wilds copy a character should be in: party leader's, else the one they were in, else the fullest under the cap. */
  function pickCopy(ch, o = null) {
    const p = parties.of(ch.id);
    if (p) {
      for (const m of p.members) {
        if (m === ch.id) continue;
        const mo = online.get(m);
        if (mo && mo.room.kind === 'wilds' && players(mo.room) < Math.ceil(copyCap * 1.2)) return mo.room;
      }
    }
    if (o && o.homeCopy && rooms.has(o.homeCopy.id) && players(o.homeCopy) < copyCap) return o.homeCopy;
    let best = null;
    for (const c of copies) if (players(c) < copyCap && (!best || players(c) > players(best))) best = c;
    return best || makeCopy();
  }

  function canEnter(inst, ch) {
    if (inst.meta.allowed.has(ch.id)) return true;
    const p = parties.of(ch.id);
    return !!(p && inst.meta.party === p.id);
  }

  function makeInstance(key, partyId, allowed) {
    const n = ++instanceN;
    const dseed = (seed * 7919 + n * 104729 + (++clock)) >>> 0;
    const plan = planDungeon(dseed, { floors: 2, level: dungeonLevel });
    const dterr = dungeonTerrain(plan);
    const spec = dungeonRoomSpec(plan, { exitTo: { room: 'wilds', x: door.x + 3, z: door.z + 3 } });
    const r = createRoom({
      id: 'i:' + n, name: 'The Barrow', kind: 'instance', terrain: dterr, seed: dseed, createRules, hooks: roomHooks,
      camps: spec.camps, objects: spec.objects, spawn: plan.floors[0].entry,
      meta: { key, party: partyId, allowed: new Set(allowed), emptySince: 0, plan, made: now() },
      describeExtra: { dungeon: describeDungeon(plan) },
    });
    rooms.set(r.id, r); instances.set(key, r); counters.instancesMade++;
    return r;
  }
  function closeRoom(r) {
    rooms.delete(r.id);
    if (r.kind === 'instance') { instances.delete(r.meta.key); counters.instancesClosed++; }
    if (r.kind === 'wilds') copies.splice(copies.indexOf(r), 1);
    try { r.rules.dispose && r.rules.dispose(); } catch (err) { log('dispose failed', err && err.message); }
  }

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
        counters.bytesOut += d.length;
        try { conn.send(d); } catch { /* socket gone; close() will follow */ }
      },
      kick(code) { if (s.closed) return; counters.kicks++; s.sendJSON({ t: 'kick', code, msg: CODES[code] || code }); s.closeSoon(code); },
      closeSoon(reason) { if (s.closed) return; try { conn.close(4000, String(reason)); } catch { /* ignore */ } handleClose(s); },
      err(code, msg) { s.sendJSON({ t: 'err', code, msg: msg || CODES[code] || code }); },
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
    if (!s.buckets.take(m.t)) {           // mashing a key is not abuse: drop it; only a flood gets you kicked
      counters.rateDrops = (counters.rateDrops || 0) + 1;
      const t = now();
      s.flood ||= [];
      s.flood.push(t);
      while (s.flood.length && s.flood[0] < t - BAD_WINDOW_MS) s.flood.shift();
      if (s.flood.length >= FLOOD_LIMIT) s.kick('abuse');
      return 'rate';
    }
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
    s.sendJSON({ t: 'welcome', v: PROTOCOL_VERSION, build, server: 'thousandvale', tickMs: TICK_MS, time: ticks * TICK_MS });
  }
  function pong(s, m) { s.sendJSON({ t: 'pong', c: m.c, s: ticks * TICK_MS, k: ticks }); }

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
        }, err => { log('guest failed', err); s.state = 'anon'; s.err('auth'); });
      case 'auth':
        if (s.state !== 'anon') return bad(s, 'order');
        s.state = 'busy';
        return store.authToken(m.token).then(a => {
          if (!a) { s.state = 'anon'; return s.err('auth'); }
          s.account = a.account; s.state = 'authed'; counters.logins++;
          s.sendJSON({ t: 'authed', account: a.account, claimed: a.claimed });
        }, err => { log('auth failed', err); s.state = 'anon'; s.err('auth'); });
      case 'chars':
        if (s.state !== 'authed') return bad(s, 'order');
        return store.listChars(s.account).then(chars => s.sendJSON({ t: 'charList', chars }));
      case 'create': {
        if (s.state !== 'authed') return bad(s, 'order');
        const name = cleanName(m.name);
        if (!name) return s.err('name');
        if (classSet ? !classSet.has(m.cls) : !/^[a-z][a-z0-9_]{1,31}$/.test(m.cls)) return s.err('cls');
        let look = null;
        if (m.look) { const j = JSON.stringify(m.look); if (j.length > 4096) return s.err('state', 'Look too big.'); look = JSON.parse(j); }
        return store.createChar(s.account, { name, cls: m.cls, look }).then(r => {
          if (r.err) return s.err(r.err);
          s.sendJSON({ t: 'created', char: r.char });
        });
      }
      case 'play': {
        if (s.state !== 'authed') return bad(s, 'order');
        return store.listChars(s.account).then(chars => {
          const c = chars.find(x => x.id === m.char);
          if (!c) return s.err('state', 'No such character.');
          bindGateway(s, c);
          let near = null;
          if (m.join !== undefined) {
            const code = cleanCode(m.join);
            const r = code ? parties.join(c.id, code) : { ok: false, why: 'noCode' };
            if (!r.ok) s.err(r.why);
            else {
              partyChanged(r.changed);
              const lead = r.party.leader !== c.id ? r.party.leader : r.party.members.find(x => x !== c.id);
              if (lead && online.get(lead)) near = lead;
            }
          }
          const ticket = randomHex(16);
          tickets.set(ticket, { char: c.id, account: s.account, exp: now() + TICKET_MS, near });
          s.sendJSON({ t: 'ticket', path: '/p/0', ticket, room: 'zone' });
          const p = parties.of(c.id);
          if (p) s.sendJSON({ t: 'partyState', party: partyView(p) });
        });
      }
      case 'party': return onParty(s, m);
      case 'chat': return onChat(s, m);
      case 'ignore': return onIgnore(s, m);
      case 'leave': return s.closeSoon('leave');
      default: return bad(s, 'socket');
    }
  }
  function bindGateway(s, c) {
    if (s.charId && gwByChar.get(s.charId) === s) gwByChar.delete(s.charId);
    s.charId = c.id;
    gwByChar.set(c.id, s);
    names.set(c.id, { name: c.name, cls: c.cls, level: c.level });
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
    const e = o.entity, r = o.room;
    switch (m.t) {
      case 'in': return r.input(e, m);
      case 'target': {
        if (m.id) {
          const t = r.entities.get(m.id);
          const why = !t ? 'target' : t.kind === 'object' ? 'target' : Math.hypot(t.x - e.x, t.z - e.z) > TARGET_RANGE ? 'range' : null;
          if (why) { s.sendJSON({ t: 'targetR', id: m.id, ok: false, why }); return; }
        }
        r.intent(e, m);
        return;
      }
      case 'cast': {
        const msg = m.held !== undefined ? { ...m, held: Math.max(0, Math.min(5, m.held)) } : m;
        const res = r.intent(e, msg);
        if (res && res.ok === false) {
          const out = { t: 'castR', slot: m.slot, ok: false, why: res.why || 'unknown' };
          if (res.text) out.text = String(res.text).slice(0, 200);
          s.sendJSON(out);
        }
        return;
      }
      case 'say': {
        if (muted(o.char)) return s.err('muted');
        const text = clean(m.text);
        if (text) r.say(e, text, rc => !ignores(rc, o.char.id));
        return;
      }
      case 'respawn': return respawn(o);
      case 'use': return use(o, m.id);
      case 'item': return itemOp(o, m);
      default: return bad(s, 'socket');
    }
  }

  function clean(text) { return filterText(String(text).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 200); }
  const muted = ch => (ch.mutedUntil || 0) > wallNow();
  const ignores = (ch, fromId) => !!(ch && ch.ignore && ch.ignore.some(i => i.id === fromId));

  // ---- entering the world ----
  function enter(s, m) {
    if (s.state !== 'await') return bad(s, 'order');
    const tk = tickets.get(m.ticket);
    tickets.delete(m.ticket);
    if (!tk || tk.exp < now()) { s.err('ticket'); return s.closeSoon('ticket'); }
    s.state = 'busy'; s.account = tk.account; s.charId = tk.char;
    const existing = online.get(tk.char);
    if (existing) { takeOver(existing, s, tk); return; }
    return store.takeChar(tk.account, tk.char, owner, LEASE_MS).then(r => {
      if (s.closed) { if (!r.err) store.releaseChar(tk.char, owner); return; }
      if (r.err) { s.err('state', r.err === 'lease' ? 'That character is still logged in elsewhere. Try again in a few seconds.' : 'No such character.'); return s.closeSoon(r.err); }
      const again = online.get(tk.char);
      if (again) { takeOver(again, s, tk); return; }
      const ch = r.char;
      names.set(ch.id, { name: ch.name, cls: ch.cls, level: ch.level });
      const place = placeFor(ch, tk.near);
      const client = makeClient(s);
      const o = { char: ch, fence: r.fence, entity: null, room: place.room, conn: s, lingerUntil: 0, dirty: false, saving: false, savePending: false, lastSaveAt: now(), homeCopy: null };
      online.set(ch.id, o);
      o.entity = place.room.addPlayer(ch, client, place.at);
      tagParty(o);
      if (place.room.kind === 'wilds') o.homeCopy = place.room;
      s.state = 'in'; s.client = client;
      joined(s, o);
      partyChanged([parties.of(ch.id)]);
    }, err => { log('takeChar failed', err); s.err('state', 'Could not load the character.'); s.closeSoon('load'); });
  }

  /** Where a character appears on login: next to the party leader (join link), its saved room, or town. */
  function placeFor(ch, near) {
    if (near) {
      const lo = online.get(near);
      if (lo && lo.entity && (lo.room.kind !== 'instance' || canEnter(lo.room, ch))) return { room: lo.room, at: { x: lo.entity.x + 1.5, z: lo.entity.z + 1 } };
    }
    const rid = ch.room;
    if (rid === 'town') return { room: townRoom, at: Number.isFinite(ch.x) ? { x: ch.x, z: ch.z } : null };
    if (rid && rid.startsWith('i:')) {
      const inst = rooms.get(rid);
      if (inst && canEnter(inst, ch)) return { room: inst, at: Number.isFinite(ch.x) ? { x: ch.x, z: ch.z } : null };
      const back = ch.exit || gate;
      ch.exit = null;
      return { room: pickCopy(ch), at: { x: back.x, z: back.z } };
    }
    if (rid && rid.startsWith('wilds') && Number.isFinite(ch.x)) return { room: pickCopy(ch), at: { x: ch.x, z: ch.z } };
    return { room: townRoom, at: null };
  }

  function takeOver(o, s, tk) {
    const old = o.conn;
    if (old && old !== s) { o.conn = null; old.charId = null; old.kick('elsewhere'); }
    const client = makeClient(s);
    o.room.attach(o.entity, client);
    o.conn = s; o.lingerUntil = 0;
    s.state = 'in'; s.client = client;
    joined(s, o);
    void tk;
  }

  function makeClient(s) {
    return {
      send: d => s.send(d),
      you: patch => s.sendJSON({ t: 'you', ...patch }),
    };
  }

  function joined(s, o, handoff = null) {
    const e = o.entity, ch = o.char, rules = o.room.rules;
    const t = wallNow();
    const msg = {
      t: 'joined', room: o.room.describe(), tickMs: TICK_MS, tick: o.room.tick, time: o.room.now(),
      you: {
        id: e.id, char: ch.id, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp || 0,
        xpNext: rules.xpFor ? rules.xpFor((ch.level || 1) + 1) : null, gold: ch.gold || 0,
        x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, hpMax: e.hpMax, mp: Math.round(e.mp), mpMax: e.mpMax,
        bag: ch.bag || [], equipment: equipView(o), ignore: ch.ignore || [],
        opened: Object.keys(ch.opened || {}).filter(k => ch.opened[k] > t),
      },
    };
    if (handoff) msg.handoff = handoff;
    s.sendJSON(msg);
  }

  // ---- moving between rooms ----
  /** Move a character to another room (or another spot in this one), keeping its state. */
  function transfer(o, to, at, via) {
    const from = o.room, old = o.entity;
    if (to === from) {
      old.moveTo(at.x, at.z);
      const c = from.clients.get(old.id); if (c) c.selfDirty = true;
      return;
    }
    syncChar(o);
    const carry = old.r;
    const client = from.clients.get(old.id) || (o.conn && o.conn.client);
    from.remove(old);
    o.room = to;
    o.entity = to.addPlayer(o.char, client || null, { x: at.x, z: at.z, carry });
    if (!client) to.detach(o.entity);
    tagParty(o);
    if (to.kind === 'wilds') o.homeCopy = to;
    o.dirty = true;
    counters.transfers++;
    if (o.conn && client) { o.conn.client = client; joined(o.conn, o, { from: from.id, via }); }
    partyChanged([parties.of(o.char.id)], true);
  }

  function respawn(o) {
    const e = o.entity;
    if (!e.dead) return;
    if (o.room.kind === 'instance') { o.room.respawn(e); return; }
    e.revive(1);
    o.room.rules.respawn && safeRules(o.room, 'respawn', e);
    o.char.hp = e.hpMax;
    transfer(o, townRoom, { x: town.x, z: town.z }, 'respawn');
  }
  function safeRules(r, fn, ...a) { try { return r.rules[fn](...a); } catch (err) { log('rules ' + fn, err && err.message); return undefined; } }

  /** Town edge: walk in -> the town room; walk out -> your wilds copy. Every 5th tick. */
  function checkEdges() {
    for (const o of online.values()) {
      if (!o.conn || o.entity.dead) continue;
      const e = o.entity;
      const d = Math.hypot(e.x - town.x, e.z - town.z);
      if (o.room.kind === 'wilds' && d < town.r - TOWN_EDGE) transfer(o, townRoom, { x: e.x, z: e.z }, 'gate');
      else if (o.room === townRoom && d > town.r + TOWN_EDGE) transfer(o, pickCopy(o.char, o), { x: e.x, z: e.z }, 'gate');
    }
  }

  function use(o, id) {
    const e = o.entity, s = o.conn;
    if (e.dead) return s.sendJSON({ t: 'used', id, ok: false, why: 'dead' });
    const r = o.room.objectNear(e, id);
    if (r.why) return s.sendJSON({ t: 'used', id, ok: false, why: r.why, msg: CODES[r.why] });
    const obj = r.o, d = obj.data || {};
    if (d.portal) {
      s.sendJSON({ t: 'used', id, ok: true, kind: obj.type });
      if (d.portal.to === 'here') return transfer(o, o.room, { x: d.portal.x, z: d.portal.z }, 'stairs');
      if (d.portal.to === 'wilds') { const back = { x: d.portal.x, z: d.portal.z }; o.char.exit = null; return transfer(o, pickCopy(o.char, o), back, 'exit'); }
      if (d.portal.to === 'dungeon') return enterDungeon(o, obj);
    }
    if (d.chest) return openChest(o, obj);
    return s.sendJSON({ t: 'used', id, ok: false, why: 'unknown' });
  }

  function enterDungeon(o, doorObj) {
    const ch = o.char, p = parties.of(ch.id);
    const key = p ? 'p' + p.id : 'c' + ch.id;
    let inst = instances.get(key);
    if (!inst) inst = makeInstance(key, p ? p.id : null, p ? p.members : [ch.id]);
    inst.meta.allowed.add(ch.id);
    ch.exit = { x: doorObj.x + 3, z: doorObj.z + 3 };
    transfer(o, inst, inst.spawnPoint, 'portal');
  }

  function openChest(o, obj) {
    const ch = o.char, e = o.entity, c = obj.data.chest, s = o.conn;
    const key = o.room.id + ':' + c.key;
    const t = wallNow();
    ch.opened ||= {};
    for (const k of Object.keys(ch.opened)) if (ch.opened[k] <= t) delete ch.opened[k];
    if ((ch.opened[key] || 0) > t) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'opened', msg: 'You already emptied this chest.' });
    const lvl = c.level || e.level;
    const items = (o.room.rules.rollLoot ? safeRules(o.room, 'rollLoot', e, { level: lvl, tier: c.tier }) : null) || [];
    const gold = Math.round(lvl * 4 + 5);
    ch.gold = (ch.gold || 0) + gold;
    ch.opened[key] = t + (o.room.kind === 'instance' ? 24 * 3600000 : chestResetMs);
    s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'chest' });
    o.room.emit({ type: 'open', to: e.id, d: obj.id, x: obj.x, z: obj.z });
    grant(o, { items, gold, reason: 'chest', goldAdded: true, from: obj });
  }

  // ---- loot + bag (PLAN §6.2, §9.2) ----
  /** Give a character items (each gets a server uid) and log the gold/items as faucets. */
  function grant(o, { items = [], gold = 0, reason = 'kill', goldAdded = false, from = null }) {
    const ch = o.char;
    ch.bag ||= [];
    if (gold && !goldAdded) ch.gold = (ch.gold || 0) + gold;
    const added = [];
    let overflow = 0, urgent = false;
    for (const it of items) {
      if (!it || typeof it !== 'object' || it._granted) continue;
      it._granted = true;
      const item = JSON.parse(JSON.stringify(it)); delete item._granted;
      if (item.uid) item.ruid = item.uid;
      item.uid = newUid();
      if (ch.bag.length >= BAG_MAX) { overflow += Math.max(1, Math.round(item.value || 1)); continue; }
      ch.bag.push(item); added.push(item);
      if (RARE.has(item.rarity)) urgent = true;
    }
    if (overflow) ch.gold = (ch.gold || 0) + overflow;
    const lvl = ch.level || 1;
    if (gold) econ.add('faucet', reason, { gold }, lvl);
    if (added.length) econ.add('faucet', reason, { items: added.length }, lvl);
    if (overflow) econ.add('faucet', 'overflow', { gold: overflow }, lvl);
    if (!added.length && !gold && !overflow) return;
    o.dirty = true;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: added, remove: [], gold: ch.gold });
    if (added.length || gold) o.room.emit({ type: 'loot', to: o.entity.id, d: from ? from.id : o.entity.id, items: added.map(i => ({ uid: i.uid, name: i.name, rarity: i.rarity })), gold: gold || undefined });
    if (urgent) saveNow(o);
  }

  // Equipment belongs to the rules (gear changes the sheet). The rules may implement
  //   equip(e, item, slot) -> { ok, why?, text?, removed: [items] }   unequip(e, slot) -> { ok, item }
  //   gear(e) -> { slot: item }      and restore from e.char.equipment in addEntity.
  // Without them, the server keeps char.equipment as a plain slot -> item map (stand-in).
  function equipView(o) {
    const g = o.room.rules.gear ? safeRules(o.room, 'gear', o.entity) : null;
    return g || o.char.equipment || {};
  }
  function itemOp(o, m) {
    const ch = o.char, s = o.conn, e = o.entity;
    if (!ITEM_OPS.includes(m.op)) return bad(s, 'op');
    ch.bag ||= []; ch.equipment ||= {};
    const rules = o.room.rules;
    const bagIdx = ch.bag.findIndex(i => i.uid === m.uid);
    if (m.op === 'destroy') {
      if (bagIdx < 0) return s.err('item');
      const [it] = ch.bag.splice(bagIdx, 1);
      econ.add('sink', 'destroy', { items: 1 }, ch.level);
      o.dirty = true;
      return s.sendJSON({ t: 'bag', add: [], remove: [it.uid], gold: ch.gold });
    }
    if (m.op === 'equip') {
      if (bagIdx < 0) return s.err('item');
      const item = ch.bag[bagIdx];
      const slot = m.slot || item.slot;
      if (!slot) return s.err('item', 'That cannot be worn.');
      let removed = [];
      if (rules.equip) {
        const r = safeRules(o.room, 'equip', e, item, slot);
        if (!r || !r.ok) return s.err('item', (r && r.text) || 'You cannot wear that.');
        removed = r.removed || [];
      } else {
        if (ch.equipment[slot]) removed.push(ch.equipment[slot]);
        ch.equipment[slot] = item;
      }
      ch.bag.splice(bagIdx, 1);
      for (const it of removed) ch.bag.push(it);
      o.dirty = true;
      s.sendJSON({ t: 'bag', add: removed, remove: [item.uid], gold: ch.gold });
      return s.sendJSON({ t: 'equip', slot, item, equipment: equipView(o) });
    }
    if (m.op === 'unequip') {
      if (ch.bag.length >= BAG_MAX) return s.err('bagFull');
      const eq = equipView(o);
      const slot = m.slot || Object.keys(eq).find(k => eq[k] && eq[k].uid === m.uid);
      if (!slot || !eq[slot] || eq[slot].uid !== m.uid) return s.err('item');
      let item;
      if (rules.unequip) { const r = safeRules(o.room, 'unequip', e, slot); if (!r || !r.ok) return s.err('item', (r && r.text) || 'Not now.'); item = r.item; }
      else { item = ch.equipment[slot]; delete ch.equipment[slot]; }
      ch.bag.push(item);
      o.dirty = true;
      s.sendJSON({ t: 'bag', add: [item], remove: [], gold: ch.gold });
      return s.sendJSON({ t: 'equip', slot, item: null, equipment: equipView(o) });
    }
  }

  // ---- parties ----
  function charOf(s) { return s.charId ? online.get(s.charId) : null; }
  function findOnlineByName(name) {
    const n = String(name || '').toLowerCase();
    for (const o of online.values()) if (o.char.name.toLowerCase() === n) return o;
    return null;
  }
  function partyView(p) {
    return {
      id: p.id, leader: p.leader, code: p.code,
      members: p.members.map(c => { const o = online.get(c), n = names.get(c) || {}; return { char: c, name: o ? o.char.name : n.name, cls: o ? o.char.cls : n.cls, level: o ? o.char.level : n.level, online: !!(o && o.conn) }; }),
    };
  }
  function tagParty(o) {
    const p = parties.of(o.char.id);
    o.entity.data = { ...(o.entity.data || {}), partyId: p ? p.id : null };
    if (o.room.rules.onParty) safeRules(o.room, 'onParty', o.entity, p ? p.id : null);
  }
  function partyChanged(list, quiet = false) {
    for (const p of list) {
      if (!p) continue;
      const view = partyView(p);
      for (const c of p.members) {
        const o = online.get(c);
        if (o && !quiet) tagParty(o);
        const g = gwByChar.get(c);
        if (g && !quiet) g.sendJSON({ t: 'partyState', party: view });
      }
      if (!quiet) for (const c of p.invites) { /* invitees learn through partyInvite */ void c; }
    }
  }
  function onParty(s, m) {
    const o = charOf(s);
    if (!o) return s.err('party', 'Enter the world first.');
    if (!PARTY_OPS.includes(m.op)) return bad(s, 'op');
    const me = o.char.id;
    let r;
    switch (m.op) {
      case 'invite': {
        const to = findOnlineByName(m.name);
        if (!to) return s.err('notFound');
        r = parties.invite(me, to.char.id);
        if (r.ok) { const g = gwByChar.get(to.char.id); if (g) g.sendJSON({ t: 'partyInvite', from: me, name: o.char.name, party: r.party.id }); }
        break;
      }
      case 'accept': r = parties.accept(me, m.char ?? -1); break;      // `char` carries the party id here
      case 'decline': r = parties.decline(me, m.char ?? -1); break;
      case 'join': { const code = cleanCode(m.code); r = code ? parties.join(me, code) : { ok: false, why: 'noCode' }; break; }
      case 'code': r = parties.create(me); r.changed = [r.party]; break;
      case 'leave': {
        r = parties.leave(me);
        if (r.ok) { s.sendJSON({ t: 'partyState', party: null }); tagParty(o); }
        break;
      }
      case 'kick': {
        r = parties.kick(me, m.char);
        if (r.ok) { const g = gwByChar.get(m.char); if (g) g.sendJSON({ t: 'partyState', party: null }); const ko = online.get(m.char); if (ko) tagParty(ko); }
        break;
      }
      case 'lead': r = parties.lead(me, m.char); break;
    }
    if (!r || !r.ok) return s.err(r ? r.why : 'party');
    partyChanged(r.changed || []);
  }
  /** Party frames (PLAN §8.3): health + position of every member, 2 Hz, to every online member. */
  function sendPartyFrames() {
    for (const p of parties.byId.values()) {
      if (p.members.length < 2) continue;
      let anyOn = false;
      const rows = p.members.map(c => {
        const o = online.get(c);
        if (!o) return [c, 0, 0, null, 0, 0, 0, 0, 0];
        anyOn = true;
        const e = o.entity;
        return [c, Math.round(e.hp), e.hpMax, o.room.id, Math.round(e.x * 10) / 10, Math.round(e.z * 10) / 10, e.dead ? 1 : 0, o.conn ? 1 : 0, e.id];
      });
      if (!anyOn) continue;
      const msg = JSON.stringify({ t: 'partyFrames', m: rows });
      for (const c of p.members) { const g = gwByChar.get(c); if (g && online.get(c)) g.send(msg); }
    }
  }
  function sweepParties() {
    for (const p of [...parties.byId.values()]) {
      const anyone = p.members.some(c => online.has(c));
      if (anyone) { p.lastOnline = now(); continue; }
      if (now() - (p.lastOnline || now()) > 15 * 60000) for (const c of [...p.members]) parties.leave(c);
      else p.lastOnline ||= now();
    }
  }

  // ---- chat ----
  function onChat(s, m) {
    const o = charOf(s);
    if (!o) return s.err('state', 'Enter the world first.');
    if (!CHAT_CHANNELS.includes(m.ch)) return bad(s, 'channel');
    if (muted(o.char)) return s.err('muted');
    const text = clean(m.text);
    if (!text) return;
    const p = parties.of(o.char.id);
    if (!p) return s.err('party', 'You are not in a party.');
    const msg = JSON.stringify({ t: 'chat', ch: 'party', from: o.char.id, name: o.char.name, text });
    for (const c of p.members) {
      const mo = online.get(c);
      if (mo && ignores(mo.char, o.char.id)) continue;
      const g = gwByChar.get(c); if (g) g.send(msg);
    }
  }
  function onIgnore(s, m) {
    const o = charOf(s);
    if (!o) return s.err('state', 'Enter the world first.');
    const ch = o.char;
    ch.ignore ||= [];
    if (m.on) {
      const t = findOnlineByName(m.name);
      if (!t) return s.err('notFound');
      if (t.char.id !== ch.id && !ch.ignore.some(i => i.id === t.char.id)) ch.ignore.push({ id: t.char.id, name: t.char.name });
    } else ch.ignore = ch.ignore.filter(i => i.name.toLowerCase() !== m.name.toLowerCase());
    o.dirty = true;
    s.sendJSON({ t: 'ignored', list: ch.ignore });
  }
  /** Admin hook: mute a character's chat until `untilMs` (wall clock). */
  function mute(charId, untilMs) { const o = online.get(charId); if (!o) return false; o.char.mutedUntil = untilMs; o.dirty = true; return true; }

  function handleClose(s) {
    if (s.closed) return;
    s.closed = true;
    sessions.delete(s);
    if (s.kind === 'gw') { if (s.charId && gwByChar.get(s.charId) === s) gwByChar.delete(s.charId); return; }
    if (!s.charId) return;
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
    if (o.room.rules.saveGear) { const g = safeRules(o.room, 'saveGear', e); if (g !== undefined) ch.equipment = g; }
  }
  function sig(o) { const e = o.entity, ch = o.char; return [Math.round(e.x * 4), Math.round(e.z * 4), e.hp, ch.xp, ch.gold, ch.level, o.room.id, (ch.bag || []).length].join(','); }
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
    partyChanged([parties.of(o.char.id)]);
    o.loggingOut = Promise.resolve(saveNow(o)).then(() => store.releaseChar(o.char.id, owner));
    return o.loggingOut;
  }

  // ---- tick ----
  function step() {
    const t0 = perfNow();
    ticks++;
    for (const r of rooms.values()) r.step();
    if (ticks % 5 === 0) checkEdges();
    if (ticks % 10 === 0) sendPartyFrames();
    const t = now();
    for (const o of online.values()) {
      if (!o.conn && o.lingerUntil && o.lingerUntil <= t) { logout(o); continue; }
      if (!o.saving && t - o.lastSaveAt >= saveEveryMs && (o.dirty || sig(o) !== o.lastSig)) saveNow(o);
    }
    if (ticks % 20 === 0) closeEmptyRooms(t);
    if (t - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = t;
      const ids = [...online.keys()];
      if (ids.length) store.heartbeat(owner, ids, LEASE_MS).catch(err => log('heartbeat failed', err && err.message));
      for (const [k, v] of tickets) if (v.exp < t) tickets.delete(k);
    }
    if (t - lastEconFlush >= 60000) { lastEconFlush = t; flushEconomy(); }
    if (t - lastPartySweep >= 30000) { lastPartySweep = t; sweepParties(); }
    if (t - rateWin.at >= 1000) {
      const secs = (t - rateWin.at) / 1000;
      rateWin.perSec = { msgsIn: Math.round(rateWin.msgsIn / secs), bytesOut: Math.round((counters.bytesOut - rateWin.bytesOut) / secs) };
      rateWin.at = t; rateWin.msgsIn = 0; rateWin.bytesOut = counters.bytesOut;
    }
    const ms = perfNow() - t0;
    tickStats.add(ms);
    return ms;
  }
  function closeEmptyRooms(t) {
    for (const r of [...rooms.values()]) {
      if (r === townRoom || r === copies[0]) continue;
      if (r.kind !== 'instance' && r.kind !== 'wilds') continue;
      if (players(r) > 0) { r.meta.emptySince = 0; continue; }
      if (!r.meta.emptySince) r.meta.emptySince = t;
      const idle = r.kind === 'instance' ? instanceIdleMs : copyIdleMs;
      if (t - r.meta.emptySince >= idle) closeRoom(r);
    }
  }
  function flushEconomy() {
    const rows = econ.drain();
    if (rows.length && store.logEconomy) store.logEconomy(rows).catch(err => log('economy flush failed', err && err.message));
  }

  async function init() {
    await store.init();
    const n = await store.clearLeases(processName + ':');
    if (n) log(`cleared ${n} stale lease(s) from a previous run of ${processName}`);
  }

  async function shutdown(code = 'restart') {
    for (const s of [...sessions]) if (s.kind === 'p') s.kick(code);
    await Promise.all([...online.values()].map(o => logout(o)));
    flushEconomy();
    for (const s of [...sessions]) s.closeSoon(code);
  }

  function status() {
    let rulesErrors = 0;
    for (const r of rooms.values()) rulesErrors += r.stats.rulesErrors;
    return {
      server: 'thousandvale', build, protocol: PROTOCOL_VERSION, process: processName,
      uptime: Math.round((now() - started) / 1000),
      ccu: [...online.values()].filter(o => o.conn).length, online: online.size,
      rooms: [...rooms.values()].map(r => {
        let monsters = 0; for (const e of r.entities.values()) if (e.kind === 'monster') monsters++;
        return { id: r.id, kind: r.kind, name: r.name, players: r.clients.size, monsters, entities: r.entities.size, tick: r.tick };
      }),
      copies: copies.length, instances: instances.size, parties: parties.byId.size,
      tick: tickStats.summary(),
      msgsInPerSec: rateWin.perSec.msgsIn, bytesOutPerSec: rateWin.perSec.bytesOut,
      bad: counters.bad, rateDrops: counters.rateDrops || 0, kicks: counters.kicks, logins: counters.logins, transfers: counters.transfers,
      rulesErrors,
      saves: { done: counters.saves, failed: counters.saveFails, lastMs: counters.saveMs, inFlight: [...online.values()].filter(o => o.saving).length },
      economy: econ.lastHour(),
      sessions: sessions.size,
      db: store.kind,
    };
  }

  return {
    accept, step, init, shutdown, status, rooms, room, townRoom, copies, instances, online, parties, econ, tickStats, owner, counters,
    saveNow, logout, transfer, grant, mute, town, door, gate, flushEconomy, newUid,
  };
}
