// Icons from the 3D models (stream C, PLAN §16).
//
//   import { createIconStudio, createIconLibrary, frameCamera } from './icons.js';
//
// THE STUDIO renders a unit, hero or item model into a square and hands back a 2D canvas. It uses the
// renderer you give it (the game's own, never a second WebGL context): it draws into a scissored
// corner of the default framebuffer and copies the pixels out with drawImage in the same task, so
// the icon gets exactly the game's tone mapping and colour space. The corner is overwritten by the
// next frame; at runtime only previews are generated this way (the baked PNGs are the normal path).
//
//   const studio = createIconStudio(renderer, { looks });
//   const canvas = await studio.unit('tuskback');           // framed, background, 128 px
//   const canvas = await studio.hero('druid');
//   const canvas = await studio.item({ held: 'fh_greatsword', color: '#c4ccd4' });   // or { offhand }, { armour: slot, part }
//   const canvas = await studio.skill(skillId, { heroes, catalog });                  // 2D composite: element frame + fx sprite + hero silhouette
//
// THE LIBRARY is what the UI reads: baked files first, generated previews second, all cached.
//
//   const icons = await createIconLibrary({ base: 'assets/icons/' });   // reads assets/icons/index.json
//   icons.url('unit', 'levy')     -> 'assets/icons/unit/levy.png' (or null when it was never baked)
//   await icons.get('unit', 'levy') -> a URL (baked file, or a data: URL generated once and cached)
//   icons.attach(studio)          -> lets get() generate what was never baked
//
// frameCamera(actor, camera, { mode: 'bust' | 'full' }) points a camera at a body the way icons and
// the live portrait (portrait.js) both frame it: Chibi 2 from the head bone, creatures from the box.

import * as THREE from 'three';
import { buildHeld, buildOffhand } from '../../../../avatar-3d/js/chibi2-gear.js';

export const ICON_SIZE = 128;
/** How each creature fills its square: four-legged beasts from the front quarter, tall ones whole. */
const CREATURE_FRAMES = {
  crow: { mode: 'full', yaw: 0.55, pitch: 0.2, pad: 0.62, anim: 'idle' },
  ghoul: { mode: 'full', yaw: 0.9, pad: 0.92 }, bone_colossus: { mode: 'full', yaw: 0.45, pad: 0.9 }, golem: { mode: 'full', yaw: 0.45, pad: 0.92 },
  tuskback: { mode: 'full', yaw: 0.85, pad: 0.8 }, thornback: { mode: 'full', yaw: 0.8, pad: 0.76 },
  wolf: { mode: 'bust', yaw: 0.75, pad: 1.0 }, saber_cat: { mode: 'bust', yaw: 0.75, pad: 1.0 },
  rat: { mode: 'bust', yaw: 0.8, pad: 0.75 }, hyena: { mode: 'bust', yaw: 0.75, pad: 0.95 }, dire_wolf: { mode: 'bust', yaw: 0.75, pad: 1.0 },
  bear: { mode: 'full', yaw: 0.8, pad: 0.95 }, elk: { mode: 'full', yaw: 0.8, pad: 0.78 }, titan: { mode: 'full', yaw: 0.45, pad: 0.82 },
  horror: { mode: 'full', yaw: 0.4, pad: 0.8 }, wraith: { mode: 'full', yaw: 0.3, pad: 0.85 },
  sheep: { mode: 'full', yaw: 0.75, pad: 0.72, anim: 'idle' }, hen: { mode: 'full', yaw: 0.7, pad: 0.95, anim: 'idle' }, pig: { mode: 'full', yaw: 0.75, pad: 0.72, anim: 'idle' },
  cow: { mode: 'full', yaw: 0.75, pad: 0.74, anim: 'idle' }, scarecrow: { mode: 'full', yaw: 0.35, pad: 0.72 }, owl: { mode: 'full', yaw: 0.5, pad: 0.7, anim: 'idle' },
  hound: { mode: 'bust', yaw: 0.75, pad: 1.0 }, pony: { mode: 'full', yaw: 0.8, pad: 0.75, anim: 'idle' }, horse: { mode: 'full', yaw: 0.8, pad: 0.75, anim: 'idle' }, courser: { mode: 'full', yaw: 0.8, pad: 0.75, anim: 'idle' },
};

