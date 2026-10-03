// The match clock, M1 version: a main-thread fixed-step accumulator (docs/interfaces.md §2.2).
//
// Interface (stream D's Worker clock in M5 implements the same shape):
//   clock.frame(dtMs, takeCommands) -> events[]   advance as many ticks as are due; takeCommands()
//                                                   returns this machine's commands for the next tick
//   clock.alpha                                    0..1 between the last tick and the next (interpolation)
//   clock.speed / setSpeed(n)                      1 = real time, 8 = debug
//   clock.paused / setPaused(bool)
// Offline input delay is 1 tick: commands taken during a frame go into the next step().

export function createLocalClock({ sim, tickMs, speed = 1, maxTicksPerFrame = 40 }) {
  let acc = 0;
  let paused = false;
  let alpha = 0;
  return {
    get sim() { return sim; },
    get waitingFor() { return []; },
    get alpha() { return alpha; },
    get speed() { return speed; },
    get paused() { return paused; },
    setSpeed(n) { speed = Math.max(0.25, Math.min(64, n)); },
    setPaused(v) { paused = !!v; },
    frame(dtMs, takeCommands) {
      const events = [];
      if (paused || sim.over) { alpha = sim.over ? 1 : alpha; return events; }
      acc += Math.min(dtMs, 250) * speed;
      let n = 0;
      while (acc >= tickMs && n < maxTicksPerFrame && !sim.over) {
        sim.step(takeCommands());
        const evs = sim.drainEvents();
        for (const e of evs) events.push(e);
        acc -= tickMs; n++;
      }
      if (n >= maxTicksPerFrame) acc = Math.min(acc, tickMs);   // fell behind: drop the backlog, never spiral
      alpha = Math.max(0, Math.min(1, acc / tickMs));
      return events;
    },
  };
}
