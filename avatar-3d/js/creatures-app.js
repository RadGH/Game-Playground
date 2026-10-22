// Creatures 3D demo: pick a type, tweak size/colours, play animations, export the creature JSON.
import { el, button, panel, select, knob, checkbox, downloadJSON, readJSONFile, toast } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { createScene } from './scene.js';
import { createCreature, randomCreature, normalizeCreature, CREATURE_TYPES, CREATURE_ANIMS } from './creatures.js';
import { loadTvMonsters, buildTvMonster, tvCreatureSpec } from './tv-monsters-gallery.js';   // Thousandvale's own monster looks, read live from its data

const store = makeStore('creatures-3d', 1);
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
let spec = normalizeCreature(store.get('current', { type: 'wolf' })); let character = null; let building = false;
// a Thousandvale monster picked from its panel: built exactly as the game builds it (tv-monsters-gallery.js); any knob clears it
let tvPick = null, again = false;

const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }));
const animChips = el('div', { class: 'chips anim-chips' });
const typeChips = el('div', { class: 'chips' });
const info = el('span', { class: 'small muted' });
main.append(el('div', { class: 'panel' }, typeChips, viewport, el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips), el('div', { class: 'row' }, checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0)), button('🎲 Random colours', () => { spec = randomCreature(spec.type); changed(); syncUI(); }, 'primary'), button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: spec.type + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'), info)));
const scene = createScene(viewport); scene.camera.position.set(2.6, 1.6, 3.4); scene.controls.target.set(0, 0.6, 0); scene.controls.maxDistance = 30;
// 2026-10-03: nothing ticked the creature, so every animation chip on this page showed a statue.
scene.addTicker((dt, t) => character?.update(dt, t));
// the designed looks in data/creature-variants.json (incl. Bannerline's bl_* units), one click each
const variants = await fetch(new URL('../data/creature-variants.json', import.meta.url)).then(r => r.json()).then(j => j.variants || {}).catch(() => ({}));
const tvMonsters = await loadTvMonsters().catch(() => []);

function renderTypes() { typeChips.replaceChildren(...Object.entries(CREATURE_TYPES).map(([id, T]) => el('span', { class: 'chip' + (spec.type === id ? ' on' : ''), text: T.label, onclick: () => { spec = normalizeCreature({ ...spec, type: id, colors: undefined, features: undefined }); changed(); syncUI(); } }))); }
function renderAnims() { animChips.replaceChildren(...(character?.anims || CREATURE_ANIMS).map(a => el('span', { class: 'chip' + (character?.anim === a ? ' on' : ''), text: a, onclick: () => { character?.setAnim(a); renderAnims(); } }))); }
async function rebuild() {
  if (building) { again = true; return; } building = true; again = false; setStatus('building ' + (tvPick?.name || spec.type) + '…');
  try {
    if (character) { scene.scene.remove(character.group); character.dispose(); }
    const pick = tvPick;
    if (pick) {
      character = await buildTvMonster(pick); character.group.position.y = character.liftY || 0; character.setAnim(character.idleAnim || 'idle');
      scene.scene.add(character.group); renderAnims(); const m = character.metrics();
      info.textContent = `≈ ${(m.height * (character.group.scale.y || 1)).toFixed(2)} m tall` + (m.length ? ` · ${m.length.toFixed(2)} m long` : '') + (pick.boss ? ' · drawn 1.45× as a boss' : '');
      setStatus(`Thousandvale: ${pick.name} (${pick.kind === 'humanoid' ? 'Chibi 2.5 humanoid' : CREATURE_TYPES[pick.look.creature.type]?.label || pick.look.creature.type} · ${pick.source})`);
      fitCamera(character.group);
    } else {
      character = await createCreature(spec); scene.scene.add(character.group); renderAnims(); const m = character.metrics(); info.textContent = `≈ ${m.height.toFixed(2)} m tall · ${m.length.toFixed(2)} m long`; setStatus('Creature: ' + CREATURE_TYPES[spec.type].label + ' (' + CREATURE_TYPES[spec.type].plan + ' plan)');
    }
  }
  catch (e) { console.error(e); setStatus('error: ' + e.message); }
  building = false;
  if (again) rebuild();          // a pick made while the last body was still building
}
function changed(keepTv = false) { if (!keepTv) tvPick = null; store.set('current', spec); rebuild(); renderTypes(); renderJson(); renderTvChips(); }
/**
 * Frame a Thousandvale body (a 3.2x toad, a 16 m wyrm and a person are very different sizes) by what is actually drawn:
 * geometry boxes in bind pose, as Thousandvale's actors.js measures a body (a skinned mesh's own box reads stale bones).
 */
