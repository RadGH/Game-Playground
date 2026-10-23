// Knockabout — physics world setup on cannon-es. PURE: no DOM, no three.js.
//
// What lives here:
//   * createPhysics(tuning): the cannon World, its materials and collision groups.
//   * RopeConstraint: a "no further than L" link (an arm). Unlike cannon's DistanceConstraint it only PULLS,
//     so a hand can swing anywhere inside arm's reach, and a hand holding something heavy really drags the torso.
//   * driveKinematic(): move a kinematic body to a target pose THROUGH velocity, so the things it pushes get
//     shoved properly (setting .position directly teleports through fighters).
//   * Small vector helpers shared by the other sim files.

import * as CANNON from '../../../../vendor/cannon-es/cannon-es.js';

export { CANNON };

// Collision groups (bit flags). The ground ray of a fighter ignores FIGHTER, so you cannot stand on heads.
export const G = {
  STATIC: 1,     // arena floors, walls, ropes, ledges
  FIGHTER: 2,    // torso + head of every fighter
  HAND: 4,       // hands
  PROP: 8,       // crates, balls, barrels
  HAZARD: 16,    // blades, pistons, crushers, sweepers, drop panels, movers
};
export const ALL = 31;

export function createPhysics(tuning) {
  const P = tuning.physics;
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, P.gravity, 0) });
  world.allowSleep = false;
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = P.iterations;
  world.solver.tolerance = 0.001;
  world.quatNormalizeFast = false; // the fast version diverges on fast-spinning bodies (seen: a hand at 264 rad/s -> NaN)
  world.quatNormalizeSkip = 0;

  // A fighter's own parts never collide with each other (hands passing through your own belly would jitter),
  // and a hand never collides with whatever it is gripping (the grip constraint holds it).
  const bp = world.broadphase;
  const base = bp.needBroadphaseCollision.bind(bp);
  bp.needBroadphaseCollision = (a, b) => {
    if (a.fid != null && a.fid === b.fid) return false;
    if (a.noCollide && a.noCollide.has(b)) return false;
    if (b.noCollide && b.noCollide.has(a)) return false;
    return base(a, b);
  };

  const mats = {
    ground: new CANNON.Material('ground'),
    fighter: new CANNON.Material('fighter'),
    hand: new CANNON.Material('hand'),
    prop: new CANNON.Material('prop'),
    bouncy: new CANNON.Material('bouncy'),
    ice: new CANNON.Material('ice'),
    hazard: new CANNON.Material('hazard'),
  };
  world.defaultContactMaterial.friction = P.friction;
  world.defaultContactMaterial.restitution = 0.05;
  const cm = (a, b, friction, restitution) => world.addContactMaterial(new CANNON.ContactMaterial(a, b, { friction, restitution }));
  cm(mats.fighter, mats.ground, 0.5, 0.0);
  cm(mats.fighter, mats.fighter, 0.2, 0.15);
  cm(mats.hand, mats.fighter, 0.6, 0.05);
  cm(mats.fighter, mats.bouncy, 0.2, 0.9);
  cm(mats.hand, mats.bouncy, 0.6, 0.4);
  cm(mats.prop, mats.bouncy, 0.2, 0.8);
  cm(mats.fighter, mats.ice, 0.02, 0.0);
  cm(mats.prop, mats.ground, 0.5, 0.15);
  cm(mats.fighter, mats.hazard, 0.1, 0.3);

  return { world, mats, CANNON };
}

/** Make a body that belongs to the static arena (or a kinematic hazard when `kinematic`). */
export function addShapeBody(world, def, mat, opts = {}) {
  const body = new CANNON.Body({
    mass: 0,
    type: opts.kinematic ? CANNON.Body.KINEMATIC : CANNON.Body.STATIC,
    material: mat,
    collisionFilterGroup: opts.group ?? G.STATIC,
    collisionFilterMask: opts.mask ?? ALL,
  });
  body.addShape(shapeFor(def));
  const p = def.p || [0, 0, 0];
  body.position.set(p[0], p[1], p[2]);
  if (def.rot) body.quaternion.setFromEuler(def.rot[0] || 0, def.rot[1] || 0, def.rot[2] || 0, 'YXZ');
  world.addBody(body);
  return body;
}

