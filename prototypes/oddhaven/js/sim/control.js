// Taking control (PLAN §1 "Hands-on", rule 2: free, unlimited, no cooldown). A person a player runs is `held`: they keep
// their record, their needs keep falling, but the sim stops deciding for them until they are released.
//
//   p.trip = { mode:'held' }, p.at = -1, p.wake = NEVER, and
//   p.hold = { owner, kind:'you'|'party', x, z, h, car, seat, to, goal, since, walked, drove, near, key, at }
//   s.held = [person ids]      s.live = [{ id, car, model, seats, driver, owner, x, z, yaw, v, key, at, len }]
//
// The player's browser runs the body and the car (PLAN §2 "Co-op") and reports where they are with `pos`; everything else
// is the sim's. A live car is off the rails: `car` is the household's car (-1 for a taxi or the free test car). Commands
// are plain data, so a room runs exactly this. Release is where the sim takes over again, from wherever they actually are.

import { log, say } from './log.js';
import { NEVER, finishAct, nextShift, buildSchedule } from './people.js';
import { charge, setBill } from './economy.js';
import { openingFor } from './phone.js';
import { settle } from './needs.js';
import { spotInWorld } from './spots.js';
import { pauseForTake, shiftSwitch, backToWork, clockOut, addTruck } from './work.js';
import { fireTaken, workerSpot, callSwitch, backToFire, engineTaken, engineBack } from './fire.js';
import { lawTaken, backToBeat, dutyRelease } from './law.js';
import { fightTaken, backToFight } from './rifts.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function nearestPlace(c, x, z, test = null) {
  let best = null, d = Infinity;
  for (const pl of c.places) { if (test && !test(pl)) continue; const e = dist(pl.x, pl.z, x, z); if (e < d) { d = e; best = pl; } }
  return { place: best, d };
}
function nearestNode(c, x, z) {
  let best = null, d = Infinity;
  for (const n of c.roads.nodes) { const e = dist(n.x, n.z, x, z); if (e < d) { d = e; best = n; } }
  return best;
}
/** Nearest stretch of road to a point, and which way along it a car with this heading is going. */
function nearestRoad(c, x, z, yaw) {
  let best = null, d = Infinity;
  for (const e of c.roads.edges) {
    let run = 0;
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, L = Math.sqrt(L2);
      const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), q = dist(ax + dx * f, az + dz * f, x, z);
      if (q < d) { d = q; best = { e, pos: run + L * f, fwd: Math.sin(yaw) * dx + Math.cos(yaw) * dz >= 0 }; }
      run += L;
    }
  }
  return best;
}

function addLive(c, row) {
  const s = c.s, r = { id: s.nextLive++, x: 0, z: 0, yaw: 0, v: 0, key: -1, at: 0, len: c.k.traffic.carLength, driver: -1, car: -1, ...row };
  s.live.push(r);
  return r;
}
const seatsOf = (c, model) => c.carSeats[model] ?? 2;
const inCar = (c, id) => c.s.held.filter(p => c.s.people[p].hold.car === id).map(p => c.s.people[p]);
const ownedBy = (c, owner) => c.s.held.filter(p => c.s.people[p].hold.owner === owner).map(p => c.s.people[p]);

