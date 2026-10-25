// GOLF KIT — the rolling-ball physics every Tumblefair golf game shares (Putt Party, Chip-In Challenge, Haunted Hole;
// Long Drive uses only the helpers at the bottom). Pure: no DOM, no Math.random, no Date — the server runs it, the
// tests run it, and a view may import the small helpers (heightAt, assistYaw, puttSpeed, charge) to draw exactly what the
// rules will do.
//
// The model is 2D top-down in metres (+x right, +z toward the camera, the same axes as shared/arena.js):
//   ball    { x, z, vx, vz, still, in }          in = dropped into the cup
//   course  { walls: [{ ax, az, bx, bz, e? }]   thin walls (line segments; e = bounciness, default 0.72)
//             posts: [{ x, z, r, e? }]           round bumpers (e > 1 = a springy fairground bumper)
//             boxes: [{ x, z, hw, hd, e? }]      axis-aligned blocks (tombstones, crates)
//             ramps: [{ x, z, hw, hd, axis, rise }]  a hump: height rises linearly to `rise` at the middle line and falls
//                                                again; axis 'x' = the hump runs across x (you climb it moving in x)
//             slopes: [{ x, z, hw, hd, gx, gz }] a tilted patch pushing the ball (m/s²)
//             spinners: [{ x, z, len, arms, w, phase, hub }]   windmill paddles turning about (x, z) at w rad/s
//             cup: { x, z, r, cap }              r = the hole; cap = the most speed a ball can drop in at
//             roll, lin                          friction: speed falls by (roll + lin * speed) each second
//             dyn: [{ x, z, r, vx, vz, e? }]     extra moving round things a game sets each step (a closed coffin lid)
//             near: (x, z) => walls            optional: only the walls near a point (a course with hundreds of wall
//                                                pieces, like Mini Golf's letter-shaped holes, hands the kit a lookup grid)
//           }
// stepBalls(balls, course, t, dt) moves every ball one step in 8 small slices (no tunnelling at putting speeds),
// bounces them off everything (moving paddles push with their own speed), off each other (equal masses), and drops a
// slow ball into the cup. It returns what happened, for sounds: [{ e: 'wall'|'post'|'ball'|'spin'|'lip'|'cup', i, j?, x, z }].

export const BALL_R = 0.13;
export const G_ROLL = 6;                       // how hard a ramp pulls a rolling ball (m/s² per unit of slope)
const SUB = 8;
const r2 = v => Math.round(v * 100) / 100;

export const makeBall = (x, z) => ({ x, z, vx: 0, vz: 0, still: true, in: false });
export const speedOf = b => Math.hypot(b.vx, b.vz);

/** Height of the ground at (x, z): ramps only (everything else is flat). */
export function heightAt(course, x, z) {
  let y = 0;
  for (const R of course.ramps || []) {
    if (Math.abs(x - R.x) > R.hw || Math.abs(z - R.z) > R.hd) continue;
    const u = R.axis === 'x' ? (x - R.x) / R.hw : (z - R.z) / R.hd;
    y = Math.max(y, R.rise * (1 - Math.abs(u)));
  }
  return y;
}
/** The push of the ground at (x, z) (m/s²): ramps roll you down, slope patches tilt you. */
export function slopeAt(course, x, z) {
  let gx = 0, gz = 0;
  for (const R of course.ramps || []) {
    if (Math.abs(x - R.x) > R.hw || Math.abs(z - R.z) > R.hd) continue;
    if (R.axis === 'x') { const s = Math.sign(x - R.x) || 1; gx += s * G_ROLL * R.rise / R.hw; }
    else { const s = Math.sign(z - R.z) || 1; gz += s * G_ROLL * R.rise / R.hd; }
  }
  for (const S of course.slopes || []) if (Math.abs(x - S.x) <= S.hw && Math.abs(z - S.z) <= S.hd) { gx += S.gx; gz += S.gz; }
  return [gx, gz];
}
/** The paddles of a spinner at time t: [{ ax, az, bx, bz, w }] (a = the hub end). */
export function spinnerArms(S, t) {
  const out = [], a0 = S.phase + S.w * t;
  for (let k = 0; k < S.arms; k++) {
    const a = a0 + k * Math.PI * 2 / S.arms, hub = S.hub ?? 0.25;
    out.push({ ax: S.x + Math.cos(a) * hub, az: S.z + Math.sin(a) * hub, bx: S.x + Math.cos(a) * S.len, bz: S.z + Math.sin(a) * S.len });
  }
  return out;
}

