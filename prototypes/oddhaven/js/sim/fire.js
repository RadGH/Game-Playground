// Fire (PLAN M5). A fire is a list of rooms on a real plan, stepped once a second whoever is looking, so a house nobody has drawn burns
// exactly as one on screen does (the Sims 3 rule). Nothing here reads a detail level or spends the sim's random stream: a start is a hash of
// the hour and the place, and a room's numbers are arithmetic, so the same fire burns the same way at every level.
//
//   s.fire = { next, fires: [F], calls: [C], burnt: { b: { r: { room: 0..1 }, f: { piece: 1 } } }, repairs: [R], stats }
//   F = { id, b, place, cause, who, t0, rooms: { room: { h heat, sm smoke, bn burn, ex exposure, wet, spr, sound } }, alarm, called, jam: [door],
//         hits: { door: n }, call, ext, noCall, rescued, hurt, hands }
//   C = { id, fire, station, engine, st, t, crew: [ids], tank, hooked, hose, hydrant, spot: {x,z,yaw} }
//   p.call = { id, from, sim, heldT, credit, on }   p.legs = the rest of a walk   p.carry = 'hose' | 'person'   p.hurt 0..1   p.wlv = their floor
//
// One crew, two ways (rule 3). hoseOut, hookUp, sprayRoom, forceDoor, lift and setDown are the only steps there are: the sim runs them at a fixed
// pace, a player's `fire` command runs the same ones from where the browser says they stand. So a half-forced door stays half forced, a
// person on a shoulder stays there, and you can take over a firefighter mid-fire and carry on.
//
// Nobody dies here. Someone left inside too long gets out by the skin of their teeth and spends longer at the clinic.
import { log, say } from './log.js';
import { addMoodlet, settle } from './needs.js';
import { nudge } from './feelings.js';
import { charge, earn, payShift, setBill } from './economy.js';
import { startDrive } from './traffic.js';
import { hashString } from './rng.js';
import { toWorld, toLocal, furnChar } from './interior.js';
import { routeInside, outsideDoor } from './interior-nav.js';
import { spotRow, claimFloor, lineUp } from './spots.js';
import { fire as fireThing, mechValue, setMech } from './wiring.js';
import { useBoards } from './work.js';
import { sendMail } from './mail.js';
import { medicWanted } from './law.js';

const SOFT = new Set(['bed1', 'bed2', 'bunk', 'sofa', 'wardrobe', 'shelf', 'rack', 'desk', 'table', 'boxes', 'cabinet']);
const HARD_ROOMS = new Set(['bath', 'wc', 'landing', 'vault', 'garage']);
const KEY_SLOTS = ['bed', 'stove', 'toilet', 'shower'];
const r2 = v => Math.round(v * 100) / 100;
const h01 = text => parseInt(hashString(text), 16) / 4294967296;
const dist = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export const newFireState = () => ({ next: 1, fires: [], calls: [], burnt: {}, repairs: [], stats: { fires: 0, rescues: 0, out: 0, calls: 0, hands: 0 } });

// ---- the building as a fire sees it: cached, never saved

function indexOf(c, b) {
  c.fireIdx ??= new Map();
  let I = c.fireIdx.get(b);
  if (I) return I;
  const plan = c.buildingPlans.get(b), k = c.k.fire, rooms = plan.rooms, n = new Map(rooms.map(r => [r.id, []])), byId = new Map(rooms.map(r => [r.id, r]));
  const link = (a, x, via) => { const l = n.get(a); if (l && !l.some(q => q.id === x)) l.push({ id: x, via }); };
  for (const d of plan.doors) if (d.a !== 'out' && n.has(d.a) && n.has(d.b)) { link(d.a, d.b, 'door'); link(d.b, d.a, 'door'); }
  const touch = (a, b2) => Math.min(a.x1, b2.x1) - Math.max(a.x0, b2.x0), touchZ = (a, b2) => Math.min(a.z1, b2.z1) - Math.max(a.z0, b2.z0);
  for (const a of rooms) for (const q of rooms) {
    if (a === q) continue;
    if (a.lv === q.lv && touch(a, q) > -0.3 && touchZ(a, q) > -0.3 && (touch(a, q) > 0.3 || touchZ(a, q) > 0.3)) link(a.id, q.id, 'wall');
    else if (Math.abs(a.lv - q.lv) === 1 && touch(a, q) > 0.5 && touchZ(a, q) > 0.5) link(a.id, q.id, 'ceiling');
  }
  const walkTo = new Map(rooms.map(r => [r.id, []]));      // where a person can go: doors, and the lift between landings
  for (const d of plan.doors) if (d.a !== 'out' && walkTo.has(d.a) && walkTo.has(d.b)) { walkTo.get(d.a).push(d.b); walkTo.get(d.b).push(d.a); }
  if (plan.lift) { const lands = rooms.filter(r => plan.lift.x > r.x0 - 1 && plan.lift.x < r.x1 + 1 && plan.lift.z > r.z0 - 1 && plan.lift.z < r.z1 + 1); for (const a of lands) for (const q of lands) if (a !== q) walkTo.get(a.id).push(q.id); }
  const fuel = new Map(rooms.map(r => [r.id, k.burnSeconds * (HARD_ROOMS.has(r.kind) ? k.hardRoom : 1) * (0.6 + k.softPiece * plan.furn.filter(f => f.room === r.id && SOFT.has(f.kind)).length)]));
  const doors = plan.doors.filter(d => d.a === 'out' && d.kind !== 'garage');
  I = { plan, n, byId, fuel, walkTo, doors, frame: c.frames.get(b), first: c.places[c.byBuilding.get(b)[0]], places: c.byBuilding.get(b) };
  c.fireIdx.set(b, I);
  return I;
}
const fireOf = (c, id) => c.s.fire.fires.find(f => f.id === id);
const callOf = (c, id) => c.s.fire.calls.find(x => x.id === id);
const worldOf = (I, x, z) => toWorld(I.frame, x, z);
/** The street door, in the world, and a point `out` metres in front of it. */
function doorPoint(c, F, out = 0) { const I = indexOf(c, F.b), q = outsideDoor(I.plan); return worldOf(I, q.x, q.z + out); }
function roomAtPoint(I, lx, lz, lv) { return I.plan.rooms.find(r => r.lv === lv && lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) ?? null; }
const insideFootprint = (I, x, z) => { const q = toLocal(I.frame, x, z); return Math.abs(q.x) <= I.plan.w / 2 && Math.abs(q.z) <= I.plan.d / 2; };
function rectGap(room, x, z) { const nx = Math.max(room.x0, Math.min(room.x1, x)), nz = Math.max(room.z0, Math.min(room.z1, z)); return Math.hypot(x - nx, z - nz); }

/** Rebuilt on load and after every change: which buildings are burning, shut, and which seats are gone. Never saved. */
export function refreshFire(c) {
  const S = c.s.fire;
  c.burning = new Set(S.fires.map(f => f.b));
  c.burntSlots = new Map();
  const shut = new Set(c.burning);
  for (const j of S.repairs) shut.add(j.b);
  for (const pl of c.places) pl.fireShut = shut.has(pl.building) && (pl.role !== 'home' || c.burning.has(pl.building));
  for (const [b, row] of Object.entries(S.burnt)) {
    const plan = c.buildingPlans.get(b); if (!plan) continue;
    const gone = new Set();
    for (const s of plan.slots) if ((row.r[s.room] ?? 0) >= c.k.fire.slotLostAt) gone.add(s.i);
    if (gone.size) c.burntSlots.set(b, gone);
  }
  c.fireRev = (c.fireRev || 0) + 1; c.burnRev = (c.burnRev || 0) + 1;
}

// ---- how a fire starts

