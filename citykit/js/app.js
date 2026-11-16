// City Kit review page: every recipe in the kit, with sliders for its settings, the 4 view turns, zoom, and the
// day → night cycle — so Radley can judge and adjust the look without playing the game.
import { installTooltips } from '../../shared/tooltip.js';
import { fmt } from '../../shared/format.js';
import { Baker, composite } from './bake.js';
import { TILE_W, TILE_H, toScreen, headingOfDir } from './iso.js';
import { RECIPES, GROUPS, build, defaults, STYLE_IDS, STYLES } from './kit/buildings.js';
import './kit/all.js';

installTooltips();
const $ = s => document.querySelector(s);
const baker = new Baker({ scale: 2 });
const state = { id: null, params: {}, rot: 0, zoom: 'fit', time: 0, view: 'catalog', anim: null, dir: 3, playing: true };
const cache = new Map();   // bake key → pair

// ---------- catalog list ----------
function items() { return Object.entries(RECIPES).map(([id, r]) => ({ id, ...r })); }
function drawList() {
  const q = $('#search').value.trim().toLowerCase();
  const host = $('#groups'); host.replaceChildren();
  const pick = $('#pick'); pick.replaceChildren();
  for (const g of GROUPS) {
    const list = items().filter(i => i.group === g.id && (!q || (i.name + ' ' + i.id + ' ' + g.label).toLowerCase().includes(q)));
    if (!list.length) continue;
    const sec = document.createElement('section'); sec.className = 'ck-group';
    sec.innerHTML = `<h3>${g.label}</h3>`;
    const og = document.createElement('optgroup'); og.label = g.label;
    for (const it of list) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ck-item' + (it.id === state.id ? ' on' : '');
      b.innerHTML = `${it.name}<small>${sizeText(it)}</small>`;
      b.addEventListener('click', () => select(it.id));
      sec.append(b);
      const o = document.createElement('option'); o.value = it.id; o.textContent = it.name; if (it.id === state.id) o.selected = true; og.append(o);
    }
    host.append(sec); pick.append(og);
  }
}
const sizeText = it => it.size ? `${it.size[0]}×${it.size[1]} tiles` : it.anims ? `${Object.keys(it.anims).length} animations` : '';

// ---------- settings ----------
function select(id) {
  state.id = id; state.params = defaults(id); state.anim = RECIPES[id].anims ? Object.keys(RECIPES[id].anims)[0] : null;
  try { localStorage.setItem('citykit:last', id); } catch { /* private window */ }
  drawList(); drawParams(); redraw();
}
function drawParams() {
  const r = RECIPES[state.id];
  $('#title').textContent = r.name;
  $('#blurb').textContent = r.blurb || '';
  const host = $('#params'); host.replaceChildren();
  const add = (label, valueText, input) => {
    const d = document.createElement('div'); d.className = 'ck-param';
    d.innerHTML = `<div class="head"><span>${label}</span><b>${valueText}</b></div>`; d.append(input); host.append(d); return d;
  };
  // style
  const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Style');
  for (const s of STYLE_IDS) { const o = document.createElement('option'); o.value = s; o.textContent = STYLES[s].label; if (s === state.params.style) o.selected = true; sel.append(o); }
  sel.addEventListener('change', () => { state.params.style = sel.value; redraw(); });
  if (!r.noStyle) add('Style', '', sel);
  for (const k of r.params || []) {
    const inp = document.createElement('input'); inp.type = 'range'; inp.min = k.min; inp.max = k.max; inp.step = k.step ?? 1; inp.value = state.params[k.key];
    inp.setAttribute('aria-label', k.label);
    const row = add(k.label, valueOf(k, state.params[k.key]), inp);
    inp.addEventListener('input', () => { state.params[k.key] = +inp.value; row.querySelector('b').textContent = valueOf(k, +inp.value); redraw(); });
  }
  if (r.anims) {
    const a = document.createElement('select'); a.setAttribute('aria-label', 'Animation');
    for (const name of Object.keys(r.anims)) { const o = document.createElement('option'); o.value = name; o.textContent = r.anims[name].label || name; if (name === state.anim) o.selected = true; a.append(o); }
    a.addEventListener('change', () => { state.anim = a.value; redraw(); });
    add('Animation', '', a);
    const dirs = document.createElement('input'); dirs.type = 'range'; dirs.min = 0; dirs.max = (r.dirs || 8) - 1; dirs.value = state.dir; dirs.setAttribute('aria-label', 'Facing');
    const row = add('Facing', dirName(state.dir, r.dirs || 8), dirs);
    dirs.addEventListener('input', () => { state.dir = +dirs.value; row.querySelector('b').textContent = dirName(state.dir, r.dirs || 8); redraw(); });
  }
  $('#copied').textContent = '';
}
const valueOf = (k, v) => k.names ? k.names[v] : fmt(v) + (k.unit ? ' ' + k.unit : '');
const DIRN = ['up', 'up-right', 'right', 'down-right', 'down', 'down-left', 'left', 'up-left'];
const dirName = (d, n) => n === 8 ? DIRN[d] : `${d + 1} of ${n}`;

