// Chibi 2.6 motion catalog. Existing authored clips are registered by the original optional
// modules and generated against the 2.6 rig. These two seated poses use the rig's metric hip height.
import * as THREE from 'three';
import { registerClips, MOTION_KIT, CHIBI2_ANIMS, CHIBI2_ALL_ANIMS, CHIBI2_COMBAT_ANIMS,
  CHIBI2_RIDE_ANIMS, CHIBI2_MOUNT_ANIMS, CHIBI2_WORK_ANIMS, CHIBI2_MELEE_ANIMS,
  CHIBI2_EMOTE_ANIMS, CHIBI2_MUSIC_ANIMS } from './chibi2-motion.js';
import { CHIBI25_MOVE_ANIMS } from './chibi25-motion.js';
import { CHIBI2_DUAL_ANIMS, CHIBI2_ANGLE_ANIMS, CHIBI2_REVIVE_ANIMS } from './chibi2-motion-dual.js';
import { CHIBI2_REST_ANIMS } from './chibi2-motion-rest.js';
import { CHIBI2_PROF_ANIMS } from './chibi2-motion-prof.js';

const seatPose = (drive = false) => (p, u, cycle, ctx, out) => {
  const wave = MOTION_KIT.ss(u, 0.15, 0.85);
  p.root[0] = drive ? 0.04 : 0;
  p.head[0] = drive ? -0.04 + wave * 0.018 : 0.02;
  p.chest[0] = drive ? 0.06 : 0.02;
  // Keep the thighs level and the shins close to vertical: the hip pivot is on the 0.45 m seat
  // plane, so this puts the sole just above the floor instead of dropping the legs through it.
  p.legL[0] = p.legR[0] = -1.57;
  p.kneeL[0] = p.kneeR[0] = 1.57;
  p.footL[0] = p.footR[0] = 0;
  p.armL[0] = p.armR[0] = drive ? -0.78 : -0.42;
  p.armL[2] = drive ? 0.26 : -0.06; p.armR[2] = drive ? -0.26 : 0.06;
  p.elbowL[0] = p.elbowR[0] = drive ? -0.74 : -0.38;
  p.handL[0] = p.handR[0] = drive ? 0.08 : 0;
  // Move the hips to a 0.45 m seat plane, using the same measured rig landmark the vehicle gallery reads.
  out.rootY = 0.45 - ctx.rig.byName.hips.position.y;
  out.bob = drive ? Math.sin(cycle * Math.PI * 2) * 0.003 : 0;
  return {};
};

registerClips({
  seated: { pose: seatPose(false), seconds: 1, handsFree: true },
  drive: { pose: seatPose(true), seconds: 1.2 },
});

export const CHIBI26_ANIMS = [...new Set([...CHIBI2_ANIMS, 'seated', 'drive'])];
export const CHIBI26_ALL_ANIMS = [...new Set([
  ...CHIBI2_ALL_ANIMS, ...CHIBI2_COMBAT_ANIMS, ...CHIBI2_RIDE_ANIMS, ...CHIBI2_MOUNT_ANIMS,
  ...CHIBI2_WORK_ANIMS, ...CHIBI2_MELEE_ANIMS, ...CHIBI2_EMOTE_ANIMS, ...CHIBI2_MUSIC_ANIMS,
  ...CHIBI25_MOVE_ANIMS, ...CHIBI2_DUAL_ANIMS, ...CHIBI2_ANGLE_ANIMS, ...CHIBI2_REVIVE_ANIMS,
  ...CHIBI2_REST_ANIMS, ...CHIBI2_PROF_ANIMS, 'seated', 'drive',
])];

/**
 * Clamp each animated 2.6 sole to the ground plane after its clip has been evaluated. The source
 * gait clips rotate the foot bones but do not key their positions, so restoring the bind position
 * first prevents corrections from accumulating across frames. Only vertices primarily weighted
 * to that foot contribute; knee/ankle geometry stays with the leg and can bend naturally.
 */
export function createFootFloorCorrection(root, rig) {
  const bySide = { L: [], R: [] }, bases = {};
  for (const side of ['L', 'R']) {
    const foot = rig.byName['foot' + side];
    if (!foot) return null;
    bases[side] = foot.position.clone();
  }
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const indices = mesh.geometry.attributes.skinIndex, weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < indices.count; i++) {
      let best = 0;
      for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, best)) best = k;
      const boneName = mesh.skeleton.bones[indices.getComponent(i, best)]?.name;
      if (boneName === 'footL' || boneName === 'footR') bySide[boneName.slice(-1)].push({ mesh, index: i });
    }
  });
  const point = new THREE.Vector3(), localOrigin = new THREE.Vector3(), localUp = new THREE.Vector3(), worldUp = new THREE.Vector3(0, 1, 0);
  return () => {
    for (const side of ['L', 'R']) rig.byName['foot' + side].position.copy(bases[side]);
    root.updateMatrixWorld(true);
    const skeletons = new Set();
    root.traverse(mesh => { if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
    for (const skeleton of skeletons) skeleton.update();
    for (const side of ['L', 'R']) {
      let minY = Infinity;
      for (const { mesh, index } of bySide[side]) {
        mesh.getVertexPosition(index, point);
        mesh.localToWorld(point);
        if (point.y < minY) minY = point.y;
      }
      const foot = rig.byName['foot' + side];
      if (minY < 0) {
        const correction = -minY + 0.001;
        localOrigin.setFromMatrixPosition(foot.parent.matrixWorld);
        localUp.copy(localOrigin).add(worldUp);
        foot.parent.worldToLocal(localOrigin);
        foot.parent.worldToLocal(localUp);
        localUp.sub(localOrigin);
        foot.position.addScaledVector(localUp, correction);
      }
    }
  };
}
