// One co-op room: up to 4 frames (people + bots) flying the host's missions together. Pure — no sockets, no timers:
// the hub hands it messages and calls step() 30 times a second; tests drive it with fake sockets.
//
// Phases: lobby (pick a mission, ready up) → loading (every device draws the city) → mission (the server runs the
// sim and sends snapshots) → back to lobby with each player's result. Drop in: someone joining mid-mission loads and
// lands beside the team. Drop out: a lost connection keeps its seat (a bot flies the frame meanwhile); leaving or
// being removed takes the frame out. Host leaves → the next person is host.
import { cleanBuild, cleanName, unpackInput, mergePresses, clearPresses, MAX_SEATS, AWAY_MS, LOAD_WAIT_MS, SNAP_EVERY, STEP_HZ } from '../js/net/protocol.js';
import { createPacker, packMe, packEvents } from '../js/net/snap.js';
import { createMission, stepMission, addPlayer, removePlayer } from '../js/sim/mission.js';
import { buildMissionDef } from '../js/sim/missiondef.js';
import { frameFor, asItems } from '../js/net/mirror.js';
import { contractsFor } from '../js/sim/campaign.js';
import { botInput, botBuild, botName } from '../js/sim/bots.js';

const DT = 1 / STEP_HZ;
export const TIMES = { EMPTY_MS: 60000 };

