// Meadowlark Sedan (reference: assets/ref/sedan.webp). A boxy, friendly four-door in sky blue: dark grey wrap-around
// bumpers, square headlamps with amber corners, a slatted grille with a plain hexagon (no maker's mark), silver hub
// caps. The cabin is hollow behind real glass so four riders show; the trunk is a real open bay (floor = chassis top
// 0.22, walls and back panel where their colliders are) under a lid (`trunk` node) hinged at the foot of the rear
// window that swings up to the open collider's 1.2 rad from st.acts.door_trunk.
// Ground sits ~0.48 m under the body origin at rest; hubs at y ≈ -0.14.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const B = '#74a6dc', BD = '#5d8cc2', T = 'trim', K = 'black';
  const belt = 0.7, roofY = 1.52;                      // roof underside; the cabin collider tops out at the roof top (1.58)
  const zA = 1.0, zAt = 0.42, zC = -1.22, zCt = -0.74;   // windscreen foot/top, rear window foot/top
  const fw = def.wheels.find(w => w.p[2] > 0), rw = def.wheels.find(w => w.p[2] < 0);
  const fa = [fw.p[2] - fw.r - 0.08, fw.p[2] + fw.r + 0.08], ra = [rw.p[2] - rw.r - 0.08, rw.p[2] + rw.r + 0.08];
  const lid = def.parts.find(p => p.door === 'trunk');
  const lidTop = lid.p[1] + lid.box[1];                   // 0.86
  const hinge = [0, lid.p[1] + 0.02, lid.p[2] + lid.box[2]];   // front edge of the lid: y 0.84, z -1.22

  // --- floor pan (= the chassis box, y -0.18 .. 0.22) and engine bay --------------------------------------------
  k.box(T, [1.3, 0.4, 4.1], [0, 0.02, 0], { bevel: 0.03 });
  k.box('seat', [1.3, 0.02, 2.1], [0, 0.225, -0.1], { bevel: 0 });                        // cabin carpet
  k.box('darkMetal', [1.3, 0.3, 0.95], [0, 0.36, 1.55], { bevel: 0.03 });                 // engine bay under the hood

  // --- sides: door panels between the arches, corners, the part over each arch ---------------------------------
  for (const sx of [1, -1]) {
    const x = sx * 0.82;
    k.box(B, [0.12, belt + 0.12, fa[0] - ra[1]], [x, (belt - 0.12) / 2, (fa[0] + ra[1]) / 2], { bevel: 0.03 });   // doors
    k.box(B, [0.12, belt + 0.12, 2.12 - fa[1]], [x, (belt - 0.12) / 2, (2.12 + fa[1]) / 2], { bevel: 0.03 });          // front corner
    k.box(B, [0.12, lidTop - 0.08 + 0.1, ra[0] + 2.12], [x, (lidTop - 0.08 - 0.1) / 2, (ra[0] - 2.12) / 2], { bevel: 0.03 });   // rear corner
    k.box(B, [0.12, belt - 0.4, fa[1] - fa[0]], [x, (belt + 0.4) / 2, (fa[0] + fa[1]) / 2], { bevel: 0.02 });     // over the front arch
    k.box(B, [0.12, lidTop - 0.08 - 0.4, ra[1] - ra[0]], [x, (lidTop - 0.08 + 0.4) / 2, (ra[0] + ra[1]) / 2], { bevel: 0.02 });   // rear quarter
    for (const a of [fa, ra]) {
      for (const [z, d] of [[a[0], 1], [a[1], -1]]) k.box(B, [0.12, 0.2, 0.12], [x, 0.3, z + d * 0.06], { bevel: 0.02 });   // rounded arch corners
      k.box(BD, [0.13, 0.04, a[1] - a[0] - 0.22], [x, 0.4, (a[0] + a[1]) / 2], { bevel: 0.01 });                  // arch lip
    }
    // trunk inner wall (its collider: x 0.74..0.86, y 0.22..0.78)
    k.box(BD, [0.06, 0.56, 0.86], [sx * 0.77, 0.5, -1.65], { bevel: 0 });
    // seams, handles, side trim strip, sill
    for (const z of [-0.18, ra[1] + 0.05]) k.box(K, [0.02, belt + 0.06, 0.02], [sx * 0.885, (belt - 0.06) / 2 - 0.02, z], { bevel: 0 });
    for (const z of [0.3, -0.62]) k.box(K, [0.03, 0.035, 0.15], [sx * 0.89, belt - 0.12, z], { bevel: 0 });
    k.box(BD, [0.02, 0.05, fa[0] - ra[1]], [sx * 0.885, 0.2, (fa[0] + ra[1]) / 2], { bevel: 0 });
    k.box(T, [0.06, 0.08, fa[0] - ra[1]], [sx * 0.86, -0.17, (fa[0] + ra[1]) / 2], { bevel: 0.02 });
    // mirrors
    k.box(K, [0.08, 0.1, 0.15], [sx * 0.97, belt + 0.08, 0.86], { bevel: 0.02 });
    k.box(K, [0.12, 0.04, 0.06], [sx * 0.9, belt + 0.04, 0.9], { bevel: 0 });
    // pillars: A (along the windscreen edge), B (between the doors), C (rear window edge)
    k.tube(B, [[sx * 0.8, belt, zA], [sx * 0.77, roofY, zAt]], 0.045, { seg: 5 });
    k.box(K, [0.05, roofY - belt, 0.09], [sx * 0.79, (roofY + belt) / 2, -0.18], { bevel: 0.01 });
    k.box(B, [0.06, Math.hypot(roofY - lidTop, zCt - zC), 0.2], [sx * 0.79, (roofY + lidTop) / 2, (zC + zCt) / 2 - 0.04], { rot: [Math.atan2(zCt - zC, roofY - lidTop), 0, 0], bevel: 0.01 });
    k.box(B, [0.06, 0.14, 0.42], [sx * 0.79, lidTop + 0.05, -1.05], { bevel: 0.01 });
  }
  // roof (sits on the cabin collider's top), front + rear roof rails
  k.box(B, [1.6, 0.07, zAt - zCt + 0.06], [0, roofY + 0.035, (zAt + zCt) / 2], { bevel: 0.03 });
  k.box(BD, [1.5, 0.05, 0.08], [0, roofY - 0.02, zAt - 0.02], { bevel: 0.01 });
  // hood (back edge at the belt line, nose a little lower; its collider top is 0.48 at the nose)
  k.wedge(B, [1.72, belt - 0.42, 0.08, 2.14 - zA], [0, 0.42, (2.14 + zA) / 2]);
  k.box(B, [1.74, 0.36, 0.18], [0, 0.32, 2.05], { bevel: 0.04 });                         // nose panel
  k.box(BD, [1.5, 0.05, 0.12], [0, belt - 0.0, zA + 0.04], { bevel: 0.01 });                // scuttle under the windscreen
  // grille: a dark slatted panel with a plain hexagon badge, square lamps with amber corners
  k.box(K, [0.78, 0.2, 0.04], [0, 0.32, 2.15], { bevel: 0.01 });
  for (let i = 0; i < 4; i++) k.box(T, [0.74, 0.02, 0.02], [0, 0.25 + i * 0.05, 2.175], { bevel: 0 });
  k.cyl('metal', 0.04, 0.03, [0, 0.33, 2.19], { axis: 'z', seg: 6 });
  for (const sx of [1, -1]) {
    k.box('lamp', [0.3, 0.16, 0.05], [sx * 0.57, 0.33, 2.15], { bevel: 0.015 });
    k.box('amber', [0.1, 0.16, 0.05], [sx * 0.79, 0.33, 2.13], { bevel: 0.01 });
    k.box('amber', [0.03, 0.05, 0.1], [sx * 0.885, 0.36, 1.85], { bevel: 0 });            // side repeater
    k.box('tail', [0.2, 0.22, 0.05], [sx * 0.7, 0.55, -2.16], { bevel: 0.015 });
    k.box('amber', [0.2, 0.06, 0.05], [sx * 0.7, 0.4, -2.16], { bevel: 0 });
  }
  // bumpers wrap round the corners
  for (const [z, s] of [[2.16, 1], [-2.16, -1]]) {
    k.box(T, [1.82, 0.26, 0.2], [0, 0.02, z], { bevel: 0.05 });
    for (const sx of [1, -1]) k.box(T, [0.14, 0.26, 0.36], [sx * 0.84, 0.02, z - s * 0.2], { bevel: 0.04 });
    k.box(K, [1.0, 0.05, 0.02], [0, -0.02, z + s * 0.1], { bevel: 0 });
  }
  k.box(K, [0.32, 0.12, 0.02], [0, 0.0, 2.27], { bevel: 0 });                              // plate recess (blank)

  // --- trunk bay: back panel (its collider: z -2.17..-2.11, y 0.22..0.78) + floor -------------------------------
  k.box(B, [1.72, 0.6, 0.07], [0, 0.48, -2.135], { bevel: 0.02 });
  k.box(K, [1.46, 0.02, 0.84], [0, 0.232, -1.65], { bevel: 0 });                            // trunk mat
  k.box(BD, [1.46, 0.5, 0.05], [0, 0.5, zC + 0.02], { bevel: 0 });                          // bulkhead behind the back seat

  // --- interior: four seats, dash, steering wheel --------------------------------------------------------------
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box('seat', [0.52, y - 0.27, 0.5], [x, (y - 0.05 + 0.22) / 2, z + 0.06], { bevel: 0.04 });
    k.box('seat', [0.52, 0.62, 0.12], [x, y + 0.26, z - 0.25], { rot: [-0.14, 0, 0], bevel: 0.04 });
    k.box('seat', [0.26, 0.14, 0.09], [x, y + 0.66, z - 0.31], { bevel: 0.03 });            // headrest
  }
  k.box(T, [1.5, 0.22, 0.34], [0, 0.6, 0.86], { bevel: 0.04 });                            // dash
  k.box(K, [1.4, 0.04, 0.3], [0, 0.72, 0.9], { rot: [0.25, 0, 0], bevel: 0.01 });
  k.box(T, [0.14, 0.2, 0.7], [0, 0.32, 0.15], { bevel: 0.03 });                            // centre console
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group();
  steer.position.set(...wheelAt);
  steer.rotation.x = -0.95;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.04, 0.04, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 12), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.05], [wheelAt[0], 0.58, wheelAt[2] + 0.22]], 0.025);

  // --- glass: one see-through mesh (windscreen, rear window, four side windows) ---------------------------------
  const gl = [];
  const slab = (pts, x, t = 0.02) => {         // a flat window from [z, y] points, standing at x
    const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
    g.rotateY(-Math.PI / 2); g.translate(x + t / 2, 0, 0);
    gl.push(g);
  };
  for (const sx of [1, -1]) {
    slab([[zA - 0.04, belt + 0.02], [zAt + 0.04, roofY - 0.04], [-0.14, roofY - 0.04], [-0.14, belt + 0.02]], sx * 0.8);
    slab([[-0.22, belt + 0.02], [-0.22, roofY - 0.04], [zCt - 0.04, roofY - 0.04], [-1.02, lidTop + 0.12], [-1.02, belt + 0.02]], sx * 0.8);
  }
  const pane = (a, b, w) => {                   // a slanted pane across the car from [y, z] a to b
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const g = new THREE.BoxGeometry(w, 0.02, l);
    g.rotateX(-Math.atan2(b[0] - a[0], b[1] - a[1]));
    g.translate(0, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    gl.push(g);
  };
  pane([belt + 0.01, zA], [roofY, zAt], 1.52);
  pane([lidTop + 0.01, zC + 0.02], [roofY, zCt], 1.48);
  const glass = new THREE.Mesh(mergeAll(THREE, gl), k.mat('glass'));
  glass.renderOrder = 2;
  // window frames: dark trim along the windscreen and rear window edges
  k.box(K, [1.56, 0.04, 0.05], [0, belt + 0.02, zA + 0.01], { bevel: 0 });
  k.box(K, [1.5, 0.04, 0.05], [0, lidTop + 0.03, zC + 0.02], { bevel: 0 });

  // --- trunk lid: its own node, hinged at its front edge; closed = the lid collider, open = rot 1.2 -------------
  const trunk = new THREE.Group(); trunk.position.set(...hinge);
  const tk = createKit(THREE, opts);
  const lz = lid.box[2] * 2;                                   // 0.96
  tk.box(B, [1.72, 0.06, lz], [0, 0, -lz / 2], { bevel: 0.025 });
  tk.box(BD, [1.6, 0.03, 0.05], [0, 0.03, -lz + 0.05], { bevel: 0 });
  tk.box(K, [0.18, 0.04, 0.04], [0, -0.04, -lz + 0.02], { bevel: 0 });       // latch
  tk.box(T, [1.5, 0.03, lz - 0.12], [0, -0.04, -lz / 2], { bevel: 0 });      // inner skin (shows when open)
  tk.finish(trunk);

  // --- wheels ---------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const t = k.tyre({ r: w.r, w: w.w, style: 'road', rimCol: 'metal', rim: 0.64 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });

  k.finish(group);
  group.add(glass, steer, trunk);
  let trunkA = 0, lastT = null;
  return {
    group, wheels, steer, trunk,
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
      const want = st.acts?.door_trunk ? (lid.open?.rot?.[0] ?? 1.2) : 0;
      trunkA += Math.sign(want - trunkA) * Math.min(Math.abs(want - trunkA), dt * 3);
      trunk.rotation.x = trunkA;
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
