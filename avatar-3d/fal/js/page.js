// fal test review page: dressing room (bodies + armour + weapons + clips), complete enemies, makers compared, costs.
import * as THREE from 'three';
import { createScene } from '../../js/scene.js';
import { createFalCharacter, loadCatalog, glb, CLIPS } from './fal.js';
import { createSceneryTab } from './scenery-page.js';

const state = window.__fal = { ready: false, errors: [], character: null, enemies: null, stats: () => state.character?.stats() };
window.addEventListener('error', e => state.errors.push(String(e.message || e)));
window.addEventListener('unhandledrejection', e => state.errors.push(String(e.reason?.message || e.reason)));

const q = new URLSearchParams(location.search);
const $ = id => document.getElementById(id);
const money = v => '$' + (Math.round(v * 100) / 100).toFixed(2);
const num = v => Math.round(v).toLocaleString('en-US');
const kbText = v => v >= 1024 ? (Math.round(v / 102.4) / 10) + ' MB' : v + ' KB';

const view = createScene($('stage'), { background: 0x1e2128 });
state.view = view;   // tests and tools/closeups.mjs aim the camera
view.controls.maxDistance = 40;   // a line-up of big enemies needs room
view.camera.position.set(0, 1.3, 3.6); view.controls.target.set(0, 0.9, 0); view.controls.update();

let cat, char = null, tab = 'dress';
const pick = { body: q.get('body') || 'male', clip: q.get('clip') || 'idle', set: q.get('set') || 'bare', worn: {} };
const makersGroup = new THREE.Group(); view.scene.add(makersGroup);
const enemyGroup = new THREE.Group(); view.scene.add(enemyGroup);

function chip(label, sub, on, onClick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'fl-chip' + (on ? ' on' : '');
  b.textContent = label;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
  b.addEventListener('click', onClick); return b;
}

function loading(text) { const l = $('loading'); l.textContent = text || ''; l.classList.toggle('done', !text); }

async function setBody(id) {
  loading('Loading the ' + (cat.bodies.find(b => b.id === id)?.name || id).toLowerCase() + '…');
  const c = await createFalCharacter(id);
  if (char) { view.scene.remove(char.group); view.removeTicker(char._tick); }
  char = state.character = c; pick.body = id;
  c._tick = dt => c.update(dt); view.addTicker(c._tick);
  view.scene.add(c.group);
  const h = c.def.id === 'goblin' ? 1.05 : 1.8;
  view.controls.target.set(0, h * 0.52, 0); view.camera.position.set(0, h * 0.72, h * 2.1); view.controls.update();
  c.play(pick.clip, 0);
  for (const [slot, id] of Object.entries(pick.worn)) await c.equip(slot, id);
  loading('');
  renderDress();
}

async function wear(slot, id) {
  if (id) pick.worn[slot] = id; else delete pick.worn[slot];
  pick.set = null;
  await char.equip(slot, id || null);
  renderDress();
}

async function wearSet(set) {
  pick.set = set;
  for (const s of ['head', 'chest', 'hands', 'legs', 'feet']) {
    const it = set === 'bare' ? null : cat.items.find(i => i.slot === s && i.set === set && i.files?.[pick.body]);
    if (it) pick.worn[s] = it.id; else delete pick.worn[s];
    await char.equip(s, it ? it.id : null);
  }
  renderDress();
}

function renderDress() {
  const body = $('d-body'); body.replaceChildren();
  for (const b of cat.bodies.filter(b => !b.enemy)) body.append(chip(b.name, num(b.triangles) + ' triangles', b.id === pick.body, () => setBody(b.id)));
  const sets = $('d-sets'); sets.replaceChildren(chip('Bare', null, pick.set === 'bare', () => wearSet('bare')));
  for (const [id, name] of cat.sets) sets.append(chip(name, null, pick.set === id, () => wearSet(id)));
  const slots = $('d-slots'); slots.replaceChildren();
  for (const [slot, label] of cat.slots) {
    const items = cat.items.filter(i => i.slot === slot && (i.kind === 'held' || i.files?.[pick.body]));
    if (!items.length) continue;
    const row = document.createElement('div'); row.className = 'fl-slot';
    const name = document.createElement('span'); name.textContent = label;
    const chips = document.createElement('div'); chips.className = 'fl-chips';
    chips.append(chip('None', null, !pick.worn[slot], () => wear(slot, null)));
    for (const it of items) chips.append(chip(it.name, money(it.cost), pick.worn[slot] === it.id, () => wear(slot, it.id)));
    row.append(name, chips); slots.append(row);
  }
  const clips = $('d-clips'); clips.replaceChildren();
  for (const [key, , label] of CLIPS) clips.append(chip(label, null, pick.clip === key, () => { pick.clip = key; char.play(key); renderDress(); }));
  renderStats();
}

