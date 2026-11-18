// The layered bake: a mech is drawn from separate pictures stacked at run time, so legs can face where it moves while
// the upper body faces where it aims, and paint is a run-time tint.
//
//   const mb = new MechBaker({ scale: 3 });                 // wraps City Kit's Baker (one WebGL context)
//   const layers = mechLayers(mb, build);                   // lazy: bakes a picture the first time it is asked for
//   composeMech(ctx, layers, legDir, aimDir, frame, paint, t, { x, y, zoom, alt })
//
// Each part is baked ALONE in its assembled pose, per screen direction (16) × animation frame, giving
//   { day, lights, paint, mask, w, h, ax, ay, maker, key }   (+ hip for legs, + muzzle for weapons)
//   day    — sun-lit picture; painted areas are baked a neutral grey (kit.PAINT_BASE)
//   lights — what glows (City Kit's night layer, with its soft halo)
//   paint  — the mask picture: R = primary, G = secondary, B = accent; glowing parts white (R = G = B); mask = its pixels
// Upper-body parts are baked with the hip at a fixed height (HIP_REF, rounded to a whole pixel) and their anchor
// (ax, ay) IS the hip pixel. The legs' anchor is their ground origin and `hip` is the pixel the upper body hangs on.
// Shadows are baked separately (legs; whole upper body) as solid masks and drawn once, merged, under the mech — so
// overlapping parts never double-darken and a jumping mech's shadow stays on the ground.
// Draw order per aim direction: far parts first, sorted by their middle's distance from the camera (the far arm and
// shoulder weapon go behind the core, the near ones in front); the legs go under everything.
import * as THREE from 'three';
import { Baker, composite, halo, SUN } from '../../citykit/js/bake.js';
import { PX_PER_HEIGHT, CAM_DIR, toScreen, headingOfDir } from '../../citykit/js/iso.js';
import { legsRig, upperRig, UPPER_KEYS, idOfKey, PARTS, LEG_ANIMS, UPPER_ANIMS } from './rig.js';
import { VISUALS, PAINT_BASE } from './parts/kit.js';
import { MAKER } from './data.js';

export const DIRS = 16;
export const HIP_REF = 0.34;
const UP = new THREE.Vector3(0, 1, 0);
const CAM = new THREE.Vector3(...CAM_DIR);
const SHADOW_ALPHA = 0.34;
const BASE = parseInt(PAINT_BASE.slice(1, 3), 16) / 255;

/** The world heading (radians) a screen direction looks like (0 = up the screen, clockwise). */
export const headingOf = dir => headingOfDir(((dir % DIRS) + DIRS) % DIRS, DIRS, 0);

