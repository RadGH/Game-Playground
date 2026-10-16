// Ox carts (play-test 8, W5): "ox carts at towns, and sometimes travelling the road, that act as paid fast travel".
//
// Three things are drawn here, all with avatar-3d's own ox cart (js/vehicles.js `ox_cart`: solid wheels, a deep bed, one
// ox in the shafts — the ox is the bestiary's cow frame, heavier and brown):
//
//   parked     an object the server sends with `info.type === 'cart'` (E places one by each town's gate road, its carter
//              standing beside it). It stands still; the ox shifts its weight.
//   on the road  a traveller whose `info.vehicle === 'ox_cart'` (A: roaming ox-carters). The carter walks at the ox's
//              head as an ordinary body; the cart is drawn behind and beside it and rolls when it moves.
//   the ride   `cartRide { to: { name, x, z }, from, ms, fare }` — you climb onto the bed, the cart pulls away down the
//              road toward the town you paid for, and the travel veil closes over it; the arrival is the usual one.
//
// A cart is ~45 meshes of the materials the scene already uses; the first one is built and compiled at boot (`prewarm`)
// and carts that leave are kept for the next one, so a cart coming into view never links a shader mid-walk.
//
//   const carts = createCarts(scene, { groundY, compile, actors })
//   carts.setParked(id, { x, z, yaw })        carts.setRoaming(id, on)        carts.remove(id)
//   carts.startRide(msg, { self, cover })     carts.ridePos(drawn) -> where to draw you while riding
//   carts.update(dt, elapsed)

import * as THREE from 'three';
import { createVehicle } from '../../../../avatar-3d/js/vehicles.js';

/** The ox: the cow frame without the dairy — heavier, brown, short horns. (avatar-3d creature spec.) */
export const OX = { type: 'cow', size: 1.18, colors: { body: '#6e4a2c', belly: '#927050', accent: '#2a2018', eyes: '#1a1008', nose: '#4a3a34' }, features: { horns: true, hooves: true, spots: false, udder: false } };
/** Owner 2026-10-16: "the horse attached to caravans is the old ugly model … we have a new horse model" — the cart is
 * now pulled by the mounts' own equine body (a bay draft horse); OX stays exported for anything that still wants it. */
export const CART_HORSE = { breed: 'draft', size: 1, colors: { body: '#6a4630', belly: '#8a6448', accent: '#241812' } };
export const CART_SPEC = { type: 'ox_cart', size: 1, animal: CART_HORSE };
/** How far behind / beside its walking carter a roaming cart is drawn (the carter leads the ox by the head). */
export const LEAD = { back: 2.9, side: 0.95 };
/** The ride you see before the veil: how long the cart rolls and how fast it gets. */
export const RIDE = { showMs: 3200, speed: 2.4, accel: 1.6, veilLeadMs: 1100 };   // A's `ms` (4-14 s by road length) is how long you watch; the veil closes 1.1 s before it is up

/**
 * Pure: where a roaming cart sits for a carter at (x, z) facing `yaw` — behind the carter and to their right, so the
 * carter is at the ox's near shoulder. -> { x, z, yaw }.
 */
export function cartBehind(x, z, yaw, lead = LEAD) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { x: x - fx * lead.back + rx * lead.side, z: z - fz * lead.back + rz * lead.side, yaw };
}
/** Pure: the cart's place `t` seconds into a ride that starts at `p` heading `yaw`: it eases up to speed. -> { x, z, d }. */
export function rideAt(p, yaw, t, R = RIDE) {
  const tUp = R.speed / R.accel;
  const d = t < tUp ? 0.5 * R.accel * t * t : 0.5 * R.accel * tUp * tUp + R.speed * (t - tUp);
  return { x: p.x + Math.sin(yaw) * d, z: p.z + Math.cos(yaw) * d, d };
}
/**
 * [World, round 11 #45] Pure: the point `d` metres along a polyline [[x, z], …] (past its end: on along the last leg), and
 * the heading of the leg it is on — the ride follows A's `cartRide.path` out along the road instead of a straight line
 * through the town wall.
 */
export function alongPath(path, d) {
  if (!Array.isArray(path) || path.length < 2) return null;
  let left = Math.max(0, d);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    if (left <= len || i === path.length - 1) { const t = left / len; return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }; }
    left -= len;
  }
  return null;
}
/** Pure: the heading (our yaw: 0 = +z) from a to b, or `fallback` when they are the same spot. */
export const headingTo = (a, b, fallback = 0) => (b && Number.isFinite(b.x) && Math.hypot(b.x - a.x, b.z - a.z) > 0.5 ? Math.atan2(b.x - a.x, b.z - a.z) : fallback);

