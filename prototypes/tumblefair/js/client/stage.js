// The 3D stage every screen shares: one renderer, one scene, a raised three-quarter camera that frames whatever
// rectangle of ground it is told to (the lobby line-up, the board, a minigame arena) inside the part of the screen
// that the buttons and panels leave free. Screens put their things in `stage.root` children and remove them after.
import * as THREE from 'three';
import { SEATS } from '../shared/protocol.js';

// three.js works out an InstancedMesh's bounding sphere ONCE (the first time it is culled) and never again. A game that
// starts with count 0 and adds instances later (Wobble Tower's blocks, splats, coins…) then has an EMPTY sphere pinned at
// the mesh's origin, and the whole mesh vanishes as soon as that origin leaves the screen — on a phone following its own
// tower upward, every block disappeared until a rejoin (owner's report, 2026-10-22). Our scenes are small: never cull them.
THREE.InstancedMesh.prototype.intersectsFrustum = function () { return true; };

export function pickQuality() {
  const q = new URLSearchParams(location.search).get('quality'); if (q) return q;
  try { const c = document.createElement('canvas'), g = c.getContext('webgl2') || c.getContext('webgl'), e = g?.getExtension('WEBGL_debug_renderer_info');
    if (/swiftshader|llvmpipe|software/i.test(e ? String(g.getParameter(e.UNMASKED_RENDERER_WEBGL)) : '')) return 'low'; } catch { /* no webgl info */ }
  const phone = (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) && Math.min(innerWidth, innerHeight) < 500;
  return phone ? 'medium' : 'high';
}

