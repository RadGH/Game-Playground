// Produce Trailer (reference: assets/ref/produce_trailer.webp). A red tipping body with ribbed sides and a grey mesh
// cage on top, on a grey tandem chassis with an A-frame drawbar to a ring eye at def.hitch, a jack stand foot (the
// `leg` wheel) and a chrome tipping ram up front. Moving:
//   * `bed` — the whole body, pivoted at def.tip.pivot (its back bottom edge); it rises to def.tip.angle at
//     def.tip.speed while st.acts.door_bed is on (the same numbers vehicle.js turns the bed colliders with), and the
//     `tailgate` swings out from its top hinge as it goes.
//   * `heap` — the crop: ~170 low-poly cabbages, carrots and corn cobs in ONE vertex-coloured mesh, built bottom layer
//     first, so st.load 0..1 just sets the draw range (no rebuild, no extra draw calls). Farming (M6) sets E.load.
// No words, no brands.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const R = 'red', RD = 'redDark', G = '#8f949b', T = 'trim', K = 'black', DM = 'darkMetal';
  const ch = def.chassis, tip = def.tip;
  const [, PY, PZ] = tip.pivot;                                           // 0.27, -2.3
  const floorP = def.parts[0], sideP = def.parts[1], frontP = def.parts[3];
  const bx = sideP.p[0] + sideP.box[0];                                   // 1.04 outer
  const fTop = floorP.p[1] + floorP.box[1];                               // 0.37
  const bz0 = floorP.p[2] - floorP.box[2], bz1 = floorP.p[2] + floorP.box[2];   // -2.3..1.5
  const wTop = sideP.p[1] + sideP.box[1];                                 // 1.37: cage top
  const redTop = fTop + 0.6;                                              // 0.97: solid red up to here
  const road = def.wheels.filter(w => !w.leg), jack = def.wheels.find(w => w.leg);
  const ground = road[0].p[1] + 0.1 - 0.05 - road[0].r;

  // --- chassis: two rails, cross members, the bogie (a walking beam per side), drawbar -------------------------------
  const rz0 = ch.p[2] - ch.hz, rz1 = ch.p[2] + ch.hz;
  for (const sx of [1, -1]) k.box(G, [0.14, 0.2, rz1 - rz0], [sx * 0.42, ch.p[1], ch.p[2]], { bevel: 0.02 });
  for (const z of [rz1 - 0.1, rz0 + 0.1, -0.5]) k.box(G, [0.84, 0.12, 0.12], [0, ch.p[1], z], { bevel: 0.015 });
  const zs = road.map(w => w.p[2]), za = Math.max(...zs), zb = Math.min(...zs), hubY = road[0].p[1] + 0.06;
  for (const sx of [1, -1]) {
    const X = sx * (Math.abs(road[0].p[0]) - road[0].w / 2 - 0.08);
    k.box(G, [0.1, 0.12, za - zb + 0.3], [X, hubY, (za + zb) / 2], { bevel: 0.02 });                    // walking beam
    k.box(G, [0.12, ch.p[1] - hubY + 0.05, 0.16], [X * 0.8, (ch.p[1] + hubY) / 2, (za + zb) / 2], { bevel: 0.02 });   // hanger
    for (const z of zs) k.cyl(DM, 0.07, 0.14, [X, hubY, z], { axis: 'x', seg: 8 });
    k.box('tail', [0.12, 0.08, 0.04], [sx * 0.42, ch.p[1] - 0.02, rz0 - 0.03], { bevel: 0.01 });
  }
  const [hX, hY, hZ] = def.hitch;
  for (const sx of [1, -1]) k.tube(G, [[sx * 0.42, ch.p[1], rz1 - 0.05], [hX + sx * 0.06, hY, hZ - 0.5]], 0.05, { seg: 6 });
  k.box(G, [0.14, 0.12, 0.55], [hX, hY, hZ - 0.27], { bevel: 0.02 });
  const eye = new THREE.TorusGeometry(0.075, 0.025, 5, 12); eye.rotateX(Math.PI / 2); eye.translate(hX, hY, hZ);
  if (jack) {
    const [jx, jy, jz] = jack.p;
    k.box(G, [0.09, hY - jy + 0.1, 0.09], [jx, (hY + jy) / 2, jz], { bevel: 0.01 });
    k.box(DM, [0.06, 0.12, 0.06], [jx, jy - 0.02, jz], { bevel: 0 });
    k.box(DM, [0.2, 0.03, 0.18], [jx, jy - jack.r + 0.06, jz], { bevel: 0 });                       // foot plate
    k.box(T, [0.16, 0.03, 0.03], [jx + 0.1, hY + 0.12, jz], { bevel: 0 });                           // crank
  }
  const ramBase = [0, ch.p[1] + 0.08, rz1 - 0.35];

  // --- the bed: everything below is built in the BED's frame (origin = the pivot) -----------------------------------
  const bed = new THREE.Group(); bed.position.set(0, PY, PZ);
  const b = createKit(THREE, opts);
  const L = (y, z) => [y - PY, z - PZ];                                   // vehicle (y, z) -> bed frame
  const [fy0] = L(fTop - 0.1, 0), [fy1] = L(fTop, 0), [ry] = L(redTop, 0), [cy] = L(wTop, 0);
  const z0 = 0, z1 = bz1 - PZ, zm = (z0 + z1) / 2, len = z1 - z0;
  b.box(RD, [bx * 2 - 0.08, fy1 - fy0, len], [0, (fy0 + fy1) / 2, zm], { bevel: 0.02 });             // floor
  b.box(K, [bx * 2 - 0.16, 0.012, len - 0.1], [0, fy1 + 0.004, zm], { bevel: 0 });                   // floor top (dark)
  for (const sx of [1, -1]) {
    b.box(R, [0.06, ry - fy0, len], [sx * (bx - 0.03), (ry + fy0) / 2, zm], { bevel: 0.015 });     // side
    b.box(R, [0.1, 0.06, len + 0.04], [sx * (bx - 0.03), ry - 0.03, zm], { bevel: 0.015 });        // top rail
    b.box(RD, [0.08, 0.08, len], [sx * (bx - 0.05), fy0 - 0.02, zm], { bevel: 0.015 });            // bottom rail
    for (let i = 0; i <= 5; i++) b.box(RD, [0.04, ry - fy0 - 0.1, 0.06], [sx * (bx + 0.005), (ry + fy0) / 2, z0 + 0.15 + i * (len - 0.3) / 5], { bevel: 0.01 });   // ribs
  }
  b.box(R, [bx * 2, ry - fy0, 0.08], [0, (ry + fy0) / 2, z1 - 0.04], { bevel: 0.02 });                // front wall
  for (const sx of [1, -1]) b.box(RD, [0.08, ry - fy0, 0.1], [sx * (bx - 0.04), (ry + fy0) / 2, z1 + 0.01], { bevel: 0.015 });
  // mesh cage: frame + a grid of thin bars on both sides and the front (the back is on the tailgate)
  const bar = (w, h, d, p) => b.box(G, [w, h, d], p, { bevel: 0 });
  for (const sx of [1, -1]) {
    const X = sx * (bx - 0.03);
    bar(0.05, 0.05, len, [X, cy - 0.025, zm]);
    for (const z of [z0 + 0.03, zm, z1 - 0.03]) bar(0.05, cy - ry, 0.05, [X, (cy + ry) / 2, z]);
    for (let z = z0 + 0.15; z < z1 - 0.1; z += 0.15) bar(0.014, cy - ry - 0.05, 0.014, [X, (cy + ry) / 2 - 0.02, z]);
    for (const f of [0.33, 0.66]) bar(0.014, 0.014, len, [X, ry + (cy - ry) * f, zm]);
  }
  bar(bx * 2, 0.05, 0.05, [0, cy - 0.025, z1 - 0.03]);
  for (let x = -bx + 0.15; x < bx - 0.1; x += 0.15) bar(0.014, cy - ry - 0.05, 0.014, [x, (cy + ry) / 2 - 0.02, z1 - 0.03]);
  for (const f of [0.33, 0.66]) bar(bx * 2, 0.014, 0.014, [0, ry + (cy - ry) * f, z1 - 0.03]);
  b.box(DM, [0.3, 0.1, 0.3], [0, fy0 - 0.06, z1 - 0.35], { bevel: 0.02 });                           // ram bracket
  for (const sx of [1, -1]) b.box(DM, [0.12, 0.12, 0.12], [sx * 0.42, fy0 - 0.06, z0 + 0.06], { bevel: 0.01 });   // hinge blocks
  b.finish(bed);

  // tailgate: hinged along its top edge at the back of the bed (red panel + its cage panel)
  const tailgate = new THREE.Group(); tailgate.position.set(0, cy, z0 + 0.02);
  const tk = createKit(THREE, opts);
  tk.box(R, [bx * 2 - 0.02, ry - fy0, 0.07], [0, (ry + fy0) / 2 - cy, 0], { bevel: 0.02 });
  for (let x = -bx + 0.2; x < bx - 0.1; x += 0.4) tk.box(RD, [0.05, ry - fy0 - 0.1, 0.04], [x, (ry + fy0) / 2 - cy, -0.05], { bevel: 0.01 });
  tk.box(G, [bx * 2, 0.05, 0.05], [0, -0.025, 0], { bevel: 0 });
  for (let x = -bx + 0.15; x < bx - 0.1; x += 0.15) tk.box(G, [0.014, cy - ry - 0.05, 0.014], [x, (ry - cy) / 2 - 0.02, 0], { bevel: 0 });
  for (const f of [0.33, 0.66]) tk.box(G, [bx * 2, 0.014, 0.014], [0, (ry - cy) * f, 0], { bevel: 0 });
  tk.box('tail', [0.14, 0.08, 0.03], [bx - 0.15, ry - cy - 0.2, -0.05], { bevel: 0.005 });
  tk.box('tail', [0.14, 0.08, 0.03], [-bx + 0.15, ry - cy - 0.2, -0.05], { bevel: 0.005 });
  tk.finish(tailgate);
  bed.add(tailgate);

  // the heap: pieces laid bottom layer first; draw range = how full
  const heap = buildHeap(THREE, opts, { x: bx - 0.12, z0: z0 + 0.12, z1: z1 - 0.12, y0: fy1 + 0.02, top: ry + 0.25 - fy1 });
  heap.mesh.position.set(0, 0, 0);
  bed.add(heap.mesh);

  // --- wheels ---------------------------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    if (w.leg) { const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin); g.position.set(...w.p); return { group: g, spin, base: w.p, leg: true }; }   // the stand foot is drawn on the chassis
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: 14, rimCol: 'metal', rim: 0.55 });
    t.group.position.set(...w.p);
    group.add(t.group);
    return { ...t, base: w.p };
  });
  const ram = k.shock(ramBase, ramBase, { r: 0.06, col: 'chrome' });
  const ramTop = new THREE.Vector3();
  k.finish(group);
  group.add(bed, ram, new THREE.Mesh(eye, k.mat(G)));

  let a = 0, lastT = null;
  return {
    group, wheels, bed, tailgate, heap: heap.mesh,
    update(st) {
      st.wheels?.forEach((w, i) => {
        const m = wheels[i]; if (!m || m.leg) return;
        m.group.position.y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.spin.rotation.x = w.spin || 0;
      });
      const t = st.t ?? performance.now() / 1000;
      const dt = lastT == null ? 1 : Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
      const want = st.acts?.door_bed ? tip.angle : 0, step = (tip.speed ?? 0.4) * dt;
      a += Math.max(-step, Math.min(step, want - a));
      bed.rotation.x = a;
      tailgate.rotation.x = Math.min(1.1, (a / tip.angle) * 1.6);
      // the ram: chassis -> the bracket under the bed's front
      ramTop.set(0, fy0 - 0.08, z1 - 0.35).applyAxisAngle(X_AXIS, a).add(bed.position);
      ram.set(ramBase, [ramTop.x, ramTop.y, ramTop.z]);
      heap.set(st.load ?? 0);
    },
  };
}
const X_AXIS = { x: 1, y: 0, z: 0, isVector3: true };

