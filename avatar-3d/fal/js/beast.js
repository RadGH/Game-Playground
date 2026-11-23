// Four-legged creatures (wolf, drake …). fal has no animation clips for them, so every motion is made here.
//
//   const c = await createFalCharacter('wolf');   // fal.js sends quadruped bodies (catalog skeleton: 'quadruped') here
//   c.play('walk'); c.update(dt)                    // same clip keys as the two-legged bodies; idle walk run attack hit
//                                                   // death are made; the others (ready, cast, punch …) fall back
//
// The skeleton is our own (tools/blender/quad_rig.py), so the bones have known names:
//   root, hips, spine_1..3, neck, head, tail_1..4, leg_fl|fr|bl|br_1..3 (upper, lower, foot), wing_l|r_1..2 (drake)
// Every bone is turned about the creature's own axes as they are in the rest pose (side = X, up = Y, front = +Z),
// so no bone's own roll matters. The tail and wings hang on a simple spring: they lag behind the body's bounce and
// turns and swing back.
import * as THREE from 'three';

const AXIS = { side: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), fwd: new THREE.Vector3(0, 0, 1) };
const LEGS = ['fl', 'fr', 'bl', 'br'];
const ONCE = { attack: 0.9, hit: 0.5, death: 1.3 };
export const BEAST_CLIPS = ['idle', 'walk', 'run', 'attack', 'hit', 'death'];
const FALLBACK = { ready: 'idle', dance: 'idle', cast: 'attack', punch: 'attack' };

