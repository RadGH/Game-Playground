// The baker: turns a three.js model into the 2D pictures the game draws (SimCity 4's trick). Each bake gives
//   day    — the model lit by the sun, with its soft shadow on the ground, transparent elsewhere
//   lights — only what glows (lit windows, neon, beacons), everything else black: the game ADDS this on top of a
//            darkened day picture at night, so one set of pictures covers the whole day/night cycle
// plus the anchor: the pixel where the model's ground origin (its footprint centre) lands, so the game places a
// sprite by putting its anchor on the tile's centre.
//
// The camera never moves (iso.js CAM_DIR); a map rotation turns the model (modelTurn). The sun is fixed to the screen
// (from the front-left, high), so every rotation is lit the same way — the left faces bright, the right
// faces in shade, shadows falling back and to the right, like SimCity 4.
import * as THREE from 'three';
import { PX_PER_UNIT, CAM_DIR, modelTurn } from './iso.js';

export const SUN = new THREE.Vector3(-0.1, 2.0, 0.8).normalize();    // toward the sun: shadows fall back-right (screen up-right)

export class Baker {
  constructor({ scale = 2 } = {}) {
    this.scale = scale;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.hemi = new THREE.HemisphereLight('#dbe8ff', '#4a4038', 0.95);
    this.sun = new THREE.DirectionalLight('#fff3e0', 3.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(Math.min(4096, 1024 * scale), Math.min(4096, 1024 * scale));   // capped: big bake scales (tiny props) would ask for a texture the GPU may not have
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    // the shadow catcher: invisible ground that only shows the shadow
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.ground.rotation.x = -Math.PI / 2; this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
    this.camera.position.set(CAM_DIR[0] * 150, CAM_DIR[1] * 150, CAM_DIR[2] * 150);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);

    this.holder = new THREE.Group(); this.scene.add(this.holder);
    this._black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this._glowCache = new Map();
  }

