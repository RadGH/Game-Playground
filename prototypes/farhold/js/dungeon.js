// Farhold — dungeons: rooms and corridors you actually walk through.
//
// The honest limit in phase 4 was "dungeons are markers, not places" — a quest sent you to a dot on
// the map and there was nothing there. This builds the place: a seeded layout of rooms joined by
// corridors, with walls you cannot walk through, a pack in most rooms, a boss at the far end,
// chests worth the walk, and **no daylight** — which is where the torch stops being a decoration.
//
//   const d = await createDungeon(scene, { seed, balance, node, level, rpg, terrain });
//   controller.setTerrain(d.terrain);       // the floor is now the dungeon's floor
//   ...
//   d.dispose();                            // on the way out
//
// Layout: rooms are rectangles on a tile grid, placed without overlapping, then joined nearest-
// first with L-shaped corridors. Every tile that is floor writes its four neighbours; a neighbour
// that is not floor becomes a wall. Two merged geometries (floor, walls) plus one instanced pillar
// mesh means a whole dungeon is three draw calls.
//
// There is no ceiling on purpose. A third-person camera inside a closed box spends its life clipped
// into the roof; instead the walls are tall, the sky is black and the fog is close, which reads as
// "inside" from the floor and leaves the camera somewhere to go.

import * as THREE from 'three';
import { makeRng } from '../../../worldgen/js/noise.js';
import { ObstacleField } from './collide.js';
// The layout itself is pure arithmetic and lives next door, so the node tests can drive it.
import { DUNGEON_LOOKS, lookForBiome, layout, insideLayout } from './dungeon-plan.js';
export { DUNGEON_LOOKS, lookForBiome, layout, insideLayout };
import { createChests, sconceBody, brazierBody } from './chests.js';

/** Merge `{ geometry, color, matrix }` parts into one vertex-coloured geometry. */
function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.clone().toNonIndexed();
    g.applyMatrix4(p.matrix);
    g.computeVertexNormals();
    total += g.attributes.position.count;
    return { g, color: new THREE.Color(p.color) };
  });
  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);
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

const BOX = new THREE.BoxGeometry(1, 1, 1);
const at = (x, y, z, sx, sy, sz) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));

/**
 * Build the whole thing. Returns the group, a terrain stand-in the player controller can walk on,
 * the rooms with what belongs in them, and the light sources for `js/light.js`.
 */
