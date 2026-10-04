// Everyone in the world you can see: their models, animation, nameplates and hit reactions.
//
// A player is a Chibi 2 body (avatar-3d/js/chibi2.js) built from `{ race, cls, seed }` (looks.js); a
// monster is an avatar-3d creature. Bodies are built through a small queue (one per frame) so twenty
// players walking into view do not freeze a frame; until a body is ready a soft stand-in shows where
// it is. Identical looks share one template (chibi2.js caches by avatar JSON).
//
// Animation is picked from what the entity is DOING — its interpolated speed for locomotion, plus
// one-shots (attack, hit) layered on top by events — so the server never has to send animation names
// for movement.

import * as THREE from 'three';
import { createChibi2Character } from '../../../../avatar-3d/js/chibi2.js';
import { createCreature, randomCreature } from '../../../../avatar-3d/js/creatures.js';
import { compactCreature } from '../../../../avatar-3d/js/mesh-merge.js';
import { avatarFor, bodyTypeFor } from './looks.js';

/** A creature spec from what the server sent: `{ type, size?, seed, colors? }` — colour varied by seed within its family. */
function creatureFor(spec) {
  const c = randomCreature(bodyTypeFor(spec?.type), (spec?.seed >>> 0) || 1);
  if (spec?.size) c.size = +(c.size * spec.size).toFixed(2);
  if (spec?.colors) c.colors = { ...c.colors, ...spec.colors };
  return c;
}
const TAU = Math.PI * 2;
/** Shortest signed difference between two angles. */
export function angleDelta(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

const CHIBI_ANIMS = ['idle', 'ready', 'walk', 'run', 'attack', 'cast', 'hit', 'guard', 'wave', 'talk', 'jump', 'dead'];

export function createActors(scene, { plateLayer, camera }) {
  const actors = new Map();
  const queue = [];
  const standinGeo = new THREE.CapsuleGeometry(0.35, 0.9, 4, 10);
  const standinMat = new THREE.MeshStandardMaterial({ color: '#8b8f99', transparent: true, opacity: 0.35, roughness: 1 });

  // Selection rings on the ground: red for hostile, green-gold for friendly; a dimmer one on hover.
  const ringGeo = new THREE.RingGeometry(0.85, 1.0, 48); ringGeo.rotateX(-Math.PI / 2);
  const mkRing = (color, opacity) => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false })); m.renderOrder = 2; m.visible = false; scene.add(m); return m; };
  const targetRing = mkRing('#ff4a3a', 0.9), hoverRing = mkRing('#ffffff', 0.35);

  function add(info, { self = false } = {}) {
    let a = actors.get(info.id);
    if (a) { Object.assign(a, pick(info)); a.dead = a.hp <= 0; refreshPlate(a); return a; }
    a = {
      id: info.id, kind: info.kind, self, ...pick(info), still: null,
      group: new THREE.Group(), model: null, body: null, anim: 'idle', oneShot: null, oneShotUntil: 0,
      recoil: new THREE.Vector3(), punch: 0, dead: info.hp <= 0, speed: 0, yaw: info.yaw || 0, height: info.kind === 'monster' ? 1.2 : 1.9,
      pos: new THREE.Vector3(info.x, info.y, info.z), plate: null, lastSeen: performance.now(), deathAt: 0, fade: 1,
    };
    a.group.position.copy(a.pos);
    a.group.userData.actorId = a.id;
    const stand = new THREE.Mesh(standinGeo, standinMat); stand.position.y = 0.8; a.group.add(stand); a.standin = stand;
    scene.add(a.group);
    a.plate = makePlate(a);
    actors.set(a.id, a);
    queue.push(a);
    return a;
  }
  function pick(i) { return { name: i.name, level: i.level, hp: i.hp, hpMax: i.hpMax, hostile: !!i.hostile, look: i.look, creature: i.creature, family: i.family }; }

  async function build(a) {
    try {
      let body;
      if (a.kind === 'monster') {
        body = await createCreature(creatureFor(a.creature || { type: 'wolf' }), { detail: 0.8 });
        // One draw call per moving part instead of one per eye and toe (Farhold R27 M8).
        try { compactCreature(body); } catch (e) { console.warn('[actors] compact failed', e); }
      } else {
        body = await createChibi2Character(await avatarFor(a.look), { anims: CHIBI_ANIMS });
      }
      if (!actors.has(a.id)) { body.dispose?.(); return; }
      a.body = body; a.model = body.group;
      a.model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
      a.group.remove(a.standin); a.group.add(a.model);
      try { const m = body.metrics(); a.height = Math.max(0.8, m.height || m.totalHeight || a.height); } catch {}
      if (a.dead) setAnim(a, 'dead');
    } catch (e) {
      console.warn('[actors] body failed for', a.id, e);
    }
  }

  function setAnim(a, name) {
    if (!a.body) { a.anim = name; return; }
    if (a.kind === 'monster') { if (a.anim !== name) a.body.setAnim(name); }
    else a.body.setAnim(name, 0.14, name === 'attack' || name === 'hit');
    a.anim = name;
  }

  function remove(id) {
    const a = actors.get(id); if (!a) return;
    scene.remove(a.group); a.body?.dispose?.(); a.plate?.root.remove();
    actors.delete(id);
  }

  // --- nameplates (DOM, so text is crisp at any size) -------------------------------------------
  function makePlate(a) {
    if (!plateLayer) return null;
    const root = document.createElement('div');
    root.className = `plate ${a.kind} ${a.hostile ? 'hostile' : 'friendly'}${a.self ? ' self' : ''}`;
    root.innerHTML = `<div class="plate-bubble"></div><div class="plate-name"><span class="plate-lvl"></span><span class="plate-n"></span></div><div class="plate-bar"><i></i><b></b></div>`;
    plateLayer.appendChild(root);
    const p = { root, bubble: root.querySelector('.plate-bubble'), bubbleUntil: 0, name: root.querySelector('.plate-n'), lvl: root.querySelector('.plate-lvl'), bar: root.querySelector('.plate-bar i'), lag: root.querySelector('.plate-bar b'), lagW: 1 };
    a.plate = p; refreshPlate(a);
    return p;
  }
  function refreshPlate(a) {
    const p = a.plate; if (!p) return;
    p.name.textContent = a.name; p.lvl.textContent = a.level;
    const f = Math.max(0, Math.min(1, a.hp / (a.hpMax || 1)));
    p.bar.style.width = (f * 100).toFixed(1) + '%';
    p.root.classList.toggle('hurt', f < 0.999);
    p.root.classList.toggle('dead', a.hp <= 0);
  }

  const _v = new THREE.Vector3(), _w = new THREE.Vector3();
  function updatePlates(targetId, hoverId) {
    if (!plateLayer) return;
    const w = plateLayer.clientWidth, h = plateLayer.clientHeight;
    for (const a of actors.values()) {
      const p = a.plate; if (!p) continue;
      _v.set(a.group.position.x, a.group.position.y + a.height + 0.35, a.group.position.z);
      const dist = camera.position.distanceTo(_v);
      // Behind the camera a projected point can still land inside the screen (mirrored): test camera space first.
      const front = _w.copy(_v).applyMatrix4(camera.matrixWorldInverse).z < -0.1;
      _v.project(camera);
      const bubbling = p.bubbleUntil > performance.now();
      if (p.bubble && !bubbling && p.bubble.style.display !== 'none') p.bubble.style.display = 'none';
      const show = front && _v.z < 1 && a.fade > 0.05 && (bubbling ? dist < 60 : !a.noPlate && dist < (a.self ? 0 : 70));
      if (!show) { if (p.shown !== false) { p.root.style.display = 'none'; p.shown = false; } continue; }
      if (p.shown !== true) { p.root.style.display = ''; p.shown = true; }
      const x = (_v.x * 0.5 + 0.5) * w, y = (-_v.y * 0.5 + 0.5) * h;
      const s = Math.max(0.62, Math.min(1, 14 / dist));
      p.root.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${s.toFixed(3)})`;
      p.root.style.opacity = (Math.min(1, (70 - dist) / 12) * a.fade).toFixed(2);
      p.root.classList.toggle('targeted', a.id === targetId);
      p.root.classList.toggle('hovered', a.id === hoverId && a.id !== targetId);
      // The trailing "damage taken" bar catches up after a beat (reads as a chunk being knocked off).
      const f = Math.max(0, a.hp / (a.hpMax || 1));
      p.lagW += (f - p.lagW) * (f < p.lagW ? 0.04 : 1);
      p.lag.style.width = (p.lagW * 100).toFixed(1) + '%';
    }
  }

  // --- per frame --------------------------------------------------------------------------------
  function update(dt, renderTime, { selfPos = null, selfYaw = 0, selfMoving = 0, targetId = null, hoverId = null, sample = null, speed = null } = {}) {
    if (queue.length) { const a = queue.shift(); if (actors.has(a.id)) build(a); }
    const now = performance.now();
    for (const a of actors.values()) {
      if (a.self && selfPos) {
        a.pos.set(selfPos.x, selfPos.y, selfPos.z);
        a.yaw += angleDelta(a.yaw, selfYaw) * Math.min(1, dt * 16);
        a.speed = selfMoving;
      } else {
        const s = a.still || (sample ? sample(a.id, renderTime) : null);
        if (s) {
          a.pos.set(s.x, s.y, s.z);
          // Turn smoothly toward the sampled facing (sample yaw already interpolates; this hides 3 Hz far updates).
          a.yaw += angleDelta(a.yaw, s.yaw) * Math.min(1, dt * 12);
        }
        a.speed = a.still ? 0 : speed ? speed(a.id, renderTime) : 0;
      }
      // Hit recoil and punch decay.
      a.recoil.multiplyScalar(Math.exp(-dt * 10));
      a.punch *= Math.exp(-dt * 12);
      a.group.position.set(a.pos.x + a.recoil.x, a.pos.y, a.pos.z + a.recoil.z);
      if (a.model) { a.model.rotation.y = a.yaw; a.model.scale.setScalar(1 + a.punch * 0.12); }

      // Animation.
      let want;
      if (a.dead) want = 'dead';
      else if (a.oneShot && now < a.oneShotUntil) want = a.oneShot;
      else {
        a.oneShot = null;
        const sp = a.speed;
        want = sp > 4.2 ? 'run' : sp > 0.4 ? 'walk' : (a.kind === 'player' && now - (a.lastCombat || 0) < 5000 ? 'ready' : 'idle');
      }
      if (want !== a.anim) setAnim(a, want);
      if (a.body?.setRate) {
        if (a.kind === 'player') {
          const run = a.anim === 'run';
          a.body.setRate(a.anim === 'run' || a.anim === 'walk' ? Math.max(0.5, a.speed * (run ? 0.65 : 1.05) / (run ? 3.4 : 2.0)) : 1);
        } else a.body.setRate(a.anim === 'run' ? Math.max(0.6, a.speed / 5.2) : a.anim === 'walk' ? Math.max(0.5, a.speed / 1.5) : 1);
      }
      a.body?.update(dt, now / 1000);

      // Corpses fade and sink after a while (monsters only; players stand back up on respawn).
      if (a.dead && a.kind === 'monster' && a.deathAt && now - a.deathAt > 9000) {
        a.fade = Math.max(0, 1 - (now - a.deathAt - 9000) / 2500);
        a.group.position.y -= (1 - a.fade) * 0.8;
      } else a.fade = 1;
    }
    // Rings.
    const ta = targetId != null ? actors.get(targetId) : null;
    targetRing.visible = !!ta && ta.fade > 0.1;
    if (ta) { const r = ta.kind === 'monster' ? 1.0 * Math.max(0.9, (ta.creature?.size || 1)) : 0.75; targetRing.position.set(ta.group.position.x, ta.group.position.y + 0.06, ta.group.position.z); targetRing.scale.setScalar(r * (1 + Math.sin(now / 180) * 0.03)); targetRing.material.color.set(ta.hostile ? '#ff4a3a' : '#7fe08a'); }
    const ha = hoverId != null && hoverId !== targetId ? actors.get(hoverId) : null;
    hoverRing.visible = !!ha;
    if (ha) { hoverRing.position.set(ha.group.position.x, ha.group.position.y + 0.05, ha.group.position.z); hoverRing.scale.setScalar(ha.kind === 'monster' ? 1 : 0.75); }
    updatePlates(targetId, hoverId);
  }

  // --- events -----------------------------------------------------------------------------------
  function playAttack(id, targetId) {
    const a = actors.get(id); if (!a || a.dead) return;
    const t = actors.get(targetId);
    if (t && !a.self) a.yaw = Math.atan2(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
    a.oneShot = 'attack'; a.oneShotUntil = performance.now() + (a.kind === 'monster' ? 650 : 600);
    a.lastCombat = performance.now();
    setAnim(a, 'attack');
  }
  function playHit(id, fromId, amount) {
    const a = actors.get(id); if (!a) return;
    const src = actors.get(fromId);
    if (src && amount > 0) {
      const dx = a.pos.x - src.pos.x, dz = a.pos.z - src.pos.z, d = Math.hypot(dx, dz) || 1;
      a.recoil.set(dx / d * 0.28, 0, dz / d * 0.28);
    }
    a.punch = amount > 0 ? 1 : 0.3;
    a.lastCombat = performance.now();
    if (!a.dead && amount > 0 && a.kind === 'player' && (!a.oneShot || a.oneShot === 'hit')) { a.oneShot = 'hit'; a.oneShotUntil = performance.now() + 380; }
  }
  function setDead(id, dead) {
    const a = actors.get(id); if (!a) return;
    a.dead = dead; if (dead) { a.hp = 0; a.deathAt = performance.now(); a.oneShot = null; } else { a.deathAt = 0; a.fade = 1; }
    refreshPlate(a);
  }
  function setHp(id, hp, hpMax) { const a = actors.get(id); if (!a) return; if (hp != null) a.hp = hp; if (hpMax != null) a.hpMax = hpMax; refreshPlate(a); }

  /** Pick the actor under a screen point (NDC). Uses a fat vertical capsule test so small wolves are easy to click. */
  const _ray = new THREE.Raycaster(), _p = new THREE.Vector3(), _c = new THREE.Vector3();
  function pickAt(ndc, { exclude = null } = {}) {
    _ray.setFromCamera(ndc, camera);
    let best = null, bestT = Infinity;
    for (const a of actors.values()) {
      if (a.id === exclude || a.fade < 0.3) continue;
      const r = a.kind === 'monster' ? 0.9 * (a.creature?.size || 1) : 0.6;
      // Closest approach between the ray and the actor's vertical segment.
      for (let k = 0; k <= 2; k++) {
        _c.set(a.group.position.x, a.group.position.y + (a.height * (0.2 + k * 0.35)), a.group.position.z);
        const t = _p.subVectors(_c, _ray.ray.origin).dot(_ray.ray.direction);
        if (t < 0) continue;
        const d = _ray.ray.at(t, _p).distanceTo(_c);
        if (d < r && t < bestT) { bestT = t; best = a; }
      }
    }
    return best;
  }

  /** A room change gives the same body a new id: keep the model, move the key. */
  function rekey(oldId, newId) {
    const a = actors.get(oldId); if (!a || oldId === newId) return a;
    actors.delete(oldId); a.id = newId; a.group.userData.actorId = newId; actors.set(newId, a);
    return a;
  }

  /** A speech bubble over someone's head (say chat), for a few seconds scaled to the line's length. */
  function say(id, text) {
    const a = actors.get(id); if (!a?.plate) return;
    const p = a.plate;
    p.bubble.textContent = text; p.bubble.style.display = '';
    p.bubbleUntil = performance.now() + Math.min(9000, 3500 + text.length * 60);
    p.root.classList.toggle('self-plate', !!a.self);
  }

  return { actors, add, remove, rekey, say, update, playAttack, playHit, setDead, setHp, pickAt, get: id => actors.get(id), refreshPlate };
}
