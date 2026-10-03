// Hunters vs Farmers — the world generator (docs/hvf-PLAN.md §3). Pure and deterministic: integer
// hash noise, the sim's sfc32 streams, sortBy only, mathx trig, no Math.pow / random / clocks.
//
//   generateWorld(gen, { seed, size, farmers, hunters })  ->  world (static, never in state)
//
// gen = data/hvf/mapgen.json. The world is a grid of 2 m cells:
//   cells: Uint8Array of KIND, level: Uint8Array (0 ground, 1 plateau), look: Uint8Array (tree looks),
//   graph { nodes, edges }, hollows (hidden build spots with AI build slots), features (named
//   landmarks), commons, kennels, doors (the single choppable tree that closes a hollow), metrics.
// A world that fails validation is rebuilt with seed + k (k <= gen.validate.retries); after that the
// generator throws. Cell (cx, cz) covers world x in [cx*cell, (cx+1)*cell), z likewise.

import { seedStream, next, int, range } from '../../rng.js';
import { sortBy } from '../../order.js';
import { sin, cos, TAU, PI } from '../../mathx.js';

export const KIND = { grass: 0, trail: 1, tree: 2, briar: 3, tallgrass: 4, rock: 5, water: 6, ford: 7, cliff: 8, ramp: 9 };
export const KIND_NAMES = ['grass', 'trail', 'tree', 'briar', 'tallgrass', 'rock', 'water', 'ford', 'cliff', 'ramp'];
const K = KIND;
// who may stand on a kind (doors and levels are handled by passable())
export const WALK_FARMER = [1, 1, 0, 1, 1, 0, 0, 1, 0, 1];
export const WALK_HUNTER = [1, 1, 0, 0, 1, 0, 0, 1, 0, 1];
export const BLOCKS_SIGHT = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
export const CHOPPABLE = [0, 0, 1, 1, 0, 0, 0, 0, 0, 0];
const OPEN = [1, 1, 0, 0, 1, 0, 0, 0, 0, 0];   // grass, trail, tallgrass: "open ground"

// ── noise: integer hash value noise (no trig, no pow) ─────────────────────────────────────────────
function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function valueNoise(x, y, scale, s) {
  const fx = x / scale, fy = y / scale;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  let tx = fx - ix, ty = fy - iy;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}
function fbm(x, y, scale, s, o2) { return (valueNoise(x, y, scale, s) + o2 * valueNoise(x, y, scale / 2.1, s + 1013)) / (1 + o2); }

// ── grid helpers ───────────────────────────────────────────────────────────────────────────────────
function makeGrid(cols, rows) {
  const n = cols * rows;
  const g = {
    cols, rows, n,
    inb: (x, z) => x >= 0 && z >= 0 && x < cols && z < rows,
    at: (x, z) => z * cols + x,
  };
  return g;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** 4-neighbour BFS. sources: cell indices; pass(i) -> bool. Returns { dist: Int32Array (-1 = never), prev }. */
function bfs(G, sources, pass, stopAt = null, buf = null) {
  // buf: reusable { dist, prev, q } scratch (the many short path searches would otherwise allocate
  // three grid-sized arrays each)
  const dist = buf ? buf.dist.fill(-1) : new Int32Array(G.n).fill(-1);
  const prev = buf ? buf.prev : new Int32Array(G.n).fill(-1);
  const q = buf ? buf.q : new Int32Array(G.n);
  let h = 0, t = 0;
  for (const s of sources) if (dist[s] < 0) { dist[s] = 0; prev[s] = -1; q[t++] = s; }
  while (h < t) {
    const i = q[h++];
    if (stopAt && stopAt(i)) return { dist, prev, hit: i };
    const x = i % G.cols, cols = G.cols;
    // neighbours in N4 order (+x, -x, +z, -z), unrolled: this is the generator's hottest loop
    for (let k = 0; k < 4; k++) {
      let j;
      if (k === 0) { if (x + 1 >= cols) continue; j = i + 1; }
      else if (k === 1) { if (x === 0) continue; j = i - 1; }
      else if (k === 2) { j = i + cols; if (j >= G.n) continue; }
      else { j = i - cols; if (j < 0) continue; }
      if (dist[j] >= 0 || !pass(j)) continue;
      dist[j] = dist[i] + 1; prev[j] = i; q[t++] = j;
    }
  }
  return { dist, prev, hit: -1 };
}

function components(G, mask) {
  const label = new Int32Array(G.n).fill(-1), comps = [];
  for (let i = 0; i < G.n; i++) {
    if (!mask[i] || label[i] >= 0) continue;
    const id = comps.length, cells = [i];
    label[i] = id;
    for (let k = 0; k < cells.length; k++) {
      const c = cells[k], x = c % G.cols, z = (c / G.cols) | 0;
      for (const [dx, dz] of N4) {
        const nx = x + dx, nz = z + dz;
        if (!G.inb(nx, nz)) continue;
        const j = nz * G.cols + nx;
        if (mask[j] && label[j] < 0) { label[j] = id; cells.push(j); }
      }
    }
    comps.push(cells);
  }
  return { label, comps };
}

function discCells(G, cx, cz, r) {
  const out = [], R = Math.ceil(r), r2 = r * r + 0.25;
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dz * dz > r2) continue;
    const x = cx + dx, z = cz + dz;
    if (G.inb(x, z)) out.push(z * G.cols + x);
  }
  return out;
}

/** Midpoint-displaced polyline between two points (cell units). */
function noisyLine(rng, a, b, depth, wobble) {
  let pts = [a, b];
  for (let d = 0; d < depth; d++) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      const dx = q.x - p.x, dz = q.z - p.z, len = Math.sqrt(dx * dx + dz * dz) || 1;
      const off = (next(rng) - 0.5) * 2 * wobble * len;
      out.push({ x: (p.x + q.x) / 2 - dz / len * off, z: (p.z + q.z) / 2 + dx / len * off });
      out.push(q);
    }
    pts = out;
  }
  return pts;
}

/** Cells whose centre lies within r (cells) of a polyline. r >= 0.71 keeps the band 4-connected. */
function lineCells(G, pts, r) {
  const set = new Uint8Array(G.n), out = [], r2 = r * r;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    const vx = q.x - p.x, vz = q.z - p.z, L2 = vx * vx + vz * vz;
    const x0 = Math.floor(Math.min(p.x, q.x) - r - 1), x1 = Math.ceil(Math.max(p.x, q.x) + r + 1);
    const z0 = Math.floor(Math.min(p.z, q.z) - r - 1), z1 = Math.ceil(Math.max(p.z, q.z) + r + 1);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (!G.inb(x, z)) continue;
      const cx = x + 0.5, cz = z + 0.5;
      let t = L2 > 0 ? ((cx - p.x) * vx + (cz - p.z) * vz) / L2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const dx = p.x + vx * t - cx, dz = p.z + vz * t - cz;
      if (dx * dx + dz * dz > r2) continue;
      const c = z * G.cols + x;
      if (!set[c]) { set[c] = 1; out.push(c); }
    }
  }
  return out;
}

// ── the generator ──────────────────────────────────────────────────────────────────────────────────

/** Build a validated world, retrying with seed + k. */
export function generateWorld(gen, opts) {
  const tries = gen.validate.retries;
  let last = null;
  for (let k = 0; k <= tries; k++) {
    const w = buildWorld(gen, { ...opts, seed: (opts.seed + k) >>> 0 });
    if (!w.problems.length) { w.attempts = k + 1; w.requestedSeed = opts.seed >>> 0; return w; }
    last = w;
  }
  throw new Error(`Could not generate a valid forest for seed ${opts.seed}: ${last.problems.join('; ')}`);
}

