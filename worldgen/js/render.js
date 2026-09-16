// Drawing the world. Two halves:
//   worldPixels(world, opts)  → a plain RGBA buffer (no canvas needed — works in node too)
//   renderWorld(ctx, world, opts) → that buffer scaled onto a canvas, then rivers, roads, nodes and
//                                   labels drawn as vectors on top
// plus renderRegion / renderLocal for the two zoomed-in levels, and legend() for the UI.
//
//   import { renderWorld, worldPixels, legend } from './render.js';
//   renderWorld(ctx, world, { layers: { biomes: true, rivers: true, roads: true, nodes: true, labels: true } });

import { BIOMES, RAMPS, rampColor, hexToRgb, mixHex, palettedColors } from './biomes.js';
import { weatherMap, WEATHER, WEATHER_COLOR, WEATHER_KEYS } from './weather.js';
import { DEFAULT_RELIEF, elevationToMetres, formatMetres, hasSea } from './relief.js';

export const DEFAULT_LAYERS = { biomes: true, hillshade: true, rivers: true, roads: true, nodes: true, labels: true, regions: false, borders: true, aura: false, elevation: false, temperature: false, moisture: false, drainage: false };

const BASE_BIOME_RGB = BIOMES.map(b => hexToRgb(b.color));

/** A tint knob as { rgb, strength }. Accepts '#rrggbb' or { color, strength }. */
function normTint(spec) {
  const color = typeof spec === 'string' ? spec : spec.color;
  if (!color) return null;
  const strength = typeof spec === 'string' ? 0.18 : (spec.strength ?? 0.18);
  return { rgb: hexToRgb(color), strength: Math.max(0, Math.min(1, strength)) };
}

/** A stable colour per region id, for the political view. */
export function regionColor(id) {
  const hue = (id * 47.5) % 360, sat = 38 + ((id * 17) % 22), light = 44 + ((id * 29) % 18);
  return hslToRgb(hue / 360, sat / 100, light / 100);
}
function hslToRgb(h, s, l) {
  const f = n => { const k = (n + h * 12) % 12; const a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1))))); };
  return [f(0), f(8), f(4)];
}

/**
 * The base map as raw pixels, one pixel per world cell.
 * opts: { layer: 'biomes'|'elevation'|'temperature'|'moisture'|'drainage'|'aura'|'magic'|'regions',
 *         hillshade: true, regionTint: 0..1, auraOverlay: bool,
 *         palette: a PALETTES key (biomes.js) that swaps the biome colours — defaults to world.opts.palette,
 *         atmosphereTint: '#rrggbb' or { color, strength } laid over the whole map — defaults to world.opts.atmosphereTint }
 */
