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

/**
 * THE COMBAT CLIPS, opt-in — added 2026-09-20 for Farhold's weapon revamp.
 *
 * Every attack in both prototypes played ONE clip: the overhead chop in `attack`. Stabbing with a
 * rapier, cleaving with an axe, loosing an arrow and casting from a staff were the same animation.
 * These say what each strike shape actually looks like, and they are a SEPARATE list so that
 * `CHIBI2_ANIMS` and `CHIBI2_ALL_ANIMS` are byte-for-byte what they were: a game that does not ask
 * for them does not build them, does not pay for them, and cannot be changed by them.
 *
 *   createChibi2Character(avatar, { anims: CHIBI2_COMBAT_ALL })
 *
 * Note `overhead` is today's `attack`, under its own name, so a pattern can name it explicitly.
 */
export const CHIBI2_COMBAT_ANIMS = [
  'slash', 'slashBack', 'thrust', 'overhead', 'sweep', 'jab', 'arcCut', 'slam', 'lunge',
  'shoot', 'reload', 'castPoint', 'castStaff', 'channel',
];
export const CHIBI2_COMBAT_ALL = [...CHIBI2_ALL_ANIMS, ...CHIBI2_COMBAT_ANIMS];

export const ONE_SHOTS = new Set([
  'attack', 'cast', 'hit', 'jump', 'dead',
  'slash', 'slashBack', 'thrust', 'overhead', 'sweep', 'jab', 'arcCut', 'slam', 'lunge',
  'shoot', 'reload', 'castPoint', 'castStaff',
]);
const LENGTHS = {
  idle: 3, ready: 2, walk: 1.05, run: 0.65, attack: 0.85, cast: 1.25, hit: 0.45, guard: 2,
  wave: 2, talk: 2.5, jump: 1, dead: 1, swim: 1.1, swimBack: 1.35, swimSide: 1.2,
  slash: 0.5, slashBack: 0.5, thrust: 0.42, overhead: 0.85, sweep: 0.92, jab: 0.26,
  arcCut: 0.62, slam: 1.05, lunge: 0.55, shoot: 0.6, reload: 1, castPoint: 0.35,
  castStaff: 0.7, channel: 1.6,
};

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
      } else if (name === 'overhead') {
        // today's `attack`, unchanged, under a name a strike pattern can ask for
        const wind = Math.sin(Math.min(1, u / 0.38) * Math.PI / 2);
        const cut = THREE.MathUtils.smoothstep(u, 0.36, 0.68);
        const recover = 1 - THREE.MathUtils.smoothstep(u, 0.78, 1);
        pose.armR = [(-2.2 * wind + 2.7 * cut) * recover, -0.18 * recover, 0.28];
        pose.elbowR[0] = (-0.9 * wind + 0.8 * cut) * recover;
        pose.chest[1] = (0.42 * wind - 0.78 * cut) * recover;
        pose.hips[1] = pose.chest[1] * 0.4;
        pose.armL[0] = -0.55 * recover; pose.elbowL[0] = -0.75 * recover;
        pose.kneeL[0] = 0.16 * recover; bob = -0.035 * Math.sin(u * Math.PI);
      } else if (name === 'slash' || name === 'slashBack') {
        // A HORIZONTAL CUT. The hips lead, the chest follows and the arm arrives last — which is
        // both how a cut is actually thrown and why the two directions read as a combo rather than
        // the same swing twice. `slashBack` is the mirror.
        const s = name === 'slash' ? 1 : -1;
        const wind = THREE.MathUtils.smoothstep(u, 0, 0.32);
        const cut = THREE.MathUtils.smoothstep(u, 0.28, 0.6);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.72, 1);
        pose.hips[1] = (0.35 * wind - 0.72 * cut) * s * rec;
        pose.chest[1] = (0.55 * wind - 1.2 * cut) * s * rec;
        pose.armR[0] = (-0.5 - 0.4 * wind + 0.35 * cut) * rec;
        pose.armR[1] = (0.45 * wind - 0.85 * cut) * s * rec;
        pose.armR[2] = 0.12 + (0.55 * wind - 0.25 * cut) * rec;
        pose.elbowR[0] = (-1.15 + 0.95 * cut) * rec;
        pose.armL[0] = -0.45 * rec; pose.armL[2] = -0.12 - 0.3 * s * rec;
        pose.elbowL[0] = -0.85 * rec;
        pose.head[1] = pose.chest[1] * 0.35;
        bob = -0.022 * Math.sin(u * Math.PI);
      } else if (name === 'thrust') {
        // straight out from the shoulder, hips square behind it
        const back = THREE.MathUtils.smoothstep(u, 0, 0.3);
        const out = THREE.MathUtils.smoothstep(u, 0.26, 0.5);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.6, 1);
        pose.armR[0] = (-0.35 + 0.55 * back - 1.55 * out) * rec;
        pose.armR[2] = 0.12 + 0.1 * rec;
        pose.elbowR[0] = (-1.5 * back + 1.45 * out) * rec;
        pose.chest[1] = (0.3 * back - 0.5 * out) * rec;
        pose.hips[1] = pose.chest[1] * 0.5;
        pose.legR[0] = -0.3 * out * rec; pose.legL[0] = 0.35 * out * rec;
        pose.kneeL[0] = 0.5 * out * rec;
        bob = -0.05 * out * rec;
      } else if (name === 'jab') {
        // the elbow and nothing else: short, quick, and it does not move the body
        const out = Math.sin(Math.min(1, u / 0.45) * Math.PI);
        pose.armR[0] = -0.55 - 0.35 * out; pose.armR[2] = 0.12;
        pose.elbowR[0] = -1.25 + 1.15 * out;
        pose.chest[1] = -0.14 * out;
        pose.armL[0] = -0.5; pose.elbowL[0] = -0.9;
      } else if (name === 'sweep') {
        // BOTH HANDS ON THE HAFT. The arms are locked to each other and the whole body turns, which
        // is the only way a two-hander reads as heavy rather than as a one-hander held oddly.
        const wind = THREE.MathUtils.smoothstep(u, 0, 0.34);
        const cut = THREE.MathUtils.smoothstep(u, 0.3, 0.66);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.78, 1);
        const turn = (0.9 * wind - 1.9 * cut) * rec;
        pose.chest[1] = turn; pose.hips[1] = turn * 0.6; pose.head[1] = turn * 0.25;
        pose.armR[0] = (-0.85 - 0.25 * wind + 0.3 * cut) * rec;
        pose.armL[0] = (-0.95 - 0.25 * wind + 0.3 * cut) * rec;
        pose.armR[2] = 0.35 * rec; pose.armL[2] = -0.35 * rec;
        pose.elbowR[0] = -0.5 * rec; pose.elbowL[0] = -0.75 * rec;
        pose.legR[0] = -0.2 * cut * rec; pose.legL[0] = 0.2 * cut * rec;
        bob = -0.03 * Math.sin(u * Math.PI);
      } else if (name === 'arcCut') {
        // the sword finisher: a full turn that carries the body round with the blade
        const wind = THREE.MathUtils.smoothstep(u, 0, 0.3);
        const cut = THREE.MathUtils.smoothstep(u, 0.26, 0.62);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.8, 1);
        const turn = (0.7 * wind - 2.0 * cut) * rec;
        pose.chest[1] = turn * 0.65; pose.hips[1] = turn * 0.55; pose.head[1] = turn * 0.3;
        pose.armR[0] = (-0.6 - 0.5 * wind + 0.55 * cut) * rec;
        pose.armR[1] = turn * 0.45;
        pose.armR[2] = 0.12 + 0.5 * rec;
        pose.elbowR[0] = (-0.9 + 0.8 * cut) * rec;
        pose.armL[0] = -0.4 * rec; pose.armL[2] = -0.55 * rec;
        pose.kneeR[0] = 0.3 * cut * rec;
        bob = -0.045 * Math.sin(u * Math.PI);
      } else if (name === 'slam') {
        // THE SMASH. Both arms go overhead and stay there for 0.42 s — the pause IS the weight —
        // then come down through the target in 0.14 s, with the hips dropping under it.
        const up = THREE.MathUtils.smoothstep(u, 0, 0.30);
        const hold = THREE.MathUtils.smoothstep(u, 0.30, 0.40);
        const down = THREE.MathUtils.smoothstep(u, 0.40, 0.54);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.76, 1);
        const raise = up * (1 - down);
        pose.armR[0] = (-2.5 * raise + 2.3 * down) * rec;
        pose.armL[0] = (-2.4 * raise + 2.2 * down) * rec;
        pose.armR[2] = 0.2 * rec; pose.armL[2] = -0.2 * rec;
        pose.elbowR[0] = (-0.4 - 0.6 * hold + 0.9 * down) * rec;
        pose.elbowL[0] = pose.elbowR[0];
        pose.chest[0] = (-0.3 * raise + 0.55 * down) * rec;
        pose.head[0] = (-0.25 * raise + 0.3 * down) * rec;
        pose.kneeL[0] = 0.55 * down * rec; pose.kneeR[0] = 0.55 * down * rec;
        pose.legL[0] = -0.3 * down * rec; pose.legR[0] = -0.3 * down * rec;
        bob = (0.03 * raise - 0.12 * down) * rec;
      } else if (name === 'lunge') {
        // the fencing lunge: the front knee bends deep and the point goes out with it
        const load = THREE.MathUtils.smoothstep(u, 0, 0.24);
        const out = THREE.MathUtils.smoothstep(u, 0.2, 0.46);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.66, 1);
        pose.armR[0] = (-0.3 + 0.4 * load - 1.6 * out) * rec;
        pose.elbowR[0] = (-1.4 * load + 1.35 * out) * rec;
        pose.legL[0] = (0.2 * load + 0.75 * out) * rec;
        pose.kneeL[0] = 1.1 * out * rec;
        pose.legR[0] = -0.55 * out * rec; pose.kneeR[0] = 0.05 * rec;
        pose.chest[0] = 0.25 * out * rec; pose.chest[1] = -0.3 * out * rec;
        pose.armL[0] = -0.2 * rec; pose.armL[2] = -0.9 * out * rec;
        bob = -0.16 * out * rec;
      } else if (name === 'shoot') {
        // A BOW IS DRAWN. The left arm is out straight and stays there; the right hand comes back
        // to the cheek, holds, and snaps forward on the loose.
        const draw = THREE.MathUtils.smoothstep(u, 0.08, 0.6);
        const loose = THREE.MathUtils.smoothstep(u, 0.66, 0.78);
        const rec = 1 - THREE.MathUtils.smoothstep(u, 0.86, 1);
        pose.armL[0] = -1.48 * rec; pose.armL[1] = 0.1 * rec; pose.armL[2] = -0.35 * rec;
        pose.elbowL[0] = -0.08 * rec;
        pose.armR[0] = (-1.35 + 0.35 * draw) * rec;
        pose.armR[1] = (-0.1 - 0.35 * draw + 0.5 * loose) * rec;
        pose.armR[2] = 0.3 * rec;
        pose.elbowR[0] = (-0.3 - 1.35 * draw + 1.5 * loose) * rec;
        pose.chest[1] = (-0.25 - 0.2 * draw + 0.15 * loose) * rec;
        pose.head[1] = -0.35 * rec;
        bob = 0.01 * draw;
      } else if (name === 'reload') {
        // the crossbow: butt to the hip, foot in the stirrup, both arms haul on the string
        const down = THREE.MathUtils.smoothstep(u, 0, 0.22);
        const haul = Math.sin(THREE.MathUtils.smoothstep(u, 0.24, 0.72) * Math.PI);
        const back = 1 - THREE.MathUtils.smoothstep(u, 0.78, 1);
        pose.chest[0] = (0.35 * down + 0.25 * haul) * back;
        pose.armR[0] = (-0.2 + 0.4 * down - 1.1 * haul) * back;
        pose.armL[0] = (-0.3 + 0.3 * down - 1.0 * haul) * back;
        pose.elbowR[0] = (-0.6 - 0.9 * haul) * back;
        pose.elbowL[0] = (-0.7 - 0.8 * haul) * back;
        pose.kneeL[0] = 0.45 * down * back; pose.legL[0] = 0.3 * down * back;
        pose.head[0] = 0.3 * down * back;
        bob = -0.06 * down * back;
      } else if (name === 'castPoint') {
        // a wand: one arm out and a flick of the wrist. Nothing else moves, which is the point —
        // a wand is the weapon you can fire while you are busy doing something else.
        const out = Math.sin(Math.min(1, u / 0.5) * Math.PI / 2);
        const flick = Math.sin(THREE.MathUtils.smoothstep(u, 0.45, 0.85) * Math.PI);
        pose.armR[0] = -1.15 * out; pose.armR[2] = 0.2 * out;
        pose.elbowR[0] = -0.35 * out + 0.25 * flick;
        pose.handR[0] = -0.5 * flick;
        pose.chest[1] = -0.18 * out;
        pose.armL[0] = -0.35; pose.elbowL[0] = -0.7;
      } else if (name === 'castStaff') {
        // both hands on the haft, the butt planted, the body leaning into the release
        const plant = THREE.MathUtils.smoothstep(u, 0, 0.35);
        const push = Math.sin(THREE.MathUtils.smoothstep(u, 0.32, 0.8) * Math.PI);
        pose.armR[0] = -0.9 - 0.45 * push; pose.armR[2] = 0.3;
        pose.armL[0] = -1.1 - 0.4 * push; pose.armL[2] = -0.42;
        pose.elbowR[0] = -0.55 - 0.3 * push; pose.elbowL[0] = -0.8 - 0.25 * push;
        pose.chest[0] = -0.18 * plant + 0.35 * push;
        pose.head[0] = -0.12 * plant + 0.2 * push;
        pose.legL[0] = 0.22 * push; pose.legR[0] = -0.22 * push;
        bob = -0.03 * push;
      } else if (name === 'channel') {
        // A STAFF BUILDING. It loops, so it can be held for as long as the player holds the button:
        // the butt stays planted, the shoulders rise, and the whole body shivers a little faster as
        // it fills. The charge's own effects do the rest.
        const rise = 0.5 - Math.cos(cycle) * 0.5;
        const shiver = Math.sin(cycle * 7) * 0.02;
        pose.armR[0] = -1.0 - 0.15 * rise + shiver; pose.armR[2] = 0.32;
        pose.armL[0] = -1.2 - 0.15 * rise - shiver; pose.armL[2] = -0.44;
        pose.elbowR[0] = -0.6; pose.elbowL[0] = -0.85;
        pose.chest[0] = -0.12 - 0.1 * rise; pose.head[0] = -0.16 - 0.08 * rise;
        pose.hips[1] = shiver * 0.5;
        bob = 0.018 * rise;
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
