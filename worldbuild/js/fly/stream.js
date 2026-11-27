// World Build fly view — the big-world streamer. Oathwild can adopt this module as it is: it asks a source for pieces
// (the page's worker here, the game server later) and keeps only what is near the viewer.
//
//   GROUND   a quadtree of chunks, every chunk 128 x 128 cells whatever its size: 256 m at 2 m cells (the walked grid,
//            exact), 512 m at 4 m, 1 km at 8 m … 8 km at 64 m. A chunk splits into its four children when the viewer
//            is nearer than `split` x its size; until all four children have arrived the parent stays drawn (no holes).
//            Skirts hang from every chunk edge so two sizes side by side never show a crack. Water is meshed per chunk.
//   TREES    per 256 m tile within `treeFar` m: the near build of Oathwild's storybook trees within `treeNear`, the
//            far build (and only grown trees) beyond. Rocks and set pieces near only.
//   TOWNS    a town's houses (Oathwild's town-draw / housekit) when within `townIn` m, dropped beyond `townOut`.
//   BRIDGES  Oathwild's bridge-draw for bridges within `bridgeIn` m.
//   BACKDROP far mountains round the world (and the sea plane past a sea edge): two draws, built once.
//   MEMORY   chunks no longer drawn are kept until the cache passes `budgetMB`, then the oldest are freed.
//
//   const S = await createStream({ scene, renderer, ask, info, quality })
//   S.update(camera)  each frame          S.heightAt(x, z)  finest loaded ground (camera clamp)
//   S.stats()  → numbers for the panel    S.settled()  → true when nothing is waiting      S.dispose()
//
// `ask(type, msg)` returns a Promise of the reply ('chunk' | 'tile' | 'town' | 'bridges'; worker.js documents them).

import * as THREE from 'three';
import { groundLayers, chunkMaterial } from './ground-mat.js';
import { treeKit } from './trees.js';
import { buildRock } from '../../../highdef-3d/js/kit/rocks.js';
import { makeSurface, makeWaterNormals } from '../../../highdef-3d/js/kit/textures.js';
import { makeNoise2D, ridged } from '../../../worldgen/js/noise.js';

const TILE = 256, CELLS = 128;
export const QUALITY = {
  low:    { split: 1.25, budgetMB: 70, treeNear: 160, treeFar: 420, rocks: 120, townIn: 420, townOut: 600, bridgeIn: 380, builds: 2, px: 256, inflight: 3, fog: 1500 },
  medium: { split: 1.6, budgetMB: 140, treeNear: 260, treeFar: 700, rocks: 200, townIn: 650, townOut: 900, bridgeIn: 600, builds: 3, px: 512, inflight: 4, fog: 2300 },
  high:   { split: 2.1, budgetMB: 260, treeNear: 380, treeFar: 1000, rocks: 280, townIn: 900, townOut: 1200, bridgeIn: 800, builds: 4, px: 512, inflight: 6, fog: 3200 },
};

