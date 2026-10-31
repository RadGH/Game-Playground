// The timber chain (PLAN rule 3: both ways). Trees are felled, logs go by hand to the landing and by cart to the mill deck, a saw
// bench turns a log into planks one lever pull at a time, bundles go to the rack and a truck takes them to a lumber yard, where
// homes use them. A person on the job has a TASK, and a task is the same whether the sim or a player is doing it: the sim runs
// steps at a fixed pace, a player's `work` command runs the same step. So a half-cut tree stays half cut when you take over, the
// log on a shoulder is still there when you hand back, and goods are conserved either way (audit.js checks that on every run).
//
//   s.sites = { trees: [{ st, cuts, logs, t, dir, by }], landing, cart: { st, t, load }, deck, benches: [{ log, cuts, out, by }], rack, yards: { placeId: planks }, made: {...} }
//   p.sh    = the open shift { s, e, from, sim, heldT, credit, keep }, ticks; credit in seconds, for held time only
//   p.task  = what they are doing { k, x0, z0, x1, z1, st, en, ref }   p.wpos = [x, z]   p.carry = 'log' | 'bundle' | null   p.bench   p.from = where a load was picked up
//   p.van, car.load, car.base = the timber truck    p.run = { st: 'out' | 'unload' | 'back', yard }
//
// Pay: the sim pays by the hour. A player earns credit for each step, the same seconds the sim would have spent on it, paid at
// handsPay, and never more credit than the time they held the shift. Nothing to do counts as time worked.

import { log, say } from './log.js';
import { rand } from './rng.js';
import { payShift } from './economy.js';
import { startDrive } from './traffic.js';
import { addMoodlet } from './needs.js';

const DOWN = 1, STUMP = 2, STANDING = 0;
const CHAINS = { forest: 'camp', saw: 'mill', haul: 'mill' };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export const siteOf = c => c.town.timber ?? null;
export const chainOf = (c, p) => (p.job ? c.jobById[p.job].chain ?? null : null);
/** The place a chain's people report to. */
export function chainPlace(c, chain) { const id = siteOf(c)?.[CHAINS[chain]]; return id === undefined ? -1 : c.byBuilding.get(id)?.[0] ?? -1; }

export function newSites(c) {
  const T = siteOf(c); if (!T) return null;
  const yards = {};
  for (const pl of c.tags.get('planks') || []) yards[pl.id] = 0;
  return {
    trees: T.trees.map(() => ({ st: STANDING, cuts: 0, logs: 0, t: 0, dir: 0, by: -1 })),
    landing: 0, cart: { st: 0, t: 0, load: 0 }, deck: 0, benches: T.benches.map(() => ({ log: 0, cuts: 0, out: 0, by: -1 })), rack: 0, yards,
    made: { felled: 0, logs: 0, fed: 0, sawn: 0, planks: 0, delivered: 0, used: 0, hands: 0 },
  };
}
export const newTrucks = c => { for (const p of c.s.people) if (chainOf(c, p) === 'haul') addTruck(c, p); };
export function addTruck(c, p) {
  const car = { id: c.s.cars.length, household: p.household, driver: p.id, model: 'semi_truck', at: p.work, base: p.work, load: 0, company: true };
  c.s.cars.push(car); p.van = car.id;
}

// ---- the hours: one open shift per person, split into the sim's time and a player's

