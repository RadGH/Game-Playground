// Scrapper Buggy (reference: assets/ref/raider_buggy.webp). A raider's cage buggy built from scrap: a grey tube frame
// with rusty orange patch panels riveted over the nose, sides and tail, a toothed grille with a spiked ram bar, two
// square lamps, two buckets under a pipe roll cage (posts and roof frame on their colliders; roof frame at 1.36 =
// seated hips 0.3 + ~1.0), and behind them a raised gunner deck over the engine with a hoop rail and a twin-barrel gun
// on a post (the `turret`, same shape contract as the jeep's: yaw -> pitch -> muzzle, spade grips at [+-0.2, -0.05,
// -0.25] on the pitch node). Fat block tyres on long arms with red coil-overs; side exhaust with a perforated
// heat shield. No markings. Ground sits ~0.7 m under the body origin at rest.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const RU = '#9a5230', RD = '#6f3a20', RL = '#b8693a', F = '#55585c', FD = '#3c3e41', K = 'black', T = 'trim';
  const ch = def.chassis;
  const bot = ch.p[1] - ch.hy, top = ch.p[1] + ch.hy;                  // -0.08 .. 0.36
  const roofY = def.parts[0].p[1];                                     // 1.36
  const posts = def.parts.slice(1, 5).map(p => p.p);
  const zF = posts[0][2], zB = posts[2][2], px = Math.abs(posts[0][0]);  // 0.75, -0.7, 0.74
  const deck = def.parts[5], deckTop = deck.p[1] + deck.box[1];        // 0.67
  const eng = def.parts[6];
  const floorY = def.seats[0].feet[1] - 0.02;                          // 0.04: the floor pan the feet rest on
  const R = 0.045;

  // --- frame: floor pan, side rails, nose frame, tail frame (grey tube) ---------------------------------------------
  k.box(FD, [1.4, 0.05, 2.0], [0, floorY - 0.025, 0.05], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    k.tube(F, [[sx * 0.72, bot + 0.06, 1.45], [sx * 0.74, bot + 0.06, -1.75]], R);                       // lower rail
    k.tube(F, [[sx * 0.74, top + 0.08, 1.2], [sx * 0.76, top + 0.12, -1.75]], R * 0.85);                 // upper rail
    k.tube(F, [[sx * 0.72, bot + 0.06, 1.45], [sx * 0.6, top + 0.15, 1.8], [sx * 0.55, top + 0.2, 1.62]], R);   // nose hoop
    for (const z of [1.2, 0.35, -0.5, -1.2]) k.tube(F, [[sx * 0.74, bot + 0.06, z], [sx * 0.75, top + 0.1, z - 0.12]], R * 0.7);   // side braces
  }
  k.tube(F, [[0.6, top + 0.15, 1.8], [-0.6, top + 0.15, 1.8]], R);

  // --- patch panels: nose (two plates), side skins, tail plates, rivets -------------------------------------------------
  k.wedge(RU, [1.3, 0.34, 0.12, 1.0], [0, top - 0.12, 1.25]);                                            // sloped hood
  k.box(RL, [0.56, 0.035, 0.5], [0.3, top + 0.15, 1.2], { rot: [0.22, 0.05, 0], bevel: 0.01 });          // patch plates
  k.box(RD, [0.5, 0.035, 0.46], [-0.3, top + 0.13, 1.3], { rot: [0.24, -0.06, 0], bevel: 0.01 });
  k.box(RU, [0.44, 0.035, 0.36], [0.05, top + 0.17, 0.9], { rot: [0.1, 0.12, 0], bevel: 0.01 });
  for (const sx of [1, -1]) {
    k.box(sx > 0 ? RU : RD, [0.05, 0.36, 1.05], [sx * 0.78, bot + 0.2, 0.75], { rot: [0, 0, sx * 0.04], bevel: 0.02 });
    k.box(sx > 0 ? RD : RL, [0.05, 0.4, 0.9], [sx * 0.78, bot + 0.24, -0.2], { rot: [0.05, 0, -sx * 0.03], bevel: 0.02 });
    k.box(RL, [0.05, 0.42, 0.7], [sx * 0.79, bot + 0.3, -1.05], { rot: [-0.06, 0, sx * 0.02], bevel: 0.02 });
    k.box(RU, [0.06, 0.32, 0.5], [sx * 0.8, top + 0.08, -1.5], { bevel: 0.02 });
    for (const z of [1.15, 0.4, -0.55, -1.25]) for (const y of [bot + 0.08, bot + 0.36]) k.box(T, [0.02, 0.025, 0.025], [sx * 0.81, y, z], { bevel: 0 });
  }
  k.box(RD, [1.5, 0.36, 0.06], [0, top - 0.02, -1.8], { bevel: 0.02 });                                 // tail plate
  k.box('tail', [0.12, 0.08, 0.03], [0.5, top + 0.05, -1.84], { bevel: 0 });
  k.box('tail', [0.12, 0.08, 0.03], [-0.5, top + 0.05, -1.84], { bevel: 0 });

  // --- grille, lamps, spiked ram bar -----------------------------------------------------------------------------------
  k.box(K, [1.0, 0.36, 0.08], [0, top - 0.12, 1.78], { bevel: 0.02 });
  for (let i = -4; i <= 4; i++) k.box(FD, [0.05, 0.3, 0.05], [i * 0.1, top - 0.12, 1.83], { bevel: 0 });   // teeth
  for (const sx of [1, -1]) {
    k.box(K, [0.2, 0.16, 0.1], [sx * 0.42, top + 0.08, 1.78], { bevel: 0.02 });
    k.box('lamp', [0.15, 0.11, 0.02], [sx * 0.42, top + 0.08, 1.84], { bevel: 0 });
  }
  k.tube(F, [[0.62, bot + 0.12, 1.95], [0.62, bot + 0.12, 2.05], [-0.62, bot + 0.12, 2.05], [-0.62, bot + 0.12, 1.95]], 0.055);
  k.box(FD, [1.1, 0.12, 0.1], [0, bot + 0.12, 2.06], { bevel: 0.02 });
  for (const x of [-0.45, -0.15, 0.15, 0.45]) k.cyl('steel', 0.055, 0.32, [x, bot + 0.12, 2.26], { axis: 'z', r2: 0.004, seg: 6 });
  for (const sx of [1, -1]) k.cyl('steel', 0.04, 0.22, [sx * 0.6, top + 0.15, 1.95], { axis: 'z', r2: 0.004, seg: 6 });

  // --- dash, seats, steering wheel ---------------------------------------------------------------------------------------
  k.box(FD, [1.3, 0.22, 0.24], [0, top + 0.16, zF - 0.02], { bevel: 0.03 });
  k.box(K, [1.2, 0.04, 0.18], [0, top + 0.28, zF - 0.04], { rot: [0.3, 0, 0], bevel: 0.01 });
  k.box(FD, [1.3, 0.55, 0.06], [0, floorY + 0.28, -0.42], { bevel: 0.01 });                             // firewall behind the seats
  for (const s of def.seats.filter(s => !s.stand)) {
    const [x, y, z] = s.p;
    k.box('seat', [0.46, y - 0.05 - floorY, 0.46], [x, (y - 0.05 + floorY) / 2, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.46, 0.68, 0.12], [x, y + 0.28, z - 0.26], { rot: [-0.16, 0, 0], bevel: 0.04 });
    for (const sx of [1, -1]) k.box('seat', [0.06, 0.38, 0.14], [x + sx * 0.22, y + 0.2, z - 0.2], { rot: [-0.16, 0, 0], bevel: 0.02 });
    k.box(RD, [0.05, 0.6, 0.02], [x + 0.09, y + 0.3, z - 0.19], { rot: [-0.16, 0, 0], bevel: 0 });     // harness straps
    k.box(RD, [0.05, 0.6, 0.02], [x - 0.09, y + 0.3, z - 0.19], { rot: [-0.16, 0, 0], bevel: 0 });
  }
  const drv = def.seats[0], wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.85;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.box(T, [0.02, 0.025, 0.14], [0, 0, -0.07], { bevel: 0 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 12), k.mat(K)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.05], [wheelAt[0], top + 0.2, zF - 0.02]], 0.025, { seg: 6 });

  // --- roll cage: posts on their colliders, roof frame, braces to the nose and down to the deck -----------------------
  for (const sx of [1, -1]) {
    const x = sx * px;
    k.tube(F, [[x, top + 0.1, zF + 0.05], [x, roofY, zF]], R);
    k.tube(F, [[x, top + 0.12, zB], [x, roofY, zB]], R);
    k.tube(F, [[x, roofY, zF + 0.05], [x, roofY, zB - 0.05]], R);
    k.tube(F, [[x, roofY, zF], [sx * 0.55, top + 0.2, 1.62]], R * 0.85);
    k.tube(F, [[x, roofY, zB], [sx * 0.62, deckTop + 0.02, -1.0]], R * 0.85);
    k.tube(F, [[x, 0.86, zF], [x, 0.86, zB]], R * 0.7);
  }
  for (const z of [zF, zB, (zF + zB) / 2]) k.tube(F, [[px, roofY, z], [-px, roofY, z]], R);
  k.tube(F, [[px, roofY, zB], [-px, roofY, (zF + zB) / 2]], R * 0.7);

  // --- gunner deck over the engine: plate, hoop rail open at the front, the gun post ------------------------------------
  const gs = def.seats.find(s => s.gun), piv = gs.gun.pivot;
  k.box(FD, [deck.box[0] * 2 + 0.04, 0.08, deck.box[2] * 2 + 0.04], [deck.p[0], deck.p[1] + 0.01, deck.p[2]], { bevel: 0.02 });
  k.cyl(T, 0.5, 0.025, [0, deckTop - 0.012, gs.p[2]], { seg: 18 });                                      // tread plate disc
  const railY = deckTop + 0.85, rc = gs.p[2];
  const hoop = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.32 + (i / 10) * Math.PI * 1.36; hoop.push([Math.sin(a) * 0.6, railY, rc + Math.cos(a) * 0.48]); }
  k.tube(F, hoop, 0.032);
  for (const i of [0, 3, 7, 10]) k.tube(F, [[hoop[i][0], deckTop, hoop[i][2]], hoop[i]], 0.03);
  k.cyl(FD, 0.09, piv[1] - deckTop - 0.12, [0, (piv[1] + deckTop) / 2 - 0.06, piv[2]], { seg: 8 });   // gun post
  k.cyl(T, 0.16, 0.06, [0, deckTop + 0.03, piv[2]], { seg: 10 });

  // --- engine (under the deck, on its collider), exhaust + heat shield -------------------------------------------------
  const [, eyc, ezc] = eng.p;
  k.box('darkMetal', [0.78, 0.38, 0.72], [0, eyc, ezc], { bevel: 0.05 });
  k.box('engine', [0.6, 0.1, 0.6], [0, eyc + 0.22, ezc], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    k.tube('steel', [[sx * 0.3, eyc, ezc + 0.2], [sx * 0.62, eyc - 0.02, ezc + 0.1], [sx * 0.86, eyc + 0.05, -1.3], [sx * 0.86, eyc + 0.1, -1.7], [sx * 0.86, eyc + 0.5, -1.85]], 0.045, { seg: 6 });
    k.cyl('#6c6f72', 0.11, 0.55, [sx * 0.86, eyc + 0.06, -1.25], { axis: 'z', seg: 8 });   // muffler + heat shield
    for (let i = 0; i < 4; i++) k.box(K, [0.02, 0.04, 0.04], [sx * (0.86 + 0.11), eyc + 0.06, -1.45 + i * 0.13], { bevel: 0 });
  }

  // --- wheels, arms, red coil-overs -----------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const front = w.p[2] > 0, sx = Math.sign(w.p[0]);
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: front ? 14 : 13, rimCol: '#46494d', rim: 0.48 });
    t.group.position.set(...w.p);
    group.add(t.group);
    const hubX = w.p[0] - sx * (w.w / 2 + 0.04);
    const roots = front ? [[sx * 0.42, bot + 0.04, w.p[2]], [sx * 0.46, top - 0.02, w.p[2] - 0.05]] : [[sx * 0.66, bot + 0.06, -0.5], [sx * 0.66, top, -0.66]];
    const arms = roots.map((a, i) => { const s = k.shock(a, [hubX, w.p[1] + i * 0.14, w.p[2]], { r: i ? 0.028 : 0.036, col: FD }); group.add(s); return s; });
    const mount = front ? [sx * 0.55, 0.62, zF + 0.55] : [sx * 0.7, 0.95, zB - 0.25];
    const coil = k.shock(mount, mount, { r: 0.068, col: 'red' });
    const body = k.shock(mount, mount, { r: 0.034, col: 'chrome' });
    group.add(coil, body);
    return { ...t, base: w.p, hubX, roots, arms, mount, coil, body };
  });

  // --- the gun: yaw -> pitch -> muzzle (two barrels, ammo box, shield plate) ---------------------------------------------
  const turretYaw = new THREE.Group(); turretYaw.position.set(...piv);
  const turretPitch = new THREE.Group(); turretYaw.add(turretPitch);
  const tk = createKit(THREE, opts);
  tk.box(FD, [0.32, 0.3, 0.6], [0, 0, 0.05], { bevel: 0.03 });
  tk.box(RU, [0.36, 0.2, 0.36], [0.27, -0.02, 0.0], { bevel: 0.02 });                       // ammo box (rusty)
  tk.box(RD, [0.5, 0.32, 0.05], [0, 0.04, 0.36], { bevel: 0.01 });                          // shield plate
  for (const by of [0.07, -0.06]) {
    tk.cyl('darkMetal', 0.04, 0.95, [0, by, 0.82], { axis: 'z', seg: 8 });
    tk.cyl(K, 0.055, 0.12, [0, by, 1.28], { axis: 'z', seg: 8 });                           // muzzle brakes
  }
  for (const hx of [0.2, -0.2]) tk.box('darkMetal', [0.04, 0.14, 0.04], [hx, -0.05, -0.25], { bevel: 0 });
  tk.box('darkMetal', [0.44, 0.04, 0.04], [0, -0.0, -0.22], { bevel: 0 });
  tk.finish(turretPitch);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.0, 1.36); turretPitch.add(muzzle);
  turretYaw.traverse(o => { if (o.isMesh) o.castShadow = true; });

  k.finish(group);
  group.add(steer, turretYaw);
  const aimStruts = (m, y) => {
    m.arms.forEach((a, i) => a.set(m.roots[i], [m.hubX, y + i * 0.14, m.base[2]]));
    const low = [m.hubX + Math.sign(m.base[0]) * 0.02, y + 0.07, m.base[2] + (m.base[2] > 0 ? -0.02 : 0.08)];
    const at = f => [m.mount[0] + (low[0] - m.mount[0]) * f, m.mount[1] + (low[1] - m.mount[1]) * f, m.mount[2] + (low[2] - m.mount[2]) * f];
    m.body.set(m.mount, low);
    m.coil.set(at(0.08), at(0.7));
  };
  wheels.forEach(m => aimStruts(m, m.base[1] + 0.06));
  return {
    group, wheels, steer,
    turret: { yaw: turretYaw, pitch: turretPitch, muzzle },
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.position.y = y;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        aimStruts(m, y);
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
    },
  };
}
