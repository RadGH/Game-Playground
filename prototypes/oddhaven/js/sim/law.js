// The law (PLAN M9). A call comes from something that really happened: a real car going too fast, a real shopper with something up their sleeve, a real feud
// getting loud, a real fire. Nothing here reads a detail level or spends the sim's random stream: rolls are hashes, so a town nobody watches gets the same calls.
//
//   s.law = { next, calls: [C], stats }
//   C = { id, k, st: 'open'|'go'|'scene', t, step, place, x, z, who, other, trip, by, car, next, hits, hands, run, pin, pet, owner, fire, rift, amount, hh, tries }
//   p.beat = { id, from, sim, heldT, credit }    on a call, as p.call is on a fire
//   p.duty = { heldT, credit }                   played while on shift: paid at hand-back or the end of the shift, at the hands-on rate
//   p.rap = [{ t, k, how }]                      what they have been caught at. p.permits = { kind: last day it is good }
//
// One set of steps, two ways (rule 3). data/law.json gives a kind of call its steps; doStep() is the only place one happens. A sim officer runs them at the balance.json pace;
// a player's `law` command runs the same ones from where the browser says they stand. So a suspect half questioned stays half questioned, and you can jump into a sim officer mid-call.
//
// Rule 4: a fine is only ever what a household can spare after the next bill. Nobody goes under for this; a family with nothing to spare gets a stern word.
import { log, say } from './log.js';
import { addMoodlet } from './needs.js';
import { nudge } from './feelings.js';
import { earn, charge, payShift, canSpend } from './economy.js';
import { startDrive } from './traffic.js';
import { hash01 as h01 } from './rng.js';
import { positionOf } from './levels.js';
import { excess } from './fire.js';
import { startFeud } from './threads.js';
import { nearestPlace } from './control.js';
import { partnerId } from './social.js';
import { wardenCalls, lawRiftCredit } from './rifts.js';

const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const K = c => c.k.law;
const row = (c, C) => c.d.law.calls[C.k];

export const newLaw = () => ({ next: 1, calls: [], stats: { calls: 0, by: {}, tickets: 0, warnings: 0, arrests: 0, fines: 0, hands: 0, away: 0 } });
export const callOfId = (c, id) => c.s.law.calls.find(x => x.id === id) ?? null;
const callOf = (c, p) => (p.beat ? callOfId(c, p.beat.id) : null);
export const stations = c => c.places.filter(pl => pl.kind === 'police_station');
export const onShiftNow = (c, p) => { const sh = c.nextShift(c, p); return !!sh && c.s.t >= sh.start && c.s.t < sh.end; };

/** The patrol cars and the lodge's jeep: on the end of the cars list, so old saves keep their numbers. */
export function newVans(c) {
  const s = c.s, add = (pl, model, list) => {
    const car = { id: s.cars.length, household: list[0].household, driver: list[0].id, model, at: pl.id, base: pl.id, load: 0, company: true, van: true };
    s.cars.push(car);
    return car;
  };
  for (const pl of stations(c)) {
    const list = s.people.filter(p => p.work === pl.id && p.job === 'officer');
    if (!list.length) continue;
    const a = add(pl, 'police_car', list), b = add(pl, 'police_car', list);
    list.forEach((p, i) => { p.van = i % 2 ? b.id : a.id; });
  }
  for (const pl of c.places.filter(q => q.kind === 'clinic')) {
    const list = s.people.filter(p => p.work === pl.id && p.job === 'nurse');
    if (!list.length) continue;
    const a = add(pl, 'ambulance', list);
    for (const p of list) p.van = a.id;
  }
  for (const pl of c.places.filter(q => q.kind === 'rift_lodge')) {
    const list = s.people.filter(p => p.work === pl.id && p.job === 'rift_warden');
    if (!list.length) continue;
    const a = add(pl, 'trail_jeep', list);
    for (const p of list) p.van = a.id;
  }
}
export const freeVan = (c, place) => c.s.cars.find(x => x.van && x.base === place && x.at === place) ?? null;

// ---- permits

export const hasPermit = (c, p, kind) => (p.permits?.[kind] ?? -1) >= c.clock.day(c.s.t);
export function buyPermit(c, p, kind) {
  const P = c.d.law.permits[kind], h = c.s.households[p.household];
  (p.permits ||= {})[kind] = c.clock.day(c.s.t) + P.days;
  charge(c, h, P.fee, 'permits');
  log(c, 'permit', { who: p.id, permit: kind, amount: P.fee, days: P.days });
}
/** A player, from the Phone. The room has already said whether they may spend this household's money. */
export function permitCommand(c, cmd, refuse) {
  const p = c.s.people[cmd.who], P = c.d.law.permits[cmd.permit];
  if (!p || !P) return refuse('no such permit');
  if (c.s.households[p.household].money < P.fee) return refuse('not enough money');
  buyPermit(c, p, cmd.permit);
  say(c, 'permit.done', { who: p.id, permit: cmd.permit, owner: cmd.owner ?? 'solo' });
}

// ---- a call starts

/** Who lives this: the households a call touches, for the Story and the paper. */
const homesOf = (c, ...ids) => [...new Set(ids.filter(id => id >= 0).map(id => c.s.people[id].household))];

function newCall(c, k, fields) {
  const s = c.s, S = s.law, C = { id: S.next++, k, st: 'open', t: s.t, step: 0, who: -1, other: -1, by: -1, car: -1, next: 0, hits: 0, hands: 0, run: 0, pin: 0, ...fields };
  S.calls.push(C);
  S.stats.calls++; S.stats.by[k] = (S.stats.by[k] || 0) + 1;
  if (!row(c, C).quiet) log(c, 'radio', { call: C.id, why: k, place: C.place, ...(C.who >= 0 ? { who: C.who } : null), ...(C.other >= 0 ? { other: C.other } : null), hh: C.hh ?? homesOf(c, C.who, C.other) });
  return C;
}
const nameDay = (c, tag) => `${c.s.seed}/${tag}/${Math.floor(c.s.t / c.clock.ticks(60))}`;

