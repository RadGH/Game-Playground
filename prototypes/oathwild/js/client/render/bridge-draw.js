// Oathwild — draws every bridge from its plan (js/world/bridge-plan.js: the same data the tests check against the
// walked deck, lessons rule 22). Owner report #129 (2026-11-25): "Bridge looks MVP. It is not even textured."
//
// Each bridge is a handful of meshes: its boards / stones merged per material (wood, masonry, paving), each painted
// with a texture made here (planks with grain and knots, coursed ashlar with mortar and moss, worn flagstones) and
// mapped in metres so a board is a board wherever it is; each part shaded a little differently (vertex colour) so no
// two planks match. Newel posts and lantern posts are Kenney Fantasy Town pieces (CC0) through town-draw.js's loader
// and painted palette.
//
//   const bridges = createBridgeView({ T, tileGroup, quality })
//   bridges.stats   { bridges, meshes, triangles }      bridges.ready  (a promise: the Kenney pieces are in)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bridgePlan } from '../../world/bridge-plan.js';
import { kenneyPiece, kenneyPaletteImage, kenneyPalette } from './town-draw.js';

// metres covered by one repeat of each texture: [along the grain, across it]
const TILE = { wood: [1.6, 0.4], stone: [2.4, 1.6], paving: [2.5, 2.5] };
// Kenney's palette cells → our swatches (town-draw.js SWATCH: 8 stone, 9 dark stone, 10 dark oak, 11 oak)
const KIT_UV = { '3,2': [8, 0], '15,3': [8, 0], '9,3': [11, 0], '11,3': [10, 0] };   // (Kenney's dark stone read as black bands: plain stone)

