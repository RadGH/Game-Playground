// The referee of one Roverlands room — PURE (no sockets, no timers, no physics). The server runs one per online room
// (server/hub.js); the page runs one through js/net/loopback.js for solo play, so the game code never knows which.
// docs/PLAN.md "Net contract" + "Referee rules" + "Net contract additions" are the spec; tests/room-core.test.js
// checks every rule.
//
//   const core = createRoomCore({ code, mode, seed, flagId, public, now, rand, sites, vehicles, bests, report, send });
//   core.join({ token, name, look, spectate }) -> { pid } | { err, msg }      (same token again = the same player back)
//   core.message(pid, msg)        a validated client message (js/net/protocol.js)
//   core.disconnect(pid)          the line dropped: the seat is kept (90 s driving, 5 min in the lobby)
//   core.leave(pid)               gone for good
//   core.tick()                   STATE_HZ times a second: sends `state`, ends overdue grace periods
//   core.listing()                the "Find a game" card (null when not public)
//
// Who owns what: every moving body has ONE owner client that simulates it. The driver (seat 0) owns their vehicle;
// a vehicle nobody drives stays with its last driver (or the host). The room never moves anything itself: it keeps
// each body's last reported pose so a newcomer can draw it, and it forwards everything else.
//
// Expansion 1 M2 (docs/EXPANSION-1.md "Contracts (added)"): every player has a saved PROFILE (gold, what they own,
// job levels…) handed in by `profiles` (server/profiles.mjs online, localStorage in js/net/loopback.js solo) and keyed by
// join({ profileKey }); the room is the only thing that changes it — buy() priced from `shop` (data/shop.json), and
// grant() / payJob() for the job referees — and sends `{ t:'profile' }` to its owner on every change. Every player and
// body has a PLACE (js/net/places.js): `state`, `ents`, breaks, cuts, the flag, shots and horns only go to players in a
// place that sees it, and `go` moves a player between places. `summon` puts one owned vehicle near you.
//   core.grant(pid, gold, why)                     -> gold actually paid (0 = nothing)
//   core.payJob({ place, at, vehicle, gold, why }) -> pids paid (everyone in the job vehicle or within 30 m of the step)
//   core.launch(pid)                               the rocket flew: the Moon and the station open for this player (M11)
//
// Expansion 1 M4: `jobs` (data/jobs.json, js/game/jobs/registry.js) and `achievements` (data/achievements.json,
// js/game/achievements.js). `upgrade` buys a job upgrade; `stats` adds driven metres (rate-limited and capped by the time
// since the last report) and notes the cities you are in; after every grant, buy, summon, place change, stats report and
// job level the room checks achievements and sends `{ t:'ach', ids }`. In County rooms a look is worn only with clothes
// the player owns: `me` / join strip the rest (js/game/profile.js stripLook) and tell the owner `{ t:'look', look, stripped }`.
//   core.jobDone(pid, jobId, level, { at, vehicle, place, gold }) -> { ok, paid: [pids] } | { ok: false, why }
//       a job referee says level `level` of `jobId` was done by `pid`: every payee (in the job vehicle / within 30 m) gets
//       the level's pay; the level is recorded for each one who had it unlocked (their own progress, co-op rule 3)
//
// Expansion 1 M6: `{ t:'job', id, step, … }` goes to the job referee (js/net/jobs-core.js — farming first), which checks
// each step against where the vehicles are, pays through grant / payees, records levels through jobDone, and keeps a
// job's shared world state (the fields) in the room; its fixtures (the farm's own tractors and trailers) are parked
// with the pad vehicles. `core.jobs` is that referee (tests).
//
// Expansion 1 M11 (js/game/space.js): the rocket can only be summoned onto the Skyreach launch pad (`sites.launch`); a
// `{ t:'space', step:'launch', id }` from someone in it once it is SPACE.orbitAlt over the pad puts everyone aboard IN
// ORBIT (`{ t:'orbit' }`, the rocket is gone — call it again), and only then do `go` 'station' / 'moon' work; `go`
// 'county' from orbit, the station or the Moon is the trip home: the room puts a landing pod at `at` (high over the
// county) with you in its seat. `space` steps 'touchdown' (the pod is down), 'bail' (out of it in the air) and 'lap' (a
// lap of the station) earn their achievements; the Moon's rovers (space.js moonParking) are parked with place 'moon'.
//
// `send(pid, msg)` delivers one message object to one player. `report(kind, data)` is the insights log (never a name,
// token or address). `bests` is a plain object { 'seed:site': ms } shared across rooms (the server saves it).
import { SUMMON_RANGE, homePlace, mapFor, sharesView, goRefusal, payees } from './places.js';
import { newProfile, cleanProfile, shopTable, owns, applyBuy, applyGrant, stripLook } from '../game/profile.js';
import { jobTable, levelRefusal, levelDone, levelPay, applyUpgrade } from '../game/jobs/registry.js';
import { achTable, check as achCheck, record as achRecord } from '../game/achievements.js';
import { createJobsCore } from './jobs-core.js';
import { SPACE, moonParking } from '../game/space.js';
import { MODES, MIN_RUN_MS, MAX_PLAYERS, MAX_WATCHERS, MAX_ENTS, MAX_SPAWNED_EACH, SEAT_RANGE, FLAG_RANGE, GONE_RUN_MS, GONE_LOBBY_MS, cleanName, cleanLook, cleanText, cleanReasons } from './protocol.js';

/** vehicles.json in any of its shapes -> { kind: { name, seats } }. */
export function vehicleTable(v) {
  const list = Array.isArray(v) ? v : Array.isArray(v?.vehicles) ? v.vehicles : v && typeof v === 'object' ? Object.entries(v).map(([id, x]) => ({ id, ...x })) : [];
  const out = {};
  for (const x of list) if (x && typeof x.id === 'string') out[x.id] = { name: x.name || x.id, seats: Math.max(0, Math.min(16, Array.isArray(x.seats) ? x.seats.length : Number.isInteger(x.seats) ? x.seats : 1)) };
  return out;
}
function makeRng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
/** Distance between two [x,y,z] points; when either height is unknown (a pad), across the ground only. */
export function dist(a, b) {
  const dx = a[0] - b[0], dz = a[2] - b[2];
  if (a[1] == null || b[1] == null) return Math.hypot(dx, dz);
  return Math.hypot(dx, a[1] - b[1], dz);
}
const flat = (a, x, z) => Math.hypot(a[0] - x, a[2] - z);

/**
 * The profile store a room uses when it is handed none (tests): profiles live as long as the room.
 * Any store: get(key, look) -> the ONE live profile object for that key (made if new; the room changes it in place, so
 * two rooms holding the same player share it), changed(key) -> save it soon.
 */
export function memoryProfiles() {
  const all = new Map();
  return { get(key, look) { if (!all.has(key)) all.set(key, newProfile(look)); return all.get(key); }, changed() {}, all };
}

