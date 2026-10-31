// What a person is doing, and what they do next. One state for every detail level:
//   p.at     place id, or -1 while travelling
//   p.trip   { mode:'walk', route, from, to, start, end } or { mode:'drive', id, from, to }; never a stored position
//   p.act    { a: action id, place, start, until, slot, with? }
//   p.goal   what they are travelling to do
//   p.wake   the tick they next need attention
// A detail level only changes HOW OFTEN somebody is looked at and HOW the next action is picked, never what is stored,
// so moving between levels has nothing to lose or duplicate: "in transit, arrives 17:42" is the same record at L2 and L0.

import { inWindow, nextClock } from './clock.js';
import { say, log } from './log.js';
import { settle, addMoodlet } from './needs.js';
import { isOpen, slotUsers, slotFree } from './places.js';
import { rand, pick } from './rng.js';
import { canSpend, charge, payShift } from './economy.js';
import { meet, nudge } from './feelings.js';
import { startDrive } from './traffic.js';
import { claimSlot, claimFloor, lineUp, releaseSpot, spotRow } from './spots.js';
import { roomLight } from './wiring.js';
import { clockIn, clockOut, chainOf, runWake } from './work.js';
import { finishStir, stirStarted } from './stir.js';
import { fireWake, fireThink } from './fire.js';
import { fxOf, minutesFor, wontDo, costFor } from './quirks.js';
import { raceTouch } from './racemood.js';
import { foeAt, isFoe, h01 } from './social.js';
import { meetDone } from './threads.js';
import { spellOrder } from './spells.js';
import { dressForAct, dressToLeave } from './wardrobe.js';

export const NEVER = 2147483647;

// ---- travel estimates and the schedule

const walkTicks = (c, metres) => c.clock.ticks(c.k.travel.minWalkMinutes) + Math.round(metres / c.k.travel.walkSpeed * c.clock.tps);

/** How long this person's trip between two places should take, in ticks. Schedules are worked back from this. */
export function travelTicks(c, p, fromId, toId) {
  if (fromId === toId) return 0;
  const from = c.places[fromId], to = c.places[toId], metres = c.roads.distance(from.node, to.node), tr = c.k.travel;
  const walk = walkTicks(c, metres);
  if (metres <= tr.walkPreferMeters) return walk;
  const parking = c.clock.ticks(tr.parkingMinutes);
  const drive = Math.round(c.roads.route(from.node, to.node).seconds * c.k.traffic.driveSlack * c.clock.tps) + parking;
  if (p.car >= 0) return drive;
  return metres > tr.walkMaxMeters ? drive + c.clock.ticks(tr.taxiWaitMinutes) : walk;
}

/** Wake, bed: worked back from the commute, so a far job means an earlier alarm. Run again whenever a job changes. */
export function buildSchedule(c, p) {
  const k = c.k.schedule, jitter = (rand(c.s) * 2 - 1) * k.jitterMinutes, late = fxOf(c, p).wakeShift ?? 0;
  let wake = k.defaultWakeMinute + jitter + late;     // a night owl's whole day starts later, as far as the job lets it
  if (p.job && p.work >= 0) {
    const job = c.jobById[p.job], start = job.shifts[p.shift][0] * 60;
    const commute = travelTicks(c, p, p.home, p.work) * c.clock.minPerTick;
    const backed = start - commute - k.leaveBufferMinutes - k.morningMinutes;
    // Late-afternoon shifts keep a normal morning; early and night shifts set the alarm by the shift.
    wake = (start >= 660 && start < 1200) ? Math.min(wake, backed) : backed + Math.min(0, jitter);
  }
  const w = ((Math.round(wake) % 1440) + 1440) % 1440;
  p.sch = { wake: w, bed: (w - k.sleepHours * 60 + 1440) % 1440 };
}

export const isWorkDay = (job, p, day) => { const [on, off] = job.days; return ((day + p.dayOffset) % (on + off)) < on; };

/** The next shift this person can still usefully attend from where they are: { start, end, leave } in ticks, or null. */
export function nextShift(c, p) {
  if (!p.job) return null;
  const job = c.jobById[p.job], [a, b] = job.shifts[p.shift], t = c.s.t, today = c.clock.day(t);
  const travel = travelTicks(c, p, p.at >= 0 ? p.at : p.home, p.work);
  const lead = travel + c.clock.ticks(c.k.schedule.leaveBufferMinutes), min = c.clock.ticks(c.k.schedule.minShiftMinutes);
  for (let d = today - 1; d <= today + 8; d++) {
    if (!isWorkDay(job, p, d)) continue;
    const start = c.clock.tickAt(d, a * 60), end = c.clock.tickAt(b > a ? d : d + 1, b * 60);
    if (end - Math.max(t + travel, start) < min) continue;
    return { start, end, leave: start - lead };
  }
  return null;
}

