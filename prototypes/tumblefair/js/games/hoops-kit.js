// HOOPS KIT — the basketball every Tumblefair hoops game shares (Hoop Frenzy, Court Clash, Letter Shot).
// Pure: no DOM, no Math.random, no Date — the server runs it, the tests run it, and a view imports the small helpers
// (idealPower, tolFor, charge) to draw the same green band on its power meter that the rules will judge.
//
// Axes as in shared/arena.js: metres, +x right, +z toward the camera, +y up.
//   hoop   { x, y, z, r, nx, nz }     rim centre, rim radius, and (nx, nz) the way the backboard FACES (toward the court)
//   shot   a release from (x, y, z) at a fixed launch angle toward an aim point. The speed is NOT the raw power: the
//          meter is forgiving on purpose. power p (0..1) is compared with the ideal power for that distance (idealPower)
//          inside a tolerance (tol); q = (p - ideal) / tol is the shot's quality, and |q| <= ~0.8 swishes, ~1-1.4
//          rattles round the rim (in or out, the physics decides), beyond that it is short (q < 0) or long (q > 0).
//          `lat` (metres at the rim, + = to the shooter's right) is any sideways error (a moving hoop, a defender).
//   flyShot(...)  runs the real flight: gravity, the rim (a ring the ball can bounce off), the backboard (a plate you
//          can bank off), the floor. -> { made, T (seconds until in / clearly missed), path (every 0.05 s, rounded), end }
//          The server sends `path`, so every phone draws exactly the flight the rules judged.
import { charge } from './golf-kit.js';

export { charge };
export const G = 9.8;
export const BALL_R = 0.15;
export const ANGLE = 58 * Math.PI / 180;            // launch angle: a nice high arcade arc
export const HOOP_R = 0.3;                          // a fairground hoop (roomier than a real one)
export const BOARD = { back: 0.6, w: 1.8, h: 1.1, below: 0.3, e: 0.9 };   // rim centre -> board, board size, bounciness
export const RIM_E = 0.2, FLOOR_E = 0.62, MAGNET = 5;
const SUB = 1 / 120, SAMPLE = 0.05;
const r2 = v => Math.round(v * 100) / 100;

/** Ideal power (0..1) for a shot `d` metres out (horizontal, release to rim centre). Further = more, a straight line. */
export const idealPower = d => Math.max(0.12, Math.min(0.9, 0.12 + (d - 1) * 0.11));
/** The tolerance for a shot `d` metres out at difficulty tolerance `base` (close shots are kinder, long ones meaner). */
export const tolFor = (d, base) => base * Math.max(0.6, Math.min(1.2, 1.32 - 0.08 * d));
/** Shot quality from a meter reading: 0 = perfect, ±1 = the edge of the green band. */
export const qualityOf = (p, d, base) => (p - idealPower(d)) / tolFor(d, base);
/** Release speed (m/s) that drops a ball from height dh below the rim, d metres out, through the rim centre. */
export function idealSpeed(d, dh, angle = ANGLE) {
  const c = Math.cos(angle), den = 2 * c * c * (d * Math.tan(angle) - dh);
  return Math.sqrt(G * d * d / Math.max(0.2, den));
}
/** Horizontal distance from a release point to the rim centre. */
export const hoopDist = (x, z, hoop) => Math.hypot(hoop.x - x, hoop.z - z);
/** Is (x, z) outside the three-point arc (radius R about the rim, projected on the floor)? */
export const isThree = (x, z, hoop, R) => hoopDist(x, z, hoop) >= R;

/**
 * The release: from (x, y, z) toward the aim point (ax, az) (normally the rim centre, or where a moving hoop will be),
 * quality q, sideways error lat (m). -> { x, y, z, vx, vy, vz } (the ball at release).
 */
export function release(x, y, z, ax, az, hoopY, q, lat = 0, angle = ANGLE) {
  let dx = ax - x, dz = az - z; const d0 = Math.hypot(dx, dz) || 1e-6;
  const ux = dx / d0, uz = dz / d0;
  dx += -uz * lat; dz += ux * lat;                   // sideways: + = the shooter's right (facing u, right is (-uz, ux))
  const d = Math.max(0.6, Math.hypot(dx, dz)), hx = dx / d, hz = dz / d;
  const v = idealSpeed(d, hoopY - y, angle) * (1 + (0.1 + q * 0.26) / (2 * d));   // q = 0 lands just past the middle of the rim
  return { x, y, z, vx: hx * v * Math.cos(angle), vy: v * Math.sin(angle), vz: hz * v * Math.cos(angle) };
}

