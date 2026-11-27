// World Build — one picture per stage, as plain RGBA pixels plus a list of labels (pure: works in Node and in the
// page's worker). Node writes them as PNGs with the little pixel font below; the page draws the labels with real text.
// North is at the top; one pixel is `mpp` metres.
//
//   const pic = stagePicture(W, stageId, { mpp })  → { w, h, mpp, rgba: Uint8ClampedArray, labels: [{ x, y, text, kind }] }
//   drawLabels(pic)                                  burns the labels into rgba with the pixel font (Node PNGs)

import { BIOMES, BIOME_COLOUR } from './themes.js';
import { clamp, gridSample } from './core.js';

const REGION_COLOURS = [[230, 196, 92], [126, 200, 120], [92, 168, 220], [214, 120, 92], [176, 132, 214], [96, 196, 184], [236, 150, 186], [168, 176, 96], [210, 210, 210], [140, 150, 230]];
const KIND_COLOUR = { town: [255, 214, 90], shrine: [110, 230, 255], camp: [255, 96, 80], dungeon: [196, 120, 255], landmark: [255, 255, 255], pass: [200, 200, 200], lair: [255, 140, 60] };

export function stagePicture(W, stage, { mpp = 4 } = {}) {
  const B = W.bounds || { ...W.brief.size.bounds };
  const w = Math.round((B.maxX - B.minX) / mpp), h = Math.round((B.maxZ - B.minZ) / mpp);
  const rgba = new Uint8ClampedArray(w * h * 4);
  const labels = [];
  const toPx = (x, z) => [(x - B.minX) / mpp, (z - B.minZ) / mpp];
  const put = (px, py, c, a = 1) => {
    px |= 0; py |= 0;
    if (px < 0 || py < 0 || px >= w || py >= h) return;
    const o = (py * w + px) * 4;
    rgba[o] = rgba[o] * (1 - a) + c[0] * a; rgba[o + 1] = rgba[o + 1] * (1 - a) + c[1] * a; rgba[o + 2] = rgba[o + 2] * (1 - a) + c[2] * a; rgba[o + 3] = 255;
  };
  const dot = (x, z, r, c, a = 1) => { const [px, py] = toPx(x, z); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) put(px + dx, py + dy, c, a); };
  const ring = (x, z, rm, c, a = 1) => { const [px, py] = toPx(x, z), r = rm / mpp; for (let t = 0; t < 6.283; t += 1 / Math.max(4, r)) put(px + Math.cos(t) * r, py + Math.sin(t) * r, c, a); };
  const line = (pts, c, width = 1, a = 1, dash = 0) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = toPx(pts[i][0] ?? pts[i].x, pts[i][1] ?? pts[i].z), [x1, y1] = toPx(pts[i + 1][0] ?? pts[i + 1].x, pts[i + 1][1] ?? pts[i + 1].z);
      const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
      for (let s = 0; s <= n; s++) {
        if (dash && Math.floor((i * 97 + s) / dash) % 2) continue;
        const px = x0 + (x1 - x0) * s / n, py = y0 + (y1 - y0) * s / n;
        for (let dy = -(width >> 1); dy <= width >> 1; dy++) for (let dx = -(width >> 1); dx <= width >> 1; dx++) put(px + dx, py + dy, c, a);
      }
    }
  };
  const label = (x, z, text, kind = 'place') => { const [px, py] = toPx(x, z); labels.push({ x: Math.round(px), y: Math.round(py), text, kind }); };

  if (stage === 'brief') { briefPicture(W, { w, h, mpp, B, put, dot, ring, line, label, toPx }); return { w, h, mpp, rgba, labels }; }

  const g = { minX: B.minX, minZ: B.minZ, cell: W.cell, nx: W.nx, nz: W.nz, data: W.H };
  const H = (x, z) => gridSample(g, x, z);
  const M = W.macro;
  const mIdx = (x, z) => clamp(Math.round((z - M.minZ) / M.cell), 0, M.nz - 1) * M.nx + clamp(Math.round((x - M.minX) / M.cell), 0, M.nx - 1);
  const bg = W.T?.biomeGrid?.ids ? W.T.biomeGrid : null;
  // base layer per pixel
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = B.minX + (px + 0.5) * mpp, z = B.minZ + (py + 0.5) * mpp;
    const hh = H(x, z), hx = H(x + mpp, z), hz = H(x, z + mpp);
    const shade = clamp(1 + ((hh - hx) + (hh - hz)) * 0.16 / (mpp / 2), 0.5, 1.4);
    const i2 = clamp(Math.round((x - B.minX) / W.cell), 0, W.nx - 1), k2 = clamp(Math.round((z - B.minZ) / W.cell), 0, W.nz - 1), j2 = k2 * W.nx + i2;
    const wet = !Number.isNaN(W.water[j2]) && W.water[j2] > hh;
    let c;
    if (stage === 'shape' || stage === 'checks') {
      c = hypso(hh);
      if (stage === 'checks') c = c.map(v => v * 0.55 + 60);
    } else if (stage === 'regions') {
      const bid = classifyQuick(W, x, z, hh);
      c = BIOME_COLOUR[bid] || [120, 120, 120];
      const reg = W.pin && W.pin.inKeep(x, z) ? W.regionIndex[W.pin.regionAt(x, z)] : M.region[mIdx(x, z)];
      c = mix(c, REGION_COLOURS[reg % REGION_COLOURS.length], 0.22);
    } else if (stage === 'places' || stage === 'roads') {
      c = hypso(hh).map(v => v * 0.6 + 70);
    } else {
      const bid = bg ? BIOMES[bg.ids[clamp(Math.floor((z - bg.minZ) / bg.cell), 0, bg.nz - 1) * bg.nx + clamp(Math.floor((x - bg.minX) / bg.cell), 0, bg.nx - 1)]] : 'meadow';
      c = BIOME_COLOUR[bid] || [120, 120, 120];
    }
    if (wet) { const d = clamp((W.water[j2] - hh) / 3, 0, 1); c = [64 - 24 * d, 124 - 30 * d, 196 - 30 * d]; }
    put(px, py, c.map(v => clamp(v * shade, 0, 255)));
  }
  // overlays
  const rivLine = r => line(r.pts, [70, 150, 230], Math.max(1, Math.round(r.width / mpp)), 0.9);
  if (stage === 'shape') {
    for (const r of W.rivers) rivLine(r);
    for (const l of W.lakes) label(l.at[0], l.at[1], l.name, 'water');
    for (const r of W.brief.ranges) { const m = r.points[Math.floor(r.points.length / 2)]; label(m[0], m[1], r.name, 'range'); }
    for (const r of W.rivers) if (r.kind === 'river' && r.name) { const p = r.pts[Math.floor(r.pts.length / 2)]; label(p.x, p.z, r.name, 'water'); }
  }
  if (stage === 'regions') {
    // borders (where the region changes) and names + bands
    for (let py = 1; py < h - 1; py++) for (let px = 1; px < w - 1; px++) {
      const x = B.minX + (px + 0.5) * mpp, z = B.minZ + (py + 0.5) * mpp;
      const a = regAt(W, x, z), b = regAt(W, x + mpp, z), c2 = regAt(W, x, z + mpp);
      if (a !== b || a !== c2) put(px, py, [255, 250, 230], 0.85);
    }
    for (const R of W.regionList) {
      const at = R.brief?.at || (R.id === 'brightwater_vale' ? [-320 + W.pin.at[0], 170 + W.pin.at[1]] : [300 + W.pin.at[0], -180 + W.pin.at[1]]);
      label(at[0], at[1], `${R.name} ${R.levels[0]}-${R.levels[1]}`, 'region');
    }
  }
  if (stage === 'places' || stage === 'roads' || stage === 'detail' || stage === 'checks') {
    for (const r of W.rivers) rivLine(r);
    if (W.pin) for (const r of W.pin.riverLines) line(r.pts, [70, 150, 230], Math.max(1, Math.round(r.width / mpp)), 0.9);
  }
  if (stage === 'roads' || stage === 'detail' || stage === 'checks') {
    for (const r of W.roads || []) line(r.pts, r.class === 'road' ? [246, 226, 180] : r.class === 'boardwalk' ? [160, 110, 70] : [214, 190, 150], r.class === 'road' ? 2 : 1, stage === 'checks' ? 0.6 : 1);
  }
  if (stage === 'roads') {
    for (const b of W.bridges || []) { if (b.kind === 'bridge') dot(b.at[0], b.at[1], 2, [255, 255, 255]); else dot(b.at[0], b.at[1], 2, [90, 200, 255]); }
    if (W.pin) { const k = W.pin.keep; line([[k.minX, k.minZ], [k.maxX, k.minZ], [k.maxX, k.maxZ], [k.minX, k.maxZ], [k.minX, k.minZ]], [255, 255, 255], 1, 0.5, 6); }
    for (const id of W.gateRoads || []) { const r = W.roads.find(q => q.id === id); const p = r.pts[r.pts.length - 1]; label(p.x, p.z, r.name, 'road'); }
  }
  if (stage === 'detail') {
    for (const f of W.fields || []) dot(f.at[0], f.at[1], Math.max(1, Math.round(Math.min(...f.size) / mpp / 2)), [222, 196, 104], 0.9);
    for (const hs of W.townPlan?.houses || []) dot(hs.at[0], hs.at[1], 0, [120, 70, 50]);
    for (const hs of W.pinTownPlan?.houses || []) dot(hs.at[0], hs.at[1], 0, [120, 70, 50]);
    for (const sp of W.setPieces || []) for (const q of sp.parts) dot(q.at[0], q.at[1], 0, [235, 235, 235]);
  }
  if (stage === 'places' || stage === 'roads' || stage === 'detail') {
    for (const p of Object.values(W.places || {})) {
      if (p.kind === 'pass') continue;
      const c = KIND_COLOUR[p.kind] || [255, 255, 255];
      const r = p.kind === 'town' ? 4 : 2;
      dot(p.at[0], p.at[1], r + 1, [20, 20, 24]); dot(p.at[0], p.at[1], r, c);
      // names for towns, dungeons and landmarks (camps and shrines are many: their colours say enough)
      if (stage === 'places' && (p.kind === 'town' || (!p.pinned && (p.kind === 'dungeon' || p.kind === 'landmark')))) label(p.at[0], p.at[1], p.name, p.kind);
    }
  }
  if (stage === 'checks' && W.report) {
    for (const c of W.report.checks) for (const pr of c.problems) { ring(pr.at[0], pr.at[1], 30, [255, 70, 70]); ring(pr.at[0], pr.at[1], 34, [255, 70, 70]); }
    for (const p of Object.values(W.places)) if (p.kind !== 'pass') dot(p.at[0], p.at[1], 2, [120, 255, 140]);
  }
  return { w, h, mpp, rgba, labels };
}

