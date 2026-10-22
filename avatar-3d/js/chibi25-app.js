// Chibi 2.5 builder page (avatar-3d/chibi25.html): one look built twice — Chibi 2 on the left, Chibi 2.5 on the right —
// with every 2.5 face/hair option, a blink / look-at demo and the live cost of each. Part B mounts its body options in
// <section id="c25-body"> from js/chibi25-body-ui.js if that module exists (CHIBI2.md "Chibi 2.5 contracts").
import * as THREE from 'three';
import { createScene } from './scene.js';
import { createChibi2Character, CHIBI2_ANIMS } from './chibi2.js';
import { CHIBI2_EMOTE_ANIMS } from './chibi2-motion.js';
import { normalizeAvatar } from '../../avatar-2d/js/render.js';
import { PARTS } from '../../avatar-2d/js/parts/index.js';
import { CHIBI25_OPTIONS, asV25 } from './chibi25-options.js';
import { CHIBI2_RACES } from './chibi2-races.js';
import { installTooltips } from '../../shared/tooltip.js';
import { loadClassRoster } from './class-outfits.js';

const $ = id => document.getElementById(id);
const presets = (await (await fetch('./data/chibi2-presets.json')).json()).presets;
// every class in every game (all 32, incl. Thousandvale's Starcaller and Star Blade); the page still works without them
const classLooks = await loadClassRoster();
const starts = [...presets.map(p => ({ name: p.name, avatar: p.avatar })), ...classLooks.map(c => ({ name: 'Class: ' + c.name, avatar: c.avatar }))];
const q = new URLSearchParams(location.search);
let look = normalizeAvatar(starts[0].avatar);
look.held = { id: 'none' }; look.offhand = { id: 'none' };
if (q.get('look')) try { look = normalizeAvatar(JSON.parse(q.get('look'))); } catch { /* ignore a bad link */ }

const scene = createScene($('stage'), { background: 0xdde4e0, ground: false, shadows: false });
scene.renderer.toneMapping = THREE.ACESFilmicToneMapping; scene.renderer.toneMappingExposure = 1.1;
const state = { anim: 'idle', heads: true, lookMouse: false, lookEach: false, headK: 0.35, hold: null };
let actors = [], building = false, pending = false;
const mouse = new THREE.Vector3(0, 1.4, 3), ray = new THREE.Raycaster(), ndc = new THREE.Vector2();

function frame() {
  const h = actors[1]?.ctrl.metrics().height || 1.6;
  if (state.heads) { scene.controls.target.set(0, h * 0.82, 0); scene.camera.position.set(0, h * 0.86, 3.3); }
  else { scene.controls.target.set(0, h * 0.5, 0); scene.camera.position.set(0, h * 0.7, 4.6); }
  scene.controls.update();
}
function stats() {
  for (const [i, id] of [[0, 'stats-v2'], [1, 'stats-v25']]) {
    const s = actors[i]?.ctrl.stats(); if (s) $(id).textContent = `${s.triangles.toLocaleString()} tris · ${s.meshes} meshes · ${s.bones} bones`;
  }
  $('stats-calls').textContent = `${scene.renderer.info.render.calls} draw calls`;
}
async function rebuild() {
  if (building) { pending = true; return; }
  building = true; $('state').textContent = 'Building';
  try {
    const looks = [structuredClone(look), asV25(structuredClone(look))];
    if (looks[0].body) delete looks[0].body.v;
    if (!actors.length) {
      for (const [i, a] of looks.entries()) {
        const ctrl = await createChibi2Character(a, { anims: [...CHIBI2_ANIMS, ...CHIBI2_EMOTE_ANIMS] });
        ctrl.group.position.x = i ? 0.55 : -0.55; scene.scene.add(ctrl.group); actors.push({ ctrl });
      }
      frame();
    } else for (const [i, a] of looks.entries()) await actors[i].ctrl.setAvatar(a);
    for (const a of actors) a.ctrl.setAnim(state.anim, 0);
    actors[1].ctrl.setBlink(state.hold);
    $('state').textContent = 'Ready';
  } catch (e) { $('state').textContent = e.message; console.error(e); }
  building = false;
  if (pending) { pending = false; rebuild(); }
}

