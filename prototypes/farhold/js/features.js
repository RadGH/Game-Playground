// Farhold — the things the map already knew about: rivers, roads, bridges and settlements.
//
// World Forge traces every river from its source to the sea, lays an A* road network between the
// towns it founded, and records where those towns are and how big they got. Phase 1 ignored all of
// it. This file draws it.
//
//   const features = createFeatures(scene, terrain, { palette, seed });
//   features.update(player.x, player.z);
//
// Rivers and roads are not painted on top of the ground — `js/planet.js` carves them into the
// terrain height itself, so a river runs along the floor of its own valley and a road sits in a
// shallow cutting. This file then lays the water surface and the road surface into those channels,
// and puts a bridge wherever a road crosses a river.
//
// Settlements are buildings you can walk among, sized from the map's own node (village → town →
// city → capital). They have no people in them: NPCs, shops and interiors are phase 4.

import * as THREE from 'three';
import { makeRng, clamp } from '../../../worldgen/js/noise.js';
import { M_PER_CELL } from './planet.js';

const IDX_XY = (i, w) => [i % w, Math.floor(i / w)];

/** Catmull-Rom through the cell centres, so a chain of 640 m cells reads as a curve. */
function smoothPolyline(points, perSegment = 4) {
  if (points.length < 2) return points.slice();
  const out = [];
  const at = i => points[clamp(i, 0, points.length - 1)];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    for (let s = 0; s < perSegment; s++) {
      const t = s / perSegment, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

/** A flat ribbon following a polyline, draped on the ground. Returns vertex/index arrays. */
function ribbon(points, heights, width, { lift = 0.1 } = {}) {
  const position = [], normal = [], index = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    let dx = next[0] - prev[0], dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len; dz /= len;
    const nx = -dz, nz = dx;
    const half = (typeof width === 'function' ? width(i) : width) / 2;
    const y = heights[i] + lift;
    position.push(points[i][0] + nx * half, y, points[i][1] + nz * half);
    position.push(points[i][0] - nx * half, y, points[i][1] - nz * half);
    normal.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const a = (i - 1) * 2, b = a + 1, c = i * 2, d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  }
  return { position, normal, index };
}

// ---------------------------------------------------------------------------- building geometry

function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.toNonIndexed();
    g.applyMatrix4(p.matrix);
    g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color) };
  });
  const position = new Float32Array(total * 3), normal = new Float32Array(total * 3), color = new Float32Array(total * 3);
  let o = 0;
  for (const { g, color: c } of prepared) {
    position.set(g.attributes.position.array, o * 3);
    normal.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < g.attributes.position.count; i++) {
      color[(o + i) * 3] = c.r; color[(o + i) * 3 + 1] = c.g; color[(o + i) * 3 + 2] = c.b;
    }
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return out;
}

const mat4 = (x, y, z, sx, sy, sz, ry = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
  new THREE.Vector3(sx, sy, sz),
);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);

const WALL_COLOR = '#cdbfa6', BEAM = '#5a4632', ROOF = '#7a4a3a', STONE = '#8a8275', TILE = '#5f6b74';

