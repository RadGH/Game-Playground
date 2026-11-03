// The cars on screen: nothing but the sim's trips, walked along the lanes (js/world/rails.js). No traffic rules live in the
// page. Between snapshots a car carries on at the speed the sim last gave it and is pulled gently back to the sim's number,
// so 4 updates a second look like 60. A car the sim reset jumps ahead faded; one that arrived or left the sent area fades out.
//
//   const rc = createRailCars({ rails, routes: id => route, types });
//   rc.apply(snap);  rc.step(dt, speed);  rc.cars;  rc.pose(car, out);  rc.stats();
import { railPose } from '../world/rails.js';
import { createCar } from './smooth.js';

const FADE_OUT = 0.6, BLEND = 1.3, SILENT = 1500, SNAP_AGE = 250;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

export function createRailCars({ rails, routes, types, fallback = 'sedan', groundAt = () => 0, serverNow = () => performance.now() }) {
  const byTrip = new Map(), byLive = new Map(), cars = [];
  let fakes = [];
  const lenOf = t => types.get(t)?.len ?? 4.5;
  const self = {
    get cars() { return fakes.length ? fakes : cars; }, byTrip, byLive, owner: 'solo', parked: [],
    reset() { byTrip.clear(); byLive.clear(); cars.length = 0; self.parked = []; },
    /** Parked cars near the camera: [{ car, type, x, y, z, yaw }]. Not trips, so they cost the budget and nothing else. */
    setParked(rows) { self.parked = rows.map(r => ({ id: `p${r.car}`, type: types.has(r.type) ? r.type : fallback, len: lenOf(r.type), tint: r.car * 13 + 5, fade: 1, moved: 0, ghost: 0, gone: 0, fixed: { x: r.x, y: r.y, z: r.z, yaw: r.yaw, pitch: 0, roll: 0 } })); },
    /** A rail car turns into a live one where it stands: the same entry, so the same picture. */
    toLive(live) {
      let c = byTrip.get(live.trip);
      if (!c) {
        const r = routes(live.route), type = types.has(live.model) ? live.model : fallback;
        c = { type, len: lenOf(type), tint: live.car >= 0 ? live.car * 13 + 5 : live.trip, route: live.route, rail: rails.of(live.route, r), s: live.s, target: live.s, v: live.v, fade: 1, moved: 0, ghost: 0, flag: 0, driver: null, gone: 0 };
        cars.push(c);
      }
      byTrip.delete(live.trip);
      c.fixed = railPose(c.rail, c.s, c.len, { pitch: 0, roll: 0 }); c.liveId = live.id; c.id = `live${live.id}`; c.gone = 0; c.flag = 0; c.fade = Math.max(c.fade, 0.9);
      byLive.set(live.id, c);
      return c;
    },
    /** A live car from nowhere: summoned to the kerb, faded in. */
    addLive({ id, type, tint, pose, fade = 1, mine = false, remote = false }) {
      const c = { id: `live${id}`, liveId: id, type, len: lenOf(type), tint, fade, moved: 0, ghost: 0, flag: 0, gone: 0, v: 0, fixed: { pitch: 0, roll: 0, ...pose }, mine, remote };
      cars.push(c); byLive.set(id, c);
      return c;
    },
    /** Back on the rails: the car stays exactly where it is on screen and eases onto the lane. */
    toRail(e) {
      const c = byLive.get(e.live);
      if (!c) return;
      const was = c.fixed, r = routes(e.route);
      byLive.delete(e.live);
      c.fixed = null; c.liveId = null; c.mine = false; c.id = e.trip; c.route = e.route; c.rail = rails.of(e.route, r); c.s = c.target = e.s; c.v = e.v; c.gone = 0; c.driver = null;
      byTrip.set(e.trip, c);
      if (e.fade) { c.fade = 0.25; c.flag = 2; return; }
      const q = railPose(c.rail, c.s, c.len, {});
      c.blend = { x: was.x - q.x, y: was.y - q.y, z: was.z - q.z, yaw: wrap(was.yaw - q.yaw), pitch: (was.pitch || 0) - q.pitch, roll: was.roll || 0, k: 1 };
    },
    dropLive(id) { const c = byLive.get(id); if (c) c.gone = FADE_OUT; },
    /** Budget test only: this many stand-still cars in a pile (the view places them). */
    pile(n, names = [...types.keys()]) { fakes = []; for (let i = 0; i < n; i++) { const type = names[i % names.length]; fakes.push({ id: -i - 1, type, len: lenOf(type), tint: i * 7, fade: 1, moved: 0, ghost: 0, fake: true }); } },
    unpile() { fakes = []; },
    /** A vehicle standing still somewhere, drawn but not a trip (the bridge test's truck; later, parked cars). */
    park({ type, x, y, z, yaw }) { const c = { id: `parked${cars.length}`, type, len: lenOf(type), tint: 3, fade: 1, moved: 0, ghost: 0, gone: 0, fixed: { x, y, z, yaw, pitch: 0 } }; cars.push(c); return c; },
    /** Where a car handed to this browser must be by now: its last report, plus the time since, at its speed. Off the room's own clock, so a slow line does not put it behind. */
    ahead(live, at) { const dt = Math.min(0.7, Math.max(0, serverNow() - (at || serverNow())) / 1000); return { x: live.x + Math.sin(live.yaw) * live.v * dt, z: live.z + Math.cos(live.yaw) * live.v * dt, yaw: live.yaw }; },
    /** This car is someone else's to drive now: from here on it is drawn from what their browser says. */
    goRemote(c, at, pose) { c.remote = true; c.mine = false; c.heard = serverNow(); c.track ??= createCar(); if (pose) c.track.push(at, pose.x, pose.z, pose.yaw, pose.v ?? 0); return c; },
    /** The room passed on what another browser just said. */
    relayed(g) { for (const [id, x, z, yaw, v] of g.c) { const c = byLive.get(id); if (c?.remote) { c.track ??= createCar(); c.track.push(g.at, x, z, yaw, v); c.heard = g.at; } } },
    apply(snap) {
      const seen = new Set(), now = serverNow();
      for (const e of snap.events || []) {
        if (e.kind === 'took.done' && e.live) { const c = self.toLive(e.live); if (e.owner !== self.owner) self.goRemote(c, now, { ...c.fixed, v: e.live.v }); }
        else if (e.kind === 'car.back') self.toRail(e);
        else if (e.kind === 'car.gone') self.dropLive(e.live);
        else if ((e.kind === 'owner.moved' && e.live) || e.kind === 'car.owner') { const c = byLive.get(e.live.id); if (c && e.to === self.owner) { c.remote = false; c.track = null; } else if (c && e.from !== e.to && c.remote !== false || c && e.from === self.owner) { c.track = null; self.goRemote(c, e.at || now, e.live); } }      // a new driver: a new track, on the room's own time. A stamp from this page's guess at that time could sit ahead of every report the new driver sends
      }
      // other players' cars: drawn where their browser says, on the room's clock. A car nobody has spoken for lately gets its place from the sim
      const others = new Set();
      for (const [id, model, x, z, yaw, v, , , owner] of snap.live || []) {
        others.add(id);       // listed is alive, whoever it says owns it: a snapshot sent just before a hand-over can land just after it, and still call the car ours
        if (owner === self.owner) continue;
        let c = byLive.get(id);
        if (!c) c = self.goRemote(self.addLive({ id, type: types.has(model) ? model : fallback, tint: id * 13, pose: { x, y: groundAt(x, z), z, yaw }, remote: true }), now, { x, z, yaw, v });
        // only if its browser has gone quiet: the sim's copy is a tick or more behind a report, and at 20 m/s stamping it `now` pulls the picture back metres
        if (c.remote && now - (c.heard ?? -1e9) > SILENT) { c.track ??= createCar(); c.track.push(now - SNAP_AGE, x, z, yaw, v); }
        c.v = v;
      }
      for (const c of cars) if (c.remote && !others.has(c.liveId) && !c.gone) c.gone = FADE_OUT;
      for (const [id, model, route, s, v, flag, driver, car, noise] of snap.cars) {
        seen.add(id);
        let c = byTrip.get(id);
        if (!c) {
          const r = routes(route); if (!r || !r.steps.length) continue;
          const type = types.has(model) ? model : fallback;
          c = { id, type, len: lenOf(type), tint: car >= 0 ? car * 13 + 5 : id, route, rail: rails.of(route, r), s, target: s, v, fade: 0.2, moved: 0, ghost: 0, flag: 0, driver, gone: 0 };
          byTrip.set(id, c); cars.push(c);
        }
        if (Math.abs(s - c.s) > 24) { c.s = s; c.fade = 0.3; }      // the reset rule moved it: no sliding through what stopped it
        c.target = s; c.v = v; c.flag = flag; c.ghost = flag === 2 ? 1 : 0; c.gone = 0; c.driver = driver; c.yields = noise & 1; c.siren = noise & 2;
      }
      for (const c of cars) if (!seen.has(c.id) && !c.gone && !c.fixed) c.gone = FADE_OUT;
    },
    step(dt, speed) {
      for (let i = cars.length - 1; i >= 0; i--) {
        const c = cars[i];
        if (c.fixed && !c.gone) {
          c.fade += (1 - c.fade) * Math.min(1, dt * 2.5);
          if (c.remote && c.track?.ready) { const f = c.fixed; c.track.steer(f, serverNow(), dt); f.y = groundAt(f.x, f.z); c.moved += Math.abs(c.v) * dt; }
          continue;
        }
        if (c.blend) { c.blend.k -= dt / BLEND; if (c.blend.k <= 0) c.blend = null; }
        if (c.gone) {
          c.gone -= dt; c.fade = Math.min(c.fade, Math.max(0.05, c.gone / FADE_OUT));
          if (c.gone <= 0) { byTrip.delete(c.id); if (c.liveId != null) byLive.delete(c.liveId); cars.splice(i, 1); continue; }
          // keep the last few metres of the drive going while it fades
          if (c.rail && !c.fixed) c.s = Math.min(c.rail.routeLength, c.s + c.v * dt * speed);
          continue;
        }
        if (c.fixed) continue;
        const before = c.s;
        c.s += c.v * dt * speed;
        c.s += (c.target - c.s) * Math.min(1, dt * 3);
        c.s = Math.min(c.rail.routeLength, Math.max(0, c.s));
        c.moved += Math.abs(c.s - before);
        c.aside = (c.aside ?? 0) + ((c.yields ? 1 : 0) - (c.aside ?? 0)) * Math.min(1, dt * 2.5);      // pulled over for a siren
        const want = c.flag === 2 ? 0.45 : 1;
        c.fade += (want - c.fade) * Math.min(1, dt * 3);
      }
    },
    pose(c, out = {}) {
      if (c.fixed) return Object.assign(out, c.fixed);
      railPose(c.rail, c.s, c.len, out);
      out.roll = c.flag === 1 ? Math.PI : 0;
      if (c.aside > 0.01) { out.x += Math.cos(out.yaw) * c.aside * 1.5; out.z -= Math.sin(out.yaw) * c.aside * 1.5; }
      if (c.blend) { const b = c.blend, e = b.k * b.k * (3 - 2 * b.k); out.x += b.x * e; out.y += b.y * e; out.z += b.z * e; out.yaw += b.yaw * e; out.pitch += b.pitch * e; out.roll += b.roll * e; }
      return out;
    },
    stats() { let moving = 0, ghosts = 0; for (const c of cars) { if (c.v > 0.5) moving++; if (c.flag === 2) ghosts++; } return { cars: cars.length, moving, ghosts }; },
  };
  return self;
}