export function createCarts(scene, { groundY = () => 0, compile = null, actors = null } = {}) {
  const group = new THREE.Group(); group.name = 'ox-carts'; scene.add(group);
  const carts = new Map();          // id -> { v, x, z, yaw, mode: 'parked' | 'roam', building, home }
  const spare = [];                 // built carts waiting for a new owner
  const stats = { built: 0, parked: 0, roaming: 0, rides: 0 };
  let ride = null;

  async function build() {
    if (spare.length) return spare.pop();
    const v = await createVehicle(CART_SPEC);
    v.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
    // the kit stands its animal a step AHEAD of the shaft tips (looked at in a screenshot: an ox walking in front of a
    // cart it is not attached to). An ox goes BETWEEN the shafts: back it up until its rump is a hand from the bed.
    try {
      const root = v.group.children[0], ox = root?.children.find(c => c.userData?.character);
      if (ox) { const b = new THREE.Box3().setFromObject(ox), bed = v.metrics().seat?.x ?? -0.3; const rumpAt = Math.max(0.95, bed + 1.25); ox.position.x -= Math.max(0, (b.min.x - v.group.position.x) - rumpAt); }
    } catch { /* drawn where the kit put it */ }
    try { v.seat = v.metrics().seat || { x: -0.3, y: 0.8, z: 0 }; } catch { v.seat = { x: -0.3, y: 0.8, z: 0 }; }
    if (compile) { try { await compile(v.group); } catch { /* drawn anyway */ } }
    stats.built++;
    return v;
  }
  /** Build one before anybody needs it (boot): its geometry is ready and its shaders are in the cache. */
  async function prewarm() { try { spare.push(await build()); } catch { /* a cart that cannot be built is simply not drawn */ } }

  function place(c) {
    if (!c.v) return;
    const g = c.v.group;
    g.position.set(c.x, groundY(c.x, c.z), c.z);
    g.rotation.y = c.yaw - Math.PI / 2;            // the model faces +x; our yaw 0 faces +z
  }
  async function ensure(id, init) {
    let c = carts.get(id);
    if (c) return c;
    c = { id, v: null, x: init.x, z: init.z, yaw: init.yaw || 0, mode: init.mode, building: true, moving: false, home: { x: init.x, z: init.z, yaw: init.yaw || 0 } };
    carts.set(id, c);
    try {
      const v = await build();
      if (carts.get(id) !== c) { spare.push(v); return c; }      // it left while we were building
      c.v = v; group.add(v.group); v.setAnim('idle'); place(c);
    } finally { c.building = false; }
    return c;
  }

  return {
    group, stats, carts,
    prewarm,
    /** A cart standing by a gate (object entity `info.type: 'cart'`). */
    setParked(id, { x, z, yaw = 0 }) {
      const c = carts.get(id);
      if (c) { if (ride?.cart === c) return; Object.assign(c, { x, z, yaw, mode: 'parked' }); c.home = { x, z, yaw }; place(c); return; }
      ensure(id, { x, z, yaw, mode: 'parked' });
    },
    /** A traveller with a cart (`info.vehicle`): the cart follows the body `id` from now on. */
    setRoaming(id, on = true) {
      if (!on) { this.remove(id); return; }
      if (carts.has(id)) return;
      const a = actors?.get(id); if (!a) return;
      const p = cartBehind(a.pos.x, a.pos.z, a.yaw || 0);
      ensure(id, { ...p, mode: 'roam' });
    },
    remove(id) {
      const c = carts.get(id); if (!c) return;
      if (ride?.cart === c) return;                 // it is carrying you off: it goes when the ride ends
      carts.delete(id);
      if (c.v) { group.remove(c.v.group); c.v.setAnim('idle'); spare.push(c.v); }
    },
    clear() { ride = null; for (const id of [...carts.keys()]) this.remove(id); },
    has: id => carts.has(id),
    /** The cart nearest a point within `max` metres, or null. */
    nearest(x, z, max = 30) { let best = null, bd = max; for (const c of carts.values()) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd && c.v) { bd = d; best = c; } } return best; },

    /**
     * The ride A granted. `self` = { x, z } where you stand; `cover(text)` closes the travel veil. The nearest cart
     * (the one you asked) pulls away toward `msg.to`; with none in sight one is drawn beside you.
     */
    async startRide(msg = {}, { self, cover = null } = {}) {
      if (!self) return false;
      stats.rides++;
      let c = this.nearest(self.x, self.z, 25);
      if (!c) c = await ensure('ride:' + stats.rides, { x: self.x + 1.6, z: self.z, yaw: headingTo(self, msg.to, 0), mode: 'parked' });
      if (!c?.v) return false;
      const total = Math.max(1200, Number.isFinite(msg.ms) ? msg.ms : RIDE.showMs);
      // [World, round 11 #45] A's `path` (the road out): start where this cart stands, skip points right under it
      const path = Array.isArray(msg.path) && msg.path.length >= 2 ? [[c.x, c.z], ...msg.path.filter(p => Array.isArray(p) && Math.hypot(p[0] - c.x, p[1] - c.z) > 3)] : null;
      const lead = path && path.length >= 2 ? alongPath(path, 4) : null;
      ride = { cart: c, t: 0, from: { x: c.x, z: c.z }, yaw0: c.yaw, yaw: lead ? lead.yaw : headingTo(c, msg.to, c.yaw), path: path && path.length >= 2 ? path : null, showMs: total, totalMs: total, veiled: false, cover, name: msg.to?.name || msg.toName || 'the next town', was: c.mode };
      c.mode = 'ride'; c.v.setAnim('roll');
      return true;
    },
    get riding() { return !!ride; },
    /** The ride's own time is up and a moment more (the arrival should have come). */
    rideOver: () => !!ride && ride.t > ride.totalMs + 1500,
    /** While riding: where you are drawn — sat on the bed of the cart. Returns `drawn` untouched when not riding. */
    ridePos(drawn) {
      if (!ride?.cart?.v) return drawn;
      const c = ride.cart, s = c.v.seat || { x: -0.3, y: 0.8, z: 0 };
      // the seat is in the cart's own frame (+x forward): turn it into the world
      const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
      return { ...drawn, x: c.x + fx * s.x + rx * s.z, y: groundY(c.x, c.z) + s.y, z: c.z + fz * s.x + rz * s.z, riding: true, yaw: c.yaw };
    },
    /** The ride is over (you arrived, or it was refused): the cart goes home and you stand on your own feet. */
    endRide() {
      if (!ride) return;
      const c = ride.cart; ride = null;
      if (!c) return;
      if (String(c.id).startsWith('ride:')) { this.remove(c.id); return; }
      c.mode = c.was || 'parked'; Object.assign(c, c.home); c.v?.setAnim('idle'); place(c);
    },

    update(dt, elapsed = 0) {
      let parked = 0, roaming = 0;
      for (const c of carts.values()) {
        if (c.mode === 'roam') {
          roaming++;
          const a = actors?.get(c.id);
          if (a) {
            const want = cartBehind(a.pos.x, a.pos.z, a.yaw || 0);
            const k = 1 - Math.exp(-dt * 3.2);
            const moved = Math.hypot(want.x - c.x, want.z - c.z);
            c.x += (want.x - c.x) * k; c.z += (want.z - c.z) * k;
            let dy = want.yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * (1 - Math.exp(-dt * 2.2));
            const rolling = moved > 0.12;
            if (c.v && rolling !== c.moving) { c.moving = rolling; c.v.setAnim(rolling ? 'roll' : 'idle'); }
            place(c);
          }
        } else if (c.mode === 'parked') parked++;
        c.v?.update(dt, elapsed);
      }
      if (ride) {
        ride.t += dt * 1000;
        const c = ride.cart, t = ride.t / 1000;
        // swing round to the road first (half a second), then pull away
        if (ride.path) {       // [World #45] along the road: the distance the same easing covers, laid on the path
          const d = rideAt(ride.from, 0, Math.max(0, t - 0.35)).d, q = alongPath(ride.path, d), ahead = alongPath(ride.path, d + 3);
          if (q) { const want = ahead ? ahead.yaw : q.yaw; let dy = want - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * (1 - Math.exp(-dt * 4)); c.x = q.x; c.z = q.z; place(c); }
        } else {
          let dy = ride.yaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * (1 - Math.exp(-dt * 2.5));
          const p = rideAt(ride.from, c.yaw, Math.max(0, t - 0.35));
          c.x = p.x; c.z = p.z; place(c);
        }
        if (!ride.veiled && ride.t >= Math.max(600, ride.showMs - RIDE.veilLeadMs)) { ride.veiled = true; try { ride.cover?.(`Riding to ${ride.name}…`); } catch {} }
        if (ride.t > ride.totalMs + 6000) this.endRide();        // the arrival never came: do not leave you sat on a cart
      }
      stats.parked = parked; stats.roaming = roaming;
    },
    ride: () => (ride ? { t: ride.t, name: ride.name, veiled: ride.veiled, x: ride.cart.x, z: ride.cart.z } : null),
  };
}
