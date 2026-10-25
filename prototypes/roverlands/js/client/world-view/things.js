// Everything standing on the ground: trees, bushes, reeds, rocks, logs, fences, hay, crates, barrels, signs, ramps,
// the bridge and the sheds — plus the ground decor (ferns, flowers, pebbles) that is drawn but never collides.
//
// The models come from highdef-3d's kits (kit/trees.js, kit/rocks.js) and the materials follow highdef's
// vegetation.js (bark / foliage / stem / triplanar rock / vertex-colour props, all through enhance()). The way they
// are DRAWN is new, because Roverlands objects have to break:
//
//   * NEAR RING — every object in a 128 m cell close to the camera is drawn instanced, one InstancedMesh per
//     (model, variant, detail level, part). The ring is re-filled whenever the camera has moved ~12 m or something
//     broke, which costs a millisecond or two and means a hidden or flattened object simply is not written in.
//     Draw calls depend on how many different models are near, not on how many cells.
//   * FAR CELLS — cells beyond the ring are baked: every object in the cell stamped into one geometry per material
//     at the coarsest level (two or three draws per cell). Breaking something there re-bakes that one cell.
//
//   Every model is SIZED TO ITS COLLIDER: a tree is scaled so its height is the kind's height x s, a rock so its
//   footprint and height match the cylinder the physics uses, a crate to its box. highdef's own scatter lets a model
//   pick a random size; here the size must come from the world data or a car would hit air.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { enhance } from '../../../../../highdef-3d/js/materials.js';
import { makeSurface, loadFoliageAtlas } from '../../../../../highdef-3d/js/kit/textures.js';
import * as Trees from '../../../../../highdef-3d/js/kit/trees.js';
import * as Rocks from '../../../../../highdef-3d/js/kit/rocks.js';
import { KINDS } from '../../world/world-data.js';

const CELL = 128;
const VARIANTS = 2;
const TREE_SPECIES = new Set(Object.keys(Trees.SPECIES));
const BUSH = new Set(['shrub', 'berry_bush', 'juniper', 'bramble', 'heather']);
const FERN = new Set(['fern', 'broadleaf', 'reed', 'cattail']);
const FLOWER = new Set(['daisy', 'bluebell', 'thistle', 'mushroom_cap', 'toadstool']);
const ROCKS = new Set(['pebble', 'stone', 'boulder', 'mossy_boulder', 'shard', 'slab', 'cracked_boulder', 'rock_cluster']);
const UNIQUE = new Set(['bridge_deck', 'bridge_rail', 'bridge_pier', 'shed']);

/** Which drawing category an object kind belongs to (sets its distances). */
function category(kind) {
  if (kind === 'tree_pine' || kind === 'tree_birch' || kind === 'tree_oak') return 'tree';
  if (kind === 'sapling' || kind === 'bush' || kind === 'reeds') return 'small';
  if (kind.startsWith('rock') || kind === 'boulder') return 'rock';
  if (kind === 'log') return 'log';
  return 'prop';
}

