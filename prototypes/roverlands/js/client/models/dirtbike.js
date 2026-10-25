// Dirtbike (reference: assets/ref/dirtbike.webp). Orange plastics, black seat, gold forks, silver swingarm, spoked
// wheels with knobby tyres. The fork + bars + front wheel turn together about a raked steering head; the swingarm
// pivots so the rear hub follows its suspension.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const O = 'orange', K = 'black';
  const [fw, rw] = def.wheels;
  const head = [0, 0.42, 0.42];                 // steering head
  const pivot = [0, -0.02, -0.12];             // swingarm pivot

  // frame + engine
  k.tube(K, [head, [0, 0.12, 0.2], [0, -0.12, -0.05], pivot], 0.035);
  k.tube(K, [head, [0, 0.3, -0.1], pivot], 0.03);
  k.tube(K, [[0, 0.3, -0.1], [0, 0.32, -0.6]], 0.025);
  k.box('engine', [0.2, 0.26, 0.3], [0, -0.02, 0.08], { bevel: 0.04 });
  k.cyl('engine', 0.11, 0.24, [0, 0.0, 0.06], { axis: 'x', seg: 10 });
  k.box('darkMetal', [0.16, 0.22, 0.12], [0, 0.16, 0.12], { rot: [0.3, 0, 0], bevel: 0.02 });
  k.tube('chrome', [[0.05, -0.08, 0.2], [0.08, -0.18, 0.05], [0.1, 0.02, -0.3], [0.12, 0.22, -0.62]], 0.03);   // exhaust
  k.cyl('steel', 0.05, 0.22, [0.12, 0.24, -0.7], { axis: 'z', seg: 8 });
  // tank, shrouds, seat, side plates, rear fender
  k.box(O, [0.3, 0.2, 0.42], [0, 0.4, 0.14], { rot: [0.15, 0, 0], bevel: 0.06 });
  for (const sx of [1, -1]) k.box(O, [0.06, 0.24, 0.38], [sx * 0.16, 0.3, 0.2], { rot: [0.35, 0, 0], bevel: 0.03 });
  k.box(K, [0.22, 0.08, 0.78], [0, 0.42, -0.3], { rot: [0.06, 0, 0], bevel: 0.04 });
  for (const sx of [1, -1]) k.box(O, [0.04, 0.2, 0.34], [sx * 0.12, 0.3, -0.42], { bevel: 0.02 });
  k.wedge(O, [0.24, 0.05, 0.08, 0.5], [0, 0.36, -0.78], { rot: [-0.2, 0, 0] });
  for (const sx of [1, -1]) k.box('steel', [0.12, 0.03, 0.05], [sx * 0.13, -0.08, -0.05], { bevel: 0 });

  // steering group: forks, front wheel, fender, plate, bars
  const steer = new THREE.Group(); steer.position.set(...head);
  // forks run from the steering head down and FORWARD to the front hub
  const rake = -Math.atan2(fw.p[2] - head[2], head[1] - fw.p[1]);
  steer.rotation.x = 0;
  const fork = new THREE.Group(); fork.rotation.x = rake; steer.add(fork);
  const sk = createKit(THREE, opts);
  for (const sx of [1, -1]) {
    sk.cyl('gold', 0.03, 0.42, [sx * 0.08, -0.2, 0], { seg: 8 });
    sk.cyl('steel', 0.024, 0.32, [sx * 0.08, -0.52, 0], { seg: 6 });
  }
  sk.box(K, [0.22, 0.04, 0.06], [0, 0.02, 0], { bevel: 0 });
  sk.box(O, [0.18, 0.04, 0.5], [0, -0.06, 0.18], { rot: [-0.35, 0, 0], bevel: 0.02 });   // front fender
  sk.box(O, [0.22, 0.24, 0.04], [0, 0.08, 0.07], { rot: [-0.2, 0, 0], bevel: 0.03 });     // number plate
  sk.finish(fork);
  const bars = new THREE.Group(); bars.position.set(0, 0.2, -0.13); steer.add(bars);
  const bk = createKit(THREE, opts);
  bk.tube('steel', [[0.32, 0.04, -0.02], [0.14, 0, 0], [-0.14, 0, 0], [-0.32, 0.04, -0.02]], 0.016);
  for (const sx of [1, -1]) bk.cyl(K, 0.022, 0.12, [sx * 0.3, 0.035, -0.02], { axis: 'x', seg: 6 });
  bk.finish(bars);
  const front = k.tyre({ r: fw.r, w: fw.w, style: 'knobby', knobs: 22, spokes: 16, rimCol: 'rim' });
  group.add(steer);

  // swingarm + rear wheel
  const arm = new THREE.Group(); arm.position.set(...pivot); group.add(arm);
  const ak = createKit(THREE, opts);
  const armLen = Math.hypot(rw.p[2] - pivot[2], rw.p[1] - pivot[1]);
  for (const sx of [1, -1]) ak.box('metal', [0.04, 0.07, armLen], [sx * 0.09, 0, -armLen / 2], { bevel: 0.01 });
  ak.finish(arm);
  const rear = k.tyre({ r: rw.r, w: rw.w, style: 'knobby', knobs: 22, spokes: 16, rimCol: 'rim' });
  group.add(front.group, rear.group);
  const shock = k.shock([0, 0.3, -0.12], [0, -0.0, -0.4], { r: 0.04 });
  group.add(shock);

  k.finish(group);
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
      arm.rotation.x = Math.atan2(yr - pivot[1], -(rw.p[2] - pivot[2]));   // the arm's boxes run along -z
      shock.set([0, 0.3, -0.12], [0, pivot[1] + (yr - pivot[1]) * 0.35, -0.4]);
    },
  };
}
