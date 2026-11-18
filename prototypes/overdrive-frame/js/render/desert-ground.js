// The desert's ground ("Red Mesa"): warm sand with patches of red hardpan, wind ripples, pebbles and scrub; dry washes
// as pale winding sand beds with dark banks; the wind farm's ridge; dirt tracks with tyre ruts; the highway in
// sun-faded asphalt with drifting sand, cracks and worn paint; the forward base's levelled basin inside a chain-link
// fence; and the two landing pads. Called by View._ground for a map with `desert` (sim/desertmap.js).
// Canvas 2D, nothing baked. Colours fade toward dusk blue-brown as view.night rises (contracts can run at night).
import { TILE_W } from '../../../../citykit/js/iso.js';

const DAY = { far: '#c08f5e', sand: '#d1a26d', hard: 'rgba(176,96,58,0.22)', pale: 'rgba(240,206,152,0.22)', ripple: 'rgba(122,78,44,0.2)', bank: '#a5714a', bed: '#e3c393', track: '#ad8058', rut: 'rgba(92,60,36,0.45)', road: '#5d554e', shoulder: '#8a7d6c', basin: '#ab8a64', berm: '#93714d' };
const NIGHT = { far: '#241a17', sand: '#3a2b24', bank: '#2c201b', bed: '#4a392d', track: '#33251e', road: '#1d1b1d', shoulder: '#2c2724', basin: '#33271f', berm: '#2a1f19' };
const cache = new WeakMap();

const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; }

/** Seeded scatter (map coords) for one map, made once. */
function decor(map) {
  let d = cache.get(map); if (d) return d;
  let s = (map.seed || 1) * 2246822519 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const A = map.w * map.h;
  const blotches = Array.from({ length: Math.round(A * 0.05) }, () => ({ x: rnd() * map.w, z: rnd() * map.h, r: 0.8 + rnd() * 2.6, k: rnd() }));
  const ripples = Array.from({ length: Math.round(A * 0.5) }, () => ({ x: rnd() * map.w, z: rnd() * map.h, l: 0.25 + rnd() * 0.45 }));
  const pebbles = Array.from({ length: Math.round(A * 0.7) }, () => ({ x: rnd() * map.w, z: rnd() * map.h, r: 0.015 + rnd() * rnd() * 0.07, k: rnd() }));
  const scrub = Array.from({ length: Math.round(A * 0.05) }, () => ({ x: rnd() * map.w, z: rnd() * map.h, r: 0.06 + rnd() * 0.09 }));
  const ruts = Array.from({ length: 4 + Math.round(A / 500) }, () => { const x = rnd() * map.w, z = rnd() * map.h, a = rnd() * Math.PI * 2, L = 4 + rnd() * 8, bend = (rnd() - 0.5) * 0.25; return { x, z, a, L, bend }; });
  const cracks = Array.from({ length: Math.round(map.w * 0.8) }, () => ({ x: rnd() * map.w, t: 0.4 + rnd() * 2.2, n: 3 + Math.floor(rnd() * 3), s: rnd() }));
  const drifts = Array.from({ length: Math.round(map.w * 0.35) }, () => ({ x: rnd() * map.w, side: rnd() < 0.5 ? 0 : 1, r: 0.6 + rnd() * 1.4 }));
  d = { blotches, ripples, pebbles, scrub, ruts, cracks, drifts }; cache.set(map, d); return d;
}

/** Ellipse of a ground circle (x, z, r tiles). */
function flat(view, ctx, x, z, r, y = 0) {
  const p = view.P(x, z, y), rx = r * TILE_W * 0.5 * view.zoom * Math.SQRT2;
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, 0, Math.PI * 2); return { p, rx };
}
/** A polyline in map coords. */
function path(view, ctx, pts) { ctx.beginPath(); pts.forEach(([x, z], i) => { const p = view.P(x, z); if (i) ctx.lineTo(p.sx, p.sy); else ctx.moveTo(p.sx, p.sy); }); }
const line = (view, ctx, x0, z0, x1, z1) => { const a = view.P(x0, z0), b = view.P(x1, z1); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); };