export class MechBaker {
  constructor({ scale = 3, baker = null, maxLayers = 1400 } = {}) {
    this.baker = baker || new Baker({ scale });
    this.scale = this.baker.scale;
    this.hipRefPx = Math.round(HIP_REF * PX_PER_HEIGHT * this.scale);
    this.hipRef = this.hipRefPx / (PX_PER_HEIGHT * this.scale);
    this.cache = new Map(); this.maxLayers = maxLayers;
    this.legRigs = new Map(); this.upperRigs = new Map();
    this.stats = { bakes: 0, ms: 0 };
    this._black = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    this._maskMats = { primary: mk('#ff0000'), secondary: mk('#00ff00'), accent: mk('#0000ff'), glow: mk('#ffffff') };
    this._ghost = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    function mk(c) { return new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); }
  }
  _get(key, make) {
    const c = this.cache;
    if (c.has(key)) { const v = c.get(key); c.delete(key); c.set(key, v); return v; }
    const t0 = performance.now(); const v = make(); this.stats.bakes++; this.stats.ms += performance.now() - t0;
    c.set(key, v); while (c.size > this.maxLayers) c.delete(c.keys().next().value);
    return v;
  }
  clear() { this.cache.clear(); }

  // ---------- bake helpers ----------
  /** Day + lights + paint mask from one frame, so all three line up pixel for pixel. */
  _layer(obj) {
    const b = this.baker;
    const day = b.bake(obj, { layer: 'day', shadow: false });
    let hasGlow = false;
    obj.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m.userData?.glow) hasGlow = true; });
    const lights = hasGlow ? halo(b.bake(obj, { layer: 'lights', frame: day.frame }).canvas, this.scale) : null;
    // the paint mask: swap every material for a flat colour code, bake, swap back
    const swapped = [];
    obj.traverse(o => {
      if (!o.isMesh) return;
      const list = [].concat(o.material);
      const next = list.map(m => m.userData?.paint ? this._maskMats[m.userData.paint] : m.userData?.glow ? this._maskMats.glow : this._black);
      swapped.push([o, o.material]); o.material = Array.isArray(o.material) ? next : next[0];
    });
    const mask = b.bake(obj, { layer: 'day', shadow: false, frame: day.frame });
    for (const [o, m] of swapped) o.material = m;
    const md = mask.canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mask.w, mask.h);
    // paint = the mask picture (ARCH.md's name for it); mask = its pixels, read once for tinting
    return { day: day.canvas, lights, paint: mask.canvas, mask: md, w: day.w, h: day.h, ax: day.ax, ay: day.ay, frame: day.frame };
  }
  /** The ground shadow only, as a solid black mask (alpha 1 where fully shadowed). */
  _shadow(obj) {
    const swapped = [];
    // glowing bits (blades, beams, jets) cast no shadow
    obj.traverse(o => { if (o.isMesh) { const glowing = [].concat(o.material).some(m => m.userData?.glow); swapped.push([o, o.material, o.visible]); o.material = this._ghost; if (glowing) o.visible = false; } });
    const s = this.baker.bake(obj, { layer: 'day', shadow: true });
    for (const [o, m, v] of swapped) { o.material = m; o.visible = v; }
    const g = s.canvas.getContext('2d', { willReadFrequently: true });
    const im = g.getImageData(0, 0, s.w, s.h), d = im.data, k = 255 / (this.baker.ground.material.opacity * 255);
    for (let i = 3; i < d.length; i += 4) { d[i] = Math.min(255, d[i] * k); d[i - 3] = d[i - 2] = d[i - 1] = 0; }
    g.putImageData(im, 0, 0);
    // soften the edge a touch: the hard mask stair-steps when the game zooms in
    const c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
    const cg = c.getContext('2d'); cg.filter = `blur(${0.45 * this.scale}px)`; cg.drawImage(s.canvas, 0, 0);
    return { canvas: c, w: s.w, h: s.h, ax: s.ax, ay: s.ay };
  }
  /** Pixel offset (bake px) of a world point from the picture's ground origin. */
  _px(v) { const { sx, sy } = toScreen(v.x, v.z, v.y, 0); return [sx * this.scale, sy * this.scale]; }

  // ---------- legs ----------
  legRig(id) { if (!this.legRigs.has(id)) this.legRigs.set(id, legsRig(id)); return this.legRigs.get(id); }
  /** One legs picture: anim frame `frame` facing screen direction `dir`. Adds hip (pixel) and hipW (world). */
  legs(id, anim, frame, dir) {
    return this._get(`L|${id}|${anim}|${frame}|${dir}`, () => {
      const rig = this.legRig(id), A = LEG_ANIMS[anim] || LEG_ANIMS.idle;
      const { hip } = rig.pose(anim, frame / A.frames);
      const h = headingOf(dir);
      rig.group.rotation.set(0, -h, 0); rig.group.position.set(0, 0, 0);
      const L = this._layer(rig.group);
      const hw = new THREE.Vector3(...hip).applyAxisAngle(UP, -h);
      const [px, py] = this._px(hw);
      L.hip = [L.ax + px, L.ay + py]; L.hipW = [hw.x, hw.y, hw.z];
      L.shadow = this._shadow(rig.group);
      L.maker = PARTS[id].maker; L.key = 'legs'; L.id = id;
      return L;
    });
  }

  // ---------- upper body ----------
  upperRig(build) {
    const k = upperSig(build);
    if (!this.upperRigs.has(k)) { this.upperRigs.set(k, upperRig(build)); if (this.upperRigs.size > 24) this.upperRigs.delete(this.upperRigs.keys().next().value); }
    return this.upperRigs.get(k);
  }
  /** Every upper-body layer for one moment, in draw order, plus the merged upper shadow. */
  upper(build, anim, frame, dir) {
    const sig = upperSig(build);
    return this._get(`U|${sig}|${anim}|${frame}|${dir}`, () => {
      const rig = this.upperRig(build), A = UPPER_ANIMS[anim] || UPPER_ANIMS.idle;
      const h = headingOf(dir);
      const pose = () => { rig.pose(anim, frame / A.frames); rig.group.position.set(0, this.hipRef, 0); rig.group.rotation.set(0, -h, 0); rig.group.updateMatrixWorld(true); };
      pose();
      const two = rig.twoHanded || '-';
      const order = [];
      for (const key of UPPER_KEYS) {
        const part = rig.parts[key]; if (!part) continue;
        const id = idOfKey(build, key);
        const dep = { core: [build.core], head: [build.core, build.head], booster: [build.core, build.booster],
          armL: [build.core, build.arms, two], armR: [build.core, build.arms, two],
          wArmL: [build.core, build.arms, id, two], wArmR: [build.core, build.arms, id, two], wShL: [build.core, id], wShR: [build.core, id] }[key];
        const box = new THREE.Box3().setFromObject(part);
        const depth = box.isEmpty() ? 0 : box.getCenter(new THREE.Vector3()).dot(CAM);
        const layer = this._get(`P|${key}|${dep.join(',')}|${anim}|${frame}|${dir}`, () => {
          pose();
          const solo = soloClone(part);
          const L = this._layer(solo);
          L.ay -= this.hipRefPx; L.maker = PARTS[id].maker; L.key = key; L.id = id;
          if (part.userData.muzzle) {
            const m = new THREE.Vector3(...part.userData.muzzle).applyMatrix4(part.matrixWorld);
            const [px, py] = this._px(m); L.muzzle = [L.ax + px, L.ay + this.hipRefPx + py];
          }
          return L;
        });
        order.push({ layer, depth: depth + (key === 'core' ? -0.004 : 0) });
      }
      order.sort((a, b) => a.depth - b.depth);
      pose();
      const shadow = this._shadow(rig.group);
      return { layers: order.map(o => o.layer), shadow };
    });
  }

  /** A part on its own, standing on the ground (icons, the parts sheet, hangar shelves): a paintable layer whose
   *  anchor is its ground origin, plus its shadow. Draw with drawPart(). */
  icon(id, dir = 6) {
    return this._get(`I|${id}|${dir}`, () => {
      const vis = VISUALS[id], p = PARTS[id];
      const g = new THREE.Group(), inner = new THREE.Group(); g.add(inner);
      if (p.slot === 'legs') { const r = legsRig(id); r.pose('idle', 0); inner.add(r.group); }
      else if (p.slot === 'arms') {
        for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(0, 0.27, s * 0.09); vis.draw(a, p, s, { shoulder: [0, 0, 0], elbow: [-0.03, -0.1, s * 0.03], hand: [0.11, -0.13, s * 0.01], droop: 0 }); inner.add(a); }
      } else if (p.slot === 'weapon') { vis.build(inner, p, 1); }
      else vis.build(inner, p);
      inner.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(g); inner.position.y += -b.min.y + 0.004;
      g.rotation.y = -headingOf(dir);
      const L = this._layer(g); L.shadow = this._shadow(g); L.maker = p.maker; L.key = p.slot; L.id = id;
      return L;
    });
  }
}

