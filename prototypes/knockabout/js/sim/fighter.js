// Knockabout — the fighter puppet and its controller. PURE: no DOM, no three.js.
//
// A fighter is four cannon bodies:
//   torso  — one body with three spheres (legs, hips, chest). It FLOATS on a spring: a ray down from its
//            centre finds the ground and a spring holds it at standing height. Legs and feet are drawn, not
//            simulated (feet are placed by a little stepping routine below), which keeps 8 fighters cheap and
//            stable while still wobbling when hit.
//   head   — a sphere on a ball joint, held over the torso by a soft spring (so it bobbles).
//   hands  — two spheres tied to the shoulders by RopeConstraints (arm length). A spring pulls each hand
//            toward a pose target; the hand's push comes back on the torso, so carrying someone heavy is heavy.
// The balance controller (upright torque + yaw torque + stand spring) is what makes it stand and wobble.
// Knocked down = the controller switches off and the puppet goes limp.
//
// Hands: index 0 = LEFT (L1 / grabL / raiseL), 1 = RIGHT (R1 / grabR / raiseR).
// Facing: forward = (sin face, 0, cos face). The fighter's left hand is on its +x side when facing +z.

import { CANNON, G, ALL, RopeConstraint, clamp, wrapAngle, r2, r3 } from './physics.js';

const UP = new CANNON.Vec3(0, 1, 0);
const FWD = new CANNON.Vec3(0, 0, 1);
const SIDE = [1, -1];              // local x sign of the left / right shoulder
const SHOULDER = [0.3, 0.22, 0.02]; // local shoulder offset (x mirrored per side)
const NECK_Y = 0.42;
const HEAD_UP = 0.62;              // head centre above torso centre
const HIP = [0.13, -0.42, 0];      // where legs hang from, local

// Hand pose targets relative to the shoulder, torso-local (+z forward, +y up, x mirrored per side).
const POSE = {
  rest:        [0.08, -0.52, 0.12],
  windup:      [-0.12, -0.04, 0.16],
  reach:       [-0.1, 0.02, 0.62],
  raised:      [0.03, 0.6, 0.06],
  raisedReach: [-0.06, 0.45, 0.42],
  punch:       [-0.14, 0.06, 1.05],
  lift:        [-0.14, 0.78, 0.12],
  carry:       [-0.1, 0.0, 0.5],
};

const _v = new CANNON.Vec3();
const _w = new CANNON.Vec3();
const _a = new CANNON.Vec3();
const _b = new CANNON.Vec3();
const _ray = new CANNON.RaycastResult();
const _from = new CANNON.Vec3();
const _to = new CANNON.Vec3();

