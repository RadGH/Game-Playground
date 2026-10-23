// Knockabout — moving dangers. PURE: no DOM, no three.js.
//
// Every hazard runs on a CYCLE so it always warns before it bites:
//   calm (phase 0) -> warning (phase 1: glow / shake / wind-up, `warn` seconds) -> active (phase 2, `active` s)
// snapshot.hazards[i].s is an array whose FIRST number is always that phase (0 calm, 1 warning, 2 dangerous);
// the rest depends on the kind (documented per kind below and in docs/PLAN.md).
//
// Kinds and what they do:
//   blade      floor saw: hidden under a slot; warns (sparks, spins up), rises, travels its track, sinks.
//              s = [phase, rise 0..1, x, z, spinAngle]           hit: knock back + knock down
//   popspikes  a strip of spikes that pops out of the floor.     s = [phase, rise 0..1]   touch while up: out (spikes)
//   dropfloor  a floor panel: shakes, drops away (spikes below), comes back.  s = [phase, dy (metres, <= 0)]
//   fire       a flame jet: sputters, then roars.                s = [phase, power 0..1]  inside while roaring: out (fire)
//   crusher    a block that lifts, shakes at the top, slams.     s = [phase, y (bottom of block)]  under it on the slam: out (crush)
//   piston     a ram in a wall: pulls back glowing, then shoots out.  s = [phase, ext 0..1]  hit: knock back + down
//   conveyor   a belt (static floor) that carries you; surges faster on its active phase.  s = [phase, speed, scroll]
//   mover      a platform on a path: parked (0), about to set off (1), travelling (2).  s = [phase, x, y, z]
//   sweeper    a spinning arm (or two) around a hub; speeds up on its active phase.  s = [phase, angle]  hit: knock back + down
//
// A hazard "bites" a fighter through `bite` (knockback + knockdown) or `kill` (out, with a cause).

import { CANNON, G, ALL, addShapeBody, driveKinematic, quatYaw, quatEuler, r2, r3, clamp } from './physics.js';

/** Phase of a cycle at hazard time t. Returns { phase, u } (u = 0..1 progress inside that phase). */
export function cyclePhase(cy, t) {
  const period = cy.period, warn = cy.warn, active = cy.active;
  const calm = Math.max(0, period - warn - active);
  let c = ((t + (cy.offset || 0)) % period + period) % period;
  if (c < calm) return { phase: 0, u: calm ? c / calm : 1 };
  c -= calm;
  if (c < warn) return { phase: 1, u: warn ? c / warn : 1 };
  c -= warn;
  return { phase: 2, u: active ? c / active : 1 };
}

const smooth = (x) => x * x * (3 - 2 * x);

