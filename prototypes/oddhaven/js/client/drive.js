// The car in your hands: Roverlands' Rapier vehicle (imported, unchanged) on Oddhaven's world, the real full model, a
// chase camera and a top-down one, and a handful of invisible solid boxes that ride along with the rail cars nearest
// you so you can hit them. Nothing else on the map has physics (PLAN §2: 4-8 live bodies).
//
// Top-down view: up on the stick or W is always screen north (game-standards: "W = screen north"). The car turns to
// the direction you hold and drives there; pull the other way from a standstill and it backs up.
import { createPhysics, GROUPS, DT } from '../../../roverlands/js/phys/physics.js';
import { createVehicle } from '../../../roverlands/js/phys/vehicle.js';
import { buildModel } from '../../../roverlands/js/client/models/index.js';
import { createCamera } from '../../../roverlands/js/game/camera.js';
import { qrot } from '../../../roverlands/js/phys/vmath.js';
import { restPedals } from '../sim/parking.js';

const SOLID_CARS = 6, SOLID_REACH = 34;
/** Nobody at the wheel of a slow car, on a slope as much as on the flat: take the last of the speed off by hand, so it settles and sleeps where it stopped. */
const calm = b => { const l = b.rb.linvel(); b.rb.setLinvel({ x: l.x * 0.5, y: l.y, z: l.z * 0.5 }, true); };
const yawOf = q => Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));

