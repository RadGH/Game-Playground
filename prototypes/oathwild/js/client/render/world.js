// The world drawn from the same data the server walks (lessons rule 22): the ground mesh is js/world/terrain.js's own
// height grid cut with its meshIndex rule, water from its water grid, roads from its road lines (draped on the ground),
// bridge decks at their deck height, props from data/placements.json, trees and decor from js/world/scatter.js.
// Everything is cut into 128 m tiles so the camera only draws what is near (fog hides the edge).
//
// Art: data/art.json. A "ready" scenery piece loads its GLB (avatar-3d/fal models); a "placeholder" is drawn as the
// shape art.json gives (box / cylinder / cone / house / rock / tree) at its real size and colour.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BIOMES } from '../../world/terrain.js';

const TILE = 128;
const ROOT = new URL('../../../../../', import.meta.url);     // the playground folder
const loader = new GLTFLoader();
const glbCache = new Map();
const glb = file => { if (!glbCache.has(file)) glbCache.set(file, loader.loadAsync(new URL(file, ROOT).href)); return glbCache.get(file); };

// painted ground palette (warmer and softer than the preview map's)
const GROUND = {
  meadow: '#7fae55', wildgrass: '#6a9a4c', forest: '#4f7d3c', field: '#cdb06a', village: '#a99474', road: '#b79a70', trail: '#a68c64',
  boardwalk: '#8a6a46', water: '#5e8a7a', shore: '#c2b48a', marsh: '#64805a', rock: '#8e877a',
};
const GROUND_RGB = Object.fromEntries(Object.entries(GROUND).map(([k, v]) => [k, new THREE.Color(v)]));
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

