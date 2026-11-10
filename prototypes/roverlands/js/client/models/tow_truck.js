// Hookline Tow Truck (reference: assets/ref/tow_truck.webp). A yellow cab-over-ish truck: a tall cab with a chrome
// grille, black bumper and wheel arches, two amber beacons on a roof bar (models/lightbar.js, both lenses amber,
// flashing from the driver's seat switch st.acts.lights); a headboard with a tall post behind the cab; yellow tool
// lockers along both sides under a dark deck; a crane at the back (black base, yellow boom with a hydraulic ram, a
// sheave, a cable down to a hook); and an UNDER-LIFT under the tail: a black arm out to a crossbar with two wheel forks,
// its middle at def.tow — where a towed car's front bumper (vehicle.js frontHitch) or a trailer's tongue is held.
// Cab floor at the driver's feet; roof underside clears a Chibi 2.6 head. No words, no brands.
import { createKit } from './kit.js';
import { lightBar } from './lightbar.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const Y = 'yellow', YD = 'yellowDark', K = 'black', T = 'trim', DM = 'darkMetal', CH = 'metal';
  const ch = def.chassis, cab = def.parts[0], hb = def.parts[1];
  const cx = cab.box[0], cz0 = cab.p[2] - cab.box[2], cz1 = cab.p[2] + cab.box[2];   // ±1.0, 1.15..2.75
  const roofY = cab.p[1] + cab.box[1];                                    // 1.88
  const drv = def.seats[0], floor = drv.feet[1];                          // 0.3
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const rearZ = ch.p[2] - ch.hz, deckY = ch.p[1] + ch.hy;                 // -3.2, 0.45
  const bodyBot = -0.22;

  // --- chassis rails, fuel tank, exhaust -------------------------------------------------------------------------
  for (const sx of [1, -1]) k.box(K, [0.14, 0.24, cz1 - rearZ], [sx * 0.42, -0.2, (cz1 + rearZ) / 2], { bevel: 0.02 });
  k.box(K, [0.7, 0.12, 0.12], [0, -0.22, rearZ + 0.1], { bevel: 0.02 });
  k.cyl(T, 0.18, 0.7, [-0.75, -0.12, 0.6], { axis: 'z', seg: 10 });                                    // fuel tank (right)

  // --- cab: lower body, front with grille + lamps, upper cabin with glass, roof, steps ------------------------------
  const belt = floor + 0.55;                                              // 0.85: window line
  k.box(Y, [cx * 2, belt - bodyBot, cz1 - cz0], [0, (belt + bodyBot) / 2, (cz0 + cz1) / 2], { bevel: 0.07 });
  k.box(Y, [cx * 2, roofY - belt, 0.12], [0, (roofY + belt) / 2, cz0 + 0.06], { bevel: 0.04 });         // back wall
  for (const sx of [1, -1]) {
    k.box(Y, [0.1, roofY - belt, 0.12], [sx * (cx - 0.05), (roofY + belt) / 2, cz1 - 0.12], { rot: [0.08, 0, 0], bevel: 0.03 });   // A pillar
    k.box(Y, [0.1, roofY - belt, 0.14], [sx * (cx - 0.05), (roofY + belt) / 2, cz0 + 0.5], { bevel: 0.03 });        // B pillar
    k.box(K, [0.02, belt - bodyBot - 0.25, 0.02], [sx * (cx + 0.005), (belt + bodyBot) / 2 + 0.05, cz0 + 0.5], { bevel: 0 });   // door seam
    k.box(K, [0.03, 0.04, 0.14], [sx * (cx + 0.01), belt - 0.1, cz0 + 0.62], { bevel: 0 });                       // handle
    k.box(K, [0.3, 0.05, 0.36], [sx * (cx - 0.12), bodyBot - 0.12, cz0 + 0.55], { bevel: 0.01 });                 // step
    // mirror on a bent arm
    k.tube(K, [[sx * cx, belt + 0.1, cz1 - 0.15], [sx * (cx + 0.2), belt + 0.15, cz1 - 0.15], [sx * (cx + 0.2), belt + 0.55, cz1 - 0.15]], 0.02, { seg: 4 });
    k.box(K, [0.07, 0.36, 0.18], [sx * (cx + 0.22), belt + 0.4, cz1 - 0.15], { bevel: 0.02 });
    k.box('lamp', [0.24, 0.16, 0.04], [sx * (cx - 0.2), 0.3, cz1 + 0.005], { bevel: 0.02 });                       // headlamp
    k.box('amber', [0.1, 0.07, 0.04], [sx * (cx - 0.2), 0.16, cz1 + 0.005], { bevel: 0.01 });
  }
  k.box(Y, [cx * 2 + 0.06, 0.1, cz1 - cz0 + 0.06], [0, roofY - 0.03, (cz0 + cz1) / 2], { bevel: 0.04 });     // roof
  k.box(CH, [cx * 1.1, 0.4, 0.04], [0, 0.22, cz1 + 0.01], { bevel: 0.02 });                                 // grille surround
  for (let i = 0; i < 4; i++) k.box(K, [cx * 1.0, 0.04, 0.03], [0, 0.08 + i * 0.09, cz1 + 0.03], { bevel: 0 });
  k.box(K, [cx * 2 + 0.06, 0.24, 0.16], [0, -0.15, cz1 + 0.06], { bevel: 0.03 });                          // bumper
  k.box(T, [0.5, 0.06, 0.02], [0, -0.15, cz1 + 0.15], { bevel: 0 });
  // arches: black around both axles
  for (const w of def.wheels) {
    const [x, y, z] = w.p, hub = y + 0.13, Rr = w.r + 0.08;
    for (let i = 0; i < 5; i++) {
      const a = -1.2 + i * 0.6;
      k.box(K, [w.w + 0.1, 0.06, Rr * 0.6], [x, hub + Math.cos(a) * Rr, z + Math.sin(a) * Rr], { rot: [a, 0, 0], bevel: 0.01 });
    }
  }
  // inside: floor, dash, seats, steering column
  k.box(K, [cx * 2 - 0.12, 0.05, cz1 - cz0 - 0.15], [0, floor - 0.025, (cz0 + cz1) / 2], { bevel: 0 });
  k.box(T, [cx * 2 - 0.15, 0.32, 0.36], [0, belt - 0.05, cz1 - 0.3], { bevel: 0.05 });
  const W = drv.wheelAt;
  k.tube(T, [[W[0], W[1] - 0.03, W[2] + 0.02], [W[0], belt - 0.1, cz1 - 0.35]], 0.03, { seg: 6 });
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box('seat', [0.5, y - 0.06 - floor, 0.46], [x, (y - 0.06 + floor) / 2, z + 0.02], { bevel: 0.04 });
    k.box('seat', [0.5, 0.66, 0.11], [x, y + 0.3, z - 0.26], { rot: [-0.12, 0, 0], bevel: 0.04 });
  }
  const gl = [];
  const pane = (w, h, d, p, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); g.translate(...p); gl.push(g); };
  pane(cx * 2 - 0.16, roofY - belt - 0.08, 0.02, [0, (roofY + belt) / 2 - 0.03, cz1 - 0.1], 0.08);
  for (const sx of [1, -1]) pane(0.02, roofY - belt - 0.1, cz1 - cz0 - 0.3, [sx * (cx - 0.04), (roofY + belt) / 2 - 0.03, (cz0 + cz1) / 2 + 0.05]);
  pane(cx * 1.2, 0.4, 0.02, [0, belt + 0.4, cz0 + 0.13]);
  const glass = new THREE.Mesh(mergeAll(THREE, gl), k.mat('glass'));
  glass.renderOrder = 2;
  const bar = lightBar(THREE, k, opts, { at: [0, roofY + 0.02, (cz0 + cz1) / 2 - 0.15], width: cx * 1.7, depth: 0.24, left: '#ffa21a', right: '#ffa21a', mid: false });

  // --- headboard + post, lockers, deck --------------------------------------------------------------------------
  const hbz = hb.p[2], hbTop = hb.p[1] + hb.box[1];
  k.box(Y, [cx * 2, hbTop - deckY, 0.12], [0, (hbTop + deckY) / 2, hbz], { bevel: 0.03 });
  k.box(Y, [0.22, roofY + 0.05 - deckY, 0.22], [0.75, (roofY + 0.05 + deckY) / 2, hbz - 0.05], { bevel: 0.03 });   // tall post (left)
  k.box(K, [0.24, 0.04, 0.24], [0.75, roofY + 0.06, hbz - 0.05], { bevel: 0.01 });
  const lz0 = rearZ + 0.25, lz1 = hbz - 0.06;
  for (const sx of [1, -1]) {
    // lockers: two doors a side, between the axles and over the rear wheel
    k.box(Y, [0.5, deckY - bodyBot, lz1 - lz0], [sx * (cx - 0.25), (deckY + bodyBot) / 2, (lz0 + lz1) / 2], { bevel: 0.04 });
    for (const [a, b] of [[rw.p[2] + rw.r + 0.15, lz1 - 0.05]]) {
      const n = 2, step = (b - a) / n;
      for (let i = 0; i < n; i++) {
        const zc = a + step * (i + 0.5);
        k.box(YD, [0.02, deckY - bodyBot - 0.16, step - 0.08], [sx * (cx + 0.005), (deckY + bodyBot) / 2, zc], { bevel: 0.01 });
        k.box('metal', [0.03, 0.04, 0.12], [sx * (cx + 0.015), (deckY + bodyBot) / 2 - 0.12, zc], { bevel: 0 });
      }
    }
    k.box('tail', [0.06, 0.12, 0.16], [sx * (cx - 0.06), deckY - 0.12, lz0 - 0.06], { bevel: 0.01 });
    k.box('amber', [0.05, 0.08, 0.1], [sx * (cx - 0.06), deckY - 0.28, lz0 - 0.08], { bevel: 0 });
  }
  k.box(K, [cx * 2 + 0.02, 0.06, lz1 - rearZ], [0, deckY + 0.02, (lz1 + rearZ) / 2], { bevel: 0.01 });      // dark deck
  k.box(K, [cx * 2, 0.24, 0.12], [0, deckY - 0.1, rearZ + 0.05], { bevel: 0.02 });                           // tail beam

  // --- crane: base, boom (pivot -> sheave), ram, cable, hook ------------------------------------------------------
  const pivot = [0, deckY + 0.55, rearZ + 1.05], tip = [0, deckY + 1.55, rearZ - 0.05];
  k.box(K, [0.6, 0.45, 0.7], [0, deckY + 0.25, pivot[2] + 0.1], { bevel: 0.05 });
  for (const sx of [1, -1]) k.box(K, [0.08, 0.35, 0.3], [sx * 0.22, pivot[1], pivot[2]], { bevel: 0.02 });
  {
    const dy = tip[1] - pivot[1], dz = tip[2] - pivot[2], L = Math.hypot(dy, dz), a = Math.atan2(dy, -dz);
    k.box(Y, [0.3, 0.3, L], [0, (pivot[1] + tip[1]) / 2, (pivot[2] + tip[2]) / 2], { rot: [a, 0, 0], bevel: 0.04 });
    k.box(YD, [0.32, 0.05, L - 0.2], [0, (pivot[1] + tip[1]) / 2 + 0.15 * Math.cos(a), (pivot[2] + tip[2]) / 2 + 0.15 * Math.sin(a)], { rot: [a, 0, 0], bevel: 0 });
    k.cyl(K, 0.08, 0.36, pivot, { axis: 'x', seg: 10 });
  }
  k.cyl(K, 0.2, 0.12, tip, { axis: 'x', seg: 14 });                                                          // sheave
  k.cyl(T, 0.07, 0.16, tip, { axis: 'x', seg: 8 });
  k.tube(CH, [[0, deckY + 0.25, pivot[2] - 0.2], [0, (pivot[1] + tip[1]) / 2 - 0.12, (pivot[2] + tip[2]) / 2 + 0.05]], 0.05, { seg: 8 });   // ram
  const hookY = deckY + 0.65;
  k.tube('steel', [[0, tip[1] - 0.2, tip[2] - 0.12], [0, hookY + 0.12, tip[2] - 0.12]], 0.012, { seg: 4 });   // cable
  k.box(T, [0.1, 0.12, 0.08], [0, hookY + 0.08, tip[2] - 0.12], { bevel: 0.02 });                              // block
  const hook = new THREE.TorusGeometry(0.09, 0.025, 5, 12, Math.PI * 1.4); hook.rotateY(Math.PI / 2); hook.rotateX(Math.PI * 0.75); hook.translate(0, hookY - 0.06, tip[2] - 0.12);

  // --- under-lift: arm from the tail out to a crossbar with two wheel forks at def.tow ------------------------------
  const [, tY, tZ] = def.tow;
  const barY = tY - 0.14;
  k.box(K, [0.22, 0.16, 0.3], [0, -0.2, rearZ + 0.05], { bevel: 0.02 });                                    // its housing
  {
    const y0 = -0.2, z0 = rearZ - 0.05, L = Math.hypot(barY - y0, tZ - z0), a = Math.atan2(barY - y0, -(tZ - z0));
    k.box(K, [0.16, 0.14, L], [0, (y0 + barY) / 2, (z0 + tZ) / 2], { rot: [a, 0, 0], bevel: 0.02 });
  }
  k.box(K, [1.5, 0.1, 0.14], [0, barY, tZ], { bevel: 0.02 });                                               // crossbar
  for (const sx of [1, -1]) {
    k.box(T, [0.1, 0.08, 0.5], [sx * 0.62, barY, tZ - 0.22], { bevel: 0.015 });                              // wheel fork arm
    k.box(T, [0.24, 0.08, 0.1], [sx * 0.52, barY, tZ - 0.45], { bevel: 0.015 });
    k.box(DM, [0.14, 0.12, 0.12], [sx * 0.75, barY, tZ + 0.01], { bevel: 0.02 });                            // end caps
  }
  k.box(DM, [0.16, 0.2, 0.1], [0, tY - 0.04, tZ + 0.02], { bevel: 0.02 });                                   // the cradle the bumper sits on

  // --- wheels + steering wheel ------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 18, rimCol: 'metal', rim: 0.58 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  const steer = new THREE.Group(); steer.position.set(...W); steer.rotation.x = -0.55;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.022, 0.022], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.04, 0.05, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 5, 14), k.mat(K)));
  steer.traverse(o => { o.userData.detail = true; });

  k.finish(group);
  group.add(glass, steer, bar.group, new THREE.Mesh(hook, k.mat(T)));
  const lit = { acts: { siren: false }, t: 0 };
  return {
    group, wheels, steer,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.11) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
      lit.acts.siren = !!st.acts?.lights; lit.t = st.t ?? performance.now() / 1000;
      bar.update(lit);
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
