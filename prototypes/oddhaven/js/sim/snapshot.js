// What the client sees (protocol in worker.js). L0 people every tick, L1 once a second, L2 not at all, and only what
// changed since the last snapshot. A person's action, place and trip are sent when they change; a car is its route id
// plus metres, and the client walks its own rail. The sender's memory lives here, outside the state, so a snapshot can
// never change the game: sending more or fewer of them does not move the state hash.

import { positionOf } from './levels.js';
import { raceMood } from './racemood.js';
import { partnerId } from './social.js';
import { spellChoices, wrongChance } from './spells.js';
import { peekNeeds } from './needs.js';
import { happening } from './happening.js';
import { firesView, burntView } from './fire.js';
import { weatherBits } from './gossip.js';
import { signsView } from './threads.js';
import { lawView } from './law.js';
import { riftsView, fighting } from './rifts.js';

/** The site as the page needs it: [st, cuts, logs, felled at, direction] a tree. */
const siteView = (S, cars) => ({ trees: S.trees.map(tr => [tr.st, tr.cuts, tr.logs, tr.t, tr.dir]), landing: S.landing, cart: S.cart, deck: S.deck, benches: S.benches.map(b => [b.log, b.cuts, b.out, b.by]), rack: S.rack, yards: S.yards, made: S.made, trucks: Object.fromEntries(cars.filter(car => car.company).map(car => [car.id, car.load])) });
const dp1 = v => Math.round(v * 10) / 10;
const dp2 = v => Math.round(v * 100) / 100;

function tripView(trip) {
  if (!trip) return null;
  if (trip.mode === 'walk') return { mode: 'walk', route: trip.route, start: trip.start, end: trip.end, from: trip.from, to: trip.to, ...(trip.ox !== undefined ? { ox: trip.ox, oz: trip.oz } : null) };
  return { mode: trip.mode, id: trip.id, to: trip.to };
}

