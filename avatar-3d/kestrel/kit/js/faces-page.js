// Kestrel kit — the faces and hair review sheet (faces.html). One renderer draws every cell of the grid in turn
// (scissor), building each character, posing it and disposing it again, so a slot of 88 heads costs one live character.
import * as THREE from 'three';
import { createKestrelCharacter, KESTREL_ANIMS, EXPRESSIONS } from './kestrel.js';
import { FACE_IDS } from './face-catalog.js';
import { lookFor } from '../../js/looks.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const SLOTS = ['hair', 'headShape', 'eyes', 'pupil', 'iris', 'brows', 'nose', 'mouth', 'ears', 'facialHair', 'accessory', 'extras', 'expressions', 'combos', 'clips'];
const state = {
  slot: SLOTS.includes(qs.get('slot')) ? qs.get('slot') : 'hair', body: qs.get('body') || 'both', view: qs.get('view') || 'three',
  expr: qs.get('expr') || 'neutral', anim: qs.get('anim') || 'idle', frame: qs.get('frame') || null, t: +(qs.get('t') || 0.35),
};
if (qs.get('cols')) document.documentElement.style.setProperty('--cols', qs.get('cols'));
if (qs.get('shot') === '1') document.body.classList.add('shot');
const report = window.__faces = { ready: false, cells: [] };

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight('#dfe8ff', 0.9); rim.position.set(-3, 3, -2); scene.add(rim);
const cam = new THREE.PerspectiveCamera(24, 0.8, 0.05, 50);
const bg = new THREE.Color('#c9ccd1');

