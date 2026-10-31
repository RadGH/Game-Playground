// A driver for a Rapier car on the rails: looks a little way ahead on its planned lanes and turns the wheel towards
// that point. The soak test uses it so a phone can drive itself for 20 minutes, and the node test uses it to prove a
// real physics car can drive the road from one town to the other, over the bridge. Pure: position in, pedals out.
//
//   const ap = createAutopilot(net, { lane, seed });
//   const { throttle, brake, steer } = ap.drive({ x, z, yaw, speed });

import { pointAt } from './routes.js';

export function createAutopilot(net, { lane = 0, seed = 1, cruise = 15, prefer = null } = {}) {
  let rnd = (seed >>> 0) || 1;
  const rng = () => { rnd = (rnd + 0x6D2B79F5) | 0; let t = Math.imul(rnd ^ (rnd >>> 15), 1 | rnd); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const lanes = net.lanes;
  const self = { lane, s: 0, plan: [] };
  const next = j => {
    const opts = lanes[j].next;
    if (prefer) { const hit = opts.find(o => prefer(lanes[o], lanes[lanes[o].next[0]])); if (hit != null) return hit; }
    return opts[Math.floor(rng() * opts.length)];
  };
  const fill = () => { let last = self.plan.length ? self.plan[self.plan.length - 1] : self.lane; while (self.plan.length < 5) { last = next(last); self.plan.push(last); } };
  fill();
  const p = {};
  function walk(s, out) {
    let L = lanes[self.lane], k = 0;
    while (s > L.len && k < self.plan.length) { s -= L.len; L = lanes[self.plan[k++]]; }
    return pointAt(L, s, out);
  }
  /** Where on the current lane we are: the nearest rail point near the last known place. */
  function track(x, z) {
    let L = lanes[self.lane], best = 1e12, at = self.s;
    for (let i = 0; i < L.n; i++) { const d = (L.x[i] - x) ** 2 + (L.z[i] - z) ** 2; if (d < best) { best = d; at = L.cum[i]; } }
    self.s = at;
    while (self.s > lanes[self.lane].len - 2.5) { self.lane = self.plan.shift(); fill(); L = lanes[self.lane]; self.s = 0; let b2 = 1e12; for (let i = 0; i < L.n; i++) { const d = (L.x[i] - x) ** 2 + (L.z[i] - z) ** 2; if (d < b2) { b2 = d; self.s = L.cum[i]; } } if (L.n < 4) break; }
    return best;
  }
  self.drive = ({ x, z, yaw, speed }) => {
    track(x, z);
    const look = Math.max(6, speed * 0.75);
    walk(self.s + look, p);
    let d = Math.atan2(p.x - x, p.z - z) - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    // how much road ahead bends decides the speed
    let bend = 0;
    const a = {}, b = {}; walk(self.s + 4, a); walk(self.s + 34, b);
    const ang = Math.atan2(b.x - a.x, b.z - a.z) - yaw; bend = Math.abs(Math.atan2(Math.sin(ang), Math.cos(ang)));
    const lim = Math.min(cruise, lanes[self.lane].limit + 1, Math.max(6, cruise * (1 - bend * 0.9)));
    const err = lim - speed;
    return { throttle: err > 0 ? Math.min(1, err * 0.4 + 0.15) : 0, brake: err < -1.5 ? Math.min(1, -err * 0.2) : 0, steer: Math.max(-1, Math.min(1, -d * 2.2)), target: p };
  };
  return self;
}
