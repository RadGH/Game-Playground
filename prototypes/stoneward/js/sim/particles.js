// Free-flying particles and the rubble they leave: sparks, cinders, debris, rain drops, fire balls,
// and things being dragged into a black hole. PURE. Adapted from Kindlewild's
// prototypes/kindlewild/js/sim/particles.js (copied, not imported) for the chunked, wrapping world.
//
// ONE pool per sim, shared by everything that throws things around (powers now; walls, sieges and
// monsters later):
//
//   const D = debrisOf(sim);            // makes it the first time, then returns the same one
//   D.spawn({ kind: P.debris, mat, x, y, z, vx, vy, vz, grav, life, rgb, glow });
//   D.step();                           // safe to call from several systems: runs once a tick
//   D.view(rect)                        // particles in a world rect, for the page
//
// A particle with height z flies in an arc (the page draws it lifted by z) and LANDS when z reaches
// 0. What landing does depends on its kind: debris becomes a real rubble cell (or sets fire if it
// is burning), a cinder may light what it lands on, a drop wets or douses, a fire ball hands itself
// to the `D.landers` callbacks (the powers use that to burst it). Things that land on roads, bridges, water or a
// building's footprint just vanish: roads are never damaged (PLAN §0.3).
//
// Landed rubble FADES after a few minutes (owner: debris fades, no salvage). Its cells and fade
// times live in sim.state.debris.rubble as flat [x, y, fadeTick, ...] so a save keeps them. The
// particles in flight are not saved: they live for a few seconds at most.
//
// Chunk changes go through mark(): c.dirty + store.markEdited + sim.wake, like js/sim/cells.js.

import { BURN, WET } from './cells.js';

export const P = { spark: 0, cinder: 1, debris: 2, drop: 3, fireball: 4, sucked: 5, dust: 6 };
const MAX = 4000;
const FIELDS = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'kind', 'mat', 'r', 'g', 'b', 'glow', 'grav', 'tx', 'ty', 'tag'];

export function debrisOf(sim) {
  if (!sim.debris) sim.debris = createDebris(sim);
  return sim.debris;
}