export function clockIn(c, p, shift) {
  const t = c.s.t;
  const from = Math.max(t, shift.start);     // early is not paid: the hours start when the shift does
  if (p.sh && p.sh.e === shift.end) { p.sh.from = from; return; }     // back from a hand-back or a run: the same shift carries on
  p.sh = { s: from, e: shift.end, from, sim: 0, heldT: 0, credit: 0, keep: false };
  p.wear = 'work';
  c.s.crew.push(p.id);
  say(c, 'shift.in', { who: p.id });
}
/** The sim's time up to now goes on its side of the shift, or a player's on theirs. Called as control changes hands. */
export function shiftSwitch(c, p, held) {
  const sh = p.sh; if (!sh) return;
  const d = Math.min(c.s.t, sh.e) - sh.from;
  if (d > 0) { if (held) sh.heldT += d; else sh.sim += d; }
  sh.from = c.s.t;
}
export function clockOut(c, p) {
  const sh = p.sh; if (!sh) return;
  shiftSwitch(c, p, !!p.hold);
  const job = c.jobById[p.job], heldSeconds = sh.heldT / c.clock.tps, worked = Math.min(sh.credit, heldSeconds);
  const hands = c.clock.hours(c.clock.seconds(worked));
  const { pay, played } = payShift(c, p, job, sh.sim, { handsHours: hands, handsRate: c.k.work.handsPay });
  putDown(c, p);
  releaseClaims(c, p);
  c.s.crew = c.s.crew.filter(id => id !== p.id);
  delete p.sh; p.task = null;
  if (sh.heldT > 0) log(c, 'wage', { who: p.id, job: job.id, pay, played, hands: Math.round(hands * 10) / 10, heldHours: Math.round(c.clock.hours(sh.heldT) * 10) / 10 });
  say(c, 'shift.out', { who: p.id, pay, hands: hands > 0 });
}
function releaseClaims(c, p) {
  const S = c.s.sites;
  for (const b of S.benches) if (b.by === p.id) b.by = -1;
  if (p.claim >= 0) { const tr = S.trees[p.claim]; if (tr?.by === p.id) tr.by = -1; }
  p.claim = -1; p.bench = -1;
}
/** Whatever is in their arms goes where it was heading: a shift never ends with a log vanishing. */
function putDown(c, p) {
  const S = c.s.sites;
  if (p.carry === 'log') { if (chainOf(c, p) === 'forest') S.landing++; else S.deck++; } else if (p.carry === 'bundle') S.rack += c.k.work.planksPerLog;
  p.carry = null; p.from = null;
}

// ---- one step of the chain, shared by the sim and a player

const treeAt = (c, i) => [siteOf(c).trees[i].x, siteOf(c).trees[i].z];
function cut(c, p, i, amount) {
  const S = c.s.sites, tr = S.trees[i], k = c.k.work;
  tr.cuts += amount;
  c.siteRev++;
  if (tr.cuts < k.cutsPerTree) return false;
  tr.st = DOWN; tr.cuts = 0; tr.t = c.s.t; tr.logs = k.logsPerTree; tr.dir = Math.round(rand(c.s) * 628) / 100; tr.by = -1;
  S.made.felled++; S.made.logs += k.logsPerTree; c.s.output.logs = (c.s.output.logs || 0) + k.logsPerTree;
  if (p.claim === i) p.claim = -1;
  say(c, 'tree.down', { tree: i, who: p.id });
  (p.tally ||= {}).felled = (p.tally.felled || 0) + 1;
  return true;
}
function takeLog(c, p, i) {
  const S = c.s.sites, tr = S.trees[i];
  if (!tr || tr.st !== DOWN || tr.logs <= 0 || p.carry) return false;
  tr.logs--; p.carry = 'log'; p.from = treeAt(c, i);
  if (!tr.logs) { tr.st = STUMP; tr.t = c.s.t; }
  c.siteRev++;
  return true;
}
function leaveAtLanding(c, p) { c.s.sites.landing++; p.carry = null; p.from = null; (p.tally ||= {}).carried = (p.tally.carried || 0) + 1; c.siteRev++; }
/** The cart: what is on the landing goes down the rails to the mill deck. */
function sendCart(c) {
  const S = c.s.sites, k = c.k.work, load = Math.min(S.landing, k.cartCapacity);
  if (S.cart.st !== 0 || load <= 0) return false;
  S.landing -= load; S.cart = { st: 1, t: c.s.t, load }; c.siteRev++;
  say(c, 'cart.sent', { load });
  return true;
}
function takeFromDeck(c, p) { const S = c.s.sites; if (S.deck <= 0 || p.carry) return false; S.deck--; p.carry = 'log'; p.from = siteOf(c).deck; c.siteRev++; return true; }
function feed(c, p, i) {
  const S = c.s.sites, b = S.benches[i];
  if (b.log || p.carry !== 'log') return false;
  b.log = 1; b.cuts = 0; p.carry = null; p.from = null; S.made.fed++; c.siteRev++;
  return true;
}
function pullSaw(c, p, i) {
  const S = c.s.sites, b = S.benches[i], k = c.k.work;
  if (!b.log) return false;
  b.cuts++; b.out++; S.made.planks++; c.s.output.planks = (c.s.output.planks || 0) + 1; c.siteRev++;
  if (b.cuts >= k.planksPerLog) { b.log = 0; b.cuts = 0; S.made.sawn++; (p.tally ||= {}).sawn = (p.tally.sawn || 0) + 1; }
  say(c, 'saw', { bench: i, who: p.id });
  return true;
}
function takeBundle(c, p, i) {
  const S = c.s.sites, b = S.benches[i], n = c.k.work.planksPerLog;
  if (b.out < n || p.carry) return false;
  b.out -= n; p.carry = 'bundle'; p.from = siteOf(c).benches[i].out; c.siteRev++;
  return true;
}
function stack(c, p) { c.s.sites.rack += c.k.work.planksPerLog; p.carry = null; p.from = null; c.siteRev++; }
function loadTruck(c, p) {
  const S = c.s.sites, car = c.s.cars[p.van], n = c.k.work.truckLoad;
  if (!car || car.load > 0 || S.rack < n) return false;
  S.rack -= n; car.load = n; c.siteRev++;
  return true;
}
/** Which yard takes a load: the one with the least in it. */
function yardFor(c) { const S = c.s.sites; let best = -1, least = c.k.work.yardCap - c.k.work.truckLoad + 1; for (const [id, n] of Object.entries(S.yards)) if (n < least) { least = n; best = Number(id); } return best; }
function unloadTruck(c, car, yard) {
  const S = c.s.sites, n = car.load;
  S.yards[yard] = (S.yards[yard] || 0) + n; car.load = 0; S.made.delivered += n; c.siteRev++;
  return n;
}