export function createHazards(ctx, defs) {
  const { world, mats } = ctx;
  const list = defs.map((d) => build(d));

  function kin(def, mat = mats.hazard) {
    const b = addShapeBody(world, def, mat, { kinematic: true, group: G.HAZARD, mask: ALL });
    return b;
  }

  function build(d) {
    const h = { def: d, id: d.id, kind: d.kind, cy: d.cycle || { period: 1, warn: 0, active: 0 }, s: [0], body: null, t: 0 };
    const p = d.p;
    switch (d.kind) {
      case 'blade': {
        // A vertical disc. The disc's flat faces point along `face` axis; it travels along `track`.
        // axle along `axis` ('x' or 'z'); the blade's edge pokes up through a slot in the floor
        const b = kin({ type: 'cyl', r: d.r, h: 0.14, p, segments: 14 });
        b.hazard = h; h.body = b;
        h.down = p[1] - d.r - 0.2; h.up = p[1] + d.r * 0.25;
        h.spin = 0; h.rise = 0;
        break;
      }
      case 'dropfloor': {
        const b = kin({ type: 'box', p, size: d.size }, mats.ground);
        b.hazard = h; h.body = b; h.isGround = true;
        break;
      }
      case 'crusher': {
        const b = kin({ type: 'box', p: [p[0], p[1] + d.lift + d.size[1] / 2, p[2]], size: d.size });
        b.hazard = h; h.body = b;
        break;
      }
      case 'piston': {
        const b = kin({ type: 'box', p, size: d.size });
        b.hazard = h; h.body = b;
        break;
      }
      case 'conveyor': {
        const b = addShapeBody(world, { type: 'box', p, size: d.size }, mats.ground, { group: G.STATIC });
        b.belt = [0, 0, 0]; b.hazard = h; h.body = b; h.scroll = 0; h.isGround = true;
        break;
      }
      case 'mover': {
        const b = kin({ type: 'box', p: d.path[0], size: d.size }, mats.ground);
        b.hazard = h; h.body = b; h.isGround = true;
        if (d.grab) b.grabbable = true;
        break;
      }
      case 'sweeper': {
        const b = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC, material: mats.hazard, collisionFilterGroup: G.HAZARD, collisionFilterMask: ALL });
        for (const arm of d.arms) {
          // arm: { y, len, thick, height, angle } — a bar through the hub (both sides) at height y
          const half = new CANNON.Vec3(arm.len, arm.height / 2, arm.thick / 2);
          const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), arm.angle || 0);
          b.addShape(new CANNON.Box(half), new CANNON.Vec3(0, arm.y - p[1], 0), q);
        }
        b.position.set(p[0], p[1], p[2]);
        world.addBody(b);
        b.hazard = h; h.body = b; h.angle = 0;
        break;
      }
      case 'fire':
      case 'popspikes':
        break; // no body: a kill volume that is only live while active
      default:
        throw new Error('Knockabout: unknown hazard kind ' + d.kind);
    }
    return h;
  }

  /** Advance every hazard by dt (hazard time can run faster in sudden death: `speed`). */
  function update(dt, speed = 1) {
    for (const h of list) {
      const d = h.def;
      h.t += dt * speed;
      const { phase, u } = cyclePhase(h.cy, h.t);
      h.phase = phase;
      switch (d.kind) {
        case 'blade': {
          // rise during warn's last third, stay up while active, sink at the end
          let rise = 0;
          if (phase === 1) rise = u > 0.6 ? smooth((u - 0.6) / 0.4) * 0.35 : 0;
          else if (phase === 2) rise = u < 0.12 ? 0.35 + smooth(u / 0.12) * 0.65 : u > 0.88 ? smooth((1 - u) / 0.12) : 1;
          h.spin += dt * (phase === 0 ? 2 : phase === 1 ? 10 : 22) * speed;
          const tr = d.track || [[d.p[0], d.p[2]], [d.p[0], d.p[2]]];
          const k = phase === 2 ? (0.5 - 0.5 * Math.cos(u * Math.PI * 2 * (d.passes || 1))) : 0;
          const x = tr[0][0] + (tr[1][0] - tr[0][0]) * k, z = tr[0][1] + (tr[1][1] - tr[0][1]) * k;
          const y = h.down + (h.up - h.down) * rise;
          const qq = axleQuat(d.axis, h.spin); // the disc's axle points along `axis`; it spins about the axle
          driveKinematic(h.body, [x, y, z], qq, dt);
          h.rise = rise; h.pos = [x, y, z];
          h.biting = rise > 0.3;
          h.s = [phase, r2(rise), r2(x), r2(z), r2(h.spin % (Math.PI * 2))];
          break;
        }
        case 'dropfloor': {
          let dy = 0;
          const shake = phase === 1 ? Math.sin(h.t * 60) * 0.03 * u : 0;
          if (phase === 2) dy = u < 0.15 ? -smooth(u / 0.15) * d.drop : u > 0.8 ? -smooth((1 - u) / 0.2) * d.drop : -d.drop;
          driveKinematic(h.body, [d.p[0] + shake, d.p[1] + dy, d.p[2]], null, dt);
          h.s = [phase, r2(dy)];
          h.open = dy < -0.4;
          break;
        }
        case 'crusher': {
          // calm: rise back to the top; warn: shake at the top; active: slam (first 15%), hold, then start rising
          const top = d.p[1] + d.lift, bottom = d.p[1];
          let y;
          if (phase === 0) y = bottom + (top - bottom) * smooth(Math.min(1, u * 2.5));
          else if (phase === 1) y = top + Math.sin(h.t * 50) * 0.04;
          else y = u < 0.12 ? top - (top - bottom) * (u / 0.12) * (u / 0.12) : bottom;
          driveKinematic(h.body, [d.p[0], y + d.size[1] / 2, d.p[2]], null, dt);
          h.y = y; h.slamming = phase === 2 && u < 0.2;
          h.s = [phase, r2(y)];
          break;
        }
        case 'piston': {
          let ext = 0;
          if (phase === 1) ext = -0.15 * smooth(u);                    // pulls back = the tell
          else if (phase === 2) ext = u < 0.12 ? smooth(u / 0.12) : u > 0.6 ? smooth((1 - u) / 0.4) : 1;
          const e = Math.max(0, ext) * d.reach + Math.min(0, ext);
          driveKinematic(h.body, [d.p[0] + d.dir[0] * e, d.p[1], d.p[2] + d.dir[2] * e], null, dt);
          h.ext = ext; h.biting = phase === 2 && u < 0.5;
          h.s = [phase, r2(ext)];
          break;
        }
        case 'conveyor': {
          const sp = (phase === 2 ? d.surge : phase === 1 ? (d.speed + d.surge) / 2 : d.speed) * speed;
          h.body.belt[0] = d.dir[0] * sp; h.body.belt[2] = d.dir[2] * sp;
          h.scroll = (h.scroll + sp * dt) % 1000;
          h.s = [phase, r2(sp), r2(h.scroll)];
          break;
        }
        case 'mover': {
          // A leg = calm (parked at one end) -> warning (about to set off) -> active (travelling to the other end).
          // Legs alternate direction. s[0] = 2 means "moving".
          const per = h.cy.period;
          const leg = Math.floor((h.t + (h.cy.offset || 0)) / per);
          const fwd = leg % 2 === 0;
          const n = d.path.length - 1;
          let k = phase === 2 ? smooth(u) : 0;
          if (!fwd) k = 1 - k;
          const pos = pathAt(d.path, k * n);
          driveKinematic(h.body, pos, null, dt);
          h.s = [phase, r2(pos[0]), r2(pos[1]), r2(pos[2])];
          break;
        }
        case 'sweeper': {
          const w = (phase === 2 ? d.fast : phase === 1 ? d.slow * 0.4 : d.slow) * speed * (d.spin || 1);
          h.angle += w * dt;
          h.body.angularVelocity.set(0, w, 0);
          h.body.velocity.set(0, 0, 0);
          h.w = w; h.biting = Math.abs(w) > 0.5;
          h.s = [phase, r3(((h.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))];
          break;
        }
        case 'fire': {
          const power = phase === 2 ? 1 : phase === 1 ? 0.25 * u : 0;
          h.s = [phase, r2(power)];
          h.live = phase === 2;
          break;
        }
        case 'popspikes': {
          const rise = phase === 2 ? (u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1) : phase === 1 ? 0.1 * u : 0;
          h.s = [phase, r2(rise)];
          h.live = rise > 0.5;
          break;
        }
      }
    }
  }

  /** Kill check: is point p inside a live hazard volume? Returns a cause ('spikes'|'fire'|'crush') or null. */
  function killAt(p) {
    for (const h of list) {
      const d = h.def;
      if ((d.kind === 'fire' || d.kind === 'popspikes') && h.live && inBox(p, d.p, d.size)) return d.kind === 'fire' ? 'fire' : 'spikes';
      if (d.kind === 'crusher' && h.phase === 2) {
        const half = [d.size[0] / 2 - 0.1, d.size[2] / 2 - 0.1];
        if (Math.abs(p.x - d.p[0]) < half[0] && Math.abs(p.z - d.p[2]) < half[1] && p.y < h.y + 0.25 && p.y > d.p[1] - 0.5) return 'crush';
      }
    }
    return null;
  }

  /**
   * How dangerous is standing at (x, z) for the next ~1.5 s? 0 = fine. Used by bots.
   * Looks at hazards that are warning or active, plus each hazard's footprint.
   */
  function dangerAt(x, z, y = 0) {
    let worst = 0;
    for (const h of list) {
      const d = h.def;
      const hot = h.phase >= 1;
      switch (d.kind) {
        case 'blade': {
          if (!hot && h.rise < 0.1) break;
          const tr = d.track || [[d.p[0], d.p[2]], [d.p[0], d.p[2]]];
          const dist = segDist(x, z, tr[0][0], tr[0][1], tr[1][0], tr[1][1]);
          if (dist < d.r + 0.9) worst = Math.max(worst, 1);
          break;
        }
        case 'fire': case 'popspikes':
          if (hot && inBox2(x, z, d.p, d.size, 0.6)) worst = Math.max(worst, 1);
          break;
        case 'dropfloor':
          if (hot && inBox2(x, z, d.p, d.size, 0.2)) worst = Math.max(worst, 1);
          break;
        case 'crusher':
          if (inBox2(x, z, d.p, d.size, 0.5)) worst = Math.max(worst, hot ? 1 : 0.4);
          break;
        case 'piston': {
          const e = [d.p[0] + d.dir[0] * d.reach, d.p[2] + d.dir[2] * d.reach];
          const dist = segDist(x, z, d.p[0], d.p[2], e[0], e[1]);
          if (dist < Math.max(d.size[0], d.size[2]) / 2 + 0.6) worst = Math.max(worst, hot ? 1 : 0.3);
          break;
        }
        case 'sweeper': {
          const r = Math.hypot(x - d.p[0], z - d.p[2]);
          const reach = Math.max(...d.arms.map((a) => a.len));
          if (r < reach + 0.4) worst = Math.max(worst, hot ? 0.6 : 0.25);
          break;
        }
      }
    }
    return worst;
  }

  function snapshot() { return list.map((h) => ({ id: h.id, s: h.s })); }
  // Every round starts with every hazard CALM (offsets still stagger them inside the calm stretch), so nothing
  // bites at the bell.
  function reset() {
    for (const h of list) {
      const cy = h.cy;
      const calm = Math.max(0.001, cy.period - cy.warn - cy.active);
      const off = cy.offset || 0;
      const c0 = ((off % cy.period) + cy.period) % cy.period % calm;
      h.t = c0 - off;
      h.spin = 0; h.angle = 0; h.rise = 0;
    }
    update(0);
    for (const h of list) if (h.body && h.body.type === CANNON.Body.KINEMATIC) { h.body.velocity.set(0, 0, 0); h.body.angularVelocity.set(0, 0, 0); }
    snapPoses();
  }
  // Put kinematic bodies exactly where they should be right now (used at reset so nothing sweeps in from 0,0,0).
  function snapPoses() {
    for (const h of list) {
      const d = h.def, b = h.body;
      if (!b || b.type !== CANNON.Body.KINEMATIC) continue;
      if (d.kind === 'blade') { b.position.set(h.pos[0], h.pos[1], h.pos[2]); setAxle(b, d.axis, h.spin); }
      else if (d.kind === 'dropfloor') b.position.set(d.p[0], d.p[1], d.p[2]);
      else if (d.kind === 'crusher') b.position.set(d.p[0], d.p[1] + d.lift + d.size[1] / 2, d.p[2]);
      else if (d.kind === 'piston') b.position.set(d.p[0], d.p[1], d.p[2]);
      else if (d.kind === 'mover') { const s = h.s; b.position.set(s[1], s[2], s[3]); }
      else if (d.kind === 'sweeper') b.quaternion.set(0, 0, 0, 1);
    }
  }

  return { list, update, killAt, dangerAt, snapshot, reset };
}