/** A car going too fast: it really is. `trip.fast` is read by traffic. */
function speeder(c, trip) {
  const s = c.s, p = s.people[trip.driver];
  if (trip.fast || trip.car < 0 || s.cars[trip.car].company || p.hold) return null;
  trip.fast = 1;
  const at = c.roads.at(c.roads.byId(trip.route), trip.s);
  return newCall(c, 'speeding', { who: p.id, trip: trip.id, place: trip.to, x: at.x, z: at.z });
}
const lightFingers = (c, p) => { const h = c.s.households[p.household]; let n = 1; if (h.money < h.bill + c.k.economy.spendCushion) n *= 3; if (p.mood < 0.4) n *= 1.6; if (p.traits.includes('greedy')) n *= 2; if (p.traits.includes('cynical')) n *= 1.4; if (p.traits.includes('pious') || p.traits.includes('kind')) n *= 0.4; return n; };

function theft(c, p, salt = 0) {
  if (p.at < 0 || p.hold || p.act?.a !== 'browse_shops') return null;
  const pl = c.places[p.at], amount = 6 + Math.floor(h01(`${nameDay(c, 'lift')}/${p.id}/${salt}`) * 14), h = c.s.households[p.household];
  earn(c, h, amount, 'lifted');
  const clerk = (c.staff[pl.id] || []).find(id => c.s.people[id].at === pl.id && !c.s.people[id].hold) ?? -1;
  return newCall(c, 'theft', { who: p.id, other: clerk, place: pl.id, x: pl.x, z: pl.z, amount });
}
function noise(c, th) {
  const s = c.s, a = s.people[th.a], b = s.people[th.b];
  if (a.at !== a.home || a.hold || b.hold) return null;
  th.noise = c.clock.day(s.t);
  const pl = c.places[a.home];
  return newCall(c, 'noise', { who: a.id, other: b.id, place: a.home, x: pl.x, z: pl.z, cause: th.cause });
}
/** Two cars that met. Both really stop; a car still gets past in the end (the 20 s rule), and what is left in the road needs clearing. */
function fender(c, A, B) {
  const r = c.roads.byId(A.route), at = c.roads.at(r, A.s);
  A.state = 'bumped'; A.stuck = 0; B.state = 'bumped'; B.stuck = 0;
  const pl = nearestPlace(c, at.x, at.z).place, a = A.driver, b = B.driver;
  for (const id of [a, b]) addMoodlet(c, c.s.people[id], 'fender', -0.06, 6);
  return newCall(c, 'fender', { a, b, place: pl.id, x: at.x, z: at.z, hh: homesOf(c, a, b) });
}
function lostPet(c, h, salt) {
  const s = c.s, sites = c.town.riftSites ?? [], home = c.places[h.home], L = c.d.law.pets;
  if (!sites.length) return null;
  let spot = sites[0], d = Infinity;
  for (const q of sites) { const e = dist(q.x, q.z, home.x, home.z) + h01(salt + q.id) * 240; if (e < d) { d = e; spot = q; } }
  const a = h01(salt + 'a') * 6.283, pet = { x: spot.x + Math.cos(a) * 9, z: spot.z + Math.sin(a) * 9, kind: L.kinds[Math.floor(h01(salt + 'k') * L.kinds.length)], name: L.names[Math.floor(h01(salt + 'n') * L.names.length)] };
  const owner = h.members[0];
  return newCall(c, 'lost_pet', { owner, pet, place: nearestPlace(c, pet.x, pet.z).place.id, x: pet.x, z: pet.z, hh: [h.id] });
}
function hawkStart(c, p) {
  if (hasPermit(c, p, 'stall') || p.hold) return;
  const pl = c.places[p.at];
  newCall(c, 'hawking', { who: p.id, place: pl.id, x: pl.x, z: pl.z });
}
function streetMagic(c, p) {
  const pl = c.places[p.at];
  newCall(c, 'street_magic', { who: p.id, place: pl.id, x: pl.x, z: pl.z });
}
/** A player casting in the street with no permit: someone saw. Off a hash, so it is not every time. */
export function publicCast(c, p) {
  if (!p.hold || p.hold.inside >= 0 || hasPermit(c, p, 'magic') || h01(`${c.s.seed}/cast/${p.id}/${c.s.t}`) > 0.3) return;
  const pl = nearestPlace(c, p.hold.x, p.hold.z).place;
  newCall(c, 'street_magic', { who: -1, seen: p.id, place: pl.id, x: p.hold.x, z: p.hold.z, hh: [p.household] });
}
/** The ambulance, hands-on (the gap M5 left). Somebody needs the clinic and a nurse is being played: it goes on their radio first. If nobody comes, the sim's ambulance does, as ever. */
export function medicWanted(c, p) {
  const s = c.s;
  if (p.noMedic || p.hold || p.at < 0 || s.law.calls.some(C => C.who === p.id) || !s.held.some(id => s.people[id].job === 'nurse')) return false;
  const pl = c.places[p.at];
  const C = newCall(c, 'medic', { who: p.id, place: pl.id, x: pl.x, z: pl.z, hh: [p.household] });
  if (p.act) c.finishAct(c, p);
  p.goal = null; p.orders = []; p.wpos = [pl.x, pl.z]; p.task = null;
  c.startAct(c, p, c.actionById.questioned, p.at, s.t + c.clock.ticks(720));
  C.pin = 1;
  return true;
}
function medicLoad(c, C, nurse) {
  const v = c.s.people[C.who], place = v.at;
  c.finishAct(c, v); v.wpos = null;
  c.startAct(c, v, c.actionById.carried, place, c.s.t + c.clock.ticks(720), { by: nurse.id });
  nurse.carry = 'patient'; nurse.bears = v.id; C.pin = 0;
}
function medicDrop(c, C, nurse) {
  const s = c.s, v = s.people[C.who], clinic = nearClinic(c, nurse);
  nurse.carry = null; nurse.bears = -1;
  c.finishAct(c, v);
  v.at = clinic.id; v.since = s.t; v.wake = s.t; v.noMedic = 1;
  nudge(c, v, nurse.id, 'trust', 14); nudge(c, v, nurse.id, 'like', 10);
  log(c, 'patient.in', { who: nurse.id, person: v.id, place: clinic.id, hh: [v.household, nurse.household] });
}
const nearClinic = (c, p) => { const H = p.hold; return (c.tags.get('clinic') ?? []).slice().sort((a, b) => dist(a.x, a.z, H.x, H.z) - dist(b.x, b.z, H.x, H.z))[0]; };
export function hawkEnded(c, p) { earn(c, c.s.households[p.household], K(c).hawkPay, 'stall'); }
export function hawkStarted(c, p) { hawkStart(c, p); }

