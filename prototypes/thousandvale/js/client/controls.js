// Third-person camera and the controls that drive your character.
//
// Keys:   W A S D / arrows   move (camera-relative; you RUN — play-test 8 W20)      Shift (hold)   walk      Space   jump
//         Num Lock        auto-run on / off (any move key, a click or Esc ends it)
//         Tab                next enemy in front          1 / F          attack the target
//         Esc                clear target / stop          Enter          chat        R   rise (when fallen)
//         Mouse wheel        zoom                         Q / E          turn the camera
// Mouse:  left click         select (an enemy: select; the ground: walk there)
//         right click        on an enemy: attack it (walks into range first) — on the ground: walk there
//                            on anyone else (or Shift + right-click on an enemy): their menu (play-test 2 Q2)
//         drag (either)      orbit the camera; right-drag also turns you to face where the camera looks
//
// Pure-ish: no three.js import; it is handed a camera and a heightAt. The step function `intent()` is
// what the game loop samples once per sim step to build an input message.

/** A stick pushed less than this far (0..1) walks; further runs (W20). */
export const WALK_BELOW = 0.6;
/**
 * W20 — do you run this step? Pure. `shift` = the walk key is held; `analog` = the stick record (may carry `walk` or the
 * older `sprint` flag outright); `stickLen` = how far the stick is pushed when the stick alone is steering (null = keys).
 */
export function wantsRun({ shift = false, analog = null, stickLen = null } = {}) {
  if (shift) return false;
  if (analog && analog.walk != null) return !analog.walk;
  if (analog && analog.sprint === true) return true;
  if (stickLen != null && stickLen > 1e-3) return stickLen >= WALK_BELOW;
  return true;
}

