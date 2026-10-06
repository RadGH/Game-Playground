// Thousandvale — what a town perimeter promises (stream B, play-test 4 S7), as one function the test
// (tests/B/walls.test.js, on the checked-in files) and the bake tools (on a fresh in-memory bake) both call.
//
//   checkWalls({ P, t, nav, discs }) -> [problem strings]   (empty = every promise kept)
//     P     placements.json `placements`
//     t     terrain reader (biomeAt, biomes, waterAt)      nav  { at(x, z) -> bits, passable(x, z) }
//     discs stream E's placements that the wall must never cut [{ x, z, r, id }]
//
// The promises:
//   1. every planned settlement has a perimeter, and every perimeter has at least one gate
//   2. nothing you walk on is under a wall: no road placement within its half-width of a run or tower, no street / path
//      centreline within 0.75 m of one, and no painted road sample centred under a run — so a road that reaches the
//      wall reaches it at a gate
//   3. every gate faces OUT along its road: its `out` vector points away from the town and runs with the road
//      (the way's own direction at the gate, or the painted approach's) to within 20 degrees
//   4. no wall across a building plot or one of E's discs
//   5. walkable through every gate (nav.passable all along the road from 8 m outside to 8 m inside), and NOT walkable
//      across the middle of any run
//   6. every gate's outside reaches the town square over nav (a flood fill inside the town circle + 30 m)
import { NAV } from '../../js/rules/terrain-read.js';

const segDist = (x, z, a, b) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-9;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
};
const polyDist = (pts, x, z) => { let d = Infinity; for (let k = 0; k < pts.length - 1; k++) d = Math.min(d, segDist(x, z, pts[k], pts[k + 1])); return d; };
/** Direction of a polyline at its point nearest (x, z). */
function heading(pts, x, z) {
  let best = Infinity, u = null;
  for (let k = 0; k < pts.length - 1; k++) {
    const d = segDist(x, z, pts[k], pts[k + 1]);
    if (d < best) { const dx = pts[k + 1][0] - pts[k][0], dz = pts[k + 1][1] - pts[k][1], L = Math.hypot(dx, dz); if (L > 1e-6) { best = d; u = [dx / L, dz / L]; } }
  }
  return u;
}

