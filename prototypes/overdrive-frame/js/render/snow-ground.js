// The snowfield's ground (round 6, Frostline): deep snow with soft drifts and blue shadows, wind ripples, the station's
// plateau, the ploughed road with its ruts and berms, footprint and tread tracks on the trails, the frozen lake (ice
// with cracks and snow patches), the two pads, the station yard's painted pad, warm pools of light from the station
// as dusk falls. Over the scene: the ski lift's cables with cabins riding them. Instead of drifting ash: falling snow.
// Called by View for a map with `snow` (sim/snowmap.js). Canvas 2D for the ground; the cabins are City Kit pictures.
import { TILE_W } from '../../../../citykit/js/iso.js';
import { composite } from '../../../../citykit/js/bake.js';

const NAVY = [8, 12, 34];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** A ground colour at this evening light: the City Kit's own night tint (bake.js composite: navy at 0.78 × night) and a
 *  touch more blue in the snow, so the ground and the baked buildings darken together. */
function lit(h, n, a = 1, blue = 0.1) {
  const c = hex(h), k = 0.78 * n;
  const r = c[0] + (NAVY[0] - c[0]) * k, g = c[1] + (NAVY[1] - c[1]) * k, b = c[2] + (NAVY[2] - c[2]) * k + 255 * blue * n * (1 - k);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(Math.min(255, b))},${a})`;
}
const C = { snow: '#e9eff6', deep: '#dbe5f0', shade: '#9fb4d0', ripple: '#c8d6e6', road: '#aab6c4', rut: '#7f8c9c', berm: '#f4f8fc', ice: '#a9d6ea', iceDeep: '#5f9fc4', crack: '#e8f6ff', crackDark: '#3f6f92', plateau: '#f2f6fb', track: '#b9c7d8' };
const cache = new WeakMap();
const STATION = new Set(['snow-radar', 'snow-lab', 'snow-generator', 'snow-fuel', 'snow-lift', 'snow-dish']);

/** Seeded decoration for one map (drifts, ripples, footprints, lake cracks, snow poles), made once. */
function decor(map) {
  let d = cache.get(map); if (d) return d;
  let s = (map.seed || 1) * 2246822519 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const W = map.w, H = map.h, L = map.snow.lake;
  const onLake = (x, z, pad = 0) => L.some(b => Math.hypot(x - b.x, z - b.z) <= b.r + pad);
  const drifts = []; for (let i = 0; i < W * H * 0.06; i++) { const x = rnd() * W, z = rnd() * H; if (!onLake(x, z, 0.6)) drifts.push({ x, z, r: 0.7 + rnd() * 2.2, k: rnd() }); }
  const ripples = []; for (let i = 0; i < W * H * 0.5; i++) { const x = rnd() * W, z = rnd() * H; if (!onLake(x, z, 0.2)) ripples.push({ x, z, l: 0.25 + rnd() * 0.5, k: rnd() }); }
  // cracks: jagged lines from inside the ice, each with a branch or two
  const cracks = [];
  for (const b of L) for (let i = 0; i < Math.round(b.r * 2.2); i++) {
    let a = rnd() * Math.PI * 2, x = b.x + Math.cos(a) * b.r * rnd() * 0.6, z = b.z + Math.sin(a) * b.r * rnd() * 0.6; const pts = [[x, z]];
    for (let k = 0; k < 6; k++) { a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * (0.4 + rnd() * 0.7); z += Math.sin(a) * (0.4 + rnd() * 0.7); pts.push([x, z]); if (rnd() < 0.3) cracks.push({ pts: [[x, z], [x + Math.cos(a + 1) * 0.6, z + Math.sin(a + 1) * 0.6]], w: 0.6 }); }
    cracks.push({ pts, w: 1 });
  }
  const patches = []; for (const b of L) for (let i = 0; i < Math.round(b.r * 1.5); i++) { const a = rnd() * Math.PI * 2, r = b.r * Math.sqrt(rnd()) * 0.85; patches.push({ x: b.x + Math.cos(a) * r, z: b.z + Math.sin(a) * r, r: 0.3 + rnd() * 0.8, k: rnd() }); }
  // footprints / treads along each trail (pairs of dots, offset)
  const steps = [];
  for (const [x, z, w, dd] of map.snow.trails) { const along = w >= dd, n = Math.round((along ? w : dd) * 3); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, side = i % 2 ? 0.12 : -0.12, j = (rnd() - 0.5) * 0.06; steps.push(along ? { x: x + t * w, z: z + dd / 2 + side + j } : { x: x + w / 2 + side + j, z: z + t * dd }); } }
  // snow poles along the map edge every two tiles (orange tips) so the edge of the field reads
  const poles = []; for (let i = 1; i < W; i += 2) poles.push({ x: i, z: 0 }, { x: i, z: H }); for (let j = 1; j < H; j += 2) poles.push({ x: 0, z: j }, { x: W, z: j });
  const lightsAt = map.lots.filter(l => STATION.has(l.recipe)).map(l => ({ x: l.x + l.w / 2, z: l.z + l.d / 2, r: 1.6 + Math.max(l.w, l.d) * 0.6 }));
  d = { drifts, ripples, cracks, patches, steps, poles, lightsAt }; cache.set(map, d); return d;
}

/** Ellipse of a ground circle (x, z, r tiles) at height y. */
function flat(view, ctx, x, z, r, y = 0) {
  const p = view.P(x, z, y), rx = r * TILE_W * 0.5 * view.zoom * Math.SQRT2;
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, 0, Math.PI * 2); return { p, rx };
}
/** Path of a ground rectangle (tiles) as its screen diamond. */
function rect(view, ctx, x, z, w, d) {
  const a = view.P(x, z), b = view.P(x + w, z), c = view.P(x + w, z + d), e = view.P(x, z + d);
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(e.sx, e.sy); ctx.closePath();
}

export function drawSnowGround(view, ctx, map) {
  const D = decor(map), S = map.snow, n = view.night, z = view.zoom, t = performance.now() / 1000;
  // beyond the field: deeper, bluer snow
  ctx.fillStyle = lit(C.deep, n, 1, 0.14); ctx.fillRect(0, 0, view.W, view.H);
  ctx.fillStyle = lit('#cbd8e6', n, 0.5, 0.14); ctx.fillRect(0, 0, view.W, view.H);
  rect(view, ctx, 0, 0, map.w, map.h); ctx.fillStyle = lit(C.snow, n); ctx.fill();

  // drifts: a lit crest toward the sun (screen up-left) and a soft blue shadow on the far side
  ctx.save();
  for (const b of D.drifts) {
    if (!view.visible(b.x, b.z, b.r + 1)) continue;
    const { p, rx } = flat(view, ctx, b.x + 0.25, b.z + 0.25, b.r); ctx.fillStyle = lit(C.shade, n, 0.18 + b.k * 0.1, 0.2); ctx.fill();
    flat(view, ctx, b.x - 0.15, b.z - 0.15, b.r * 0.82); ctx.fillStyle = lit('#ffffff', n, 0.35 + b.k * 0.2); ctx.fill();
    void p; void rx;
  }
  ctx.restore();
  // wind ripples (sastrugi): short pale-blue strokes, all one way
  ctx.save(); ctx.lineWidth = Math.max(1, 0.8 * z); ctx.strokeStyle = lit(C.ripple, n, 0.7, 0.2); ctx.beginPath();
  for (const r of D.ripples) { if (!view.visible(r.x, r.z, 0.5)) continue; const a = view.P(r.x, r.z), b = view.P(r.x + r.l, r.z - r.l * 0.35); ctx.moveTo(a.sx, a.sy); ctx.quadraticCurveTo((a.sx + b.sx) / 2, (a.sy + b.sy) / 2 - 1.5 * z, b.sx, b.sy); }
  ctx.stroke(); ctx.restore();

  // the station's plateau: a raised shelf of wind-packed snow, its near edges falling away in blue shade
  if (S.station) {
    const { x, z: q, w, d } = S.station;
    ctx.save();
    rect(view, ctx, x - 0.15, q - 0.15, w + 0.6, d + 0.6); ctx.fillStyle = lit(C.shade, n, 0.45, 0.25); ctx.fill();
    rect(view, ctx, x, q, w, d); ctx.fillStyle = lit(C.plateau, n); ctx.fill();
    ctx.lineWidth = Math.max(1, 1.4 * z); ctx.strokeStyle = lit('#ffffff', n, 0.8);
    const a = view.P(x, q + d), b = view.P(x, q), c = view.P(x + w, q); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.stroke();
    ctx.restore();
  }

  // trails: trodden snow and footprints / treads
  ctx.save();
  for (const [x, q, w, d] of S.trails) { rect(view, ctx, x + 0.2, q + 0.2, w - 0.4, d - 0.4); ctx.fillStyle = lit(C.track, n, 0.35, 0.2); ctx.fill(); }
  ctx.fillStyle = lit('#7d90aa', n, 0.55, 0.2);
  for (const s of D.steps) { if (!view.visible(s.x, s.z, 0.3)) continue; const p = view.P(s.x, s.z); ctx.fillRect(p.sx - 1.3 * z, p.sy - 0.6 * z, 2.6 * z, 1.2 * z); }
  ctx.restore();

  // the ploughed road: packed grey-blue snow, two dark ruts, white berms along both edges
  ctx.save();
  for (const [x, q, w, d] of map.roads) { rect(view, ctx, x, q, w, d); ctx.fillStyle = lit(C.road, n, 1, 0.12); ctx.fill(); }
  ctx.lineCap = 'round';
  for (const [x, q, w, d] of map.roads) {
    const horiz = w > d;
    const seg = (o, col, lw) => { const a = horiz ? view.P(x, q + d * o) : view.P(x + w * o, q), b = horiz ? view.P(x + w, q + d * o) : view.P(x + w * o, q + d); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); };
    for (const o of [0.3, 0.7]) seg(o, lit(C.rut, n, 0.55, 0.15), Math.max(1.5, 2.2 * z));
    seg(0.04, lit(C.berm, n, 0.95), Math.max(2, 3.2 * z)); seg(0.96, lit(C.berm, n, 0.95), Math.max(2, 3.2 * z));
    seg(0.1, lit(C.shade, n, 0.35, 0.25), Math.max(1, 1.2 * z));
  }
  ctx.restore();

  // the frozen lake: a white bank, then the ice (deeper blue toward the middle), snow patches, cracks
  ctx.save();
  for (const b of S.lake) { flat(view, ctx, b.x + 0.12, b.z + 0.12, b.r + 0.4); ctx.fillStyle = lit(C.shade, n, 0.5, 0.25); ctx.fill(); }
  for (const b of S.lake) { flat(view, ctx, b.x - 0.08, b.z - 0.08, b.r + 0.28); ctx.fillStyle = lit('#ffffff', n, 0.95); ctx.fill(); }
  const lakePath = () => { ctx.beginPath(); for (const b of S.lake) { const p = view.P(b.x, b.z), rx = b.r * TILE_W * 0.5 * z * Math.SQRT2; ctx.moveTo(p.sx + rx, p.sy); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, 0, Math.PI * 2); } };
  lakePath(); ctx.fillStyle = lit(C.ice, n, 1, 0.08); ctx.fill();
  ctx.clip();
  const m = S.lake[0], c0 = view.P(m.x, m.z), R0 = m.r * TILE_W * 0.5 * z * Math.SQRT2;
  const g = ctx.createRadialGradient(c0.sx, c0.sy, R0 * 0.05, c0.sx, c0.sy, R0 * 1.1);
  g.addColorStop(0, lit(C.iceDeep, n, 0.75, 0.1)); g.addColorStop(0.65, lit(C.iceDeep, n, 0.25, 0.1)); g.addColorStop(1, lit(C.iceDeep, n, 0));
  ctx.save(); ctx.translate(c0.sx, c0.sy); ctx.scale(1, 0.5); ctx.translate(-c0.sx, -c0.sy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c0.sx, c0.sy, R0 * 1.1, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  for (const p of D.patches) { flat(view, ctx, p.x, p.z, p.r); ctx.fillStyle = lit('#ffffff', n, 0.25 + p.k * 0.3); ctx.fill(); }
  // a sheen sliding slowly across the ice (it reads as glassy, not as more snow)
  const sh = (t * 0.04) % 1, a = view.P(m.x - m.r + sh * m.r * 2, m.z - m.r), b = view.P(m.x - m.r + sh * m.r * 2, m.z + m.r);
  ctx.strokeStyle = lit('#ffffff', n, 0.18); ctx.lineWidth = 10 * z; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  ctx.lineJoin = 'round';
  for (const cr of D.cracks) {
    ctx.beginPath(); cr.pts.forEach(([x, q], i) => { const p = view.P(x, q); if (i) ctx.lineTo(p.sx, p.sy); else ctx.moveTo(p.sx, p.sy); });
    ctx.strokeStyle = lit(C.crackDark, n, 0.5); ctx.lineWidth = Math.max(1, 1.3 * z * cr.w); ctx.stroke();
    ctx.strokeStyle = lit(C.crack, n, 0.8); ctx.lineWidth = Math.max(0.6, 0.6 * z * cr.w); ctx.stroke();
  }
  ctx.restore();

  // the lift: the cable's shadow on the snow under it
  const cab = cables(map);
  if (cab) {
    ctx.save(); ctx.strokeStyle = lit('#5d7394', n, 0.28, 0.2); ctx.lineWidth = Math.max(1, 1.2 * z);
    for (const line of cab.lines) { ctx.beginPath(); line.forEach((p, i) => { const q = view.P(p.x + 0.35, p.z - 0.35 + p.y * 0.2); if (i) ctx.lineTo(q.sx, q.sy); else ctx.moveTo(q.sx, q.sy); }); ctx.stroke(); }
    ctx.restore();
  }

  // the station yard: a cleared pad with a painted box and corner marks
  if (map.zones?.station) {
    const y = map.zones.station;
    ctx.save();
    rect(view, ctx, y.x - 1.6, y.z - 1.6, 3.2, 3.2); ctx.fillStyle = lit('#9aa5b2', n); ctx.fill();
    ctx.strokeStyle = lit('#e8b52a', n, 0.85); ctx.lineWidth = Math.max(1, 1.6 * z); rect(view, ctx, y.x - 1.35, y.z - 1.35, 2.7, 2.7); ctx.stroke();
    ctx.strokeStyle = lit('#f4f8fc', n, 0.75); ctx.lineWidth = Math.max(1, 2 * z);
    const p1 = view.P(y.x - 0.5, y.z - 0.5), p2 = view.P(y.x + 0.5, y.z + 0.5), p3 = view.P(y.x - 0.5, y.z + 0.5), p4 = view.P(y.x + 0.5, y.z - 0.5);
    ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p3.sx, p3.sy); ctx.moveTo(p4.sx, p4.sy); ctx.lineTo(p2.sx, p2.sy); const pm1 = view.P(y.x - 0.5, y.z), pm2 = view.P(y.x + 0.5, y.z); ctx.moveTo(pm1.sx, pm1.sy); ctx.lineTo(pm2.sx, pm2.sy); ctx.stroke();
    ctx.restore();
  }

  // the pads: a ploughed circle, a painted ring, blinking marker lights
  for (const pad of S.pads) {
    if (!view.visible(pad.x, pad.z, pad.r + 2)) continue;
    const p = view.P(pad.x, pad.z), rx = pad.r * TILE_W * 0.5 * z * Math.SQRT2;
    ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5);
    ctx.fillStyle = lit('#ffffff', n, 0.9); ctx.beginPath(); ctx.arc(0, 0, rx * 1.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lit('#8d98a6', n); ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 * z; ctx.strokeStyle = lit('#e0782c', n, 0.9); ctx.beginPath(); ctx.arc(0, 0, rx * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = lit('#f4f8fc', n, 0.7); ctx.fillRect(-rx * 0.35, -rx * 0.05, rx * 0.7, rx * 0.1); ctx.fillRect(-rx * 0.05, -rx * 0.35, rx * 0.1, rx * 0.7);
    for (let i = 0; i < 12; i++) { const a2 = i / 12 * Math.PI * 2, on = (Math.floor(t * 2) + i) % 3 === 0; ctx.fillStyle = on ? '#ffd27a' : 'rgba(255,210,122,0.3)'; ctx.beginPath(); ctx.arc(Math.cos(a2) * rx, Math.sin(a2) * rx, (on ? 2.6 : 1.8) * z, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // snow poles marking the edge of the field
  ctx.save(); ctx.lineWidth = Math.max(1, 1.2 * z);
  for (const q of D.poles) { if (!view.visible(q.x, q.z, 0.5)) continue; const a2 = view.P(q.x, q.z), b2 = view.P(q.x, q.z, 0.28); ctx.strokeStyle = lit('#2c3440', n, 0.8); ctx.beginPath(); ctx.moveTo(a2.sx, a2.sy); ctx.lineTo(b2.sx, b2.sy); ctx.stroke(); ctx.fillStyle = lit('#e0782c', n); ctx.fillRect(b2.sx - 1.2 * z, b2.sy, 2.4 * z, 3 * z); }
  ctx.restore();

  // dusk: the station's windows and lamps light the snow round it (warm, added light)
  if (n > 0.05) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const L of D.lightsAt) {
      if (!view.visible(L.x, L.z, L.r + 1)) continue;
      const p = view.P(L.x, L.z), rx = L.r * TILE_W * 0.5 * z * Math.SQRT2, gl = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rx);
      const a3 = Math.min(0.32, n * 0.55);
      gl.addColorStop(0, `rgba(255,190,110,${a3})`); gl.addColorStop(0.5, `rgba(255,170,90,${a3 * 0.4})`); gl.addColorStop(1, 'rgba(255,170,90,0)');
      ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5); ctx.translate(-p.sx, -p.sy); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(p.sx, p.sy, rx, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }
}

const cableCache = new WeakMap();
/** The lift's two cables as points (x, z, y) with a sag between towers: one runs out, one back. */
function cables(map) {
  if (cableCache.has(map)) return cableCache.get(map);
  const L = map.snow?.lift; let out = null;
  if (L) {
    const stations = map.lots.filter(l => l.recipe === 'snow-lift').map(l => ({ x: l.x + l.w / 2, y: 0.64 }));
    const towers = map.lots.filter(l => l.recipe === 'snow-pylon').map(l => ({ x: l.x + 0.5, y: L.h }));
    const stops = [...stations, ...towers].sort((a, b) => a.x - b.x);
    if (stops.length >= 2) {
      const lines = [-0.36, 0.36].map(off => {
        const pts = [];
        for (let i = 0; i + 1 < stops.length; i++) {
          const a = stops[i], b = stops[i + 1], n = Math.max(2, Math.round((b.x - a.x) * 1.5)), sag = Math.min(0.25, (b.x - a.x) * 0.035);
          for (let k = i ? 1 : 0; k <= n; k++) { const f = k / n; pts.push({ x: a.x + (b.x - a.x) * f, z: L.z + off, y: a.y + (b.y - a.y) * f - sag * 4 * f * (1 - f) }); }
        }
        return pts;
      });
      const len = lines[0].reduce((s, p, i) => (i ? s + Math.abs(p.x - lines[0][i - 1].x) : 0), 0);
      out = { lines, len, x0: stops[0].x, x1: stops[stops.length - 1].x };
    }
  }
  cableCache.set(map, out); return out;
}
/** Height of a cable at x (piecewise along its points). */
function cableAt(line, x) {
  for (let i = 1; i < line.length; i++) if (x <= line[i].x) { const a = line[i - 1], b = line[i], f = (x - a.x) / ((b.x - a.x) || 1); return a.y + (b.y - a.y) * f; }
  return line[line.length - 1].y;
}

/** Over the scene: the lift's cables, and cabins riding them (one way on each cable). */
export function drawSnowOver(ctx, view, map, t) {
  const cab = cables(map); if (!cab) return;
  const n = view.night, z = view.zoom;
  ctx.save(); ctx.lineWidth = Math.max(1, 1.1 * z); ctx.strokeStyle = n > 0.5 ? 'rgba(20,26,40,0.9)' : 'rgba(40,46,58,0.85)';
  for (const line of cab.lines) { if (!line.some(p => view.visible(p.x, p.z, 2))) continue; ctx.beginPath(); line.forEach((p, i) => { const q = view.P(p.x, p.z, p.y); if (i) ctx.lineTo(q.sx, q.sy); else ctx.moveTo(q.sx, q.sy); }); ctx.stroke(); }
  ctx.restore();
  const span = cab.x1 - cab.x0; if (span < 4) return;
  const count = Math.max(2, Math.round(span / 9));
  for (let li = 0; li < 2; li++) for (let i = 0; i < count; i++) {
    const f = ((t * 0.018 + i / count + li * 0.5 / count) % 1), x = li ? cab.x1 - 0.8 - f * (span - 1.6) : cab.x0 + 0.8 + f * (span - 1.6), line = cab.lines[li];
    const zz = line[0].z; if (!view.visible(x, zz, 2)) continue;
    const y = cableAt(line, x), sp = view.sprites?.building('snow-cabin', { floors: 1, seed: i + li * 7, rot: 1 }, 0);
    const q = view.P(x, zz, y - 0.48);
    if (sp) composite(ctx, sp, q.sx, q.sy, n, view.zoom / view.sprites.scale);
    else { ctx.fillStyle = '#c4402f'; ctx.fillRect(q.sx - 4 * z, q.sy - 8 * z, 8 * z, 7 * z); }
  }
}

/** Instead of drifting ash: snow falling at a slant, near flakes bigger and faster, tied to the camera a little. */
export function drawSnowfall(view, ctx, t) {
  const W = view.W, H = view.H, cx = view.cam.x * 40, cz = view.cam.z * 40, n = 110;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12543.123, r1 = h1 - Math.floor(h1), r2 = h2 - Math.floor(h2);
    const near = r2 > 0.8, sp = near ? 70 + r1 * 40 : 24 + r1 * 30;
    const x = ((r1 * W * 1.4 - t * sp * 0.35 + Math.sin(t * 0.9 + i) * 10 - cx * (near ? 0.5 : 0.25)) % (W * 1.1) + W * 1.1) % (W * 1.1) - W * 0.05;
    const y = ((r2 * H * 1.3 + t * sp - cz * (near ? 0.5 : 0.25)) % (H * 1.1) + H * 1.1) % (H * 1.1) - H * 0.05;
    const a = near ? 0.75 : 0.35 + r1 * 0.3, s = near ? 2.6 + r1 * 1.4 : 1.2 + r1 * 1.1;
    ctx.fillStyle = `rgba(245,250,255,${a.toFixed(2)})`; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