function bounce(b, nx, nz, depth, e, wvx = 0, wvz = 0) {
  b.x += nx * depth; b.z += nz * depth;
  const rvx = b.vx - wvx, rvz = b.vz - wvz, vn = rvx * nx + rvz * nz;
  if (vn < 0) { b.vx -= (1 + e) * vn * nx; b.vz -= (1 + e) * vn * nz; return -vn; }
  return 0;
}
function segHit(b, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez || 1e-9;
  const t = Math.max(0, Math.min(1, ((b.x - ax) * ex + (b.z - az) * ez) / L));
  const px = ax + ex * t, pz = az + ez * t, dx = b.x - px, dz = b.z - pz, d = Math.hypot(dx, dz);
  if (d >= BALL_R) return null;
  if (d < 1e-6) { const n = Math.hypot(ez, ex) || 1; return { nx: -ez / n, nz: ex / n, depth: BALL_R, px, pz }; }
  return { nx: dx / d, nz: dz / d, depth: BALL_R - d, px, pz };
}

/** Move every ball one step. `t` = the course clock (seconds) at the START of the step (spinners turn with it). */
export function stepBalls(balls, course, t, dt) {
  const ev = [], h = dt / SUB, roll = course.roll ?? 1.0, lin = course.lin ?? 0.45, cup = course.cup;
  const noted = new Set();
  const note = (e, i, x, z, j) => { const k = e + i + ':' + (j ?? ''); if (noted.has(k)) return; noted.add(k); ev.push({ e, i, x: r2(x), z: r2(z), ...(j != null ? { j } : {}) }); };
  for (let s = 0; s < SUB; s++) {
    const ts = t + s * h;
    const arms = []; for (const S of course.spinners || []) for (const A of spinnerArms(S, ts)) { A.S = S; arms.push(A); }
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i]; if (b.in || b.gone) continue;
      const [gx, gz] = slopeAt(course, b.x, b.z), g = Math.hypot(gx, gz);
      if (b.still) {
        const shoved = (course.dyn || []).some(P => Math.hypot(b.x - P.x, b.z - P.z) < P.r + BALL_R);
        if (g <= roll * 1.05 && !shoved) continue;          // resting: the slope is not steep enough to start it again
        b.still = false;
      }
      b.vx += gx * h; b.vz += gz * h;
      let sp = speedOf(b);
      // the cup: a slow ball near it is drawn in a little; one inside the rim and slow enough drops
      if (cup) {
        const dx = cup.x - b.x, dz = cup.z - b.z, d = Math.hypot(dx, dz);
        if (d < cup.r * 2.2 && sp < cup.cap * 0.9 && d > 1e-4) { const k = 0.9 * h / d; b.vx += dx * k; b.vz += dz * k; }
        if (d < cup.r) {
          if (sp <= cup.cap) { b.in = true; b.still = true; b.vx = b.vz = 0; b.x = cup.x; b.z = cup.z; ev.push({ e: 'cup', i, x: r2(cup.x), z: r2(cup.z) }); continue; }
          if (!b.lip) {                          // too fast: it catches the rim and is turned aside
            b.lip = true; const side = (dx * b.vz - dz * b.vx) >= 0 ? 1 : -1, a = side * 0.45, c = Math.cos(a), sn = Math.sin(a);
            const vx = b.vx * c - b.vz * sn, vz = b.vx * sn + b.vz * c; b.vx = vx * 0.82; b.vz = vz * 0.82; note('lip', i, b.x, b.z);
          }
        } else b.lip = false;
      }
      // friction
      sp = speedOf(b);
      if (sp > 0) { const ns = Math.max(0, sp - (roll + lin * sp) * h); b.vx *= ns / sp; b.vz *= ns / sp; sp = ns; }
      b.x += b.vx * h; b.z += b.vz * h;
      // bounce off things
      for (const W of (course.near ? course.near(b.x, b.z) : course.walls) || []) { const c = segHit(b, W.ax, W.az, W.bx, W.bz); if (c && bounce(b, c.nx, c.nz, c.depth, W.e ?? 0.72) > 0.4) note('wall', i, b.x, b.z); }
      for (const P of course.posts || []) {
        const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz), min = P.r + BALL_R;
        if (d < min) { const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; if (bounce(b, nx, nz, min - d, P.e ?? 0.8) > 0.3) note('post', i, b.x, b.z); }
      }
      for (const P of course.dyn || []) {
        const dx = b.x - P.x, dz = b.z - P.z, d = Math.hypot(dx, dz), min = P.r + BALL_R;
        if (d < min) { const nx = d > 1e-6 ? dx / d : 1, nz = d > 1e-6 ? dz / d : 0; if (bounce(b, nx, nz, min - d, P.e ?? 0.6, P.vx || 0, P.vz || 0) > 0.3) note('post', i, b.x, b.z); }
      }
      for (const B of course.boxes || []) {
        const cx = Math.max(B.x - B.hw, Math.min(B.x + B.hw, b.x)), cz = Math.max(B.z - B.hd, Math.min(B.z + B.hd, b.z));
        const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
        if (d >= BALL_R) continue;
        let nx, nz, depth;
        if (d > 1e-6) { nx = dx / d; nz = dz / d; depth = BALL_R - d; }
        else { const px = B.hw + BALL_R - Math.abs(b.x - B.x), pz = B.hd + BALL_R - Math.abs(b.z - B.z); if (px < pz) { nx = Math.sign(b.x - B.x) || 1; nz = 0; depth = px; } else { nx = 0; nz = Math.sign(b.z - B.z) || 1; depth = pz; } }
        if (bounce(b, nx, nz, depth, B.e ?? 0.72) > 0.4) note('wall', i, b.x, b.z);
      }
      for (const A of arms) {
        const c = segHit(b, A.ax, A.az, A.bx, A.bz); if (!c) continue;
        const rx = c.px - A.S.x, rz = c.pz - A.S.z;                       // the paddle's own speed where it touched
        if (bounce(b, c.nx, c.nz, c.depth, 0.6, -A.S.w * rz, A.S.w * rx) > 0.3) note('spin', i, b.x, b.z);
      }
    }
    // ball against ball: equal masses, a little loss
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], c = balls[j]; if (a.in || c.in || a.gone || c.gone || a.ghost || c.ghost) continue;
      const dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), min = BALL_R * 2;
      if (d >= min || d < 1e-6) continue;
      const nx = dx / d, nz = dz / d, push = (min - d) / 2;
      a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push;
      const vn = (c.vx - a.vx) * nx + (c.vz - a.vz) * nz;
      if (vn < 0) { const k = -(1 + 0.9) * vn / 2; a.vx -= k * nx; a.vz -= k * nz; c.vx += k * nx; c.vz += k * nz; a.still = c.still = false; if (-vn > 0.3) note('ball', i, a.x, a.z, j); }
    }
  }
  // settle: a slow ball on flat-enough ground stops
  for (const b of balls) {
    if (b.in || b.gone || b.still) continue;
    const [gx, gz] = slopeAt(course, b.x, b.z);
    if (speedOf(b) < 0.08 && Math.hypot(gx, gz) <= roll * 1.05) { b.vx = b.vz = 0; b.still = true; }
  }
  return ev;
}