/** Bounce a ball { x, y, z, vx, vy, vz } off one hoop's rim and board. -> 'rim' | 'board' | null */
export function hitHoop(b, hoop) {
  let hit = null;
  // rim: the nearest point of the ring to the ball centre
  const dx = b.x - hoop.x, dz = b.z - hoop.z, dh = Math.hypot(dx, dz) || 1e-6;
  const px = hoop.x + dx / dh * hoop.r, pz = hoop.z + dz / dh * hoop.r;
  const ex = b.x - px, ey = b.y - hoop.y, ez = b.z - pz, ed = Math.hypot(ex, ey, ez);
  if (ed < BALL_R && ed > 1e-6) {
    const nx = ex / ed, ny = ey / ed, nz = ez / ed, vn = b.vx * nx + b.vy * ny + b.vz * nz;
    b.x += nx * (BALL_R - ed); b.y += ny * (BALL_R - ed); b.z += nz * (BALL_R - ed);
    if (vn < 0) { b.vx -= (1 + RIM_E) * vn * nx; b.vy -= (1 + RIM_E) * vn * ny; b.vz -= (1 + RIM_E) * vn * nz; hit = 'rim'; }
  }
  // board: a plate behind the rim facing (nx, nz)
  const bx = hoop.x - hoop.nx * BOARD.back, bz = hoop.z - hoop.nz * BOARD.back;
  const s = (b.x - bx) * hoop.nx + (b.z - bz) * hoop.nz, side = (b.x - bx) * -hoop.nz + (b.z - bz) * hoop.nx;
  const y0 = hoop.y - BOARD.below, y1 = y0 + BOARD.h;
  if (Math.abs(s) < BALL_R && Math.abs(side) < BOARD.w / 2 && b.y > y0 && b.y < y1) {
    const f = s >= 0 ? 1 : -1, vn = (b.vx * hoop.nx + b.vz * hoop.nz) * f;   // f: which face it touched (a ball over the top lands behind)
    b.x += hoop.nx * (f * BALL_R - s); b.z += hoop.nz * (f * BALL_R - s);
    if (vn < 0) { b.vx -= (1 + BOARD.e) * vn * hoop.nx * f; b.vz -= (1 + BOARD.e) * vn * hoop.nz * f; hit = hit || 'board'; }
  }
  return hit;
}
/** Did the ball drop down through the rim between `prev` and now? (centre inside the ring as it crosses rim height) */
export function through(prev, b, hoop) {
  if (!(prev.y > hoop.y && b.y <= hoop.y && b.vy < 0)) return false;
  const k = (prev.y - hoop.y) / ((prev.y - b.y) || 1e-9), x = prev.x + (b.x - prev.x) * k, z = prev.z + (b.z - prev.z) * k;
  return Math.hypot(x - hoop.x, z - hoop.z) < hoop.r - BALL_R * 0.5;
}
/** One small physics step of a free ball: gravity, hoops, floor, and (optionally) the walls of a box { hw, hd }. */
export function stepFree(b, hoops, dt, box = null) {
  const prev = { x: b.x, y: b.y, z: b.z };
  b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  const hits = [];
  for (const H of hoops) {                       // a fairground hoop is kind: a ball dropping onto the rim is drawn in a little
    const dx = H.x - b.x, dz = H.z - b.z, d = Math.hypot(dx, dz);
    if (b.vy < 0 && b.y > H.y - 0.05 && b.y < H.y + 0.45 && d < H.r + 0.14 && d > 0.02) { const k = MAGNET * dt / d; b.vx += dx * k; b.vz += dz * k; }
  }
  for (let i = 0; i < hoops.length; i++) { const h = hitHoop(b, hoops[i]); if (h) hits.push({ h, i }); if (through(prev, b, hoops[i])) hits.push({ h: 'in', i }); }
  if (b.y < BALL_R) {
    b.y = BALL_R;
    if (b.vy < 0) { if (b.vy < -1.2) hits.push({ h: 'floor' }); b.vy = -b.vy * FLOOR_E; b.vx *= 0.86; b.vz *= 0.86; if (Math.abs(b.vy) < 0.6) b.vy = 0; }
    else { b.vx *= Math.max(0, 1 - 1.8 * dt); b.vz *= Math.max(0, 1 - 1.8 * dt); }
  }
  if (box) {
    const lx = box.hw - BALL_R, lz = box.hd - BALL_R;
    if (b.x > lx) { b.x = lx; b.vx = -Math.abs(b.vx) * 0.6; } else if (b.x < -lx) { b.x = -lx; b.vx = Math.abs(b.vx) * 0.6; }
    if (b.z > lz) { b.z = lz; b.vz = -Math.abs(b.vz) * 0.6; } else if (b.z < -lz) { b.z = -lz; b.vz = Math.abs(b.vz) * 0.6; }
  }
  return hits;
}