/** The background each kind of icon sits on: [inner, outer] radial colours. */
export const ICON_TINTS = {
  freeholds: ['#4f6f9e', '#141b2a'], ashtusk: ['#9a4a3a', '#1f1110'], unburied: ['#4f8a8e', '#0f1a1c'], thornmane: ['#6a7a3e', '#151a0e'],
  hero: ['#b08a48', '#20180c'], item: ['#5a5650', '#121214'], skill: ['#3a3a44', '#101014'], building: ['#6a7a8a', '#151a20'],
};
export const ELEMENT_TINTS = {
  physical: ['#a9b6c8', '#1c2028'], blade: ['#a9b6c8', '#1c2028'], pierce: ['#b4c9a0', '#2a3424'],
  fire: ['#ff9a3a', '#3a1206'], nature: ['#8fdc6a', '#11280c'], ice: ['#9ad8ff', '#0c2030'], arcane: ['#c49aff', '#1e1030'], holy: ['#ffe08a', '#30280c'], shadow: ['#b48aff', '#160c22'], lightning: ['#fff07a', '#20202e'],
};

// ---------------------------------------------------------------- framing
const PART_FRAMES = {
  torso: { bones: ['chest'], lift: 0.02, radius: 0.3 },
  feet: { bones: ['footL', 'footR'], lift: 0.04, radius: 0.24 },
  hands: { bones: ['elbowL', 'elbowR'], lift: -0.06, radius: 0.32 },
};
const _v = new THREE.Vector3(), _box = new THREE.Box3();

/**
 * Aim `camera` at `actor` (a unit-looks actor, or anything with `group`). Bust = head and shoulders
 * (Chibi 2: from the head bone; a creature: the front of its bounding box). Full = the whole body.
 * `yaw` turns the view off the face so the shape reads (default a quarter turn to the right).
 */
export function frameCamera(actor, camera, { mode = 'bust', yaw = 0.42, pitch = 0.12, aspect = 1, pad = 1 } = {}) {
  const g = actor.group || actor;
  g.updateMatrixWorld(true);
  let target, radius;
  const headBone = actor.parts?.head;
  if (actor.kind === 'chibi2' && headBone && mode === 'bust') {
    headBone.getWorldPosition(_v);
    const s = g.getWorldScale(new THREE.Vector3()).x;
    const H = actor.height * s;                                   // chibi heads are ~45% of the body
    target = _v.clone().add(new THREE.Vector3(0, H * 0.19, 0));
    radius = H * 0.43;
  } else if (actor.kind === 'chibi2' && actor.parts && PART_FRAMES[mode]) {
    // one part of the body: the chest for a top, the feet for boots, the forearms for bracers
    const s = g.getWorldScale(new THREE.Vector3()).x, H = actor.height * s, F = PART_FRAMES[mode];
    target = new THREE.Vector3(); let n = 0;
    for (const b of F.bones) { const bone = actor.parts[b]; if (bone) { bone.getWorldPosition(_v); target.add(_v); n++; } }
    target.multiplyScalar(1 / Math.max(1, n)).add(new THREE.Vector3(0, H * F.lift, 0));
    radius = H * F.radius;
  } else {
    _box.setFromObject(g);
    const size = _box.getSize(new THREE.Vector3()), c = _box.getCenter(new THREE.Vector3());
    if (mode === 'bust') {
      // the head end of a beast: the front third, upper half (they all face +z)
      const front = _box.max.z - size.z * 0.28;
      target = new THREE.Vector3(c.x, _box.min.y + size.y * 0.62, Math.min(front, c.z + size.z * 0.3));
      radius = Math.max(size.y * 0.42, size.x * 0.55, size.z * 0.32);
    } else {
      target = c; radius = Math.max(size.x, size.y, size.z) * 0.58;
    }
  }
  radius *= pad;
  const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const fov = THREE.MathUtils.degToRad(camera.fov || 30);
  const dist = radius / Math.sin(fov / 2) / Math.min(1, aspect);
  camera.aspect = aspect;
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.near = Math.max(0.01, dist - radius * 4); camera.far = dist + radius * 6;
  camera.lookAt(target); camera.updateProjectionMatrix();
  return { target, radius, dist };
}

