// RTS camera, one per viewport (PLAN §17).
//
// Perspective, pitch ~56 deg, FOV 38. Two modes:
//   follow — tracks the hero, leaning a little toward the cursor (or right stick),
//   free   — edge-pan / middle-drag / arrow keys move it; Space (centre) snaps back to follow.
// 3 zoom steps, clamped to a rectangle (your field). `up` is the screen-up direction on the ground
// (the way enemies come from), so the Keep sits at the bottom of the screen whatever the world axes.

import * as THREE from 'three';

const ZOOMS = [28, 38, 58];          // middle zoom closer + pitch 50 (stream C bench: Chibi 2 bodies read as hats at 56 deg / 50 m)          // distance from target, metres

/** opts.zooms: distance steps (spectators get a far step to see a whole field or forest). */
export function createRtsCamera({ fov = 38, pitchDeg = 50, zooms = ZOOMS } = {}) {
  const ZS = zooms;
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 600);
  const target = new THREE.Vector3();          // smoothed look-at point on the ground
  const goal = new THREE.Vector3();            // where target is heading
  const lead = new THREE.Vector3();
  const up = new THREE.Vector2(0, -1);         // screen-up on the ground (x, z)
  const bounds = { x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 };
  let zoomIndex = 1;
  let dist = ZS[zoomIndex];
  let mode = 'follow';
  let pitch = THREE.MathUtils.degToRad(pitchDeg);
  let shake = 0;

  function clampGoal() {
    goal.x = Math.min(bounds.x1, Math.max(bounds.x0, goal.x));
    goal.z = Math.min(bounds.z1, Math.max(bounds.z0, goal.z));
  }

  function place() {
    // Camera sits behind the target, opposite to `up`, raised by pitch.
    const back = new THREE.Vector3(-up.x, 0, -up.y);
    const h = Math.sin(pitch) * dist, d = Math.cos(pitch) * dist;
    camera.position.set(target.x + back.x * d, target.y + h, target.z + back.z * d);
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(target);
  }

  // Screen-space axes on the ground for panning.
  function rightVec() { return new THREE.Vector2(-up.y, up.x); }

  return {
    camera,
    get mode() { return mode; },
    get zoom() { return zoomIndex; },
    target,
    setUp(x, z) { const l = Math.hypot(x, z) || 1; up.set(x / l, z / l); },
    setBounds(b) { Object.assign(bounds, b); clampGoal(); },
    /** Snap immediately (match start). */
    snapTo(x, z) { goal.set(x, 0, z); clampGoal(); target.copy(goal); place(); },
    centre() { mode = 'follow'; },
    /** Look at a point and stop following (minimap click). */
    lookAt(x, z) { mode = 'free'; goal.set(x, 0, z); clampGoal(); },
    zoomBy(step) {
      zoomIndex = Math.max(0, Math.min(ZS.length - 1, zoomIndex + step));
    },
    /**
     * Per-frame update.
     * @param dt seconds
     * @param o.follow {x,z} hero position or null (dead)
     * @param o.leadPoint {x,z} ground point under the cursor (or stick aim) for the soft lead
     * @param o.pan {x,y} screen pan input -1..1 (edge pan / arrows), o.drag {dx,dy} pixels
     */
    update(dt, { follow = null, leadPoint = null, pan = null, drag = null, viewportH = 800 } = {}) {
      const r = rightVec();
      const panSpeed = dist * 1.4;
      let panned = false;
      if (pan && (pan.x || pan.y)) {
        goal.x += (r.x * pan.x + up.x * pan.y) * panSpeed * dt;
        goal.z += (r.y * pan.x + up.y * pan.y) * panSpeed * dt;
        panned = true;
      }
      if (drag && (drag.dx || drag.dy)) {
        const k = dist / viewportH * 1.6;
        goal.x -= (r.x * drag.dx - up.x * drag.dy) * k;
        goal.z -= (r.y * drag.dx - up.y * drag.dy) * k;
        panned = true;
      }
      if (panned) mode = 'free';
      if (mode === 'follow' && follow) {
        lead.set(0, 0, 0);
        if (leadPoint) {
          lead.set(leadPoint.x - follow.x, 0, leadPoint.z - follow.z);
          const l = lead.length(), maxLead = dist * 0.18;
          if (l > maxLead) lead.multiplyScalar(maxLead / l);
          lead.multiplyScalar(0.4);
        }
        // Nudge the target a little behind the hero: the bottom control bar covers the lower screen.
        goal.set(follow.x + lead.x - up.x * dist * 0.04, 0, follow.z + lead.z - up.y * dist * 0.04);
      }
      clampGoal();
      const k = 1 - Math.exp(-dt * (mode === 'follow' ? 6 : 12));
      target.lerp(goal, k);
      dist += (ZS[zoomIndex] - dist) * (1 - Math.exp(-dt * 8));
      shake = Math.max(0, shake - dt * 3);
      place();
    },
    kick(amount = 0.4) { shake = Math.max(shake, amount); },
    /** Ray from viewport-local CSS px to the ground plane y=0. Returns {x,z} or null. */
    groundAt(px, py, rect) {
      const ndc = new THREE.Vector2((px / rect.w) * 2 - 1, -(py / rect.h) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, camera);
      const o = ray.ray.origin, d = ray.ray.direction;
      if (Math.abs(d.y) < 1e-6) return null;
      const t = -o.y / d.y;
      if (t < 0) return null;
      return { x: o.x + d.x * t, z: o.z + d.z * t };
    },
    /** World -> viewport-local CSS px (for floating numbers, HP bars, gate previews). */
    project(x, y, z, rect, out = {}) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      out.x = (v.x + 1) / 2 * rect.w + rect.x;
      out.y = (1 - v.y) / 2 * rect.h + rect.y;
      out.visible = v.z < 1 && v.z > -1;
      return out;
    },
  };
}