export function worldPixels(world, opts = {}) {
  const { layer = 'biomes', hillshade = true, regionTint = 0, auraOverlay = false, shade: shadeScale = 5.5 } = opts;
  const w = world.width, h = world.height, N = w * h;
  const out = new Uint8ClampedArray(N * 4);
  const palette = opts.palette !== undefined ? opts.palette : world.opts?.palette;
  const BIOME_RGB = palette ? palettedColors(palette).map(b => hexToRgb(b.color)) : BASE_BIOME_RGB;
  const tintSpec = opts.atmosphereTint !== undefined ? opts.atmosphereTint : world.opts?.atmosphereTint;
  const tint = tintSpec ? normTint(tintSpec) : null;
  // a world with no sea (a dry moon, a lava plain) should not paint its low ground ocean blue
  const elevRamp = hasSea(world) ? RAMPS.elevation : (RAMPS.elevationDry || RAMPS.elevation);
  const wMap = layer === 'weather' ? weatherMap(world) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let r, g, b;
    if (layer === 'weather') {
      const c = hexToRgb(WEATHER_COLOR[WEATHER_KEYS[wMap[i]]] || '#888888');
      r = c[0]; g = c[1]; b = c[2];
    } else if (layer === 'biomes' || layer === 'regions') {
      const c = BIOME_RGB[world.biome[i]]; r = c[0]; g = c[1]; b = c[2];
      if (layer === 'regions' && world.region && world.region[i] >= 0) {
        const rc = regionColor(world.region[i]);
        r = (r + rc[0] * 2) / 3; g = (g + rc[1] * 2) / 3; b = (b + rc[2] * 2) / 3;
      } else if (regionTint > 0 && world.region && world.region[i] >= 0) {
        const rc = regionColor(world.region[i]);
        r = r * (1 - regionTint) + rc[0] * regionTint; g = g * (1 - regionTint) + rc[1] * regionTint; b = b * (1 - regionTint) + rc[2] * regionTint;
      }
    } else {
      let t, ramp;
      if (layer === 'elevation') { t = world.elevation[i]; ramp = elevRamp; }
      else if (layer === 'temperature') { t = world.temperature[i]; ramp = RAMPS.temperature; }
      else if (layer === 'moisture') { t = world.moisture[i]; ramp = RAMPS.moisture; }
      else if (layer === 'drainage') { t = Math.min(1, Math.log10(1 + world.flow[i]) / 3.2); ramp = RAMPS.drainage; }
      else if (layer === 'aura') { t = world.aura[i] * 0.5 + 0.5; ramp = RAMPS.aura; }
      else if (layer === 'magic') { t = world.magic[i]; ramp = RAMPS.magic; }
      else { t = world.elevation[i]; ramp = RAMPS.elevation; }
      const c = hexToRgb(rampColor(ramp, t)); r = c[0]; g = c[1]; b = c[2];
    }

    if (hillshade && world.water[i] === 0) {
      // light from the north-west, strength from the local slope
      const l = world.elevation[y * w + Math.max(0, x - 1)], rr = world.elevation[y * w + Math.min(w - 1, x + 1)];
      const u = world.elevation[Math.max(0, y - 1) * w + x], d = world.elevation[Math.min(h - 1, y + 1) * w + x];
      const shade = ((l - rr) + (u - d)) * shadeScale;
      const k = 1 + Math.max(-0.55, Math.min(0.55, shade));
      r *= k; g *= k; b *= k;
    } else if (hillshade && world.water[i] === 1) {
      const depth = (0.5 - world.elevation[i]) / 0.5;
      const k = 1 - depth * 0.18;
      r *= k; g *= k; b *= k;
    }

    if (auraOverlay && layer === 'biomes' && world.water[i] === 0) {
      const a = world.aura[i];
      if (a > 0.25) { const k = (a - 0.25) * 0.45; r = r * (1 - k) + 150 * k; g = g * (1 - k) + 30 * k; b = b * (1 - k) + 60 * k; }
      else if (a < -0.25) { const k = (-a - 0.25) * 0.45; r = r * (1 - k) + 120 * k; g = g * (1 - k) + 230 * k; b = b * (1 - k) + 160 * k; }
      const m = world.magic[i];
      if (m > 0.6) { const k = (m - 0.6) * 0.5; r = r * (1 - k) + 170 * k; g = g * (1 - k) + 140 * k; b = b * (1 - k) + 250 * k; }
    }

    if (tint) {
      const k = tint.strength;
      r = r * (1 - k) + tint.rgb[0] * k; g = g * (1 - k) + tint.rgb[1] * k; b = b * (1 - k) + tint.rgb[2] * k;
    }

    const o = i * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
  }
  return { width: w, height: h, data: out };
}

/** Cells on a region border (for drawing thin outlines). */
function borderMask(world) {
  const w = world.width, h = world.height, N = w * h;
  const mask = new Uint8Array(N);
  if (!world.region) return mask;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (world.region[i] < 0) continue;
    if ((x < w - 1 && world.region[i + 1] >= 0 && world.region[i + 1] !== world.region[i]) ||
        (y < h - 1 && world.region[i + w] >= 0 && world.region[i + w] !== world.region[i])) mask[i] = 1;
  }
  return mask;
}

