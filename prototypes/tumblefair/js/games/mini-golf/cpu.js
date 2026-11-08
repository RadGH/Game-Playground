// Mini Golf CPU: reads the hole the way a person pictures putts — tries lines and strengths on the public course
// (spread over a few ticks) and scores where each one stops by the distance AROUND the walls to the cup — then points
// the stick and holds A until the meter reads its power. Family tries few lines and its aim and release are shaky;
// Tricky tries more lines and lets go close to the mark (never exact).
import { A, by, gauss, readDelay } from '../cpu-kit.js';
import { simulatePutt, puttSpeed, assistYaw, clearLine } from '../golf-kit.js';
import { buildHole } from './holes.js';

export function createCpu(c) {
  const sk = c.skill, H = c.init.holes[0], L = c.init.level;
  const course = { ...H.course, cup: { x: H.cup.x, z: H.cup.z, r: L.cupR, cap: L.cap } };
  // the same hole's wall lookup grid (built from the public hole layout, cached) so each pictured putt is quick
  try { const near = buildHole(H.n - 1, c.difficulty).course.near; if (near) Object.defineProperty(course, 'near', { value: near, enumerable: false }); } catch { /* plain walls work too */ }
  let far = null, plan = null, key = null, search = null;
  const dirs = by(sk, [8, 18, 30]), pows = by(sk, [5, 8, 12]);
  function* think(bx, bz, t) {
    if (!far) far = yield* pathSteps(course, course.cup, H.areas || []);
    let best = null;
    const tryShot = (yaw, p) => {
      const r = simulatePutt(course, bx, bz, assistYaw(course, bx, bz, yaw, [course.cup], L.help), puttSpeed(p, L.max), t, 9);
      const d = r.in ? -1 : far(r.x, r.z);
      if (!best || d < best.d) best = { d, yaw, p };
    };
    const yaws = [Math.atan2(H.cup.x - bx, H.cup.z - bz), ...Array.from({ length: dirs }, (_, i) => i * Math.PI * 2 / dirs + c.rng() * 0.1)];
    for (const yaw of yaws) for (let k = 1; k <= pows; k++) { tryShot(yaw, k / pows); yield; }
    if (sk.level > 0) for (let s = -3; s <= 3; s++) { for (const dp of [-0.05, 0, 0.05]) { tryShot(best.yaw + s * 0.025, Math.max(0.03, Math.min(1, best.p + dp))); yield; } }
    return best;
  }
  function aimFrom(best, t) {                       // a person's hand: the line and the release are a little off
    const p = Math.min(1, Math.max(0.03, best.p * (1 + gauss(c.rng) * by(sk, [0.2, 0.09, 0.035]))));
    const hold = p * L.period / 2 + gauss(c.rng) * sk.tapMs / 3000;
    return { yaw: best.yaw + gauss(c.rng) * by(sk, [0.12, 0.055, 0.02]), n: Math.max(1, Math.round(hold / 0.05)), held: 0, at: t + readDelay(sk, c.rng, 0.8) };
  }
  return {
    tick(v) {
      const g = v.g; if (!g || g.ph !== 'play') { plan = search = null; return null; }
      const row = (g.b || []).find(r => r[0] === c.pid);
      if (!row || row[3] !== 0) { plan = search = null; return null; }
      const k = row[4] + ':' + row[1] + ':' + row[2];
      if (k !== key) { key = k; plan = null; search = think(row[1], row[2], g.t + 2); }
      if (search) {
        for (let i = 0; i < 5 && search; i++) { const r = search.next(); if (r.done) { search = null; plan = aimFrom(r.value, v.t); } }
        return null;
      }
      if (!plan || v.t < plan.at) return null;
      const mx = Math.sin(plan.yaw), mz = Math.cos(plan.yaw);
      if (plan.held < plan.n) { plan.held++; return { mx, mz, b: A }; }
      return { mx, mz, b: 0 };
    },
  };
}

/** The distance round the walls to the cup on a 0.25 m grid (the same idea as sim.js pathField), built a slice per
 *  yield so a room's 50 ms tick never stalls on it. Local copy: the sim's version runs in one go. */
function* pathSteps(course, cup, areas, cell = 0.25) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const A of areas) for (const [x, z] of A.outer) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const W = Math.ceil((x1 - x0) / cell) + 1, Hh = Math.ceil((z1 - z0) / cell) + 1, D = new Float32Array(Math.max(1, W * Hh)).fill(Infinity);
  const at = (x, z) => [Math.round((x - x0) / cell), Math.round((z - z0) / cell)];
  const heap = [], push = k => { heap.push(k); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (D[heap[p]] <= D[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && D[heap[l]] < D[heap[m]]) m = l; if (r < heap.length && D[heap[r]] < D[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const [ci, cj] = at(cup.x, cup.z);
  if (ci >= 0 && ci < W && cj >= 0 && cj < Hh) { D[cj * W + ci] = 0; push(cj * W + ci); }
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  const done = new Uint8Array(D.length); let work = 0;
  while (heap.length) {
    const c = pop(); if (done[c]) continue; done[c] = 1;
    const i = c % W, j = (c - i) / W;
    for (const [di, dj, w] of N) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= Hh) continue;
      const k = b * W + a, nd = D[c] + w * cell; if (nd >= D[k]) continue;
      if (!clearLine(course, x0 + i * cell, z0 + j * cell, x0 + a * cell, z0 + b * cell)) continue;
      D[k] = nd; push(k);
    }
    if (++work % 25 === 0) yield;
  }
  return (x, z) => { const [i, j] = at(x, z); return i >= 0 && j >= 0 && i < W && j < Hh ? D[j * W + i] : Infinity; };
}