/** Draw a part from MechBaker.icon(): its shadow, then the painted part, anchored on the ground point (x, y). */
export function drawPart(ctx, L, x, y, zoom = 1, paint = 'maker', t = 0) {
  const sh = L.shadow;
  ctx.save(); ctx.globalAlpha = SHADOW_ALPHA; ctx.drawImage(sh.canvas, x - sh.ax * zoom, y - sh.ay * zoom, sh.w * zoom, sh.h * zoom); ctx.restore();
  drawLayer(ctx, L, x, y, zoom, paint, t);
}

/** A copy of one part placed where it sits in the posed assembly, with nothing else attached. */
function soloClone(part) {
  const c = part.clone(true);
  part.matrixWorld.decompose(c.position, c.quaternion, c.scale);
  return c;
}
function upperSig(b) { const w = b.weapons || {}; return [b.core, b.head, b.arms, b.booster, w.armL, w.armR, w.shoulderL, w.shoulderR].map(x => x || '-').join(','); }

/** The lazy layer set for one build (what composeMech draws). */
export function mechLayers(mb, build) {
  return {
    build, mb, scale: mb.scale,
    legs: (anim, frame, dir) => mb.legs(build.legs, anim, frame, dir),
    upper: (anim, frame, dir) => mb.upper(build, anim, frame, dir),
  };
}

