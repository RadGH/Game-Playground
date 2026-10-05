// Hunters vs Farmers — the forest in three.js (stream H view). Built once per match from the static
// world (js/sim/modes/hvf/mapgen.js); trees chopped during the match are hidden by zeroing their
// instance matrix. Every material is "fogified": a shader patch darkens what the local team cannot
// see now and greys what it only remembers (the fog of war texture, updated from the sim's bitsets).
//
//   const world = createHvfWorld(scene, map);   world.setFog(bits, explored); world.syncChopped(list);
//   world.fogify(material) for actors' materials; world.dispose()

import * as THREE from 'three';
import { KIND } from '../../sim/modes/hvf/mapgen.js';
import { createNatureLayer, natureMaterial } from '../hvf-nature.js';

export const PLATEAU_H = 3.2;   // metres a plateau stands above the ground
const WATER_Y = -0.12;

// ground colours per kind (linear-ish sRGB picks; lit by the scene lights)
const COL = {
  [KIND.grass]: [0.30, 0.52, 0.12], [KIND.trail]: [0.70, 0.52, 0.28], [KIND.tree]: [0.12, 0.26, 0.07],
  [KIND.briar]: [0.30, 0.22, 0.12], [KIND.tallgrass]: [0.52, 0.58, 0.14], [KIND.rock]: [0.40, 0.40, 0.38],
  [KIND.water]: [0.16, 0.24, 0.22], [KIND.ford]: [0.42, 0.48, 0.40], [KIND.cliff]: [0.38, 0.30, 0.20], [KIND.ramp]: [0.60, 0.46, 0.26],
};
const CLIFF_SIDE = [0.36, 0.30, 0.24];
const BANK_SIDE = [0.32, 0.26, 0.18];

