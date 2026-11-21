// Things on the road from G.props: breakable crates, food (bread, apple, roast, pie), gold bags and ground weapons. Each
// kind is built once and pooled; pickups bob and glint so they read against the street.
import * as THREE from 'three';
import { groundWeaponMesh } from './fx.js';
import { blobTex, mergeGroup } from './kit.js';

const toon = c => new THREE.MeshToonMaterial({ color: c });
function crateMesh() {
  const g = new THREE.Group();
  const wood = toon('#a0703e'), dark = toon('#6a4624'), iron = toon('#4a4a50');
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), wood); box.position.y = 0.4; g.add(box);
  for (const y of [0.08, 0.72]) for (const z of [-0.41, 0.41]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.1, 0.03), dark); b.position.set(0, y, z); g.add(b); }
  for (const x of [-0.41, 0.41]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.84), dark); b.position.set(x, 0.72, 0); g.add(b); }
  const diag = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.09, 0.03), dark); diag.position.set(0, 0.4, 0.415); diag.rotation.z = 0.78; g.add(diag);
  for (const x of [-0.36, 0.36]) for (const y of [0.08, 0.72]) { const n = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.04), iron); n.position.set(x, y, 0.43); g.add(n); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
function foodMesh(kind) {
  const g = new THREE.Group();
  const add = (geo, c, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(geo, toon(c)); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.castShadow = true; g.add(o); return o; };
  add(new THREE.CylinderGeometry(0.34, 0.3, 0.05, 14), '#e8e0d0', 0, 0.03, 0);      // a plate so food never reads as rubbish
  if (kind === 'bread') { add(new THREE.SphereGeometry(0.22, 10, 8), '#d8a050', 0, 0.16, 0, 1.4, 0.7, 0.9); for (const x of [-0.12, 0, 0.12]) add(new THREE.BoxGeometry(0.03, 0.02, 0.2), '#a86a2a', x, 0.29, 0); }
  else if (kind === 'apple') { add(new THREE.SphereGeometry(0.16, 12, 10), '#d83a2a', -0.08, 0.2, 0); add(new THREE.SphereGeometry(0.14, 12, 10), '#9ac83a', 0.13, 0.18, 0.05); add(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 4), '#5a3a1a', -0.08, 0.38, 0); }
  else if (kind === 'roast') {
    // A HAM ON THE BONE (owner #106: "the bone is angled and not connected to the meat and tip of the bone properly").
    // Everything is laid along ONE axis `d` (out to the right and a little up): the round of meat, the narrower shank it
    // tapers into, the bone shaft coming out of the shank's end, and the bone's knuckle — two round knobs side by side —
    // capping the shaft's tip.
    const d = new THREE.Vector3(1, 0.32, 0).normalize(), c0 = new THREE.Vector3(-0.08, 0.19, 0);
    const at = k => c0.clone().addScaledVector(d, k);
    const along = o => { o.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d); return o; };
    along(add(new THREE.SphereGeometry(0.17, 14, 10), '#a8542a', c0.x, c0.y, c0.z, 1.25, 0.95, 1));         // the round
    const sh = at(0.2); along(add(new THREE.SphereGeometry(0.1, 12, 8), '#9a4a24', sh.x, sh.y, sh.z, 1.4, 0.9, 0.95));   // the shank
    const glaze = at(-0.02); along(add(new THREE.SphereGeometry(0.12, 10, 8), '#c06a34', glaze.x, glaze.y + 0.07, glaze.z, 1.3, 0.5, 0.85));   // crisp top
    const b0 = at(0.27), b1 = at(0.42), mid = b0.clone().add(b1).multiplyScalar(0.5);
    const shaft = add(new THREE.CylinderGeometry(0.028, 0.034, b0.distanceTo(b1), 8), '#f0e8d8', mid.x, mid.y, mid.z);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    for (const s of [-1, 1]) { const k = at(0.44); add(new THREE.SphereGeometry(0.042, 10, 8), '#f4ecdc', k.x, k.y, k.z + s * 0.032); }
  }
  else { add(new THREE.CylinderGeometry(0.26, 0.24, 0.14, 14), '#d89a50', 0, 0.12, 0); add(new THREE.CylinderGeometry(0.22, 0.24, 0.02, 14), '#8a2a3a', 0, 0.2, 0); for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.44, 0.02, 0.04), '#e8b060', 0, 0.215, -0.15 + i * 0.1); }
  return g;
}
function goldMesh() {
  const g = new THREE.Group();
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), toon('#8a6a3a')); bag.scale.set(1, 0.9, 1); bag.position.y = 0.2; g.add(bag);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.1, 8), toon('#6a4a2a')); neck.position.y = 0.4; g.add(neck);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 4, 10), toon('#d8b050')); tie.rotation.x = Math.PI / 2; tie.position.y = 0.38; g.add(tie);
  const coin = new THREE.MeshToonMaterial({ color: '#f2c43a', emissive: '#6a4a00', emissiveIntensity: 0.4 });
  for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.02, 10), coin); c.position.set(0.18 + (i % 3) * 0.08, 0.02 + Math.floor(i / 3) * 0.022, (i % 2) * 0.1 - 0.05); g.add(c); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function createProps({ scene, data, quality = 'high', fx }) {
  const root = new THREE.Group(); root.name = 'props'; scene.add(root);
  const live = new Map(), pools = new Map();
  const shadowMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
  const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const keyOf = p => p.type === 'food' ? 'food:' + p.kind : p.type === 'weapon' ? 'weapon:' + p.pickup : p.type;
  function make(p) {
    const g = new THREE.Group();
    let m;
    if (p.type === 'crate') m = crateMesh();
    else if (p.type === 'food') m = foodMesh(p.kind);
    else if (p.type === 'gold') m = goldMesh();
    else { m = new THREE.Group(); const w = groundWeaponMesh(p.pickup, data.chapters.pickups[p.pickup]?.color); w.position.y = 0.12; m.add(w); }
    const inner = new THREE.Group(); inner.add(mergeGroup(m)); g.add(inner); g.userData.inner = inner;
    const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.scale.set(p.type === 'crate' ? 1.3 : 0.9, 1, p.type === 'crate' ? 1.0 : 0.6); sh.position.y = 0.02; g.add(sh);
    root.add(g); return g;
  }
  return {
    root,
    sync(G, dt) {
      const seen = new Set(), t = G.t;
      for (const p of G.props) {
        if (p.broken || p.taken) continue;
        seen.add(p.id);
        let v = live.get(p.id);
        if (!v) {
          const k = keyOf(p), list = pools.get(k) || [];
          const o = list.pop() || make(p); o.visible = true; o.userData.key = k;
          v = { o, born: t, glintT: Math.random() }; live.set(p.id, v);
        }
        v.o.position.set(p.x, 0, p.z);
        const inner = v.o.userData.inner;
        if (p.type !== 'crate') {
          const age = t - v.born, pop = Math.min(1, age * 4);
          inner.position.y = (p.type === 'weapon' ? 0.05 : 0.05) + Math.abs(Math.sin(t * 2.4 + p.id)) * 0.08 + (1 - pop) * 0.6;
          inner.rotation.y = p.type === 'weapon' ? 0.5 + Math.sin(t * 1.3 + p.id) * 0.3 : t * 0.8 + p.id;
          v.glintT -= dt;
          if (v.glintT <= 0 && fx) { v.glintT = 0.7 + Math.random() * 0.6; fx.flash(p.x + (Math.random() - 0.5) * 0.4, 0.45, p.z + 0.2, p.type === 'food' ? '#fff0d0' : '#fff6c0', 0.6, 0.25); }
        }
      }
      for (const [id, v] of live) if (!seen.has(id)) {
        live.delete(id); v.o.visible = false;
        const list = pools.get(v.o.userData.key) || []; pools.set(v.o.userData.key, list); list.push(v.o);
      }
    },
    clear() { for (const [id, v] of live) { v.o.visible = false; const list = pools.get(v.o.userData.key) || []; pools.set(v.o.userData.key, list); list.push(v.o); } live.clear(); },
    setVisible(on) { root.visible = on; },
  };
}
