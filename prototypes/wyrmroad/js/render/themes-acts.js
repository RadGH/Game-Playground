// The Acts II and III streets (docs/STORY.md, data/acts.json `theme`), built with the same kit as Act I's six
// (themes.js K: batched low-poly pieces, recorded buildings and ground for the geometry test). Each has its own mood and
// palette; the wyrm's spine on the horizon shows only where she still lies there (the hold road's Act II) — on the free
// road she has risen, and in Act III she flies, fights or leashes beside you, so her absence (or her body) is the sign.
//
//   free road  rift (Brokenreach) · underway · lake (Bellwater) · capital · sky (her back) · maw · ashfall · foundry ·
//              belltower
//   hold road  kingsway · marsh (Rookhaven) · kiln · siege · village_night · lanternvoid · highlands · abbey_wraith ·
//              crown_burning
import * as THREE from 'three';
import { Batch, prim, mat, texMat, skyTex, glowTex, mixHex } from './kit.js';
import { K } from './themes.js';

const RH = 2.9;   // road half-width (themes.js ROAD_HALF)

// ------------------------------------------------------------------------------------------------ shared pieces
/** A textured ground plane (recorded as a surface the geometry test stands buildings on). */
function groundPlane(C, x0, x1, z0, z1, color, kind = 'rock', y = -0.02) {
  const tex = K.groundTex(kind, color); tex.repeat.set((x1 - x0) / 6, (z1 - z0) / 6); tex.needsUpdate = true;
  const g = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ map: tex, gradientMap: mat('batch').gradientMap }));
  g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); g.receiveShadow = true; C.group.add(g); C.disposables.push(g.geometry, g.material, tex);
  K.surface(C, x0, x1, z0, z1, y, 'ground');
}
/** A flat water sheet (night lake, marsh, harbour) with a moving texture; `see` makes it see-through for reflections. */
function waterSheet(C, y, colors, { see = 0, z0 = -400, z1 = 100 } = {}) {
  const t = waterTexOf(colors);
  const m = new THREE.MeshToonMaterial({ map: t, gradientMap: mat('batch').gradientMap, transparent: see > 0, opacity: see > 0 ? 1 - see : 1, depthWrite: !see });
  const w = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 600, z1 - z0).rotateX(-Math.PI / 2), m);
  w.position.set((C.x0 + C.x1) / 2, y, (z0 + z1) / 2); C.group.add(w); C.disposables.push(w.geometry, m, t);
  C.updates.push((dt, tt) => { t.offset.set(tt * 0.008, tt * 0.003); });
  return w;
}
function waterTexOf([a, b, glint]) {
  return K.roadTex ? (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 150; i++) { g.fillStyle = glint; g.globalAlpha = 0.15 + Math.random() * 0.25; g.fillRect(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 30, 2); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(120, 100); return t;
  })() : null;
}
/** Flickering fires (two nested cone layers, instanced): list of [x, y, z, size]. `colors` = [outer, core]. */
function fires(C, list, colors = ['#ff7a20', '#ffe080'], halo = true) {
  if (!list.length) return;
  // additive, see-through layers: a fire reads as light, not as a solid yellow cone
  const [m1, m2] = colors.map((c, i) => new THREE.MeshBasicMaterial({ color: c, fog: true, transparent: true, opacity: i ? 0.95 : 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  C.disposables.push(m1, m2);
  const a = new THREE.InstancedMesh(prim('cone', 6), m1, list.length), b = new THREE.InstancedMesh(prim('cone', 6), m2, list.length);
  a.frustumCulled = b.frustumCulled = false; C.group.add(a, b);
  if (halo) for (const [x, y, z, s] of list) C.halos.push([x, y + 0.6 * s, z + 0.2, colors[0], 2.4 * s]);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  C.updates.push((dt, t) => {
    list.forEach(([x, y, z, s], i) => {
      const f = 0.8 + Math.sin(t * 11 + i * 1.7) * 0.15 + Math.sin(t * 23 + i) * 0.1;
      const w = 1 + Math.sin(t * 17 + i * 3.1) * 0.12;
      P.set(x, y + 0.45 * s * f, z); S.set(0.42 * s * w, 0.95 * s * f, 0.42 * s / w); M.compose(P, Q, S); a.setMatrixAt(i, M);
      P.set(x, y + 0.28 * s * f, z + 0.04); S.set(0.22 * s, 0.55 * s * f, 0.22 * s); M.compose(P, Q, S); b.setMatrixAt(i, M);
    });
    a.instanceMatrix.needsUpdate = b.instanceMatrix.needsUpdate = true;
  });
}
/** Rising particles: smoke (dark, normal blending, big) or embers / wisps / spores (additive, small). */
function particles(C, { n, color, size, area, rise = 1.2, life = 4, additive = false, opacity = 0.6, sway = 0.6, sources = null }) {
  n = C.low ? Math.ceil(n * 0.5) : n;
  const pos = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) {
    const src = sources ? sources[i % sources.length] : null;
    seeds.push({ x: src ? src[0] : area.x0 + C.rand() * (area.x1 - area.x0), y: src ? src[1] : area.y0 + C.rand() * (area.y1 - area.y0), z: src ? src[2] : area.z0 + C.rand() * (area.z1 - area.z0), p: C.rand() * life, j: C.rand() * 6 });
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: glowTex(), color, size, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true });
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; C.group.add(pts); C.disposables.push(geo, m);
  C.updates.push((dt, t) => {
    for (let i = 0; i < n; i++) {
      const s = seeds[i], k = ((t + s.p) % life);
      pos[i * 3] = s.x + Math.sin(t * 0.5 + s.j) * sway + (sources ? k * 0.35 : 0); pos[i * 3 + 1] = s.y + k * rise; pos[i * 3 + 2] = s.z + Math.cos(t * 0.4 + s.j) * sway * 0.5;
    }
    geo.attributes.position.needsUpdate = true;
  });
}
/** A big soft glow that breathes (the Undermaw's heart, the moon, furnace mouths): additive sprite, scale only. */
function pulseGlow(C, x, y, z, color, size, { rate = 1.2, depth = 0.18, opacity = 0.85 } = {}) {
  const m = new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false });
  const s = new THREE.Sprite(m); s.position.set(x, y, z); s.scale.setScalar(size); C.group.add(s); C.disposables.push(m);
  if (rate) C.updates.push((dt, t) => { const b = Math.pow(Math.max(0, Math.sin(t * rate * Math.PI)), 6); s.scale.setScalar(size * (1 + depth * b + 0.04 * Math.sin(t * 2.1))); });
  return s;
}
/** Mist bands (forest's look, recoloured). */
function mistBands(C, color, list) {
  const tex = K.mistTex();
  for (const [z, y, op, h = 5] of list) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 80, h), new THREE.MeshBasicMaterial({ map: tex.clone(), color, transparent: true, opacity: op, depthWrite: false, fog: true }));
    m.position.set((C.x0 + C.x1) / 2, y, z); C.group.add(m); C.disposables.push(m.geometry, m.material);
    C.updates.push((dt, t) => { m.material.map.offset.x = t * 0.005 * (1 + z / -20); });
  }
}
/** Wind streaks racing along the street (spine's look). */
function windStreaks(C, n, color = '#ffffff', opacity = 0.25, speed = 18) {
  n = C.low ? Math.ceil(n * 0.4) : n;
  const s = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.03), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }), n);
  s.frustumCulled = false; C.group.add(s); C.disposables.push(s.geometry, s.material);
  const ws = Array.from({ length: n }, () => ({ x: C.rand() * 40, y: 0.4 + C.rand() * 6, z: -8 + C.rand() * 9, l: 2 + C.rand() * 5, s: speed * (0.8 + C.rand() * 0.6) }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  C.updates.push((dt, t, camX) => {
    for (let i = 0; i < n; i++) { const w = ws[i]; w.x -= w.s * dt; if (w.x < -20) { w.x = 20 + C.rand() * 10; w.y = 0.4 + C.rand() * 6; } P.set(camX + w.x, w.y, w.z); S.set(w.l, 1, 1); M.compose(P, Q, S); s.setMatrixAt(i, M); }
    s.instanceMatrix.needsUpdate = true;
  });
}
/** A far winged silhouette circling in the sky (Ossmara or her brood, far off). */
function farFlyer(C, { color = '#2a2228', size = 6, y = 30, z = -120, r = 50, speed = 0.12 } = {}) {
  const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }); C.disposables.push(m);
  const body = new THREE.Mesh(prim('cone', 5), m); body.scale.set(size * 0.12, size, size * 0.12); body.rotation.z = Math.PI / 2; g.add(body);
  const wingG = new THREE.BufferGeometry(); wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.3, 0, 1.6, 0.6, 0, 1.2, 0, 0, 0, 0.6, 0, 1.2, 0.2, 0, 0.3], 3)); wingG.computeVertexNormals(); C.disposables.push(wingG);
  const wl = new THREE.Mesh(wingG, m), wr = new THREE.Mesh(wingG, m); wl.scale.setScalar(size * 0.7); wr.scale.set(size * 0.7, size * 0.7, -size * 0.7); g.add(wl, wr);
  C.group.add(g);
  const cx = (C.x0 + C.x1) / 2;
  C.updates.push((dt, t, camX) => { const a = t * speed; g.position.set(camX + Math.cos(a) * r, y + Math.sin(t * 0.4) * 3, z + Math.sin(a) * r * 0.25); g.rotation.y = -a + Math.PI / 2; const f = Math.sin(t * 2.2) * 0.5; wl.rotation.x = f; wr.rotation.x = -f; void cx; });
}
/** A bell (lathe): flared lip, waist, crown. */
let bellG = null;
function bellGeo() {
  if (bellG) return bellG;
  const pts = [[0, 0], [1, 0.02], [0.98, 0.1], [0.82, 0.22], [0.66, 0.42], [0.6, 0.7], [0.58, 0.88], [0.42, 1], [0, 1.04]].map(([r, y]) => new THREE.Vector2(r, y));
  bellG = new THREE.LatheGeometry(pts, 14); bellG.computeVertexNormals();
  return bellG;
}
const bell = (b, x, y, z, r, c, o = {}) => b.add(bellGeo(), { x, y, z, sx: r, sy: r * 1.25, sz: r, rz: o.rz || 0 }, c).last;
/** A tower: a stone shaft, an open belfry on four posts with a bell, a pyramid roof — recorded as a building. */
function bellTower(C, x, z, { w = 2.4, h = 9, stone = '#8a8e96', roofC = '#3e4656', y0 = 0, bellC = '#b08a3a', split = false } = {}) {
  const { near } = C;
  const shaft = K.box(near, x, y0 - K.SINK, z, w, h - y0 + K.SINK, w, stone, { jitter: 0.04, rand: C.rand });
  for (let yy = y0 + 1; yy < h; yy += 1.1) K.box(near, x, yy, z + w / 2 + 0.01, w + 0.04, 0.06, 0.04, mixHex(stone, '#000000', 0.25));
  if (split) {
    // the tower split down its middle when the wyrm rose: two halves leaning apart, the bell hanging cracked between
    K.box(near, x - w * 0.3, h, z, w * 0.42, 2.6, w, stone, { rz: 0.16 }); K.box(near, x + w * 0.3, h, z, w * 0.42, 2.2, w, stone, { rz: -0.22 });
    bell(near, x + 0.1, h - 0.4, z, w * 0.32, bellC, { rz: 0.25 });
    return null;
  }
  const cap = K.box(near, x, h, z, w + 0.2, 0.25, w + 0.2, mixHex(stone, '#000000', 0.15));
  for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) K.box(near, x + ox * (w / 2 - 0.12), h + 0.25, z + oz * (w / 2 - 0.12), 0.24, 2, 0.24, stone);
  const top = K.box(near, x, h + 2.25, z, w + 0.3, 0.25, w + 0.3, mixHex(stone, '#000000', 0.15));
  bell(near, x, h + 0.7, z, w * 0.3, bellC);
  const rf = K.cone(near, x, h + 2.5, z, (w + 0.7) * 0.72, w * 1.3, roofC, 4, { ry: Math.PI / 4 });
  K.building(C, 'bell tower', shaft.clone().union(cap).union(top), rf);
  return shaft;
}
function env(C, sky, o) { C.env = { sky: skyTex(sky), ...o }; }

