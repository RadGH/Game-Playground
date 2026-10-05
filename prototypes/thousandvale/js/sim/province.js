// A PROVINCE PROCESS (stream A, PLAN §8.1–8.2): owns the game sockets (`/p/<n>`) of everyone in its
// provinces, steps their rooms at 20 Hz, saves them (journal + blobs), and talks to the gateway over a bus.
// Pure — no DOM, no Node APIs: the same code runs in a Web Worker, under Node (server/main.mjs, one child
// process per province process in stage 2) and in-process for tests (js/sim/world.js wires a gateway to
// one of these over a local bus).
//
//   const p = createProvince({ proc, layouts: [buildLayout(…)], store, bus, createRules, now, log, ... })
//   await p.init() ; const h = p.accept('/p/<proc>', conn) ; p.step() ; p.status() ; await p.shutdown()
//
// ROOMS per layout (one province): its TOWNS (hub rooms, one per town circle, never copied, shared by every
// copy), its WILDS copies (a new copy opens when every copy holds `copyCap`; extra copies close when empty)
// and DUNGEON INSTANCES (per party, made on entry, closed `instanceIdleMs` after the last one leaves).
// Room ids are `<province>/town:<i>`, `<province>/wilds:<n>`, `<province>/i:<n>`. A move between rooms
// keeps the character's state and is announced as a fresh `joined` with `handoff` (same socket); a move
// to a province another process holds is a `relocate` (save, release, new ticket, new socket).
//
// Also here: waystones + travel, the realm event's spawn and its free travel, open groups (players fighting
// the same thing get a "Group up" hint), player traces (graves, campfires, door banners, zone deeds,
// footprint heat), the day/night clock, NPC schedules (town folk at work by day, at the inn by night).

import { PROTOCOL_VERSION, TICK_MS, CODES, ITEM_OPS, STATE } from '../net/protocol.js';
import { createRoom } from './room.js';
import { createRules as rulesV0 } from './rules-v0.js';
import { createTickStats } from './tickstats.js';
import { randomHex } from './sha256.js';
import { createEconomyLog } from './economy.js';
import { createSessionKit } from './session.js';
import { dungeonTerrain, dungeonRoomSpec, describeDungeon } from './dungeon.js';
import { JOURNAL_FLUSH_MS } from './journal.js';
import { createTrades, TRADE_OPS, TRADE_RANGE } from './trade.js';
import { planDungeon as planTiers } from '../rules/dungeon-tiers.js';     // stream E's generator (js/sim/dungeon.js keeps the stand-in)

const LEASE_MS = 30000, HEARTBEAT_MS = 10000, TICKET_WAIT_MS = 3000;
export const BAG_MAX = 120;
export const TOWN_EDGE = 2;              // metres of hysteresis at the town edge (no flapping)
export const TARGET_RANGE = 60;          // a Tab target must be this close
export const EDGE_PER_TICK = 3;          // town-edge handoffs done per tick (a crowd crossing together is spread out)
export const SAVES_PER_TICK = 4;         // periodic blob saves started per tick
export const GROUP_R = 40;               // open groups: players hitting the same monster this close (PLAN §5.3)
export const GRAVE_MS = 3600000, CAMPFIRE_MS = 10 * 60000, MAX_GRAVES = 200;
export const ROLES = ['smith', 'merchant', 'elder', 'innkeeper', 'healer', 'unbinder', 'broker'];
const RARE = new Set(['rare', 'unique', 'legendary', 'set']);