// ---- the sim doing the job

const go = (c, p, k, to, seconds, ref = null) => {
  const t = c.s.t, w = p.wpos;
  p.task = { k, x0: w[0], z0: w[1], x1: to[0], z1: to[1], st: t, en: t + Math.max(1, c.clock.seconds(seconds)), ref };
  p.since = t;
};
const walk = (c, p, k, to, pace, ref = null) => go(c, p, k, to, dist(p.wpos, to) / pace, ref);
const here = (c, p, to) => dist(p.wpos, to) < c.k.work.reachMeters - 1;
const wait = (c, p) => go(c, p, 'wait', p.wpos, c.k.work.waitSeconds);

function thinkLogger(c, p) {
  const S = c.s.sites, T = siteOf(c), k = c.k.work;
  if (p.carry === 'log') { if (here(c, p, T.landing)) { leaveAtLanding(c, p); return thinkLogger(c, p); } return walk(c, p, 'haul', T.landing, k.carryPace); }
  if (S.cart.st === 0 && S.landing >= k.cartCapacity) { if (here(c, p, T.lever)) return go(c, p, 'send', T.lever, k.pullSeconds); return walk(c, p, 'go', T.lever, k.walkPace); }
  let best = -1, d = Infinity;
  S.trees.forEach((tr, i) => { if (tr.st === DOWN && tr.logs > 0) { const e = dist(p.wpos, treeAt(c, i)); if (e < d) { d = e; best = i; } } });
  if (best >= 0) { if (d < k.reachMeters) return go(c, p, 'pick', treeAt(c, best), k.pickSeconds, best); return walk(c, p, 'go', treeAt(c, best), k.walkPace); }
  if (!(p.claim >= 0) || S.trees[p.claim].st !== STANDING) {
    p.claim = -1;
    let at = -1, near = Infinity;
    S.trees.forEach((tr, i) => { if (tr.st === STANDING && tr.by < 0) { const e = dist(T.landing, treeAt(c, i)); if (e < near) { near = e; at = i; } } });
    if (at < 0) { if (S.landing > 0 && S.cart.st === 0) { if (here(c, p, T.lever)) return go(c, p, 'send', T.lever, k.pullSeconds); return walk(c, p, 'go', T.lever, k.walkPace); } return wait(c, p); }
    p.claim = at; S.trees[at].by = p.id;
  }
  const spot = treeAt(c, p.claim);
  if (dist(p.wpos, spot) < k.reachMeters) return go(c, p, 'cut', spot, k.swingSeconds, p.claim);
  return walk(c, p, 'go', spot, k.walkPace);
}
function thinkSawyer(c, p) {
  const S = c.s.sites, T = siteOf(c), k = c.k.work;
  if (!(p.bench >= 0)) { const i = S.benches.findIndex(b => b.by < 0); if (i < 0) return wait(c, p); p.bench = i; S.benches[i].by = p.id; }
  const b = S.benches[p.bench], B = T.benches[p.bench];
  if (p.carry === 'bundle') { if (S.rack + k.planksPerLog > k.rackCap) return wait(c, p); if (here(c, p, T.rack)) { stack(c, p); return thinkSawyer(c, p); } return walk(c, p, 'haul', T.rack, k.carryPace); }
  if (p.carry === 'log') { if (b.log) return wait(c, p); if (here(c, p, B.infeed)) { feed(c, p, p.bench); return thinkSawyer(c, p); } return walk(c, p, 'haul', B.infeed, k.carryPace); }
  if (b.log) { if (here(c, p, B.lever)) return go(c, p, 'pull', B.lever, k.pullSeconds, p.bench); return walk(c, p, 'go', B.lever, k.walkPace); }
  if (b.out >= k.planksPerLog) { if (here(c, p, B.out)) return go(c, p, 'bundle', B.out, k.pickSeconds, p.bench); return walk(c, p, 'go', B.out, k.walkPace); }
  if (S.deck > 0) { if (here(c, p, T.deck)) return go(c, p, 'fetch', T.deck, k.pickSeconds); return walk(c, p, 'go', T.deck, k.walkPace); }
  return wait(c, p);
}
function thinkDriver(c, p) {
  const S = c.s.sites, T = siteOf(c), k = c.k.work, car = c.s.cars[p.van];
  if (!car) return wait(c, p);
  if (car.at >= 0 && car.at !== p.work) car.at = p.work;      // left at somebody's door: the tow gnome brings it back
  if (car.at !== p.work) return wait(c, p);
  if (car.load > 0) return startRun(c, p);
  if (S.rack >= k.truckLoad) { const at = [T.rack[0] - 2, T.rack[1] + 2]; if (here(c, p, at)) return go(c, p, 'load', at, k.loadSeconds); return walk(c, p, 'go', at, k.walkPace); }
  return wait(c, p);
}
const THINK = { forest: thinkLogger, saw: thinkSawyer, haul: thinkDriver };

