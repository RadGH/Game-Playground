// Other players, smooth (standards §7: drawn on the server's clock, your own predicted). Pure, so tests/smooth.test.js plays it against a pretend line with lag, jitter and lost messages.
//
//   clock: the room's time as seen from here, from ping and pong. The fastest trip so far is the honest one, a slow one has sat in a queue.
//   body:  someone on foot, drawn a moment in the past, between two things they really did. A walker turns on a coin, so guessing ahead looks wrong.
//   car:   a car is drawn NOW, carried on from its last report: at 20 m/s a picture 0.2 s late is 4 m behind, and when the leader takes the wheel that gap would be a jump.
export const BODY_DELAY = 320, MAX_AHEAD = 700;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createClock() {
  let offset = null, best = Infinity, age = 0;
  return {
    /** One ping: sent at t0 by this clock, answered at `at` by the room's, back at t1. */
    sample(t0, at, t1) {
      const rtt = t1 - t0, off = at - (t0 + t1) / 2;
      age++;
      if (offset === null || rtt < best) { offset = off; best = rtt; } else if (rtt <= best * 1.15) offset += (off - offset) * 0.3;       // a faster trip is simply a better measurement: the first ping can land on a page that is still loading
      if (age > 30) { best *= 1.1; age = 0; }      // the line may have got slower for good: let a worse number count, slowly
    },
    now: t => t + (offset ?? 0),
    get ready() { return offset !== null; },
    get rtt() { return best === Infinity ? null : best; },
  };
}

/** Someone on foot. push(at, x, z, h, lv, inside); read(now, out). */
export function createBody({ delay = BODY_DELAY, keep = 12 } = {}) {
  const buf = [];
  return {
    push(at, x, z, h, lv = 0, inside = -1) { if (buf.length && at <= buf[buf.length - 1].at) buf[buf.length - 1] = { at: buf[buf.length - 1].at, x, z, h, lv, inside }; else buf.push({ at, x, z, h, lv, inside }); if (buf.length > keep) buf.shift(); },
    get ready() { return buf.length > 0; },
    read(now, out) {
      if (!buf.length) return null;
      const t = now - delay, n = buf.length, last = buf[n - 1];
      let a = last, b = last;
      for (let i = n - 2; i >= 0; i--) if (buf[i].at <= t) { a = buf[i]; b = buf[i + 1]; break; } else if (i === 0) { a = b = buf[0]; }
      const span = b.at - a.at, k = span > 0 ? Math.max(0, Math.min(1, (t - a.at) / span)) : 1, jump = Math.hypot(b.x - a.x, b.z - a.z) > 12;      // a catch-up or a lift is a jump, not a sprint
      out.x = jump ? b.x : a.x + (b.x - a.x) * k; out.z = jump ? b.z : a.z + (b.z - a.z) * k; out.h = a.h + wrap(b.h - a.h) * k; out.lv = b.lv; out.inside = b.inside;
      out.speed = span > 0 && !jump && t < last.at ? Math.hypot(b.x - a.x, b.z - a.z) / span * 1000 : 0;
      return out;
    },
  };
}

/** A car. push(at, x, z, yaw, v); ahead(now, out) is where it must be by now; steer(pose, now, dt) moves the picture there without a snap. */
export function createCar({ max = MAX_AHEAD } = {}) {
  let last = null;
  const self = {
    get ready() { return !!last; },
    get last() { return last; },
    push(at, x, z, yaw, v) { if (!last || at >= last.at) last = { at, x, z, yaw, v }; },
    ahead(now, out = {}) {
      const dt = Math.max(0, Math.min(max, now - last.at)) / 1000;
      out.x = last.x + Math.sin(last.yaw) * last.v * dt; out.z = last.z + Math.cos(last.yaw) * last.v * dt; out.yaw = last.yaw; out.v = last.v;
      return out;
    },
    steer(f, now, dt) {
      if (!last) return f;
      const t = self.ahead(now, {}), k = 1 - Math.exp(-dt * 9), far = Math.hypot(t.x - f.x, t.z - f.z) > 30;
      if (far) { f.x = t.x; f.z = t.z; f.yaw = t.yaw; return f; }      // a summon to the far kerb, not a drive
      f.x += Math.sin(f.yaw) * last.v * dt; f.z += Math.cos(f.yaw) * last.v * dt;     // carry on first, then close the gap: chasing alone trails a fast car by metres
      f.x += (t.x - f.x) * k; f.z += (t.z - f.z) * k; f.yaw += wrap(t.yaw - f.yaw) * k;
      return f;
    },
  };
  return self;
}