export async function createDungeon(scene, {
  seed = 1, balance = {}, node = null, level = 1, rpg = null, look = 'barrow', name = 'The Hollow',
  surface = null,
} = {}) {
  const cfg = balance.dungeon || {};
  const L = DUNGEON_LOOKS[look] || DUNGEON_LOOKS.barrow;
  const rng = makeRng((seed >>> 0) ^ 0x51ed);
  const plan = layout({
    seed: seed ^ 0x2f1a,
    rooms: cfg.rooms || [6, 11],
    roomSize: cfg.roomSize || [9, 17],
    cellSize: cfg.cellSize ?? 6,
    corridor: cfg.corridor ?? 3.2,
  });

  const wallH = cfg.wallHeight ?? 4.6;
  const group = new THREE.Group();
  group.name = 'farhold-dungeon';
  const solids = new ObstacleField();
  // Down here the floor is flat and sits at zero, so a wall's roof is simply its own height. (At
  // 4.6 m nothing in a dungeon is jumpable anyway; this is here so the field behaves consistently.)
  solids.setGround(() => 0);

  // ---- floors: one slab per room and per corridor leg
  const floorParts = [];
  const wallParts = [];
  const pushFloor = (x, z, w, h) => floorParts.push({ geometry: BOX, color: L.floor, matrix: at(x, -0.15, z, w, 0.3, h) });

  for (const r of plan.rooms) pushFloor(r.x, r.z, r.w, r.h);
  const width = plan.corridor;
  for (const h of plan.halls) {
    const midX = h.bendX ? h.bx : h.ax;
    if (h.bendX) {
      pushFloor((h.ax + midX) / 2, h.az, Math.abs(midX - h.ax) + width, width);
      pushFloor(midX, (h.az + h.bz) / 2, width, Math.abs(h.bz - h.az) + width);
    } else {
      pushFloor(h.ax, (h.az + h.bz) / 2, width, Math.abs(h.bz - h.az) + width);
      pushFloor((h.ax + h.bx) / 2, h.bz, Math.abs(h.bx - h.ax) + width, width);
    }
  }

  // ---- walls: walk each room's perimeter in short segments and drop the ones a corridor uses
  const sconces = [];
  const every = cfg.sconceEvery ?? 7;
  const segment = 2.2;
  for (const r of plan.rooms) {
    const sides = [
      { from: [r.x - r.w / 2, r.z - r.h / 2], to: [r.x + r.w / 2, r.z - r.h / 2], n: [0, -1] },
      { from: [r.x - r.w / 2, r.z + r.h / 2], to: [r.x + r.w / 2, r.z + r.h / 2], n: [0, 1] },
      { from: [r.x - r.w / 2, r.z - r.h / 2], to: [r.x - r.w / 2, r.z + r.h / 2], n: [-1, 0] },
      { from: [r.x + r.w / 2, r.z - r.h / 2], to: [r.x + r.w / 2, r.z + r.h / 2], n: [1, 0] },
    ];
    let placed = 0;
    for (const side of sides) {
      const len = Math.hypot(side.to[0] - side.from[0], side.to[1] - side.from[1]);
      const n = Math.max(1, Math.round(len / segment));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = side.from[0] + (side.to[0] - side.from[0]) * t;
        const z = side.from[1] + (side.to[1] - side.from[1]) * t;
        // a doorway: skip the segment where a corridor meets this wall
        const out = insideLayout(plan, x + side.n[0] * 1.4, z + side.n[1] * 1.4, 0);
        if (out && out !== r) continue;
        const along = side.n[0] ? [0.5, len / n + 0.4] : [len / n + 0.4, 0.5];
        wallParts.push({ geometry: BOX, color: L.wall, matrix: at(x, wallH / 2, z, along[0], wallH, along[1]) });
        wallParts.push({ geometry: BOX, color: L.trim, matrix: at(x, wallH - 0.18, z, along[0] + 0.14, 0.26, along[1] + 0.14) });
        solids.add(x, z, 0.9, wallH);
        placed++;
        if (placed % every === 0) {
          sconces.push({ x: x - side.n[0] * 0.5, y: 2.6, z: z - side.n[1] * 0.5, angle: Math.atan2(side.n[0], side.n[1]) });
        }
      }
    }
  }
  // corridor walls: a rail either side of every leg
  for (const h of plan.halls) {
    const midX = h.bendX ? h.bx : h.ax;
    const legs = h.bendX
      ? [{ x: (h.ax + midX) / 2, z: h.az, w: Math.abs(midX - h.ax), horiz: true },
         { x: midX, z: (h.az + h.bz) / 2, w: Math.abs(h.bz - h.az), horiz: false }]
      : [{ x: h.ax, z: (h.az + h.bz) / 2, w: Math.abs(h.bz - h.az), horiz: false },
         { x: (h.ax + h.bx) / 2, z: h.bz, w: Math.abs(h.bx - h.ax), horiz: true }];
    for (const leg of legs) {
      if (leg.w < 1) continue;
      const n = Math.max(1, Math.round(leg.w / segment));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        for (const side of [-1, 1]) {
          const x = leg.horiz ? leg.x + t * leg.w : leg.x + side * (width / 2 + 0.25);
          const z = leg.horiz ? leg.z + side * (width / 2 + 0.25) : leg.z + t * leg.w;
          if (insideLayout(plan, x, z, -0.3)) continue;   // a room already owns this spot
          const dims = leg.horiz ? [leg.w / n + 0.4, 0.5] : [0.5, leg.w / n + 0.4];
          wallParts.push({ geometry: BOX, color: L.wall, matrix: at(x, wallH / 2, z, dims[0], wallH, dims[1]) });
          solids.add(x, z, 0.6, wallH);
        }
      }
    }
  }

  const floorMesh = new THREE.Mesh(mergeParts(floorParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  const wallMesh = new THREE.Mesh(mergeParts(wallParts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  floorMesh.name = 'farhold-dungeon-floor';
  wallMesh.name = 'farhold-dungeon-walls';
  floorMesh.frustumCulled = false;
  wallMesh.frustumCulled = false;
  group.add(floorMesh, wallMesh);

  // ---- sconces, as one instanced mesh and a matching list of light sources
  const sconceGeo = sconceBody('#3a3a42', L.trim);
  const sconceMesh = new THREE.InstancedMesh(sconceGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), Math.max(1, sconces.length));
  const m = new THREE.Matrix4();
  sconces.forEach((s, i) => {
    m.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.angle, 0)), new THREE.Vector3(1.6, 1.6, 1.6));
    sconceMesh.setMatrixAt(i, m);
  });
  sconceMesh.count = sconces.length;
  sconceMesh.instanceMatrix.needsUpdate = true;
  sconceMesh.frustumCulled = false;
  sconceMesh.name = 'farhold-dungeon-sconces';
  group.add(sconceMesh);

  // a brazier in the middle of the boss room, so the fight is lit
  const braziers = [];
  if (plan.boss !== plan.entrance) {
    const bg = brazierBody('#4a4038', L.trim);
    for (const [ox, oz] of [[-plan.boss.w * 0.3, -plan.boss.h * 0.3], [plan.boss.w * 0.3, plan.boss.h * 0.3]]) {
      const mesh = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.position.set(plan.boss.x + ox, 0, plan.boss.z + oz);
      mesh.scale.setScalar(1.4);
      group.add(mesh);
      braziers.push({ x: mesh.position.x, y: 1.9, z: mesh.position.z });
      solids.add(mesh.position.x, mesh.position.z, 0.5, 2);
    }
  }

  scene.add(group);

  // ---- a terrain stand-in: flat floor, hard bounds, and the surface's biome for spawn tables
  const pad = 2;
  const bounds = plan.bounds;
  const terrain = {
    world: surface?.world,
    planet: surface?.planet,
    dungeon: true,
    heightAt: () => 0,
    naturalHeightAt: () => 0,
    slopeAt: () => 0,
    normalAt: () => [0, 1, 0],
    colorAt: () => [0.29, 0.26, 0.22],
    biomeAt: (x, z) => surface?.biomeAt(surface.spawn?.x ?? 0, surface.spawn?.z ?? 0) || { key: 'rock', name: L.name },
    biomeIdAt: () => surface?.biomeIdAt(surface.spawn?.x ?? 0, surface.spawn?.z ?? 0) ?? 0,
    temperatureAt: () => 0.4,
    climateAt: () => surface?.climateAt(surface.spawn?.x ?? 0, surface.spawn?.z ?? 0) || { temp: 0.4, moist: 0.4 },
    underwater: () => false,
    waterAt: () => null,
    riverAt: () => 0,
    roadAt: () => 0,
    regionAt: () => null,
    cellAt: () => ({ x: 0, y: 0 }),
    widthM: bounds.maxX - bounds.minX,
    depthM: bounds.maxZ - bounds.minZ,
    clampToWorld: (x, z) => [
      Math.max(bounds.minX - pad, Math.min(bounds.maxX + pad, x)),
      Math.max(bounds.minZ - pad, Math.min(bounds.maxZ + pad, z)),
    ],
    spawnPoint: () => ({ x: plan.entrance.x, z: plan.entrance.z, height: 0 }),
    riverPaths: [], roadPaths: [],
  };

  // ---- chests inside: their own field, placed by hand rather than scattered
  const chests = createChests(scene, terrain, { seed, balance, rpg, collide: solids });
  const placedChests = [];
  for (const r of plan.rooms) {
    if (r.kind === 'entrance') continue;
    const isBoss = r.kind === 'boss';
    if (!isBoss && rng() > (cfg.chestChance ?? 0.55)) continue;
    const kind = isBoss ? (rng() < 0.55 ? 'warded' : 'gilded') : rng() < 0.2 ? 'gilded' : rng() < 0.55 ? 'iron' : 'wooden';
    const cx = r.x + (rng() - 0.5) * (r.w - 3);
    const cz = r.z + (rng() - 0.5) * (r.h - 3);
    placedChests.push(chests.place(kind, cx, cz, { facing: rng() * Math.PI * 2, level }));
  }

  /** Every light the dungeon wants lit, for js/light.js. */
  function lights() {
    return [
      ...sconces.map(s => ({ x: s.x, y: s.y, z: s.z, color: balance.light?.sconce?.color || '#ffb070', range: balance.light?.sconce?.range ?? 22, intensity: balance.light?.sconce?.intensity ?? 2.8 })),
      ...braziers.map(b => ({ x: b.x, y: b.y, z: b.z, color: balance.light?.brazier?.color || '#ff9040', range: balance.light?.brazier?.range ?? 26, intensity: balance.light?.brazier?.intensity ?? 2.4 })),
      ...chests.lights(),
    ];
  }

  function dispose() {
    chests.clear();
    scene.remove(group);
    floorMesh.geometry.dispose(); floorMesh.material.dispose();
    wallMesh.geometry.dispose(); wallMesh.material.dispose();
    sconceMesh.geometry.dispose(); sconceMesh.material.dispose();
  }

  return {
    name, look: L, plan, group, terrain, solids, chests, placedChests,
    rooms: plan.rooms, entrance: plan.entrance, bossRoom: plan.boss,
    level, lights, dispose,
    /** Where the player comes in, and where the way out is. */
    entryPoint: () => ({ x: plan.entrance.x, z: plan.entrance.z + plan.entrance.h / 2 - 2, y: 0 }),
    exitPoint: () => ({ x: plan.entrance.x, z: plan.entrance.z + plan.entrance.h / 2 - 2 }),
    stats: () => ({ rooms: plan.rooms.length, halls: plan.halls.length, sconces: sconces.length, chests: placedChests.length }),
  };
}

