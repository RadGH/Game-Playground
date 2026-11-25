// Contact shade (environment round 2026-11-24, "buildings float"): a soft dark ring where every building, prop, shrine,
// chest and camp piece meets the ground — the shade a wall or a barrel throws on the earth right at its foot, which the
// sun's shadow map is too coarse to draw. One instanced draw for the whole world; each disc lies on the slope under it
// (tilted to the ground's normal) a few centimetres up, drawn before the things that stand on it.
//
//   addContactShade(view, { T, placements, tileGroup? }) → { mesh, count }
import * as THREE from 'three';

function shadeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(0,0,0,0.62)'); r.addColorStop(0.45, 'rgba(0,0,0,0.42)'); r.addColorStop(0.78, 'rgba(0,0,0,0.12)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Every grounded thing as [x, z, radius]. Buildings get a wide ring; small props a tight one. */
export function contactSpots(placements) {
  const out = [];
  for (const b of placements.buildings || []) out.push([b.at[0], b.at[1], (b.footprint || 6) * 0.66, 0.85]);
  for (const p of placements.props || []) if (!/road-marker|banner|lamp-post|signpost/.test(p.art)) out.push([p.at[0], p.at[1], (p.r || 0.8) * 1.5 + 0.3, 1]);
  for (const k of ['shrines', 'chests', 'objects']) for (const p of placements[k] || []) out.push([p.at[0], p.at[1], k === 'shrines' ? 2.6 : 1.1, 0.9]);
  return out;
}

export function addContactShade(view, { T, placements }) {
  const spots = contactSpots(placements);
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: shadeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  spots.forEach(([x, z, r], i) => {
    const e = 0.8, hx = T.heightAt(x + e, z) - T.heightAt(x - e, z), hz = T.heightAt(x, z + e) - T.heightAt(x, z - e);
    n.set(-hx, 2 * e, -hz).normalize();
    q.setFromUnitVectors(up, n);
    s.set(r, 1, r); p.set(x, T.heightAt(x, z) + 0.04, z);
    m4.compose(p, q, s); mesh.setMatrixAt(i, m4);
  });
  mesh.renderOrder = -1; mesh.frustumCulled = false; mesh.name = 'contact shade';
  mesh.receiveShadow = false; mesh.castShadow = false;
  view.scene.add(mesh);
  return { mesh, count: spots.length };
}
