// FAIRWAY GOLF — Golf mode's "Fairway" course: real-looking golf holes (par 3, 4 and 5) with a tee, a mown fairway,
// rough, bunkers, ponds and creeks, woods and out of bounds, and a sloping green. Golf mode plays ONE HOLE per room
// round (the room passes hole / holes / course / card); everyone plays the same hole at the same time with their own
// ball (the others' balls are ghosts), so nobody waits for a turn.
//
// A full shot is Long Drive's two taps: the POWER bar swings up and back — tap to lock it — then the ACCURACY needle
// sweeps across — tap as it crosses the middle (early hooks left, late slices right, and a miss costs distance). Aim
// with ◀ ▶ or by dragging; the best club for the distance is picked for you, B / the club button changes it. On the
// green the putter comes out: the bar swings, one tap putts (watch the slope arrows). The meters run on the phone; it
// sends what it locked, `swing { c, p, a, aim }`, and the SERVER works out the whole flight and roll from those, the
// hole and the wind (shotFrom below — the same pure function the tests and the bots use, and whose answer the browser
// replays: the flight from its numbers, the roll from its points).
//
// The model (yards; course.js has the axes): carry = the club's full carry × power × the lie (rough 85%, trees 70%,
// sand 55%) × (1 − 22% of the miss); a miss also curves the ball sideways (club.curve × carry at a full miss); the wind
// moves the landing by 1.3 yd per mph per 200 yd of carry (tail = longer, head = shorter, cross = sideways). The ball
// flies an arc (apex by club), can be stopped by a tree whose canopy it passes under the top of, then lands and rolls
// with the friction of whatever it is rolling on (green speed by difficulty; greens tilt; the cup takes a slow enough
// ball and turns a fast one aside). Water = a penalty stroke and a drop behind where it went in; out of bounds = a
// penalty stroke and play again from where you were. A ball landing in the cup on the fly is in (a hole in one, if it
// was your tee shot). Par + 3 strokes and you pick up; a hole you do not finish counts par + 3.
import { makeRng } from '../../shared/rng.js';
import { rollDistance } from '../golf-kit.js';
import { scoreName } from '../golf-putt.js';
import { HOLES, LIES, buildLayout, hydrate, lieAt, holeNumber, pickHoles, treesNear, nearestOnLine, layupFrom } from './course.js';

export const meta = {
  id: 'fairway-golf', title: 'Fairway Golf', blurb: 'Real golf holes — tee off, find the green and hole out in as few strokes as you can!',
  how: ['Aim with ◀ ▶ or drag. The best club is picked for you — B changes it.', 'Tap to stop the POWER bar, then tap as the needle hits the middle.', 'On the green, one tap putts. Mind the wind, the bunkers and the water!'],
  kind: 'ui', mode: 'golf', min: 1, max: 4, seconds: 150, scoring: 'points', unit: 'strokes', tags: ['action'], card: 'card-fairway-golf', css: true,
};

