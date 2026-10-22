// How a character moves in an arena minigame. ONE function, run by the server for the real thing and by each
// player's own browser to predict their character between server updates — so the stick feels instant and the two
// can never disagree about the rule. Pure, no imports.
//
//   body   { x, z, y, vx, vz, yaw, flags }          metres; +x right, +z toward the camera; yaw 0 faces +z
//   input  { mx, mz, b }                            stick as a world direction (length <= 1), button bits (protocol IN)
//   move   { speed, accel, carryMul?, stunDrag?, boostMul?, slowMul? }   from the game's meta.move (accel low = ice)
//          mode: 'car' steers like a kart instead: the stick is the heading you want, the body turns toward it at
//          `turn` rad/s and drives forward; `grip` (per second) kills the sideways slide (low = drifty)
//   arena  { shape: 'rect', hw, hd, wall } | { shape: 'circle', r, wall }     wall: true = you cannot leave
//          optional solid obstacles, any arena: blocks [{ x, z, hw, hd }] (boxes), posts [{ x, z, r }] (round),
//          segs [{ ax, az, bx, bz }] (thin walls, e.g. a race track's edges). A game whose layout is generated from
//          the seed returns that arena from init() as `arena`; the player's browser predicts with it (play.js).
export const DT = 0.05;
export const BODY_R = 0.45;
export const F = Object.freeze({ OUT: 1, STUN: 2, CARRY: 4, FROZEN: 8, AIR: 16, GHOST: 32, BOOST: 64, SLOW: 128 });

export const makeBody = (x = 0, z = 0, yaw = 0) => ({ x, z, y: 0, vx: 0, vz: 0, yaw, flags: 0 });

