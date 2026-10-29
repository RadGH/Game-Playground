// Kestrel kit — the clothes review sheet (clothes.html, batch 4). One renderer draws every cell of the grid in turn
// (scissor), building each character through the game's look path (from-chibi.js), posing it and disposing it again.
import * as THREE from 'three';
import { createKestrelCharacter } from './kestrel.js';
import { kestrelLookFromChibi } from './from-chibi.js';
import { CLOTHES_IDS } from './clothes-catalog.js';
import { dressAs } from '../../../js/class-outfits.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const SLOTS = ['top', 'bottom', 'shoes', 'gloves', 'wardrobe', 'wardrobe2', 'clips'];
const state = { slot: SLOTS.includes(qs.get('slot')) ? qs.get('slot') : 'top', body: qs.get('body') || 'both', view: qs.get('view') || 'three', anim: qs.get('anim') || 'idle', t: +(qs.get('t') || 0.3) };
if (qs.get('cols')) document.documentElement.style.setProperty('--cols', qs.get('cols'));
if (qs.get('shot') === '1') document.body.classList.add('shot');
const report = window.__clothes = { ready: false, cells: [] };

const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
renderer.autoClear = false;
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.5));
const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); scene.add(key);
const rim = new THREE.DirectionalLight('#dfe8ff', 0.9); rim.position.set(-3, 3, -2); scene.add(rim);
const cam = new THREE.PerspectiveCamera(24, 0.8, 0.05, 50);
const bg = new THREE.Color('#c9ccd1');

const BASE = {
  male: { body: { height: 0.5, width: 0.5, skin: '#d9a47c', race: 'human', form: 'masc' }, headShape: 'oval', hair: { id: 'short', color: '#4a2e1c' }, eyes: { id: 'almond', color: '#3a5a7a' }, facialHair: { id: 'stubble' }, brows: { id: 'straight' } },
  female: { body: { height: 0.5, width: 0.5, skin: '#e0ae88', race: 'human', form: 'fem' }, headShape: 'heart', hair: { id: 'high_ponytail', color: '#5a3420' }, eyes: { id: 'almond', color: '#5a7a3a' }, facialHair: { id: 'none' }, brows: { id: 'arched' } },
};
const PALETTE = ['#5a4a8a', '#8a3a3a', '#3a6a5a', '#6a5a3a', '#3a4a7a', '#7a6a4a', '#4a4a4a', '#8a6a2a'];
const plain = { top: { id: 'tshirt', color: '#7d8aa0' }, bottom: { id: 'pants', color: '#4a4038' }, shoes: { id: 'boots', color: '#5a3a24' }, hat: { id: 'none' }, cape: { id: 'none' }, held: { id: 'none' }, offhand: { id: 'none' }, decor: { id: 'none' } };
const withRace = (L) => { const r = qs.get('race'); return r ? { ...L, body: { ...L.body, race: r } } : L; };

let outfits = null, outfits2 = null;
async function loadOutfits() {
  if (!outfits) outfits = (await (await fetch('../../data/class-outfits.json')).json()).classes;
  if (!outfits2) outfits2 = (await (await fetch('../../data/class-outfits-t2.json')).json()).classes;
}

