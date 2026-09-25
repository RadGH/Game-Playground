// Farhold R23 — the character on the title screen, in 3D.
//
// "Update the character editor to show the 3d model instead of the 2d avatar."
//
// The body is made by `makeActor` from js/actors.js, which is the call main.js makes for the player
// (`makeActor({ avatar, swim: true })` → Chibi 2 with the combat clips), and it is dressed by
// js/titlelook.js, which repeats `applyGearLook()`. So what turns on this stand is the same model,
// the same parts and the same weapon you walk out of the title screen with.
//
//   import { createFigureView } from './figure3d.js';
//   const view = createFigureView(hostElement);
//   await view.show(avatar);   // build or re-dress the body; safe to call on every keystroke
//   view.dispose();            // the WebGL context goes with it
//
// ONE SMALL RENDERER OF ITS OWN, and it is thrown away when the title closes. The game's renderer
// is made in `begin()` after `runTitle` resolves, so while the title is up this is the only context
// on the page, and `dispose()` calls `forceContextLoss()` so the browser gets it back straight away
// rather than whenever garbage collection gets round to it. The appearance editor and the class
// builder do not make views of their own: `attach(box)` moves this canvas into them while they are
// open and `restore()` puts it back, so the whole title uses exactly one context.
//
// IT ONLY DRAWS WHILE IT CAN BE SEEN. The loop checks the host is on screen (`offsetParent`) and
// sleeps otherwise, so the world step, with its own worker building a map, does not pay for a
// character nobody is looking at.
//
// FOR THE TESTS: the canvas carries `data-rendered` (frames drawn) and `data-look` (a short key for
// the avatar last shown), and `canvas.__figure.sample()` renders one frame and counts the pixels
// that are not background — a WebGL canvas reads back blank outside the frame it was drawn in, so
// the count has to be taken inside the same call that draws.

import * as THREE from 'three';
import { makeActor } from './actors.js';

