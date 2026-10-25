// Ironback Tank (reference: assets/ref/tank.webp). Sand hull with an angled nose, dark tracks over six road wheels a
// side, an octagonal turret with a long gun and a hatch the driver stands in. One person drives (tank controls) and
// aims the turret with the camera; two more can ride on the deck.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const S = 'sand', D = 'sandDark', T = 'track';
  // hull
  k.box(S, [2.3, 0.62, 4.6], [0, 0.05, -0.05], { bevel: 0.08 });
  k.wedge(S, [2.3, 0.62, 0.2, 0.9], [0, -0.26, 2.6], {});                 // sloped nose
  k.box(D, [2.5, 0.08, 4.7], [0, 0.38, -0.05], { bevel: 0.02 });            // track guards
  k.box(S, [1.9, 0.12, 4.0], [0, 0.43, -0.15], { bevel: 0.03 });            // deck
  for (const [x, z] of [[0.8, 1.6], [-0.8, 1.6], [0.8, -1.9], [-0.8, -1.9], [0, -2.25]]) k.box(D, [0.3, 0.12, 0.3], [x, 0.53, z], { bevel: 0.03 });
  for (const sx of [1, -1]) { k.cyl(D, 0.09, 0.08, [sx * 1.0, 0.25, 2.2], { axis: 'z', seg: 6 }); k.cyl('lamp', 0.07, 0.04, [sx * 0.85, 0.3, 2.32], { axis: 'z', seg: 8 }); }
  // tracks: an outline of chunky links around the road wheels
  for (const sx of [1, -1]) {
    const x = sx * 1.25;
    for (let i = 0; i < 18; i++) { const z = -2.45 + i * 0.29; k.box(T, [0.52, 0.1, 0.24], [x, -0.83, z], { bevel: 0.02 }); k.box(T, [0.52, 0.08, 0.24], [x, 0.0, z], { bevel: 0.02 }); }
    k.box(T, [0.52, 0.85, 0.24], [x, -0.42, 2.55], { rot: [0.35, 0, 0], bevel: 0.03 });
    k.box(T, [0.52, 0.85, 0.24], [x, -0.42, -2.6], { rot: [-0.35, 0, 0], bevel: 0.03 });
    k.cyl(D, 0.3, 0.46, [x, -0.25, 2.35], { axis: 'x', seg: 10 });          // drive sprocket
    k.cyl(D, 0.26, 0.46, [x, -0.25, -2.4], { axis: 'x', seg: 10 });         // idler
  }
  // road wheels follow the physics wheels' suspension
  const wheels = def.wheels.map(w => {
    const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
    const wk = createKit(THREE, opts);
    wk.cyl(S, w.r, w.w * 0.8, [0, 0, 0], { axis: 'x', seg: 12 });
    wk.cyl(D, w.r * 0.45, w.w * 0.86, [0, 0, 0], { axis: 'x', seg: 8 });
    wk.box(D, [w.w * 0.88, w.r * 0.3, 0.06], [0, w.r * 0.55, 0], { bevel: 0 });
    wk.finish(spin);
    g.position.set(...w.p);
    group.add(g);
    return { group: g, spin, base: w.p };
  });
  // turret + gun
  const drv = def.seats.find(s => s.gun);
  const piv = drv.gun.pivot;
  const turretYaw = new THREE.Group(); turretYaw.position.set(piv[0], piv[1] - 0.55, piv[2]);
  const tk = createKit(THREE, opts);
  tk.cyl(S, 0.95, 0.62, [0, 0.31, 0], { seg: 8, r2: 0.82 });
  tk.box(D, [1.3, 0.1, 0.9], [0, 0.66, -0.15], { bevel: 0.03 });
  tk.cyl(D, 0.36, 0.08, [0, 0.66, -0.25], { seg: 10 });                     // hatch ring
  tk.box(S, [0.55, 0.06, 0.55], [0.32, 0.92, -0.62], { rot: [0.9, 0, 0], bevel: 0.02 });   // open lid
  for (const sx of [1, -1]) tk.cyl(D, 0.09, 0.08, [sx * 0.92, 0.32, 0.1], { axis: 'x', seg: 6 });
  tk.box(D, [0.5, 0.4, 0.3], [0, 0.3, 0.9], { bevel: 0.05 });               // mantlet
  tk.finish(turretYaw);
  const turretPitch = new THREE.Group(); turretPitch.position.set(0, 0.32, 1.0); turretYaw.add(turretPitch);
  const gk = createKit(THREE, opts);
  gk.cyl('gunDark', 0.1, 2.6, [0, 0, 1.3], { axis: 'z', seg: 10 });
  gk.cyl('gunDark', 0.15, 0.38, [0, 0, 2.6], { axis: 'z', seg: 8 });
  gk.finish(turretPitch);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 2.85); turretPitch.add(muzzle);
  k.finish(group);
  group.add(turretYaw);
  return {
    group, wheels, turret: { yaw: turretYaw, pitch: turretPitch, muzzle, base: turretYaw.position.clone() },
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.spin.rotation.x = w.spin || 0;
      });
    },
  };
}
