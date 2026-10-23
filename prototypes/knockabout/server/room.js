// One online Knockabout room: the devices in it, their players (every device may bring several: pads, keyboard
// halves, its touch screen), the host's settings, CPU players, the authoritative match, and the results + arena vote
// between matches.
//
// The server calls step() 60 times a second (js/net/protocol.js STEP_HZ). Nothing here touches a socket or a clock
// directly — a device carries a `send`, time comes in through `now()` — so tests/net-room.test.js plays whole matches
// in memory with fake sockets on a pretend clock.
//
// Phases:  lobby -> match -> results (rate the arena + room-wide vote for the next one) -> match -> … ; host 'end' -> lobby
//
// Who is who:
//   device  = one browser (one socket, one token). Never shown to anyone; its id is a small number within the room.
//   player  = one fighter seat (0..7). pid = seat + 1 (so the client's seat colours line up). A human player belongs to
//             a device and has that device's `local` index (which controller on that device drives it); a CPU has none.
import { createPacker } from '../js/net/pack.js';
import { MAX_FIGHTERS, MAX_LOCAL, GONE_MS, SNAP_EVERY, cleanName, cleanLook, cleanReasons, fromBits } from '../js/net/protocol.js';

export const TIMES = Object.freeze({ RESULTS_MS: 30000, VOTE_DONE_MS: 1500, EMPTY_MS: GONE_MS + 5000, INPUT_STALE_MS: 1000 });
export const ROUNDS = Object.freeze([1, 2, 3, 5]);
export const LEVELS = Object.freeze(['easy', 'normal', 'hard']);
const CPU_NAMES = ['Bolt', 'Rivet', 'Sprocket', 'Gizmo', 'Clank', 'Widget', 'Doodad', 'Ratchet'];

