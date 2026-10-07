// Chibi 2 — opt-in clip families added 2026-10-06 (Thousandvale play-test 5). A NEW FILE ON PURPOSE: chibi2-motion.js
// is read by every game, and nothing here changes a clip any of them plays. Importing this module registers the
// clips (chibi2-motion.js `registerClips`); a character only pays for the ones its `anims` list names:
//
//   import { CHIBI2_DUAL_ANIMS, dualAttackFor } from './chibi2-motion-dual.js';
//   createChibi2Character(avatar, { anims: [...CHIBI2_ANIMS, ...CHIBI2_DUAL_ANIMS] })
//   body.setAnim(dualAttackFor(body.hold, { hand: 'off', step: 3 }) || 'attack', 0.1, true)
//
// DUAL WIELD (T6: "the dual-wield attack visibly swings only one hand"). `attack` plays the main hand's strike, and
// the off hand's own strikes (`offSlash`, `offThrust`) were never asked for by a game that only knows `attack`. These
// are written as PAIRS, so a fight alternates: the hand that is not striking is not idle — it is drawn back at the
// guard, wound up for its own turn — and every third beat both come together.
//
//   two one-handers   dualSlashR  dualSlashL  dualCross      (swords, axes, maces: diagonal cuts)
//   two daggers       dualStabR   dualStabL   dualFlurry     (forward-grip thrusts; the flurry is three fast ones)
//   two two-handers   twinChopR   twinChopL   twinCrash      (one great weapon off its shoulder at a time, then both)
//
// `R` is the MAIN hand in this rig and `L` the off hand (see holdFor in chibi2-weapon-ids.js).
//
// ANGLING (T25): `fishCast` (one-shot: back over the shoulder and whipped forward), `fishWait` (loop: rod held out
// low, the tip nodding), `fishReel` (loop: rod hauled up and back against the fish, the free hand winding) and
// `fishShow` (one-shot: the catch held up high in the off hand). All four are HANDS-FREE — the weapons are put
// away — and the game parents its own rod to the `handR` bone and its catch to `handL` (see `ROD_MOUNT`).
//
// BACK ON YOUR FEET (T4): `standUp` is the `dead` clip's answer — from flat on the back, roll up onto a knee, push
// off the ground and rise. A revived body plays it instead of popping upright.

import { registerClips, MOTION_KIT } from './chibi2-motion.js';

const { ss, env, phases, stance, carry, restAims, REST_PITCH, PI, fistGrip, FIST } = MOTION_KIT;
const sin = Math.sin, cos = Math.cos;

export const CHIBI2_DUAL_ANIMS = ['dualSlashR', 'dualSlashL', 'dualCross', 'dualStabR', 'dualStabL', 'dualFlurry', 'twinChopR', 'twinChopL', 'twinCrash'];
export const CHIBI2_ANGLE_ANIMS = ['fishCast', 'fishWait', 'fishReel', 'fishShow'];
export const CHIBI2_REVIVE_ANIMS = ['standUp'];
export const CHIBI2_DUAL_SECONDS = {
  dualSlashR: 0.56, dualSlashL: 0.56, dualCross: 0.72, dualStabR: 0.44, dualStabL: 0.44, dualFlurry: 0.78,
  twinChopR: 0.82, twinChopL: 0.82, twinCrash: 1.05,
  fishCast: 0.95, fishWait: 2.0, fishReel: 0.9, fishShow: 2.0, standUp: 1.5,
};

/**
 * Where the game's own rod sits on the `handR` bone, for a rod modelled along its own +y with the grip at the
 * origin: in the palm, running out past the knuckles 37 degrees above the forearm's own line (hand space: -y is
 * out past the fingers, +z is the thumb side — "up" when the forearm is level). A rod is the one thing held
 * nearly IN line with the forearm; the butt lies along the wrist.
 */
export const ROD_MOUNT = { bone: 'handR', position: [0, -0.035, 0.055], rotation: [2.5, 0, 0] };
/**
 * …and where a catch hangs from the `handL` bone in `fishShow`, for a fish modelled nose toward +z: nose in the
 * fist, body lying back along the front of the forearm — which, with the arm held up, is hanging down.
 */
