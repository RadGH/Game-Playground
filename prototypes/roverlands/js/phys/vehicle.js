// A wheeled vehicle on a Rapier rigid body: cast wheels, springs, a tyre model, mud, air control, bike balance.
//
//   const v = createVehicle(phys, def, { id, p: [x,y,z], yaw, local: true });
//   v.input = { throttle 0..1, brake 0..1, steer -1..1 (+1 = right), handbrake bool, boost bool, pitch -1..1, lean -1..1, flip bool }
//   v.setLocal(false)                 // someone else simulates it now: kinematic, moved by setRemote()
//   v.setRemote(p, q, vel, angvel)    // newest interpolated pose for a remote body (call every frame)
//   v.state()                         // { p, q, v, w, x } for the network (x = steer + per-wheel suspension and spin)
//   v.onImpact = (dv, info) => ...    // a sudden change of velocity (crash) this tick, m/s
//
// Frame: +z forward, +y up, +x the LEFT side (driver sits at +x). steer +1 turns right (negative yaw).
//
// Wheels are not colliders: each tick a sphere the size of the tyre is swept down from the top of its suspension
// travel. Where it stops IS where the tyre touches — so a tyre climbs onto a log or a kerb it meets with its front
// edge instead of a thin ray finding the ground under the hub and the tyre passing through the step.
//
// Tyre model (arcade, but from real ideas):
//   * load N from the spring; grip = tyre.grip x surface.grip x N.
//   * sideways: the force that would stop the contact sliding sideways THIS tick, capped by a slip curve that peaks at
//     a small slip angle and falls to `tyre.slide` x grip once the tyre is sliding — that fall is what makes a drift
//     hold instead of snapping back, and what lets the handbrake kick the tail out (rear grip x handbrakeRear).
//   * forward: engine (falls off toward top speed), brakes, rolling drag (surface.drag; mud is ~2.6x).
//   * both share one friction circle, so flooring it mid-corner on the rear wheels breaks them loose (power oversteer).
//   * soft surfaces sink the tyre (surface.sink) — the whole car settles into mud and ruts — and add drag.

import { G, GROUPS, DT } from './physics.js';
import { add, sub, scale, dot, cross, len, norm, madd, clamp, qrot, qrotInv, fromArr } from './vmath.js';

const UP = { x: 0, y: 1, z: 0 };
const DEFAULT_SURFACE = { id: 0, grip: 1, sink: 0, drag: 1, rut: 0.1 };

