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
import { caveDungeon } from './placements.js';
import { createEventRunner, eventReward } from './events.js';
import { eventScale } from './director.js';
import { createQuestBook } from './quests.js';
import { townFolk, blockAt } from './schedules.js';
import { createMail } from './mail.js';

const LEASE_MS = 30000, HEARTBEAT_MS = 10000, TICKET_WAIT_MS = 3000;
export const BAG_MAX = 120;
export const TOWN_EDGE = 2;              // metres of hysteresis at the town edge (no flapping)
export const TARGET_RANGE = 60;          // a Tab target must be this close
export const EDGE_PER_TICK = 3;          // town-edge handoffs done per tick (a crowd crossing together is spread out)
export const SAVES_PER_TICK = 4;         // periodic blob saves started per tick
export const JOINS_MAX_PER_TICK = 4;     // arrivals placed per tick at most (a login storm queues, PLAN §16 "1,000 logging in")
export const JOIN_BUDGET_MS = 8;         // ...and only while this tick has used less than this (one always goes)
export const GROUP_R = 40;               // open groups: players hitting the same monster this close (PLAN §5.3)
// trace lifetimes and caps: stream E's data/names/traces.json (graves 60 min / 40 a copy, campfires 30 min / 20, banners 30 min)
export const GRAVE_MS = 3600000, CAMPFIRE_MS = 30 * 60000, BANNER_MS = 30 * 60000, MAX_TRACES = { grave: 40, campfire: 20 };
export const HEAT_CELL = 8;              // footprints: steps counted per 8 m cell per hour (traces.json footprints)
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
    zoneEventFirstMs = null, zoneEventGapMs = null,        // tests: when the first / next zone event of a copy starts
    mailOpts = {}, chatFilter = null,
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
  // the quest runtime per province (js/sim/quests.js over stream E's data/quests/**)
  let qSeed = (seed * 2654435761) >>> 0;
  const qRng = () => { qSeed = (qSeed + 0x6D2B79F5) >>> 0; let t = qSeed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (const pv of P.values()) pv.book = createQuestBook({ layout: pv.L, zones: pv.L.zones || [], rares: pv.L.rares || {}, jobs: pv.L.jobs || null, rng: qRng, now: wallNow, isNight: () => isNight() });
  /** back-compat for single-zone tests: the first province's first town / copy */
  const townRoom = first.towns[0], copies = first.copies, instances = first.instances;
  const town = first.L.towns[0], door = first.L.doors[0], gate = first.L.gate;

  function describeFor(L) {
    return {
      province: L.key,
      towns: L.towns.map(t => ({ x: t.x, z: t.z, r: t.r, name: t.name })),
      town: { x: L.towns[0].x, z: L.towns[0].z, r: L.towns[0].r, name: L.towns[0].name },
      waystones: L.waystones.map(w => ({ key: w.key, name: w.name, x: w.x, z: w.z })),
      // the far view: stream B's 32 m horizon (horizon-read.js parseHorizon, world metres) + the older macro.bin
      horizon: { world: 'data/world/world.json', macro: 'data/world/macro.bin', province: L.key, ...(L.horizon ? { bin: L.horizon.file, hash: L.horizon.hash, step: L.horizon.step } : {}) },
      zones: L.zones.map(z => ({ key: z.key, bounds: z.bounds || null })),
      clock: realmClock,
    };
  }
  function townObjects(L, t, i) {
    const out = [];
    for (const w of L.waystones) if (w.town === i) out.push({ type: 'waystone', name: 'Waystone', x: w.x, z: w.z, key: w.key, waystone: { key: w.key, name: w.name } });
    if (L.townObjects && L.townObjects[i]) out.push(...L.townObjects[i]);     // E's NPCs, notes… placed inside this town
    // town folk with day and night places (PLAN §4.3): stream E's schedules over stream B's town plan when both are
    // there (js/sim/schedules.js), else the roles round the square by day, at the inn by night
    if (L.schedules) {
      const quest = out.filter(o => o.type === 'npc' && o.npc && o.npc.id);
      out.push(...townFolk(t, { plan: L.townPlans && L.townPlans[i], schedules: L.schedules, kind: (L.townPlans && L.townPlans[i] && L.townPlans[i].kind) || t.kind || 'town', key: L.key + ':' + i, questNpcs: quest }));
      return out;
    }
    const inn = { x: t.x - t.r * 0.35, z: t.z + t.r * 0.3 };
    ROLES.forEach((role, k) => {
      const a = k / ROLES.length * Math.PI * 2;
      const day = { x: t.x + Math.cos(a) * t.r * 0.45, z: t.z + Math.sin(a) * t.r * 0.45 };
      const night = role === 'innkeeper' || role === 'healer' || role === 'unbinder' ? day : { x: inn.x + Math.cos(a) * 3, z: inn.z + Math.sin(a) * 3 };
      out.push({ type: 'npc', name: roleName(role), x: day.x, z: day.z, key: `npc:${L.key}:${i}:${role}`, npc: { role, says: [] }, schedule: { blocks: [{ from: 0.22, at: day, do: 'work' }, { from: 0.8, at: night, do: 'rest' }] } });
    });
    return out;
  }
  function makeCopy(pv) {
    const L = pv.L;
    const n = pv.copies.length ? Math.max(...pv.copies.map(c => c.meta.n)) + 1 : 1;
    const r = createRoom({
      id: `${L.key}/wilds:${n}`, name: L.name, kind: 'wilds', terrain: L.terrain, seed, createRules, hooks: roomHooks, encounterInfo,
      camps: L.camps, spawn: L.gate, dormantCamps: (L.zones || []).length > 1,   // a whole province: only camps near players exist
      safeZones: L.towns.map(t => ({ x: t.x, z: t.z, r: t.r })), meta: { n, emptySince: 0, province: L.key },
      objects: [
        ...L.doors.map((d, i) => ({ type: d.kind === 'cave' ? 'cave' : 'portal', name: (d.kind !== 'cave' && d.sheet && d.sheet.dungeon && d.sheet.dungeon.name) || d.name, x: d.x, z: d.z, yaw: d.yaw, key: d.key || `door:${L.key}:${i}`, portal: { to: 'dungeon', door: i } })),
        ...L.waystones.filter(w => w.town === undefined).map(w => ({ type: 'waystone', name: 'Waystone', x: w.x, z: w.z, key: w.key, waystone: { key: w.key, name: w.name } })),
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
    const plan = caveDungeon(planDungeon(dseed, { floors: ds.floors || 2, level: ds.level || dungeonLevel, ...(family ? { family } : {}) }), d.cave || null);
    const dterr = dungeonTerrain(plan);
    const spec = dungeonRoomSpec(plan, { exitTo: { room: 'wilds', x: d.x + 3, z: d.z + 3 } });
    const r = createRoom({
      id: `${pv.L.key}/i:${n}`, name: (d.kind !== 'cave' && ds.name) || plan.name || 'The Barrow', kind: 'instance', terrain: dterr, seed: dseed, createRules, hooks: roomHooks, encounterInfo,
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
      case 'claimed': { for (const o of online.values()) if (o.char.account === m.account) o.claimed = true; return; }
      case 'charge': return chargeGold(m);
      case 'callboard': return callboardEnter(m);
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
        if (text) { r.say(e, text, rc => !ignores(rc, o.char.id)); send({ k: 'said', from: o.char.id, name: o.char.name, text, room: r.id }); }
        return;
      }
      case 'respawn': return respawn(o);
      case 'use': return use(o, m.id);
      case 'item': return itemOp(o, m);
      case 'trade': return tradeOp(o, m);
      case 'travel': return travel(o, m.to);
      case 'trace': return trace(o, m.kind);
      case 'quest': return questOp(o, m);
      case 'mail': return mail.op(o, m).then(why => { if (typeof why === 'string') bad(s, why); });
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
    if (existing && !existing.relocating) { if (tk.claimed) existing.claimed = true; takeOver(existing, s); return; }
    return store.takeChar(tk.account, tk.char, owner, LEASE_MS).then(r => {
      if (s.closed) { if (!r.err) store.releaseChar(tk.char, owner); return; }
      if (r.err) { s.err('state', r.err === 'lease' ? 'That character is still logged in elsewhere. Try again in a few seconds.' : 'No such character.'); return s.closeSoon(r.err); }
      const again = online.get(tk.char);
      if (again && !again.relocating) { takeOver(again, s); return; }
      // a login storm: placing a character (the rules build its sheet, the skill bar is formatted) costs a few ms, so
      // arrivals wait in a queue that the tick drains within a time budget (JOIN_BUDGET_MS) instead of all at once
      const prev = joining.get(tk.char);
      if (prev && prev.s !== s) { prev.s.charId = null; prev.s.kick('elsewhere'); }
      joining.set(tk.char, { s, tk, r });
    }, err => { log('takeChar failed', err); s.err('state', 'Could not load the character.'); s.closeSoon('load'); });
  }
  const joining = new Map();     // char id -> { s, tk, r } loaded, waiting for a tick to place them (login storms)
  function placeJoin(j) {
    const { s, tk, r } = j;
    if (s.closed) { store.releaseChar(tk.char, owner); return; }
    const again = online.get(tk.char);
    if (again && !again.relocating) { takeOver(again, s); return; }
    const ch = r.char;
    const place = placeFor(ch, tk);
    const client = makeClient(s);
    const o = { char: ch, fence: r.fence, entity: null, room: place.room, conn: s, lingerUntil: 0, dirty: false, saving: false, savePending: false, lastSaveAt: now(), homeCopy: null, seq: ch.jseq || 0, savedSeq: ch.jseq || 0, lastPos: null, frozen: false, zone: null, claimed: !!tk.claimed };
    online.set(ch.id, o);
    o.entity = place.room.addPlayer(ch, client, place.at);
    tagParty(o);
    if (place.room.kind === 'wilds') o.homeCopy = place.room;
    s.state = 'in'; s.client = client;
    joined(s, o, tk.at ? { from: null, via: 'relocate' } : null);
    presence(o);
  }
  /** Place queued arrivals: at least one a tick, more while the tick is under budget. */
  function drainJoins(t0) {
    let n = 0;
    for (const [c, j] of joining) {
      if (n >= JOINS_MAX_PER_TICK || (n > 0 && perfNow() - t0 > JOIN_BUDGET_MS)) break;
      joining.delete(c);
      try { placeJoin(j); } catch (err) { log('join failed', err && err.stack); try { j.s.err('state', 'Could not enter the world.'); j.s.closeSoon('load'); } catch { /* gone */ } }
      n++;
    }
    counters.joinQueue = joining.size;
  }

  /** Where a character appears: next to the party leader (join link), a relocation target, its saved room, or town. */
  function placeFor(ch, tk) {
    if (tk.near) {
      const lo = online.get(tk.near);
      if (lo && lo.entity && (lo.room.kind !== 'instance' || canEnter(lo.room, ch))) return { room: lo.room, at: { x: lo.entity.x + 1.5, z: lo.entity.z + 1 } };
    }
    if (tk.at && P.has(tk.at.province)) {
      const pv = P.get(tk.at.province);
      if (tk.at.door != null && pv.L.doors[tk.at.door]) {           // the Callboard sent this party straight into a dungeon
        const inst = instanceFor(pv, tk.at.door, tk.at.party, ch.id, [ch.id]);
        const d = pv.L.doors[tk.at.door];
        ch.exit = { x: d.x + 3, z: d.z + 3 };
        return { room: inst, at: inst.spawnPoint };
      }
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
    // a saved wilds spot that is no longer good ground (another bake, another world) wakes you in town instead
    if (rest.startsWith('wilds') && at && P.has(prov) && (!pv.L.terrain.walkable || pv.L.terrain.walkable(at.x, at.z))) return { room: roomAt(pv, at, ch), at };
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
  function makeClient(s) {
    return { send: d => s.send(d), you: patch => { if (patch.bar) { const o = online.get(s.charId); if (o) o.bar = patch.bar; } s.sendJSON({ t: 'you', ...patch }); } };
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
        bag: ch.bag || [], equipment: equipView(o), ignore: ch.ignore || [], waystones: ch.waystones || [], treasure: ch.treasure || {},
        quests: (provOf(o.room) || first).book.view(ch),
        opened: Object.keys(ch.opened || {}).filter(k => ch.opened[k] > t),
      },
    };
    // the skill bar only changes on a level-up / form / talent (those arrive as `you {bar}` and refresh o.bar): a room
    // change reuses the last one instead of formatting it again (a crowd crossing a town edge, a login storm)
    const bar = o.bar && handoff && handoff.via !== 'relocate' ? o.bar : (o.room.barFor ? o.room.barFor(e) : undefined);
    if (bar) { msg.you.bar = bar; o.bar = bar; }
    if (handoff) msg.handoff = handoff;
    if (liveEvent) msg.event = eventView(liveEvent);
    s.sendJSON(msg);
  }

  // ---- presence for the gateway (parties, ignore, the director) ----
  function presence(o) {
    send({ k: 'presence', char: o.char.id, name: o.char.name, cls: o.char.cls, level: o.char.level, room: o.room.id, province: provOf(o.room).L.key, zone: o.zone || null, online: !!o.conn, ignore: o.char.ignore || [], mutedUntil: o.char.mutedUntil || 0, account: o.char.account });
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
    if (from.kind === 'instance' && from.meta.backfillOwner === o.char.id) from.meta.backfilled = false;
    if (to.kind === 'instance' && to.meta.backfill && via !== 'callboard') backfillIn(to, o);
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
      send({ k: 'relocate', char: o.char.id, account, province, at, via, claimed: !!o.claimed });
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
      if (d.portal.to === 'here') { transfer(o, o.room, { x: d.portal.x, z: d.portal.z }, 'stairs'); return questFloor(o); }
      if (d.portal.to === 'wilds') { const back = { x: d.portal.x, z: d.portal.z }; o.char.exit = null; return transfer(o, pickCopy(o.char, o), back, 'exit'); }
      if (d.portal.to === 'dungeon') return enterDungeon(o, obj);
    }
    if (d.waystone) return discover(o, obj);
    if (d.treasure) return treasureUse(o, obj);
    if (d.note || d.npc || d.use || d.chest) questTouch(o, obj);          // talk / use steps, and what this one offers
    if (d.chest) return openChest(o, obj);
    if (d.note) return s.sendJSON({ t: 'used', id, ok: true, kind: 'note', name: obj.name, text: d.note.text, quest: d.note.quest || undefined, ...questOffer(o, obj) });
    if (d.npc) return s.sendJSON({ t: 'used', id, ok: true, kind: 'npc', name: obj.name, says: d.npc.says, quest: d.npc.quest || undefined, role: d.npc.role || undefined, ...questOffer(o, obj) });
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
    const doorIdx = doorObj.data.portal.door || 0;
    const inst = instanceFor(pv, doorIdx, p ? p.id : null, ch.id, p ? p.members : [ch.id]);
    ch.exit = { x: doorObj.x + 3, z: doorObj.z + 3 };
    transfer(o, inst, inst.spawnPoint, 'portal');
  }
  /** One instance per party PER DOOR (caves and dungeons); made on first entry. */
  function instanceFor(pv, doorIdx, partyId, charId, members) {
    const key = (partyId ? 'p' + partyId : 'c' + charId) + ':' + doorIdx;
    let inst = pv.instances.get(key);
    if (!inst) inst = makeInstance(pv, key, partyId || null, members, doorIdx);
    inst.meta.allowed.add(charId);
    return inst;
  }
  /** The Callboard formed a group (js/sim/callboard.js): take this member into the party's instance of that door. */
  function callboardEnter(m) {
    const o = online.get(m.char);
    if (!o || !o.entity || o.relocating) return;
    if (m.party) partyOf.set(m.char, { id: m.party, leader: m.lead ?? m.members[0], members: m.members });
    const pv = P.get(m.province);
    if (!pv) return moveTo(o, m.province, { x: 0, z: 0, door: m.door, party: m.party }, 'callboard');   // another process: lands inside
    const d = pv.L.doors[m.door];
    if (!d) return;
    if (o.entity.dead) { o.entity.revive(1); }
    const inst = instanceFor(pv, m.door, m.party, o.char.id, m.members);
    for (const c of m.members) inst.meta.allowed.add(c);
    if (m.backfill && !inst.meta.backfill) inst.meta.backfill = m.backfill;
    o.char.exit = { x: d.x + 3, z: d.z + 3 };
    transfer(o, inst, inst.spawnPoint, 'callboard');
    if (m.roles) inst.meta.roles = m.roles;
    backfillIn(inst, o);
  }
  /** Callboard followers (C's rules.backfill): the first member in brings them; when that member leaves, the seats go
   *  with them and the next member in brings a fresh set. */
  function backfillIn(inst, o) {
    if (inst.kind !== 'instance' || !inst.meta.backfill || inst.meta.backfilled || !inst.rules || !inst.rules.backfill || o.room !== inst) return;
    inst.meta.backfilled = true; inst.meta.backfillOwner = o.char.id;
    safeRules(inst, 'backfill', o.entity, inst.meta.backfill, { roles: Object.values(inst.meta.roles || {}) });
  }
  /** The gateway takes gold for a service (a guild's founding fee): all or nothing, journaled, a sink. */
  function chargeGold(m) {
    const o = online.get(m.char);
    const gold = Math.max(0, m.gold | 0);
    if (!o || o.frozen || o.saving || (o.char.gold || 0) < gold) return send({ k: 'charged', req: m.req, ok: false });
    o.char.gold -= gold;
    journal(o, 'gold', { d: -gold });
    econ.add('sink', m.reason || 'service', { gold }, o.char.level || 1);
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: o.char.gold });
    o.dirty = true;
    saveNow(o);
    send({ k: 'charged', req: m.req, ok: true });
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
  /** Treasure chains (PLAN §3.7): clues are read in any order and remembered; the cache opens once per character
   *  when every clue of its chain is found. ch.treasure = { chain: { found: [steps], done: wall ms } }. */
  function treasureUse(o, obj) {
    const ch = o.char, s = o.conn, t = obj.data.treasure;
    ch.treasure ||= {};
    const rec = ch.treasure[t.chain] ||= { found: [] };
    if (!t.cache) {
      const fresh = !rec.found.includes(t.step);
      if (fresh) { rec.found.push(t.step); rec.found.sort((a, b) => a - b); journal(o, 'set', { k: 'treasure', v: ch.treasure }); o.dirty = true; }
      const left = t.of - rec.found.length;
      return s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'clue', name: obj.name, text: t.text, chain: t.chain, chainName: t.chainName, step: t.step, of: t.of, found: rec.found, fresh, hint: left === 0 ? (hintOf(o, t.chain) || undefined) : undefined });
    }
    if (rec.done) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'opened', msg: 'You already dug this up.' });
    if (rec.found.length < t.step) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'locked', msg: 'Nothing here you can find yet. Follow the clues.', chain: t.chain, found: rec.found, of: t.step });
    rec.done = wallNow();
    journal(o, 'set', { k: 'treasure', v: ch.treasure }); o.dirty = true;
    const lvl = t.level || o.entity.level;
    const items = (o.room.rules.rollLoot ? safeRules(o.room, 'rollLoot', o.entity, { level: lvl, tier: t.tier }) : null) || [];
    s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'cache', chain: t.chain, chainName: t.chainName });
    o.room.emit({ type: 'open', to: o.entity.id, d: obj.id, x: obj.x, z: obj.z });
    grant(o, { items, gold: Math.round(lvl * 10 + 20), reason: 'treasure', goldAdded: false, from: obj });
    saveNow(o);
  }
  function hintOf(o, chain) { for (const x of o.room.objects.values()) if (x.data && x.data.treasure && x.data.treasure.chain === chain && x.data.treasure.cache) return x.data.treasure.hint; return null; }
  function openChest(o, obj) {
    const ch = o.char, e = o.entity, c = obj.data.chest, s = o.conn;
    const key = o.room.kind === 'instance' ? o.room.id + ':' + c.key : objKey(o, c.key);
    const t = wallNow();
    pruneOpened(ch, t);
    if (c.only && !c.only.includes(ch.id)) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'locked', msg: 'Only those who fought for it can open this.' });
    if ((ch.opened[key] || 0) > t) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'opened', msg: 'You already emptied this chest.' });
    if (c.after && !((ch.opened[objKey(o, c.after)] || 0) > t)) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'locked', msg: (c.afterName ? 'Try the ' + c.afterName.toLowerCase() + ' first.' : 'It will not open yet.') });
    const lvl = c.level || e.level;
    const items = (o.room.rules.rollLoot ? safeRules(o.room, 'rollLoot', e, { level: lvl, tier: c.tier }) : null) || [];
    const gold = Math.round(lvl * 4 + 5);
    ch.gold = (ch.gold || 0) + gold;
    ch.opened[key] = t + (c.onceMs || (o.room.kind === 'instance' ? 24 * 3600000 : chestResetMs));
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

  // ---- events: the realm event (the director starts it here) and every copy's own zone events (PLAN §5.2) ----
  let liveEvent = null, realmRun = null;
  const zoneRuns = new Map();     // `${room.id}|${zone}` -> { run, room, def }
  const zoneNext = new Map();     // same key -> room clock ms when the next may start
  const eventView = ev => ({ id: ev.id, uid: ev.uid, name: ev.name, province: ev.province, x: ev.x, z: ev.z, r: ev.r || 50, level: ev.level, kind: ev.kind || 'boss', zoneName: ev.zoneName || null });
  /** The room holding a point: a hub town's room when it is inside one (a town attack), else the first copy. */
  function roomForPoint(pv, p) { const ti = pv.L.towns.findIndex(t => Math.hypot(p.x - t.x, p.z - t.z) < t.r); return ti >= 0 ? pv.towns[ti] : pv.copies[0]; }
  function onEvent(m) {
    if (m.op === 'live') { liveEvent = m.ev; return; }
    if (m.op === 'stop') {
      if (liveEvent && liveEvent.uid === m.uid) liveEvent = null;
      if (realmRun && realmRun.run.ev.uid === m.uid) { realmRun.run.stop(); realmRun = null; }
      return;
    }
    if (m.op === 'start') {
      const ev = m.ev, pv = P.get(ev.province);
      if (!pv) return;
      liveEvent = ev;
      if (realmRun) realmRun.run.stop();
      const room = roomForPoint(pv, ev);
      realmRun = { room, run: createEventRunner({ room, ev: { ...ev, warnMs: 0 }, rng: () => room.host.random('event'), info: encounterInfo }) };
      realmRun.run.contrib = new Map();
      realmRun.run.step();
    }
  }
  /** Credit is by CONTRIBUTION (PLAN §5.2): damage to the event's monsters, healing someone in it, or a killing blow.
   *  Enrolled but idle earns nothing; fallen but contributing still earns. Loot is personal. A realm WORLD BOSS also
   *  leaves a cache only its contributors can open, and the first kill of the day rolls one extra reward each. */
  function rewardEvent(run, room) {
    const paid = [];
    for (const c of run.enrolled) {
      const o = online.get(c);
      if (!o || !o.entity || o.room !== room) continue;
      if (!((run.contrib && run.contrib.get(c)) > 0)) continue;
      questEvent(o, { kind: 'event', encounter: run.ev.boss || run.ev.id });
      const rw = eventReward(run.ev, o.room.rules, o.entity, () => room.host.random('event'));
      const rwd = run.ev.reward || {};
      if (rwd.firstKillDaily && rwd.firstKillDaily.item) {
        const day = Math.floor(wallNow() / 86400000), key = 'wb:' + run.ev.id;
        o.char.daily ||= {};
        if (o.char.daily[key] !== day) {
          o.char.daily[key] = day;
          journal(o, 'set', { k: 'daily', v: o.char.daily });
          const fk = rwd.firstKillDaily.item;
          if (o.room.rules.rollLoot && room.host.random('event') < (fk.chance ?? 1)) rw.items = rw.items.concat(safeRules(o.room, 'rollLoot', o.entity, { level: run.ev.level, tier: fk.tier || 'legendary' }) || []);
        }
      }
      o.room.award(o.entity, { ...rw, reason: 'event' });
      paid.push(c);
    }
    if (paid.length && run.ev.kind === 'worldboss' && run.ev.reward && run.ev.reward.chest) {
      const v = run.view();
      const chest = room.spawn({ kind: 'object', type: 'chest', name: 'World cache', x: v.x, z: v.z, team: 0,
        data: { state: 'idle', chest: { key: 'wb:' + run.ev.uid, tier: (run.ev.reward.item && run.ev.reward.item.tier) || 'rare', level: run.ev.level || 10, only: paid, onceMs: 24 * 3600000 } } });
      room.host.despawn(chest, 10 * 60000);
    }
    counters.eventPaid = (counters.eventPaid || 0) + paid.length;
    send({ k: 'eventReward', uid: run.ev.uid, chars: paid });
  }
  function runByUid(uid) {
    if (realmRun && realmRun.run.ev.uid === uid) return realmRun.run;
    for (const z of zoneRuns.values()) if (z.run.ev.uid === uid) return z.run;
    return null;
  }
  function contribute(ev, r) {
    if (!realmRun && !zoneRuns.size) return;
    const src = r.entities.get(ev.type === 'die' ? ev.by : ev.s), dst = r.entities.get(ev.d);
    if (!src || !dst || src.kind !== 'player' || !src.char) return;
    const add = (run, n) => { if (run && run.contrib) run.contrib.set(src.char.id, (run.contrib.get(src.char.id) || 0) + n); };
    if (dst.kind === 'monster' && dst.data && dst.data.event) return add(runByUid(dst.data.event), ev.type === 'die' ? 1 : Math.max(1, ev.n || 1));
    if (ev.type === 'hit' && ev.kind === 'heal' && dst.kind === 'player' && dst.char && (ev.n || 0) > 0) {
      if (realmRun && realmRun.room === r && realmRun.run.enrolled.has(dst.char.id)) add(realmRun.run, ev.n * 0.5);
      for (const z of zoneRuns.values()) if (z.room === r && z.run.enrolled.has(dst.char.id)) add(z.run, ev.n * 0.5);
    }
  }
  function frameTo(run, room) {
    const v = run.view();
    const msg = JSON.stringify({ t: 'eventFrame', ...v });
    for (const p of room.host.near(v.x, v.z, v.r * 2 + 30, x => x.kind === 'player')) { const c = room.clients.get(p.id); if (c) c.send(msg); }
    return v;
  }
  function eventTick() {
    if (realmRun) {
      const { run, room } = realmRun;
      const res = run.step();
      if (res !== 'live') {
        if (res === 'won') rewardEvent(run, room);
        send({ k: 'eventState', uid: run.ev.uid, state: res });
        realmRun = null;
      } else {
        const v = frameTo(run, room);
        send({ k: 'eventState', uid: run.ev.uid, state: 'live', hp: v.hp, players: v.players, phase: v.phase });
      }
    }
    zoneEventsTick();
  }
  function zoneEventsTick() {
    for (const pv of P.values()) {
      const defs = pv.L.zoneEvents || [];
      if (!defs.length) continue;
      for (const room of pv.copies) {
        // who is in which zone of this copy
        const inZone = new Map();
        for (const c of room.clients.values()) { const z = pv.L.zoneOf(c.entity.x, c.entity.z); (inZone.get(z) || inZone.set(z, []).get(z)).push(c); }
        const t = room.now();
        for (const def of defs) {
          const key = room.id + '|' + def.id;
          const cur = zoneRuns.get(key);
          const here = inZone.get(def.zone) || [];
          if (cur) {
            const res = cur.run.step();
            if (res === 'live') { frameTo(cur.run, room); continue; }
            if (res === 'won') rewardEvent(cur.run, room);
            tellZone(here, { kind: 'end', ev: cur.run.view(), won: res === 'won' });
            zoneRuns.delete(key);
            zoneNext.set(key, t + gapOf(def, room));
            continue;
          }
          if (!zoneNext.has(key)) { zoneNext.set(key, t + (zoneEventFirstMs ?? Math.round(5 * 60000 + room.host.random('event') * Math.max(0, def.everyMs[0] - 5 * 60000)))); continue; }
          if (t < zoneNext.get(key) || !here.length) continue;      // a zone event plays where somebody can see it
          const ev = { ...def, uid: def.id + ':' + room.id + ':' + t, scale: eventScale(here.length, opts.eventSize) };
          const run = createEventRunner({ room, ev, rng: () => room.host.random('event'), info: encounterInfo });
          run.contrib = new Map();
          zoneRuns.set(key, { run, room, def });
          tellZone(here, { kind: def.warnMs ? 'soon' : 'start', ev: run.view(), text: def.announce[0] || undefined, at: def.warnMs ? wallNow() + def.warnMs : undefined });
          run.step();
        }
      }
    }
  }
  const gapOf = (def, room) => zoneEventGapMs ?? Math.round(def.everyMs[0] + room.host.random('event') * (def.everyMs[1] - def.everyMs[0]));
  function tellZone(clients, msg) { const d = JSON.stringify({ t: 'zoneEvent', ...msg }); for (const c of clients) c.send(d); }

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
    if (ev.type === 'hit' || ev.type === 'die') contribute(ev, r);
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
      if (d.kind === 'monster') questKill(r, d, ev);
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
    for (let i = list.length - 1; i >= 0; i--) if (list[i].e.removed) list.splice(i, 1);
    const same = list.filter(t => t.kind === kind);
    while (same.length >= (MAX_TRACES[kind] || 40)) { const t = same.shift(); list.splice(list.indexOf(t), 1); if (!t.e.removed) r.remove(t.e); }
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
    const banner = { by: leader, party: members.length, at: wallNow(), until: wallNow() + BANNER_MS, place: inst.name };
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
      const cell = Math.floor(o.entity.x / HEAT_CELL) + ':' + Math.floor(o.entity.z / HEAT_CELL);
      const moved = o.heatAt ? Math.round(Math.hypot(o.entity.x - o.heatAt.x, o.entity.z - o.heatAt.z) / 0.8) : 0;     // ~0.8 m a step
      o.heatAt = { x: o.entity.x, z: o.entity.z };
      if (moved) d.heat.set(cell, Math.min(65535, (d.heat.get(cell) || 0) + Math.min(moved, 20)));
      if (o.zone !== z) { o.zone = z; o.conn.sendJSON(zoneMsg(pv, z)); presence(o); }
      if (pv.book.wantsPosition(o.char)) questEvent(o, { kind: 'visit', x: o.entity.x, z: o.entity.z });
    }
  }
  function zoneMsg(pv, z) {
    const d = deedOf(z);
    const heat = [...d.heat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([k, v]) => { const [x, zz] = k.split(':').map(Number); return [x * HEAT_CELL + HEAT_CELL / 2, zz * HEAT_CELL + HEAT_CELL / 2, v]; });
    const zs = pv.L.zones.find(q => q.key === z);
    return { t: 'zone', zone: z, name: (zs && zs.sheet && zs.sheet.name) || pv.L.name, band: zs && zs.sheet ? zs.sheet.band : null, deeds: { rares: d.rares, bosses: d.bosses, elites: d.elites, deaths: d.deaths, visitors: d.visitors.size }, heat };
  }

  // ---- day/night + NPC schedules ----
  const timeOfDay = () => (((wallNow() - realmClock.epoch) % realmClock.dayMs) + realmClock.dayMs) % realmClock.dayMs / realmClock.dayMs;
  const isNight = () => { const t = timeOfDay(); return t < 0.22 || t > 0.8; };
  const PHASES = { dawn: 0.2, day: 0.27, dusk: 0.75, night: 0.82, late: 0.95 };
  const barkAt = new Map();
  function npcTick(dtMs) {
    const t = timeOfDay(), night = isNight(), phases = (first.L.schedules && first.L.schedules.clock.phases) || PHASES;
    for (const pv of P.values()) for (const r of pv.towns) {
      for (const n of r.objects.values()) {
        const sc = n.kind === 'npc' && n.data && n.data.schedule;
        if (!sc || !sc.blocks) continue;
        const goal = blockAt(sc.blocks, t, phases).at;
        const dx = goal.x - n.x, dz = goal.z - n.z, d = Math.hypot(dx, dz);
        if (d < 0.3) { n.loop('idle'); if (goal.yaw !== undefined) n.face(goal.yaw); barkNear(r, n, sc, night); continue; }
        // nobody watching (no player within 80 m): just be there
        if (d > 3 && !r.host.near(n.x, n.z, 80, x => x.kind === 'player').length) { n.moveTo(goal.x, goal.z); n.loop('idle'); continue; }
        const stepM = Math.min(d, 1.6 * dtMs / 1000);
        n.face(Math.atan2(dx, dz)); n.moveTo(n.x + dx / d * stepM, n.z + dz / d * stepM); n.loop('walk');
      }
    }
  }
  /** A short bark when a player walks within 6 m (one per NPC per 90 s; stream E's `says` pools by day/night). */
  function barkNear(r, n, sc, night) {
    const pool = sc.says && (night ? sc.says.night : sc.says.day);
    if (!pool || !pool.length) return;
    const t = now();
    if (t - (barkAt.get(n) || -1e9) < 90000) return;
    if (!r.host.near(n.x, n.z, 6, x => x.kind === 'player').length) return;
    barkAt.set(n, t);
    r.emit({ type: 'say', id: n.id, text: pool[Math.floor(r.host.random('bark') * pool.length)], style: 'bark' });
  }


  // ---- quests (js/sim/quests.js; stream E's data/quests/**) ----
  const bookOf = o => (provOf(o.room) || first).book;
  /** The object a player is talking to, as the quest book sees it. */
  function giverOf(obj) {
    const d = obj.data || {}, key = d.key || ('obj:' + obj.id);
    const m = /^vig:([^:]+):\d+$/.exec(key);
    return { key, npcId: (d.npc && d.npc.id) || null, name: obj.name, role: (d.npc && d.npc.role) || null, x: obj.x, z: obj.z, vignette: m ? m[1] : null, objectName: obj.name };
  }
  function sendQuests(o) { if (o.conn) o.conn.sendJSON({ t: 'quests', ...bookOf(o).view(o.char) }); }
  function questSaved(o) { journal(o, 'set', { k: 'quests', v: o.char.quests }); o.dirty = true; }
  function questEvent(o, ev) {
    const moved = bookOf(o).progress(o.char, ev);
    if (moved.length) { questSaved(o); sendQuests(o); }
    return moved;
  }
  function questTouch(o, obj) {
    const g = giverOf(obj);
    if (g.npcId) questEvent(o, { kind: 'talk', npcId: g.npcId, x: obj.x, z: obj.z });
    else if (obj.data && obj.data.npc) questEvent(o, { kind: 'talk', npcId: null, x: obj.x, z: obj.z });
    if (g.vignette) questEvent(o, { kind: 'use', vignette: g.vignette, name: obj.name });
  }
  function questOffer(o, obj) {
    const b = bookOf(o), g = giverOf(obj);
    const offers = b.offers(o.char, g), ready = b.ready(o.char, g);
    if (offers.length) o.dirty = true;                    // job boards remember what they offered
    return offers.length || ready.length ? { offers, ready } : {};
  }
  /** Everyone who gets credit for a kill: the killer, whoever hurt it in the last 30 s, and their party members within 60 m. */
  function creditOf(r, d, ev) {
    const out = new Set();
    const killer = ev.by ? r.entities.get(ev.by) : null;
    if (killer && killer.char) out.add(killer.char.id);
    const hits = attackers.get(r.id + ':' + d.id);
    if (hits) { const t = now(); for (const [c, at] of hits) if (t - at < 30000) out.add(c); }
    for (const c of [...out]) {
      const p = partyOf.get(c);
      if (p) for (const m of p.members) { const mo = online.get(m); if (mo && mo.room === r && Math.hypot(mo.entity.x - d.x, mo.entity.z - d.z) < 60) out.add(m); }
    }
    return [...out].map(c => online.get(c)).filter(o => o && o.room === r);
  }
  function questKill(r, d, ev) {
    const who = creditOf(r, d, ev);
    if (!who.length) return;
    const night = isNight();
    const kev = { kind: 'kill', type: d.type, encounter: (d.data && d.data.encounter) || null, rank: d.rank, x: d.x, z: d.z, night };
    for (const o of who) questEvent(o, kev);
    if (r.kind === 'instance' && d.rank === 'boss') {
      const pv = provOf(r), door = pv.L.doors[r.meta.door] || {};
      for (const o of [...online.values()].filter(x => x.room === r)) questEvent(o, { kind: 'clear', door: r.meta.door, zone: door.zone, boss: true, floor: 99 });
    }
  }
  function questFloor(o) {
    const r = o.room;
    if (r.kind !== 'instance' || !r.meta.plan) return;
    const fl = r.meta.plan.floors;
    let i = 0; for (let k = 0; k < fl.length; k++) if (o.entity.x >= fl[k].origin.x) i = k;
    const door = provOf(r).L.doors[r.meta.door] || {};
    questEvent(o, { kind: 'clear', door: r.meta.door, zone: door.zone, boss: false, floor: i + 1 });
  }
  function questOp(o, m) {
    const s = o.conn, b = bookOf(o), ch = o.char;
    const reply = (x) => s.sendJSON({ t: 'questR', op: m.op, id: m.id, ...x });
    if (m.op === 'abandon') { const r = b.abandon(ch, m.id); if (r.ok) { questSaved(o); sendQuests(o); } return reply(r); }
    if (m.op !== 'accept' && m.op !== 'turnin') return bad(s, 'op');
    const near = m.npc ? o.room.objectNear(o.entity, m.npc, 6) : { why: 'unknown' };
    if (near.why) return reply({ ok: false, why: near.why, msg: near.why === 'far' ? 'Walk over to them first.' : 'Who?' });
    const g = giverOf(near.o);
    if (m.op === 'accept') {
      const r = b.accept(ch, m.id, g);
      if (r.ok) { questSaved(o); sendQuests(o); if (g.npcId) questEvent(o, { kind: 'talk', npcId: g.npcId, x: g.x, z: g.z }); }
      return reply(r);
    }
    const r = b.turnIn(ch, m.id, g);
    if (!r.ok) return reply(r);
    questSaved(o);
    const e = o.entity, rules = o.room.rules, lv = r.reward.level;
    const span = rules.xpFor ? Math.max(1, (safeRules(o.room, 'xpFor', lv + 1) || 0) - (safeRules(o.room, 'xpFor', lv) || 0)) : 100;
    const xp = Math.round(r.reward.xpShare * span);
    const items = r.reward.item && rules.rollLoot ? (safeRules(o.room, 'rollLoot', e, { level: Math.max(lv, e.level || 1), tier: r.reward.item.tier || 'common' }) || []) : [];
    reply({ ok: true, reward: { xp, gold: r.reward.gold, items: items.length }, next: r.next || undefined });
    o.room.award(e, { xp, gold: r.reward.gold, items, reason: 'quest' });
    econ.add('faucet', 'quest', { gold: r.reward.gold }, ch.level || 1);
    sendQuests(o);
    saveNow(o);
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
  const mail = createMail({ store, online, journal, syncChar: o => syncChar(o), econ, trades, send, setTimeoutTicks, wallNow, filter: chatFilter, log, counters, BAG_MAX, saveNow: o => saveNow(o), opts: mailOpts });

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
    if (joining.size) drainJoins(t0);
    if (tickTimers.length) for (let i = tickTimers.length - 1; i >= 0; i--) if (tickTimers[i].at <= ticks) { const f = tickTimers[i].fn; tickTimers.splice(i, 1); f(); }
    if (ticks % 10 === 0) sendFrames();
    if (ticks % 20 === 5) eventTick();           // events (realm + zone) at 1 Hz
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
      send({ k: 'status', status: brief() });          // once a second: the gateway's /status (stage 2)
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
      if (realmRun && realmRun.room === r) continue;
      if (r.kind === 'wilds') { let busy = false; for (const z of zoneRuns.values()) if (z.room === r) busy = true; if (busy) continue; }
      if (!r.meta.emptySince) r.meta.emptySince = t;
      const idle = r.kind === 'instance' ? instanceIdleMs : copyIdleMs;
      if (t - r.meta.emptySince >= idle) closeRoom(r);
    }
  }
  function flushEconomy() {
    const rows = econ.drain();
    if (rows.length && store.logEconomy) store.logEconomy(rows).catch(err => log('economy flush failed', err && err.message));
  }

  /** Warm the combat core before anyone arrives: the first character ever placed costs ~0.4 s (engine warm-up) and each
   *  class's first ~5 ms — paid at boot instead of inside the first ticks of a login storm. */
  function warmRules() {
    const r = first && first.towns[0];
    if (!r) return;
    const t0 = perfNow();
    const list = (opts.classes && opts.classes.length ? opts.classes : ['warrior']).slice(0, 64);
    list.forEach((cls, i) => {
      try {
        const e = r.addPlayer({ id: -1 - i, account: 0, name: 'Warmup', cls, level: 1, xp: 0, gold: 0, bag: [], equipment: {}, opened: {}, ignore: [], waystones: [], treasure: {}, quests: { active: {}, done: {}, jobs: {} }, daily: {} }, null, null);
        if (r.barFor) r.barFor(e);
        r.remove(e);
      } catch (err) { log('warm-up failed for ' + cls, err && err.message); }
    });
    counters.warmMs = Math.round(perfNow() - t0);
  }
  async function init() {
    await store.init();
    if (opts.warm !== false) warmRules();
    const n = await store.clearLeases(processName + ':');
    if (n) log(`cleared ${n} stale lease(s) from a previous run of ${processName}`);
    send({ k: 'hello', proc, provinces: [...P.keys()], waystones: allWaystones().map(w => ({ key: w.key, name: w.name, x: w.x, z: w.z, province: w.province })), doors: callboardDoors() });
  }
  /** TEST-ONLY (server/dev-hooks.mjs, `--dev-hooks`): set a character's level everywhere it is read. */
  function devSetLevel(charId, level) {
    const o = online.get(charId);
    if (!o) return false;
    const lv = Math.max(1, Math.min(50, level | 0));
    o.entity.setLevel(lv); o.char.level = lv; o.dirty = true;
    presence(o);
    if (o.conn) o.conn.sendJSON({ t: 'you', level: lv });
    return lv;
  }
  /** Dungeon doors for the Callboard: real dungeons (not one-floor caves), with a name and a level band. */
  function callboardDoors() {
    const out = [];
    for (const pv of P.values()) pv.L.doors.forEach((d, i) => {
      if (d.kind === 'cave') return;
      const ds = (d.sheet && d.sheet.dungeon) || {};
      const lvl = ds.level || dungeonLevel;
      const band = (d.sheet && d.sheet.band) || ds.band || [Math.max(1, lvl - 2), lvl + 3];
      const fam = ds.family || (ds.families && ds.families[0]) || null;
      const kind = fam ? fam.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : (d.name || 'Dungeon');
      const where = d.sheet && d.sheet.name;
      out.push({ key: pv.L.key + ':' + i, province: pv.L.key, door: i, zone: d.zone || null, name: ds.name || (where ? where + ': ' + kind : (d.name || 'Dungeon')), level: lvl, band, floors: ds.floors || 2 });
    });
    return out;
  }
  async function shutdown(code = 'restart') {
    for (const s of [...kit.sessions]) s.kick(code);
    await Promise.all([...online.values()].map(o => logout(o)));
    await flushJournal();
    flushEconomy();
    for (const s of [...kit.sessions]) s.closeSoon(code);
  }
  function brief() {
    const list = [];
    for (const r of rooms.values()) { let monsters = 0; for (const e of r.entities.values()) if (e.kind === 'monster') monsters++; list.push({ id: r.id, kind: r.kind, players: r.clients.size, monsters }); }
    return { proc, ccu: [...online.values()].filter(o => o.conn).length, online: online.size, tick: tickStats.summary(), rooms: list, bytesOutPerSec: rateWin.perSec.bytesOut, msgsInPerSec: rateWin.perSec.msgsIn };
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
      event: realmRun ? realmRun.run.view() : liveEvent ? { uid: liveEvent.uid } : null,
      zoneEvents: [...zoneRuns.values()].map(z => ({ room: z.room.id, ...z.run.view() })),
      timeOfDay: Math.round(timeOfDay() * 1000) / 1000,
      sessions: kit.sessions.size, joinQueue: joining.size, warmMs: counters.warmMs || 0,
      db: store.kind,
    };
  }

  return {
    accept, step, init, shutdown, status, rooms, P, online, partyOf, econ, tickStats, owner, counters, trades,
    room: copies[0], townRoom, copies, instances, town, door, gate,
    saveNow, logout, transfer, moveTo, grant, mute, flushEconomy, newUid, flushJournal, timeOfDay, devSetLevel,
    get liveEvent() { return liveEvent; },
  };
}

function roleName(role) {
  return { smith: 'Smith', merchant: 'Merchant', elder: 'Elder', innkeeper: 'Innkeeper', healer: 'Healer', unbinder: 'Unbinder', broker: 'Broker' }[role] || role;
}
