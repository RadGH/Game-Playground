// Traffic demand. Every drive is a trip: { id, car, driver, route, s, v, e, state, stuck, ghost }. The sim stores metres
// along a route and never a position; the client puts the car on the rail at route.at(s).
//
// Cars keep a gap to whatever is ahead on the same directed road, junctions pass one car at a time, and the reset rule
// (Satisfactory's trucks) catches everything else: a car that is flipped, or has not moved for resetSeconds, fades out,
// reappears further along past whatever stopped it, keeps progressing, and a tow gnome sends an invoice.
// Because a blocked car always ends up past the blocker, no jam can last: gridlock has nowhere to live.

import { log, say } from './log.js';
import { charge } from './economy.js';
import { addMoodlet } from './needs.js';
import { carArrived } from './people.js';
import { rideEnded } from './control.js';

export function startDrive(c, p, a, b, from, to, carId) {
  const s = c.s, route = c.roads.route(a.node, b.node);
  const trip = { id: s.nextTrip++, car: carId, driver: p.id, route: route.id, to, s: 0, v: 0, e: 0, state: 'rail', stuck: 0, ghost: 0, token: -1 };
  s.trips.push(trip);
  p.trip = { mode: 'drive', id: trip.id, from, to };
}

/** Everyone a player runs who is standing or driving in a lane, by directed road: rail cars treat them like a car in front. */
function blockersByKey(c) {
  const s = c.s, map = new Map();
  const put = (key, at, len) => { let l = map.get(key); if (!l) map.set(key, l = []); l.push({ at, len }); };
  for (const row of s.live) if (row.key >= 0) put(row.key, row.at, row.len);
  for (const id of s.held) { const h = s.people[id].hold; if (h && h.car < 0 && h.key >= 0) put(h.key, h.at, c.k.control.personMeters); }
  return map;
}

function finish(c, trip) {
  const s = c.s, p = s.people[trip.driver];
  if (trip.car >= 0) s.cars[trip.car].at = trip.to;
  trip.done = true;
  s.stats.trips++;
  carArrived(c, p);
  for (const id of trip.riders || []) { const r = s.people[id]; if (r.hold) rideEnded(c, r, trip); else carArrived(c, r); }
}

/** Where the next thing that would stop a car is, along its route: { s, end } of the first obstacle ahead, or null. */
function obstacleAhead(c, trip, r, limit) {
  let best = null;
  for (const o of c.s.obstacles) {
    for (let i = trip.e; i < r.steps.length; i++) {
      const st = r.steps[i];
      if ((st.key >> 1) !== o.edgeIndex) continue;
      const fwd = st.key & 1;
      const along = st.start + (fwd ? o.pos : st.len - o.pos);
      if (along + o.len / 2 < trip.s || along - trip.s > limit) continue;
      if (!best || along < best.s) best = { s: along, end: along + o.len / 2 };
    }
  }
  if (c.s.live.length || c.s.held.length) {
    const blockers = blockersByKey(c);
    for (let i = trip.e; i < r.steps.length; i++) for (const o of blockers.get(r.steps[i].key) || []) {
      const along = r.steps[i].start + o.at;
      if (along + o.len / 2 < trip.s || along - trip.s > limit) continue;
      if (!best || along < best.s) best = { s: along, end: along + o.len / 2 };
    }
  }
  return best;
}

/** The reset rule. */
function resetCar(c, trip, reason) {
  const k = c.k.traffic, r = c.roads.byId(trip.route);
  const ob = obstacleAhead(c, trip, r, k.resetLookaheadMeters);
  const next = ob ? ob.end + k.clearMeters : trip.s + k.resetJumpMeters;
  trip.s = next;
  trip.v = 0;
  trip.stuck = 0;
  trip.state = 'rail';
  trip.token = -1;
  trip.ghost = c.s.t + c.clock.seconds(k.ghostSeconds);
  while (trip.e < r.steps.length - 1 && trip.s >= r.steps[trip.e].start + r.steps[trip.e].len) trip.e++;
  c.s.stats.resets++;
  say(c, 'car.reset', { trip: trip.id, reason, s: Math.min(next, r.length) });
  if (trip.car >= 0 && !c.s.cars[trip.car].engine) {
    const h = c.s.households[c.s.cars[trip.car].household], amount = k.invoice[reason];
    charge(c, h, amount, 'tow');
    log(c, 'tow', { who: trip.driver, household: h.id, reason, amount, trip: trip.id, route: trip.route });
    addMoodlet(c, c.s.people[trip.driver], 'towed', -0.05, 4);
  }
  if (trip.s >= r.length) finish(c, trip);
}

