// The horde: alien creatures that flock (spread out, move together, follow the path map) instead of stacking up,
// and chew through whatever wall stands between them and the city. All melee — walls block every attack (owner
// 2026-11-15). Also the ONE blast rule every explosion goes through (research-boom-feel.md, mistake #1: a blast that
// doesn't touch the enemies), so a mortar, a rail shot and an orbital strike all damage, push and fling the same way.
import { T } from './field.js';

/** Creature kinds. hp, speed (tiles/s), radius (tiles), chew (wall damage/s), mass (how hard to push), colours for the
 *  death burst. Recipe ids match citykit/js/kit/creatures.js. */
export const KINDS = {
  swarmer: { recipe: 'cr-swarmer', hp: 22, speed: 2.1, radius: 0.16, chew: 5, mass: 1, colors: ['#4a3168', '#3fffd2', '#22152f'] },
  breaker: { recipe: 'cr-breaker', hp: 140, speed: 0.95, radius: 0.26, chew: 26, mass: 3, colors: ['#6e4a2c', '#ffcf6a', '#2e1d10'] },
  sapper:  { recipe: 'cr-sapper', hp: 38, speed: 1.45, radius: 0.2, chew: 70, mass: 1.2, colors: ['#3d5a2e', '#d4ff3f', '#1a2a12'] },
  brute:   { recipe: 'cr-brute', hp: 700, speed: 0.75, radius: 0.48, chew: 45, mass: 9, colors: ['#3b4f66', '#d6f3ff', '#18222e'] },
};