// ---------- baking + drawing ----------
function keyOf(extra = '') { return JSON.stringify([state.id, state.params, state.rot, extra]); }
function pairFor(id, params, rot, anim = null, frame = 0, dir = 0) {
  const k = JSON.stringify([id, params, rot, anim, frame, dir]);
  if (!cache.has(k)) {
    const g = build(id, params);
    // a facing sprite is the same at every view turn (directions are measured on screen), so bake it at turn 0
    if (anim && g.userData.pose) g.userData.pose(anim, frame / RECIPES[id].anims[anim].frames, headingOfDir(dir, RECIPES[id].dirs || 8, 0));
    else if (g.userData.face) g.userData.face(headingOfDir(dir, RECIPES[id].dirs || 8, 0));
    const pair = baker.bakePair(g, { rot: g.userData.pose || g.userData.face ? 0 : rot, shadow: true });
    cache.set(k, pair);
    if (cache.size > 600) cache.delete(cache.keys().next().value);
  }
  return cache.get(k);
}

const cv = $('#view'); const ctx = cv.getContext('2d');
let raf = 0, t0 = performance.now();
function redraw() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); updateLabels(); }
function paint(now) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawSky(W, H);
  if (state.view === 'sheet') paintSheet(W, H); else paintOne(W, H, now);
}
function drawSky(W, H) {
  const t = state.time;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, mix('#8fb6d8', '#070a18', t)); g.addColorStop(1, mix('#d8e4ec', '#141a2e', t));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function groundTiles(cx, cy, w, d, z) {
  // the lot's tiles as diamonds, plus a ring of neighbour tiles, so size reads at a glance
  for (let x = -1; x < w + 1; x++) for (let y = -1; y < d + 1; y++) {
    const inside = x >= 0 && y >= 0 && x < w && y < d;
    const { sx, sy } = toScreen(x - w / 2 + 0.5, y - d / 2 + 0.5, 0, state.rot);
    const px = cx + sx * z, py = cy + sy * z;
    ctx.beginPath(); ctx.moveTo(px, py - TILE_H / 2 * z); ctx.lineTo(px + TILE_W / 2 * z, py); ctx.lineTo(px, py + TILE_H / 2 * z); ctx.lineTo(px - TILE_W / 2 * z, py); ctx.closePath();
    ctx.fillStyle = mix(inside ? '#6d8a5e' : '#58704c', '#1a2230', state.time * 0.85); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 1; ctx.stroke();
  }
}
function paintOne(W, H, now) {
  const r = RECIPES[state.id]; if (!r) return;
  const [w, d] = r.size || [1, 1];
  let frame = 0;
  if (r.anims && state.anim) {
    const a = r.anims[state.anim];
    frame = Math.floor(((now - t0) / 1000) * (a.fps || 10)) % a.frames;
    if (a.once && Math.floor(((now - t0) / 1000) * (a.fps || 10)) >= a.frames) frame = a.frames - 1;
  }
  const pair = pairFor(state.id, state.params, state.rot, state.anim, frame, state.dir);
  // Fit: the picture fills ~80% of the stage; otherwise 1× = the game's own size
  const zoom = state.zoom === 'fit' ? Math.min(4, (W * 0.8) / (pair.w / baker.scale), (H * 0.8) / (pair.h / baker.scale)) : state.zoom;
  const z = zoom / baker.scale;
  const cx = W / 2 + (pair.w / 2 - pair.ax) * z, cy = H / 2 + (pair.ay - pair.h / 2) * z;
  groundTiles(cx, cy, w, d, zoom);
  composite(ctx, pair, cx, cy, state.time, z);
  $('#facts').textContent = factLine(r, pair);
  if (r.anims) raf = requestAnimationFrame(paint);
}
function paintSheet(W, H) {
  // rows: the 4 view turns; columns: the first numeric setting at evenly spaced values
  const r = RECIPES[state.id]; if (!r) return;
  const k = (r.params || [])[0];
  const vals = k ? spread(k.min, k.max, Math.min(6, Math.round((k.max - k.min) / (k.step || 1)) + 1)) : [null];
  const cols = vals.length, rows = 4;
  const cellW = W / cols, cellH = H / rows;
  const pairs = [];
  let maxW = 1, maxH = 1;
  for (let rot = 0; rot < 4; rot++) for (const v of vals) {
    const p = { ...state.params }; if (k) p[k.key] = v;
    const pair = pairFor(state.id, p, rot, state.anim, 0, state.dir);
    pairs.push(pair); maxW = Math.max(maxW, pair.w); maxH = Math.max(maxH, pair.h);
  }
  const z = Math.min(cellW * 0.9 / maxW, cellH * 0.85 / maxH, (state.zoom === 'fit' ? 4 : state.zoom) / baker.scale);
  let i = 0;
  ctx.font = '12px system-ui'; ctx.fillStyle = state.time > 0.5 ? '#c8d0dc' : '#1d2430';
  for (let rot = 0; rot < 4; rot++) for (let c = 0; c < cols; c++) {
    const pair = pairs[i++];
    const x = c * cellW + cellW / 2, y = rot * cellH + cellH * 0.86;
    composite(ctx, pair, x, y, state.time, z);
    if (rot === 0 && k) {
      const label = cellW > 120 ? `${k.label}: ${valueOf(k, vals[c])}` : valueOf(k, vals[c]);
      ctx.textAlign = 'center'; ctx.fillText(label, c * cellW + cellW / 2, cellW > 120 ? 16 : 30); ctx.textAlign = 'left';
      if (c === 0 && cellW <= 120) ctx.fillText(k.label, 8, 14);
    }
  }
  $('#facts').textContent = `Every view turn (rows) × ${k ? k.label.toLowerCase() : 'one setting'} (columns).`;
}
const spread = (a, b, n) => n <= 1 ? [a] : Array.from({ length: n }, (_, i) => Math.round(a + (b - a) * i / (n - 1)));
function factLine(r, pair) {
  const bits = [];
  if (r.size) bits.push(`Lot ${r.size[0]}×${r.size[1]} tiles`);
  if (r.zone) bits.push({ R: 'Residential zone', C: 'Commercial zone', I: 'Industrial zone' }[r.zone]);
  if (state.params.floors) bits.push(`${state.params.floors} storeys`);
  bits.push(`Picture ${Math.round(pair.w / baker.scale)}×${Math.round(pair.h / baker.scale)} px at 1×`);
  return bits.join(' · ');
}
function mix(a, b, t) {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const A = p(a), B = p(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`;
}
function updateLabels() {
  $('#rot-label').textContent = `View ${state.rot + 1} of 4`;
  $('#time-label').textContent = state.time < 0.2 ? 'Noon' : state.time < 0.5 ? 'Dusk' : state.time < 0.8 ? 'Evening' : 'Night';
  $('#status').textContent = `${Object.keys(RECIPES).length} items`;
}

// ---------- controls ----------
$('#search').addEventListener('input', drawList);
$('#pick').addEventListener('change', e => select(e.target.value));
$('#rot-l').addEventListener('click', () => { state.rot = (state.rot + 3) % 4; redraw(); });
$('#rot-r').addEventListener('click', () => { state.rot = (state.rot + 1) % 4; redraw(); });
document.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
  state.zoom = b.dataset.zoom === 'fit' ? 'fit' : +b.dataset.zoom; document.querySelectorAll('[data-zoom]').forEach(x => x.classList.toggle('on', x === b)); redraw();
}));
$('#time').addEventListener('input', e => { state.time = +e.target.value; redraw(); });
$('#reseed').addEventListener('click', () => { state.params.seed = Math.floor(Math.random() * 9999) + 1; redraw(); });
$('#reset').addEventListener('click', () => { state.params = defaults(state.id); drawParams(); redraw(); });
$('#copy').addEventListener('click', async () => {
  const p = { ...state.params };
  const text = `City Kit: ${RECIPES[state.id].name} (${state.id})\n` + Object.entries(p).map(([k, v]) => `${k}: ${v}`).join('\n') + `\nview: ${state.rot + 1}`;
  const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false);
  $('#copied').textContent = ok ? 'Copied. Paste it to Claude with what to change.' : text;
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
function showView(v) {
  state.view = v;
  document.querySelectorAll('[data-view]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.view === v)));
  const sceneOn = v === 'scene';
  document.body.classList.toggle('scene-on', sceneOn);
  $('#scene').hidden = !sceneOn;
  try { localStorage.setItem('citykit:view', v); } catch { /* private window */ }
  if (sceneOn) openScene(); else { scene?.stop(); redraw(); }
}

// ---------- the Scene ----------
let scene = null;
async function openScene() {
  if (!scene) {
    const { Scene } = await import('./scene.js');
    scene = new Scene($('#sc-view'), { update: sceneUi });
    window.citykit.scene = scene;
    wireScene();
  }
  scene.start(); sceneUi();
}
const TIME_NAMES = [[0.08, 'Noon'], [0.2, 'Afternoon'], [0.3, 'Dusk'], [0.7, 'Night'], [0.8, 'Dawn'], [0.92, 'Morning'], [1.01, 'Noon']];
function sceneUi() {
  if (!scene) return;
  const i = scene.info();
  $('#sc-charges').textContent = i.charges;
  const sb = $('#sc-strike'); sb.disabled = i.charges <= 0 && !i.arming; sb.classList.toggle('armed', i.arming);
  $('#sc-view').classList.toggle('aiming', i.arming);
  $('#sc-sound').textContent = i.sound ? 'Sound on' : 'Sound off';
  $('#sc-pause').textContent = scene.paused ? 'Carry on' : 'Pause';
  $('#sc-time').value = scene.time; $('#sc-time-label').textContent = TIME_NAMES.find(([t]) => scene.time < t)[1];
  const bits = [`${i.creatures} creatures`, `${i.killed} killed`, `Walls ${i.walls} of ${i.wallsTotal}`];
  if (i.arming) bits.push('Tap the map to call the strike');
  else if (i.lastStrike) bits.push(`Last strike: ${i.lastStrike.killed} killed`);
  $('#sc-status').textContent = bits.join(' · ');
}
function wireScene() {
  $('#sc-pause').addEventListener('click', () => { scene.paused = !scene.paused; sceneUi(); });
  document.querySelectorAll('[data-speed]').forEach(b => b.addEventListener('click', () => { scene.speed = +b.dataset.speed; document.querySelectorAll('[data-speed]').forEach(x => x.classList.toggle('on', x === b)); }));
  $('#sc-strike').addEventListener('click', () => scene.armStrike());
  $('#sc-swarm').addEventListener('click', () => scene.swarm());
  $('#sc-reset').addEventListener('click', () => scene.reset());
  $('#sc-rot-l').addEventListener('click', () => { scene.cam.rot = (scene.cam.rot + 3) % 4; });
  $('#sc-rot-r').addEventListener('click', () => { scene.cam.rot = (scene.cam.rot + 1) % 4; });
  $('#sc-sound').addEventListener('click', async () => { const snd = await import('./world/sound.js'); if (snd.soundOn()) { scene.muted = !scene.muted; snd.setMuted(scene.muted); $('#sc-sound').textContent = scene.muted ? 'Sound off' : 'Sound on'; } else { await snd.startSound(); sceneUi(); } });
  $('#sc-time').addEventListener('input', e => { scene.time = +e.target.value; $('#sc-auto').checked = scene.autoTime = false; sceneUi(); });
  $('#sc-auto').addEventListener('change', e => { scene.autoTime = e.target.checked; });
  document.querySelectorAll('[data-weather]').forEach(c => c.addEventListener('change', () => {
    scene.weather.set(c.dataset.weather, c.checked);
    if (c.dataset.weather === 'storm' && c.checked) document.querySelector('[data-weather="rain"]').checked = true;
  }));
  const RATE = [[0, 'Calm'], [0.5, 'Light'], [1, 'Normal'], [2, 'Heavy'], [3.01, 'Relentless']];
  $('#sc-rate').addEventListener('input', e => { scene.spawnRate = +e.target.value; $('#sc-rate-label').textContent = RATE.find(([v]) => scene.spawnRate <= v)[1]; });
  $('#sc-shake').addEventListener('change', e => { scene.fx.shakeScale = e.target.checked ? 1 : 0; });
}
window.addEventListener('keydown', e => {
  if (e.target.matches('input[type=text]')) return;
  const sc = state.view === 'scene';
  if (e.code === 'KeyQ') $(sc ? '#sc-rot-l' : '#rot-l').click(); else if (e.code === 'KeyE') $(sc ? '#sc-rot-r' : '#rot-r').click();
  else if (sc && e.code === 'Space') { e.preventDefault(); $('#sc-pause').click(); }
  else if (sc && e.code === 'KeyS') $('#sc-strike').click();
  else if (sc && e.code === 'Escape' && scene?.strike.arming) scene.armStrike(false);
});
new ResizeObserver(redraw).observe(cv);

// test hook: what is showing
window.citykit = { state, RECIPES, baker, pairFor, select };

let first = null; try { first = localStorage.getItem('citykit:last'); } catch { /* private window */ }
select(RECIPES[first] ? first : 'com-hotel');
let firstView = null; try { firstView = localStorage.getItem('citykit:view'); } catch { /* private window */ }
const askView = new URLSearchParams(location.search).get('view');
if (askView || firstView === 'scene') showView(askView || firstView);
