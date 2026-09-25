// Vehicles 3D demo: pick a type, recolour it, play the animations, export the vehicle JSON.
import { el, button, panel, knob, checkbox, downloadJSON, readJSONFile, toast } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { createScene } from './scene.js';
import { createVehicle, normalizeVehicle, VEHICLE_TYPES, VEHICLE_ANIMS, VEHICLE_MODEL_FOR } from './vehicles.js';

const store = makeStore('vehicles-3d', 1);
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
let spec = normalizeVehicle(store.get('current', { type: 'wagon' })); let vehicle = null; let building = false;

const main = document.getElementById('main');
const viewport = el('div', { id: 'viewport' }); viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }));
const animChips = el('div', { class: 'chips anim-chips' });
const typeChips = el('div', { class: 'chips' });
const info = el('span', { class: 'small muted' });
main.append(el('div', { class: 'panel' }, typeChips, viewport,
  el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips),
  el('div', { class: 'row' },
    checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0)),
    button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: spec.type + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'),
    info)));
const scene = createScene(viewport); scene.camera.position.set(3.4, 1.9, 4.2); scene.controls.target.set(0, 0.7, 0);
scene.addTicker((dt, t) => vehicle?.update(dt, t));   // one ticker for the life of the page; it follows whichever vehicle is current

function renderTypes() { typeChips.replaceChildren(...Object.entries(VEHICLE_TYPES).map(([id, T]) => el('span', { class: 'chip' + (spec.type === id ? ' on' : ''), text: T.label, onclick: () => { spec = normalizeVehicle({ type: id }); changed(); syncUI(); } }))); }
function renderAnims() { animChips.replaceChildren(...VEHICLE_ANIMS.map(a => el('span', { class: 'chip' + (vehicle?.anim === a ? ' on' : ''), text: a, onclick: () => { vehicle?.setAnim(a); renderAnims(); } }))); }
async function rebuild() {
  if (building) return; building = true; setStatus('building ' + spec.type + '…');
  try {
    if (vehicle) { scene.scene.remove(vehicle.group); vehicle.dispose(); }
    vehicle = await createVehicle(spec); scene.scene.add(vehicle.group);
    renderAnims(); const m = vehicle.metrics();
    fitCamera(m);
    info.textContent = `≈ ${m.length.toFixed(2)} m long · ${m.width.toFixed(2)} m wide · ${m.height.toFixed(2)} m tall · ${m.animals} animal${m.animals === 1 ? '' : 's'}`;
    setStatus('Vehicle: ' + VEHICLE_TYPES[spec.type].label);
  } catch (e) { console.error(e); setStatus('error: ' + e.message); }
  building = false;
}
/** Pull the camera back far enough that the whole rig — cart plus animal — is in the picture. */
function fitCamera(m) {
  const r = Math.max(m.length, m.height, m.width) / 2 * 1.2;                       // bounding sphere of the whole rig
  const fov = scene.camera.fov * Math.PI / 180;
  const dist = r / Math.tan(fov / 2) / Math.min(1, scene.camera.aspect || 1);
  const dir = new (scene.THREE.Vector3)(0.45, 0.38, 0.95).normalize();
  scene.camera.position.set(m.center.x + dir.x * dist, Math.max(0.6, m.center.y + dir.y * dist), dir.z * dist);
  scene.controls.target.set(m.center.x, m.center.y * 0.9, 0); scene.controls.update();
}
function changed() { store.set('current', spec); rebuild(); renderTypes(); renderJson(); }

// left: size, colours, draft animal
const left = document.getElementById('left');
const sizeKnob = knob('size', { min: 0.4, max: 2.5, step: 0.05, value: spec.size }, v => { spec.size = v; changed(); });
const colorRow = key => { const inp = el('input', { type: 'color', value: spec.colors[key] }); inp.oninput = () => { spec.colors[key] = inp.value; changed(); }; inp.dataset.key = key; return el('div', { class: 'row' }, el('label', { text: key }), inp); };
const colors = el('div');
const animalBox = el('div');
const descLine = el('p', { class: 'small muted' });
left.append(panel('Vehicle', descLine, sizeKnob, colors), panel('Draft animal', el('p', { class: 'small muted', text: 'The animal is a creature body (creatures.js), so it walks when the vehicle rolls.' }), animalBox));
function syncUI() {
  descLine.textContent = VEHICLE_TYPES[spec.type].desc;
  colors.replaceChildren(...Object.keys(spec.colors).map(colorRow));
  sizeKnob.querySelector('input').value = spec.size;
  animalBox.replaceChildren(checkbox('harnessed', !!spec.animal, v => { spec.animal = v ? (VEHICLE_TYPES[spec.type].animal || { type: 'horse', size: 1 }) : null; changed(); syncUI(); }),
    el('p', { class: 'small muted', text: spec.animal ? `${spec.animal.type} × ${VEHICLE_TYPES[spec.type].animals || 1}` : 'nothing in the shafts' }));
}

// right: JSON + the whole catalog + the game mapping
const right = document.getElementById('right');
const jsonArea = el('textarea', { rows: 12, spellcheck: 'false' });
function renderJson() { jsonArea.value = JSON.stringify(spec, null, 2); }
right.append(
  panel('Vehicle JSON', el('p', { class: 'small muted', html: 'Build it with <code>createVehicle(spec)</code>. A game stores the type id and rebuilds the model on demand.' }), jsonArea,
    el('div', { class: 'row' },
      button('Apply', () => { try { spec = normalizeVehicle(JSON.parse(jsonArea.value)); changed(); syncUI(); } catch (e) { toast(e.message); } }, 'small'),
      button('Export JSON', () => downloadJSON(spec, spec.type + '-vehicle.json'), 'small'),
      button('Import', async () => { try { const j = await readJSONFile(); spec = normalizeVehicle(j.vehicle || j); changed(); syncUI(); } catch (e) { toast(e.message); } }, 'small'))),
  panel('Every type', el('div', { class: 'chips' }, ...Object.entries(VEHICLE_TYPES).map(([id, T]) => el('span', { class: 'chip', text: `${T.label} · ${T.plan}`, onclick: () => { spec = normalizeVehicle({ type: id }); changed(); syncUI(); } })))),
  panel('Emberveil mapping', el('p', { class: 'small muted', html: Object.entries(VEHICLE_MODEL_FOR).map(([k, v]) => `<code>${k}</code> → ${v || '(walks)'}`).join('<br>') })));

renderTypes(); syncUI(); renderJson(); await rebuild();
window.vehicles3d = { get spec() { return spec; }, get vehicle() { return vehicle; }, set: s => { spec = normalizeVehicle(s); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building, types: Object.keys(VEHICLE_TYPES) };
