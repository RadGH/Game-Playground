// Online-play test harness (tests/net.spec.js): a room + a match with no rendering, driven through
// window.bl. Transport kind from ?t=channel (default) | peerjs.
import { loadData } from '../../js/sim/data.js';
import { createSim, restoreSim } from '../../js/sim/sim.js';
import { createTransport } from '../../js/net/transport.js';
import { createRoom, joinRoom, beginMatch } from '../../js/net/lobbysync.js';
import { createNetClock } from '../../js/net/netclock.js';

const params = new URLSearchParams(location.search);
const kind = params.get('t') || 'channel';
const out = document.getElementById('out');
let hidden = false;
Object.defineProperty(document, 'visibilityState', { get: () => (hidden ? 'hidden' : 'visible'), configurable: true });

const bl = { kind, room: null, match: null, clock: null, hashes: {}, events: {}, frames: 0, pumpsWhileHidden: 0, error: null };
window.bl = bl;
const data = await loadData(name => fetch(`../../data/${name}`).then(r => r.text()));
bl.dataHash = data.hash;

function onStart(packet) {
  const match = beginMatch(bl.room, packet, {
    data, createSim: (c, d) => createSim(c, d), restoreSim: (s, d) => restoreSim(s, d), now: () => performance.now(),
    onEvent: (type) => { bl.events[type] = (bl.events[type] || 0) + 1; },
    onTick: (t, sim) => { if (t % 200 === 0) bl.hashes[t] = sim.hash(); },
  });
  bl.match = match;
  bl.clock = createNetClock({ lockstep: match.lockstep, tickMs: packet.tickMs });
  const origPump = bl.clock.pump;
  bl.clock.pump = () => { if (hidden) bl.pumpsWhileHidden++; origPump(); };
  bl.detach = bl.clock.attachVisibility(document);
  let i = 0;
  const frame = () => {
    // a hidden tab gets no animation frames: only the worker pulses move it
    if (!hidden) {
      bl.frames++;
      bl.clock.frame(16, () => match.localPlayers.map(l => (++i % 25 === 0 ? { p: l.pid, type: 'send', unit: data.races.races[bl.clock.sim.state.players[l.pid].race].units[i % 3] } : null)).filter(Boolean));
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

bl.host = async (code, { name = 'Host', format = '1v1' } = {}) => {
  const transport = await createTransport(kind);
  bl.room = await createRoom({ transport, name, dataHash: data.hash, code, format });
  bl.room.on('start', onStart);
  return bl.room.code;
};
bl.join = async (code, { name = 'Guest' } = {}) => {
  const transport = await createTransport(kind);
  bl.room = await joinRoom({ transport, code, name, dataHash: data.hash });
  bl.room.on('start', onStart);
  return true;
};
bl.claim = (key, o = {}) => bl.room.claim(key, { race: 'freeholds', hero: 'warrior', ...o });
bl.setAI = (key) => bl.room.setSlot(key, { kind: 'ai', difficulty: 'veteran' });
bl.readyUp = (key) => bl.room.ready(key, true);
bl.start = (o = {}) => { const p = bl.room.start(o); return { delay: p.delay, players: p.config.players.length }; };
bl.hide = h => { hidden = !!h; document.dispatchEvent(new Event('visibilitychange')); };
bl.leave = () => { if (bl.room) bl.room.leave(); };
bl.status = () => {
  const s = bl.clock ? bl.clock.sim : null;
  return {
    phase: bl.room && bl.room.state ? bl.room.state.phase : null,
    machines: bl.room && bl.room.state ? bl.room.state.machines.map(m => ({ name: m.name, hidden: m.hidden, ping: m.ping })) : [],
    tick: s ? s.tick : 0, kinds: s ? s.state.players.map(p => p.kind) : [], hashes: bl.hashes, events: bl.events,
    waiting: bl.clock ? bl.clock.waitingFor.map(w => ({ name: w.name, hidden: w.hidden })) : [], ended: bl.match ? bl.match.lockstep.ended : false,
    frames: bl.frames, pumpsWhileHidden: bl.pumpsWhileHidden, lsMachines: bl.match ? bl.match.lockstep.machines : [],
  };
};
/** Cross-engine replay: run a recorded command log and return the hash at every checkpoint. */
bl.replay = log => {
  const sim = createSim(log.config, data, { events: false });
  const out2 = {};
  const byTick = new Map(log.commands);
  while (sim.tick < log.ticks) { sim.step(byTick.get(sim.tick + 1) || []); if (log.every && sim.tick % log.every === 0) out2[sim.tick] = sim.hash(); }
  return { hashes: out2, final: sim.hash(), dataHash: data.hash };
};
out.textContent = `ready (${kind}), data ${data.hash}`;
bl.ok = true;