/** Plain-data shape -> cannon shape. box {size}, cyl {r, h} (Y axis), sphere {r}, ramp = box. */
export function shapeFor(def) {
  if (def.type === 'cyl') return new CANNON.Cylinder(def.r, def.r, def.h, def.segments || 16);
  if (def.type === 'sphere') return new CANNON.Sphere(def.r);
  const s = def.size;
  return new CANNON.Box(new CANNON.Vec3(s[0] / 2, s[1] / 2, s[2] / 2));
}

/**
 * Rope: keep bodyB's centre within `length` of a pivot on bodyA. Pulls only (never pushes).
 * Built from one ContactEquation flipped inside out: g = L - distance must stay >= 0.
 */
export class RopeConstraint extends CANNON.Constraint {
  constructor(bodyA, pivotA, bodyB, length, maxForce = 1e6) {
    super(bodyA, bodyB, { collideConnected: false });
    this.pivotA = pivotA.clone();
    this.length = length;
    const eq = this.eq = new CANNON.ContactEquation(bodyA, bodyB);
    eq.minForce = 0;
    eq.maxForce = maxForce;
    this.equations.push(eq);
    this._w = new CANNON.Vec3();
    this._u = new CANNON.Vec3();
  }
  update() {
    const a = this.bodyA, b = this.bodyB, eq = this.eq;
    a.quaternion.vmult(this.pivotA, this._w);            // pivot offset in world space
    const ux = b.position.x - (a.position.x + this._w.x);
    const uy = b.position.y - (a.position.y + this._w.y);
    const uz = b.position.z - (a.position.z + this._w.z);
    const d = Math.hypot(ux, uy, uz) || 1e-6;
    this.dist = d;
    eq.enabled = d > this.length * 0.97;
    this._u.set(ux / d, uy / d, uz / d);
    eq.ni.set(-this._u.x, -this._u.y, -this._u.z);
    eq.ri.set(this._w.x + this._u.x * this.length, this._w.y + this._u.y * this.length, this._w.z + this._u.z * this.length);
    eq.rj.set(0, 0, 0);
  }
}

const _q = new CANNON.Quaternion();
const _qi = new CANNON.Quaternion();
/** Drive a kinematic body to (pos, quat) over the next `dt` by setting its velocities. */
export function driveKinematic(body, pos, quat, dt) {
  if (!(dt > 0)) { body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0); return; }
  body.velocity.set((pos[0] - body.position.x) / dt, (pos[1] - body.position.y) / dt, (pos[2] - body.position.z) / dt);
  if (quat) {
    _q.set(quat[0], quat[1], quat[2], quat[3]);
    body.quaternion.conjugate(_qi);
    _q.mult(_qi, _q);             // rotation from current to target
    if (_q.w < 0) { _q.x = -_q.x; _q.y = -_q.y; _q.z = -_q.z; _q.w = -_q.w; }
    const s = Math.sqrt(Math.max(0, 1 - _q.w * _q.w));
    const ang = 2 * Math.acos(Math.min(1, _q.w));
    if (s < 1e-6) body.angularVelocity.set(0, 0, 0);
    else body.angularVelocity.set(_q.x / s * ang / dt, _q.y / s * ang / dt, _q.z / s * ang / dt);
  } else body.angularVelocity.set(0, 0, 0);
}

/** Quaternion [x,y,z,w] for a rotation of `a` radians around Y, then optional euler extras. */
export function quatYaw(a) { return [0, Math.sin(a / 2), 0, Math.cos(a / 2)]; }
export function quatEuler(x, y, z) {
  _q.setFromEuler(x, y, z, 'YXZ');
  return [_q.x, _q.y, _q.z, _q.w];
}

export const r2 = (v) => Math.round(v * 100) / 100;
export const r3 = (v) => Math.round(v * 1000) / 1000;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