export async function createThings({ world, quality, csm, scene }) {
  const group = new THREE.Group();
  group.name = 'things';
  const half = world.size / 2;
  const per = Math.ceil(world.size / CELL);

  // --- materials (after highdef vegetation.js) ---------------------------------------------------------------------
  const atlas = await loadFoliageAtlas();
  atlas.texture.anisotropy = quality.anisotropy;
  const tex = quality.textureSize;
  const bark = makeSurface('bark_pine', { size: tex, seed: 3 });
  const rockS = makeSurface('rock', { size: tex, seed: 11 });
  const plank = makeSurface('wood_plank', { size: tex, seed: 2 });
  const M = {
    bark: enhance(new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, vertexColors: true, roughness: 0.94 }), { csm, wind: 0.35 }),
    logbark: enhance(new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normalMap, vertexColors: true, roughness: 0.9 }), { csm, wind: false }),
    stem: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), { csm, wind: 0.9 }),
    foliage: enhance(new THREE.MeshStandardMaterial({ map: atlas.texture, alphaTest: 0.26, side: THREE.DoubleSide, vertexColors: true, roughness: 0.88 }), { csm, wind: 1.0 }),
    rock: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, color: 0x9c9a95 }), {
      csm, wind: false,
      uniforms: { tRock: { value: rockS.map }, uRockScale: { value: 0.28 } },
      vertex: {
        pars: 'varying vec3 vRkW; varying vec3 vRkN;',
        main: `mat4 rkM = modelMatrix;
          #ifdef USE_INSTANCING
            rkM = modelMatrix * instanceMatrix;
          #endif
          vRkW = ( rkM * vec4( transformed, 1.0 ) ).xyz; vRkN = normalize( mat3( rkM ) * objectNormal );`,
      },
      fragment: {
        pars: 'uniform sampler2D tRock; uniform float uRockScale; varying vec3 vRkW; varying vec3 vRkN;',
        map: `{ vec3 n = normalize( vRkN ); vec3 b = pow( abs( n ), vec3( 4.0 ) ); b /= ( b.x + b.y + b.z );
          vec3 t = texture2D( tRock, vRkW.zy * uRockScale ).rgb * b.x + texture2D( tRock, vRkW.xz * uRockScale ).rgb * b.y
                 + texture2D( tRock, vRkW.xy * uRockScale ).rgb * b.z;
          diffuseColor.rgb *= t * 1.35; }`,
      },
    }),
    prop: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), { csm, wind: false }),
    hay: enhance(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, color: 0xb39a5c }), { csm, wind: false }),
    wood: enhance(new THREE.MeshStandardMaterial({ map: plank.map, normalMap: plank.normalMap, vertexColors: true, roughness: 0.85 }), { csm, wind: false }),
  };
  M.foliage.alphaToCoverage = !!quality.msaa;
  for (const t of [bark.map, plank.map, rockS.map]) t.anisotropy = quality.anisotropy;

  // --- the model catalogue ---------------------------------------------------------------------------------------
  // model(look, variant, lod) -> { parts: [{ geo, mat }], h, r, box: THREE.Box3 } built once and kept.
  const cache = new Map();
  function model(look, variant, lod) {
    const v = lod === 0 ? variant : 0;
    const key = `${look}|${v}|${lod}`;
    if (cache.has(key)) return cache.get(key);
    let m = null;
    try { m = buildModel(look, v, lod); } catch (e) { console.warn('[things] could not build', look, e.message); }
    cache.set(key, m);
    return m;
  }
  function seedOf(look, v) { let h = 2166136261; for (const c of look + v) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
  function buildModel(look, v, lod) {
    const rng = Trees.makeRng(seedOf(look, v));
    const pair = (b, bm, f) => ({ parts: [b && { geo: b, mat: bm }, f && { geo: f, mat: M.foliage }].filter(Boolean) });
    let out;
    if (TREE_SPECIES.has(look)) {
      const sp = Trees.SPECIES[look];
      const r = Trees.buildTree(look, { rng, lod, height: (sp.minHeight + sp.maxHeight) / 2 });
      out = pair(r.bark, M.bark, r.foliage);
    } else if (BUSH.has(look)) { const r = Trees.buildBush(look, { rng, lod }); out = pair(r.bark, M.stem, r.foliage); }
    else if (FERN.has(look)) { const r = Trees.buildFern(look, { rng, lod }); out = pair(r.bark, M.stem, r.foliage); }
    else if (FLOWER.has(look)) { const r = Trees.buildFlower(look, { rng, lod }); out = pair(r.bark, M.stem, r.foliage); }
    else if (look === 'branch_pile') { const r = Trees.buildLogsAndDebris('branch_pile', { rng, lod }); out = pair(r.bark, M.bark, r.foliage); }
    else if (ROCKS.has(look)) { const r = Rocks.buildRock(look, { rng, lod, size: 1 }); out = { parts: [{ geo: r.geometry, mat: M.rock }] }; }
    else if (look === 'log') out = { parts: [{ geo: logGeometry(lod), mat: M.logbark }] };
    else if (look === 'fence') out = { parts: [{ geo: fenceGeometry(), mat: M.wood }] };
    else if (look === 'ramp') out = { parts: [{ geo: wedgeGeometry(), mat: M.wood }] };
    else if (look === 'crate' || look === 'barrel') out = { parts: [{ geo: Rocks.buildProp(look, { rng, lod }).geometry, mat: M.prop }] };
    else if (look === 'sign') out = { parts: [{ geo: Rocks.buildProp('signpost', { rng, lod }).geometry, mat: M.prop }] };
    else if (look === 'hay_bale') {
      // the kit lays its bale on its side; ours stand on end (the collider is an upright cylinder)
      const g = Rocks.buildProp('hay_bale', { rng, lod }).geometry;
      g.computeBoundingBox(); const c = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-c.x, -c.y, -c.z); g.rotateZ(Math.PI / 2);
      g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0);
      out = { parts: [{ geo: g, mat: M.hay }] };
    } else if (look === 'fence_post') out = { parts: [{ geo: boxGeometry(0.16, 1.25, 0.16, [0.55, 0.45, 0.34]), mat: M.wood }] };
    else return null;
    const box = new THREE.Box3();
    for (const p of out.parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    out.box = box;
    out.h = Math.max(0.01, box.max.y);
    out.r = Math.max(0.01, Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2);
    return out;
  }

  // --- per object: which model, and the matrix that sizes it to its collider ----------------------------------------
  const objs = world.objects;
  const state = new Uint8Array(objs.length);         // 0 standing, 1 gone, 2 flattened
  const info = new Array(objs.length);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  const cells = [];
  for (let i = 0; i < per * per; i++) cells.push({ items: [], decor: [], bake: null, bakeKey: '' });
  const cellOf = (x, z) => Math.min(per - 1, Math.max(0, Math.floor((z + half) / CELL))) * per + Math.min(per - 1, Math.max(0, Math.floor((x + half) / CELL)));
  const uniques = [];
  for (const o of objs) {
    if (UNIQUE.has(o.kind)) { uniques.push(o); continue; }
    const look = o.look && o.look !== o.kind ? o.look : o.kind;
    info[o.id] = { look, variant: o.id % VARIANTS, cat: category(o.kind) };
    cells[cellOf(o.x, o.z)].items.push(o.id);
  }
  world.decor.forEach((d, i) => { cells[cellOf(d.x, d.z)].decor.push(i); });

  /** The world matrix of object o drawn with model m (and squashed if flattened). */
  function matrixFor(o, m, out) {
    const K = KINDS[o.kind] || {};
    const sh = o.shape;
    let sx = 1, sy = 1, sz = 1, lift = 0;
    if (K.h) { const u = (K.h * o.s) / m.h; sx = sy = sz = u; }
    else if (sh.t === 'box' && o.kind === 'log') { sx = sh.hx; sy = sh.hy; sz = sh.hz * 2; lift = sh.lift ?? sh.hy; }
    else if (sh.t === 'box') { sx = (2 * sh.hx) / (m.box.max.x - m.box.min.x); sy = (2 * sh.hy) / m.h; sz = (2 * sh.hz) / (m.box.max.z - m.box.min.z); }
    else if (sh.t === 'wedge') { sx = sh.hx; sy = sh.hy; sz = sh.hz; }
    else if (sh.t === 'cyl') { sx = sz = sh.r / m.r; sy = (sh.h * (o.kind.startsWith('rock') || o.kind === 'boulder' ? 1.05 : 1)) / m.h; }
    if (state[o.id] === 2) { sy *= 0.14; sx *= 1.25; sz *= 1.25; }
    _p.set(o.x, o.y + lift, o.z);
    _q.setFromAxisAngle(UP, o.yaw || 0);
    _s.set(sx, sy, sz);
    return out.compose(_p, _q, _s);
  }
  const _dm = new THREE.Matrix4();
  function decorMatrix(d, m, out) {
    const target = d.kind === 'pebble' ? 0.25 : d.kind === 'flower' ? 0.35 : d.kind === 'mushroom' ? 0.14 : d.kind === 'reed' ? 1.2 : d.kind === 'debris' ? 0.5 : 0.7;
    const u = (target * d.s) / Math.max(0.05, m.h);
    _p.set(d.x, d.y, d.z); _q.setFromAxisAngle(UP, d.yaw); _s.set(u, u, u);
    return out.compose(_p, _q, _s);
  }

  // distances per category: [lod0 within, lod1 within (= the ring), far bake within]
  const R = {
    tree: [quality.treeNear, quality.treeMid, quality.treeDistance],
    small: [quality.treeNear * 0.6, quality.treeMid * 0.75, 0],
    rock: [quality.treeNear, quality.treeMid * 1.3, quality.treeDistance * 0.8],
    log: [quality.treeNear, quality.treeMid * 1.2, quality.treeDistance * 0.6],
    prop: [quality.propDistance, quality.propDistance, 0],
  };
  const ringMax = Math.max(...Object.values(R).map(r => r[1]));

  // --- the near ring ------------------------------------------------------------------------------------------------
  const buckets = new Map();   // key -> { meshes: [InstancedMesh per part], n, cap, model, shadow, colour }
  function bucket(key, m, shadow, colour) {
    let b = buckets.get(key);
    if (!b) { b = { meshes: [], n: 0, cap: 0, model: m, shadow, colour }; buckets.set(key, b); }
    return b;
  }
  function grow(b, need) {
    if (need <= b.cap) return;
    const cap = Math.max(16, Math.ceil(need * 1.5));
    for (const mesh of b.meshes) { group.remove(mesh); mesh.dispose(); }
    b.meshes = b.model.parts.map(p => {
      const mesh = new THREE.InstancedMesh(p.geo, p.mat, cap);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.castShadow = b.shadow && quality.shadows; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      if (b.colour) mesh.setColorAt(0, new THREE.Color(1, 1, 1));
      group.add(mesh);
      return mesh;
    });
    b.cap = cap;
  }
  const ringItems = [];
  const ringCentre = new THREE.Vector3(1e9, 0, 1e9);
  let dirty = true;
  const _c = new THREE.Color();
  function cellDist(ci, p) {
    const cx = ci % per, cz = (ci / per) | 0;
    const x0 = -half + cx * CELL, z0 = -half + cz * CELL;
    const dx = Math.max(x0 - p.x, 0, p.x - (x0 + CELL)), dz = Math.max(z0 - p.z, 0, p.z - (z0 + CELL));
    return Math.sqrt(dx * dx + dz * dz);
  }
  const ringCells = new Set();
  function refillRing(cam) {
    ringCentre.copy(cam);
    dirty = false;
    for (const b of buckets.values()) b.n = 0;
    ringCells.clear();
    for (let ci = 0; ci < cells.length; ci++) {
      const cd = cellDist(ci, cam);
      if (cd < ringMax) ringCells.add(ci);
      const cell = cells[ci];
      if (cd < ringMax) for (const id of cell.items) {
        if (state[id] === 1) continue;
        const o = objs[id], inf = info[id];
        const r = R[inf.cat];
        if (cd >= r[1]) continue;                    // this category is baked (or not drawn) at this cell distance
        const dx = o.x - cam.x, dz = o.z - cam.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (inf.cat === 'prop' && d > r[1]) continue;
        const lod = d < r[0] ? 0 : 1;
        const m = model(inf.look, inf.variant, lod);
        if (!m) continue;
        const shadow = lod === 0 || quality.treeShadowLod >= 1;
        const colour = inf.cat === 'rock';
        const b = bucket(`${inf.look}|${lod ? 0 : inf.variant}|${lod}`, m, shadow && inf.cat !== 'small', colour);
        grow(b, b.n + 1);
        matrixFor(o, m, _m);
        for (const mesh of b.meshes) {
          mesh.setMatrixAt(b.n, _m);
          if (colour) { const t = o.tint; _c.setRGB(t ? t[0] : 1, t ? t[1] : 1, t ? t[2] : 1); mesh.setColorAt(b.n, _c); }
        }
        b.n++;
      }
      // decor: near only
      if (cd < quality.decorDistance) for (const di of cell.decor) {
        const d = world.decor[di];
        const dx = d.x - cam.x, dz = d.z - cam.z;
        if (dx * dx + dz * dz > quality.decorDistance * quality.decorDistance) continue;
        const m = model(d.look, di % VARIANTS, 0);
        if (!m) continue;
        const b = bucket(`decor|${d.look}|${di % VARIANTS}`, m, false, false);
        grow(b, b.n + 1);
        decorMatrix(d, m, _dm);
        for (const mesh of b.meshes) mesh.setMatrixAt(b.n, _dm);
        b.n++;
      }
    }
    for (const b of buckets.values()) for (const mesh of b.meshes) {
      mesh.count = b.n;
      mesh.visible = b.n > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.frustumCulled = b.n > 0;
    }
    void ringItems;
  }

  // --- far cells: baked ---------------------------------------------------------------------------------------------
  function bakeCell(ci, cam) {
    const cell = cells[ci];
    const byMat = new Map();
    const cd = cellDist(ci, cam);
    for (const id of cell.items) {
      if (state[id] === 1) continue;
      const o = objs[id], inf = info[id];
      const r = R[inf.cat];
      if (!(cd >= r[1] && cd < r[2])) continue;
      const m = model(inf.look, 0, 2);
      if (!m) continue;
      matrixFor(o, m, _m);
      for (const p of m.parts) {
        let list = byMat.get(p.mat);
        if (!list) byMat.set(p.mat, list = []);
        list.push(stamp(p.geo, _m, inf.cat === 'rock' ? o.tint : null));
      }
    }
    const meshes = [];
    for (const [mat, list] of byMat) {
      let g = null;
      try { g = list.length === 1 ? list[0] : mergeGeometries(list, false); } catch { g = null; }
      for (const x of list) if (x !== g) x.dispose();
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = false; mesh.receiveShadow = true;
      mesh.name = 'far';
      group.add(mesh);
      meshes.push(mesh);
    }
    return meshes;
  }
  function dropBake(cell) {
    if (!cell.bake) return;
    for (const m of cell.bake) { group.remove(m); m.geometry.dispose(); }
    cell.bake = null; cell.bakeKey = '';
  }
  let baked = 0;
  function updateFar(cam, budget) {
    baked = 0;
    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];
      if (!cell.items.length) continue;
      const cd = cellDist(ci, cam);
      // which categories this cell bakes at this distance — the key changes only when a category crosses over
      let key = '';
      for (const c of ['tree', 'rock', 'log']) key += cd >= R[c][1] && cd < R[c][2] ? '1' : '0';
      if (key === '000') { dropBake(cell); continue; }
      if (cell.bakeKey === key && cell.bake) continue;
      if (baked >= budget) continue;
      dropBake(cell);
      cell.bake = bakeCell(ci, cam);
      cell.bakeKey = key;
      baked++;
    }
  }

  // --- the bridge, the sheds: built once, always drawn ---------------------------------------------------------------
  for (const o of uniques) {
    const mesh = uniqueMesh(o, M);
    if (!mesh) continue;
    mesh.position.set(o.x, o.y, o.z);
    mesh.rotation.y = o.yaw || 0;
    mesh.traverse(c => { if (c.isMesh) { c.castShadow = quality.shadows; c.receiveShadow = true; } });
    group.add(mesh);
  }

  // --- breaking -------------------------------------------------------------------------------------------------------
  const pieces = new Map();
  function breakObject(id, opts = {}) {
    const o = objs[id];
    if (!o || UNIQUE.has(o.kind) || state[id] === 1) return null;
    state[id] = o.fall === 'flatten' && !opts.instant ? 2 : 1;
    if (opts.instant && o.fall === 'flatten') state[id] = 2;
    dirty = true;
    const cell = cells[cellOf(o.x, o.z)];
    if (cell.bake) dropBake(cell);
    return state[id];
  }
  /** A standalone model of a broken object, origin at the object's base point, added to the scene. */
  function objectPiece(id) {
    if (pieces.has(id)) return pieces.get(id);
    const o = objs[id], inf = info[id];
    if (!o || !inf || o.fall === 'flatten') return null;
    const m = model(inf.look, inf.variant, 0);
    if (!m) return null;
    const g = new THREE.Group();
    g.name = `piece_${id}`;
    const inner = new THREE.Group();
    // the same sizing as the instanced copy, but relative to the base point
    matrixFor({ ...o, x: 0, y: 0, z: 0, yaw: 0 }, m, _m);
    inner.matrixAutoUpdate = false; inner.matrix.copy(_m);
    for (const p of m.parts) {
      const mesh = new THREE.Mesh(p.geo, p.mat);
      mesh.castShadow = quality.shadows; mesh.receiveShadow = true;
      inner.add(mesh);
    }
    g.add(inner);
    g.position.set(o.x, o.y, o.z);
    g.rotation.y = o.yaw || 0;
    if (inf.cat === 'rock' && o.tint) inner.children.forEach(c => { c.material = c.material.clone(); c.material.color.multiply(new THREE.Color(...o.tint)); });
    scene.add(g);
    pieces.set(id, g);
    return g;
  }

  return {
    group, materials: M,
    update(cam) {
      const dx = cam.x - ringCentre.x, dz = cam.z - ringCentre.z;
      if (dirty || dx * dx + dz * dz > 144) refillRing(cam);
      updateFar(cam, 3);
    },
    preload(cam) { refillRing(cam); updateFar(cam, 1e9); },
    breakObject, objectPiece,
    isBroken: (id) => state[id] !== 0,
    stats() {
      let inst = 0, meshes = 0;
      for (const b of buckets.values()) { inst += b.n; meshes += b.n ? b.meshes.length : 0; }
      let far = 0; for (const c of cells) if (c.bake) far += c.bake.length;
      return { instances: inst, ringMeshes: meshes, farMeshes: far, models: cache.size };
    },
    dispose() {
      for (const b of buckets.values()) for (const m of b.meshes) m.dispose();
      for (const c of cells) dropBake(c);
      for (const m of cache.values()) if (m) for (const p of m.parts) p.geo.dispose();
      for (const p of pieces.values()) scene.remove(p);
      for (const mat of Object.values(M)) mat.dispose();
    },
  };
}

