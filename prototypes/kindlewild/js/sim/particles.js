// Free-flying particles: sparks, embers, debris, rain drops, magic motes, breath flames,
// projectiles. PURE. Structure of arrays, a fixed pool. A particle with height z flies in an arc
// (drawn lifted by z, with a shadow) and LANDS when z reaches 0 — what landing does depends on its
// kind: an ember may light what it lands on, debris becomes a cell, a drop wets or douses.

import { setCell, ignite, WET, BURN } from './world.js';

export const P = { spark: 0, ember: 1, debris: 2, drop: 3, mote: 4, flame: 5, bolt: 6, smoke: 7, star: 8, shard: 9, frost: 10, blood: 11 };
const MAX = 9000;

export function createParticles() {
  return {
    n: 0,
    x: new Float32Array(MAX), y: new Float32Array(MAX), z: new Float32Array(MAX),
    vx: new Float32Array(MAX), vy: new Float32Array(MAX), vz: new Float32Array(MAX),
    life: new Float32Array(MAX), max: new Float32Array(MAX),
    kind: new Uint8Array(MAX), mat: new Uint8Array(MAX),
    r: new Uint8Array(MAX), g: new Uint8Array(MAX), b: new Uint8Array(MAX),
    glow: new Float32Array(MAX), grav: new Float32Array(MAX),
    owner: new Int32Array(MAX), dmg: new Float32Array(MAX),
    onLand: [],   // callbacks by id for projectiles (spells)
    cb: new Int16Array(MAX),
  };
}

/** Spawn one particle. Returns its index or -1 when the pool is full. */
export function spawn(ps, o) {
  if (ps.n >= MAX) return -1;
  const i = ps.n++;
  ps.x[i] = o.x; ps.y[i] = o.y; ps.z[i] = o.z ?? 0;
  ps.vx[i] = o.vx ?? 0; ps.vy[i] = o.vy ?? 0; ps.vz[i] = o.vz ?? 0;
  ps.life[i] = ps.max[i] = o.life ?? 30;
  ps.kind[i] = o.kind ?? P.spark;
  ps.mat[i] = o.mat ?? 0;
  const c = o.rgb || [255, 200, 120];
  ps.r[i] = c[0]; ps.g[i] = c[1]; ps.b[i] = c[2];
  ps.glow[i] = o.glow ?? 0;
  ps.grav[i] = o.grav ?? 0;
  ps.owner[i] = o.owner ?? -1;
  ps.dmg[i] = o.dmg ?? 0;
  ps.cb[i] = o.onLand != null ? o.onLand : -1;
  return i;
}

function kill(ps, i) {
  const j = --ps.n;
  if (i === j) return;
  for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'max', 'kind', 'mat', 'r', 'g', 'b', 'glow', 'grav', 'owner', 'dmg', 'cb']) ps[k][i] = ps[k][j];
}

/** Step every particle; `hooks.land(i, x, y)` lets spells and creatures react to projectiles. */
export function stepParticles(ps, w, rng, hooks) {
  const M = w.M, W = w.W, H = w.H;
  for (let i = ps.n - 1; i >= 0; i--) {
    ps.life[i]--;
    const k = ps.kind[i];
    ps.x[i] += ps.vx[i]; ps.y[i] += ps.vy[i];
    if (ps.grav[i]) { ps.z[i] += ps.vz[i]; ps.vz[i] -= ps.grav[i]; }
    if (k === P.smoke || k === P.mote || k === P.star) { ps.vx[i] *= 0.96; ps.vy[i] *= 0.96; }
    const x = ps.x[i] | 0, y = ps.y[i] | 0;
    const out = x < 0 || y < 0 || x >= W || y >= H;
    const landed = ps.grav[i] && ps.z[i] <= 0;
    if (out) { kill(ps, i); continue; }
    const cell = y * W + x;
    if (landed || ps.life[i] <= 0) {
      if (landed) land(ps, i, w, cell, rng, hooks);
      kill(ps, i);
      continue;
    }
    // flying things that hit a solid cell low down stop there
    if (k === P.flame || k === P.bolt) {
      const m = w.mat[cell];
      if (k === P.flame) {
        // breath / fire jets: heat what they pass over
        if (ps.z[i] < 3) {
          w.temp[cell] = Math.min(255, w.temp[cell] + 26);
          if (M.ignite[m] || (m === 0 && M.ignite[w.ground[cell]])) { if (rng() < 0.25) ignite(w, cell); }
          w.touch(cell);
        }
        if (M.solid[m] && ps.z[i] < 4) { ps.life[i] = 0; }
        // dragon breath splashes on a barrier dome
        if (w.shield && w.shield[cell]) { ps.life[i] = 0; }
      }
      if (hooks && hooks.fly) hooks.fly(i, x, y);
      if (k === P.bolt && M.solid[m] && ps.z[i] < 3) { if (hooks && hooks.land) hooks.land(i, x, y); kill(ps, i); continue; }
    }
  }
}

function land(ps, i, w, cell, rng, hooks) {
  const M = w.M;
  const k = ps.kind[i];
  if (ps.cb[i] >= 0 || k === P.bolt) { if (hooks && hooks.land) hooks.land(i, ps.x[i] | 0, ps.y[i] | 0); return; }
  if (k === P.ember || k === P.flame) {
    const m = w.mat[cell];
    if (M.douses[m]) return;
    if (rng() < (k === P.flame ? 0.6 : 0.2)) ignite(w, cell);
    else { w.temp[cell] = Math.min(255, w.temp[cell] + 40); w.touch(cell); }
  } else if (k === P.debris) {
    const m = ps.mat[i];
    if (!m) return;
    if (w.mat[cell] === 0) {
      setCell(w, cell, m);
      if (ps.glow[i] > 0.3 && M.ignite[m]) ignite(w, cell, true);
    } else if (ps.glow[i] > 0.3) { ignite(w, cell); }
  } else if (k === P.drop) {
    const m = w.mat[cell];
    if (w.flag[cell] & BURN) { if (rng() < 0.5) { w.flag[cell] &= ~BURN; w.temp[cell] = M.ambient + 30; if (m === M.id.fire) setCell(w, cell, 0); } }
    w.flag[cell] |= WET;
    if (ps.mat[i] && rng() < 0.05 && (m === 0 || w.mat[cell] === ps.mat[i])) {
      if (m === 0) setCell(w, cell, ps.mat[i], 2); else w.life[cell] = Math.min(255, w.life[cell] + 2);
    }
    w.touch(cell);
  } else if (k === P.frost) {
    w.temp[cell] = Math.max(0, w.temp[cell] - 40);
    if (w.flag[cell] & BURN) { w.flag[cell] &= ~BURN; if (w.mat[cell] === M.id.fire) setCell(w, cell, 0); }
    w.touch(cell);
  }
}

/** A burst of particles in a ring — sparks, debris etc. */
export function burst(ps, rng, x, y, n, o) {
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2;
    const s = (o.speed ?? 1) * (0.3 + rng() * 0.7);
    spawn(ps, {
      ...o, x: x + (rng() - 0.5) * (o.spread ?? 1), y: y + (rng() - 0.5) * (o.spread ?? 1),
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      z: o.z ?? 0.5, vz: (o.up ?? 0) * (0.4 + rng() * 0.8),
      life: (o.life ?? 30) * (0.6 + rng() * 0.8),
      rgb: o.palette ? o.palette[(rng() * o.palette.length) | 0] : o.rgb,
    });
  }
}