export const CATCH_MOUNT = { bone: 'handL', position: [0, 0.14, 0.12], rotation: [Math.PI / 2, 0, 0] };

const DUAL_KINDS = new Set(['blade', 'dagger', 'haft', 'wand']);

/**
 * Which clip a swing should play, from what is in both hands. `hand` is whose turn it is (`'main'` | `'off'`) and
 * `step` the swing's count in its chain; every third main-hand swing brings both weapons together. Returns null
 * when the hands do not hold a pair (the caller plays `attack`).
 */
export function dualAttackFor(hold, { hand = 'main', step = 0 } = {}) {
  if (!hold) return null;
  const off = hand === 'off', both = !off && (step | 0) % 3 === 2;
  if (hold.dualTwo) return off ? 'twinChopL' : both ? 'twinCrash' : 'twinChopR';
  if (!DUAL_KINDS.has(hold.right) || !DUAL_KINDS.has(hold.left) || hold.right === 'wand') return null;
  if (hold.right === 'dagger' && hold.left === 'dagger') return off ? 'dualStabL' : both ? 'dualFlurry' : 'dualStabR';
  return off ? (hold.left === 'dagger' ? 'dualStabL' : 'dualSlashL') : both ? 'dualCross' : (hold.right === 'dagger' ? 'dualStabR' : 'dualSlashR');
}

/**
 * A pair that alternates when the game does not say whose turn it is: main, off, main, off, both — `n` is any
 * running count (the swing number). Returns null when the hands do not hold a pair.
 */
export function dualAttackByCount(hold, n = 0) {
  const k = ((n | 0) % 5 + 5) % 5;
  return dualAttackFor(hold, k === 4 ? { hand: 'main', step: 2 } : { hand: k % 2 ? 'off' : 'main', step: 0 });
}

// ---------------------------------------------------------------------------- helpers
/** Mirror: the left arm's twist and spread, and every aim's roll and yaw, are the right arm's with the sign turned. */
const K = side => side === 'R' ? 1 : -1;
const other = side => side === 'R' ? 'L' : 'R';
const kindOf = (ctx, side) => side === 'R' ? ctx.hold.right : ctx.hold.left;
/** The pitch a hand's weapon rests at when the arm hangs (a great weapon is NOT over the shoulder in these). */
const restPitch = (ctx, side) => { const k = kindOf(ctx, side), r = REST_PITCH[k]; return !r ? -0.95 : k === 'heavy' ? -0.95 : r.idle; };
const holds = (ctx, side) => !!REST_PITCH[kindOf(ctx, side)];

/** The hand that is NOT striking: drawn back at the guard, weapon up, and turned a little with the body. */
function guardArm(p, ctx, side, rec, back = 0) {
  const k = K(side);
  p['arm' + side] = [(-0.5 + 0.35 * back) * rec, 0.15 * k * rec, (0.16 + 0.22 * back) * k * rec + 0.12 * k];
  p['elbow' + side][0] = (-1.25 - 0.25 * back) * rec - 0.16;
  if (!holds(ctx, side)) return undefined;
  // held the way a fist holds a handle, cocked a little further while the other hand is busy (hand-relative: an
  // aim in the chest's frame would lay the hilt along this forearm)
  fistGrip(p, side, FIST.idle + (FIST.ready - FIST.idle) * rec);
  return false;
}

