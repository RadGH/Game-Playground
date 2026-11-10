// What Moon Work draws (js/game/moon-play.js uses it): the glowing samples at the sample sites (one instanced draw for
// all of them), the samples and crates riding on each rover (a small group parented to the rover's model), loose crates
// lying where they bounced out, the landing rings in the crater bowls (draped over the ground), tall beacons over the
// places that matter to you, the jump booster's flash and the Crater lamp's beam. No lights switched on and off (a
// light that comes and goes recompiles every material — docs: three.js shader-recompile stutter): the lamp's light is
// made once, only when the lamp is owned, and kept.
//
//   const fx = createMoonFx({ THREE, scene, world, enhance });
//   fx.rocks(list)                  list = [{ id, x, z, ready, rarity }] the glowing samples
//   fx.cargo(E, { samples: [rarity], crates }) what rides on rover E (called every frame for every rover)
//   fx.loose([{ id, x, z }])        crates lying on the regolith
//   fx.rings(ramps)                 once: a landing ring in every ramp's ring (crater bowl / past the practice kickers)
//   fx.beacons([{ x, z, color }])   up to 10 columns of light
//   fx.boost(E)                     the booster's puff under rover E
//   fx.lamp(E | null, on)           the Crater lamp's beam (and its light, made the first time) on rover E
//   fx.update(camera, dt) · fx.draws() · fx.dispose()

const RARE_COL = '#ffcf4a', COMMON_COL = '#8ff4ff', UNCOMMON_COL = '#b5a0ff';
export const RARITY_COLOR = Object.freeze({ common: COMMON_COL, uncommon: UNCOMMON_COL, rare: RARE_COL });