/** Other parts of the town ring the station through the log. */
export function lawOnLog(c, e) {
  const S = c.s.law; if (!S) return;
  if (e.kind === 'fire.call') { const pl = c.places[e.place]; newCall(c, 'cordon', { fire: e.fire, place: e.place, x: pl.x, z: pl.z, hh: [] }); } else if (e.kind === 'fire.out') { for (const C of [...S.calls]) if (C.k === 'cordon' && C.fire === e.fire) closeCall(c, C, 'done'); } else if (e.kind === 'rift.open') { newCall(c, 'panic', { rift: e.rift, place: e.place, x: e.x, z: e.z, hh: [] }); }
}

/** Once a game hour. */
function rollLaw(c) {
  const s = c.s, k = K(c), hour = Math.floor(s.t / c.clock.ticks(60)), m = c.clock.minute(s.t), roll = why => h01(`${s.seed}/${hour}/${why}`);
  for (const tr of s.trips) if (tr.state === 'rail' && tr.car >= 0 && !s.cars[tr.car].company) {
    const p = s.people[tr.driver], rate = k.speedingPerTrip * (p.traits.some(x => c.d.law.rough.includes(x)) ? 2.2 : 1) * (p.moodlets.some(q => q.id === 'late') ? 3 : 1);
    if (roll(`sp${tr.id}`) < rate) speeder(c, tr);
  }
  for (const p of s.people) {
    if (p.act?.a === 'browse_shops' && roll(`th${p.id}`) < k.theftPerShopper * lightFingers(c, p)) theft(c, p);
    else if ((p.act?.a === 'stroll' || p.act?.a === 'park_walk') && !hasPermit(c, p, 'magic') && roll(`mg${p.id}`) < k.magicPerStroller * (c.fx[p.id]?.magicAgain ?? 1)) streetMagic(c, p);
  }
  if (m >= 19 * 60 || m < 60) for (const th of s.social.threads) if (th.k === 'feud' && !th.end && th.noise !== c.clock.day(s.t) && roll(`no${th.id}`) < k.noisePerFeud) noise(c, th);
  if (roll('fender') < k.fenderPerHour) {
    const byKey = new Map();
    for (const tr of s.trips) { if (tr.state !== 'rail' || tr.siren || (tr.car >= 0 && s.cars[tr.car].company)) continue; const r = c.roads.byId(tr.route), st = r.steps[tr.e]; if (!st) continue; const pos = tr.s - st.start, l = byKey.get(st.key); if (l) l.push([tr, pos]); else byKey.set(st.key, [[tr, pos]]); }
    done: for (const list of byKey.values()) { list.sort((a, b) => a[1] - b[1]); for (let i = 0; i + 1 < list.length; i++) if (list[i + 1][1] - list[i][1] < 22) { fender(c, list[i][0], list[i + 1][0]); break done; } }
  }
  // money is tight and the bills are close: a folding table in the park. With a permit that is a stall. Without, somebody rings up.
  for (const h of s.households) {
    if (!h.members.length || h.money >= k.hawkMoney + h.bill) continue;
    if (roll(`hk${h.id}`) >= k.hawkPerHour) continue;
    const p = s.people[h.members[Math.floor(roll(`hw${h.id}`) * h.members.length)]];
    if (p.hold || p.beat || p.fg || p.orders.length >= c.k.orders.max || !c.tags.get('park')?.length) continue;
    if (!hasPermit(c, p, 'stall') && canSpend(c, h, c.d.law.permits.stall.fee) && roll(`hb${h.id}`) < 0.5) buyPermit(c, p, 'stall');
    p.orders.push({ kind: 'use', action: 'hawk' }); if (!p.trip && p.act && c.actionById[p.act.a].interruptible) p.wake = s.t;
  }
  // quiet hour: a car goes round the streets
  for (const pl of stations(c)) if (roll(`pa${pl.id}`) < k.patrolPerHour) { const list = c.places.filter(q => q.role === 'shop' || q.role === 'public'), to = list[Math.floor(roll(`pp${pl.id}`) * list.length)]; if (to && !s.law.calls.some(C => C.k === 'patrol' && C.base === pl.id)) newCall(c, 'patrol', { base: pl.id, place: to.id, x: to.x, z: to.z, hh: [] }); }
}
function dailyPets(c) {
  const s = c.s, k = K(c), day = c.clock.day(s.t);
  for (const h of s.households) { if (!h.members.length) continue; const salt = `${s.seed}/pet/${day}/${h.id}`; if (h01(salt) < k.petsPerHousehold) lostPet(c, h, salt); }
}