function makeRng(seed) { let a = seed >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/**
 * sim = the module js/sim/match.js ({ createMatch, ARENAS, MODES }).
 * report(kind, data) = the insights log ('match', 'played', 'rate', 'vote', 'final'). Never a name, token or address.
 * matchOpts = extra createMatch options (tests use { roundTime, tuning } to play short matches).
 */
export function createRoom({ code, serial = 0, now = () => Date.now(), seed = 1, sim, report = () => {}, log = () => {}, matchOpts = null }) {
  const rng = makeRng(seed);
  const arenas = (sim.ARENAS?.arenas || sim.ARENAS || []).filter(a => a && a.id);
  const modes = sim.MODES?.modes || [];
  const devices = new Map();          // devId -> { id, token, send, connected, goneAt, sentAt }
  const players = [];                 // seat order is not kept here; sort when sending
  let nextDev = 1, host = null, phase = 'lobby', emptySince = null, matchesPlayed = 0;
  const opts = { mode: modes[0]?.id || 'versus', arena: arenas[0]?.id || null, rounds: 3, difficulty: 'normal', public: false };
  let match = null;                   // { m, packer, tick, arena, mode, roster, events, startedAt, simT0, rounds: [], fightAt, outs }
  let results = null;                 // { result, arena, mode, choices, votes: Map(pid -> i), endsAt, doneAt, ratedBy: Set(devId) }
  const stats = { stepMs: 0, steps: 0, bytesOut: 0, snaps: 0 };

  // ---------------------------------------------------------------- sending
  const sendTo = (d, obj) => { if (d.connected && d.send) { const s = typeof obj === 'string' || obj instanceof Uint8Array ? obj : JSON.stringify(obj); d.send(s); stats.bytesOut += s.length ?? s.byteLength; } };
  const cast = obj => { const s = JSON.stringify(obj); for (const d of devices.values()) sendTo(d, s); };
  const castBin = bytes => { for (const d of devices.values()) sendTo(d, bytes); };
  const seatFree = () => { for (let s = 0; s < MAX_FIGHTERS; s++) if (!players.some(p => p.seat === s)) return s; return -1; };
  const humans = () => players.filter(p => !p.cpu);
  const pubPlayer = p => ({ pid: p.pid, seat: p.seat, name: p.name, look: p.look, cpu: p.cpu, level: p.level, team: p.team, ready: p.ready, dev: p.dev, local: p.local, on: p.cpu || !!devices.get(p.dev)?.connected, waiting: !!match && !match.roster.has(p.pid) });
  function roomMsg(d) {
    return { t: 'room', code, phase, host, you: d.id, opts, arenaNow: match?.arena || results?.arena || null,
      players: players.slice().sort((a, b) => a.seat - b.seat).map(pubPlayer),
      results: results ? { choices: results.choices, votes: Object.fromEntries(results.votes), endsIn: Math.max(0, results.endsAt - now()) } : null };
  }
  const sync = () => { for (const d of devices.values()) sendTo(d, roomMsg(d)); };
  const err = (d, c, msg) => sendTo(d, { t: 'err', code: c, msg });

  // ---------------------------------------------------------------- devices
  /** A device arrives (or comes back: the same token within GONE_MS gets its players back). */
  function join({ token, send }) {
    for (const d of devices.values()) if (d.token === token) {
      d.send = send; d.connected = true; d.goneAt = null; emptySince = null;
      if (host == null || !devices.get(host)?.connected) host = d.id;
      resync(d); sync(); return d;
    }
    const d = { id: nextDev++, token, send, connected: true, goneAt: null };
    devices.set(d.id, d); emptySince = null;
    if (host == null || !devices.get(host)?.connected) host = d.id;
    resync(d); sync();
    return d;
  }
  /** Everything a device needs to draw the present moment from nothing (a refresh, a phone that slept). */
  function resync(d) {
    sendTo(d, roomMsg(d));
    if (phase === 'match' && match) sendTo(d, startMsg(true));
    if (phase === 'results' && results) sendTo(d, { t: 'over', result: results.result, arena: results.arena, mode: results.mode, resume: true });
  }
  function disconnect(d) {
    if (!devices.has(d.id)) return;
    d.connected = false; d.send = null; d.goneAt = now();
    for (const p of players) if (p.dev === d.id) p.input = null;
    pickHost(); sync();
    if (![...devices.values()].some(x => x.connected)) emptySince = emptySince ?? now();
  }
  /** A device leaves for good ('leave', or gone longer than GONE_MS): its players go with it. */
  function remove(d) {
    if (!devices.delete(d.id)) return;
    for (let i = players.length - 1; i >= 0; i--) if (players[i].dev === d.id) players.splice(i, 1);
    if (results) for (const pid of [...results.votes.keys()]) if (!players.some(p => p.pid === pid)) results.votes.delete(pid);
    pickHost(); sync();
    if (![...devices.values()].some(x => x.connected)) emptySince = emptySince ?? now();
  }
  function pickHost() {
    if (host != null && devices.get(host)?.connected) return;
    const next = [...devices.values()].find(x => x.connected) || [...devices.values()][0];
    host = next ? next.id : null;
  }

  // ---------------------------------------------------------------- the device's own players
  /** list = [{ local, name, look }]: the device's whole set of local players. Adds, renames, re-dresses, removes. */
  function setLocals(d, list) {
    const want = new Map();
    for (const x of list.slice(0, MAX_LOCAL)) {
      if (!x || typeof x !== 'object' || !Number.isInteger(x.local) || x.local < 0 || x.local >= MAX_LOCAL || want.has(x.local)) continue;
      want.set(x.local, { name: cleanName(x.name), look: cleanLook(x.look) });
    }
    for (let i = players.length - 1; i >= 0; i--) { const p = players[i]; if (p.dev === d.id && !want.has(p.local)) players.splice(i, 1); }
    let full = false;
    for (const [local, w] of want) {
      let p = players.find(x => x.dev === d.id && x.local === local);
      if (!p) {
        const seat = seatFree(); if (seat < 0) { full = true; continue; }
        p = { pid: seat + 1, seat, dev: d.id, local, cpu: false, level: null, team: seat % 2, ready: false, name: null, look: null, input: null, latch: 0 };
        players.push(p);
      }
      p.name = uniqueName(w.name || p.name || 'Player ' + (p.seat + 1), p);
      if (w.look) p.look = w.look;
    }
    if (full) err(d, 'full', `This room is full (${MAX_FIGHTERS} fighters).`);
    sync();
  }
  /** Two "Bonk"s in one room read badly on the name tags: the later one becomes "Bonk 2". */
  function uniqueName(name, self) {
    const taken = n => players.some(x => x !== self && String(x.name).toLowerCase() === n.toLowerCase());
    if (!taken(name)) return name;
    for (let i = 2; i < 20; i++) { const n = name.slice(0, 12) + ' ' + i; if (!taken(n)) return n; }
    return name;
  }
  const ownPlayer = (d, local) => players.find(p => p.dev === d.id && p.local === local);

  // ---------------------------------------------------------------- the match
  const modeDef = id => modes.find(m => m.id === id) || { id };
  function teamFor(p, mode) { return mode === 'waves' ? 0 : mode === 'versus' ? p.seat : p.team; }
  function startMsg(resume = false) {
    return { t: 'start', arena: match.arena, mode: match.mode, rounds: match.rounds, difficulty: match.difficulty, layout: match.packer.layout, resume,
      players: match.players.map(x => ({ ...x, look: players.find(p => p.pid === x.pid)?.look || null })) };
  }
  function startMatch(arenaId = null) {
    const hs = humans().filter(p => devices.get(p.dev)?.connected);
    if (!hs.length) return 'Nobody is here to play.';
    const md = modeDef(opts.mode), minP = md.minPlayers ?? (opts.mode === 'waves' ? 1 : 2);
    if (players.length < minP) return `${md.name || opts.mode} needs at least ${minP} fighters. Add a CPU?`;
    if (opts.mode === 'teams' && new Set(players.map(p => p.team)).size < 2) return 'Put players on at least two teams.';
    let id = arenaId || opts.arena;
    if (!id || id === '*' || !arenas.some(a => a.id === id)) id = arenas[Math.floor(rng() * arenas.length)].id;
    const roster = players.slice().sort((a, b) => a.seat - b.seat).map(p => ({ pid: p.pid, name: p.name, team: teamFor(p, opts.mode), look: { race: p.look?.race, seed: p.look?.seed }, cpu: p.cpu, level: p.cpu ? p.level : undefined }));
    let m;
    try { m = sim.createMatch({ arena: id, mode: opts.mode, players: roster, seed: Math.floor(rng() * 2 ** 31), difficulty: opts.difficulty, rounds: opts.rounds, ...(matchOpts || {}) }); }
    catch (e) { log('room.start.fail', { code, msg: String(e?.message || e) }); return 'That match would not start.'; }
    for (const p of players) { p.input = null; p.latch = 0; p.ready = false; }
    match = { m, packer: createPacker(m.snapshot()), tick: 0, arena: id, mode: opts.mode, rounds: opts.rounds, difficulty: opts.difficulty, players: roster, roster: new Set(roster.map(r => r.pid)),
      events: [], startedAt: now(), fightAt: null, roundSecs: [], outs: {} };
    results = null; phase = 'match';
    cast(startMsg(false)); sync();
    report('match', { mode: opts.mode, arena: id, game: id, humans: roster.filter(r => !r.cpu).length, cpus: roster.filter(r => r.cpu).length, devices: new Set(hs.map(p => p.dev)).size, difficulty: opts.difficulty });
    return null;
  }
  function watchEvents(evs) {
    const t = match.m.time?.() ?? 0;
    for (const ev of evs) {
      if (ev.e === 'fight') match.fightAt = t;
      else if (ev.e === 'round' && match.fightAt != null) { match.roundSecs.push(Math.round((t - match.fightAt) * 10) / 10); match.fightAt = null; }
      else if (ev.e === 'out' && match.roster.has(ev.pid)) match.outs[ev.how || 'other'] = (match.outs[ev.how || 'other'] || 0) + 1;
    }
  }
  function playedReport(early) {
    const r = match.roster, hs = match.players.filter(p => !p.cpu).length;
    report('played', { arena: match.arena, game: match.arena, mode: match.mode, players: r.size, humans: hs, cpus: r.size - hs,
      seconds: Math.round((now() - match.startedAt) / 1000), simSeconds: Math.round(match.m.time?.() ?? 0), rounds: match.roundSecs.length, roundSecs: match.roundSecs, outs: match.outs, endedEarly: !!early });
  }
  function finishMatch() {
    const result = match.m.result();
    playedReport(false); matchesPlayed++;
    const others = arenas.filter(a => a.id !== match.arena).map(a => a.id);
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    results = { result, arena: match.arena, mode: match.mode, choices: [...others.slice(0, 2), match.arena], votes: new Map(), endsAt: now() + TIMES.RESULTS_MS, doneAt: null, ratedBy: new Map() };
    phase = 'results';
    cast({ t: 'over', result, arena: match.arena, mode: match.mode });
    match = null; sync();
  }
  function finishVote() {
    if (!results) return;
    const count = results.choices.map((_, i) => [...results.votes.values()].filter(v => v === i).length);
    const best = Math.max(...count), tied = results.choices.map((_, i) => i).filter(i => count[i] === best);
    const win = tied[Math.floor(rng() * tied.length)];
    report('vote', { offered: results.choices.map((a, i) => ({ arena: a, game: a, votes: count[i] })), pick: results.choices[win], voters: results.votes.size });
    const arena = results.choices[win];
    const why = startMatch(arena);
    if (why) { results = null; phase = 'lobby'; cast({ t: 'note', msg: why }); sync(); }
  }
  function backToLobby() {
    if (match) { playedReport(true); matchesPlayed++; }
    if (matchesPlayed) report('final', { matches: matchesPlayed });
    matchesPlayed = 0; match = null; results = null; phase = 'lobby';
    for (const p of players) p.ready = false;
    cast({ t: 'lobby' }); sync();
  }

  // ---------------------------------------------------------------- messages from a device
  function message(d, msg) {
    const isHost = d.id === host;
    switch (msg.t) {
      case 'locals': return setLocals(d, msg.list);
      case 'ready': { const p = ownPlayer(d, msg.local); if (p) { p.ready = msg.on; sync(); } return; }
      case 'opt': {
        if (!isHost) return err(d, 'host', 'Only the host can change the game.');
        const { key, value } = msg;
        if (key === 'mode' && modes.some(m => m.id === value)) opts.mode = value;
        else if (key === 'arena' && (value === '*' || arenas.some(a => a.id === value))) opts.arena = value;
        else if (key === 'rounds' && ROUNDS.includes(value)) opts.rounds = value;
        else if (key === 'difficulty' && LEVELS.includes(value)) { opts.difficulty = value; for (const p of players) if (p.cpu) p.level = value; }
        else if (key === 'public' && typeof value === 'boolean') opts.public = value;
        else return;
        return sync();
      }
      case 'cpu': {
        if (!isHost) return err(d, 'host', 'Only the host can add CPU players.');
        if (msg.add === true) {
          const seat = seatFree(); if (seat < 0) return err(d, 'full', `This room is full (${MAX_FIGHTERS} fighters).`);
          players.push({ pid: seat + 1, seat, dev: null, local: null, cpu: true, level: opts.difficulty, team: seat % 2, ready: true, name: 'CPU ' + CPU_NAMES[seat % CPU_NAMES.length], look: { race: ['human', 'elf', 'dwarf', 'halfling'][seat % 4], seed: Math.floor(rng() * 1e9) }, input: null, latch: 0 });
          return sync();
        }
        const i = players.findIndex(p => p.pid === msg.pid && p.cpu); if (i < 0) return;
        if (msg.level && LEVELS.includes(msg.level)) players[i].level = msg.level;
        else if (msg.add === false) players.splice(i, 1);
        return sync();
      }
      case 'team': {
        const p = players.find(x => x.pid === msg.pid); if (!p) return;
        if (!isHost && p.dev !== d.id) return;
        p.team = (p.team + 1) % Math.min(4, Math.max(2, players.length));
        return sync();
      }
      case 'start': {
        if (!isHost) return err(d, 'host', 'Only the host can start.');
        if (phase === 'match') return;
        const why = startMatch(); if (why) err(d, 'start', why);
        return;
      }
      case 'end': { if (!isHost) return err(d, 'host', 'Only the host can end the match.'); return backToLobby(); }
      case 'in': {
        if (!match) return;
        for (const row of msg.p) {
          if (!Array.isArray(row) || row.length !== 4) continue;
          const [local, mx, mz, bits] = row;
          if (!Number.isInteger(local) || !Number.isInteger(bits) || typeof mx !== 'number' || typeof mz !== 'number' || !Number.isFinite(mx) || !Number.isFinite(mz)) continue;
          const p = ownPlayer(d, local); if (!p || !match.roster.has(p.pid)) continue;
          const b = bits & 63;
          p.input = { mx: Math.max(-1, Math.min(1, mx)), mz: Math.max(-1, Math.min(1, mz)), b, at: now() };
          p.latch |= b;            // a press that went down and up between two steps still counts for one step
        }
        return;
      }
      case 'rate': {
        if (!results || (msg.v !== 1 && msg.v !== -1)) return;
        const who = humans().filter(p => p.dev === d.id).length || 1;
        results.ratedBy.set(d.id, true);
        report('rate', { arena: results.arena, game: results.arena, mode: results.mode, v: msg.v, why: cleanReasons(msg.v, msg.why), players: who, voter: `${serial}:${d.id}:${matchesPlayed}` });
        return;
      }
      case 'vote': {
        if (!results || !Number.isInteger(msg.i) || msg.i < 0 || msg.i >= results.choices.length) return;
        const p = ownPlayer(d, msg.local); if (!p) return;
        results.votes.set(p.pid, msg.i);
        const voters = humans().filter(x => devices.get(x.dev)?.connected);
        results.doneAt = voters.every(x => results.votes.has(x.pid)) ? now() + TIMES.VOTE_DONE_MS : null;
        cast({ t: 'votes', votes: Object.fromEntries(results.votes) });
        return;
      }
      case 'go': { if (!isHost) return; if (results) finishVote(); return; }
    }
  }

  // ---------------------------------------------------------------- the clock
  /** One sim step (1/60 s). Called STEP_HZ times a second by the hub. */
  function step() {
    const t = now();
    for (const d of [...devices.values()]) if (!d.connected && d.goneAt != null && t - d.goneAt > GONE_MS) remove(d);
    if (phase === 'match' && match) {
      const t0 = performance.now();
      const m = match.m;
      for (const p of players) {
        if (p.cpu || !match.roster.has(p.pid)) continue;
        const inp = p.input && t - p.input.at < TIMES.INPUT_STALE_MS ? p.input : null;
        if (!inp && !p.latch) continue;
        m.input(p.pid, fromBits((inp?.b || 0) | p.latch, inp?.mx || 0, inp?.mz || 0));
        p.latch = 0;
      }
      m.step(1 / 60);
      if (m.events.length) { const evs = m.events.splice(0, m.events.length); watchEvents(evs); match.events.push(...evs); }
      match.tick++;
      if (match.tick % SNAP_EVERY === 0 || m.over) {
        const bytes = match.packer.pack(m.snapshot(), match.tick, match.events);
        match.events = []; stats.snaps++;
        castBin(bytes);
      }
      stats.stepMs += performance.now() - t0; stats.steps++;
      if (m.over) finishMatch();
    } else if (phase === 'results' && results) {
      if ((results.doneAt && t >= results.doneAt) || t >= results.endsAt) finishVote();
    }
  }

  /** "Find a game": a public room's card (never a name or a token). */
  function listing() {
    if (!opts.public || ![...devices.values()].some(d => d.connected)) return null;
    const h = players.find(p => p.dev === host && !p.cpu);
    return { code, phase, players: players.length, humans: humans().length, seats: MAX_FIGHTERS, mode: opts.mode, arena: match?.arena || opts.arena, hostName: h?.name || null };
  }
  return {
    code, join, disconnect, remove, message, step, listing, stats,
    get devices() { return devices; }, get players() { return players; }, get phase() { return phase; }, get host() { return host; }, get opts() { return opts; },
    get match() { return match; }, get results() { return results; },
    get size() { return devices.size; },
    get emptyFor() { return emptySince == null ? 0 : now() - emptySince; },
    close() { if (match) { playedReport(true); matchesPlayed++; } if (matchesPlayed) report('final', { matches: matchesPlayed }); match = null; },
  };
}
