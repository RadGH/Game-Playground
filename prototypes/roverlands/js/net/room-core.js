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
// `send(pid, msg)` delivers one message object to one player. `report(kind, data)` is the insights log (never a name,
// token or address). `bests` is a plain object { 'seed:site': ms } shared across rooms (the server saves it).
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

export function createRoomCore({ code = 'SOLO', mode = 'flag', seed = 1, flagId = null, public: pub = false, now = () => Date.now(), rand = null,
  sites = {}, vehicles = {}, bests = {}, report = () => {}, send = () => {} } = {}) {
  const rng = rand || makeRng((seed * 2654435761) ^ code.charCodeAt(0));
  const kinds = vehicleTable(vehicles);
  const home = sites.home && Number.isFinite(sites.home.x) ? { x: sites.home.x, z: sites.home.z, r: sites.home.r || 20 } : { x: 0, z: 0, r: 20 };
  const flagSites = (sites.flags || []).filter(f => f && f.id != null).map(f => ({ id: String(f.id), x: f.x, z: f.z, name: f.name || String(f.id) }));
  const pads = (sites.pads || []).filter(p => p && typeof p.vehicle === 'string');
  const opts = { mode: MODES.includes(mode) ? mode : 'flag', public: !!pub, flagPick: flagId && flagId !== 'random' ? String(flagId) : 'random' };

  const players = new Map();          // pid -> { pid, token, name, look, spec, connected, goneAt, me, meAt, fresh, seat: [id, i] | null, joinedAt }
  const ents = new Map();             // id -> { id, kind, owner, seats, idle, pose, fresh, pad, spawnedBy, inHome, driveFrom }
  const broken = new Set();
  const cut = new Set();              // wheat cells cut (world sample indexes)
  const pins = new Map();             // pid -> [x, z]
  const banned = new Set();           // tokens removed from this room
  const kickVotes = new Map();        // target pid -> Set(voter pid)
  let nextPid = 1, nextEnt = 1, host = null, phase = 'lobby', emptySince = now(), runs = 0;
  let flag = null, run = { phase: 'pick', startedAt: null, time: null };
  const times = new Map();            // 'seed:site' -> [ms...] this room's finished runs

  // ------------------------------------------------------------------------------------------------ sending
  const cast = (msg, except = null) => { for (const p of players.values()) if (p.connected && p.pid !== except) send(p.pid, msg); };
  const to = (pid, msg) => { const p = players.get(pid); if (p?.connected) send(pid, msg); };
  const deny = (pid, what, why, extra = {}) => to(pid, { t: 'deny', what, why, ...extra });
  const pubPlayer = p => ({ pid: p.pid, name: p.name, look: p.look, spec: p.spec || undefined, on: p.connected, kick: kickVotes.get(p.pid)?.size || undefined });
  function roomMsg(pid) {
    return { t: 'room', code, mode: opts.mode, seed, host, public: opts.public, flagId: flag?.site ?? resolvedFlag(), flagPick: opts.flagPick, phase, you: pid,
      players: [...players.values()].map(pubPlayer), sites: { flags: flagSites.map(f => ({ id: f.id, name: f.name })) } };
  }
  const syncRoom = () => { for (const p of players.values()) if (p.connected) send(p.pid, roomMsg(p.pid)); };
  const entRow = e => ({ id: e.id, kind: e.kind, owner: e.owner, seats: e.seats.slice(), idle: e.idle, ...(e.pad != null ? { pad: e.pad } : {}), ...(e.acts ? { acts: { ...e.acts } } : {}) });
  const entsMsg = () => ({ t: 'ents', list: [...ents.values()].map(entRow) });
  const syncEnts = () => cast(entsMsg());
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
      const e = { id, kind: pad.vehicle, owner: host, seats: Array(kinds[pad.vehicle]?.seats ?? 1).fill(null), idle: true, pose: null, fresh: false, pad: i, spawnedBy: null, inHome: flat([pad.x, 0, pad.z], home.x, home.z) <= home.r, driveFrom: null };
      ents.set(id, e);
    });
    nextEnt = Math.max(nextEnt, pads.length + 1);
  }
  const entPos = e => e.pose?.p || (e.pad != null ? [pads[e.pad].x, null, pads[e.pad].z] : null);
  /** Where a player is in the world: their vehicle's pose when seated (it is the newer number), else their own. */
  function posOf(p) {
    if (p.seat) { const e = ents.get(p.seat[0]); const ep = e && entPos(e); if (ep && ep[1] != null) return ep; }
    return p.me?.p || null;
  }

  // ------------------------------------------------------------------------------------------------ players
  function join({ token, name, look, spectate = false } = {}) {
    if (token && banned.has(token)) return { err: 'kicked', msg: 'You were removed from this room.' };
    for (const p of players.values()) if (token && p.token === token) {           // the same browser, back after a drop
      p.connected = true; p.goneAt = null; emptySince = null;
      if (name != null) p.name = uniqueName(cleanName(name) || p.name, p);
      if (look) p.look = cleanLook(look) || p.look;
      pickHost(); resync(p.pid); syncRoom();
      return { pid: p.pid, back: true };
    }
    const spec = !!spectate, count = [...players.values()].filter(p => !!p.spec === spec).length;
    if (count >= (spec ? MAX_WATCHERS : MAX_PLAYERS)) return { err: 'full', msg: spec ? 'Too many people are watching this room.' : `This room is full (${MAX_PLAYERS} drivers).` };
    const p = { pid: nextPid++, token: token || null, name: 'Driver', look: cleanLook(look), spec, connected: true, goneAt: null, me: null, meAt: 0, fresh: false, seat: null, joinedAt: now() };
    p.name = uniqueName(cleanName(name) || (spec ? 'Watcher' : 'Driver'), p);
    players.set(p.pid, p); emptySince = null;
    const hadHost = host != null;
    pickHost();
    if (!hadHost && host != null) for (const e of ents.values()) if (e.owner == null) e.owner = host;
    resync(p.pid); syncRoom();
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
    to(pid, entsMsg());
    const ps = {}, es = {};
    for (const o of players.values()) if (o.pid !== pid && o.me) ps[o.pid] = o.me;
    for (const e of ents.values()) if (e.pose) es[e.id] = e.pose;
    to(pid, { t: 'state', s: now(), players: ps, ents: es, full: 1 });
    to(pid, { t: 'broken', objs: [...broken] });
    if (cut.size) { const all = [...cut]; for (let i = 0; i < all.length; i += 4000) to(pid, { t: 'cut', cells: all.slice(i, i + 4000), full: 1 }); }
    if (flag) to(pid, flagMsg());
    if (phase === 'play' && opts.mode === 'flag') to(pid, runMsg());
    for (const [who, p] of pins) to(pid, { t: 'pin', pid: who, p });
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
    for (const e of ents.values()) if (e.owner === pid && e.seats[0] !== pid) { e.owner = heir(pid); }
    syncRoom(); syncEnts();
    if (![...players.values()].some(x => x.connected)) emptySince = now();
  }
  /** Who takes a leaving owner's bodies: the host, else the next player still here, else nobody. */
  function heir(pid) {
    const h = players.get(host);
    if (h && h.pid !== pid && h.connected && !h.spec) return h.pid;
    const o = [...players.values()].find(x => x.pid !== pid && x.connected && !x.spec);
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
    const h = heir(pid);
    for (const e of ents.values()) if (e.owner === pid) { e.owner = h; e.idle = true; }
    // a spawned vehicle stays (someone may be using it); it just loses its spawner's count
    for (const e of ents.values()) if (e.spawnedBy === pid) e.spawnedBy = 0;
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
    if (!Number.isInteger(i) || i < 0 || i >= e.seats.length) return deny(p.pid, 'seat', 'No such seat.', { id });
    if (e.seats[i] != null && e.seats[i] !== p.pid) return deny(p.pid, 'seat', 'Someone is sitting there.', { id });
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
    const id = nextEnt++, yaw = msg.yaw;
    const q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
    const e = { id, kind: msg.kind, owner: p.pid, seats: Array(kinds[msg.kind].seats).fill(null), idle: true, pose: { id, p: msg.p.slice(), q, v: [0, 0, 0], w: [0, 0, 0] }, fresh: true, pad: null, spawnedBy: p.pid, inHome: flat(msg.p, home.x, home.z) <= home.r, driveFrom: null };
    ents.set(id, e);
    syncEnts();
    report('spawn', { vehicle: msg.kind });
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
    cast(flagMsg());
  }
  function flagAct(p, msg) {
    if (!flag || p.spec || phase !== 'play') return;
    if (msg.act === 'take') {
      if (flag.state !== 'site' && flag.state !== 'dropped') return deny(p.pid, 'flag', flag.state === 'carried' ? 'Someone has the flag.' : 'The flag is home.');
      if (p.seat) return deny(p.pid, 'flag', 'Get out to pick up the flag.');
      const me = p.me?.p; if (!me) return;
      if (dist(me, flag.p) > FLAG_RANGE) return deny(p.pid, 'flag', 'Get closer to the flag.');
      flag.state = 'carried'; flag.by = p.pid; flag.p = null;
      cast(flagMsg());
      // the clock should already be running (it starts when a vehicle leaves home); if it somehow is not, it starts now
      if (run.phase === 'pick') { run.phase = 'go'; run.startedAt = now(); run.time = null; cast(runMsg()); }
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
    cast(flagMsg()); cast(runMsg());
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
      cast(runMsg());
    }
  }
  function startPlay() {
    phase = 'play';
    placeFlag();
    run = { phase: 'pick', startedAt: null, time: null };
    syncRoom();
    if (flag) cast(flagMsg());
    if (opts.mode === 'flag') cast(runMsg());
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
    if (flag) cast(flagMsg());
    if (opts.mode === 'flag') cast(runMsg());
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
        const e = ents.get(msg.id); if (!e || e.owner == null || e.owner === pid || p.spec) return;
        const j = msg.j.map(v => Math.max(-1e5, Math.min(1e5, v)));
        return to(e.owner, { t: 'bump', id: e.id, j, at: msg.at, by: pid });
      }
      case 'break': {
        if (p.spec || phase !== 'play' || broken.has(msg.obj) || broken.size >= 20000) return;
        broken.add(msg.obj);
        return cast({ t: 'broken', objs: [msg.obj], hits: [{ obj: msg.obj, dir: msg.dir, speed: msg.speed, by: pid }] });
      }
      case 'flag': return flagAct(p, msg);
      case 'fire': {
        if (!p.seat || p.seat[0] !== msg.id) return;
        return cast({ t: 'fire', id: msg.id, p: msg.p, d: msg.d, kind: msg.kind || null, by: pid }, pid);
      }
      case 'horn': {
        if (!p.seat || p.seat[0] !== msg.id) return;
        return cast({ t: 'horn', id: msg.id, by: pid }, pid);
      }
      case 'cut': {
        if (p.spec || phase !== 'play' || cut.size >= 200000) return;
        const fresh = msg.cells.filter(c => !cut.has(c));
        if (!fresh.length) return;
        for (const c of fresh) cut.add(c);
        return cast({ t: 'cut', cells: fresh, by: pid }, pid);
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
        return cast({ t: 'act', id: e.id, what: msg.what, on: !!on, by: pid });
      }
      case 'crash': {
        // only the body's owner says it crashed; everyone hears it (each rider throws themselves out, then sends unseat thrown)
        const e = ents.get(msg.id); if (!e || e.owner !== pid || p.spec) return;
        return cast({ t: 'crash', id: e.id, v: msg.v.slice() });
      }
      case 'pin': {
        if (msg.p) pins.set(pid, msg.p.slice()); else pins.delete(pid);
        return cast({ t: 'pin', pid, p: msg.p ? msg.p.slice() : null });
      }
      case 'rate': {
        const up = !!msg.up;
        if (!kinds[msg.what] && !/^[a-z0-9_]{1,32}$/.test(msg.what)) return;
        return report('rate', { vehicle: msg.what, game: msg.what, v: up ? 1 : -1, why: cleanReasons(up, msg.reasons || []), ...(msg.note ? { note: cleanText(msg.note, 400) } : {}), mode: opts.mode, voter: `${code}:${p.joinedAt}:${pid}` });
      }
      case 'me': {
        if (msg.name != null) p.name = uniqueName(cleanName(msg.name) || p.name, p);
        if (msg.look != null) p.look = cleanLook(msg.look) || p.look;
        return syncRoom();
      }
      case 'opt': {
        if (!isHost) return deny(pid, 'opt', 'Only the host can change that.');
        if (msg.key === 'mode' && MODES.includes(msg.value)) { if (phase === 'play') return deny(pid, 'opt', 'Change the mode in the lobby.'); opts.mode = msg.value; }
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
    const freshP = [...players.values()].filter(p => p.fresh && p.me), freshE = [...ents.values()].filter(e => e.fresh && e.pose);
    if (!freshP.length && !freshE.length) return;
    for (const r of players.values()) {
      if (!r.connected) continue;
      const ps = {}, es = {}; let n = 0;
      for (const p of freshP) if (p.pid !== r.pid) { ps[p.pid] = p.me; n++; }
      for (const e of freshE) if (e.owner !== r.pid) { es[e.id] = e.pose; n++; }
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

  makeParked();
  return {
    code, seed, join, leave, disconnect, message, tick, listing,
    get phase() { return phase; }, get host() { return host; }, get opts() { return opts; }, get mode() { return opts.mode; },
    get players() { return players; }, get ents() { return ents; }, get broken() { return broken; }, get flag() { return flag; }, get run() { return run; },
    get pins() { return pins; }, get runs() { return runs; },
    get connected() { return [...players.values()].filter(p => p.connected).length; },
    get emptyFor() { return [...players.values()].some(p => p.connected) ? 0 : now() - (emptySince ?? now()); },
    pidOf: token => { for (const p of players.values()) if (p.token === token) return p.pid; return null; },
  };
}
