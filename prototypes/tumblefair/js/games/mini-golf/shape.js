// MINI GOLF SHAPES — turns a hole drawn as simple pieces (thick strokes along a centre-line, rectangles, circles,
// polygons, minus cut-outs) into the thin walls the golf kit bounces balls off. Pure: no DOM, no randomness.
//
// Why not offset each polyline into two walls by hand: a letter like "8" or "3" has strokes that cross and merge, and
// two hand-offset walls would cross the corridor where they meet. Instead the pieces are added into one signed
// distance field (negative = on the course), its zero line is traced with marching squares on a 5 cm grid, and each
// traced loop is simplified (Ramer-Douglas-Peucker, 2.5 cm) into straight wall pieces. The loops are closed by
// construction, so there is never a gap a ball can leak through, every corner meets, and a counter (the hole in an
// "O" or "8") comes out as its own inner loop.
//
// Pieces (metres, +x right, +z toward the camera, so -z is the TOP of the screen):
//   { stroke: [[x, z], ...], r }        a corridor of half-width r along a centre-line (round ends, round outer bends)
//   { rect: [x0, z0, x1, z1] }          { circle: [x, z, r] }          { poly: [[x, z], ...] }
// A hole is the union of its `shapes` minus the union of its `cuts`.

/** Points along an arc: centre (cx, cz), radius r, from angle a0 to a1 in DEGREES (0 = +x, 90 = +z, i.e. down the screen). */
export function arc(cx, cz, r, a0, a1, step = 8) {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / step)), out = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
  return out;
}
/** Points round an ellipse, closed (the first point repeated at the end). */
export function ellipse(cx, cz, rx, rz, a0 = 0, a1 = 360, step = 8) {
  return arc(0, 0, 1, a0, a1, step).map(([x, z]) => [cx + x * rx, cz + z * rz]);
}

function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / L));
  return Math.hypot(px - ax - ex * t, pz - az - ez * t);
}
function polyDist(px, pz, P) {
  let d = Infinity, inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    d = Math.min(d, segDist(px, pz, ax, az, bx, bz));
    if ((az > pz) !== (bz > pz) && px < ax + (bx - ax) * (pz - az) / (bz - az)) inside = !inside;
  }
  return inside ? -d : d;
}
/** Signed distance from (x, z) to one piece (negative inside). */
export function pieceDist(S, x, z) {
  if (S.stroke) { let d = Infinity; const P = S.stroke; for (let i = 1; i < P.length; i++) d = Math.min(d, segDist(x, z, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1])); return d - S.r; }
  if (S.circle) return Math.hypot(x - S.circle[0], z - S.circle[1]) - S.circle[2];
  if (S.rect) {
    const [x0, z0, x1, z1] = S.rect, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, qx = Math.abs(x - cx) - (x1 - x0) / 2, qz = Math.abs(z - cz) - (z1 - z0) / 2;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  }
  if (S.poly) return polyDist(x, z, S.poly);
  return Infinity;
}
/** The hole's field: < 0 on the course. */
export function fieldOf(shapes, cuts = []) {
  return (x, z) => {
    let d = Infinity; for (const S of shapes) d = Math.min(d, pieceDist(S, x, z));
    for (const C of cuts) d = Math.max(d, -pieceDist(C, x, z));
    return d;
  };
}
/** The box round every piece, [x0, z0, x1, z1]. */
export function boundsOf(shapes) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  const add = (x, z, r = 0) => { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); z0 = Math.min(z0, z - r); z1 = Math.max(z1, z + r); };
  for (const S of shapes) {
    if (S.stroke) for (const [x, z] of S.stroke) add(x, z, S.r);
    else if (S.circle) add(S.circle[0], S.circle[1], S.circle[2]);
    else if (S.rect) { add(S.rect[0], S.rect[1]); add(S.rect[2], S.rect[3]); }
    else if (S.poly) for (const [x, z] of S.poly) add(x, z);
  }
  return [x0, z0, x1, z1];
}