/** Every game hour: each place rolls for each way it could catch. A hash of the hour and the place, so no detail level changes it. */
function rollFires(c) {
  const s = c.s, S = s.fire, k = c.k.fire, hour = Math.floor(s.t / c.clock.ticks(60));
  if (S.fires.length >= k.maxFires) return;
  const homeAwake = new Map(), staff = new Map();
  for (const p of s.people) {
    if (p.at < 0 || !p.act) continue;
    const pl = c.places[p.at];
    if (pl.role === 'home' && p.act.a !== 'sleep' && !homeAwake.has(pl.building)) homeAwake.set(pl.building, p.id);
    else if (p.act.a === 'work' && pl.role !== 'home' && !staff.has(pl.building)) staff.set(pl.building, p.id);
  }
  const T = c.town.timber, skip = new Set(T ? [T.camp, T.mill] : []);
  for (const [b, plan] of c.buildingPlans) {
    if (skip.has(b) || c.burning.has(b) || S.burnt[b] || S.repairs.some(j => j.b === b)) continue;
    const roll = why => h01(`${s.seed}/${hour}/${b}/${why}`), who = homeAwake.get(b);
    if (who !== undefined && roll('stove') < k.startPerHour.stove) { const room = plan.slots.find(x => x.kind === 'stove')?.room; if (room) return startFire(c, { building: b, room, cause: 'stove', who }); }
    if (roll('wiring') < k.startPerHour.wiring) return startFire(c, { building: b, cause: 'wiring' });
    if (staff.has(b) && roll('mishap') < k.startPerHour.mishap) return startFire(c, { building: b, cause: 'mishap', who: staff.get(b) });
  }
}

export function startFire(c, { building, room = null, cause = 'wiring', who = -1, noCall = false, jam = null }) {
  const s = c.s, S = s.fire, plan = c.buildingPlans.get(building);
  if (!plan || c.burning.has(building) || S.repairs.some(j => j.b === building)) return null;
  const I = indexOf(c, building), pickRoom = () => { const list = plan.rooms.filter(r => !HARD_ROOMS.has(r.kind)); return (list.length ? list : plan.rooms)[Math.floor(h01(`${s.seed}/${s.t}/${building}`) * (list.length || plan.rooms.length))].id; };
  const first = room && I.byId.has(room) ? room : pickRoom();
  const F = { id: S.next++, b: building, place: I.first.id, cause, who, t0: s.t, rooms: { [first]: { h: c.k.fire.ignite, sm: 0, bn: S.burnt[building]?.r[first] ?? 0, ex: 0, wet: 0 } }, alarm: 0, called: 0, jam: [], hits: {}, call: 0, rescued: 0, hurt: 0, hands: 0, ...(noCall ? { noCall: true } : null) };
  S.fires.push(F); S.stats.fires++;
  // a door the fire has warped, or a shop shut for the night: someone has to break it
  const roll = h01(`${s.seed}/jam/${F.id}/${building}`), unit = plan.doors.filter(d => d.kind === 'flat'), want = jam ?? (roll < c.k.fire.jamShare);
  if (jam === true) for (const d of [...I.doors, ...unit]) { if (!F.jam.includes(d.id)) F.jam.push(d.id); }      // asked for: every way out
  else if (want) { const d = (unit.length ? unit[Math.floor(roll * 97) % unit.length] : null) ?? I.doors[0]; if (d) F.jam.push(d.id); }
  if (plan.shutter && !mechValue(c, building, `door:${plan.shutter}`) && !F.jam.includes(plan.shutter)) F.jam.push(plan.shutter);
  refreshFire(c);
  log(c, 'fire.start', { b: building, place: F.place, cause, who, fire: F.id, hh: householdsAt(c, I) });
  return F;
}
/** Who lives or works in this building: households, for Moments and the paper. */
function householdsAt(c, I) {
  const out = new Set();
  for (const h of c.s.households) if (I.places.includes(h.home)) out.add(h.id);
  for (const id of I.places) for (const w of c.staff[id] || []) out.add(c.s.people[w].household);
  return [...out];
}

// ---- once a second: the rooms

function burnStep(c, F) {
  const k = c.k.fire, I = indexOf(c, F.b), S = c.s.fire, row = (S.burnt[F.b] ||= { r: {}, f: {} });
  let lit = 0;
  for (const r of I.plan.rooms) {
    const R = F.rooms[r.id];
    if (!R) continue;
    if (R.wet > 0) R.wet--;
    if (R.h > 0) {
      lit++;
      const fuel = I.fuel.get(r.id);
      R.h = Math.min(1, R.h + k.grow * (1 - R.bn));
      R.bn = Math.min(1, R.bn + R.h / fuel);
      if (R.bn >= 1) R.h = Math.max(0, R.h - k.dieOff);
      R.sm = Math.min(1, R.sm + k.smokeRate * R.h);
      for (const q of I.n.get(r.id)) {
        const N = (F.rooms[q.id] ||= { h: 0, sm: 0, bn: row.r[q.id] ?? 0, ex: 0, wet: 0 });
        if (N.bn < 1 && N.h <= 0) N.ex += k.spread[q.via] * R.h * (N.wet > 0 ? 0.25 : 1);
      }
      // sprinklers: a wire, fired by heat. Only what the wiring sheet fitted
      if (!R.spr && R.h > 0.4) { R.spr = 1; fireThing(c, F.b, `spr:${r.id}`, 'heat'); }
      if (R.spr === 2) { R.h = Math.max(0, R.h - k.sprinklerRate); R.wet = Math.max(R.wet, 4); }
    } else if (R.ex >= 1 && R.bn < 1 && R.wet <= 0) { R.h = k.ignite; R.ex = 0; say(c, 'fire.room', { fire: F.id, room: r.id }); }
    if (R.bn >= k.scorchAt) { row.r[r.id] = r2(R.bn); for (const f of I.plan.furn) if (f.room === r.id && !row.f[f.id] && R.bn >= furnChar(F.b, f.id)) row.f[f.id] = 1; }
  }
  // smoke goes through doors, and leaks away slowly
  for (const r of I.plan.rooms) {
    const R = F.rooms[r.id];
    if (!R || R.sm <= 0) continue;
    for (const q of I.n.get(r.id)) {
      if (q.via !== 'door') continue;
      const N = (F.rooms[q.id] ||= { h: 0, sm: 0, bn: row.r[q.id] ?? 0, ex: 0, wet: 0 });
      if (N.sm < R.sm) { const flow = (R.sm - N.sm) * k.smokeFlow; R.sm -= flow; N.sm += flow; }
    }
    R.sm = Math.max(0, R.sm - k.smokeVent);
    if (R.sm >= k.alarmAt && !R.sound) { R.sound = 1; if (!(h01(`${c.s.seed}/dead/${F.b}`) < k.deadAlarmShare && c.places[F.place].role === 'home')) fireThing(c, F.b, `alarm:${r.id}`, 'smoke'); }
  }
  return lit;
}

/** Runs off the wires in data/wiring.json (wiring.js passes it on). */
export function fireAct(c, b, act, who) {
  const F = c.s.fire.fires.find(f => f.b === b), k = c.k.fire;
  if (!F) { say(c, 'mech.empty', { building: b, who: who?.id ?? -1, ext: true }); return; }
  if (act.act === 'call') { if (!F.alarm) { F.alarm = c.s.t; log(c, 'fire.alarm', { b, place: F.place, fire: F.id }); } ringIn(c, F); } else if (act.act === 'sprinkle') { const R = F.rooms[act.target]; if (R) R.spr = 2; } else if (act.act === 'extinguish') {
    F.ext = (F.ext || 0) + 1;
    if (F.ext > k.extinguishUses) { say(c, 'mech.empty', { building: b, who: who?.id ?? -1, ext: true }); return; }
    // the room with the most fire on this floor, or the nearest one to the extinguisher
    let best = null;
    for (const r of indexOf(c, b).plan.rooms) { const R = F.rooms[r.id]; if (R?.h > 0 && (!best || R.h > best.h)) best = R; }
    if (best) { best.h = Math.max(0, best.h - k.extinguishHeat); best.wet = Math.max(best.wet, k.wetSeconds / 2); }
    if (who) { log(c, 'fire.extinguisher', { who: who.id, b, fire: F.id }); F.hands = 1; }
  }
}
function ringIn(c, F) {
  if (F.called) return;
  F.called = c.s.t;
  if (!F.noCall) dispatch(c, F);
}

// ---- people in the building: every detail level the same

