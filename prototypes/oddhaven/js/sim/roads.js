// The road graph: distances, routes and points along a route, all from the town (town-api.md). Nothing here is saved:
// a route is rebuilt from its id, `${fromNode}>${toNode}`, so a save only ever holds ids. Same town, same routes
// (ties in the shortest-path search break on node order).

export function createRoads(town) {
  const nodes = town.nodes, N = nodes.length;
  const index = new Map(nodes.map((n, i) => [n.id, i]));
  const edges = town.edges.map((e, i) => {
    const a = index.get(e.a), b = index.get(e.b);
    if (a === undefined || b === undefined) throw new Error(`town: edge ${e.id} names a node that does not exist`);
    const pts = e.points?.length >= 2 ? e.points : [[nodes[a].x, nodes[a].z], [nodes[b].x, nodes[b].z]];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    return { i, id: e.id, a, b, pts, len: e.length || len, speed: e.speed || 14, oneWay: !!e.oneWay };
  });
  const edgeBy = new Map(edges.map(e => [e.id, e]));
  const out = Array.from({ length: N }, () => []);
  for (const e of edges) {
    out[e.a].push({ to: e.b, e, fwd: true });
    if (!e.oneWay) out[e.b].push({ to: e.a, e, fwd: false });
  }
  const degree = out.map(l => l.length);
  const trees = new Array(N).fill(null), routes = new Map();

  /** Shortest paths from one node, computed once (households repeat the same trips). */
  function tree(from) {
    if (trees[from]) return trees[from];
    const dist = new Float64Array(N).fill(Infinity), via = new Array(N).fill(null), done = new Uint8Array(N);
    const heap = [[0, from]];
    dist[from] = 0;
    const push = v => { heap.push(v); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (less(heap[i], heap[p])) { [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; } else break; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (done[u]) continue;
      done[u] = 1;
      for (const step of out[u]) {
        const nd = d + step.e.len;
        if (nd < dist[step.to]) { dist[step.to] = nd; via[step.to] = { from: u, e: step.e, fwd: step.fwd }; push([nd, step.to]); }
      }
    }
    return (trees[from] = { dist, via });
  }

  function distance(aId, bId) {
    const a = index.get(aId), b = index.get(bId);
    return tree(a).dist[b];
  }

  /** The route from one node to another, built once. */
  function route(aId, bId) {
    const id = `${aId}>${bId}`;
    let r = routes.get(id);
    if (r) return r;
    const a = index.get(aId), b = index.get(bId), t = tree(a);
    if (a === undefined || b === undefined || t.dist[b] === Infinity) return null;
    const legs = [];
    for (let n = b; n !== a; n = t.via[n].from) legs.push(t.via[n]);
    legs.reverse();
    r = assemble(id, aId, bId, a, legs);
    routes.set(id, r);
    return r;
  }

  /** A route for a car that is already part way along a road: that road first, then the shortest way to `destId` that
   *  never turns back on itself except at a dead end (the lanes have no U-turn link anywhere else). Id: `@edge:f>node`. */
  function routeAlong(edgeId, fwd, destId) {
    const id = `@${edgeId}:${fwd ? 'f' : 'b'}>${destId}`;
    let r = routes.get(id);
    if (r) return r;
    const e0 = edgeBy.get(edgeId), dest = index.get(destId);
    if (!e0 || dest === undefined) return null;
    const endOf = (e, f) => (f ? e.b : e.a), key = (e, f) => e.i * 2 + (f ? 1 : 0);
    const dist = new Map([[key(e0, fwd), 0]]), via = new Map(), open = [[0, e0, !!fwd]], closed = new Set();
    let goal = null;
    while (open.length) {
      let m = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[m][0]) m = i;
      const [d, e, f] = open.splice(m, 1)[0], k = key(e, f);
      if (closed.has(k)) continue;
      closed.add(k);
      const u = endOf(e, f);
      if (u === dest) { goal = [e, f]; break; }
      const on = out[u].filter(st => st.e !== e), list = on.length ? on : out[u];
      for (const st of list) {
        const nk = key(st.e, st.fwd), nd = d + st.e.len;
        if (nd < (dist.get(nk) ?? Infinity)) { dist.set(nk, nd); via.set(nk, [e, f]); open.push([nd, st.e, st.fwd]); }
      }
    }
    if (!goal) return null;
    const legs = [];
    for (let at = goal; at; at = via.get(key(at[0], at[1]))) legs.push({ e: at[0], fwd: at[1] });
    legs.reverse();
    r = assemble(id, nodes[fwd ? e0.a : e0.b].id, destId, fwd ? e0.a : e0.b, legs);
    routes.set(id, r);
    return r;
  }

  function assemble(id, aId, bId, a, legs) {
    let s = 0, seconds = 0;
    const steps = [], points = [[nodes[a].x, nodes[a].z]], cum = [0];
    for (const leg of legs) {
      const e = leg.e, end = leg.fwd ? e.b : e.a;
      steps.push({ key: e.i * 2 + (leg.fwd ? 1 : 0), edge: e.id, fwd: leg.fwd, start: s, len: e.len, speed: e.speed, endNode: end, junction: degree[end] > 2 });
      const pts = leg.fwd ? e.pts : [...e.pts].reverse();
      const scale = e.len / polyLen(pts);
      for (let k = 1; k < pts.length; k++) {
        const prev = points[points.length - 1];
        cum.push(cum[cum.length - 1] + Math.hypot(pts[k][0] - prev[0], pts[k][1] - prev[1]) * scale);
        points.push(pts[k]);
      }
      s += e.len;
      seconds += e.len / e.speed;
    }
    return { id, from: aId, to: bId, steps, points, cum, length: s, seconds };
  }

  /** A route from its id, for loaded saves and the client. */
  function byId(id) {
    const hit = routes.get(id);
    if (hit) return hit;
    const cut = id.indexOf('>');
    const parse = v => (index.has(v) ? v : index.has(Number(v)) ? Number(v) : v);
    if (id[0] === '@') { const colon = id.lastIndexOf(':', cut); return routeAlong(id.slice(1, colon), id[colon + 1] === 'f', parse(id.slice(cut + 1))); }
    return route(parse(id.slice(0, cut)), parse(id.slice(cut + 1)));
  }

  /** The point `s` metres along a route, and its heading in radians. */
  function at(r, s) {
    const c = r.cum;
    if (r.points.length < 2) return { x: r.points[0][0], z: r.points[0][1], heading: 0 };
    let lo = 0, hi = c.length - 2;
    const q = Math.max(0, Math.min(r.length, s));
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= q) lo = m; else hi = m - 1; }
    const a = r.points[lo], b = r.points[lo + 1], f = c[lo + 1] > c[lo] ? (q - c[lo]) / (c[lo + 1] - c[lo]) : 0;
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, heading: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }

  return { distance, route, routeAlong, byId, at, edges, nodeIndex: index, degree, nodes, edgeById: id => edgeBy.get(id) };
}

const less = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
function polyLen(pts) {
  let l = 0;
  for (let k = 1; k < pts.length; k++) l += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
  return l || 1;
}
