// Vehicles 3D demo: pick a type, recolour it, play the animations, export the vehicle JSON.
import { el, button, panel, knob, checkbox, downloadJSON, readJSONFile, toast } from '../../shared/ui.js';
import { makeStore } from '../../shared/store.js';
import { createScene } from './scene.js';
import { createVehicle, normalizeVehicle, VEHICLE_TYPES, VEHICLE_ANIMS, VEHICLE_MODEL_FOR } from './vehicles.js';
import { TV_VEHICLES, SHIP_EXTRAS, buildTvVehicle } from './tv-vehicles-gallery.js';   // Thousandvale's ship + cart, imported from its client
import { createThumbnailer, frameBox } from './preview-kit.js';
import { loadVehicleCatalog, filterVehicles, facetCounts, tagsOf, ERAS, ERA_LABELS, DOMAINS } from './vehicle-catalog.js';
import { buildCatalogModel, frameOf, sourceUnavailable } from './vehicle-gallery.js';   // every other game's model, built by that game's code

const store = makeStore('vehicles-3d', 1);
const status = document.getElementById('status'); const setStatus = t => status.textContent = t;
let spec = normalizeVehicle(store.get('current', { type: 'wagon' })); let vehicle = null; let building = false;
// a Thousandvale model picked from its panel (tv-vehicles-gallery.js); picking anything else clears it
let tvPick = null, again = false;
// a catalog row that is not one of this page's own types (Roverlands, Farhold, mounts, space); same rule as tvPick
let catPick = null, renderCards = null;
let jsonPanel = null;
const shipExtras = Object.fromEntries(SHIP_EXTRAS.map(k => [k, true]));
const tvInfo = id => TV_VEHICLES.find(v => v.id === id);

const main = document.getElementById('main');
const viewPanel = el('div', { class: 'panel' });
const viewport = el('div', { id: 'viewport' }); viewport.append(el('div', { class: 'overlay', text: 'drag to orbit · wheel to zoom' }));
const animChips = el('div', { class: 'chips anim-chips' });
const typeChips = el('div', { class: 'chips' });
const info = el('span', { class: 'small muted' });
main.append(viewPanel);
viewPanel.append(typeChips, viewport,
  el('div', { class: 'row' }, el('label', { text: 'Animation' }), animChips),
  el('div', { class: 'row' },
    checkbox('Turntable', false, v => scene.setTurntable(v ? 0.6 : 0)),
    button('📷 Snapshot PNG', () => { const a = el('a', { href: scene.snapshot(), download: spec.type + '-3d.png' }); document.body.append(a); a.click(); a.remove(); }, 'small'),
    info));
const scene = createScene(viewport); scene.camera.position.set(3.4, 1.9, 4.2); scene.controls.target.set(0, 0.7, 0);
scene.addTicker((dt, t) => vehicle?.update(dt, t));   // one ticker for the life of the page; it follows whichever vehicle is current

function renderTypes() { typeChips.replaceChildren(...Object.entries(VEHICLE_TYPES).map(([id, T]) => el('span', { class: 'chip' + (!tvPick && !catPick && spec.type === id ? ' on' : ''), text: T.label, onclick: () => { spec = normalizeVehicle({ type: id }); changed(); syncUI(); } }))); }
function renderAnims() { animChips.replaceChildren(...(vehicle?.anims || VEHICLE_ANIMS).map(a => el('span', { class: 'chip' + (vehicle?.anim === a ? ' on' : ''), text: a, onclick: () => { vehicle?.setAnim(a); renderAnims(); } }))); }
async function rebuild() {
  if (building) { again = true; return; } building = true; again = false; setStatus('building ' + (catPick?.name || (tvPick ? tvInfo(tvPick).label : spec.type)) + '…');
  try {
    if (vehicle) { scene.scene.remove(vehicle.group); vehicle.dispose(); vehicle = null; }
    const pick = tvPick, row = catPick;
    vehicle = row ? await buildCatalogModel(row) : pick ? await buildTvVehicle(pick, { extras: shipExtras, camera: scene.camera }) : await createVehicle(spec);
    applyEnv(vehicle.env || null);
    scene.scene.add(vehicle.group);
    renderAnims(); const m = vehicle.metrics();
    fitCamera(m);
    let tris = 0, meshes = 0;
    vehicle.group.traverseVisible(o => { if (!o.isMesh) return; meshes++; const g = o.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; });
    const animals = m.animals ? ` · ${m.animals} animal${m.animals === 1 ? '' : 's'}` : '';
    info.textContent = `≈ ${m.length.toFixed(2)} m long · ${m.width.toFixed(2)} m wide · ${m.height.toFixed(2)} m tall${animals} · ${Math.round(tris).toLocaleString()} triangles · ${meshes} meshes`;
    setStatus(row ? row.name : pick ? 'Thousandvale: ' + tvInfo(pick).label : 'Vehicle: ' + VEHICLE_TYPES[spec.type].label);
  } catch (e) { console.error(e); setStatus('error: ' + e.message); }
  building = false;
  if (again) rebuild();          // a pick made while the last one was still building
}
/** The ship needs a sky, a far camera and no little floor disc; everything else gets the page's own stage back. */
const stage = { background: scene.scene.background.clone(), near: scene.camera.near, far: scene.camera.far, maxDistance: scene.controls.maxDistance, minDistance: scene.controls.minDistance,
  floor: scene.scene.children.filter(o => o.isGridHelper || (o.isMesh && o.geometry?.type === 'CircleGeometry')),
  sun: scene.scene.children.find(o => o.isDirectionalLight && o.castShadow) };
