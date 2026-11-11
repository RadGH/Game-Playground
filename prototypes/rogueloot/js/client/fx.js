// Things drawn on the ground and in the air: telegraphs (a monster's ability shown where it will land, filling up as
// the cast runs: walk out of it), projectiles in flight, and a status ring under you while slowed / stunned. Pooled meshes.
import * as THREE from 'three';

const TYPE_COLOR = { physical: '#e8e0c8', fire: '#ff8a2a', frost: '#9fe0ff', storm: '#c8d8ff', poison: '#8aff4a', shadow: '#b070ff', arrow: '#d8c090' };
export function createFx(view) {
  const scene = view.scene, teles = [], shots = new Map();
  const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
  function shapeGeo(e) {
    if (e.shape === 'circle') return new THREE.CircleGeometry(e.r, 36).rotateX(-Math.PI / 2);
    if (e.shape === 'ring') return new THREE.RingGeometry(e.r0, e.r, 40).rotateX(-Math.PI / 2);
    if (e.shape === 'cone') { const a = (e.ang || 60) * Math.PI / 180; return new THREE.CircleGeometry(e.len, 24, Math.PI / 2 - a / 2, a).rotateX(-Math.PI / 2); }
    const g = new THREE.PlaneGeometry(e.w || 1.6, e.len).rotateX(-Math.PI / 2).translate(0, 0, -e.len / 2);
    if (e.shape === 'cross') { const h = new THREE.PlaneGeometry(e.len * 2, e.w || 1.6).rotateX(-Math.PI / 2); const m = new THREE.Group(); m.add(new THREE.Mesh(g), new THREE.Mesh(h)); return m; }
    return g;
  }
  /** A telegraph event from the sim: { shape, x, z, r?, r0?, yaw?, len?, w?, ang?, t (seconds) }. */
  function tele(e, now) {
    const geo = shapeGeo(e), g = new THREE.Group();
    const edge = geo.isGroup ? geo : new THREE.Mesh(geo, mat('#ff3020', 0.28));
    if (geo.isGroup) geo.children.forEach(c => { c.material = mat('#ff3020', 0.28); });
    const fill = geo.isGroup ? null : new THREE.Mesh(geo, mat('#ff6a2a', 0.45));
    g.add(edge); if (fill) g.add(fill);
    g.position.set(e.x, (view.groundY ? view.groundY(e.x, e.z) : 0) + 0.06, e.z);
    if (e.shape !== 'circle' && e.shape !== 'ring') g.rotation.y = (e.yaw || 0) + Math.PI;
    scene.add(g);
    teles.push({ g, fill, born: now, life: (e.t || 1) * 1000, shape: e.shape });
  }
  function syncShots(list) {
    const seen = new Set();
    for (const s of list || []) {
      seen.add(s.id);
      let m = shots.get(s.id);
      if (!m) { m = new THREE.Mesh(new THREE.IcosahedronGeometry(s.ty === 'physical' ? 0.1 : 0.22, 0), new THREE.MeshBasicMaterial({ color: TYPE_COLOR[s.ty] || '#ffffff' })); scene.add(m); shots.set(s.id, m); m.position.set(s.x, 1.1, s.z); }
      m.userData.to = [s.x, s.z];
    }
    for (const [id, m] of shots) if (!seen.has(id)) { scene.remove(m); m.geometry.dispose(); shots.delete(id); }
  }
  function update(dt, now) {
    for (let i = teles.length - 1; i >= 0; i--) {
      const t = teles[i], k = (now - t.born) / t.life;
      if (k >= 1) { scene.remove(t.g); t.g.traverse(o => { o.geometry?.dispose?.(); o.material?.dispose?.(); }); teles.splice(i, 1); continue; }
      if (t.fill) { if (t.shape === 'circle' || t.shape === 'ring') t.fill.scale.setScalar(Math.max(0.01, k)); else t.fill.scale.set(1, 1, Math.max(0.01, k)); }
    }
    for (const m of shots.values()) { const [x, z] = m.userData.to; m.position.x += (x - m.position.x) * Math.min(1, dt * 14); m.position.z += (z - m.position.z) * Math.min(1, dt * 14); m.rotation.y += dt * 8; }
  }
  return { tele, syncShots, update, count: () => teles.length };
}
