// Farhold — the things a road event puts on the ground.
//
//   "I also found a marker that reads 'Somebody in a cage' but there was no person to speak about,
//    nothing to interact with. Just a dead pointer to nothing. We need to revamp all of these
//    events to be more expansive and detailed and most of all worthwhile."
//
// That marker was honest about what the event was: `js/encounters.js` says of itself that it "owns
// no meshes and no DOM", and a `rescue` was implemented as four idle guards standing in a field.
// There was no cage, nobody in it, and nothing to walk up to — the win condition was literally
// "the guard array became empty". A pillar of light over that is a promise the game could not keep.
//
// This is the missing half: a small, disposable set of props an event can put down for as long as
// it runs, and take away when it ends. It is deliberately NOT js/sites.js. A set piece there is
// permanent world furniture in an InstancedMesh with a fixed cap and a 180 m rebuild throttle; an
// event lives for four minutes, moves nothing, and there are at most three of them. So this uses
// plain meshes off the same `PIECES` geometry — a dozen draw calls at the very worst, against the
// complexity of teaching the instanced path to add and remove single entries.
//
//   const props = createEventProps(scene, terrain);
//   props.place('ev:the_cage_on_the_road', x, z, yaw, [{ piece: 'cage', dx: 0, dz: 0, scale: 1.3 }]);
//   props.clear('ev:the_cage_on_the_road');
//
// Geometry is built once per piece and shared; only the meshes are per-event. Collision is the
// caller's business — most event dressing is meant to be walked between, and a cage you cannot
// get near is a cage you cannot open.

import * as THREE from 'three';
import { PIECES } from './sites.js';

export function createEventProps(scene, terrain, { collide = null } = {}) {
  /** piece key -> geometry, built on first use. A run with no rescues builds no cage. */
  const geo = new Map();
  /** group id -> { meshes: [], solids: [] } */
  const groups = new Map();

  function geometryFor(piece) {
    if (!geo.has(piece)) {
      const def = PIECES[piece];
      if (!def) return null;
      geo.set(piece, def.build());
    }
    return geo.get(piece);
  }

  /**
   * Put a dressing down. `parts` are offsets from the event's own spot, so a layout reads the same
   * way a `data/setpieces.json` one does: a centre piece at 0,0 and the rest arranged round it.
   *
   * Returns the world positions it actually used, because the caller usually wants to stand
   * somebody at one of them — a captive belongs IN the cage, not three metres to the left of it.
   */
  function place(id, x, z, yaw = 0, parts = []) {
    clear(id);
    if (!parts.length) return [];
    const made = { meshes: [], solids: [] };
    const spots = [];
    for (const p of parts) {
      const g = geometryFor(p.piece);
      if (!g) continue;
      const sc = p.scale ?? 1;
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      const dx = p.dx || 0, dz = p.dz || 0;
      const wx = x + dx * cos - dz * sin;
      const wz = z + dx * sin + dz * cos;
      const [cx, cz] = terrain.clampToWorld ? terrain.clampToWorld(wx, wz) : [wx, wz];
      const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      mesh.position.set(cx, terrain.heightAt(cx, cz) + (p.y || 0), cz);
      mesh.rotation.y = yaw + (p.spin || 0);
      mesh.scale.setScalar(sc);
      scene.add(mesh);
      made.meshes.push(mesh);
      spots.push({ piece: p.piece, x: cx, z: cz, y: mesh.position.y, scale: sc });
      // Only what would be daft to walk through. `solid` on a cage is the post and the basket; a
      // bonepile and a waystone are ankle-height scenery and filing them would make a rescue an
      // obstacle course.
      const solid = p.solid === false ? null : PIECES[p.piece]?.solid;
      if (solid && collide) {
        collide.add(cx, cz, solid[0] * sc, solid[1] * sc);
        made.solids.push([cx, cz]);
      }
    }
    groups.set(id, made);
    return spots;
  }

  /**
   * Take it away again. The materials go with it; the shared geometry does not, because the next
   * cage on the next road wants exactly the same one.
   *
   * Note what this does NOT undo: a collider filed with `collide.add` cannot be removed — the
   * obstacle field has no delete. So anything that files one has to be something it is fine to
   * leave standing, and the honest answer for event dressing is to file none at all. The `collide`
   * option is here for a caller who knows better about a specific prop.
   */
  function clear(id) {
    const made = groups.get(id);
    if (!made) return;
    for (const m of made.meshes) { scene.remove(m); m.material.dispose(); }
    groups.delete(id);
  }

  function clearAll() { for (const id of [...groups.keys()]) clear(id); }

  return {
    place, clear, clearAll,
    has: id => groups.has(id),
    get count() { return groups.size; },
    dispose() {
      clearAll();
      for (const g of geo.values()) g.dispose();
      geo.clear();
    },
  };
}
