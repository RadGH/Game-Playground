import * as THREE from 'three';
import { renderSVG, normalizeAvatar } from '../../avatar-2d/js/render.js';
import { normalizeForChibi26 } from './chibi26-adapter.js';
import { createChibi2Character } from './chibi2.js';

// Vector portrait from the same normalized look consumed by the 3D builder.
export function svgPortrait(look, { width = 320, height = 400 } = {}) {
  // renderSVG is inserted into HTML by the editor and uses an HTML-style boolean data attribute.
  // Give that marker an explicit value so the same SVG is also valid as a standalone image/XML.
  return renderSVG(normalizeAvatar(normalizeForChibi26(look)), { width, height }).replace(' data-avatar>', ' data-avatar="true">');
}

/**
 * Render a transparent PNG portrait from the actual 2.6 head mesh. This is intentionally separate
 * from svgPortrait: callers can keep the lightweight legacy SVG or request a 2.6 face baked by
 * Three.js. Requires a browser/WebGL context.
 */
export async function bakePortrait(look, {
  width = 320,
  height = 400,
  yaw = 0,
  graphics = 'high',
} = {}) {
  if (typeof document === 'undefined') throw new Error('bakePortrait requires a browser document');
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height));
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  const scene = new THREE.Scene();
  const halfY = 0.425, halfX = halfY * w / h;
  const camera = new THREE.OrthographicCamera(-halfX, halfX, halfY, -halfY, 0.01, 10);
  let actor;
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x637080, 1.35));
    const key = new THREE.DirectionalLight(0xfff2df, 2.25);
    key.position.set(-2.2, 3.1, 4.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb9d6ff, 0.7);
    fill.position.set(2.6, 1.1, -2.5);
    scene.add(fill);

    actor = await createChibi2Character(normalizeForChibi26(look), { graphics });
    actor.update(0);
    scene.add(actor.group);
    actor.group.updateMatrixWorld(true);
    const leftEye = actor.parts.eyeL.getWorldPosition(new THREE.Vector3());
    const rightEye = actor.parts.eyeR.getWorldPosition(new THREE.Vector3());
    const target = leftEye.add(rightEye).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.025, 0));
    const distance = 2.5;
    camera.position.set(target.x + Math.sin(yaw) * distance, target.y, target.z + Math.cos(yaw) * distance);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  } finally {
    actor?.dispose();
    scene.clear();
    renderer.dispose();
  }
}
