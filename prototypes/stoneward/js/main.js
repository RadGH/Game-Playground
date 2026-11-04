// Stoneward — the page. Title → New world → choose a landing spot on the globe → the kingdom.
// Wires the sim worker (js/worker/), the chunk stream (js/client/stream.js), the renderer
// (js/render/gl.js) and the camera (js/ui/camera.js). Everything the player does is an order to
// the worker; nothing in the world changes on this side.

import { createLink } from './client/link.js';
import { createStream } from './client/stream.js';
import { saves } from './client/saves.js';
import { createRenderer } from './render/gl.js';
import { createCamera } from './ui/camera.js';
import { BIOMES, BIOME_RGB } from './planet/biomes.js';
import { compileMaterials } from './sim/materials.js';
import { loadNames, kingdomName } from './ui/names.js';
import { lightAt, clockText } from './render/daylight.js';
import { hooks, ui } from './ui/hooks.js';
import { loadBuildings, loadMaterials } from './data.js';
import { createWhatsNew } from '../../../shared/whats-new.js';
import { createCredits } from '../../../shared/credits.js';

const $ = s => document.querySelector(s);
const store = {
  get(k, d) { try { const v = localStorage.getItem('stoneward.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('stoneward.' + k, JSON.stringify(v)); } catch { /* private window */ } },
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const fetchJson = async p => (await fetch(new URL(p, import.meta.url))).json();
const [settingsData, materialsJson, buildingsData] = await Promise.all([fetchJson('../data/worldsettings.json'), loadMaterials(f => fetchJson('../data/' + f)), loadBuildings(f => fetchJson('../data/' + f))]);
const M = compileMaterials(materialsJson);
const KINDS = buildingsData.kinds, GOODS = buildingsData.goods;
const DAY_TICKS = 12000;
const DEV = /[?&]dev\b/.test(location.search);

const canvas = $('#world');
const renderer = createRenderer(canvas, { preserve: /[?&]shots\b/.test(location.search) });
const news = createWhatsNew({ url: new URL('../data/changelog.json', import.meta.url), key: 'stoneward', title: "What's new" });
const credits = createCredits({ game: 'prototypes/stoneward', made: 'Stoneward — by Radley Sustaire, built with Claude.' });
$('#title-extra').append(news.button({ label: "What's new" }), credits.button({ label: 'Credits' }));
loadNames().catch(() => {});

const app = {
  prefs: { dark: 1, bloom: true, graphics: 'high', slowOnAttack: true, sound: true, music: true, ...store.get('prefs', {}) },
  layers: { sites: false, nodes: true, ...store.get('layers', {}) },
  state: 'title', speed: 1, slot: null, settings: null, macro: null, world: null, people: new Map(),
};
let link = null, devTool = null;
window.gameEye = {
  state: () => eyeState(),
  order: o => link?.order(o),
  speed: v => setSpeed(v),
  ask: (q, d) => link?.ask(q, d),
  fly: (x, y, ppc) => app.camera?.flyTo(x, y, ppc, 10),
  found: () => foundHere(),
  view: () => app.stream?.town,
};

// ================================================================ title
function show(id) {
  for (const s of ['title', 'newworld', 'loading']) $('#' + s).classList.toggle('hidden', s !== id);
  $('#hud').classList.toggle('hidden', id !== 'hud');
  $('#landing').classList.toggle('hidden', id !== 'landing');
  app.state = id;
}
async function refreshTitle() {
  const list = (await saves.list()).filter(Boolean);
  $('#btn-continue').classList.toggle('hidden', !list.length);
  $('#btn-load').classList.toggle('hidden', list.length < 2);
}
refreshTitle();
$('#btn-new').addEventListener('click', openNewWorld);
$('#btn-continue').addEventListener('click', async () => { const m = await saves.latest(); if (m) loadSlot(m.slot); });
$('#btn-load').addEventListener('click', () => openLoad());
$('#nw-back').addEventListener('click', () => show('title'));

const CHOICES = [
  { key: 'size', label: 'Size', list: settingsData.sizes },
  { key: 'water', label: 'Water', list: settingsData.water },
  { key: 'shape', label: 'Land', list: settingsData.shapes },
  { key: 'rivals', label: 'Rival kingdoms', list: settingsData.rivalCounts.map(n => ({ id: n, name: String(n) })) },
  { key: 'monsters', label: 'Monsters', list: settingsData.levels },
  { key: 'raids', label: 'Raids', list: settingsData.levels },
  { key: 'disasters', label: 'Disasters', list: settingsData.disasterLevels },
  { key: 'powers', label: 'Ruler powers', list: [{ id: true, name: 'On' }, { id: false, name: 'Off' }] },
];
let pending = null;
function openNewWorld() {
  pending = { ...settingsData.defaults, ...store.get('lastSettings', {}) };
  pending.seed = Math.floor(Math.random() * 1e9);
  pending.name = kingdomName(pending.seed);
  const box = $('#nw-choices'); box.innerHTML = '';
  for (const c of CHOICES) {
    const el = document.createElement('div'); el.className = 'choice';
    el.innerHTML = `<div class="lbl">${c.label}</div><div class="val"><button class="small" aria-label="Previous">‹</button><span></span><button class="small" aria-label="Next">›</button></div>`;
    const span = el.querySelector('span');
    const idx = () => Math.max(0, c.list.findIndex(o => o.id === pending[c.key]));
    const paint = () => { span.textContent = c.list[idx()].name; };
    const [prev, next] = el.querySelectorAll('button');
    prev.addEventListener('click', () => { pending[c.key] = c.list[(idx() - 1 + c.list.length) % c.list.length].id; paint(); });
    next.addEventListener('click', () => { pending[c.key] = c.list[(idx() + 1) % c.list.length].id; paint(); });
    paint(); box.append(el);
  }
  $('#nw-name').value = pending.name;
  $('#nw-seed').value = pending.seed;
  show('newworld');
}
$('#nw-reroll').addEventListener('click', () => { $('#nw-name').value = kingdomName(Math.floor(Math.random() * 1e9)); });
$('#nw-seed-roll').addEventListener('click', () => { $('#nw-seed').value = Math.floor(Math.random() * 1e9); });
$('#nw-go').addEventListener('click', async () => {
  pending.name = $('#nw-name').value.trim() || kingdomName(pending.seed);
  pending.seed = (parseInt($('#nw-seed').value, 10) || 1) >>> 0;
  const { seed, name, ...rest } = pending; store.set('lastSettings', rest);
  // a new world takes the first empty slot, or the oldest one
  const list = await saves.list();
  const free = list.findIndex(x => !x);
  app.slot = free >= 0 ? free : list.reduce((a, m, k) => (m.at < list[a].at ? k : a), 0);
  startWorld({ ...pending });
});

async function openLoad() {
  const list = await saves.list();
  const box = $('#menu-buttons'); box.innerHTML = '<h3 style="margin:0;color:var(--gold)">Your worlds</h3>';
  list.forEach((m, k) => {
    if (!m) return;
    box.append(btn(`${m.name} · ${m.pop ?? 0} people · ${new Date(m.at).toLocaleDateString()}`, () => { closeMenu(); loadSlot(k); }));
  });
  box.append(btn('Back', closeMenu));
  $('#menu').classList.remove('hidden');
}
async function loadSlot(k) {
  const save = await saves.get(k);
  if (!save) { toast('That save could not be read.', 'bad'); return; }
  app.slot = k;
  startWorld(save.settings, save);
}

// ================================================================ the world
async function startWorld(settings, save = null) {
  show('loading');
  $('#loading-text').textContent = save ? 'Loading your world…' : 'Making the world…';
  link?.terminate();
  link = createLink();
  const size = settingsData.sizes.find(s => s.id === settings.size) || settingsData.sizes[2];
  const t0 = performance.now();
  const gen = { seed: settings.seed, width: size.width, water: settings.water, shape: settings.shape, macroCell: settingsData.macroCell, iceRows: settingsData.iceRows };
  const macro = await link.init({ ...settings, ...gen }, materialsJson, { buildings: buildingsData, save });
  renderer.setMacro(macro, BIOME_RGB);
  app.settings = { ...settings, ...gen }; app.macro = macro;
  app.world = { W: macro.width, H: macro.height };
  app.stream = createStream({ link, renderer, M, world: app.world });
  app.stream.onTick(onTick);
  app.camera = createCamera(app.world, canvas);
  app.camera.onTap(onTap);
  app.people = new Map();
  $('#st-kingdom').textContent = settings.name;
  console.info(`[stoneward] world ${macro.mw}x${macro.mh} macro in ${macro.ms.toFixed(0)} ms (page ${(performance.now() - t0).toFixed(0)} ms)`);
  const towns = save?.state?.town?.towns || [];
  if (towns.length) {
    const t = towns[0];
    app.camera.cam.x = t.x; app.camera.cam.y = t.y; app.camera.cam.ppc = 2.5;
    enterHud();
  } else beginLanding();
}

// ---------------------------------------------------------------- landing: pick a spot on the globe
let landPick = null;
function beginLanding() {
  const best = bestSite(app.macro);
  const c = app.camera;
  c.cam.x = best.x; c.cam.y = best.y; c.cam.ppc = c.minPpc() * 1.15;
  app.layers.sites = true;
  setSpeed(0);
  landPick = null;
  $('#landing-title').textContent = `Where will ${app.settings.name} begin?`;
  $('#landing-text').textContent = 'Spin the world and tap a place. Gold glow marks good land: water, wood and hills nearby.';
  $('#land-go').classList.add('hidden'); $('#land-back').classList.add('hidden');
  show('landing');
}
function landingTap(p) {
  if (p.off) return;
  landPick = p;
  app.camera.flyTo(p.x, p.y, 2.2, 1100);
  $('#landing-text').textContent = `${biomeAt(p.x, p.y).name}. Found your keep here?`;
  $('#land-go').classList.remove('hidden'); $('#land-back').classList.remove('hidden');
}
$('#land-back').addEventListener('click', () => { const c = app.camera; c.flyTo(c.cam.x, c.cam.y, c.minPpc() * 1.15, 900); landPick = null; $('#land-go').classList.add('hidden'); $('#land-back').classList.add('hidden'); });
$('#land-go').addEventListener('click', () => foundHere());
async function foundHere() {
  const c = app.camera.cam;
  const r = await link.order({ t: 'found', x: Math.floor(c.x), y: Math.floor(c.y), name: app.settings.name });
  if (!r) { toast('No flat land for a keep here. Try a little way off.', 'bad'); return null; }
  app.layers.sites = store.get('layers', { sites: false }).sites;
  app.camera.flyTo(r.x, r.y, 3, 800);
  enterHud();
  saveNow(true);
  return r;
}
function enterHud() { show('hud'); setSpeed(1); }

function bestSite(m) {
  let bi = 0;
  for (let i = 0; i < m.site.length; i++) if (m.site[i] > m.site[bi]) bi = i;
  return { x: (bi % m.mw + 0.5) * m.macroCell, y: (Math.floor(bi / m.mw) + 0.5) * m.macroCell };
}
function biomeAt(x, y) {
  const m = app.macro, mc = m.macroCell;
  const mx = ((Math.floor(x / mc) % m.mw) + m.mw) % m.mw, my = Math.max(0, Math.min(m.mh - 1, Math.floor(y / mc)));
  return BIOMES[m.biome[my * m.mw + mx]];
}

// ---------------------------------------------------------------- taps
async function onTap(p) {
  if (!app.macro) return;
  if (app.state === 'landing') return landingTap(p);
  if (p.globe) { app.camera.flyTo(p.x, p.y, 2.5, 1000); return; }
  if (devTool) { link.send('order', { order: { t: 'poke', kind: devTool, x: Math.floor(p.x), y: Math.floor(p.y), r: 3 } }); return; }
  for (const h of hooks.tap) if (await h(p, ui)) return;
  if (viaFor) { const id = viaFor; viaFor = null; via = { x: p.x, y: p.y }; setTimeout(() => { via = null; }, 2500); await link.order({ t: 'route.via', route: id, x: p.x, y: p.y }); toast('The route will pass that way.', 'good'); return; }
  if (scoutPick) { scoutPick = false; const r = await link.order({ t: 'scout', x: p.x, y: p.y }); toast(r?.error || 'A scout rides out.', r?.error ? 'bad' : 'good'); return; }
  const t = app.stream?.town, W = app.world.W;
  const near2 = (x, y, r) => Math.hypot(near(x, p.x, W) - p.x, y - p.y) < r;
  const g = (t?.military?.units || []).find(([, , , x, y]) => near2(x, y - 1, 2.2));
  if (g) {
    const [id, guard, kind, , , hp, mode] = g;
    const def = guard ? buildingsData.guards[kind] : buildingsData.monsters[kind];
    sheet(`<b>${esc(def?.name || kind)}</b><br>${guard ? `Guard · ${mode}` : 'Enemy'} · health ${Math.round(hp * 100)}%`, 6000);
    if (guard && ui.app) { /* select it in the Guards tab */ window.dispatchEvent(new CustomEvent('stoneward:pick-guard', { detail: id })); }
    return;
  }
  // a found seam (the square marker with the dotted ring): what it is and a button to mine it
  const tapR = Math.max(3, 16 / app.camera.cam.ppc);
  const node = app.layers.nodes !== false && (t?.nodes || []).map(n => ({ n, d: Math.hypot(near(n[2], p.x, W) - p.x, n[3] - p.y) })).filter(o => o.d < Math.max(tapR, o.n[5] || 0)).sort((a, b) => a.d - b.d)[0]?.n;
  if (node) { showNode(node); return; }
  const cart = (t?.carts || []).find(([x, y]) => near2(x, y - 1, 2.2));
  if (cart) { const r = (t.routes || []).find(rt => true); sheet(`<b>${cart[3] ? 'Cart' : 'Porter'}</b><br>${cart[2] ? 'Carrying goods home' : 'Going back for more'}`, 5000); return; }
  const scout = (t?.scouts || []).find(([x, y]) => near2(x, y - 1, 2.5));
  if (scout) { sheet('<b>Scout</b><br>Riding out to find what lies beyond. Anything found shows on the map.', 5000); return; }
  const b = await link.ask('building', { x: Math.floor(p.x), y: Math.floor(p.y) });
  if (b) return showBuilding(b);
  const w = await link.ask('wall', { x: Math.floor(p.x), y: Math.floor(p.y) });
  if (w) {
    const names = { wood: 'Palisade', stone: 'Stone wall', thick: 'Thick stone wall' };
    const el = sheet(`<b>${names[w.tier]}</b><br>${w.n} m · ${w.towers} towers · ${w.gates} gates<br>Damaged parts are repaired for free once no enemy is near.`, 9000);
    if (w.tier !== 'thick') { const row = document.createElement('div'); row.className = 'row'; row.append(btn(`Upgrade to ${w.tier === 'wood' ? 'stone' : 'thick stone'}`, async () => { const r = await link.order({ t: 'wall.upgrade', id: w.id }); if (r) { toast('Wall upgraded.', 'good'); el.classList.add('hidden'); } })); el.append(row); }
    return;
  }
  const cell = app.stream.cellAt(p.x, p.y);
  const lines = [];
  if (cell) lines.push(`${M.list[cell.ground].name}${cell.mat ? ' · ' + M.list[cell.mat].name : ''}`);
  sheet(`<b>${biomeAt(p.x, p.y).name}</b><br>${lines.join('<br>')}`);
}
const NODE_INFO = {
  iron: ['Iron ore seam', 'Smelted into iron for tools and weapons.'],
  coal: ['Coal seam', 'Fuel for the smelter and the smithy.'],
  granite: ['Good building stone', 'A quarry here gives stone faster than loose rock.'],
  gold: ['Gold seam', 'Coins for the treasury and a goldsmith.'],
  crystal: ['Mana crystals', 'Needed to build magic towers.'],
};
function showNode([id, kind, x, y, rich]) {
  const [name, use] = NODE_INFO[kind] || [kind, ''];
  const mine = Object.entries(KINDS).find(([, k]) => k.node === kind);
  const built = (app.stream?.town?.kinds || {})[mine?.[0]] || 0;
  const el = sheet(`<b>${name}</b> <small>${'★'.repeat(rich || 1)}${rich === 3 ? ' rich' : ''}</small><br>${use}<br><small>The dotted ring is the seam. ${mine ? `Build a ${esc(mine[1].name.toLowerCase())} on it and a road route carries what it digs home — it counts once it reaches a warehouse.` : ''}${rich > 1 ? ' More stars dig faster.' : ''}</small>`, 12000);
  if (mine) {
    const row = document.createElement('div'); row.className = 'row';
    row.append(btn(`Build a ${mine[1].name.toLowerCase()} here`, () => { el.classList.add('hidden'); openTab = 'build'; TABS.build.group = mine[1].group; startGhost(mine[0]); moveGhost({ x, y }); refreshDock(); }));
    el.append(row);
  }
}
function showBuilding(b) {
  const goods = o => Object.entries(o).filter(([, n]) => n > 0).map(([g, n]) => `${GOODS[g]?.icon || ''} ${n}`).join(' · ') || 'nothing';
  let html = `<b>${esc(b.name)}</b>`;
  if (b.state === 'site') {
    html += `<div class="bar"><i style="width:${Math.round(b.progress * 100)}%"></i></div>`;
    html += b.need.length ? `Waiting for ${b.need.map(([g, n]) => `${n} ${GOODS[g]?.name.toLowerCase() || g}`).join(', ')}` : 'Being built';
  } else {
    if (b.level >= 0) html += ` <small>(level ${b.level + 1} of 6)</small>`;
    if (b.missing?.length) html += `<br><span style="color:var(--red)">Missing: ${b.missing.join(', ')}</span>`;
    if (b.input && Object.values(b.input).some(n => n > 0)) html += `<br>Waiting to be worked: ${goods(b.input)}`;
    if (b.remote) html += '<br>Far from town: its goods go home by route.';
    if (b.houses) html += `<br>Home to ${b.residents} of ${b.houses}`;
    if (b.slots) html += `<br>${b.workers} of ${b.slots} workers`;
    if (Object.keys(b.store).length) html += `<br>Holding: ${goods(b.store)}`;
  }
  const el = sheet(html, 9000);
  if (b.kind !== 'keep') {
    const row = document.createElement('div'); row.className = 'row';
    row.append(btn('Demolish', async () => { await link.order({ t: 'demolish', id: b.id }); el.classList.add('hidden'); }));
    if (b.state === 'up') row.append(btn(`Move 🪙${b.moveFee}`, () => { el.classList.add('hidden'); startMove(b); }));
    el.append(row);
  }
}
function sheet(html, ms = 5000) {
  const el = $('#sheet'); el.innerHTML = html; el.classList.remove('hidden');
  clearTimeout(sheet.t); sheet.t = setTimeout(() => el.classList.add('hidden'), ms);
  return el;
}
function toast(text, kind = '', at = null) {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = text;
  if (at && at.x != null && app.camera) { el.classList.add('go'); el.addEventListener('click', () => app.camera.flyTo(at.x, at.y, Math.max(2.5, app.camera.cam.ppc), 800)); }
  $('#toasts').append(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => el.remove(), 4200);
}

// ---------------------------------------------------------------- ticks from the sim
function onTick(m) {
  for (const s of m.said || []) {
    if (s.defeated) { toast(`${s.name} has fallen. Choose a new place to begin again.`, 'bad'); setTimeout(beginLanding, 2500); continue; }
    if (s.text && !s.warn) toast(s.text, s.kind, s.x != null ? { x: s.x, y: s.y } : null);
  }
  for (const h of hooks.tick) h(m, ui);
  const t = m.town;
  if (t && app.state === 'hud') {
    $('#st-pop').textContent = '👪 ' + t.pop;
    $('#st-gold').textContent = '🪙 ' + t.gold;
    if (openTab === 'info' && performance.now() - (onTick.info || 0) > 1000) { onTick.info = performance.now(); TABS.info(); }
  }
}

// ================================================================ dock
const TABS = {
  build: () => {
    // placing something: the panel shrinks to one strip so the map stays clear (play-test 1: on a
    // phone the open list covered the place you were trying to tap)
    if (ghost && !ghost.moving) {
      const k = KINDS[ghost.kind];
      const cost = Object.entries(k.cost || {}).map(([g, n]) => `${GOODS[g]?.icon || g} ${n}`).join(' ') || 'free';
      const p = panel('');
      const strip = document.createElement('div'); strip.className = 'strip';
      strip.innerHTML = `<span class="nm"><b>${esc(k.name)}</b> <small>${cost}</small><br><small>${k.node ? 'Tap near a found seam: it snaps on.' : 'Tap the map to place it. Two fingers move the map.'}</small></span>`;
      strip.append(btn('Change', () => { stopGhost(); TABS.build(); }), btn('Done', () => { stopGhost(); openTab = null; refreshDock(); }));
      p.append(strip);
      return;
    }
    const groups = [['homes', 'Homes'], ['services', 'Services'], ['food', 'Food'], ['industry', 'Industry'], ['extraction', 'Gathering'], ['military', 'Military'], ['magic', 'Magic'], ['transport', 'Transport'], ['beauty', 'Beauty'], ['landmarks', 'Landmarks']];
    const earned = app.stream?.town?.progress?.landmarks || [];
    const cur = TABS.build.group || 'services';
    const p = panel('');
    const row = document.createElement('div'); row.className = 'groups';
    for (const [g, name] of groups) { const b = btn(name, () => { TABS.build.group = g; pages.build = 0; TABS.build(); }); b.classList.toggle('on', g === cur); row.append(b); }
    p.append(row);
    const items = [];
    for (const [id, k] of Object.entries(KINDS)) {
      if (k.group !== cur || k.unique) continue;
      if (k.landmark && !earned.includes(id)) continue;          // landmarks show once earned
      const cost = Object.entries(k.cost || {}).map(([g, n]) => `${GOODS[g]?.icon || g} ${n}`).join(' ') || 'free';
      const b = document.createElement('button'); b.className = 'item';
      b.innerHTML = `<span class="nm">${esc(k.name)}</span><span class="cost">${cost}</span>`;
      const want = (app.stream?.town?.towns?.[0]?.wants || []).find(w => w.kind === id);
      if (want) b.innerHTML += ` <span class="want" title="${esc(want.why)}">★</span>`;
      b.addEventListener('click', () => startGhost(id));
      items.push(b);
    }
    if (!items.length) { p.append(hint('Nothing to build here yet.')); return; }
    p.append(pager(items, 'build', 'grid'));
    p.append(hint('Your town builds most things itself. Place one here to jump the queue. ★ = your town wants one.'));
  },
  roads: () => {
    const tip = { wall: 'Drag to draw a wall. Towers go up at the ends and corners, a gate wherever a road crosses.', firebreak: 'Drag to clear a strip that fire cannot cross.', clear: 'Drag a box the town will never build in.', build: 'Drag a box the town will build in first.', erase: 'Drag over painted boxes to remove them.' };
    const items = [
      ['dirt', 'Dirt path', 'free'], ['gravel', 'Gravel road', '🪨 1 per 8 m'], ['stone', 'Paved road', '🪨 2 per 8 m'],
      ['wall', 'Wall (best you can afford)', '🪵 or 🪨 per metre'], ['firebreak', 'Firebreak', 'free'],
      ['clear', 'Keep clear (paint)', ''], ['build', 'Build here (paint)', ''], ['erase', 'Erase painted area', ''],
    ];
    if (roadTool) {
      // drawing: one strip, the map stays clear
      const it = items.find(i => i[0] === roadTool.tier);
      const p = panel('');
      const strip = document.createElement('div'); strip.className = 'strip';
      strip.innerHTML = `<span class="nm"><b>${it[1]}</b> <small>${it[2]}</small><br><small>${tip[roadTool.tier] || 'Drag on the map to lay it. Two fingers move the map.'}</small></span>`;
      strip.append(btn('Change', () => { stopRoad(); TABS.roads(); }), btn('Done', () => { stopRoad(); openTab = null; refreshDock(); }));
      p.append(strip);
      return;
    }
    const p = panel('');
    const list = [];
    for (const [tier, name, cost] of items) {
      const b = document.createElement('button'); b.className = 'item';
      b.innerHTML = `<span class="nm">${name}</span><span class="cost">${cost}</span>`;
      b.addEventListener('click', () => startRoad(tier));
      list.push(b);
    }
    p.append(pager(list, 'roads', 'grid'));
    p.append(hint('Roads steer where houses grow. Walls keep raiders out.'));
  },
  layers: () => panel(`<h3>Map layers</h3>`, [toggle('Good places to settle', 'sites'), toggle('Found resources', 'nodes')]),
  globe: () => panel(`<h3>Globe</h3><p>Pinch out or press Q to see the whole world.</p>`, [btn('Zoom out to the globe', () => { const c = app.camera; c.flyTo(c.cam.x, c.cam.y, c.minPpc(), 900); }), btn('Back to the ground', () => { const c = app.camera; c.flyTo(c.cam.x, c.cam.y, 2.5, 900); })]),
  info: () => {
    const sub = TABS.info.sub || 'kingdom';
    const head = document.createElement('div'); head.className = 'groups';
    for (const [k, name] of [['kingdom', 'Kingdom'], ['routes', 'Routes'], ...hooks.infoTabs.map(t => [t.id, t.label])]) { const b = btn(name, () => { TABS.info.sub = k; TABS.info(); }); b.classList.toggle('on', k === sub); head.append(b); }
    if (sub === 'routes') return routesPanel(head);
    const extra = hooks.infoTabs.find(t => t.id === sub); if (extra) return extra.render(ui, head);
    const t = app.stream?.town; const m = app.macro;
    const size = settingsData.sizes.find(s => s.width === m.width)?.name || '';
    const p = panel('');
    p.append(head);
    p.insertAdjacentHTML('beforeend', `<h3>${esc(app.settings.name)}</h3><p>${size} world · ${(m.width / 1000).toFixed(0)} km around · ${t?.found ?? 0} finds</p>`);
    const cards = [];
    for (const town of t?.towns || []) {
      const c = document.createElement('div'); c.className = 'card';
      const goods = Object.entries(town.stock).filter(([, n]) => n > 0).map(([g, n]) => `<span>${GOODS[g]?.icon || ''} ${GOODS[g]?.name || g} ${n}</span>`).join('');
      const face = town.mood > 0.75 ? '🙂' : town.mood > 0.45 ? '😐' : '🙁';
      const safe = town.safety == null ? '' : town.safety > 0.6 ? ' · 🛡 safe' : town.safety > 0.3 ? ' · 🛡 risky' : ' · ⚠ unsafe';
      c.innerHTML = `<b>${esc(town.name)}</b><span>👪 ${town.pop} ${town.trend > 0 ? '▲' : town.trend < 0 ? '▼' : '–'} · ${face}${safe} · ${town.short ? 'short: ' + esc(town.short) : 'nothing short'}</span><div class="goods">${goods || 'Empty stores'}</div>`;
      c.addEventListener('click', () => app.camera.flyTo(town.x, town.y, 3, 700));
      cards.push(c);
    }
    p.append(pagerOf(cards, 'towns', innerHeight > 700 ? 3 : 2));
    p.append(btn('Send a scout (🪙 20)', () => { scoutPick = true; toast('Tap where the scout should ride.'); }));
  },
  dev: () => panel('<h3>Test tools</h3><p>Tap the map to use one.</p>', [btn('Night', () => link.send('order', { order: { t: 'time', tod: 0.7 } })), btn('Noon', () => link.send('order', { order: { t: 'time', tod: 0.25 } }))].concat(['fire', 'lava', 'water', null].map(k => { const b = btn(k ? 'Drop ' + k : 'Just look', () => { devTool = k; for (const x of b.parentNode.querySelectorAll('button')) x.classList.toggle('on', x === b); }); b.classList.toggle('on', devTool === k); return b; }))),
};
let openTab = null;
if (DEV) { const b = document.createElement('button'); b.dataset.tab = 'dev'; b.textContent = 'Test'; $('#dock-tabs').append(b); }
$('#dock-tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  openTab = openTab === b.dataset.tab ? null : b.dataset.tab;
  if (openTab !== 'build') stopGhost();
  if (openTab !== 'roads') stopRoad();
  if (hooks.tabs.some(t => t.tool) && !hooks.tabs.some(t => t.id === openTab && t.tool)) { const cur = app.camera?.tool; if (cur && cur.feature) app.camera.setTool(null); }
  refreshDock();
});
function refreshDock() {
  for (const x of $('#dock-tabs').children) x.classList.toggle('on', x.dataset.tab === openTab);
  const p = $('#dock-panel');
  p.classList.toggle('hidden', !openTab);
  if (openTab) (TABS[openTab] || hooks.tabs.find(t => t.id === openTab)?.render)?.(ui);
}
function panel(head, kids = []) { const p = $('#dock-panel'); p.innerHTML = head; p.append(...kids); return p; }
function btn(label, fn) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); return b; }
function hint(text) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = text; return p; }
/** Pages instead of a scrolling list (a scrolling panel blanks the map behind it on some phones):
 *  as many rows as fit the screen, then ‹ 1 / 3 ›. kind 'grid' = two columns on a phone. */
