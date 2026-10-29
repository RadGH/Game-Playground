// Kestrel kit — the hats review sheet (hats.html). One renderer draws every cell in turn (scissor), building, posing and
// disposing each character, like faces-page.js.
import * as THREE from 'three';
import { createKestrelCharacter, EXPRESSIONS } from './kestrel.js';
import { HAT_IDS, HAT_INFO } from './hat-catalog.js';
import { lookFor } from '../../js/looks.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const MODES = ['grid', 'turn', 'clips', 'expr', 'classes'];
const state = {
  mode: MODES.includes(qs.get('mode')) ? qs.get('mode') : 'grid', body: qs.get('body') || 'both',
  hairs: (qs.get('hairs') || 'short,long,ponytail').split(','), views: (qs.get('views') || 'front,three').split(','),
};
if (qs.get('cols')) document.documentElement.style.setProperty('--cols', qs.get('cols'));
if (qs.get('shot') === '1') document.body.classList.add('shot');
const report = window.__hats = { ready: false, cells: [] };

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

const ids = () => (qs.get('ids') ? qs.get('ids').split(',') : HAT_IDS);
const bodies = () => (state.body === 'both' ? ['male', 'female'] : [state.body]);
const HAIR_COLOR = { male: '#3a2417', female: '#6a3a1e' };
/** A test look wearing `id` with hair `hair` (and the page's beard / ears / emblem options). */
function lookWith(body, id, hair, extra = {}) {
  const L = lookFor(body, qs.get('outfit') === '1');
  L.hair = { id: hair, color: HAIR_COLOR[body] };
  if (qs.get('beard')) L.facialHair = { id: qs.get('beard') };
  if (qs.get('ears')) L.ears = { id: qs.get('ears') };
  L.hat = { id, ...(qs.get('emblem') ? { emblem: qs.get('emblem') } : {}), ...(qs.get('quality') ? { quality: +qs.get('quality') } : {}) };
  return { ...L, ...extra };
}

async function cellsFor(mode) {
  const out = [];
  if (mode === 'grid') {
    for (const id of ids()) for (const b of bodies()) for (const h of state.hairs) for (const v of state.views) out.push({ label: `${HAT_INFO[id].name} · ${h}`, look: lookWith(b, id, h), sub: b, view: v });
  } else if (mode === 'turn') {
    for (const id of ids()) for (const b of bodies()) for (const v of ['front', 'three', 'side', 'back', 'left']) out.push({ label: `${HAT_INFO[id].name} ${v}`, look: lookWith(b, id, state.hairs[0]), sub: b, view: v });
  } else if (mode === 'clips') {
    const clips = (qs.get('clips') || 'walk:0.3,attack:0.35,cast:0.5,hit:0.15,dead:1.6').split(',').map(s => s.split(':'));
    for (const id of ids()) for (const b of bodies()) for (const [a, t] of clips) out.push({ label: `${HAT_INFO[id].name} ${a}`, look: lookWith(b, id, state.hairs[0]), sub: b, anim: a, t: +t, view: qs.get('view') || 'three', frame: 'bust' });
  } else if (mode === 'expr') {
    for (const id of ids()) for (const b of bodies()) {
      for (const e of EXPRESSIONS) out.push({ label: `${HAT_INFO[id].name} ${e}`, look: lookWith(b, id, state.hairs[0]), sub: b, expr: e, view: 'front' });
      out.push({ label: `${HAT_INFO[id].name} blink`, look: lookWith(b, id, state.hairs[0]), sub: b, blink: 1, view: 'front' });
      out.push({ label: `${HAT_INFO[id].name} head turn`, look: lookWith(b, id, state.hairs[0]), sub: b, lookAt: true, view: 'three' });
    }
  } else if (mode === 'classes') {
    // Thousandvale's class looks (dressed by their class outfit), through the same Chibi → Kestrel path the game uses
    const [{ avatarFor }, { kestrelLookFromChibi }] = await Promise.all([import('../../../../prototypes/thousandvale/js/client/looks.js'), import('./from-chibi.js')]);
    const data = await (await fetch('../../data/class-outfits.json')).json();
    const races = ['human', 'elf', 'dwarf', 'halfling'];
    let i = 0;
    for (const [cls, o] of Object.entries(data.classes)) {
      if (!o.hat || o.hat.id === 'none') continue;
      const race = races[i++ % 4], a = await avatarFor({ race, cls, seed: 3 + i });
      out.push({ label: `${cls} (${o.hat.id}) ${race}`, look: kestrelLookFromChibi(a), sub: 'tv', view: 'three' });
    }
  }
  return out;
}