// =====================================================================================================================
// geometry helpers — every geometry carries position, normal, uv, color, aWind (highdef's kit contract), so any of them
// can be merged with a kit model in the far bake.

/** Copy a geometry with a matrix applied (and an optional colour tint baked into its vertex colours). */
function stamp(geo, m, tint) {
  const g = (geo.index ? geo.toNonIndexed() : geo.clone());
  g.applyMatrix4(m);
  if (tint && g.attributes.color) {
    const c = g.attributes.color;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * tint[0], c.getY(i) * tint[1], c.getZ(i) * tint[2]);
  }
  for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color', 'aWind'].includes(name)) g.deleteAttribute(name);
  return g;
}

class Builder {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  quad(a, b, c, d, nrm, col, uvs) {
    const base = this.p.length / 3;
    for (const [v, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) {
      this.p.push(...v); this.n.push(...nrm); this.c.push(...col); this.uv.push(...t);
    }
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(a, b, c, nrm, col, uvs) {
    const base = this.p.length / 3;
    for (const [v, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]]]) { this.p.push(...v); this.n.push(...nrm); this.c.push(...col); this.uv.push(...t); }
    this.i.push(base, base + 1, base + 2);
  }
  /** An axis-aligned box, centre (cx, cy, cz), half sizes; uv in metres x k. */
  box(cx, cy, cz, hx, hy, hz, col, k = 0.5) {
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    const U = (a, b) => [[0, 0], [a * k, 0], [a * k, b * k], [0, b * k]];
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], col, U(2 * hx, 2 * hz));
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col.map(v => v * 0.6), U(2 * hx, 2 * hz));
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col, U(2 * hx, 2 * hy));
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], col, U(2 * hx, 2 * hy));
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], col, U(2 * hz, 2 * hy));
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col, U(2 * hz, 2 * hy));
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(new Float32Array((this.p.length / 3) * 2), 2));
    g.setIndex(this.i);
    return g;
  }
}