// ------------------------------------------------------------------------------------------------ Act II · free road
/** BROKENREACH: the long trench the wyrm lay in, cold blue mist breathing out of it, a graveyard on its rim and split
 *  bell towers on the far side. No spine on the horizon — she rose out of this trench. */
function rift(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'cracked', curb: '#5a5e6a', frontGround: '#3e4450', ground: 'rock' });
  groundPlane(C, C.x0 - 300, C.x1 + 300, -5.4, -RH, '#454a56', 'rock');            // the near rim
  groundPlane(C, C.x0 - 300, C.x1 + 300, -400, -32, '#3e4450', 'rock');            // the far side
  // the trench: dark walls going down, a far cliff face, a floor of cold light
  K.box(near, (C.x0 + C.x1) / 2, -7, -5.7, C.x1 - C.x0 + 80, 7, 0.6, '#2a2e38');
  K.box(far, (C.x0 + C.x1) / 2, -7, -31.6, C.x1 - C.x0 + 120, 7, 0.8, '#30343e');
  K.box(glow, (C.x0 + C.x1) / 2, -6.2, -18, C.x1 - C.x0 + 120, 0.05, 25, '#14304a');
  K.scatter(C, C.x0 - 20, C.x1 + 20, 4, x => K.rock(C, far, x, -2 - rand() * 3, -30.5 + rand() * 2, 1.5 + rand() * 2, '#3a3e48'));
  K.scatter(C, C.x0 - 20, C.x1 + 20, 9, x => { const z = -8 - rand() * 20; K.box(glow, x, -6, z, 0.12, 0.12, 0.12, '#9ad8ff'); C.halos.push([x, -4.5, z, '#5ab8ff', 6 + rand() * 6]); });
  mistBands(C, '#7ab8ff', [[-7, -1.5, 0.35, 6], [-14, -0.5, 0.3, 7], [-24, 0, 0.32, 8]]);
  particles(C, { n: 90, color: '#a8d8ff', size: 0.22, area: { x0: C.x0, x1: C.x1, y0: -4, y1: 0, z0: -26, z1: -7 }, rise: 1.1, life: 5, additive: true, opacity: 0.7 });
  // the graveyard on the rim: headstones and markers, an open grave near the trench's end
  K.scatter(C, C.x0, C.x1, 1.9, x => {
    const z = -3.7 - rand() * 1.3, t = rand();
    if (t < 0.55) { K.box(near, x, -0.1, z, 0.5, 0.75 + rand() * 0.35, 0.14, '#7a7e86', { rz: (rand() - 0.5) * 0.25 }); K.ball(near, x, 0.75, z, 0.25, '#7a7e86', 1, 0.5, 0.25); }
    else if (t < 0.8) { K.box(near, x, -0.1, z, 0.1, 1.1, 0.1, '#4a4038'); K.box(near, x, 0.7, z, 0.55, 0.1, 0.1, '#4a4038'); }
    else K.box(near, x, -0.05, z, 1.2, 0.18, 0.6, '#5a4e40');
  });
  const gx = C.L - 18; K.box(near, gx, -0.6, -4.3, 1.4, 0.62, 0.8, '#0e0c0a'); K.box(near, gx, 0, -4.9, 1.6, 0.35, 0.4, '#4a3e30');
  K.scatter(C, C.x0 + 10, C.x1, 16, x => K.lampPost(C, x, -3.4, '#8ad0ff', '#22262e', 2.4));
  // the far side: a quiet village and split bell towers
  let x = C.x0 + 6, i = 0;
  while (x < C.x1 + 20) {
    if (i % 3 === 1) bellTower(C, x, -36 - rand() * 4, { h: 8 + rand() * 3, split: rand() < 0.7, stone: '#7a7e88' });
    else K.house(C, x, -36 - rand() * 4, { w: 4 + rand() * 2, h: 2.6 + rand(), wall: rand() < 0.5 ? '#8a8a90' : '#7a7a82', roof: '#3a4250', roofH: 1.6, lit: rand() < 0.3 ? '#9ad0ff' : '#2a3038', windows: [-0.3, 0.3] });
    x += 9 + rand() * 6; i++;
  }
  K.scatter(C, C.x0 - 60, C.x1 + 60, 22, xx => K.hill(C, far, xx, -90 - rand() * 50, 30 + rand() * 25, 8 + rand() * 6, rand() < 0.5 ? '#3a4250' : '#343a48'));
  K.scatter(C, C.x0, C.x1, 3.5, xx => K.rock(C, near, xx, 0, 3.6 + rand() * 1.6, 0.3, '#5a5e68'));
  C.ridge = null;
  env(C, [[0, '#0a1020'], [0.5, '#1e3048'], [0.85, '#4a6a88'], [1, '#7a98b0']], { fog: ['#3a5068', 18, 180], hemi: ['#a8c8f0', '#2a3040', 1.1], sun: ['#c8dcff', 1.7], sunDir: [-0.4, 0.8, 0.5], lamp: ['#7ac8ff', 5], exposure: 1.3 });
  K.clouds(C, '#5a6a80', 8);
}

/** THE UNDERWAY: a cavern under the road, the ribs of older wyrms arching out of the rock, roots glowing blue. */
function underway(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'dirt', curb: '#3a3a44', backGround: '#24242e', frontGround: '#2a2a34', ground: 'rock' });
  // the cave's back wall and its roof, out of sight above
  K.scatter(C, C.x0 - 30, C.x1 + 30, 3.2, x => K.rock(C, near, x, -1, -11 - rand() * 4, 3 + rand() * 2.5, rand() < 0.5 ? '#3a3844' : '#32303c'));
  K.scatter(C, C.x0 - 30, C.x1 + 30, 6, x => K.rock(C, far, x, 4, -14 - rand() * 6, 5 + rand() * 3, '#2a2834'));
  K.scatter(C, C.x0, C.x1, 2.4, x => K.cone(near, x, 8 + rand() * 3, -5 - rand() * 7, 0.3 + rand() * 0.4, 1.5 + rand() * 2.5, '#3e3c48', 5, { rx: Math.PI }));
  // the ribs: an older wyrm's skeleton lying along the cave — its ribs arch over the back of the cave from its spine
  const ribG = new THREE.TorusGeometry(1, 0.05, 6, 18, Math.PI);
  for (let x = C.x0 + 6; x < C.x1; x += 3.6) { const r = 5.2 + Math.sin(x * 0.07) * 0.6; near.add(ribG, { x, y: -0.4, z: -10, sx: r, sy: r, sz: r * 1.3, ry: Math.PI / 2 }, '#d0c4a6', { jitter: 0.05, rand }); }
  K.cyl(near, (C.x0 + C.x1) / 2, 5, -10, 0.55, C.x1 - C.x0, '#bfb398', 10, { rz: Math.PI / 2 });              // its spine along the top
  K.scatter(C, C.x0, C.x1, 21, x => { K.ball(near, x, 0.8, -8.6, 1.3, '#d0c4a8', 1.6, 0.9, 1.1); K.ball(near, x + 0.8, 1.0, -7.7, 0.35, '#1a1414'); });   // older skulls
  // roots creeping down the cave wall in wandering lines, glowing a soft blue where they are thin
  K.scatter(C, C.x0, C.x1, 2.2, x => {
    const z = -6.5 - rand() * 2.5; let px = x, py = 7 + rand() * 4, a = Math.PI + (rand() - 0.5) * 0.5;
    for (let k = 0; k < 8 && py > 0; k++) {
      const len = 0.7 + rand() * 0.6, nx = px + Math.sin(a) * len * 0.6, ny = py - len;
      K.cyl(k > 4 ? glow : near, (px + nx) / 2, (py + ny) / 2 - len / 2, z, 0.08 - k * 0.006, len, k > 4 ? '#4aa8e8' : '#2a3a4a', 5, { rz: Math.atan2(-(nx - px), ny - py) });
      px = nx; py = ny; a += (rand() - 0.5) * 0.9;
    }
    if (rand() < 0.4) C.halos.push([px, Math.max(0.4, py), z + 0.4, '#4aa8e8', 1.4]);
  });
  K.scatter(C, C.x0, C.x1, 2.8, x => K.rock(C, near, x, 0, 3.6 + rand() * 2, 0.35, '#3a3844'));
  particles(C, { n: 110, color: '#8ad8ff', size: 0.16, area: { x0: C.x0, x1: C.x1, y0: 0.2, y1: 6, z0: -8, z1: 2 }, rise: 0.25, life: 8, additive: true, opacity: 0.8, sway: 1.2 });
  mistBands(C, '#3a6a9a', [[-6, 1, 0.18], [-12, 2, 0.25]]);
  C.ridge = null;
  env(C, [[0, '#04060a'], [0.6, '#0c1420'], [1, '#1a2a3a']], { fog: ['#0e1a26', 10, 90], hemi: ['#6a9ad0', '#1a1a24', 1.25], sun: ['#8ac0ff', 1.4], sunDir: [-0.3, 0.9, 0.4], lamp: ['#5ab8ff', 6], exposure: 1.5 });
}

