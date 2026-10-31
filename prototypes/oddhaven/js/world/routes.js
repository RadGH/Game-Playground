// The rails cars follow (PLAN §2 "Traffic"). Pure: reads a world's roadGraph, returns a lane network the sim, the view
// and the tests all share. Cars keep to the right. A lane is one direction of one road, cut back from its two ends; a
// link is the short curve through a junction from one lane to the next. Everything has an id that names no coordinates.
//
//   const net = buildNetwork(world);
//   net.lanes[i] = { id, kind:'road'|'link', node, from, to, next:[lane index...], prev:[...], limit, len, n,
//                    x:Float32Array, y, z, cum:Float32Array, county:bool }
//   pointAt(lane, s, out)        // { x, y, z, ux, uz } s metres along the lane, clamped to its ends

const STEP = 1;                 // metres between stored rail points

function offsetLine(pts, off) {
  // right of travel = (-dz, dx)
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    out.push([pts[i][0] - dz / L * off, pts[i][1] + dx / L * off, pts[i][2]]);
  }
  return out;
}
function cut(pts, s0, s1) {
  // keeps the part of a polyline from s0 metres after the start to s1 metres before the end
  let total = 0; const cum = [0];
  for (let i = 1; i < pts.length; i++) { total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(total); }
  const a = s0, b = total - s1, out = [];
  const at = s => {
    let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1), p = pts[i - 1], q = pts[i];
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  };
  for (let s = a; s < b; s += STEP) out.push(at(s));
  out.push(at(b));
  return out;
}
function makeLane(base, pts) {
  const n = pts.length, x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = pts[i][0]; z[i] = pts[i][1]; y[i] = pts[i][2];
    if (i) c[i] = c[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  return { ...base, n, x, y, z, cum: c, len: c[n - 1], next: [], prev: [] };
}
/** Where lines (p, u) and (q, v) cross, or null if they are nearly parallel. */
function cross(p, u, q, v) {
  const d = u[0] * v[1] - u[1] * v[0];
  if (Math.abs(d) < 0.15) return null;
  const t = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / d;
  return t > 0 ? [p[0] + u[0] * t, p[1] + u[1] * t] : null;
}
const dirEnd = L => { const n = L.n - 1, k = Math.max(0, n - 2), d = Math.hypot(L.x[n] - L.x[k], L.z[n] - L.z[k]) || 1; return [(L.x[n] - L.x[k]) / d, (L.z[n] - L.z[k]) / d]; };
const dirStart = L => { const k = Math.min(L.n - 1, 2), d = Math.hypot(L.x[k] - L.x[0], L.z[k] - L.z[0]) || 1; return [(L.x[k] - L.x[0]) / d, (L.z[k] - L.z[0]) / d]; };

function linkCurve(A, B) {
  const a = A.n - 1, p = [A.x[a], A.z[a]], q = [B.x[0], B.z[0]], u = dirEnd(A), v = dirStart(B);
  const gap = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const c = cross(p, u, q, v);
  const cubic = !c;                                 // straight on, or a turn back: a smooth S / U from the two tangents
  const reach = Math.max(gap * 0.45, 3);
  const c0 = cubic ? [p[0] + u[0] * reach, p[1] + u[1] * reach] : c, c1 = cubic ? [q[0] - v[0] * reach, q[1] - v[1] * reach] : c;
  const y0 = A.y[a], y1 = B.y[0], steps = Math.max(4, Math.ceil(gap * 1.4));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, m = 1 - t;
    const x = m * m * m * p[0] + 3 * m * m * t * c0[0] + 3 * m * t * t * c1[0] + t * t * t * q[0];
    const z = m * m * m * p[1] + 3 * m * m * t * c0[1] + 3 * m * t * t * c1[1] + t * t * t * q[1];
    pts.push([x, z, y0 + (y1 - y0) * t]);
  }
  return pts;
}
/** A sharper curve wants a lower speed: the tightest bend on the link sets its limit. */
function turnLimit(L, street) {
  let worst = 1e9;
  for (let i = 2; i + 2 < L.n; i++) {
    const a1 = Math.atan2(L.z[i] - L.z[i - 2], L.x[i] - L.x[i - 2]), a2 = Math.atan2(L.z[i + 2] - L.z[i], L.x[i + 2] - L.x[i]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    const ds = (L.cum[i + 2] - L.cum[i - 2]) / 2;
    if (d > 1e-3) worst = Math.min(worst, ds / d);
  }
  return Math.max(3.5, Math.min(street, Math.sqrt(2.6 * worst)));
}

export function buildNetwork(world) {
  const { roads, roadGraph, lane: spec, speed } = world;
  const nodes = new Map(roadGraph.nodes.map(n => [n.id, n]));
  const degree = id => nodes.get(id).edges.length;
  const setback = id => (degree(id) >= 3 ? spec.halfW + spec.pavement + 3.2 : degree(id) === 2 ? 5 : 4);
  const lanes = [], inOf = new Map(), outOf = new Map();
  const put = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
  roads.forEach(r => {
    for (const [from, to, pts] of [[r.from, r.to, r.pts], [r.to, r.from, r.pts.slice().reverse()]]) {
      const line = cut(offsetLine(pts, spec.offset), setback(from), setback(to));
      const L = makeLane({ id: `${r.id}:${from === r.from ? 'f' : 'b'}`, kind: 'road', road: r.id, from, to, limit: r.limit, county: r.cls === 'county' }, line);
      const i = lanes.length; L.index = i; lanes.push(L);
      put(outOf, from, i); put(inOf, to, i);
    }
  });
  // links through every node: from each lane in to each lane out; no turning back unless it is the only way on
  for (const [id] of nodes) {
    const ins = inOf.get(id) || [], outs = outOf.get(id) || [];
    for (const a of ins) {
      const A = lanes[a], options = outs.filter(b => lanes[b].road !== A.road);
      for (const b of options.length ? options : outs) {
        const B = lanes[b];
        const L = makeLane({ id: `${A.id}>${B.id}`, kind: 'link', node: id, from: A.id, to: B.id, limit: speed.turn, county: false }, linkCurve(A, B));
        L.limit = turnLimit(L, Math.min(A.limit, B.limit));
        L.index = lanes.length; lanes.push(L);
        A.next.push(L.index); L.next.push(b); L.prev.push(a); B.prev.push(L.index);
      }
    }
  }
  return { lanes, byId: new Map(lanes.map(l => [l.id, l])), roads: lanes.filter(l => l.kind === 'road') };
}
export function pointAt(L, s, out = {}) {
  const c = L.cum, n = L.n;
  if (s <= 0) { out.x = L.x[0]; out.y = L.y[0]; out.z = L.z[0]; return out; }
  if (s >= L.len) { out.x = L.x[n - 1]; out.y = L.y[n - 1]; out.z = L.z[n - 1]; return out; }
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
  const t = (s - c[lo]) / (c[hi] - c[lo] || 1);
  out.x = L.x[lo] + (L.x[hi] - L.x[lo]) * t; out.y = L.y[lo] + (L.y[hi] - L.y[lo]) * t; out.z = L.z[lo] + (L.z[hi] - L.z[lo]) * t;
  return out;
}

/** Every lane reachable from every other, as a list of the ones that are not (empty = fully connected). */
export function unreachable(net) {
  const n = net.lanes.length, walk = (key) => {
    const seen = new Uint8Array(n), stack = [0]; seen[0] = 1;
    while (stack.length) for (const j of net.lanes[stack.pop()][key]) if (!seen[j]) { seen[j] = 1; stack.push(j); }
    return seen;
  };
  const f = walk('next'), b = walk('prev'), bad = [];
  for (let i = 0; i < n; i++) if (!f[i] || !b[i]) bad.push(net.lanes[i].id);
  return bad;
}
