// Farhold R27 M8 — roads you can read: signposts at junctions, milestones along the roads, and lamps
// on the approach to a town. Pure placement: no Three.js, so node tests run the very code the game
// runs. js/features.js stands the results up as instanced meshes; main.js reads a signpost's arms
// out to the log when you press E at it.
//
// THE ONE RULE THAT MATTERS: A SIGN NAMES THE PLACE THAT ROAD LEADS TO, NOT THE NEAREST TOWN.
// Every arm is worked out by walking the road network (`roadGraph`) from the post, out along that
// arm's own branch, until the first settlement is reached — so "Dearbigate 4 km" is 4 km of ROAD to
// Dearbigate that way, not Dearbigate's distance as the crow flies. A branch that leads nowhere (a
// spur to a landmark) gets no arm at all rather than a wrong one.
//
//   const side = createRoadside({ terrain, settlements, extentOf });
//   side.posts()        // [{ x, z, yaw, junction, arms: [{ yaw, dir, settlement, metres }] }]
//   side.milestones()   // [{ x, z, yaw, path, km }]
//   side.lampsFor(s)    // [{ x, z, yaw, settlement }]  (towns of size >= 3 only)
//
// Names are NOT decided here: a sign names a place only if the player may know it (the round-10
// reveal rule, js/map.js `knows`), and that changes while you play. So an arm carries the settlement
// id and main.js reads it out with the rule applied at the moment you look (`armText`).

/** A milestone every this many metres of highway or road, counted from the road's own start. */
export const MILESTONE_EVERY = 2000;
/** Lamps: one every this many metres, out to this far past a town's wall, on towns of this size. */
export const LAMP_EVERY = 30;
export const LAMP_REACH = 400;
export const LAMP_MIN_SIZE = 3;
/**
 * How far off the carriageway a sign stands — the round-21 waystone rule, `half + footing + 1`.
 * `FOOTING` is how far the sign itself reaches from its centre (a post, a milestone, a lamp base).
 */
export const FOOTING = { signpost: 0.4, milestone: 0.45, lamppost: 0.3 };
/** A junction closer than this to a settlement's centre is part of the town, not the road. */
const IN_TOWN = 1.0;
/** Road classes that get milestones. A trail is a footpath; nobody counts its kilometres. */
const MILESTONE_CLASSES = new Set(['highway', 'road']);

const hyp = Math.hypot;

/** Arc lengths along a polyline. */
function arcs(points) {
  const S = [0];
  for (let k = 1; k < points.length; k++) S.push(S[k - 1] + hyp(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
  return S;
}

/** The point, the heading (unit vector) and the segment index at arc length `s`. */
function pointAt(points, S, s) {
  let k = 0;
  while (k + 1 < S.length - 1 && S[k + 1] < s) k++;
  const a = points[k], b = points[Math.min(points.length - 1, k + 1)];
  const len = S[k + 1] - S[k] || 1;
  const u = Math.max(0, Math.min(1, (s - S[k]) / len));
  const dx = b[0] - a[0], dz = b[1] - a[1], l = hyp(dx, dz) || 1;
  return { x: a[0] + dx * u, z: a[1] + dz * u, dx: dx / l, dz: dz / l, k };
}

/** Where on a polyline a point projects, as arc length, with the distance to it. */
function project(points, S, x, z) {
  let best = null;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k], [bx, bz] = points[k + 1];
    const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
    const d = hyp(ax + vx * t - x, az + vz * t - z);
    if (!best || d < best.d) best = { d, s: S[k] + (S[k + 1] - S[k]) * t };
  }
  return best;
}

/**
 * THE ROAD NETWORK AS A GRAPH.
 *
 * Nodes are the places a traveller can choose a way: every filed junction (`terrain.junctions`),
 * every settlement a road reaches, and the loose end of every road. Edges are the stretches of road
 * between two of them, weighted by their length along the road. A settlement is "reached" by a road
 * where the road passes within its ring (or 40 m) of its centre — that is where World Forge routed
 * it to — and a road that ends within 3 m of another node is joined to it.
 *
 * Returns `{ nodes, edges, adj, townNode }`: `nodes[i] = { x, z, kind, settlement?, junction? }`,
 * `edges[e] = { a, b, w, path, sa, sb }` (arc lengths along the path), `adj[i] = [edge ids]`.
 */