// =====================================================================================================================
// Paint at run time

/** Paint: 'maker' (each part in its own maker's colours) or { primary, secondary, accent, glow? } as #rrggbb. */
export function paintFor(paint, maker) {
  const m = MAKER[maker]?.colours || { primary: '#bbbbbb', secondary: '#555555', accent: '#ff8800', glow: '#ffffff' };
  if (!paint || paint === 'maker') return { primary: m.primary, secondary: m.secondary, accent: m.accent, glow: null };
  return { primary: paint.primary || m.primary, secondary: paint.secondary || m.secondary, accent: paint.accent || m.accent, glow: paint.glow || null };
}
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
const tintCache = new WeakMap();
/** The layer as a { day, lights, w, h, ax, ay } pair with this paint applied (cached per layer and paint). */
export function tinted(layer, paint) {
  const P = paintFor(paint, layer.maker), key = `${P.primary}${P.secondary}${P.accent}${P.glow || ''}`;
  let m = tintCache.get(layer); if (!m) { m = new Map(); tintCache.set(layer, m); }
  if (m.has(key)) return m.get(key);
  const c = document.createElement('canvas'); c.width = layer.w; c.height = layer.h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(layer.day, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data, mk = layer.mask?.data;
  const [pr, pg, pb] = rgb(P.primary).map(v => v / BASE), [sr, sg, sb] = rgb(P.secondary).map(v => v / BASE), [ar, ag, ab] = rgb(P.accent).map(v => v / BASE);
  const G = P.glow ? rgb(P.glow) : null, gMax = G ? Math.max(...G, 1e-3) : 1;
  if (mk) for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let r = mk[i] / 255, gg = mk[i + 1] / 255, b = mk[i + 2] / 255;
    const w = Math.min(r, gg, b); r -= w; gg -= w; b -= w;
    const s = r + gg + b;
    if (s > 0.004) {
      const q = 1 - s;
      d[i] = d[i] * (q + r * pr + gg * sr + b * ar);
      d[i + 1] = d[i + 1] * (q + r * pg + gg * sg + b * ag);
      d[i + 2] = d[i + 2] * (q + r * pb + gg * sb + b * ab);
    }
    if (G && w > 0.02) {
      const lum = Math.max(d[i], d[i + 1], d[i + 2]);
      for (let k = 0; k < 3; k++) d[i + k] = d[i + k] * (1 - w) + lum * (G[k] / gMax) * w;
    }
  }
  g.putImageData(im, 0, 0);
  const pair = { day: c, lights: layer.lights ? (G ? relight(layer.lights, G, gMax) : layer.lights) : EMPTY(), w: layer.w, h: layer.h, ax: layer.ax, ay: layer.ay };
  m.set(key, pair); if (m.size > 6) m.delete(m.keys().next().value);
  return pair;
}
let _empty = null;
const EMPTY = () => { if (!_empty) { _empty = document.createElement('canvas'); _empty.width = _empty.height = 1; } return _empty; };
function relight(src, G, gMax) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0);
  const im = g.getImageData(0, 0, c.width, c.height), d = im.data;
  for (let i = 0; i < d.length; i += 4) { const l = Math.max(d[i], d[i + 1], d[i + 2]); for (let k = 0; k < 3; k++) d[i + k] = l * G[k] / gMax; }
  g.putImageData(im, 0, 0); return c;
}

// =====================================================================================================================
// Drawing

/** Sun offset (bake px at scale) of a shadow cast from `dh` units higher. */
function sunShift(dh, scale) {
  const { sx, sy } = toScreen(-SUN.x / SUN.y * dh, -SUN.z / SUN.y * dh, 0, 0);
  return [sx * scale, sy * scale];
}
let scratch = null;

