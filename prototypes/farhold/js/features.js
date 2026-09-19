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
import { BUILDING_INFO } from './town-plan.js';
import { planTown, cultureFor } from '../../../proctown/js/townplan.js';
import {
  describeBuilding, partsFor, describeStall, stallParts, stallsFor,
  radiusOf, mix, MESHES, CULTURE_KIT,
} from '../../../proctown/js/buildkit.js';
import { waterRibbon, lakeSheet } from './water-plan.js';
import { makeRng } from '../../../worldgen/js/noise.js';
import { M_PER_CELL } from './planet.js';
import { ObstacleField, BUILDING_SOLIDS } from './collide.js';

const IDX_XY = (i, w) => [i % w, Math.floor(i / w)];

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
// what is left of the fixed palette: the four things still modelled here (wall, gatehouse,
// well, bridge) rather than assembled by the kit
const BEAM = '#5a4632', ROOF = '#7a4a3a', STONE = '#8a8275';

// ---------------------------------------------------------------------------- the building kit
//
// A BUILDING IS A KIT, NOT A MODEL. Everything below the horizontal rule used to be twenty fixed
// meshes — a hut, a house, a hall, a forge and so on — and every town on every world was built out
// of the same twenty. The play-test said what that produces: "some roofs don't line up with the
// walls", "all the towns look and feel the same", "more variety of houses, roofs, colours, walls".
//
// `proctown/js/buildkit.js` now describes a building from its plot, its culture and a seed, and
// hands back a list of UNIT SHAPES. This file's only job is to stand them on the terrain.
//
// The instance budget is honoured the same way it always was, just one level down: there is one
// InstancedMesh per SHAPE rather than one per building type, so a town of sixty buildings is eight
// draw calls whatever is in it. A dwarf blockhouse and an elf bower are the same boxes and prisms.