export function roadGraph(paths, junctions = [], settlements = [], extentOf = null, wetAt = null) {
  const nodes = [], edges = [], adj = [];
  const addNode = (n) => { nodes.push(n); adj.push([]); return nodes.length - 1; };
  const townNode = new Map();
  for (const s of settlements) {
    const i = addNode({ x: s.wx, z: s.wz, kind: 'town', settlement: s.id });
    townNode.set(s.id, i);
  }
  const jNode = junctions.map((j, q) => addNode({ x: j.x, z: j.z, kind: 'junction', junction: q }));
  const ringOf = s => Math.max(40, extentOf ? extentOf(s).ring : 40);

  for (const path of paths) {
    const pts = path.points;
    if (!pts || pts.length < 2) continue;
    const S = arcs(pts), L = S[S.length - 1];
    /**
     * A ROAD YOU CANNOT WALK IS NOT A WAY. Where a route runs out over open water it is a sea lane
     * (`path.wet`), js/features.js draws no road there, and a sign must not send you across it. So
     * a road is cut into its DRY runs and each run is its own stretch of the graph — the same rule
     * the ribbon uses (`wetAt(path, i)`, a wet point with a wet neighbour or over real water).
     */
    const runs = [];
    let a = -1;
    for (let i = 0; i <= pts.length; i++) {
      const dry = i < pts.length && !(wetAt && wetAt(path, i));
      if (dry && a < 0) a = i;
      if (!dry && a >= 0) { if (i - a >= 2) runs.push([S[a], S[i - 1]]); a = -1; }
    }
    for (const [lo, hi] of runs) {
      const stations = [];
      // every filed junction that lies on this stretch (its own ends included)
      junctions.forEach((j, q) => {
        if (!j.roads?.some(r => String(r) === String(path.id))) return;
        const p = project(pts, S, j.x, j.z);
        if (p && p.d < 2.5 && p.s >= lo - 0.5 && p.s <= hi + 0.5) stations.push({ s: p.s, node: jNode[q] });
      });
      // every settlement it reaches
      for (const s of settlements) {
        const ring = ringOf(s);
        if (Math.abs(s.wx - pts[0][0]) > L + ring && Math.abs(s.wz - pts[0][1]) > L + ring) continue;
        const p = project(pts, S, s.wx, s.wz);
        if (p && p.d < ring && p.s >= lo - 0.5 && p.s <= hi + 0.5) stations.push({ s: p.s, node: townNode.get(s.id) });
      }
      // its loose ends
      for (const s of [lo, hi]) {
        if (stations.some(q => Math.abs(q.s - s) < 3)) continue;
        const pt = pointAt(pts, S, s);
        let n = nodes.findIndex(q => q.kind !== 'town' && hyp(q.x - pt.x, q.z - pt.z) < 3);
        if (n < 0) n = addNode({ x: pt.x, z: pt.z, kind: 'end' });
        stations.push({ s, node: n });
      }
      stations.sort((p, q) => p.s - q.s);
      for (let k = 0; k + 1 < stations.length; k++) {
        const A = stations[k], B = stations[k + 1];
        if (A.node === B.node) continue;
        const e = edges.length;
        edges.push({ a: A.node, b: B.node, w: Math.max(0.01, B.s - A.s), path, sa: A.s, sb: B.s });
        adj[A.node].push(e); adj[B.node].push(e);
      }
    }
  }
  return { nodes, edges, adj, townNode };
}

/**
 * The first settlement reached leaving `from` along edge `first`, never passing back through
 * `from`: Dijkstra over the road graph. Returns `{ settlement, metres, via: [node…] }` or null.
 */
