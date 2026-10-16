// Chibi 2.5 (part B): the locomotion Chibi 2 never had — sprint, walking backwards and side-stepping. An OPT-IN clip
// family like chibi2-motion-dual.js: importing this module registers the clips (`registerClips` refuses any name that
// already exists, so nothing a game plays today can change), and a character only builds the ones its `anims` names:
//
//   import { CHIBI25_MOVE_ANIMS } from '../../avatar-3d/js/chibi25-motion.js';
//   createChibi2Character(look, { anims: [...CHIBI2_ANIMS, ...CHIBI25_MOVE_ANIMS] })
//   body.setAnim(moveClipFor(forward, right, speed))      // pick from the way the body is moving relative to its facing
//
// They work on any body (v2 or 2.5). On a 2.5 body in something long they read `rig.stride` exactly as walk and run do
// (a shorter step, a smaller heel kick — chibi25-body.js strideFor), and the skirt bones are driven over every frame
// like every other clip, so the robe test (tests/chibi25-robe.test.js) checks these as well.
//
//   sprint     0.5 s  a run with a longer stride, the body pitched further forward and the arms driving hard
//   backpedal  0.95 s walking backwards: the step lands toe first behind, the body leans back a little
//   strafeL/R  0.8 s  side-steps: the leading leg reaches out sideways, the other closes to it, hips sway toward the step
import { registerClips, MOTION_KIT } from './chibi2-motion.js';

const { carry } = MOTION_KIT;
const sin = Math.sin, cos = Math.cos;

export const CHIBI25_MOVE_ANIMS = ['sprint', 'backpedal', 'strafeL', 'strafeR'];
export const CHIBI25_MOVE_SECONDS = { sprint: 0.5, backpedal: 0.95, strafeL: 0.8, strafeR: 0.8 };

const strideOf = ctx => { const st = ctx.rig?.stride; return { sw: st ? st.swing : 1, kk: st ? st.kick : 1 }; };

const POSES = {
  sprint(p, u, cy, ctx, o) {
    const { sw, kk } = strideOf(ctx), s = sin(cy), c = cos(cy), amp = 0.92 * sw;
    p.legL[0] += s * amp - 0.14; p.legR[0] += -s * amp - 0.14;
    p.kneeL[0] += 0.3 + Math.max(0, sin(cy - 0.7)) * 1.5 * kk; p.kneeR[0] += 0.3 + Math.max(0, -sin(cy - 0.7)) * 1.5 * kk;
    p.footL[0] += -0.32 * Math.max(0, s) + 0.5 * Math.max(0, -sin(cy + 0.5)) - p.kneeL[0] * 0.2;
    p.footR[0] += -0.32 * Math.max(0, -s) + 0.5 * Math.max(0, sin(cy + 0.5)) - p.kneeR[0] * 0.2;
    p.chest[0] += 0.34; p.hips[0] = 0.16; p.head[0] -= 0.24;
    p.hips[1] = s * 0.18; p.chest[1] = -s * 0.26; p.head[1] = s * 0.1;
    p.armL[0] += -s * 1.0 - 0.15; p.armR[0] += s * 1.0 - 0.15; p.elbowL[0] = -1.45 - Math.max(0, s) * 0.25; p.elbowR[0] = -1.45 - Math.max(0, -s) * 0.25;
    p.armL[2] -= 0.1; p.armR[2] += 0.1;
    o.bob = -Math.abs(c) * 0.05 + 0.025; o.sway = c * 0.01;
    return carry(p, ctx, 'walk', s);
  },
  backpedal(p, u, cy, ctx, o) {
    const { sw, kk } = strideOf(ctx), s = sin(cy), c = cos(cy), amp = 0.32 * sw;
    // the same leg swing as a walk, the other way round: the foot reaches BACK, lands on the toe, and the knee lifts
    // it forward again on the recovery
    p.legL[0] += -s * amp; p.legR[0] += s * amp;
    p.kneeL[0] += Math.max(0, sin(cy + 0.9)) * 0.6 * kk + 0.08; p.kneeR[0] += Math.max(0, -sin(cy + 0.9)) * 0.6 * kk + 0.08;
    p.footL[0] += 0.2 * Math.max(0, s) - p.kneeL[0] * 0.2; p.footR[0] += 0.2 * Math.max(0, -s) - p.kneeR[0] * 0.2;
    p.chest[0] -= 0.06; p.head[0] += 0.04;
    p.hips[1] = -s * 0.08; p.chest[1] = s * 0.1;
    p.armL[0] += s * 0.22; p.armR[0] += -s * 0.22; p.elbowL[0] += -0.3; p.elbowR[0] += -0.3;
    o.bob = -Math.abs(c) * 0.014 + 0.004; o.sway = c * 0.012;
    return carry(p, ctx, 'walk', -s);
  },
  strafeL(p, u, cy, ctx, o) { return strafe(p, u, cy, ctx, o, -1); },
  strafeR(p, u, cy, ctx, o) { return strafe(p, u, cy, ctx, o, 1); },
};

/**
 * A side-step toward `dir`. The rig faces +z, so the character's own right is -x: strafeR (dir +1) steps toward -x,
 * leading with the -x leg (`legL` — the rig's L/R names are the viewer's, armL and legL sit at -x). A +z rotation of
 * a leg swings its foot toward +x.
 */
function strafe(p, u, cy, ctx, o, dir) {
  const { sw } = strideOf(ctx), s = sin(cy), c = cos(cy), w = 0.26 * sw;
  const lead = dir > 0 ? 'L' : 'R', trail = dir > 0 ? 'R' : 'L', sx = dir > 0 ? -1 : 1;
  const open = Math.max(0, s), close = Math.max(0, -s);
  p['leg' + lead][2] += sx * (0.06 + w * open);
  p['leg' + trail][2] += sx * (0.02 + w * 0.5 * close);
  // each leg lifts as it moves: the knee bends on its own half of the cycle
  p['knee' + lead][0] += 0.08 + 0.45 * Math.max(0, sin(cy - 0.6)); p['leg' + lead][0] -= 0.18 * Math.max(0, sin(cy - 0.6));
  p['knee' + trail][0] += 0.08 + 0.45 * Math.max(0, -sin(cy - 0.6)); p['leg' + trail][0] -= 0.18 * Math.max(0, -sin(cy - 0.6));
  p['foot' + lead][2] -= sx * w * 0.4 * open; p['foot' + trail][2] -= sx * w * 0.2 * close;
  p.hips[2] = -sx * s * 0.05; p.chest[2] = sx * s * 0.03; p.chest[0] += 0.05;
  p.armL[0] += -0.1; p.armR[0] += -0.1; p.elbowL[0] -= 0.35; p.elbowR[0] -= 0.35;
  o.bob = -Math.abs(c) * 0.012; o.sway = -sx * s * 0.02;
  return carry(p, ctx, 'walk', 0);
}

/** The clip for a body moving at `forward`, `right` (its own frame, m/s) — a helper for a game's animation picker. */
export function moveClipFor(forward, right, { run = 3, sprint = 6 } = {}) {
  const speed = Math.hypot(forward, right);
  if (speed < 0.2) return 'idle';
  if (forward < -0.35 * speed) return 'backpedal';
  if (Math.abs(right) > Math.abs(forward) * 1.2) return right > 0 ? 'strafeR' : 'strafeL';
  return speed >= sprint ? 'sprint' : speed >= run ? 'run' : 'walk';
}

registerClips(Object.fromEntries(Object.entries(POSES).map(([name, pose]) => [name, { pose, seconds: CHIBI25_MOVE_SECONDS[name] }])));