const NODE_STYLE = {
  capital: { r: 5.2, fill: '#ffe08a', stroke: '#3a2a10', shape: 'star' },
  city: { r: 4.2, fill: '#f6f0e2', stroke: '#2a2a2a', shape: 'square' },
  town: { r: 3.4, fill: '#e8ddc4', stroke: '#2a2a2a', shape: 'square' },
  village: { r: 2.6, fill: '#cfc6ae', stroke: '#2a2a2a', shape: 'circle' },
  hamlet: { r: 2.0, fill: '#b6ad98', stroke: '#2a2a2a', shape: 'circle' },
  port: { r: 3.0, fill: '#8fd3ff', stroke: '#123045', shape: 'diamond' },
  ruin: { r: 2.8, fill: '#9a8f7d', stroke: '#2a2418', shape: 'triangle' },
  shrine: { r: 2.6, fill: '#ffd9f0', stroke: '#402038', shape: 'diamond' },
  cave: { r: 2.6, fill: '#6b6257', stroke: '#1b1815', shape: 'circle' },
  tower: { r: 3.0, fill: '#c9b6ff', stroke: '#2c2246', shape: 'triangle' },
  monolith: { r: 2.6, fill: '#b9b2c8', stroke: '#2a2634', shape: 'square' },
  volcano: { r: 3.6, fill: '#ff8b5a', stroke: '#3a1508', shape: 'triangle' },
  waterfall: { r: 2.6, fill: '#a8e6ff', stroke: '#123045', shape: 'diamond' },
  ancientwood: { r: 3.0, fill: '#4fae6a', stroke: '#12301c', shape: 'circle' },
  battlefield: { r: 2.8, fill: '#d16a6a', stroke: '#3a1414', shape: 'square' },
  dungeon: { r: 3.2, fill: '#8f4f8f', stroke: '#2a122a', shape: 'diamond' },
  lair: { r: 3.2, fill: '#a04a3a', stroke: '#2a1210', shape: 'triangle' },
  pass: { r: 2.4, fill: '#d8d2c4', stroke: '#2a2a2a', shape: 'cross' },
  bridge: { r: 2.2, fill: '#cbbfa6', stroke: '#2a2a2a', shape: 'cross' },
  ford: { r: 2.0, fill: '#bcd4dd', stroke: '#2a2a2a', shape: 'cross' },
  crater: { r: 3.0, fill: '#a09a90', stroke: '#2a2622', shape: 'circle' },
  vent: { r: 2.8, fill: '#ffb06a', stroke: '#3a1e0e', shape: 'diamond' },
};
export function nodeStyle(kind) { return NODE_STYLE[kind] || { r: 2.4, fill: '#ddd', stroke: '#222', shape: 'circle' }; }

function drawShape(ctx, shape, x, y, r) {
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(x, y, r, 0, Math.PI * 2);
  else if (shape === 'square') ctx.rect(x - r, y - r, r * 2, r * 2);
  else if (shape === 'diamond') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (shape === 'triangle') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r * 0.8); ctx.lineTo(x - r, y + r * 0.8); ctx.closePath(); }
  else if (shape === 'star') {
    for (let i = 0; i < 10; i++) { const a = (Math.PI / 5) * i - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
    ctx.closePath();
  } else if (shape === 'cross') { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
}

/** Text with a dark halo so labels stay readable over any biome. */
function label(ctx, text, x, y, { size = 11, color = '#fff', halo = 'rgba(8,10,14,0.85)', align = 'center', weight = '600', font = 'system-ui, sans-serif' } = {}) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 4); ctx.strokeStyle = halo; ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y); ctx.fillStyle = color; ctx.fillText(text, x, y);
}

/** Boxes already taken by a label — keeps the map from turning into a pile of text. */
class LabelSpace {
  constructor() { this.boxes = []; }
  fits(x, y, w, h) {
    for (const b of this.boxes) if (x < b[2] && x + w > b[0] && y < b[3] && y + h > b[1]) return false;
    return true;
  }
  take(x, y, w, h) { this.boxes.push([x, y, x + w, y + h]); }
}

/**
 * Draw the world map.
 * opts: { layers, layer ('biomes'|debug layer), scale (px per cell, else fitted), highlightRegion,
 *         labelDensity 0..1, selection: {x,y} }
 */