const pages = {};
function pager(items, key, kind = 'list', maxRows = 6) {
  const cols = kind === 'grid' ? (innerWidth >= 600 ? 3 : 2) : 1;
  const rows = Math.max(1, Math.min(maxRows, Math.floor((innerHeight * 0.27) / 50)));
  const per = cols * rows, n = Math.max(1, Math.ceil(items.length / per));
  const pg = pages[key] = Math.min(pages[key] || 0, n - 1);
  const wrap = document.createElement('div'); wrap.className = 'pager';
  const list = document.createElement('div'); list.className = kind === 'grid' ? 'list grid' : 'list';
  if (kind === 'grid') list.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  list.append(...items.slice(pg * per, pg * per + per));
  wrap.append(list);
  if (n > 1) {
    const nav = document.createElement('div'); nav.className = 'row pages';
    const lbl = document.createElement('span'); lbl.textContent = `${pg + 1} / ${n}`;
    nav.append(btn('‹', () => { pages[key] = (pg - 1 + n) % n; refreshDock(); }), lbl, btn('›', () => { pages[key] = (pg + 1) % n; refreshDock(); }));
    wrap.append(nav);
  }
  return wrap;
}
/** A toggle that starts ON (the globe filters). */
function toggleOn(label, key) {
  if (app.layers[key] === undefined) app.layers[key] = true;
  return toggle(label, key);
}
function toggle(label, key) {
  const b = btn(label, () => { app.layers[key] = !app.layers[key]; b.classList.toggle('on', app.layers[key]); store.set('layers', app.layers); });
  b.classList.toggle('on', !!app.layers[key]); return b;
}