// ---- starting and ending

export function endTrip(c, p) {
  const trip = p.trip;
  p.trip = null;
  p.at = trip.to;
  p.since = c.s.t;
}

/** Called by traffic when a car reaches the end of its route. */
export function carArrived(c, p) { endTrip(c, p); p.wake = c.s.t; }

/** Set off for a place to do something there. */
function travel(c, p, to, goal) {
  const from = p.at, t = c.s.t, tr = c.k.travel;
  const a = c.places[from], b = c.places[to], metres = c.roads.distance(a.node, b.node);
  dressToLeave(c, p, from, goal);
  p.goal = goal;
  p.at = -1;
  p.since = t;
  const h = c.s.households[p.household];
  const car = c.s.cars[p.car];
  const carHere = car && car.at === from;
  // A car left somewhere that isn't home always comes back with its driver.
  if (carHere && (metres > tr.walkPreferMeters * (fxOf(c, p).walkPrefer ?? 1) || from !== h.home)) { car.at = -1; startDrive(c, p, a, b, from, to, car.id); p.wake = NEVER; return; }
  if (metres > tr.walkMaxMeters && h.money >= tr.taxiFare) {
    charge(c, h, tr.taxiFare, 'travel');
    startDrive(c, p, a, b, from, to, -1);
    p.wake = NEVER;
    return;
  }
  const end = t + Math.max(1, walkTicks(c, metres));
  p.trip = { mode: 'walk', route: `${a.node}>${b.node}`, from, to, start: t, end };
  p.wake = end;
}

export function finishAct(c, p) {
  const act = p.act;
  if (!act) return;
  settle(c, p);
  const t = c.s.t, a = c.actionById[act.a];
  if (act.slot) {
    const users = slotUsers(c, act.place, act.slot), i = users.indexOf(p.id);
    if (i >= 0) users.splice(i, 1);
  }
  releaseSpot(c, act);
  const placeRec = c.places[act.place], row = spotRow(placeRec, act.spot);
  if (row && ![...c.occ[act.place].keys()].some(k => spotRow(placeRec, k)?.room === row.room)) roomLight(c, p, placeRec, row, false);   // last out turns the light off
  p.act = null;
  p.since = t;
  afterAct(c, p, a, act);
  if (a.id === 'work') {
    const job = c.jobById[p.job], worked = Math.min(t, act.until) - act.start;
    payShift(c, p, job, worked);
    swapNumbers(c, p, c.staff[p.work]);
  } else if (a.id === 'home_block' || a.id === 'morning') {
    swapNumbers(c, p, c.s.households[p.household].members);
  }
  if (a.id === 'site_work') {
    if (p.sh?.keep) p.sh.keep = false; else clockOut(c, p);       // taken over or out on a run: the shift stays open
  }
  if (a.id === 'chat' && act.lead && act.meet !== undefined) meetDone(c, act.meet);
  else if (a.id === 'chat' && act.lead && act.stir) finishStir(c, p, act);
  else if (a.id === 'chat' && act.with >= 0 && act.lead) {
    const other = c.s.people[act.with], tone = meet(c, p, other, c.k.feelings.chatGain);
    say(c, 'talk', { a: p.id, b: other.id, tone });
    if (tone === 'quarrel') log(c, 'quarrel', { a: p.id, b: other.id, place: act.place });
    const fx = fxOf(c, p);
    if (fx.recruit && canBeOrdered(c, other) && !other.orders.length && h01(`gym/${c.s.seed}/${p.id}/${other.id}/${c.clock.day(c.s.t)}`) < fx.recruit) { other.orders.push({ kind: 'use', action: 'gym' }); say(c, 'recruited', { who: p.id, other: other.id }); }
  }
}

