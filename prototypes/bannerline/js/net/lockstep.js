// Deterministic lockstep (PLAN §11.1-11.5). Every machine runs the whole sim; only commands travel.
// Transport-agnostic (js/net/transport.js) and clock-agnostic (`now` is passed in), so node tests can
// run it on virtual time with injected latency, jitter, reordering and drops.
//
// THE PROTOCOL (star topology, the host assembles turns)
//   * Commands a machine issues while the sim is at tick S are SEALED into tick S + delay (its "input"
//     for that tick, possibly empty). Clients send every unacknowledged input to the host on the
//     UNRELIABLE channel, so a lost packet is repaired by the next one (no stalls on one drop).
//   * The host ASSEMBLES turn T once every live machine's input for T is in: the commands in machine
//     order (only commands for that machine's own players are kept), plus any system commands it
//     scheduled for T (takeover / release). It sends the turn on the RELIABLE channel.
//   * Everyone executes turn T as sim.step(turn.cmds) when it has it and wall time has reached T. A
//     missing turn stalls the sim (`waitingFor` names who is late); a lagging machine catches up a few
//     ticks per update.
//   * HASH CHECK: every `hashEvery` ticks clients send their state hash; the host compares with its
//     own. On a mismatch the host sends a SNAPSHOT of its state plus the turns after it, and the client
//     replaces its sim (a short hiccup). With `dump: true` both states are kept for tools/desync-diff.mjs.
//   * DISCONNECT: when a client's machine leaves, the host schedules `takeover` system commands for its
//     players at the next turn it assembles (announced with a `notice`), and stops waiting for it.
//     If the HOST leaves, the match ends for everyone ("Host left — match ended").
//   * REJOIN: a machine that comes back (same token) gets a snapshot + the turns after it; the host
//     schedules `release` for its players at a tick a little ahead and waits for its inputs from then.
//   * HIDDEN TABS: a machine reports `hidden`; the others show "Waiting for <name> (tab hidden)" when it
//     is the one they wait on. The clock worker (js/sim/worker.js) keeps hidden tabs ticking.
//
//   const ls = createLockstep({ transport, sim, restore, isHost, me, hostId, machines, delay, tickMs,
//                               startAt, now, onEvent })
//   ls.queue(cmds)          local commands (any number, any time)
//   ls.update(nowMs)        pump: seal inputs, send, assemble (host), execute due turns. Returns ticks run.
//   ls.sim                  the current sim (replaced after a resync / rejoin)
//   ls.waitingFor           [{ id, name, hidden }] while stalled, else []
//   ls.setHidden(bool)      this tab became hidden / visible
//   ls.close()
//   opts.onTick(tick, sim)  after every executed tick (recorders, replays, the desync dump)

const HISTORY = 1200;        // executed turns kept (resync / rejoin replay)
const MAX_CATCHUP = 8;       // ticks one update may run when behind
const RESEND_MS = 60;        // clients repeat unacknowledged inputs this often even with nothing new