export function stepTraffic(c) {
  const s = c.s, trips = s.trips;
  if (!trips.length) return;
  const k = c.k.traffic, t = s.t, dt = 1 / c.clock.tps, resetAt = c.clock.seconds(k.resetSeconds);
  const groups = new Map();
  for (const trip of trips) {
    const r = c.roads.byId(trip.route);
    if (r.steps.length === 0) { finish(c, trip); continue; }
    const st = r.steps[trip.e];
    trip._p = trip.s - st.start;
    trip._r = r;
    let g = groups.get(st.key);
    if (!g) groups.set(st.key, g = []);
    g.push(trip);
  }
  // The rearmost car on each road, for the car waiting to turn onto it.
  const tail = new Map();
  for (const [key, list] of groups) {
    list.sort((a, b) => b._p - a._p || a.id - b.id);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].ghost <= t) { tail.set(key, list[i]._p); break; }
  }
  // a siren on this road: everyone ahead of it pulls over and slows, and the junctions wave it through
  const sirens = new Map(), noise = c.k.fire, pulledOver = noise.yieldSpeed;
  for (const trip of trips) if (trip.siren && trip._p !== undefined) { const key = trip._r.steps[trip.e].key, l = sirens.get(key); if (l) l.push(trip._p); else sirens.set(key, [trip._p]); }
  for (const row of s.live) if (row.siren && row.key >= 0) { const l = sirens.get(row.key); if (l) l.push(row.at); else sirens.set(row.key, [row.at]); }
  const obs = c.obstaclesByKey(s.obstacles), blockers = s.live.length || s.held.length ? blockersByKey(c) : null;
  for (const [key, list] of groups) {
    let ahead = -1;
    for (const trip of list) {
      const r = trip._r, st = r.steps[trip.e], pos = trip._p;
      if (trip.state === 'flipped') {
        trip.v = 0;
        ahead = pos;
        if (++trip.stuck >= resetAt) resetCar(c, trip, 'flipped');
        continue;
      }
      let gap = Infinity;
      const heard = !trip.siren && sirens.get(key)?.some(a => a < pos && pos - a < noise.sirenMeters);
      if (heard) { if (!trip.yield) s.stats.yielded = (s.stats.yielded || 0) + 1; trip.yield = 1; } else if (trip.yield) trip.yield = 0;
      if (trip.ghost <= t) {
        if (ahead >= 0 && !trip.siren) gap = ahead - pos - k.carLength;
        for (const o of obs.get(key) || []) {
          const front = o.at - o.len / 2;
          if (front >= pos - k.carLength) gap = Math.min(gap, front - pos);
        }
        // a player's car or a player on foot: the same rule, and the follower's own speed keeps the gap as they move off
        for (const o of blockers?.get(key) || []) {
          const front = o.at - o.len / 2;
          if (front >= pos - k.carLength) gap = Math.min(gap, front - pos);
        }
        const toEnd = st.len - pos, nextStep = r.steps[trip.e + 1];
        if (nextStep && toEnd < k.junctionLookahead) {
          if (st.junction && trip.token !== st.endNode) {
            const free = s.junctions[st.endNode] ?? 0;
            if (trip.siren) { s.junctions[st.endNode] = t + c.clock.seconds(k.junctionHeadwaySeconds); trip.token = st.endNode; }
            else if (t >= free && toEnd <= k.junctionGrantMeters + trip.v * k.junctionGrantSeconds) { s.junctions[st.endNode] = t + c.clock.seconds(k.junctionHeadwaySeconds); trip.token = st.endNode; }
            else gap = Math.min(gap, toEnd + k.minGap);
          }
          const room = tail.get(nextStep.key);
          if (room !== undefined && !trip.siren) gap = Math.min(gap, toEnd + room - k.carLength);
          for (const o of obs.get(nextStep.key) || []) gap = Math.min(gap, toEnd + o.at - o.len / 2);
          for (const o of blockers?.get(nextStep.key) || []) gap = Math.min(gap, toEnd + o.at - o.len / 2);
        }
      }
      const top = trip.siren ? st.speed * noise.sirenBoost : trip.yield ? Math.min(st.speed, pulledOver) : st.speed;
      const want = trip.halt !== undefined ? 0 : Math.min(top, Math.max(0, (gap - k.minGap) / k.headwaySeconds));
      // a passenger asked to get out: it brakes harder than it pulls away, and lets them out when it has all but stopped
      trip.v = trip.halt !== undefined ? Math.max(0, trip.v - k.acceleration * 2 * dt) : Math.min(trip.v + k.acceleration * dt, want);
      if (trip.yield) trip.stuck = 0;
      trip.s += trip.v * dt;
      if (trip.halt !== undefined && trip.v < c.k.control.rideOutSpeed) rideEnded(c, s.people[trip.halt], trip);
      if (trip.ghost <= t) ahead = pos;
      if (trip.v < k.blockedSpeed) {
        if (++trip.stuck >= resetAt) { resetCar(c, trip, 'blocked'); continue; }
      } else trip.stuck = 0;
      while (trip.e < r.steps.length - 1 && trip.s >= r.steps[trip.e].start + r.steps[trip.e].len) { trip.e++; trip.token = -1; }
      if (trip.s >= r.length) finish(c, trip);
    }
  }
  for (const trip of trips) { delete trip._p; delete trip._r; }
  if (trips.some(x => x.done)) s.trips = trips.filter(x => !x.done);
}

export function flipCar(c, tripId) {
  const trip = c.s.trips.find(x => x.id === tripId);
  if (!trip) return false;
  trip.state = 'flipped';
  trip.stuck = 0;
  return true;
}

/** The client righted it before the timer ran out: it carries on from where it was. */
export function clearCar(c, tripId) {
  const trip = c.s.trips.find(x => x.id === tripId);
  if (!trip || trip.state !== 'flipped') return false;
  trip.state = 'rail';
  trip.stuck = 0;
  return true;
}

export function buildObstacleIndex(c) {
  const memo = { list: null, map: new Map() };
  return list => {
    if (memo.list === list) return memo.map;
    const map = new Map();
    for (const o of list) {
      const e = c.roads.edges[o.edgeIndex];
      for (const fwd of o.dir === 0 ? [1, 0] : [o.dir > 0 ? 1 : 0]) {
        const key = o.edgeIndex * 2 + fwd;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ at: fwd ? o.pos : e.len - o.pos, len: o.len });
      }
    }
    memo.list = list; memo.map = map;
    return map;
  };
}