/** What a quirk or a race makes of an action that just ended. */
function afterAct(c, p, a, act) {
  raceTouch(c, p, a.id);
  const fx = c.fx[p.id]; if (!fx) return;
  const more = fx.after?.[a.id];
  if (more) for (const [need, v] of Object.entries(more)) { const i = c.needIds.indexOf(need); if (i >= 0) p.n[i] = Math.min(1, p.n[i] + v); }
  const near = fx.housemate?.[a.id];
  if (near) for (const id of c.s.households[p.household].members) if (id !== p.id && c.s.people[id].at === p.at) addMoodlet(c, c.s.people[id], `heard_${a.id}`, near[0], near[1]);
  if (fx.tips && a.cost && c.staff[act.place]) for (const id of c.staff[act.place]) if (c.s.people[id].at === act.place) { nudge(c, c.s.people[id], p.id, 'like', fx.tips); nudge(c, c.s.people[id], p.id, 'known', 1); break; }
}

/** Background people trade small numbers rather than conversations. */
function swapNumbers(c, p, group) {
  if (!group || group.length < 2 || rand(c.s) > c.k.feelings.backgroundChance) return;
  const other = pick(c.s, group);
  if (other !== p.id) meet(c, p, c.s.people[other], c.k.feelings.backgroundGain);
}

export function startAct(c, p, a, place, until, extra = null) {
  const t = c.s.t, placeRec = c.places[place];
  if (a.slot) slotUsers(c, place, a.slot).push(p.id);
  if (a.cost) { const h = c.s.households[p.household]; charge(c, h, costFor(c, p, a.cost), a.tags?.includes('treat') ? 'treats' : 'food'); }
  // indoors or out: some things go either way (a chat on the step, a coffee on the terrace). A pair decided together comes in `extra`
  const out = a.outdoors || !placeRec.plan || (a.sometimes && (extra?.out ?? rand(c.s) < c.k.autonomy.outdoorChance));
  let spot = null, q;
  if (!out) {
    if (extra?.spot !== undefined) spot = extra.spot;
    else {
      spot = a.slot ? claimSlot(c, p, placeRec, a.slot) : -1;
      if (spot === -1) spot = claimFloor(c, p, placeRec);
      if (spot === -1) q = lineUp(c, placeRec);
    }
  }
  p.act = { a: a.id, place, start: t, until, slot: a.slot || null, ...extra, spot, ...(q === undefined ? null : { q }), ...(a.sometimes ? { out: !!out } : null) };
  dressForAct(c, p, a, place);
  roomLight(c, p, placeRec, spotRow(placeRec, spot), a.slot !== 'bed');
  p.since = t;
  p.wake = until;
  p.last = a.id;
  if (a.id !== 'idle') { (p.diary ||= []).push([t, a.id, place]); if (p.diary.length > c.k.control.diaryCap) p.diary.shift(); }
  if (a.site !== 'home' && a.site !== 'here' && a.id !== 'work') c.s.visits[placeRec.kind] = (c.s.visits[placeRec.kind] || 0) + 1;
  if (p.lv === 0) say(c, 'act', { who: p.id, a: a.id });
}

/** Try to do a goal: walk there first if needed. False means it cannot happen now, so think again. */
function begin(c, p, goal) {
  const a = c.actionById[goal.a], t = c.s.t;
  if (goal.work) return goToWork(c, p, goal.shift);
  if (p.at !== goal.place) { travel(c, p, goal.place, goal); return true; }
  const place = c.places[goal.place];
  if (!isOpen(place, c.clock.minute(t))) return false;
  if (a.slot && !slotFree(c, place, a.slot)) {
    // somebody is in there: wait a little, standing, then try again
    if ((goal.waited ?? 0) >= c.k.autonomy.waitTries) return false;
    const wait = c.clock.ticks(c.k.autonomy.waitMinutes);
    startAct(c, p, c.actionById.idle, p.at, Math.max(t + 1, Math.min(t + wait, goal.until ?? t + wait)));
    p.goal = { ...goal, waited: (goal.waited ?? 0) + 1 };
    return true;
  }
  const until = Math.max(t + 1, goal.until ?? t + c.clock.ticks(minutesFor(c, p, a)));
  const extra = goal.with !== undefined ? { with: goal.with, lead: true } : goal.order ? { ordered: true } : null;
  startAct(c, p, a, goal.place, until, extra);
  return true;
}