/** A diagonal cut by one arm — high outside to low inside — with the body turning through it. */
function cut(p, u, ctx, o, side) {
  const { wind, strike, rec } = phases(u, 0, 0.3, 0.28, 0.56, 0.72), k = K(side);
  o.bob = stance(p, 0.85) * rec - 0.03 * sin(u * PI) - 0.03 * strike * rec; o.surge = 0.04 * strike * rec;
  p.hips[1] += (0.3 * wind - 0.7 * strike) * k * rec;
  p.chest[1] += (0.55 * wind - 1.15 * strike) * k * rec;
  p.chest[0] += (-0.1 * wind + 0.2 * strike) * rec;
  p.chest[2] = (0.08 * wind - 0.1 * strike) * k * rec;
  p.head[1] = p.chest[1] * -0.3;
  p['arm' + side] = [(-0.45 - 1.0 * wind + 0.75 * strike) * rec - 0.1, (0.5 * wind - 0.95 * strike) * k * rec, (0.14 + (0.7 * wind - 0.4 * strike) * rec) * k];
  p['elbow' + side][0] = (-1.25 * wind + 1.05 * strike) * rec - 0.25;
  p.kneeL[0] += 0.22 * strike * rec; p.kneeR[0] += 0.12 * strike * rec;
  const aims = {};
  // the blade starts high and back, comes over and down across the body, the wrist rolling the edge through
  if (holds(ctx, side)) aims[side] = [(-1.75 - 0.75 * wind + 0.7 * strike) * rec + restPitch(ctx, side) * (1 - rec), (1.2 * wind - 1.5 * strike) * k * rec, (-0.85 * wind + 0.8 * strike) * k * rec];
  const g = guardArm(p, ctx, other(side), rec, strike);
  if (g !== undefined) aims[other(side)] = g;
  return aims;
}

/** A forward-grip thrust by one arm: drawn back to the hip, driven out level, the body stepping in behind it. */
function stab(p, u, ctx, o, side, depth = 1) {
  const back = ss(u, 0, 0.28), out = ss(u, 0.24, 0.46), rec = 1 - ss(u, 0.62, 1), k = K(side);
  o.bob = stance(p, 0.9) * rec - 0.05 * out * rec * depth; o.surge = 0.07 * out * rec * depth;
  p['arm' + side] = [(-0.3 + 0.5 * back - 1.45 * out) * rec - 0.05, 0, (0.14 + 0.1 * rec) * k];
  p['elbow' + side][0] = (-1.6 * back + 1.45 * out) * rec - 0.2;
  p.chest[1] += (0.4 * back - 0.6 * out) * k * rec; p.hips[1] += (0.2 * back - 0.3 * out) * k * rec;
  p.chest[0] += 0.14 * out * rec; p.head[1] = p.chest[1] * -0.35;
  p.kneeL[0] += 0.3 * out * rec * depth; p.legR[0] += 0.14 * out * rec * depth;
  const aims = {};
  // the point leads a little above the forearm's own line all the way out: a wrist does not straighten fully, and a
  // blade dead in line with the forearm hides its hilt in the wrist
  if (holds(ctx, side)) aims[side] = [(-2.0 + 0.22 * out) * rec + restPitch(ctx, side) * (1 - rec), -0.35 * back * k * rec, (0.12 * back - 0.08 * out) * k * rec];
  const g = guardArm(p, ctx, other(side), rec, out);
  if (g !== undefined) aims[other(side)] = g;
  return aims;
}

/** One great weapon comes off its shoulder, up, and down across the body; the other stays shouldered. */
function greatChop(p, u, ctx, o, side) {
  const lift = ss(u, 0, 0.3), down = ss(u, 0.32, 0.5), rec = 1 - ss(u, 0.74, 1), k = K(side), up = lift * (1 - down);
  const aims = carry(p, ctx, 'idle');                       // both weapons start (and the idle one stays) over the shoulders
  o.bob = (stance(p, 1.05) + 0.02 * up - 0.1 * down) * rec;
  const s0 = p['arm' + side].slice(), e0 = p['elbow' + side][0], a0 = (aims[side] || [2.5, 0, 0]).slice();
  const w = Math.min(1, lift * 3) * rec;                    // how far the arm has left the carry
  const arm = [(-2.55 * up + 0.35 * down - 0.35), (0.3 * up - 0.45 * down) * k, (0.5 * up + 0.1) * k];
  const elbow = -1.05 * up - 0.25 * down - 0.2;
  for (let i = 0; i < 3; i++) p['arm' + side][i] = s0[i] + (arm[i] - s0[i]) * w;
  p['elbow' + side][0] = e0 + (elbow - e0) * w;
  p.chest[1] += (0.5 * up - 0.75 * down) * k * rec; p.hips[1] += (0.2 * up - 0.3 * down) * k * rec;
  p.chest[0] += (-0.16 * up + 0.36 * down) * rec; p.head[0] += (-0.08 * up + 0.14 * down) * rec;
  p.kneeL[0] += 0.45 * down * rec; p.kneeR[0] += 0.4 * down * rec; p.legL[0] -= 0.22 * down * rec; p.legR[0] -= 0.22 * down * rec;
  // the blade goes from behind the shoulder (pitch 2.5: up and back) a little further back as the arm lifts, then
  // over the top and down in front (4.95 is the same direction as -1.33: forward and down). The pitch only rises
  // through the blow, so the swing has one direction; it comes home to the shoulder the way it went.
  aims[side] = [a0[0] + (-0.3 * up + 2.45 * down) * rec, a0[1] * (1 - w) + 0.15 * up * k, a0[2] * (1 - w) + (0.35 * up - 0.3 * down) * k * rec];
  return aims;
}

