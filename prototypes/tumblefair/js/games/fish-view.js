// FISH VIEW KIT — the 3D bits every Tumblefair fishing game draws the same way: a cartoon fish (or boot / kettle /
// weed) for any species in js/games/fish-species.js, a bobber, a rod held in a character's hand with a tip you can
// hang a line from, and a sagging fishing line. Browser only (needs THREE); the rules never import it.
//
//   const K = fishViewKit(THREE, group)
//   K.fish(id, { glow })      -> THREE.Group facing +z, about the species' length; .userData.tail wiggles in K.swim()
//   K.swim(fishGroup, t)      tail wiggle
//   K.bobber(color)           -> THREE.Group (red/white float)
//   K.rod(actor, color)       -> { tip: Object3D } attached to the actor's right hand (or its body if it has no hand)
//   K.line()                  -> { set(a: Vector3, b: Vector3, sag), show(on) } a 14-point line drawn in `group`
//   K.dispose()               frees everything it made
import { BY_ID } from './fish-species.js';

export function fishViewKit(THREE, group) {
  const owned = [], keep = x => { owned.push(x); return x; };
  const std = (color, extra = {}) => keep(new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra }));
  const body = keep(new THREE.SphereGeometry(0.5, 14, 10)), tail = keep(new THREE.ConeGeometry(0.32, 0.45, 4).rotateX(-Math.PI / 2).translate(0, 0, -0.2));
  const fin = keep(new THREE.ConeGeometry(0.14, 0.3, 3)), eye = keep(new THREE.SphereGeometry(0.075, 8, 6)), pupil = keep(new THREE.SphereGeometry(0.04, 6, 4));
  const white = std('#ffffff'), black = std('#1b1f2a');
  const bootGeo = keep(new THREE.BoxGeometry(0.34, 0.5, 0.3)), toeGeo = keep(new THREE.BoxGeometry(0.34, 0.2, 0.36));
  const kettleGeo = keep(new THREE.SphereGeometry(0.3, 12, 8)), spoutGeo = keep(new THREE.CylinderGeometry(0.04, 0.07, 0.3, 6)), weedGeo = keep(new THREE.ConeGeometry(0.06, 0.6, 4));
  const matCache = new Map();
  const matOf = (c, glow) => { const k = c + (glow || ''); if (!matCache.has(k)) matCache.set(k, std(c, glow ? { emissive: glow, emissiveIntensity: 0.55 } : {})); return matCache.get(k); };

  function fish(id, { glow = false } = {}) {
    const sp = BY_ID[id] || BY_ID.tiddler, g = new THREE.Group(), L = sp.size;
    if (sp.junk) {
      const m = matOf(sp.color);
      if (id === 'soggy-boot') { const a = new THREE.Mesh(bootGeo, m); a.position.y = 0.15; const b = new THREE.Mesh(toeGeo, m); b.position.set(0, -0.05, 0.2); g.add(a, b); }
      else if (id === 'rusty-kettle') { const a = new THREE.Mesh(kettleGeo, m); a.scale.y = 0.85; const s = new THREE.Mesh(spoutGeo, m); s.position.set(0, 0.05, 0.3); s.rotation.x = 1; g.add(a, s); }
      else for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(weedGeo, matOf(sp.color)); w.position.set((i - 2) * 0.08, 0, 0); w.rotation.z = (i - 2) * 0.35; g.add(w); }
      g.scale.setScalar(L / 0.5); g.userData.junk = true; return g;
    }
    const m = matOf(sp.color, glow && sp.glow), bm = matOf(sp.belly, glow && sp.glow);
    const b = new THREE.Mesh(body, m); b.scale.set(0.5, 0.62, 1); b.castShadow = true; g.add(b);
    const belly = new THREE.Mesh(body, bm); belly.scale.set(0.42, 0.42, 0.85); belly.position.y = -0.1; g.add(belly);
    const tw = new THREE.Group(); tw.position.z = -0.42; const t = new THREE.Mesh(tail, m); t.scale.set(0.35, 1, 1); tw.add(t); g.add(tw);
    const top = new THREE.Mesh(fin, m); top.position.set(0, 0.32, -0.05); top.rotation.x = -0.5; g.add(top);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(eye, white); e.position.set(0.2 * s, 0.1, 0.3); const p = new THREE.Mesh(pupil, black); p.position.set(0.24 * s, 0.11, 0.34); g.add(e, p); }
    if (id === 'whiskerjack') for (const s of [-1, 1]) { const w = new THREE.Mesh(weedGeo, black); w.scale.set(0.3, 0.7, 0.3); w.position.set(0.12 * s, -0.05, 0.5); w.rotation.set(1.2, 0, s * 0.6); g.add(w); }
    if (id === 'ribbon-eel' || id === 'icicle-pike') b.scale.set(0.32, 0.4, 1.2);
    if (id === 'snowball-puffer') b.scale.set(0.62, 0.62, 0.7);
    g.scale.setScalar(L); g.userData.tail = tw; return g;
  }
  const swim = (g, t, rate = 9) => { if (g.userData.tail) g.userData.tail.rotation.y = Math.sin(t * rate) * 0.45; };
  const bobGeo = keep(new THREE.SphereGeometry(0.13, 12, 8)), capGeo = keep(new THREE.SphereGeometry(0.13, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2)), stickGeo = keep(new THREE.CylinderGeometry(0.015, 0.015, 0.18, 5));
  function bobber(color = '#ff4d4d') {
    const g = new THREE.Group(), w = new THREE.Mesh(bobGeo, white); g.add(w);
    const c = new THREE.Mesh(capGeo, std(color)); g.add(c); const s = new THREE.Mesh(stickGeo, white); s.position.y = 0.18; g.add(s);
    return g;
  }
  const rodGeo = keep(new THREE.CylinderGeometry(0.012, 0.025, 1.5, 6).translate(0, 0.75, 0)), reelGeo = keep(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).rotateZ(Math.PI / 2));
  function rod(actor, color = '#ffd23f') {
    if (!actor) return null;
    const g = new THREE.Group(); g.add(new THREE.Mesh(rodGeo, std('#8a5a2b')));
    const r = new THREE.Mesh(reelGeo, std(color)); r.position.set(0.05, 0.2, 0); g.add(r);
    const tip = new THREE.Object3D(); tip.position.y = 1.5; g.add(tip);
    const hand = actor.body?.parts?.handR;
    if (hand) { g.rotation.x = 1.15; hand.add(g); } else { g.position.set(0.25, 0.55, 0.2); g.rotation.x = 0.9; actor.body.group.add(g); }
    return { g, tip };
  }
  const lineMat = keep(new THREE.LineBasicMaterial({ color: '#f4f8ff', transparent: true, opacity: 0.85 }));
  function line() {
    const N = 14, pos = new Float32Array(N * 3), geo = keep(new THREE.BufferGeometry()); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = new THREE.Line(geo, lineMat); obj.frustumCulled = false; obj.visible = false; group.add(obj);
    return {
      obj,
      set(a, b, sag = 0.4) { for (let i = 0; i < N; i++) { const k = i / (N - 1); pos[i * 3] = a.x + (b.x - a.x) * k; pos[i * 3 + 1] = a.y + (b.y - a.y) * k - sag * 4 * k * (1 - k); pos[i * 3 + 2] = a.z + (b.z - a.z) * k; } geo.attributes.position.needsUpdate = true; obj.visible = true; },
      show(on) { obj.visible = !!on; },
    };
  }
  const v = new THREE.Vector3();
  /** World point of a rod tip, in `group`'s space. */
  const tipPos = (r, out = new THREE.Vector3()) => { if (!r) return null; r.tip.getWorldPosition(v); return group.worldToLocal(out.copy(v)); };
  return { fish, swim, bobber, rod, line, tipPos, dispose() { for (const o of owned) o.dispose?.(); } };
}