  /** Where the frame must reach: the model's box corners plus where their shadows fall on the ground. */
  _frame(obj, pad, withShadow) {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 0.1, 0.5));
    const pts = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      pts.push(new THREE.Vector3(x, y, z));
      if (withShadow && y > 0.001) pts.push(new THREE.Vector3(x - SUN.x * (y / SUN.y), 0, z - SUN.z * (y / SUN.y)));
    }
    const inv = this.camera.matrixWorldInverse;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) { p.applyMatrix4(inv); minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
    const k = PX_PER_UNIT * this.scale;
    // snap to whole pixels so the origin lands exactly on a pixel (crisp placement in the game)
    const L = Math.floor(minX * k - pad) / k, R = Math.ceil(maxX * k + pad) / k;
    const B = Math.floor(minY * k - pad) / k, T = Math.ceil(maxY * k + pad) / k;
    return { L, R, B, T, box, w: Math.round((R - L) * k), h: Math.round((T - B) * k), ax: Math.round(-L * k), ay: Math.round(T * k) };
  }

  _glowMat(m) {
    if (!this._glowCache.has(m)) {
      const g = new THREE.MeshBasicMaterial({ color: m.emissive ? m.emissive.clone().multiplyScalar(m.emissiveIntensity ?? 1) : 0xffffff, map: m.emissiveMap || null });
      if (m.emissiveMap) g.color.set('#ffffff').multiplyScalar(m.emissiveIntensity ?? 1);
      // a see-through glow (fire in windows, wreck.js) glows only where its picture does
      if (m.transparent) { g.transparent = true; g.depthWrite = false; g.polygonOffset = m.polygonOffset; g.polygonOffsetFactor = m.polygonOffsetFactor; g.polygonOffsetUnits = m.polygonOffsetUnits; }
      this._glowCache.set(m, g);
    }
    return this._glowCache.get(m);
  }

  /**
   * Bake one picture. obj: a THREE.Object3D with its ground origin at (0,0,0).
   * opts: rot (0..3) · layer 'day'|'lights' · pad px · shadow (true) · frame (reuse a frame so layers line up)
   * Returns { canvas, w, h, ax, ay, frame }.
   */
  /** A decal (soot, smashed windows — userData.decal) in the lights picture: black through its own alpha, so it darkens
   *  the lit windows under it instead of blacking out a rectangle. */
  _decalMat(m) {
    if (!this._glowCache.has(m)) this._glowCache.set(m, new THREE.MeshBasicMaterial({ color: 0x000000, map: m.map, transparent: true, depthWrite: false, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits }));
    return this._glowCache.get(m);
  }

  bake(obj, { rot = 0, layer = 'day', pad = 2, shadow = true, frame = null } = {}) {
    this.holder.clear();
    const turn = new THREE.Group(); turn.rotation.y = modelTurn(rot); turn.add(obj);
    this.holder.add(turn);
    const f = frame || this._frame(turn, pad, shadow);
    const cam = this.camera;
    cam.left = f.L; cam.right = f.R; cam.top = f.T; cam.bottom = f.B; cam.updateProjectionMatrix();

    // sun + shadow camera sized to the model
    const size = Math.max(f.box.max.x - f.box.min.x, f.box.max.z - f.box.min.z, f.box.max.y) + 2;
    const c = f.box.getCenter(new THREE.Vector3()); c.y = 0;
    this.sun.position.copy(c).addScaledVector(SUN, size * 3);
    this.sun.target.position.copy(c); this.sun.target.updateMatrixWorld();
    const sc = this.sun.shadow.camera; sc.left = -size; sc.right = size; sc.top = size; sc.bottom = -size; sc.near = 0.1; sc.far = size * 8; sc.updateProjectionMatrix();
    this.ground.scale.set(size * 4, size * 4, 1); this.ground.position.set(c.x, 0.0005, c.z);

    const swapped = [];
    if (layer === 'lights') {
      this.ground.visible = false;
      obj.traverse(o => {
        if (!o.isMesh) return;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        const next = list.map(m => (m.userData?.glow ? this._glowMat(m) : m.userData?.decal ? this._decalMat(m) : this._black));
        swapped.push([o, o.material]); o.material = Array.isArray(o.material) ? next : next[0];
      });
    } else {
      this.ground.visible = shadow;
      obj.traverse(o => {
        if (!o.isMesh) return;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m.userData?.glow) { m.userData._ei ??= m.emissiveIntensity; m.emissiveIntensity = (m.userData.dayGlow ?? 0) * m.userData._ei; }
      });
    }
    this.renderer.setSize(Math.max(1, f.w), Math.max(1, f.h), false);
    this.renderer.toneMapping = layer === 'lights' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.render(this.scene, cam);
    const out = document.createElement('canvas'); out.width = Math.max(1, f.w); out.height = Math.max(1, f.h);
    out.getContext('2d').drawImage(this.renderer.domElement, 0, 0);

    for (const [o, m] of swapped) o.material = m;
    obj.traverse(o => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m.userData?._ei != null) m.emissiveIntensity = m.userData._ei; });
    turn.remove(obj); this.holder.clear();
    return { canvas: out, w: out.width, h: out.height, ax: f.ax, ay: f.ay, frame: f };
  }

  /** Day + lights from the same frame (they line up pixel for pixel). */
  bakePair(obj, opts = {}) {
    const day = this.bake(obj, { ...opts, layer: 'day' });
    const lights = this.bake(obj, { ...opts, layer: 'lights', frame: day.frame });
    return { day: day.canvas, lights: halo(lights.canvas, this.scale), w: day.w, h: day.h, ax: day.ax, ay: day.ay };
  }
}

/** Night look on a 2D canvas: darken the day picture, then add the lights. t = 0 (noon) … 1 (deep night). */
export function composite(ctx, pair, x, y, t = 0, scale = 1) {
  const dx = x - pair.ax * scale, dy = y - pair.ay * scale, w = pair.w * scale, h = pair.h * scale;
  ctx.drawImage(pair.day, dx, dy, w, h);
  if (t <= 0) return;
  // darken only the picture's own pixels: draw the night tint through the day picture's alpha
  const tint = nightTint(pair, t);
  ctx.drawImage(tint, dx, dy, w, h);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, t * 1.4); ctx.drawImage(pair.lights, dx, dy, w, h); ctx.restore();
}

const tintCache = new WeakMap();
function nightTint(pair, t) {
  const q = Math.round(t * 10) / 10;
  let m = tintCache.get(pair); if (!m) { m = new Map(); tintCache.set(pair, m); }
  if (!m.has(q)) {
    const c = document.createElement('canvas'); c.width = pair.w; c.height = pair.h;
    const g = c.getContext('2d');
    g.drawImage(pair.day, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgba(8, 12, 34, ${0.78 * q})`; g.fillRect(0, 0, c.width, c.height);
    m.set(q, c);
  }
  return m.get(q);
}

/** A soft glow round every light (cheap bloom): the sharp lights plus two blurred copies added on top. */
export function halo(src, scale = 2) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  g.filter = `blur(${4 * scale}px)`; g.globalAlpha = 0.55; g.drawImage(src, 0, 0);
  g.filter = `blur(${1.5 * scale}px)`; g.globalAlpha = 0.4; g.drawImage(src, 0, 0);
  g.filter = 'none'; g.globalAlpha = 1; g.drawImage(src, 0, 0);
  return c;
}