/** The looks of one slot: [{ label, look, expr?, anim? }]. */
function cellsFor(slot, body) {
  const out = [];
  const bodies = body === 'both' ? ['male', 'female'] : [body];
  if (slot === 'expressions') {
    const combos = [{}, { facialHair: { id: 'full' } }, { accessory: { id: 'glasses' } }, { eyes: { id: 'anime' }, mouth: { id: 'grin' } }];
    for (const b of bodies) for (const [ci, extra] of combos.entries()) for (const e of EXPRESSIONS) out.push({ label: `${e}${ci ? ' +' + Object.values(extra).map(v => v.id).join('+') : ''}`, look: { ...lookFor(b), ...extra }, expr: e, sub: b });
    for (const b of bodies) out.push({ label: 'blink', look: lookFor(b), blink: 1, sub: b }, { label: 'blink+glasses', look: { ...lookFor(b), accessory: { id: 'glasses' } }, blink: 1, sub: b }, { label: 'surprised+beard', look: { ...lookFor(b), facialHair: { id: 'long' } }, expr: 'surprised', sub: b });
    return out;
  }
  if (slot === 'combos') {
    const C = [
      { hair: { id: 'long' }, facialHair: { id: 'full' }, ears: { id: 'pointed' } },
      { hair: { id: 'twin_tails', color: '#d94a2a', color2: '#f2e2b0' }, eyes: { id: 'cat', color: '#3a8a5a', colorR: '#c33333' } },
      { hair: { id: 'braids' }, accessory: { id: 'round_glasses' }, extras: { id: 'freckles' } },
      { hair: { id: 'mohawk' }, mouth: { id: 'tusks' }, ears: { id: 'notched' }, extras: { id: 'warpaint' }, body: { skin: '#7a9a5a' } },
      { hair: { id: 'locs', color: '#111111', color2: '#c9a227' }, facialHair: { id: 'goatee' }, body: { skin: '#5c3a1e' } },
      { hair: { id: 'bald' }, facialHair: { id: 'braided_beard', color: '#a86a3a' }, accessory: { id: 'eyepatch' }, extras: { id: 'scar_cheek' } },
      { hair: { id: 'afro' }, accessory: { id: 'earrings' }, mouth: { id: 'smile' } },
      { hair: { id: 'long_braid', color: '#eeeeee' }, eyes: { id: 'glow', color: '#7fe0ee' }, extras: { id: 'pale' } },
      { hair: { id: 'hood_hair' }, accessory: { id: 'scarf_mask' }, eyes: { id: 'sharp' } },
      { hair: { id: 'wavy', color: '#a86a3a' }, accessory: { id: 'pendant' }, extras: { id: 'blush' } },
      { hair: { id: 'messy' }, facialHair: { id: 'handlebar' }, accessory: { id: 'monocle' }, headShape: 'square' },
      { hair: { id: 'curly_bob' }, ears: { id: 'wolf_ears' }, nose: { id: 'button' } },
    ];
    for (const b of bodies) for (const c of C) { const L = lookFor(b); out.push({ label: Object.values(c).map(v => (typeof v === 'string' ? v : v.id || v.skin)).filter(Boolean).join(' + '), look: { ...L, ...c, body: { ...L.body, ...(c.body || {}) } }, sub: b }); }
    return out;
  }
  if (slot === 'clips') {
    const hairs = ['long', 'high_ponytail', 'twin_tails', 'long_braid', 'locs', 'wavy', 'braids', 'court_cut'];
    const only = qs.get('ids') ? qs.get('ids').split(',') : null;
    for (const b of bodies) for (const h of hairs.filter(x => !only || only.includes(x))) for (const [a, t] of [['walk', 0.3], ['run', 0.25], ['attack', 0.35], ['cast', 0.5], ['dead', 1.6]]) out.push({ label: `${h} ${a}`, look: { ...lookFor(b), hair: { id: h, color: '#4a2a1a' } }, anim: a, t, sub: b, frame: 'bust' });
    return out;
  }
  const only = qs.get('ids') ? qs.get('ids').split(',') : null;
  const ids = FACE_IDS[slot].filter(id => !only || only.includes(id));
  const views = qs.get('views') ? qs.get('views').split(',') : [null];
  for (const b of bodies) for (const id of ids) for (const v of views) {
    const look = lookFor(b);
    if (slot === 'headShape') look.headShape = id;
    else if (slot === 'pupil') look.eyes = { ...look.eyes, pupil: id };
    else if (slot === 'iris') look.eyes = { ...look.eyes, iris: id };
    else look[slot] = { ...(look[slot] || {}), id };
    // face parts are shown under a combed-back cut, so no fringe hides the brows and eyes (?hair= picks another)
    if (slot === 'hair' && qs.get('underHat')) look.hair.underHat = qs.get('underHat') === '1' ? true : { front: +qs.get('underHat'), back: +qs.get('underHat') - 0.07 };
    if (slot !== 'hair') look.hair = { ...look.hair, id: qs.get('hair') || (slot === 'facialHair' || slot === 'accessory' ? 'short' : 'slicked') };
    out.push({ label: id + (v ? ' ' + v : ''), look, sub: b, view: v });
  }
  return out;
}

function frameCamera(actor, view, frame, aspect) {
  const eb = new THREE.Vector3(); actor.parts.eyeL.getWorldPosition(eb);
  const er = new THREE.Vector3(); actor.parts.eyeR.getWorldPosition(er);
  const hb = new THREE.Vector3(); actor.parts.head.getWorldPosition(hb);
  eb.add(er).multiplyScalar(0.5);
  // framed on the middle of the head at eye height: the eyes sit ~9 cm in front of it, along the head's own facing
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.parts.head.getWorldQuaternion(new THREE.Quaternion()));
  eb.addScaledVector(fwd, -0.085);
  void hb;
  const a = { front: 0, three: 0.7, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 }[view] ?? 0.7;
  cam.aspect = aspect;
  if (frame === 'body') {
    const h = actor.metrics().height, c = new THREE.Vector3(0, h * 0.55, 0);
    cam.fov = 30; cam.position.set(Math.sin(a) * h * 2.3, h * 0.62, Math.cos(a) * h * 2.3); cam.lookAt(c);
  } else {
    const bust = frame === 'bust', close = frame === 'face', y = eb.y - (bust ? 0.14 : close ? 0.025 : 0.0), d = bust ? 1.55 : close ? 0.6 : 0.98;
    cam.fov = 24; cam.position.set(eb.x + Math.sin(a) * d, y + 0.02, eb.z + Math.cos(a) * d); cam.lookAt(eb.x, y, eb.z);
  }
  cam.updateProjectionMatrix();
}

