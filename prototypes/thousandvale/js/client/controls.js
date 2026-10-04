// Third-person camera and the controls that drive your character.
//
// Keys:   W A S D / arrows   move (camera-relative)      Shift (hold)   sprint      Space   jump
//         Tab                next enemy in front          1 / F          attack the target
//         Esc                clear target / stop          Enter          chat        R   rise (when fallen)
//         Mouse wheel        zoom                         Q / E          turn the camera
// Mouse:  left click         select (an enemy: select; the ground: walk there)
//         right click        on an enemy: attack it (walks into range first) — on the ground: walk there
//         drag (either)      orbit the camera; right-drag also turns you to face where the camera looks
//
// Pure-ish: no three.js import; it is handed a camera and a heightAt. The step function `intent()` is
// what the game loop samples once per sim step to build an input message.

export function createControls({ dom, camera, heightAt, onSelect, onAttack, onCycleTarget, onClearTarget, onChat, onPickGround, getTarget, onRise }) {
  const keys = new Set();
  const cam = { yaw: Math.PI, pitch: 0.38, dist: 9, distWant: 9, focus: { x: 0, y: 0, z: 0 }, ready: false };
  let drag = null, moveGoal = null, chase = null, typing = false, facing = Math.PI, jumpQueued = false;

  const isTyping = () => typing || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName));

  window.addEventListener('keydown', e => {
    if (isTyping()) return;
    const k = e.code;
    if (k === 'Tab') { e.preventDefault(); onCycleTarget?.(); return; }
    if (k === 'Enter') { e.preventDefault(); onChat?.(); return; }
    if (k === 'Escape') { moveGoal = null; chase = null; onClearTarget?.(); return; }
    if (k === 'Space') { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
    if (k === 'KeyR') { onRise?.(); return; }
    if (k === 'Digit1' || k === 'KeyF') { e.preventDefault(); const t = getTarget?.(); if (t != null) { chase = t; onAttack?.(t); } return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { moveGoal = null; chase = null; }
    keys.add(k);
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  dom.addEventListener('contextmenu', e => e.preventDefault());
  dom.addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, button: e.button, moved: 0, id: e.pointerId };
    dom.setPointerCapture?.(e.pointerId);
  });
  dom.addEventListener('pointermove', e => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 4) {
      cam.yaw -= dx * 0.0055;
      cam.pitch = Math.max(-0.25, Math.min(1.25, cam.pitch + dy * 0.0045));
      if (drag.button === 2) facing = cam.yaw;
    }
  });
  dom.addEventListener('pointerup', e => {
    if (!drag) return;
    const d = drag; drag = null;
    dom.releasePointerCapture?.(e.pointerId);
    if (d.moved > 6) return;   // it was a camera drag, not a click
    const r = dom.getBoundingClientRect();
    const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    const hit = onSelect?.(ndc, d.button);   // returns { id, hostile } or null
    if (hit) {
      if (d.button === 2 && hit.hostile) { chase = hit.id; moveGoal = null; onAttack?.(hit.id); }
      return;
    }
    const g = onPickGround?.(ndc);
    if (g) { moveGoal = { x: g.x, z: g.z }; chase = null; }
  });
  dom.addEventListener('wheel', e => { e.preventDefault(); cam.distWant = Math.max(2.8, Math.min(26, cam.distWant * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

  /**
   * One movement intent for this sim step. `self` = { x, z }, `targetPos` = where the chased enemy is.
   * Returns { mx, mz, yaw, run, attacking }.
   */
  function intent(self, { targetPos = null, reach = 2.9, dead = false } = {}) {
    if (dead) { moveGoal = null; chase = null; jumpQueued = false; return { mx: 0, mz: 0, yaw: facing, b: 0 }; }
    let fx = 0, fz = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx -= 1;
    if (keys.has('KeyQ')) cam.yaw += 0.045;
    if (keys.has('KeyE')) cam.yaw -= 0.045;
    // Camera forward on the ground = direction from camera to player.
    const cf = { x: Math.sin(cam.yaw), z: Math.cos(cam.yaw) };
    const cr = { x: Math.cos(cam.yaw), z: -Math.sin(cam.yaw) };
    let mx = cf.x * fz + cr.x * fx, mz = cf.z * fz + cr.z * fx;
    let inRange = false;
    if (!mx && !mz) {
      if (chase != null && targetPos) {
        const dx = targetPos.x - self.x, dz = targetPos.z - self.z, d = Math.hypot(dx, dz);
        if (d > reach) { mx = dx / d; mz = dz / d; } else { inRange = true; facing = Math.atan2(dx, dz); }
      } else if (moveGoal) {
        const dx = moveGoal.x - self.x, dz = moveGoal.z - self.z, d = Math.hypot(dx, dz);
        if (d < 0.5) moveGoal = null; else { mx = dx / d; mz = dz / d; }
      }
    }
    const len = Math.hypot(mx, mz);
    if (len > 1e-3) { mx /= len; mz /= len; if (!(fz < 0 && fx === 0)) facing = Math.atan2(mx, mz); else facing = cam.yaw; }
    if (chase != null && !targetPos) chase = null;
    const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const b = (sprint && len > 1e-3 ? 1 : 0) | (jumpQueued ? 2 : 0);   // IN.SPRINT = 1, IN.JUMP = 2
    jumpQueued = false;
    return { mx, mz, yaw: facing, b, sprint, inRange, chasing: chase };
  }

  /** Place the camera behind `p` (the drawn player position). Keeps it above the ground. */
  function updateCamera(p, dt, height = 1.7) {
    const k = cam.ready ? 1 - Math.exp(-dt * 14) : 1;
    cam.focus.x += (p.x - cam.focus.x) * k;
    cam.focus.y += (p.y + height - cam.focus.y) * (cam.ready ? 1 - Math.exp(-dt * 8) : 1);
    cam.focus.z += (p.z - cam.focus.z) * k;
    cam.ready = true;
    cam.dist += (cam.distWant - cam.dist) * (1 - Math.exp(-dt * 10));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let d = cam.dist;
    let x = cam.focus.x - Math.sin(cam.yaw) * cp * d, z = cam.focus.z - Math.cos(cam.yaw) * cp * d, y = cam.focus.y + sp * d;
    // Pull in if the ground is between us and the player; never below the ground at the camera's spot.
    for (let i = 1; i <= 8; i++) {
      const t = i / 8, sx = cam.focus.x + (x - cam.focus.x) * t, sz = cam.focus.z + (z - cam.focus.z) * t, sy = cam.focus.y + (y - cam.focus.y) * t;
      if (heightAt(sx, sz) + 0.4 > sy) { d = Math.max(1.5, d * (t - 0.08)); x = cam.focus.x - Math.sin(cam.yaw) * cp * d; z = cam.focus.z - Math.cos(cam.yaw) * cp * d; y = cam.focus.y + sp * d; break; }
    }
    y = Math.max(y, heightAt(x, z) + 0.6);
    camera.position.set(x, y, z);
    camera.lookAt(cam.focus.x, cam.focus.y, cam.focus.z);
  }

  return {
    cam, intent, updateCamera,
    setTyping(v) { typing = v; if (v) keys.clear(); },
    stopChase() { chase = null; },
    attack(id) { chase = id; moveGoal = null; onAttack?.(id); },
    walkTo(x, z) { moveGoal = { x, z }; chase = null; },
    stop() { moveGoal = null; chase = null; },
    setHeightAt(f) { heightAt = f; },
    setFacing(y) { facing = y; },
    get chasing() { return chase; },
    get moveGoal() { return moveGoal; },
  };
}