/** The bag. carry = full-power yards from a good lie; apex = top of the flight (yd); run = roll speed on landing (yd/s). */
export const CLUBS = [
  { id: 'dr', name: 'Driver', carry: 255, apex: 24, run: 15, green: 0.9, curve: 0.2, wind: 1, tee: true },
  { id: 'w3', name: '3 Wood', carry: 230, apex: 24, run: 13, green: 0.8, curve: 0.18, wind: 1 },
  { id: 'i4', name: '4 Iron', carry: 200, apex: 24, run: 10, green: 0.62, curve: 0.16, wind: 1 },
  { id: 'i6', name: '6 Iron', carry: 178, apex: 25, run: 8.5, green: 0.55, curve: 0.15, wind: 1.05 },
  { id: 'i7', name: '7 Iron', carry: 165, apex: 26, run: 7.5, green: 0.5, curve: 0.14, wind: 1.05 },
  { id: 'i8', name: '8 Iron', carry: 150, apex: 27, run: 6.5, green: 0.45, curve: 0.13, wind: 1.1 },
  { id: 'i9', name: '9 Iron', carry: 138, apex: 28, run: 5.5, green: 0.42, curve: 0.12, wind: 1.1 },
  { id: 'pw', name: 'Pitching Wedge', carry: 122, apex: 28, run: 4.8, green: 0.38, curve: 0.11, wind: 1.15 },
  { id: 'sw', name: 'Sand Wedge', carry: 92, apex: 26, run: 4, green: 0.3, curve: 0.1, wind: 1.15, sand: true },
  { id: 'pt', name: 'Putter', putt: true },
];
export const CLUB = Object.fromEntries(CLUBS.map(c => [c.id, c]));
/** How the lie you hit FROM changes a full shot: carry, roll and how much a mistimed needle hurts. */
export const LIE_MOD = {
  tee: { carry: 1, acc: 1 }, fairway: { carry: 1, acc: 1 }, fringe: { carry: 1, acc: 1 },
  rough: { carry: 0.85, acc: 1.25 }, woods: { carry: 0.7, acc: 1.5 }, sand: { carry: 0.55, acc: 1.6 }, green: { carry: 1, acc: 1 },
};
/** How a landing ball keeps going on each surface (× the club's run), and rolling friction (speed falls R + K·v a second). */
const LAND = { tee: 1, fairway: 1, rough: 0.35, woods: 0.25, sand: 0.06 };
const FRICTION = { tee: [2.4, 0.34], fairway: [2.4, 0.34], rough: [7, 1], woods: [9, 1.3], sand: [22, 2.2] };
/**
 * Difficulty (the lobby's): meter speeds (seconds for the bar's swing up and back), the sweet spot on the needle,
 * the strongest wind, green speed (gR/gK friction: less = faster), how much the greens tilt, the cup, putt strength.
 * help: the aim the phone suggests already allows for the wind.
 */