/** A small lit stage: key from the upper left, cool rim from behind, warm fill. Shared by the portrait. */
export function createStage() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3028, 1.35));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-2.5, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6); rim.position.set(3, 2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffc89a, 0.5); fill.position.set(3, 0.5, 3); scene.add(fill);
  return scene;
}

// ---------------------------------------------------------------- 2D finishing
function canvas2d(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Background + subject + vignette + bevel: the icon as the UI shows it. */
export function finishIcon(subject, { tint = ICON_TINTS.item, size = ICON_SIZE, border = true } = {}) {
  const c = canvas2d(size), g = c.getContext('2d');
  const bg = g.createRadialGradient(size * 0.5, size * 0.38, size * 0.05, size * 0.5, size * 0.5, size * 0.75);
  bg.addColorStop(0, tint[0]); bg.addColorStop(1, tint[1]);
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  // a soft ground glow behind the subject so dark models still separate
  const glow = g.createRadialGradient(size * 0.5, size * 0.55, 0, size * 0.5, size * 0.55, size * 0.45);
  glow.addColorStop(0, 'rgba(255,255,255,0.10)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, size, size);
  if (subject) {
    g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = size * 0.05; g.shadowOffsetY = size * 0.015;
    g.drawImage(subject, 0, 0, size, size); g.restore();
  }
  const vig = g.createRadialGradient(size / 2, size / 2, size * 0.42, size / 2, size / 2, size * 0.74);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vig; g.fillRect(0, 0, size, size);
  if (border) {
    g.lineWidth = Math.max(1, size / 64);
    g.strokeStyle = 'rgba(255,240,200,0.35)'; g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, size - g.lineWidth, size - g.lineWidth);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeRect(g.lineWidth * 1.5, g.lineWidth * 1.5, size - g.lineWidth * 3, size - g.lineWidth * 3);
  }
  return c;
}

async function loadImage(url) {
  const img = new Image(); img.decoding = 'async'; img.src = url;
  await img.decode(); return img;
}
/** Draw an SVG sprite tinted to one colour (the fx sprites are white-ish on transparent). */
async function tintedSprite(url, colour, size) {
  const img = await loadImage(url);
  const c = canvas2d(size), g = c.getContext('2d');
  g.drawImage(img, 0, 0, size, size);
  g.globalCompositeOperation = 'source-atop'; g.fillStyle = colour; g.globalAlpha = 0.55; g.fillRect(0, 0, size, size);
  return c;
}

/** Turn a rendered figure into a flat dark silhouette (the hero behind a skill icon). */
function silhouette(src, colour = 'rgba(8,8,12,0.78)') {
  const c = canvas2d(src.width, src.height), g = c.getContext('2d');
  g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = colour; g.fillRect(0, 0, c.width, c.height);
  return c;
}

// ---------------------------------------------------------------- the studio
/**
 * `renderer` is a THREE.WebGLRenderer (the game's). `looks` is a unit-looks resolver
 * (js/view/unit-looks.js). Rendering is serialised; each call resolves to a finished canvas.
 */
export function createIconStudio(renderer, { looks = null, size = ICON_SIZE, supersample = 2, base = new URL('../../', import.meta.url).href } = {}) {
  const scene = createStage();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const px = size * supersample;
  let chain = Promise.resolve();

  /** Render whatever is in the stage now into a transparent square and copy it out. */
  function shoot() {
    const dpr = renderer.getPixelRatio();
    const target = renderer.getRenderTarget(), vp = new THREE.Vector4(), sc = new THREE.Vector4();
    renderer.getViewport(vp); renderer.getScissor(sc);
    const scTest = renderer.getScissorTest(), autoClear = renderer.autoClear;
    const clear = renderer.getClearColor(new THREE.Color()), clearA = renderer.getClearAlpha();
    const dom = renderer.domElement;
    const w = Math.min(px / dpr, dom.width / dpr), h = w;               // CSS px of the square
    // bottom-left corner of the drawing buffer: copy from the TOP of the canvas image is y = H - h
    renderer.setRenderTarget(null);
    renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setScissorTest(true);
    renderer.setClearColor(0x000000, 0); renderer.autoClear = false; renderer.clear(true, true, true);
    renderer.render(scene, camera);
    const out = canvas2d(px), g = out.getContext('2d');
    g.drawImage(dom, 0, dom.height - h * dpr, w * dpr, h * dpr, 0, 0, px, px);
    renderer.setRenderTarget(target); renderer.setViewport(vp); renderer.setScissor(sc); renderer.setScissorTest(scTest);
    renderer.setClearColor(clear, clearA); renderer.autoClear = autoClear;
    return out;
  }
  const queue = fn => (chain = chain.then(fn, fn));

  async function figure(actor, { mode = 'bust', yaw = 0.42, pitch = 0.12, pad = 1, anim = 'ready', at = 0.6 } = {}) {
    scene.add(actor.group);
    actor.setAnim?.(anim, 0);
    for (let i = 0; i < 6; i++) actor.update?.(at / 6, at * (i + 1) / 6);       // settle the pose
    frameCamera(actor, camera, { mode, yaw, pitch, pad });
    const shot = shoot();
    scene.remove(actor.group);
    return shot;
  }

  const api = {
    renderer, scene, camera, size,
    /** Render an already-built actor (no finishing). */
    raw: (actor, opts) => queue(() => figure(actor, opts)),
    async unit(id, opts = {}) {
      return queue(async () => {
        const look = looks.forUnit(id), actor = await looks.build(look);
        const plan = look.kind === 'creature' ? CREATURE_FRAMES[look.spec.type] || { mode: 'full', yaw: 0.7, pad: 0.85 } : { mode: 'bust' };
        const shot = await figure(actor, { ...plan, ...opts });
        actor.dispose();
        return finishIcon(shot, { tint: ICON_TINTS[look.race] || ICON_TINTS.item, size });
      });
    },
    /** Any look object (e.g. a hero's form from looks.forForm): framed like a unit, on the hero tint. */
    async lookIcon(look, opts = {}) {
      return queue(async () => {
        const actor = await looks.build(look);
        const plan = look.kind === 'creature' ? CREATURE_FRAMES[look.spec.type] || { mode: 'full', yaw: 0.7, pad: 0.85 } : { mode: 'bust' };
        const shot = await figure(actor, { ...plan, ...opts }); actor.dispose();
        return finishIcon(shot, { tint: opts.tint || ICON_TINTS.hero, size });
      });
    },
    async hero(id, opts = {}) {
      return queue(async () => {
        const actor = await looks.build(looks.forHero(id));
        const shot = await figure(actor, { mode: 'bust', ...opts });
        actor.dispose();
        return finishIcon(shot, { tint: ICON_TINTS.hero, size });
      });
    },
    /** Silhouette source: the hero's whole body (skill icons stand it behind the effect). */
    async heroFigure(id) {
      return queue(async () => { const a = await looks.build(looks.forHero(id)); const s = await figure(a, { mode: 'full', yaw: 0.6, anim: 'cast', at: 0.35, pad: 1.05 }); a.dispose(); return s; });
    },
    /**
     * An item. `{ held: id, color }` / `{ offhand: id, color }` build the weapon or shield on its own
     * from the real Chibi 2 builders; `{ armour: slot, part: {id,color}, hero }` dresses a hero in it
     * and frames that part of the body; `{ glyph }` draws a potion/oil/trinket flask in 2D.
     */
    async item(spec, opts = {}) {
      return queue(async () => {
        let shot;
        if (spec.held || spec.offhand) {
          const obj = buildItemModel(spec);
          const holder = { group: obj, kind: 'item' };
          scene.add(obj);
          frameCamera(holder, camera, { mode: 'full', yaw: spec.yaw ?? 0.25, pitch: spec.pitch ?? 0.1, pad: spec.offhand ? 0.85 : 0.78 });
          shot = shoot(); scene.remove(obj); disposeTree(obj);
        } else if (spec.armour) {
          const look = spec.role ? looks.forRole(spec.role) : looks.forHero(spec.hero || 'warrior');
          const avatar = JSON.parse(JSON.stringify(look.avatar));
          for (const s of ['held', 'offhand']) avatar[s] = { id: 'none' };
          avatar[spec.armour] = spec.part;
          const actor = await looks.build({ ...look, avatar });
          const mode = { hat: 'bust', top: 'torso', shoes: 'feet', decor: 'hands' }[spec.armour] || 'full';
          shot = await figure(actor, { mode, yaw: spec.armour === 'shoes' ? 0.7 : 0.35, pitch: spec.armour === 'shoes' ? 0.35 : 0.12, pad: spec.armour === 'hat' ? 0.98 : 1, anim: 'idle' });
          actor.dispose();
        } else shot = await glyph(spec, px, base);
        return finishIcon(shot, { tint: spec.tint || ICON_TINTS.item, size });
      });
    },
    /** Skill: element-tinted frame + the skill's fx sprite + the hero's silhouette (PLAN §16). */
    async skill(skill, { hero = null, sprite = 'spark', element = 'physical' } = {}) {
      const tint = ELEMENT_TINTS[element] || ELEMENT_TINTS.physical;
      const sil = hero ? silhouette(await api.heroFigure(hero)) : null;
      const c = canvas2d(px), g = c.getContext('2d');
      const bg = g.createRadialGradient(px * 0.5, px * 0.45, px * 0.04, px * 0.5, px * 0.5, px * 0.72);
      bg.addColorStop(0, tint[0]); bg.addColorStop(0.45, mix(tint[0], tint[1], 0.55)); bg.addColorStop(1, tint[1]);
      g.fillStyle = bg; g.fillRect(0, 0, px, px);
      if (sil) { g.globalAlpha = 0.85; g.drawImage(sil, -px * 0.18, px * 0.12, px * 0.95, px * 0.95); g.globalAlpha = 1; }
      const sp = await tintedSprite(new URL(`../../assets/data/fx/${sprite}.svg`, base).href, tint[0], px);
      g.save(); g.shadowColor = tint[0]; g.shadowBlur = px * 0.08; g.drawImage(sp, px * 0.18, px * 0.08, px * 0.78, px * 0.78); g.restore();
      return finishIcon(c, { tint: ['rgba(0,0,0,0)', 'rgba(0,0,0,0)'], size });
    },
    /** A Sanctum power: the skill composite without a hero, inside a frame in the power kind's colour. */
    async power(id, { sprite = 'spark', element = 'arcane', frame = '#ffd24a' } = {}) {
      const base = await api.skill(id, { hero: null, sprite, element });
      const g = base.getContext('2d'), w = base.width, lw = Math.max(3, w / 22);
      g.strokeStyle = frame; g.lineWidth = lw; g.globalAlpha = 0.95; g.strokeRect(lw / 2 + 1, lw / 2 + 1, w - lw - 2, w - lw - 2);
      g.globalAlpha = 0.35; g.lineWidth = lw * 2.4; g.strokeRect(lw * 1.6, lw * 1.6, w - lw * 3.2, w - lw * 3.2); g.globalAlpha = 1;
      return base;
    },
    /** Any static model (a building): its whole bounding box from a raised three-quarter view. */
    async object(group, { tint = ICON_TINTS.building, yaw = 0.6, pitch = 0.5, pad = 0.82, update = null } = {}) {
      return queue(async () => {
        scene.add(group); update?.(0.016); update?.(0.5);
        frameCamera({ group, kind: 'object' }, camera, { mode: 'full', yaw, pitch, pad });
        const shot = shoot(); scene.remove(group);
        return finishIcon(shot, { tint, size });
      });
    },
    dispose() { scene.traverse(o => o.dispose?.()); },
  };
  return api;
}

function mix(a, b, t) { const A = new THREE.Color(a), B = new THREE.Color(b); return '#' + A.lerp(B, t).getHexString(); }
function disposeTree(o) { o.traverse(c => { c.geometry?.dispose(); c.material?.dispose?.(); }); }

/** 2D items that have no 3D model: potion, oil, ring, amulet, scroll. */
async function glyph(spec, px) {
  const c = canvas2d(px), g = c.getContext('2d'), s = px / 128, col = spec.color || '#d84040';
  g.save(); g.translate(px / 2, px / 2); g.scale(s, s);
  g.lineJoin = 'round';
  if (spec.glyph === 'potion' || spec.glyph === 'oil') {
    const grd = g.createLinearGradient(-30, -10, 30, 40); grd.addColorStop(0, '#ffffff55'); grd.addColorStop(1, '#00000055');
    g.fillStyle = '#d8e4ea33'; g.strokeStyle = '#e8eef2'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-12, -40); g.lineTo(12, -40); g.lineTo(12, -18); g.bezierCurveTo(40, -6, 40, 44, 0, 44); g.bezierCurveTo(-40, 44, -40, -6, -12, -18); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(-31, 8); g.bezierCurveTo(-30, 44, 30, 44, 31, 8); g.bezierCurveTo(10, 14, -10, 2, -31, 8); g.fill();
    g.fillStyle = grd; g.fill();
    g.fillStyle = '#8a5a2a'; g.fillRect(-14, -50, 28, 12);
    g.fillStyle = '#ffffffaa'; g.beginPath(); g.ellipse(-14, 6, 5, 12, 0.3, 0, Math.PI * 2); g.fill();
  } else if (spec.glyph === 'ring') {
    g.strokeStyle = '#e0b850'; g.lineWidth = 12; g.beginPath(); g.ellipse(0, 10, 30, 26, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#fff2b0'; g.lineWidth = 3; g.beginPath(); g.ellipse(-2, 6, 30, 26, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
    g.fillStyle = col; g.beginPath(); g.moveTo(0, -38); g.lineTo(16, -20); g.lineTo(0, -6); g.lineTo(-16, -20); g.closePath(); g.fill();
    g.fillStyle = '#ffffff99'; g.beginPath(); g.moveTo(0, -36); g.lineTo(8, -22); g.lineTo(0, -20); g.closePath(); g.fill();
  } else if (spec.glyph === 'amulet') {
    g.strokeStyle = '#c8a040'; g.lineWidth = 4; g.beginPath(); g.moveTo(-36, -44); g.quadraticCurveTo(0, 10, 36, -44); g.stroke();
    g.fillStyle = '#e0b850'; g.beginPath(); g.arc(0, 18, 24, 0, Math.PI * 2); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(0, 18, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffffaa'; g.beginPath(); g.arc(-5, 12, 5, 0, Math.PI * 2); g.fill();
  } else if (spec.glyph === 'spyglass') {
    g.rotate(-0.7);
    g.fillStyle = '#5a3a20'; g.fillRect(-46, -11, 40, 22); g.fillStyle = col; g.fillRect(-8, -14, 30, 28); g.fillStyle = '#8a6a40'; g.fillRect(22, -17, 26, 34);
    for (const x of [-8, 22]) { g.fillStyle = '#e8d080'; g.fillRect(x - 2, -15, 4, 30); }
    g.fillStyle = '#9fd8ff'; g.beginPath(); g.ellipse(48, 0, 4, 15, 0, 0, Math.PI * 2); g.fill();
  } else if (spec.glyph === 'flare') {
    g.fillStyle = '#8a2a1a'; g.fillRect(-9, -6, 18, 50); g.fillStyle = '#e8dcc0'; g.fillRect(-9, 10, 18, 6);
    const f = g.createRadialGradient(0, -20, 2, 0, -20, 34); f.addColorStop(0, '#fff6c0'); f.addColorStop(0.4, col); f.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = f; g.beginPath(); g.arc(0, -20, 34, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#ffd070'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 18, -20 + Math.sin(a) * 18); g.lineTo(Math.cos(a) * 30, -20 + Math.sin(a) * 30); g.stroke(); }
  } else {
    g.fillStyle = '#efe6cc'; g.fillRect(-30, -36, 60, 72); g.fillStyle = '#c8b890'; g.fillRect(-36, -42, 72, 12); g.fillRect(-36, 30, 72, 12);
    g.fillStyle = col; for (let i = 0; i < 4; i++) g.fillRect(-20, -20 + i * 12, 40 - (i % 2) * 12, 4);
  }
  g.restore();
  return c;
}

/**
 * A held weapon or off-hand item as its own model, built by the REAL Chibi 2 builders
 * (avatar-3d/js/chibi2-gear.js -> chibi2-weapons.js) into plain meshes in hand space.
 */
export function buildItemModel(spec) {
  const group = new THREE.Group(), cloth = [], metal = [];
  const add = (geometry, bone, color, { position = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0], metal: isMetal = false } = {}) => {
    // only what is in the hand: a bow's builder also hangs a quiver on the hips
    if (spec.held && bone && !/hand|grip|elbow/.test(bone)) return;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(...position), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)), new THREE.Vector3(...scale));
    const geo = geometry.clone(); geo.applyMatrix4(m);
    (isMetal ? metal : cloth).push([geo, color]);
  };
  const a = { held: { id: spec.held || 'none', color: spec.color, quality: spec.quality ?? 2 }, offhand: { id: spec.offhand || 'none', color: spec.color, quality: spec.quality ?? 2 }, body: {} };
  const c = { add, trim: '#d9b477', leather: '#493c36', steel: '#c4d4d6', darkSteel: '#536a73', W: 1, T: 1, H: 1, A: 1, LW: 1, hipsZ: 0.13, rig: null };
  try { if (spec.held) buildHeld(a, c); if (spec.offhand) buildOffhand(a, c); }
  catch (e) { console.warn('icons: item model', spec, e.message); }
  for (const [list, opts] of [[cloth, { roughness: 0.7, metalness: 0.05 }], [metal, { roughness: 0.32, metalness: 0.75 }]]) {
    for (const [geo, color] of list) {
      if (!geo.attributes.normal) geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, ...opts }));
      group.add(mesh);
    }
  }
  // weapons lie on the icon's diagonal, point up and right (hand space runs the blade along -y);
  // a shield is built facing -x on the forearm, so a quarter turn brings its face to the camera
  if (spec.rot) { group.rotation.order = 'ZYX'; group.rotation.set(...spec.rot); }
  else if (spec.offhand) group.rotation.set(0, Math.PI / 2, 0); else group.rotation.set(0, 0, Math.PI * 0.75);
  return group;
}