/** BELLWATER: a lake village drowned to its roofs; bell towers stand in a mirror-still lake under the moon, mist low on
 *  the water. The road is a boardwalk over the shallows. */
function lake(C) {
  const { near, glow, rand } = C;
  K.streetBase(C, { road: 'planks', curb: null });
  K.surface(C, C.x0 - 300, C.x1 + 300, -400, 100, -2.6, 'lakebed');
  for (const zz of [RH + 0.2, -RH - 0.2]) K.box(near, (C.x0 + C.x1) / 2, -0.3, zz, C.x1 - C.x0, 0.32, 0.36, '#3a3028');
  for (let x = C.x0; x < C.x1; x += 2.4) { K.cyl(near, x, -2.6, RH + 0.25, 0.16, 2.5, '#2a2420', 6); K.cyl(near, x, -2.6, -RH - 0.25, 0.16, 2.5, '#2a2420', 6); }
  // the drowned houses (roofs and the tops of their walls out of the water) and the bell towers, mirrored in the lake
  const mirror = new Batch(64), Cm = { ...C, near: mirror, buildings: [] };
  let x = C.x0 + 4, i = 0;
  while (x < C.x1 + 20) {
    const z = -9 - rand() * 12;
    if (i % 3 === 2) { const h = 3 + rand() * 1.6; for (const B of [C, Cm]) bellTower(B, x, z, { h, y0: -2.6, stone: '#7a7e8a', roofC: '#2e3442', bellC: '#c8a050' }); }
    else {
      const w = 3.6 + rand() * 2, top = 0.3 + rand() * 1.1, d = 3.4, wc = rand() < 0.5 ? '#6a6e74' : '#5e6268';
      for (const B of [C, Cm]) {
        const wall = K.box(B.near, x, -2.6 - K.SINK, z, w, top + 2.6 + K.SINK, d, wc);
        const rf = K.roof(B.near, x, top, z, w + 0.5, 1.5, d + 0.7, '#3a3e48');
        if (B === C) K.building(C, 'drowned house', wall, rf);
      }
      if (rand() < 0.4) { K.box(glow, x + w * 0.2, top - 0.25, z + d / 2 + 0.03, 0.5, 0.4, 0.04, '#ffd890'); C.halos.push([x + w * 0.2, top, z + d / 2 + 0.3, '#ffd890', 1.2]); }
    }
    x += 6 + rand() * 5; i++;
  }
  const mm = mirror.build(mat('batch', { transparent: true, opacity: 0.32, depthWrite: false }), { name: 'mirror' });
  mm.scale.y = -1; mm.position.y = -1.2; C.group.add(mm);                                // reflected about the water (y = −0.6)
  waterSheet(C, -0.6, ['#141c34', '#24304e', '#c8d8ff'], { see: 0.35 });
  // the moon and its path on the water
  const moon = pulseGlow(C, C.L * 0.5, 34, -160, '#e8f0ff', 26, { rate: 0 }); void moon;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ color: '#f4f6ff', fog: false })); disc.position.set(C.L * 0.5, 34, -161); C.group.add(disc); C.disposables.push(disc.geometry, disc.material);
  K.box(glow, C.L * 0.5, -0.58, -60, 3, 0.01, 80, '#3a4a78');
  // reeds and lily pads at the boardwalk's edges, mist on the water
  K.scatter(C, C.x0, C.x1, 1.4, xx => { const z = (rand() < 0.5 ? -1 : 1) * (RH + 0.9 + rand() * 1.5); for (let k = 0; k < 4; k++) K.cone(near, xx + (rand() - 0.5) * 0.5, -0.6, z, 0.05, 0.9 + rand() * 0.7, '#3a5040', 3, { rz: (rand() - 0.5) * 0.4 }); });
  K.scatter(C, C.x0, C.x1, 2.2, xx => K.cyl(near, xx, -0.59, RH + 1.2 + rand() * 2, 0.35, 0.02, '#3a6a4a', 8));
  mistBands(C, '#c8d8f0', [[-6, -0.3, 0.16, 2], [-16, 0, 0.2, 3]]);
  K.scatter(C, C.x0 - 80, C.x1 + 80, 26, xx => K.hill(C, C.far, xx, -110 - rand() * 40, 40 + rand() * 20, 7 + rand() * 6, '#1a2234'));
  C.ridge = null;
  env(C, [[0, '#04081a'], [0.55, '#14203e'], [0.85, '#2e3e64'], [1, '#4a5a80']], { fog: ['#2a3858', 25, 220], hemi: ['#9ab0e8', '#1e2434', 1.05], sun: ['#c8d4ff', 1.6], sunDir: [0.2, 0.8, 0.5], lamp: ['#ffd890', 4], exposure: 1.3 });
}

// ------------------------------------------------------------------------------------------------ Act II · hold road
/** THE KINGSWAY: the royal highway in autumn — paved, banners of the realm on tall poles, red and gold trees, golden
 *  stubble fields, and Halvenhold's castle on a far hill. The spine still lies on the horizon (she is on your leash). */
function kingsway(C) {
  const { near, far, rand } = C;
  K.streetBase(C, { road: 'flag', curb: '#9a9078', backGround: '#8a7a40', frontGround: '#8a7a3e', ground: 'grass' });
  const leaves = [['#c8582a', '#d8782a', '#e0a040'], ['#b04020', '#d06030', '#c8902a'], ['#d8a040', '#e0b84a', '#c88a2a']];
  K.scatter(C, C.x0, C.x1, 7, x => K.roundTree(C, near, x, -5.4 - rand() * 2.5, 1.1 + rand() * 0.4, '#4a3020', leaves[Math.floor(rand() * 3)]));
  // banners: tall poles every few metres, the realm's blue with a silver bar, the tails moving in the wind
  const bm = new THREE.MeshToonMaterial({ color: '#2f4a8a', gradientMap: mat('batch').gradientMap, side: THREE.DoubleSide }); C.disposables.push(bm);
  const flags = [];
  K.scatter(C, C.x0 + 4, C.x1, 9, x => {
    K.cyl(near, x, 0, -3.6, 0.07, 5.2, '#3a3028', 6); K.ball(near, x, 5.25, -3.6, 0.12, '#d8c890');
    const g = new THREE.PlaneGeometry(1.1, 2.6, 1, 6); g.translate(0.6, -1.3, 0);
    const f = new THREE.Mesh(g, bm); f.position.set(x, 5, -3.6); C.group.add(f); C.disposables.push(g); flags.push([f, g, rand() * 6]);
    K.box(C.glow, x + 0.6, 3.6, -3.55, 1.05, 0.22, 0.02, '#c8ccd8');
  });
  C.updates.push((dt, t) => { for (const [, g, p] of flags) { const a = g.attributes.position; for (let i = 0; i < a.count; i++) { const y = a.getY(i); a.setZ(i, Math.sin(t * 3 + p + y * 1.4) * 0.12 * (-y / 2.6)); } a.needsUpdate = true; } });
  K.scatter(C, C.x0, C.x1, 24, x => { K.box(near, x, 0, 3.7, 0.4, 0.55, 0.3, '#a8a090'); });          // milestones
  K.scatter(C, C.x0, C.x1, 3.2, x => K.ball(near, x, 0.3, 4.4 + rand(), 0.42, rand() < 0.5 ? '#8a6a2a' : '#7a5a24', 1.3, 0.6, 0.8));
  for (let k = 0; k < 16; k++) { const fx = C.x0 + k * ((C.x1 - C.x0) / 16), fw = (C.x1 - C.x0) / 16 - 1.2; for (let r = 0; r < 5; r++) K.box(far, fx, -0.04, -16 - r * 1.6, fw, 0.14, 1, r % 2 ? '#c8a84a' : '#b8983e'); }
  K.scatter(C, C.x0, C.x1, 16, x => K.roundTree(C, far, x, -26 - rand() * 20, 1.4, '#3a2618', leaves[Math.floor(rand() * 3)]));
  // Halvenhold on its hill
  const cx = C.L * 0.6; K.hill(C, far, cx, -140, 60, 12, '#7a7040');
  for (const [ox, h] of [[-12, 14], [-5, 20], [3, 24], [10, 16], [17, 12]]) { K.cyl(far, cx + ox, 2, -140, 1.6, h, '#c8c0b0', 8); K.cone(far, cx + ox, 2 + h, -140, 2.1, 5, '#3a4a8a', 8); }
  K.box(far, cx + 2, 2, -141, 30, 9, 2, '#b8b0a0');
  K.scatter(C, C.x0 - 60, C.x1 + 60, 26, x => K.hill(C, far, x, -90 - rand() * 50, 30 + rand() * 25, 8 + rand() * 6, rand() < 0.5 ? '#8a7a48' : '#7a6a3a'));
  C.ridge = { z: -150, elev: 2.6, color: '#6a6878', plate: '#7a7888', fade: 0.45, moving: 0 };
  env(C, [[0, '#4a6aa8'], [0.5, '#a8b8d0'], [0.8, '#f0c890'], [1, '#ffd8a0']], { fog: ['#e8c8a0', 40, 260], hemi: ['#d8dcf0', '#8a6a40', 1.1], sun: ['#ffd090', 2.6], sunDir: [-0.5, 0.6, 0.6], lamp: ['#ffb060', 0], exposure: 1.05 });
  K.clouds(C, '#fff0e0', 10);
}

/** ROOKHAVEN: a stilt village over a green marsh — houses on platforms joined by rope bridges, reeds, and the Rooks'
 *  red lanterns. The boardwalk is the road. */
