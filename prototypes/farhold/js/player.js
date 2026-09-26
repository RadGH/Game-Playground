// Farhold — walking about: the third-person controller and the camera that follows it.
//
// Keyboard and mouse go in, a position on the planet comes out. The controller never touches the
// renderer; `main.js` reads `player.x/y/z/yaw` and moves the character model. Gravity is the
// planet's own, so a light world really does let you jump higher.
//
// It also handles what you are standing in: deep water makes you swim, solid things stop you
// walking through them, and `H` puts you on a horse.

import * as THREE from 'three';
import { feel, COMBAT_FEEL } from './combat-feel.js';
import { drawPower, chargeAt, STAFF_CHARGE } from './weapons.js';
import { groundAt, cliffStep, cliffSlide } from './ground.js';

export const KEY_HELP = 'WASD move · Shift run · Space jump · click attack · 1-6 skills · V first person (hold: look around) · E talk/open/enter · L light · B build · H horse · G drive · J ship · M map · I sheet · K log · O settings · ` debug';

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
    /**
     * R18 — THE GALLOP, so `cond_mountStamina` means something.
     *
     * "+N seconds of gallop before it has to drop back to a walk" was the affix's own sentence and
     * there was no gallop: `mountStamina` landed in `derived` and nothing read it. Rather than
     * re-label the affix, here is the mechanic it describes. `gallopLeft` is seconds of hard riding
     * left; it drains while you hold run on a mount and recovers when you do not, so a long chase
     * is a decision and a Long-winded saddle is worth finding.
     */
    gallopLeft: 0, galloping: false,
    /**
     * R14 — FREE LOOK, so you can stand still and look at your own character's face.
     *
     *   "Allow holding V in walk mode to cause the camera to change to rotation mode, where mouse
     *    moves the camera. This is to allow you to get a front view look at your character. The
     *    camera should stick that way until you move your mouse again."
     *
     * Normally the mouse moves `yaw`/`pitch`, which turn the BODY and drag the camera along behind
     * it — so there is no way to see the character from the front, ever. These are an OFFSET added
     * to the camera's angles and to nothing else: the body keeps facing `yaw`, walking still goes
     * where the body is pointed, and aiming is still aiming.
     *
     * `freeLook` stays true after V comes back up, which is the "sticks that way" half. The first
     * mouse movement after that zeroes the offset and hands control back.
     */
    freeLook: false, freeYaw: 0, freePitch: 0,
    attackCooldown: 0, swing: 0,
    /**
     * DUAL WIELDING: each hand has its own clock and its own place in its weapon's pattern.
     * `mainStep` and `offStep` walk the sequence and reset when you stop, which is what makes a
     * combo a combo. See js/weapons.js.
     */
    offCooldown: 0, mainStep: 0, offStep: 0, idleSince: 0,
    /**
     * ROUND 14: A SWING IS THREE PARTS, NOT ONE FRAME.
     *
     *   press --[ windLeft ]--> the damage lands --[ recoverLeft ]--> the next swing is allowed
     *
     * `windLeft` is the commitment: while it is running you walk at 55% and the body is already
     * moving. `recoverLeft` is the weapon coming back — a press inside it is BUFFERED rather than
     * dropped, so an early click fires the instant recovery ends instead of being thrown away.
     * The off hand may only go during the main hand's recovery, which is what turns dual wielding
     * from a doubling into an interleave.
     *
     * The rule that makes all of it free: `wind + recover` is taken OUT of the weapon's `every`,
     * never added to it (js/weapons.js `swingTiming`), so the rate of fire is exactly what it was.
     */
    windLeft: 0, windSpan: 0, recoverLeft: 0, buffered: 0, windHand: 'main',
    offWindLeft: 0, offWindSpan: 0,
    /** Which clip the body should be playing for this swing. Read through js/actors.js. */
    swingClip: 'attack', swingRate: 1,
    /**
     * HOLD TO DRAW, HOLD TO CHARGE.
     *
     * `held` is how long the attack button has been down on a weapon that wants to be held: a bow's
     * draw, a crossbow's nothing, a staff's charge. `charge` is what the interface should draw —
     * 0..1 fill plus the power it is worth right now.
     */
    held: 0, charging: null, charge: null, drawing: 0,
    windPower: 1, windRecover: 0, windCharge: null,
    /** Consecutive connecting strikes, for the sword's momentum. Set by main.js/actors.js. */
    momentum: 0,
    attackEvery: b.attackEvery ?? 0.62,      // main.js keeps this in step with derived.attackEvery
    firstPerson: false, eyeHeight: 1.5,
    swimming: false, wading: false, waterDepth: 0, waterSurface: 0,
    mounted: false,
    /** `{ speed }` from js/vehicles.js while a ground vehicle is under you, else null. */
    driving: null,
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
  /** R27 M7 — a mount's `mountSlope` lets it take a little more than 63 degrees (js/ground.js). */
  const cliffOut = [0, 0];
  const cliffSure = () => (self.mounted && !self.driving ? Math.max(0, Math.min(0.8, sheet().mountSlope || 0)) : 0);
  const resolved = [0, 0];

  /**
   * Push out of anything solid, unless riding (a horse shoulders through undergrowth).
   *
   * `feet` is how high off the ground we are. Anything whose roof is already below it stops being
   * solid, so a wall you have genuinely cleared lets you through — "I cannot jump over walls and
   * structures even if I clear them by several feet".
   */
  function unstick(x, z, feet = null, fromX = null, fromZ = null) {
    let ox = x, oz = z;
    const from = fromX === null ? null : [fromX, fromZ];
    for (const field of obstacles) {
      if (!field) continue;
      field.resolve(ox, oz, self.radius, resolved, feet, from);
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
  /** Scratch for the camera shake, so a fight never allocates. */
  const shakeBuf = [0, 0, 0];

  function update(dt, input, { frozen = false } = {}) {
    const out = { attacked: false, landed: false, mountChanged: false, enteredWater: false };
    if (input) {
      const sens = opt('sensitivity', 1);
      const invert = opt('invertY', false) ? 1 : -1;
      /**
       * R14: hold V and the mouse swings the camera round the character rather than turning them.
       * First person is excluded — there is no camera to orbit when it is inside the head — and so
       * is anything that has frozen the controls.
       */
      const orbiting = !frozen && !self.firstPerson && !!input.keys?.has('KeyV');
      const stirred = input.look[0] !== 0 || input.look[1] !== 0;
      if (orbiting) {
        self.freeLook = true;
        self.freeYaw -= input.look[0] * 0.0026 * sens;
        self.freePitch = Math.max(-1.0, Math.min(1.1, self.freePitch + input.look[1] * 0.0022 * sens * invert));
      } else {
        // V is up. The camera holds where it was left until the mouse actually moves again.
        if (self.freeLook && stirred) { self.freeLook = false; self.freeYaw = 0; self.freePitch = 0; }
        if (!self.freeLook) {
          self.yaw -= input.look[0] * 0.0026 * sens;
          // positive pitch looks up. The old ceiling of 0.75 rad stopped you seeing the sky directly
          // overhead, which is the point of being on a planet with a system above it.
          self.pitch = Math.max(-1.25, Math.min(1.45, self.pitch + input.look[1] * 0.0022 * sens * invert));
        }
      }
      // H mounts and dismounts — but you cannot ride while swimming
      if (!frozen && input.pressed?.has('KeyH') && !self.swimming) {
        self.mounted = !self.mounted;
        out.mountChanged = true;
      }
    }
    /**
     * THE WORLD CAN HOLD STILL, AND THE MOUSE NEVER DOES.
     *
     * `feel.advance` is ticked here with the REAL dt because the controller is the one thing main.js
     * calls every single frame. Everything below it runs on `dt`, the scaled one — so a hit-stop
     * freezes the body, the swing clock and the enemies, and leaves looking around alone. A
     * hit-stop that fights your aim is nausea, not weight.
     */
    feel.setEnabled({ hitStop: opt('hitStop', true) !== false, screenShake: opt('screenShake', true) !== false });
    feel.debugHitboxes = opt('showHitboxes', false) === true;
    feel.advance(dt);
    dt = dt * feel.scale;

    if (self.attackCooldown > 0) self.attackCooldown -= dt;
    if (self.swing > 0) self.swing -= dt;
    if (self.offCooldown > 0) self.offCooldown -= dt;
    if (self.recoverLeft > 0) self.recoverLeft -= dt;
    if (self.buffered > 0) self.buffered -= dt;

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
    if (self.swimming && self.driving) { self.driving = null; out.leftVehicle = true; }   // nor will a motorcycle
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
    /**
     * WEIGHT: YOU ARE COMMITTED WHILE THE SWING IS COMING ROUND.
     *
     * A greatsword you can walk out of mid-swing weighs nothing. During the wind-up the legs go to
     * 55%, and while a staff is building or a bow is drawn they go to 60% — enough to shuffle, not
     * enough to kite. The MOUSE is deliberately left alone: slowing the look while a player is
     * lining up a shot is the difference between weight and a fight with the controls.
     */
    const committed = self.windLeft > 0 || self.offWindLeft > 0;
    const commitK = committed ? COMBAT_FEEL.windCommitSpeed : (self.held > 0 && self.charging) ? (STAFF_CHARGE.moveWhile ?? 0.6) : 1;

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
        /**
         * …and the gallop on top of it — see `gallopLeft` above. A mount asked to run flat out goes
         * `gallopBonus` faster until its wind runs out, then drops back to a canter; the seconds it
         * has are `gallopSeconds` plus whatever `cond_mountStamina` adds.
         */
        if (self.mounted) {
          const total = (b.gallopSeconds ?? 4) + (sheet().mountStamina || 0);
          if (input.run && self.gallopLeft > 0) {
            self.galloping = true;
            self.gallopLeft = Math.max(0, self.gallopLeft - dt);
            speed *= b.gallopBonus ?? 1.35;
          } else {
            self.galloping = false;
            // it gets its wind back at a third of the rate it spends it, up to its own total
            self.gallopLeft = Math.min(total, self.gallopLeft + dt * ((b.gallopRecover ?? 0.34)));
          }
        } else {
          self.galloping = false;
        }
        const steep = terrain.slopeAt(self.x, self.z, 2);
        /**
         * A GROUND VEHICLE IS NOT A FASTER HORSE.
         *
         * `self.driving` is set by main.js from js/vehicles.js's `speedOn`, which already knows the
         * surface, the slope and how worn the thing is — a motorcycle is quick on a road and
         * useless up a bank, a truck is slow everywhere and does not care. So when one is under you
         * the speed is REPLACED rather than multiplied: the hill penalty below belongs to legs and
         * hooves, and applying it on top would charge the slope twice.
         */
        if (self.driving && self.driving.speed > 0) {
          speed = self.driving.speed * (input.run ? 1 : 0.62);   // the throttle is Shift
        } else {
          // …and a surefooted mount loses less of it to a hill, which is what the Dray Elk is FOR
          const sure = self.mounted ? Math.max(0, Math.min(0.8, sheet().mountSlope || 0)) : 0;
          speed *= 1 / (1 + Math.max(0, steep) * 1.6 * (1 - sure));
          /**
           * R27 M7 — THE ROAD IS THE QUICK WAY. On a road (`roadAt` past `roads.threshold`) feet go
           * `roads.walk` faster and hooves `roads.mount`, and a highway adds `roads.highway` on top.
           * HERE AND NOWHERE ELSE: this is the legs-and-hooves branch. A ground vehicle's speed is
           * REPLACED above from js/vehicles.js `speedOn`, which already has its own `spec.road`
           * factor, so putting the road on it here would pay the road twice.
           */
          const roads = balance.roads || {};
          if ((terrain.roadAt?.(self.x, self.z) || 0) > (roads.threshold ?? 0.45)) {
            speed *= self.mounted ? (roads.mount ?? 1.25) : (roads.walk ?? 1.15);
            if (terrain.roadClassAt?.(self.x, self.z) === 'highway') speed *= roads.highway ?? 1.1;
          }
        }
      }
      /**
       * R27 M6 — WADING IS A SLOWER WALK. Water over your feet that you are not swimming in — a
       * ford's stones, a beach, the edge of a stream — costs `wadeSpeed` of the pace, on foot, on
       * a mount and in a vehicle alike. Swimming still needs `swimDepth` (1.3 m), so a ford
       * (0.3 m, js/ground.js `WADE_DEPTH` is the most a ford may be) is never swum.
       */
      if (!self.swimming && !(self.boating && self.wading) && self.waterDepth > 0.05 && self.y < self.waterSurface + 0.3) speed *= b.wadeSpeed ?? 0.65;
      // the swing you are already committed to takes the legs out from under you
      speed *= commitK;
      forward.set(Math.sin(self.yaw), 0, Math.cos(self.yaw));
      // right-hand side of `forward` is forward x up, which is (-cos, 0, sin)
      right.set(-forward.z, 0, forward.x);
      const dx = forward.x * input.forward + right.x * input.strafe;
      const dz = forward.z * input.forward + right.z * input.strafe;
      const len = Math.hypot(dx, dz) || 1;
      let nx = self.x + (dx / len) * speed * dt;
      let nz = self.z + (dz / len) * speed * dt;
      [nx, nz] = terrain.clampToWorld(nx, nz);
      // R27 M7 — a cliff is a wall (js/ground.js `cliffStep`): the part of the step up a face past
      // 63 degrees is refused, the part along it is kept, and three seconds of pushing scrambles up
      if (!self.swimming) [nx, nz] = cliffStep(terrain, self, nx, nz, dt, { sure: cliffSure(), feet: self.y }, cliffOut);
      // R23: say where the step started, so a thin wall cannot be stepped through in one frame
      [nx, nz] = unstick(nx, nz, self.y, self.x, self.z);
      [self.x, self.z] = terrain.clampToWorld(nx, nz);
    } else if (!frozen) {
      // even standing still, never be left inside something that was just built around you
      const [cx, cz] = unstick(self.x, self.z, self.y);
      self.x = cx; self.z = cz;
    }
    // R27 M7 — standing ON a face (a landing, an edit, a spawn) slides you back down it
    if (!frozen && !self.swimming && cliffSlide(terrain, self, dt, { sure: cliffSure(), feet: self.y })) {
      const [sx, sz] = unstick(...terrain.clampToWorld(self.x, self.z), self.y);
      [self.x, self.z] = terrain.clampToWorld(sx, sz);
      // …ON the face, not off the edge of it: the feet follow the slope down
      self.y = Math.min(self.y, groundAt(terrain, self.x, self.z, self.y));
    }
    self.moving = speed;
    self.running = !!(input && input.run && speed > 0 && !self.swimming && commitK >= 1);

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
    // ONE SWING IS THREE PARTS. Round 14 split it:
    //
    //   press --[ wind-up ]--> the damage lands --[ recovery ]--> the next swing is allowed
    //
    // Before this, everything happened on the frame the button went down: no wind-up, no impact, no
    // recovery, no commitment and no cancel. `control.swing = 0.35` existed only so the renderer
    // could pick the attack clip. There was nothing to feel.
    //
    // The rule that makes the split free is that `wind + recover` comes OUT of the weapon's own
    // `every`, never on top of it (js/weapons.js `swingTiming`), so the rate of fire — and every
    // damage-per-second number in the game — is exactly what it was before.
    //
    // Two hands, two clocks, and the off hand may not be in its wind-up while the main hand is in
    // its own. That is what makes dual wielding an interleave rather than a doubling.
    const canSwing = !frozen && !self.mounted && !self.swimming;
    const plan = sheet().swing || null;
    const mainPlan = plan?.main || null;
    const offPlan = plan?.off || null;
    let holding = !!(canSwing && input?.attack);
    const stepOf = (p, step) => (p?.steps?.length ? p.steps[step % p.steps.length] : null);
    /** Haste is folded into `mainEvery` by main.js, so the ratio recovers it for the wind-up too. */
    const hasteOf = (sp, every) => (sp?.every > 0 && every > 0 ? every / sp.every : 1);

    /** The damage lands. `power` rides along for a drawn bow and a charged staff. */
    const landMain = () => {
      self.windLeft = 0;
      out.attacked = true;
      out.hand = 'main';
      out.step = self.mainStep;
      out.power = self.windPower || 1;
      // the arrow that is about to leave the bow needs to know what the draw was worth; main.js
      // does not pass `step.power` on to `fx.shoot`, so it goes through the channel instead
      feel.swing.shotPower = out.power;
      if (self.windCharge) out.charge = self.windCharge;
      self.windCharge = null;
      self.mainStep++;
      self.recoverLeft = self.windRecover || 0;
    };
    const landOff = () => {
      self.offWindLeft = 0;
      out.attackedOff = true;
      out.offStep = self.offStep;
      self.offStep++;
    };

    if (!canSwing) {
      self.windLeft = 0; self.offWindLeft = 0; self.recoverLeft = 0; self.buffered = 0;
      self.held = 0; self.charge = null; self.drawing = 0; self.charging = null;
    } else {
      // a swing already in the air comes down when its wind-up runs out
      if (self.windLeft > 0) { self.windLeft -= dt; if (self.windLeft <= 0) landMain(); }
      if (self.offWindLeft > 0) { self.offWindLeft -= dt; if (self.offWindLeft <= 0) landOff(); }

      if (holding) self.idleSince = 0;
      else {
        self.idleSince += dt;
        if (self.idleSince > (b.comboResetSeconds ?? 1.1)) {
          self.mainStep = 0; self.offStep = 0; self.momentum = 0;
        }
      }

      /**
       * HOLD TO DRAW, HOLD TO CHARGE.
       *
       * A bow used to loose an arrow every 0.52 s because it fell through to the light-melee swing
       * clock — no draw, no nock, no aim. A staff cast a free area spell every 0.6 s. Both are now
       * held: the button down builds it, the button up fires it, and letting go too early is a
       * refusal rather than a weak shot.
       */
      const hold = mainPlan?.hold || null;                  // 'draw' | 'charge' | null
      self.charging = hold === 'charge' ? true : null;
      if (hold) {
        /**
         * HOLDING THE BUTTON MUST STILL ATTACK.
         *
         * "Change it so holding down the mouse button repeatedly attacks (with all weapons)" is an
         * older request and it still stands. A weapon you have to RELEASE to fire breaks it: hold
         * the mouse on a bow and it would draw for ever and never loose. So a draw held past full,
         * or a channel held past its ceiling, releases itself — hold the button and you get a
         * steady stream of full-power shots, let go early and you get the weaker one you asked for.
         */
        const top = hold === 'draw' ? (mainPlan.draw?.full ?? 0.95) : (mainPlan.charge?.max ?? 2.6);
        const autoLoose = holding && self.held >= top;
        if (autoLoose) holding = false;
        /**
         * A CLICK STILL SHOOTS — it just shoots badly.
         *
         * The design refuses a release under 0.35 s outright ("you have not nocked"). With the
         * draw meter not yet on the HUD (see research/round14-combat-handoff.md §12) that reads as
         * a broken bow rather than as a lesson, so a draw that has not reached the nock keeps
         * going on its own after the button comes up: a click gets you a 0.55x shot a third of a
         * second later, and holding gets you the 1.60x one. Nothing is ever thrown away, and the
         * difference between the two is something you can see rather than something you are told.
         */
        if (hold === 'draw' && !holding && self.held > 0 && self.held < (mainPlan.draw?.min ?? 0.35)) {
          holding = true;
        }
        if (holding && self.attackCooldown <= 0) {
          self.held += dt;
          if (hold === 'draw') {
            const d = drawPower(mainPlan.draw, self.held);
            self.drawing = d.draw;
            self.charge = { fill: d.draw, power: d.power, ready: d.ready, shaky: !!d.shaky, kind: 'draw' };
            self.swing = 0.2;
            self.swingClip = 'shoot';
            feel.swing.clip = 'shoot';
          } else {
            const c = chargeAt(self.held, mainPlan.charge);
            // the channel drinks mana, and it stops building when there is none left
            const want = (mainPlan.charge?.mana ?? STAFF_CHARGE.mana) * dt;
            const paid = sheet().spendMana ? sheet().spendMana(want) : want;
            if (paid < want * 0.5 && self.held > (mainPlan.charge?.min ?? STAFF_CHARGE.min)) {
              self.held = Math.max(self.held - dt, mainPlan.charge?.min ?? STAFF_CHARGE.min);
            }
            self.charge = { fill: c.fill, power: c.power, radius: c.radius, ready: c.ready, tap: c.tap, kind: 'charge' };
            self.swing = 0.2;                       // keep the body in its attack pose while it builds
            self.swingClip = mainPlan.channelClip || 'channel';
            feel.swing.clip = self.swingClip;
          }
        } else if (self.held > 0) {
          // let go: this is the shot
          const held = self.held;
          self.held = 0; self.drawing = 0;
          const fire = hold === 'draw' ? drawPower(mainPlan.draw, held) : chargeAt(held, mainPlan.charge);
          const allowed = hold === 'draw' ? fire.ready : true;     // a staff tap is still a cast
          if (allowed && self.attackCooldown <= 0) {
            self.windPower = fire.power;
            self.windCharge = hold === 'charge'
              ? { power: fire.power, radius: fire.radius, tap: !!fire.tap, fill: fire.fill }
              : { power: fire.power, draw: fire.draw, kind: 'draw' };
            self.windRecover = 0;
            self.attackCooldown = hold === 'draw' ? (mainPlan.afterShot ?? 0.12) : (mainPlan.afterCast ?? 0.28);
            self.swing = 0.35;
            self.swingClip = hold === 'draw' ? 'shoot' : 'castStaff';
            feel.swing.clip = self.swingClip;
            feel.swing.seq = (feel.swing.seq || 0) + 1;
            landMain();
          }
          self.charge = null;
        } else {
          self.charge = null;
        }
      } else {
        /**
         * A MELEE SWING, AND THE BUFFER THAT MAKES IT FEEL RESPONSIVE.
         *
         * A press that arrives during recovery used to be thrown away, so a player pressing in
         * rhythm with the animation kept dropping swings. It is remembered for 180 ms instead and
         * fires the instant recovery ends.
         */
        if (holding && (self.recoverLeft > 0 || self.attackCooldown > 0)) self.buffered = COMBAT_FEEL.inputBufferSeconds;
        const want = holding || self.buffered > 0;
        if (want && self.attackCooldown <= 0 && self.windLeft <= 0 && self.recoverLeft <= 0) {
          const sp = stepOf(mainPlan, self.mainStep);
          let every = self.mainEvery ?? self.attackEvery ?? b.attackEvery ?? 0.62;
          const hk = hasteOf(sp, every);
          // a sabre rewards hitting: stay in the rhythm and the finisher costs a third of its clock
          const steps = mainPlan?.steps?.length || 1;
          if (mainPlan?.flow && self.mainStep > 0 && (self.mainStep % steps) === steps - 1) every *= 0.35;
          let wind = ((sp?.windMs ?? 0) / 1000) * hk;
          let recover = wind * 0.45;
          const room = every * 0.9;
          if (wind + recover > room && wind + recover > 0) { const k = room / (wind + recover); wind *= k; recover *= k; }
          self.attackCooldown = every;
          self.windLeft = wind; self.windSpan = wind; self.windRecover = recover;
          self.windPower = 1; self.windCharge = null;
          self.buffered = 0;
          // the body starts moving NOW, not when the damage lands
          self.swing = Math.max(0.2, wind + recover + 0.12);
          self.swingClip = sp?.clip || 'attack';
          feel.swing.clip = self.swingClip;
          feel.swing.seq = (feel.swing.seq || 0) + 1;      // R25: a new swing restarts its clip
          // stretch the clip to the swing it is actually playing, so a hasted character speeds up
          self.swingRate = sp?.clipSeconds > 0 ? Math.max(0.35, Math.min(2.6, sp.clipSeconds / Math.max(0.12, wind + recover))) : 1;
          if (wind <= 0) landMain();
        }

        /**
         * THE OFF HAND, and the one rule that keeps it honest: it may not be winding up while the
         * main hand is. Two weapons can no longer land on the same frame.
         */
        if (self.dualWield && holding && self.offCooldown <= 0 && self.offWindLeft <= 0 && self.windLeft <= 0) {
          const sp = stepOf(offPlan, self.offStep);
          const every = self.offEvery ?? self.attackEvery ?? b.attackEvery ?? 0.62;
          const hk = hasteOf(sp, every);
          let wind = ((sp?.windMs ?? 0) / 1000) * hk;
          if (wind + wind * 0.45 > every * 0.9) wind = every * 0.9 / 1.45;
          self.offCooldown = every;
          self.offWindLeft = wind; self.offWindSpan = wind;
          self.swing = Math.max(self.swing, wind + 0.2);
          // the off hand plays the OFF HAND's clip (offSlash / offThrust) — it used to replay the
          // main hand's last swing, so a second weapon never visibly swung
          self.swingClip = sp?.clip || 'offSlash';
          feel.swing.clip = self.swingClip;
          feel.swing.seq = (feel.swing.seq || 0) + 1;
          self.swingRate = sp?.clipSeconds > 0 ? Math.max(0.35, Math.min(2.6, sp.clipSeconds / Math.max(0.12, wind * 1.45))) : 1;
          if (wind <= 0) landOff();
        }
      }
    }
    // --- the camera
    // It sits behind the player ALONG THE VIEW RAY and looks down it. That is the trick for looking
    // up: when the ground is in the way we shorten the distance instead of lifting the camera, so
    // the direction you are looking never changes — you can put your back to a hill and still see
    // straight up into space. It is then nudged over the character's shoulder so the body does not
    // sit in the middle of the screen.
    /**
     * R14: the camera looks along yaw+freeYaw. With free look off both offsets are zero and this is
     * exactly what it was. `self.yaw` itself is untouched, which is what keeps the body facing
     * forward while you walk round it.
     */
    const camYaw = self.yaw + (self.freeLook ? self.freeYaw : 0);
    const camPitch = Math.max(-1.25, Math.min(1.45, self.pitch + (self.freeLook ? self.freePitch : 0)));
    const cp = Math.cos(camPitch);
    const lookX = Math.sin(camYaw) * cp;
    const lookY = Math.sin(camPitch);
    const lookZ = Math.cos(camYaw) * cp;
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
      const k1 = feel.cameraOffset(shakeBuf);
      camera.position.set(camX + k1[0], camY + k1[1], camZ + k1[2]);
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
    /**
     * SCREEN SHAKE — position only, never rotation.
     *
     * Rotating the camera moves the crosshair and ruins the shot you were lining up, which is the
     * single most common way shake is done badly. The amplitude and the direction come out of
     * js/combat-feel.js, which biases it 70% along the way the blow went.
     */
    const k2 = feel.cameraOffset(shakeBuf);
    camera.position.set(camX + k2[0], camY + k2[1], camZ + k2[2]);
    camera.lookAt(camX + lookX, camY + lookY, camZ + lookZ);

    return out;
  }

  /** Drop the player somewhere else on the planet (used by the map and the tests). */
  function teleport(x, z) {
    // R14: a camera swung round behind you is not something to carry across a teleport
    self.freeLook = false; self.freeYaw = 0; self.freePitch = 0;
    [self.x, self.z] = terrain.clampToWorld(x, z);
    // R23: dropped on to a bridge, you arrive on its deck, not on the river bed under it
    self.y = groundAt(terrain, self.x, self.z);
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
