// The character screen's hero (live report #4, lessons rule 19: a character picture is the real 3D model): the same
// Chibi 2.6 body the world draws, wearing what you have equipped, turning slowly; drag to turn it yourself.
//
// One small renderer of its own, made the first time the screen opens and kept (never disposed): its light set never
// changes, so nothing is compiled again after the first open. The body is built with the world's options (BODY_OPTS),
// so it shares the world body's baked template; a gear change is swapped onto the same body (dressBody).
//
//   const pv = createHeroPreview();  pv.show(hostEl, look, equip, bases)  (every redraw; cheap when nothing changed)
//   pv.hide()  when the screen closes;  pv.state() -> { ready, held, offhand, hold } for tests
import * as THREE from 'three';
import { createTvBody } from '../../../thousandvale/js/client/chibi-version.js';
import { BODY_OPTS, avatarFor, dressBody } from './actors.js';
import { gearSig } from '../rules/gear-look.js';

export function createHeroPreview() {
  let renderer = null, scene = null, cam = null, canvas = null, body = null, building = null, want = null, builtKey = '', raf = 0, last = 0, spin = 0.5, drag = null, avatar = null;
  function setup() {
    canvas = document.createElement('canvas'); canvas.className = 'hero-preview'; canvas.setAttribute('aria-hidden', 'true');
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { renderer = null; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e4', '#6a5a44', 1.6));
    const sun = new THREE.DirectionalLight('#ffffff', 1.9); sun.position.set(2, 4, 3); scene.add(sun);
    const rim = new THREE.DirectionalLight('#ffe2b0', 0.7); rim.position.set(-3, 2, -2); scene.add(rim);
    cam = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    // drag to turn
    canvas.addEventListener('pointerdown', e => { drag = { x: e.clientX, s: body ? body.group.rotation.y : spin }; spin = drag.s; canvas.setPointerCapture?.(e.pointerId); });
    canvas.addEventListener('pointermove', e => { if (drag) spin = drag.s + (e.clientX - drag.x) * 0.012; });
    const up = () => { if (drag) spin = Math.asin(Math.max(-1, Math.min(1, (spin - 0.15) / 0.55))) || 0; drag = null; }; canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  }
  async function build() {
    while (want && want.key !== builtKey) {
      const w = want; avatar = avatarFor(w.look, w.equip, w.bases);
      if (!body) { body = await createTvBody(avatar, BODY_OPTS); scene.add(body.group); body.setAnim('idle', 0); }
      else await dressBody(body, avatar);
      builtKey = w.key;
    }
    building = null;
  }
  function frame(t) {
    raf = 0;
    if (!canvas?.isConnected) return;
    const dt = Math.min(0.1, (t - (last || t)) / 1000); last = t;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w > 0 && h > 0) {
      const pr = renderer.getPixelRatio();
      if (canvas.width !== Math.round(w * pr) || canvas.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
      cam.aspect = w / h; cam.updateProjectionMatrix();
      if (body) {
        if (!drag) spin += dt * 0.35;
        body.group.rotation.y = drag ? spin : 0.15 + Math.sin(spin) * 0.55;   // a slow look left and right; drag turns it freely
        body.update(dt);
        // framed round the whole figure WITH a raised weapon (a greatsword rests over the shoulder, a staff stands tall)
        const H = body.metrics().height || 1.3, tall = H * 1.5;
        const fit = Math.max(tall, tall * 0.62 / Math.max(0.3, w / h));
        const dist = fit / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        cam.position.set(0, H * 0.62, dist); cam.lookAt(0, H * 0.56, 0);
      }
      renderer.render(scene, cam);
    }
    raf = requestAnimationFrame(frame);
  }
  return {
    show(host, look, equip, bases) {
      if (!host || !look) return;
      if (!canvas) setup();
      if (!renderer) return;
      if (canvas.parentElement !== host) host.append(canvas);
      want = { look, equip: equip || {}, bases, key: JSON.stringify(look) + '#' + gearSig(equip) };
      if (!building) building = build().catch(e => { console.warn('preview', e); building = null; });
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    },
    hide() { if (raf) cancelAnimationFrame(raf); raf = 0; canvas?.remove(); },
    state: () => ({ ready: !!body && builtKey === want?.key, held: avatar?.held?.id || null, offhand: avatar?.offhand?.id || null, hold: body?.hold || null }),
  };
}
