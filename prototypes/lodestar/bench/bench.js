// Lodestar M1 bench: paint the cell world, set it on fire, blow it up, freeze it, strike it — and
// read the tick time and frame rate. Kept forever as the perf check (PLAN §1.4).
//
// window.lodestarBench is the test hook (Playwright): ready, scope, meta, state(), setView(),
// set(), cmd(), step(), frames(n), settle(), probe().

import { createScope } from '../js/render/scope.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scope');
const params = new URLSearchParams(location.search);
const base = new URL('../', import.meta.url).href;
const ZOOMS = [0.25, 0.5, 1, 2, 4, 8];

let worker = null, scope = null, meta = null, materials = null;
let lastStats = null, tick = 0, framesIn = 0;
let tool = 'fire', mat = 'grass';
const frameWaiters = [];
let flushId = 0;
let readyResolve;
const ready = new Promise((r) => { readyResolve = r; });

const TOOLS = [
  ['pan', 'Pan'], ['paint', 'Paint'], ['fire', 'Fire'], ['blast', 'Blast'], ['big', 'Big blast'],
  ['frost', 'Frost'], ['zap', 'Lightning'], ['rain', 'Rain'], ['lamp', 'Lamp'], ['more', '⋯'],
];
const PAINTABLE = ['grass', 'dry_grass', 'tree', 'shrub', 'soil', 'sand', 'rock', 'ore_coal', 'crystal', 'shallow', 'deep', 'lava', 'wall', 'cliff', 'road'];

function buildUi() {
  const tb = $('tools');
  for (const [id, label] of TOOLS) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.dataset.tool = id;
    b.addEventListener('click', () => {
      if (id === 'more') { $('more').classList.toggle('hidden'); b.classList.toggle('on'); return; }
      tool = id; refreshTools();
    });
    tb.appendChild(b);
  }
  const mb = $('mats');
  for (const id of PAINTABLE) {
    const row = materials.list.find((m) => m.id === id);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'mat'; b.dataset.mat = id;
    const sw = document.createElement('i');
    sw.style.background = row ? row.colors[0] : '#8f7a5a';
    const sp = document.createElement('span'); sp.textContent = row ? row.name : 'Road';
    b.append(sw, sp);
    b.title = row ? row.name : 'Road (a firebreak)';
    b.addEventListener('click', () => { mat = id; tool = 'paint'; refreshTools(); });
    mb.appendChild(b);
  }
  const wd = $('windDir');
  ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'].forEach((n, i) => {
    const o = document.createElement('option'); o.value = i; o.textContent = 'to ' + n; wd.appendChild(o);
  });
  wd.value = '0';
  refreshTools();
  const send = () => {
    const dir = +wd.value, st = +$('windStr').value;
    cmd({ t: 'dev.wind', dir, strength: st });
    // drift the smoke wisps at about the speed the sim carries the gas
    const D = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]][dir];
    const share = (materials.rules?.gas?.advect || materials.gas?.advect || [0, 0.22, 0.42, 0.62])[st] || 0;
    const k = (share * 40) / 1.6 / (D[0] && D[1] ? 1.41 : 1);
    scope.opts.wind = [D[0] * k, D[1] * k];
  };
  send.init = true;
  window.__sendWind = send;
  wd.addEventListener('change', send);
  $('windStr').addEventListener('input', send);
  $('tod').addEventListener('input', () => { scope.opts.time = +$('tod').value / 1000; });
  $('quality').addEventListener('change', () => { scope.opts.quality = $('quality').value; });
  $('crt').addEventListener('change', () => { scope.opts.crt = $('crt').checked; });
  $('tps').addEventListener('change', () => { setRate(+$('tps').value); });
  $('regen').addEventListener('click', () => start(+$('seed').value || 1, $('mapSize').value));
  $('stressFires').addEventListener('click', () => cmd({ t: 'dev.stress', kind: 'fires', n: 80 }));
  $('stressBlasts').addEventListener('click', () => cmd({ t: 'dev.stress', kind: 'blasts', n: 50 }));
  let raining = false;
  $('rainAll').addEventListener('click', () => { raining = !raining; $('rainAll').textContent = 'Rain: ' + (raining ? 'on' : 'off'); cmd({ t: 'dev.rainAll', on: raining }); });
  let sight = 0;
  $('goto').addEventListener('click', () => {
    const s = sights();
    const p = s[sight++ % s.length];
    setView(p.x, p.y, p.zoom);
  });
}

function sights() {
  const out = [{ x: meta.hq.x, y: meta.hq.y, zoom: 2, name: 'HQ spot' }];
  for (const f of meta.fords) out.push({ x: f.x, y: f.y, zoom: 4, name: 'ford' });
  for (const l of meta.lava) out.push({ x: l.x, y: l.y, zoom: 1, name: 'lava field' });
  for (const p of meta.plateaus) out.push({ x: p.x, y: p.y, zoom: 1, name: 'plateau' });
  return out;
}

