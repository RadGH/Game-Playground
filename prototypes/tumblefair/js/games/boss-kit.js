// Small pure helpers shared by the round-8 boss games (golem-smash, kraken-cove, sky-serpent, goblin-kings-crown,
// pumpkin-knight, witchs-tower). No DOM, no randomness: safe in sim.js (server + node tests) and in the browser.
import { F } from '../shared/arena.js';
import { IN } from '../shared/protocol.js';

export const r2 = v => Math.round(v * 100) / 100;
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** The signed difference between two angles, in -PI..PI. */
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
/** easy / normal / hard: pick from a three-value table (normal for anything unknown). */
export const byDiff = (difficulty, t) => t[difficulty] ?? t.normal;

/**
 * Aim help (the round-8 rule: "snap toward the nearest valid target within ~25 degrees of facing").
 * From (x, z) facing `yaw` (0 = +z), find the target whose direction is closest to the facing, inside `cone` radians
 * and `range` metres. Returns { yaw, target } — the snapped yaw and the target, or the plain yaw and null.
 * targets: [{ x, z, ... }]
 */
export function aimHelp(x, z, yaw, targets, cone = 0.44, range = Infinity) {
  let best = null, bestD = cone;
  for (const t of targets) {
    if (!t) continue;
    const dx = t.x - x, dz = t.z - z, dist = Math.hypot(dx, dz);
    if (dist > range) continue;
    if (dist < 0.05) return { yaw, target: t };
    const d = Math.abs(angDiff(Math.atan2(dx, dz), yaw));
    if (d <= bestD) { bestD = d; best = t; }
  }
  return best ? { yaw: Math.atan2(best.x - x, best.z - z), target: best } : { yaw, target: null };
}

/** Knock a body away from (fx, fz) at `power` m/s and stun it (stepBody slides a stunned body to a stop). */
export function knock(b, fx, fz, power) {
  let dx = b.x - fx, dz = b.z - fz, d = Math.hypot(dx, dz);
  if (d < 1e-3) { dx = Math.sin(b.yaw); dz = Math.cos(b.yaw); d = 1; }
  b.vx = dx / d * power; b.vz = dz / d * power; b.flags |= F.STUN;
}

/** Fresh presses of A and B since the last input (a held button counts once). `s` keeps the last bits. */
export function presses(s, inp) {
  const bits = inp?.b | 0, a = !!(bits & IN.A) && !s.lastA, b = !!(bits & IN.B) && !s.lastB;
  s.lastA = !!(bits & IN.A); s.lastB = !!(bits & IN.B);
  return { a, b };
}

/** Distance from (px, pz) to the segment (ax, az)-(bx, bz). */
export function segDist(px, pz, ax, az, bx, bz) {
  const ex = bx - ax, ez = bz - az, L = ex * ex + ez * ez || 1e-9;
  const t = clamp(((px - ax) * ex + (pz - az) * ez) / L, 0, 1);
  return Math.hypot(px - (ax + ex * t), pz - (az + ez * t));
}

/** Co-op result: one group with everyone, scores per pid. */
export const coopResult = (pids, scores, success, unit) => ({ coop: { success: !!success }, order: [pids.slice()], scores, unit });
/** Competitive result: groups best first, ties share a group; every pid exactly once. */
export function rankResult(pids, scores, unit) {
  const vals = [...new Set(pids.map(p => scores[p]))].sort((a, b) => b - a);
  return { order: vals.map(v => pids.filter(p => scores[p] === v)), scores, unit };
}
