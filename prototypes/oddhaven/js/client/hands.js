// Hands-on (PLAN §1): the person you are playing, their party and their cars, all run here in the browser; the sim is told
// where they are four times a second and otherwise leaves them alone (js/sim/control.js). On foot there is a walker on the
// pavements; in a car it is Roverlands' Rapier vehicle (drive.js), drawn by the same baked mesh the rail car had, so a car
// that leaves the rails is the same car on screen in the same place.
//
// W and up always mean the top of the screen (game-standards): the stick is turned by the camera's yaw (moveFromInput).
import { createFeet, createTrail, moveFromInput, pathStep, needsCatchUp, PACE } from '../world/walker.js';
import { routeInside, outsideDoor } from '../sim/interior-nav.js';
import { CARRY_PACE, SWING_CLIP_SECONDS } from './../world/job-kit.js';
import { toWorld, toLocal, FLOOR_H } from '../sim/interior.js';
import { qrot } from '../../../roverlands/js/phys/vmath.js';

const SPRAY_PACE = 0.3, SYNC = 0.25, ROOM_SYNC = 0.125, FOLLOW_FAR = 34, FOLLOW_BOARD = 60, GET_IN = 5.5, CALL_RANGE = 30, SLOW_ENOUGH = 4, CAM = { near: 14, far: 44, pitch: 1.02, indoor: 10.5 }, REACH = 1.5;
const round = v => Math.round(v * 100) / 100;
const yawOf = q => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));

