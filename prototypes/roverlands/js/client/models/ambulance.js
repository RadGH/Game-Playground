// Swiftcare Ambulance (reference: assets/ref/ambulance.webp). A white van-cab ambulance with a tall square rear box,
// one orange-red stripe all the way round, dark grey bumpers, arch flares and window panes, and a red / white / blue
// light bar on the cab roof. No words, no cross symbols. The rear box is hollow: its back opens as a split door —
// the lower half drops into a loading ramp (the `open` collider in the data: 1.1 m long, tilted 0.6 rad below level)
// and the upper half lifts like a hatch, both from st.acts.door_rear. Ground ~0.73 m under the origin; hubs ≈ -0.29.
import { createKit } from './kit.js';
import { lightBar } from './lightbar.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const W = 'hullWhite', S = '#e2522c', T = 'trim', K = 'black';
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const fa = [fw.p[2] - fw.r - 0.07, fw.p[2] + fw.r + 0.07], ra = [rw.p[2] - rw.r - 0.07, rw.p[2] + rw.r + 0.07];
  const archTop = 0.44, low = -0.28;

  // --- rear box: hollow (floor, two walls, roof, front wall), as tall as its colliders ---------------------------
  const door = def.parts.find(p => p.door === 'rear');
  const floorP = def.parts.find(p => !p.door && p.box[1] < 0.1 && p.p[1] < 1);
  const roofP = def.parts.find(p => !p.door && p.box[1] < 0.1 && p.p[1] > 1);
  const bx = 1.02, bF = -0.05, bB = door.p[2] - door.box[2], fl = floorP.p[1] + floorP.box[1], top = roofP.p[1] + roofP.box[1];
  k.box('#59616b', [bx * 2 - 0.1, 0.04, bF - bB], [0, fl - 0.02, (bF + bB) / 2], { bevel: 0 });   // floor surface
  k.box(W, [bx * 2, 0.08, bF - bB + 0.04], [0, top + 0.02, (bF + bB) / 2], { bevel: 0.04 });     // roof
  k.box(W, [bx * 2, top - low, 0.08], [0, (top + low) / 2, bF - 0.02], { bevel: 0.02 });          // front wall
  for (const sx of [1, -1]) {
    const x = sx * (bx - 0.03);
    k.box(W, [0.06, top - fl + 0.04, bF - bB], [x, (top + fl) / 2, (bF + bB) / 2], { bevel: 0.02 });            // wall above the floor
    k.box(W, [0.06, fl - low, bF - ra[1]], [x, (fl + low) / 2, (bF + ra[1]) / 2], { bevel: 0.02 });             // skirt ahead of the arch
    k.box(W, [0.06, fl - low, ra[0] - bB], [x, (fl + low) / 2, (ra[0] + bB) / 2], { bevel: 0.02 });             // skirt behind it
    k.box(W, [0.06, fl - archTop, ra[1] - ra[0]], [x, (fl + archTop) / 2, (ra[0] + ra[1]) / 2], { bevel: 0.01 });
    k.box(T, [0.1, 0.1, ra[1] - ra[0] + 0.1], [sx * bx, archTop + 0.03, (ra[0] + ra[1]) / 2], { bevel: 0.03 });   // arch flare
    for (const [z, d] of [[ra[0], 1], [ra[1], -1]]) k.box(T, [0.1, 0.34, 0.1], [sx * bx, archTop - 0.12, z + d * 0.08], { rot: [d * 0.5, 0, 0], bevel: 0.03 });
    k.box(K, [0.05, archTop - low, ra[1] - ra[0]], [sx * 0.76, (archTop + low) / 2, (ra[0] + ra[1]) / 2], { bevel: 0 });   // wheel-well liner
    k.box(S, [0.02, 0.2, bF - bB], [sx * (bx + 0.005), 0.95, (bF + bB) / 2], { bevel: 0 });                     // stripe
    k.box(T, [0.02, 0.52, 1.0], [sx * (bx + 0.005), 1.72, -0.95], { bevel: 0.03 });                             // windows (dark panes)
    k.box(T, [0.02, 0.4, 0.34], [sx * (bx + 0.005), 1.72, -2.12], { bevel: 0.03 });
    k.box('#d9dde2', [0.02, 0.42, 0.72], [sx * (bx + 0.005), 0.05, -0.62], { bevel: 0.02 });                    // locker door
    k.box(T, [0.03, 0.06, 0.03], [sx * (bx + 0.015), 0.05, -0.34], { bevel: 0 });
    for (const z of [bF - 0.12, bB + 0.12]) k.box('tail', [0.14, 0.1, 0.06], [sx * 0.86, top + 0.09, z], { bevel: 0.01 });   // marker lamps
    k.box('amber', [0.1, 0.1, 0.05], [sx * 0.62, top + 0.09, bB + 0.12], { bevel: 0.01 });
    // the back corner posts round the door, with tail lamps
    k.box(W, [0.12, top - low, 0.08], [sx * (bx - 0.06), (top + low) / 2, bB - 0.02], { bevel: 0.02 });
    k.box('tail', [0.06, 0.32, 0.04], [sx * (bx - 0.06), 0.7, bB - 0.07], { bevel: 0 });
    k.box('amber', [0.06, 0.12, 0.04], [sx * (bx - 0.06), 0.42, bB - 0.07], { bevel: 0 });
    k.box('tail', [0.06, 0.12, 0.04], [sx * (bx - 0.06), 2.2, bB - 0.07], { bevel: 0 });
  }
  k.box(W, [bx * 2, 0.1, 0.08], [0, top - 0.03, bB - 0.02], { bevel: 0.02 });                                     // header over the door
  k.box(T, [bx * 2 - 0.1, 0.18, 0.22], [0, -0.12, bB - 0.08], { bevel: 0.04 });                                  // rear step bumper
  k.box(W, [bx * 2 - 0.12, 0.7, 0.08], [0, fl - 0.35, bB + 0.04], { bevel: 0.01 });                              // sill under the door
  k.box(K, [1.4, 0.4, bF - bB - 0.2], [0, 0.0, (bF + bB) / 2], { bevel: 0.02 });                                 // chassis rails under the box
  // inside: a cupboard on the front wall and a padded bench along each wall (the rear riders sit on these)
  k.box('#cfd6dc', [bx * 2 - 0.14, 0.55, 0.3], [0, top - 0.35, bF - 0.2], { bevel: 0.02 });
  for (const s of def.seats.filter(s => s.p[2] < 0)) {
    const sx = Math.sign(s.p[0]), x0 = sx * (bx - 0.06), x1 = s.p[0] - sx * 0.2, seatY = s.p[1] - 0.07;
    k.box('#5a6470', [Math.abs(x0 - x1), Math.max(0.05, seatY - fl), 1.0], [(x0 + x1) / 2, (seatY + fl) / 2, s.p[2]], { bevel: 0.02 });
    k.box('#2f6fb0', [Math.abs(x0 - x1), 0.08, 1.0], [(x0 + x1) / 2, seatY + 0.03, s.p[2]], { bevel: 0.03 });
    k.box('#2f6fb0', [0.08, 0.6, 1.0], [x0 - sx * 0.05, seatY + 0.45, s.p[2]], { bevel: 0.03 });
  }

  // --- cab: van front, hollow behind glass ------------------------------------------------------------------------
  const cx = 0.98, cBelt = 1.05, cRoof = 1.96, zWs = 2.1, zWt = 1.8, cFl = 0.17, nose = 2.72;
  k.box(T, [cx * 2 - 0.1, 0.04, zWs - bF], [0, cFl - 0.02, (zWs + bF) / 2], { bevel: 0 });          // cab floor
  k.box(W, [1.5, cFl - low, zWs - bF], [0, (cFl + low) / 2, (zWs + bF) / 2], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    const x = sx * (cx - 0.03);
    k.box(W, [0.06, cBelt - low, fa[0] - bF], [x, (cBelt + low) / 2, (fa[0] + bF) / 2], { bevel: 0.02 });          // door, behind the arch
    k.box(W, [0.06, cBelt - archTop, fa[1] - fa[0]], [x, (cBelt + archTop) / 2, (fa[0] + fa[1]) / 2], { bevel: 0.02 });
    k.box(W, [0.06, 0.95 - low, nose - fa[1]], [x, (0.95 + low) / 2, (nose + fa[1]) / 2], { bevel: 0.02 });
    k.box(W, [0.08, cRoof - cBelt, 0.5], [x, (cRoof + cBelt) / 2, bF + 0.25], { bevel: 0.02 });                    // panel behind the door glass
    k.box(T, [0.1, 0.1, fa[1] - fa[0] + 0.1], [sx * cx, archTop + 0.03, (fa[0] + fa[1]) / 2], { bevel: 0.03 });     // arch flare
    for (const [z, d] of [[fa[0], 1], [fa[1], -1]]) k.box(T, [0.1, 0.34, 0.1], [sx * cx, archTop - 0.12, z + d * 0.08], { rot: [d * 0.5, 0, 0], bevel: 0.03 });
    k.box(K, [0.05, archTop - low, fa[1] - fa[0]], [sx * 0.76, (archTop + low) / 2, (fa[0] + fa[1]) / 2], { bevel: 0 });
    k.box(S, [0.02, 0.2, nose - bF - 0.1], [sx * (cx + 0.005), 0.95, (nose + bF) / 2 - 0.05], { bevel: 0 });         // stripe
    k.tube(W, [[sx * (cx - 0.02), cBelt, zWs + 0.02], [sx * (cx - 0.06), cRoof - 0.02, zWt]], 0.05, { seg: 5 });      // A pillar
    k.box(T, [0.04, 0.04, 0.16], [sx * (cx + 0.01), cBelt - 0.14, 0.95], { bevel: 0 });                              // handle
    k.tube(T, [[sx * cx, 1.2, zWs - 0.2], [sx * (cx + 0.16), 1.25, zWs - 0.25]], 0.02, { seg: 4 });                   // mirror arm
    k.box(T, [0.08, 0.26, 0.14], [sx * (cx + 0.2), 1.2, zWs - 0.26], { bevel: 0.02 });                                // mirror
    k.box('lamp', [0.28, 0.18, 0.05], [sx * 0.68, 0.62, nose + 0.01], { bevel: 0.02 });
    k.box('amber', [0.1, 0.18, 0.05], [sx * 0.89, 0.62, nose - 0.01], { bevel: 0.01 });
  }
  k.wedge(W, [cx * 2, cBelt - 0.2, 0.92 - 0.2, nose - zWs], [0, 0.2, (nose + zWs) / 2]);        // short sloped hood
  k.box(W, [cx * 2, 0.95 - low, 0.1], [0, (0.95 + low) / 2, nose - 0.04], { bevel: 0.03 });   // nose panel
  k.box(T, [1.0, 0.36, 0.05], [0, 0.6, nose + 0.02], { bevel: 0.02 });                         // grille
  for (let i = 0; i < 3; i++) k.box(K, [0.92, 0.04, 0.02], [0, 0.5 + i * 0.1, nose + 0.05], { bevel: 0 });
  k.box(T, [cx * 2 + 0.06, 0.34, 0.22], [0, 0.02, nose + 0.03], { bevel: 0.05 });               // big front bumper
  k.box(W, [cx * 2, 0.07, zWt - bF + 0.06], [0, cRoof + 0.03, (zWt + bF) / 2], { bevel: 0.03 });   // cab roof
  k.box(T, [1.6, 0.26, 0.26], [0, 0.85, zWs + 0.12], { bevel: 0.04 });                         // dash
  // glass: windscreen + one trapezoid per door
  const glassGeo = [];
  { const len = Math.hypot(cRoof - cBelt, zWt - zWs), g = new THREE.BoxGeometry(cx * 2 - 0.08, 0.02, len);
    g.rotateX(-Math.atan2(cRoof - cBelt, zWt - zWs)); g.translate(0, (cRoof + cBelt) / 2, (zWt + zWs) / 2); glassGeo.push(g); }
  for (const sx of [1, -1]) {
    const s = new THREE.Shape();
    s.moveTo(zWs - 0.04, cBelt + 0.02); s.lineTo(zWt - 0.02, cRoof - 0.04); s.lineTo(bF + 0.5, cRoof - 0.04); s.lineTo(bF + 0.5, cBelt + 0.02); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(sx * (cx - 0.03), 0, 0);
    glassGeo.push(g);
  }
  const glass = new THREE.Mesh(mergeAll(THREE, glassGeo), k.mat('glass'));
  glass.name = 'part:glass';

  // --- cab seats + steering ------------------------------------------------------------------------------------
  for (const s of def.seats.filter(s => s.p[2] > 0)) {
    const [x, y, z] = s.p;
    k.box('seat', [0.5, 0.12, 0.5], [x, y - 0.06, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.5, 0.66, 0.12], [x, y + 0.28, z - 0.26], { rot: [-0.12, 0, 0], bevel: 0.04 });
    k.box(T, [0.4, y - 0.12 - cFl, 0.38], [x, (y - 0.12 + cFl) / 2, z + 0.02], { bevel: 0.02 });
  }
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -1.0;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.26, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 5, 12), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.05], [wheelAt[0], 0.8, zWs]], 0.025, { seg: 5 });

  // --- rear split door ------------------------------------------------------------------------------------------
  const hingeY = fl - 0.01, rampLen = door.open.box[2] * 2, dw = door.box[0] * 2 - 0.08, dz = bB - 0.04;
  const ramp = new THREE.Group(); ramp.position.set(0, hingeY, dz);
  const rk = createKit(THREE, opts);
  rk.box(W, [dw, rampLen, 0.06], [0, rampLen / 2, 0], { bevel: 0.02 });
  rk.box(S, [dw, 0.2, 0.02], [0, 0.95 - hingeY, -0.035], { bevel: 0 });               // the stripe carries on across the door
  for (let i = 0; i < 6; i++) rk.box(T, [dw - 0.12, 0.03, 0.02], [0, 0.1 + i * (rampLen - 0.2) / 5, 0.035], { bevel: 0 });   // tread on the inside (the ramp's top)
  rk.box(T, [0.18, 0.05, 0.04], [0.3, rampLen - 0.25, -0.04], { bevel: 0 });          // handle
  rk.finish(ramp);
  const hatchH = top - hingeY - rampLen - 0.02;
  const hatch = new THREE.Group(); hatch.position.set(0, top - 0.01, dz);
  const hk = createKit(THREE, opts);
  hk.box(W, [dw, hatchH, 0.06], [0, -hatchH / 2, 0], { bevel: 0.02 });
  hk.box(T, [dw * 0.36, hatchH * 0.55, 0.02], [dw * 0.22, -hatchH * 0.45, -0.035], { bevel: 0.02 });   // two dark panes
  hk.box(T, [dw * 0.36, hatchH * 0.55, 0.02], [-dw * 0.22, -hatchH * 0.45, -0.035], { bevel: 0.02 });
  hk.finish(hatch);

  // --- light bar on the cab roof ----------------------------------------------------------------------------------
  const bar = lightBar(THREE, k, opts, { at: [0, cRoof + 0.07, 0.95], width: 1.25, depth: 0.28, height: 0.14, left: '#ff2a1a', right: '#2a5cff', mid: true });

  // --- wheels -----------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 16, rimCol: 'metal', rim: 0.55 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  k.finish(group);
  group.add(glass, steer, ramp, hatch, bar.group);
  const RAMP_OPEN = -(Math.PI / 2 + Math.abs(door.open.rot?.[0] ?? 0.6)), HATCH_OPEN = 1.85;
  let openA = 0, lastT = null;
  return {
    group, wheels, steer, doors: { rear: { ramp, hatch } }, lights: bar.lights,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
      });
      steer.rotation.z = (st.steer || 0) * -2.4;
      const t = st.t ?? performance.now() / 1000;
      const dt = lastT == null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const want = st.acts?.door_rear ? 1 : 0;
      openA += Math.sign(want - openA) * Math.min(Math.abs(want - openA), dt * 1.6);
      const e = openA * openA * (3 - 2 * openA);
      ramp.rotation.x = RAMP_OPEN * e;
      hatch.rotation.x = HATCH_OPEN * e;
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
