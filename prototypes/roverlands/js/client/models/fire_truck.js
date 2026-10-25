// Brightwater Fire Truck (reference: assets/ref/fire_truck.webp). A flat-fronted red cab over the front wheels with
// big windows (hollow behind glass, so the crew shows), a white stripe all the way round, a long locker body with a
// hose-reel bay, a folded ladder on racks along the top, and at the back a standing well where the gunner works a
// water cannon on a swivel (the `turret`: yaw at the data's gun pivot, pitch inside it, `muzzle` at the nozzle tip,
// two grips where session.js puts the gunner's hands). The cab-roof light bar flashes from st.acts.siren.
// No words or emblems. Ground ~0.91 m under the origin at rest; hubs ≈ -0.39.
import { createKit } from './kit.js';
import { lightBar } from './lightbar.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const R = 'red', W = 'hullWhite', G = '#a3a9b0', C = 'chrome', T = 'trim', K = 'black';
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const fa = [fw.p[2] - fw.r - 0.07, fw.p[2] + fw.r + 0.07], ra = [rw.p[2] - rw.r - 0.07, rw.p[2] + rw.r + 0.07];
  const low = -0.32, archTop = 0.42, inner = Math.abs(fw.p[0]) - fw.w / 2 - 0.06;   // body sides clear the tyres inside
  const stripeY = 0.68;

  // --- cab ---------------------------------------------------------------------------------------------------------
  const cabP = def.parts[0];
  const cx = cabP.box[0], cB = cabP.p[2] - cabP.box[2] - 0.05, nose = def.chassis.hz - 0.08;
  const drv = def.seats.find(s => s.role === 'driver');
  const cFl = drv.p[1] - 0.41, belt = 1.12, roof = drv.p[1] + 1.3, zWs = nose - 0.06, zWt = nose - 0.2;
  k.box(T, [cx * 2 - 0.12, 0.04, zWs - cB], [0, cFl - 0.02, (zWs + cB) / 2], { bevel: 0 });              // cab floor
  k.box(R, [inner * 2, cFl - low, zWs - cB], [0, (cFl + low) / 2, (zWs + cB) / 2], { bevel: 0.02 });     // under the floor
  for (const sx of [1, -1]) {
    const x = sx * (cx - 0.04);
    k.box(R, [0.08, belt - low, fa[0] - cB], [x, (belt + low) / 2, (fa[0] + cB) / 2], { bevel: 0.02 });
    k.box(R, [0.08, belt - archTop, fa[1] - fa[0]], [x, (belt + archTop) / 2, (fa[0] + fa[1]) / 2], { bevel: 0.02 });
    k.box(R, [0.08, belt - low, nose - fa[1]], [x, (belt + low) / 2, (nose + fa[1]) / 2], { bevel: 0.02 });
    k.box(K, [0.05, archTop - low, fa[1] - fa[0]], [sx * inner, (archTop + low) / 2, (fa[0] + fa[1]) / 2], { bevel: 0 });   // well liner
    k.box(G, [0.12, 0.08, fa[1] - fa[0] + 0.12], [sx * cx, archTop + 0.04, (fa[0] + fa[1]) / 2], { bevel: 0.02 });       // arch trim
    for (const [z, d] of [[fa[0], 1], [fa[1], -1]]) k.box(G, [0.12, 0.34, 0.1], [sx * cx, archTop - 0.12, z + d * 0.08], { rot: [d * 0.5, 0, 0], bevel: 0.02 });
    k.box(R, [0.1, roof - belt, 0.42], [x, (roof + belt) / 2, cB + 0.21], { bevel: 0.02 });                 // rear pillar panel
    k.tube(R, [[sx * (cx - 0.05), belt, zWs], [sx * (cx - 0.07), roof - 0.03, zWt]], 0.06, { seg: 5 });    // A pillar
    k.box(W, [0.02, 0.13, nose - cB - 0.05], [sx * (cx + 0.005), stripeY, (nose + cB) / 2], { bevel: 0 });   // stripe
    k.box(C, [0.04, 0.04, 0.18], [sx * (cx + 0.01), belt - 0.16, fa[0] + 0.4], { bevel: 0 });                      // door handle
    k.box(T, [0.04, belt - archTop - 0.06, 0.03], [sx * (cx + 0.005), (belt + archTop) / 2 + 0.03, fa[0] + 0.25], { bevel: 0 });   // door seam
    k.tube(T, [[sx * cx, 1.75, zWs - 0.3], [sx * (cx + 0.2), 1.75, zWs - 0.32], [sx * (cx + 0.2), 1.25, zWs - 0.32], [sx * cx, 1.25, zWs - 0.3]], 0.022, { seg: 4 });
    k.box(T, [0.08, 0.42, 0.18], [sx * (cx + 0.24), 1.5, zWs - 0.32], { bevel: 0.03 });                    // mirror
    k.box('lamp', [0.32, 0.16, 0.05], [sx * 0.75, 0.42, nose + 0.01], { bevel: 0.02 });                   // headlight
    k.box('amber', [0.14, 0.16, 0.05], [sx * 0.99, 0.42, nose + 0.0], { bevel: 0.01 });
    k.box('tail', [0.2, 0.1, 0.12], [sx * (cx - 0.16), roof + 0.1, nose - 0.12], { bevel: 0.02 });         // roof corner lamps
    k.box('tail', [0.2, 0.1, 0.12], [sx * (cx - 0.16), roof + 0.1, cB + 0.14], { bevel: 0.02 });
  }
  k.box(R, [cx * 2, belt - low, 0.12], [0, (belt + low) / 2, nose - 0.02], { bevel: 0.03 });              // front panel
  k.box(W, [cx * 2 + 0.01, 0.13, 0.02], [0, stripeY, nose + 0.05], { bevel: 0 });
  k.box(G, [0.84, 0.46, 0.05], [0, 0.32, nose + 0.06], { bevel: 0.02 });                                   // grille
  for (let i = 0; i < 5; i++) k.box(T, [0.74, 0.04, 0.02], [0, 0.15 + i * 0.085, nose + 0.09], { bevel: 0 });
  k.box(G, [cx * 2 + 0.06, 0.3, 0.24], [0, -0.17, nose + 0.1], { bevel: 0.05 });                           // bumper
  k.box(R, [cx * 2, 0.1, nose - cB], [0, roof + 0.0, (nose + cB) / 2 - 0.02], { bevel: 0.04 });           // roof
  k.box(R, [cx * 2, roof - belt, 0.1], [0, (roof + belt) / 2, cB + 0.05], { bevel: 0.02 });               // back wall
  k.box(T, [cx * 2 - 0.3, 0.26, 0.3], [0, belt - 0.12, zWs - 0.2], { bevel: 0.04 });                      // dash
  const glassGeo = [];
  { const len = Math.hypot(roof - belt, zWt - zWs), g = new THREE.BoxGeometry(cx * 2 - 0.1, 0.02, len);
    g.rotateX(-Math.atan2(roof - belt, zWt - zWs)); g.translate(0, (roof + belt) / 2, (zWt + zWs) / 2 + 0.01); glassGeo.push(g); }
  for (const sx of [1, -1]) {
    const s = new THREE.Shape();
    s.moveTo(zWs - 0.06, belt + 0.02); s.lineTo(zWt - 0.04, roof - 0.06); s.lineTo(cB + 0.42, roof - 0.06); s.lineTo(cB + 0.42, belt + 0.02); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(sx * (cx - 0.04), 0, 0);
    glassGeo.push(g);
  }
  const glass = new THREE.Mesh(mergeAll(THREE, glassGeo), k.mat('glass'));
  glass.name = 'part:glass';
  for (const s of def.seats.filter(s => s.pose === 'sit')) {
    const [x, y, z] = s.p;
    k.box('seat', [0.52, 0.12, 0.5], [x, y - 0.06, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.52, 0.68, 0.12], [x, y + 0.28, z - 0.26], { rot: [-0.1, 0, 0], bevel: 0.04 });
    k.box(T, [0.42, y - 0.12 - cFl, 0.38], [x, (y - 0.12 + cFl) / 2, z + 0.02], { bevel: 0.02 });
  }
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.75;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.3, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 5, 12), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.04], [wheelAt[0], belt - 0.15, zWs - 0.25]], 0.03, { seg: 5 });

  // --- body: lockers, hose bay, deck, the gunner's well ------------------------------------------------------------
  const bodyP = def.parts[1];
  const bx = bodyP.box[0] + 0.02, bF = cB - 0.04, bB = -def.chassis.hz + 0.02, top = bodyP.p[1] + bodyP.box[1];
  const gun = def.seats.find(s => s.gun), gp = gun.p, piv = gun.gun.pivot;
  const wF = piv[2] + 0.32, wB = gp[2] - 0.45, wX = 0.52, wFl = gp[1];     // the well: feet on its floor
  const bay = [0.2, bF - 0.04];                                             // hose bay (z range), upper half of the side
  const bayLow = 0.86;
  // core between the tyres, split round the well
  k.box(R, [inner * 2, top - low, bF - wF], [0, (top + low) / 2, (bF + wF) / 2], { bevel: 0.02 });
  k.box(R, [inner * 2, top - low, wB - bB], [0, (top + low) / 2, (wB + bB) / 2], { bevel: 0.02 });
  k.box(R, [wX * 2, wFl - low, wF - wB], [0, (wFl + low) / 2, (wF + wB) / 2], { bevel: 0.02 });
  for (const sx of [1, -1]) k.box(R, [inner - wX, top - low, wF - wB], [sx * (wX + inner) / 2, (top + low) / 2, (wF + wB) / 2], { bevel: 0.02 });
  k.box(G, [wX * 2 - 0.04, 0.03, wF - wB - 0.04], [0, wFl + 0.015, (wF + wB) / 2], { bevel: 0 });          // well floor plate
  for (const sx of [1, -1]) {
    const so = sx * (inner + bx) / 2, sw = bx - inner;
    // side blocks: ahead of the bay, the bay's lower half, ahead of the arch, over it, behind it
    k.box(R, [sw, top - low, bF - bay[1]], [so, (top + low) / 2, (bF + bay[1]) / 2], { bevel: 0.02 });
    k.box(R, [sw, bayLow - low, bay[1] - bay[0]], [so, (bayLow + low) / 2, (bay[0] + bay[1]) / 2], { bevel: 0.02 });
    k.box(R, [sw, top - low, bay[0] - ra[1]], [so, (top + low) / 2, (bay[0] + ra[1]) / 2], { bevel: 0.02 });
    k.box(R, [sw, top - archTop, ra[1] - ra[0]], [so, (top + archTop) / 2, (ra[0] + ra[1]) / 2], { bevel: 0.02 });
    k.box(R, [sw, top - low, ra[0] - bB], [so, (top + low) / 2, (ra[0] + bB) / 2], { bevel: 0.02 });
    k.box(K, [0.05, archTop - low, ra[1] - ra[0]], [sx * inner, (archTop + low) / 2, (ra[0] + ra[1]) / 2], { bevel: 0 });
    k.box(G, [0.12, 0.08, ra[1] - ra[0] + 0.12], [sx * bx, archTop + 0.04, (ra[0] + ra[1]) / 2], { bevel: 0.02 });
    for (const [z, d] of [[ra[0], 1], [ra[1], -1]]) k.box(G, [0.12, 0.34, 0.1], [sx * bx, archTop - 0.12, z + d * 0.08], { rot: [d * 0.5, 0, 0], bevel: 0.02 });
    // the hose bay: a dark back wall and two coiled hoses on chrome rails
    k.box(T, [0.04, top - bayLow, bay[1] - bay[0]], [sx * (inner + 0.02), (top + bayLow) / 2, (bay[0] + bay[1]) / 2], { bevel: 0 });
    for (const y of [bayLow + 0.18, bayLow + 0.5]) {
      k.cyl(K, 0.14, bay[1] - bay[0] - 0.16, [sx * (bx - 0.17), y, (bay[0] + bay[1]) / 2], { axis: 'z', seg: 8 });
      for (let i = 0; i < 3; i++) k.cyl('rubber', 0.155, 0.06, [sx * (bx - 0.17), y, bay[0] + 0.2 + i * (bay[1] - bay[0] - 0.4) / 2], { axis: 'z', seg: 8 });
      k.tube(C, [[sx * (bx - 0.02), y + 0.17, bay[0] + 0.03], [sx * (bx - 0.02), y + 0.17, bay[1] - 0.03]], 0.02, { seg: 4 });
    }
    for (const z of [bay[0] + 0.03, bay[1] - 0.03]) k.box(C, [0.05, top - bayLow, 0.05], [sx * (bx - 0.03), (top + bayLow) / 2, z], { bevel: 0 });
    // locker doors (proud panels with chrome handles) + the stripe
    const doors = [[bay[0] - 0.06, -0.55], [-0.6, ra[1] + 0.06], [ra[0] - 0.06, bB + 0.1]];
    for (const [z0, z1] of doors) {
      k.box(R, [0.03, top - 0.2 - (low + 0.15), z0 - z1], [sx * (bx + 0.012), (top - 0.2 + low + 0.15) / 2, (z0 + z1) / 2], { bevel: 0.015 });
      k.box(C, [0.04, 0.18, 0.04], [sx * (bx + 0.03), 0.95, z1 + 0.12], { bevel: 0 });
    }
    k.box(R, [0.03, top - 0.2 - archTop - 0.1, ra[1] - ra[0] - 0.1], [sx * (bx + 0.012), (top - 0.2 + archTop + 0.1) / 2, (ra[0] + ra[1]) / 2], { bevel: 0.015 });
    k.box(W, [0.02, 0.13, bay[0] - bB], [sx * (bx + 0.03), stripeY, (bay[0] + bB) / 2], { bevel: 0 });
    k.box(W, [0.02, 0.13, bay[1] - bay[0] + (bF - bay[1])], [sx * (bx + 0.005), stripeY, (bF + bay[0]) / 2], { bevel: 0 });
    k.box('amber', [0.04, 0.08, 0.14], [sx * (bx + 0.01), top - 0.08, bF - 0.15], { bevel: 0 });
    k.box('tail', [0.04, 0.08, 0.14], [sx * (bx + 0.01), top - 0.08, bB + 0.1], { bevel: 0 });
    k.box('tail', [0.2, 0.3, 0.05], [sx * (bx - 0.16), 0.75, bB - 0.02], { bevel: 0.02 });                       // tail lamps
    k.box('amber', [0.2, 0.12, 0.05], [sx * (bx - 0.16), 0.48, bB - 0.02], { bevel: 0.01 });
    // grab rails round the well
    k.tube(C, [[sx * (wX + 0.08), top, wF - 0.05], [sx * (wX + 0.08), top + 0.42, wF - 0.12], [sx * (wX + 0.08), top + 0.42, wB + 0.12], [sx * (wX + 0.08), top, wB + 0.05]], 0.028, { seg: 5 });
  }
  k.box(G, [bx * 2 - 0.06, 0.04, bF - bB - 0.05], [0, top + 0.02, (bF + bB) / 2], { bevel: 0.01 });          // deck plate (the well cuts it visually)
  k.box(R, [wX * 2 + 0.02, 0.06, 0.06], [0, top + 0.03, wF], { bevel: 0 });
  k.box(R, [wX * 2 + 0.02, 0.06, 0.06], [0, top + 0.03, wB], { bevel: 0 });
  k.box(R, [bx * 2, top - low, 0.1], [0, (top + low) / 2, bB + 0.03], { bevel: 0.03 });                   // back panel
  k.box(G, [bx * 2 + 0.04, 0.22, 0.36], [0, -0.2, bB - 0.12], { bevel: 0.04 });                          // step bumper
  for (const sx of [1, -1]) k.tube(C, [[sx * 0.55, 0.3, bB - 0.03], [sx * 0.55, 0.3, bB - 0.1], [sx * 0.55, 1.25, bB - 0.1], [sx * 0.55, 1.25, bB - 0.03]], 0.025, { seg: 4 });

  // --- ladder on racks along the top (folded) ------------------------------------------------------------------
  const lz0 = wF + 0.12, lz1 = bF - 0.08, lyB = top + 0.24, lyT = top + 0.4, lx = 0.34;
  for (const z of [lz0 + 0.1, lz1 - 0.15]) for (const sx of [1, -1]) k.box(T, [0.06, lyB - top, 0.06], [sx * lx, (lyB + top) / 2, z], { bevel: 0 });
  for (const sx of [1, -1]) {
    k.box(G, [0.07, 0.07, lz1 - lz0], [sx * lx, lyB, (lz0 + lz1) / 2], { bevel: 0.015 });
    k.box(G, [0.07, 0.07, lz1 - lz0], [sx * lx, lyT, (lz0 + lz1) / 2], { bevel: 0.015 });
    const n = 8, pts = [];
    for (let i = 0; i <= n; i++) pts.push([sx * lx, i % 2 ? lyT : lyB, lz0 + 0.05 + i * (lz1 - lz0 - 0.1) / n]);
    k.tube(G, pts, 0.02, { seg: 4 });
  }
  for (let i = 0; i < 9; i++) k.cyl(G, 0.022, lx * 2, [0, lyB, lz0 + 0.12 + i * (lz1 - lz0 - 0.24) / 8], { axis: 'x', seg: 5 });
  k.box(R, [lx * 2 + 0.16, 0.2, 0.2], [0, (lyB + lyT) / 2, lz1 + 0.04], { bevel: 0.04 });            // ladder end cap

  // --- water cannon: pedestal fixed, swivel = turret.yaw, nozzle = turret.pitch -------------------------------------
  k.cyl(G, 0.26, 0.06, [0, wFl + 0.04, piv[2]], { seg: 12 });
  k.cyl(G, 0.09, piv[1] - wFl - 0.24, [0, (piv[1] - 0.2 + wFl) / 2, piv[2]], { seg: 10 });
  k.cyl(R, 0.14, 0.12, [0, piv[1] - 0.24, piv[2]], { seg: 10 });
  const turretYaw = new THREE.Group(); turretYaw.position.set(...piv);
  const yk = createKit(THREE, opts);
  yk.cyl(G, 0.18, 0.1, [0, -0.15, 0], { seg: 10 });
  yk.box(R, [0.34, 0.16, 0.26], [0, -0.05, 0], { bevel: 0.04 });
  for (const sx of [1, -1]) yk.box(R, [0.05, 0.22, 0.16], [sx * 0.17, 0.02, 0], { bevel: 0.01 });
  yk.finish(turretYaw);
  const turretPitch = new THREE.Group(); turretYaw.add(turretPitch);
  const pk = createKit(THREE, opts);
  pk.cyl(R, 0.09, 0.3, [0, 0, 0.05], { axis: 'z', seg: 8 });
  pk.cyl(C, 0.065, 0.75, [0, 0, 0.55], { axis: 'z', seg: 8 });
  pk.cyl(C, 0.045, 0.24, [0, 0, 1.02], { axis: 'z', seg: 8, r2: 0.07 });
  pk.cyl(R, 0.085, 0.08, [0, 0, 0.85], { axis: 'z', seg: 8 });
  // grips where the gunner's hands go: pitch-local (±0.2, -0.05, -0.25)
  pk.tube(T, [[0.2, -0.05, -0.25], [0.2, -0.05, -0.06], [0.06, 0, 0.0]], 0.025, { seg: 5 });
  pk.tube(T, [[-0.2, -0.05, -0.25], [-0.2, -0.05, -0.06], [-0.06, 0, 0.0]], 0.025, { seg: 5 });
  for (const sx of [1, -1]) pk.cyl(K, 0.032, 0.1, [sx * 0.2, -0.05, -0.25], { axis: 'z', seg: 6 });
  pk.finish(turretPitch);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, 1.15); turretPitch.add(muzzle);
  turretYaw.traverse(o => { if (o.isMesh) o.castShadow = true; });

  // --- light bar ----------------------------------------------------------------------------------------------------
  const bar = lightBar(THREE, k, opts, { at: [0, roof + 0.05, (nose + cB) / 2 + 0.25], width: 1.3, depth: 0.28, height: 0.15, left: '#ff2a1a', right: '#f4f4ff', mid: true });

  // --- wheels -------------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 18, rimCol: 'metal', rim: 0.58 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  k.finish(group);
  group.add(glass, steer, turretYaw, bar.group);
  return {
    group, wheels, steer, lights: bar.lights,
    turret: { yaw: turretYaw, pitch: turretPitch, muzzle },
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.0;
      bar.update(st);
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
