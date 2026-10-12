// Footprints on busy paths (PLAN §5.4): the server keeps, per zone and per hour, how often players stood
// in each 32 m cell (`zone.heat` = [[x, z, count]…], the 200 busiest). Each hot cell gets a scatter of
// faint boot prints on the ground — more for busier cells — so the well-trodden ways out of town read
// as paths other people walked. One instanced mesh, rebuilt when a `zone` message arrives.

import * as THREE from 'three';

const MAX = 2400;

/** Where the prints go: deterministic per cell, count by heat. Pure — exported for tests. */
export function footprintSpots(heat, { max = MAX, perCell = 14 } = {}) {
  const out = [];
  const top = Math.max(1, ...heat.map(h => h[2]));
  for (const [cx, cz, v] of heat) {
    const n = Math.max(1, Math.round(perCell * Math.sqrt(v / top)));
    let s = ((Math.round(cx) * 73856093) ^ (Math.round(cz) * 19349663)) >>> 0;
    const r = () => ((s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0) / 4294967296);
    const heading = r() * Math.PI * 2;
    for (let k = 0; k < n && out.length < max; k++) {
      // a short trail of left/right prints across the cell
      const along = (r() - 0.5) * 28, side = (k % 2 ? 0.18 : -0.18) + (r() - 0.5) * 6;
      out.push({ x: cx + Math.sin(heading) * along + Math.cos(heading) * side, z: cz + Math.cos(heading) * along - Math.sin(heading) * side, yaw: heading + (r() - 0.5) * 0.4, a: 0.25 + 0.5 * Math.sqrt(v / top) });
    }
  }
  return out;
}

function printTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = 'rgba(40,30,20,0.9)';
  g.beginPath(); g.ellipse(16, 22, 9, 15, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(16, 50, 7, 9, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFootprints(scene, { heightAt }) {
  const geo = new THREE.PlaneGeometry(0.2, 0.42); geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: printTexture(), transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.name = 'footprints';
  scene.add(mesh);
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let ground = heightAt;
  return {
    mesh,
    set(heat) {
      const spots = footprintSpots(heat || []);
      spots.forEach((p, i) => { _q.setFromAxisAngle(up, p.yaw); _s.setScalar(0.8 + p.a * 0.4); mesh.setMatrixAt(i, _m.compose(_p.set(p.x, ground(p.x, p.z) + 0.03, p.z), _q, _s)); });
      mesh.count = spots.length; mesh.instanceMatrix.needsUpdate = true;
      return spots.length;
    },
    setGround(f) { ground = f; },
    setVisible(v) { mesh.visible = v; },
  };
}
