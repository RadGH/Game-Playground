// Client-side prediction for your own character, and the movement rule it predicts with.
//
// Why: the server owns where you are, but waiting a round trip before your character moves feels like
// wading through mud. So the client applies each input step itself the moment you press a key, keeps
// the steps the server has not confirmed yet, and when a snapshot arrives with "I applied up to step N,
// you are HERE", it jumps to HERE and replays the unconfirmed steps on top. If the server agrees with us
// (the normal case) nothing visible happens; if it disagrees (a wall, a stun, a knockback) the visible
// error is blended away over a few frames instead of snapping.
//
// Pure: no DOM, no three.js. `heightAt(x, z)` is passed in (the shared terrain reader).
//
// NOTE (docs/requests.md D->A #8): `stepMove` must be the SAME function the server runs. Until stream A
// exports its movement step, this copy defines the constants; when A's lands, import it here instead.

export const MOVE = {
  run: 7.0,          // m/s — default pace (MMO convention: you run unless you toggle walk)
  walk: 2.6,         // m/s
  backMul: 0.6,      // moving away from where you face is slower
  maxStepUp: 1.2,    // m per step the ground may rise before it counts as a wall (M1: real collision)
};

/**
 * Advance one movement step. `s` = { x, y, z }, `inp` = { mx, mz, yaw, run }, dt in seconds.
 * Returns a NEW state (never mutates), so replay is safe.
 */
export function stepMove(s, inp, dt, heightAt) {
  let mx = +inp.mx || 0, mz = +inp.mz || 0;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  let speed = inp.run === 0 || inp.run === false ? MOVE.walk : MOVE.run;
  // Backpedal: the move direction points away from the facing direction.
  if (len > 0.01) {
    const fx = Math.sin(+inp.yaw || 0), fz = Math.cos(+inp.yaw || 0);
    if ((mx * fx + mz * fz) / Math.min(1, len) < -0.5) speed *= MOVE.backMul;
  }
  const x = s.x + mx * speed * dt, z = s.z + mz * speed * dt;
  const y = heightAt ? heightAt(x, z) : s.y;
  return { x, y, z };
}

/**
 * The predictor. Feed it one input per sim step with `apply`; feed it server corrections with
 * `reconcile`. `pos` is the predicted position, `smooth` the position to draw (blends errors away).
 */
export class Predictor {
  constructor({ heightAt = null, stepSec = 0.05, maxPending = 120 } = {}) {
    this.heightAt = heightAt;
    this.stepSec = stepSec;
    this.maxPending = maxPending;
    this.pos = { x: 0, y: 0, z: 0 };
    this.prev = { x: 0, y: 0, z: 0 };       // position one step ago (for render interpolation)
    this.err = { x: 0, y: 0, z: 0 };        // visual offset still being blended away
    this.pending = [];                       // [{ seq, mx, mz, yaw, run }]
    this.seq = 0;
    this.lastAck = -1;
    this.corrections = 0;                    // how many reconciles moved us more than a hair (stats/tests)
    this.locked = false;                     // dead / stunned: server position only
  }

  /** Teleport (spawn, respawn): no blending, no pending steps. */
  reset(p) {
    this.pos = { x: p.x, y: p.y ?? (this.heightAt ? this.heightAt(p.x, p.z) : 0), z: p.z };
    this.prev = { ...this.pos };
    this.err = { x: 0, y: 0, z: 0 };
    this.pending.length = 0;
  }

  /** Apply one local input step; returns the input with its sequence number (send it). */
  apply(inp) {
    const step = { seq: ++this.seq, mx: inp.mx, mz: inp.mz, yaw: inp.yaw, run: inp.run };
    this.prev = this.pos;
    if (!this.locked) this.pos = stepMove(this.pos, step, this.stepSec, this.heightAt);
    this.pending.push(step);
    if (this.pending.length > this.maxPending) this.pending.shift();
    return step;
  }

  /**
   * Server says: after input `ack` you were at `p`. Re-run what it has not seen yet.
   * Returns the size of the correction in metres.
   */
  reconcile(ack, p) {
    if (ack < this.lastAck) return 0;          // an older snapshot arriving late
    this.lastAck = ack;
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    let s = { x: p.x, y: p.y, z: p.z };
    if (!this.locked) for (const step of this.pending) s = stepMove(s, step, this.stepSec, this.heightAt);
    const dx = s.x - this.pos.x, dy = s.y - this.pos.y, dz = s.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 6) { this.reset(s); this.corrections++; return d; }   // too far to blend: snap (teleport, respawn)
    if (d > 0.02) {
      this.corrections++;
      // Keep where we were drawing (pos + err) and move the truth; the error is what remains to blend.
      this.err.x -= dx; this.err.y -= dy; this.err.z -= dz;
      this.prev = { x: this.prev.x + dx, y: this.prev.y + dy, z: this.prev.z + dz };
    }
    this.pos = s;
    return d;
  }

  /** Where to draw this frame. `alpha` 0..1 between the last two steps; `dt` seconds for blending. */
  render(alpha, dt) {
    const k = 1 - Math.exp(-(dt || 0) * 12);
    this.err.x -= this.err.x * k; this.err.y -= this.err.y * k; this.err.z -= this.err.z * k;
    const a = Math.max(0, Math.min(1, alpha));
    return {
      x: this.prev.x + (this.pos.x - this.prev.x) * a + this.err.x,
      y: this.prev.y + (this.pos.y - this.prev.y) * a + this.err.y,
      z: this.prev.z + (this.pos.z - this.prev.z) * a + this.err.z,
    };
  }
}
