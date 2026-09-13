// World Forge viewer: knobs on the left, map in the middle, lists on the right, three zoom levels.
// Generation runs in a Web Worker so the page never freezes; if module workers are unavailable the
// same code runs inline instead.

import { el, knob, select, checkbox, button, textInput, panel, toast } from '../../shared/ui.js';
import { DEFAULTS, METHODS, WINDS, PRESETS, cellInfo, nearestNode } from './world.js';
import { BIOMES, BIOME_BLURB } from './biomes.js';
import { renderWorld, renderRegion, renderLocal, cellAt, legend as legendRows, DEFAULT_LAYERS, nodeStyle } from './render.js';
import { toJSON, toPNG, download, jsonSizeKB } from './export.js';
import { worldSummary } from './history.js';

const $ = id => document.getElementById(id);

const state = {
  opts: { ...DEFAULTS, seed: 1337, onProgress: null, namegen: null },
  world: null, detail: null, tile: null,
  level: 'world',                      // world | region | local
  layer: 'biomes',
  layers: { ...DEFAULT_LAYERS },
  regionId: null, localCell: null, selectedNode: null,
  view: null, busy: false,
};
delete state.opts.onProgress; delete state.opts.namegen; delete state.opts.raceTable;

// ---------------------------------------------------------------- worker plumbing
let worker = null, reqId = 0;
const pending = new Map();

function ensureWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') { setProgress(m.fraction, m.label); return; }
      if (m.type === 'warn') { console.warn(m.message); return; }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.type === 'error') p.reject(new Error(m.message));
      else p.resolve(m);
    };
    worker.onerror = err => { console.warn('worker failed, falling back to the main thread', err.message); worker = false; };
  } catch (err) {
    console.warn('no module worker support, generating on the main thread', err);
    worker = false;
  }
  return worker;
}

function ask(message) {
  const w = ensureWorker();
  if (!w) return null;
  const id = ++reqId;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); w.postMessage({ ...message, id }); });
}

// main-thread fallback (also used by the tests when workers are blocked)
let inlineModules = null;
async function inline() {
  if (!inlineModules) {
    const [world, local, namegenMod] = await Promise.all([
      import('./world.js'), import('./local.js'),
      import('../../namegen/js/namegen.js').then(m => m.NameGen.load('../../namegen/data/')).catch(() => null),
    ]);
    inlineModules = { generateWorld: world.generateWorld, ...local, namegen: namegenMod };
  }
  return inlineModules;
}

// ---------------------------------------------------------------- progress + status
function setProgress(fraction, label) {
  $('progress').hidden = false;
  $('progressBar').style.width = Math.round(fraction * 100) + '%';
  $('progressLabel').textContent = label || '';
}
function setBusy(on, label) {
  state.busy = on;
  $('canvasWrap').classList.toggle('busy', on);
  $('generate').disabled = on;
  if (!on) $('progress').hidden = true;
  if (label) $('status').textContent = label;
}

// ---------------------------------------------------------------- generation
async function generate() {
  if (state.busy) return;
  setBusy(true, 'generating…');
  setProgress(0.01, 'starting');
  const opts = { ...state.opts };
  const t0 = performance.now();
  try {
    const reply = await ask({ type: 'generate', opts });
    if (reply) state.world = reply.world;
    else {
      const mods = await inline();
      state.world = mods.generateWorld({ ...opts, namegen: mods.namegen, onProgress: (f, l) => setProgress(f, l) });
    }
    state.level = 'world'; state.detail = null; state.tile = null; state.regionId = null; state.localCell = null;
    $('status').textContent = `${state.world.width}×${state.world.height} · ${Math.round(performance.now() - t0)} ms · ${worldSummary(state.world)}`;
    buildRight();
    draw();
  } catch (err) {
    console.error(err);
    toast('Generation failed: ' + err.message);
    $('status').textContent = 'failed: ' + err.message;
  } finally {
    setBusy(false);
  }
}