export function renderWorld(ctx, world, opts = {}) {
  const layers = { ...DEFAULT_LAYERS, ...(opts.layers || {}) };
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const scale = opts.scale || Math.min(W / world.width, H / world.height);
  const ox = opts.offsetX ?? Math.round((W - world.width * scale) / 2);
  const oy = opts.offsetY ?? Math.round((H - world.height * scale) / 2);
  const layerName = opts.layer || (layers.regions ? 'regions' : layers.elevation ? 'elevation' : layers.temperature ? 'temperature' : layers.moisture ? 'moisture' : layers.drainage ? 'drainage' : 'biomes');

  ctx.save();
  ctx.fillStyle = '#0a0d13'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;

  const px = worldPixels(world, { layer: layerName, hillshade: layers.hillshade, auraOverlay: layers.aura });
  const img = ctx.createImageData(world.width, world.height);
  img.data.set(px.data);
  // paint into a small buffer canvas, then blow it up
  const buf = makeBuffer(ctx, world.width, world.height);
  buf.putImageData(img, 0, 0);
  ctx.drawImage(buf.canvas, ox, oy, world.width * scale, world.height * scale);

  const X = x => ox + (x + 0.5) * scale, Y = y => oy + (y + 0.5) * scale;

  // region borders
  if (layers.borders && world.region && world.opts?.inhabited !== false) {
    const mask = borderMask(world);
    ctx.fillStyle = 'rgba(12,14,20,0.45)';
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      if (mask[y * world.width + x]) ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(1, scale), Math.max(1, scale));
    }
  }

  // rivers
  if (layers.rivers) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of world.rivers) {
      ctx.beginPath();
      r.cells.forEach((c, i) => { const x = X(c % world.width), y = Y((c / world.width) | 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = '#3f8fc4'; ctx.lineWidth = Math.max(1.1, scale * (0.3 + r.width * 0.2));
      ctx.stroke();
    }
  }

  // sea lanes then roads
  if (layers.roads) {
    ctx.setLineDash([scale * 1.2, scale * 1.2]);
    ctx.strokeStyle = 'rgba(190,220,255,0.45)'; ctx.lineWidth = Math.max(0.6, scale * 0.14);
    for (const l of world.seaLanes || []) {
      ctx.beginPath();
      l.cells.forEach((c, i) => { const x = X(c % world.width), y = Y((c / world.width) | 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const order = { trail: 0, road: 1, highway: 2 };
    for (const road of [...world.roads].sort((a, b) => order[a.class] - order[b.class])) {
      ctx.beginPath();
      road.cells.forEach((c, i) => { const x = X(c % world.width), y = Y((c / world.width) | 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      if (road.class === 'highway') { ctx.strokeStyle = 'rgba(50,36,24,0.85)'; ctx.lineWidth = Math.max(1.1, scale * 0.34); }
      else if (road.class === 'road') { ctx.strokeStyle = 'rgba(62,48,34,0.7)'; ctx.lineWidth = Math.max(0.8, scale * 0.22); }
      else { ctx.strokeStyle = 'rgba(70,60,48,0.5)'; ctx.lineWidth = Math.max(0.6, scale * 0.14); ctx.setLineDash([scale * 0.7, scale * 0.7]); }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // highlighted region outline
  if (opts.highlightRegion != null && world.region) {
    ctx.fillStyle = 'rgba(90,176,255,0.22)';
    for (let y = 0; y < world.height; y++) for (let x = 0; x < world.width; x++) {
      if (world.region[y * world.width + x] === opts.highlightRegion) ctx.fillRect(ox + x * scale, oy + y * scale, Math.max(1, scale), Math.max(1, scale));
    }
  }

  // nodes
  const space = new LabelSpace();
  if (layers.nodes) {
    const shown = world.nodes.filter(n => {
      if (scale > 5) return true;
      if (scale > 3) return n.type !== 'crossing';
      return n.type === 'settlement' ? n.size >= 2 : n.type === 'dungeon' || n.kind === 'volcano' || n.type === 'port';
    });
    for (const n of shown) {
      const st = nodeStyle(n.kind);
      const r = Math.max(1.5, st.r * Math.min(1.6, Math.max(0.55, scale / 4)));
      ctx.lineWidth = Math.max(0.6, r * 0.32); ctx.strokeStyle = st.stroke; ctx.fillStyle = st.fill;
      drawShape(ctx, st.shape, X(n.x), Y(n.y), r);
      if (st.shape === 'cross') ctx.stroke(); else { ctx.fill(); ctx.stroke(); }
    }
  }

  // labels: regions first (they matter most), then the biggest settlements
  if (layers.labels) {
    const density = opts.labelDensity ?? 0.6;
    if (world.regions.length && scale >= 1.6) {
      for (const r of world.regions) {
        if (r.cells < 40 / Math.max(0.6, scale / 4)) continue;
        const size = Math.max(9, Math.min(15, 7 + Math.sqrt(r.cells) * 0.28));
        const est = r.name.length * size * 0.5, x = X(r.label.x) - est / 2, y = Y(r.label.y) - size / 2;
        if (!space.fits(x, y, est, size * 1.3)) continue;
        space.take(x - 2, y - 2, est + 4, size * 1.3 + 4);
        label(ctx, r.name, X(r.label.x), Y(r.label.y), { size, color: 'rgba(255,248,232,0.95)', weight: '600' });
      }
    }
    const nodes = world.nodes.filter(n => n.type === 'settlement').sort((a, b) => b.size - a.size);
    const maxLabels = Math.round(nodes.length * density);
    let drawn = 0;
    for (const n of nodes) {
      if (drawn >= maxLabels) break;
      if (scale < 3.2 && n.size < 4) continue;
      if (scale < 5 && n.size < 3) continue;
      const size = Math.max(8, Math.min(13, 6 + n.size * 1.5));
      const est = n.name.length * size * 0.5;
      const lx = X(n.x) + nodeStyle(n.kind).r + 3, ly = Y(n.y);
      if (!space.fits(lx, ly - size / 2, est, size * 1.2)) continue;
      space.take(lx - 2, ly - size / 2 - 2, est + 4, size * 1.2 + 4);
      label(ctx, n.name, lx, ly, { size, align: 'left', color: '#fff8e8', weight: '500' });
      drawn++;
    }
  }

  if (opts.selection) {
    ctx.strokeStyle = '#5ab0ff'; ctx.lineWidth = 2;
    ctx.strokeRect(ox + opts.selection.x * scale - 1, oy + opts.selection.y * scale - 1, scale + 2, scale + 2);
  }
  ctx.restore();
  return { scale, ox, oy };
}

/** Turn canvas coordinates back into a world cell. */
export function cellAt(world, px, py, view) {
  const x = Math.floor((px - view.ox) / view.scale), y = Math.floor((py - view.oy) / view.scale);
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null;
  return { x, y };
}

/** Draw a region detail map produced by local.js generateRegionDetail(). */
export function renderRegion(ctx, detail, opts = {}) {
  const layers = { ...DEFAULT_LAYERS, ...(opts.layers || {}) };
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const scale = opts.scale || Math.min(W / detail.width, H / detail.height);
  const ox = Math.round((W - detail.width * scale) / 2), oy = Math.round((H - detail.height * scale) / 2);
  ctx.save();
  ctx.fillStyle = '#0a0d13'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const px = worldPixels(detail, { layer: opts.layer || 'biomes', hillshade: layers.hillshade, auraOverlay: layers.aura, shade: 5.5 * (detail.factor || 1) * 0.5 });
  const img = ctx.createImageData(detail.width, detail.height); img.data.set(px.data);
  const buf = makeBuffer(ctx, detail.width, detail.height); buf.putImageData(img, 0, 0);
  ctx.drawImage(buf.canvas, ox, oy, detail.width * scale, detail.height * scale);
  const X = x => ox + (x + 0.5) * scale, Y = y => oy + (y + 0.5) * scale;

  if (layers.rivers) {
    ctx.lineCap = 'round';
    for (const s of detail.streams) {
      ctx.beginPath();
      s.cells.forEach((c, i) => { const x = X(c % detail.width), y = Y((c / detail.width) | 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.strokeStyle = s.major ? '#3f8fc4' : 'rgba(80,150,200,0.7)';
      ctx.lineWidth = Math.max(0.8, scale * (s.major ? 0.5 : 0.26));
      ctx.stroke();
    }
  }
  if (layers.roads) for (const p of detail.paths) {
    ctx.beginPath();
    p.cells.forEach((c, i) => { const x = X(c % detail.width), y = Y((c / detail.width) | 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.strokeStyle = p.class === 'highway' ? 'rgba(226,205,160,0.95)' : p.class === 'road' ? 'rgba(206,186,146,0.85)' : 'rgba(196,180,150,0.6)';
    ctx.lineWidth = Math.max(1.4, scale * (p.class === 'highway' ? 0.8 : 0.55));
    ctx.setLineDash(p.class === 'trail' ? [scale * 1.4, scale * 1.2] : []);
    ctx.stroke(); ctx.setLineDash([]);
  }
  if (layers.nodes) {
    const space = new LabelSpace();
    for (const n of detail.nodes) {
      const st = nodeStyle(n.kind);
      const r = Math.max(2.5, st.r * Math.min(2.2, scale / 3));
      ctx.lineWidth = Math.max(0.8, r * 0.3); ctx.strokeStyle = st.stroke; ctx.fillStyle = st.fill;
      drawShape(ctx, st.shape, X(n.x), Y(n.y), r);
      if (st.shape === 'cross') ctx.stroke(); else { ctx.fill(); ctx.stroke(); }
      if (layers.labels && n.name) {
        const size = 11, est = n.name.length * size * 0.5, lx = X(n.x) + r + 3, ly = Y(n.y);
        if (space.fits(lx, ly - size / 2, est, size * 1.2)) { space.take(lx - 2, ly - size / 2 - 2, est + 4, size * 1.2 + 4); label(ctx, n.name, lx, ly, { size, align: 'left' }); }
      }
    }
  }
  if (opts.selection) { ctx.strokeStyle = '#5ab0ff'; ctx.lineWidth = 2; ctx.strokeRect(ox + opts.selection.x * scale - 1, oy + opts.selection.y * scale - 1, scale + 2, scale + 2); }
  ctx.restore();
  return { scale, ox, oy };
}

/** Draw a local tile produced by local.js generateLocalDetail(). */
export function renderLocal(ctx, tile, opts = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const scale = opts.scale || Math.min(W / tile.width, H / tile.height);
  const ox = Math.round((W - tile.width * scale) / 2), oy = Math.round((H - tile.height * scale) / 2);
  ctx.save();
  ctx.fillStyle = '#0a0d13'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  const px = worldPixels(tile, { layer: 'biomes', hillshade: true, shade: opts.shade ?? 26 });
  const img = ctx.createImageData(tile.width, tile.height); img.data.set(px.data);
  const buf = makeBuffer(ctx, tile.width, tile.height); buf.putImageData(img, 0, 0);
  ctx.drawImage(buf.canvas, ox, oy, tile.width * scale, tile.height * scale);
  const X = x => ox + (x + 0.5) * scale, Y = y => oy + (y + 0.5) * scale;

  const FEATURE_STYLE = {
    tree: { fill: '#2e6b36', stroke: '#14301a', r: 0.42 },
    pine: { fill: '#26543f', stroke: '#10281e', r: 0.42 },
    deadtree: { fill: '#5e5044', stroke: '#241e18', r: 0.38 },
    rock: { fill: '#8a857c', stroke: '#2b2926', r: 0.32 },
    boulder: { fill: '#9a958c', stroke: '#2b2926', r: 0.44 },
    bush: { fill: '#4c7a3c', stroke: '#1d2f17', r: 0.26 },
    reed: { fill: '#7d8a4a', stroke: '#2c3018', r: 0.22 },
    pond: { fill: '#2a6fa8', stroke: '#153c5c', r: 0.7 },
    ruinblock: { fill: '#9a8f7d', stroke: '#332c22', r: 0.4 },
    campfire: { fill: '#ff9a4a', stroke: '#3a1a08', r: 0.34 },
    crystal: { fill: '#b49cf0', stroke: '#332a4a', r: 0.36 },
    bones: { fill: '#ddd6c2', stroke: '#33302a', r: 0.28 },
  };
  for (const f of tile.features) {
    const st = FEATURE_STYLE[f.kind] || { fill: '#999', stroke: '#222', r: 0.3 };
    const r = st.r * scale * (f.size || 1);
    ctx.fillStyle = st.fill; ctx.strokeStyle = st.stroke; ctx.lineWidth = Math.max(0.5, r * 0.25);
    ctx.beginPath();
    if (f.kind === 'tree' || f.kind === 'bush' || f.kind === 'pond' || f.kind === 'boulder' || f.kind === 'rock') ctx.arc(X(f.x), Y(f.y), r, 0, Math.PI * 2);
    else if (f.kind === 'pine' || f.kind === 'crystal') { ctx.moveTo(X(f.x), Y(f.y) - r); ctx.lineTo(X(f.x) + r * 0.8, Y(f.y) + r * 0.8); ctx.lineTo(X(f.x) - r * 0.8, Y(f.y) + r * 0.8); ctx.closePath(); }
    else ctx.rect(X(f.x) - r, Y(f.y) - r, r * 2, r * 2);
    ctx.fill(); ctx.stroke();
  }
  if (opts.labels !== false && tile.title) label(ctx, tile.title, W / 2, 16, { size: 13 });
  ctx.restore();
  return { scale, ox, oy };
}

/**
 * The elevation legend as real height bands, in metres on the world's own relief scale.
 * Each row: { color, label, share, from, to, depth }. Bands with no cells in them are left out.
 * Depth bands ("0–2,100 m deep") only appear on a world with a sea; a dry world measures its low
 * ground from its datum instead ("−2,100 to 0 m").
 */
export function elevationLegend(world) {
  const relief = world.relief || DEFAULT_RELIEF;
  const sea = hasSea(world);
  const ramp = sea ? RAMPS.elevation : (RAMPS.elevationDry || RAMPS.elevation);
  const cuts = [0, 0.25, 0.5, 0.625, 0.75, 0.875, 1];
  const counts = new Array(cuts.length - 1).fill(0);
  const N = world.elevation.length;
  for (let i = 0; i < N; i++) {
    const e = world.elevation[i];
    let k = 0;
    while (k < counts.length - 1 && e >= cuts[k + 1]) k++;
    counts[k]++;
  }
  const plain = n => Math.abs(Math.round(n)).toLocaleString('en-US');
  const rows = [];
  for (let k = 0; k < counts.length; k++) {
    if (!counts[k]) continue;
    const lo = cuts[k], hi = cuts[k + 1];
    const from = elevationToMetres(lo, relief), to = elevationToMetres(hi, relief);
    const depth = sea && hi <= 0.5;
    let label;
    if (depth) label = `${plain(-to)}–${plain(-from)} m deep`;
    else if (from >= 0) label = `${plain(from)}–${plain(to)} m`;
    else label = `${formatMetres(from)} to ${formatMetres(to)} m`;
    rows.push({ color: rampColor(ramp, (lo + hi) / 2), label, share: counts[k] / N, from, to, depth });
  }
  return rows;
}

/** Legend rows for whatever layer is showing — the viewer renders these as swatches. */
export function legend(world, layerName = 'biomes') {
  if (layerName === 'elevation') return elevationLegend(world);
  if (layerName === 'biomes') {
    const seen = new Map();
    for (let i = 0; i < world.biome.length; i++) seen.set(world.biome[i], (seen.get(world.biome[i]) || 0) + 1);
    const table = world.opts?.palette ? palettedColors(world.opts.palette) : BIOMES;
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ color: table[id].color, label: table[id].name, share: n / world.biome.length }));
  }
  if (layerName === 'weather') {
    const map = weatherMap(world);
    const seen = new Map();
    for (let i = 0; i < map.length; i++) seen.set(map[i], (seen.get(map[i]) || 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => ({
      color: WEATHER_COLOR[WEATHER_KEYS[id]] || '#888888',
      label: WEATHER[id]?.name || WEATHER_KEYS[id],
      share: n / map.length,
    }));
  }
  const ramp = RAMPS[layerName] || RAMPS.elevation;
  const ends = { elevation: ['deep', 'peak'], temperature: ['frozen', 'baking'], moisture: ['parched', 'sodden'], drainage: ['dry', 'river'], aura: ['blessed', 'cursed'], magic: ['none', 'raw magic'] }[layerName] || ['low', 'high'];
  return [0, 0.25, 0.5, 0.75, 1].map((t, i) => ({ color: rampColor(ramp, t), label: i === 0 ? ends[0] : i === 4 ? ends[1] : '', share: 0.2 }));
}

// a scratch canvas for the nearest-neighbour upscale; reused between frames
let bufCanvas = null, bufCtx = null;
function makeBuffer(ctx, w, h) {
  if (!bufCanvas || bufCanvas.width !== w || bufCanvas.height !== h) {
    bufCanvas = typeof OffscreenCanvas !== 'undefined' && !ctx.canvas.ownerDocument
      ? new OffscreenCanvas(w, h)
      : (ctx.canvas.ownerDocument || document).createElement('canvas');
    bufCanvas.width = w; bufCanvas.height = h;
    bufCtx = bufCanvas.getContext('2d');
  }
  return bufCtx;
}

export { mixHex };
