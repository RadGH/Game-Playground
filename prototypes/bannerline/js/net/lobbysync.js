// Online lobby (PLAN §11.6, §12): one room = one host machine + up to 5 more. The host owns the room
// state and every change goes through it; clients send requests and render what the host broadcasts.
// Couch players (several local seats on one machine), remote players and AI seats mix freely.
// Stream B's lobby UI calls this API; it never touches the transport.
//
//   const room = await createRoom({ transport, name, dataHash, clock?, code?, roomMode? })     // host
//   const room = await joinRoom({ transport, code, name, dataHash, clock?, timeoutMs? })   // client
//   room.code, room.isHost, room.me, room.state                    (read-only plain data, below)
//   room.on('change' | 'start' | 'lobby' | 'error' | 'closed', fn) → unsubscribe
//   host:   room.configure({ mode, format, map })   room.setSlot(key, { kind: 'open'|'ai'|'closed', difficulty })
//           room.kick(machineId)   room.start({ seed }) → start packet   room.backToLobby()
//   anyone: room.claim(key, { local, name, race, hero, device })   room.update(key, { race, hero, name })
//           room.release(key)   room.ready(key, bool)   room.leave()
//   then:   const match = beginMatch(room, packet, { data, createSim, restoreSim, now, onEvent, rejoin? })
//           (a rejoining client passes rejoin = room.rejoin from joinRoom({ ..., rejoinToken }))
//           → { sim, lockstep, localPlayers: [{ pid, local, device, name }], packet }
//
// room.state = {
//   code, hostId, phase: 'lobby' | 'match',
//   mode, format, map,
//   slots: [{ key, team, index, kind: 'open' | 'human' | 'ai' | 'closed', owner (machine id | null),
//             local (seat on the owner machine), name, race, hero, device, ready, difficulty }],
//   machines: [{ id, name, ping, hidden, host }],
// }
// A slot of kind 'human' whose owner === room.me is one of THIS machine's local seats.
//
// MODE-AWARE: the slot list, what a free slot falls back to, who may claim what, the start check and
// the sim players come from a ROOM MODE (`roomMode`, default LINE_WAR_ROOM below). Hunters vs Farmers
// passes its own (js/ui/hvf/online.js `hvfRoomMode(rules)`: farmer/hunter seats that default to AI).
// A room mode: { formats: [ids], slots(format, old) -> slots, vacant(slot) (reset a freed slot in place),
//   claimable(slot) -> bool, check(slots) -> null | reason (why the match cannot start),
//   players(usedSlots) -> sim players[], config?(state) -> extra config fields }

import { NetError, NET_MESSAGES, newRoomCode } from './transport.js';
import { delayFor, createLockstep } from './lockstep.js';

const MAX_MACHINES = 6;
const PING_MS = 1000;
const FORMAT_SIZE = { '1v1': 1, '2v2': 2, '3v3': 3 };
const realClock = { now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: id => clearTimeout(id), setInterval: (f, ms) => setInterval(f, ms), clearInterval: id => clearInterval(id) };

/** Line war: two teams of 1-3, empty slots are 'open' (no player), race + hero per slot. */
export const LINE_WAR_ROOM = {
  formats: Object.keys(FORMAT_SIZE),
  slots: (format, old) => makeSlots(format, old),
  vacant: s => Object.assign(s, { kind: 'open', owner: null, name: '', ready: false, device: null }),
  claimable: s => s.kind === 'open',
  check(slots) {
    const used = slots.filter(s => s.kind === 'human' || s.kind === 'ai');
    for (const team of [0, 1]) if (!used.some(s => s.team === team)) return `team ${team + 1} has nobody: take a seat or add an AI`;
    return null;
  },
  players: used => used.map(s => s.kind === 'ai'
    ? { team: s.team, kind: 'ai', ai: { difficulty: s.difficulty }, race: s.race, hero: s.hero, name: s.name || 'AI' }
    : { team: s.team, kind: 'human', race: s.race, hero: s.hero, name: s.name }),
  config: state => ({ map: state.map }),
};

function makeSlots(format, old = []) {
  const n = FORMAT_SIZE[format] || 1, out = [];
  for (let team = 0; team < 2; team++) for (let index = 0; index < n; index++) {
    const key = `${team}-${index}`;
    const prev = old.find(s => s.key === key);
    out.push(prev ? { ...prev } : { key, team, index, kind: 'open', owner: null, local: 0, name: '', race: 'freeholds', hero: 'warrior', device: null, ready: false, difficulty: 'veteran' });
  }
  return out;
}

