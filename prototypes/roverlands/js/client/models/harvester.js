// Goldline Harvester (reference: assets/ref/harvester.webp, recoloured RED + CREAM by the owner's rule — never the
// green/yellow of the sheet). A combine: a wide cutting header out front (drawn inside its collider, def.parts[1],
// x ±2.9, y -0.7..0, z 3.0..4.2, with cream pointed crop dividers, a toothed cutter bar and a cross auger), a feeder
// house up to the body, a glass cab on a deck over the big front drive wheels (its box = the cab collider; roof
// underside 2.99 — a seated head is 1.57 + 1.13 = 2.70, and the tallest Chibi hats measured reach ~3.0), a grain tank with a flared hopper behind the cab (its box
// = def.parts[2]), the engine at the back, small steering rear wheels and a folded unloading auger along the right.
// Moving nodes: `reel` (spins about x, driven by how far the front wheels rolled, so it turns while driving and stops
// when the machine stops — in the game AND in the garage), `headerAuger` (same, faster), `auger` (the unloading
// tube, pivoted at its riser: folded = rotation.y 0, swung out to the right = +PI/2 from st.acts.auger). No words,
// no brands. Ground sits ~1.05 m under the body origin at rest; front hubs y -0.3, rear hubs y -0.6.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const R = 'red', RD = 'redDark', C = 'cream', K = 'black', T = 'trim', DM = 'darkMetal';
  const ch = def.chassis;
  const chTop = ch.p[1] + ch.hy;                                           // 0.75
  const cab = def.parts[0];
  const [cx, cy, cz] = cab.box;
  const cabZ0 = cab.p[2] - cz, cabZ1 = cab.p[2] + cz;                      // 0.4 .. 2.2
  const cabY0 = cab.p[1] - cy, roofY = cab.p[1] + cy;                      // 1.3 .. 2.9
  const hd = def.parts[1];
  const hx = hd.box[0], hy0 = hd.p[1] - hd.box[1], hy1 = hd.p[1] + hd.box[1];   // ±2.9, -0.7 .. 0
  const hz0 = hd.p[2] - hd.box[2], hz1 = hd.p[2] + hd.box[2];              // 3.0 .. 4.2
  const tankP = def.parts[2] || { box: [1.15, 0.85, 0.95], p: [0, chTop + 0.85, -0.6] };
  const tx = tankP.box[0], tz0 = tankP.p[2] - tankP.box[2], tz1 = tankP.p[2] + tankP.box[2];   // ±1.15, -1.55..0.35
  const tTop = tankP.p[1] + tankP.box[1];                                  // 2.45
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const drv = def.seats.find(s => s.role === 'driver');
  const deckY = drv.p[1] - 0.41;                                           // cab floor 1.16 = the seated driver's feet
  const rearZ = -ch.hz, noseZ = ch.hz - 0.2;                               // -2.6 .. 2.4

  // --- lower body: a narrow core between the tyres, full width above the rear wheels ------------------------------
  const core = Math.abs(fw.p[0]) - fw.w / 2 - 0.2;                          // 0.8: clears the front tyres' inner faces
  k.box(RD, [core * 2, chTop + 0.5 - 0.05, noseZ - rearZ], [0, (chTop - 0.05 - 0.5) / 2, (noseZ + rearZ) / 2], { bevel: 0.06 });
  k.box(R, [ch.hx * 2 - 0.1, 0.5, cabZ0 - 0.1 - rearZ], [0, chTop - 0.23, (cabZ0 - 0.1 + rearZ) / 2], { bevel: 0.05 });   // over the rear wheels
  k.box(C, [ch.hx * 2 - 0.08, 0.06, cabZ0 - 0.1 - rearZ], [0, chTop - 0.42, (cabZ0 - 0.1 + rearZ) / 2], { bevel: 0.01 });  // cream skirt line
  for (const sx of [1, -1]) {
    k.box(K, [0.5, 0.05, rw.r * 2 + 0.3], [sx * Math.abs(rw.p[0]), chTop - 0.5, rw.p[2]], { bevel: 0.01 });             // rear mudguard
    k.box(T, [0.02, 0.3, 0.9], [sx * (ch.hx - 0.04), chTop - 0.2, -0.6], { bevel: 0 });                                   // side hatch seam
    k.box(DM, [Math.abs(fw.p[0]) - core - 0.1, 0.24, 0.3], [sx * (core + (Math.abs(fw.p[0]) - core - 0.1) / 2), fw.p[1], fw.p[2]], { bevel: 0.02 });   // final drive
  }
  k.box(DM, [Math.abs(rw.p[0]) * 2 - rw.w, 0.14, 0.16], [0, rw.p[1], rw.p[2]], { bevel: 0.02 });                       // rear axle
  k.box(DM, [0.3, 0.2, 0.3], [0, rw.p[1] + 0.12, rw.p[2]], { bevel: 0.03 });                                              // its pivot

  // --- cab pedestal + deck over the front wheels, front fenders ---------------------------------------------------
  k.box(R, [core * 2, deckY - chTop + 0.02, noseZ - cabZ0 + 0.2], [0, (deckY + chTop) / 2, (noseZ + cabZ0 - 0.2) / 2], { bevel: 0.04 });
  k.box(RD, [ch.hx * 2 - 0.06, 0.12, noseZ - cabZ0 + 0.4], [0, deckY - 0.06, (noseZ + cabZ0 - 0.4) / 2 + 0.1], { bevel: 0.03 });   // deck plate
  for (const sx of [1, -1]) {
    const X = sx * Math.abs(fw.p[0]), Rr = fw.r + 0.12, hubY = fw.p[1] + 0.1;
    for (let i = 0; i < 5; i++) {                                           // an arched black fender
      const a = -1.15 + i * 0.575;
      k.box(K, [fw.w + 0.14, 0.06, Rr * 0.62], [X, Math.min(deckY - 0.14, hubY + Math.cos(a) * Rr), fw.p[2] + Math.sin(a) * Rr], { rot: [a, 0, 0], bevel: 0.01 });
    }
  }

  // --- cab: lower shell, rear wall, pillars, cream roof, glass -----------------------------------------------------
  const belt = deckY + 0.42, ceil = roofY - 0.06;                          // 1.67 sill, 2.84 roof underside
  k.box(R, [cx * 2, belt - deckY, 0.1], [0, (belt + deckY) / 2, cabZ1 - 0.05], { bevel: 0.03 });                       // front panel
  for (const sx of [1, -1]) {
    k.box(R, [0.08, belt - deckY, cz * 2], [sx * (cx - 0.04), (belt + deckY) / 2, cab.p[2]], { bevel: 0.02 });          // side panels
    k.box(R, [0.1, ceil - belt, 0.1], [sx * (cx - 0.05), (ceil + belt) / 2, cabZ1 - 0.05], { bevel: 0.02 });            // front pillars
    k.box(R, [0.1, ceil - belt, 0.12], [sx * (cx - 0.05), (ceil + belt) / 2, cabZ0 + 0.06], { bevel: 0.02 });           // rear pillars
    k.box(T, [0.03, 0.04, 0.16], [sx * (cx + 0.01), belt - 0.12, cabZ0 + 0.35], { bevel: 0 });                           // door handle
    // mirror on an arm off the front pillar
    k.tube(T, [[sx * cx, belt + 0.5, cabZ1 - 0.08], [sx * (cx + 0.28), belt + 0.55, cabZ1 - 0.1], [sx * (cx + 0.28), belt + 0.8, cabZ1 - 0.1]], 0.02, { seg: 4 });
    k.box(K, [0.06, 0.34, 0.18], [sx * (cx + 0.3), belt + 0.72, cabZ1 - 0.12], { bevel: 0.02 });
    // work lamps on the roof's front edge, amber beacons at its back corners
    for (const dx of [0.28, 0.62]) k.box('lamp', [0.16, 0.08, 0.05], [sx * dx, roofY - 0.02, cabZ1 + 0.06], { bevel: 0.01 });
    k.cyl('amber', 0.06, 0.1, [sx * (cx - 0.15), roofY + 0.09, cabZ0 + 0.15], { seg: 8 });
  }
  k.box(R, [cx * 2, ceil - deckY, 0.1], [0, (ceil + deckY) / 2, cabZ0 + 0.05], { bevel: 0.03 });                       // rear wall
  k.box(C, [cx * 2 + 0.12, 0.1, cz * 2 + 0.16], [0, roofY - 0.01, cab.p[2] + 0.04], { bevel: 0.04 });                // roof (overhangs the glass)
  k.box(RD, [cx * 2 - 0.5, 0.04, cz * 2 - 0.5], [0, roofY + 0.05, cab.p[2]], { bevel: 0.01 });                         // roof vent panel
  k.box(K, [cx * 2 - 0.1, 0.02, cz * 2 - 0.1], [0, deckY + 0.01, cab.p[2]], { bevel: 0 });                              // floor mat
  // dash, seat, steering column
  const wheelAt = drv.wheelAt;
  k.box(T, [cx * 2 - 0.2, 0.3, 0.32], [0, belt - 0.08, cabZ1 - 0.26], { bevel: 0.04 });
  k.box(T, [0.3, 0.42, 0.28], [-0.6, deckY + 0.35, cab.p[2] + 0.1], { bevel: 0.03 });                                 // control console (right)
  k.box(K, [0.08, 0.14, 0.08], [-0.6, deckY + 0.62, cab.p[2] + 0.1], { bevel: 0.01 });                                 // its lever
  {
    const [x, y, z] = drv.p;
    k.box('seat', [0.56, y - 0.05 - deckY, 0.5], [x, (y - 0.05 + deckY) / 2, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.56, 0.7, 0.12], [x, y + 0.3, z - 0.26], { rot: [-0.1, 0, 0], bevel: 0.04 });
  }
  for (const s of def.seats) {                                             // fold-down buddy seat(s) beside the driver
    if (s === drv || s.stand) continue;
    const [x, y, z] = s.p;
    k.box(T, [0.4, y - 0.08 - deckY, 0.3], [x, (y - 0.08 + deckY) / 2, z - 0.02], { bevel: 0.03 });
    k.box('seat', [0.44, 0.08, 0.4], [x, y - 0.07, z + 0.02], { bevel: 0.03 });
    k.box('seat', [0.44, 0.5, 0.1], [x, y + 0.22, z - 0.22], { rot: [-0.1, 0, 0], bevel: 0.03 });
  }
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.04, wheelAt[2] + 0.04], [wheelAt[0], belt - 0.18, cabZ1 - 0.3]], 0.03, { seg: 6 });
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.75;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.3, 0.025, 0.025], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.045, 0.05, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 5, 14), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  // glass: windscreen + both sides, one see-through mesh
  const gl = [];
  const pane = (w, h, d, p) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(...p); gl.push(g); };
  pane(cx * 2 - 0.18, ceil - belt, 0.02, [0, (ceil + belt) / 2, cabZ1 - 0.05]);
  for (const sx of [1, -1]) pane(0.02, ceil - belt, cz * 2 - 0.2, [sx * (cx - 0.04), (ceil + belt) / 2, cab.p[2]]);
  const glass = new THREE.Mesh(mergeAll(THREE, gl), k.mat('glass'));
  glass.renderOrder = 2;

  // --- ladder up the left side + deck rails -----------------------------------------------------------------------
  const lx = ch.hx - 0.02, lz = fw.p[2] - fw.r - 0.18, foot = fw.p[1] - fw.r + 0.35;
  for (const dz of [-0.17, 0.17]) k.tube(K, [[lx + 0.12, foot, lz + dz], [lx, deckY, lz + dz], [lx, deckY + 0.75, lz + dz]], 0.025, { seg: 5 });
  for (let i = 0; i < 5; i++) {
    const f = i / 5, y = foot + f * (deckY - foot);
    k.box(T, [0.05, 0.035, 0.34], [lx + 0.12 * (1 - f), y, lz], { bevel: 0 });
  }
  const railZ1 = noseZ - 0.05;
  k.tube(K, [[lx, deckY + 0.75, lz + 0.17], [lx, deckY + 0.75, railZ1], [cx + 0.08, deckY + 0.75, railZ1]], 0.022, { seg: 5 });
  k.tube(K, [[-lx, deckY + 0.75, lz], [-lx, deckY + 0.75, railZ1], [-(cx + 0.08), deckY + 0.75, railZ1]], 0.022, { seg: 5 });
  for (const z of [lz + 0.6, railZ1]) for (const sx of [1, -1]) k.tube(K, [[sx * lx, deckY, z], [sx * lx, deckY + 0.75, z]], 0.02, { seg: 4 });
  k.tube(K, [[-lx, deckY, lz], [-lx, deckY + 0.75, lz]], 0.02, { seg: 4 });
  for (const sx of [1, -1]) k.box('lamp', [0.18, 0.1, 0.04], [sx * 0.55, deckY - 0.08, noseZ + 0.07], { bevel: 0.01 });   // road lamps under the deck

  // --- feeder house: from the body down to the header's back wall -------------------------------------------------
  {
    const z0 = noseZ - 0.05, z1 = hz0 + 0.05, y0 = chTop - 0.4, y1 = hd.p[1];
    const len = Math.hypot(z1 - z0, y1 - y0), a = Math.atan2(y0 - y1, z1 - z0);
    k.box(R, [1.3, 0.62, len], [0, (y0 + y1) / 2, (z0 + z1) / 2], { rot: [a, 0, 0], bevel: 0.05 });
    k.box(C, [1.34, 0.06, len - 0.1], [0, (y0 + y1) / 2 + 0.2, (z0 + z1) / 2], { rot: [a, 0, 0], bevel: 0.01 });
    for (const sx of [1, -1]) k.tube('steel', [[sx * 0.55, -0.2, noseZ - 0.2], [sx * 0.6, (y0 + y1) / 2 - 0.25, (z0 + z1) / 2 + 0.1]], 0.05, { seg: 6 });   // lift rams
  }

  // --- header: everything inside its collider (x ±2.9, y -0.7..0, z 3.0..4.2) ------------------------------------
  const hw = hx - 0.06, fz = hz1 - 0.02;
  k.box(R, [hw * 2, 0.06, hz1 - hz0 - 0.1], [0, hy0 + 0.04, (hz0 + hz1) / 2 - 0.03], { bevel: 0.01 });                 // floor pan
  k.box(R, [hw * 2, hy1 - hy0 - 0.04, 0.08], [0, (hy0 + hy1) / 2 - 0.02, hz0 + 0.06], { bevel: 0.015 });             // back wall
  k.box(R, [hw * 2, 0.05, 0.42], [0, hy0 + 0.2, hz0 + 0.24], { rot: [0.85, 0, 0], bevel: 0 });                       // curved pan up the back
  k.box(C, [hw * 2 + 0.04, 0.06, 0.24], [0, hy1 - 0.04, hz0 + 0.14], { bevel: 0.01 });                                // cream top lip
  k.box(K, [1.0, 0.5, 0.03], [0, hd.p[1] - 0.02, hz0 + 0.105], { bevel: 0 });                                           // feeder throat
  for (const sx of [1, -1]) {
    const x = sx * (hx - 0.05);
    k.box(R, [0.08, hy1 - hy0 - 0.04, hz1 - hz0 - 0.45], [x, (hy0 + hy1) / 2 - 0.02, hz0 + (hz1 - hz0 - 0.45) / 2], { bevel: 0.015 });   // end sheet
    k.wedge(C, [0.1, 0.42, 0.04, 0.5], [x, hy0, fz - 0.25]);                                                            // cream pointed crop divider
    k.box(C, [0.1, 0.24, 0.12], [x, hy0 + 0.3, fz - 0.55], { bevel: 0.01 });
    k.box(DM, [0.12, 0.12, 0.3], [sx * (hx - 0.12), hy0 + 0.06, hz0 + 0.25], { bevel: 0.02 });                          // skid shoe
  }
  k.box(DM, [hw * 2 - 0.1, 0.05, 0.09], [0, hy0 + 0.06, fz - 0.12], { bevel: 0 });                                    // cutter bar
  for (let x = -hw + 0.18; x <= hw - 0.15; x += 0.2) k.box('steel', [0.035, 0.03, 0.12], [x, hy0 + 0.06, fz - 0.06], { bevel: 0 });   // guard teeth
  // cross auger: its own spinning group so the flights turn
  const headerAuger = new THREE.Group(); headerAuger.position.set(0, hy0 + 0.3, hz0 + 0.32);
  const ak = createKit(THREE, opts);
  ak.cyl(DM, 0.15, hw * 2 - 0.25, [0, 0, 0], { axis: 'x', seg: 10 });
  for (let x = -hw + 0.3; x <= hw - 0.3; x += 0.42) ak.box('steel', [0.03, 0.44, 0.08], [x, 0, 0], { rot: [x * 1.7, 0, 0.25 * Math.sign(x || 1)], bevel: 0 });   // flight blades
  ak.finish(headerAuger);
  headerAuger.traverse(o => { o.userData.detail = true; });

  // --- reel: bats on spiders, tines hanging down, on arms off the header's ends ----------------------------------
  const reelR = 0.42, reelC = [0, hy1 + 0.3, hz0 + 0.8], reelHalf = hx - 0.28;
  for (const sx of [1, -1]) {
    k.tube(DM, [[sx * (hx - 0.12), hy1 - 0.04, hz0 + 0.12], [sx * (hx - 0.12), reelC[1] + 0.02, reelC[2]]], 0.045, { seg: 6 });   // reel arm
    k.cyl(K, 0.07, 0.16, [sx * (hx - 0.14), reelC[1], reelC[2]], { axis: 'x', seg: 8 });                                // bearing
  }
  const reel = new THREE.Group(); reel.position.set(...reelC);
  const rk = createKit(THREE, opts);
  rk.cyl(DM, 0.06, reelHalf * 2, [0, 0, 0], { axis: 'x', seg: 8 });
  const nBats = 6;
  for (const x of [-reelHalf + 0.05, -reelHalf / 3, reelHalf / 3, reelHalf - 0.05]) {
    for (let i = 0; i < nBats; i++) {
      const a = (i / nBats) * Math.PI * 2;
      rk.box(T, [0.04, 0.05, reelR], [x, Math.cos(a) * reelR / 2, Math.sin(a) * reelR / 2], { rot: [a + Math.PI / 2, 0, 0], bevel: 0 });   // spider spoke
    }
  }
  for (let i = 0; i < nBats; i++) {
    const a = (i / nBats) * Math.PI * 2, y = Math.cos(a) * reelR, z = Math.sin(a) * reelR;
    rk.cyl(K, 0.035, reelHalf * 2, [0, y, z], { axis: 'x', seg: 5 });                                                     // bat
    // tines: rake teeth pointing outward and trailing a little behind the bat
    for (let x = -reelHalf + 0.15; x <= reelHalf - 0.1; x += 0.36) {
      const ta = a + 0.35, ty = y + Math.cos(ta) * 0.13, tz = z + Math.sin(ta) * 0.13;
      rk.box('steel', [0.015, 0.26, 0.015], [x, ty, tz], { rot: [ta, 0, 0], bevel: 0 });
    }
  }
  rk.finish(reel);

  // --- grain tank with a flared hopper (its box = def.parts[2]) --------------------------------------------------
  const tbx = tx - 0.1, tbz0 = tz0 + 0.1, tbz1 = tz1 - 0.1, hop = tTop - 0.5;     // body ±1.05, hopper from 1.95
  k.box(R, [tbx * 2, hop - chTop + 0.02, tbz1 - tbz0], [0, (hop + chTop) / 2, (tbz0 + tbz1) / 2], { bevel: 0.06 });
  for (const sx of [1, -1]) {
    k.box(C, [0.02, 0.12, tbz1 - tbz0 - 0.1], [sx * (tbx + 0.005), chTop + 0.62, (tbz0 + tbz1) / 2], { bevel: 0 });   // cream stripe
    k.box(R, [0.06, 0.54, tz1 - tz0], [sx * (tx - 0.06), hop + 0.25, tankP.p[2]], { rot: [0, 0, -sx * 0.18], bevel: 0.01 });   // flared side
    k.box(T, [0.02, 0.3, 0.02], [sx * (tbx + 0.005), chTop + 0.3, tbz1 - 0.2], { bevel: 0 });                            // hatch seam
    k.box(T, [0.02, 0.3, 0.02], [sx * (tbx + 0.005), chTop + 0.3, tbz0 + 0.5], { bevel: 0 });
  }
  k.box(R, [tx * 2 - 0.1, 0.54, 0.06], [0, hop + 0.25, tz1 - 0.06], { rot: [0.18, 0, 0], bevel: 0.01 });             // flared front
  k.box(R, [tx * 2 - 0.1, 0.54, 0.06], [0, hop + 0.25, tz0 + 0.06], { rot: [-0.18, 0, 0], bevel: 0.01 });            // flared back
  k.box(C, [tx * 2, 0.05, 0.08], [0, tTop - 0.02, tz1 - 0.02], { bevel: 0 });                                         // cream rims
  k.box(C, [tx * 2, 0.05, 0.08], [0, tTop - 0.02, tz0 + 0.02], { bevel: 0 });
  for (const sx of [1, -1]) k.box(C, [0.08, 0.05, tz1 - tz0], [sx * (tx - 0.02), tTop - 0.02, tankP.p[2]], { bevel: 0 });
  k.box('sand', [tbx * 2 - 0.05, 0.05, tbz1 - tbz0 - 0.05], [0, hop + 0.12, tankP.p[2]], { bevel: 0 });              // the grain in it
  k.box(T, [0.5, 0.3, 0.04], [0, hop - 0.25, tbz1 + 0.01], { bevel: 0.01 });                                            // window into the tank (from the cab)

  // --- engine at the back: housing, rotary screen, rear grille, exhaust, lights -----------------------------------
  const eZ0 = rearZ + 0.05, eZ1 = tbz0, eTop = chTop + 0.75;
  k.box(R, [tbx * 2 - 0.1, eTop - chTop + 0.02, eZ1 - eZ0], [0, (eTop + chTop) / 2, (eZ0 + eZ1) / 2], { bevel: 0.08 });
  k.box(DM, [1.3, 0.05, 0.7], [0, eTop + 0.02, (eZ0 + eZ1) / 2], { bevel: 0.01 });                                     // screen
  for (let i = 0; i < 6; i++) k.box(K, [1.2, 0.02, 0.03], [0, eTop + 0.05, eZ0 + 0.27 + i * 0.1], { bevel: 0 });
  k.box(K, [1.5, 0.5, 0.04], [0, chTop + 0.35, eZ0 - 0.01], { bevel: 0.01 });                                           // rear grille
  for (let i = 0; i < 5; i++) k.box(RD, [1.44, 0.03, 0.03], [0, chTop + 0.17 + i * 0.09, eZ0 - 0.03], { bevel: 0 });
  k.cyl(DM, 0.08, 0.9, [0.6, eTop + 0.4, eZ0 + 0.3], { seg: 8 });                                                      // exhaust stack (left)
  k.cyl(K, 0.09, 0.14, [0.6, eTop + 0.86, eZ0 + 0.3], { seg: 8 });
  for (const sx of [1, -1]) {
    k.box('tail', [0.18, 0.12, 0.04], [sx * 0.95, chTop - 0.15, rearZ - 0.01], { bevel: 0.01 });
    k.box('amber', [0.1, 0.12, 0.04], [sx * 0.72, chTop - 0.15, rearZ - 0.01], { bevel: 0.01 });
    k.box('lamp', [0.14, 0.08, 0.04], [sx * 0.85, eTop - 0.1, eZ0 - 0.01], { bevel: 0.01 });
  }
  k.box(K, [1.4, 0.16, 0.16], [0, -0.35, rearZ - 0.04], { bevel: 0.03 });                                               // rear bumper / hitch
  k.box(DM, [0.2, 0.08, 0.3], [0, -0.42, rearZ - 0.15], { bevel: 0.01 });

  // --- unloading auger: a riser up the tank's right-rear corner, the tube folded back along the right -------------
  const ax = -(tbx + 0.16), az = tbz0 + 0.25, aTop = tTop - 0.05;
  k.cyl(R, 0.15, aTop - chTop - 0.2, [ax, (aTop + chTop + 0.2) / 2, az], { seg: 10 });                                 // riser
  const cradleZ = rearZ + 0.25, cradleY = aTop + 0.12 + (az - cradleZ) * 0.06 - 0.14;                                 // under the folded tube
  k.box(K, [0.12, cradleY - eTop, 0.08], [ax, (cradleY + eTop) / 2, cradleZ], { bevel: 0.01 });                       // rest cradle post
  k.box(K, [0.3, 0.06, 0.16], [ax, cradleY, cradleZ], { bevel: 0.01 });
  const auger = new THREE.Group(); auger.position.set(ax, aTop, az);
  const uk = createKit(THREE, opts);
  const aLen = az - (rearZ - 0.75);
  uk.cyl(R, 0.15, 0.3, [0, 0, 0], { seg: 10 });                                                                        // elbow
  uk.cyl(R, 0.13, aLen, [0, 0.12, -aLen / 2], { axis: 'z', seg: 10, rot: [0.06, 0, 0] });                             // the tube
  for (const f of [0.3, 0.65]) uk.cyl(C, 0.145, 0.06, [0, 0.12 + f * aLen * 0.06, -f * aLen], { axis: 'z', seg: 10 });   // cream bands
  uk.box(K, [0.3, 0.36, 0.34], [0, 0.12 + aLen * 0.06, -aLen - 0.05], { rot: [0.35, 0, 0], bevel: 0.03 });                           // spout, pointing down
  uk.finish(auger);

  // --- wheels ---------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const big = w.p[2] > 0;
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: big ? 20 : 14, rimCol: C, rim: big ? 0.5 : 0.55 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p, front: big };
  });

  k.finish(group);
  group.add(glass, steer, reel, headerAuger, auger);

  let reelA = 0, lastSpin = null, augA = 0, lastT = null;
  return {
    group, wheels, steer, reel, headerAuger, auger,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
      // reel + cross auger turn with how far the front wheels rolled (the spin a remote body sends is wrapped, so
      // only the step since last frame is used, folded into -PI..PI)
      const fronts = (st.wheels || []).filter((w, i) => wheels[i]?.front);
      if (fronts.length) {
        const s = fronts.reduce((a, w) => a + (w.spin || 0), 0) / fronts.length;
        if (lastSpin != null) {
          let d = s - lastSpin;
          d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
          reelA += d * (fw.r / reelR) * 1.15;
        }
        lastSpin = s;
      }
      reel.rotation.x = reelA % (Math.PI * 2);
      headerAuger.rotation.x = (reelA * 2.5) % (Math.PI * 2);
      // unloading auger swings out to the right while st.acts.auger is on
      const t = st.t ?? performance.now() / 1000;
      const dt = lastT == null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const want = st.acts?.auger ? Math.PI / 2 : 0;
      augA += Math.sign(want - augA) * Math.min(Math.abs(want - augA), dt * 0.8);
      auger.rotation.y = augA;
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
