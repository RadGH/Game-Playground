// The guide on screen (owner 2026-11-11): a gold arrow round the hero's feet toward the next place to go
// (js/rules/guide.js picks it), a soft beam of light over that place, and the hint under the quest tracker.
import * as THREE from 'three';
import { guideTarget } from '../rules/guide.js';

export function createGuideView(view) {
  const arrow = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(0, 0.55); shape.lineTo(0.32, 0.05); shape.lineTo(0.12, 0.05); shape.lineTo(0.12, -0.3); shape.lineTo(-0.12, -0.3); shape.lineTo(-0.12, 0.05); shape.lineTo(-0.32, 0.05); shape.closePath();
  const mat = new THREE.MeshBasicMaterial({ color: '#ffd040', transparent: true, opacity: 0.85, depthWrite: false });
  const head = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), mat); head.position.z = -1.6; head.rotation.y = Math.PI; arrow.add(head);
  arrow.visible = false; arrow.renderOrder = 5; view.scene.add(arrow);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.visible = false; view.scene.add(beam);
  let target = null;
  function update(content, ch, area, step, me, now) {
    target = me && ch ? guideTarget(content, ch, area, step, me) : null;
    const has = target && target.x != null;
    arrow.visible = !!has && Math.hypot(target.x - me.x, target.z - me.z) > 4;
    beam.visible = !!has;
    if (has) {
      const gy = view.groundY?.(me.x, me.z) || 0;
      arrow.position.set(me.x, gy + 0.06, me.z); arrow.rotation.y = Math.atan2(target.x - me.x, target.z - me.z);
      mat.opacity = 0.6 + Math.sin(now / 220) * 0.25;
      beam.position.set(target.x, (view.groundY?.(target.x, target.z) || 0) + 7, target.z);
      beam.material.opacity = 0.16 + Math.sin(now / 400) * 0.06;
    }
    return target;
  }
  return { update, get target() { return target; } };
}
