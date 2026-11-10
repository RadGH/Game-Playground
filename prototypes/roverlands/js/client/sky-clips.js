// Skydiving clips for the Chibi 2.6 rider (Expansion 1 M9), registered on the shared motion catalog like
// avatar-3d/js/chibi26-motion.js registers `seated` / `drive`. Roverlands-only names, so no other game sees them.
//
//   skydive  belly-to-earth arch: arms out and bent up, knees bent so the shins point at the sky, head up. The body is
//            built standing; riders.js lays it face down (js/client/riders.js onFoot 'skydive').
//   canopy   hanging in the harness under the parachute: hands up on the steering toggles, legs a little forward
//   flare    the same, toggles pulled down to the hips (the brake before touchdown)
import { registerClips, MOTION_KIT } from '../../../../avatar-3d/js/chibi2-motion.js';

const { ss } = MOTION_KIT;
registerClips({
  skydive: {
    seconds: 1.6,
    pose(p, u, cy, ctx, o) {
      const w = Math.sin(u * Math.PI * 2), w2 = Math.sin(u * Math.PI * 4);
      p.chest[0] = -0.28; p.head[0] = -0.75 + w2 * 0.03;
      p.armR = [-0.35, 0, 1.45 + w * 0.06]; p.armL = [-0.35, 0, -1.45 - w * 0.06];
      p.elbowR[0] = p.elbowL[0] = -1.05;
      p.legL[0] = 0.32 + w * 0.04; p.legR[0] = 0.32 - w * 0.04;
      p.legL[2] = -0.22; p.legR[2] = 0.22;
      p.kneeL[0] = p.kneeR[0] = 1.25;
      p.footL[0] = p.footR[0] = 0.4;
      return {};
    },
  },
  canopy: {
    seconds: 2.4,
    pose(p, u, cy, ctx, o) {
      const s = Math.sin(u * Math.PI * 2);
      p.armR = [-0.15, 0, 2.55]; p.armL = [-0.15, 0, -2.55];
      p.elbowR[0] = p.elbowL[0] = -0.45;
      p.legL[0] = -0.35 + s * 0.06; p.legR[0] = -0.35 - s * 0.06;
      p.kneeL[0] = p.kneeR[0] = 0.45;
      p.footL[0] = p.footR[0] = 0.3;
      p.head[0] = 0.12;
      return {};
    },
  },
  flare: {
    seconds: 1,
    pose(p, u, cy, ctx, o) {
      const k = ss(u, 0, 0.25);
      p.armR = [-0.45, 0, 0.5 + (1 - k) * 0.6]; p.armL = [-0.45, 0, -0.5 - (1 - k) * 0.6];
      p.elbowR[0] = p.elbowL[0] = -0.6;
      p.legL[0] = p.legR[0] = -0.55; p.kneeL[0] = p.kneeR[0] = 0.25;
      p.head[0] = 0.25;
      return {};
    },
  },
});
export const SKY_ANIMS = ['skydive', 'canopy', 'flare'];
