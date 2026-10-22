// Vehicles 3D demo: pick a type, recolour it, play the animations, export the vehicle JSON.
import { el, button, panel, knob, checkbox, downloadJSON, readJSONFile, toast } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { createScene } from './scene.js';
import { createVehicle, normalizeVehicle, VEHICLE_TYPES, VEHICLE_ANIMS, VEHICLE_MODEL_FOR } from './vehicles.js';
import { TV_VEHICLES, SHIP_EXTRAS, buildTvVehicle } from './tv-vehicles-gallery.js';   // Thousandvale's ship + cart, imported from its client

const store = makeStore('vehicles-3d', 1);
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
let spec = normalizeVehicle(store.get('current', { type: 'wagon' })); let vehicle = null; let building = false;
// a Thousandvale model picked from its panel (tv-vehicles-gallery.js); picking anything else clears it
let tvPick = null, again = false;
const shipExtras = Object.fromEntries(SHIP_EXTRAS.map(k => [k, true]));
const tvInfo = id => TV_VEHICLES.find(v => v.id === id);

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

function renderTypes() { typeChips.replaceChildren(...Object.entries(VEHICLE_TYPES).map(([id, T]) => el('span', { class: 'chip' + (!tvPick && spec.type === id ? ' on' : ''), text: T.label, onclick: () => { spec = normalizeVehicle({ type: id }); changed(); syncUI(); } }))); }
function renderAnims() { animChips.replaceChildren(...(vehicle?.anims || VEHICLE_ANIMS).map(a => el('span', { class: 'chip' + (vehicle?.anim === a ? ' on' : ''), text: a, onclick: () => { vehicle?.setAnim(a); renderAnims(); } }))); }
async function rebuild() {
  if (building) { again = true; return; } building = true; again = false; setStatus('building ' + (tvPick ? tvInfo(tvPick).label : spec.type) + '…');
  try {
    if (vehicle) { scene.scene.remove(vehicle.group); vehicle.dispose(); }
    const pick = tvPick;
    vehicle = pick ? await buildTvVehicle(pick, { extras: shipExtras, camera: scene.camera }) : await createVehicle(spec);
    applyEnv(vehicle.env || null);
    scene.scene.add(vehicle.group);
    renderAnims(); const m = vehicle.metrics();
    fitCamera(m);
    info.textContent = `≈ ${m.length.toFixed(2)} m long · ${m.width.toFixed(2)} m wide · ${m.height.toFixed(2)} m tall · ${m.animals} animal${m.animals === 1 ? '' : 's'}`;
    setStatus(pick ? 'Thousandvale: ' + tvInfo(pick).label : 'Vehicle: ' + VEHICLE_TYPES[spec.type].label);
  } catch (e) { console.error(e); setStatus('error: ' + e.message); }
  building = false;
  if (again) rebuild();          // a pick made while the last one was still building
}
/** The ship needs a sky, a far camera and no little floor disc; everything else gets the page's own stage back. */
const stage = { background: scene.scene.background.clone(), near: scene.camera.near, far: scene.camera.far, maxDistance: scene.controls.maxDistance, minDistance: scene.controls.minDistance,
  floor: scene.scene.children.filter(o => o.isGridHelper || (o.isMesh && o.geometry?.type === 'CircleGeometry')) };
function applyEnv(env) {
  scene.scene.background = env ? new scene.THREE.Color(env.background) : stage.background.clone();
  scene.scene.fog = env?.fog ? new scene.THREE.Fog(env.fog[0], env.fog[1], env.fog[2]) : null;
  scene.camera.near = env?.near ?? stage.near; scene.camera.far = env?.far ?? stage.far; scene.camera.updateProjectionMatrix();
  scene.controls.maxDistance = env?.maxDistance ?? stage.maxDistance; scene.controls.minDistance = env?.minDistance ?? stage.minDistance;
  for (const o of stage.floor) o.visible = env ? env.ground !== false : true;
}
/** Pull the camera back far enough that the whole rig — cart plus animal — is in the picture. */
function fitCamera(m) {
  const r = Math.max(m.length, m.height, m.width) / 2 * 1.2;                       // bounding sphere of the whole rig
  const fov = scene.camera.fov * Math.PI / 180;
  const dist = r / Math.tan(fov / 2) / Math.min(1, scene.camera.aspect || 1);
  const dir = vehicle?.ship ? new (scene.THREE.Vector3)(0.55, 0.14, 0.95).normalize() : new (scene.THREE.Vector3)(0.45, 0.38, 0.95).normalize();   // the ship: low, so the horizon shows
  scene.camera.position.set(m.center.x + dir.x * dist, Math.max(0.6, m.center.y + dir.y * dist), dir.z * dist);
  scene.controls.target.set(m.center.x, m.center.y * 0.9, 0); scene.controls.update();
}
function changed(keepTv = false) { if (!keepTv) tvPick = null; store.set('current', spec); rebuild(); renderTypes(); renderJson(); renderTvChips?.(); }
function pickTv(id) { if (!tvInfo(id)) return false; tvPick = id; changed(true); syncUI(); return true; }