// ---------------------------------------------------------------- shot helpers (sim + view share these)

/** Hold-to-charge power: rises 0 -> 1 over half a `period`, then falls back (so holding forever is never full power). */
export function charge(held, period) { const f = (held % period) / (period / 2); return f <= 1 ? f : 2 - f; }
/** Putt speed (m/s) for a power 0..1 — gentle at the bottom so short putts are easy to judge. */
export const puttSpeed = (p, max = 9.5) => 0.5 + (max - 0.5) * Math.pow(Math.max(0, Math.min(1, p)), 1.4);
/** Roughly how far a ball rolls on flat ground from speed v (for aim lines and bots). */
export function rollDistance(v, roll = 1.0, lin = 0.45) { return v / lin - (roll / (lin * lin)) * Math.log(1 + lin * v / roll); }
/** The power that rolls a ball about `d` metres on flat ground (bots and tests). */
export function powerFor(d, max = 9.5, roll = 1.0, lin = 0.45) {
  let lo = 0, hi = 1; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (rollDistance(puttSpeed(m, max), roll, lin) < d) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

/** Is the straight line from (x0,z0) to (x1,z1) free of walls, posts and boxes (a ball's width)? */
export function clearLine(course, x0, z0, x1, z1) {
  const ex = x1 - x0, ez = z1 - z0, L = Math.hypot(ex, ez) || 1e-9, steps = Math.ceil(L / 0.1);
  const probe = { x: 0, z: 0 };
  for (let k = 1; k < steps; k++) {
    probe.x = x0 + ex * k / steps; probe.z = z0 + ez * k / steps;
    for (const W of (course.near ? course.near(probe.x, probe.z) : course.walls) || []) if (segHit(probe, W.ax, W.az, W.bx, W.bz)) return false;
    for (const P of course.posts || []) if (Math.hypot(probe.x - P.x, probe.z - P.z) < P.r + BALL_R) return false;
    for (const B of course.boxes || []) if (Math.abs(probe.x - B.x) < B.hw + BALL_R && Math.abs(probe.z - B.z) < B.hd + BALL_R) return false;
    for (const R of course.ramps || []) if (Math.abs(probe.x - R.x) < R.hw && Math.abs(probe.z - R.z) < R.hd) return false;
  }
  return true;
}
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
/**
 * Gentle aim help: a yaw within `maxDeg` of a straight line to a target (and only when that line is clear) is pulled
 * onto it — fully in the inner half of the window, fading to nothing at its edge. yaw 0 = +z, as in arena.js.
 * targets: [{ x, z }]; the nearest-in-angle one wins. Returns the yaw to use.
 */
export function assistYaw(course, x, z, yaw, targets, maxDeg) {
  if (!maxDeg) return yaw;
  const max = maxDeg * Math.PI / 180; let best = null;
  for (const T of targets) {
    const want = Math.atan2(T.x - x, T.z - z), d = wrap(want - yaw);
    if (Math.abs(d) > max || (best && Math.abs(d) >= Math.abs(best.d))) continue;
    if (course && !clearLine(course, x, z, T.x, T.z)) continue;
    best = { d };
  }
  if (!best) return yaw;
  const a = Math.abs(best.d), w = a <= max / 2 ? 1 : (max - a) / (max / 2);
  return wrap(yaw + best.d * w);
}
/** Clone a course + balls for a look-ahead (bots; never mutates the real ones). */
export const cloneBalls = balls => balls.map(b => ({ ...b }));
/**
 * Where a putt from ball i at (yaw, speed) ends up, by running the real physics alone on the course (other balls
 * are left out). -> { x, z, in, t }. Used by the tests' bot to show every hole can be holed.
 */
export function simulatePutt(course, x, z, yaw, speed, t0 = 0, maxT = 12, dt = 0.05) {
  const b = makeBall(x, z); b.still = false; b.vx = Math.sin(yaw) * speed; b.vz = Math.cos(yaw) * speed;
  let t = t0;
  for (let k = 0; k < maxT / dt && !b.still && !b.in; k++) { stepBalls([b], course, t, dt); t += dt; }
  return { x: b.x, z: b.z, in: b.in, t: t - t0 };
}