function hash(x, z, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function cellHeight(map, i) {
  const k = map.cells[i];
  if (k === KIND.water) return -0.7;
  if (k === KIND.ford) return -0.28;
  return map.level[i] ? PLATEAU_H : 0;
}

/** World y of the ground at (x, z) (ramps blend). */
export function groundY(map, x, z) {
  const cx = Math.max(0, Math.min(map.cols - 1, Math.floor(x / map.cell))), cz = Math.max(0, Math.min(map.rows - 1, Math.floor(z / map.cell)));
  const i = cz * map.cols + cx;
  if (map.cells[i] === KIND.ramp) return PLATEAU_H * 0.5;
  return Math.max(0, cellHeight(map, i));
}

/** opts.nature (default true): stream C's chunked forest (js/view/hvf-nature.js: 3 tree looks, near/far detail,
 *  chop shake + stumps, reeds, ford stones, cliff boulders) instead of the built-in instanced buckets. */
export function createHvfWorld(scene, map, { nature = true } = {}) {
  const group = new THREE.Group();
  group.name = 'hvf-world';
  scene.add(group);
  const { cols, rows, cell } = map;
  const disposables = [];

  // ── fog of war texture + shader patch ──
  // one texture per team: split screen with a farmer and a hunter draws each half with its own fog
  const fogTexes = [0, 1].map(() => {
    const t = new THREE.DataTexture(new Uint8Array(cols * rows * 4), cols, rows, THREE.RGBAFormat);
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
    return t;
  });
  const fogTex = fogTexes[0];
  const fogUniforms = { uFogTex: { value: fogTex }, uFogSize: { value: new THREE.Vector2(cols * cell, rows * cell) }, uFogOn: { value: 1 } };
  function fogify(mat) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, fogUniforms);
      sh.vertexShader = 'varying vec3 vFogWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vec4 fwp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          fwp = instanceMatrix * fwp;
        #endif
        vFogWorld = (modelMatrix * fwp).xyz;`);
      sh.fragmentShader = 'uniform sampler2D uFogTex;\nuniform vec2 uFogSize;\nuniform float uFogOn;\nvarying vec3 vFogWorld;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        float fv = texture2D(uFogTex, vFogWorld.xz / uFogSize).r;
        fv = mix(1.0, fv, uFogOn);
        vec3 grey = vec3(dot(gl_FragColor.rgb, vec3(0.3, 0.59, 0.11)));
        vec3 remembered = mix(grey, gl_FragColor.rgb, 0.35) * 0.55;
        gl_FragColor.rgb = fv < 0.5 ? mix(gl_FragColor.rgb * 0.13, remembered, smoothstep(0.05, 0.5, fv)) : mix(remembered, gl_FragColor.rgb, smoothstep(0.5, 0.95, fv));`);
    };
    mat.customProgramCacheKey = () => 'hvf-fog';
    return mat;
  }

  // ── ground: one flat quad per cell at its height, plus walls where neighbours differ ──
  const pos = [], colr = [];
  const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, c) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
    for (let k = 0; k < 6; k++) colr.push(c[0], c[1], c[2]);
  };
  const H = new Float32Array(cols * rows);
  for (let i = 0; i < H.length; i++) H[i] = cellHeight(map, i);
  const rampCorner = (x, z) => {
    // a ramp corner is high when it touches a non-ramp plateau cell
    for (const [dx, dz] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const cx = x + dx, cz = z + dz;
      if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) continue;
      const j = cz * cols + cx;
      if (map.level[j] && map.cells[j] !== KIND.ramp) return PLATEAU_H;
    }
    return 0;
  };
  for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
    const i = z * cols + x, k = map.cells[i];
    const n = 0.9 + hash(x, z, 1) * 0.2;
    const base = COL[k];
    const c = [base[0] * n, base[1] * n, base[2] * n];
    const x0 = x * cell, x1 = x0 + cell, z0 = z * cell, z1 = z0 + cell;
    if (k === KIND.ramp) {
      quad(x0, rampCorner(x, z), z0, x0, rampCorner(x, z + 1), z1, x1, rampCorner(x + 1, z + 1), z1, x1, rampCorner(x + 1, z), z0, c);
      continue;
    }
    const y = H[i];
    quad(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0, c);
    // walls toward lower neighbours (+x and +z handled here, -x and -z by symmetry below)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= cols || nz >= rows) continue;
      const j = nz * cols + nx;
      if (map.cells[j] === KIND.ramp) continue;
      const y2 = H[j];
      if (y2 >= y - 0.01) continue;
      const side = y > 1 ? CLIFF_SIDE : BANK_SIDE, s = 0.85 + hash(x, z, 9) * 0.25;
      const sc = [side[0] * s, side[1] * s, side[2] * s];
      if (dx === 1) quad(x1, y, z1, x1, y2, z1, x1, y2, z0, x1, y, z0, sc);
      else if (dx === -1) quad(x0, y, z0, x0, y2, z0, x0, y2, z1, x0, y, z1, sc);
      else if (dz === 1) quad(x0, y, z1, x0, y2, z1, x1, y2, z1, x1, y, z1, sc);
      else quad(x1, y, z0, x1, y2, z0, x0, y2, z0, x0, y, z0, sc);
    }
  }
  const gGeo = new THREE.BufferGeometry();
  gGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  gGeo.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
  gGeo.computeVertexNormals();
  const gMat = fogify(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.name = 'hvf-ground';
  group.add(ground);
  disposables.push(gGeo, gMat);

  // water: one sheet over the whole map (the ground stands above it everywhere but ponds and fords)
  const wGeo = new THREE.PlaneGeometry(cols * cell, rows * cell);
  wGeo.rotateX(-Math.PI / 2); wGeo.translate(cols * cell / 2, WATER_Y, rows * cell / 2);
  const wMat = fogify(new THREE.MeshLambertMaterial({ color: 0x3f7fa4, transparent: true, opacity: 0.78 }));
  const water = new THREE.Mesh(wGeo, wMat);
  water.renderOrder = 1;
  group.add(water);
  disposables.push(wGeo, wMat);

  // ── instanced vegetation and rocks ──
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s3 = new THREE.Vector3(), p3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const colorGeo = (geo, c) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) { a[3 * k] = c[0]; a[3 * k + 1] = c[1]; a[3 * k + 2] = c[2]; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
  const merge = (parts) => {
    const geos = parts.map((g) => (g.index ? g.toNonIndexed() : g));
    let n = 0; for (const g of geos) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), C = new Float32Array(n * 3);
    let o = 0;
    for (const g of geos) { P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3));
    out.computeVertexNormals();
    return out;
  };
  // an edge tree: trunk + two cones; an interior tree: one wide cone (cheap, the canopy reads as a mass)
  const trunk = colorGeo(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 5).translate(0, 0.6, 0), [0.36, 0.25, 0.15]);
  const coneA = colorGeo(new THREE.ConeGeometry(1.05, 2.4, 6).translate(0, 2.0, 0), [0.24, 0.40, 0.19]);
  const coneB = colorGeo(new THREE.ConeGeometry(0.78, 1.9, 6).translate(0, 3.1, 0), [0.28, 0.45, 0.21]);
  const edgeGeo = merge([trunk, coneA, coneB]);
  const innerGeo = merge([colorGeo(new THREE.ConeGeometry(1.25, 3.6, 5).translate(0, 2.2, 0), [0.22, 0.36, 0.17])]);
  const broadGeo = merge([trunk, colorGeo(new THREE.IcosahedronGeometry(1.1, 0).translate(0, 2.0, 0), [0.30, 0.44, 0.18])]);   // orchard / deadfall
  const rockGeo = merge([colorGeo(new THREE.DodecahedronGeometry(0.8, 0).scale(1, 0.7, 1).translate(0, 0.35, 0), [0.52, 0.52, 0.5])]);
  const briarGeo = merge([colorGeo(new THREE.IcosahedronGeometry(0.62, 0).scale(1, 0.62, 1).translate(0, 0.38, 0), [0.32, 0.22, 0.24]),
    colorGeo(new THREE.IcosahedronGeometry(0.42, 0).translate(0.45, 0.32, 0.3), [0.38, 0.24, 0.30])]);
  const bladeParts = [];
  for (let b = 0; b < 5; b++) { const a = b * 1.26; bladeParts.push(colorGeo(new THREE.ConeGeometry(0.09, 0.85, 3).translate(Math.sin(a) * 0.45, 0.42, Math.cos(a) * 0.45), [0.62, 0.66, 0.28])); }
  const tuftGeo = merge(bladeParts);
  disposables.push(edgeGeo, innerGeo, broadGeo, rockGeo, briarGeo, tuftGeo);
  const vegMat = fogify(new THREE.MeshLambertMaterial({ vertexColors: true }));
  disposables.push(vegMat);

  const isTree = (x, z) => x < 0 || z < 0 || x >= cols || z >= rows || map.cells[z * cols + x] === KIND.tree;
  const buckets = { edge: [], inner: [], broad: [], rock: [], briar: [], tuft: [] };
  let layer = null;
  if (nature) {
    try {
      const nm = fogify(natureMaterial()); nm.needsUpdate = true;
      layer = createNatureLayer(scene, map, { KIND, groundY, material: nm });
    } catch (err) { console.warn('hvf nature layer unavailable, using the built-in trees', err); layer = null; }
  }
  for (let z = 0; z < rows && !layer; z++) for (let x = 0; x < cols; x++) {
    const i = z * cols + x, k = map.cells[i];
    if (k === KIND.tree) {
      const inner = isTree(x + 1, z) && isTree(x - 1, z) && isTree(x, z + 1) && isTree(x, z - 1) && isTree(x + 1, z + 1) && isTree(x - 1, z - 1);
      buckets[map.look[i] >= 3 ? 'broad' : inner ? 'inner' : 'edge'].push(i);
    } else if (k === KIND.rock) buckets.rock.push(i);
    else if (k === KIND.briar) buckets.briar.push(i);
    else if (k === KIND.tallgrass) buckets.tuft.push(i);
  }
  const treeSlot = new Map();   // cell -> { mesh, index } (chopping hides the instance)
  const meshes = {};
  const TINTS = [[1, 1, 1], [0.86, 0.98, 0.84], [1.08, 1.0, 0.82], [1.15, 1.05, 0.8], [1.25, 0.95, 0.72]];
  for (const [name, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const geo = { edge: edgeGeo, inner: innerGeo, broad: broadGeo, rock: rockGeo, briar: briarGeo, tuft: tuftGeo }[name];
    const mesh = new THREE.InstancedMesh(geo, vegMat, list.length);
    mesh.name = 'hvf-' + name;
    const col = new THREE.Color();
    list.forEach((i, n) => {
      const x = i % cols, z = (i / cols) | 0;
      const jx = (hash(x, z, 3) - 0.5) * 0.7, jz = (hash(x, z, 4) - 0.5) * 0.7;
      const sc = name === 'inner' ? 0.95 + hash(x, z, 5) * 0.35 : name === 'tuft' ? 0.8 + hash(x, z, 5) * 0.5 : 0.8 + hash(x, z, 5) * 0.45;
      p3.set((x + 0.5) * cell + jx, Math.max(0, cellHeight(map, i)), (z + 0.5) * cell + jz);
      q.setFromAxisAngle(up, hash(x, z, 6) * 6.283);
      s3.set(sc, sc * (name === 'edge' || name === 'inner' ? 0.85 + hash(x, z, 7) * 0.4 : 1), sc);
      m4.compose(p3, q, s3);
      mesh.setMatrixAt(n, m4);
      const t = name === 'edge' || name === 'inner' || name === 'broad' ? TINTS[map.look[i] % TINTS.length] : [1, 1, 1];
      const v = 0.9 + hash(x, z, 8) * 0.2;
      col.setRGB(t[0] * v, t[1] * v, t[2] * v);
      mesh.setColorAt(n, col);
      if (name === 'edge' || name === 'inner' || name === 'broad' || name === 'briar') treeSlot.set(i, { mesh, index: n });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes[name] = mesh;
  }

  // ── fog update ──
  let fogOn = true;
  function setFog(vision, explored, team = 0) {
    const fogData = fogTexes[team].image.data;
    for (let i = 0, n = cols * rows; i < n; i++) {
      const w = i >> 5, b = 1 << (i & 31);
      const v = (vision[w] & b) ? 255 : (explored[w] & b) ? 120 : 0;
      fogData[i * 4] = v;
    }
    fogTexes[team].needsUpdate = true;
  }

  let choppedSeen = 0;
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  /** Hide trees / briar cut since the last call (state.hvf.chopped is sorted, so compare by set). */
  function syncChopped(list) {
    if (layer) { if (list.length !== choppedSeen) { choppedSeen = list.length; layer.syncChopped(list); } return; }
    if (list.length === choppedSeen) return;
    choppedSeen = list.length;
    const touched = new Set();
    for (const i of list) {
      const slot = treeSlot.get(i);
      if (!slot) continue;
      slot.mesh.setMatrixAt(slot.index, zero);
      touched.add(slot.mesh);
      treeSlot.delete(i);
    }
    for (const m of touched) m.instanceMatrix.needsUpdate = true;
  }

  return {
    group, fogify, setFog, syncChopped, meshes, nature: layer,
    /** Per viewport, before it draws: the forest's near/far detail and culling for this camera. */
    update(camera, dt = 0) { layer?.update(camera, dt); },
    /** A tree being cut: 0..1 (it shakes and leans), 1 = gone (stump + log). */
    chop(cell, k) { layer?.chop(cell, k); },
    /** Draw with this team's fog (call before rendering a viewport). */
    useTeam(team) { fogUniforms.uFogTex.value = fogTexes[team]; },
    get fogOn() { return fogOn; },
    setFogOn(v) { fogOn = !!v; fogUniforms.uFogOn.value = fogOn ? 1 : 0; },
    bounds: { x0: 0, x1: cols * cell, z0: 0, z1: rows * cell },
    dispose() { scene.remove(group); for (const d of disposables) d.dispose(); for (const m of Object.values(meshes)) m.dispose(); for (const t of fogTexes) t.dispose(); layer?.dispose(); },
  };
}
