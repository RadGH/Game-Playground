// Canvas drawing shared by the world map (worldmap.js) and the minimap (minimap.js). DOM-free apart from the
// canvas it is handed. Everything is drawn from a view (map-data.js makeView): world metres -> pixels, optionally
// rotated (the minimap's "rotate with me").
//
//   drawMap(ctx, view, { model, world, zoneImage, fog, markers, detail, opts })
//   drawDungeon(ctx, view, { floors, cell, fog, markers })
//   drawIcon(ctx, kind, x, y, size, marker)   — the one icon set (map, minimap, legend)

import { zoneBoundsOf, bandText, bandTone, ZONE_M } from './map-data.js';

export const COLORS = {
  sea: '#3c5560', unseen: 'rgba(24,20,15,0.58)', closed: 'rgba(16,14,12,0.45)', river: '#4f7d93', road: '#7a5a36', trail: '#8a6c48', street: '#6a5236',
  zoneLine: 'rgba(40,30,18,0.55)', provinceLine: 'rgba(30,20,10,0.85)', text: '#21170c', textHalo: 'rgba(236,224,196,0.85)', quest: '#ffcf3a', event: '#ff5a3a',
  tone: { easy: '#9a9488', fair: '#3f8a3a', hard: '#c77a1e', deadly: '#b8322a' },
};

/** Put the canvas into world coordinates (metres) for this view. */
function worldTransform(ctx, view) {
  const c = Math.cos(view.rot || 0) * view.scale, s = Math.sin(view.rot || 0) * view.scale;
  ctx.setTransform(c, s, -s, c, view.w / 2 - (view.cx * c - view.cz * s), view.h / 2 - (view.cx * s + view.cz * c));
}
const dpr = ctx => ctx.__dpr || 1;
function screen(ctx) { const d = dpr(ctx); ctx.setTransform(d, 0, 0, d, 0, 0); }
function worldT(ctx, view) {
  const d = dpr(ctx);
  const c = Math.cos(view.rot || 0) * view.scale * d, s = Math.sin(view.rot || 0) * view.scale * d;
  ctx.setTransform(c, s, -s, c, d * view.w / 2 - (view.cx * c - view.cz * s), d * view.h / 2 - (view.cx * s + view.cz * c));
}
void worldTransform;

// ---- the fog picture (one pixel per fog cell, drawn smoothed so the edge is soft) ------------------------------
const fogCache = new WeakMap();
function fogCanvas(fog, { playableBounds = null } = {}) {
  let c = fogCache.get(fog);
  if (c && c.version === fog.version) return c.canvas;
  const cv = c?.canvas || (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(fog.cw, fog.ch) : Object.assign(document.createElement('canvas'), { width: fog.cw, height: fog.ch }));
  const g = cv.getContext('2d');
  const img = g.createImageData(fog.cw, fog.ch);
  for (let j = 0; j < fog.ch; j++) for (let i = 0; i < fog.cw; i++) {
    const o = (j * fog.cw + i) * 4;
    const seen = fog.has(i, j);
    let a = seen ? 0 : 150;
    if (playableBounds) {
      const x = (i + 0.5) * fog.cell, z = (j + 0.5) * fog.cell;
      const inside = x >= playableBounds.minX && x <= playableBounds.maxX && z >= playableBounds.minZ && z <= playableBounds.maxZ;
      if (!inside) a = seen ? 60 : 120;          // the rest of the world: drawn, but dimmed — not open yet
    }
    img.data[o] = 24; img.data[o + 1] = 20; img.data[o + 2] = 15; img.data[o + 3] = a;
  }
  g.putImageData(img, 0, 0);
  fogCache.set(fog, { canvas: cv, version: fog.version });
  return cv;
}