export function createStage(canvas, { quality = pickQuality() } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(quality === 'low' ? Math.min(1, devicePixelRatio) * 0.75 : Math.min(devicePixelRatio, quality === 'medium' ? 1.5 : 2));
  renderer.shadowMap.enabled = quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#12323a');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 400);
  const hemi = new THREE.HemisphereLight('#ffffff', '#5a6a78', 1.7); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4dc', 2.3); sun.position.set(-14, 26, 16);
  sun.castShadow = quality !== 'low'; sun.shadow.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 90 }); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const root = new THREE.Group(); scene.add(root);

  // ---- camera: frame a ground rectangle inside the free part of the screen
  const view = { cx: 0, cz: 0, hw: 6, hd: 4, pitch: 52, tall: 2, yaw: 0 }, cur = { x: 0, y: 20, z: 20, tx: 0, ty: 0, tz: 0, ox: 0, oy: 0 }, want = { ...cur };
  let safe = { top: 0.08, bottom: 0.08, left: 0.04, right: 0.04 }, snap = true;
  const probe = new THREE.PerspectiveCamera(32, 1, 0.5, 400), v3 = new THREE.Vector3();
  /**
   * Find the camera for `view`: the nearest distance at which the rectangle (and things `tall` metres high on it) is no
   * bigger than the free part of the screen, then slide the picture so the rectangle sits in the middle of that free
   * part (a lens shift — camera.setViewOffset — so nothing about the angle changes).
   */
  function solve() {
    const { cx, cz, hw, hd, tall } = view, pitch = view.pitch * Math.PI / 180, yaw = view.yaw * Math.PI / 180;
    probe.aspect = camera.aspect; probe.fov = camera.fov; probe.updateProjectionMatrix();
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const t = new THREE.Vector3(cx, tall * 0.4, cz);
    const pts = [[-hw, 0, -hd], [hw, 0, -hd], [-hw, 0, hd], [hw, 0, hd], [-hw, tall, -hd], [hw, tall, -hd], [-hw, tall, hd], [hw, tall, hd]];
    const fw = Math.max(0.2, 1 - safe.left - safe.right), fh = Math.max(0.2, 1 - safe.top - safe.bottom);
    const box = d => {
      probe.position.copy(t).addScaledVector(dir, d); probe.lookAt(t); probe.updateMatrixWorld(); probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
      let a = Infinity, b = -Infinity, c = Infinity, e = -Infinity, behind = false;
      for (const p of pts) { v3.set(cx + p[0], p[1], cz + p[2]).project(probe); if (v3.z > 1) behind = true; a = Math.min(a, v3.x); b = Math.max(b, v3.x); c = Math.min(c, v3.y); e = Math.max(e, v3.y); }
      return { a, b, c, e, ok: !behind && (b - a) <= 2 * fw && (e - c) <= 2 * fh };
    };
    let lo = 2, hi = 400;
    for (let i = 0; i < 24; i++) { const d = (lo + hi) / 2; if (box(d).ok) hi = d; else lo = d; }
    const f = box(hi), w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    const sx = (safe.left - safe.right) - (f.a + f.b) / 2, sy = (safe.bottom - safe.top) - (f.c + f.e) / 2;      // how far to slide the picture, in screen halves
    want.tx = t.x; want.ty = t.y; want.tz = t.z; want.x = t.x + dir.x * hi; want.y = t.y + dir.y * hi; want.z = t.z + dir.z * hi;
    want.ox = -sx * w / 2; want.oy = sy * h / 2;
    if (snap) { Object.assign(cur, want); snap = false; }
  }
  function setView(v, { instant = false } = {}) { Object.assign(view, v); if (instant) snap = true; solve(); }
  function setSafe(s) { safe = { ...safe, ...s }; solve(); }
  function resize() {
    const w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); solve();
  }
  addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  window.visualViewport?.addEventListener('resize', resize);      // Safari's toolbars resize the canvas without a window resize

  // ---- name tags: DOM labels that follow a 3D thing
  const tagLayer = document.getElementById('tags'), tags = new Set();
  function tag(obj, { text = '', seat = null, height = 2, cls = '' } = {}) {
    const el = document.createElement('div'); el.className = 'tag ' + cls;
    if (seat != null) { el.style.setProperty('--seat', SEATS[seat].color); el.dataset.shape = SEATS[seat].shape; }
    const label = document.createElement('span'); label.textContent = text; el.append(label);
    tagLayer.append(el);
    const T = { el, obj, height, set: s => { label.textContent = s; }, remove: () => { el.remove(); tags.delete(T); } };
    tags.add(T); return T;
  }
  function placeTags() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const T of tags) {
      if (!T.obj.parent || !T.obj.visible) { T.el.style.display = 'none'; continue; }
      T.obj.getWorldPosition(v3); v3.y += T.height; v3.project(camera);
      if (v3.z > 1) { T.el.style.display = 'none'; continue; }
      T.el.style.display = ''; T.el.style.transform = `translate(-50%, -100%) translate(${((v3.x + 1) / 2 * w).toFixed(1)}px, ${((1 - v3.y) / 2 * h).toFixed(1)}px)`;
    }
  }
  /** World point -> CSS pixels on the canvas (for floating numbers and the like). */
  function toScreen(x, y, z) { v3.set(x, y, z).project(camera); return { x: (v3.x + 1) / 2 * canvas.clientWidth, y: (1 - v3.y) / 2 * canvas.clientHeight }; }

  function render(dt) {
    const k = 1 - Math.exp(-dt * 5);
    for (const key of Object.keys(cur)) cur[key] += (want[key] - cur[key]) * k;
    camera.position.set(cur.x, cur.y, cur.z); camera.lookAt(cur.tx, cur.ty, cur.tz);
    const cw = canvas.clientWidth || innerWidth, ch = canvas.clientHeight || innerHeight; camera.setViewOffset(cw, ch, cur.ox, cur.oy, cw, ch);
    sun.target.position.set(cur.tx, 0, cur.tz); sun.position.set(cur.tx - 14, 26, cur.tz + 16);
    renderer.render(scene, camera);
    placeTags();
  }
  /** Empty a group and free what it held. */
  function clear(group) {
    group.traverse(o => { if (o.isMesh || o.isSprite || o.isLine) { o.geometry?.dispose?.(); for (const m of [].concat(o.material || [])) { if (m.userData?.shared) continue; m.map?.dispose?.(); m.dispose?.(); } } });
    group.clear();
  }
  resize();
  return { THREE, renderer, scene, camera, root, sun, quality, setView, setSafe, resize, render, tag, toScreen, clear, canvas };
}

/** A canvas-drawn texture (labels, icons, floor patterns) without loading a file. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
export const loadTexture = url => new Promise(res => new THREE.TextureLoader().load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null)));