// ---------------------------------------------------------------- routes screen
let via = null, viaFor = null, scoutPick = false;
function routesPanel(head) {
  const t = app.stream?.town;
  const p = panel(''); p.append(head);
  const list = t?.routes || [];
  if (!list.length) { p.append(hint('No routes yet. Build a mine on a found seam far from town and a route opens by itself once it is working.')); return; }
  const VEH = buildingsData.vehicles;
  const cards = [];
  for (const r of list) {
    const c = document.createElement('div'); c.className = 'card';
    const mins = r.secs >= 60 ? `${Math.floor(r.secs / 60)}m${String(r.secs % 60).padStart(2, '0')}s` : `${r.secs}s`;
    const danger = r.danger > 0.66 ? '⚠ dangerous' : r.danger > 0.33 ? 'risky' : '✓ safe';
    c.innerHTML = `<b>${esc(r.from)} → ${esc(r.to)}</b><span>${mins} a trip · ${r.carts} × ${esc(r.vname)} (${r.carry} each) · road ${r.road}% · <span style="color:${r.danger > 0.66 ? 'var(--red)' : r.danger > 0.33 ? 'var(--gold)' : 'var(--green)'}">${danger}</span></span><span>Waiting: ${r.waiting} · delivered ${r.delivered}${r.via ? ' · steered' : ''}${r.escorts ? ` · ${r.escorts} escort${r.escorts > 1 ? 's' : ''}` : ''} · priority ${'★'.repeat(r.priority)}</span>`;
    const row = document.createElement('div'); row.className = 'row';
    const kinds = Object.keys(VEH).filter(k => !k.startsWith('_'));
    row.append(
      btn(`+ ${VEH[r.vehicle].name.toLowerCase()} 🪙${VEH[r.vehicle].gold}`, async () => { const res = await link.order({ t: 'route.cart', route: r.id }); if (res?.error) toast(res.error, 'bad'); }),
      btn('−', () => link.order({ t: 'route.less', route: r.id })),
      btn('Vehicle', () => link.order({ t: 'route.vehicle', route: r.id, vehicle: kinds[(kinds.indexOf(r.vehicle) + 1) % kinds.length] })),
      btn(r.via ? 'Clear waypoint' : 'Steer', () => { if (r.via) link.order({ t: 'route.via', route: r.id, x: null }); else { viaFor = r.id; toast('Tap a point the route should pass through.'); } }),
      btn('★', () => link.order({ t: 'route.priority', route: r.id })),
      btn('Escort', async () => { const res = await link.order({ t: 'route.escort', route: r.id }); toast(res?.error || 'A guard rides with the carts.', res?.error ? 'bad' : 'good'); }),
      btn('Show', () => app.camera.flyTo(r.fx, r.fy, 2.5, 700)),
    );
    c.append(row); cards.push(c);
  }
  p.append(pagerOf(cards, 'routes', 2));
}
/** Cards a few at a time (a card is taller than a list row). */
function pagerOf(cards, key, per) {
  const n = Math.max(1, Math.ceil(cards.length / per));
  const pg = pages[key] = Math.min(pages[key] || 0, n - 1);
  const wrap = document.createElement('div'); wrap.className = 'pager';
  wrap.append(...cards.slice(pg * per, pg * per + per));
  if (n > 1) { const nav = document.createElement('div'); nav.className = 'row pages'; const l = document.createElement('span'); l.textContent = `${pg + 1} / ${n}`; nav.append(btn('‹', () => { pages[key] = (pg - 1 + n) % n; refreshDock(); }), l, btn('›', () => { pages[key] = (pg + 1) % n; refreshDock(); })); wrap.append(nav); }
  return wrap;
}