export function createControls({ dom, camera, heightAt, onSelect, onAttack, onCycleTarget, onClearTarget, onChat, onPickGround, getTarget, onRise, onSkill, onContext, onAutorun }) {
  const keys = new Set();
  const cam = { yaw: Math.PI, pitch: 0.38, dist: 9, distWant: 9, focus: { x: 0, y: 0, z: 0 }, ready: false };
  let blocker = null;
  let drag = null, moveGoal = null, chase = null, typing = false, facing = Math.PI, jumpQueued = false;
  let autorun = false;   // W20: keep going forward until a move key, a click-to-move, Esc or a second press
  let held = false;      // W26: the mount call — nothing moves, and what was asked for is kept for afterwards
  let analog = null;   // T27 (stream G): a stick's vector from js/client/input (gamepad, the phone's thumb stick) — null = keys only

  const isTyping = () => typing || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName));

  window.addEventListener('keydown', e => {
    if (isTyping()) return;
    const k = e.code;
    if (k === 'Tab') { e.preventDefault(); onCycleTarget?.(); return; }
    if (k === 'Enter') { e.preventDefault(); onChat?.(); return; }
    if (k === 'Escape') { moveGoal = null; chase = null; autorun = false; onClearTarget?.(); return; }
    if (k === 'NumLock') { e.preventDefault(); if (!e.repeat) { autorun = !autorun; if (autorun) { moveGoal = null; chase = null; } onAutorun?.(autorun); } return; }
    if (k === 'Space') { e.preventDefault(); if (!e.repeat) jumpQueued = true; return; }
    if (k === 'KeyR') { onRise?.(); return; }
    if (k === 'KeyF') { e.preventDefault(); const t = getTarget?.(); if (t != null) { chase = t; onAttack?.(t); } return; }
    if (/^Digit[1-6]$/.test(k)) { e.preventDefault(); onSkill?.(+k.slice(5)); return; }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) { moveGoal = null; chase = null; if (autorun && (k === 'KeyW' || k === 'KeyS' || k === 'ArrowUp' || k === 'ArrowDown')) { autorun = false; onAutorun?.(false); } }
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
      // play-test 2 Q2: right-click a friend / town folk / corpse = the menu; an enemy is still attacked (Shift = menu)
      if (d.button === 2 && hit.hostile && !e.shiftKey) { chase = hit.id; moveGoal = null; onAttack?.(hit.id); }
      else if (d.button === 2) onContext?.(hit.id, e.clientX, e.clientY);
      return;
    }
    const g = onPickGround?.(ndc);
    if (g) { moveGoal = { x: g.x, z: g.z }; chase = null; if (autorun) { autorun = false; onAutorun?.(false); } }
  });
  dom.addEventListener('wheel', e => { e.preventDefault(); cam.distWant = Math.max(2.8, Math.min(26, cam.distWant * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

  /**
   * One movement intent for this sim step. `self` = { x, z }, `targetPos` = where the chased enemy is.
   * Returns { mx, mz, yaw, run, attacking }.
   */
  function intent(self, { targetPos = null, reach = 2.9, dead = false } = {}) {
    if (dead) { moveGoal = null; chase = null; autorun = false; jumpQueued = false; return { mx: 0, mz: 0, yaw: facing, b: 0 }; }
    // W26: while the mount is being called you stand still. Held keys, the stick, auto-run and a click-to-move goal are all
    // KEPT (nothing is cleared), so the moment the hold ends you carry on to where you were headed.
    if (held) { jumpQueued = false; return { mx: 0, mz: 0, yaw: facing, b: 0, held: true }; }
    let fx = 0, fz = 0;
    if (autorun) fz += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) fz += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) fz -= 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) fx += 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) fx -= 1;
    if (keys.has('KeyQ')) cam.yaw += 0.045;
    if (keys.has('KeyE')) cam.yaw -= 0.045;
    if (analog && (analog.mx || analog.mz)) { fz += analog.mz; fx -= analog.mx; moveGoal = null; chase = null; if (autorun && analog.mz < -0.5) { autorun = false; onAutorun?.(false); } }   // stick: x right, z forward
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
    // W20: you run unless you ask to walk — Shift held, or a stick pushed less than `WALK_BELOW` of the way (a stick that
    // says `sprint`/`walk` itself wins). "Run" is the server's IN.SPRINT pace; walking is its plain one.
    const sprint = wantsRun({ shift: keys.has('ShiftLeft') || keys.has('ShiftRight'), analog, stickLen: analog && !keysMove() ? Math.hypot(analog.mx || 0, analog.mz || 0) : null });
    const b = (sprint && len > 1e-3 ? 1 : 0) | (jumpQueued ? 2 : 0);   // IN.SPRINT = 1, IN.JUMP = 2
    jumpQueued = false;
    return { mx, mz, yaw: facing, b, sprint, inRange, chasing: chase };
  }

  const keysMove = () => autorun || ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(k => keys.has(k));

  /** Place the camera behind `p` (the drawn player position). Keeps it above the ground. */
  function updateCamera(p, dt, height = 1.7) {
    const k = cam.ready ? 1 - Math.exp(-dt * 14) : 1;
    if (analog && (analog.camX || analog.camY)) { cam.yaw -= analog.camX * dt * 2.6; cam.pitch = Math.max(-0.25, Math.min(1.25, cam.pitch + analog.camY * dt * 1.5)); }   // right stick
    if (analog && analog.zoom) cam.distWant = Math.max(2.8, Math.min(26, cam.distWant * (1 - analog.zoom * dt * 1.6)));
    cam.focus.x += (p.x - cam.focus.x) * k;
    cam.focus.y += (p.y + height - cam.focus.y) * (cam.ready ? 1 - Math.exp(-dt * 8) : 1);
    cam.focus.z += (p.z - cam.focus.z) * k;
    cam.ready = true;
    cam.dist += (cam.distWant - cam.dist) * (1 - Math.exp(-dt * 10));
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let d = cam.dist;
    let x = cam.focus.x - Math.sin(cam.yaw) * cp * d, z = cam.focus.z - Math.cos(cam.yaw) * cp * d, y = cam.focus.y + sp * d;
    // Pull in if the ground — or a building, wall or big rock (setBlocker) — is between us and the player.
    // In fast (never look through a wall), back out slowly (no popping when you walk past a corner).
    let hitT = 1;
    for (let i = 1; i <= 12; i++) {
      const t = i / 12, sx = cam.focus.x + (x - cam.focus.x) * t, sz = cam.focus.z + (z - cam.focus.z) * t, sy = cam.focus.y + (y - cam.focus.y) * t;
      if (heightAt(sx, sz) + 0.4 > sy) { hitT = t - 0.08; break; }
    }
    if (blocker) hitT = Math.min(hitT, blocker(cam.focus.x, cam.focus.y, cam.focus.z, x, y, z) - 0.04);
    const want = Math.max(1.2, d * Math.max(0, hitT));
    cam.eff = cam.eff == null ? want : want < cam.eff ? want : cam.eff + (want - cam.eff) * (1 - Math.exp(-dt * 2.5));
    d = Math.min(d, cam.eff);
    x = cam.focus.x - Math.sin(cam.yaw) * cp * d; z = cam.focus.z - Math.cos(cam.yaw) * cp * d; y = cam.focus.y + sp * d;
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
    stop() { moveGoal = null; chase = null; autorun = false; },
    /** W20: auto-run on / off (the Num Lock key does the same). */
    setAutorun(v) { autorun = !!v; if (autorun) { moveGoal = null; chase = null; } onAutorun?.(autorun); },
    get autorun() { return autorun; },
    /** W26: hold still (the mount call). Nothing asked for is forgotten; `hold(false)` lets it all through again. */
    hold(v) { held = !!v; },
    get held() { return held; },
    setHeightAt(f) { heightAt = f; },
    /** fn(ax, ay, az, bx, by, bz) -> 0..1, how far along focus->camera the first solid starts (solids.js firstHit). */
    setBlocker(f) { blocker = f; },
    setFacing(y) { facing = y; },
    /** T27: { mx, mz, camX, camY, sprint, zoom } from a stick (-1..1 each; mz forward, mx right), added to the keys. null = none. */
    setAnalog(a) { analog = a || null; },
    get chasing() { return chase; },
    get moveGoal() { return moveGoal; },
  };
}
