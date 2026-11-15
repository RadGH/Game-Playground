// Shipyard: a turret's firing arc, drawn in 3D while you place a turret or point at a fitted one. A turret aims
// anywhere above its mount face and a little below it (sim/body.js PITCH_MIN … PITCH_MAX: −17° … 90°), all the way
// round; your own hull never blocks it (shots pass through your hull). The dome is drawn at a fixed size, not to
// range — the label gives the range in metres. Geometry and materials are made once per Shipyard visit.

import * as THREE from 'three';
import { PITCH_MIN, PITCH_MAX } from '../sim/body.js';
import { DIRV } from '../core/math.js';
import { TURRETS } from '../data/blocks.js';
import { partStats } from '../sim/items.js';
import { fmt } from '../../../../shared/format.js';

const R = 5.5;                                     // drawn radius (m)
const TOP = Math.PI / 2 - PITCH_MAX;               // polar angle from the face normal where the arc starts (0: no hole straight out)
const BOTTOM = Math.PI / 2 - PITCH_MIN;            // polar angle of the lowest aim
const UP = new THREE.Vector3(0, 1, 0);

export function createArc() {
  const root = new THREE.Group(); root.visible = false; root.renderOrder = 5;
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0.55, depthWrite: false });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 18, 0, Math.PI * 2, TOP, BOTTOM - TOP), fillMat);
  root.add(dome);
  // rings (the mount plane and halfway up) and meridians every 30°
  const pts = [];
  const sph = (th, ph) => new THREE.Vector3(R * Math.sin(th) * Math.cos(ph), R * Math.cos(th), R * Math.sin(th) * Math.sin(ph));
  for (const th of [Math.PI / 4, Math.PI / 2]) for (let i = 0; i < 64; i++) pts.push(sph(th, i / 64 * Math.PI * 2), sph(th, (i + 1) / 64 * Math.PI * 2));
  for (let k = 0; k < 12; k++) { const ph = k / 12 * Math.PI * 2; for (let i = 0; i < 12; i++) pts.push(sph(TOP + (BOTTOM - TOP) * i / 12, ph), sph(TOP + (BOTTOM - TOP) * (i + 1) / 12, ph)); }
  const grid = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat); root.add(grid);
  // the lowest the guns can dip: a bright ring
  const low = []; for (let i = 0; i < 96; i++) low.push(sph(BOTTOM, i / 96 * Math.PI * 2), sph(BOTTOM, (i + 1) / 96 * Math.PI * 2));
  const edge = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(low), edgeMat); root.add(edge);
  let t = 0;
  return {
    root,
    /** Show the arc of a turret mounted in `cell` on face `face` (DIRS index). */
    show(cell, face, kind, item) {
      const n = DIRV[face];
      root.position.set(cell.x + 0.5 + n.x * 0.62, cell.y + 0.5 + n.y * 0.62, cell.z + 0.5 + n.z * 0.62);
      root.quaternion.setFromUnitVectors(UP, new THREE.Vector3(n.x, n.y, n.z));
      const glow = TURRETS[kind]?.glow || '#ffcf7a';
      if (fillMat.userData.c !== glow) { fillMat.color.set(glow); lineMat.color.set(glow); fillMat.userData.c = glow; }
      root.visible = true;
      void item;
    },
    hide() { root.visible = false; },
    frame(dt) { t += dt; fillMat.opacity = 0.1 + Math.sin(t * 2.4) * 0.03; },
    /** One line for the tip: range and arc. */
    label(item, kind) {
      const s = item ? partStats(item) : TURRETS[kind]?.base || {};
      return `${TURRETS[kind]?.name || 'Turret'} arc: all round, ${fmt(-PITCH_MIN * 57.3, { decimals: 0 })}° below its face to ${fmt(PITCH_MAX * 57.3, { decimals: 0 })}° up · range ${fmt(s.range || 0, { decimals: 0 })} m`;
    },
    dispose() { dome.geometry.dispose(); grid.geometry.dispose(); edge.geometry.dispose(); fillMat.dispose(); lineMat.dispose(); edgeMat.dispose(); },
  };
}