/** Stop what they were doing and hand them to a player. Works from every state: at a place, walking, driving, riding. */
function take(c, cmd, refuse) {
  const s = c.s, p = s.people[cmd.who], t = s.t, owner = cmd.owner ?? 'solo', kind = cmd.as === 'party' ? 'party' : 'you';
  if (!p) return refuse('no such person');
  if (p.hold) {
    if (p.hold.owner !== owner) return refuse('somebody else is playing them');
    p.hold.kind = kind;
    say(c, 'took.done', { who: p.id, owner, as: kind, x: p.hold.x, z: p.hold.z, h: p.hold.h, again: true });
    return;
  }
  settle(c, p);
  shiftSwitch(c, p, false);
  const onSite = p.act?.a === 'site_work' ? pauseForTake(c, p) : null;     // a worker stays where they are, with what they have in their arms
  const onFire = p.act?.a === 'fire_work' || p.act?.a === 'police_work' || p.act?.a === 'fight_work' ? workerSpot(c, p) : null, carrier = p.act?.a === 'carried' ? c.s.people[p.act.by] : null, cab = p.trip?.mode === 'aboard' ? s.live.find(r => r.id === p.trip.id) : null, up = p.wlv ?? 0;
  fireTaken(c, p);
  lawTaken(c, p);
  fightTaken(c, p);
  let pos = null, to = -1, drive = null, inside = -1, ride = null;
  // indoors they stay where they are: in the room, on their floor, not on the doorstep
  const room = p.act ? spotInWorld(c.places[p.act.place], p.act.spot) : null;
  if (room) inside = p.act.place;
  if (p.act) finishAct(c, p);
  if (onSite) pos = onSite;
  else if (onFire) pos = { x: onFire[0], z: onFire[1], h: 0, lv: up };
  else if (carrier) { const q = carrier.hold ?? { x: carrier.wpos?.[0] ?? 0, z: carrier.wpos?.[1] ?? 0 }; pos = { x: q.x, z: q.z, h: 0 }; }
  else if (cab) { pos = { x: cab.x, z: cab.z, h: cab.yaw }; }
  else if (room) pos = room;
  else if (p.at >= 0) { const pl = c.places[p.at]; pos = { x: pl.x, z: pl.z, h: 0 }; } else if (p.trip?.mode === 'walk') {
    const r = c.roads.byId(p.trip.route), q = c.roads.at(r, r.length * Math.min(1, (t - p.trip.start) / Math.max(1, p.trip.end - p.trip.start)));
    pos = { x: q.x, z: q.z, h: q.heading };
    to = p.trip.to;
  } else if (p.trip) {
    const tr = s.trips.find(x => x.id === p.trip.id), r = c.roads.byId(tr.route), q = c.roads.at(r, tr.s);
    pos = { x: q.x, z: q.z, h: q.heading };
    to = tr.to;
    if (p.trip.mode === 'ride') {
      if (kind === 'you') ride = tr;      // they stay in their seat: the player asks the driver to pull over (rideOut)
      else tr.riders = tr.riders.filter(id => id !== p.id);   // pulled into a party: they catch up on foot
    } else drive = tr;
  } else pos = { x: c.places[p.home].x, z: c.places[p.home].z, h: 0 };
  const x = cmd.x ?? pos.x, z = cmd.z ?? pos.z, h = cmd.h ?? pos.h, lv = cmd.lv ?? pos.lv ?? 0;
  const goal = p.goal; p.goal = null;
  p.at = -1; p.since = t; p.wake = NEVER; p.lv = 0;
  p.trip = { mode: 'held', id: -1, to };
  p.hold = { owner, kind, x, z, h, car: -1, seat: 0, to, goal, since: t, walked: 0, drove: 0, near: -1, key: -1, at: 0, lv, inside, ride: ride ? ride.id : -1 };
  s.held.push(p.id);
  const ev = { who: p.id, owner, as: kind, x, z, h, lv, ride: ride ? ride.id : -1 };
  if (drive) {
    const model = drive.car >= 0 ? s.cars[drive.car].model : c.d.people.taxiModel;
    const row = addLive(c, { car: drive.car, model, seats: seatsOf(c, model), driver: p.id, owner, x, z, yaw: h, v: drive.v });
    p.hold.car = row.id;
    ev.live = { id: row.id, trip: drive.id, model, route: drive.route, s: drive.s, v: drive.v, car: drive.car };
    s.trips = s.trips.filter(tr => tr !== drive);
    engineTaken(c, drive, row);
    drive.riders?.forEach((id, i) => {
      const r = s.people[id];
      r.at = -1; r.since = t; r.wake = NEVER; r.goal = null;
      r.trip = { mode: 'held', id: -1, to: -1 };
      r.hold = { owner, kind: 'party', x, z, h, car: row.id, seat: i + 1, to: -1, goal: null, since: t, walked: 0, drove: 0, near: -1, key: -1, at: 0, lv: 0, inside: -1, ride: -1 };
      s.held.push(id);
    });
  }
  log(c, 'took', { who: p.id, as: kind });
  say(c, 'took.done', ev);
}