const peopleIn = (c, I) => c.s.people.filter(p => p.at >= 0 && I.places.includes(p.at) && !p.hold);
function roomOfPerson(c, p, I) {
  const a = p.act; if (!a || a.spot === null || a.spot === undefined || a.spot === -1) return null;
  const row = spotRow(c.places[a.place], a.spot);
  return row?.room ?? null;
}
/** A way to the street, through rooms that are not alight. */
function wayOut(c, F, I, room) {
  const k = c.k.fire, seen = new Set([room]), list = [room], doors = new Set(I.plan.doors.filter(d => d.a === 'out' && d.kind !== 'garage' && !F.jam.includes(d.id)).map(d => d.b));
  while (list.length) {
    const id = list.shift();
    if (doors.has(id)) return true;
    for (const q of I.walkTo.get(id)) { if (seen.has(q)) continue; if ((F.rooms[q]?.h ?? 0) >= k.passHeat) continue; const jam = I.plan.doors.find(d => d.kind === 'flat' && F.jam.includes(d.id) && ((d.a === id && d.b === q) || (d.b === id && d.a === q))); if (jam) continue; seen.add(q); list.push(q); }
  }
  return false;
}
function goOutside(c, p, F) {
  if (p.act) c.finishAct(c, p);
  const place = p.at;
  c.startAct(c, p, c.actionById.watch_fire, place, c.s.t + c.clock.ticks(45));
  say(c, 'fled', { who: p.id, fire: F.id });
}
function goDown(c, p, F, why) {
  const a = p.act, spot = a?.spot, place = p.at;
  if (a) c.finishAct(c, p);
  const keep = spot !== null && spot !== undefined && spot !== -1 && !c.occ[place].has(spot);
  if (keep) c.occ[place].set(spot, p.id);
  c.startAct(c, p, c.actionById.down, place, c.s.t + c.clock.ticks(60), keep ? { spot } : null);
  p.goal = null; p.orders = [];
  if (!F.down?.includes(p.id)) (F.down ||= []).push(p.id);
  log(c, 'trapped', { who: p.id, b: F.b, place: F.place, fire: F.id, why, hh: [p.household] });
}
function reactPeople(c, F, I) {
  const k = c.k.fire, t = c.s.t;
  for (const p of peopleIn(c, I)) {
    const a = p.act;
    if (!a || a.a === 'carried' || a.a === 'fire_work' || a.a === 'watch_fire') continue;
    if (a.spot === null || a.spot === undefined || a.spot === -1) { if (a.a !== 'down') goOutside(c, p, F); continue; }     // already out on the step
    const room = roomOfPerson(c, p, I), R = room ? F.rooms[room] : null, sm = R?.sm ?? 0, heat = R?.h ?? 0;
    if (sm > k.hurtSmoke || heat > 0.5) p.hurt = Math.min(1, (p.hurt || 0) + Math.max(sm, heat) * k.hurtRate);
    if (a.a === 'down') {
      if (p.hurt >= 1) { F.hurt++; freed(c, p, F, null); }       // out by the skin of their teeth
      continue;
    }
    const asleep = a.a === 'sleep' || a.a === 'nap', aware = F.alarm > 0 || sm >= (asleep ? k.wakeSmoke : k.noticeSmoke) || heat > 0;
    if ((p.hurt || 0) >= k.collapseAt) { goDown(c, p, F, 'smoke'); continue; }
    if (!aware) continue;
    if (wayOut(c, F, I, room ?? I.plan.doors.find(d => d.a === 'out').b)) goOutside(c, p, F); else goDown(c, p, F, 'cut off');
  }
  // anyone awake inside who has seen it rings it in; so does the street, sooner or later
  if (!F.called && !F.alarm && (t - F.t0) / c.clock.tps >= k.noticeSeconds) { log(c, 'fire.spotted', { b: F.b, place: F.place, fire: F.id }); ringIn(c, F); }
}

/** Out of the building. `by` = who carried them, or null if they got out on their own. */
function freed(c, p, F, by) {
  const k = c.k.fire;
  if (p.act) c.finishAct(c, p);
  if (F.down) F.down = F.down.filter(id => id !== p.id);
  addMoodlet(c, p, 'fire', -0.14, 20);
  if ((p.hurt || 0) >= k.injuredAt) { F.hurt++; log(c, 'injured', { who: p.id, b: F.b, place: F.place, hh: [p.household] }); toClinic(c, p); } else goOutside(c, p, F);
}

// ---- the clinic: one ambulance, the sim's own trip

function nearestClinic(c, p) {
  let best = null, d = Infinity;
  const from = c.places[p.at >= 0 ? p.at : p.home];
  for (const pl of c.tags.get('clinic') || []) { if (c.burning.has(pl.building)) continue; const e = c.roads.distance(from.node, pl.node); if (e < d) { d = e; best = pl; } }
  return best;
}
export function toClinic(c, p) {
  const clinic = nearestClinic(c, p), s = c.s;
  if (!clinic) return false;
  p.goal = null;
  if (p.at === clinic.id) { startStay(c, p); return true; }
  if (medicWanted(c, p)) return true;
  const from = p.at;
  p.at = -1; p.since = s.t;
  startDrive(c, p, c.places[from], clinic, from, clinic.id, -1);
  const tr = s.trips[s.trips.length - 1];
  tr.model = 'ambulance'; tr.siren = 1;
  p.wake = c.never;
  return true;
}
function startStay(c, p) {
  const k = c.k.fire, h = c.s.households[p.household];
  c.startAct(c, p, c.actionById.clinic_stay, p.at, c.s.t + c.clock.ticks(k.clinicMinutes * (0.5 + (p.hurt || 0))));
  // cover pays the clinic; the household pays what it can spare and no more (rule 4)
  earn(c, h, k.medicalCost, 'insurance'); charge(c, h, k.medicalCost, 'clinic');
  excess(c, h, k.medicalExcess, 'clinic');
  sendMail(c, h, 'clinic', { who: p.id, cost: k.medicalCost, excess: 0 });
}
/** What a household pays out of its own pocket: never more than it has to spare after the next bill. */
export function excess(c, h, amount, reason) {
  const spare = Math.max(0, h.money - h.bill - c.k.economy.spendCushion), a = Math.min(amount, Math.floor(spare / 3));
  if (a > 0) charge(c, h, a, reason);
  return a;
}

// ---- the call

const stations = c => c.places.filter(pl => pl.kind === 'fire_station');
/** The engines: one company vehicle a station, on the end of the cars list. */
export function newEngines(c) {
  const s = c.s;
  for (const pl of stations(c)) {
    const list = s.people.filter(p => p.work === pl.id && p.job === 'firefighter');
    if (!list.length) continue;
    const car = { id: s.cars.length, household: list[0].household, driver: list[0].id, model: 'fire_truck', at: pl.id, base: pl.id, load: 0, company: true, engine: true };
    s.cars.push(car);
    for (const p of list) p.van = car.id;
  }
}
const engineOf = (c, pl) => c.s.cars.find(x => x.engine && x.base === pl.id);
const onShiftNow = (c, p) => { const sh = c.nextShift(c, p); return !!sh && c.s.t >= sh.start && c.s.t < sh.end; };

