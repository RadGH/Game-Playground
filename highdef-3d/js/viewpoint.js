// The viewpoint: what the controller walks and the cameras follow. Since 2026-10-21 (owner: "make the highdef-3d
// prototype just game world, no character") this replaces the CC0 rigged character that lived in character.js —
// nothing is drawn, so the page is the world alone. It keeps the character's shape (group, radius, eye height and
// the animation calls as no-ops) so controller.js, cameras.js and the walking/swimming/collision code are unchanged.
import * as THREE from 'three';

export function createViewpoint() {
  const group = new THREE.Group();
  group.name = 'viewpoint';
  const noop = () => {};
  return {
    group, mixers: [], clips: new Map(),
    setLocomotion: noop, setState: noop, playOnce: noop, update: noop,
    states: [], clipNames: [],
    /** Where the eyes are, for the over-the-shoulder camera. */
    eyeHeight: 1.62,
    height: 1.80,
    radius: 0.34,
    dispose: noop,
  };
}