export function createBeastMotion(root, bones) {
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Quaternion(); root.getWorldQuaternion(rootInv); rootInv.invert();
  const rest = new Map();
  for (const b of Object.values(bones)) {
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw); pw.premultiply(rootInv);
    const w = new THREE.Vector3(); b.getWorldPosition(w); root.worldToLocal(w);
    rest.set(b, { q: b.quaternion.clone(), p: b.position.clone(), pw, pwInv: pw.clone().invert(), at: w });
  }
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), v = new THREE.Vector3();
  // turn bone b by model-space turns [[axis, angle] …] about its own joint: local = pw⁻¹ · Δ · pw · q0
  function turn(b, turns) {
    const r = b && rest.get(b); if (!r) return;
    q.identity();
    for (const [axis, a] of turns) if (a) { qa.setFromAxisAngle(AXIS[axis], a); q.premultiply(qa); }
    b.quaternion.copy(r.pwInv).multiply(q).multiply(r.pw).multiply(r.q);
  }
  const B = n => bones[n];
  const hips = B('hips'), H = Math.max(0.1, rest.get(hips)?.at.y || 0.3) / 0.6;   // ~ shoulder height scale
  const tail = [1, 2, 3, 4].map(i => B('tail_' + i)).filter(Boolean);
  const spine = [1, 2, 3].map(i => B('spine_' + i)).filter(Boolean);
  const wings = ['l', 'r'].map(s => ({ s: s === 'l' ? 1 : -1, bones: [1, 2].map(i => B(`wing_${s}_${i}`)).filter(Boolean) })).filter(w => w.bones.length);

  function pose(name, t) {
    const P = { legs: {}, bob: 0, pitch: 0, roll: 0, fwd: 0, drop: 0, neck: 0, head: 0, look: 0, bend: 0, tail: 0, wag: 0, wing: 0 };
    for (const k of LEGS) P.legs[k] = [0, 0];
    if (name === 'idle') {
      const br = Math.sin(t * 2.4);                       // breathing
      P.bob = br * 0.008; P.bend = br * 0.02; P.neck = 0.04 + br * 0.03; P.look = Math.sin(t * 0.55) * 0.25;
      P.tail = 0.1; P.wag = 0.12; P.wing = 0.03 + br * 0.04;
    } else if (name === 'walk' || name === 'run') {
      const run = name === 'run', ph = t * (run ? 2.4 : 1.25) * Math.PI * 2;
      // walk: one foot after another (left hind, left fore, right hind, right fore); run: a bounding gallop
      const off = run ? { bl: 0, br: 0.1, fl: 0.5, fr: 0.6 } : { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 };
      const amp = run ? 0.7 : 0.38;
      for (const k of LEGS) {
        const a = ph - off[k] * Math.PI * 2;
        P.legs[k] = [Math.sin(a) * amp, Math.max(0, Math.cos(a)) * (run ? 1.1 : 0.75)];   // lift the foot as it travels forward
      }
      P.bob = (run ? Math.sin(ph) * 0.05 : Math.abs(Math.sin(ph * 2)) * 0.015);
      P.pitch = run ? Math.sin(ph) * 0.07 : 0; P.bend = run ? Math.sin(ph) * 0.2 : Math.sin(ph * 2) * 0.02;
      P.neck = run ? 0.12 : 0.04 + Math.sin(ph * 2) * 0.05; P.look = run ? 0 : Math.sin(ph) * 0.06;
      P.tail = run ? 0.35 : 0.15; P.wag = run ? 0.08 : 0.15; P.wing = run ? 0.12 : 0.04;
    } else if (name === 'attack') {
      // crouch, spring forward with the jaws, settle back
      const k = Math.min(1, t / ONCE.attack);
      const crouch = k < 0.3 ? k / 0.3 : Math.max(0, 1 - (k - 0.3) / 0.15);
      const lunge = k < 0.3 ? 0 : k < 0.5 ? (k - 0.3) / 0.2 : Math.max(0, 1 - (k - 0.5) / 0.5);
      P.drop = crouch * 0.06; P.fwd = lunge * 0.22; P.pitch = crouch * 0.1 - lunge * 0.12;
      P.neck = crouch * 0.25 - lunge * 0.3; P.head = lunge > 0.6 ? (lunge - 0.6) * 1.2 : 0;   // snap down at full reach
      for (const s of ['fl', 'fr']) P.legs[s] = [lunge * 0.55 - crouch * 0.15, crouch * 0.5 + lunge * 0.3];
      for (const s of ['bl', 'br']) P.legs[s] = [-lunge * 0.4 + crouch * 0.2, crouch * 0.7];
      P.tail = 0.25 + lunge * 0.3; P.wing = lunge * 0.35;
    } else if (name === 'hit') {
      const k = Math.min(1, t / ONCE.hit), s = Math.sin(k * Math.PI) * (1 - 0.3 * k);
      P.fwd = -s * 0.08; P.pitch = -s * 0.12; P.neck = -s * 0.35; P.look = s * 0.35; P.roll = s * 0.08;
      for (const x of LEGS) P.legs[x] = [-s * 0.12, s * 0.25];
      P.tail = -s * 0.2; P.wing = s * 0.3;
    } else if (name === 'death') {
      const k = Math.min(1, t / ONCE.death), e = k * k * (3 - 2 * k);
      P.roll = e * Math.PI / 2 * 0.95; P.drop = e * 0.55; P.neck = -e * 0.2; P.look = e * 0.3;
      for (const x of LEGS) P.legs[x] = [(x[0] === 'f' ? 0.35 : -0.35) * e, 0.2 * e];
      P.tail = -e * 0.1; P.wag = 0; P.wing = -e * 0.2;
    }
    return P;
  }
  function mix(a, b, w) {
    if (!a || w >= 1) return b;
    const o = { legs: {} };
    for (const k of Object.keys(b)) if (k !== 'legs') o[k] = a[k] + (b[k] - a[k]) * w;
    for (const k of LEGS) o.legs[k] = [0, 1].map(i => a.legs[k][i] + (b.legs[k][i] - a.legs[k][i]) * w);
    return o;
  }

  const spring = { y: 0, vy: 0, p: 0, vp: 0 };
  let lastLook = 0, lastBob = 0, clip = 'idle', t = 0, clock = 0, from = null, last = null, blend = 1, fade = 0.25;
  function apply(P, dt) {
    const r = rest.get(hips);
    if (r) {   // body: lift / crouch / lunge in model space, pitch and roll
      v.set(0, (P.bob - P.drop) * H, P.fwd * H).applyQuaternion(r.pwInv);
      hips.position.copy(r.p).add(v);
      turn(hips, [['side', P.pitch], ['fwd', P.roll]]);
    }
    for (const k of LEGS) {
      const [swing, lift] = P.legs[k];
      turn(B(`leg_${k}_1`), [['side', -swing - lift * 0.35]]);   // swing forward = foot toward +Z
      turn(B(`leg_${k}_2`), [['side', lift]]);                      // fold the lower leg as the foot lifts
      turn(B(`leg_${k}_3`), [['side', swing * 0.4 - lift * 0.4]]);  // keep the foot roughly flat
    }
    spine.forEach(b => turn(b, [['side', P.bend / spine.length], ['up', P.look * 0.15]]));
    turn(B('neck'), [['side', P.neck], ['up', P.look * 0.5]]);
    turn(B('head'), [['side', P.head], ['up', P.look * 0.35]]);
    // spring: chases the body's sideways look and its bounce, with a lag
    const dl = (P.look - lastLook) / Math.max(dt, 1e-3), db = (P.bob - lastBob) / Math.max(dt, 1e-3);
    lastLook = P.look; lastBob = P.bob;
    spring.vy += (-spring.y * 30 - spring.vy * 6 - dl * 1.5) * dt; spring.y += spring.vy * dt;
    spring.vp += (-spring.p * 30 - spring.vp * 6 - db * 4) * dt; spring.p += spring.vp * dt;
    const f = clip === 'run' ? 7 : clip === 'walk' ? 4.5 : 1.8;
    tail.forEach((b, i) => {
      const w = (i + 1) / tail.length;
      turn(b, [['side', -(P.tail / tail.length) + spring.p * 0.4 * w], ['up', (Math.sin(clock * f - i * 0.7) * P.wag + spring.y) * (0.4 + w)]]);
    });
    for (const wg of wings) wg.bones.forEach((b, i) => turn(b, [['fwd', wg.s * (P.wing + spring.p * 0.6) * (i ? 0.5 : 1)]]));
  }
  return {
    clips: BEAST_CLIPS,
    play(name, f = 0.25) {
      name = BEAST_CLIPS.includes(name) ? name : FALLBACK[name] || 'idle';
      from = last; fade = f; blend = f > 0 && from ? 0 : 1; clip = name; t = 0;
    },
    get clip() { return clip; },
    update(dt) {
      t += dt; clock += dt;
      if (blend < 1) blend = Math.min(1, blend + dt / fade);
      const P = mix(from, pose(clip, t), blend);   // one-shot clips hold their last pose, like the bipeds
      apply(P, dt); last = P;
    },
  };
}
