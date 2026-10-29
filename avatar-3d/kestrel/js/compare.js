// Kestrel review page: every attempt in data/attempts.json beside the Codex reference for the same body and view.
// One WebGL renderer for the whole page (a phone allows only a handful of contexts); each column has a plain 2D
// canvas and the shared renderer draws into it in turn.
import * as THREE from 'three';
import { LOOKS, OUTFIT, lookFor } from './looks.js';

const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const state = {
  body: qs.get('body') === 'female' ? 'female' : 'male',
  view: qs.get('view') || 'front',
  anim: qs.get('anim') || 'idle',
  expr: 'neutral',
  outfit: qs.get('outfit') === '1',
  spin: false, wire: false, lod: false,
};
const VIEWS = { front: 'Front', left: 'Left side', back: 'Back', right: 'Right side', three: '3/4', face: 'Face', free: 'Free' };
const ANIMS = ['idle', 'ready', 'walk', 'run', 'sprint', 'jump', 'crouch', 'attack', 'aim', 'cast', 'interact', 'wave', 'talk', 'guard', 'hit', 'dead'];
const EXPRS = ['neutral', 'happy', 'sad', 'angry', 'surprised', 'confused'];
const SCORE_KEY = 'kestrel.scores.v1';
const report = window.__kestrel = { ready: false, attempts: [] };

// ---------- one renderer, one scene per column ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const dpr = Math.min(2, window.devicePixelRatio || 1);

function makeScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c9ccd1');
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f99', 1.6));
  const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(2, 4, 3); scene.add(key);
  const rim = new THREE.DirectionalLight('#dfe8ff', 0.9); rim.position.set(-3, 3, -2); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshStandardMaterial({ color: '#b5b9c0', roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.002; scene.add(floor);
  return scene;
}

/** Camera for a named view of a body `h` metres tall (+z is the character's front). */
function placeCamera(cam, view, h, yaw) {
  const dirs = { front: [0, 1], back: [0, -1], left: [1, 0], right: [-1, 0], three: [0.72, 0.7], free: [Math.sin(yaw), Math.cos(yaw)] };
  if (view === 'face') {
    const head = h * 0.93;
    cam.fov = 22; cam.position.set(Math.sin(yaw) * 0.85, head, Math.cos(yaw) * 0.85); cam.lookAt(0, head, 0);
  } else {
    let [x, z] = dirs[view] || dirs.front;
    if (yaw && view !== 'free') { const c = Math.cos(yaw), s = Math.sin(yaw); [x, z] = [x * c + z * s, -x * s + z * c]; }
    const d = h * 2.05;
    cam.fov = 30; cam.position.set(x * d, h * 0.52, z * d); cam.lookAt(0, h * 0.5, 0);
  }
  cam.updateProjectionMatrix();
}

// ---------- reference pictures ----------
let refs = {};
async function loadRefs() {
  try { refs = await (await fetch('ref/manifest.json')).json(); } catch { refs = {}; }
}
function refFor(body, view) {
  const b = refs[body] || {};
  return b[view] || (view === 'free' ? b.front : null);
}

// ---------- columns ----------
const cols = [];
function colShell(title, by, links = '') {
  const el = document.createElement('div'); el.className = 'ks-col';
  el.innerHTML = `<h3></h3><div class="by"></div><div class="ks-view"></div><div class="line"></div>`;
  el.querySelector('h3').textContent = title; el.querySelector('.by').textContent = by;
  if (links) el.querySelector('.by').insertAdjacentHTML('beforeend', links);
  $('#cols').appendChild(el); return el;
}

function refColumn() {
  const el = colShell('Reference', 'Codex picture (the target)');
  const view = el.querySelector('.ks-view'), img = document.createElement('img'); img.alt = 'reference';
  const msg = document.createElement('div'); msg.className = 'msg';
  view.append(img, msg);
  return {
    kind: 'ref', el,
    refresh() {
      const src = refFor(state.body, state.view);
      img.style.display = src ? '' : 'none'; msg.textContent = src ? '' : 'No reference picture for this view yet.';
      if (src) img.src = 'ref/' + src;
      el.querySelector('.line').textContent = src ? src : '';
    },
  };
}

async function attemptColumn(a) {
  const links = `${a.page ? `<a href="${a.page}">page</a>` : ''}${a.readme ? `<a href="${a.readme}">notes</a>` : ''}`;
  const el = colShell(a.title, a.by, links);
  const view = el.querySelector('.ks-view'), line = el.querySelector('.line');
  const canvas = document.createElement('canvas'); view.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const col = { kind: 'attempt', a, el, canvas, ctx, scene: makeScene(), cam: new THREE.PerspectiveCamera(30, 0.75, 0.05, 50), yaw: 0, actor: null, mod: null, ok: false, error: null, stats: null };
  const rec = { id: a.id, ok: false, error: null, stats: null }; report.attempts.push(rec);
  // drag to turn
  let drag = null;
  view.addEventListener('pointerdown', e => { drag = { x: e.clientX, yaw: col.yaw }; view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', e => { if (drag) col.yaw = drag.yaw + (e.clientX - drag.x) * 0.012; });
  view.addEventListener('pointerup', () => { drag = null; });
  view.addEventListener('dblclick', () => { col.yaw = 0; });
  try {
    col.mod = await import('../' + a.module);
    const t0 = performance.now();
    col.opts = a.files ? { files: a.files } : {};
    col.actor = await col.mod.createKestrelCharacter(lookFor(state.body, state.outfit), col.opts);
    col.buildMs = performance.now() - t0;
    col.scene.add(col.actor.group);
    col.ok = rec.ok = true;
  } catch (err) {
    col.error = rec.error = String(err?.message || err);
    const msg = document.createElement('div'); msg.className = 'msg'; msg.textContent = 'Not built yet: ' + col.error; view.appendChild(msg);
    canvas.style.display = 'none';
  }
  col.refresh = async () => {
    if (!col.ok) { line.textContent = ''; return; }
    try {
      await col.actor.setAvatar(lookFor(state.body, state.outfit));
      col.actor.setAnim(state.anim, 0.15, true);
      col.actor.setExpression?.(state.expr);
      col.actor.setLod?.(state.lod ? 1 : 0);
      col.scene.traverse(o => { if (o.isMesh && o.material && o !== col.scene.children.find(c => c.isMesh)) [].concat(o.material).forEach(m => { if ('wireframe' in m) m.wireframe = state.wire; }); });
      col.stats = rec.stats = { ...col.actor.stats(), height: col.actor.metrics().height };
      line.textContent = `${fmtInt(col.stats.triangles)} triangles · ${col.stats.drawCalls ?? col.stats.meshes} draw calls · ${col.stats.bones} bones · ${col.stats.height.toFixed(2)} m`;
    } catch (err) { line.textContent = 'error: ' + (err?.message || err); }
  };
  return col;
}

const fmtInt = n => Math.round(n || 0).toLocaleString();

// ---------- controls ----------
function buttons(host, items, key, label = v => v) {
  const el = $(host); el.innerHTML = '';
  for (const [v, text] of items) {
    const b = document.createElement('button'); b.textContent = label(text); b.dataset.v = v;
    if (state[key] === v) b.className = 'on';
    b.onclick = () => { state[key] = v; for (const x of el.children) x.classList.toggle('on', x.dataset.v === v); refreshAll(); };
    el.appendChild(b);
  }
}
async function refreshAll() {
  for (const c of cols) await c.refresh();
  drawStats();
}

// ---------- stats + scores ----------
function drawStats() {
  const t = $('#stats');
  const rows = [['Attempt', 'Triangles', 'Draw calls', 'Bones', 'Textures', 'Height (m)', 'First build (ms)', 'Status']];
  for (const c of cols.filter(c => c.kind === 'attempt')) {
    const s = c.stats || {};
    rows.push([c.a.title, c.ok ? fmtInt(s.triangles) : '', s.drawCalls ?? s.meshes ?? '', s.bones ?? '', s.textures ?? '', s.height ? s.height.toFixed(2) : '', c.buildMs ? Math.round(c.buildMs) : '', c.ok ? 'built' : (c.error || '')]);
  }
  t.innerHTML = rows.map((r, i) => `<tr>${r.map(v => i ? `<td>${esc(v)}</td>` : `<th>${esc(v)}</th>`).join('')}</tr>`).join('');
}
const esc = v => String(v ?? '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function loadScores() { try { return JSON.parse(localStorage.getItem(SCORE_KEY) || '{}'); } catch { return {}; } }
function saveScores(s) { try { localStorage.setItem(SCORE_KEY, JSON.stringify(s)); } catch { /* private window */ } }
function drawScores(meta) {
  const s = loadScores(), list = meta.attempts;
  const t = $('#scores');
  let html = `<tr><th>What</th>${list.map(a => `<th>${esc(a.title)}</th>`).join('')}</tr>`;
  for (const row of [...meta.scores, 'Notes']) {
    html += `<tr><th>${esc(row)}</th>${list.map(a => {
      const v = s[a.id]?.[row] ?? '';
      return row === 'Notes'
        ? `<td><input type="text" data-a="${a.id}" data-r="${esc(row)}" value="${esc(v)}"></td>`
        : `<td><select data-a="${a.id}" data-r="${esc(row)}">${['', 1, 2, 3, 4, 5].map(n => `<option${String(n) === String(v) ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`;
    }).join('')}</tr>`;
  }
  t.innerHTML = html;
  t.oninput = e => {
    const el = e.target; if (!el.dataset.a) return;
    const all = loadScores(); (all[el.dataset.a] ||= {})[el.dataset.r] = el.value; saveScores(all);
  };
  $('#copy-scores').onclick = async () => {
    const text = JSON.stringify({ page: 'kestrel', date: new Date().toISOString().slice(0, 10), scores: loadScores() }, null, 1);
    try { await navigator.clipboard.writeText(text); $('#copied').textContent = 'copied'; } catch { prompt('Copy this:', text); }
  };
}

// ---------- crowd test ----------
async function crowd(col, n = 30) {
  const t = $('#crowd');
  const scene = makeScene(), cam = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
  cam.position.set(0, 9, 14); cam.lookAt(0, 0.8, 0);
  const actors = [];
  const looks = [lookFor('male', false), lookFor('female', false), lookFor('male', true), lookFor('female', true)];
  for (let i = 0; i < n; i++) {
    const a = await col.mod.createKestrelCharacter(looks[i % 4], { ...col.opts, lod: 'auto' });
    a.group.position.set((i % 6 - 2.5) * 1.6, 0, (Math.floor(i / 6) - 2) * 1.6);
    a.setAnim(i % 3 ? 'walk' : 'run'); scene.add(a.group); actors.push(a);
  }
  const w = 640, h = 360; renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  let frames = 0; const t0 = performance.now(); let last = t0;
  await new Promise(done => {
    function tick(now) {
      const dt = (now - last) / 1000; last = now;
      for (const a of actors) a.update(dt);
      renderer.render(scene, cam); frames++;
      if (now - t0 < 3000) requestAnimationFrame(tick); else done();
    }
    requestAnimationFrame(tick);
  });
  const fps = frames / ((performance.now() - t0) / 1000);
  const tris = renderer.info.render.triangles, calls = renderer.info.render.calls;
  for (const a of actors) a.dispose();
  const row = document.createElement('tr');
  row.innerHTML = `<td>${esc(col.a.title)}</td><td>${n}</td><td>${fps.toFixed(1)} fps</td><td>${fmtInt(tris)} triangles</td><td>${calls} draw calls</td>`;
  if (!t.rows.length) t.innerHTML = '<tr><th>Attempt</th><th>Count</th><th>Speed</th><th>On screen</th><th>Calls</th></tr>';
  t.appendChild(row);
  (report.crowd ||= []).push({ id: col.a.id, n, fps, tris, calls });
}

// ---------- frame loop ----------
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  for (const c of cols) {
    if (c.kind !== 'attempt' || !c.ok) continue;
    c.actor.update(dt);
    if (state.spin) c.yaw += dt * 0.6;
    const r = c.canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.width < 2) continue;      // off screen: animate, do not draw
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (c.canvas.width !== w || c.canvas.height !== h) { c.canvas.width = w; c.canvas.height = h; }
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    c.cam.aspect = w / h; placeCamera(c.cam, state.view, c.actor.metrics().height, c.yaw);
    renderer.render(c.scene, c.cam);
    c.ctx.drawImage(renderer.domElement, 0, 0);
  }
  requestAnimationFrame(frame);
}

// ---------- boot ----------
async function boot() {
  const meta = await (await fetch('data/attempts.json')).json();
  const only = qs.get('only') ? qs.get('only').split(',') : null;
  if (only) meta.attempts = meta.attempts.filter(a => only.includes(a.id));
  await loadRefs();
  buttons('#c-body', [['male', 'Male'], ['female', 'Female']], 'body');
  buttons('#c-view', Object.entries(VIEWS), 'view');
  buttons('#c-anim', ANIMS.map(a => [a, a]), 'anim');
  buttons('#c-expr', EXPRS.map(e => [e, e]), 'expr');
  for (const [id, key] of [['#c-outfit', 'outfit'], ['#c-spin', 'spin'], ['#c-wire', 'wire'], ['#c-lod', 'lod']]) {
    $(id).checked = state[key]; $(id).onchange = e => { state[key] = e.target.checked; if (key !== 'spin') refreshAll(); };
  }
  cols.push(refColumn());
  for (const a of meta.attempts) cols.push(await attemptColumn(a));
  const cb = $('#crowd-btns');
  for (const c of cols.filter(c => c.ok)) {
    const b = document.createElement('button'); b.textContent = `30 × ${c.a.title}`;
    b.onclick = async () => { b.disabled = true; await crowd(c); b.disabled = false; };
    cb.appendChild(b);
  }
  drawScores(meta);
  await refreshAll();
  requestAnimationFrame(frame);
  report.ready = true;
}
boot().catch(err => { document.body.insertAdjacentHTML('beforeend', `<p class="bad">Page failed: ${esc(err.message)}</p>`); report.error = String(err); });

export { LOOKS, OUTFIT };
