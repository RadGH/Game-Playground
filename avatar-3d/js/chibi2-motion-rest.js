// Chibi 2 — opt-in clips added 2026-10-17 (Thousandvale play-test 12, live reports #88 and #76). A NEW FILE ON PURPOSE,
// like chibi2-motion-dual.js: chibi2-motion.js is read by every game and nothing here changes a clip any of them plays.
// Importing this module registers the clips (chibi2-motion.js `registerClips`); a character only pays for the ones its
// `anims` list names:
//
//   import { CHIBI2_REST_ANIMS } from './chibi2-motion-rest.js';
//   createChibi2Character(avatar, { anims: [...CHIBI2_ANIMS, ...CHIBI2_REST_ANIMS] })
//
// FRONT CRAWL (#88: "swimming is backwards (backstrokes)"). The shared `swim` clip tips the root BACK 64 degrees
// (`root[0] = -1.12`: the body lies face-up and travels feet first) — it reads as a backstroke whichever way the
// body faces. `swimCrawl` lies face DOWN (`root[0] = +1.25`), head up to look where it is going, and the arms go
// all the way round, half a turn apart: in overhead, pull down under the chest to the hip, out of the water with the
// elbow high, and over again. A flutter kick behind. `swimTread` is the stroke for NOT moving: upright, legs pedalling
// slowly, the hands sculling flat at the surface — a crawl played slowly in place looks like someone drowning.
//
//   A note on the arm angle: one full turn per loop means the x angle runs 2 pi over the clip, so at the loop point the
//   follow-through pass (which compares a frame with one a few frames earlier) sees a 2 pi jump for a frame or two. It
//   only ever STRAIGHTENS the elbow there (capped), and at that moment one hand is overhead and the other at the hip —
//   both straight-armed already — so nothing shows.
//
// SITTING DOWN ONCE (#76: "the sitting animation loops — the character keeps sitting down again"). The shared
// `sitGround` clip eases from standing to seated over the first 35% of its 3.4 s loop and then LOOPS — so every 3.4 s
// the body stood up in one frame and sat down again. `sitHold` is the seated pose held, breathing, with no way down
// in it: play `sitGround` once for SIT_DOWN_MS, then `sitHold` for as long as the body stays sat.

import { registerClips, MOTION_KIT } from './chibi2-motion.js';

const { ss } = MOTION_KIT;
const sin = Math.sin, cos = Math.cos, PI = Math.PI;

export const CHIBI2_REST_ANIMS = ['swimCrawl', 'swimTread', 'sitHold'];
export const CHIBI2_REST_SECONDS = { swimCrawl: 1.3, swimTread: 2.2, sitHold: 4 };
/** How long `sitGround` takes to get the body down (its ease ends at 35% of 3.4 s): play it this long, then `sitHold`. */
export const SIT_DOWN_MS = 1150;

const POSES = {
  swimCrawl(p, u, cy, ctx, o) {
    // face down, a little head-up of flat so the face clears the water and looks ahead
    // a game floating a swimmer's FEET 1.1 m under the surface (Thousandvale's MOVE.swimSink) draws this body with the
    // back awash and the head just out: rootY lifts the lying body to the surface (hips ~1.0 m, head ~1.2 m up)
    p.root[0] = 1.25; o.rootY = 0.81;
    p.head[0] = -0.8; p.chest[0] = -0.06;
    p.chest[1] = sin(cy) * 0.22;                       // the body rolls toward the arm that is pulling
    // arms: angle about x. -pi = overhead (forward, the way the body travels), -pi/2 = straight down under the chest,
    // 0 = at the hip, +pi/2 = up over the back (recovery, out of the water), +pi = overhead again
    const aL = cy - PI, aR = cy;                       // half a turn apart
    const recL = Math.max(0, sin(aL)), recR = Math.max(0, sin(aR));   // > 0 on the recovery half (out of the water)
    p.armL[0] = aL; p.armR[0] = aR;
    p.armL[2] = -0.18 - recL * 0.45; p.armR[2] = 0.18 + recR * 0.45;   // the recovering arm swings wide of the head
    p.elbowL[0] = -0.12 - recL * 1.25; p.elbowR[0] = -0.12 - recR * 1.25;   // elbow high on the way over, near straight in the pull
    // flutter kick: small, fast, from the hip, knees soft
    const k = sin(cy * 3);
    p.legL[0] = 0.12 + k * 0.28; p.legR[0] = 0.12 - k * 0.28;
    p.kneeL[0] = 0.15 + Math.max(0, k) * 0.35; p.kneeR[0] = 0.15 + Math.max(0, -k) * 0.35;
    p.footL[0] = 0.55; p.footR[0] = 0.55;              // toes pointed
    o.bob = sin(cy * 2) * 0.02;
    return {};
  },
  swimTread(p, u, cy, ctx, o) {
    // upright in the water, leaning a touch forward; the legs pedal, the hands scull flat at the surface
    p.root[0] = 0.18; o.rootY = 0.27;      // head and shoulders out of the water (head ~1.4 m over the feet)
    p.head[0] = -0.12; p.chest[0] = 0.04;
    const s = sin(cy), c = cos(cy);
    p.legL[0] = -0.55 + s * 0.35; p.legR[0] = -0.55 - s * 0.35;
    p.kneeL[0] = 0.9 + c * 0.35; p.kneeR[0] = 0.9 - c * 0.35;
    p.footL[0] = 0.3; p.footR[0] = 0.3;
    p.armL[0] = -0.75; p.armR[0] = -0.75;
    p.armL[2] = -0.75 - c * 0.12; p.armR[2] = 0.75 + c * 0.12;
    p.armL[1] = s * 0.45; p.armR[1] = -s * 0.45;      // the scull: hands sweep in and out
    p.elbowL[0] = p.elbowR[0] = -0.55;
    o.bob = sin(cy * 2) * 0.025;
    return {};
  },
  sitHold(p, u, cy, ctx, o) {
    // `sitGround` at the end of its ease (k = 1), with a slow breath and nothing else moving
    const breath = sin(cy) * 0.015, leg = ctx.rig.leg;
    p.legL[0] = -1.35; p.legR[0] = -1.35; p.kneeL[0] = 1.6; p.kneeR[0] = 1.6; p.legL[2] = -0.5; p.legR[2] = 0.5;
    p.footL[0] = -0.3; p.footR[0] = -0.3;
    p.chest[0] += 0.2 + breath; p.armL = [-0.9, 0.3, -0.2]; p.armR = [-0.9, -0.3, 0.2];
    p.elbowL[0] = p.elbowR[0] = -0.7;
    p.head[1] = sin(cy * 0.5) * 0.06;                  // a slow look about
    o.bob = -(leg + 0.02) * 0.88; return {};
  },
};

registerClips(Object.fromEntries(Object.entries(POSES).map(([name, pose]) => [name, {
  pose, seconds: CHIBI2_REST_SECONDS[name], oneShot: false, handsFree: true,
}])));
// all three are hands-free, like the shared `swim` and `sitGround` they replace (the weapon is put away), so the switch
// from `sitGround` to `sitHold` never brings the weapon back mid-sit.
