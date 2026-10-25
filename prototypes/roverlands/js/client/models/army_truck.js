// Trailhauler Six (reference: assets/ref/army_truck.webp). A six-wheel olive cargo truck: a flat-fronted cab (its
// box = the cab collider, roof 2.11 over seated heads at 1.98) with round lamps, a slatted grille and tall mirrors;
// an open bed whose floor is the chassis top (0.45), plank-topped benches along both sides and slatted side rails,
// all where their colliders are. No markings or insignia. The tailgate (`tailgate` node) is hinged at the bed's rear
// edge and swings down from st.acts.door_tailgate to the open collider's slope, a ramp plate sliding out of it to
// the full 2.5 m so it reaches the ground. Ground sits ~0.94 m under the body origin at rest; hubs at y ≈ -0.39.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const O = 'olive', OD = 'oliveDark', OP = 'olivePale', K = 'black', T = 'trim', W = 'wood';
  const ch = def.chassis;
  const floor = ch.p[1] + ch.hy;                                       // 0.45
  const P = name => def.parts.find(p => p._doc?.startsWith(name));
  const cab = def.parts[0];
  const [cx, cy, cz] = cab.box, cabZ0 = cab.p[2] - cz, cabZ1 = cab.p[2] + cz, roofY = cab.p[1] + cy;   // 1.8..3.6, 2.11
  const wallF = P('bed front wall');
  const rail = P('side rails');
  const bench = P('benches');
  const gate = def.parts.find(p => p.door === 'tailgate');
  const bedZ0 = gate.p[2], bedZ1 = wallF.p[2];                         // -3.56 .. 1.66
  const railTop = rail.p[1] + rail.box[1];                             // 1.15
  const railX = rail.p[0];                                             // 1.16
  const belt = 1.34;                                                   // cab window sill

  // --- under: frame rails, tanks, bumpers ------------------------------------------------------------------------
  for (const sx of [1, -1]) k.box('darkMetal', [0.16, 0.26, 7.1], [sx * 0.5, 0.14, 0], { bevel: 0.02 });
  for (const z of [3.0, 0.8, -1.75, -3.3]) k.box('darkMetal', [1.0, 0.12, 0.12], [0, 0.12, z], { bevel: 0.01 });
  k.box(OD, [0.46, 0.4, 1.3], [-0.92, 0.14, 0.75], { bevel: 0.06 });                     // fuel tank
  k.box(T, [0.06, 0.06, 1.2], [-1.16, 0.26, 0.75], { bevel: 0 });
  k.box(K, [0.46, 0.36, 0.9], [0.92, 0.14, 0.85], { bevel: 0.04 });                      // tool box
  k.box(T, [0.04, 0.05, 0.12], [1.16, 0.2, 0.85], { bevel: 0 });
  k.box(K, [2.5, 0.32, 0.26], [0, 0.16, cabZ1 + 0.08], { bevel: 0.05 });                // front bumper
  for (const sx of [1, -1]) k.box('steel', [0.1, 0.14, 0.12], [sx * 0.7, 0.16, cabZ1 + 0.24], { bevel: 0.02 });   // tow hooks
  k.box(K, [2.0, 0.2, 0.2], [0, -0.02, bedZ0 - 0.05], { bevel: 0.03 });                  // rear bumper
  for (const sx of [1, -1]) {
    k.box('tail', [0.2, 0.12, 0.04], [sx * 1.0, 0.24, bedZ0 - 0.08], { bevel: 0.01 });
    k.box('amber', [0.1, 0.12, 0.04], [sx * 0.78, 0.24, bedZ0 - 0.08], { bevel: 0.01 });
    k.box(T, [0.16, 0.36, 0.2], [sx * 1.0, 0.25, bedZ0 - 0.02], { bevel: 0.02 });      // lamp bracket
  }

  // --- cab: lower shell, rear wall, roof, pillars, glass ----------------------------------------------------------
  const cw = cx * 2;
  k.box(O, [cw, belt - floor, 0.14], [0, (belt + floor) / 2, cabZ1 - 0.07], { bevel: 0.05 });            // front face
  for (const sx of [1, -1]) {
    k.box(O, [0.12, belt - floor, cz * 2 - 0.1], [sx * (cx - 0.06), (belt + floor) / 2, cab.p[2]], { bevel: 0.04 });   // side
    k.box(K, [0.02, belt - floor - 0.1, 0.02], [sx * (cx + 0.005), (belt + floor) / 2 + 0.05, cabZ0 + 0.12], { bevel: 0 });   // door seams
    k.box(K, [0.02, belt - floor - 0.1, 0.02], [sx * (cx + 0.005), (belt + floor) / 2 + 0.05, cabZ1 - 0.6], { bevel: 0 });
    k.box(T, [0.03, 0.04, 0.16], [sx * (cx + 0.01), belt - 0.16, cabZ0 + 0.3], { bevel: 0 });               // handle
    k.box(K, [0.4, 0.06, 0.3], [sx * (cx - 0.1), floor - 0.08, cabZ0 + 0.18], { bevel: 0.01 });            // step
    // pillars
    k.box(O, [0.12, roofY - belt, 0.12], [sx * (cx - 0.06), (roofY + belt) / 2, cabZ1 - 0.1], { bevel: 0.02 });
    k.box(O, [0.12, roofY - belt, 0.16], [sx * (cx - 0.06), (roofY + belt) / 2, cabZ0 + 0.1], { bevel: 0.02 });
    k.box(O, [0.1, roofY - belt, 0.08], [sx * (cx - 0.06), (roofY + belt) / 2, cabZ1 - 0.62], { bevel: 0.01 });
    // round lamps, indicators, mirror on an arm
    k.cyl('lamp', 0.13, 0.05, [sx * 0.82, 0.86, cabZ1 + 0.01], { axis: 'z', seg: 12 });
    k.cyl(K, 0.16, 0.04, [sx * 0.82, 0.86, cabZ1 - 0.005], { axis: 'z', seg: 12 });
    k.box('amber', [0.12, 0.08, 0.04], [sx * 0.82, 0.62, cabZ1 + 0.01], { bevel: 0.01 });
    k.tube(T, [[sx * cx, belt + 0.1, cabZ1 - 0.2], [sx * (cx + 0.2), belt + 0.12, cabZ1 - 0.22], [sx * (cx + 0.2), belt + 0.5, cabZ1 - 0.22]], 0.02, { seg: 4 });
    k.box(K, [0.07, 0.4, 0.2], [sx * (cx + 0.22), belt + 0.34, cabZ1 - 0.24], { bevel: 0.02 });
  }
  k.box(O, [cw, roofY - floor, 0.1], [0, (roofY + floor) / 2, cabZ0 + 0.05], { bevel: 0.03 });              // rear wall
  k.box(O, [cw + 0.04, 0.1, cz * 2 + 0.04], [0, roofY + 0.0, cab.p[2]], { bevel: 0.04 });                  // roof
  k.box(OP, [cw - 0.4, 0.04, cz * 2 - 0.4], [0, roofY + 0.06, cab.p[2]], { bevel: 0.02 });                 // roof panel
  k.box(O, [cw, 0.1, 0.12], [0, belt - 0.02, cabZ1 - 0.08], { bevel: 0.02 });                               // under the windscreen
  // grille
  k.box(K, [0.9, 0.42, 0.04], [0, 0.82, cabZ1 + 0.01], { bevel: 0.01 });
  for (let i = 0; i < 6; i++) k.box(OD, [0.84, 0.035, 0.03], [0, 0.65 + i * 0.068, cabZ1 + 0.03], { bevel: 0 });
  // cab interior: floor mat, dash, two seats, steering wheel
  k.box(K, [cw - 0.24, 0.02, cz * 2 - 0.2], [0, floor + 0.01, cab.p[2]], { bevel: 0 });
  k.box(T, [cw - 0.24, 0.32, 0.4], [0, belt - 0.12, cabZ1 - 0.34], { bevel: 0.04 });
  for (const s of def.seats.slice(0, 2)) {
    const [x, y, z] = s.p;
    k.box('seat', [0.56, y - 0.05 - floor, 0.52], [x, (y - 0.05 + floor) / 2, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.56, 0.72, 0.12], [x, y + 0.3, z - 0.26], { rot: [-0.1, 0, 0], bevel: 0.04 });
  }
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.6;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.3, 0.025, 0.025], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.045, 0.05, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 5, 14), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.04, wheelAt[2] + 0.04], [wheelAt[0], belt - 0.2, cabZ1 - 0.3]], 0.03, { seg: 6 });
  // exhaust stack + air intake behind the cab
  k.cyl('darkMetal', 0.07, 1.9, [-(cx + 0.1), 1.4, cabZ0 - 0.04], { seg: 8 });
  k.cyl(K, 0.08, 0.2, [-(cx + 0.1), 2.3, cabZ0 - 0.04], { seg: 8 });
  k.box(OD, [0.2, 0.9, 0.22], [cx + 0.1, 1.35, cabZ0 - 0.04], { bevel: 0.03 });

  // glass: windscreen + two side windows a side, one see-through mesh
  const gl = [];
  const pane = (w, h, d, p) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(...p); gl.push(g); };
  pane(cw - 0.2, roofY - belt - 0.06, 0.02, [0, (roofY + belt) / 2, cabZ1 - 0.1]);
  for (const sx of [1, -1]) {
    pane(0.02, roofY - belt - 0.06, 0.4, [sx * (cx - 0.06), (roofY + belt) / 2, cabZ1 - 0.38]);
    pane(0.02, roofY - belt - 0.06, 0.95, [sx * (cx - 0.06), (roofY + belt) / 2, cabZ0 + 0.7]);
  }
  pane(cw - 0.6, 0.4, 0.02, [0, belt + 0.25, cabZ0 + 0.11]);                                              // small rear window
  const glass = new THREE.Mesh(mergeAll(THREE, gl), k.mat('glass'));
  glass.renderOrder = 2;

  // front fenders: black flares round each front arch
  for (const w of def.wheels.filter(w => w.p[2] > 0)) {
    const sx = Math.sign(w.p[0]), x = w.p[0] + sx * 0.02, R = w.r + 0.1, hubY = w.p[1] + 0.06;
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6;
      k.box(K, [w.w + 0.12, 0.06, R * 0.62], [x, Math.min(floor - 0.02, hubY + Math.cos(a) * R), w.p[2] + Math.sin(a) * R], { rot: [a, 0, 0], bevel: 0.01 });
    }
  }

  // --- bed: floor (= chassis top), front wall, slatted side rails, benches -----------------------------------------
  const bedLen = bedZ1 - bedZ0 + 0.12, bedMid = (bedZ1 + bedZ0) / 2;
  k.box(O, [cw, 0.1, bedLen], [0, floor - 0.05, bedMid], { bevel: 0.02 });
  for (let i = -5; i <= 5; i++) k.box(OD, [0.02, 0.01, bedLen - 0.1], [i * 0.2, floor + 0.003, bedMid], { bevel: 0 });   // plank lines
  for (const z of [0.0, -1.8]) k.box(K, [cw + 0.04, 0.12, 0.08], [0, floor - 0.12, z], { bevel: 0.01 });             // cross beams
  // front wall: solid with two ribs
  k.box(O, [cw, wallF.box[1] * 2, wallF.box[2] * 2], [0, wallF.p[1], wallF.p[2]], { bevel: 0.02 });
  for (const y of [0.7, 0.95]) k.box(OD, [cw - 0.1, 0.03, 0.03], [0, y, wallF.p[2] - wallF.box[2]], { bevel: 0 });
  // side rails: a solid lower board, an open slot, the top rail and posts
  const railLen = rail.box[2] * 2, rz = rail.p[2], rt = rail.box[0] * 2;
  for (const sx of [1, -1]) {
    const x = sx * railX;
    k.box(O, [rt, 0.46, railLen], [x, floor + 0.23, rz], { bevel: 0.015 });
    k.box(OD, [rt + 0.01, 0.03, railLen], [x, floor + 0.2, rz], { bevel: 0 });
    k.box(O, [rt, 0.12, railLen], [x, railTop - 0.06, rz], { bevel: 0.015 });
    for (let i = 0; i <= 6; i++) k.box(OD, [rt + 0.03, railTop - floor, 0.08], [x, (railTop + floor) / 2, rz - rail.box[2] + 0.04 + i * (railLen - 0.08) / 6], { bevel: 0.01 });
    // mud guards over the rear axles + flaps
    const rw = def.wheels.filter(w => w.p[2] < 0);
    const zs = rw.map(w => w.p[2]), r = rw[0].r;
    k.box(K, [rw[0].w + 0.1, 0.05, Math.max(...zs) - Math.min(...zs) + r * 2 + 0.2], [sx * 1.05, floor - 0.12, (Math.max(...zs) + Math.min(...zs)) / 2], { bevel: 0.01 });
    k.box(K, [rw[0].w + 0.04, 0.42, 0.03], [sx * 1.05, -0.04, Math.min(...zs) - r - 0.12], { bevel: 0 });
  }
  // benches on their colliders: an olive base, a wooden plank seat, end boards
  const [bx, by, bz] = bench.box;
  for (const sx of [1, -1]) {
    const x = sx * Math.abs(bench.p[0]), z = bench.p[2], top = bench.p[1] + by;
    k.box(OD, [bx * 2 - 0.06, by * 2 - 0.06, bz * 2], [x, bench.p[1] - 0.03, z], { bevel: 0.02 });
    k.box(W, [bx * 2 + 0.04, 0.06, bz * 2 + 0.04], [x, top - 0.03, z], { bevel: 0.015 });
    for (let i = 1; i < 4; i++) k.box('woodDark', [bx * 2 + 0.05, 0.062, 0.015], [x, top - 0.03, z - bz + i * bz / 2], { bevel: 0 });
    k.box(W, [0.06, 0.24, bz * 2 - 0.1], [sx * (railX - rt / 2 - 0.035), floor + 0.53, z], { bevel: 0.01 });   // back board on the rail
  }

  // --- tailgate: hinged at the bed's rear edge; open = the ramp collider's slope, a plate slides out to its length --
  const hinge = [0, floor, gate.p[2]];
  const gh = gate.box[1] * 2;                                            // 0.7 tall when closed
  const or = gate.open.rot[0];
  const openA = Math.atan2(-Math.cos(or), Math.sin(or));                 // direction of the ramp from the hinge
  const rampLen = gate.open.box[2] * 2;                                  // 2.5
  const tailgate = new THREE.Group(); tailgate.position.set(...hinge);
  const gk = createKit(THREE, opts);
  gk.box(O, [cw - 0.04, gh, gate.box[2] * 2], [0, gh / 2, 0], { bevel: 0.015 });
  for (const y of [0.18, 0.4, 0.6]) gk.box(OD, [cw - 0.1, 0.03, 0.02], [0, y, gate.box[2]], { bevel: 0 });
  for (const sx of [1, -1]) gk.box(T, [0.08, 0.1, 0.05], [sx * (cx - 0.15), gh - 0.08, gate.box[2]], { bevel: 0.01 });   // latches
  gk.finish(tailgate);
  const ext = new THREE.Group(); ext.position.set(0, gh - 0.05, 0); tailgate.add(ext);
  const ek = createKit(THREE, opts);
  const eLen = rampLen - gh + 0.05, ew = gate.open.box[0] * 2 - 0.1;
  ek.box('steel', [ew, eLen, 0.05], [0, eLen / 2, 0.01], { bevel: 0.01 });
  for (let i = 1; i < 6; i++) ek.box(T, [ew - 0.1, 0.025, 0.02], [0, i * eLen / 6, 0.04], { bevel: 0 });   // grip ribs
  ek.finish(ext);
  ext.visible = false;

  // --- wheels ---------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 16, rimCol: OD, rim: 0.5 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  k.finish(group);
  group.add(glass, steer, tailgate);
  let gateA = 0, lastT = null;
  const setGate = a => {
    tailgate.rotation.x = a;
    const f = Math.min(1, Math.max(0, (a / openA - 0.55) / 0.45));       // the plate slides out over the last part of the swing
    ext.visible = f > 0.01;
    ext.scale.y = Math.max(0.01, f);
  };
  return {
    group, wheels, steer, tailgate,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
      const t = st.t ?? performance.now() / 1000;
      const dt = lastT == null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const want = st.acts?.door_tailgate ? openA : 0;
      gateA += Math.sign(want - gateA) * Math.min(Math.abs(want - gateA), dt * 3);
      setGate(gateA);
    },
  };
}

function mergeAll(THREE, gs) {
  const list = gs.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