export function createVehicle(phys, def, { id = 0, p = [0, 2, 0], yaw = 0, local = true } = {}) {
  const { RAPIER, rw, world } = phys;
  const ch = def.chassis;
  const mass = def.mass;
  const com = fromArr(ch.com || [0, 0, 0]);
  const bodyDesc = (local ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.kinematicPositionBased())
    .setTranslation(p[0], p[1], p[2])
    .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
    .setCcdEnabled(true).setLinearDamping(def.linDamp ?? 0.05).setAngularDamping(def.angDamp ?? 0.4);
  const rb = rw.createRigidBody(bodyDesc);
  const self = { id, def, rb, local, kind: def.id };
  const info = { body: self };

  // Colliders: the chassis box carries ALL the mass (with a lowered centre and a slightly fattened inertia — real cars
  // keep their weight low and between the wheels; a plain box's inertia makes them twitchy), extra parts are massless.
  const inertiaScale = def.inertiaScale ?? 1.4;
  const ix = mass / 12 * ((2 * ch.hy) ** 2 + (2 * ch.hz) ** 2) * inertiaScale;
  const iy = mass / 12 * ((2 * ch.hx) ** 2 + (2 * ch.hz) ** 2) * inertiaScale;
  const iz = mass / 12 * ((2 * ch.hx) ** 2 + (2 * ch.hy) ** 2) * inertiaScale * (def.type === 'bike' ? 1.6 : 1);
  const colliders = [];
  const main = rw.createCollider(RAPIER.ColliderDesc.cuboid(ch.hx, ch.hy, ch.hz).setTranslation(...(ch.p || [0, 0, 0]))
    .setMassProperties(mass, com, { x: ix, y: iy, z: iz }, { x: 0, y: 0, z: 0, w: 1 })
    .setCollisionGroups(GROUPS.body).setFriction(0.5).setRestitution(0.05), rb);
  colliders.push(main);
  // doors: a part with `door: '<name>'` is solid while closed; its `open` shape (a ramp, a lid swung up) is solid
  // while open. setDoor(name, open) swaps which of the two collides.
  const doors = new Map();     // name -> { closed: [colliders], open: [colliders], isOpen }
  for (const part of def.parts || []) {
    let d;
    if (part.box) d = RAPIER.ColliderDesc.cuboid(...part.box);
    else if (part.ball) d = RAPIER.ColliderDesc.ball(part.ball);
    else if (part.cyl) d = RAPIER.ColliderDesc.cylinder(part.cyl[1] / 2, part.cyl[0]);
    if (!d) continue;
    d.setTranslation(...(part.p || [0, 0, 0])).setDensity(0).setCollisionGroups(GROUPS.body).setFriction(part.friction ?? 0.6);
    if (part.rot) d.setRotation(eulerQ(part.rot));
    const c = rw.createCollider(d, rb);
    colliders.push(c);
    if (part.door) {
      if (!doors.has(part.door)) doors.set(part.door, { closed: [], open: [], isOpen: false });
      const D = doors.get(part.door);
      D.closed.push(c);
      if (part.open) {
        const o = part.open;
        const od = RAPIER.ColliderDesc.cuboid(...o.box).setTranslation(...(o.p || [0, 0, 0])).setDensity(0).setCollisionGroups(GROUPS.body).setFriction(o.friction ?? 0.9);
        if (o.rot) od.setRotation(eulerQ(o.rot));
        const oc = rw.createCollider(od, rb); oc.setEnabled(false);
        colliders.push(oc); D.open.push(oc);
      }
    }
  }
  for (const c of colliders) phys.tagCollider(c, info);
  // the space swept for smashable things ahead (physics.js smashAhead): the chassis box plus the wheels' reach
  self.smash = new RAPIER.Cuboid(ch.hx + 0.25, ch.hy + 0.25, ch.hz + 0.3);
  const offSmash = phys.addSmasher(self);

  // --- wheels ---------------------------------------------------------------------------------------------------
  const susp = def.susp;
  const wheels = def.wheels.map((w, i) => ({
    i, def: w, p: fromArr(w.p), r: w.r, comp: 0, compPrev: 0, ground: false, normal: UP, point: null, surface: DEFAULT_SURFACE,
    spin: 0, spinRate: 0, steer: 0, slip: 0, slide: 0, load: 0, hitInfo: null,
    side: w.p[0] > 0 ? 'L' : 'R', axle: Math.round(w.p[2] * 10),
    shape: new RAPIER.Ball(w.r * 0.92),
  }));
  const driven = wheels.filter(w => w.def.drive).length || 1;
  const pairs = [];   // anti-roll: wheels on the same axle
  for (const a of wheels) for (const b of wheels) if (a.i < b.i && a.axle === b.axle && a.side !== b.side) pairs.push([a, b]);

  const input = { throttle: 0, brake: 0, steer: 0, handbrake: false, boost: false, pitch: 0, lean: 0, flip: false, jump: false, lift: 0, pedalTap: false };
  self.input = input;
  self.wheels = wheels;
  self.colliders = colliders;
  self.steer = 0;
  self.driver = false;        // someone is in the driver seat (bikes balance only then)
  self.crashed = 0;           // seconds a bike stays down after a crash
  self.boostFuel = 1;
  self.upsideDownFor = 0;
  self.onImpact = null;
  self.onWheelContact = null; // (wheel, pointArr, normalArr, surface, slideAmount, dirArr) for tracks / dust
  let vPrev = null, remote = null;
  self.airTime = 0;

  // pedal power (bicycle): each fresh press of the gas adds a burst that fades; holding it pedals at an easy cruise
  self.pedal = 0;
  function engineForce(vf) {
    const e = def.engine;
    if (def.pedal) {
      if (vf > e.top) return 0;
      const cruise = input.throttle > 0.01 ? (def.pedal.cruise ?? 0.35) : 0;
      return e.force * Math.max(cruise, self.pedal) * (1 - 0.7 * clamp(vf / e.top, 0, 1) ** 2);
    }
    const top = e.top * (input.boost && self.boostFuel > 0 && e.boost ? 1.25 : 1);
    if (input.throttle > 0.01) {
      if (vf > top) return 0;
      const f = e.force * (1 - 0.75 * clamp(vf / top, 0, 1) ** 2) * (input.boost && e.boost && self.boostFuel > 0 ? 1 + e.boost : 1);
      return f * input.throttle;
    }
    return 0;
  }

  // a parked vehicle that has settled goes to sleep: no casts, no forces, until someone gets in or something hits it
  // (Rapier wakes a sleeping body on contact by itself)
  let still = 0;
  // a wheel never stands on the thing it is hitched to (a trailer's nose sits right over the tractor's back wheels),
  // nor on loose cargo riding in its own trunk or bed: the top of a wheel's travel pokes up through the floor (the
  // wheel arch), and a crate there used to read as ground — full spring force on the car and the same shoved down into
  // the crate, straight through the floor. A prop whose centre is above the chassis top is cargo, not road.
  const cargoAbove = (ch.p?.[1] ?? 0) + ch.hy - 0.05;
  const wheelFilter = c => {
    const i = phys.infoOf(c), b = i?.body;
    if (!b) return true;
    if (b === self.towing?.trailer || b === self.towedBy) return false;
    if (i.prop && b.rb && self.toLocal(b.rb.translation()).y > cargoAbove) return false;
    return true;
  };
  function tick(dt) {
    if (!self.local) { tickRemote(dt); return; }
    if (!self.driver && self.crashed <= 0) {
      if (rb.isSleeping()) return;
      const lv0 = rb.linvel(), av0 = rb.angvel();
      if (Math.hypot(lv0.x, lv0.z) < 0.05 && Math.abs(lv0.y) < 0.12 && Math.hypot(av0.x, av0.y, av0.z) < 0.05 && wheels.every(w => w.ground)) {
        if ((still += dt) > 1.5) { rb.sleep(); still = 0; return; }
      } else still = 0;
    } else still = 0;
    const t = rb.translation(), q = rb.rotation();
    const lv = rb.linvel(), av = rb.angvel();
    const up = qrot(q, UP), fwd = qrot(q, { x: 0, y: 0, z: 1 });
    const worldCom = add(t, qrot(q, com));
    const speed = len(lv);
    const vfBody = dot(lv, fwd);

    if (def.pedal) {
      if (input.pedalTap) self.pedal = Math.min(def.pedal.max ?? 1.6, self.pedal + (def.pedal.tap ?? 0.45));
      self.pedal = Math.max(0, self.pedal - self.pedal * (def.pedal.decay ?? 2.5) * dt);
    }
    // steering: smaller lock at speed so a flick at 25 m/s doesn't spin you
    const st = def.steer;
    const target = def.type === 'tank' ? 0 : -input.steer * st.max * (1 - (st.speedFalloff ?? 0.6) * clamp(Math.abs(vfBody) / def.engine.top, 0, 1));
    self.steer += clamp(target - self.steer, -(st.rate ?? 3) * dt, (st.rate ?? 3) * dt);

    let grounded = 0;
    const travel = susp.travel;
    for (const w of wheels) {
      const anchor = add(t, qrot(q, { x: w.p.x, y: w.p.y + travel, z: w.p.z }));
      const down = scale(up, -1);
      const hit = rw.castShape(anchor, q, down, w.shape, 0, travel + 0.05, true, undefined, GROUPS.wheel, undefined, rb, wheelFilter);
      w.compPrev = w.comp;
      let hitT = hit ? (hit.time_of_impact ?? hit.timeOfImpact) : Infinity, onWater = false;
      if (def.type === 'hover' && world.waterAt) {          // a hover pad stands on water like on ground
        const wy = world.waterAt(anchor.x, anchor.z);
        if (wy != null && up.y > 0.3) {
          const tw = (anchor.y - (wy + w.r)) / up.y;
          if (tw >= 0 && tw < hitT && tw < travel + 0.05) { hitT = tw; onWater = true; }
        }
      }
      if (onWater) {
        w.ground = true; grounded++;
        w.normal = { x: 0, y: 1, z: 0 };
        const centre = madd(anchor, down, hitT);
        w.point = madd(centre, w.normal, -w.r);
        w.hitInfo = { kind: 'water' };
        w.surface = WATER;
        w.comp = clamp(travel - hitT + 0.05, 0, travel + 0.1);
      } else if (hit) {
        const toi = hit.time_of_impact ?? hit.timeOfImpact;
        const n = norm(hit.normal1 ? { x: -hit.normal2.x, y: -hit.normal2.y, z: -hit.normal2.z } : up);
        const centre = madd(anchor, down, toi);
        w.ground = true; grounded++;
        w.normal = dot(n, up) > 0.2 ? n : up;
        w.point = madd(centre, w.normal, -w.r);
        const hi = phys.infoOf(hit.collider);
        w.hitInfo = hi;
        w.surface = hi?.kind === 'terrain' || !hi ? (world.surfaceAt ? world.surfaceAt(w.point.x, w.point.z) : DEFAULT_SURFACE) : (hi.obj?.surface ?? ROADISH);
        // a tyre sinks into soft ground: the hub rides lower, and the car settles into the mud
        const sink = (w.surface.sink || 0);
        w.comp = clamp(travel - toi + 0.05 - sink, 0, travel + 0.1);
      } else {
        w.ground = false; w.comp = 0; w.point = null; w.hitInfo = null;
      }
      w.steer = w.def.steer ? self.steer * w.def.steer : 0;
    }

    // anti-roll bars: share load across an axle so a car doesn't lean like a boat
    const ar = susp.antiRoll ?? susp.k * 0.35;
    const arForce = new Map();
    for (const [a, b] of pairs) {
      const d = (a.comp - b.comp) * ar;
      arForce.set(a, (arForce.get(a) || 0) + d); arForce.set(b, (arForce.get(b) || 0) - d);
    }

    const g = 9.81;
    const perWheelMass = mass / Math.max(1, grounded);
    for (const w of wheels) {
      if (!w.ground) {
        // spinning in the air: a driven wheel revs up with the throttle, others slow down
        w.spinRate += ((w.def.drive && input.throttle > 0 ? def.engine.top / w.r : 0) - w.spinRate) * dt * 2;
        w.spin += w.spinRate * dt;
        w.load = 0; w.slide = 0;
        continue;
      }
      const cv = (w.comp - w.compPrev) / dt;
      let Fs = susp.k * w.comp + susp.damp * cv + (arForce.get(w) || 0);
      if (w.comp > travel * 0.92) Fs += (w.comp - travel * 0.92) * susp.k * 6;    // bump stop
      Fs = Math.max(0, Fs);
      w.load = Fs;
      const at = w.point;
      rb.applyImpulseAtPoint(scale(up, Fs * dt), at, true);
      if (def.type === 'hover') { w.spinRate = 0; w.slide = 0; if (self.onWheelContact && w.surface === WATER) self.onWheelContact(w, [at.x, at.y, at.z], [0, 1, 0], WATER, 0.6, [fwd.x, fwd.y, fwd.z], Math.abs(vfBody)); continue; }

      // contact frame
      const n = w.normal;
      const steerQ = { x: up.x * Math.sin(w.steer / 2), y: up.y * Math.sin(w.steer / 2), z: up.z * Math.sin(w.steer / 2), w: Math.cos(w.steer / 2) };
      let f = qrot(steerQ, fwd);
      f = norm(madd(f, n, -dot(f, n)));
      const s = norm(cross(n, f));     // points to the wheel's left
      const r = sub(at, worldCom);
      const pv = add(lv, cross(av, r));
      // the ground under us may itself be moving (a truck bed, a trailer)
      const gb = w.hitInfo?.body;
      const groundV = gb && gb.rb && gb !== self ? pointVel(gb.rb, at) : null;
      const rel = groundV ? sub(pv, groundV) : pv;
      const vf = dot(rel, f), vs = dot(rel, s);

      const surf = w.surface;
      const mu = (def.tyre.grip ?? 1.5) * (surf.grip ?? 1);
      const N = Math.max(Fs, 0);
      const maxF = mu * N;

      // forward force
      let Fx = 0;
      const rear = !w.def.steer;
      const handLocked = input.handbrake && (w.def.hand ?? rear) && def.type !== 'plane' && def.type !== 'heli';
      if (def.type === 'tank') {
        // tank controls: each track has its own throttle — forward/back on both, steer adds to one side and takes
        // from the other, so steer alone spins it on the spot. Letting go holds the tracks (they don't coast).
        const fwdIn = input.throttle - input.brake;
        const t = clamp(fwdIn + (w.side === 'L' ? -1 : 1) * -input.steer * (def.steer.pivot ?? 1), -1, 1);
        const top = def.engine.top * (t < 0 ? (def.engine.reverse / def.engine.top) : 1);
        if (Math.abs(t) > 0.02) Fx += Math.sign(t) * def.engine.force * Math.abs(t) * (1 - 0.8 * clamp(Math.abs(vf) / top, 0, 1) ** 2) * (Math.sign(vf) === Math.sign(t) || Math.abs(vf) < 0.5 ? 1 : 1.6) / driven;
        else Fx -= clamp(vf * perWheelMass / dt * 0.15, -maxF * 0.8, maxF * 0.8);
      } else if (w.def.drive) {
        Fx += engineForce(vf) / driven;
        // brake doubles as reverse once nearly stopped (the way every arcade car works)
        if (input.brake > 0.01 && vf < 1.0) Fx -= def.engine.force * 0.6 * input.brake * (vf > -def.engine.reverse ? 1 : 0) / driven;
      }
      // brake against the way we are rolling: forwards, or backwards faster than the car can reverse (after a spin)
      if (def.type !== 'tank' && input.brake > 0.01 && (vf > 1.0 || vf < -def.engine.reverse * 1.1)) Fx -= Math.sign(vf) * maxF * 0.9 * input.brake * (w.def.brake ?? 1);
      if (def.type !== 'tank' && input.throttle > 0.01 && vf < -1.0) Fx += maxF * 0.8 * input.throttle;        // pressing gas while rolling back brakes
      // rolling drag: soft ground holds you back, hard roads barely
      Fx -= vf * N * (0.001 + 0.008 * Math.max(0, (surf.drag ?? 1) - 1)) + Math.sign(vf) * Math.min(Math.abs(vf) * 50, N * 0.012 * (surf.drag ?? 1));
      if (handLocked) Fx = -Math.sign(vf) * Math.min(Math.abs(vf) * perWheelMass / dt, maxF * 0.75);
      // coasting with no input: a gentle engine brake so a parked car on a slope eventually stops
      if (input.throttle < 0.01 && input.brake < 0.01 && Math.abs(vf) < 1.5 && !self.driver) Fx -= vf * perWheelMass / dt * 0.25;

      // sideways force
      const slipAngle = Math.atan2(Math.abs(vs), Math.abs(vf) + 0.8);
      const peak = def.tyre.peak ?? 0.16;
      const slideK = handLocked ? (def.tyre.handbrakeRear ?? 0.35) : (def.tyre.slide ?? 0.72);
      const curve = handLocked ? slideK : slipAngle < peak ? 0.6 + 0.4 * (slipAngle / peak) : Math.max(slideK, 1 - (slipAngle - peak) * 2.5);
      const stopSide = -vs * perWheelMass / dt * (def.tyre.stiff ?? 0.85);
      let Fy = clamp(stopSide, -maxF * curve, maxF * curve);
      // friction circle
      const tot = Math.hypot(Fx, Fy);
      if (tot > maxF && tot > 0) { Fx *= maxF / tot; Fy *= maxF / tot; }
      w.slide = clamp(Math.abs(vs) / 6 + (handLocked ? 0.5 : 0) + (Math.abs(Fx) > maxF * 0.95 && w.def.drive && input.throttle > 0.5 ? 0.4 : 0), 0, 1);
      w.slip = slipAngle;

      // apply raised toward the centre of mass: real cars roll less than a box would (roll centre)
      const rc = def.tyre.rollCenter ?? 0.45;
      const apply = add(at, scale(sub(worldCom, at), 0)) ;
      const lift = scale(up, dot(sub(worldCom, at), up) * rc);
      rb.applyImpulseAtPoint(scale(add(scale(f, Fx), scale(s, Fy)), dt), add(apply, lift), true);

      // visuals
      w.spinRate = handLocked ? 0 : vf / w.r;
      if (w.def.drive && input.throttle > 0.6 && Math.abs(Fx) >= maxF * 0.95) w.spinRate += 8;   // wheelspin
      w.spin += w.spinRate * dt;
      if (self.onWheelContact) self.onWheelContact(w, [at.x, at.y, at.z], [n.x, n.y, n.z], surf, w.slide, [f.x, f.y, f.z], Math.abs(vf));
    }

    if (def.type === 'hover' && grounded > 0) {
      // thrust along the hull's heading (kept level), turn with a torque, and damp the sideways slide a little
      const flat = norm({ x: fwd.x, y: 0, z: fwd.z }), side = { x: flat.z, y: 0, z: -flat.x };
      const vf = dot(lv, flat), vs = dot(lv, side), e = def.engine;
      const push = (input.throttle - input.brake * (e.reverse / e.top)) * e.force * (1 - 0.8 * clamp(Math.abs(vf) / e.top, 0, 1) ** 2) * (input.boost && e.boost ? 1 + e.boost : 1);
      rb.applyImpulse(scale(flat, push * dt), true);
      rb.applyImpulse(scale(side, -vs * mass * (def.hover?.sideDamp ?? 1.2) * dt), true);
      rb.applyImpulse(scale(flat, -vf * mass * (def.hover?.drag ?? 0.08) * dt), true);
      const yawRate = dot(av, UP), wantYaw = -input.steer * (def.steer.max ?? 1.6) * (vf < -1 ? -1 : 1);
      rb.applyTorqueImpulse(scale(UP, (wantYaw - yawRate) * iy * 4 * dt), true);
      // stay level-ish: the pads do most of it, this stops a slow roll on water
      const tilt = cross(up, UP);
      rb.applyTorqueImpulse(scale(tilt, mass * 6 * dt), true);
    }

    if (def.type === 'heli') flyHeli(dt, q, lv, av, fwd, up);
    if (def.type === 'plane') flyPlane(dt, q, lv, av, fwd, up, grounded);

    // ground reaction on what we're standing on (a car on a trailer bed pushes the trailer down)
    for (const w of wheels) {
      const gb = w.ground && w.hitInfo?.body;
      if (gb && gb !== self && gb.local && gb.rb) gb.rb.applyImpulseAtPoint(scale(up, -w.load * dt), w.point, true);
    }

    // air: steer the car's attitude like the old arcade jeeps — pitch with the lean (stick / Q / Z), yaw with steer, lean with roll
    const air = def.air || {};
    if (grounded === 0 && def.type !== 'heli' && def.type !== 'plane') {
      self.airTime += dt;
      const right = qrot(q, { x: -1, y: 0, z: 0 });
      const k = (air.control ?? 0.6) * mass * 4;     // x4 once the push stopped being wiped out (2026-10-25)
      const pitch = (input.pitch || 0) * k;      // only a deliberate lean: gas held through a jump must not flip you
      const yaw = -input.steer * k * 0.6;
      const roll = (input.lean || 0) * k * 0.8;
      rb.applyTorqueImpulse(scale(add(add(scale(right, pitch), scale(up, yaw)), scale(fwd, roll)), dt), true);
      // a little damping on the spin so it lands readable
      // (read the spin AFTER the push above: damping the frame-start `av` overwrote the push, so air control did nothing)
      rb.setAngvel(scale(rb.angvel(), 1 - (air.damp ?? 0.6) * dt), true);
    } else if (grounded > 0) self.airTime = 0; else self.airTime += dt;

    // downforce grows with speed: keeps a fast car planted over crests
    if (grounded > 0 && def.downforce) rb.applyImpulse(scale(up, -def.downforce * speed * speed * dt), true);

    // rocket car: Space jumps; a second press in the air (within 1.25 s) dodges — a quick flip and shove the way the
    // stick points; the car can be flown with boost. `input.jump` is an edge the session sets for one tick.
    if (def.rocket) {
      const r = def.rocket;
      if (input.jump && grounded >= 2) { rb.applyImpulse(scale(up, mass * (r.jump ?? 5.5)), true); self.jumpT = 0; self.dodged = false; self.jumped = true; }
      else if (input.jump && grounded === 0 && self.jumped && !self.dodged && self.jumpT < 1.25) {
        self.dodged = true;
        const dir = Math.abs(input.steer) + Math.abs(input.throttle - input.brake) > 0.2
          ? norm(add(scale({ x: fwd.x, y: 0, z: fwd.z }, input.throttle - input.brake), scale(qrot(q, { x: -1, y: 0, z: 0 }), input.steer)))
          : null;
        if (dir) {
          rb.applyImpulse(scale(dir, mass * (r.dodge ?? 7)), true);
          rb.applyTorqueImpulse(scale(norm(cross(UP, dir)), iy * (r.flip ?? 9)), true);
        } else rb.applyImpulse(scale(up, mass * (r.jump ?? 5.5) * 0.8), true);   // no direction: a double jump
      }
      if (grounded >= 2 && self.jumpT > 0.2) self.jumped = false;
      self.jumpT = (self.jumpT ?? 9) + dt;
      if (grounded === 0) {     // air roll with lean, steer turns
        rb.applyTorqueImpulse(scale(fwd, (input.lean || 0) * iz * 4 * dt), true);
      }
    }

    // boost (rocket car, buggy nitro)
    if (input.boost && def.engine.boost && self.boostFuel > 0 && def.engine.boostThrust) {
      rb.applyImpulse(scale(fwd, def.engine.boostThrust * dt), true);
      self.boostFuel = Math.max(0, self.boostFuel - dt / (def.engine.boostSecs ?? 4));
    } else self.boostFuel = Math.min(1, self.boostFuel + dt / (def.engine.boostRefill ?? 6));

    // two-wheelers stay up while someone rides them: lean into the turn the way a real rider does
    if (def.type === 'bike') balanceBike(dt, q, lv, av, fwd, up, grounded);

    // upside down: the old trick — hold jump (flip) to roll it back on its wheels
    if (up.y < 0.55 && speed < 3) self.upsideDownFor += dt; else self.upsideDownFor = 0;   // on its side counts too
    if (input.flip && self.upsideDownFor > 0.6 && def.type !== 'bike') {
      const side = qrot(q, { x: 1, y: 0, z: 0 });
      const axis = norm(cross(up, UP));
      const amt = len(cross(up, UP)) < 0.05 ? side : axis;
      rb.applyImpulse({ x: 0, y: mass * 3.5 * dt * 2, z: 0 }, true);
      rb.applyTorqueImpulse(scale(amt, mass * 5 * dt), true);
    }

    // crashes: compare this tick's velocity change with what gravity alone would do
    const v = rb.linvel();
    if (vPrev) {
      const dv = Math.hypot(v.x - vPrev.x, v.y - vPrev.y + g * dt, v.z - vPrev.z);
      if (dv > 4 && self.onImpact) self.onImpact(dv, { from: vPrev, to: { x: v.x, y: v.y, z: v.z }, upright: up.y });
    }
    vPrev = { x: v.x, y: v.y, z: v.z };
  }

  // --- helicopter: rotor lift along the body's up; W/S tip it forward/back, A/D turn it, Space climbs, Shift sinks.
  // An attitude hold (PD on pitch / roll toward what the stick asks, a yaw-rate hold) makes it fly like a toy, not a
  // simulator. With nobody flying it the rotor winds down and it sits (or drops) on its skids.
  self.rotor = 0;
  self.lever = 0;      // a plane's throttle lever (0..1)
  function flyHeli(dt, q, lv, av, fwd, up) {
    const h = def.heli || {};
    const want = self.driver ? 1 : 0;
    self.rotor += (want - self.rotor) * dt * (want ? 2.6 : 0.25);   // spins up in about a second
    const right = qrot(q, { x: -1, y: 0, z: 0 });
    const climb = (input.handbrake ? 1 : 0) - (input.boost ? 1 : 0);
    // lift that holds height, plus climb / sink, minus the part lost when tipped (so a hard tilt also sinks a bit)
    const hover = mass * 9.81 / Math.max(0.5, up.y);
    const vy = lv.y;
    // climb: aims for a climb / sink RATE (h.climb m/s), so holding climb really goes up (owner: it 'doesn't go up very much')
    const lift = self.rotor * (hover * Math.min(1.25, up.y > 0 ? 1 : 0) + mass * (climb * (h.climb ?? 6) - vy) * 1.6);
    rb.applyImpulse(scale(up, Math.max(0, lift) * dt), true);
    // attitude: pitch forward with gas, back with brake; roll into the turn a little
    const pitchWant = (input.throttle - input.brake) * (h.tilt ?? 0.32);
    const rollWant = -input.steer * (h.bank ?? 0.18) + (input.lean || 0) * 0.3;
    const pitch = Math.asin(clamp(-dot(fwd, UP), -1, 1));      // + = nose down
    const roll = Math.asin(clamp(dot(right, UP), -1, 1));
    // torque about `right` > 0 lifts the nose; torque about `fwd` > 0 drops the right side
    const K = mass * 13, kd = mass * 3;
    const tRight = -(pitchWant - pitch) * K - dot(av, right) * kd;
    const tFwd = -(rollWant - roll) * K - dot(av, fwd) * kd;
    const yawWant = -input.steer * (h.yaw ?? 1.4);
    const ty = (yawWant - dot(av, UP)) * iy * 5;
    rb.applyTorqueImpulse(scale(add(add(scale(right, tRight), scale(fwd, tFwd)), scale(UP, ty)), dt * self.rotor), true);
    // air drag so it settles instead of drifting forever
    rb.applyImpulse(scale(lv, -mass * (h.drag ?? 0.25) * dt * self.rotor), true);
  }

  // --- airplane: lift = q x area x Cl(angle of attack) at right angles to the airflow, drag = q x area x (Cd0 + k Cl²),
  // q = ½ ρ v². Cl rises with the angle of attack to a stall and then falls away. The elevator, ailerons and rudder are
  // torques that scale with q too, so the controls do nothing at walking pace and bite at flying speed — which is why
  // it has to roll down the runway, lift its nose and climb out, and why a landing has to keep its speed up.
  function flyPlane(dt, q, lv, av, fwd, up, grounded) {
    const a = def.aero, rho = 1.2;
    const right = qrot(q, { x: -1, y: 0, z: 0 });
    const speed = len(lv);
    if (self.driver) self.lever = clamp(self.lever + (input.throttle - input.brake) * dt * 0.6, 0, 1); else self.lever = 0;
    const thrust = self.lever * def.engine.force * (1 - clamp(speed / (def.engine.top * 1.1), 0, 1) ** 2);
    rb.applyImpulse(scale(fwd, thrust * dt), true);
    if (speed < 1) return;
    const vdir = scale(lv, 1 / speed);
    const vf = dot(lv, fwd), vu = dot(lv, up);
    const aoa = Math.atan2(-vu, Math.max(0.1, vf)) + (a.incidence ?? 0.05);
    const stall = a.stall ?? 0.28;
    const cl = Math.abs(aoa) < stall ? (a.clSlope ?? 5) * aoa : Math.sign(aoa) * (a.clSlope ?? 5) * stall * Math.max(0.3, 1 - (Math.abs(aoa) - stall) * 3);
    const qd = 0.5 * rho * speed * speed;
    const liftDir = norm(cross(vdir, right));          // at right angles to the airflow, toward the body's up
    const L = qd * a.area * cl;
    const D = qd * a.area * ((a.cd0 ?? 0.03) + (a.k ?? 0.05) * cl * cl) + qd * (a.bodyDrag ?? 0.4);
    rb.applyImpulse(scale(add(scale(dot(liftDir, up) < 0 ? scale(liftDir, -1) : liftDir, L), scale(vdir, -D)), dt), true);
    // controls: W/S move the throttle lever (it stays put), Space pulls the nose up, Shift pushes it down, A/D roll.
    // The stick asks for a RATE (hold Space = a steady climb-in, let go = it holds its attitude), and the surfaces only
    // have the authority the airflow gives them: none at a crawl, full from about take-off speed.
    const authority = clamp(qd / (0.5 * rho * (a.vRotate ?? 26) ** 2), 0, 1.3);
    const stick = self.driver ? (input.elev ?? ((input.handbrake ? 1 : 0) - (input.boost ? 1 : 0))) : 0;   // elev: analog stick (controller / phone)
    const roll = self.driver ? input.steer : 0;
    const Ip = mass * (a.inertia ?? 4);
    const pr = dot(av, right), rr = dot(av, fwd), yr = dot(av, up);
    rb.applyTorqueImpulse(scale(right, (stick * (a.pitchRate ?? 0.55) - pr) * Ip * 6 * authority * dt), true);
    rb.applyTorqueImpulse(scale(fwd, (roll * (a.rollRate ?? 1.3) - rr) * Ip * 5 * authority * dt), true);
    // coordinated turn: a banked plane's nose follows the bank (yaw toward the low wing)
    const bank = Math.asin(clamp(-dot(right, UP), -1, 1));
    rb.applyTorqueImpulse(scale(up, (-Math.sin(bank) * (a.turn ?? 0.6) - yr) * Ip * 3 * authority * dt), true);
    // weathervane: the tail turns the nose into the airflow
    const side = dot(vdir, right), vert = dot(vdir, up);
    rb.applyTorqueImpulse(scale(add(scale(UP, -side * (a.vane ?? 5) * qd), scale(right, vert * (a.vane ?? 5) * qd * 0.3)), dt), true);
    self.aoa = aoa; self.stalled = Math.abs(aoa) > stall && grounded === 0;
  }

  function balanceBike(dt, q, lv, av, fwd, up, grounded) {
    if (self.crashed > 0) { self.crashed -= dt; return; }
    const parked = !self.driver;
    // roll = angle of the bike's up from the plane containing world-up and forward
    const right = norm(cross(fwd, UP));
    const roll = Math.asin(clamp(dot(up, right), -1, 1));     // + = leaning right
    const yawRate = dot(av, UP);
    const vf = dot(lv, fwd);
    // the lean a real bike needs to carry this turn: tan(lean) = v * yawRate / g
    let target = parked ? 0 : Math.atan(clamp(-vf * yawRate / 9.81, -1.1, 1.1));
    if (!parked && grounded === 0) target = -(input.lean || 0) * 0.5;
    const rollRate = dot(av, fwd);
    // a fork's trail steers a real bike back into line: hold the yaw rate the bars ask for, so hard braking or a
    // bump can't swap the ends
    if (grounded > 0) {
      const wb = Math.abs(def.wheels[0].p[2] - def.wheels[1].p[2]) || 1.4;
      const want = vf * Math.tan(self.steer) / wb;
      rb.applyTorqueImpulse(scale(UP, (want - yawRate) * def.mass * (def.yawHold ?? 1.2) * dt * 60 * 0.05), true);
    }
    const kp = (parked ? 0.6 : 1) * def.mass * 14, kd = def.mass * 2.4;
    const tau = kp * (target - roll) - kd * rollRate;
    if (grounded > 0 || !parked) rb.applyTorqueImpulse(scale(fwd, tau * dt), true);
    // lean forward / back (input.pitch, + = lean back = nose up). Turning about `right` (= fwd x up) with + lifts the
    // nose. On the ground it aims for an ANGLE (a wheelie of up to ~26°, a stoppie the other way) so holding it never
    // loops the bike; in the air it holds a pitch RATE so you can rotate to land a jump. (Before 2026-10-25 the ground
    // lean pushed the wrong way: Shift pressed the nose down.)
    if (!parked && input.pitch) {
      const pr = dot(av, right);
      if (grounded > 0) {
        const nose = Math.asin(clamp(dot(fwd, UP), -1, 1));
        const want = input.pitch * (def.wheelie ?? 0.45);
        rb.applyTorqueImpulse(scale(right, ((want - nose) * 9 - pr * 2.5) * def.mass * (def.groundPitch ?? 0.5) * dt * 10), true);
      } else {
        rb.applyTorqueImpulse(scale(right, (input.pitch * 2.2 - pr) * def.mass * 0.35 * dt * 60 * (def.airPitch ?? 0.05)), true);
      }
    }
    // too far over: the rider loses it
    if (!parked && Math.abs(roll) > 1.15) { self.crashed = 2.5; if (self.onImpact) self.onImpact(99, { fell: true, upright: up.y }); }
  }

  // --- remote bodies: moved to the interpolated pose; their velocity still pushes whatever they hit -----------------
  function tickRemote() {
    if (!remote) return;
    rb.setNextKinematicTranslation(remote.p);
    rb.setNextKinematicRotation(remote.q);
  }
  self.setRemote = (p, q, vel, w) => {
    remote = { p: { x: p[0], y: p[1], z: p[2] }, q: { x: q[0], y: q[1], z: q[2], w: q[3] }, v: vel, w };
  };
  self.setLocal = (on) => {
    if (on === self.local) return;
    self.local = on;
    if (on) {
      rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      if (remote?.v) rb.setLinvel({ x: remote.v[0], y: remote.v[1], z: remote.v[2] }, true);
      if (remote?.w) rb.setAngvel({ x: remote.w[0], y: remote.w[1], z: remote.w[2] }, true);
      vPrev = null;
    } else {
      rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
      remote = null;
    }
  };
  self.state = () => {
    const t = rb.translation(), q = rb.rotation(), lv = rb.linvel(), av = rb.angvel();
    const x = [r3(self.steer)];
    for (const w of wheels) x.push(r3(w.comp), r3(w.spin % (Math.PI * 2)));
    // then always four extras, in this order (EXTRAS): fork height, rotor 0..1, throttle lever 0..1, boost flame 0..1
    x.push(r3(self.forkHeight()), r3(self.rotor || 0), r3(self.lever || 0), input.boost && self.boostFuel > 0 ? 1 : 0);
    return { p: [r3(t.x), r3(t.y), r3(t.z)], q: [r4(q.x), r4(q.y), r4(q.z), r4(q.w)], v: [r3(lv.x), r3(lv.y), r3(lv.z)], w: [r3(av.x), r3(av.y), r3(av.z)], x };
  };
  /** A remote body's extras (steer, suspension, spin) so its wheels draw right. */
  self.applyExtras = (x) => {
    if (!x) return;
    self.steer = x[0] || 0;
    wheels.forEach((w, i) => { w.comp = x[1 + i * 2] ?? w.comp; w.spin = x[2 + i * 2] ?? w.spin; w.steer = w.def.steer ? self.steer * w.def.steer : 0; });
    const e = 1 + wheels.length * 2;
    self.remoteForks = x[e] ?? 0; self.rotor = x[e + 1] ?? self.rotor; self.lever = x[e + 2] ?? self.lever; self.flame = x[e + 3] ?? 0;
  };
  /** Index in state().x where anything the session appends (turret aim) starts. */
  self.extrasEnd = () => 1 + wheels.length * 2 + 4;
  /** What a model's update() reads: the same whether this body is local or remote. */
  self.look = () => ({ steer: self.steer, wheels: wheels.map(w => ({ comp: w.comp, spin: w.spin, steer: w.steer })),
    forks: self.local ? self.forkHeight() : (self.remoteForks || 0), rotor: self.rotor || 0, lever: self.lever || 0,
    boost: self.local ? (input.boost && self.boostFuel > 0 ? 1 : 0) : (self.flame || 0) });
  self.wake = () => rb.wakeUp();
  self.doorNames = () => [...doors.keys()];
  self.isDoorOpen = name => !!doors.get(name)?.isOpen;
  self.setDoor = (name, open) => {
    const D = doors.get(name); if (!D || D.isOpen === !!open) return;
    D.isOpen = !!open;
    for (const c of D.closed) c.setEnabled(!open);
    for (const c of D.open) c.setEnabled(!!open);
    rb.wakeUp();
  };

  // --- towing: a ball joint from my tow point (def.tow, at the back) to a trailer's tongue (def.hitch, at its front).
  // Both bodies must be simulated on this machine (the session asks the room to hand the trailer to the tow owner).
  self.towing = null; self.towedBy = null;
  self.towPointWorld = () => def.tow ? self.toWorld(fromArr(def.tow)) : null;
  self.hitchPointWorld = () => def.hitch ? self.toWorld(fromArr(def.hitch)) : null;
  self.hitch = (trailer) => {
    if (!def.tow || !trailer?.def.hitch || self.towing || trailer.towedBy) return false;
    const jd = RAPIER.JointData.spherical(fromArr(def.tow), fromArr(trailer.def.hitch));
    const joint = rw.createImpulseJoint(jd, rb, trailer.rb, true);
    if (trailer.def.fifthWheel) joint.setContactsEnabled(false);   // a semi-trailer's nose rides over the tractor's back: those two never collide
    self.towing = { trailer, joint };
    trailer.towedBy = self;
    trailer.driver = true;        // a hitched trailer never parks itself to sleep
    trailer.wake(); rb.wakeUp();
    return true;
  };
  self.unhitch = () => {
    if (!self.towing) return null;
    const t = self.towing.trailer;
    try { rw.removeImpulseJoint(self.towing.joint, true); } catch { /* gone */ }
    self.towing = null; t.towedBy = null; t.driver = false;
    return t;
  };

  // --- forks (forklift): the carriage is its own body on a motorised slide up the mast, so it really pushes up on
  // whatever sits on it. input.lift -1..1 moves the target height; the motor holds it there.
  self.forks = null;
  if (def.forks) {
    const f = def.forks;
    const at = fromArr(f.anchor);
    const base = add(rb.translation(), qrot(rb.rotation(), at));
    const fb = rw.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(base.x, base.y, base.z).setRotation(rb.rotation()).setCcdEnabled(true).setAngularDamping(2));
    const fcs = [];
    for (const x of f.tines || [0.3, -0.3]) fcs.push(rw.createCollider(RAPIER.ColliderDesc.cuboid(f.tineHalf?.[0] ?? 0.06, f.tineHalf?.[1] ?? 0.03, f.tineHalf?.[2] ?? 0.6).setTranslation(x, 0, f.tineHalf?.[2] ?? 0.6).setMass((f.mass ?? 120) / 3).setCollisionGroups(GROUPS.body).setFriction(1.2), fb));
    fcs.push(rw.createCollider(RAPIER.ColliderDesc.cuboid(f.plateHalf?.[0] ?? 0.45, f.plateHalf?.[1] ?? 0.35, 0.04).setTranslation(0, f.plateHalf?.[1] ?? 0.35, -0.02).setMass((f.mass ?? 120) / 3).setCollisionGroups(GROUPS.body).setFriction(0.8), fb));
    for (const c of fcs) phys.tagCollider(c, { body: self, part: 'forks' });
    const jd = RAPIER.JointData.prismatic(at, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    jd.limitsEnabled = true; jd.limits = [f.travel?.[0] ?? 0, f.travel?.[1] ?? 2.4];
    const joint = rw.createImpulseJoint(jd, rb, fb, true);
    joint.configureMotorPosition(0, f.stiffness ?? 2.5e5, f.damping ?? 2.5e4);
    self.forks = { rb: fb, joint, colliders: fcs, target: 0 };
    colliders.push(...fcs);
  }
  self.forkHeight = () => {
    if (!self.forks) return 0;
    const lp = qrotInv(rb.rotation(), sub(self.forks.rb.translation(), rb.translation()));
    return lp.y - def.forks.anchor[1];
  };
  const tickForks = dt => {
    if (!self.forks || !self.local) return;
    const f = def.forks, F = self.forks;
    if (input.lift) F.target = clamp(F.target + input.lift * (f.speed ?? 0.6) * dt, f.travel?.[0] ?? 0, f.travel?.[1] ?? 2.4);
    F.joint.configureMotorPosition(F.target, f.stiffness ?? 2.5e5, f.damping ?? 2.5e4);
    if (input.lift) { F.rb.wakeUp(); rb.wakeUp(); }
  };
  phys.onTick(tickForks);
  self.applyBump = (j, at) => { if (self.local) rb.applyImpulseAtPoint({ x: j[0], y: j[1], z: j[2] }, { x: at[0], y: at[1], z: at[2] }, true); };
  self.teleport = (p, yaw = 0) => {
    rb.setTranslation({ x: p[0], y: p[1], z: p[2] }, true);
    rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
    rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    vPrev = null;
  };
  /** World position of a point given in the vehicle's frame. */
  self.toWorld = (lp) => { const t = rb.translation(), q = rb.rotation(); return add(t, qrot(q, lp)); };
  self.toLocal = (wp) => { const t = rb.translation(), q = rb.rotation(); return qrotInv(q, sub(wp, t)); };
  self.speed = () => len(rb.linvel());
  self.forwardSpeed = () => dot(rb.linvel(), qrot(rb.rotation(), { x: 0, y: 0, z: 1 }));
  self.grounded = () => wheels.some(w => w.ground);
  self.dispose = () => { self.unhitch(); self.towedBy?.unhitch(); for (const c of colliders) phys.untagCollider(c); off(); offSmash(); if (self.forks) rw.removeRigidBody(self.forks.rb); rw.removeRigidBody(rb); };
  const off = phys.onTick(tick);
  return self;
}

const ROADISH = { id: 7, grip: 1.1, sink: 0, drag: 0.9, rut: 0 };
const WATER = { id: 10, name: 'water', grip: 0.2, sink: 0, drag: 1, rut: 0 };
const r3 = v => Math.round(v * 1000) / 1000;
const r4 = v => Math.round(v * 10000) / 10000;
function pointVel(rb, at) {
  const t = rb.translation(), lv = rb.linvel(), av = rb.angvel();
  return add(lv, cross(av, sub(at, t)));
}
function eulerQ([x, y, z]) {
  const cx = Math.cos(x / 2), sx = Math.sin(x / 2), cy = Math.cos(y / 2), sy = Math.sin(y / 2), cz = Math.cos(z / 2), sz = Math.sin(z / 2);
  return { x: sx * cy * cz + cx * sy * sz, y: cx * sy * cz - sx * cy * sz, z: cx * cy * sz + sx * sy * cz, w: cx * cy * cz - sx * sy * sz };
}
export { pointVel };