export function createRoomCore({ code = 'SOLO', mode = 'flag', seed = 1, flagId = null, public: pub = false, now = () => Date.now(), rand = null,
  sites = {}, vehicles = {}, bests = {}, report = () => {}, send = () => {}, profiles = null, shop = {}, openPlaces = false, jobs = {}, achievements = {} } = {}) {
  const rng = rand || makeRng((seed * 2654435761) ^ code.charCodeAt(0));
  const kinds = vehicleTable(vehicles);
  const home = sites.home && Number.isFinite(sites.home.x) ? { x: sites.home.x, z: sites.home.z, r: sites.home.r || 20 } : { x: 0, z: 0, r: 20 };
  const flagSites = (sites.flags || []).filter(f => f && f.id != null).map(f => ({ id: String(f.id), x: f.x, z: f.z, name: f.name || String(f.id) }));
  const pads = (sites.pads || []).filter(p => p && typeof p.vehicle === 'string');
  const opts = { mode: MODES.includes(mode) ? mode : 'flag', public: !!pub, flagPick: flagId && flagId !== 'random' ? String(flagId) : 'random' };
  const store = profiles || memoryProfiles();
  const prices = shopTable(typeof shop === 'function' ? shop() : shop);
  const jobT = jobTable(typeof jobs === 'function' ? jobs() : jobs), achT = achTable(typeof achievements === 'function' ? achievements() : achievements);
  const cities = (sites.cities || []).filter(c => c && typeof c.id === 'string' && Number.isFinite(c.x) && Number.isFinite(c.z));
  const STATS_MAX_SPEED = 120;        // m/s: driven metres a report may add per second since the last one (a rocket car tops ~70)
  const base = () => homePlace(opts.mode);      // where this room's parked vehicles, the flag and newcomers are

  const players = new Map();          // pid -> { pid, token, name, look, spec, connected, goneAt, me, meAt, fresh, seat: [id, i] | null, joinedAt, place, profileKey, profile, launched }
  const ents = new Map();             // id -> { id, kind, owner, seats, idle, pose, fresh, pad, spawnedBy, summonedBy, place, inHome, driveFrom }
  // what has been broken / cut is kept per WORLD (a place's map: the sky shares the county's)
  const brokenIn = new Map(), cutIn = new Map();
  const worldKey = place => (sharesView(place, 'county') ? 'county' : place);
  const setIn = (M, place) => { const k = worldKey(place); if (!M.has(k)) M.set(k, new Set()); return M.get(k); };
  const pins = new Map();             // pid -> { p: [x, z], place }
  const banned = new Set();           // tokens removed from this room
  const kickVotes = new Map();        // target pid -> Set(voter pid)
  let nextPid = 1, nextEnt = 1, host = null, phase = 'lobby', emptySince = now(), runs = 0;
  let flag = null, run = { phase: 'pick', startedAt: null, time: null };
  const times = new Map();            // 'seed:site' -> [ms...] this room's finished runs

  // ------------------------------------------------------------------------------------------------ sending
  const cast = (msg, except = null) => { for (const p of players.values()) if (p.connected && p.pid !== except) send(p.pid, msg); };
  /** To everyone who can see `place` (a spectator watches the room's own place). */
  const castIn = (place, msg, except = null) => { for (const p of players.values()) if (p.connected && p.pid !== except && sharesView(p.place, place)) send(p.pid, msg); };
  const to = (pid, msg) => { const p = players.get(pid); if (p?.connected) send(pid, msg); };
  const deny = (pid, what, why, extra = {}) => to(pid, { t: 'deny', what, why, ...extra });
  const pubPlayer = p => ({ pid: p.pid, name: p.name, look: p.look, spec: p.spec || undefined, on: p.connected, kick: kickVotes.get(p.pid)?.size || undefined, place: p.place });
  function roomMsg(pid) {
    return { t: 'room', code, mode: opts.mode, seed, host, public: opts.public, flagId: flag?.site ?? resolvedFlag(), flagPick: opts.flagPick, phase, you: pid,
      players: [...players.values()].map(pubPlayer), sites: { flags: flagSites.map(f => ({ id: f.id, name: f.name })) } };
  }
  const syncRoom = () => { for (const p of players.values()) if (p.connected) send(p.pid, roomMsg(p.pid)); };
  // a body with no pad (spawned / summoned) carries where it is, so a client that has never seen it can put it there
  const entRow = e => ({ id: e.id, kind: e.kind, owner: e.owner, seats: e.seats.slice(), idle: e.idle, place: e.place, ...(e.pad != null ? { pad: e.pad } : {}), ...(e.acts ? { acts: { ...e.acts } } : {}),
    ...(e.pad == null && e.pose ? { pose: { p: e.pose.p.slice(), q: e.pose.q.slice() } } : {}), ...(e.summonedBy != null ? { sum: e.summonedBy } : {}) });
  /** The bodies one player can see (the ones in their place). */
  const entsMsg = pid => { const at = players.get(pid)?.place ?? base(); return { t: 'ents', list: [...ents.values()].filter(e => sharesView(at, e.place)).map(entRow) }; };
  // only when what THAT player sees changed (someone on the Moon is not told about seats in the county)
  const syncEnts = () => { for (const p of players.values()) if (p.connected) { const m = entsMsg(p.pid), k = JSON.stringify(m.list); if (k !== p.entsSent) { p.entsSent = k; send(p.pid, m); } } };
  const profileMsg = (p, extra = {}) => ({ t: 'profile', profile: p.profile, ...extra });
  const flagMsg = () => flag ? { t: 'flag', state: flag.state, site: flag.site, ...(flag.by != null ? { by: flag.by } : {}), ...(flag.p ? { p: flag.p.slice() } : {}), ...(flag.time != null ? { time: flag.time } : {}) } : null;
  const keyOf = () => `${seed}:${flag?.site ?? '-'}`;
  const runMsg = () => ({ t: 'run', phase: run.phase, startedAt: run.startedAt, best: bests[keyOf()] ?? null, times: (times.get(keyOf()) || []).slice(), ...(run.time != null ? { time: run.time } : {}) });

  // ------------------------------------------------------------------------------------------------ the world
  function resolvedFlag() {
    if (!flagSites.length) return null;
    if (opts.flagPick !== 'random' && flagSites.some(f => f.id === opts.flagPick)) return opts.flagPick;
    return flagSites[Math.floor(rng() * flagSites.length)].id;
  }
  function placeFlag() {
    if (opts.mode !== 'flag') { flag = null; return; }
    const id = resolvedFlag(); const s = flagSites.find(f => f.id === id);
    flag = s ? { state: 'site', site: s.id, p: [s.x, null, s.z], by: null, time: null } : null;
  }
  function makeParked() {
    for (const [id, e] of ents) if (e.spawnedBy != null) ents.delete(id);
    pads.forEach((pad, i) => {
      const id = i + 1;
      const e = { id, kind: pad.vehicle, owner: host, seats: Array(kinds[pad.vehicle]?.seats ?? 1).fill(null), idle: true, pose: null, fresh: false, pad: i, spawnedBy: null, summonedBy: null, place: base(), inHome: flat([pad.x, 0, pad.z], home.x, home.z) <= home.r, driveFrom: null };
      ents.set(id, e);
    });
    // the jobs' own machines (M6: the farm yard's tractors, drill, bowser, trailer), parked like pad vehicles: same ids
    // every reset, a pose instead of a pad
    if (base() === 'county') (jobsCore?.fixtures() || []).forEach((f, k) => {
      if (!kinds[f.kind]) return;
      const id = pads.length + 1 + k, q = [0, Math.sin((f.yaw || 0) / 2), 0, Math.cos((f.yaw || 0) / 2)];
      ents.set(id, { id, kind: f.kind, owner: host, seats: Array(kinds[f.kind].seats).fill(null), idle: true, pose: { id, p: [f.x, f.y ?? 1, f.z], q, v: [0, 0, 0], w: [0, 0, 0] }, fresh: false, pad: null,
        spawnedBy: null, summonedBy: null, place: base(), inHome: false, driveFrom: null, fixture: true });
      nextEnt = Math.max(nextEnt, id + 1);
    });
    nextEnt = Math.max(nextEnt, pads.length + 1);
    // M11: the Moon's rovers (place 'moon': only someone on the Moon sees them), fixed ids after everything above; the
    // height is not known here (null): the first machine there sits them on its ground
    const moonFrom = pads.length + 501;          // well past the pads and any job fixtures (they follow the pads)
    if (base() === 'county') moonParking().forEach((m, k) => {
      if (!kinds[m.vehicle]) return;
      const id = moonFrom + k, q = [0, Math.sin(m.yaw / 2), 0, Math.cos(m.yaw / 2)];
      ents.set(id, { id, kind: m.vehicle, owner: host, seats: Array(kinds[m.vehicle].seats).fill(null), idle: true, pose: { id, p: [m.x, null, m.z], q, v: [0, 0, 0], w: [0, 0, 0] }, fresh: false, pad: null,
        spawnedBy: null, summonedBy: null, place: 'moon', inHome: false, driveFrom: null, fixture: true });
      nextEnt = Math.max(nextEnt, id + 1);
    });
  }
  const entPos = e => e.pose?.p || (e.pad != null ? [pads[e.pad].x, null, pads[e.pad].z] : null);
  /** Where a player is in the world: their vehicle's pose when seated (it is the newer number), else their own. */
  function posOf(p) {
    if (p.seat) { const e = ents.get(p.seat[0]); const ep = e && entPos(e); if (ep && ep[1] != null) return ep; }
    return p.me?.p || null;
  }

  // ------------------------------------------------------------------------------------------------ players
  function join({ token, name, look, spectate = false, profileKey = null } = {}) {
    if (token && banned.has(token)) return { err: 'kicked', msg: 'You were removed from this room.' };
    for (const p of players.values()) if (token && p.token === token) {           // the same browser, back after a drop
      p.connected = true; p.goneAt = null; emptySince = null;
      if (name != null) p.name = uniqueName(cleanName(name) || p.name, p);
      if (look) p.look = wearable(p, cleanLook(look)) || p.look;
      pickHost(); resync(p.pid); syncRoom();
      return { pid: p.pid, back: true };
    }
    const spec = !!spectate, count = [...players.values()].filter(p => !!p.spec === spec).length;
    if (count >= (spec ? MAX_WATCHERS : MAX_PLAYERS)) return { err: 'full', msg: spec ? 'Too many people are watching this room.' : `This room is full (${MAX_PLAYERS} drivers).` };
    const p = { pid: nextPid++, token: token || null, name: 'Driver', look: cleanLook(look), spec, connected: true, goneAt: null, me: null, meAt: 0, fresh: false, seat: null, joinedAt: now(),
      place: base(), profileKey: null, profile: null, launched: false, orbit: false, pod: null };
    // the saved profile: by account / device online (the hub hands the key in), else this room's own token
    p.profileKey = profileKey || (token ? 'tok:' + token : 'pid:' + p.pid);
    if (!spec) {           // a watcher has no use for one (and does not make one in the store)
      p.profile = store.get(p.profileKey, p.look);
      if (opts.mode === 'county' && p.look) { const r = stripLook(p.look, p.profile); p.look = r.look; p.strippedAtJoin = r.stripped; }
      // the profile keeps the look worn (in County: the stripped one)
      if (p.look && (!p.profile.look || (opts.mode === 'county' && JSON.stringify(p.profile.look) !== JSON.stringify(p.look)))) { p.profile.look = p.look; store.changed(p.profileKey); }
    }
    p.name = uniqueName(cleanName(name) || (spec ? 'Watcher' : 'Driver'), p);
    players.set(p.pid, p); emptySince = null;
    const hadHost = host != null;
    pickHost();
    if (!hadHost && host != null) for (const e of ents.values()) if (e.owner == null) e.owner = host;
    resync(p.pid); syncRoom();
    if (p.strippedAtJoin?.length) { to(p.pid, { t: 'look', look: p.look, stripped: p.strippedAtJoin }); delete p.strippedAtJoin; }
    return { pid: p.pid };
  }
  function uniqueName(n, self) {
    const taken = x => [...players.values()].some(o => o !== self && String(o.name).toLowerCase() === x.toLowerCase());
    if (!taken(n)) return n;
    for (let i = 2; i < 30; i++) { const x = n.slice(0, 11) + ' ' + i; if (!taken(x)) return x; }
    return n;
  }
  /** Everything a newcomer (or a returning phone) needs to draw the present moment. */
  function resync(pid) {
    to(pid, roomMsg(pid));
    const me = players.get(pid);
    if (me && !me.spec) to(pid, profileMsg(me));
    resyncPlace(pid);
  }
  /** The picture of the place a player is in: its bodies, everyone there, what is broken / cut, the flag, pins. */
  function resyncPlace(pid) {
    const me = players.get(pid), at = me?.place ?? base();
    const em = entsMsg(pid); if (me) me.entsSent = JSON.stringify(em.list);
    to(pid, em);
    const ps = {}, es = {};
    for (const o of players.values()) if (o.pid !== pid && o.me && sharesView(at, o.place)) ps[o.pid] = o.me;
    for (const e of ents.values()) if (e.pose && e.pose.p[1] != null && sharesView(at, e.place)) es[e.id] = e.pose;
    to(pid, { t: 'state', s: now(), players: ps, ents: es, full: 1 });
    to(pid, { t: 'broken', objs: [...setIn(brokenIn, at)] });
    const cut = setIn(cutIn, at);
    if (cut.size) { const all = [...cut]; for (let i = 0; i < all.length; i += 4000) to(pid, { t: 'cut', cells: all.slice(i, i + 4000), full: 1 }); }
    if (flag && sharesView(at, base())) to(pid, flagMsg());
    if (phase === 'play' && opts.mode === 'flag') to(pid, runMsg());
    for (const [who, pin] of pins) if (sharesView(at, pin.place)) to(pid, { t: 'pin', pid: who, p: pin.p });
    if (phase === 'play') jobsCore?.resync(pid);
  }
  function pickHost() {
    const h = players.get(host);
    if (h && h.connected && !h.spec) return;
    const list = [...players.values()];
    const next = list.find(p => p.connected && !p.spec) || list.find(p => !p.spec) || list.find(p => p.connected) || null;
    host = next ? next.pid : (h ? h.pid : null);
  }
  function disconnect(pid) {
    const p = players.get(pid); if (!p || !p.connected) return;
    p.connected = false; p.goneAt = now();
    // bodies nobody is driving go to someone who is still here (the one being driven waits for its driver)
    pickHost();
    for (const e of ents.values()) if (e.owner === pid && e.seats[0] !== pid) { e.owner = heir(pid, e.place); }
    syncRoom(); syncEnts();
    if (![...players.values()].some(x => x.connected)) emptySince = now();
  }
  /** Who takes a leaving owner's bodies: the host, else the next player still here, else nobody. */
  function heir(pid, place = null) {
    const here = x => place == null || sharesView(x.place, place);
    const h = players.get(host);
    if (h && h.pid !== pid && h.connected && !h.spec && here(h)) return h.pid;
    const o = [...players.values()].find(x => x.pid !== pid && x.connected && !x.spec && here(x));
    return o ? o.pid : null;
  }
  function leave(pid, why = 'left') {
    const p = players.get(pid); if (!p) return;
    if (flag && flag.state === 'carried' && flag.by === pid) dropFlag(posOf(p) || flag.p);
    clearSeat(p);
    players.delete(pid);
    kickVotes.delete(pid); for (const s of kickVotes.values()) s.delete(pid);
    if (pins.delete(pid)) cast({ t: 'pin', pid, p: null });
    pickHost();
    for (const e of ents.values()) if (e.owner === pid) { e.owner = heir(pid, e.place); e.idle = true; }
    // a spawned / summoned vehicle stays (someone may be using it); it just loses its spawner's count
    for (const e of ents.values()) { if (e.spawnedBy === pid) e.spawnedBy = 0; if (e.summonedBy === pid) e.summonedBy = null; }
    syncRoom(); syncEnts();
    if (![...players.values()].some(x => x.connected)) emptySince = emptySince ?? now();
    if (why === 'kicked') report('kick', {});
  }

  // ------------------------------------------------------------------------------------------------ seats + bodies
  function clearSeat(p, { thrown = false } = {}) {
    if (!p.seat) return;
    const e = ents.get(p.seat[0]), i = p.seat[1];
    p.seat = null;
    if (!e || e.seats[i] !== p.pid) return;
    e.seats[i] = null;
    if (i === 0) {
      e.idle = true;                          // the last driver keeps it until someone else asks
      if (e.driveFrom != null) { const secs = Math.round((now() - e.driveFrom) / 1000); if (secs >= 5) report('played', { vehicle: e.kind, game: e.kind, seconds: secs, mode: opts.mode, thrown: thrown || undefined }); e.driveFrom = null; }
    }
  }
  function takeSeat(p, id, i) {
    if (p.spec) return deny(p.pid, 'seat', 'Watchers cannot drive. Join the room to play.', { id });
    if (phase !== 'play') return deny(p.pid, 'seat', 'Wait for the host to start.', { id });
    const e = ents.get(id); if (!e) return deny(p.pid, 'seat', 'That vehicle is gone.', { id });
    if (!sharesView(p.place, e.place)) return deny(p.pid, 'seat', 'That vehicle is somewhere else.', { id });
    if (!Number.isInteger(i) || i < 0 || i >= e.seats.length) return deny(p.pid, 'seat', 'No such seat.', { id });
    if (e.seats[i] != null && e.seats[i] !== p.pid) return deny(p.pid, 'seat', 'Someone is sitting there.', { id });
    if (e.noSeat) return deny(p.pid, 'seat', 'That one is broken down — hook it to a tow truck.', { id });     // M7: a wreck
    const me = p.me?.p, at = entPos(e);
    const sameVehicle = p.seat && p.seat[0] === id;
    if (!sameVehicle && (!me || !at || dist(me, at) > SEAT_RANGE)) return deny(p.pid, 'seat', 'Get closer to it first.', { id });
    if (e.seats[i] === p.pid) return;
    clearSeat(p);
    e.seats[i] = p.pid; p.seat = [id, i];
    if (i === 0) { e.owner = p.pid; e.idle = false; e.driveFrom = now(); }
    if (flag && flag.state === 'carried' && flag.by === p.pid) to(p.pid, flagMsg());
    syncEnts();
  }
  function spawn(p, msg) {
    if (p.spec || phase !== 'play') return deny(p.pid, 'spawn', 'Not now.');
    if (opts.mode !== 'sandbox') return deny(p.pid, 'spawn', 'You can only put vehicles down in Sandbox.');
    if (!kinds[msg.kind]) return deny(p.pid, 'spawn', 'Unknown vehicle.');
    if (ents.size >= MAX_ENTS) return deny(p.pid, 'spawn', 'There are too many vehicles out already.');
    const mine = [...ents.values()].filter(e => e.spawnedBy === p.pid);
    if (mine.length >= MAX_SPAWNED_EACH) {
      // the oldest one you put down that nobody is sitting in goes away to make room
      const old = mine.find(e => e.seats.every(s => s == null));
      if (!old) return deny(p.pid, 'spawn', `You already have ${MAX_SPAWNED_EACH} vehicles out.`);
      ents.delete(old.id);
    }
    if (p.me && dist(p.me.p, msg.p) > 40) return deny(p.pid, 'spawn', 'Put it down nearer to you.');
    putDown(p, msg.kind, msg.p, msg.yaw, { spawnedBy: p.pid });
    syncEnts();
    report('spawn', { vehicle: msg.kind });
  }
  /** A new body owned by `p`, in p's place, standing still at `at` facing `yaw` (sandbox spawn and summon share it). */
  function putDown(p, kind, at, yaw = 0, extra = {}) {
    const id = nextEnt++;
    const q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    const e = { id, kind, owner: p.pid, seats: Array(kinds[kind].seats).fill(null), idle: true, pose: { id, p: at.slice(), q, v: [0, 0, 0], w: [0, 0, 0] }, fresh: true, pad: null,
      spawnedBy: null, summonedBy: null, place: p.place, inHome: flat(at, home.x, home.z) <= home.r, driveFrom: null, ...extra };
    ents.set(id, e);
    return e;
  }
  /** Call an owned vehicle: one per player at a time; the last one goes away if nobody is in it (else it just stays). */
  function summon(p, msg) {
    if (p.spec || phase !== 'play') return deny(p.pid, 'summon', 'Not now.');
    if (opts.mode === 'flag') return deny(p.pid, 'summon', 'Vehicles cannot be called in Flag Run.');
    if (!kinds[msg.vehicle]) return deny(p.pid, 'summon', 'Unknown vehicle.');
    if (!owns(p.profile, 'vehicles', msg.vehicle)) return deny(p.pid, 'summon', 'You do not own that one yet.');
    const here = posOf(p);
    if (!here) return deny(p.pid, 'summon', 'Wait a moment and try again.');
    const why = spaceSummonRefusal(p, msg, here);
    if (why) return deny(p.pid, 'summon', why);
    if (msg.vehicle !== 'rocket' && dist(here, msg.p) > SUMMON_RANGE) return deny(p.pid, 'summon', 'Call it to a spot nearer to you.');
    for (const e of [...ents.values()]) if (e.summonedBy === p.pid) {
      if (e.seats.every(s => s == null)) ents.delete(e.id); else e.summonedBy = null;
    }
    if (ents.size >= MAX_ENTS) return syncEnts(), deny(p.pid, 'summon', 'There are too many vehicles out already.');
    const e = putDown(p, msg.vehicle, msg.p, msg.yaw ?? 0, { spawnedBy: 0, summonedBy: p.pid });
    syncEnts();
    to(p.pid, { t: 'summoned', id: e.id, vehicle: e.kind });
    award(p, { when: 'summoned' }, true);
    report('summon', { vehicle: e.kind });
  }

  // ------------------------------------------------------------------------------------------------ the profile
  /** Buy one thing from the shop: the room prices it, takes the gold, and it is owned for good. */
  function buy(p, itemId) {
    if (p.spec) return deny(p.pid, 'buy', 'Watchers cannot buy things.');
    const r = applyBuy(p.profile, prices, itemId);
    if (!r.ok) return deny(p.pid, 'buy', r.why, { item: itemId });
    store.changed(p.profileKey);
    const when = r.row.kind === 'vehicles' ? ['bought_vehicle', ...(itemId === 'rocket' ? ['bought_rocket'] : [])] : r.row.kind === 'clothes' ? 'bought_clothes' : 'bought_' + r.row.kind;
    const ach = award(p, { when });
    to(p.pid, profileMsg(p, { why: 'buy', item: itemId, gold: -r.price, ...(ach.length ? { ach } : {}) }));
    report('buy', { item: itemId, price: r.price });
  }
  /** Buy a job upgrade (data/jobs.json): gold taken, kept forever, it changes how that job plays. */
  function upgrade(p, upId) {
    if (p.spec || !p.profile) return deny(p.pid, 'upgrade', 'Watchers cannot buy things.');
    const r = applyUpgrade(p.profile, jobT, upId);
    if (!r.ok) return deny(p.pid, 'upgrade', r.why, { item: upId });
    store.changed(p.profileKey);
    to(p.pid, profileMsg(p, { why: 'upgrade', item: upId, job: r.job.id, gold: -r.price }));
    jobsCore?.profileChanged(p.pid);
    report('buy', { item: 'upgrade:' + upId, price: r.price });
  }
  /**
   * Achievements earned by an event (or by the profile as it now stands): recorded, and the job they reveal marked as
   * found. -> the ids added. `tell`: send the profile + the ids now (callers that send a profile message anyway pass the
   * ids in it instead).
   */
  function award(p, event, tell = false) {
    if (!p?.profile || !achT.length) return [];
    const added = achRecord(p.profile, achCheck(p.profile, event, achT, { jobs: jobT }), now());
    if (!added.length) return added;
    for (const job of jobT.values()) if (job.hidden && job.reveal && added.includes(job.reveal) && !p.profile.seen.jobs.includes(job.id)) p.profile.seen.jobs.push(job.id);
    store.changed(p.profileKey);
    to(p.pid, { t: 'ach', ids: added });
    if (tell) to(p.pid, profileMsg(p, { ach: added }));
    for (const id of added) report('ach', { id });
    return added;
  }
  /** Pay one player (a job referee calls this). -> the gold actually paid. */
  function grant(pid, amount, why = '', { events = [], extra = {} } = {}) {
    const p = players.get(pid);
    if (!p || p.spec || !p.profile) return 0;
    const r = applyGrant(p.profile, amount);
    if (!r.ok) return 0;
    store.changed(p.profileKey);
    const ach = award(p, { when: ['job_paid', ...events] });
    to(pid, profileMsg(p, { why: String(why || '').slice(0, 60), gold: r.amount, ...extra, ...(ach.length ? { ach } : {}) }));
    return r.amount;
  }
  const payeesOf = ({ place, at, vehicle }) => payees({ players: [...players.values()].map(p => ({ pid: p.pid, place: p.place, spec: p.spec, seat: p.seat, pos: posOf(p) })), at, vehicle, place });
  /** Pay a job step to everyone in the job vehicle or within 30 m of it — each gets the whole amount. -> pids paid. */
  function payJob({ place = base(), at = null, vehicle = null, gold, why = '' }) {
    const list = payeesOf({ place, at, vehicle });
    return list.filter(pid => grant(pid, gold, why, { events: list.length > 1 ? ['coop_pay'] : [] }) > 0);
  }
  /**
   * A job referee: level `level` of `jobId` was done by `pid`. Everyone paid with them (in the job vehicle / within 30 m)
   * gets the level's pay (or `gold`); each one who has that level unlocked gets it recorded too. -> { ok, paid } | { ok: false, why }.
   */
  function jobDone(pid, jobId, level, { at = null, vehicle = null, place = null, gold = null } = {}) {
    const p = players.get(pid), job = jobT.get(jobId);
    if (!p || p.spec || !p.profile) return { ok: false, why: 'Nobody to pay.' };
    const why = levelRefusal(p.profile, jobT, jobId, level);
    if (why) return { ok: false, why };
    const pay = Number.isFinite(gold) ? gold : levelPay(job, level), title = job.levels.find(l => l.n === level)?.title || '';
    const list = payeesOf({ place: place || p.place, at: at || posOf(p), vehicle });
    if (!list.includes(pid)) list.unshift(pid);
    const paid = [];
    for (const q of list) {
      const P = players.get(q); if (!P?.profile) continue;
      const r = levelDone(P.profile, jobT, jobId, level);
      if (r.ok) store.changed(P.profileKey);
      const amount = grant(q, pay, `${job.name}${title ? ' · ' + title : ''}`, { events: ['job_done', ...(list.length > 1 ? ['coop_pay'] : [])], extra: { job: jobId, level, ...(r.ok && r.first ? { first: true } : {}) } });
      if (amount > 0 || r.ok) paid.push(q);
    }
    report('job', { job: jobId, level, players: paid.length });
    return { ok: true, paid };
  }
  /** Driven metres from a client (rate-limited by protocol.js, capped by the time since the last report) + city visits. */
  function stats(p, msg) {
    if (p.spec || !p.profile || phase !== 'play') return;
    const t = now(), since = p.statsAt ? Math.min(60, (t - p.statsAt) / 1000) : 10;
    p.statsAt = t;
    const m = Math.max(0, Math.min(msg.metres, since * STATS_MAX_SPEED));
    const S = p.profile.stats;
    if (m > 0) { const key = p.place === 'moon' ? 'moon_metres' : 'metres'; S[key] = Math.round(((S[key] || 0) + m) * 10) / 10; }
    const at = posOf(p);
    if (at && cities.length && p.place === 'county') for (const c of cities) {
      if (Math.abs(at[0] - c.x) <= (c.hx || 150) && Math.abs(at[2] - c.z) <= (c.hz || 150)) {
        const seen = (p.profile.seen.cities ||= []);
        if (!seen.includes(c.id)) seen.push(c.id);
      }
    }
    store.changed(p.profileKey);
    const ach = award(p, { when: 'stats' });
    to(p.pid, profileMsg(p, { why: 'stats', ...(ach.length ? { ach } : {}) }));
  }
  /** In County rooms you wear only what you own: the look with every unowned piece swapped (and the owner told). */
  function wearable(p, look) {
    if (!look || opts.mode !== 'county' || !p.profile) return look;
    const r = stripLook(look, p.profile);
    if (r.stripped.length) to(p.pid, { t: 'look', look: r.look, stripped: r.stripped });
    return r.look;
  }
  /** Move to another place: out of any seat, the flag dropped, your bodies left behind handed to someone there. */
  function go(p, msg) {
    if (p.spec) return deny(p.pid, 'go', 'Watchers stay where they are.');
    if (phase !== 'play') return deny(p.pid, 'go', 'Wait for the host to start.');
    // M11: the Moon and the station only from orbit (or from each other); home from up there = a landing pod
    const up = p.orbit || p.place === 'moon' || p.place === 'station';
    const why = goRefusal({ mode: opts.mode, from: p.place, to: msg.place, launched: up, open: openPlaces });
    if (why) return deny(p.pid, 'go', why, { place: msg.place });
    if (up && msg.place === 'county' && (!openPlaces || msg.at?.[1] >= SPACE.podMinY)) return podHome(p, msg);
    if (msg.place === p.place) return;
    if (p.orbit && (msg.place === 'moon' || msg.place === 'station')) { p.orbit = false; if (msg.place === 'station') award(p, { when: 'docked' }); }
    const from = p.place;
    if (flag && flag.state === 'carried' && flag.by === p.pid) dropFlag(posOf(p) || flag.p);
    clearSeat(p);
    p.place = msg.place;
    p.me = msg.at ? { p: msg.at.slice(), yaw: p.me?.yaw ?? 0 } : null; p.fresh = false;
    if (!sharesView(from, p.place)) {
      // bodies I was simulating there need someone who is still there (or nobody: the next one to touch them takes them)
      for (const e of ents.values()) if (e.owner === p.pid && sharesView(e.place, from)) { e.owner = e.seats[0] ?? heir(p.pid, from); e.idle = e.seats[0] == null; }
      if (pins.has(p.pid)) { pins.delete(p.pid); castIn(from, { t: 'pin', pid: p.pid, p: null }); }
    }
    to(p.pid, { t: 'go', place: p.place, ...(msg.at ? { at: msg.at.slice() } : {}) });
    award(p, { when: 'place_' + p.place }, true);
    resyncPlace(p.pid);
    syncRoom(); syncEnts();
    report('go', { from, to: p.place });
  }
  // ------------------------------------------------------------------------------------------------ space (M11)
  const launchSite = sites.launch && Number.isFinite(sites.launch.x) ? { x: sites.launch.x, z: sites.launch.z, y: Number.isFinite(sites.launch.y) ? sites.launch.y : 0, r: sites.launch.pad?.r ?? 18 } : null;
  /** The rocket stands only on the launch pad (called from near it); the landing pod is never called — it comes down. */
  function spaceSummonRefusal(p, msg, here) {
    if (msg.vehicle === 'landing_pod') return 'The pod comes down from orbit — it cannot be called.';
    if (msg.vehicle !== 'rocket') return null;
    if (!launchSite || p.place !== 'county') return 'The rocket can only stand on the Skyreach launch pad.';
    if (flat(here, launchSite.x, launchSite.z) > SPACE.rocketPadRange) return 'Go to the Skyreach launch site to call the rocket.';
    if (flat(msg.p, launchSite.x, launchSite.z) > launchSite.r) return 'The rocket can only stand on the launch pad.';
    return null;
  }
  /** Home from orbit / the station / the Moon: a landing pod high over the county with you in its seat. */
  function podHome(p, msg) {
    const at = msg.at;
    if (!at || at[1] < SPACE.podMinY || at[1] > SPACE.podMaxY) return deny(p.pid, 'go', 'The pod starts high over the county.', { place: 'county' });
    const from = p.place;
    clearSeat(p);
    if (!sharesView(from, 'county')) for (const e of ents.values()) if (e.owner === p.pid && sharesView(e.place, from)) { e.owner = e.seats[0] ?? heir(p.pid, from); e.idle = e.seats[0] == null; }
    p.place = 'county'; p.orbit = false; p.me = { p: at.slice(), yaw: 0 }; p.fresh = false;
    for (const e of [...ents.values()]) if (e.summonedBy === p.pid && e.kind === 'landing_pod' && e.seats.every(x => x == null)) ents.delete(e.id);
    // (a room with no pod in its vehicle table just puts you in the air: the high fall gives you a parachute)
    const e = kinds.landing_pod ? putDown(p, 'landing_pod', at, 0, { spawnedBy: 0, summonedBy: p.pid, podFrom: at[1] }) : null;
    if (e) { e.idle = false; e.seats[0] = p.pid; p.seat = [e.id, 0]; p.pod = e.id; e.driveFrom = now(); }
    to(p.pid, { t: 'go', place: 'county', at: at.slice(), ...(e ? { pod: e.id } : {}) });
    resyncPlace(p.pid);
    syncRoom(); syncEnts();
    report('go', { from, to: 'county', pod: 1 });
  }
  function space(p, msg) {
    if (p.spec || phase !== 'play') return;
    if (msg.step === 'launch') {
      const e = ents.get(msg.id);
      if (!e || e.kind !== 'rocket' || !p.seat || p.seat[0] !== e.id || e.place !== 'county') return deny(p.pid, 'space', 'You are not in the rocket.');
      const y = e.pose?.p?.[1];
      if (!launchSite || y == null || y - launchSite.y < SPACE.orbitAlt - 30) return deny(p.pid, 'space', 'Not high enough for orbit yet.');
      const crew = e.seats.filter(x => x != null).map(x => players.get(x)).filter(Boolean);
      for (const c of crew) {
        clearSeat(c);
        c.launched = true; c.orbit = true; c.me = null; c.fresh = false;
        to(c.pid, { t: 'orbit', crew: crew.map(x => x.pid) });
        award(c, { when: ['launched', 'orbit'] }, true);
      }
      ents.delete(e.id);              // the upper stage stays up there: call the rocket again for the next launch
      syncEnts();
      report('launch', { crew: crew.length });
      return;
    }
    if (msg.step === 'touchdown') {
      const e = ents.get(p.pod);
      if (!e || e.kind !== 'landing_pod' || !e.pose) return;
      const v = e.pose.v || [0, 0, 0], y = e.pose.p[1];
      if (Math.hypot(v[0], v[1], v[2]) > SPACE.podLanded * 2 || y == null || y > (e.podFrom ?? 1e9) - 300) return deny(p.pid, 'space', 'Not down yet.');
      for (const pid of e.seats) { const c = players.get(pid); if (c && c.pod === e.id) { c.pod = null; award(c, { when: 'pod_landed' }, true); } }
      if (p.pod === e.id) { p.pod = null; award(p, { when: 'pod_landed' }, true); }
      return;
    }
    if (msg.step === 'bail') {
      const e = ents.get(p.pod);
      if (!e || (p.seat && p.seat[0] === e.id)) return;
      p.pod = null; award(p, { when: 'pod_bail' }, true);
      return;
    }
    if (msg.step === 'lap') { if (p.place === 'station') award(p, { when: 'station_lap' }, true); return; }
    if (msg.step === 'spin') {
      // somersaults on the station: a run of them, each within 3 s of the last and no faster than one spin takes
      if (p.place !== 'station') return;
      const t = now(), gap = p.spinAt ? t - p.spinAt : Infinity;
      if (gap < 700) return;
      p.spinRun = gap <= 3000 ? (p.spinRun || 0) + 1 : 1; p.spinAt = t;
      const S = p.profile.stats || (p.profile.stats = {});
      if (p.spinRun > (S.station_spins || 0)) { S.station_spins = p.spinRun; award(p, { when: 'station_spins' }, true); }
      return;
    }
  }
  function own(p, id) {
    const e = ents.get(id); if (!e || p.spec || phase !== 'play') return deny(p.pid, 'own', 'Not now.', { id });
    if (e.owner === p.pid) return;
    if (e.seats[0] != null && e.seats[0] !== p.pid) return deny(p.pid, 'own', 'Someone is driving it.', { id });
    const cur = players.get(e.owner);
    // an idle body, or one whose owner is not here, can be taken by whoever touches it
    if (!e.idle && cur && cur.connected) return deny(p.pid, 'own', 'Someone else has it.', { id });
    e.owner = p.pid; syncEnts();
  }
  function give(p, id, toPid) {
    const e = ents.get(id), target = players.get(toPid);
    if (!e || e.owner !== p.pid) return deny(p.pid, 'give', 'That is not yours to give.', { id });
    if (!target || target.spec || !target.connected) return deny(p.pid, 'give', 'They are not here.', { id });
    if (e.seats[0] != null && e.seats[0] !== toPid) return deny(p.pid, 'give', 'Its driver keeps it.', { id });
    e.owner = toPid; syncEnts();
  }

  // ------------------------------------------------------------------------------------------------ the flag + the run
  function dropFlag(at) {
    if (!flag) return;
    flag.state = 'dropped'; flag.by = null; flag.p = at ? at.slice() : flag.p;
    castIn(base(), flagMsg());
  }
  function flagAct(p, msg) {
    if (!flag || p.spec || phase !== 'play') return;
    if (msg.act === 'take') {
      if (flag.state !== 'site' && flag.state !== 'dropped') return deny(p.pid, 'flag', flag.state === 'carried' ? 'Someone has the flag.' : 'The flag is home.');
      if (p.seat) return deny(p.pid, 'flag', 'Get out to pick up the flag.');
      const me = p.me?.p; if (!me) return;
      if (dist(me, flag.p) > FLAG_RANGE) return deny(p.pid, 'flag', 'Get closer to the flag.');
      flag.state = 'carried'; flag.by = p.pid; flag.p = null;
      castIn(base(), flagMsg());
      // the clock should already be running (it starts when a vehicle leaves home); if it somehow is not, it starts now
      if (run.phase === 'pick') { run.phase = 'go'; run.startedAt = now(); run.time = null; castIn(base(), runMsg()); }
      report('flag', { act: 'take', site: flag.site, ms: run.startedAt != null ? now() - run.startedAt : null });
      checkCapture(p);
    } else if (msg.act === 'drop') {
      if (flag.state !== 'carried' || flag.by !== p.pid) return;
      const here = posOf(p);
      dropFlag(here && dist(here, msg.p) <= SEAT_RANGE ? msg.p : here);
    }
  }
  function checkCapture(p) {
    if (!flag || flag.state !== 'carried' || flag.by !== p.pid) return;
    const at = posOf(p); if (!at || flat(at, home.x, home.z) > home.r) return;
    // a run with no clock, or one too short to be real, brings the flag home but records no time and no best
    const time = run.startedAt != null && now() - run.startedAt >= MIN_RUN_MS ? now() - run.startedAt : null;
    flag.state = 'captured'; flag.time = time; flag.p = [home.x, null, home.z];
    run.phase = 'done'; run.time = time;
    const k = keyOf();
    if (time != null) {
      if (bests[k] == null || time < bests[k]) bests[k] = time;
      const L = times.get(k) || []; L.push(time); L.sort((a, b) => a - b); times.set(k, L.slice(0, 20));
    }
    runs++;
    castIn(base(), flagMsg()); castIn(base(), runMsg());
    report('run', { site: flag.site, seed, ms: time, players: [...players.values()].filter(x => !x.spec).length });
  }
  /** The run clock starts when a driven vehicle first leaves the home ring. */
  function watchHome(e) {
    const at = e.pose?.p; if (!at) return;
    // `inHome` is sticky: a vehicle that was ever inside the ring (a home pad counts from the start) and is now DRIVEN
    // outside it starts the clock — even if it was pushed or put outside while nobody sat in it
    const inside = flat(at, home.x, home.z) <= home.r;
    if (inside) e.inHome = true;
    if (e.inHome && !inside && run.phase === 'pick' && phase === 'play' && opts.mode === 'flag' && e.seats[0] != null) {
      run.phase = 'go'; run.startedAt = now(); run.time = null;
      castIn(base(), runMsg());
    }
  }
  function startPlay() {
    phase = 'play';
    placeFlag();
    run = { phase: 'pick', startedAt: null, time: null };
    syncRoom();
    if (flag) castIn(base(), flagMsg());
    if (opts.mode === 'flag') castIn(base(), runMsg());
    for (const p of players.values()) if (p.connected) jobsCore?.resync(p.pid);
    report('match', { mode: opts.mode, site: flag?.site ?? null, players: [...players.values()].filter(x => !x.spec).length, game: opts.mode });
  }
  function reset(flagPick) {
    if (flagPick != null) opts.flagPick = flagPick === 'random' || !flagSites.some(f => f.id === flagPick) ? 'random' : flagPick;
    for (const p of players.values()) clearSeat(p);
    makeParked();
    for (const e of ents.values()) e.owner = host;
    placeFlag();
    run = { phase: 'pick', startedAt: null, time: null };
    cast({ t: 'reset', flagId: flag?.site ?? null });
    syncRoom(); syncEnts();
    if (flag) castIn(base(), flagMsg());
    if (opts.mode === 'flag') castIn(base(), runMsg());
  }

  // ------------------------------------------------------------------------------------------------ kicking
  function kick(pid, by) {
    const p = players.get(pid); if (!p) return;
    if (p.token) banned.add(p.token);
    to(pid, { t: 'kicked', by: by === 'vote' ? 'vote' : 'host' });
    leave(pid, 'kicked');
  }
  function voteKick(voter, target, on = true) {
    if (voter.pid === target || !players.has(target) || voter.spec) return;
    const s = kickVotes.get(target) || new Set();
    if (on) s.add(voter.pid); else s.delete(voter.pid);
    kickVotes.set(target, s);
    const eligible = [...players.values()].filter(x => x.connected && !x.spec && x.pid !== target).length;
    if (s.size >= Math.floor(eligible / 2) + 1 && eligible >= 2) return kick(target, 'vote');
    syncRoom();
  }

  // ------------------------------------------------------------------------------------------------ messages
  function message(pid, msg) {
    const p = players.get(pid); if (!p || !p.connected) return;
    const isHost = pid === host;
    switch (msg.t) {
      case 'pos': {
        if (p.spec || phase !== 'play') return;
        p.me = msg.me; p.meAt = now(); p.fresh = true;
        // a seat the client thinks it has but the room does not: the room is right (tell it again)
        for (const ent of msg.ents || []) {
          const e = ents.get(ent.id);
          if (!e || e.owner !== pid) continue;      // only bodies I own
          e.pose = ent; e.fresh = true;
          watchHome(e);
        }
        checkCapture(p);
        return;
      }
      case 'seat': return takeSeat(p, msg.id, msg.seat);
      case 'unseat': {
        if (!p.seat) return;
        const thrown = !!msg.thrown;
        clearSeat(p, { thrown });
        if (thrown && flag && flag.state === 'carried' && flag.by === pid) dropFlag(p.me?.p || posOf(p));
        return syncEnts();
      }
      case 'spawn': return spawn(p, msg);
      case 'own': return own(p, msg.id);
      case 'give': return give(p, msg.id, msg.to);
      case 'bump': {
        const e = ents.get(msg.id); if (!e || e.owner == null || e.owner === pid || p.spec || !sharesView(p.place, e.place)) return;
        const j = msg.j.map(v => Math.max(-1e5, Math.min(1e5, v)));
        return to(e.owner, { t: 'bump', id: e.id, j, at: msg.at, by: pid });
      }
      case 'break': {
        const broken = setIn(brokenIn, p.place);
        if (p.spec || phase !== 'play' || broken.has(msg.obj) || broken.size >= 20000) return;
        broken.add(msg.obj);
        return castIn(p.place, { t: 'broken', objs: [msg.obj], hits: [{ obj: msg.obj, dir: msg.dir, speed: msg.speed, by: pid }] });
      }
      case 'flag': return flagAct(p, msg);
      case 'fire': {
        if (!p.seat || p.seat[0] !== msg.id) return;
        return castIn(p.place, { t: 'fire', id: msg.id, p: msg.p, d: msg.d, kind: msg.kind || null, by: pid }, pid);
      }
      case 'horn': {
        if (!p.seat || p.seat[0] !== msg.id) return;
        return castIn(p.place, { t: 'horn', id: msg.id, by: pid }, pid);
      }
      case 'cut': {
        const cut = setIn(cutIn, p.place);
        if (p.spec || phase !== 'play' || cut.size >= 200000) return;
        const fresh = msg.cells.filter(c => !cut.has(c));
        if (!fresh.length) return;
        for (const c of fresh) cut.add(c);
        return castIn(p.place, { t: 'cut', cells: fresh, by: pid }, pid);
      }
      case 'act': {
        // a switch on a vehicle (siren, light bar, work lights): anyone seated in it may flip it; the room remembers
        // the state so a newcomer sees the lights already going
        const e = ents.get(msg.id);
        if (!e || !/^[a-z_]{2,16}$/.test(msg.what)) return;
        // seated in it — or, for doors and lids (door_rear, trunk…), standing next to it
        const seated = p.seat && p.seat[0] === msg.id;
        const near = /^(door_|trunk)/.test(msg.what) && p.me && e.pose && dist(p.me.p, e.pose.p) <= SEAT_RANGE + 4;
        if (!seated && !near) return;
        e.acts ||= {};
        const on = msg.on ?? !e.acts[msg.what];
        if (Object.keys(e.acts).length >= 8 && !(msg.what in e.acts)) return;
        e.acts[msg.what] = !!on;
        return castIn(e.place, { t: 'act', id: e.id, what: msg.what, on: !!on, by: pid });
      }
      case 'crash': {
        // only the body's owner says it crashed; everyone hears it (each rider throws themselves out, then sends unseat thrown)
        const e = ents.get(msg.id); if (!e || e.owner !== pid || p.spec) return;
        return castIn(e.place, { t: 'crash', id: e.id, v: msg.v.slice() });
      }
      case 'pin': {
        if (msg.p) pins.set(pid, { p: msg.p.slice(), place: p.place }); else pins.delete(pid);
        return castIn(p.place, { t: 'pin', pid, p: msg.p ? msg.p.slice() : null });
      }
      case 'rate': {
        const up = !!msg.up;
        if (!kinds[msg.what] && !/^[a-z0-9_]{1,32}$/.test(msg.what)) return;
        return report('rate', { vehicle: msg.what, game: msg.what, v: up ? 1 : -1, why: cleanReasons(up, msg.reasons || []), ...(msg.note ? { note: cleanText(msg.note, 400) } : {}), mode: opts.mode, voter: `${code}:${p.joinedAt}:${pid}` });
      }
      case 'me': {
        if (msg.name != null) p.name = uniqueName(cleanName(msg.name) || p.name, p);
        if (msg.look != null) p.look = wearable(p, cleanLook(msg.look)) || p.look;
        // the look is kept with the profile too (M4's wardrobe changes it through this same message)
        if (msg.look != null && p.profile && p.look && JSON.stringify(p.profile.look) !== JSON.stringify(p.look)) { p.profile.look = p.look; store.changed(p.profileKey); }
        return syncRoom();
      }
      case 'opt': {
        if (!isHost) return deny(pid, 'opt', 'Only the host can change that.');
        if (msg.key === 'mode' && MODES.includes(msg.value)) {
          if (phase === 'play') return deny(pid, 'opt', 'Change the mode in the lobby.');
          // the room's world was built for its map: County and the old world (Flag Run, Sandbox) need different rooms
          if (mapFor(msg.value) !== mapFor(opts.mode)) return deny(pid, 'opt', 'County is a different map — make a new room for it.');
          opts.mode = msg.value;
        }
        else if (msg.key === 'public' && typeof msg.value === 'boolean') opts.public = msg.value;
        else if (msg.key === 'flagId' && typeof msg.value === 'string') { opts.flagPick = msg.value === 'random' || !flagSites.some(f => f.id === msg.value) ? 'random' : msg.value; if (phase === 'play') return reset(); }
        else return;
        return syncRoom();
      }
      case 'start': {
        if (!isHost) return deny(pid, 'start', 'Only the host can start.');
        if (phase === 'play') return;
        return startPlay();
      }
      case 'reset': {
        if (!isHost) return deny(pid, 'reset', 'Only the host can start a new run.');
        if (phase !== 'play') return;
        return reset(msg.flagId ?? null);
      }
      case 'kick': {
        if (!isHost) return deny(pid, 'kick', 'Only the host can remove players.');
        if (msg.pid === pid) return;
        return kick(msg.pid, 'host');
      }
      case 'votekick': return voteKick(p, msg.pid, msg.on !== false);
      case 'ping': return to(pid, { t: 'pong', c: msg.c, s: now() });
      case 'buy': return buy(p, msg.item);
      case 'go': return go(p, msg);
      case 'summon': return summon(p, msg);
      case 'space': return space(p, msg);
      case 'upgrade': return upgrade(p, msg.id);
      case 'stats': return stats(p, msg);
      case 'job': if (p.spec || phase !== 'play') return; return jobsCore?.message(pid, msg);
    }
  }

  // ------------------------------------------------------------------------------------------------ the clock
  function tick() {
    const t = now();
    for (const p of [...players.values()]) {
      if (p.connected || p.goneAt == null) continue;
      if (t - p.goneAt > (phase === 'play' ? GONE_RUN_MS : GONE_LOBBY_MS)) leave(p.pid, 'gone');
    }
    if (phase !== 'play') return;
    jobsCore?.tick();
    const freshP = [...players.values()].filter(p => p.fresh && p.me), freshE = [...ents.values()].filter(e => e.fresh && e.pose);
    if (!freshP.length && !freshE.length) return;
    for (const r of players.values()) {
      if (!r.connected) continue;
      const ps = {}, es = {}; let n = 0;
      for (const p of freshP) if (p.pid !== r.pid && sharesView(r.place, p.place)) { ps[p.pid] = p.me; n++; }
      for (const e of freshE) if (e.owner !== r.pid && sharesView(r.place, e.place)) { es[e.id] = e.pose; n++; }
      if (n) send(r.pid, { t: 'state', s: t, players: ps, ents: es });
    }
    for (const p of freshP) p.fresh = false;
    for (const e of freshE) e.fresh = false;
  }
  function listing() {
    if (!opts.public || ![...players.values()].some(p => p.connected)) return null;
    const h = players.get(host);
    const drivers = [...players.values()].filter(p => !p.spec).length;
    return { code, mode: opts.mode, phase, players: drivers, seats: MAX_PLAYERS, hostName: h?.name || null, site: flag ? flagSites.find(f => f.id === flag.site)?.name || null : null };
  }

  // the job referee (M6): a narrow window onto this room, nothing else
  const jobsCore = createJobsCore({ jobs: jobT, sites, seed, now, room: {
    player: pid => { const p = players.get(pid); return p ? { pid: p.pid, place: p.place, spec: p.spec, seat: p.seat, pos: posOf(p), profile: p.profile } : null; },
    ent: id => { const e = ents.get(id); return e ? { id: e.id, kind: e.kind, owner: e.owner, seats: e.seats, pos: entPos(e), acts: e.acts || {}, place: e.place } : null; },
    players: () => [...players.values()].filter(p => p.connected).map(p => ({ pid: p.pid, place: p.place, spec: p.spec, seat: p.seat, pos: posOf(p), down: p.me?.a === 'down' })),   // M8
    payees: ({ place, at, vehicle }) => payeesOf({ place, at, vehicle }),
    award: (pid, event) => award(players.get(pid), event, true),      // M12: a job's own achievement events
    grant: (pid, gold, why, o) => grant(pid, gold, why, o),
    jobDone: (pid, jobId, level, o) => jobDone(pid, jobId, level, o),
    send: (pid, m) => to(pid, m), castIn: (place, m) => castIn(place, m), deny: (pid, what, why) => deny(pid, what, why),
    // M7: a job's own vehicle (a runaway car, a wreck to tow): simulated by `owner`'s machine, gone again at a reset
    spawn({ kind, p, yaw = 0, owner, place = base(), noSeat = false, job = null }) {
      const o = players.get(owner);
      if (!kinds[kind] || !o || !Array.isArray(p) || ents.size >= MAX_ENTS) return null;
      const e = putDown({ ...o, place }, kind, p, yaw, { spawnedBy: 0, jobVeh: job, ...(noSeat ? { noSeat: true } : {}) });
      syncEnts(); return e.id;
    },
    // M10: a referee changed a live profile (the survey's set-up kits): keep it, tell the player
    saveProfile(pid) { const p = players.get(pid); if (!p?.profile) return; store.changed(p.profileKey); to(pid, profileMsg(p, { why: 'sites' })); },
    remove(id) { const e = ents.get(id); if (!e?.jobVeh) return false; for (const q of players.values()) if (q.seat?.[0] === id) clearSeat(q); ents.delete(id); syncEnts(); return true; },
  } });
  makeParked();
  return {
    jobs: jobsCore,
    code, seed, join, leave, disconnect, message, tick, listing, grant, payJob, jobDone, award: (pid, event) => award(players.get(pid), event, true),
    /** Tests: as if `pid` had just launched (in orbit: `go` to 'moon' / 'station' / home by pod allowed). M11's real path is `space` 'launch'. */
    launch(pid) { const p = players.get(pid); if (p) { p.launched = true; p.orbit = true; } },
    get broken() { return setIn(brokenIn, base()); }, brokenIn: place => setIn(brokenIn, place),
    get phase() { return phase; }, get host() { return host; }, get opts() { return opts; }, get mode() { return opts.mode; },
    get players() { return players; }, get ents() { return ents; }, get flag() { return flag; }, get run() { return run; },
    get pins() { return pins; }, get runs() { return runs; },
    get connected() { return [...players.values()].filter(p => p.connected).length; },
    get emptyFor() { return [...players.values()].some(p => p.connected) ? 0 : now() - (emptySince ?? now()); },
    pidOf: token => { for (const p of players.values()) if (p.token === token) return p.pid; return null; },
  };
}