export const LEVELS = {
  easy:   { power: 1.8, acc: 1.6, putt: 2.6, sweet: 0.1, wind: 5, gR: 0.9, gK: 0.32, slope: 0.6, cupR: 0.2, cap: 2.1, magnet: 0.42, puttMax: 11, help: true },
  normal: { power: 1.35, acc: 1.1, putt: 2.2, sweet: 0.06, wind: 11, gR: 0.75, gK: 0.26, slope: 1, cupR: 0.16, cap: 1.7, magnet: 0.3, puttMax: 12, help: false },
  hard:   { power: 1.05, acc: 0.85, putt: 1.8, sweet: 0.035, wind: 17, gR: 0.6, gK: 0.21, slope: 1.3, cupR: 0.14, cap: 1.4, magnet: 0.22, puttMax: 13, help: false },
};
export const levelOf = d => LEVELS[d] || LEVELS.normal;
/** The hole's own clock (the room's meta.seconds is the longest of these). */
export const HOLE_SECONDS = { 3: 100, 4: 125, 5: 150 };
export const PICKUP = 3;                                  // par + 3 strokes without holing out: picked up, scores par + 3
export const ST = { ready: 0, busy: 1, in: 2, out: 3 };
export const PUTT_NEAR = 14;                              // on the fringe this close, the putter is the suggestion
const r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100, r3 = v => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Putt speed (yd/s) for a power 0..1. */
export const puttSpeed = (p, L) => 0.4 + (L.puttMax - 0.4) * Math.pow(clamp(p, 0, 1), 1.35);
/** Clubs you may hit from a lie: the putter only on (or by) the green, the driver only off the tee. */
export function clubsFor(lie) {
  if (lie === 'green') return ['pt'];
  return CLUBS.filter(c => (c.putt ? lie === 'fringe' : (!c.tee || lie === 'tee'))).map(c => c.id);
}
/** Full-power carry of a club from a lie (yd). */
export const reachOf = (cid, lie) => { const c = CLUB[cid]; if (c.putt) return 0; return c.carry * (lie === 'sand' && c.sand ? 0.85 : (LIE_MOD[lie] || LIE_MOD.fairway).carry); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
/** The club the phone picks for you: the putter on the green, else the shortest club that gets there. */
export function suggestClub(H, x, y, lie) {
  const D = Math.hypot(H.cup.x - x, H.cup.y - y), list = clubsFor(lie);
  if (lie === 'green' || (lie === 'fringe' && D <= PUTT_NEAR)) return 'pt';
  const full = list.filter(c => c !== 'pt');
  for (let i = full.length - 1; i >= 0; i--) if (reachOf(full[i], lie) >= D * 0.96) return full[i];
  return full[0];
}
/** Where a shot with this club should go: the cup if it can get there, else a lay-up spot down the middle. */
export function targetFor(H, x, y, lie, cid) {
  const D = Math.hypot(H.cup.x - x, H.cup.y - y);
  if (CLUB[cid].putt || reachOf(cid, lie) >= D * 0.96) return { x: H.cup.x, y: H.cup.y, pin: true };
  const p = layupFrom(H, x, y, reachOf(cid, lie) * 0.95);
  return { x: p.x, y: p.y, pin: false };
}
/** The wind's push per yard of carry for a club (yd per yd), as a vector. */
const windPer = (cid, wind) => { const k = wind.mph * 1.3 / 200 * (CLUB[cid].wind || 1); return { x: Math.sin(wind.dir) * k, y: Math.cos(wind.dir) * k }; };
/**
 * The aim (radians, 0 = straight down the hole) and power that land a pure strike exactly on `to` from `from`,
 * allowing for the wind: carry C and direction d with C·(d + w) = to − from. -> { aim, p, C } (p may be > 1: out of reach).
 */
export function solveShot(from, lie, cid, to, wind) {
  const w = windPer(cid, wind), Dx = to.x - from.x, Dy = to.y - from.y, DD = Dx * Dx + Dy * Dy, Dw = Dx * w.x + Dy * w.y, ww = w.x * w.x + w.y * w.y;
  const disc = Dw * Dw - DD * (ww - 1); let z = (Dw + Math.sqrt(Math.max(0, disc))) / Math.max(1e-9, DD);
  if (!(z > 0)) z = 1 / Math.max(1, Math.sqrt(DD));
  const C = 1 / z, dx = Dx / C - w.x, dy = Dy / C - w.y;
  return { aim: Math.atan2(dx, dy), p: C / Math.max(1, reachOf(cid, lie)), C };
}

// ---------------------------------------------------------------- the ball
/** Where a flight F is at k (0 = struck, 1 = lands): { x, y, h } (h = height in yards). The browser draws exactly this. */
export function flightPos(F, k) {
  const k2 = k * k, k15 = k * Math.sqrt(k);
  return { x: F.fx + F.dx * F.C * k + F.nx * F.off * k2 + F.wx * k15, y: F.fy + F.dy * F.C * k + F.ny * F.off * k2 + F.wy * k15, h: 4 * F.apex * k * (1 - k) };
}
function friction(lie, L) {
  if (lie === 'green') return [L.gR, L.gK];
  if (lie === 'fringe') return [L.gR * 2.2, L.gK * 1.6];
  return FRICTION[lie] || FRICTION.rough;
}
/**
 * Roll a ball from (x, y) at (vx, vy) yd/s until it stops, drops, goes in the water or out of bounds.
 * -> { pts: [x, y, x, y, …] every 0.1 s, x, y, res: 'rest'|'in'|'water'|'oob', t, lip }
 */
export function roll(H, x, y, vx, vy, L, maxT = 14) {
  const dt = 1 / 30, pts = [r1(x), r1(y)], cup = H.cup, gx0 = H.slope[0] * L.slope, gy0 = H.slope[1] * L.slope;
  let t = 0, lip = false, lipped = false, k = 0;
  while (t < maxT) {
    const lie = lieAt(H, x, y);
    if (lie === 'water' || lie === 'oob') { pts.push(r1(x), r1(y)); return { pts, x, y, res: lie, t, lip: lipped }; }
    const onG = lie === 'green' || lie === 'fringe', [R, K] = friction(lie, L), gx = onG ? gx0 : 0, gy = onG ? gy0 : 0;
    vx += gx * dt; vy += gy * dt;
    let sp = Math.hypot(vx, vy);
    if (onG) {
      const ex = cup.x - x, ey = cup.y - y, d = Math.hypot(ex, ey);
      if (d < L.magnet && sp < L.cap && d > 1e-4) { const a = 1.2 * dt / d; vx += ex * a; vy += ey * a; }   // a slow ball near the cup is drawn in
      if (d < L.cupR) {
        if (sp <= L.cap) { pts.push(r1(cup.x), r1(cup.y)); return { pts, x: cup.x, y: cup.y, res: 'in', t, lip: lipped }; }
        if (!lip) { lip = lipped = true; const side = (ex * vy - ey * vx) >= 0 ? 1 : -1, a = side * 0.45, c = Math.cos(a), s = Math.sin(a); const nx = vx * c - vy * s, ny = vx * s + vy * c; vx = nx * 0.8; vy = ny * 0.8; }
      } else lip = false;
    }
    sp = Math.hypot(vx, vy);
    if (sp > 0) { const ns = Math.max(0, sp - (R + K * sp) * dt); vx *= ns / sp; vy *= ns / sp; sp = ns; }
    x += vx * dt; y += vy * dt; t += dt;
    if (++k % 3 === 0) pts.push(r1(x), r1(y));
    if (sp < 0.04 && Math.hypot(gx, gy) <= R * 1.05) break;
  }
  pts.push(r1(x), r1(y));
  return { pts, x, y, res: 'rest', t, lip: lipped };
}
/** A drop after the water: walk back from where it went in toward where it was hit, to dry land and 2 yards more. */
function dropFrom(H, wx, wy, from) {
  const dx = from.x - wx, dy = from.y - wy, D = Math.hypot(dx, dy);
  const dry = (x, y) => { const l = lieAt(H, x, y); return l !== 'water' && l !== 'oob'; };
  for (let s = 1; s < D; s += 1) {
    const x = wx + dx * s / D, y = wy + dy * s / D;
    if (!dry(x, y)) continue;
    const s2 = Math.min(D, s + 2), x2 = wx + dx * s2 / D, y2 = wy + dy * s2 / D;
    return dry(x2, y2) ? { x: r1(x2), y: r1(y2) } : { x: r1(x), y: r1(y) };
  }
  return { x: from.x, y: from.y };
}
const hash = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };

