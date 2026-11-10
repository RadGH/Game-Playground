// The top-down map: biome colours, surfaces that matter for driving (roads, mud, snow, sand, water), hill shading.
// Drawn once per size and cached. Labels and markers are NOT baked in — the HUD draws them over this, using
// world.labels / world.sites and worldToMap() below.

import { BIOMES, SURF } from '../../world/world-data.js';
import { drawStationMap } from './station.js';

const SURF_COLOUR = {
  [SURF.road]: [122, 116, 104], [SURF.gravel]: [150, 142, 126], [SURF.mud]: [92, 74, 52], [SURF.snow]: [236, 240, 244],
  [SURF.ice]: [190, 220, 238], [SURF.sand]: [222, 200, 146], [SURF.rock]: [128, 120, 112], [SURF.farm]: [176, 146, 94],
  [SURF.shallows]: [120, 168, 180],
  [SURF.asphalt]: [92, 92, 94], [SURF.concrete]: [184, 180, 172],
  [SURF.regolith]: [150, 148, 144], [SURF.moonrock]: [112, 110, 108],   // the Moon
};

function hex(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

export function drawMap(world, size = 1024) {
  if (world.map === 'station') return drawStationMap(world, size);   // an interior: a plan of the modules
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const d = img.data;
  const half = world.size / 2, step = world.size / size;
  const biomeRGB = BIOMES.map(b => hex(b.map));
  // light from the north-west, like a printed map
  const lx = -0.6, ly = 0.55, lz = -0.58;
  for (let py = 0; py < size; py++) {
    const z = -half + (py + 0.5) * step;
    for (let px = 0; px < size; px++) {
      const x = -half + (px + 0.5) * step;
      let [r, gg, b] = biomeRGB[world.biomeIdAt(x, z)];
      const s = world.surfaceIdAt(x, z);
      const sc = SURF_COLOUR[s];
      if (sc) { const k = s === SURF.road || s === SURF.gravel || s === SURF.asphalt || s === SURF.concrete ? 0.9 : 0.55; r = r + (sc[0] - r) * k; gg = gg + (sc[1] - gg) * k; b = b + (sc[2] - b) * k; }
      const lv = world.waterAt(x, z);
      if (lv != null) {
        const depth = Math.min(1, (lv - world.heightAt(x, z)) / 3);
        r = 70 - 40 * depth; gg = 128 - 50 * depth; b = 160 - 30 * depth;
      }
      const n = world.normalAt(x, z);
      const sh = Math.max(0, n[0] * lx + n[1] * ly + n[2] * lz);
      const k = 0.55 + sh * 0.65;
      // a hint of height: higher ground a touch lighter
      const hk = 1 + Math.max(-0.08, Math.min(0.12, world.heightAt(x, z) / 900));
      const o = (py * size + px) * 4;
      d[o] = Math.min(255, r * k * hk); d[o + 1] = Math.min(255, gg * k * hk); d[o + 2] = Math.min(255, b * k * hk); d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // roads on top, so a 3.6 m road is still a line at 1.5 m a pixel
  const toPx = (v) => ((v + half) / world.size) * size;
  // highways last, so they sit on top where roads meet
  const order = (c) => (c === 'track' || c === 'dirt' ? 0 : c === 'street' ? 1 : c === 'highway' ? 3 : 2);
  for (const r of [...world.roads].sort((a, b) => order(a.cls) - order(b.cls))) {
    g.beginPath();
    r.pts.forEach((p, i) => (i ? g.lineTo(toPx(p[0]), toPx(p[1])) : g.moveTo(toPx(p[0]), toPx(p[1]))));
    const w = Math.max(1, (r.halfW * 2 / world.size) * size);
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (r.cls === 'track' || r.cls === 'dirt') { g.setLineDash([w * 3, w * 2]); g.strokeStyle = 'rgba(110, 80, 50, 0.85)'; g.lineWidth = Math.max(1, w * 0.9); }
    else if (r.cls === 'highway') { g.setLineDash([]); g.strokeStyle = 'rgba(60, 50, 30, 0.6)'; g.lineWidth = w + 2.5; g.stroke(); g.strokeStyle = '#f2d48a'; g.lineWidth = Math.max(1.5, w * 1.1); }
    else {
      const paved = r.cls === 'road' || r.cls === 'lane' || r.cls === 'street';
      g.setLineDash([]); g.strokeStyle = paved ? 'rgba(60, 54, 46, 0.55)' : 'rgba(80, 70, 56, 0.5)'; g.lineWidth = w + 2; g.stroke();
      g.strokeStyle = r.cls === 'street' ? '#cfc8bc' : paved ? '#e8dcc0' : '#d6c8a8'; g.lineWidth = w;
    }
    g.stroke();
  }
  g.setLineDash([]);
  for (const br of world.sites.bridges) {
    g.strokeStyle = '#5a4630'; g.lineWidth = Math.max(2, (br.w / world.size) * size + 2);
    g.beginPath(); g.moveTo(toPx(br.x0), toPx(br.z0)); g.lineTo(toPx(br.x1), toPx(br.z1)); g.stroke();
  }
  // buildings: dark footprints (Wayfare County towns)
  g.fillStyle = 'rgba(58, 52, 60, 0.9)';
  for (const o of world.objects) {
    if (o.kind !== 'building') continue;
    const x0 = toPx(o.x - o.shape.hx), z0 = toPx(o.z - o.shape.hz);
    g.fillRect(x0, z0, Math.max(1, toPx(o.x + o.shape.hx) - x0), Math.max(1, toPx(o.z + o.shape.hz) - z0));
  }
  return c;
}

/** World (x, z) -> map pixel for a map drawn at `size`. */
export function worldToMap(world, x, z, size) {
  return [((x + world.size / 2) / world.size) * size, ((z + world.size / 2) / world.size) * size];
}