function dispatch(c, F) {
  const s = c.s, S = s.fire, k = c.k.fire, I = indexOf(c, F.b);
  const busy = new Set(S.calls.map(x => x.station)), list = stations(c).filter(pl => !busy.has(pl.id) && !c.burning.has(pl.building) && engineOf(c, pl)).sort((a, b) => c.roads.distance(a.node, I.first.node) - c.roads.distance(b.node, I.first.node) || a.id - b.id);
  let pick = null, crew = [];
  for (const pl of list) {
    crew = s.people.filter(p => p.work === pl.id && p.job === 'firefighter' && !p.call && ((p.at === pl.id && p.act?.a === 'work') || (p.hold && !F.noHeld && onShiftNow(c, p)))).sort((a, b) => !!b.hold - !!a.hold).map(p => p.id).slice(0, 3);     // anyone being played goes first
    if (crew.length) { pick = pl; break; }
  }
  // nobody on shift anywhere: the nearest station pages its people at home, and they come in
  if (!pick && list.length) {
    pick = list[0];
    crew = s.people.filter(p => p.work === pick.id && p.job === 'firefighter' && !p.call && !p.hold && p.at >= 0 && !p.act?.spot?.lock).sort((a, b) => c.roads.distance(c.places[a.at].node, pick.node) - c.roads.distance(c.places[b.at].node, pick.node) || a.id - b.id).slice(0, 2).map(p => p.id);
    for (const id of crew) { const p = s.people[id]; p.orders = [{ kind: 'go', place: pick.id }]; p.wake = s.t; }
  }
  if (!pick || !crew.length) { F.wait = 1; return null; }
  const engine = engineOf(c, pick), door = doorPoint(c, F, 0), spot = roadSpot(c, door.x, door.z), hyd = nearestHydrant(c, spot.x, spot.z);
  const C = { id: S.next++, fire: F.id, station: pick.id, engine: engine.id, st: 'turnout', t: s.t, crew, tank: k.tankSeconds, hooked: 0, hose: -1, hydrant: hyd, spot };
  S.calls.push(C); S.stats.calls++;
  F.call = C.id; delete F.wait;
  for (const id of crew) { const p = s.people[id]; p.call = { id: C.id, from: s.t, sim: 0, heldT: 0, credit: 0 }; }
  log(c, 'fire.call', { b: F.b, place: F.place, fire: F.id, station: pick.id, crew: [...crew], hh: [...new Set(crew.map(id => s.people[id].household))], cause: F.cause });
  say(c, 'siren', { fire: F.id });
  return C;
}
function nearestHydrant(c, x, z) {
  let best = null, d = c.k.fire.hoseMeters;
  for (const q of c.town.hydrants ?? []) { const e = dist(q[0], q[1], x, z); if (e < d) { d = e; best = q; } }
  return best;
}
/** The nearest point of road: where the engine stops. Worked out once a call, in plain sums on the road's own points. */
function roadSpot(c, x, z) {
  let best = null, d = Infinity;
  for (const e of c.roads.edges) {
    for (let i = 0; i + 1 < e.pts.length; i++) {
      const [ax, az] = e.pts[i], [bx, bz] = e.pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * f, pz = az + dz * f, q = dist(px, pz, x, z);
      if (q < d) { d = q; best = { x: r2(px), z: r2(pz), yaw: r2(Math.atan2(dx, dz)) }; }
    }
  }
  return best ?? { x, z, yaw: 0 };
}

/** Tests: a fire left to grow, then rung in. */
export function ringNow(c, b) { const F = c.s.fire.fires.find(f => f.b === b); if (!F) return false; delete F.noCall; F.called = c.s.t; dispatch(c, F); return true; }

/** The engine leaves. Whoever is ready goes; a player in the crew gets a little longer to reach the cab. */
function stepTurnout(c, C, F) {
  const s = c.s, k = c.k.fire, t = s.t, I = c.places[C.station], since = (t - C.t) / c.clock.tps, giveUp = k.pagedWaitSeconds, car = s.cars[C.engine], ready = C.crew.filter(id => s.people[id].at === C.station && !s.people[id].hold), held = C.crew.filter(id => s.people[id].hold);
  const live = s.live.find(r => r.car === C.engine);
  if (live) {                         // a player has the engine: the crew climb aboard
    for (const id of ready) aboard(c, s.people[id], live, C);
    C.st = 'drive'; C.live = live.id; live.siren = 1;
    log(c, 'engine.out', { fire: F.id, place: F.place, b: F.b, hands: 1 });
    return;
  }
  if (since < k.turnoutSeconds) return;
  if (held.length && since < k.heldWaitSeconds) return;
  if (!ready.length) {
    if (since >= giveUp) {        // nobody came: the call goes to the next station
      for (const id of C.crew) { const p = s.people[id]; if (p.call?.id === C.id) { p.orders = []; delete p.call; } }
      s.fire.calls = s.fire.calls.filter(x => x !== C);
      F.call = 0; F.wait = 1; F.noHeld = 1;       // a player who never came to the engine does not hold up the next crew
    }
    return;
  }
  if (car.at !== C.station) return;
  const driver = s.people[ready[0]];
  for (const id of ready) { const p = s.people[id]; p.goal = null; p.orders = []; if (p.act) c.finishAct(c, p); }
  driver.at = -1; driver.since = t; car.at = -1;
  startDrive(c, driver, I, c.places[F.place], C.station, F.place, car.id);
  const tr = s.trips[s.trips.length - 1];
  tr.siren = 1; driver.wake = c.never;
  tr.riders = ready.slice(1);
  for (const id of tr.riders) { const p = s.people[id]; p.at = -1; p.since = t; p.trip = { mode: 'ride', id: tr.id, to: F.place }; p.wake = c.never; }
  C.st = 'drive';
  log(c, 'engine.out', { fire: F.id, place: F.place, b: F.b });
}
function aboard(c, p, row, C) {
  p.goal = null; p.orders = [];
  if (p.act) c.finishAct(c, p);
  p.at = -1; p.since = c.s.t; p.wake = c.never;
  p.trip = { mode: 'aboard', id: row.id, to: c.s.fire.fires.find(f => f.id === C.fire).place };
}
/** The live engine stops near the fire. */
function liveArrival(c, C, F) {
  const s = c.s, k = c.k.fire, row = s.live.find(r => r.id === C.live || r.car === C.engine);
  if (!row) return;
  const door = doorPoint(c, F);
  if (dist(row.x, row.z, door.x, door.z) > k.arriveMeters || Math.abs(row.v) > 2) return;
  C.spot = { x: r2(row.x), z: r2(row.z), yaw: r2(row.yaw) };
  C.hydrant = nearestHydrant(c, row.x, row.z);
  scene(c, C, F);
  for (const p of s.people) if (p.trip?.mode === 'aboard' && p.trip.id === row.id) { p.trip = null; p.at = F.place; p.wake = s.t; p.since = s.t; onScene(c, p, C, F); }
}
function scene(c, C, F) { if (C.st === 'scene') return; C.st = 'scene'; C.at = c.s.t; log(c, 'engine.there', { fire: F.id, place: F.place, b: F.b, seconds: Math.round((c.s.t - F.called) / c.clock.tps) }); }
function onScene(c, p, C, F) {
  p.wpos = [C.spot.x, C.spot.z]; p.wlv = 0; p.task = null; p.legs = null;
  c.startAct(c, p, c.actionById.fire_work, F.place, c.s.t + c.clock.ticks(720));
  p.wake = p.act.until;
}

/** A crew member has woken: at the fire, in the cab's wake. True if this took care of them. */
export function fireWake(c, p) {
  const s = c.s, C = p.call ? callOf(c, p.call.id) : null;
  if (p.act?.a === 'down' || p.act?.a === 'carried') { p.wake = s.t + c.clock.ticks(60); p.act.until = p.wake; return true; }
  if (C && !p.trip) {
    const F = fireOf(c, C.fire);
    if (p.act?.a === 'fire_work') { if (F) { p.act.until = s.t + c.clock.ticks(720); p.wake = p.act.until; return true; } return false; }
    if (F && p.at === F.place && C.st !== 'back') { scene(c, C, F); onScene(c, p, C, F); return true; }
    if (C.st === 'turnout' && !F?.noSuch && p.at !== C.station) return false;      // paged: on their way in
    if (C.st === 'turnout' && p.at === C.station) { if (p.act) c.finishAct(c, p); c.startAct(c, p, c.actionById.idle, p.at, s.t + c.clock.ticks(4)); return true; }
  }
  return false;
}

/** Called at the top of a person's `decide`. True if the fire decided for them. */
export function fireThink(c, p) {
  if (p.at < 0) return false;
  const here = c.places[p.at], k = c.k.fire;
  if ((p.hurt || 0) >= k.injuredAt) {
    if (here.tags.includes('clinic') && !here.fireShut) { if (p.stayed) { p.hurt = 0; delete p.stayed; log(c, 'discharged', { who: p.id, hh: [p.household] }); addMoodlet(c, p, 'patched', 0.08, 10); return false; } p.stayed = 1; startStay(c, p); return true; }
    if (toClinic(c, p)) return true;
  }
  if (c.burning.has(here.building)) { c.startAct(c, p, c.actionById.watch_fire, p.at, c.s.t + c.clock.ticks(30)); return true; }
  return false;
}

// ---- one step, by whoever

