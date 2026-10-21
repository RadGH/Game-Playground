// Chibi 2 straps that FOLLOW THE BODY (2026-10-21 owner review: "the quiver strap does not go over the
// shoulder and looks like a separate thing" — and the same for the harness, the apron, every pack and satchel).
//
// WHY. Every strap was a Catmull-Rom curve through three or four hand-placed points, each point's depth asked of
// the chest surface. Between the points the curve runs straight through the torso (a chest is round, a chord is
// not), so a strap dipped INTO the body in the middle and came out at the ends; and nothing ever went OVER the
// shoulder, so the front strap and the back strap were two pieces that stopped short of each other.
//
// HOW. A strap is a path in two numbers: `x` (across the body) and `phi`, the angle round a horizontal axis
// through the middle of the chest (phi 0 = straight forward, PI/2 = straight up over the shoulder, PI = straight
// back, negative = down the front). Each of ~30 samples along the path casts a ray from the axis outward and stops
// where it leaves the torso (the same lathe rings the body is built from), then stands `lift` off it. So the strap
// lies ON the body all the way round — over a round dwarf's belly, over a plate shell, over the shoulder — and is
// one continuous piece.
//
// Pure geometry: needs THREE only for the tube (taperedCurve). Bone space = the chest bone.
import * as THREE from 'three';
import { taperedCurve } from './chibi2-geometry.js';

/** Linear interpolation of lathe rings [y, rx, rz, zoff] at height y (same as chibi2-body.js). */
function ringAt(rings, y) {
  if (y <= rings[0][0]) return rings[0];
  for (let i = 1; i < rings.length; i++) {
    if (y <= rings[i][0]) {
      const a = rings[i - 1], b = rings[i], t = (y - a[0]) / (b[0] - a[0] || 1);
      return [y, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] || 0) + ((b[3] || 0) - (a[3] || 0)) * t];
    }
  }
  return rings[rings.length - 1];
}

/**
 * `makeWrap(chestRings, { T, grow })` -> { surface(x, phi, lift), strap(add, path, r, colour, opts), shoulderTop(x) }.
 *   chestRings  the torso rings in chest space (buildBody returns them)
 *   grow        how much thicker than the bare torso the clothes under the strap are (a plate shell ~0.03)
 *   spheres     [[x, y, z, r], ...] more solids to lie over (the shoulder balls)
 */