function marsh(C) {
  const { near, glow, rand } = C;
  K.streetBase(C, { road: 'planks', curb: null });
  K.surface(C, C.x0 - 300, C.x1 + 300, -400, 100, -1.6, 'marsh bed');
  for (const zz of [RH + 0.2, -RH - 0.2]) K.box(near, (C.x0 + C.x1) / 2, -0.3, zz, C.x1 - C.x0, 0.32, 0.36, '#3a3022');
  for (let x = C.x0; x < C.x1; x += 2.2) { K.cyl(near, x, -1.6, RH + 0.25, 0.15, 1.5, '#2e2618', 6); K.cyl(near, x, -1.6, -RH - 0.25, 0.15, 1.5, '#2e2618', 6); }
  waterSheet(C, -0.45, ['#1e2a1a', '#2e3a22', '#8aa070']);
  // stilt houses on decks, rope bridges between the decks
  const decks = [];
  let x = C.x0 + 4;
  while (x < C.x1 + 10) {
    const w = 3.6 + rand() * 1.8, d = 3.2, z = -7 - rand() * 3, dy = 1.4 + rand() * 0.6, dw = w + 1.6, dd = d + 1.4;
    for (const ox of [-dw / 2 + 0.2, dw / 2 - 0.2]) for (const oz of [-dd / 2 + 0.2, dd / 2 - 0.2]) K.cyl(near, x + ox, -1.6, z + oz, 0.13, dy + 1.6, '#3a2e20', 6);
    K.box(near, x, dy - 0.18, z, dw, 0.18, dd, '#5a4630'); K.surface(C, x - dw / 2, x + dw / 2, z - dd / 2, z + dd / 2, dy, 'deck');
    const wall = K.box(near, x, dy - K.SINK, z, w, 2.2 + K.SINK, d, rand() < 0.5 ? '#6a5a40' : '#5e5038', { jitter: 0.06, rand });
    K.building(C, 'stilt house', wall, K.roof(near, x, dy + 2.2, z, w + 0.5, 1.6, d + 0.7, rand() < 0.5 ? '#8a7a4a' : '#7a6a40'));   // thatch
    K.box(near, x - w * 0.15, dy, z + d / 2 + 0.03, 0.8, 1.6, 0.06, '#2a2016');
    if (rand() < 0.7) { K.box(glow, x + w * 0.25, dy + 1.1, z + d / 2 + 0.04, 0.6, 0.5, 0.04, '#ffa860'); C.halos.push([x + w * 0.25, dy + 1.3, z + d / 2 + 0.3, '#ff9a50', 1.4]); }
    decks.push({ x, z, dy, dw }); x += w + 4 + rand() * 4;
  }
  for (let k = 1; k < decks.length; k++) {
    const a = decks[k - 1], b = decks[k], x0 = a.x + a.dw / 2, x1 = b.x - b.dw / 2, n = Math.max(2, Math.round((x1 - x0) / 0.45));
    for (let j = 0; j <= n; j++) {
      const u = j / n, xx = x0 + (x1 - x0) * u, yy = a.dy + (b.dy - a.dy) * u - Math.sin(u * Math.PI) * 0.5, zz = a.z + (b.z - a.z) * u;
      K.box(near, xx, yy - 0.06, zz, 0.32, 0.05, 0.8, '#6a5234', { ry: Math.atan2(b.z - a.z, x1 - x0) });
      if (j % 2 === 0) for (const s of [-1, 1]) K.cyl(near, xx, yy, zz + s * 0.4, 0.02, 0.8, '#8a7a5a', 4);
    }
  }
  // reeds and cattails, the Rooks' red lanterns
  K.scatter(C, C.x0, C.x1, 1.1, xx => { const z = (rand() < 0.35 ? 1 : -1) * (RH + 0.8 + rand() * 2.2); for (let k = 0; k < 5; k++) K.cone(near, xx + (rand() - 0.5) * 0.6, -0.45, z, 0.05, 1 + rand() * 0.9, rand() < 0.5 ? '#5a6a3a' : '#7a7a44', 3, { rz: (rand() - 0.5) * 0.35 }); if (rand() < 0.4) K.cyl(near, xx, 0.6, z, 0.06, 0.25, '#4a2e1a', 5); });
  K.scatter(C, C.x0 + 5, C.x1, 10, xx => { K.cyl(near, xx, 0, -3.5, 0.06, 2.4, '#2a2218', 5); K.box(near, xx, 1.9, -3.5, 0.3, 0.42, 0.3, '#1e1814'); K.box(glow, xx, 1.97, -3.5, 0.22, 0.3, 0.32, '#ff6a2a'); C.halos.push([xx, 2.1, -3.2, '#ff6a2a', 1.6]); });
  particles(C, { n: 70, color: '#c8ff8a', size: 0.14, area: { x0: C.x0, x1: C.x1, y0: 0.2, y1: 3, z0: -10, z1: 4 }, rise: 0.15, life: 7, additive: true, opacity: 0.8, sway: 1 });
  mistBands(C, '#8aa080', [[-5, 0.1, 0.25, 3], [-14, 0.4, 0.3, 4]]);
  K.scatter(C, C.x0 - 60, C.x1 + 60, 6, xx => K.cyl(C.far, xx, -0.5, -30 - rand() * 30, 0.4, 6 + rand() * 5, '#2a3020', 6));   // dead trees
  C.ridge = { z: -130, elev: 2.6, color: '#3a4234', plate: '#4a5240', fade: 0.5, moving: 0 };
  env(C, [[0, '#141a14'], [0.5, '#3a4a2e'], [0.82, '#8a8a4a'], [1, '#b8a860']], { fog: ['#5a6a40', 20, 170], hemi: ['#c0d0a0', '#2a2a1a', 1.15], sun: ['#e8d890', 2.0], sunDir: [0.4, 0.6, 0.6], lamp: ['#ff7a3a', 5], exposure: 1.25 });
}

/** THE KILN: a cathedral built round a green-glass furnace — black stone, tall stained glass, chains hanging out of the
 *  dark, green fire breathing in each furnace mouth, glass shards underfoot. */
function kiln(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'glass', curb: '#2e3432', backGround: '#1e2420', frontGround: '#222a24', ground: 'stone' });
  K.box(near, (C.x0 + C.x1) / 2, -0.2, -10.5, C.x1 - C.x0 + 60, 18, 1.2, '#22262a');
  const panes = ['#3aff7a', '#c6ff5a', '#e8b030', '#2a8a5a'];
  for (let x = C.x0; x < C.x1 + 10; x += 7) {
    K.box(near, x - 3.5, -0.2, -9.6, 1.3, 16, 1.4, '#2a2e32');                                          // piers
    for (let k = 0; k < 12; k++) K.box(glow, x + (k % 2 ? 0.45 : -0.45), 4 + Math.floor(k / 2) * 0.95, -9.86, 0.82, 0.86, 0.04, panes[(k + Math.floor(x)) % 4]);
    K.cone(glow, x, 9.7, -9.86, 0.95, 1.4, panes[Math.floor(x) % 4], 3, { sz: 0.03 });
    C.halos.push([x, 6.5, -9.3, '#8aff9a', 3.4]);
  }
  // the furnaces: brick domes along the back with green fire in their mouths
  const flames = [];
  for (let x = C.x0 + 14; x < C.x1; x += 34) {
    const dome = K.ball(near, x, 0, -6.6, 2.6, '#4a3a30', 1, 1.1, 0.9, { detail: 2 });
    K.box(near, x, 0, -6.6, 5.4, 0.6, 4.6, '#3a2e26'); K.cyl(near, x, 2.4, -6.8, 0.7, 9, '#3a2e26', 8);
    K.ball(glow, x, 0.9, -4.5, 0.95, '#6aff8a', 1.3, 1, 0.3); flames.push([x, 0.3, -4.4, 1.4]);
    pulseGlow(C, x, 1.2, -4, '#5aff7a', 7, { rate: 0.6, depth: 0.25 }); void dome;
  }
  fires(C, flames, ['#3aff6a', '#e0ffc0']);
  // chains out of the dark above, hooks on some
  K.scatter(C, C.x0, C.x1, 2.6, x => { const z = -3.8 - rand() * 4, top = 14, len = 3 + rand() * 6; for (let y = top; y > top - len; y -= 0.34) near.add(prim('torus', 0.25, 8), { x, y, z, s: 0.13, ry: Math.round(y * 3) % 2 ? Math.PI / 2 : 0 }, '#3a3e44'); if (rand() < 0.3) K.cone(near, x, top - len - 0.5, z, 0.12, 0.5, '#4a4e54', 4, { rx: Math.PI }); });
  // glass shards on the floor by the walls, a ledge in front
  K.scatter(C, C.x0, C.x1, 0.9, x => K.box(glow, x, 0, (rand() < 0.5 ? -1 : 1) * (RH + 0.4 + rand() * 1.2), 0.06, 0.08 + rand() * 0.25, 0.14 + rand() * 0.2, rand() < 0.8 ? '#4aff8a' : '#c6ff5a', { ry: rand() * 3, rz: (rand() - 0.5) * 0.8 }));
  for (let x = C.x0; x < C.x1; x += 1.2) K.box(near, x, 0, RH + 0.5, 1.15, 0.45, 0.5, '#2e3432', { jitter: 0.05, rand });
  particles(C, { n: 80, color: '#7aff9a', size: 0.18, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 3, z0: -6, z1: 2 }, rise: 1.4, life: 4, additive: true, opacity: 0.8 });
  void far;
  C.ridge = null;
  env(C, [[0, '#020403'], [0.55, '#0a140e'], [1, '#1e3a24']], { fog: ['#0c1a10', 14, 110], hemi: ['#9ae8b0', '#141a16', 1.2], sun: ['#b8ffc8', 1.5], sunDir: [-0.2, 0.9, 0.5], lamp: ['#5aff7a', 9], exposure: 1.45 });
}