export function createWorldView(view, { T, placements, art, scattered, book, quality = 'medium' }) {
  const scene = view.scene;
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const tiles = new Map();          // "i,k" -> Group
  const tileOf = (x, z) => `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
  function tileGroup(x, z) {
    const k = tileOf(x, z);
    if (!tiles.has(k)) { const g = new THREE.Group(); g.name = 'tile ' + k; const [i, j] = k.split(',').map(Number); g.userData.cx = (i + 0.5) * TILE; g.userData.cz = (j + 0.5) * TILE; root.add(g); tiles.set(k, g); }
    return tiles.get(k);
  }
  const artById = new Map((art.scenery || []).map(a => [a.id, a]));

  // ---------------------------------------------------------------- ground
  const G = T.grid, BG = T.biomeGrid;
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const biomeAtVertex = (x, z) => {
    const i = Math.min(BG.nx - 1, Math.max(0, Math.floor((x - BG.minX) / BG.cell))), k = Math.min(BG.nz - 1, Math.max(0, Math.floor((z - BG.minZ) / BG.cell)));
    return BIOMES[BG.ids[k * BG.nx + i]];
  };
  const tmp = new THREE.Color(), rockC = GROUND_RGB.rock;
  const stepCells = TILE / G.cell;
  for (let k0 = 0; k0 < G.nz - 1; k0 += stepCells) for (let i0 = 0; i0 < G.nx - 1; i0 += stepCells) {
    const i1 = Math.min(G.nx - 1, i0 + stepCells), k1 = Math.min(G.nz - 1, k0 + stepCells);
    const w = i1 - i0 + 1, h = k1 - k0 + 1;
    const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const o = ((k - k0) * w + (i - i0)) * 3;
      const x = G.minX + i * G.cell, z = G.minZ + k * G.cell;
      pos[o] = x; pos[o + 1] = G.heights[k * G.nx + i]; pos[o + 2] = z;
      const b = biomeAtVertex(x, z);
      tmp.copy(GROUND_RGB[b] || GROUND_RGB.meadow);
      const slope = T.slopeAt(x, z);
      if (slope > 24 && b !== 'road' && b !== 'trail') tmp.lerp(rockC, Math.min(1, (slope - 24) / 14));
      const n = hash(Math.floor(x / 6), Math.floor(z / 6)) * 0.12 + hash(x, z) * 0.06 - 0.09;
      tmp.offsetHSL(0, 0, n);
      col[o] = tmp.r; col[o + 1] = tmp.g; col[o + 2] = tmp.b;
    }
    // the triangle cut of js/world/terrain.js meshIndex (GRID SPLIT): (i,k)(i,k+1)(i+1,k) and (i+1,k)(i,k+1)(i+1,k+1)
    const idx = new Uint32Array((w - 1) * (h - 1) * 6);
    let o = 0;
    for (let k = 0; k < h - 1; k++) for (let i = 0; i < w - 1; i++) {
      const a = k * w + i, b = a + 1, c = a + w, d = c + 1;
      idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true; mesh.name = 'ground';
    tileGroup(G.minX + (i0 + stepCells / 2) * G.cell, G.minZ + (k0 + stepCells / 2) * G.cell).add(mesh);
  }

  // ---------------------------------------------------------------- water (the terrain's own water surface grid)
  const waterTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 128);
    for (let n = 0; n < 220; n++) { x.fillStyle = `rgba(160,200,230,${0.08 + hash(n, 3) * 0.2})`; const px = hash(n, 1) * 128, py = hash(n, 2) * 128; x.fillRect(px, py, 6 + hash(n, 4) * 18, 1.5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const waterMat = new THREE.MeshLambertMaterial({ color: '#4f93b8', map: waterTex, transparent: true, opacity: 0.82, depthWrite: false, emissive: '#16384a' });
  const marshMat = new THREE.MeshLambertMaterial({ color: '#5d7f62', map: waterTex, transparent: true, opacity: 0.8, depthWrite: false, emissive: '#1a2a1a' });
  for (let k0 = 0; k0 < G.nz - 1; k0 += stepCells) for (let i0 = 0; i0 < G.nx - 1; i0 += stepCells) {
    const verts = [], uvs = [], vertsM = [], uvsM = [];
    const i1 = Math.min(G.nx - 1, i0 + stepCells), k1 = Math.min(G.nz - 1, k0 + stepCells);
    for (let k = k0; k < k1; k++) for (let i = i0; i < i1; i++) {
      const ids = [k * G.nx + i, k * G.nx + i + 1, (k + 1) * G.nx + i, (k + 1) * G.nx + i + 1];
      const ws = ids.map(j => G.water[j]);
      const have = ws.filter(v => !Number.isNaN(v));
      if (!have.length) continue;
      const fill = Math.max(...have);
      const y = ws.map(v => (Number.isNaN(v) ? fill : v));
      const x0 = G.minX + i * G.cell, z0 = G.minZ + k * G.cell, x1 = x0 + G.cell, z1 = z0 + G.cell;
      const marsh = T.biomeAt(x0 + 1, z0 + 1) === 'marsh';
      const V = marsh ? vertsM : verts, U = marsh ? uvsM : uvs;
      V.push(x0, y[0], z0, x0, y[2], z1, x1, y[1], z0, x1, y[1], z0, x0, y[2], z1, x1, y[3], z1);
      U.push(x0 / 16, z0 / 16, x0 / 16, z1 / 16, x1 / 16, z0 / 16, x1 / 16, z0 / 16, x0 / 16, z1 / 16, x1 / 16, z1 / 16);
    }
    for (const [V, U, mat] of [[verts, uvs, waterMat], [vertsM, uvsM, marshMat]]) {
      if (!V.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.renderOrder = 2; m.name = 'water';
      tileGroup(G.minX + (i0 + stepCells / 2) * G.cell, G.minZ + (k0 + stepCells / 2) * G.cell).add(m);
    }
  }

  // ---------------------------------------------------------------- roads: ribbons draped on the ground
  const roadMat = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const ROADC = { road: new THREE.Color('#c2a578'), trail: new THREE.Color('#ab9068'), boardwalk: new THREE.Color('#8f6d48') };
  for (const r of T.roads) {
    const pts = r.pts;
    if (pts.length < 2) continue;
    const half = (r.width || 4) / 2;
    const c = ROADC[r.class] || ROADC.trail;
    // one ribbon per tile run so tiles cull properly
    let V = [], C = [], tileK = null;
    const flush = () => { if (V.length >= 18) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(V, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, roadMat); m.receiveShadow = true; m.name = 'road'; const [i, j] = tileK.split(',').map(Number); tileGroup((i + 0.5) * TILE, (j + 0.5) * TILE).add(m); } V = []; C = []; };
    for (let n = 0; n < pts.length - 1; n++) {
      const a = pts[n], b = pts[n + 1];
      const k = tileOf(a.x, a.z);
      if (k !== tileK) { flush(); tileK = k; }
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz) || 1;
      const nx = -dz / L * half, nz = dx / L * half;
      const P = [[a.x + nx, a.z + nz], [a.x - nx, a.z - nz], [b.x + nx, b.z + nz], [b.x - nx, b.z - nz]].map(([x, z]) => [x, (T.deckAt(x, z) ? T.walkHeightAt(x, z).y : T.heightAt(x, z)) + 0.04, z]);
      const shade = 0.94 + hash(a.x, a.z) * 0.1;
      for (const q of [P[0], P[2], P[1], P[1], P[2], P[3]]) { V.push(...q); C.push(c.r * shade, c.g * shade, c.b * shade); }
    }
    flush();
  }

  // ---------------------------------------------------------------- bridges (decks at their deck height)
  const deckMat = new THREE.MeshLambertMaterial({ color: '#8e6440' }), stoneMat = new THREE.MeshLambertMaterial({ color: '#8a8478' });
  for (const b of T.bridges) {
    if (b.kind !== 'bridge') continue;
    const len = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) + 1.5;
    const stone = /stone/.test(b.art || b.id);
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(b.width, 0.35, len), stone ? stoneMat : deckMat);
    deck.position.y = -0.18; deck.castShadow = deck.receiveShadow = true; g.add(deck);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9, len), stone ? stoneMat : deckMat);
      rail.position.set(s * (b.width / 2 - 0.1), 0.45, 0); rail.castShadow = true; g.add(rail);
      for (let p = -len / 2 + 0.5; p <= len / 2 - 0.4; p += stone ? len : 2.2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), stone ? stoneMat : deckMat); post.position.set(s * (b.width / 2 - 0.1), 0.3, p); g.add(post);
      }
    }
    const mid = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2];
    g.position.set(mid[0], b.deck, mid[1]);
    g.rotation.y = Math.atan2(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    g.name = b.name;
    tileGroup(mid[0], mid[1]).add(g);
  }

  // ---------------------------------------------------------------- props (placements) and the shapes for placeholders
  const matCache = new Map();
  const matOf = hex => { if (!matCache.has(hex)) matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex })); return matCache.get(hex); };
  function shapeGeometry(ph, id = '') {
    const [w, h, d] = ph.size || [1, 1, 1];
    const s = ph.shape;
    let geo;
    if (s === 'cylinder') { geo = new THREE.CylinderGeometry(w / 2 * 0.9, w / 2, h, 10); geo.translate(0, h / 2, 0); }
    else if (s === 'cone') { geo = new THREE.ConeGeometry(w / 2, h, 9); geo.translate(0, h / 2, 0); }
    else if (s === 'rock') { geo = new THREE.IcosahedronGeometry(0.5, 0); geo.scale(w, h, d); geo.translate(0, h * 0.38, 0); }
    else if (s === 'house') {
      const body = new THREE.BoxGeometry(w, h * 0.6, d); body.translate(0, h * 0.3, 0);
      const roof = new THREE.ConeGeometry(Math.max(w, d) * 0.75, h * 0.42, 4); roof.rotateY(Math.PI / 4); roof.translate(0, h * 0.6 + h * 0.2, 0);
      geo = mergeGeometries([body.toNonIndexed(), roof.toNonIndexed()]);
      const n = geo.attributes.position.count, cols = new Float32Array(n * 3), bodyN = body.toNonIndexed().attributes.position.count;
      const wall = new THREE.Color(ph.colour).offsetHSL(0, -0.1, 0.12), roofC = new THREE.Color(ph.colour).offsetHSL(0, 0.05, -0.08);
      for (let i = 0; i < n; i++) { const c = i < bodyN ? wall : roofC; cols.set([c.r, c.g, c.b], i * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    } else { geo = new THREE.BoxGeometry(w, h, d); geo.translate(0, h / 2, 0); }
    return geo;
  }
  const houseMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  function placeholderMesh(a) {
    const ph = a.placeholder || { shape: 'box', size: a.size || [1, 1, 1], colour: '#8a7a64' };
    const geo = shapeGeometry(ph, a.id);
    const m = new THREE.Mesh(geo, ph.shape === 'house' ? houseMat : matOf(ph.colour));
    m.castShadow = true; m.receiveShadow = true;
    return m;
  }
  const pending = [];
  function place(id, x, z, y, facing = 0, { scale = 1, name = '' } = {}) {
    const a = artById.get(id);
    const holder = new THREE.Group();
    holder.position.set(x, y ?? T.heightAt(x, z), z);
    holder.rotation.y = facing || 0;
    holder.name = name || id;
    tileGroup(x, z).add(holder);
    if (!a) { holder.add(placeholderMesh({ placeholder: { shape: 'box', size: [1, 1, 1], colour: '#8a7a64' } })); return holder; }
    if (a.status === 'ready' && a.file) {
      pending.push(glb(a.file).then(g => {
        const m = g.scene.clone(true);
        m.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.material?.map) o.material.map.colorSpace = THREE.SRGBColorSpace; } });
        m.scale.setScalar(scale);
        holder.add(m);
      }).catch(() => holder.add(placeholderMesh({ ...a, placeholder: { shape: 'box', size: a.size || [2, 2, 2], colour: '#8a7a64' } }))));
    } else holder.add(placeholderMesh(a));
    if (scale !== 1 && holder.children[0]) holder.children[0].scale.multiplyScalar(scale);
    return holder;
  }
  for (const b of placements.buildings || []) place(b.art, b.at[0], b.at[1], b.y, b.facing, { name: b.name });
  for (const p of placements.props || []) place(p.art, p.at[0], p.at[1], p.y, p.facing);
  const shrineMarks = [];
  for (const s of placements.shrines || []) { const h = place(s.art || 'shrine-respawn', s.at[0], s.at[1], s.y, s.facing, { name: s.name }); shrineMarks.push({ id: s.id, holder: h }); }
  const chestMeshes = new Map();
  for (const c of placements.chests || []) chestMeshes.set(c.id, place(c.art || 'chest-common', c.at[0], c.at[1], c.y, c.facing, { name: c.name }));
  const objectMeshes = new Map();
  for (const o of placements.objects || []) {
    const h = o.art ? place(o.art, o.at[0], o.at[1], o.y, o.facing || 0, { name: o.name }) : (() => { const g = new THREE.Group(); g.position.set(o.at[0], o.y ?? T.heightAt(o.at[0], o.at[1]), o.at[1]); g.add(placeholderMesh({ placeholder: { ...(o.fallback || { shape: 'box', size: [1, 1, 1], colour: '#b08d3c' }) } })); tileGroup(o.at[0], o.at[1]).add(g); return g; })();
    objectMeshes.set(o.id, h);
  }

  // ---------------------------------------------------------------- trees and decor (instanced per art id and tile)
  const Q = { low: [0.55, 0.4], medium: [0.85, 0.75], high: [1, 1] }[quality] || [0.85, 0.75];
  function treeGeometry(a) {
    const [w, h] = a.placeholder?.size || [5, 9, 4];
    const crownC = new THREE.Color(a.placeholder?.colour || '#5a7a34'), trunkC = new THREE.Color('#6b4a30');
    const parts = [];
    const colour = (geo, c, vary = 0) => { const n = geo.attributes.position.count, cols = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = c.clone().offsetHSL(0, 0, (hash(i, n) - 0.5) * vary); cols.set([t.r, t.g, t.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); return geo; };
    const dead = /dead/.test(a.id);
    const trunkH = a.placeholder?.shape === 'cone' ? h * 0.25 : dead ? h * 0.85 : h * 0.42;
    const trunk = new THREE.CylinderGeometry(w * 0.045, w * 0.07, trunkH, 6).toNonIndexed(); trunk.translate(0, trunkH / 2, 0); parts.push(colour(trunk, trunkC, 0.05));
    if (a.placeholder?.shape === 'cone') {
      for (let t = 0; t < 3; t++) { const cn = new THREE.ConeGeometry(w * (0.5 - t * 0.1), h * 0.42, 8).toNonIndexed(); cn.translate(0, trunkH + h * 0.18 + t * h * 0.2, 0); parts.push(colour(cn, crownC.clone().offsetHSL(0, 0, t * 0.03), 0.06)); }
    } else if (!dead) {
      const blob = new THREE.IcosahedronGeometry(w * 0.42, 1).toNonIndexed(); blob.scale(1, (h - trunkH) / (w * 0.75), 1); blob.translate(0, trunkH + (h - trunkH) * 0.48, 0); parts.push(colour(blob, crownC, 0.1));
      const blob2 = new THREE.IcosahedronGeometry(w * 0.28, 1).toNonIndexed(); blob2.translate(w * 0.22, trunkH + (h - trunkH) * 0.3, w * 0.1); parts.push(colour(blob2, crownC.clone().offsetHSL(0, 0, -0.04), 0.1));
    } else {
      const branch = new THREE.CylinderGeometry(w * 0.02, w * 0.035, h * 0.4, 5).toNonIndexed(); branch.rotateZ(0.7); branch.translate(w * 0.15, trunkH * 0.8, 0); parts.push(colour(branch, trunkC, 0.05));
    }
    return mergeGeometries(parts);
  }
  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const geoCache = new Map();
  function instGeo(id) {
    if (geoCache.has(id)) return geoCache.get(id);
    const a = artById.get(id) || { id, placeholder: { shape: 'rock', size: [1, 1, 1], colour: '#7a7a6a' } };
    let geo;
    if (a.kind === 'tree' || a.placeholder?.shape === 'tree') geo = treeGeometry(a);
    else { geo = shapeGeometry(a.placeholder || { shape: 'rock', size: a.size || [1, 1, 1], colour: '#7a7a6a' }); if (geo.index) geo = geo.toNonIndexed(); const c = new THREE.Color(a.placeholder?.colour || '#7a7a6a'); const n = geo.attributes.position.count; const cols = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = c.clone().offsetHSL(0, 0, (hash(i, 7) - 0.5) * 0.08); cols.set([t.r, t.g, t.b], i * 3); } geo.setAttribute('color', new THREE.BufferAttribute(cols, 3)); }
    geoCache.set(id, geo);
    return geo;
  }
  function instance(list, keep) {
    const groups = new Map();
    list.forEach((t, n) => { if (!keep(n)) return; const k = `${tileOf(t.x, t.z)}|${t.art}`; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [k, items] of groups) {
      const art = k.split('|')[1];
      const mesh = new THREE.InstancedMesh(instGeo(art), vcMat, items.length);
      items.forEach((t, i) => { q.setFromAxisAngle(up, t.rot || 0); s.setScalar(t.scale || 1); p.set(t.x, (t.y ?? T.heightAt(t.x, t.z)) - 0.1, t.z); m4.compose(p, q, s); mesh.setMatrixAt(i, m4); });
      mesh.castShadow = artById.get(art)?.kind === 'tree'; mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.name = 'scatter ' + art;
      const [i, j] = k.split('|')[0].split(',').map(Number);
      tileGroup((i + 0.5) * TILE, (j + 0.5) * TILE).add(mesh);
    }
  }
  instance(scattered.trees || [], n => (n % 100) / 100 < Q[0]);
  instance(scattered.decor || [], n => (n % 100) / 100 < Q[1]);

  // ---------------------------------------------------------------- per frame
  let wt = 0;
  return {
    root, tiles, chestMeshes, objectMeshes, shrineMarks, ready: () => Promise.allSettled(pending),
    update(dt, at) {
      wt += dt;
      waterTex.offset.set(wt * 0.012, wt * 0.02);
      const far = (view.camera.far || 300) + TILE * 0.75;
      for (const g of tiles.values()) g.visible = Math.hypot(g.userData.cx - at.x, g.userData.cz - at.z) < far;
    },
  };
}
