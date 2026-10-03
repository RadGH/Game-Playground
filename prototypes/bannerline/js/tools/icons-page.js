// icons.html: the "generate icons from the 3D models" tool (stream C, PLAN §16).
// Shows the baked set (assets/icons/) or renders everything live with the same models the game
// draws; each card has a download link. window.iconForge.renderAll() is what tools/bake-icons.mjs calls.
import * as THREE from 'three';
import { loadLooks } from '../view/unit-looks.js';
import { createIconStudio, createIconLibrary } from '../view/icons.js';

const $ = id => document.getElementById(id);
const here = p => new URL(p, import.meta.url).href;
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1); renderer.setSize(512, 512, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

const [looks, catalog, heroesData, library] = await Promise.all([
  loadLooks(), fetch(here('../../assets/icons/catalog.json')).then(r => r.json()),
  fetch(here('../../data/heroes.json')).then(r => r.json()).catch(() => ({ heroes: {}, skills: {} })), createIconLibrary()]);
const studio = createIconStudio(renderer, { looks, size: catalog.size || 128 });

/** Every icon the game needs, as { kind, id, label, make() }. */
function jobs() {
  const out = [];
  for (const id of looks.unitIds()) out.push({ kind: 'unit', id, label: looks.forUnit(id).name, make: () => studio.unit(id) });
  for (const id of looks.heroIds()) out.push({ kind: 'hero', id, label: heroesData.heroes?.[id]?.name || id[0].toUpperCase() + id.slice(1), make: () => studio.hero(id) });
  for (const [id, spec] of Object.entries(catalog.items || {})) out.push({ kind: 'item', id, label: id.replace(/_/g, ' '), make: () => studio.item(spec) });
  const owner = {}; for (const [hid, h] of Object.entries(heroesData.heroes || {})) for (const sid of Object.values(h.slots || {})) owner[sid] = hid;
  for (const [id, s] of Object.entries(heroesData.skills || {})) {
    const element = s.element || 'physical';
    out.push({ kind: 'skill', id, label: s.name || id, make: () => studio.skill(id, { hero: owner[id] || null, element, sprite: catalog.skillSprites?.[id] || catalog.elementSprites?.[element] || 'spark' }) });
  }
  return out;
}

const KIND_NAMES = { unit: 'Units', hero: 'Heroes', item: 'Item bases', skill: 'Skills' };
function gallery(list, images) {
  const byKind = new Map(); for (const j of list) { if (!byKind.has(j.kind)) byKind.set(j.kind, []); byKind.get(j.kind).push(j); }
  $('gallery').replaceChildren(...[...byKind].map(([kind, js]) => {
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${KIND_NAMES[kind] || kind}<small>${js.length}</small></h2>`;
    const grid = document.createElement('div'); grid.className = 'icon-grid';
    for (const j of js) {
      const card = document.createElement('div'); card.className = 'icon-card'; card.dataset.kind = kind; card.dataset.id = j.id;
      const src = images.get(kind + ':' + j.id);
      if (src) { const img = new Image(); img.src = src; img.alt = j.label; card.append(img); }
      else { const m = document.createElement('div'); m.className = 'missing'; m.textContent = 'not baked'; card.append(m); }
      const name = document.createElement('span'); name.textContent = j.label; card.append(name);
      if (src) { const a = document.createElement('a'); a.href = src; a.download = `${j.id}.png`; a.textContent = 'download'; card.append(a); }
      grid.append(card);
    }
    sec.append(grid); return sec;
  }));
}

async function renderAll() {
  const list = jobs(), images = new Map(), out = {};
  let i = 0;
  for (const j of list) {
    $('state').textContent = `Rendering ${++i} / ${list.length}: ${j.label}`;
    try { const c = await j.make(); const url = c.toDataURL('image/png'); images.set(j.kind + ':' + j.id, url); (out[j.kind] ||= {})[j.id] = url; }
    catch (e) { console.error('icon', j.kind, j.id, e); }
  }
  gallery(list, images); $('state').textContent = `Rendered ${images.size} icons`;
  return out;
}
function showBaked() {
  const list = jobs(), images = new Map();
  for (const j of list) { const u = library.url(j.kind, j.id); if (u) images.set(j.kind + ':' + j.id, u + '?v=' + (library.index.date || '')); }
  gallery(list, images);
  $('state').textContent = images.size ? `${images.size} baked icons (${library.index.date || 'undated'})` : 'Nothing baked yet: press Re-render all, or run tools/bake-icons.mjs';
}

$('render').onclick = async () => { $('render').disabled = true; await renderAll(); $('render').disabled = false; };
$('source').onchange = () => $('source').value === 'live' ? $('render').click() : showBaked();
const params = new URLSearchParams(location.search);
if (params.get('live') === '1') { $('source').value = 'live'; await renderAll(); } else showBaked();
$('render').disabled = false;
window.iconForge = { renderAll, jobs: () => jobs().map(j => ({ kind: j.kind, id: j.id, label: j.label })), studio, ready: true };
