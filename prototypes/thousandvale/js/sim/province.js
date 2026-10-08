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

import { PROTOCOL_VERSION, TICK_MS, CODES, ITEM_OPS, STATE, TALENT_OPS, PERK_OPS, SHOP_OPS, MOUNT_OPS, PREF_KEYS, REVIVE_OPS } from '../net/protocol.js';
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
import { createEventRunner, eventReward, rewardPreview, ABANDON_MS } from './events.js';
import { eventScale } from './director.js';
import { createQuestBook } from './quests.js';
import { townFolk, blockAt } from './schedules.js';
import { createMail } from './mail.js';
import { createTravellers } from './travellers.js';
import { createCorpses } from './corpses.js';
import { createRoadEvents } from './roadevents.js';
import { createShops, SHOP_RANGE } from './shops.js';
import { configureNpcNames } from './npc-names.js';
import { createMountBook } from './mounts.js';
import { createCarts } from './carts.js';
import { cleanLook } from './looks.js';
import { effectOf as effectOfRaw, potionAmount, potionCdMs, potionText, GROUP_R as TONIC_R, stackable, stackKey, stackMaxOf, countOf } from './consumables.js';
import { isCrate, crateItem, openCrate } from './crates.js';
import { createSystemMail } from './sysmail.js';
import { createFeedback, NUDGE } from './feedback.js';
import { createAngling } from './angling.js';
import { createProfessions } from './professions.js';      // W9 (P-core)
import { configureEconomy, economy, chestGold, treasureGold, eventGold, travelFare as fareOf, cartFare } from './economy-knobs.js';
import { mountRefusal, mountSpeedMul, dismounts, MOUNT_RULES } from '../rules/mount.js';   // stream C's riding rules (when, how fast, what throws you)

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
export const UNBINDER_M = 8;               // P6: talents/perks are undone standing by an Unbinder
export const TRAVEL_PRELOAD_MS = 1500;     // P10: waystone / event travel tells the client where first, moves this much later
export const DISCOVER_PAD = 30;            // P3: a place is found within its radius + this many metres
export const KIT_VERSION = 2;              // P22: 1 = class weapon + off-hand only; play-test 5 T5: 2 = the kit picked at creation (when one was)
export const KIT_KEEP = new Set(['weapon', 'offhand', 'mainhand', 'offHand']);
export const RECENT_Q_MS = 15 * 60000;    // P17: kills / event wins / clears this recent count toward a quest you accept now
export const RECENT_Q_MAX = 60;
export const ROLES = ['smith', 'merchant', 'elder', 'innkeeper', 'healer', 'unbinder', 'broker'];
export const BARBER_M = 6;
export const FOLLOW_M = 40;               // Q2: you may follow someone this close (and not hostile)
export const CAST_REFUSAL_MS = 2000;      // Q1: the same refusal for the same slot is sent at most this often
export const REVIVE_ASK_MS = 60000;       // T4: how long a fallen player has to answer a revive (a skill may say otherwise, 5-120 s)
export const SHEETS_PER_TICK = 2;         // T18: character sheets worked out per tick at most (a login storm queues)…
export const SHEET_BUDGET_MS = 6;         // …and only while this tick has used less than this (C's estimator casts every ability at a dummy)
const RARE = new Set(['rare', 'unique', 'legendary', 'set']);

