// The join between the two traffic pictures (PLAN §2 "Traffic"). The sim thinks in metres along a route of whole roads,
// node to node; the picture thinks in lanes, which are cut back from each junction and joined by short links. A rail is
// one route laid onto those lanes, so a sim trip { route, s } turns into a point on the road with no traffic rules here at
// all: the sim alone decides who moves, who waits and who is reset after 20 s. Pure, no three, no clock.
//
//   const rails = createRails(net);
//   const r = rails.of(routeId, route);     // route = { length, steps: [{ edge, fwd, start, len }] }; built once
//   railPose(r, routeMetres, carLength, out)  // { x, y, z, yaw, pitch }: read off the rail under the two axles

import { pointAt } from './routes.js';

/** route metres -> metres along the chain of lanes, a straight line between step ends so a car never jumps. */
function toRail(r, s) {
  const k = r.knots;
  if (s <= k[0][0]) return k[0][1] + (s - k[0][0]);
  for (let i = 1; i < k.length; i++) if (s <= k[i][0]) { const [a, ra] = k[i - 1], [b, rb] = k[i]; return ra + (s - a) / ((b - a) || 1) * (rb - ra); }
  const [a, ra] = k[k.length - 1];
  return ra + (s - a);
}
function chainPoint(r, m, out) {
  const c = r.chain;
  if (m <= 0) return pointAt(c[0].lane, m, out);
  let lo = 0, hi = c.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid].at <= m) lo = mid; else hi = mid - 1; }
  return pointAt(c[lo].lane, m - c[lo].at, out);
}

export function buildRail(net, route) {
  const chain = [], knots = [[0, 0]];
  let at = 0;
  const push = lane => { chain.push({ lane, at }); at += lane.len; };
  route.steps.forEach((st, i) => {
    const lane = net.byId.get(`${st.edge}:${st.fwd ? 'f' : 'b'}`);
    if (!lane) throw new Error(`rail: no lane for road ${st.edge}`);
    push(lane);
    const next = route.steps[i + 1];
    if (!next) return;
    const id = `${lane.id}>${next.edge}:${next.fwd ? 'f' : 'b'}`, link = net.byId.get(id);
    if (!link) throw new Error(`rail: no link ${id}`);
    knots.push([st.start + st.len, at + link.len / 2]);   // the road's end is the middle of the junction
    push(link);
  });
  knots.push([route.length, at]);
  return { chain, knots, length: at, routeLength: route.length };
}

export function createRails(net) {
  const cache = new Map();
  return { of(id, route) { let r = cache.get(id); if (!r) cache.set(id, r = buildRail(net, route)); return r; }, get size() { return cache.size; } };
}

const pa = {}, pb = {};
/** Where a car is at `s` metres along the route. */
export function railPose(r, s, carLen, out = {}) {
  const m = toRail(r, s), half = carLen * 0.3;
  chainPoint(r, m + half, pa); chainPoint(r, Math.max(0, m - half), pb);
  out.x = (pa.x + pb.x) / 2; out.y = (pa.y + pb.y) / 2; out.z = (pa.z + pb.z) / 2;
  const dx = pa.x - pb.x, dz = pa.z - pb.z, flat = Math.sqrt(dx * dx + dz * dz) || 1;
  out.yaw = Math.atan2(dx, dz); out.pitch = Math.atan2(pb.y - pa.y, flat);
  return out;
}
export const railMetres = toRail;