/**
 * A whole shot at one hoop. hoopAt(t) -> the hoop at t seconds after release (a sliding hoop; return the same object
 * for a still one). -> { made, T, path: [x, y, z, x, y, z, …] every 0.05 s, hits: ['rim'|'board', …], end }
 * T = when it dropped in, or when it was clearly missed (back under the rim and falling, or on the floor).
 */
export function flyShot(rel, hoopAt, { maxT = 3, tail = 0.7 } = {}) {
  const b = { ...rel }, path = [r2(b.x), r2(b.y), r2(b.z)], hits = [];
  let t = 0, made = false, T = null, nextS = SAMPLE;
  while (t < maxT) {
    const hoop = typeof hoopAt === 'function' ? hoopAt(t) : hoopAt;
    for (const h of stepFree(b, [hoop], SUB)) { if (h.h === 'in' && !made) { made = true; T = t; b.vx *= 0.25; b.vz *= 0.25; } else if (h.h === 'rim' || h.h === 'board') hits.push(h.h); }
    t += SUB;
    if (!made && T == null && ((b.y < hoop.y - 0.7 && b.vy < 0) || b.y <= BALL_R + 1e-6)) T = t;
    if (t >= nextS - 1e-9) { path.push(r2(b.x), r2(b.y), r2(b.z)); nextS += SAMPLE; }
    if (T != null && t >= T + tail) break;
  }
  return { made, T: r2(T ?? t), path, hits, end: { x: r2(b.x), y: r2(b.y), z: r2(b.z), vx: r2(b.vx), vy: r2(b.vy), vz: r2(b.vz) } };
}
/** Where a path is at time t (linear between its 0.05 s samples): [x, y, z]. Views use it to draw a sent flight. */
export function pathAt(path, t) {
  const n = path.length / 3; if (!n) return [0, 0, 0];
  const f = Math.max(0, t / SAMPLE), i = Math.min(n - 1, Math.floor(f)), j = Math.min(n - 1, i + 1), k = Math.min(1, f - i);
  return [path[i * 3] + (path[j * 3] - path[i * 3]) * k, path[i * 3 + 1] + (path[j * 3 + 1] - path[i * 3 + 1]) * k, path[i * 3 + 2] + (path[j * 3 + 2] - path[i * 3 + 2]) * k];
}
export const pathTime = path => (path.length / 3 - 1) * SAMPLE;
/** A bot's meter reading: ideal power plus an error of up to `spread` tolerances (spread 0 = perfect). */
export const botPower = (rng, d, base, spread) => Math.max(0, Math.min(1, idealPower(d) + (rng() * 2 - 1) * spread * tolFor(d, base)));
/** The power a hold of `held` seconds gives on a meter that swings 0 -> 1 -> 0 every `period` seconds. */
export const meterAt = (held, period) => charge(Math.max(0, held), period);
/** Groups for result(): rows [{ pid, key }] best key first; equal keys share a group. */
export function groupBy(rows) {
  const g = new Map();
  for (const r of rows) { if (!g.has(r.key)) g.set(r.key, []); g.get(r.key).push(r.pid); }
  return [...g.keys()].sort((a, b) => b - a).map(k => g.get(k));
}
