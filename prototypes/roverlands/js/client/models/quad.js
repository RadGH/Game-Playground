// Scramble Quad (reference: assets/ref/quad.webp). Bright lime plastics over a black frame: wide fender plates over
// four fat block-tread tyres, black tube racks front and back (where the rack colliders are), a two-step seat for the
// rider and a pillion, footboards between the wheels, a grille guard with two angular lamps, and visible coil struts.
// The bars turn with the front wheels; the riders' hands land on the grips at the seat's barsAt.
// Ground sits ~0.39 m under the body origin at rest; hubs at y ≈ -0.09.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const L = '#c4da1f', LD = '#9aae12', K = 'black', T = 'trim';
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const fz = fw.p[2], rz = rw.p[2];
  const drv = def.seats.find(s => s.role === 'driver'), pil = def.seats.find(s => s.role !== 'driver');
  const bars = drv.barsAt;

  // --- frame, engine, footboards ------------------------------------------------------------------------------
  k.box(K, [0.5, 0.2, 1.5], [0, -0.04, 0], { bevel: 0.03 });                        // frame core (inside the chassis box)
  k.box('engine', [0.34, 0.26, 0.4], [0, 0.14, 0.02], { bevel: 0.04 });
  k.cyl('engine', 0.1, 0.3, [0, 0.12, 0.0], { axis: 'x', seg: 10 });
  k.tube('chrome', [[0.12, 0.1, -0.12], [0.18, 0.2, -0.45], [0.2, 0.3, -0.8]], 0.03, { seg: 6 });   // exhaust
  k.cyl('steel', 0.045, 0.16, [0.2, 0.31, -0.86], { axis: 'z', seg: 8 });
  const footY = drv.p[1] - 0.6 - 0.02;                                            // the ride pose stands 0.6 under the hips
  for (const sx of [1, -1]) {
    k.box(K, [0.26, 0.04, 0.46], [sx * 0.32, footY, -0.08], { bevel: 0.01 });
    for (let i = 0; i < 4; i++) k.box(T, [0.24, 0.02, 0.025], [sx * 0.32, footY + 0.03, -0.26 + i * 0.12], { bevel: 0 });
    k.box(L, [0.06, 0.2, 0.62], [sx * 0.24, 0.3, -0.16], { bevel: 0.03 });                       // side panels under the seat
  }

  // --- front: hood, fenders, lamps, grille guard ----------------------------------------------------------------
  k.wedge(L, [0.78, 0.13, 0.04, 0.66], [0, 0.29, fz]);                              // hood, under the front rack
  k.box(L, [0.66, 0.26, 0.2], [0, 0.2, fz + 0.36], { rot: [-0.3, 0, 0], bevel: 0.05 });   // nose
  for (const sx of [1, -1]) {
    k.box('lamp', [0.17, 0.08, 0.05], [sx * 0.19, 0.27, fz + 0.47], { rot: [-0.3, 0.2 * sx, 0], bevel: 0.015 });
    k.box(K, [0.21, 0.11, 0.04], [sx * 0.19, 0.27, fz + 0.455], { rot: [-0.3, 0.2 * sx, 0], bevel: 0.01 });
  }
  k.box(K, [0.3, 0.14, 0.04], [0, 0.12, fz + 0.48], { bevel: 0.01 });             // grille
  for (const sx of [1, -1]) k.tube(K, [[sx * 0.2, -0.05, fz + 0.3], [sx * 0.26, 0.0, fz + 0.58], [sx * 0.26, 0.3, fz + 0.56], [sx * 0.2, 0.36, fz + 0.44]], 0.032, { seg: 6 });
  for (const y of [0.04, 0.24]) k.box(K, [0.56, 0.05, 0.05], [0, y, fz + 0.575], { bevel: 0.01 });

  // fenders: a flat plate over each wheel with a nose and tail turned down (the tyre tops out ~0.38 at full bump)
  const fender = (w, x, z) => {
    const sx = Math.sign(x), wid = w.w + 0.1, half = w.r + 0.06;
    k.box(L, [wid, 0.09, half * 1.3], [x + sx * 0.02, 0.425, z], { bevel: 0.02 });
    k.box(L, [wid, 0.06, 0.24], [x + sx * 0.02, 0.35, z + half * 0.65 + 0.08], { rot: [0.7, 0, 0], bevel: 0.02 });
    k.box(L, [wid, 0.06, 0.24], [x + sx * 0.02, 0.35, z - half * 0.65 - 0.08], { rot: [-0.7, 0, 0], bevel: 0.02 });
    k.box(LD, [0.05, 0.16, half * 1.3], [x + sx * (wid / 2 + 0.02), 0.39, z], { bevel: 0.01 });   // edge
  };
  for (const w of def.wheels) fender(w, w.p[0], w.p[2]);
  k.box(L, [0.86, 0.12, 0.5], [0, 0.36, rz + 0.06], { bevel: 0.04 });            // rear deck between the fenders
  k.box('tail', [0.16, 0.06, 0.04], [0, 0.32, rz - 0.31], { bevel: 0.01 });
  k.box(K, [0.6, 0.08, 0.06], [0, 0.04, rz - 0.3], { bevel: 0.01 });             // rear bumper / hitch bar

  // --- racks: black tube frames exactly over the two rack colliders ---------------------------------------------
  for (const part of def.parts) {
    const [hx, , hz] = part.box, [, y, z] = part.p, top = y + 0.03;
    const loop = [[hx, top, z + hz], [-hx, top, z + hz], [-hx, top, z - hz], [hx, top, z - hz]];
    k.tube(K, loop, 0.022, { seg: 5, closed: true });
    k.tube(K, [[hx, top, z + hz], [hx, top + 0.07, z + hz], [-hx, top + 0.07, z + hz], [-hx, top, z + hz]], 0.02, { seg: 5 });
    for (let i = 1; i < 4; i++) k.box(K, [hx * 2, 0.02, 0.025], [0, top - 0.01, z - hz + (i / 4) * hz * 2], { bevel: 0 });
  }

  // --- seat (rider low, pillion one step up) + the tank under the bars ------------------------------------------
  const sy = drv.p[1] - 0.06, py = pil.p[1] - 0.06;
  k.box('seat', [0.34, 0.1, 0.5], [0, sy - 0.05, drv.p[2] - 0.02], { bevel: 0.04 });
  k.box('seat', [0.36, py - 0.36, 0.34], [0, (py + 0.36) / 2, pil.p[2] - 0.04], { bevel: 0.04 });
  k.box(L, [0.34, 0.12, 0.98], [0, sy - 0.14, (drv.p[2] + pil.p[2]) / 2 - 0.02], { bevel: 0.03 });   // seat base
  k.box(L, [0.4, 0.2, 0.34], [0, 0.44, bars[2] - 0.12], { rot: [0.25, 0, 0], bevel: 0.05 });      // tank
  k.box(K, [0.22, 0.04, 0.16], [0, 0.55, bars[2] - 0.12], { rot: [0.25, 0, 0], bevel: 0.01 });

  // --- steering: column, bars group (grips at the seat's barsAt) ------------------------------------------------
  const head = [0, 0.5, bars[2] + 0.04];
  const steer = new THREE.Group(); steer.position.set(...head);
  const barNode = new THREE.Group(); barNode.position.set(0, bars[1] - 0.035 - head[1], bars[2] + 0.02 - head[2]);
  steer.add(barNode);
  const sk = createKit(THREE, opts);
  sk.cyl(K, 0.03, barNode.position.y, [0, barNode.position.y / 2, -0.01], { seg: 6 });
  sk.box(K, [0.2, 0.08, 0.1], [0, barNode.position.y - 0.02, -0.02], { bevel: 0.02 });        // bar pad
  sk.finish(steer);
  const bk = createKit(THREE, opts);
  bk.tube('steel', [[0.33, 0.035, -0.02], [0.16, 0.0, 0.0], [-0.16, 0.0, 0.0], [-0.33, 0.035, -0.02]], 0.017, { seg: 5 });
  for (const sx of [1, -1]) {
    bk.cyl(K, 0.026, 0.12, [sx * 0.29, 0.035, -0.02], { axis: 'x', seg: 6 });
    bk.box(K, [0.06, 0.05, 0.08], [sx * 0.2, 0.02, 0.02], { bevel: 0.01 });                   // hand guard / lever box
  }
  bk.finish(barNode);
  k.tube(K, [[0, 0.2, head[2] + 0.06], [0, head[1], head[2]]], 0.03, { seg: 6 });

  // --- wheels + struts --------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 14, rimCol: T, rim: 0.56 });
    t.group.position.set(...w.p);
    group.add(t.group);
    const sx = Math.sign(w.p[0]), front = w.p[2] > 0;
    const mount = [sx * 0.2, 0.3, w.p[2] + (front ? -0.06 : 0.1)];
    const hubIn = x => [x * 0.72, w.p[1], w.p[2]];
    const sh = k.shock(mount, hubIn(w.p[0]), { r: 0.038, col: 'steel' });
    const armFrom = [sx * 0.2, -0.05, w.p[2]];
    const arm = k.shock(armFrom, hubIn(w.p[0]), { r: 0.026, col: K });
    group.add(sh, arm);
    return { ...t, base: w.p, shock: sh, mount, arm, armFrom };
  });

  k.finish(group);
  group.add(steer);
  return {
    group, wheels, steer,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.position.y = y;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        const hub = [m.base[0] * 0.72, y, m.base[2]];
        m.shock.set(m.mount, hub);
        m.arm.set(m.armFrom, hub);
      });
      steer.rotation.y = st.wheels[0]?.steer || 0;
    },
  };
}
