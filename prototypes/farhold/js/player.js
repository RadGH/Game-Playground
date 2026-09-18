// Farhold — walking about: the third-person controller and the camera that follows it.
//
// Keyboard and mouse go in, a position on the planet comes out. The controller never touches the
// renderer; `main.js` reads `player.x/y/z/yaw` and moves the character model. Gravity is the
// planet's own, so a light world really does let you jump higher.
//
// It also handles what you are standing in: deep water makes you swim, solid things stop you
// walking through them, and `H` puts you on a horse.

import * as THREE from 'three';

export const KEY_HELP = 'WASD move · Shift run · Space jump · click attack · 1-6 skills · V first person · E talk/open/enter · L light · H horse · J ship · M map · I sheet · K log · O settings · ` debug';

/** Reads the keyboard and mouse. Pointer lock is optional — dragging works too. */
export function createInput(dom) {
  const keys = new Set();
  const state = { forward: 0, strafe: 0, run: false, jump: false, attack: false, attackHeld: false, look: [0, 0], locked: false };
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
  /**
   * The largest mouse movement one event may report, in pixels.
   *
   * Reported in play: "sometimes when looking up or down my view suddenly skips to pointing straight
   * up or straight down." Pointer lock occasionally delivers an enormous `movementX/Y` — right after
   * the lock is taken, when the OS pointer is warped, or on some drivers when it crosses a screen
   * edge. One such event is bigger than the whole pitch range, so the view slams into the clamp at
   * the top or the bottom. A real flick of the wrist is well under this; a spike is hundreds.
   */
  const MAX_DELTA = 110;
  const move = e => {
    if (!state.locked && !dragging) return;
    const dx = e.movementX || 0, dy = e.movementY || 0;
    // drop the event entirely rather than clamping it: a clamped spike is still a spike, just a
    // smaller one, and the frame it lands on is not one the player asked for
    if (Math.abs(dx) > MAX_DELTA || Math.abs(dy) > MAX_DELTA) return;
    state.look[0] += dx;
    state.look[1] += dy;
  };
  dom.addEventListener('mousemove', move);
  // HOLD TO ATTACK. `state.attack` used to be a one-shot cleared by every sample(), so a swing
  // cost a click. It is now simply whether the button is down, and the weapon's own clock decides
  // how often that turns into a swing - "change it so holding down the mouse button repeatedly
  // attacks (with all weapons)".
  dom.addEventListener('mousedown', e => { if (e.button === 0) { dragging = true; state.attack = true; state.attackHeld = true; } });
  window.addEventListener('mouseup', e => { dragging = false; if (!e || e.button === 0) state.attackHeld = false; });
  window.addEventListener('blur', () => { dragging = false; state.attackHeld = false; });
  // A panel being open must block the click that would grab the mouse again — otherwise clicking a
  // button in the character sheet immediately captures the pointer and the sheet becomes unusable.
  let blocked = () => false;
  dom.addEventListener('click', () => { if (!state.locked && !blocked()) dom.requestPointerLock?.(); });
  document.addEventListener('pointerlockchange', () => { state.locked = document.pointerLockElement === dom; });

  return {
    state, keys,
    /** Give the mouse back RIGHT NOW. Opening the character sheet calls this. */
    release() { if (document.pointerLockElement) document.exitPointerLock?.(); state.locked = false; },
    /** Take it again — closing every panel calls this, and it is a no-op if the user would rather drag. */
    grab() { if (!blocked() && !document.pointerLockElement) dom.requestPointerLock?.(); },
    /** `fn()` returning true means "a panel owns the mouse, do not capture it". */
    setBlocked(fn) { blocked = fn || (() => false); },
    /** Was this key pressed since the last sample? Cleared by sample(). */
    tapped: code => pressed.has(code),
    sample() {
      state.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      state.strafe = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      state.run = keys.has('ShiftLeft') || keys.has('ShiftRight');
      state.jump = keys.has('Space');
      // `keys` rides along so a mode with its own bindings (the ship's C-to-descend) can read them
      const snapshot = { ...state, look: [state.look[0], state.look[1]], pressed: new Set(pressed), keys };
      state.look[0] = 0; state.look[1] = 0;
      // a held button keeps attacking; a tapped one fires once and clears
      state.attack = !!state.attackHeld;
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
export function createController(terrainIn, balance = {}, camera, {
  obstacles: obstaclesIn = [], settings = null, boat = null, derived = null,
} = {}) {
  let obstacles = obstaclesIn;
  // Read through a binding, not a parameter: `setTerrain` swaps the whole floor out when the player
  // walks into a dungeon and back out again, and every sampler below has to follow it.
  let terrain = terrainIn;
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
    /**
     * DUAL WIELDING: each hand has its own clock and its own place in its weapon's pattern.
     * `mainStep` and `offStep` walk the sequence and reset when you stop, which is what makes a
     * combo a combo. See js/weapons.js.
     */
    offCooldown: 0, mainStep: 0, offStep: 0, idleSince: 0,
    attackEvery: b.attackEvery ?? 0.62,      // main.js keeps this in step with derived.attackEvery
    firstPerson: false, eyeHeight: 1.5,
    swimming: false, wading: false, waterDepth: 0, waterSurface: 0,
    mounted: false,
    /**
     * THE BOAT PUTS ITSELF IN THE WATER.
     *
     * "Boats should automatically equip when you start swimming and increase water travel movement
     * speed." A boat is an unlockable, not a slot you fiddle with (see js/gear.js), so there is
     * nothing to equip by hand — the moment you are deep enough to swim, whichever boat you have
     * selected goes under you, and it comes back out when you can stand up again. `boating` holds
     * the spec while you are afloat so the renderer and the speed calculation can both read it.
     */
    boating: null,
    radius: b.bodyRadius ?? 0.45,
  };

  /** Whichever boat is selected right now, or null if the game has not wired one through. */
  const activeBoat = () => { try { return boat ? boat() : null; } catch { return null; } };

  /**
   * THE SHEET REACHES THE LEGS.
   *
   * Everything the player wears, rides and has spent a perk point on is added up into
   * `player.derived` — and the controller never read a word of it. `b.moveSpeed` is the flat number
   * out of balance.json, so every move-speed perk, `cond_extraLeg` and the `free_move` legendary
   * were inert; and `b.mountSpeed` is one constant for every mount, which is the other half of "I
   * bought a Moor Pony, which seemed to be identical to the Trail Horse I started with" — they had
   * the same speed, the same jump and the same wind, whatever the shop charged.
   *
   * Read through a function, not captured: the sheet is rebuilt whenever gear changes.
   */
  const sheet = () => { try { return derived ? derived() || {} : {}; } catch { return {}; } };

  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const resolved = [0, 0];

  /**
   * Push out of anything solid, unless riding (a horse shoulders through undergrowth).
   *
   * `feet` is how high off the ground we are. Anything whose roof is already below it stops being
   * solid, so a wall you have genuinely cleared lets you through — "I cannot jump over walls and
   * structures even if I clear them by several feet".
   */
  function unstick(x, z, feet = null) {
    let ox = x, oz = z;
    for (const field of obstacles) {
      if (!field) continue;
      field.resolve(ox, oz, self.radius, resolved, feet);
      ox = resolved[0]; oz = resolved[1];
    }
    return [ox, oz];
  }

  /** The roof under our feet, when we are standing on something rather than on the ground. */
  function standingOn(x, z, feet) {
    let best = null;
    for (const field of obstacles) {
      if (!field?.standAt) continue;
      const top = field.standAt(x, z, feet, self.radius);
      if (top !== null && (best === null || top > best)) best = top;
    }
    return best;
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
    if (self.offCooldown > 0) self.offCooldown -= dt;

    // --- what am I standing in?
    const water = terrain.waterAt(self.x, self.z);
    const wasSwimming = self.swimming;
    const wasWading = self.wading;
    const swimDepth = b.swimDepth ?? 1.3;
    /**
     * THE BOAT COMES OUT AT THE SHORE, NOT IN MID-CHANNEL.
     *
     * "We should make it so you equip the raft even if your knees are in the water, not only when at
     * the absolute river line, but up to the shore as well." Boarding was keyed to `swimming`, which
     * needs 1.3 m of water — so you waded in, walked the bed, and the raft only appeared once the
     * river was deep enough to swim in, which on a real crossing is the middle. Wading is its own
     * state at `boardDepth` (0.55 m, about knee deep) and the boat rides on that; `swimming` is
     * untouched, so how you MOVE is decided the same way it always was.
     */
    const boardDepth = b.boardDepth ?? 0.55;
    self.waterDepth = water ? water.depth : 0;
    self.waterSurface = water ? water.surface : 0;
    // deep enough to swim in, and you are actually down in it
    self.swimming = !!water && water.depth > swimDepth && self.y < water.surface + 0.2;
    self.wading = !!water && water.depth > boardDepth && self.y < water.surface + 0.4;
    if (self.swimming && self.mounted) self.mounted = false;     // the horse will not swim
    if (self.wading && !wasWading) {
      out.enteredWater = true;
      // step into the boat on the way in, not on a key press
      self.boating = activeBoat();
      if (self.boating) out.boarded = self.boating;
    }
    /**
     * Put the boat away whenever you are not swimming — not only on the frame you climbed out.
     *
     * This used to test the transition, and the transition is not the only way to leave the water:
     * `teleport()` drops you somewhere dry, a load puts you on a road, and a dungeon changes the
     * floor under you. Any of those and the previous state was already false by the next update, so
     * the raft stayed "equipped" on dry land for the rest of the run. Reading the state instead of
     * the edge cannot miss, and it still only fires once because `boating` goes null on the way.
     */
    if (!self.wading && self.boating) {
      out.leftBoat = self.boating;
      self.boating = null;
    }

    // --- move
    let speed = 0;
    if (!frozen && input && (input.forward || input.strafe)) {
      const base = sheet().moveSpeed || (b.moveSpeed ?? 5.4);
      if (self.swimming || (self.boating && self.wading)) {
        /**
         * A boat is the difference between crossing a lake and going round it.
         *
         * Swimming is 2.7 m/s, which is slower than walking on purpose — deep water is meant to be
         * a wall you look for a way around. A boat turns that wall into a road: the raft you start
         * with is 3.4, the skiff 5.6 and the cutter 8.2, so the cheapest boat is already quicker
         * than swimming and the best one beats running on land. The speeds live on the boat in
         * js/gear.js, not here, so buying a better one is the only thing that changes.
         */
        speed = self.boating?.speed || (b.swimSpeed ?? 2.7);
        // backwards and sideways strokes are slower than a front crawl — and a boat still turns
        // better than it reverses, so the same penalty reads correctly either way
        if (input.forward < 0) speed *= 0.65;
        else if (!input.forward) speed *= 0.75;
      } else {
        speed = base * (input.run ? (b.runMultiplier ?? 2.1) : 1);
        // the mount you actually bought: gear.js gives the pony 1.9, the courser 2.5, the elk 2.1
        if (self.mounted) speed *= sheet().mountSpeed || (b.mountSpeed ?? 2.1);
        const steep = terrain.slopeAt(self.x, self.z, 2);
        // …and a surefooted mount loses less of it to a hill, which is what the Dray Elk is FOR
        const sure = self.mounted ? Math.max(0, Math.min(0.8, sheet().mountSlope || 0)) : 0;
        speed *= 1 / (1 + Math.max(0, steep) * 1.6 * (1 - sure));
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
      [nx, nz] = unstick(nx, nz, self.y);
      [self.x, self.z] = terrain.clampToWorld(nx, nz);
    } else if (!frozen) {
      // even standing still, never be left inside something that was just built around you
      const [cx, cz] = unstick(self.x, self.z, self.y);
      self.x = cx; self.z = cz;
    }
    self.moving = speed;
    self.running = !!(input && input.run && speed > 0 && !self.swimming);

    // --- up and down
    // The floor is the terrain, OR the roof of anything wide we have jumped on top of. Without the
    // second half you can clear a wall and then sink straight back through it.
    const bare = terrain.heightAt(self.x, self.z);
    const roof = self.swimming ? null : standingOn(self.x, self.z, self.y);
    const ground = roof !== null && roof > bare ? roof : bare;
    self.onRoof = ground !== bare;
    if (self.swimming) {
      // float at the surface: no gravity, no jumping, no diving
      const float = self.waterSurface - (b.floatDepth ?? 0.55);
      self.y += (float - self.y) * Math.min(1, dt * 6);
      self.vy = 0;
      self.grounded = false;
    } else {
      if (!frozen && input?.jump && self.grounded) {
        const jump = (b.jumpSpeed ?? 6.4) * (self.mounted ? (sheet().mountJump || b.mountJump || 1.5) : 1);
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
    //
    // Two hands, two clocks. The main hand swings on its weapon's own rhythm; the off hand, when
    // it holds a second weapon, swings on ITS rhythm - "when dual wielding, you should be able to
    // attack with each weapon on separate cooldowns". Stop attacking for a moment and both
    // patterns reset to their first strike.
    const canSwing = !frozen && !self.mounted && !self.swimming;
    if (canSwing && input?.attack) {
      self.idleSince = 0;
      if (self.attackCooldown <= 0) {
        // how fast you swing is a STAT - `initiative` / haste - not a constant.
        self.attackCooldown = (self.mainEvery ?? self.attackEvery ?? b.attackEvery ?? 0.62);
        self.swing = 0.35;
        out.attacked = true;
        out.hand = 'main';
        out.step = self.mainStep;
        self.mainStep++;
      }
      if (self.dualWield && self.offCooldown <= 0) {
        self.offCooldown = (self.offEvery ?? self.attackEvery ?? b.attackEvery ?? 0.62);
        self.swing = Math.max(self.swing, 0.3);
        out.attackedOff = true;
        out.offStep = self.offStep;
        self.offStep++;
      }
    } else if (canSwing) {
      self.idleSince += dt;
      if (self.idleSince > (b.comboResetSeconds ?? 1.1)) { self.mainStep = 0; self.offStep = 0; }
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

    // FIRST PERSON: the camera sits at the eye instead of behind the body. `eyeAt` is filled in by
    // the game from the character's own eye bone, so the view is where the model's eyes actually
    // are rather than a guessed height; without a body yet it falls back to the head height.
    if (self.firstPerson && !self.mounted) {
      // `eyeHeight` is measured once off the model's own eye bone (see main.js). The camera does NOT
      // ride the animated bone: a walk cycle bobbing the view is how you make somebody queasy, and
      // the bone's world position is a frame behind the controller anyway.
      const ey = self.y + (self.eyeHeight ?? 1.5);
      // a step forward out of the face, so the nose is never in the near plane
      const camX = self.x + lookX * 0.12, camY = ey + lookY * 0.12, camZ = self.z + lookZ * 0.12;
      self.camDistanceUsed = 0;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(camX + lookX, camY + lookY, camZ + lookZ);
      return out;
    }

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

  /**
   * Swap the ground out from under the character — a dungeon has its own floor, its own bounds and
   * no weather. `at` is where to stand on arrival.
   */
  function setTerrain(next, at = null) {
    terrain = next;
    if (at) {
      [self.x, self.z] = terrain.clampToWorld(at.x, at.z);
      self.y = at.y != null ? at.y : terrain.heightAt(self.x, self.z);
      self.vy = 0; self.grounded = true; self.swimming = false; self.waterDepth = 0;
    }
    return terrain;
  }

  // NOTE: accessors go on with defineProperties, NOT Object.assign. Object.assign copies the
  // *value* a getter returns at that moment, so `control.terrain` would have been frozen to the
  // surface for the life of the run and `control.obstacles = [...]` would have written a dead plain
  // property while `unstick` kept reading the original closure — the dungeon's walls would not have
  // stopped anybody. (Chibi 2 has the same trap; see makeActor in actors.js.)
  Object.defineProperties(self, {
    obstacles: {
      get() { return obstacles; },
      set(list) { obstacles = list || []; },
    },
    terrain: { get() { return terrain; } },
    spawn: { get() { return spawn; } },
  });
  return Object.assign(self, {
    update, teleport, setTerrain,
    /** The horizontal direction the player is facing, for spawning arrows and swipes. */
    facing() { return [Math.sin(self.yaw), Math.cos(self.yaw)]; },
  });
}