/** Where a driver goes when they are handed back: where they were going, else a shift that is due, else home. */
function nextStop(c, p) {
  const h = p.hold;
  if (h.to >= 0) return h.to;
  if (p.call) { const C = c.s.fire.calls.find(x => x.id === p.call.id); if (C) return c.s.fire.fires.find(f => f.id === C.fire)?.place ?? p.home; }
  if (p.beat) { const C = c.s.law.calls.find(x => x.id === p.beat.id); if (C) return C.place; }
  const shift = nextShift(c, p);
  return shift && c.s.t >= shift.leave - c.clock.ticks(c.k.schedule.earlyMinutes) ? p.work : p.home;
}

/** The live car goes back on a rail: one trip, carrying on down the road it is on. */
function carBack(c, row) {
  const s = c.s, driver = s.people[row.driver], to = nextStop(c, driver), dest = c.places[to].node;
  const k = row.key >= 0 ? { e: c.roads.edges[row.key >> 1], fwd: !!(row.key & 1), pos: row.at } : nearestRoad(c, row.x, row.z, row.yaw);
  const route = c.roads.routeAlong(k.e.id, k.fwd, dest);
  const fade = row.key < 0;
  const trip = { id: s.nextTrip++, car: row.car, driver: driver.id, route: route.id, to, s: Math.max(0, Math.min(k.e.len - 0.5, k.pos)), v: Math.max(0, row.v), e: 0, state: 'rail', stuck: 0, ghost: fade ? s.t + c.clock.seconds(c.k.traffic.ghostSeconds) : 0, token: -1 };
  const all = inCar(c, row.id).filter(p => p !== driver), inside = all.filter(p => p.hold.owner === row.owner);
  for (const p of all) if (p.hold.owner !== row.owner) outOfCar(c, p, row);     // another player's body in the back: the car is leaving, they get out where it is
  if (inside.length) trip.riders = inside.map(p => p.id);
  s.trips.push(trip);
  engineBack(c, row, trip);
  say(c, 'car.back', { live: row.id, trip: trip.id, route: route.id, s: trip.s, v: trip.v, fade });
  return { trip, inside };
}

/** A car left at the kerb when its people are handed back goes home on the back of the tow gnome's truck. */
function carFetched(c, row) {
  const s = c.s;
  if (row.car >= 0) {
    const car = s.cars[row.car], h = s.households[car.household];
    car.at = car.base ?? h.home;
    if (!car.engine && !car.van && !row.comp) charge(c, h, c.k.control.carFetchInvoice, 'tow');       // `comp`: brought out by a guest who may not spend this household's money
    if (!car.engine && !car.van && !row.comp) log(c, 'fetched', { who: ownedBy(c, row.owner).find(p => p.hold.kind === 'you')?.id ?? car.driver, household: h.id, amount: c.k.control.carFetchInvoice });
  }
  say(c, 'car.gone', { live: row.id });
}

/** Out of a car that is going away. Someone else's browser runs this body, so it has to be told. */
function outOfCar(c, p, row) {
  p.hold.car = -1; p.hold.seat = 0;
  say(c, 'car.left', { who: p.id, owner: p.hold.owner, live: row.id, x: row.x, z: row.z, yaw: row.yaw });
}

function letGo(c, p) {
  const s = c.s, h = p.hold, t = s.t;
  settle(c, p);
  const recap = recapOf(c, p.id, h.since);
  log(c, 'handed', { who: p.id, walked: Math.round(h.walked), drove: Math.round(h.drove) });
  say(c, 'recap', { who: p.id, owner: h.owner, since: h.since, walked: Math.round(h.walked), drove: Math.round(h.drove), rows: recap });
  s.held = s.held.filter(id => id !== p.id);
  shiftSwitch(c, p, true);
  callSwitch(c, p, true);
  dutyRelease(c, p);
  p.since = t;
  return h;
}

