// Client-side prediction for your own character.
//
// The server owns where you are, but waiting a round trip before your character moves feels like wading
// through mud. So the client runs each input step itself the moment you press a key — with stream A's
// `stepMove`, the exact function the server runs (js/sim/movement.js) — keeps the steps the server has not
// confirmed, and when a snapshot says "after input N you were HERE", it starts from HERE and replays the
// unconfirmed steps. If the server agrees (the normal case) nothing visible happens; if it disagrees (a
// slope it would not let you climb, a knockback) the visible error is blended away over a few frames
// instead of snapping. Pure: no DOM, no three.js.

import { stepMove, MOVE } from '../sim/movement.js';
export { MOVE };

export class Predictor {
  /** terrain = { heightAt, walkable?, bounds? } — the same object shape the server's room uses. */
  constructor({ terrain = null, stepMs = 50, maxPending = 120 } = {}) {
    this.terrain = terrain;
    this.stepMs = stepMs;
    this.maxPending = maxPending;
    this.st = { x: 0, y: 0, z: 0, vy: 0, airborne: false };
    this.prev = { x: 0, y: 0, z: 0 };       // position one step ago (render interpolation)
    this.err = { x: 0, y: 0, z: 0 };        // visual offset still being blended away
    this.pending = [];                       // inputs the server has not acked: { s, dt, mx, mz, yaw, b }
    this.seq = 0;
    this.lastAck = 0;
    this.corrections = 0;
    this.locked = false;                     // dead: the server position only
  }
  get pos() { return this.st; }

  /** Teleport (join, respawn): no blending, no pending steps. Sequence numbers keep counting up. */
  reset(p) {
    this.st = { x: p.x, y: p.y ?? (this.terrain ? this.terrain.heightAt(p.x, p.z) : 0), z: p.z, vy: p.vy || 0, airborne: false };
    this.prev = { x: this.st.x, y: this.st.y, z: this.st.z };
    this.err = { x: 0, y: 0, z: 0 };
    this.pending.length = 0;
  }

  /** Apply one local step; returns the `in` message fields (send them). */
  apply({ mx, mz, yaw, b }) {
    const inp = { s: ++this.seq, dt: this.stepMs, mx: round3(mx), mz: round3(mz), yaw: round3(yaw), b: b | 0 };
    this.prev = { x: this.st.x, y: this.st.y, z: this.st.z };
    if (!this.locked && this.terrain) stepMove(this.st, inp, inp.dt, this.terrain);
    this.pending.push(inp);
    if (this.pending.length > this.maxPending) this.pending.shift();
    return inp;
  }

  /** Server: after input `ack` you were at `p` ({x,y,z,vy}). Returns the correction in metres. */
  reconcile(ack, p) {
    if (ack < this.lastAck) return 0;
    this.lastAck = ack;
    while (this.pending.length && this.pending[0].s <= ack) this.pending.shift();
    const s = { x: p.x, y: p.y, z: p.z, vy: p.vy || 0, airborne: (p.vy || 0) !== 0 };
    if (!this.locked && this.terrain) for (const inp of this.pending) stepMove(s, inp, inp.dt, this.terrain);
    const dx = s.x - this.st.x, dy = s.y - this.st.y, dz = s.z - this.st.z;
    const d = Math.hypot(dx, dz);
    if (d > 6) { this.reset(s); this.corrections++; return d; }
    if (d > 0.02 || Math.abs(dy) > 0.05) {
      if (d > 0.02) this.corrections++;
      this.err.x -= dx; this.err.y -= dy; this.err.z -= dz;
      this.prev = { x: this.prev.x + dx, y: this.prev.y + dy, z: this.prev.z + dz };
    }
    this.st = s;
    return d;
  }

  /** Where to draw this frame. `alpha` 0..1 between the last two steps; `dt` seconds for blending. */
  render(alpha, dt) {
    const k = 1 - Math.exp(-(dt || 0) * 12);
    this.err.x -= this.err.x * k; this.err.y -= this.err.y * k; this.err.z -= this.err.z * k;
    const a = Math.max(0, Math.min(1, alpha));
    return {
      x: this.prev.x + (this.st.x - this.prev.x) * a + this.err.x,
      y: this.prev.y + (this.st.y - this.prev.y) * a + this.err.y,
      z: this.prev.z + (this.st.z - this.prev.z) * a + this.err.z,
    };
  }
}

const round3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
