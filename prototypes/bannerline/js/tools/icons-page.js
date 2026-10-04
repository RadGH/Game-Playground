// icons.html: the "generate icons from the 3D models" tool (stream C, PLAN §16).
// Shows the baked set (assets/icons/) or renders everything live with the same models the game
// draws; each card has a download link. window.iconForge.renderAll() is what tools/bake-icons.mjs calls.
import * as THREE from 'three';
import { loadLooks } from '../view/unit-looks.js';
import { createIconStudio, createIconLibrary, ICON_TINTS, finishIcon } from '../view/icons.js';
import { loadIdentity } from '../view/identity.js';
import { makeKeep, MAKERS } from '../view/structures.js';
import { makeTurret, makeMine } from '../view/engineer.js';
import { makeHvfBuilding, HVF_KINDS } from '../view/hvf-structures.js';
import { applyGhost } from '../view/unit-looks.js';
import { normalizeCreature } from '../../../../avatar-3d/js/creatures.js';

const $ = id => document.getElementById(id);
const here = p => new URL(p, import.meta.url).href;
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, alpha: true, preserveDrawingBuffer: false });
renderer.setPixelRatio(1); renderer.setSize(512, 512, false);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;

const [looks, catalog, heroesData, library, identity, powersData] = await Promise.all([
  loadLooks(), fetch(here('../../assets/icons/catalog.json')).then(r => r.json()),
  fetch(here('../../data/heroes.json')).then(r => r.json()).catch(() => ({ heroes: {}, skills: {} })), createIconLibrary(), loadIdentity(),
  fetch(here('../../data/powers.json')).then(r => r.json()).catch(() => ({ powers: {} }))]);
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
  for (const [id, pw] of Object.entries(powersData.powers || {})) {
    const [sprite, element] = catalog.powerSprites?.[id] || ['spark', 'arcane'];
    out.push({ kind: 'power', id, label: pw.name || id, make: () => studio.power(id, { sprite, element, frame: catalog.powerFrames?.[pw.kind] || '#ffd24a' }) });
  }
  for (const race of identity.raceIds()) {
    const color = identity.slotColor(0), tint = ICON_TINTS[race] || ICON_TINTS.building;
    out.push({ kind: 'building', id: `${race}.keep`, label: `${identity.race(race).name} Keep`, make: () => { const k = makeKeep(identity, race, color); return studio.object(k.group, { tint, update: dt => k.update(dt) }); } });
    for (const [kind, make] of Object.entries(MAKERS)) out.push({ kind: 'building', id: `${race}.${kind}`, label: `${identity.race(race).name} ${BUILDING_NAMES[kind]}`, make: () => { const b = make(identity, race, color); return studio.object(b.group, { tint, update: dt => b.update(dt) }); } });
  }
  for (const L of [1, 2, 3]) out.push({ kind: 'gadget', id: 'turret_' + L, label: `Bolt Turret ${'I'.repeat(L)}`, make: () => { const t = makeTurret({ level: L, color: identity.slotColor(0) }); t.aim(0.6); t.update(1); return studio.object(t.group, { tint: ICON_TINTS.item, yaw: 0.9, pitch: 0.35, pad: 0.75 }); } });
  out.push({ kind: 'gadget', id: 'mine', label: 'Shrapnel Mine', make: () => { const m = makeMine({}); m.setArmed(true); m.update(0.3); return studio.object(m.group, { tint: ICON_TINTS.item, yaw: 0.5, pitch: 0.7, pad: 0.7 }); } });
  for (const [hero, form] of [['druid', 'wolf'], ['druid', 'briarback']]) out.push({ kind: 'hero', id: `${hero}.${form}`, label: `${hero} (${form})`, make: () => studio.lookIcon(looks.forForm(hero, form)) });
  // Hunters vs Farmers
  const H = catalog.hvf || {}, FARM = ['#6a8a4a', '#1a2410'], HUNT = ['#8a3a2a', '#200c08'];
  const hvfLook = spec => spec.role ? looks.forRole(spec.role, { color: spec.role === 'farmer' ? '#4fa3e8' : '#b23a2a' }) : spec.hvf ? looks.forHvf(...spec.hvf) : { kind: 'creature', spec: normalizeCreature(spec.creature), scale: 1 };
  for (const [id, spec] of Object.entries(H.units || {})) out.push({ kind: 'hvf-unit', id, label: id[0].toUpperCase() + id.slice(1), make: async () => {
    const look = hvfLook(spec);
    if (!spec.ghost) return studio.lookIcon(look, { tint: spec.role === 'hunter' || /hound|hawk/.test(id) ? HUNT : FARM });
    const a = await looks.build(look); applyGhost(a.group, looks.ghostStyle()); const c = await studio.raw(a, { mode: 'bust' }); a.dispose(); return finishIcon(c, { tint: ['#3a5a7a', '#0a1420'] });
  } });
  for (const [id, spec] of Object.entries(H.items || {})) out.push({ kind: 'hvf-item', id, label: id, make: () => spec.object ? (() => { const b = makeHvfBuilding(spec.object, { color: '#b23a2a' }); b.update(0.5); return studio.object(b.group, { tint: ICON_TINTS.item, yaw: 0.5, pitch: 0.6, pad: 0.7 }); })()
    : spec.creature || spec.hvf ? studio.lookIcon(hvfLook(spec), { tint: ICON_TINTS.item }) : studio.item(spec) });
  for (const kind of HVF_KINDS) out.push({ kind: 'hvf-building', id: kind, label: kind, make: () => { const b = makeHvfBuilding(kind, { color: ['kennel', 'lodge', 'snare', 'watchstone'].includes(kind) ? '#b23a2a' : '#4fa3e8', mask: 10 }); b.setReady(false); b.update(0.5); return studio.object(b.group, { tint: ['kennel', 'lodge'].includes(kind) ? HUNT : FARM, yaw: 0.6, pitch: kind === 'fence' || kind === 'wall' || kind === 'hedge' || kind === 'mud' ? 0.6 : 0.45, pad: kind === 'windmill' ? 0.78 : ['barn', 'farmhouse', 'granary', 'hall', 'kennel'].includes(kind) ? 1.05 : kind === 'wall' || kind === 'fence' || kind === 'hedge' ? 1.15 : 0.85 }); } });
  return out;
}
const BUILDING_NAMES = { shop: 'Outfitter', barracks: 'Barracks', drillyard: 'Drill Yard', sanctum: 'Sanctum' };

const KIND_NAMES = { unit: 'Units', hero: 'Heroes', item: 'Item bases', skill: 'Skills', power: 'Powers', building: 'Buildings', gadget: 'Engineer gadgets', 'hvf-unit': 'Hunters vs Farmers: people and animals', 'hvf-building': 'Hunters vs Farmers: buildings', 'hvf-item': 'Hunters vs Farmers: hunter items' };
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
