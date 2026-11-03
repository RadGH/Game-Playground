// The sim's own health check: what must hold at every moment of every run, at every detail level. Pure; the node tests
// and the Worker's `health` message both run this one list, so a browser run is judged by the same rules as a node run.

import { NEVER } from './people.js';
import { chainProblems } from './work.js';
import { fireProblems } from './fire.js';
import { socialProblems } from './threads.js';
import { lawProblems } from './law.js';
import { riftProblems } from './rifts.js';

const sum = list => list.reduce((a, b) => a + b, 0);

/** Everything that must hold at every moment of every run, at every detail level. Returns a list of what is wrong. */
export function problems(sim) {
  const c = sim.context, s = sim.state, bad = [], t = s.t;
  const fail = text => { if (bad.length < 12) bad.push(text); };
  const seat = new Map();
  s.slots.forEach((slots, place) => {
    for (const [slot, users] of Object.entries(slots)) {
      if (users.length > (c.places[place].caps[slot] ?? 0)) fail(`place ${place} slot ${slot} over capacity: ${users.length}`);
      for (const id of users) {
        if (seat.has(id)) fail(`person ${id} is in two slots`);
        seat.set(id, { place, slot });
      }
    }
  });
  // nobody stands in anybody: every spot belongs to one person, and the sim's record of it agrees with their act
  const spots = new Map();
  for (const p of s.people) {
    const a = p.act;
    if (!a || a.spot === null || a.spot === undefined || a.spot === -1) continue;
    const k = `${a.place}/${a.spot}`;
    if (spots.has(k)) fail(`people ${spots.get(k)} and ${p.id} share spot ${k}`);
    spots.set(k, p.id);
    if (c.occ[a.place].get(a.spot) !== p.id) fail(`person ${p.id}: spot ${k} is held by ${c.occ[a.place].get(a.spot)}`);
  }
  for (let i = 0; i < c.occ.length; i++) if (c.occ[i].size !== [...c.occ[i].values()].filter(id => s.people[id].act?.place === i).length) fail(`place ${i} holds a spot for someone who has left`);
  const onTrip = new Map();
  for (const tr of s.trips) {
    if (onTrip.has(tr.driver)) fail(`person ${tr.driver} is driving two cars`);
    onTrip.set(tr.driver, tr);
    if (s.people[tr.driver].trip?.id !== tr.id) fail(`trip ${tr.id} has lost its driver`);
    if (!Number.isFinite(tr.s) || !Number.isFinite(tr.v)) fail(`trip ${tr.id} has a bad number`);
    if (!c.roads.byId(tr.route)) fail(`trip ${tr.id} is on a route that does not exist`);
  }
  for (const p of s.people) {
    if ((p.at >= 0) === !!p.trip) fail(`person ${p.id}: at ${p.at} and trip ${JSON.stringify(p.trip)} disagree`);
    if (p.act && p.at < 0) fail(`person ${p.id} is acting while travelling`);
    if (p.trip?.mode === 'drive' && !onTrip.has(p.id)) fail(`person ${p.id} thinks they are driving but no car has them`);
    if (!p.trip && p.wake === NEVER) fail(`person ${p.id} will never wake`);
    if (p.wake < t - 1) fail(`person ${p.id} was due at ${p.wake}, now ${t}`);
    const sat = seat.get(p.id);
    if (p.act?.slot) { if (sat?.place !== p.act.place || sat?.slot !== p.act.slot) fail(`person ${p.id} acts in a slot they do not hold`); }
    else if (sat) fail(`person ${p.id} holds a slot with nothing to do in it`);
    if (p.orders.length > c.k.orders.max) fail(`person ${p.id} has ${p.orders.length} orders`);
    if (Object.keys(p.f).length > c.k.feelings.cap) fail(`person ${p.id} remembers too many people`);
    if (p.moodlets.length > c.k.mood.moodletCap) fail(`person ${p.id} has too many moodlets`);
    for (const v of [...p.n, p.mood]) if (!(v >= 0 && v <= 1)) fail(`person ${p.id} has a need or mood of ${v}`);
  }
  const carTrips = new Map(s.trips.filter(x => x.car >= 0).map(x => [x.car, x]));
  for (const row of s.live) if (row.car >= 0) carTrips.set(row.car, row);
  const liveIds = new Set(s.live.map(r => r.id)), held = new Set(s.held);
  for (const tr of s.trips) for (const id of tr.riders || []) if (s.people[id].hold?.ride !== tr.id && (s.people[id].trip?.id !== tr.id || s.people[id].trip?.mode !== 'ride')) fail(`rider ${id} is not in car ${tr.id}`);
  for (const p of s.people) {
    if (!!p.hold !== (p.trip?.mode === 'held') || !!p.hold !== held.has(p.id)) fail(`person ${p.id}: a player hold and their trip disagree`);
    if (p.hold && p.hold.car >= 0 && !liveIds.has(p.hold.car)) fail(`person ${p.id} sits in car ${p.hold.car}, which is gone`);
    if (p.trip?.mode === 'ride' && !s.trips.some(tr => tr.id === p.trip.id)) fail(`person ${p.id} rides in a car that has gone`);
  }
  for (const row of s.live) {
    if (row.driver >= 0 && s.people[row.driver].hold?.car !== row.id) fail(`live car ${row.id} has lost its driver`);
    const inside = s.held.filter(id => s.people[id].hold.car === row.id);
    if (inside.length > row.seats) fail(`live car ${row.id} holds ${inside.length} in ${row.seats} seats`);
    if (new Set(inside.map(id => s.people[id].hold.seat)).size !== inside.length) fail(`two people in one seat of live car ${row.id}`);
  }
  for (const car of s.cars) {
    if ((car.at >= 0) === carTrips.has(car.id)) fail(`car ${car.id}: parked at ${car.at}, on a trip ${carTrips.has(car.id)}`);
  }
  for (const h of s.households) {
    if (h.money < 0) fail(`household ${h.id} is in debt: ${h.money}`);
    if (!Number.isInteger(h.money)) fail(`household ${h.id} has fractional money`);
    if (h.start + sum(Object.values(h.ledger)) !== h.money) fail(`household ${h.id}: the books do not add up`);
  }
  chainProblems(c, fail);
  socialProblems(c, fail);
  fireProblems(c, fail);
  lawProblems(c, fail);
  riftProblems(c, fail);
  if (s.people.length !== c.k.population.people + (s.made ?? 0)) fail('the population changed');
  return bad;
}

/** Watches for anyone who has stopped living: call hourly. */
export function createStuckWatch(sim, { maxSameHours = 20, maxZeroHours = 30 } = {}) {
  const c = sim.context, zero = new Map(), found = [];
  return {
    found,
    check() {
      const s = sim.state, t = s.t;
      for (const p of s.people) {
        if (p.hold) { zero.delete(p.id); continue; }   // somebody is playing them: they are not stuck, they are busy
        const hours = c.clock.hours(t - p.since);
        if (hours > maxSameHours) found.push(`person ${p.id} stuck ${hours.toFixed(1)}h on ${p.act?.a ?? JSON.stringify(p.trip)}`);
        const empty = sim.needsOf(p.id).findIndex(v => v === 0);
        if (empty < 0) zero.delete(p.id);
        else if (!zero.has(p.id)) zero.set(p.id, t);
        else if (c.clock.hours(t - zero.get(p.id)) > maxZeroHours) found.push(`person ${p.id} has had an empty ${c.needIds[empty]} for over ${maxZeroHours}h`);
      }
    },
  };
}
