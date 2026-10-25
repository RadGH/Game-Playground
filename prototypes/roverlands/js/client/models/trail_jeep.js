// Trail Jeep — the open infantry jeep (reference: assets/ref/trail_jeep.webp). Olive tub, flared fenders, blocky
// grille, a pipe roll cage tall enough for Chibi heads, driver + passenger buckets, and a twin-barrel turret on a ring
// behind them for a standing gunner. Ground sits ~0.6 m under the body origin at rest; hubs at y ≈ -0.16.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const B = 'olive', D = 'oliveDark', T = 'trim';

  // --- tub + hood ---------------------------------------------------------------------------------------------
  k.box(B, [1.62, 0.5, 2.9], [0, 0.07, -0.5], { bevel: 0.06 });           // the tub, z -1.95 .. 0.95
  k.box(D, [1.66, 0.1, 2.94], [0, -0.2, -0.5], { bevel: 0.03 });           // the sill / skid line
  k.wedge(B, [1.6, 0.52, 0.44, 1.15], [0, -0.16, 1.5]);                   // hood, a little lower at the nose
  k.box(D, [1.0, 0.04, 0.8], [0, 0.37, 1.45], { bevel: 0.02 });            // raised hood panel
  // tub top rim (the tub is open: the seats sit down inside it)
  k.box(D, [1.62, 0.06, 0.08], [0, 0.34, 0.95]);
  k.box(T, [1.5, 0.3, 0.12], [0, 0.42, 0.9], { bevel: 0.02 });             // dash
  // grille + lamps + bumper
  k.box(T, [1.3, 0.42, 0.08], [0, 0.03, 2.1], { bevel: 0.02 });
  for (let i = -3; i <= 3; i++) k.box(D, [0.08, 0.32, 0.04], [i * 0.14, 0.03, 2.15], { bevel: 0 });
  for (const sx of [1, -1]) {
    k.cyl('lamp', 0.1, 0.06, [sx * 0.52, 0.12, 2.15], { axis: 'z', seg: 8 });
    k.cyl(T, 0.12, 0.05, [sx * 0.52, 0.12, 2.12], { axis: 'z', seg: 8 });
    k.box('amber', [0.08, 0.06, 0.04], [sx * 0.68, -0.07, 2.15], { bevel: 0 });
    k.box('tail', [0.06, 0.18, 0.05], [sx * 0.78, 0.2, -1.97], { bevel: 0 });
    k.box(T, [0.12, 0.08, 0.04], [sx * 0.95, 0.62, 0.78], { bevel: 0.01 });   // mirror
    k.tube(T, [[sx * 0.8, 0.5, 0.82], [sx * 0.92, 0.62, 0.8]], 0.015, { seg: 4 });
  }
  k.tube(T, [[0.85, -0.12, 2.25], [0.85, -0.12, 2.32], [-0.85, -0.12, 2.32], [-0.85, -0.12, 2.25]], 0.05);   // bumper bar
  k.box(T, [1.0, 0.16, 0.14], [0, -0.22, 2.26], { bevel: 0.03 });
  k.box(T, [1.5, 0.12, 0.12], [0, -0.17, -2.0], { bevel: 0.03 });          // rear bumper

  // fenders: angular flares over each wheel
  for (const w of def.wheels) {
    const [x, , z] = w.p, sx = Math.sign(x);
    k.box(D, [0.42, 0.07, 1.12], [sx * 0.92, 0.36, z], { bevel: 0.02 });
    k.box(D, [0.42, 0.07, 0.36], [sx * 0.92, 0.25, z + 0.62], { rot: [0.55, 0, 0], bevel: 0.02 });
    k.box(D, [0.42, 0.07, 0.36], [sx * 0.92, 0.25, z - 0.62], { rot: [-0.55, 0, 0], bevel: 0.02 });
  }

  // --- cabin: two buckets, steering wheel ----------------------------------------------------------------------
  for (const s of def.seats.filter(s => s.pose === 'sit')) {
    const [x, y, z] = s.p;
    k.box('seat', [0.5, 0.12, 0.5], [x, y - 0.06, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.5, 0.62, 0.12], [x, y + 0.26, z - 0.26], { rot: [-0.12, 0, 0], bevel: 0.04 });
  }
  k.box(T, [0.08, 0.2, 0.9], [0, 0.18, 0.2], { bevel: 0.02 });             // centre tunnel
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt || [drv.p[0], 0.72, 0.62];
  const steer = new THREE.Group();
  steer.position.set(...wheelAt);
  steer.rotation.x = -0.9;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.finish(steer);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 12), k.mat(T));
  steer.add(sw);
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.04, wheelAt[2] + 0.06], [wheelAt[0], 0.42, wheelAt[2] + 0.28]], 0.025);

  // --- roll cage (head clearance: seat + 1.25) ----------------------------------------------------------------
  const top = 1.5, C = 'black', rc = 0.045;
  for (const sx of [1, -1]) {
    k.tube(C, [[sx * 0.74, 0.36, 0.86], [sx * 0.72, top - 0.05, 0.45], [sx * 0.72, top, -0.05], [sx * 0.72, top - 0.08, -0.55], [sx * 0.74, 0.36, -0.75]], rc);
    k.tube(C, [[sx * 0.72, top - 0.08, -0.55], [sx * 0.66, 0.78, -1.7], [sx * 0.7, 0.36, -1.9]], rc);   // down to the tail
    k.tube(C, [[sx * 0.74, 0.36, -0.75], [sx * 0.74, 0.36, 0.86]], rc * 0.8);
  }
  k.tube(C, [[0.72, top - 0.05, 0.45], [-0.72, top - 0.05, 0.45]], rc);
  k.tube(C, [[0.72, top - 0.08, -0.55], [-0.72, top - 0.08, -0.55]], rc);
  k.tube(C, [[0.72, top, -0.05], [-0.72, top, -0.05]], rc * 0.8);

  // --- rear deck + turret ring ---------------------------------------------------------------------------------
  const gunSeat = def.seats.find(s => s.gun);
  const piv = gunSeat.gun.pivot;
  k.box(D, [1.5, 0.06, 1.0], [0, 0.4, -1.35], { bevel: 0.02 });
  // the gunner's riser: a step box on the deck with a ring on top, so the gun clears the cage and the front heads
  const gs = gunSeat.p;
  k.box(T, [0.7, gs[1] - 0.43, 0.6], [0, (gs[1] + 0.43) / 2, gs[2]], { bevel: 0.04 });
  k.cyl(T, 0.42, 0.06, [0, gs[1] - 0.02, gs[2] + 0.1], { seg: 16 });
  k.cyl('steel', 0.07, piv[1] - gs[1] - 0.1, [0, (piv[1] + gs[1]) / 2 - 0.08, piv[2]], { seg: 8 });

  const turretYaw = new THREE.Group(); turretYaw.position.set(...piv);
  const turretPitch = new THREE.Group(); turretYaw.add(turretPitch);
  // the gun: two merged meshes (body + barrels) on the pitch node
  const tk = createKit(THREE, opts);
  tk.box('oliveDark', [0.34, 0.28, 0.55], [0, 0, 0.08], { bevel: 0.03 });
  tk.box('oliveDark', [0.62, 0.38, 0.05], [0, 0.04, 0.38], { bevel: 0.01 });
  for (const bx of [0.075, -0.075]) for (const by of [0.06, -0.04]) tk.cyl('darkMetal', 0.032, 0.75, [bx, by, 0.7], { axis: 'z', seg: 6 });
  for (const hx of [0.2, -0.2]) tk.box('darkMetal', [0.04, 0.14, 0.04], [hx, -0.05, -0.25], { bevel: 0 });
  tk.finish(turretPitch);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.01, 1.1); turretPitch.add(muzzle);
  turretYaw.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // --- wheels + suspension -------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 16 });
    t.group.position.set(...w.p);
    group.add(t.group);
    const sx = Math.sign(w.p[0]);
    const mount = [sx * 0.7, 0.3, w.p[2] + (w.p[2] > 0 ? -0.12 : 0.12)];
    const sh = k.shock(mount, [w.p[0] * 0.8, w.p[1], w.p[2]], { r: 0.055 });
    group.add(sh);
    // lower arm (a dark bar from the frame to the hub) re-aimed with the shock
    const arm = k.shock([sx * 0.25, -0.2, w.p[2]], [w.p[0] * 0.85, w.p[1], w.p[2]], { r: 0.035, col: 'black' });
    group.add(arm);
    return { ...t, base: w.p, shock: sh, mount, arm, armFrom: [sx * 0.25, -0.2, w.p[2]] };
  });

  k.finish(group);
  group.add(steer, turretYaw);
  return {
    group, wheels, steer,
    turret: { yaw: turretYaw, pitch: turretPitch, muzzle },
    update(st) {
      // st = { steer, wheels: [{ comp, spin, steer }] } — same as the physics vehicle (local or remote)
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.position.y = y;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        m.shock.set(m.mount, [m.base[0] * 0.8, y, m.base[2]]);
        m.arm.set(m.armFrom, [m.base[0] * 0.85, y, m.base[2]]);
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
    },
  };
}