export function createMoonFx({ THREE, scene, world, enhance = m => m, quality = 'medium' }) {
  const root = new THREE.Group(); root.name = 'moon-fx'; scene.add(root);
  const ground = (x, z) => world.heightAt(x, z);
  const disposables = [];
  const keep = o => { disposables.push(o); return o; };

  // ---- the glowing samples: a rock + a soft halo, instanced
  const rockGeo = keep(new THREE.IcosahedronGeometry(0.36, 0));
  const rockMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  const haloGeo = keep(new THREE.CircleGeometry(1.5, 20).rotateX(-Math.PI / 2));
  const haloMat = keep(new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  let rockMesh = null, haloMesh = null, rockList = [];
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3(), col = new THREE.Color();
  function rocks(list) {
    rockList = list;
    if (!rockMesh || rockMesh.count < list.length) {
      rockMesh?.removeFromParent(); haloMesh?.removeFromParent();
      rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, Math.max(1, list.length)); rockMesh.frustumCulled = false; keep(rockMesh);
      haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, Math.max(1, list.length)); haloMesh.frustumCulled = false; haloMesh.renderOrder = 3; keep(haloMesh);
      root.add(rockMesh, haloMesh);
    }
    list.forEach((r, i) => {
      const y = ground(r.x, r.z);
      q4.setFromEuler(new THREE.Euler(r.id * 0.7, r.id * 1.3, 0));
      s4.setScalar(r.ready ? 1 : 0.0001);
      p4.set(r.x, y + 0.32, r.z); m4.compose(p4, q4, s4); rockMesh.setMatrixAt(i, m4);
      q4.identity(); p4.set(r.x, y + 0.06, r.z); m4.compose(p4, q4, s4); haloMesh.setMatrixAt(i, m4);
      col.set(RARITY_COLOR[r.rarity] || COMMON_COL); rockMesh.setColorAt(i, col); haloMesh.setColorAt(i, col);
    });
    rockMesh.count = haloMesh.count = list.length;
    rockMesh.instanceMatrix.needsUpdate = haloMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
  }

  // ---- what rides on a rover: samples in the bin behind the seats, crates on the rack over the back wheels
  const binRockGeo = keep(new THREE.IcosahedronGeometry(0.15, 0));
  const binMats = Object.fromEntries(Object.entries(RARITY_COLOR).map(([k, c]) => [k, keep(new THREE.MeshBasicMaterial({ color: c }))]));
  const crateGeo = keep(new THREE.BoxGeometry(0.5, 0.42, 0.5));
  const crateMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#d8d2c4' })));
  const bandMat = keep(new THREE.MeshBasicMaterial({ color: '#ff9a2e' }));
  const bandGeo = keep(new THREE.BoxGeometry(0.52, 0.08, 0.52));
  const iceMat = keep(enhance(new THREE.MeshLambertMaterial({ color: '#b8dcff' })));
  const carried = new Map();          // ent id -> { g, rocks: [], crates: [] }
  function cargo(E, { samples = [], crates = 0, cargo: kind = null } = {}) {
    if (!E?.model?.group) return;
    let c = carried.get(E.id);
    if (!c) { c = { g: new THREE.Group(), rocks: [], crates: [], E }; c.g.name = 'moon-cargo'; carried.set(E.id, c); }
    if (c.g.parent !== E.model.group) E.model.group.add(c.g);
    while (c.rocks.length < samples.length) { const m = new THREE.Mesh(binRockGeo, binMats.common); c.g.add(m); c.rocks.push(m); }
    c.rocks.forEach((m, i) => {
      m.visible = i < samples.length;
      if (!m.visible) return;
      m.material = binMats[samples[i]] || binMats.common;
      // two rows of three on the bin's lid (the rack box behind the seats: middle z -1.15, top 0.82)
      const row = Math.floor(i / 3) % 2, k = i % 3;
      m.position.set(-0.36 + k * 0.36, 0.92 + Math.floor(i / 6) * 0.2, -1.0 - row * 0.3);
      m.rotation.set(i * 0.9, i * 1.7, 0);
    });
    while (c.crates.length < crates) {
      const g = new THREE.Group(); const b = new THREE.Mesh(crateGeo, crateMat); const band = new THREE.Mesh(bandGeo, bandMat);
      g.add(b, band); c.g.add(g); c.crates.push(g);
    }
    c.crates.forEach((g, i) => {
      g.visible = i < crates;
      if (!g.visible) return;
      g.children[0].material = kind === 'ice cores' ? iceMat : crateMat;
      // on the front deck between the front wheels (the rack behind the seats holds the sample bin): two side by side,
      // the third strapped on top
      g.position.set(i === 0 ? 0.3 : i === 1 ? -0.04 : 0.13, 0.26 + 0.21 + (i === 2 ? 0.42 : 0), 1.2);
    });
  }
  function forget(id) { const c = carried.get(id); if (c) { c.g.removeFromParent(); carried.delete(id); } }

  // ---- crates lying where they bounced out (a glow ring so you can find them)
  const looseGeo = keep(new THREE.BoxGeometry(0.62, 0.52, 0.62));
  const loosePool = [];
  function loose(list) {
    while (loosePool.length < list.length) {
      const g = new THREE.Group(); g.add(new THREE.Mesh(looseGeo, crateMat), new THREE.Mesh(bandGeo, bandMat));
      g.children[1].scale.setScalar(1.22);
      const h = new THREE.Mesh(haloGeo, keep(new THREE.MeshBasicMaterial({ color: '#ff9a2e', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending })));
      h.position.y = -0.2; h.renderOrder = 3; g.add(h);
      root.add(g); loosePool.push(g);
    }
    loosePool.forEach((g, i) => {
      const c = list[i]; g.visible = !!c; if (!c) return;
      g.position.set(c.x, ground(c.x, c.z) + 0.26, c.z); g.rotation.set(0.12, c.id * 2.1, 0.08);
    });
  }

  // ---- landing rings: a ribbon draped on the ground, one mesh per ring (6 of them)
  const ringMat = keep(new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
  const ringMats = [];
  function rings(ramps) {
    for (const r of ramps) {
      const R = r.ring.r, w = 0.7, N = 56, pos = [], idx = [];
      for (let i = 0; i <= N; i++) {
        const a = i / N * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
        for (const rr of [R - w, R + w]) { const x = r.ring.x + c * rr, z = r.ring.z + s * rr; pos.push(x, ground(x, z) + 0.12, z); }
        if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = keep(new THREE.BufferGeometry()); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const mat = r.crater ? ringMat : keep(ringMat.clone()); if (!r.crater) { mat.color.set('#7fe8ff'); mat.opacity = 0.55; }
      const m = new THREE.Mesh(g, mat); m.renderOrder = 2; m.frustumCulled = false; root.add(m); ringMats.push(mat);
      // a centre dot
      const dot = new THREE.Mesh(haloGeo, mat); dot.scale.setScalar(0.7); dot.position.set(r.ring.x, ground(r.ring.x, r.ring.z) + 0.1, r.ring.z); root.add(dot);
    }
  }

  // ---- beacons
  const beamGeo = keep(new THREE.CylinderGeometry(0.8, 0.8, 120, 10, 1, true));
  const beams = [];
  function beacons(list) {
    for (let i = 0; i < Math.max(list.length, beams.length) && i < 10; i++) {
      let b = beams[i];
      if (!b && list[i]) { b = new THREE.Mesh(beamGeo, keep(new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }))); b.renderOrder = 4; root.add(b); beams.push(b); }
      if (!b) continue;
      const it = list[i]; b.visible = !!it; if (!it) continue;
      b.material.color.set(it.color || '#ffd84a');
      b.position.set(it.x, ground(it.x, it.z) + 60, it.z);
    }
  }

  // ---- the booster's puff: a short cone of light under the rover's tail
  const puffGeo = keep(new THREE.ConeGeometry(0.5, 1.8, 10, 1, true).rotateX(Math.PI));
  const puffMat = keep(new THREE.MeshBasicMaterial({ color: '#9fd8ff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  const puffs = [];
  function boost(E) {
    if (!E?.model?.group) return;
    for (const sx of [-0.5, 0.5]) { const m = new THREE.Mesh(puffGeo, puffMat.clone()); m.position.set(sx, -0.35, -1.5); E.model.group.add(m); puffs.push({ m, age: 0 }); }
  }

  // ---- the Crater lamp: a beam cone (always) + one SpotLight made the first time it is needed (kept after that)
  const beamMat = keep(new THREE.MeshBasicMaterial({ color: '#fff4d8', transparent: true, opacity: 0.09, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const coneGeo = keep(new THREE.ConeGeometry(4.2, 22, 18, 1, true).translate(0, -11, 0).rotateX(-Math.PI / 2 - 0.12));
  const lampHead = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.2, 0.22, 10).rotateX(Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ color: '#fff8e0' })));
  const cone = new THREE.Mesh(coneGeo, beamMat); cone.renderOrder = 5;
  let spot = null, lampOn = null;
  function lamp(E, on) {
    if (!E?.model?.group || !on) { lampHead.removeFromParent(); cone.removeFromParent(); if (spot) spot.intensity = 0; lampOn = null; return; }
    if (lampOn !== E.id) {
      lampHead.position.set(0, 1.35, 0.95); cone.position.set(0, 1.35, 1.0);
      E.model.group.add(lampHead, cone);
      if (!spot && quality !== 'low' && quality !== 'simple') {
        spot = new THREE.SpotLight('#fff1d6', 0, 70, 0.42, 0.45, 1.2); spot.castShadow = false;
        spot.target.position.set(0, -2, 20); scene.add(spot.target);
      }
      if (spot) { spot.position.set(0, 1.35, 1.0); E.model.group.add(spot); spot.target.removeFromParent(); E.model.group.add(spot.target); }
      lampOn = E.id;
    }
    if (spot) spot.intensity = 60;
  }

  function update(camera, dt) {
    const t = performance.now() / 1000;
    if (haloMesh) haloMat.opacity = 0.25 + Math.sin(t * 3) * 0.12;
    for (const m of ringMats) m.opacity = (m.color.getHex() === 0xffb347 ? 0.6 : 0.42) + Math.sin(t * 2) * 0.15;
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.age += dt; p.m.scale.setScalar(1 + p.age * 3); p.m.material.opacity = Math.max(0, 0.85 - p.age * 1.6);
      if (p.age > 0.55) { p.m.removeFromParent(); p.m.material.dispose(); puffs.splice(i, 1); }
    }
    for (const [id, c] of carried) if (!c.E.model?.group?.parent) forget(id);
  }
  const draws = () => { let n = 0; root.traverseVisible(o => { if (o.isMesh || o.isPoints || o.isLine || o.isSprite) n++; }); for (const c of carried.values()) c.g.traverseVisible(o => { if (o.isMesh) n++; }); return n; };
  function dispose() { root.removeFromParent(); for (const c of carried.values()) c.g.removeFromParent(); lampHead.removeFromParent(); cone.removeFromParent(); if (spot) { spot.removeFromParent(); spot.target.removeFromParent(); } for (const d of disposables) d.dispose?.(); }
  return { rocks, cargo, forget, loose, rings, beacons, boost, lamp, update, draws, dispose, root, get rockList() { return rockList; }, get spot() { return spot; } };
}