export function createProvince(opts) {
  const {
    proc = 0, layouts, store, bus = null, seed = 1, createRules = rulesV0,
    now = () => Date.now(), wallNow = () => Date.now(), log = () => {}, processName = 'p' + proc, lingerMs = 5000, saveEveryMs = 60000,
    journalMs = JOURNAL_FLUSH_MS, tradeMinLevel = 1, perfNow = now,
    copyIdleMs = 5 * 60000, instanceIdleMs = 30 * 60000, dungeonLevel = 3, encounterInfo = {},
    planDungeon = planTiers, filterText = t => t, chestResetMs = 30 * 60000,
    clock: realmClock = { epoch: wallNow(), dayMs: 2 * 3600000 }, travelFare = d => 2 + Math.round(d / 400),
  } = opts;
  const owner = processName + ':' + randomHex(4);
  const bootNonce = randomHex(4);
  let uidN = 0;
  const newUid = () => `${processName}-${bootNonce}-${(++uidN).toString(36)}`;
  const tickets = new Map();     // ticket -> { char, account, exp, near, at }
  const online = new Map();      // char id -> o
  const partyOf = new Map();     // char id -> { id, leader, members } (from the gateway)
  const tickStats = createTickStats({ tickMs: TICK_MS });
  const counters = { journalRows: 0, journalFlushes: 0, journalMs: 0, journalRefused: 0, trades: 0, tradeFails: 0, msgsIn: 0, bytesIn: 0, bytesOut: 0, bad: 0, saves: 0, saveFails: 0, saveMs: 0, kicks: 0, transfers: 0, relocations: 0, instancesMade: 0, instancesClosed: 0, copiesMade: 0, travels: 0, hints: 0 };
  const kit = createSessionKit({ now, log, counters });
  const bad = kit.bad;
  const rateWin = { at: now(), bytesOut: 0, msgsIn: 0, perSec: { msgsIn: 0, bytesOut: 0 } };
  const trades = createTrades();
  let jpend = [], jflushing = null, lastJFlush = now();
  const econ = createEconomyLog({ now: wallNow });
  let lastHeartbeat = now(), lastEconFlush = now(), ticks = 0;
  const started = now();
  const send = msg => { if (bus) bus.send(msg); };

  // ---------------------------------------------------------------------------------------------
  // rooms
  const rooms = new Map();
  const P = new Map();           // layout key -> { L, towns: [room], copies: [room], instances: Map, events }
  let instanceN = 0, seedN = 0;
  const roomHooks = {
    log,
    dirty: (ch, urgent) => { const o = online.get(ch.id); if (o) { o.dirty = true; if (urgent) saveNow(o); if (urgent) presence(o); } },
    award: (e, a) => {
      const o = e.char && online.get(e.char.id);
      if (!o || o.entity !== e) return;
      if (a.xp) journal(o, 'xp', { d: a.xp, level: a.level });
      grant(o, { ...a, goldAdded: true });
    },
    newUid,
    loot: (ev, r) => { const e = r.entities.get(ev.to); const o = e && e.char && online.get(e.char.id); if (o && o.entity === e) grant(o, { items: ev.items, gold: 0, reason: 'kill', goldAdded: true }); },
    observe: (ev, r) => observe(ev, r),
  };
  const host = r => r.host;

  for (const L of layouts) {
    const pv = { L, towns: [], copies: [], instances: new Map() };
    P.set(L.key, pv);
    L.towns.forEach((t, i) => {
      const r = createRoom({
        id: `${L.key}/town:${i}`, name: t.name, kind: 'town', terrain: L.terrain, seed, createRules, hooks: roomHooks, encounterInfo,
        area: { x: t.x, z: t.z, r: t.r }, gridArea: { x: t.x, z: t.z, r: t.r + 40 }, spawn: { x: t.x, z: t.z }, camps: [],
        objects: [...townObjects(L, t, i)], meta: { province: L.key, town: i },
        describeExtra: describeFor(L),
      });
      rooms.set(r.id, r); pv.towns.push(r);
    });
    makeCopy(pv);
  }
  const first = P.values().next().value;
  /** back-compat for single-zone tests: the first province's first town / copy */
  const townRoom = first.towns[0], copies = first.copies, instances = first.instances;
  const town = first.L.towns[0], door = first.L.doors[0], gate = first.L.gate;

  function describeFor(L) {
    return {
      province: L.key,
      towns: L.towns.map(t => ({ x: t.x, z: t.z, r: t.r, name: t.name })),
      town: { x: L.towns[0].x, z: L.towns[0].z, r: L.towns[0].r, name: L.towns[0].name },
      waystones: L.waystones.map(w => ({ key: w.key, name: w.name, x: w.x, z: w.z })),
      horizon: { world: 'data/world/world.json', macro: 'data/world/macro.bin', province: L.key },
      zones: L.zones.map(z => ({ key: z.key, bounds: z.bounds || null })),
      clock: realmClock,
    };
  }
  function townObjects(L, t, i) {
    const out = [];
    for (const w of L.waystones) if (w.town === i) out.push({ type: 'waystone', name: 'Waystone', x: w.x, z: w.z, key: w.key, waystone: { key: w.key, name: w.name } });
    // town folk with day and night places (PLAN §4.3): the roles stand round the square by day, at the inn by night
    const inn = { x: t.x - t.r * 0.35, z: t.z + t.r * 0.3 };
    ROLES.forEach((role, k) => {
      const a = k / ROLES.length * Math.PI * 2;
      const day = { x: t.x + Math.cos(a) * t.r * 0.45, z: t.z + Math.sin(a) * t.r * 0.45 };
      const night = role === 'innkeeper' || role === 'healer' || role === 'unbinder' ? day : { x: inn.x + Math.cos(a) * 3, z: inn.z + Math.sin(a) * 3 };
      out.push({ type: 'npc', name: roleName(role), x: day.x, z: day.z, key: `npc:${L.key}:${i}:${role}`, npc: { role, says: [] }, schedule: { day, night } });
    });
    return out;
  }
  function makeCopy(pv) {
    const L = pv.L;
    const n = pv.copies.length ? Math.max(...pv.copies.map(c => c.meta.n)) + 1 : 1;
    const r = createRoom({
      id: `${L.key}/wilds:${n}`, name: L.name, kind: 'wilds', terrain: L.terrain, seed, createRules, hooks: roomHooks, encounterInfo,
      camps: L.camps, spawn: L.gate,
      safeZones: L.towns.map(t => ({ x: t.x, z: t.z, r: t.r })), meta: { n, emptySince: 0, province: L.key },
      objects: [
        ...L.doors.map((d, i) => ({ type: 'portal', name: d.name, x: d.x, z: d.z, yaw: d.yaw, key: `door:${L.key}:${i}`, portal: { to: 'dungeon', door: i } })),
        ...L.waystones.filter(w => w.door !== undefined).map(w => ({ type: 'waystone', name: 'Waystone', x: w.x, z: w.z, key: w.key, waystone: { key: w.key, name: w.name } })),
        ...L.objects,
      ],
      describeExtra: describeFor(L),
    });
    rooms.set(r.id, r); pv.copies.push(r); counters.copiesMade++;
    return r;
  }

  const players = r => r.clients.size + countLingering(r);
  function countLingering(r) { let n = 0; for (const o of online.values()) if (o.room === r && !o.conn) n++; return n; }
  const provOf = r => P.get(r.meta && r.meta.province ? r.meta.province : (r.id.split('/')[0]));
  const partyOfChar = c => partyOf.get(c) || null;

  /** The wilds copy a character should be in: party leader's, else the one they were in, else the fullest under the cap. */
  function pickCopy(ch, o = null, pv = null) {
    pv ||= (o && provOf(o.room)) || first;
    const cap = pv.L.copyCap;
    const p = partyOfChar(ch.id);
    if (p) for (const m of p.members) {
      if (m === ch.id) continue;
      const mo = online.get(m);
      if (mo && mo.room.kind === 'wilds' && provOf(mo.room) === pv && players(mo.room) < Math.ceil(cap * 1.2)) return mo.room;
    }
    if (o && o.homeCopy && rooms.has(o.homeCopy.id) && provOf(o.homeCopy) === pv && players(o.homeCopy) < cap) return o.homeCopy;
    let best = null;
    for (const c of pv.copies) if (players(c) < cap && (!best || players(c) > players(best))) best = c;
    return best || makeCopy(pv);
  }
  function canEnter(inst, ch) {
    if (inst.meta.allowed.has(ch.id)) return true;
    const p = partyOfChar(ch.id);
    return !!(p && inst.meta.party === p.id);
  }
  function makeInstance(pv, key, partyId, allowed, doorIdx) {
    const n = ++instanceN;
    const d = pv.L.doors[doorIdx] || pv.L.doors[0];
    const dseed = (seed * 7919 + n * 104729 + (++seedN)) >>> 0;
    const ds = (d.sheet && d.sheet.dungeon) || {};
    const fams = ds.families || (ds.family ? [ds.family] : null);
    const family = fams && fams.length ? fams[dseed % fams.length] : undefined;
    // no `arenas` option: the encounter engine (stream C) spawns arena objects at the pull (E's ask)
    const plan = planDungeon(dseed, { floors: ds.floors || 2, level: ds.level || dungeonLevel, ...(family ? { family } : {}) });
    const dterr = dungeonTerrain(plan);
    const spec = dungeonRoomSpec(plan, { exitTo: { room: 'wilds', x: d.x + 3, z: d.z + 3 } });
    const r = createRoom({
      id: `${pv.L.key}/i:${n}`, name: plan.name || 'The Barrow', kind: 'instance', terrain: dterr, seed: dseed, createRules, hooks: roomHooks, encounterInfo,
      camps: spec.camps, objects: spec.objects, spawn: plan.floors[0].entry,
      meta: { key, party: partyId, allowed: new Set(allowed), emptySince: 0, plan, made: now(), province: pv.L.key, door: doorIdx },
      describeExtra: { get dungeon() { return describeDungeon(plan, dterr); }, clock: realmClock },
    });
    rooms.set(r.id, r); pv.instances.set(key, r); counters.instancesMade++;
    return r;
  }
  function closeRoom(r) {
    rooms.delete(r.id);
    const pv = provOf(r);
    if (r.kind === 'instance') { pv.instances.delete(r.meta.key); counters.instancesClosed++; }
    if (r.kind === 'wilds') pv.copies.splice(pv.copies.indexOf(r), 1);
    try { r.rules.dispose && r.rules.dispose(); } catch (err) { log('dispose failed', err && err.message); }
  }

  // ---------------------------------------------------------------------------------------------
  // the bus (gateway -> here)
  if (bus) bus.on(m => {
    switch (m.k) {
      case 'ticket': {
        tickets.set(m.ticket, m);
        for (const s of kit.sessions) if (s.state === 'wait' && s.waitTicket === m.ticket) { s.state = 'await'; enter(s, { ticket: m.ticket }); }
        return;
      }
      case 'party': {
        if (m.party) partyOf.set(m.char, m.party); else partyOf.delete(m.char);
        const o = online.get(m.char); if (o) tagParty(o);
        return;
      }
      case 'ignore': { const o = online.get(m.char); if (o) { o.char.ignore = m.list; journal(o, 'set', { k: 'ignore', v: m.list }); o.dirty = true; } return; }
      case 'mute': mute(m.char, m.until); return;
      case 'kick': { const o = online.get(m.char); if (o && o.conn) o.conn.kick(m.code || 'restart'); return; }
      case 'relocated': return relocated(m);
      case 'event': return onEvent(m);
      case 'waystones': remoteWaystones = m.list; return;
    }
  });

  // ---------------------------------------------------------------------------------------------
  // sessions
  function accept(path, conn) {
    if (!/^\/p\/\d+$/.test(path)) { conn.close(4404, 'no such path'); return { message() {}, close() {} }; }
    const s = kit.session('p', conn, handleClose);
    return { message(d) { if (!s.closed) kit.frame(s, d, onMessage); }, close() { s.handleClose(); } };
  }
  function hello(s, m) {
    if (m.v !== PROTOCOL_VERSION) { s.sendJSON({ t: 'refuse', code: 'version', msg: CODES.version }); return s.closeSoon('version'); }
    if (m.build !== (opts.build || 'dev')) { s.sendJSON({ t: 'refuse', code: 'build', msg: CODES.build }); return s.closeSoon('build'); }
    s.state = 'await';
    s.sendJSON({ t: 'welcome', v: PROTOCOL_VERSION, build: opts.build || 'dev', server: 'thousandvale', tickMs: TICK_MS, time: ticks * TICK_MS, clock: { ...realmClock, now: wallNow() } });
  }
  function onMessage(s, m) {
    switch (m.t) {
      case 'hello': return s.state === 'hello' ? hello(s, m) : bad(s, 'order');
      case 'ping': return s.sendJSON({ t: 'pong', c: m.c, s: ticks * TICK_MS, k: ticks });
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
      case 'trade': return tradeOp(o, m);
      case 'travel': return travel(o, m.to);
      case 'trace': return trace(o, m.kind);
      default: return bad(s, 'socket');
    }
  }
  function clean(text) { return filterText(String(text).replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim()).slice(0, 200); }
  const muted = ch => (ch.mutedUntil || 0) > wallNow();
  const ignores = (ch, fromId) => !!(ch && ch.ignore && ch.ignore.some(i => i.id === fromId));

  // ---- entering the world ----
  function enter(s, m) {
    if (s.state !== 'await' && s.state !== 'wait') return bad(s, 'order');
    const tk = tickets.get(m.ticket);
    if (!tk) {                         // the gateway's bus message may still be on its way
      if (s.state === 'wait') { s.err('ticket'); return s.closeSoon('ticket'); }
      s.state = 'wait'; s.waitTicket = m.ticket; s.waitUntil = now() + TICKET_WAIT_MS;
      return;
    }
    tickets.delete(m.ticket);
    if (tk.exp < now()) { s.err('ticket'); return s.closeSoon('ticket'); }
    s.state = 'busy'; s.account = tk.account; s.charId = tk.char;
    const existing = online.get(tk.char);
    if (existing && !existing.relocating) { takeOver(existing, s); return; }
    return store.takeChar(tk.account, tk.char, owner, LEASE_MS).then(r => {
      if (s.closed) { if (!r.err) store.releaseChar(tk.char, owner); return; }
      if (r.err) { s.err('state', r.err === 'lease' ? 'That character is still logged in elsewhere. Try again in a few seconds.' : 'No such character.'); return s.closeSoon(r.err); }
      const again = online.get(tk.char);
      if (again && !again.relocating) { takeOver(again, s); return; }
      const ch = r.char;
      const place = placeFor(ch, tk);
      const client = makeClient(s);
      const o = { char: ch, fence: r.fence, entity: null, room: place.room, conn: s, lingerUntil: 0, dirty: false, saving: false, savePending: false, lastSaveAt: now(), homeCopy: null, seq: ch.jseq || 0, savedSeq: ch.jseq || 0, lastPos: null, frozen: false, zone: null };
      online.set(ch.id, o);
      o.entity = place.room.addPlayer(ch, client, place.at);
      tagParty(o);
      if (place.room.kind === 'wilds') o.homeCopy = place.room;
      s.state = 'in'; s.client = client;
      joined(s, o, tk.at ? { from: null, via: 'relocate' } : null);
      presence(o);
    }, err => { log('takeChar failed', err); s.err('state', 'Could not load the character.'); s.closeSoon('load'); });
  }

  /** Where a character appears: next to the party leader (join link), a relocation target, its saved room, or town. */
  function placeFor(ch, tk) {
    if (tk.near) {
      const lo = online.get(tk.near);
      if (lo && lo.entity && (lo.room.kind !== 'instance' || canEnter(lo.room, ch))) return { room: lo.room, at: { x: lo.entity.x + 1.5, z: lo.entity.z + 1 } };
    }
    if (tk.at && P.has(tk.at.province)) {
      const pv = P.get(tk.at.province);
      return { room: roomAt(pv, tk.at, ch), at: { x: tk.at.x, z: tk.at.z } };
    }
    const rid = String(ch.room || '');
    const [prov, rest] = rid.includes('/') ? rid.split('/') : [first.L.key, rid];
    const pv = P.get(prov) || first;
    const at = Number.isFinite(ch.x) ? { x: ch.x, z: ch.z } : null;
    if (rest.startsWith('town')) { const r = rooms.get(rid); return { room: r || pv.towns[0], at: r ? at : null }; }
    if (rest.startsWith('i:')) {
      const inst = rooms.get(rid);
      if (inst && canEnter(inst, ch)) return { room: inst, at };
      const back = ch.exit || pv.L.gate;
      ch.exit = null;
      return { room: pickCopy(ch, null, pv), at: { x: back.x, z: back.z } };
    }
    if (rest.startsWith('wilds') && at && P.has(prov)) return { room: roomAt(pv, at, ch), at };
    return { room: pv.towns[0], at: null };
  }
  /** The room holding point p in a province: the town whose circle it is in, else a wilds copy. */
  function roomAt(pv, p, ch, o = null) {
    const ti = pv.L.towns.findIndex(t => Math.hypot(p.x - t.x, p.z - t.z) < t.r - TOWN_EDGE);
    return ti >= 0 ? pv.towns[ti] : pickCopy(ch, o, pv);
  }

  function takeOver(o, s) {
    const old = o.conn;
    if (old && old !== s) { o.conn = null; old.charId = null; old.kick('elsewhere'); }
    const client = makeClient(s);
    o.room.attach(o.entity, client);
    o.conn = s; o.lingerUntil = 0;
    s.state = 'in'; s.client = client;
    joined(s, o);
    presence(o);
  }
  function makeClient(s) { return { send: d => s.send(d), you: patch => s.sendJSON({ t: 'you', ...patch }) }; }

  function joined(s, o, handoff = null) {
    const e = o.entity, ch = o.char, rules = o.room.rules;
    const t = wallNow();
    const msg = {
      t: 'joined', room: o.room.describe(), tickMs: TICK_MS, tick: o.room.tick, time: o.room.now(),
      you: {
        id: e.id, char: ch.id, name: ch.name, cls: ch.cls, level: ch.level, xp: ch.xp || 0,
        xpNext: rules.xpFor ? rules.xpFor((ch.level || 1) + 1) : null, gold: ch.gold || 0,
        x: e.x, y: e.y, z: e.z, yaw: e.yaw, hp: e.hp, hpMax: e.hpMax, mp: Math.round(e.mp), mpMax: e.mpMax,
        bag: ch.bag || [], equipment: equipView(o), ignore: ch.ignore || [], waystones: ch.waystones || [],
        opened: Object.keys(ch.opened || {}).filter(k => ch.opened[k] > t),
      },
    };
    if (handoff) msg.handoff = handoff;
    if (liveEvent) msg.event = eventView(liveEvent);
    s.sendJSON(msg);
  }

  // ---- presence for the gateway (parties, ignore, the director) ----
  function presence(o) {
    send({ k: 'presence', char: o.char.id, name: o.char.name, cls: o.char.cls, level: o.char.level, room: o.room.id, province: provOf(o.room).L.key, online: !!o.conn, ignore: o.char.ignore || [], mutedUntil: o.char.mutedUntil || 0, account: o.char.account });
  }
  function sendFrames() {
    const rows = [];
    for (const o of online.values()) {
      const p = partyOf.get(o.char.id);
      if (!p || p.members.length < 2) continue;
      const e = o.entity;
      rows.push([o.char.id, Math.round(e.hp), e.hpMax, o.room.id, Math.round(e.x * 10) / 10, Math.round(e.z * 10) / 10, e.dead ? 1 : 0, o.conn ? 1 : 0, e.id]);
    }
    if (rows.length) send({ k: 'frames', rows });
  }

  // ---- moving between rooms ----
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
    presence(o);
  }
  /** Move to a point in a province: here (a handoff) or in another process (save, release, relocate). */
  function moveTo(o, province, at, via) {
    const pv = P.get(province);
    if (pv) return transfer(o, roomAt(pv, at, o.char, o), at, via);
    if (o.relocating) return;
    o.relocating = { province, at, via };
    counters.relocations++;
    cancelTrade(o.char.id, 'gone');
    syncChar(o);
    o.char.room = province + '/wilds'; o.char.x = at.x; o.char.z = at.z;
    online.delete(o.char.id);
    o.room.remove(o.entity);
    const account = o.char.account;
    Promise.resolve(saveNow(o, true)).then(() => store.releaseChar(o.char.id, owner)).then(() => {
      send({ k: 'gone', char: o.char.id });
      send({ k: 'relocate', char: o.char.id, account, province, at, via });
    });
    o.relocatingConn = o.conn;
  }
  const pendingRelocate = new Map();
  function relocated(m) {
    // find the session of the character that left
    for (const s of kit.sessions) if (s.charId === m.char && s.state === 'in') {
      if (m.error) { s.err('state', 'You cannot travel there right now.'); s.closeSoon('relocate'); return; }
      s.sendJSON({ t: 'relocate', path: m.path, ticket: m.ticket });
      s.state = 'gone'; s.charId = null;
      setTimeoutTicks(() => s.closeSoon('relocate'), 20);
      return;
    }
    pendingRelocate.set(m.char, m);
  }

  function respawn(o) {
    const e = o.entity;
    if (!e.dead) return;
    if (o.room.kind === 'instance') { o.room.respawn(e); return; }
    e.revive(1);
    o.room.rules.respawn && safeRules(o.room, 'respawn', e);
    o.char.hp = e.hpMax;
    const pv = provOf(o.room);
    // wake in the nearest town of this province
    let best = pv.towns[0], bd = Infinity;
    pv.L.towns.forEach((t, i) => { const d = Math.hypot(t.x - e.x, t.z - e.z); if (d < bd) { bd = d; best = pv.towns[i]; } });
    transfer(o, best, { x: best.area.x, z: best.area.z }, 'respawn');
  }
  function safeRules(r, fn, ...a) { try { return r.rules[fn](...a); } catch (err) { log('rules ' + fn, err && err.message); return undefined; } }

  /** Town edges: walk into a town circle -> its room; walk out -> your wilds copy. Queued, EDGE_PER_TICK a tick. */
  const edgeQueue = new Set();
  function edgeTarget(o) {
    if (!o.conn || o.entity.dead || o.relocating) return null;
    const e = o.entity, pv = provOf(o.room);
    if (!pv) return null;
    if (o.room.kind === 'wilds') {
      const i = pv.L.towns.findIndex(t => Math.hypot(e.x - t.x, e.z - t.z) < t.r - TOWN_EDGE);
      return i >= 0 ? pv.towns[i] : null;
    }
    if (o.room.kind === 'town') { const a = o.room.area; return Math.hypot(e.x - a.x, e.z - a.z) > a.r + TOWN_EDGE ? 'wilds' : null; }
    return null;
  }
  function checkEdges() { for (const [id, o] of online) if (edgeTarget(o)) edgeQueue.add(id); }
  function drainEdges() {
    let n = 0;
    for (const id of edgeQueue) {
      if (n >= EDGE_PER_TICK) break;
      edgeQueue.delete(id);
      const o = online.get(id);
      const to = o && edgeTarget(o);
      if (!to) continue;
      const e = o.entity;
      transfer(o, to === 'wilds' ? pickCopy(o.char, o) : to, { x: e.x, z: e.z }, 'gate');
      n++;
    }
  }

  // ---- using things ----
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
    if (d.waystone) return discover(o, obj);
    if (d.chest) return openChest(o, obj);
    if (d.note) return s.sendJSON({ t: 'used', id, ok: true, kind: 'note', name: obj.name, text: d.note.text, quest: d.note.quest || undefined });
    if (d.npc) return s.sendJSON({ t: 'used', id, ok: true, kind: 'npc', name: obj.name, says: d.npc.says, quest: d.npc.quest || undefined, role: d.npc.role || undefined });
    if (d.use) return useThing(o, obj);
    if (d.trace) return s.sendJSON({ t: 'used', id, ok: true, kind: d.trace.kind, ...d.trace });
    if (d.lever) {
      if (d.state === 'used') return s.sendJSON({ t: 'used', id, ok: false, why: 'used', msg: 'It will not move again.' });
      const opened = o.room.terrain.openGate ? o.room.terrain.openGate(d.lever.floor) : false;
      o.room.objState(obj, 'used');
      for (const g of o.room.objects.values()) if (g.data && g.data.gate && g.data.gate.floor === d.lever.floor) o.room.objState(g, 'open');
      return s.sendJSON({ t: 'used', id, ok: true, kind: 'lever', opened });
    }
    if (d.rules && o.room.rules.useObject) {
      const res = safeRules(o.room, 'useObject', e, obj) || { ok: false, why: 'unknown' };
      return s.sendJSON({ t: 'used', id, ok: !!res.ok, why: res.ok ? undefined : (res.why || 'unknown'), msg: res.text, kind: obj.type });
    }
    return s.sendJSON({ t: 'used', id, ok: false, why: 'unknown' });
  }
  function enterDungeon(o, doorObj) {
    const ch = o.char, p = partyOfChar(ch.id), pv = provOf(o.room);
    const key = p ? 'p' + p.id : 'c' + ch.id;
    let inst = pv.instances.get(key);
    if (!inst) inst = makeInstance(pv, key, p ? p.id : null, p ? p.members : [ch.id], doorObj.data.portal.door || 0);
    inst.meta.allowed.add(ch.id);
    ch.exit = { x: doorObj.x + 3, z: doorObj.z + 3 };
    transfer(o, inst, inst.spawnPoint, 'portal');
  }
  const objKey = (o, k) => (o.room.kind === 'instance' ? o.room.id : provOf(o.room).L.key) + ':' + k;
  function pruneOpened(ch, t) { ch.opened ||= {}; for (const k of Object.keys(ch.opened)) if (ch.opened[k] <= t) delete ch.opened[k]; }
  function useThing(o, obj) {
    const ch = o.char, s = o.conn, u = obj.data.use, t = wallNow();
    const key = objKey(o, obj.data.key || obj.id);
    pruneOpened(ch, t);
    if ((ch.opened[key] || 0) > t) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'opened', msg: 'Nothing more to do here for now.' });
    const cost = (u.cost && u.cost.gold) || 0;
    if (cost > (ch.gold || 0)) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'gold', msg: 'You need ' + cost + ' gold.' });
    if (cost) { ch.gold -= cost; journal(o, 'gold', { d: -cost }); econ.add('sink', 'offering', { gold: cost }, ch.level); s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold }); }
    ch.opened[key] = t + chestResetMs;
    journal(o, 'opened', { key, until: ch.opened[key] });
    if (u.buff && o.room.rules.buff) safeRules(o.room, 'buff', o.entity, u.buff);
    s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'use', name: obj.name, text: u.text, buff: u.buff || undefined });
    const gold = (u.gives && u.gives.gold) || 0;
    if (gold) grant(o, { items: [], gold, reason: 'vignette', from: obj });
  }
  function openChest(o, obj) {
    const ch = o.char, e = o.entity, c = obj.data.chest, s = o.conn;
    const key = o.room.kind === 'instance' ? o.room.id + ':' + c.key : objKey(o, c.key);
    const t = wallNow();
    pruneOpened(ch, t);
    if ((ch.opened[key] || 0) > t) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'opened', msg: 'You already emptied this chest.' });
    if (c.after && !((ch.opened[objKey(o, c.after)] || 0) > t)) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'locked', msg: (c.afterName ? 'Try the ' + c.afterName.toLowerCase() + ' first.' : 'It will not open yet.') });
    const lvl = c.level || e.level;
    const items = (o.room.rules.rollLoot ? safeRules(o.room, 'rollLoot', e, { level: lvl, tier: c.tier }) : null) || [];
    const gold = Math.round(lvl * 4 + 5);
    ch.gold = (ch.gold || 0) + gold;
    ch.opened[key] = t + (o.room.kind === 'instance' ? 24 * 3600000 : chestResetMs);
    journal(o, 'opened', { key, until: ch.opened[key] });
    s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'chest' });
    o.room.emit({ type: 'open', to: e.id, d: obj.id, x: obj.x, z: obj.z });
    grant(o, { items, gold, reason: 'chest', goldAdded: true, from: obj });
  }

  // ---- waystones + travel (PLAN §5.2; NB4: discovered first, fares, free to a live realm event) ----
  let remoteWaystones = [];       // every process's waystones (the gateway shares them)
  function allWaystones() { const out = []; for (const pv of P.values()) for (const w of pv.L.waystones) out.push({ ...w, province: pv.L.key }); return out; }
  function discover(o, obj) {
    const ch = o.char, w = obj.data.waystone;
    ch.waystones ||= [];
    const fresh = !ch.waystones.includes(w.key);
    if (fresh) { ch.waystones.push(w.key); journal(o, 'set', { k: 'waystones', v: ch.waystones }); o.dirty = true; }
    o.conn.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'waystone', key: w.key, name: w.name, fresh, known: ch.waystones });
  }
  function travel(o, to) {
    const s = o.conn, e = o.entity, ch = o.char;
    if (e.dead) return s.sendJSON({ t: 'travelR', ok: false, why: 'dead' });
    if (e.state & STATE.combat) return s.sendJSON({ t: 'travelR', ok: false, why: 'combat', msg: 'Not while fighting.' });
    if (o.room.kind === 'instance') return s.sendJSON({ t: 'travelR', ok: false, why: 'instance', msg: 'Leave the dungeon first.' });
    if (to === 'event') {
      if (!liveEvent) return s.sendJSON({ t: 'travelR', ok: false, why: 'noEvent', msg: 'Nothing is happening right now.' });
      counters.travels++;
      s.sendJSON({ t: 'travelR', ok: true, cost: 0, to: 'event' });
      const a = (ch.id % 12) / 12 * Math.PI * 2;
      return moveTo(o, liveEvent.province, { x: liveEvent.x + Math.cos(a) * (liveEvent.r || 50) * 0.8, z: liveEvent.z + Math.sin(a) * (liveEvent.r || 50) * 0.8 }, 'event');
    }
    const w = allWaystones().find(x => x.key === to) || remoteWaystones.find(x => x.key === to);
    if (!w) return s.sendJSON({ t: 'travelR', ok: false, why: 'unknown' });
    if (!(ch.waystones || []).includes(to)) return s.sendJSON({ t: 'travelR', ok: false, why: 'undiscovered', msg: 'You have not found that waystone yet.' });
    const near = (ch.waystones || []).length && [...o.room.objects.values()].some(x => x.data && x.data.waystone && Math.hypot(x.x - e.x, x.z - e.z) < 6);
    if (!near) return s.sendJSON({ t: 'travelR', ok: false, why: 'far', msg: 'Stand at a waystone to travel.' });
    const cost = travelFare(Math.hypot(w.x - e.x, w.z - e.z) + (w.province !== provOf(o.room).L.key ? 4000 : 0));
    if (cost > (ch.gold || 0)) return s.sendJSON({ t: 'travelR', ok: false, why: 'gold', cost, msg: 'The fare is ' + cost + ' gold.' });
    ch.gold -= cost; journal(o, 'gold', { d: -cost }); econ.add('sink', 'fare', { gold: cost }, ch.level);
    s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
    counters.travels++;
    s.sendJSON({ t: 'travelR', ok: true, cost, to });
    moveTo(o, w.province, { x: w.x + 2, z: w.z + 2 }, 'waystone');
  }

  // ---- the realm event (spawned here when the director picks this province) ----
  let liveEvent = null, eventBoss = null, lastEventSend = 0;
  const eventView = ev => ({ id: ev.id, uid: ev.uid, name: ev.name, province: ev.province, x: ev.x, z: ev.z, r: ev.r || 50, level: ev.level });
  function onEvent(m) {
    if (m.op === 'live') { liveEvent = m.ev; return; }
    if (m.op === 'stop') {
      if (liveEvent && liveEvent.uid === m.uid) liveEvent = null;
      if (eventBoss && eventBoss.e.data.event === m.uid) { if (!eventBoss.e.removed && !eventBoss.e.dead) eventBoss.room.remove(eventBoss.e); for (const a of eventBoss.adds) if (!a.removed) eventBoss.room.remove(a); eventBoss = null; }
      return;
    }
    if (m.op === 'start') {
      const ev = m.ev, pv = P.get(ev.province);
      if (!pv) return;
      liveEvent = ev;
      const room = pv.copies[0];
      const scale = ev.scale || { hp: 1, adds: 0, players: 1 };
      const e = room.spawn({ kind: 'monster', type: ev.body || 'wolf', level: ev.level || 5, x: ev.x, z: ev.z, rank: 'boss', state: STATE.elite, name: ev.name, data: { encounter: ev.encounter || null, event: ev.uid, scale: scale.hp } });
      if (!e.r.unit) { e.setMax(e.hpMax * scale.hp); e.setHp(e.hpMax); }      // the stand-in rules: scale here (C reads data.scale)
      const adds = [];
      for (let i = 0; i < scale.adds; i++) { const a = i / Math.max(1, scale.adds) * Math.PI * 2; adds.push(room.spawn({ kind: 'monster', type: ev.addType || ev.body || 'wolf', level: Math.max(1, (ev.level || 5) - 2), x: ev.x + Math.cos(a) * 12, z: ev.z + Math.sin(a) * 12, data: { event: ev.uid } })); }
      eventBoss = { e, room, adds, ev };
    }
  }
  function eventTick() {
    if (!eventBoss) return;
    const { e, room, ev } = eventBoss;
    if (e.dead || e.removed) {
      send({ k: 'eventState', uid: ev.uid, state: e.dead ? 'won' : 'lost' });
      eventBoss = null;
      return;
    }
    if (now() - lastEventSend < 1000) return;
    lastEventSend = now();
    const near = room.host.near(ev.x, ev.z, (ev.r || 50) * 2, x => x.kind === 'player');
    const hp = e.hp / Math.max(1, e.hpMax);
    send({ k: 'eventState', uid: ev.uid, state: 'live', hp, players: near.length });
    // the temporary event group (PLAN §5.3): everyone in the arena gets the event frame, no invite needed
    const msg = JSON.stringify({ t: 'eventFrame', uid: ev.uid, name: ev.name, boss: e.id, hp, players: near.length });
    for (const p of near) { const c = room.clients.get(p.id); if (c) c.send(msg); }
  }

  // ---- watching the rooms: open groups, traces, deeds ----
  const attackers = new Map();   // `${room}:${monster}` -> Map(char -> wall ms)
  const hinted = new Map();      // key -> ms
  const deeds = new Map();       // zone -> { hour, rares, bosses, deaths, visitors: Set }
  function deedOf(zone) {
    const hour = Math.floor(wallNow() / 3600000);
    let d = deeds.get(zone);
    if (!d || d.hour !== hour) { d = { hour, rares: 0, bosses: 0, elites: 0, deaths: 0, visitors: new Set(), heat: new Map() }; deeds.set(zone, d); }
    return d;
  }
  function observe(ev, r) {
    if (ev.type === 'hit' && ev.kind === 'dmg') {
      const src = r.entities.get(ev.s), dst = r.entities.get(ev.d);
      if (!src || !dst || src.kind !== 'player' || dst.kind !== 'monster' || !src.char) return;
      const key = r.id + ':' + dst.id;
      let m = attackers.get(key); if (!m) { m = new Map(); attackers.set(key, m); }
      const t = now();
      m.set(src.char.id, t);
      if (m.size < 2 || hinted.has(key)) return;
      const chars = [...m.entries()].filter(([, at]) => t - at < 10000).map(([c]) => c);
      const close = chars.filter(c => { const o = online.get(c); return o && o.room === r && Math.hypot(o.entity.x - dst.x, o.entity.z - dst.z) <= GROUP_R; });
      if (close.length < 2) return;
      const pids = new Set(close.map(c => (partyOf.get(c) || {}).id || 'solo:' + c));
      if (pids.size < 2) return;
      hinted.set(key, t); counters.hints++;
      send({ k: 'hint', key, chars: close });
      return;
    }
    if (ev.type === 'die') {
      const d = r.entities.get(ev.d);
      if (!d) return;
      attackers.delete(r.id + ':' + d.id);
      const pv = provOf(r);
      if (d.kind === 'player') {
        if (r.kind !== 'instance') {
          const by = ev.by ? r.entities.get(ev.by) : null;
          placeTrace(r, { kind: 'grave', name: `${d.name}'s grave`, x: d.x, z: d.z, ms: GRAVE_MS, info: { who: d.name, level: d.level, by: by ? by.name : null, at: wallNow() } });
          if (pv) deedOf(pv.L.zoneOf(d.x, d.z)).deaths++;
        }
        return;
      }
      if (d.kind === 'monster' && pv) {
        const dz = deedOf(pv.L.zoneOf(d.x, d.z));
        if (d.rank === 'rare') dz.rares++; else if (d.rank === 'boss') dz.bosses++; else if (d.rank === 'elite') dz.elites++;
        if (r.kind === 'instance' && d.rank === 'boss') bannerDoor(r);
      }
    }
  }
  function placeTrace(r, { kind, name, x, z, ms, info, owner: ownerChar = null }) {
    const list = r.meta.traces ||= [];
    if (ownerChar) for (const t of list.filter(t => t.owner === ownerChar && t.kind === kind)) { if (!t.e.removed) r.remove(t.e); }
    while (list.length && (list[0].e.removed || list.length >= MAX_GRAVES)) { const t = list.shift(); if (!t.e.removed) r.remove(t.e); }
    const e = r.spawn({ kind: 'object', type: kind, name, x, z, team: 0, data: { trace: { kind, ...info, until: wallNow() + ms }, state: 'idle' } });
    list.push({ e, kind, owner: ownerChar });
    r.host.despawn(e, ms);
    return e;
  }
  function trace(o, kind) {
    const s = o.conn;
    if (kind !== 'campfire') return bad(s, 'kind');
    if (o.room.kind !== 'wilds' || o.entity.dead) return s.sendJSON({ t: 'used', id: 0, ok: false, why: 'here', msg: 'You cannot make camp here.' });
    const e = o.entity;
    placeTrace(o.room, { kind: 'campfire', name: `${o.char.name}'s campfire`, x: e.x + 1, z: e.z, ms: CAMPFIRE_MS, info: { who: o.char.name, at: wallNow() }, owner: o.char.id });
    s.sendJSON({ t: 'used', id: 0, ok: true, kind: 'campfire' });
  }
  /** "Cleared by Aldra's party, 4 minutes ago" on the dungeon door, in every copy. */
  function bannerDoor(inst) {
    const pv = provOf(inst);
    const members = [...online.values()].filter(o => o.room === inst).map(o => o.char.name);
    const leader = members[0] || 'someone';
    const banner = { by: leader, party: members.length, at: wallNow() };
    for (const c of pv.copies) for (const ob of c.objects.values()) if (ob.data && ob.data.portal && ob.data.portal.door === inst.meta.door) { ob.data = { ...ob.data, banner }; ob.infoVer++; }
  }
  function zoneTick() {
    for (const o of online.values()) {
      if (!o.conn || o.room.kind === 'instance') continue;
      const pv = provOf(o.room);
      if (!pv) continue;
      const z = pv.L.zoneOf(o.entity.x, o.entity.z);
      const d = deedOf(z);
      d.visitors.add(o.char.id);
      const cell = Math.floor(o.entity.x / 32) + ':' + Math.floor(o.entity.z / 32);
      d.heat.set(cell, Math.min(255, (d.heat.get(cell) || 0) + 1));
      if (o.zone !== z) { o.zone = z; o.conn.sendJSON(zoneMsg(pv, z)); }
    }
  }
  function zoneMsg(pv, z) {
    const d = deedOf(z);
    const heat = [...d.heat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([k, v]) => { const [x, zz] = k.split(':').map(Number); return [x * 32 + 16, zz * 32 + 16, v]; });
    const zs = pv.L.zones.find(q => q.key === z);
    return { t: 'zone', zone: z, name: (zs && zs.sheet && zs.sheet.name) || pv.L.name, band: zs && zs.sheet ? zs.sheet.band : null, deeds: { rares: d.rares, bosses: d.bosses, elites: d.elites, deaths: d.deaths, visitors: d.visitors.size }, heat };
  }

  // ---- day/night + NPC schedules ----
  const timeOfDay = () => (((wallNow() - realmClock.epoch) % realmClock.dayMs) + realmClock.dayMs) % realmClock.dayMs / realmClock.dayMs;
  const isNight = () => { const t = timeOfDay(); return t < 0.22 || t > 0.8; };
  function npcTick(dtMs) {
    const night = isNight();
    for (const pv of P.values()) for (const r of pv.towns) {
      for (const n of r.objects.values()) {
        const sc = n.kind === 'npc' && n.data && n.data.schedule;
        if (!sc) continue;
        const goal = night ? sc.night : sc.day;
        const dx = goal.x - n.x, dz = goal.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { n.loop('idle'); continue; }
        const stepM = Math.min(d, 1.6 * dtMs / 1000);
        n.face(Math.atan2(dx, dz)); n.moveTo(n.x + dx / d * stepM, n.z + dz / d * stepM); n.loop('walk');
      }
    }
  }

  // ---- loot + bag ----
  function grant(o, { items = [], gold = 0, reason = 'kill', goldAdded = false, from = null }) {
    const ch = o.char;
    if (o.frozen) {
      if (goldAdded && gold) { ch.gold -= gold; goldAdded = false; }
      setTimeoutTicks(() => grant(o, { items, gold, reason, goldAdded, from }), 2);
      return;
    }
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
    if (gold || overflow) journal(o, 'gold', { d: gold + overflow });
    for (const it of added) journal(o, 'bagAdd', { item: it });
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
  function equipView(o) {
    const g = o.room.rules.gear ? safeRules(o.room, 'gear', o.entity) : null;
    return g || o.char.equipment || {};
  }
  function itemOp(o, m) {
    const ch = o.char, s = o.conn, e = o.entity;
    if (!ITEM_OPS.includes(m.op)) return bad(s, 'op');
    if (o.frozen) return s.err('busy');
    if (trades.offered(ch.id, m.uid)) return s.err('item', 'That item is in your trade window.');
    ch.bag ||= []; ch.equipment ||= {};
    const rules = o.room.rules;
    const bagIdx = ch.bag.findIndex(i => i.uid === m.uid);
    if (m.op === 'destroy') {
      if (bagIdx < 0) return s.err('item');
      const [it] = ch.bag.splice(bagIdx, 1);
      journal(o, 'bagDel', { uid: it.uid });
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
      // order matters on replay: an item comes back to the bag only after the worn set no longer holds it
      journal(o, 'bagDel', { uid: item.uid });
      journalGear(o);
      for (const it of removed) journal(o, 'bagAdd', { item: it });
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
      journalGear(o);
      journal(o, 'bagAdd', { item });
      o.dirty = true;
      s.sendJSON({ t: 'bag', add: [item], remove: [], gold: ch.gold });
      return s.sendJSON({ t: 'equip', slot, item: null, equipment: equipView(o) });
    }
  }

  // ---- parties (membership comes from the gateway) ----
  function tagParty(o) {
    const p = partyOf.get(o.char.id);
    o.entity.data = { ...(o.entity.data || {}), partyId: p ? p.id : null };
    if (o.room.rules.onParty) safeRules(o.room, 'onParty', o.entity, p ? p.id : null);
  }
  function mute(charId, untilMs) { const o = online.get(charId); if (!o) return false; o.char.mutedUntil = untilMs; journal(o, 'set', { k: 'mutedUntil', v: untilMs }); o.dirty = true; return true; }

  function handleClose(s) {
    if (!s.charId) return;
    const o = online.get(s.charId);
    if (!o || o.conn !== s) return;
    o.conn = null;
    o.room.detach(o.entity);
    o.lingerUntil = now() + lingerMs;
    presence(o);
    if (lingerMs <= 0) logout(o);
  }

  // ---- the journal ----
  function journal(o, kind, payload) {
    jpend.push({ char: o.char.id, seq: ++o.seq, kind, payload: JSON.parse(JSON.stringify(payload)), fence: o.fence });
  }
  function journalGear(o) {
    if (o.room.rules.saveGear) { const g = safeRules(o.room, 'saveGear', o.entity); if (g !== undefined) o.char.equipment = g; }
    journal(o, 'equip', { equipment: o.char.equipment || {} });
  }
  function flushJournal() {
    if (jflushing) return jflushing;
    for (const o of online.values()) {
      const e = o.entity, lp = o.lastPos;
      if (!lp || lp.room !== o.room.id || Math.abs(lp.x - e.x) + Math.abs(lp.z - e.z) > 0.5 || lp.exit !== o.char.exit) {
        o.lastPos = { room: o.room.id, x: e.x, z: e.z, exit: o.char.exit };
        journal(o, 'pos', { room: o.room.id, x: e.x, y: e.y, z: e.z, yaw: e.yaw, exit: o.char.exit ?? null });
      }
    }
    const rows = jpend.filter(r => { const o = online.get(r.char); return !o || r.seq > o.savedSeq; });
    jpend = [];
    if (!rows.length) return Promise.resolve(0);
    const t0 = now();
    jflushing = store.appendJournal(rows).then(kept => {
      counters.journalRows += kept; counters.journalFlushes++; counters.journalMs = now() - t0;
      if (kept < rows.length) counters.journalRefused += rows.length - kept;
      return kept;
    }, err => { log('journal flush failed', err && err.message); jpend = rows.concat(jpend); return 0; }).finally(() => { jflushing = null; });
    return jflushing;
  }

  // ---- trades ----
  function tradeView(t, me) {
    const mine = trades.side(t, me), theirs = mine === t.a ? t.b : t.a;
    const items = side => { const o = online.get(side.char); const bag = o ? o.char.bag || [] : []; return side.items.map(u => bag.find(i => i.uid === u)).filter(Boolean); };
    const sv = side => { const o = online.get(side.char); return { char: side.char, name: o ? o.char.name : '?', id: o ? o.entity.id : 0, items: items(side), gold: side.gold, locked: side.locked, confirmed: side.confirmed }; };
    return { id: t.id, state: t.state, you: sv(mine), them: sv(theirs) };
  }
  function tradeTell(t, extra = {}) { for (const c of [t.a.char, t.b.char]) { const o = online.get(c); if (o && o.conn) o.conn.sendJSON({ t: 'tradeState', trade: tradeView(t, c), ...extra }); } }
  function cancelTrade(c, why) {
    const t = trades.of(c);
    if (!t || t.committing) return;
    trades.end(c);
    for (const x of [t.a.char, t.b.char]) { const o = online.get(x); if (o && o.conn) o.conn.sendJSON({ t: 'tradeState', trade: null, done: false, why }); }
  }
  const near = (a, b) => a.room === b.room && !a.entity.dead && !b.entity.dead && Math.hypot(a.entity.x - b.entity.x, a.entity.z - b.entity.z) <= TRADE_RANGE;
  function watchTrades() {
    for (const t of [...trades.byId.values()]) {
      const a = online.get(t.a.char), b = online.get(t.b.char);
      if (!a || !b || !a.conn || !b.conn) cancelTrade(t.a.char, 'gone');
      else if (!near(a, b)) cancelTrade(t.a.char, 'tradeFar');
    }
  }
  function tradeOp(o, m) {
    const s = o.conn, me = o.char.id;
    if (!TRADE_OPS.includes(m.op)) return bad(s, 'op');
    let r;
    switch (m.op) {
      case 'ask': {
        const te = o.room.entities.get(m.id);
        const to = te && te.char && online.get(te.char.id);
        if (!to || to.entity !== te || to === o) return s.err('trade');
        if (!near(o, to)) return s.err('tradeFar');
        if ((o.char.level || 1) < tradeMinLevel || (to.char.level || 1) < tradeMinLevel) return s.err('trade', 'Trading opens at level ' + tradeMinLevel + '.');
        if (ignores(to.char, me)) return s.err('trade');
        r = trades.ask(me, to.char.id);
        if (r.ok && to.conn) to.conn.sendJSON({ t: 'tradeAsk', trade: r.trade.id, from: o.entity.id, name: o.char.name });
        break;
      }
      case 'accept': r = trades.accept(me, m.id ?? -1); break;
      case 'offer': {
        const t = trades.get(m.id ?? -1);
        const items = m.items || [], gold = m.gold || 0;
        if (gold < 0 || gold > (o.char.gold || 0)) return s.err('trade', 'You do not have that much gold.');
        const bag = new Set((o.char.bag || []).map(i => i.uid));
        if (!items.every(u => bag.has(u))) return s.err('item');
        if (t && items.some(u => { const other = trades.of(me); return other && other !== t && trades.offered(me, u); })) return s.err('item');
        r = trades.offer(me, m.id ?? -1, { items, gold });
        break;
      }
      case 'lock': r = trades.lock(me, m.id ?? -1); break;
      case 'confirm': r = trades.confirm(me, m.id ?? -1); break;
      case 'cancel': return cancelTrade(me, 'cancelled');
    }
    if (!r || !r.ok) return s.err((r && r.why) || 'trade');
    tradeTell(r.trade);
    if (r.ready) commitTrade(r.trade);
  }
  function commitTrade(t) {
    const a = online.get(t.a.char), b = online.get(t.b.char);
    const fail = why => { t.committing = false; counters.tradeFails++; trades.end(t.a.char); for (const o of [a, b]) if (o && o.conn) o.conn.sendJSON({ t: 'tradeState', trade: null, done: false, why }); };
    if (!a || !b || !near(a, b)) return fail('tradeFar');
    if (a.saving || b.saving || a.frozen || b.frozen) { t.committing = true; setTimeoutTicks(() => { t.committing = false; commitTrade(t); }, 2); return; }
    const take = (o, side) => {
      const bag = o.char.bag || [];
      const items = side.items.map(u => bag.find(i => i.uid === u));
      if (items.some(x => !x) || side.gold > (o.char.gold || 0)) return null;
      return items;
    };
    const ia = take(a, t.a), ib = take(b, t.b);
    if (!ia || !ib) return fail('tradeFailed');
    if ((a.char.bag.length - ia.length + ib.length) > BAG_MAX || (b.char.bag.length - ib.length + ia.length) > BAG_MAX) return fail('bagFull');
    t.committing = true;
    a.frozen = b.frozen = true; a.saving = b.saving = true;
    syncChar(a); syncChar(b);
    const next = (o, give, get, giveGold, getGold) => {
      const ch = JSON.parse(JSON.stringify(o.char));
      const out = new Set(give.map(i => i.uid));
      ch.bag = ch.bag.filter(i => !out.has(i.uid)).concat(JSON.parse(JSON.stringify(get)));
      ch.gold = (ch.gold || 0) - giveGold + getGold;
      return ch;
    };
    const na = next(a, ia, ib, t.a.gold, t.b.gold), nb = next(b, ib, ia, t.b.gold, t.a.gold);
    const seqA = a.seq, seqB = b.seq;
    store.tradeChars([{ ch: na, fence: a.fence }, { ch: nb, fence: b.fence }]).then(ok => {
      a.saving = b.saving = false; a.frozen = b.frozen = false;
      if (!ok) return fail('tradeFailed');
      for (const [o, give, get, dg, nx, sq] of [[a, ia, ib, t.b.gold - t.a.gold, na, seqA], [b, ib, ia, t.a.gold - t.b.gold, nb, seqB]]) {
        const out = new Set(give.map(i => i.uid));
        o.char.bag = o.char.bag.filter(i => !out.has(i.uid)).concat(JSON.parse(JSON.stringify(get)));
        o.char.gold = (o.char.gold || 0) + dg;
        o.char.version = nx.version;
        o.savedSeq = Math.max(o.savedSeq, sq);
        o.lastSaveAt = now();
        if (o.conn) o.conn.sendJSON({ t: 'bag', add: get, remove: [...out], gold: o.char.gold });
      }
      t.committing = false;
      counters.trades++;
      tradeTell(t, { done: true });
      trades.end(t.a.char);
      for (const o of [a, b]) if (o.conn) o.conn.sendJSON({ t: 'tradeState', trade: null, done: true });
      for (const o of [a, b]) if (o.savePending) { o.savePending = false; saveNow(o); }
    }, err => { a.saving = b.saving = false; a.frozen = b.frozen = false; log('trade failed', err && err.message); fail('tradeFailed'); });
  }
  const tickTimers = [];
  function setTimeoutTicks(fn, n) { tickTimers.push({ at: ticks + n, fn }); }

  // ---- saving ----
  function syncChar(o) {
    const e = o.entity, ch = o.char;
    ch.x = e.x; ch.y = e.y; ch.z = e.z; ch.yaw = e.yaw; ch.hp = e.dead ? 0 : e.hp; ch.mp = Math.round(e.mp);
    ch.level = e.level; ch.room = o.room.id;
    ch.jseq = o.seq;
    if (o.room.rules.saveGear) { const g = safeRules(o.room, 'saveGear', e); if (g !== undefined) ch.equipment = g; }
  }
  function sig(o) { const e = o.entity, ch = o.char; return [Math.round(e.x * 4), Math.round(e.z * 4), e.hp, ch.xp, ch.gold, ch.level, o.room.id, (ch.bag || []).length].join(','); }
  /** Save the blob. `keepRoom`: the caller already set ch.room/x/z (a relocation) — don't overwrite them. */
  function saveNow(o, keepRoom = false) {
    if (o.saving) { o.savePending = true; return o.savingP; }
    if (keepRoom) { const { room, x, z } = o.char; syncChar(o); Object.assign(o.char, { room, x, z }); } else syncChar(o);
    o.saving = true; o.dirty = false; o.lastSig = sig(o);
    const snapSeq = o.seq;
    const t0 = now();
    const snap = JSON.parse(JSON.stringify(o.char));
    o.savingP = store.saveChar(snap, o.fence).then(ok => {
      if (ok) o.char.version = snap.version;
      o.saving = false; o.lastSaveAt = now();
      counters.saveMs = now() - t0;
      if (ok) { counters.saves++; o.savedSeq = Math.max(o.savedSeq, snapSeq); }
      else {
        counters.saveFails++;
        log('save refused (lease lost?)', o.char.id);
        if (o.conn && !o.relocating) o.conn.kick('elsewhere');
        if (online.get(o.char.id) === o) { online.delete(o.char.id); o.room.remove(o.entity); }
        return false;
      }
      if (o.savePending) { o.savePending = false; return saveNow(o, keepRoom); }
      return true;
    }, err => { o.saving = false; counters.saveFails++; log('save failed', err && err.message); return false; });
    return o.savingP;
  }
  function logout(o) {
    if (o.loggingOut) return o.loggingOut;
    cancelTrade(o.char.id, 'gone');
    online.delete(o.char.id);
    o.room.remove(o.entity);
    send({ k: 'gone', char: o.char.id });
    o.loggingOut = Promise.resolve(saveNow(o)).then(() => store.releaseChar(o.char.id, owner));
    return o.loggingOut;
  }

  // ---- tick ----
  function step() {
    const t0 = perfNow();
    ticks++;
    for (const r of rooms.values()) r.step();
    if (ticks % 5 === 0) checkEdges();
    if (edgeQueue.size) drainEdges();
    if (tickTimers.length) for (let i = tickTimers.length - 1; i >= 0; i--) if (tickTimers[i].at <= ticks) { const f = tickTimers[i].fn; tickTimers.splice(i, 1); f(); }
    if (ticks % 10 === 0) sendFrames();
    if (ticks % 10 === 5) eventTick();
    if (ticks % 20 === 7) zoneTick();
    if (ticks % 4 === 1) npcTick(TICK_MS * 4);
    const t = now();
    let started = 0;
    for (const o of online.values()) {
      if (!o.conn && o.lingerUntil && o.lingerUntil <= t) { logout(o); continue; }
      if (started < SAVES_PER_TICK && !o.saving && t - o.lastSaveAt >= saveEveryMs && (o.dirty || sig(o) !== o.lastSig)) { saveNow(o); started++; }
    }
    for (const s of kit.sessions) if (s.state === 'wait' && s.waitUntil < t) { s.err('ticket'); s.closeSoon('ticket'); }
    if (ticks % 20 === 0) closeEmptyRooms(t);
    if (t - lastJFlush >= journalMs) { lastJFlush = t; flushJournal(); }
    if (ticks % 5 === 0 && trades.byId.size) watchTrades();
    if (t - lastHeartbeat >= HEARTBEAT_MS) {
      lastHeartbeat = t;
      const ids = [...online.keys()];
      if (ids.length) store.heartbeat(owner, ids, LEASE_MS).catch(err => log('heartbeat failed', err && err.message));
      for (const [k, v] of tickets) if (v.exp < t) tickets.delete(k);
      for (const [k, v] of hinted) if (t - v > 60000) hinted.delete(k);
      for (const [k, m] of attackers) { for (const [c, at] of m) if (t - at > 30000) m.delete(c); if (!m.size) attackers.delete(k); }
    }
    if (t - lastEconFlush >= 60000) { lastEconFlush = t; flushEconomy(); }
    if (t - rateWin.at >= 1000) {
      const secs = (t - rateWin.at) / 1000;
      rateWin.perSec = { msgsIn: Math.round((counters.msgsIn - rateWin.msgsIn) / secs), bytesOut: Math.round((counters.bytesOut - rateWin.bytesOut) / secs) };
      rateWin.at = t; rateWin.msgsIn = counters.msgsIn; rateWin.bytesOut = counters.bytesOut;
      if (ticks % 20 === 0) send({ k: 'status', status: brief() });
    }
    const ms = perfNow() - t0;
    tickStats.add(ms);
    return ms;
  }
  function closeEmptyRooms(t) {
    for (const r of [...rooms.values()]) {
      if (r.kind === 'town') continue;
      const pv = provOf(r);
      if (r.kind === 'wilds' && r === pv.copies[0]) continue;
      if (players(r) > 0) { r.meta.emptySince = 0; continue; }
      if (eventBoss && eventBoss.room === r) continue;
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
    send({ k: 'hello', proc, provinces: [...P.keys()], waystones: allWaystones().map(w => ({ key: w.key, name: w.name, x: w.x, z: w.z, province: w.province })) });
  }
  async function shutdown(code = 'restart') {
    for (const s of [...kit.sessions]) s.kick(code);
    await Promise.all([...online.values()].map(o => logout(o)));
    await flushJournal();
    flushEconomy();
    for (const s of [...kit.sessions]) s.closeSoon(code);
  }
  function brief() {
    return { proc, ccu: [...online.values()].filter(o => o.conn).length, online: online.size, tick: tickStats.summary(), rooms: rooms.size };
  }
  function status() {
    let rulesErrors = 0;
    for (const r of rooms.values()) rulesErrors += r.stats.rulesErrors;
    let instN = 0, copyN = 0; for (const pv of P.values()) { instN += pv.instances.size; copyN += pv.copies.length; }
    return {
      proc, process: processName, provinces: [...P.keys()],
      uptime: Math.round((now() - started) / 1000),
      ccu: [...online.values()].filter(o => o.conn).length, online: online.size,
      rooms: [...rooms.values()].map(r => {
        let monsters = 0; for (const e of r.entities.values()) if (e.kind === 'monster') monsters++;
        return { id: r.id, kind: r.kind, name: r.name, players: r.clients.size, monsters, entities: r.entities.size, tick: r.tick };
      }),
      copies: copyN, instances: instN,
      tick: tickStats.summary(),
      msgsInPerSec: rateWin.perSec.msgsIn, bytesOutPerSec: rateWin.perSec.bytesOut,
      bad: counters.bad, rateDrops: counters.rateDrops || 0, kicks: counters.kicks, transfers: counters.transfers, relocations: counters.relocations, travels: counters.travels, hints: counters.hints,
      rulesErrors,
      saves: { done: counters.saves, failed: counters.saveFails, lastMs: counters.saveMs, inFlight: [...online.values()].filter(o => o.saving).length },
      economy: econ.lastHour(),
      journal: { rows: counters.journalRows, flushes: counters.journalFlushes, lastMs: counters.journalMs, queue: jpend.length, refused: counters.journalRefused },
      trades: { open: trades.byId.size, done: counters.trades, failed: counters.tradeFails },
      event: eventBoss ? { uid: eventBoss.ev.uid, hp: eventBoss.e.hp / Math.max(1, eventBoss.e.hpMax) } : liveEvent ? { uid: liveEvent.uid } : null,
      timeOfDay: Math.round(timeOfDay() * 1000) / 1000,
      sessions: kit.sessions.size,
      db: store.kind,
    };
  }

  return {
    accept, step, init, shutdown, status, rooms, P, online, partyOf, econ, tickStats, owner, counters, trades,
    room: copies[0], townRoom, copies, instances, town, door, gate,
    saveNow, logout, transfer, moveTo, grant, mute, flushEconomy, newUid, flushJournal, timeOfDay,
    get liveEvent() { return liveEvent; },
  };
}

function roleName(role) {
  return { smith: 'Smith', merchant: 'Merchant', elder: 'Elder', innkeeper: 'Innkeeper', healer: 'Healer', unbinder: 'Unbinder', broker: 'Broker' }[role] || role;
}
