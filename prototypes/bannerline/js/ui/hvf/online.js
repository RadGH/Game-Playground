// Hunters vs Farmers online room (stream H) on stream D's transport + lockstep. D's lobbysync is
// line-war shaped (team slots with race + hero, formats 1v1-3v3), so HvF keeps its own small room
// protocol here and hands the start packet to D's beginMatch — the lockstep, hash checks, resync,
// AI takeover on disconnect and the clock are all D's, unchanged.
//
//   const room = await hostHvfRoom({ transport, code?, name, dataHash, format })
//   const room = await joinHvfRoom({ transport, code, name, dataHash })
//   room.state = { code, format, seats: [{ key, role, index, kind: 'open'|'human'|'ai'|'closed', owner, local, name, device, ready, difficulty }], machines }
//   room.claim(key, { local, name, device })   room.release(key)   room.ready(key, bool)
//   host: room.configure({ format })   room.setSeat(key, { kind, difficulty })   room.start({ seed, tickMs, startIn }) -> packet
//   room.on('change' | 'start' | 'closed' | 'error', fn)
// Co-op works by seats: three machines each claim a farmer seat, the hunters are AI.

import { NetError, NET_MESSAGES, newRoomCode } from '../../net/transport.js';
import { delayFor } from '../../net/lockstep.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
function emitter() {
  const fns = {};
  return { on(ev, fn) { (fns[ev] = fns[ev] || []).push(fn); return () => { fns[ev] = fns[ev].filter((f) => f !== fn); }; }, emit(ev, x) { for (const f of fns[ev] || []) f(x); } };
}

export function seatsFor(rules, format, old = []) {
  const f = rules.formats[format], out = [];
  const add = (role, n) => { for (let i = 0; i < n; i++) { const key = `${role}-${i}`; const prev = old.find((s) => s.key === key); out.push(prev ? { ...prev } : { key, role, index: i, kind: 'ai', owner: null, local: 0, name: '', device: null, ready: true, difficulty: 'veteran' }); } };
  add('farmer', f.farmers); add('hunter', f.hunters);
  return out;
}

/** The sim players[] for a room's seats (the order is the packet's player ids). */
export function playersFromSeats(seats) {
  let colour = 0;
  return seats.filter((s) => s.kind === 'human' || s.kind === 'ai').map((s) => {
    const p = { role: s.role, kind: s.kind === 'human' ? 'human' : 'ai', name: s.name || (s.kind === 'ai' ? `${s.role === 'farmer' ? 'Farmer' : 'Hunter'} AI` : 'Player') };
    if (s.role === 'farmer') p.colour = colour++;
    if (s.kind === 'ai') p.ai = { difficulty: s.difficulty };
    return p;
  });
}