async function openRegion(regionId) {
  if (regionId == null || !state.world.regions[regionId]) return;
  setBusy(true, 'zooming in…');
  setProgress(0.4, 'refining the region');
  try {
    const reply = await ask({ type: 'region', regionId, opts: { factor: 6 } });
    state.detail = reply ? reply.detail : (await inline()).generateRegionDetail(state.world, regionId, { factor: 6, namegen: (await inline()).namegen });
    state.regionId = regionId; state.level = 'region'; state.tile = null;
    buildRight(); draw();
  } catch (err) { console.error(err); toast('Could not open that region: ' + err.message); }
  finally { setBusy(false); }
}

async function openLocal(worldX, worldY) {
  setBusy(true, 'zooming in…');
  setProgress(0.6, 'building the tile');
  try {
    const node = state.world.nodes.find(n => n.x === worldX && n.y === worldY) || null;
    const reply = await ask({ type: 'local', x: worldX, y: worldY, opts: { size: 64, node } });
    state.tile = reply ? reply.tile : (await inline()).generateLocalDetail(state.world, worldX, worldY, { size: 64, node });
    state.localCell = { x: worldX, y: worldY }; state.level = 'local';
    buildRight(); draw();
  } catch (err) { console.error(err); toast('Could not open that tile: ' + err.message); }
  finally { setBusy(false); }
}

function back(level) {
  state.level = level;
  if (level === 'world') { state.regionId = null; state.detail = null; }
  if (level !== 'local') state.tile = null;
  buildRight(); draw();
}

// ---------------------------------------------------------------- drawing
function fitCanvas() {
  const canvas = $('map'), wrap = $('canvasWrap');
  const grid = state.level === 'world' ? state.world : state.level === 'region' ? state.detail : state.tile;
  // shape the box like the grid so the map fills it instead of sitting in a letterbox
  if (grid) wrap.style.aspectRatio = `${grid.width} / ${grid.height}`;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(200, wrap.clientWidth), h = Math.max(200, wrap.clientHeight);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
}

function draw() {
  if (!state.world) return;
  fitCanvas();
  const ctx = $('map').getContext('2d');
  const layers = { ...state.layers };
  if (state.level === 'world') {
    state.view = renderWorld(ctx, state.world, {
      layers, layer: state.layer,
      highlightRegion: state.layers.regions ? null : state.hoverRegion,
      selection: state.selectedNode ? { x: state.selectedNode.x, y: state.selectedNode.y } : null,
    });
  } else if (state.level === 'region' && state.detail) {
    state.view = renderRegion(ctx, state.detail, { layers, layer: state.layer === 'regions' ? 'biomes' : state.layer });
  } else if (state.level === 'local' && state.tile) {
    state.view = renderLocal(ctx, state.tile, {});
  }
  drawCrumbs();
  drawLegend();
}

function drawCrumbs() {
  const c = $('crumbs'); c.replaceChildren();
  const add = (text, onclick, here) => c.append(here ? el('span', { class: 'here', text }) : el('a', { text, onclick }));
  const sep = () => c.append(el('span', { class: 'sep', text: '›' }));
  add('World', () => back('world'), state.level === 'world');
  if (state.level !== 'world' && state.regionId != null) {
    sep();
    const r = state.world.regions[state.regionId];
    add(r.name, () => back('region'), state.level === 'region');
  }
  if (state.level === 'local' && state.tile) {
    sep(); add(state.tile.title, null, true);
  }
  if (state.level === 'world') c.append(el('span', { class: 'muted small', text: '  — click a region to zoom in' }));
  else if (state.level === 'region') c.append(el('span', { class: 'muted small', text: '  — click anywhere for the local map' }));
  else c.append(el('span', { class: 'muted small', text: `  — ${state.tile.sizeMetres} m across, ${state.tile.metresPerCell} m per cell` }));
}

function drawLegend() {
  const box = $('legend'); box.replaceChildren();
  const rows = state.level === 'world' ? legendRows(state.world, state.layer) : state.detail && state.level === 'region' ? legendRows(state.detail, state.layer === 'regions' ? 'biomes' : state.layer) : state.tile ? legendRows(state.tile, 'biomes') : [];
  for (const r of rows.slice(0, 18)) {
    box.append(el('span', { class: 'sw' }, el('i', { style: { background: r.color } }), r.label + (r.share > 0.004 ? ` ${Math.round(r.share * 100)}%` : '')));
  }
}

