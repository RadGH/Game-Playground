// The Sanctum power-targeting overlay: while a power is being aimed, every field it may land in
// is tinted (green = allowed, red-dim = not), and a ring of the power's radius follows the cursor /
// pad reticle, green where the cast would be accepted and red where it would be refused.
//
//   const aim = createAimOverlay(scene);
//   aim.show({ fields: [{x0,x1,z0,z1, ok}], radius, color });  aim.move(x, z, ok);  aim.hide();

import * as THREE from 'three';

export function createAimOverlay(scene) {
  const root = new THREE.Group(); root.name = 'aim'; root.visible = false;
  scene.add(root);
  const plates = new THREE.Group(); root.add(plates);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7fe39a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const fillMat = new THREE.MeshBasicMaterial({ color: 0x7fe39a, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64), ringMat);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), fillMat);
  const cross = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.32, 16), ringMat);
  for (const m of [ring, fill, cross]) { m.rotation.x = -Math.PI / 2; m.renderOrder = 20; }
  ring.position.y = 0.09; fill.position.y = 0.08; cross.position.y = 0.1;
  const reticle = new THREE.Group(); reticle.add(fill, ring, cross); root.add(reticle);
  let t = 0;

  return {
    get active() { return root.visible; },
    show({ fields, radius = 4 }) {
      plates.clear();
      for (const f of fields) {
        const w = f.x1 - f.x0, d = f.z1 - f.z0;
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ color: f.ok ? 0x5fcf7a : 0xe0503e, transparent: true, opacity: f.ok ? 0.2 : 0.1, depthWrite: false }));
        m.rotation.x = -Math.PI / 2; m.position.set((f.x0 + f.x1) / 2, 0.07, (f.z0 + f.z1) / 2); m.renderOrder = 19;
        plates.add(m);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: f.ok ? 0x7fe39a : 0xa04030, transparent: true, opacity: f.ok ? 0.9 : 0.4 }));
        edge.rotation.x = -Math.PI / 2; edge.position.copy(m.position); edge.position.y = 0.08;
        plates.add(edge);
      }
      reticle.scale.set(radius, 1, radius);
      cross.scale.set(1 / radius, 1 / radius, 1);
      root.visible = true;
    },
    move(x, z, ok) {
      reticle.position.set(x, 0, z);
      const c = ok ? 0x7fe39a : 0xff6a5a;
      ringMat.color.setHex(c); fillMat.color.setHex(c);
    },
    update(dt) { if (!root.visible) return; t += dt; ringMat.opacity = 0.65 + Math.sin(t * 6) * 0.2; },
    hide() { root.visible = false; plates.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); plates.clear(); },
    dispose() { this.hide(); scene.remove(root); },
  };
}
