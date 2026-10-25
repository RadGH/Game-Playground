// Dust and spray: one pool of soft round points, updated on the processor (a few hundred at most), one draw call.
// dust(x, y, z, surfaceId, amount) puffs in that surface's dust colour; splash(x, y, z, amount) throws white-blue
// spray up that falls back under gravity.

import * as THREE from 'three';
import { SURFACES } from '../../world/world-data.js';

export function createParticles(quality) {
  const MAX = quality.particles || 400;
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 4), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), max = new Float32Array(MAX), grav = new Float32Array(MAX);
  const grow = new Float32Array(MAX);
  const geo = new THREE.BufferGeometry();
  const aP = new THREE.BufferAttribute(pos, 3), aC = new THREE.BufferAttribute(col, 4), aS = new THREE.BufferAttribute(size, 1);
  for (const a of [aP, aC, aS]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', aP); geo.setAttribute('aColor', aC); geo.setAttribute('aSize', aS);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */`
      attribute vec4 aColor; attribute float aSize; uniform float uScale; varying vec4 vC;
      void main() { vC = aColor; vec4 mv = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uScale / max( 0.5, -mv.z ); }`,
    fragmentShader: /* glsl */`
      varying vec4 vC;
      void main() { float d = length( gl_PointCoord - 0.5 ); float a = smoothstep( 0.5, 0.1, d ); if ( a * vC.a < 0.01 ) discard;
        gl_FragColor = vec4( vC.rgb, a * vC.a ); }`,
  });
  const points = new THREE.Points(geo, material);
  points.name = 'particles';
  points.frustumCulled = false;
  points.renderOrder = 3;
  let next = 0;
  const _c = new THREE.Color();
  function spawn(x, y, z, vx, vy, vz, l, s, g, rgb, gr) {
    const i = next; next = (next + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    life[i] = l; max[i] = l; size[i] = s; grav[i] = g; grow[i] = gr;
    col[i * 4] = rgb.r; col[i * 4 + 1] = rgb.g; col[i * 4 + 2] = rgb.b; col[i * 4 + 3] = 0;
  }
  const rnd = () => Math.random() - 0.5;
  return {
    points,
    dust(x, y, z, surf, amount = 1) {
      const s = SURFACES[surf] || SURFACES[1];
      _c.set(s.dust).convertSRGBToLinear();
      const n = Math.max(1, Math.round(amount * 3));
      for (let k = 0; k < n; k++) spawn(x + rnd() * 0.6, y + 0.1, z + rnd() * 0.6, rnd() * 1.4, 0.4 + Math.random() * 0.9, rnd() * 1.4,
        1.2 + Math.random() * 1.4, 0.5 + Math.random() * 0.5 * amount, -0.15, _c, 1.2);
    },
    splash(x, y, z, amount = 1) {
      _c.setRGB(0.82, 0.9, 0.95);
      const n = Math.max(2, Math.round(amount * 6));
      for (let k = 0; k < n; k++) spawn(x + rnd() * 0.5, y + 0.05, z + rnd() * 0.5, rnd() * 3, 2 + Math.random() * 3 * Math.min(2, amount), rnd() * 3,
        0.7 + Math.random() * 0.5, 0.18 + Math.random() * 0.2, 9.8, _c, 0.3);
    },
    update(dt, camera) {
      material.uniforms.uScale.value = (camera?.isPerspectiveCamera ? 300 / Math.tan((camera.fov * Math.PI) / 360) : 600) * 0.5;
      for (let i = 0; i < MAX; i++) {
        if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
        life[i] -= dt;
        vel[i * 3 + 1] -= grav[i] * dt;
        const drag = Math.exp(-dt * (grav[i] > 1 ? 0.4 : 1.6));
        vel[i * 3] *= drag; vel[i * 3 + 2] *= drag; if (grav[i] <= 1) vel[i * 3 + 1] *= drag;
        pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
        size[i] += grow[i] * dt;
        const t = life[i] / max[i];
        col[i * 4 + 3] = Math.min(1, (1 - t) * 6) * t * (grav[i] > 1 ? 0.9 : 0.45);
      }
      aP.needsUpdate = aC.needsUpdate = aS.needsUpdate = true;
    },
    dispose() { geo.dispose(); material.dispose(); },
  };
}
