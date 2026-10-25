// A person on foot: Rapier's character controller on a capsule, plus the three things a vehicle game needs from it.
//
//   const me = createWalker(phys, { p: [x, y, z], yaw });
//   me.input = { mx, mz, run, jump }   // mx/mz = WORLD direction to move (the caller turns the stick by the camera)
//   me.feet / me.yaw / me.anim         // feet position [x,y,z], facing, 'idle'|'walk'|'run'|'jump'|'fall'|'swim'|'rag'
//   me.platform                        // the vehicle body I'm standing on (or null); me.rel = my feet in its frame
//   me.throwOut(vel, spin)             // tumble as a loose body (thrown from a crashing open vehicle)
//   me.disable() / me.enable(p, yaw)   // while seated in a vehicle the walker is parked out of the world
//
// 1. Riding a moving platform: when the ground under my feet belongs to a vehicle, I remember where I stand in THAT
//    vehicle's frame. Next tick the vehicle has moved; I start from where it carried me (and turn with it) and walk
//    from there. Nothing tries to drag me with friction, so a truck bed at 25 m/s holds me like the ground does.
// 2. Being thrown out: the capsule becomes a dynamic body for a moment, keeps the speed of the crash, tumbles, and
//    stands back up once it has slowed down.
// 3. Water: deeper than my chest and I swim at the surface, slowly.

import { GROUPS, DT } from './physics.js';
import { qrot, qrotInv, sub, add, yawOf, wrapAngle } from './vmath.js';

export const WALK = { walk: 2.4, run: 5.2, swim: 1.6, jump: 5.2, gravity: 20, radius: 0.3, half: 0.52, airControl: 0.35 };

