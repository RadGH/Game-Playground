// FISH KIT — the rules every Tumblefair fishing game shares (Reel Rumble, Pier Pressure, Net Gains, Glimmer Ice).
// Pure: no DOM, no Math.random, no Date — the server runs it, the tests run it, and a view may import the helpers
// (castLanding, castFlight, charge, reelTarget) to draw exactly what the rules will do. The fish themselves are data in
// js/games/fish-species.js; the 3D fish/bobber/rod drawings in js/games/fish-view.js.
//
//   pickSpecies(rng, list, bias)   a weighted pick; bias > 0 favours the fighters (a long cast finds bigger fish)
//   rollWeight(rng, sp)            kilos inside the species' range, one decimal
//   castLanding / castFlight       where a cast with power p lands, and how long / how high it flies (an arc)
//   charge                         the golf kit's power swing (rises, then falls back: holding forever is never full)
//   LINE / startReel / stepReel    the reel fight: hold A to wind in (the line tightens), let go to ease it (the fish
//                                  runs a little). Too tight = SNAP; let it run too far = it GETS AWAY. The fish surges
//                                  now and then (pulling twice as hard), and tires the longer you keep it on a tight line.
//   wander / steerTo               a fish shadow swimming about inside a box (and being drawn toward a bait)
import { charge } from './golf-kit.js';
import { BY_ID } from './fish-species.js';

export { charge };
const r2 = v => Math.round(v * 100) / 100;

/** A weighted pick from a species list. bias (0..1) multiplies each weight by (1 + bias * 2 * (fight - 1)), floored. */
export function pickSpecies(rng, list, bias = 0) {
  const ws = list.map(s => Math.max(0.05, s.w * Math.max(0.15, 1 + bias * 2 * (s.fight - 1))));
  let t = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) { t -= ws[i]; if (t <= 0) return list[i]; }
  return list[list.length - 1];
}
export const rollWeight = (rng, sp) => Math.round(rng.range(sp.kg[0], sp.kg[1]) * 10) / 10;

/** Where a cast from (x, z) toward yaw with power p (0..1) lands: min..max metres out. */
export function castLanding(x, z, yaw, p, { min = 2, max = 10 } = {}) {
  const d = min + (max - min) * Math.max(0, Math.min(1, p));
  return { x: r2(x + Math.sin(yaw) * d), z: r2(z + Math.cos(yaw) * d), d };
}
/** Flight time (s) and peak height (m) of a cast that flies d metres. */
export const castFlight = d => ({ T: r2(0.45 + d * 0.05), apex: r2(1.2 + d * 0.22) });

// ---- the reel fight
/** Per difficulty. rise: how fast the line tightens per unit of pull while you wind; fall: how fast it eases when you
 *  let go; reel: metres a second you wind in (less against a fighter); run: metres a second a fish swims off while
 *  the line is slack; tire: seconds of tight line that wear an ordinary fish out; surge: [min, max] seconds between
 *  thrashes, each lasting surgeS. */