/**
 * One shot, worked out whole. from {x, y}, lie, club id, p 0..1 power, a −1..1 needle (0 = pure), aim radians, wind.
 * -> { F (flight numbers, null for a putt), pts (the roll), at (where it stopped or splashed), end (where you play
 *      next), res: 'rest'|'in'|'water'|'oob', pen (penalty strokes), tree, tf (flight s), tr (roll s), lie (at end), carry }
 */
export function shotFrom(H, from, lie, cid, p, a, aim, wind, L) {
  const club = CLUB[cid]; p = clamp(p, 0, 1); a = clamp(a, -1, 1);
  const dx = Math.sin(aim), dy = Math.cos(aim);
  if (club.putt) { const v = puttSpeed(p, L); return settle(H, from, null, roll(H, from.x, from.y, dx * v, dy * v, L), false, 0); }
  const lm = LIE_MOD[lie] || LIE_MOD.fairway, ae = a * lm.acc;
  const miss = Math.sign(ae) * Math.min(1, Math.max(0, Math.abs(ae) - L.sweet) / (1 - L.sweet));
  const C = Math.max(2, reachOf(cid, lie) * p * (1 - 0.22 * Math.abs(miss)));
  const w = windPer(cid, wind);
  const F = { fx: from.x, fy: from.y, dx, dy, nx: dy, ny: -dx, C, off: miss * club.curve * C, wx: w.x * C, wy: w.y * C, apex: club.apex * (0.45 + 0.55 * p) * (lie === 'rough' || lie === 'woods' ? 0.9 : 1), T: 1 + C / 85, k: 1 };
  // trees: the flight is stopped by a canopy it passes under the top of
  let tree = false; const steps = Math.ceil(C / 2.5);
  for (let i = 1; i <= steps && !tree; i++) {
    const k = i / steps; if (k * C < 3) continue;
    const P = flightPos(F, k); if (P.h > 16) continue;
    for (const t of treesNear(H, P.x, P.y)) if (P.h < t[3] && Math.hypot(P.x - t[0], P.y - t[1]) < t[2]) { tree = true; F.k = k; break; }
  }
  const land = flightPos(F, F.k);
  let r;
  if (tree) {                                       // knocked down under the tree: it drops and trickles a yard or two
    const side = hash(land.x, land.y), x = land.x - dx * 1.2 + dy * side * 1.5, y = land.y - dy * 1.2 - dx * side * 1.5;
    r = roll(H, x, y, dx * 1.2, dy * 1.2, L);
  } else {
    const ll = lieAt(H, land.x, land.y);
    if ((ll === 'green' || ll === 'fringe') && Math.hypot(land.x - H.cup.x, land.y - H.cup.y) <= L.cupR * 1.4) r = { pts: [r1(H.cup.x), r1(H.cup.y)], x: H.cup.x, y: H.cup.y, res: 'in', t: 0, dunk: true };
    else if (ll === 'water' || ll === 'oob') r = { pts: [r1(land.x), r1(land.y)], x: land.x, y: land.y, res: ll, t: 0 };
    else {
      const v0 = club.run * (0.6 + 0.4 * p) * (ll === 'green' ? club.green : ll === 'fringe' ? club.green * 1.1 : LAND[ll] ?? 1);
      const k = F.k, vx = dx * C + F.nx * 2 * F.off * k + w.x * C * 1.5 * Math.sqrt(k), vy = dy * C + F.ny * 2 * F.off * k + w.y * C * 1.5 * Math.sqrt(k), vl = Math.hypot(vx, vy) || 1;
      r = roll(H, land.x, land.y, vx / vl * v0, vy / vl * v0, L);
    }
  }
  return settle(H, from, F, r, tree, C);
}
function settle(H, from, F, r, tree, carry) {
  let pen = 0, end = { x: r1(r.x), y: r1(r.y) };
  if (r.res === 'water') { pen = 1; end = dropFrom(H, r.x, r.y, from); }
  else if (r.res === 'oob') { pen = 1; end = { x: from.x, y: from.y }; }
  const Fo = F ? { fx: r2(F.fx), fy: r2(F.fy), dx: r3(F.dx), dy: r3(F.dy), nx: r3(F.nx), ny: r3(F.ny), C: r2(F.C), off: r2(F.off), wx: r2(F.wx), wy: r2(F.wy), apex: r2(F.apex), T: r2(F.T), k: r3(F.k) } : null;
  return { F: Fo, pts: r.pts, at: { x: r1(r.x), y: r1(r.y) }, end, res: r.res, pen, tree, dunk: !!r.dunk, lip: !!r.lip, tf: F ? r2(F.T * F.k) : 0, tr: r2(r.t), lie: r.res === 'in' ? 'green' : lieAt(H, end.x, end.y), carry: Math.round(carry) };
}

