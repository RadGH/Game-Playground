// The Oddhaven sim. Pure and seeded: no clock, no randomness, no DOM, no network (PLAN rule 8), and it imports nothing
// bare, so the same files run in a module Worker, a Node room and node --test.
//
//   const sim = createSim({ seed, data, town });      new world
//   const sim = createSim({ data, town, save });      from sim.save()
//   sim.tick([commands])                              one tick, 1/4 of a real second at 1x
//   sim.drainEvents()                                 what happened since the last call
// See README-sim.md for the full API and worker.js for the protocol.

import { createClock } from './clock.js';
import { createRoads } from './roads.js';
import { buildPlaces } from './places.js';
import { generateResidents, indexStaff } from './residents.js';
import { personRates, peekNeeds } from './needs.js';
import { wakeUp, checkNeeds, orderArrived, canBeOrdered, buildSchedule, nextShift, NEVER, finishAct, startAct } from './people.js';
import { stepTraffic, flipCar, clearCar, buildObstacleIndex } from './traffic.js';
import { updateLevels, positionOf } from './levels.js';
import { runBills } from './economy.js';
import { say } from './log.js';
import { controlCommand, releaseAll } from './control.js';
import { rebuildSpots, freshOcc } from './spots.js';
import { mechCommand, timers } from './wiring.js';
import { hashString } from './rng.js';
import { newSites, newTrucks, stepWork, workCommand, chainPlace, chainOf } from './work.js';
import { setBill } from './economy.js';
import { happening } from './happening.js';
import { phoneOf } from './phone.js';
import { stirOrder } from './stir.js';
import { newFireState, refreshFire, stepFire, fireCommand, startFire, newEngines, ringNow } from './fire.js';
import { stepSheet, printSheet } from './moments.js';
import { stepStories } from './stories.js';
import { newSocial, seedBonds, refreshSocial, stepSocial } from './social.js';
import { stepThreads, stepMeets } from './threads.js';
import { buildFx } from './quirks.js';
import { stepSpells, spellCommand } from './spells.js';
import { stepSky, talkFacts } from './gossip.js';
import { travelTicks } from './people.js';
import { addPerson, editPerson } from './newcomer.js';
import { setWear, WEARS } from './wardrobe.js';
import { newLaw, newVans, stepLaw, lawCommand, permitCommand, startCall } from './law.js';
import { newRifts, refreshRifts, stepRifts, fightCommand, startRift } from './rifts.js';

export const SAVE_VERSION = 9;

/** An older save: everything new starts empty. A v2 save's people are given their real spots when the sim is built (spots.js). */
function upgrade(s) {
  if (s.v === 1) { s.v = 2; s.live = []; s.held = []; s.nextLive = 1; }
  if (s.v === 2) { s.v = 3; s.mech = {}; for (const row of s.slots) { row.fridge ??= []; row.chair ??= []; } }
  if (s.v === 3) { s.v = 4; s.fromV3 = true; }
  if (s.v === 4) { s.v = 5; s.fromV4 = true; s.fire = newFireState(); s.moments = []; s.news = []; s.sheets = []; for (const h of s.households) h.story ??= []; }
  if (s.v === 5) { s.v = 6; s.social = newSocial(); s.fromV5 = true; }
  if (s.v === 6) { s.v = 7; for (const p of s.people) p.wear ??= 'casual'; }
  if (s.v === 7) { s.v = 8; s.guests = []; }
  if (s.v === 8) { s.v = 9; s.law = newLaw(); s.rifts = newRifts(); s.fromV8 = true; }
  return s;
}

