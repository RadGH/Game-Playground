// Hit feedback: floating damage numbers, a spark burst where a blow lands, a short camera shake and a
// hit-stop (a ~60 ms freeze of YOUR character's animation) when your own hit connects. All client
// side, all cosmetic — the server has already decided the numbers.

import * as THREE from 'three';
import { makeGlowTexture } from './decor.js';
import { boxSize } from './box-size.js';

export function createFx(scene, { layer, camera }) {
  const numbers = [];
  const sparks = [];
  const glow = makeGlowTexture();
  const sparkMat = new THREE.SpriteMaterial({ map: glow, color: '#ffd28a', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const bloodMat = new THREE.SpriteMaterial({ map: glow, color: '#c8322b', blending: THREE.NormalBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  let shake = 0, stopUntil = 0;
  // play-test 12 (#82/#83): a coloured burst (a telegraph landing, a level-up) used to CLONE the spark material for every
  // spark and dispose it 0.3 s later — and three.js frees a program with the last material using it, so a burst could
  // link the sprite shader again mid-fight. One material per colour now, kept for the session (a handful of colours).
  const tinted = new Map();
  const tintMat = color => { let m = tinted.get(color); if (!m) { m = sparkMat.clone(); m.color.set(color); tinted.set(color, m); } return m; };

  /** A number rising from a world point. kind: 'out' (your damage), 'in' (damage to you), 'crit', 'miss', 'xp', 'heal'. */
  function number(pos, text, kind) {
    if (!layer) return;
    const el = document.createElement('div');
    el.className = `dmg ${kind}`;
    el.textContent = text;
    layer.appendChild(el);
    // play-test 12 (#66, owner: "two damage at once overlap — float them off at random angles and velocities, or
    // stagger them"): each number leaves on its own heading (up to ~55 degrees either side of straight up, in SCREEN
    // space so it reads the same from any camera angle) at its own speed, and numbers that start on the same spot within
    // a moment of each other take alternate sides and step up a row, so two hits on one frame are always two numbers.
    const now = performance.now();
    let lane = 0;
    for (const o of numbers) if (now - o.born < 260 && Math.abs(o.x - pos.x) + Math.abs(o.z - pos.z) < 1.5) lane++;
    const side = lane === 0 ? (Math.random() < 0.5 ? -1 : 1) : (lane % 2 ? 1 : -1);
    const ang = side * (lane === 0 ? Math.random() * 0.3 : 0.45 + Math.min(3, lane) * 0.15 + Math.random() * 0.1);
    const spd = 0.8 + Math.random() * 0.5;
    numbers.push({ el, x: pos.x, y: pos.y, z: pos.z, t: 0, life: kind === 'crit' ? 1.35 : 1.05, sx: Math.sin(ang) * spd, rise: 0.85 + Math.random() * 0.3, row: Math.min(4, lane), born: now, kind });
  }
  /** play-test 12 (#66): where a number is `k` (0..1) through its life, in screen pixels from its anchor. */
  const numberOffset = (n, k) => ({ x: n.sx * 80 * Math.sqrt(k), y: -n.row * 24 });      // a row is one line of 22 px text

  function burst(pos, { color = null, count = 7, blood = false } = {}) {
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(blood && i % 2 ? bloodMat : color && !blood ? tintMat(color) : sparkMat);
      s.position.set(pos.x, pos.y, pos.z);
      const a = Math.random() * Math.PI * 2, up = 1.2 + Math.random() * 2.4, out = 1.5 + Math.random() * 2.5;
      sparks.push({ s, vx: Math.cos(a) * out, vy: up, vz: Math.sin(a) * out, t: 0, life: 0.28 + Math.random() * 0.2, size: 0.35 + Math.random() * 0.3 });
      scene.add(s);
    }
  }

  const _v = new THREE.Vector3();
  function update(dt) {
    const { w, h } = boxSize(layer);      // 2026-10-20: no layout read per frame (box-size.js)
    for (let i = numbers.length - 1; i >= 0; i--) {
      const n = numbers[i];
      n.t += dt;
      const k = n.t / n.life;
      if (k >= 1) { n.el.remove(); numbers.splice(i, 1); continue; }
      _v.set(n.x, n.y + 0.4 + k * 1.6 * n.rise, n.z).project(camera);
      if (_v.z > 1) { n.el.style.opacity = 0; continue; }
      const pop = n.kind === 'crit' ? 1 + Math.max(0, 0.6 - n.t * 4) : 1 + Math.max(0, 0.25 - n.t * 2);
      const off = numberOffset(n, k);
      n.el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * w + off.x).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h + off.y).toFixed(1)}px) translate(-50%, -50%) scale(${pop.toFixed(3)})`;
      n.el.style.opacity = (k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3).toFixed(2);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += dt;
      if (p.t >= p.life) { scene.remove(p.s); sparks.splice(i, 1); continue; }      // (materials are shared: never disposed here)
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
    /** play-test 12: the spark + blood sprites for the boot shader warm-up (warmup.js `extras`). */
    sample() { const g = new THREE.Group(); g.name = 'fx-samples'; const a = new THREE.Sprite(sparkMat), b = new THREE.Sprite(bloodMat); b.position.x = 1; g.add(a, b); return g; },
    shake(amount) { shake = Math.min(1, shake + amount); },
    hitStop(ms) { stopUntil = Math.max(stopUntil, performance.now() + ms); },
    get stopped() { return performance.now() < stopUntil; },
  };
}
