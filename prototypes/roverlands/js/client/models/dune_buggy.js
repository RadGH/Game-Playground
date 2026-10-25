// Sandhopper Buggy (reference: assets/ref/dune_buggy.webp). An open sand buggy: ochre-yellow angular tub with brown
// lower panels, a brown tube roll cage whose posts and roof frame sit exactly on their colliders (the roof frame at
// 1.58, heads at 1.43), two buckets, a bare engine out the back (on the engine-block collider) with chrome pipes,
// lamp pods on the front posts, wheels far out on long arms. Long-travel suspension: every wheel has two arms and a
// tall coil-over (yellow coil + chrome body) re-aimed each frame, so the 0.75 m of travel is visible.
// Ground sits ~0.74 m under the body origin at rest; hubs at y ≈ -0.36 front / -0.28 rear.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const Y = '#d8aa3a', YD = '#a9822a', BR = '#4c3b2b', C = 'gunDark', K = 'black', T = 'trim';
  const ch = def.chassis;
  const bot = ch.p[1] - ch.hy, top = ch.p[1] + ch.hy;                  // -0.05 .. 0.35
  const roof = def.parts[0], roofY = roof.p[1];                        // 1.58
  const posts = def.parts.slice(1, 5).map(p => p.p);                   // (±0.68, z 0.6) and (±0.68, z -0.9)
  const eng = def.parts[5];
  const zF = posts[0][2], zB = posts[2][2], px = Math.abs(posts[0][0]);
  const floorY = bot - 0.01;

  // --- tub: floor pan, side pods (yellow over brown), nose, firewall ---------------------------------------------
  k.box(BR, [1.36, 0.06, 2.3], [0, floorY - 0.03, -0.1], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    k.box(BR, [0.11, 0.33, 1.9], [sx * 0.66, bot + 0.075, -0.1], { bevel: 0.03 });                  // lower pod
    k.wedge(Y, [0.13, 0.28, 0.2, 1.6], [sx * 0.665, bot + 0.22, -0.15]);                           // upper pod, lower in front
    k.box(YD, [0.15, 0.05, 1.5], [sx * 0.665, bot + 0.5, -0.2], { bevel: 0.015 });                   // pod rim
    k.box(Y, [0.18, 0.34, 0.4], [sx * 0.6, bot + 0.32, zF + 0.16], { rot: [0.5, 0, 0], bevel: 0.03 });   // kick up to the cowl
    k.box(T, [0.04, 0.05, 0.9], [sx * 0.72, bot + 0.36, -0.2], { bevel: 0 });                       // grab rail line
  }
  // nose: a sloped yellow hood with a brown under-panel and a tube bumper
  k.wedge(Y, [1.16, 0.44, 0.16, 0.92], [0, top - 0.25, zF + 0.46]);
  k.box(YD, [0.5, 0.03, 0.62], [0, top + 0.06, zF + 0.5], { rot: [0.3, 0, 0], bevel: 0.01 });
  k.box(BR, [0.9, 0.3, 0.12], [0, top - 0.2, 1.46], { bevel: 0.03 });
  k.box(K, [0.4, 0.14, 0.04], [0, top - 0.08, 1.53], { bevel: 0.01 });
  for (const sx of [1, -1]) k.tube(C, [[sx * 0.4, bot + 0.05, 1.42], [sx * 0.46, bot + 0.1, 1.62], [sx * 0.42, top + 0.12, 1.62], [sx * 0.3, top + 0.2, 1.5]], 0.035, { seg: 6 });
  k.tube(C, [[0.46, bot + 0.1, 1.62], [-0.46, bot + 0.1, 1.62]], 0.035, { seg: 6 });
  k.tube(C, [[0.42, top + 0.12, 1.62], [-0.42, top + 0.12, 1.62]], 0.03, { seg: 6 });
  // dash + firewall
  k.box(BR, [1.2, 0.2, 0.26], [0, 0.48, zF - 0.05], { bevel: 0.03 });
  k.box(K, [1.1, 0.04, 0.2], [0, 0.6, zF - 0.06], { rot: [0.3, 0, 0], bevel: 0.01 });
  k.box(BR, [1.2, 0.6, 0.06], [0, bot + 0.3, -0.62], { bevel: 0.01 });

  // --- seats + steering wheel -----------------------------------------------------------------------------------
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box('seat', [0.46, y - 0.05 - floorY, 0.46], [x, (y - 0.05 + floorY) / 2, z + 0.04], { bevel: 0.04 });
    k.box('seat', [0.46, 0.7, 0.12], [x, y + 0.28, z - 0.24], { rot: [-0.18, 0, 0], bevel: 0.04 });
    for (const sx of [1, -1]) k.box('seat', [0.06, 0.4, 0.14], [x + sx * 0.22, y + 0.2, z - 0.18], { rot: [-0.18, 0, 0], bevel: 0.02 });   // bucket wings
    k.box(T, [0.05, 0.6, 0.02], [x + 0.09, y + 0.3, z - 0.17], { rot: [-0.18, 0, 0], bevel: 0 });          // harness straps
    k.box(T, [0.05, 0.6, 0.02], [x - 0.09, y + 0.3, z - 0.17], { rot: [-0.18, 0, 0], bevel: 0 });
  }
  const drv = def.seats.find(s => s.role === 'driver');
  const wheelAt = drv.wheelAt;
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.85;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.025, 0.02], [0, 0, 0], { bevel: 0 });
  sk.box(T, [0.02, 0.025, 0.14], [0, 0, -0.07], { bevel: 0 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 12), k.mat(T)));
  steer.traverse(o => { o.userData.detail = true; });
  k.tube(T, [[wheelAt[0], wheelAt[1] - 0.03, wheelAt[2] + 0.05], [wheelAt[0], 0.5, zF - 0.02]], 0.025, { seg: 6 });

  // --- roll cage: posts on their colliders, roof frame at the roof collider, braces to the nose and the tail ----
  const R = 0.042;
  for (const sx of [1, -1]) {
    const x = sx * px;
    k.tube(C, [[x, top, zF + 0.05], [x, roofY, zF]], R, { seg: 6 });                       // front post
    k.tube(C, [[x, top, zB], [x, roofY, zB]], R, { seg: 6 });                               // rear post
    k.tube(C, [[x, roofY, zF + 0.05], [x, roofY, zB - 0.05]], R, { seg: 6 });               // roof side
    k.tube(C, [[x, roofY, zF], [sx * 0.42, top + 0.2, 1.5]], R * 0.85, { seg: 6 });         // down to the nose
    k.tube(C, [[x, roofY, zB], [sx * 0.42, eng.p[1] + 0.3, -1.65]], R * 0.85, { seg: 6 });  // down to the tail
    k.tube(C, [[x, 0.8, zF], [x, 0.8, zB]], R * 0.7, { seg: 6 });                          // shoulder bar
    k.tube(C, [[sx * 0.62, bot + 0.05, -1.65], [sx * 0.42, eng.p[1] + 0.3, -1.65]], R * 0.8, { seg: 6 });   // rear frame upright
    k.tube(C, [[sx * 0.62, bot + 0.05, zB], [sx * 0.62, bot + 0.05, -1.65]], R * 0.8, { seg: 6 });          // rear frame rail
    // lamp pod on the front post
    k.box(K, [0.16, 0.16, 0.1], [sx * (px + 0.06), 0.78, zF + 0.1], { bevel: 0.02 });
    k.box('lamp', [0.12, 0.12, 0.02], [sx * (px + 0.06), 0.78, zF + 0.16], { bevel: 0 });
  }
  for (const z of [zF, zB, (zF + zB) / 2]) k.tube(C, [[px, roofY, z], [-px, roofY, z]], R, { seg: 6 });
  k.tube(C, [[px, roofY, zB], [-px, roofY, (zF + zB) / 2]], R * 0.7, { seg: 6 });          // roof diagonal
  k.tube(C, [[0.42, eng.p[1] + 0.3, -1.65], [-0.42, eng.p[1] + 0.3, -1.65]], R * 0.85, { seg: 6 });

  // --- engine on the block collider, chrome pipes, air box ----------------------------------------------------------
  const [ex, ey, ez] = eng.box, [, eyc, ezc] = eng.p;
  k.box('darkMetal', [ex * 1.6, ey * 1.4, ez * 1.6], [0, eyc - 0.04, ezc], { bevel: 0.05 });
  k.box('engine', [ex * 1.2, 0.14, ez * 1.4], [0, eyc + ey * 0.7, ezc], { bevel: 0.03 });
  k.box(K, [0.4, 0.16, 0.34], [0, eyc + ey + 0.04, ezc + 0.1], { bevel: 0.04 });             // air box
  for (const sx of [1, -1]) {
    k.tube('chrome', [[sx * 0.2, eyc + 0.1, ezc + 0.2], [sx * 0.36, eyc + 0.12, ezc + 0.1], [sx * 0.38, eyc + 0.05, ezc - 0.3], [sx * 0.3, eyc + 0.2, ezc - 0.5], [sx * 0.3, eyc + 0.3, ezc - 0.62]], 0.04, { seg: 6 });
    k.cyl('steel', 0.055, 0.1, [sx * 0.3, eyc + 0.32, ezc - 0.66], { axis: 'z', seg: 8 });
  }
  k.box('tail', [0.08, 0.06, 0.03], [0.3, bot + 0.2, -1.66], { bevel: 0 });
  k.box('tail', [0.08, 0.06, 0.03], [-0.3, bot + 0.2, -1.66], { bevel: 0 });

  // --- wheels, arms and long-travel coil-overs -------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const front = w.p[2] > 0, sx = Math.sign(w.p[0]);
    const t = k.tyre({ r: w.r, w: w.w, style: 'block', knobs: front ? 16 : 13, rimCol: '#6a5432', rim: 0.52 });
    t.group.position.set(...w.p);
    group.add(t.group);
    const hubX = w.p[0] - sx * (w.w / 2 + 0.04);
    // arm roots on the frame; a front wheel gets an upper and lower wishbone, a rear one a trailing arm + link
    const roots = front
      ? [[sx * 0.38, bot + 0.02, w.p[2]], [sx * 0.42, top - 0.02, w.p[2] - 0.05]]
      : [[sx * 0.6, bot + 0.04, -0.45], [sx * 0.6, top, -0.62]];
    const arms = roots.map((a, i) => { const s = k.shock(a, [hubX, w.p[1] + i * 0.14, w.p[2]], { r: i ? 0.026 : 0.034, col: C }); group.add(s); return s; });
    const mount = front ? [sx * 0.5, 0.56, zF + 0.5] : [sx * 0.62, 0.95, zB - 0.12];
    const coil = k.shock(mount, mount, { r: 0.065, col: 'yellow' });
    const body = k.shock(mount, mount, { r: 0.034, col: 'chrome' });
    group.add(coil, body);
    return { ...t, base: w.p, hubX, roots, arms, mount, coil, body };
  });

  k.finish(group);
  group.add(steer);
  const aimStruts = (m, y) => {
    m.arms.forEach((a, i) => a.set(m.roots[i], [m.hubX, y + i * 0.14, m.base[2]]));
    const low = [m.hubX + Math.sign(m.base[0]) * 0.02, y + 0.07, m.base[2] + (m.base[2] > 0 ? -0.02 : 0.08)];
    const at = f => [m.mount[0] + (low[0] - m.mount[0]) * f, m.mount[1] + (low[1] - m.mount[1]) * f, m.mount[2] + (low[2] - m.mount[2]) * f];
    m.body.set(m.mount, low);
    m.coil.set(at(0.08), at(0.72));
  };
  wheels.forEach(m => aimStruts(m, m.base[1] + 0.06));
  return {
    group, wheels, steer,
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