export function createDebris(sim, { fadeSecs = 180, fadeJitter = 90 } = {}) {
  const { M } = sim;
  const W = sim.W, H = sim.H;
  const S = sim.state.debris ??= { rubble: [] };
  const ps = {
    n: 0,
    x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX),
    vx: new Float32Array(MAX), vy: new Float32Array(MAX), vz: new Float32Array(MAX),
    life: new Float32Array(MAX), kind: new Uint8Array(MAX), mat: new Uint8Array(MAX),
    r: new Uint8Array(MAX), g: new Uint8Array(MAX), b: new Uint8Array(MAX),
    glow: new Float32Array(MAX), grav: new Float32Array(MAX),
    tx: new Float32Array(MAX), ty: new Float32Array(MAX),     // where a sucked particle is going
    tag: new Int32Array(MAX),                                  // owner id (a power, a siege engine…)
  };
  let lastTick = -1;
  const D = { ps, P, landers: [], landed: 0, faded: 0 };   // landers: fn(i, x, y, tag) → true if it handled a fire ball

  function mark(c) { c.dirty = true; sim.store.markEdited(c); sim.wake(c); }
  D.mark = mark;

  /** Spawn one particle. Returns its index, or -1 when the pool is full. */
  D.spawn = o => {
    if (ps.n >= MAX) return -1;
    const i = ps.n++;
    ps.x[i] = o.x; ps.y[i] = o.y; ps.z[i] = o.z ?? 0;
    ps.vx[i] = o.vx ?? 0; ps.vy[i] = o.vy ?? 0; ps.vz[i] = o.vz ?? 0;
    ps.life[i] = o.life ?? 30;
    ps.kind[i] = o.kind ?? P.spark; ps.mat[i] = o.mat ?? 0;
    const c = o.rgb || [255, 200, 120];
    ps.r[i] = c[0]; ps.g[i] = c[1]; ps.b[i] = c[2];
    ps.glow[i] = o.glow ?? 0; ps.grav[i] = o.grav ?? 0;
    ps.tx[i] = o.tx ?? 0; ps.ty[i] = o.ty ?? 0; ps.tag[i] = o.tag ?? 0;
    return i;
  };
  D.kill = i => {
    const j = --ps.n;
    if (i !== j) for (const k of FIELDS) ps[k][i] = ps[k][j];
  };

  /** A ring of particles (sparks, cinders, dust). */
  D.burst = (rng, x, y, n, o) => {
    for (let k = 0; k < n; k++) {
      const a = rng() * Math.PI * 2, s = (o.speed ?? 1) * (0.3 + rng() * 0.7);
      D.spawn({ ...o, x: x + (rng() - 0.5) * (o.spread ?? 1), y: y + (rng() - 0.5) * (o.spread ?? 1), vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        z: o.z ?? 0.5, vz: (o.up ?? 0) * (0.4 + rng() * 0.8), life: (o.life ?? 30) * (0.6 + rng() * 0.8),
        rgb: o.palette ? o.palette[(rng() * o.palette.length) | 0] : o.rgb });
    }
  };

  /**
   * Drag every particle within `R` of (x, y) toward it (a black hole, later a whirlwind spell).
   * swirl adds a sideways push so things circle as they fall in. `eat` = particles closer than
   * this are swallowed. Returns how many were swallowed.
   */
  D.pull = (x, y, R, strength, { swirl = 0, lift = 0, eat = 0 } = {}) => {
    let ate = 0;
    for (let i = ps.n - 1; i >= 0; i--) {
      let dx = x - ps.x[i]; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
      const dy = y - ps.y[i], d = Math.hypot(dx, dy);
      if (d > R) continue;
      if (d < eat) { D.kill(i); ate++; continue; }
      const f = strength * (1 - d / R) / Math.max(1, d);
      ps.vx[i] = ps.vx[i] * 0.94 + dx * f - dy * f * swirl;
      ps.vy[i] = ps.vy[i] * 0.94 + dy * f + dx * f * swirl;
      if (lift && ps.z[i] < 8) { ps.vz[i] += lift; if (!ps.grav[i]) ps.grav[i] = 0.03; }
    }
    return ate;
  };

  /** Put a rubble cell where a piece landed (or grow the heap there) and start its fade clock. */
  function landRubble(x, y) {
    const at = sim.cell(x, y); if (!at) return false;
    const { c, i } = at;
    const m = c.mat[i], g = c.ground[i];
    if (c.part[i] || M.flag.road[g] || (m && M.flag.road[m])) return false;
    if (m === M.id.rubble) { if (c.tall[i] < 3) { c.tall[i]++; mark(c); } return true; }
    if (m) return false;
    if (!M.walk[g]) return false;       // sea ice and the like
    c.mat[i] = M.id.rubble; c.tall[i] = 1; c.hp[i] = 255; c.life[i] = 0; c.flag[i] &= ~(BURN | WET);
    mark(c);
    S.rubble.push(((x % W) + W) % W, y, sim.tick + Math.round((fadeSecs + sim.rng() * fadeJitter) * 20));
    D.landed++;
    return true;
  }
  D.landRubble = landRubble;

  function land(i) {
    const k = ps.kind[i];
    const x = Math.floor(ps.x[i]), y = Math.floor(ps.y[i]);
    if (k === P.fireball) { for (const f of D.landers) if (f(i, x, y, ps.tag[i])) break; return; }
    const at = sim.cell(x, y); if (!at) return;
    const { c, i: ci } = at;
    const m = c.mat[ci];
    if (k === P.cinder) {
      if (m && M.douses[m]) return;
      if (sim.rng() < 0.2) sim.rules.ignite(c, ci);
      else { c.temp[ci] = Math.min(255, c.temp[ci] + 40); sim.wake(c); }
    } else if (k === P.debris) {
      if (m && M.liquid[m]) return;                         // a splash, nothing more
      if (ps.glow[i] > 0.3) {
        // burning debris lights what it lands on (or the ground under it)
        if (!sim.rules.ignite(c, ci)) { c.temp[ci] = Math.min(255, c.temp[ci] + 80); sim.wake(c); }
        return;
      }
      if (ps.mat[i]) landRubble(x, y);
    } else if (k === P.drop) {
      if (c.flag[ci] & BURN) { c.flag[ci] &= ~BURN; c.temp[ci] = M.ambient + 20; if (m === M.id.fire) { c.mat[ci] = 0; c.tall[ci] = 0; } }
      c.flag[ci] |= WET; mark(c);
    }
  }

  /** One tick of every particle in flight, then any rubble whose time is up fades away. */
  D.step = () => {
    if (lastTick === sim.tick) return;
    lastTick = sim.tick;
    for (let i = ps.n - 1; i >= 0; i--) {
      ps.life[i]--;
      const k = ps.kind[i];
      if (k === P.sucked) {
        // straight toward its target, faster as it gets close; gone when it arrives
        let dx = ps.tx[i] - ps.x[i]; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
        const dy = ps.ty[i] - ps.y[i], d = Math.hypot(dx, dy);
        if (d < 0.8 || ps.life[i] <= 0) { D.kill(i); continue; }
        const s = Math.min(d, 0.15 + 2.5 / (d + 1));
        ps.x[i] += dx / d * s + dy / d * s * 0.6; ps.y[i] += dy / d * s - dx / d * s * 0.6;
        ps.z[i] = Math.min(4, ps.z[i] + 0.05);
        continue;
      }
      ps.x[i] += ps.vx[i]; ps.y[i] += ps.vy[i];
      if (ps.grav[i]) { ps.z[i] += ps.vz[i]; ps.vz[i] -= ps.grav[i]; }
      if (k === P.dust) { ps.vx[i] *= 0.95; ps.vy[i] *= 0.95; }
      if (ps.x[i] < 0) ps.x[i] += W; else if (ps.x[i] >= W) ps.x[i] -= W;
      if (ps.y[i] < 0 || ps.y[i] >= H) { D.kill(i); continue; }
      const landed = ps.grav[i] && ps.z[i] <= 0;
      if (landed || ps.life[i] <= 0) { if (landed) land(i); D.kill(i); }
    }
    if (sim.tick % 20 === 0 && S.rubble.length) fade();
  };

  function fade() {
    const R = S.rubble, t = sim.tick;
    let o = 0;
    for (let k = 0; k < R.length; k += 3) {
      if (R[k + 2] > t) { R[o++] = R[k]; R[o++] = R[k + 1]; R[o++] = R[k + 2]; continue; }
      const at = sim.cell(R[k], R[k + 1]);
      if (at && at.c.mat[at.i] === M.id.rubble) {
        const { c, i } = at;
        if (c.tall[i] > 1) { c.tall[i]--; R[o++] = R[k]; R[o++] = R[k + 1]; R[o++] = t + 400; }   // a heap goes down a step at a time
        else { c.mat[i] = 0; c.tall[i] = 0; c.hp[i] = 0; D.faded++; }
        mark(c);
      }
    }
    R.length = o;
  }

  /** Particles inside a world rect (x unwrapped near it): flat [x, y, z, r, g, b, glow, kind, ...]. */
  D.view = (rect, max = 1800) => {
    const out = [];
    let n = 0;
    for (let i = 0; i < ps.n && n < max; i++) {
      let x = ps.x[i], y = ps.y[i];
      if (rect) { while (x < rect.x0) x += W; while (x > rect.x1) x -= W; if (x < rect.x0 || y < rect.y0 - 10 || y > rect.y1 + 10) continue; }
      out.push(+x.toFixed(1), +y.toFixed(1), +ps.z[i].toFixed(1), ps.r[i], ps.g[i], ps.b[i], ps.glow[i] > 0.3 ? 1 : 0, ps.kind[i]);
      n++;
    }
    return out;
  };

  return D;
}
