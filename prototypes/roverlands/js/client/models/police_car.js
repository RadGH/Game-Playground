// Patrol Car (reference: assets/ref/police_car.webp). A sporty four-door sedan, dark navy below the belt line and
// white above (roof, hood, trunk lid, pillars), a black push bar on the nose and a roof light bar of two plain
// coloured lenses. No words, badges or markings anywhere. The cabin is hollow behind real glass so the four riders
// show; the trunk lid (`trunk` node) swings up from st.acts.door_trunk and the light bar flashes from st.acts.siren.
// Ground sits ~0.62 m under the body origin at rest; hubs at y ≈ -0.22.
import { createKit } from './kit.js';
import { lightBar } from './lightbar.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const N = 'navy', W = 'hullWhite', K = 'black', T = 'trim';
  const belt = 0.58, roofY = 1.62, floorY = -0.08;
  const zA = 1.1, zAt = 0.62, zC = -1.18, zCt = -0.76;   // windscreen foot/top, rear window foot/top

  // --- floor pan + engine bay (hidden mass that fills the body between the wheels) -----------------------------
  k.box(N, [1.36, 0.24, 4.1], [0, floorY - 0.12, 0], { bevel: 0.03 });
  k.box('seat', [1.3, 0.02, 2.0], [0, floorY + 0.01, -0.15], { bevel: 0 });             // floor mat
  k.box('darkMetal', [1.3, 0.5, 0.95], [0, 0.18, 1.55], { bevel: 0.03 });                // engine bay

  // --- sides: doors between the wheels, fenders over the arches, front and rear corners -------------------------
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const fa = [fw.p[2] - fw.r - 0.07, fw.p[2] + fw.r + 0.07], ra = [rw.p[2] - rw.r - 0.07, rw.p[2] + rw.r + 0.07];
  for (const sx of [1, -1]) {
    const x = sx * 0.86;
    k.box(N, [0.1, belt + 0.3, ra[1] < fa[0] ? fa[0] - ra[1] : 0.1], [x, (belt - 0.3) / 2, (fa[0] + ra[1]) / 2], { bevel: 0.03 });   // doors
    k.box(N, [0.1, belt + 0.3, 2.15 - fa[1]], [x, (belt - 0.3) / 2, (2.15 + fa[1]) / 2], { bevel: 0.03 });      // front corner
    k.box(N, [0.1, belt + 0.38, ra[0] + 2.15], [x, (belt + 0.08 - 0.3) / 2, (ra[0] - 2.15) / 2], { bevel: 0.03 });   // rear corner
    for (const a of [fa, ra]) {
      const top = a === ra ? belt + 0.08 : belt;
      k.box(N, [0.1, top - 0.42, a[1] - a[0]], [x, (top + 0.42) / 2, (a[0] + a[1]) / 2], { bevel: 0.02 });         // fender over the arch
      for (const [z, d] of [[a[0], 1], [a[1], -1]]) k.box(N, [0.1, 0.24, 0.14], [x, 0.3, z + d * 0.07], { bevel: 0.02 });   // stepped arch corners
      k.box(K, [0.11, 0.04, a[1] - a[0] - 0.3], [x, 0.41, (a[0] + a[1]) / 2], { bevel: 0.01 });                    // arch lip
      k.box(K, [0.04, 0.72, a[1] - a[0]], [sx * 0.69, 0.06, (a[0] + a[1]) / 2], { bevel: 0 });                      // wheel-well liner (hides the cabin)
      k.box(K, [0.18, 0.03, a[1] - a[0]], [sx * 0.78, 0.43, (a[0] + a[1]) / 2], { bevel: 0 });
    }
    k.box(K, [0.04, belt + 0.18, 0.025], [sx * 0.915, (belt - 0.18) / 2 - 0.02, -0.08], { bevel: 0 });            // door seams
    k.box(K, [0.04, belt + 0.18, 0.025], [sx * 0.915, (belt - 0.18) / 2 - 0.02, ra[1] + 0.04], { bevel: 0 });
    for (const z of [0.22, -0.68]) k.box(T, [0.04, 0.035, 0.14], [sx * 0.92, belt - 0.12, z], { bevel: 0 });       // handles
    k.box(K, [0.06, 0.08, fa[0] - ra[1]], [sx * 0.9, -0.27, (fa[0] + ra[1]) / 2], { bevel: 0.02 });                 // sill
    k.box(W, [0.1, 0.05, zA - zC], [x, belt + 0.025, (zA + zC) / 2], { bevel: 0.01 });                            // white belt rail
  }
  // hood (white), nose (navy), grille, lamps, bumper, push bar
  k.box(W, [1.76, 0.1, 2.15 - zA], [0, belt - 0.07, (2.15 + zA) / 2 + 0.02], { bevel: 0.04 });
  k.box(N, [1.78, belt + 0.25, 0.22], [0, (belt - 0.3) / 2 - 0.02, 2.05], { bevel: 0.05 });
  k.box(K, [0.7, 0.22, 0.04], [0, 0.22, 2.17], { bevel: 0.01 });
  for (let i = 0; i < 3; i++) k.box(T, [0.66, 0.025, 0.02], [0, 0.15 + i * 0.07, 2.19], { bevel: 0 });
  for (const sx of [1, -1]) {
    k.box('lamp', [0.34, 0.12, 0.05], [sx * 0.58, 0.33, 2.16], { bevel: 0.02 });
    k.box('amber', [0.1, 0.12, 0.05], [sx * 0.8, 0.33, 2.14], { bevel: 0.01 });
    k.box('tail', [0.3, 0.14, 0.05], [sx * 0.62, 0.42, -2.16], { bevel: 0.02 });
    k.box(K, [0.07, 0.08, 0.14], [sx * 0.95, 0.74, 0.88], { bevel: 0.02 });                                       // mirror
    k.box(N, [0.12, 0.04, 0.06], [sx * 0.9, 0.7, 0.9], { bevel: 0 });
  }
  k.box(K, [1.82, 0.16, 0.16], [0, -0.17, 2.14], { bevel: 0.04 });
  k.box(K, [1.82, 0.16, 0.16], [0, -0.15, -2.13], { bevel: 0.04 });
  for (const sx of [1, -1]) k.tube(K, [[sx * 0.36, -0.22, 2.2], [sx * 0.36, -0.2, 2.32], [sx * 0.36, 0.58, 2.32], [sx * 0.36, 0.62, 2.2]], 0.045, { seg: 6 });
  for (const y of [0.0, 0.36]) k.box(K, [1.0, 0.07, 0.07], [0, y, 2.33], { bevel: 0.015 });

  // --- trunk: a hollow bay (floor + back wall) under a lid hinged at the rear window --------------------------
  const tz0 = -2.06, tz1 = zC - 0.02;
  k.box(T, [1.34, 0.04, tz1 - tz0], [0, 0.22, (tz0 + tz1) / 2], { bevel: 0 });          // trunk floor (its collider: y 0.22)
  k.box(N, [1.78, belt + 0.4, 0.1], [0, (belt + 0.1 - 0.3) / 2, -2.1], { bevel: 0.04 });  // back panel
  k.box(K, [0.4, 0.12, 0.02], [0, 0.18, -2.16], { bevel: 0 });                            // plate recess (blank)
  const hinge = [0, belt + 0.06, zC];
  const trunk = new THREE.Group(); trunk.position.set(...hinge);
  const tk = createKit(THREE, opts);
  tk.box(W, [1.72, 0.06, zC - tz0 + 0.04], [0, 0, -(zC - tz0) / 2], { bevel: 0.02 });
  tk.box(N, [1.72, 0.12, 0.06], [0, -0.05, -(zC - tz0) - 0.02], { bevel: 0.015 });     // the lid's back lip
  tk.box(W, [1.5, 0.04, 0.1], [0, 0.05, -(zC - tz0) + 0.08], { bevel: 0.01 });         // small spoiler
  tk.finish(trunk);

  // --- greenhouse: pillars, roof, glass ---------------------------------------------------------------------------
  const px = 0.78, pxt = 0.71;
  for (const sx of [1, -1]) {
    k.tube(W, [[sx * px, belt, zA], [sx * pxt, roofY - 0.03, zAt]], 0.05, { seg: 5 });
    k.tube(W, [[sx * px, belt, -0.12], [sx * pxt, roofY - 0.03, -0.12]], 0.045, { seg: 5 });
    k.tube(W, [[sx * px, belt + 0.04, zC], [sx * pxt, roofY - 0.03, zCt]], 0.06, { seg: 5 });
    k.box(W, [0.08, 0.06, zAt - zCt], [sx * pxt, roofY - 0.05, (zAt + zCt) / 2], { bevel: 0.01 });   // roof rail
  }
  k.box(W, [pxt * 2 + 0.08, 0.06, zAt - zCt + 0.1], [0, roofY, (zAt + zCt) / 2], { bevel: 0.03 });
  const glassGeo = [];
  const slant = (y0, z0, y1, z1, w) => {
    const len = Math.hypot(y1 - y0, z1 - z0);
    const g = new THREE.BoxGeometry(w, 0.02, len);
    g.rotateX(-Math.atan2(y1 - y0, z1 - z0));
    g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
    glassGeo.push(g);
  };
  slant(belt, zA - 0.02, roofY - 0.04, zAt, px * 2 - 0.06);       // windscreen
  slant(belt + 0.06, zC + 0.02, roofY - 0.04, zCt, px * 2 - 0.06); // rear window
  for (const sx of [1, -1]) {                                       // side windows: one trapezoid per side
    const s = new THREE.Shape();
    s.moveTo(zA - 0.04, belt + 0.03); s.lineTo(zAt + 0.02, roofY - 0.06); s.lineTo(zCt - 0.02, roofY - 0.06); s.lineTo(zC + 0.06, belt + 0.06); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);                                         // shape x -> vehicle z, extrusion -> x
    g.translate(sx * (px - 0.03), 0, 0);
    glassGeo.push(g);
  }
  for (const g of glassGeo) { for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n); }
  const glass = new THREE.Mesh(mergeAll(THREE, glassGeo), k.mat('glass'));
  glass.name = 'part:glass';

  // --- cabin: four seats, dash, steering wheel -------------------------------------------------------------------
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box('seat', [0.5, 0.12, 0.5], [x, y - 0.06, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.5, 0.62, 0.12], [x, y + 0.26, z - 0.26], { rot: [-0.14, 0, 0], bevel: 0.04 });
    k.box(T, [0.4, y - 0.12 - floorY, 0.36], [x, (y - 0.12 + floorY) / 2, z + 0.04], { bevel: 0.02 });
  }
  k.box(T, [1.5, 0.22, 0.32], [0, belt - 0.02, zA - 0.12], { bevel: 0.04 });            // dash
  k.box(T, [0.14, 0.3, 1.0], [0, floorY + 0.15, 0.2], { bevel: 0.03 });                  // centre console
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -1.05;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.26, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.02, 5, 12), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.05], [wheelAt[0], belt - 0.05, zA - 0.2]], 0.025, { seg: 5 });

  // --- light bar ----------------------------------------------------------------------------------------------
  const bar = lightBar(THREE, k, opts, { at: [0, roofY + 0.03, -0.12], width: 1.12, depth: 0.24, height: 0.13, left: '#2a5cff', right: '#ff2a1a', mid: true });

  // --- wheels -----------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', rimCol: 'metal', rim: 0.62 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  k.finish(group);
  group.add(glass, steer, trunk, bar.group);
  let trunkA = 0, lastT = null;
  return {
    group, wheels, steer, trunk, lights: bar.lights,
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
      const want = st.acts?.door_trunk ? 1.2 : 0;                     // the open collider is tilted 1.2 rad
      trunkA += Math.sign(want - trunkA) * Math.min(Math.abs(want - trunkA), dt * 3);
      trunk.rotation.x = trunkA;
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