export class Horde {
  constructor(grid, { onKill = null, onWallBroken = null } = {}) {
    this.grid = grid; this.list = []; this.nextId = 1; this.onKill = onKill; this.onWallBroken = onWallBroken;
    this.cell = new Map();   // spatial hash: "x,z" → creatures
  }
  spawn(kind, x, z) {
    const k = KINDS[kind];
    const c = { id: this.nextId++, kind, x, z, vx: 0, vz: 0, hp: k.hp, max: k.hp, state: 'walk', t: Math.random() * 10, heading: 0, stun: 0, flash: 0, chewing: null, lift: 0, vy: 0 };
    this.list.push(c); return c;
  }
  _hash() {
    this.cell.clear();
    for (const c of this.list) { const k = `${Math.floor(c.x)},${Math.floor(c.z)}`; let a = this.cell.get(k); if (!a) this.cell.set(k, a = []); a.push(c); }
  }
  near(x, z, r) {
    const out = [];
    for (let gz = Math.floor(z - r); gz <= Math.floor(z + r); gz++) for (let gx = Math.floor(x - r); gx <= Math.floor(x + r); gx++) {
      const a = this.cell.get(`${gx},${gz}`); if (a) for (const c of a) if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r * r) out.push(c);
    }
    return out;
  }

  /** One sim step. Flocking: seek along the path map + separation (no stacking) + alignment + a little cohesion. */
  step(dt) {
    this._hash();
    const g = this.grid;
    for (const c of this.list) {
      c.t += dt; c.flash = Math.max(0, c.flash - dt);
      if (c.lift > 0 || c.vy !== 0) { c.vy -= 14 * dt; c.lift = Math.max(0, c.lift + c.vy * dt); if (c.lift === 0) c.vy = 0; }
      if (c.stun > 0) { c.stun -= dt; c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= 0.9; c.vz *= 0.9; this._keepOut(c); continue; }
      const k = KINDS[c.kind];
      // chewing a wall?
      const b = g.blocker(c.x, c.z);
      const [fx, fz] = g.flow(c.x, c.z);
      if (b) {
        const bi = g.i(b[0], b[1]);
        const dx = b[0] + 0.5 - c.x, dz = b[1] + 0.5 - c.z, dist = Math.hypot(dx, dz);
        if (dist < 0.62 + k.radius) {
          c.state = 'attack'; c.chewing = b; c.heading = Math.atan2(dz, dx); c.vx *= 0.5; c.vz *= 0.5;
          g.hp[bi] -= k.chew * dt;
          if (g.hp[bi] <= 0 && g.kind[bi] !== T.LAND) { g.kind[bi] = T.LAND; g.hp[bi] = 0; this.onWallBroken?.(b[0], b[1]); }
          continue;
        }
      }
      c.state = 'walk'; c.chewing = null;
      // steering
      let sx = fx * k.speed, sz = fz * k.speed;
      let px = 0, pz = 0, ax = 0, az = 0, cx = 0, cz = 0, n = 0;
      const R = k.radius * 2 + 0.35;
      for (const o of this.near(c.x, c.z, R + 0.3)) {
        if (o === c) continue;
        const dx = c.x - o.x, dz = c.z - o.z, d2 = dx * dx + dz * dz; if (d2 < 1e-6) { px += Math.random() - 0.5; pz += Math.random() - 0.5; continue; }
        const d = Math.sqrt(d2), want = k.radius + KINDS[o.kind].radius + 0.06;
        if (d < want + 0.25) { const push = (want + 0.25 - d) / (want + 0.25); px += dx / d * push; pz += dz / d * push; }
        ax += o.vx; az += o.vz; cx += o.x; cz += o.z; n++;
      }
      if (n) { ax /= n; az /= n; cx = cx / n - c.x; cz = cz / n - c.z; }
      sx += px * 3.2 + ax * 0.25 + cx * 0.15; sz += pz * 3.2 + az * 0.25 + cz * 0.15;
      // ease toward the wanted velocity (gives the swirl of a flock instead of robots)
      const ease = Math.min(1, dt * 5);
      c.vx += (sx - c.vx) * ease; c.vz += (sz - c.vz) * ease;
      const sp = Math.hypot(c.vx, c.vz), max = k.speed * 1.25; if (sp > max) { c.vx *= max / sp; c.vz *= max / sp; }
      c.x += c.vx * dt; c.z += c.vz * dt;
      this._keepOut(c);
      if (sp > 0.05) c.heading = Math.atan2(c.vz, c.vx);
    }
  }
  /** Never inside water or an unbroken wall/building: push back out to the nearest open edge. */
  _keepOut(c) {
    const g = this.grid; const x = Math.floor(c.x), z = Math.floor(c.z);
    if (g.open(x, z)) return;
    let best = null, bd = Infinity;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!g.open(x + dx, z + dz)) continue;
      const tx = Math.min(Math.max(c.x, x + dx + 0.02), x + dx + 0.98), tz = Math.min(Math.max(c.z, z + dz + 0.02), z + dz + 0.98);
      const d = (tx - c.x) ** 2 + (tz - c.z) ** 2; if (d < bd) { bd = d; best = [tx, tz]; }
    }
    if (best) { c.x = best[0]; c.z = best[1]; c.vx *= 0.3; c.vz *= 0.3; }
  }

  /** Damage one creature. Returns true if it died. from = [x, z] of the hit's source (for knockback direction). */
  hurt(c, dmg, from = null, push = 0) {
    if (c.hp <= 0) return false;
    c.hp -= dmg; c.flash = 0.06;
    if (from && push) {
      const dx = c.x - from[0], dz = c.z - from[1], l = Math.hypot(dx, dz) || 1, m = KINDS[c.kind].mass;
      c.vx += dx / l * push / m; c.vz += dz / l * push / m; c.stun = Math.max(c.stun, 0.15);
    }
    if (c.hp <= 0) { this.list.splice(this.list.indexOf(c), 1); this.onKill?.(c, from); return true; }
    return false;
  }

  /**
   * THE blast rule. Every explosion calls this. Full damage inside `core` tiles, falling in a straight line to
   * `edge` (share) at `radius`. Survivors are pushed `push` tiles/s (÷ mass), thrown up a little and stunned.
   * Returns { hit, killed } so callers (and tests) can count.
   */
  blast(x, z, { radius, damage, core = 0.5, edge = 0.25, push = 3, lift = 2, stun = 0.3, wallDamage = 0 }) {
    this._hash();
    let hit = 0, killed = 0;
    for (const c of this.near(x, z, radius)) {
      const d = Math.hypot(c.x - x, c.z - z);
      const share = d <= core ? 1 : 1 - (1 - edge) * ((d - core) / Math.max(1e-6, radius - core));
      hit++;
      const m = KINDS[c.kind].mass;
      if (this.hurt(c, damage * share, [x, z], push * share * m)) killed++;
      else { c.vy = Math.max(c.vy, lift * share / Math.sqrt(m)); c.lift = Math.max(c.lift, 0.01); c.stun = Math.max(c.stun, stun / Math.sqrt(m)); }
    }
    if (wallDamage) {
      const g = this.grid;
      for (let tz = Math.floor(z - radius); tz <= Math.floor(z + radius); tz++) for (let tx = Math.floor(x - radius); tx <= Math.floor(x + radius); tx++) {
        if (g.at(tx, tz) !== T.WALL || Math.hypot(tx + 0.5 - x, tz + 0.5 - z) > radius) continue;
        const i = g.i(tx, tz); g.hp[i] -= wallDamage; if (g.hp[i] <= 0) { g.kind[i] = T.LAND; this.onWallBroken?.(tx, tz); }
      }
    }
    return { hit, killed };
  }
}