function emitter() {
  const fns = {};
  return {
    on(ev, fn) { (fns[ev] = fns[ev] || []).push(fn); return () => { fns[ev] = fns[ev].filter(f => f !== fn); }; },
    emit(ev, x) { for (const f of fns[ev] || []) f(x); },
  };
}

const clone = o => JSON.parse(JSON.stringify(o));

/** Host: open a room. Retries with a new code when the broker says the code is taken. */
export async function createRoom({ transport, name = 'Host', dataHash, clock = realClock, code, mode = 'linewar', format = '1v1', map = 'vale', roomMode = LINE_WAR_ROOM }) {
  const RM = roomMode;
  let tries = 0;
  for (;;) {
    const c = code || newRoomCode();
    try { await transport.host(c); code = c; break; } catch (e) {
      if (e.code === 'taken' && !code && tries++ < 5) continue;
      throw e;
    }
  }
  const ev = emitter();
  const state = { code, hostId: transport.id, phase: 'lobby', mode, format, map, slots: RM.slots(format, []), machines: [{ id: transport.id, name, ping: 0, hidden: false, host: true }] };
  const pingsOut = new Map();
  let lastPacket = null, tokens = new Map();

  const push = () => { transport.broadcast({ t: 'l:state', state }); ev.emit('change', clone(state)); };
  const refuse = (to, code2) => transport.send(to, { t: 'l:error', code: code2, message: NET_MESSAGES[code2] || code2 });
  const machine = id => state.machines.find(m => m.id === id);

  function freeSlotsOf(id) { for (const s of state.slots) if (s.owner === id) RM.vacant(s); }

  // requests from any machine, the host's own included (applied directly)
  function request(from, msg) {
    const s = msg.key != null ? state.slots.find(x => x.key === msg.key) : null;
    switch (msg.t) {
      case 'l:claim':
        if (!s || !RM.claimable(s) || state.phase !== 'lobby') return 'taken';
        Object.assign(s, { kind: 'human', owner: from, local: msg.local | 0, name: String(msg.name || machine(from)?.name || 'Player').slice(0, 24), race: msg.race || s.race, hero: msg.hero || s.hero, device: msg.device || null, ready: false });
        return null;
      case 'l:update':
        if (!s || s.owner !== from) return 'bad';
        for (const k of ['race', 'hero', 'name', 'device']) if (msg[k] != null) s[k] = k === 'name' ? String(msg[k]).slice(0, 24) : msg[k];
        s.ready = false;
        return null;
      case 'l:release':
        if (!s || s.owner !== from) return 'bad';
        RM.vacant(s);
        return null;
      case 'l:ready':
        if (!s || s.owner !== from) return 'bad';
        s.ready = !!msg.ready;
        return null;
      default: return 'bad';
    }
  }

  transport.onMessage((from, msg) => {
    if (!msg || typeof msg.t !== 'string' || !msg.t.startsWith('l:')) return;
    if (msg.t === 'l:hello') {
      if (msg.dataHash !== dataHash) { refuse(from, 'version'); return; }
      if (msg.rejoinToken && state.phase === 'match' && lastPacket) {
        const m = lastPacket.machines.find(x => x.token === msg.rejoinToken);
        if (!m) { refuse(from, 'no-room'); return; }
        transport.send(from, { t: 'l:welcome', state, rejoin: { packet: lastPacket, machine: m } });
        return;
      }
      if (state.machines.length >= MAX_MACHINES) { refuse(from, 'full'); return; }
      if (!machine(from)) state.machines.push({ id: from, name: String(msg.name || 'Player').slice(0, 24), ping: 0, hidden: false, host: false });
      transport.send(from, { t: 'l:welcome', state });
      push();
      return;
    }
    if (msg.t === 'l:pong') { const at = pingsOut.get(from); const m = machine(from); if (at != null && m) { const rtt = Math.round(clock.now() - msg.at); if (Math.abs(rtt - m.ping) > 10) { m.ping = rtt; push(); } else m.ping = rtt; } return; }
    if (msg.t === 'l:vis') { const m = machine(from); if (m) { m.hidden = !!msg.hidden; push(); } return; }
    if (!machine(from)) return;
    const why = request(from, msg);
    if (why) refuse(from, why); else push();
  });
  transport.onPeer(e => {
    if (e.type !== 'leave') return;
    if (state.phase === 'lobby') { freeSlotsOf(e.id); state.machines = state.machines.filter(m => m.id !== e.id); push(); }
    else { const m = machine(e.id); if (m) { m.left = true; push(); } }
  });
  const pinger = clock.setInterval(() => {
    for (const m of state.machines) if (!m.host) { const at = clock.now(); pingsOut.set(m.id, at); transport.send(m.id, { t: 'l:ping', at }); }
  }, PING_MS);

  const room = {
    code, isHost: true, get me() { return transport.id; }, transport, get state() { return clone(state); }, on: ev.on,
    configure({ mode: md, format: fm, map: mp } = {}) {
      if (state.phase !== 'lobby') return;
      if (md) state.mode = md;
      if (fm && RM.formats.includes(fm)) { state.format = fm; state.slots = RM.slots(fm, state.slots); }
      if (mp) state.map = mp;
      for (const s of state.slots) s.ready = false;
      push();
    },
    setSlot(key, { kind, difficulty } = {}) {
      const s = state.slots.find(x => x.key === key);
      if (!s || state.phase !== 'lobby') return;
      if (kind && ['open', 'ai', 'closed'].includes(kind)) Object.assign(s, { kind, owner: null, name: kind === 'ai' ? 'AI' : '', ready: kind === 'ai' });
      if (difficulty) s.difficulty = difficulty;
      push();
    },
    kick(id) { if (id === transport.id) return; refuse(id, 'kicked'); freeSlotsOf(id); state.machines = state.machines.filter(m => m.id !== id); push(); },
    claim(key, o = {}) { const why = request(transport.id, { t: 'l:claim', key, ...o }); if (!why) push(); return why; },
    update(key, o = {}) { const why = request(transport.id, { t: 'l:update', key, ...o }); if (!why) push(); return why; },
    release(key) { const why = request(transport.id, { t: 'l:release', key }); if (!why) push(); return why; },
    ready(key, r = true) { const why = request(transport.id, { t: 'l:ready', key, ready: r }); if (!why) push(); return why; },
    /** Check and start: every human seat ready, at least one human. Returns the packet (also sent to all). */
    start({ seed, startIn = 3000, tickMs = 50 } = {}) {   // tickMs < 50 = debug speed (tests); everyone runs the packet's tickMs
      if (state.phase !== 'lobby') throw new NetError('bad', 'already in a match');
      const humans = state.slots.filter(s => s.kind === 'human');
      if (!humans.length) throw new NetError('bad', 'nobody has taken a seat');
      const notReady = humans.filter(s => !s.ready);
      if (notReady.length) throw new NetError('not-ready', `${notReady.map(s => s.name || s.key).join(', ')} not ready`);
      // checked BEFORE the phase changes: a config the sim refuses would throw on every machine after the
      // host had already switched to 'match', leaving the room stuck
      const why = RM.check(state.slots, state);
      if (why) throw new NetError('bad', why);
      const used = state.slots.filter(s => s.kind === 'human' || s.kind === 'ai');
      const players = RM.players(used);
      const owners = [];
      for (const m of state.machines) {
        const mine = used.map((s, pid) => ({ s, pid })).filter(x => x.s.kind === 'human' && x.s.owner === m.id).sort((a, b) => a.s.local - b.s.local);
        if (mine.length || m.host) owners.push({ id: m.id, name: m.name, players: mine.map(x => x.pid), locals: mine.map(x => ({ pid: x.pid, local: x.s.local, device: x.s.device, name: x.s.name })), token: m.host ? 'host' : `${code}-${m.id}-${Math.floor(Math.random() * 1e9)}` });
      }
      tokens = new Map(owners.map(o => [o.id, o.token]));
      const remote = state.machines.filter(m => !m.host && owners.some(o => o.id === m.id));
      const maxPing = remote.reduce((a, m) => Math.max(a, m.ping || 0), 0);
      const packet = {
        v: 1, seed: (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0, dataHash,
        config: { mode: state.mode, format: state.format, ...(RM.config ? RM.config(state) : {}), players },
        delay: delayFor(maxPing, tickMs, remote.length > 0), tickMs, startIn, hostId: transport.id, machines: owners,
      };
      packet.config.seed = packet.seed;
      lastPacket = packet;
      state.phase = 'match';
      transport.broadcast({ t: 'l:start', packet });
      push();
      ev.emit('start', packet);
      return packet;
    },
    backToLobby() {
      state.phase = 'lobby';
      for (const s of state.slots) if (s.kind === 'human') s.ready = false;
      state.machines = state.machines.filter(m => !m.left);
      for (const s of state.slots) if (s.owner && !state.machines.some(m => m.id === s.owner)) RM.vacant(s);
      transport.broadcast({ t: 'l:lobby' });
      push(); ev.emit('lobby', clone(state));
    },
    setHidden(h) { const m = machine(transport.id); if (m) { m.hidden = !!h; push(); } },
    leave() { clock.clearInterval(pinger); transport.close(); ev.emit('closed', {}); },
  };
  return room;
}

/** Client: join a room by code. Rejects with NetError('version' | 'full' | 'no-room' | 'timeout'). */
export function joinRoom({ transport, code, name = 'Player', dataHash, clock = realClock, timeoutMs = 10000, rejoinToken = null }) {
  return new Promise((resolve, reject) => {
    const ev = emitter();
    let state = null, settled = false, rejoinInfo = null;
    const fail = e => { if (!settled) { settled = true; reject(e); } else ev.emit('error', { code: e.code, message: e.message }); };
    const timer = clock.setTimeout(() => fail(new NetError('timeout', NET_MESSAGES.timeout)), timeoutMs);
    transport.onMessage((from, msg) => {
      if (!msg || typeof msg.t !== 'string' || !msg.t.startsWith('l:')) return;
      switch (msg.t) {
        case 'l:welcome':
          state = msg.state; rejoinInfo = msg.rejoin || null;
          if (!settled) { settled = true; clock.clearTimeout(timer); resolve(room); }
          ev.emit('change', clone(state));
          break;
        case 'l:state': state = msg.state; ev.emit('change', clone(state)); break;
        case 'l:error': fail(new NetError(msg.code, msg.message || NET_MESSAGES[msg.code] || msg.code)); break;
        case 'l:ping': transport.send(from, { t: 'l:pong', at: msg.at }); break;
        case 'l:start': ev.emit('start', msg.packet); break;
        case 'l:lobby': ev.emit('lobby', state && clone(state)); break;
        default: break;
      }
    });
    transport.onPeer(e => { if (e.type === 'leave' && e.id === transport.hostId) { ev.emit('error', { code: 'host-left', message: NET_MESSAGES['host-left'] }); ev.emit('closed', {}); } });
    const req = msg => transport.send(transport.hostId, msg);
    const room = {
      code, isHost: false, get me() { return transport.id; }, transport, get state() { return state && clone(state); }, on: ev.on,
      get rejoin() { return rejoinInfo; },
      claim(key, o = {}) { req({ t: 'l:claim', key, ...o }); },
      update(key, o = {}) { req({ t: 'l:update', key, ...o }); },
      release(key) { req({ t: 'l:release', key }); },
      ready(key, r = true) { req({ t: 'l:ready', key, ready: r }); },
      setHidden(h) { req({ t: 'l:vis', hidden: !!h }); },
      leave() { transport.close(); ev.emit('closed', {}); },
    };
    transport.join(code).then(() => req({ t: 'l:hello', name, dataHash, rejoinToken })).catch(fail);
  });
}

/**
 * Turn a start packet into a running match on this machine: the sim (same seed and config
 * everywhere) and the lockstep. `startAt` is this machine's clock time for tick 0.
 */
export function beginMatch(room, packet, { data, createSim, restoreSim, now, onEvent, onTick, dump = false, transport, rejoin = null }) {
  if (packet.dataHash !== data.hash) throw new NetError('version', NET_MESSAGES.version);
  const me = room.me;
  const mine = packet.machines.find(m => m.id === me) || (rejoin && rejoin.machine) || null;
  const ping = (room.state?.machines.find(m => m.id === me)?.ping) || 0;
  const startAt = now() + packet.startIn - (room.isHost ? 0 : ping / 2);
  const restore = snap => restoreSim(snap, data);
  const sim = rejoin ? null : createSim(packet.config, data);
  const lockstep = createLockstep({ transport: transport || room.transport, sim, restore, isHost: room.isHost, me, hostId: packet.hostId, machines: packet.machines, delay: packet.delay, tickMs: packet.tickMs, startAt, onEvent, onTick, dump, rttMs: ping, rejoinToken: rejoin ? rejoin.machine.token : null });
  return { sim: lockstep.sim, lockstep, localPlayers: mine ? mine.locals.slice() : [], packet };
}
