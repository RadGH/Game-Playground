// Driftwing Hover Tank (reference: assets/ref/hover_tank.webp). White and navy hull, four glowing hover pods, a
// raked canopy behind an open cockpit, twin blue-lit cannons up front. The pilot flies it and aims the guns.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const W = 'hullWhite', N = 'navy';
  k.box(W, [2.0, 0.55, 3.6], [0, 0.0, -0.1], { bevel: 0.12 });
  k.wedge(W, [1.8, 0.5, 0.12, 1.2], [0, -0.25, 2.2], {});                   // long nose
  k.box(N, [1.2, 0.08, 1.6], [0, 0.3, 1.0], { bevel: 0.03 });
  k.box(N, [2.1, 0.12, 0.5], [0, 0.05, -1.95], { bevel: 0.03 });
  k.box(N, [0.9, 0.5, 0.9], [0, 0.45, 0.35], { bevel: 0.06 });              // cockpit tub
  // the pilot's seat follows the seat data (Chibi 2.6 fit); the raised canopy behind clears a seated adult's head
  const ps = def.seats[0].p;
  k.box('seat', [0.55, 0.12, 0.5], [0, ps[1] - 0.07, ps[2] + 0.02], { bevel: 0.03 });
  k.box('seat', [0.55, 0.65, 0.12], [0, ps[1] + 0.25, ps[2] - 0.28], { rot: [-0.15, 0, 0], bevel: 0.03 });
  k.box('glass', [0.85, 0.85, 0.06], [0, 1.0, ps[2] - 0.5], { rot: [-0.25, 0, 0], bevel: 0.02 });   // canopy (open, behind)
  k.box(N, [0.9, 0.06, 0.08], [0, 1.41, ps[2] - 0.6], { bevel: 0 });
  // the pilot's yoke (the `steer` node at the seat's wheelAt, so the 'wheel' hands land on its two grips)
  const wa = def.seats[0].wheelAt || [0, ps[1] + 0.29, ps[2] + 0.4];
  const steer = new THREE.Group(); steer.position.set(...wa); steer.rotation.x = -0.5;
  const yk = createKit(THREE, opts);
  yk.box(N, [0.34, 0.04, 0.05], [0, 0, 0], { bevel: 0.01 });
  for (const sx of [1, -1]) yk.cyl('black', 0.024, 0.1, [sx * 0.15, 0, 0], { axis: 'x', seg: 6 });
  yk.finish(steer);
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(N, [[wa[0], wa[1] - 0.02, wa[2] + 0.02], [wa[0], 0.3, wa[2] + 0.2]], 0.03, { seg: 5 });
  // hover pods: a chunky housing and a glowing ring under each pad position
  for (const w of def.wheels) {
    const [x, y, z] = w.p, sx = Math.sign(x);
    k.box(W, [0.75, 0.55, 1.1], [x + sx * 0.12, y + 0.42, z], { bevel: 0.1 });
    k.box(N, [0.78, 0.12, 1.12], [x + sx * 0.12, y + 0.18, z], { bevel: 0.03 });
    k.box('glow', [0.06, 0.08, 0.6], [x + sx * 0.5, y + 0.35, z], { bevel: 0 });
  }
  const pads = def.wheels.map(w => {
    const g = new THREE.Group(); g.position.set(...w.p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w.r * 0.85, 0.06, 6, 20).rotateX(Math.PI / 2), k.mat('glow'));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(w.r * 0.8, 20).rotateX(Math.PI / 2), k.mat('glowSoft'));
    disc.position.y = -0.01;
    g.add(ring, disc); group.add(g);
    return { group: g, base: w.p };
  });
  const drv = def.seats.find(s => s.gun);
  const piv = drv.gun.pivot;
  const turretYaw = new THREE.Group(); turretYaw.position.set(...piv);
  const tk = createKit(THREE, opts);
  tk.box(W, [0.7, 0.4, 0.9], [0, 0, 0.1], { bevel: 0.08 });
  tk.box(N, [0.72, 0.1, 0.5], [0, 0.18, -0.15], { bevel: 0.02 });
  tk.finish(turretYaw);
  const turretPitch = new THREE.Group(); turretPitch.position.set(0, 0, 0.45); turretYaw.add(turretPitch);
  const gk = createKit(THREE, opts);
  for (const by of [0.09, -0.09]) { gk.cyl(N, 0.06, 1.3, [0, by, 0.65], { axis: 'z', seg: 8 }); gk.box('glow', [0.05, 0.05, 0.6], [0.07, by, 0.75], { bevel: 0 }); gk.cyl('glow', 0.07, 0.08, [0, by, 1.32], { axis: 'z', seg: 8 }); }
  gk.finish(turretPitch);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 1.4); turretPitch.add(muzzle);
  k.finish(group);
  group.add(turretYaw, steer);
  let t = 0;
  return {
    group, wheels: pads, steer, turret: { yaw: turretYaw, pitch: turretPitch, muzzle },
    update(st) {
      t += 0.016;
      steer.rotation.z = (st.steer || 0) * -0.5;
      st.wheels.forEach((w, i) => { const m = pads[i]; if (m) { m.group.position.y = m.base[1] + (w.comp ?? 0.3) - 0.05 - 0.4; m.group.scale.setScalar(1 + Math.sin(t * 9 + i) * 0.04); } });
    },
  };
}