function goToWork(c, p, shift) {
  if (c.burning.has(c.places[p.work].building)) return false;      // it is on fire: nobody clocks in
  if (p.at !== p.work) { travel(c, p, p.work, { a: 'work', place: p.work, work: true, shift }); return true; }
  const t = c.s.t, a = c.actionById.work, late = t - shift.start;
  if (late > c.clock.ticks(c.k.schedule.lateGraceMinutes)) {
    log(c, 'late', { who: p.id, minutes: Math.round(late * c.clock.minPerTick) });
    addMoodlet(c, p, 'late', -0.06, 6);
  }
  if (t >= shift.end) return false;
  if (chainOf(c, p)) { clockIn(c, p, shift); startAct(c, p, c.actionById.site_work, p.work, shift.end, null); p.act.start = Math.max(t, shift.start); p.wpos ??= [c.places[p.work].x, c.places[p.work].z]; return true; }
  startAct(c, p, a, p.work, shift.end, null);
  p.act.start = Math.max(t, shift.start);
  return true;
}

// ---- the autonomy pick

function resolveSite(c, p, a, m) {
  if (a.site === 'home') return c.places[p.home];
  if (a.site === 'here') return c.places[p.at];
  const here = c.places[p.at];
  let best = null, bestD = Infinity;
  for (const pl of c.tags.get(a.site) || []) {
    if (!isOpen(pl, m)) continue;
    const d = c.roads.distance(here.node, pl.node);
    if (d < bestD) { bestD = d; best = pl; }
  }
  return best;
}

function findPartner(c, p) {
  const here = p.at;
  for (const o of c.s.people) {
    if (o.id === p.id || o.at !== here || !o.act || o.act.with !== undefined || isFoe(c, p.id, o.id)) continue;
    if (c.actionById[o.act.a].interruptible) return o;
  }
  return null;
}

const belowAll = (c, n, limits) => Object.entries(limits).every(([id, v]) => n[c.needIds.indexOf(id)] < v);

/** RimWorld/Sims scoring: urgency of each need x what this action would give it, minus the trip, plus personality. */
function pickUtility(c, p, deadline) {
  const s = c.s, t = s.t, m = c.clock.minute(t), au = c.k.autonomy, level = au.levels[s.households[p.household].autonomy];
  const h = s.households[p.household], n = p.n, picks = [], power = c.k.needs.urgencyPower;
  const sleepy = inWindow(m, p.sch.bed, p.sch.wake);
  for (const a of c.autoActions) {
    if (wontDo(c, p, a)) continue;
    const place = resolveSite(c, p, a, m);
    if (!place) continue;
    if (a.cost && !(a.site === 'home' || canSpend(c, h, costFor(c, p, a.cost)))) continue;
    if (a.slot && !slotFree(c, place, a.slot)) continue;
    const whole = a.minutes + (a.then ? c.actionById[a.then].minutes : 0);
    const trip = travelTicks(c, p, p.at, place.id), dur = c.clock.ticks(whole);
    if (t + trip + dur > deadline) continue;
    const hours = whole / 60;
    let gain = 0;
    for (let i = 0; i < n.length; i++) {
      if (n[i] >= level.needThreshold || !a.refillArr[i]) continue;
      gain += Math.pow(1 - n[i], power) * Math.min(a.refillArr[i] * hours, 1 - n[i]);
    }
    if (gain <= 0) continue;
    if (a.onlyBelow && !belowAll(c, n, a.onlyBelow)) continue;
    // Going home is never a detour: they have to get there anyway.
    let score = gain - (a.site === 'home' ? 0 : au.travelPenaltyPerHour * c.clock.hours(trip));
    for (const tag of a.tags || []) score += (c.bias[p.id][tag] || 0);
    if (a.id === 'sleep' && sleepy) score += au.bedtimeBonus;
    if (a.site !== 'home' && a.site !== 'here' && foeAt(c, p, place.id)) score -= au.foePenalty;      // they saw who was in there and kept walking
    if (a.needsPartner) { if (!findPartner(c, p)) continue; }
    if (a.id === p.last) score *= 0.5;
    score += rand(s) * au.noise;
    picks.push({ a, place, score });
  }
  if (!picks.length) return { a: 'idle', place: p.at, until: Math.min(t + c.clock.ticks(au.idleMinutes), deadline) };
  picks.sort((x, y) => y.score - x.score || (x.a.id < y.a.id ? -1 : 1));
  const top = picks.slice(0, au.topPicks);
  const min = top[top.length - 1].score, weight = x => x.score - min + 0.01;
  let total = 0;
  for (const x of top) total += weight(x);
  let r = rand(s) * total, chosen = top[0];
  for (const x of top) { r -= weight(x); if (r <= 0) { chosen = x; break; } }
  const goal = { a: chosen.a.id, place: chosen.place.id };
  if (chosen.a.id === 'sleep' && sleepy) goal.until = Math.min(nextClock(c.clock, t, p.sch.wake), deadline);
  if (chosen.a.needsPartner) { goal.with = findPartner(c, p).id; }
  return goal;
}