// ---------------------------------------------------------------------------- the way in

/** A stone archway over a dark mouth: what a dungeon looks like from the outside. */
function gateBody(stone = '#5a5248', dark = '#0a0a0c', trim = '#8a7a5a') {
  return mergeParts([
    // two posts and a lintel
    { geometry: BOX, color: stone, matrix: at(-1.7, 2, 0, 0.9, 4, 1.2) },
    { geometry: BOX, color: stone, matrix: at(1.7, 2, 0, 0.9, 4, 1.2) },
    { geometry: BOX, color: stone, matrix: at(0, 4.3, 0, 4.4, 0.9, 1.4) },
    { geometry: BOX, color: trim, matrix: at(0, 4.85, 0, 4.8, 0.3, 1.6) },
    // the mouth itself: a black slab set back, so it reads as a hole rather than a door
    { geometry: BOX, color: dark, matrix: at(0, 1.8, -0.5, 2.6, 3.6, 0.3) },
    // steps down
    { geometry: BOX, color: stone, matrix: at(0, 0.1, 1.2, 3.6, 0.3, 1.2) },
    { geometry: BOX, color: stone, matrix: at(0, -0.05, 2.1, 3.2, 0.3, 0.9) },
  ]);
}

/**
 * The dungeon mouths on this world, built where World Forge already placed `dungeon` nodes — the
 * same nodes the quest layer has always sent you to. Before round 4 there was nothing standing
 * there; now there is a door, and it opens.
 */
