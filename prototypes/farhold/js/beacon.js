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
const SHAFT = new THREE.CylinderGeometry(0.18, 0.5, 14, 6, 1, true);
const CHEVRON = new THREE.ConeGeometry(1.1, 1.6, 4);
const RING = new THREE.RingGeometry(1.6, 2.0, 24);

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

  const shaft = new THREE.Mesh(SHAFT, mat);
  shaft.position.y = 7;
  group.add(shaft);

  // three chevrons pointing DOWN, chasing each other toward the ground
  const chevrons = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(CHEVRON, mat);
    c.rotation.x = Math.PI;              // point down
    c.position.y = 5 + i * 1.9;
    group.add(c);
    chevrons.push(c);
  }

  const ring = new THREE.Mesh(RING, mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12;
  group.add(ring);

  return { group, mat, shaft, chevrons, ring, key: null, ground: 0 };
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
        // the chevrons chase downward, a fifth of a cycle apart
        for (let i = 0; i < b.chevrons.length; i++) {
          b.chevrons[i].position.y = 5 + i * 1.9 + Math.sin(t * 2.4 - i * 0.2) * 0.5;
        }
        const pulse = 1 + Math.sin(t * 2.0) * 0.12;
        b.ring.scale.set(pulse, pulse, 1);
        b.mat.opacity = 0.28 + (Math.sin(t * 2.0) * 0.5 + 0.5) * 0.22;
      }
    },

    clear() { for (const b of pool) { b.group.visible = false; b.key = null; } live = 0; },
    dispose() {
      for (const b of pool) { scene.remove(b.group); b.mat.dispose(); }
      pool.length = 0;
    },
  };
}