export function drawDesertGround(view, ctx, map) {
  const D = decor(map), S = map.desert, n = Math.max(0, Math.min(1, view.night || 0)), z = view.zoom, tw = TILE_W * 0.5 * z;
  const c = k => mix(DAY[k], NIGHT[k], n * 0.9);
  // beyond the map: more of the same desert, a shade darker; the map itself in warm sand
  ctx.fillStyle = c('far'); ctx.fillRect(0, 0, view.W, view.H);
  view._diamond(ctx, 0, 0, map.w, map.h, c('sand'));
  ctx.save(); ctx.globalAlpha = 1 - n * 0.6;
  for (const b of D.blotches) { if (!view.visible(b.x, b.z, b.r + 1)) continue; flat(view, ctx, b.x, b.z, b.r); ctx.fillStyle = b.k < 0.55 ? DAY.hard : DAY.pale; ctx.fill(); }
  // wind ripples: short strokes all lying the same way
  ctx.strokeStyle = DAY.ripple; ctx.lineWidth = Math.max(1, 0.8 * z);
  for (const r of D.ripples) { if (!view.visible(r.x, r.z, 1)) continue; line(view, ctx, r.x, r.z, r.x + r.l, r.z - r.l * 0.35); }
  ctx.restore();

  // the wind farm's ridge: a pale crest with its shadow on the south side
  if (S.ridge && S.ridge.x1 > S.ridge.x0) {
    const { x0, x1, z: rz } = S.ridge;
    ctx.save(); ctx.lineCap = 'round';
    ctx.strokeStyle = n > 0.5 ? 'rgba(20,14,12,0.35)' : 'rgba(120,70,40,0.28)'; ctx.lineWidth = 3.2 * tw; line(view, ctx, x0 - 2, rz + 1.6, x1 + 2, rz + 1.6);
    ctx.strokeStyle = n > 0.5 ? 'rgba(90,70,60,0.25)' : 'rgba(238,200,150,0.35)'; ctx.lineWidth = 2.6 * tw; line(view, ctx, x0 - 2, rz + 0.3, x1 + 2, rz + 0.3);
    ctx.restore();
  }

  // dry washes: dark banks, a pale sand bed, pebbles along the bottom
  for (const wsh of S.washes || []) {
    ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(view, ctx, wsh.pts); ctx.strokeStyle = c('bank'); ctx.lineWidth = (wsh.r * 2 + 0.6) * tw; ctx.stroke();
    path(view, ctx, wsh.pts); ctx.strokeStyle = c('bed'); ctx.lineWidth = (wsh.r * 2 - 0.2) * tw; ctx.stroke();
    path(view, ctx, wsh.pts); ctx.strokeStyle = n > 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(170,120,80,0.25)'; ctx.lineWidth = Math.max(1, 0.5 * tw); ctx.setLineDash([3 * z, 5 * z]); ctx.stroke();
    ctx.restore();
  }

  // tyre ruts across the open sand (patrols, trucks)
  ctx.save(); ctx.strokeStyle = 'rgba(110,72,44,0.3)'; ctx.lineWidth = Math.max(1, 0.9 * z);
  for (const r of D.ruts) {
    if (!view.visible(r.x, r.z, r.L)) continue;
    for (const off of [-0.12, 0.12]) {
      const pts = []; let x = r.x, q = r.z, a = r.a;
      for (let i = 0; i <= 12; i++) { pts.push([x - Math.sin(a) * off, q + Math.cos(a) * off]); x += Math.cos(a) * r.L / 12; q += Math.sin(a) * r.L / 12; a += r.bend / 12 * 4; }
      path(view, ctx, pts); ctx.stroke();
    }
  }
  ctx.restore();

  // dirt tracks: packed earth with two ruts
  for (const [x, q, w, d] of S.tracks || []) view._diamond(ctx, x, q, w, d, c('track'));
  ctx.save(); ctx.strokeStyle = DAY.rut; ctx.lineWidth = Math.max(1, 0.9 * z); ctx.setLineDash([3 * z, 2 * z]);
  for (const [x, q, w, d] of S.tracks || []) for (const off of [0.3, 0.7]) { const horiz = w > d; if (horiz) line(view, ctx, x, q + d * off, x + w, q + d * off); else line(view, ctx, x + w * off, q, x + w * off, q + d); }
  ctx.restore();

  // the highway: shoulders, faded asphalt, cracks, worn edge and centre paint, sand drifting over the edges
  if (S.highway) {
    const [hx, hq, hw, hd] = S.highway;
    view._diamond(ctx, hx, hq - 0.15, hw, hd + 0.3, c('shoulder'));
    view._diamond(ctx, hx, hq + 0.1, hw, hd - 0.2, c('road'));
    ctx.save();
    ctx.strokeStyle = 'rgba(20,18,16,0.5)'; ctx.lineWidth = Math.max(1, 0.6 * z);
    for (const k of D.cracks) { if (!view.visible(k.x, hq + 1.5, 2)) continue; const pts = []; let x = k.x, q = hq + k.t; for (let i = 0; i < k.n; i++) { pts.push([x, q]); x += 0.25 + k.s * 0.2; q += (i % 2 ? -1 : 1) * 0.18; } path(view, ctx, pts); ctx.stroke(); }
    ctx.globalAlpha = 0.5 * (1 - n * 0.5);
    ctx.strokeStyle = '#e8e2d2'; ctx.lineWidth = Math.max(1, 1.1 * z);
    for (const e of [0.35, hd - 0.35]) line(view, ctx, hx, hq + e, hx + hw, hq + e);
    ctx.strokeStyle = '#e0b84a'; ctx.setLineDash([7 * z, 9 * z]); line(view, ctx, hx, hq + hd / 2, hx + hw, hq + hd / 2);
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.7;
    for (const dr of D.drifts) { if (!view.visible(dr.x, hq, 3)) continue; flat(view, ctx, dr.x, dr.side ? hq + hd - 0.1 : hq + 0.1, dr.r * 0.6); ctx.fillStyle = c('sand'); ctx.fill(); }
    ctx.restore();
  }

  // the forward base: a levelled basin of packed earth with a low berm, painted parking stripes, the fence with gates
  if (S.base) {
    const B = S.base;
    view._diamond(ctx, B.x - 0.4, B.z - 0.4, B.w + 0.8, B.d + 0.8, c('berm'));
    view._diamond(ctx, B.x, B.z, B.w, B.d, c('basin'));
    ctx.save(); ctx.globalAlpha = 0.45 * (1 - n * 0.5); ctx.strokeStyle = '#e9e0c8'; ctx.lineWidth = Math.max(1, 0.9 * z);
    for (let k = 0; k < 5; k++) line(view, ctx, B.x + 1 + k * 0.8, B.z + B.d - 2.2, B.x + 1 + k * 0.8, B.z + B.d - 1);
    ctx.strokeStyle = '#ff7a1c'; for (let k = 0; k < 3; k++) line(view, ctx, B.x + B.w - 1, B.z + 2 + k * 0.6, B.x + B.w - 2.5, B.z + 2 + k * 0.6);
    ctx.restore();
    // chain-link fence: posts every tile, two wires, gaps at the gates
    const gate = (x, q) => B.gates.some(g => Math.hypot(g.x - x, g.z - q) < 1.6);
    const side = [];
    for (let x = B.x; x <= B.x + B.w; x++) side.push([x, B.z], [x, B.z + B.d]);
    for (let q = B.z + 1; q < B.z + B.d; q++) side.push([B.x, q], [B.x + B.w, q]);
    ctx.save(); ctx.strokeStyle = n > 0.5 ? 'rgba(150,150,150,0.4)' : 'rgba(70,70,68,0.75)'; ctx.lineWidth = Math.max(1, 0.8 * z);
    for (const [x, q] of side) { if (gate(x, q) || !view.visible(x, q, 1)) continue; const a = view.P(x, q, 0), b = view.P(x, q, 0.17); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); }
    ctx.lineWidth = Math.max(0.6, 0.45 * z); ctx.strokeStyle = n > 0.5 ? 'rgba(150,150,150,0.3)' : 'rgba(70,70,68,0.5)';
    const run = (x0, q0, x1, q1) => { for (const y of [0.08, 0.16]) { const a = view.P(x0, q0, y), b = view.P(x1, q1, y); ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke(); } };
    for (let x = B.x; x < B.x + B.w; x++) for (const q of [B.z, B.z + B.d]) if (!gate(x, q) && !gate(x + 1, q)) run(x, q, x + 1, q);
    for (let q = B.z; q < B.z + B.d; q++) for (const x of [B.x, B.x + B.w]) if (!gate(x, q) && !gate(x, q + 1)) run(x, q, x, q + 1);
    ctx.restore();
  }

  // pebbles and scrub
  ctx.save();
  for (const p of D.pebbles) { if (!view.visible(p.x, p.z, 0.5)) continue; const q = view.P(p.x, p.z), r = p.r * tw; ctx.fillStyle = p.k < 0.55 ? 'rgba(120,58,34,0.6)' : 'rgba(236,210,170,0.55)'; ctx.fillRect(q.sx - r, q.sy - r * 0.5, r * 2, r); }
  for (const b of D.scrub) { if (!view.visible(b.x, b.z, 0.5)) continue; const q = view.P(b.x, b.z), r = b.r * tw; ctx.fillStyle = n > 0.5 ? 'rgba(30,32,22,0.8)' : 'rgba(96,98,52,0.85)'; for (const [dx, dy] of [[0, 0], [r * 0.7, r * 0.2], [-r * 0.6, r * 0.25]]) { ctx.beginPath(); ctx.ellipse(q.sx + dx, q.sy + dy - r * 0.3, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill(); } }
  ctx.restore();

  // landing pads: a dusty concrete disc, a painted ring and cross, edge lights
  const t = performance.now() / 1000;
  for (const pad of S.pads || []) {
    if (!view.visible(pad.x, pad.z, pad.r + 2)) continue;
    const p = view.P(pad.x, pad.z), rx = pad.r * tw * Math.SQRT2;
    ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5);
    ctx.fillStyle = mix('#a39a8a', '#2b2826', n * 0.9); ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(209,162,109,0.35)'; ctx.beginPath(); ctx.arc(rx * 0.35, rx * 0.2, rx * 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 * z; ctx.strokeStyle = 'rgba(232,186,54,0.9)'; ctx.beginPath(); ctx.arc(0, 0, rx * 0.92, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(245,240,230,0.7)'; ctx.fillRect(-rx * 0.35, -rx * 0.05, rx * 0.7, rx * 0.1); ctx.fillRect(-rx * 0.05, -rx * 0.35, rx * 0.1, rx * 0.7);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, on = (Math.floor(t * 2) + i) % 3 === 0; ctx.fillStyle = on ? '#7dff6a' : 'rgba(125,255,106,0.3)'; ctx.beginPath(); ctx.arc(Math.cos(a) * rx, Math.sin(a) * rx, (on ? 2.6 : 1.8) * z, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