/** Tests, and a dev server: a real crime of this kind, right now, if the town has what it takes. */
export function startCall(c, cmd) {
  const s = c.s, kind = cmd.call;
  if (kind === 'speeding') { const tr = s.trips.find(x => x.state === 'rail' && x.car >= 0 && !s.cars[x.car].company && !x.fast && !s.people[x.driver].hold); return tr ? speeder(c, tr) : null; }
  if (kind === 'theft') { const p = s.people.find(q => q.act?.a === 'browse_shops' && !q.hold); return p ? theft(c, p, s.t) : null; }
  if (kind === 'noise') { const th = s.social.threads.find(x => x.k === 'feud' && !x.end && s.people[x.a].at === s.people[x.a].home); return th ? noise(c, th) : null; }
  if (kind === 'lost_pet') { const h = s.households.find(q => q.members.length && (cmd.household === undefined || q.id === cmd.household)); return h ? lostPet(c, h, `${s.seed}/dev/${s.t}`) : null; }
  if (kind === 'hawking' || kind === 'street_magic') { const p = s.people.find(q => !q.hold && q.at >= 0 && !q.beat && c.places[q.at].role === 'public'); if (!p) return null; if (kind === 'hawking') return newCall(c, 'hawking', { who: p.id, place: p.at, x: c.places[p.at].x, z: c.places[p.at].z }); return streetMagic(c, p); }
  if (kind === 'fender') { const list = s.trips.filter(x => x.state === 'rail' && !x.siren && !(x.car >= 0 && s.cars[x.car].company)); if (list.length < 2) return null; return fender(c, list[0], list[1]); }
  return null;
}

// ---- where a step happens

const spotOf = (c, id) => { const p = c.s.people[id]; return p.hold ? { x: p.hold.x, z: p.hold.z } : positionOf(c, p); };
export const stepName = (c, C) => (C.run === 1 ? 'catch' : row(c, C).steps[C.step] ?? null);
const ownerHome = (c, C) => c.places[c.s.people[C.owner].home];
export function targetOf(c, C) {
  const st = stepName(c, C);
  if (st === 'other') return spotOf(c, C.other);
  if (st === 'pick') return C.pet;
  if (st === 'home') return ownerHome(c, C);
  if (st === 'clinic') return c.tags.get('clinic').slice().sort((a, b) => dist(a.x, a.z, C.x, C.z) - dist(b.x, b.z, C.x, C.z))[0];
  if ((st === 'pull' || st === 'talk' || st === 'book' || st === 'find' || st === 'catch') && C.who >= 0) return spotOf(c, C.who);
  return { x: C.x, z: C.z };
}
/** The place a sim officer has to be at for this step, if it is not where they are. */
function legFor(c, C) {
  const st = stepName(c, C), where = id => { const p = c.s.people[id]; return p.at >= 0 ? p.at : p.hold ? -1 : p.trip?.to ?? p.home; };
  if (st === 'other') return where(C.other);
  if (st === 'home') return ownerHome(c, C).id;
  if ((st === 'find' || st === 'talk' || st === 'book') && C.who >= 0) return where(C.who);
  return -1;
}
function pin(c, C, p) {
  const s = c.s;
  if (p.hold) return false;
  if (p.act?.a === 'questioned' || p.act?.a === 'flee') { C.pin = 1; return true; }
  if (p.trip?.mode === 'drive') { const tr = s.trips.find(x => x.id === p.trip.id); if (!tr) return false; tr.pull = 1; C.pin = 2; C.trip = tr.id; return true; }
  if (p.trip && p.trip.mode !== 'walk') return false;
  const at = positionOf(c, p);
  if (p.trip) { p.trip = null; p.at = nearestPlace(c, at.x, at.z).place.id; p.since = s.t; } else if (p.act) c.finishAct(c, p);
  p.goal = null; p.wpos = [at.x, at.z]; p.task = null;
  if (c.s.people[p.id].act) c.finishAct(c, p);
  c.startAct(c, p, c.actionById.questioned, p.at, s.t + c.clock.ticks(720));
  C.pin = 1;
  return true;
}
function unpin(c, C) {
  const s = c.s, p = C.who >= 0 ? s.people[C.who] : null; if (!p) return;
  if (C.pin === 2) { const tr = s.trips.find(x => x.id === C.trip); if (tr) { delete tr.pull; delete tr.fast; } }
  if (p.act?.a === 'questioned' || p.act?.a === 'flee') { c.finishAct(c, p); p.wake = s.t; p.task = null; p.legs = null; p.wpos = null; }
  C.pin = 0;
}

/** Run for it: down the road towards home, at a pace a player can catch and a car can catch faster. */
function startFlee(c, C, p) {
  const s = c.s, at = positionOf(c, p), from = c.roads.nodes.reduce((b, n) => (dist(n.x, n.z, at.x, at.z) < dist(b.x, b.z, at.x, at.z) ? n : b)), r = c.roads.route(from.id, c.places[p.home].node), pts = r.points;
  const legs = []; let last = at; for (const q of pts) { const x = q[0] ?? q.x, z = q[1] ?? q.z; if (dist(last.x, last.z, x, z) >= 18) { legs.push([x, z]); last = { x, z }; } if (legs.length >= 14) break; }
  if (!legs.length) legs.push([at.x + 30, at.z]);
  if (p.act) c.finishAct(c, p);
  p.wpos = [at.x, at.z]; p.legs = legs; p.task = null;
  c.startAct(c, p, c.actionById.flee, p.at, s.t + c.clock.ticks(720));
  addMoodlet(c, p, 'ran', -0.08, 8);
  C.run = 1; C.ran = 1; C.runAt = s.t;
  log(c, 'ran', { who: p.id, call: C.id, why: C.k, place: C.place, hh: [p.household] });
}
function stepFlee(c, C) {
  const p = c.s.people[C.who], t = c.s.t, k = K(c);
  if (p.act?.a !== 'flee') return;
  if (p.task && t >= p.task.en) { p.wpos = [p.task.x1, p.task.z1]; p.task = null; }
  if (!p.task && p.legs?.length) {
    const [x, z] = p.legs.shift(), w = p.wpos, secs = dist(w[0], w[1], x, z) / k.fleeSpeed;
    p.task = { k: 'run', x0: w[0], z0: w[1], x1: x, z1: z, st: t, en: t + Math.max(1, c.clock.seconds(secs)), ref: null, lv: 0 };
  }
}

// ---- the end of a call

function fineFor(c, C, p) {
  const want = row(c, C).fine + (C.amount ?? 0), h = c.s.households[p.household];
  return excess(c, h, want, 'fines');
}
function rapOf(c, p, k, how) { (p.rap ||= []).push({ t: c.s.t, k, how }); if (p.rap.length > K(c).rapCap) p.rap.shift(); }