function renderStats() {
  if (!char) return;
  const s = char.stats();
  const worn = Object.values(pick.worn).map(id => cat.items.find(i => i.id === id)).filter(Boolean);
  const wornCost = worn.reduce((a, i) => a + i.cost, 0);
  const rows = [
    ['Triangles on screen', num(s.triangles)], ['Draw calls', s.draws], ['Bones', s.bones],
    ['Body cost', money(char.def.cost)], ['Worn pieces cost', money(wornCost)], ['This look in all', money(char.def.cost + wornCost)],
    ['Body file', kbText(char.def.kb)],
  ];
  const dl = $('d-stats'); dl.replaceChildren();
  for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
  const note = $('d-note'); note.textContent = char.def.note || ''; note.hidden = !char.def.note;
}

// ---- makers compared: the three raw results for the same man, side by side
const MAKERS = [
  { job: 'male-tripo', name: 'Tripo P1', file: 'models/male-tripo/model_mesh-model.glb', yaw: -Math.PI / 2 },
  { job: 'male-rodin', name: 'Rodin v2 (picked)', file: 'models/male-rodin/model_meshes.0-base_basic_shaded.glb', yaw: 0 },
  { job: 'male-hunyuan', name: 'Hunyuan3D v3 low poly', file: 'models/male-hunyuan/model_glb-model.glb', yaw: 0 },
];
let makersBuilt = false;
async function showMakers(spend) {
  if (!makersBuilt) {
    makersBuilt = true; loading('Loading the three makers…');
    const rows = [];
    for (const [i, m] of MAKERS.entries()) {
      const g = await glb(m.file);
      const o = g.scene.clone(true);
      let tris = 0;
      o.traverse(x => { if (x.isMesh) { const gg = x.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } });
      o.rotation.y = m.yaw;
      const box = new THREE.Box3().setFromObject(o); const size = box.getSize(new THREE.Vector3());
      const k = 1.8 / size.y; o.scale.setScalar(k);
      const box2 = new THREE.Box3().setFromObject(o); const c = box2.getCenter(new THREE.Vector3());
      o.position.set((i - 1) * 1.15 - c.x, -box2.min.y, -c.z);
      makersGroup.add(o);
      const job = spend.jobs.find(j => j.id === m.job);
      rows.push([m.name, money(job?.price || 0), num(tris), job ? Math.round(job.seconds) + ' s' : '—']);
    }
    const t = $('m-table'); t.replaceChildren();
    const head = t.createTHead().insertRow(); for (const h of ['Maker', 'Price', 'Triangles', 'Time']) { const th = document.createElement('th'); th.textContent = h; head.append(th); }
    const tb = t.createTBody(); for (const r of rows) { const tr = tb.insertRow(); for (const v of r) tr.insertCell().textContent = v; }
    loading('');
  }
  view.controls.target.set(0, 0.95, 0); view.camera.position.set(0, 1.25, 4.6); view.controls.update();
}

// ---- enemies: a picker for the whole roster; the stage shows the picked one, or the filtered group in a line-up at
// real sizes (models are made 1 m tall; catalog `height` is the real size in metres)
const enemies = state.enemies = [];          // characters on the stage now
const loaded = new Map();                    // id -> Promise<character>, made once
const GROUPS = [['all', 'All'], ['wyrmroad', 'Road foes'], ['oathwild', 'Oathwild'], ['boss', 'Bosses'], ['elemental', 'Elementals'], ['extra', 'Extras'], ['beast', 'Beasts'], ['goblin', 'Goblins']];
const ROLE = { brawler: 'Brawler', rogue: 'Rogue', soldier: 'Soldier', archer: 'Archer', caster: 'Caster', undead: 'Undead', beast: 'Beast', construct: 'Construct', elemental: 'Elemental', boss: 'Boss' };
const epick = { group: q.get('group') || 'all', id: q.get('enemy') || null, lineup: q.get('lineup') === '1', clip: q.get('eclip') || 'idle' };
const ORDER = GROUPS.map(g => g[0]);
const stageList = () => cat.bodies.filter(b => b.enemy && b.stage !== false && (epick.group === 'all' || b.group === epick.group))
  .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));
const weaponsOf = b => [b.weapon, b.offhand].map(id => cat.items.find(i => i.id === id)).filter(Boolean);

