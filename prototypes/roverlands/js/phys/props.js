// Loose things you can pick up, carry, drop, throw and pack into a trunk: crates, bags, a ball. Each is a small
// dynamic body with continuous collision on (CCD) — a crate sliding around a trunk at 25 m/s is exactly the case where
// a body moves further in one tick than the trunk wall is thick, and without CCD it would simply pass through.
//
//   const crate = createProp(phys, PROP_KINDS.crate, { id, p: [x,y,z], local: true });
//   crate.carry(walker) / crate.drop([vx,vy,vz])     // held in front of the walker's hands
//   crate.setLocal(bool) / crate.setRemote(p, q, v, w) / crate.state()   // same network shape as a vehicle
import { GROUPS, G } from './physics.js';
import { qrot, add, fromArr } from './vmath.js';

export const PROP_KINDS = {
  crate: { kind: 'crate', shape: { t: 'box', hx: 0.3, hy: 0.25, hz: 0.3 }, mass: 25, friction: 0.7 },
  bag: { kind: 'bag', shape: { t: 'box', hx: 0.25, hy: 0.15, hz: 0.18 }, mass: 8, friction: 0.9 },
  barrel: { kind: 'barrel', shape: { t: 'cyl', r: 0.28, h: 0.85 }, mass: 40, friction: 0.6 },
  ball: { kind: 'ball', shape: { t: 'ball', r: 0.9 }, mass: 30, friction: 0.5, restitution: 0.75 },
};

export function createProp(phys, def, { id = 0, p = [0, 1, 0], local = true } = {}) {
  const { RAPIER, rw } = phys;
  const rb = rw.createRigidBody((local ? RAPIER.RigidBodyDesc.dynamic() : RAPIER.RigidBodyDesc.kinematicPositionBased())
    .setTranslation(p[0], p[1], p[2]).setCcdEnabled(true).setLinearDamping(0.05).setAngularDamping(0.3));
  // soft CCD: also look ahead for contacts with things that move (a trunk swinging round in a skid), not only walls
  // (soft CCD prediction made squeezed crates fly off at 50 m/s; plain CCD + thick walls is what holds them)
  const sh = def.shape;
  const d = sh.t === 'box' ? RAPIER.ColliderDesc.cuboid(sh.hx, sh.hy, sh.hz) : sh.t === 'cyl' ? RAPIER.ColliderDesc.cylinder(sh.h / 2, sh.r) : RAPIER.ColliderDesc.ball(sh.r);
  const col = rw.createCollider(d.setMass(def.mass).setFriction(def.friction ?? 0.7).setRestitution(def.restitution ?? 0.1).setCollisionGroups(GROUPS.prop), rb);
  const self = { id, def, kind: def.kind, rb, local, colliders: [col], carriedBy: null };
  phys.tagCollider(col, { body: self, prop: true });
  let remote = null;
  const tick = () => {
    if (self.carriedBy) {
      // held in front of the hands, at chest height; a kinematic body still pushes things it is swung into
      const w = self.carriedBy, y = w.yaw;
      // carried in front of the hands at chest height — or, worn (a jetpack), on the back
      const back = self.worn ? -0.32 : 0.6, up = self.worn ? 0.95 : 0.95 + (sh.hy ?? sh.r ?? 0.3);
      const hold = { x: w.feet[0] + Math.sin(y) * back, y: w.feet[1] + up, z: w.feet[2] + Math.cos(y) * back };
      rb.setNextKinematicTranslation(hold);
      rb.setNextKinematicRotation({ x: 0, y: Math.sin(y / 2), z: 0, w: Math.cos(y / 2) });
      return;
    }
    if (!self.local && remote) { rb.setNextKinematicTranslation(remote.p); rb.setNextKinematicRotation(remote.q); }
  };
  const off = phys.onTick(tick);
  self.carry = (walker, { wear = false } = {}) => {
    self.carriedBy = walker; self.worn = wear;
    rb.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    col.setCollisionGroups(GROUPS.prop & ~G.WALKER & ~G.RAGDOLL);   // carried: never bumps people (the carrier's own capsule)
  };
  self.drop = (vel = [0, 0, 0]) => {
    self.carriedBy = null; self.worn = false;
    col.setCollisionGroups(GROUPS.prop);
    if (self.local) { rb.setBodyType(RAPIER.RigidBodyType.Dynamic, true); rb.setLinvel({ x: vel[0], y: vel[1], z: vel[2] }, true); }
  };
  self.setLocal = on => {
    if (on === self.local) return;
    self.local = on;
    if (self.carriedBy) return;
    rb.setBodyType(on ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.KinematicPositionBased, true);
    if (on && remote?.v) rb.setLinvel({ x: remote.v[0], y: remote.v[1], z: remote.v[2] }, true);
  };
  self.setRemote = (p, q, v, w) => { remote = { p: { x: p[0], y: p[1], z: p[2] }, q: { x: q[0], y: q[1], z: q[2], w: q[3] }, v, w }; };
  self.state = () => {
    const t = rb.translation(), q = rb.rotation(), v = rb.linvel(), w = rb.angvel();
    const r = n => Math.round(n * 1000) / 1000;
    return { p: [r(t.x), r(t.y), r(t.z)], q: [q.x, q.y, q.z, q.w].map(n => Math.round(n * 1e4) / 1e4), v: [r(v.x), r(v.y), r(v.z)], w: [r(w.x), r(w.y), r(w.z)], x: [self.carriedBy ? (self.worn ? 2 : 1) : 0, self.flame ? 1 : 0] };
  };
  self.applyExtras = x => { self.remoteCarried = x?.[0] || 0; self.flame = !!x?.[1]; };
  self.speed = () => { const v = rb.linvel(); return Math.hypot(v.x, v.y, v.z); };
  self.toWorld = lp => add(rb.translation(), qrot(rb.rotation(), lp));
  self.dispose = () => { off(); phys.untagCollider(col); rw.removeRigidBody(rb); };
  return self;
}