/** One attempt (exported for the viewer: it shows failed attempts and their reasons too). */
export function buildWorld(gen, { seed, size, farmers = 5, hunters = 2 }) {
  const cell = gen.cell, cols = Math.round(size / cell), rows = cols;
  const G = makeGrid(cols, rows);
  const rng = seedStream(seed >>> 0, 'mapgen');
  const nseed = (seed * 7919 + 17) | 0;
  const area = size * size, areaK = area / (256 * 256);
  const M = v => v / cell;                      // metres -> cells
  const cells = new Uint8Array(G.n).fill(K.tree);
  const level = new Uint8Array(G.n);
  const look = new Uint8Array(G.n);
  const doors = [];
  const features = [];
  const problems = [];
  const why = {};   // rejection counts per step (the viewer shows them)
  const no = k => { why[k] = (why[k] || 0) + 1; };
  const names = makeNamer(gen.names, rng);
  const scratch = () => ({ dist: new Int32Array(G.n), prev: new Int32Array(G.n), q: new Int32Array(G.n) });
  const S1 = scratch(), S2 = scratch();
  const centre = { x: cols / 2, z: rows / 2 };

  // 1. fixed nodes: the Commons (centre) and the kennels (rim, spread by angle)
  const nodes = [];
  const addNode = (kind, x, z, r, name) => { const n = { id: nodes.length, kind, x, z, r, name: name || null, level: 0 }; nodes.push(n); return n; };
  const commons = addNode('commons', centre.x, centre.z, M(gen.commons.radius), gen.names.commons);
  const kennels = [];
  const a0 = range(rng, 0, TAU);
  for (let i = 0; i < hunters; i++) {
    const a = a0 + i * TAU / hunters + range(rng, -0.25, 0.25);
    const rr = gen.kennels.rim * cols;
    const margin = M(gen.glades.edgeMargin) + M(gen.kennels.radius);
    const x = Math.max(margin, Math.min(cols - margin, centre.x + sin(a) * rr));
    const z = Math.max(margin, Math.min(rows - margin, centre.z + cos(a) * rr));
    kennels.push(addNode('kennel', x, z, M(gen.kennels.radius), `${gen.names.kennel} ${i + 1}`));
  }

  // 2. glades: dart-throwing Poisson disc
  const GL = gen.glades;
  const want = Math.max(6, Math.round(area / (GL.spacing * GL.spacing)));
  const spacing = M(GL.spacing) * 0.8, edge = M(GL.edgeMargin);
  for (let tries = 0; tries < want * 40 && nodes.length < want + 1 + hunters; tries++) {
    const x = range(rng, edge, cols - edge), z = range(rng, edge, rows - edge);
    const r = M(range(rng, GL.radius[0], GL.radius[1]));
    let ok = true;
    for (const n of nodes) {
      const dx = n.x - x, dz = n.z - z, need = n.kind === 'glade' ? spacing : spacing + n.r;
      if (dx * dx + dz * dz < need * need) { ok = false; break; }
    }
    if (ok) addNode('glade', x, z, r, null);
  }

  // 3. trails: k-nearest graph -> minimum spanning tree + a share of the rest for loops
  const T = gen.trails;
  const cand = [], seenE = new Set();
  for (const a of nodes) {
    const near = sortBy(nodes.filter(b => b !== a), b => (b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)).slice(0, T.k);
    for (const b of near) {
      const lo = Math.min(a.id, b.id), hi = Math.max(a.id, b.id), key = lo * 10000 + hi;
      if (seenE.has(key)) continue;
      seenE.add(key);
      cand.push({ id: key, a: lo, b: hi, len: Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)) });
    }
  }
  const sortedE = sortBy(cand, e => e.len);
  const parent = nodes.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const kept = [], rest = [];
  for (const e of sortedE) { const ra = find(e.a), rb = find(e.b); if (ra !== rb) { parent[ra] = rb; kept.push(e); } else rest.push(e); }
  let loops = 0;
  for (const e of rest) if (next(rng) < T.loopShare) { kept.push(e); loops++; }
  for (const e of rest) { if (loops >= gen.validate.loops) break; if (!kept.includes(e)) { kept.push(e); loops++; } }
  // geometry: noisy polylines from rim to rim of the two glades
  for (const e of kept) {
    const A = nodes[e.a], B = nodes[e.b];
    e.pts = noisyLine(rng, { x: A.x, z: A.z }, { x: B.x, z: B.z }, T.depth, T.wobble);
    e.width = M(range(rng, T.width[0], T.width[1]));
  }

  // 4. plateaus: noise thresholded to a share of the map, kept off trails and ground glades
  const P = gen.plateau;
  const reserved = new Uint8Array(G.n);
  for (const e of kept) for (const c of lineCells(G, e.pts, e.width / 2 + P.trailBuffer)) reserved[c] = 1;
  for (const n of nodes) for (const c of discCells(G, Math.floor(n.x), Math.floor(n.z), n.r + P.trailBuffer)) reserved[c] = 1;
  for (let x = 0; x < cols; x++) for (let z = 0; z < rows; z++) if (x < 2 || z < 2 || x >= cols - 2 || z >= rows - 2) reserved[z * cols + x] = 1;
  const pn = new Float64Array(G.n);
  const hist = new Int32Array(1024);
  let free = 0;
  for (let i = 0; i < G.n; i++) {
    const x = i % cols, z = (i / cols) | 0;
    pn[i] = fbm(x, z, M(P.noiseScale), nseed + 11, P.octave2);
    if (!reserved[i]) { hist[Math.min(1023, Math.floor(pn[i] * 1024))]++; free++; }
  }
  let target = Math.round(P.share * G.n), acc = 0, thr = 1;
  for (let b = 1023; b >= 0; b--) { acc += hist[b]; if (acc >= target) { thr = b / 1024; break; } }
  let mask = new Uint8Array(G.n);
  for (let i = 0; i < G.n; i++) mask[i] = !reserved[i] && pn[i] >= thr ? 1 : 0;
  for (let pass = 0; pass < P.smooth; pass++) {
    const nm = new Uint8Array(G.n);
    for (let i = 0; i < G.n; i++) {
      if (reserved[i]) continue;
      // (reserved covers a 2-cell border, so all eight neighbours exist)
      const s = mask[i - 1] + mask[i + 1] + mask[i - cols] + mask[i + cols] + mask[i - cols - 1] + mask[i - cols + 1] + mask[i + cols - 1] + mask[i + cols + 1];
      nm[i] = s >= 5 || (mask[i] && s >= 4) ? 1 : 0;
    }
    mask = nm;
  }
  {
    const { comps } = components(G, mask);
    for (const c of comps) if (c.length < P.minCells) for (const i of c) mask[i] = 0;
  }
  for (let i = 0; i < G.n; i++) level[i] = mask[i];

  // 5. carve the ground glades and the trails
  const carveGlade = (n, kind = K.grass) => {
    const cx = Math.floor(n.x), cz = Math.floor(n.z);
    for (const c of discCells(G, cx, cz, n.r * 1.2)) {
      const x = c % cols, z = (c / cols) | 0, dx = x - n.x + 0.5, dz = z - n.z + 0.5;
      const d = Math.sqrt(dx * dx + dz * dz);
      const lim = n.r * (0.78 + 0.42 * valueNoise(x, z, 3.5, nseed + n.id * 31));
      if (d <= lim && level[c] === n.level && cells[c] !== K.trail) cells[c] = kind;
    }
  };
  for (const n of nodes) carveGlade(n);
  for (const e of kept) {
    e.cells = lineCells(G, e.pts, Math.max(0.75, e.width / 2));
    for (const c of e.cells) if (level[c] === 0) cells[c] = K.trail;
  }

  // 6. ravine trail (feature): cliff walls on both sides of a straight-ish stretch of trail
  const featureCount = id => Math.max(0, Math.round(gen.features[id] * Math.max(0.6, areaK)));
  const usedNodes = new Set([commons.id, ...kennels.map(k => k.id)]);
  for (let f = 0; f < featureCount('ravineTrail'); f++) {
    const R = gen.featureSize.ravineTrail, L = M(R.length);
    const order = sortBy(kept.filter(e => !e.ravine && e.len > L + 10), e => -e.len);
    for (const e of order) {
      const A = nodes[e.a], B = nodes[e.b];
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.sqrt(dx * dx + dz * dz);
      const ux = dx / len, uz = dz / len;
      const s0 = (len - L) / 2, wall = M(R.wall), half = e.width / 2 + 0.6;
      // the stretch must be clear of glades: walls only on forest cells, and the trail must run near the straight line
      const touched = [];
      let ok = true;
      for (let s = s0; s <= s0 + L && ok; s += 0.5) {
        const px = A.x + ux * s, pz = A.z + uz * s;
        // nearest trail cell along the normal: re-centre on the carved trail
        let best = null;
        for (let o = -6; o <= 6; o += 0.5) { const c = Math.floor(px - uz * o) + Math.floor(pz + ux * o) * cols; if (G.inb(Math.floor(px - uz * o), Math.floor(pz + ux * o)) && cells[c] === K.trail && (best == null || Math.abs(o) < Math.abs(best))) best = o; }
        if (best == null) { ok = false; break; }
        const cxm = px - uz * best, czm = pz + ux * best;
        for (const side of [-1, 1]) for (let o = half; o <= half + wall; o += 0.5) {
          const x = Math.floor(cxm - uz * o * side), z = Math.floor(czm + ux * o * side);
          if (!G.inb(x, z)) continue;
          const c = z * cols + x;
          if (cells[c] === K.trail) continue;
          if (cells[c] !== K.tree) { if (o < half + 1.5) ok = false; continue; }
          touched.push(c);
        }
      }
      if (!ok || touched.length < L) continue;
      for (const c of touched) level[c] = 1;
      e.ravine = true;
      features.push({ kind: 'ravineTrail', x: (A.x + B.x) / 2 * cell, z: (A.z + B.z) / 2 * cell, name: names.feature('ravineTrail') });
      break;
    }
  }

  // 7. plateaus: components, cliffs on their rim, small glades inside, 1-2 ramps each
  const plats = components(G, level).comps;
  const isRim = i => {
    const x = i % cols, z = (i / cols) | 0;
    for (const [dx, dz] of N8) { const nx = x + dx, nz = z + dz; if (G.inb(nx, nz) && level[nz * cols + nx] === 0) return true; }
    return false;
  };
  for (let i = 0; i < G.n; i++) if (level[i] && isRim(i)) cells[i] = K.cliff;
  const plateauInfo = [];
  const dRim = bfs(G, (() => { const s = []; for (let i = 0; i < G.n; i++) if (cells[i] === K.cliff) s.push(i); return s; })(), i => level[i] === 1).dist;
  for (let pi = 0; pi < plats.length; pi++) {
    const comp = plats[pi];
    const interior = comp.filter(i => cells[i] !== K.cliff);
    if (interior.length < 12) continue;
    const info = { id: pi, cells: comp, glades: [], ramps: [] };
    const nGl = int(rng, P.glades[1] - P.glades[0] + 1) + P.glades[0];   // (a pocket valley keeps only its first, below)
    for (let g = 0; g < nGl; g++) {
      // deepest point not too close to an earlier plateau glade
      let best = -1, bd = -1;
      for (const i of interior) {
        let d = dRim[i] + next(rng) * 0.9;
        for (const o of info.glades) { const dx = (i % cols) - o.x, dz = ((i / cols) | 0) - o.z; if (dx * dx + dz * dz < 64) d -= 50; }
        if (d > bd) { bd = d; best = i; }
      }
      if (best < 0 || dRim[best] < 3) break;
      const r = Math.min(dRim[best] - 1.2, M(range(rng, 4, 7)));
      if (r < 1.5) break;
      const n = { id: 1000 + pi * 4 + g, x: (best % cols) + 0.5, z: ((best / cols) | 0) + 0.5, r, level: 1, kind: 'plateauGlade' };
      carveGlade(n);
      info.glades.push(n);
    }
    // join every later glade to the first, through the plateau's own forest
    for (let g = 1; g < info.glades.length; g++) {
      const first = new Set(discCells(G, Math.floor(info.glades[0].x), Math.floor(info.glades[0].z), 1));
      const a = info.glades[g], from = Math.floor(a.z) * cols + Math.floor(a.x);
      const r = bfs(G, [from], j => level[j] === 1 && cells[j] !== K.cliff, j => first.has(j), S1);
      if (r.hit >= 0) for (let c = r.hit; c >= 0; c = r.prev[c]) if (cells[c] === K.tree) cells[c] = K.grass;
    }
    if (info.glades.length) plateauInfo.push(info);
  }
  // pocket valleys: the largest plateaus with a glade get ONE ramp and become hollows
  const pocketIds = new Set(sortBy(plateauInfo, p => -p.cells.length).slice(0, featureCount('pocketValley')).map(p => p.id));
  const groundOpen = i => level[i] === 0 && OPEN[cells[i]];
  const dGround = bfs(G, (() => { const s = []; for (let i = 0; i < G.n; i++) if (groundOpen(i)) s.push(i); return s; })(), i => level[i] === 0 && cells[i] !== K.water).dist;
  const carvePath = (from, isGoal, passKind) => {
    const r = bfs(G, [from], passKind, isGoal, S1);
    if (r.hit < 0) return null;
    const path = [];
    for (let c = r.hit; c >= 0; c = r.prev[c]) path.push(c);
    return path;   // goal ... from
  };
  for (const info of plateauInfo) {
    const glSet = new Set();
    for (const g of info.glades) for (const c of discCells(G, Math.floor(g.x), Math.floor(g.z), g.r * 0.6)) if (level[c] === 1 && cells[c] !== K.cliff) glSet.add(c);
    const dPlat = bfs(G, [...glSet], i => level[i] === 1 && cells[i] !== K.cliff, null, S2).dist;
    const cands = [];
    for (const i of info.cells) {
      if (cells[i] !== K.cliff) continue;
      const x = i % cols, z = (i / cols) | 0;
      for (const [dx, dz] of N4) {
        const gx = x + dx, gz = z + dz, px = x - dx, pz = z - dz;
        if (!G.inb(gx, gz) || !G.inb(px, pz)) continue;
        const g = gz * cols + gx, p = pz * cols + px;
        if (level[g] !== 0 || dGround[g] < 0 || level[p] !== 1 || cells[p] === K.cliff || dPlat[p] < 0) continue;
        // a two-cell ramp needs a neighbour along the cliff with the same through-direction
        const sx = dz !== 0 ? 1 : 0, sz = dx !== 0 ? 1 : 0;
        const ox = x + sx, oz = z + sz;
        if (!G.inb(ox, oz)) continue;
        const o = oz * cols + ox, og = (oz + dz) * cols + ox + dx, op = (oz - dz) * cols + ox - dx;
        if (cells[o] !== K.cliff || level[og] !== 0 || level[op] !== 1 || cells[op] === K.cliff) continue;
        cands.push({ id: i * 4 + (dx + 1) + (dz + 1) * 2, i, o, g, p, score: dGround[g] + dPlat[p] });
      }
    }
    if (!cands.length) continue;
    const sorted = sortBy(cands, c => c.score);
    const nR = pocketIds.has(info.id) ? 1 : int(rng, P.ramps[1] - P.ramps[0] + 1) + P.ramps[0];
    const chosen = [sorted[0]];
    if (nR > 1) {
      const lim = sorted[0].score * 1.6 + 8;
      let best = null, bd = -1;
      for (const c of sorted) {
        if (c.score > lim) break;
        const dx = (c.i % cols) - (chosen[0].i % cols), dz = ((c.i / cols) | 0) - ((chosen[0].i / cols) | 0), d = dx * dx + dz * dz;
        if (d > bd) { bd = d; best = c; }
      }
      if (best && bd >= 64) chosen.push(best);
    }
    for (const c of chosen) {
      cells[c.i] = K.ramp; cells[c.o] = K.ramp;
      // ground side: a path to the nearest open ground; plateau side: to the glade
      const gp = carvePath(c.g, j => groundOpen(j) && j !== c.g, j => level[j] === 0 && cells[j] !== K.water && cells[j] !== K.rock);
      if (gp) for (const j of gp) if (cells[j] === K.tree) cells[j] = K.grass;
      if (cells[c.g] === K.tree) cells[c.g] = K.grass;
      const pp = carvePath(c.p, j => glSet.has(j), j => level[j] === 1 && cells[j] !== K.cliff);
      if (pp) for (const j of pp) if (cells[j] === K.tree) cells[j] = K.grass;
      if (cells[c.p] === K.tree) cells[c.p] = K.grass;
      // which glade this ramp leads to
      let gl = 0;
      if (pp) { const hx = pp[0] % cols, hz = (pp[0] / cols) | 0; let bd = 1e9; info.glades.forEach((g, k) => { const d = (g.x - hx) * (g.x - hx) + (g.z - hz) * (g.z - hz); if (d < bd) { bd = d; gl = k; } }); }
      info.ramps.push({ cells: [c.i, c.o], foot: c.g, glade: gl });
    }
  }

  // 8. water: ponds in low basins (away from open ground), then one stream with 1-2 fords
  const PO = gen.ponds;
  const dOpen = bfs(G, (() => { const s = []; for (let i = 0; i < G.n; i++) if (OPEN[cells[i]] || cells[i] === K.ramp) s.push(i); return s; })(), () => true).dist;
  {
    const wn = new Float64Array(G.n), h = new Int32Array(1024);
    let cnt = 0;
    for (let i = 0; i < G.n; i++) {
      if (cells[i] !== K.tree || level[i] || dOpen[i] < 3) { wn[i] = 2; continue; }
      wn[i] = valueNoise(i % cols, (i / cols) | 0, M(PO.noiseScale), nseed + 77); h[Math.floor(wn[i] * 1024)]++; cnt++;
    }
    const tgt = Math.round(PO.share * G.n);
    let a = 0, th = 0;
    for (let b = 0; b < 1024; b++) { a += h[b]; if (a >= tgt) { th = b / 1024; break; } }
    const wm = new Uint8Array(G.n);
    for (let i = 0; i < G.n; i++) wm[i] = wn[i] <= th ? 1 : 0;
    for (const c of components(G, wm).comps) if (c.length >= PO.minCells) for (const i of c) cells[i] = K.water;
  }
  const S = gen.stream;
  let streamDone = false, fordCount = 0;
  const nodeDisc = new Uint8Array(G.n);
  for (const n of [commons, ...kennels]) for (const c of discCells(G, Math.floor(n.x), Math.floor(n.z), n.r + 2)) nodeDisc[c] = 1;
  for (let k = 0; k < S.candidates && !streamDone; k++) {
    // a spring part-way in, running out to one edge of the map
    const side = int(rng, 4), u = range(rng, 0.2, 0.8) * cols, v = range(rng, 0.15, 0.4) * cols, depth = range(rng, 0.3, 0.5) * cols;
    const edgeP = [{ x: u, z: 0 }, { x: cols - 1, z: u }, { x: u, z: rows - 1 }, { x: 0, z: u }][side];
    const inP = [{ x: v + u * 0.3, z: depth }, { x: cols - 1 - depth, z: v + u * 0.3 }, { x: v + u * 0.3, z: rows - 1 - depth }, { x: depth, z: v + u * 0.3 }][side];
    const ends = [inP, edgeP];
    const pts = noisyLine(rng, ends[0], ends[1], 4, S.wobble);
    const sc = lineCells(G, pts, Math.max(0.75, M(S.width) / 2));
    if (sc.some(c => nodeDisc[c])) { no('stream:blocked'); continue; }
    // the stream runs on the ground: it rises at a cliff foot and passes round the plateaus
    for (let q = sc.length - 1; q >= 0; q--) if (level[sc[q]] || cells[sc[q]] === K.ramp) sc.splice(q, 1);
    const tm = new Uint8Array(G.n);
    for (const c of sc) if (cells[c] === K.trail) tm[c] = 1;
    const crossings = components(G, tm).comps.length;
    if (crossings < S.fords[0] || crossings > S.fords[1]) { no('stream:crossings' + crossings); continue; }
    const nearTrail = c => { const x = c % cols, z = (c / cols) | 0; for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (G.inb(x + dx, z + dz) && cells[(z + dz) * cols + x + dx] === K.trail) return true; return false; };
    const fords = sc.filter(c => OPEN[cells[c]]);   // where it crosses open ground it runs shallow (a ford)
    for (const c of sc) cells[c] = K.water;
    for (const c of fords) cells[c] = K.ford;
    fordCount = crossings; streamDone = true;
    features.push({ kind: 'stream', x: pts[pts.length >> 1].x * cell, z: pts[pts.length >> 1].z * cell, name: null });
  }

  // 9. forest texture: ragged edges, specks, rocks, briar clumps, tall grass, tree looks
  const F = gen.forest;
  {
    const snap = cells.slice();
    for (let i = 0; i < G.n; i++) {
      if (snap[i] !== K.tree || level[i] && false) continue;
      const x = i % cols, z = (i / cols) | 0;
      if (x < 2 || z < 2 || x >= cols - 2 || z >= rows - 2) continue;
      const L = level[i];
      const open = (OPEN[snap[i - 1]] && level[i - 1] === L) || (OPEN[snap[i + 1]] && level[i + 1] === L) || (OPEN[snap[i - cols]] && level[i - cols] === L) || (OPEN[snap[i + cols]] && level[i + cols] === L);
      if (open && hash3(x, z, nseed + 5) < F.roughen) cells[i] = K.grass;
      else if (!open && hash3(x, z, nseed + 6) < F.specks) cells[i] = K.grass;
      else if (!open && hash3(x, z, nseed + 7) < gen.rocks.share) cells[i] = K.rock;
    }
  }
  for (let b = 0; b < Math.round(gen.briarClumps.per * areaK); b++) {
    for (let t = 0; t < 40; t++) {
      const i = int(rng, G.n), x = i % cols, z = (i / cols) | 0;
      if (cells[i] !== K.tree || x < 3 || z < 3 || x >= cols - 3 || z >= rows - 3) continue;
      if (!N4.some(([dx, dz]) => OPEN[cells[(z + dz) * cols + x + dx]])) continue;
      let c = i;
      const n = int(rng, gen.briarClumps.size[1] - gen.briarClumps.size[0] + 1) + gen.briarClumps.size[0];
      for (let s = 0; s < n; s++) {
        if (cells[c] === K.tree) cells[c] = K.briar;
        const [dx, dz] = N4[int(rng, 4)], nx = (c % cols) + dx, nz = ((c / cols) | 0) + dz;
        if (nx > 2 && nz > 2 && nx < cols - 3 && nz < rows - 3) c = nz * cols + nx;
      }
      break;
    }
  }
  {
    const TG = gen.tallgrass, h = new Int32Array(1024), tn = new Float64Array(G.n);
    let cnt = 0;
    for (let i = 0; i < G.n; i++) if (cells[i] === K.grass) { tn[i] = fbm(i % cols, (i / cols) | 0, M(TG.noiseScale), nseed + 99, 0.5); h[Math.floor(tn[i] * 1024)]++; cnt++; }
    const tgt = Math.round(TG.share * cnt);
    let a = 0, th = 1;
    for (let b = 1023; b >= 0; b--) { a += h[b]; if (a >= tgt) { th = b / 1024; break; } }
    for (let i = 0; i < G.n; i++) if (cells[i] === K.grass && tn[i] >= th && !nodeDisc[i]) cells[i] = K.tallgrass;
  }

  // 10. glade features: stone ring, old orchard, briar maze (each on its own glade)
  const degree = new Int32Array(nodes.length);
  for (const e of kept) { degree[e.a]++; degree[e.b]++; }
  const gladePick = (pred) => {
    const pool = sortBy(nodes.filter(n => n.kind === 'glade' && !usedNodes.has(n.id) && pred(n)), n => n.id);
    if (!pool.length) return null;
    const n = pool[int(rng, pool.length)];
    usedNodes.add(n.id);
    return n;
  };
  const clearGlade = n => { for (const c of discCells(G, Math.floor(n.x), Math.floor(n.z), n.r)) if (cells[c] === K.tallgrass) cells[c] = K.grass; };
  for (let f = 0; f < featureCount('stoneRing'); f++) {
    const n = gladePick(g => g.r >= M(gen.featureSize.stoneRing.minRadius));
    if (!n) break;
    clearGlade(n);
    const k = gen.featureSize.stoneRing.stones, rr = n.r * 0.62;
    for (let s = 0; s < k; s++) {
      const a = s * TAU / k, x = Math.floor(n.x + sin(a) * rr), z = Math.floor(n.z + cos(a) * rr);
      if (G.inb(x, z) && OPEN[cells[z * cols + x]] && cells[z * cols + x] !== K.trail) cells[z * cols + x] = K.rock;
    }
    n.feature = 'stoneRing'; n.name = names.feature('stoneRing');
    features.push({ kind: 'stoneRing', x: n.x * cell, z: n.z * cell, name: n.name, node: n.id });
  }
  for (let f = 0; f < featureCount('oldOrchard'); f++) {
    const n = gladePick(g => true);
    if (!n) break;
    const O = gen.featureSize.oldOrchard, R = M(O.radius);
    n.r = Math.max(n.r, R);
    const sp = Math.max(2, Math.round(M(O.spacing)));
    for (const c of discCells(G, Math.floor(n.x), Math.floor(n.z), R)) {
      if (level[c] || cells[c] === K.water || cells[c] === K.ford || cells[c] === K.trail || cells[c] === K.ramp || cells[c] === K.cliff) continue;
      const x = c % cols, z = (c / cols) | 0;
      const nearTrail = N8.some(([dx, dz]) => G.inb(x + dx, z + dz) && cells[(z + dz) * cols + x + dx] === K.trail);
      const dx = x - Math.floor(n.x), dz = z - Math.floor(n.z);
      if (!nearTrail && ((dx % sp) + sp) % sp === 0 && ((dz % sp) + sp) % sp === 0 && (dx || dz)) { cells[c] = K.tree; look[c] = 3; }
      else cells[c] = K.grass;
    }
    n.feature = 'oldOrchard'; n.name = names.feature('oldOrchard');
    features.push({ kind: 'oldOrchard', x: n.x * cell, z: n.z * cell, name: n.name, node: n.id });
  }
  for (let f = 0; f < featureCount('briarMaze'); f++) {
    const n = gladePick(g => degree[g.id] === 1 && g.r >= M(gen.featureSize.briarMaze.minRadius));
    if (!n) break;
    clearGlade(n);
    // a briar band across the trail mouth, and an inner ring of briar with two openings
    for (const c of discCells(G, Math.floor(n.x), Math.floor(n.z), n.r + 2)) {
      const x = c % cols, z = (c / cols) | 0, dx = x + 0.5 - n.x, dz = z + 0.5 - n.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d >= n.r - 0.5 && d <= n.r + 2 && cells[c] === K.trail) cells[c] = K.briar;
      if (d >= n.r * 0.55 && d <= n.r * 0.55 + 1 && (cells[c] === K.grass || cells[c] === K.tallgrass)) {
        const q = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0);
        if (!((q === 0 && Math.abs(dx) < 1.2) || (q === 3 && Math.abs(dx) < 1.2))) cells[c] = K.briar;
      }
    }
    n.feature = 'briarMaze'; n.name = names.feature('briarMaze');
    features.push({ kind: 'briarMaze', x: n.x * cell, z: n.z * cell, name: n.name, node: n.id });
  }

  // 11. hollows: hidden build spots off the trails
  const H = gen.hollows;
  const hollows = [];
  const needHollows = Math.max(H.minPerFarmer * farmers, Math.round(H.perFarmer * farmers));
  const dTrail = bfs(G, (() => { const s = []; for (let i = 0; i < G.n; i++) if (cells[i] === K.trail) s.push(i); return s; })(), i => level[i] === 0 && cells[i] !== K.water && cells[i] !== K.cliff).dist;
  const reachNow = bfsMove(G, cells, level, Math.floor(commons.z) * cols + Math.floor(commons.x), c => WALK_FARMER[cells[c]] === 1);
  const hunterNow = bfsMove(G, cells, level, Math.floor(commons.z) * cols + Math.floor(commons.x), c => WALK_HUNTER[cells[c]] === 1);
  const isDoor = new Uint8Array(G.n), inOther = new Uint8Array(G.n);   // corridors never cut a door or cross a hollow
  const farFromHollows = (x, z, m) => hollows.every(h => (h.cx - x) * (h.cx - x) + (h.cz - z) * (h.cz - z) >= m * m);
  const addHollow = (hcells, cx, cz, r, entry, mouthCell, door, lvl, name) => {
    const h = { id: hollows.length, cx, cz, x: (cx + 0.5) * cell, z: (cz + 0.5) * cell, r, cells: hcells, entry, level: lvl, door, name: name || null,
      mouth: mouthCell >= 0 ? { cell: mouthCell, x: ((mouthCell % cols) + 0.5) * cell, z: (((mouthCell / cols) | 0) + 0.5) * cell } : null, slots: [] };
    hollows.push(h);
    return h;
  };
  // pocket valleys
  for (const info of plateauInfo) {
    if (!pocketIds.has(info.id) || info.ramps.length !== 1) continue;
    const g = info.glades[info.ramps[0].glade];
    const hc = discCells(G, Math.floor(g.x), Math.floor(g.z), g.r).filter(c => level[c] === 1 && (cells[c] === K.grass || cells[c] === K.tallgrass));
    const name = names.feature('pocketValley');
    addHollow(hc, Math.floor(g.x), Math.floor(g.z), g.r, 'ramp', info.ramps[0].foot, -1, 1, name);
    features.push({ kind: 'pocketValley', x: g.x * cell, z: g.z * cell, name });
  }
  // pond islands: a pond with a hollow island reached by a ford
  for (let f = 0; f < featureCount('pondIsland'); f++) {
    const PI2 = gen.featureSize.pondIsland, pr = M(PI2.pond), ir = M(PI2.island);
    for (let t = 0; t < 300; t++) {
      const cx = int(rng, cols), cz = int(rng, rows), c0 = cz * cols + cx;
      if (cx < pr + 4 || cz < pr + 4 || cx >= cols - pr - 4 || cz >= rows - pr - 4) continue;
      if (dTrail[c0] < pr + 2 || dTrail[c0] > pr + 14 || !farFromHollows(cx, cz, M(H.spacing) + pr)) { no('pond:place'); continue; }
      const disc = discCells(G, cx, cz, pr + 1.5);
      if (disc.some(c => level[c] || (cells[c] !== K.tree && cells[c] !== K.rock && cells[c] !== K.briar))) { no('pond:notForest'); continue; }
      for (const c of discCells(G, cx, cz, pr)) cells[c] = K.water;
      const island = discCells(G, cx, cz, ir);
      const isl = new Set(island);
      for (const c of island) cells[c] = K.grass;
      // the ford: from the island rim toward the nearest trail, then a path to it
      const r = bfs(G, [c0], j => level[j] === 0 && (cells[j] === K.tree || cells[j] === K.water || isl.has(j) || cells[j] === K.briar || (OPEN[cells[j]] && reachNow[j] >= 0)), j => cells[j] === K.trail && reachNow[j] >= 0, S1);
      if (r.hit < 0) { for (const c of discCells(G, cx, cz, pr)) cells[c] = K.tree; continue; }
      let mouth = -1;
      for (let c = r.hit; c >= 0; c = r.prev[c]) {
        if (cells[c] === K.water) cells[c] = K.ford;
        else if (cells[c] === K.tree || cells[c] === K.briar || cells[c] === K.rock) cells[c] = K.grass;
        if (mouth < 0 && cells[c] === K.ford) mouth = c;
      }
      const name = names.feature('pondIsland');
      addHollow(island, cx, cz, ir, 'ford', mouth, -1, 0, name);
      features.push({ kind: 'pondIsland', x: (cx + 0.5) * cell, z: (cz + 0.5) * cell, name });
      break;
    }
  }
  // forest hollows: candidates are deep-forest cells (Chebyshev distance to anything not forest)
  // at the right distance from a trail; pick among them at random, keeping hollows apart
  const dNF = chebyshev(G, i => level[i] !== 0 || (cells[i] !== K.tree && cells[i] !== K.rock));
  const rMin = M(H.radius[0]);
  let pool = [];
  for (let i = 0; i < G.n; i++) {
    if (dNF[i] < rMin + 2 || dTrail[i] < 0) continue;
    const off = dTrail[i] - rMin;
    if (off >= M(H.offTrail[0]) && off <= M(H.offTrail[1]) + 2) pool.push(i);
  }
  why.hollowPool = pool.length;
  for (let t = 0; t < 400 && hollows.length < needHollows && pool.length; t++) {
    const c0 = pool[int(rng, pool.length)], cx = c0 % cols, cz = (c0 / cols) | 0;
    const r = Math.min(M(range(rng, H.radius[0], H.radius[1])), dNF[c0] - 2);
    const R = Math.ceil(r + 2);
    if (cx < R + 2 || cz < R + 2 || cx >= cols - R - 2 || cz >= rows - R - 2) continue;
    if (level[c0] || dTrail[c0] < 0) { no('hollow:level'); continue; }
    const off = dTrail[c0] - r;
    if (off < M(H.offTrail[0]) || off > M(H.offTrail[1])) { no('hollow:offTrail'); continue; }
    if (!farFromHollows(cx, cz, M(H.spacing))) { no('hollow:spacing'); continue; }
    const ring = discCells(G, cx, cz, r + 2);
    if (ring.some(c => level[c] || (cells[c] !== K.tree && cells[c] !== K.rock))) { no('hollow:notForest'); continue; }
    const hc = [], hcBefore = [];
    for (const c of discCells(G, cx, cz, r * 1.15)) {
      const x = c % cols, z = (c / cols) | 0, dx = x - cx, dz = z - cz, d = Math.sqrt(dx * dx + dz * dz);
      if (d <= r * (0.82 + 0.33 * valueNoise(x, z, 2.5, nseed + t))) { hcBefore.push(cells[c]); cells[c] = K.grass; hc.push(c); }
    }
    // corridor to the nearest open ground (through forest only)
    const inH = new Uint8Array(G.n); for (const c of hc) inH[c] = 1;
    // (only through forest: never through another hollow, which would join the two)
    const res = bfs(G, hc, j => level[j] === 0 && !isDoor[j] && !inOther[j] && (cells[j] === K.tree || cells[j] === K.rock || cells[j] === K.briar || (OPEN[cells[j]] && reachNow[j] >= 0)), j => !inH[j] && OPEN[cells[j]] && reachNow[j] >= 0, S1);
    if (res.hit < 0) { hc.forEach((c, k) => { cells[c] = hcBefore[k]; }); continue; }
    const path = [];
    for (let c = res.prev[res.hit]; c >= 0 && !inH[c]; c = res.prev[c]) path.push(c);   // corridor cells, mouth end first
    const before = path.map(c => cells[c]);
    for (const c of path) if (cells[c] !== K.briar) cells[c] = K.grass;
    let entry, door = -1;
    if (next(rng) < H.entry.briar || !path.length) { entry = 'briar'; for (const c of path.slice(0, 2)) cells[c] = K.briar; }
    else { entry = 'tree'; door = path[0]; cells[door] = K.tree; look[door] = 0; }
    // the entry must really keep hunters out (a corridor can graze open ground on its way): else undo
    // (a small flood out of the hollow on hunter footing, stopping at ground hunters already reach)
    const leak = bfs(G, hc, j => WALK_HUNTER[cells[j]] === 1 && level[j] === 0, j => hunterNow[j] >= 0, S1).hit >= 0;
    if (leak) { path.forEach((c, k) => { cells[c] = before[k]; }); hc.forEach((c, k) => { cells[c] = hcBefore[k]; }); no('hollow:leaky'); continue; }
    if (door >= 0) { doors.push(door); isDoor[door] = 1; }
    for (const c of hc) inOther[c] = 1;
    for (const c of path) inOther[c] = 1;
    addHollow(hc, cx, cz, r, entry, path.length ? path[0] : res.hit, door, 0, null);
  }

  // 12. deadfall wall: a long tree line across the map, crossings closed except 1-2 gaps
  const reach = (passFarmer) => {
    const start = Math.floor(commons.z) * cols + Math.floor(commons.x);
    const doorSet = new Set(doors);
    return bfsMove(G, cells, level, start, passFarmer ? (c => WALK_FARMER[cells[c]] || doorSet.has(c)) : (c => WALK_HUNTER[cells[c]] === 1));
  };
  for (let f = 0; f < featureCount('deadfallWall'); f++) {
    const D = gen.featureSize.deadfallWall;
    for (let t = 0; t < 6; t++) {
      const th = range(rng, 0, PI), nx = cos(th), nz = sin(th);
      const d = (next(rng) < 0.5 ? -1 : 1) * range(rng, commons.r + M(12), cols * 0.3);
      const band = [], wood = [];
      for (let i = 0; i < G.n; i++) {
        const x = i % cols + 0.5 - centre.x, z = ((i / cols) | 0) + 0.5 - centre.z;
        const s = x * nx + z * nz - d;
        if (s >= -D.thickness / 2 && s < D.thickness / 2 && level[i] === 0 && !nodeDisc[i]) { if (OPEN[cells[i]]) band.push(i); else if (cells[i] === K.tree) wood.push(i); }
      }
      if (band.length < 6) continue;
      const tm = new Uint8Array(G.n);
      for (const c of band) if (cells[c] === K.trail) tm[c] = 1;
      const crossings = components(G, tm).comps;
      if (crossings.length < 2) continue;
      const nGaps = Math.min(crossings.length - 1, int(rng, D.gaps[1] - D.gaps[0] + 1) + D.gaps[0]);
      const gapIdx = new Set();
      while (gapIdx.size < nGaps) gapIdx.add(int(rng, crossings.length));
      const keep = new Uint8Array(G.n);
      crossings.forEach((comp, k) => { if (gapIdx.has(k)) for (const c of comp) keep[c] = 1; });
      const before = band.map(c => cells[c]);
      for (const c of band) if (!keep[c]) { cells[c] = K.tree; look[c] = 4; }
      const intact = kept.filter(e => e.cells.every(c => cells[c] !== K.tree || look[c] !== 4));
      if (worldProblems().length || cyclomatic(nodes.length, intact) < gen.validate.loops) { band.forEach((c, k) => { cells[c] = before[k]; look[c] = 0; }); continue; }
      for (const c of wood) look[c] = 4;   // the fallen timber shows along its whole length
      const mid = band[band.length >> 1];
      features.push({ kind: 'deadfallWall', x: ((mid % cols) + 0.5) * cell, z: (((mid / cols) | 0) + 0.5) * cell, name: names.feature('deadfallWall'), gaps: nGaps, angle: th });
      break;
    }
  }

  // 13. border, tree looks
  for (let x = 0; x < cols; x++) for (const z of [0, rows - 1]) { cells[z * cols + x] = K.tree; level[z * cols + x] = 0; }
  for (let z = 0; z < rows; z++) for (const x of [0, cols - 1]) { cells[z * cols + x] = K.tree; level[z * cols + x] = 0; }
  for (let i = 0; i < G.n; i++) if (cells[i] === K.tree && look[i] === 0) look[i] = Math.floor(hash3(i % cols, (i / cols) | 0, nseed + 3) * F.looks);

  // 14. hollow build slots (AI): door, a tower spot near it, 2x2 pen spots far from it
  for (const h of hollows) h.slots = buildSlots(G, cells, h, H.layouts);

  // 15. names, the graph, validation, metrics
  for (const n of nodes) if (n.kind === 'glade' && !n.name) n.name = names.glade();
  // trail edges cut by the deadfall no longer count
  const edges = kept.filter(e => e.cells.every(c => cells[c] !== K.tree || look[c] !== 4)).map(e => ({ a: e.a, b: e.b, len: e.len * cell }));
  const gnodes = nodes.map(n => ({ id: n.id, kind: n.kind, x: n.x * cell, z: n.z * cell, r: n.r * cell, name: n.name, feature: n.feature || null }));
  for (const h of hollows) {
    if (!h.mouth) continue;
    let best = null, bd = 1e18;
    for (const n of gnodes) { const d = (n.x - h.mouth.x) * (n.x - h.mouth.x) + (n.z - h.mouth.z) * (n.z - h.mouth.z); if (d < bd) { bd = d; best = n; } }
    const id = gnodes.length;
    gnodes.push({ id, kind: 'hollowMouth', x: h.mouth.x, z: h.mouth.z, r: 1, name: h.name, hollow: h.id });
    edges.push({ a: best.id, b: id, len: Math.sqrt(bd) });
  }
  for (const f of features) if (f.name && f.kind !== 'pocketValley' && f.kind !== 'pondIsland' && f.node == null) gnodes.push({ id: gnodes.length, kind: 'landmark', x: f.x, z: f.z, r: 1, name: f.name, feature: f.kind });

  function worldProblems() {
    const out = [];
    const fr = reach(true), hr = reach(false);
    const reachable = (dist, n) => discCells(G, Math.floor(n.x), Math.floor(n.z), Math.max(1, n.r * 0.5)).some(c => dist[c] >= 0);
    for (const n of nodes) if (!reachable(fr, n)) { out.push(`farmers cannot reach ${n.kind} ${n.id}`); break; }
    for (const h of hollows) if (!h.cells.some(c => fr[c] >= 0)) { out.push(`farmers cannot reach hollow ${h.id}`); break; }
    for (const k of kennels) if (!reachable(hr, k)) { out.push('a kennel is cut off'); break; }
    const gl = nodes.filter(n => n.kind !== 'plateauGlade');
    const hshare = gl.filter(n => reachable(hr, n)).length / gl.length;
    if (hshare < gen.validate.hunterGlades) out.push(`hunters reach only ${Math.round(hshare * 100)}% of glades`);
    return out;
  }
  problems.push(...worldProblems());
  if (hollows.length < H.minPerFarmer * farmers) problems.push(`only ${hollows.length} hollows for ${farmers} farmers`);
  let trees = 0, plateau = 0, water = 0;
  for (let i = 0; i < G.n; i++) { if (cells[i] === K.tree) trees++; if (level[i]) plateau++; if (cells[i] === K.water) water++; }
  const forest = trees / G.n;
  if (forest < gen.validate.forest[0] || forest > gen.validate.forest[1]) problems.push(`forest ${Math.round(forest * 100)}% (wants ${gen.validate.forest[0] * 100}-${gen.validate.forest[1] * 100}%)`);
  const loopsNow = cyclomatic(nodes.length, edges.filter(e => e.a < nodes.length && e.b < nodes.length));
  if (loopsNow < gen.validate.loops) problems.push(`only ${loopsNow} trail loops`);
  let kd = 1e9;
  for (const k of kennels) kd = Math.min(kd, Math.sqrt((k.x - commons.x) * (k.x - commons.x) + (k.z - commons.z) * (k.z - commons.z)) * cell);
  if (hunters && kd < gen.validate.kennelDistance) problems.push(`a kennel is ${Math.round(kd)} m from the Commons`);

  const world = {
    id: 'wild', seed: seed >>> 0, size, cols, rows, cell, cells, level, look, doors: sortBy(doors, d => d, () => 0),
    graph: { nodes: gnodes, edges },
    hollows: hollows.map(h => ({ id: h.id, x: h.x, z: h.z, r: h.r * cell, cells: h.cells, entry: h.entry, level: h.level, door: h.door, mouth: h.mouth, name: h.name, slots: h.slots })),
    features,
    commons: { x: commons.x * cell, z: commons.z * cell, r: commons.r * cell, name: commons.name },
    kennels: kennels.map((k, i) => ({ id: i, x: k.x * cell, z: k.z * cell, r: k.r * cell, name: k.name })),
    plateaus: plateauInfo.map(p => ({ id: p.id, cells: p.cells.length, ramps: p.ramps.length, pocket: pocketIds.has(p.id) })),
    problems, why,
  };
  world.metrics = metrics(G, world, { forest, plateau: plateau / G.n, water: water / G.n, loops: loopsNow, kennelDistance: hunters ? kd : null, fords: fordCount, dTrail });
  return world;
}