function done(c, p, task) {
  const ref = task.ref;
  p.wpos = [task.x1, task.z1];
  switch (task.k) {
    case 'cut': if (c.s.sites.trees[ref].st === STANDING) cut(c, p, ref, 1); break;
    case 'pick': takeLog(c, p, ref); break;
    case 'send': sendCart(c); break;
    case 'pull': pullSaw(c, p, ref); break;
    case 'fetch': takeFromDeck(c, p); break;
    case 'bundle': takeBundle(c, p, ref); break;
    case 'load': loadTruck(c, p); break;
    default: break;
  }
  p.task = null;
}
function stepWorker(c, p) {
  const t = c.s.t;
  if (p.task && t < p.task.en) return;
  if (p.task) done(c, p, p.task);
  if (p.task === null && p.act?.a === 'site_work') THINK[chainOf(c, p)](c, p);
}

/** Where someone is on the site this tick, between the two ends of what they are doing. */
export function workerAt(c, p) {
  const k = p.task, w = p.wpos ?? [0, 0];
  if (!k) return { x: w[0], z: w[1], h: 0 };
  const u = Math.max(0, Math.min(1, (c.s.t - k.st) / Math.max(1, k.en - k.st)));
  return { x: k.x0 + (k.x1 - k.x0) * u, z: k.z0 + (k.z1 - k.z0) * u, h: Math.atan2(k.x1 - k.x0, k.z1 - k.z0) };
}

// ---- the truck run: the driver leaves the shift's work for a while, the shift stays open