export function createHands({ THREE, scene, camera, town, world, net, drive, cars, types, vdefs, paths, roads, project, feetIn = null, plans = () => null, shut = () => false, ui }) {
  const feet = feetIn || createFeet(world, net), trail = createTrail(), recs = new Map(), party = new Map(), away = new Map();
  const you = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, lv: 0 }, spotOut = {}, placeOf = new Map();
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23c', transparent: true, opacity: 0.9, depthTest: false }));
  mark.visible = false; mark.renderOrder = 4; scene.add(mark);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let lastAim = null, clock = 0, path = null, seats = new Map(), camX = 0, camZ = 0, camY = 0, askedAt = 0, asking = -1, stopping = false, camD = CAM.near;

  const self = {
    jobs: null, on: false, me: -1, car: null, view: 'near', yaw: 0, feet, you, party, recs, stats: { catchUps: 0, tapWalks: 0, summons: 0 }, hopMs: 0, moved: 0,
    riding: null, seatIn: null, followOn: false,
    get pos() { return self.car ? self.car.veh.rb.translation() : you; },
    /** The building you are in, if any, with your unit: { box, plan, place }. */
    where() {
      if (self.car || self.riding != null || self.seatIn != null) return null;
      const box = feet.inside(you.x, you.z); if (!box) return null;
      const plan = plans(box.b.id); if (!plan) return null;
      return { box, plan, place: placeAt(box.b, plan) };
    },
    get speed() { return self.car ? Math.abs(self.car.veh.forwardSpeed()) : you.speed; },
    get walking() { return !!path; },
    /** Who the body drawer should put first. */
    ids: () => (self.on ? [self.me, ...party.keys()] : []),
    /** Free, unlimited, from any state (PLAN rule 2). */
    take(id, at = null) {
      if (self.on || asking >= 0) return false;
      asking = id; askedAt = performance.now();
      town.control(true);
      town.cmd({ kind: 'take', who: id, ...(at ? { x: round(at.x), z: round(at.z), h: round(at.yaw ?? 0) } : null) });
      return true;
    },
    /** Control goes back to the sim, which works out what they do from where they actually are. */
    handBack() {
      if (!self.on) return;
      sync(true);
      town.cmd({ kind: 'release' });
      town.control(false);
      const at = { x: self.pos.x, z: self.pos.z };
      for (const r of recs.values()) { r.coast = true; r.veh.coast = r === self.car; }
      drive.use(null);
      self.on = false; self.car = null; self.riding = null; stopping = false; self.lastBack = self.me; away.set(self.me, town.mirror.t);
      self.me = -1; path = null; mark.visible = false; party.clear(); seats.clear(); trail.clear();
      ui.ended(at);
    },
    /** E, X on a controller, or the button: the nearest thing to use, your car, the lift. */
    use() {
      if (!self.on) return;
      if (self.jobs?.use()) return;
      if (self.riding != null) { if (!stopping) { stopping = true; town.cmd({ kind: 'rideOut', who: self.me }); ui.say('They pull over to let you out.'); } return; }
      if (self.car) { if (self.speed > SLOW_ENOUGH) { ui.say('Slow down first.'); return; } getOut(); return; }
      if (self.seatIn != null) { const c = cars.byLive.get(self.seatIn); if (Math.abs(c?.v ?? 0) > SLOW_ENOUGH) { ui.say('Ask them to stop first.'); return; } outOfSeat(); return; }
      const cab = callEngine();
      if (cab) { self.summonAt(cab); return; }      // a call is on: the engine comes before anything else in reach
      const t = nearThing();
      if (t) { sync(true); self.stats.lastPress = t.thing.kind; town.cmd({ kind: 'press', who: self.me, building: t.b.id, thing: t.thing.id }); self.stats.presses = (self.stats.presses || 0) + 1; return; }
      if (nearLift()) { ui.liftMenu(); return; }
      const r = nearestCar();
      if (r) { getIn(r); return; }
      const crew = crewCar();
      if (crew) { town.cmd({ kind: 'carIn', who: self.me, car: crew.id }); return; }
      const p = nearParked();
      if (p) self.summonAt(p);
    },
    useLabel() {
      if (!self.on) return null;
      const job = self.jobs?.label();
      if (job) return job;
      if (self.riding != null || self.car || self.seatIn != null) return 'GET OUT';
      if (callEngine()) return 'GET IN';
      const t = nearThing();
      if (t) return t.thing.label.toUpperCase();
      if (nearLift()) return 'LIFT';
      return nearestCar() || crewCar() || nearParked() ? 'GET IN' : null;
    },
    nearCar: () => nearestCar(),
    /** Where your engine is standing, for the marker. */
    engineSpot() { const r = ui.parkedNear?.().find(q => q.car === town.roster.people[self.me]?.van); return r ? [r.x, r.z] : null; },
    /** The lift: to another floor. Followers come too. */
    toFloor(lv) {
      const box = feet.inside(you.x, you.z), plan = box && plans(box.b.id);
      if (!plan?.lift) return;
      you.lv = lv; path = null; mark.visible = false; trail.clear();
      const q = toWorld(box, plan.lift.x, plan.lift.z);
      you.x = q.x; you.z = q.z; you.y = feet.ground(you.x, you.z, lv); self.snapCamera(); sync(true);
      let i = 0; for (const f of party.values()) { f.lv = lv; f.x = you.x + 0.9 * (++i); f.z = you.z; f.k = 0.05; feet.out(f); }
    },
    /** Tap to walk: the pavement the rest of the town uses. */
    tap(sx, sy) {
      if (!self.on || self.car) return;
      const g = ground(sx, sy); if (!g) return;
      self.routeTo(g);
    },
    /** Walk to a point: from a tap, or from the Phone's map. */
    routeTo(g) {
      if (!self.on || self.car) return;
      self.stats.tapWalks++;
      if (indoorWalk(g)) return;
      const a = nodeNear(you.x, you.z), b = nodeNear(g.x, g.z), direct = a === b || Math.hypot(g.x - you.x, g.z - you.z) < 26, r = direct ? null : roads.route(a.id, b.id);
      path = r?.steps.length ? { ...paths.of(`tap:${r.id}`, r, you, g) } : { pts: [[you.x, you.z], [g.x, g.z]] };
      you.leg = 1;
      mark.position.set(g.x, feet.ground(g.x, g.z, you.lv) + 0.05, g.z); mark.visible = true;
    },
    walkTo(x, z) { const p = project(x, 0.5, z); if (p) self.tap(p.x, p.y); },
    /** rows for the Party list. */
    addToParty(id) { town.cmd({ kind: 'partyAdd', who: id }); },
    dropFromParty(id) {
      const f = party.get(id); if (!f) return;
      town.cmd({ kind: 'pos', people: [[id, round(f.x), round(f.z), round(f.yaw)]] }); town.cmd({ kind: 'release', who: id }); party.delete(id); seats.delete(id);
    },
    swapTo(id) { sync(true); town.cmd({ kind: 'swap', who: id }); },
    /** One of the household's parked cars, to a kerb nearby and out of sight if there is such a kerb. */
    /** A household car already standing here: it comes off the drive where it is. */
    summonAt(row) {
      self.lastKerb = { x: row.x, y: row.y, z: row.z, yaw: row.yaw, d: 0 };
      town.cmd({ kind: 'summon', car: row.car, x: round(row.x), z: round(row.z), yaw: round(row.yaw) });
    },
    summon(carId) {
      const seen = (x, z) => !!project(x, 1, z), spot = feet.kerb(self.pos.x, self.pos.z, { min: 7, max: 34, seen, hiddenWorth: 10 }) ?? feet.kerb(self.pos.x, self.pos.z, { max: 400, seen });
      if (!spot) { ui.say('No road near here.'); return; }
      town.cmd({ kind: 'summon', car: carId, x: round(spot.x), z: round(spot.z), yaw: round(spot.yaw) });
      self.lastKerb = spot;
    },
    /** What the people view asks: where is this person, if they are ours. Null if they are not. */
    spot(id, out) {
      if (!self.on) return null;
      if (id === self.me) {
        if (self.car) return seat(out, self.car, 0);
        if (self.seatIn != null) { const c = cars.byLive.get(self.seatIn); if (c) { cars.pose(c, out); out.y += types.get(c.type)?.lift ?? 0; out.car = c; out.seat = self.seatNo; out.anim = 'sit'; out.walking = false; out.k = 1; return out; } }
        if (self.riding != null) { const c = cars.byTrip.get(self.riding); if (c) { cars.pose(c, out); out.y += types.get(c.type)?.lift ?? 0; out.car = c; out.seat = 1; out.anim = 'sit'; out.walking = false; out.k = 1; return out; } }
        const row = town.mirror.people.get(id);
        out.x = you.x; out.y = feet.ground(you.x, you.z, you.lv); out.z = you.z; out.yaw = you.yaw; out.walking = you.speed > 0.1; out.carry = row?.cy ?? null; out.lie = !!row?.fg?.down; out.anim = row?.fg?.down ? 'lifeSleep' : you.clipT > 0 ? you.clip : self.jobs?.spraying ? 'lifeHose' : row?.cy && row.cy !== 'hose' ? (out.walking ? 'lifeCarry' : 'lifeLift') : out.walking ? 'walk' : 'idle'; out.speed = you.speed; out.k = 1; out.car = null; out.lv = you.lv; out.inside = !!feet.inside(you.x, you.z); return out;
      }
      const f = party.get(id); if (!f) return null;
      if (f.car >= 0 && recs.get(f.car)) return seat(out, recs.get(f.car), f.seat);
      if (f.car >= 0 && cars.byLive.get(f.car)) { const c = cars.byLive.get(f.car); cars.pose(c, out); out.y += types.get(c.type)?.lift ?? 0; out.car = c; out.seat = f.seat; out.anim = 'sit'; out.walking = false; out.speed = 0; out.k = 1; return out; }
      const frow = town.mirror.people.get(id);
      out.x = f.x; out.y = feet.ground(f.x, f.z, f.lv ?? 0); out.z = f.z; out.yaw = f.yaw; out.walking = f.speed > 0.1; out.lie = !!frow?.fg?.down; out.anim = frow?.fg?.down ? 'lifeSleep' : f.clipT > 0 ? f.clip : out.walking ? 'walk' : 'idle'; out.speed = f.speed; out.k = f.k; out.car = null; out.lv = f.lv ?? 0; out.inside = !!feet.inside(f.x, f.z);
      return out;
    },
    /** Sim news, in order. */
    event(e) {
      if (e.kind === 'owner.moved') { if (e.to === town.owner) arrive(e); else if (e.from === town.owner) gone(e); return; }
      if (e.kind === 'car.owner') { if (e.to === town.owner) carCame(e.live); else if (e.from === town.owner) carWent(e.live.id); return; }
      if (e.kind === 'car.left') { if (e.owner === town.owner) carLeft(e); return; }
      if (e.kind === 'party.over') { if (e.owner === town.owner) { party.delete(e.who); seats.delete(e.who); ui.partyChanged(); } return; }
      if (e.owner !== undefined && e.owner !== town.owner) return;
      if (e.kind === 'took.done') { if (e.again) return; if (e.as === 'party') addFollower(e); else started(e); }
      else if (e.kind === 'car.summoned') summoned(e);
      else if (e.kind === 'car.seat') seated(e);
      else if (e.kind === 'car.full') { const f = party.get(e.who); if (f) { f.toCar = -1; ui.say(`No seat for ${ui.nameOf(e.who)}. They will walk.`); } else ui.say('That car is full.'); }
      else if (e.kind === 'swapped') { if (e.from !== undefined) swapped(e); }      // the log's copy of the same news carries no `from`: it once put a nameless follower in the party
      else if (e.kind === 'ride.out' && e.who === self.me) rideOver();
      else if (e.kind === 'mech.paid' && e.who === self.me) ui.say(`You found ${e.amount} coins.`);
      else if (e.kind === 'mech.empty' && e.who === self.me) ui.say('Empty. Somebody got here first.');
      else if (e.kind === 'recap') ui.recap(e, e.who === self.lastBack);
      else if (e.kind === 'cmd.refused' && e.owner === town.owner) { if (e.cmd === 'take' && e.who === asking) { asking = -1; town.control(false); } if (e.cmd === 'carIn') self.stats.seatRefused = (self.stats.seatRefused || 0) + 1; ui.say(sorry(e.why)); }
    },
    /** A car's event that has no owner on it: back on the rails, or gone. rail-cars has already taken the picture. */
    carEvent(e) { const r = recs.get(e.live); if (r) { drive.drop(r.veh); recs.delete(e.live); seats.forEach((v, k) => { if (v === e.live) seats.delete(k); }); } },
    frame(dt, s, modal) {
      for (const r of recs.values()) carPose(r, dt);
      if (!self.on) return;
      if (s.use && !modal) self.use();
      if (town.mirror.people.get(self.me)?.fg?.down) { you.speed = 0; path = null; } else if (self.car) { const p = self.car.veh.rb.translation(); you.x = p.x; you.z = p.z; you.speed = 0; } else if (self.seatIn != null) {
        const c = cars.byLive.get(self.seatIn);
        if (c) { const q = cars.pose(c, spotOut); you.x = q.x; you.z = q.z; you.yaw = q.yaw; } you.speed = 0;
      } else if (self.riding != null) {
        const c = cars.byTrip.get(self.riding);
        if (c) { const q = cars.pose(c, spotOut); you.x = q.x; you.z = q.z; you.yaw = q.yaw; } you.speed = 0;
      } else if (!modal) walk(dt, s); else you.speed = 0;
      you.y = feet.ground(you.x, you.z, you.lv);
      you.clipT = Math.max(0, (you.clipT ?? 0) - dt);
      if (you.dashT > 0 && !self.car) { you.dashT -= dt; feet.step(you, Math.sin(you.dashYaw), Math.cos(you.dashYaw), 13, dt); }
      trail.push(you.x, you.z);
      if (!self.car && self.riding == null && self.seatIn == null) plates();
      let i = 0;
      for (const f of party.values()) follow(f, i++, dt);
      clock += dt;
      if (clock >= (town.inRoom && self.car ? ROOM_SYNC : SYNC)) { clock = 0; sync(); }      // a car in a room is what has to be exact: 20 m/s is 5 m between reports at the walking rate
    },
    camera(dt, s, snap = false) {
      if (s.lookX) self.yaw += s.lookX * 1.6;
      if (s.camNear) self.view = 'near';
      if (s.camFar) self.view = 'far';
      // indoors the camera comes in closer: it stays above the walls whatever you do, so it can never be shut out of a room
      const indoor = !self.car && self.seatIn == null && !!feet.inside(you.x, you.z), want = self.view === 'near' && indoor ? CAM.indoor : CAM[self.view];
      camD += (want - camD) * (snap ? 1 : Math.min(1, dt * 4));
      const k = snap ? 1 : Math.min(1, dt * 7), portrait = innerHeight > innerWidth, d = camD * (portrait ? 1.1 : 1), P = CAM.pitch, Y = self.yaw;
      camX += (you.x - camX) * k; camZ += (you.z - camZ) * k; camY += (you.y - camY) * k;
      camera.up.set(0, 1, 0);
      camera.position.set(camX + Math.sin(Y) * Math.cos(P) * d, camY + Math.sin(P) * d, camZ + Math.cos(Y) * Math.cos(P) * d);
      camera.lookAt(camX, camY + 0.7, camZ);
    },
    snapCamera() { camX = you.x; camZ = you.z; camY = you.y; },
    toggleView() { if (self.car) drive.setView(drive.view === 'top' ? 'chase' : 'top'); else self.view = self.view === 'near' ? 'far' : 'near'; },
    /** Play a clip for a moment: a swing, a lever. */
    clip(name) { you.clip = name; you.clipT = SWING_CLIP_SECONDS; },
    /** A dodge: a quick step along the stick, or away from the nearest thing, a moment's speed. The sim decides whether it worked. */
    dash() { you.dashT = 0.24; you.dashYaw = lastAim ?? you.yaw + Math.PI; },
    /** A friend in a fight: the page walks them in, the sim lands their blows. */
    partyClip(id, name) { const f = party.get(id); if (f) { f.clip = name; f.clipT = SWING_CLIP_SECONDS; } },
    syncNow() { sync(true); },
    settleCars() { for (const r of recs.values()) carPose(r, 0); },
    /** Numbers for gameEye and the tests. */
    state: () => ({ lv: you.lv, riding: self.riding, seatIn: self.seatIn, follow: self.followOn, inside: self.where()?.box.b.id ?? null, use: self.useLabel(), on: self.on, me: self.me, car: self.car?.id ?? null, model: self.car?.model ?? null, x: round(you.x), z: round(you.z), speed: round(self.speed), party: [...party.values()].map(f => ({ id: f.id, x: round(f.x), z: round(f.z), car: f.car, seat: f.seat, k: f.k })), cars: [...recs.keys()], hopMs: Math.round(self.hopMs), stats: self.stats, tapping: !!path }),
    reset() { self.on = false; self.me = -1; self.car = null; self.riding = null; self.seatIn = null; self.followOn = false; stopping = false; asking = -1; for (const r of recs.values()) drive.drop(r.veh); recs.clear(); party.clear(); seats.clear(); trail.clear(); path = null; mark.visible = false; },
    awaySince: id => away.get(id),
    /**
     * The leader wants this body back: the room asks before it moves anything. The last word on where it is goes out now, and from that moment this browser has stopped driving it.
     * `done` tells the room; the car stays on screen, drawn from the new driver's reports.
     */
    yieldBody(who, done) {
      if (!self.on) { done(); return; }
      sync(true);
      if (who === self.me) {
        const at = { x: self.pos.x, z: self.pos.z }, r = self.car;
        if (r) { const p = r.veh.rb.translation(), y = yawOf(r.veh.rb.rotation()); cars.goRemote(r.c, town.serverNow(), { x: p.x, z: p.z, yaw: y, v: r.veh.forwardSpeed() }); drive.drop(r.veh); recs.delete(r.id); }
        town.control(false);
        drive.use(null);
        self.on = false; self.car = null; self.riding = null; self.seatIn = null; self.followOn = false; stopping = false; self.me = -1; path = null; mark.visible = false; party.clear(); seats.clear(); trail.clear();
        ui.ended(at);
      } else { party.delete(who); seats.delete(who); }
      done();
    },
    /** A page that has just loaded, or a socket that came back: pick up whoever the room says is ours. */
    resume(holds) {
      const front = holds.people.find(p => p.as === 'you');
      if (!front) { if (self.on) { const at = { ...self.pos }; self.reset(); town.control(false); drive.use(null); ui.ended(at); } return; }
      if (self.on && self.me === front.who) return;      // nothing was lost: the seat waited
      self.reset();
      town.control(true);
      for (const r of holds.cars) { const c = cars.addLive({ id: r.id, type: r.model, tint: r.car >= 0 ? r.car * 13 + 5 : r.id, pose: { x: r.x, y: feet.ground(r.x, r.z), z: r.z, yaw: r.yaw }, mine: true }); makeRec(r.id, r.model, c, drive.spawn(vdefs.get(r.model), { x: r.x, y: feet.ground(r.x, r.z) + (types.get(r.model)?.lift ?? 0.6), z: r.z, yaw: r.yaw, v: 0 }), r.car); }
      asking = -1; askedAt = performance.now();
      started({ who: front.who, x: front.x, z: front.z, h: front.h, lv: front.lv, ride: front.ride });
      if (front.car >= 0) { const rec = recs.get(front.car); if (rec) { self.car = rec; drive.use(rec.veh); drive.setView('chase'); ui.inCar(true); } else { self.seatIn = front.car; self.seatNo = front.seat; } }
      for (const p of holds.people) if (p !== front) { addFollower({ who: p.who, x: p.x, z: p.z, h: p.h, lv: p.lv }); const f = party.get(p.who); if (f && p.car >= 0) { f.car = p.car; f.seat = p.seat; seats.set(p.who, p.car); } }
    },
    /** gameEye.fall(): leave a follower behind, for the catch-up test. */
    strand(id, x, z) { const f = party.get(id); if (f) { f.x = x; f.z = z; } },
  };

  /** Which place a point in a building is: a flat by its floor and side, otherwise the building's one place. */
  function placeAt(b, plan) {
    let list = placeOf.get(b.id);
    if (!list) placeOf.set(b.id, list = town.roster.places.filter(p => p.building === b.id));
    if (list.length <= 1 || !plan.units.length) return list[0]?.id ?? -1;
    const q = toLocal({ cx: b.x, cz: b.z, yaw: b.yaw }, you.x, you.z), u = plan.units.find(x => x.lv === you.lv && x.side === (q.x > 0 ? 1 : 0)) ?? plan.units[0];
    return list.find(p => p.unit === u.u)?.id ?? list[0].id;
  }
  /** Things within reach, on your floor: a switch on the wall, a lever, a button at a garage door. Plates are stepped on, not pressed. */
  function nearThing() {
    const box = feet.inside(you.x, you.z, 1.6); if (!box) return null;
    const plan = plans(box.b.id); if (!plan) return null;
    let best = null, d = REACH;
    for (const t of plan.things) {
      if (t.lv !== you.lv || t.kind === 'plate' || t.kind === 'gate' || t.kind === 'timer' || t.kind === 'detector' || t.kind === 'sprinkler') continue;
      const q = toWorld(box, t.x, t.z), e = Math.hypot(q.x - you.x, q.z - you.z);
      if (e < d) { d = e; best = { b: box.b, thing: t }; }
    }
    return best;
  }
  function nearLift() {
    const box = feet.inside(you.x, you.z), plan = box && plans(box.b.id);
    if (!plan?.lift) return false;
    const q = toWorld(box, plan.lift.x, plan.lift.z);
    return Math.hypot(q.x - you.x, q.z - you.z) < REACH;
  }
  /** The engine, if you are on a call and standing by it. */
  function callEngine() { const p = nearParked(); return p && p.car === town.roster.people[self.me].van && town.mirror.fires?.some(F => F.call?.crew.includes(self.me)) ? p : null; }
  /** Your household's car standing nearby: walk up to it and get in, no menu. */
  function nearParked() {
    for (const row of ui.parkedNear?.() ?? []) if ((row.mine || town.roster.people[self.me].van === row.car) && !row.inside && Math.hypot(row.x - you.x, row.z - you.z) < (row.truck ? 5 : 3.4)) return row;
    return null;
  }
  // a plate is stepped on: one message when you arrive, one when you leave
  let onPlate = null;
  function plates() {
    const box = feet.inside(you.x, you.z), plan = box && plans(box.b.id);
    let now = null;
    if (plan) for (const t of plan.things) {
      if (t.kind !== 'plate' || t.lv !== you.lv) continue;
      const q = toWorld(box, t.x, t.z);
      if (Math.abs(q.x - you.x) < 0.75 && Math.abs(q.z - you.z) < 0.75) now = { b: box.b.id, id: t.id };
    }
    if ((now?.id ?? null) === (onPlate?.id ?? null) && now?.b === onPlate?.b) return;
    sync(true);
    if (onPlate) town.cmd({ kind: 'plate', who: self.me, building: onPlate.b, thing: onPlate.id, on: false });
    if (now) town.cmd({ kind: 'plate', who: self.me, building: now.b, thing: now.id, on: true });
    onPlate = now;
  }
  /** Tap to walk, where the tap or you are indoors: round the furniture, through the doors, down the lift if it comes to that. */
  function indoorWalk(g) {
    const here = feet.inside(you.x, you.z), there = feet.inside(g.x, g.z);
    if (!here && !there) return false;
    const box = there ?? here, plan = plans(box.b.id); if (!plan) return false;
    const a = toLocal(box, you.x, you.z), b = toLocal(box, g.x, g.z);
    if (here && there && here !== there) return false;
    const pts = routeInside(plan, here ? { x: a.x, z: a.z, lv: you.lv } : outsideDoor(plan), { x: b.x, z: b.z, lv: you.lv }, PACE.radius, d => shut(box.b.id, d));
    if (!pts) { ui.say("Can't get there from here."); return true; }
    if (pts.some(q => q[2] !== you.lv)) { ui.say('Take the lift first.'); return true; }
    const world2 = pts.map(q => { const w = toWorld(box, q[0], q[1]); return [w.x, w.z]; });
    path = { pts: here ? world2 : [[you.x, you.z], ...world2] }; you.leg = 1;
    mark.position.set(g.x, feet.ground(g.x, g.z, you.lv) + 0.05, g.z); mark.visible = true;
    return true;
  }
  function rideOver() {
    const c = cars.byTrip.get(self.riding), q = c ? cars.pose(c, {}) : { x: you.x, z: you.z, yaw: you.yaw };
    self.riding = null; stopping = false;
    // out on the kerb side
    you.x = q.x + Math.cos(q.yaw) * 1.9; you.z = q.z - Math.sin(q.yaw) * 1.9; you.yaw = q.yaw; you.speed = 0; you.lv = 0;
    feet.out(you); trail.clear(); self.snapCamera();
    ui.inCar(false);
    sync(true);
  }
  const sorry = why => ({ 'somebody else is playing them': 'Somebody else is playing them.', 'party full': 'The party is full.', 'that car is out': 'That car is out.', 'too many cars out': 'Too many of your cars are out.', 'denied:take': 'The host has not said you can take people.', 'denied:drive': 'The host has not said you can drive.', 'denied:spend': "The host has not said you can spend this household's money.", 'denied:settings': 'The host has not said you can change that.', 'denied:direct': 'The host has not said you can give orders.', 'denied:not yours': 'That is not yours to do.' }[why] || 'That did not work.');
  const nodeNear = (x, z) => { let b = null, d = 1e12; for (const n of roads.nodes) { const e = (n.x - x) ** 2 + (n.z - z) ** 2; if (e < d) { d = e; b = n; } } return b; };
  function ground(sx, sy) {
    ndc.set(sx / innerWidth * 2 - 1, -(sy / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); plane.constant = -you.y;
    return ray.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
  }
  function nearestCar() {
    const cy = town.mirror.people.get(self.me)?.cy;
    if (cy === 'hose' || cy === 'person') return null;       // your arms are full
    let best = null, d = GET_IN;
    for (const r of recs.values()) { if (r.coast) continue; const p = r.veh.rb.translation(), e = Math.hypot(p.x - you.x, p.z - you.z); if (e < d) { d = e; best = r; } }
    return best;
  }
  function seat(out, r, n) {
    const c = cars.pose(r.c, spotOut);
    out.car = r.c; out.seat = n; out.walking = false; out.anim = 'sit'; out.speed = 0; out.k = 1;
    out.x = c.x; out.z = c.z; out.y = c.y + (types.get(r.model)?.lift ?? 0); out.yaw = c.yaw;
    return out;
  }
  function makeRec(id, model, c, veh, car) { const r = { id, model, c, veh, car, coast: false }; recs.set(id, r); return r; }

  /** A body has come to this browser, moving. The car goes on from where the last report plus the time since says it must be, at the speed it was doing. */
  function arrive(e) {
    if (e.as === 'party') { addFollower(e); const f = party.get(e.who); if (f && e.car >= 0) { f.car = e.car; f.seat = e.seat; seats.set(e.who, e.car); } ui.partyChanged(); return; }
    const wasOn = self.on, old = wasOn ? { id: self.me, x: you.x, z: you.z, yaw: you.yaw, speed: 0, k: 1, stuck: 0, car: -1, seat: 0, toCar: -1, cool: 0, lv: you.lv } : null;
    if (wasOn && self.car) { const q = exitOf(self.car, 0); old.x = q.x; old.z = q.z; feet.out(old); self.car = null; drive.use(null); }
    if (wasOn && e.live && self.seatIn === e.live.id) { old.car = e.live.id; old.seat = self.seatNo; }
    self.seatIn = null;
    if (!wasOn) town.control(true);
    const pose = e.live ? cars.ahead(e.live, e.at) : null;
    started({ ...e, live: e.live && { ...e.live, x: pose.x, z: pose.z, yaw: pose.yaw } , fresh: true });
    if (old) { party.set(old.id, old); if (old.car >= 0) seats.set(old.id, old.car); }
    if (e.live) for (const [id, seat, owner] of e.riders) if (owner === town.owner && id !== old?.id) { addFollower({ who: id, x: pose.x, z: pose.z, h: pose.yaw, lv: 0 }); const f = party.get(id); if (f) { f.car = e.live.id; f.seat = seat; seats.set(id, e.live.id); } }
    if (!e.live && e.car >= 0) { self.seatIn = e.car; self.seatNo = e.seat; }
    ui.partyChanged();
  }
  /** The room finished moving a body we had already let go. Anything still here is cleared up. */
  function gone(e) { party.delete(e.who); seats.delete(e.who); if (e.who === self.me) yieldLate(); ui.taken?.(e); }
  function yieldLate() { self.yieldBody(self.me, () => {}); }
  const carSpawn = (L, c) => { const lift = types.get(L.model)?.lift ?? 0.6, veh = drive.spawn(vdefs.get(L.model), { x: L.x, y: Math.max(feet.ground(L.x, L.z), world.heightAt(L.x, L.z)) + lift + 0.05, z: L.z, yaw: L.yaw, v: L.v }); return makeRec(L.id, L.model, c, veh, L.car); };
  /** Nobody was at the wheel, and you are getting in: the car comes over to this browser, standing. */
  function carCame(L) { const c = cars.byLive.get(L.id) ?? cars.addLive({ id: L.id, type: L.model, tint: L.id * 13, pose: { x: L.x, y: feet.ground(L.x, L.z), z: L.z, yaw: L.yaw } }); c.mine = true; c.remote = false; carSpawn(L, c); }
  function carWent(id) { const r = recs.get(id); if (r) { drive.drop(r.veh); recs.delete(id); for (const [k, v] of seats) if (v === id) seats.delete(k); } }
  /** The car you were sitting in has gone: its driver handed back. Out, where it was. */
  function carLeft(e) {
    if (e.who === self.me) { self.seatIn = null; you.x = e.x + Math.cos(e.yaw) * 1.9; you.z = e.z - Math.sin(e.yaw) * 1.9; you.speed = 0; you.lv = 0; feet.out(you); trail.clear(); self.snapCamera(); return; }
    const f = party.get(e.who); if (f) { f.car = -1; f.seat = 0; f.x = e.x + 1.8; f.z = e.z; feet.out(f); seats.delete(e.who); }
  }
  function outOfSeat() {
    const c = cars.byLive.get(self.seatIn), q = c ? cars.pose(c, {}) : { x: you.x, z: you.z, yaw: you.yaw };
    town.cmd({ kind: 'carOut', who: self.me });
    self.seatIn = null; you.x = q.x + Math.cos(q.yaw) * 1.9; you.z = q.z - Math.sin(q.yaw) * 1.9; you.speed = 0; you.lv = 0; feet.out(you); trail.clear(); self.snapCamera();
  }
  /** A car of someone in your party, close enough to walk to. */
  function crewCar() {
    if (self.car || self.seatIn != null) return null;
    let best = null, d = GET_IN;
    for (const row of ui.crewCars?.() ?? []) { const c = cars.byLive.get(row.id); if (!c?.fixed) continue; const e = Math.hypot(c.fixed.x - you.x, c.fixed.z - you.z); if (e < d) { d = e; best = row; } }
    return best;
  }
  /**
   * Follow the leader (M8): your body, across players. Walk after them while they are close; a long way behind, pop up near them; if they are in a car, walk to it and get in, and if it has gone, a seat is the catch-up.
   * True while this moved you; a push on the stick always wins.
   */
  function followLeader(dt) {
    const L = ui.leader?.();
    if (!L) return false;
    const dx = L.x - you.x, dz = L.z - you.z, gap = Math.hypot(dx, dz);
    self.boardCool = Math.max(0, (self.boardCool ?? 0) - dt);
    if (L.car != null && !self.boardCool && (gap < 3.4 || gap > FOLLOW_BOARD)) { self.boardCool = 1.5; town.cmd({ kind: 'carIn', who: self.me, car: L.car }); return true; }
    if (gap > FOLLOW_FAR && !(L.car != null)) { const a = Math.atan2(dx, dz), q = { x: L.x - Math.sin(a) * 2.4, z: L.z - Math.cos(a) * 2.4 }; you.x = q.x; you.z = q.z; you.lv = L.lv ?? 0; feet.out(you); self.stats.catchUps++; you.speed = 0; self.snapCamera(); return true; }
    if ((L.lv ?? 0) !== you.lv) you.lv = L.lv ?? 0;
    if (gap < 2.2) { you.speed = 0; return true; }
    const x0 = you.x, z0 = you.z;
    feet.step(you, dx, dz, PACE.catchUpRun, dt);
    if (Math.hypot(you.x - x0, you.z - z0) < 0.25 * dt) { self.followStuck = (self.followStuck ?? 0) + dt; if (self.followStuck > 2) { self.followStuck = 0; you.x = L.x + 1.6; you.z = L.z; feet.out(you); self.stats.catchUps++; } } else self.followStuck = 0;
    return true;
  }

  function started(e) {
    asking = -1; self.on = true; self.me = e.who; self.yaw = 0; self.view = 'near'; path = null;
    Object.assign(you, { x: e.x, z: e.z, yaw: e.h, speed: 0, leg: null, lv: e.lv ?? 0 }); you.y = feet.ground(you.x, you.z, you.lv);
    self.riding = e.ride >= 0 ? e.ride : null; stopping = false;
    feet.out(you); trail.clear(); self.snapCamera();
    if (e.live) {
      const c = cars.byLive.get(e.live.id), q = e.fresh ? { ...cars.pose(c, {}), x: e.live.x, z: e.live.z, yaw: e.live.yaw } : cars.pose(c, {}), lift = types.get(e.live.model)?.lift ?? 0.6;
      if (e.fresh) { self.handJump = Math.hypot(c.fixed.x - q.x, c.fixed.z - q.z); q.y = feet.ground(q.x, q.z); c.fixed.x = q.x; c.fixed.z = q.z; c.fixed.yaw = q.yaw; }
      const def = vdefs.get(e.live.model), veh = drive.spawn(def, { x: q.x, y: q.y + lift, z: q.z, yaw: q.yaw, v: e.live.v });
      c.mine = true; c.remote = false; c.track = null;
      self.car = makeRec(e.live.id, e.live.model, c, veh, e.live.car);
      Object.assign(you, { x: q.x, z: q.z, yaw: q.yaw });
      drive.use(veh); drive.setView('chase'); drive.cam.yaw = q.yaw; drive.cam.snap();
    } else drive.use(null);
    self.hopMs = performance.now() - askedAt; self.tookAt = performance.now();
    ui.started(e.who, !!self.car);
    const since = away.get(e.who);
    if (since !== undefined) ui.whileAway(e.who, since);
  }
  function addFollower(e) {
    const f = { id: e.who, x: e.x, z: e.z, yaw: e.h, speed: 0, k: 1, stuck: 0, car: -1, seat: 0, toCar: -1, cool: 0, lv: e.lv ?? 0 };
    feet.out(f);
    party.set(e.who, f);
    if (Math.hypot(f.x - you.x, f.z - you.z) > 34) catchUp(f, party.size - 1, true);
    ui.partyChanged();
  }
  function summoned(e) {
    if (e.owner !== town.owner) return;
    const spot = self.lastKerb ?? { x: e.x, z: e.z, y: feet.ground(e.x, e.z), yaw: e.yaw }, lift = types.get(e.model)?.lift ?? 0.6, def = vdefs.get(e.model);
    const veh = drive.spawn(def, { x: spot.x, y: Math.max(spot.y, world.heightAt(spot.x, spot.z)) + lift + 0.3, z: spot.z, yaw: spot.yaw, v: 0 });
    const c = cars.addLive({ id: e.live, type: e.model, tint: e.car * 13 + 5, pose: { x: spot.x, y: spot.y, z: spot.z, yaw: spot.yaw, pitch: 0, roll: 0 }, fade: 0.02, mine: true });
    const rec = makeRec(e.live, e.model, c, veh, e.car);
    self.stats.summons++;
    if (spot.d === 0) { self.lastKerb = null; getIn(rec); ui.partyChanged(); return; }    // it was standing right there
    ui.summoned(e.model, spot, rec);
    ui.partyChanged();
  }
  function getIn(r) {
    town.cmd({ kind: 'carIn', who: self.me, car: r.id });
    for (const f of party.values()) if (f.car < 0 && Math.hypot(f.x - you.x, f.z - you.z) < CALL_RANGE) f.toCar = r.id;
  }
  function seated(e) {
    const r = recs.get(e.car);
    if (!r) { if (e.who === self.me) { self.seatIn = e.car; self.seatNo = e.seat; path = null; mark.visible = false; ui.say('In. They are driving.'); } else { const f = party.get(e.who); if (f) { f.car = e.car; f.seat = e.seat; f.toCar = -1; f.wait = 0; seats.set(e.who, e.car); } } return; }
    if (e.who === self.me) { self.car = r; drive.use(r.veh); drive.setView('chase'); drive.cam.yaw = yawOf(r.veh.rb.rotation()); drive.cam.snap(); path = null; mark.visible = false; ui.inCar(true); return; }
    const f = party.get(e.who); if (f) { f.car = e.car; f.seat = e.seat; f.toCar = -1; f.wait = 0; seats.set(e.who, e.car); }
  }
  /** Out of the door they sat by: the seat's own exit point. */
  function exitOf(r, n) {
    const ex = r.veh.def.seats?.[n]?.exit ?? [1.9, 0, 0], w = r.veh.toWorld({ x: ex[0], y: ex[1], z: ex[2] });
    return w;
  }
  function getOut() {
    const r = self.car, p = exitOf(r, 0);
    for (const f of party.values()) if (f.car === r.id) { const q = exitOf(r, f.seat); f.x = q.x; f.z = q.z; f.car = -1; f.toCar = -1; feet.out(f); town.cmd({ kind: 'carOut', who: f.id }); }
    town.cmd({ kind: 'carOut', who: self.me });
    you.x = p.x; you.z = p.z; you.speed = 0; feet.out(you); trail.clear();
    self.car = null; drive.use(null); self.snapCamera(); ui.inCar(false);
  }
  function swapped(e) {
    const f = party.get(e.who); if (!f) return;
    const old = { id: e.from, x: you.x, z: you.z, yaw: you.yaw, speed: 0, k: 1, stuck: 0, car: -1, seat: 0, toCar: -1, cool: 0, lv: you.lv }, sameCar = self.car && f.car === self.car.id;
    if (self.car) {
      if (sameCar) { old.car = self.car.id; old.seat = f.seat; } else { const q = exitOf(self.car, 0); old.x = q.x; old.z = q.z; feet.out(old); }
    }
    party.delete(e.who); party.set(old.id, old);
    self.me = e.who; Object.assign(you, { x: f.x, z: f.z, yaw: f.yaw, speed: 0, leg: null, lv: f.lv ?? 0 }); path = null; trail.clear();
    if (sameCar) { /* same car, new driver */ } else if (f.car >= 0 && recs.get(f.car)) { self.car = recs.get(f.car); drive.use(self.car.veh); } else { self.car = null; drive.use(null); }
    self.snapCamera(); ui.started(e.who, !!self.car, true);
  }
  function walk(dt, s) {
    const m = Math.hypot(s.mx, s.my);
    if (m <= 0.1 && !path && self.followOn && followLeader(dt)) return;
    if (m > 0.1) {
      path = null; mark.visible = false;
      const cy = town.mirror.people.get(self.me)?.cy, d = moveFromInput(s.mx, s.my, self.yaw); lastAim = Math.atan2(d.x, d.z);
      const load = cy && cy !== 'hose' ? CARRY_PACE : 1, aim = self.jobs?.spraying ? SPRAY_PACE : 1;     // a log on your shoulder slows you down; a live hose all but stops you, and the stick steers it
      feet.step(you, d.x, d.z, (s.boost ? PACE.walk : PACE.run) * Math.min(1, m) * load * aim, dt);
      self.moved += you.speed * dt;
    } else if (path) {
      const d = pathStep(you, path);
      if (!d) { path = null; mark.visible = false; you.speed = 0; return; }
      const x0 = you.x, z0 = you.z;
      feet.step(you, d.x, d.z, PACE.run * (town.mirror.people.get(self.me)?.cy ? CARRY_PACE : 1), dt);
      self.moved += you.speed * dt;
      if (Math.hypot(you.x - x0, you.z - z0) < PACE.run * dt * 0.2) { self.tapStuck = (self.tapStuck || 0) + dt; if (self.tapStuck > 2) { path = null; mark.visible = false; self.tapStuck = 0; } } else self.tapStuck = 0;
    } else {
      you.speed = 0;
      // nobody steering: the hose drifts onto the fire, so a thumb on the button is enough to start with
      if (self.jobs?.spraying && self.fireTurn) { const want = Math.atan2(self.fireTurn[0] - you.x, self.fireTurn[1] - you.z), e = Math.atan2(Math.sin(want - you.yaw), Math.cos(want - you.yaw)); you.yaw += Math.max(-dt * 2, Math.min(dt * 2, e)); }
    }
  }
  function catchUp(f, i, now = false) {
    const q = trail.behind(3 + i * 1.6) ?? { x: you.x + 1.5, z: you.z + 1.5 };
    if (!now) self.stats.catchUps++;
    f.k = 0.02; f.x = q.x; f.z = q.z; f.stuck = 0; f.speed = 0; f.cool = 4; feet.out(f);
  }
  function follow(f, i, dt) {
    f.clipT = Math.max(0, (f.clipT ?? 0) - dt);
    if (f.car < 0 && fightStep(f, dt)) return;
    if (f.car >= 0) { const r = recs.get(f.car); if (r) { const p = r.veh.rb.translation(); f.x = p.x; f.z = p.z; } return; }
    f.k = Math.min(1, f.k + dt * 3);
    f.cool = Math.max(0, f.cool - dt);
    if ((f.lv ?? 0) !== you.lv) { f.lv = you.lv; catchUp(f, i); return; }
    const lead = self.car ? self.car.veh.rb.translation() : you, gapToLead = Math.hypot(f.x - lead.x, f.z - lead.z), r = f.toCar >= 0 ? recs.get(f.toCar) : null;
    if (r) {
      const p = r.veh.rb.translation();
      if (Math.hypot(f.x - p.x, f.z - p.z) < 3 || self.car?.id === r.id && gapToLead < 4) { town.cmd({ kind: 'carIn', who: f.id, car: r.id }); f.toCar = -2; f.speed = 0; return; }
      if (self.car?.id === r.id && self.speed > SLOW_ENOUGH) { f.toCar = -1; return; }   // it left without them: they walk
      const x0 = f.x, z0 = f.z; feet.step(f, p.x - f.x, p.z - f.z, PACE.catchUpRun, dt);
      if (Math.hypot(f.x - x0, f.z - z0) < 0.01) f.stuck += dt; else f.stuck = 0;
      if (f.stuck > 2) { f.stuck = 0; f.x = p.x + 1.8; f.z = p.z; }
      return;
    }
    if (f.toCar === -2) { f.wait = (f.wait || 0) + dt; if (f.wait > 2) { f.wait = 0; f.toCar = -1; } return; }   // waiting for the sim to answer about the seat
    const q = trail.behind(1.8 * (i + 1)) ?? lead, dx = q.x - f.x, dz = q.z - f.z, d = Math.hypot(dx, dz);
    if (f.cool <= 0 && needsCatchUp(gapToLead, self.speed, f.stuck)) { catchUp(f, i); return; }
    if (d < 0.5) { f.speed = 0; f.stuck = 0; return; }
    const x0 = f.x, z0 = f.z;
    feet.step(f, dx, dz, Math.min(PACE.catchUpRun, d * 2.4), dt);
    if (Math.hypot(f.x - x0, f.z - z0) < 0.25 * dt && d > 2) f.stuck += dt; else f.stuck = Math.max(0, f.stuck - dt);
  }
  /** A friend at a rift: the page walks them to the nearest thing and the sim lands the blow. True while there is one. */
  function fightStep(f, dt) {
    const row = town.mirror.people.get(f.id); if (!row?.fg) return false;
    if (row.fg.down) { f.speed = 0; return true; }
    const R = town.mirror.rifts?.find(q => q.id === row.fg.r); if (!R?.M.length) return false;
    let best = null, d = 1e9; for (const m of R.M) { const e = Math.hypot(m[2] - f.x, m[3] - f.z); if (e < d) { d = e; best = m; } }
    if (d < 2.3) { f.speed = 0; f.yaw = Math.atan2(best[2] - f.x, best[3] - f.z); return true; }
    feet.step(f, best[2] - f.x, best[3] - f.z, PACE.catchUpRun, dt);
    return true;
  }
  function carPose(r, dt) {
    const t = r.veh.rb.translation(), q = r.veh.rb.rotation(), fw = qrot(q, { x: 0, y: 0, z: 1 }), rt = qrot(q, { x: 1, y: 0, z: 0 }), f = r.c.fixed, lift = types.get(r.model)?.lift ?? 0;
    const pitch = -Math.asin(Math.max(-1, Math.min(1, fw.y))), cp = Math.cos(pitch) || 1;
    f.x = t.x; f.y = t.y - lift; f.z = t.z; f.yaw = yawOf(q); f.pitch = pitch; f.roll = Math.asin(Math.max(-1, Math.min(1, rt.y / cp)));
    r.c.moved += Math.abs(r.veh.forwardSpeed()) * dt;
    r.c.v = r.veh.forwardSpeed();
  }
  function sync(force = false) {
    const rows = [], cs = [];
    const row = (id, w) => { const box = w === you ? self.where() : null, b = feet.inside(w.x, w.z), plan = b && plans(b.b.id); return [id, round(w.x), round(w.z), round(w.yaw), null, null, null, w.lv ?? 0, box ? box.place : plan ? (town.roster.places.find(p => p.building === b.b.id)?.id ?? -1) : -1]; };
    if (!self.car && self.seatIn == null) { const L = feet.lane(you.x, you.z, 1.5), r = row(self.me, you); if (L && r[8] < 0) { r[4] = L.edge; r[5] = L.fwd; r[6] = L.at; } rows.push(r); } else rows.push([self.me, round(you.x), round(you.z), round(you.yaw)]);
    for (const f of party.values()) rows.push(row(f.id, f));
    for (const r of recs.values()) {
      const p = r.veh.rb.translation(), v = r.veh.forwardSpeed(), driven = r === self.car, L = driven || Math.abs(v) > 0.6 ? feet.lane(p.x, p.z, 3.4) : null, y = yawOf(r.veh.rb.rotation());
      cs.push(L ? [r.id, round(p.x), round(p.z), round(y), round(v), L.edge, L.fwd, L.at] : [r.id, round(p.x), round(p.z), round(y), round(v)]);
    }
    town.cmd({ kind: 'pos', people: rows, cars: cs });
    void force;
  }
  return self;
}