function refreshTools() {
  for (const b of document.querySelectorAll('#tools button')) if (b.dataset.tool !== 'more') b.classList.toggle('on', b.dataset.tool === tool);
  for (const b of document.querySelectorAll('#mats button')) b.classList.toggle('on', tool === 'paint' && b.dataset.mat === mat);
  $('mats').classList.toggle('hidden', tool !== 'paint');
}

function cmd(c) { worker.postMessage({ type: 'cmd', cmd: c }); }
function setRate(tps) { worker.postMessage({ type: 'rate', tps }); scope.opts.tps = tps || 20; }
function sendView() {
  const r = scope.viewRect();
  worker.postMessage({ type: 'view', x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
}
function setView(cx, cy, zoom) {
  if (zoom) scope.view.zoom = zoom;
  scope.view.cx = cx; scope.view.cy = cy;
  clampView();
  sendView();
}
function clampView() {
  const [W, H] = scope.size;
  scope.view.cx = Math.max(0, Math.min(W, scope.view.cx));
  scope.view.cy = Math.max(0, Math.min(H, scope.view.cy));
}

function start(seed, size) {
  if (worker) worker.terminate();
  worker = new Worker(new URL('../js/worker/sim-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = onMessage;
  worker.onerror = (e) => { $('readout').textContent = 'worker error: ' + (e.message || e); console.error('worker error', e.message || e); };
  worker.postMessage({ type: 'init', base, seed, size, bare: true });
  $('readout').textContent = 'building map…';
}

function onMessage(e) {
  const m = e.data;
  if (m.type === 'ready') {
    meta = m.meta;
    if (!scope) {
      materials = m.materials;
      scope = createScope(canvas, { materials });
      scope.opts.crt = params.get('crt') !== '0';
      $('crt').checked = scope.opts.crt;
      if (params.get('fxslow')) scope.opts.fxSlow = +params.get('fxslow'); // stretch flashes/bolts for screenshots
      if (params.get('q')) { scope.opts.quality = params.get('q'); $('quality').value = params.get('q'); }
      buildUi();
      bindInput();
      requestAnimationFrame(frame);
    }
    scope.setWorld(m.W, m.H);
    scope.view.cx = meta.hq.x; scope.view.cy = meta.hq.y; scope.view.zoom = +(params.get('zoom') || 2);
    window.lodestarBench.meta = meta;
    window.lodestarBench.genMs = m.genMs;
    sendView();
    window.__sendWind();
    setRate(+$('tps').value);
    readyResolve();
  } else if (m.type === 'frame') {
    if (!scope) return;
    tick = m.tick;
    framesIn++;
    const ch = m.chunks;
    for (let k = 0; k < ch.length; k += 2) scope.putChunk(ch[k], new Uint32Array(ch[k + 1]));
    const gs = m.gas;
    for (let k = 0; k < gs.length; k += 2) scope.putGas(gs[k], new Uint8Array(gs[k + 1]));
    if (m.debris) scope.setDebris(new Float32Array(m.debris), performance.now());
    const now = performance.now();
    for (const ev of m.events) scope.event(ev, now);
    if (m.stats) lastStats = m.stats;
    window.lodestarBench.lastFrame = { tick: m.tick, chunks: ch.length / 2 };
    for (let i = frameWaiters.length - 1; i >= 0; i--) {
      const w = frameWaiters[i];
      if (--w.n <= 0) { frameWaiters.splice(i, 1); w.resolve(m); }
    }
  }
}

// ---- input: tools, pan, wheel/pinch zoom, keys
function bindInput() {
  const pointers = new Map();
  let painting = false, panning = false, last = null, pinch = null;
  const worldAt = (ev) => {
    const r = canvas.getBoundingClientRect();
    return scope.screenToWorld(ev.clientX - r.left, ev.clientY - r.top);
  };
  const apply = (ev, first) => {
    const [x, y] = worldAt(ev).map(Math.floor);
    const r = +$('brush').value;
    if (tool === 'paint') cmd({ t: 'dev.paint', x, y, r, mat });
    else if (tool === 'lamp') { if (first) cmd({ t: 'dev.paint', x, y, r: 1, mat: 'lamp' }); }
    else if (tool === 'fire') cmd({ t: 'dev.ignite', x, y, r: Math.max(1, r >> 1) });
    else if (!first) return;
    else if (tool === 'blast') cmd({ t: 'dev.blast', x, y, r: 9, power: 1 });
    else if (tool === 'big') cmd({ t: 'dev.blast', x, y, r: 22, power: 2 });
    else if (tool === 'frost') cmd({ t: 'dev.frost', x, y, r: 14 });
    else if (tool === 'zap') cmd({ t: 'dev.lightning', x, y });
    else if (tool === 'rain') cmd({ t: 'dev.rain', x, y, r: 70, ticks: 600 });
  };
  canvas.addEventListener('pointerdown', (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pointers.size === 2) {
      painting = false; panning = false;
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: scope.view.zoom };
      return;
    }
    last = [ev.clientX, ev.clientY];
    if (tool === 'pan' || ev.button === 1 || ev.button === 2) panning = true;
    else { painting = true; apply(ev, true); }
  });
  canvas.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      scope.view.zoom = Math.max(0.25, Math.min(8, pinch.zoom * (d / pinch.d)));
      sendView();
      return;
    }
    if (panning && last) {
      scope.view.cx -= (ev.clientX - last[0]) / scope.view.zoom;
      scope.view.cy -= (ev.clientY - last[1]) / scope.view.zoom;
      last = [ev.clientX, ev.clientY];
      clampView(); sendView();
    } else if (painting) apply(ev, false);
  });
  const up = (ev) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    painting = false; panning = false; last = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const before = worldAt(ev);
    let i = ZOOMS.findIndex((z) => z >= scope.view.zoom - 1e-6);
    if (i < 0) i = ZOOMS.length - 1;
    i = Math.max(0, Math.min(ZOOMS.length - 1, i + (ev.deltaY < 0 ? 1 : -1)));
    scope.view.zoom = ZOOMS[i];
    const after = worldAt(ev);
    scope.view.cx += before[0] - after[0]; scope.view.cy += before[1] - after[1];
    clampView(); sendView();
  }, { passive: false });
  const keys = new Set();
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    keys.add(e.key.toLowerCase());
    if (e.key === '+' || e.key === '=') { const i = ZOOMS.indexOf(scope.view.zoom); scope.view.zoom = ZOOMS[Math.min(5, (i < 0 ? 2 : i) + 1)]; sendView(); }
    if (e.key === '-') { const i = ZOOMS.indexOf(scope.view.zoom); scope.view.zoom = ZOOMS[Math.max(0, (i < 0 ? 2 : i) - 1)]; sendView(); }
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  let lastT = performance.now();
  (function panLoop() {
    const now = performance.now(), dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const sp = 600 * dt / scope.view.zoom;
    let mx = 0, my = 0;
    if (keys.has('w') || keys.has('arrowup')) my -= 1; // W = screen north
    if (keys.has('s') || keys.has('arrowdown')) my += 1;
    if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
    if (keys.has('d') || keys.has('arrowright')) mx += 1;
    if (mx || my) { scope.view.cx += mx * sp; scope.view.cy += my * sp; clampView(); sendView(); }
    requestAnimationFrame(panLoop);
  })();
  addEventListener('resize', () => sendView());
}