/** Movement flood from one cell: 4-neighbour, level change only through a ramp. */
export function bfsMove(G, cells, level, start, pass) {
  const dist = new Int32Array(G.n).fill(-1);
  if (!pass(start)) return dist;
  const q = new Int32Array(G.n);
  let h = 0, t = 0;
  dist[start] = 0; q[t++] = start;
  while (h < t) {
    const i = q[h++], x = i % G.cols, cols = G.cols;
    for (let k = 0; k < 4; k++) {
      let j;
      if (k === 0) { if (x + 1 >= cols) continue; j = i + 1; }
      else if (k === 1) { if (x === 0) continue; j = i - 1; }
      else if (k === 2) { j = i + cols; if (j >= G.n) continue; }
      else { j = i - cols; if (j < 0) continue; }
      if (dist[j] >= 0 || !pass(j)) continue;
      if (level[i] !== level[j] && cells[i] !== K.ramp && cells[j] !== K.ramp) continue;
      dist[j] = dist[i] + 1; q[t++] = j;
    }
  }
  return dist;
}

/** Chebyshev (8-neighbour) distance to the nearest cell where src(i) is true. */
function chebyshev(G, src) {
  const dist = new Int32Array(G.n).fill(-1), q = new Int32Array(G.n);
  let h = 0, t = 0;
  for (let i = 0; i < G.n; i++) if (src(i)) { dist[i] = 0; q[t++] = i; }
  while (h < t) {
    const i = q[h++], x = i % G.cols, z = (i / G.cols) | 0;
    for (const [dx, dz] of N8) {
      const nx = x + dx, nz = z + dz;
      if (!G.inb(nx, nz)) continue;
      const j = nz * G.cols + nx;
      if (dist[j] >= 0) continue;
      dist[j] = dist[i] + 1; q[t++] = j;
    }
  }
  return dist;
}