// left: size, colours, draft animal
const left = document.getElementById('left');
const sizeKnob = knob('size', { min: 0.4, max: 2.5, step: 0.05, value: spec.size }, v => { spec.size = v; changed(); });
const colorRow = key => { const inp = el('input', { type: 'color', value: spec.colors[key] }); inp.oninput = () => { spec.colors[key] = inp.value; changed(); }; inp.dataset.key = key; return el('div', { class: 'row' }, el('label', { text: key }), inp); };
const colors = el('div');
const animalBox = el('div');
const descLine = el('p', { class: 'small muted' });
const animalPanel = panel('Draft animal', el('p', { class: 'small muted', text: 'The animal is a creature body (creatures.js), so it walks when the vehicle rolls.' }), animalBox);
const extrasBox = el('div');
const extrasPanel = panel('At sea', el('p', { class: 'small muted', text: "The ship's surroundings, from Thousandvale's ship-view.js. Drag and zoom out to find the brine-wyrm (off the starboard bow, every 13 s) and the ash plume (on the horizon behind the ship)." }), extrasBox);
const EXTRA_NAMES = { sea: 'Sea (the voyage\'s waves + wake)', gulls: 'Gulls', spray: 'Bow spray', serpent: 'Brine-wyrm', plume: 'Ash plume' };
left.append(panel('Vehicle', descLine, sizeKnob, colors), animalPanel, extrasPanel);
function syncUI() {
  const tv = tvPick && tvInfo(tvPick);
  for (const n of [sizeKnob, colors, animalPanel]) n.style.display = tv ? 'none' : '';
  extrasPanel.style.display = tv && tvPick.startsWith('tv_ship') ? '' : 'none';
  extrasBox.replaceChildren(...SHIP_EXTRAS.map(k => checkbox(EXTRA_NAMES[k] || k, !!(vehicle?.extras?.[k] ?? shipExtras[k]), v => { shipExtras[k] = v; vehicle?.setExtras?.({ [k]: v }); })));
  if (tv) { descLine.textContent = tv.desc; return; }
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

// Thousandvale: its ship and its ox cart, built by its own client modules (prototypes/thousandvale/js/client/)
const tvChips = el('div', { class: 'chips', id: 'tv-vehicle-chips' });
function renderTvChips() { tvChips.replaceChildren(...TV_VEHICLES.map(v => el('span', { class: 'chip' + (tvPick === v.id ? ' on' : ''), text: v.label, title: v.desc, 'data-tv': v.id, onclick: () => pickTv(v.id) }))); }
right.append(panel('Thousandvale', el('p', { class: 'small muted', html: 'Imported live from the game: <code>ship-view.js</code> (<code>buildShip</code> + the sea, gulls, spray, brine-wyrm, ash plume and jetty) and <code>carts-view.js</code> (<code>createCarts</code>, <code>CART_SPEC</code>, <code>OX</code>). The ship is 31 m long, so the camera pulls well back.' }), tvChips));
renderTvChips();

renderTypes(); syncUI(); renderJson(); await rebuild();
window.vehicles3d = { get spec() { return spec; }, get vehicle() { return vehicle; }, set: s => { spec = normalizeVehicle(s); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building || again, types: Object.keys(VEHICLE_TYPES), tvVehicles: TV_VEHICLES.map(v => v.id), pickTv, get tvPick() { return tvPick; }, shipExtras };
