// Lugmore Forklift (reference: assets/ref/forklift.webp). Yellow body with a big rounded counterweight at the back,
// black overhead guard on four posts, a two-stage black mast, smooth solid tyres. The fork carriage is its own node
// (`forks`): its origin is the physics anchor (def.forks.anchor) at fork height 0, and update() lifts it to
// anchor[1] + st.forks (the session may also set forks.position.y itself — the two agree). The inner mast rises
// with the carriage once it passes the outer mast's reach.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const Y = 'yellow', YD = 'yellowDark', K = 'black', T = 'trim';
  const F = def.forks;
  const [ax, ay, az] = F.anchor;
  const floor = -0.08;                         // operator's floor (the Chibi's feet: hips 0.35 - 0.41)

  // --- body: low front step, raised sides, the counterweight ---------------------------------------------------
  k.box(Y, [1.12, 0.32, 1.7], [0, -0.22, -0.22], { bevel: 0.06 });            // lower tub, z -1.07 .. 0.63
  k.box(K, [1.0, 0.04, 0.8], [0, floor - 0.02, 0.05], { bevel: 0.01 });      // floor mat
  for (const sx of [1, -1]) {
    k.wedge(Y, [0.16, 0.38, 0.12, 1.05], [sx * 0.48, -0.06, -0.3], {});       // side wall rising toward the back
    k.box(YD, [0.04, 0.14, 0.5], [sx * 0.565, 0.05, -0.55], { bevel: 0.01 });  // side vent
  }
  k.box(Y, [1.16, 0.72, 0.5], [0, 0.04, -0.92], { bevel: 0.12 });             // counterweight
  k.box(Y, [1.1, 0.14, 0.62], [0, 0.42, -0.82], { bevel: 0.05 });             // its top hump (seat sits in front)
  k.box(T, [1.0, 0.12, 0.1], [0, -0.3, -1.19], { bevel: 0.02 });              // rear bumper
  for (const sx of [1, -1]) k.box('tail', [0.1, 0.06, 0.03], [sx * 0.4, 0.22, -1.18], { bevel: 0 });
  // front cowl + dash
  k.box(K, [1.0, 0.5, 0.26], [0, 0.03, 0.55], { bevel: 0.05 });
  k.box(K, [0.6, 0.12, 0.2], [0, 0.32, 0.45], { rot: [-0.35, 0, 0], bevel: 0.03 });
  // levers on the dash
  for (let i = 0; i < 3; i++) k.tube(T, [[0.18 + i * 0.07, 0.34, 0.42], [0.2 + i * 0.07, 0.52, 0.36]], 0.012, { seg: 4 });
  // fenders over the front wheels
  for (const w of def.wheels.filter(w => w.p[2] > 0)) {
    const sx = Math.sign(w.p[0]);
    k.box(K, [w.w + 0.06, 0.06, 0.66], [w.p[0], w.p[1] + w.r + 0.08, w.p[2]], { bevel: 0.02 });
    k.box(K, [w.w + 0.06, 0.28, 0.06], [w.p[0], w.p[1] + w.r - 0.06, w.p[2] - 0.32], { bevel: 0.01 });
    void sx;
  }

  // --- seat ------------------------------------------------------------------------------------------------------
  const seat = def.seats[0];
  const [sx0, sy, sz] = seat.p;
  k.box(Y, [0.5, sy - 0.04 - floor, 0.44], [sx0, (sy - 0.04 + floor) / 2, sz - 0.02], { bevel: 0.03 });   // seat box
  k.box('seat', [0.48, 0.1, 0.46], [sx0, sy - 0.05, sz + 0.02], { bevel: 0.04 });
  k.box('seat', [0.46, 0.5, 0.1], [sx0, sy + 0.24, sz - 0.24], { rot: [-0.12, 0, 0], bevel: 0.04 });

  // --- steering wheel -----------------------------------------------------------------------------------------
  const wheelAt = seat.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -1.0;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.26, 0.022, 0.02], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.03, 0.06, [0.1, 0.03, 0], { seg: 6 });                        // spinner knob
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.02, 5, 12), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.05, wheelAt[2] + 0.05], [wheelAt[0], 0.3, 0.42]], 0.025);

  // --- overhead guard: four posts, a frame and slats (head top = seat + 1.13 = 1.48) --------------------------
  const top = 1.98, gx = 0.5, zf = 0.5, zb = -0.8;
  for (const s of [1, -1]) {
    k.tube(K, [[s * gx, 0.0, zf - 0.02], [s * gx, top, zf + 0.04]], 0.04, { seg: 6 });
    k.tube(K, [[s * gx, 0.46, zb], [s * gx, top, zb + 0.06]], 0.04, { seg: 6 });
    k.box(K, [0.08, 0.06, zf - zb + 0.12], [s * gx, top, (zf + zb) / 2 + 0.04], { bevel: 0.01 });
    k.box('lamp', [0.08, 0.08, 0.04], [s * gx, 1.55, zf + 0.07], { bevel: 0.01 });
  }
  for (let i = 0; i <= 5; i++) k.box(K, [1.08, 0.05, 0.05], [0, top + 0.01, zb + 0.06 + i * ((zf - zb) / 5)], { bevel: 0 });

  // --- mast: outer channels fixed, the inner pair rises with the carriage past ~1.1 m --------------------------
  const mx = 0.35, mz = def.parts?.[0]?.p?.[2] ?? 0.85, mTop = 2.2;
  for (const s of [1, -1]) k.box(K, [0.1, mTop + 0.35, 0.12], [s * mx, (mTop - 0.35) / 2, mz], { bevel: 0.015 });
  k.box(K, [0.8, 0.1, 0.12], [0, mTop - 0.05, mz], { bevel: 0.015 });
  k.box(K, [0.8, 0.08, 0.1], [0, 0.6, mz], { bevel: 0.015 });
  for (const s of [1, -1]) k.tube('steel', [[s * 0.3, 0.1, 0.62], [s * 0.32, 0.4, mz - 0.06]], 0.03, { seg: 6 });   // tilt rams
  const inner = new THREE.Group(); inner.position.set(0, 0, mz + 0.08); group.add(inner);
  const ik = createKit(THREE, opts);
  for (const s of [1, -1]) ik.box(T, [0.08, 2.2, 0.06], [s * 0.27, 1.05, 0], { bevel: 0.01 });
  ik.box(T, [0.62, 0.08, 0.06], [0, 2.12, 0], { bevel: 0.01 });
  for (const s of [1, -1]) ik.cyl('steel', 0.035, 1.6, [s * 0.2, 0.8, -0.03], { seg: 8 });   // the lift rams
  ik.finish(inner);

  // --- fork carriage (origin = the anchor at fork height 0) ----------------------------------------------------
  const forks = new THREE.Group(); forks.position.set(ax, ay, az);
  const fk = createKit(THREE, opts);
  const [phx, phy] = F.plateHalf;
  for (const s of [1, -1]) fk.box(K, [0.08, phy * 2, 0.07], [s * (phx - 0.04), phy, -0.03], { bevel: 0.01 });
  for (const y of [0.12, phy * 2 - 0.08]) fk.box(K, [phx * 2, 0.1, 0.07], [0, y, -0.03], { bevel: 0.01 });
  for (let i = -2; i <= 2; i++) fk.box(K, [0.04, phy * 2 - 0.1, 0.03], [i * 0.18, phy, -0.03], { bevel: 0 });   // load guard
  const [thx, thy, thz] = F.tineHalf;
  for (const x of F.tines) {
    fk.box(T, [thx * 2, thy * 2, thz * 2], [x, 0, thz], { bevel: 0.01 });         // the tine itself (= its collider)
    fk.box(T, [thx * 2, 0.5, 0.06], [x, 0.25, 0.02], { bevel: 0.01 });            // heel up the plate
  }
  fk.finish(forks);

  // --- wheels ------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', rimCol: 'rim', rim: 0.5 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  k.finish(group);
  group.add(steer, forks);
  return {
    group, wheels, steer, forks,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.6;
      const h = Math.max(0, st.forks ?? 0);
      forks.position.y = ay + h;
      inner.position.y = Math.max(0, h - 1.1);
    },
  };
}
