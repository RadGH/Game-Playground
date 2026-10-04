// Creatures 3D demo: pick a type, tweak size/colours, play animations, export the creature JSON.
import { el, button, panel, select, knob, checkbox, downloadJSON, readJSONFile, toast } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { createScene } from './scene.js';
import { createCreature, randomCreature, normalizeCreature, CREATURE_TYPES, CREATURE_ANIMS } from './creatures.js';

const store = makeStore('creatures-3d', 1);
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
let spec = normalizeCreature(store.get('current', { type: 'wolf' })); let character = null; let building = false;

const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }));
const animChips = el('div', { class: 'chips anim-chips' });
const typeChips = el('div', { class: 'chips' });
const info = el('span', { class: 'small muted' });
main.append(el('div', { class: 'panel' }, typeChips, viewport, el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips), el('div', { class: 'row' }, checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0)), button('🎲 Random colours', () => { spec = randomCreature(spec.type); changed(); syncUI(); }, 'primary'), button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: spec.type + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'), info)));
const scene = createScene(viewport); scene.camera.position.set(2.6, 1.6, 3.4); scene.controls.target.set(0, 0.6, 0);
// 2026-10-03: nothing ticked the creature, so every animation chip on this page showed a statue.
scene.addTicker((dt, t) => character?.update(dt, t));
// the designed looks in data/creature-variants.json (incl. Bannerline's bl_* units), one click each
const variants = await fetch(new URL('../data/creature-variants.json', import.meta.url)).then(r => r.json()).then(j => j.variants || {}).catch(() => ({}));

function renderTypes() { typeChips.replaceChildren(...Object.entries(CREATURE_TYPES).map(([id, T]) => el('span', { class: 'chip' + (spec.type === id ? ' on' : ''), text: T.label, onclick: () => { spec = normalizeCreature({ ...spec, type: id, colors: undefined, features: undefined }); changed(); syncUI(); } }))); }
function renderAnims() { animChips.replaceChildren(...CREATURE_ANIMS.map(a => el('span', { class: 'chip' + (character?.anim === a ? ' on' : ''), text: a, onclick: () => { character?.setAnim(a); renderAnims(); } }))); }
async function rebuild() {
  if (building) return; building = true; setStatus('building ' + spec.type + '…');
  try { if (character) { scene.scene.remove(character.group); character.dispose(); } character = await createCreature(spec); scene.scene.add(character.group); renderAnims(); const m = character.metrics(); info.textContent = `≈ ${m.height.toFixed(2)} m tall · ${m.length.toFixed(2)} m long`; setStatus('Creature: ' + CREATURE_TYPES[spec.type].label + ' (' + CREATURE_TYPES[spec.type].plan + ' plan)'); }
  catch (e) { console.error(e); setStatus('error: ' + e.message); }
  building = false;
}
function changed() { store.set('current', spec); rebuild(); renderTypes(); renderJson(); }

// left: knobs
const left = document.getElementById('left');
const sizeKnob = knob('size', { min: 0.3, max: 3, step: 0.05, value: spec.size }, v => { spec.size = v; changed(); });
const colorRow = (key) => { const inp = el('input', { type: 'color', value: spec.colors[key] }); inp.oninput = () => { spec.colors[key] = inp.value; changed(); }; inp.dataset.key = key; return el('div', { class: 'row' }, el('label', { text: key }), inp); };
const colors = el('div');
const featureBox = el('div');
left.append(panel('Creature', sizeKnob, colors), panel('Features', el('p', { class: 'small muted', text: 'Toggle parts on any body plan (wings on a wolf, horns on a boar…).' }), featureBox));
function syncUI() {
  colors.replaceChildren(...Object.keys(spec.colors).map(colorRow)); sizeKnob.querySelector('input').value = spec.size;
  const feats = ['fangs', 'tusks', 'horns', 'antlers', 'wings', 'spikes', 'mane', 'whiskers', 'claws', 'hooves', 'tail', 'core', 'glow', 'bulgeEyes', 'beak', 'antennae', 'maw', 'plates', 'trunk', 'howdah', 'feathers', 'spine', 'ribs'];
  featureBox.replaceChildren(...feats.map(f => checkbox(f, !!spec.features[f], v => { spec.features[f] = v; changed(); })));
}

// right: JSON + gallery
const right = document.getElementById('right');
const jsonArea = el('textarea', { rows: 12, spellcheck: 'false' });
function renderJson() { jsonArea.value = JSON.stringify(spec, null, 2); }
right.append(panel('Creature JSON', el('p', { class: 'small muted', html: 'Put this under <code>creature</code> in a character document. A 3D scene that sees <code>creature</code> builds it with <code>createCreature()</code> instead of the humanoid body.' }), jsonArea, el('div', { class: 'row' }, button('Apply', () => { try { spec = normalizeCreature(JSON.parse(jsonArea.value)); changed(); syncUI(); } catch (e) { toast(e.message); } }, 'small'), button('Export JSON', () => downloadJSON(spec, spec.type + '-creature.json'), 'small'), button('Import', async () => { try { const j = await readJSONFile(); spec = normalizeCreature(j.creature || j); changed(); syncUI(); } catch (e) { toast(e.message); } }, 'small'))),
  panel('Every type', el('p', { class: 'small muted', text: 'Click to load. Sizes: rat 0.3 m, wolf 0.9 m, dragon 2.5 m before the size multiplier.' }), el('div', { class: 'chips' }, ...Object.entries(CREATURE_TYPES).map(([id, T]) => el('span', { class: 'chip', text: `${T.label} · ${T.plan}`, onclick: () => { spec = normalizeCreature({ type: id }); changed(); syncUI(); } })))));

right.append(panel('Designed looks', el('p', { class: 'small muted', html: 'Ready-made creatures from <code>data/creature-variants.json</code>. The <code>bl_</code> ones are Bannerline\'s send units (also in the library as <code>bl_&lt;id&gt;</code>).' }),
  el('div', { class: 'chips', id: 'variant-chips' }, ...Object.values(variants).map(v => el('span', { class: 'chip', text: v.name, title: v.desc || '', 'data-variant': v.id, onclick: () => { spec = normalizeCreature(v.creature); changed(); syncUI(); } })))));
renderTypes(); syncUI(); renderJson(); await rebuild();
window.creatures3d = { get spec() { return spec; }, get character() { return character; }, set: s => { spec = normalizeCreature(s); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building, types: Object.keys(CREATURE_TYPES), variants };
