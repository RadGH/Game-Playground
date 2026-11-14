// A soft "studio in space" reflection map for the metal hulls: a dark sphere with a warm key panel (the sun's side),
// a cool fill panel and a faint floor glow, baked once through PMREM. Without it metal reads as black.

import * as THREE from 'three';

export function makeEnvironment(renderer, { key = '#fff1dc', fill = '#6f8cff', sky = '#1a2236' } = {}) {
  const scene = new THREE.Scene();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.MeshBasicMaterial({ color: sky, side: THREE.BackSide }));
  scene.add(sphere);
  const panel = (color, intensity, pos, size) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.copy(pos); m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(key, 6, new THREE.Vector3(5, 6, 4), 5);
  panel(fill, 2.2, new THREE.Vector3(-6, -2, -5), 6);
  panel('#ffffff', 1.4, new THREE.Vector3(0, 9, -2), 4);
  panel('#2a3550', 1, new THREE.Vector3(0, -9, 0), 9);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(scene, 0.03).texture;
  pm.dispose();
  return tex;
}
