// The ground of a round-7 city layout (sim/citylayouts.js): canal water with stone quays and bridges, the harbour's
// apron, piers and open sea, rail tracks on gravel with level crossings and a platform, park lawns with gravel paths and
// a pond, old-town cobbles, megablock plaza paving, the ring plaza and its smooth ring roads and avenues. Called by
// View._ground for a map with `city`. Everything is painted from map.city.ground — the same string the rules read
// (world.js: 'w' is deep water) — plus the smooth bands (ring roads, park paths) whose tiles the generator reserved
// from the same points. Canvas 2D, nothing baked; the shapes are worked out once per map and only projected each frame.
import { TILE_W } from '../../../../citykit/js/iso.js';

/** Day colours per ground code (the night darkens them with an overlay, like the outdoor maps). */
export const GROUND = {
  '.': '#343944', r: '#262a33', R: '#343944', a: '#2c313b', A: '#343944', w: '#1f5470', b: '#4b505a', q: '#5d5a54',
  g: '#3e6b33', p: '#8a7a5c', o: '#3e6b33', t: '#4d4842', T: '#58534c', P: '#77736c', x: '#262a33', d: '#4f5359',
  e: '#6b5844', c: '#615649', s: '#6e6457', m: '#3b414c',
};
/** Small-map colours (minimap, briefing map): the same ground, brighter where it matters (water, grass, rails). */
export const MAP_GROUND = {
  '.': '#1c2029', r: '#2a2f3a', R: '#2a2f3a', a: '#252a34', A: '#30364a', w: '#1d5a84', b: '#5a6070', q: '#3c3a37',
  g: '#2f5a2a', p: '#4f5a3c', o: '#2f6f8a', t: '#5a4a3a', T: '#3a3632', P: '#4a4844', x: '#5a4a3a', d: '#3a3e46',
  e: '#6a5236', c: '#3a352f', s: '#433d36', m: '#272c36',
};
const C = { lane: '#c9b04a', rail: '#a7adb4', sleeper: '#3a2f26', quayEdge: '#8e897e', wall: '#2a2d33', ripple: 'rgba(200,236,250,0.35)', deckRail: '#b7bcc4', plank: 'rgba(30,20,10,0.35)', bay: 'rgba(222,186,64,0.55)', bollard: '#2a2b2e', reed: '#5f8a3a' };
const cache = new WeakMap();

/** Row runs of each ground code: [x, z, n, code]. Shared by the drawing and the small maps. */
export function groundRuns(map) {
  const G = map.city.ground, w = map.w, out = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < w; x++) {
    const c = G[z * w + x]; let e = x; while (e + 1 < w && G[z * w + e + 1] === c) e++;
    out.push([x, z, e - x + 1, c]); x = e;
  }
  return out;
}

