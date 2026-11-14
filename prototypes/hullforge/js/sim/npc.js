// Pilots for the ships that are not plain enemy patrols (round 2): traders on a route, convoy escorts, the patrol,
// raiders who go for a freighter or an outpost, joined raiders who fly off. Each such ship gets `b.think = pilot`
// and its orders in `b.ai`; world.js step runs it (enemy patrols still use ai.js `think`).
//
//   b.ai = { route: [points], speed: 0..1, loop?: true }        fly the route (then hold, or loop)
//        + { sight, prefer?: body, post?, leash?, follow? }     fight: nearest foe in sight (prefer one body)
//        + { leave: true }                                      fly away from the player and vanish when far
//
// Turrets aim on their own (world.js turrets: every ship shoots the nearest thing it is hostile to), so a pilot only
// has to put the ship somewhere useful.

import { vsub, vadd, vscale, vnorm, vlen, vdist, vdot, vcross, qinv, clamp, hash } from '../core/math.js';
import { forward } from './body.js';
import { hostile } from './world.js';

/** Turn toward a point and fly there at `speed` (share of top speed), slowing down on arrival. Returns the distance. */
export function steerTo(b, goal, speed = 1, stopAt = 30) {
  const to = vsub(goal, b.pos); const d = vlen(to); const inp = b.input;
  if (d > 1) inp.aimDir = vscale(to, 1 / d);
  const f = forward(b); const facing = d > 1 ? vdot(f, inp.aimDir) : 1;
  const sp = d > stopAt ? Math.min(speed, (d - stopAt) / 120 + 0.08) : 0;
  inp.thrust = { x: 0, y: 0, z: facing > 0.6 ? sp : facing > 0 ? sp * 0.35 : 0 };
  inp.boost = false; inp.roll = 0;
  return d;
}

/** Fight one target: hold at the guns' range, circle and strafe (same moves as ai.js enemy pilots). */
export function attackMove(w, b, T) {
  const inp = b.input; const d = vdist(T.pos, b.pos);
  const range = b.prefRange || (b.prefRange = clamp(Math.min(...b.turrets.map(t => t.s.range).concat([300])) * 0.62, 55, 260));
  const ph = (hash(b.id) % 1000) / 1000 * 6.28;
  const to = vnorm(vsub(T.pos, b.pos));
  let aim = to;
  if (b.radius > 9) { const side = vnorm(vcross(to, { x: 0, y: 1, z: 0 })); aim = vnorm(vadd(vscale(to, 0.45), vscale(side, Math.sin(w.t * 0.1 + ph) > 0 ? 0.9 : -0.9))); }
  inp.aimDir = aim;
  const loc = qinv(b.quat, to);
  const close = d < range * 0.7, far = d > range * 1.15;
  const want = vscale(loc, far ? 1 : close ? -0.7 : 0);
  const sw = Math.sin(w.t * 0.35 + ph) > 0 ? 1 : -1;
  inp.thrust = { x: clamp(want.x + sw * 0.7, -1, 1), y: clamp(want.y + Math.sin(w.t * 0.5 + ph) * 0.4, -1, 1), z: clamp(want.z + (far ? 0.6 : 0.15), -1, 1) };
  inp.boost = d > 900; inp.roll = 0;
  b.target = T;
}

/** The nearest ship this one is hostile to, within `range` of point p. */
export function nearestFoe(w, b, p, range) {
  let best = null, bd = range * range;
  for (const o of w.bodies) {
    if (o.dead || o.kind !== 'ship' || o === b || !hostile(b, o)) continue;
    const d2 = (o.pos.x - p.x) ** 2 + (o.pos.y - p.y) ** 2 + (o.pos.z - p.z) ** 2;
    if (d2 < bd) { bd = d2; best = o; }
  }
  return best;
}

/** The pilot every round-2 ship uses. Thinks a few times a second. */
export function pilot(w, b) {
  const A = b.ai || (b.ai = {});
  b.thinkT = (b.thinkT || 0) - 1 / 60; if (b.thinkT > 0) return;
  b.thinkT = 0.15 + (b.id % 7) * 0.01;
  if (A.hold) { steerTo(b, b.pos, 0); return; }
  // leaving: fly away from the player, vanish once far out (and never in sight of a fight)
  if (A.leave) {
    const P = w.player; const away = P ? vnorm(vsub(b.pos, P.pos)) : forward(b);
    steerTo(b, vadd(b.pos, vscale(away, 1000)), 1, 0); b.input.boost = true;
    if (!P || vdist(P.pos, b.pos) > 3200) b.dead = true;
    return;
  }
  // fighting: a preferred target (the freighter, the outpost's attacker) first, then the nearest foe in sight
  if (A.sight) {
    const home = A.follow && !A.follow.dead ? A.follow.pos : A.post || b.pos;
    let T = A.prefer && !A.prefer.dead && vdist(A.prefer.pos, b.pos) < (A.leash || 4000) ? A.prefer : null;
    if (T && !hostile(b, T)) T = null;
    if (!T) T = nearestFoe(w, b, b.pos, A.sight);
    if (T && A.post && vdist(T.pos, A.post) > (A.leash || 3000)) T = null;
    if (T) { attackMove(w, b, T); return; }
    b.target = null;
    if (!A.route) {
      // nothing to fight: back to the post (or beside the ship it follows), drifting on a slow loop
      const a = w.t * 0.06 + (b.id % 9); const R = A.follow ? 40 + b.radius * 2 : 140;
      steerTo(b, vadd(home, { x: Math.cos(a) * R, y: Math.sin(a * 0.7) * 30, z: Math.sin(a) * R }), A.follow ? 1 : 0.45, 20);
      return;
    }
  }
  // a route: fly it point by point
  if (A.route?.length) {
    const i = Math.min(A.i || 0, A.route.length - 1);
    const d = steerTo(b, A.route[i], A.speed ?? 0.5, A.stopAt ?? 40);
    if (d < (A.reach || 80)) {
      if (i < A.route.length - 1) A.i = i + 1;
      else if (A.loop) A.i = 0;
      else A.arrived = true;
    }
    return;
  }
  steerTo(b, b.pos, 0);
}