// ---------------------------------------------------------------- build ghost
let ghost = null;
function startGhost(kind) {
  stopRoad();
  const k = KINDS[kind];
  ghost = { kind, w: k.w, h: k.h, x: Math.round(app.camera.cam.x - k.w / 2), y: Math.round(app.camera.cam.y - k.h / 2), ok: false };
  checkGhost();
  app.camera.setTool({
    down: p => moveGhost(p),
    move: p => moveGhost(p),
    up: async () => {
      if (!ghost) return;
      const at = ghost.snap || { x: ghost.x + ghost.w / 2, y: ghost.y + ghost.h / 2 };
      const r = await link.order(KINDS[ghost.kind].landmark ? { t: 'landmark.place', kind: ghost.kind, x: at.x, y: at.y } : { t: 'build', kind: ghost.kind, x: at.x, y: at.y });
      if (r?.error) return;
      if (r) toast(`${KINDS[ghost.kind].name} planned.`, 'good');
    },
  });
  TABS.build();
}
function moveGhost(p) {
  ghost.x = Math.round(p.x - ghost.w / 2); ghost.y = Math.round(p.y - ghost.h / 2);
  const need = KINDS[ghost.kind].node;
  if (need) {
    // a mine snaps to the nearest found seam of its kind
    let best = null, bd = 40;
    for (const [, kind, x, y] of app.stream.town?.nodes || []) { if (kind !== need) continue; const d = Math.hypot(near(x, p.x, app.world.W) - p.x, y - p.y); if (d < bd) { bd = d; best = { x, y }; } }
    ghost.snap = best;
    if (best) { ghost.x = best.x - (ghost.w >> 1); ghost.y = best.y + 3; }
  }
  checkGhost();
}
async function checkGhost() {
  if (!ghost) return;
  const g = ghost, key = g.x + ',' + g.y;
  if (checkGhost.key === key) return; checkGhost.key = key;
  const ok = await link.ask('fits', { x: g.x, y: g.y, w: g.w, h: g.h });
  if (ghost === g && checkGhost.key === key) g.ok = ok;
}
function stopGhost() { if (ghost) { ghost = null; app.camera?.setTool(null); } }