export function makeWrap(chestRings, { T = 1, grow = 0, spheres = [] } = {}) {
  const y0 = chestRings[0][0], y1 = chestRings[chestRings.length - 1][0];
  const yc = 0.12 * T;                     // the axis the rays leave from: mid chest
  const inside = (x, y, z) => {
    // `spheres` [x, y, z, r]: the shoulder balls, so a cape's yoke goes OVER the top of each arm rather than into it
    for (const [sx, sy, sz, r] of spheres) if ((x - sx) ** 2 + (y - sy) ** 2 + (z - sz) ** 2 <= r * r) return true;
    if (y < y0 || y > y1) return false;
    const [, rx, rz, z0] = ringAt(chestRings, y);
    return (x / (rx + grow)) ** 2 + ((z - (z0 || 0)) / (rz + grow)) ** 2 <= 1;
  };
  /** The point on the body at (x, phi), `lift` off it. */
  const surface = (x, phi, lift = 0) => {
    const dy = Math.sin(phi), dz = Math.cos(phi);
    let t = 0;
    // coarse march out, then refine the crossing
    for (let s = 0.004; s < 0.7; s += 0.004) { if (inside(x, yc + dy * s, dz * s)) t = s; else if (t > 0) break; }
    let lo = t, hi = t + 0.004;
    for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (inside(x, yc + dy * m, dz * m)) lo = m; else hi = m; }
    // stand off along the surface normal-ish: the ray direction is close enough on a lathe this round
    const d = lo + lift;
    return [x, yc + dy * d, dz * d];
  };
  /** The top of the shoulder at x (highest y still inside the torso at z ~ 0). */
  const shoulderTop = x => surface(x, Math.PI / 2)[1];
  /**
   * A strap along `path` = [[x, phi], ...] (straight in x/phi between the keys, sampled `n` times), radius r.
   * `extraStart` / `extraEnd` are free [x, y, z] points glued on before / after (to reach a bag off the body). Returns the samples.
   */
  const strap = (add, path, r, colour, { lift = 0.006, n = 30, bone = 'chest', metal = false, sides = 4, extraStart = null, extraEnd = null, weigh = null } = {}) => {
    const seg = [];
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) { const l = Math.hypot(path[i + 1][0] - path[i][0], (path[i + 1][1] - path[i][1]) * 0.18); seg.push(l); total += l; }
    const pts = [];
    for (let k = 0; k <= n; k++) {
      let d = total * k / n, i = 0;
      while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
      const t = seg[i] ? Math.min(1, d / seg[i]) : 0, a = path[i], b = path[i + 1];
      pts.push(surface(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, lift + r * 0.7));
    }
    const all = [...(extraStart || []), ...pts, ...(extraEnd || [])];
    if (add) add(taperedCurve(all, all.map(() => r), sides, Math.max(8, all.length)), bone, colour, { metal, ...(weigh ? { weigh } : {}) });
    return pts;
  };
  /** The point on the body's SIDE (under the arm) at height y, on side s (+1 = right). */
  const side = (y, s, lift = 0) => { const [, rx, , z0] = ringAt(chestRings, Math.min(y1, Math.max(y0, y))); return [s * (rx + grow + lift), y, z0 || 0]; };
  /**
   * A strap that is a CLOSED LOOP: `path` runs over the body (usually back -> over a shoulder -> front), and the loop is
   * closed round the side of the body at the ends' height on side `closeSide` (a bandolier, a satchel's strap).
   */
  const loop = (add, path, r, colour, { lift = 0.006, n = 30, bone = 'chest', metal = false, sides = 4, closeSide = null, weigh = null } = {}) => {
    const pts = strap(null, path, r, colour, { lift, n });
    const a = pts[pts.length - 1], b = pts[0], sgn = closeSide ?? Math.sign(a[0] || b[0] || 1);
    // (the closing run hugs the flank — a hanging forearm passes right beside it)
    const ys = (a[1] + b[1]) / 2, q = side(ys, sgn, r * 0.4).map((v, i) => i === 0 ? v * 0.985 : v);
    const all = [...pts, [(a[0] + q[0]) / 2, (a[1] + ys) / 2, (a[2] + q[2]) / 2 * 0.7], q, [(b[0] + q[0]) / 2, (b[1] + ys) / 2, (b[2] + q[2]) / 2 * 0.7]];
    // the two midpoints are pushed out to the side surface too, so the closing run lies on the flank and not through it
    for (const i of [all.length - 3, all.length - 1]) { const [x, y, z] = all[i], m = side(y, sgn, r * 0.5), [, rx, rz, z0] = ringAt(chestRings, Math.min(y1, Math.max(y0, y))); const ang = Math.atan2(x / (rx + grow), (z - (z0 || 0)) / (rz + grow)); all[i] = [Math.sin(ang) * Math.abs(m[0]), y, (z0 || 0) + Math.cos(ang) * (rz + grow + lift * 0.5 + r * 0.6)]; }
    const curve = new THREE.CatmullRomCurve3(all.map(p => new THREE.Vector3(...p)), true);
    if (add) add(new THREE.TubeGeometry(curve, Math.max(12, all.length + 4), r, sides, true), bone, colour, { metal, ...(weigh ? { weigh } : {}) });
    return all;
  };
  /**
   * Skin weights for a strap on the chest bone: the run over the outer shoulder and past the armpit rides the arm on
   * its side up to `max`, so a raised arm lifts the strap instead of coming through it.
   */
  const armWeigh = (W = 1, max = 0.6) => (x, y) => {
    const k = Math.min(1, Math.max(0, (Math.abs(x) - 0.1 * W) / (0.1 * W))) * Math.min(1, Math.max(0, (y - 0.02 * T) / (0.16 * T))) * max;
    return k > 0 ? [['chest', 1 - k], [x < 0 ? 'armL' : 'armR', k]] : [['chest', 1]];
  };
  return { surface, strap, shoulderTop, yc, side, loop, armWeigh };
}