/** The buildings a settlement is made of. All small, all procedural, all instanced. */
export const BUILDINGS = {
  hut: { cap: 400, build: () => mergeParts([
    { geometry: BOX, color: WALL_COLOR, matrix: mat4(0, 1.3, 0, 4.2, 2.6, 3.6) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 3.5, 0, 3.6, 1.8, 3.2, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.9, 1.82, 0.9, 1.8, 0.12) },
  ]) },
  house: { cap: 400, build: () => mergeParts([
    { geometry: BOX, color: WALL_COLOR, matrix: mat4(0, 1.8, 0, 6, 3.6, 4.6) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 4.8, 0, 5, 2.4, 4.2, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.1, 2.32, 1.1, 2.2, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(-2, 2.4, 2.32, 0.2, 2.8, 0.14) },
    { geometry: BOX, color: BEAM, matrix: mat4(2, 2.4, 2.32, 0.2, 2.8, 0.14) },
    { geometry: CYL, color: STONE, matrix: mat4(2.2, 5.2, -1.2, 0.35, 2.6, 0.35) },
  ]) },
  hall: { cap: 200, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 2.6, 0, 10, 5.2, 6.5) },
    { geometry: CONE4, color: TILE, matrix: mat4(0, 6.8, 0, 8.2, 3.2, 5.8, Math.PI / 4) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 1.5, 3.3, 1.8, 3, 0.2) },
    { geometry: CYL, color: STONE, matrix: mat4(-4.2, 3, 3.4, 0.4, 6, 0.4) },
    { geometry: CYL, color: STONE, matrix: mat4(4.2, 3, 3.4, 0.4, 6, 0.4) },
  ]) },
  tower: { cap: 200, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 5, 0, 2.4, 10, 2.4) },
    { geometry: CYL, color: STONE, matrix: mat4(0, 10.3, 0, 2.9, 0.7, 2.9) },
    { geometry: CONE4, color: TILE, matrix: mat4(0, 12, 0, 2.7, 3, 2.7, Math.PI / 4) },
  ]) },
  wall: { cap: 700, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(0, 1.9, 0, 6, 3.8, 1.1) },
    { geometry: BOX, color: STONE, matrix: mat4(-2, 4, 0, 0.9, 0.6, 1.2) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 4, 0, 0.9, 0.6, 1.2) },
    { geometry: BOX, color: STONE, matrix: mat4(2, 4, 0, 0.9, 0.6, 1.2) },
  ]) },
  well: { cap: 120, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 0.5, 0, 1.3, 1, 1.3) },
    { geometry: BOX, color: BEAM, matrix: mat4(-1.1, 1.6, 0, 0.16, 2.2, 0.16) },
    { geometry: BOX, color: BEAM, matrix: mat4(1.1, 1.6, 0, 0.16, 2.2, 0.16) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 3.1, 0, 1.7, 0.9, 1.7, Math.PI / 4) },
  ]) },
  bridge: { cap: 120, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0, 0, 7, 0.45, 5) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.75, 2.4, 7, 1.1, 0.25) },
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0.75, -2.4, 7, 1.1, 0.25) },
    { geometry: CYL, color: STONE, matrix: mat4(-2.6, -1.6, 2, 0.4, 3.4, 0.4) },
    { geometry: CYL, color: STONE, matrix: mat4(2.6, -1.6, 2, 0.4, 3.4, 0.4) },
    { geometry: CYL, color: STONE, matrix: mat4(-2.6, -1.6, -2, 0.4, 3.4, 0.4) },
    { geometry: CYL, color: STONE, matrix: mat4(2.6, -1.6, -2, 0.4, 3.4, 0.4) },
  ]) },
};

export const BUILDING_KEYS = Object.keys(BUILDINGS);

// ---------------------------------------------------------------------------- the feature layer

/**
 * opts: { palette, seed, radius (metres of features kept around the player), refreshEvery (metres) }
 */