function startRun(c, p) {
  const car = c.s.cars[p.van], yard = yardFor(c);
  if (yard < 0) return wait(c, p);
  if (p.sh) p.sh.keep = true;
  shiftSwitch(c, p, false);
  p.wake = c.s.t; p.task = null;
  p.run = { st: 'out', yard };
  c.finishAct(c, p);
  p.goal = null; p.at = -1; car.at = -1; p.since = c.s.t;
  startDrive(c, p, c.places[p.work], c.places[yard], p.work, yard, car.id);
  p.wake = c.never;
  say(c, 'truck.out', { who: p.id, yard, load: car.load });
}
/** A driver on a run has woken: arrived, or finished unloading. True if this took care of them. */
export function runWake(c, p) {
  const r = p.run, s = c.s, car = s.cars[p.van], k = c.k.work;
  if (!r || p.trip) return false;
  if (r.st === 'out' && p.at === r.yard) {
    if (!car || car.at !== p.at) { p.run = null; return false; }       // the truck did not come with them
    r.st = 'unload';
    c.startAct(c, p, c.actionById.unload, p.at, s.t + c.clock.ticks(k.unloadMinutes), null);
    return true;
  }
  if (r.st === 'unload') {
    if (p.act) c.finishAct(c, p);
    if (car?.at === p.at && car.load > 0) unloadTruck(c, car, p.at);
    if (!car || car.at !== p.at) { p.run = null; return false; }
    r.st = 'back';
    const from = p.at;
    p.at = -1; car.at = -1; p.since = s.t;
    startDrive(c, p, c.places[from], c.places[p.work], from, p.work, car.id);
    p.wake = c.never;
    return true;
  }
  p.run = null;
  if (p.sh && s.t >= p.sh.e && p.at === p.work) clockOut(c, p);
  return false;
}

// ---- once a tick

function stepCart(c) {
  const S = c.s.sites, C = S.cart, k = c.k.work, trip = c.clock.seconds(k.cartSeconds), t = c.s.t;
  if (C.st === 1 && t >= C.t + trip && S.deck + C.load <= k.deckCap) { S.deck += C.load; S.cart = { st: 2, t, load: 0 }; c.siteRev++; } else if (C.st === 2 && t >= C.t + trip) { S.cart = { st: 0, t, load: 0 }; c.siteRev++; }
}
function regrow(c) {
  const S = c.s.sites, due = c.clock.ticks(c.k.work.regrowHours * 60);
  for (const tr of S.trees) if (tr.st === STUMP && c.s.t >= tr.t + due) { tr.st = STANDING; tr.t = c.s.t; c.siteRev++; }
}
const nothingToDo = (c, p) => {
  const S = c.s.sites, chain = chainOf(c, p);
  if (p.carry) return false;
  if (chain === 'forest') return !S.trees.some(tr => tr.st !== STUMP) && !S.landing;
  if (chain === 'saw') return !S.deck && !S.benches.some(b => b.log || b.out >= c.k.work.planksPerLog);
  return true;   // the driver's time is the truck: credited by the hour while held
};

export function stepWork(c) {
  const s = c.s;
  if (!s.sites) return;
  const t = s.t;
  stepCart(c);
  if (t % 64 === 0) regrow(c);
  for (const id of s.crew) {
    const p = s.people[id];
    if (p.hold) continue;
    if (p.act?.a === 'site_work') stepWorker(c, p);
  }
  if (t % c.clock.tps === 0) for (const id of s.held) heldBeat(c, s.people[id]);
  for (const id of [...s.crew]) { const p = s.people[id]; if (p.hold && t >= p.sh.e) clockOut(c, p); }
}
/** Once a second, for someone a player runs: walking onto the site in shift time clocks them in; waiting for work counts as work. */
function heldBeat(c, p) {
  const chain = chainOf(c, p);
  if (!chain) return;
  if (p.sh) { if (nothingToDo(c, p) && atSite(c, p.hold.x, p.hold.z)) p.sh.credit += 1; return; }
  if (!atSite(c, p.hold.x, p.hold.z)) return;
  const sh = c.nextShift(c, p);
  if (sh && c.s.t >= sh.start && c.s.t < sh.end) clockIn(c, p, sh);
}
export const atSite = (c, x, z) => { const T = siteOf(c); return !!T && Math.hypot(x - T.centre[0], z - T.centre[1]) < T.radius; };