// ------------------------------------------------------------------------------------------------ Act III · free + bond
/** HALVENHOLD AT NIGHT: tall town houses, the cobbles split by roots that glow cold blue, lamps, the palace lit far off. */
function capital(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'cracked', curb: '#6a6a72', backGround: '#2a2c34', frontGround: '#2e3038', ground: 'stone' });
  const walls = ['#c8bca8', '#b8ac98', '#a8a0a0', '#c0b4a8'];
  let x = C.x0 + 2, i = 0;
  while (x < C.x1 + 6) {
    const w = 4 + rand() * 1.6, h = 5.6 + rand() * 2.4;
    K.house(C, x + w / 2, -6.4, { w, h, d: 4, wall: walls[i % 4], roof: '#2e3440', roofH: 2.2, timber: '#2a2420', lit: '#ffd080', windows: [-0.28, 0.28] });
    for (const wx of [-0.28, 0.28]) for (const wy of [3.2, 5.2]) if (wy < h - 0.6) { const lit = rand() < 0.5; K.box(lit ? glow : near, x + w / 2 + wx * w, wy, -4.37, 0.62, 0.8, 0.04, lit ? '#ffd080' : '#2a2e3a'); if (lit) C.halos.push([x + w / 2 + wx * w, wy + 0.3, -4.1, '#ffc870', 1.2]); }
    x += w + 0.2; i++;
  }
  // the roots: up through the cobbles and the curb, glowing in their cracks
  const loopG = new THREE.TorusGeometry(1, 0.16, 6, 12, Math.PI);
  K.scatter(C, C.x0, C.x1, 5.5, xx => {
    const z = -3.3 - rand() * 0.5, r = 0.5 + rand() * 0.7;
    near.add(loopG, { x: xx, y: -0.15, z, sx: r, sy: r * 0.8, sz: r, ry: rand() * 0.8 - 0.4 }, '#5a3a26', { jitter: 0.06, rand });   // a root loop heaving up out of the curb
    near.add(loopG, { x: xx + r * 1.6, y: -0.2, z: z + 0.2, sx: r * 0.6, sy: r * 0.5, sz: r * 0.6, ry: rand() }, '#4a3020');
    K.cyl(glow, xx, 0.01, z + 0.5, 0.03, 1.4, '#6ac8ff', 4, { rz: Math.PI / 2, ry: rand() * 0.6 - 0.3 }); C.halos.push([xx, 0.5, z + 0.6, '#5ab8ff', 1.3]);
  });
  K.scatter(C, C.x0, C.x1, 11, xx => { let px = xx, py = 0; for (let k = 0; k < 7; k++) { const nx = px + (rand() - 0.5) * 0.5, ny = py + 0.6; K.cyl(near, (px + nx) / 2, py, -4.3, 0.09, 0.62, '#4a3020', 5, { rz: -Math.atan2(nx - px, 0.6) }); px = nx; py = ny; } });   // roots climbing the house fronts
  K.scatter(C, C.x0, C.x1, 14, xx => K.lampPost(C, xx, -3.6, '#ffc060', '#1e2028', 3));
  K.scatter(C, C.x0, C.x1, 5, xx => K.rock(C, near, xx, 0, 3.8 + rand() * 1.5, 0.3, '#5a5a62'));
  // the palace far off, lit, and the city's roofs between
  const px = C.L * 0.55;
  for (const [ox, h] of [[-14, 22], [-6, 30], [0, 36], [7, 28], [15, 20]]) { K.cyl(far, px + ox, 0, -110, 2.2, h, '#4a4c58', 8); K.cone(far, px + ox, h, -110, 2.8, 7, '#22263a', 8); K.box(glow, px + ox, h * 0.7, -107.8, 0.8, 1.6, 0.05, '#ffd080'); }
  K.scatter(C, C.x0 - 80, C.x1 + 80, 5, xx => { const h = 6 + rand() * 8; K.box(far, xx, 0, -40 - rand() * 40, 4 + rand() * 4, h, 4, '#2a2c38'); if (rand() < 0.5) K.box(glow, xx, h * 0.6, -38, 0.6, 0.6, 0.05, '#ffc870'); });
  particles(C, { n: 50, color: '#8ad8ff', size: 0.14, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 4, z0: -4, z1: 3 }, rise: 0.4, life: 6, additive: true, opacity: 0.7 });
  C.ridge = null;
  env(C, [[0, '#04060e'], [0.55, '#101830'], [0.85, '#24304a'], [1, '#3a4660']], { fog: ['#1a2238', 22, 200], hemi: ['#8aa0d8', '#22242e', 1.1], sun: ['#b8c8ff', 1.5], sunDir: [0.3, 0.8, 0.5], lamp: ['#ffb060', 7], exposure: 1.35 });
}

/** ON THE WYRM'S BACK: the floor is Ossmara's scaled back, her dorsal plates rising and falling as she flies, her wing
 *  beating behind, clouds tearing past below and around. */
function sky(C) {
  const { near, rand } = C;
  K.streetBase(C, { road: 'scales', curb: null });
  // her back curves away on both sides: rows of scales stepping down into the cloud
  for (const side of [1, -1]) for (let row = 0; row < 6; row++) for (let x = C.x0; x < C.x1; x += 1.1) near.add(prim('sphere', 7, 4), { x: x + (row % 2) * 0.55, y: -0.12 - row * row * 0.3, z: side * (RH + 0.35 + row * 0.75), sx: 0.62, sy: 0.16, sz: 0.55, rx: side * (0.35 + row * 0.18) }, ['#5e6c72', '#52606a', '#485660', '#3e4c56', '#36444e', '#2e3c46'][row], { jitter: 0.07, rand });
  // the dorsal plates behind the road, swaying with her wingbeat
  const n = Math.ceil((C.x1 - C.x0) / 4.5), plates = new THREE.InstancedMesh(prim('cone', 4), new THREE.MeshToonMaterial({ color: '#7a8a96', gradientMap: mat('batch').gradientMap }), n);
  plates.castShadow = !C.low; C.group.add(plates); C.disposables.push(plates.material);
  const base = Array.from({ length: n }, (_, i) => ({ x: C.x0 + i * 4.5, h: 4 + (i % 3 === 0 ? 2.5 : rand()) }));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new THREE.Vector3(), P = new THREE.Vector3();
  // the wing at her shoulders: bones fanning out of her back and a membrane between them, beating slowly
  const wing = new THREE.Group(), wx = C.L * 0.35; wing.position.set(wx, -1, -6.5); C.group.add(wing);
  const wm = new THREE.MeshToonMaterial({ color: '#4a5866', gradientMap: mat('batch').gradientMap, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), bmat = new THREE.MeshToonMaterial({ color: '#2e3a46', gradientMap: mat('batch').gradientMap });
  C.disposables.push(wm, bmat);
  const fan = [[-22, 16], [-12, 22], [-2, 24], [8, 20], [16, 14]], pos = [];
  for (const [fx, fy] of fan) { const bone = new THREE.Mesh(prim('cyl', 5), bmat); const L = Math.hypot(fx, fy); bone.scale.set(0.35, L, 0.35); bone.position.set(fx / 2, fy / 2, 0); bone.rotation.z = -Math.atan2(fx, fy); wing.add(bone); }
  for (let k = 0; k < fan.length - 1; k++) pos.push(0, 0, 0, ...fan[k], -1, ...fan[k + 1], -1);
  const memG = new THREE.BufferGeometry(); memG.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); memG.computeVertexNormals();
  wing.add(new THREE.Mesh(memG, wm)); C.disposables.push(memG);
  C.updates.push((dt, t, camX, quake) => {
    const beat = Math.sin(t * 0.9);
    for (let i = 0; i < n; i++) { const b = base[i], br = Math.sin(t * 0.9 - b.x * 0.05) * 0.3; E.set(0.12, 0, -0.3 + br * 0.15); Q.setFromEuler(E); P.set(b.x, b.h / 2 - 0.4 + br, -4.6); S.set(1.6, b.h, 0.45); M.compose(P, Q, S); plates.setMatrixAt(i, M); }
    plates.instanceMatrix.needsUpdate = true;
    wing.rotation.x = -0.35 + beat * 0.35; wing.position.y = -1 + beat * 1.2;
    C.group.position.y = Math.sin(t * 0.9) * 0.05 + (quake > 0 ? Math.sin(t * 22) * 0.04 : 0);
  });
  // clouds: a sea far below, banks racing past at her height
  const cm = new THREE.MeshBasicMaterial({ color: '#f4ece4', fog: true }), cm2 = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false, fog: true });
  C.disposables.push(cm, cm2);
  const cb = new Batch(80);
  for (let x = C.x0 - 120; x < C.x1 + 120; x += 9) cb.add(prim('sphere', 10, 6), { x, y: -14 + rand() * 4, z: -30 - rand() * 120, sx: 16 + rand() * 10, sy: 4 + rand() * 3, sz: 12 }, rand() < 0.5 ? '#f4ece4' : '#e4dcd8');
  for (let x = C.x0 - 60; x < C.x1 + 60; x += 7) cb.add(prim('sphere', 10, 6), { x, y: -9 + rand() * 3, z: 10 + rand() * 30, sx: 12 + rand() * 8, sy: 3 + rand() * 2, sz: 9 }, rand() < 0.5 ? '#f8f0e8' : '#ece4e0');   // and below her, in front
  C.group.add(cb.build(cm));
  const puffs = [];
  for (let k = 0; k < (C.low ? 10 : 24); k++) { const p = new THREE.Mesh(prim('sphere', 10, 6), cm2); p.scale.set(6 + rand() * 6, 1.6 + rand() * 1.5, 4); p.userData = { x: rand() * 120 - 60, y: -6 + rand() * 18, z: (rand() < 0.4 ? 1 : -1) * (12 + rand() * 30), s: 14 + rand() * 18 }; C.group.add(p); puffs.push(p); }
  C.updates.push((dt, t, camX) => { for (const p of puffs) { const u = p.userData; u.x -= u.s * dt; if (u.x < -70) u.x = 70; p.position.set(camX + u.x, u.y, u.z); } });
  windStreaks(C, 34, '#ffffff', 0.3, 26);
  C.ridge = null;
  env(C, [[0, '#2a4a8a'], [0.45, '#7aa0d8'], [0.8, '#f0d8b0'], [1, '#ffe8c0']], { fog: ['#e8e0e0', 50, 280], hemi: ['#d8e4ff', '#7a7068', 1.1], sun: ['#fff0d0', 2.6], sunDir: [-0.4, 0.7, 0.6], lamp: ['#ffb060', 0], exposure: 1.05 });
}

/** THE UNDERMAW'S PIT: the floor of the pit, a ring of roots and old teeth closing round, the heart's glow beating
 *  through the gaps, and one shaft of dawn coming down from the opening far above. */
