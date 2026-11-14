// Drawing for the round-2 world systems — kept minimal and apart from the effects code (render/fx.js):
//   the harpoon cable and its head in flight, the scan ring, the station's tractor beam on a tow, a glow at each
//   anomaly (rift, ion cloud) and a beacon at the empty orbit spot where an outpost can be founded.
// Every material is made once here; meshes are only shown, hidden and moved (no shader rebuilds mid-fight).

import * as THREE from 'three';
import { softGlow } from './sky.js';
import { toWorld } from '../sim/body.js';
import { harpoonState } from '../sim/harpoon.js';

export function createWorldDraw(scene) {
  const root = new THREE.Group(); root.name = 'world-draw'; scene.add(root);
  const add = o => { o.frustumCulled = false; root.add(o); return o; };
  // the cable: a bright line, plus a fainter wider one for a little glow
  const lineGeo = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage)); return g; };
  const cable = add(new THREE.Line(lineGeo(), new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, toneMapped: false })));
  const head = add(new THREE.Line(lineGeo(), new THREE.LineBasicMaterial({ color: 0xffe9b0, toneMapped: false })));
  const beam = add(new THREE.Line(lineGeo(), new THREE.LineBasicMaterial({ color: 0x62f0a8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })));
  const setLine = (L, a, b) => { const p = L.geometry.attributes.position; p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true; L.visible = true; };
  // scan ring: two rings (flat + upright) that sweep out to the scan's reach
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ringGeo = new THREE.RingGeometry(0.985, 1, 128);
  const ringA = add(new THREE.Mesh(ringGeo, ringMat)); ringA.rotation.x = Math.PI / 2;
  const ringB = add(new THREE.Mesh(ringGeo, ringMat));
  ringA.visible = ringB.visible = false;
  let scan = null;
  // anomaly glows (a small pool of sprites)
  const glowMats = { rift: new THREE.SpriteMaterial({ map: softGlow(), color: new THREE.Color('#d06aff').multiplyScalar(2.2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }),
    ion: new THREE.SpriteMaterial({ map: softGlow(), color: new THREE.Color('#6a9cff').multiplyScalar(0.9), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true, opacity: 0.45 }),
    orbit: new THREE.SpriteMaterial({ map: softGlow(), color: new THREE.Color('#62f0a8').multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }) };
  const sprites = [];
  const sprite = i => { while (sprites.length <= i) { const s = new THREE.Sprite(glowMats.orbit); add(s); sprites.push(s); } return sprites[i]; };

  function scanPulse(pos, range) { scan = { pos, range, t: 0 }; ringA.position.set(pos.x, pos.y, pos.z); ringB.position.copy(ringA.position); }

  /** Each frame. `pose(b)` = the drawn pose (smoothed between sim steps). */
  function update(w, P, dt, now, pose, camera) {
    cable.visible = head.visible = beam.visible = false;
    let si = 0;
    if (w && P && !P.dead) {
      const H = harpoonState(w);
      const posed = b => { const p = pose(b); return { ...b, pos: p.pos, quat: p.quat }; };
      if (H.tether && !H.tether.b.dead) setLine(cable, toWorld(posed(P), H.tether.la), toWorld(posed(H.tether.b), H.tether.lb));
      if (H.head) { const v = H.head.vel; const L = Math.hypot(v.x, v.y, v.z) || 1; const a = H.head.pos; setLine(head, a, { x: a.x - v.x / L * 3, y: a.y - v.y / L * 3, z: a.z - v.z / L * 3 }); setLine(cable, toWorld(posed(P), { x: P.pivot.x, y: P.pivot.y, z: P.pivot.z }), a); }
      const tow = w.bodies.find(b => b.tractor && !b.dead);
      if (tow && w.station) setLine(beam, w.station.pos, pose(tow).pos);
      for (const e of w.enc || []) {
        if (e.state === 'done' || (e.kind !== 'rift' && e.kind !== 'ion')) continue;
        const s = sprite(si++); s.material = glowMats[e.kind]; s.visible = true; s.position.set(e.pos.x, e.pos.y, e.pos.z);
        const k = e.kind === 'rift' ? 90 + Math.sin(now * 2.3) * 14 + (e.state === 'waves' ? 30 : 0) : (e.radius || 420) * 2.2;
        s.scale.setScalar(k);
      }
      if (w.orbit && !w.outpostBody) { const s = sprite(si++); s.material = glowMats.orbit; s.visible = true; s.position.set(w.orbit.x, w.orbit.y, w.orbit.z); s.scale.setScalar(26 + Math.sin(now * 3) * 4); }
    }
    for (let i = si; i < sprites.length; i++) sprites[i].visible = false;
    if (scan) {
      scan.t += dt; const k = Math.min(1, scan.t / 1.4);
      const R = Math.max(1, scan.range * (0.05 + 0.95 * Math.sqrt(k)));
      ringA.scale.setScalar(R); ringB.scale.setScalar(R); ringA.visible = ringB.visible = true;
      if (camera) ringB.quaternion.copy(camera.quaternion);
      ringMat.opacity = 0.75 * (1 - k);
      if (k >= 1) { scan = null; ringA.visible = ringB.visible = false; }
    }
  }
  function reset() { scan = null; ringA.visible = ringB.visible = false; for (const s of sprites) s.visible = false; cable.visible = head.visible = beam.visible = false; }
  return { update, scanPulse, reset };
}