function fitCamera(root) {
  const T = scene.THREE, box = new T.Box3(), tmp = new T.Box3();
  root.updateMatrixWorld(true);
  root.traverse(o => { if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return; const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox(); tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld); box.union(tmp); });
  if (box.isEmpty()) return;
  const c = box.getCenter(new T.Vector3()), sz = box.getSize(new T.Vector3());
  const r = Math.max(0.6, sz.length() / 2), fov = scene.camera.fov * Math.PI / 180;
  const dist = Math.min(28, r / Math.tan(fov / 2) / Math.min(1, scene.camera.aspect || 1) * 1.05);
  const dir = new T.Vector3(0.6, 0.35, 0.78).normalize();
  scene.controls.target.copy(c); scene.camera.position.set(c.x + dir.x * dist, c.y + dir.y * dist, c.z + dir.z * dist); scene.controls.update();
}
function pickTv(entry) {
  tvPick = entry;
  if (entry.kind === 'creature') spec = tvCreatureSpec(entry);          // the JSON panel and knobs show the game's spec
  changed(true); syncUI();
}

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
// Thousandvale monsters: read live from prototypes/thousandvale/data (monster-looks.json + rules/monsters-tv.json)
const tvChips = el('div', { id: 'tv-monster-chips' });
function renderTvChips() {
  const chip = e => el('span', { class: 'chip' + (tvPick?.id === e.id ? ' on' : ''), text: e.name + (e.boss ? ' ★' : ''), title: [e.desc, e.levels ? `levels ${e.levels[0]}-${e.levels[1]}` : '', e.source].filter(Boolean).join(' · '), 'data-tv': e.id, onclick: () => pickTv(e) });
  const beasts = tvMonsters.filter(e => e.kind === 'creature'), people = tvMonsters.filter(e => e.kind === 'humanoid');
  tvChips.replaceChildren(
    ...(tvMonsters.length ? [] : [el('p', { class: 'small muted', text: 'Thousandvale\'s data files were not found, so nothing to show.' })]),
    ...(beasts.length ? [el('div', { class: 'small muted', text: `Creatures (${beasts.length})` }), el('div', { class: 'chips' }, ...beasts.map(chip))] : []),
    ...(people.length ? [el('div', { class: 'small muted', text: `Humanoids (${people.length}) — Chibi 2.5 bodies, as the game draws them` }), el('div', { class: 'chips' }, ...people.map(chip))] : []));
}
right.append(panel('Thousandvale monsters', el('p', { class: 'small muted', html: 'Read live from Thousandvale\'s own files (<code>prototypes/thousandvale/data/monster-looks.json</code> and <code>data/rules/monsters-tv.json</code>) and built the way the game builds them: creature detail 0.8 (a boss 1.0 and 1.45× bigger), merged meshes, people as Chibi 2.5. ★ = boss. Hover a chip for its description.' }), tvChips));
renderTvChips();

renderTypes(); syncUI(); renderJson(); await rebuild();
window.creatures3d = { get spec() { return spec; }, get character() { return character; }, set: s => { spec = normalizeCreature(s); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building || again, types: Object.keys(CREATURE_TYPES), variants, tvMonsters, pickTv: id => { const e = tvMonsters.find(m => m.id === id); if (e) pickTv(e); return !!e; }, get tvPick() { return tvPick; } };
