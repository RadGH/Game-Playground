// Thousandvale terrain viewer (stream B): draws a baked zone and reads it back through
// js/rules/terrain-read.js on hover, so what you see is what the server and client measure.
import { parseTerrain, parseScatter, parseNav, MAX_WALK_SLOPE, NAV } from '../js/rules/terrain-read.js';

const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
let terrain = null, scatter = null, nav = null, placements = [], view = { x0: 0, z0: 0, span: 2048 };

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

async function load(zone) {
  $('status').textContent = 'loading…'; $('status').className = 'status';
  try {
    const res = await fetch(`../data/zones/${zone}/terrain.bin`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    terrain = parseTerrain(await res.arrayBuffer());
    placements = [];
    try { const pr = await fetch(`../data/zones/${zone}/placements.json`); if (pr.ok) placements = (await pr.json()).placements; } catch { /* M0 zones have none */ }
    scatter = nav = null;
    try { const r = await fetch(`../data/zones/${zone}/scatter.bin`); if (r.ok) scatter = parseScatter(await r.arrayBuffer()); } catch { /* none */ }
    try { const r = await fetch(`../data/zones/${zone}/nav.bin`); if (r.ok) nav = parseNav(await r.arrayBuffer()); } catch { /* none */ }
    canvas.width = canvas.height = terrain.size;
    setView();
    draw();
    const m = terrain.meta;
    $('meta').innerHTML = `<b>${m.name}</b> · ${terrain.extent} m square, ${terrain.size}² samples at ${m.step} m<br>` +
      `heights ${m.heightMin}–${m.heightMax} m · bake v${m.bakeVersion} · input ${m.inputHash}<br>` +
      `World Forge seed ${m.source.world.seed}, ${m.source.macroWindow ? `macro window ${m.source.macroWindow.join(",")}` : `zone ${m.zone} at world ${m.source.worldOrigin.x}, ${m.source.worldOrigin.z}`} · ${placements.length} placements<br>` +
      `spawn ${m.spawn.x}, ${m.spawn.z}<br>` + m.sites.map(s => `${s.kind || s.type}: ${s.name || s.id} (${Math.round(s.x)}, ${Math.round(s.z)})${s.hub ? " — hub" : ""}`).join('<br>');
    $('status').textContent = 'ready';
    window.__terrainReady = true;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message; $('status').className = 'status error';
  }
}

function setView() {
  const hub = terrain.meta.sites.find(s => s.hub) || terrain.meta.sites.find(s => s.type === 'settlement');
  if ($('zoom').value === 'town' && hub) { const span = (hub.radius || 65) * 3; view = { x0: hub.x - span / 2, z0: hub.z - span / 2, span }; }
  else view = { x0: terrain.origin.x, z0: terrain.origin.z, span: terrain.extent };
}
/** Canvas pixel for zone metres, and back. */
const toPx = (x, z) => [(x - view.x0) / view.span * canvas.width, (z - view.z0) / view.span * canvas.height];

function draw() {
  const t = terrain, S = t.size, img = ctx.createImageData(S, S), px = img.data;
  const layer = $('layer').value;
  const colors = t.biomes.map(b => hex(b.color));
  const { height, waterTop, biome } = t.layers;
  const span = t.meta.heightMax - t.meta.heightMin;
  for (let pj = 0; pj < S; pj++) for (let pi = 0; pi < S; pi++) {
    const x = view.x0 + (pi + 0.5) / S * view.span, z = view.z0 + (pj + 0.5) / S * view.span;
    const i = Math.max(0, Math.min(S - 1, Math.round((x - t.origin.x) / t.step))), j = Math.max(0, Math.min(S - 1, Math.round((z - t.origin.z) / t.step)));
    const k = j * S + i, o = pj * S + pi;
    const h = t.heightOfSample(i, j);
    // light from the north-west
    const hx = t.heightOfSample(Math.min(S - 1, i + 1), j) - t.heightOfSample(Math.max(0, i - 1), j);
    const hz = t.heightOfSample(i, Math.min(S - 1, j + 1)) - t.heightOfSample(i, Math.max(0, j - 1));
    const shade = Math.max(0.35, Math.min(1.3, 1 - (hx + hz) / (4 * t.step) * 1.4));
    let r, g, b;
    if (layer === 'height') { const v = (h - t.meta.heightMin) / span * 255; r = g = b = v; }
    else if (layer === 'slope') {
      const s = t.slopeAt(x + 0.5, z + 0.5);
      if (s > MAX_WALK_SLOPE) { r = 230; g = 60; b = 80; } else { const v = s / MAX_WALK_SLOPE * 255; r = v; g = 255 - v * 0.5; b = 80; }
    } else if (layer === 'nav' && nav) {
      const v = nav.bits[k];
      if (v & NAV.BUILDING) { r = 150; g = 80; b = 50; } else if (v & NAV.SOLID) { r = 20; g = 60; b = 20; } else if (v & NAV.DEEP) { r = 20; g = 40; b = 140; }
      else if (v & NAV.STEEP) { r = 200; g = 60; b = 80; } else if (v & NAV.ROAD) { r = 210; g = 190; b = 140; } else if (v & NAV.SHALLOW) { r = 80; g = 140; b = 200; }
      else if (v & NAV.TOWN) { r = 120; g = 110; b = 80; } else { r = g = b = 70 * shade; g += 30; }
    } else if (layer === 'water') {
      const w = t.waterOfSample(i, j);
      const d = Number.isNaN(w) ? 0 : Math.max(0, w - h);
      if (d > 0) { r = 20; g = 80 + 40 * Math.min(1, 1 / (d + 0.5)); b = 140 + Math.min(110, d * 30); } else { r = g = b = 60 * shade; }
    } else {
      [r, g, b] = colors[biome[k]] || [255, 0, 255];
      r *= shade; g *= shade; b *= shade;
    }
    px[o * 4] = r; px[o * 4 + 1] = g; px[o * 4 + 2] = b; px[o * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if ($('scatter').checked && scatter) drawScatter();
  if ($('plan').checked) drawPlan();
  if ($('sites').checked) {
    ctx.font = '22px system-ui'; ctx.textAlign = 'center';
    for (const s of t.meta.sites) dot(s.x, s.z, s.type === 'settlement' ? '#ffd36b' : s.type === 'dungeon' ? '#ff5ad1' : s.type === 'event' || s.type === 'camp' ? '#ff7b7b' : '#9ad', s.name || s.id);
    dot(t.meta.spawn.x, t.meta.spawn.z, '#6bff9a', 'spawn');
  }
}

const SC_COL = ['#1f5a24', '#183f2a', '#6d7a2a', '#5a4a3a', '#3f7a3a', '#8a8a80', '#77776c', '#66665a', '#9aa86a'];
function drawScatter() {
  const k = canvas.width / view.span;
  for (let i = 0; i < scatter.count; i++) {
    const [a, b] = toPx(scatter.x[i], scatter.z[i]);
    if (a < -4 || b < -4 || a > canvas.width + 4 || b > canvas.height + 4) continue;
    ctx.fillStyle = SC_COL[scatter.kind[i]] || '#f0f';
    const r = Math.max(0.8, scatter.kinds[scatter.kind[i]].r * scatter.scale[i] * k * (scatter.kind[i] < 4 ? 3 : 1.4));
    ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.fill();
  }
}

function drawPlan() {
  const k = canvas.width / view.span;   // pixels per metre
  for (const p of placements) {
    if (p.kind === 'road') {
      ctx.strokeStyle = p.data.spur ? '#c9b48a' : '#a8916a'; ctx.lineWidth = Math.max(1.5, p.data.width * k); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); p.data.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); n ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
    } else if (p.kind === 'bridge') {
      const [a, b] = toPx(p.x, p.z), L = p.data.span * k / 2 + 3;
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = Math.max(3, 6 * k); ctx.beginPath(); ctx.moveTo(a - Math.sin(p.yaw) * L, b - Math.cos(p.yaw) * L); ctx.lineTo(a + Math.sin(p.yaw) * L, b + Math.cos(p.yaw) * L); ctx.stroke();
    }
  }
  for (const p of placements) {
    if (p.kind === 'street') {
      ctx.strokeStyle = p.data.cls === 'main' ? '#d9c79a' : '#b9a57a'; ctx.lineWidth = Math.max(1, p.data.width * k); ctx.lineCap = 'round';
      ctx.beginPath(); p.data.pts.forEach(([x, z], n) => { const [a, b] = toPx(x, z); n ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
    }
  }
  for (const p of placements) {
    if (p.kind === 'building') {
      const [a, b] = toPx(p.x, p.z);
      ctx.save(); ctx.translate(a, b); ctx.rotate(p.data.angle);
      ctx.fillStyle = '#8a5a3c'; ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 1;
      ctx.fillRect(-p.data.w * k / 2, -p.data.d * k / 2, p.data.w * k, p.data.d * k); ctx.strokeRect(-p.data.w * k / 2, -p.data.d * k / 2, p.data.w * k, p.data.d * k);
      ctx.rotate(-p.data.angle);
      ctx.strokeStyle = '#ffe9a8'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(p.yaw) * p.data.w * k * 0.7, Math.cos(p.yaw) * p.data.w * k * 0.7); ctx.stroke();   // facing
      ctx.restore();
    } else if (p.kind === 'settlement' || p.kind.endsWith('_site')) {
      const [a, b] = toPx(p.x, p.z), r = (p.data.radius || p.data.r) * k;
      ctx.strokeStyle = p.kind === 'settlement' ? (p.data.hub ? '#ffd36b' : '#c8b070') : '#ff7b7b'; ctx.setLineDash([6, 4]); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(a, b, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    } else if (p.kind === 'dungeon_door') {
      const [a, b] = toPx(p.x, p.z);
      ctx.strokeStyle = '#ff5ad1'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(a + Math.sin(p.yaw) * 30, b + Math.cos(p.yaw) * 30); ctx.stroke();
    }
  }
}

function dot(x, z, color, label) {
  const [i, j] = toPx(x, z);
  ctx.fillStyle = color; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(i, j, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeText(label, i, j - 14); ctx.fillText(label, i, j - 14);
}

canvas.addEventListener('mousemove', e => {
  if (!terrain) return;
  const r = canvas.getBoundingClientRect();
  const x = view.x0 + (e.clientX - r.left) / r.width * view.span;
  const z = view.z0 + (e.clientY - r.top) / r.height * view.span;
  const s = terrain.sample(x, z);
  $('readout').textContent =
    `x ${x.toFixed(1)}  z ${z.toFixed(1)}\n` +
    `height  ${s.height.toFixed(2)} m\n` +
    `slope   ${s.slope.toFixed(1)}°\n` +
    `normal  ${s.normal.map(v => v.toFixed(3)).join(', ')}\n` +
    `water   ${s.water.kind}${s.water.kind !== 'none' ? `  surface ${s.water.surface.toFixed(2)}  depth ${s.water.depth.toFixed(2)}` : ''}\n` +
    `biome   ${terrain.biomes[s.biome]?.name}\n` +
    `walk    ${terrain.walkable(x, z) ? 'yes' : 'no'}`;
});
$('layer').addEventListener('change', () => terrain && draw());
$('sites').addEventListener('change', () => terrain && draw());
$('plan').addEventListener('change', () => terrain && draw());
$('scatter').addEventListener('change', () => terrain && draw());
$('zoom').addEventListener('change', () => { if (terrain) { setView(); draw(); } });
$('zone').addEventListener('change', () => load($('zone').value));
load($('zone').value);
