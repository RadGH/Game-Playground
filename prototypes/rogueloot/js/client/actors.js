// Players on screen: a Chibi 2.6 body each (built like Thousandvale's, createTvBody), a capsule stand-in while the
// body builds, and a name tag. Others are drawn ~100 ms in the past between two snapshots (interpolation).
import * as THREE from 'three';
import { createTvBody } from '../../../thousandvale/js/client/chibi-version.js';
import { CHIBI2_ANIMS } from '../../../../avatar-3d/js/chibi2-motion.js';
import '../../../../avatar-3d/js/chibi26-motion.js';
import { avatarOf } from '../../../knockabout/js/client/look.js';
import { CHIBI2_DUAL_ANIMS, dualAttackByCount } from '../../../../avatar-3d/js/chibi2-motion-dual.js';
const swingClip = (hold, { count = 0 } = {}) => (hold && dualAttackByCount(hold, count)) || 'attack';   // Thousandvale's rule, main hand

export function createActors(view, tagRoot) {
  const list = new Map();
  const standin = () => new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1, 3, 8).translate(0, 0.85, 0), new THREE.MeshLambertMaterial({ color: '#d9c7a0', flatShading: true }));
  function add(id, { name, look, me = false }) {
    const group = new THREE.Group(); view.scene.add(group);
    const temp = standin(); temp.castShadow = true; group.add(temp);
    const tag = document.createElement('div'); tag.className = 'tag' + (me ? ' me' : ''); tag.textContent = name; tagRoot.append(tag);
    const a = { id, group, body: null, tag, anim: '', x: 0, z: 0, yaw: 0, moving: false, buf: [], me, oneShot: null, oneShotUntil: 0, faceYaw: null, faceUntil: 0, casting: false, swingN: 0 };
    /** a blow (owner 2026-11-11: "no attack animation at all, and my character should face the target"): play a swing
     *  for the weapon in hand (Thousandvale's swingClip: a sword cuts, a dagger stabs, a bow draws) and turn to face. */
    a.swing = (at = null, clip = null) => {
      const now = performance.now();
      if (at) { a.faceYaw = Math.atan2(at.x - (a.rx ?? a.x), at.z - (a.rz ?? a.z)); a.faceUntil = now + 700; }
      if (now - (a.swingAt || 0) < 260) return;
      a.swingAt = now;
      const c = clip || (a.body?.hold ? swingClip(a.body.hold, { count: a.swingN++ }) : 'attack');
      a.oneShot = c; a.oneShotUntil = now + 600; a.anim = '';
    };
    a.face = at => { if (!at) return; a.faceYaw = Math.atan2(at.x - (a.rx ?? a.x), at.z - (a.rz ?? a.z)); a.faceUntil = performance.now() + 700; };
    list.set(id, a);
    if (look) createTvBody(avatarOf(look), { anims: [...new Set([...CHIBI2_ANIMS, ...CHIBI2_DUAL_ANIMS])] }).then(body => {
      if (!list.has(id)) { body.dispose?.(); return; }
      group.remove(temp); body.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); group.add(body.group); a.body = body;
    }).catch(e => console.warn('body', e));
    return a;
  }
  function remove(id) { const a = list.get(id); if (!a) return; view.scene.remove(a.group); a.body?.dispose?.(); a.tag.remove(); list.delete(id); }
  /** A server snapshot of someone else: keep it for interpolation. */
  function push(id, s, at) { const a = list.get(id); if (!a) return; a.buf.push({ at, x: s.x, z: s.z, yaw: s.yaw, moving: s.moving }); if (a.buf.length > 8) a.buf.shift(); }
  const lerpAngle = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
  function sample(a, t) {
    const b = a.buf; if (!b.length) return;
    let i = b.length - 1; while (i > 0 && b[i - 1].at > t) i--;
    const p1 = b[i], p0 = b[Math.max(0, i - 1)];
    const k = p1.at === p0.at ? 1 : Math.max(0, Math.min(1, (t - p0.at) / (p1.at - p0.at)));
    a.x = p0.x + (p1.x - p0.x) * k; a.z = p0.z + (p1.z - p0.z) * k; a.yaw = lerpAngle(p0.yaw, p1.yaw, k); a.moving = p1.moving;
  }
  const v = new THREE.Vector3();
  function update(dt, renderAt) {
    const w = view.renderer.domElement.clientWidth, h = view.renderer.domElement.clientHeight;
    for (const a of list.values()) {
      if (!a.me) sample(a, renderAt);
      // your own hero is drawn at its smoothed spot (main.js: between the last two fixed steps, minus a fading correction)
      const X = a.me && a.rx != null ? a.rx : a.x, Z = a.me && a.rz != null ? a.rz : a.z;
      const gy = view.groundY ? view.groundY(X, Z) : 0;
      a.group.position.set(X, gy, Z);
      const now = performance.now(), facing = a.faceUntil > now && !a.moving;
      const turn = 1 - Math.exp(-dt * (facing ? 20 : 14)); a.group.rotation.y = lerpAngle(a.group.rotation.y, facing ? a.faceYaw : a.yaw, turn);
      if (a.body) {
        // a one-shot (a swing) wins while it plays, unless you walk off; then walking, casting, or standing
        if (a.oneShot && (now >= a.oneShotUntil || a.moving)) a.oneShot = null;
        const want = a.oneShot || (a.moving ? 'walk' : a.casting ? 'cast' : 'idle');
        if (want !== a.anim) { a.anim = want; a.body.setAnim(want, a.oneShot ? 0.08 : 0.18); }
        a.body.update(dt);
      }
      v.set(X, gy + 2.15, Z).project(view.camera);
      a.tag.style.transform = `translate(-50%, -100%) translate(${(v.x * 0.5 + 0.5) * w}px, ${(-v.y * 0.5 + 0.5) * h}px)`;
    }
  }
  return { add, remove, push, update, get: id => list.get(id), list };
}