function polyline(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
const overlaps = (bb, b) => !(bb[2] < b.minX || bb[0] > b.maxX || bb[3] < b.minZ || bb[1] > b.maxZ);

// labels already placed this frame (screen rects), so a later, less important label does not print over one
let PLACED = null;
// S25: "Names" off silences EVERY text label on the map — provinces, zones, bands, settlements, places, markers (not just markers)
let NAMES_OFF = false;
export function setNamesOff(on) { NAMES_OFF = !!on; }
export function beginLabels() { PLACED = []; }
export function endLabels() { PLACED = null; }
/** Text with a light halo, in screen pixels. Returns false (and draws nothing) when it would overlap a placed label. */
export function label(ctx, text, x, y, { size = 12, weight = 600, color = COLORS.text, halo = COLORS.textHalo, align = 'center', font = 'Alegreya Sans, system-ui, sans-serif', italic = false, force = false } = {}) {
  if (NAMES_OFF) return false;
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
  if (PLACED) {
    const w = ctx.measureText(text).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const r = [x0 - 2, y - size * 0.6, x0 + w + 2, y + size * 0.6];
    if (!force && PLACED.some(q => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) return false;
    PLACED.push(r);
  }
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2.5, size / 3.6); ctx.strokeStyle = halo; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  return true;
}

/**
 * The outdoor map. src = { model, world: {bitmap, metresPerPixel}, zoneImage(key) -> {bitmap, metresPerPixel}|null,
 * fog, markers, detail: Map(zoneKey -> placements[]), opts: { roads, rivers, zones, labels, names, minimap, me, level } }.
 */
export function drawMap(ctx, view, src) {
  const { model, world, fog, markers = [], opts = {} } = src;
  NAMES_OFF = opts.names === false;
  const W = view.w, H = view.h, b = view.bounds();
  screen(ctx);
  ctx.fillStyle = COLORS.sea; ctx.fillRect(0, 0, W, H);
  // terrain
  worldT(ctx, view);
  ctx.imageSmoothingEnabled = true;
  if (world?.bitmap) ctx.drawImage(world.bitmap, 0, 0, world.w * world.metresPerPixel, world.h * world.metresPerPixel);
  // close-up pictures where they are sharper than the world picture (zone 2,048 m wider than ~260 px)
  if (model && src.zoneImage && view.scale > 0.12) {
    for (const z of model.zones.values()) {
      if (!z.playable) continue;
      const zb = z.bounds;
      if (zb.maxX < b.minX || zb.minX > b.maxX || zb.maxZ < b.minZ || zb.minZ > b.maxZ) continue;
      const im = src.zoneImage(z.key);
      if (im && im.bitmap) ctx.drawImage(im.bitmap, zb.minX, zb.minZ, im.w * im.metresPerPixel, im.h * im.metresPerPixel);
    }
  }
  // rivers + roads (world metres; line widths kept to a pixel size)
  const px = 1 / view.scale;
  if (model && opts.rivers !== false) {
    ctx.strokeStyle = COLORS.river; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of model.rivers) { if (!overlaps(r.bbox, b)) continue; ctx.lineWidth = Math.max(px * (r.cls > 1 ? 2.2 : 1.4), r.cls > 1 ? 12 : 6); polyline(ctx, r.pts); ctx.stroke(); }
  }
  if (model && opts.roads !== false) {
    for (const r of model.roads) {
      if (!overlaps(r.bbox, b)) continue;
      ctx.strokeStyle = r.cls === 'trail' ? COLORS.trail : COLORS.road;
      ctx.lineWidth = Math.max(px * (r.cls === 'trail' ? 1.1 : 1.8), r.width);
      ctx.setLineDash(r.cls === 'trail' ? [px * 5, px * 3.5] : []);
      polyline(ctx, r.pts); ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // town streets at close zoom (B's placements)
  if (src.detail && view.scale > 0.45) {
    ctx.strokeStyle = COLORS.street; ctx.lineCap = 'round';
    for (const [key, list] of src.detail) {
      const zb = zoneBoundsOf(key); if (!zb || zb.maxX < b.minX || zb.minX > b.maxX || zb.maxZ < b.minZ || zb.minZ > b.maxZ) continue;
      for (const p of list) {
        if (p.kind === 'street' && p.data?.pts?.length > 1) { ctx.lineWidth = Math.max(px * 1.2, (p.data.width || 3)); polyline(ctx, p.data.pts.map(q => [q[0] + zb.minX, q[1] + zb.minZ])); ctx.stroke(); }
        else if (p.kind === 'building') {
          const w2 = (p.data?.w || 6) / 2, d2 = (p.data?.d || 6) / 2, x = p.x + zb.minX, z = p.z + zb.minZ, yaw = p.yaw || 0, c = Math.cos(yaw), s = Math.sin(yaw);
          ctx.fillStyle = 'rgba(92,64,40,0.85)'; ctx.beginPath();
          for (const [u, v] of [[-w2, -d2], [w2, -d2], [w2, d2], [-w2, d2]]) ctx.lineTo(x + u * c + v * s, z - u * s + v * c);
          ctx.closePath(); ctx.fill();
        }
      }
    }
  }
  // fog of the map
  if (fog) {
    const pb = model?.playable?.block ? { minX: model.playable.block[0] * ZONE_M, minZ: model.playable.block[1] * ZONE_M, maxX: (model.playable.block[0] + model.playable.size[0]) * ZONE_M, maxZ: (model.playable.block[1] + model.playable.size[1]) * ZONE_M } : null;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(fogCanvas(fog, { playableBounds: pb }), 0, 0, fog.cw * fog.cell, fog.ch * fog.cell);
  }
  // zone grid + province borders
  if (model && opts.zones !== false) {
    ctx.lineWidth = px * 1;
    if (view.scale > 0.025) {
      ctx.strokeStyle = COLORS.zoneLine; ctx.setLineDash([px * 6, px * 4]);
      for (const z of model.zones.values()) { if (!z.playable) continue; const zb = z.bounds; ctx.strokeRect(zb.minX, zb.minZ, ZONE_M, ZONE_M); }
      ctx.setLineDash([]);
    }
    // province borders: zone edges between different provinces
    ctx.strokeStyle = COLORS.provinceLine; ctx.lineWidth = px * (view.scale < 0.02 ? 1.4 : 2);
    ctx.beginPath();
    for (const z of model.zones.values()) {
      if (z.land < 0.08) continue;
      const e = model.zones.get(`z${String(z.zx + 1).padStart(2, '0')}_${String(z.zy).padStart(2, '0')}`), s = model.zones.get(`z${String(z.zx).padStart(2, '0')}_${String(z.zy + 1).padStart(2, '0')}`);
      if (e && e.province !== z.province && e.land >= 0.08) { ctx.moveTo(z.bounds.maxX, z.bounds.minZ); ctx.lineTo(z.bounds.maxX, z.bounds.maxZ); }
      if (s && s.province !== z.province && s.land >= 0.08) { ctx.moveTo(z.bounds.minX, z.bounds.maxZ); ctx.lineTo(z.bounds.maxX, z.bounds.maxZ); }
    }
    ctx.stroke();
  }
  // markers' areas (quest circles, live events) in world units
  for (const m of markers) {
    if (m.hidden) continue;
    if ((m.kind === 'quest' && m.area) || m.kind === 'liveevent') {
      ctx.beginPath(); ctx.arc(m.x, m.z, Math.max(m.r || 40, px * 10), 0, Math.PI * 2);
      ctx.fillStyle = m.kind === 'liveevent' ? 'rgba(255,90,58,0.16)' : 'rgba(255,207,58,0.13)'; ctx.fill();
      ctx.lineWidth = px * 1.5; ctx.strokeStyle = m.kind === 'liveevent' ? 'rgba(255,90,58,0.8)' : 'rgba(255,207,58,0.75)'; ctx.setLineDash(m.kind === 'quest' ? [px * 4, px * 3] : []); ctx.stroke(); ctx.setLineDash([]);
    }
  }
  screen(ctx);
  // markers first (icons), then labels round them, most important first
  drawMarkers(ctx, view, markers, { ...opts, names: false });
  beginLabels();
  if (model && opts.labels !== false) drawLabels(ctx, view, src);
  if (opts.names) drawMarkerNames(ctx, view, markers);
  endLabels();
  NAMES_OFF = false;
}
function drawMarkerNames(ctx, view, markers) {
  const sorted = markers.filter(m => !m.hidden && m.name && m.kind !== 'me' && !['town', 'city', 'capital', 'hamlet', 'village'].includes(m.kind)).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const m of sorted) {
    if (!(m.priority >= 2 || view.scale > 0.3)) continue;
    const [x, y] = view.toScreen(m.x, m.z);
    if (x < -20 || y < -20 || x > view.w + 20 || y > view.h + 20) continue;
    label(ctx, m.name, x, y + (m.size || 6) + 9, { size: 11, weight: 600, color: m.kind === 'quest' || m.kind === 'questdone' ? '#3a2600' : COLORS.text });
  }
}

function drawLabels(ctx, view, { model, fog, opts = {} }) {
  const b = view.bounds(), s = view.scale, level = opts.level || 1;
  if (s < 0.02) {
    // whole world: province names
    for (const p of model.provinces) {
      if (!p.zones.length) continue;
      const [x, y] = view.toScreen(p.cx, p.cz);
      label(ctx, p.name, x, y, { size: p.playable ? 16 : 12, weight: p.playable ? 800 : 600, italic: !p.playable, color: p.playable ? '#2a1c0c' : '#4a3a28', font: p.playable ? 'Cinzel, Georgia, serif' : undefined, force: p.playable });
      if (p.playable && model.playable?.band) label(ctx, bandText(model.playable.band) + ' · you are here', x, y + 16, { size: 11, weight: 800, color: COLORS.tone.fair, force: true });
      else if (!p.playable) label(ctx, 'not open yet', x, y + 13, { size: 10, weight: 500, italic: true, color: '#5a4a38' });
    }
  }
  if (s >= 0.02 && !opts.minimap) {
    // zone names + level bands
    for (const z of model.zones.values()) {
      if (!z.playable || !z.name) continue;
      const zb = z.bounds; if (zb.maxX < b.minX || zb.minX > b.maxX || zb.maxZ < b.minZ || zb.minZ > b.maxZ) continue;
      const zpx = ZONE_M * s;
      const size = Math.min(16, (zpx * 0.9) / (z.name.length * 0.74));
      if (size < 8) continue;
      const [x, y] = view.toScreen(zb.minX + ZONE_M / 2, zb.minZ + (s > 0.18 ? 50 / s : ZONE_M * 0.13));
      label(ctx, z.name, x, y, { size, weight: 800, font: 'Cinzel, Georgia, serif', force: true });
      const tone = bandTone(z.band, level);
      label(ctx, bandText(z.band), x, y + size * 0.6 + 8, { size: Math.max(10, Math.min(12, size * 0.85)), weight: 800, color: COLORS.tone[tone], force: true });
    }
  }
  // settlement names
  const minSize = s < 0.02 ? 4 : s < 0.06 ? 3 : s < 0.2 ? 2 : 0;
  for (const st of model.settlements) {
    if ((st.size || 1) < minSize) continue;
    if (st.x < b.minX || st.x > b.maxX || st.z < b.minZ || st.z > b.maxZ) continue;
    if (fog && !st.hub && (st.size || 1) < 3 && !fog.seen(st.x, st.z)) continue;
    const [x, y] = view.toScreen(st.x, st.z);
    label(ctx, st.name, x, y + (opts.minimap ? 10 : 13), { size: opts.minimap ? 10 : (st.size >= 3 ? 12 : 11), weight: st.size >= 3 ? 700 : 600 });
  }
}

/** Markers in screen space; me last. */
export function drawMarkers(ctx, view, markers, opts = {}) {
  const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
  const sorted = markers.filter(m => !m.hidden).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  for (const m of sorted) {
    if (m.kind === 'me' && opts.noMe) continue;
    const [x, y] = view.toScreen(m.x, m.z);
    if (x < -20 || y < -20 || x > view.w + 20 || y > view.h + 20) continue;
    drawIcon(ctx, m.kind, x, y, (m.size || 6) * (opts.minimap ? 0.85 : 1), m, t, view);

  }
}

/** The one icon set. size ~ radius in px. */
export function drawIcon(ctx, kind, x, y, size = 6, m = {}, t = 0, view = null) {
  ctx.save(); ctx.translate(x, y);
  const S = size;
  const fill = (c, stroke = '#1b130a', lw = 1.4) => { ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.stroke(); };
  switch (kind) {
    case 'city': case 'capital': case 'town': {
      const k = kind === 'town' ? 1 : 1.25;
      ctx.beginPath(); ctx.rect(-S * k, -S * 0.3 * k, S * 2 * k, S * 1.2 * k); fill('#e7d6ae');
      ctx.beginPath(); ctx.moveTo(-S * 1.2 * k, -S * 0.25 * k); ctx.lineTo(0, -S * 1.2 * k); ctx.lineTo(S * 1.2 * k, -S * 0.25 * k); ctx.closePath(); fill('#9c3a2a');
      break;
    }
    case 'village': case 'hamlet': ctx.beginPath(); ctx.arc(0, 0, S * 0.6, 0, Math.PI * 2); fill('#e7d6ae'); break;
    case 'dungeon': {
      ctx.beginPath(); ctx.moveTo(-S, S * 0.8); ctx.lineTo(-S, -S * 0.1); ctx.arc(0, -S * 0.1, S, Math.PI, 0); ctx.lineTo(S, S * 0.8); ctx.closePath(); fill('#5a4f46');
      ctx.beginPath(); ctx.moveTo(-S * 0.45, S * 0.8); ctx.lineTo(-S * 0.45, 0); ctx.arc(0, 0, S * 0.45, Math.PI, 0); ctx.lineTo(S * 0.45, S * 0.8); ctx.closePath(); ctx.fillStyle = '#120c08'; ctx.fill();
      if (m.levelTone) { ctx.beginPath(); ctx.arc(S * 0.9, -S * 0.9, S * 0.38, 0, Math.PI * 2); ctx.fillStyle = COLORS.tone[m.levelTone]; ctx.fill(); }
      break;
    }
    case 'cave': ctx.beginPath(); ctx.arc(0, S * 0.5, S, Math.PI, 0); ctx.closePath(); fill('#7a6a58'); ctx.beginPath(); ctx.arc(0, S * 0.5, S * 0.45, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#140e0a'; ctx.fill(); break;
    case 'fort': ctx.beginPath(); ctx.moveTo(-S * 0.8, S); ctx.lineTo(-S * 0.8, -S * 0.6); for (let i = 0; i < 3; i++) { const a = -S * 0.8 + i * S * 0.55; ctx.lineTo(a, -S); ctx.lineTo(a + S * 0.3, -S); ctx.lineTo(a + S * 0.3, -S * 0.6); ctx.lineTo(a + S * 0.55, -S * 0.6); } ctx.lineTo(S * 0.85, S); ctx.closePath(); fill(m.hostile ? '#a0483a' : '#8a8478'); break;
    case 'farm': ctx.beginPath(); ctx.moveTo(0, -S * 0.7); ctx.lineTo(S * 0.7, 0); ctx.lineTo(0, S * 0.7); ctx.lineTo(-S * 0.7, 0); ctx.closePath(); fill('#c8b45a', '#3a3010', 1); break;
    case 'ford': case 'bridge': ctx.beginPath(); ctx.moveTo(-S * 0.8, 0); ctx.lineTo(S * 0.8, 0); ctx.lineWidth = 3; ctx.strokeStyle = kind === 'bridge' ? '#5a3a20' : '#a8d0e0'; ctx.stroke(); break;
    case 'landmark': ctx.beginPath(); ctx.moveTo(0, -S); ctx.lineTo(S * 0.8, S * 0.6); ctx.lineTo(-S * 0.8, S * 0.6); ctx.closePath(); fill('#4f7a3a'); break;
    case 'event': ctx.beginPath(); ctx.arc(0, 0, S * 0.9, 0, Math.PI * 2); fill('rgba(160,40,30,0.85)', '#2a0a06');
      ctx.beginPath(); ctx.moveTo(-S * 0.5, -S * 0.5); ctx.lineTo(S * 0.5, S * 0.5); ctx.moveTo(S * 0.5, -S * 0.5); ctx.lineTo(-S * 0.5, S * 0.5); ctx.lineWidth = 2; ctx.strokeStyle = '#ffe0c0'; ctx.stroke(); break;
    case 'liveevent': {
      const pulse = 1 + 0.25 * Math.sin(t * 5);
      ctx.beginPath(); ctx.arc(0, 0, S * 1.3 * pulse, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,90,40,0.25)'; ctx.fill();
      star(ctx, 0, 0, S, S * 0.45, 5); fill('#ff7a2a', '#3a0e02', 1.5);
      break;
    }
    case 'waystone': {
      ctx.beginPath(); ctx.moveTo(0, -S * 1.3); ctx.lineTo(S * 0.5, -S * 0.7); ctx.lineTo(S * 0.4, S); ctx.lineTo(-S * 0.4, S); ctx.lineTo(-S * 0.5, -S * 0.7); ctx.closePath();
      fill(m.known ? '#7fe0f0' : '#a09a90', '#10242a', 1.4);
      if (m.known) { ctx.beginPath(); ctx.arc(0, -S * 0.2, S * 0.22, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); }
      break;
    }
    case 'quest': case 'questdone': {
      if (m.tracked) { ctx.beginPath(); ctx.arc(0, 0, S * 1.35 * (1 + 0.12 * Math.sin(t * 4)), 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,207,58,0.3)'; ctx.fill(); }
      ctx.beginPath(); ctx.arc(0, 0, S, 0, Math.PI * 2); fill(kind === 'questdone' ? '#ffd84a' : '#f2b81e', '#3a2600', 1.6);
      ctx.fillStyle = '#2a1a00'; ctx.font = `900 ${Math.round(S * 1.5)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(kind === 'questdone' ? '?' : '!', 0, S * 0.08);
      break;
    }
    case 'party': ctx.beginPath(); ctx.arc(0, 0, S * 0.75, 0, Math.PI * 2); fill('#4aa8ff', '#06223a', 1.8); break;
    case 'pin': ctx.beginPath(); ctx.arc(0, -S * 0.6, S * 0.6, Math.PI, 0); ctx.lineTo(0, S); ctx.closePath(); fill('#e2483a', '#3a0a06', 1.4); ctx.beginPath(); ctx.arc(0, -S * 0.6, S * 0.22, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); break;
    case 'loot': { ctx.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? S * 0.35 : S * 0.85, an = i / 8 * Math.PI * 2 - Math.PI / 2; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); fill(m.color || '#e8e0c8', '#1b130a', 1); break; }
    case 'rare': { ctx.beginPath(); ctx.arc(0, 0, S * 0.8, 0, Math.PI * 2); fill(m.color || '#ffcf3a', '#2a0606', 1.6); ctx.beginPath(); ctx.arc(0, 0, S * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#2a0606'; ctx.fill(); break; }
    case 'monster': ctx.beginPath(); ctx.arc(0, 0, S * 0.5, 0, Math.PI * 2); fill(m.boss ? '#ff3a3a' : '#d84a3a', '#2a0606', 1); break;
    case 'object': ctx.beginPath(); ctx.rect(-S * 0.55, -S * 0.55, S * 1.1, S * 1.1); fill(m.color || '#e0c060', '#2a1e06', 1.2); break;
    case 'me': {
      // facing: m.yaw in world (0 = +z south), drawn in the view's rotation
      const rot = (view?.rot || 0);
      const yaw = m.yaw ?? 0;
      // world direction (sin yaw, cos yaw) -> screen angle
      const dx = Math.sin(yaw), dz = Math.cos(yaw), c = Math.cos(rot), s = Math.sin(rot);
      const sx = dx * c - dz * s, sy = dx * s + dz * c;
      ctx.rotate(Math.atan2(sy, sx) + Math.PI / 2);
      ctx.beginPath(); ctx.moveTo(0, -S * 1.25); ctx.lineTo(S * 0.85, S * 0.9); ctx.lineTo(0, S * 0.45); ctx.lineTo(-S * 0.85, S * 0.9); ctx.closePath();
      fill('#fff6d8', '#1b130a', 2);
      break;
    }
    default: ctx.beginPath(); ctx.arc(0, 0, S * 0.55, 0, Math.PI * 2); fill('#d8c8a0');
  }
  ctx.restore();
}
function star(ctx, x, y, R, r, n) { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }

/**
 * A dungeon floor map from the room's tiles (protocol §10.3): floor tiles, walls edged, explored by `fog`
 * (a createFog over the dungeon's own metres), with markers (stairs, exits, chests, monsters, party, you).
 */
export function drawDungeon(ctx, view, { floors, cell = 2, fog = null, markers = [], opts = {} }) {
  screen(ctx);
  ctx.fillStyle = '#0d0b09'; ctx.fillRect(0, 0, view.w, view.h);
  worldT(ctx, view);
  const b = view.bounds();
  for (const f of floors || []) {
    if (f.origin.x > b.maxX || f.origin.z > b.maxZ || f.origin.x + f.w * cell < b.minX || f.origin.z + f.h * cell < b.minZ) continue;
    const t = f.tilesFlat;
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      if (!t[j * f.w + i]) continue;
      const x = f.origin.x + i * cell, z = f.origin.z + j * cell;
      if (x > b.maxX || z > b.maxZ || x + cell < b.minX || z + cell < b.minZ) continue;
      const seen = !fog || fog.seen(x + cell / 2, z + cell / 2);
      if (!seen && !opts.revealAll) continue;
      ctx.fillStyle = seen ? '#8a7a62' : '#2a241c';
      ctx.fillRect(x - 0.02, z - 0.02, cell + 0.04, cell + 0.04);
    }
    // walls: a dark edge on floor tiles that touch rock
    ctx.fillStyle = '#3a2e22';
    const e = Math.max(0.35, 1.2 / view.scale);
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      if (!t[j * f.w + i]) continue;
      const x = f.origin.x + i * cell, z = f.origin.z + j * cell;
      if (fog && !fog.seen(x + cell / 2, z + cell / 2) && !opts.revealAll) continue;
      if (!t[j * f.w + i - 1] || i === 0) ctx.fillRect(x, z, e, cell);
      if (!t[j * f.w + i + 1] || i === f.w - 1) ctx.fillRect(x + cell - e, z, e, cell);
      if (j === 0 || !t[(j - 1) * f.w + i]) ctx.fillRect(x, z, cell, e);
      if (j === f.h - 1 || !t[(j + 1) * f.w + i]) ctx.fillRect(x, z + cell - e, cell, e);
    }
    if (f.river?.length > 1) { ctx.strokeStyle = 'rgba(80,140,170,0.85)'; ctx.lineWidth = 2.4; polyline(ctx, f.river.map(p => [p.x ?? p[0], p.z ?? p[1]])); ctx.stroke(); }
  }
  screen(ctx);
  drawMarkers(ctx, view, markers, opts);
  if (!opts.minimap && opts.names !== false) { beginLabels(); drawMarkerNames(ctx, view, markers); endLabels(); }
}