export function createWalker(phys, { p = [0, 2, 0], yaw = 0 } = {}) {
  const { RAPIER, rw, world } = phys;
  const lift = WALK.radius + WALK.half;          // capsule centre above the feet
  const rb = rw.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p[0], p[1] + lift, p[2]));
  const col = rw.createCollider(RAPIER.ColliderDesc.capsule(WALK.half, WALK.radius).setCollisionGroups(GROUPS.walker).setFriction(0.2), rb);
  const self = { rb, col, yaw, feet: [...p], input: { mx: 0, mz: 0, run: false, jump: false }, anim: 'idle', platform: null, rel: null, ryaw: 0,
    grounded: false, vy: 0, vel: [0, 0, 0], enabled: true, ragdoll: 0, local: true };
  phys.tagCollider(col, { walker: self });
  const kcc = rw.createCharacterController(0.03);
  kcc.setUp({ x: 0, y: 1, z: 0 });
  kcc.enableAutostep(0.38, 0.2, true);
  kcc.enableSnapToGround(0.35);
  kcc.setMaxSlopeClimbAngle(52 * Math.PI / 180);
  kcc.setMinSlopeSlideAngle(56 * Math.PI / 180);
  kcc.setSlideEnabled(true);
  kcc.setApplyImpulsesToDynamicBodies(true);
  kcc.setCharacterMass(60);

  let jumpHeld = false, platPrevQ = null;
  let rag = null;           // { rb, col } while thrown

  function tick(dt) {
    if (!self.enabled) return;
    if (rag) { tickRag(dt); return; }
    const t = rb.translation();
    let pos = { x: t.x, y: t.y, z: t.z };

    // carried by the platform: start from where it moved my last spot to
    if (self.platform && self.rel) {
      const pb = self.platform.rb;
      if (!pb || !rw.getRigidBody(pb.handle)) { self.platform = null; }
      else {
        const pt = pb.translation(), pq = pb.rotation();
        const carried = add(pt, qrot(pq, self.rel));
        pos = { x: carried.x, y: carried.y, z: carried.z };
        if (platPrevQ) self.yaw = wrapAngle(self.yaw + wrapAngle(yawOf(pq) - yawOf(platPrevQ)));
        rb.setTranslation(pos, true);
      }
    }

    const water = world.waterAt ? world.waterAt(pos.x, pos.z) : null;
    const feetY = pos.y - lift;
    const swim = water != null && water - feetY > 1.0;
    const inp = self.input;
    const ml = Math.hypot(inp.mx, inp.mz);
    const mx = ml > 1 ? inp.mx / ml : inp.mx, mz = ml > 1 ? inp.mz / ml : inp.mz;
    const speed = swim ? WALK.swim : inp.run ? WALK.run : WALK.walk;
    // in the air you keep most of what you had and steer a little
    let vx, vz;
    if (self.grounded || swim) { vx = mx * speed; vz = mz * speed; }
    else if (self.jetpack?.fuel > 0 && inp.jump) { vx = self.vel[0]; vz = self.vel[2]; }
    else { vx = self.vel[0] + (mx * speed - self.vel[0]) * WALK.airControl * dt * 4; vz = self.vel[2] + (mz * speed - self.vel[2]) * WALK.airControl * dt * 4; }
    if (ml > 0.1) self.yaw = Math.atan2(mx, mz);

    // jetpack (worn): hold jump in the air to thrust up; burns fuel, refills on the ground; steer harder while flying
    const jp = self.jetpack;
    let thrusting = false;
    if (jp) {
      if (self.grounded) jp.fuel = Math.min(1, jp.fuel + dt / (jp.refill ?? 3));
      if (inp.jump && !self.grounded && !swim && jp.fuel > 0 && (jp.armed || self.vy < 2)) {
        thrusting = true; jp.armed = true;
        jp.fuel = Math.max(0, jp.fuel - dt / (jp.secs ?? 4));
        self.vy = Math.min(jp.maxUp ?? 7, self.vy + (jp.thrust ?? 30) * dt);
        vx = self.vel[0] + (mx * (jp.speed ?? 9) - self.vel[0]) * dt * 2.5; vz = self.vel[2] + (mz * (jp.speed ?? 9) - self.vel[2]) * dt * 2.5;
      }
      if (!inp.jump) jp.armed = false;
    }
    self.thrusting = thrusting;
    if (thrusting) { /* the jetpack owns vy this tick */ }
    else if (swim) {
      const target = water - 1.15;   // float with the head out
      self.vy = (target - feetY) * 4;
      if (inp.jump && !jumpHeld) self.vy = 3;
    } else if (self.grounded) {
      self.vy = -1;
      if (inp.jump && !jumpHeld) { self.vy = WALK.jump; self.grounded = false; self.platform = null; }
    } else self.vy -= WALK.gravity * dt;
    jumpHeld = inp.jump;

    const want = { x: vx * dt, y: self.vy * dt, z: vz * dt };
    kcc.computeColliderMovement(col, want, undefined, GROUPS.walker);
    const mv = kcc.computedMovement();
    const next = { x: pos.x + mv.x, y: pos.y + mv.y, z: pos.z + mv.z };
    // never below the ground (a heightfield edge case at speed)
    const gy = world.heightAt(next.x, next.z) + lift - 0.05;
    if (next.y < gy) next.y = gy;
    rb.setNextKinematicTranslation(next);
    const wasGround = self.grounded;
    self.grounded = kcc.computedGrounded() && self.vy <= 0.1;
    if (self.grounded && !wasGround && self.vy < -12) self.landHard = -self.vy;

    // what am I standing on?
    let plat = null;
    for (let i = 0; i < kcc.numComputedCollisions(); i++) {
      const c = kcc.computedCollision(i);
      if (!c || !c.collider) continue;
      const n = c.normal1 || c.normal2;
      const inf = phys.infoOf(c.collider);
      if (inf?.body && n && Math.abs(n.y) > 0.55) plat = inf.body;
    }
    if (!plat && self.grounded) {        // the snap-to-ground does not always report a collision: look straight down
      const hit = phys.raycast([next.x, next.y - lift + 0.3, next.z], [0, -1, 0], 0.6, { group: GROUPS.walker, excludeCollider: col });
      if (hit?.info?.body) plat = hit.info.body;
    }
    if (plat) {
      self.platform = plat;
      self.rel = qrotInv(plat.rb.rotation(), sub(next, plat.rb.translation()));
      platPrevQ = plat.rb.rotation();
    } else { self.platform = null; self.rel = null; platPrevQ = null; }

    self.vel = [mv.x / dt, mv.y / dt, mv.z / dt];
    self.feet = [next.x, next.y - lift, next.z];
    const hs = Math.hypot(vx, vz);
    self.anim = swim ? 'swim' : thrusting ? 'fly' : !self.grounded ? (self.vy > 0 ? 'jump' : 'fall') : hs > WALK.run * 0.75 ? 'run' : hs > 0.3 ? 'walk' : 'idle';
  }

  // --- thrown out of a vehicle ------------------------------------------------------------------------------------
  function tickRag(dt) {
    const t = rag.rb.translation(), v = rag.rb.linvel();
    self.feet = [t.x, t.y - 0.35, t.z];
    self.vel = [v.x, v.y, v.z];
    self.ragdoll -= dt;
    self.anim = 'rag';
    self.ragQ = rag.rb.rotation();
    const water = world.waterAt ? world.waterAt(t.x, t.z) : null;
    if (water != null && water > t.y) rag.rb.applyImpulse({ x: 0, y: 60 * 9.81 * 1.2 * dt, z: 0 }, true);
    if (self.ragdoll <= 0 && Math.hypot(v.x, v.y, v.z) < 1.5) standUp();
    if (self.ragdoll < -6) standUp();
  }
  function standUp() {
    const t = rag.rb.translation();
    phys.untagCollider(rag.col);
    rw.removeRigidBody(rag.rb);
    rag = null;
    const y = Math.max(t.y, world.heightAt(t.x, t.z) + 0.05);
    rb.setTranslation({ x: t.x, y: y + lift, z: t.z }, true);
    rw.getCollider(col.handle) && col.setEnabled(true);
    self.vel = [0, 0, 0]; self.vy = 0;
    self.anim = 'idle'; self.ragQ = null;
  }
  self.throwOut = (vel = [0, 0, 0], spin = [0, 0, 0], from = null) => {
    if (rag) return;
    const start = from || [self.feet[0], self.feet[1] + 0.5, self.feet[2]];
    col.setEnabled(false);
    const body = rw.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start[0], start[1], start[2])
      .setLinvel(vel[0], vel[1], vel[2]).setAngvel({ x: spin[0], y: spin[1], z: spin[2] }).setCcdEnabled(true).setAngularDamping(0.8).setLinearDamping(0.15));
    const c = rw.createCollider(RAPIER.ColliderDesc.capsule(0.35, 0.33).setMass(60).setFriction(0.9).setRestitution(0.2).setCollisionGroups(GROUPS.ragdoll), body);
    phys.tagCollider(c, { walker: self, rag: true });
    rag = { rb: body, col: c };
    self.ragdoll = 1.4;
    self.enabled = true;
    self.platform = null;
  };

  self.disable = () => { self.enabled = false; col.setEnabled(false); self.platform = null; rb.setTranslation({ x: 0, y: -500, z: 0 }, true); };
  self.enable = (p, yaw = self.yaw) => {
    self.enabled = true;
    col.setEnabled(true);
    const y = Math.max(p[1], world.heightAt(p[0], p[2]));
    rb.setTranslation({ x: p[0], y: y + lift, z: p[2] }, true);
    self.feet = [p[0], y, p[2]]; self.yaw = yaw; self.vy = 0; self.grounded = false;
  };
  self.teleport = p => self.enable(p);
  self.isRag = () => !!rag;
  self.state = () => {
    const s = { p: self.feet.map(r3), yaw: r3(self.yaw), a: self.anim };
    if (self.platform && self.rel && self.platform.id != null) {
      s.on = self.platform.id;
      s.rel = [r3(self.rel.x), r3(self.rel.y - lift), r3(self.rel.z)];
      s.ryaw = r3(wrapAngle(self.yaw - yawOf(self.platform.rb.rotation())));
    }
    if (self.ragQ) s.rq = [self.ragQ.x, self.ragQ.y, self.ragQ.z, self.ragQ.w].map(v => Math.round(v * 1e4) / 1e4);
    return s;
  };
  self.dispose = () => { off(); if (rag) { rw.removeRigidBody(rag.rb); } phys.untagCollider(col); rw.removeRigidBody(rb); };
  const off = phys.onTick(tick);
  return self;
}
const r3 = v => Math.round(v * 1000) / 1000;
