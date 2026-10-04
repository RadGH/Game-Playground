// Thousandvale terrain viewer (stream B): draws a baked zone and reads it back through
// js/rules/terrain-read.js on hover, so what you see is what the server and client measure.
import { parseTerrain, MAX_WALK_SLOPE } from '../js/rules/terrain-read.js';

const $ = id => document.getElementById(id);
const canvas = $('map'), ctx = canvas.getContext('2d');
let terrain = null;

const hex = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

async function load(zone) {
  $('status').textContent = 'loading…'; $('status').className = 'status';
  try {
    const res = await fetch(`../data/zones/${zone}/terrain.bin`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    terrain = parseTerrain(await res.arrayBuffer());
    canvas.width = canvas.height = terrain.size;
    draw();
    const m = terrain.meta;
    $('meta').innerHTML = `<b>${m.name}</b> · ${terrain.extent} m square, ${terrain.size}² samples at ${m.step} m<br>` +
      `heights ${m.heightMin}–${m.heightMax} m · bake v${m.bakeVersion} · input ${m.inputHash}<br>` +
      `World Forge seed ${m.source.world.seed}, macro window ${m.source.macroWindow.join(',')}<br>` +
      `spawn ${m.spawn.x}, ${m.spawn.z}<br>` + m.sites.map(s => `${s.kind}: ${s.name} (${Math.round(s.x)}, ${Math.round(s.z)})`).join('<br>');
    $('status').textContent = 'ready';
    window.__terrainReady = true;
  } catch (err) {
    $('status').textContent = 'failed: ' + err.message; $('status').className = 'status error';
  }
}

function draw() {
  const t = terrain, S = t.size, img = ctx.createImageData(S, S), px = img.data;
  const layer = $('layer').value;
  const colors = t.biomes.map(b => hex(b.color));
  const { height, waterTop, biome } = t.layers;
  const span = t.meta.heightMax - t.meta.heightMin;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const k = j * S + i, x = i * t.step + t.origin.x, z = j * t.step + t.origin.z;
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
    } else if (layer === 'water') {
      const w = t.waterOfSample(i, j);
      const d = Number.isNaN(w) ? 0 : Math.max(0, w - h);
      if (d > 0) { r = 20; g = 80 + 40 * Math.min(1, 1 / (d + 0.5)); b = 140 + Math.min(110, d * 30); } else { r = g = b = 60 * shade; }
    } else {
      [r, g, b] = colors[biome[k]] || [255, 0, 255];
      r *= shade; g *= shade; b *= shade;
    }
    px[k * 4] = r; px[k * 4 + 1] = g; px[k * 4 + 2] = b; px[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if ($('sites').checked) {
    ctx.font = '22px system-ui'; ctx.textAlign = 'center';
    for (const s of t.meta.sites) dot(s.x, s.z, '#ffd36b', s.name);
    dot(t.meta.spawn.x, t.meta.spawn.z, '#6bff9a', 'spawn');
  }
}

function dot(x, z, color, label) {
  const i = (x - terrain.origin.x) / terrain.step, j = (z - terrain.origin.z) / terrain.step;
  ctx.fillStyle = color; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(i, j, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeText(label, i, j - 14); ctx.fillText(label, i, j - 14);
}

canvas.addEventListener('mousemove', e => {
  if (!terrain) return;
  const r = canvas.getBoundingClientRect();
  const x = terrain.origin.x + (e.clientX - r.left) / r.width * terrain.extent;
  const z = terrain.origin.z + (e.clientY - r.top) / r.height * terrain.extent;
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
$('zone').addEventListener('change', () => load($('zone').value));
load($('zone').value);