export function stepBody(b, inp, move, arena, dt = DT) {
  if (b.flags & (F.OUT | F.FROZEN)) { b.vx = 0; b.vz = 0; return b; }
  let mx = +inp?.mx || 0, mz = +inp?.mz || 0;
  const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
  const stunned = !!(b.flags & F.STUN);
  const speed = move.speed * ((b.flags & F.CARRY) ? (move.carryMul ?? 0.8) : 1) * ((b.flags & F.BOOST) ? (move.boostMul ?? 1.6) : 1) * ((b.flags & F.SLOW) ? (move.slowMul ?? 0.5) : 1);
  if (stunned) { const k = Math.max(0, 1 - (move.stunDrag ?? 1.2) * dt); b.vx *= k; b.vz *= k; }   // no control: you slide to a stop
  else if (move.mode === 'car') steerCar(b, mx, mz, m, speed, move, dt);
  else { const k = Math.min(1, (move.accel ?? 40) * dt); b.vx += (mx * speed - b.vx) * k; b.vz += (mz * speed - b.vz) * k; }
  b.x += b.vx * dt; b.z += b.vz * dt;
  if (!stunned && m > 0.15 && move.mode !== 'car') b.yaw = Math.atan2(mx, mz);
  if (arena?.wall) clampToArena(b, arena);
  if (arena && (arena.blocks || arena.posts || arena.segs)) collideObstacles(b, arena);
  return b;
}
/** Kart steering: turn toward the stick's heading, drive forward with the push, and lose the sideways slide by `grip`. */
function steerCar(b, mx, mz, m, speed, move, dt) {
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  let fwd = b.vx * fx + b.vz * fz, lat = b.vx * fz - b.vz * fx;
  let throttle = 0;
  if (m > 0.15) {
    let d = Math.atan2(mx, mz) - b.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    const turn = (move.turn ?? 3.4) * dt * (0.45 + 0.55 * Math.min(1, Math.abs(fwd) / Math.max(1, speed)));
    b.yaw += Math.max(-turn, Math.min(turn, d));
    throttle = m * (Math.abs(d) < 2.1 ? Math.max(0.35, Math.cos(d * 0.7)) : -0.35);     // stick pointing back: brake, then reverse slowly
  }
  const k = Math.min(1, (move.accel ?? 6) * dt);
  fwd += (throttle * speed - fwd) * k;
  lat *= Math.max(0, 1 - (move.grip ?? 8) * dt);
  const nx = Math.sin(b.yaw), nz = Math.cos(b.yaw);
  b.vx = nx * fwd + nz * lat; b.vz = nz * fwd - nx * lat;
}
export function clampToArena(b, arena, r = BODY_R) {
  if (arena.shape === 'circle') {
    const lim = arena.r - r, d = Math.hypot(b.x, b.z);
    if (d > lim) { const k = lim / d; b.x *= k; b.z *= k; const nx = b.x / lim, nz = b.z / lim, vn = b.vx * nx + b.vz * nz; if (vn > 0) { b.vx -= vn * nx; b.vz -= vn * nz; } }
  } else {
    const lx = arena.hw - r, lz = arena.hd - r;
    if (b.x > lx) { b.x = lx; if (b.vx > 0) b.vx = 0; } else if (b.x < -lx) { b.x = -lx; if (b.vx < 0) b.vx = 0; }
    if (b.z > lz) { b.z = lz; if (b.vz > 0) b.vz = 0; } else if (b.z < -lz) { b.z = -lz; if (b.vz < 0) b.vz = 0; }
  }
}
/** Push a body out of the arena's solid obstacles (blocks, posts, segs) and stop the part of its velocity going in. */
export function collideObstacles(b, arena, r = BODY_R) {
  const push = (nx, nz, depth) => { b.x += nx * depth; b.z += nz * depth; const vn = b.vx * nx + b.vz * nz; if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; } };
  for (const o of arena.posts || []) {
    const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz), min = o.r + r;
    if (d < min) { if (d < 1e-6) push(1, 0, min); else push(dx / d, dz / d, min - d); }
  }
  for (const o of arena.blocks || []) {
    const cx = Math.max(o.x - o.hw, Math.min(o.x + o.hw, b.x)), cz = Math.max(o.z - o.hd, Math.min(o.z + o.hd, b.z));
    const dx = b.x - cx, dz = b.z - cz, d = Math.hypot(dx, dz);
    if (d >= r) continue;
    if (d > 1e-6) { push(dx / d, dz / d, r - d); continue; }
    const px = o.hw + r - Math.abs(b.x - o.x), pz = o.hd + r - Math.abs(b.z - o.z);           // centre inside: leave by the nearest side
    if (px < pz) push(Math.sign(b.x - o.x) || 1, 0, px); else push(0, Math.sign(b.z - o.z) || 1, pz);
  }
  for (const s of arena.segs || []) {
    const ex = s.bx - s.ax, ez = s.bz - s.az, L = ex * ex + ez * ez || 1e-9;
    const t = Math.max(0, Math.min(1, ((b.x - s.ax) * ex + (b.z - s.az) * ez) / L));
    const dx = b.x - (s.ax + ex * t), dz = b.z - (s.az + ez * t), d = Math.hypot(dx, dz);
    if (d < r && d > 1e-6) push(dx / d, dz / d, r - d);
  }
}
/** Is (x, z) over the arena floor? (For arenas you can fall off.) */
export function insideArena(x, z, arena, margin = 0) {
  return arena.shape === 'circle' ? Math.hypot(x, z) <= arena.r + margin : Math.abs(x) <= arena.hw + margin && Math.abs(z) <= arena.hd + margin;
}
/** Push overlapping bodies apart (server only; a client sees the result in the next update). */
export function separate(bodies, r = BODY_R) {
  const list = [...bodies].filter(b => !(b.flags & (F.OUT | F.GHOST)));
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], c = list[j], dx = c.x - a.x, dz = c.z - a.z, d = Math.hypot(dx, dz), min = r * 2;
    if (d >= min || d < 1e-6) continue;
    const push = (min - d) / 2, nx = dx / d, nz = dz / d;
    a.x -= nx * push; a.z -= nz * push; c.x += nx * push; c.z += nz * push;
  }
}
/** Where each seat starts: evenly round a circle of radius `r`, facing the middle. */
export function spawnRing(n, r, phase = Math.PI / 4) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = phase + i * Math.PI * 2 / n; const x = Math.sin(a) * r, z = Math.cos(a) * r; out.push({ x, z, yaw: Math.atan2(-x, -z) }); }
  return out;
}
/** A body as a snapshot row and back (two decimals is a centimetre: plenty, and it halves the frame). */
const r2 = v => Math.round(v * 100) / 100;
export const packBody = (b, ack = 0) => [r2(b.x), r2(b.z), r2(b.y), r2(b.yaw), b.flags, ack, r2(b.vx), r2(b.vz)];
export const unpackBody = a => ({ x: a[0], z: a[1], y: a[2], yaw: a[3], flags: a[4], ack: a[5], vx: a[6], vz: a[7] });