function prep(map) {
  let d = cache.get(map); if (d) return d;
  const Cm = map.city, G = Cm.ground, w = map.w, h = map.h, at = (x, z) => (x < 0 || z < 0 || x >= w || z >= h ? null : G[z * w + x]);
  const runs = groundRuns(map);
  // smooth bands: their outline (left side out, right side back), the centre line for the lane paint
  const outline = (pts, r) => {
    const L = [], Rt = [], closed = pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.01;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i === 0 && closed ? pts.length - 2 : Math.max(0, i - 1)], b = pts[i === pts.length - 1 && closed ? 1 : Math.min(pts.length - 1, i + 1)];
      let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      L.push([pts[i][0] - tz * r, pts[i][1] + tx * r]); Rt.push([pts[i][0] + tz * r, pts[i][1] - tx * r]);
    }
    return closed ? { outer: L, inner: Rt } : { poly: L.concat(Rt.reverse()) };
  };
  const bands = (Cm.bands || []).map(b => ({ ...b, shape: outline(b.pts, b.hw), edge: outline(b.pts, b.hw + 0.18) }));
  // edges of the water: every side of a water tile that meets land (a quay wall) or a bridge (the bridge's side wall)
  const shore = [], rails = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const c = G[z * w + x];
    if (c === 'w') for (const [dx, dz, s] of [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']]) { const n = at(x + dx, z + dz); if (n && n !== 'w' && n !== 'b' && n !== 'e') shore.push([x, z, s]); }
    if (c === 'b' || c === 'e') for (const [dx, dz, s] of [[1, 0, 'e'], [-1, 0, 'w'], [0, 1, 's'], [0, -1, 'n']]) if (at(x + dx, z + dz) === 'w') rails.push([x, z, s, c]);
  }
  // tracks: row runs of rail (track + crossing) for the rails and sleepers
  const tracks = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    if (G[z * w + x] !== 't' && G[z * w + x] !== 'x') continue;
    let e = x; while (e + 1 < w && (G[z * w + e + 1] === 't' || G[z * w + e + 1] === 'x')) e++;
    tracks.push([x, z, e - x + 1]); x = e;
  }
  // seeded decor: grass tufts and flowers on the lawns, ripples on the water, cobble specks
  let s = (map.seed || 1) * 2654435761 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const tufts = [], ripples = [], specks = [];
  for (let i = 0; i < w * h * 1.4; i++) {
    const x = rnd() * w, z = rnd() * h, c = G[Math.floor(z) * w + Math.floor(x)], k = rnd();
    if (c === 'g') tufts.push({ x, z, k });
    else if (c === 'w') { if (k < 0.45) ripples.push({ x, z, k, ph: rnd() * 6.28 }); }
    else if (c === 'c' || c === 's') { if (k < 0.5) specks.push({ x, z, k }); }
  }
  // bollards along the quays and the dock edge, every 2 tiles
  const bollards = shore.filter(([x, z]) => (x + z) % 2 === 0).map(([x, z, side]) => side === 'n' ? [x + 0.5, z - 0.12] : side === 's' ? [x + 0.5, z + 1.12] : side === 'w' ? [x - 0.12, z + 0.5] : [x + 1.12, z + 0.5]);
  // painted bays on the dock apron: a line across every 2 tiles
  const bays = runs.filter(r => r[3] === 'd');
  d = { runs, bands, shore, rails, tracks, tufts, ripples, specks, bollards, bays };
  cache.set(map, d); return d;
}