/** A short, stable key for an avatar — enough to tell the tests "this is a different look". */
function lookKey(avatar) {
  const s = JSON.stringify(avatar || {});
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/**
 * @param {HTMLElement} host  the box the canvas fills; its CSS decides the size
 * @param {object} [opts]
 * @param {number} [opts.spin=0.52]  how fast it sways, in radians of phase a second (0 holds it still)
 * @param {boolean} [opts.drag=true] drag to turn the figure by hand
 */
export function createFigureView(host, { spin = 0.52, drag = true } = {}) {
  const home = host;
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    // no WebGL at all: say so in the box rather than leave a hole
    const p = document.createElement('p');
    p.className = 'figure-none small muted';
    p.textContent = 'This browser cannot draw 3D, so the character preview is off.';
    host.replaceChildren(p);
    return { show: async () => null, dispose() {}, attach() {}, restore() {}, sample: () => null, get actor() { return null; }, canvas: null };
  }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.className = 'figure-canvas';
  canvas.dataset.rendered = '0';
  host.replaceChildren(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a2230, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4);
  key.position.set(2.2, 4, 3.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fd8ff, 1.3);
  rim.position.set(-2.5, 2.2, -2.5);
  scene.add(rim);

  // a soft disc to stand on, so the figure is on something rather than floating in the panel
  const discTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(127,216,255,0.34)');
    grad.addColorStop(0.6, 'rgba(60,110,150,0.16)');
    grad.addColorStop(1, 'rgba(20,40,60,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const discGeo = new THREE.CircleGeometry(0.9, 48);
  const discMat = new THREE.MeshBasicMaterial({ map: discTex, transparent: true, depthWrite: false, toneMapped: false });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.005;
  scene.add(disc);

  const stand = new THREE.Group();
  scene.add(stand);

  let actor = null, building = null, wanted = null, height = 1.3;
  let raf = 0, last = performance.now(), disposed = false, frames = 0;
  let yaw = -0.2, swayT = 0, dragging = false, dragX = 0, idleAfterDrag = 0, held = false;
  const SWAY = 0.87;

  function frame() {
    // aim at the middle of the body, far enough back that the whole of it fits the box
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    // headroom for a hat or a pair of horns, which stand above the rig height the body reports
    const tall = height * 1.34;
    const fitH = tall / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    const fitW = (height * 0.9) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect);
    const dist = Math.max(fitH, fitW);
    camera.position.set(0, height * 0.64, dist);
    camera.lookAt(0, height * 0.56, 0);
    camera.updateProjectionMatrix();
  }

  function draw() {
    frame();
    renderer.render(scene, camera);
    frames++;
    canvas.dataset.rendered = String(frames);
  }

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // asleep while nobody can see it: a hidden screen, a closed editor, a tab in the background
    if (!host.isConnected || host.offsetParent === null || document.hidden) return;
    /**
     * A slow sway rather than a full spin: ±50° either side of wherever it was last left, about
     * twelve seconds a swing, so the face you are building is in view most of the time and the
     * weapon and the back still come round. Dragging turns it all the way.
     */
    if (!dragging && !held) {
      if (idleAfterDrag > 0) idleAfterDrag -= dt;
      else swayT += dt;
    }
    stand.rotation.y = yaw + Math.sin(swayT * spin) * SWAY;
    actor?.update(dt);
    draw();
  }
  raf = requestAnimationFrame(loop);

  // ---- turn it by hand
  const onDown = e => { dragging = true; dragX = e.clientX; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = e => { if (!dragging) return; yaw += (e.clientX - dragX) * 0.012; dragX = e.clientX; };
  const onUp = () => { if (dragging) { dragging = false; idleAfterDrag = 2.5; } };
  if (drag) {
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.title = 'Drag to turn';
  }

  /**
   * Show this avatar. The first call builds the body (the slow part, ~0.1 s); after that a new look
   * is `setAvatar`, which keeps the clip set and swaps the parts. Calls that arrive while a body is
   * still being built are folded into one — only the newest look is ever put on.
   */
  async function show(avatar) {
    if (disposed) return null;
    wanted = avatar;
    if (building) return building;
    building = (async () => {
      while (!disposed && wanted) {
        const next = wanted;
        wanted = null;
        try {
          if (!actor) {
            actor = await makeActor({ avatar: JSON.parse(JSON.stringify(next || {})) });
            if (disposed) { actor.dispose?.(); actor = null; break; }
            stand.add(actor.group);
            actor.setAnim?.('idle');
          } else {
            await actor.setAvatar(JSON.parse(JSON.stringify(next || {})));
          }
          height = actor.metrics?.().totalHeight || 1.3;
          canvas.dataset.look = lookKey(next);
        } catch (err) {
          console.warn('figure3d: could not build the preview body', err);
        }
      }
      building = null;
      return actor;
    })();
    return building;
  }

  /** Render one frame now and count the pixels that are not see-through. */
  function sample() {
    draw();
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let solid = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 200) solid++;
    return { width: w, height: h, solid, share: solid / (w * h) };
  }
  /** Tests and the look harness: hold the figure at one angle (radians, 0 = facing you), or `null` to let it sway again. */
  function face(angle) {
    if (angle == null) { held = false; return; }
    held = true; yaw = angle; swayT = 0;
  }
  canvas.__figure = { sample, face, show: a => show(a) };

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    if (drag) {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    }
    try { actor?.dispose?.(); } catch { /* already gone */ }
    actor = null;
    discGeo.dispose(); discMat.dispose(); discTex.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    delete canvas.__figure;
    canvas.remove();
  }

  /**
   * Move the canvas into another box — the appearance editor, the class builder — and back. One
   * context serves every place the figure appears, and the box it is in decides its size.
   */
  function attach(next) {
    if (disposed || !next || next === host) return;
    host = next;
    next.replaceChildren(canvas);
    // face the viewer again: somebody opening the editor wants to see the face first
    yaw = -0.2; swayT = 0;
  }
  function restore() { attach(home); }

  return {
    show, dispose, sample, canvas, attach, restore,
    get actor() { return actor; },
    get disposed() { return disposed; },
  };
}
