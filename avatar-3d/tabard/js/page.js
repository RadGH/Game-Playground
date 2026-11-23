// Tabard review page: dressing room (one character, every slot), comparison (today's Chibi 2.6, the Quaternius
// original, the new bodies), crowd test. See index.html for the URL options and the test hook.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { createScene } from '../../js/scene.js';
import { createTabard, loadTabardData, CLIPS, CLIP_NAMES } from './tabard.js';
import { fmt } from '../../../shared/format.js';

const q = new URLSearchParams(location.search);
const $ = s => document.querySelector(s);
const T = window.__tabard = { ready: false, tab: null, actors: [], errors: [] };
window.addEventListener('error', e => T.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', e => T.errors.push(String(e.reason?.message || e.reason)));

const D = await loadTabardData();
T.data = D;   // tests/qa-props.mjs lists items from it
const view = createScene($('#stage'), { background: 0x1c2029, ground: false });
T.view = view;   // tests/qa-shots.mjs drives the camera
view.renderer.toneMapping = THREE.NoToneMapping;
// painted textures carry their own shading: a soft, even fill so they read as painted, with a gentle key light
view.scene.add(new THREE.AmbientLight(0xfff4e6, 1.1));
const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 64), new THREE.MeshLambertMaterial({ color: 0x2b3039 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; view.scene.add(floor);
const BODY_NAMES = { male: 'Man', female: 'Woman' };
const DRESS_CLIPS = ['idle', 'walk', 'run', 'ready', 'attack', 'cast', 'channel', 'talk', 'dance', 'hit', 'death', 'sit'];
const SLOT_ORDER = ['head', 'hair', 'shoulders', 'back', 'chest', 'hands', 'legs', 'feet', 'mainhand', 'offhand'];

function chip(label, on, onClick) {
  const b = document.createElement('button'); b.className = 'tb-chip' + (on ? ' on' : ''); b.textContent = label;
  b.addEventListener('click', onClick); return b;
}
function chipsInto(el, list, isOn, pick) {
  el.replaceChildren(...list.map(([id, label]) => chip(label, isOn(id), () => { pick(id); chipsInto(el, list, isOn, pick); })));
}
function statsInto(el, rows) {
  el.replaceChildren(...rows.flatMap(([k, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = k; dd.textContent = v; return [dt, dd]; }));
}
function clearStage() {
  for (const a of T.actors) { view.scene.remove(a.group); a.dispose?.(); }
  T.actors = [];
  for (const o of [...view.scene.children]) if (o.userData.tbExtra) view.scene.remove(o);
}
const loading = (on, text = 'Loading characters…') => { $('#loading').textContent = text; $('#loading').classList.toggle('done', !on); };
let tick = null;
view.addTicker(dt => { for (const a of T.actors) a.update(dt); tick?.(dt); });

// ------------------------------------------------------------------ dressing room
const dress = { body: q.get('body') || 'male', set: q.get('set') || 'plate', clip: q.get('clip') || 'idle', calm: 60, spin: false, actor: null };
async function showDress() {
  clearStage(); loading(true);
  const set = D.items.sets[dress.set];
  const a = await createTabard({ body: dress.body, items: set ? set.items : [], clip: dress.clip, calm: dress.calm / 100 });
  view.scene.add(a.group); T.actors = [a]; dress.actor = a;
  view.controls.target.set(0, 1.0, 0); view.camera.position.set(0.9, 1.5, 3.6); view.controls.update();
  tick = dt => { if (dress.spin) a.group.rotation.y += dt * 0.5; };
  const atlas = $('#d-atlas'); atlas.replaceChildren(a.canvas);
  loading(false); drawDress();
}
function drawDress() {
  const a = dress.actor; if (!a) return;
  chipsInto($('#d-body'), Object.entries(BODY_NAMES), id => id === dress.body, id => { dress.body = id; showDress(); });
  chipsInto($('#d-sets'), Object.entries(D.items.sets).map(([id, s]) => [id, s.name]), id => id === dress.set,
    async id => { dress.set = id; await a.wearSet(id); drawDress(); });
  const worn = a.worn;
  $('#d-slots').replaceChildren(...SLOT_ORDER.map(slot => {
    const row = document.createElement('div'); row.className = 'tb-slot';
    const name = document.createElement('span'); name.textContent = D.items.slots[slot].name;
    const chips = document.createElement('div'); chips.className = 'tb-chips';
    const options = [[null, 'None'], ...Object.entries(D.items.items).filter(([, it]) => it.slot === slot).map(([id, it]) => [id, it.name])];
    for (const [id, label] of options) chips.append(chip(label, (worn[slot] || null) === id, async () => { dress.set = null; await a.equip(slot, id); drawDress(); }));
    row.append(name, chips); return row;
  }));
  chipsInto($('#d-clips'), DRESS_CLIPS.map(c => [c, CLIP_NAMES[c]]), id => id === dress.clip, id => { dress.clip = id; a.play(id); });
  $('#d-calm').value = dress.calm; $('#d-calm-out').textContent = `${fmt(dress.calm, { decimals: 0 })}%`;
  const s = a.stats();
  statsInto($('#d-stats'), [['Triangles', fmt(s.triangles, { decimals: 0 })], ['Draw calls', fmt(s.draws, { decimals: 0 })],
    ['Bones', fmt(s.bones, { decimals: 0 })], ['Body texture', s.texture + ' px']]);
}
$('#d-calm').addEventListener('input', e => { dress.calm = +e.target.value; if (dress.actor) dress.actor.calm = dress.calm / 100; $('#d-calm-out').textContent = `${fmt(dress.calm, { decimals: 0 })}%`; });
$('#d-spin').addEventListener('change', e => { dress.spin = e.target.checked; });

// ------------------------------------------------------------------ comparison
const loader = new GLTFLoader();
const cmp = { set: q.get('set') || 'leather', clip: q.get('clip') || 'idle' };
const COLS = [
  { id: 'chibi', title: 'Today: Chibi 2.6', note: 'Built from shapes in code; what Thousandvale and Rogueloot use now.' },
  { id: 'asis', title: 'Quaternius original', note: 'The free CC0 base body as downloaded: 12,566 triangles, very muscular.' },
  { id: 'lib', title: 'Tabard man, library motion', note: 'Reshaped, softened, 3,868 triangles, painted; animation exactly as the free library has it.' },
  { id: 'male', title: 'Tabard man, calmer posture', note: 'The same with the posture softened (arms closer, chest and shoulders let down).' },
  { id: 'female', title: 'Tabard woman', note: 'The second body, same layers and slots.' },
];
function numberDisc(n, x, z) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#3a2f1b'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#e2b45a'; g.stroke();
  g.fillStyle = '#f3d38c'; g.font = 'bold 70px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(n, 64, 68);
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, 0.005, z + 0.55); m.userData.tbExtra = true; view.scene.add(m);
}
async function plainGlb(path, clipName) {
  const g = await loader.loadAsync(new URL('../' + path, import.meta.url).href);
  const root = SkeletonUtils.clone(g.scene);
  root.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
  const lib = await loader.loadAsync(new URL('../models/anims.glb', import.meta.url).href);
  const mixer = new THREE.AnimationMixer(root);
  const group = new THREE.Group(); group.add(root);
  let cur = null;
  const api = {
    group, play(name) { const c = lib.animations.find(a => a.name === (CLIPS[name] || name)); if (!c) return; const a = mixer.clipAction(c); a.reset().play(); if (cur && cur !== a) a.crossFadeFrom(cur, 0.25, false); cur = a; },
    update(dt) { mixer.update(dt); },
    stats() { let t = 0, d = 0; root.traverse(o => { if (o.isSkinnedMesh) { t += o.geometry.index.count / 3; d++; } }); return { triangles: t, draws: d, texture: '2048×2048 + normal + roughness' }; },
  };
  api.play(clipName); return api;
}
async function chibiActor(clip) {
  const { createChibi26Character } = await import('../../js/chibi26.js');
  const { normalizeForChibi26 } = await import('../../js/chibi26-adapter.js');
  const look = normalizeForChibi26({ body: { race: 'human', form: 'masc', height: 0.5, width: 0.5, headSize: 0.5 } });
  const map = { idle: 'idle', walk: 'walk', run: 'run', attack: 'attack', cast: 'cast', ready: 'idle', talk: 'idle', dance: 'idle', hit: 'hit', death: 'death', channel: 'cast', sit: 'idle' };
  const a = await createChibi26Character(look, { anims: [...new Set(Object.values(map))] });
  return { group: a.group, play: n => a.setAnim(map[n] || 'idle', 0.2, true), update: dt => a.update(dt),
    stats: () => { const s = a.stats(); return { triangles: s.triangles, draws: s.meshes, texture: 'colours only' }; } };
}
async function showCompare() {
  clearStage(); loading(true, 'Loading the line-up…'); tick = null;
  const set = D.items.sets[cmp.set].items;
  const wide = view.renderer.domElement.clientWidth >= view.renderer.domElement.clientHeight;
  const spots = wide ? COLS.map((c, i) => [(i - 2) * 1.15, 0]) : [[-1.1, -0.8], [0, -0.8], [1.1, -0.8], [-0.6, 0.9], [0.6, 0.9]];
  const make = {
    chibi: () => chibiActor(cmp.clip).catch(e => { T.errors.push('chibi: ' + e.message); return null; }),
    asis: () => plainGlb('models/male_asis.glb', cmp.clip),
    lib: () => createTabard({ body: 'male', items: set, clip: cmp.clip, calm: 0 }),
    male: () => createTabard({ body: 'male', items: set, clip: cmp.clip, calm: 0.6 }),
    female: () => createTabard({ body: 'female', items: set, clip: cmp.clip, calm: 0.6 }),
  };
  const actors = await Promise.all(COLS.map(c => make[c.id]()));
  actors.forEach((a, i) => {
    if (!a) return;
    a.group.position.set(spots[i][0], 0, spots[i][1]); view.scene.add(a.group); T.actors.push(a); numberDisc(i + 1, spots[i][0], spots[i][1]);
    a.col = COLS[i];
  });
  if (wide) { view.controls.target.set(0, 0.95, 0); view.camera.position.set(0, 1.6, 7.6); }
  else { view.controls.target.set(0, 0.9, 0); view.camera.position.set(0, 2.6, 8.4); }
  view.controls.update(); loading(false); drawCompare(actors);
}
function drawCompare(actors) {
  $('#c-legend').replaceChildren(...COLS.map((c, i) => { const li = document.createElement('li'); li.innerHTML = `<b>${i + 1}</b><span></span>`; li.querySelector('span').textContent = c.title; const sm = document.createElement('small'); sm.textContent = c.note; li.querySelector('span').append(sm); return li; }));
  chipsInto($('#c-sets'), Object.entries(D.items.sets).map(([id, s]) => [id, s.name]), id => id === cmp.set, id => { cmp.set = id; showCompare(); });
  chipsInto($('#c-clips'), ['idle', 'walk', 'run', 'attack', 'cast', 'hit'].map(c => [c, CLIP_NAMES[c]]), id => id === cmp.clip, id => { cmp.clip = id; for (const a of T.actors) a.play(id); });
  const head = '<tr><th></th><th>Triangles</th><th>Draw calls</th><th>Texture</th></tr>';
  $('#c-table').innerHTML = head;
  actors.forEach((a, i) => {
    if (!a) return;
    const s = a.stats(); const tr = document.createElement('tr');
    for (const v of [`${i + 1}. ${COLS[i].title}`, fmt(Math.round(s.triangles), { decimals: 0 }), fmt(s.draws, { decimals: 0 }), s.texture]) { const td = document.createElement('td'); td.textContent = v; tr.append(td); }
    $('#c-table').append(tr);
  });
}

// ------------------------------------------------------------------ crowd
const crowd = { n: 24 };
async function showCrowd() {
  clearStage(); loading(true, 'Dressing the crowd…');
  const sets = Object.keys(D.items.sets); const pool = Object.entries(D.items.items);
  const n = crowd.n, cols = Math.ceil(Math.sqrt(n * 1.5));
  const made = [];
  for (let i = 0; i < n; i++) {
    const body = i % 2 ? 'female' : 'male';
    // a random piece per slot (mixing sets is the point of the slot system)
    const items = [];
    for (const slot of SLOT_ORDER) { const opts = pool.filter(([, it]) => it.slot === slot); if (Math.random() < 0.8) items.push(opts[Math.floor(Math.random() * opts.length)][0]); }
    made.push(createTabard({ body, items, clip: i % 3 ? 'walk' : 'idle', calm: 0.6 }));
  }
  const actors = await Promise.all(made);
  actors.forEach((a, i) => { const r = Math.floor(i / cols), c = i % cols; a.group.position.set((c - (cols - 1) / 2) * 0.9, 0, (r - n / cols / 2) * 1.1); view.scene.add(a.group); T.actors.push(a); });
  view.controls.target.set(0, 0.8, 0); view.camera.position.set(0, 4.2, 7.2); view.controls.update(); loading(false);
  let frames = 0, time = 0, fps = 0;
  tick = dt => { frames++; time += dt; if (time >= 1) { fps = frames / time; frames = 0; time = 0; drawCrowd(fps); } };
  drawCrowd(0);
}
function drawCrowd(fps) {
  chipsInto($('#r-count'), [12, 24, 48].map(n => [n, `${n} characters`]), id => id === crowd.n, id => { crowd.n = id; showCrowd(); });
  let tris = 0, draws = 0; for (const a of T.actors) { const s = a.stats(); tris += s.triangles; draws += s.draws; }
  statsInto($('#r-stats'), [['Frames per second', fps ? fmt(fps, { decimals: 0 }) : 'measuring…'], ['Characters', fmt(T.actors.length, { decimals: 0 })],
    ['Triangles drawn', fmt(tris, { decimals: 0 })], ['Draw calls', fmt(draws, { decimals: 0 })]]);
  T.fps = fps;
}

// ------------------------------------------------------------------ tabs
const SHOW = { dress: showDress, compare: showCompare, crowd: showCrowd };
async function setTab(tab) {
  T.ready = false; T.tab = tab;
  for (const b of document.querySelectorAll('.tb-tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  for (const p of document.querySelectorAll('.tb-pane')) p.classList.toggle('on', p.dataset.pane === tab);
  const u = new URL(location.href); u.searchParams.set('tab', tab); history.replaceState(null, '', u);
  try { await SHOW[tab](); } catch (e) { T.errors.push(String(e.message || e)); loading(true, 'Could not load: ' + (e.message || e)); throw e; }
  T.ready = true;
}
for (const b of document.querySelectorAll('.tb-tabs button')) b.addEventListener('click', () => setTab(b.dataset.tab));
T.stats = () => T.actors.map(a => a.stats());
await setTab(SHOW[q.get('tab')] ? q.get('tab') : 'dress');