/** On foot: from where they actually are. Near a door they are there, and think again; otherwise they walk back to the map. */
function releaseOnFoot(c, p) {
  const h = letGo(c, p), t = c.s.t, tr = c.k.travel, near = nearestPlace(c, h.x, h.z);
  delete p.hold;
  p.goal = h.goal;
  if (backToWork(c, p, h)) { p.goal = null; return; }     // on the site in shift time: straight back to it, from where they stand
  if (backToFire(c, p, h)) { p.goal = null; return; }     // the same on a fire
  if (backToBeat(c, p, h) || backToFight(c, p, h)) { p.goal = null; return; }      // and on a call, and at a rift
  // still riding: back to being a passenger, and the car carries them on to wherever it was going
  if (h.ride >= 0) {
    const tr = c.s.trips.find(x => x.id === h.ride);
    if (tr) { delete tr.halt; p.goal = null; p.trip = { mode: 'ride', id: tr.id, to: tr.to }; p.at = -1; p.wake = NEVER; return; }
  }
  // indoors: they are in that room, whatever the door is doing
  if (h.inside >= 0) { p.trip = null; p.at = h.inside; p.wake = t; return; }
  if (near.d <= c.k.control.doorMeters) { p.trip = null; p.at = near.place.id; p.wake = t; return; }
  // Walking on to where they were going if that is a walk, else the nearest door, and work it out from there.
  const going = h.to >= 0 ? c.places[h.to] : null, target = going && dist(going.x, going.z, h.x, h.z) <= tr.walkMaxMeters ? going : near.place;
  const start = nearestNode(c, h.x, h.z), metres = c.roads.distance(start.id, target.node) + dist(start.x, start.z, h.x, h.z);
  const end = t + Math.max(1, Math.round(metres / tr.walkSpeed * c.clock.tps));
  p.trip = { mode: 'walk', route: `${start.id}>${target.node}`, from: target.id, to: target.id, start: t, end, ox: h.x, oz: h.z };
  p.at = -1;
  p.wake = end;
}

/** A player riding as a passenger wants out: the driver pulls up, they step out at the kerb, and the car drives on. */
function rideOut(c, cmd, refuse) {
  const p = c.s.people[cmd.who], owner = cmd.owner ?? 'solo';
  if (!p?.hold || p.hold.owner !== owner || p.hold.ride < 0) return refuse('not riding');
  const tr = c.s.trips.find(x => x.id === p.hold.ride);
  if (!tr) { rideEnded(c, p); return; }
  tr.halt = cmd.who;
  say(c, 'ride.stopping', { who: p.id, owner, trip: tr.id });
}
/** The car has stopped for them, or has arrived. */
export function rideEnded(c, p, tr = null) {
  const id = p.hold.ride;
  p.hold.ride = -1;
  const row = tr ?? c.s.trips.find(x => x.id === id);
  if (row) { row.riders = (row.riders || []).filter(q => q !== p.id); delete row.halt; }
  say(c, 'ride.out', { who: p.id, owner: p.hold.owner });
}

function releaseRow(c, row) {
  const s = c.s;
  if (row.driver >= 0) {
    const driver = s.people[row.driver], { trip, inside } = carBack(c, row);
    const h = letGo(c, driver);
    delete driver.hold;
    driver.goal = h.goal; driver.trip = { mode: 'drive', id: trip.id, from: trip.to, to: trip.to }; driver.at = -1; driver.wake = NEVER;
    for (const p of inside) { letGo(c, p); delete p.hold; p.goal = null; p.trip = { mode: 'ride', id: trip.id, to: trip.to }; p.at = -1; p.wake = NEVER; }
  } else {
    for (const p of inCar(c, row.id)) outOfCar(c, p, row);   // nobody at the wheel: they get out
    carFetched(c, row);
  }
  s.live = s.live.filter(r => r !== row);
}

/** Hand back. `who` = one person (off the party), otherwise everyone this owner holds, and any car they left out. */
function release(c, cmd, refuse) {
  const s = c.s, owner = cmd.owner ?? 'solo';
  if (cmd.who !== undefined) {
    const p = s.people[cmd.who];
    if (!p?.hold || p.hold.owner !== owner) return refuse('not yours to hand back');
    if (p.hold.car >= 0) carExit(c, p);
    return releaseOnFoot(c, p);
  }
  for (const row of s.live.filter(r => r.owner === owner)) releaseRow(c, row);
  for (const p of ownedBy(c, owner)) releaseOnFoot(c, p);
}

