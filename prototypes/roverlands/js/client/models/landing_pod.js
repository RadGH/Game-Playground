// Homeward Pod (reference: assets/ref/landing_pod.webp). A reentry capsule: a white faceted cone on a thick brown heat
// shield (its collider) with a glowing orange rim, a dark collar and the parachute bay on top (the nose collider),
// four thruster pods around the collar, three small windows and a hatch outline at the front. Two seats inside on a
// floor at 0.52 (seat.feet). The parachute (`chute`): orange-and-white gores on lines from the bay, hidden in the bay
// until st.acts.door_chute, then it streams out and opens over ~2.5 s (the physics' opening time); cut away, it
// shrinks back. Reentry glow: the model measures its own speed frame to frame (the same on every machine, local or
// remote) and, past ~70 m/s, lights the shield rim and a plasma cone under it. Original look, no markings.
import { createKit } from './kit.js';

export function build(THREE, def, opts = {}) {
  const k = createKit(THREE, opts);
  const enhance = opts.enhance || (m => m);
  const group = new THREE.Group();
  const W = '#e9ebee', WG = '#c3c8ce', BR = '#5a3a26', BD = '#3d2819', K = '#2a2c30', OR = '#ef7a1f';
  const shield = def.parts[0], noseP = def.parts[1];
  const [sr, sh] = shield.cyl, sy = shield.p[1];                       // r 1.5, h 0.3 at y 0.3
  const coneBot = sy + sh / 2, coneTop = noseP.p[1] - noseP.box[1] + 0.05;     // 0.45 .. 1.75
  const rBot = sr - 0.06, rTop = 0.74;
  const rAt = y => rBot + (rTop - rBot) * (y - coneBot) / (coneTop - coneBot);

  // --- heat shield + glowing rim ----------------------------------------------------------------------------------------
  k.cyl(BR, sr, sh * 0.7, [0, sy + sh * 0.12, 0], { seg: 20 });
  k.cyl(BD, sr - 0.05, sh * 0.35, [0, sy - sh * 0.3, 0], { seg: 20, r2: sr });
  const glowMat = enhance(new THREE.MeshStandardMaterial({ color: OR, emissive: '#ff6a10', emissiveIntensity: 0.4, roughness: 0.5 }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(sr - 0.02, sr - 0.12, 0.05, 20, 1, true), glowMat);
  rim.position.y = sy - sh / 2 - 0.01; group.add(rim);
  const plasmaMat = new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const plasma = new THREE.Mesh(new THREE.ConeGeometry(sr * 1.08, 3.2, 16, 1, true), plasmaMat);
  plasma.rotation.x = Math.PI; plasma.position.y = sy - 1.7; plasma.visible = false; group.add(plasma);

  // --- body: faceted cone, dark band, collar, nose bay -------------------------------------------------------------------
  k.cyl(W, rBot, coneTop - coneBot, [0, (coneTop + coneBot) / 2, 0], { seg: 12, r2: rTop });     // faceted: 12 sides
  k.cyl(BD, rBot + 0.02, 0.06, [0, coneBot + 0.03, 0], { seg: 12, r2: rBot - 0.01 });      // under the cabin floor (0.52)
  k.cyl(K, rTop + 0.06, 0.1, [0, coneTop, 0], { seg: 12 });
  const [nhx, nhy] = noseP.box;
  k.cyl(WG, nhx * 0.95, nhy * 2 - 0.1, [0, noseP.p[1] - 0.02, 0], { seg: 12 });
  k.cyl(K, nhx * 0.98, 0.06, [0, noseP.p[1] + nhy - 0.08, 0], { seg: 12 });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.cyl(WG, 0.035, 0.05, [Math.cos(a) * nhx * 0.8, noseP.p[1] + nhy - 0.03, Math.sin(a) * nhx * 0.8], { seg: 6 }); }   // line rings
  // thruster pods on the collar, angled out
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2, x = Math.cos(a), z = Math.sin(a), r = rTop + 0.12;
    k.box(K, [0.16, 0.18, 0.16], [x * r, coneTop - 0.1, z * r], { rot: [0, -a, 0], bevel: 0.03 });
    k.cyl('darkMetal', 0.07, 0.14, [x * (r + 0.08), coneTop - 0.18, z * (r + 0.08)], { rot: [z * 0.8, 0, -x * 0.8], seg: 8, r2: 0.04 });
  }
  // windows (three) and the hatch at the front (+z)
  const slope = Math.atan2(rBot - rTop, coneTop - coneBot);
  // a panel on the cone wall at bearing a (0 = +z, the front): leaned back by the wall's slope, then turned to face out
  const onWall = (a, y, out = 0.012) => {
    const e = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeRotationY(a).multiply(new THREE.Matrix4().makeRotationX(-slope)), 'XYZ');
    const r = rAt(y) + out; return { p: [Math.sin(a) * r, y, Math.cos(a) * r], rot: [e.x, e.y, e.z] };
  };
  for (const [a, y] of [[Math.PI * 0.62, 1.2], [-Math.PI * 0.62, 1.2], [Math.PI, 1.25]]) { const o = onWall(a, y); k.box('#3b5f86', [0.26, 0.2, 0.02], o.p, { rot: o.rot, bevel: 0 }); }
  const hy = 1.02;
  { const o = onWall(0, hy, 0.01); k.box(K, [0.7, 0.86, 0.02], o.p, { rot: o.rot, bevel: 0.01 }); }
  { const o = onWall(0, hy, 0.022); k.box(WG, [0.62, 0.78, 0.02], o.p, { rot: o.rot, bevel: 0.01 }); }
  { const o = onWall(0, hy + 0.18, 0.035); k.box('#3b5f86', [0.26, 0.2, 0.02], o.p, { rot: o.rot, bevel: 0 }); }
  const hr = rAt(hy);
  k.box(K, [0.06, 0.04, 0.04], [0.22, hy - 0.05, hr + 0.04], { bevel: 0 });

  // --- inside: floor, two seats, a console --------------------------------------------------------------------------
  const floorY = def.seats[0].feet[1];
  k.cyl('#4a4d52', 1.25, 0.04, [0, floorY - 0.02, 0], { seg: 12 });
  for (const s of def.seats) {
    const [x, y, z] = s.p;
    k.box(K, [0.46, y - 0.08 - floorY, 0.44], [x, (y - 0.08 + floorY) / 2, z], { bevel: 0.03 });
    k.box('#55585e', [0.48, 0.08, 0.46], [x, y - 0.06, z + 0.02], { bevel: 0.03 });
    k.box('#55585e', [0.48, 0.66, 0.1], [x, y + 0.28, z - 0.25], { rot: [-0.12, 0, 0], bevel: 0.03 });
  }
  k.box(K, [0.7, 0.3, 0.12], [0, floorY + 0.75, 0.82], { rot: [-0.5, 0, 0], bevel: 0.02 });

  // --- parachute: canopy of 16 gores (alternating), lines to the bay; one group scaled open ---------------------------
  const chute = new THREE.Group(); chute.position.set(0, noseP.p[1] + nhy, 0); chute.visible = false;
  const R = 5.5, H = 6.5, gores = 16;
  const gk = createKit(THREE, opts);
  const goreGeo = { [OR]: [], ['#f4f1ea']: [] };
  for (let i = 0; i < gores; i++) {
    const a0 = i / gores * Math.PI * 2, a1 = (i + 1) / gores * Math.PI * 2;
    const ring = (a, t) => [Math.cos(a) * R * Math.sin(t * Math.PI / 2), H + Math.cos(t * Math.PI / 2) * R * 0.45, Math.sin(a) * R * Math.sin(t * Math.PI / 2)];
    const pts = [];
    for (let j = 0; j < 3; j++) { const t0 = j / 3, t1 = (j + 1) / 3; const A = ring(a0, t0), B = ring(a1, t0), C = ring(a1, t1), D = ring(a0, t1); pts.push(A, C, B, A, D, C); }
    goreGeo[i % 2 ? '#f4f1ea' : OR].push(...pts);
  }
  for (const [col, pts] of Object.entries(goreGeo)) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, enhance(new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, side: THREE.DoubleSide }))); m.castShadow = true;
    chute.add(m);
  }
  for (let i = 0; i < gores; i += 2) { const a = i / gores * Math.PI * 2; gk.tube('#d8d6cf', [[Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3], [Math.cos(a) * R, H, Math.sin(a) * R]], 0.012, { seg: 3 }); }
  gk.finish(chute);
  group.add(chute);

  // --- crush pads (the wheels) -----------------------------------------------------------------------------------------
  const wheels = def.wheels.map(w => {
    const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin); g.position.set(...w.p); group.add(g);
    const pk = createKit(THREE, opts);
    pk.cyl(K, w.r, w.r * 0.9, [0, 0, 0], { seg: 10 });
    pk.cyl('darkMetal', w.r * 0.5, w.r * 1.6, [0, w.r * 0.9, 0], { seg: 8 });
    pk.finish(spin);
    return { group: g, spin, base: w.p };
  });

  k.finish(group);
  let open = 0, last = null, prev = null, heat = 0;
  const wp = new THREE.Vector3();
  return {
    group, wheels, chute,
    update(st) {
      st.wheels?.forEach((w, i) => { const m = wheels[i]; if (m) m.group.position.y = m.base[1] + (w.comp ?? 0.08) - 0.05; });
      const t = st.t ?? performance.now() / 1000;
      const dt = last == null ? 0 : Math.min(0.1, Math.max(0, t - last)); last = t;
      // parachute: out over 2.5 s, back in fast when cut away
      const want = st.acts?.door_chute ? 1 : 0;
      open = want ? Math.min(1, open + dt / 2.5) : Math.max(0, open - dt * 3);
      chute.visible = open > 0.01;
      if (chute.visible) { const e = open * open * (3 - 2 * open); chute.scale.set(0.12 + 0.88 * e, 0.35 + 0.65 * Math.min(1, open * 2), 0.12 + 0.88 * e); }
      // reentry glow from this model's own speed (world position change per frame)
      group.getWorldPosition(wp);
      if (prev && dt > 0) { const v = wp.distanceTo(prev) / dt; heat += ((v > 70 ? Math.min(1, (v - 70) / 90) : 0) - heat) * Math.min(1, dt * 2); }
      prev = (prev || new THREE.Vector3()).copy(wp);
      glowMat.emissiveIntensity = 0.4 + heat * 3.5;
      plasma.visible = heat > 0.03; plasmaMat.opacity = heat * 0.55;
      if (plasma.visible) plasma.scale.set(1, 0.7 + heat * 0.6 + 0.08 * Math.sin(t * 31), 1);
    },
  };
}
