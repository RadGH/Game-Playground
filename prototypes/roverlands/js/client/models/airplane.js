// Tundra Hopper (no reference sheet: an original toy-like high-wing bush plane). Teal and cream, a boxy cabin with big
// side windows for two in tandem, a round engine cowl with a two-blade `prop` (spun from st.lever 0..1, slowly from
// time when there is none), a long straight wing on V struts above the cabin roof, fat soft tyres on sprung legs and
// a steerable nose wheel. The pilot holds a yoke (the `steer` node).
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const T = 'teal', TD = 'tealDark', C = 'cream', K = 'trim';
  const wing = def.parts[0], tailP = def.parts[1];
  const fl = def.seats[0].p[1] - 0.42, roof = wing.p[1] - wing.box[1] - 0.02;       // cabin roof = the wing's underside
  const zb = -0.65, zf = 1.4;                                    // cabin back / windscreen foot

  // --- fuselage: the cabin box, the windscreen, the cowl, the tapering tail ----------------------------------------
  k.box(C, [1.12, 0.5, zf - zb + 0.5], [0, fl + 0.12, (zf + zb) / 2 + 0.25], { bevel: 0.1 });     // belly
  // the cabin is hollow (you see the riders through the glass): a belt band, a roof band, pillars, windows
  const belt = fl + 0.37, wLo = belt + 0.16, wHi = roof - 0.08, L = zf - zb;
  for (const sx of [1, -1]) {
    k.box(T, [0.05, wLo - belt, L], [sx * 0.56, (wLo + belt) / 2, (zf + zb) / 2], { bevel: 0.01 });
    k.box(T, [0.05, roof - wHi, L], [sx * 0.56, (roof + wHi) / 2, (zf + zb) / 2], { bevel: 0.01 });
    const mid = (def.seats[0].p[2] + (def.seats[1]?.p[2] ?? zb)) / 2 - 0.05;
    for (const z of [zb + 0.04, mid, zf - 0.04]) k.box(T, [0.06, wHi - wLo, 0.08], [sx * 0.56, (wHi + wLo) / 2, z], { bevel: 0 });
    k.box('glass', [0.02, wHi - wLo, L - 0.1], [sx * 0.56, (wHi + wLo) / 2, (zf + zb) / 2], { bevel: 0 });
  }
  k.box(T, [1.14, roof - belt, 0.06], [0, (roof + belt) / 2, zb], { bevel: 0.01 });              // back wall
  k.box(T, [1.14, 0.05, L], [0, roof - 0.025, (zf + zb) / 2], { bevel: 0.01 });                   // roof
  k.box('seat', [1.04, 0.03, L], [0, belt - 0.01, (zf + zb) / 2], { bevel: 0 });                  // floor mat
  k.box(TD, [1.16, 0.06, zf - zb + 0.5], [0, belt, (zf + zb) / 2 + 0.25], { bevel: 0.01 });     // belt line
  for (const sx of [1, -1]) k.wedge(T, [0.06, roof - 0.62, 0.0, 0.6], [sx * 0.54, 0.62, zf + 0.29]);   // windscreen side frames
  k.box(T, [1.12, 0.06, 0.1], [0, roof - 0.03, zf], { bevel: 0.01 });
  k.box('glass', [0.98, 0.04, 0.8], [0, roof - 0.32, zf + 0.22], { rot: [0.95, 0, 0], bevel: 0.01 });   // windscreen
  k.cyl(C, 0.46, 0.75, [0, 0.42, 2.25], { axis: 'z', seg: 14, r2: 0.52 });       // cowl
  k.cyl(K, 0.38, 0.06, [0, 0.42, 2.63], { axis: 'z', seg: 14 });
  for (const sx of [1, -1]) k.cyl('darkMetal', 0.04, 0.4, [sx * 0.3, 0.06, 2.3], { axis: 'z', seg: 6 });   // exhaust stubs
  // the tail: a tapered cone from the cabin back to the tailplane
  const tz = tailP.p[2] - tailP.box[2] - 0.15;
  k.cyl(T, 0.16, zb - tz, [0, 0.58, (zb + tz) / 2], { axis: 'z', seg: 10, r2: 0.56 });
  k.box(C, [0.04, 0.1, (zb - tz) * 0.85], [0.0, 0.3, (zb + tz) / 2 + 0.1], { bevel: 0 });   // belly stripe
  k.box(T, [tailP.box[0] * 2, tailP.box[1] * 2, tailP.box[2] * 2], tailP.p, { bevel: 0.02 });   // tailplane = its collider
  k.box(TD, [tailP.box[0] * 2 - 0.1, 0.06, 0.18], [tailP.p[0], tailP.p[1], tailP.p[2] - tailP.box[2] + 0.06], { bevel: 0 });   // elevator
  k.wedge(T, [0.08, 1.05, 0.25, 0.75], [0, tailP.p[1], tailP.p[2] - 0.05]);   // fin, tall at the back
  k.box('tail', [0.05, 0.05, 0.05], [0, tailP.p[1] + 1.05, tailP.p[2] - 0.4], { bevel: 0 });

  // --- wing (= its collider) + struts + lamps --------------------------------------------------------------------
  const [whx, why, whz] = wing.box;
  k.box(C, [whx * 2, why * 2, whz * 2], wing.p, { bevel: 0.03 });
  k.box(T, [whx * 2 + 0.02, why * 2 + 0.01, 0.3], [wing.p[0], wing.p[1], wing.p[2] + whz - 0.15], { bevel: 0.02 });   // leading edge
  for (const sx of [1, -1]) {
    k.box(T, [0.12, why * 2 + 0.06, whz * 2 + 0.04], [sx * (whx - 0.06), wing.p[1], wing.p[2]], { bevel: 0.02 });   // tip
    k.box('amber', [0.04, 0.05, 0.1], [sx * whx, wing.p[1], wing.p[2] + whz - 0.12], { bevel: 0 });
    for (const dz of [0.45, -0.35]) k.tube(K, [[sx * 0.56, fl + 0.3, wing.p[2] + 0.05], [sx * whx * 0.42, wing.p[1] - why, wing.p[2] + dz]], 0.028, { seg: 5 });
  }

  // --- seats + yoke ----------------------------------------------------------------------------------------------
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box('seat', [0.48, 0.1, 0.46], [x, y - 0.05, z + 0.04], { bevel: 0.03 });
    k.box('seat', [0.48, 0.58, 0.1], [x, y + 0.26, z - 0.24], { rot: [-0.12, 0, 0], bevel: 0.03 });
    k.box(K, [0.36, y - 0.1 - fl, 0.36], [x, (y - 0.1 + fl) / 2, z], { bevel: 0.02 });
  }
  k.box(K, [1.0, 0.24, 0.2], [0, 0.48, zf - 0.02], { bevel: 0.03 });              // panel
  const drv = def.seats[0];
  const wheelAt = drv.wheelAt || [drv.p[0], drv.p[1] + 0.2, drv.p[2] + 0.34];
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -1.35;
  const sk = createKit(THREE, opts);
  sk.box(K, [0.3, 0.03, 0.04], [0, 0, 0], { bevel: 0 });
  for (const sx of [1, -1]) sk.box('black', [0.04, 0.03, 0.12], [sx * 0.15, 0, 0.05], { bevel: 0 });
  sk.finish(steer);
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(K, [[wheelAt[0], wheelAt[1], wheelAt[2] + 0.02], [wheelAt[0], 0.48, zf - 0.08]], 0.02, { seg: 5 });

  // --- landing gear --------------------------------------------------------------------------------------------
  const wheels = def.wheels.map((w, i) => {
    const nose = i === 0;
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', rimCol: nose ? 'rim' : 'cream', rim: 0.45 });
    t.group.position.set(...w.p);
    group.add(t.group);
    const from = nose ? [0, 0.05, w.p[2] + 0.05] : [Math.sign(w.p[0]) * 0.45, fl - 0.05, w.p[2]];
    const leg = k.shock(from, [w.p[0] * (nose ? 1 : 0.9), w.p[1], w.p[2]], { r: nose ? 0.035 : 0.045, col: 'darkMetal' });
    leg.userData.detail = false;            // the legs are what holds the plane up: never hide them
    group.add(leg);
    return { ...t, base: w.p, leg, from, nose };
  });

  // --- propeller -------------------------------------------------------------------------------------------------
  const prop = new THREE.Group(); prop.position.set(0, 0.42, 2.72); group.add(prop);
  const pk = createKit(THREE, opts);
  pk.cyl('darkMetal', 0.15, 0.2, [0, 0, -0.02], { axis: 'z', seg: 10, r2: 0.04 });   // spinner
  pk.box('black', [0.12, 1.9, 0.04], [0, 0, 0.0], { rot: [0, 0.25, 0], bevel: 0.01 });
  for (const sy of [1, -1]) pk.box('yellow', [0.12, 0.12, 0.045], [0, sy * 0.89, 0.0], { rot: [0, 0.25, 0], bevel: 0 });
  pk.finish(prop);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), k.mat('blur'));
  disc.position.z = 0.04; disc.castShadow = false; disc.visible = false; prop.add(disc);

  k.finish(group);
  group.add(steer);
  let last = performance.now();
  return {
    group, wheels, steer, prop,
    update(st) {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now;
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.position.y = y;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        m.leg.set(m.from, [m.base[0] * (m.nose ? 1 : 0.9), y, m.base[2]]);
      });
      const lever = st.lever;
      const rate = lever == null ? 3 : 8 + lever * 70;
      prop.rotation.z += rate * dt;
      disc.visible = lever != null && lever > 0.15;
      steer.rotation.z = (st.steer || 0) * -1.2;
    },
  };
}
