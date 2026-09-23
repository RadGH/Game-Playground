// Moving the character around.
//
// Two ways to drive it, both live at once:
//
//   In third person, W/A/S/D move relative to where the camera is looking and the character turns
//   to face the way they are going. Hold shift to sprint, control to crouch, space to jump.
//
//   In the strategy view, click the ground and they walk there. The click is turned into a point
//   by marching a ray down the heightmap rather than raycasting the terrain meshes — which means
//   the answer does not change when a chunk swaps detail level, and it is the same answer the
//   character's feet get when they arrive.
//
// The speeds are not arbitrary: 1.55, 3.4 and 6.1 metres a second are the speeds the walk, jog and
// sprint animation clips were made at. Matching them is what stops the feet sliding.

import * as THREE from 'three';

export const SPEEDS = { walk: 1.55, jog: 3.4, sprint: 6.1, crouch: 1.2, swim: 1.7 };

export function createController(world, character, { vegetation = null } = {}) {
  const position = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const state = {
    facing: 0,               // radians, 0 = looking down +z
    speed: 0,                // metres per second on the ground
    grounded: true,
    swimming: false,
    crouching: false,
    sprinting: false,
    jumping: false,
    moveTo: null,            // { x, z } when walking to a clicked point
    autoWalk: false,
    frozen: false,
    lastLanding: 0,
    biome: '',
    depth: 0,
  };

  const GRAVITY = -22.0;
  const JUMP_SPEED = 6.4;
  const ACCEL = 26.0;        // how fast the character gets up to speed
  const DECEL = 34.0;
  const TURN_RATE = 12.0;    // radians a second
  const MAX_SLOPE = 0.72;    // 1 - normal.y above this and you slide back down
  const STEP_UP = 0.55;      // how tall a lump you can walk straight over

  const _dir = new THREE.Vector3();
  const _n = { x: 0, y: 1, z: 0 };
  const _want = new THREE.Vector3();

  function spawn(x, z) {
    position.set(x, world.heightAt(x, z), z);
    velocity.set(0, 0, 0);
    state.grounded = true;
  }

  /** Walk to a point on the map. */
  function orderMoveTo(x, z) {
    state.moveTo = { x, z };
  }
  function stop() { state.moveTo = null; _want.set(0, 0, 0); }

  /**
   * @param dt seconds
   * @param input from input.js
   * @param cameraYaw where the camera is looking, so W means "away from the camera"
   * @param mode 'follow' or 'overhead'
   */
  function update(dt, input, cameraYaw, mode) {
    if (state.frozen) { character.setLocomotion(0); return; }
    dt = Math.min(dt, 0.05);       // one slow frame must not teleport anybody through a wall

    const ground = world.heightAt(position.x, position.z);
    state.depth = Math.max(0, world.waterLevel - position.y);
    const wasSwimming = state.swimming;
    // You swim when the water under you is deep enough to float in, not merely when your feet are wet.
    state.swimming = (world.waterLevel - ground) > 1.25 && position.y < world.waterLevel + 0.2;

    // --- what the player is asking for ----------------------------------------------------------
    let wantX = 0, wantZ = 0;
    const manual = mode === 'follow';
    if (manual) {
      const f = input.axis('back', 'forward');
      const s = input.axis('left', 'right');
      if (f || s) {
        state.moveTo = null;
        // forward is away from the camera
        const sin = Math.sin(cameraYaw), cos = Math.cos(cameraYaw);
        wantX = s * cos - f * sin;
        wantZ = -s * sin - f * cos;
      }
    }
    if (state.moveTo) {
      const dx = state.moveTo.x - position.x, dz = state.moveTo.z - position.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.7) { state.moveTo = null; }
      else { wantX = dx / d; wantZ = dz / d; }
    }

    const len = Math.hypot(wantX, wantZ);
    if (len > 1) { wantX /= len; wantZ /= len; }

    state.sprinting = manual ? input.held('sprint') : false;
    state.crouching = manual ? input.held('crouch') && state.grounded && !state.swimming : false;

    let topSpeed;
    if (state.swimming) topSpeed = SPEEDS.swim * (state.sprinting ? 1.5 : 1);
    else if (state.crouching) topSpeed = SPEEDS.crouch;
    else if (state.sprinting) topSpeed = SPEEDS.sprint;
    else if (state.moveTo) topSpeed = SPEEDS.jog;
    else topSpeed = len > 0.92 ? SPEEDS.jog : SPEEDS.walk;
    // holding a direction with no sprint gives a jog; tapping gives a walk — a keyboard has no
    // half-pressed key, so the distinction comes from the analogue-ish `len` above.

    // --- horizontal motion -----------------------------------------------------------------------
    const target = _want.set(wantX * topSpeed, 0, wantZ * topSpeed);
    const rate = (len > 0.01 ? ACCEL : DECEL) * (state.grounded || state.swimming ? 1 : 0.35);
    velocity.x += (target.x - velocity.x) * Math.min(1, rate * dt / Math.max(1, topSpeed));
    velocity.z += (target.z - velocity.z) * Math.min(1, rate * dt / Math.max(1, topSpeed));

    // uphill costs you speed, downhill gives a little back
    world.normalAt(position.x, position.z, _n);
    const slopeAlong = -(_n.x * velocity.x + _n.z * velocity.z) / Math.max(0.2, _n.y);
    const slopeFactor = THREE.MathUtils.clamp(1 - slopeAlong * 0.12, 0.45, 1.25);
    velocity.x *= THREE.MathUtils.lerp(1, slopeFactor, dt * 6);
    velocity.z *= THREE.MathUtils.lerp(1, slopeFactor, dt * 6);

    // --- jumping, falling, floating ---------------------------------------------------------------
    if (state.swimming) {
      // bob up to the surface
      const surface = world.waterLevel - 0.55;
      velocity.y += (surface - position.y) * 9.0 * dt;
      velocity.y *= Math.pow(0.02, dt);
      state.grounded = false;
      state.jumping = false;
    } else {
      if (state.grounded && manual && input.pressed('jump')) {
        velocity.y = JUMP_SPEED;
        state.grounded = false;
        state.jumping = true;
        character.playOnce('jumpUp');
      }
      velocity.y += GRAVITY * dt;
    }

    // --- move, then put the feet back on the ground ------------------------------------------------
    let nx = position.x + velocity.x * dt;
    let nz = position.z + velocity.z * dt;
    const ny = position.y + velocity.y * dt;

    // keep inside the map
    const lim = world.size / 2 - 3;
    nx = THREE.MathUtils.clamp(nx, -lim, lim);
    nz = THREE.MathUtils.clamp(nz, -lim, lim);

    // slide along anything solid rather than stopping dead against it
    if (vegetation) {
      const solids = vegetation.collidersNear(nx, nz, 3.2);
      const r = character.radius ?? 0.34;
      for (const s of solids) {
        const dx = nx - s.x, dz = nz - s.z;
        const d = Math.hypot(dx, dz);
        const minD = s.r + r;
        if (d < minD && d > 1e-4) {
          nx = s.x + (dx / d) * minD;
          nz = s.z + (dz / d) * minD;
        }
      }
    }

    const newGround = world.heightAt(nx, nz);
    // a slope too steep to climb pushes you back down it
    world.normalAt(nx, nz, _n);
    if (!state.swimming && (1 - _n.y) > MAX_SLOPE && newGround > world.heightAt(position.x, position.z)) {
      nx = position.x; nz = position.z;
    }

    position.x = nx; position.z = nz;
    const groundHere = world.heightAt(position.x, position.z);

    if (state.swimming) {
      position.y = ny;
      if (position.y < groundHere) { position.y = groundHere; }
    } else if (ny <= groundHere + 0.02 || (velocity.y <= 0 && ny - groundHere < STEP_UP)) {
      if (!state.grounded && velocity.y < -3.5) {
        character.playOnce('land');
        state.lastLanding = performance.now();
      }
      position.y = groundHere;
      velocity.y = 0;
      state.grounded = true;
      state.jumping = false;
    } else {
      position.y = ny;
      state.grounded = false;
    }

    // --- facing --------------------------------------------------------------------------------
    state.speed = Math.hypot(velocity.x, velocity.z);
    if (state.speed > 0.12) {
      const want = Math.atan2(velocity.x, velocity.z);
      let diff = want - state.facing;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.facing += diff * Math.min(1, TURN_RATE * dt);
    }

    // --- tell the animation what is going on -----------------------------------------------------
    character.setLocomotion(state.speed, {
      grounded: state.grounded,
      swimming: state.swimming,
      crouching: state.crouching,
    });

    character.group.position.copy(position);
    character.group.rotation.y = state.facing;
    // in the water the body sits lower
    if (state.swimming) character.group.position.y -= 0.35;

    if (wasSwimming !== state.swimming && state.swimming) {
      // entering the water kills your momentum, same as it would in life
      velocity.multiplyScalar(0.35);
    }

    state.biome = world.biomeNameAt(position.x, position.z);
  }

  return {
    state, position, velocity, spawn, orderMoveTo, stop, update,
    get facing() { return state.facing; },
    get speed() { return state.speed; },
    /** What the camera should treat as the subject. */
    subject: {
      position,
      eyeHeight: character.eyeHeight ?? 1.6,
      get facing() { return state.facing; },
      get speed() { return state.speed; },
    },
  };
}
