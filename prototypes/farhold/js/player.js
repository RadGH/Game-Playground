// Farhold — walking about: the third-person controller and the camera that follows it.
//
// Keyboard and mouse go in, a position on the planet comes out. The controller never touches the
// renderer; `main.js` reads `player.x/y/z/yaw` and moves the character model. Gravity is the
// planet's own, so a light world really does let you jump higher.
//
// It also handles what you are standing in: deep water makes you swim, solid things stop you
// walking through them, and `H` puts you on a horse.

import * as THREE from 'three';

export const KEY_HELP = 'WASD move · Shift run · Space jump · click attack · 1-4 skills · E talk · H horse · J ship · M map · I sheet · O settings · ` debug';

/** Reads the keyboard and mouse. Pointer lock is optional — dragging works too. */
export function createInput(dom) {
  const keys = new Set();
  const state = { forward: 0, strafe: 0, run: false, jump: false, attack: false, look: [0, 0], locked: false };
  const pressed = new Set();
  const down = e => {
    if (e.repeat) return;
    keys.add(e.code);
    pressed.add(e.code);
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
    /** Was this key pressed since the last sample? Cleared by sample(). */
    tapped: code => pressed.has(code),
    sample() {
      state.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      state.strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      state.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      state.jump = keys.has('Space');
      const snapshot = { ...state, look: [state.look[0], state.look[1]], pressed: new Set(pressed) };
      state.look[0] = 0; state.look[1] = 0;
      state.attack = false;
      pressed.clear();
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
 * `obstacles` is a list of ObstacleField (props, buildings) to be pushed out of.
 */
export function createController(terrain, balance = {}, camera, { obstacles = [], settings = null } = {}) {
  const b = balance.player || {};
  // live settings: which shoulder, inverted look, how fast the mouse turns
  const opt = (key, fallback) => (settings ? settings.get(key) : fallback);
  const gravity = 9.81 * (terrain.planet?.gravity ?? 1);
  const spawn = terrain.spawnPoint();

  const self = {
    x: spawn.x, z: spawn.z, y: spawn.height,
    vy: 0, yaw: 0, pitch: -0.18, grounded: true,
    camDistance: 7.5, camDistanceUsed: 7.5, moving: 0, running: false,
    attackCooldown: 0, swing: 0,
    swimming: false, waterDepth: 0, waterSurface: 0,
    mounted: false,
    radius: b.bodyRadius ?? 0.45,
  };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const resolved = [0, 0];

  /** Push out of anything solid, unless riding (a horse shoulders through undergrowth). */
  function unstick(x, z) {
    let ox = x, oz = z;
    for (const field of obstacles) {
      if (!field) continue;
      field.resolve(ox, oz, self.radius, resolved);
      ox = resolved[0]; oz = resolved[1];
    }
    return [ox, oz];
  }

  /**
   * One step. `input` is a snapshot from createInput().sample(); `dt` is seconds.
   * Returns what happened so main.js can pick an animation and fire an attack.
   */
  function update(dt, input, { frozen = false } = {}) {
    const out = { attacked: false, landed: false, mountChanged: false, enteredWater: false };
    if (input) {
      const sens = opt('sensitivity', 1);
      const invert = opt('invertY', false) ? 1 : -1;
      self.yaw -= input.look[0] * 0.0026 * sens;
      // positive pitch looks up. The old ceiling of 0.75 rad stopped you seeing the sky directly
      // overhead, which is the point of being on a planet with a system above it.
      self.pitch = Math.max(-1.25, Math.min(1.45, self.pitch + input.look[1] * 0.0022 * sens * invert));
      // H mounts and dismounts — but you cannot ride while swimming
      if (!frozen && input.pressed?.has('KeyH') && !self.swimming) {
        self.mounted = !self.mounted;
        out.mountChanged = true;
      }
    }
    if (self.attackCooldown > 0) self.attackCooldown -= dt;
    if (self.swing > 0) self.swing -= dt;

    // --- what am I standing in?
    const water = terrain.waterAt(self.x, self.z);
    const wasSwimming = self.swimming;
    const swimDepth = b.swimDepth ?? 1.3;
    self.waterDepth = water ? water.depth : 0;
    self.waterSurface = water ? water.surface : 0;
    // deep enough to swim in, and you are actually down in it
    self.swimming = !!water && water.depth > swimDepth && self.y < water.surface + 0.2;
    if (self.swimming && self.mounted) self.mounted = false;     // the horse will not swim
    if (self.swimming && !wasSwimming) out.enteredWater = true;

    // --- move
    let speed = 0;
    if (!frozen && input && (input.forward || input.strafe)) {
      const base = b.moveSpeed ?? 5.4;
      if (self.swimming) {
        speed = b.swimSpeed ?? 2.7;
        // backwards and sideways strokes are slower than a front crawl
        if (input.forward < 0) speed *= 0.65;
        else if (!input.forward) speed *= 0.75;
      } else {
        speed = base * (input.run ? (b.runMultiplier ?? 2.1) : 1);
        if (self.mounted) speed *= b.mountSpeed ?? 2.1;
        const steep = terrain.slopeAt(self.x, self.z, 2);
        speed *= 1 / (1 + Math.max(0, steep) * 1.6);
      }
      forward.set(Math.sin(self.yaw), 0, Math.cos(self.yaw));
      // right-hand side of `forward` is forward x up, which is (-cos, 0, sin)
      right.set(-forward.z, 0, forward.x);
      const dx = forward.x * input.forward + right.x * input.strafe;
      const dz = forward.z * input.forward + right.z * input.strafe;
      const len = Math.hypot(dx, dz) || 1;
      let nx = self.x + (dx / len) * speed * dt;
      let nz = self.z + (dz / len) * speed * dt;
      [nx, nz] = terrain.clampToWorld(nx, nz);
      [nx, nz] = unstick(nx, nz);
      [self.x, self.z] = terrain.clampToWorld(nx, nz);
    } else if (!frozen) {
      // even standing still, never be left inside something that was just built around you
      const [cx, cz] = unstick(self.x, self.z);
      self.x = cx; self.z = cz;
    }
    self.moving = speed;
    self.running = !!(input && input.run && speed > 0 && !self.swimming);

    // --- up and down
    const ground = terrain.heightAt(self.x, self.z);
    if (self.swimming) {
      // float at the surface: no gravity, no jumping, no diving
      const float = self.waterSurface - (b.floatDepth ?? 0.55);
      self.y += (float - self.y) * Math.min(1, dt * 6);
      self.vy = 0;
      self.grounded = false;
    } else {
      if (!frozen && input?.jump && self.grounded) {
        const jump = (b.jumpSpeed ?? 6.4) * (self.mounted ? (b.mountJump ?? 1.5) : 1);
        self.vy = jump * Math.sqrt(Math.max(0.25, terrain.planet?.gravity ?? 1));
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
    }

    // --- swinging (not while riding: you have your hands full)
    if (!frozen && input?.attack && self.attackCooldown <= 0 && !self.mounted && !self.swimming) {
      self.attackCooldown = b.attackEvery ?? 0.62;
      self.swing = 0.35;
      out.attacked = true;
    }

    // --- the camera
    // It sits behind the player ALONG THE VIEW RAY and looks down it. That is the trick for looking
    // up: when the ground is in the way we shorten the distance instead of lifting the camera, so
    // the direction you are looking never changes — you can put your back to a hill and still see
    // straight up into space. It is then nudged over the character's shoulder so the body does not
    // sit in the middle of the screen.
    const cp = Math.cos(self.pitch);
    const lookX = Math.sin(self.yaw) * cp;
    const lookY = Math.sin(self.pitch);
    const lookZ = Math.cos(self.yaw) * cp;
    const headY = self.y + (self.mounted ? 2.35 : 1.55);

    let dist = self.camDistance;
    for (let step = 0; step < 12; step++) {
      const cx = self.x - lookX * dist, cz = self.z - lookZ * dist, cy = headY - lookY * dist;
      if (cy > terrain.heightAt(cx, cz) + 0.5) break;
      dist *= 0.8;
      if (dist < 0.35) { dist = 0.35; break; }
    }
    self.camDistanceUsed = dist;

    // over-the-shoulder: slide the camera along its own right axis, keeping the direction
    const rl = Math.hypot(lookZ, lookX) || 1;
    const rx = -lookZ / rl, rz = lookX / rl;
    // over the LEFT shoulder by default, which is what was asked for
    const side = opt('shoulder', 'left') === 'right' ? 1 : -1;
    const shoulder = side * (b.shoulderOffset ?? 0.85) * Math.min(1, dist / 2.2);
    const camX = self.x - lookX * dist + rx * shoulder;
    const camZ = self.z - lookZ * dist + rz * shoulder;
    let camY = headY - lookY * dist + (b.cameraLift ?? 0.25);
    camY = Math.max(camY, terrain.heightAt(camX, camZ) + 0.35);
    camera.position.set(camX, camY, camZ);
    camera.lookAt(camX + lookX, camY + lookY, camZ + lookZ);

    return out;
  }

  /** Drop the player somewhere else on the planet (used by the map and the tests). */
  function teleport(x, z) {
    [self.x, self.z] = terrain.clampToWorld(x, z);
    self.y = terrain.heightAt(self.x, self.z);
    self.vy = 0; self.grounded = true; self.swimming = false;
  }

  return Object.assign(self, {
    update, teleport,
    get spawn() { return spawn; },
    /** The horizontal direction the player is facing, for spawning arrows and swipes. */
    facing() { return [Math.sin(self.yaw), Math.cos(self.yaw)]; },
  });
}
