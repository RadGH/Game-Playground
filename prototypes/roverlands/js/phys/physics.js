// The physics world: Rapier, built from the world data, stepped at a fixed 1/60 s.
//
//   import RAPIER from '../../../../vendor/rapier/rapier.mjs';
//   await RAPIER.init();
//   const phys = createPhysics(RAPIER, world);
//   phys.onBreak((objId, info) => ...)     // a world object was hit hard enough to break (local bodies only)
//   phys.step(dt)                          // accumulates dt, runs fixed ticks, calls every `phys.onTick` listener per tick
//
// Everything here runs in the browser and in Node (tests). No three.js, no DOM.
//
// Collision groups (Rapier packs membership in the high 16 bits and "collides with" in the low 16):
//   TERRAIN  ground heightfield          STATIC  rocks, trunks, fences, ramps, bridge decks (world.objects)
//   BODY     vehicles, trailers (local or remote)                      WALKER  people on foot (character controller)
//   PIECE    broken bits of the world (fallen trunks, fence panels)   PROP    loose cargo (crates, bags) — CCD on
// Wheels are not colliders at all: they are shape casts (see vehicle.js) that hit TERRAIN|STATIC|BODY|PIECE|PROP.

export const G = { TERRAIN: 1, STATIC: 2, BODY: 4, WALKER: 8, PIECE: 16, PROP: 32, RAGDOLL: 64 };
export const groups = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
const ALL = 0xffff;
export const GROUPS = {
  terrain: groups(G.TERRAIN, ALL),
  static: groups(G.STATIC, ALL),
  body: groups(G.BODY, ALL),
  walker: groups(G.WALKER, G.TERRAIN | G.STATIC | G.BODY | G.PIECE | G.PROP),
  piece: groups(G.PIECE, ALL & ~G.WALKER),
  prop: groups(G.PROP, ALL),
  ragdoll: groups(G.RAGDOLL, G.TERRAIN | G.STATIC | G.BODY | G.PIECE | G.PROP),
  /** what a wheel cast sees */
  wheel: groups(0xffff, G.TERRAIN | G.STATIC | G.BODY | G.PIECE | G.PROP),
  /** what a camera / gun ray sees */
  solid: groups(0xffff, G.TERRAIN | G.STATIC | G.BODY | G.PIECE | G.PROP),
};

export const DT = 1 / 60;

/**
 * Rapier stores a heightfield column-major (index = i * dim + j, where i runs along x and j along z) while the world
 * keeps its heights row-major (j * dim + i). Exported so the test can check the two agree.
 */
export function heightfieldArray(world) {
  const { dim, heights } = world;
  const out = new Float32Array(dim * dim);
  for (let j = 0; j < dim; j++) for (let i = 0; i < dim; i++) out[i * dim + j] = heights[j * dim + i];
  return out;
}