/** Trace the zero line of field f over [x0..x1] x [z0..z1] (grid step h): closed loops of [x, z] points. */
export function traceLoops(f, [x0, z0, x1, z1], h = 0.05) {
  x0 -= 3 * h; z0 -= 3 * h; x1 += 3 * h; z1 += 3 * h;
  const nx = Math.ceil((x1 - x0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1, v = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const d = f(x0 + i * h, z0 + j * h); v[j * nx + i] = Math.abs(d) < 1e-9 ? 1e-9 : d; }   // never exactly 0
  const V = (i, j) => v[j * nx + i];
  // an edge's crossing point; edges keyed h:i,j (i,j)-(i+1,j) and v:i,j (i,j)-(i,j+1)
  const pt = new Map(), link = new Map();
  const cross = key => {
    if (pt.has(key)) return key;
    const [k, ij] = [key[0], key.slice(1).split(',').map(Number)], [i, j] = ij;
    const a = V(i, j), b = k === 'h' ? V(i + 1, j) : V(i, j + 1), t = a / (a - b);
    pt.set(key, k === 'h' ? [x0 + (i + t) * h, z0 + j * h] : [x0 + i * h, z0 + (j + t) * h]); return key;
  };
  const join = (a, b) => { cross(a); cross(b); (link.get(a) || link.set(a, []).get(a)).push(b); (link.get(b) || link.set(b, []).get(b)).push(a); };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = V(i, j) < 0, b = V(i + 1, j) < 0, c = V(i + 1, j + 1) < 0, d = V(i, j + 1) < 0;
    const T = 'h' + i + ',' + j, R = 'v' + (i + 1) + ',' + j, B = 'h' + i + ',' + (j + 1), L = 'v' + i + ',' + j;
    const code = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    switch (code) {
      case 0: case 15: break;
      case 1: case 14: join(L, T); break;
      case 2: case 13: join(T, R); break;
      case 4: case 11: join(R, B); break;
      case 8: case 7: join(B, L); break;
      case 3: case 12: join(L, R); break;
      case 6: case 9: join(T, B); break;
      case 5: case 10: {                                   // a saddle: the middle decides which corners connect
        const mid = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4 < 0;
        if ((code === 5) === mid) { join(L, B); join(T, R); } else { join(L, T); join(R, B); }
        break;
      }
    }
  }
  const loops = [], seen = new Set();
  for (const start of link.keys()) {
    if (seen.has(start)) continue;
    const loop = []; let prev = null, cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur); loop.push(pt.get(cur));
      const nb = link.get(cur), next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur; cur = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function rdp(P, tol) {
  if (P.length < 3) return P.slice();
  const [ax, az] = P[0], [bx, bz] = P[P.length - 1];
  let worst = -1, at = 0;
  for (let i = 1; i < P.length - 1; i++) { const d = segDist(P[i][0], P[i][1], ax, az, bx, bz); if (d > worst) { worst = d; at = i; } }
  if (worst <= tol) return [P[0], P[P.length - 1]];
  const A = rdp(P.slice(0, at + 1), tol), B = rdp(P.slice(at), tol);
  return [...A.slice(0, -1), ...B];
}
/** Simplify a closed loop (no point repeated) to a few straight pieces within `tol` metres of the traced line. */
export function simplifyLoop(loop, tol = 0.025) {
  let far = 0, fd = -1; for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1]); if (d > fd) { fd = d; far = i; } }
  const A = rdp(loop.slice(0, far + 1), tol), B = rdp([...loop.slice(far), loop[0]], tol);
  return [...A.slice(0, -1), ...B.slice(0, -1)];
}
const area = L => { let a = 0; for (let i = 0, j = L.length - 1; i < L.length; j = i++) a += (L[j][0] * L[i][1] - L[i][0] * L[j][1]); return a / 2; };
function inLoop(x, z, L) { let inside = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [ax, az] = L[j], [bx, bz] = L[i]; if ((az > z) !== (bz > z) && x < ax + (bx - ax) * (z - az) / (bz - az)) inside = !inside; } return inside; }
/** Group loops into areas of felt: an outer loop and the loops cut out of it (an odd number of loops deep = a hole). */
export function areasOf(loops) {
  const depth = loops.map((L, i) => loops.filter((M, k) => k !== i && Math.abs(area(M)) > Math.abs(area(L)) && inLoop(L[0][0], L[0][1], M)).length);
  const out = [];
  loops.forEach((L, i) => { if (depth[i] % 2 === 0) out.push({ outer: L, holes: [], i }); });
  loops.forEach((L, i) => {
    if (depth[i] % 2 === 0) return;
    const host = out.filter(A => Math.abs(area(A.outer)) > Math.abs(area(L)) && inLoop(L[0][0], L[0][1], A.outer)).sort((a, b) => Math.abs(area(a.outer)) - Math.abs(area(b.outer)))[0];
    host?.holes.push(L);
  });
  return out.map(({ outer, holes }) => ({ outer, holes }));
}

/**
 * A lookup grid: near(x, z) -> the walls within reach of a ball at (x, z). Cells `cell` metres square; a wall is filed
 * under every cell whose middle is within the cell's half-diagonal + `reach` of it (reach covers the ball's radius and
 * however far a ball can move in one slice of a step, with room to spare).
 */
export function nearGrid(walls, cell = 1, reach = 0.5) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const w of walls) { x0 = Math.min(x0, w.ax, w.bx); x1 = Math.max(x1, w.ax, w.bx); z0 = Math.min(z0, w.az, w.bz); z1 = Math.max(z1, w.az, w.bz); }
  x0 -= 2; z0 -= 2; x1 += 2; z1 += 2;
  const nx = Math.ceil((x1 - x0) / cell), nz = Math.ceil((z1 - z0) / cell), cells = Array.from({ length: nx * nz }, () => []), lim = cell * Math.SQRT1_2 + reach;
  for (const w of walls) {
    const i0 = Math.max(0, Math.floor((Math.min(w.ax, w.bx) - lim - x0) / cell)), i1 = Math.min(nx - 1, Math.floor((Math.max(w.ax, w.bx) + lim - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(w.az, w.bz) - lim - z0) / cell)), j1 = Math.min(nz - 1, Math.floor((Math.max(w.az, w.bz) + lim - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (segDist(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, w.ax, w.az, w.bx, w.bz) <= lim) cells[j * nx + i].push(w);
  }
  return (x, z) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
    return i < 0 || j < 0 || i >= nx || j >= nz ? walls : cells[j * nx + i];          // off the grid (never on a real hole): every wall
  };
}

const r2 = v => Math.round(v * 100) / 100;
/** Pieces -> { loops, walls, areas } (rounded to the centimetre, so the same pieces always give the same walls). */
export function buildWalls(shapes, cuts = [], { h = 0.05, tol = 0.025 } = {}) {
  const f = fieldOf(shapes, cuts);
  const loops = traceLoops(f, boundsOf(shapes), h).map(L => simplifyLoop(L, tol).map(([x, z]) => [r2(x), r2(z)]))
    .map(L => L.filter((p, i) => { const q = L[(i + L.length - 1) % L.length]; return p[0] !== q[0] || p[1] !== q[1]; }))
    .filter(L => L.length >= 3 && Math.abs(area(L)) > 0.05);
  const walls = [];
  for (const L of loops) for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; walls.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1] }); }
  return { loops, walls, areas: areasOf(loops), field: f };
}
