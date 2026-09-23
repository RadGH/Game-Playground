// Turning a list of points into a forest.
//
// The scatter pass decided WHERE everything goes. This decides how to draw it without asking the
// graphics card to do a hundred thousand separate things.
//
// Everything is instanced: one geometry, one material, one draw, many copies. Instances are
// grouped into 128 m cells so a cell can be given a detail level as a whole and so the ones behind
// you can be skipped entirely. A cell is built the first time it comes within range and rebuilt
// when its detail level changes, with a budget of a couple of cells a frame — building the whole
// view distance in one go is a visible freeze, spreading it over ten frames is invisible.
//
// Two geometries come out of the model kits for a plant: the woody part and the leafy part. They
// need different materials (leaves are alpha-cut and lit from both sides, wood is not), so each
// group becomes two instanced meshes sharing one set of positions.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { enhance } from './materials.js';
import { makeSurface, loadFoliageAtlas } from './kit/textures.js';
import * as Trees from './kit/trees.js';
import * as Rocks from './kit/rocks.js';

/** Which kit builder makes each layer, and how it should be lit. */
const LAYER_KIT = {
  trees:   { build: (k, o) => Trees.buildTree(k, o),          wood: 'bark',  wind: 0.55, shadow: true },
  bushes:  { build: (k, o) => Trees.buildBush(k, o),          wood: 'stem',  wind: 1.00, shadow: true },
  ferns:   { build: (k, o) => Trees.buildFern(k, o),          wood: 'stem',  wind: 1.20, shadow: false },
  flowers: { build: (k, o) => Trees.buildFlower(k, o),        wood: 'stem',  wind: 1.10, shadow: false },
  debris:  { build: (k, o) => Trees.buildLogsAndDebris(k, o), wood: 'bark',  wind: 0.10, shadow: true },
  rocks:   { build: (k, o) => rockAdapter(k, o),              wood: 'rock',  wind: 0.00, shadow: true },
  ground:  { build: (k, o) => groundAdapter(k, o),            wood: 'prop',  wind: 0.00, shadow: false },
};

/** The rock kit returns one geometry, not a bark/foliage pair — wrap it to match. */
function rockAdapter(kind, opts) {
  const r = Rocks.buildRock(kind, opts);
  return { bark: r.geometry, foliage: null, height: r.height, radius: r.radius, footprint: r.footprint };
}
function groundAdapter(kind, opts) {
  const r = Rocks.buildGroundDetail(kind, opts);
  return { bark: r.geometry, foliage: null, height: r.height, radius: r.radius, footprint: 0 };
}

/** How far each layer is drawn, and where its detail levels change. Metres. */
const RANGES = {
  trees:   { lod0: 62,  lod1: 155, max: 1.00 },   // max is a multiplier on quality.treeDistance
  bushes:  { lod0: 34,  lod1: 80,  max: 0.30 },
  ferns:   { lod0: 26,  lod1: 55,  max: 0.16 },
  flowers: { lod0: 20,  lod1: 42,  max: 0.12 },
  debris:  { lod0: 48,  lod1: 110, max: 0.36 },
  rocks:   { lod0: 55,  lod1: 130, max: 0.80 },
  ground:  { lod0: 28,  lod1: 60,  max: 0.18 },
};

// Metres. This is the grouping the graphics card sees, not the scatter's own grid.
//
// It is a balance, and the numbers are worth writing down because the obvious choice is wrong.
// Smaller cells give a sharper detail decision, but every cell costs at least one draw per species
// in it — at 64 m the forest came out as four hundred separate draws holding three trees each,
// which is the worst of both worlds. At 128 m the same forest is a couple of hundred draws holding
// twenty each, and the only cost is that a cell whose near edge is close keeps its far trees at
// full detail too. That is bounded (one cell's worth) and cheap; the draw calls were not.
const VEG_CELL = 128;