function toCells(c, p, station) {
  const s = c.s;
  p.orders = []; p.goal = null; p.cell = station.id;
  if (p.act) c.finishAct(c, p);
  const from = p.at; p.at = -1; p.since = s.t;
  startDrive(c, p, c.places[from], station, from, station.id, -1);
  s.trips[s.trips.length - 1].model = 'police_car';
  p.wake = c.never;
}
const stationNear = (c, pl) => stations(c).filter(q => !c.burning.has(q.building)).sort((a, b) => c.roads.distance(a.node, pl.node) - c.roads.distance(b.node, pl.node) || a.id - b.id)[0] ?? null;

function book(c, C, how, by) {
  const s = c.s, S = s.law.stats, p = s.people[C.who], officer = s.people[by], k = K(c);
  if (!p) return;
  const fact = { who: p.id, by, why: C.k, call: C.id, place: C.place, hh: [p.household], ...(C.ran ? { ran: 1 } : null) };
  if (how === 'warn') { S.warnings++; nudge(c, p, by, 'respect', 4); rapOf(c, p, C.k, 'warned'); log(c, 'warned', fact); return; }
  const amount = fineFor(c, C, p);
  if (how === 'ticket' && amount <= 0) { S.warnings++; rapOf(c, p, C.k, 'warned'); log(c, 'warned', { ...fact, spared: 1 }); return; }
  S.fines += amount;
  nudge(c, p, by, 'grudge', how === 'arrest' ? k.arrestGrudge : k.ticketGrudge); nudge(c, p, by, 'trust', how === 'arrest' ? -12 : -3); nudge(c, p, by, 'known', 8); nudge(c, officer, p.id, 'known', 8);
  addMoodlet(c, p, how === 'arrest' ? 'arrested' : 'fined', how === 'arrest' ? k.moodCells : k.moodFine, how === 'arrest' ? 24 : 10);
  for (const id of s.households[p.household].members) if (id !== p.id) nudge(c, s.people[id], p.id, 'trust', -4);
  rapOf(c, p, C.k, how);
  if (how === 'ticket') { S.tickets++; log(c, 'ticket', { ...fact, amount }); return; }
  S.arrests++;
  log(c, 'arrested', { ...fact, amount });
  if (C.other >= 0 && h01(`${s.seed}/grudge/${C.id}`) < k.feudChance) startFeud(c, p, s.people[C.other], 'arrest');
  const mate = partnerId(c, p.id); if (mate >= 0) addMoodlet(c, s.people[mate], 'partner_arrested', -0.08, 18);
  const st = stationNear(c, c.places[C.place]);
  if (st && !p.trip && p.at >= 0) { C.pin = 0; toCells(c, p, st); }
}

function simHow(c, C) {
  const r = h01(`${c.s.seed}/how/${C.id}`), k = K(c), d = row(c, C);
  if (C.ran && d.arrest) return 'arrest';
  if (r < k.warnChance) return 'warn';
  return d.arrest && r < k.warnChance + k.arrestChance ? 'arrest' : 'ticket';
}

/** What this call is worth to whoever did it, and everybody goes back to their day. Called once a call is over, however it ended. */
export function closeCall(c, C, how) {
  const s = c.s, S = s.law, p = C.by >= 0 ? s.people[C.by] : null;
  if (!S.calls.includes(C)) return;
  S.calls = S.calls.filter(x => x !== C);
  unpin(c, C);
  if (C.k === 'patrol') { /* nothing to tell */ } else if (how === 'lapsed') log(c, 'radio.lapsed', { call: C.id, why: C.k, place: C.place, hh: [] });
  if (C.k === 'medic') { const v = s.people[C.who]; if (v.act?.a === 'carried') { const n = s.people[v.act.by]; n.carry = null; n.bears = -1; c.finishAct(c, v); } v.noMedic = 1; v.wake = s.t; }
  if (p?.carry === 'pet') p.carry = null;
  if (!p) return;
  const q = p.beat;
  if (q?.id === C.id) {
    if (!p.hold) q.sim += s.t - q.from;
    const job = c.jobById[p.job];
    if (q.sim > 0 && job) payShift(c, p, job, q.sim);
    if (p.hold && (q.credit > 0 || q.heldT > 0)) { p.duty ||= { heldT: 0, credit: 0 }; p.duty.credit += q.credit; }
    delete p.beat;
    if (p.hold) say(c, 'law.done', { who: p.id, owner: p.hold.owner, k: C.k, how });
  }
  if (C.hands && how !== 'lapsed') S.stats.hands++;
  if (p.hold) return;
  // a sim officer drives back. Their shift is still on, so `decide` puts them at the desk
  if (p.act?.a === 'police_work') {
    const here = p.at, home = p.work; c.finishAct(c, p); p.wpos = null;
    if (here !== home && here >= 0) { const car = C.car >= 0 && s.cars[C.car].at === here ? s.cars[C.car] : null; p.at = -1; p.since = s.t; if (car) car.at = -1; startDrive(c, p, c.places[here], c.places[home], here, home, car ? car.id : -1); if (!car) s.trips[s.trips.length - 1].model = 'police_car'; p.wake = c.never; } else p.wake = s.t;
  } else if (!p.trip) p.wake = s.t;
}