export function releaseAll(c) {
  for (const row of [...c.s.live]) releaseRow(c, row);
  for (const id of [...c.s.held]) releaseOnFoot(c, c.s.people[id]);
}

function carExit(c, p) {
  const row = c.s.live.find(r => r.id === p.hold.car);
  if (!row) return;
  if (row.driver === p.id) row.driver = -1;
  p.hold.car = -1; p.hold.seat = 0;
  log(c, 'car.out', { who: p.id, model: row.model });
}

/**
 * In a car. A car is simulated by one browser (`row.owner`), but a party shares its seats (M8): `cmd.crew` is the list of players in the same party, written by the room and
 * never by a client. Nobody at the wheel, and you may drive: the car comes over to your browser and you take the wheel. `cmd.noWheel`, also the room's: this player may ride but not drive.
 */
function enterCar(c, cmd, refuse) {
  const s = c.s, p = s.people[cmd.who], row = s.live.find(r => r.id === cmd.car), owner = cmd.owner ?? 'solo';
  if (!p?.hold || p.hold.owner !== owner || !row || (row.owner !== owner && !(cmd.crew ?? []).includes(row.owner))) return refuse('cannot get in');
  const taken = new Set(inCar(c, row.id).map(q => q.hold.seat)), mayDrive = !cmd.noWheel;
  const wantFront = p.hold.kind === 'you' && row.driver < 0 && !taken.has(0) && mayDrive;
  let seat = wantFront ? 0 : -1;
  if (seat < 0) for (let i = 1; i < row.seats; i++) if (!taken.has(i)) { seat = i; break; }
  if (seat < 0 && !taken.has(0) && row.driver < 0 && mayDrive) seat = 0;
  if (seat < 0) { say(c, 'car.full', { who: p.id, car: row.id, owner }); return; }
  if (seat === 0 && row.owner !== owner) moveCar(c, row, owner);
  p.hold.car = row.id; p.hold.seat = seat;
  if (seat === 0) row.driver = p.id;
  log(c, 'car.in', { who: p.id, model: row.model });
  say(c, 'car.seat', { who: p.id, car: row.id, seat, owner });
}
const liveView = row => ({ id: row.id, model: row.model, car: row.car, x: row.x, z: row.z, yaw: row.yaw, v: row.v, seats: row.seats });
function moveCar(c, row, to) {
  const from = row.owner;
  row.owner = to;
  say(c, 'car.owner', { live: liveView(row), from, to });
}

/**
 * A body changes hands while it is moving (M8: leader takeback, and a leader handing someone over). Nothing about the person changes, only whose browser runs them, so it costs
 * no time and nothing moves: the room has already had the last position from the old browser, and `at` (the room's clock) lets the new one carry on from the right spot.
 * { kind:'transfer', who, from, to, as?:'you'|'party', at? }: written by the room; a client cannot send it.
 * With `as:'you'` the new owner plays them and whoever they were playing joins their party. If `who` was at the wheel the car and everyone of the old owner's in it go too.
 * If `who` was the front person, the rest of the old owner's party is let go: nobody is left steering them.
 */