function loadEnemy(b) {
  if (!loaded.has(b.id)) loaded.set(b.id, (async () => {
    const c = await createFalCharacter(b.id);
    for (const it of weaponsOf(b)) await c.equip(it.slot, it.id);
    const box = new THREE.Box3().setFromObject(c.group); const made = box.max.y - box.min.y || 1;
    const k = (b.height || made) / made; c.group.scale.setScalar(k);
    c._long = Math.max(box.max.z - box.min.z, box.max.x - box.min.x) * k;   // a beast is longer than it is tall
    c._tick = dt => c.update(dt);
    return c;
  })());
  return loaded.get(b.id);
}

let enemyToken = 0;
async function showEnemies() {
  renderEnemyList();
  const token = ++enemyToken;
  const list = stageList();
  if (!epick.id || !list.some(b => b.id === epick.id)) epick.id = list[0]?.id || null;
  const want = epick.lineup ? list.slice(0, 24) : list.filter(b => b.id === epick.id);
  loading('Loading ' + (want.length > 1 ? want.length + ' enemies' : (want[0]?.name || '').toLowerCase()) + '…');
  const chars = [];
  for (const b of want) chars.push(await loadEnemy(b));
  if (token !== enemyToken) return;
  for (const c of enemies) { enemyGroup.remove(c.group); view.removeTicker(c._tick); }
  enemies.length = 0;
  for (const c of chars) { c.play(epick.clip, 0); enemyGroup.add(c.group); view.addTicker(c._tick); enemies.push(c); }
  loading('');
  layoutEnemies();
  renderEnemyList();
}

function renderEnemyList() {
  const g = $('e-groups'); g.replaceChildren();
  for (const [id, label] of GROUPS) {
    const n = cat.bodies.filter(b => b.enemy && b.stage !== false && (id === 'all' || b.group === id)).length;
    if (!n) continue;
    g.append(chip(label, n + (n === 1 ? ' model' : ' models'), epick.group === id, () => { epick.group = id; showEnemies(); }));
  }
  const v = $('e-view'); v.replaceChildren(
    chip('One at a time', null, !epick.lineup, () => { epick.lineup = false; showEnemies(); }),
    chip('Line-up, real sizes', null, epick.lineup, () => { epick.lineup = true; showEnemies(); }));
  const t = $('e-table'); t.replaceChildren();
  const head = t.createTHead().insertRow(); for (const h of ['Enemy', 'Role', 'Height', 'Triangles', 'Cost']) { const th = document.createElement('th'); th.textContent = h; head.append(th); }
  const tb = t.createTBody();
  let sumT = 0, sumC = 0;
  const list = stageList();
  for (const b of list) {
    const w = weaponsOf(b);
    const tr = tb.insertRow(); tr.className = 'fl-pick' + (b.id === epick.id ? ' on' : ''); tr.tabIndex = 0;
    const name = tr.insertCell(); name.textContent = b.name;
    if (w.length) { const s = document.createElement('small'); s.textContent = w.map(i => i.name.toLowerCase()).join(', '); name.append(s); }
    tr.insertCell().textContent = ROLE[b.role] || '—';
    tr.insertCell().textContent = b.height ? b.height.toFixed(1) + ' m' : '—';
    const tris = b.triangles + w.reduce((a, i) => a + i.triangles, 0), cost = b.cost + w.reduce((a, i) => a + i.cost, 0);
    sumT += tris; sumC += cost;
    tr.insertCell().textContent = num(tris);
    tr.insertCell().textContent = money(cost);
    const go = () => { epick.id = b.id; if (epick.lineup) { renderEnemyList(); focusEnemy(b.id); } else showEnemies(); };
    tr.addEventListener('click', go);
    tr.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  }
  const f = t.createTFoot().insertRow();
  f.insertCell().textContent = list.length + ' models'; f.insertCell(); f.insertCell();
  f.insertCell().textContent = list.length ? num(sumT / list.length) + ' avg' : ''; f.insertCell().textContent = money(sumC);
  const clips = $('e-clips'); clips.replaceChildren();
  for (const [key, , label] of CLIPS) clips.append(chip(label, null, epick.clip === key, () => { epick.clip = key; for (const c of enemies) c.play(key); renderEnemyList(); }));
}

