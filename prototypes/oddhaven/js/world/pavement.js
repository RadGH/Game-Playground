// Where a person walks. The sim only says "this walk, from this tick to that tick, along this route" and the route runs
// down the middle of the road, so this turns it into the pavement: out of the door, along the kerb side of each street,
// across at the junctions, up to the other door. Same trip in, same path out, in a page or in node. Pure.
//
//   const paths = createPaths(world);
//   const path = paths.of(routeId, route, from, to);   // from, to = { x, z } doors; route = { points, steps }
//   pathAt(path, 0..1, out)   // { x, z, yaw }
//   parkAt(world, blockId, phase, out)                 // a stroll round a park's own loop

function cumulate(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return cum;
}
function sideLine(pts, off) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    out.push([pts[i][0] - (b[1] - a[1]) / L * off, pts[i][1] + (b[0] - a[0]) / L * off]);
  }
  return out;
}
function trim(pts, s0, s1) {
  // the part of a line from s0 metres after its start to s1 metres before its end; never less than one point
  const cum = cumulate(pts), total = cum[cum.length - 1], a = Math.min(s0, total * 0.45), b = total - Math.min(s1, total * 0.45), out = [];
  const at = s => { let i = 1; while (i < pts.length - 1 && cum[i] < s) i++; const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1), p = pts[i - 1], q = pts[i]; return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
  out.push(at(a));
  for (let i = 1; i < pts.length - 1; i++) if (cum[i] > a && cum[i] < b) out.push(pts[i]);
  out.push(at(b));
  return out;
}
const nearestIndex = (pts, p) => { let best = 0, d = 1e18; pts.forEach((q, i) => { const e = (q[0] - p.x) ** 2 + (q[1] - p.z) ** 2; if (e < d) { d = e; best = i; } }); return best; };
const gapTo = (pts, p) => { const q = pts[nearestIndex(pts, p)]; return Math.hypot(q[0] - p.x, q[1] - p.z); };

export function createPaths(world) {
  const roads = new Map(world.roads.map(r => [r.id, r])), nodes = new Map(world.roadGraph.nodes.map(n => [n.id, n]));
  const { halfW, pavement } = world.lane, walkOff = halfW + pavement / 2, corner = halfW + pavement + 0.6;
  const cache = new Map();
  const lineOf = st => {
    const r = roads.get(st.edge), pts = r.pts.map(p => [p[0], p[1]]);
    return { pts: st.fwd ? pts : pts.reverse(), startNode: st.fwd ? r.from : r.to, endNode: st.fwd ? r.to : r.from };
  };
  const setback = id => (nodes.get(id)?.edges.length >= 3 ? corner : 0);
  function walkLine(route, side) {
    return route.steps.map(st => { const l = lineOf(st); return trim(sideLine(l.pts, side * walkOff), setback(l.startNode), setback(l.endNode)); });
  }
  function build(route, from, to) {
    if (!route.steps.length) {
      const n = route.points[0];
      return finish([[from.x, from.z], n, [to.x, to.z]]);
    }
    const right = walkLine(route, 1), left = walkLine(route, -1);
    const lines = gapTo(right[0], from) <= gapTo(left[0], from) ? right : left;
    const first = lines[0], last = lines[lines.length - 1];
    const a = nearestIndex(first, from), b = nearestIndex(last, to);
    if (lines.length === 1 && b < a) return finish([[from.x, from.z], first[a], [to.x, to.z]]);
    const pts = [[from.x, from.z]];
    lines.forEach((line, i) => { const lo = i === 0 ? a : 0, hi = i === lines.length - 1 ? b : line.length - 1; for (let k = lo; k <= hi; k++) pts.push(line[k]); });
    pts.push([to.x, to.z]);
    return finish(pts);
  }
  function finish(raw) {
    const pts = [raw[0]];
    for (let i = 1; i < raw.length; i++) { const p = pts[pts.length - 1]; if (Math.hypot(raw[i][0] - p[0], raw[i][1] - p[1]) > 0.2) pts.push(raw[i]); }
    if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1]]);
    const cum = cumulate(pts);
    return { pts, cum, length: cum[cum.length - 1] };
  }
  return {
    of(id, route, from, to) {
      const key = `${id}|${from.x}|${from.z}|${to.x}|${to.z}`;
      let p = cache.get(key);
      if (!p) {
        if (cache.size > 2500) cache.clear();
        cache.set(key, p = build(route, from, to));
      }
      return p;
    },
  };
}

export function pathAt(path, f, out = {}) {
  const c = path.cum, s = Math.max(0, Math.min(1, f)) * path.length;
  let lo = 0, hi = c.length - 2;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; }
  const a = path.pts[lo], b = path.pts[lo + 1], k = (s - c[lo]) / ((c[lo + 1] - c[lo]) || 1);
  out.x = a[0] + (b[0] - a[0]) * k; out.z = a[1] + (b[1] - a[1]) * k; out.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  return out;
}

/** A stroll round a park: `phase` counts laps, so any clock drives it and it needs no state. */
export function parkAt(block, phase, side, out = {}) {
  const p = block.loop, n = p.length;
  if (!block.cum) { block.cum = [0]; for (let i = 0; i < n; i++) { const q = p[(i + 1) % n]; block.cum.push(block.cum[i] + Math.hypot(q[0] - p[i][0], q[1] - p[i][1])); } block.len = block.cum[n]; }
  const s = ((phase % 1) + 1) % 1 * block.len;
  let i = 0; while (i < n - 1 && block.cum[i + 1] <= s) i++;
  const a = p[i], b = p[(i + 1) % n], L = block.cum[i + 1] - block.cum[i], t = (s - block.cum[i]) / L, ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  out.x = a[0] + (b[0] - a[0]) * t - uz * side; out.z = a[1] + (b[1] - a[1]) * t + ux * side; out.yaw = Math.atan2(ux, uz);
  return out;
}