/** One step, by whoever. `how`: the book, for a player; a sim officer's is worked out. True if the call moved on. */
function doStep(c, C, p, { how = null, q = 1 } = {}) {
  const s = c.s, st = stepName(c, C), steps = row(c, C).steps, sus = C.who >= 0 ? s.people[C.who] : null, k = K(c);
  switch (st) {
    case 'pull':
      if (sus?.trip?.mode === 'drive') pin(c, C, sus); else if (sus && !pin(c, C, sus)) { closeCall(c, C, 'gone'); return true; }
      break;
    case 'talk':
      if (sus) {
        if (!pin(c, C, sus)) { closeCall(c, C, 'gone'); return true; }
        const rough = sus.traits.some(x => c.d.law.rough.includes(x)) ? 1.5 : 1;
        if (C.pin === 1 && row(c, C).arrest && !C.ran && h01(`${s.seed}/run/${C.id}`) < k.fleeChance * rough) { startFlee(c, C, sus); say(c, 'law.ran', { who: sus.id, call: C.id }); C.step++; return true; }
      }
      break;
    case 'catch':
      C.run = 2;
      if (sus?.act?.a === 'flee') { c.finishAct(c, sus); sus.task = null; sus.legs = null; c.startAct(c, sus, c.actionById.questioned, sus.at, s.t + c.clock.ticks(720)); C.pin = 1; }
      say(c, 'law.caught', { who: C.who, by: p.id, call: C.id });
      return true;
    case 'book':
      if (sus) book(c, C, how ?? simHow(c, C), p.id);
      break;
    case 'pick': p.carry = 'pet'; break;
    case 'load': medicLoad(c, C, p); break;
    case 'clinic': medicDrop(c, C, p); break;
    case 'home':
      p.carry = null;
      log(c, 'pet.found', { who: p.id, person: C.owner, pet: C.pet.name, place: ownerHome(c, C).id, hh: [s.people[C.owner].household, p.household] });
      nudge(c, s.people[C.owner], p.id, 'like', 12); nudge(c, s.people[C.owner], p.id, 'known', 10);
      addMoodlet(c, s.people[C.owner], 'pet_back', 0.12, 12);
      break;
    case 'clear': C.hits += q >= c.k.work.okAt ? 1 : 0.5; if (C.hits < 1) return true; C.hits = 0; break;
    case 'calm': if (C.step === steps.length - 1) log(c, 'calmed', { who: p.id, place: C.place, hh: [p.household] }); break;
    case 'move': case 'stand': case 'witness': case 'other': case 'find': case 'look': break;
    default: break;
  }
  C.step++;
  if (C.step >= steps.length) closeCall(c, C, 'done');
  return true;
}

// ---- a sim officer

const secsOf = (c, st) => K(c).stepSeconds[st] ?? 3;
function drive(c, C, p, to) {
  const s = c.s, from = p.at, car = C.car >= 0 && s.cars[C.car].at === from ? s.cars[C.car] : null;
  if (p.act) c.finishAct(c, p);
  p.at = -1; p.since = s.t; p.wpos = null;
  if (car) car.at = -1;
  startDrive(c, p, c.places[from], c.places[to], from, to, car ? car.id : -1);
  const tr = s.trips[s.trips.length - 1];
  if (!car) tr.model = 'police_car';
  if (row(c, C).urgent) tr.siren = 1;
  p.wake = c.never;
  C.st = 'go';
}
function onScene(c, C, p) {
  const s = c.s;
  C.st = 'scene';
  p.wpos = [c.places[p.at].x, c.places[p.at].z]; p.task = null;
  c.startAct(c, p, c.actionById.police_work, p.at, s.t + c.clock.ticks(720));
  p.wake = p.act.until;
  C.next = s.t + c.clock.seconds(secsOf(c, stepName(c, C)));
}
function assign(c, C, p) {
  const s = c.s, q = { id: C.id, from: s.t, sim: 0, heldT: 0, credit: 0 };
  C.by = p.id; p.beat = q;
  if (p.hold) { C.st = 'scene'; C.hands = 1; C.took = s.t; C.from = { x: p.hold.x, z: p.hold.z }; return; }
  C.car = freeVan(c, p.at)?.id ?? -1;
  p.orders = []; p.goal = null;
  if (p.at === C.place) { if (p.act) c.finishAct(c, p); onScene(c, C, p); } else drive(c, C, p, C.place);
}
function dispatch(c, C) {
  if (row(c, C).job === 'nurse') return;        // only a played nurse takes one. Left alone it lapses, and the sim's ambulance goes
  const s = c.s, k = K(c), pl = c.places[C.place], fresh = (s.t - C.t) / c.clock.tps < k.holdWaitSeconds, wait = fresh && !row(c, C).quiet && s.held.some(id => s.people[id].job === 'officer' && !s.people[id].beat && onShiftNow(c, s.people[id]));
  if (wait) return;       // someone on the radio is being played: it is theirs if they want it, for a little while
  const free = s.people.filter(p => p.job === 'officer' && !p.beat && !p.hold && p.at === p.work && p.act?.a === 'work' && (C.base === undefined || p.work === C.base)).sort((a, b) => c.roads.distance(c.places[a.work].node, pl.node) - c.roads.distance(c.places[b.work].node, pl.node) || a.id - b.id);
  if (free.length) assign(c, C, free[0]);
}
/** A sim officer has woken. True if the law decided for them. */
export function lawWake(c, p) {
  const s = c.s;
  if (p.cell !== undefined && !p.trip) {
    const st = c.places[p.cell], k = K(c); delete p.cell;
    if (p.act) c.finishAct(c, p);
    if (st && p.at === st.id) {
      const morning = c.clock.tickAt(c.clock.day(s.t) + 1, k.cellsHour * 60), until = Math.max(morning, s.t + c.clock.ticks(k.cellsMinHours * 60));
      c.startAct(c, p, c.actionById.cells, p.at, until);
      return true;
    }
    return false;
  }
  if (p.act?.a === 'questioned' || p.act?.a === 'flee') { p.act.until = s.t + c.clock.ticks(720); p.wake = p.act.until; return true; }
  const C = callOf(c, p);
  if (!C) { if (p.beat) delete p.beat; return false; }
  if (p.trip) return false;
  if (p.act?.a === 'police_work') { p.act.until = s.t + c.clock.ticks(720); p.wake = p.act.until; return true; }
  if (C.st === 'go') { onScene(c, C, p); return true; }
  return false;
}
function stepSim(c, C, p) {
  const s = c.s, k = K(c);
  if (C.st !== 'scene' || s.t < C.next || p.trip) return;
  const leg = legFor(c, C);
  if (leg >= 0 && leg !== p.at) {
    C.tries = (C.tries || 0) + 1;
    if (C.tries > 4) { closeCall(c, C, 'gone'); return; }
    drive(c, C, p, leg);
    return;
  }
  if (C.run === 1) {       // the chase: the sim's version is a coin with the right odds, after the right time
    if (s.t - C.runAt < c.clock.seconds(k.simChaseSeconds)) return;
    if (h01(`${s.seed}/catch/${C.id}`) < k.simCatchChance) doStep(c, C, p); else gotAway(c, C);
    return;
  }
  doStep(c, C, p);
  if (s.law.calls.includes(C) && C.st === 'scene') C.next = s.t + c.clock.seconds(secsOf(c, stepName(c, C)));
}
function gotAway(c, C) {
  const s = c.s, p = C.who >= 0 ? s.people[C.who] : null;
  s.law.stats.away++;
  if (p) { rapOf(c, p, C.k, 'away'); addMoodlet(c, p, 'got_away', 0.06, 6); log(c, 'got.away', { who: p.id, why: C.k, call: C.id, place: C.place, by: C.by, hh: [p.household] }); }
  closeCall(c, C, 'away');
}