// ---------------------------------------------------------------- hover + click
function canvasPoint(ev) {
  const canvas = $('map'), rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  return { x: (ev.clientX - rect.left) * sx, y: (ev.clientY - rect.top) * sy };
}

function onHover(ev) {
  if (!state.world || !state.view) return;
  const p = canvasPoint(ev);
  const grid = state.level === 'world' ? state.world : state.level === 'region' ? state.detail : state.tile;
  if (!grid) return;
  const cell = cellAt(grid, p.x, p.y, state.view);
  const out = $('readout'); out.replaceChildren();
  if (!cell) { out.append(el('span', { class: 'muted small', text: 'outside the map' })); state.hoverRegion = null; return; }
  const info = cellInfo(grid, cell.x, cell.y);
  if (!info) return;
  const bits = [
    ['cell', `${cell.x},${cell.y}`],
    ['biome', info.biomeName],
    ['height', info.water === 'land' ? `${info.elevationMetres} m` : `${-info.elevationMetres} m deep`],
    ['temp', `${info.temperatureC}°C`],
    ['rain', `${Math.round(info.moisture * 100)}%`],
  ];
  if (info.river) bits.push(['river', ['', 'stream', 'river', 'great river'][info.river] || 'river']);
  if (Math.abs(info.aura) > 0.3) bits.push(['aura', info.aura > 0 ? `cursed ${Math.round(info.aura * 100)}%` : `blessed ${Math.round(-info.aura * 100)}%`]);
  if (info.magic > 0.6) bits.push(['magic', `${Math.round(info.magic * 100)}%`]);
  if (state.level === 'world') {
    state.hoverRegion = info.region ? info.region.id : null;
    if (info.region) bits.unshift(['region', info.region.name]);
    const near = nearestNode(state.world, cell.x, cell.y);
    if (near && near.distance < 14) bits.push(['nearest', `${near.node.name} (${near.node.kind}, ${Math.round(near.distance)} cells)`]);
  } else if (state.level === 'region' && state.detail) {
    const r = state.world.regions[state.regionId];
    bits.unshift(['region', r.name]);
  }
  for (const [k, v] of bits) out.append(el('span', {}, `${k} `, el('b', { text: String(v) })));
  out.append(el('span', { class: 'muted', text: BIOME_BLURB[info.biome] ? `— ${BIOME_BLURB[info.biome]}` : '' }));
}

function onClick(ev) {
  if (!state.world || !state.view || state.busy) return;
  const p = canvasPoint(ev);
  if (state.level === 'world') {
    const cell = cellAt(state.world, p.x, p.y, state.view);
    if (!cell) return;
    const rid = state.world.region[cell.y * state.world.width + cell.x];
    if (rid >= 0) openRegion(rid);
    else toast('That is open water — click land to zoom in.');
  } else if (state.level === 'region' && state.detail) {
    const cell = cellAt(state.detail, p.x, p.y, state.view);
    if (!cell) return;
    const parent = state.detail.parentCell[cell.y * state.detail.width + cell.x];
    openLocal(parent % state.world.width, (parent / state.world.width) | 0);
  }
}

// ---------------------------------------------------------------- left panel (the knobs)
const knobRefs = {};
function addKnob(parent, key, label, opts) {
  const k = knob(label, { ...opts, value: state.opts[key] }, v => { state.opts[key] = v; });
  k.classList.add('tight');
  knobRefs[key] = k;
  parent.append(k);
  return k;
}

