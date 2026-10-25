// Bounder Rocket Car (reference: assets/ref/rocket_car.webp). A faceted blue wedge with a black splitter and skirts,
// fat block-tread tyres sticking out of the body, a clear bubble canopy tall enough for a Chibi head, a rear wing on
// two struts and a rocket nozzle whose flame (`flame` node) grows with st.boost 0..1 (idle: a small pilot flicker).
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const B = 'blue', BD = 'blueDark', K = 'black';
  const seat = def.seats[0];

  // --- body ----------------------------------------------------------------------------------------------------
  k.box(B, [1.5, 0.36, 2.3], [0, 0.0, -0.15], { bevel: 0.1 });                 // main tub, z -1.3 .. 1.0
  k.wedge(B, [1.46, 0.36, 0.1, 0.75], [0, -0.18, 1.32]);                      // nose falls to the splitter
  k.wedge(BD, [1.0, 0.04, 0.0, 0.6], [0, 0.17, 1.2]);                          // facet down the bonnet
  k.box(K, [1.6, 0.08, 0.5], [0, -0.22, 1.5], { bevel: 0.02 });                // splitter
  for (const sx of [1, -1]) k.box(K, [0.1, 0.22, 0.4], [sx * 0.5, -0.12, 1.62], { rot: [0, sx * 0.4, 0], bevel: 0.02 });   // intake fins
  for (const sx of [1, -1]) {
    k.box('lamp', [0.32, 0.04, 0.05], [sx * 0.48, 0.05, 1.67], { rot: [0, sx * -0.3, -sx * 0.25], bevel: 0 });   // slit lamps
    k.box(K, [0.08, 0.16, 1.6], [sx * 0.74, -0.2, -0.05], { bevel: 0.02 });   // side skirt
    // raised flanks behind the cockpit, the shoulder line of the reference
    k.wedge(B, [0.34, 0.42, 0.12, 1.2], [sx * 0.56, 0.12, -0.62]);
    k.box(BD, [0.06, 0.2, 0.5], [sx * 0.75, 0.12, -0.75], { bevel: 0.02 });   // side vent
    k.box('tail', [0.2, 0.06, 0.04], [sx * 0.5, 0.25, -1.31], { bevel: 0 });
  }
  // fender arches over the big wheels: short slats round the top of each tyre
  for (const w of def.wheels) {
    const hubY = w.p[1] + 0.06, R = w.r + 0.07;
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6;
      k.box(i === 2 ? B : BD, [w.w + 0.06, 0.06, R * 0.62], [w.p[0], hubY + Math.cos(a) * R, w.p[2] + Math.sin(a) * R], { rot: [a, 0, 0], bevel: 0.015 });
    }
  }
  // cockpit: a black rim, a bucket seat, a steering wheel
  k.box(K, [1.08, 0.07, 1.5], [0, 0.2, 0.05], { bevel: 0.03 });                // canopy base ring (open middle hidden by the seat)
  k.box('seat', [0.48, 0.12, 0.5], [0, seat.p[1] - 0.06, seat.p[2] + 0.04], { bevel: 0.04 });
  k.box('seat', [0.5, 0.66, 0.14], [0, seat.p[1] + 0.3, seat.p[2] - 0.28], { rot: [-0.2, 0, 0], bevel: 0.05 });
  const wheelAt = seat.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.75;
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 5, 12), k.mat('trim')));
  const sk = createKit(THREE, opts); sk.box('trim', [0.26, 0.03, 0.025], [0, 0, 0], { bevel: 0 }); sk.finish(steer);
  steer.traverse(o => { o.userData.detail = true; });
  k.tube('trim', [[0, wheelAt[1] - 0.03, wheelAt[2] + 0.05], [0, 0.22, wheelAt[2] + 0.38]], 0.025);
  // the bubble: the top part of an ellipsoid (head top = seat + 1.13 = 1.28; the dome tops out at ~1.62, room for hats)
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), k.mat('glass'));
  dome.scale.set(0.54, 1.36, 0.84); dome.position.set(0, 0.26, -0.04);
  group.add(dome);
  k.tube(K, [[0, 0.24, 0.78], [0, 1.05, 0.46], [0, 1.62, -0.04], [0, 1.1, -0.64], [0, 0.26, -0.8]], 0.022, { seg: 5 });   // a frame rib

  // --- rear wing + rocket nozzle -------------------------------------------------------------------------------
  for (const sx of [1, -1]) k.box(K, [0.06, 0.62, 0.14], [sx * 0.5, 0.56, -1.2], { rot: [-0.45, 0, 0], bevel: 0.01 });
  k.box(B, [1.8, 0.06, 0.4], [0, 0.88, -1.38], { rot: [0.12, 0, 0], bevel: 0.02 });
  for (const sx of [1, -1]) k.box(B, [0.05, 0.3, 0.46], [sx * 0.9, 0.84, -1.38], { bevel: 0.01 });
  const nz = -1.38, ny = 0.08;
  k.cyl('trim', 0.27, 0.32, [0, ny, nz], { axis: 'z', seg: 12 });
  k.cyl('darkMetal', 0.3, 0.06, [0, ny, nz - 0.18], { axis: 'z', seg: 12 });
  k.cyl('flameCore', 0.18, 0.02, [0, ny, nz - 0.22], { axis: 'z', seg: 12 });
  const flame = new THREE.Group(); flame.position.set(0, ny, nz - 0.22);
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.5), k.mat('flame'));
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.6, 8).rotateX(-Math.PI / 2).translate(0, 0, -0.3), k.mat('flameCore'));
  outer.castShadow = core.castShadow = false;
  flame.add(outer, core);

  // --- wheels --------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 12, rimCol: 'black', rim: 0.55 });
    t.group.position.set(...w.p);
    group.add(t.group);
    const sx = Math.sign(w.p[0]);
    const arm = k.shock([sx * 0.4, -0.12, w.p[2]], [w.p[0] * 0.85, w.p[1], w.p[2]], { r: 0.035, col: 'black' });
    group.add(arm);
    return { ...t, base: w.p, arm, armFrom: [sx * 0.4, -0.12, w.p[2]] };
  });

  k.finish(group);
  group.add(steer, flame);
  let t = 0;
  return {
    group, wheels, steer, flame,
    update(st) {
      t += 0.016;
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.position.y = y;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        m.arm.set(m.armFrom, [m.base[0] * 0.85, y, m.base[2]]);
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
      const b = st.boost ?? 1;                        // the garage passes none: show it lit
      const flick = 1 + Math.sin(t * 47) * 0.08 + Math.sin(t * 31) * 0.06;
      flame.scale.set(0.55 + b * 0.55, 0.55 + b * 0.55, (0.18 + b * 1.1) * flick);
      flame.visible = true;
    },
  };
}