// one enemy: framed to its height. A line-up: one row on a wide stage, two on a narrow one (a phone)
function layoutEnemies() {
  if (!enemies.length) return;
  const cam = view.camera, n = enemies.length, t = Math.tan(cam.fov * Math.PI / 360);
  const hs = enemies.map(c => c.def.height || 1), H = Math.max(...hs);
  if (n === 1) {
    enemies[0].group.position.set(0, 0, 0);
    const h = hs[0], w = Math.max(h * 0.9, enemies[0]._long || 0);
    const dist = Math.max(h * 0.7 / t, w * 0.62 / (t * cam.aspect));
    view.controls.target.set(0, h * 0.5, 0); cam.position.set(0, h * 0.62, dist); view.controls.update();
    return;
  }
  const perRow = cam.aspect < 1 ? 5 : 10, rows = Math.ceil(n / perRow), cols = Math.ceil(n / rows);
  const widths = enemies.map(c => Math.max(0.55, (c.def.height || 1) * 0.5, c.def.skeleton === 'quadruped' ? (c._long || 1) * 0.6 : 0));
  for (let r = 0; r < rows; r++) {
    const row = enemies.slice(r * cols, r * cols + cols), w = row.map((c, i) => widths[r * cols + i] + 0.15);
    const total = w.reduce((a, v) => a + v, 0); let x = -total / 2;
    row.forEach((c, i) => { c.group.position.set(x + w[i] / 2, 0, -r * H * 0.9); x += w[i]; });
  }
  const span = Math.max(...Array.from({ length: rows }, (_, r) => enemies.slice(r * cols, r * cols + cols).reduce((a, c, i) => a + widths[r * cols + i] + 0.15, 0)));
  const dist = Math.max(span / 2 / (t * cam.aspect) + 0.4, (rows > 1 ? H * 1.25 : H * 0.62) / t);
  view.controls.target.set(0, rows > 1 ? H * 0.45 : H * 0.48, -(rows - 1) * H * 0.45);
  cam.position.set(0, rows > 1 ? H * 1.6 : H * 0.6, dist); view.controls.update();
}
function focusEnemy(id) {
  const c = enemies.find(x => x.def.id === id); if (!c) return;
  const h = c.def.height || 1, t = Math.tan(view.camera.fov * Math.PI / 360);
  const p = c.group.position;
  view.controls.target.set(p.x, h * 0.5, p.z); view.camera.position.set(p.x, h * 0.62, p.z + Math.max(h * 0.62 / t, h * 0.45 / (t * view.camera.aspect))); view.controls.update();
}
addEventListener('resize', () => { if (tab === 'enemies') layoutEnemies(); });

function renderCosts(spend) {
  $('c-total').textContent = `${spend.jobs.length} paid jobs, ${money(spend.total)} in all. A picture that held several items shares its price between them.`;
  const t = $('c-table'); t.replaceChildren();
  const head = t.createTHead().insertRow(); for (const h of ['Job', 'Maker', 'Price']) { const th = document.createElement('th'); th.textContent = h; head.append(th); }
  const tb = t.createTBody();
  for (const j of spend.jobs) { const tr = tb.insertRow(); tr.insertCell().textContent = j.note || j.id; tr.insertCell().textContent = j.endpoint.replace(/^fal-ai\//, ''); tr.insertCell().textContent = money(j.price); }
  const f = t.createTFoot().insertRow(); f.insertCell().textContent = 'Total'; f.insertCell(); f.insertCell().textContent = money(spend.total);
}

let scenery = null;
async function setTab(t, spend) {
  if (tab === 'scenery' && t !== 'scenery') scenery?.leave();
  tab = t;
  for (const b of document.querySelectorAll('.fl-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === t));
  for (const p of document.querySelectorAll('.fl-pane')) p.classList.toggle('on', p.dataset.pane === t);
  makersGroup.visible = t === 'makers'; enemyGroup.visible = t === 'enemies';
  if (char) char.group.visible = t !== 'makers' && t !== 'enemies' && t !== 'scenery';
  if (t === 'scenery') {
    scenery ||= state.scenery = createSceneryTab({ view, cat, $, chip, loading, q, money, num });
    await scenery.enter();
  } else if (t === 'makers') await showMakers(spend);
  else if (t === 'enemies') await showEnemies();
  else if (char) { const h = char.def.id === 'goblin' ? 1.05 : 1.8; view.controls.target.set(0, h * 0.52, 0); view.camera.position.set(0, h * 0.72, h * 2.1); view.controls.update(); }
}

(async () => {
  try {
    cat = await loadCatalog();
    const spend = await fetch(new URL('../data/spend.json', import.meta.url)).then(r => r.json());
    for (const b of document.querySelectorAll('.fl-tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab, spend));
    $('d-spin').addEventListener('change', e => view.setTurntable(e.target.checked ? 0.5 : 0));
    renderCosts(spend);
    if (!cat.bodies.some(b => b.id === pick.body && !b.enemy)) pick.body = cat.bodies.find(b => !b.enemy).id;
    await setBody(pick.body);
    if (q.get('set')) await wearSet(q.get('set'));
    for (const [slot] of cat.slots) { const id = q.get(slot); if (id) await wear(slot, id); }
    await setTab(q.get('tab') || 'dress', spend);
    setInterval(renderStats, 1000);
    state.ready = true;
  } catch (e) {
    state.errors.push(String(e.message || e)); loading('Could not load: ' + (e.message || e));
  }
})();