function hoseOut(C, p) { if (C.hose >= 0 || p.carry) return false; C.hose = p.id; p.carry = 'hose'; return true; }
function hookUp(C) { if (C.hooked || !C.hydrant) return false; C.hooked = 1; return true; }
function sprayRoom(c, F, C, roomId, seconds, who) {
  const k = c.k.fire, I = indexOf(c, F.b);
  if (!C.hooked) { if (C.tank <= 0) return { dry: true }; C.tank = Math.max(0, C.tank - seconds); }
  const R = F.rooms[roomId]; if (!R) return { miss: true };
  const was = R.h;
  R.h = Math.max(0, R.h - k.hoseRate * seconds); R.ex = 0; R.wet = k.wetSeconds; R.sm = Math.max(0, R.sm - k.hoseRate * 0.4 * seconds);
  for (const q of I.n.get(roomId)) { const N = F.rooms[q.id]; if (N) N.ex *= 0.8; }
  if (was > 0 && R.h === 0) say(c, 'room.out', { fire: F.id, room: roomId, who });
  c.fireRev++;
  return { was, now: R.h };
}
function forceDoor(c, F, door, amount) {
  if (!F.jam.includes(door)) return false;
  F.hits[door] = (F.hits[door] || 0) + amount;
  if (F.hits[door] < c.k.fire.forceHits) return false;
  F.jam = F.jam.filter(d => d !== door);
  const plan = indexOf(c, F.b).plan;
  if (plan.doors.find(d => d.id === door)?.shutter || plan.shutter === door) setMech(c, F.b, `door:${door}`, 1);
  say(c, 'door.forced', { fire: F.id, door });
  log(c, 'door.forced', { fire: F.id, b: F.b, place: F.place });
  return true;
}
function lift(c, carrier, v) {
  if (carrier.carry || v.act?.a !== 'down') return false;
  const place = v.at;
  c.finishAct(c, v);
  c.startAct(c, v, c.actionById.carried, place, c.s.t + c.clock.ticks(60), { by: carrier.id });
  carrier.carry = 'person'; carrier.bears = v.id;
  return true;
}
function setDown(c, carrier, F) {
  const v = c.s.people[carrier.bears];
  carrier.carry = null; carrier.bears = -1;
  if (!v || v.act?.a !== 'carried') return false;
  F.rescued++; c.s.fire.stats.rescues++;
  const held = !!carrier.hold;
  if (held) { F.hands = 1; c.s.fire.stats.hands++; }
  nudge(c, v, carrier.id, 'trust', 26); nudge(c, v, carrier.id, 'like', 20); nudge(c, v, carrier.id, 'known', 30);
  addMoodlet(c, carrier, 'hero', 0.18, 20);
  log(c, 'rescued', { who: carrier.id, person: v.id, b: F.b, place: F.place, held, hh: [v.household, carrier.household] });
  freed(c, v, F, carrier);
  return true;
}

// ---- the crew doing it

const task = (c, p, k, to, seconds, ref = null) => {
  const t = c.s.t, w = p.wpos;
  p.task = { k, x0: w[0], z0: w[1], x1: to[0], z1: to[1], st: t, en: t + Math.max(1, c.clock.seconds(seconds)), ref, lv: p.wlv ?? 0 };
};
const near = (p, to, r) => dist(p.wpos[0], p.wpos[1], to[0], to[1]) <= r;
/** A walk: round the walls if there are walls in the way. One leg a task. */
function walkTo(c, p, F, to, lv = 0, pace = null) {
  const I = indexOf(c, F.b), k = c.k.fire, here = toLocal(I.frame, p.wpos[0], p.wpos[1]), there = toLocal(I.frame, to[0], to[1]);
  const inA = insideFootprint(I, p.wpos[0], p.wpos[1]), inB = insideFootprint(I, to[0], to[1]), door = outsideDoor(I.plan);
  let pts = null;
  if (inA || inB) pts = routeInside(I.plan, inA ? { x: here.x, z: here.z, lv: p.wlv ?? 0 } : door, inB ? { x: there.x, z: there.z, lv } : door, 0.4);
  p.legs = [];
  if (pts) { if (!inA) { const d = worldOf(I, door.x, door.z); p.legs.push([d.x, d.z, 0]); } for (const q of pts) { const w = worldOf(I, q[0], q[1]); p.legs.push([w.x, w.z, q[2] ?? 0]); } if (!inB) p.legs.push([to[0], to[1], 0]); } else p.legs.push([to[0], to[1], lv]);
  // thin the list: a walk of a hundred grid steps does not need a hundred tasks
  if (p.legs.length > 6) { const step = Math.ceil(p.legs.length / 6), out = p.legs.filter((_, i) => i % step === 0); out.push(p.legs[p.legs.length - 1]); p.legs = out; }
  p.pace = pace ?? (p.carry ? k.carryPace : k.walkPace);
  nextLeg(c, p);
}
function nextLeg(c, p) {
  const q = p.legs.shift();
  if (!p.legs.length) p.legs = null;
  if ((q[2] ?? 0) !== (p.wlv ?? 0)) { p.wlv = q[2]; task(c, p, 'go', [q[0], q[1]], 1.5); return; }      // the lift
  task(c, p, p.carry === 'person' ? 'haul' : 'go', [q[0], q[1]], dist(p.wpos[0], p.wpos[1], q[0], q[1]) / p.pace);
}
/** The burning room nearest the door, walking in. The fire is fought from the street inwards. */
function nextRoom(c, F, I) {
  const start = I.plan.doors.filter(d => d.a === 'out').map(d => d.b), seen = new Set(start), list = [...start];
  while (list.length) {
    const id = list.shift();
    if (F.rooms[id]?.h > 0) return I.byId.get(id);
    for (const q of [...I.walkTo.get(id), ...I.n.get(id).map(x => x.id)]) if (!seen.has(q)) { seen.add(q); list.push(q); }
  }
  for (const r of I.plan.rooms) if (F.rooms[r.id]?.h > 0) return r;
  return null;
}
/** Where to stand to reach a room with the hose: the street if the street will do, else its nearest door. */
function standFor(c, F, I, room) {
  const k = c.k.fire, street = doorPoint(c, F, 1.2), q = toLocal(I.frame, street.x, street.z);
  if (room.lv === 0 && rectGap(room, q.x, q.z) <= k.hoseReach - 1) return { to: [street.x, street.z], lv: 0 };
  const d = I.plan.doors.find(x => x.a !== 'out' && (x.a === room.id || x.b === room.id)) ?? I.plan.doors.find(x => x.b === room.id), w = worldOf(I, d.x, d.z);
  return { to: [w.x, w.z], lv: d.lv ?? 0 };
}
function victim(c, F, p) {
  let best = null, d = Infinity;
  for (const id of F.down || []) {
    const v = c.s.people[id];
    if (v.act?.a !== 'down' || v.claimedBy >= 0 && v.claimedBy !== undefined && v.claimedBy !== p.id && c.s.people[v.claimedBy].act?.a === 'fire_work') continue;
    const at = whereDown(c, v, F); if (!at) continue;
    const e = dist(p.wpos[0], p.wpos[1], at.x, at.z);
    if (e < d) { d = e; best = v; }
  }
  return best;
}
function whereDown(c, v, F) {
  const I = indexOf(c, F.b), row = spotRow(c.places[v.act.place], v.act.spot);
  if (!row) return null;
  const q = worldOf(I, row.sx ?? row.x, row.sz ?? row.z);
  return { x: q.x, z: q.z, lv: row.lv ?? 0, room: row.room };
}