let run = 0;
async function draw() {
  const me = ++run;
  const cells = cellsFor(state.slot, state.body);
  const grid = $('#grid'); grid.innerHTML = '';
  const els = cells.map(c => { const d = document.createElement('div'); d.className = 'fc-cell'; d.innerHTML = `<b>${c.label}${state.body === 'both' ? ' · ' + (c.sub === 'male' ? 'M' : 'F') : ''}</b><i></i>`; grid.appendChild(d); return d; });
  await new Promise(r => requestAnimationFrame(r));
  const W = grid.clientWidth, H = grid.clientHeight;
  renderer.setSize(W, H, false);
  renderer.setScissorTest(false); renderer.setClearColor('#1d2026'); renderer.clear();
  renderer.setScissorTest(true);
  const gr = grid.getBoundingClientRect();
  report.cells = [];
  for (const [i, c] of cells.entries()) {
    if (me !== run) return;
    const r = els[i].getBoundingClientRect(), x = r.left - gr.left, y = H - (r.top - gr.top) - r.height;
    let actor;
    try {
      actor = await createKestrelCharacter(c.look, { lod: qs.get('lod') === '1' ? 1 : 0 });
      scene.add(actor.group);
      const anim = c.anim || state.anim;
      actor.setAnim(anim, 0, true);
      actor.setExpression(c.expr || state.expr, 1, 0.001);
      actor.setGaze(0, 0);
      actor.update(0.001); actor.setBlink(c.blink ?? 0);
      const T = c.t ?? (anim === 'idle' ? 0 : state.t);
      for (let t = 0; t < T; t += 0.05) actor.update(Math.min(0.05, T - t));
      actor.update(0.3);
      if (c.blink) { actor.setBlink(1); actor.update(0.016); }
      frameCamera(actor, c.view || state.view, c.frame || state.frame, r.width / r.height);
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
      renderer.setClearColor(bg); renderer.clear();
      renderer.render(scene, cam);
      const s = actor.stats();
      els[i].querySelector('i').textContent = s.triangles.toLocaleString();
      report.cells.push({ label: c.label, sub: c.sub, triangles: s.triangles, lod1: s.lodTriangles?.[1], ms: s.buildMs });
    } catch (e) {
      els[i].classList.add('bad'); els[i].querySelector('i').textContent = 'error';
      report.cells.push({ label: c.label, sub: c.sub, error: String(e.message) });
      console.error(c.label, e);
    } finally { if (actor) { scene.remove(actor.group); actor.dispose(); } }
    if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
  }
  report.ready = true;
}

function buttons(host, items, k) {
  const el = $(host); el.innerHTML = '';
  for (const [v, text] of items) {
    const b = document.createElement('button'); b.textContent = text; b.dataset.v = v; if (state[k] === v) b.className = 'on';
    b.onclick = () => { state[k] = v; for (const x of el.children) x.classList.toggle('on', x.dataset.v === v); report.ready = false; draw(); };
    el.appendChild(b);
  }
}
buttons('#c-slot', SLOTS.map(s => [s, s]), 'slot');
buttons('#c-body', [['both', 'Both'], ['male', 'Male'], ['female', 'Female']], 'body');
buttons('#c-view', [['front', 'Front'], ['three', '3/4'], ['side', 'Side'], ['back', 'Back']], 'view');
buttons('#c-expr', EXPRESSIONS.map(e => [e, e]), 'expr');
buttons('#c-anim', KESTREL_ANIMS.filter(a => ['idle', 'walk', 'run', 'attack', 'cast', 'talk', 'dead'].includes(a)).map(a => [a, a]), 'anim');
draw().catch(e => { report.error = String(e.stack || e); });
