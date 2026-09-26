// Farhold — a column of light over the thing you are being told to go to.
//
//   "In the world, there should be a large animated pointer above the location or object to help the
//    player find it, and a radial arrow pointing to it when its off-screen."
//
// The minimap already had a rim arrow and space already had brackets; what was missing was anything
// at all IN the world. A row in a panel that says "240 m NE" still leaves you turning on the spot
// looking for a cart, and a marker you cannot see is a marker that does not work.
//
// This is deliberately a pool of six and not a beacon-per-thing. Six is the cap on the Nearby panel
// and on a scan's pins, and a pool means no allocation while the player walks and a fixed, knowable
// cost: three meshes each, shared geometry, shared material, eighteen draw calls at the very worst.
//
//   const beacons = createBeacons(scene);
//   beacons.set([{ x, z, y, color, kind }]);   // whatever should be marked right now
//   beacons.update(dt, camera);                // once a frame
//
// THE ONE RULE THAT MAKES IT USEFUL: a beacon is the same size on SCREEN however far away it is.
// A pointer that shrinks with distance is invisible at exactly the range you need it — which is far
// enough away that you cannot see the thing itself.

import * as THREE from 'three';

const MAX = 6;
/** Past this, a beacon is not helping you find anything; it is just a light on the horizon. */
export const BEACON_RANGE = 1400;

// built once and shared by every beacon — a pool that allocated geometry would defeat its own point
/**
 * R15 — THE BEAM STARTS ABOVE THE ARROWHEADS.
 *
 *   "To the arrow indicators we've added that you can see in a distance, make their beams only
 *    appear above the arrow heads, so that they aren't touching the ground. Right now they have a
 *    pillar coming out of the ground."
 *
 * It was 14 units tall centred at y=7, so it ran 0 → 14: a column standing ON the spot, which reads
 * as a thing in the world rather than as a sign pointing at one — and at close range you walk into
 * it. The arrows sit at 5 → 8.8, so the beam now starts at 10.5 and goes up from there, and the
 * bottom of it is wider than the top so it reads as light spreading away from the arrows rather
 * than as a post holding them up.
 */
const SHAFT = new THREE.CylinderGeometry(0.1, 0.62, 13, 6, 1, true);
/** Where the beam begins, in the same units the chevrons use. Above all three of them. */
const BEAM_FROM = 10.5;
const CHEVRON = new THREE.ConeGeometry(1.1, 1.6, 4);
const RING = new THREE.RingGeometry(1.6, 2.0, 24);

/**
 * R27 M8 — ONE MESH A BEACON, NOT FIVE. The shaft, the three chevrons and the ring share one
 * material and were five meshes (and, transparent and double-sided, ten draw calls). They are one
 * buffer now: each part's own vertices, laid end to end, and the two parts that move on their own
 * (the chevrons bob, the ring pulses) are rewritten each frame from their rest shape — about a
 * hundred vertices, which costs nothing next to the draw calls it saves.
 */
function restOf(geometry, matrix) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  g.applyMatrix4(matrix);
  return Float32Array.from(g.attributes.position.array);
}
const REST = {
  shaft: restOf(SHAFT, new THREE.Matrix4().makeTranslation(0, BEAM_FROM + 13 / 2, 0)),
  // pointing DOWN, at the origin; each is lifted to its own height every frame
  chevron: restOf(CHEVRON, new THREE.Matrix4().makeRotationX(Math.PI)),
  // lying flat on the ground (its local x/y become world x/z), scaled about its middle every frame
  ring: restOf(RING, new THREE.Matrix4().makeRotationX(-Math.PI / 2)),
};

