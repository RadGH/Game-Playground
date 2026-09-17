// Farhold — flying the ship inside the world: take-off, atmosphere, and the handover to space.
//
// The ask, in the user's words: *"I was picturing the planet take-off and landing to be like No
// Man's Sky where you actually fly out of atmosphere (or back into it) and it seamlessly transitions
// from space to ground… The rocket should just act like a space ship and let you fly around in
// atmosphere, but not clip through the world. Space ships should not suffer damage at this point
// though, just bounce off."*
//
// **Why this is a separate mode rather than one coordinate space.** `js/space.js` runs in compressed
// units because an AU is 150 million km and the ground is measured in metres; a float cannot hold
// both at a useful precision, which is why the prototype has always had two scenes. What it CAN do —
// and what actually produces the feeling — is fly the ship *in the world*, in metres, all the way up
// through the air until the ground has faded to nothing, and hand over to the space scene there,
// matched in position and attitude, with the sky already black. Coming down is the same in reverse.
// There is no cut, no loading screen and no camera jump; the terrain's own clipmap rings do the
// level of detail as you climb, which is what they were built for.
//
//   const air = createAtmosphere({ scene, terrain, balance, ship, sky });
//   air.board(control);                       // step off the ground into the cockpit
//   const out = air.update(dt, snap, camera); // { leftAtmosphere, landed, altitude }
//
// Collision is a bounce, never damage: the hull is pushed back out of the ground and the velocity
// along the surface normal is reflected and damped. You lose speed and your nerve, not health.

import * as THREE from 'three';

/** Everything the flight model reads. All of it is in `balance.json` `flight`. */
const DEFAULTS = {
  ceiling: 9000,          // metres: above this the world is gone and space takes over
  thrust: 260,            // m/s² at full throttle
  boost: 2.8,
  drag: 0.24,             // thick air slows you; it thins out with altitude
  maxSpeed: 900,
  liftSpeed: 26,          // how fast it rises with no throttle at all, so take-off is forgiving
  liftMax: 1.04,          // a wing can carry the whole ship (and a little more) at speed
  liftSpeedFull: 95,      // …once it is going this fast
  throttleUp: 3.2,        // how quickly W reaches full — about a third of a second
  throttleDown: 2.2,
  hoverFloor: 12,         // metres of ground clearance the ship will not sink below on its own
  hoverPush: 16,          // …and how hard it pushes back up to keep it
  turnRate: 1.5,          // radians a second at full deflection
  rollRate: 2.2,
  clearance: 6,           // metres of hull below the centre point
  bounce: 0.35,           // how much of the impact speed comes back
  groundDrag: 0.82,       // and how much of the rest is scrubbed off
  landSpeed: 40,          // slow enough to put down
  landHeight: 14,         // and low enough
  camBack: 26,
  camLift: 9,
};