function thinkCrew(c, p, C, F) {
  const k = c.k.fire, I = indexOf(c, F.b), s = c.s, engine = [C.spot.x, C.spot.z];
  if (p.legs) return nextLeg(c, p);
  if (p.carry === 'person') {
    const safe = doorPoint(c, F, k.safeMeters);
    if (near(p, [safe.x, safe.z], 1.4)) { setDown(c, p, F); return task(c, p, 'wait', p.wpos, 0.6); }
    return walkTo(c, p, F, [safe.x, safe.z]);
  }
  const work = C.crew.filter(id => s.people[id].act?.a === 'fire_work' && !s.people[id].hold), mine = work.indexOf(p.id), hoser = C.hose;
  // the first to arrive goes for anyone inside, the next one takes the hose. On your own, the way in comes first
  const free = hoser !== p.id || work.length === 1, v = free ? victim(c, F, p) : null;
  if (v && (work.length === 1 || mine === 0 || hoser >= 0) && (hoser !== p.id || wayOut(c, F, I, whereDown(c, v, F).room))) {
    const at = whereDown(c, v, F);
    if (hoser === p.id) { C.hose = -1; p.carry = null; }       // on your own: the hose goes down, and a person comes first
    if (F.jam.length) { const d = I.plan.doors.find(x => x.id === F.jam[0]), w = worldOf(I, d.x, d.z + (d.a === 'out' ? 0.9 : 0)); if (near(p, [w.x, w.z], 1.6)) return task(c, p, 'force', p.wpos, k.forceSeconds, d.id); return walkTo(c, p, F, [w.x, w.z], d.lv); }
    if (wayOut(c, F, I, at.room)) {
      v.claimedBy = p.id;
      if ((p.wlv ?? 0) === at.lv && near(p, [at.x, at.z], 1.8)) return task(c, p, 'lift', p.wpos, k.liftSeconds, v.id);
      return walkTo(c, p, F, [at.x, at.z], at.lv);
    }
  }
  if (p.carry === 'hose') {
    if (C.tank <= 0 && !C.hooked) return task(c, p, 'wait', p.wpos, k.waitSeconds);
    const room = nextRoom(c, F, I);
    if (!room) return task(c, p, 'wait', p.wpos, k.waitSeconds);
    if (F.jam.length && !(room.lv === 0 && rectGap(room, ...Object.values(toLocal(I.frame, ...p.wpos))) <= k.hoseReach - 1)) { const d = I.plan.doors.find(x => x.id === F.jam[0]), w = worldOf(I, d.x, d.z + (d.a === 'out' ? 0.9 : 0)); if (near(p, [w.x, w.z], 1.6)) return task(c, p, 'force', p.wpos, k.forceSeconds, d.id); return walkTo(c, p, F, [w.x, w.z], d.lv); }
    const stand = standFor(c, F, I, room);
    if (near(p, stand.to, 1.2) && (p.wlv ?? 0) === stand.lv) return task(c, p, 'spray', p.wpos, k.sprayStep, room.id);
    return walkTo(c, p, F, stand.to, stand.lv);
  }
  if (!C.hooked && C.hydrant && (C.hose >= 0 || work.length === 1)) {
    if (near(p, C.hydrant, 2)) return task(c, p, 'hook', p.wpos, k.hookSeconds);
    return walkTo(c, p, F, C.hydrant);
  }
  if (C.hose < 0) {
    if (near(p, engine, 3)) return task(c, p, 'hose', p.wpos, k.hoseSeconds);
    return walkTo(c, p, F, engine);
  }
  return task(c, p, 'wait', p.wpos, k.waitSeconds);
}
function stepCrew(c, C, F) {
  const s = c.s, t = s.t, k = c.k.fire;
  for (const id of C.crew) {
    const p = s.people[id];
    if (p.hold || p.act?.a !== 'fire_work') continue;
    if (p.task && t < p.task.en) continue;
    if (p.task) {
      const K = p.task, ref = K.ref;
      p.wpos = [K.x1, K.z1]; p.task = null;
      if (K.k === 'hose') hoseOut(C, p);
      else if (K.k === 'hook') hookUp(C);
      else if (K.k === 'spray') sprayRoom(c, F, C, ref, k.sprayStep, p.id);
      else if (K.k === 'force') forceDoor(c, F, ref, 1);
      else if (K.k === 'lift') { const v = s.people[ref]; lift(c, p, v); }
    }
    thinkCrew(c, p, C, F);
  }
}

/** Where someone on a fire is, for a player taking them over. */
export function fireTaken(c, p) {
  const v = p.act?.a === 'carried' ? c.s.people[p.act.by] : null;
  if (v) { v.carry = null; v.bears = -1; }      // they wriggle free: being played, they walk
  if (p.bears >= 0 && p.carry === 'person') { /* still on their shoulder: you carry on carrying */ }
  if (p.act?.a === 'down') { const F = c.s.fire.fires.find(f => f.down?.includes(p.id)); if (F) F.down = F.down.filter(id => id !== p.id); }
  if (p.trip?.mode === 'aboard') { p.trip = null; }
  callSwitch(c, p, false);
  if (p.act?.a === 'fire_work') { p.wpos = workerSpot(c, p); p.task = null; p.legs = null; }
}
export function workerSpot(c, p) {
  const k = p.task, w = p.wpos ?? [0, 0];
  if (!k) return w;
  const u = Math.max(0, Math.min(1, (c.s.t - k.st) / Math.max(1, k.en - k.st)));
  return [k.x0 + (k.x1 - k.x0) * u, k.z0 + (k.z1 - k.z0) * u];
}
/** The sim's time so far goes on its side of the call, or a player's on theirs. */
export function callSwitch(c, p, held) {
  const q = p.call; if (!q) return;
  const d = c.s.t - q.from;
  if (d > 0) { if (held) q.heldT += d; else q.sim += d; }
  q.from = c.s.t;
}
/** Handed back on the scene: straight back to work, from where they stand. */
export function backToFire(c, p, h) {
  const C = p.call ? callOf(c, p.call.id) : null, F = C ? fireOf(c, C.fire) : null;
  if (!C || !F || C.st !== 'scene') return false;
  if (dist(h.x, h.z, C.spot.x, C.spot.z) > 90) return false;
  p.trip = null; p.at = F.place; p.since = c.s.t;
  p.wpos = [h.x, h.z]; p.wlv = h.lv ?? 0; p.task = null; p.legs = null;
  c.startAct(c, p, c.actionById.fire_work, F.place, c.s.t + c.clock.ticks(720));
  p.wake = p.act.until;
  return true;
}
/** A driver taken at the wheel with the crew in the back: they stay in the cab, the crew of the engine, not a party. */
export function engineTaken(c, tr, row) {
  if (!tr.siren || tr.car < 0 || !c.s.cars[tr.car].engine) return false;
  const C = c.s.fire.calls.find(x => x.engine === tr.car);
  row.siren = 1;
  if (C) C.live = row.id;
  for (const id of tr.riders || []) { const p = c.s.people[id]; p.trip = { mode: 'aboard', id: row.id, to: tr.to }; p.at = -1; p.wake = c.never; }
  tr.riders = [];
  return true;
}
/** The live engine is handed back on the road: those aboard ride on to the end of its trip. */
export function engineBack(c, row, trip) {
  if (!c.s.cars[row.car]?.engine) return;
  const riders = c.s.people.filter(p => p.trip?.mode === 'aboard' && p.trip.id === row.id);
  trip.siren = row.siren ? 1 : 0;
  if (riders.length) { trip.riders = [...(trip.riders || []), ...riders.map(p => p.id)]; for (const p of riders) p.trip = { mode: 'ride', id: trip.id, to: trip.to }; }
  const C = c.s.fire.calls.find(x => x.engine === row.car);
  if (C) delete C.live;
}

// ---- a player's hands: every verb is a step above, from where the browser says they stand