/** A v3 save knows nothing of the timber site. The new places go on the end, so nobody's place id moves. Loggers and sawyers go to the real site, and two sawyers take the trucks. */
function fitV3(c) {
  const s = c.s;
  delete s.fromV3;
  while (s.slots.length < c.places.length) s.slots.push({});
  s.sites = newSites(c); s.crew = [];
  for (const h of s.households) { h.mail ??= []; h.book ??= []; }
  let moved = 0;
  for (const p of s.people) {
    if (p.job !== 'logger' && p.job !== 'sawyer') continue;
    if (p.act?.a === 'work') { finishAct(c, p); p.wake = s.t; }     // paid up to now, at the old desk
    if (p.job === 'sawyer' && moved < 2) { p.job = 'timber_driver'; moved++; }
    p.work = chainPlace(c, chainOf(c, p));
    p.shift = Math.min(p.shift, c.jobById[p.job].shifts.length - 1);
    buildSchedule(c, p);
  }
  newTrucks(c);
  for (const h of s.households) setBill(c, h);
}

function buildContext(data, town) {
  const k = data.balance, needIds = data.actions.needs;
  const roads = createRoads(town);
  const { places, byBuilding, byTag } = buildPlaces(town, data.buildings.kinds, roads, data.wiring);
  const actions = data.actions.actions.map(a => ({ ...a, refillArr: needIds.map(id => a.refill?.[id] || 0), interruptible: !!a.interruptible }));
  const c = {
    k, d: data, town, roads, places, byBuilding, tags: byTag, needIds, mechRev: 0, siteRev: 0, occ: [], never: NEVER, finishAct, startAct, nextShift, travelTicks, partner: new Map(), foes: new Map(), booked: new Set(), fx: [], signRev: 0,
    buildingPlans: new Map(places.filter(p => p.plan && p === places.find(q => q.building === p.building)).map(p => [p.building, p.plan])),
    frames: new Map(places.filter(p => p.plan).map(p => [p.building, p.frame])),
    clock: createClock(k.clock),
    actionById: Object.fromEntries(actions.map(a => [a.id, a])),
    autoActions: actions.filter(a => a.auto),
    outings: actions.filter(a => a.outing),
    jobById: Object.fromEntries(data.jobs.jobs.map(j => [j.id, j])),
    raceById: Object.fromEntries(data.people.races.map(r => [r.id, r])),
    traitById: Object.fromEntries(data.people.traits.map(r => [r.id, r])),
    quirkById: Object.fromEntries(data.people.quirks.map(r => [r.id, r])),
    feelingIds: data.people.feelings,
    noRefill: new Float64Array(needIds.length),
    carSeats: { ...k.control.carSeats },
    staff: {}, rates: [], bias: [], out: [], s: null, burning: new Set(), burntSlots: new Map(),
  };
  c.obstaclesByKey = buildObstacleIndex(c);
  return c;
}

/** Things worked out from a person and never saved: decay rates and personality biases. */
function indexPeople(c) {
  c.rates = c.s.people.map(p => personRates(p, c));
  c.fx = c.s.people.map(p => buildFx(c, p));
  c.bias = c.s.people.map(p => {
    const b = {};
    const rows = [...p.traits.map(t => c.traitById[t]), ...p.quirks.map(q => c.quirkById[q])];
    for (const r of rows) for (const [tag, v] of Object.entries(r.bias || {})) b[tag] = (b[tag] || 0) + v;
    return b;
  });
  indexStaff(c);
}

function newState(c, seed) {
  const s = {
    v: SAVE_VERSION, townId: c.town.id, seed, rng: seed | 0, t: 0,
    people: [], households: [], cars: [], trips: [], nextTrip: 1,
    slots: c.places.map(() => ({})), obstacles: [], nextObstacle: 1, junctions: {},
    live: [], held: [], nextLive: 1, mech: {}, crew: [], sites: null, fire: newFireState(), moments: [], news: [], sheets: [], social: newSocial(),
    focus: { points: [], party: [] }, guests: [], law: newLaw(), rifts: newRifts(),
    log: [], output: {}, visits: {}, stats: { trips: 0, resets: 0, billsRun: 0 },
  };
  c.s = s;
  s.sites = newSites(c);
  freshOcc(c);
  generateResidents(c);
  seedBonds(c);
  timers(c, c.clock.minute(0));
  return s;
}