function regAt(W, x, z) {
  if (W.pin && W.pin.inKeep(x, z)) return W.regionIndex[W.pin.regionAt(x, z)];
  const M = W.macro;
  return M.region[clamp(Math.round((z - M.minZ) / M.cell), 0, M.nz - 1) * M.nx + clamp(Math.round((x - M.minX) / M.cell), 0, M.nx - 1)];
}
function classifyQuick(W, x, z, h) {
  if (W.pin && W.pin.inKeep(x, z)) return W.pin.T.biomeAt(x - W.pin.at[0], z - W.pin.at[1]);
  const g = { minX: W.bounds.minX, minZ: W.bounds.minZ, cell: W.cell, nx: W.nx, nz: W.nz, data: W.H };
  const e = 2, sl = Math.atan(Math.hypot(gridSample(g, x + e, z) - gridSample(g, x - e, z), gridSample(g, x, z + e) - gridSample(g, x, z - e)) / (2 * e)) * 57.3;
  const i2 = clamp(Math.round((x - W.bounds.minX) / W.cell), 0, W.nx - 1), k2 = clamp(Math.round((z - W.bounds.minZ) / W.cell), 0, W.nz - 1);
  const wv = W.water[k2 * W.nx + i2];
  return W.classify(x, z, h, sl, Number.isNaN(wv) ? -Infinity : wv - h);
}
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
/** Height colours: shore sand, lowland greens, hill browns, rock grey, snow. */
function hypso(h) {
  const stops = [[-20, [40, 70, 130]], [0, [200, 192, 150]], [4, [120, 168, 86]], [40, [96, 146, 74]], [90, [150, 140, 92]], [180, [140, 116, 92]], [300, [150, 146, 140]], [420, [236, 238, 242]]];
  if (h <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (h <= stops[i][0]) { const t = (h - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]); return mix(stops[i - 1][1], stops[i][1], t); }
  return stops[stops.length - 1][1];
}

