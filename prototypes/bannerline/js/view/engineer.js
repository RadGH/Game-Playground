// The Engineer's gadgets (stream C, owner round 2 R2.8): the Bolt Turret in three visual levels and
// the Shrapnel Mine. Built with the structures Kit (one or two draw calls each).
//
//   import { makeTurret, makeMine } from './engineer.js';
//   const t = makeTurret({ level: 2, color: '#3f86ec' });   // level 1 | 2 | 3 (the skill's rank)
//   t.aim(yaw)            // turn the head toward a target (radians, 0 = +z)
//   t.fire()              // recoil + muzzle flash
//   t.setOvercharge(bool) // glowing coils while Overcharge is on
//   t.update(dt)
//   const m = makeMine({ color }); m.setArmed(true); m.update(dt); m.blast()   // blast(): hides it; play the fx yourself
//
// Level 1: a timber ballista on a tripod. Level 2: a stone-footed repeater with twin bolts and iron
// plates. Level 3: a steel cannon-crossbow on a riveted drum with a glowing core. Each grows a
// little, so rank reads at RTS zoom. The team colour is a pennant on the head.

import * as THREE from 'three';
import { Kit } from './structures.js';

export function makeTurret({ level = 1, color = '#3f86ec', wood = '#6a4a2c', metal = '#8a929c', glow = '#7fd0ff' } = {}) {
  const L = Math.max(1, Math.min(3, level | 0)), base = new Kit(), head = new Kit();
  const S = [0, 1, 1.15, 1.3][L];
  // base
  if (L === 1) { for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; base.cyl(0.06, 0.08, 1.2, wood, { p: [Math.cos(a) * 0.35, 0.55, Math.sin(a) * 0.35], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35] }, 5); } base.cyl(0.2, 0.2, 0.15, wood, { p: [0, 1.05, 0] }, 8); }
  else if (L === 2) { base.cyl(0.65, 0.75, 0.5, '#8a867b', { p: [0, 0.25, 0] }, 8); base.cyl(0.35, 0.45, 0.6, wood, { p: [0, 0.8, 0] }, 8); for (let i = 0; i < 4; i++) base.box(0.3, 0.45, 0.08, metal, { p: [Math.cos(i * 1.57) * 0.6, 0.35, Math.sin(i * 1.57) * 0.6], r: [0, -i * 1.57 + 1.57, 0], kind: 'metal' }); }
  else { base.cyl(0.7, 0.8, 0.9, metal, { p: [0, 0.45, 0], kind: 'metal' }, 12); for (let i = 0; i < 12; i++) base.sphere(0.05, '#5a5f66', { p: [Math.cos(i / 12 * Math.PI * 2) * 0.72, 0.7, Math.sin(i / 12 * Math.PI * 2) * 0.72], kind: 'metal' }, 4); base.cyl(0.5, 0.6, 0.3, '#5a5f66', { p: [0, 1.0, 0], kind: 'metal' }, 12); }
  // head (turns): a stock along +z, bow arms, a bolt; level 2 twin, level 3 barrel + core
  head.box(0.22, 0.2, 1.1, L === 3 ? '#5a5f66' : wood, { p: [0, 0, 0.15], kind: L === 3 ? 'metal' : 'std' });
  for (const s of [-1, 1]) head.cyl(0.03, 0.05, 0.8, L === 1 ? wood : metal, { p: [s * 0.4, 0, 0.55], r: [0, 0, Math.PI / 2 + s * 0.35], kind: L === 1 ? 'std' : 'metal' }, 5);
  head.cyl(0.008, 0.008, 1.0, '#e8e0c8', { p: [0, 0, 0.42], r: [0, 0, Math.PI / 2] }, 3);
  const bolts = L === 2 ? [-0.08, 0.08] : [0];
  for (const x of bolts) { head.cyl(0.025, 0.025, 1.0, '#7a5a3a', { p: [x, 0.12, 0.35], r: [Math.PI / 2, 0, 0] }, 4); head.cone(0.05, 0.15, metal, { p: [x, 0.12, 0.9], r: [Math.PI / 2, 0, 0], kind: 'metal' }, 4); }
  if (L >= 2) head.box(0.5, 0.35, 0.06, metal, { p: [0, 0.05, -0.1], kind: 'metal' });   // shield plate
  if (L === 3) { head.cyl(0.11, 0.13, 0.9, '#3a3e44', { p: [0, 0.2, 0.55], r: [Math.PI / 2, 0, 0], kind: 'metal' }, 10); head.torus(0.14, 0.035, '#c89a40', { p: [0, 0.2, 0.95], kind: 'metal' }); }
  // pennant pole
  head.cyl(0.015, 0.015, 0.7, wood, { p: [-0.12, 0.35, -0.3] }, 4);
  const group = new THREE.Group(); group.name = 'turret-' + L;
  const b = base.build('turret-base'); group.add(b);
  const pivot = new THREE.Group(); pivot.position.y = L === 1 ? 1.2 : L === 2 ? 1.2 : 1.3; group.add(pivot);
  const recoil = new THREE.Group(); pivot.add(recoil); recoil.add(head.build('turret-head'));
  const pennant = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 0.22), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.9 }));
  pennant.position.set(-0.12, 0.6, -0.48); pennant.rotation.y = Math.PI / 2; recoil.add(pennant);
  const coreMat = new THREE.MeshBasicMaterial({ color: glow, toneMapped: false, transparent: true, opacity: L === 3 ? 0.9 : 0 });
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), coreMat); core.position.set(0, L === 3 ? -0.2 : 0.05, -0.05); pivot.add(core);
  const flashMat = new THREE.MeshBasicMaterial({ color: '#ffe0a0', toneMapped: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), flashMat); flash.position.set(0, 0.12, 1.05); recoil.add(flash);
  group.scale.setScalar(S);
  let yaw = 0, goal = 0, kick = 0, over = false, t = 0;
  return {
    group, level: L, height: (pivot.position.y + 0.5) * S, pivot,
    aim(y) { goal = y; },
    fire() { kick = 1; },
    setOvercharge(v) { over = !!v; },
    update(dt) {
      t += dt;
      let d = goal - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 10); pivot.rotation.y = yaw;
      kick = Math.max(0, kick - dt * 6); recoil.position.z = -kick * 0.18; flashMat.opacity = kick > 0.6 ? (kick - 0.6) * 2.5 : 0;
      coreMat.opacity = (L === 3 ? 0.75 : 0) + (over ? 0.25 + 0.25 * Math.sin(t * 14) : 0); core.scale.setScalar(over ? 1.3 : 1);
      pennant.rotation.z = Math.sin(t * 5) * 0.15;
    },
    dispose() { group.traverse(o => { o.geometry?.dispose(); if (o.material && o.material !== flashMat) o.material.dispose?.(); }); flashMat.dispose(); },
  };
}

