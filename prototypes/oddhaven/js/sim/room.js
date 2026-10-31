// A room: the same sim and the same driver the Worker runs, with commands from more than one client (PLAN rule 8). Pure, like
// the rest of this folder: the caller brings the sockets and the clock (server/main.mjs), the tests bring neither.
//
//   const room = createRoom({ data, town, seed | save, paused });
//   const me = room.join(send);     room.message(me, msg);     room.pump(nowMs);     room.leave(me);
//
// Messages are the Worker's messages (worker.js), so js/client/town-link.js speaks to either. Differences, all on purpose:
// - the room stamps every command with the sender's id, so nobody can act as anyone else;
// - `focus` is per client and merged, so each screen stays lit;
// - a room always runs at 1x; `speed` and `turbo` are ignored (PLAN rule 1: no solo speed controls with company);
// - `save` answers with the plain text, not gzip;
// - a client that leaves has everyone they were playing handed back.
// Full rooms, permissions and leader takeback are M8.
import { createSim } from './index.js';
import { createDriver } from './driver.js';
import { problems, createStuckWatch } from './audit.js';

export function createRoom({ data, town, seed = 1, save = null, paused = false }) {
  const sim = createSim({ seed, data, town, save });
  const driver = createDriver({ sim, post: null });
  const clients = new Map(), watch = createStuckWatch(sim);
  let next = 1, watched = sim.t;
  if (paused) driver.setSpeed(0);

  const mergeFocus = () => {
    const points = [], party = new Set();
    for (const cl of clients.values()) { points.push(...cl.focus.points); for (const id of cl.focus.party) party.add(id); }
    driver.command({ kind: 'focus', points, party: [...party] });
  };
  const health = id => ({ type: 'health', id, problems: problems(sim), stuck: watch.found.slice(0, 12), stuckCount: watch.found.length, t: sim.t, day: sim.clock.day(sim.t), trips: sim.state.trips.length, resets: sim.state.stats.resets, tripsDone: sim.state.stats.trips, billsRun: sim.state.stats.billsRun, poorest: Math.min(...sim.state.households.map(h => h.money)) });

  const self = {
    sim, driver,
    get clients() { return clients.size; },
    hash: () => sim.hash(),
    join(send) {
      const id = `c${next++}`, cl = { id, send, focus: { points: [], party: [] }, playing: false };
      clients.set(id, cl);
      driver.addClient(send);
      send({ type: 'ready', roster: driver.roster(), caughtUp: 0, you: id, hash: sim.hash(), t: sim.t });
      driver.stepNow(0);
      return id;
    },
    leave(id) {
      const cl = clients.get(id);
      if (!cl) return;
      clients.delete(id);
      driver.removeClient(cl.send);
      driver.command({ kind: 'release', owner: id });
      mergeFocus();
      driver.setControlled([...clients.values()].some(x => x.playing));
    },
    message(id, msg) {
      const cl = clients.get(id);
      if (!cl) return;
      if (msg.type === 'cmd') {
        const cmd = msg.cmd;
        if (cmd.kind === 'focus') { cl.focus = { points: cmd.points || [], party: cmd.party || [] }; mergeFocus(); } else driver.command({ ...cmd, owner: id });
      } else if (msg.type === 'control') { cl.playing = !!msg.on; driver.setControlled([...clients.values()].some(x => x.playing)); }
      else if (msg.type === 'inspect') cl.send({ type: 'inspected', person: driver.inspect(msg.id) });
      else if (msg.type === 'phone') cl.send({ type: 'phoned', phone: driver.phone(msg.household, msg.who) });
      else if (msg.type === 'facts') cl.send({ type: 'facts', facts: driver.facts(msg.a, msg.b) });
      else if (msg.type === 'health') cl.send(health(msg.id));
      else if (msg.type === 'save') cl.send({ type: 'saved', id: msg.id, text: sim.save(msg.now ?? null), hash: sim.hash() });
      else if (msg.type === 'resend') driver.resend();
    },
    pump(nowMs) {
      const n = driver.pump(nowMs);
      if (sim.t - watched >= sim.clock.ticks(60)) { watched = sim.t; watch.check(); }
      return n;
    },
  };
  return self;
}
