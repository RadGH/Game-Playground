// Pedalpush Bicycle (reference: assets/ref/bicycle.webp). A sturdy teal kid's mountain bike: diamond frame, flat
// black bars, black saddle on a steel post, spoked wheels with knobby tyres, a chainring with cranks and pedals.
// The fork + bars turn about the head tube (`steer`; its bars group puts the grips on the seat's barsAt). The chain
// stays pivot at the bottom bracket and the seat stays + chain are re-aimed each frame so the rear hub can ride its
// small suspension travel without the frame coming apart. The cranks turn with the rear wheel (one turn of the
// cranks = two of the wheel) and the pedals stay level.
// Ground sits ~0.34 m under the body origin at rest; hubs at y ≈ -0.04.
import { createKit } from './kit.js';
import { mergeGeometries } from '../../../../../vendor/three/addons/utils/BufferGeometryUtils.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const F = 'teal', K = 'black', T = 'trim', S = 'steel';
  const [fw, rw] = def.wheels;
  const seat = def.seats[0];
  const barsAt = seat.barsAt;
  const rest = 0.06;                                   // hub height above its data point at the garage's rest
  const head = [0, 0.36, 0.36];                        // top of the head tube = the steering pivot
  const headLo = [0, 0.22, 0.4];
  const bb = [0, -0.1, -0.02];                         // bottom bracket (cranks), feet 0.6 under the hips
  const crankLen = Math.min(0.16, bb[1] - (seat.p[1] - 0.6) + 0.01);
  const stTop = [0, 0.19, -0.13];                      // top of the seat tube
  const r = 0.024;

  // --- frame: head tube, top tube, down tube, seat tube; post + saddle ----------------------------------------
  k.tube(F, [head, headLo], 0.032, { seg: 8 });
  k.tube(F, [[0, 0.33, 0.37], stTop], r, { seg: 7 });
  k.tube(F, [[0, 0.25, 0.39], bb], r * 1.15, { seg: 7 });
  k.tube(F, [bb, stTop], r, { seg: 7 });
  k.cyl(F, 0.04, 0.09, bb, { axis: 'x', seg: 10 });                                   // bottom bracket shell
  const saddleY = seat.p[1] - 0.06;
  k.tube(S, [stTop, [0, saddleY - 0.04, seat.p[2] - 0.0]], 0.014, { seg: 6 });         // seat post
  k.box(K, [0.13, 0.05, 0.24], [0, saddleY - 0.02, seat.p[2] - 0.02], { bevel: 0.02 }); // saddle
  k.box(K, [0.07, 0.04, 0.1], [0, saddleY - 0.02, seat.p[2] + 0.12], { bevel: 0.015 }); // its nose

  // --- chain stays (pivot at the bottom bracket) -----------------------------------------------------------------
  const arm = new THREE.Group(); arm.position.set(...bb); group.add(arm);
  const ak = createKit(THREE, opts);
  const armLen = Math.hypot(rw.p[2] - bb[2], rw.p[1] + rest - bb[1]);
  for (const sx of [1, -1]) ak.box(F, [0.022, 0.03, armLen], [sx * 0.04, 0, -armLen / 2], { bevel: 0.006 });
  ak.finish(arm);
  // seat stays + chain runs: struts re-aimed each frame
  const stay = [1, -1].map(sx => { const s = k.shock([sx * 0.03, stTop[1] - 0.02, stTop[2]], [sx * 0.04, rw.p[1] + rest, rw.p[2]], { r: 0.014, col: F }); group.add(s); return s; });
  const ringR = 0.085, cogR = 0.04, cx = -0.06;       // drive side is the right (-x)
  const chainTop = k.shock([cx, bb[1] + ringR, bb[2]], [cx, rw.p[1] + rest + cogR, rw.p[2]], { r: 0.006, col: K });
  const chainBot = k.shock([cx, bb[1] - ringR, bb[2]], [cx, rw.p[1] + rest - cogR, rw.p[2]], { r: 0.006, col: K });
  group.add(chainTop, chainBot);

  // --- cranks: a ring + two arms that turn, pedals that stay level --------------------------------------------
  const cranks = new THREE.Group(); cranks.position.set(...bb); group.add(cranks);
  const ck = createKit(THREE, opts);
  ck.cyl(T, ringR, 0.012, [cx, 0, 0], { axis: 'x', seg: 14 });
  ck.box(K, [0.016, crankLen, 0.03], [cx - 0.02, crankLen / 2, 0], { bevel: 0 });
  ck.box(K, [0.016, crankLen, 0.03], [-cx + 0.02, -crankLen / 2, 0], { bevel: 0 });
  ck.cyl(S, 0.02, 0.18, [0, 0, 0], { axis: 'x', seg: 6 });
  ck.finish(cranks);
  const pedals = [[cx - 0.07, crankLen], [-cx + 0.07, -crankLen]].map(([x, y]) => {
    const p = new THREE.Group(); p.position.set(x, y, 0); cranks.add(p);
    const pk = createKit(THREE, opts);
    pk.box(K, [0.09, 0.022, 0.07], [0, 0, 0], { bevel: 0.006 });
    pk.box(T, [0.1, 0.012, 0.012], [0, 0.012, 0.03], { bevel: 0 });
    pk.box(T, [0.1, 0.012, 0.012], [0, 0.012, -0.03], { bevel: 0 });
    pk.finish(p);
    return p;
  });
  cranks.traverse(o => { if (o.isMesh) o.userData.detail = true; });

  // --- steering: fork, stem, bars --------------------------------------------------------------------------------
  const steer = new THREE.Group(); steer.position.set(...head);
  const rake = -Math.atan2(fw.p[2] - head[2], head[1] - fw.p[1]);
  const forkLen = Math.hypot(fw.p[2] - head[2], head[1] - fw.p[1]);
  const fork = new THREE.Group(); fork.rotation.x = rake; steer.add(fork);
  const fk = createKit(THREE, opts);
  fk.box(F, [0.12, 0.04, 0.05], [0, -0.17, 0], { bevel: 0.01 });                         // crown
  for (const sx of [1, -1]) fk.cyl(F, 0.016, forkLen - 0.17, [sx * 0.05, -(forkLen + 0.17) / 2, 0], { seg: 6 });
  fk.cyl(F, 0.02, 0.17, [0, -0.085, 0], { seg: 6 });                                       // steerer through the head tube
  fk.finish(fork);
  const bars = new THREE.Group();
  bars.position.set(0, barsAt[1] - 0.035 - head[1], barsAt[2] + 0.02 - head[2]);
  steer.add(bars);
  const sk = createKit(THREE, opts);
  sk.tube(K, [[0, 0, 0], [0, bars.position.y, bars.position.z]], 0.018, { seg: 6 });       // stem
  sk.finish(steer);
  const bk = createKit(THREE, opts);
  bk.tube(K, [[0.33, 0.035, -0.02], [0.12, 0.0, 0.0], [-0.12, 0.0, 0.0], [-0.33, 0.035, -0.02]], 0.014, { seg: 5 });
  for (const sx of [1, -1]) {
    bk.cyl(K, 0.022, 0.11, [sx * 0.29, 0.035, -0.02], { axis: 'x', seg: 6 });
    bk.box(T, [0.08, 0.012, 0.02], [sx * 0.22, 0.01, 0.05], { bevel: 0 });                 // brake levers
  }
  bk.cyl(T, 0.022, 0.05, [0, 0, 0], { axis: 'x', seg: 6 });
  bk.finish(bars);

  // --- wheels ---------------------------------------------------------------------------------------------------
  // the kit's tyre is a solid drum (right for a car, it would hide the spokes here): an open hoop tyre instead
  const front = bikeWheel(THREE, k, opts, fw), rear = bikeWheel(THREE, k, opts, rw);
  const gk = createKit(THREE, opts);
  gk.cyl(T, cogR, 0.02, [cx + 0.02, 0, 0], { axis: 'x', seg: 10 });                     // rear cog
  gk.finish(rear.group);
  group.add(front.group, rear.group);

  k.finish(group);
  group.add(steer);
  return {
    group, steer, cranks,
    wheels: [front, rear].map((t, i) => ({ ...t, base: def.wheels[i].p })),
    update(st) {
      const [wf, wr] = st.wheels;
      const yf = fw.p[1] + (wf?.comp ?? 0.1) - 0.05, yr = rw.p[1] + (wr?.comp ?? 0.1) - 0.05;
      steer.rotation.y = wf?.steer || 0;
      front.group.position.set(fw.p[0], yf, fw.p[2]);
      front.group.rotation.y = wf?.steer || 0;
      front.spin.rotation.x = wf?.spin || 0;
      rear.group.position.set(rw.p[0], yr, rw.p[2]);
      rear.spin.rotation.x = wr?.spin || 0;
      arm.rotation.x = Math.atan2(yr - bb[1], -(rw.p[2] - bb[2]));
      stay.forEach((s, i) => { const sx = i ? -1 : 1; s.set([sx * 0.03, stTop[1] - 0.02, stTop[2]], [sx * 0.04, yr, rw.p[2]]); });
      chainTop.set([cx, bb[1] + ringR, bb[2]], [cx, yr + cogR, rw.p[2]]);
      chainBot.set([cx, bb[1] - ringR, bb[2]], [cx, yr - cogR, rw.p[2]]);
      const a = (wr?.spin || 0) * 0.5;
      cranks.rotation.x = a;
      for (const p of pedals) p.rotation.x = -a;
    },
  };
}