export function createFeatures(scene, terrain, opts = {}) {
  const world = terrain.world;
  const W = world.width;
  const palette = opts.palette || {};
  const radius = opts.radius ?? 2600;
  const refreshEvery = opts.refreshEvery ?? 260;
  const seed = (opts.seed ?? 1) >>> 0;

  const toMetres = i => { const [x, y] = IDX_XY(i, W); return [x * M_PER_CELL, y * M_PER_CELL]; };

  // ---------------------------------------------------------------- what the map says is there
  const riverSet = new Set();
  const rivers = (world.rivers || []).map(r => {
    for (const c of r.cells) riverSet.add(c);
    return {
      id: r.id, name: r.name, width: r.width || 1, navigable: r.navigable,
      points: smoothPolyline(r.cells.map(toMetres), 5),
    };
  });

  const roads = (world.roads || []).map(r => ({
    id: r.id, klass: r.class || 'trail', cells: r.cells, bridgeCells: r.bridges || [],
    points: smoothPolyline(r.cells.map(toMetres), 5),
  }));

  // Where a road crosses water. World Forge already works this out when it lays the network — its
  // `road.bridges` are the cells where a road had to cross a river, a lake or a channel — so that
  // is the list to trust. Looking for a road cell that is also a river cell finds almost nothing
  // extra, because the overlaps are at road ENDS: towns are founded on rivers.
  const bridges = [];
  const seenBridge = new Set();
  const addBridge = (road, i) => {
    const cell = road.cells[i];
    if (cell == null || seenBridge.has(cell)) return;
    seenBridge.add(cell);
    const [x, z] = toMetres(cell);
    const [px, pz] = toMetres(road.cells[Math.max(0, i - 1)]);
    const [nx, nz] = toMetres(road.cells[Math.min(road.cells.length - 1, i + 1)]);
    const angle = (nx === px && nz === pz) ? 0 : Math.atan2(nx - px, nz - pz);
    bridges.push({ x, z, angle, cell });
  };
  for (const road of roads) {
    for (const cell of road.bridgeCells) {
      const i = road.cells.indexOf(cell);
      if (i >= 0) addBridge(road, i);
    }
    // and any mid-road river crossing the network did not flag
    for (let i = 1; i < road.cells.length - 1; i++) {
      if (riverSet.has(road.cells[i])) addBridge(road, i);
    }
  }

  const settlements = (world.nodes || [])
    .filter(n => n.type === 'settlement' || n.type === 'port')
    .map(n => ({ ...n, wx: n.x * M_PER_CELL, wz: n.y * M_PER_CELL }));

  // ---------------------------------------------------------------- meshes
  const waterMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(palette.sea || terrain.planet?.seaColor || '#2a6fa8'),
    transparent: true, opacity: 0.86,
  });
  const roadMat = new THREE.MeshLambertMaterial({ color: new THREE.Color('#6b5c49') });
  const riverMesh = new THREE.Mesh(new THREE.BufferGeometry(), waterMat);
  const roadMesh = new THREE.Mesh(new THREE.BufferGeometry(), roadMat);
  for (const m of [riverMesh, roadMesh]) { m.frustumCulled = false; m.name = 'farhold-' + (m === riverMesh ? 'rivers' : 'roads'); scene.add(m); }

  const instanced = {};
  for (const key of BUILDING_KEYS) {
    const mesh = new THREE.InstancedMesh(
      BUILDINGS[key].build(),
      new THREE.MeshLambertMaterial({ vertexColors: true }),
      BUILDINGS[key].cap,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.name = 'farhold-building-' + key;
    scene.add(mesh);
    instanced[key] = mesh;
  }

  let centre = [Infinity, Infinity];
  let rebuilds = 0;
  let visible = true;
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();

  /** Heights along a polyline, forced downhill so a river never flows up a hill. */
  function riverHeights(points) {
    const h = points.map(p => terrain.heightAt(p[0], p[1]));
    for (let i = 1; i < h.length; i++) h[i] = Math.min(h[i], h[i - 1]);
    return h;
  }

  function buildRibbons(px, pz) {
    const near = (points) => {
      // the run of the line that is close enough to be worth drawing
      const spans = [];
      let start = -1;
      for (let i = 0; i < points.length; i++) {
        const close = Math.hypot(points[i][0] - px, points[i][1] - pz) < radius;
        if (close && start < 0) start = Math.max(0, i - 1);
        if (!close && start >= 0) { spans.push([start, i]); start = -1; }
      }
      if (start >= 0) spans.push([start, points.length - 1]);
      return spans;
    };

    const water = { position: [], normal: [], index: [] };
    const road = { position: [], normal: [], index: [] };
    const push = (target, part) => {
      const base = target.position.length / 3;
      target.position.push(...part.position);
      target.normal.push(...part.normal);
      for (const i of part.index) target.index.push(i + base);
    };

    for (const r of rivers) {
      for (const [a, b] of near(r.points)) {
        if (b - a < 2) continue;
        const slice = r.points.slice(a, b + 1);
        const heights = riverHeights(slice);
        // a big river is wider, and every river widens as it goes
        const w = 6 + r.width * 5;
        push(water, ribbon(slice, heights, i => w * (0.75 + 0.5 * (i / Math.max(1, slice.length - 1))), { lift: 0.35 }));
      }
    }
    for (const r of roads) {
      for (const [a, b] of near(r.points)) {
        if (b - a < 2) continue;
        const slice = r.points.slice(a, b + 1);
        const heights = slice.map(p => terrain.heightAt(p[0], p[1]));
        push(road, ribbon(slice, heights, r.klass === 'trail' ? 4 : 6.5, { lift: 0.14 }));
      }
    }

    for (const [mesh, data] of [[riverMesh, water], [roadMesh, road]]) {
      mesh.geometry.dispose();
      const geom = new THREE.BufferGeometry();
      if (data.position.length) {
        geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(data.position), 3));
        geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(data.normal), 3));
        geom.setIndex(data.index);
      }
      mesh.geometry = geom;
      mesh.visible = visible && data.position.length > 0;
    }
  }

  /** Lay out one settlement: a well in the middle, houses around it, walls if it is big enough. */
  function buildSettlement(node, counts) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = node.size || 1;
    const ring = 16 + size * 13;                     // metres from the centre to the outer houses
    const homes = [6, 8, 14, 26, 40, 54][clamp(size, 0, 5)] || 8;
    const cx = node.wx, cz = node.wz;

    const place = (key, x, z, angle, scale = 1, sink = 0.3) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      if (terrain.underwater(x, z)) return false;
      matrix.compose(
        new THREE.Vector3(x, terrain.heightAt(x, z) - sink, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(scale, scale, scale),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      instanced[key].setColorAt(counts[key], colour.setScalar(0.82 + rng() * 0.36));
      counts[key]++;
      return true;
    };

    place('well', cx, cz, rng() * 6.3, 1);
    if (size >= 3) place('hall', cx + 14, cz + 6, rng() * 6.3, 1);

    for (let i = 0; i < homes; i++) {
      // rings of houses, all facing the middle, which is what a village looks like from the air
      const band = Math.floor(i / Math.max(4, homes / 3));
      const r = 10 + band * 13 + rng() * 7;
      if (r > ring + 16) continue;
      const a = rng() * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      if (terrain.slopeAt(x, z, 6) > 0.5) continue;
      const key = size >= 3 && rng() < 0.4 ? 'house' : rng() < 0.55 ? 'hut' : 'house';
      place(key, x, z, Math.atan2(cx - x, cz - z) + (rng() - 0.5) * 0.5, 0.85 + rng() * 0.4);
    }

    // a city gets a wall and towers
    if (size >= 4) {
      const wallR = ring + 14;
      const segments = Math.round((Math.PI * 2 * wallR) / 6);
      const gate = Math.floor(rng() * segments);
      for (let i = 0; i < segments; i++) {
        if (Math.abs(i - gate) <= 1) continue;           // leave a gap for the road
        const a = (i / segments) * Math.PI * 2;
        const x = cx + Math.cos(a) * wallR, z = cz + Math.sin(a) * wallR;
        if (terrain.underwater(x, z)) continue;
        place('wall', x, z, a + Math.PI / 2, 1, 0.6);
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4;
        place('tower', cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR, 0, 1, 0.6);
      }
    }
  }

  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts);
    }
    for (const b of bridges) {
      if (Math.hypot(b.x - px, b.z - pz) > radius) continue;
      if (counts.bridge >= BUILDINGS.bridge.cap) break;
      matrix.compose(
        new THREE.Vector3(b.x, terrain.heightAt(b.x, b.z) + 1.4, b.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.angle, 0)),
        new THREE.Vector3(1.2, 1.2, 1.2),
      );
      instanced.bridge.setMatrixAt(counts.bridge, matrix);
      instanced.bridge.setColorAt(counts.bridge, colour.setScalar(1));
      counts.bridge++;
    }

    for (const key of BUILDING_KEYS) {
      const mesh = instanced[key];
      mesh.count = visible ? counts[key] : 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  function rebuild(px, pz) {
    rebuilds++;
    buildRibbons(px, pz);
    buildInstances(px, pz);
  }

  return {
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh,

    update(x, z, force = false) {
      if (!force && Math.hypot(x - centre[0], z - centre[1]) < refreshEvery) return false;
      centre = [x, z];
      rebuild(x, z);
      return true;
    },

    setVisible(v, x, z) { visible = !!v; rebuild(x, z); },

    /** The nearest settlement, river point, road point or peak — used by the debug menu. */
    nearest(kind, x, z) {
      const dist = (ax, az) => Math.hypot(ax - x, az - z);
      if (kind === 'settlement' || kind === 'city') {
        const pool = kind === 'city' ? settlements.filter(s => s.size >= 4) : settlements;
        if (!pool.length) return null;
        return pool.reduce((best, s) => (dist(s.wx, s.wz) < dist(best.wx, best.wz) ? s : best));
      }
      if (kind === 'river') {
        let best = null, bd = Infinity;
        for (const r of rivers) for (const p of r.points) { const d = dist(p[0], p[1]); if (d < bd) { bd = d; best = { wx: p[0], wz: p[1], name: r.name }; } }
        return best;
      }
      if (kind === 'road') {
        let best = null, bd = Infinity;
        for (const r of roads) for (const p of r.points) { const d = dist(p[0], p[1]); if (d < bd) { bd = d; best = { wx: p[0], wz: p[1], name: 'the road' }; } }
        return best;
      }
      return null;
    },

    /** Am I standing in a settlement? Returns the node, for the HUD. */
    settlementAt(x, z) {
      for (const s of settlements) {
        const r = 30 + (s.size || 1) * 15;
        if (Math.hypot(s.wx - x, s.wz - z) < r) return s;
      }
      return null;
    },

    stats() {
      let buildings = 0, drawCalls = 0;
      for (const key of BUILDING_KEYS) { buildings += instanced[key].count; if (instanced[key].count) drawCalls++; }
      if (riverMesh.visible) drawCalls++;
      if (roadMesh.visible) drawCalls++;
      return {
        rivers: rivers.length, roads: roads.length, bridges: bridges.length,
        settlements: settlements.length, buildings, drawCalls, rebuilds,
      };
    },

    setPalette(p = {}) { if (p.sea) waterMat.color.set(p.sea); },

    dispose() {
      for (const key of BUILDING_KEYS) {
        const m = instanced[key];
        scene.remove(m); m.geometry.dispose(); m.material.dispose(); m.dispose();
      }
      for (const m of [riverMesh, roadMesh]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); }
    },
  };
}
