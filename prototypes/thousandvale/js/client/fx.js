// Hit feedback: floating damage numbers, a spark burst where a blow lands, a short camera shake and a
// hit-stop (a ~60 ms freeze of YOUR character's animation) when your own hit connects. All client
// side, all cosmetic — the server has already decided the numbers.

import * as THREE from 'three';
import { makeGlowTexture } from './decor.js';

export function createFx(scene, { layer, camera }) {
  const numbers = [];
  const sparks = [];
  const glow = makeGlowTexture();
  const sparkMat = new THREE.SpriteMaterial({ map: glow, color: '#ffd28a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const bloodMat = new THREE.SpriteMaterial({ map: glow, color: '#c8322b', blending: THREE.NormalBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  let shake = 0, stopUntil = 0;

  /** A number rising from a world point. kind: 'out' (your damage), 'in' (damage to you), 'crit', 'miss', 'xp', 'heal'. */
  function number(pos, text, kind) {
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    layer.appendChild(el);
    numbers.push({ el, x: pos.x, y: pos.y, z: pos.z, t: 0, life: kind === 'crit' ? 1.35 : 1.05, drift: (Math.random() - 0.5) * 0.9, kind });
  }

  function burst(pos, { color = null, count = 7, blood = false } = {}) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(blood && i % 2 ? bloodMat : sparkMat);
      if (color && !blood) { s.material = sparkMat.clone(); s.material.color.set(color); }
      s.position.set(pos.x, pos.y, pos.z);
      const a = Math.random() * Math.PI * 2, up = 1.2 + Math.random() * 2.4, out = 1.5 + Math.random() * 2.5;
      sparks.push({ s, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out, t: 0, life: 0.28 + Math.random() * 0.2, size: 0.35 + Math.random() * 0.3 });
      scene.add(s);
    }
  }

  const _v = new THREE.Vector3();
  function update(dt) {
    const w = layer?.clientWidth || 0, h = layer?.clientHeight || 0;
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) { n.el.remove(); numbers.splice(i, 1); continue; }
      _v.set(n.x + n.drift * k, n.y + 0.4 + k * 1.6, n.z).project(camera);
      if (_v.z > 1) { n.el.style.opacity = 0; continue; }
      const pop = n.kind === 'crit' ? 1 + Math.max(0, 0.6 - n.t * 4) : 1 + Math.max(0, 0.25 - n.t * 2);
      n.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h).toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
      n.el.style.opacity = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += dt;
      if (p.t >= p.life) { scene.remove(p.s); if (p.s.material !== sparkMat && p.s.material !== bloodMat) p.s.material.dispose(); sparks.splice(i, 1); continue; }
      p.vy -= 9 * dt;
      p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
      const sz = p.size * (1 - p.t / p.life);
      p.s.scale.set(sz, sz, 1);
    }
    shake = Math.max(0, shake - dt * 3.2);
  }

  /** Apply shake to the camera after it has been placed this frame. */
  function applyShake(cam, t) {
    if (shake <= 0) return;
    const a = shake * shake * 0.14;
    cam.position.x += Math.sin(t * 61) * a; cam.position.y += Math.sin(t * 73 + 1) * a; cam.position.z += Math.sin(t * 57 + 2) * a;
  }

  return {
    number, burst, update, applyShake,
    shake(amount) { shake = Math.min(1, shake + amount); },
    hitStop(ms) { stopUntil = Math.max(stopUntil, performance.now() + ms); },
    get stopped() { return performance.now() < stopUntil; },
  };
}