/** Once a second: what a call does by itself. */
function stepCall(c, C) {
  const s = c.s, k = K(c), t = s.t;
  if (C.k === 'cordon' && !s.fire.fires.some(F => F.id === C.fire)) return closeCall(c, C, 'done');
  if (C.st === 'open') {
    if ((t - C.t) / c.clock.ticks(60) > k.openHours || (row(c, C).job === 'nurse' && (t - C.t) / c.clock.tps > k.holdWaitSeconds)) return closeCall(c, C, 'lapsed');
    return dispatch(c, C);
  }
  const p = s.people[C.by], sus = C.who >= 0 ? s.people[C.who] : null;
  if (sus && C.run === 1) stepFlee(c, C);
  if (!p.hold) return stepSim(c, C, p);
  if (t - C.took > c.clock.ticks(k.heldMinutes)) return closeCall(c, C, 'lapsed');
  if (sus?.hold) return closeCall(c, C, 'gone');
  const H = p.hold, at = targetOf(c, C), st = stepName(c, C), d = at ? dist(H.x, H.z, at.x, at.z) : Infinity;
  if (st === 'stand' && d <= k.standMeters) { C.stood = (C.stood || 0) + 1; if (C.stood >= secsOf(c, 'stand')) { p.beat.credit += secsOf(c, 'stand'); doStep(c, C, p); } }
  if (st === 'pull') {
    if (sus?.trip?.mode !== 'drive') { if (sus?.at >= 0) { C.step++; return; } } else {
      const row2 = s.live.find(r => r.driver === p.id), close = d <= k.pullMeters;
      if (row2?.siren && close) { C.lit = (C.lit || 0) + 1; if (C.lit >= secsOf(c, 'pull')) { p.beat.credit += secsOf(c, 'pull'); arrived(c, C, p, at); doStep(c, C, p); say(c, 'law.pulled', { who: C.who, by: p.id, call: C.id }); } }
    }
  }
  if (C.run === 1 && d > k.gotAwayMeters && t - C.runAt > c.clock.seconds(10)) gotAway(c, C);
}
/** The drive there counts as the sim's drive would have: paid once, the first time you reach something, and never for more than the time it took. */
function arrived(c, C, p, at) {
  if (C.reached || !C.from) return;
  C.reached = 1;
  p.beat.credit += Math.min(dist(C.from.x, C.from.z, at.x, at.z) / K(c).driveSpeed, (c.s.t - C.took) / c.clock.tps);
}

/** A player's `law` command. Every verb is a step above, from where the browser says they stand. */
export function lawCommand(c, cmd, refuse) {
  const s = c.s, p = s.people[cmd.who], owner = cmd.owner ?? 'solo', k = K(c);
  if (!p?.hold || p.hold.owner !== owner) return refuse('not yours');
  const answer = (ok, extra = null) => say(c, 'law.answer', { who: p.id, owner, verb: cmd.verb, ok, ...extra }), H = p.hold;
  switch (cmd.verb) {
    case 'take': {
      const C0 = callOfId(c, cmd.id);
      if (C0 && (row(c, C0).job ?? 'officer') !== p.job) return answer(false, { why: 'not yours' });
      if (p.beat) return answer(false, { why: 'busy' });
      const C = callOfId(c, cmd.id);
      if (!C || C.st !== 'open' || row(c, C).quiet) return answer(false, { why: 'gone' });
      assign(c, C, p);
      return answer(true, { call: C.id });
    }
    case 'drop': {
      const C = callOf(c, p); if (!C) return answer(false);
      unpin(c, C); C.st = 'open'; C.by = -1; C.hands = 0; C.t = s.t; C.car = -1; delete C.took; delete C.from; if (p.carry === 'pet') p.carry = null; delete p.beat;
      return answer(true);
    }
    case 'lights': {
      const row2 = s.live.find(r => r.driver === p.id);
      if (!row2 || !s.cars[row2.car]?.van) return answer(false);
      row2.siren = row2.siren ? 0 : 1;
      return answer(true, { lights: row2.siren });
    }
    case 'step': {
      const C = callOf(c, p); if (!C || C.st !== 'scene') return answer(false);
      const st = stepName(c, C), at = targetOf(c, C), reach = H.car >= 0 ? k.carReachMeters : k.reachMeters;
      if (st === 'pull' || st === 'stand') return answer(false);
      if (st === 'clinic' && H.car >= 0) { /* you can hand them in from the kerb */ }
      if (s.t - (H.swung ?? -99) < 2) return answer(false);
      if (!at || dist(H.x, H.z, at.x, at.z) > (st === 'home' || st === 'clinic' ? k.reachMeters * 3 : st === 'witness' || st === 'other' || (st === 'talk' && C.who < 0) ? k.reachMeters * 2.5 : reach)) return answer(false, { far: true });
      if (st === 'book') { const how = ['ticket', 'warn', 'arrest'].includes(cmd.how) ? cmd.how : null; if (!how || (how === 'arrest' && !row(c, C).arrest && !C.ran)) return answer(false); }
      H.swung = s.t;
      const name = st;
      arrived(c, C, p, at);
      p.beat.credit += secsOf(c, st);
      doStep(c, C, p, { how: cmd.how, q: Math.max(0, Math.min(1, Number(cmd.q) || 0)) });
      return answer(true, { step: name });
    }
    default: return refuse('no such verb');
  }
}