function transfer(c, cmd, refuse) {
  const s = c.s, p = s.people[cmd.who], { from, to } = cmd, as = cmd.as === 'party' ? 'party' : 'you';
  if (!p?.hold || p.hold.owner !== from || !to || to === from) return refuse('not theirs to hand over');
  const wasFront = p.hold.kind === 'you', row = s.live.find(r => r.driver === p.id) ?? null, riders = [];
  const old = as === 'you' ? ownedBy(c, to).find(q => q.hold.kind === 'you') : null;
  if (old) {
    old.hold.kind = 'party';
    if (s.live.find(r => r.id === old.hold.car)?.driver === old.id && old.hold.car !== row?.id) carExit(c, old);      // their own car stops where it is: the player has just left its wheel
  }
  p.hold.owner = to; p.hold.kind = as;
  if (row) {
    for (const q of inCar(c, row.id)) if (q !== p && q.hold.owner === from) { q.hold.owner = to; q.hold.kind = 'party'; }
    row.owner = to;
    for (const q of inCar(c, row.id)) if (q !== p) riders.push([q.id, q.hold.seat, q.hold.owner]);
  }
  log(c, 'changed.hands', { who: p.id });
  say(c, 'owner.moved', { who: p.id, from, to, as, x: p.hold.x, z: p.hold.z, h: p.hold.h, lv: p.hold.lv ?? 0, car: p.hold.car, seat: p.hold.seat, ride: p.hold.ride ?? -1, wasYou: old?.id ?? -1, live: row ? liveView(row) : null, riders, at: cmd.at ?? 0 });
  if (wasFront) {
    for (const r of s.live.filter(q => q.owner === from)) releaseRow(c, r);
    for (const q of ownedBy(c, from)) releaseOnFoot(c, q);
  }
  // a party has a size: the one who was at the front goes back to their day if there is no room
  if (old && ownedBy(c, to).filter(q => q.hold.kind === 'party').length > c.k.control.partyMax) { if (old.hold.car >= 0) carExit(c, old); say(c, 'party.over', { who: old.id, owner: to }); releaseOnFoot(c, old); }
}

/** One of the household's parked cars comes out to the player. */
function summon(c, cmd, refuse) {
  const s = c.s, owner = cmd.owner ?? 'solo', car = s.cars[cmd.car], k = c.k.control;
  if (!car) return refuse('no such car');
  if (car.at < 0) return refuse('that car is out');
  if (s.live.filter(r => r.owner === owner).length >= k.maxLiveCars) return refuse('too many cars out');
  if (!ownedBy(c, owner).some(p => (p.household === car.household && !car.van) || p.van === car.id || (car.van && car.base === p.work))) return refuse('not your car');
  car.at = -1;
  const row = addLive(c, { car: car.id, model: car.model, seats: seatsOf(c, car.model), owner, x: cmd.x, z: cmd.z, yaw: cmd.yaw ?? 0, ...(cmd.comp ? { comp: true } : null) });
  log(c, 'summoned', { who: ownedBy(c, owner).find(p => p.hold.kind === 'you')?.id ?? car.driver, model: car.model, household: car.household });
  say(c, 'car.summoned', { live: row.id, car: car.id, model: car.model, owner, x: row.x, z: row.z, yaw: row.yaw });
}

/** Where everyone is, from the browser that runs them. rows: [who, x, z, h, edge?, fwd?, at?]; cars: [id, x, z, yaw, v, edge?, fwd?, at?]. */
function positions(c, cmd) {
  const s = c.s, owner = cmd.owner ?? 'solo';
  for (const [who, x, z, h, edge, fwd, at, lv, inside] of cmd.people || []) {
    const p = s.people[who];
    if (!p?.hold || p.hold.owner !== owner) continue;
    const H = p.hold, step = dist(H.x, H.z, x, z);
    H.lv = lv ?? 0; H.inside = inside ?? -1;
    if (step < 60) { if (H.car >= 0) H.drove += step; else H.walked += step; }   // a catch-up is not a walk
    H.x = x; H.z = z; H.h = h;
    const e = edge != null ? c.roads.edgeById(edge) : null;
    H.key = e ? e.i * 2 + (fwd ? 1 : 0) : -1; H.at = at ?? 0;
    if (H.kind === 'you' && H.car < 0) visits(c, p, H);
  }
  for (const [id, x, z, yaw, v, edge, fwd, at] of cmd.cars || []) {
    const r = s.live.find(q => q.id === id);
    if (!r || r.owner !== owner) continue;
    r.x = x; r.z = z; r.yaw = yaw; r.v = v;
    const e = edge != null ? c.roads.edgeById(edge) : null;
    r.key = e ? e.i * 2 + (fwd ? 1 : 0) : -1; r.at = at ?? 0;
  }
}
function visits(c, p, H) {
  const { place, d } = nearestPlace(c, H.x, H.z);
  const here = d <= c.k.control.visitMeters ? place.id : -1;
  if (here === H.near) return;
  H.near = here;
  if (here >= 0) log(c, 'visit', { who: p.id, place: here });
}