export function createRoom({ code, serial = 0, now = () => Date.now(), seed = 1, data, log = () => {} }) {
  const seats = [];                 // { pid, token, name, rank, build, ready, host, away, awayAt, send, loaded, inputs, last, ack, needFull, votes }
  const kicked = new Set();
  const opts = { public: false, bots: 0 };
  let phase = 'lobby', pick = null, cp = null, S = null, packer = null, tick = 0, loadUntil = 0, evBuf = [], emptySince = null, nextPid = 1;
  const stats = { steps: 0, stepMs: 0, bytesOut: 0 };

  const humans = () => seats.filter(s => !s.gone);
  const send = (seat, obj) => { if (!seat.send || seat.away) return; const d = typeof obj === 'string' ? obj : JSON.stringify(obj); stats.bytesOut += d.length; seat.send(d); };
  const all = obj => { const d = JSON.stringify(obj); for (const s of seats) send(s, d); };
  const hostSeat = () => seats.find(s => s.host);

  function frameLabel(b) { const core = b && data.P[b.core?.id]; return b?.name || (core ? core.name : ''); }
  function roomMsg(seat) {
    return { t: 'room', code, phase, you: seat.pid, host: hostSeat()?.pid || null, public: opts.public, bots: opts.bots,
      seats: seats.map(s => ({ pid: s.pid, name: s.name, rank: s.rank, frame: frameLabel(s.build), ready: s.ready, host: s.host, away: s.away, hasBuild: !!s.build, loaded: s.loaded, votes: s.votes.size })),
      pick: pick ? { label: pick.m.name, story: pick.story || null, contract: pick.contract ?? null, tier: pick.m.tier || 1, type: pick.m.type || null, district: pick.m.district || null, brief: pick.m.brief || '', stages: pick.m.stages?.map(s => s.label) || null, checkpoint: cp ? { stage: cp.stage, label: cp.label } : null } : null,
      mission: S ? { time: Math.round(S.time), phase: S.phase } : null };
  }
  const announce = () => { for (const s of seats) send(s, roomMsg(s)); };

  // ---- seats -------------------------------------------------------------------------------------------------
  function join({ token, send: sendFn }) {
    if (kicked.has(token)) { sendFn(JSON.stringify({ t: 'err', code: 'kicked', msg: 'You were removed from this room.' })); return null; }
    let seat = seats.find(s => s.token === token);
    if (seat) { seat.send = sendFn; seat.away = false; seat.awayAt = 0; seat.needFull = phase === 'mission' && seat.loaded; }
    else {
      if (seats.length >= MAX_SEATS) { sendFn(JSON.stringify({ t: 'err', code: 'full', msg: 'That room is full (4 pilots).' })); return null; }
      seat = { pid: 'p' + (nextPid++), token, name: 'Pilot', rank: 1, build: null, ready: false, host: !seats.length, away: false, awayAt: 0, send: sendFn, loaded: false, inputs: [], last: null, ack: 0, needFull: false, votes: new Set() };
      seats.push(seat);
      log('room.join', { code, pid: seat.pid });
    }
    emptySince = null;
    send(seat, roomMsg(seat));
    if (phase !== 'lobby' && seat.build) sendStart(seat);       // back after a nap, or dropping in with a frame ready
    announce();
    return { id: seat.pid };
  }

  function dropSeat(seat, why) {
    const i = seats.indexOf(seat); if (i < 0) return;
    seats.splice(i, 1);
    if (S && S.players.some(p => p.id === seat.pid)) { simEvents(() => removePlayer(S, seat.pid)); rosterAll(); }
    if (seat.host && seats.length) { seats[0].host = true; log('room.host', { code, pid: seats[0].pid }); }
    for (const s of seats) s.votes.delete(seat.pid);
    log('room.leave', { code, pid: seat.pid, why });
    if (!seats.length) emptySince = now();
    announce();
  }
  function remove(dev) { const s = seats.find(x => x.pid === dev.id); if (s) dropSeat(s, 'left'); }
  function disconnect(dev) {
    const s = seats.find(x => x.pid === dev.id); if (!s) return;
    s.away = true; s.awayAt = now(); s.send = null;
    if (!seats.some(x => !x.away)) emptySince = now();
    announce();
  }

  // ---- messages ----------------------------------------------------------------------------------------------
  function message(dev, msg) {
    const seat = seats.find(x => x.pid === dev.id); if (!seat) return;
    const isHost = seat.host;
    switch (msg.t) {
      case 'me': {
        const rank = Math.max(1, Math.min(99, msg.rank));
        const b = cleanBuild(msg.build, data.P, data.CHIPS, data.SLOTS, rank);
        if (!b) return send(seat, { t: 'err', code: 'build', msg: 'That frame is missing a part. Fix it in the hangar.' });
        seat.name = cleanName(msg.name) || seat.name; seat.rank = rank; seat.build = b;
        if (phase !== 'lobby' && !seat.loaded) sendStart(seat);
        return announce();
      }
      case 'ready': if (phase === 'lobby' && seat.build) { seat.ready = msg.on; announce(); } return;
      case 'opt':
        if (!isHost) return;
        if (msg.key === 'public' && typeof msg.value === 'boolean') opts.public = msg.value;
        if (msg.key === 'bots' && Number.isInteger(msg.value)) opts.bots = Math.max(0, Math.min(MAX_SEATS - 1, msg.value));
        return announce();
      case 'pick': {
        if (!isHost || phase !== 'lobby') return;
        const m = pickMission(msg); if (!m) return send(seat, { t: 'err', code: 'pick', msg: 'That mission could not be found.' });
        pick = m; cp = null; for (const s of seats) if (!s.host) s.ready = false;
        return announce();
      }
      case 'start': {
        if (!isHost || phase !== 'lobby') return;
        if (!pick) return send(seat, { t: 'err', code: 'nopick', msg: 'Pick a mission first.' });
        if (!seat.build) return send(seat, { t: 'err', code: 'build', msg: 'Your frame is not ready.' });
        const waiting = seats.filter(s => s !== seat && !s.away && (!s.build || !s.ready));
        if (waiting.length) return send(seat, { t: 'err', code: 'ready', msg: `Waiting for ${waiting.map(s => s.name).join(', ')} to be ready.` });
        return launch(msg.fromCheckpoint && cp ? cp : null);
      }
      case 'loaded': {
        if (phase === 'lobby' || seat.loaded || !S) return;
        seat.loaded = true;
        if (!S.players.some(p => p.id === seat.pid)) {          // dropping in: a frame lands beside the team
          const bot = S.players.find(p => p.bot);
          if (S.players.length >= MAX_SEATS && bot) simEvents(() => removePlayer(S, bot.id));
          if (S.players.length < MAX_SEATS) { simEvents(() => addPlayer(S, { id: seat.pid, mech: frameFor(data, seat.pid, seat.build, seat.name), rank: seat.rank })); rosterAll(); }
        }
        if (phase === 'mission') seat.needFull = true;
        announce();
        return;
      }
      case 'in': {
        if (phase !== 'mission') return;
        const inp = unpackInput(msg.i); if (!inp) return;
        seat.inputs.push([msg.s, inp]); if (seat.inputs.length > 8) { const old = seat.inputs.shift(); mergePresses(seat.inputs[0][1], old[1]); }
        return;
      }
      case 'kick': {
        const t = seats.find(s => s.pid === msg.pid); if (!t || t === seat) return;
        if (isHost) return kick(t);
        return;
      }
      case 'vote': {
        const t = seats.find(s => s.pid === msg.pid); if (!t || t === seat) return;
        t.votes.add(seat.pid);
        const voters = seats.filter(s => s !== t && !s.away).length;
        if (t.votes.size * 2 > voters) return kick(t);
        return announce();
      }
      case 'end': if (isHost && phase !== 'lobby') { all({ t: 'ended', why: 'The host called the team back.' }); toLobby(); } return;
    }
  }
  function kick(t) { kicked.add(t.token); send(t, { t: 'kicked', msg: 'You were removed from the room.' }); dropSeat(t, 'kicked'); }

  /** The host's choice → a mission object. Story: by id. Contract: rebuilt here from the host's board (same rules,
   *  same seed as the host's browser), so nobody can send the server a made-up mission. */
  function pickMission(msg) {
    if (msg.story) { const m = data.MISSIONS.find(x => x.id === msg.story && !x.test); return m ? { story: m.id, m } : null; }
    if (msg.contract != null) {
      const grades = {}; for (const [k, v] of Object.entries(msg.grades || {}).slice(0, 40)) if (data.MISSIONS.some(m => m.id === k) && /^[SABCD]$/.test(v)) grades[k] = v;
      const board = contractsFor({ played: Math.max(0, msg.played | 0), grades }, data.CAMP, data.MAKERS);
      const m = board[msg.contract]; return m ? { contract: msg.contract, m } : null;
    }
    return null;
  }

  // ---- a mission ---------------------------------------------------------------------------------------------
  function rosterOf() {
    return S.players.map(p => ({ pid: p.id, mid: p.mech.id, name: p.mech.name, bot: !!p.bot, build: p.mech.build, rank: p.rank || 1 }));
  }
  /** Events the sim makes between steps (someone dropping in or out) go out with the next snapshot. */
  function simEvents(fn) { const n = S.events.length, r = fn(); evBuf.push(...S.events.slice(n)); return r; }
  function rosterAll() { if (S) all({ t: 'roster', roster: rosterOf() }); }
  function sendStart(seat) { if (!S || !pick) return; send(seat, { t: 'start', mission: pick.m, roster: rosterOf(), you: seat.pid, seed: S.seed, checkpoint: S.startCp || null }); }

  function launch(fromCp = null) {
    const def = buildMissionDef(pick.m);
    const players = [];
    for (const s of seats) if (s.build) { players.push({ id: s.pid, mech: frameFor(data, s.pid, s.build, s.name), rank: s.rank }); s.loaded = false; s.inputs = []; s.last = null; s.ack = 0; s.owed = 0; s.missed = 0; s.ready = false; }
    for (let i = 0; i < opts.bots && players.length < MAX_SEATS; i++) {
      const id = 'b' + (i + 1), b = asItems(botBuild(data.PARTS, data.MAKERS, i + serial));
      players.push({ id, bot: true, mech: frameFor(data, id, b, botName(i + serial)), rank: 1 });
    }
    S = createMission(def, { kinds: data.KINDS, T: data.T, players, seed: def.seed, checkpoint: fromCp });
    S.startCp = fromCp;                     // late joiners build the same mission from the same checkpoint
    packer = createPacker(); tick = 0; evBuf = [];
    phase = 'loading'; loadUntil = now() + LOAD_WAIT_MS;
    log('room.launch', { code, mission: pick.m.id, players: players.length });
    for (const s of seats) if (s.build) sendStart(s);
    announce();
  }

  function toLobby() { phase = 'lobby'; S = null; packer = null; for (const s of seats) { s.loaded = false; s.ready = false; } announce(); }

  function step() {
    // seats that have been away too long give their place up
    const t = now();
    for (const s of [...seats]) if (s.away && t - s.awayAt > (phase === 'lobby' ? AWAY_MS.lobby : AWAY_MS.mission)) dropSeat(s, 'away');
    if (phase === 'loading') {
      const humansIn = seats.filter(s => S.players.some(p => p.id === s.pid));
      if (humansIn.every(s => s.loaded || s.away) || t > loadUntil) { phase = 'mission'; for (const s of seats) if (s.loaded) s.needFull = true; announce(); }
      else return;
    }
    if (phase !== 'mission') return;
    const t0 = performance.now();
    const inputs = {};
    for (const p of S.players) {
      if (p.bot) continue;
      const s = seats.find(x => x.pid === p.id);
      if (!s || s.away || !s.loaded) { inputs[p.id] = botInput(S, p.mech, DT); continue; }   // a bot flies it while they're gone
      // during the drop nobody can move: keep only the newest two inputs, a cushion for a jittery line once the fight starts
      if (S.phase === 'drop') { while (s.inputs.length > 2) { const [seq, inp] = s.inputs.shift(); s.ack = seq; mergePresses(s.inputs[0][1], inp); } inputs[p.id] = {}; continue; }
      // one input a step. An input that comes late is stood in for by the last one ("owed"); when it arrives it counts
      // as already used, so the server and the browser's prediction agree on how many steps the frame has moved.
      while (s.owed > 0 && s.inputs.length) { const [seq, inp] = s.inputs.shift(); s.ack = seq; s.owed--; if (s.inputs.length) mergePresses(s.inputs[0][1], inp); }
      let use = null;
      if (s.inputs.length) { const [seq, inp] = s.inputs.shift(); use = inp; s.ack = seq; while (s.inputs.length > 4) { const [sq, more] = s.inputs.shift(); use = mergePresses(more, use); s.ack = sq; } }
      if (use) { s.last = use; s.missed = 0; inputs[p.id] = use; }
      else { s.missed = (s.missed || 0) + 1; if (s.missed <= 8 && s.last) { inputs[p.id] = clearPresses(s.last); s.owed = (s.owed || 0) + 1; } else { inputs[p.id] = {}; s.owed = 0; } }
    }
    const ev = stepMission(S, inputs, DT);
    for (const e of ev) evBuf.push(e);
    tick++; stats.steps++;
    if (tick % SNAP_EVERY === 0 || S.result) {
      const shared = packer.pack(S); shared.ev = packEvents(evBuf); evBuf = [];
      const body = JSON.stringify(shared).slice(1);
      let full = null;
      for (const s of seats) {
        if (!s.loaded || s.away) continue;
        const me = packMe(S, s.pid, s.ack);
        if (s.needFull) { full ||= JSON.stringify({ ...packer.pack(S, { full: true }), ev: [] }).slice(1); send(s, `{"t":"s","me":${JSON.stringify(me)},${full}`); s.needFull = false; }
        else send(s, `{"t":"s","me":${JSON.stringify(me)},${body}`);
      }
    }
    stats.stepMs += performance.now() - t0;
    if (S.result) {
      const result = S.result;
      cp = !result.won && S.checkpoint ? S.checkpoint : null;     // a long mission lost: the host can launch it again from here
      for (const s of seats) send(s, { t: 'result', result, mission: pick.m, you: s.pid });
      log('room.result', { code, won: result.won, grade: result.grade });
      toLobby();
    }
  }

  function listing() {
    if (!opts.public) return null;
    return { code, host: hostSeat()?.name || '', players: seats.length, seats: MAX_SEATS, phase, mission: pick?.m.name || null };
  }
  return {
    join, remove, disconnect, message, step, listing, kick,
    close() { for (const s of seats) send(s, { t: 'closed' }); seats.length = 0; },
    get size() { return seats.length; },
    get emptyFor() { return seats.some(s => !s.away) ? 0 : emptySince ? now() - emptySince : 0; },
    get phase() { return phase; }, get S() { return S; }, opts, seats, stats, devices: { has: id => seats.some(s => s.pid === id) },
  };
}
