// The pine forest's ground (Pinewatch): meadow grass with darker needle floor under the woods, worn dirt trails, the
// gravel road with wheel ruts (no road paint), the river with muddy banks and moving ripples, a plank deck where the
// road bridges it, the logging camp's sawdust yard, the power-line cut and the extraction's gravel patch. Beyond the
// map edge the forest canopy carries on. Called by View._ground for a map with `forest` (sim/forestmap.js).
// Canvas 2D, nothing baked; the shapes are worked out once per map and only projected each frame.
import { TILE_W } from '../../../../citykit/js/iso.js';

const C = {
  canopy: '#1d361d', canopyDot: 'rgba(60,100,50,0.5)', meadow: '#5f8f3e', woods: '#2f4a25', grass: '#6c9c46', trail: '#86683f', trailEdge: 'rgba(60,44,24,0.45)',
  road: '#a1987f', roadEdge: 'rgba(70,62,48,0.55)', rut: 'rgba(92,82,64,0.55)', bank: '#6b5a3a', water: '#2f7590', waterMid: '#3f8aa7', ripple: 'rgba(210,240,250,0.45)',
  yard: '#9c8458', cut: '#6a9442', pad: '#8f8a7c', deck: '#7a5634', rail: '#4a3220',
};
const cache = new WeakMap();

/** Everything that doesn't move, for one map: row runs per ground code, bands for the river / road / trails, decor. */
function prep(map) {
  let d = cache.get(map); if (d) return d;
  const F = map.forest, w = map.w, h = map.h, G = F.ground;
  const runs = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = G[z * w + x]; let e = x; while (e + 1 < w && G[z * w + e + 1] === c) e++;
    runs.push([x, z, e - x + 1, c]); x = e;
  }
  /** A band of half-width r along a path of [x, z] points: its outline (left side out, right side back). */
  const band = (path, r) => {
    const L = [], Rt = [];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      L.push([path[i][0] - tz * r, path[i][1] + tx * r]); Rt.push([path[i][0] + tz * r, path[i][1] - tx * r]);
    }
    return L.concat(Rt.reverse());
  };
  const thin = (path, k = 2) => path.filter((_, i) => i % k === 0 || i === path.length - 1);
  const riverBand = (extra) => { const L = F.river.map(p => [p.x - p.w / 2 - extra, p.z]), Rt = F.river.map(p => [p.x + p.w / 2 + extra, p.z]); return L.concat(Rt.reverse()); };
  const river = riverBand(0), bank = riverBand(0.35), mid = F.river.map(p => [p.x - p.w * 0.18, p.z]).concat(F.river.map(p => [p.x + p.w * 0.18, p.z]).reverse());
  const road = band(thin(F.road), 1.45), ruts = [-0.42, 0.42].map(o => offset(thin(F.road), o));
  const trails = F.trails.map(t => band(thin(t), 1.3));
  // seeded decor: grass tufts and wild flowers on open ground, stones on the trails
  let s = (map.seed || 1) * 2654435761 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tufts = [], blotches = [];
  for (let i = 0; i < w * h * 1.6; i++) {
    const x = rnd() * w, z = rnd() * h, c = G[Math.floor(z) * w + Math.floor(x)];
    if (c === 'g' || c === 'c' || c === 'y' || c === 'p' || c === 't') tufts.push({ x, z, k: rnd(), c });
  }
  for (let i = 0; i < w * h * 0.06; i++) blotches.push({ x: rnd() * w, z: rnd() * h, r: 0.8 + rnd() * 2.4, k: rnd() });
  const ripples = Array.from({ length: Math.round(h * 2.2) }, () => ({ z: rnd() * h, o: rnd() - 0.5, len: 0.4 + rnd() * 0.8, ph: rnd() * 6.28 }));
  const bridges = runs.filter(r => r[3] === 'b');
  // the bridge: the stretch of road over water, with a rail along each side
  const onDeck = p => G[Math.floor(p[1]) * w + Math.floor(p[0])] === 'b';
  const deck = F.road.filter(onDeck), rails = deck.length > 1 ? [-1.4, 1.4].map(o => offset(deck, o)) : [];
  d = { runs, river, bank, mid, road, ruts, trails, tufts, blotches, ripples, bridges, rails };
  cache.set(map, d); return d;
}
/** A path moved sideways by o tiles. */
function offset(path, o) {
  return path.map((p, i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return [p[0] - tz * o, p[1] + tx * o];
  });
}