export async function createStream({ scene, renderer, ask, info, quality = 'medium' }) {
  const Q = QUALITY[quality];
  const B = info.bounds;
  const root = new THREE.Group(); root.name = 'world stream'; scene.add(root);
  const G = await groundLayers(renderer, { px: Q.px });
  const TR = await treeKit({ quality });
  const waterNormals = makeWaterNormals(256, 7);
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;
  const waterMat = new THREE.MeshPhongMaterial({ color: '#2f6f9c', specular: '#8fb8cc', shininess: 70, transparent: true, opacity: 0.84, normalMap: waterNormals, normalScale: new THREE.Vector2(0.35, 0.35), depthWrite: false });
  const rockTex = makeSurface('rock', { size: 256, seed: 9 });
  rockTex.map.wrapS = rockTex.map.wrapT = THREE.RepeatWrapping;
  const rockMat = new THREE.MeshLambertMaterial({ map: rockTex.map, color: '#b8b2a8', vertexColors: true });
  const rockGeo = buildRock('stone', { seed: 4, lod: 1, size: 1 }).geometry;
  const setMats = {
    stone: new THREE.MeshLambertMaterial({ map: makeSurface('cliff', { size: 256, seed: 2 }).map }),
    wood: new THREE.MeshLambertMaterial({ map: makeSurface('wood_plank', { size: 256, seed: 2 }).map }),
    cloth: new THREE.MeshLambertMaterial({ map: makeSurface('thatch', { size: 256, seed: 6 }).map, color: '#d8c8a8' }),
  };
  for (const m of Object.values(setMats)) { m.map.wrapS = m.map.wrapT = THREE.RepeatWrapping; }

  // ---------------------------------------------------------------- ground chunks
  const chunks = new Map();          // key → { key, x0, z0, size, step, state: 'asked'|'ready', mesh, water, bytes, used, data, askedAt, ms }
  const queue = [];                  // replies waiting to be built into meshes
  let inflight = 0;
  const loadTimes = { chunk: [], tile: [], build: [] };
  const idx = new Map();
  const indexFor = n => {
    if (idx.has(n)) return idx.get(n);
    const out = [];
    for (let k = 0; k < n - 1; k++) for (let i = 0; i < n - 1; i++) { const a = k * n + i, b = a + 1, c = a + n, d = c + 1; out.push(a, c, b, b, c, d); }   // terrain.js GRID SPLIT
    // skirts: a strip down from each edge (vertices n² .. n² + 4n)
    const s0 = n * n;
    const edges = [[i => i, 0], [i => (n - 1) * n + i, n], [i => i * n, 2 * n], [i => i * n + n - 1, 3 * n]];
    edges.forEach(([at, off], e) => { for (let i = 0; i < n - 1; i++) { const a = at(i), b = at(i + 1), c = s0 + off + i, d = s0 + off + i + 1; if (e % 2) out.push(a, b, c, b, d, c); else out.push(a, c, b, b, c, d); } });
    const arr = new THREE.BufferAttribute(new Uint32Array(out), 1);
    idx.set(n, arr);
    return arr;
  };
  const keyOf = (size, x0, z0) => `${size}:${x0}:${z0}`;
  const inWorld = (x0, z0, size) => x0 < B.maxX && x0 + size > B.minX && z0 < B.maxZ && z0 + size > B.minZ;
  function request(size, x0, z0) {
    const key = keyOf(size, x0, z0);
    let c = chunks.get(key);
    if (c) return c;
    c = { key, x0, z0, size, step: size / CELLS, state: 'want', used: 0 };
    chunks.set(key, c);
    return c;
  }
  function send(c) {
    c.state = 'asked'; c.askedAt = performance.now(); inflight++;
    ask('chunk', { key: c.key, x0: c.x0, z0: c.z0, size: c.size, step: c.step }).then(r => { inflight--; if (chunks.get(c.key) === c) { c.data = r; queue.push(c); } }, () => { inflight--; c.state = 'want'; });
  }
  function build(c) {
    const t0 = performance.now();
    const { n, heights, water, paint, pn, step } = c.data, nb = n + 2;
    const pos = new Float32Array((n * n + 4 * n) * 3), nor = new Float32Array((n * n + 4 * n) * 3);
    const H = (i, k) => heights[(k + 1) * nb + (i + 1)];
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
      const v = (k * n + i) * 3, h = H(i, k);
      pos[v] = c.x0 + i * step; pos[v + 1] = h; pos[v + 2] = c.z0 + k * step;
      const dx = (H(i + 1, k) - H(i - 1, k)) / (2 * step), dz = (H(i, k + 1) - H(i, k - 1)) / (2 * step), L = Math.hypot(dx, 1, dz);
      nor[v] = -dx / L; nor[v + 1] = 1 / L; nor[v + 2] = -dz / L;
    }
    const drop = step * 1.5 + 2;
    const edges = [i => i, i => (n - 1) * n + i, i => i * n, i => i * n + n - 1];
    edges.forEach((at, e) => { for (let i = 0; i < n; i++) { const src = at(i) * 3, dst = (n * n + e * n + i) * 3; pos[dst] = pos[src]; pos[dst + 1] = pos[src + 1] - drop; pos[dst + 2] = pos[src + 2]; nor[dst] = nor[src]; nor[dst + 1] = nor[src + 1]; nor[dst + 2] = nor[src + 2]; } });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setIndex(indexFor(n));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, chunkMaterial(G, { x0: c.x0, z0: c.z0, size: c.size, pn, paint, quality }));
    mesh.name = `ground ${c.size} m`; mesh.matrixAutoUpdate = false; mesh.visible = false;
    root.add(mesh);
    c.mesh = mesh;
    c.bytes = pos.byteLength + nor.byteLength + paint.byteLength;
    // water: every cell with a wet corner, at the water surface (a dry corner takes its wet neighbours' surface)
    let wet = 0;
    for (let j = 0; j < water.length; j++) if (!Number.isNaN(water[j])) wet++;
    if (wet) {
      const wp = [], wi = [], vmap = new Int32Array(n * n).fill(-1);
      const surf = (i, k) => { let w = water[k * n + i]; if (!Number.isNaN(w)) return w; let s = 0, m = 0; for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const ii = i + di, kk = k + dk; if (ii >= 0 && kk >= 0 && ii < n && kk < n && !Number.isNaN(water[kk * n + ii])) { s += water[kk * n + ii]; m++; } } return m ? s / m : NaN; };
      const vert = (i, k) => { const j = k * n + i; if (vmap[j] < 0) { const y = surf(i, k); vmap[j] = wp.length / 3; wp.push(c.x0 + i * step, Number.isNaN(y) ? H(i, k) - 0.5 : y, c.z0 + k * step); } return vmap[j]; };
      for (let k = 0; k < n - 1; k++) for (let i = 0; i < n - 1; i++) {
        const any = !Number.isNaN(water[k * n + i]) || !Number.isNaN(water[k * n + i + 1]) || !Number.isNaN(water[(k + 1) * n + i]) || !Number.isNaN(water[(k + 1) * n + i + 1]);
        if (!any) continue;
        const a = vert(i, k), b = vert(i + 1, k), cc = vert(i, k + 1), d = vert(i + 1, k + 1);
        wi.push(a, cc, b, b, cc, d);
      }
      const wg = new THREE.BufferGeometry();
      const wpos = new Float32Array(wp), uv = new Float32Array(wpos.length / 3 * 2);
      for (let v = 0; v < wpos.length / 3; v++) { uv[v * 2] = wpos[v * 3] / 14; uv[v * 2 + 1] = wpos[v * 3 + 2] / 14; }
      wg.setAttribute('position', new THREE.BufferAttribute(wpos, 3));
      wg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      wg.setIndex(wi); wg.computeVertexNormals(); wg.computeBoundingSphere();
      const wm = new THREE.Mesh(wg, waterMat); wm.name = `water ${c.size} m`; wm.renderOrder = 2; wm.visible = false; wm.matrixAutoUpdate = false;
      root.add(wm); c.water = wm; c.bytes += wpos.byteLength + uv.byteLength + wi.length * 4;
    }
    c.heights = heights; c.n = n;
    c.data = null; c.state = 'ready';
    c.ms = Math.round(performance.now() - c.askedAt);
    const bms = performance.now() - t0;
    loadTimes.chunk.push({ size: c.size, ms: c.ms }); loadTimes.build.push(bms);
    if (loadTimes.chunk.length > 400) loadTimes.chunk.shift();
    if (loadTimes.build.length > 400) loadTimes.build.shift();
  }
  function freeChunk(c) {
    if (c.mesh) { root.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.userData.paintTex?.dispose(); c.mesh.material.dispose(); }
    if (c.water) { root.remove(c.water); c.water.geometry.dispose(); }
    chunks.delete(c.key);
  }

  // which chunks to draw for a viewer at `cam`: split while near, keep a parent until its children are ready
  const ROOT_SIZE = 8192, ROOT_X = -4096, ROOT_Z = -4096;
  const draw = new Set(), wanted = [];
  // A chunk is visited only once its parent is drawn (or it is the root), so the ground never has a hole: it splits
  // into its four children only when all four are ready; until then it stays drawn and asks for them.
  function select(size, x0, z0, cam) {
    if (!inWorld(x0, z0, size)) return;
    const c = request(size, x0, z0);
    c.used = frame;
    const dx = Math.max(x0 - cam.x, 0, cam.x - (x0 + size)), dz = Math.max(z0 - cam.z, 0, cam.z - (z0 + size));
    const d = Math.hypot(dx, dz, Math.max(0, cam.y - 150) * 0.5);
    if (c.state === 'ready' && size > TILE && d < size * Q.split) {
      const h = size / 2, kids = [[x0, z0], [x0 + h, z0], [x0, z0 + h], [x0 + h, z0 + h]].filter(([kx, kz]) => inWorld(kx, kz, h));
      if (kids.every(([kx, kz]) => chunks.get(keyOf(h, kx, kz))?.state === 'ready')) { for (const [kx, kz] of kids) select(h, kx, kz, cam); return; }
      for (const [kx, kz] of kids) { const k = request(h, kx, kz); k.used = frame; if (k.state === 'want') wanted.push([d, k]); }
    }
    if (c.state === 'ready') draw.add(c);
    else if (c.state === 'want') wanted.push([d, c]);
  }

  // ---------------------------------------------------------------- trees, rocks, set pieces by 256 m tile
  const tiles = new Map();           // key → { tx, tz, state, data, group, lod, rocks, sets, ms }
  let tileInflight = 0;
  function tileWanted(cam) {
    const out = [];
    const r = Q.treeFar + TILE;
    for (let tx = Math.floor((cam.x - r) / TILE); tx <= Math.floor((cam.x + r) / TILE); tx++) for (let tz = Math.floor((cam.z - r) / TILE); tz <= Math.floor((cam.z + r) / TILE); tz++) {
      if (!inWorld(tx * TILE, tz * TILE, TILE)) continue;
      const dx = Math.max(tx * TILE - cam.x, 0, cam.x - (tx + 1) * TILE), dz = Math.max(tz * TILE - cam.z, 0, cam.z - (tz + 1) * TILE);
      const d = Math.hypot(dx, dz);
      if (d <= Q.treeFar) out.push([d, tx, tz]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }
  function updateTiles(cam) {
    const want = tileWanted(cam), keep = new Set();
    for (const [d, tx, tz] of want) {
      const key = `${tx},${tz}`; keep.add(key);
      let t = tiles.get(key);
      if (!t) { t = { tx, tz, state: 'want' }; tiles.set(key, t); }
      if (t.state === 'want' && tileInflight < Q.inflight) {
        t.state = 'asked'; t.askedAt = performance.now(); tileInflight++;
        ask('tile', { key, tx, tz }).then(r => { tileInflight--; t.data = r; t.state = 'ready'; t.ms = Math.round(performance.now() - t.askedAt); loadTimes.tile.push(t.ms); if (loadTimes.tile.length > 300) loadTimes.tile.shift(); }, () => { tileInflight--; t.state = 'want'; });
      }
      if (t.state !== 'ready') continue;
      const lod = d <= Q.treeNear ? 'near' : 'far';
      if (t.lod !== lod && builtThisFrame < Q.builds) {
        builtThisFrame++;
        if (t.group) { root.remove(t.group); t.group.traverse(o => o.isInstancedMesh && o.dispose()); }
        t.group = TR.tileGroup(t.data.trees, info.species, { far: lod === 'far', minH: lod === 'far' ? 18 : 0 });
        t.group.name = `trees ${key} ${lod}`;
        root.add(t.group); t.lod = lod;
      }
      const near = d <= Q.rocks;
      if (near && !t.rocks && builtThisFrame < Q.builds) { builtThisFrame++; t.rocks = rocksOf(t.data); root.add(t.rocks); }
      else if (!near && t.rocks) { root.remove(t.rocks); t.rocks.traverse(o => o.isInstancedMesh && o.dispose()); t.rocks = null; }
    }
    for (const [key, t] of tiles) if (!keep.has(key) && t.state !== 'asked') {
      if (t.group) { root.remove(t.group); t.group.traverse(o => o.isInstancedMesh && o.dispose()); }
      if (t.rocks) { root.remove(t.rocks); t.rocks.traverse(o => o.isInstancedMesh && o.dispose()); }
      tiles.delete(key);
    }
  }
  const SHAPES = {
    stone: () => new THREE.DodecahedronGeometry(0.5, 0).scale(1, 1, 1).translate(0, 0.45, 0),
    wall: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), arch: () => archGeo(), pillar: () => new THREE.CylinderGeometry(0.45, 0.5, 1, 8).translate(0, 0.5, 0),
    altar: () => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), cairn: () => new THREE.ConeGeometry(0.55, 1, 7).translate(0, 0.5, 0), tower: () => new THREE.CylinderGeometry(0.42, 0.5, 1, 10).translate(0, 0.5, 0),
    tent: () => new THREE.ConeGeometry(0.62, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), post: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 6).translate(0, 0.5, 0), fire: () => new THREE.CylinderGeometry(0.5, 0.6, 0.5, 8).translate(0, 0.25, 0),
  };
  const SHAPE_MAT = { stone: 'stone', wall: 'stone', arch: 'stone', pillar: 'stone', altar: 'stone', cairn: 'stone', tower: 'stone', tent: 'cloth', post: 'wood', fire: 'stone' };
  const shapeGeo = {};
  function rocksOf(data) {
    const g = new THREE.Group();
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const R = data.rocks, n = R.length / 5;
    if (n) {
      const im = new THREE.InstancedMesh(rockGeo, rockMat, n);
      for (let i = 0; i < n; i++) { q.setFromAxisAngle(up, R[i * 5 + 3]); s.setScalar(R[i * 5 + 4]); p.set(R[i * 5], R[i * 5 + 1] - 0.1, R[i * 5 + 2]); im.setMatrixAt(i, m4.compose(p, q, s)); }
      im.computeBoundingSphere(); im.name = 'rocks'; g.add(im);
    }
    const byShape = new Map();
    for (const part of data.sets) { if (!byShape.has(part.shape)) byShape.set(part.shape, []); byShape.get(part.shape).push(part); }
    for (const [shape, list] of byShape) {
      if (!SHAPES[shape]) continue;
      shapeGeo[shape] = shapeGeo[shape] || boxUV(SHAPES[shape]());
      const im = new THREE.InstancedMesh(shapeGeo[shape], setMats[SHAPE_MAT[shape]], list.length);
      list.forEach((part, i) => { q.setFromAxisAngle(up, part.facing || 0); s.set(part.size[0], part.size[1], part.size[2]); p.set(part.at[0], part.y - 0.05, part.at[1]); im.setMatrixAt(i, m4.compose(p, q, s)); });
      im.computeBoundingSphere(); im.name = `set ${shape}`; g.add(im);
    }
    return g;
  }

  // ---------------------------------------------------------------- towns and bridges (Oathwild's own builders)
  const towns = new Map();           // id → { state, group }
  let townDraw = null, bridgeDraw = null, townNote = '';
  const loadTownDraw = async () => {
    if (townDraw !== null) return townDraw;
    try { townDraw = (await import('../../../prototypes/oathwild/js/client/render/town-draw.js')).createTownView; }
    catch (err) { townDraw = false; townNote = `houses not drawn: ${err.message}`; }
    return townDraw;
  };
  const loadBridgeDraw = async () => {
    if (bridgeDraw !== null) return bridgeDraw;
    try { bridgeDraw = (await import('../../../prototypes/oathwild/js/client/render/bridge-draw.js')).createBridgeView; }
    catch (err) { bridgeDraw = false; townNote = `bridges not drawn: ${err.message}`; }
    return bridgeDraw;
  };
  const patchHeight = P => (x, z) => {
    const fx = Math.min(P.nx - 1.000001, Math.max(0, (x - P.minX) / P.cell)), fz = Math.min(P.nz - 1.000001, Math.max(0, (z - P.minZ) / P.cell));
    const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, j = k * P.nx + i, A = P.heights;
    if (u + v <= 1) return A[j] + (A[j + 1] - A[j]) * u + (A[j + P.nx] - A[j]) * v;
    return A[j + P.nx + 1] + (A[j + P.nx] - A[j + P.nx + 1]) * (1 - u) + (A[j + 1] - A[j + P.nx + 1]) * (1 - v);
  };
  function updateTowns(cam) {
    for (const t of info.towns) {
      const d = Math.hypot(t.at[0] - cam.x, t.at[1] - cam.z);
      let s = towns.get(t.id);
      if (d < Q.townIn && !s) {
        s = { state: 'asked', askedAt: performance.now() }; towns.set(t.id, s);
        Promise.all([ask('town', { id: t.id }), loadTownDraw()]).then(async ([r, make]) => {
          if (!make || !r.plan || towns.get(t.id) !== s) { s.state = 'none'; return; }
          const g = new THREE.Group(); g.name = `town ${r.name}`;
          const view = await make({ T: { heightAt: patchHeight(r.patch) }, plan: r.plan, quality, tileGroup: () => g });
          if (towns.get(t.id) !== s) { disposeGroup(g); return; }
          root.add(g); s.group = g; s.state = 'ready'; s.ms = Math.round(performance.now() - s.askedAt); s.stats = view.stats;
        }).catch(err => { s.state = 'none'; townNote = `town ${t.id}: ${err.message}`; });
      } else if (s && d > Q.townOut && s.state !== 'asked') { if (s.group) { root.remove(s.group); disposeGroup(s.group); } towns.delete(t.id); }
    }
  }
  const bridgeBlocks = new Map();
  function updateBridges(cam) {
    const BS = 512, r = Q.bridgeIn;
    const keep = new Set();
    for (let bx = Math.floor((cam.x - r) / BS); bx <= Math.floor((cam.x + r) / BS); bx++) for (let bz = Math.floor((cam.z - r) / BS); bz <= Math.floor((cam.z + r) / BS); bz++) {
      if (!inWorld(bx * BS, bz * BS, BS)) continue;
      const key = `${bx},${bz}`; keep.add(key);
      if (bridgeBlocks.has(key)) continue;
      const s = { state: 'asked' }; bridgeBlocks.set(key, s);
      Promise.all([ask('bridges', { key, box: { minX: bx * BS, maxX: (bx + 1) * BS, minZ: bz * BS, maxZ: (bz + 1) * BS } }), loadBridgeDraw()]).then(([rep, make]) => {
        if (!make || bridgeBlocks.get(key) !== s || !rep.list.length) { s.state = 'none'; return; }
        const g = new THREE.Group(); g.name = `bridges ${key}`;
        for (const b of rep.list) make({ T: { bridges: [b], heightAt: patchHeight(b.patch) }, tileGroup: () => g });
        root.add(g); s.group = g; s.state = 'ready'; s.count = rep.list.length;
      }).catch(err => { s.state = 'none'; townNote = `bridges: ${err.message}`; });
    }
    for (const [key, s] of bridgeBlocks) if (!keep.has(key) && s.state !== 'asked') { if (s.group) { root.remove(s.group); disposeGroup(s.group); } bridgeBlocks.delete(key); }
  }

  // ---------------------------------------------------------------- the far backdrop: mountains round the world, sea past a sea edge
  const backdrop = buildBackdrop(B, info.sea || [], info.seed || 1, waterMat);
  root.add(backdrop);

  // ---------------------------------------------------------------- per frame
  let frame = 0, builtThisFrame = 0;
  function update(camera) {
    frame++; builtThisFrame = 0;
    const cam = camera.position;
    draw.clear(); wanted.length = 0;
    select(ROOT_SIZE, ROOT_X, ROOT_Z, cam);
    wanted.sort((a, b) => a[0] - b[0]);
    for (const [, c] of wanted) { if (inflight >= Q.inflight) break; if (c.state === 'want') send(c); }
    // build what has arrived, nearest first, a few a frame (a phone pays for every one)
    queue.sort((a, b) => a.size - b.size);
    while (queue.length && builtThisFrame < Q.builds) { const c = queue.shift(); if (chunks.get(c.key) === c) { build(c); builtThisFrame++; } }
    for (const c of chunks.values()) { const on = draw.has(c); if (c.mesh) c.mesh.visible = on; if (c.water) c.water.visible = on; if (on) c.used = frame; }
    updateTiles(cam); updateTowns(cam); updateBridges(cam);
    // memory: free the oldest chunks not drawn once the cache is over budget
    let bytes = 0; for (const c of chunks.values()) bytes += c.bytes || 0;
    if (bytes > Q.budgetMB * 1e6) {
      const idle = [...chunks.values()].filter(c => c.state === 'ready' && c.used < frame).sort((a, b) => a.used - b.used);   // (a parent of drawn chunks was visited this frame: kept)
      for (const c of idle) { if (bytes <= Q.budgetMB * 0.85e6) break; bytes -= c.bytes; freeChunk(c); }
    }
    for (const c of chunks.values()) if (c.state === 'want' && c.used < frame - 120) chunks.delete(c.key);
  }
  function heightAt(x, z) {
    let best = null;
    for (const c of draw) if (x >= c.x0 && x <= c.x0 + c.size && z >= c.z0 && z <= c.z0 + c.size && (!best || c.size < best.size)) best = c;
    if (!best) return 0;
    const n = best.n, nb = n + 2, fx = Math.min(n - 1.0001, (x - best.x0) / best.step), fz = Math.min(n - 1.0001, (z - best.z0) / best.step);
    const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k;
    const h = (ii, kk) => best.heights[(kk + 1) * nb + ii + 1];
    if (u + v <= 1) return h(i, k) + (h(i + 1, k) - h(i, k)) * u + (h(i, k + 1) - h(i, k)) * v;
    return h(i + 1, k + 1) + (h(i, k + 1) - h(i + 1, k + 1)) * (1 - u) + (h(i + 1, k) - h(i + 1, k + 1)) * (1 - v);
  }
  function stats() {
    let bytes = 0, ready = 0, drawn = 0, trees = 0, treeMeshes = 0, treeBytes = 0;
    const bySize = {};
    for (const c of chunks.values()) { if (c.state === 'ready') { ready++; bytes += c.bytes; } }
    for (const c of draw) { drawn++; bySize[c.size] = (bySize[c.size] || 0) + 1; }
    for (const t of tiles.values()) if (t.group) { trees += t.group.userData.stats.trees; treeMeshes += t.group.userData.stats.meshes; treeBytes += t.group.userData.stats.bytes; }
    const avg = a => (a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : 0);
    const l0 = loadTimes.chunk.filter(c => c.size === TILE).map(c => c.ms), all = loadTimes.chunk.map(c => c.ms);
    return {
      chunksDrawn: drawn, chunksCached: ready, chunkMB: Math.round(bytes / 1e5) / 10, bySize, waiting: inflight + queue.length,
      chunkMs: { avg: avg(all), max: Math.max(0, ...all), nearAvg: avg(l0), nearMax: Math.max(0, ...l0) }, buildMs: { avg: Math.round(avg(loadTimes.build.map(v => v * 10)) / 10), max: Math.round(Math.max(0, ...loadTimes.build)) },
      tiles: tiles.size, tileMs: { avg: avg(loadTimes.tile), max: Math.max(0, ...loadTimes.tile) }, trees, treeMeshes, treeMB: Math.round(treeBytes / 1e5) / 10,
      towns: [...towns.values()].filter(s => s.state === 'ready').length, townMs: Math.max(0, ...[...towns.values()].map(s => s.ms || 0)),
      bridges: [...bridgeBlocks.values()].reduce((n, s) => n + (s.count || 0), 0), groundTextureMB: Math.round(G.bytes / 1e5) / 10, note: townNote,
    };
  }
  const settled = () => inflight === 0 && queue.length === 0 && wanted.length === 0 && tileInflight === 0 && [...tiles.values()].every(t => t.state === 'ready' && t.group) && [...towns.values()].every(s => s.state !== 'asked') && [...bridgeBlocks.values()].every(s => s.state !== 'asked');
  function dispose() { for (const c of [...chunks.values()]) freeChunk(c); scene.remove(root); disposeGroup(root); TR.dispose(); }
  return { update, heightAt, stats, settled, dispose, root };
}