/** Background people: no scoring, just the day's blocks. Cheap, and they still eat, sleep, spend and go out. */
function pickSchedule(c, p, deadline) {
  const s = c.s, t = s.t, m = c.clock.minute(t), k = c.k.schedule;
  const h = s.households[p.household], day = c.clock.day(t), sch = p.sch;
  const bed = nextClock(c.clock, t, sch.bed);
  if (inWindow(m, sch.bed, sch.wake)) return { a: 'sleep', place: p.home, until: Math.min(nextClock(c.clock, t, sch.wake), deadline) };
  if (p.lastMorning !== day && inWindow(m, sch.wake, sch.wake + k.morningMinutes)) {
    p.lastMorning = day;
    return { a: 'morning', place: p.home, until: Math.min(t + c.clock.ticks(minutesFor(c, p, c.actionById.morning, k.morningMinutes)), deadline) };
  }
  const scale = c.k.autonomy.levels[h.autonomy].outingScale;
  if (rand(s) < k.outingChance * scale) {
    const a = pick(s, c.outings), place = wontDo(c, p, a) ? null : resolveSite(c, p, a, m);
    if (place && !foeAt(c, p, place.id) && canSpend(c, h, a.cost || 0) && (!a.slot || slotFree(c, place, a.slot))) {
      const need = travelTicks(c, p, p.at, place.id) + c.clock.ticks(a.minutes);
      if (t + need < Math.min(deadline, bed)) return { a: a.id, place: place.id };
    }
  }
  const dur = c.clock.ticks(c.actionById.home_block.minutes);
  return { a: 'home_block', place: p.home, until: Math.min(t + dur, deadline, bed) };
}

// ---- orders

function runOrder(c, p) {
  const o = p.orders.shift();
  let goal = null;
  if (o.kind === 'go') goal = { a: 'idle', place: o.place, until: c.s.t + travelTicks(c, p, p.at, o.place) + c.clock.ticks(c.k.autonomy.idleMinutes) };
  else if (o.kind === 'use') goal = { a: o.action, place: o.place ?? resolveSite(c, p, c.actionById[o.action], c.clock.minute(c.s.t))?.id };
  else if (o.kind === 'home') goal = { a: 'idle', place: p.home, until: c.s.t + travelTicks(c, p, p.at, p.home) + c.clock.ticks(c.k.autonomy.idleMinutes) };
  else if (o.kind === 'meet') {
    const M = c.s.social.meets.find(x => x.i === o.i);
    if (!M) return false;
    goal = { a: 'meet_wait', place: M.place, until: M.by + c.clock.ticks(M.g.includes(p.id) ? c.d.social.scenes[M.k].minutes : 5) };
  } else if (o.kind === 'cast') {
    const other = o.person !== undefined ? c.s.people[o.person] : null;
    if (other && other.at !== p.at) { o.tries = (o.tries || 0) + 1; if (o.tries <= c.k.orders.chaseTries && (other.at >= 0 || other.trip)) { p.orders.unshift(o); const to = other.at >= 0 ? other.at : other.trip.to; travel(c, p, to, { a: 'idle', place: to }); return true; } say(c, 'order.failed', { who: p.id, order: o }); return false; }
    if (spellOrder(c, p, o)) say(c, 'order.done', { who: p.id, kind: o.kind }); else say(c, 'order.failed', { who: p.id, order: o });
    return false;
  } else if (o.kind === 'chat' || o.kind === 'stir') {
    const other = c.s.people[o.person];
    if (other.hold || other === p) { say(c, 'order.failed', { who: p.id, order: o }); return false; }   // somebody is playing them: they cannot be cornered
    if (other.at === p.at) { joinChat(c, p, other, o.stir); say(c, 'order.done', { who: p.id, kind: o.kind }); return true; }
    // They are elsewhere: go to them, and look again on arrival. They may have moved on, so give up after a few tries.
    o.tries = (o.tries || 0) + 1;
    if (o.tries <= c.k.orders.chaseTries) {
      p.orders.unshift(o);
      travel(c, p, other.at >= 0 ? other.at : other.trip.to, { a: 'idle', place: other.at >= 0 ? other.at : other.trip.to });
      return true;
    }
  } else if (o.kind === 'work') {
    // Sent in early, they wait at the workplace; the shift itself still starts on time.
    const shift = nextShift(c, p);
    if (shift && c.s.t >= shift.leave - c.clock.ticks(c.k.schedule.earlyMinutes)) { say(c, 'order.done', { who: p.id, kind: o.kind }); return goToWork(c, p, shift); }
    goal = { a: 'idle', place: p.work };
  }
  if (goal) goal.order = true;
  if (goal && goal.place !== undefined && goal.place !== null && begin(c, p, goal)) { say(c, 'order.done', { who: p.id, kind: o.kind }); return true; }
  say(c, 'order.failed', { who: p.id, order: o });
  return false;
}