function buildLeft() {
  const left = $('left'); left.replaceChildren();

  // world + generate
  const seedInput = textInput('Seed', String(state.opts.seed), v => { state.opts.seed = (parseInt(v, 10) || 0) >>> 0; });
  seedInput.classList.add('seed-row');
  const sizeSel = select('Size', [
    { value: '128x64', label: '128 × 64 (quick)' },
    { value: '192x96', label: '192 × 96' },
    { value: '256x128', label: '256 × 128 (default)' },
    { value: '384x192', label: '384 × 192' },
    { value: '512x256', label: '512 × 256 (slow)' },
  ], `${state.opts.width}x${state.opts.height}`, v => { const [w, h] = v.split('x').map(Number); state.opts.width = w; state.opts.height = h; });
  const worldPanel = panel('World',
    seedInput,
    el('div', { class: 'row' },
      button('Reroll seed', () => { state.opts.seed = Math.floor(Math.random() * 1e9); seedInput.set(String(state.opts.seed)); generate(); }),
      button('Copy link', () => { navigator.clipboard?.writeText(location.href.split('#')[0] + '#' + encodeURIComponent(JSON.stringify(state.opts))); toast('Link with these knobs copied'); }, 'small'),
    ),
    sizeSel,
    button('Generate', generate, 'primary'),
  );
  worldPanel.querySelector('button.primary').id = 'generate';
  left.append(worldPanel);

  // presets
  const presetRow = el('div', { class: 'preset-row' });
  for (const name of Object.keys(PRESETS)) {
    presetRow.append(el('span', {
      class: 'chip', text: name, onclick: () => {
        Object.assign(state.opts, PRESETS[name]);
        for (const [k, v] of Object.entries(state.opts)) knobRefs[k]?.set?.(v);
        methodSel.set(state.opts.method); windSel.set(state.opts.windDirection);
        generate();
      },
    }));
  }
  left.append(panel('Presets', presetRow, el('div', { class: 'mini', text: 'A preset sets every knob below, then generates.' })));

  // shape
  const shape = panel('Shape');
  var methodSel = select('Method', [
    { value: 'noise', label: 'noise — warped fractal' },
    { value: 'plates', label: 'plates — tectonic' },
    { value: 'voronoi', label: 'voronoi — cell islands' },
    { value: 'diamond', label: 'diamond — midpoint' },
    { value: 'archipelago', label: 'archipelago — many isles' },
    { value: 'pangea', label: 'pangea — one great land' },
    { value: 'mixed', label: 'mixed — blend of three' },
  ], state.opts.method, v => { state.opts.method = v; });
  shape.append(methodSel);
  addKnob(shape, 'landmasses', 'Landmass seeds', { min: 1, max: 14, step: 1 });
  addKnob(shape, 'continentScale', 'Continent scale', { min: 0.4, max: 2.5, step: 0.05 });
  addKnob(shape, 'seaLevel', 'Sea level (share of ocean)', { min: 0.15, max: 0.9, step: 0.01 });
  addKnob(shape, 'coastRoughness', 'Coast roughness', { min: 0, max: 1, step: 0.02 });
  addKnob(shape, 'mountainScale', 'Mountain amount', { min: 0, max: 1.2, step: 0.02 });
  addKnob(shape, 'mountainSharpness', 'Mountain sharpness', { min: 0, max: 1, step: 0.02 });
  addKnob(shape, 'thermalErosion', 'Slope slumping (passes)', { min: 0, max: 12, step: 1 });
  addKnob(shape, 'hydraulicErosion', 'Rain erosion', { min: 0, max: 1, step: 0.02 });
  left.append(shape);

  // water
  const water = panel('Water');
  addKnob(water, 'riverDensity', 'River density', { min: 0, max: 1, step: 0.02 });
  addKnob(water, 'lakeAmount', 'Lakes', { min: 0, max: 1, step: 0.02 });
  water.append(checkbox('Sea lanes between ports', state.opts.seaLanes, v => { state.opts.seaLanes = v; }));
  left.append(water);

  // climate
  const climate = panel('Climate');
  addKnob(climate, 'temperature', 'World temperature', { min: 0, max: 1, step: 0.02 });
  addKnob(climate, 'latitudeBands', 'Latitude bands', { min: 0, max: 1, step: 0.02 });
  addKnob(climate, 'lapseRate', 'Cooling with height', { min: 0, max: 1, step: 0.02 });
  var windSel = select('Prevailing wind', WINDS.map(v => ({ value: v, label: v === 'bands' ? 'bands (trades + westerlies)' : 'from the ' + v })), state.opts.windDirection, v => { state.opts.windDirection = v; });
  climate.append(windSel);
  addKnob(climate, 'rainfall', 'Rainfall', { min: 0, max: 1, step: 0.02 });
  addKnob(climate, 'rainShadow', 'Rain shadow', { min: 0, max: 1, step: 0.02 });
  addKnob(climate, 'biomeVariety', 'Biome variety', { min: 0, max: 1, step: 0.02 });
  left.append(climate);

  // aura
  const aura = panel('Aura');
  addKnob(aura, 'auraStrength', 'Influence strength', { min: 0, max: 1, step: 0.02 });
  addKnob(aura, 'auraBalance', 'Blessed ↔ cursed', { min: 0, max: 1, step: 0.02 });
  addKnob(aura, 'magicStrength', 'Raw magic', { min: 0, max: 1, step: 0.02 });
  aura.append(el('div', { class: 'mini', text: 'Turns forests blighted, plains to ash, hills veiled — or the other way, hallowed and calm.' }));
  left.append(aura);

  // places
  const places = panel('Places');
  addKnob(places, 'regionCount', 'Regions wanted', { min: 4, max: 90, step: 1 });
  addKnob(places, 'minRegionCells', 'Smallest region', { min: 2, max: 120, step: 1 });
  addKnob(places, 'settlementDensity', 'Settlements', { min: 0, max: 1, step: 0.02 });
  addKnob(places, 'landmarkDensity', 'Landmarks', { min: 0, max: 1, step: 0.02 });
  addKnob(places, 'dungeonDensity', 'Dungeons & lairs', { min: 0, max: 1, step: 0.02 });
  addKnob(places, 'roadExtras', 'Extra road links', { min: 0, max: 1, step: 0.02 });
  places.append(checkbox('Write a little history', state.opts.history, v => { state.opts.history = v; }));
  left.append(places);
}