export function fireCommand(c, cmd, refuse) {
  const s = c.s, p = s.people[cmd.who], owner = cmd.owner ?? 'solo', k = c.k.fire;
  if (!p?.hold || p.hold.owner !== owner) return refuse('not yours');
  const C = p.call ? callOf(c, p.call.id) : null, F = C ? fireOf(c, C.fire) : null, H = p.hold;
  const answer = (ok, extra = null) => say(c, 'fire.done', { who: p.id, owner, verb: cmd.verb, ok, ...extra });
  if (!C || !F) return answer(false);
  const credit = n => { p.call.credit += n; F.hands = 1; };
  const I = indexOf(c, F.b), door = doorPoint(c, F);
  switch (cmd.verb) {
    case 'hose': {
      if (dist(H.x, H.z, C.spot.x, C.spot.z) > 7) return answer(false);
      if (C.hose === p.id) { p.carry = null; C.hose = -1; return answer(true, { back: true }); }
      if (C.hose >= 0) { const q = s.people[C.hose]; if (q.hold) return answer(false); q.carry = null; C.hose = -1; }     // the crew hand it over
      if (p.carry || !hoseOut(C, p)) return answer(false);
      credit(k.hoseSeconds);
      return answer(true);
    }
    case 'hook': {
      if (!C.hydrant || dist(H.x, H.z, C.hydrant[0], C.hydrant[1]) > 3.5 || !hookUp(C)) return answer(false);
      credit(k.hookSeconds);
      return answer(true);
    }
    case 'spray': {
      if (p.carry !== 'hose') return answer(false);
      const since = (s.t - (H.sprayed ?? s.t - 4)) / c.clock.tps, secs = Math.min(1, Math.max(0, Math.min(Number(cmd.secs) || 0, since)));
      H.sprayed = s.t;
      const room = I.byId.get(cmd.room), q = toLocal(I.frame, H.x, H.z);
      if (!room || rectGap(room, q.x, q.z) > k.hoseReach + 1.5) return;
      const r = sprayRoom(c, F, C, room.id, secs, p.id);
      if (!r.dry) credit(secs);
      if (r.dry) answer(false, { dry: true });
      return;
    }
    case 'force': {
      const d = I.plan.doors.find(x => x.id === cmd.door), w = d && worldOf(I, d.x, d.z);
      if (!d || dist(H.x, H.z, w.x, w.z) > 3.2 || s.t - (H.swung ?? -99) < 2) return answer(false);
      H.swung = s.t;
      const q = Math.max(0, Math.min(1, Number(cmd.q) || 0)), amount = q >= c.k.work.perfectAt ? 1.5 : q >= c.k.work.okAt ? 1 : 0.5;
      credit(k.forceSeconds * amount / 1);
      const done = forceDoor(c, F, d.id, amount);
      return answer(true, { door: d.id, done, amount });
    }
    case 'lift': {
      const v = s.people[cmd.person];
      if (!v || v.act?.a !== 'down') return answer(false);
      const at = whereDown(c, v, F);
      if (!at || dist(H.x, H.z, at.x, at.z) > 2.6 || (H.lv ?? 0) !== at.lv) return answer(false);
      if (p.carry === 'hose') { C.hose = -1; p.carry = null; }      // the hose goes down while your arms are full
      if (!lift(c, p, v)) return answer(false);
      credit(k.liftSeconds);
      return answer(true);
    }
    case 'drop': {
      if (p.carry !== 'person' || insideFootprint(I, H.x, H.z) || dist(H.x, H.z, door.x, door.z) < 2) return answer(false);
      const from = dist(door.x, door.z, H.x, H.z);
      if (!setDown(c, p, F)) return answer(false);
      credit(8 + from / k.carryPace);
      return answer(true, { rescued: true });
    }
    default: return refuse('no such verb');
  }
}

// ---- when it is out: who pays, who moves, what gets mended

function closeCall(c, C, F) {
  const s = c.s, k = c.k.fire, car = s.cars[C.engine], job = c.jobById.firefighter;
  C.st = 'back';
  for (const id of [...C.crew]) {
    const p = s.people[id];
    if (!p.call || p.call.id !== C.id) continue;
    callSwitch(c, p, !!p.hold);
    const q = p.call, held = q.heldT / c.clock.tps, hands = c.clock.hours(c.clock.seconds(Math.min(q.credit, held)));
    const { pay, played } = payShift(c, p, job, q.sim, { handsHours: hands, handsRate: c.k.work.handsPay });
    if (q.heldT > 0) log(c, 'wage', { who: p.id, job: job.id, pay, played, hands: Math.round(hands * 10) / 10, heldHours: Math.round(c.clock.hours(q.heldT) * 10) / 10 });
    say(c, 'call.done', { who: p.id, pay, hands: hands > 0, owner: p.hold?.owner });
    delete p.call;
    if (p.carry === 'hose') p.carry = null;
    if (p.carry === 'person') { const v = s.people[p.bears]; if (v) setDown(c, p, F); }
    p.task = null; p.legs = null;
  }
  // the crew go back in the engine, or under their own steam if a player has it
  const sim = C.crew.filter(id => { const p = s.people[id]; return p.act?.a === 'fire_work' || p.trip?.mode === 'aboard'; }).map(id => s.people[id]), at = F.place;
  const live = s.live.find(r => r.car === C.engine);
  for (const p of sim) { if (p.trip?.mode === 'aboard') { p.trip = null; p.at = F.place; p.since = s.t; p.wake = s.t; } else c.finishAct(c, p); }
  void k;
  if (!live && car.at === at && sim.length) {
    const d = sim[0];
    d.at = -1; d.since = s.t; car.at = -1;
    startDrive(c, d, c.places[at], c.places[C.station], at, C.station, car.id);
    const tr = s.trips[s.trips.length - 1];
    d.wake = c.never;
    tr.riders = sim.slice(1).map(p => p.id);
    for (const p of sim.slice(1)) { p.at = -1; p.since = s.t; p.trip = { mode: 'ride', id: tr.id, to: C.station }; p.wake = c.never; }
  } else {
    for (const p of sim) p.wake = s.t;
    if (!live && car.at === at) car.at = C.station;        // the tow gnome takes it back, on the county
  }
  s.fire.calls = s.fire.calls.filter(x => x !== C);
}

function fireOut(c, F) {
  const s = c.s, S = s.fire, k = c.k.fire, I = indexOf(c, F.b), row = S.burnt[F.b] ?? { r: {}, f: {} }, C = F.call ? callOf(c, F.call) : null;
  // anyone still down gets carried out by the neighbours
  for (const id of [...(F.down || [])]) { const v = s.people[id]; if (v.act?.a === 'down') freed(c, v, F, null); }
  for (const p of s.people) if (p.act?.a === 'watch_fire' && I.places.includes(p.act.place)) { p.wake = Math.min(p.wake, s.t + c.clock.ticks(10)); p.act.until = p.wake; }
  if (C) { if (C.st === 'scene' || C.st === 'drive' || C.st === 'turnout') closeCall(c, C, F); }
  S.fires = S.fires.filter(f => f !== F);
  S.stats.out++;
  const rooms = Object.keys(row.r), lost = rooms.filter(r => row.r[r] >= k.lostAt), all = I.plan.rooms.length;
  if (!rooms.length) { delete S.burnt[F.b]; refreshFire(c); log(c, 'fire.out', { b: F.b, place: F.place, cause: F.cause, rooms: 0, lost: 0, all, rescued: F.rescued, hurt: F.hurt, hands: F.hands, seconds: Math.round((s.t - F.t0) / c.clock.tps), fire: F.id, hh: householdsAt(c, I) }); return; }
  const cost = Math.round(rooms.reduce((n, r) => n + row.r[r] * k.roomCost, 0)), homes = s.households.filter(h => I.places.includes(h.home)), moved = [];
  for (const h of homes) {
    const pl = c.places[h.home], mine = I.plan.rooms.filter(r => r.unit === null || r.unit === undefined || r.unit === (pl.unit ?? 0) || !I.plan.units.length), bad = mine.filter(r => (row.r[r.id] ?? 0) >= k.lostAt);
    if (!mine.some(r => row.r[r.id])) continue;
    const share = Math.round(cost / homes.length);
    earn(c, h, share, 'insurance'); charge(c, h, share, 'repairs');
    const paid = excess(c, h, k.excess, 'repairs');
    const lostKey = KEY_SLOTS.some(kind => { const list = pl.spots[kind] || []; return list.length && list.every(i => (row.r[I.plan.slots[i].room] ?? 0) >= k.slotLostAt); });
    const moves = lostKey || bad.length / Math.max(1, mine.length) >= k.rehouseShare;
    sendMail(c, h, 'insurance', { place: F.place, cost: share, excess: paid, rooms: rooms.length, moved: moves });
    if (moves) { const to = rehouse(c, h); if (to) moved.push(h.id); }
    for (const id of h.members) { const p = s.people[id]; addMoodlet(c, p, 'house_fire', -0.16, 30); }
  }
  S.repairs.push({ b: F.b, rooms, boards: rooms.length * k.boardsPerRoom, got: 0, done: 0, from: s.t + c.clock.ticks(k.repairStartHours * 60), hours: 0, cost });
  refreshFire(c);
  log(c, 'fire.out', { b: F.b, place: F.place, cause: F.cause, rooms: rooms.length, lost: lost.length, all, rescued: F.rescued, hurt: F.hurt, hands: F.hands, seconds: Math.round((s.t - F.t0) / c.clock.tps), fire: F.id, hh: householdsAt(c, I), moved });
}