/** A geometry whose vertex colours are all white, so the per-instance colour is the whole colour. */
function whiteGeometry(g) {
  const n = g.attributes.position.count;
  const color = new Float32Array(n * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return g;
}

/**
 * A prism: a convex cross-section in XY, extruded along Z from -0.5 to 0.5.
 *
 * Three.js has no triangular prism, and the gable and the lean-to are the two shapes a town is
 * mostly made of. The section must run anti-clockwise or the faces point inward.
 */
function prismGeometry(section) {
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const n = section.length;
  for (let i = 1; i < n - 1; i++) {
    tri([section[0][0], section[0][1], 0.5], [section[i][0], section[i][1], 0.5], [section[i + 1][0], section[i + 1][1], 0.5]);
    tri([section[0][0], section[0][1], -0.5], [section[i + 1][0], section[i + 1][1], -0.5], [section[i][0], section[i][1], -0.5]);
  }
  for (let i = 0; i < n; i++) {
    const a = section[i], b = section[(i + 1) % n];
    tri([a[0], a[1], -0.5], [b[0], b[1], -0.5], [b[0], b[1], 0.5]);
    tri([a[0], a[1], -0.5], [b[0], b[1], 0.5], [a[0], a[1], 0.5]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.computeVertexNormals();
  return g;
}

/**
 * The eight unit shapes, each one metre in every direction with its ORIGIN AT THE CENTRE OF ITS
 * BASE — so a part's `y` is its bottom and there is never a half-height to remember.
 */
function unitMesh(kind) {
  let g;
  switch (kind) {
    case 'cyl': g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10); g.translate(0, 0.5, 0); break;
    // the triangular prism's ridge runs along +Z
    case 'gable': g = prismGeometry([[-0.5, 0], [0.5, 0], [0, 1]]); break;
    // …and the lean-to's single pitch rises toward -X
    case 'shed': g = prismGeometry([[-0.5, 0], [0.5, 0], [-0.5, 1]]); break;
    // a four-sided cone IS a pyramid; turned an eighth so its square base lines up with the axes
    case 'hip': g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'frustum': g = new THREE.CylinderGeometry(0.225 * Math.SQRT2, 0.5 * Math.SQRT2, 1, 4);
      g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(0.5, 1, 12); g.translate(0, 0.5, 0); break;
    case 'dome': g = new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      g.scale(1, 2, 1); break;
    default: g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break;
  }
  return whiteGeometry(g);
}

/** Which InstancedMesh each kit shape goes into. */
const KIT_KEY = Object.fromEntries(MESHES.map(m => [m, 'kit_' + m]));

/**
 * How many of each shape may exist at once across every town in range.
 *
 * Measured rather than guessed: a settlement runs 14 parts a building (orc) to 45 (desert, where
 * every flat roof carries four parapet walls), on 17 to 59 plots. These are sized for three or four
 * towns inside the 2.6 km feature radius with the level-of-detail cut below doing its share.
 */
const KIT_CAPS = {
  box: 9000, cyl: 1800, gable: 900, shed: 600, hip: 700, frustum: 400, cone: 500, dome: 500,
};

const KIT_PARTS = Object.fromEntries(MESHES.map(m => [
  KIT_KEY[m], { cap: KIT_CAPS[m], kit: true, build: () => unitMesh(m) },
]));

/**
 * The buildings a settlement wants — which are now FOOTINGS, not models.
 *
 * Each of these is one thin slab under a building, sized to the footprint the kit chose, and the
 * building itself is assembled from `KIT_PARTS` on top of it. Keeping a mesh per want is not
 * nostalgia: it is where the instance cap lives (`BUILDING_INFO.<want>.cap`), it is how the debug
 * stats and the page tests count "how many forges are in front of me", and the footing itself earns
 * its place by hiding the gap where sloping ground runs out from under a wall.
 */
const WANT_KEYS = [
  'hut', 'house', 'hall', 'forge', 'inn', 'market', 'granary', 'chapel',
  'barracks', 'stable', 'mill', 'warehouse', 'watchpost', 'shrine',
];
const WANT_FOOTINGS = Object.fromEntries(WANT_KEYS.map(key => [
  key, { cap: BUILDING_INFO[key].cap, footing: true, build: () => unitMesh('box') },
]));

/** The buildings a settlement is made of. All small, all procedural, all instanced. */
export const BUILDINGS = {
  ...WANT_FOOTINGS,
  ...KIT_PARTS,
  // a wall tower: still a model, because it is the same tower in every town and it is placed by the
  // wall's own geometry rather than by a plot. White, so the culture's own stone colours it.
  tower: { cap: BUILDING_INFO.tower.cap, build: () => whiteGeometry(mergeParts([
    { geometry: CYL, color: '#ffffff', matrix: mat4(0, 5, 0, 2.4, 10, 2.4) },
    { geometry: CYL, color: '#ffffff', matrix: mat4(0, 10.3, 0, 2.9, 0.7, 2.9) },
    { geometry: CONE4, color: '#ffffff', matrix: mat4(0, 12, 0, 2.7, 3, 2.7, Math.PI / 4) },
  ])) },
  /**
   * A wall segment, built along **+Z** — the axis `yaw` points down, the same as the bridges.
   *
   * It used to be modelled along X while being rotated by a +Z yaw, so every piece came out turned
   * ninety degrees: the segments stood parallel to each other like a row of fence panels instead of
   * joining end to end into a wall. (Reported with a screenshot of a city that looked like it was
   * built out of dominoes.)
   */
  // White, like the tower: a palisade is not the colour of a bone wall is not the colour of a living
  // hedge, and a culture you can name from the next hill is most of what section 6 is asking for.
  wall: { cap: BUILDING_INFO.wall.cap, build: () => whiteGeometry(mergeParts([
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 1.9, 0, 1.1, 3.8, 6) },
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 4, -2, 1.2, 0.6, 0.9) },
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 4, 0, 1.2, 0.6, 0.9) },
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 4, 2, 1.2, 0.6, 0.9) },
  ])) },
  /**
   * WHERE THE TWELVE MODELS WENT.
   *
   * Round 8 added twelve bespoke buildings here — a forge with a chimney and a quench trough, an inn
   * with a sign on a bracket, a chapel with a spire — and they were good models. They were also the
   * only twelve, on every world, in every culture, for ever, which is the complaint this round is
   * answering: "all the towns look and feel the same".
   *
   * So the silhouettes moved into `proctown/data/buildkit.json`, where a forge is a base that suits
   * a forge plus a chimney the kit puts on it, and a dwarf forge and a halfling forge come out
   * different. What is left here is one footing per want (see `WANT_FOOTINGS` above), which is where
   * the cap and the count still live.
   */
  gatehouse: { cap: BUILDING_INFO.gatehouse.cap, build: () => mergeParts([
    { geometry: BOX, color: STONE, matrix: mat4(-2.6, 3, 0, 2.2, 6, 3.4) },
    { geometry: BOX, color: STONE, matrix: mat4(2.6, 3, 0, 2.2, 6, 3.4) },
    { geometry: BOX, color: STONE, matrix: mat4(0, 5.6, 0, 7.4, 1.4, 3.4) },         // the span over the road
    { geometry: BOX, color: BEAM, matrix: mat4(0, 2.4, 0, 3.2, 4.4, 0.25) },         // the portcullis
    { geometry: BOX, color: STONE, matrix: mat4(-2.6, 6.5, 0, 2.4, 0.5, 3.6) },
    { geometry: BOX, color: STONE, matrix: mat4(2.6, 6.5, 0, 2.4, 0.5, 3.6) },
  ]) },
  /**
   * A street. Laid between the buildings the way the roads outside are laid over the terrain — a
   * flat slab following the ground, so a town has a shape you can walk rather than a scatter of
   * houses on grass.
   */
  street: { cap: BUILDING_INFO.street.cap, build: () => whiteGeometry(mergeParts([
    { geometry: BOX, color: '#ffffff', matrix: mat4(0, 0.06, 0, 3.4, 0.12, 6) },
  ])) },
  well: { cap: BUILDING_INFO.well.cap, build: () => mergeParts([
    { geometry: CYL, color: STONE, matrix: mat4(0, 0.5, 0, 1.3, 1, 1.3) },
    { geometry: BOX, color: BEAM, matrix: mat4(-1.1, 1.6, 0, 0.16, 2.2, 0.16) },
    { geometry: BOX, color: BEAM, matrix: mat4(1.1, 1.6, 0, 0.16, 2.2, 0.16) },
    { geometry: CONE4, color: ROOF, matrix: mat4(0, 3.1, 0, 1.7, 0.9, 1.7, Math.PI / 4) },
  ]) },
  // The deck runs along +Z — the same axis `yaw` points down, and the same way every other body in
  // the game faces. Built across +X instead, a bridge placed at the road's angle lay ACROSS the
  // river rather than spanning it, which is exactly how it looked. Scaling Z stretches the span to
  // suit the river; the piers are boxes so a stretched one reads as a wider pier, not a smeared post.
  bridge: { cap: BUILDING_INFO.bridge.cap, span: 10, build: () => mergeParts([
    { geometry: BOX, color: BEAM, matrix: mat4(0, 0, 0, 5, 0.45, 10) },
    { geometry: BOX, color: BEAM, matrix: mat4(2.4, 0.75, 0, 0.25, 1.1, 10) },
    { geometry: BOX, color: BEAM, matrix: mat4(-2.4, 0.75, 0, 0.25, 1.1, 10) },
    { geometry: BOX, color: STONE, matrix: mat4(2, -2.1, 3.2, 0.8, 4.2, 0.8) },
    { geometry: BOX, color: STONE, matrix: mat4(-2, -2.1, 3.2, 0.8, 4.2, 0.8) },
    { geometry: BOX, color: STONE, matrix: mat4(2, -2.1, -3.2, 0.8, 4.2, 0.8) },
    { geometry: BOX, color: STONE, matrix: mat4(-2, -2.1, -3.2, 0.8, 4.2, 0.8) },
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

  // The paths are the terrain's own — the very lines it carved the channels and cuttings from — so
  // the water surface sits exactly on the carved bed instead of clipping through it.
  const rivers = terrain.riverPaths;
  const roads = terrain.roadPaths;
  const riverSet = new Set();
  for (const r of world.rivers || []) for (const c of r.cells) riverSet.add(c);

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
    for (const cell of road.bridgeCells || []) {
      const i = (road.cells || []).indexOf(cell);
      if (i >= 0) addBridge(road, i);
    }
    for (let i = 1; i < (road.cells || []).length - 1; i++) {
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

  const solids = new ObstacleField();
  // Tell the field how high the ground is, so an obstacle knows where its roof is and the player
  // can jump over — and onto — anything they genuinely clear. See js/collide.js.
  solids.setGround((x, z) => terrain.heightAt(x, z));
  let centre = [Infinity, Infinity];
  let rebuilds = 0;
  let visible = true;
  const matrix = new THREE.Matrix4();
  const colour = new THREE.Color();


  function buildRibbons(px, pz) {
    const near = (points) => {
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
        // the surface the terrain carved down to, so the water can never clip through the bed
        const heights = r.surface.slice(a, b + 1);
        push(water, waterRibbon(slice, heights, r.half, { terrain, reach: r.reach, skirt: r.depth }));
      }
    }
    // lakes are drawn from the same mesh and the same material — they are the same water
    for (const lake of terrain.lakes || []) {
      if (Math.hypot(lake.wx - px, lake.wz - pz) - lake.radius > radius) continue;
      push(water, lakeSheet(lake, terrain.metresPerCell, terrain));
    }
    for (const r of roads) {
      for (const [a, b] of near(r.points)) {
        if (b - a < 2) continue;
        /**
         * Break the span wherever the route goes out over open water. Those stretches are sea lanes
         * rather than roads (see `path.wet` in js/planet.js), and drawing them lays a ribbon of
         * gravel across the ocean — so the road stops at the shore and picks up again on the far
         * side, which is what a coast road actually does.
         */
        let runStart = a;
        for (let i = a; i <= b + 1; i++) {
          const wet = i > b || r.wet?.[i];
          if (!wet) continue;
          if (i - runStart >= 2) {
            push(road, ribbon(r.points.slice(runStart, i), r.surface.slice(runStart, i), r.half * 2, { lift: 0.06 }));
          }
          runStart = i + 1;
        }
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
  function buildSettlement(node, counts, px = 0, pz = 0) {
    const rng = makeRng((seed ^ (node.id * 2654435761)) >>> 0);
    const size = node.size || 1;
    const ring = 16 + size * 13;                     // metres from the centre to the outer houses
    const cx = node.wx, cz = node.wz;

    const place = (key, x, z, angle, scale = 1, sink = 0.3, y = null,
      { solid: wantSolid = true, tint = null } = {}) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      if (terrain.underwater(x, z)) return false;
      // nothing is built in the channel or on the bank — towns sit BESIDE their river
      if (terrain.riverAt(x, z) > 0.3) return false;
      const size = Array.isArray(scale) ? scale : [scale, scale, scale];
      matrix.compose(
        new THREE.Vector3(x, (y ?? terrain.heightAt(x, z)) - sink, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(size[0], size[1], size[2]),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      // a tinted mesh was built white on purpose, so the culture's own colour is the whole colour;
      // everything else keeps the old scalar wobble so two neighbours are not identical
      if (tint) instanced[key].setColorAt(counts[key], colour.set(tint));
      else instanced[key].setColorAt(counts[key], colour.setScalar(0.82 + rng() * 0.36));
      // a gate registers its own jambs instead, so the opening stays walkable
      const solid = wantSolid ? BUILDING_SOLIDS[key] : null;
      if (solid && solid[0] > 0) solids.add(x, z, solid[0] * Math.max(size[0], size[2]), solid[1] * size[1]);
      counts[key]++;
      return true;
    };

    /**
     * Stand one kit part on the ground.
     *
     * The part list is in the BUILDING's own frame — +Z is the street side — so the whole list is
     * turned by one yaw and dropped at one point. That is the reason a roof cannot drift away from
     * its walls between here and `buildkit.js`: there is no per-part position in this file to get
     * wrong, only a rotation of the list the kit already agreed on.
     */
    const placePart = (key, part, ox, oz, ground, yaw, cos, sin) => {
      if (counts[key] >= BUILDINGS[key].cap) return false;
      matrix.compose(
        new THREE.Vector3(ox + part.x * cos + part.z * sin, ground + part.y, oz - part.x * sin + part.z * cos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + (part.yaw || 0), 0)),
        new THREE.Vector3(part.w, part.h, part.d),
      );
      instanced[key].setMatrixAt(counts[key], matrix);
      instanced[key].setColorAt(counts[key], colour.set(part.colour));
      counts[key]++;
      return true;
    };

    /**
     * How much of a building gets built, by how far away it is (section 3.18).
     *
     * A full kit building is 14 parts (an orc tent) to 45 (a desert courtyard, where every flat roof
     * carries four parapet walls), and the feature radius is 2.6 km — so the honest thing is to stop
     * putting shutters and washing lines on a town you can barely see. Walls, roof and eave are the
     * silhouette; everything else is detail you have to be inside the town to read.
     */
    const STRUCTURE = new Set(['wall', 'roof', 'eave', 'trim', 'door', 'chimney']);
    const near = Math.hypot(cx - px, cz - pz) < 230;

    /**
     * THE TOWN PLAN — now from `proctown/js/townplan.js`, which is the one true planner.
     *
     * What used to be here fired 2-6 straight-ish spokes out of the middle and dropped buildings
     * along them, and the play-test came back with exactly what that produces: "Houses sitting on
     * roads. Some roofs don't line up with the walls. Alleyway roads clip beneath the surface
     * texture. All the towns look and feel the same, and they don't feel anything at all natural."
     *
     * Every one of those is the same mistake — a building was placed at a coordinate, a street was
     * drawn at a coordinate, and nothing reconciled the two. The planner cuts the town into blocks
     * and THE CUTS BECOME THE STREETS, then divides each block into plots. A house cannot sit on a
     * road because a road is not a plot.
     *
     * It lives in the playground experiment so it can be tuned on a page instead of by flying to a
     * town and looking at it, and Farhold imports it so there is no second copy to drift. The town's
     * culture comes from who lives there and what the ground is, which is why a dwarf hold is a grid
     * and an elf settlement bends along the contours.
     */
    const culture = cultureFor({ race: node.race, biome: node.biome });
    const plan = planTown({
      seed: (seed ^ (node.id * 2654435761)) >>> 0,
      size,
      culture,
      // the real ground, so "follows the terrain" means this hillside and not a stand-in
      heightAt: (lx, lz) => terrain.heightAt(cx + lx, cz + lz),
      /**
       * …and the ground it may not use at all.
       *
       * `place()` below drops anything that lands in water, on a riverbank or on a cliff — silently,
       * after the plan is made. On the first town with a river through it that was throwing away 14
       * plots out of 26 and leaving a city with twelve buildings in it, which is exactly the "towns
       * feel empty" complaint. Telling the planner up front means the gap where the water runs is a
       * deliberate hole in the plan rather than an accident nobody could see.
       */
      buildable: (lx, lz) => {
        const x = cx + lx, z = cz + lz;
        /**
         * AND THE ROAD. This is the answer to "houses sitting right in the middle of the road".
         *
         * The claim that a building could not land on a road was true of the town's OWN streets —
         * those are the gaps left by the block split, so a plot cannot overlap one. It was never
         * true of the WORLD road, the inter-town route that runs through the settlement, because
         * the planner was never told that road is there. Two systems drawing over each other with
         * nothing reconciling them, which is the same mistake the plot generator was built to fix,
         * one level up.
         *
         * `roadAt` is the same field the megaflora already keep clear of.
         */
        // 0.45 is the carriageway and its kerb, not the whole influence field: measured, the road
        // reads 1.0 at its centre and fades to nothing by 18 m, and excluding all of that took 36%
        // of a town's ground. Buildings SHOULD front close to the road — that is what a road is for
        if (terrain.roadAt(x, z) > 0.45) return false;
        return !terrain.underwater(x, z) && terrain.riverAt(x, z) <= 0.3 && terrain.slopeAt(x, z, 6) <= 0.62;
      },
    });

    const toWorld = (lx, lz) => [cx + lx, cz + lz];
    const cultKit = CULTURE_KIT.cultures[culture] || CULTURE_KIT.cultures.human;
    const townSeed = (seed ^ (node.id * 2654435761)) >>> 0;

    /**
     * Lay the street surface along each polyline.
     *
     * The slab runs along +Z like every other placed body, so each span is dropped at its midpoint,
     * turned to the span's own bearing and stretched to its length — which is also what stops the
     * alleys clipping under the ground, because every slab now sits on the height of the span it
     * covers rather than on the height of the town centre.
     */
    /**
     * A PAD AT EVERY CORNER AND EVERY END.
     *
     * "Roads do not connect smoothly, and two roads coming together at an angle have a sharp edge."
     * They do, because a street is a row of rectangles laid along its own bearing: where two streets
     * meet at an angle, each stops with a square end and the wedge between them is bare ground. A
     * square pad the width of the street, dropped at every vertex and every endpoint, fills that
     * wedge whatever the angle — the same trick a real junction uses, which is to pave the whole
     * corner rather than to mitre two kerbs together.
     */
    for (const st of plan.streets) {
      for (const [px, pz] of st.pts) {
        const [jx, jz] = toWorld(px, pz);
        if (terrain.underwater(jx, jz) || terrain.riverAt(jx, jz) > 0.3) continue;
        place('street', jx, jz, 0, [st.width / 3.4, 1, st.width / 6], 0.22, null,
          { tint: cultKit.street.colour });
      }
      for (let i = 0; i < st.pts.length - 1; i++) {
        const [ax, az] = toWorld(st.pts[i][0], st.pts[i][1]);
        const [bx, bz] = toWorld(st.pts[i + 1][0], st.pts[i + 1][1]);
        const run = Math.hypot(bx - ax, bz - az);
        /**
         * SHORT STEPS AND A REAL OVERLAP, or a street is a row of loose tiles.
         *
         * Each slab sits on the ground height at its own midpoint, so on any slope consecutive
         * slabs step past each other and the seams open — "a lot of weird flat rectangles on the
         * floor". Halving the step and overlapping by a third closes them, and costs only instances
         * of a mesh that is already instanced.
         */
        const steps = Math.max(1, Math.round(run / 3));
        for (let k = 0; k < steps; k++) {
          const t0 = k / steps, t1 = (k + 1) / steps;
          const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
          const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
          const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
          if (terrain.underwater(mx, mz)) continue;
          if (terrain.riverAt(mx, mz) > 0.3) continue;
          const len = Math.hypot(x1 - x0, z1 - z0);
          // cobble / flag / root-path / bone / sand: section 6.7, and the cheapest way there is
          place('street', mx, mz, Math.atan2(x1 - x0, z1 - z0),
            [st.width / 3.4, 1, len / 6 * 1.34], 0.22, null, { tint: cultKit.street.colour });
        }
      }
    }

    // the square: the well at its centre
    const [sqx, sqz] = toWorld(plan.square.cx, plan.square.cz);
    place('well', sqx, sqz, rng() * 6.3, 1);

    /**
     * OUTDOOR STALLS — the thing the user asked for by name.
     *
     * "More utility places like shops and other things which can be mostly like outdoor stalls."
     * They are deliberately not buildings: they need no plot, they stand where people already are
     * (a ring facing into the square, and the kerb of the main streets), and they are four posts and
     * a sheet of awning, so a market is twenty of them rather than one big model. `stallsFor` works
     * out the placement in the planner's own coordinates, so the 2D page shows them in the same
     * spots the game builds them.
     */
    for (const spot of stallsFor(plan, { culture, seed: townSeed, max: size >= 3 ? 24 : 10 })) {
      const [sx, sz] = toWorld(spot.x, spot.z);
      // A stall stands on dry ground, and "dry" has to mean properly dry. `underwater` is true only
      // below the waterline, so a stall on a beach town came out ankle-deep in the surf, which looks
      // exactly as odd as it sounds. Eight hundred millimetres of freeboard settles it.
      if (terrain.underwater(sx, sz) || terrain.waterAt?.(sx, sz)) continue;
      if (terrain.heightAt(sx, sz) < (terrain.seaLevel ?? 0) + 0.8) continue;
      if (terrain.riverAt(sx, sz) > 0.3) continue;
      if (terrain.slopeAt(sx, sz, 4) > 0.5) continue;
      const stall = describeStall({ kind: spot.kind, culture, seed: spot.seed });
      const yaw = Math.PI / 2 - spot.facing;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const ground = terrain.heightAt(sx, sz);
      for (const part of stallParts(stall)) {
        placePart(KIT_KEY[part.mesh], part, sx, sz, ground, yaw, cos, sin);
      }
      // a stall is walked past, not walked through, but it is not a wall either
      solids.add(sx, sz, Math.max(stall.w, stall.d) * 0.36, stall.postH * 0.6);
    }

    /**
     * One building per plot, standing INSIDE it and facing its own street.
     *
     * `plot.facing` is the angle out to the street the plot fronts, which is the reason a door is
     * never on a blank back wall, and `plot.want` is what the planner decided this plot is for —
     * the trades took the big plots before the houses got a look in.
     */
    for (const plot of plan.plots) {
      const [x, z] = toWorld(plot.cx, plot.cz);
      if (terrain.underwater(x, z)) continue;
      if (terrain.slopeAt(x, z, 6) > 0.62) continue;        // a town thins out uphill by itself
      const key = BUILDINGS[plot.want] ? plot.want : 'house';
      if (counts[key] >= BUILDINGS[key].cap) continue;

      const desc = describeBuilding({
        plot, culture, townSeed,
        // the plot's own position is in the seed, so the same plot is the same building every visit
        seed: (townSeed ^ Math.imul(Math.round(plot.cx * 8) * 73856093 ^ Math.round(plot.cz * 8) * 19349663, 1)) >>> 0,
        want: key, district: plot.district,
      });

      const ground = terrain.heightAt(x, z);
      // `desc.lean` is a couple of degrees a poor building has settled off the line its neighbours
      // keep. It goes on here rather than inside the kit so the parts stay square to each other.
      const yaw = desc.yaw + desc.lean;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);

      /**
       * The footing first: one slab under the building, in the mesh named after what the plot is
       * for. It is where the cap and the count live, and it hides the wedge of daylight that opens
       * under a wall when the ground falls away beneath it.
       */
      place(key, x, z, yaw, [desc.footprint.w + 0.7, 1, desc.footprint.d + 0.7], 0.26, ground,
        { solid: false, tint: mix(desc.colour.wall, '#2a2621', 0.55) });

      // the tallest part is worked out on the way past, not by asking `heightOf` — that would build
      // the whole kit a second time, for every building, on every rebuild
      let top = 0;
      for (const part of partsFor(desc)) {
        top = Math.max(top, part.y + part.h);
        if (!near && !STRUCTURE.has(part.tag)) continue;
        placePart(KIT_KEY[part.mesh], part, x, z, ground, yaw, cos, sin);
      }

      // collision from the footprint the kit actually chose, rather than one number per building type
      solids.add(x, z, radiusOf(desc), Math.max(2.5, top));
    }

    // a city gets a wall and towers
    if (size >= 4) {
      // Walk the ring corner to corner: each segment spans the CHORD between two ring points and is
      // placed at that chord's midpoint, stretched slightly so it overlaps its neighbour. Spacing
      // segments by arc length (and giving each its own ground height) is what left gaps.
      const wallR = ring + 14;
      const SEG = 6;                                        // the wall mesh is 6 long, along +Z
      const segments = Math.max(8, Math.round((Math.PI * 2 * wallR) / SEG));
      const ringPoint = i => {
        const a = (i / segments) * Math.PI * 2;
        return [cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR];
      };

      /**
       * WHERE THE GATES GO: wherever a road meets the wall.
       *
       * The gate used to be a random segment, so a road ran straight up to a city and into a solid
       * stretch of masonry. Every road that passes near this settlement is checked for the point it
       * crosses the wall ring, and the segments either side of that bearing are left out.
       */
      const gateAngles = [];
      for (const road of roads) {
        for (const [rx, rz] of road.points || []) {
          const d = Math.hypot(rx - cx, rz - cz);
          if (Math.abs(d - wallR) > SEG * 1.6) continue;
          gateAngles.push(Math.atan2(rz - cz, rx - cx));
        }
      }
      // always at least one way in, even on a settlement no road reaches
      if (!gateAngles.length) gateAngles.push(rng() * Math.PI * 2);
      const isGate = i => {
        const a = ((i + 0.5) / segments) * Math.PI * 2;
        return gateAngles.some(g => {
          const diff = Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          return diff < (SEG * 1.9) / wallR;                // about two segments wide
        });
      };

      for (let i = 0; i < segments; i++) {
        if (isGate(i)) continue;                            // a road comes through here
        const [ax, az] = ringPoint(i), [bx, bz] = ringPoint(i + 1);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (terrain.underwater(mx, mz)) continue;
        const chord = Math.hypot(bx - ax, bz - az);
        // sit the segment on the LOWER of its two ends and make it taller, so a step in the ground
        // is hidden under the wall instead of opening a gap beneath it
        const low = Math.min(terrain.heightAt(ax, az), terrain.heightAt(bx, bz));
        const lean = Math.abs(terrain.heightAt(ax, az) - terrain.heightAt(bx, bz));
        // the mesh runs along +Z, so the LENGTH scale goes on Z and the yaw is the standard one
        place('wall', mx, mz, Math.atan2(bx - ax, bz - az), [1, 1 + lean / 3.8, chord / SEG * 1.06],
          0.9, low, { tint: cultKit.townWall.colour });
      }
      /**
       * A GATEHOUSE THAT LINES UP WITH ITS WALL, AND THAT YOU CAN WALK THROUGH.
       *
       * Two reported bugs in one place. "Gates are rotated 90 degrees just like the walls used to
       * be, and do not connect to the walls all the way" — the yaw was built from the gate's own
       * bearing with a quarter turn bolted on, which is a different convention from the one every
       * wall segment uses, so the gatehouse stood across the wall line instead of along it and left
       * daylight at both joins. It now takes its bearing from THE SAME CHORD a wall segment would
       * have occupied here, so it cannot disagree with the wall, and it is stretched to the width of
       * the gap so the masonry actually meets.
       *
       * And "the gate itself should be open so the player can walk through the middle": the solid
       * `place` would register is a single circle over the whole gatehouse, which is a plug. The
       * gatehouse goes down with no collision of its own and two jamb solids are added at its ends
       * instead, leaving the passage between them open.
       */
      /**
       * THE GATE FACES THE ROAD, AND THE STRETCH GOES ACROSS THE OPENING.
       *
       * Third time on this one, so here is the mesh, which is what I should have read first. The
       * gatehouse is two towers at x = +/-2.6 with a 7.4-wide span over the gap between them and a
       * portcullis 0.25 thin in Z. So its OPENING runs along **X** (tower to tower) and you walk
       * through it along **Z**.
       *
       * That gives two rules, and the first two attempts each got one of them wrong:
       *   - the yaw must aim local +Z **radially**, out through the wall, because that is the way
       *     the road goes. Aiming it along the wall tangent — which is what a wall SEGMENT wants —
       *     turns the passage sideways: "its 90 degrees away from the road".
       *   - the stretch must go on **X**, widening the opening to fill the gap. Stretching Z instead
       *     just makes the passage longer: "the elongation affected the wrong side so now it acts
       *     more like a tunnel".
       *
       * `atan2(dx, dz)` is the standard yaw for a +Z-forward body, and the radial direction at
       * bearing `g` is `(cos g, sin g)`.
       */
      const gateHalf = (SEG * 1.9) / wallR;                 // the same half-angle `isGate` clears
      const GATE_SPAN = 7.4;                                // the mesh's own width, tower to tower
      for (const g of gateAngles.slice(0, 4)) {
        const gx = cx + Math.cos(g) * wallR, gz = cz + Math.sin(g) * wallR;
        if (terrain.underwater(gx, gz)) continue;
        const ax = cx + Math.cos(g - gateHalf) * wallR, az = cz + Math.sin(g - gateHalf) * wallR;
        const bx = cx + Math.cos(g + gateHalf) * wallR, bz = cz + Math.sin(g + gateHalf) * wallR;
        const chord = Math.hypot(bx - ax, bz - az);
        const wide = Math.max(1, chord / GATE_SPAN);
        const yaw = Math.atan2(Math.cos(g), Math.sin(g));   // +Z points out along the road
        const low = Math.min(terrain.heightAt(ax, az), terrain.heightAt(bx, bz));
        if (!place('gatehouse', gx, gz, yaw, [wide, 1, 1], 0.9, low, { solid: false })) continue;

        /**
         * The jambs, so the middle stays open.
         *
         * "The gate itself should be open so the player can walk through the middle." `place` would
         * register one circular solid over the whole gatehouse, which is a plug. Two solids at the
         * towers instead, offset along the wall's tangent — which is perpendicular to the radial
         * yaw above — leave the passage between them clear.
         */
        const tx = -Math.sin(g), tz = Math.cos(g);          // along the wall
        const off = 2.6 * wide;                             // where the mesh puts its towers
        const jamb = BUILDING_SOLIDS.gatehouse;
        if (jamb && jamb[0] > 0) {
          const r = Math.min(jamb[0] * 0.5, off * 0.7);
          for (const side of [-1, 1]) solids.add(gx + tx * off * side, gz + tz * off * side, r, jamb[1]);
        }
      }
      // towers beside every gate, and at the quarters
      const towerAngles = [...gateAngles.flatMap(g => [g - 0.26, g + 0.26]),
        ...[0, 1, 2, 3].map(i => (i / 4) * Math.PI * 2 + 0.4)];
      for (const a of towerAngles.slice(0, 10)) {
        place('tower', cx + Math.cos(a) * wallR, cz + Math.sin(a) * wallR, 0, 1, 1.1, null,
          { tint: cultKit.townWall.colour });
      }
    }
  }

  function buildInstances(px, pz) {
    const counts = {};
    for (const key of BUILDING_KEYS) counts[key] = 0;
    solids.clear();

    for (const node of settlements) {
      if (Math.hypot(node.wx - px, node.wz - pz) > radius) continue;
      buildSettlement(node, counts, px, pz);
    }
    for (const b of bridges) {
      if (Math.hypot(b.x - px, b.z - pz) > radius) continue;
      if (counts.bridge >= BUILDINGS.bridge.cap) break;
      // sit the deck on the road, which planet.js has already lifted clear of the water, and
      // stretch the span to cover the channel and both banks
      const river = terrain.riverInfoAt(b.x, b.z);
      const deck = terrain.roadSurfaceAt(b.x, b.z) ?? (terrain.heightAt(b.x, b.z) + 2.4);
      const needed = river ? river.width + 18 : 14;
      const span = Math.max(1, needed / BUILDINGS.bridge.span);
      matrix.compose(
        new THREE.Vector3(b.x, deck, b.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, b.angle, 0)),
        new THREE.Vector3(1.15, 1.15, span),
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
    rivers, roads, bridges, settlements, instanced, riverMesh, roadMesh, solids,

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

    /** The nearest settlement, however far off — what the HUD's objective line falls back to. */
    nearestSettlement(x, z) {
      let best = null, bd = Infinity;
      for (const s of settlements) {
        const d = Math.hypot(s.wx - x, s.wz - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best ? { ...best, x: best.wx, z: best.wz, distance: bd } : null;
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
        settlements: settlements.length, buildings, drawCalls, rebuilds, solids: solids.count,
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