function makeOne() {
  const group = new THREE.Group();
  group.visible = false;

  // the material is per-beacon because the COLOUR is: a quest is gold, an impact is ember, a seam is
  // copper, and the whole point is that a beacon and its minimap glyph are visibly the same thing
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffd24a'),
    transparent: true, opacity: 0.4, depthWrite: false, fog: false,
    side: THREE.DoubleSide,
  });
  // R27 M8 — a transparent double-sided material draws every mesh TWICE (back faces, then front)
  // unless told otherwise. One pass is plenty for a faint column.
  mat.forceSinglePass = true;

  const nS = REST.shaft.length, nC = REST.chevron.length, nR = REST.ring.length;
  const pos = new Float32Array(nS + nC * 3 + nR);
  pos.set(REST.shaft, 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;      // it is rewritten every frame and scaled up to 6x; never worth culling
  group.add(mesh);

  /**
   * The chevrons at heights `ys`, the ring at `pulse`. The chevrons sit at 5 → 8.8 (three of them
   * chasing each other toward the ground) and the beam starts at `BEAM_FROM`, above all three —
   * R15's rule, so the beacon never stands ON the spot. The ring stays on the ground at 0.12: it is
   * the only part that says WHERE, exactly.
   */
  function pose(ys, pulse) {
    let o = nS;
    for (const y of ys) {
      for (let i = 0; i < nC; i += 3) { pos[o + i] = REST.chevron[i]; pos[o + i + 1] = REST.chevron[i + 1] + y; pos[o + i + 2] = REST.chevron[i + 2]; }
      o += nC;
    }
    for (let i = 0; i < nR; i += 3) { pos[o + i] = REST.ring[i] * pulse; pos[o + i + 1] = 0.12; pos[o + i + 2] = REST.ring[i + 2] * pulse; }
    geo.attributes.position.needsUpdate = true;
  }
  pose([5, 6.9, 8.8], 1);
  return { group, mat, mesh, pose, key: null, ground: 0 };
}

export function createBeacons(scene, { max = MAX, heightAt = null } = {}) {
  const pool = [];
  for (let i = 0; i < max; i++) {
    const b = makeOne();
    scene.add(b.group);
    pool.push(b);
  }
  let t = 0;
  let live = 0;

  return {
    get count() { return live; },
    /**
     * What should be marked right now. Anything already on a beacon keeps it — re-pointing a beacon
     * that is already over the right spot would restart its bob and make the whole set flicker.
     */
    set(list = []) {
      const want = list.slice(0, max);
      live = want.length;
      for (let i = 0; i < max; i++) {
        const b = pool[i];
        const a = want[i];
        if (!a) { b.group.visible = false; b.key = null; continue; }
        const key = a.id || `${Math.round(a.x)},${Math.round(a.z)}`;
        if (b.key !== key) {
          b.key = key;
          /**
           * `a.y` is where the caller wants the ARROW to point, which main.js raises six metres so
           * the screen-edge arrow does not aim at somebody's feet. The beacon stands on the ground,
           * so it asks for the ground rather than trusting a number meant for something else.
           */
          b.ground = heightAt ? heightAt(a.x, a.z) : (Number.isFinite(a.y) ? a.y : 0);
          b.group.position.set(a.x, b.ground, a.z);
          if (a.color) b.mat.color.set(a.color);
        }
        b.group.visible = true;
      }
      return live;
    },

    /** One call for all six. A dozen trig calls and no allocation. */
    update(dt, camera) {
      t += dt;
      for (const b of pool) {
        if (!b.group.visible) continue;
        const d = camera ? camera.position.distanceTo(b.group.position) : 100;
        if (d > BEACON_RANGE) { b.group.visible = false; continue; }
        /**
         * THE SAME SIZE ON SCREEN, WHATEVER THE DISTANCE.
         *
         * 1x under 90 m and up to 6x past 540 m. Without this a beacon is a speck at exactly the
         * range you need it — you can see the cart at 40 m, so the beacon is for 400 m.
         */
        const k = Math.max(1, Math.min(6, d / 90));
        b.group.scale.setScalar(k);
        b.group.position.y = b.ground + 1.2 * k;
        b.group.rotation.y = t * 0.6;
        // the chevrons chase downward, a fifth of a cycle apart, and the ring pulses
        b.pose([0, 1, 2].map(i => 5 + i * 1.9 + Math.sin(t * 2.4 - i * 0.2) * 0.5), 1 + Math.sin(t * 2.0) * 0.12);
        b.mat.opacity = 0.28 + (Math.sin(t * 2.0) * 0.5 + 0.5) * 0.22;
      }
    },

    clear() { for (const b of pool) { b.group.visible = false; b.key = null; } live = 0; },
    dispose() {
      for (const b of pool) { scene.remove(b.group); b.mat.dispose(); b.mesh.geometry.dispose(); }
      pool.length = 0;
    },
  };
}