function disposeGroup(g) { g.traverse(o => { if (o.isMesh || o.isInstancedMesh) { o.geometry?.dispose?.(); } }); }
function boxUV(geo) {
  // world-ish texture coordinates so stone and wood read the same size on every part
  const p = geo.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 0.8; uv[i * 2 + 1] = p.getY(i) * 0.8; }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
function archGeo() {
  const parts = [new THREE.BoxGeometry(0.22, 1, 1).translate(-0.39, 0.5, 0), new THREE.BoxGeometry(0.22, 1, 1).translate(0.39, 0.5, 0), new THREE.BoxGeometry(1, 0.2, 1).translate(0, 0.9, 0)];
  const pos = [], idx = []; let off = 0;
  for (const g of parts) { const a = g.toNonIndexed().attributes.position; for (let i = 0; i < a.count; i++) { pos.push(a.getX(i), a.getY(i), a.getZ(i)); idx.push(off + i); } off += a.count; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
  return geo;
}

/** Far mountains in a ring round the world (seeded ridged noise rising away from the edge), sea plane past sea edges. */
function buildBackdrop(B, seaEdges, seed, waterMat) {
  const g = new THREE.Group(); g.name = 'backdrop';
  const noise = makeNoise2D((seed ^ 0xb4c3) >>> 0);
  const cx = (B.minX + B.maxX) / 2, cz = (B.minZ + B.maxZ) / 2, half = Math.max(B.maxX - B.minX, B.maxZ - B.minZ) / 2;
  const SEG = 160, RINGS = 14, pos = [], col = [], uv = [], idx = [];
  for (let r = 0; r <= RINGS; r++) {
    const t = r / RINGS, dist = half * (0.98 + t * 2.4);
    for (let s = 0; s <= SEG; s++) {
      const a = s / SEG * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a);
      // a square-ish ring hugging the world's edge
      const k = 1 / Math.max(Math.abs(dx), Math.abs(dz));
      const x = cx + dx * dist * k * (t < 0.01 ? 1 : 1), z = cz + dz * dist * k;
      const sea = seaEdges.some(e => (e === 'south' && z > B.maxZ - 10) || (e === 'north' && z < B.minZ + 10) || (e === 'east' && x > B.maxX - 10) || (e === 'west' && x < B.minX + 10));
      const rise = sea ? -40 : 60 + 520 * Math.sin(Math.min(1, t * 1.6) * Math.PI / 2) * (0.45 + 0.75 * ridged(noise, x / 1400, z / 1400, { octaves: 4 }));
      pos.push(x, t < 0.01 ? -30 : rise, z);
      const snow = Math.max(0, Math.min(1, (rise - 380) / 120));
      col.push(0.62 + snow * 0.38, 0.6 + snow * 0.4, 0.58 + snow * 0.42);
      uv.push(s / SEG * 40, t * 6);
    }
  }
  for (let r = 0; r < RINGS; r++) for (let s = 0; s < SEG; s++) { const a = r * (SEG + 1) + s, b = a + 1, c = a + SEG + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  const rock = makeSurface('cliff', { size: 256, seed: 12 }).map; rock.wrapS = rock.wrapT = THREE.RepeatWrapping;
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: rock, vertexColors: true }));
  m.name = 'far mountains'; g.add(m);
  if (seaEdges.length) {
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(half * 12, half * 12).rotateX(-Math.PI / 2), waterMat);
    sea.position.set(cx, -0.05, cz); sea.renderOrder = 1; sea.name = 'sea'; g.add(sea);
    const uvA = sea.geometry.attributes.uv; for (let i = 0; i < uvA.count; i++) uvA.setXY(i, uvA.getX(i) * 400, uvA.getY(i) * 400);
  }
  return g;
}