// ---------------------------------------------------------------- planning a shot (bots, tests, the phone's hints)
const LIE_COST = { green: -2, fringe: 0, fairway: 0, tee: 0, rough: 5, woods: 12, sand: 10, water: 0, oob: 0 };
/** How good a finished shot is for the player (lower = better). */
function shotCost(H, r) { if (r.res === 'in') return -1000; return Math.hypot(r.end.x - H.cup.x, r.end.y - H.cup.y) + r.pen * 30 + (LIE_COST[r.lie] || 0) + (r.tree ? 6 : 0); }
/** The best putt (or putter from the fringe) from (x, y): { c: 'pt', p, a: 0, aim }. */
export function planPutt(H, from, lie, L) {
  const base = Math.atan2(H.cup.x - from.x, H.cup.y - from.y), D = dist(from, H.cup);
  let best = null;
  const tryAim = aim => {
    let lo = 0, hi = 1;
    const dx = Math.sin(base), dy = Math.cos(base);
    for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2, r = shotFrom(H, from, lie, 'pt', m, 0, aim, { mph: 0, dir: 0 }, L); const along = (r.at.x - from.x) * dx + (r.at.y - from.y) * dy; if (r.res === 'in') { lo = hi = m; break; } if (along < D + 0.35) lo = m; else hi = m; }
    const p = (lo + hi) / 2, r = shotFrom(H, from, lie, 'pt', p, 0, aim, { mph: 0, dir: 0 }, L), c = shotCost(H, r);
    if (!best || c < best.cost) best = { c: 'pt', p, a: 0, aim, cost: c };
  };
  for (let d = -16; d <= 16; d += 1.5) tryAim(base + d * Math.PI / 180);
  const b0 = best.aim; if (best.cost > -1000) for (let d = -1.2; d <= 1.2; d += 0.2) tryAim(b0 + d * Math.PI / 180);
  return best;
}
/** The best full shot from (x, y) with what this player can see (pure strike, real wind): { c, p, a: 0, aim }. */
export function planShot(H, from, lie, wind, L) {
  const D = dist(from, H.cup);
  if (lie === 'green' || (lie === 'fringe' && D <= PUTT_NEAR)) return planPutt(H, from, lie, L);
  const list = clubsFor(lie).filter(c => c !== 'pt');
  let best = null;
  const tryShot = (c, p, aim) => { p = clamp(p, 0.05, 1); const r = shotFrom(H, from, lie, c, p, 0, aim, wind, L), cost = shotCost(H, r); if (!best || cost < best.cost) best = { c, p, a: 0, aim, cost }; };
  const suggested = suggestClub(H, from.x, from.y, lie), si = list.indexOf(suggested);
  const clubs = [...new Set([list[si], list[si - 1], list[si + 1], list[si + 2]].filter(Boolean))];
  for (const c of clubs) {
    const t = targetFor(H, from.x, from.y, lie, c);
    let to = t;
    if (t.pin) {                                   // land short of the cup by about the roll it will have
      const v0 = CLUB[c].run * CLUB[c].green, run = rollDistance(v0, L.gR, L.gK), d = dist(from, t) || 1;
      to = { x: t.x - (t.x - from.x) / d * run, y: t.y - (t.y - from.y) / d * run };
    }
    const s = solveShot(from, lie, c, to, wind);
    for (const dp of [0, -0.03, 0.03, -0.06]) for (const da of [0, -0.012, 0.012]) tryShot(c, s.p + dp, s.aim + da);
  }
  // a safe punch back to the middle (out of trees / a bad lie)
  const safe = layupFrom(H, from.x, from.y, 30), sc = list.includes('pw') ? 'pw' : list[list.length - 1], ss = solveShot(from, lie, sc, safe, wind);
  tryShot(sc, ss.p, ss.aim);
  return best;
}