export function createFighter(ctx, spec) {
  const T = ctx.tuning.fighter;
  const R = ctx.tuning.rules;
  const { world, mats } = ctx;
  const g = -ctx.tuning.physics.gravity;
  const stats = Object.assign({ punchesToDown: R.punchesToDown, speed: 1, punch: 1, mass: 1 }, spec.stats || {});

  const pid = spec.pid;
  const mk = (mass, mat, group, mask) => {
    const b = new CANNON.Body({ mass, material: mat, collisionFilterGroup: group, collisionFilterMask: mask, linearDamping: 0.05, angularDamping: 0.3 });
    b.fid = pid;
    return b;
  };
  const torso = mk(T.torsoMass * stats.mass, mats.fighter, G.FIGHTER, ALL);
  torso.addShape(new CANNON.Sphere(T.legsR), new CANNON.Vec3(0, -0.5, 0));
  torso.addShape(new CANNON.Sphere(T.torsoR), new CANNON.Vec3(0, -0.12, 0));
  torso.addShape(new CANNON.Sphere(T.chestR), new CANNON.Vec3(0, 0.2, 0));
  torso.part = 'torso';
  const head = mk(T.headMass * stats.mass, mats.fighter, G.FIGHTER, ALL);
  head.addShape(new CANNON.Sphere(T.headR));
  head.part = 'head';
  head.angularDamping = 0.6;
  const hands = [0, 1].map((i) => {
    const h = mk(T.handMass, mats.hand, G.HAND, ALL);
    h.addShape(new CANNON.Sphere(T.handR));
    h.part = 'hand';
    h.hand = i;
    h.linearDamping = 0.2;
    h.noCollide = new Set();
    return h;
  });
  const bodies = [torso, head, hands[0], hands[1]];
  const mTot = torso.mass + head.mass + hands[0].mass + hands[1].mass;

  const neck = new CANNON.PointToPointConstraint(torso, new CANNON.Vec3(0, NECK_Y, 0), head, new CANNON.Vec3(0, -0.2, 0), 2000);
  neck.collideConnected = false;
  const arms = hands.map((h, i) => new RopeConstraint(torso, new CANNON.Vec3(SHOULDER[0] * SIDE[i], SHOULDER[1], SHOULDER[2]), h, T.armLen, 3000));
  const constraints = [neck, ...arms];

  const f = {
    pid, team: spec.team ?? 0, bot: !!spec.cpu || !!spec.goon, goon: !!spec.goon, name: spec.name || ('P' + pid),
    look: spec.look || null, level: spec.level || 'normal', stats,
    torso, head, hands, bodies,
    alive: true, inWorld: false, out: null, down: 0, downs: 0, limp: 0, daze: [], dazeImmune: 0,
    face: 0, wantFace: 0, grounded: false, groundY: 0, groundBody: null, jumpLock: 0, jumpCd: 0,
    input: blankInput(), prev: blankInput(),
    hand: [newHand(), newHand()],
    raise: [0, 0],
    feet: [[0, 0, 0], [0, 0, 0]], footT: [1, 1], footFrom: [null, null], footTo: [null, null],
    lastBy: null, struggle: 0, gripsOnMe: 0, hazardCd: {},
    stats: stats,
    tally: { punches: 0, hits: 0, downsGiven: 0, outs: 0, throws: 0 },
  };

  function newHand() { return { held: false, pressT: 0, grip: null, punchT: 0, punchHit: false, punchDir: null, cooldown: 0, grabbedThisPress: false }; }

  f.spawn = (pos, yaw) => {
    f.alive = true; f.out = null; f.down = 0; f.limp = 0; f.daze = []; f.lastBy = null; f.struggle = 0; f.dazeImmune = 0;
    f.face = f.wantFace = yaw; f.jumpLock = 0; f.jumpCd = 0;
    f.hand = [newHand(), newHand()];
    f.raise = [0, 0];
    f.input = blankInput(); f.prev = blankInput();
    const q = new CANNON.Quaternion(); q.setFromAxisAngle(UP, yaw);
    const place = (b, local) => {
      q.vmult(new CANNON.Vec3(local[0], local[1], local[2]), _v);
      b.position.set(pos[0] + _v.x, pos[1] + _v.y, pos[2] + _v.z);
      b.quaternion.copy(q);
      b.velocity.set(0, 0, 0); b.angularVelocity.set(0, 0, 0);
      b.force.set(0, 0, 0); b.torque.set(0, 0, 0);
    };
    const base = [0, T.standHeight, 0];
    place(torso, base);
    place(head, [0, T.standHeight + HEAD_UP, 0]);
    hands.forEach((h, i) => place(h, [(SHOULDER[0] + POSE.rest[0]) * SIDE[i], T.standHeight + SHOULDER[1] + POSE.rest[1], POSE.rest[2]]));
    for (let i = 0; i < 2; i++) {
      q.vmult(new CANNON.Vec3(HIP[0] * SIDE[i], 0, 0), _v);
      f.feet[i] = [pos[0] + _v.x, pos[1], pos[2] + _v.z];
      f.footT[i] = 1;
    }
    f.addToWorld();
  };

  f.addToWorld = () => {
    if (f.inWorld) return;
    bodies.forEach((b) => world.addBody(b));
    constraints.forEach((c) => world.addConstraint(c));
    f.inWorld = true;
  };
  f.removeFromWorld = () => {
    if (!f.inWorld) return;
    f.releaseAll(false);
    ctx.releaseGripsOn(f);
    constraints.forEach((c) => world.removeConstraint(c));
    bodies.forEach((b) => world.removeBody(b));
    f.inWorld = false;
  };

  f.setInput = (inp) => { f.input = normInput(inp); };

  // ---------------------------------------------------------------- knockdown / daze
  f.knockDown = (secs, counted = true, by = null) => {
    if (!f.alive) return;
    const wasDown = f.down > 0;
    f.down = Math.max(f.down, secs);
    f.limp = f.down;
    if (counted) f.downs++;
    f.daze = [];
    f.releaseAll(false);
    if (by != null) credit(by);
    if (!wasDown || counted) ctx.emit({ e: 'down', pid, secs: r2(f.down) });
  };
  f.downSecsNext = () => Math.min(R.downMax, R.downBase + R.downStep * f.downs);
  f.addDaze = (by, amount = 1) => {
    if (!f.alive || f.down > 0 || f.dazeImmune > 0) return false;
    for (let i = 0; i < amount; i++) f.daze.push(ctx.now());
    credit(by);
    if (f.daze.length >= (ctx.sudden && ctx.sudden() ? 1 : f.stats.punchesToDown)) {
      const s = f.downSecsNext();
      f.knockDown(s, true, by);
      const att = ctx.fighterBy(by);
      if (att) att.tally.downsGiven++;
      return true;
    }
    return false;
  };
  // Credit for knocking someone out goes to the last OPPONENT who hit, threw or grabbed them.
  function credit(by) {
    if (by == null || by === pid) return;
    const o = ctx.fighterBy(by);
    if (o && !ctx.isEnemy(o, f)) return;
    f.lastBy = { pid: by, t: ctx.now() };
  }
  f.credit = credit;
  f.creditPid = () => (f.lastBy && ctx.now() - f.lastBy.t <= R.creditSecs ? f.lastBy.pid : null);

  // ---------------------------------------------------------------- grips
  f.releaseHand = (i, allowThrow) => {
    const h = f.hand[i];
    if (!h.grip) return;
    const gp = h.grip;
    world.removeConstraint(gp.c);
    hands[i].noCollide.delete(gp.body);
    h.grip = null;
    if (gp.fighter) gp.fighter.gripsOnMe = Math.max(0, gp.fighter.gripsOnMe - 1);
    ctx.emit({ e: 'release', pid, hand: i });
    const other = f.hand[1 - i].grip;
    const stillHeld = other && ((gp.fighter && other.fighter === gp.fighter) || (gp.prop && other.prop === gp.prop));
    if (allowThrow && !stillHeld && (gp.fighter || gp.prop)) maybeThrow(gp);
  };
  f.releaseAll = (allowThrow) => { f.releaseHand(0, allowThrow); f.releaseHand(1, allowThrow); };

  function maybeThrow(gp) {
    const tb = gp.fighter ? gp.fighter.torso : gp.body;
    const fw = forward();
    const speed = Math.hypot(torso.velocity.x, torso.velocity.z);
    const lifted = tb.position.y > torso.position.y + 0.25;
    const moving = speed > 1.2 || !f.grounded;
    if (!lifted && !moving) return;
    const k = lifted ? 1 : 0.55;
    const dvx = fw.x * T.throwForward * k + torso.velocity.x * T.throwCarry;
    const dvz = fw.z * T.throwForward * k + torso.velocity.z * T.throwCarry;
    const dvy = T.throwUp * k + Math.max(0, torso.velocity.y) * T.throwCarry;
    const list = gp.fighter ? gp.fighter.bodies : [gp.body];
    for (const b of list) { b.velocity.x += dvx; b.velocity.y += dvy; b.velocity.z += dvz; }
    f.tally.throws++;
    if (gp.fighter) {
      gp.fighter.credit(pid);
      if (gp.fighter.down <= 0) gp.fighter.knockDown(R.thrownSecs, false, pid);
      else gp.fighter.limp = Math.max(gp.fighter.limp, 0.4);
      ctx.emit({ e: 'throw', pid, who: gp.fighter.pid });
    } else if (gp.prop) {
      gp.prop.lastBy = { pid, t: ctx.now() };
      ctx.emit({ e: 'throw', pid, who: 'p:' + gp.prop.id });
    }
  }

  function tryGrip(i, other, point) {
    const h = f.hand[i];
    if (h.grip) return;
    let ref, fighter = null, prop = null;
    if (other.fid != null) {
      if (other.fid === pid) return;
      fighter = ctx.fighterBy(other.fid);
      if (!fighter || !fighter.alive) return;
      if (f.bot && !ctx.isEnemy(f, fighter)) return; // bots never grab their own side (people may)
      ref = 'f:' + other.fid;
    } else if (other.prop) { prop = other.prop; ref = 'p:' + prop.id; }
    else if (other.grabbable) ref = 'w';
    else return;
    const hb = hands[i];
    // Pivot: the hand's surface toward the touch point, and the same world point on the other body.
    const wp = new CANNON.Vec3(point[0], point[1], point[2]);
    const pa = new CANNON.Vec3(); const pb = new CANNON.Vec3();
    hb.pointToLocalFrame(wp, pa);
    const len = pa.length();
    if (len > T.handR) pa.scale(T.handR / len, pa);
    other.pointToLocalFrame(wp, pb);
    const c = new CANNON.PointToPointConstraint(hb, pa, other, pb, T.grabMaxForce);
    c.collideConnected = false;
    world.addConstraint(c);
    hb.noCollide.add(other);
    h.grip = { c, ref, body: other, fighter, prop, pa, pb, t: ctx.now() };
    h.grabbedThisPress = true;
    if (fighter) { fighter.gripsOnMe++; if (fighter.down > 0) fighter.credit(pid); }
    ctx.emit({ e: 'grab', pid, hand: i, ref });
  }

  // ---------------------------------------------------------------- per step: before physics
  f.preStep = (dt) => {
    if (!f.alive || !f.inWorld) return;
    const inp = f.input, prev = f.prev;
    const now = ctx.now();
    f.jumpLock = Math.max(0, f.jumpLock - dt);
    f.jumpCd = Math.max(0, f.jumpCd - dt);
    f.dazeImmune = Math.max(0, f.dazeImmune - dt);
    f.stagger = Math.max(0, (f.stagger || 0) - dt);
    f.struggle = Math.max(0, f.struggle - dt * 1.2);
    if (f.daze.length && now - f.daze[0] > R.dazeWindow) f.daze = f.daze.filter((t) => now - t <= R.dazeWindow);

    // Down / limp timers.
    if (f.down > 0) {
      f.down = Math.max(0, f.down - dt);
      if (f.down === 0) { f.dazeImmune = 1.5; ctx.emit({ e: 'up', pid }); }
    }
    f.limp = Math.max(0, f.limp - dt);
    const limp = f.down > 0 || f.limp > 0;

    // Struggle out of someone's grip by mashing the grab buttons.
    for (let i = 0; i < 2; i++) {
      const pressed = (i ? inp.grabR : inp.grabL) && !(i ? prev.grabR : prev.grabL);
      if (pressed && f.gripsOnMe > 0 && !limp) {
        f.struggle += 1;
        if (f.struggle >= T.struggleTaps) { f.struggle = 0; ctx.releaseGripsOn(f, true); }
      }
    }

    // hands are spheres: their spin means nothing and only feeds the solver huge numbers
    hands[0].angularVelocity.set(0, 0, 0); hands[1].angularVelocity.set(0, 0, 0);
    groundProbe(limp);
    if (!limp) {
      balance(dt, inp);
      move(dt, inp);
      if (inp.jump && !prev.jump && f.grounded && f.jumpCd <= 0) jump();
      else if (inp.jump && !prev.jump && !f.grounded && f.jumpCd <= 0 && hangingFrom()) climb(hangingFrom());
    }
    handsStep(dt, inp, prev, limp);
    headSpring(limp);
    f.prev = inp;
  };

  function forward() {
    torso.quaternion.vmult(FWD, _w);
    const l = Math.hypot(_w.x, _w.z) || 1;
    return { x: _w.x / l, z: _w.z / l };
  }
  f.forward = forward;
  f.yaw = () => { const fw = forward(); return Math.atan2(fw.x, fw.z); };

  function groundProbe(limp) {
    const p = torso.position;
    _from.set(p.x, p.y, p.z);
    _to.set(p.x, p.y - (T.standHeight + T.standReach + 0.4), p.z);
    _ray.reset();
    world.raycastClosest(_from, _to, { collisionFilterMask: G.STATIC | G.PROP | G.HAZARD, skipBackfaces: true }, _ray);
    if (_ray.hasHit) {
      f.groundDist = _ray.distance;
      f.groundY = _ray.hitPointWorld.y;
      f.groundBody = _ray.body;
    } else { f.groundDist = Infinity; f.groundBody = null; }
    const h = f.input.duck ? T.duckHeight : T.standHeight;
    f.grounded = !limp && f.groundDist <= h + 0.15 && f.jumpLock <= 0;
  }

  function groundVel() {
    const b = f.groundBody;
    if (!b || f.groundDist === Infinity) return [0, 0, 0];
    let vx = 0, vy = 0, vz = 0;
    if (b.type === CANNON.Body.KINEMATIC) {
      // velocity of the surface point under us (linear + spin)
      const rx = torso.position.x - b.position.x, rz = torso.position.z - b.position.z;
      const w = b.angularVelocity;
      vx = b.velocity.x + (w.y * rz); vz = b.velocity.z - (w.y * rx); vy = b.velocity.y;
    }
    if (b.belt) { vx += b.belt[0]; vz += b.belt[2]; }
    return [vx, vy, vz];
  }

  function balance(dt, inp) {
    // Upright: torque the torso's up vector toward world up (leaning a touch into the walk).
    torso.quaternion.vmult(UP, _v);
    const lean = 0.16;
    const ux = (f.walkDir ? f.walkDir[0] : 0) * lean, uz = (f.walkDir ? f.walkDir[1] : 0) * lean;
    const wl = Math.hypot(ux, 1, uz);
    const tx = ux / wl, ty = 1 / wl, tz = uz / wl;
    // axis = up x target
    let ax = _v.y * tz - _v.z * ty, ay = _v.z * tx - _v.x * tz, az = _v.x * ty - _v.y * tx;
    if (_v.x * tx + _v.y * ty + _v.z * tz < 0) { // more than 90 degrees out: push at full strength
      const l = Math.hypot(ax, ay, az) || 1; ax /= l; ay /= l; az /= l;
    }
    const boost = f.dazeImmune > 0 && f.dazeImmune > 0.7 ? T.getUpBoost : 1;
    const I = torso.inertia;
    const w = torso.angularVelocity;
    torso.torque.x += I.x * (T.uprightK * boost * ax - T.uprightD * w.x);
    torso.torque.z += I.z * (T.uprightK * boost * az - T.uprightD * w.z);
    // Yaw toward the wanted facing.
    const err = wrapAngle(f.wantFace - f.yaw());
    torso.torque.y += I.y * (T.yawK * err - T.yawD * w.y) + I.y * T.uprightK * ay * 0.2;

    // Stand spring.
    const h = inp.duck ? T.duckHeight : T.standHeight;
    if (f.groundDist < h + T.standReach && f.jumpLock <= 0) {
      const gv = groundVel();
      const a = T.standK * (h - f.groundDist) - T.standD * (torso.velocity.y - gv[1]);
      let F = mTot * (a + g) + Math.max(0, -(f.handLoadY || 0));
      F = clamp(F, 0, T.standMaxForce * stats.mass);
      torso.force.y += F;
      if (f.groundBody && f.groundBody.type === CANNON.Body.DYNAMIC) f.groundBody.force.y -= F * 0.5;
    }
  }

  function move(dt, inp) {
    const mx = inp.mx, mz = inp.mz;
    const ml = Math.hypot(mx, mz);
    // World direction: +x right, -z away from the camera => world (x, z) = (mx, mz). Unit direction x tilt amount.
    const dirX = ml > 1e-6 ? mx / ml : 0, dirZ = ml > 1e-6 ? mz / ml : 0;
    const mag = Math.min(1, ml);
    f.walkDir = mag > 0.15 ? [dirX * mag, dirZ * mag] : null;
    if (mag > 0.2) f.wantFace = Math.atan2(dirX, dirZ);
    // carrying someone is slow — slower still if they are on their feet and pulling the other way
    let carry = 0;
    for (const h of f.hand) if (h.grip && (h.grip.fighter || h.grip.prop)) carry = Math.max(carry, h.grip.fighter && h.grip.fighter.down <= 0 ? 2 : 1);
    const speed = (inp.duck ? T.duckSpeed : carry === 2 ? T.carrySpeed * 0.75 : carry ? T.carrySpeed : T.walkSpeed) * stats.speed;
    const gv = f.grounded ? groundVel() : [0, 0, 0];
    const vx = torso.velocity.x, vz = torso.velocity.z;
    if (f.grounded) {
      const tx = dirX * speed * mag + gv[0], tz = dirZ * speed * mag + gv[2];
      const acc = T.walkAccel * (f.stagger > 0 ? 0.15 : 1);
      let fx = mTot * acc * (tx - vx), fz = mTot * acc * (tz - vz);
      const cap = mTot * acc * speed * 1.4;
      const fl = Math.hypot(fx, fz);
      if (fl > cap) { fx *= cap / fl; fz *= cap / fl; }
      torso.force.x += fx; torso.force.z += fz;
    } else if (mag > 0.2) {
      const tx = dirX * speed * mag, tz = dirZ * speed * mag;
      // air control only adds, never brakes a flight (so throws and knock-backs carry)
      const ax = tx - vx, az = tz - vz;
      if (ax * dirX + az * dirZ > 0) { torso.force.x += mTot * T.airAccel * ax; torso.force.z += mTot * T.airAccel * az; }
    }
  }

  function jump() {
    const gv = groundVel();
    const vy = T.jumpVel + Math.max(0, gv[1]);
    for (const b of bodies) b.velocity.y = Math.max(b.velocity.y, vy * (b === torso ? 1 : 0.9));
    f.jumpLock = 0.22; f.jumpCd = T.jumpCooldown; f.grounded = false;
    ctx.emit({ e: 'jump', pid });
  }

  // Hanging from a rope / rim / rail? Returns the grip point, or null.
  function hangingFrom() {
    for (let i = 0; i < 2; i++) {
      const gp = f.hand[i].grip;
      if (gp && gp.ref === 'w') { gp.body.pointToWorldFrame(gp.pb, _b); return [_b.x, _b.y, _b.z]; }
    }
    return null;
  }
  f.hanging = () => !!hangingFrom();
  // Jump while hanging = haul yourself up over the edge you are holding.
  function climb(pt) {
    f.releaseAll(false);
    const dx = pt[0] - torso.position.x, dz = pt[2] - torso.position.z, d = Math.hypot(dx, dz) || 1;
    // enough lift to bring the legs up past the edge, then a gentle drift over it (air control does the rest)
    const up = Math.max(T.jumpVel * 0.9, Math.sqrt(Math.max(0, 2 * g * (pt[1] + 1.6 - torso.position.y))));
    for (const b of bodies) { b.velocity.y = up; b.velocity.x = dx / d * 1.3; b.velocity.z = dz / d * 1.3; }
    f.hand[0].lockT = f.hand[1].lockT = 0.45;
    f.jumpLock = 0.3; f.jumpCd = T.jumpCooldown;
    ctx.emit({ e: 'climb', pid });
  }

  function headSpring(limp) {
    if (limp) return;
    torso.quaternion.vmult(new CANNON.Vec3(0, HEAD_UP, 0), _v);
    const tx = torso.position.x + _v.x, ty = torso.position.y + _v.y, tz = torso.position.z + _v.z;
    const k = 120, d = 10, m = head.mass;
    const fx = m * (k * (tx - head.position.x) - d * (head.velocity.x - torso.velocity.x));
    const fy = m * (k * (ty - head.position.y) - d * (head.velocity.y - torso.velocity.y) + g);
    const fz = m * (k * (tz - head.position.z) - d * (head.velocity.z - torso.velocity.z));
    head.force.x += fx; head.force.y += fy; head.force.z += fz;
    torso.force.x -= fx; torso.force.y -= fy; torso.force.z -= fz;
  }

  // ---------------------------------------------------------------- hands
  function handsStep(dt, inp, prev, limp) {
    const grabIn = [inp.grabL, inp.grabR], grabPrev = [prev.grabL, prev.grabR];
    const raiseIn = [inp.raiseL, inp.raiseR];
    const tapS = R.punchTapMs / 1000;
    f.handLoadY = 0;
    for (let i = 0; i < 2; i++) f.raise[i] += ((raiseIn[i] && !limp ? 1 : 0) - f.raise[i]) * Math.min(1, dt * 10);
    const bothRaised = f.raise[0] > 0.5 && f.raise[1] > 0.5;
    for (let i = 0; i < 2; i++) {
      const h = f.hand[i], hb = hands[i];
      h.cooldown = Math.max(0, h.cooldown - dt);
      h.lockT = Math.max(0, (h.lockT || 0) - dt);
      if (limp) {
        if (h.grip) f.releaseHand(i, false);
        h.held = false; h.punchT = 0;
        continue;
      }
      const down = grabIn[i], was = grabPrev[i];
      if (down && !was) { h.held = true; h.pressT = 0; h.grabbedThisPress = false; }
      if (down) h.pressT += dt;
      if (!down && was) {
        h.held = false;
        if (h.grip) f.releaseHand(i, true);
        else if (h.pressT <= tapS + 1e-6 && !h.grabbedThisPress && h.cooldown <= 0) startPunch(i);
      }
      // Grip still sound? Break it if stretched too far.
      if (h.grip) {
        const gp = h.grip;
        hb.pointToWorldFrame(gp.pa, _a); gp.body.pointToWorldFrame(gp.pb, _b);
        if (_a.distanceTo(_b) > T.grabBreakDist || (gp.fighter && !gp.fighter.alive)) f.releaseHand(i, false);
      }
      if (h.punchT > 0) h.punchT = Math.max(0, h.punchT - dt);

      // Pose target.
      let pose, maxF = T.handMaxForce;
      if (h.punchT > 0) { pose = POSE.punch; maxF = 700 * stats.punch; }
      else if (h.grip && (h.grip.fighter || h.grip.prop)) {
        const lifting = bothRaised || (f.raise[i] > 0.5);
        pose = lifting ? POSE.lift : POSE.carry; maxF = T.liftMaxForce;
      }
      else if (h.grip) { pose = f.raise[i] > 0.5 ? POSE.raised : POSE.carry; maxF = T.liftMaxForce; }
      else if (h.held && !f.grounded && torso.velocity.y < -0.5 && (h.catchPt = nearestGrabbable(i))) pose = null; // falling: reach for a ledge
      else if (h.held && h.pressT <= tapS) pose = POSE.windup;
      else if (h.held) pose = f.raise[i] > 0.5 ? POSE.raisedReach : POSE.reach;
      else pose = blendPose(POSE.rest, POSE.raised, f.raise[i]);
      driveHand(i, pose, maxF);

      // Lift assist: hoisting a fighter overhead also carries part of their weight directly.
      if (h.grip && h.grip.fighter && bothRaised) {
        const tf = h.grip.fighter;
        const share = 0.5 * g * (tf.torso.mass + tf.head.mass) * 0.7;
        tf.torso.force.y += share; f.handLoadY -= share;
      }
    }
  }

  // Nearest point on a grabbable edge within reach of hand i's shoulder (or null).
  function nearestGrabbable(i) {
    const list = ctx.grabbables;
    if (!list || !list.length) return null;
    torso.quaternion.vmult(new CANNON.Vec3(SHOULDER[0] * SIDE[i], SHOULDER[1], SHOULDER[2]), _v);
    const sp = { x: torso.position.x + _v.x, y: torso.position.y + _v.y, z: torso.position.z + _v.z };
    let best = null, bd = T.armLen + 0.45;
    for (const b of list) {
      const c = closestOnBody(sp, b);
      const d = Math.hypot(c[0] - sp.x, c[1] - sp.y, c[2] - sp.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function blendPose(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  function driveHand(i, pose, maxF) {
    const hb = hands[i];
    const s = SIDE[i];
    const h = f.hand[i];
    if (!pose) { // world-space target (catching a ledge)
      _w.set(h.catchPt[0], h.catchPt[1], h.catchPt[2]);
      maxF = T.liftMaxForce;
    } else {
      _v.set((SHOULDER[0] + pose[0]) * s, SHOULDER[1] + pose[1], SHOULDER[2] + pose[2]);
    }
    // punch aim: bend toward the aimed point
    if (!pose) { /* target already set */ } else if (h.punchT > 0 && h.punchAim) {
      _w.set(h.punchAim[0], h.punchAim[1], h.punchAim[2]);
    } else {
      // Yaw-only frame so hands stay readable when the torso wobbles.
      const yaw = f.yaw();
      const c = Math.cos(yaw), sn = Math.sin(yaw);
      _w.set(torso.position.x + _v.x * c + _v.z * sn, torso.position.y + _v.y, torso.position.z - _v.x * sn + _v.z * c);
    }
    const m = hb.mass;
    let fx = m * (T.handK * (_w.x - hb.position.x) - T.handD * (hb.velocity.x - torso.velocity.x));
    let fy = m * (T.handK * (_w.y - hb.position.y) - T.handD * (hb.velocity.y - torso.velocity.y) + g);
    let fz = m * (T.handK * (_w.z - hb.position.z) - T.handD * (hb.velocity.z - torso.velocity.z));
    const fl = Math.hypot(fx, fy, fz);
    if (fl > maxF) { fx *= maxF / fl; fy *= maxF / fl; fz *= maxF / fl; }
    hb.force.x += fx; hb.force.y += fy; hb.force.z += fz;
    torso.force.x -= fx * 0.6; torso.force.y -= fy; torso.force.z -= fz * 0.6;
    f.handLoadY += -fy;
  }

  function startPunch(i) {
    const h = f.hand[i];
    h.punchT = T.punchTime; h.punchHit = false; h.punching = true; h.cooldown = T.punchCooldown;
    f.tally.punches++;
    // Aim: nearest enemy body part within a forward cone (helps kids land hits; still needs to be close).
    const fw = forward();
    let best = null, bd = 2.6;
    for (const o of ctx.fighters) {
      if (o === f || !o.alive || !o.inWorld) continue;
      for (const b of [o.head, o.torso]) {
        const dx = b.position.x - torso.position.x, dz = b.position.z - torso.position.z, dy = b.position.y - torso.position.y;
        const d = Math.hypot(dx, dz);
        if (d > bd || d < 0.01 || Math.abs(dy) > 1.4) continue;
        if ((dx * fw.x + dz * fw.z) / d < 0.55) continue;
        best = b; bd = d;
      }
    }
    const hb = hands[i];
    let dir;
    if (best) {
      dir = [best.position.x - hb.position.x, best.position.y - hb.position.y, best.position.z - hb.position.z];
      h.punchAim = [best.position.x + dir[0] * 0.3, best.position.y, best.position.z + dir[2] * 0.3];
      f.wantFace = Math.atan2(best.position.x - torso.position.x, best.position.z - torso.position.z);
    } else {
      dir = [fw.x, 0.05, fw.z];
      h.punchAim = null;
    }
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    h.punchDir = [dir[0] / l, dir[1] / l, dir[2] / l];
    hb.velocity.set(torso.velocity.x + h.punchDir[0] * T.punchSpeed, torso.velocity.y + h.punchDir[1] * T.punchSpeed, torso.velocity.z + h.punchDir[2] * T.punchSpeed);
    // a punch twists the body behind it a little
    torso.angularVelocity.y += (i === 0 ? -1 : 1) * 2;
  }

  // ---------------------------------------------------------------- per step: after physics
  // touches: Map(handBody -> [{ body, point:[x,y,z] }]) built by the match from world.contacts.
  f.postStep = (dt, touches) => {
    if (!f.alive || !f.inWorld) return;
    const tapS = R.punchTapMs / 1000;
    for (let i = 0; i < 2; i++) {
      const h = f.hand[i], hb = hands[i];
      // Punch hits: any enemy part the fist is touching (sphere distance, so a glancing blow still counts).
      if (h.punchT > 0 && !h.punchHit) {
        for (const o of ctx.fighters) {
          if (o === f || !o.alive || !o.inWorld) continue;
          for (const b of [o.head, o.torso]) {
            const d = distToBody(hb.position, b);
            if (d > T.handR + 0.08) continue;
            const rv = Math.hypot(hb.velocity.x - b.velocity.x, hb.velocity.y - b.velocity.y, hb.velocity.z - b.velocity.z);
            if (rv < T.punchMinSpeed) continue;
            landPunch(i, o, b);
            break;
          }
          if (h.punchHit) break;
        }
      }
      if (h.punching && h.punchT <= 0) {
        h.punching = false;
        if (!h.punchHit) ctx.emit({ e: 'punch', pid, hit: null, x: r2(hb.position.x), y: r2(hb.position.y), z: r2(hb.position.z) });
      }
      // Grabbing: held past the tap window, nothing in hand yet, and touching something grabbable.
      const pastTap = h.pressT > tapS;
      if (h.held && !h.grip && h.punchT <= 0 && !(h.lockT > 0) && (pastTap || !f.grounded)) {
        // Fighters by distance (cheap, exact for spheres).
        let done = !pastTap; // inside the tap window only an EDGE can be caught (a falling grab), never a fighter or prop
        for (const o of ctx.fighters) {
          if (done) break;
          if (o === f || !o.alive || !o.inWorld) continue;
          for (const b of [o.torso, o.head, o.hands[0], o.hands[1]]) {
            const d = distToBody(hb.position, b);
            if (d <= T.handR + 0.06) {
              const pt = closestPointOn(hb.position, b);
              tryGrip(i, b, pt); done = true; break;
            }
          }
          if (done) break;
        }
        if (!done) {
          const list = touches && touches.get(hb);
          if (list) for (const t of list) { if (t.body.prop || t.body.grabbable) { tryGrip(i, t.body, t.point); done = true; break; } }
        }
        if (!pastTap) done = false;
        if (!done && ctx.grabbables) {
          // edges by distance, so a hand brushing a rope or a rim catches it
          for (const b of ctx.grabbables) {
            const c = closestOnBody(hb.position, b);
            // a falling hand gets a more forgiving catch (kid friendly: brushing the rim is enough)
            if (Math.hypot(c[0] - hb.position.x, c[1] - hb.position.y, c[2] - hb.position.z) <= T.handR + (f.grounded ? 0.1 : 0.24)) { tryGrip(i, b, c); break; }
          }
        }
      }
    }
    stepFeet(dt);
  };

  function landPunch(i, o, b) {
    const h = f.hand[i], hb = hands[i];
    h.punchHit = true;
    f.tally.hits++;
    const dir = h.punchDir;
    const imp = T.punchImpulse * stats.punch;
    const hl = Math.hypot(dir[0], dir[2]) || 1;
    const ix = dir[0] / hl * imp, iz = dir[2] / hl * imp, iy = T.punchLift * stats.punch;
    const share = (b === o.head ? 0.45 : 1) * (o.down > 0 ? 0.45 : 1); // a fighter on the floor slides less
    b.applyImpulse(new CANNON.Vec3(ix * share, iy * share, iz * share));
    if (b === o.head) o.torso.applyImpulse(new CANNON.Vec3(ix * 0.55, iy * 0.3, iz * 0.55));
    o.torso.angularVelocity.x += dir[2] * 3; o.torso.angularVelocity.z -= dir[0] * 3;
    const enemy = ctx.isEnemy(f, o);
    let knocked = false;
    o.stagger = T.staggerSecs;
    if (enemy) knocked = o.addDaze(pid, 1);
    hb.velocity.scale(0.3, hb.velocity);
    const ev = { e: 'punch', pid, hit: o.pid, x: r2(hb.position.x), y: r2(hb.position.y), z: r2(hb.position.z) };
    if (b === o.head) ev.head = true;
    if (knocked) ev.ko = true;
    ctx.emit(ev);
  }

  // ---------------------------------------------------------------- feet (drawn, not simulated)
  function stepFeet(dt) {
    const limp = f.down > 0 || f.limp > 0;
    torso.quaternion.vmult(new CANNON.Vec3(0, -1, 0), _v);
    for (let i = 0; i < 2; i++) {
      torso.quaternion.vmult(new CANNON.Vec3(HIP[0] * SIDE[i], HIP[1], HIP[2]), _w);
      const hx = torso.position.x + _w.x, hy = torso.position.y + _w.y, hz = torso.position.z + _w.z;
      const legLen = 0.55;
      if (limp || !f.grounded) {
        // dangle along the torso's down axis
        const tx = hx + _v.x * legLen, ty = hy + _v.y * legLen, tz = hz + _v.z * legLen;
        const ft = f.feet[i];
        const k = Math.min(1, dt * 18);
        ft[0] += (tx - ft[0]) * k; ft[1] += (ty - ft[1]) * k; ft[2] += (tz - ft[2]) * k;
        f.footT[i] = 1;
        continue;
      }
      const vx = torso.velocity.x, vz = torso.velocity.z;
      const tx = hx + vx * 0.12, tz = hz + vz * 0.12, ty = f.groundY;
      if (f.footT[i] < 1) {
        f.footT[i] = Math.min(1, f.footT[i] + dt / 0.16);
        const u = f.footT[i], a = f.footFrom[i];
        f.feet[i] = [a[0] + (tx - a[0]) * u, ty + Math.sin(u * Math.PI) * 0.16, a[2] + (tz - a[2]) * u];
      } else {
        const ft = f.feet[i];
        const d = Math.hypot(ft[0] - tx, ft[2] - tz);
        const otherPlanted = f.footT[1 - i] >= 1;
        if ((d > 0.32 && otherPlanted) || d > 0.8) { f.footT[i] = 0; f.footFrom[i] = ft.slice(); }
        else ft[1] += (ty - ft[1]) * Math.min(1, dt * 20);
      }
    }
  }

  // ---------------------------------------------------------------- snapshot
  f.snapshot = () => {
    const t = torso.position, q = torso.quaternion;
    const now = ctx.now();
    const dz = f.daze.filter((x) => now - x <= R.dazeWindow).length;
    return {
      pid, team: f.team, bot: f.bot, alive: f.alive, down: r2(f.down), downs: f.downs, out: f.out,
      torso: [r2(t.x), r2(t.y), r2(t.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)],
      head: [r2(head.position.x), r2(head.position.y), r2(head.position.z)],
      hands: hands.map((h) => [r2(h.position.x), r2(h.position.y), r2(h.position.z)]),
      feet: f.feet.map((p) => [r2(p[0]), r2(p[1]), r2(p[2])]),
      grip: f.hand.map((h) => (h.grip ? h.grip.ref : null)),
      raise: f.raise.map((x) => r2(x)),
      face: r2(f.yaw()),
      daze: r2(Math.min(1, dz / f.stats.punchesToDown)),
      punch: f.hand.map((h) => (h.punchT > 0 ? 1 : 0)),
      held: f.gripsOnMe > 0 ? 1 : 0,
      goon: f.goon || undefined,
    };
  };

  return f;
}

export function blankInput() { return { mx: 0, mz: 0, jump: false, grabL: false, grabR: false, raiseL: false, raiseR: false, duck: false }; }
export function normInput(i) {
  if (!i) return blankInput();
  const n = (v) => (typeof v === 'number' && isFinite(v) ? clamp(v, -1, 1) : 0);
  return { mx: n(i.mx), mz: n(i.mz), jump: !!i.jump, grabL: !!i.grabL, grabR: !!i.grabR, raiseL: !!i.raiseL, raiseR: !!i.raiseR, duck: !!i.duck };
}

/** Distance from a point to the surface of a body made of spheres (fighter parts). */
export function distToBody(p, b) {
  let best = Infinity;
  for (let k = 0; k < b.shapes.length; k++) {
    const s = b.shapes[k];
    b.quaternion.vmult(b.shapeOffsets[k], _a);
    const cx = b.position.x + _a.x, cy = b.position.y + _a.y, cz = b.position.z + _a.z;
    const r = s.radius != null ? s.radius : s.boundingSphereRadius;
    const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz) - r;
    if (d < best) best = d;
  }
  return best;
}
function closestPointOn(p, b) {
  let best = Infinity, out = [b.position.x, b.position.y, b.position.z];
  for (let k = 0; k < b.shapes.length; k++) {
    const s = b.shapes[k];
    b.quaternion.vmult(b.shapeOffsets[k], _a);
    const cx = b.position.x + _a.x, cy = b.position.y + _a.y, cz = b.position.z + _a.z;
    const r = s.radius != null ? s.radius : s.boundingSphereRadius;
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const l = Math.hypot(dx, dy, dz) || 1;
    if (l - r < best) { best = l - r; out = [cx + dx / l * r, cy + dy / l * r, cz + dz / l * r]; }
  }
  return out;
}

const _l = new CANNON.Vec3();
const _g = new CANNON.Vec3();
/** Closest point on a body made of boxes (or, for other shapes, its bounding sphere) to point p. World coords. */
export function closestOnBody(p, b) {
  let best = null, bd = Infinity;
  for (let k = 0; k < b.shapes.length; k++) {
    const sh = b.shapes[k];
    // shape frame = body frame * shape offset/orientation
    b.quaternion.vmult(b.shapeOffsets[k], _a);
    const cx = b.position.x + _a.x, cy = b.position.y + _a.y, cz = b.position.z + _a.z;
    let out;
    if (sh.halfExtents) {
      const q = b.quaternion.mult(b.shapeOrientations[k]);
      _l.set(p.x - cx, p.y - cy, p.z - cz);
      q.conjugate().vmult(_l, _l);
      const he = sh.halfExtents;
      _l.set(clamp(_l.x, -he.x, he.x), clamp(_l.y, -he.y, he.y), clamp(_l.z, -he.z, he.z));
      q.vmult(_l, _g);
      out = [cx + _g.x, cy + _g.y, cz + _g.z];
    } else {
      const r = sh.radius != null ? sh.radius : sh.boundingSphereRadius;
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz, l = Math.hypot(dx, dy, dz) || 1;
      out = l <= r ? [p.x, p.y, p.z] : [cx + dx / l * r, cy + dy / l * r, cz + dz / l * r];
    }
    const d = Math.hypot(out[0] - p.x, out[1] - p.y, out[2] - p.z);
    if (d < bd) { bd = d; best = out; }
  }
  return best;
}