export function createLockstep(o) {
  const {
    transport, restore, isHost, me, delay = 2, tickMs = 50, hashEvery = 20, dump = false,
    onEvent = () => {}, onTick = null,
  } = o;
  let sim = o.sim;
  const hostId = isHost ? me : o.hostId;
  let startAt = o.startAt;
  let closed = false, ended = false;

  // machines: [{ id, name, players: [pids], token }] in a fixed order (the start packet's order)
  const machines = o.machines.map((m, i) => ({ ...m, order: i, live: true, fromTick: 1, hidden: false }));
  const machine = id => machines.find(m => m.id === id) || null;
  const mine = machine(me);
  // recomputed on a rejoin: the machine comes back under a NEW connection id
  let myPlayers = new Set(mine ? mine.players : []);
  // page clocks have different origins (a reloaded page restarts near 0), so times never cross the wire:
  // the host sends the match's AGE and the guest rebuilds startAt on its own clock at its next update
  let lastNow = null, rejoinAge = null;

  // ── local inputs ──
  let localQueue = [];
  let sendCursor = o.sendFrom || 1;       // next tick whose input is not sealed yet
  const unacked = new Map();              // tick -> cmds (clients: until a turn >= tick arrives)
  let lastSendAt = -1e9, ackedTo = 0;
  let pendingHashes = [];                 // clients: [{ tick, h }] to report

  // ── turns ──
  const turns = new Map();                // tick -> cmds, assembled (host) or received (client), not yet executed
  const history = new Map();              // tick -> cmds, executed
  // ── host only ──
  const pending = new Map();              // tick -> Map(machineId -> cmds)
  let nextAssemble = 1;
  const sysAt = new Map();                // tick -> [system commands]
  const hostHashes = new Map(), clientHashes = new Map();   // tick -> h ; tick -> [{ id, h }]
  const dumps = [], snapsAt = new Map();

  const send = (to, msg, reliable = true) => { if (!closed) transport.send(to, msg, { reliable }); };
  const broadcast = (msg, reliable = true) => { if (!closed) transport.broadcast(msg, { reliable }); };
  const target = now => Math.max(0, Math.floor((now - startAt) / tickMs));

  function sealInputs(now) {
    const upto = Math.min(target(now), sim.tick) + delay;
    while (sendCursor <= upto) {
      const cmds = localQueue.filter(c => c && (c.sys || myPlayers.has(c.p)));
      localQueue = [];
      if (isHost) putPending(sendCursor, me, cmds);
      else unacked.set(sendCursor, cmds);
      sendCursor++;
    }
  }

  function putPending(tick, id, cmds) {
    if (tick < nextAssemble) return;
    let m = pending.get(tick);
    if (!m) { m = new Map(); pending.set(tick, m); }
    if (!m.has(id)) m.set(id, cmds);
  }

  let lastSentCursor = 0;
  function clientSend(now) {
    if (!unacked.size && !pendingHashes.length) return;
    // send when something new was sealed, a hash is due, or every RESEND_MS (repairs dropped packets)
    if (sendCursor === lastSentCursor && !pendingHashes.length && now - lastSendAt < RESEND_MS) return;
    lastSendAt = now; lastSentCursor = sendCursor;
    const ticks = [];
    for (const [t, c] of unacked) ticks.push([t, c]);
    send(hostId, { t: 'in', ticks, hashes: pendingHashes }, false);
    pendingHashes = [];
  }

  function assemble() {
    for (;;) {
      const T = nextAssemble;
      const got = pending.get(T) || new Map();
      const need = machines.filter(m => m.live && m.fromTick <= T);
      if (!need.every(m => got.has(m.id))) return;
      const cmds = [];
      for (const m of machines) {
        const c = got.get(m.id);
        if (!c) continue;
        const allowed = new Set(m.players);
        for (const x of c) if (x && !x.sys && allowed.has(x.p)) cmds.push(x);
      }
      for (const s of sysAt.get(T) || []) cmds.push(s);
      sysAt.delete(T);
      pending.delete(T);
      turns.set(T, cmds);
      broadcast({ t: 'turn', tick: T, cmds });
      nextAssemble++;
    }
  }

  function execute(now) {
    const goal = target(now);
    let n = 0;
    while (sim.tick < goal && turns.has(sim.tick + 1) && n < MAX_CATCHUP && !sim.over) {
      const T = sim.tick + 1;
      const cmds = turns.get(T);
      turns.delete(T);
      sim.step(cmds);
      history.set(T, cmds);
      if (onTick) onTick(T, sim);
      if (history.size > HISTORY) history.delete(T - HISTORY);
      n++;
      if (T % hashEvery === 0) {
        const h = sim.hash();
        if (isHost) {
          hostHashes.set(T, h);
          if (hostHashes.size > 200) hostHashes.delete(T - 200 * hashEvery);
          if (dump) snapsAt.set(T, sim.snapshot());
          for (const c of clientHashes.get(T) || []) compare(T, c.id, c.h);
          clientHashes.delete(T);
        } else {
          pendingHashes.push({ tick: T, h });
          if (dump) { snapsAt.set(T, sim.snapshot()); if (snapsAt.size > 4) snapsAt.delete([...snapsAt.keys()][0]); }
        }
      }
    }
    return n;
  }

  // ── host: checking, resync, takeover, rejoin ──
  function compare(T, id, h) {
    const mine2 = hostHashes.get(T);
    if (mine2 === undefined || mine2 === h) return;
    onEvent('desync', { tick: T, machine: id });
    if (dump) send(id, { t: 'dumpReq', tick: T });
    resync(id);
  }

  function resync(id, extra = {}) {
    const after = [];
    for (const [t, c] of turns) after.push([t, c]);
    send(id, { t: 'resync', snap: sim.snapshot(), turns: after, ...extra });
  }

  function takeover(m) {
    if (!m.live) return;
    m.live = false;
    const at = nextAssemble;
    const list = sysAt.get(at) || [];
    for (const p of m.players) list.push({ sys: true, type: 'takeover', player: p, difficulty: 'veteran' });
    sysAt.set(at, list);
    const notice = { t: 'notice', kind: 'takeover', machine: m.id, name: m.name, players: m.players, atTick: at };
    broadcast(notice);
    onEvent('takeover', notice);
    assemble();
  }

  function rejoin(newId, token) {
    // a valid token wins even while the old record is still live: a guest that reloads inside the
    // transport's heartbeat timeout (PeerJS: 8 s) comes back before its old connection is declared gone.
    // Its players were never taken over then, and the old connection's late 'leave' no longer matches.
    const m = token != null && token !== 'host' ? machines.find(x => x.token === token && x.id !== me) : null;
    if (!m) { send(newId, { t: 'refused', reason: 'no-seat' }); return; }
    const old = m.id, wasLive = m.live;
    m.id = newId; m.live = true; m.hidden = false;
    m.fromTick = nextAssemble + delay + 2;
    if (!wasLive) {   // the AI took the seat over: hand it back (a still-live seat was never taken)
      const list = sysAt.get(m.fromTick) || [];
      for (const p of m.players) list.push({ sys: true, type: 'release', player: p });
      sysAt.set(m.fromTick, list);
    }
    resync(newId, { rejoin: { fromTick: m.fromTick, oldId: old, age: lastNow == null ? 0 : lastNow - startAt, machines: machines.map(x => ({ id: x.id, name: x.name, players: x.players, token: x.token })) } });
    const notice = { t: 'notice', kind: 'rejoin', machine: newId, name: m.name, players: m.players, atTick: m.fromTick };
    broadcast(notice);
    onEvent('rejoin', notice);
  }

  function statusMsg() { return { t: 'status', machines: machines.map(m => ({ id: m.id, name: m.name, live: m.live, hidden: m.hidden })) }; }

  // ── messages ──
  const offMsg = transport.onMessage((from, msg) => {
    if (closed || !msg || typeof msg !== 'object') return;
    if (isHost) {
      const m = machine(from);
      if (msg.t === 'rejoin') { rejoin(from, msg.token); return; }
      if (!m || !m.live) return;
      if (msg.t === 'in') {
        for (const [t, c] of msg.ticks || []) if (t >= m.fromTick) putPending(t, m.id, Array.isArray(c) ? c : []);
        for (const { tick, h } of msg.hashes || []) {
          if (hostHashes.has(tick)) compare(tick, m.id, h);
          else { const l = clientHashes.get(tick) || []; l.push({ id: m.id, h }); clientHashes.set(tick, l); }
        }
        assemble();
      } else if (msg.t === 'vis') {
        m.hidden = !!msg.hidden;
        broadcast(statusMsg()); onEvent('status', statusMsg());
      } else if (msg.t === 'dump') {
        dumps.push({ tick: msg.tick, host: snapsAt.get(msg.tick) || null, client: msg.snap, machine: m.id });
        onEvent('dump', dumps[dumps.length - 1]);
      }
      return;
    }
    if (from !== hostId) return;
    switch (msg.t) {
      case 'turn':
        if (msg.tick > (sim ? sim.tick : 0) && !turns.has(msg.tick)) turns.set(msg.tick, msg.cmds);
        if (msg.tick > ackedTo) { ackedTo = msg.tick; for (const t of [...unacked.keys()]) if (t <= msg.tick) unacked.delete(t); }
        break;
      case 'resync': {
        sim = restore(msg.snap);
        if (!o.sim) o.sim = sim;
        for (const [t] of turns) if (t <= sim.tick) turns.delete(t);
        for (const [t, c] of msg.turns || []) if (t > sim.tick) turns.set(t, c);
        // our own executed history after the snapshot is replayed too (we had those turns)
        for (const [t, c] of history) if (t > sim.tick && !turns.has(t)) turns.set(t, c);
        history.clear();
        if (msg.rejoin) {
          rejoinAge = msg.rejoin.age;   // applied on our own clock at the next update (half the round trip added)
          sendCursor = msg.rejoin.fromTick; unacked.clear();
          machines.length = 0;
          msg.rejoin.machines.forEach((x, i) => machines.push({ ...x, order: i, live: true, fromTick: 1, hidden: false }));
          const meNow = machines.find(x => x.id === me);
          myPlayers = new Set(meNow ? meNow.players : []);
        }
        onEvent('resync', { tick: sim.tick, rejoin: !!msg.rejoin });
        break;
      }
      case 'notice': onEvent(msg.kind, msg); break;
      case 'status':
        for (const s of msg.machines) { const m = machines.find(x => x.name === s.name && x.id === s.id) || machine(s.id); if (m) { m.live = s.live; m.hidden = s.hidden; } }
        onEvent('status', msg);
        break;
      case 'dumpReq': if (snapsAt.has(msg.tick)) send(hostId, { t: 'dump', tick: msg.tick, snap: snapsAt.get(msg.tick) }); break;
      case 'end': ended = true; onEvent('end', msg); break;
      case 'refused': onEvent('refused', msg); break;
      default: break;
    }
  });
  const offPeer = transport.onPeer(ev => {
    if (closed) return;
    if (isHost && ev.type === 'leave') { const m = machine(ev.id); if (m) takeover(m); }
    if (!isHost && ev.type === 'leave' && ev.id === hostId) { ended = true; onEvent('hostLeft', {}); }
  });

  if (o.rejoinToken) send(hostId, { t: 'rejoin', token: o.rejoinToken });

  return {
    get sim() { return sim; },
    get tick() { return sim ? sim.tick : 0; },
    get ended() { return ended; },
    get machines() { return machines.map(m => ({ id: m.id, name: m.name, live: m.live, hidden: m.hidden, players: m.players.slice() })); },
    get dumps() { return dumps; },
    get delay() { return delay; },
    get waitingFor() {
      if (!sim) return [{ id: hostId, name: 'host', hidden: false }];   // rejoining: waiting for the snapshot
      if (ended || sim.over) return [];
      const T = sim.tick + 1;
      if (turns.has(T)) return [];
      if (!isHost) { const h = machine(hostId); return [{ id: hostId, name: h ? h.name : 'host', hidden: !!(h && h.hidden) }]; }
      const got = pending.get(T) || new Map();
      return machines.filter(m => m.live && m.fromTick <= T && !got.has(m.id)).map(m => ({ id: m.id, name: m.name, hidden: m.hidden }));
    },
    queue(cmds) { if (Array.isArray(cmds)) for (const c of cmds) localQueue.push(c); },
    update(now) {
      lastNow = now;
      if (rejoinAge != null) { startAt = now - rejoinAge - (o.rttMs || 0) / 2; rejoinAge = null; }
      if (closed || ended || !sim) return 0;
      sealInputs(now);
      if (isHost) assemble(); else clientSend(now);
      return execute(now);
    },
    /** Host: replace a machine's players with the AI now (the lobby's "Replace with AI" after a hidden tab). */
    replaceWithAI(id) { if (isHost) { const m = machine(id); if (m && m.id !== me) takeover(m); } },
    /** Host: end the match for everyone (results screen). */
    end(reason = 'host') { if (isHost) broadcast({ t: 'end', reason }); ended = true; },
    setHidden(h) {
      if (isHost) { if (mine) mine.hidden = !!h; broadcast(statusMsg()); onEvent('status', statusMsg()); }
      else send(hostId, { t: 'vis', hidden: !!h });
    },
    close() { closed = true; offMsg && offMsg(); offPeer && offPeer(); },
  };
}

/**
 * Input delay in ticks from the worst round trip the lobby measured (PLAN §11.1): a client's input
 * reaches the host and comes back as a turn, so the delay must cover a full round trip plus jitter.
 * Offline / split screen: 1.
 */
export function delayFor(rttMs, tickMs = 50, online = true) {
  if (!online) return 1;
  return Math.max(2, Math.min(8, Math.ceil((rttMs + 40) / tickMs)));
}
