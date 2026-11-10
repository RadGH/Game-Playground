// Crater Crawler (reference: assets/ref/moon_rover.webp — that sheet has four wheels; the brief asks for SIX, so the
// middle pair is added under the seats). An open moon buggy: a black ladder frame and dark deck, faceted gold-foil
// fenders over the front and back pairs (smaller ones over the middle), two white bucket seats with a console and a
// T-bar wheel between them, a hand-pointed dish antenna on a mast at the front, a camera head on a pole at the back
// right, and a cargo rack with two sample crates on the rack collider behind the seats. Wire-mesh wheels: a hub,
// two dished side rings, hoops and bars (no rubber) on long swing arms with slim struts, so the soft 0.55 m travel
// reads. Deck top 0.26; ground ~0.7 m under the origin at rest.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const group = new THREE.Group();
  const GO = '#d6ad38', GD = '#a8842a', GL = '#e8cf72', W = '#e7eaec', WG = '#b9bec4', K = '#26282c', T = 'trim';
  const ch = def.chassis, deckY = ch.p[1] + ch.hy, botY = ch.p[1] - ch.hy;   // 0.26, -0.02
  const rack = def.parts[0];

  // --- frame + deck -------------------------------------------------------------------------------------------------
  k.box(K, [ch.hx * 2, 0.06, ch.hz * 2], [0, deckY - 0.03, 0], { bevel: 0.02 });
  for (const sx of [1, -1]) {
    k.box(K, [0.08, 0.16, ch.hz * 2 + 0.1], [sx * (ch.hx - 0.02), botY + 0.08, 0], { bevel: 0.02 });   // side rails
    for (let i = 0; i < 6; i++) {                                                                       // truss webbing
      const z0 = -ch.hz + i * (ch.hz * 2 / 6), z1 = z0 + ch.hz * 2 / 6;
      k.tube(K, [[sx * (ch.hx - 0.02), botY + 0.02, z0], [sx * (ch.hx - 0.02), deckY - 0.06, z1]], 0.02, { seg: 4 });
    }
  }
  for (const z of [-ch.hz + 0.05, -0.65, 0.65, ch.hz - 0.05]) k.box(K, [ch.hx * 2, 0.1, 0.06], [0, botY + 0.06, z], { bevel: 0.01 });
  k.box('#3a3d42', [1.3, 0.012, 1.25], [0, deckY + 0.004, 0.25], { bevel: 0 });                        // floor mat

  // --- fenders: faceted gold foil over each wheel (big front + back, small middle) -------------------------------------
  for (const w of def.wheels) {
    const [x, , z] = w.p, sx = Math.sign(x), mid = Math.abs(z) < 0.2;
    const L = mid ? 0.62 : 1.0, H = mid ? 0.08 : 0.1, y0 = deckY + (mid ? 0.08 : 0.14);
    k.box(GO, [0.42, H, L * 0.55], [x - sx * 0.02, y0 + 0.06, z], { bevel: 0.03 });
    k.box(GL, [0.4, H * 0.8, L * 0.32], [x - sx * 0.03, y0 - 0.02, z + L * 0.38], { rot: [-0.6, 0, sx * 0.08], bevel: 0.03 });
    k.box(GD, [0.4, H * 0.8, L * 0.32], [x - sx * 0.03, y0 - 0.02, z - L * 0.38], { rot: [0.6, 0, -sx * 0.08], bevel: 0.03 });
    if (!mid) {
      k.box(GD, [0.08, 0.32, L * 0.6], [x - sx * 0.22, y0 - 0.1, z], { rot: [0, 0, sx * 0.3], bevel: 0.02 });   // inner skirt
      k.box(GO, [0.3, 0.06, 0.3], [x - sx * 0.3, y0 + 0.02, z + 0.12], { rot: [0.2, 0.3, 0.2], bevel: 0.02 });   // foil crinkle
    }
  }
  // front + back fairings (foil) between the fenders
  k.box(GO, [1.2, 0.26, 0.22], [0, deckY + 0.12, ch.hz - 0.06], { bevel: 0.04 });
  k.box(GD, [1.0, 0.2, 0.2], [0, deckY + 0.08, -ch.hz + 0.08], { bevel: 0.04 });
  k.box(GL, [0.6, 0.06, 0.4], [0, deckY + 0.27, ch.hz - 0.25], { rot: [-0.2, 0, 0], bevel: 0.02 });

  // --- seats, console, wheel ------------------------------------------------------------------------------------------
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box(K, [0.36, y - 0.1 - deckY, 0.36], [x, (y - 0.1 + deckY) / 2, z + 0.02], { bevel: 0.02 });     // seat pedestal
    k.box(W, [0.5, 0.1, 0.48], [x, y - 0.06, z + 0.04], { bevel: 0.04 });
    k.box(W, [0.5, 0.66, 0.12], [x, y + 0.28, z - 0.25], { rot: [-0.14, 0, 0], bevel: 0.05 });
    k.box(WG, [0.42, 0.18, 0.13], [x, y + 0.66, z - 0.3], { rot: [-0.14, 0, 0], bevel: 0.04 });       // head rest
    for (const sx of [1, -1]) k.box(WG, [0.06, 0.08, 0.36], [x + sx * 0.26, y + 0.1, z], { bevel: 0.02 });   // arm rests
  }
  k.box(WG, [0.22, 0.5, 0.4], [0, deckY + 0.25, 0.25], { bevel: 0.04 });                                 // centre console
  k.box(K, [0.18, 0.02, 0.3], [0, deckY + 0.51, 0.25], { bevel: 0 });
  const drv = def.seats[0], wheelAt = drv.wheelAt;
  k.tube(K, [[wheelAt[0], wheelAt[1] - 0.04, wheelAt[2] + 0.04], [wheelAt[0], deckY + 0.25, wheelAt[2] + 0.3], [wheelAt[0], deckY, wheelAt[2] + 0.35]], 0.03, { seg: 6 });
  const steer = new THREE.Group(); steer.position.set(...wheelAt); steer.rotation.x = -0.75;
  const sk = createKit(THREE, opts);
  sk.box(T, [0.28, 0.025, 0.025], [0, 0, 0], { bevel: 0 });
  sk.cyl(T, 0.04, 0.05, [0, 0, 0], { seg: 8 });
  sk.finish(steer);
  steer.add(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.022, 5, 14), k.mat(K)));
  steer.traverse(o => { o.userData.detail = true; });

  // --- cargo rack + sample crates (on the rack collider) ----------------------------------------------------------------
  const [rx, ry, rz] = rack.box, [, rpy, rpz] = rack.p;
  k.box(K, [rx * 2 + 0.3, 0.05, rz * 2 + 0.2], [0, rpy - ry, rpz], { bevel: 0.01 });
  for (const sx of [1, -1]) for (const sz of [1, -1]) k.tube(K, [[sx * (rx + 0.12), deckY, rpz + sz * (rz + 0.07)], [sx * (rx + 0.12), rpy + ry + 0.15, rpz + sz * (rz + 0.07)]], 0.025, { seg: 5 });
  for (const sx of [1, -1]) k.tube(K, [[sx * (rx + 0.12), rpy + ry + 0.15, rpz + rz + 0.07], [sx * (rx + 0.12), rpy + ry + 0.15, rpz - rz - 0.07]], 0.025, { seg: 5 });
  k.tube(K, [[rx + 0.12, rpy + ry + 0.15, rpz - rz - 0.07], [-rx - 0.12, rpy + ry + 0.15, rpz - rz - 0.07]], 0.025, { seg: 5 });
  k.box(W, [0.5, 0.36, 0.38], [0.3, rpy - ry + 0.2, rpz], { bevel: 0.03 });
  k.box(WG, [0.46, 0.3, 0.36], [-0.3, rpy - ry + 0.17, rpz], { bevel: 0.03 });
  k.box(K, [0.5, 0.03, 0.06], [0.3, rpy - ry + 0.3, rpz], { bevel: 0 });

  // --- dish antenna (front) + camera pole (back right) ----------------------------------------------------------------
  const dish = [-0.5, deckY, ch.hz - 0.2];
  k.cyl(K, 0.04, 0.85, [dish[0], dish[1] + 0.42, dish[2]], { seg: 6 });
  const dishG = new THREE.Group(); dishG.position.set(dish[0], dish[1] + 0.9, dish[2]); dishG.rotation.set(-0.55, 0.35, 0);
  const dk = createKit(THREE, opts);
  const bowl = new THREE.SphereGeometry(0.55, 12, 4, 0, Math.PI * 2, 0, 0.8); bowl.scale(1, 0.55, 1); bowl.rotateX(-Math.PI / 2);
  dishG.add(Object.assign(new THREE.Mesh(bowl, (opts.enhance || (m => m))(new THREE.MeshStandardMaterial({ color: GO, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }))), { castShadow: true }));
  dk.tube(K, [[0.0, 0, 0.05], [0, 0, 0.4]], 0.015, { seg: 4 });
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; dk.tube(K, [[Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.14], [0, 0, 0.4]], 0.01, { seg: 3 }); }
  dk.box(WG, [0.08, 0.08, 0.1], [0, 0, 0.42], { bevel: 0.01 });
  dk.cyl(K, 0.06, 0.12, [0, 0, -0.08], { axis: 'z', seg: 8 });
  dk.finish(dishG);
  dishG.traverse(o => { o.userData.detail = true; });
  const cam = [-(ch.hx - 0.12), deckY, -ch.hz + 0.25];
  k.cyl(K, 0.035, 1.25, [cam[0], cam[1] + 0.62, cam[2]], { seg: 6 });
  k.box(W, [0.22, 0.16, 0.18], [cam[0], cam[1] + 1.32, cam[2]], { bevel: 0.03 });
  k.cyl(K, 0.05, 0.06, [cam[0], cam[1] + 1.32, cam[2] + 0.1], { axis: 'z', seg: 8 });
  k.box('glass', [0.06, 0.06, 0.01], [cam[0], cam[1] + 1.32, cam[2] + 0.135], { bevel: 0 });
  // lamps on the front fairing, tail markers
  for (const sx of [1, -1]) { k.box('lamp', [0.14, 0.08, 0.02], [sx * 0.42, deckY + 0.14, ch.hz + 0.06], { bevel: 0 }); k.box('amber', [0.08, 0.06, 0.02], [sx * 0.42, deckY + 0.1, -ch.hz - 0.03], { bevel: 0 }); }

  // --- wire-mesh wheels on swing arms ----------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const sx = Math.sign(w.p[0]);
    const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin); g.position.set(...w.p); group.add(g);
    // one merged mesh per wheel (wire grey) + the hub (kit, merged): rings, hoops, cross bars, spokes
    const r = w.r, hw = w.w / 2, geos = [];
    const torus = (rad, tube, x, seg = 18) => { const g = new THREE.TorusGeometry(rad, tube, 4, seg); g.rotateY(Math.PI / 2); g.translate(x, 0, 0); geos.push(g); };
    torus(r * 0.96, 0.024, -hw, 14); torus(r * 0.96, 0.024, hw, 14); torus(r, 0.014, 0, 14);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = new THREE.BoxGeometry(w.w, 0.024, 0.024); b.translate(0, Math.cos(a) * r * 0.99, Math.sin(a) * r * 0.99); geos.push(b); }
    for (let i = 0; i < 6; i++) for (const x of [-hw, hw]) {
      const a = i / 6 * Math.PI * 2, L = r * 0.9, c = new THREE.CylinderGeometry(0.011, 0.011, L, 3);
      c.translate(0, L / 2 + r * 0.06, 0); c.rotateX(a); c.translate(x * 0.97, 0, 0); geos.push(c);
    }
    spin.add(new THREE.Mesh(mergeAll(THREE, geos), k.mat('#8b9198')));
    const wk = createKit(THREE, opts);
    wk.cyl(WG, r * 0.3, w.w * 0.95, [0, 0, 0], { axis: 'x', seg: 12 });
    wk.cyl(K, r * 0.13, w.w * 1.1, [0, 0, 0], { axis: 'x', seg: 8 });
    wk.finish(spin);
    spin.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const hubX = w.p[0] - sx * (hw + 0.05);
    const roots = [[sx * (ch.hx - 0.02), botY + 0.06, w.p[2] + 0.18], [sx * (ch.hx - 0.02), botY + 0.06, w.p[2] - 0.18]];
    const arms = roots.map(a => { const s = k.shock(a, [hubX, w.p[1], w.p[2]], { r: 0.028, col: K }); group.add(s); return s; });
    const mount = [sx * (ch.hx - 0.05), deckY + 0.2, w.p[2] + (w.p[2] >= 0 ? -0.22 : 0.22)];
    const strut = k.shock(mount, mount, { r: 0.03, col: 'chrome' });
    group.add(strut);
    return { group: g, spin, base: w.p, hubX, roots, arms, mount, strut };
  });

  k.finish(group);
  group.add(steer, dishG);
  const aim = (m, y) => { m.arms.forEach((a, i) => a.set(m.roots[i], [m.hubX, y, m.base[2]])); m.strut.set(m.mount, [m.hubX + Math.sign(m.base[0]) * 0.02, y + 0.06, m.base[2]]); };
  wheels.forEach(m => aim(m, m.base[1] + 0.06));
  return {
    group, wheels, steer,
    update(st) {
      st.wheels.forEach((w, i) => {
        const m = wheels[i]; if (!m) return;
        const y = m.base[1] + (w.comp ?? 0.1) - 0.05;
        m.group.position.y = y;
        m.group.rotation.y = w.steer || 0;
        m.spin.rotation.x = w.spin || 0;
        aim(m, y);
      });
      steer.rotation.z = (st.steer || 0) * -2.2;
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
