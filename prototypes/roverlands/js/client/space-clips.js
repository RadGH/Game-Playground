// The zero-g clip for the Chibi 2.6 rider (Expansion 1 M11), registered on the shared motion catalog like
// js/client/sky-clips.js. A Roverlands-only name, so no other game sees it.
//
//   float  weightless on Lantern Station: arms drifting out to the sides and a little up, elbows soft, legs loose and
//          bent a little at the knee, the whole body bobbing slowly. riders.js stands it upright with `feet` = the middle
//          of the body (js/client/riders.js onFoot 'float').
import { registerClips } from '../../../../avatar-3d/js/chibi2-motion.js';

registerClips({
  float: {
    seconds: 4,
    pose(p, u) {
      const w = Math.sin(u * Math.PI * 2), w2 = Math.sin(u * Math.PI * 2 + 1.3);
      p.chest[0] = 0.06 + w * 0.03; p.head[0] = -0.12 + w2 * 0.05;
      p.armR = [-0.25 + w * 0.08, 0, 0.95 + w2 * 0.12]; p.armL = [-0.25 - w * 0.08, 0, -0.95 - w2 * 0.12];
      p.elbowR[0] = p.elbowL[0] = -0.7 - w * 0.1;
      p.legL[0] = -0.28 + w * 0.08; p.legR[0] = 0.05 - w * 0.08;
      p.legL[2] = -0.08; p.legR[2] = 0.08;
      p.kneeL[0] = 0.55 + w2 * 0.1; p.kneeR[0] = 0.4 - w2 * 0.1;
      p.footL[0] = p.footR[0] = 0.35;
      return {};
    },
  },
});
export const SPACE_ANIMS = ['float'];
