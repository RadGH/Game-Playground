// Big Sky Lifter (reference: assets/ref/cargo_plane.webp). A four-engine high-wing transport in slate blue-grey with
// darker panels: an octagon-section fuselage around a HOLLOW hold (floor = the chassis top at y 0, walls and roof on
// their colliders, ribs, roller tracks and fold-down webbing benches along both walls), an upswept tail with a T-tail
// on the boom and fin colliders, and the rear RAMP (`ramp`, hinged at the floor's back edge, z -5.75): shut it is
// swung up into the tail, open it is a 23 deg slope to the ground — eased between the two from st.acts.door_ramp, the
// same two poses as its colliders. Cockpit up front on its own floor (0.6) under glass, two seats and yokes (`steer`
// = the pilot's). Four nacelles under the wing with six-blade props (spun from st.lever), sponsons over the six-wheel
// main gear, twin nose wheels. A dark radome and wing tips. No markings.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const B = '#6d7f93', BD = '#56677a', BL = '#8394a6', K = '#2e3236', IN = '#7c8186', IND = '#5e6368', WEB = '#8c3a2c';
  const P = n => def.parts.find(p => p._doc?.startsWith(n));
  const ch = def.chassis, floorZ0 = ch.p[2] - ch.hz, floorZ1 = ch.p[2] + ch.hz;   // -5.75 .. 8.55
  const wing = P('high wing'), fin = P('fin'), tp = P('T-tail'), boom = P('tail boom');
  const ramp = def.parts.find(p => p.door === 'ramp');
  const hingeZ = floorZ0, roofIn = 2.6, roofOut = 2.88, belly = -0.55, sideOut = 1.78;
  const holdZ1 = 5.4;                                                   // front bulkhead
  const cockZ0 = holdZ1, cockZ1 = 8.6, cockFloor = def.seats[0].feet[1] - 0.015;   // 0.605

  // --- hold: belly, floor tracks, inner lining + ribs, benches ----------------------------------------------------------
  k.box(BD, [3.3, -belly - 0.02, floorZ1 - hingeZ], [0, belly / 2 - 0.01, (floorZ1 + hingeZ) / 2], { bevel: 0.1 });   // belly under the floor
  k.box('#5b5f63', [2.96, 0.02, holdZ1 - hingeZ], [0, 0.005, (holdZ1 + hingeZ) / 2], { bevel: 0 });               // floor plate
  for (const x of [0.3, -0.3]) k.box('#3f4347', [0.22, 0.03, holdZ1 - hingeZ - 0.2], [x, 0.02, (holdZ1 + hingeZ) / 2], { bevel: 0 });   // roller tracks
  for (const sx of [1, -1]) k.box(IN, [0.06, roofIn, holdZ1 + 9.0], [sx * 1.52, roofIn / 2, (holdZ1 - 9.0) / 2], { bevel: 0 });   // wall lining
  k.box(IND, [3.0, 0.06, holdZ1 + 6.2], [0, roofIn - 0.03, (holdZ1 - 6.2) / 2], { bevel: 0 });                           // ceiling
  for (let z = -5.4; z < holdZ1; z += 1.2) {                                                                          // ribs
    for (const sx of [1, -1]) k.box(IND, [0.08, roofIn - 0.05, 0.1], [sx * 1.47, roofIn / 2, z], { bevel: 0.01 });
    k.box(IND, [2.9, 0.08, 0.1], [0, roofIn - 0.08, z], { bevel: 0.01 });
  }
  k.box(IND, [3.0, roofIn, 0.08], [0, roofIn / 2, holdZ1 + 0.02], { bevel: 0 });                                         // bulkhead
  k.box(K, [0.8, 1.7, 0.03], [0.5, 0.86, holdZ1 - 0.03], { bevel: 0 });                                                 // crew door outline
  const benchSeats = def.seats.filter(s => s.yaw);
  for (const sx of [1, -1]) {
    const zs = benchSeats.filter(s => Math.sign(s.p[0]) === sx).map(s => s.p[2]);
    const z0 = Math.min(...zs) - 0.55, z1 = Math.max(...zs) + 0.55, y = benchSeats[0].p[1] - 0.06;
    k.box('#4b4f54', [0.42, 0.05, z1 - z0], [sx * 1.27, y, (z0 + z1) / 2], { bevel: 0.01 });                            // bench pan
    k.box(WEB, [0.4, 0.02, z1 - z0 - 0.06], [sx * 1.27, y + 0.035, (z0 + z1) / 2], { bevel: 0 });                       // webbing seat
    k.box(WEB, [0.03, 0.55, z1 - z0 - 0.06], [sx * 1.47, y + 0.38, (z0 + z1) / 2], { bevel: 0 });                       // webbing back
    for (const z of [z0 + 0.05, z1 - 0.05]) k.tube('#4b4f54', [[sx * 1.08, y, z], [sx * 1.08, 0.02, z]], 0.025, { seg: 4 });   // legs
  }

  // --- fuselage skin (octagon: sides, chamfers, roof) around the hold -------------------------------------------------------
  const skinZ0 = -5.9, skinZ1 = cockZ1;
  const L = skinZ1 - skinZ0, zc = (skinZ0 + skinZ1) / 2;
  for (const sx of [1, -1]) {
    k.box(B, [0.08, 2.1, L], [sx * sideOut, 1.1, zc], { bevel: 0.02 });                                                   // side
    k.box(B, [0.08, 0.95, L], [sx * (sideOut - 0.33), roofOut - 0.33, zc], { rot: [0, 0, sx * 0.79], bevel: 0.02 });      // upper chamfer
    k.box(BD, [0.08, 0.95, L - 0.2], [sx * (sideOut - 0.33), belly + 0.32, zc + 0.1], { rot: [0, 0, -sx * 0.79], bevel: 0.02 });   // lower chamfer
    k.box(BL, [0.02, 0.12, L - 0.4], [sx * (sideOut + 0.04), 1.75, zc], { bevel: 0 });                                    // panel line
    for (let z = -4.5; z < 4.6; z += 1.8) k.box('#2c3a4a', [0.02, 0.3, 0.3], [sx * (sideOut + 0.045), 1.55, z], { bevel: 0.01 });   // portholes
  }
  k.box(B, [2.3, 0.08, L], [0, roofOut, zc], { bevel: 0.02 });                                                             // roof
  // upswept tail over the ramp: side wedges hanging from the boom (deep at the hinge, shallow at the tail) + boom
  const tailZ1 = boom.p[2] - boom.box[2] - 0.2;                                                                           // -11.2
  for (const sx of [1, -1]) k.wedge(B, [0.08, 0.7, roofOut + 0.2, skinZ0 - tailZ1], [sx * (sideOut - 0.15), roofOut + 0.05, (skinZ0 + tailZ1) / 2], { rot: [0, 0, Math.PI] });
  k.box(B, [2.6, 0.9, skinZ0 - tailZ1], [0, roofOut - 0.25, (skinZ0 + tailZ1) / 2], { rot: [-0.05, 0, 0], bevel: 0.3 });   // boom
  k.box(BD, [1.6, 0.5, 0.6], [0, roofOut - 0.1, tailZ1 + 0.1], { bevel: 0.15 });                                         // tail cone
  // fin + T-tail on their colliders
  k.wedge(B, [fin.box[0] * 2, tp.p[1] - roofOut + 0.05, 1.8, fin.box[2] * 2 + 0.6], [0, roofOut - 0.05, fin.p[2] - 0.1]);   // swept fin up to the T-tail
  k.box(BD, [tp.box[0] * 2, tp.box[1] * 2, tp.box[2] * 2], tp.p, { bevel: 0.05 });
  for (const sx of [1, -1]) k.box(K, [0.5, tp.box[1] * 2 + 0.02, tp.box[2] * 2 - 0.1], [sx * (tp.box[0] - 0.25), tp.p[1], tp.p[2]], { bevel: 0.03 });
  k.box(BL, [0.3, 0.3, 1.1], [0, tp.p[1] - 0.05, tp.p[2] + 0.1], { bevel: 0.08 });
  k.box('tail', [0.05, 0.05, 0.05], [0, tp.p[1] + 0.12, tp.p[2] - 0.8], { bevel: 0 });

  // --- cockpit: floor, glass, nose, radome, seats + yokes ---------------------------------------------------------------
  k.box('#4a4d52', [3.0, 0.06, cockZ1 - cockZ0], [0, cockFloor - 0.03, (cockZ0 + cockZ1) / 2], { bevel: 0 });
  k.box(BD, [3.2, cockFloor - belly, 2.4], [0, (cockFloor + belly) / 2, cockZ1 + 0.6], { bevel: 0.35 });                // chin
  k.cyl(K, 1.15, 1.1, [0, 0.55, cockZ1 + 1.5], { axis: 'z', seg: 8, r2: 0.35 });                                          // radome
  k.wedge(B, [3.3, 0.3, 0.05, 1.0], [0, 1.45, cockZ1 + 0.4]);                                                             // nose top
  k.box('glass', [2.9, 0.06, 1.05], [0, 1.95, cockZ1 - 0.05], { rot: [0.75, 0, 0], bevel: 0 });                          // windscreen
  for (const x of [-0.9, 0, 0.9]) k.box(K, [0.06, 0.08, 1.05], [x, 1.97, cockZ1 - 0.05], { rot: [0.75, 0, 0], bevel: 0 });
  for (const sx of [1, -1]) k.box('glass', [0.03, 0.5, 1.2], [sx * (sideOut + 0.02), 1.78, cockZ1 - 1.0], { bevel: 0 });
  k.box(K, [2.8, 0.36, 0.3], [0, 1.32, 8.0], { rot: [-0.3, 0, 0], bevel: 0.03 });                                       // panel
  for (const s of def.seats.filter(s => !s.yaw)) {
    const [x, y, z] = s.p;
    k.box(K, [0.44, y - 0.1 - cockFloor, 0.42], [x, (y - 0.1 + cockFloor) / 2, z], { bevel: 0.02 });
    k.box('#4b4f54', [0.5, 0.1, 0.48], [x, y - 0.06, z + 0.03], { bevel: 0.03 });
    k.box('#4b4f54', [0.5, 0.75, 0.12], [x, y + 0.32, z - 0.25], { rot: [-0.12, 0, 0], bevel: 0.04 });
    const w = [x, def.seats[0].wheelAt[1], def.seats[0].wheelAt[2]];
    k.tube(K, [[w[0], w[1] - 0.04, w[2] + 0.04], [w[0], 1.05, 7.98]], 0.03, { seg: 5 });
    if (s !== def.seats[0]) { k.box(K, [0.3, 0.03, 0.04], w, { rot: [-1.2, 0, 0], bevel: 0 }); for (const dx of [0.15, -0.15]) k.box(K, [0.04, 0.03, 0.12], [w[0] + dx, w[1], w[2] - 0.02], { bevel: 0 }); }
  }
  const drv = def.seats[0];
  const steer = new THREE.Group(); steer.position.set(...drv.wheelAt); steer.rotation.x = -1.2;
  const sk = createKit(THREE, opts);
  sk.box(K, [0.3, 0.03, 0.04], [0, 0, 0], { bevel: 0 });
  for (const sx of [1, -1]) sk.box('#4b4f54', [0.04, 0.03, 0.12], [sx * 0.15, 0, 0.05], { bevel: 0 });
  sk.finish(steer);
  steer.traverse(o => { o.userData.detail = true; });

  // --- wing (on its collider), engines + props, tips ---------------------------------------------------------------------
  const [whx, why, whz] = wing.box;
  // tapered in steps: full chord over the fuselage and inner engines, narrower outboard (trailing edge moves forward)
  const lead = wing.p[2] + whz;
  for (const [x0, x1, c] of [[-5.6, 5.6, whz * 2], [5.6, 9.6, whz * 1.75], [9.6, whx - 0.9, whz * 1.45]]) for (const sx of x0 < 0 ? [1] : [1, -1])
    k.box(B, [x1 - x0, why * 2, c], [sx * (x0 + x1) / 2, wing.p[1], lead - c / 2], { bevel: 0.06 });
  k.box(BL, [whx * 2 - 0.4, 0.04, 0.4], [0, wing.p[1] + why, wing.p[2] + whz - 0.25], { bevel: 0 });
  k.box(BD, [11.2, why * 1.6, 0.5], [0, wing.p[1] - 0.02, wing.p[2] - whz + 0.25], { bevel: 0.02 });                  // flaps
  for (const sx of [1, -1]) {
    k.box(K, [0.9, why * 2 + 0.06, whz * 1.45 + 0.06], [sx * (whx - 0.45), wing.p[1], lead - whz * 0.725], { bevel: 0.06 });
    k.box('amber', [0.04, 0.06, 0.12], [sx * whx, wing.p[1], wing.p[2] + whz - 0.15], { bevel: 0 });
  }
  k.box(B, [3.2, 0.5, whz * 2 - 0.2], [0, roofOut + 0.08, wing.p[2]], { bevel: 0.2 });                                    // wing root fairing
  const engX = [4.2, 7.9, -4.2, -7.9], props = [];
  const nz0 = wing.p[2] - whz + 0.4, nz1 = wing.p[2] + whz + 0.9, ny = wing.p[1] - why - 0.42;
  for (const x of engX) {
    k.cyl(B, 0.5, nz1 - nz0, [x, ny, (nz0 + nz1) / 2], { axis: 'z', seg: 10, r2: 0.58 });
    k.box(B, [0.5, 0.42, nz1 - nz0 - 0.6], [x, ny + 0.32, (nz0 + nz1) / 2 - 0.3], { bevel: 0.1 });                       // pylon
    k.cyl(K, 0.42, 0.15, [x, ny, nz1 + 0.05], { axis: 'z', seg: 10 });
    k.cyl('darkMetal', 0.12, 0.5, [x, ny - 0.1, nz0 - 0.15], { axis: 'z', seg: 6 });                                       // exhaust
    const pg = new THREE.Group(); pg.position.set(x, ny, nz1 + 0.18); group.add(pg); props.push(pg);
    const pk = createKit(THREE, opts);
    pk.cyl(K, 0.26, 0.42, [0, 0, 0.1], { axis: 'z', seg: 10, r2: 0.04 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; pk.box(K, [0.16, 1.45, 0.05], [Math.sin(a) * 0.78, Math.cos(a) * 0.78, 0], { rot: [0, 0.35, -a], bevel: 0 });
      pk.box('#d9dcdf', [0.16, 0.14, 0.055], [Math.sin(a) * 1.45, Math.cos(a) * 1.45, 0], { rot: [0, 0.35, -a], bevel: 0 }); }
    pk.finish(pg);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.55, 20), k.mat('blur')); disc.position.z = 0.03; disc.castShadow = false; disc.visible = false; pg.add(disc);
    pg.userData.disc = disc;
  }

  // --- landing gear: sponsons, struts, wheels -------------------------------------------------------------------------
  for (const sx of [1, -1]) k.box(BD, [0.55, 0.8, 3.4], [sx * (sideOut + 0.12), -0.12, -0.7], { bevel: 0.2 });
  const wheels = def.wheels.map(w => {
    const nose = w.p[2] > 3;
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', rimCol: 'rim', rim: 0.5, knobs: 12 });
    t.group.position.set(...w.p); group.add(t.group);
    const from = nose ? [0, belly + 0.1, w.p[2]] : [w.p[0], -0.3, w.p[2]];
    const leg = k.shock(from, [w.p[0] * (nose ? 0.4 : 1), w.p[1], w.p[2]], { r: nose ? 0.06 : 0.07, col: 'darkMetal' });
    leg.userData.detail = false; group.add(leg);
    return { ...t, base: w.p, leg, from, nose };
  });
  k.box(K, [0.15, 0.08, 0.7], [0, w0y(def) + 0.12, def.wheels[0].p[2]], { bevel: 0.02 });                                 // nose axle

  // --- the ramp: a plate hinged at the floor's back edge, ribbed, with a toe; eased between shut and open -------------
  const rampG = new THREE.Group(); rampG.position.set(0, 0, hingeZ); group.add(rampG);
  const rk = createKit(THREE, opts);
  const RL = ramp.open.box[2] * 2, RW = ramp.box[0] * 2;
  rk.box('#5b5f63', [RW, 0.1, RL], [0, -0.05, -RL / 2], { bevel: 0.02 });
  for (let i = 1; i < 9; i++) rk.box('#3f4347', [RW - 0.2, 0.025, 0.06], [0, 0.01, -i * RL / 9], { bevel: 0 });          // grip ribs
  rk.box(BD, [RW + 0.06, 0.14, RL], [0, -0.15, -RL / 2], { bevel: 0.03 });                                               // underside skin
  rk.box('#3f4347', [RW, 0.04, 0.3], [0, -0.06, -RL - 0.12], { rot: [0.3, 0, 0], bevel: 0 });                             // toe
  rk.finish(rampG);
  const shutA = ramp.rot[0], openA = ramp.open.rot[0];          // 0.62 up, -0.415 down: same as the colliders
  rampG.rotation.x = shutA;

  k.finish(group);
  group.add(steer);
  let rampT = 0, last = null, spin = 0;
  return {
    group, wheels, steer, ramp: rampG, props,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.12) - 0.05;
        m.group.position.y = y; m.group.rotation.y = w.steer || 0; m.spin.rotation.x = w.spin || 0;
        m.leg.set(m.from, [m.base[0] * (m.nose ? 0.4 : 1), y, m.base[2]]);
      });
      const t = st.t ?? performance.now() / 1000;
      const dt = last == null ? 1 : Math.min(0.1, Math.max(0, t - last)); last = t;
      rampT += Math.max(-dt * 0.5, Math.min(dt * 0.5, (st.acts?.door_ramp ? 1 : 0) - rampT));
      const e = rampT * rampT * (3 - 2 * rampT);
      rampG.rotation.x = shutA + (openA - shutA) * e;
      const lever = st.lever, rate = lever == null ? 2 : 6 + lever * 55;
      spin += rate * dt;
      for (const p of props) { p.rotation.z = spin; p.userData.disc.visible = lever != null && lever > 0.15; }
      steer.rotation.z = (st.steer || 0) * -1.2;
    },
  };
}
const w0y = def => def.wheels[0].p[1] + 0.06;
