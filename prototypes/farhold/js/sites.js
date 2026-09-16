// Farhold — set-pieces on the surface: camps with a fire in them, and the lairs world bosses keep.
//
// Spawning in a ring around the player gives you a world that is evenly, blandly dangerous. A camp
// is the opposite: a *place* that is dangerous, that you can see from a distance (the fire), decide
// to avoid, and come back to when you are three levels higher. The map already places `landmark`
// nodes; this puts something at them.
//
//   const sites = createSites(scene, terrain, { seed, balance, zones });
//   sites.update(px, pz);                  // builds the tents and fires near you
//   for (const s of sites.due(px, pz)) …   // sites close enough to populate, once each
//
// Two kinds:
//   camp  — a fire, two or three tents, a pack with a leader, and a chest worth the fight
//   lair  — a ring of standing stones and a world boss, in the harder half of the world only
//
// Nothing here decides *what* spawns: main.js owns that, because it owns the enemy field.

import * as THREE from 'three';
import { makeRng } from '../../../worldgen/js/noise.js';
import { brazierBody } from './chests.js';

function mergeParts(parts) {
  let total = 0;
  const prepared = parts.map(p => {
    const g = p.geometry.clone().toNonIndexed();
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
const at = (x, y, z, sx, sy, sz, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CONE = new THREE.ConeGeometry(1, 1, 5);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 7);

/** A hide tent: a cone with a pole and a dark mouth. */
function tentBody(hide = '#6a5238', pole = '#3a2e22') {
  return mergeParts([
    { geometry: CONE, color: hide, matrix: at(0, 1.1, 0, 1.5, 2.2, 1.5) },
    { geometry: CYL, color: pole, matrix: at(0, 1.3, 0, 0.06, 2.6, 0.06) },
    { geometry: BOX, color: '#100c08', matrix: at(0, 0.5, 1.05, 0.55, 1, 0.12) },
  ]);
}

/** A standing stone, for a boss's lair: five of these in a ring says "something lives here". */
function stoneBody(rock = '#5a5a58') {
  return mergeParts([
    { geometry: BOX, color: rock, matrix: at(0, 1.9, 0, 0.9, 3.8, 0.55) },
    { geometry: BOX, color: rock, matrix: at(0, 0.2, 0, 1.4, 0.4, 1) },
  ]);
}

export function createSites(scene, terrain, { seed = 1, balance = {}, zones = null, collide = null, radius = 2600 } = {}) {
  const M_PER_CELL = balance.world?.metresPerCell ?? 640;
  const rng = makeRng((seed >>> 0) ^ 0x5173);

  // landmarks and passes become camps; the highest-band landmarks become lairs
  const sites = (terrain.world?.nodes || [])
    .filter(n => n.type === 'landmark' || n.type === 'pass')
    .map((n, i) => {
      const x = n.x * M_PER_CELL, z = n.y * M_PER_CELL;
      const zone = zones?.at(x, z) || null;
      // a lair only makes sense out where the levels are high, and only for one landmark in four
      const lair = !!zone && zone.band >= 3 && (n.id % 4 === 0);
      return {
        id: n.id, name: n.name, kind: lair ? 'lair' : 'camp',
        x, z, zone, level: zone?.midLevel ?? 1,
        populated: false, cleared: false, index: i,
      };
    });

  const tentMesh = new THREE.InstancedMesh(tentBody(), new THREE.MeshLambertMaterial({ vertexColors: true }), 48);
  const fireMesh = new THREE.InstancedMesh(brazierBody('#4a4038', '#ff9040'), new THREE.MeshLambertMaterial({ vertexColors: true }), 16);
  const stoneMesh = new THREE.InstancedMesh(stoneBody(), new THREE.MeshLambertMaterial({ vertexColors: true }), 40);
  for (const m of [tentMesh, fireMesh, stoneMesh]) {
    m.count = 0; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(m);
  }
  tentMesh.name = 'farhold-site-tents';
  fireMesh.name = 'farhold-site-fires';
  stoneMesh.name = 'farhold-site-stones';

  let centre = [Infinity, Infinity];
  let shown = [];
  const fires = [];
  const m4 = new THREE.Matrix4();

  function update(px, pz, force = false) {
    if (!force && Math.hypot(px - centre[0], pz - centre[1]) < 180) return;
    centre = [px, pz];
    shown = sites.filter(s => Math.hypot(s.x - px, s.z - pz) < radius).slice(0, 12);
    let tents = 0, stones = 0;
    fires.length = 0;
    for (const s of shown) {
      s.y = terrain.heightAt(s.x, s.z);
      const r = makeRng((seed ^ (s.id * 2654435761)) >>> 0);
      if (s.kind === 'camp') {
        if (fires.length < fireMesh.instanceMatrix.count) {
          m4.compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion(), new THREE.Vector3(1.1, 1.1, 1.1));
          fireMesh.setMatrixAt(fires.length, m4);
          fires.push({ x: s.x, y: s.y + 1.8, z: s.z });
          collide?.add(s.x, s.z, 0.6, 2);
        }
        const n = 2 + Math.floor(r() * 2);
        for (let i = 0; i < n && tents < tentMesh.instanceMatrix.count; i++) {
          const a = (i / n) * Math.PI * 2 + r();
          const d = 5 + r() * 3;
          const tx = s.x + Math.cos(a) * d, tz = s.z + Math.sin(a) * d;
          m4.compose(new THREE.Vector3(tx, terrain.heightAt(tx, tz), tz),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a + Math.PI, 0)), new THREE.Vector3(1, 1, 1));
          tentMesh.setMatrixAt(tents++, m4);
          collide?.add(tx, tz, 1.4, 2.4);
        }
      } else {
        for (let i = 0; i < 6 && stones < stoneMesh.instanceMatrix.count; i++) {
          const a = (i / 6) * Math.PI * 2;
          const d = (balance.dungeon?.lairRadius ?? 13);
          const sx = s.x + Math.cos(a) * d, sz = s.z + Math.sin(a) * d;
          m4.compose(new THREE.Vector3(sx, terrain.heightAt(sx, sz), sz),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)), new THREE.Vector3(1, 1, 1));
          stoneMesh.setMatrixAt(stones++, m4);
          collide?.add(sx, sz, 0.8, 4);
        }
      }
    }
    tentMesh.count = tents; stoneMesh.count = stones; fireMesh.count = fires.length;
    for (const m of [tentMesh, fireMesh, stoneMesh]) m.instanceMatrix.needsUpdate = true;
  }

  /** Sites close enough to fill with bodies, and not filled yet. Each comes back once. */
  function due(px, pz, range = 150) {
    const out = [];
    for (const s of shown) {
      if (s.populated || s.cleared) continue;
      if (Math.hypot(s.x - px, s.z - pz) > range) continue;
      s.populated = true;
      out.push(s);
    }
    return out;
  }

  /** Walking far enough away lets a site be filled again, so the world is not used up. */
  function relax(px, pz, range = 420) {
    for (const s of sites) {
      if (s.populated && !s.cleared && Math.hypot(s.x - px, s.z - pz) > range) s.populated = false;
    }
  }

  return {
    sites, update, due, relax,
    get visible() { return shown; },
    nearest: (x, z, range = 40) => {
      let best = null, bestD = range;
      for (const s of shown) { const d = Math.hypot(s.x - x, s.z - z); if (d < bestD) { bestD = d; best = s; } }
      return best;
    },
    lights: () => fires.map(f => ({
      x: f.x, y: f.y, z: f.z,
      color: balance.light?.brazier?.color || '#ff9040',
      range: balance.light?.brazier?.range ?? 26,
      intensity: balance.light?.brazier?.intensity ?? 2.4,
    })),
    stats: () => ({ sites: sites.length, shown: shown.length, camps: sites.filter(s => s.kind === 'camp').length, lairs: sites.filter(s => s.kind === 'lair').length }),
    dispose() { for (const m of [tentMesh, fireMesh, stoneMesh]) { scene.remove(m); m.geometry.dispose(); m.material.dispose(); } },
  };
}