// ---------------------------------------------------------------------------- the clips
const POSES = {
  dualSlashR: (p, u, cy, ctx, o) => cut(p, u, ctx, o, 'R'),
  dualSlashL: (p, u, cy, ctx, o) => cut(p, u, ctx, o, 'L'),
  dualCross(p, u, cy, ctx, o) {
    // BOTH TOGETHER: the blades rise crossed in front of the face, then open downward and out like shears,
    // the body dropping and stepping into it
    const { wind, strike, rec } = phases(u, 0, 0.36, 0.34, 0.58, 0.76), up = wind * (1 - strike);
    o.bob = (stance(p, 1.0) + 0.02 * up - 0.09 * strike) * rec; o.surge = 0.06 * strike * rec;
    const aims = {};
    for (const s of ['R', 'L']) {
      const k = K(s);
      p['arm' + s] = [(-1.75 * up - 0.75 * strike - 0.1) * rec, (-0.75 * up + 0.35 * strike) * k * rec, ((-0.25 * up + 0.85 * strike) * rec + 0.12) * k];
      p['elbow' + s][0] = (-1.35 * up - 0.2 * strike) * rec - 0.2;
      if (holds(ctx, s)) aims[s] = [(-2.75 * up - 1.25 * strike) * rec + restPitch(ctx, s) * (1 - rec), (0.6 * up - 0.9 * strike) * k * rec, (-0.55 * up + 0.75 * strike) * k * rec];
    }
    p.chest[0] += (-0.2 * up + 0.38 * strike) * rec; p.head[0] += (-0.1 * up + 0.14 * strike) * rec;
    p.kneeL[0] += 0.45 * strike * rec; p.kneeR[0] += 0.35 * strike * rec; p.legL[0] -= 0.25 * strike * rec;
    return aims;
  },
  dualStabR: (p, u, cy, ctx, o) => stab(p, u, ctx, o, 'R'),
  dualStabL: (p, u, cy, ctx, o) => stab(p, u, ctx, o, 'L'),
  dualFlurry(p, u, cy, ctx, o) {
    // three fast thrusts — main, off, main — each one a short version of the stab, the body never settling between
    const n = Math.min(2, Math.floor(u * 3)), uu = u * 3 - n, side = n === 1 ? 'L' : 'R';
    const local = n === 2 ? uu * 0.95 : Math.min(0.6, uu * 0.62);         // only the last one recovers
    return stab(p, local, ctx, o, side, 0.7);
  },
  twinChopR: (p, u, cy, ctx, o) => greatChop(p, u, ctx, o, 'R'),
  twinChopL: (p, u, cy, ctx, o) => greatChop(p, u, ctx, o, 'L'),
  twinCrash(p, u, cy, ctx, o) {
    // both great weapons heaved up off the shoulders, HELD at the top (the pause is the weight), and brought down together
    const lift = ss(u, 0, 0.3), hang = ss(u, 0.3, 0.42), down = ss(u, 0.42, 0.56), rec = 1 - ss(u, 0.78, 1), up = lift * (1 - down);
    const aims = carry(p, ctx, 'idle');
    o.bob = (stance(p, 1.0) + 0.04 * up - 0.15 * down) * rec;
    const w = Math.min(1, lift * 3) * rec;
    for (const s of ['R', 'L']) {
      const k = K(s), s0 = p['arm' + s].slice(), e0 = p['elbow' + s][0], a0 = (aims[s] || [2.5, 0, 0]).slice();
      const arm = [-2.6 * up + 0.3 * down - 0.3, 0, (0.22 * up + 0.14) * k], elbow = -0.75 * up - 0.45 * hang * (1 - down) - 0.25 * down - 0.2;
      for (let i = 0; i < 3; i++) p['arm' + s][i] = s0[i] + (arm[i] - s0[i]) * w;
      p['elbow' + s][0] = e0 + (elbow - e0) * w;
      if (holds(ctx, s)) aims[s] = [a0[0] + (-0.35 * up - 0.1 * hang * (1 - down) + 2.5 * down) * rec, a0[1] * (1 - w), a0[2] * (1 - w) + 0.12 * up * k];
    }
    p.chest[0] += (-0.22 * up + 0.42 * down) * rec; p.head[0] += (-0.14 * up + 0.2 * down) * rec;
    p.kneeL[0] += 0.65 * down * rec; p.kneeR[0] += 0.65 * down * rec; p.legL[0] -= 0.32 * down * rec; p.legR[0] -= 0.32 * down * rec;
    return aims;
  },

  // ---------------------------------------------------------------- angling (hands free; the game adds the rod)
  fishCast(p, u, cy, ctx, o) {
    // back over the shoulder, a beat, then the whole arm whipped forward and stopped high — the line flies on its own
    const back = ss(u, 0, 0.38), whip = ss(u, 0.46, 0.62), settle = ss(u, 0.7, 1);
    const up = back * (1 - whip);
    o.bob = stance(p, 0.5) * (1 - settle * 0.6) - 0.03 * whip * (1 - settle); o.surge = 0.04 * whip * (1 - settle);
    p.armR = [-0.55 - 1.95 * up - 0.75 * whip + 0.45 * whip * settle, 0, 0.18];
    p.elbowR[0] = -1.15 - 0.75 * up + 0.75 * whip - 0.2 * settle;
    p.handR[0] = 0.5 * up - 0.45 * whip * (1 - settle);
    p.chest[1] += 0.3 * up - 0.3 * whip * (1 - settle); p.chest[0] += -0.14 * up + 0.2 * whip * (1 - settle);
    p.head[0] += -0.06 * up + 0.04 * whip; p.hips[1] += 0.12 * up;
    p.armL = [-0.3 - 0.25 * whip * (1 - settle), 0, -0.26]; p.elbowL[0] = -0.75;
    p.kneeL[0] += 0.2 * whip * (1 - settle);
    return {};
  },
  fishWait(p, u, cy, ctx, o) {
    // rod held out low over the water in the main hand, the off hand resting at the reel; weight on one leg, watching the float
    const breath = sin(cy), nod = sin(cy * 3) * 0.5 + sin(cy * 2) * 0.5;
    o.bob = stance(p, 0.35) + breath * 0.004; o.sway = sin(cy) * 0.008;
    p.armR = [-0.42 + breath * 0.02, 0, 0.16]; p.elbowR[0] = -1.02 + nod * 0.025; p.handR[0] = nod * 0.04;
    p.armL = [-0.5, 0.35, -0.1]; p.elbowL[0] = -1.35; p.handL[2] = 0.2;
    p.chest[0] += 0.07 + breath * 0.012; p.head[0] += 0.1; p.head[1] = sin(cy) * 0.06;
    p.hips[2] = 0.03; p.chest[2] = -0.02;
    return {};
  },
  fishReel(p, u, cy, ctx, o) {
    // the rod hauled up and back against the pull, the body leaning away, the off hand winding fast; it jerks
    const haul = 0.5 - cos(cy) * 0.5, jerk = sin(cy * 4) * 0.035, crank = cy * 3;
    o.bob = stance(p, 0.9) - 0.02 * haul; o.surge = -0.03 * haul;
    p.armR = [-0.55 - 0.3 * haul + jerk, 0, 0.2]; p.elbowR[0] = -1.35 - 0.35 * haul; p.handR[0] = 0.25 * haul + jerk;
    p.armL = [-0.62 + sin(crank) * 0.1, 0.45, -0.06]; p.elbowL[0] = -1.45 + cos(crank) * 0.16; p.handL[2] = 0.25 + sin(crank) * 0.2;
    p.chest[0] += -0.14 - 0.12 * haul; p.head[0] += 0.14; p.hips[0] = -0.05 * haul; p.chest[1] += jerk;
    p.kneeL[0] += 0.15 * haul; p.kneeR[0] += 0.1 * haul;
    return {};
  },
  fishShow(p, u, cy, ctx, o) {
    // the catch swung up out of the water into the off hand and held high; a look at it, a small hop of triumph
    const lift = env(u, 0.05, 0.3, 0.82, 0.98), hop = Math.max(0, sin(ss(u, 0.28, 0.5) * PI));
    o.rootY = 0.05 * hop; o.bob = -0.02 * lift * (1 - hop);
    p.armL = [-0.35 * lift, 0, -0.12 - 2.45 * lift]; p.elbowL[0] = -0.16 - 0.3 * lift; p.handL[2] = 0.15 * lift;
    p.armR = [-0.35 * lift, 0, 0.18]; p.elbowR[0] = -0.16 - 0.85 * lift;
    p.head[0] -= 0.28 * lift; p.head[1] = -0.3 * lift; p.head[2] = -0.1 * lift; p.chest[0] -= 0.1 * lift; p.chest[2] = -0.06 * lift;
    p.kneeL[0] += 0.2 * lift * (1 - hop); p.kneeR[0] += 0.2 * lift * (1 - hop);
    return {};
  },

  // ---------------------------------------------------------------- back on your feet
  standUp(p, u, cy, ctx, o) {
    // `dead` played backwards would be a body sucked upright. This is the three things a person does: the chest
    // comes up off the ground (a hand pushing), a knee is drawn under, and the legs straighten with a small stagger.
    const sit = ss(u, 0.05, 0.4), kneel = ss(u, 0.32, 0.62), rise = ss(u, 0.58, 0.92), settle = ss(u, 0.85, 1);
    const lying = 1 - sit, down = 1 - rise;
    p.root[0] = -PI / 2 * (1 - ss(u, 0.08, 0.55));
    o.rootY = 0.13 * lying * lying;
    // sitting up: chest folds forward at the hips while the root tips up; legs out in front, then one drawn under
    const fold = sit * (1 - kneel);
    p.chest[0] += 0.55 * fold + 0.25 * kneel * down - 0.1 * lying; p.head[0] += 0.2 * fold - 0.25 * lying + 0.15 * kneel * down;
    p.legL[0] = -1.35 * fold - 1.3 * kneel * down; p.kneeL[0] = 0.5 * fold + 1.55 * kneel * down; p.footL[0] = -0.15 * kneel * down;
    p.legR[0] = -1.2 * fold + 0.25 * kneel * down; p.kneeR[0] = 0.3 * fold + 1.7 * kneel * down; p.footR[0] = 0.8 * kneel * down;
    o.bob = -(ctx.rig.leg * 0.85) * fold - 0.26 * (ctx.rig.leg / 0.53) * kneel * down;
    // the pushing hand goes to the ground behind, then to the knee as the body rises
    p.armR = [0.55 * fold - 0.5 * kneel * down, 0, 0.2 + 0.9 * lying + 0.25 * fold]; p.elbowR[0] = -0.16 - 0.25 * fold - 0.45 * kneel * down;
    p.armL = [-0.25 * fold - 0.55 * kneel * down, 0, -0.2 - 0.9 * lying]; p.elbowL[0] = -0.16 - 0.4 * lying - 0.35 * kneel * down;
    p.head[1] = -0.35 * lying;
    // a stagger as the weight comes onto the feet
    const wob = sin(rise * PI) * (1 - settle);
    p.hips[2] = 0.05 * wob; p.chest[2] = -0.04 * wob; o.sway = 0.015 * wob;
    return restAims(ctx);
  },
};

registerClips(Object.fromEntries(Object.entries(POSES).map(([name, pose]) => [name, {
  pose, seconds: CHIBI2_DUAL_SECONDS[name],
  oneShot: !['fishWait', 'fishReel'].includes(name),
  handsFree: CHIBI2_ANGLE_ANIMS.includes(name),
}])));