export async function hostHvfRoom({ transport, code, name = 'Host', dataHash, rules, format }) {
  for (let tries = 0; ; tries++) {
    const c = code || newRoomCode();
    try { await transport.host(c); code = c; break; } catch (e) { if (e.code === 'taken' && tries < 5 && !code) continue; throw e; }
  }
  const ev = emitter();
  const state = { code, mode: 'hvf', format, phase: 'lobby', seats: seatsFor(rules, format), machines: [{ id: transport.id, name, host: true, ping: 0 }] };
  const push = () => { transport.broadcast({ t: 'h:state', state }); ev.emit('change', clone(state)); };
  const machine = (id) => state.machines.find((m) => m.id === id);
  function request(from, msg) {
    const s = msg.key != null ? state.seats.find((x) => x.key === msg.key) : null;
    if (state.phase !== 'lobby') return 'bad';
    switch (msg.t) {
      case 'h:claim':
        if (!s || (s.kind !== 'open' && s.kind !== 'ai')) return 'taken';
        Object.assign(s, { kind: 'human', owner: from, local: msg.local | 0, name: String(msg.name || machine(from)?.name || 'Player').slice(0, 24), device: msg.device || null, ready: false });
        return null;
      case 'h:release': if (!s || s.owner !== from) return 'bad'; Object.assign(s, { kind: 'ai', owner: null, name: '', ready: true, device: null }); return null;
      case 'h:ready': if (!s || s.owner !== from) return 'bad'; s.ready = !!msg.ready; return null;
      default: return 'bad';
    }
  }
  transport.onMessage((from, msg) => {
    if (!msg || typeof msg.t !== 'string' || !msg.t.startsWith('h:')) return;
    if (msg.t === 'h:hello') {
      if (msg.dataHash !== dataHash) { transport.send(from, { t: 'h:error', code: 'version', message: NET_MESSAGES.version }); return; }
      if (state.machines.length >= 12) { transport.send(from, { t: 'h:error', code: 'full', message: NET_MESSAGES.full }); return; }
      if (!machine(from)) state.machines.push({ id: from, name: String(msg.name || 'Player').slice(0, 24), host: false, ping: 0 });
      transport.send(from, { t: 'h:welcome', state }); push(); return;
    }
    if (!machine(from)) return;
    const why = request(from, msg);
    if (why) transport.send(from, { t: 'h:error', code: why, message: why }); else push();
  });
  transport.onPeer((e) => {
    if (e.type !== 'leave') return;
    if (state.phase === 'lobby') { for (const s of state.seats) if (s.owner === e.id) Object.assign(s, { kind: 'ai', owner: null, name: '', ready: true }); state.machines = state.machines.filter((m) => m.id !== e.id); push(); }
  });
  const room = {
    code, isHost: true, me: transport.id, transport, get state() { return clone(state); }, on: ev.on,
    configure({ format: fm } = {}) { if (state.phase !== 'lobby' || !rules.formats[fm]) return; state.format = fm; state.seats = seatsFor(rules, fm, state.seats); push(); },
    setSeat(key, { kind, difficulty } = {}) {
      const s = state.seats.find((x) => x.key === key); if (!s || state.phase !== 'lobby' || s.kind === 'human') return;
      if (kind === 'ai' || kind === 'open') Object.assign(s, { kind, ready: kind === 'ai' });
      if (difficulty) s.difficulty = difficulty;
      push();
    },
    claim(key, o = {}) { const why = request(transport.id, { t: 'h:claim', key, ...o }); if (!why) push(); return why; },
    release(key) { const why = request(transport.id, { t: 'h:release', key }); if (!why) push(); return why; },
    ready(key, r = true) { const why = request(transport.id, { t: 'h:ready', key, ready: r }); if (!why) push(); return why; },
    start({ seed, startIn = 2000, tickMs = 50 } = {}) {
      const humans = state.seats.filter((s) => s.kind === 'human');
      if (!humans.length) throw new NetError('bad', 'nobody has taken a seat');
      const notReady = humans.filter((s) => !s.ready);
      if (notReady.length) throw new NetError('not-ready', `${notReady.map((s) => s.name || s.key).join(', ')} not ready`);
      if (state.seats.some((s) => s.kind === 'open')) throw new NetError('bad', 'every seat needs a player or an AI');
      const used = state.seats.filter((s) => s.kind === 'human' || s.kind === 'ai');
      const machines = [];
      for (const m of state.machines) {
        const mine = used.map((s, pid) => ({ s, pid })).filter((x) => x.s.kind === 'human' && x.s.owner === m.id).sort((a, b) => a.s.local - b.s.local);
        if (mine.length || m.host) machines.push({ id: m.id, name: m.name, players: mine.map((x) => x.pid), locals: mine.map((x) => ({ pid: x.pid, local: x.s.local, device: x.s.device, name: x.s.name })), token: m.host ? 'host' : `${code}-${m.id}-${Math.floor(Math.random() * 1e9)}` });
      }
      const remote = machines.filter((m) => m.id !== transport.id);
      const packet = {
        v: 1, seed: (seed ?? Math.floor(Math.random() * 4294967296)) >>> 0, dataHash,
        config: { mode: 'hvf', format: state.format, players: playersFromSeats(used) },
        delay: delayFor(0, tickMs, remote.length > 0), tickMs, startIn, hostId: transport.id, machines,
      };
      packet.config.seed = packet.seed;
      state.phase = 'match';
      transport.broadcast({ t: 'h:start', packet });
      push(); ev.emit('start', packet);
      return packet;
    },
    leave() { transport.close(); ev.emit('closed', {}); },
  };
  return room;
}

export function joinHvfRoom({ transport, code, name = 'Player', dataHash, timeoutMs = 10000 }) {
  return new Promise((resolve, reject) => {
    const ev = emitter();
    let state = null, settled = false;
    const fail = (e) => { if (!settled) { settled = true; reject(e); } else ev.emit('error', { code: e.code, message: e.message }); };
    const timer = setTimeout(() => fail(new NetError('timeout', NET_MESSAGES.timeout)), timeoutMs);
    transport.onMessage((from, msg) => {
      if (!msg || typeof msg.t !== 'string' || !msg.t.startsWith('h:')) return;
      if (msg.t === 'h:welcome') { state = msg.state; if (!settled) { settled = true; clearTimeout(timer); resolve(room); } ev.emit('change', clone(state)); }
      else if (msg.t === 'h:state') { state = msg.state; ev.emit('change', clone(state)); }
      else if (msg.t === 'h:error') fail(new NetError(msg.code, msg.message || msg.code));
      else if (msg.t === 'h:start') ev.emit('start', msg.packet);
    });
    transport.onPeer((e) => { if (e.type === 'leave' && e.id === transport.hostId) { ev.emit('error', { code: 'host-left', message: NET_MESSAGES['host-left'] }); ev.emit('closed', {}); } });
    const req = (msg) => transport.send(transport.hostId, msg);
    const room = {
      code, isHost: false, me: transport.id, transport, get state() { return state && clone(state); }, on: ev.on,
      claim(key, o = {}) { req({ t: 'h:claim', key, ...o }); },
      release(key) { req({ t: 'h:release', key }); },
      ready(key, r = true) { req({ t: 'h:ready', key, ready: r }); },
      leave() { transport.close(); ev.emit('closed', {}); },
    };
    transport.join(code).then(() => req({ t: 'h:hello', name, dataHash })).catch(fail);
  });
}
