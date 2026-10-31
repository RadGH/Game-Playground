// Draws the world: ground chunks at three detail levels, roads, buildings and the bridge merged per map square, a river
// sheet, and two pools of instanced trees and lamps refilled around the camera. All of it is vertex-coloured Lambert,
// so a town is a handful of draw calls and the only texture on the screen is the sky.
//
//   const view = createWorldView({ THREE, scene, world, tier });
//   view.update(cameraPosition)         // cheap; does its real work four times a second
import { Batch, rgb } from './batch.js';
import { TIERS } from './gfx-tier.js';
import { drawBuilding } from './modern-kit.js';

const CH = 96;                         // grid cells per ground chunk (384 m)
const LOD = [2, 6, 24];                // grid cells per mesh cell at each detail level: 8, 24, 96 m
const CHUNK_M = 384;
const hash = (a, b) => { let h = Math.imul(a, 374761393) + Math.imul(b, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export function createWorldView({ THREE, scene, world, tier = 'low', enhance = m => m }) {
  const half = world.size / 2, dim = world.dim, cell = world.cell;
  const root = new THREE.Group(); root.name = 'world'; scene.add(root);
  const matGround = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  const matFlat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // buildings can be cut open: the shell of a tagged building sinks into the ground (js/client/interior-view.js draws what is inside)
  const cut = { uCutId: { value: new THREE.Vector3(-1, -1, -1) }, uCutK: { value: new THREE.Vector3(0, 0, 0) }, uCutY: { value: new THREE.Vector3(0, 0, 0) } };
  const matBuilding = new THREE.MeshLambertMaterial({ vertexColors: true });
  matBuilding.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, cut);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aTag; uniform vec3 uCutId; uniform vec3 uCutK; uniform vec3 uCutY;`).replace('#include <begin_vertex>', `#include <begin_vertex>
      for (int i = 0; i < 3; i++) if (abs(aTag - uCutId[i]) < 0.5) transformed.y = mix(transformed.y, uCutY[i], uCutK[i]);`);
  };
  matBuilding.customProgramCacheKey = () => 'oddhaven-building';
  const matRoad = new THREE.MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const chunkOf = (x, z) => [Math.max(0, Math.min(7, Math.floor((x + half) / CHUNK_M))), Math.max(0, Math.min(7, Math.floor((z + half) / CHUNK_M)))];
  const gridChunks = () => { const m = new Map(); return { of(x, z) { const [i, j] = chunkOf(x, z), k = j * 8 + i; if (!m.has(k)) m.set(k, new Batch(THREE)); return m.get(k); }, all: m }; };
  const stats = { roadTris: 0, buildingTris: 0 };

  // ---- ground --------------------------------------------------------------------------------------------------------
  const GRASS = rgb(THREE, '#6f9a4c'), GRASS2 = rgb(THREE, '#769f50'), DIRT = rgb(THREE, '#a89468'), SAND = rgb(THREE, '#c9b98c'), MUD = rgb(THREE, '#5e6a58'), HILL = rgb(THREE, '#7f9460');
  function groundColour(x, z, h, out, k) {
    const r = world.riverDistance(x, z), w = world.river.halfW, n = hash(Math.floor(x / 16), Math.floor(z / 16));
    let c = n > 0.5 ? GRASS : GRASS2;
    if (h > 40) c = HILL;
    const road = world.roadDistance(x, z);
    if (road < world.lane.halfW + 7 && r > 40) c = DIRT;
    const T = world.timber;
    if (T && ((x > T.deck[0] - 22 && x < T.rack[0] + 12 && z > T.deck[1] - 8 && z < T.truck.z + 12) || (Math.abs(x - T.landing[0]) < 14 && Math.abs(z - T.landing[1]) < 34))) c = DIRT;
    if (r < w + 18) c = SAND;
    if (r < w + 1) c = MUD;
    out[k] = c[0]; out[k + 1] = c[1]; out[k + 2] = c[2];
  }
  function chunkGeometry(ci, cj, step) {
    const n = Math.floor(CH / step), row = n + 1, verts = row * row + 4 * row;
    const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), col = new Float32Array(verts * 3);
    const X = i => -half + (ci * CH + i * step) * cell, Z = j => -half + (cj * CH + j * step) * cell, H = (i, j) => world.heights[Math.min(dim - 1, cj * CH + j * step) * dim + Math.min(dim - 1, ci * CH + i * step)];
    const idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      const k = (j * row + i) * 3, x = X(i), z = Z(j), h = H(i, j);
      pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
      const dx = H(Math.min(n, i + 1), j) - H(Math.max(0, i - 1), j), dz = H(i, Math.min(n, j + 1)) - H(i, Math.max(0, j - 1)), m = 2 * step * cell;
      const l = Math.sqrt(dx * dx + dz * dz + m * m); nor[k] = -dx / l; nor[k + 1] = m / l; nor[k + 2] = -dz / l;
      groundColour(x, z, h, col, k);
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const a = j * row + i, b = a + 1, c = a + row, d = c + 1; idx.push(a, c, b, b, c, d); }
    // a skirt round the edge hides the cracks where a neighbour is at another detail level
    let s = row * row;
    const skirt = (list, flip) => {
      const first = s;
      for (const v of list) { for (let c = 0; c < 3; c++) { pos[s * 3 + c] = pos[v * 3 + c]; nor[s * 3 + c] = nor[v * 3 + c]; col[s * 3 + c] = col[v * 3 + c]; } pos[s * 3 + 1] -= 7; s++; }
      for (let i = 0; i + 1 < list.length; i++) { const a = list[i], b = list[i + 1], c = first + i, d = first + i + 1; if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d); }
    };
    const north = [], south = [], west = [], east = [];
    for (let i = 0; i <= n; i++) { north.push(i); south.push(n * row + i); west.push(i * row); east.push(i * row + n); }
    skirt(north, true); skirt(south, false); skirt(west, false); skirt(east, true);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(X(n / 2), 20, Z(n / 2)), CHUNK_M * 0.76);
    return g;
  }
  const chunks = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), matGround);
    mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    chunks.push({ i, j, x: -half + (i + 0.5) * CHUNK_M, z: -half + (j + 0.5) * CHUNK_M, mesh, geos: [null, null, null], lod: -1 });
    root.add(mesh);
  }
  const setLod = (c, l) => {
    if (c.lod === l) return;
    c.geos[l] ||= chunkGeometry(c.i, c.j, LOD[l]);
    c.mesh.geometry = c.geos[l]; c.lod = l;
  };

  // ---- roads -----------------------------------------------------------------------------------------------------------
  const roads = gridChunks();
  const ASPHALT = rgb(THREE, '#4c4f54'), PAVE = rgb(THREE, '#b6b0a3'), LINE = rgb(THREE, '#ece6d4'), SHOULDER = rgb(THREE, '#8d8672'), KERB = rgb(THREE, '#8f8b84');
  /** A strip along a polyline [x,z,y] between two side offsets, split into map squares. */
  function strip(pts, off0, off1, lift, col) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1], p = pts[Math.max(0, i - 1)], q = pts[Math.min(pts.length - 1, i + 2)];
      const n = (u, v) => { const dx = v[0] - u[0], dz = v[1] - u[1], l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
      const na = n(p, b), nb = n(a, q);
      const hi = Math.max(off0, off1), lo = Math.min(off0, off1);     // faces up whichever way round the offsets came
      roads.of((a[0] + b[0]) / 2, (a[1] + b[1]) / 2).quad(
        [a[0] + na[0] * hi, a[2] + lift, a[1] + na[1] * hi], [b[0] + nb[0] * hi, b[2] + lift, b[1] + nb[1] * hi],
        [b[0] + nb[0] * lo, b[2] + lift, b[1] + nb[1] * lo], [a[0] + na[0] * lo, a[2] + lift, a[1] + na[1] * lo], col);
    }
  }
  const stride = (pts, k) => { const out = []; for (let i = 0; i < pts.length; i += k) out.push(pts[i]); if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]); return out; };
  const trimmed = (pts, s0, s1) => pts.slice(Math.round(s0 / 2), pts.length - Math.round(s1 / 2));
  const stubs = id => world.roadGraph.nodes.find(n => n.id === id).edges.length >= 3 ? world.lane.halfW + world.lane.pavement + 1.5 : 0;
  const { halfW, pavement } = world.lane;
  for (const r of world.roads) {
    const street = r.cls === 'street', line = street ? [r.pts[0], r.pts[r.pts.length - 1]] : stride(r.pts, 3);
    if (street) {
      const a = line[0], b = line[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L, ex = halfW + pavement;
      const long = [[a[0] - ux * ex, a[1] - uz * ex, a[2]], [b[0] + ux * ex, b[1] + uz * ex, b[2]]];
      for (const s of [-1, 1]) { strip(long, s * halfW, s * (halfW + pavement), 0.06, PAVE); strip(long, s * (halfW - 0.1), s * (halfW + 0.12), 0.08, KERB); }
      strip([[a[0] - ux * halfW, a[1] - uz * halfW, a[2]], [b[0] + ux * halfW, b[1] + uz * halfW, b[2]]], -halfW, halfW, 0.1, ASPHALT);
    } else {
      for (const s of [-1, 1]) strip(line, s * halfW, s * (halfW + 1.2), 0.05, SHOULDER);
      strip(line, -halfW, halfW, 0.1, ASPHALT);
      for (const s of [-1, 1]) strip(trimmed(line, 0, 0), s * (halfW - 0.35), s * (halfW - 0.2), 0.12, LINE);
    }
    // the dashes down the middle stop short of a junction
    const pts = trimmed(r.pts, stubs(r.from), stubs(r.to));
    for (let i = 0; i + 2 < pts.length; i += 5) strip([pts[i], pts[i + 2]], -0.08, 0.08, 0.12, LINE);
  }
  for (const f of world.footpaths) {
    const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]), ux = (f.b[0] - f.a[0]) / L, uz = (f.b[1] - f.a[1]) / L, ex = pavement / 2;
    strip([[f.a[0] - ux * ex, f.a[1] - uz * ex, f.y], [f.b[0] + ux * ex, f.b[1] + uz * ex, f.y]], -ex, ex, 0.06, PAVE);
  }
  const roadMeshes = [];
  for (const [k, b] of roads.all) {
    const m = new THREE.Mesh(b.geometry(), matRoad); m.matrixAutoUpdate = false; m.receiveShadow = true;
    stats.roadTris += b.tris; root.add(m); roadMeshes.push(m); void k;
  }

  // ---- buildings and the bridge ----------------------------------------------------------------------------------------
  const blds = gridChunks();
  const paint = hex => rgb(THREE, hex);
  world.buildings.forEach((b, i) => { b.tag = i + 1; drawBuilding(blds.of(b.x, b.z).tagged(i + 1), b, paint); });
  if (world.bridge) {
    const br = world.bridge, B = blds.of(br.cx, br.cz).tagged(0), sy = Math.sin(br.yaw), cy = Math.cos(br.yaw);
    const STEEL = rgb(THREE, '#7b8a92'), PIER = rgb(THREE, '#a39f94'), DECK = rgb(THREE, '#55585d');
    B.box(br.cx, br.deck - 0.8, br.cz, br.halfW, 0.4, br.len / 2, br.yaw, DECK, DECK);
    for (const side of [1, -1]) {
      const ox = cy * side * (br.halfW - 0.15), oz = -sy * side * (br.halfW - 0.15);
      B.box(br.cx + ox, br.deck, br.cz + oz, 0.14, 0.5, br.len / 2, br.yaw, STEEL);
      const posts = Math.floor(br.len / 6);
      for (let i = 0; i <= posts; i++) { const t = (i / posts - 0.5) * br.len; B.box(br.cx + ox + sy * t, br.deck, br.cz + oz + cy * t, 0.1, 0.72, 0.1, br.yaw, STEEL); }
    }
    for (const t of [-0.28, 0, 0.28]) B.box(br.cx + sy * t * br.len, world.river.level - 3, br.cz + cy * t * br.len, br.halfW - 1, (br.deck - world.river.level + 2.4) / 2, 0.9, br.yaw, PIER);
  }
  const buildingMeshes = [];
  for (const [, b] of blds.all) {
    const m = new THREE.Mesh(b.geometry(), matBuilding); m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
    stats.buildingTris += b.tris; root.add(m); buildingMeshes.push(m);
  }

  // ---- the river -------------------------------------------------------------------------------------------------------
  {
    const b = new Batch(THREE), P = world.river.pts, W = world.river.halfW + 5, y = world.river.level, col = [1, 1, 1];
    for (let i = 0; i + 2 < P.length; i += 2) {
      const a = P[i], c = P[i + 2], dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = -dz / l * W, nz = dx / l * W;
      const e = P[Math.min(P.length - 1, i + 4)], ex = e[0] - c[0], ez = e[1] - c[1], el = Math.hypot(ex, ez) || 1, mx = -ez / el * W, mz = ex / el * W;
      b.quad([a[0] + nx, y, a[1] + nz], [c[0] + mx, y, c[1] + mz], [c[0] - mx, y, c[1] - mz], [a[0] - nx, y, a[1] - nz], col);
    }
    const m = new THREE.Mesh(b.geometry(), new THREE.MeshLambertMaterial({ color: '#4f89a8', transparent: true, opacity: 0.86, side: THREE.DoubleSide }));
    m.matrixAutoUpdate = false; root.add(m);
  }

  // ---- trees and lamps: refilled round the camera ------------------------------------------------------------------------
  const tree = (() => {
    const T = THREE, trunk = new T.CylinderGeometry(0.2, 0.3, 3.2, 5); trunk.translate(0, 1.6, 0);
    const c1 = new T.ConeGeometry(2.2, 3.6, 7); c1.translate(0, 3.8, 0); const c2 = new T.ConeGeometry(1.7, 3.2, 7); c2.translate(0, 5.5, 0); const c3 = new T.ConeGeometry(1.1, 2.6, 6); c3.translate(0, 7.1, 0);
    const list = [[trunk, '#6b4a30', 0], [c1, '#3e7a3a', 1], [c2, '#468442', 1], [c3, '#4f9049', 1]];
    return mergeTinted(T, list);
  })();
  const lamp = (() => {
    const T = THREE, pole = new T.CylinderGeometry(0.05, 0.08, 4.8, 5); pole.translate(0, 2.4, 0);
    const arm = new T.BoxGeometry(0.06, 0.06, 1.2); arm.translate(0, 4.8, 0.55); const head = new T.BoxGeometry(0.22, 0.1, 0.5); head.translate(0, 4.75, 1.1);
    return mergeTinted(T, [[pole, '#44484c', 0], [arm, '#44484c', 0], [head, '#f4e7b8', 0]]);
  })();
  const treeMat = enhance(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const treePool = new THREE.InstancedMesh(tree, treeMat, 520), lampPool = new THREE.InstancedMesh(lamp, matFlat, 180);
  treePool.frustumCulled = lampPool.frustumCulled = false;
  treePool.castShadow = true;
  treePool.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(520 * 3).fill(1), 3);
  root.add(treePool, lampPool);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), tc = new THREE.Color();
  const lamps = world.lamps, trees = world.trees;
  function fillProps(cam, dir) {
    let n = 0; const R = TIERS[self.tier].propRadius, R2 = R * R;
    for (const t of trees) {
      const dx = t.x - cam.x, dz = t.z - cam.z, d = dx * dx + dz * dz;
      if (d > R2 || n >= 520) continue;
      if (d > 2500 && dx * dir.x + dz * dir.z < -24 * Math.sqrt(d) * 0.3) continue;
      m4.compose(p3.set(t.x, t.y, t.z), q.setFromAxisAngle(Y, t.tint * 6.28), s3.setScalar(t.s));
      treePool.setMatrixAt(n, m4); treePool.setColorAt(n, tc.setRGB(0.82 + t.tint * 0.3, 0.9 + t.tint * 0.15, 0.78 + (1 - t.tint) * 0.2));
      n++;
    }
    treePool.count = n; treePool.instanceMatrix.needsUpdate = true; treePool.instanceColor.needsUpdate = true;
    n = 0;
    for (const l of lamps) {
      const dx = l.x - cam.x, dz = l.z - cam.z;
      if (dx * dx + dz * dz > R2 * 0.6 || n >= 180) continue;
      m4.compose(p3.set(l.x, l.y, l.z), q.setFromAxisAngle(Y, l.yaw), s3.setScalar(1));
      lampPool.setMatrixAt(n++, m4);
    }
    lampPool.count = n; lampPool.instanceMatrix.needsUpdate = true;
  }

  let clock = 1, lx = 1e9, lz = 1e9;
  const look = new THREE.Vector3();
  const self = {
    root, stats, tier,
    setTier(t) { self.tier = t; clock = 1; lx = 1e9; },
    /** Town view looks down from the south, so a real five-storey block hides the street behind it: 1 = full height, less = cut down. */
    setBuildingHeight(k) {
      self.buildingHeight = k;
      for (const m of buildingMeshes) {
        if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
        const y0 = m.geometry.boundingBox.min.y;
        m.matrix.set(1, 0, 0, 0, 0, k, 0, y0 * (1 - k), 0, 0, 1, 0, 0, 0, 0, 1);
        m.matrixWorldNeedsUpdate = true;
      }
    },
    /** Up to three buildings open: [{ b, k }], k from 0 (whole) to 1 (shell gone). Their tag is matched in the vertex shader, so nothing is rebuilt. */
    setCut(list) {
      for (let i = 0; i < 3; i++) { const row = list[i]; cut.uCutId.value.setComponent(i, row ? row.b.tag : -1); cut.uCutK.value.setComponent(i, row ? row.k : 0); cut.uCutY.value.setComponent(i, row ? row.b.y - 0.35 : 0); }
    },
    /** force = do the slow part now (used when the camera jumps). */
    update(cam, dt = 0, camera = null, force = false) {
      clock += dt;
      if (!force && clock < 0.25) return;
      clock = 0;
      const S = TIERS[self.tier];
      for (const c of chunks) {
        const dx = Math.max(0, Math.abs(cam.x - c.x) - CHUNK_M / 2), dz = Math.max(0, Math.abs(cam.z - c.z) - CHUNK_M / 2), d = Math.hypot(dx, dz);
        setLod(c, d < S.lodNear * 0.5 ? 0 : d < S.lodFar ? 1 : 2);
        c.mesh.visible = d < S.fogFar + 40;
      }
      if (force || Math.hypot(cam.x - lx, cam.z - lz) > 12 || camera) {
        if (camera) camera.getWorldDirection(look); else look.set(0, 0, 1);
        fillProps(cam, look); lx = cam.x; lz = cam.z;
      }
    },
  };
  self.update(new THREE.Vector3(world.towns[0].x, 0, world.towns[0].z), 0, null, true);
  return self;
}

function mergeTinted(T, list) {
  const pos = [], nor = [], col = [], c = new T.Color();
  for (const [g0, hex] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0; g.computeVertexNormals(); c.set(hex);
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const out = new T.BufferGeometry();
  out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  return out;
}