export function walkBranch(graph, from, first) {
  const { nodes, edges, adj } = graph;
  const e0 = edges[first];
  const start = e0.a === from ? e0.b : e0.a;
  const dist = new Map([[start, e0.w]]);
  const prev = new Map([[start, from]]);
  const done = new Set([from]);
  // a small binary heap would be faster; the graph is a few hundred nodes, and this runs once per arm
  const open = [start];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (dist.get(open[i]) < dist.get(open[bi])) bi = i;
    const n = open.splice(bi, 1)[0];
    if (done.has(n)) continue;
    done.add(n);
    if (nodes[n].kind === 'town') {
      const via = [n];
      for (let p = prev.get(n); p != null; p = prev.get(p)) { via.unshift(p); if (p === from) break; }
      return { settlement: nodes[n].settlement, metres: dist.get(n), via };
    }
    for (const e of adj[n]) {
      const E = edges[e], m = E.a === n ? E.b : E.a;
      if (done.has(m)) continue;
      const d = dist.get(n) + E.w;
      if (d < (dist.get(m) ?? Infinity)) { dist.set(m, d); prev.set(m, n); open.push(m); }
    }
  }
  return null;
}

/** Which way edge `e` leaves node `n`, as a unit vector: the road's heading 12 m out. */
function leaving(graph, n, e) {
  const E = graph.edges[e];
  const pts = E.path.points, S = arcs(pts);
  const out = E.a === n;
  const s0 = out ? E.sa : E.sb, s1 = out ? Math.min(E.sb, E.sa + 12) : Math.max(E.sa, E.sb - 12);
  const p0 = pointAt(pts, S, s0), p1 = pointAt(pts, S, s1);
  const dx = p1.x - p0.x, dz = p1.z - p0.z, l = hyp(dx, dz) || 1;
  return [dx / l, dz / l];
}

/**
 * Where a post stands at a node with arms in `dirs`: in the WIDEST gap between two arms, on its
 * bisector, far enough out to clear both of the roads either side of that gap by `clear(arm)`
 * metres (the waystone rule). A dead end (one arm) stands to the side of it.
 */
export function postSpot(x, z, arms) {
  if (!arms.length) return null;
  const ang = arms.map(a => Math.atan2(a.dir[1], a.dir[0])).map((t, i) => ({ t, i })).sort((p, q) => p.t - q.t);
  let best = null;
  for (let k = 0; k < ang.length; k++) {
    const a = ang[k], b = ang[(k + 1) % ang.length];
    let gap = b.t - a.t;
    if (gap <= 0) gap += Math.PI * 2;
    if (!best || gap > best.gap) best = { gap, a, b };
  }
  if (ang.length === 1) best = { gap: Math.PI * 2, a: ang[0], b: ang[0] };
  const mid = best.a.t + best.gap / 2;
  const half = Math.min(best.gap / 2, Math.PI / 2);
  const need = Math.max(arms[best.a.i].clear, arms[best.b.i].clear);
  const d = need / Math.max(0.2, Math.sin(half));
  return { x: x + Math.cos(mid) * d, z: z + Math.sin(mid) * d, d };
}

/**
 * The roadside, for one world. `settlements` are js/features.js's (id, name, wx, wz, size);
 * `extentOf(s)` is js/town-plan.js `townExtent`, asked lazily because a town's real wall is only
 * known once it has been planned.
 */