// ---------------------------------------------------------------- move a building (instant, for gold)
function startMove(b) {
  stopRoad();
  ghost = { kind: b.kind, w: b.w, h: b.h, x: b.x, y: b.y, ok: false, moving: b.id };
  toast('Tap where it should go.');
  app.camera.setTool({
    down: p => moveGhost(p), move: p => moveGhost(p),
    up: async () => {
      if (!ghost) return;
      const r = await link.order({ t: 'move', id: ghost.moving, x: ghost.x + ghost.w / 2, y: ghost.y + ghost.h / 2 });
      if (r?.id) toast('Moved.', 'good');
      stopGhost();
    },
  });
}

// ---------------------------------------------------------------- road tool
let roadTool = null;
function startRoad(tier) {
  stopGhost();
  roadTool = { tier, a: null, b: null };
  app.camera.setTool({
    down: p => { roadTool.a = { x: Math.floor(p.x), y: Math.floor(p.y) }; roadTool.b = roadTool.a; },
    move: p => { if (roadTool.a) roadTool.b = { x: Math.floor(p.x), y: Math.floor(p.y) }; },
    up: async (p, e, tap) => {
      const { a, b } = roadTool; roadTool.a = roadTool.b = null;
      if (!a || tap) return;
      const tier = roadTool.tier;
      if (tier === 'wall') { const r = await link.order({ t: 'wall', x0: a.x, y0: a.y, x1: b.x, y1: b.y }); if (r) toast(`${r.tier === 'wood' ? 'Palisade' : r.tier === 'stone' ? 'Stone wall' : 'Thick wall'} built: ${r.towers} towers, ${r.gates} gates.`, 'good'); return; }
      if (tier === 'firebreak') { await link.order({ t: 'firebreak', x0: a.x, y0: a.y, x1: b.x, y1: b.y }); return; }
      if (tier === 'clear' || tier === 'build' || tier === 'erase') { await link.order({ t: 'zone', kind: tier, x0: a.x, y0: a.y, x1: b.x, y1: b.y }); return; }
      const n = await link.order({ t: 'road', x0: a.x, y0: a.y, x1: b.x, y1: b.y, tier });
      if (!n) toast('No road could go there.', 'bad');
    },
    cancel: () => { roadTool.a = roadTool.b = null; },
  });
  TABS.roads();
}
function stopRoad() { if (roadTool) { roadTool = null; app.camera?.setTool(null); } }