// ---------------------------------------------------------------- the library (baked + cached)
/**
 * Baked icons live in assets/icons/<kind>/<id>.png with assets/icons/index.json listing them
 * ({ size, kinds: { unit: [...ids], hero: [...], item: [...], skill: [...] } }). Anything not baked
 * is generated by an attached studio on first ask and kept as a data URL for the session.
 */
export async function createIconLibrary({ base = new URL('../../assets/icons/', import.meta.url).href } = {}) {
  let index = { kinds: {} };
  try { const r = await fetch(new URL('index.json', base)); if (r.ok) index = await r.json(); } catch { /* none baked yet */ }
  const baked = new Map(Object.entries(index.kinds || {}).map(([k, ids]) => [k, new Set(ids)]));
  const made = new Map();
  let studio = null;
  const api = {
    index,
    url(kind, id) { return baked.get(kind)?.has(id) ? new URL(`${kind}/${id}.png`, base).href : (made.get(kind + ':' + id) || null); },
    attach(s) { studio = s; return api; },
    async get(kind, id, spec) {
      const known = api.url(kind, id); if (known) return known;
      if (!studio) return null;
      const c = kind === 'unit' ? await studio.unit(id) : kind === 'hero' ? await studio.hero(id) : kind === 'item' ? await studio.item(spec) : await studio.skill(id, spec);
      const url = c.toDataURL('image/png'); made.set(kind + ':' + id, url); return url;
    },
  };
  return api;
}