// ---------------------------------------------------------------- right panel (layers + lists)
function buildRight() {
  const right = $('right'); right.replaceChildren();
  const w = state.world;

  // layers
  const layerChips = el('div', { class: 'chips layers' });
  const LAYER_NAMES = ['biomes', 'elevation', 'temperature', 'moisture', 'drainage', 'aura', 'magic', 'regions'];
  for (const name of LAYER_NAMES) {
    const chip = el('span', {
      class: 'chip' + (state.layer === name ? ' on' : ''), text: name,
      onclick: () => { state.layer = name; state.layers.regions = name === 'regions'; buildRight(); draw(); },
    });
    layerChips.append(chip);
  }
  const toggles = el('div', { class: 'grid c2' });
  for (const key of ['hillshade', 'rivers', 'roads', 'nodes', 'labels', 'borders', 'aura']) {
    toggles.append(checkbox(key === 'aura' ? 'aura wash' : key, state.layers[key], v => { state.layers[key] = v; draw(); }));
  }
  right.append(panel('Layers', layerChips, toggles));

  if (!w) { right.append(el('p', { class: 'muted small', text: 'Generate a world to see its regions.' })); return; }

  // summary + export
  const stats = el('dl', { class: 'stat-grid' });
  const rows = [
    ['land', `${Math.round(w.stats.landFraction * 100)}%`],
    ['regions', w.stats.regions], ['places', w.stats.nodes], ['roads', w.stats.roads],
    ['rivers', w.stats.rivers], ['lakes', w.stats.lakes], ['landmasses', w.stats.continents],
    ['built in', `${w.stats.ms} ms`],
  ];
  for (const [k, v] of rows) { stats.append(el('dt', { text: k }), el('dd', { text: String(v) })); }
  right.append(panel('This world',
    el('p', { class: 'blurb', text: worldSummary(w) }),
    stats,
    el('div', { class: 'row' },
      button('Export JSON', () => { const json = toJSON(w); download(JSON.stringify(json), `world-${w.seed}.json`); toast(`Saved ~${jsonSizeKB(w)} KB`); }, 'small'),
      button('Export PNG', async () => {
        const url = await toPNG(w, renderWorld, { scale: 4, layers: state.layers, layer: state.layer });
        const a = document.createElement('a'); a.href = url; a.download = `world-${w.seed}.png`; document.body.append(a); a.click(); a.remove();
      }, 'small'),
    ),
  ));

  // regions
  const regionFilter = el('input', { type: 'text', placeholder: 'filter regions…' });
  const regionList = el('div', { class: 'list' });
  const fillRegions = () => {
    const q = regionFilter.value.toLowerCase();
    regionList.replaceChildren();
    for (const r of w.regions) {
      if (q && !(`${r.name} ${r.biomeName} ${r.race}`.toLowerCase().includes(q))) continue;
      const dot = el('span', { class: 'dot', style: { background: BIOMES.find(b => b.key === r.biome).color } });
      regionList.append(el('div', {
        class: 'item' + (state.regionId === r.id ? ' on' : ''), title: r.descriptor,
        onclick: () => openRegion(r.id),
      }, dot, el('span', { class: 'nm', text: r.name }), el('span', { class: 'sub', text: `${r.biomeName} · ${r.cells}` })));
    }
  };
  regionFilter.addEventListener('input', fillRegions);
  fillRegions();
  right.append(panel(`Regions (${w.regions.length})`, el('div', { class: 'filterbar' }, regionFilter), regionList));

  // nodes
  const kinds = [...new Set(w.nodes.map(n => n.kind))].sort();
  const kindSel = select('', [{ value: '', label: 'every kind' }, ...kinds], '', () => fillNodes());
  const nodeFilter = el('input', { type: 'text', placeholder: 'filter places…' });
  const nodeList = el('div', { class: 'list' });
  const fillNodes = () => {
    const q = nodeFilter.value.toLowerCase(), kind = kindSel.value;
    nodeList.replaceChildren();
    let shown = 0;
    for (const n of w.nodes) {
      if (kind && n.kind !== kind) continue;
      if (q && !n.name.toLowerCase().includes(q)) continue;
      if (++shown > 400) break;
      const st = nodeStyle(n.kind);
      nodeList.append(el('div', {
        class: 'item', title: n.tags.join(', '),
        onclick: () => { state.selectedNode = n; if (state.level === 'world') draw(); focusNode(n); },
      }, el('span', { class: 'dot', style: { background: st.fill } }), el('span', { class: 'nm', text: n.name }),
        el('span', { class: 'sub', text: `${n.kind}${w.regions[n.region] ? ' · ' + w.regions[n.region].name : ''}` })));
    }
  };
  nodeFilter.addEventListener('input', fillNodes);
  fillNodes();
  right.append(panel(`Places (${w.nodes.length})`, el('div', { class: 'filterbar' }, nodeFilter), kindSel, nodeList));

  // history
  if (w.history?.length) {
    const scope = state.regionId != null ? w.regions[state.regionId].history : w.history.slice(-14);
    const ul = el('ul');
    for (const h of scope) ul.append(el('li', {}, el('b', { text: String(h.year) + ' ' }), h.text));
    right.append(panel(state.regionId != null ? `History of ${w.regions[state.regionId].name}` : 'Recent history', el('div', { class: 'history' }, ul)));
  }
}