function maw(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'roots', curb: null, backGround: '#2a1618', frontGround: '#2e181a', ground: 'rock' });
  K.scatter(C, C.x0 - 10, C.x1 + 10, 2.6, x => {
    const z = -7.5 - rand() * 4;
    if (rand() < 0.45) K.cone(near, x, -0.5, z, 0.9 + rand() * 0.8, 6 + rand() * 6, '#e8dcc0', 6, { rz: (rand() - 0.5) * 0.4, rx: 0.2 });       // teeth
    else near.add(prim('horn'), { x, y: -0.8, z, sx: 1.6 + rand(), sy: 8 + rand() * 6, sz: 1.6 + rand(), ry: Math.PI / 2 + (rand() - 0.5) }, rand() < 0.5 ? '#4a2a2a' : '#3a2024', { jitter: 0.08, rand });
  });
  K.scatter(C, C.x0 - 30, C.x1 + 30, 4, x => near.add(prim('horn'), { x, y: -2, z: -15 - rand() * 6, sx: 3, sy: 16 + rand() * 8, sz: 3, ry: Math.PI / 2 + (rand() - 0.5) }, '#2a161a'));
  K.scatter(C, C.x0, C.x1, 3, x => K.ball(near, x, 0.1, (rand() < 0.5 ? -1 : 1) * (RH + 0.6 + rand()), 0.5, '#4a2428', 1.4, 0.45, 0.8));
  K.scatter(C, C.x0, C.x1, 2.2, x => K.ball(glow, x, 0.05, RH + 0.8 + rand() * 2, 0.12, '#ff5a5a'));
  // the heart's glow through the gaps, beating; a shaft of dawn from far above
  for (let x = C.x0 + 20; x < C.x1; x += 40) pulseGlow(C, x, 3, -18, '#ff3a4a', 22, { rate: 1.1, depth: 0.35, opacity: 0.7 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 4.5, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffd8a0', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  shaft.position.set(C.L * 0.5, 18, -4); C.group.add(shaft); C.disposables.push(shaft.geometry, shaft.material);
  particles(C, { n: 90, color: '#ff8a7a', size: 0.16, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 5, z0: -8, z1: 3 }, rise: 0.5, life: 6, additive: true, opacity: 0.6 });
  void far;
  C.ridge = null;
  env(C, [[0, '#050102'], [0.55, '#1a0608'], [1, '#3a1014']], { fog: ['#2a0a0e', 14, 110], hemi: ['#ffb0a0', '#1a0a0a', 1.15], sun: ['#ffd0b0', 1.6], sunDir: [0.1, 0.95, 0.3], lamp: ['#ff5a4a', 7], exposure: 1.45 });
}

// ------------------------------------------------------------------------------------------------ Act III · free + seal
/** ASHFALL: the southern fields burning — black stubble, fires through the wheat, farmhouses alight, the mill burning at
 *  the end, smoke columns and embers, and her brood circling in the smoke. */
function ashfall(C) {
  const { near, far, rand } = C;
  K.streetBase(C, { road: 'ash', curb: '#4a4038', backGround: '#3a2e26', frontGround: '#3a3028', ground: 'litter' });
  const fl = [], smokeAt = [];
  for (let k = 0; k < 16; k++) { const fx = C.x0 + k * ((C.x1 - C.x0) / 16), fw = (C.x1 - C.x0) / 16 - 1; for (let r = 0; r < 6; r++) K.box(far, fx, -0.04, -9 - r * 1.5, fw, 0.16, 0.9, r % 2 ? '#2a2420' : '#5a4a2a'); }
  K.scatter(C, C.x0, C.x1, 3.5, x => { const z = -6 - rand() * 12; fl.push([x, 0, z, 0.8 + rand() * 1.2]); if (rand() < 0.3) smokeAt.push([x, 1.5, z]); });
  K.scatter(C, C.x0, C.x1, 6, x => fl.push([x, 0, RH + 1 + rand() * 2.5, 0.5 + rand() * 0.4]));
  // farmhouses, some burning; the mill at the end
  let x = C.x0 + 10;
  while (x < C.L - 30) {
    const w = 4.5 + rand() * 2;
    K.house(C, x, -14 - rand() * 4, { w, h: 2.6, wall: '#6a5a48', roof: '#3a2a22', roofH: 1.6, timber: '#2a1e16', lit: '#ff8a3a' });
    if (rand() < 0.7) { fl.push([x - w * 0.2, 3.2, -15, 1.6], [x + w * 0.25, 3.0, -15, 1.3]); smokeAt.push([x, 4, -15]); }
    x += 18 + rand() * 14;
  }
  const mx = C.L - 14, mz = -9;
  const tower = K.cyl(near, mx, -K.SINK, mz, 2.2, 8 + K.SINK, '#6a5e50', 10);
  K.building(C, 'mill', tower, K.cone(near, mx, 8, mz, 2.7, 3, '#2a1e18', 10));
  const sails = new THREE.Group(); sails.position.set(mx, 6.8, mz + 2.4); C.group.add(sails);
  const sm = new THREE.MeshToonMaterial({ color: '#3a2a20', gradientMap: mat('batch').gradientMap }); C.disposables.push(sm);
  for (let k = 0; k < 4; k++) { const a = new THREE.Mesh(prim('box'), sm); a.scale.set(0.3, 6, 0.08); a.position.set(Math.sin(k * Math.PI / 2) * 3, Math.cos(k * Math.PI / 2) * 3, 0); a.rotation.z = -k * Math.PI / 2; sails.add(a); }
  C.updates.push(dt => { sails.rotation.z -= dt * 0.35; });
  fl.push([mx, 8.5, mz, 2.4], [mx + 1, 4, mz + 1.8, 1.4]); smokeAt.push([mx, 10, mz]);
  fires(C, fl);
  particles(C, { n: 140, color: '#2a2420', size: 4.5, sources: smokeAt, area: null, rise: 3, life: 6, opacity: 0.45, sway: 1.5 });
  particles(C, { n: 160, color: '#ff9a3a', size: 0.16, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 4, z0: -14, z1: 4 }, rise: 1.6, life: 4, additive: true, opacity: 0.9, sway: 1.2 });
  farFlyer(C, { color: '#1e1414', size: 5, y: 28, z: -110, r: 60, speed: 0.15 });
  farFlyer(C, { color: '#221616', size: 3, y: 22, z: -80, r: 40, speed: -0.2 });
  K.scatter(C, C.x0 - 60, C.x1 + 60, 26, xx => K.hill(C, far, xx, -90 - rand() * 50, 30 + rand() * 25, 8 + rand() * 6, '#3a2a22'));
  C.ridge = null;
  env(C, [[0, '#1a0a08'], [0.45, '#5a2010'], [0.78, '#c85a20'], [1, '#f0a050']], { fog: ['#8a4a2a', 25, 200], hemi: ['#ffc090', '#3a2018', 1.1], sun: ['#ff9a50', 2.4], sunDir: [0.5, 0.5, 0.6], lamp: ['#ff8a3a', 6], exposure: 1.15 });
  K.clouds(C, '#5a3020', 9);
}

/** THE BELL FOUNDRY: a yard of brick casting halls with furnace mouths, molten bronze running in channels, great bells
 *  hanging in timber frames, a casting pit glowing. */
function foundry(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'bronze', curb: '#4a3a30', backGround: '#2e2620', frontGround: '#322a22', ground: 'stone' });
  const fl = [], smokeAt = [];
  let x = C.x0 + 4, i = 0;
  while (x < C.x1 + 10) {
    if (i % 2 === 0) {
      const w = 12 + rand() * 5, h = 6 + rand() * 1.5;
      const wall = K.box(near, x + w / 2, -K.SINK, -10, w, h + K.SINK, 5, '#5a3a2e', { jitter: 0.05, rand });
      K.building(C, 'casting hall', wall, K.roof(near, x + w / 2, h, -10, w + 0.5, 2.2, 5.7, '#2a2420'));
      for (let k = 0; k < 3; k++) { const ax = x + w * (0.2 + k * 0.3); near.add(prim('arch'), { x: ax, y: 0, z: -7.48, sx: 2.6, sy: 3.4, sz: 0.4 }, '#4a2e24'); K.box(glow, ax, 0.05, -7.6, 1.6, 2.1, 0.04, '#ff7a20'); C.halos.push([ax, 1.4, -7.1, '#ff8a30', 3]); }
      K.cyl(near, x + w * 0.8, h, -11, 0.6, 6, '#3a2a22', 8); smokeAt.push([x + w * 0.8, h + 6, -11]);
      x += w + 2;
    } else {
      // a timber A-frame with a great bell hanging in it
      const r = 1.6 + rand() * 0.8, fh = r * 2.6 + 1.5;
      for (const s of [-1, 1]) { K.box(near, x + s * (r + 0.8), 0, -6.5, 0.4, fh, 0.4, '#4a3424', { rz: s * 0.08 }); }
      K.box(near, x, fh - 0.2, -6.5, r * 2 + 2.2, 0.45, 0.5, '#4a3424');
      bell(near, x, fh - 0.4 - r * 1.3, -6.5, r, rand() < 0.5 ? '#b0803a' : '#8a6a30');
      x += r * 2 + 8;
    }
    i++;
  }
  // molten bronze in a channel behind the curb and in casting pits
  K.box(glow, (C.x0 + C.x1) / 2, -0.02, -3.6, C.x1 - C.x0, 0.05, 0.45, '#ff8a20');
  for (let k = C.x0; k < C.x1; k += 4) C.halos.push([k, 0.4, -3.4, '#ff7a20', 1.6]);
  K.scatter(C, C.x0 + 10, C.x1, 30, xx => { K.cyl(near, xx, -0.05, -5, 1.6, 0.25, '#3a2a20', 14); K.cyl(glow, xx, 0.05, -5, 1.3, 0.22, '#ffa030', 14); pulseGlow(C, xx, 0.8, -4.6, '#ff8a20', 5, { rate: 0.4, depth: 0.2 }); fl.push([xx - 0.6, 0.25, -5, 0.5]); });
  fires(C, fl);
  particles(C, { n: 90, color: '#2a2018', size: 4, sources: smokeAt, rise: 2.6, life: 6, opacity: 0.4, sway: 1.2 });
  particles(C, { n: 120, color: '#ffb050', size: 0.14, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 3, z0: -7, z1: 2 }, rise: 1.8, life: 3, additive: true, opacity: 0.9 });
  void far;
  C.ridge = null;
  env(C, [[0, '#0e0806'], [0.6, '#3a1e12'], [1, '#7a3e1e']], { fog: ['#3a2216', 20, 160], hemi: ['#ffc8a0', '#2a1a12', 1.15], sun: ['#ffb070', 2.0], sunDir: [-0.3, 0.7, 0.6], lamp: ['#ff8a30', 8], exposure: 1.3 });
}

/** THE GREAT BELL TOWER IN THE STORM: the walk along the tower's top, battlements, round turrets, the Great Bell in its
 *  frame at the far end, rain driving through, lightning, and the land far below. */