/** The party's front person changes. In one car the two swap seats. */
function swap(c, cmd, refuse) {
  const s = c.s, owner = cmd.owner ?? 'solo', next = s.people[cmd.who];
  if (!next?.hold || next.hold.owner !== owner) return refuse('not in your party');
  const old = ownedBy(c, owner).find(p => p.hold.kind === 'you');
  if (old === next) return;
  if (old) {
    old.hold.kind = 'party';
    if (old.hold.car >= 0 && old.hold.car === next.hold.car) {
      const row = s.live.find(r => r.id === old.hold.car), a = old.hold.seat, b = next.hold.seat;
      old.hold.seat = b; next.hold.seat = a;
      if (a === 0) row.driver = next.id; else if (b === 0) row.driver = old.id;
    } else if (old.hold.car >= 0) carExit(c, old);
  }
  next.hold.kind = 'you';
  log(c, 'swapped', { who: next.id });
  say(c, 'swapped', { who: next.id, owner, from: old?.id ?? -1 });
}

/** What happened to someone since a tick, out of the shared log: the "what did I just do?" card. */
export function recapOf(c, who, since) {
  const rows = c.s.log.filter(e => e.t >= since && (e.who === who || e.a === who || e.b === who) && e.kind !== 'took');
  return rows.slice(-c.k.control.recapRows).map(e => ({ ...e }));
}

/** The Jobs app: a person takes an opening. Works the same in town view and while being played. */
function setJob(c, cmd, refuse) {
  const p = c.s.people[cmd.who], job = c.jobById[cmd.job];
  if (!p || !job) return refuse('no such job');
  const place = openingFor(c, p, cmd.job);
  if (!place) return refuse('no opening');
  if (p.sh) clockOut(c, p);
  if (p.job && p.work >= 0) c.staff[p.work] = (c.staff[p.work] || []).filter(id => id !== p.id);
  p.job = cmd.job; p.work = place.id; p.shift = 0; p.retired = false;
  (c.staff[place.id] ||= []).push(p.id);
  if (job.chain === 'haul' && !(p.van >= 0)) addTruck(c, p);
  if (job.brigade) p.van = c.s.cars.find(x => x.engine && x.base === place.id)?.id ?? -1;
  buildSchedule(c, p); setBill(c, c.s.households[p.household]);
  log(c, 'newjob', { who: p.id, job: job.id, place: place.id });
}

/** Handles the commands above; false if it is none of them. */
export function controlCommand(c, cmd) {
  const refuse = why => say(c, 'cmd.refused', { cmd: cmd.kind, why, who: cmd.who, owner: cmd.owner ?? 'solo' });
  switch (cmd.kind) {
    case 'take': take(c, cmd, refuse); return true;
    case 'partyAdd': {
      const owner = cmd.owner ?? 'solo';
      if (ownedBy(c, owner).filter(p => p.hold.kind === 'party').length >= c.k.control.partyMax) { refuse('party full'); return true; }
      take(c, { ...cmd, as: 'party' }, refuse); return true;
    }
    case 'release': release(c, cmd, refuse); return true;
    case 'releaseAll': releaseAll(c); return true;
    case 'pos': positions(c, cmd); return true;
    case 'rideOut': rideOut(c, cmd, refuse); return true;
    case 'carIn': enterCar(c, cmd, refuse); return true;
    case 'transfer': transfer(c, cmd, refuse); return true;
    case 'carOut': { const p = c.s.people[cmd.who]; if (p?.hold?.owner === (cmd.owner ?? 'solo')) carExit(c, p); else refuse('cannot get out'); return true; }
    case 'summon': summon(c, cmd, refuse); return true;
    case 'setJob': setJob(c, cmd, refuse); return true;
    case 'swap': swap(c, cmd, refuse); return true;
    case 'liveAdd': {     // the free test car from town view: it counts to traffic, nobody is in it
      const row = addLive(c, { model: cmd.model, seats: 0, owner: cmd.owner ?? 'solo' });
      say(c, 'live.added', { live: row.id, owner: row.owner });
      return true;
    }
    case 'liveDrop': c.s.live = c.s.live.filter(r => r.id !== cmd.id || r.car >= 0 || r.driver >= 0); return true;
    default: return false;
  }
}