function frame(now) {
  scope.render(now);
  const s = lastStats;
  const r = scope.viewRect();
  $('readout').textContent =
    `tick ${tick}  fps ${scope.stats.fps}  draw ${scope.stats.frameMs.toFixed(1)} ms` +
    (s ? `\nsim ${s.median} ms median · ${s.max} max · ${s.awake} awake chunks` +
      `\nburning ${s.burning} · debris ${s.debris} · gas chunks ${s.gasAwake}` : '') +
    `\nrange ${scope.view.zoom} px/cell · ${Math.round(r.x0)},${Math.round(r.y0)} · ${scope.opts.quality}${scope.hdr ? '' : ' (8-bit)'}`;
  requestAnimationFrame(frame);
}

// ---- test hook
window.lodestarBench = {
  ready,
  get scope() { return scope; },
  meta: null,
  state() {
    return { tick, fps: scope?.stats.fps, frameMs: scope?.stats.frameMs, stats: lastStats, view: { ...scope.view }, held: scope?.chunksHeld, framesIn };
  },
  setView,
  set(o) { Object.assign(scope.opts, o); },
  cmd,
  setRate,
  step(n) { worker.postMessage({ type: 'step', n }); },
  frames(n = 1) { return new Promise((resolve) => frameWaiters.push({ n, resolve })); },
  /** Wait until a frame arrives with no chunks left to send for the current view. */
  async settle(max = 60) {
    for (let k = 0; k < max; k++) {
      const id = ++flushId;
      worker.postMessage({ type: 'flush', id });
      // frames already in flight may predate the view change: wait for one that saw this flush
      let f;
      do { f = await this.frames(1); } while ((f.ack | 0) < id);
      if (f.chunks.length === 0) return true;
    }
    return false;
  },
  worldToScreen: (x, y) => scope.worldToScreen(x, y),
  /** Render and read the drawn pixel at the centre of each world cell [[x, y], ...]. */
  probe(cells) {
    const pts = cells.map(([x, y]) => scope.worldToScreen(x + 0.5, y + 0.5));
    return scope.readAt(pts);
  },
  cellAt: (x, y) => scope.cellAt(x, y),
  /** Material index by id (same order as data/materials.json). */
  matId: (id) => materials.list.findIndex((m) => m.id === id),
};

start(+(params.get('seed') || 7), params.get('size') || 'normal');