function cyclomatic(nv, edges) {
  const parent = []; for (let i = 0; i < nv; i++) parent.push(i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  let comps = nv;
  for (const e of edges) { const a = find(e.a), b = find(e.b); if (a !== b) { parent[a] = b; comps--; } }
  return edges.length - nv + comps;
}

function buildSlots(G, cells, h, layouts) {
  const inH = new Set(h.cells);
  const free = c => inH.has(c) && (cells[c] === K.grass || cells[c] === K.tallgrass);
  // door: the hollow cell next to the corridor (mouth side)
  let door = -1;
  for (const c of h.cells) {
    const x = c % G.cols, z = (c / G.cols) | 0;
    if (N4.some(([dx, dz]) => { const j = (z + dz) * G.cols + x + dx; return !inH.has(j) && G.inb(x + dx, z + dz) && cells[j] !== K.tree && cells[j] !== K.rock && cells[j] !== K.cliff && cells[j] !== K.water; })) { door = c; break; }
  }
  if (door < 0) door = h.cells[0];
  const dx0 = door % G.cols, dz0 = (door / G.cols) | 0;
  const dist = c => { const x = c % G.cols - dx0, z = ((c / G.cols) | 0) - dz0; return x * x + z * z; };
  const blocks = [];
  for (const c of h.cells) {
    const x = c % G.cols, z = (c / G.cols) | 0;
    const four = [c, c + 1, c + G.cols, c + G.cols + 1];
    if (x + 1 < G.cols && z + 1 < G.rows && four.every(free) && dist(c) >= 4) blocks.push({ id: c, cells: four, d: dist(c) });
  }
  const sortedB = sortBy(blocks, b => -b.d);
  const towerCands = sortBy(h.cells.filter(c => free(c) && dist(c) >= 1 && dist(c) <= 5), c => dist(c), () => 0);
  const out = [];
  for (let k = 0; k < layouts; k++) {
    const used = new Set([door]);
    const tower = towerCands.length ? towerCands[k % towerCands.length] : -1;
    if (tower >= 0) used.add(tower);
    const pens = [];
    for (let i = 0; i < sortedB.length; i++) {
      const b = sortedB[(i + k * 2) % sortedB.length];
      if (b.cells.some(c => used.has(c))) continue;
      for (const c of b.cells) used.add(c);
      pens.push(b.cells);
      if (pens.length >= 4) break;
    }
    out.push({ door, tower, pens });
  }
  return out;
}

function metrics(G, w, extra) {
  const { cells, level, cols } = w;
  const deg = new Int32Array(w.graph.nodes.length);
  for (const e of w.graph.edges) { deg[e.a]++; deg[e.b]++; }
  const trailNodes = w.graph.nodes.filter(n => n.kind !== 'hollowMouth' && n.kind !== 'landmark');
  const deadEnds = trailNodes.filter(n => deg[n.id] === 1).length;
  const branching = trailNodes.reduce((s, n) => s + deg[n.id], 0) / Math.max(1, trailNodes.length);
  // hiddenness: metres off the trail x share of the hollow no trail cell can see (14 m sight)
  const SR = 7;
  let hid = 0;
  for (const h of w.hollows) {
    let seen = 0;
    for (const c of h.cells) {
      const x = c % cols, z = (c / cols) | 0;
      let vis = false;
      for (let dz = -SR; dz <= SR && !vis; dz++) for (let dx = -SR; dx <= SR && !vis; dx++) {
        if (dx * dx + dz * dz > SR * SR) continue;
        const tx = x + dx, tz = z + dz;
        if (!G.inb(tx, tz) || cells[tz * cols + tx] !== K.trail) continue;
        if (lineOfSight(G, cells, level, tx, tz, x, z)) vis = true;
      }
      if (vis) seen++;
    }
    const share = 1 - seen / Math.max(1, h.cells.length);
    const off = extra.dTrail[Math.floor(h.z / w.cell) * cols + Math.floor(h.x / w.cell)];
    h.hidden = Math.round(share * 100) / 100;
    h.offTrail = off >= 0 ? off * w.cell : null;
    hid += share * Math.max(0, off) * w.cell;
  }
  // largest open area: a component of open cells whose 8 neighbours are all open
  const core = new Uint8Array(G.n);
  for (let i = 0; i < G.n; i++) {
    if (!OPEN[cells[i]]) continue;
    const x = i % cols, z = (i / cols) | 0;
    core[i] = N8.every(([dx, dz]) => G.inb(x + dx, z + dz) && OPEN[cells[(z + dz) * cols + x + dx]]) ? 1 : 0;
  }
  let largest = 0;
  for (const c of components(G, core).comps) largest = Math.max(largest, c.length);
  const round = v => Math.round(v * 1000) / 1000;
  return {
    forest: round(extra.forest), plateau: round(extra.plateau), water: round(extra.water),
    glades: w.graph.nodes.filter(n => n.kind === 'glade').length, hollows: w.hollows.length,
    loops: extra.loops, deadEnds, branching: round(branching), fords: extra.fords,
    hiddenness: round(hid / Math.max(1, w.hollows.length)), largestOpen: largest * w.cell * w.cell,
    kennelDistance: extra.kennelDistance == null ? null : Math.round(extra.kennelDistance),
    features: w.features.length, ramps: w.plateaus.reduce((s, p) => s + p.ramps, 0),
  };
}

/** Integer line of sight between two cells (Bresenham). Trees, rocks and cliffs block; a ground eye
 *  never sees a plateau cell; the end cells themselves never block. */
export function lineOfSight(G, cells, level, x0, z0, x1, z1) {
  const eye = level[z0 * G.cols + x0];
  if (eye === 0 && level[z1 * G.cols + x1] === 1 && cells[z1 * G.cols + x1] !== K.ramp) return false;
  let dx = Math.abs(x1 - x0), dz = -Math.abs(z1 - z0), sx = x0 < x1 ? 1 : -1, sz = z0 < z1 ? 1 : -1, err = dx + dz;
  let x = x0, z = z0;
  for (;;) {
    if (x === x1 && z === z1) return true;
    if (!(x === x0 && z === z0)) {
      const c = z * G.cols + x;
      if (BLOCKS_SIGHT[cells[c]] && !(eye === 1 && cells[c] === K.cliff)) return false;
    }
    const e2 = 2 * err;
    if (e2 >= dz) { err += dz; x += sx; }
    if (e2 <= dx) { err += dx; z += sz; }
  }
}

function makeNamer(N, rng) {
  const usedG = new Set(), usedF = {};
  return {
    glade() {
      for (let t = 0; t < 40; t++) {
        const s = `${N.glade.first[int(rng, N.glade.first.length)]} ${N.glade.second[int(rng, N.glade.second.length)]}`;
        if (!usedG.has(s)) { usedG.add(s); return s; }
      }
      return `Glade ${usedG.size + 1}`;
    },
    feature(kind) {
      const list = N[kind];
      usedF[kind] = usedF[kind] || [];
      const free = list.filter(x => !usedF[kind].includes(x));
      const s = free.length ? free[int(rng, free.length)] : `${list[0]} ${usedF[kind].length + 1}`;
      usedF[kind].push(s);
      return s.charAt(0).toUpperCase() + s.slice(1);
    },
  };
}

/** World for a format (reads data/hvf/rules.json formats). */
export function worldForFormat(hvfData, seed, format, size) {
  const f = hvfData.rules.formats[format];
  if (!f) throw new Error(`Unknown Hunters vs Farmers format "${format}"`);
  return generateWorld(hvfData.mapgen, { seed, size: size || f.size, farmers: f.farmers, hunters: f.hunters });
}
