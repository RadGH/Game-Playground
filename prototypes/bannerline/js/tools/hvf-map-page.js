// hvf-map.html: look at the Hunters vs Farmers forest generator (js/sim/modes/hvf/mapgen.js).
// One seed with layers, metrics and the hollow list, or a 16-seed compare grid. window.hvfMap exposes
// the current world for screenshot tools and tests.
import { generateWorld, buildWorld, KIND, KIND_NAMES, WALK_FARMER, WALK_HUNTER, bfsMove } from '../sim/modes/hvf/mapgen.js';

const $ = id => document.getElementById(id);
const load = n => fetch(new URL(`../../data/hvf/${n}`, import.meta.url)).then(r => r.json());
const [gen, rules] = await Promise.all([load('mapgen.json'), load('rules.json')]);

const params = new URLSearchParams(location.search);
const st = {
  seed: +(params.get('seed') || 1) >>> 0,
  format: params.get('format') || rules.defaultFormat,
  view: params.get('view') || 'one',
  layers: { terrain: true, relief: true, graph: true, names: true, gladeNames: false, hollows: true, slots: false, hunterReach: false, farmerReach: false, grid: false },
};
const LAYER_NAMES = { terrain: 'Terrain', relief: 'Relief shading', graph: 'Trail graph', names: 'Landmark names', gladeNames: 'Glade names', hollows: 'Hollows', slots: 'Build slots', hunterReach: 'Hunter reach', farmerReach: 'Farmer reach', grid: 'Cell grid' };

$('format').innerHTML = Object.keys(rules.formats).map(f => `<option value="${f}">${f} — ${rules.formats[f].size} m</option>`).join('');
$('format').value = st.format;
$('seed').value = st.seed;

// ── colours ───────────────────────────────────────────────────────────────────────────────────────
const C = {
  [KIND.grass]: [104, 138, 64], [KIND.trail]: [176, 150, 102], [KIND.tree]: [36, 66, 34], [KIND.briar]: [110, 70, 88],
  [KIND.tallgrass]: [146, 158, 70], [KIND.rock]: [128, 128, 122], [KIND.water]: [46, 92, 128], [KIND.ford]: [92, 150, 170],
  [KIND.cliff]: [92, 74, 56], [KIND.ramp]: [160, 132, 92],
};
const TREE_LOOKS = [[34, 64, 32], [42, 74, 36], [28, 56, 38], [74, 98, 40], [104, 78, 48]];   // 3 = orchard, 4 = deadfall
const LEGEND = [['grass', 'Grass'], ['trail', 'Trail'], ['tree', 'Trees (choppable)'], ['briar', 'Briar (farmers only)'], ['tallgrass', 'Tall grass'], ['rock', 'Rock'], ['water', 'Water'], ['ford', 'Ford / shallows'], ['cliff', 'Cliff'], ['ramp', 'Ramp']];
$('legend').innerHTML = LEGEND.map(([k, t]) => `<span><i style="background:rgb(${C[KIND[k]].join(',')})"></i>${t}</span>`).join('')
  + '<span><i style="background:#e9c063;border-radius:50%"></i>Commons</span><span><i style="background:#d9533f"></i>Kennel</span>'
  + '<span><i style="background:none;border:2px solid #f6e7a0"></i>Hollow</span><span><i style="background:#d9533f"></i>Door tree</span>';