/** `focus` (a room): what THIS client is looking at, so two players a town apart are not sent each other's streets. Without it, everything near the sim's focus. */
export function createSnapshotter(sim, { focus = null } = {}) {
  const c = sim.context, last = new Map(), sentRoutes = new Set();
  let hadRifts = false, lawSent = '', beat = -Infinity, mechRev = -1, siteRev = -1, nowBeat = -1, nowSent = '', fireRev = -1, burnRev = -1, skyRev = -1, signRev = -1;

  function snapshot(events = []) {
    const s = c.s, t = s.t, people = [], seen = new Set(), bucket = Math.floor(t / c.k.levels.everyTicks), l1Beat = bucket !== beat;   // not t % n: a fast run steps 16 ticks at once and could miss the beat for ever
    beat = bucket;
    const mine = focus?.(), reach = c.k.levels.l1Radius;
    for (const p of s.people) {
      if (p.lv === 2) continue;
      const off = p.lv === 1 && !l1Beat;
      if (off && (!mine || last.has(p.id))) { seen.add(p.id); continue; }
      const pos = positionOf(c, p);
      if (mine && !p.hold && !mine.party.includes(p.id) && !mine.points.some(f => Math.hypot(pos.x - f.x, pos.z - f.z) <= reach)) continue;
      seen.add(p.id);
      if (off) continue;
      const was = last.get(p.id) || {}, row = { i: p.id }, a = p.act ? p.act.a : null, trip = tripView(p.trip);
      const tripKey = trip ? JSON.stringify(trip) : null, x = dp1(pos.x), z = dp1(pos.z), mood = dp2(p.mood);
      if (was.lv !== p.lv) row.lv = p.lv;
      if (was.a !== a) { row.a = a; row.st = p.act ? p.act.start : 0; row.un = p.act ? p.act.until : 0; }
      if (was.at !== p.at) row.at = p.at;
      if (was.tripKey !== tripKey) { row.trip = trip; if (trip?.route) wantRoute(trip.route); }
      if (was.x !== x || was.z !== z) { row.x = x; row.z = z; row.h = dp2(pos.heading); }
      if (was.mood !== mood) row.mood = mood;
      const mw = weatherBits(c, p);
      if (was.mw !== mw) row.mw = mw;
      const stage = p.act?.stage ?? null;
      if (was.stage !== stage) row.stage = stage;
      const w = p.act?.with ?? null;     // who they are talking to, and how they get on (the client writes the words)
      if (was.w !== w) { row.w = w; row.op = w === null ? 0 : p.f[w]?.[1] ?? 0; }
      const ord = p.act?.ordered ? 1 : 0;
      if (was.ord !== ord) row.ord = ord;
      // where indoors: a slot, a place to stand, the line at the door, or outside
      const sp = p.act ? p.act.spot ?? null : null, q = p.act?.q ?? null, out = p.act?.out ? 1 : 0;
      if (was.sp !== sp || was.q !== q || was.out !== out) { row.sp = sp; row.q = q; row.out = out; }
      const hold = p.hold ? `${p.hold.owner}|${p.hold.kind}|${p.hold.car}|${p.hold.seat}|${p.hold.lv ?? 0}|${p.hold.inside ?? -1}` : '';
      if (was.hold !== hold) row.hold = p.hold ? { owner: p.hold.owner, kind: p.hold.kind, car: p.hold.car, seat: p.hold.seat, lv: p.hold.lv ?? 0, inside: p.hold.inside ?? -1 } : null;
      // the job: what they are doing on the site, what they have in their arms
      const tk = p.task ? `${p.task.k}|${p.task.st}` : '', cy = p.carry ?? null, by = p.act?.by ?? null;
      if (was.tk !== tk) row.tk = p.task ? { k: p.task.k, x0: dp1(p.task.x0), z0: dp1(p.task.z0), x1: dp1(p.task.x1), z1: dp1(p.task.z1), st: p.task.st, en: p.task.en, ref: p.task.ref, lv: p.task.lv ?? 0 } : null;
      if (was.cy !== cy) row.cy = cy;
      if (was.by !== by) row.by = by;
      const shift = p.sh ? 1 : 0;
      if (was.sh !== shift) row.sh = shift;
      if (was.we !== p.wear) row.we = p.wear;
      const fg = p.fg ? `${p.fg.hp}|${p.fg.max}|${p.fg.down}|${p.fg.a}|${p.fg.s}|${p.fg.d}|${p.fg.dodge}` : '', hurt = dp1(p.hurt ?? 0), ans = p.beat ? p.beat.id : 0;
      if (was.fg !== fg) row.fg = p.fg ? { hp: p.fg.hp, max: p.fg.max, down: p.fg.down, a: p.fg.a, s: p.fg.s, d: p.fg.d, dodge: p.fg.dodge, r: p.fg.r } : null;
      if (was.hurt !== hurt) row.hurt = hurt;
      if (was.ans !== ans) row.bt = ans;
      if (Object.keys(row).length > 1) people.push(row);
      last.set(p.id, { lv: p.lv, a, at: p.at, tripKey, x, z, mood, w, ord, hold, sp, q, out, tk, cy, by, sh: shift, mw, stage, we: p.wear, fg, hurt, ans });
    }
    const gone = [];
    for (const id of last.keys()) if (!seen.has(id)) { gone.push(id); last.delete(id); }
    const cars = [], points = mine?.points ?? s.focus.points, partyNow = mine?.party ?? s.focus.party, r2 = c.k.levels.l1Radius;
    for (const trip of s.trips) {
      const route = c.roads.byId(trip.route), pos = c.roads.at(route, trip.s);
      const near = points.some(f => Math.hypot(pos.x - f.x, pos.z - f.z) <= r2) || partyNow.includes(trip.driver);
      if (!near) continue;
      wantRoute(trip.route);
      const model = trip.model ?? (trip.car >= 0 ? s.cars[trip.car].model : c.d.people.taxiModel);
      cars.push([trip.id, model, trip.route, dp1(trip.s), dp1(trip.v), trip.state === 'flipped' ? 1 : trip.ghost > t ? 2 : 0, trip.driver, trip.car, (trip.yield ? 1 : 0) + (trip.siren ? 2 : 0)]);
    }
    for (const e of events) { const id = e.route ?? e.live?.route; if (id) wantRoute(id); }
    const live = s.live.map(r => [r.id, r.model, r.x, r.z, r.yaw, r.v, r.driver, r.car, r.owner, r.siren ? 1 : 0]);    // every player's cars, wherever they are: few, and a car is what you hit
    const parked = [];
    s.cars.forEach((car, i) => { if (carSent[i] !== car.at) { carSent[i] = car.at; parked.push([i, car.at, car.model]); } });
    const snap = { type: 'snap', t, day: c.clock.day(t), minute: Math.floor(c.clock.minute(t)), people, gone, cars, live, events };
    if (parked.length) snap.parked = parked;
    if (mechRev !== c.mechRev) { mechRev = c.mechRev; snap.mech = s.mech; }
    if (fireRev !== c.fireRev && l1Beat) { fireRev = c.fireRev; snap.fires = firesView(c); }
    if (burnRev !== c.burnRev && l1Beat) { burnRev = c.burnRev; snap.burnt = burntView(c); }
    // a fight goes every tick, to whoever is near enough to see it; everything else about the law and the rifts once a second
    if (s.rifts.list.length) { const near = fighting(c) && s.rifts.list.some(R => points.some(f => Math.hypot(R.x - f.x, R.z - f.z) < 500)); if (near || l1Beat) snap.rifts = riftsView(c); } else if (hadRifts) snap.rifts = [];
    hadRifts = s.rifts.list.length > 0;
    if (l1Beat) { const text = JSON.stringify(lawView(c)); if (text !== lawSent) { lawSent = text; snap.calls = JSON.parse(text); } }
    if (skyRev !== c.skyRev && l1Beat) { skyRev = c.skyRev; snap.sky = c.sky; }
    if (signRev !== c.signRev && l1Beat) { signRev = c.signRev; snap.signs = signsView(c); }
    if (s.sites && siteRev !== c.siteRev) {       // a few hundred bytes, and only when something on the site moved; far away, once a second
      const T = c.town.timber, near = l1Beat || points.some(f => Math.hypot(T.centre[0] - f.x, T.centre[1] - f.z) < T.radius + 200);
      if (near) { siteRev = c.siteRev; snap.site = siteView(s.sites, s.cars); }
    }
    if (Math.floor(t / 16) !== nowBeat) { nowBeat = Math.floor(t / 16); const now = JSON.stringify(happening(c)); if (now !== nowSent) { nowSent = now; snap.now = JSON.parse(now); } }
    if (pending.size) { snap.routes = Object.fromEntries(pending); pending.clear(); }
    return snap;
  }
  const pending = new Map(), carSent = [];
  function wantRoute(id) {
    if (sentRoutes.has(id)) return;
    sentRoutes.add(id);
    const r = c.roads.byId(id);
    pending.set(id, { points: r.points, length: r.length, cum: r.cum, steps: r.steps.map(st => ({ edge: st.edge, fwd: st.fwd, start: st.start, len: st.len })) });
  }
  /** Forget what was sent: the next snapshot is whole (a new client, or a reconnect). */
  const resend = () => { last.clear(); sentRoutes.clear(); pending.clear(); beat = -Infinity; mechRev = -1; siteRev = -1; fireRev = -1; burnRev = -1; skyRev = -1; signRev = -1; nowBeat = -1; nowSent = ''; lawSent = ''; hadRifts = true; carSent.length = 0; };
  return { snapshot, resend };
}