function belltower(C) {
  const { near, far, glow, rand } = C;
  K.streetBase(C, { road: 'flag', curb: null });
  K.surface(C, C.x0 - 10, C.x1 + 10, -8.4, -RH, 0, 'tower top');
  K.box(near, (C.x0 + C.x1) / 2, -40, -3.2, C.x1 - C.x0 + 20, 39.95, 10.6, '#4a4e58');          // the tower itself, going down
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 20, 5.5).rotateX(-Math.PI / 2), new THREE.MeshToonMaterial({ color: '#5a5e68', gradientMap: mat('batch').gradientMap }));
  deck.position.set((C.x0 + C.x1) / 2, -0.01, -5.65); C.group.add(deck); C.disposables.push(deck.geometry, deck.material);
  // battlements: low in front (never hiding feet), merlons behind
  for (let x = C.x0; x < C.x1; x += 0.9) K.box(near, x, 0, RH + 0.3, 0.86, 0.5, 0.45, '#5a5e68', { jitter: 0.06, rand });
  for (let x = C.x0; x < C.x1; x += 1.6) { K.box(near, x, 0, -7.6, 1.55, 0.9, 0.5, '#585c66'); K.box(near, x, 0.9, -7.6, 0.8, 0.7, 0.5, '#585c66'); }
  // turrets and, at the end, the Great Bell in its frame
  K.scatter(C, C.x0 + 10, C.L - 40, 34, x => { const t = K.cyl(near, x, -K.SINK, -6, 1.6, 5 + K.SINK, '#626670', 10); K.building(C, 'turret', t, K.cone(near, x, 5, -6, 2.0, 3.2, '#2a3040', 10)); K.box(glow, x, 2.2, -4.42, 0.4, 0.8, 0.05, '#ffc070'); });
  const bx = C.L - 6;                 // just past the last fight's screen: it frames the closing scene, never the fight with her
  for (const s of [-1, 1]) K.box(near, bx + s * 4.2, 0, -5.8, 0.8, 9, 0.8, '#4a3a2a');
  K.box(near, bx, 9, -5.8, 9.2, 0.8, 1, '#4a3a2a');
  bell(near, bx, 3.8, -5.8, 2.8, '#c89a4a');
  C.marks = { bell: [bx, 5.4, -5.8] };
  K.box(near, bx, 3.5, -5.8, 0.25, 0.9, 0.25, '#3a2e20');
  // the land far below
  K.scatter(C, C.x0 - 120, C.x1 + 120, 14, x => K.hill(C, far, x, -100 - rand() * 80, 30 + rand() * 20, 6, rand() < 0.5 ? '#3a4a3a' : '#2e3e34'));
  // rain and lightning (a flash in the sky — no light is ever added or changed)
  const N = C.low ? 160 : 420, rp = new Float32Array(N * 6), seeds = Array.from({ length: N }, () => ({ x: rand() * 40 - 20, y: rand() * 14, z: -10 + rand() * 16, s: 16 + rand() * 6 }));
  const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: '#a8b8d0', transparent: true, opacity: 0.45 })); rain.frustumCulled = false; C.group.add(rain); C.disposables.push(rg, rain.material);
  const boltM = new THREE.MeshBasicMaterial({ color: '#e8f0ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(600, 120), boltM); sheet.position.set(0, 40, -200); C.group.add(sheet); C.disposables.push(sheet.geometry, boltM);
  let next = 3;
  C.updates.push((dt, t, camX) => {
    for (let i = 0; i < N; i++) { const s = seeds[i]; s.y -= s.s * dt; if (s.y < -1) s.y += 15; const x = camX + s.x + s.y * 0.15; rp.set([x, s.y, s.z, x - 0.12, s.y + 0.7, s.z], i * 6); }
    rg.attributes.position.needsUpdate = true;
    sheet.position.x = camX; next -= dt;
    if (next <= 0) { next = 3 + Math.random() * 5; boltM.opacity = 0.55; }
    boltM.opacity = Math.max(0, boltM.opacity - dt * 2.2);
  });
  K.clouds(C, '#2a3040', 14, 16, 40);
  C.ridge = null;
  env(C, [[0, '#0a0c14'], [0.5, '#1e2430'], [0.85, '#3a4452'], [1, '#4e5866']], { fog: ['#2a3240', 24, 200], hemi: ['#a8b4c8', '#2a2c30', 1.1], sun: ['#c8d4e8', 1.6], sunDir: [-0.3, 0.8, 0.5], lamp: ['#ffb060', 4], exposure: 1.3 });
}

// ------------------------------------------------------------------------------------------------ Act III · hold + crown
/** THE SIEGE OF HALVENHOLD: the city wall by day — towers, the gate, the Order's trebuchets and tents before it, green
 *  lantern-fire burning on the walls and in the grass. */
function siege(C) {
  const { near, far, rand } = C;
  K.streetBase(C, { road: 'dirt', curb: '#6a5a44', backGround: '#5a6a3a', frontGround: '#5e6e3c', ground: 'grass' });
  // the city wall, set back so its battlements and towers show against the sky
  K.box(near, (C.x0 + C.x1) / 2, -K.SINK, -26, C.x1 - C.x0 + 80, 8 + K.SINK, 3, '#948c7c', { jitter: 0.03, rand });
  for (let y = 1; y < 8; y += 1) K.box(near, (C.x0 + C.x1) / 2, y, -24.48, C.x1 - C.x0 + 80, 0.05, 0.05, '#7a7262');
  for (let x = C.x0 - 40; x < C.x1 + 40; x += 1.8) K.box(near, x, 8, -24.8, 1, 1, 0.8, '#8a8272');
  const green = [];
  K.scatter(C, C.x0, C.x1, 22, x => { const t = K.cyl(near, x, -K.SINK, -25, 2.6, 11 + K.SINK, '#a09888', 12); K.building(C, 'wall tower', t, K.cone(near, x, 11, -25, 3.1, 4.5, '#3a4a8a', 12)); if (rand() < 0.5) green.push([x + 1, 7, -22.4, 1.6]); });
  const gx = C.L * 0.5; near.add(prim('arch'), { x: gx, y: 0, z: -24.4, sx: 6, sy: 7, sz: 2 }, '#6a6254');
  // the Order's camp: trebuchets, tents, stakes; green fire in the grass and on the wall
  K.scatter(C, C.x0 + 6, C.x1, 26, x => {
    const z = -7.5;
    for (const s of [-1, 1]) K.box(near, x + s * 1.2, 0, z, 0.3, 3.4, 2.2, '#5a4028', { rz: s * 0.15 });
    K.box(near, x, 3.2, z, 0.3, 0.3, 2.4, '#4a3420'); K.box(near, x - 1.2, 3.3, z, 6, 0.22, 0.22, '#5a4028', { rz: 0.5 }); K.box(near, x - 3.3, 1.6, z, 0.7, 0.7, 0.7, '#3a3028');
  });
  K.scatter(C, C.x0 + 18, C.x1, 26, x => { const z = -4.8; K.cone(near, x, 0, z, 1.3, 2, rand() < 0.5 ? '#c8d0a8' : '#d8d0b8', 4, { ry: Math.PI / 4 }); });
  K.scatter(C, C.x0, C.x1, 1.4, x => K.box(near, x, 0, RH + 1.2, 0.12, 0.55, 0.12, '#5a4028', { rx: 0.4 }));
  K.scatter(C, C.x0, C.x1, 8, x => green.push([x, 0, -10 - rand() * 3, 0.9 + rand() * 0.8]));
  K.scatter(C, C.x0, C.x1, 14, x => green.push([x, 0, RH + 2 + rand() * 2, 0.6]));
  fires(C, green, ['#3aff6a', '#e0ffc0']);
  particles(C, { n: 120, color: '#3a5a3a', size: 4, sources: green.filter((_, i) => i % 2 === 0).map(([x, y, z, s]) => [x, y + s * 1.5, z]), rise: 2.4, life: 6, opacity: 0.35, sway: 1.4 });
  particles(C, { n: 80, color: '#8aff9a', size: 0.14, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 5, z0: -12, z1: 4 }, rise: 1.4, life: 4, additive: true, opacity: 0.9 });
  K.scatter(C, C.x0 - 60, C.x1 + 60, 26, x => K.hill(C, far, x, -90 - rand() * 50, 30 + rand() * 25, 8 + rand() * 6, '#6a7a4a'));
  C.ridge = null;
  env(C, [[0, '#5a7aa8'], [0.5, '#a8b8b8'], [0.85, '#c8d0b0'], [1, '#d8d8b8']], { fog: ['#a8b8a0', 35, 240], hemi: ['#e0e8f0', '#5a5a3a', 1.1], sun: ['#fff0d0', 2.5], sunDir: [-0.5, 0.7, 0.6], lamp: ['#5aff7a', 0], exposure: 1.05 });
  K.clouds(C, '#c8d0c0', 10);
}

/** MILLBROOK BARS THE GATE: home at night — the village street barricaded with carts, crates and stakes, torches on
 *  poles, every window lit. */
function village_night(C) {
  K.village(C);
  const { near, rand } = C, fl = [];
  K.scatter(C, C.x0 + 14, C.x1 - 20, 15, x => {
    const z = -3.6 - rand() * 0.5;
    if (rand() < 0.5) { K.box(near, x, 0.35, z, 2.2, 0.7, 1, '#6a4a2a', { ry: (rand() - 0.5) * 0.3 }); for (const s of [-1, 1]) K.cyl(near, x + s * 0.8, 0.35, z + 0.55, 0.35, 0.08, '#3a2818', 10, { rx: Math.PI / 2 }); }
    else for (let k = 0; k < 3; k++) K.box(near, x + (k - 1) * 0.75, k === 1 ? 0.7 : 0, z, 0.7, 0.7, 0.7, '#8a6038', { ry: rand() * 0.4 });
    for (let k = 0; k < 4; k++) K.box(near, x - 1.2 + k * 0.8, 0, z + 0.9, 0.1, 1.2, 0.1, '#5a3e24', { rx: 0.5 });
  });
  K.scatter(C, C.x0 + 8, C.x1, 9, x => { K.cyl(near, x, 0, -3.4, 0.06, 2.2, '#2a2018', 5); fl.push([x, 2.2, -3.4, 0.45]); });
  fires(C, fl);
  C.ridge = null;
  C.env = { ...C.env, sky: skyTex([[0, '#03050c'], [0.55, '#0e1428'], [0.85, '#22305a'], [1, '#3a4870']]), fog: ['#1a2238', 25, 200], hemi: ['#8a9ad8', '#2a2420', 1.0], sun: ['#a8b8ff', 1.4], sunDir: [0.3, 0.8, 0.5], lamp: ['#ffa040', 7], exposure: 1.35 };
}