/** The Shrapnel Mine: a half-buried iron pot with spikes; a light blinks once it is armed. */
export function makeMine({ color = '#e0503e', metal = '#5a5f66' } = {}) {
  const k = new Kit();
  k.cyl(0.42, 0.5, 0.08, '#4a3e2c', { p: [0, 0.03, 0] }, 14);                      // turned earth
  k.sphere(0.32, metal, { p: [0, 0.05, 0], s: [1, 0.5, 1], kind: 'metal' }, 12);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.cone(0.04, 0.22, '#8a929c', { p: [Math.cos(a) * 0.26, 0.12, Math.sin(a) * 0.26], r: [Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9], kind: 'metal' }, 4); }
  k.cyl(0.07, 0.07, 0.08, '#3a3e44', { p: [0, 0.2, 0], kind: 'metal' }, 8);
  const group = k.build('mine');
  const lightMat = new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, opacity: 0.2 });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), lightMat); light.position.y = 0.27; group.add(light);
  let armed = false, t = 0;
  return {
    group,
    setArmed(v) { armed = !!v; },
    blast() { group.visible = false; },
    update(dt) { t += dt; lightMat.opacity = armed ? (Math.sin(t * 6) > 0.3 ? 1 : 0.15) : 0.2; },
    dispose() { group.traverse(o => { o.geometry?.dispose(); }); lightMat.dispose(); },
  };
}