export function createRoadside({ terrain, settlements = [], extentOf = null } = {}) {
  const paths = (terrain?.roadPaths || []).filter(p => p.points?.length >= 2);
  const junctions = terrain?.junctions || [];
  let graph = null;
  // the ribbon's own wet rule (js/features.js `wetAt` in buildRibbons): a sea lane is a RUN
  const wetAt = (path, i) => {
    if (!path.wet?.[i]) return false;
    if (path.wet[i - 1] || path.wet[i + 1]) return true;
    const [x, z] = path.points[i];
    return !!terrain?.waterAt?.(x, z);
  };
  const G = () => (graph ||= roadGraph(paths, junctions, settlements, extentOf, wetAt));
  const extent = s => (extentOf ? extentOf(s) : { ring: 40, wall: 40, walled: false });
  /** Is (x, z) inside a settlement's edge (its wall, or its ring for an open town)? */
  const inTown = (x, z, pad = 0) => settlements.find(s => {
    const e = extent(s);
    return hyp(s.wx - x, s.wz - z) < Math.max(e.wall || 0, e.ring || 0) * IN_TOWN + pad;
  }) || null;
  /** The nearest road centre line to a point, and its half-width: `{ d, half, path }`. */
  const roadNear = (x, z) => {
    let best = null;
    for (const p of paths) {
      const pts = p.points;
      // cheap reject on the bounding box
      if (!p._box) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const q of pts) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); z0 = Math.min(z0, q[1]); z1 = Math.max(z1, q[1]); }
        p._box = [x0, x1, z0, z1];
      }
      const [x0, x1, z0, z1] = p._box;
      if (x < x0 - 30 || x > x1 + 30 || z < z0 - 30 || z > z1 + 30) continue;
      for (let k = 0; k + 1 < pts.length; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
        const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
        const d = hyp(ax + vx * t - x, az + vz * t - z);
        if (!best || d - p.half < best.d - best.half) best = { d, half: p.half, path: p };
      }
    }
    return best;
  };
  /** Clear of every carriageway by its own footing (the waystone rule), dry, and not on a bridge. */
  const standable = (x, z, footing) => {
    const r = roadNear(x, z);
    // clear of the nearest carriageway by the footing, and never closer than a metre past its kerb
    if (r && r.d < r.half + Math.max(1, footing + 0.5)) return false;
    if (terrain?.waterAt?.(x, z) || terrain?.underwater?.(x, z)) return false;
    if (terrain?.bridgedAt?.(x, z, 1)) return false;
    return true;
  };

  let junctionPosts = null;
  const linkCache = new Map();
  /**
   * Signposts: one at every filed junction outside a town, and one at every town link. A town's
   * wall is only known once it has been planned, so the junction posts are worked out once and
   * the town-link posts once per town per edge, and WHICH of them stand is asked each time: a post
   * inside any town's edge as it stands now is not put up.
   */
  function posts() {
    const g = G();
    const make = (n, kind) => {
      const node = g.nodes[n];
      const arms = [];
      for (const e of g.adj[n]) {
        const to = walkBranch(g, n, e);
        if (!to || to.settlement == null) continue;
        const dir = leaving(g, n, e);
        arms.push({ dir, yaw: Math.atan2(dir[0], dir[1]), settlement: to.settlement, metres: to.metres, edge: e,
          clear: g.edges[e].path.half + FOOTING.signpost + 1, via: to.via.map(q => g.nodes[q]).map(q => [q.x, q.z]) });
      }
      // two arms that point the same way to the same place are one arm
      const kept = [];
      for (const a of arms) {
        if (kept.some(b => b.settlement === a.settlement && a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] > 0.9)) continue;
        kept.push(a);
      }
      if (!kept.length) return;
      // every road through this node, not only the ones with an arm, must be cleared
      const all = g.adj[n].map(e => ({ dir: leaving(g, n, e), clear: g.edges[e].path.half + FOOTING.signpost + 1 }));
      const spot = postSpot(node.x, node.z, all);
      if (!spot) return;
      let { x, z } = spot;
      if (!standable(x, z, FOOTING.signpost)) {
        // step out along the bisector a metre at a time, up to four, before giving up
        let ok = false;
        const ux = (x - node.x) / (spot.d || 1), uz = (z - node.z) / (spot.d || 1);
        for (let k = 1; k <= 4 && !ok; k++) { x = spot.x + ux * k; z = spot.z + uz * k; ok = standable(x, z, FOOTING.signpost); }
        if (!ok) return;
      }
      return {
        x, z, yaw: Math.atan2(x - node.x, z - node.z), kind, node: n,
        junction: node.junction ?? null, at: [node.x, node.z],
        arms: kept.map(({ dir, yaw, settlement, metres, via }) => ({ dir, yaw, settlement, metres, via })),
      };
    };
    if (!junctionPosts) {
      junctionPosts = [];
      for (let n = 0; n < g.nodes.length; n++) {
        if (g.nodes[n].kind !== 'junction') continue;
        const post = make(n, 'junction');
        if (post) junctionPosts.push(post);
      }
    }
    const out = junctionPosts.filter(p => !inTown(p.at[0], p.at[1], 10) && !inTown(p.x, p.z));
    // a town link: where a road leaves a settlement's edge, a post just outside it
    for (const s of settlements) {
      const e = extent(s);
      const edge = Math.max(e.wall || 0, e.ring || 0);
      const key = `${s.id}:${edge.toFixed(1)}`;
      if (!linkCache.has(key)) linkCache.set(key, linksFor(s, edge, e, make));
      for (const p of linkCache.get(key)) if (!inTown(p.x, p.z)) out.push(p);
    }
    return out;
  }

  /** The town-link posts of one settlement at one edge radius. */
  function linksFor(s, edge, e, make) {
    const found = [];
    {
      for (const p of paths) {
        const pts = p.points, S = arcs(pts);
        const L = S[S.length - 1];
        const near = project(pts, S, s.wx, s.wz);
        if (!near || near.d > Math.max(40, e.ring || 40)) continue;
        // walk out both ways from the town to the first point past its edge (+ 12 m)
        for (const sign of [-1, 1]) {
          let hit = null;
          for (let q = near.s; q >= 0 && q <= L; q += sign * 2) {
            const pt = pointAt(pts, S, q);
            if (hyp(pt.x - s.wx, pt.z - s.wz) > edge + 12) { hit = { ...pt, s: q }; break; }
          }
          if (!hit) continue;
          // the post's node: a temporary one on the graph, split onto this edge
          const g2 = G();
          const eIdx = g2.edges.findIndex(E => E.path === p && Math.min(E.sa, E.sb) <= hit.s && Math.max(E.sa, E.sb) >= hit.s);
          if (eIdx < 0) continue;
          const E = g2.edges[eIdx];
          const n = g2.nodes.length;
          g2.nodes.push({ x: hit.x, z: hit.z, kind: 'link', settlement: null, link: s.id });
          g2.adj.push([]);
          const e1 = g2.edges.length, e2 = e1 + 1;
          g2.edges.push({ a: E.a, b: n, w: Math.max(0.01, hit.s - E.sa), path: p, sa: E.sa, sb: hit.s });
          g2.edges.push({ a: n, b: E.b, w: Math.max(0.01, E.sb - hit.s), path: p, sa: hit.s, sb: E.sb });
          g2.adj[n].push(e1, e2);
          // …and the edge it splits is out of the network while it is split, or a walk could leave
          // down one half and come back along the whole, straight through the post
          const lift = list => { const i = list.indexOf(eIdx); if (i >= 0) list.splice(i, 1); };
          lift(g2.adj[E.a]); lift(g2.adj[E.b]);
          g2.adj[E.a].push(e1); g2.adj[E.b].push(e2);
          const made = make(n, 'link');
          if (made) { made.town = s.id; found.push(made); }
          // take the temporary node back out, so the next walk sees the network as it is
          g2.adj[E.a].pop(); g2.adj[E.b].pop();
          g2.adj[E.a].push(eIdx); g2.adj[E.b].push(eIdx);
          g2.edges.length = e1; g2.nodes.length = n; g2.adj.length = n;
        }
      }
    }
    return found;
  }

  let stones = null;
  /** Milestones: every 2 km of highway and road, beside the carriageway on its right. */
  function milestones() {
    if (stones) return stones;
    stones = [];
    for (const p of paths) {
      if (!MILESTONE_CLASSES.has(p.klass)) continue;
      const S = arcs(p.points), L = S[S.length - 1];
      for (let s0 = MILESTONE_EVERY; s0 <= L; s0 += MILESTONE_EVERY) {
        const off = p.half + FOOTING.milestone + 1;
        // the right-hand verge, the left if the right is wet or on another road; and if neither will
        // take a stone, up to 40 m either way along the road (the spacing allows ±50 m)
        let done = false;
        for (const shift of [0, 10, -10, 20, -20, 30, -30, 40, -40]) {
          const s = s0 + shift;
          if (s < 0 || s > L) continue;
          const pt = pointAt(p.points, S, s);
          for (const side of [1, -1]) {
            const x = pt.x - pt.dz * off * side, z = pt.z + pt.dx * off * side;
            if (inTown(x, z) || !standable(x, z, FOOTING.milestone)) continue;
            stones.push({ x, z, yaw: Math.atan2(pt.dx, pt.dz), path: p.id, s, km: Math.round(s0 / 1000), along: [pt.x, pt.z] });
            done = true;
            break;
          }
          if (done) break;
        }
      }
    }
    return stones;
  }

  const lampCache = new Map();
  /**
   * Lamps on the approach to a town of size 3 or more: every 30 m along each road from its wall out
   * to 400 m past it, on the verge. Asked per town, when it is planned, because only then is its
   * wall's real radius known; kept until its extent changes.
   */
  function lampsFor(s) {
    if (!s || (s.size || 1) < LAMP_MIN_SIZE) return [];
    const e = extent(s);
    const edge = Math.max(e.wall || 0, e.ring || 0);
    const key = `${s.id}:${edge.toFixed(1)}`;
    if (lampCache.has(key)) return lampCache.get(key).filter(l => !inTown(l.x, l.z, 2));
    const out = [];
    for (const p of paths) {
      const pts = p.points, S = arcs(pts), L = S[S.length - 1];
      const near = project(pts, S, s.wx, s.wz);
      if (!near || near.d > Math.max(40, e.ring || 40)) continue;
      const off = p.half + FOOTING.lamppost + 1;
      for (const sign of [-1, 1]) {
        // from the wall outward: find where the road leaves the edge, then a lamp every 30 m
        let from = null;
        for (let q = near.s; q >= 0 && q <= L; q += sign * 2) {
          const pt = pointAt(pts, S, q);
          if (hyp(pt.x - s.wx, pt.z - s.wz) > edge + 6) { from = q; break; }
        }
        if (from == null) continue;
        let n = 0;
        for (let q = from; q >= 0 && q <= L; q += sign * LAMP_EVERY) {
          const pt = pointAt(pts, S, q);
          if (hyp(pt.x - s.wx, pt.z - s.wz) > edge + LAMP_REACH) break;
          // alternate sides down the road, so an approach is lit on both verges
          const side = (n++ % 2 ? -1 : 1) * sign;
          const x = pt.x - pt.dz * off * side, z = pt.z + pt.dx * off * side;
          if (!standable(x, z, FOOTING.lamppost)) continue;
          // `face` turns the lamp's bracket out over the road it lights
          out.push({ x, z, yaw: Math.atan2(pt.dx, pt.dz), face: Math.atan2(pt.dz * side, -pt.dx * side), side, settlement: s.id, path: p.id });
        }
      }
    }
    lampCache.set(key, out);
    // …and never inside a town, asked NOW: a neighbour planned since may have a wider wall
    return out.filter(l => !inTown(l.x, l.z, 2));
  }

  return { graph: G, posts, milestones, lampsFor, roadNear, inTown, standable };
}