function poly(view, ctx, pts) { ctx.beginPath(); pts.forEach(([x, z], i) => { const p = view.P(x, z); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); ctx.closePath(); }
function line(view, ctx, pts) { ctx.beginPath(); pts.forEach(([x, z], i) => { const p = view.P(x, z); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); }
function flat(view, ctx, x, z, r) { const p = view.P(x, z), rx = r * TILE_W * 0.5 * view.zoom * Math.SQRT2; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, 0, Math.PI * 2); return p; }

export function drawForestGround(view, ctx, map) {
  const D = prep(map), F = map.forest, z = view.zoom, t = performance.now() / 1000;
  // past the map edge: the forest carries on (dark canopy, a speckle of treetops that drifts with the camera)
  ctx.fillStyle = C.canopy; ctx.fillRect(0, 0, view.W, view.H);
  ctx.save(); ctx.fillStyle = C.canopyDot;
  const step = 34 * Math.max(0.6, z / 2.5), ox = ((-view.cam.x + view.cam.z) * 16 * z) % step, oy = ((-view.cam.x - view.cam.z) * 8 * z) % step;
  for (let y = -step; y < view.H + step; y += step) for (let x = -step; x < view.W + step; x += step) { const j = ((x * 7 + y * 13) | 0) % 5; ctx.beginPath(); ctx.arc(x + ox + j * 2, y + oy + (j - 2) * 2, step * 0.32, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  // meadow, then the ground codes row by row (needle floor under the woods, camp yard, the power cut, the pad)
  view._diamond(ctx, 0, 0, map.w, map.h, C.meadow);
  const fill = { f: C.woods, y: C.yard, c: C.cut, p: C.pad, g: C.grass };
  for (const [x, q, n, c] of D.runs) { const col = fill[c]; if (col) view._diamond(ctx, x, q, n, 1, col); }
  // soft blotches so the grass never reads as a flat floor
  ctx.save();
  for (const b of D.blotches) { if (!view.visible(b.x, b.z, b.r + 1)) continue; flat(view, ctx, b.x, b.z, b.r); ctx.fillStyle = b.k < 0.5 ? 'rgba(20,40,10,0.10)' : 'rgba(200,220,120,0.06)'; ctx.fill(); }
  ctx.restore();
  // the woods' shade spills a little onto the open ground beside them
  ctx.save(); ctx.fillStyle = 'rgba(16,30,12,0.18)';
  for (const l of map.lots) if (l.recipe && l.recipe.startsWith('forest-p') && view.visible(l.x + l.w / 2, l.z + l.d / 2, 2)) { const p = view.P(l.x + l.w / 2 - 0.25, l.z + l.d / 2 - 0.25); const rx = (l.w + 0.7) * TILE_W * 0.5 * z * 0.75; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();

  // the river: muddy banks, water, a lighter channel down the middle, ripples drifting downstream
  poly(view, ctx, D.bank); ctx.fillStyle = C.bank; ctx.fill();
  poly(view, ctx, D.river); ctx.fillStyle = C.water; ctx.fill();
  poly(view, ctx, D.mid); ctx.fillStyle = C.waterMid; ctx.globalAlpha = 0.55; ctx.fill(); ctx.globalAlpha = 1;
  ctx.save(); ctx.strokeStyle = C.ripple; ctx.lineWidth = Math.max(1, 0.8 * z); ctx.lineCap = 'round';
  for (const r of D.ripples) {
    const zz = (r.z + t * 0.6) % map.h, row = F.river[Math.min(F.river.length - 1, Math.max(0, Math.round(zz)))]; if (!row) continue;
    const x = row.x + r.o * row.w * 0.7; if (!view.visible(x, zz, 1)) continue;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 1.6 + r.ph);
    line(view, ctx, [[x, zz], [x, zz + r.len]]); ctx.stroke();
  }
  ctx.restore();

  // trails: worn dirt with a darker edge
  ctx.save(); ctx.lineWidth = Math.max(1, 1.2 * z); ctx.strokeStyle = C.trailEdge; ctx.lineJoin = 'round';
  for (const tr of D.trails) { poly(view, ctx, tr); ctx.fillStyle = C.trail; ctx.fill(); ctx.stroke(); }
  ctx.restore();
  // the road: gravel, a dark shoulder, two wheel ruts; a plank deck where it crosses the river
  ctx.save(); ctx.lineJoin = 'round';
  poly(view, ctx, D.road); ctx.fillStyle = C.road; ctx.fill(); ctx.lineWidth = Math.max(1, 1.4 * z); ctx.strokeStyle = C.roadEdge; ctx.stroke();
  for (const [x, q, n] of D.bridges) { view._diamond(ctx, x, q, n, 1, C.deck); }
  ctx.strokeStyle = C.rut; ctx.lineWidth = Math.max(1, 1.6 * z);
  for (const r of D.ruts) { line(view, ctx, r); ctx.stroke(); }
  ctx.strokeStyle = C.rail; ctx.lineWidth = Math.max(1.5, 1.8 * z);
  for (const r of D.rails) { ctx.beginPath(); r.forEach(([x, q], i) => { const p = view.P(x, q, 0.08); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); ctx.stroke(); }
  ctx.restore();

  // grass tufts and flowers on the meadows, pebbles on the trails and in the yard
  ctx.save();
  for (const s of D.tufts) {
    if (!view.visible(s.x, s.z, 0.5)) continue;
    const p = view.P(s.x, s.z), r = (0.6 + s.k) * z;
    if (s.c === 't' || s.c === 'y' || s.c === 'p') { ctx.fillStyle = s.k < 0.5 ? 'rgba(60,46,30,0.5)' : 'rgba(170,150,120,0.5)'; ctx.fillRect(p.sx - r * 0.6, p.sy - r * 0.3, r * 1.2, r * 0.6); continue; }
    if (s.k > 0.93) { ctx.fillStyle = s.k > 0.97 ? '#f2e27a' : '#e8eef6'; ctx.fillRect(p.sx - r * 0.5, p.sy - r * 0.5, r, r); continue; }
    ctx.strokeStyle = s.k < 0.5 ? 'rgba(40,70,25,0.6)' : 'rgba(140,180,80,0.55)'; ctx.lineWidth = Math.max(1, 0.5 * z);
    ctx.beginPath(); ctx.moveTo(p.sx - r, p.sy); ctx.lineTo(p.sx - r * 0.4, p.sy - r * 1.8); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx + r * 0.2, p.sy - r * 2.2); ctx.moveTo(p.sx + r, p.sy); ctx.lineTo(p.sx + r * 0.6, p.sy - r * 1.6); ctx.stroke();
  }
  ctx.restore();

  // dusk: the ground darkens the way the baked buildings do (their night tint)
  if (view.night > 0) { ctx.fillStyle = `rgba(8, 12, 34, ${(0.7 * view.night).toFixed(3)})`; ctx.fillRect(0, 0, view.W, view.H); }
}