// ---------------------------------------------------------------- the round's holes
const yardCache = new Map();
/** Par / name / yards of every hole this round plays (for the scorecard). */
export function roundHoles(course, holes) {
  return pickHoles(course, holes).map(n => {
    if (!yardCache.has(n)) yardCache.set(n, buildLayout(n).yards);
    return { n, par: HOLES[n - 1].par, name: HOLES[n - 1].name, yards: yardCache.get(n) };
  });
}
/** The hole a room round plays: template, mirror, pin and wind, all from the round's course seed. */
export function holeFor(course, holes, hole, difficulty = 'normal') {
  const L = levelOf(difficulty), n = holeNumber(course, holes, hole), hr = makeRng(((course >>> 0) % 1e9) * 31 + n * 977 + 5);
  const mods = { mirror: hr() < 0.3, pin: hr.int(0, 2) };
  const H = hydrate(buildLayout(n, mods));
  const wind = { mph: Math.round(L.wind * H.wind * hr.range(0.15, 1)), dir: r2(hr.range(-Math.PI, Math.PI)) };
  return { n, H, wind, L };
}
export const valid = d => d && typeof d === 'object' && typeof d.c === 'string' && CLUB[d.c] && Number.isFinite(d.p) && d.p >= 0 && d.p <= 1 && Number.isFinite(d.a) && d.a >= -1 && d.a <= 1 && Number.isFinite(d.aim) && Math.abs(d.aim) <= 7;