/**
 * The text of one arm, with the reveal rule applied: a place the player may not know yet reads
 * "?". `knows(settlement)` answers that; `nameOf(settlement)` gives the name.
 */
export function armText(arm, { knows = () => true, nameOf = id => String(id) } = {}) {
  const name = knows(arm.settlement) ? nameOf(arm.settlement) : '?';
  const km = arm.metres / 1000;
  return `${name} ${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

/** A compass word for a heading (the arm's direction, +z north as the map draws it). */
export function compassWord(dir) {
  const a = Math.atan2(dir[0], -dir[1]);           // 0 = north (−z on the map), clockwise
  const words = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  return words[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

/**
 * What a signpost says when you read it (E): one line per arm, with the way it points, the place it
 * leads to — or "?" for a place you have not been to or heard of — and the distance by road.
 * `zoneOf(x, z)` and `knowsZone(id)` are the map's own reveal rule (js/map.js `knows`), so a sign
 * and the map can never disagree about what you know.
 */
export function readSign(post, { settlements = [], zoneOf = null, knowsZone = null } = {}) {
  const byId = new Map(settlements.map(s => [s.id, s]));
  const knows = id => {
    const s = byId.get(id);
    if (!s) return false;
    if (!zoneOf || !knowsZone) return true;
    const z = zoneOf(s.wx, s.wz);
    return !!z && !!knowsZone(z.id);
  };
  const nameOf = id => byId.get(id)?.name || '?';
  const lines = post.arms.map(a => `${compassWord(a.dir)}: ${armText(a, { knows, nameOf })}`);
  return `The signpost reads — ${lines.join(' · ')}.`;
}