// ================================================================ menu, saves, settings
let menuSpeed = null;    // the ☰ menu pauses the game; closing it puts the speed back
$('#btn-menu').addEventListener('click', () => {
  if (app.state === 'hud' && menuSpeed == null) { menuSpeed = app.speed; setSpeed(0); }
  const box = $('#menu-buttons'); box.innerHTML = '';
  box.append(
    btn('Back to the game', closeMenu),
    btn('Save now', async () => { const ok = await saveNow(); toast(ok ? 'Saved.' : 'Could not save.', ok ? 'good' : 'bad'); closeMenu(); }),
    btn('Load a world', () => openLoad()),
    btn('Settings', openSettings),
    btn('Report a problem', () => ui.report?.()),
    btn('New world', async () => { await saveNow(); closeMenu(); openNewWorld(); }),
    btn('Leave to the title', async () => { await saveNow(); closeMenu(); link?.terminate(); link = null; app.camera = null; show('title'); refreshTitle(); startTitlePlanet(); }),
  );
  $('#menu').classList.remove('hidden');
});
function closeMenu() { $('#menu').classList.add('hidden'); if (menuSpeed != null) { if (app.state === 'hud' && app.speed === 0) setSpeed(menuSpeed); menuSpeed = null; } }
$('#menu').addEventListener('click', e => { if (e.target.id === 'menu') closeMenu(); });

function openSettings() {
  const box = $('#menu-buttons'); box.innerHTML = '<h3 style="margin:0;color:var(--gold)">Settings</h3>';
  const opt = (label, key, values) => {
    const b = btn('', () => { const i = values.findIndex(v => v[0] === app.prefs[key]); app.prefs[key] = values[(i + 1) % values.length][0]; store.set('prefs', app.prefs); paint(); });
    const paint = () => { b.textContent = `${label}: ${(values.find(v => v[0] === app.prefs[key]) || values[0])[1]}`; };
    paint(); return b;
  };
  box.append(
    opt('Graphics', 'graphics', [['high', 'High'], ['low', 'Low (no lighting)']]),
    opt('Glow', 'bloom', [[true, 'On'], [false, 'Off']]),
    opt('Night', 'dark', [[1, 'Dark'], [0.6, 'Dim'], [0.3, 'Light']]),
    opt('Slow down when attacked', 'slowOnAttack', [[true, 'On'], [false, 'Off']]),
    opt('Sound', 'sound', [[true, 'On'], [false, 'Off']]),
    opt('Music', 'music', [[true, 'On'], [false, 'Off']]),
    btn('Back', closeMenu),
  );
}

async function saveNow(quiet) {
  if (!link || app.slot == null || (app.state !== 'hud' && !quiet)) return false;
  const save = await link.ask('save');
  if (!save) return false;
  const meta = { name: app.settings.name, pop: app.stream?.town?.pop ?? 0, size: app.settings.size };
  const ok = await saves.put(app.slot, save, meta);
  // small worlds also ride the cloud save (signed in): big ones stay on this device
  try { const json = JSON.stringify({ save, meta }); if (json.length < 900000) { store.set('slot.' + app.slot, { save, meta }); ui.cloud?.saveSoon?.(); } } catch { /* too big for local storage */ }
  return ok;
}
setInterval(() => { if (app.state === 'hud') saveNow(true); }, 120000);
document.addEventListener('visibilitychange', () => { if (document.hidden && app.state === 'hud') saveNow(true); });