export async function createVegetation({ world, scatter, quality, csm, seed = 1 }) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const half = world.size / 2;

  // --- materials -------------------------------------------------------------------------------
  const atlas = await loadFoliageAtlas();
  atlas.texture.anisotropy = quality.anisotropy;

  const barkSurface = makeSurface('bark_pine', { size: quality.textureSize, seed: 3 });
  const rockSurface = makeSurface('rock', { size: quality.textureSize, seed: 11 });
  barkSurface.map.anisotropy = quality.anisotropy;
  rockSurface.map.anisotropy = quality.anisotropy;

  // Glowing bits — an ore seam, a rune, a crystal — are marked by the ROCK kit with a vertex
  // colour above 1.0, and everything above 1 becomes light.
  //
  // This is deliberately NOT applied to the plants. The tree kit also uses colours above 1, but
  // for something else entirely: a heather's purple tint is (1.0, 0.82, 1.15) and snow on a fir
  // is (1.7, 1.75, 1.9). Those are meant to brighten the surface through the ordinary vertex
  // colour multiply, not to emit — and treating them as emission put a glowing pink blob on
  // every heather bush in the world.
  const EMISSIVE = /* glsl */`
    totalEmissiveRadiance += max( vColor.rgb - vec3( 1.0 ), vec3( 0.0 ) ) * 1.35;
  `;

  const materials = {
    bark: enhance(new THREE.MeshStandardMaterial({
      map: barkSurface.map, normalMap: barkSurface.normalMap,
      vertexColors: true, roughness: 0.94, metalness: 0,
      normalScale: new THREE.Vector2(1.2, 1.2),
    }), { csm, wind: 0.35 }),

    stem: enhance(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.92, metalness: 0, color: 0xffffff,
    }), { csm, wind: 0.9 }),

    foliage: enhance(new THREE.MeshStandardMaterial({
      // The sprites are drawn with soft edges. At 0.42 the cut-off eats a wide band off every
      // leaf and the canopy comes out looking half dead; 0.26 keeps the shape and still gives the
      // hard edge that alpha testing exists for.
      map: atlas.texture, alphaTest: 0.26, transparent: false,
      side: THREE.DoubleSide, vertexColors: true,
      roughness: 0.88, metalness: 0,
    }), { csm, wind: 1.0 }),

    // Rocks are textured from three directions at once so a cliff face does not smear, and the
    // vertex colour is a tint on top rather than the colour itself.
    rock: enhance(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.86, metalness: 0, color: 0x9c9a95,
    }), {
      csm, wind: false,
      uniforms: { tRock: { value: rockSurface.map }, uRockScale: { value: 0.28 } },
      vertex: {
        pars: 'varying vec3 vHdWorld;\nvarying vec3 vHdWorldN;',
        main: `
          mat4 hdModel = modelMatrix;
          #ifdef USE_INSTANCING
            hdModel = modelMatrix * instanceMatrix;
          #endif
          vHdWorld = ( hdModel * vec4( transformed, 1.0 ) ).xyz;
          vHdWorldN = normalize( mat3( hdModel ) * objectNormal );
        `,
      },
      fragment: {
        pars: `
          uniform sampler2D tRock;
          uniform float uRockScale;
          varying vec3 vHdWorld;
          varying vec3 vHdWorldN;
        `,
        map: `
          {
            vec3 n = normalize( vHdWorldN );
            vec3 b = pow( abs( n ), vec3( 4.0 ) ); b /= ( b.x + b.y + b.z );
            vec3 t = texture2D( tRock, vHdWorld.zy * uRockScale ).rgb * b.x
                   + texture2D( tRock, vHdWorld.xz * uRockScale ).rgb * b.y
                   + texture2D( tRock, vHdWorld.xy * uRockScale ).rgb * b.z;
            diffuseColor.rgb *= t * 1.35;
          }
        `,
        emissive: EMISSIVE,
      },
    }),

    // Props and ground decals already carry their colour in the vertex colour, so the material
    // must not tint them again.
    prop: enhance(new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0, color: 0xffffff,
    }), { csm, wind: 0.25, fragment: { emissive: EMISSIVE } }),
  };
  materials.foliage.alphaToCoverage = !!quality.msaa;

  // --- geometry catalogue ------------------------------------------------------------------------
  // Built on demand and kept. A species at one detail level is the same mesh wherever it appears,
  // so there is never more than (kinds x variants x levels) of them.
  const VARIANTS = 3;
  const geoCache = new Map();
  function geoFor(layer, kind, variant, lod) {
    // Distant copies do not need to differ from one another — nobody can tell at 300 m, and
    // collapsing them there cuts the number of separate draws by two thirds.
    const v = lod === 0 ? variant : 0;
    const key = `${layer}|${kind}|${v}|${lod}`;
    let hit = geoCache.get(key);
    if (hit !== undefined) return hit;
    const kit = LAYER_KIT[layer];
    let built = null;
    try {
      const rng = Trees.makeRng((hashStr(key) ^ seed) >>> 0);
      built = kit.build(kind, { rng, lod, seed: (hashStr(key) ^ seed) >>> 0 });
    } catch (e) {
      console.warn(`[vegetation] ${layer}/${kind} failed to build:`, e.message);
      built = null;
    }
    geoCache.set(key, built);
    return built;
  }

  // --- re-bucket the scatter into vegetation cells -------------------------------------------------
  const cells = new Map();   // "layer|cx,cz" -> instance array
  const cellList = [];       // one entry per live cell, for the update loop
  for (const layer of Object.keys(LAYER_KIT)) {
    const src = scatter[layer];
    if (!src) continue;
    for (const arr of src.values()) {
      for (const p of arr) {
        const cx = Math.floor((p.x + half) / VEG_CELL);
        const cz = Math.floor((p.z + half) / VEG_CELL);
        const key = `${layer}|${cx},${cz}`;
        let bucket = cells.get(key);
        if (!bucket) {
          bucket = { layer, cx, cz, items: [], lod: -1, meshes: [], centre: new THREE.Vector3(
            -half + (cx + 0.5) * VEG_CELL, 0, -half + (cz + 0.5) * VEG_CELL) };
          bucket.centre.y = world.heightAt(bucket.centre.x, bucket.centre.z);
          cells.set(key, bucket);
          cellList.push(bucket);
        }
        bucket.items.push(p);
      }
    }
  }

  // --- building a cell ------------------------------------------------------------------------------
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();

  function buildCell(cell, lod) {
    disposeCell(cell);
    const kit = LAYER_KIT[cell.layer];
    // group by kind + variant so each group is one geometry
    const groups = new Map();
    for (const it of cell.items) {
      const v = lod === 0 ? it.variant % VARIANTS : 0;
      const k = `${it.kind}|${v}`;
      let g = groups.get(k);
      if (!g) { g = { kind: it.kind, variant: v, items: [] }; groups.set(k, g); }
      g.items.push(it);
    }

    for (const g of groups.values()) {
      const built = geoFor(cell.layer, g.kind, g.variant, lod);
      if (!built) continue;
      const n = g.items.length;
      const pieces = [
        { geo: built.bark, mat: materials[kit.wood] },
        { geo: built.foliage, mat: materials.foliage },
      ];
      const matrices = [];
      for (let i = 0; i < n; i++) {
        const it = g.items[i];
        _p.set(it.x, it.y, it.z);
        _e.set(it.tiltX || 0, it.rot || 0, it.tiltZ || 0, 'YXZ');
        _q.setFromEuler(_e);
        _s.setScalar(it.scale || 1);
        matrices.push(new THREE.Matrix4().compose(_p, _q, _s));
      }

      for (const piece of pieces) {
        if (!piece.geo || piece.geo.attributes.position.count === 0) continue;
        let mesh;
        if (lod >= 2) {
          // The far ring gets BAKED instead of instanced. At this level a tree is 22 triangles,
          // so stamping two hundred of them into one geometry costs nothing to build and turns
          // two hundred draws into one — which is the difference between a horizon full of trees
          // and a horizon you cannot afford.
          const merged = bakeInstances(piece.geo, matrices);
          if (!merged) continue;
          mesh = new THREE.Mesh(merged, piece.mat);
          mesh.castShadow = false;
          mesh.receiveShadow = false;
        } else {
          mesh = new THREE.InstancedMesh(piece.geo, piece.mat, n);
          for (let i = 0; i < n; i++) mesh.setMatrixAt(i, matrices[i]);
          mesh.instanceMatrix.needsUpdate = true;
          // Only the near levels cast. Every shadow caster is drawn again once per cascade, so a
          // distant tree that casts costs four extra draws for a shadow nobody can make out.
          mesh.castShadow = kit.shadow && lod === 0;
          mesh.receiveShadow = true;
          mesh.computeBoundingSphere();
        }
        mesh.frustumCulled = true;
        mesh.name = `${cell.layer}_${g.kind}_${lod}`;
        group.add(mesh);
        cell.meshes.push(mesh);
      }
    }
    // Merge the far ring's separate kinds together: at this distance every tree in a cell is
    // drawn with the same two materials, so the whole cell becomes two draws.
    if (lod >= 2) collapseCell(cell);
    cell.lod = lod;
  }

  /**
   * Stamp copies of one geometry into a single new one, each with its own transform applied.
   * Normals get the transform too (rotation only — every transform here is a rotation and a
   * uniform scale, so the matrix itself is fine for normals once it is renormalised).
   */
  function bakeInstances(geo, matrices) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const count = src.attributes.position.count;
    const total = count * matrices.length;
    if (total === 0 || total > 3_000_000) return null;
    const names = Object.keys(src.attributes);
    const out = new THREE.BufferGeometry();
    const buffers = {};
    for (const name of names) {
      const a = src.attributes[name];
      buffers[name] = { array: new Float32Array(total * a.itemSize), size: a.itemSize, src: a };
    }
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3();
    for (let m = 0; m < matrices.length; m++) {
      const mat = matrices[m];
      nm.setFromMatrix4(mat);
      const base = m * count;
      for (const name of names) {
        const b = buffers[name];
        const a = b.src;
        if (name === 'position') {
          for (let i = 0; i < count; i++) {
            v.fromBufferAttribute(a, i).applyMatrix4(mat);
            const k = (base + i) * 3;
            b.array[k] = v.x; b.array[k + 1] = v.y; b.array[k + 2] = v.z;
          }
        } else if (name === 'normal') {
          for (let i = 0; i < count; i++) {
            v.fromBufferAttribute(a, i).applyMatrix3(nm).normalize();
            const k = (base + i) * 3;
            b.array[k] = v.x; b.array[k + 1] = v.y; b.array[k + 2] = v.z;
          }
        } else {
          b.array.set(a.array.subarray(0, count * b.size), base * b.size);
        }
      }
    }
    for (const name of names) out.setAttribute(name, new THREE.BufferAttribute(buffers[name].array, buffers[name].size));
    out.computeBoundingSphere();
    if (src !== geo) src.dispose();
    return out;
  }

  /** Join a cell's far-ring meshes so there is one per material rather than one per species. */
  function collapseCell(cell) {
    if (cell.meshes.length < 2) return;
    const byMat = new Map();
    for (const m of cell.meshes) {
      if (!m.isMesh || m.isInstancedMesh) continue;
      const list = byMat.get(m.material) || [];
      list.push(m);
      byMat.set(m.material, list);
    }
    const kept = [];
    for (const [mat, list] of byMat) {
      if (list.length < 2) { kept.push(...list); continue; }
      const geos = list.map(m => m.geometry);
      let merged = null;
      try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
      if (!merged) { kept.push(...list); continue; }
      for (const m of list) { group.remove(m); m.geometry.dispose(); }
      merged.computeBoundingSphere();
      const one = new THREE.Mesh(merged, mat);
      one.castShadow = false; one.receiveShadow = false; one.frustumCulled = true;
      one.name = 'far';
      group.add(one);
      kept.push(one);
    }
    for (const m of cell.meshes) if (!kept.includes(m) && m.parent) group.remove(m);
    cell.meshes = kept;
  }

  function disposeCell(cell) {
    for (const m of cell.meshes) {
      group.remove(m);
      // a baked far-ring mesh owns its geometry; an instanced one shares the catalogue's
      if (!m.isInstancedMesh) m.geometry.dispose();
      m.dispose?.();
    }
    cell.meshes.length = 0;
    cell.lod = -1;
  }

  // --- per-frame ------------------------------------------------------------------------------------
  let built = 0;
  const stats = { cells: 0, meshes: 0, instances: 0 };

  function lodForLayer(layer, dist) {
    const r = RANGES[layer];
    if (dist < r.lod0) return 0;
    if (dist < r.lod1) return 1;
    return 2;
  }

  function update(cameraPos, budget = 2) {
    built = 0;
    stats.cells = 0; stats.meshes = 0; stats.instances = 0;
    const todo = [];
    for (const cell of cellList) {
      const r = RANGES[cell.layer];
      const maxDist = Math.min(quality.treeDistance * r.max, quality.terrainViewDistance);
      // Distance to the NEAREST point of the cell, not its middle. Measuring to the middle keeps
      // full detail half a cell too far out in every direction, which is exactly how you end up
      // drawing a horizon's worth of close-up trees.
      const dx = Math.max(0, Math.abs(cell.centre.x - cameraPos.x) - VEG_CELL * 0.5);
      const dz = Math.max(0, Math.abs(cell.centre.z - cameraPos.z) - VEG_CELL * 0.5);
      const dist = Math.hypot(dx, dz);
      if (dist > maxDist) {
        if (cell.lod >= 0) disposeCell(cell);
        continue;
      }
      const lod = lodForLayer(cell.layer, dist);
      if (cell.lod !== lod) { todo.push({ cell, lod, dist }); continue; }
      stats.cells++;
      stats.meshes += cell.meshes.length;
      stats.instances += cell.items.length;
    }
    todo.sort((a, b) => a.dist - b.dist);
    for (const t of todo) {
      if (built >= budget) break;
      buildCell(t.cell, t.lod);
      built++;
      stats.cells++;
      stats.meshes += t.cell.meshes.length;
      stats.instances += t.cell.items.length;
    }
  }

  /** Build everything within `radius` straight away, for the loading screen. */
  function preload(centre, radius = 160) {
    for (const cell of cellList) {
      const dx = Math.max(0, Math.abs(cell.centre.x - centre.x) - VEG_CELL * 0.5);
      const dz = Math.max(0, Math.abs(cell.centre.z - centre.z) - VEG_CELL * 0.5);
      const dist = Math.hypot(dx, dz);
      if (dist > radius) continue;
      buildCell(cell, lodForLayer(cell.layer, dist));
    }
  }

  /**
   * Trees and rocks you cannot walk through. Only the big things get a collider — a fern should
   * not stop a person, and testing against every flower would cost more than it is worth.
   */
  function collidersNear(x, z, radius) {
    const out = [];
    for (const cell of cellList) {
      if (cell.layer !== 'trees' && cell.layer !== 'rocks') continue;
      if (Math.abs(cell.centre.x - x) > VEG_CELL + radius) continue;
      if (Math.abs(cell.centre.z - z) > VEG_CELL + radius) continue;
      for (const it of cell.items) {
        const d2 = (it.x - x) ** 2 + (it.z - z) ** 2;
        if (d2 > radius * radius) continue;
        const r = cell.layer === 'trees'
          ? (it.kind === 'sapling' || it.kind === 'stump' ? 0.22 : 0.42) * (it.scale || 1)
          : 0.9 * (it.scale || 1);
        out.push({ x: it.x, z: it.z, r, kind: it.kind, layer: cell.layer });
      }
    }
    return out;
  }

  return {
    group, materials, atlas, cells: cellList, update, preload, collidersNear, stats,
    get geometryCount() { return geoCache.size; },
    get builtLastFrame() { return built; },
    dispose() {
      for (const cell of cellList) disposeCell(cell);
      for (const g of geoCache.values()) { g?.bark?.dispose(); g?.foliage?.dispose(); }
      geoCache.clear();
      for (const m of Object.values(materials)) m.dispose();
      atlas.texture.dispose();
    },
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