/** A heap of produce in the box x ±hx, z0..z1, from y0 up (a mound `top` high), as one draw-ranged mesh. */
let HEAP_MAT = null;
function buildHeap(THREE, { enhance = m => m }, { x: hx, z0, z1, y0, top }) {
  const pieces = [];
  let seed = 4242;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const COL = { cabbage: ['#6fae3a', '#8cc63f'], carrot: ['#ef7a1a'], leaf: ['#4f8f2a'], corn: ['#f2c21b'], husk: ['#9cc65a'] };
  const add = (g, col, y) => { pieces.push({ g, col, y }); };
  const layers = 5, dy = top / layers;
  for (let L = 0; L < layers; L++) {
    const shrink = 1 - L / (layers + 1.2);                              // a mound: each layer covers less
    const cx = hx * shrink, czm = (z0 + z1) / 2, cz = (z1 - z0) / 2 * shrink;
    for (let x = -cx + 0.18; x <= cx - 0.12; x += 0.42) for (let z = czm - cz + 0.2; z <= czm + cz - 0.12; z += 0.42) {
      const px = x + (rnd() - 0.5) * 0.16, pz = z + (rnd() - 0.5) * 0.16, py = y0 + L * dy + 0.1 + rnd() * 0.05, kind = rnd();
      if (kind < 0.38) {                                                  // cabbage
        const g = new THREE.IcosahedronGeometry(0.15 + rnd() * 0.04, 0); g.scale(1, 0.85, 1); g.translate(px, py, pz);
        add(g, COL.cabbage[rnd() < 0.5 ? 0 : 1], py);
      } else if (kind < 0.76) {                                           // carrot, lying, with a leafy tuft
        const g = new THREE.ConeGeometry(0.05, 0.3, 5); g.rotateZ(Math.PI / 2); g.rotateY(rnd() * Math.PI); g.translate(px, py - 0.05, pz);
        add(g, COL.carrot[0], py - 0.05);
        const f = new THREE.ConeGeometry(0.04, 0.12, 4); f.translate(px, py + 0.01, pz); add(f, COL.leaf[0], py);
      } else {                                                            // corn cob in its husk
        const g = new THREE.CylinderGeometry(0.045, 0.055, 0.26, 6); g.rotateZ(Math.PI / 2 - 0.3); g.rotateY(rnd() * Math.PI); g.translate(px, py - 0.04, pz);
        add(g, COL.corn[0], py - 0.04);
        const h = new THREE.ConeGeometry(0.05, 0.14, 4); h.rotateZ(-Math.PI / 2); h.translate(px - 0.12, py - 0.06, pz); add(h, COL.husk[0], py - 0.06);
      }
    }
  }
  pieces.sort((a, b) => a.y - b.y);
  const pos = [], nor = [], col = [], ends = [];
  const c = new THREE.Color();
  for (const p of pieces) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    g.computeVertexNormals();
    c.set(p.col);
    const P = g.attributes.position.array, N = g.attributes.normal.array;
    for (let i = 0; i < P.length; i++) { pos.push(P[i]); nor.push(N[i]); }
    for (let i = 0; i < P.length / 3; i++) col.push(c.r, c.g, c.b);
    ends.push(pos.length / 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  HEAP_MAT ||= enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0, flatShading: true }));
  const mesh = new THREE.Mesh(geo, HEAP_MAT);
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'heap';
  let last = -1;
  return {
    mesh,
    set(load) {
      load = Math.max(0, Math.min(1, load || 0));
      if (load === last) return; last = load;
      const n = Math.round(load * ends.length);
      mesh.visible = n > 0;
      geo.setDrawRange(0, n ? ends[n - 1] : 0);
    },
  };
}