/** INSIDE THE LANTERN: a void of green flame — a floor of green glass, flame tongues rising far off, chains and glass
 *  shards drifting, the giant black wick at the end. */
function lanternvoid(C) {
  const { near, glow, rand } = C;
  K.streetBase(C, { road: 'void', curb: null });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(C.x1 - C.x0 + 400, 300).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#0a2412', transparent: true, opacity: 0.85, fog: true }));
  floor.position.set((C.x0 + C.x1) / 2, -0.03, -100); C.group.add(floor); C.disposables.push(floor.geometry, floor.material);
  K.surface(C, C.x0 - 200, C.x1 + 200, -250, 50, -0.03, 'glass');
  for (let x = C.x0; x < C.x1 + 40; x += 6) K.box(glow, x, -0.02, -40, 0.06, 0.01, 120, '#2a8a4a');                     // the glass's seams
  // flame tongues far off, breathing
  const tongues = [];
  for (let x = C.x0 - 60; x < C.x1 + 60; x += 14) tongues.push([x + rand() * 6, -0.5, -45 - rand() * 40, 6 + rand() * 6]);
  fires(C, tongues, ['#1aff5a', '#c8ffd0'], false);
  for (const [x, , z, s] of tongues) if (rand() < 0.5) pulseGlow(C, x, s * 0.5, z, '#3aff6a', s * 2.2, { rate: 0.3 + rand() * 0.3 });
  // drifting chains and glass shards
  const drift = new THREE.Group(); C.group.add(drift);
  const chainM = new THREE.MeshToonMaterial({ color: '#2a3a30', gradientMap: mat('batch').gradientMap }), shardM = new THREE.MeshBasicMaterial({ color: '#7aff9a', transparent: true, opacity: 0.75, fog: true });
  C.disposables.push(chainM, shardM);
  const items = [];
  for (let k = 0; k < (C.low ? 18 : 40); k++) {
    const g = new THREE.Group(), chain = rand() < 0.4;
    if (chain) for (let j = 0; j < 5; j++) { const l = new THREE.Mesh(prim('torus', 0.25, 8), chainM); l.scale.setScalar(0.35); l.position.y = j * 0.55; l.rotation.y = j % 2 ? Math.PI / 2 : 0; g.add(l); }
    else { const s = new THREE.Mesh(prim('box'), shardM); s.scale.set(0.08, 0.5 + rand(), 0.3 + rand() * 0.4); g.add(s); }
    g.userData = { x: C.x0 + rand() * (C.x1 - C.x0), y: 2 + rand() * 9, z: -5 - rand() * 20, r: rand() * 6, s: 0.3 + rand() * 0.5 };
    drift.add(g); items.push(g);
  }
  C.updates.push((dt, t) => { for (const g of items) { const u = g.userData; g.position.set(u.x + Math.sin(t * 0.2 + u.r) * 2, u.y + Math.sin(t * u.s + u.r) * 0.8, u.z); g.rotation.set(t * 0.1 * u.s, t * 0.2 + u.r, Math.sin(t * 0.3 + u.r) * 0.4); } });
  // the wick: a great black cord at the end with the flame on it
  const wx = C.L - 16;
  K.cyl(near, wx, -0.1, -16, 0.9, 10, '#141414', 10); fires(C, [[wx, 10, -16, 4]], ['#3aff6a', '#f0fff0']); pulseGlow(C, wx, 12, -15.5, '#5aff7a', 16, { rate: 0.8, depth: 0.25 });
  particles(C, { n: 140, color: '#7aff9a', size: 0.2, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 8, z0: -14, z1: 4 }, rise: 1.2, life: 6, additive: true, opacity: 0.8, sway: 1.2 });
  C.ridge = null;
  env(C, [[0, '#010402'], [0.5, '#041a0a'], [0.85, '#0e4a1e'], [1, '#1e8a3a']], { fog: ['#06200e', 18, 160], hemi: ['#9affb0', '#041008', 1.2], sun: ['#c8ffd0', 1.6], sunDir: [-0.2, 0.9, 0.5], lamp: ['#3aff6a', 8], exposure: 1.45 });
}

// ------------------------------------------------------------------------------------------------ Act III · hold + break
/** THE HOLLOW FELLS: windswept highlands — rolling fells, purple heather burning in patches, drystone walls, standing
 *  stones, and the great broken links of her chain lying across the hillsides. */
function highlands(C) {
  const { near, far, rand } = C;
  K.streetBase(C, { road: 'dirt', curb: '#6a6458', backGround: '#5a4a56', frontGround: '#5e4e58', ground: 'grass' });
  const fl = [], smokeAt = [];
  K.scatter(C, C.x0, C.x1, 1.6, x => { const z = -3.8 - rand() * 4; K.ball(near, x, 0.25, z, 0.5 + rand() * 0.3, rand() < 0.5 ? '#7a4a7a' : '#6a3a6a', 1.3, 0.55, 0.9, { jitter: 0.08, rand }); if (rand() < 0.12) { fl.push([x, 0.3, z, 0.7]); smokeAt.push([x, 1.2, z]); } });
  K.scatter(C, C.x0, C.x1, 2.4, x => K.ball(near, x, 0.15, RH + 0.8 + rand() * 2, 0.4, '#7a4a7a', 1.3, 0.5, 0.9));
  for (let x = C.x0; x < C.x1; x += 0.7) K.rock(C, near, x, 0, -9 + Math.sin(x * 0.05) * 1.5, 0.35, '#7a7468');          // a drystone wall
  // the broken chain: giant links half-sunk on the slopes
  K.scatter(C, C.x0, C.x1, 28, x => { const z = -12 - rand() * 8; for (let k = 0; k < 3; k++) near.add(prim('torus', 0.22, 12), { x: x + k * 2.4, y: 0.6 + (k % 2) * 0.3, z, s: 1.6, rx: Math.PI / 2 - 0.3 + (k % 2) * 0.9, ry: k * 0.3 }, '#5a4a3a'); });
  K.scatter(C, C.x0, C.x1, 33, x => { const z = -7 - rand() * 3; for (let k = 0; k < 3; k++) K.box(near, x + k * 1.3, 0, z + (k - 1) * 0.6, 0.8, 2.6 + rand(), 0.6, '#8a8478', { rz: (rand() - 0.5) * 0.15 }); });
  K.scatter(C, C.x0 - 60, C.x1 + 60, 18, x => K.hill(C, near, x, -24 - rand() * 10, 22 + rand() * 12, 6 + rand() * 4, rand() < 0.5 ? '#5a4a5a' : '#4e4250'));
  K.scatter(C, C.x0 - 80, C.x1 + 80, 26, x => K.hill(C, far, x, -80 - rand() * 50, 34 + rand() * 25, 9 + rand() * 6, '#3e3644'));
  fires(C, fl);
  particles(C, { n: 70, color: '#3a3438', size: 3.5, sources: smokeAt.length ? smokeAt : [[C.L / 2, 1, -6]], rise: 2.2, life: 5, opacity: 0.35, sway: 2.2 });
  windStreaks(C, 26, '#e8e0f0', 0.22, 20);
  C.ridge = null;
  env(C, [[0, '#3a4250'], [0.5, '#7a8290'], [0.85, '#a8a8b0'], [1, '#c0bcc0']], { fog: ['#8a8a94', 30, 220], hemi: ['#d8dce8', '#4a3e48', 1.1], sun: ['#e8e4f0', 2.0], sunDir: [-0.4, 0.7, 0.6], lamp: ['#ffb060', 0], exposure: 1.1 });
  K.clouds(C, '#9a9aa4', 14);
}

/** WRAITHLIGHT ABBEY: Greyspire at night, all ghost-green — the dead Order's wisps drifting in the cloister. */
function abbey_wraith(C) {
  K.abbey(C);
  particles(C, { n: 90, color: '#7affa0', size: 0.3, area: { x0: C.x0, x1: C.x1, y0: 0.4, y1: 5, z0: -8, z1: 3 }, rise: 0.3, life: 7, additive: true, opacity: 0.8, sway: 1.6 });
  mistBands(C, '#7affa0', [[-5.5, 0.6, 0.2, 3], [-11, 1.4, 0.28, 5]]);
  C.ridge = null;
  C.env = { ...C.env, sky: skyTex([[0, '#010402'], [0.5, '#06140c'], [0.85, '#123a22'], [1, '#1e5a32']]), fog: ['#0a2414', 18, 150], hemi: ['#7ad8a0', '#0a100c', 0.85], sun: ['#9ae8b8', 0.9], lamp: ['#7affa0', 10], exposure: 1.05 };
}

/** THE BURNING CROWN: Crownhollow on fire — the horn spires blackened, fires along the crown's ridges, smoke and embers,
 *  the last chain glowing. */
function crown_burning(C) {
  K.crown(C);
  const fl = [], smokeAt = [];
  K.scatter(C, C.x0, C.x1, 5, x => { const z = -4.6 - C.rand() * 6; fl.push([x, 0, z, 0.8 + C.rand() * 1.2]); if (C.rand() < 0.35) smokeAt.push([x, 2, z]); });
  K.scatter(C, C.x0, C.x1, 9, x => fl.push([x, 0, RH + 1.2 + C.rand() * 1.4, 0.5]));
  fires(C, fl);
  particles(C, { n: 140, color: '#2a1a14', size: 4.5, sources: smokeAt, rise: 3, life: 6, opacity: 0.45, sway: 1.5 });
  particles(C, { n: 160, color: '#ffa040', size: 0.16, area: { x0: C.x0, x1: C.x1, y0: 0, y1: 5, z0: -12, z1: 4 }, rise: 1.6, life: 4, additive: true, opacity: 0.9 });
  C.ridge = null;
  C.env = { ...C.env, sky: skyTex([[0, '#140404'], [0.45, '#4a1208'], [0.78, '#b84a18'], [1, '#f08a30']]), fog: ['#6a2a14', 25, 200], hemi: ['#ffb080', '#3a1a10', 1.1], sun: ['#ff9a50', 2.3], lamp: ['#ff8a3a', 8], exposure: 1.15 };
}

export const ACT_THEMES = {
  rift, underway, lake, kingsway, marsh, kiln, capital, sky, maw, ashfall, foundry, belltower, siege, village_night,
  lanternvoid, highlands, abbey_wraith, crown_burning,
};
