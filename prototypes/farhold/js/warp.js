// Farhold — the jump between stars.
//
// *"This should enter 'warp drive' mode with star-trail effects like seen in Star Trek or No Man's
// Sky for about 5 seconds until you appear in the new system."*
//
// Both of those looks are the same idea done at different intensities: a field of points ahead of
// you, stretched along the direction of travel by however fast you are going. So this is one buffer
// of line segments in a tube around the camera, each with a length that grows as the drive spins up
// and shrinks as it falls out — which gives the snap into the tunnel and the settle at the far end
// for free, from one number.
//
//   const warp = createWarp({ scene });
//   warp.start({ from, to, seconds: 5 });
//   const phase = warp.update(dt, camera);   // { t, intensity, done }
//
// The streaks live in their own group parented to nothing: they are moved to the camera every frame,
// so the tunnel is always around you no matter which scene is being drawn behind it.

import * as THREE from 'three';

const DEFAULTS = {
  streaks: 900,
  radius: 420,        // how wide the tube is
  depth: 2600,        // how far ahead and behind it reaches
  seconds: 5,
  maxLength: 520,     // the longest a streak stretches at full warp
  spinUp: 0.22,       // the share of the jump spent accelerating…
  spinDown: 0.26,     // …and slowing down again
};

export function createWarp({ scene = null, opts = {} } = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const n = cfg.streaks;

  // two vertices a streak: the head, and the tail behind it
  const positions = new Float32Array(n * 6);
  const colors = new Float32Array(n * 6);
  const seeds = new Float32Array(n * 3);          // the resting position of each streak's head

  const colour = new THREE.Color();
  for (let i = 0; i < n; i++) {
    // an even-ish spread through a tube around the flight axis
    const a = Math.random() * Math.PI * 2;
    const r = cfg.radius * (0.12 + Math.pow(Math.random(), 0.6) * 0.88);
    seeds[i * 3] = Math.cos(a) * r;
    seeds[i * 3 + 1] = Math.sin(a) * r;
    seeds[i * 3 + 2] = (Math.random() - 0.5) * cfg.depth;
    // cold blue-white in the middle of the tube, warmer out at the walls
    colour.setHSL(0.58 - (r / cfg.radius) * 0.12, 0.25 + Math.random() * 0.4, 0.62 + Math.random() * 0.3);
    for (const v of [0, 1]) {
      colors[(i * 2 + v) * 3] = colour.r;
      colors[(i * 2 + v) * 3 + 1] = colour.g;
      colors[(i * 2 + v) * 3 + 2] = colour.b;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const lines = new THREE.LineSegments(geometry, material);
  lines.frustumCulled = false;
  lines.name = 'farhold-warp';
  lines.visible = false;

  const group = new THREE.Group();
  group.add(lines);
  group.name = 'farhold-warp-group';
  if (scene) scene.add(group);

  const state = {
    running: false,
    elapsed: 0,
    seconds: cfg.seconds,
    from: null, to: null,
    intensity: 0,
    travelled: 0,
  };

  const forward = new THREE.Vector3(0, 0, 1);
  const quat = new THREE.Quaternion();

  /** Begin a jump. `from` and `to` are the stars, kept only so the caller can read them back. */
  function start({ from = null, to = null, seconds = cfg.seconds } = {}) {
    state.running = true;
    state.elapsed = 0;
    state.seconds = Math.max(0.5, seconds);
    state.from = from; state.to = to;
    state.travelled = 0;
    lines.visible = true;
    return state;
  }

  function stop() {
    state.running = false;
    state.intensity = 0;
    lines.visible = false;
    material.opacity = 0;
    return state;
  }

  /**
   * The shape of the jump over time: nothing, then a hard ramp into the tunnel, a long stretch at
   * full speed, then a ramp back out. Returned separately from `update` so a test can check the
   * curve without a camera.
   */
  function intensityAt(t) {
    if (t <= 0 || t >= 1) return 0;
    if (t < cfg.spinUp) {
      const k = t / cfg.spinUp;
      return k * k;                                  // a hard ramp in — the drive catches
    }
    if (t > 1 - cfg.spinDown) {
      const k = (1 - t) / cfg.spinDown;
      return k * k * (3 - 2 * k);                    // and an ease out the other side
    }
    return 1;
  }

  /** One frame. Returns the phase so the caller can fade its own scene to match. */
  function update(dt, camera = null) {
    if (!state.running) return { t: 0, intensity: 0, done: true };
    state.elapsed += dt;
    const t = Math.min(1, state.elapsed / state.seconds);
    const intensity = intensityAt(t);
    state.intensity = intensity;
    state.travelled += intensity * dt;

    if (camera) {
      group.position.copy(camera.position);
      group.quaternion.copy(camera.quaternion);
    }

    // stretch each streak backwards along the tube, and scroll it toward you
    const length = cfg.maxLength * intensity;
    const scroll = (state.travelled * 2400) % cfg.depth;
    const half = cfg.depth / 2;
    for (let i = 0; i < n; i++) {
      const x = seeds[i * 3], y = seeds[i * 3 + 1];
      // wrap into the tube so the field never runs out
      let z = seeds[i * 3 + 2] - scroll;
      z = ((z + half) % cfg.depth + cfg.depth) % cfg.depth - half;
      const o = i * 6;
      positions[o] = x; positions[o + 1] = y; positions[o + 2] = z + length;
      positions[o + 3] = x; positions[o + 4] = y; positions[o + 5] = z;
    }
    geometry.attributes.position.needsUpdate = true;
    material.opacity = Math.min(1, intensity * 1.15);

    const done = t >= 1;
    if (done) stop();
    return { t, intensity, done, seconds: state.seconds };
  }

  return {
    group, lines, state, cfg,
    start, stop, update, intensityAt,
    get running() { return state.running; },
    /** Attach to a different scene — the space scene is thrown away and rebuilt on arrival. */
    attach(next) {
      group.parent?.remove(group);
      next?.add(group);
    },
    dispose() {
      group.parent?.remove(group);
      geometry.dispose();
      material.dispose();
    },
  };
}