// ---------------------------------------------------------------- the face/hair controls, drawn from CHIBI25_OPTIONS
const LABEL = { hair: 'Hair', eyes: 'Eyes', brows: 'Brows', nose: 'Nose', mouth: 'Mouth', ears: 'Ears', facialHair: 'Facial hair', extras: 'Face mark' };
const ui = $('face-ui');
const field = (label, input, out = document.createElement('span')) => { const l = document.createElement('label'); l.className = 'field'; l.append(label, input, out); ui.append(l); return input; };
const select = (opts, value, onChange) => { const s = document.createElement('select'); for (const [v, t] of opts) s.add(new Option(t, v)); s.value = value; s.addEventListener('change', () => onChange(s.value)); return s; };
const colour = (value, onChange) => { const c = document.createElement('input'); c.type = 'color'; c.value = value || '#000000'; c.addEventListener('change', () => onChange(c.value)); return c; };
const range = (min, max, step, value, onChange) => { const r = document.createElement('input'); r.type = 'range'; Object.assign(r, { min, max, step, value }); const o = document.createElement('output'); o.textContent = (+value).toFixed(2); r.addEventListener('input', () => { o.textContent = (+r.value).toFixed(2); onChange(+r.value); }); return [r, o]; };
const name = (slot, id) => (CHIBI25_OPTIONS.face[slot].names[id] || PARTS[slot]?.[id]?.name || id) + (CHIBI25_OPTIONS.face[slot].added.includes(id) ? '  (new)' : '');
const controls = {};
function drawControls() {
  ui.replaceChildren(Object.assign(document.createElement('h2'), { textContent: 'Face and hair' }));
  const set = (slot, key) => v => { look[slot] = { ...(look[slot] || {}), [key]: v }; rebuild(); };
  for (const slot of Object.keys(LABEL)) {
    const o = CHIBI25_OPTIONS.face[slot];
    const ids = slot === 'ears' ? [...new Set([...(CHIBI25_OPTIONS.raceEars[look.body?.race || 'human'] || []), ...o.ids])] : o.ids;
    controls[slot] = field(LABEL[slot], select(ids.map(id => [id, name(slot, id)]), look[slot]?.id, set(slot, 'id')));
  }
  field('Skin', colour(look.body.skin, v => { look.body.skin = v; rebuild(); }));
  field('Hair colour', colour(look.hair.color, set('hair', 'color')));
  field('Hair tips', colour(look.hair.color2 || '#d9c27a', set('hair', 'color2')));
  field('Brow colour', colour(look.brows.color || '#3a2a20', set('brows', 'color')));
  field('Beard colour', colour(look.facialHair.color || look.hair.color, set('facialHair', 'color')));
  field('Eye colour', colour(look.eyes.color, set('eyes', 'color')));
  field('Right eye', colour(look.eyes.colorR || look.eyes.color, set('eyes', 'colorR')));
  field('Eye white', colour(look.eyes.white || '#fff8e8', set('eyes', 'white')));
  const F = CHIBI25_OPTIONS.fields.eyes;
  field('Pupil', select([['', 'Eye default'], ...F.pupil.ids.map(id => [id, F.pupil.names[id]])], look.eyes.pupil || '', v => set('eyes', 'pupil')(v || undefined)));
  field('Iris', select([['', 'Eye default'], ...F.iris.ids.map(id => [id, F.iris.names[id]])], look.eyes.iris || '', v => set('eyes', 'iris')(v || undefined)));
  field('Mouth colour', colour(look.mouth.color || '#b5484d', set('mouth', 'color')));
  field('Mark colour', colour(look.extras.color || '#8a2e2e', set('extras', 'color')));
  for (const [label, slot, key, min, max, step, def] of [['Eye size', 'eyes', 'scale', 0.6, 1.5, 0.05, 1], ['Eye spacing', 'eyes', 'x', -1, 1, 0.05, 0], ['Eye height', 'eyes', 'y', -1, 1, 0.05, 0], ['Eye tilt', 'eyes', 'rot', -15, 15, 1, 0], ['Brow height', 'brows', 'y', -1, 1, 0.05, 0], ['Brow weight', 'brows', 'thick', 0.5, 1.8, 0.05, 1], ['Ear size', 'ears', 'scale', 0.6, 1.6, 0.05, 1], ['Nose size', 'nose', 'scale', 0.6, 1.6, 0.05, 1], ['Mouth width', 'mouth', 'scale', 0.6, 1.6, 0.05, 1]]) {
    const [r, o] = range(min, max, step, look[slot]?.[key] ?? def, v => { look[slot] = { ...look[slot], [key]: v }; rebuild(); });
    field(label, r, o);
  }
  const hats = Object.keys(PARTS.hat);
  field('Headwear', select(hats.map(id => [id, PARTS.hat[id].name || id]), look.hat?.id || 'none', v => { look.hat = { ...(look.hat || {}), id: v }; rebuild(); }));
  field('Cheeks', select([['0', 'None'], ['1', 'Rosy']], look.body.cheeks ? '1' : '0', v => { look.body.cheeks = v === '1'; rebuild(); }));
}

