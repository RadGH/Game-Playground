// The live 3D portrait in the control bar (stream C, PLAN §16).
//
//   import { createPortrait } from './portrait.js';
//   const portrait = createPortrait({ gfx, slot: bar.portraitSlot, looks });
//   bar.onSelect(id => portrait.showEnt(entById(id)));     // ent = { kind: 'hero'|'unit', type }
//   portrait.react('hit');                                  // on damage; 'talk' on a line, 'attack', 'cast'
//   portrait.dispose();
//
// HOW IT DRAWS. The control bar is an opaque HTML panel over the game canvas, so a scissored viewport
// on the canvas would be hidden under it. Instead the portrait registers a pass with the game's
// renderer (`gfx.addPass`, run after every viewport): it renders its own tiny scene into a scissored
// square of the main canvas — the square under the slot, which the bar covers anyway — and copies
// those pixels into a 2D canvas inside the slot in the same task (`drawImage` of a WebGL canvas is
// valid until the frame is composited). One WebGL context, the game's tone mapping, and two control
// bars in split screen are simply two portraits, each with its own scene and slot.
//
// The model idles ('ready'), plays 'hit' when damaged and 'talk' on a line, and turns a little toward
// the viewer now and then. It renders at most `fps` times a second (default 30).

import * as THREE from 'three';
import { frameCamera, createStage } from './icons.js';

const TINTS = { freeholds: '#2d4366', ashtusk: '#5a2a22', unburied: '#24494c', thornmane: '#3a4424', hero: '#5a4422' };

export function createPortrait({ gfx, slot, looks, fps = 30, background = null }) {
  const renderer = gfx.renderer;
  const scene = createStage();
  const camera = new THREE.PerspectiveCamera(26, 1, 0.01, 100);
  const out = document.createElement('canvas');
  out.className = 'portrait-live';
  Object.assign(out.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
  slot.append(out);
  slot.classList.add('live');
  const ctx = out.getContext('2d');
  let actor = null, current = null, token = 0, last = 0, clock = 0, nextLook = 2, idleClip = 'ready', bg = new THREE.Color(background || '#1d2128');
  const vp = new THREE.Vector4(), sc = new THREE.Vector4(), clear = new THREE.Color();

  async function show(ref) {
    const my = ++token;
    if (current === ref) return;
    current = ref;
    if (actor) { scene.remove(actor.group); actor.dispose(); actor = null; }
    if (!ref) { ctx.clearRect(0, 0, out.width, out.height); slot.classList.remove('live'); return; }
    let look; try { look = typeof ref === 'string' ? looks.forRef(ref) : ref; } catch { look = null; }
    if (!look) { slot.classList.remove('live'); return; }
    const a = await looks.build(look);
    if (my !== token) { a.dispose(); return; }
    actor = a; scene.add(a.group);
    bg = new THREE.Color(background || TINTS[look.hero ? 'hero' : look.race] || '#1d2128');
    idleClip = a.kind === 'chibi2' ? 'ready' : 'idle';
    a.setAnim(idleClip, 0);
    a.update(0.3, 0.3);
    const plan = a.kind === 'creature' ? { mode: 'bust', yaw: 0.7, pad: look.spec?.type === 'crow' ? 0.7 : 1.05 } : { mode: 'bust', yaw: 0.32, pad: 1.0 };
    frameCamera(a, camera, plan);
    slot.classList.add('live');
  }

  function pass(r) {
    if (!actor) return;
    const now = performance.now();
    if (now - last < 1000 / fps) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0); last = now; clock += dt;
    const rect = slot.getBoundingClientRect(), cr = r.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom < 0 || rect.top > innerHeight) return;
    // keep the square inside the canvas; the slot normally sits over its bottom edge
    const w = Math.round(rect.width), h = Math.round(rect.height);
    const x = Math.max(0, Math.min(cr.width - w, Math.round(rect.left - cr.left)));
    const yTop = Math.max(0, Math.min(cr.height - h, Math.round(rect.top - cr.top)));
    const dpr = r.getPixelRatio();
    if (out.width !== Math.round(w * dpr) || out.height !== Math.round(h * dpr)) { out.width = Math.round(w * dpr); out.height = Math.round(h * dpr); }
    // a glance toward the viewer now and then
    if (clock > nextLook) { nextLook = clock + 3 + Math.random() * 4; actor.group.rotation.y = (Math.random() - 0.5) * 0.5; }
    actor.update(dt, clock);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // render into the square under the slot, then copy it out
    r.getViewport(vp); r.getScissor(sc); const scTest = r.getScissorTest(), ac = r.autoClear;
    r.getClearColor(clear); const ca = r.getClearAlpha();
    const gy = cr.height - yTop - h;
    r.setViewport(x, gy, w, h); r.setScissor(x, gy, w, h); r.setScissorTest(true);
    r.setClearColor(bg, 1); r.autoClear = false; r.clear(true, true, false);
    r.render(scene, camera);
    ctx.clearRect(0, 0, out.width, out.height);
    ctx.drawImage(r.domElement, x * dpr, yTop * dpr, w * dpr, h * dpr, 0, 0, out.width, out.height);
    r.setViewport(vp); r.setScissor(sc); r.setScissorTest(scTest); r.setClearColor(clear, ca); r.autoClear = ac;
  }
  const removePass = gfx.addPass(pass);

  const api = {
    get current() { return current; },
    get actor() { return actor; },
    /** Show a look ref ('unit:levy', 'hero:druid'), a look object, or null to clear. */
    show,
    /** Show a sim entity ({ kind, type }); tides and unknowns clear the portrait. */
    showEnt(ent) { return show(ent && (ent.kind === 'hero' || ent.kind === 'unit') ? `${ent.kind}:${ent.type}` : null); },
    /** One-shot reaction: 'hit' | 'talk' | 'attack' | 'cast'. Returns to idle by itself. */
    react(kind = 'hit') {
      if (!actor) return;
      const clip = actor.kind === 'creature' && kind === 'hit' ? 'talk' : kind;
      actor.setAnim(clip, 0.08, true);
      clearTimeout(api._t); api._t = setTimeout(() => actor?.setAnim(idleClip, 0.2), kind === 'talk' ? 1800 : 700);
    },
    dispose() {
      token++; removePass?.(); clearTimeout(api._t);
      if (actor) { scene.remove(actor.group); actor.dispose(); actor = null; }
      out.remove(); slot.classList.remove('live');
    },
  };
  return api;
}