export function createGates(scene, terrain, { balance = {}, zones = null, radius = 2600, collide = null } = {}) {
  const M_PER_CELL = balance.world?.metresPerCell ?? 640;
  const nodes = (terrain.world?.nodes || [])
    .filter(n => n.type === 'dungeon')
    .map(n => ({
      id: n.id, name: n.name, kind: n.kind,
      x: n.x * M_PER_CELL, z: n.y * M_PER_CELL,
      zone: zones?.at(n.x * M_PER_CELL, n.y * M_PER_CELL) || null,
      cleared: false,
    }));

  const geometry = gateBody();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, Math.min(48, nodes.length)));
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.name = 'farhold-dungeon-gates';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);

  let centre = [Infinity, Infinity];
  const m = new THREE.Matrix4();
  let shown = [];

  function update(px, pz, force = false) {
    if (!force && Math.hypot(px - centre[0], pz - centre[1]) < 200) return;
    centre = [px, pz];
    shown = nodes.filter(n => Math.hypot(n.x - px, n.z - pz) < radius).slice(0, mesh.instanceMatrix.count);
    shown.forEach((n, i) => {
      n.y = terrain.heightAt(n.x, n.z);
      m.compose(
        new THREE.Vector3(n.x, n.y, n.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (n.id % 8) * 0.78, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      mesh.setMatrixAt(i, m);
      collide?.add(n.x - 1.7, n.z, 0.8, 4);
      collide?.add(n.x + 1.7, n.z, 0.8, 4);
    });
    mesh.count = shown.length;
    mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    nodes, mesh, update,
    get visible() { return shown; },
    /** The mouth you are standing in front of, or null. */
    nearest: (x, z, range = 4.5) => {
      let best = null, bestD = range;
      for (const n of shown) {
        const d = Math.hypot(n.x - x, n.z - z);
        if (d < bestD) { bestD = d; best = n; }
      }
      return best;
    },
    /** Torches either side of every mouth, so you can find one at night. */
    lights: () => shown.map(n => ({ x: n.x, y: (n.y || 0) + 3.4, z: n.z + 0.9, color: '#ff9040', range: 20, intensity: 1.8 })),
    dispose() { scene.remove(mesh); geometry.dispose(); material.dispose(); },
  };
}