/**
 * Draw one mech.
 *   layers  mechLayers(mb, build)
 *   legDir  screen direction the legs face (0..15, 0 = up the screen, clockwise)
 *   aimDir  screen direction the upper body aims
 *   frame   { legs: [anim, i], upper: [anim, i] } (or a number = idle frame for both)
 *   paint   'maker' or { primary, secondary, accent, glow? }
 *   t       time of day: 0 noon … 1 deep night
 *   o       { x, y (screen px of the ground point), zoom (screen px per baked px, default 1), alt (units above ground),
 *             shadow (true), only (draw just this layer key: 'legs', 'core', 'wArmR'…) }
 * Returns { hip, muzzles: { key: [x, y] }, top } in screen px — the game puts flashes and shots at the muzzles.
 */
export function composeMech(ctx, layers, legDir, aimDir, frame = 0, paint = 'maker', t = 0, o = {}) {
  const fr = typeof frame === 'number' ? { legs: ['idle', frame % LEG_ANIMS.idle.frames], upper: ['idle', frame % UPPER_ANIMS.idle.frames] } : frame;
  const { x = 0, y = 0, zoom = 1, alt = 0, shadow = true, only = null } = o;
  const s = layers.scale;
  const L = layers.legs(fr.legs[0], fr.legs[1], legDir);
  const U = layers.upper(fr.upper[0], fr.upper[1], aimDir);
  const altPx = alt * PX_PER_HEIGHT * s;
  const by = y - altPx * zoom;
  const hx = x + (Math.round(L.hip[0]) - L.ax) * zoom, hy = by + (Math.round(L.hip[1]) - L.ay) * zoom;
  if (shadow && !only) drawShadows(ctx, L, U, x, y, zoom, alt, s, layers.mb?.hipRef ?? HIP_REF);
  if (!only || only === 'legs') drawLayer(ctx, L, x, by, zoom, paint, t);
  const muzzles = {};
  let top = by - L.ay * zoom;
  for (const layer of U.layers) {
    if (!only || only === layer.key) drawLayer(ctx, layer, hx, hy, zoom, paint, t);
    top = Math.min(top, hy - layer.ay * zoom);
    if (layer.muzzle) muzzles[layer.key] = [hx + (layer.muzzle[0] - layer.ax) * zoom, hy + (layer.muzzle[1] - layer.ay) * zoom];
  }
  return { hip: [hx, hy], ground: [x, y], muzzles, top, legs: L, upper: U };
}

/** One layer, painted, with City Kit's day → night composite. */
export function drawLayer(ctx, layer, x, y, zoom, paint, t) { composite(ctx, tinted(layer, paint), x, y, t, zoom); }

function drawShadows(ctx, L, U, x, y, zoom, alt, s, hipRef) {
  // where each shadow's ground anchor lands on screen
  const [lx, ly] = sunShift(alt, s);
  const [hgx, hgy] = (() => { const { sx, sy } = toScreen(L.hipW[0], L.hipW[2], 0, 0); return [sx * s, sy * s]; })();
  const [ux, uy] = sunShift(L.hipW[1] + alt - hipRef, s);
  const items = [[L.shadow, x + lx * zoom, y + ly * zoom], [U.shadow, x + (hgx + ux) * zoom, y + (hgy + uy) * zoom]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [sh, ax, ay] of items) {
    const l = ax - sh.ax * zoom, tp = ay - sh.ay * zoom;
    minX = Math.min(minX, l); minY = Math.min(minY, tp); maxX = Math.max(maxX, l + sh.w * zoom); maxY = Math.max(maxY, tp + sh.h * zoom);
  }
  const W = Math.ceil(maxX - minX) + 2, H = Math.ceil(maxY - minY) + 2;
  if (W <= 2 || H <= 2) return;
  scratch ??= document.createElement('canvas');
  if (scratch.width < W || scratch.height < H) { scratch.width = Math.max(scratch.width, W); scratch.height = Math.max(scratch.height, H); }
  const g = scratch.getContext('2d'); g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = ctx.imageSmoothingEnabled;
  for (const [sh, ax, ay] of items) g.drawImage(sh.canvas, ax - sh.ax * zoom - minX, ay - sh.ay * zoom - minY, sh.w * zoom, sh.h * zoom);
  ctx.save(); ctx.globalAlpha = SHADOW_ALPHA; ctx.drawImage(scratch, 0, 0, W, H, minX, minY, W, H); ctx.restore();
}