function axleQuat(axis, spin) {
  const base = new CANNON.Quaternion();
  if (axis === 'x') base.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), Math.PI / 2);
  else base.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
  const sp = new CANNON.Quaternion();
  sp.setFromAxisAngle(axis === 'x' ? new CANNON.Vec3(1, 0, 0) : new CANNON.Vec3(0, 0, 1), spin);
  const r = sp.mult(base);
  return [r.x, r.y, r.z, r.w];
}
function setAxle(b, axis, spin) { const q = axleQuat(axis, spin); b.quaternion.set(q[0], q[1], q[2], q[3]); }

function pathAt(path, x) {
  const i = Math.min(path.length - 2, Math.max(0, Math.floor(x)));
  const u = clamp(x - i, 0, 1);
  const a = path[i], b = path[i + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
export function inBox(p, c, size) {
  return Math.abs(p.x - c[0]) <= size[0] / 2 && Math.abs(p.y - c[1]) <= size[1] / 2 && Math.abs(p.z - c[2]) <= size[2] / 2;
}
function inBox2(x, z, c, size, pad) {
  return Math.abs(x - c[0]) <= size[0] / 2 + pad && Math.abs(z - c[2]) <= size[2] / 2 + pad;
}
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const l2 = vx * vx + vz * vz;
  const t = l2 ? clamp(((px - ax) * vx + (pz - az) * vz) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}
