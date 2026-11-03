// Runs a sim in real time. This is the one place speed lives: the sim only ever sees "one more tick" (PLAN rule 1), so
// 4x is four times as many ticks and pause is none. Time comes in from outside (`pump(nowMs)`), which keeps this file
// pure too: worker.js passes performance.now(), the tests pass made-up numbers.

import { createSnapshotter, rosterOf, inspectPerson } from './snapshot.js';

export const SPEEDS = [0, 1, 2, 4];

export function createDriver({ sim, post, maxStepsPerPump = 16, timer = null }) {
  const snaps = createSnapshotter(sim);
  let speed = 1, testSpeed = 0, agreed = 0, controlled = false, last = null, acc = 0, queue = [];
  const times = { count: 0, total: 0, max: 0 };

  function step(n) {
    for (let i = 0; i < n; i++) {
      const start = timer ? timer() : 0;
      sim.tick(queue);
      queue = [];
      if (timer) { const ms = timer() - start; times.count++; times.total += ms; if (ms > times.max) times.max = ms; }
    }
  }
  const clients = new Map();   // a room: everybody gets their own snapshots, because each has seen different things
  function flush() {
    const events = sim.drainEvents();
    me.tap?.(events);
    post?.(snaps.snapshot(events));
    for (const [send, cl] of clients) {
      // a phone on a slow line: its snapshots wait, and the next one carries the news it missed. A snapshot says what changed since the last one that was really sent
      if (cl.busy?.()) { cl.owed.push(...events); if (cl.owed.length > 4000) cl.owed.splice(0, cl.owed.length - 4000); continue; }
      const list = cl.owed.length ? [...cl.owed, ...events] : events;
      cl.owed = [];
      send(cl.sn.snapshot(list));
    }
  }

  const me = {
    tap: null,      // a room hears every event before the clients do
    get speed() { return agreed || (controlled ? Math.min(speed, 1) : testSpeed || speed); },
    /** A room only: everybody agreed to run faster (js/sim/room.js). 0 = no agreement, the rules above apply. */
    setAgreed(x) { agreed = Math.max(0, Number(x) || 0); },
    /** God view picks a speed; taking control holds it at 1x until handed back. */
    setSpeed(x) { if (SPEEDS.includes(x)) speed = x; },
    setControlled(on) { controlled = !!on; },
    /** Tests only (gameEye.turbo): any multiple, so a 10-day browser run does not take 40 minutes. 0 = back to normal. */
    setTestSpeed(x) { testSpeed = Math.max(0, Number(x) || 0); },
    get ticks() { return sim.t; },
    command(cmd) { queue.push(cmd); },
    /** Now, not at the next tick: what is queued goes first, so the order holds, then everyone hears at once. */
    commandNow(cmd) { for (const q of queue) sim.apply(q); queue = []; sim.apply(cmd); flush(); },
    pump(nowMs) {
      if (last === null) { last = nowMs; return 0; }
      const dt = nowMs - last;
      last = nowMs;
      acc += dt / 1000 * sim.clock.tps * me.speed;
      let n = Math.floor(acc);
      acc -= n;
      if (n > maxStepsPerPump) n = maxStepsPerPump; // a sleeping tab drops the backlog; the clock never jumps
      if (n > 0) { step(n); flush(); }
      return n;
    },
    stepNow(n) { step(n); flush(); },
    stats() { const r = { ticks: times.count, avgMs: times.count ? times.total / times.count : 0, maxMs: times.max }; times.count = 0; times.total = 0; times.max = 0; return r; },
    roster: () => rosterOf(sim.context),
    inspect: id => inspectPerson(sim.context, id),
    phone: (household, who) => sim.phone(household, who),
    facts: (a, b) => sim.facts(a, b),
    resend() { snaps.resend(); flush(); },
    /** Another client of the same sim (js/sim/room.js). Their first snapshot is whole. */
    addClient(send, { busy = null, focus = null } = {}) { clients.set(send, { sn: createSnapshotter(sim, { focus }), busy, owed: [] }); },
    removeClient(send) { clients.delete(send); },
    resendTo(send) { clients.get(send)?.sn.resend(); },
  };
  return me;
}