function applyEnv(env) {
  scene.scene.background = env ? new scene.THREE.Color(env.background) : stage.background.clone();
  scene.scene.fog = env?.fog ? new scene.THREE.Fog(env.fog[0], env.fog[1], env.fog[2]) : null;
  scene.camera.near = env?.near ?? stage.near; scene.camera.far = env?.far ?? stage.far; scene.camera.updateProjectionMatrix();
  scene.controls.maxDistance = env?.maxDistance ?? stage.maxDistance; scene.controls.minDistance = env?.minDistance ?? stage.minDistance;
  const floorScale = env?.floorScale ?? 1;                       // a semi truck is three of the little floor disc long
  for (const o of stage.floor) { o.visible = env ? env.ground !== false : true; o.scale.set(floorScale, o.isGridHelper ? 1 : floorScale, floorScale); }
  const cam = stage.sun.shadow.camera; cam.left = cam.bottom = -3 * floorScale; cam.right = cam.top = 3 * floorScale; cam.far = 30 * floorScale; cam.updateProjectionMatrix();
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
function changed(keepTv = false) { if (!keepTv) { tvPick = null; catPick = null; } store.set('current', spec); rebuild(); renderTypes(); renderJson(); renderTvChips?.(); renderCards?.(); }
function pickTv(id) { if (!tvInfo(id)) return false; catPick = null; tvPick = id; changed(true); syncUI(); return true; }

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
  const own = !tv && !catPick;
  for (const n of [sizeKnob, colors, animalPanel, jsonPanel]) if (n) n.style.display = own ? '' : 'none';
  extrasPanel.style.display = tv && tvPick.startsWith('tv_ship') ? '' : 'none';
  extrasBox.replaceChildren(...SHIP_EXTRAS.map(k => checkbox(EXTRA_NAMES[k] || k, !!(vehicle?.extras?.[k] ?? shipExtras[k]), v => { shipExtras[k] = v; vehicle?.setExtras?.({ [k]: v }); })));
  if (tv) { descLine.textContent = tv.desc; return; }
  if (catPick) { descLine.textContent = `${catPick.name}: ${ERA_LABELS[catPick.era]}, ${tagsOf(catPick).join(', ')}.${catPick.seats ? ` ${catPick.seats} seat${catPick.seats === 1 ? '' : 's'}.` : ''} Built by ${catPick.module}.`; return; }
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
jsonPanel = panel('Vehicle JSON', el('p', { class: 'small muted', html: 'Build it with <code>createVehicle(spec)</code>. A game stores the type id and rebuilds the model on demand.' }), jsonArea,
    el('div', { class: 'row' },
      button('Apply', () => { try { spec = normalizeVehicle(JSON.parse(jsonArea.value)); changed(); syncUI(); } catch (e) { toast(e.message); } }, 'small'),
      button('Export JSON', () => downloadJSON(spec, spec.type + '-vehicle.json'), 'small'),
      button('Import', async () => { try { const j = await readJSONFile(); spec = normalizeVehicle(j.vehicle || j); changed(); syncUI(); } catch (e) { toast(e.message); } }, 'small')));
right.append(jsonPanel,
  panel('Every type', el('div', { class: 'chips' }, ...Object.entries(VEHICLE_TYPES).map(([id, T]) => el('span', { class: 'chip', text: `${T.label} · ${T.plan}`, onclick: () => { spec = normalizeVehicle({ type: id }); changed(); syncUI(); } })))),
  panel('Emberveil mapping', el('p', { class: 'small muted', html: Object.entries(VEHICLE_MODEL_FOR).map(([k, v]) => `<code>${k}</code> → ${v || '(walks)'}`).join('<br>') })));

// Thousandvale: its ship and its ox cart, built by its own client modules (prototypes/thousandvale/js/client/)
const tvChips = el('div', { class: 'chips', id: 'tv-vehicle-chips' });
function renderTvChips() { tvChips.replaceChildren(...TV_VEHICLES.map(v => el('span', { class: 'chip' + (tvPick === v.id ? ' on' : ''), text: v.label, title: v.desc, 'data-tv': v.id, onclick: () => pickTv(v.id) }))); }
right.append(panel('Thousandvale', el('p', { class: 'small muted', html: 'Imported live from the game: <code>ship-view.js</code> (<code>buildShip</code> + the sea, gulls, spray, brine-wyrm, ash plume and jetty) and <code>carts-view.js</code> (<code>createCarts</code>, <code>CART_SPEC</code>, <code>OX</code>). The ship is 31 m long, so the camera pulls well back.' }), tvChips));
renderTvChips();

// The catalog: every vehicle model in the playground (data/vehicle-catalog.json), filtered by era and tag. A card's picture
// comes from ONE shared thumbnail renderer, and only once the card is near the screen.
const catalog = await loadVehicleCatalog();
const counts = facetCounts(catalog);
const filter = { era: null, tags: [] };
const TAG_ROW = Object.entries(counts.tags).filter(([t, n]) => n > 1 && !DOMAINS.includes(t)).sort((a, b) => b[1] - a[1]).map(([t]) => t);
const rowOf = id => catalog.find(r => r.id === id);
const thumbs = createThumbnailer({ size: 256 });
const unavailable = new Map();          // row id -> why this copy of the site cannot build it
const isOn = r => (r.builder === 'tv' ? tvPick === r.model : r.builder === 'vehicles' ? !tvPick && !catPick && spec.type === r.model : catPick?.id === r.id);

function pickCatalog(id) {
  const r = rowOf(id);
  if (!r || !r.builder || unavailable.has(id)) return false;
  if (r.builder === 'tv') pickTv(r.model);
  else if (r.builder === 'vehicles') { spec = normalizeVehicle({ type: r.model }); changed(); syncUI(); }
  else { tvPick = null; catPick = r; changed(true); syncUI(); }
  viewport.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  return true;
}

const drawCard = (card, url) => { const img = card.querySelector('img'); img.src = url; img.hidden = false; card.querySelector('.vc-empty').hidden = true; };
const noPicture = (card, why) => { card.classList.add('off'); const e = card.querySelector('.vc-empty'); e.textContent = why; e.hidden = false; };
const watcher = new IntersectionObserver(entries => { for (const e of entries) {
  const card = e.target, id = card.dataset.vehicle;
  if (!e.isIntersecting) { if (card.dataset.queued) thumbs.cancel(id); continue; }      // scrolled past: not worth building yet
  if (!card.dataset.queued) picture(card, rowOf(id));
} }, { rootMargin: '300px' });

async function picture(card, r) {
  const why = unavailable.get(r.id) || await sourceUnavailable(r);
  if (why) { unavailable.set(r.id, why); watcher.unobserve(card); return noPicture(card, r.builder ? 'Not in this copy' : 'No separate model'); }
  card.dataset.queued = '1';
  try {
    const url = await thumbs.request(r.id, async st => {
      const show = await buildCatalogModel(r, { thumb: true });
      show.update?.(0.016, 0);
      st.scene.add(show.group);
      frameBox(st.camera, frameOf(show), { yaw: 0.95, pitch: 0.28, pad: 0.92 });
      return () => { st.scene.remove(show.group); show.dispose?.(); };
    });
    drawCard(card, url); watcher.unobserve(card);
  } catch (e) {
    if (e.message === 'cancelled') return;      // the watcher asks again when the card comes back
    watcher.unobserve(card);
    console.warn('[vehicles] no picture for', r.id, e);
    noPicture(card, 'Could not build');
  } finally { delete card.dataset.queued; }
}

const cardsBox = el('div', { class: 'vc-grid', id: 'vehicle-cards' });
const countLine = el('span', { class: 'small muted', id: 'vehicle-count' });
function makeCard(r) {
  const card = el('button', { class: 'vc-card', type: 'button', 'data-vehicle': r.id, 'data-era': r.era, title: r.notShown || r.module, onclick: () => pickCatalog(r.id) },
    el('span', { class: 'vc-pic' }, el('img', { alt: r.name, hidden: true, width: 256, height: 256 }), el('span', { class: 'vc-empty small muted', text: '…' })),
    el('span', { class: 'vc-name', text: r.name }),
    el('span', { class: 'vc-era vc-' + r.era, text: ERA_LABELS[r.era] }),
    el('span', { class: 'small muted', text: [r.domain, r.source].join(' · ') }));
  return card;
}
const cards = new Map(catalog.map(r => [r.id, makeCard(r)]));
for (const [id, c] of cards) { const r = rowOf(id); if (!r.builder) noPicture(c, 'No separate model'); else watcher.observe(c); }
renderCards = () => {
  const rows = filterVehicles(catalog, filter);
  cardsBox.replaceChildren(...rows.map(r => { const c = cards.get(r.id); c.classList.toggle('on', isOn(r)); return c; }));
  if (!rows.length) cardsBox.append(el('p', { class: 'small muted', text: 'Nothing matches all of those. Turn a filter off.' }));
  countLine.textContent = `${rows.length} of ${catalog.length} models`;
};
const eraChips = el('div', { class: 'chips', id: 'era-filters' }), whereChips = el('div', { class: 'chips', id: 'where-filters' }), tagChips = el('div', { class: 'chips', id: 'tag-filters' });
const chip = (text, on, onclick, data) => el('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), text, onclick, ...data, 'aria-pressed': on ? 'true' : 'false' });
const toggleTag = t => { filter.tags = filter.tags.includes(t) ? filter.tags.filter(x => x !== t) : [...filter.tags, t]; renderFilters(); };
const tagChip = t => chip(`${t} ${counts.tags[t]}`, filter.tags.includes(t), () => toggleTag(t), { 'data-tag': t });
function renderFilters() {
  eraChips.replaceChildren(chip(`All ${catalog.length}`, !filter.era, () => { filter.era = null; renderFilters(); }, { 'data-era': 'all' }),
    ...ERAS.map(e => chip(`${ERA_LABELS[e]} ${counts.eras[e] || 0}`, filter.era === e, () => { filter.era = filter.era === e ? null : e; renderFilters(); }, { 'data-era': e })));
  whereChips.replaceChildren(...DOMAINS.map(tagChip));
  tagChips.replaceChildren(...TAG_ROW.map(tagChip));
  renderCards();
}
main.append(el('section', { class: 'panel vc-section' },
  el('div', { class: 'row vc-head' }, el('h2', { text: 'Every vehicle model' }), countLine),
  el('p', { class: 'small muted', html: 'From <code>data/vehicle-catalog.json</code>, built by each game\'s own code. Tap one to look at it above.' }),
  el('div', { class: 'vc-filter' }, el('label', { text: 'Era' }), eraChips),
  el('div', { class: 'vc-filter' }, el('label', { text: 'Where' }), whereChips),
  el('div', { class: 'vc-filter' }, el('label', { text: 'Tags' }), tagChips),
  cardsBox));
renderFilters();
const linked = decodeURIComponent(location.hash.slice(1).replace(/^v=/, ''));

renderTypes(); syncUI(); renderJson(); await rebuild();
if (rowOf(linked)) pickCatalog(linked);
window.vehicles3d = { catalog, pickCatalog, get catalogPick() { return catPick; }, thumbStats: () => thumbs.stats(), unavailable, get spec() { return spec; }, get vehicle() { return vehicle; }, set: s => { spec = normalizeVehicle(s); changed(); syncUI(); }, scene, rebuild, isBuilding: () => building || again, types: Object.keys(VEHICLE_TYPES), tvVehicles: TV_VEHICLES.map(v => v.id), pickTv, get tvPick() { return tvPick; }, shipExtras };
