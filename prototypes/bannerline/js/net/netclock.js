// The online match clock: the same interface as js/clock.js (createLocalClock), driven by the
// lockstep instead of a plain accumulator, so main.js swaps one for the other.
//
//   const clock = createNetClock({ lockstep, tickMs, now })
//   clock.frame(dtMs, takeCommands) -> events[]   queue this machine's commands, run the turns that are due
//   clock.alpha                                    0..1 since the last executed tick (interpolation)
//   clock.sim                                      THE CURRENT SIM — read it every frame: a resync or a
//                                                  rejoin replaces the sim object
//   clock.waitingFor                               [{ id, name, hidden }] while stalled ("Waiting for ...")
//   clock.pump()                                   advance without a frame (worker pulses in a hidden tab)
//   clock.attachVisibility(doc, { onHidden })      report hidden/visible and switch to worker pulses
//   speed / pause: fixed in online play (everyone must run at one speed; setSpeed / setPaused are no-ops)

const CRITICAL = new Set(['result', 'takeover', 'release', 'levelUp', 'talentReady', 'heroDown', 'respawn']);
const MAX_BUFFER = 4000;

export function createNetClock({ lockstep, tickMs = 50, now = () => performance.now() }) {
  let lastTickAt = now(), lastTick = lockstep.tick;
  const buffer = [];       // events gathered by pump() while no frame runs
  let worker = null;

  function drain() {
    const s = lockstep.sim;
    if (!s) return;
    for (const e of s.drainEvents()) {
      buffer.push(e);
      if (buffer.length > MAX_BUFFER) {   // a long hidden spell: keep what matters, drop old cosmetic events
        const keep = buffer.filter((x, i) => CRITICAL.has(x.type) || i > buffer.length - MAX_BUFFER / 2);
        buffer.length = 0; buffer.push(...keep);
      }
    }
  }
  function advance() {
    const t = now();
    lockstep.update(t);
    if (lockstep.tick !== lastTick) { lastTick = lockstep.tick; lastTickAt = t; }
    drain();
  }

  const clock = {
    get sim() { return lockstep.sim; },
    get alpha() { return Math.max(0, Math.min(1, (now() - lastTickAt) / tickMs)); },
    get speed() { return 1; },
    get paused() { return false; },
    get waitingFor() { return lockstep.waitingFor; },
    get lockstep() { return lockstep; },
    setSpeed() {}, setPaused() {},
    frame(dtMs, takeCommands) {
      if (takeCommands) lockstep.queue(takeCommands());
      advance();
      const out = buffer.slice(); buffer.length = 0;
      return out;
    },
    pump() { advance(); },
    attachVisibility(doc = document, { onHidden = () => {}, workerUrl = new URL('../sim/worker.js', import.meta.url) } = {}) {
      const set = () => {
        const hidden = doc.visibilityState === 'hidden';
        lockstep.setHidden(hidden);
        onHidden(hidden);
        try {
          if (hidden) {
            if (!worker) { worker = new Worker(workerUrl, { type: 'module' }); worker.onmessage = e => { if (e.data && e.data.t === 'pulse') clock.pump(); }; }
            worker.postMessage({ cmd: 'start', ms: tickMs });
          } else if (worker) worker.postMessage({ cmd: 'stop' });
        } catch { /* no Worker: the tab simply waits while hidden */ }
      };
      doc.addEventListener('visibilitychange', set);
      return () => { doc.removeEventListener('visibilitychange', set); if (worker) { worker.terminate(); worker = null; } };
    },
  };
  return clock;
}
