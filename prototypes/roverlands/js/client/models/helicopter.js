// Skylark Helicopter (no reference sheet: an original toy-like utility chopper). Red cabin with a cream belly band, a
// big clear nose bubble, open sides with a back-to-back bench (the two rear riders face out, legs over the sill),
// skids on cross tubes, a tapered tail boom with a fin. `rotor` (four blades + a blur disc once it is up to speed)
// and `tailRotor` spin from st.rotor 0..1 when the physics gives it, else slowly from time (garage).
// The pilot holds a T-handle cyclic (the `steer` node, so the 'wheel' hand targets land on its grips).
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const R = 'red', RD = 'redDark', C = 'cream', K = 'trim';
  const fl = -0.27;                     // cabin floor (feet of a seated Chibi: 0.15 - 0.41)
  const roof = 1.5;                     // head top = 0.15 + 1.13 = 1.28

  // --- cabin -------------------------------------------------------------------------------------------------
  k.box(C, [1.7, 0.22, 2.4], [0, fl - 0.11, 0.35], { bevel: 0.06 });          // floor pan / belly, z -0.85 .. 1.55
  k.box(R, [1.74, 0.08, 2.44], [0, fl + 0.02, 0.35], { bevel: 0.02 });       // sill line
  k.wedge(C, [1.5, 0.3, 0.12, 0.45], [0, fl - 0.22, 1.75]);                  // chin under the bubble
  // rear wall + engine bay behind it
  k.box(R, [1.7, roof - fl, 0.16], [0, (roof + fl) / 2, -0.8], { bevel: 0.05 });
  k.box(R, [1.3, 0.9, 1.1], [0, 0.85, -1.35], { bevel: 0.14 });
  k.box(RD, [1.32, 0.08, 1.12], [0, 0.5, -1.35], { bevel: 0.02 });
  // roof + the four pillars that hold it (the sides stay open)
  k.box(R, [1.66, 0.12, 2.2], [0, roof, 0.3], { bevel: 0.05 });
  k.box(C, [1.68, 0.05, 2.22], [0, roof - 0.08, 0.3], { bevel: 0.01 });
  for (const sx of [1, -1]) {
    k.tube(R, [[sx * 0.8, fl + 0.05, 1.5], [sx * 0.78, 0.6, 1.62], [sx * 0.76, roof - 0.05, 1.3]], 0.05, { seg: 6 });
    k.box(R, [0.08, roof - fl, 0.12], [sx * 0.8, (roof + fl) / 2, -0.7], { bevel: 0.02 });
    k.box(R, [0.06, roof - fl - 0.1, 0.08], [sx * 0.8, (roof + fl) / 2, 0.42], { bevel: 0.02 });   // door pillar
    k.box('tail', [0.04, 0.08, 0.12], [sx * 0.86, roof - 0.04, -0.6], { bevel: 0 });
    // grab rail for the rear riders
    k.tube(K, [[sx * 0.84, 0.55, -0.6], [sx * 0.84, 0.55, 0.32]], 0.018, { seg: 4 });
  }
  // nose bubble: the front of an ellipsoid, see-through
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI, 0.05, Math.PI * 0.62), k.mat('glass'));
  bubble.scale.set(0.8, 1.2, 0.78); bubble.position.set(0, 0.3, 1.25);
  group.add(bubble);
  k.box(K, [1.3, 0.14, 0.36], [0, 0.22, 1.55], { rot: [-0.4, 0, 0], bevel: 0.03 });   // instrument panel
  k.box('lamp', [0.14, 0.06, 0.04], [0, fl - 0.12, 2.18], { bevel: 0 });

  // --- seats ---------------------------------------------------------------------------------------------------
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    if (!s.yaw) {
      k.box('seat', [0.5, 0.1, 0.48], [x, y - 0.05, z + 0.04], { bevel: 0.03 });
      k.box('seat', [0.5, 0.62, 0.1], [x, y + 0.27, z - 0.25], { rot: [-0.1, 0, 0], bevel: 0.03 });
      k.box(K, [0.4, y - 0.1 - fl, 0.4], [x, (y - 0.1 + fl) / 2, z], { bevel: 0.02 });
    }
  }
  // the rear bench: one cushion across the cabin, a backrest down the middle, riders facing out each side
  const rear = def.seats.filter(s => s.yaw);
  if (rear.length) {
    const z = rear[0].p[2], y = rear[0].p[1];
    k.box('seat', [1.3, 0.1, 0.46], [0, y - 0.05, z], { bevel: 0.03 });
    k.box(K, [1.1, y - 0.1 - fl, 0.36], [0, (y - 0.1 + fl) / 2, z], { bevel: 0.02 });
    k.box('seat', [0.12, 0.6, 0.46], [0, y + 0.3, z], { bevel: 0.03 });
  }
  // cyclic: a stick from the floor to a T handle at the pilot's hands
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt || [drv.p[0], drv.p[1] + 0.2, drv.p[2] + 0.34];
  const steer = new THREE.Group(); steer.position.set(...wheelAt);
  const sk = createKit(THREE, opts);
  sk.box(K, [0.32, 0.03, 0.03], [0, 0, 0], { bevel: 0 });
  for (const sx of [1, -1]) sk.cyl('black', 0.022, 0.09, [sx * 0.14, 0, 0], { axis: 'x', seg: 6 });
  sk.finish(steer);
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(K, [[wheelAt[0], fl + 0.02, wheelAt[2] - 0.05], [wheelAt[0], wheelAt[1] - 0.02, wheelAt[2]]], 0.02, { seg: 5 });
  k.tube(K, [[-wheelAt[0], fl + 0.02, wheelAt[2] - 0.05], [-wheelAt[0], wheelAt[1] - 0.06, wheelAt[2] - 0.02]], 0.018, { seg: 5 });   // dual controls

  // --- tail boom + fin + tail rotor --------------------------------------------------------------------------------
  const tail = def.parts?.[0];
  const tEnd = tail ? tail.p[2] - tail.box[2] : -4.2;
  k.cyl(R, 0.12, -1.9 - tEnd, [0, 0.8, (tEnd - 1.9) / 2], { axis: 'z', seg: 8, r2: 0.24 });
  k.box(C, [0.05, 0.04, -1.9 - tEnd - 0.2], [0.17, 0.8, (tEnd - 1.9) / 2], { bevel: 0 });
  k.wedge(R, [0.06, 0.5, 0.15, 0.55], [0, 0.85, tEnd + 0.25], {});              // fin
  k.box(R, [0.9, 0.05, 0.3], [0, 0.82, tEnd + 0.75], { bevel: 0.015 });         // tailplane
  k.box('tail', [0.04, 0.04, 0.04], [0, 1.37, tEnd + 0.12], { bevel: 0 });
  const tailRotor = new THREE.Group(); tailRotor.position.set(0.12, 1.05, tEnd + 0.18); group.add(tailRotor);
  const trk = createKit(THREE, opts);
  trk.cyl('darkMetal', 0.05, 0.08, [0, 0, 0], { axis: 'x', seg: 8 });
  for (const a of [0, Math.PI / 2]) trk.box('black', [0.02, 0.9, 0.08], [0.03, 0, 0], { rot: [a, 0, 0], bevel: 0 });
  trk.finish(tailRotor);

  // --- main rotor ------------------------------------------------------------------------------------------------
  const hubY = roof + 0.42;
  k.cyl('darkMetal', 0.07, hubY - roof, [0, (hubY + roof) / 2, 0.05], { seg: 8 });
  k.cyl(RD, 0.22, 0.14, [0, roof + 0.12, 0.05], { seg: 10, r2: 0.14 });
  const rotor = new THREE.Group(); rotor.position.set(0, hubY, 0.05); group.add(rotor);
  const rk = createKit(THREE, opts);
  rk.cyl('darkMetal', 0.12, 0.12, [0, 0, 0], { seg: 10 });
  rk.cyl('steel', 0.04, 0.12, [0, 0.11, 0], { seg: 6 });
  const bladeLen = 3.5;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2, d = bladeLen / 2 + 0.08;   // kit rotates a part about its own centre, so place it round the mast here
    rk.box('black', [0.24, 0.035, bladeLen], [Math.sin(a) * d, 0.02, Math.cos(a) * d], { rot: [0, a, 0], bevel: 0.01 });
  }
  rk.finish(rotor);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(bladeLen + 0.08, 28).rotateX(-Math.PI / 2), k.mat('blur'));
  disc.position.y = 0.02; disc.castShadow = false; disc.visible = false; rotor.add(disc);

  // --- skids ---------------------------------------------------------------------------------------------------
  const skidY = def.wheels[0].p[1] + 0.06 - def.wheels[0].r + 0.04;   // the tube's centre: bottom on the ground at rest
  const zs = def.wheels.map(w => w.p[2]);
  const zf = Math.max(...zs) + 0.45, zb = Math.min(...zs) - 0.35;
  for (const sx of [1, -1]) {
    const x = sx * Math.abs(def.wheels[0].p[0]);
    k.tube(K, [[x, skidY + 0.16, zf + 0.22], [x, skidY, zf], [x, skidY, zb]], 0.04, { seg: 6 });
    for (const z of [zs[0] + 0.0, Math.min(...zs) + 0.05]) k.tube(K, [[x, skidY, z], [x * 0.9, fl - 0.15, z], [x * 0.55, fl - 0.2, z]], 0.035, { seg: 6 });
  }
  // the physics wheels are the skid feet: give them empty nodes so the shared code finds them
  const wheels = def.wheels.map(w => { const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin); g.position.set(...w.p); group.add(g); return { group: g, spin, base: w.p }; });

  k.finish(group);
  group.add(steer);
  let last = performance.now();
  return {
    group, wheels, steer, rotor, tailRotor,
    update(st) {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      const r = st.rotor;
      const rate = r == null ? 2.2 : r * 38;
      rotor.rotation.y += rate * dt;
      tailRotor.rotation.x += rate * 4.5 * dt;
      disc.visible = r != null && r > 0.55;
      steer.rotation.z = (st.steer || 0) * -0.4;
    },
  };
}
