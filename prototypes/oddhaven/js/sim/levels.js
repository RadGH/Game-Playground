// Detail levels. L0 = near the camera or in the party, L1 = close, L2 = everyone else. A person's level is just a number
// on their record: changing it moves nothing, because position is worked out from the trip they are already on. People
// are ranked by distance from what the camera is centred on (roast risk 3), nearest first, up to the caps.

import { workerAt } from './work.js';

const AT_WORK = new Set(['site_work', 'fire_work']);

export function positionOf(c, p) {
  if (p.act?.a === 'carried') return positionOf(c, c.s.people[p.act.by]);
  if (AT_WORK.has(p.act?.a) && p.wpos) { const q = workerAt(c, p); return { x: q.x, z: q.z, heading: q.h }; }
  if (p.at >= 0) { const pl = c.places[p.at]; return { x: pl.x, z: pl.z, heading: 0 }; }
  const trip = p.trip;
  if (trip?.mode === 'aboard') { const r = c.s.live.find(q => q.id === trip.id); return r ? { x: r.x, z: r.z, heading: r.yaw } : { x: c.places[p.home].x, z: c.places[p.home].z, heading: 0 }; }
  if (p.hold) return { x: p.hold.x, z: p.hold.z, heading: p.hold.h };
  if (!trip) { const pl = c.places[p.home]; return { x: pl.x, z: pl.z, heading: 0 }; }
  if (trip.mode === 'walk') {
    const r = c.roads.byId(trip.route);
    return c.roads.at(r, r.length * Math.min(1, (c.s.t - trip.start) / Math.max(1, trip.end - trip.start)));
  }
  const car = c.s.trips.find(x => x.id === trip.id);
  return c.roads.at(c.roads.byId(car.route), car.s);
}

export function updateLevels(c) {
  const s = c.s, k = c.k.levels, focus = s.focus, ppl = s.people;
  if (!focus.points.length && !focus.party.length) {
    for (const p of ppl) p.lv = p.hold ? 0 : 2;
    return;
  }
  const near = [];
  const party = new Set(focus.party);
  for (const p of ppl) {
    if (party.has(p.id) || p.hold) { p.lv = 0; continue; }
    const pos = positionOf(c, p);
    let d = Infinity;
    for (const f of focus.points) d = Math.min(d, Math.hypot(pos.x - f.x, pos.z - f.z));
    if (d <= k.l1Radius) near.push({ p, d }); else p.lv = 2;
  }
  near.sort((a, b) => a.d - b.d || a.p.id - b.p.id);
  let l0 = party.size, l1 = 0;
  for (const { p, d } of near) {
    if (d <= k.l0Radius && l0 < k.l0Cap) { p.lv = 0; l0++; }
    else if (l1 < k.l1Cap) { p.lv = 1; l1++; }
    else p.lv = 2;
  }
}