/** The brief as a sketch: regions as soft discs, ranges, wanted rivers and lakes, the sea, the pinned piece. */
function briefPicture(W, { w, h, mpp, B, put, line, label, toPx }) {
  const b = W.brief;
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const x = B.minX + (px + 0.5) * mpp, z = B.minZ + (py + 0.5) * mpp;
    let best = 0, bd = Infinity;
    b.regions.forEach((r, i) => { const d = Math.hypot(x - r.at[0], z - r.at[1]) / Math.sqrt(r.weight); if (d < bd) { bd = d; best = i; } });
    let c = REGION_COLOURS[(best + (W.pin ? 2 : 0)) % REGION_COLOURS.length].map(v => v * 0.55 + 70);
    for (const e of b.sea.edges) {
      const d = e === 'north' ? z - B.minZ : e === 'south' ? B.maxZ - z : e === 'west' ? x - B.minX : B.maxX - x;
      if (d < b.sea.from) c = [56, 96, 160];
    }
    put(px, py, c);
  }
  for (const r of b.ranges) { line(r.points, [120, 86, 60], Math.max(3, Math.round(r.width / mpp / 6)), 0.85); label(r.points[0][0], r.points[0][1], r.name, 'range'); }
  for (const l of b.lakes) { const [px, py] = toPx(...l.at), rr = l.radius / mpp; for (let dy = -rr; dy <= rr; dy++) for (let dx = -rr; dx <= rr; dx++) if (dx * dx + dy * dy <= rr * rr) put(px + dx, py + dy, [70, 130, 210], 0.9); label(l.at[0], l.at[1], l.name, 'water'); }
  const endAt = e => {
    if (Array.isArray(e)) return e;
    if (e.startsWith('lake:')) return b.lakes.find(l => l.id === e.slice(5)).at;
    if (e.startsWith('pin:') && W.pin) return W.pin.joins.find(j => j.river === e.slice(4))?.at;
    return null;
  };
  for (const r of b.rivers) {
    const a = endAt(r.from); let c = endAt(r.to);
    if (!c && r.to === 'sea') c = [a[0], b.size.bounds.maxZ - b.sea.from / 2];
    if (a && c) line([a, c], [90, 160, 240], 2, 0.9, 5);
  }
  if (W.pin) {
    const k = W.pin.keep;
    for (let z = k.minZ; z <= k.maxZ; z += mpp) for (let x = k.minX; x <= k.maxX; x += mpp) { const [px, py] = toPx(x, z); put(px, py, [250, 244, 220], 0.55); }
    line([[k.minX, k.minZ], [k.maxX, k.minZ], [k.maxX, k.maxZ], [k.minX, k.maxZ], [k.minX, k.minZ]], [60, 50, 40], 2, 1);
    label((k.minX + k.maxX) / 2, (k.minZ + k.maxZ) / 2, b.pin.name || 'Pinned', 'region');
    for (const gt of W.pin.gates) { line([gt.start, ...gt.via, gt.edge], [200, 60, 40], 2, 1); }
  }
  b.regions.forEach(r => label(r.at[0], r.at[1], `${r.name} ${r.levels[0]}-${r.levels[1]}`, 'region'));
}