// ---- being taken and being handed back

/** Before `take` ends their act: where they really are, and the shift held open. Nothing about the job changes. */
export function pauseForTake(c, p) {
  const at = workerAt(c, p);
  p.wpos = [at.x, at.z];
  p.task = null;
  if (p.sh) p.sh.keep = true;
  return at;
}
/** Handed back on the site in shift time: straight back to it, from where they stand. False if not. */
export function backToWork(c, p, h) {
  if (!chainOf(c, p) || !atSite(c, h.x, h.z)) return false;
  const sh = c.nextShift(c, p);
  if (!sh || c.s.t < sh.start || c.s.t >= sh.end) return false;
  p.wpos = [h.x, h.z];
  p.trip = null; p.at = p.work; p.wake = c.s.t;
  return true;
}

// ---- a player's hands: the `work` command. Every verb is the same step the sim runs, from where the browser says they stand.

export function workCommand(c, cmd, refuse) {
  const s = c.s, S = s.sites, p = s.people[cmd.who], owner = cmd.owner ?? 'solo', k = c.k.work, T = siteOf(c);
  if (!S || !p?.hold || p.hold.owner !== owner) return refuse('not yours');
  if (!p.sh && chainOf(c, p) !== null && cmd.verb !== 'load' && cmd.verb !== 'unload') return refuse('not on shift');
  const H = p.hold, at = [H.x, H.z], near = (to, r = k.reachMeters) => dist(at, to) <= r + 0.6;
  const credit = seconds => { if (p.sh) p.sh.credit += seconds; S.made.hands += seconds; };
  const carried = () => { const from = p.from; return from ? 2 * dist(from, at) / k.carryPace + 2 * k.pickSeconds : 0; };
  const answer = (ok, extra = null) => say(c, 'work.done', { who: p.id, owner, verb: cmd.verb, ok, ...extra });
  switch (cmd.verb) {
    case 'swing': {
      const i = cmd.tree, tr = S.trees[i];
      if (!tr || tr.st !== STANDING || !near(treeAt(c, i)) || s.t - (H.swung ?? -99) < k.minSwingTicks) return answer(false);
      H.swung = s.t;
      const q = Math.max(0, Math.min(1, Number(cmd.q) || 0)), amount = q >= k.perfectAt ? k.perfectCut : q >= k.okAt ? 1 : k.poorCut;
      if (tr.by < 0) { tr.by = p.id; p.claim = i; }
      credit(k.swingSeconds * amount);
      const down = cut(c, p, i, amount);
      return answer(true, { tree: i, amount, down });
    }
    case 'pick': {
      if (cmd.tree !== undefined) { if (!near(treeAt(c, cmd.tree)) || !takeLog(c, p, cmd.tree)) return answer(false); return answer(true); }
      if (cmd.bench !== undefined) { if (!near(T.benches[cmd.bench]?.out ?? [1e9, 0]) || !takeBundle(c, p, cmd.bench)) return answer(false); return answer(true); }
      if (!near(T.deck, 5) || !takeFromDeck(c, p)) return answer(false);
      return answer(true);
    }
    case 'drop': {
      const seconds = carried();
      if (p.carry === 'log' && chainOf(c, p) === 'forest') { if (!near(T.landing, 5)) return answer(false); leaveAtLanding(c, p); credit(seconds); return answer(true); }
      if (p.carry === 'log') { const i = cmd.bench; if (i === undefined || !near(T.benches[i].infeed) || !feed(c, p, i)) return answer(false); credit(seconds); return answer(true); }
      if (p.carry === 'bundle') { if (!near(T.rack, 5) || S.rack + k.planksPerLog > k.rackCap) return answer(false); stack(c, p); credit(seconds); return answer(true); }
      return answer(false);
    }
    case 'pull': {
      if (cmd.cart) { if (!near(T.lever) || !sendCart(c)) return answer(false); credit(k.pullSeconds); return answer(true); }
      const i = cmd.bench, B = T.benches[i];
      if (!B || !near(B.lever) || s.t - (H.swung ?? -99) < k.minSwingTicks) return answer(false);
      H.swung = s.t;
      if ((Number(cmd.q) || 0) < k.okAt) return answer(false, { miss: true });     // the log was not lined up: the time is the cost
      if (!pullSaw(c, p, i)) return answer(false);
      credit(k.pullSeconds);
      return answer(true, { bench: i });
    }
    case 'load': {
      if (!near([T.rack[0] - 2, T.rack[1] + 2], 8) || !loadTruck(c, p)) return answer(false);
      credit(k.loadSeconds);
      return answer(true);
    }
    case 'unload': {
      const car = s.cars[p.van], row = s.live.find(r => r.car === p.van);
      if (!car || !row || !car.load) return answer(false);
      const yard = Object.keys(S.yards).map(Number).find(id => dist(at, [c.places[id].x, c.places[id].z]) < 30);
      if (yard === undefined) return answer(false);
      const n = unloadTruck(c, car, yard);
      credit(k.loadSeconds);
      H.to = p.work; if (p.run) p.run = { st: 'back', yard }; 
      return answer(true, { planks: n });
    }
    default: return refuse('no such job');
  }
}