// ---- played on shift: the same hourly pay, at the hands-on rate, for what got done

/** The sim's time so far goes on its side of the call. */
export function lawTaken(c, p) { const q = p.beat; if (q) { q.sim += c.s.t - q.from; q.from = c.s.t; const C = callOf(c, p); if (C) { C.hands = 1; C.took = c.s.t; C.st = 'scene'; C.from = null; C.reached = 1; } } }
/** Handed back in the middle of a call: from where they stand, the sim carries on with the next step. */
export function backToBeat(c, p, h) {
  const q = p.beat, C = callOf(c, p); if (!q) return false;
  if (!C) { delete p.beat; return false; }
  q.from = c.s.t;
  const near = nearestPlace(c, h.x, h.z).place;
  p.trip = null; p.at = near.id; p.since = c.s.t; p.wpos = [h.x, h.z]; p.task = null;
  c.startAct(c, p, c.actionById.police_work, p.at, c.s.t + c.clock.ticks(720));
  p.wake = p.act.until;
  C.st = 'scene'; C.next = c.s.t + c.clock.seconds(secsOf(c, stepName(c, C) ?? 'look')); C.car = -1;
  return true;
}
/** Handed back: what the call has earned so far goes with the duty. */
export function dutyRelease(c, p) { const q = p.beat; if (q?.credit) { (p.duty ||= { heldT: 0, credit: 0 }).credit += q.credit; q.credit = 0; } dutyPay(c, p); }
export function dutyPay(c, p) {
  const d = p.duty; if (!d) return;
  delete p.duty;
  const job = p.job ? c.jobById[p.job] : null; if (!job?.beat) return;
  const held = d.heldT / c.clock.tps, hands = c.clock.hours(c.clock.seconds(Math.min(d.credit, held)));
  if (hands <= 0 && d.heldT <= 0) return;
  const { pay, played } = payShift(c, p, job, 0, { handsHours: hands, handsRate: c.k.work.handsPay });
  log(c, 'wage', { who: p.id, job: job.id, pay, played, hands: Math.round(hands * 10) / 10, heldHours: Math.round(c.clock.hours(d.heldT) * 10) / 10 });
  say(c, 'duty.paid', { who: p.id, owner: p.hold?.owner, pay, hands: hands > 0, heldHours: c.clock.hours(d.heldT), handsHours: hands });
}
function stepDuty(c) {
  const s = c.s, sec = c.clock.tps;
  for (const id of s.held) {
    const p = s.people[id], job = p.job ? c.jobById[p.job] : null;
    if (!job?.beat) continue;
    if (!onShiftNow(c, p) && !p.beat && !p.fg) { if (p.duty) dutyPay(c, p); continue; }
    const d = (p.duty ||= { heldT: 0, credit: 0 });
    d.heldT += sec;
    // nothing on the radio counts as worked. Something on it and you are standing about: that time is yours, not the job's
    const quiet = job.beat === 'rift' ? wardenCalls(c) === 0 && !p.fg : !s.law.calls.some(C => C.st === 'open' && !row(c, C).quiet && (row(c, C).job ?? 'officer') === p.job) && !p.beat;
    if (quiet) d.credit += 1;
    else lawRiftCredit(c, p, d);
  }
}

export function stepLaw(c) {
  const s = c.s, cl = c.clock, t = s.t;
  if (t % cl.ticks(60) === 0) { rollLaw(c); if (t % cl.ticksPerDay === (cl.tickAt(1, c.k.stories.hour * 60) % cl.ticksPerDay)) dailyPets(c); }
  if (t % cl.tps) return;
  if (s.law.calls.length) for (const C of [...s.law.calls]) if (s.law.calls.includes(C)) stepCall(c, C);
  if (s.held.length) stepDuty(c);
}

// ---- what the page gets, and what the audit asks

export function lawView(c) {
  const s = c.s, out = [];
  for (const C of s.law.calls) {
    if (row(c, C).quiet) continue;
    const at = targetOf(c, C), st = stepName(c, C);
    out.push({ id: C.id, k: C.k, st: C.st, by: C.by, place: C.place, who: C.who, other: C.other, x: Math.round(C.x * 10) / 10, z: Math.round(C.z * 10) / 10, step: st, n: C.step, of: row(c, C).steps.length, tx: at ? Math.round(at.x * 10) / 10 : null, tz: at ? Math.round(at.z * 10) / 10 : null, run: C.run, ran: C.ran ?? 0, stood: C.stood ?? 0, lit: C.lit ?? 0, pin: C.pin, ...(C.pet ? { pet: C.pet } : null), ...(C.k === 'fender' && C.st !== 'closed' ? { debris: 1 } : null), job: row(c, C).job ?? 'officer', arrest: row(c, C).arrest ? 1 : 0, urgent: row(c, C).urgent ? 1 : 0, fine: row(c, C).fine + (C.amount ?? 0) });
  }
  return out;
}
export function lawProblems(c, fail) {
  const s = c.s;
  for (const C of s.law.calls) {
    if (C.st !== 'open' && !(C.by >= 0)) fail(`call ${C.id} is out with nobody on it`);
    if (C.by >= 0 && s.people[C.by].beat?.id !== C.id) fail(`call ${C.id}: officer ${C.by} is not on it`);
  }
  for (const p of s.people) {
    if (p.beat && !callOfId(c, p.beat.id)) fail(`person ${p.id} is on a call that has gone`);
    if (p.act?.a === 'police_work' && !p.beat && !p.hold) fail(`person ${p.id} is on no call`);
    if ((p.act?.a === 'questioned' || p.act?.a === 'flee') && !s.law.calls.some(C => C.who === p.id)) fail(`person ${p.id} is being questioned about nothing`);
  }
}
