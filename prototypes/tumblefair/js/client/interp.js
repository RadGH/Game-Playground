// Drawing OTHER players smoothly from the server's 20-a-second updates (round 4, 2026-10-21).
//
// The old way kept only the last two updates and timed the slide between them from when each one ARRIVED. Updates
// come every 50 ms, and each arrival restarted a "wait 50 ms, then slide" timer, so with a steady line everyone else
// stood frozen on ~90% of frames and was drawn 330-650 ms behind where they really were, then jumped. That was the
// "online lag" in the arena games.
//
// Now every update carries the server's tick number `k`, and the browser keeps a short history per player and a
// clock that maps its own time onto the server's ticks:
//   * the clock follows the EARLIEST arrivals (the line's real delay, without the hiccups) and measures how much
//     later than that updates usually come (the jitter);
//   * other players are drawn at `server time - (one tick + the jitter)`: far enough back that the two updates to
//     slide between have almost always arrived, and no further;
//   * if an update is late anyway, the player keeps moving on their last speed for up to two ticks instead of stopping.
// Pure (no DOM): tests/interp.test.js plays it against a pretend line with delay, jitter and lost packets.

/** Maps local time (ms) to the server's tick count. */
export function createServerClock({ tickMs = 50, maxDelay = 300 } = {}) {
  let base = null, jit = 15, last = 0, shown = null;
  return {
    /** An update numbered `k` arrived at local time `now`. */
    sample(k, now) {
      const off = now - k * tickMs;
      if (base == null || off < base) base = off;
      else base += Math.min(off - base, Math.max(0, now - last) * 0.01);     // creep later by 10 ms a second, in case the line got slower for good
      const d = off - base;
      jit = d > jit ? jit + (d - jit) * 0.25 : jit + (d - jit) * 0.01;       // rises fast on a hiccup, settles slowly
      last = now;
    },
    /** How far behind the newest server tick other players are drawn (ms), eased so it never jerks. */
    delay(dt = 16) {
      const want = Math.min(maxDelay, tickMs + Math.max(8, jit) + 6);
      shown = shown == null ? want : shown + (want - shown) * Math.min(1, dt / 500);
      return shown;
    },
    /** The (fractional) server tick to draw others at, local time `now`. null until the first update. */
    renderTick(now, dt) { return base == null ? null : (now - base - this.delay(dt)) / tickMs; },
    get ready() { return base != null; },
    get jitter() { return jit; },
  };
}

const lerpAngle = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };

/** One player's recent bodies by tick: push(k, body), at(tick) -> body as it was at that (fractional) tick. */
export function createTrack({ tickMs = 50, keep = 30, jump = 3, maxExtrap = 2 } = {}) {
  const buf = [];
  return {
    push(k, b) {
      if (buf.length && k <= buf[buf.length - 1].k) { if (k === buf[buf.length - 1].k) buf[buf.length - 1].b = b; return; }
      buf.push({ k, b }); if (buf.length > keep) buf.shift();
    },
    get latest() { return buf.length ? buf[buf.length - 1].b : null; },
    at(rt) {
      if (!buf.length) return null;
      const last = buf[buf.length - 1];
      if (rt == null) return last.b;
      if (rt >= last.k) {                                     // ahead of what has arrived: carry on at the last speed, briefly
        const s = Math.min(rt - last.k, maxExtrap) * tickMs / 1000, b = last.b;
        return { ...b, x: b.x + b.vx * s, z: b.z + b.vz * s };
      }
      if (rt <= buf[0].k) return buf[0].b;
      let i = buf.length - 2; while (i > 0 && buf[i].k > rt) i--;
      const p = buf[i], q = buf[i + 1], t = (rt - p.k) / (q.k - p.k);
      if (Math.hypot(q.b.x - p.b.x, q.b.z - p.b.z) > jump) return t < 0.5 ? p.b : q.b;     // moved by the game (a respawn): no slide
      return { ...p.b, x: p.b.x + (q.b.x - p.b.x) * t, z: p.b.z + (q.b.z - p.b.z) * t, y: p.b.y + (q.b.y - p.b.y) * t, yaw: lerpAngle(p.b.yaw, q.b.yaw, t), vx: q.b.vx, vz: q.b.vz };
    },
  };
}