export function checkWalls({ P, t, nav, discs = [] }) {
  const bad = [];
  const walls = P.filter(p => p.kind === 'town_wall');
  const roadId = t.biomes.length - 1;
  const ways = P.filter(p => ['road', 'street', 'path'].includes(p.kind)).map(p => ({ id: p.id, kind: p.kind, width: p.data.width || 3, pts: p.data.pts }));
  for (const s of P.filter(p => p.kind === 'settlement' && p.data.planned)) {
    const w = walls.find(q => q.data.town === s.id);
    if (!w) { bad.push(`${s.id}: no perimeter`); continue; }
    if (!w.data.gates.length) bad.push(`${s.id}: a perimeter with no gate`);
  }
  for (const W of walls) {
    const d = W.data, cx = W.x, cz = W.z, half = d.thick / 2, name = d.town;
    const segs = d.runs.flatMap(r => r.slice(1).map((b, k) => [r[k], b]));
    const onWall = (x, z, extra = 0) => segs.some(([a, b]) => segDist(x, z, a, b) <= half + extra) || d.towers.some(tw => Math.hypot(tw.x - x, tw.z - z) <= 2.4 + extra);
    // 2. ways and painted road
    for (const w of ways) {
      for (let k = 0; k < w.pts.length - 1; k++) {
        const a = w.pts[k], b = w.pts[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.5));
        for (let q = 0; q <= n; q++) { const x = a[0] + (b[0] - a[0]) * q / n, z = a[1] + (b[1] - a[1]) * q / n; if (onWall(x, z, w.kind === 'road' ? w.width / 2 - 0.25 : 0.75)) { bad.push(`${name}: ${w.kind} ${w.id} runs under the wall at ${x.toFixed(1)},${z.toFixed(1)}`); q = n; k = w.pts.length; } }
      }
    }
    // painted road: every 2 m ground sample whose centre is under a run (the paint is a 2 m grid, so test sample centres)
    {
      const ST = 2, R = d.radius;
      for (let j = Math.floor((cz - R - 4) / ST); j <= Math.ceil((cz + R + 4) / ST); j++) for (let i = Math.floor((cx - R - 4) / ST); i <= Math.ceil((cx + R + 4) / ST); i++) {
        const x = i * ST, z = j * ST, r = Math.hypot(x - cx, z - cz); if (Math.abs(r - R) > 3) continue;
        if (t.biomeAt(x, z) === roadId && segs.some(([a, b]) => segDist(x, z, a, b) <= half + 0.75)) { bad.push(`${name}: painted road under the wall at ${x},${z}`); i = Infinity; j = Infinity; }
      }
    }
    // 4. plots and E's discs
    for (const p of P.filter(p => p.kind === 'building' && p.data.town === name)) {
      const c = Math.cos(p.data.angle), s = Math.sin(p.data.angle);
      for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const lx = u * p.data.w / 2, lz = v * p.data.d / 2, x = p.x + lx * c - lz * s, z = p.z + lx * s + lz * c;
        if (onWall(x, z)) { bad.push(`${name}: wall across plot ${p.id}`); break; }
      }
    }
    for (const q of discs) if (Math.hypot(q.x - cx, q.z - cz) < d.radius + 40 && onWall(q.x, q.z, q.r)) bad.push(`${name}: wall across E's ${q.id}`);
    // 3 + 5. gates
    for (const g of d.gates) {
      const rx = g.x - cx, rz = g.z - cz;
      if (g.out[0] * rx + g.out[1] * rz <= 0) bad.push(`${name} ${g.id}: faces into the town`);
      const way = ways.find(w => w.id === g.way || w.id.startsWith(g.way + '_'));
      const appr = (g.approaches || []).find(a => a.way === g.way && !a.led);
      const src = appr && appr.pts.length > 1 ? appr.pts : way ? way.pts : null;
      const u = src ? heading(src, g.x, g.z) : null;
      if (u) { const c = Math.abs(u[0] * g.out[0] + u[1] * g.out[1]); if (c < Math.cos(20 * Math.PI / 180)) bad.push(`${name} ${g.id}: turned ${(Math.acos(c) * 180 / Math.PI).toFixed(0)} deg off its road`); }
      for (let s = -3; s <= 8; s += 0.5) {
        const x = g.x + g.out[0] * s, z = g.z + g.out[1] * s;
        if (!nav.passable(x, z)) {
          const b = nav.at(x, z);
          if (b & NAV.DEEP) continue;           // a gate at a bridge end: the deck is the way (stamped WALK)
          bad.push(`${name} ${g.id}: blocked ${s} m along its road (nav ${b})`); break;
        }
      }
    }
    for (const [a, b] of segs) {
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      if (nav.passable(mx, mz) && !(nav.at(mx, mz) & NAV.DEEP)) bad.push(`${name}: the wall at ${mx.toFixed(1)},${mz.toFixed(1)} is not solid in nav`);
    }
    // 6. flood from the square over nav, inside the town circle + 30 m: every gate's outside must be reached
    const sq = P.find(p => p.kind === 'town_square' && p.data.town === name);
    if (sq && d.gates.length) {
      const R = d.radius + 30, STEP = 2, x0 = cx - R, z0 = cz - R, n = Math.ceil(2 * R / STEP) + 1;
      const seen = new Uint8Array(n * n), q = [];
      const idx = (x, z) => Math.round((z - z0) / STEP) * n + Math.round((x - x0) / STEP);
      const ok = (i, j) => i >= 0 && j >= 0 && i < n && j < n && nav.passable(x0 + i * STEP, z0 + j * STEP);
      // start at the nearest passable sample to the square
      let si = Math.round((sq.x - x0) / STEP), sj = Math.round((sq.z - z0) / STEP);
      for (let r = 0; r < 6 && !ok(si, sj); r++) { si += 1; }
      if (ok(si, sj)) { seen[sj * n + si] = 1; q.push(sj * n + si); }
      while (q.length) {
        const k = q.pop(), i = k % n, j = (k / n) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (ok(a, b) && !seen[b * n + a]) { seen[b * n + a] = 1; q.push(b * n + a); } }
      }
      for (const g of d.gates) {
        let reached = false;
        for (let s = 6; s <= 12 && !reached; s += 1) { const x = g.x + g.out[0] * s, z = g.z + g.out[1] * s, k = idx(x, z); if (k >= 0 && k < seen.length && seen[k]) reached = true; }
        if (!reached) bad.push(`${name} ${g.id}: its outside does not reach the square over nav`);
      }
    }
  }
  return bad;
}