/** Somewhere to stay until the repairs are done: the nearest empty home. Rent there is what the county charges anyway (rule 4). */
function rehouse(c, h) {
  const s = c.s, taken = new Set(); for (const q of s.households) { if (q.members.length) taken.add(q.home); if (q.homeWas !== undefined) taken.add(q.homeWas); }
  let best = null, d = Infinity;
  const was = c.places[h.home];
  for (const pl of c.places) { if (pl.role !== 'home' || taken.has(pl.id) || c.burning.has(pl.building) || s.fire.burnt[pl.building]) continue; const e = c.roads.distance(was.node, pl.node); if (e < d) { d = e; best = pl; } }
  // nothing empty: the family that can spare the most beds takes them in
  if (!best) for (const q of [...s.households].sort((x, y) => x.members.length - y.members.length || c.roads.distance(was.node, c.places[x.home].node) - c.roads.distance(was.node, c.places[y.home].node))) { const pl = c.places[q.home]; if (q !== h && !s.fire.burnt[pl.building] && !c.burning.has(pl.building) && q.homeWas === undefined && q.members.length + h.members.length <= (pl.caps.bed ?? 6)) { best = pl; break; } }
  if (!best) return null;
  moveHome(c, h, best);
  h.homeWas = was.id;
  log(c, 'rehoused', { household: h.id, place: was.id, to: best.id, hh: [h.id], who: h.members[0] });
  say(c, 'home.moved', { household: h.id, home: best.id });
  return best;
}
/** Mend (spells.js): a room's scorch is knocked back. Scorch that goes takes that room's boards off the bill. False: nothing here to mend. */
export function mendRoom(c, b, amount, room = null) {
  const k = c.k.fire, S = c.s.fire, row = S.burnt[b]; if (!row) return null;
  const list = Object.entries(row.r).filter(([, v]) => v < k.lostAt).sort((x, y) => y[1] - x[1]);
  const pick = room !== null && row.r[room] !== undefined ? [room, row.r[room]] : list[0] ?? Object.entries(row.r)[0];
  if (!pick) return null;
  const [id, was] = pick, now = was - amount;
  c.burnRev++;
  if (now >= k.scorchAt) { row.r[id] = now; return { room: id, gone: false }; }
  delete row.r[id];
  for (const f of indexOf(c, b).plan.furn) if (f.room === id) delete row.f[f.id];
  for (const j of S.repairs) { if (j.b !== b) continue; const i = j.rooms.indexOf(id); if (i >= j.done) { j.rooms.splice(i, 1); j.boards = Math.max(j.got, j.boards - k.boardsPerRoom); j.cost = 0; } }
  return { room: id, gone: true };
}
export function moreBoards(c, b, n) { for (const j of c.s.fire.repairs) if (j.b === b) j.boards += n; }

function moveHome(c, h, to) {
  const s = c.s, was = h.home;
  h.home = to.id;
  for (const id of h.members) s.people[id].home = to.id;
  for (const id of h.cars) if (s.cars[id].at === was) s.cars[id].at = to.id;
  setBill(c, h);
}

/** On the hour: the crew mends what they have boards for, a room at a time. A town out of boards waits, then the county buys in. */
function stepRepairs(c) {
  const s = c.s, S = s.fire, k = c.k.fire;
  for (const j of [...S.repairs]) {
    if (s.t < j.from) continue;
    j.hours++;
    const got = useBoards(c, Math.min(k.boardsPerHour, j.boards - j.got));
    j.got += got;
    if (got) j.dry = 0; else j.dry = (j.dry || 0) + 1;
    if (j.dry >= k.shortWaitHours && j.got < j.boards) { j.bought = (j.bought || 0) + (j.boards - j.got); j.got = j.boards; }
    const done = Math.min(j.rooms.length, Math.floor(Math.min(j.got / k.boardsPerRoom, j.hours / k.repairHoursPerRoom)));
    const row = S.burnt[j.b];
    while (j.done < done) { const r = j.rooms[j.done++]; delete row.r[r]; for (const f of indexOf(c, j.b).plan.furn) if (f.room === r) delete row.f[f.id]; c.burnRev++; }
    if (j.done >= j.rooms.length) {
      delete S.burnt[j.b];
      S.repairs = S.repairs.filter(x => x !== j);
      const I = indexOf(c, j.b), place = I.first.id;
      for (const h of s.households) if (h.homeWas !== undefined && I.places.includes(h.homeWas)) { const home = c.places[h.homeWas]; delete h.homeWas; moveHome(c, h, home); say(c, 'home.moved', { household: h.id, home: home.id }); log(c, 'home.again', { household: h.id, place: home.id, hh: [h.id], who: h.members[0] }); }
      log(c, 'repaired', { b: j.b, place, boards: j.boards, bought: j.bought || 0, hh: householdsAt(c, I) });
      refreshFire(c);
    }
  }
}

export function stepFire(c) {
  const s = c.s, S = s.fire, t = s.t;
  if (t % c.clock.ticks(60) === 0) { rollFires(c); stepRepairs(c); }
  if (!S.fires.length && !S.calls.length) return;
  if (S.calls.length) for (const C of [...S.calls]) { const F = fireOf(c, C.fire); if (F && C.st === 'scene') stepCrew(c, C, F); }
  for (const id of s.held) { const p = s.people[id]; if (p.carry === 'person' && p.hold.lv !== undefined) { /* carried by a player: the browser moves them */ } }
  if (t % c.clock.tps) return;
  for (const F of [...S.fires]) {
    const I = indexOf(c, F.b), C = F.call ? callOf(c, F.call) : null;
    if (F.wait && !F.noCall) dispatch(c, F);
    if (C?.st === 'turnout') stepTurnout(c, C, F); else if (C?.st === 'drive' && s.live.some(r => r.car === C.engine)) liveArrival(c, C, F);
    const lit = burnStep(c, F);
    reactPeople(c, F, I);
    c.fireRev++; c.burnRev++;
    if (!lit && !Object.values(F.rooms).some(R => R.ex >= 1 && R.bn < 1 && R.wet <= 0)) fireOut(c, F);
  }
}

// ---- what the page gets, and what the audit asks

export function firesView(c) {
  const s = c.s, S = s.fire;
  return S.fires.map(F => {
    const I = indexOf(c, F.b), C = F.call ? callOf(c, F.call) : null;
    const rooms = []; for (const r of I.plan.rooms) { const R = F.rooms[r.id]; if (R && (R.h > 0 || R.sm > 0.02)) rooms.push([r.id, r2(R.h), r2(R.sm), r2(R.bn)]); }
    const down = []; for (const id of F.down || []) { const v = s.people[id]; if (v.act?.a !== 'down') continue; const at = whereDown(c, v, F); if (at) down.push([id, at.room, at.lv, r2(at.x), r2(at.z)]); }
    return { id: F.id, b: F.b, place: F.place, cause: F.cause, t0: F.t0, alarm: F.alarm, called: F.called, jam: F.jam, hits: F.hits, rooms, down, call: C ? { st: C.st, tank: Math.round(C.tank), hooked: C.hooked, hose: C.hose, hydrant: C.hydrant, spot: C.spot, engine: C.engine, crew: C.crew, station: C.station, live: C.live ?? null } : null };
  });
}
export const burntView = c => c.s.fire.burnt;

export function fireProblems(c, fail) {
  const s = c.s, S = s.fire;
  for (const F of S.fires) if (!c.burning.has(F.b)) fail(`fire ${F.id}: ${F.b} is not on the burning list`);
  for (const C of S.calls) {
    if (!fireOf(c, C.fire)) fail(`call ${C.id} has lost its fire`);
    if (C.hose >= 0 && s.people[C.hose].carry !== 'hose') fail(`call ${C.id}: the hose is with someone not holding it`);
  }
  for (const p of s.people) {
    if (p.carry === 'person' && s.people[p.bears]?.act?.a !== 'carried') fail(`person ${p.id} is carrying nobody`);
    if (p.act?.a === 'carried' && s.people[p.act.by]?.bears !== p.id) fail(`person ${p.id} is carried by nobody`);
    if (p.call && !callOf(c, p.call.id)) fail(`person ${p.id} is on a call that has gone`);
    if (p.act?.a === 'fire_work' && !p.call && !p.hold) fail(`person ${p.id} is fighting no fire`);
  }
  for (const h of s.households) if (h.members.length && s.people[h.members[0]].home !== h.home) fail(`household ${h.id} and its people disagree about home`);
}
void settle; void lineUp; void claimFloor;
