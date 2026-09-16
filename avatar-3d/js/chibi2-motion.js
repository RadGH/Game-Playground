import * as THREE from 'three';

export const CHIBI2_ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead'];

/**
 * Swimming, built only when a game asks for it: `createChibi2Character(avatar, { swim: true })`.
 * Clips are generated per body template, so three more of them is work every character pays for.
 * A game with no water should not pay it — and when they were on by default, the extra build time
 * was enough to trip a timing race in Emberveil's rest scene.
 */
export const CHIBI2_SWIM_ANIMS = ['swim', 'swimBack', 'swimSide'];
export const CHIBI2_ALL_ANIMS = [...CHIBI2_ANIMS, ...CHIBI2_SWIM_ANIMS];
export const ONE_SHOTS = new Set(['attack', 'cast', 'hit', 'jump', 'dead']);
const LENGTHS = { idle: 3, ready: 2, walk: 1.05, run: 0.65, attack: 0.85, cast: 1.25, hit: 0.45, guard: 2, wave: 2, talk: 2.5, jump: 1, dead: 1, swim: 1.1, swimBack: 1.35, swimSide: 1.2 };

// Keyframes are generated once per body template. Three.js handles interpolation and crossfades.
export function createClips(rig, anims = CHIBI2_ANIMS) {
  const names = rig.bones.map(b => b.name).filter(n => !n.startsWith('eye'));
  const euler = new THREE.Euler(), quat = new THREE.Quaternion();
  return anims.map(name => {
    const duration = LENGTHS[name], steps = Math.ceil(duration * 24), times = [];
    const rotations = Object.fromEntries(names.map(n => [n, []]));
    const hips = [], roots = [];
    for (let frame = 0; frame <= steps; frame++) {
      const u = frame / steps, t = u * duration, cycle = u * Math.PI * 2;
      const pose = Object.fromEntries(names.map(n => [n, [0, 0, 0]]));
      let bob = 0, rootY = 0;
      pose.armL[2] = -0.12; pose.armR[2] = 0.12;
      pose.elbowL[0] = pose.elbowR[0] = -0.12;
      if (name === 'idle' || name === 'ready' || name === 'guard') {
        bob = Math.sin(cycle) * 0.008;
        pose.chest[0] = Math.sin(cycle) * 0.025;
        pose.head[1] = Math.sin(cycle) * 0.06;
        if (name !== 'idle') {
          pose.hips[1] = -0.18; pose.chest[1] = 0.12;
          pose.armR[0] = -0.45; pose.elbowR[0] = -0.7;
          pose.armL[0] = -0.6; pose.elbowL[0] = name === 'guard' ? -1.25 : -0.6;
          pose.legL[0] = 0.08; pose.legR[0] = -0.08;
        }
      } else if (name === 'walk' || name === 'run') {
        const fast = name === 'run', swing = Math.sin(cycle), amp = fast ? 0.7 : 0.38;
        pose.legL[0] = swing * amp; pose.legR[0] = -swing * amp;
        pose.kneeL[0] = Math.max(0, -swing) * (fast ? 1.2 : 0.7);
        pose.kneeR[0] = Math.max(0, swing) * (fast ? 1.2 : 0.7);
        pose.footL[0] = -pose.kneeL[0] * 0.35; pose.footR[0] = -pose.kneeR[0] * 0.35;
        pose.armL[0] = -swing * amp * 0.7; pose.armR[0] = swing * amp * 0.7;
        pose.elbowL[0] = pose.elbowR[0] = fast ? -0.9 : -0.3;
        pose.chest[0] = fast ? 0.1 : 0.025; pose.chest[1] = swing * 0.06;
        bob = (1 - Math.cos(cycle * 2)) * (fast ? 0.016 : 0.008);
      } else if (name === 'attack') {
        const wind = Math.sin(Math.min(1, u / 0.38) * Math.PI / 2);
        const cut = THREE.MathUtils.smoothstep(u, 0.36, 0.68);
        const recover = 1 - THREE.MathUtils.smoothstep(u, 0.78, 1);
        pose.armR = [(-2.2 * wind + 2.7 * cut) * recover, -0.18 * recover, 0.28];
        pose.elbowR[0] = (-0.9 * wind + 0.8 * cut) * recover;
        pose.chest[1] = (0.42 * wind - 0.78 * cut) * recover;
        pose.hips[1] = pose.chest[1] * 0.4;
        pose.armL[0] = -0.55 * recover; pose.elbowL[0] = -0.75 * recover;
        pose.kneeL[0] = 0.16 * recover; bob = -0.035 * Math.sin(u * Math.PI);
      } else if (name === 'cast') {
        const lift = Math.sin(Math.PI * u) ** 0.6;
        pose.armL = [-1.25 * lift, -0.2 * lift, -0.35 * lift];
        pose.armR = [-1.3 * lift, 0.2 * lift, 0.35 * lift];
        pose.elbowL[0] = pose.elbowR[0] = -0.65 * lift;
        pose.head[0] = -0.1 * lift; pose.chest[0] = -0.06 * lift; bob = 0.025 * lift;
      } else if (name === 'hit') {
        const recoil = Math.sin(Math.PI * u) * Math.exp(-u * 1.5);
        pose.chest[0] = -0.42 * recoil; pose.head[0] = -0.28 * recoil;
        pose.armL[2] -= 0.25 * recoil; pose.armR[2] += 0.25 * recoil;
      } else if (name === 'wave') {
        pose.armR[2] = 2.2; pose.elbowR[0] = -0.15;
        pose.elbowR[2] = 0.3 + Math.sin(cycle * 3) * 0.35;
        pose.handR[2] = Math.sin(cycle * 3) * 0.18; pose.head[2] = -0.08;
      } else if (name === 'talk') {
        pose.armL = [-0.35 + Math.sin(cycle) * 0.15, 0, -0.25];
        pose.armR = [-0.25 + Math.cos(cycle) * 0.15, 0, 0.25];
        pose.elbowL[0] = -0.5; pose.elbowR[0] = -0.45;
        pose.head[0] = Math.sin(cycle * 2) * 0.045; pose.head[1] = Math.sin(cycle) * 0.12;
      } else if (name === 'jump') {
        const flight = Math.sin(u * Math.PI), crouch = Math.max(0, Math.sin(u * Math.PI * 2));
        rootY = flight * 0.32; bob = -crouch * 0.05;
        pose.kneeL[0] = pose.kneeR[0] = flight * 0.7;
        pose.legL[0] = pose.legR[0] = -flight * 0.3;
        pose.armL[2] = -0.15 - flight * 0.7; pose.armR[2] = 0.15 + flight * 0.7;
      } else if (name === 'swim' || name === 'swimBack' || name === 'swimSide') {
        // Prone at the surface: the root tips face-down and lifts, so the body floats flat instead
        // of standing upright in the water. Legs flutter for all three; the arms say which stroke.
        const stroke = Math.sin(cycle);
        pose.root[0] = -1.12;
        rootY = 0.36;
        pose.head[0] = 0.5; pose.chest[0] = 0.12;
        pose.legL[0] = stroke * 0.3; pose.legR[0] = -stroke * 0.3;
        pose.kneeL[0] = Math.max(0, -stroke) * 0.5; pose.kneeR[0] = Math.max(0, stroke) * 0.5;
        if (name === 'swim') {                       // front crawl, arms over the head
          pose.armL[0] = -1.5 + stroke * 1.45; pose.armR[0] = -1.5 - stroke * 1.45;
          pose.elbowL[0] = -0.45 - Math.max(0, stroke) * 0.6;
          pose.elbowR[0] = -0.45 - Math.max(0, -stroke) * 0.6;
        } else if (name === 'swimBack') {            // sculling backwards, arms low and pushing
          pose.armL[0] = -0.35 + stroke * 0.75; pose.armR[0] = -0.35 - stroke * 0.75;
          pose.elbowL[0] = pose.elbowR[0] = -1.05;
          pose.armL[2] = -0.4; pose.armR[2] = 0.4;
        } else {                                     // side stroke, arms sweeping across
          pose.armL[2] = -0.95 + stroke * 0.45; pose.armR[2] = 0.95 + stroke * 0.45;
          pose.armL[0] = -0.8; pose.armR[0] = -0.8;
          pose.elbowL[0] = pose.elbowR[0] = -0.8;
        }
        bob = Math.sin(cycle * 2) * 0.02;
      } else if (name === 'dead') {
        const fall = THREE.MathUtils.smoothstep(u, 0.1, 0.85);
        pose.root[0] = -Math.PI / 2 * fall; rootY = fall * 0.13;
        pose.armL[2] = -0.45 * fall; pose.armR[2] = 0.45 * fall;
        pose.head[1] = -0.18 * fall;
      }
      times.push(t);
      hips.push(0, rig.byName.hips.position.y + bob, 0); roots.push(0, rootY, 0);
      for (const n of names) { quat.setFromEuler(euler.set(...pose[n])); rotations[n].push(quat.x, quat.y, quat.z, quat.w); }
    }
    const tracks = names.map(n => new THREE.QuaternionKeyframeTrack(n + '.quaternion', times, rotations[n]));
    tracks.push(new THREE.VectorKeyframeTrack('hips.position', times, hips), new THREE.VectorKeyframeTrack('root.position', times, roots));
    return new THREE.AnimationClip(name, duration, tracks);
  });
}