export function joinChat(c, p, other, stir = null, stage = null) {
  const a = c.actionById.chat, until = c.s.t + c.clock.ticks(stage ? stage.minutes : stir ? c.d.stir.minutes : minutesFor(c, p, a));
  if (!other.hold) finishAct(c, other);
  if (other.at < 0) return;
  // two people talking stand face to face, indoors or out, and go together
  const place = c.places[p.at], out = !place.plan || rand(c.s) < c.k.autonomy.outdoorChance;
  const pair = out ? null : claimFloor(c, p, place, other);
  startAct(c, p, a, p.at, until, { with: other.id, lead: true, out: out || !pair, ...(stir ? { stir } : null), ...(stage ? { meet: stage.meet, stage: stage.stage } : null), ...(pair ? { spot: pair[0] } : null) });
  if (!other.hold) startAct(c, other, a, p.at, until, { with: p.id, out: out || !pair, ...(stage ? { stage: stage.stage } : null), ...(pair ? { spot: pair[1] } : null) });
  if (stir) stirStarted(c, p, other, stir);
}

// ---- the loop

function decide(c, p) {
  const t = c.s.t;
  settle(c, p);
  if (fireThink(c, p)) return;
  while (p.orders.length) if (runOrder(c, p)) return;
  const shift = nextShift(c, p);
  const slow = fxOf(c, p).leaveLate, lost = slow && p.at === p.home && h01(`keys/${c.s.seed}/${p.id}/${c.clock.day(t)}`) < slow.chance ? c.clock.ticks(slow.minutes) : 0;     // the keys were in the fridge
  if (shift && t >= shift.leave + lost && t < shift.end && goToWork(c, p, shift)) return;
  const deadline = shift ? Math.max(shift.leave + lost, t + 1) : NEVER;
  const goal = p.lv === 2 ? pickSchedule(c, p, deadline) : pickUtility(c, p, deadline);
  if (goal.with !== undefined && goal.place === p.at) { joinChat(c, p, c.s.people[goal.with]); if (p.act) return; }
  else if (begin(c, p, goal)) return;
  startAct(c, p, c.actionById.idle, p.at, Math.min(t + c.clock.ticks(c.k.autonomy.idleMinutes), deadline));
}

/** This person's wake tick has come. */
export function wakeUp(c, p) {
  const t = c.s.t;
  if (p.trip) {
    if (p.trip.mode !== 'walk') { p.wake = NEVER; return; }
    if (t < p.trip.end) { p.wake = p.trip.end; return; }
    endTrip(c, p);
  }
  if (fireWake(c, p)) return;
  if (p.run && runWake(c, p)) return;
  if (p.goal) {
    const g = p.goal;
    p.goal = null;
    finishAct(c, p);      // a wait for a busy slot ends here
    // An order given on the way replaces what they set out to do, unless that was itself an order: those run in turn.
    if ((g.order || !p.orders.length) && begin(c, p, g)) return;
  }
  const next = p.act ? c.actionById[p.act.a].then : null;
  finishAct(c, p);
  if (next && !p.orders.length && begin(c, p, { a: next, place: p.at })) return;
  decide(c, p);
}

/** L0/L1 cadence: a critical need may pull someone out of what they are doing. L2 waits for the block to end. */
export function checkNeeds(c, p) {
  if (!p.act || p.trip) return;
  const a = c.actionById[p.act.a];
  if (!a.interruptible) return;
  settle(c, p);
  const n = p.n, crit = c.k.needs.critical;
  for (let i = 0; i < n.length; i++) {
    if (n[i] < crit && !a.refillArr[i]) { p.wake = c.s.t; return; }
  }
}

/** A Direct order lands: what they are doing stops now, unless they are mid-journey or carrying out an earlier order. */
export function orderArrived(c, p) {
  if (!p.trip && !p.act?.ordered) p.wake = c.s.t;
}

export function canBeOrdered(c, p) { return p.orders.length < c.k.orders.max; }