function hash(x, y, s) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Paint a world into a canvas at `px` pixels per cell. */
function paint(canvas, w, px, layers) {
  const W = w.cols * px, H = w.rows * px;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H), d = img.data;
  const { cells, level, look, cols } = w;
  const kindAt = (x, z) => (x < 0 || z < 0 || x >= cols || z >= w.rows) ? KIND.tree : cells[z * cols + x];
  const levelAt = (x, z) => (x < 0 || z < 0 || x >= cols || z >= w.rows) ? 0 : level[z * cols + x];
  for (let z = 0; z < w.rows; z++) for (let x = 0; x < cols; x++) {
    const i = z * cols + x, k = cells[i];
    let base = k === KIND.tree ? TREE_LOOKS[look[i]] || TREE_LOOKS[0] : C[k];
    let shade = 1;
    if (layers.relief) {
      if (level[i]) { shade *= 1.12; if (k === KIND.tree) base = [base[0] + 18, base[1] + 14, base[2] - 4]; }   // high ground: lighter, drier wood
      // cliffs lit from the north-west, shadowed on the south-east
      if (k === KIND.cliff) shade *= (levelAt(x - 1, z) === 0 || levelAt(x, z - 1) === 0) ? 1.25 : 0.72;
      // ground in a cliff's shadow
      if (!level[i] && (levelAt(x - 1, z - 1) === 1 || levelAt(x, z - 1) === 1)) shade *= 0.78;
    }
    for (let py = 0; py < px; py++) for (let pxx = 0; pxx < px; pxx++) {
      const gx = x * px + pxx, gy = z * px + py;
      let f = shade;
      const n = hash(gx, gy, 7);
      if (k === KIND.tree) {
        // canopy blobs: brighter toward each crown's centre, darker gaps between
        const cx = (pxx + 0.5) / px - 0.5 + (hash(x, z, 11) - 0.5) * 0.3, cy = (py + 0.5) / px - 0.5 + (hash(x, z, 12) - 0.5) * 0.3;
        const r2 = cx * cx + cy * cy;
        f *= r2 < 0.16 ? 1.18 - r2 * 1.2 : 0.82;
        f *= 0.92 + n * 0.16;
      } else if (k === KIND.water) {
        const shore = [kindAt(x - 1, z), kindAt(x + 1, z), kindAt(x, z - 1), kindAt(x, z + 1)].some(q => q !== KIND.water && q !== KIND.ford);
        f *= (shore ? 1.12 : 0.95) + n * 0.06;
      } else if (k === KIND.tallgrass) f *= 0.85 + (hash(gx, gy >> 1, 3) > 0.5 ? 0.25 : 0) * n;
      else if (k === KIND.briar) f *= 0.8 + (hash(gx >> 1, gy >> 1, 5) > 0.55 ? 0.35 : 0);
      else if (k === KIND.rock) { const cx = (pxx + 0.5) / px - 0.5, cy = (py + 0.5) / px - 0.5; f *= cx * cx + cy * cy < 0.2 ? 1.15 - cy * 0.6 : 0.55; }
      else if (k === KIND.ramp) f *= ((gx + gy) % 4 < 2) ? 1.05 : 0.9;
      else f *= 0.94 + n * 0.1;
      const o = (gy * W + gx) * 4;
      d[o] = Math.min(255, base[0] * f); d[o + 1] = Math.min(255, base[1] * f); d[o + 2] = Math.min(255, base[2] * f); d[o + 3] = 255;
    }
  }
  if (layers.hunterReach || layers.farmerReach) {
    const G = { cols, rows: w.rows, n: cols * w.rows, inb: (x, z) => x >= 0 && z >= 0 && x < cols && z < w.rows };
    const start = Math.floor(w.commons.z / w.cell) * cols + Math.floor(w.commons.x / w.cell);
    const doorSet = new Set(w.doors);
    const fr = bfsMove(G, cells, level, start, c => WALK_FARMER[cells[c]] || doorSet.has(c));
    const hr = bfsMove(G, cells, level, start, c => WALK_HUNTER[cells[c]] === 1);
    for (let i = 0; i < G.n; i++) {
      const walk = WALK_FARMER[cells[i]] || doorSet.has(i);
      if (!walk) continue;
      let tint = null;
      if (layers.hunterReach && hr[i] >= 0) tint = [230, 80, 60];
      else if (layers.farmerReach && fr[i] >= 0 && hr[i] < 0) tint = [80, 160, 240];
      else if (layers.farmerReach && fr[i] < 0) tint = [255, 0, 255];
      if (!tint) continue;
      const x = i % cols, z = (i / cols) | 0;
      for (let py = 0; py < px; py++) for (let pxx = 0; pxx < px; pxx++) {
        const o = ((z * px + py) * W + x * px + pxx) * 4;
        d[o] = d[o] * 0.55 + tint[0] * 0.45; d[o + 1] = d[o + 1] * 0.55 + tint[1] * 0.45; d[o + 2] = d[o + 2] * 0.55 + tint[2] * 0.45;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const s = px / w.cell;   // pixels per metre
  if (layers.grid && px >= 4) {
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= cols; x++) { ctx.moveTo(x * px + 0.5, 0); ctx.lineTo(x * px + 0.5, H); }
    for (let z = 0; z <= w.rows; z++) { ctx.moveTo(0, z * px + 0.5); ctx.lineTo(W, z * px + 0.5); }
    ctx.stroke();
  }
  if (layers.graph) {
    ctx.lineWidth = Math.max(1, px * 0.35); ctx.strokeStyle = 'rgba(255, 236, 170, .55)'; ctx.setLineDash([px * 1.2, px]);
    ctx.beginPath();
    for (const e of w.graph.edges) { const a = w.graph.nodes[e.a], b = w.graph.nodes[e.b]; ctx.moveTo(a.x * s, a.z * s); ctx.lineTo(b.x * s, b.z * s); }
    ctx.stroke(); ctx.setLineDash([]);
    for (const n of w.graph.nodes) {
      if (n.kind === 'landmark' || n.kind === 'hollowMouth') continue;
      ctx.fillStyle = n.kind === 'commons' ? '#e9c063' : n.kind === 'kennel' ? '#d9533f' : 'rgba(255,240,190,.85)';
      ctx.beginPath(); ctx.arc(n.x * s, n.z * s, n.kind === 'glade' ? Math.max(2, px * 0.7) : Math.max(4, px * 1.6), 0, Math.PI * 2); ctx.fill();
    }
  }
  if (layers.hollows) {
    for (const h of w.hollows) {
      ctx.strokeStyle = '#f6e7a0'; ctx.lineWidth = Math.max(1.5, px * 0.45);
      ctx.beginPath(); ctx.arc(h.x * s, h.z * s, (h.r + w.cell * 0.9) * s, 0, Math.PI * 2); ctx.stroke();
      if (h.mouth) { ctx.fillStyle = '#f6e7a0'; ctx.beginPath(); ctx.arc(h.mouth.x * s, h.mouth.z * s, Math.max(1.5, px * 0.5), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = '#d9533f';
    for (const c of w.doors) { const x = c % cols, z = (c / cols) | 0; ctx.fillRect(x * px + px * 0.2, z * px + px * 0.2, px * 0.6, px * 0.6); }
  }
  if (layers.slots) {
    for (const h of w.hollows) {
      const sl = h.slots[0];
      if (!sl) continue;
      for (const pen of sl.pens) { const x0 = Math.min(...pen.map(c => c % cols)), z0 = Math.min(...pen.map(c => (c / cols) | 0)); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.strokeRect(x0 * px + 1, z0 * px + 1, px * 2 - 2, px * 2 - 2); }
      if (sl.tower >= 0) { ctx.fillStyle = '#5aa7ff'; ctx.fillRect((sl.tower % cols) * px + px * 0.25, ((sl.tower / cols) | 0) * px + px * 0.25, px * 0.5, px * 0.5); }
      ctx.fillStyle = '#ff6a3c'; ctx.fillRect((sl.door % cols) * px + px * 0.3, ((sl.door / cols) | 0) * px + px * 0.3, px * 0.4, px * 0.4);
    }
  }
  if ((layers.names || layers.gladeNames) && px >= 3) {
    ctx.font = `600 ${Math.max(11, Math.round(px * 3.2))}px 'Barlow Semi Condensed', sans-serif`;
    ctx.textAlign = 'center'; ctx.lineJoin = 'round';
    const boxes = [];
    const label = (t, x, y, col) => {
      const wdt = ctx.measureText(t).width, hgt = px * 3.2;
      x = Math.max(wdt / 2 + 4, Math.min(W - wdt / 2 - 4, x));
      let yy = Math.max(hgt, y);
      // nudge down past any label already placed (up to three tries), else skip it
      for (let k = 0; k < 4; k++) {
        const b = [x - wdt / 2 - 3, yy - hgt, x + wdt / 2 + 3, yy + 3];
        if (!boxes.some(o => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) {
          boxes.push(b);
          ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,12,8,.85)'; ctx.strokeText(t, x, yy); ctx.fillStyle = col; ctx.fillText(t, x, yy);
          return;
        }
        yy += hgt + 2;
      }
    };
    for (const n of layers.names ? w.graph.nodes : []) {
      if (!n.name || n.kind === 'hollowMouth') continue;
      if (n.kind === 'glade' && !n.feature) continue;
      label(n.name, n.x * s, n.z * s - px * 1.6, n.kind === 'kennel' ? '#ff9b88' : '#f6e7a0');
    }
    for (const h of layers.names ? w.hollows : []) if (h.name) label(h.name, h.x * s, (h.z - h.r) * s - px * 1.6, '#f6e7a0');
    if (layers.gladeNames) {
      ctx.font = `500 ${Math.max(10, Math.round(px * 2.6))}px 'Barlow Semi Condensed', sans-serif`;
      for (const n of w.graph.nodes) if (n.kind === 'glade' && !n.feature && n.name) label(n.name, n.x * s, n.z * s - px * 1.2, 'rgba(240,232,210,.85)');
    }
  }
}

// ── one-map view ──────────────────────────────────────────────────────────────────────────────────
let world = null;
function makeWorld(seed) {
  const f = rules.formats[st.format];
  const t0 = performance.now();
  let w, err = null;
  try { w = generateWorld(gen, { seed, size: f.size, farmers: f.farmers, hunters: f.hunters }); }
  catch (e) { err = e.message; w = buildWorld(gen, { seed, size: f.size, farmers: f.farmers, hunters: f.hunters }); }
  w.ms = performance.now() - t0; w.error = err;
  return w;
}

$('layers').innerHTML = Object.keys(st.layers).map(k => `<label><input type="checkbox" data-l="${k}" ${st.layers[k] ? 'checked' : ''}>${LAYER_NAMES[k]}</label>`).join('');
$('layers').addEventListener('change', e => { const k = e.target.dataset.l; if (k) { st.layers[k] = e.target.checked; drawOne(); } });

function fmt(v) { return typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : v == null ? '—' : v; }
function drawOne() {
  if (!world) return;
  const avail = Math.min(innerWidth - 360, innerHeight - 90);
  const px = Math.max(3, Math.min(8, Math.floor(avail / world.cols)));
  paint($('map'), world, px, st.layers);
}
function showOne() {
  world = makeWorld(st.seed);
  window.hvfMap = { world, seed: st.seed, format: st.format };
  drawOne();
  const m = world.metrics, v = gen.validate;
  const rows = [
    ['Size', `${world.size} m (${world.cols}² cells)`], ['Seed used', world.seed + (world.attempts > 1 ? ` (try ${world.attempts})` : '')],
    ['Generated in', `${world.ms.toFixed(0)} ms`, world.ms > 150],
    ['Forest', `${Math.round(m.forest * 100)}%`, m.forest < v.forest[0] || m.forest > v.forest[1]], ['Plateau', `${Math.round(m.plateau * 100)}%`], ['Water', `${Math.round(m.water * 100)}%`],
    ['Glades', m.glades], ['Trail loops', m.loops, m.loops < v.loops], ['Dead ends', m.deadEnds], ['Mean branching', fmt(m.branching)],
    ['Hollows', m.hollows], ['Hiddenness', fmt(m.hiddenness)], ['Largest open area', `${m.largestOpen} m²`],
    ['Fords', m.fords], ['Ramps', m.ramps], ['Kennel to Commons', m.kennelDistance == null ? '—' : `${m.kennelDistance} m`], ['Features', world.features.map(f => f.name).filter(Boolean).length],
  ];
  $('metrics').innerHTML = rows.map(([k, val, bad]) => `<tr class="${bad ? 'bad' : ''}"><td>${k}</td><td>${val}</td></tr>`).join('');
  $('status').className = 'note' + (world.error ? ' bad' : '');
  $('status').textContent = world.error ? world.error : (world.problems.length ? world.problems.join('; ') : `Valid. ${world.features.filter(f => f.name).map(f => f.name).join(', ')}.`);
  $('hollows').innerHTML = world.hollows.map(h => `<div><span><b>${h.name || 'Hollow ' + (h.id + 1)}</b> · ${h.entry}${h.level ? ' · high' : ''}</span><span>${h.offTrail == null ? '' : h.offTrail + ' m'} · ${Math.round(h.hidden * 100)}% hidden</span></div>`).join('');
}

$('map').addEventListener('mousemove', e => {
  if (!world) return;
  const r = $('map').getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / r.width * world.cols), z = Math.floor((e.clientY - r.top) / r.height * world.rows);
  if (x < 0 || z < 0 || x >= world.cols || z >= world.rows) { $('hover').textContent = ''; return; }
  const i = z * world.cols + x;
  const h = world.hollows.find(h => h.cells.includes(i));
  $('hover').textContent = `${x * world.cell}, ${z * world.cell} m · ${KIND_NAMES[world.cells[i]]}${world.level[i] ? ' (high)' : ''}${world.doors.includes(i) ? ' · door tree' : ''}${h ? ' · ' + (h.name || 'hollow ' + (h.id + 1)) : ''}`;
});
$('map').addEventListener('mouseleave', () => { $('hover').textContent = ''; });

// ── compare grid ─────────────────────────────────────────────────────────────────────────────────
let gridToken = 0;
function showGrid() {
  const token = ++gridToken;
  const tiles = $('tiles');
  tiles.innerHTML = '';
  const seeds = [];
  for (let k = 0; k < 16; k++) seeds.push(st.seed + k);
  const els = seeds.map(seed => {
    const t = document.createElement('div');
    t.className = 'tile'; t.innerHTML = `<canvas></canvas><div class="cap"><b>Seed ${seed}</b><span>…</span></div>`;
    t.addEventListener('click', () => { st.seed = seed; $('seed').value = seed; setView('one'); });
    tiles.appendChild(t);
    return t;
  });
  let k = 0;
  const step = () => {
    if (token !== gridToken || k >= seeds.length) { window.hvfGridDone = token === gridToken; return; }
    const w = makeWorld(seeds[k]);
    paint(els[k].querySelector('canvas'), w, 2, { terrain: true, relief: true, graph: false, names: false, hollows: true });
    const m = w.metrics;
    els[k].querySelector('.cap span').innerHTML = w.error ? '<span class="bad">failed</span>' : `${m.hollows} hollows · ${m.loops} loops · ${Math.round(m.forest * 100)}% forest`;
    k++;
    setTimeout(step, 0);
  };
  window.hvfGridDone = false;
  step();
}

function setView(v) {
  st.view = v;
  for (const b of $('view').querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v);
  $('one').hidden = v !== 'one'; $('grid').hidden = v !== 'grid';
  const q = new URLSearchParams({ seed: st.seed, format: st.format, view: v });
  history.replaceState(null, '', '?' + q);
  if (v === 'one') showOne(); else showGrid();
}
$('view').addEventListener('click', e => { const v = e.target.dataset.v; if (v) setView(v); });
$('format').addEventListener('change', () => { st.format = $('format').value; setView(st.view); });
$('seed').addEventListener('change', () => { st.seed = (+$('seed').value || 0) >>> 0; setView(st.view); });
$('prev').addEventListener('click', () => { st.seed = Math.max(0, st.seed - (st.view === 'grid' ? 16 : 1)); $('seed').value = st.seed; setView(st.view); });
$('next').addEventListener('click', () => { st.seed += st.view === 'grid' ? 16 : 1; $('seed').value = st.seed; setView(st.view); });
$('random').addEventListener('click', () => { st.seed = Math.floor(Math.random() * 1e6); $('seed').value = st.seed; setView(st.view); });
addEventListener('resize', () => { if (st.view === 'one') drawOne(); });
setView(st.view);
