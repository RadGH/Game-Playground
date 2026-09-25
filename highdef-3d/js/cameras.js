// Two cameras that are really one camera.
//
// There is a single perspective camera in the scene. Each mode works out where it WANTS the camera
// to be and what it wants it to look at; a damper then chases those two points. Switching mode
// does not teleport — it just changes which mode is producing the target, and the same damper
// flies the camera across. That is why the change from the strategy view down to the character's
// shoulder reads as a move rather than a cut.
//
//   overhead — the strategy view. Free movement over the map at a fixed pitch, wheel to zoom,
//              right-drag or Z/X to spin, and a true isometric option that swaps the perspective
//              camera for an orthographic one (which is what "isometric" actually means: no
//              perspective at all, so two buildings the same size draw the same size).
//   follow   — third person, over the character's left shoulder, mouse to look, and a ray down to
//              the ground so the camera rides up over a hill instead of burrowing into it.

import * as THREE from 'three';

const MODES = ['overhead', 'follow'];

export function createCameras(world, { fov = 55, aspect = 16 / 9 } = {}) {
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.25, 6000);
  const ortho = new THREE.OrthographicCamera(-60, 60, 34, -34, -2000, 6000);
  camera.position.set(0, 60, 80);

  const state = {
    mode: 'overhead',
    isometric: false,
    // overhead
    focus: new THREE.Vector3(0, 0, 0),   // the point on the ground the view is centred on
    height: 52,                           // metres above that point
    pitch: THREE.MathUtils.degToRad(52),  // how far down it looks
    yaw: THREE.MathUtils.degToRad(35),
    zoom: 1,
    // follow
    followYaw: 0,
    followPitch: THREE.MathUtils.degToRad(15),
    followDist: 5.2,
    shoulder: 0.55,
    // shared
    blend: 0,           // 0 fully overhead, 1 fully follow — the damper handles the in-between
    fovBase: fov,
  };

  const desiredPos = new THREE.Vector3();
  const desiredLook = new THREE.Vector3();
  const smoothPos = new THREE.Vector3().copy(camera.position);
  const smoothLook = new THREE.Vector3();
  const _v = new THREE.Vector3();
  const _v2 = new THREE.Vector3();

  /** Overhead: where the camera sits for the current focus / height / angles. */
  function overheadTarget(out, outLook) {
    const h = state.height * state.zoom;
    const horiz = h / Math.tan(state.pitch);
    out.set(
      state.focus.x - Math.sin(state.yaw) * horiz,
      world.heightAt(state.focus.x, state.focus.z) + h,
      state.focus.z - Math.cos(state.yaw) * horiz
    );
    outLook.copy(state.focus);
    outLook.y = world.heightAt(state.focus.x, state.focus.z);
  }

  /** Follow: behind and slightly above the character, pushed out of any hill in the way. */
  function followTarget(out, outLook, subject) {
    const head = _v.copy(subject.position);
    head.y += subject.eyeHeight ?? 1.6;

    const dist = state.followDist * state.zoom;
    const cp = Math.cos(state.followPitch), sp = Math.sin(state.followPitch);
    // `dir` points from the camera toward the head, so its y has to be NEGATIVE for a camera that
    // sits above and looks down. With it positive the camera ends up a metre BELOW the head —
    // about knee height — which is not obviously wrong until you notice you are looking up at
    // everything.
    const dir = _v2.set(
      -Math.sin(state.followYaw) * cp,
      -sp,
      -Math.cos(state.followYaw) * cp
    );
    out.copy(head).addScaledVector(dir, -dist);
    // over the shoulder rather than dead centre — it reads as a person rather than a turret
    const right = new THREE.Vector3(Math.cos(state.followYaw), 0, -Math.sin(state.followYaw));
    out.addScaledVector(right, state.shoulder);
    head.addScaledVector(right, state.shoulder * 0.55);

    // do not let the ground swallow the camera
    const ground = world.heightAt(out.x, out.z);
    const clearance = 0.65;
    if (out.y < ground + clearance) out.y = ground + clearance;
    // …and if the hill between us is higher than the camera, pull in until it is not
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = THREE.MathUtils.lerp(head.x, out.x, t);
      const pz = THREE.MathUtils.lerp(head.z, out.z, t);
      const py = THREE.MathUtils.lerp(head.y, out.y, t);
      const g = world.heightAt(px, pz) + clearance;
      if (py < g) {
        out.set(px, Math.max(py, g), pz);
        break;
      }
    }
    outLook.copy(head);
  }

  /**
   * One frame.
   * @param dt seconds
   * @param input from input.js
   * @param subject { position, eyeHeight, facing } — the character, when there is one
   */
  function update(dt, input, subject) {
    const wantFollow = state.mode === 'follow' && subject;
    // The blend is what actually animates: everything else just feeds it.
    //
    // Two details. The rate is `1 - exp(-k * dt)` rather than `dt * k`, so a page running at
    // fifteen frames a second blends over the same number of SECONDS as one running at sixty
    // rather than taking four times as long. And it is snapped at the end, because an
    // exponential ease never actually arrives: on a slow frame it was still 8% short of the
    // third-person position after five seconds, which put the camera four metres too high and
    // looked like a camera bug rather than an unfinished transition.
    const wantBlend = wantFollow ? 1 : 0;
    state.blend += (wantBlend - state.blend) * (1 - Math.exp(-4.5 * dt));
    if (Math.abs(wantBlend - state.blend) < 0.002) state.blend = wantBlend;

    if (state.mode === 'overhead') updateOverhead(dt, input);
    else updateFollow(dt, input, subject);

    // work out both targets and mix them, so a half-finished switch is a sensible place to be
    const posA = new THREE.Vector3(), lookA = new THREE.Vector3();
    const posB = new THREE.Vector3(), lookB = new THREE.Vector3();
    overheadTarget(posA, lookA);
    if (subject) followTarget(posB, lookB, subject); else { posB.copy(posA); lookB.copy(lookA); }
    const k = smoothstep01(state.blend);
    desiredPos.lerpVectors(posA, posB, k);
    desiredLook.lerpVectors(lookA, lookB, k);

    // A critically damped chase: fast enough to feel attached, slow enough to smooth out the
    // one-frame jitter you get from reading the ground height as you walk.
    const lag = state.mode === 'follow' ? 12 : 9;
    const a = 1 - Math.exp(-lag * dt);
    smoothPos.lerp(desiredPos, a);
    smoothLook.lerp(desiredLook, a);

    camera.position.copy(smoothPos);
    camera.lookAt(smoothLook);

    // a touch of extra field of view when sprinting reads as speed
    const speedFov = subject && subject.speed ? THREE.MathUtils.clamp((subject.speed - 3) * 1.4, 0, 8) : 0;
    camera.fov += (state.fovBase + speedFov * k - camera.fov) * Math.min(1, dt * 3);
    camera.updateProjectionMatrix();

    if (state.isometric) syncOrtho();
  }

  function updateOverhead(dt, input) {
    const fast = input.held('sprint') ? 3.2 : 1;
    const pan = 26 * state.zoom * fast * dt;
    const fwd = new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw));
    const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    const mx = input.axis('left', 'right');
    const mz = input.axis('back', 'forward');
    state.focus.addScaledVector(fwd, mz * pan);
    state.focus.addScaledVector(right, mx * pan);

    // right-drag or middle-drag spins and tilts
    if (input.state.buttons.has(2) || input.state.buttons.has(1)) {
      state.yaw -= input.state.mouseDX * 0.005;
      state.pitch = THREE.MathUtils.clamp(state.pitch + input.state.mouseDY * 0.004,
        THREE.MathUtils.degToRad(14), THREE.MathUtils.degToRad(88));
    }
    state.yaw += (input.axis('rotateLeft', 'rotateRight')) * dt * 1.4;

    if (input.state.wheel) {
      state.zoom = THREE.MathUtils.clamp(state.zoom * (1 + input.state.wheel * 0.12), 0.18, 6.0);
    }
    state.height += (input.axis('down', 'up')) * dt * 30;
    state.height = THREE.MathUtils.clamp(state.height, 14, 260);

    // stay over the map
    const lim = world.size / 2 - 8;
    state.focus.x = THREE.MathUtils.clamp(state.focus.x, -lim, lim);
    state.focus.z = THREE.MathUtils.clamp(state.focus.z, -lim, lim);
  }

  function updateFollow(dt, input, subject) {
    const look = input.state.pointerLocked || input.state.buttons.has(0) || input.state.buttons.has(2);
    if (look) {
      state.followYaw -= input.state.mouseDX * 0.0026;
      state.followPitch = THREE.MathUtils.clamp(
        state.followPitch + input.state.mouseDY * 0.0022,
        THREE.MathUtils.degToRad(-32), THREE.MathUtils.degToRad(68));
    }
    if (input.state.wheel) {
      state.zoom = THREE.MathUtils.clamp(state.zoom * (1 + input.state.wheel * 0.12), 0.35, 3.4);
    }
    void subject;
  }

  /** Keep the orthographic camera lined up with the perspective one for the isometric mode. */
  function syncOrtho() {
    const h = state.height * state.zoom;
    const halfH = h * 0.62;
    const halfW = halfH * camera.aspect;
    ortho.left = -halfW; ortho.right = halfW;
    ortho.top = halfH; ortho.bottom = -halfH;
    ortho.position.copy(camera.position);
    ortho.quaternion.copy(camera.quaternion);
    ortho.updateProjectionMatrix();
  }

  function setMode(mode, subject) {
    if (!MODES.includes(mode)) return;
    state.mode = mode;
    if (mode === 'follow') {
      state.zoom = 1;
      if (subject) {
        // start looking the way the character is facing, so the switch does not spin the world
        state.followYaw = subject.facing ?? state.yaw;
      }
    } else {
      state.zoom = 1;
      if (subject) state.focus.copy(subject.position);
      state.pitch = THREE.MathUtils.degToRad(52);
    }
  }

  function setAspect(aspect) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (state.isometric) syncOrtho();
  }

  /** The camera the renderer should actually use this frame. */
  function active() {
    return (state.isometric && state.mode === 'overhead') ? ortho : camera;
  }

  function setIsometric(on) {
    state.isometric = !!on;
    if (state.isometric) {
      // A true isometric view is 45 degrees around and about 35.26 degrees down. Snapping to it
      // is what makes the grid look right; anything else just looks like a tilted camera.
      state.yaw = THREE.MathUtils.degToRad(45);
      state.pitch = Math.atan(Math.SQRT1_2 * Math.SQRT2 / 1) ; // ~35.26 degrees from horizontal
      state.pitch = THREE.MathUtils.degToRad(35.264);
      syncOrtho();
    }
  }

  return {
    camera, ortho, state, update, setMode, setAspect, active, setIsometric,
    get mode() { return state.mode; },
    /** Drop the overhead view onto a point (used by "jump to character"). */
    focusOn(x, z) { state.focus.set(x, world.heightAt(x, z), z); },
  };
}

function smoothstep01(t) { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); }