/** The client's side: apply snapshots to a plain mirror of the visible town. */
export function createMirror() {
  const mirror = { t: 0, day: 0, minute: 0, people: new Map(), cars: [], live: [], routes: new Map(), mech: {}, parked: new Map(), site: null, now: [], fires: [], burnt: {}, sky: [], signs: [], rifts: [], calls: [] };
  mirror.apply = snap => {
    mirror.t = snap.t; mirror.day = snap.day; mirror.minute = snap.minute; mirror.cars = snap.cars; mirror.live = snap.live || [];
    for (const row of snap.people) { const had = mirror.people.get(row.i); if (had) Object.assign(had, row); else mirror.people.set(row.i, { ...row }); }
    for (const id of snap.gone) mirror.people.delete(id);
    if (snap.mech) mirror.mech = snap.mech;
    if (snap.fires) mirror.fires = snap.fires;
    if (snap.rifts) mirror.rifts = snap.rifts;
    if (snap.calls) mirror.calls = snap.calls;
    if (snap.burnt) mirror.burnt = snap.burnt;
    if (snap.sky) mirror.sky = snap.sky;
    if (snap.signs) mirror.signs = snap.signs;
    if (snap.site) mirror.site = snap.site;
    if (snap.now) mirror.now = snap.now;
    if (snap.parked) for (const [car, at, model] of snap.parked) { if (at >= 0) mirror.parked.set(car, { at, model }); else mirror.parked.delete(car); }
    for (const [id, r] of Object.entries(snap.routes || {})) mirror.routes.set(id, r);
    return mirror;
  };
  return mirror;
}

export const personRow = p => ({ id: p.id, van: p.van ?? -1, shift: p.shift, name: p.name, gender: p.gender, race: p.race, look: p.look, age: p.age, traits: p.traits, quirks: p.quirks, household: p.household, home: p.home, job: p.job, work: p.work, retired: p.retired, schedule: p.sch, premade: p.premade ?? null, design: p.design ?? null, voice: p.voice ?? null, wear: p.wear });
export const householdRow = (c, h) => ({ id: h.id, name: h.name, home: h.home, was: h.homeWas ?? null, members: h.members, ties: h.ties, cars: h.cars, carModels: h.cars.map(id => c.s.cars[id].model), autonomy: h.autonomy, premade: h.premade ?? null });