// ---------------------------------------------------------------- textures (drawn once)
function seeded(seed) { let a = seed >>> 0 || 1; return () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; return ((a >>> 0) % 100000) / 100000; }; }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const shade = (hex, l, s = 0) => '#' + new THREE.Color(hex).offsetHSL(0, s, l).getHexString();
function woodTexture() {
  return canvasTex(512, 128, (x, w, h) => {
    const r = seeded(11);
    x.fillStyle = '#86603d'; x.fillRect(0, 0, w, h);
    // two boards side by side across the repeat, each its own tone
    for (const [y0, l] of [[0, 0.02], [h / 2, -0.03]]) { x.fillStyle = shade('#86603d', l); x.fillRect(0, y0, w, h / 2); }
    // grain: long wavy streaks along u
    for (let i = 0; i < 90; i++) {
      const y = r() * h, a = 0.08 + r() * 0.18, dark = r() < 0.7;
      x.strokeStyle = dark ? `rgba(52,32,18,${a})` : `rgba(196,150,100,${a * 0.8})`; x.lineWidth = 0.6 + r() * 1.6;
      x.beginPath(); const amp = 0.5 + r() * 2.5, f = 0.01 + r() * 0.03, ph = r() * 6;
      for (let u = 0; u <= w; u += 8) { const yy = y + Math.sin(u * f + ph) * amp; u ? x.lineTo(u, yy) : x.moveTo(u, yy); }
      x.stroke();
    }
    // knots with the grain bending round them
    for (let k = 0; k < 4; k++) {
      const cx = r() * w, cy = 8 + r() * (h - 16), rx = 5 + r() * 7, ry = 2.5 + r() * 3;
      for (let j = 4; j >= 0; j--) { x.fillStyle = `rgba(60,36,20,${0.12 + 0.1 * (4 - j)})`; x.beginPath(); x.ellipse(cx, cy, rx + j * 3, ry + j * 1.4, 0, 0, Math.PI * 2); x.fill(); }
    }
    // board seams + a soft worn highlight
    x.fillStyle = 'rgba(30,18,10,.55)'; x.fillRect(0, 0, w, 2); x.fillRect(0, h / 2 - 1, w, 2);
    x.fillStyle = 'rgba(255,230,190,.06)'; x.fillRect(0, 3, w, h / 2 - 6);
  });
}
function blocks(x, w, h, r, rows, base, { minL, maxL, mortar, moss = 0 }) {
  x.fillStyle = mortar; x.fillRect(0, 0, w, h);
  const rh = h / rows;
  for (let row = 0; row < rows; row++) {
    let u = -r() * maxL;
    while (u < w) {
      const L = minL + r() * (maxL - minL), y = row * rh;
      const tone = shade(base, (r() - 0.5) * 0.12, (r() - 0.5) * 0.06);
      const draw = du => {
        const X = u + du + 2, Y = y + 2, BW = L - 4, BH = rh - 4;
        x.fillStyle = tone; x.fillRect(X, Y, BW, BH);
        x.fillStyle = 'rgba(255,255,255,.10)'; x.fillRect(X, Y, BW, 3); x.fillRect(X, Y, 3, BH);   // lit top / left edge
        x.fillStyle = 'rgba(0,0,0,.16)'; x.fillRect(X, Y + BH - 3, BW, 3); x.fillRect(X + BW - 3, Y, 3, BH);
        for (let i = 0; i < BW * BH / 40; i++) { x.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.06)'; x.fillRect(X + r() * BW, Y + r() * BH, 1 + r() * 2, 1 + r() * 2); }
        if (r() < moss) { x.fillStyle = 'rgba(86,112,52,.35)'; x.beginPath(); x.ellipse(X + r() * BW, Y + BH, BW * (0.2 + r() * 0.3), BH * 0.35, 0, Math.PI, 0); x.fill(); }
      };
      draw(0); if (u + L > w) draw(-w);                              // wrap round so the repeat has no seam
      u += L;
    }
  }
}
const stoneTexture = () => canvasTex(512, 512, (x, w, h) => blocks(x, w, h, seeded(23), 4, '#8d857a', { minL: 90, maxL: 190, mortar: '#5a544b', moss: 0.12 }));
const pavingTexture = () => canvasTex(512, 512, (x, w, h) => {
  blocks(x, w, h, seeded(37), 5, '#857d70', { minL: 100, maxL: 205, mortar: '#4d483f' });
  // cart ruts worn paler down the middle
  const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(230,220,200,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});

// ---------------------------------------------------------------- geometry helpers
const AX = ['x', 'y', 'z'];
/** Texture coordinates in metres: each face is mapped on its two own axes, the grain axis along u. */
function metricUV(geo, grain, mat, off = [0, 0]) {
  const P = geo.attributes.position, N = geo.attributes.normal, n = P.count, uv = new Float32Array(n * 2);
  const [tu, tv] = TILE[mat], g = AX.indexOf(grain || 'z');
  for (let i = 0; i < n; i++) {
    const nn = [Math.abs(N.getX(i)), Math.abs(N.getY(i)), Math.abs(N.getZ(i))];
    const d = nn[0] >= nn[1] && nn[0] >= nn[2] ? 0 : nn[1] >= nn[2] ? 1 : 2;
    const rest = [0, 1, 2].filter(a => a !== d);
    let ua = rest[0], va = rest[1];
    if (rest.includes(g)) { ua = g; va = rest.find(a => a !== g); }
    else if (d !== 1 && rest.includes(1)) { ua = rest.find(a => a !== 1); va = 1; }   // vertical faces: courses run level
    const c = [P.getX(i), P.getY(i), P.getZ(i)];
    uv[i * 2] = c[ua] / tu + off[0]; uv[i * 2 + 1] = c[va] / tv + off[1];
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function tinted(geo, t) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3).fill(t);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const E = new THREE.Euler(), Q = new THREE.Quaternion(), M = new THREE.Matrix4(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1);
function partGeometry(q, i) {
  const [sx, sy, sz] = q.size;
  let geo = q.shape === 'cyl' ? new THREE.CylinderGeometry(sx / 2 * 0.92, sx / 2, sy, 9, 1) : new THREE.BoxGeometry(sx, sy, sz);
  geo = geo.toNonIndexed();
  metricUV(geo, q.grain, q.mat, [(i * 0.37) % 1, (i * 0.61) % 1]);
  tinted(geo, q.tint ?? 1);
  E.set(...(q.rot || [0, 0, 0])); Q.setFromEuler(E);
  M.compose(V.set(...q.at), Q, S1); geo.applyMatrix4(M);
  return geo;
}
function bodyGeometry(body) {
  const shape = new THREE.Shape(body.profile.map(([z, y]) => new THREE.Vector2(z, y)));
  let geo = new THREE.ExtrudeGeometry(shape, { depth: body.x1 - body.x0, bevelEnabled: false, curveSegments: 1 });
  geo.rotateY(-Math.PI / 2);                                       // shape x → local z, extrusion → local −x
  geo.translate(body.x1, 0, 0);
  geo = geo.toNonIndexed(); geo.computeVertexNormals();
  metricUV(geo, 'z', 'stone');
  return tinted(geo, 1);
}
function remapUV(g) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i), v = uv.getY(i), cu = Math.floor(u * 16), cv = Math.floor(v * 4), to = KIT_UV[cu + ',' + cv];
    if (to) uv.setXY(i, u + (to[0] - cu) / 16, v + (to[1] - cv) / 4);
  }
  return g;
}