// ---------------------------------------------------------------- look / race / buttons
for (const [i, s] of starts.entries()) $('preset').add(new Option(s.name, i));
$('preset').addEventListener('change', () => { look = normalizeAvatar(starts[+$('preset').value].avatar); look.held = { id: 'none' }; look.offhand = { id: 'none' }; $('race').value = look.body.race || 'human'; drawControls(); rebuild(); });
for (const [id, r] of Object.entries(CHIBI2_RACES)) $('race').add(new Option(r.name, id));
$('race').value = look.body.race || 'human';
$('race').addEventListener('change', () => { look.body.race = $('race').value; const ears = CHIBI25_OPTIONS.raceEars[look.body.race]; if (ears) look.ears = { ...look.ears, id: ears[0] }; drawControls(); rebuild(); });
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
$('random').addEventListener('click', () => {
  for (const slot of Object.keys(LABEL)) look[slot] = { ...(look[slot] || {}), id: pick(CHIBI25_OPTIONS.face[slot].ids) };
  if (Math.random() < 0.5) look.facialHair.id = 'none'; if (Math.random() < 0.5) look.extras.id = 'none';
  look.ears.id = pick(CHIBI25_OPTIONS.raceEars[look.body.race || 'human'] || ['normal']);
  look.hair.color = pick(['#111111', '#3b2a1a', '#6b4a2a', '#a86a3a', '#d9c27a', '#8a1a1a', '#eeeeee', '#4a3a8a']);
  look.eyes.color = pick(['#3f7f86', '#4a6b8a', '#6a4a2a', '#3a7a3a', '#8a5aa8', '#c89030']);
  drawControls(); rebuild();
});
$('export').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(asV25(look), null, 2)], { type: 'application/json' })); a.download = 'chibi25-look.json'; a.click(); });
$('frame').addEventListener('click', () => { state.heads = !state.heads; $('frame').setAttribute('aria-pressed', state.heads); $('frame').textContent = state.heads ? 'Heads' : 'Full body'; frame(); });
$('blink').addEventListener('click', () => { for (const a of actors) a.ctrl.blink(); });
$('look-mouse').addEventListener('click', () => { state.lookMouse = !state.lookMouse; state.lookEach = false; syncLook(); });
$('look-each').addEventListener('click', () => { state.lookEach = !state.lookEach; state.lookMouse = false; syncLook(); });
const [hk, hkv] = [$('headk'), $('headk-v')];
hk.addEventListener('input', () => { state.headK = +hk.value; hkv.textContent = state.headK.toFixed(2); syncLook(); });
$('hold').addEventListener('input', () => { const v = +$('hold').value; state.hold = v < 0 ? null : v; $('hold-v').textContent = state.hold == null ? 'auto' : state.hold.toFixed(2); for (const a of actors) a.ctrl.setBlink(state.hold); });
for (const n of [...CHIBI2_ANIMS, ...CHIBI2_EMOTE_ANIMS]) $('anim').add(new Option(n, n));
$('anim').addEventListener('change', () => { state.anim = $('anim').value; for (const a of actors) a.ctrl.setAnim(state.anim); });
function syncLook() {
  $('look-mouse').setAttribute('aria-pressed', state.lookMouse); $('look-each').setAttribute('aria-pressed', state.lookEach);
  if (!state.lookMouse && !state.lookEach) for (const a of actors) a.ctrl.lookAt(null);
}
$('stage').addEventListener('pointermove', e => {
  const r = scene.renderer.domElement.getBoundingClientRect();
  ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, scene.camera);
  // the point on a plane through the characters, facing the camera
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(scene.camera.getWorldDirection(new THREE.Vector3()).negate(), new THREE.Vector3(0, 0, 0.6));
  ray.ray.intersectPlane(plane, mouse);
});
const headPos = (a) => { const p = new THREE.Vector3(); a.ctrl.parts.head.getWorldPosition(p); p.y += 0.28; return p; };
scene.addTicker(dt => {
  for (const [i, a] of actors.entries()) {
    if (state.lookMouse) a.ctrl.lookAt(mouse, { head: state.headK });
    else if (state.lookEach) a.ctrl.lookAt(headPos(actors[1 - i]), { head: state.headK });
    a.ctrl.update(dt);
  }
  stats();
});

drawControls();
await rebuild();
// part B's body options, if they exist yet
try {
  const mod = await import('./chibi25-body-ui.js');
  $('body-note')?.remove();
  mod.mountBodyUi?.($('c25-body'), { get: () => look, set: next => { look = next; drawControls(); rebuild(); } });
} catch { /* not built yet */ }
installTooltips();
window.chibi25 = { ready: true, state, get actors() { return actors.map(a => a.ctrl); }, get look() { return look; }, set look(v) { look = normalizeAvatar(v); drawControls(); rebuild(); }, rebuild, scene };
