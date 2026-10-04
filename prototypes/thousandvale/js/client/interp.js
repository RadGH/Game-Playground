// Interpolation for everyone who is not you, plus the server clock estimate it runs on.
//
// Other players and monsters arrive as snapshots ~15–20 times a second, each a little late and a
// little uneven. Drawing them at the newest snapshot makes them stutter; so each entity keeps a short
// list of timed samples and is drawn at "server time minus 130 ms" — a moment we almost always have a
// sample on both sides of — blending between those two. If the network hiccups and we run past the
// newest sample, the entity carries on along its last velocity for up to 250 ms, then holds.
// Pure: no DOM, no three.js.

const TAU = Math.PI * 2;

/** Shortest signed difference between two angles. */
export function angleDelta(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

export class SnapshotBuffer {
  constructor(max = 32) { this.max = max; this.s = []; }
  /** Add a sample { t (server ms), x, y, z, yaw }. Out-of-order samples are inserted in place. */
  push(sample) {
    const s = this.s;
    let i = s.length;
    while (i > 0 && s[i - 1].t > sample.t) i--;
    if (i > 0 && s[i - 1].t === sample.t) { s[i - 1] = sample; return; }
    s.splice(i, 0, sample);
    if (s.length > this.max) s.shift();
  }
  get latest() { return this.s[this.s.length - 1] || null; }
  clear() { this.s.length = 0; }
  /** State at server time `t`, or null when empty. */
  sample(t) {
    const s = this.s;
    if (!s.length) return null;
    if (t <= s[0].t) return { ...s[0], extrapolated: false };
    for (let i = s.length - 1; i > 0; i--) {
      const a = s[i - 1], b = s[i];
      if (t >= a.t && t <= b.t) {
        const k = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
        return {
          t, x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k,
          yaw: a.yaw + angleDelta(a.yaw, b.yaw) * k, extrapolated: false,
        };
      }
    }
    // Past the newest sample: extrapolate briefly along the last velocity, then hold.
    const b = s[s.length - 1], a = s[s.length - 2];
    if (!a) return { ...b, extrapolated: true };
    const over = Math.min(250, t - b.t), span = Math.max(1, b.t - a.t);
    const k = over / span;
    return { t, x: b.x + (b.x - a.x) * k, y: b.y + (b.y - a.y) * k, z: b.z + (b.z - a.z) * k, yaw: b.yaw, extrapolated: true };
  }
  /** Horizontal speed (m/s) around time t — drives walk/run animation and its playback rate. */
  speedAt(t) {
    const s = this.s;
    if (s.length < 2) return 0;
    let i = s.length - 1;
    while (i > 1 && s[i - 1].t > t) i--;
    const a = s[i - 1], b = s[i];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return 0;
    // A long gap with no samples means it stood still (idle entities send nothing).
    if (t - b.t > 400) return 0;
    return Math.hypot(b.x - a.x, b.z - a.z) / dt;
  }
}

/**
 * Server clock estimate from ping/pong. offset = serverTime - localTime, taken from the samples with
 * the lowest round trip (they are the least distorted), and slewed rather than jumped so animation
 * never hitches when the estimate improves.
 */
export class ServerClock {
  constructor(now = () => performance.now()) { this.now = now; this.samples = []; this.offset = null; this.target = 0; this.rtt = 0; }
  /** Seed from the welcome message (no rtt known yet). */
  seed(serverTime) { if (this.offset == null) { this.offset = this.target = serverTime - this.now(); } }
  pong(c, s) {
    const t = this.now(), rtt = Math.max(0, t - c);
    this.samples.push({ rtt, off: s + rtt / 2 - t });
    if (this.samples.length > 12) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a.rtt - b.rtt).slice(0, 4);
    this.target = best.reduce((n, x) => n + x.off, 0) / best.length;
    this.rtt = best[0].rtt;
    if (this.offset == null || Math.abs(this.target - this.offset) > 500) this.offset = this.target;
  }
  /** Observe a snapshot time: the server can never be behind a snapshot it already sent. */
  observe(serverTime) {
    if (this.offset == null) { this.seed(serverTime); return; }
    const est = this.now() + this.offset;
    if (serverTime > est + 30) { this.target += serverTime - est; this.offset += (serverTime - est) * 0.5; }
  }
  /** Current server time estimate (ms). Call once a frame; slews 10% of the error per call. */
  time() {
    if (this.offset == null) return this.now();
    this.offset += (this.target - this.offset) * 0.1;
    return this.now() + this.offset;
  }
}