/** A bicycle wheel: a knobbly rubber hoop (one mesh), a rim, a hub and 16 spokes. Returns { group, spin }. */
function bikeWheel(THREE, k, opts, w) {
  const group = new THREE.Group(), spin = new THREE.Group();
  group.add(spin);
  const tube = Math.max(w.w, 0.06) / 2, R = w.r - tube;
  const gs = [];
  const tor = new THREE.TorusGeometry(R, tube, 6, 28); tor.rotateY(Math.PI / 2); gs.push(tor);
  const n = 24;
  for (let i = 0; i < n; i++) {
    const b = new THREE.BoxGeometry(tube * 1.7, 0.022, 0.035);
    b.translate(0, w.r - 0.006, 0); b.rotateX((i / n) * Math.PI * 2);
    gs.push(b);
  }
  const rubber = new THREE.Mesh(mergeGeometries(gs), k.mat('rubber'));
  rubber.castShadow = true;
  spin.add(rubber);
  const sk = createKit(THREE, opts);
  const rim = new THREE.TorusGeometry(R - tube * 0.8, 0.012, 4, 24); rim.rotateY(Math.PI / 2);
  sk.cyl('trim', 0.025, 0.08, [0, 0, 0], { axis: 'x', seg: 8 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, side = i % 2 ? 1 : -1;
    const tip = [0, Math.cos(a) * (R - tube * 0.8), Math.sin(a) * (R - tube * 0.8)];
    sk.tube('metal', [[side * 0.03, 0, 0], tip], 0.004, { seg: 3 });
  }
  sk.finish(spin);
  const rimMesh = new THREE.Mesh(rim, k.mat('trim'));
  spin.add(rimMesh);
  return { group, spin };
}