// ================================================================ speed
const SPEEDS = [0, 1, 2, 4, 8];
function setSpeed(v) {
  app.speed = v; link?.send('speed', { speed: v });
  $('#btn-speed').textContent = v ? v + '×' : '❚❚';
  $('#btn-speed').classList.toggle('on', v === 0);
}
$('#btn-speed').addEventListener('click', () => setSpeed(SPEEDS[(SPEEDS.indexOf(app.speed ?? 1) + 1) % SPEEDS.length]));
window.addEventListener('keydown', e => {
  if (app.state !== 'hud' || e.target.closest?.('input,select,textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); setSpeed(app.speed ? 0 : (app.lastSpeed || 1)); }
  else if (/^Digit[1-5]$/.test(e.code)) setSpeed(SPEEDS[+e.code.slice(5) - 1]);
  else if (e.code === 'Escape') { stopGhost(); stopRoad(); app.camera?.setTool(null); openTab = null; refreshDock(); }
  else for (const h of hooks.keys) if (h(e, ui)) break;
  if (app.speed) app.lastSpeed = app.speed;
});

// ================================================================ features
Object.assign(ui, {
  app, toast, panel, btn, hint, pager, pagerOf: (...a) => pagerOf(...a), sheet, esc, near: (...a) => near(...a), M, data: buildingsData, settingsData,
  link: () => link, camera: () => app.camera,
  setTool: t => { stopGhost(); stopRoad(); app.camera?.setTool(t); },
  setSpeed: v => setSpeed(v),
  capture: () => new Promise(res => { app.captureNext = res; setTimeout(() => { if (app.captureNext === res) { app.captureNext = null; res(null); } }, 500); }),
  importCloudSlots: async () => { for (let k = 0; k < saves.SLOTS; k++) { const v = store.get('slot.' + k, null); if (v?.save) await saves.put(k, v.save, v.meta); } },
  refreshDock: () => refreshDock(),
  closeMenu: () => closeMenu(),
  // the map toggles and globe buttons, for the Views tab
  mapToggles: () => [toggle('Good places to settle', 'sites'), toggle('Found resources', 'nodes'), toggleOn('Monster lairs & camps', 'lairs'),
    toggleOn('Globe: towns', 'gTowns'), toggleOn('Globe: borders', 'gBorders'), toggleOn('Globe: night lights', 'gLights'), toggleOn('Globe: routes & lines', 'gRoutes'), toggleOn('Globe: armies', 'gArmies'),
    btn('Whole world', () => { const c = app.camera; c.flyTo(c.cam.x, c.cam.y, c.minPpc(), 900); }), btn('Back to the ground', () => { const c = app.camera; c.flyTo(c.cam.x, c.cam.y, 2.5, 900); })],
});
Object.defineProperty(ui, 'openTab', { get: () => openTab });
await import('./features/index.js');
for (const t of hooks.tabs) { const b = document.createElement('button'); b.dataset.tab = t.id; b.textContent = t.label; $('#dock-tabs').insertBefore(b, $('#dock-tabs [data-tab="info"]')); }

// ================================================================ drawing
let last = performance.now();
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}
function near(x, cx, W) { const d = x - cx; if (d > W / 2) x -= W; if (d < -W / 2) x += W; return x; }
function sprites(cam) {
  const out = [];
  const t = app.stream.town; if (!t) return out;
  const W = app.world.W;
  // ease from where each walker was drawn toward its latest position, so they glide instead of hopping
  const next = new Map();
  for (const [x, y, carry, job, build, id] of t.people) {
    const o = app.people.get(id);
    let px = x, py = y;
    if (o) { let dx = x - o.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W; if (Math.abs(dx) + Math.abs(y - o.y) < 6) { px = o.x + dx * 0.25; py = o.y + (y - o.y) * 0.25; } }
    next.set(id, { x: px, y: py });
    const sx = near(px, cam.x, W) - 0.5, sy = py - 2;
    const shirt = build ? [0.85, 0.62, 0.25] : job ? [0.35, 0.45, 0.7] : [0.62, 0.32, 0.28];
    out.push([sx, sy + 0.9, 1, 1.1, ...shirt, 1]);
    out.push([sx + 0.1, sy, 0.8, 0.9, 0.93, 0.78, 0.62, 1]);
    if (carry) out.push([sx + 0.6, sy + 0.5, 0.7, 0.7, 0.55, 0.38, 0.2, 1]);
  }
  app.people = next;
  // carts: a box with wheels (porters are people with packs); scouts on horseback
  for (const [x, y, load, cart] of t.carts || []) {
    const sx = near(x, cam.x, W);
    if (cart) { out.push([sx - 1.2, y - 1.6, 2.4, 1.3, 0.55, 0.38, 0.22, 1]); out.push([sx - 1, y - 0.4, 0.7, 0.7, 0.2, 0.15, 0.1, 1]); out.push([sx + 0.4, y - 0.4, 0.7, 0.7, 0.2, 0.15, 0.1, 1]); if (load) out.push([sx - 1, y - 2.3, 2, 0.8, 0.35, 0.3, 0.28, 1]); }
    else { out.push([sx - 0.5, y - 1.1, 1, 1.1, 0.5, 0.4, 0.3, 1]); out.push([sx - 0.4, y - 2, 0.8, 0.9, 0.93, 0.78, 0.62, 1]); if (load) out.push([sx - 1.1, y - 1.6, 0.8, 1, 0.45, 0.3, 0.18, 1]); }
  }
  for (const [x, y] of t.scouts || []) {
    const sx = near(x, cam.x, W);
    out.push([sx - 1.2, y - 1.2, 2.4, 1.1, 0.42, 0.28, 0.18, 1]);
    out.push([sx - 0.4, y - 2.4, 0.8, 1.2, 0.25, 0.5, 0.3, 1]);
  }
  for (const h of hooks.sprites) h(cam, out, ui);
  return out;
}
const NODE_COL = { iron: [0.78, 0.45, 0.32], coal: [0.15, 0.15, 0.17], granite: [0.75, 0.75, 0.78], gold: [1, 0.82, 0.25], crystal: [0.65, 0.45, 1] };
function overlay(cam) {
  const out = [];
  const W = app.world.W;
  const t = app.stream.town;
  if (t && (app.layers.nodes ?? true)) {
    // found resource nodes: a ring and a marker, readable from far out
    const s = Math.max(1, 3 / cam.ppc);
    for (const [, kind, x, y, rich, r] of t.nodes || []) {
      const c = NODE_COL[kind] || [1, 1, 1];
      const nx = near(x, cam.x, W);
      if (cam.ppc > 1.2) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; out.push([nx + Math.cos(a) * r - 0.5, y + Math.sin(a) * r - 0.5, 1, 1, ...c, 0.55]); }
      out.push([nx - 2 * s, y - 2 * s, 4 * s, 4 * s, 0, 0, 0, 0.5]);
      out.push([nx - 1.5 * s, y - 1.5 * s, 3 * s, 3 * s, ...c, 0.95]);
      for (let k = 1; k < rich; k++) out.push([nx - 1.5 * s + (k - 1) * 2 * s, y + 2 * s, 1.4 * s, 1.4 * s, 1, 0.9, 0.5, 0.95]);
    }
  }
  if (via) out.push([near(via.x, cam.x, W) - 2, via.y - 2, 4, 4, 1, 0.9, 0.3, 0.6]);
  for (const h of hooks.overlay) h(cam, out, ui);
  if (ghost) {
    const c = ghost.ok ? [0.4, 0.9, 0.4, 0.35] : [0.95, 0.3, 0.25, 0.35];
    out.push([near(ghost.x, cam.x, W), ghost.y, ghost.w, ghost.h, ...c]);
  }
  for (const [kind, x0, y0, x1, y1] of app.stream.town?.walls?.zones || []) out.push([near(x0, cam.x, W), y0, x1 - x0, y1 - y0, ...(kind === 'clear' ? [0.95, 0.4, 0.3, 0.16] : [0.35, 0.8, 0.95, 0.16])]);
  if (roadTool?.a && roadTool.b && ['clear', 'build', 'erase'].includes(roadTool.tier)) {
    const { a, b } = roadTool;
    out.push([near(Math.min(a.x, b.x), cam.x, W), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), ...(roadTool.tier === 'clear' ? [0.95, 0.4, 0.3, 0.3] : roadTool.tier === 'build' ? [0.35, 0.8, 0.95, 0.3] : [1, 1, 1, 0.25])]);
  } else if (roadTool?.a && roadTool.b) {
    const { a, b } = roadTool;
    let dx = b.x - a.x; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    const n = Math.max(1, Math.max(Math.abs(dx), Math.abs(b.y - a.y)));
    for (let k = 0; k <= n; k++) out.push([near(a.x + dx * k / n, cam.x, W), a.y + (b.y - a.y) * k / n, 2, 2, 0.95, 0.85, 0.5, 0.45]);
  }
  return out;
}
// ---------------------------------------------------------------- the globe's marks (owner: borders, towns sized by
// population, night lights on the dark side, routes and train lines, armies — each with a filter)
/** The sun on the globe sits behind the camera, a little up and to the left (play-test 1: "move the
 *  shadow cast on the planet to behind the planet instead of the side"), so the face you look at is
 *  lit and only its far rim falls into shade. Night still shows: town lights glow on the globe
 *  whenever it is night in the sim. */