function poly(view, ctx, pts, y = 0) { ctx.beginPath(); pts.forEach(([x, z], i) => { const p = view.P(x, z, y); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); ctx.closePath(); }
function line(view, ctx, pts, y = 0) { ctx.beginPath(); pts.forEach(([x, z], i) => { const p = view.P(x, z, y); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); }
function seg(view, ctx, x0, z0, x1, z1, y = 0) { const a = view.P(x0, z0, y), b = view.P(x1, z1, y); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); }
/** The tile side s ('n', 's', 'e', 'w') of tile (x, z) as a segment. */
const side = (x, z, s) => s === 'n' ? [x, z, x + 1, z] : s === 's' ? [x, z + 1, x + 1, z + 1] : s === 'w' ? [x, z, x, z + 1] : [x + 1, z, x + 1, z + 1];
function shape(view, ctx, sh) { if (sh.poly) poly(view, ctx, sh.poly); else { ctx.beginPath(); for (const ring of [sh.outer, sh.inner.slice().reverse()]) ring.forEach(([x, z], i) => { const p = view.P(x, z); i ? ctx.lineTo(p.sx, p.sy) : ctx.moveTo(p.sx, p.sy); }); ctx.closePath(); } }

export function drawCityGround(view, ctx, map) {
  const D = prep(map), Cm = map.city, z = view.zoom, t = performance.now() / 1000, w = map.w, h = map.h;
  const sea = !!Cm.harbour;
  ctx.fillStyle = '#1b1f27'; ctx.fillRect(0, 0, view.W, view.H);
  if (sea) view._diamond(ctx, -12, -12, w + 24, 12, GROUND.w);       // the open sea runs on past the map's north edge
  // water that reaches the map edge carries on past it (the canal out of the district)
  for (const [x, q, n, c] of D.runs) if (c === 'w') { if (x === 0) view._diamond(ctx, -10, q, 10, 1, GROUND.w); if (x + n === w) view._diamond(ctx, w, q, 10, 1, GROUND.w); }
  // every tile's ground
  for (const [x, q, n, c] of D.runs) view._diamond(ctx, x, q, n, 1, GROUND[c] || GROUND['.']);

  // lawns: soft darker blotches and the odd flower; cobbles: specks
  ctx.save();
  for (const s of D.tufts) {
    if (!view.visible(s.x, s.z, 0.5)) continue;
    const p = view.P(s.x, s.z), r = (0.6 + s.k) * z;
    if (s.k > 0.95) { ctx.fillStyle = s.k > 0.975 ? '#f2e27a' : '#e8eef6'; ctx.fillRect(p.sx - r * 0.5, p.sy - r * 0.5, r, r); continue; }
    ctx.strokeStyle = s.k < 0.5 ? 'rgba(30,55,22,0.55)' : 'rgba(120,170,80,0.45)'; ctx.lineWidth = Math.max(1, 0.5 * z);
    ctx.beginPath(); ctx.moveTo(p.sx - r, p.sy); ctx.lineTo(p.sx - r * 0.4, p.sy - r * 1.6); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx + r * 0.2, p.sy - r * 2); ctx.moveTo(p.sx + r, p.sy); ctx.lineTo(p.sx + r * 0.6, p.sy - r * 1.4); ctx.stroke();
  }
  for (const s of D.specks) { if (!view.visible(s.x, s.z, 0.5)) continue; const p = view.P(s.x, s.z), r = (0.7 + s.k) * z; ctx.fillStyle = s.k < 0.25 ? 'rgba(0,0,0,0.25)' : 'rgba(255,240,220,0.08)'; ctx.fillRect(p.sx - r, p.sy - r * 0.5, r * 2, r); }
  ctx.restore();

  // the pond (City park): an oval of water with a reedy rim — shallow, you wade it
  if (Cm.park?.pond) {
    const P0 = Cm.park.pond, ring = k => Array.from({ length: 48 }, (_, i) => { const a = i / 48 * Math.PI * 2; return [P0.x + Math.cos(a) * P0.rx * k, P0.z + Math.sin(a) * P0.rz * k]; });
    poly(view, ctx, ring(1.08)); ctx.fillStyle = '#5a6a3a'; ctx.fill();
    poly(view, ctx, ring(1)); ctx.fillStyle = '#2f7590'; ctx.fill();
    poly(view, ctx, ring(0.55)); ctx.fillStyle = 'rgba(80,150,180,0.45)'; ctx.fill();
    ctx.save(); ctx.strokeStyle = C.reed; ctx.lineWidth = Math.max(1, 0.6 * z);
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + (i % 3) * 0.05, p = view.P(P0.x + Math.cos(a) * P0.rx * 1.02, P0.z + Math.sin(a) * P0.rz * 1.02); ctx.beginPath(); ctx.moveTo(p.sx, p.sy); ctx.lineTo(p.sx + (i % 2 ? 1 : -1) * z, p.sy - 3.2 * z); ctx.stroke(); }
    ctx.restore();
  }
  // the ring plaza: a round paved floor with a ring of darker paving and radial joints
  if (Cm.ring) {
    const Rg = Cm.ring, circ = r => Array.from({ length: 72 }, (_, i) => { const a = i / 72 * Math.PI * 2; return [Rg.x + Math.cos(a) * r, Rg.z + Math.sin(a) * r]; });
    poly(view, ctx, circ(Rg.rings[0] - Rg.hw + 0.02)); ctx.fillStyle = '#3a4050'; ctx.fill();
    poly(view, ctx, circ(Rg.plaza * 0.72)); ctx.fillStyle = '#323848'; ctx.fill();
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; seg(view, ctx, Rg.x + Math.cos(a) * 1.6, Rg.z + Math.sin(a) * 1.6, Rg.x + Math.cos(a) * (Rg.rings[0] - Rg.hw), Rg.z + Math.sin(a) * (Rg.rings[0] - Rg.hw)); }
    ctx.stroke();
    poly(view, ctx, circ(Rg.rings[0] - Rg.hw - 0.15)); ctx.strokeStyle = 'rgba(63,240,255,0.35)'; ctx.lineWidth = Math.max(1, 0.8 * z); ctx.stroke();
    ctx.restore();
  }

  // smooth bands: paths (gravel, a soft edge) and roads (asphalt, a kerb, a dashed centre line)
  ctx.save(); ctx.lineJoin = 'round';
  for (const b of D.bands) if (b.kind === 'path') { shape(view, ctx, b.edge); ctx.fillStyle = '#365a2c'; ctx.fill(b.shape.poly ? 'nonzero' : 'evenodd'); }   // all the soft edges first,
  for (const b of D.bands) if (b.kind === 'path') { shape(view, ctx, b.shape); ctx.fillStyle = GROUND.p; ctx.fill(b.shape.poly ? 'nonzero' : 'evenodd'); }   // then the gravel, so crossings stay clean
  for (const b of D.bands) if (b.kind === 'road') { shape(view, ctx, b.edge); ctx.fillStyle = '#4a5160'; ctx.fill(b.edge.poly ? 'nonzero' : 'evenodd'); }
  for (const b of D.bands) if (b.kind === 'road') { shape(view, ctx, b.shape); ctx.fillStyle = GROUND.r; ctx.fill(b.shape.poly ? 'nonzero' : 'evenodd'); }
  ctx.strokeStyle = C.lane; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, 0.9 * z); ctx.setLineDash([6 * z, 7 * z]);
  for (const b of D.bands) if (b.kind === 'road') { line(view, ctx, b.pts); ctx.stroke(); }
  ctx.restore();
  // straight streets: the dashed centre line (2+ wide), like the grid city
  ctx.save(); ctx.strokeStyle = C.lane; ctx.lineWidth = Math.max(1, 0.9 * z); ctx.setLineDash([6 * z, 7 * z]); ctx.globalAlpha = 0.55; ctx.beginPath();
  for (const [x, q, sw, sd] of Cm.streets || []) { if (Math.min(sw, sd) < 2) continue; if (sw > sd) seg(view, ctx, Math.max(0, x), q + sd / 2, Math.min(w, x + sw), q + sd / 2); else seg(view, ctx, x + sw / 2, Math.max(0, q), x + sw / 2, Math.min(h, q + sd)); }
  ctx.stroke(); ctx.restore();

  // dusk: the ground darkens the way the baked buildings do (their night tint); the lines drawn after it (quay coping,
  // ripples, rails, bridge walls, painted lines) stay a little brighter, catching the city's light, so the water's
  // edge and the tracks still read at night
  if (view.night > 0) { ctx.fillStyle = `rgba(6, 9, 20, ${(0.62 * view.night).toFixed(3)})`; ctx.fillRect(0, 0, view.W, view.H); }
  const lit = 1 - 0.35 * view.night;
  // water: a darker band along every quay wall, ripples drifting along
  ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = lit;
  ctx.strokeStyle = 'rgba(8,20,30,0.55)'; ctx.lineWidth = Math.max(2, 2.4 * z); ctx.beginPath();
  for (const [x, q, s] of D.shore) { const [a, b, c, e] = side(x, q, s); const ix = s === 'w' ? 0.12 : s === 'e' ? -0.12 : 0, iz = s === 'n' ? 0.12 : s === 's' ? -0.12 : 0; seg(view, ctx, a + ix, b + iz, c + ix, e + iz); }
  ctx.stroke();
  ctx.strokeStyle = C.ripple; ctx.lineWidth = Math.max(1, 0.8 * z);
  for (const r of D.ripples) {
    const x = r.x + ((t * 0.25 + r.k * 3) % 1) * 0.6 - 0.3; if (!view.visible(x, r.z, 1)) continue;
    ctx.globalAlpha = (0.35 + 0.35 * Math.sin(t * 1.4 + r.ph)) * lit; ctx.beginPath(); seg(view, ctx, x, r.z, x + 0.45, r.z); ctx.stroke();
  }
  ctx.globalAlpha = lit;
  // the quay walls: a pale stone coping along the land side
  ctx.strokeStyle = C.quayEdge; ctx.lineWidth = Math.max(1.5, 1.4 * z); ctx.beginPath();
  for (const [x, q, s] of D.shore) { const [a, b, c, e] = side(x, q, s); seg(view, ctx, a, b, c, e, 0.02); }
  ctx.stroke();
  ctx.restore();

  // bridges and piers: plank lines across a pier, the deck's side walls over the water (raised a little)
  ctx.save();
  ctx.strokeStyle = C.plank; ctx.lineWidth = 1; ctx.beginPath();
  for (const [x, q, n, c] of D.runs) if (c === 'e') for (let k = 0; k < 4; k++) seg(view, ctx, x, q + k / 4, x + n, q + k / 4);
  ctx.stroke();
  for (const [x, q, s, c] of D.rails) {
    const [a, b, cc, e] = side(x, q, s);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); const o = 0.3, ox = s === 'e' ? o : s === 'w' ? -o : 0, oz = s === 's' ? o : s === 'n' ? -o : 0;   // the deck's shadow on the water
    const p1 = view.P(a, b), p2 = view.P(cc, e), p3 = view.P(cc + ox, e + oz), p4 = view.P(a + ox, b + oz); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = c === 'b' ? C.deckRail : '#5a4632'; ctx.lineWidth = Math.max(1.5, (c === 'b' ? 1.6 : 1.2) * z); ctx.beginPath(); seg(view, ctx, a, b, cc, e, c === 'b' ? 0.07 : 0.03); ctx.stroke();
    if (c === 'b') { ctx.strokeStyle = C.wall; ctx.lineWidth = Math.max(1, 0.8 * z); ctx.beginPath(); seg(view, ctx, a, b, cc, e, 0); ctx.stroke(); }
  }
  ctx.restore();
  // bollards on the quays and the apron
  ctx.save(); ctx.fillStyle = C.bollard;
  for (const [x, q] of D.bollards) { if (!view.visible(x, q, 0.5)) continue; const p = view.P(x, q); ctx.beginPath(); ctx.ellipse(p.sx, p.sy - 0.8 * z, 1.4 * z, 0.9 * z, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  // the dock apron: painted yellow bay lines every two tiles
  ctx.save(); ctx.strokeStyle = C.bay; ctx.lineWidth = Math.max(1, 0.8 * z); ctx.beginPath();
  for (const [x, q, n] of D.bays) for (let i = x; i <= x + n; i++) if (i % 2 === 0) seg(view, ctx, i, q + 0.1, i, q + 0.9);
  ctx.stroke(); ctx.restore();
  // the platform's yellow safety line along the track side
  ctx.save(); ctx.strokeStyle = 'rgba(226,182,46,0.8)'; ctx.lineWidth = Math.max(1, 1 * z); ctx.beginPath();
  const G = Cm.ground;
  for (const [x, q, n, c] of D.runs) if (c === 'P') { if (G[(q - 1) * w + x] === 't') seg(view, ctx, x, q + 0.12, x + n, q + 0.12); if (G[(q + 1) * w + x] === 't') seg(view, ctx, x, q + 0.88, x + n, q + 0.88); }
  ctx.stroke(); ctx.restore();
  // tracks: sleepers across, two rails along (through the level crossings too)
  ctx.save();
  ctx.strokeStyle = C.sleeper; ctx.lineWidth = Math.max(1.5, 1.6 * z); ctx.beginPath();
  for (const [x, q, n] of D.tracks) for (let k = x + 0.08; k < x + n; k += 0.16) { if (G[q * w + Math.floor(k)] === 'x') continue; seg(view, ctx, k, q + 0.28, k, q + 0.72); }
  ctx.stroke();
  ctx.strokeStyle = C.rail; ctx.lineWidth = Math.max(1, 0.9 * z); ctx.beginPath();
  for (const [x, q, n] of D.tracks) for (const o of [0.35, 0.65]) seg(view, ctx, x, q + o, x + n, q + o, 0.01);
  ctx.stroke(); ctx.restore();
  // level crossings: white stripes across the road where the rails cross
  ctx.save(); ctx.strokeStyle = 'rgba(230,230,230,0.35)'; ctx.lineWidth = Math.max(1, 0.7 * z); ctx.beginPath();
  for (const [x, q, n, c] of D.runs) if (c === 'x') { seg(view, ctx, x, q + 0.08, x + n, q + 0.08); seg(view, ctx, x, q + 0.92, x + n, q + 0.92); }
  ctx.stroke(); ctx.restore();
  // megablock plazas: big slabs with faint neon inlays
  if (Cm.mega) {
    ctx.save(); ctx.strokeStyle = 'rgba(63,240,255,0.10)'; ctx.lineWidth = 1; ctx.beginPath();
    for (const [x, q, n, c] of D.runs) if (c === 'm') { for (let i = x; i <= x + n; i++) if (i % 3 === 0) seg(view, ctx, i, q, i, q + 1); if (q % 3 === 0) seg(view, ctx, x, q, x + n, q); }
    ctx.stroke(); ctx.restore();
  }

  void TILE_W;
}

/** A layout's ground on a small map: fill(x, z, w, d, colour) is called for every run (minimap and briefing map). */
export function drawMapGround(map, fill) {
  if (!map?.city?.ground) return false;
  let d = cache.get(map); const runs = d?.runs || groundRuns(map);
  for (const [x, z, n, c] of runs) if (c !== '.') fill(x, z, n, 1, MAP_GROUND[c] || MAP_GROUND['.']);
  if (map.city.park?.pond) { const P0 = map.city.park.pond; fill(Math.round(P0.x - P0.rx), Math.round(P0.z - P0.rz), Math.round(P0.rx * 2), Math.round(P0.rz * 2), MAP_GROUND.o); }
  return true;
}