export async function createDrive({ THREE, RAPIER, scene, camera, world, def, net, enhance, restLift, busy = [] }) {
  const phys = createPhysics(RAPIER, world);
  const start = spawnSpot(world, net, busy);
  const testCar = createVehicle(phys, def, { id: 1, p: [start.x, start.y + restLift + 0.15, start.z], yaw: start.yaw, local: true });
  testCar.driver = true;
  let veh = testCar, nextId = 2;
  const others = new Set();
  const model = await buildModel(THREE, def, { enhance });
  model.group.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  scene.add(model.group);
  const cam = createCamera(THREE, camera, phys);
  cam.yaw = start.yaw;
  const self = {
    phys, get veh() { return veh; }, testCar, model, cam, view: 'chase', autopilot: null, stuck: 0, input: { gas: 0, brake: 0, steer: 0 },
    /** A live car (PLAN §2: 4-8 of them): the same Roverlands vehicle, any type, starting where and how fast the caller says. */
    spawn(d, { x, y, z, yaw, v = 0 }) {
      const body = createVehicle(phys, d, { id: nextId++, p: [x, y, z], yaw, local: true });
      if (v) body.rb.setLinvel({ x: Math.sin(yaw) * v, y: 0, z: Math.cos(yaw) * v }, true);
      others.add(body);
      return body;
    },
    /** The one in your hands, or null for none (the test car then sits braked). */
    use(v) { veh.driver = false; if (veh === testCar) testCar.driver = true; veh = v ?? testCar; if (v) { v.driver = true; v.restT = 0; v.rb.wakeUp(); } },
    drop(v) { if (veh === v) self.use(null); others.delete(v); v.dispose(); },
    /** The free test car exists only while it is being driven from town view. */
    testCarOn(on) { testCar.rb.setEnabled(on); model.group.visible = on; if (on) testCar.rb.wakeUp(); },
    get pos() { return veh.rb.translation(); },
    get speed() { return Math.abs(veh.forwardSpeed()); },
    get yaw() { return yawOf(veh.rb.rotation()); },
    setView(v) { self.view = v; camera.up.set(0, v === 'top' ? 0 : 1, v === 'top' ? -1 : 0); if (v !== 'top') cam.snap(); },
    teleport(x, z, yaw = 0, y = null) { veh.teleport([x, (y ?? world.heightAt(x, z)) + restLift + 0.15, z], yaw); cam.yaw = yaw; cam.snap(); },
    /** Put the car on the lane nearest a point (taking a car from town view). */
    teleportToRoad(x, z) {
      let best = null, d = 1e12;
      for (const L of net.roads) for (let i = 0; i < L.n; i += 6) { const e = (L.x[i] - x) ** 2 + (L.z[i] - z) ** 2; if (e < d) { d = e; best = [L, i]; } }
      const [L, i] = best, j = Math.min(L.n - 1, i + 2);
      self.teleport(L.x[i], L.z[i], Math.atan2(L.x[j] - L.x[i], L.z[j] - L.z[i]), L.y[i]);
    },
    /** Back on its wheels, on the nearest rail. */
    rescue() {
      const p = veh.rb.translation(); let best = null, d = 1e12;
      for (const L of net.roads) for (let i = 0; i < L.n; i += 6) { const e = (L.x[i] - p.x) ** 2 + (L.z[i] - p.z) ** 2; if (e < d) { d = e; best = [L, i]; } }
      const [L, i] = best, j = Math.min(L.n - 1, i + 2);
      self.teleport(L.x[i], L.z[i], Math.atan2(L.x[j] - L.x[i], L.z[j] - L.z[i]), L.y[i]);
    },
  };

  // solid stand-ins for the nearest rail cars
  const solids = [];
  for (let i = 0; i < SOLID_CARS; i++) {
    const rb = phys.rw.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -200, i * 8));
    const col = phys.rw.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.7, 2.2).setCollisionGroups(GROUPS.body).setFriction(0.5), rb);
    solids.push({ rb, col, car: -1, type: null });
  }
  function moveSolids(traffic, poses, types) {
    const p = veh.rb.translation(), list = [];
    traffic.cars.forEach((c, i) => { const q = poses[i]; if (!q || c.ghost > 0 || c.gone || c.mine) return; const d = (q.x - p.x) ** 2 + (q.z - p.z) ** 2; if (d < SOLID_REACH * SOLID_REACH) list.push([d, i]); });
    list.sort((a, b) => a[0] - b[0]);
    solids.forEach((s, k) => {
      const hit = list[k];
      if (!hit) { if (s.car !== -1) { s.car = -1; s.rb.setTranslation({ x: k * 8, y: -200, z: 0 }, true); } return; }
      const [, i] = hit, c = traffic.cars[i], q = poses[i], t = types.get(c.type);
      if (s.type !== c.type) { s.col.setHalfExtents({ x: t.width / 2, y: Math.max(0.5, t.height / 2 - 0.25), z: t.len / 2 }); s.type = c.type; }
      const at = { x: q.x, y: q.y + t.lift + 0.45, z: q.z }, rot = { x: 0, y: Math.sin(q.yaw / 2), z: 0, w: Math.cos(q.yaw / 2) };
      if (s.car !== i) { s.rb.setTranslation(at, true); s.rb.setRotation(rot, true); s.car = i; } else { s.rb.setNextKinematicTranslation(at); s.rb.setNextKinematicRotation(rot); }
    });
  }

  /** s = input.read(); returns how many physics ticks ran. */
  self.frame = (dt, s, { traffic, poses, types, inMenu }) => {
    const t = veh.rb.translation(), yaw = yawOf(veh.rb.rotation()), speed = veh.forwardSpeed();
    let gas = s.gas, brake = s.brake, steer = s.steer;
    if (inMenu) { ({ gas, brake } = restPedals(speed)); steer = 0; if (Math.abs(speed) < 1.2) calm(veh); }
    if (self.autopilot) {
      const a = self.autopilot.drive({ x: t.x, z: t.z, yaw, speed: Math.abs(speed) });
      gas = a.throttle; brake = a.brake; steer = a.steer;
    } else if (self.view === 'top' && !inMenu) {
      // the stick says which way on the map; W and up are north
      const m = Math.hypot(s.mx, s.my);
      if (m > 0.15) {
        const want = Math.atan2(s.mx, -s.my);
        let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) > 2 && speed < 3) { gas = 0; brake = Math.min(1, m); steer = d > 0 ? 1 : -1; }
        else { gas = Math.min(1, m); brake = 0; steer = Math.max(-1, Math.min(1, -d * 2)); }
      } else if (!s.gas && !s.brake) { gas = 0; brake = speed > 1 ? 0.3 : 0; }
    }
    Object.assign(veh.input, { throttle: gas, brake, steer, handbrake: !inMenu && !!s.jump, boost: false, pitch: 0, lean: 0, flip: false, jump: false, lift: 0 });
    Object.assign(self.input, { gas, brake, steer });
    moveSolids(traffic, poses, types);
    for (const b of others) if (b !== veh) { const r = b.coast ? { gas: 0, brake: 0 } : restPedals(b.forwardSpeed()); Object.assign(b.input, { throttle: r.gas, brake: r.brake, steer: 0, handbrake: false, boost: false, pitch: 0, lean: 0, flip: false, jump: false, lift: 0 }); if (!b.coast && !b.rb.isSleeping() && Math.abs(b.forwardSpeed()) < 1.2) { calm(b); b.restT = (b.restT || 0) + dt; if (b.restT > 2.5) { b.restT = 0; b.rb.sleep(); } } else b.restT = 0; }
    const n = phys.step(dt);
    // the ground's 4 m grid and the height the page uses can differ by more than a car's clearance: anything that slipped under it is put back on top, never lost
    for (const b of others) { const p = b.rb.translation(), g = world.heightAt(p.x, p.z); if (p.y < g - 1.5) { b.teleport([p.x, g + 1.2, p.z], yawOf(b.rb.rotation())); self.saved = (self.saved || 0) + 1; } }
    // on its side and not moving: put it back by itself (phones have no reset key)
    const up = qrot(veh.rb.rotation(), { x: 0, y: 1, z: 0 }).y;
    if (up < 0.55 && veh.speed() < 2) { self.stuck += dt; if (self.stuck > 3) { self.stuck = 0; self.rescue(); } } else self.stuck = 0;
    if (veh === testCar) {
      const p = veh.rb.translation(), q = veh.rb.rotation();
      model.group.position.set(p.x, p.y, p.z); model.group.quaternion.set(q.x, q.y, q.z, q.w);
      model.update({ ...veh.look(), acts: {}, t: performance.now() / 1000 });
    }
    return n;
  };
  self.camera = (dt, s) => {
    const p = veh.rb.translation(), v = veh.rb.linvel();
    if (self.view === 'top') {
      const h = 90 * cam.distScale;
      camera.position.set(p.x, p.y + h, p.z + 0.001); camera.lookAt(p.x, p.y, p.z);
      return;
    }
    if (s.camNear) cam.distScale = Math.max(0.6, cam.distScale - 0.15);
    if (s.camFar) cam.distScale = Math.min(1.8, cam.distScale + 0.15);
    const portrait = innerHeight > innerWidth;
    cam.update(dt, { target: [p.x, p.y, p.z], height: veh.def.camera.height, dist: veh.def.camera.dist * (portrait ? 1.1 : 1), vel: [v.x, v.y, v.z], look: { x: s.lookX, y: s.lookY, active: s.lookActive }, follow: true, exclude: veh.rb });
  };
  void DT;
  return self;
}

/** Where a game starts: on the county road side of Oddhaven's middle, on a rail, facing along it. */
export function spawnSpot(world, net, busy = []) {
  const t = world.towns[0];
  let best = null, d = 1e12;
  for (const L of net.roads) { if (L.county || busy.includes(L.index)) continue; const m = Math.floor(L.n / 2), e = (L.x[m] - t.x) ** 2 + (L.z[m] - t.z) ** 2; if (e < d) { d = e; best = L; } }
  const m = Math.floor(best.n / 2);
  return { x: best.x[m], z: best.z[m], y: best.y[m], yaw: Math.atan2(best.x[m + 1] - best.x[m], best.z[m + 1] - best.z[m]), lane: best.index };
}
