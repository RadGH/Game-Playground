// World Build — the workflow page: pick a brief and a seed, build it in a Web Worker (stage pictures arrive as each
// stage finishes), read the checks and the numbers, click any spot, and fly over it in 3D (the streamed fly view).
//
// URL: ?brief=<file without .json>&seed=N builds at once; &fly=x,z opens the fly view there after the build;
// &bench=1 also flies the benchmark spots and leaves the numbers in window.__wbBench (tools/stream-bench.mjs).
// window.worldbuild = { ask, info, fly } for tests and tools.

import { STAGES } from './pipeline.js';
import { describeBrief, normaliseBrief } from './brief.js';

const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v != null) e.setAttribute(k, v); } for (const k of kids) e.append(k); return e; };
const store = { get: k => { try { return localStorage.getItem('worldbuild:' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('worldbuild:' + k, v); } catch { /* private window */ } } };
const params = new URLSearchParams(location.search);
const phone = matchMedia('(max-width: 700px)').matches;
const fmt = v => (typeof v === 'number' ? v.toLocaleString('en', { maximumFractionDigits: 1 }) : v);

// ---------------------------------------------------------------- the worker and its replies
let worker = null, rid = 0, workerReady = Promise.resolve();
const waiting = new Map();
let onStage = () => {};
function startWorker() {
  worker?.terminate();
  waiting.clear();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  let markReady;
  workerReady = new Promise(r => { markReady = r; });
  worker.onmessage = e => {
    const m = e.data;
    if (m.type === 'ready') return markReady();
    if (m.type === 'stage') return onStage(m);
    const w = waiting.get(m.rid);
    if (!w) return;
    waiting.delete(m.rid);
    if (m.type === 'error') w.reject(new Error(m.message)); else w.resolve(m);
  };
  worker.onerror = e => { setStatus(`The builder stopped: ${e.message || 'unknown error'}`); for (const w of waiting.values()) w.reject(new Error('worker stopped')); waiting.clear(); };
}
function ask(type, msg = {}, transfer = []) {
  const id = ++rid, w = worker;
  return new Promise((resolve, reject) => { waiting.set(id, { resolve, reject }); workerReady.then(() => w.postMessage({ ...msg, type, rid: id }, transfer)); });
}

// ---------------------------------------------------------------- the brief picker
const setStatus = t => { $('#status').textContent = t; };
let briefs = [], current = null, info = null, selected = 'brief', pics = {};
async function loadBriefs() {
  briefs = (await (await fetch(new URL('../data/briefs/index.json', import.meta.url))).json()).briefs;
  const sel = $('#brief');
  for (const b of briefs) sel.append(el('option', { value: b.file }, b.name));
  const want = params.get('brief');
  const pick = (want && briefs.find(b => b.file === want + '.json')) || briefs.find(b => b.file === store.get('brief')) || (phone ? briefs.find(b => b.phone) : briefs[0]);
  sel.value = pick.file;
  await showBrief();
  const seed = params.get('seed') ?? store.get('seed:' + pick.file);
  if (seed != null && seed !== '') $('#seed').value = seed;
}
async function showBrief() {
  const file = $('#brief').value;
  current = await (await fetch(new URL('../data/briefs/' + file, import.meta.url))).json();
  const b = briefs.find(x => x.file === file);
  $('#brief-note').textContent = b.note + (phone && !b.phone ? ' A phone may run out of memory on this one.' : '');
  $('#seed').value = store.get('seed:' + file) ?? current.seed;
  const lines = describeBrief(normaliseBrief(current));
  $('#brief-lines').replaceChildren(...lines.slice(1).map(l => el('li', {}, l)));
}

// ---------------------------------------------------------------- steps, tabs, pictures
const CAPTION = {
  brief: 'The brief as a sketch: regions, mountains, wanted rivers and lakes, the sea, the pinned map and its roads out.',
  shape: 'Heights in metres, mountain ranges, lakes, the sea, and rivers that only run downhill.',
  regions: 'Regions with borders on ridges and rivers, ground types, and each region\'s level band.',
  places: 'Towns (gold), shrines (blue), camps (red), dungeons (violet) and landmarks (white), placed by rules.',
  roads: 'Roads and paths over the cheapest ground, 14% at most, with bridges (white) and fords (blue).',
  detail: 'Ground as drawn: woods, fields, houses and set pieces.',
  checks: 'The checks: every problem ringed in red (none when the world passes).',
};
function drawSteps(state = {}) {
  $('#steps').replaceChildren(...STAGES.map(s => el('li', { class: state[s.id]?.cls || '' }, el('b', {}, `${s.n} ${s.label}`), el('span', {}, state[s.id]?.text || 'waiting'))));
}
function drawTabs() {
  $('#map-tabs').replaceChildren(...STAGES.filter(s => s.id !== 'edits').map(s => el('button', { type: 'button', role: 'tab', 'aria-selected': String(s.id === selected), disabled: pics[s.id] ? null : '', onclick: () => select(s.id) }, s.label)));
}
function select(id) {
  selected = id;
  drawTabs();
  for (const c of document.querySelectorAll('.wb-pic')) c.classList.toggle('on', c.dataset.stage === id);
  paintBig();
}
function paintPic(canvas, pic, { labels = true } = {}) {
  canvas.width = pic.w; canvas.height = pic.h;
  const cx = canvas.getContext('2d');
  cx.putImageData(new ImageData(new Uint8ClampedArray(pic.rgba.buffer, pic.rgba.byteOffset, pic.rgba.byteLength), pic.w, pic.h), 0, 0);
  if (!labels) return;
  const fs = Math.max(11, Math.round(pic.w / 70));
  cx.font = `600 ${fs}px system-ui, sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.lineJoin = 'round';
  for (const L of pic.labels) {
    const y = L.kind === 'region' ? L.y : L.y - fs;
    cx.lineWidth = Math.max(3, fs / 3.2); cx.strokeStyle = 'rgba(10,12,16,0.85)'; cx.strokeText(L.text, L.x, y);
    cx.fillStyle = L.kind === 'region' ? '#ffeccb' : L.kind === 'water' ? '#bfe0ff' : '#ffffff'; cx.fillText(L.text, L.x, y);
  }
}
function paintBig() { const pic = pics[selected]; if (pic) paintPic($('#map'), pic); placeMarker(); }
function addPicCard(id, pic, ms) {
  pics[id] = pic;
  let card = document.querySelector(`.wb-pic[data-stage="${id}"]`);
  const s = STAGES.find(x => x.id === id);
  if (!card) {
    card = el('button', { type: 'button', class: 'wb-pic', 'data-stage': id, onclick: () => { select(id); $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } },
      el('div', { class: 'wb-pichead' }, `${s.n} ${s.label}`, el('span', {}, '')), el('canvas', {}), el('p', {}, CAPTION[id] || ''));
    const order = STAGES.findIndex(x => x.id === id);
    const after = [...document.querySelectorAll('.wb-pic')].find(c => STAGES.findIndex(x => x.id === c.dataset.stage) > order);
    $('#pics').insertBefore(card, after || null);
  }
  card.querySelector('.wb-pichead span').textContent = `${fmt(ms)} ms`;
  paintPic(card.querySelector('canvas'), pic, { labels: false });
  drawTabs();
  if (id === selected || !pics[selected]) select(id);
}

// ---------------------------------------------------------------- build
let building = false;
async function build() {
  if (building) return;
  building = true;
  $('#go').disabled = true;
  closeFly();
  const file = $('#brief').value, seed = Number($('#seed').value) >>> 0;
  store.set('brief', file); store.set('seed:' + file, String(seed));
  history.replaceState(null, '', `?brief=${file.replace(/\.json$/, '')}&seed=${seed}${params.get('fly') ? '&fly=' + params.get('fly') : ''}${params.get('bench') ? '&bench=1' : ''}`);
  pics = {}; info = null; spot = null;
  $('#pics').replaceChildren();
  $('#report').replaceChildren(el('li', { class: 'muted small' }, 'Building…'));
  $('#numbers').replaceChildren(el('p', { class: 'muted small' }, 'Building…'));
  $('#report-badge').textContent = ''; $('#report-badge').className = 'badge';
  $('#spot').replaceChildren(el('h3', {}, 'A spot'), el('p', { class: 'small muted' }, 'Click anywhere on the map to see what is there, then fly over it in 3D.'));
  const state = {};
  STAGES.forEach((s, i) => { state[s.id] = i === 0 ? { cls: 'run', text: 'working' } : null; });
  drawSteps(state);
  startWorker();
  const t0 = performance.now();
  onStage = m => {
    state[m.id] = { cls: 'done', text: `${fmt(m.ms)} ms` };
    const next = STAGES[STAGES.findIndex(s => s.id === m.id) + 1];
    if (next && !state[next.id]) state[next.id] = { cls: 'run', text: 'working' };
    drawSteps(state);
    addPicCard(m.id, m.pic, m.ms);
    setStatus(`${STAGES.find(s => s.id === m.id).label} done · ${Math.round((performance.now() - t0) / 1000)} s`);
  };
  setStatus('Building in the background…');
  try {
    info = await ask('build', { brief: current, seed, mpp: phone ? 6 : 4 });
    state.edits = { cls: 'done', text: `${fmt(info.stages.find(s => s.id === 'edits')?.ms ?? 0)} ms` };
    drawSteps(state);
    showReport(info); showNumbers(info);
    setStatus(`${info.briefName}, seed ${info.seed}: built in ${Math.round(info.ms / 100) / 10} s — ${info.report.ok ? 'every check passes' : 'some checks fail'}`);
    window.worldbuild.info = info;
    const flyAt = params.get('fly');
    if (flyAt) { const [x, z] = flyAt.split(',').map(Number); await openFlyAt(x, z); }
    if (params.get('bench')) await bench();
  } catch (err) {
    setStatus(`Could not build: ${err.message}`);
    $('#report').replaceChildren(el('li', { class: 'fail' }, el('p', {}, err.message)));
  } finally { building = false; $('#go').disabled = false; }
}

function showReport(info) {
  const R = info.report;
  const nPass = R.checks.filter(c => c.pass).length;
  $('#report-badge').textContent = `${nPass} of ${R.checks.length}`;
  $('#report-badge').className = 'badge ' + (R.ok ? 'ok' : 'bad');
  const items = R.checks.map(c => el('li', { class: c.pass ? 'pass' : 'fail' },
    el('div', { class: 'wb-rhead' }, el('span', { class: 'wb-mark' }, c.pass ? 'PASS' : 'FAIL'), c.title),
    el('p', {}, c.summary),
    ...(c.problems.length ? [el('ul', {}, ...c.problems.slice(0, 12).map(p => el('li', {}, el('button', { type: 'button', onclick: () => { select('checks'); showSpot(p.at[0], p.at[1]); $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, `${p.text} — ${p.at.map(Math.round).join(', ')}`))))] : [])));
  if (R.leftovers?.length) items.push(el('li', { class: 'fail' }, el('div', { class: 'wb-rhead' }, el('span', { class: 'wb-mark' }, 'NOTE'), 'Hand fixes left over'), el('p', {}, R.leftovers.map(l => l.text).join(' · '))));
  if (info.startMoved) items.push(el('li', { class: 'pass' }, el('div', { class: 'wb-rhead' }, el('span', { class: 'wb-mark' }, 'NOTE'), 'The start moved'), el('p', {}, `The brief's start was in water or on a cliff; it moved ${info.startMoved.by} m to ${info.startMoved.to.join(', ')}.`)));
  $('#report').replaceChildren(...items);
}
function showNumbers(info) {
  const N = info.numbers;
  const num = (v, label) => el('div', { class: 'wb-num' }, el('b', {}, fmt(v)), el('span', {}, label));
  const places = N.places;
  $('#numbers').replaceChildren(
    num(`${N.sizeKm[0]} × ${N.sizeKm[1]} km`, 'world'),
    num(places.town || 0, 'towns'), num(N.houses, `houses (${fmt(N.newHouses)} new)`),
    num((places.camp || 0) + (places.dungeon || 0), `camps and dungeons`), num(places.shrine || 0, 'shrines'), num(places.landmark || 0, 'landmarks'),
    num(`${fmt(N.roadKm.road)} km`, `roads (${fmt(N.newRoadKm.road)} new)`), num(`${fmt(N.roadKm.trail)} km`, `paths (${fmt(N.newRoadKm.trail)} new)`), num(`${N.bridges} + ${N.fords}`, 'bridges + fords'),
    num(N.trees, `trees (${fmt(N.giants)} giants, median ${N.medianTreeM} m)`), num(`${fmt(N.riverKm)} km`, `rivers (${N.rivers} + ${N.streams} streams)`), num(N.lakes, 'lakes'),
    el('div', { class: 'wb-regions' }, ...info.regions.map(r => el('div', {}, el('span', {}, r.name + (r.pinned ? ' (pinned)' : '')), el('span', {}, `levels ${r.levels[0]}-${r.levels[1]}`)))),
  );
}

// ---------------------------------------------------------------- a spot on the map
let spot = null;
function placeMarker() {
  const m = $('#marker');
  if (!spot || !info) { m.hidden = true; return; }
  const B = info.bounds;
  m.style.left = `${(spot.x - B.minX) / (B.maxX - B.minX) * 100}%`; m.style.top = `${(spot.z - B.minZ) / (B.maxZ - B.minZ) * 100}%`; m.hidden = false;
}
async function showSpot(x, z) {
  if (!info) return;
  spot = { x, z };
  placeMarker();
  const p = await ask('pick', { x, z });
  const row = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
  $('#spot').replaceChildren(
    el('h3', {}, p.near && p.near.d < 60 ? p.near.name : p.region || 'A spot'),
    el('dl', {},
      ...row('Where', `${Math.round(x)}, ${Math.round(z)}`), ...row('Height', `${fmt(p.y)} m`), ...row('Ground', p.water ? `${p.water.kind}, ${fmt(p.water.depth)} m deep` : p.biome),
      ...row('Region', p.region || '–'), ...row('Levels', `${p.levels[0]}-${p.levels[1]}`), ...row('Slope', `${p.slope}°${p.walkable ? '' : ', too steep or deep to walk'}`),
      ...row('Nearest', p.near ? `${p.near.name} (${p.near.kind}), ${p.near.d} m` : '–'), ...(p.road ? row('Road', 'on a road') : [])),
    el('button', { type: 'button', class: 'wb-primary', onclick: () => openFlyAt(x, z) }, 'Fly here in 3D'));
}
$('#map').addEventListener('click', e => {
  if (!info) return;
  const r = e.currentTarget.getBoundingClientRect(), B = info.bounds;
  showSpot(B.minX + (e.clientX - r.left) / r.width * (B.maxX - B.minX), B.minZ + (e.clientY - r.top) / r.height * (B.maxZ - B.minZ));
});

// ---------------------------------------------------------------- the fly view
let fly = null;
async function openFlyAt(x, z) {
  if (!info) return;
  closeFly();
  $('#fly').hidden = false; $('#fly-loading').hidden = false;
  document.body.style.overflow = 'hidden';
  const { openFly } = await import('./fly/fly.js');
  const flyInfo = { bounds: info.bounds, sea: info.sea, species: info.species, seed: info.seed, towns: Object.entries(info.townsAt).filter(([id]) => info.towns.includes(id)).map(([id, at]) => ({ id, at })) };
  fly = await openFly({ canvas: $('#fly-canvas'), panel: $('#fly-panel'), ask, info: flyInfo, at: [x, z], quality: $('#fly-quality').value, onClose: () => { fly = null; } });
  window.worldbuild.fly = fly;
  fly.settle(30000).then(() => { $('#fly-loading').hidden = true; });
}
function closeFly() { if (fly) fly.close(); fly = null; $('#fly').hidden = true; document.body.style.overflow = ''; }
$('#fly-back').addEventListener('click', closeFly);
$('#fly-quality').addEventListener('change', () => { if (!fly) return; const [x, z] = fly.stats().at; openFlyAt(x, z); });

// ---------------------------------------------------------------- the benchmark (tools/stream-bench.mjs)
async function bench() {
  const spots = benchSpots();
  const out = [];
  for (const s of spots) {
    if (!fly) await openFlyAt(s.at[0], s.at[1]);
    fly.goTo(s.at[0], s.at[1], { height: s.height ?? 40, yaw: s.yaw ?? 0.6, pitch: s.pitch ?? -0.2 });
    const t0 = performance.now();
    const settled = await fly.settle(90000);
    await new Promise(r => setTimeout(r, 1500));
    out.push({ name: s.name, at: s.at, settled, settleMs: Math.round(performance.now() - t0), ...fly.stats() });
  }
  window.__wbBench = { brief: info.briefId, seed: info.seed, quality: $('#fly-quality').value, userAgent: navigator.userAgent, spots: out };
  setStatus('Benchmark done.');
}
function benchSpots() {
  const t = info.places.filter(p => p.kind === 'town' && !p.pinned)[0];
  const start = info.start;
  const B = info.bounds;
  return [
    { name: 'Pinned town (Larkford)', at: [start[0] + 60, start[1] + 90], height: 35, yaw: 2.6 },
    t ? { name: `New town (${t.name})`, at: [t.at[0] + 70, t.at[1] + 70], height: 35, yaw: 0.8 } : null,
    { name: 'Deep woods', at: findPlace('oldwood') || [start[0] + 1500, start[1] - 900], height: 30 },
    { name: 'Mountains', at: [(B.minX + B.maxX) / 2 - 600, B.minZ + 450], height: 60, pitch: -0.1 },
    { name: 'High over the middle', at: [(B.minX + B.maxX) / 2, (B.minZ + B.maxZ) / 2], height: 700, pitch: -0.55 },
  ].filter(Boolean);
}
function findPlace(theme) { const r = info.regions.find(x => x.theme === theme && !x.pinned); const p = r && info.places.find(q => q.region === r.id && q.kind !== 'town'); return p?.at; }

// ---------------------------------------------------------------- start
window.worldbuild = { ask, info: null, fly: null, bench };
$('#brief').addEventListener('change', showBrief);
$('#reseed').addEventListener('click', () => { $('#seed').value = String(Math.floor(Math.random() * 99999)); });
$('#go').addEventListener('click', build);
drawSteps(); drawTabs();
await loadBriefs();
if (params.get('brief')) build();