export function createAtmosphere({ scene, terrain: terrainIn, balance = {}, ship = null, settings = null, onLog = () => {} } = {}) {
  // read through a binding: landing on a different world swaps the whole ground out
  let terrain = terrainIn;
  const cfg = { ...DEFAULTS, ...(balance.flight || {}) };
  const state = {
    x: 0, y: 0, z: 0,
    yaw: 0, pitch: 0, roll: 0, lift: 0,
    velocity: new THREE.Vector3(),
    throttle: 0,
    boosting: false,
    speed: 0,
    flying: false,
    bumped: 0,              // counts down after a bounce, for the HUD and the sound
  };

  const forward = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');

  /** How thick the air is here, 1 at the ground and 0 at the ceiling. Thin air means less drag. */
  function density(y) {
    return Math.max(0, 1 - Math.max(0, y) / cfg.ceiling);
  }

  /** Step into the cockpit from wherever the character is standing. */
  function board(at) {
    state.x = at.x;
    state.z = at.z;
    state.y = terrain.heightAt(at.x, at.z) + cfg.clearance + 2;
    state.yaw = at.yaw ?? 0;
    // LEVEL. It used to start nose-up, which meant W climbed for ever and you could not fly across
    // the world looking for somewhere to land — "W always goes up, I can no longer fly around".
    // Lift-off is the vertical thrust below (Space), not a permanent angle of attack.
    state.pitch = 0;
    state.roll = 0;
    state.velocity.set(0, cfg.liftSpeed, 0);
    state.throttle = 0;
    state.flying = true;
    if (ship) ship.group.visible = true;
    return state;
  }

  /** Drop in from space, above the point the ship was over. */
  function descend(at, { altitude = cfg.ceiling * 0.92, yaw = 0 } = {}) {
    state.x = at.x;
    state.z = at.z;
    state.y = Math.max(terrain.heightAt(at.x, at.z) + 200, altitude);
    state.yaw = yaw;
    state.pitch = -0.5;               // nose down: you are coming in
    state.roll = 0;
    state.velocity.set(0, -120, 0);
    state.throttle = 0.25;
    state.flying = true;
    if (ship) ship.group.visible = true;
    return state;
  }

  function leave() {
    state.flying = false;
    if (ship) ship.group.visible = false;
  }

  /**
   * One frame of flight. Returns what the caller needs to decide:
   *   leftAtmosphere — climbed past the ceiling, hand over to space
   *   landed         — slow enough and low enough to put down
   *   bumped         — hit the ground this frame (a noise, not a wound)
   */
  function update(dt, input, camera) {
    if (!state.flying) return { flying: false };
    const out = { flying: true, leftAtmosphere: false, landed: false, bumped: false };

    // ---- attitude: the mouse steers, A/D rolls
    if (input) {
      state.yaw -= (input.look?.[0] || 0) * 0.0022;
      // Pull the mouse back and the nose comes UP, the same way it does on foot. The aircraft
      // convention is the other way round and is an option rather than the default.
      const invert = settings?.get('invertFlight') ? -1 : 1;
      const sens = settings?.get('sensitivity') ?? 1;
      state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch - (input.look?.[1] || 0) * 0.0019 * invert * sens));
      const rollWant = (input.strafe || 0) * -0.6;
      state.roll += (rollWant - state.roll) * Math.min(1, dt * cfg.rollRate);
      /**
       * W AND S FLY YOU FORWARD AND BACK.
       *
       * "The spaceship flying system in atmosphere… changed at some point so that W/S only go up and
       * down, not forward and back, so I can no longer fly around the planet. The goal is to fly
       * around the planet and reveal more terrain."
       *
       * W was always the throttle, but it took nearly a second to reach full and the wing could only
       * ever carry 92% of the ship's weight — so holding W got you a slow sink with some forward
       * drift, and the only thing that actually moved you was Space. It eases to full in about a
       * third of a second now, and level flight below actually holds its altitude.
       */
      const want = input.forward || 0;
      const ease = want > state.throttle ? cfg.throttleUp : cfg.throttleDown;
      state.throttle = Math.max(0, Math.min(1, state.throttle + (want - state.throttle) * Math.min(1, dt * ease)));
      state.boosting = !!input.run;
      // Space lifts, C drops. Straight vertical thrust, so you can hold an altitude, hop a ridge and
      // put down on a flat spot without having to fly a landing pattern.
      state.lift = (input.jump ? 1 : 0) - (input.keys?.has?.('KeyC') ? 1 : 0);
    }

    // NOTE the minus. Three's X rotation tips +Z toward -Y, so a positive `pitch` through a
    // quaternion points the nose DOWN — the opposite of every other pitch in this game, where
    // positive is up (player.js builds its direction from sin(pitch) by hand and so avoids this).
    // Without it the ship dived at full throttle and take-off was impossible.
    euler.set(-state.pitch, state.yaw, state.roll);
    quat.setFromEuler(euler);
    forward.set(0, 0, 1).applyQuaternion(quat);

    // ---- thrust, lift and drag
    const air = density(state.y);
    const push = cfg.thrust * state.throttle * (state.boosting ? cfg.boost : 1);
    state.velocity.addScaledVector(forward, push * dt);
    if (state.lift) state.velocity.y += cfg.thrust * 0.55 * state.lift * dt;
    // a wing holds you up: the faster you go, the more of your weight the air carries
    const gravity = 9.81 * (terrain.planet?.gravity ?? 1);
    // A wing holds you up when you are moving and roughly level. It is capped below 1 so the ship
    // always sinks a little with no input, which is what makes "hold this altitude" a thing you do
    // rather than a thing that happens.
    const level = Math.max(0, 1 - Math.abs(state.pitch) / 1.2);
    /**
     * A wing that can actually hold the ship up.
     *
     * It used to be capped at 0.92, so a ship flying flat out and dead level still fell out of the
     * sky at 0.8 m/s² — which is why crossing a continent needed a hand on Space the whole way. It
     * reaches `cfg.liftMax` (just over 1) with speed, so level flight holds its line and a nose-up
     * or nose-down attitude is what changes your altitude. Below the speed it needs, it still sags:
     * a hovering ship should sink.
     */
    const lift = Math.min(cfg.liftMax, (state.speed / cfg.liftSpeedFull) * air * level);
    state.velocity.y -= gravity * (1 - lift) * dt;
    // and thin air is less of a brake, which is why you accelerate as you climb
    const drag = cfg.drag * air;
    state.velocity.multiplyScalar(Math.max(0, 1 - drag * dt));
    if (state.velocity.length() > cfg.maxSpeed) state.velocity.setLength(cfg.maxSpeed);

    // ---- move
    state.x += state.velocity.x * dt;
    state.y += state.velocity.y * dt;
    state.z += state.velocity.z * dt;
    const [cx, cz] = terrain.clampToWorld(state.x, state.z);
    if (cx !== state.x || cz !== state.z) {
      // the edge of the map is a wall, not a cliff — bounce off it too
      state.velocity.x *= -0.4; state.velocity.z *= -0.4;
      state.x = cx; state.z = cz;
    }

    /**
     * A SOFT FLOOR over the terrain.
     *
     * Flying across a continent means looking at it, and looking at it means not watching the
     * ground come up. This is not autopilot — you can still fly it into a hill at speed, and you can
     * still descend deliberately by pointing the nose down — but with the stick centred the ship
     * will not sink into a rise it is passing over. It is what makes "fly around and find somewhere
     * to land" a thing you can do rather than a thing you have to concentrate on.
     */
    {
      const ahead = terrain.heightAt(state.x + state.velocity.x * 0.6, state.z + state.velocity.z * 0.6);
      const clear = state.y - Math.max(ahead, terrain.heightAt(state.x, state.z));
      if (clear < cfg.hoverFloor && state.lift >= 0 && state.pitch > -0.35) {
        const need = (cfg.hoverFloor - clear) / cfg.hoverFloor;
        state.velocity.y += cfg.hoverPush * need * dt;
      }
    }

    // ---- the ground is solid. A ship does not take damage here; it bounces.
    const ground = terrain.heightAt(state.x, state.z);
    const floor = ground + cfg.clearance;
    if (state.y < floor) {
      state.y = floor;
      if (state.velocity.y < 0) {
        // reflect what is going into the ground, scrub the rest
        const impact = -state.velocity.y;
        state.velocity.y = impact * cfg.bounce;
        state.velocity.x *= cfg.groundDrag;
        state.velocity.z *= cfg.groundDrag;
        if (impact > 8) { out.bumped = true; state.bumped = 0.4; }
      }
      // and level the nose out, so you do not plough along at an angle
      state.pitch += (0 - state.pitch) * Math.min(1, dt * 3);
    }
    if (state.bumped > 0) state.bumped -= dt;

    state.speed = state.velocity.length();
    const altitude = state.y - ground;

    // ---- can we put down, and have we left?
    out.altitude = altitude;
    out.landed = altitude < cfg.landHeight && state.speed < cfg.landSpeed;
    out.leftAtmosphere = state.y > cfg.ceiling;

    // ---- the hull and the camera
    if (ship) {
      ship.group.position.set(state.x, state.y, state.z);
      ship.group.quaternion.copy(quat);
    }
    if (camera) {
      tmp.set(0, 0, -1).applyQuaternion(quat).multiplyScalar(cfg.camBack);
      const lift2 = up.clone().applyQuaternion(quat).multiplyScalar(cfg.camLift);
      camera.position.set(state.x + tmp.x + lift2.x, state.y + tmp.y + lift2.y, state.z + tmp.z + lift2.z);
      // never let the camera go under the ground
      const camGround = terrain.heightAt(camera.position.x, camera.position.z) + 3;
      if (camera.position.y < camGround) camera.position.y = camGround;
      camera.lookAt(state.x, state.y, state.z);
    }
    return out;
  }

  /**
   * How far through the handover to space we are, 0 on the ground and 1 at the ceiling. The caller
   * uses it to fade the sky to black and the ground to nothing, so the change is continuous rather
   * than a cut.
   */
  function spaceBlend() {
    return Math.max(0, Math.min(1, (state.y - cfg.ceiling * 0.45) / (cfg.ceiling * 0.55)));
  }

  return {
    state, cfg, board, descend, leave, update, spaceBlend, density,
    get flying() { return state.flying; },
    get altitude() { return state.y - terrain.heightAt(state.x, state.z); },
    /** Point the camera at the ship without moving it — used while the world rebuilds. */
    setTerrain(next) { terrain = next; },
    readout() {
      return {
        altitude: Math.round(state.y - terrain.heightAt(state.x, state.z)),
        speed: Math.round(state.speed),
        throttle: state.throttle,
      lift: state.lift,
        air: +density(state.y).toFixed(2),
        boosting: state.boosting,
      };
    },
  };
}