/** Everything that doesn't change, sent once: who lives here and what the buildings and words are. A newcomer arrives as an event. */
export function rosterOf(c) {
  const s = c.s;
  return {
    townId: s.townId, seed: s.seed,
    clock: { ticksPerSecond: c.clock.tps, ticksPerDay: c.clock.ticksPerDay, minutesPerTick: c.clock.minPerTick },
    needs: c.needIds,
    households: s.households.map(h => householdRow(c, h)),
    fireWork: c.k.fire, lawWork: c.k.law, riftWork: c.k.rifts, law: c.d.law, monsters: c.d.monsters, riftSites: c.town.riftSites ?? [],
    people: s.people.map(personRow),
    places: c.places.map(p => ({ id: p.id, building: p.building, unit: p.unit, kind: p.kind, role: p.role, x: p.x, z: p.z, zone: p.zone, slots: p.caps, hours: p.hours, tags: p.tags, name: p.name, lv: p.spotLv ?? 0 })),
    actions: Object.fromEntries(Object.values(c.actionById).map(a => [a.id, { label: a.label, verb: a.verb || a.label, tags: a.tags || [], site: a.site, minutes: a.minutes, cost: a.cost || 0, outdoors: !!a.outdoors }])),
    jobs: Object.fromEntries(Object.values(c.jobById).map(j => [j.id, { title: j.title, skill: j.skill, physical: j.physical, chain: j.chain ?? null, beat: j.beat ?? null, pay: j.payPerHour, shifts: j.shifts }])),
    work: c.k.work,
    stir: Object.fromEntries(Object.entries(c.d.stir.kinds).map(([id, r]) => [id, r.label])),
    quirkLabels: Object.fromEntries(Object.values(c.quirkById).map(q => [q.id, q.label])), scenes: c.d.social.scenes, stirScene: c.d.social.stirScene, spells: c.d.social.spells, raceMoods: Object.fromEntries(Object.entries(c.d.social.raceMoods).map(([id, r]) => [id, r.label])),
    autonomyLevels: Object.keys(c.k.autonomy.levels),
  };
}

/** Who is close enough to cast at: the people in the same place, or within reach of a player. */
function near(c, p) {
  const k = c.k.spells.reachMeters, out = [], me = p.hold ?? (p.at >= 0 ? c.places[p.at] : null);
  if (!me) return out;
  for (const q of c.s.people) {
    if (q === p) continue;
    if (p.hold) { const at = q.hold ?? positionOf(c, q); if (Math.hypot(at.x - me.x, at.z - me.z) <= k && (q.at >= 0 || q.hold)) out.push(q.id); } else if (q.at === p.at) out.push(q.id);
    if (out.length >= 3) break;
  }
  return out;
}

/** The details panel for one person, on request. */
export function inspectPerson(c, id) {
  const s = c.s, p = s.people[id];
  if (!p) return null;
  const h = s.households[p.household], names = c.feelingIds;
  const feelings = Object.entries(p.f).map(([o, row]) => ({ person: Number(o), ...Object.fromEntries(names.map((n, i) => [n, row[i]])) }));
  return {
    id, race: raceMood(c, p), bits: weatherBits(c, p), rel: partnerId(c, id), hushed: p.hu > s.t, spellReady: !(p.sp > s.t), wrong: Math.round(wrongChance(c, p) * 100), spells: spellChoices(c, p, near(c, p)), needs: Object.fromEntries(c.needIds.map((n, i) => [n, dp2(peekNeeds(c, p)[i])])), mood: dp2(p.mood), moodlets: p.moodlets, orders: p.orders,
    act: p.act, at: p.at, trip: p.trip, hurt: p.hurt ?? 0, call: p.call ?? null, beat: p.beat ?? null, duty: p.duty ?? null, rap: p.rap ?? [], permits: p.permits ?? {}, fg: p.fg ?? null, carry: p.carry ?? null, sh: p.sh ?? null, tally: p.tally ?? null, cars: h.cars.map(id => ({ id, model: s.cars[id].model, at: s.cars[id].at })), hold: p.hold ?? null, diary: p.diary ?? [], level: p.lv, shifts: p.shifts, xp: p.xp, money: h.money, bill: h.bill, autonomy: h.autonomy, feelings,
  };
}
