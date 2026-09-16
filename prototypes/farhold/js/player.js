// Farhold — walking about: the third-person controller and the camera that follows it.
//
// Keyboard and mouse go in, a position on the planet comes out. The controller never touches the
// renderer; `main.js` reads `player.x/y/z/yaw` and moves the character model. Gravity is the
// planet's own, so a light world really does let you jump higher.

import * as THREE from 'three';

export const KEY_HELP = 'WASD move · Shift run · Space jump · Left click attack · I character sheet · Esc release mouse';

/** Reads the keyboard and mouse. Pointer lock is optional — dragging works too. */
export function createInput(dom) {
  const keys = new Set();
  const state = { forward: 0, strafe: 0, run: false, jump: false, attack: false, look: [0, 0], locked: false };
  const down = e => {
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  };
  const up = e => keys.delete(e.code);
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', () => keys.clear());

  let dragging = false;
  const move = e => {
    if (!state.locked && !dragging) return;
    state.look[0] += e.movementX || 0;
    state.look[1] += e.movementY || 0;
  };
  dom.addEventListener('mousemove', move);
  dom.addEventListener('mousedown', e => { if (e.button === 0) { dragging = true; state.attack = true; } });
  window.addEventListener('mouseup', () => { dragging = false; });
  dom.addEventListener('click', () => { if (!state.locked) dom.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { state.locked = document.pointerLockElement === dom; });

  return {
    state, keys,
    /** Read the keys into the state and hand back a snapshot for this frame. */
    sample() {
      state.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      state.strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      state.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      state.jump = keys.has('Space');
      const snapshot = { ...state, look: [state.look[0], state.look[1]] };
      state.look[0] = 0; state.look[1] = 0;
      state.attack = false;
      return snapshot;
    },
    dispose() {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      dom.removeEventListener('mousemove', move);
    },
  };
}

/**
 * The player's body and the camera behind it.
 * `terrain` is a planet.js terrain; `balance` is data/balance.json.
 */
export function createController(terrain, balance = {}, camera) {
  const b = balance.player || {};
  const gravity = 9.81 * (terrain.planet?.gravity ?? 1);
  const spawn = terrain.spawnPoint();

  const self = {
    x: spawn.x, z: spawn.z, y: spawn.height,
    vy: 0, yaw: 0, pitch: -0.22, grounded: true,
    camDistance: 7.5, moving: 0, running: false,
    attackCooldown: 0, swing: 0,
  };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const camOffset = new THREE.Vector3();

  /**
   * One step. `input` is a snapshot from createInput().sample(); `dt` is seconds.
   * Returns what happened so main.js can pick an animation and fire an attack.
   */
  function update(dt, input, { frozen = false } = {}) {
    const out = { attacked: false, landed: false };
    if (input) {
      self.yaw -= input.look[0] * 0.0026;
      self.pitch = Math.max(-1.15, Math.min(0.75, self.pitch - input.look[1] * 0.0022));
    }
    if (self.attackCooldown > 0) self.attackCooldown -= dt;
    if (self.swing > 0) self.swing -= dt;

    let speed = 0;
    if (!frozen && input && (input.forward || input.strafe)) {
      const base = b.moveSpeed ?? 5.4;
      speed = base * (input.run ? (b.runMultiplier ?? 2.1) : 1);
      // walking uphill is slower, walking down is not faster
      const steep = terrain.slopeAt(self.x, self.z, 2);
      speed *= 1 / (1 + Math.max(0, steep) * 1.6);
      forward.set(Math.sin(self.yaw), 0, Math.cos(self.yaw));
      right.set(forward.z, 0, -forward.x);
      const dx = forward.x * input.forward + right.x * input.strafe;
      const dz = forward.z * input.forward + right.z * input.strafe;
      const len = Math.hypot(dx, dz) || 1;
      self.x += (dx / len) * speed * dt;
      self.z += (dz / len) * speed * dt;
      [self.x, self.z] = terrain.clampToWorld(self.x, self.z);
    }
    self.moving = speed;
    self.running = !!(input && input.run && speed > 0);

    // gravity and the ground
    const ground = terrain.heightAt(self.x, self.z);
    if (!frozen && input?.jump && self.grounded) {
      self.vy = (b.jumpSpeed ?? 6.4) * Math.sqrt(Math.max(0.25, terrain.planet?.gravity ?? 1));
      self.grounded = false;
    }
    self.vy -= gravity * dt;
    self.y += self.vy * dt;
    if (self.y <= ground) {
      if (!self.grounded) out.landed = true;
      self.y = ground; self.vy = 0; self.grounded = true;
    } else {
      self.grounded = false;
    }

    // swinging
    if (!frozen && input?.attack && self.attackCooldown <= 0) {
      self.attackCooldown = b.attackEvery ?? 0.62;
      self.swing = 0.35;
      out.attacked = true;
      // face where the camera is looking when you swing
    }

    // camera: behind and above, pulled in if the ground is in the way
    const dist = self.camDistance * (1 - self.pitch * 0.25);
    camOffset.set(-Math.sin(self.yaw), 0, -Math.cos(self.yaw)).multiplyScalar(Math.cos(self.pitch) * dist);
    let camX = self.x + camOffset.x;
    let camZ = self.z + camOffset.z;
    let camY = self.y + 1.9 - Math.sin(self.pitch) * dist;
    const clearance = terrain.heightAt(camX, camZ) + 1.1;
    if (camY < clearance) camY = clearance;
    camera.position.set(camX, camY, camZ);
    camera.lookAt(self.x, self.y + 1.15, self.z);

    return out;
  }

  /** Drop the player somewhere else on the planet (used by the map and the tests). */
  function teleport(x, z) {
    [self.x, self.z] = terrain.clampToWorld(x, z);
    self.y = terrain.heightAt(self.x, self.z);
    self.vy = 0; self.grounded = true;
  }

  return Object.assign(self, { update, teleport, get spawn() { return spawn; } });
}