export function createPhysics(RAPIER, world, opts = {}) {
  const rw = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  rw.timestep = DT;
  // A few more solver passes keep stacked cargo and trailer joints calm.
  try { rw.integrationParameters.numSolverIterations = opts.solverIterations ?? 6; } catch { /* older builds */ }
  const events = new RAPIER.EventQueue(true);

  // --- the ground -----------------------------------------------------------------------------------------------
  const n = world.dim - 1;
  const ground = rw.createCollider(
    RAPIER.ColliderDesc.heightfield(n, n, heightfieldArray(world), { x: world.size, y: 1, z: world.size })
      .setCollisionGroups(GROUPS.terrain).setFriction(1.0));
  ground.userData = { kind: 'terrain' };

  // --- the placed objects ---------------------------------------------------------------------------------------
  const objColliders = new Map();         // object id -> collider
  const byHandle = new Map();             // collider handle -> { obj } | { body } (who it belongs to)
  for (const o of world.objects || []) addObject(o);
  if (world.broken) for (const id of world.broken) removeObject(id);

  function shapeDesc(shape) {
    switch (shape.t) {
      case 'cyl': return RAPIER.ColliderDesc.cylinder(shape.h / 2, shape.r);
      case 'box': return RAPIER.ColliderDesc.cuboid(shape.hx, shape.hy, shape.hz);
      case 'ball': return RAPIER.ColliderDesc.ball(shape.r);
      case 'wedge': {   // a ramp rising along +z of its own frame: flat bottom, the top edge at z = +hz, height 2*hy
        const { hx, hy, hz } = shape;
        const pts = new Float32Array([-hx, 0, -hz, hx, 0, -hz, -hx, 0, hz, hx, 0, hz, -hx, 2 * hy, hz, hx, 2 * hy, hz]);
        return RAPIER.ColliderDesc.convexHull(pts);
      }
      default: return null;
    }
  }
  /** Where the collider's own origin sits above the object's base point. */
  function shapeLift(shape) {
    switch (shape.t) {
      case 'cyl': return shape.h / 2;
      case 'box': return shape.hy;
      case 'ball': return shape.r;
      default: return 0;
    }
  }
  function addObject(o) {
    if (!o.shape) return;
    const d = shapeDesc(o.shape);
    if (!d) return;
    const lift = o.shape.lift ?? shapeLift(o.shape);
    const q = yawQuat(o.yaw || 0);
    d.setTranslation(o.x, o.y + lift, o.z).setRotation(q).setCollisionGroups(GROUPS.static).setFriction(o.friction ?? 0.9);
    if (o.breakAt != null) {
      d.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS);
      d.setContactForceEventThreshold(o.breakAt / DT);   // impulse (N·s) per tick -> force (N)
    }
    const c = rw.createCollider(d);
    objColliders.set(o.id, c);
    byHandle.set(c.handle, { obj: o });
  }
  function removeObject(id) {
    const c = objColliders.get(id);
    if (!c) return false;
    byHandle.delete(c.handle);
    rw.removeCollider(c, false);
    objColliders.delete(id);
    return true;
  }

  // --- bodies: whoever made them registers them so contact events can name them ----------------------------------
  function tagCollider(collider, info) { byHandle.set(collider.handle, info); collider.userData = info; }
  function untagCollider(collider) { byHandle.delete(collider.handle); }

  // --- stepping ---------------------------------------------------------------------------------------------------
  const tickers = new Set();    // fn(dt) before every tick (vehicles add forces here)
  const after = new Set();      // fn(dt) after every tick
  const breakers = new Set();
  let acc = 0, ticks = 0;
  // Smashing: a solver stops a car dead on a fixed collider in the SAME tick it reports the contact, so breaking the
  // object after the fact still costs the car all its speed. Instead, each tick, every fast local body sweeps its own
  // box forward by this tick's travel; a breakable object in that space is judged on the momentum the body carries
  // into it — enough, and it is gone before the solver ever sees it (the body pays `breakAt` worth of impulse);
  // not enough, and it stays a wall.
  const smashers = new Set();
  function smashAhead() {
    for (const b of smashers) {
      if (!b.local || !b.smash) continue;
      const rb = b.rb, v = rb.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed < 1.5) continue;
      const t = rb.translation(), q = rb.rotation();
      const lead = speed * DT * 1.5;
      const c = { x: t.x + v.x / speed * lead * 0.5, y: t.y + v.y / speed * lead * 0.5, z: t.z + v.z / speed * lead * 0.5 };
      const mass = rb.mass();
      const hits = [];     // never change the world inside Rapier's query callback — collect, then act
      rw.intersectionsWithShape(c, q, b.smash, col => { const o = byHandle.get(col.handle)?.obj; if (o && o.breakAt != null) hits.push(o); return true; },
        undefined, groups(0xffff, G.STATIC));
      for (const o of hits) {
        if (!objColliders.has(o.id)) continue;
        const dx = o.x - t.x, dz = o.z - t.z, dl = Math.hypot(dx, dz) || 1;
        const closing = Math.max(0, (v.x * dx + v.z * dz) / dl);
        const impulse = mass * closing;
        if (impulse < o.breakAt) continue;
        const cost = Math.min(o.breakAt * 0.7, impulse * 0.5);
        rb.applyImpulse({ x: -v.x / speed * cost, y: 0, z: -v.z / speed * cost }, true);
        removeObject(o.id);
        for (const f of breakers) f(o.id, { dir: [v.x / speed, v.y / speed, v.z / speed], speed, impulse, by: b });
      }
    }
  }
  function tick() {
    for (const f of tickers) f(DT);
    smashAhead();
    rw.step(events);
    const forces = [];      // collected first: the world must not change inside the drain callback
    events.drainContactForceEvents(ev => forces.push([ev.collider1(), ev.collider2(), ev.totalForceMagnitude()]));
    for (const [h1, h2, force] of forces) {
      const a = byHandle.get(h1), b = byHandle.get(h2);
      const objSide = a?.obj ? a : b?.obj ? b : null;
      const other = objSide === a ? b : a;
      if (!objSide || !other?.body || !other.body.local) continue;   // only the machine that owns the body breaks things
      const o = objSide.obj;
      if (!objColliders.has(o.id)) continue;
      const impulse = force * DT;
      if (impulse < o.breakAt) continue;
      const v = other.body.rb.linvel();
      const speed = Math.hypot(v.x, v.y, v.z);
      removeObject(o.id);
      for (const f of breakers) f(o.id, { dir: speed > 0.1 ? [v.x / speed, v.y / speed, v.z / speed] : [0, 0, 1], speed, impulse, by: other.body });
    }
    for (const f of after) f(DT);
    ticks++;
  }
  function step(dt) {
    acc = Math.min(acc + dt, DT * 5);
    let n = 0;
    while (acc >= DT && n < 4) { tick(); acc -= DT; n++; }
    return n;
  }

  // --- queries ----------------------------------------------------------------------------------------------------
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  /** Cast a ray; returns { t, point, normal, collider, info } or null. `exclude` = a rigid body to ignore. */
  function raycast(o, d, max, { group = GROUPS.solid, exclude = null, excludeCollider = null } = {}) {
    ray.origin = { x: o[0], y: o[1], z: o[2] }; ray.dir = { x: d[0], y: d[1], z: d[2] };
    const hit = rw.castRayAndGetNormal(ray, max, true, undefined, group, excludeCollider || undefined, exclude || undefined);
    if (!hit) return null;
    const t = hit.timeOfImpact;
    return { t, point: [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t], normal: [hit.normal.x, hit.normal.y, hit.normal.z],
      collider: hit.collider, info: byHandle.get(hit.collider.handle) || null };
  }

  return {
    RAPIER, rw, world, ground, events,
    step, tick, get ticks() { return ticks; },
    onTick(f) { tickers.add(f); return () => tickers.delete(f); },
    afterTick(f) { after.add(f); return () => after.delete(f); },
    onBreak(f) { breakers.add(f); return () => breakers.delete(f); },
    removeObject, hasObject: id => objColliders.has(id),
    addSmasher(b) { smashers.add(b); return () => smashers.delete(b); },
    tagCollider, untagCollider, infoOf: c => byHandle.get(c.handle) || null,
    raycast,
  };
}

export function yawQuat(yaw) { return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; }
