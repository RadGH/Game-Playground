// Your loot on the ground (only yours: personal loot) and the chests. Items show a name plate in their rarity colour
// (click / tap it, or press Space near it, to pick it up); magic and better also stand in a beam of light so a good
// drop is seen from across a field (ruling 38: every good drop is an event). Chests: click to open (once each).
import * as THREE from 'three';

const BEAM = { magic: '#4a8aff', rare: '#ffd040', unique: '#ff9a3a', legendary: '#ff4a1a' };
export function createGround(view, labelRoot, { onPick, onOpen }) {
  const items = new Map(), chests = new Map();
  const v = new THREE.Vector3();
  const beamGeo = new THREE.CylinderGeometry(0.18, 0.32, 6, 8, 1, true).translate(0, 3, 0);
  const sackGeo = new THREE.IcosahedronGeometry(0.22, 0), coinGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.06, 10);
  const flat = c => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  function add(e) {
    if (items.has(e.gid)) return;
    const g = new THREE.Group(); g.position.set(e.x, view.groundY ? view.groundY(e.x, e.z) : 0, e.z);
    if (e.what === 'gold') { for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(coinGeo, flat('#ffcc33')); c.position.set((i - 1) * 0.12, 0.04 + i * 0.03, (i % 2) * 0.1); g.add(c); } }
    else if (e.what === 'potion') { const m = new THREE.Mesh(sackGeo, flat(e.b === 'mana' ? '#3a6aff' : '#e2382c')); m.position.y = 0.22; g.add(m); }
    else { const m = new THREE.Mesh(sackGeo, flat('#8a6a3a')); m.position.y = 0.2; m.scale.set(1.2, 0.8, 1.2); g.add(m); }
    const beam = BEAM[e.real];
    if (beam) { const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: beam, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })); g.add(b); g.userData.beam = b; }
    view.scene.add(g);
    const tag = document.createElement('button'); tag.className = 'loot-tag lt-' + (e.r || e.what); tag.textContent = e.name;
    tag.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); onPick(e.gid, e.x, e.z); });
    labelRoot.append(tag);
    items.set(e.gid, { ...e, g, tag });
  }
  function remove(gid) { const it = items.get(gid); if (!it) return; view.scene.remove(it.g); it.tag.remove(); items.delete(gid); }
  function syncChests(list, me) {
    const seen = new Set();
    for (const c of list || []) {
      seen.add(c.id);
      let o = chests.get(c.id);
      if (!o) {
        const g = new THREE.Group(), wood = flat(c.tier === 'lockedChest' ? '#6a3a1a' : c.tier === 'crate' ? '#a07a48' : '#8a5a2a'), band = flat('#c8a040');
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.6).translate(0, 0.25, 0), wood); box.castShadow = true; g.add(box);
        const lid = new THREE.Group(); lid.position.set(0, 0.5, -0.3); const lm = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.62).translate(0, 0.09, 0.31), wood); lid.add(lm); g.add(lid);
        if (c.tier !== 'crate') { const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.08, 0.64).translate(0, 0.3, 0), band); g.add(b1); }
        g.position.set(c.x, view.groundY ? view.groundY(c.x, c.z) : 0, c.z); view.scene.add(g);
        const tag = document.createElement('button'); tag.className = 'loot-tag chest-tag'; tag.textContent = c.tier === 'lockedChest' ? 'Locked chest' : c.tier === 'crate' ? 'Crate' : 'Chest';
        tag.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); onOpen(c.id, c.x, c.z); });
        labelRoot.append(tag);
        o = { ...c, g, lid, tag }; chests.set(c.id, o);
      }
      o.open = !!c.by?.includes(me);
    }
    for (const [id, o] of chests) if (!seen.has(id)) { view.scene.remove(o.g); o.tag.remove(); chests.delete(id); }
  }
  function update(dt, now) {
    const W = view.renderer.domElement.clientWidth, H = view.renderer.domElement.clientHeight;
    const place = (el, x, y, z) => { v.set(x, y, z).project(view.camera); const sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H; el.hidden = v.z > 1 || sx < -50 || sx > W + 50 || sy < -20 || sy > H + 20; el.style.transform = `translate(-50%, -100%) translate(${sx}px, ${sy}px)`; };
    for (const it of items.values()) { place(it.tag, it.x, 0.7, it.z); if (it.g.userData.beam) it.g.userData.beam.material.opacity = 0.22 + Math.sin(now / 300 + it.x) * 0.08; it.g.rotation.y += dt * 0.6; }
    for (const c of chests.values()) { c.lid.rotation.x += ((c.open ? -1.9 : 0) - c.lid.rotation.x) * Math.min(1, dt * 6); c.tag.hidden = c.open; if (!c.open) place(c.tag, c.x, 1.1, c.z); }
  }
  /** Your nearest thing within reach: { kind: 'item'|'chest', id } */
  function nearest(x, z, reach = 3.2) {
    let best = null, bd = reach;
    for (const it of items.values()) { const d = Math.hypot(it.x - x, it.z - z); if (d < bd && it.what !== 'gold') { bd = d; best = { kind: 'item', id: it.gid, x: it.x, z: it.z }; } }
    for (const c of chests.values()) { if (c.open) continue; const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = { kind: 'chest', id: c.id, x: c.x, z: c.z }; } }
    return best;
  }
  function clear() { for (const id of [...items.keys()]) remove(id); for (const [id, o] of chests) { view.scene.remove(o.g); o.tag.remove(); chests.delete(id); } }
  return { add, remove, syncChests, update, nearest, clear, items, chests };
}
