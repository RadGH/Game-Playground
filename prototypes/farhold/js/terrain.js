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
//
// That one sampler is also how the player's own terrain edits get drawn: `js/terraform.js` puts
// itself in front of `terrain.heightAt`, so a levelled building pad appears here with no change to
// the ring code at all. The one thing it does need is `editedAt()` at the bottom of this file —
// a ring only rebuilds when it MOVES, and flattening the ground you are standing on moves nothing.

import * as THREE from 'three';
import { M_PER_CELL, M_PER_CELL_DEFAULT } from './planet.js';

/**
 * One ring: a square grid of `res` x `res` quads covering `extent` metres, with the middle
 * `hole` metres left out. Positions are rebuilt whenever the ring's snapped centre changes.
 */
class Ring {
  constructor(terrain, { extent, res, hole = 0, innerCell = 0 }) {
    this.terrain = terrain;
    this.extent = extent;
    this.res = res;
    this.cell = extent / res;
    this.hole = hole;
    // the cell size of the ring that covers our hole, so we know how far its edge really reaches
    this.innerCell = innerCell;
    // how far the hole's lip drops; proportional to this ring's own resolution
    this.skirt = this.cell * 1.2;
    // the ring at 1x, kept so `setViewScale` can stretch it and put it back afterwards
    this.base = { extent, cell: this.cell, hole, skirt: this.skirt, innerCell };
    this.viewScale = 1;
    /**
     * …and how much deeper to make it. From head height a 1.2-cell drop hides the seam between two
     * rings; from a ship two kilometres up you are looking almost straight down at it and the gap
     * opens into a visible trench. Flying raises this.
     */
    this.skirtScale = 1;
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
        let height = h[i];
        /**
         * A SKIRT around the hole — AND IT HAS TO STAY UNDER THE FINER RING.
         *
         * Where two rings of different resolution meet, their edges do not agree to the millimetre,
         * and at a grazing angle you could see through the join. Dropping the vertices on the hole's
         * edge makes the quads bordering it slope down into ground the finer ring is already
         * covering, so any gap is behind a wall instead of open sky.
         *
         * But the drop used to reach a whole cell PAST the hole's rim, and the ramp from a dropped
         * vertex up to the next one is one cell long — so the last half of that ramp came out beyond
         * the finer ring's own edge, in the open, where nothing covered it. On the ground the drop is
         * a couple of metres and you never notice. In the air `js/main.js` multiplies the skirt by up
         * to eight and stretches every ring by up to six at the same time, and that exposed ramp
         * becomes a trench hundreds of metres deep running right round the player: "when flying
         * around there are a few different levels of terrain that do not mesh together correctly,
         * showing as giant squares centered around the player." One square per ring.
         *
         * So the drop stops one cell INSIDE the rim. The ramp then runs from `hole/2 - cell` to
         * `hole/2`, and the finer ring covers out to `hole/2 + cell`, so the whole of it is hidden
         * under geometry however deep it goes. The spare cell is what pays for the two rings being
         * snapped to different grids — they can sit up to half of this cell plus half of the finer
         * one apart, and that is less than the cell of slack we left.
         */
        if (this.hole > 0) {
          const lx = Math.abs(wx - cx), lz = Math.abs(wz - cz);
          // how far the finer ring is SURE to reach: its own edge, less the half-cell each of us
          // may be snapped away by. The ramp off the last dropped row is one cell long, so the last
          // dropped row has to sit a cell inside that.
          const cover = this.hole / 2 + cell - (cell + this.innerCell) / 2;
          if (Math.max(lx, lz) <= cover - cell + 1e-3) height -= this.skirt * this.skirtScale;
        }
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
  const base = opts.rings || [{ extent: 192, res: 96 }, { extent: 576, res: 96 }, { extent: 1728, res: 96 }];
  /**
   * RING EXTENTS SHRINK WITH THE WORLD.
   *
   * They are absolute metres — the outer one reaches 15.5 km — which is right for a 163 km planet and
   * absurd on a 16 km one, where the outermost ring is wider than the whole map and hangs off both
   * poles. They follow the planet-scale knob now, at the square root of it so a small world still
   * draws a decent horizon rather than a dinner plate: a 16 km world (0.1) keeps 32% of the reach.
   */
  const shrink = Math.sqrt(Math.max(0.05, (terrain.metresPerCell || M_PER_CELL) / M_PER_CELL_DEFAULT));
  const specs = shrink >= 0.999 ? base
    : base.map(r => ({ ...r, extent: Math.max(96, Math.round(r.extent * shrink)) }));
  const rings = [];
  for (let i = 0; i < specs.length; i++) {
    // the hole is a little smaller than the ring inside it, so they overlap by a couple of quads
    // instead of leaving a crack where the resolutions meet
    const inner = i === 0 ? 0 : specs[i - 1].extent - 2 * (specs[i].extent / specs[i].res);
    const innerCell = i === 0 ? 0 : specs[i - 1].extent / specs[i - 1].res;
    const ring = new Ring(terrain, { ...specs[i], hole: Math.max(0, inner), innerCell });
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
    /**
     * Stretch every ring, keeping the same number of triangles.
     *
     * "Once you enter a rocket you should enter a lower level of detail… you should see many chunks
     * away but at lower resolution." A clipmap ring is a fixed grid of vertices over a fixed patch
     * of ground, so multiplying its extent, its cell size, its hole and its skirt by the same number
     * covers more world at a coarser step — and because the ring-local SHAPE is unchanged, the index
     * buffer is still valid and nothing has to be reallocated. At 6x the innermost ring covers a
     * kilometre instead of 192 m and the outermost reaches ten kilometres, for the same cost.
     */
    setViewScale(k, x, z) {
      const want = Math.max(1, Math.min(opts.maxViewScale ?? 9, k));
      if (Math.abs(want - (rings[0]?.viewScale ?? 1)) < 0.08) return false;
      for (const r of rings) {
        r.viewScale = want;
        r.extent = r.base.extent * want;
        r.cell = r.base.cell * want;
        r.hole = r.base.hole * want;
        r.skirt = r.base.skirt * want;
        r.innerCell = r.base.innerCell * want;    // every ring stretches by the same number, so the
                                                  // skirt band below still lands where it should
        r.update(x, z, true);
      }
      if (water) {
        water.scale.setScalar(want);
      }
      return true;
    },

    /**
     * Deepen every ring's skirt as the camera climbs — but only so far.
     *
     * `js/main.js` asks for up to 8x from the air, on top of the ring stretch, which used to be the
     * only way to hide the seam from altitude. The skirt sits under the finer ring now (see `rebuild`
     * above), so a deeper one buys nothing past the point where it covers the join, and a skirt of
     * several hundred metres is a hole in the world for anything that samples ring geometry — or for
     * the camera on the way down through it. `maxSkirtScale` is the ceiling.
     */
    setSkirtScale(k, x, z) {
      const want = Math.max(1, Math.min(opts.maxSkirtScale ?? 3, k));
      let changed = false;
      for (const r of rings) {
        if (Math.abs(r.skirtScale - want) < 0.05) continue;
        r.skirtScale = want;
        changed = true;
      }
      if (changed) for (const r of rings) r.update(x, z, true);
    },

    /** Hide the whole planet — walking into a dungeon does this; there is no daylight down there. */
    setVisible(on) {
      for (const r of rings) r.mesh.visible = !!on;
      if (water) water.visible = !!on;
    },
    /** Follow the player. Cheap on most frames — a ring only rebuilds when it has moved a cell. */
    update(x, z, force = false) {
      for (const r of rings) if (r.update(x, z, force)) rebuilds++;
      if (water) water.position.set(x, terrain.seaLevel, z);
    },

    /**
     * THE GROUND CHANGED UNDER US — REDRAW THE RINGS THAT CAN SEE IT.
     *
     * `js/terraform.js` lets the player level, raise and lower the ground, and those edits go in
     * front of `terrain.heightAt` — so collision, the camera and prop placement pick them up on the
     * next frame for free. The clipmap does not, because a ring only rebuilds when its snapped
     * centre moves, and levelling the ground you are standing on moves nothing at all. Without this
     * you smooth a hillside and the hillside is still drawn there until you walk a cell away.
     *
     * Forcing every ring would work and costs about 92,000 vertices of resampling, which is a
     * visible hitch on a modest machine and happens on every click of a paint tool. So only the
     * rings whose covered square actually touches the edit are rebuilt: a 6 m pad under your boots
     * is one ring, and the outermost ring — the expensive one in perceived terms, because it covers
     * 15 km of mountains — is left alone unless the edit is somehow out there.
     */
    editedAt(ex, ez, radius = 0, px = null, pz = null) {
      let touched = 0;
      for (const r of rings) {
        const half = r.extent / 2;
        if (Math.abs(ex - r.centre[0]) - radius > half) continue;
        if (Math.abs(ez - r.centre[1]) - radius > half) continue;
        r.update(px == null ? r.centre[0] : px, pz == null ? r.centre[1] : pz, true);
        rebuilds++;
        touched++;
      }
      return touched;
    },
    /** How much geometry is on screen, for the HUD and the tests. */
    stats() {
      let triangles = 0;
      for (const r of rings) triangles += r.geometry.index.count / 3;
      const scale = rings[0]?.viewScale ?? 1;
      return { rings: rings.length, triangles, rebuilds, viewScale: scale, viewDistance: specs[specs.length - 1].extent * scale / 2 };
    },
    dispose() {
      for (const r of rings) { scene.remove(r.mesh); r.dispose(); }
      if (water) { scene.remove(water); water.geometry.dispose(); water.material.dispose(); }
    },
  };
}