export function create({ seed = 1, players, difficulty = 'normal', hole = 0, holes = 3, course = null, card = null }) {
  const cs = (course ?? seed) >>> 0, { n, H, wind, L } = holeFor(cs, holes, hole, difficulty), par = H.par;
  const pids = players.map(p => p.pid), events = [], round = roundHoles(cs, holes);
  const holeSeconds = HOLE_SECONDS[par] || 125;
  const tees = players.map((p, i) => ({ x: r1((i - (players.length - 1) / 2) * 2.2), y: 0 }));
  const P = new Map(players.map((p, i) => [p.pid, { x: tees[i].x, y: tees[i].y, lie: 'tee', strokes: 0, st: ST.ready, busy: 0, shot: null, score: null }]));
  let time = holeSeconds, start = 1.5, linger = -1, over = false, party = 0;      // party: a hole in one holds the hole open so everyone sees it
  const layout = JSON.parse(JSON.stringify(H));            // what every browser draws (the very object lies are measured on)
  const finished = s => s.st === ST.in || s.st === ST.out;
  function land(pid, s) {
    const r = s.shot; s.shot = null; s.busy = 0;
    if (r.res === 'in') { s.st = ST.in; s.score = s.strokes; if (s.strokes === 1) party = 6; s.x = H.cup.x; s.y = H.cup.y; events.push({ e: 'in', pid, strokes: s.strokes, par, name: scoreName(s.strokes, par), dunk: r.dunk }); return; }
    s.x = r.end.x; s.y = r.end.y; s.lie = r.lie;
    if (s.strokes >= par + PICKUP) { s.st = ST.out; s.score = par + PICKUP; events.push({ e: 'pickup', pid, strokes: s.score }); return; }
    s.st = ST.ready; events.push({ e: 'ready', pid, x: s.x, y: s.y, lie: s.lie });
  }
  return {
    events,
    init: () => ({ no: n, hole, holes, par, yards: H.yards, name: H.name, layout, wind, level: L, card: card || null, round, seconds: holeSeconds, tees, pickup: par + PICKUP, clubs: CLUBS }),
    act(pid, a, d) {
      const s = P.get(pid); if (!s || over || start > 0 || a !== 'swing' || !valid(d) || s.st !== ST.ready) return;
      if (!clubsFor(s.lie).includes(d.c)) return;
      const from = { x: s.x, y: s.y }, r = shotFrom(H, from, s.lie, d.c, d.p, d.a, d.aim, wind, L);
      s.strokes += 1 + r.pen; s.st = ST.busy; s.shot = r; s.busy = r.tf + r.tr + (r.pen ? 1.4 : 0.5);
      events.push({ e: 'shot', pid, n: s.strokes, c: d.c, from, F: r.F, pts: r.pts, at: r.at, end: r.end, res: r.res, pen: r.pen, tree: r.tree, dunk: r.dunk, lip: r.lip, tf: r.tf, tr: r.tr, carry: r.carry, lie: r.lie, p: r2(d.p), a: r2(d.a) });
    },
    step(dt) {
      if (over) return;
      if (start > 0) start -= dt; else time -= dt;
      for (const [pid, s] of P) if (s.st === ST.busy && (s.busy -= dt) <= 0) land(pid, s);
      if (party > 0) party -= dt;
      if (linger < 0 && pids.every(pid => finished(P.get(pid)))) linger = Math.max(2.5, party);
      if (linger >= 0 && (linger -= dt) <= 0) { over = true; events.push({ e: 'end' }); return; }
      if (time <= 0) {
        for (const [pid, s] of P) {
          if (s.st === ST.busy) land(pid, s);
          if (!finished(s)) { s.st = ST.out; s.score = par + PICKUP; events.push({ e: 'timeout', pid, strokes: s.score }); }
        }
        over = true; events.push({ e: 'end' });
      }
    },
    state() {
      const sc = {}, b = pids.map(pid => { const s = P.get(pid); sc[pid] = s.score ?? s.strokes; return [pid, s.x, s.y, s.st, s.strokes, LIES.indexOf(s.lie)]; });
      return { b, sc, left: Math.max(0, Math.ceil(time)), go: start <= 0 ? 1 : 0 };
    },
    get over() { return over; },
    result() {
      for (const s of P.values()) if (!finished(s)) { s.st = ST.out; s.score = par + PICKUP; }
      const rows = pids.map(pid => ({ pid, score: P.get(pid).score }));
      rows.sort((x, y) => x.score - y.score);
      const order = [];
      for (const r of rows) { const g = order[order.length - 1]; if (g && g.score === r.score) g.pids.push(r.pid); else order.push({ score: r.score, pids: [r.pid] }); }
      return {
        order: order.map(o => o.pids), scores: Object.fromEntries(rows.map(r => [r.pid, r.score])), unit: meta.unit,
        par, hole: n, name: H.name, yards: H.yards,
        holed: Object.fromEntries(pids.map(pid => [pid, P.get(pid).st === ST.in])),
        names: Object.fromEntries(pids.map(pid => [pid, P.get(pid).st === ST.in ? scoreName(P.get(pid).score, par) : 'Picked up'])),
        hio: pids.filter(pid => P.get(pid).st === ST.in && P.get(pid).score === 1),
      };
    },
    /** Tests and bots: the live hole and a player's state. */
    _debug: { hole: () => H, wind: () => wind, level: () => L, player: pid => P.get(pid), time: () => time },
  };
}
