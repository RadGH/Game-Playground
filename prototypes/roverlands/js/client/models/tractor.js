// Furrowline Tractor (reference: assets/ref/tractor.webp). Orange with dark grey running gear and cream rims: a long
// bonnet with a dark grille and two lamps, an exhaust stack in front of the cab, a glass cab with pillars and an orange
// roof over the big rear tyres (wide orange fenders), small front tyres on a pivoting axle, a ladder up to the cab
// door on the left, a three-point hitch and a drawbar at the back (def.tow), and a mid-mounted MOWER DECK under the
// belly that drops to the ground: `deck` group, st.forks 0 = raised .. 1 = down (vehicle.js mower, carried in the
// fork-height slot so remote copies draw it too), its blades spin while it is down and the tractor moves. The deck's
// hanger links are struts re-aimed every frame. The cab floor is at the driver's feet (def.seats[0].feet), the roof
// underside clears a Chibi 2.6 head (hips + 1.0). No words, no brands.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const O = 'orange', OD = 'orangeDark', K = 'black', T = 'trim', DM = 'darkMetal', C = 'cream';
  const [bonnet, cab] = def.parts;
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const drv = def.seats[0], bud = def.seats[1];
  const floor = drv.feet[1];                                              // 0.55: cab floor
  const cx = cab.box[0], cz0 = cab.p[2] - cab.box[2], cz1 = cab.p[2] + cab.box[2];   // ±0.62, -1.45..-0.05
  const roofY = cab.p[1] + cab.box[1];                                     // 2.15
  const bx = bonnet.box[0], by0 = bonnet.p[1] - bonnet.box[1], by1 = bonnet.p[1] + bonnet.box[1];   // 0.32..0.92
  const bz0 = bonnet.p[2] - bonnet.box[2], bz1 = bonnet.p[2] + bonnet.box[2];                       // 0.2..2.1

  // --- frame + engine block + transmission under the cab ---------------------------------------------------------
  k.box(DM, [0.7, 0.42, bz1 - cz0 + 0.1], [0, 0.08, (bz1 + cz0) / 2], { bevel: 0.04 });                     // frame rails / sump
  k.box(DM, [1.0, floor + 0.2, cz1 - cz0 + 0.1], [0, (floor - 0.2) / 2, (cz0 + cz1) / 2], { bevel: 0.05 });  // transmission
  k.box(DM, [Math.abs(rw.p[0]) * 2 - rw.w, 0.2, 0.22], [0, rw.p[1] + 0.06, rw.p[2]], { bevel: 0.03 });     // rear axle housing
  k.box(DM, [Math.abs(fw.p[0]) * 2 - fw.w, 0.14, 0.16], [0, fw.p[1] + 0.06, fw.p[2]], { bevel: 0.02 });    // front axle
  k.box(DM, [0.22, 0.4, 0.22], [0, fw.p[1] + 0.25, fw.p[2]], { bevel: 0.03 });                               // its pivot
  k.box(K, [0.86, 0.32, 0.28], [0, 0.05, bz1 + 0.08], { bevel: 0.04 });                                      // front weight block
  for (let i = 0; i < 4; i++) k.box(T, [0.84, 0.02, 0.29], [0, -0.06 + i * 0.075, bz1 + 0.085], { bevel: 0 });

  // --- bonnet: orange, its top slightly lower at the nose; dark grille + two lamps; vents on the sides ------------
  k.box(O, [bx * 2, by1 - by0 - 0.06, bz1 - bz0], [0, (by0 + by1) / 2 - 0.03, (bz0 + bz1) / 2], { bevel: 0.06 });
  k.wedge(O, [bx * 2 - 0.04, 0.09, 0.03, bz1 - bz0 - 0.1], [0, by1 - 0.07, (bz0 + bz1) / 2]);             // crowned top
  k.box(K, [bx * 2 - 0.12, by1 - by0 - 0.22, 0.04], [0, (by0 + by1) / 2 - 0.04, bz1 + 0.005], { bevel: 0.01 });   // grille
  for (let i = 0; i < 4; i++) k.box(T, [bx * 2 - 0.2, 0.025, 0.02], [0, by0 + 0.16 + i * 0.09, bz1 + 0.03], { bevel: 0 });
  for (const sx of [1, -1]) {
    k.box('lamp', [0.16, 0.1, 0.04], [sx * (bx - 0.14), by1 - 0.17, bz1 + 0.03], { bevel: 0.01 });          // headlamps
    for (let i = 0; i < 3; i++) k.box(K, [0.02, 0.16, 0.05], [sx * (bx + 0.005), (by0 + by1) / 2 + 0.04, bz0 + 0.95 + i * 0.1], { rot: [0.35, 0, 0], bevel: 0 });   // side vents
    k.box(OD, [0.02, 0.05, bz1 - bz0 - 0.1], [sx * (bx + 0.005), by0 + 0.06, (bz0 + bz1) / 2], { bevel: 0 });   // lower trim line
  }
  // exhaust stack (left, in front of the cab) + air intake (right)
  k.cyl(K, 0.06, 1.05, [0.24, by1 + 0.5, bz0 + 0.2], { seg: 8 });
  k.cyl(K, 0.075, 0.18, [0.24, by1 + 1.0, bz0 + 0.2], { seg: 8 });
  k.cyl(DM, 0.07, 0.4, [-0.24, by1 + 0.15, bz0 + 0.2], { seg: 8 });

  // --- cab: platform, lower panels, pillars, roof with lamps, glass all round --------------------------------------
  k.box(K, [cx * 2 + 0.04, 0.08, cz1 - cz0], [0, floor - 0.04, cab.p[2]], { bevel: 0.02 });               // floor plate
  const belt = floor + 0.38;
  k.box(O, [cx * 2, belt - floor, 0.06], [0, (belt + floor) / 2, cz1 - 0.03], { bevel: 0.02 });           // front kick panel
  k.box(O, [cx * 2, belt - floor + 0.2, 0.06], [0, (belt + floor + 0.2) / 2, cz0 + 0.03], { bevel: 0.02 });   // rear panel
  const ceil = roofY - 0.08;
  for (const sx of [1, -1]) for (const z of [cz1 - 0.04, cz0 + 0.04]) k.box(K, [0.07, ceil - floor, 0.07], [sx * (cx - 0.035), (ceil + floor) / 2, z], { bevel: 0.015 });
  k.box(O, [cx * 2 + 0.12, 0.13, cz1 - cz0 + 0.16], [0, roofY - 0.02, cab.p[2]], { bevel: 0.05 });       // roof
  k.box(OD, [cx * 2 - 0.2, 0.04, cz1 - cz0 - 0.2], [0, roofY + 0.06, cab.p[2]], { bevel: 0.01 });
  for (const sx of [1, -1]) {
    k.box('lamp', [0.16, 0.06, 0.05], [sx * (cx - 0.12), roofY - 0.02, cz1 + 0.08], { bevel: 0.01 });     // work lamps
    k.box('tail', [0.08, 0.06, 0.04], [sx * (cx - 0.08), roofY - 0.02, cz0 - 0.08], { bevel: 0 });
    // mirror on an arm off the front pillar
    k.tube(K, [[sx * cx, ceil - 0.25, cz1 - 0.04], [sx * (cx + 0.24), ceil - 0.2, cz1 - 0.04], [sx * (cx + 0.24), ceil - 0.05, cz1 - 0.04]], 0.015, { seg: 4 });
    k.box(K, [0.05, 0.22, 0.13], [sx * (cx + 0.26), ceil - 0.12, cz1 - 0.05], { bevel: 0.015 });
  }
  // dash, steering column, seat, buddy seat
  k.box(T, [0.6, 0.32, 0.2], [0, floor + 0.32, cz1 - 0.14], { bevel: 0.04 });                              // dash pod
  k.box(K, [0.34, 0.08, 0.02], [0, floor + 0.46, cz1 - 0.25], { bevel: 0 });                              // gauges
  const W = drv.wheelAt;
  k.tube(T, [[W[0], W[1] - 0.03, W[2] + 0.02], [W[0], floor + 0.4, cz1 - 0.22]], 0.03, { seg: 6 });
  {
    const [x, y, z] = drv.p;
    k.box('seat', [0.5, 0.11, 0.46], [x, y - 0.1, z + 0.02], { bevel: 0.04 });
    k.box(K, [0.12, y - 0.15 - floor, 0.12], [x, (y - 0.15 + floor) / 2, z], { bevel: 0.02 });             // seat post
    k.box('seat', [0.5, 0.62, 0.11], [x, y + 0.28, z - 0.27], { rot: [-0.12, 0, 0], bevel: 0.04 });
    for (const sx of [1, -1]) k.box(K, [0.05, 0.05, 0.3], [x + sx * 0.27, y + 0.08, z - 0.05], { bevel: 0.01 });   // arm rests
  }
  {
    const [x, y, z] = bud.p;
    k.box(O, [0.34, y - 0.08 - floor, 0.5], [x - 0.04, (y - 0.08 + floor) / 2, z + 0.05], { bevel: 0.03 });  // fender box inside the cab
    k.box('seat', [0.34, 0.07, 0.38], [x, y - 0.06, z + 0.04], { bevel: 0.03 });
    k.box('seat', [0.34, 0.4, 0.08], [x, y + 0.2, z - 0.2], { rot: [-0.1, 0, 0], bevel: 0.03 });
  }
  // glass: front, back, both sides (one see-through mesh)
  const gl = [];
  const pane = (w, h, d, p) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(...p); gl.push(g); };
  pane(cx * 2 - 0.1, ceil - belt, 0.02, [0, (ceil + belt) / 2, cz1 - 0.04]);
  pane(cx * 2 - 0.1, ceil - belt - 0.2, 0.02, [0, (ceil + belt + 0.2) / 2, cz0 + 0.04]);
  for (const sx of [1, -1]) pane(0.02, ceil - floor - 0.05, cz1 - cz0 - 0.1, [sx * (cx - 0.035), (ceil + floor + 0.05) / 2, cab.p[2]]);
  const glass = new THREE.Mesh(mergeAll(THREE, gl), k.mat('glass'));
  glass.renderOrder = 2;

  // ladder up to the left door, in front of the rear tyre
  const lz = rw.p[2] + rw.r + 0.12, lx = cx + 0.08, foot = rw.p[1] - rw.r + 0.42;
  for (const dz of [-0.13, 0.13]) k.tube(K, [[lx, foot, lz + dz], [lx, floor, lz + dz]], 0.02, { seg: 4 });
  for (let i = 0; i < 3; i++) k.box(T, [0.12, 0.03, 0.26], [lx, foot + (i + 0.4) * (floor - foot) / 3, lz], { bevel: 0 });
  k.tube(K, [[cx + 0.02, floor + 0.1, cz1 + 0.02], [cx + 0.1, floor + 0.7, cz1 + 0.02]], 0.018, { seg: 4 });  // grab handle

  // --- rear fenders: an orange arch over each big tyre, flat on top out to the cab -----------------------------------
  for (const w of def.wheels.filter(w => w.p[2] < 0)) {
    const [x, y, z] = w.p, hubY = y + 0.11, R = w.r + 0.1, sx = Math.sign(x);
    for (let i = 0; i < 7; i++) {
      const a = -1.25 + i * (2.5 / 6);
      k.box(O, [w.w + 0.16, 0.06, R * 0.42], [x, hubY + Math.cos(a) * R, z + Math.sin(a) * R], { rot: [a, 0, 0], bevel: 0.015 });
    }
    k.box(O, [Math.abs(x) - cx + 0.02, 0.06, R * 1.5], [sx * (cx + (Math.abs(x) - cx) / 2), hubY + R - 0.02, z], { bevel: 0.015 });
    k.box('tail', [0.06, 0.1, 0.04], [x + sx * 0.18, hubY + R * 0.55, z - R * 0.83], { bevel: 0 });
    k.box('amber', [0.06, 0.08, 0.04], [x - sx * 0.12, hubY + R * 0.55, z - R * 0.83], { bevel: 0 });
  }

  // --- rear: three-point hitch (two lower arms, a top link), a PTO stub, the drawbar to def.tow --------------------
  const [, ty, tz] = def.tow;
  for (const sx of [1, -1]) {
    k.tube(DM, [[sx * 0.34, rw.p[1] + 0.02, cz0 + 0.1], [sx * 0.42, rw.p[1] - 0.1, tz + 0.15]], 0.04, { seg: 6 });     // lower arm
    k.cyl(K, 0.05, 0.08, [sx * 0.42, rw.p[1] - 0.1, tz + 0.15], { axis: 'x', seg: 8 });
    k.tube(T, [[sx * 0.34, floor + 0.05, cz0 + 0.05], [sx * 0.42, rw.p[1] - 0.06, tz + 0.35]], 0.025, { seg: 5 });     // lift rod
  }
  k.tube(DM, [[0, floor + 0.25, cz0], [0, floor + 0.15, tz + 0.3]], 0.04, { seg: 6 });                       // top link
  k.cyl(DM, 0.04, 0.2, [0, rw.p[1] + 0.12, cz0 - 0.1], { axis: 'z', seg: 8 });                              // PTO stub
  k.box(DM, [0.14, 0.06, Math.abs(tz - cz0) + 0.05], [0, ty, (tz + cz0) / 2 - 0.02], { bevel: 0.015 });     // drawbar
  const ring = new THREE.TorusGeometry(0.07, 0.022, 5, 12); ring.rotateX(Math.PI / 2); ring.translate(0, ty, tz);     // the pin eye

  // --- mower deck: hangs under the belly between the axles; group origin = the deck's bottom-centre ----------------
  const M = def.mower;
  const deck = new THREE.Group();
  const dk = createKit(THREE, opts);
  const dw = M.hw, dd = M.hd;
  dk.box(O, [dw * 2, 0.12, dd * 2], [0, 0.16, 0], { bevel: 0.04 });                                          // shell
  dk.box(O, [dw * 2 + 0.04, 0.1, 0.05], [0, 0.07, dd - 0.02], { bevel: 0.01 });                             // front skirt
  dk.box(O, [dw * 2 + 0.04, 0.1, 0.05], [0, 0.07, -dd + 0.02], { bevel: 0.01 });
  for (const sx of [1, -1]) dk.box(O, [0.05, 0.1, dd * 2], [sx * (dw - 0.01), 0.07, 0], { bevel: 0.01 });
  dk.box(OD, [0.36, 0.08, 0.3], [-dw + 0.12, 0.14, 0], { bevel: 0.02 });                                     // discharge chute (right)
  for (const x of [-0.55, 0, 0.55]) dk.cyl(DM, 0.1, 0.1, [x * dw / 1.0, 0.27, 0], { seg: 10 });             // spindle housings
  for (const sx of [1, -1]) for (const sz of [1, -1]) {                                                      // castor wheels
    const X = sx * (dw - 0.05), Z = sz * (dd + 0.08);
    dk.box(DM, [0.04, 0.14, 0.04], [X, 0.12, Z], { bevel: 0 });
    dk.cyl(K, 0.065, 0.05, [X, 0.065, Z], { axis: 'x', seg: 10 });
  }
  dk.finish(deck);
  // blades: one spinning disc of three blades per spindle, under the shell
  const blades = [];
  for (const x of [-0.55, 0, 0.55]) {
    const b = new THREE.Group(); b.position.set(x * dw, 0.07, 0);
    const bk = createKit(THREE, opts);
    bk.box('steel', [dd * 1.5, 0.012, 0.07], [0, 0, 0], { bevel: 0 });
    bk.box('steel', [dd * 1.5, 0.012, 0.07], [0, 0, 0], { rot: [0, Math.PI / 3, 0], bevel: 0 });
    bk.box('steel', [dd * 1.5, 0.012, 0.07], [0, 0, 0], { rot: [0, -Math.PI / 3, 0], bevel: 0 });
    bk.finish(b); b.traverse(o => { o.userData.detail = true; });
    deck.add(b); blades.push(b);
  }
  deck.position.set(M.p[0], 0, M.p[2]);
  // hanger links: frame -> deck corners (struts re-aimed as the deck moves)
  const hangers = [];
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    const top = [sx * 0.32, -0.12, M.p[2] + sz * (dd - 0.12)], s = k.shock(top, top, { r: 0.03, col: DM });
    hangers.push({ s, top, at: [sx * (dw - 0.3), 0.22, sz * (dd - 0.12)] });
  }

  // --- wheels -------------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const big = w.p[2] < 0;
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: big ? 22 : 16, rimCol: C, rim: big ? 0.52 : 0.55 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p, def: w };
  });

  // steering wheel (its own group: riders.js puts the hands on it)
  const steer = new THREE.Group(); steer.position.set(...W); steer.rotation.x = -0.95;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.022, 0.022], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.04, 0.05, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 5, 14), k.mat(K)));
  steer.traverse(o => { o.userData.detail = true; });

  k.finish(group);
  const ringMesh = new THREE.Mesh(ring, k.mat(DM)); ringMesh.userData.detail = true;
  group.add(glass, steer, deck, ringMesh, ...hangers.map(h => h.s));

  let down = 0, bladeA = 0, lastSpin = null;
  const v3 = new THREE.Vector3();
  return {
    group, wheels, steer, deck,
    update(st) {
      let ground = 0, n = 0;
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.11) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        if (m.def.p[2] < 0) { ground += m.group.position.y - m.def.r; n++; }
      });
      ground = n ? ground / n : rw.p[1] + 0.06 - rw.r;
      steer.rotation.z = (st.steer || 0) * -2.2;
      // the deck: down = castors on the ground, up = drop metres higher
      down = Math.max(0, Math.min(1, st.forks ?? 0));
      deck.position.y = ground + 0.005 + (1 - down) * (M.drop ?? 0.3);
      for (const h of hangers) { v3.set(...h.at).add(deck.position); h.s.set(h.top, [v3.x, v3.y, v3.z]); }
      // blades spin while the deck is down and the tractor rolls (wheel spin is wrapped: use the step)
      const s = st.wheels?.[2]?.spin ?? 0;
      if (lastSpin != null) { let d = s - lastSpin; d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2; if (down > 0.8) bladeA += Math.abs(d) * 6 + (st.acts?.mower ? 0.35 : 0); }
      lastSpin = s;
      for (const [i, b] of blades.entries()) b.rotation.y = bladeA * (i % 2 ? -1 : 1);
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