function focusNode(n) {
  if (state.level === 'world') { toast(`${n.name} — ${n.kind}${n.population ? ', about ' + n.population.toLocaleString() + ' people' : ''}`); }
  if (n.region >= 0 && state.level !== 'local') openRegion(n.region);
}

// ---------------------------------------------------------------- boot
function boot() {
  buildLeft();
  buildRight();
  const canvas = $('map');
  canvas.addEventListener('mousemove', onHover);
  canvas.addEventListener('mouseleave', () => { state.hoverRegion = null; });
  canvas.addEventListener('click', onClick);
  new ResizeObserver(() => { if (state.world) draw(); }).observe($('canvasWrap'));
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && state.level !== 'world') back(state.level === 'local' ? 'region' : 'world'); });

  if (location.hash.length > 1) {
    try { Object.assign(state.opts, JSON.parse(decodeURIComponent(location.hash.slice(1)))); } catch { /* ignore a bad hash */ }
    buildLeft();
  }
  generate();
}

// hook for the tests and for poking at a world from the console
window.worldgenDemo = {
  state, generate, openRegion, openLocal, back, draw,
  get world() { return state.world; },
  setOpt(key, value) { state.opts[key] = value; knobRefs[key]?.set?.(value); },
  toJSON: () => toJSON(state.world),
  ready: () => !state.busy && !!state.world,
};

boot();
