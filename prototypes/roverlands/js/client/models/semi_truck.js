// Longhaul Semi (reference: assets/ref/semi_truck.webp). A red tractor with a chrome grille and bumper, twin chrome
// stacks behind the cab, chrome fuel tanks, a black frame with a fifth-wheel plate and flat black fenders over the
// tandem drive axles. The reference is a long-nose truck, but the physics puts the cab right over the front axle
// (cab collider z 0.95 .. 2.85, seats at z 1.9), so this is drawn as a short-snout cab-over: same parts and colours,
// a cab that sits where its collider is. Head clearance: seat 0.9 + 1.13 = 2.03 under a 2.07 ceiling.
// The fifth-wheel plate is drawn 15 cm under the tow point (def.tow) so a hitched trailer's floor rests on it
// instead of sinking into it; the walkway behind the cab is at the chassis collider's top (0.47).
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const R = 'red', RD = 'redDark', K = 'black', T = 'trim', C = 'chrome';
  const ch = def.chassis;
  const deckTop = ch.p[1] + ch.hy;                       // 0.47
  const cab = def.parts[0];
  const cz0 = cab.p[2] - cab.box[2], cz1 = cab.p[2] + cab.box[2];     // 0.95 .. 2.85
  const cx = cab.box[0];                                  // 1.1
  const belt = 1.32, ceil = cab.p[1] + cab.box[1] + 0.02;   // window line, inner roof (2.07)
  const cabBot = 0.55, czM = (cz0 + cz1) / 2, cl = cz1 - cz0;

  // --- frame ---------------------------------------------------------------------------------------------------
  for (const sx of [1, -1]) k.box(K, [0.14, 0.32, ch.hz * 2 - 0.1], [sx * 0.42, 0.04, -0.05], { bevel: 0.02 });
  for (const z of [-2.9, -1.95, -0.95, 0.4, 2.5]) k.box(K, [0.74, 0.1, 0.12], [0, 0.0, z], { bevel: 0.01 });
  // rear: crossmember with tail lamps, mud flaps behind the last axle
  k.box(K, [1.9, 0.18, 0.12], [0, 0.08, -ch.hz + 0.06], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    k.box('tail', [0.2, 0.08, 0.04], [sx * 0.7, 0.1, -ch.hz - 0.01], { bevel: 0 });
    k.box('amber', [0.08, 0.08, 0.04], [sx * 0.4, 0.1, -ch.hz - 0.01], { bevel: 0 });
    k.box(K, [0.4, 0.55, 0.03], [sx * 1.05, -0.3, -3.08], { bevel: 0.01 });
  }

  // --- tandem fenders: flat black plates over both drive axles, under where a trailer's floor rides -------------
  const rearW = def.wheels.filter(w => w.drive);
  const rz0 = Math.min(...rearW.map(w => w.p[2])) - 0.6, rz1 = Math.max(...rearW.map(w => w.p[2])) + 0.6;
  for (const sx of [1, -1]) {
    k.box(K, [0.46, 0.06, rz1 - rz0], [sx * 1.04, 0.36, (rz0 + rz1) / 2], { bevel: 0.02 });
    k.box(K, [0.46, 0.2, 0.06], [sx * 1.04, 0.27, rz1], { bevel: 0.01 });
    k.box(K, [0.46, 0.2, 0.06], [sx * 1.04, 0.27, rz0], { bevel: 0.01 });
    k.box(T, [0.36, 0.3, 0.14], [sx * 0.62, 0.2, (rz0 + rz1) / 2], { bevel: 0.02 });   // fender bracket
  }

  // --- fifth wheel (the pivot is def.tow; the plate top sits 0.15 under it) -------------------------------------
  const [, ty, tz] = def.tow;
  const plateTop = ty - 0.15;
  k.box(T, [1.0, plateTop - 0.2, 0.7], [0, (plateTop + 0.2) / 2 - 0.03, tz], { bevel: 0.03 });
  k.cyl(K, 0.58, 0.07, [0, plateTop - 0.035, tz], { seg: 18 });
  for (const sx of [1, -1]) k.box(T, [0.22, 0.02, 0.5], [sx * 0.2, plateTop + 0.005, tz - 0.32], { rot: [0, sx * 0.35, 0], bevel: 0 });   // the V slot
  k.box(K, [0.9, 0.05, 0.5], [0, plateTop - 0.1, tz - 0.72], { rot: [-0.25, 0, 0], bevel: 0.01 });   // lead-in ramp

  // --- walkway behind the cab (on the chassis collider's top) + battery boxes, fuel tanks, stacks ---------------
  const wz0 = tz + 0.75, wz1 = cz0 - 0.08;
  k.box(T, [1.1, 0.05, wz1 - wz0], [0, deckTop - 0.025, (wz0 + wz1) / 2], { bevel: 0.01 });
  for (let z = wz0 + 0.12; z < wz1; z += 0.18) k.box(K, [1.0, 0.012, 0.04], [0, deckTop + 0.004, z], { bevel: 0 });
  for (const sx of [1, -1]) {
    k.cyl(C, 0.3, 1.05, [sx * 0.84, 0.0, -0.32], { axis: 'z', seg: 14 });              // fuel tank
    for (const z of [-0.7, 0.06]) k.cyl(K, 0.31, 0.05, [sx * 0.84, 0.0, z], { axis: 'z', seg: 14 });   // straps
    k.box(K, [0.4, 0.42, 0.4], [sx * 0.86, 0.06, 0.55], { bevel: 0.03 });              // battery box
    k.box(C, [0.42, 0.04, 0.42], [sx * 0.86, 0.28, 0.55], { bevel: 0.01 });
    // exhaust stack: a pipe up the back corner of the cab, a perforated shield, a curved tip
    const sx2 = sx * 1.0, sz = cz0 - 0.1;
    k.cyl(C, 0.07, 2.2, [sx2, 1.55, sz], { seg: 10 });
    k.cyl('metal', 0.1, 0.9, [sx2, 1.45, sz], { seg: 10 });
    k.tube(C, [[sx2, 2.65, sz], [sx2, 2.8, sz - 0.03], [sx2, 2.88, sz - 0.12]], 0.07, { seg: 10 });
    k.box(T, [0.12, 0.06, 0.12], [sx2 - sx * 0.07, 1.1, sz], { bevel: 0 });            // clamp to the cab
    k.box(T, [0.12, 0.06, 0.12], [sx2 - sx * 0.07, 1.9, sz], { bevel: 0 });
  }

  // --- cab -------------------------------------------------------------------------------------------------------
  k.box(R, [cx * 2, belt - cabBot, cl], [0, (belt + cabBot) / 2, czM], { bevel: 0.06 });      // lower body
  k.box(R, [cx * 2, ceil - belt, 0.12], [0, (ceil + belt) / 2, cz0 + 0.06], { bevel: 0.03 });   // back wall
  k.box(R, [cx * 2, 0.11, cl], [0, ceil + 0.055, czM], { bevel: 0.04 });                         // roof
  k.wedge(R, [cx * 2 - 0.1, 0.38, 0.06, cl - 0.35], [0, ceil + 0.11, czM - 0.15]);               // roof fairing
  k.box(RD, [cx * 2 - 0.06, 0.1, 0.22], [0, ceil + 0.15, cz1 - 0.05], { rot: [0.3, 0, 0], bevel: 0.02 });   // sun visor
  for (let i = -2; i <= 2; i++) k.box('amber', [0.1, 0.05, 0.05], [i * 0.36, ceil + 0.23, cz1 + 0.02], { bevel: 0 });
  // pillars + window frames
  for (const sx of [1, -1]) {
    k.box(R, [0.07, ceil - belt, 0.09], [sx * (cx - 0.035), (ceil + belt) / 2, cz1 - 0.045], { bevel: 0.01 });   // A
    k.box(R, [0.07, ceil - belt, 0.12], [sx * (cx - 0.035), (ceil + belt) / 2, cz0 + 0.18], { bevel: 0.01 });    // B
    k.box('glass', [0.03, ceil - belt - 0.06, cl - 0.38], [sx * (cx - 0.03), (ceil + belt) / 2, czM + 0.05], { bevel: 0 });
    // door seams, handle, a dark step plate under the door
    k.box(RD, [0.012, belt - cabBot - 0.1, 0.03], [sx * (cx + 0.005), (belt + cabBot) / 2, cz0 + 0.3], { bevel: 0 });
    k.box(RD, [0.012, belt - cabBot - 0.1, 0.03], [sx * (cx + 0.005), (belt + cabBot) / 2, cz1 - 0.6], { bevel: 0 });
    k.box(C, [0.03, 0.04, 0.16], [sx * (cx + 0.015), belt - 0.18, cz0 + 0.45], { bevel: 0 });
    // mirrors on arms off the A pillar
    k.tube(T, [[sx * cx, 1.45, cz1 - 0.12], [sx * (cx + 0.24), 1.5, cz1 - 0.12], [sx * (cx + 0.24), 1.95, cz1 - 0.12]], 0.018, { seg: 4 });
    k.box(T, [0.1, 0.42, 0.16], [sx * (cx + 0.27), 1.7, cz1 - 0.14], { bevel: 0.02 });
    k.box('glass', [0.02, 0.36, 0.12], [sx * (cx + 0.32), 1.7, cz1 - 0.14], { bevel: 0 });
  }
  k.box(R, [0.06, ceil - belt, 0.06], [0, (ceil + belt) / 2, cz1 - 0.03], { bevel: 0.01 });     // windscreen divider
  k.box('glass', [cx * 2 - 0.12, ceil - belt - 0.06, 0.03], [0, (ceil + belt) / 2, cz1 - 0.04], { bevel: 0 });

  // --- snout: grille, lamps, fenders over the front wheels, bumper ----------------------------------------------
  const fw = def.wheels.find(w => w.steer);
  const fz = fw.p[2], fy = fw.p[1], fr = fw.r;
  k.box(R, [1.5, cabBot + 0.25, 0.4], [0, (cabBot - 0.25) / 2, cz1 - 0.15], { bevel: 0.04 });   // fascia between the wheels
  k.box(C, [1.06, 1.0, 0.1], [0, 0.62, cz1 + 0.05], { bevel: 0.03 });                          // grille frame
  k.box(K, [0.9, 0.86, 0.06], [0, 0.62, cz1 + 0.08], { bevel: 0 });
  for (let i = -4; i <= 4; i++) k.box(C, [0.04, 0.8, 0.04], [i * 0.095, 0.62, cz1 + 0.11], { bevel: 0 });
  k.box(C, [0.95, 0.05, 0.05], [0, 1.08, cz1 + 0.11], { bevel: 0 });
  for (const sx of [1, -1]) {
    // fender: a red box over the wheel with an arch of slats under its edges
    k.box(R, [0.44, 0.36, 1.3], [sx * (cx - 0.16), cabBot - 0.16, fz + 0.05], { bevel: 0.04 });
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6, RR = fr + 0.1;
      k.box(RD, [0.4, 0.05, RR * 0.6], [sx * (cx - 0.12), fy + 0.08 + Math.cos(a) * RR, fz + Math.sin(a) * RR], { rot: [a, 0, 0], bevel: 0.01 });
    }
    // headlamps in the fender fronts, marker lamps
    k.box(C, [0.42, 0.22, 0.06], [sx * 0.86, 0.32, cz1 + 0.07], { bevel: 0.02 });
    for (const dx of [-0.09, 0.09]) k.box('lamp', [0.15, 0.15, 0.04], [sx * 0.86 + dx, 0.32, cz1 + 0.1], { bevel: 0.01 });
    k.box('amber', [0.1, 0.06, 0.04], [sx * 0.86, 0.5, cz1 + 0.07], { bevel: 0 });
    // steps behind the front wheel
    k.box(T, [0.3, 0.05, 0.42], [sx * (cx - 0.1), 0.2, cz0 + 0.38], { bevel: 0.01 });
    k.box(T, [0.3, 0.05, 0.42], [sx * (cx - 0.1), -0.12, cz0 + 0.38], { bevel: 0.01 });
    k.box(R, [0.06, 0.62, 0.48], [sx * (cx - 0.22), 0.09, cz0 + 0.38], { bevel: 0.01 });
  }
  k.box(C, [cx * 2 + 0.16, 0.36, 0.26], [0, -0.22, cz1 + 0.17], { bevel: 0.05 });               // bumper
  k.box(K, [0.6, 0.08, 0.04], [0, -0.22, cz1 + 0.31], { bevel: 0 });
  for (const sx of [1, -1]) k.box(T, [0.12, 0.06, 0.04], [sx * 0.7, -0.24, cz1 + 0.31], { bevel: 0 });

  // --- inside: floor, dash, seats, steering ------------------------------------------------------------------
  k.box(T, [cx * 2 - 0.1, 0.04, cl - 0.15], [0, deckTop + 0.02, czM], { bevel: 0 });
  k.box(T, [cx * 2 - 0.12, 0.28, 0.3], [0, belt - 0.05, cz1 - 0.2], { bevel: 0.03 });
  k.box(K, [0.5, 0.1, 0.26], [0.5, belt + 0.12, cz1 - 0.22], { rot: [-0.3, 0, 0], bevel: 0.02 });   // gauge pod
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box(T, [0.4, y - 0.12 - deckTop, 0.4], [x, (y - 0.12 + deckTop) / 2, z], { bevel: 0.02 });      // pedestal
    k.box('seat', [0.52, 0.12, 0.5], [x, y - 0.06, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.52, 0.68, 0.12], [x, y + 0.3, z - 0.26], { rot: [-0.1, 0, 0], bevel: 0.04 });
  }
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -1.15;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.34, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.box(T, [0.02, 0.025, 0.17], [0, 0, -0.085], { bevel: 0 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 5, 14), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.04], [wheelAt[0], belt - 0.1, cz1 - 0.25]], 0.03);

  // --- wheels ----------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 18, rimCol: w.steer ? C : 'metal', rim: 0.58 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  // axle beams (fixed; the tyres ride a little up and down on them)
  for (const z of [...new Set(def.wheels.map(w => w.p[2]))]) k.box(T, [1.8, 0.12, 0.14], [0, fy + 0.05, z], { bevel: 0.02 });
  for (const z of rearW.map(w => w.p[2]).filter((z, i, a) => a.indexOf(z) === i)) k.cyl(T, 0.2, 0.3, [0, fy + 0.05, z], { axis: 'z', seg: 10 });   // diff

  k.finish(group);
  group.add(steer);
  return {
    group, wheels, steer,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.4;
    },
  };
}