async function cellsFor(slot, body) {
  const out = [], bodies = body === 'both' ? ['male', 'female'] : [body];
  const only = qs.get('ids') ? qs.get('ids').split(',') : null;
  const views = qs.get('views') ? qs.get('views').split(',') : [null];
  if (slot === 'wardrobe' || slot === 'wardrobe2') {
    await loadOutfits();
    const T = slot === 'wardrobe' ? outfits : outfits2;
    for (const cls of Object.keys(T).filter(c => !only || only.includes(c))) for (const b of bodies) for (const v of views) {
      const o = { ...T[cls] }; if (qs.get('bare') === '1') { o.held = { id: 'none' }; o.offhand = { id: 'none' }; }
      out.push({ label: cls + (v ? ' ' + v : ''), chibi: dressAs(withRace(BASE[b]), o), sub: b, view: v, frame: 'body' });
    }
    return out;
  }
  if (slot === 'clips') {
    const ids = only || ['robe', 'trim_robe', 'gown', 'coat', 'trench', 'surcoat', 'dress', 'kilt', 'long_skirt', 'loincloth', 'plate', 'tunic'];
    const clips = (qs.get('clips') || 'walk:0.3,run:0.2,sitGround:1.2,ride:0.5,attack:0.35,jump:0.45').split(',').map(x => x.split(':'));
    for (const b of bodies) for (const id of ids) for (const [a, t] of clips) {
      const isBottom = CLOTHES_IDS.bottom.includes(id);
      out.push({ label: `${id} ${a}`, chibi: { ...withRace(BASE[b]), ...plain, ...(isBottom ? { bottom: { id, color: '#4a3a6a' }, top: { id: 'tunic', color: '#6a7a4a' } } : { top: { id, color: '#4a3a6a', color2: '#c8a040' } }) }, anim: a, t: +t, sub: b, frame: 'body', view: qs.get('view') || 'side' });
    }
    return out;
  }
  const ids = CLOTHES_IDS[slot].filter(id => !only || only.includes(id));
  for (const b of bodies) for (const [i, id] of ids.entries()) for (const v of views) {
    const c = PALETTE[i % PALETTE.length];
    const L = { ...withRace(BASE[b]), ...plain };
    if (slot === 'top') L.top = { id, color: c, color2: '#c8a040' };
    if (slot === 'bottom') { L.bottom = { id, color: c, color2: '#d8c8a0' }; L.top = { id: 'tshirt', color: '#7d8aa0' }; }
    if (slot === 'shoes') { L.shoes = { id, color: c, color2: '#c8a040' }; L.bottom = { id: 'shorts', color: '#4a4038' }; }
    if (slot === 'gloves') L.top = { id: 'tunic', color: '#6a6a7a', gloves: { id, color: c, color2: '#c8a040' } };
    out.push({ label: id + (v ? ' ' + v : ''), chibi: L, sub: b, view: v, frame: qs.get('frame') || (slot === 'shoes' ? 'legs' : slot === 'gloves' ? 'hands' : 'body') });
  }
  return out;
}

function frameCamera(actor, view, frame, aspect) {
  const a = { front: 0, three: 0.7, side: Math.PI / 2, back: Math.PI, left: -Math.PI / 2, threeBack: 2.4 }[view] ?? 0.7;
  const h = actor.metrics().height;
  cam.aspect = aspect;
  let c, d;
  if (frame === 'legs') { c = new THREE.Vector3(0, h * 0.2, 0); d = h * 1.05; }
  else if (frame === 'hands') { const p = new THREE.Vector3(); actor.parts.handR.getWorldPosition(p); c = new THREE.Vector3(p.x * 0.6, p.y, 0); d = h * 0.75; }
  else if (frame === 'bust') { c = new THREE.Vector3(0, h * 0.74, 0); d = h * 1.0; }
  else { c = new THREE.Vector3(0, h * 0.5, 0); d = h * 2.35; }
  cam.fov = 30; cam.position.set(Math.sin(a) * d, c.y + h * 0.06, Math.cos(a) * d); cam.lookAt(c);
  cam.updateProjectionMatrix();
}

let run = 0;
async function draw() {
  const me = ++run;
  const cells = await cellsFor(state.slot, state.body);
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
      const anim = c.anim || state.anim;
      actor = await createKestrelCharacter(kestrelLookFromChibi(c.chibi), { lod: qs.get('lod') === '1' ? 1 : 0, anims: ['idle', anim] });
      scene.add(actor.group);
      actor.setAnim(anim, 0, true);
      actor.update(0.001);
      if (anim !== 'idle') { actor.freeze(c.t ?? state.t); actor.update(0.001); }
      frameCamera(actor, c.view || state.view, c.frame, r.width / r.height);
      renderer.setViewport(x, y, r.width, r.height); renderer.setScissor(x, y, r.width, r.height);
      renderer.setClearColor(bg); renderer.clear();
      renderer.render(scene, cam);
      const s = actor.stats();
      els[i].querySelector('i').textContent = s.triangles.toLocaleString() + ' · ' + s.bones;
      report.cells.push({ label: c.label, sub: c.sub, triangles: s.triangles, bones: s.bones, ms: s.buildMs });
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
buttons('#c-slot', [['top', 'Tops'], ['bottom', 'Bottoms'], ['shoes', 'Shoes'], ['gloves', 'Gloves'], ['wardrobe', 'Class wardrobe (tier 1)'], ['wardrobe2', 'Class wardrobe (tier 2)'], ['clips', 'Long garments in clips']], 'slot');
buttons('#c-body', [['both', 'Both'], ['male', 'Male'], ['female', 'Female']], 'body');
buttons('#c-view', [['front', 'Front'], ['three', '3/4'], ['side', 'Side'], ['back', 'Back']], 'view');
buttons('#c-anim', ['idle', 'walk', 'run', 'attack', 'cast', 'sitGround', 'ride', 'dead'].map(a => [a, a]), 'anim');
draw().catch(e => { report.error = String(e.stack || e); });
