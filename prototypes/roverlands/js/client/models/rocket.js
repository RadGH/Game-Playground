// Skyreach Rocket (reference: assets/ref/rocket.webp — the pad and gantry tower on that sheet are world furniture for
// the launch site, not part of the vehicle). A stubby two-stage toy rocket: a wide white booster with an orange band
// and a black-and-white chequer ring, four swept orange-and-white fins (on their colliders) with landing feet under
// the tips (the wheels), four engine bells; on top a slimmer upper stage with its own chequer ring and a small engine
// inside the interstage, then the crew capsule (a white cone with an orange band, round windows and a hatch, two seats
// and a hand controller inside on a floor at 9.42) and an escape tower with a spike. The `booster` group falls away
// when st.acts.door_stage turns on (and comes back when it is reset); the exhaust plume grows with st.lever (the
// throttle lever) under whichever stage is firing. Ground ~0.1 m under the origin at rest.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const W = '#eef0f2', OR = '#ef7a1f', ORD = '#c55f12', K = '#202226', G = '#8c9198';
  const booster = new THREE.Group(); group.add(booster);
  const bk = createKit(THREE, opts);
  const stageBox = def.parts[0], fin = def.parts[1];
  const bTop = stageBox.p[1] + stageBox.box[1];                         // 6.4
  const ch = def.chassis, top = ch.p[1] + ch.hy;                        // 11.6
  const capBot = 9.2, rUp = 1.08;

  // --- booster: body of revolution in bands (bottom wide, a cone up to the interstage) -----------------------------------
  const band = (kit, col, r0, r1, y0, y1, seg = 18) => kit.cyl(col, r0, y1 - y0, [0, (y0 + y1) / 2, 0], { seg, r2: r1 });
  const rB = y => y < 5.0 ? 1.85 - (y - 0.9) * 0.07 : 1.56 - (y - 5.0) / 1.4 * (1.56 - rUp - 0.04);
  const bands = [[0.9, 1.4, W], [1.4, 2.6, OR], [2.6, 3.0, W], [3.3, 5.0, W], [5.0, bTop, W]];
  for (const [y0, y1, col] of bands) band(bk, col, rB(y0), rB(y1), y0, y1);
  band(bk, K, rB(0.9) - 0.02, rB(0.9), 0.8, 0.9);
  // chequer ring y 3.0..3.3: two rows of alternating tiles
  const tiles = (kit, r, y0, n) => { for (let row = 0; row < 2; row++) for (let i = 0; i < n; i++) {
    const a = (i + row * 0.5) / n * Math.PI * 2, y = y0 + 0.075 + row * 0.15;
    kit.box((i % 2) ? W : K, [2 * Math.PI * r / n * 1.02, 0.15, 0.06], [Math.sin(a) * r, y, Math.cos(a) * r], { rot: [0, a, 0], bevel: 0 });
  } };
  tiles(bk, rB(3.15) - 0.02, 3.0, 18);
  // fins (four, on the diagonals), swept: tall at the root, short at the tip
  const finIn = rB(1.5) - 0.1, finOut = fin.box[0];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, rm = (finIn + finOut) / 2;
    bk.wedge(i % 2 ? OR : W, [0.16, 2.6, 0.9, finOut - finIn], [Math.sin(a) * rm, 0.75, Math.cos(a) * rm], { rot: [0, a, 0] });
    bk.wedge(i % 2 ? W : OR, [0.17, 1.1, 0.45, (finOut - finIn) * 0.6], [Math.sin(a) * (rm + 0.25), 0.75, Math.cos(a) * (rm + 0.25)], { rot: [0, a, 0] });
  }
  // engine bells + thrust plate
  bk.cyl(K, rB(0.9) - 0.15, 0.12, [0, 0.82, 0], { seg: 16 });
  const bells = [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]];
  for (const [x, z] of bells) { bk.cyl(K, 0.42, 0.6, [x, 0.48, z], { seg: 12, r2: 0.22 }); bk.cyl('darkMetal', 0.24, 0.08, [x, 0.8, z], { seg: 10 }); }

  // --- landing feet (the wheels) under the fin tips, in the booster -----------------------------------------------------
  const wheels = def.wheels.map(w => {
    const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin); g.position.set(...w.p); booster.add(g);
    const fk = createKit(THREE, opts);
    fk.cyl(K, w.r, 0.12, [0, -w.r + 0.08, 0], { seg: 10 });
    fk.cyl('darkMetal', 0.07, 0.6, [0, 0.2, 0], { seg: 6 });
    fk.finish(spin);
    return { group: g, spin, base: w.p };
  });
  bk.finish(booster);

  // --- upper stage: white with an orange band + chequer, small engine in the interstage --------------------------------
  band(k, W, rUp, rUp, bTop, 7.3); band(k, OR, rUp, rUp, 7.3, 7.9); band(k, W, rUp, rUp, 8.2, capBot - 0.12);
  tiles(k, rUp + 0.01, 7.9, 14);
  band(k, K, rUp + 0.02, rUp + 0.02, capBot - 0.12, capBot);
  k.cyl(K, 0.5, 0.45, [0, bTop - 0.2, 0], { seg: 12, r2: 0.28 });                       // upper engine (seen once staged)

  // --- capsule: cone with an orange band, windows, hatch; tower --------------------------------------------------------
  const rC = y => 1.15 - (y - capBot) / (top - capBot) * (1.15 - 0.45);
  band(k, W, rC(capBot), rC(top), capBot, top, 16);          // one shell: a band's end caps would cut through the cabin
  band(k, ORD, 0.48, 0.3, top, top + 0.25, 12);
  const slope = Math.atan2(1.15 - 0.45, top - capBot);
  const onWall = (a, y, out, size, col) => {
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(-slope)), 'XYZ');
    const r = rC(y) + out; k.box(col, size, [Math.sin(a) * r, y, Math.cos(a) * r], { rot: [e.x, e.y, e.z], bevel: 0 });
  };
  for (let i = 0; i < 16; i++) onWall(i / 16 * Math.PI * 2, 10.38, 0.012, [2 * Math.PI * rC(10.38) / 16 * 1.04, 0.34, 0.03], OR);   // orange band, as panels
  for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI]) { onWall(a, 9.95, 0.02, [0.36, 0.36, 0.03], K); onWall(a, 9.95, 0.035, [0.26, 0.26, 0.02], '#4d7aa6'); }
  onWall(0, 9.75, 0.02, [0.62, 0.85, 0.03], K); onWall(0, 9.75, 0.035, [0.54, 0.77, 0.02], G);
  // escape tower: four legs and rings, a spike
  const t0 = top + 0.25, t1 = top + 1.75;
  for (let i = 0; i < 4; i++) { const a = Math.PI / 4 + i * Math.PI / 2; k.tube(G, [[Math.sin(a) * 0.3, t0, Math.cos(a) * 0.3], [Math.sin(a) * 0.12, t1, Math.cos(a) * 0.12]], 0.025, { seg: 4 }); }
  for (const [y, r] of [[t0 + 0.5, 0.24], [t0 + 1.0, 0.18]]) k.cyl(G, r, 0.04, [0, y, 0], { seg: 8 });
  k.cyl(OR, 0.16, 0.3, [0, t1 + 0.1, 0], { seg: 10 });
  k.cyl(G, 0.04, 0.9, [0, t1 + 0.7, 0], { seg: 6, r2: 0.005 });

  // --- inside the capsule: floor, seats, the hand controller (steer) ---------------------------------------------------
  const floorY = def.seats[0].feet[1];
  k.cyl('#4a4d52', 1.0, 0.04, [0, floorY - 0.02, 0], { seg: 12 });
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box(K, [0.42, y - 0.08 - floorY, 0.4], [x, (y - 0.08 + floorY) / 2, z], { bevel: 0.03 });
    k.box('#55585e', [0.46, 0.08, 0.44], [x, y - 0.06, z + 0.02], { bevel: 0.03 });
    k.box('#55585e', [0.46, 0.64, 0.1], [x, y + 0.27, z - 0.25], { rot: [-0.14, 0, 0], bevel: 0.03 });
  }
  const drv = def.seats[0], wheelAt = drv.wheelAt;
  k.box(K, [0.66, 0.3, 0.08], [0, wheelAt[1] + 0.2, wheelAt[2] + 0.12], { rot: [-0.4, 0, 0], bevel: 0.02 });   // panel (inside the cone wall)
  k.tube(K, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.04], [wheelAt[0], floorY + 0.1, wheelAt[2] + 0.12]], 0.025, { seg: 5 });
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -1.1;
  const sk = createKit(THREE, opts);
  sk.box(K, [0.3, 0.03, 0.04], [0, 0, 0], { bevel: 0 });
  for (const sx of [1, -1]) sk.box('#55585e', [0.05, 0.04, 0.12], [sx * 0.15, 0, 0.05], { bevel: 0 });
  sk.finish(steer);
  steer.traverse(o => { o.userData.detail = true; });

  // --- exhaust plumes (booster: four, upper stage: one) ----------------------------------------------------------------
  const plume = (x, z, y, r, L) => {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const outer = new THREE.Mesh(new THREE.ConeGeometry(r, L, 12, 1, true), k.mat('flame')); outer.position.y = -L / 2; outer.rotation.x = Math.PI;
    const core = new THREE.Mesh(new THREE.ConeGeometry(r * 0.5, L * 0.55, 10, 1, true), k.mat('flameCore')); core.position.y = -L * 0.27; core.rotation.x = Math.PI;
    for (const m of [outer, core]) { m.castShadow = false; g.add(m); }
    g.visible = false; return g;
  };
  const lowFlames = bells.map(([x, z]) => plume(x, z, 0.18, 0.4, 3.2));
  for (const f of lowFlames) booster.add(f);
  const upFlame = plume(0, 0, bTop - 0.42, 0.3, 2.4); group.add(upFlame);

  k.finish(group);
  group.add(steer);
  let last = null, sep = 0, fall = 0;
  return {
    group, wheels, steer, booster,
    update(st) {
      const t = st.t ?? performance.now() / 1000;
      const dt = last == null ? 0 : Math.min(0.1, Math.max(0, t - last)); last = t;
      st.wheels?.forEach((w, i) => { const m = wheels[i]; if (m) m.group.position.y = m.base[1] + (w.comp ?? 0.07) - 0.05; });
      // staging: the booster drops away (falls and tumbles a little relative to the rising upper stage), then hides
      if (st.acts?.door_stage) { sep += dt; fall += dt * Math.min(30, 4 + sep * 9.8); } else { sep = 0; fall = 0; }
      booster.position.y = -fall; booster.rotation.x = sep * 0.15; booster.visible = sep < 4;
      const lever = st.lever || 0, on = lever > 0.02, flick = 0.9 + 0.1 * Math.sin(t * 47);
      for (const f of lowFlames) { f.visible = on && !st.acts?.door_stage; f.scale.set(0.6 + 0.4 * lever, (0.3 + 0.9 * lever) * flick, 0.6 + 0.4 * lever); }
      upFlame.visible = on && !!st.acts?.door_stage; upFlame.scale.set(1, (0.4 + 0.8 * lever) * flick, 1);
      steer.rotation.z = (st.steer || 0) * -1.2;
    },
  };
}