// ---------------------------------------------------------------- the view
export function createBridgeView({ T, tileGroup }) {
  const mats = {
    wood: new THREE.MeshLambertMaterial({ map: woodTexture(), vertexColors: true }),
    stone: new THREE.MeshLambertMaterial({ map: stoneTexture(), vertexColors: true }),
    paving: new THREE.MeshLambertMaterial({ map: pavingTexture(), vertexColors: true }),
  };
  for (const [k, m] of Object.entries(mats)) m.name = 'bridge ' + k;
  const stats = { bridges: 0, meshes: 0, triangles: 0 };
  const kitJobs = [];
  for (const b of T.bridges) {
    if (b.kind !== 'bridge') continue;
    const plan = bridgePlan(T, b);
    const g = new THREE.Group(); g.name = b.name || b.id;
    g.position.set(plan.frame.mid[0], 0, plan.frame.mid[1]); g.rotation.y = plan.frame.yaw;
    const byMat = { wood: [], stone: [], paving: [] };
    plan.parts.forEach((q, i) => byMat[q.mat].push(partGeometry(q, i)));
    if (plan.body) byMat.stone.push(bodyGeometry(plan.body));
    for (const [m, list] of Object.entries(byMat)) {
      if (!list.length) continue;
      const geo = mergeGeometries(list); list.forEach(x => x.dispose());
      const mesh = new THREE.Mesh(geo, mats[m]); mesh.name = `${g.name} ${m}`;
      mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
      stats.meshes++; stats.triangles += geo.attributes.position.count / 3;
    }
    tileGroup(plan.frame.mid[0], plan.frame.mid[1]).add(g);
    stats.bridges++;
    if (plan.kit.length) kitJobs.push([g, plan.kit]);
  }
  // Kenney newels and lantern posts, one merged mesh per bridge on the town kit's painted palette
  const ready = (async () => {
    if (!kitJobs.length) return;
    const img = await kenneyPaletteImage('town');
    const mat = new THREE.MeshLambertMaterial({ map: kenneyPalette(img) }); mat.name = 'bridge kit';
    const ids = [...new Set(kitJobs.flatMap(([, k]) => k.map(p => p.id)))];
    const src = Object.fromEntries(await Promise.all(ids.map(async id => [id, await kenneyPiece('town', id)])));
    for (const [g, kit] of kitJobs) {
      const list = [];
      for (const p of kit) {
        if (!src[p.id]) continue;
        const geo = remapUV(src[p.id].clone());
        const s = Array.isArray(p.scale) ? p.scale : [p.scale, p.scale, p.scale];
        E.set(0, p.yaw || 0, 0); Q.setFromEuler(E);
        geo.applyMatrix4(M.compose(V.set(...p.at), Q, new THREE.Vector3(...s)));
        list.push(geo);
      }
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), mat); mesh.name = g.name + ' kit';
      mesh.castShadow = mesh.receiveShadow = true; g.add(mesh);
      stats.meshes++; stats.triangles += mesh.geometry.attributes.position.count / 3;
    }
  })().catch(e => console.warn('bridge kit pieces', e));
  stats.triangles = Math.round(stats.triangles);
  return { stats, ready };
}