export const LINE = {
  easy:   { rise: 0.42, fall: 1.25, reel: 3.0, run: 0.4, tire: 2.4, surge: [2.4, 3.6], surgeS: 0.6, surgeMul: 1.8 },
  normal: { rise: 0.5, fall: 1.1, reel: 2.9, run: 0.5, tire: 2.8, surge: [1.8, 3.0], surgeS: 0.7, surgeMul: 2.1 },
  hard:   { rise: 0.6, fall: 1.0, reel: 2.7, run: 0.6, tire: 3.4, surge: [1.4, 2.4], surgeS: 0.8, surgeMul: 2.4 },
};
export const lineOf = d => LINE[d] || LINE.normal;
/** A new fight with a fish of species `id` hooked `dist` metres out. Escapes past dist + slack. */
export function startReel(rng, id, dist, L = LINE.normal, slack = 4) {
  return { id, dist: r2(dist), max: r2(dist + slack), ten: 0.15, stam: 1, surge: 0, next: r2(rng.range(L.surge[0], L.surge[1]) * 0.6), t: 0 };
}
/** How hard the fish is pulling right now (its fight, less as it tires, more in a surge). */
export function pullOf(R, L = LINE.normal) {
  const sp = BY_ID[R.id], f = sp ? sp.fight : 1;
  return f * (0.35 + 0.65 * R.stam) * (R.surge > 0 ? L.surgeMul : 1);
}
/** One step of the fight. holding = the reel button is down. -> 'snap' | 'land' | 'free' | null (still fighting). */
export function stepReel(R, holding, dt, rng, L = LINE.normal) {
  const sp = BY_ID[R.id], f = sp ? sp.fight : 1;
  R.t += dt;
  if (R.surge > 0) R.surge = Math.max(0, R.surge - dt);
  else { R.next -= dt; if (R.next <= 0) { R.surge = L.surgeS; R.next = rng.range(L.surge[0], L.surge[1]); } }
  const pull = pullOf(R, L);
  if (holding) {
    R.ten += L.rise * pull * dt * 1.6;
    R.dist -= L.reel / (0.55 + 0.45 * f) * dt * (R.surge > 0 ? 0.4 : 1);
    if (R.ten > 0.35) R.stam = Math.max(0, R.stam - dt / (L.tire * (0.6 + 0.4 * f)));
  } else {
    R.ten = Math.max(0, R.ten - L.fall * dt);
    R.dist += L.run * pull * dt;
  }
  if (sp?.junk) R.ten = Math.min(R.ten, 0.5);                   // junk just drags: it can never snap the line
  if (R.ten >= 1) return 'snap';
  if (R.dist <= 0) { R.dist = 0; return 'land'; }
  if (R.dist >= R.max) return 'free';
  return null;
}
/** The tension a sensible angler keeps below (bots; also where the view draws the meter's red zone). */
export const reelTarget = { easy: 0.62, normal: 0.75, hard: 0.85 };
/** A bot's reel decision: wind while the line has room, ease off in a surge. */
export const botHolds = (R, d = 'normal', margin = 0) => R.ten < (reelTarget[d] ?? 0.75) - margin && !(R.surge > 0 && R.ten > 0.3);

// ---- swimming shadows
/** Wander a fish { x, z, h } about inside box { x0, x1, z0, z1 } at `speed` m/s (turns gently, bounces off the sides). */
export function wander(f, rng, box, speed, dt, turn = 1.6) {
  f.h += rng.range(-1, 1) * turn * dt;
  f.x += Math.sin(f.h) * speed * dt; f.z += Math.cos(f.h) * speed * dt;
  if (f.x < box.x0) { f.x = box.x0; if (Math.sin(f.h) < 0) f.h = -f.h; }
  else if (f.x > box.x1) { f.x = box.x1; if (Math.sin(f.h) > 0) f.h = -f.h; }
  if (f.z < box.z0) { f.z = box.z0; if (Math.cos(f.h) < 0) f.h = Math.PI - f.h; }
  else if (f.z > box.z1) { f.z = box.z1; if (Math.cos(f.h) > 0) f.h = Math.PI - f.h; }
  return f;
}
/** Swim a fish straight toward (x, z) at `speed`; true once within `stop` metres. */
export function steerTo(f, x, z, speed, dt, stop = 0.3) {
  const dx = x - f.x, dz = z - f.z, d = Math.hypot(dx, dz);
  if (d <= stop) return true;
  const s = Math.min(d, speed * dt); f.x += dx / d * s; f.z += dz / d * s; f.h = Math.atan2(dx, dz);
  return d - s <= stop;
}
/** Groups for result(): rows [{ pid, key }] best key first; equal keys share a group. */
export function groupBy(rows) {
  const g = new Map();
  for (const r of rows) { if (!g.has(r.key)) g.set(r.key, []); g.get(r.key).push(r.pid); }
  return [...g.keys()].sort((a, b) => b - a).map(k => g.get(k));
}
