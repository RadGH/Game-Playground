// Clocks (stream A). Everything that schedules takes one of these so tests can run on virtual time.
//   realClock                     performance.now() + the platform's timers
//   createVirtualClock()          nothing happens until advance(ms); timers fire in order

export const realClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimeout: (f, ms) => setTimeout(f, ms),
  clearTimeout: id => clearTimeout(id),
  setInterval: (f, ms) => setInterval(f, ms),
  clearInterval: id => clearInterval(id),
};

export function createVirtualClock(start = 0) {
  let now = start, seq = 0, nextId = 1;
  const q = [];          // { at, seq, id, fn, every }
  const dead = new Set();
  function push(ev) {
    let i = q.length;
    while (i > 0 && (q[i - 1].at > ev.at || (q[i - 1].at === ev.at && q[i - 1].seq > ev.seq))) i--;
    q.splice(i, 0, ev);
  }
  const c = {
    now: () => now,
    setTimeout(fn, ms) { const id = nextId++; push({ at: now + Math.max(0, ms || 0), seq: seq++, id, fn }); return id; },
    clearTimeout(id) { dead.add(id); },
    setInterval(fn, ms) { const id = nextId++; push({ at: now + Math.max(1, ms || 1), seq: seq++, id, fn, every: Math.max(1, ms || 1) }); return id; },
    clearInterval(id) { dead.add(id); },
    /** Run everything due in the next ms milliseconds, in time order. */
    advance(ms) {
      const end = now + ms;
      while (q.length && q[0].at <= end) {
        const ev = q.shift();
        if (dead.has(ev.id)) { dead.delete(ev.id); continue; }
        now = Math.max(now, ev.at);
        if (ev.every) push({ ...ev, at: now + ev.every, seq: seq++ });
        ev.fn();
      }
      now = end;
    },
    /** Advance in steps until fn() is true or maxMs passes. */
    runUntil(fn, maxMs = 10000, step = 10) {
      const end = now + maxMs;
      while (!fn() && now < end) c.advance(step);
      return !!fn();
    },
    /** Run queued zero-delay work (promises resolve between advances; call this after awaiting). */
    get pending() { return q.length; },
  };
  return c;
}

/**
 * A fixed-rate ticker with drift correction (PLAN §8.2): tick k is due at start + k*ms; a late tick runs
 * at once; more than maxBehind ticks late, the backlog is skipped and reported.
 */
export function startTicker(step, { ms = 50, clock = realClock, maxBehind = 5, onSkip = () => {} } = {}) {
  const start = clock.now();
  let k = 0, timer = 0, stopped = false;
  function loop() {
    if (stopped) return;
    const t = clock.now();
    let due = start + (k + 1) * ms;
    if (t - due > maxBehind * ms) {
      const behind = Math.floor((t - due) / ms);
      k += behind; onSkip(behind);
      due = start + (k + 1) * ms;
    }
    if (t >= due) { k++; step(); }
    const wait = Math.max(0, start + (k + 1) * ms - clock.now());
    timer = clock.setTimeout(loop, wait);
  }
  timer = clock.setTimeout(loop, ms);
  return { stop() { stopped = true; clock.clearTimeout(timer); }, get ticks() { return k; } };
}