// ---------------------------------------------------------------- a tiny 5x7 pixel font for labels in Node PNGs
const FONT = {
  A: '0e11111f1111', B: '1e111e11111e', C: '0e111010110e', D: '1e111111111e', E: '1f101e10101f', F: '1f101e101010', G: '0f10101311110f', H: '11111f111111',
  I: '0e04040404040e', J: '07020202120c', K: '111214181412', L: '10101010101f', M: '111b15111111', N: '1119151311', O: '0e111111110e', P: '1e111e101010',
  Q: '0e1111151209', R: '1e111e141211', S: '0f10100e011e', T: '1f0404040404', U: '11111111110e', V: '111111110a04', W: '111111151b11', X: '110a04040a11',
  Y: '110a04040404', Z: '1f020408101f', 0: '0e13151911 0e', 1: '040c0404040e', 2: '0e11020408 1f', 3: '1e01060101 1e', 4: '02060a121f02', 5: '1f101e01011e',
  6: '0e101e11110e', 7: '1f0102040808', 8: '0e110e11110e', 9: '0e11110f010e', '-': '00001f0000', "'": '0404', ',': '00000004 08', '.': '0000000004', '(': '020404040402', ')': '080404040408', ':': '000400000400', '/': '010204081010', ' ': '',
};
function glyph(ch) {
  const hex = (FONT[ch.toUpperCase()] ?? FONT[' ']).replace(/\s/g, '');
  const rows = [];
  for (let i = 0; i < hex.length; i += 2) rows.push(parseInt(hex.slice(i, i + 2), 16));
  while (rows.length < 7) rows.unshift(0);
  return rows.slice(-7);
}
/** Burn the labels into the picture (white text on a dark band), for Node PNGs. */
export function drawLabels(pic, scale = 2) {
  const { w, h, rgba } = pic;
  const put = (x, y, c) => { if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 4; rgba[o] = c[0]; rgba[o + 1] = c[1]; rgba[o + 2] = c[2]; rgba[o + 3] = 255; };
  for (const L of pic.labels) {
    const text = L.text.replace(/[^A-Za-z0-9 \-',.():/]/g, '');
    const tw = text.length * 6 * scale, th = 9 * scale;
    const x0 = Math.round(L.x - tw / 2), y0 = Math.round(L.y - (L.kind === 'region' ? th / 2 : th + 4));
    for (let y = 0; y < th; y++) for (let x = -2; x < tw + 2; x++) { const o = ((y0 + y) * w + x0 + x) * 4; if (x0 + x >= 0 && y0 + y >= 0 && x0 + x < w && y0 + y < h) { rgba[o] *= 0.35; rgba[o + 1] *= 0.35; rgba[o + 2] *= 0.35; } }
    const col = L.kind === 'region' ? [255, 240, 200] : L.kind === 'water' ? [170, 210, 255] : [255, 255, 255];
    [...text].forEach((ch, n) => {
      const rows = glyph(ch);
      rows.forEach((bits, ry) => { for (let rx = 0; rx < 5; rx++) if (bits & (1 << (4 - rx))) for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) put(x0 + (n * 6 + rx) * scale + sx, y0 + scale + ry * scale + sy, col); });
    });
  }
  return pic;
}
