// Knockabout — builds an arena's static bodies, kill volumes, props and hazards from data/arenas.json.
// PURE: no DOM, no three.js. The client draws the same data (static shapes from ARENAS, hazards from
// snapshot.hazards, props from snapshot.props).

import { CANNON, G, ALL, addShapeBody, shapeFor, r2, r3 } from './physics.js';
import { createHazards, inBox } from './hazards.js';

export function buildArena(ctx, def) {
  const { world, mats } = ctx;
  const statics = [];
  for (const s of def.static) {
    const mat = s.mat === 'bouncy' ? mats.bouncy : s.mat === 'ice' ? mats.ice : mats.ground;
    const b = addShapeBody(world, s, mat, { group: G.STATIC });
    if (s.grab) b.grabbable = true;
    if (s.deadly) b.deadly = true;
    statics.push(b);
  }
  const hazards = createHazards(ctx, def.hazards || []);
  // Everything a hand may grip that is not a fighter or a prop (ropes, rims, rails, lift edges).
  const grabbables = statics.filter((b) => b.grabbable).concat(hazards.list.map((h) => h.body).filter((b) => b && b.grabbable));
  ctx.grabbables = grabbables;
  const props = (def.props || []).map((p) => makeProp(ctx, p));

  // Ray down from above (x, z): what is the floor there? Used by bots to stay on safe ground.
  const _f = new CANNON.Vec3(), _t = new CANNON.Vec3(), _r = new CANNON.RaycastResult();
  function floorRay(x, z, fromY) {
    _f.set(x, fromY, z); _t.set(x, def.outY, z); _r.reset();
    world.raycastClosest(_f, _t, { collisionFilterMask: G.STATIC | G.HAZARD, skipBackfaces: true }, _r);
    if (!_r.hasHit) return null;
    return { y: _r.hitPointWorld.y, body: _r.body, deadly: !!_r.body.deadly };
  }
  const solid = (fl) => fl && !fl.deadly && fl.y > -1.5;
  // The floor under (x, z). A hairline seam (between trapdoor panels, say) is not a hole: if the exact point has no
  // solid floor, a few centimetres either way is tried before calling it a drop.
  function floorAt(x, z, fromY = 6) {
    const fl = floorRay(x, z, fromY);
    if (solid(fl)) return fl;
    for (const [ox, oz] of [[0.12, 0], [-0.12, 0], [0, 0.12], [0, -0.12]]) {
      const n = floorRay(x + ox, z + oz, fromY);
      if (solid(n)) return n;
    }
    return fl;
  }

  /** Is the spot safe to stand on right now? (floor under it, not deadly, not in a kill volume, hazards calm). */
  function safeAt(x, z) {
    const fl = floorAt(x, z);
    if (!fl || fl.deadly || fl.y < -1.5) return 0;
    if (staticKillFloor(x, z, fl.y)) return 0; // (a kill box deep under a solid floor does not count)
    return 1 - hazards.dangerAt(x, z, fl.y);
  }

  /** True when there is no standable floor at (x, z) at all (a drop, a pit, a deadly bed). */
  function voidAt(x, z) {
    const fl = floorAt(x, z);
    return !fl || fl.deadly || fl.y < -1.5 || staticKillFloor(x, z, fl.y);
  }
  function staticKillFloor(x, z, fy) {
    for (const k of def.kill || []) {
      if (k.p[1] + k.size[1] / 2 < fy - 0.6) continue;
      if (Math.abs(x - k.p[0]) < k.size[0] / 2 + 0.3 && Math.abs(z - k.p[2]) < k.size[2] / 2 + 0.3) return true;
    }
    return false;
  }

  /** Static kill volumes (spike pits, fire pits). Returns a cause or null. */
  function staticKill(p) {
    for (const k of def.kill || []) if (inBox(p, k.p, k.size)) return k.kind;
    return null;
  }

  function reset() {
    hazards.reset();
    for (const p of props) p.reset();
  }

  return { def, statics, hazards, props, grabbables, floorAt, safeAt, voidAt, staticKill, reset };
}

function makeProp(ctx, d) {
  const { world, mats } = ctx;
  const body = new CANNON.Body({ mass: d.mass || 2, material: mats.prop, collisionFilterGroup: G.PROP, collisionFilterMask: ALL, linearDamping: 0.05, angularDamping: 0.1 });
  if (d.kind === 'ball') body.addShape(new CANNON.Sphere(d.r));
  else if (d.kind === 'barrel') body.addShape(new CANNON.Cylinder(d.r, d.r, d.h, 10));
  else body.addShape(shapeFor({ type: 'box', size: d.size }));
  world.addBody(body);
  const prop = { id: d.id, kind: d.kind, def: d, body, lastBy: null, outT: 0, hitCd: 0 };
  body.prop = prop;
  prop.reset = () => {
    body.position.set(d.p[0], d.p[1], d.p[2]);
    body.quaternion.set(0, 0, 0, 1);
    body.velocity.set(0, 0, 0); body.angularVelocity.set(0, 0, 0);
    prop.lastBy = null; prop.outT = 0;
  };
  prop.snapshot = () => {
    const p = body.position, q = body.quaternion;
    return { id: d.id, kind: d.kind, p: [r2(p.x), r2(p.y), r2(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w)] };
  };
  prop.reset();
  return prop;
}
