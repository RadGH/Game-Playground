// Roadrunner Motorcycle (reference: assets/ref/motorcycle.webp). A classic road bike: deep red tank, round headlamp
// in a red cowl, flat black seat, finned silver engine, chrome pipes to a muffler each side, twin rear struts, cast
// black wheels with silver brake discs on smooth road tyres. Like the dirtbike, the forks, bars, lamp and front fender
// turn about the steering head (`steer`), the bars group's grips land on the seat's barsAt, and the swingarm pivots so
// the rear hub follows its suspension. Ground sits ~0.38 m under the body origin at rest; hubs at y ≈ -0.06.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const R = 'red', RD = 'redDark', K = 'black', T = 'trim';
  const [fw, rw] = def.wheels;
  const seat = def.seats[0];
  const barsAt = seat.barsAt;
  const head = [0, 0.5, 0.5];                  // steering head
  const pivot = [0, 0.0, -0.18];              // swingarm pivot
  const pegY = seat.p[1] - 0.6 + 0.02;        // the ride pose's feet: 0.6 under the hips

  // --- frame ------------------------------------------------------------------------------------------------------
  k.tube(K, [head, [0, 0.2, 0.36], [0, -0.12, 0.2], [0, -0.16, -0.05], pivot], 0.032, { seg: 6 });
  k.tube(K, [head, [0, 0.38, 0.05], [0, 0.32, -0.3], [0, 0.36, -0.7]], 0.03, { seg: 6 });
  k.tube(K, [[0, 0.32, -0.3], [0, 0.05, -0.2]], 0.026, { seg: 6 });
  // --- engine: block, finned barrels, round side covers ---------------------------------------------------------
  k.box('engine', [0.26, 0.24, 0.36], [0, -0.04, 0.04], { bevel: 0.04 });
  for (let i = 0; i < 5; i++) k.box('darkMetal', [0.3 - i * 0.01, 0.025, 0.24], [0, 0.11 + i * 0.045, 0.12], { rot: [0.25, 0, 0], bevel: 0.005 });
  k.box('engine', [0.22, 0.08, 0.2], [0, 0.32, 0.17], { rot: [0.25, 0, 0], bevel: 0.02 });
  for (const sx of [1, -1]) k.cyl('metal', 0.1, 0.04, [sx * 0.14, -0.04, 0.02], { axis: 'x', seg: 8 });
  k.box('darkMetal', [0.18, 0.14, 0.16], [0, 0.18, -0.14], { bevel: 0.03 });           // air box under the seat
  // --- pipes: one chrome header + muffler each side --------------------------------------------------------------
  for (const sx of [1, -1]) {
    k.tube('chrome', [[sx * 0.06, 0.12, 0.26], [sx * 0.1, -0.08, 0.3], [sx * 0.13, -0.2, 0.12], [sx * 0.15, -0.2, -0.2], [sx * 0.16, -0.14, -0.36]], 0.03, { seg: 6 });
    k.cyl('chrome', 0.055, 0.42, [sx * 0.17, -0.09, -0.56], { axis: 'z', seg: 8, rot: [-0.18, 0, 0] });
    k.cyl('steel', 0.04, 0.03, [sx * 0.17, -0.05, -0.78], { axis: 'z', seg: 8, rot: [-0.18, 0, 0] });
    k.box(T, [0.12, 0.03, 0.05], [sx * 0.15, pegY, -0.06], { bevel: 0 });            // foot pegs
    k.box(T, [0.03, 0.12, 0.04], [sx * 0.1, pegY + 0.05, -0.08], { bevel: 0 });
  }
  // --- tank, seat, tail -----------------------------------------------------------------------------------------
  k.box(R, [0.34, 0.24, 0.52], [0, 0.47, 0.17], { rot: [0.12, 0, 0], bevel: 0.08 });
  k.box(RD, [0.36, 0.06, 0.44], [0, 0.37, 0.15], { rot: [0.12, 0, 0], bevel: 0.02 });
  k.cyl('metal', 0.045, 0.03, [0, 0.6, 0.24], { seg: 8 });
  for (const sx of [1, -1]) k.cyl('metal', 0.05, 0.02, [sx * 0.17, 0.47, 0.17], { axis: 'x', seg: 8 });   // plain round knee pads
  const sy = seat.p[1] - 0.05;
  k.box(K, [0.3, 0.1, 0.62], [0, sy - 0.05, seat.p[2] - 0.12], { rot: [0.04, 0, 0], bevel: 0.04 });
  k.box(T, [0.26, 0.08, 0.6], [0, sy - 0.14, seat.p[2] - 0.12], { bevel: 0.02 });
  k.wedge(R, [0.24, 0.12, 0.06, 0.26], [0, sy - 0.12, -0.76]);                      // tail cowl
  k.box('tail', [0.14, 0.06, 0.04], [0, sy - 0.04, -0.9], { bevel: 0.01 });
  k.box(K, [0.08, 0.08, 0.3], [0, sy - 0.18, -0.92], { rot: [0.5, 0, 0], bevel: 0.01 });   // plate hanger
  k.box(K, [0.18, 0.12, 0.02], [0, sy - 0.32, -1.04], { rot: [0.2, 0, 0], bevel: 0 });    // blank plate
  for (const sx of [1, -1]) k.box('amber', [0.05, 0.04, 0.05], [sx * 0.1, sy - 0.17, -0.98], { bevel: 0 });
  k.box(R, [0.18, 0.04, 0.4], [0, rw.p[1] + rw.r + 0.12, rw.p[2] + 0.12], { rot: [-0.25, 0, 0], bevel: 0.015 });   // rear fender

  // --- steering group: forks, front fender, lamp, bars -----------------------------------------------------------
  const steer = new THREE.Group(); steer.position.set(...head);
  const rake = -Math.atan2(fw.p[2] - head[2], head[1] - fw.p[1]);
  const forkLen = Math.hypot(fw.p[2] - head[2], head[1] - fw.p[1]);
  const fork = new THREE.Group(); fork.rotation.x = rake; steer.add(fork);
  const fk = createKit(THREE, opts);
  for (const sx of [1, -1]) {
    fk.cyl(K, 0.032, 0.4, [sx * 0.09, -0.18, 0], { seg: 8 });
    fk.cyl('chrome', 0.024, 0.36, [sx * 0.09, -forkLen + 0.2, 0], { seg: 6 });
  }
  fk.box(K, [0.24, 0.05, 0.08], [0, 0.0, 0], { bevel: 0.01 });                           // top yoke
  fk.box(K, [0.24, 0.05, 0.08], [0, -0.14, 0], { bevel: 0.01 });                         // bottom yoke
  fk.box(R, [0.16, 0.04, 0.42], [0, -forkLen + fw.r + 0.07, 0.04], { rot: [-0.25, 0, 0], bevel: 0.015 });   // front fender
  fk.finish(fork);
  const lk = createKit(THREE, opts);                                                     // lamp + cowl (upright)
  lk.box(R, [0.3, 0.26, 0.16], [0, -0.04, 0.17], { bevel: 0.07 });
  lk.cyl('lamp', 0.09, 0.03, [0, -0.04, 0.26], { axis: 'z', seg: 12 });
  lk.cyl('chrome', 0.105, 0.03, [0, -0.04, 0.245], { axis: 'z', seg: 12 });
  lk.box(K, [0.1, 0.06, 0.06], [0, 0.06, 0.04], { bevel: 0.01 });                        // clocks
  lk.finish(steer);
  const bars = new THREE.Group();
  bars.position.set(0, barsAt[1] - 0.035 - head[1], barsAt[2] + 0.02 - head[2]);
  steer.add(bars);
  const bk = createKit(THREE, opts);
  bk.tube('chrome', [[0.33, 0.035, -0.02], [0.2, 0.01, 0.0], [0.1, -0.02, 0.1], [-0.1, -0.02, 0.1], [-0.2, 0.01, 0.0], [-0.33, 0.035, -0.02]], 0.016, { seg: 5 });
  for (const sx of [1, -1]) {
    bk.cyl(K, 0.022, 0.12, [sx * 0.29, 0.035, -0.02], { axis: 'x', seg: 6 });
    bk.tube(K, [[sx * 0.2, 0.02, 0.0], [sx * 0.26, 0.13, 0.02], [sx * 0.3, 0.17, 0.02]], 0.01, { seg: 4 });   // mirror stalk
    bk.box(K, [0.1, 0.06, 0.02], [sx * 0.31, 0.18, 0.02], { bevel: 0.01 });
    bk.box(T, [0.1, 0.015, 0.025], [sx * 0.24, 0.02, 0.05], { bevel: 0 });                // levers
  }
  bk.finish(bars);
  steer.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // --- swingarm, rear wheel, twin struts -------------------------------------------------------------------------
  const arm = new THREE.Group(); arm.position.set(...pivot); group.add(arm);
  const ak = createKit(THREE, opts);
  const armLen = Math.hypot(rw.p[2] - pivot[2], rw.p[1] - pivot[1]);
  for (const sx of [1, -1]) ak.box(K, [0.04, 0.07, armLen], [sx * 0.11, 0, -armLen / 2], { bevel: 0.01 });
  ak.box(K, [0.26, 0.05, 0.06], [0, 0, -0.08], { bevel: 0.01 });
  ak.finish(arm);
  const front = k.tyre({ r: fw.r, w: fw.w, style: 'road', rimCol: T, rim: 0.74 });
  const rear = k.tyre({ r: rw.r, w: rw.w, style: 'road', rimCol: T, rim: 0.74 });
  const dk = createKit(THREE, opts);                 // brake discs (do not spin: they would look the same)
  dk.cyl('metal', fw.r * 0.52, 0.01, [fw.w * 0.5 + 0.01, 0, 0], { axis: 'x', seg: 14 });
  dk.cyl('metal', fw.r * 0.52, 0.01, [-fw.w * 0.5 - 0.01, 0, 0], { axis: 'x', seg: 14 });
  dk.box(T, [0.04, 0.08, 0.06], [fw.w * 0.5 + 0.03, 0.1, -0.08], { bevel: 0 });
  dk.finish(front.group);
  group.add(front.group, rear.group);
  const strutTop = sx => [sx * 0.13, 0.33, -0.5];
  const shocks = [1, -1].map(sx => { const s = k.shock(strutTop(sx), [sx * 0.13, rw.p[1] + 0.06, rw.p[2] + 0.12], { r: 0.035, col: 'chrome' }); group.add(s); return s; });

  k.finish(group);
  group.add(steer);
  return {
    group, steer,
    wheels: [front, rear].map((t, i) => ({ ...t, base: def.wheels[i].p })),
    update(st) {
      const [wf, wr] = st.wheels;
      const yf = fw.p[1] + (wf?.comp ?? 0.1) - 0.05, yr = rw.p[1] + (wr?.comp ?? 0.1) - 0.05;
      steer.rotation.y = wf?.steer || 0;
      front.group.position.set(fw.p[0], yf, fw.p[2]);
      front.group.rotation.y = wf?.steer || 0;
      front.spin.rotation.x = wf?.spin || 0;
      rear.group.position.set(rw.p[0], yr, rw.p[2]);
      rear.spin.rotation.x = wr?.spin || 0;
      arm.rotation.x = Math.atan2(yr - pivot[1], -(rw.p[2] - pivot[2]));
      const lift = (yr - pivot[1]) * (rw.p[2] + 0.12 - pivot[2]) / (rw.p[2] - pivot[2]);
      shocks.forEach((s, i) => s.set(strutTop(i ? -1 : 1), [(i ? -1 : 1) * 0.13, pivot[1] + lift + 0.04, rw.p[2] + 0.12]));
    },
  };
}