function sunDir() { return [-0.32, 0.3, 0.9]; }
let SUN = [0, 0, 1];
function globeMarks(cam, globe, dpr) {
  SUN = sunDir(cam);
  const nightNow = lightAt(app.stream?.clock?.tod ?? 0.25, app.prefs.dark).nightness > 0.35;
  const out = []; if (globe < 0.3 || !app.stream?.town) return out;
  const W = app.world.W, H = app.world.H, vw = canvas.width, vh = canvas.height;
  const R = W * cam.ppc * dpr / (2 * Math.PI);
  const th = (cam.y / H - 0.5) * Math.PI, cl = Math.cos(th), sl = Math.sin(th);
  const lon0 = cam.x / W * Math.PI * 2;
  const project = (x, y) => {
    const lon = x / W * Math.PI * 2 - lon0, lat = (0.5 - y / H) * Math.PI;
    const a = [Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon)];
    const n = [a[0], a[1] * cl + a[2] * sl, -a[1] * sl + a[2] * cl];
    if (n[2] <= 0.02) return null;
    return { x: vw / 2 + n[0] * R, y: vh / 2 - n[1] * R, n, night: nightNow };
  };
  const dot = (p, s, c, a) => out.push([p.x - s / 2, p.y - s / 2, s, s, ...c, a * globe]);
  const L = app.layers, t = app.stream.town, px = dpr;
  const kingdoms = [{ color: [1, 0.85, 0.35], towns: (t.towns || []).map(x => [x.x, x.y, x.pop]) }, ...(t.rivals?.list || []).map(r => ({ color: r.color, towns: r.towns }))];
  for (const k of kingdoms) for (const [x, y, pop] of k.towns) {
    const p = project(x, y); if (!p) continue;
    if (L.gBorders !== false) { const rr = (40 + Math.sqrt(pop) * 6) / W * Math.PI * 2 * R; for (let i = 0; i < 20; i++) { const ang = i / 20 * Math.PI * 2; dot({ x: p.x + Math.cos(ang) * rr, y: p.y + Math.sin(ang) * rr }, 2 * px, k.color, 0.6); } }
    if (L.gLights !== false && p.night) for (let i = 0; i < 3; i++) dot(p, (6 + Math.sqrt(pop) * 0.9) * px * (1 + i * 0.6), [1, 0.75, 0.35], 0.35 / (i + 1));
    if (L.gTowns !== false) { const s = (3 + Math.sqrt(pop) * 0.35) * px; dot(p, s + 2 * px, [0, 0, 0], 0.7); dot(p, s, k.color, 1); }
  }
  if (L.gRoutes !== false) for (const r of t.routes || []) {
    if (r.fx == null || r.tx == null) continue;
    let dx = r.tx - r.fx; if (dx > W / 2) dx -= W; if (dx < -W / 2) dx += W;
    for (let i = 0; i <= 12; i++) { const p = project(r.fx + dx * i / 12, r.fy + (r.ty - r.fy) * i / 12); if (p) dot(p, 2 * px, [0.95, 0.85, 0.5], 0.8); }
  }
  if (L.gRoutes !== false) for (const ln of t.trains?.lines || []) for (const [x, y] of (ln.stations || []).map(s => [s.x, s.y])) { const p = project(x, y); if (p) dot(p, 4 * px, [0.4, 0.8, 1], 0.9); }
  if (L.gArmies !== false) for (const [x, y] of t.military?.armies || []) { const p = project(x, y); if (p) dot(p, 4 * px, [0.95, 0.2, 0.15], 0.95); }
  return out;
}
/** Screen-pixel marks on the flat map from features (enemy arrows at the screen edge). */
function edgeMarks(cam, dpr) { SUN = sunDir(); const out = []; for (const h of hooks.screen) h(cam, out, ui, dpr, canvas.width, canvas.height); return out; }
// zoomed out over the flat map (no chunks drawn), towns still glow at night
function farLights(cam, L) {
  const out = []; const t = app.stream?.town; if (!t || cam.ppc > 0.6) return out;
  const W = app.world.W;
  const list = [...(t.towns || []).map(x => [x.x, x.y, x.pop]), ...(t.rivals?.list || []).flatMap(r => r.towns)];
  for (const [x, y, pop] of list) {
    const r = (10 + Math.sqrt(pop) * 2.2);
    const nx = near(x, cam.x, W);
    if (L.nightness > 0.2) for (let i = 0; i < 3; i++) out.push([nx - r * (1 + i), y - r * (1 + i), r * 2 * (1 + i), r * 2 * (1 + i), 1, 0.72, 0.35, 0.22 * L.nightness / (i + 1)]);
    const s = Math.max(2, 5 / cam.ppc);
    out.push([nx - s, y - s, s * 2, s * 2, 1, 0.85, 0.4, 0.9]);
  }
  return out;
}

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const dpr = resize();
  if (app.camera && app.state !== 'title') {
    app.camera.update(dt, now);
    const cam = app.camera.cam;
    const globe = app.camera.globeAmount();
    const v = { w: canvas.clientWidth, h: canvas.clientHeight };
    const chunks = cam.ppc > 0.45 && globe < 1 ? app.stream.visible(cam, v) : [];
    const chunkAlpha = Math.max(0, Math.min(1, (cam.ppc - 0.45) / 0.4));
    const clock = app.stream.clock;
    const L = lightAt(clock ? clock.tod : 0.2, app.prefs.dark);
    const spr = cam.ppc > 0.8 && globe < 1 ? sprites(cam) : [];
    const ov = globe < 0.5 ? overlay(cam) : []; if (cam.ppc <= 0.6 && globe < 0.5) ov.push(...farLights(cam, L));
    renderer.draw({ cam, dpr, chunks, chunkAlpha, globe, sites: app.layers.sites, night: 1, ambient: L.ambient, nightness: L.nightness, bloom: app.prefs.bloom ? 0.8 : 0, lighting: app.prefs.graphics !== 'low', sprites: spr, overlay: ov, screen: globe < 0.5 ? edgeMarks(cam, dpr) : globeMarks(cam, globe, dpr), sun: SUN, globeDark: L.nightness * 0.65 });
    if (app.state === 'hud' && now - (frame.clockT || 0) > 500) {
      frame.clockT = now;
      if (clock) $('#st-clock').textContent = clockText(clock.tick, DAY_TICKS);
      $('#st-where').textContent = globe > 0.5 ? 'The whole world' : biomeAt(cam.x, cam.y).name;
    }
  } else if (app.macro) {
    const c = { x: (now * 0.02) % app.world.W, y: app.world.H / 2, ppc: 2 * Math.PI * Math.min(canvas.clientWidth, canvas.clientHeight) * 0.38 / app.world.W };
    renderer.draw({ cam: c, dpr, chunks: [], globe: 1 });
  } else renderer.draw({ cam: { x: 0, y: 0, ppc: 1 }, dpr });
  if (app.captureNext) { const res = app.captureNext; app.captureNext = null; try { const c = document.createElement('canvas'); const sc = Math.min(1, 640 / canvas.width); c.width = canvas.width * sc; c.height = canvas.height * sc; c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.6)); } catch { res(null); } }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// a planet behind the title screen, so the first thing anyone sees is a world
async function startTitlePlanet() {
  const l = createLink();
  const macro = await l.init({ seed: 20261103, width: 4096, water: 0.45, shape: 'continents', macroCell: settingsData.macroCell, iceRows: settingsData.iceRows }, materialsJson, { idle: true });
  l.terminate();
  if (app.state === 'title') { renderer.setMacro(macro, BIOME_RGB); app.macro = macro; app.world = { W: macro.width, H: macro.height }; }
}
startTitlePlanet();

function eyeState() {
  const c = app.camera?.cam;
  const t = app.stream?.town;
  return {
    screen: app.state,
    world: app.macro ? { size: app.macro.width, mw: app.macro.mw, mh: app.macro.mh, seed: app.macro.seed } : null,
    camera: c ? { x: Math.round(c.x), y: Math.round(c.y), ppc: +c.ppc.toFixed(3), globe: +app.camera.globeAmount().toFixed(2) } : null,
    chunks: app.stream ? { loaded: app.stream.loaded, pending: app.stream.pending } : null,
    town: t ? { pop: t.pop, gold: t.gold, stock: t.stock, kinds: t.kinds, towns: t.towns.map(x => ({ name: x.name, x: x.x, y: x.y, pop: x.pop })) } : null,
    clock: app.stream?.clock ? { tick: app.stream.clock.tick, speed: app.stream.clock.speed } : null,
  };
}