export function createProvince(opts) {
  const {
    proc = 0, layouts, store, bus = null, seed = 1, createRules = rulesV0,
    now = () => Date.now(), wallNow = () => Date.now(), log = () => {}, processName = 'p' + proc, lingerMs = 5000, saveEveryMs = 60000,
    journalMs = JOURNAL_FLUSH_MS, tradeMinLevel = 1, perfNow = now,
    copyIdleMs = 5 * 60000, instanceIdleMs = 30 * 60000, dungeonLevel = 3, encounterInfo = {},
    planDungeon = planTiers, filterText = t => t, chestResetMs = 30 * 60000,
    clock: realmClock = { epoch: wallNow(), dayMs: 2 * 3600000 }, travelFare = null,
    zoneEventFirstMs = null, zoneEventGapMs = null,        // tests: when the first / next zone event of a copy starts
    mailOpts = {}, chatFilter = null,
  } = opts;
  // V2 (owner feedback 7): every gold number the server applies comes from data/rules/economy.json `server` (js/sim/economy-knobs.js)
  if (opts.economy !== undefined || (layouts[0] && layouts[0].economy)) configureEconomy(opts.economy || layouts[0].economy);
  const owner = processName + ':' + randomHex(4);
  const bootNonce = randomHex(4);
  let uidN = 0;
  const newUid = () => `${processName}-${bootNonce}-${(++uidN).toString(36)}`;
  // U17 (play-test 6): potion numbers from shops.json `potions` when the file has them (E/C's one place for them)
  const potionTable = (layouts[0] && layouts[0].shops && layouts[0].shops.potions) || opts.potionTable || null;
  const effectOf = item => effectOfRaw(item, potionTable);
  const POTION_CD_MS = potionCdMs(potionTable);
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
    standUp: (e, why) => { const o = e.char ? online.get(e.char.id) : null; if (o && o.entity === e) endMeal(o, why); },   // S20
    dirty: (ch, urgent) => { const o = online.get(ch.id); if (o) { o.dirty = true; if (urgent) saveNow(o); if (urgent) presence(o); } },
    award: (e, a) => {
      const o = e.char && online.get(e.char.id);
      if (!o || o.entity !== e) return;
      if (a.xp) journal(o, 'xp', { d: a.xp, level: a.level });
      grant(o, { ...a, goldAdded: true });
      if (a.level >= 2) starterMount(o);                     // Q16: the first mount at level 5
      if (a.level !== o.sheetLevel) o.marksDirty = true;      // W12: a level can open a quest that was grey
      if (a.level > (o.alv || 1)) { o.alv = a.level; if (o.conn) o.conn.sendJSON({ t: 'you', acct: acctOf(o) }); }      // W11: the account's level rose
      if (a.level !== o.sheetLevel) { o.sheetLevel = a.level; wantSheet(o); potionCards(o); feedbackNudge(o); }   // T18: a level changes the sheet (and what a potion is worth to you)
    },
    newUid,
    loot: (ev, r) => { const e = r.entities.get(ev.to); const o = e && e.char && online.get(e.char.id); if (o && o.entity === e) grant(o, { items: ev.items, gold: 0, reason: 'kill', goldAdded: true }); },
    observe: (ev, r) => observe(ev, r),
    // play-test 2, Q3: a kill's gold + items wait on the corpse (js/sim/corpses.js); the body stays while they do
    holdKill: opts.corpseLoot === false ? null : (e, from, a, r) => corpses.hold(r, e, from, potionDrop(e, from, a, r)),
    keepBody: (e, r) => Math.max(corpses.keepBody(e, r) || 0, professions.keepBody(e)),      // W9 (P-core): a beast someone may still skin lies a little longer
    isNight: () => isNight(),
    partyLoot: opts.corpseLoot === false ? null : (members, items, corpse, partyId, r) => corpses.partyDrop(r, members, items, corpse, partyId),
    offerRevive: (caster, target, spec, r) => offerRevive(caster, target, spec, r),       // T4 (play-test 5)
    onSwim: (e, on) => { if (on && e.char) { const o = online.get(e.char.id); if (o && o.entity === e && o.mount) dismount(o, 'swim'); } },
  };
  const host = r => r.host;

  // S19 (play-test 4): titles above NPC names + real names for job-only placeholders (stream E's data/names/titles.json)
  configureNpcNames({ givers: (layouts[0] && layouts[0].givers) || null, titles: (layouts[0] && layouts[0].titles) || null, names: (layouts[0] && ((layouts[0].travel && layouts[0].travel.names) || layouts[0].names)) || null });
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
  for (const pv of P.values()) pv.book = createQuestBook({ layout: pv.L, zones: pv.L.zones || [], rares: pv.L.rares || {}, jobs: pv.L.jobs || null, rng: qRng, now: wallNow, isNight: () => isNight(), angling: (pv.L.angling && pv.L.angling.content) || null });
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
  /**
   * X7 (owner feedback 9): a posted guard's level (`data.guard.level`, read by stream C's rules) = the level of the town's own
   * raid when it has one (a realm event whose arena is the town), else the floor of the town's zone band. C raises it
   * further when a higher raid arrives.
   */
  function guardLevel(L, t) {
    const raid = (opts.events || []).filter(e => e.province === L.key && Number.isFinite(e.x) && Math.hypot(e.x - t.x, e.z - t.z) <= (t.r || 40) + 60).sort((a, b) => (b.level || 0) - (a.level || 0))[0];
    if (raid && raid.level) return raid.level;
    const z = L.zoneOf ? L.zoneOf(t.x, t.z) : null, zs = (L.zones || []).find(q => q.key === z);
    const band = (zs && zs.sheet && zs.sheet.band) || null;
    return Math.max(1, (Array.isArray(band) ? band[0] : 1) || 1);
  }
  function townObjects(L, t, i) {
    const out = [];
    for (const w of L.waystones) if (w.town === i) out.push({ type: 'waystone', name: 'Waystone', x: w.x, z: w.z, key: w.key, waystone: { key: w.key, name: w.name } });
    if (L.townObjects && L.townObjects[i]) out.push(...L.townObjects[i].map(o => (o.guard ? { ...o, guard: { ...o.guard, level: guardLevel(L, t) } } : o)));     // E's NPCs, notes… placed inside this town
    // town folk with day and night places (PLAN §4.3): stream E's schedules over stream B's town plan when both are
    // there (js/sim/schedules.js), else the roles round the square by day, at the inn by night
    if (L.schedules) {
      const staffed = officeFolk(L, t, i, out);          // Q10: stream E's offices.json, when it lists this town
      const quest = out.filter(o => o.type === 'npc' && o.npc && o.npc.id && !o.officeFixed);
      const posted = out.some(o => o.guard);              // W1: stream E posted this town's guards (gate + square) — the schedule's own are not added on top
      const folkOut = townFolk(t, { plan: L.townPlans && L.townPlans[i], schedules: L.schedules, kind: (L.townPlans && L.townPlans[i] && L.townPlans[i].kind) || t.kind || 'town', key: L.key + ':' + i, questNpcs: quest,
        onlyFolk: !!staffed, taken: staffed || [] });
      out.push(...(posted ? folkOut.filter(o => !(o.npc && o.npc.role === 'guard')) : folkOut));
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
  /**
   * Q10 with stream E's data/provinces/offices.json: one building plot per working NPC in each hub town (zone metres,
   * moved to world metres by the town's own centre). A quest NPC who keeps an office (`npc`) is ONE body: the placed quest
   * NPC takes the office's role / shop / door; otherwise a body is made for the office. Everyone stays at their door day
   * and night. Returns the doors taken (or null when E has no entry for this town -> schedules.js plans the offices).
   */
  function officeFolk(L, t, i, out) {
    const towns = L.offices && L.offices.towns;
    if (!towns) return null;
    const bare = n => String(n || '').toLowerCase().replace(/^the\s+/, '');
    const entry = Object.values(towns).find(x => bare(x.name) === bare(t.name));
    if (!entry || !Array.isArray(entry.offices)) return null;
    const dx = t.x - entry.x, dz = t.z - entry.z;
    const taken = [];
    for (const of of entry.offices) {
      const door = of.door || { x: of.x, z: of.z, yaw: of.yaw || 0 };
      const at = { x: door.x + dx, z: door.z + dz, yaw: door.yaw || 0 };
      const office = { kind: of.want || of.role, plot: of.plot || null, want: of.want || null, x: Math.round((of.x + dx) * 10) / 10, z: Math.round((of.z + dz) * 10) / 10, yaw: of.yaw || 0, w: of.w || null, d: of.d || null,
        lit: !!of.light, sign: of.sign || null, title: of.title || null, shop: of.shop || null, ...(of.home ? { home: true } : {}) };
      const npcInfo = { role: of.role, shop: of.shop || null, service: of.service || null, ...(of.trains ? { trains: of.trains } : {}), ...(typeof of.titled === 'boolean' ? { titled: of.titled } : {}) };
      const schedule = { blocks: [{ from: 0, at, do: 'work' }], says: null };
      const q = of.npc ? out.find(o => o.type === 'npc' && o.npc && o.npc.id === of.npc) : null;
      if (q) { q.npc = { ...q.npc, ...npcInfo }; Object.assign(q, { x: at.x, z: at.z, yaw: at.yaw, office, schedule, officeFixed: true }); }
      else out.push({ type: 'npc', name: of.name || of.title || of.role, x: at.x, z: at.z, yaw: at.yaw, key: `npc:${L.key}:${i}:${of.plot || of.role}`, npc: { ...(of.npc ? { id: of.npc } : {}), says: [], ...npcInfo }, office, schedule, officeFixed: true });
      taken.push({ x: at.x, z: at.z, plot: of.plot || null });
    }
    return taken;
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
        ...L.objects.map(o => (o.guard ? { ...o, guard: { ...o.guard, level: guardLevel(L, L.towns.slice().sort((a, b) => Math.hypot(a.x - o.x, a.z - o.z) - Math.hypot(b.x - o.x, b.z - o.z))[0] || { x: o.x, z: o.z }) } } : o)),      // X7: a guard posted just outside a town's ring
      ],
      describeExtra: describeFor(L),
    });
    rooms.set(r.id, r); pv.copies.push(r); counters.copiesMade++;
    // the living roads (P19): travellers walking E's routes between towns, folk at work, chatter about the day
    // (made on the copy's first NPC tick: the clock helpers it reads are declared further down this file)
    if (opts.travellers !== false && (L.travel || (L.folk && L.folk.length))) r.meta.roads = { pv, n };
    return r;
  }
  function roadsFor(r) {
    const { pv, n } = r.meta.roads; r.meta.roads = null;
    let ts = (seed * 2246822519 + n * 3266489917) >>> 0;
    const trng = () => { ts = (ts + 0x6D2B79F5) >>> 0; let x = ts; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
    try { r.travellers = createTravellers({ room: r, travel: pv.L.travel, folk: pv.L.folk || [], rng: trng, context: (x, z) => chatterContext(pv, r, x, z), isNight: () => isNight(), phase: () => dayPhase(), log }); }
    catch (err) { log('travellers failed', err && err.stack); }
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
    const steps = {};       // play-test 3 R2: the sheet's level steps (the starter dungeon is gentler), E's planDungeon options
    for (const k of ['floorStep', 'eliteStep', 'bossStep']) if (Number.isFinite(ds[k])) steps[k] = ds[k];
    const plan = caveDungeon(planDungeon(dseed, { floors: ds.floors || 2, level: ds.level || dungeonLevel, ...(family ? { family } : {}), ...steps }), d.cave || null);
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
    if (r.travellers) { try { r.travellers.dispose(); } catch { /* gone */ } r.travellers = null; }
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
      case 'claimed': { for (const o of online.values()) if (o.char.account === m.account) { o.claimed = true; if (m.username) o.username = m.username; if (o.conn) o.conn.sendJSON({ t: 'you', acct: acctOf(o) }); } return; }
      case 'charge': return chargeGold(m);
      case 'callboard': return callboardEnter(m);
      case 'relocated': return relocated(m);
      case 'event': return onEvent(m);
      case 'waystones': remoteWaystones = m.list; return;
      case 'social': social.set(m.char, { friends: new Set(m.friends || []), tradeFriendsOnly: !!m.tradeFriendsOnly }); return;
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
        if (e.sitting) endMeal(o, 'cast');                      // S20: acting stands you up
        if (o.fishing) angling.stop(o, 'cast');                 // T25: a cast reels the line in
        if (o.mount && !e.dead) dismount(o, 'cast');            // Q16: attacking or casting gets you off the horse
        const msg = m.held !== undefined ? { ...m, held: Math.max(0, Math.min(5, m.held)) } : m;
        const res = r.intent(e, msg);
        // round 8 (C's W14: bolts and arrows TRAVEL, the hit lands on arrival): loosing a shot at a monster is fighting from the
        // moment it leaves the hand — else you could call a mount or board a cart while your own bolt is still in the air
        if (!(res && res.ok === false)) { const tg = r.entities.get(m.target || e.target); if (tg && tg.kind === 'monster' && !tg.dead) o.lastHitAt = now(); }
        if (res && res.ok === false) {
          // Q1 "not drawn, not drawn, not drawn": one refusal per slot and reason per CAST_REFUSAL_MS (the client
          // repeats its attack every frame while the button is down; the answer does not change that fast)
          const why = String(res.why || 'unknown').replace(/ (\w)/g, (_, c) => c.toUpperCase());
          const k = m.slot + ':' + why, t = now();
          o.castRefused ||= new Map();
          if (t - (o.castRefused.get(k) || -1e9) < CAST_REFUSAL_MS) return;
          o.castRefused.set(k, t);
          const out = { t: 'castR', slot: m.slot, ok: false, why };
          if (res.text) out.text = String(res.text).slice(0, 200);
          else if (why === 'notDrawn') out.text = 'Hold the attack to draw your bow, then let go.';
          if (Number.isFinite(res.need)) out.need = res.need;
          if (Number.isFinite(res.wait)) out.wait = Math.round(res.wait * 1000) / 1000;
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
      case 'use': return use(o, m.id, m.to);
      case 'item': return itemOp(o, m);
      case 'trade': return tradeOp(o, m);
      case 'travel': return travel(o, m.to);
      case 'trace': return trace(o, m.kind);
      case 'quest': return questOp(o, m);
      case 'mail': return mail.op(o, m).then(why => { if (typeof why === 'string') bad(s, why); });
      case 'talent': return talentOp(o, m);
      case 'perk': return perkOp(o, m);
      case 'map': return m.op === 'get' ? s.sendJSON(mapData(o)) : bad(s, 'op');
      // play-test 2
      case 'loot': { const why = corpses.op(o, m); if (typeof why === 'string') bad(s, why); return; }
      case 'shop': return shopOp(o, m);
      case 'mount': return mountOp(o, m);
      case 'barber': return barberOp(o, m);
      case 'pref': return prefOp(o, m);
      case 'cart': {      // W5: ox-cart travel
        const near = o.room.entities.get(m.id);
        if (!near || near.removed || !carts.stopFor(near)) return s.sendJSON({ t: 'cartR', op: m.op, ok: false, why: 'stop', msg: 'There is no cart here.' });
        if (m.op === 'go') return void carts.go(o, m, near);
        if (m.op !== 'list') return bad(s, 'op');
        if (Math.hypot(near.x - e.x, near.z - e.z) > carts.reachOf(near) + 0.5) return s.sendJSON({ t: 'cartR', op: 'list', ok: false, why: 'far', msg: 'Walk over to the cart first.' });
        return s.sendJSON(carts.list(o, near));
      }
      case 'meter': { o.meter = !!m.on; if (o.meter) meterOn.add(o); else { meterOn.delete(o); o.hitRows = null; } return s.sendJSON({ t: 'meterR', on: o.meter }); }      // W21
      case 'follow': return followOp(o, m);
      case 'inspect': return inspectOp(o, m);
      case 'bind': return bindOp(o, m);
      // play-test 5
      case 'revive': return reviveOp(o, m);
      case 'sheet': return wantSheet(o);
      case 'feedback': if (m.op !== 'mine') return feedbackOp(o, m);      // falls through: `feedback {op:'mine'}` is D-UI's name for feedbackMine
      case 'feedbackMine': return void feedback.listMine({ account: o.char.account, claimed: !!o.claimed }, m).then(r => { if (o.conn) o.conn.sendJSON(r); }, err => { log('feedback list failed', err && err.message); if (o.conn) o.conn.sendJSON({ t: 'feedbackMine', ok: false, why: 'failed', list: [], more: false }); });
      case 'admin': return adminOp(o, m);
      case 'fish': { const why = angling.fish(o, m); if (typeof why === 'string') bad(s, why); return; }
      case 'cook': { const why = angling.cook(o, m); if (typeof why === 'string') bad(s, why); return; }
      // W9 (P-core): professions — learn, gather, make (js/sim/professions.js)
      case 'prof': { const why = professions.prof(o, m); if (typeof why === 'string') bad(s, why); return; }
      case 'gather': { const why = professions.gather(o, m); if (typeof why === 'string') bad(s, why); return; }
      case 'craft': { const why = professions.craft(o, m); if (typeof why === 'string') bad(s, why); return; }
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
    if (existing && !existing.relocating) { if (tk.claimed) existing.claimed = true; existing.admin = !!tk.admin; existing.username = tk.username || existing.username || null; existing.alv = Math.max(existing.alv || 1, tk.alv || 1); takeOver(existing, s); return; }
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
    aliasWaystones(ch);
    const place = placeFor(ch, tk);
    const client = makeClient(s);
    const o = { char: ch, fence: r.fence, entity: null, room: place.room, conn: s, lingerUntil: 0, dirty: false, saving: false, savePending: false, lastSaveAt: now(), homeCopy: null, seq: ch.jseq || 0, savedSeq: ch.jseq || 0, lastPos: null, frozen: false, zone: null, claimed: !!tk.claimed, admin: !!tk.admin, username: tk.username || null, alv: Math.max(tk.alv || 1, ch.level || 1) };
    online.set(ch.id, o);
    o.entity = place.room.addPlayer(ch, client, place.at);
    startingKit(o);
    lightSweep(o);                            // W22: lanterns and torches left the game — what the bag holds is paid back
    restack(o, false);                        // U5: an old save's loose potions become stacks before the first `joined`
    potionCards(o, false);                    // U17: their cards say what they do for THIS character
    applyRefunds(o);
    learnWaystone(o, homeWaystone(), 'start');
    starterMount(o, true);
    autoQuests(o);
    gearLook(o);
    tagParty(o);
    if (place.room.kind === 'wilds') o.homeCopy = place.room;
    s.state = 'in'; s.client = client;
    joined(s, o, tk.at ? { from: null, via: 'relocate' } : null);
    presence(o);
    feedbackNudge(o);                         // V1: a character already past level 3 gets its letter at this login
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
    return { send: d => s.send(d), you: patch => {
      const o = online.get(s.charId);
      if (o) {
        if (patch.talents) o.build = null;
        // T14 (play-test 5): the bar changed (a form, a stance, a weapon swap, a talent) — the basic attack may reach
        // further or less far now, so the reach rides along; and the sheet's numbers moved (T18)
        if (patch.bar) { o.bar = patch.bar; const r = attackReach(o); patch = { ...patch, reach: r, attackRange: r }; wantSheet(o); }
      }
      s.sendJSON({ t: 'you', ...patch });
    } };
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
        seen: ch.seen || { zones: [], places: [] },
        opened: Object.keys(ch.opened || {}).filter(k => ch.opened[k] > t),
        // play-test 2
        reach: attackReach(o), attackRange: attackReach(o), mounts: mountBook.owned(ch), mount: o.mount || null, speedMul: e.speedMul || 1, prefs: prefsOf(ch), look: ch.look || null, clsName: clsNameOf(ch.cls),
        // play-test 5
        bagMax: bagCap(o), bagBase: bagBase(), angling: angling.view(ch), professions: professions.view(ch) /* W9 (P-core) */, acct: acctOf(o), ...(rules.LIGHT && rules.LIGHT.radius ? { lightRange: rules.LIGHT.radius, light: rules.LIGHT } : {}), ...(o.admin ? { admin: true } : {}), ...(ch.kit ? { kit: ch.kit } : {}), ...(o.eventAtKey ? { eventAt: o.eventAtKey } : {}),
      },
    };
    // the skill bar only changes on a level-up / form / talent (those arrive as `you {bar}` and refresh o.bar): a room
    // change reuses the last one instead of formatting it again (a crowd crossing a town edge, a login storm)
    const bar = o.bar && handoff && handoff.via !== 'relocate' ? o.bar : (o.room.barFor ? o.room.barFor(e) : undefined);
    if (bar) { msg.you.bar = bar; o.bar = bar; }
    // the build view formats every talent card (C's talentView, ~ms): kept like the bar and rebuilt only on a change
    const build = o.build && handoff && handoff.via !== 'relocate' ? o.build : buildView(o);
    o.build = build; Object.assign(msg.you, build);
    if (handoff) msg.handoff = handoff;
    if (liveEvent) msg.event = eventView(liveEvent);
    s.sendJSON(msg);
    if (o.reviveAsk && e.dead && o.reviveAsk.until > now()) s.sendJSON(reviveAskMsg(o.reviveAsk));   // a reconnect while an offer is open
    if (!handoff || handoff.via === 'relocate') wantSheet(o);      // T18: the sheet follows the join (queued, not inside this tick's budget)
    if (o.lightNote) { s.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'The Vale', text: o.lightNote }); o.lightNote = null; }      // W22
    o.marks = null; o.marksFull = true; o.marksDirty = true;       // W12: entity ids are the room's — the whole map of marks follows within a second
  }

  // ---- presence for the gateway (parties, ignore, the director) ----
  /** X1 (owner feedback 9): the name of the zone a player stands in, for the admins' online list. */
  function zoneNameOf(o) { const pv = provOf(o.room); if (!pv) return null; const z = o.zone || (pv.L.zoneOf && o.entity ? pv.L.zoneOf(o.entity.x, o.entity.z) : null); const zs = (pv.L.zones || []).find(q => q.key === z); return (zs && zs.sheet && zs.sheet.name) || pv.L.name || null; }
  function presence(o) {
    const zn = zoneNameOf(o), town = o.room.kind === 'town' ? o.room.name : null;
    send({ k: 'presence', where: town || (o.room.kind === 'instance' ? (o.room.name || 'a dungeon') + ' (dungeon)' : zn) || null, zoneName: zn, town, roomKind: o.room.kind, char: o.char.id, name: o.char.name, cls: o.char.cls, level: o.char.level, room: o.room.id, province: provOf(o.room).L.key, zone: o.zone || null, online: !!o.conn, ignore: o.char.ignore || [], mutedUntil: o.char.mutedUntil || 0, account: o.char.account, look: o.char.look || null });
  }
  function sendFrames() {
    const rows = [];
    for (const o of online.values()) {
      const p = partyOf.get(o.char.id);
      if (!p || p.members.length < 2) continue;
      const e = o.entity;
      rows.push([o.char.id, Math.round(e.hp), e.hpMax, o.room.id, Math.round(e.x * 10) / 10, Math.round(e.z * 10) / 10, e.dead ? 1 : 0, o.conn ? 1 : 0, e.id, Math.round(e.mp || 0), e.mpMax || 0]);   // [9] mp [10] mpMax (R6+)
    }
    if (rows.length) send({ k: 'frames', rows });
  }

  // ---- moving between rooms ----
  function transfer(o, to, at, via) {
    const from = o.room, old = o.entity;
    if (to === from) {
      old.moveTo(at.x, at.z, undefined, true);           // a server teleport moves even a body
      const c = from.clients.get(old.id); if (c) c.selfDirty = true;
      return;
    }
    if (o.fishing) angling.stop(o, 'left');
    if (o.work) professions.stop(o, 'left');             // W9 (P-core)
    if (o.reviveAsk) endReviveAsk(o, 'gone');
    syncChar(o);
    const carry = old.r;
    const client = from.clients.get(old.id) || (o.conn && o.conn.client);
    from.remove(old);
    o.room = to;
    o.entity = to.addPlayer(o.char, client || null, { x: at.x, z: at.z, carry });
    corpses.leftRoom(o);
    if (o.mount) { if (to.kind === 'instance' || via === 'respawn') o.mount = null; else applyMount(o); }
    gearLook(o);
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
      send({ k: 'relocate', char: o.char.id, account, province, at, via, claimed: !!o.claimed, admin: !!o.admin, username: o.username || null, alv: acctOf(o).level });
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
    if (o.reviveAsk) endReviveAsk(o, 'declined');           // T4: releasing to town turns the offer down
    if (o.room.kind === 'instance') {
      // U12 (play-test 6): you get up on the floor you died on (its landing — E's arrival point, clear of packs), not at the top
      const plan = o.room.meta && o.room.meta.plan;
      const fl = plan ? plan.floors[floorAt(plan, e.x)] : null;
      const at = fl ? (fl.landing || fl.entry) : null;
      o.room.respawn(e, at);
      if (o.conn && fl) o.conn.sendJSON({ t: 'you', floor: fl.index + 1, respawned: 'floor' });
      return;
    }
    e.revive(1);
    o.room.rules.respawn && safeRules(o.room, 'respawn', e);
    o.room.statusChanged(e);                           // Q8: no aura survives a death
    o.char.hp = e.hpMax;
    const pv = provOf(o.room);
    // wake in the nearest town of this province
    let best = pv.towns[0], bd = Infinity;
    pv.L.towns.forEach((t, i) => { const d = Math.hypot(t.x - e.x, t.z - e.z); if (d < bd) { bd = d; best = pv.towns[i]; } });
    const home = o.char.bind ? rooms.get(o.char.bind) : null;          // your bound inn's town, when it is in this province
    if (home && home.area && provOf(home) === pv) best = home;
    transfer(o, best, { x: best.area.x, z: best.area.z }, 'respawn');
  }
  /**
   * The recall charm (C, the lead's follow-up): back to your bound town — `char.bind` (a town room id) when one is set,
   * else the nearest town of this province, as a respawn picks it. Called by rules.useItem when the 5 s channel completes.
   */
  function recall(o) {
    const e = o.entity;
    if (!e || e.dead || !o.room) return false;
    const pv = provOf(o.room);
    if (!pv || !pv.towns.length) return false;
    let best = o.char.bind ? rooms.get(o.char.bind) : null;
    if (!best || !best.area) {
      let bd = Infinity; best = pv.towns[0];
      pv.L.towns.forEach((t, i) => { const d = Math.hypot(t.x - e.x, t.z - e.z); if (d < bd) { bd = d; best = pv.towns[i]; } });
    }
    transfer(o, best, { x: best.area.x, z: best.area.z }, 'recall');
    return true;
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
  function use(o, id, to = null) {
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
    if (d.lift) return liftUse(o, obj, to);              // U12: the stair up asks which floor
    if (d.waystone) return discover(o, obj);
    if (d.treasure) return treasureUse(o, obj);
    if (d.road && roadEvents.use(o, obj)) return;                          // S5: a road event's chest / captive
    // W5 (round 8): an ox cart — the parked cart itself answers with the route list; a carter answers as an NPC and the list follows
    const cartStop = carts.stopFor(obj);
    if (cartStop && !d.npc) { s.sendJSON({ t: 'used', id, ok: true, kind: 'cart', name: obj.name, cart: cartStop.id }); const l = carts.list(o, obj); if (l) s.sendJSON(l); return; }
    if (cartStop) setTimeoutTicks(() => { if (o.conn && online.get(o.char.id) === o) { const l = carts.list(o, obj); if (l && !obj.removed) o.conn.sendJSON(l); } }, 1);
    if (d.note || d.npc || d.use || d.chest) questTouch(o, obj);          // talk / use steps, and what this one offers
    const road = d.npc ? roadEvents.talk(o, obj) : null;                   // S5/S9: a delivery handed over; a wanderer's lore + tip
    if (d.chest) return openChest(o, obj);
    if (d.note) return s.sendJSON({ t: 'used', id, ok: true, kind: 'note', name: obj.name, text: d.note.text, quest: d.note.quest || undefined, ...questOffer(o, obj) });
    if (d.npc) return s.sendJSON({ t: 'used', id, ok: true, kind: 'npc', ...(road ? { road } : {}), ...(d.wanderer ? { wanderer: d.wanderer } : {}), name: obj.name, says: d.npc.says, quest: d.npc.quest || undefined, role: d.npc.role || undefined,
      ...(shops.kindOf(obj) ? { shop: true, shopKind: shops.kindOf(obj) } : {}), ...(d.npc.role === 'barber' ? { barber: true, free: barberFree() || !(o.char.flags && o.char.flags.barberUsed), ...(barberFree() ? { priceMult: 0 } : { priceMult: economy().barber.mult }) } : {}), ...(d.npc.role === 'unbinder' ? { unbinder: true, unbind: unbinderOffer(o) } : {}), ...(d.npc.role === 'innkeeper' && o.room.kind === 'town' ? { bind: true, bound: o.char.bind === o.room.id } : {}), ...(angling.isFire(obj) ? { cook: true } : {}), ...angling.npcExtra(o, obj), ...professions.npcExtra(o, obj) /* W9 (P-core) */,
      ...(d.npc.service ? { service: d.npc.service } : {}), ...questOffer(o, obj) });
    if (d.use) return useThing(o, obj);
    if (d.trace) return s.sendJSON({ t: 'used', id, ok: true, kind: d.trace.kind, ...d.trace, ...(d.trace.kind === 'campfire' ? { cook: true } : {}) });   // T25: a fire to cook at
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
  /**
   * PLAY-TEST 6, U12 — "going up a floor should ask which level so you can easily return to the top, like an elevator".
   * A dungeon's stair up (`type:'lift'`, stream E's `floor.lift`) knows every floor above it. One floor above: you go
   * (floor 1's landing is the entrance). Two or more: `used {kind:'lift', here, choices:[{to:'f:<n>', floor, label, name}]}`
   * and the client answers `use {id, to:'f:<n>'}`. A second plain `use` on the same lift within 4 s takes the floor just
   * above (a client that knows nothing of lifts still climbs).
   */
  function liftUse(o, obj, to) {
    const s = o.conn, L = obj.data.lift, list = L.to || [];
    if (!list.length) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'unknown' });
    const go = t => { s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'stairs', floor: t.floor, label: t.label }); o.liftAsk = null; transfer(o, o.room, { x: t.x, z: t.z }, 'stairs'); questFloor(o); };
    const m = /^f:(\d+)$/.exec(String(to || ''));
    if (m) { const t = list.find(x => x.floor === +m[1]); if (!t) return s.sendJSON({ t: 'used', id: obj.id, ok: false, why: 'floor', msg: 'These stairs do not go there.' }); return go(t); }
    const again = o.liftAsk && o.liftAsk.id === obj.id && now() - o.liftAsk.at < 4000;
    if (list.length === 1 || again) return go(list[0]);
    o.liftAsk = { id: obj.id, at: now() };
    s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'lift', name: obj.name, here: L.here, choices: list.map(t => ({ to: 'f:' + t.floor, floor: t.floor, label: t.label, name: t.name || undefined })) });
  }
  /** The floor (index) of a dungeon plan a point is on. */
  function floorAt(plan, x) { let i = 0; for (let k = 0; k < plan.floors.length; k++) if (x >= plan.floors[k].origin.x) i = k; return i; }
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
    grant(o, { items, gold: treasureGold(lvl), reason: 'treasure', goldAdded: false, from: obj });
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
    const gold = chestGold(lvl);
    ch.gold = (ch.gold || 0) + gold;
    ch.opened[key] = t + (c.onceMs || (o.room.kind === 'instance' ? 24 * 3600000 : chestResetMs));
    journal(o, 'opened', { key, until: ch.opened[key] });
    s.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'chest' });
    o.room.emit({ type: 'open', to: e.id, d: obj.id, x: obj.x, z: obj.z });
    grant(o, { items, gold, reason: 'chest', goldAdded: true, from: obj });
  }

  // ---- waystones + travel (PLAN §5.2; NB4: discovered first, fares, free to a live realm event) ----
  let remoteWaystones = [];       // every process's waystones (the gateway shares them)
  /** A stone merged into a neighbour (realm.js dedupeWaystones, P14): a character who found it knows the kept one. */
  function aliasWaystones(ch) {
    if (!ch.waystones || !ch.waystones.length) return;
    let changed = false;
    const out = [];
    for (const k of ch.waystones) {
      let to = k;
      for (const pv of P.values()) if (pv.L.waystoneAliases && pv.L.waystoneAliases[k]) to = pv.L.waystoneAliases[k];
      if (to !== k) changed = true;
      if (!out.includes(to)) out.push(to); else changed = true;
    }
    if (changed) ch.waystones = out;
  }
  function allWaystones() { const out = []; for (const pv of P.values()) for (const w of pv.L.waystones) out.push({ ...w, province: pv.L.key }); return out; }
  function discover(o, obj) {
    const ch = o.char, w = obj.data.waystone;
    ch.waystones ||= [];
    const fresh = !ch.waystones.includes(w.key);
    if (fresh) { ch.waystones.push(w.key); journal(o, 'set', { k: 'waystones', v: ch.waystones }); o.dirty = true; }
    const seen = seenOf(ch);
    if (!seen.places.includes(w.key)) { seen.places.push(w.key); if (o.seenSet) o.seenSet.add(w.key); journal(o, 'set', { k: 'seen', v: seen }); }
    o.conn.sendJSON({ t: 'used', id: obj.id, ok: true, kind: 'waystone', key: w.key, name: w.name, fresh, known: ch.waystones });
  }
  // S8 (play-test 4): the starting town's waystone is always known; walking into a town learns its stone; walking within
  // WAYSTONE_AUTO_M of any stone learns it (no E needed). Told with `waystone {op:'learned', key, name, how, known}`.
  const WAYSTONE_AUTO_M = 15;
  function learnWaystone(o, w, how) {
    const ch = o.char;
    ch.waystones ||= [];
    if (!w || ch.waystones.includes(w.key)) return false;
    ch.waystones.push(w.key); journal(o, 'set', { k: 'waystones', v: ch.waystones }); o.dirty = true;
    const seen = seenOf(ch);
    if (!seen.places.includes(w.key)) { seen.places.push(w.key); if (o.seenSet) o.seenSet.add(w.key); journal(o, 'set', { k: 'seen', v: seen }); }
    if (o.conn) o.conn.sendJSON({ t: 'waystone', op: 'learned', key: w.key, name: w.name, how, known: ch.waystones });
    return true;
  }
  /** The starting town's stone (town 0 of the province new characters begin in — Torborhold). */
  function homeWaystone() {
    let pv = null;
    for (const q of P.values()) if (q.L.sheet && Array.isArray(q.L.sheet.band) && q.L.sheet.band[0] <= 1) { pv = q; break; }
    pv ||= first;
    return pv.L.waystones.find(w => w.town === 0) || null;
  }
  function waystonesNear(o, pv) {
    const e = o.entity, known = o.char.waystones || [];
    if (o.room.kind === 'town' && o.room.meta && Number.isInteger(o.room.meta.town)) {
      const w = pv.L.waystones.find(q => q.town === o.room.meta.town);
      if (w && !known.includes(w.key)) learnWaystone(o, w, 'town');
    }
    for (const w of pv.L.waystones) {
      if (known.includes(w.key) || Math.abs(w.x - e.x) > WAYSTONE_AUTO_M || Math.abs(w.z - e.z) > WAYSTONE_AUTO_M) continue;
      if (Math.hypot(w.x - e.x, w.z - e.z) <= WAYSTONE_AUTO_M) learnWaystone(o, w, 'near');
    }
  }
  function travel(o, to) {
    const s = o.conn, e = o.entity, ch = o.char;
    if (e.dead) return s.sendJSON({ t: 'travelR', ok: false, why: 'dead' });
    if (o.travelling) return s.sendJSON({ t: 'travelR', ok: false, why: 'busy', msg: 'You are already on your way.' });
    if (e.state & STATE.combat) return s.sendJSON({ t: 'travelR', ok: false, why: 'combat', msg: 'Not while fighting.' });
    if (o.room.kind === 'instance') return s.sendJSON({ t: 'travelR', ok: false, why: 'instance', msg: 'Leave the dungeon first.' });
    if (to === 'event') {
      if (!liveEvent) return s.sendJSON({ t: 'travelR', ok: false, why: 'noEvent', msg: 'Nothing is happening right now.' });
      // T11: already standing in it — nothing to travel to
      if (provOf(o.room) && provOf(o.room).L.key === liveEvent.province && Math.hypot(e.x - liveEvent.x, e.z - liveEvent.z) <= (liveEvent.r || 50) + 15) return s.sendJSON({ t: 'travelR', ok: false, why: 'here', msg: 'You are already there.' });
      counters.travels++;
      const a = (ch.id % 12) / 12 * Math.PI * 2;
      const at = { x: liveEvent.x + Math.cos(a) * (liveEvent.r || 50) * 0.8, z: liveEvent.z + Math.sin(a) * (liveEvent.r || 50) * 0.8 };
      s.sendJSON({ t: 'travelR', ok: true, cost: 0, to: 'event', at, province: liveEvent.province, delayMs: TRAVEL_PRELOAD_MS });
      return afterPreload(o, () => moveTo(o, liveEvent ? liveEvent.province : provOf(o.room).L.key, at, 'event'));
    }
    const w = allWaystones().find(x => x.key === to) || remoteWaystones.find(x => x.key === to);
    if (!w) return s.sendJSON({ t: 'travelR', ok: false, why: 'unknown' });
    if (!(ch.waystones || []).includes(to)) return s.sendJSON({ t: 'travelR', ok: false, why: 'undiscovered', msg: 'You have not found that waystone yet.' });
    const near = (ch.waystones || []).length && [...o.room.objects.values()].some(x => x.data && x.data.waystone && Math.hypot(x.x - e.x, x.z - e.z) < 6);
    if (!near) return s.sendJSON({ t: 'travelR', ok: false, why: 'far', msg: 'Stand at a waystone to travel.' });
    const far = w.province !== provOf(o.room).L.key, dist = Math.hypot(w.x - e.x, w.z - e.z);
    const cost = travelFare ? travelFare(dist + (far ? economy().travel.crossProvinceMetres : 0)) : fareOf(dist, far);
    if (cost > (ch.gold || 0)) return s.sendJSON({ t: 'travelR', ok: false, why: 'gold', cost, msg: 'The fare is ' + cost + ' gold.' });
    ch.gold -= cost; journal(o, 'gold', { d: -cost }); econ.add('sink', 'fare', { gold: cost }, ch.level);
    s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
    counters.travels++;
    const at = { x: w.x + 2, z: w.z + 2 };
    s.sendJSON({ t: 'travelR', ok: true, cost, to, at, province: w.province, delayMs: TRAVEL_PRELOAD_MS });
    afterPreload(o, () => moveTo(o, w.province, at, 'waystone'), () => {     // cancelled (a fight started, death): the fare back
      ch.gold += cost; journal(o, 'gold', { d: cost }); econ.add('faucet', 'fareRefund', { gold: cost }, ch.level);
      if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
    });
  }
  /**
   * P10 "travelling freezes for a few seconds": the client is told WHERE it is going first (`travelR.at`, `province`,
   * `delayMs`) and the move happens TRAVEL_PRELOAD_MS later, so it can stream the destination's ground behind a fade
   * instead of loading it after the `joined` lands. Cancelled if you die, start a fight or log off meanwhile.
   */
  function afterPreload(o, go, cancel = null) {
    o.travelling = true;
    setTimeoutTicks(() => {
      o.travelling = false;
      const ok = online.get(o.char.id) === o && o.conn && !o.entity.dead && !(o.entity.state & STATE.combat) && !o.relocating;
      if (ok) go();
      else { if (cancel) cancel(); if (o.conn) o.conn.sendJSON({ t: 'travelR', ok: false, why: 'interrupted', msg: 'Your journey was interrupted.' }); }
    }, Math.max(1, Math.round(TRAVEL_PRELOAD_MS / TICK_MS)));
  }

  // ---- events: the realm event (the director starts it here) and every copy's own zone events (PLAN §5.2) ----
  let liveEvent = null, realmRun = null;
  const zoneRuns = new Map();     // `${room.id}|${zone}` -> { run, room, def }
  const eventView = ev => ({ id: ev.id, uid: ev.uid, name: ev.name, province: ev.province, x: ev.x, z: ev.z, r: ev.r || 50, level: ev.level, kind: ev.kind || 'boss', zoneName: ev.zoneName || null, where: ev.where || null, blurb: ev.blurb || null });
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
    const paid = [], pay = new Map();
    for (const c of run.enrolled) {
      const o = online.get(c);
      if (!((run.contrib && run.contrib.get(c)) > 0)) continue;
      if (!o || !o.entity || o.room !== room) { mailEventShare(run, room, c, o); continue; }   // T20: left before the end -> by letter
      questEvent(o, { kind: 'event', encounter: run.ev.boss || run.ev.id });
      const rw = eventReward(run.ev, o.room.rules, o.entity, () => room.host.random('event'), { minutes: (now() - (run.t0 ?? now())) / 60000 });
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
      // S24: the items wait on the boss's body as YOUR share (the same loot window, sparkling in its rarity); the bonus
      // experience and gold land now and are said out loud
      { const core = professions.eventDrop(o, { worldBoss: run.ev.kind === 'worldboss', level: run.ev.level || 1, rng: () => room.host.random('event') }); if (core) rw.items = (rw.items || []).concat([core]); }      // X5 (P-core): a Sovereign Core
      const body = run.boss && !run.boss.removed && run.boss.room === room ? run.boss : null;
      let items = rw.items || [];
      if (body && items.length && corpses.holdFor(room, body, c, { items })) items = [];
      o.room.award(o.entity, { xp: rw.xp, gold: rw.gold, items, reason: 'event' });
      const names = (rw.items || []).map(it => ({ name: it.name, rarity: it.rarity || 'normal' }));
      pay.set(c, { xp: rw.xp, gold: rw.gold, items: names, onBody: body ? body.id : undefined, bodyName: body ? body.name : null });
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
    return pay;
  }
  /** T20: a contributor who is no longer in the event's room when it is won (died and woke in town, logged off) gets the
   *  gold and the rare item by LETTER (system mail; experience cannot be posted). */
  function mailEventShare(run, room, charId, o) {
    const ch = o && o.char;
    const lvl = Math.max(1, run.ev.level || (ch && ch.level) || 1);
    let rw = { gold: eventGold((run.ev.reward || {}).gold, lvl, 0, false), items: [] };
    if (o && o.entity && o.room.rules) { try { const full = eventReward(run.ev, o.room.rules, o.entity, () => room.host.random('event'), { minutes: (now() - (run.t0 ?? now())) / 60000 }); rw = { gold: full.gold, items: full.items || [] }; } catch { /* the plain share */ } }
    counters.eventMailed = (counters.eventMailed || 0) + 1;
    sysmail.mailTo({ to: charId, kind: 'event', subject: run.ev.name + ': your share', body: 'You helped at ' + run.ev.name + ' and were gone when it ended. This is what you earned.', gold: rw.gold, items: rw.items,
      ...(rw.items.length ? {} : { gift: { minRarity: 'rare', level: lvl, name: 'Event Cache' } }) }).catch(err => log('event mail failed', err && err.message));
  }
  /**
   * T12 (play-test 5): EVERY event ends with a result everyone who was part of it (or stood in hearing) is told —
   * `eventDone {uid, id, name, result:'success'|'fail', why?, credited, xp, gold, items, onBody?, text}` plus one system
   * chat line. Winners who did something get their share (rewardEvent); the rest hear what happened and why they got nothing.
   */
  function finishEvent(run, room, res, hearers = []) {
    const won = res === 'won';
    const pay = won ? rewardEvent(run, room) : new Map();
    const I = run.ev.info || {};
    const whyText = { time: 'time ran out', left: 'everyone left', wiped: 'everyone fell', fled: 'it got away', off: 'called off' }[run.why] || 'it was lost';
    const told = new Set();
    const tell = c => {
      if (!c || told.has(c)) return;
      told.add(c);
      const o = online.get(c);
      if (!o || !o.conn) return;
      const p = pay.get(c);
      // one line, the same shape win or lose ("Event complete: …" is what play-test 4's client and tests read)
      const text = won
        ? (p ? 'Event complete: +' + p.xp + ' XP, +' + p.gold + ' gold' + (p.items.length ? ' — ' + p.items.map(n => n.name).join(', ') + (p.bodyName ? ' (on ' + p.bodyName + ')' : '') : '')
             : 'Event complete: ' + run.ev.name + '. You did not take part, so there is no reward this time.')
        : 'Event failed: ' + run.ev.name + ' — ' + whyText + '.' + (I.onFail ? ' ' + I.onFail : '');
      // U9 (play-test 6): `got` — what YOU got, as a sentence. Never empty, never null (the result card printed "null").
      const list = p ? [p.xp ? p.xp + ' experience' : '', p.gold ? p.gold + ' gold' : '', ...p.items.map(n => n.name)].filter(Boolean) : [];
      const got = p ? (list.length ? 'You got ' + (list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list.at(-1) : list[0]) + '.' + (p.bodyName ? ' Your share lies on ' + p.bodyName + '.' : '') : 'Your share lies on the body.')
        : won ? 'You did not take part, so there is no share this time.' : 'No reward this time.';
      o.conn.sendJSON({ t: 'eventDone', uid: run.ev.uid, id: run.ev.id, name: run.ev.name, result: won ? 'success' : 'fail', won, ...(won ? {} : { why: run.why || 'time' }), credited: !!p,
        xp: p ? p.xp : 0, gold: p ? p.gold : 0, items: p ? p.items : [], onBody: p ? p.onBody : undefined, text, got, story: won ? (I.onSuccess || run.ev.name + ' is over. Well fought.') : (I.onFail || run.ev.name + ' was lost.') });
      o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: run.ev.name, text });
      if (o.eventAtKey && o.eventAtKey === run.ev.uid) { o.eventAtKey = null; o.conn.sendJSON({ t: 'eventAt', uid: null }); }
    };
    for (const c of run.enrolled) tell(c);
    for (const c of hearers) if (c && c.entity && c.entity.char) tell(c.entity.char.id);
    counters.eventsEnded = (counters.eventsEnded || 0) + 1;
    counters['events_' + (won ? 'won' : 'lost')] = (counters['events_' + (won ? 'won' : 'lost')] || 0) + 1;
    return pay;
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
  /**
   * Play-test 3 R3: a REALM event starts when someone walks up to it (the director decides — one at a time, cooldowns,
   * in band). Once a second this process tells the gateway who stands within an event's radius + `realmNearM` of each of
   * its realm events (`eventNear {id, levels}`, at most every 5 s per event); nothing is sent while one is running.
   */
  const realmEvents = (opts.events || []).filter(e => P.has(e.province) && Number.isFinite(e.x));
  const nearSent = new Map();
  const realmNearM = opts.realmNearM ?? 60;
  /**
   * W1 (owner feedback 8, report #22: "I just created a new character and the starting town is being raided. I died before I
   * had a chance to do anything."). A NEWCOMER is a character under `underLevel` (3) OR with less than `firstMinutes` (10) of
   * played time (stream E's events.json `director.newcomer`). An event whose data says `startOn.clearOfNewcomersM` neither
   * counts down nor starts while a newcomer stands within that many metres of it — zone events and realm events (a town
   * raid) alike. And should one be live in a town anyway (they logged in mid-raid), the guards keep them on their feet:
   * `newcomerWard` below.
   */
  const NEWCOMER = { underLevel: 3, firstMinutes: 10, ...((opts.directorOpts && opts.directorOpts.rules && opts.directorOpts.rules.newcomer) || {}), ...(opts.newcomer || {}) };
  const isNewcomer = o => !!o && ((o.char.level || 1) < NEWCOMER.underLevel || (o.char.played || 0) < NEWCOMER.firstMinutes * 60000);
  /** Is a newcomer within `m` metres of (x, z) in this province (any wilds copy or town room; not inside a dungeon)? */
  function newcomerNear(pv, x, z, m) {
    if (!(m > 0)) return false;
    for (const o of online.values()) {
      if (!o.conn || !o.entity || o.room.kind === 'instance' || provOf(o.room) !== pv || !isNewcomer(o)) continue;
      if (Math.hypot(o.entity.x - x, o.entity.z - z) <= m) return true;
    }
    return false;
  }
  const clearM = def => (def && def.startOn && +def.startOn.clearOfNewcomersM) || 0;
  function realmNear() {
    if (liveEvent || realmRun || !realmEvents.length) return;
    const t = now();
    for (const e of realmEvents) {
      if (t - (nearSent.get(e.id) || -1e12) < 5000) continue;
      const spots = e.arenas && e.arenas.length ? e.arenas : [e];
      if (clearM(e) && spots.some(sp => newcomerNear(P.get(e.province), sp.x, sp.z, clearM(e)))) { counters.eventsHeldForNewcomers = (counters.eventsHeldForNewcomers || 0) + 1; continue; }      // W1: no raid while a newcomer is in reach
      const levels = [];
      for (const o of online.values()) {
        if (!o.entity || o.entity.dead || !o.conn || provOf(o.room)?.L.key !== e.province || o.room.kind === 'instance') continue;
        if (spots.some(s => Math.hypot(o.entity.x - s.x, o.entity.z - s.z) <= (e.r || 50) + realmNearM)) levels.push(o.char.level || 1);
      }
      if (!levels.length) continue;
      nearSent.set(e.id, t);
      send({ k: 'eventNear', id: e.id, levels }); counters.eventNearSent = (counters.eventNearSent || 0) + 1;
    }
  }
  function eventTick() {
    realmNear();
    if (realmRun) {
      const { run, room } = realmRun;
      const res = run.step();
      if (res !== 'live') {
        const v = run.view();
        finishEvent(run, room, res, room.host.near(v.x, v.z, v.r * 2 + 30, x => x.kind === 'player').map(p => room.clients.get(p.id)).filter(Boolean));
        send({ k: 'eventState', uid: run.ev.uid, state: res });
        realmRun = null;
      } else {
        const v = frameTo(run, room);
        send({ k: 'eventState', uid: run.ev.uid, state: 'live', hp: v.hp, players: v.players, phase: v.phase });
      }
    }
    zoneEventsTick();
    trackEvents();
  }
  /**
   * PLAY-TEST 5, T11 + T12 — the EVENT TRACKER. Once a second everyone enrolled in, or within hearing of, a live or
   * counting-down event gets `eventTrack`: its name, what is happening, the objective with live progress, the stage, the
   * time left (`endsAt` wall ms + `leftMs`), what it pays, and two things about THEM: `inside` (they stand in its area)
   * and `credited` (they have done something that counts). And `eventAt {uid|null}` when a player walks into or out of
   * an event's area — the client folds its "teleport there now" notice away while they are already there (T11).
   */
  function trackEvents() {
    const here = new Map();        // char id -> the event key they stand in (this second)
    const sendTrack = (room, v, run, def, state, extra) => {
      const ev = run ? run.ev : def;
      const lvlKey = ev.level || 1;
      const rules = room.rules;
      ev._preview ||= rewardPreview(ev, rules, lvlKey);
      const wall = wallNow();
      const base = { t: 'eventTrack', uid: v.uid || null, id: v.id, name: v.name, kind: v.kind, realm: !!extra.realm, state, what: v.what, text: v.text || v.what, goal: v.goal || undefined,
        objective: v.objective, stage: v.stage, wave: v.wave, waves: v.waves, hp: v.hp, players: v.players, x: Math.round(v.x), z: Math.round(v.z), r: v.r, level: v.level,
        ...(state === 'soon' ? { startsAt: extra.startsAt, leftMs: Math.max(0, extra.startsAt - wall), endsAt: extra.startsAt + (ev.durationMs || 600000) } : { leftMs: v.leftMs, endsAt: wall + v.leftMs }),
        reward: ev._preview, rewardText: ev._preview.text, ...(v.where ? { where: v.where } : {}) };
      const head = JSON.stringify(base).slice(0, -1);
      const key = v.uid || ('soon:' + v.id);
      const reach = Math.max(v.r * 2 + 30, ((v.r || 40) + (ev.nearM ?? 50)) * 2.5);
      const seen = new Set();
      const one = p => {
        if (!p || !p.char || seen.has(p.char.id)) return;
        seen.add(p.char.id);
        const c = room.clients.get(p.id);
        if (!c) return;
        const d = Math.hypot(p.x - v.x, p.z - v.z);
        const inside = d <= v.r + 15;
        if (inside && !here.has(p.char.id)) here.set(p.char.id, { key, id: v.id, realm: !!extra.realm });
        const credited = !!(run && run.contrib && run.contrib.get(p.char.id) > 0);
        c.send(head + ',"inside":' + inside + ',"inRange":' + inside + ',"credited":' + credited + ',"enrolled":' + !!(run && run.enrolled.has(p.char.id)) + ',"dist":' + Math.round(d) + '}');
      };
      for (const p of room.host.near(v.x, v.z, reach, x => x.kind === 'player')) one(p);
      if (run) for (const c of run.enrolled) { const o = online.get(c); if (o && o.room === room) one(o.entity); }
    };
    if (realmRun) sendTrack(realmRun.room, realmRun.run.view(), realmRun.run, null, 'live', { realm: true });
    for (const z of zoneRuns.values()) sendTrack(z.room, z.run.view(), z.run, z.def, 'live', {});
    for (const [key, w] of zoneWait) {
      if (w.state !== 'soon' || !w.view) continue;
      const room = rooms.get(key.split('|')[0]);
      const def = w.def;
      if (room && def) sendTrack(room, w.view, null, def, 'soon', { startsAt: w.wallAt });
    }
    // a realm event that is announced / running somewhere this process holds: standing in its area counts too
    if (liveEvent && P.has(liveEvent.province)) {
      for (const o of online.values()) {
        if (here.has(o.char.id) || !o.entity || o.room.kind === 'instance' || provOf(o.room).L.key !== liveEvent.province) continue;
        if (Math.hypot(o.entity.x - liveEvent.x, o.entity.z - liveEvent.z) <= (liveEvent.r || 50) + 15) here.set(o.char.id, { key: liveEvent.uid, id: liveEvent.id, realm: true });
      }
    }
    for (const o of online.values()) {
      const h = here.get(o.char.id) || null, k = h ? h.key : null;
      if ((o.eventAtKey || null) === k) continue;
      o.eventAtKey = k;
      if (o.conn) o.conn.sendJSON(h ? { t: 'eventAt', uid: h.key, id: h.id, realm: h.realm } : { t: 'eventAt', uid: null });
    }
    roadEvents.track && roadEvents.track();
  }
  /**
   * Play-test 3 R3 — "events should activate when a player goes nearby, not wait in real time" (fewer than 5 players at
   * a time). Every zone event waits ARMED at its arena in every copy. A living player within the arena radius + `nearM`
   * (E's director.zone.nearMetres, 50) starts a COUNTDOWN (`countdownMs`, 15 s) sent as a real time — `zoneEvent
   * {kind:'soon', ev, at: wall ms, inMs}` — then the waves. Everybody walking away (2.5x the trigger) during the countdown
   * calls it off (`kind:'end', called: 'off'`). After it ends it RESTS (`cooldownMs`, 3-5 min) and says when it is ready
   * again (`kind:'end', next: wall ms`; `kind:'states'` and the `zone` message carry every event's state and time).
   * `zoneEventFirstMs` (tests) = how long after boot the events are armed at all; `zoneEventGapMs` overrides the rest.
   */
  const zoneWait = new Map();     // key -> { state: 'soon' | 'cooldown', at (room ms), wallAt, ev? }
  const zoneArmedAt = new Map();  // room id -> room ms the copy's events are armed (zoneEventFirstMs after it is first seen)
  function zoneEventsTick() {
    for (const pv of P.values()) {
      const defs = pv.L.zoneEvents || [];
      if (!defs.length) continue;
      for (const room of pv.copies) {
        const t = room.now();
        if (!zoneArmedAt.has(room.id)) zoneArmedAt.set(room.id, t + (zoneEventFirstMs ?? 0));
        const armed = t >= zoneArmedAt.get(room.id);
        const players = [];
        const inZone = new Map();
        for (const c of room.clients.values()) {
          if (!c.entity) continue;
          const z = pv.L.zoneOf(c.entity.x, c.entity.z); (inZone.get(z) || inZone.set(z, []).get(z)).push(c);
          if (!c.entity.dead) players.push(c);
        }
        for (const def of defs) {
          const key = room.id + '|' + def.id;
          const cur = zoneRuns.get(key);
          // who hears it: everyone in its zone, and anyone close to the arena (an arena near a zone border)
          const hearR = ((def.r || 40) + (def.nearM ?? 50)) * 2.5;
          const here = [...new Set([...(inZone.get(def.zone) || []), ...players.filter(c => Math.hypot(c.entity.x - def.x, c.entity.z - def.z) <= hearR)])];
          if (cur) {
            const res = cur.run.step();
            if (res === 'live') { frameTo(cur.run, room); continue; }
            if (res === 'won') deedOf(def.zone).last.eventWon = def.name;
            finishEvent(cur.run, room, res, here);
            zoneRuns.delete(key);
            const rest = gapOf(def, room);
            zoneWait.set(key, { state: 'cooldown', at: t + rest, wallAt: wallNow() + rest });
            const I = def.info || {};
            tellZone(here, { kind: 'end', ev: cur.run.view(), won: res === 'won', result: res === 'won' ? 'success' : 'fail', ...(res === 'won' ? {} : { why: cur.run.why || 'time' }),
              text: res === 'won' ? (I.onSuccess || def.name + ' is over. Well fought.') : (I.onFail || def.name + ' was lost.'), next: wallNow() + rest, inMs: rest });
            tellStates(pv, room, def.zone, here);
            continue;
          }
          const w = zoneWait.get(key);
          if (w && w.state === 'cooldown') {
            if (t < w.at) continue;
            zoneWait.delete(key);
            tellStates(pv, room, def.zone, here);
          }
          const trig = (def.r || 40) + (def.nearM ?? 50);
          const dist = c => Math.hypot(c.entity.x - def.x, c.entity.z - def.z);
          const held = clearM(def) && newcomerNear(pv, def.x, def.z, clearM(def));      // W1: not while a newcomer is in reach
          if (w && w.state === 'soon') {
            if (held || !players.some(c => dist(c) <= trig * 2.5)) {          // everybody left (or a newcomer walked up): called off, armed again
              zoneWait.delete(key);
              tellZone(here, { kind: 'end', ev: w.view, won: false, called: 'off' });
              tellStates(pv, room, def.zone, here);
              continue;
            }
            if (t < w.at) continue;
            zoneWait.delete(key);
            const n = Math.max(1, players.filter(c => dist(c) <= Math.max(def.enrol || 60, (def.r || 40) * 1.2) + 30).length);
            const ev = { ...def, warnMs: 0, uid: def.id + ':' + room.id + ':' + t, scale: eventScale(n, opts.eventSize), abandonMs: opts.eventAbandonMs ?? ABANDON_MS };
            const run = createEventRunner({ room, ev, rng: () => room.host.random('event'), info: encounterInfo });
            run.contrib = new Map();
            zoneRuns.set(key, { run, room, def });
            run.step();
            tellZone(here, { kind: 'start', ev: run.view(), text: (def.announce || [])[0] || undefined });
            tellStates(pv, room, def.zone, here);
            continue;
          }
          if (held) { counters.eventsHeldForNewcomers = (counters.eventsHeldForNewcomers || 0) + 1; continue; }
          if (!armed || !players.some(c => dist(c) <= trig)) continue;
          const ms = def.countdownMs ?? 15000;
          const view = defView(def, 'soon');
          zoneWait.set(key, { state: 'soon', at: t + ms, wallAt: wallNow() + ms, view, def });
          const secs = Math.round(ms / 1000);
          tellZone(here, { kind: 'soon', ev: view, at: wallNow() + ms, inMs: ms, text: `${def.name || 'Trouble'} begins in ${secs} seconds.` + ((def.announce || [])[0] ? ' ' + def.announce[0] : '') });
          tellStates(pv, room, def.zone, here);
        }
      }
    }
  }
  /** A zone event's card before it has a runner (the countdown). */
  function defView(def, phase) {
    return { uid: null, id: def.id, name: def.name, kind: def.kind || 'zone', zoneName: def.zoneName || null, x: def.x, z: def.z, r: def.r || 40, phase, wave: 0, waves: (def.waves || []).length,
      boss: 0, hp: 1, players: 0, level: def.level || null, ...(def.where ? { where: def.where } : {}), ...(def.blurb ? { blurb: def.blurb } : {}),
      what: (def.info && def.info.what) || def.blurb || (def.announce || [])[0] || null, text: (def.info && def.info.what) || def.blurb || null,
      goal: (def.info && def.info.objective && def.info.objective.text) || null, objective: { kind: 'wait', text: 'Get ready', n: 0, of: 1 },
      stage: { n: 0, of: (def.waves || []).length + (def.boss || def.monster || !(def.waves || []).length ? 1 : 0), name: null } };
  }
  /** R3: every zone event of `zone` in this copy with its state — ready (comes alive when you come near), soon (countdown,
   *  `at`), live, cooldown (`at` = ready again) — for the map and the event card. Times are wall ms. */
  function zoneEventStates(pv, room, zone) {
    const out = [];
    for (const def of pv.L.zoneEvents || []) {
      if (zone && def.zone !== zone) continue;
      const key = room.id + '|' + def.id, cur = zoneRuns.get(key), w = zoneWait.get(key);
      const armed = !zoneArmedAt.has(room.id) || room.now() >= zoneArmedAt.get(room.id);
      const state = cur ? 'live' : w ? w.state : armed ? 'ready' : 'asleep';
      out.push({ id: def.id, name: def.name, x: def.x, z: def.z, r: def.r || 40, level: def.level || null, state, ...(w ? { at: w.wallAt } : {}), near: (def.r || 40) + (def.nearM ?? 50) });
    }
    return out;
  }
  function tellStates(pv, room, zone, clients) { if (clients.length) tellZone(clients, { kind: 'states', zone, list: zoneEventStates(pv, room, zone) }); }
  const gapOf = (def, room) => zoneEventGapMs ?? Math.round((def.cooldownMs || def.everyMs)[0] + room.host.random('event') * ((def.cooldownMs || def.everyMs)[1] - (def.cooldownMs || def.everyMs)[0]));
  function tellZone(clients, msg) { const d = JSON.stringify({ t: 'zoneEvent', ...msg }); for (const c of clients) c.send(d); }

  // ---- watching the rooms: open groups, traces, deeds ----
  const attackers = new Map();   // `${room}:${monster}` -> Map(char -> wall ms)
  const hinted = new Map();      // key -> ms
  const deeds = new Map();       // zone -> { hour, rares, bosses, deaths, visitors: Set }
  function deedOf(zone) {
    const hour = Math.floor(wallNow() / 3600000);
    let d = deeds.get(zone);
    if (!d || d.hour !== hour) { d = { hour, rares: 0, bosses: 0, elites: 0, deaths: 0, visitors: new Set(), heat: new Map(), last: {} }; deeds.set(zone, d); }
    return d;
  }
  function observe(ev, r) {
    if (meterOn.size && (ev.type === 'hit' || ev.type === 'miss')) meterFeed(ev, r);
    if (ev.type === 'hit' || ev.type === 'die') contribute(ev, r);
    if ((ev.type === 'hit' && ev.kind === 'dmg' && (ev.n || 0) > 0) || ev.type === 'die') {      // Q16: a hit (unless the mount keeps calm) or a death unhorses you
      const d = r.entities.get(ev.d);
      const od = d && d.kind === 'player' && d.char ? online.get(d.char.id) : null;
      if (od && od.entity === d) {
        if (ev.type === 'hit' && ev.s && ev.skill !== 'dot') od.lastHitAt = now();
        if (d.mount && dismounts(ev.type === 'die' ? 'die' : 'hit', { ev, mount: mountBook.get(d.mount), rng: () => r.host.random('mount') })) { dismount(od, ev.type === 'die' ? 'dead' : 'hit'); if (ev.type === 'hit') od.thrownAt = now(); }
      }
      // your own hits count as fighting too (C: "you hit something in the last 5 s")
      const src = ev.type === 'hit' ? r.entities.get(ev.s) : null;
      if (src && src.kind === 'player' && src.char && d && d.kind === 'monster') { const os = online.get(src.char.id); if (os) { os.lastHitAt = now(); if (d.data && d.data.roadEvent != null) roadEvents.noteHit(os, d); } }      // W24: hitting a chest's keeper is taking part
    }
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
      if (d.kind === 'monster') { questKill(r, d, ev); professions.onKill(r, d, creditOf(r, d, ev)); }      // W9 (P-core): a beast to skin
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
        const by = ev.by ? r.entities.get(ev.by) : null, byName = by && by.kind === 'player' ? by.name : null;
        const where = r.kind === 'instance' ? (pv.L.doors[r.meta.door] || {}) : d;
        const dz = deedOf(pv.L.zoneOf(where.x, where.z));
        const nm = d.name && d.name !== d.type ? d.name : String(d.type || 'something').replace(/_/g, ' ');
        if (d.rank === 'rare') { dz.rares++; dz.last.rare = { name: nm, by: byName }; }
        else if (d.rank === 'boss') { dz.bosses++; dz.last.boss = { name: nm, by: byName }; }
        else if (d.rank === 'elite') { dz.elites++; dz.last.elite = { name: nm, by: byName }; }
        if (r.kind === 'instance' && d.rank === 'boss') { bannerDoor(r); const members = [...online.values()].filter(x => x.room === r); dz.last.clear = { place: r.name, by: members[0] ? members[0].char.name : byName, party: members.length || 1 }; }
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
  /**
   * S4 (play-test 4): announced mini-bosses (an encounter file's `announce: {r}`) show on the minimap of everyone within
   * `r` metres while they live — `bossNear {list:[{id, name, x, z, level, enc, r}]}`, re-sent when the set changes or one
   * of them has moved 15 m; `list: []` clears it. Secret ones (`secret: true`) are never announced.
   */
  function announcedIn(room, memo) {
    let list = memo.get(room);
    if (list) return list;
    list = [];
    for (const m of room.entities.values()) {
      if (m.kind !== 'monster' || m.dead || !m.data || !m.data.encounter) continue;
      const inf = encounterInfo[m.data.encounter];
      if (inf && inf.announce && !inf.secret) list.push({ m, r: inf.announce.r || 300 });
    }
    memo.set(room, list);
    return list;
  }
  function bossNear(o, memo) {
    const e = o.entity;
    const near = o.room.kind === 'wilds' ? announcedIn(o.room, memo).filter(q => Math.hypot(q.m.x - e.x, q.m.z - e.z) <= q.r) : [];
    const sig = near.map(q => q.m.id + ':' + Math.round(q.m.x / 15) + ':' + Math.round(q.m.z / 15)).join(',');
    if (sig === (o.bossSig || '')) return;
    o.bossSig = sig;
    // D-UI's first name for it (pt2.js `announced`): one `rareNear` per boss newly in range
    const had = o.bossIds || new Set();
    o.bossIds = new Set(near.map(q => q.m.id));
    for (const q of near) if (!had.has(q.m.id)) o.conn.sendJSON({ t: 'rareNear', id: q.m.id, key: q.m.data.encounter, name: q.m.name, x: Math.round(q.m.x), z: Math.round(q.m.z), level: q.m.level, rank: q.m.rank === 'normal' ? 'rare' : q.m.rank, r: q.r });
    o.conn.sendJSON({ t: 'bossNear', list: near.map(q => ({ id: q.m.id, name: q.m.name, x: Math.round(q.m.x), z: Math.round(q.m.z), level: q.m.level, enc: q.m.data.encounter, r: q.r })) });
  }
  /**
   * W1: a newcomer in a TOWN while an event is live there (a raid that was already running when they logged in, a zone
   * event that spilled through the gate) is kept on their feet by the town's guards — healed to full every second and told
   * once why ("Stay behind us, friend. We have the gate."). They can still fight; they cannot be killed by a raid.
   */
  const GUARD_SAY = ((layouts[0] && layouts[0].guards && layouts[0].guards.raid && layouts[0].guards.raid.say && layouts[0].guards.raid.say.newcomer) || ['Stay behind us, friend. We have the gate.']);
  function newcomerWard(o) {
    const r = o.room, e = o.entity;
    if (r.rules.newcomer) safeRules(r, 'newcomer', e, isNewcomer(o));      // W1 (stream C, with the lead's leave): a newcomer draws a quarter of the threat and is never a raider's opening target
    if (r.kind !== 'town' || e.dead || !isNewcomer(o)) { o.warded = false; return; }
    const live = (realmRun && realmRun.room === r) || [...zoneRuns.values()].some(z => z.room === r) || [...r.host.near(e.x, e.z, 40)].some(m => m.kind === 'monster' && !m.dead && m.data && (m.data.event || m.data.roadEvent != null));
    if (!live) { o.warded = false; return; }
    if (e.hp < e.hpMax && r.rules.restore) safeRules(r, 'restore', e, { hp: e.hpMax - e.hp });
    if (!o.warded) {
      o.warded = true; counters.newcomersWarded = (counters.newcomersWarded || 0) + 1;
      const g = [...r.objects.values()].filter(x => x.data && x.data.guard).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      const line = GUARD_SAY[(o.char.id | 0) % GUARD_SAY.length];
      if (g) r.emit({ type: 'say', id: g.id, text: line, style: 'bark' });
      if (o.conn) o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: g ? g.name : 'Town Guard', text: line + ' (The town guard keeps new arrivals on their feet during a raid.)' });
    }
  }
  function zoneTick() {
    const bossMemo = new Map();
    for (const o of online.values()) {
      if (o.conn && o.entity) { o.char.played = (o.char.played || 0) + 1000; if (!(o.char.played % 30000)) o.dirty = true; newcomerWard(o); }      // W1: played time (saved with the blob)
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
      if (o.zone !== z) { o.zone = z; o.conn.sendJSON({ ...zoneMsg(pv, z), events: zoneEventStates(pv, o.room, z) }); presence(o); }
      discoverNear(o, pv, z);
      waystonesNear(o, pv);
      angling.ensurePools(o.room);                 // T25: a copy's fish pools open when someone is first in it
      professions.ensureNodes(o.room);             // W9 (P-core): a room's gathering nodes and trainers
      bossNear(o, bossMemo);
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
  /** dawn | day | dusk | night | late — the schedules' clock phases (chatter `phase.*`). */
  function dayPhase() {
    const t = timeOfDay(), ph = (first.L.schedules && first.L.schedules.clock && first.L.schedules.clock.phases) || PHASES;
    let cur = 'night';
    for (const [k, v] of Object.entries(ph).sort((a, b) => a[1] - b[1])) if (t >= v) cur = k;
    return t < (ph.dawn ?? 0.2) ? 'night' : cur;
  }
  /** What a speaker at (x, z) in copy `r` can talk about (data/names/chatter.json tokens + which recent.* pools fit). */
  function chatterContext(pv, r, x, z) {
    const L = pv.L, zone = L.zoneOf(x, z), zs = (L.zones || []).find(q => q.key === zone);
    const d = deedOf(zone);
    let town = null, bd = Infinity;
    for (const t of L.towns) { const dd = Math.hypot(t.x - x, t.z - z); if (dd < bd) { bd = dd; town = t.name; } }
    const recent = [];
    const ctx = { zone: (zs && zs.sheet && zs.sheet.name) || L.name, town, archetype: (zs && zs.sheet && zs.sheet.archetype) || null, weather: null, recent };
    for (const z2 of zoneRuns.values()) if (z2.room === r && z2.def.zone === zone) { ctx.event = z2.def.name; recent.push('recent.zone_event'); break; }
    if (liveEvent && liveEvent.province === L.key && liveEvent.kind === 'worldboss') { ctx.worldboss = liveEvent.name; recent.push('worldboss.up'); }
    if (d.last.boss) { ctx.boss = d.last.boss.name; ctx.player ||= d.last.boss.by; recent.push('recent.boss_killed'); }
    if (d.last.rare) { ctx.rare = d.last.rare.name; ctx.player ||= d.last.rare.by; recent.push('recent.rare_killed'); }
    if (d.last.elite) { ctx.boss ||= d.last.elite.name; recent.push('recent.elite_killed'); }
    if (d.last.clear) { ctx.place = d.last.clear.place; ctx.player ||= d.last.clear.by; ctx.party = d.last.clear.party; recent.push('recent.dungeon_cleared'); }
    if (d.last.eventWon) { ctx.event ||= d.last.eventWon; recent.push('recent.zone_event_won'); }
    if (d.deaths >= 3) { ctx.count = d.deaths; recent.push('recent.deaths'); }
    else if (d.visitors.size >= 5) { ctx.count = d.visitors.size; recent.push('recent.busy'); }
    else if (d.visitors.size <= 1) recent.push('recent.quiet');
    ctx.danger = r.host.near(x, z, 60, e => e.kind === 'monster' && !e.dead).length > 0;
    return ctx;
  }
  /** The living roads (P19): every tick, each copy's travellers move a quarter of their groups (travellers.js SLICES). */
  function roadsTick() {
    for (const pv of P.values()) for (const r of pv.copies) {
      if (r.meta.roads) roadsFor(r);
      if (r.travellers) { try { r.travellers.step(TICK_MS); } catch (err) { log('travellers step', err && err.message); } }
    }
  }
  function npcTick(dtMs) {
    const t = timeOfDay(), night = isNight(), phases = (first.L.schedules && first.L.schedules.clock.phases) || PHASES;
    // S11 (play-test 4): the village and hamlet folk in the wilds copies keep their day too (a cached list per copy —
    // a copy holds thousands of objects and only these move)
    const sched = r => r.kind === 'town' ? r.objects.values() : (r._sched ||= [...r.objects.values()].filter(n => n.kind === 'npc' && n.data && n.data.schedule && n.data.schedule.blocks));
    for (const pv of P.values()) for (const r of [...pv.towns, ...pv.copies]) {
      for (const n of sched(r)) {
        if (n.removed) continue;
        if (n.r && n.r.unit && n.r.unit.guard) continue;      // W1 (stream C, with the lead's leave): the combat rules walk a town guard — its post, its fights, its way back
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
  function sendQuests(o) { if (o.conn) o.conn.sendJSON({ t: 'quests', ...bookOf(o).view(o.char) }); o.marksDirty = true; }
  function questSaved(o) { journal(o, 'set', { k: 'quests', v: o.char.quests }); o.dirty = true; o.marksDirty = true; }
  /**
   * W12 (owner feedback 8, report #33: "! above an NPC with a quest for you, ? when you can turn one in, greyed when not
   * yet"). Per PLAYER, so it cannot ride in the shared `info`: `questMarks {marks: {<entity id>: mark}, full?}` — the whole
   * map for the room on entry (`full: true`), then only what changed. Marks: js/sim/quests.js `book.mark`; a road-event
   * NPC with something to offer is an `offer`. Asked when the quest log / level / room changes and every few seconds
   * (NPCs walk in and out of a wilds room); a room's candidate NPCs are cached until its object count changes.
   */
  const MARKS_EVERY_MS = 4000;
  function markCandidates(room, b) {
    const c = room._qm;
    if (c && c.n === room.objects.size && c.book === b) return c.list;
    const list = [];
    for (const x of room.objects.values()) { const d = x.data || {}; if (x.removed || !(d.npc || d.note || d.use)) continue; if ((d.road && d.road.kind !== 'chest') || d.wanderer || b.marks(giverOf(x))) list.push(x); }
    room._qm = { n: room.objects.size, book: b, list };
    return list;
  }
  function questMarks(o, full = false) {
    if (!o.conn || !o.room || !o.entity) return;
    const b = bookOf(o), now2 = {}, was = full ? {} : (o.marks || {}), diff = {};
    for (const x of markCandidates(o.room, b)) {
      if (x.removed) continue;
      const d = x.data || {};
      let m = b.mark(o.char, giverOf(x));
      if (!m && d.road && d.road.kind !== 'chest') { const ev = roadEvents.events.get(d.road.ev); if (ev && !ev.acceptedAt && !ev.done && !ev.freed) m = 'offer'; }
      if (!m && d.wanderer && d.wanderer.offers) m = 'offer';
      if (m) now2[x.id] = m;
    }
    for (const [id, m] of Object.entries(now2)) if (was[id] !== m) diff[id] = m;
    for (const id of Object.keys(was)) if (!(id in now2)) diff[id] = null;
    o.marks = now2; o.marksDirty = false; o.marksAt = now();
    if (full || Object.keys(diff).length) o.conn.sendJSON({ t: 'questMarks', marks: full ? now2 : diff, ...(full ? { full: true } : {}) });
  }
  function questMarksTick() { const t = now(); for (const o of online.values()) if (o.conn && o.entity && (o.marksDirty || t - (o.marksAt || 0) >= MARKS_EVERY_MS)) { const full = !!o.marksFull; o.marksFull = false; questMarks(o, full); } }
  function questEvent(o, ev) {
    // remember what this character did lately (P17): a quest accepted just after the fight it asks for counts it
    if (ev.kind === 'kill' || ev.kind === 'event' || ev.kind === 'clear' || ev.kind === 'use') {
      const t = wallNow(), list = o.recentQ ||= [];
      list.push({ ...ev, at: t });
      while (list.length > RECENT_Q_MAX || (list.length && t - list[0].at > RECENT_Q_MS)) list.shift();
    }
    professions.onEvent(o, ev);                 // W9 (P-core): the old `cook` teaches cooking
    const b = bookOf(o);
    const moved = b.progress(o.char, ev);
    if (moved.length) {
      questSaved(o); sendQuests(o);
      for (const id of b.autoDone(o.char)) { const r = b.turnIn(o.char, id, null); if (r.ok) payQuest(o, r, null, true); }
    }
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
    offers.push(...roadEvents.offers(o, obj));          // S5/S9: road-event NPCs and errand runners (job-shaped, pay themselves)
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
    if (m.op === 'turnin' && !m.npc) {                     // S10: a finished quest handed in from the journal
      const r = b.turnIn(ch, m.id, null);
      if (!r.ok) return reply(r);
      return payQuest(o, r, x => reply({ ...x, remote: true }));
    }
    const near = m.npc ? o.room.objectNear(o.entity, m.npc, 6) : { why: 'unknown' };
    if (near.why) return reply({ ok: false, why: near.why, msg: near.why === 'far' ? 'Walk over to them first.' : 'Who?' });
    const g = giverOf(near.o);
    if (m.op === 'accept') {
      const r = b.accept(ch, m.id, g);
      if (r.ok) {
        const t = wallNow(), recent = (o.recentQ || []).filter(ev => t - ev.at <= RECENT_Q_MS);
        if (recent.length && b.credit(ch, m.id, recent)) {
          r.credited = true; counters.questCredits = (counters.questCredits || 0) + 1;
          r.quest = b.view(ch).active.find(q => q.id === m.id) || r.quest;
        }
        questSaved(o); sendQuests(o); if (g.npcId) questEvent(o, { kind: 'talk', npcId: g.npcId, x: g.x, z: g.z });
        roadEvents.accepted(o, m.id, near.o);             // S5: the parcel into the bag / the escort starts
        questGoods(o, (b.defs.get(m.id) || {}).grant, near.o, 'quest');     // T25 (E): `grant: [{good, count}]` handed over on accept (the rod)
      }
      return reply(r);
    }
    const r = b.turnIn(ch, m.id, g);
    if (!r.ok) return reply(r);
    payQuest(o, r, reply);
  }
  /** T25 (E's quest data): goods out of shops.json `goodsCatalog` handed to the player — `[{good|id, count}]` (a rod, bait). */
  function questGoods(o, list, from, reason) {
    const items = [];
    for (const g of [].concat(list || []).slice(0, 6)) {
      const id = g && (g.good || g.id);
      const it = id ? shops.goodOf(id) : null;
      if (!it) continue;
      for (let k = 0; k < Math.max(1, Math.min(10, g.count | 0 || 1)); k++) items.push({ ...it });
    }
    if (items.length) grant(o, { items, gold: 0, reason, from });
  }
  /** Pay a turned-in quest (an NPC's turn-in, or a quest that finishes itself — `autoComplete`, Q27). */
  function payQuest(o, r, reply = null, remote = false) {
    const ch = o.char;
    questSaved(o);
    const e = o.entity, rules = o.room.rules, lv = r.reward.level;
    const span = rules.xpFor ? Math.max(1, (safeRules(o.room, 'xpFor', lv + 1) || 0) - (safeRules(o.room, 'xpFor', lv) || 0)) : 100;
    const xp = Math.round(r.reward.xpShare * span * (rules.xpMult ? safeRules(o.room, 'xpMult', 'quest') || 1 : 1) * (economy().quest.xpMult || 1));     // R2: x1.25 (C's progression.json)
    // E's class-quest items name a base and a name (`reward.item {tier, slot, base, name}`): C's makeItem, else the engine's
    // generator held to that base; plain `{tier}` rolls as before
    const ri = r.reward.item, ilv = Math.max(lv, e.level || 1);
    let items = [];
    if (ri && ri.base) {
      let it = rules.makeItem ? safeRules(o.room, 'makeItem', e, { base: ri.base, rarity: ri.tier || 'rare', level: ilv }) : null;
      const eng = !it && rules.room && rules.room.engine;
      if (!it && eng && eng.rpg) { try { it = eng.rpg.rollDrop({ level: ilv, rng: rules.room.streams.get('loot'), chance: 1, bases: [ri.base], rarityBoost: 0, floor: ri.tier === 'normal' ? null : (ri.tier || 'rare') }); } catch (err) { log('quest item', err && err.message); } }
      if (it) { it = JSON.parse(JSON.stringify(it)); if (ri.name) it.name = ri.name; items = [it]; }
    }
    if (!items.length && ri && rules.rollLoot) items = safeRules(o.room, 'rollLoot', e, { level: ilv, tier: ri.tier || 'common' }) || [];
    // T9 (play-test 5): CRATES — E's `reward.crates: [{slot, min, forClass?}]` (one crate item each; `reward.crate` = one).
    // The crate is rolled when it is OPENED, at the opener's level, never above the quest's level + 3.
    const crateSpecs = [].concat((r.def.reward && (r.def.reward.crates || r.def.reward.crate)) || []).filter(c => c && typeof c === 'object').slice(0, 4);
    const crates = crateSpecs.map(c => { const spec = { ...c, maxLevel: Number.isFinite(c.maxLevel) ? c.maxLevel : lv + 3 }; const it = rules.makeCrate ? safeRules(o.room, 'makeCrate', e, spec) : null; return it && typeof it === 'object' && it.name ? it : crateItem(spec); });
    items = items.concat(crates);
    const out = { ok: true, reward: { xp, gold: r.reward.gold, items: items.length, ...(crates.length ? { crates: crates.map(c => ({ name: c.name, rarity: c.rarity, desc: c.desc })), crate: { name: crates[0].name, rarity: crates[0].rarity } } : {}) }, next: r.next || undefined, name: r.def.name, done: r.def.done || undefined };
    if (reply) reply(out); else if (o.conn) o.conn.sendJSON({ t: 'questR', op: 'turnin', id: r.def.id, auto: true, ...(remote && !r.def.autoComplete ? { remote: true } : {}), ...out });
    questGoods(o, (r.def.reward || {}).goods, null, 'quest');           // T25 (E): `reward.goods: [{id, count}]`
    // a quest may unlock something early (`reward.unlock`: 'companion' | 'companion2', C's rules.unlock — Q28 class quests)
    const rw = r.def.reward || {};
    if (rules.unlock && (rw.unlock || rw.perks)) {
      for (const u of [].concat(rw.unlock || [])) safeRules(o.room, 'unlock', e, u);
      for (let k = 0; k < Math.min(5, rw.perks | 0); k++) safeRules(o.room, 'unlock', e, 'perk', { source: r.def.id + (k ? ':' + k : '') });   // C: once per source
      buildChanged(o);
    }
    o.room.award(e, { xp, gold: r.reward.gold, items, reason: 'quest' });
    econ.add('faucet', 'quest', { gold: r.reward.gold }, ch.level || 1);
    sendQuests(o);
    saveNow(o);
  }

  // ---- talents + the perk forest (play-test 1, P6; stream C owns the rules, A the messages and the save) ----
  // Contract with stream C (docs/protocol.md §17, requests.md): rules.talent(e, op, {skill, tier, node}) and
  // rules.perk(e, op, {id}) -> { ok, why?, text?, ... }; rules.build(e) -> { talents, perks, perkPoints } for the client;
  // rules.saveBuild(e) -> the blob A saves as `char.build` (C's addEntity reads it back). Until C's rules have them, the
  // ops answer `why: 'notReady'`.
  function buildView(o) {
    const b = o.room.rules.build ? safeRules(o.room, 'build', o.entity) : null;
    // T7 (play-test 5): the Doubled Grasp perk lets the off hand take a two-hander — the paper doll reads `dual2h`
    const pk = o.room.rules.perks ? safeRules(o.room, 'perks', o.entity) : null;
    const fl = pk && pk.flags, uu = o.entity.r && o.entity.r.unit;
    const dual2h = !!((Array.isArray(fl) ? fl.includes('doubleGrip') : fl && fl.doubleGrip) || (uu && uu.perkFlags && uu.perkFlags.doubleGrip));
    return { ...(b && typeof b === 'object' ? b : {}), dual2h };
  }
  function buildChanged(o) {
    o.build = null;
    if (o.room.rules.saveBuild) { const b = safeRules(o.room, 'saveBuild', o.entity); if (b !== undefined) { o.char.build = b; journal(o, 'set', { k: 'build', v: b }); } }
    o.dirty = true;
    o.room.barChanged(o.entity);                       // a talent can reshape a slot: `you {bar}` after this tick
    const e = o.entity;
    o.build = buildView(o);
    if (o.conn) o.conn.sendJSON({ t: 'you', ...o.build, hpMax: e.hpMax, mpMax: e.mpMax });
    wantSheet(o);
  }
  /** Undoing a pick costs gold (C's rules.retrainPrice, Farhold's Unbinder prices); picking is free. */
  /** Respec only at an Unbinder (C: free re-picks would make every choice meaningless): one within UNBINDER_M. */
  function nearUnbinder(o) { const e = o.entity; for (const x of o.room.objects.values()) if (x.data && x.data.npc && x.data.npc.role === 'unbinder' && Math.hypot(x.x - e.x, x.z - e.z) <= UNBINDER_M) return true; return false; }
  /** S11 (play-test 4): what the Unbinder offers, priced for this character — the client draws the buttons from it.
   *  Each `op` is the message to send (`talent {op:'clear', skill}` for one skill's picks, `perk {op:'reset'}` …). */
  function unbinderOffer(o) {
    const live = o.room.rules.saveBuild ? safeRules(o.room, 'saveBuild', o.entity) : null;
    const picks = live || o.char.build || {};
    return { title: 'Unbinder — resets talents & perks', gold: o.char.gold || 0,
      talentOne: retrainCost(o, 'talent', 'one'), talentAll: retrainCost(o, 'talent', 'all'), perkOne: retrainCost(o, 'perk', 'one'), perkAll: retrainCost(o, 'perk', 'all'),
      ops: { talentAll: { t: 'talent', op: 'clear' }, talentSkill: { t: 'talent', op: 'clear', skill: '<skill id>' }, talentTier: { t: 'talent', op: 'clear', skill: '<skill id>', tier: '<tier>' }, perkOne: { t: 'perk', op: 'refund', id: '<perk id>' }, perkAll: { t: 'perk', op: 'reset' } },
      has: { talents: !!(picks.talents && Object.values(picks.talents).some(v => v && Object.keys(v).length)), perks: !!(picks.perks && (Array.isArray(picks.perks) ? picks.perks.length : Object.keys(picks.perks).length)) } };
  }
  function retrainCost(o, kind, scope) { const p = o.room.rules.retrainPrice ? safeRules(o.room, 'retrainPrice', o.entity, kind, scope) : 0; return Math.max(0, Math.round(+p || 0)); }
  function payRetrain(o, price) {
    if (!price) return;
    o.char.gold -= price; journal(o, 'gold', { d: -price }); econ.add('sink', 'retrain', { gold: price }, o.char.level || 1);
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: o.char.gold });
  }
  function talentOp(o, m) {
    const s = o.conn;
    if (!TALENT_OPS.includes(m.op)) return bad(s, 'op');
    const reply = x => s.sendJSON({ t: 'talentR', op: m.op, skill: m.skill || null, ...x });
    if (!o.room.rules.talent) return reply({ ok: false, why: 'notReady', msg: 'Talents are not open on this server yet.' });
    if (o.entity.dead) return reply({ ok: false, why: 'dead', msg: 'You are dead.' });
    if (o.entity.state & STATE.combat) return reply({ ok: false, why: 'combat', msg: 'Not while fighting.' });
    if (m.op === 'clear' && !nearUnbinder(o)) return reply({ ok: false, why: 'unbinder', msg: 'Only an Unbinder can take a talent back. Find one in town.' });
    const price = m.op === 'clear' ? retrainCost(o, 'talent', m.tier != null ? 'one' : 'all') : 0;
    if (price > (o.char.gold || 0)) return reply({ ok: false, why: 'gold', cost: price, msg: 'Unlearning that costs ' + price + ' gold.' });
    const r = safeRules(o.room, 'talent', o.entity, m.op, { skill: m.skill, tier: m.tier, node: m.node }) || { ok: false, why: 'unknown' };
    if (!r.ok) return reply({ ok: false, why: r.why || 'unknown', msg: r.text || r.msg || 'You cannot pick that.' });
    payRetrain(o, price);
    buildChanged(o);
    return reply({ ok: true, picks: r.picks || null, talents: r.talents || undefined });
  }
  function perkOp(o, m) {
    const s = o.conn;
    if (!PERK_OPS.includes(m.op)) return bad(s, 'op');
    const reply = x => s.sendJSON({ t: 'perkR', op: m.op, id: m.id || null, ...x });
    if (!o.room.rules.perk) return reply({ ok: false, why: 'notReady', msg: 'The perk forest is not open on this server yet.' });
    if (o.entity.dead) return reply({ ok: false, why: 'dead', msg: 'You are dead.' });
    if (m.op !== 'take' && (o.entity.state & STATE.combat)) return reply({ ok: false, why: 'combat', msg: 'Not while fighting.' });
    if (m.op !== 'take' && !nearUnbinder(o)) return reply({ ok: false, why: 'unbinder', msg: 'Only an Unbinder can give perks back. Find one in town.' });
    const price = m.op === 'take' ? 0 : retrainCost(o, 'perk', m.op === 'reset' ? 'all' : 'one');
    if (price > (o.char.gold || 0)) return reply({ ok: false, why: 'gold', cost: price, msg: 'Giving that back costs ' + price + ' gold.' });
    const r = safeRules(o.room, 'perk', o.entity, m.op, { id: m.id }) || { ok: false, why: 'unknown' };
    if (!r.ok) return reply({ ok: false, why: r.why || 'unknown', msg: r.text || r.msg || 'You cannot take that.' });
    payRetrain(o, price);
    buildChanged(o);
    return reply({ ok: true, perks: r.perks || [], left: r.left ?? null });
  }

  // ---- the map: discovery + what it shows (play-test 1, P3/P27) ----
  // Every province knows its PLACES (towns, waystones, dungeon doors and caves, forts, farms, vignettes, hooks, zone
  // event sites). A character discovers a zone by entering it and a place by coming within its radius + DISCOVER_PAD;
  // discoveries are saved (`seen`) and pushed as `discover`. `map {op:'get'}` answers `mapData`: every zone with its
  // name and level band (the map shows level zones from the start), every town, the places this character has found,
  // and where events are happening now.
  for (const pv of P.values()) pv.places = placesOf(pv.L);
  function placesOf(L) {
    const out = [];
    const zoneOf = (x, z) => (L.zoneOf ? L.zoneOf(x, z) : null);
    const add = (key, kind, name, x, z, r, extra = {}) => { if (Number.isFinite(x) && Number.isFinite(z)) out.push({ key, kind, name: name || kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, r: Math.round(r || 20), zone: zoneOf(x, z), ...extra }); };
    L.towns.forEach((t, i) => add(`town:${L.key}:${i}`, 'town', t.name, t.x, t.z, t.r, { always: true, size: t.kind || null }));
    for (const w of L.waystones) add(w.key, 'waystone', w.name, w.x, w.z, 12);
    L.doors.forEach((d, i) => {
      const ds = (d.sheet && d.sheet.dungeon) || {};
      add(d.key || `door:${L.key}:${i}`, d.kind === 'cave' ? 'cave' : 'dungeon', (d.kind !== 'cave' && ds.name) || d.name, d.x, d.z, 20, { level: ds.level || null, door: i });
    });
    for (const o of L.objects || []) {
      if (o.type === 'fort' || o.type === 'farm' || o.type === 'vignette' || o.type === 'hook') add(o.key, o.type, o.name, o.x, o.z, Math.max(15, o.r || 15), o.site && o.site.friendly === false ? { hostile: true } : {});
    }
    for (const ev of L.zoneEvents || []) if (Number.isFinite(ev.x)) add('event:' + ev.id, 'event', ev.name, ev.x, ev.z, ev.r || 40, { level: ev.level || null });
    return out;
  }
  function seenOf(ch) { ch.seen ||= { zones: [], places: [] }; ch.seen.zones ||= []; ch.seen.places ||= []; return ch.seen; }
  /** Walking about: new zones and places within reach become known (1 Hz, from zoneTick). */
  function discoverNear(o, pv, zone) {
    const seen = seenOf(o.char), e = o.entity;
    const fresh = [];
    let zoneNew = false;
    if (zone && !seen.zones.includes(zone)) { seen.zones.push(zone); zoneNew = true; }
    const have = o.seenSet || (o.seenSet = new Set(seen.places));
    for (const p of pv.places) {
      if (have.has(p.key) || (p.zone !== zone && Math.abs(p.x - e.x) > 400)) continue;
      if (Math.hypot(p.x - e.x, p.z - e.z) <= p.r + DISCOVER_PAD) { have.add(p.key); seen.places.push(p.key); fresh.push(p); }
    }
    if (!fresh.length && !zoneNew) return;
    journal(o, 'set', { k: 'seen', v: seen });
    o.dirty = true;
    if (o.conn) o.conn.sendJSON({ t: 'discover', zone: zoneNew ? zone : undefined, places: fresh.map(placeView) });
  }
  const placeView = p => { const { always, ...v } = p; void always; return v; };
  function mapData(o) {
    const pv = provOf(o.room) || first, L = pv.L, seen = seenOf(o.char);
    const known = new Set(seen.places);
    const zones = (L.zones || []).map(z => ({ key: z.key, name: (z.sheet && z.sheet.name) || L.name, band: (z.sheet && z.sheet.band) || null, bounds: z.bounds || null,
      archetype: (z.sheet && z.sheet.archetype) || null, discovered: seen.zones.includes(z.key) }));
    const places = pv.places.filter(p => p.always || known.has(p.key)).map(p => ({ ...placeView(p), discovered: known.has(p.key) || undefined }));
    const events = [];
    if (liveEvent && liveEvent.province === L.key) events.push({ ...eventView(liveEvent), realm: true });
    for (const z of zoneRuns.values()) if (provOf(z.room) === pv && (z.room === o.room || o.room.kind === 'town')) { const v = z.run.view(); events.push({ uid: v.uid, id: v.id, name: v.name, x: v.x, z: v.z, r: v.r, phase: v.phase, zoneName: v.zoneName || null, level: z.def.level || null }); }
    // X7 (owner feedback 9): quest marks for town NPCs you cannot see from here — each town place carries its NPCs with a mark
    // for THIS character (`marks: [{name, role, x, z, q}]`, only those with a mark), worked out when the map is asked for
    const book = pv.book;
    for (const p of places) {
      if (p.kind !== 'town') continue;
      const ti = pv.L.towns.findIndex(t => t.name === p.name), room = ti >= 0 ? pv.towns[ti] : null;
      if (!room) continue;
      const npcs = [];
      for (const x of markCandidates(room, book)) { if (x.removed) continue; const q = book.mark(o.char, giverOf(x)); if (q) npcs.push({ name: x.name, role: (x.data.npc && x.data.npc.role) || null, x: Math.round(x.x), z: Math.round(x.z), q }); }
      if (npcs.length) p.marks = npcs;
    }
    return { t: 'mapData', province: L.key, name: L.name, bounds: L.terrain.bounds, zones, places, events, waystones: o.char.waystones || [], horizon: L.horizon ? { bin: L.horizon.file, step: L.horizon.step } : null };
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
    const added = [], grown = [];
    let overflow = 0, urgent = false;
    for (const it of items) {
      if (!it || typeof it !== 'object' || it._granted) continue;
      it._granted = true;
      const item = JSON.parse(JSON.stringify(it)); delete item._granted;
      // U5 (play-test 6): a consumable joins a stack of its kind that has room; only what is left over takes a new slot
      if (stackable(item)) {
        let n = countOf(item);
        const key = stackKey(item), max = stackMaxOf(item);
        for (const st of ch.bag) {
          if (!n) break;
          if (!stackable(st) || st.apart || stackKey(st) !== key || countOf(st) >= max) continue;      // `apart`: a stack the player split off stays as they left it
          const k = Math.min(n, max - countOf(st));
          st.count = countOf(st) + k; n -= k;
          if (!grown.includes(st)) grown.push(st);
        }
        if (!n) continue;
        item.count = n;
      }
      if (item.kind === 'potion') { const t = potionText(item, { hpMax: o.entity.hpMax, mpMax: o.entity.mpMax }, potionTable); if (t) { item.desc = t.desc; if (t.restore) item.restore = t.restore; } }
      if (item.uid) item.ruid = item.uid;
      item.uid = newUid();
      if (ch.bag.length >= bagCap(o)) { overflow += Math.max(economy().bag.overflowPerItem, Math.round(item.value || 1)) * countOf(item); continue; }
      ch.bag.push(item); added.push(item);
      if (RARE.has(item.rarity)) urgent = true;
    }
    if (overflow) ch.gold = (ch.gold || 0) + overflow;
    if (gold || overflow) journal(o, 'gold', { d: gold + overflow });
    for (const st of grown) { journal(o, 'bagDel', { uid: st.uid }); journal(o, 'bagAdd', { item: st }); }
    for (const it of added) journal(o, 'bagAdd', { item: it });
    const lvl = ch.level || 1;
    if (gold) econ.add('faucet', reason, { gold }, lvl);
    if (added.length) econ.add('faucet', reason, { items: added.length }, lvl);
    if (overflow) econ.add('faucet', 'overflow', { gold: overflow }, lvl);
    const got = grown.filter(st => !added.includes(st)).concat(added);       // what the caller hears it gave: the stacks that grew + the new items
    if (!got.length && !gold && !overflow) return got;
    o.dirty = true;
    // a stack that grew goes out as remove + add of the same uid (the client's bag applies remove, then add)
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: got, remove: grown.map(st => st.uid), gold: ch.gold });
    if (got.length || gold) o.room.emit({ type: 'loot', to: o.entity.id, d: from ? from.id : o.entity.id, items: got.map(i => ({ uid: i.uid, name: i.name, rarity: i.rarity })), gold: gold || undefined });
    if (urgent) saveNow(o);
    return got;
  }
  /**
   * U5: bring loose consumables of the same kind together (an old save, a letter or a trade that arrived as its own item).
   * Journaled like any bag change; `tell` = send the client the result.
   */
  /**
   * U17 (play-test 6, stream E's shops.json `potionDrops: { chance: {normal, champion, rare, elite, boss}, table: [[minLevel, id]…] }`):
   * a kill may leave a potion beside its usual loot — the best table row the monster's level reaches, by its rank's chance.
   */
  const potionDrops = (layouts[0] && layouts[0].shops && layouts[0].shops.potionDrops) || opts.potionDrops || null;
  function potionDrop(e, from, a, r) {
    if (!potionDrops || !from || from.kind !== 'monster') return a;
    const ch = potionDrops.chance || {}, p = ch[from.rank] ?? ch.normal ?? 0;
    if (!(p > 0) || r.host.random('potion') >= p) return a;
    const rows = (potionDrops.table || []).filter(row => Array.isArray(row) && (from.level || 1) >= row[0]);
    if (!rows.length) return a;
    const top = Math.max(...rows.map(row => row[0]));
    const pick = rows.filter(row => row[0] === top || row[0] <= 1);
    const id = pick[Math.floor(r.host.random('potion') * pick.length)][1];
    const it = shops.potionOf(id, r.rules);
    counters.potionDrops = (counters.potionDrops || 0) + 1;
    return it ? { ...a, items: [...(a.items || []), it] } : a;
  }
  /**
   * U17 follow-up: a potion's description is WRITTEN from the numbers it uses and the drinker's own maxima ("Restores 50% of
   * your health (94 now)…"), and re-written when those change (a level, a piece of gear). `tell` = send the changed items.
   */
  function potionCards(o, tell = true) {
    const e = o.entity, changed = [];
    for (const it of o.char.bag || []) {
      if (!it || it.kind !== 'potion') continue;
      const t = potionText(it, { hpMax: e.hpMax, mpMax: e.mpMax }, potionTable);
      if (!t || (it.desc === t.desc && JSON.stringify(it.restore || null) === JSON.stringify(t.restore))) continue;
      it.desc = t.desc; if (t.restore) it.restore = t.restore; else delete it.restore;
      changed.push(it);
    }
    if (!changed.length) return false;
    o.dirty = true;                               // the text is re-made at every login, so it needs no journal row
    if (tell && o.conn) o.conn.sendJSON({ t: 'bag', add: changed, remove: changed.map(it => it.uid), gold: o.char.gold });
    return true;
  }
  /**
   * Owner feedback 7 (D-UI's ask): SPLIT a stack (`item {op:'split', uid, n}` — n off the stack into a new slot; the new
   * stack is `apart`, so it is not swept back together until the player merges it or it changes hands) and MERGE two stacks
   * (`item {op:'merge', uid, onto}` — drop one on another: as many as fit move across). Both answer `itemR {op, ok, …}` and a
   * `bag {remove, add}` with the stacks as they are now.
   */
  function stackOp(o, m) {
    const s = o.conn, ch = o.char;
    const R = x => s.sendJSON({ t: 'itemR', op: m.op, uid: m.uid, ...x });
    const src = ch.bag.find(i => i.uid === m.uid);
    if (!src || !stackable(src)) return R({ ok: false, why: 'item', msg: 'That does not stack.' });
    if (m.op === 'split') {
      const n = m.n | 0;
      if (n < 1 || n >= countOf(src)) return R({ ok: false, why: 'count', msg: 'Split off at least one and leave at least one.' });
      if (ch.bag.length >= bagCap(o)) return R({ ok: false, why: 'bagFull', msg: CODES.bagFull });
      const made = { ...JSON.parse(JSON.stringify(src)), uid: newUid(), count: n, apart: 1 };
      delete made.left; delete made.ruid;
      src.count = countOf(src) - n;
      ch.bag.splice(ch.bag.indexOf(src) + 1, 0, made);
      journal(o, 'bagDel', { uid: src.uid }); journal(o, 'bagAdd', { item: src }); journal(o, 'bagAdd', { item: made });
      o.dirty = true;
      s.sendJSON({ t: 'bag', add: [src, made], remove: [src.uid], gold: ch.gold });
      return R({ ok: true, made: made.uid, count: src.count, n });
    }
    const dst = ch.bag.find(i => i.uid === m.onto);
    if (!dst || dst === src || !stackable(dst) || stackKey(dst) !== stackKey(src)) return R({ ok: false, why: 'item', msg: 'Those do not go together.' });
    if (trades.offered(ch.id, m.onto)) return R({ ok: false, why: 'item', msg: 'That item is in your trade window.' });
    const k = Math.min(countOf(src), stackMaxOf(dst) - countOf(dst));
    if (k <= 0) return R({ ok: false, why: 'full', msg: 'That stack is full.' });
    dst.count = countOf(dst) + k; delete dst.apart;
    const gone = countOf(src) - k <= 0;
    if (gone) ch.bag.splice(ch.bag.indexOf(src), 1); else src.count = countOf(src) - k;
    journal(o, 'bagDel', { uid: src.uid }); journal(o, 'bagDel', { uid: dst.uid }); journal(o, 'bagAdd', { item: dst }); if (!gone) journal(o, 'bagAdd', { item: src });
    o.dirty = true;
    s.sendJSON({ t: 'bag', add: gone ? [dst] : [dst, src], remove: [src.uid, dst.uid], gold: ch.gold });
    R({ ok: true, onto: dst.uid, count: dst.count, moved: k, left: gone ? 0 : src.count });
  }
  function restack(o, tell = true) {
    const ch = o.char, bag = ch.bag || [];
    const first = new Map(), gone = [], grown = [];
    for (const it of bag) {
      if (!stackable(it) || it.apart) continue;
      const key = stackKey(it), max = stackMaxOf(it);
      let n = countOf(it);
      for (const st of first.get(key) || []) {
        if (!n) break;
        if (countOf(st) >= max) continue;
        const k = Math.min(n, max - countOf(st));
        st.count = countOf(st) + k; n -= k;
        if (!grown.includes(st)) grown.push(st);
      }
      if (!n) { gone.push(it); continue; }
      if (n !== countOf(it)) { it.count = n; if (!grown.includes(it)) grown.push(it); }
      (first.get(key) || first.set(key, []).get(key)).push(it);
    }
    if (!gone.length && !grown.length) return false;
    ch.bag = bag.filter(it => !gone.includes(it));
    for (const it of gone) journal(o, 'bagDel', { uid: it.uid });
    for (const st of grown) if (!gone.includes(st)) { journal(o, 'bagDel', { uid: st.uid }); journal(o, 'bagAdd', { item: st }); }
    o.dirty = true;
    const keep = grown.filter(st => !gone.includes(st));
    if (tell && o.conn) o.conn.sendJSON({ t: 'bag', add: keep, remove: [...gone, ...keep].map(it => it.uid), gold: ch.gold });
    return true;
  }
  /**
   * S3 (play-test 4): one-off refunds from data/provinces/refunds.json, each paid ONCE per character per `key`
   * (char.flags.refunds). Matched on the database id AND the name, so another database never pays out by accident.
   */
  function applyRefunds(o) {
    const list = (first.L.refunds && first.L.refunds.list) || opts.refunds || [];
    const ch = o.char;
    for (const r of list) {
      if (!r || String(r.char) !== String(ch.id) || (r.name && r.name !== ch.name)) continue;
      const done = (ch.flags && ch.flags.refunds) || {};
      if (done[r.key]) continue;
      ch.flags = { ...(ch.flags || {}), refunds: { ...done, [r.key]: wallNow() } };
      journal(o, 'set', { k: 'flags', v: ch.flags });
      if (r.gold) { ch.gold = (ch.gold || 0) + r.gold; journal(o, 'gold', { d: r.gold }); econ.add('faucet', 'refund', { gold: r.gold }, ch.level || 1); }
      o.dirty = true;
      setTimeoutTicks(() => { if (o.conn) { o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold }); o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'The Vale', text: r.msg || ('Refund: ' + r.gold + ' gold.') }); } }, 10);
      saveNow(o);
    }
  }
  /**
   * P22 "start with basic gear": a new character keeps its class WEAPON (and an off-hand weapon or shield) and
   * nothing else — no plate on day one; the client draws plain shorts and a top until armour is found. Once per
   * character (`kitV`); a character from before this rule keeps what it wears.
   */
  function startingKit(o) {
    const ch = o.char, e = o.entity;
    if ((ch.kitV || 0) >= 1) return;
    const fresh = (ch.level || 1) <= 1 && !(ch.xp > 0) && !(ch.bag && ch.bag.length);
    if (fresh && o.room.rules.unequip && o.room.rules.gear) {
      const picked = fresh && ch.kit ? kitFor(ch) : null;
      const g = safeRules(o.room, 'gear', e) || {};
      // dropped, never bagged: everything but the class weapon — and that too when a weapon pack was picked
      for (const slot of Object.keys(g)) if (g[slot] && (!KIT_KEEP.has(slot) || (picked && picked.weapons))) safeRules(o.room, 'unequip', e, slot);
      if (picked) wearKit(o, picked);
      journalGear(o);
      o.bar = null;                                   // the bar may read gear: format it again
    }
    ch.kitV = KIT_VERSION;
    journal(o, 'set', { k: 'kitV', v: KIT_VERSION });
    o.dirty = true;
  }
  /**
   * T5 (play-test 5): the starting equipment picked on the creation screen. `char.kit = { armour, weapons }` are ids out of
   * stream C's `kitsFor(cls)` (validated by the gateway at `create`); the kits are loaded once at init (kitsFor may be
   * async). `rules.applyKit(e, {armour, weapons})` does it when C has it; otherwise each kit item is equipped through
   * `rules.equip` (the second weapon of a pack into the off hand) and anything the rules refuse lands in the bag.
   */
  const kitCache = new Map();
  function kitFor(ch) {
    const k = kitCache.get(ch.cls);
    if (!k || !ch.kit) return null;
    const armour = (k.armour || []).find(x => x.id === ch.kit.armour) || null, weapons = (k.weapons || []).find(x => x.id === ch.kit.weapons) || null;
    return armour || weapons ? { armour, weapons } : null;
  }
  function wearKit(o, kit) {
    const ch = o.char, e = o.entity, rules = o.room.rules;
    if (rules.applyKit) { const r = safeRules(o.room, 'applyKit', e, { armour: ch.kit.armour, weapons: ch.kit.weapons }); if (r && r.ok) { counters.kits = (counters.kits || 0) + 1; return true; } }
    let weaponN = 0;
    ch.bag ||= [];
    for (const src of [...((kit.weapons && kit.weapons.items) || []), ...((kit.armour && kit.armour.items) || [])]) {
      if (!src || typeof src !== 'object') continue;
      const item = JSON.parse(JSON.stringify(src)); delete item._granted;
      item.uid = newUid();
      const isWeapon = item.type === 'weapon' || item.slot === 'weapon';
      const into = isWeapon && weaponN++ > 0 ? 'offhand' : null;
      const r = safeRules(o.room, 'equip', e, item, into);
      const back = r && r.ok ? (r.removed || []) : [item];
      for (const it of back) if (ch.bag.length < BAG_MAX) {      /* the kit swap may overfill a pack-less bag: nothing is lost */ ch.bag.push(it); journal(o, 'bagAdd', { item: it }); }
    }
    counters.kits = (counters.kits || 0) + 1;
    return true;
  }
  /** What a player wears, compact, on its entity's `info` (`gear: {slot: {base, sub?, rarity}}`) so others draw it. */
  const lvlOf = it => Math.max(0, (it.dropLevel | 0), (it.itemLevel || it.ilvl || it.level || 0) | 0);
  // play-test 5 (D-world): `g5` = the catalog model when it is not the base itself; `el` = the element a staff / wand / sceptre is tinted with
  const g5Of = it => { const g = it.g5 || (it.look && typeof it.look === 'object' && it.look.g5) || null; return g && g !== (it.baseKey || it.base) ? g : null; };
  function gearLook(o) {
    const eq = equipView(o) || {};
    // worn items the rules made (a class kit) carry no server uid, so the client could never take them off: give one
    let named = false;
    for (const it of Object.values(eq)) if (it && typeof it === 'object' && !it.uid) { it.uid = newUid(); named = true; }
    if (named && o.char) journalGear(o);
    const out = {};
    // Q22: the wearer's display choice is what EVERYONE draws — no gear at all (plain clothes), or no head piece
    const pr = prefsOf(o.char);
    for (const [slot, it] of Object.entries(eq)) if (it && typeof it === 'object') {
      if (!pr.showGear && slot !== 'weapon' && slot !== 'offhand' && slot !== 'mainhand') continue;
      if (!pr.showHelm && slot === 'head') continue;
      out[slot] = { base: it.baseKey || it.base || it.name || slot, ...(it.subtype ? { sub: it.subtype } : {}), rarity: it.rarity || 'normal', ...(it.uniqueId ? { unique: it.uniqueId } : {}), ...(it.theme ? { theme: it.theme } : {}), ...(g5Of(it) ? { g5: g5Of(it) } : {}), ...(it.castElement || it.brand ? { el: it.castElement || it.brand } : {}), ...(lvlOf(it) ? { lvl: lvlOf(it) } : {}), ...(it.tier >= 2 ? { tier: it.tier } : {}) };   // S18: tier-2 theme id (armour-tiers.json); item level + tier so others draw tier 2 on a plain L15+ piece
    }
    const off = !pr.showGear;
    const before = JSON.stringify(o.entity.gear || null) + !!o.entity.gearOff, after = JSON.stringify(out) + off;
    if (before !== after) { o.entity.gear = out; o.entity.gearOff = off; o.entity.infoVer++; }
  }
  /**
   * Play-test 2, Q12 "with one ring on, a second ring replaced it instead of going on the other hand": the client sent the
   * item's own slot ('ring') and that was passed on as an exact slot, which skips Farhold's free-hand choice. Only an
   * exact slot the player dragged onto ('ring1'/'ring2'/'offhand'/…) is passed on; the item's own slot means "you pick".
   */
  function equipInto(item, asked) {
    if (!asked) return null;
    const own = item.type === 'weapon' ? 'weapon' : item.slot;
    if (asked === own || (asked === 'ring' && own === 'ring1')) return null;
    if (asked === 'ring1') return 'ring';
    return asked;
  }
  /**
   * Potions and food (js/sim/consumables.js; the lead's call after play-test 2). `item {op:'use', uid}` — uid, or 'id:<item id>'
   * for a hotbar slot (the first such item in the bag). Potions share POTION_CD_MS and work in a fight; food and drink are out
   * of combat and mend over time (foodTick). Effects go through C's rules.restore / rules.cleanse.
   */
  function useItem(o, m) {
    const s = o.conn, ch = o.char, e = o.entity, rules = o.room.rules;
    const R = x => s.sendJSON({ t: 'itemR', op: 'use', uid: m.uid, ...x });
    const want = String(m.uid || '');
    const idx = want.startsWith('id:') ? ch.bag.findIndex(i => i.id === want.slice(3) && (effectOf(i) || isCrate(i) || angling.isRod(i) || angling.isBait(i))) : ch.bag.findIndex(i => i.uid === want);
    if (idx < 0) return R({ ok: false, why: 'item', msg: 'You have none of those.' });
    const item = ch.bag[idx];
    if (isCrate(item)) return openCrateOp(o, idx, R);         // T9 / T20: a crate or a gift box
    if (angling.useItem(o, item, idx, R)) return;             // T25: a rod casts, bait goes on the hook
    if (professions.useItem(o, item, idx, R)) return;         // W9 (P-core): a gathering tool works the nearest node
    const ef = effectOf(item);
    if (!ef) return R({ ok: false, why: 'item', id: item.id, msg: 'You cannot use that.' });
    if (ef.kind === 'none') return R({ ok: false, why: 'notYet', id: item.id, msg: (item.name || 'That') + ' does nothing yet. Keep it — it will.' });
    if (e.dead) return R({ ok: false, why: 'dead', id: item.id, msg: 'You are dead.' });
    const t = now();
    // C (the lead's follow-up to play-test 2): buffs, a torch, a poultice, the recall charm, a revive flask — the rules do
    // them (js/rules/buffs.js via rules.useItem). A recall consumes the charm only when its 5 s channel completes.
    if (ef.kind === 'rules') {
      if (!rules.useItem) return R({ ok: false, why: 'notYet', id: item.id, msg: (item.name || 'That') + ' does nothing yet.' });
      const uid = item.uid;
      const res = safeRules(o.room, 'useItem', e, ef.use, {
        name: item.name, itemId: item.id, target: e.target || null,
        done: () => { if (!recall(o)) return; const i = ch.bag.findIndex(x => x.uid === uid); if (i >= 0) consume(o, i); },
      }) || { ok: false, why: 'item' };
      if (!res.ok) return R({ ok: false, why: res.why || 'item', id: item.id, msg: res.text || 'Nothing happens.' });
      if (res.consume) {
        if (ef.charges > 0 && (item.left = (item.left ?? ef.charges) - 1) > 0) { o.dirty = true; journal(o, 'bagDel', { uid: item.uid }); journal(o, 'bagAdd', { item }); }   // a bundle of torches: one at a time (journaled: a crash keeps the count)
        else consume(o, idx);
      }
      if (o.mount && ef.use.type !== 'light' && ef.use.type !== 'buff') dismount(o, 'cast');
      return R({ ok: true, id: item.id, ...(res.channel ? { channel: res.channel } : {}), ...(res.ms ? { ms: res.ms } : {}), ...(res.msg ? { msg: res.msg } : {}), ...(item.left > 0 ? { left: item.left } : {}) });
    }
    if (ef.kind === 'potion') {
      if ((o.potionCdUntil || 0) > t) return R({ ok: false, why: 'cooldown', id: item.id, cd: o.potionCdUntil - t, msg: 'Your potions are on cooldown.' });
      let did = false;
      if (ef.cleanse) did = (rules.cleanse ? safeRules(o.room, 'cleanse', e, ef.cleanse) || [] : []).length > 0;
      else {
        const targets = [e];
        if (ef.group) { const p = partyOf.get(ch.id); if (p) for (const c of p.members) { const mo = online.get(c); if (mo && mo !== o && mo.room === o.room && !mo.entity.dead && Math.hypot(mo.entity.x - e.x, mo.entity.z - e.z) <= TONIC_R) targets.push(mo.entity); } }
        for (const te of targets) {
          const amt = potionAmount(ef, te.hpMax, te.mpMax);
          const got = restoreOn(o.room, te, amt);
          if (got.hp > 0 || got.mp > 0) did = true;
          if (got.hp > 0) o.room.emit({ type: 'hit', s: e.id, d: te.id, n: Math.round(got.hp), kind: 'heal', ab: 'potion' });
        }
      }
      if (!did) return R({ ok: false, why: 'full', id: item.id, msg: ef.cleanse ? 'Nothing to cure.' : 'You are already at full.' });
      o.potionCdUntil = t + POTION_CD_MS;
      consume(o, idx);
      if (o.mount) dismount(o, 'cast');
      R({ ok: true, id: item.id, cd: POTION_CD_MS });
      return s.sendJSON({ t: 'you', potionCd: POTION_CD_MS });
    }
    // food / drink — S20 (play-test 4): you SIT to eat (anim 'sit', `info.sit`), mend over time out of combat, and a step,
    // a jump, a cast, standing up (`item {op:'stand'}`), a hit or a fight ends the meal
    if (fighting(o, e)) return R({ ok: false, why: 'combat', id: item.id, msg: 'You cannot eat in a fight.' });
    if (e.state & STATE.swimming) return R({ ok: false, why: 'swim', id: item.id, msg: 'Not while swimming.' });
    if (e.airborne) return R({ ok: false, why: 'busy', id: item.id, msg: 'Land first.' });
    if (o.mount) dismount(o, 'eat');
    if (o.mountCast) { o.room.emit({ type: 'fx', kind: 'channel', id: e.id, ab: 'mount', name: o.mountCast.name, end: 'broken', why: 'eat' }); endMountCast(o); }
    consume(o, idx);
    o.regen = { kind: ef.kind, hpRate: ef.hpRate, mpRate: ef.mpRate, start: t, until: t + ef.ms };
    if (ef.buff && rules.useItem) safeRules(o.room, 'useItem', e, { type: 'buff', buff: ef.buff }, { name: item.name, itemId: item.id });   // hearty stew: +5% health after
    sitDown(o);
    R({ ok: true, id: item.id, sit: true });
    s.sendJSON({ t: 'you', regen: { kind: ef.kind, ms: ef.ms, sit: true } });
  }
  /**
   * T9 / T20 (play-test 5): open a crate or a gift box. The crate leaves the bag, what it held arrives (`bag`), and
   * `itemR {op:'use', ok, opened: {item, items, from:'crate'|'gift', name}}` is the reveal. The roll is C's
   * `rules.openCrate` (js/sim/crates.js falls back to re-rolling `rollLoot`): at least the crate's rarity, its slot when it
   * can, at the opener's level (never above the crate's `maxLevel`).
   */
  function openCrateOp(o, idx, R) {
    const ch = o.char, e = o.entity, item = ch.bag[idx];
    if (e.dead) return R({ ok: false, why: 'dead', id: item.id, msg: 'You are dead.' });
    if (o.frozen) return R({ ok: false, why: 'busy', id: item.id, msg: CODES.busy });
    const got = openCrate(o.room.rules, e, item, { safe: (fn, ...a) => safeRules(o.room, fn, ...a) });
    if (ch.bag.length - 1 + got.length > bagCap(o)) return R({ ok: false, why: 'bagFull', id: item.id, msg: CODES.bagFull, need: got.length, free: Math.max(0, bagCap(o) - ch.bag.length + 1) });
    const from = item.kind === 'gift' || item.gift ? 'gift' : 'crate';
    consume(o, idx);
    const added = grant(o, { items: got, gold: 0, reason: from }) || [];
    counters[from + 'sOpened'] = (counters[from + 'sOpened'] || 0) + 1;
    R({ ok: true, id: item.id, opened: { item: added[0] || null, items: added, from, name: item.name } });
    if (o.conn) o.conn.sendJSON({ t: 'crateR', ok: true, uid: item.uid, item: added[0] || null, items: added, from });      // D-UI's first name for the reveal
    saveNow(o);
  }
  function sitDown(o) {
    const e = o.entity;
    e.sitting = true; e.eating = (o.regen && o.regen.kind) || 'food'; e.infoVer++;
    e.anim('sit', 0);
  }
  /** S20: the meal is over — `why` done | moved | stood | cast | hit | combat | dead | left. */
  function endMeal(o, why) {
    const e = o.entity;
    const had = !!o.regen;
    o.regen = null;
    if (e && (e.sitting || e.eating)) { e.sitting = false; e.eating = null; e.infoVer++; if (!e.dead) e.loop('idle'); }
    if (had && o.conn) o.conn.sendJSON({ t: 'you', regen: null, why });
  }
  /** C's rules.restore when present; the stand-in rules have none, so the entity is set directly there. */
  function restoreOn(room, te, { hp = 0, mp = 0 }) {
    if (room.rules.restore) return safeRules(room, 'restore', te, { hp, mp }) || { hp: 0, mp: 0 };
    const h0 = te.hp, m0 = te.mp;
    te.setHp(te.hp + hp); te.setMp(te.mp + mp);
    return { hp: te.hp - h0, mp: te.mp - m0 };
  }
  function consume(o, idx) {
    const st = o.char.bag[idx];
    if (st && stackable(st) && countOf(st) > 1) {         // U5: one off the stack (a fresh torch of the bundle is whole again)
      st.count = countOf(st) - 1; delete st.left;
      journal(o, 'bagDel', { uid: st.uid }); journal(o, 'bagAdd', { item: st });
      econ.add('sink', 'use', { items: 1 }, o.char.level || 1);
      o.dirty = true;
      if (o.conn) o.conn.sendJSON({ t: 'bag', add: [st], remove: [st.uid], gold: o.char.gold });
      return;
    }
    const [it] = o.char.bag.splice(idx, 1);
    journal(o, 'bagDel', { uid: it.uid });
    econ.add('sink', 'use', { items: 1 }, o.char.level || 1);
    o.dirty = true;
    if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [it.uid], gold: o.char.gold });
  }
  /** 1 Hz: food and drink mend while you are out of combat; a fight, a hit or death ends the meal. */
  function foodTick() {
    const t = now();
    for (const o of online.values()) {
      const g = o.regen; if (!g) continue;
      const e = o.entity;
      const why = e.dead ? 'dead' : (o.lastHitAt || 0) > g.start ? 'hit' : fighting(o, e) ? 'combat' : !e.sitting ? 'moved' : (e.state & STATE.casting) ? 'cast' : null;
      if (!why) restoreOn(o.room, e, { hp: g.hpRate * e.hpMax, mp: g.mpRate * e.mpMax });
      if (why || t >= g.until) endMeal(o, why || 'done');
    }
  }
  /** C's ask (Q1): how far the basic attack reaches, so the client stops walking a ranger into 2.4 m. The rules'
   *  `attackRange(e)` when they have one, else the main-hand swing plan's `range` (bows, crossbows, wands); null = melee. */
  function attackReach(o) {
    const e = o.entity, rules = o.room.rules;
    if (rules.attackRange) { const r = safeRules(o.room, 'attackRange', e); return Number.isFinite(r) ? r : null; }
    const plan = e.r && e.r.unit && e.r.unit.derived && e.r.unit.derived.swing && e.r.unit.derived.swing.main;
    return plan && Number.isFinite(plan.range) ? plan.range : null;
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
    if (m.op === 'use' || m.op === 'open') return useItem(o, m);
    if (m.op === 'stand') { if (o.regen) endMeal(o, 'stood'); return; }
    if (m.op === 'split' || m.op === 'merge') return stackOp(o, m);
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
      const into = equipInto(item, m.slot);
      const slot = into || item.slot || (item.type === 'weapon' ? 'weapon' : null);
      if (!slot) return s.err('item', 'That cannot be worn.');
      let removed = [];
      // W19: a smaller pack (or a cloak) over a pack whose extra room is in use — refused, with how many slots to empty
      const packNo = packRefusal(o, slot, item);
      if (packNo) { s.sendJSON({ t: 'itemR', op: 'equip', uid: item.uid, slot: m.slot || null, ok: false, why: 'bagSlots', need: packNo.need, msg: packNo.msg }); return s.err('item', packNo.msg); }
      if (rules.equip) {
        // Q12: no slot named (or the item's own generic slot) -> the rules pick: the free ring hand, the free off hand
        const r = safeRules(o.room, 'equip', e, item, into);
        if (!r || !r.ok) {            // T7: the refusal as an answer to THIS message too (the paper doll shows why)
          const msg = (r && r.text) || 'You cannot wear that.';
          s.sendJSON({ t: 'itemR', op: 'equip', uid: item.uid, slot: m.slot || null, ok: false, why: (r && r.why) || 'refused', msg });
          return s.err('item', msg);
        }
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
      gearLook(o);
      const eqv = equipView(o);
      const worn = Object.keys(eqv).find(k => eqv[k] === item || (eqv[k] && eqv[k].uid === item.uid)) || slot;
      s.sendJSON({ t: 'you', reach: attackReach(o), attackRange: attackReach(o) });
      wantSheet(o); bagCapTell(o);
      s.sendJSON({ t: 'itemR', op: 'equip', uid: item.uid, slot: worn, ok: true });
      return s.sendJSON({ t: 'equip', slot: worn, item, equipment: eqv });
    }
    if (m.op === 'unequip') {
      const eq = equipView(o);
      const slot = m.slot || Object.keys(eq).find(k => eq[k] && eq[k].uid === m.uid);
      if (!slot || !eq[slot] || eq[slot].uid !== m.uid) return s.err('item');
      // W19: the pack cannot come off while its extra slots hold things — say why and how many
      const packNo = packRefusal(o, slot, null);
      if (packNo) { s.sendJSON({ t: 'itemR', op: 'unequip', uid: m.uid, slot, ok: false, why: 'bagSlots', need: packNo.need, msg: packNo.msg }); return s.err('item', packNo.msg); }
      if (ch.bag.length >= bagCap(o)) return s.err('bagFull');
      let item;
      if (rules.unequip) { const r = safeRules(o.room, 'unequip', e, slot); if (!r || !r.ok) return s.err('item', (r && r.text) || 'Not now.'); item = r.item; }
      else { item = ch.equipment[slot]; delete ch.equipment[slot]; }
      ch.bag.push(item);
      journalGear(o);
      journal(o, 'bagAdd', { item });
      o.dirty = true;
      s.sendJSON({ t: 'bag', add: [item], remove: [], gold: ch.gold });
      gearLook(o);
      s.sendJSON({ t: 'you', reach: attackReach(o), attackRange: attackReach(o) });
      wantSheet(o); bagCapTell(o);
      return s.sendJSON({ t: 'equip', slot, item: null, equipment: equipView(o) });
    }
  }

  // ---- play-test 2: corpse loot (Q3/Q4), shops (Q11), mounts (Q16), barber (Q20), prefs (Q22), follow (Q2) ----
  const corpses = createCorpses({ now, newUid, rng: () => (first.towns[0] || first.copies[0]).host.random('roll'), partyOf: c => partyOf.get(c) || null, online, grant: (o, a) => grant(o, a), log, counters, bagMax: o => bagCap(o) });
  // S5/S9 (play-test 4): treasure chests, deliveries, escorts and rescues dropped near players; errand runners' letters
  const roadEvents = createRoadEvents({ data: first.L.treasure || null, wanderers: first.L.wanderers || null, online, corpses, grant: (o, a) => grant(o, a),
    questEvent: (o, ev) => questEvent(o, ev), bookOf: o => bookOf(o), provOf: r => provOf(r), now, wallNow, rng: () => (first.towns[0] || first.copies[0]).host.random('road'), log, counters,
    journal: (o, k, p) => journal(o, k, p), questSaved: o => questSaved(o), sendQuests: o => sendQuests(o), partyOf: c => partyOf.get(c) || null, mailTo: a => sysmail.mailTo(a), enabled: opts.roadEvents !== false });
  // W5 (owner feedback 8): ox-cart fast travel between towns (js/sim/carts.js over E's data/provinces/carts.json)
  const carts = createCarts({ data: first.L.carts || opts.cartData || null, layouts, online, journal: (o, k, p) => journal(o, k, p), econ, setTimeoutTicks: (fn, n) => setTimeoutTicks(fn, n),
    moveTo: (o, p, at, via) => moveTo(o, p, at, via), questEvent: (o, ev) => questEvent(o, ev), fighting: (o, e) => fighting(o, e), dismount: (o, why) => { if (o.mount) dismount(o, why); endMountCast(o); },
    consume: (o, i) => consume(o, i), tickMs: TICK_MS, log, counters, cartFare });
  const mountBook = createMountBook(first.L.mounts || opts.mountData || null);
  const shops = createShops({ data: first.L.shops || opts.shopData || null, mounts: mountBook, now: wallNow, log, rng: () => (first.towns[0] || first.copies[0]).host.random('shop') });
  const social = new Map();        // char id -> { friends: Set, tradeFriendsOnly } (the gateway keeps it current, Q15)
  const clsNameOf = cls => (opts.classNames && opts.classNames[cls]) || String(cls || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const prefsOf = ch => ({ showGear: !(ch.prefs && ch.prefs.showGear === false), showHelm: !(ch.prefs && ch.prefs.showHelm === false) });

  /** Q16: the first mount at level 5 (on login for a character already past it). */
  function starterMount(o, quiet = false) {
    if (!mountBook.grantStarter(o.char)) return;
    journal(o, 'set', { k: 'mounts', v: o.char.mounts }); o.dirty = true;
    if (!quiet && o.conn) o.conn.sendJSON({ t: 'you', mounts: mountBook.owned(o.char), mountNew: mountBook.starter.id });
  }
  function applyMount(o) {
    const e = o.entity, def = mountBook.get(o.mount);
    if (!def) { o.mount = null; return; }
    e.mount = def.id; e.speedMul = mountSpeed(o, def); e.infoVer++;
    const c = o.room.clients.get(e.id); if (c) c.selfDirty = true;
    if (o.conn) o.conn.sendJSON({ t: 'you', mount: def.id, speedMul: e.speedMul });
  }
  function dismount(o, why) {
    const e = o.entity;
    o.mount = null;
    if (e.mount) { e.mount = null; e.speedMul = 1; e.infoVer++; }
    if (o.conn) o.conn.sendJSON({ t: 'you', mount: null, speedMul: 1, dismount: why });
  }
  /** Q16 with stream C's rules (js/rules/mount.js): calling a mount is a 1.5 s cast standing still; a hit breaks it.
   *  W26 (round 8, report #47 "You stopped calling your mount" x3): the call HOLDS you still (`e.held`, js/sim/room.js) — moving no longer
   *  cancels it, the server simply does not move you until you are in the saddle. `cancel` (or `off`) during the call ends it. */
  function endMountCast(o) { o.mountCast = null; if (o.entity.held === 'mount') o.entity.held = null; }
  const fighting = (o, e) => !!(e.state & STATE.combat) || (now() - (o.lastHitAt || -1e9)) < MOUNT_RULES.combatSeconds * 1000;
  function mountOp(o, m) {
    const s = o.conn, e = o.entity;
    if (!MOUNT_OPS.includes(m.op)) return bad(s, 'op');
    const R = x => s.sendJSON({ t: 'mountR', op: m.op, ...x });
    if (m.op === 'off' || m.op === 'cancel') {
      const was = !!o.mountCast;
      if (was) { o.room.emit({ type: 'castX', id: e.id, ab: 'mount', why: 'asked' }); o.room.emit({ type: 'fx', kind: 'channel', id: e.id, ab: 'mount', name: o.mountCast.name, end: 'broken', why: 'asked' }); }
      endMountCast(o);
      if (m.op === 'off' && o.mount) dismount(o, 'asked');
      return R({ ok: true, ...(was ? { why: 'cancelled' } : {}) });
    }
    const def = m.id ? mountBook.get(m.id) : mountBook.best(o.char);
    if (!def || !(o.char.mounts || []).includes(def.id)) return R({ ok: false, why: 'none', msg: (o.char.level || 1) < 5 ? 'You get your first mount at level 5. A stablehand sells others.' : 'You do not own that mount. A stablehand sells them.' });
    const why = mountRefusal({ dead: e.dead, swimming: !!(e.state & STATE.swimming), fighting: fighting(o, e), roomKind: o.room.kind, now: now() / 1000, thrownAt: o.thrownAt != null ? o.thrownAt / 1000 : null, casting: !!o.mountCast });
    if (why) return R({ ok: false, why: e.dead ? 'dead' : (e.state & STATE.swimming) ? 'swim' : o.room.kind === 'instance' ? 'indoors' : fighting(o, e) ? 'combat' : 'busy', msg: why });
    const ms = Math.round(MOUNT_RULES.castSeconds * 1000);
    o.mountCast = { id: def.id, until: now() + ms, x: e.x, z: e.z, name: 'Call ' + def.name };
    e.held = 'mount';
    o.room.emit({ type: 'castbar', id: e.id, ab: 'mount', name: 'Call ' + def.name, ms });
    // S21 (play-test 4): the same channel events as the recall charm, so the client's cast bar draws the call's progress
    o.room.emit({ type: 'fx', kind: 'channel', id: e.id, ab: 'mount', name: 'Call ' + def.name, ms });
    return R({ ok: true, id: def.id, casting: ms, until: o.mountCast.until, stand: true });
  }
  /** Each tick for someone calling a mount: a step past castDrift or a hit breaks it; done -> riding. */
  function mountCastTick(o) {
    const c = o.mountCast, e = o.entity;
    if (!c) return;
    // a step can no longer break it (you are held); being MOVED can (a knock-back, a transfer): 3 m, not the old 0.6 m drift
    const hit = (o.lastHitAt || 0) > c.until - MOUNT_RULES.castSeconds * 1000, shoved = Math.hypot(e.x - c.x, e.z - c.z) > 3;
    const broke = e.dead || (e.state & STATE.swimming) || shoved || hit;
    if (broke) { endMountCast(o); o.room.emit({ type: 'castX', id: e.id, ab: 'mount', why: e.dead ? 'dead' : hit ? 'hit' : 'moved' }); o.room.emit({ type: 'fx', kind: 'channel', id: e.id, ab: 'mount', name: c.name, end: 'broken', why: e.dead ? 'dead' : hit ? 'hit' : 'moved' }); if (o.conn) o.conn.sendJSON({ t: 'mountR', op: 'summon', ok: false, why: 'interrupted', msg: hit ? 'A hit broke the call.' : 'The call was broken.' }); return; }
    if (now() < c.until) return;
    endMountCast(o);
    o.room.emit({ type: 'castX', id: e.id, ab: 'mount', why: 'done' });
    o.room.emit({ type: 'fx', kind: 'channel', id: e.id, ab: 'mount', name: c.name, end: 'done' });
    o.mount = c.id; applyMount(o);
  }

  /** Q11: a shop NPC within reach, and the kind it trades (its office's `shop`, else its role's). */
  function shopNpc(o, npcId) {
    const r = o.room.objectNear(o.entity, npcId, SHOP_RANGE);
    if (r.why) return { why: r.why, msg: r.why === 'far' ? 'Walk over to them first.' : 'Who?' };
    const kind = shops.kindOf(r.o);
    if (!kind) return { why: 'noShop', msg: (r.o.name || 'They') + ' has nothing to sell.' };
    return { npc: r.o, role: (r.o.data.npc && r.o.data.npc.role) || null, kind };
  }
  const townNameOf = o => (o.room.kind === 'town' ? o.room.name : null);
  function shopView(o, npc, role) {
    const kind = shops.kindOf(npc), sh = shops.shopOf(kind);
    const stock = shops.stock(npc, o.entity, o.room.rules, townNameOf(o));
    o.shopAt = { npc: npc.id, room: o.room.id, stock };
    const rules = o.room.rules;
    return { t: 'shopView', npc: npc.id, name: npc.name, role, kind, title: sh ? sh.title : npc.name, says: (sh && sh.says) || undefined, services: (sh && sh.services) || undefined,
      categories: sh && sh.categories ? Object.fromEntries(Object.entries(sh.categories).map(([k, v]) => [k, v.label || k])) : undefined,
      stock: stock.map(r => { if (!r.item) return r; const t = r.item.kind === 'potion' ? potionText(r.item, { hpMax: o.entity.hpMax, mpMax: o.entity.mpMax }, potionTable) : null; return { ...r, item: { ...r.item, _granted: undefined, uid: 'stock:' + r.id, price: r.price, ...(t ? { desc: t.desc, restore: t.restore || undefined } : {}) } }; }), sellRate: shops.pricing.sellFactor,
      buyback: (o.buyback || []).map(b => ({ uid: b.item.uid, item: b.item, price: b.price })),
      sell: (o.char.bag || []).map(it => { const each = shops.sellPrice(it, rules), n = countOf(it); return n > 1 ? { uid: it.uid, price: each * n, each, count: n } : { uid: it.uid, price: each }; }) };
  }
  function shopOp(o, m) {
    const s = o.conn, ch = o.char, e = o.entity;
    if (!SHOP_OPS.includes(m.op)) return bad(s, 'op');
    const R = x => s.sendJSON({ t: 'shopR', op: m.op, ...x });
    // D-UI's first names: list = open, buyback = back, buy by `uid` = the stock row; repair: Farhold items never wear out
    const op = m.op === 'list' ? 'open' : m.op === 'buyback' ? 'back' : m.op;
    if (op === 'repair') return R({ ok: false, why: 'noRepair', msg: 'Nothing you carry wears out. The smith sells new gear instead.' });
    if (op === 'buy' && !m.id && m.uid) m = { ...m, id: String(m.uid).replace(/^stock:/, '') };
    if (e.dead) return R({ ok: false, why: 'dead', msg: 'You are dead.' });
    if (o.frozen) return R({ ok: false, why: 'busy', msg: 'Busy, try again in a moment.' });
    const q = shopNpc(o, m.npc);
    if (q.why) return R({ ok: false, why: q.why, msg: q.msg });
    const { npc, role } = q;
    const rules = o.room.rules;
    ch.bag ||= [];
    if (op === 'open') return s.sendJSON(shopView(o, npc, role));
    if (op === 'buy') {
      const stock = o.shopAt && o.shopAt.npc === npc.id && o.shopAt.room === o.room.id ? o.shopAt.stock : shops.stock(npc, e, rules, townNameOf(o));
      const row = stock.find(x => x.id === m.id);
      if (!row) return R({ ok: false, why: 'item', msg: 'That is not for sale here any more.' });
      if (row.level && (ch.level || 1) < row.level) return R({ ok: false, why: 'level', msg: 'You need to be level ' + row.level + ' for that.' });
      if ((ch.gold || 0) < row.price) return R({ ok: false, why: 'gold', msg: 'That costs ' + row.price + ' gold.', cost: row.price });
      if (!row.mount && ch.bag.length >= bagCap(o)) return R({ ok: false, why: 'bagFull', msg: CODES.bagFull });
      ch.gold -= row.price; journal(o, 'gold', { d: -row.price }); econ.add('sink', 'shop', { gold: row.price }, ch.level || 1);
      if (row.mount) {
        ch.mounts ||= [];
        if (!ch.mounts.includes(row.mount.id)) ch.mounts.push(row.mount.id);
        journal(o, 'set', { k: 'mounts', v: ch.mounts }); o.dirty = true;
        s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
        s.sendJSON({ t: 'you', mounts: mountBook.owned(ch), mountNew: row.mount.id });
        saveNow(o);
      } else {
        // S3 (play-test 4): the stock row's item is SHARED (one cached stock per shop per level bracket) — grant() marks
        // what it hands out `_granted`, so handing it the row's own object made every later buy of that row take the gold
        // and give nothing. Each buyer gets a fresh copy, and a buy that lands nothing is refunded on the spot.
        const fresh = row.item && typeof row.item === 'object' && row.item.name ? JSON.parse(JSON.stringify(row.item)) : null;
        if (fresh) { delete fresh._granted; delete fresh.uid; }
        const got = fresh ? grant(o, { items: [fresh], gold: 0, reason: 'shop', from: npc }) : [];
        if (!got || !got.length) {
          ch.gold += row.price; journal(o, 'gold', { d: row.price }); econ.add('faucet', 'shopRefund', { gold: row.price }, ch.level || 1);
          s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
          return R({ ok: false, why: 'item', msg: 'That is not for sale here any more. Your gold is back.', refund: row.price });
        }
        s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
      }
      R({ ok: true, id: m.id, cost: row.price });
      return s.sendJSON(shopView(o, npc, role));
    }
    if (op === 'sell') {
      const i = ch.bag.findIndex(it => it.uid === m.uid);
      if (i < 0) return R({ ok: false, why: 'item', msg: CODES.item });
      if (trades.offered(ch.id, m.uid)) return R({ ok: false, why: 'item', msg: 'That item is in your trade window.' });
      const [it] = ch.bag.splice(i, 1);
      const price = shops.sellPrice(it, rules) * countOf(it);          // U5: a stack sells whole
      ch.gold = (ch.gold || 0) + price;
      journal(o, 'bagDel', { uid: it.uid }); journal(o, 'gold', { d: price });
      econ.add('faucet', 'sell', { gold: price }, ch.level || 1); econ.add('sink', 'sell', { items: 1 }, ch.level || 1);
      o.buyback ||= []; o.buyback.push({ item: it, price });
      while (o.buyback.length > (shops.pricing.buyback || 12)) o.buyback.shift();
      o.dirty = true;
      s.sendJSON({ t: 'bag', add: [], remove: [it.uid], gold: ch.gold });
      R({ ok: true, uid: it.uid, gold: price });
      if (RARE_SALE.has(it.rarity)) saveNow(o);
      return s.sendJSON(shopView(o, npc, role));
    }
    // back: buy back something sold this session, for what it fetched
    const k = (o.buyback || []).findIndex(b => b.item.uid === m.uid);
    if (k < 0) return R({ ok: false, why: 'item', msg: 'That is gone.' });
    const b = o.buyback[k];
    if ((ch.gold || 0) < b.price) return R({ ok: false, why: 'gold', msg: 'That costs ' + b.price + ' gold.', cost: b.price });
    if (ch.bag.length >= bagCap(o)) return R({ ok: false, why: 'bagFull', msg: CODES.bagFull });
    o.buyback.splice(k, 1);
    ch.gold -= b.price; ch.bag.push(b.item);
    journal(o, 'gold', { d: -b.price }); journal(o, 'bagAdd', { item: b.item });
    setTimeoutTicks(() => { if (online.get(ch.id) === o) restack(o); }, 1);
    econ.add('sink', 'buyback', { gold: b.price }, ch.level || 1);
    o.dirty = true;
    s.sendJSON({ t: 'bag', add: [b.item], remove: [], gold: ch.gold });
    R({ ok: true, uid: b.item.uid, cost: b.price });
    return s.sendJSON(shopView(o, npc, role));
  }
  const RARE_SALE = new Set(['rare', 'unique', 'legendary', 'set']);

  /** Q20: a new look at a barber, for gold. Others get the new `info.look`. */
  function barberOp(o, m) {
    const s = o.conn, ch = o.char, e = o.entity;
    const R = x => s.sendJSON({ t: 'lookR', ...x });
    const r = o.room.objectNear(e, m.npc, BARBER_M);
    if (r.why) return R({ ok: false, why: r.why, msg: r.why === 'far' ? 'Walk over to the barber first.' : 'Who?' });
    if (!(r.o.data && r.o.data.npc && r.o.data.npc.role === 'barber')) return R({ ok: false, why: 'noBarber', msg: 'Only a barber can change how you look.' });
    const c = cleanLook(m.look, ch.look);
    if (!c.ok) return R({ ok: false, why: c.why, msg: c.msg });
    const cost = barberCost(ch, ch.look, c.look);
    if ((ch.gold || 0) < cost) return R({ ok: false, why: 'gold', msg: 'That look costs ' + cost + ' gold.', cost });
    if (cost) { ch.gold -= cost; journal(o, 'gold', { d: -cost }); econ.add('sink', 'barber', { gold: cost }, ch.level || 1); }
    ch.flags = { ...(ch.flags || {}), barberUsed: true }; journal(o, 'set', { k: 'flags', v: ch.flags });
    ch.look = c.look; e.look = c.look; e.infoVer++;
    journal(o, 'set', { k: 'look', v: c.look }); o.dirty = true;
    s.sendJSON({ t: 'bag', add: [], remove: [], gold: ch.gold });
    R({ ok: true, look: c.look, cost });
    presence(o);                                   // party frames + friends lists draw the new face
    saveNow(o);
  }
  /**
   * What a barber charges (stream E's shops.json `barber.services.appearance`): each part changed at its list price (hair,
   * hair colour, beard, eyes, face, skin, body; a new race = everything), capped at `everything`, × (1 + perLevel × (level
   * - 1)). The first change a character ever makes is free.
   */
  const barberFree = () => !(economy().barber.mult > 0);      // X4 (owner feedback 9): `barber.mult: 0` in economy.json — free for everyone
  function barberCost(ch, before, after) {
    if (barberFree() || !(ch.flags && ch.flags.barberUsed)) return 0;
    const svc = (shops.kinds.barber && shops.kinds.barber.services && shops.kinds.barber.services.appearance) || {};
    const EB = economy().barber;
    const P = { ...EB, ...(svc.prices || {}) };
    const a = (before && before.custom) || {}, b = (after && after.custom) || {};
    const same = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
    const idOf = v => (v && typeof v === 'object' ? v.id : v);
    let sum = 0;
    if ((before && before.race) !== after.race) sum = P.everything;
    else {
      if (!same(idOf(a.hair), idOf(b.hair))) sum += P.hair;
      if (!same(a.hair && a.hair.color, b.hair && b.hair.color)) sum += P.hairColour;
      if (!same(a.facialHair, b.facialHair)) sum += P.beard;
      if (!same(a.eyes, b.eyes)) sum += P.eyes;
      if (['headShape', 'nose', 'mouth', 'brows', 'ears', 'extras'].some(k => !same(a[k], b[k])) || (before && before.seed) !== after.seed) sum += P.face;
      const ab = a.body || {}, bb = b.body || {};
      if (!same(ab.skin, bb.skin)) sum += P.skin;
      const { skin: _s1, ...ra } = ab, { skin: _s2, ...rb } = bb; void _s1; void _s2;
      if (!same(ra, rb) || ['top', 'bottom', 'shoes', 'hat', 'accessory', 'cape', 'decor'].some(k => !same(a[k], b[k]))) sum += P.body;
    }
    sum = Math.min(sum, P.everything);
    return Math.round(sum * (1 + (svc.perLevel ?? EB.perLevel) * ((ch.level || 1) - 1)) * Math.max(0, economy().barber.mult));
  }
  /** Q22: show / hide your gear (or just the head piece) — for everybody who looks at you. */
  function prefOp(o, m) {
    if (!PREF_KEYS.includes(m.k)) return bad(o.conn, 'k');
    o.char.prefs = { ...prefsOf(o.char), [m.k]: !!m.v };
    journal(o, 'set', { k: 'prefs', v: o.char.prefs }); o.dirty = true;
    gearLook(o);
    o.conn.sendJSON({ t: 'you', prefs: prefsOf(o.char) });
  }
  /** Q2: may I follow this one? (Following itself is the client walking after them.) */
  function followOp(o, m) {
    const s = o.conn, e = o.entity;
    const t = o.room.entities.get(m.id);
    const R = x => s.sendJSON({ t: 'followR', id: m.id, ...x });
    if (!t || t.removed) return R({ ok: false, why: 'gone', msg: 'They are not here.' });
    if (t === e) return R({ ok: false, why: 'self', msg: 'You cannot follow yourself.' });
    if (t.kind === 'object') return R({ ok: false, why: 'target', msg: 'You cannot follow that.' });
    if (t.kind === 'monster' || (t.team !== e.team && !(t.state & STATE.friendly))) return R({ ok: false, why: 'hostile', msg: 'You cannot follow an enemy.' });
    if (t.dead) return R({ ok: false, why: 'dead', msg: 'They are dead.' });
    if (Math.hypot(t.x - e.x, t.z - e.z) > FOLLOW_M) return R({ ok: false, why: 'far', msg: 'Too far away to follow.' });
    return R({ ok: true, name: t.name });
  }
  /** E's innkeeper service "Make this inn your home": recall and respawn bring you to this town (saved `char.bind`). */
  function bindOp(o, m) {
    const s = o.conn, R = x => s.sendJSON({ t: 'bindR', ...x });
    const r = o.room.objectNear(o.entity, m.npc, 6);
    if (r.why) return R({ ok: false, why: r.why, msg: r.why === 'far' ? 'Walk over to them first.' : 'Who?' });
    if (!(r.o.data && r.o.data.npc && r.o.data.npc.role === 'innkeeper') || o.room.kind !== 'town') return R({ ok: false, why: 'noInn', msg: 'Only an innkeeper in a town can give you a home.' });
    o.char.bind = o.room.id; journal(o, 'set', { k: 'bind', v: o.room.id }); o.dirty = true;
    return R({ ok: true, town: o.room.name, room: o.room.id, msg: o.room.name + ' is your home now.' });
  }
  /** C's oats (an item buff): riding speed × (1 + rules.itemBuffs(e).mountSpeedPct). Rechecked once a second while riding. */
  function mountSpeed(o, def) {
    const b = o.room.rules.itemBuffs ? safeRules(o.room, 'itemBuffs', o.entity) || {} : {};
    return mountSpeedMul(def) * (1 + (+b.mountSpeedPct || 0));
  }
  function mountSpeedTick() {
    for (const o of online.values()) {
      if (!o.mount || !o.entity.mount) continue;
      const def = mountBook.get(o.mount), v = def ? mountSpeed(o, def) : 1;
      if (Math.abs(v - o.entity.speedMul) > 1e-6) { o.entity.speedMul = v; const c = o.room.clients.get(o.entity.id); if (c) c.selfDirty = true; if (o.conn) o.conn.sendJSON({ t: 'you', speedMul: v }); }
    }
  }
  /** Q2 (D-UI's right-click menu): what someone is wearing. */
  function inspectOp(o, m) {
    const s = o.conn, e = o.entity, t = o.room.entities.get(m.id);
    const R = x => s.sendJSON({ t: 'inspectR', id: m.id, ...x });
    if (!t || t.kind !== 'player' || !t.char) return R({ ok: false, why: 'target', msg: 'Nothing to inspect.' });
    if (Math.hypot(t.x - e.x, t.z - e.z) > FOLLOW_M) return R({ ok: false, why: 'far', msg: 'Too far away.' });
    const ot = online.get(t.char.id);
    return R({ ok: true, name: t.name, cls: t.char.cls, clsName: clsNameOf(t.char.cls), level: t.level, look: t.char.look || null, equipment: ot ? equipView(ot) : {} });
  }
  /** Q27: quests every character is given on entering the world (stream E's `auto: true`). */
  function autoQuests(o) {
    const b = bookOf(o);
    if (!b.grantAuto) return;
    const got = b.grantAuto(o.char);
    if (got && got.length) questSaved(o);
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
        const soc = social.get(to.char.id);       // Q15: "only allow trade requests from friends" (their account setting)
        if (soc && soc.tradeFriendsOnly && !soc.friends.has(me)) return s.err('trade', to.char.name + ' only takes trade requests from friends.');
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
    if ((a.char.bag.length - ia.length + ib.length) > bagCap(a) || (b.char.bag.length - ib.length + ia.length) > bagCap(b)) return fail('bagFull');
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
        o.char.bag = o.char.bag.filter(i => !out.has(i.uid)).concat(JSON.parse(JSON.stringify(get)).map(i => { delete i.apart; return i; }));
        o.char.gold = (o.char.gold || 0) + dg;
        o.char.version = nx.version;
        o.savedSeq = Math.max(o.savedSeq, sq);
        o.lastSaveAt = now();
        if (o.conn) o.conn.sendJSON({ t: 'bag', add: get, remove: [...out], gold: o.char.gold });
        restack(o);                           // U5: traded potions join the stacks already carried
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
  const mail = createMail({ store, online, journal, syncChar: o => syncChar(o), econ, trades, send, setTimeoutTicks, wallNow, filter: chatFilter, log, counters, BAG_MAX: o => bagCap(o), saveNow: o => saveNow(o), opts: mailOpts, restack: o => restack(o) });

  // ---- play-test 5: system mail (T20), feedback + admins (T19/T21), revives (T4), the character sheet (T18) ----
  /** The ONE mail API (js/sim/sysmail.js): `mailTo({ to, subject, body, items?, gold?, gift?, crate? })` — events, quests, anything. */
  const sysmail = createSystemMail({ store, newUid, wallNow, notify: c => send({ k: 'mailed', to: c }), log, counters });
  const feedback = createFeedback({ env: opts.env || null, store, wallNow, sink: opts.feedbackSink || null, sysmail, log, counters, filter: chatFilter, opts: opts.feedbackOpts || {} });
  // W9 (P-core) — professions (js/sim/professions.js over js/rules/professions*.js and data/provinces/professions*.json)
  const professions = createProfessions({ layouts, online, provOf: r => provOf(r), grant: (o, a) => grant(o, a), journal: (o, k, p) => journal(o, k, p), questEvent: (o, ev) => questEvent(o, ev),
    now, wallNow, log, counters, fighting: (o, e) => fighting(o, e), dismount: (o, why) => dismount(o, why), endMeal: (o, why) => endMeal(o, why), stopFishing: (o, why) => angling.stop(o, why),
    wantSheet: o => wantSheet(o), bagCap: o => bagCap(o), isFire: obj => angling.isFire(obj), anglingView: ch => angling.view(ch), tradeHolds: (c, uid) => trades.offered(c, uid),
    spend: (o, gold, reason) => { o.char.gold -= gold; journal(o, 'gold', { d: -gold }); econ.add('sink', reason || 'craft', { gold }, o.char.level || 1); if (o.conn) o.conn.sendJSON({ t: 'bag', add: [], remove: [], gold: o.char.gold }); o.dirty = true; },
    potionText: (it, o) => potionText(it, { hpMax: o.entity.hpMax, mpMax: o.entity.mpMax }, potionTable), opts: opts.professionOpts || {} });
  // T25 — angling (js/sim/angling.js over C's js/rules/fishing.js and E's data/provinces/angling*.json)
  const angling = createAngling({ layouts, online, provOf: r => provOf(r), grant: (o, a) => grant(o, a), journal: (o, k, p) => journal(o, k, p), questEvent: (o, ev) => questEvent(o, ev),
    consume: (o, i) => consume(o, i), now, wallNow, log, counters, safeRules: (r, fn, ...a) => safeRules(r, fn, ...a), dayPhase: () => dayPhase(), fighting: (o, e) => fighting(o, e),
    dismount: (o, why) => dismount(o, why), endMeal: (o, why) => endMeal(o, why), wantSheet: o => wantSheet(o), bagMax: o => bagCap(o), setTimeoutTicks: (fn, n) => setTimeoutTicks(fn, n), opts: opts.anglingOpts || {} });
  /**
   * W21 (owner feedback 8, report #42 "DPS meters — a settings option, default off"). The client's own events carry only what
   * is drawn; the meter wants one exact record per landed hit / heal / miss for YOU and YOUR PARTY (and their pets). Sent only
   * to clients that asked (`meter {on:true}`), batched four times a second:
   *   hits { l: [[src, tgt, n, flags, sk, el, over, abs], …] }
   * src / tgt = entity ids (src 0 = a damage-over-time tick with no living source); flags: 1 heal, 2 crit, 4 miss, 8 killing
   * blow, 16 blocked, 32 dot tick, 64 dodged; sk = the ability id (`basic` for a weapon's own swing, `dot` for a tick);
   * el = element ('' = physical); over = overkill / overheal; abs = absorbed (both 0 until C's hit event carries them).
   */
  const meterOn = new Set();
  const METER_FLAG = Object.freeze({ heal: 1, crit: 2, miss: 4, kill: 8, block: 16, dot: 32, dodge: 64 });
  function meterFeed(ev, r) {
    const src = ev.s ? r.entities.get(ev.s) : null, dst = r.entities.get(ev.d);
    if (!dst) return;
    const charOf = x => (!x ? null : x.kind === 'player' && x.char ? x.char.id : x.data && x.data.pet && x.data.owner ? ((r.entities.get(x.data.owner) || {}).char || {}).id ?? null : null);
    const sc = charOf(src), dc = charOf(dst);
    if (sc == null && dc == null) return;
    let row = null;
    for (const o of meterOn) {
      if (o.room !== r || !o.conn) continue;
      const me = o.char.id, p = partyOf.get(me);
      const mine = c => c != null && (c === me || (p && p.members.includes(c)));
      if (!mine(sc) && !mine(dc)) continue;
      if (!row) {
        const miss = ev.type === 'miss', heal = ev.kind === 'heal', dot = ev.skill === 'dot';
        const flags = (heal ? 1 : 0) | (ev.crit ? 2 : 0) | (miss ? 4 : 0) | (!miss && !heal && (dst.dead || dst.hp <= 0) ? 8 : 0) | (miss && ev.why === 'block' ? 16 : 0) | (dot ? 32 : 0) | (miss && ev.why === 'dodge' ? 64 : 0);
        row = [ev.s || 0, ev.d, Math.round(ev.n || 0), flags, dot ? 'dot' : (ev.ab || ev.skill || 'basic'), ev.el || '', Math.round(ev.over || 0), Math.round(ev.abs || ev.absorbed || 0)];
      }
      (o.hitRows ||= []).push(row);
      if (o.hitRows.length >= 60) meterFlush(o);
    }
  }
  function meterFlush(o) { if (o.hitRows && o.hitRows.length && o.conn) o.conn.sendJSON({ t: 'hits', l: o.hitRows }); o.hitRows = null; }
  function meterTick() { for (const o of meterOn) { if (!online.has(o.char.id) || online.get(o.char.id) !== o) { meterOn.delete(o); continue; } meterFlush(o); } }
  /**
   * W22 (owner feedback 8, report #43: "REMOVE light items from the game — I never meant to add those"). At every entry:
   * each lantern / torch in the BAG is removed and paid back at stream C's `lightRefund(item)` (its full list price x count;
   * without C's helper: the item's own value, at least 1). A WORN light is C's part (`rules.addEntity` drops it and pays
   * through `host.award(e, {reason:'lightRefund'})`); a save's `equipment.light` is dropped here too so it cannot come back.
   * One system line + one letter say what happened; `flags.lightRefund` keeps the total (the sweep itself is safe to run
   * again: once the items are gone there is nothing to pay).
   */
  const LIGHT = opts.lightItems || null;
  const lightRules = () => { const r = (first.towns[0] || first.copies[0]).rules; return r && typeof r.isLightItem === 'function' ? r : null; };      // C also hangs both helpers on the room rules
  function isLight(it) {
    if (!it || typeof it !== 'object') return false;
    if (LIGHT && LIGHT.is) { try { return !!LIGHT.is(it); } catch { /* fall through */ } }
    const lr = lightRules(); if (lr) { try { return !!lr.isLightItem(it); } catch { /* fall through */ } }
    return it.slot === 'light' || it.type === 'light' || (it.use && it.use.type === 'light');
  }
  function lightWorth(it) {
    let g = null;
    if (LIGHT && LIGHT.refund) { try { g = LIGHT.refund(it); } catch { g = null; } }
    else { const lr = lightRules(); if (lr && lr.lightRefund) { try { g = lr.lightRefund(it); } catch { g = null; } } }
    if (!Number.isFinite(g)) g = Math.max(1, Math.round(it.price || it.value || 1)) * countOf(it);
    return Math.max(0, Math.round(g));
  }
  function lightSweep(o, live = false) {
    const ch = o.char, gone = [];
    let gold = 0, n = 0;
    for (let i = (ch.bag || []).length - 1; i >= 0; i--) {
      const it = ch.bag[i];
      if (!isLight(it)) continue;
      gold += lightWorth(it); n += countOf(it);
      ch.bag.splice(i, 1); gone.push(it.uid);
      journal(o, 'bagDel', { uid: it.uid });
    }
    if (ch.equipment && ch.equipment.light) {          // the rules pay for a worn one; the slot itself leaves the save
      const it = ch.equipment.light;
      if (!(o.room.rules && o.room.rules.lightRefundOwed)) { gold += lightWorth(it); n++; }
      delete ch.equipment.light;
      journal(o, 'set', { k: 'equipment', v: ch.equipment });
    }
    if (!n && !gold) return 0;
    ch.gold = (ch.gold || 0) + gold;
    journal(o, 'gold', { d: gold, reason: 'lightRefund' });
    econ.add('faucet', 'lightRefund', { gold }, ch.level || 1);
    ch.flags = { ...(ch.flags || {}), lightRefund: ((ch.flags && ch.flags.lightRefund) || 0) + gold };
    journal(o, 'set', { k: 'flags', v: ch.flags });
    o.dirty = true; counters.lightRefunds = (counters.lightRefunds || 0) + n;
    const text = 'Lanterns and torches were removed from the game — everyone carries a light now. You were paid ' + gold + ' gold for yours.';
    if (live && o.conn) { o.conn.sendJSON({ t: 'bag', add: [], remove: gone, gold: ch.gold }); o.conn.sendJSON({ t: 'chat', ch: 'system', from: 0, name: 'The Vale', text }); }
    else o.lightNote = text;                           // said once the client is listening (after `joined`)
    Promise.resolve(sysmail.mailTo({ to: ch.id, subject: 'Lanterns and torches', from: 'The Vale', body: text })).catch(err => log('light refund letter', err && err.message));
    return gold;
  }
  /**
   * W19 (owner feedback 8, report #40 "backpacks: fewer affix slots than a cape but bonus inventory slots"). Bag capacity =
   * economy `bag.base` (40) + the worn pack's slots (C's `rules.bagBonus(e)` / `bagBonusOf(item)`), never over BAG_MAX. A bag
   * already over its capacity (an old save from the 120-slot days) loses nothing — it only takes nothing more until it is under.
   */
  const bagBase = () => Math.max(1, Math.min(BAG_MAX, Math.round(economy().bag.base || 40)));
  const packSlots = it => (it ? Math.max(0, Math.round(+it.bagSlots || 0)) : 0);      // C: a backpack item carries `bagSlots: n` (js/rules/tv-gear.js bagBonusOf reads the same field)
  function bagBonus(o) {
    const r = o.room && o.room.rules;
    if (r && r.bagBonus && o.entity) { const n = safeRules(o.room, 'bagBonus', o.entity); if (Number.isFinite(n)) return Math.max(0, n); }
    return packSlots(equipView(o).back);
  }
  const bagCap = o => Math.min(BAG_MAX, bagBase() + bagBonus(o));
  function bagCapTell(o) { const c = bagCap(o); if (o.bagCapSent !== c) { o.bagCapSent = c; if (o.conn) o.conn.sendJSON({ t: 'you', bagMax: c, bagBase: bagBase() }); } }
  /** Would wearing `incoming` in `slot` (null = taking it off) leave more in the bag than it can hold? -> { need, msg } | null */
  function packRefusal(o, slot, incoming) {
    if (slot !== 'back') return null;
    const worn = equipView(o).back;
    const had = packSlots(worn), will = packSlots(incoming);
    if (had <= will) return null;
    const count = (o.char.bag || []).length + (worn ? 1 : 0) - (incoming ? 1 : 0);      // the old one goes INTO the bag, the new one leaves it
    const cap = Math.min(BAG_MAX, bagBase() + will);
    if (count <= cap) return null;
    const need = count - cap;
    return { need, msg: 'Empty ' + need + ' more bag slot' + (need === 1 ? '' : 's') + ' first — the pack\'s extra room is holding things.' };
  }
  /** W11 (round 8): what is true of the ACCOUNT, as the client needs it — `level` = its highest character (gates ask this, not the one you play). */
  function acctOf(o) { return { claimed: !!o.claimed, level: Math.max(o.alv || 1, o.char.level || 1), admin: !!o.admin, username: o.username || null }; }
  /** T19: a report from inside the world. The server adds what it knows: where you stand, what you are, what is around you. */
  function feedbackOp(o, m) {
    const e = o.entity, ch = o.char, pv = provOf(o.room), r1 = v => Math.round(v * 10) / 10;
    const tg = e.target ? o.room.entities.get(e.target) : null;
    let monsters = 0, players = 0;
    for (const x of o.room.host.near(e.x, e.z, 60)) { if (x.kind === 'monster' && !x.dead) monsters++; else if (x.kind === 'player' && x !== e) players++; }
    const zr = [...zoneRuns.values()].filter(z => z.room === o.room).map(z => { const v = z.run.view(); return { id: v.id, phase: v.phase, wave: v.wave, objective: v.objective && v.objective.text, n: v.objective && v.objective.n, of: v.objective && v.objective.of, leftMs: v.leftMs }; });
    const server = {
      via: 'province', build: opts.build || 'dev', protocol: PROTOCOL_VERSION, process: processName, ...(opts.env ? { env: opts.env } : {}), ...(opts.serverName ? { server: opts.serverName } : {}), at: new Date(wallNow()).toISOString(),
      account: ch.account, claimed: !!o.claimed, username: o.username || null,
      room: o.room.id, roomKind: o.room.kind, roomName: o.room.name, province: pv ? pv.L.key : null, zone: o.zone || (pv && pv.L.zoneOf ? pv.L.zoneOf(e.x, e.z) : null),
      x: r1(e.x), y: r1(e.y), z: r1(e.z), yaw: r1(e.yaw), hp: Math.round(e.hp), hpMax: e.hpMax, mp: Math.round(e.mp), mpMax: e.mpMax, dead: !!e.dead, state: e.state,
      level: ch.level, cls: ch.cls, xp: ch.xp || 0, gold: ch.gold || 0, bag: (ch.bag || []).length, mount: o.mount || null, party: (partyOf.get(ch.id) || { members: [] }).members.length,
      target: tg ? { id: tg.id, kind: tg.kind, type: tg.type || null, name: tg.name, level: tg.level, hp: Math.round(tg.hp), dead: !!tg.dead } : null,
      near: { monsters, players }, tick: ticks, roomTick: o.room.tick, timeOfDay: r1(timeOfDay()), tickP99: tickStats.summary().p99,
      quests: Object.keys((ch.quests && ch.quests.active) || {}).slice(0, 25), events: zr, eventAt: o.eventAtKey || null, fishing: o.fishing ? o.fishing.state : null,
      rulesErrors: o.room.stats.rulesErrors, lastRulesError: o.room.stats.lastRulesError || null,
    };
    feedback.submit({ account: ch.account, char: ch.id, name: ch.name, cls: ch.cls, level: ch.level }, m, server)
      .then(r => { if (o.conn) o.conn.sendJSON({ t: 'feedbackR', ...r }); }, err => { log('feedback failed', err && err.message); if (o.conn) o.conn.sendJSON({ t: 'feedbackR', ok: false, why: 'failed', msg: 'That did not go through. Please try again.' }); });
  }
  /**
   * Owner feedback 7, V1 — "when a character reaches level 3 and has not submitted feedback yet, mail them … once per
   * character". Checked when a level is gained and at every entry (so a character already past level 3 gets it at its next
   * login). The saved flag `char.flags.feedbackNudge` is set whether the letter was posted or not needed (the character has
   * already sent a report), so the question is asked of the store once.
   */
  function feedbackNudge(o) {
    const ch = o.char;
    if ((ch.level || 1) < NUDGE.level || (ch.flags && ch.flags.feedbackNudge) || o.nudging || !store.hasFeedback || !store.mailSystem) return;
    o.nudging = true;
    Promise.resolve(store.hasFeedback(ch.id)).then(had => (had ? { ok: true, skipped: true } : sysmail.mailTo({ to: ch.id, subject: NUDGE.subject, body: NUDGE.body, from: NUDGE.from }))).then(r => {
      o.nudging = false;
      if (!r || !r.ok || online.get(ch.id) !== o) return;           // not posted (or gone): asked again next time
      ch.flags = { ...(ch.flags || {}), feedbackNudge: wallNow() };
      journal(o, 'set', { k: 'flags', v: ch.flags }); o.dirty = true;
      if (!r.skipped) counters.feedbackNudges = (counters.feedbackNudges || 0) + 1;
    }, err => { o.nudging = false; log('feedback nudge failed', err && err.message); });
  }
  /** T21: an admin's calls from inside the world (the flag is read from the store each time). */
  function adminOp(o, m) {
    Promise.resolve(store.isAdmin ? store.isAdmin(o.char.account) : false).then(ok => {
      o.admin = !!ok;
      if (ok && m.op === 'online') {      // X1: this process's players (the client asks the gateway, which knows every process)
        const list = [...online.values()].filter(x => x.conn).map(x => { const zn = zoneNameOf(x), town = x.room.kind === 'town' ? x.room.name : null; return { char: x.char.id, name: x.char.name, level: x.char.level || 1, cls: x.char.cls, clsName: clsNameOf(x.char.cls), province: (provOf(x.room) || first).L.key, zone: x.zone || null, zoneName: zn, town, room: x.room.id, roomKind: x.room.kind, where: town || (x.room.kind === 'instance' ? (x.room.name || 'a dungeon') + ' (dungeon)' : zn), account: x.char.account, username: x.username || null, claimed: !!x.claimed, admin: !!x.admin }; }).sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return { t: 'adminOnline', ok: true, at: wallNow(), count: list.length, accounts: new Set(list.map(x => x.account)).size, list, partial: true };
      }
      return feedback.adminOp({ admin: !!ok, by: o.username || o.char.name }, m);
    })
      .then(r => { if (o.conn) o.conn.sendJSON(r); }, err => { log('admin op failed', err && err.message); if (o.conn) o.conn.sendJSON({ t: 'adminR', op: m.op, ok: false, why: 'failed', msg: 'That did not work.' }); });
  }

  /**
   * T4 — reviving a dead PLAYER. Stream C's revive skills call `host.offerRevive(caster, target, spec)` (js/sim/room.js)
   * with `spec = { skill, name, hpPct, mpPct?, ms?, note?, apply? }`. The fallen player gets `reviveAsk` and answers
   * `revive {op:'accept'|'decline', id}`; on accept the body stands up where it lies with `hpPct` of its health,
   * `rules.revived(e, spec)` lets C add its part (a heal over time, a shield, a weakness), everyone near gets
   * `ev fx {kind:'revive', id, by, skill}`. The caster hears how it went (`reviveR {op:'done'|'declined'|'expired'}`).
   */
  let reviveN = 0;
  const reviveAskMsg = a => ({ t: 'reviveAsk', id: a.id, from: a.name, fromId: a.from, skill: a.spec.name || a.spec.skill || 'Revive', skillId: a.spec.skill || null, hpPct: a.hpPct, ms: Math.max(0, Math.round(a.until - now())), until: a.wallUntil, note: a.spec.note || undefined });
  function offerRevive(caster, target, spec, r) {
    if (!target || target.kind !== 'player' || !target.char) return { ok: false, why: 'notPlayer' };
    if (!target.dead) return { ok: false, why: 'alive' };
    const o = online.get(target.char.id);
    if (!o || o.entity !== target || !o.conn) return { ok: false, why: 'gone' };
    const t = now();
    if (o.reviveAsk && o.reviveAsk.until > t && o.reviveAsk.from !== (caster ? caster.id : 0)) return { ok: false, why: 'busy' };
    const ms = Math.max(5000, Math.min(120000, +spec.ms || REVIVE_ASK_MS));
    const hpPct = Math.max(0.01, Math.min(1, Number.isFinite(spec.hpPct) ? spec.hpPct : 0.35));
    const a = { id: ++reviveN, from: caster ? caster.id : 0, fromChar: caster && caster.char ? caster.char.id : null, name: caster ? caster.name : 'Someone', spec: { ...spec }, hpPct, until: t + ms, wallUntil: wallNow() + ms, room: r };
    o.reviveAsk = a;
    o.conn.sendJSON(reviveAskMsg(a));
    counters.reviveAsks = (counters.reviveAsks || 0) + 1;
    return { ok: true, id: a.id };
  }
  const tellCaster = (a, op, o) => { const c = a.fromChar != null ? online.get(a.fromChar) : null; if (c && c.conn) c.conn.sendJSON({ t: 'reviveR', op, id: a.id, ok: op === 'done', name: o.char.name, target: o.entity.id }); };
  function endReviveAsk(o, why) {
    const a = o.reviveAsk;
    if (!a) return;
    o.reviveAsk = null;
    tellCaster(a, why === 'expired' ? 'expired' : 'declined', o);
    if (o.conn && why === 'expired') o.conn.sendJSON({ t: 'reviveR', op: 'expired', id: a.id, ok: false, why: 'expired', msg: 'The offer has passed.' });
  }
  function reviveOp(o, m) {
    const s = o.conn, a = o.reviveAsk;
    if (!REVIVE_OPS.includes(m.op)) return bad(s, 'op');
    const R = x => s.sendJSON({ t: 'reviveR', op: m.op, id: m.id ?? (a ? a.id : null), ...x });
    if (!a || (m.id != null && m.id !== a.id) || a.until < now()) { if (a && a.until < now()) endReviveAsk(o, 'expired'); return R({ ok: false, why: 'expired', msg: 'That offer is gone.' }); }
    if (m.op === 'decline') { endReviveAsk(o, 'declined'); return R({ ok: true }); }
    const e = o.entity;
    if (!e.dead) { o.reviveAsk = null; return R({ ok: false, why: 'alive', msg: 'You are already up.' }); }
    if (o.room !== a.room) { endReviveAsk(o, 'gone'); return R({ ok: false, why: 'gone', msg: 'Too late.' }); }
    o.reviveAsk = null;
    raise(o, a);
    R({ ok: true, hpPct: a.hpPct });
    tellCaster(a, 'done', o);
  }
  /** Stand a fallen player up where they lie (an accepted revive). */
  function raise(o, a) {
    const e = o.entity, r = o.room, rules = r.rules, spec = a.spec || {};
    const by = a.from ? r.entities.get(a.from) : null;
    e.revive(a.hpPct);
    if (rules.revived) safeRules(r, 'revived', e, { ...spec, hpPct: a.hpPct, by: a.from || 0 });      // `by` = the caster's entity id (never the entity: C may put the spec in an event)
    else {
      // the rules have no `revived` yet: their own respawn (clears statuses and threat), then the health the skill gives
      if (rules.respawn) safeRules(r, 'respawn', e);
      const u = e.r && e.r.unit;
      if (u && Number.isFinite(u.maxHp)) { u.hp = Math.max(1, Math.round(u.maxHp * a.hpPct)); if (Number.isFinite(spec.mpPct) && Number.isFinite(u.maxMp)) u.mp = Math.round(u.maxMp * spec.mpPct); }
    }
    e.setHp(Math.max(1, Math.round(e.hpMax * a.hpPct)));
    if (Number.isFinite(spec.mpPct)) e.setMp(Math.round(e.mpMax * spec.mpPct));
    if (typeof spec.apply === 'function') { try { spec.apply(e, by || null); } catch (err) { log('revive apply', err && err.message); } }
    r.statusChanged(e);
    o.char.hp = e.hp;
    const c = r.clients.get(e.id); if (c) c.selfDirty = true;
    r.emit({ type: 'fx', kind: 'revive', id: e.id, by: a.from || undefined, skill: spec.skill || undefined, name: spec.name || undefined });
    counters.revives = (counters.revives || 0) + 1;
    o.dirty = true;
  }
  function reviveSweep() { const t = now(); for (const o of online.values()) if (o.reviveAsk && (o.reviveAsk.until < t || !o.entity.dead)) endReviveAsk(o, o.entity.dead ? 'expired' : 'gone'); }

  /**
   * T18 — the CHARACTER SHEET: `sheet {core, advanced, abilities, …}` = stream C's `rules.sheet(e)` (its pure estimator
   * run on the real character) plus A's part (`gold`, `bag`, `bagMax`, `angling`). Sent after the join and after every
   * equip / unequip / level / talent / perk / form change, and on `sheet {}`. Queued (SHEETS_PER_TICK a tick): it formats
   * every ability's numbers, which must never land inside a login storm's tick.
   */
  const sheetQueue = new Set();
  function wantSheet(o) { if (o && o.char) { sheetQueue.add(o.char.id); if (o.entity && o.conn && o.sheetHp !== o.entity.hpMax + ':' + o.entity.mpMax) { o.sheetHp = o.entity.hpMax + ':' + o.entity.mpMax; potionCards(o); } } }
  function sheetOf(o) {
    const e = o.entity, ch = o.char, rules = o.room.rules;
    let sh = rules.sheet ? safeRules(o.room, 'sheet', e) : null;
    if (!sh || typeof sh !== 'object') {
      // until C's estimator lands: the numbers the server holds, in D-UI's row shape (marked `basic`)
      const row = (id, label, value, unit = '', tip = '') => ({ id, label, value, unit, tip });
      const d = (e.r && e.r.unit && e.r.unit.derived) || {};
      const reach = attackReach(o);
      const core = [row('level', 'Level', ch.level || 1), row('hpMax', 'Health', e.hpMax, '', 'Your maximum health.'), row('mpMax', 'Mana', e.mpMax, '', 'Your maximum mana.'),
        ...(Number.isFinite(reach) ? [row('reach', 'Attack reach', Math.round(reach * 10) / 10, 'm', 'How far your basic attack reaches.')] : [])];
      const advanced = Object.entries(d).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)).slice(0, 60).map(([k, v]) => row(k, k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), Math.round(v * 1000) / 1000));
      sh = { basic: true, core, advanced, abilities: [] };
    }
    return { ...sh, gold: ch.gold || 0, bag: (ch.bag || []).length, bagMax: bagCap(o), bagBase: bagBase(), angling: angling.view(ch), professions: professions.view(ch) /* W9 (P-core) */ };
  }
  function drainSheets(t0) {
    let n = 0;
    for (const c of sheetQueue) {
      if (n >= SHEETS_PER_TICK || perfNow() - t0 > SHEET_BUDGET_MS) break;
      sheetQueue.delete(c);
      const o = online.get(c);
      if (!o || !o.conn || !o.entity || o.relocating) continue;
      const s0 = perfNow();
      try { o.conn.sendJSON({ t: 'sheet', ...sheetOf(o) }); } catch (err) { log('sheet failed', err && err.message); }
      const sm = perfNow() - s0;
      counters.sheets = (counters.sheets || 0) + 1; counters.sheetMs = Math.round(sm * 100) / 100; if (sm > (counters.sheetMaxMs || 0)) counters.sheetMaxMs = Math.round(sm * 100) / 100;
      n++;
    }
  }

  // ---- saving ----
  function syncChar(o) {
    const e = o.entity, ch = o.char;
    ch.x = e.x; ch.y = e.y; ch.z = e.z; ch.yaw = e.yaw; ch.hp = e.dead ? 0 : e.hp; ch.mp = Math.round(e.mp);
    ch.level = e.level; ch.room = o.room.id;
    ch.jseq = o.seq;
    if (o.room.rules.saveGear) { const g = safeRules(o.room, 'saveGear', e); if (g !== undefined) ch.equipment = g; }
    if (o.room.rules.saveBuild) { const b = safeRules(o.room, 'saveBuild', e); if (b !== undefined) ch.build = b; }
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
    if (ticks % 20 === 9) corpses.tick();
    if (ticks % 100 === 37) for (const o of online.values()) if (o.conn && o.entity && !o.frozen && !o.saving && !o.mailBusy) lightSweep(o, true);      // W22: a light that arrived by post or trade after the entry sweep
    if (meterOn.size && ticks % 5 === 3) meterTick();      // W21: the meter's hit feed, 4 Hz, only for those who asked
    if (ticks % 20 === 11) questMarksTick();      // W12: quest marks over NPCs, per player
    if (ticks % 20 === 13) roadEvents.tick();     // S5: random road events near lone players
    if (ticks % 4 === 3) roadEvents.move(TICK_MS * 4);
    if (ticks % 20 === 11) { foodTick(); mountSpeedTick(); reviveSweep(); }
    angling.tick();
    professions.tick(); if (ticks % 20 === 15) professions.sweep();      // W9 (P-core)
    for (const o of online.values()) if (o.mountCast) mountCastTick(o);
    if (ticks % 4 === 1) npcTick(TICK_MS * 4);
    roadsTick();
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
    if (sheetQueue.size) drainSheets(t0);          // last: whatever time the tick has left
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
    // T5: stream C's starter kits, per class, once (kitsFor may be async); `create.kit` ids are looked up in here
    if (typeof opts.kitsFor === 'function') for (const cls of (opts.classes || [])) { try { const k = await opts.kitsFor(cls); if (k && typeof k === 'object') kitCache.set(cls, k); } catch (err) { log('kitsFor failed for ' + cls, err && err.message); } }
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
      travellers: [...rooms.values()].filter(r => r.travellers).map(r => ({ room: r.id, ...r.travellers.stats() })),
      transferMs: { last: counters.transferMs || 0, max: counters.transferMaxMs || 0 },
      // play-test 5: sheets worked out (T18), events ended, feedback, angling
      sheets: { n: counters.sheets || 0, lastMs: counters.sheetMs || 0, maxMs: counters.sheetMaxMs || 0, queue: sheetQueue.size },
      events5: { ended: counters.eventsEnded || 0, won: counters.events_won || 0, lost: counters.events_lost || 0, mailed: counters.eventMailed || 0 },
      feedback: { n: counters.feedback || 0, gifts: counters.feedbackGifts || 0 }, angling: { casts: counters.casts || 0, catches: counters.catches || 0, lost: counters.fishLost || 0, pools: counters.poolsOpened || 0, fishedOut: counters.poolsFished || 0, cooked: counters.cooked || 0 },
      revives: { asked: counters.reviveAsks || 0, done: counters.revives || 0 }, crates: counters.cratesOpened || 0, gifts: counters.giftsOpened || 0, kits: counters.kits || 0,
      db: store.kind,
    };
  }

  return {
    accept, step, init, shutdown, status, rooms, P, online, partyOf, econ, tickStats, owner, counters, trades,
    room: copies[0], townRoom, copies, instances, town, door, gate,
    saveNow, logout, transfer, moveTo, grant, corpses, roadEvents, mute, flushEconomy, newUid, flushJournal, timeOfDay, devSetLevel,
    carts, shops, meterOn, bagCap, isNewcomer, NEWCOMER, realmEvents, liveEventNow: () => liveEvent, mailTo: a => sysmail.mailTo(a), offerRevive, angling, professions, feedback, zoneRuns, kitCache, sheetOf, restack,
    chatterContext: (r, x, z) => chatterContext(provOf(r), r, x, z),
    get liveEvent() { return liveEvent; },
  };
}

function roleName(role) {
  return { smith: 'Smith', merchant: 'Merchant', elder: 'Elder', innkeeper: 'Innkeeper', healer: 'Healer', unbinder: 'Unbinder', broker: 'Broker' }[role] || role;
}