// ---- the planks reach the homes: every bills day each home uses some for repairs, out of a lumber yard

export function useRepairs(c, h) {
  const S = c.s.sites, k = c.k.work;
  if (!S) return { used: 0, short: 0 };
  let need = k.planksPerHome, used = 0;
  const ids = Object.keys(S.yards);
  for (const id of ids) { const n = Math.min(S.yards[id], need); S.yards[id] -= n; need -= n; used += n; if (!need) break; }
  S.made.used += used;
  if (used) c.siteRev++;
  return { used, short: need > 0 ? k.shortFee : 0 };
}

/** Boards for a repair: as many of `want` as the yards hold. Used boards are used boards, whoever used them. */
export function useBoards(c, want) {
  const S = c.s.sites;
  if (!S) return 0;
  let need = want, used = 0;
  for (const id of Object.keys(S.yards)) { const n = Math.min(S.yards[id], need); S.yards[id] -= n; need -= n; used += n; if (!need) break; }
  S.made.used += used;
  if (used) c.siteRev++;
  return used;
}

// ---- what the sim's own audit asks of the chain

export function chainProblems(c, fail) {
  const s = c.s, S = s.sites; if (!S) return;
  const k = c.k.work, m = S.made;
  let lying = 0, carriedLogs = 0, bundles = 0, onBench = 0, cuts = 0, out = 0, inTrucks = 0;
  for (const tr of S.trees) lying += tr.logs;
  for (const p of s.people) { if (p.carry === 'log') carriedLogs++; else if (p.carry === 'bundle') bundles++; }
  for (const b of S.benches) { onBench += b.log; cuts += b.log ? b.cuts : 0; out += b.out; }
  for (const car of s.cars) inTrucks += car.load || 0;
  if (m.logs !== lying + S.landing + S.cart.load + S.deck + carriedLogs + m.fed) fail(`logs do not add up: ${m.logs} made, ${lying} lying, ${S.landing} landing, ${S.cart.load} cart, ${S.deck} deck, ${carriedLogs} carried, ${m.fed} fed`);
  if (m.fed !== m.sawn + onBench) fail(`logs at the saw do not add up: ${m.fed} fed, ${m.sawn} sawn, ${onBench} on a bench`);
  if (m.planks !== m.sawn * k.planksPerLog + cuts) fail(`planks do not match the recipe: ${m.planks} from ${m.sawn} logs and ${cuts} cuts`);
  const yards = Object.values(S.yards).reduce((a, b) => a + b, 0);
  if (m.planks !== out + bundles * k.planksPerLog + S.rack + inTrucks + yards + m.used) fail(`planks went missing: ${m.planks} made, ${out} on benches, ${bundles} bundles, ${S.rack} rack, ${inTrucks} in trucks, ${yards} yards, ${m.used} used`);
  if (m.delivered !== yards + m.used) fail(`deliveries do not add up: ${m.delivered} delivered, ${yards} yards, ${m.used} used`);
  for (const id of s.crew) if (!s.people[id].sh) fail(`person ${id} is on the crew with no shift`);
  for (const p of s.people) if (p.sh && !s.crew.includes(p.id)) fail(`person ${p.id} has a shift but is not on the crew`);
  void addMoodlet;
}