export function createSim({ seed = 1, data, town, save = null }) {
  const c = buildContext(data, town);
  if (save) {
    const parsed = upgrade(typeof save === 'string' ? JSON.parse(save) : save);
    if (parsed.v !== SAVE_VERSION) throw new Error(`save: version ${parsed.v}, this game reads ${SAVE_VERSION}`);
    if (parsed.townId !== town.id) throw new Error(`save: made on town ${parsed.townId}, loaded on ${town.id}`);
    delete parsed.savedAt;
    c.s = parsed;
    if (parsed.fromV3) { while (parsed.slots.length < c.places.length) parsed.slots.push({}); }
    rebuildSpots(c);
    timers(c, c.clock.minute(parsed.t));
  } else newState(c, seed);
  c.reindex = () => indexPeople(c);
  indexPeople(c);
  if (c.s.fromV5) { delete c.s.fromV5; seedBonds(c); for (const p of c.s.people) { if (p.couple >= 0 && p.couple > p.id) c.s.social.bonds.push({ a: p.id, b: p.couple, k: 'dating', t: c.s.t }); delete p.couple; } }
  refreshSocial(c);
  if (c.s.fromV3) { fitV3(c); indexPeople(c); }
  if (c.s.fromV4) { delete c.s.fromV4; newEngines(c); }
  if (c.s.fromV8) { delete c.s.fromV8; newVans(c); }
  refreshFire(c);
  refreshRifts(c);

  const K = c.k, clock = c.clock;

  function command(cmd) {
    const s = c.s, refuse = why => say(c, 'cmd.refused', { cmd: cmd.kind, why });
    const person = id => s.people[id];
    switch (cmd.kind) {
      case 'focus': s.focus = { points: (cmd.points || []).map(f => ({ x: f.x, z: f.z })), party: [...(cmd.party || [])] }; return;
      case 'order': {
        const p = person(cmd.who), o = cmd.order;
        if (!p || !o) return refuse('no such person');
        if (!canBeOrdered(c, p)) return refuse('queue full');
        if (o.kind === 'use' && !c.actionById[o.action]) return refuse('no such action');
        if (o.place !== undefined && !c.places[o.place]) return refuse('no such place');
        if (o.kind === 'go' && o.place === undefined) return refuse('no such place');
        if (o.kind === 'chat' && !person(o.person)) return refuse('no such person');
        if (o.kind === 'stir' && !stirOrder(c, p, o)) return refuse('no such scene');
        if (o.kind === 'work' && !p.job) return refuse('no job');
        if (o.kind === 'cast' && !c.d.social.spells[o.spell]) return refuse('no such spell');
        if (o.kind === 'meet') return refuse('not an order you can give');
        p.orders.push({ ...o });
        orderArrived(c, p);
        return;
      }
      case 'work': workCommand(c, cmd, refuse); return;
      case 'fire': fireCommand(c, cmd, refuse); return;
      case 'cast': spellCommand(c, cmd, refuse); return;
      case 'law': lawCommand(c, cmd, refuse); return;
      case 'fight': fightCommand(c, cmd, refuse); return;
      case 'permit': permitCommand(c, cmd, refuse); return;
      case 'startCall': if (!startCall(c, cmd)) refuse('no such call'); return;      // tests, and a dev server
      case 'startRift': if (!startRift(c, cmd)) refuse('no rift'); return;
      case 'addPerson': addPerson(c, cmd, refuse); return;
      case 'editPerson': editPerson(c, cmd, refuse); return;
      case 'wear': { const p = person(cmd.who); if (!p || !WEARS.includes(cmd.wear) || !cmd.indoors) return refuse('not here'); setWear(c, p, cmd.wear); return; }
      case 'startFire': if (!startFire(c, cmd)) refuse('no fire'); return;        // tests, and the sim's own causes
      case 'printSheet': printSheet(c); return;
      case 'ringNow': if (!ringNow(c, cmd.building)) refuse('no fire'); return;
      case 'cancelOrders': { const p = person(cmd.who); if (p) p.orders = []; return; }
      case 'mailRead': { const h = s.households[cmd.household], m = h?.mail.find(x => x.i === cmd.id); if (m) m.read = 1; return; }
      case 'autonomy': {
        const h = s.households[cmd.household];
        if (!h || !K.autonomy.levels[cmd.level]) return refuse('no such household or level');
        h.autonomy = cmd.level;
        return;
      }
      case 'flipCar': if (!flipCar(c, cmd.trip)) refuse('no such car'); return;
      case 'clearCar': if (!clearCar(c, cmd.trip)) refuse('no such car'); return;
      case 'placeObstacle': {
        const e = c.roads.edgeById(cmd.edge);
        if (!e) return refuse('no such road');
        const id = s.nextObstacle++;
        s.obstacles = [...s.obstacles, { id, edgeIndex: e.i, pos: cmd.pos ?? e.len / 2, len: cmd.len ?? 12, dir: cmd.dir ?? 0 }];
        say(c, 'obstacle', { id });
        return;
      }
      case 'clearObstacle': s.obstacles = s.obstacles.filter(o => o.id !== cmd.id); return;
      default: if (!controlCommand(c, cmd) && !mechCommand(c, cmd)) refuse('unknown command');
    }
  }

  /** A command that blows up is refused, not fatal: in a room it came from someone else's browser, and the town goes on for everybody. */
  function safely(cmd) { try { command(cmd); } catch (e) { say(c, 'cmd.refused', { cmd: cmd?.kind, why: 'bad command', owner: cmd?.owner ?? 'solo', error: String(e?.message ?? e).slice(0, 120) }); } }

  function tick(commands = []) {
    const s = c.s;
    s.t++;
    const t = s.t;
    for (const cmd of commands) safely(cmd);
    if (t % K.levels.everyTicks === 0) updateLevels(c);
    stepTraffic(c);
    stepWork(c);
    stepFire(c);
    stepRifts(c);
    stepLaw(c);
    stepSocial(c);
    stepThreads(c);
    stepMeets(c);
    stepStories(c);
    stepSpells(c);
    stepSky(c);
    stepSheet(c);
    const l0 = K.levels.l0CheckTicks, l1 = K.levels.l1CheckTicks, people = s.people;
    for (let i = 0; i < people.length; i++) {
      const p = people[i];
      if (p.lv < 2 && (t + i) % (p.lv === 0 ? l0 : l1) === 0) checkNeeds(c, p);
      if (p.wake <= t) wakeUp(c, p);
    }
    if (t % clock.ticks(60) === 0) timers(c, clock.minute(t));
    if (t % clock.ticksPerDay === (clock.tickAt(1, 0) % clock.ticksPerDay)) {
      if (clock.day(t) % K.economy.billsEveryDays === 0) { runBills(c); s.stats.billsRun++; }
    }
    return s;
  }

  return {
    get state() { return c.s; },
    get context() { return c; },
    clock, tick,
    get t() { return c.s.t; },
    /** A command between ticks: the one thing that may not wait a quarter of a second is a body changing hands at speed (control.js transfer). Reads and writes the state like any command. */
    apply: cmd => safely(cmd),
    drainEvents() { const e = c.out; c.out = []; return e; },
    hash: () => hashString(JSON.stringify(c.s)),
    save: (now = null) => JSON.stringify({ ...c.s, savedAt: now }),
    /** Run the town forward after time away, background only, capped. */
    catchUp(realMs) {
      releaseAll(c);     // nobody is at the wheel while the town runs on without you
      const max = K.saves.catchUpDays * clock.ticksPerDay;
      const n = Math.min(max, Math.floor(realMs / 1000 * clock.tps));
      const keep = c.s.focus;
      c.s.focus = { points: [], party: [] };
      for (let i = 0; i < n; i++) tick();
      c.s.focus = keep;
      c.out = [];
      return n;
    },
    happening: () => happening(c),
    fires: () => c.s.fire,
    phone: (household, who) => phoneOf(c, household, who),
    facts: (a, b) => talkFacts(c, a, b),
    positionOf: id => positionOf(c, c.s.people[id]),
    needsOf: id => peekNeeds(c, c.s.people[id]),
    routeById: id => c.roads.byId(id),
  };
}
