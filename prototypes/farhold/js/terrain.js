// Farhold — drawing the ground out to the horizon.
//
// The trick is concentric square RINGS centred on the player. Every ring has the same number of
// vertices but covers three times the area of the one inside it, so the grass under your boots is
// 2 m per quad and the mountains 8 km away are 162 m per quad — and the whole planet surface out to
// 7.8 km costs five meshes and about 92,000 triangles. Each ring has a hole in the middle where the
// finer ring covers it.
//
//   const view = createTerrainView(scene, terrain, { rings, THREE });
//   view.update(player.x, player.z);      // call every frame; it only rebuilds a ring when it moves
//
// Heights come from `planet.js` (`terrain.heightAt`), so the shape you see is the shape you collide
// with. Colours are per-vertex, so one material paints every biome.

import * as THREE from 'three';

/**
 * One ring: a square grid of `res` x `res` quads covering `extent` metres, with the middle
 * `hole` metres left out. Positions are rebuilt whenever the ring's snapped centre changes.
 */
class Ring {
  constructor(terrain, { extent, res, hole = 0 }) {
    this.terrain = terrain;
    this.extent = extent;
    this.res = res;
    this.cell = extent / res;
    this.hole = hole;
    this.centre = [Infinity, Infinity];

    const verts = (res + 1) * (res + 1);
    this.positions = new Float32Array(verts * 3);
    this.colors = new Float32Array(verts * 3);
    this.normals = new Float32Array(verts * 3);

    // the index buffer never changes: the hole is always the same size in ring-local space
    const half = extent / 2, holeHalf = hole / 2;
    const index = [];
    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const cx = -half + (x + 0.5) * this.cell, cy = -half + (y + 0.5) * this.cell;
        if (hole > 0 && Math.abs(cx) < holeHalf && Math.abs(cy) < holeHalf) continue;
        const a = y * (res + 1) + x, b = a + 1, c = a + res + 1, d = c + 1;
        index.push(a, c, b, b, c, d);
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
    this.geometry.setIndex(index);
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = `farhold-ring-${extent}`;
  }

  /** Move the ring to the player, snapped to its own cell size so the ground does not swim. */
  update(x, z, force = false) {
    const cx = Math.round(x / this.cell) * this.cell;
    const cz = Math.round(z / this.cell) * this.cell;
    if (!force && cx === this.centre[0] && cz === this.centre[1]) return false;
    this.centre = [cx, cz];
    this.rebuild(cx, cz);
    return true;
  }

  rebuild(cx, cz) {
    const { res, cell, extent, terrain } = this;
    const half = extent / 2;
    const P = this.positions, C = this.colors, N = this.normals;
    const rgb = [0, 0, 0], nrm = [0, 1, 0];
    // one height per vertex, then normals from the heights we just took (no extra sampling)
    const h = this._heights || (this._heights = new Float32Array((res + 1) * (res + 1)));
    for (let y = 0; y <= res; y++) {
      for (let x = 0; x <= res; x++) {
        h[y * (res + 1) + x] = terrain.heightAt(cx - half + x * cell, cz - half + y * cell);
      }
    }
    for (let y = 0; y <= res; y++) {
      for (let x = 0; x <= res; x++) {
        const i = y * (res + 1) + x, o = i * 3;
        const wx = cx - half + x * cell, wz = cz - half + y * cell;
        const height = h[i];
        P[o] = wx - cx; P[o + 1] = height; P[o + 2] = wz - cz;
        const l = h[y * (res + 1) + Math.max(0, x - 1)], r = h[y * (res + 1) + Math.min(res, x + 1)];
        const u = h[Math.max(0, y - 1) * (res + 1) + x], d = h[Math.min(res, y + 1) * (res + 1) + x];
        const nx = l - r, ny = 2 * cell, nz = u - d;
        const len = Math.hypot(nx, ny, nz) || 1;
        N[o] = nx / len; N[o + 1] = ny / len; N[o + 2] = nz / len;
        nrm[1] = ny / len;
        const steep = Math.hypot(r - l, d - u) / (2 * cell);
        terrain.colorAt(wx, wz, height, steep, rgb);
        C[o] = rgb[0]; C[o + 1] = rgb[1]; C[o + 2] = rgb[2];
      }
    }
    this.mesh.position.set(cx, 0, cz);
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
  }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/**
 * The whole visible planet surface.
 * opts: { rings: [{ extent, res }, …] innermost first, waterColor }
 */
export function createTerrainView(scene, terrain, opts = {}) {
  const specs = opts.rings || [{ extent: 192, res: 96 }, { extent: 576, res: 96 }, { extent: 1728, res: 96 }];
  const rings = [];
  for (let i = 0; i < specs.length; i++) {
    // the hole is a little smaller than the ring inside it, so they overlap by a couple of quads
    // instead of leaving a crack where the resolutions meet
    const inner = i === 0 ? 0 : specs[i - 1].extent - 2 * (specs[i].extent / specs[i].res);
    const ring = new Ring(terrain, { ...specs[i], hole: Math.max(0, inner) });
    rings.push(ring);
    scene.add(ring.mesh);
  }

  // one big plane at sea level; a dry world gets none
  let water = null;
  if (terrain.hasSea) {
    const size = specs[specs.length - 1].extent * 1.6;
    const geom = new THREE.PlaneGeometry(size, size, 1, 1);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(opts.waterColor || terrain.planet?.seaColor || '#1d4f7a'),
      transparent: true, opacity: 0.82,
    });
    water = new THREE.Mesh(geom, mat);
    water.name = 'farhold-water';
    water.position.y = terrain.seaLevel;
    water.frustumCulled = false;
    scene.add(water);
  }

  let rebuilds = 0;
  return {
    rings,
    water,
    /** Follow the player. Cheap on most frames — a ring only rebuilds when it has moved a cell. */
    update(x, z, force = false) {
      for (const r of rings) if (r.update(x, z, force)) rebuilds++;
      if (water) water.position.set(x, terrain.seaLevel, z);
    },
    /** How much geometry is on screen, for the HUD and the tests. */
    stats() {
      let triangles = 0;
      for (const r of rings) triangles += r.geometry.index.count / 3;
      return { rings: rings.length, triangles, rebuilds, viewDistance: specs[specs.length - 1].extent / 2 };
    },
    dispose() {
      for (const r of rings) { scene.remove(r.mesh); r.dispose(); }
      if (water) { scene.remove(water); water.geometry.dispose(); water.material.dispose(); }
    },
  };
}