function boxGeometry(w, h, d, col) { const b = new Builder(); b.box(0, h / 2, 0, w / 2, h / 2, d / 2, col); return b.build(); }

/** A fence panel, 2.4 m long (local x), 1.2 m high, posts at the ends. */
function fenceGeometry() {
  const b = new Builder();
  const wood = [0.62, 0.52, 0.40], dark = [0.45, 0.37, 0.28];
  for (const x of [-1.14, 1.14]) b.box(x, 0.62, 0, 0.06, 0.62, 0.06, dark);
  b.box(0, 0.42, 0, 1.2, 0.05, 0.025, wood);
  b.box(0, 0.92, 0, 1.2, 0.05, 0.025, wood);
  return b.build();
}

/** A unit ramp: footprint x,z in [-1, 1], top rising from 0 at z = -1 to 2 at z = +1 (scaled by hx, hy, hz). */
function wedgeGeometry() {
  const b = new Builder();
  const col = [0.78, 0.68, 0.54], side = [0.6, 0.52, 0.42];
  const nTop = new THREE.Vector3(0, 2, -1).normalize().toArray();
  b.quad([-1, 0, -1], [1, 0, -1], [1, 2, 1], [-1, 2, 1], nTop, col, [[0, 0], [1, 0], [1, 2.2], [0, 2.2]]);
  b.quad([1, 0, 1], [-1, 0, 1], [-1, 2, 1], [1, 2, 1], [0, 0, 1], side, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  b.tri([1, 0, -1], [1, 0, 1], [1, 2, 1], [1, 0, 0], side, [[0, 0], [1, 0], [1, 1]]);
  b.tri([-1, 0, 1], [-1, 0, -1], [-1, 2, 1], [-1, 0, 0], side, [[0, 0], [1, 0], [0, 1]]);
  return b.build();
}

/** A log: a tapered cylinder along local z, radius 1, length 1, centred on the origin, with cut ends. */
function logGeometry(lod) {
  const sides = lod === 0 ? 10 : lod === 1 ? 7 : 5;
  const b = new Builder();
  const bark = [0.8, 0.74, 0.66], cut = [1.25, 1.05, 0.8];
  const ring = (z, r) => { const out = []; for (let s = 0; s <= sides; s++) { const a = (s / sides) * Math.PI * 2; out.push([Math.cos(a) * r, Math.sin(a) * r * 0.95, z]); } return out; };
  const segs = lod === 0 ? 4 : 2;
  for (let q = 0; q < segs; q++) {
    const za = -0.5 + q / segs, zb = -0.5 + (q + 1) / segs;
    const ra = 1 - 0.18 * (q / segs), rb = 1 - 0.18 * ((q + 1) / segs);
    const A = ring(za, ra), B = ring(zb, rb);
    for (let s = 0; s < sides; s++) {
      const a0 = (s / sides) * Math.PI * 2, nrm = [Math.cos(a0 + Math.PI / sides), Math.sin(a0 + Math.PI / sides), 0];
      const shade = 0.75 + 0.25 * Math.max(0, nrm[1]);
      b.quad(A[s], A[s + 1], B[s + 1], B[s], nrm, bark.map(v => v * shade), [[s / sides, za * 3], [(s + 1) / sides, za * 3], [(s + 1) / sides, zb * 3], [s / sides, zb * 3]]);
    }
  }
  for (const [z, r, nz] of [[-0.5, 1, -1], [0.5, 0.82, 1]]) {
    const R = ring(z, r);
    for (let s = 0; s < sides; s++) b.tri(nz > 0 ? R[s] : R[s + 1], nz > 0 ? R[s + 1] : R[s], [0, 0, z], [0, 0, nz], cut, [[0, 0], [0.1, 0], [0.05, 0.1]]);
  }
  return b.build();
}

/** The bridge parts and the sheds: one-off meshes built to their real size. Origin = the object's base point. */
function uniqueMesh(o, M) {
  const sh = o.shape;
  const g = new THREE.Group();
  if (o.kind === 'bridge_deck') {
    const b = new Builder();
    // planks across the deck, with a little gap and tone change, on two beams
    const L = sh.hz * 2, n = Math.floor(L / 0.5);
    for (let i = 0; i < n; i++) {
      const z = -sh.hz + (i + 0.5) * (L / n);
      const t = 0.82 + ((i * 7) % 5) * 0.05;
      b.box(0, sh.hy * 2 - 0.06, z, sh.hx, 0.06, L / n / 2 - 0.02, [0.7 * t, 0.6 * t, 0.47 * t], 0.6);
    }
    for (const x of [-sh.hx * 0.7, sh.hx * 0.7]) b.box(x, sh.hy * 0.8, 0, 0.25, sh.hy * 0.8, sh.hz, [0.42, 0.34, 0.26]);
    g.add(new THREE.Mesh(b.build(), M.wood));
  } else if (o.kind === 'bridge_rail') {
    const b = new Builder();
    const L = sh.hz * 2, n = Math.max(2, Math.round(L / 2.2));
    for (let i = 0; i <= n; i++) b.box(0, sh.hy, -sh.hz + i * (L / n), 0.09, sh.hy, 0.09, [0.48, 0.38, 0.29]);
    b.box(0, sh.hy * 2 - 0.06, 0, 0.07, 0.06, sh.hz, [0.6, 0.5, 0.38]);
    b.box(0, sh.hy * 1.1, 0, 0.05, 0.04, sh.hz, [0.6, 0.5, 0.38]);
    g.add(new THREE.Mesh(b.build(), M.wood));
  } else if (o.kind === 'bridge_pier') {
    const b = new Builder();
    b.box(0, sh.hy, 0, sh.hx, sh.hy, sh.hz, [0.9, 0.88, 0.84], 0.4);
    g.add(new THREE.Mesh(b.build(), M.rock));
  } else if (o.kind === 'shed') {
    const b = new Builder();
    const wall = [0.66, 0.55, 0.42], roof = [0.48, 0.36, 0.3];
    b.box(0, sh.hy, 0, sh.hx, sh.hy, sh.hz, wall, 0.4);                          // back wall (the collider)
    const roofLen = 7, y = sh.hy * 2 + 0.1;
    // a lean-to roof sloping down toward the pads (local -z), on brackets fixed to the wall
    const r = new Builder();
    const nrm = new THREE.Vector3(0, 1, -0.15).normalize().toArray();
    r.quad([-sh.hx - 0.4, y, sh.hz + 0.3], [sh.hx + 0.4, y, sh.hz + 0.3], [sh.hx + 0.4, y - 1.0, -roofLen], [-sh.hx - 0.4, y - 1.0, -roofLen], nrm, roof, [[0, 0], [sh.hx, 0], [sh.hx, roofLen], [0, roofLen]]);
    r.quad([sh.hx + 0.4, y - 0.08, sh.hz + 0.3], [-sh.hx - 0.4, y - 0.08, sh.hz + 0.3], [-sh.hx - 0.4, y - 1.08, -roofLen], [sh.hx + 0.4, y - 1.08, -roofLen], [0, -1, 0], roof.map(v => v * 0.6), [[0, 0], [1, 0], [1, 1], [0, 1]]);
    for (let x = -sh.hx + 1; x <= sh.hx - 1; x += (sh.hx * 2 - 2) / 4) b.box(x, y - 0.9, -1.5, 0.08, 0.5, 1.9, [0.45, 0.36, 0.28]);
    g.add(new THREE.Mesh(b.build(), M.wood));
    g.add(new THREE.Mesh(r.build(), M.wood));
  } else return null;
  return g;
}