function frameCamera(actor, view, frame, aspect, anim) {
  if (anim === 'dead') {
    // lying down: framed from above the head, on the head
    const hb = new THREE.Vector3(); actor.parts.head.getWorldPosition(hb); const ch = new THREE.Vector3(); actor.parts.chest.getWorldPosition(ch);
    const c = hb.clone().lerp(ch, 0.35); cam.aspect = aspect; cam.fov = 24; cam.position.set(c.x + 0.6, c.y + 1.3, c.z + 0.9); cam.lookAt(c); cam.updateProjectionMatrix(); return;
  }
  const eb = new THREE.Vector3(); actor.parts.eyeL.getWorldPosition(eb);
  const er = new THREE.Vector3(); actor.parts.eyeR.getWorldPosition(er);
  eb.add(er).multiplyScalar(0.5);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(actor.parts.head.getWorldQuaternion(new THREE.Quaternion()));
  eb.addScaledVector(fwd, -0.085);
  const a = { front: 0, three: 0.7, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 - 0.4 }[view] ?? 0.7;
  cam.aspect = aspect;
  const bust = frame === 'bust', y = eb.y - (bust ? 0.12 : -0.035), d = bust ? 1.75 : 1.32;
  cam.fov = 24; cam.position.set(eb.x + Math.sin(a) * d, y + 0.05, eb.z + Math.cos(a) * d); cam.lookAt(eb.x, y, eb.z);
  cam.updateProjectionMatrix();
}

let run = 0;
async function draw() {
  const me = ++run;
  const cells = await cellsFor(state.mode);
  const grid = $('#grid'); grid.innerHTML = '';
  const els = cells.map(c => { const d = document.createElement('div'); d.className = 'fc-cell'; d.innerHTML = `<b>${c.label}${c.sub === 'male' ? ' · M' : c.sub === 'female' ? ' · F' : ''}</b><i></i>`; grid.appendChild(d); return d; });
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
      const anim = c.anim || 'idle';
      actor.setAnim(anim, 0, true);
      actor.setExpression(c.expr || 'neutral', 1, 0.001);
      actor.setGaze(0, 0);
      if (c.lookAt) actor.lookAt(new THREE.Vector3(0.9, 1.9, 0.6), { head: 1 });
      actor.update(0.001); actor.setBlink(c.blink ?? 0);
      const T = c.t ?? 0;
      for (let t = 0; t < T; t += 0.05) actor.update(Math.min(0.05, T - t));
      actor.update(c.lookAt ? 1.2 : 0.3);
      if (c.blink) { actor.setBlink(1); actor.update(0.016); }
      frameCamera(actor, c.view || 'three', c.frame || qs.get('frame'), r.width / r.height, anim);
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
    if (i % 4 === 3) await new Promise(r2 => setTimeout(r2, 0));
  }
  report.ready = true;
}

function buttons(host, items, get, set) {
  const el = $(host); el.innerHTML = '';
  for (const [v, text] of items) {
    const b = document.createElement('button'); b.textContent = text; b.dataset.v = v; if (get() === v) b.className = 'on';
    b.onclick = () => { set(v); for (const x of el.children) x.classList.toggle('on', x.dataset.v === get()); report.ready = false; draw(); };
    el.appendChild(b);
  }
}
buttons('#c-mode', MODES.map(m => [m, m]), () => state.mode, v => { state.mode = v; });
buttons('#c-body', [['both', 'Both'], ['male', 'Male'], ['female', 'Female']], () => state.body, v => { state.body = v; });
buttons('#c-hair', [['short,long,ponytail', 'short / long / ponytail'], ['spiky,afro,high_ponytail', 'spiky / afro / high ponytail'], ['bald,braids,bun', 'bald / braids / bun'], ['locs,mohawk,twin_tails', 'locs / mohawk / twin tails']], () => state.hairs.join(','), v => { state.hairs = v.split(','); });
buttons('#c-view', [['front,three', 'Front + 3/4'], ['three', '3/4'], ['front', 'Front'], ['side', 'Side'], ['back', 'Back']], () => state.views.join(','), v => { state.views = v.split(','); });
draw().catch(e => { report.error = String(e.stack || e); });
