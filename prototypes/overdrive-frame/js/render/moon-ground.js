// The moon's ground (round 5): black sky with stars and the home world off the edge of the map, grey dust speckled
// with stones, pale rover tracks with tread marks (no road paint), craters as shallow bowls with a lit rim, the mine as
// a stepped open pit, and the two landing pads. Called by View._ground for a map with `moon` (sim/moonmap.js).
// Canvas 2D, nothing baked: the moon is mostly empty dust, cheaper drawn than pictured.
import { TILE_W } from '../../../../citykit/js/iso.js';

const C = { sky: '#020306', dust: '#4b4a47', dustDark: '#3f3e3b', track: '#57554f', tread: 'rgba(30,30,28,0.45)', rim: '#77746d', bowl: '#2e2d2b' };
const cache = new WeakMap();

/** Seeded stars (screen) + stones (map) for one map, made once. */
function decor(map) {
  let d = cache.get(map); if (d) return d;
  let s = (map.seed || 1) * 2654435761 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const stars = Array.from({ length: 220 }, () => ({ x: rnd(), y: rnd(), r: rnd() < 0.08 ? 1.6 : 0.8, a: 0.35 + rnd() * 0.6 }));
  const stones = Array.from({ length: Math.round(map.w * map.h * 0.9) }, () => ({ x: rnd() * map.w, z: rnd() * map.h, r: 0.02 + rnd() * rnd() * 0.09, k: rnd() }));
  const blotches = Array.from({ length: Math.round(map.w * map.h * 0.05) }, () => ({ x: rnd() * map.w, z: rnd() * map.h, r: 0.8 + rnd() * 2.2, k: rnd() }));
  d = { stars, stones, blotches }; cache.set(map, d); return d;
}

/** Ellipse of a ground circle (x, z, r tiles) at height y. */
function flat(view, ctx, x, z, r, y = 0) {
  const p = view.P(x, z, y), rx = r * TILE_W * 0.5 * view.zoom * Math.SQRT2;
  ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, 0, Math.PI * 2); return { p, rx };
}

export function drawMoonGround(view, ctx, map) {
  const D = decor(map), M = map.moon, z = view.zoom;
  // the sky: black, stars that drift a little with the camera, the home world low on one side
  ctx.fillStyle = C.sky; ctx.fillRect(0, 0, view.W, view.H);
  const ox = view.cam.x * 2, oy = view.cam.z * 1;
  for (const st of D.stars) {
    const x = ((st.x * view.W * 1.5 - ox) % view.W + view.W) % view.W, y = ((st.y * view.H * 1.5 - oy) % view.H + view.H) % view.H;
    ctx.fillStyle = `rgba(220,230,255,${st.a})`; ctx.fillRect(x, y, st.r, st.r);
  }
  const ex = view.W * 0.12, ey = view.H * 0.16, er = Math.max(18, Math.min(view.W, view.H) * 0.06);
  const eg = ctx.createRadialGradient(ex - er * 0.3, ey - er * 0.3, er * 0.1, ex, ey, er);
  eg.addColorStop(0, '#bfe0ff'); eg.addColorStop(0.5, '#3f7fc4'); eg.addColorStop(1, '#0d2440');
  ctx.save(); ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, er, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.5; ctx.fillStyle = '#e8f2ff'; ctx.beginPath(); ctx.ellipse(ex - er * 0.2, ey - er * 0.15, er * 0.45, er * 0.12, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.restore();

  // the dust, with darker blotches so it never reads as a flat floor
  view._diamond(ctx, 0, 0, map.w, map.h, C.dust);
  ctx.save();
  for (const b of D.blotches) { if (!view.visible(b.x, b.z, b.r + 1)) continue; flat(view, ctx, b.x, b.z, b.r); ctx.fillStyle = b.k < 0.5 ? 'rgba(30,29,27,0.13)' : 'rgba(110,108,102,0.06)'; ctx.fill(); }
  ctx.restore();
  // rover tracks: paler packed dust, two tread lines along each
  for (const [x, q, w, d] of map.roads) view._diamond(ctx, x, q, w, d, C.track);
  ctx.save(); ctx.strokeStyle = C.tread; ctx.lineWidth = Math.max(1, 0.7 * z); ctx.setLineDash([2 * z, 2 * z]);
  for (const [x, q, w, d] of map.roads) for (const off of [0.35, 0.65]) {
    const horiz = w > d, a = horiz ? view.P(x, q + d * off) : view.P(x + w * off, q), b = horiz ? view.P(x + w, q + d * off) : view.P(x + w * off, q + d);
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  }
  ctx.restore();

  // craters: a raised pale rim, a shadowed bowl, the floor lit on the far side
  for (const c of M.craters) {
    if (!view.visible(c.x, c.z, c.r + 2)) continue;
    ctx.save();
    flat(view, ctx, c.x, c.z, c.r + 0.35); ctx.fillStyle = 'rgba(130,126,118,0.35)'; ctx.fill();
    const { p, rx } = flat(view, ctx, c.x, c.z, c.r);
    const g = ctx.createRadialGradient(p.sx, p.sy - rx * 0.18, rx * 0.1, p.sx, p.sy, rx);
    g.addColorStop(0, '#45433f'); g.addColorStop(0.7, C.bowl); g.addColorStop(1, '#232220');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1.5, 1.6 * z); ctx.strokeStyle = C.rim; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();   // near rim catches the light
    ctx.strokeStyle = 'rgba(20,20,18,0.6)'; ctx.beginPath(); ctx.ellipse(p.sx, p.sy, rx, rx / 2, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.restore();
  }

  // the mine: an open pit in steps going down, a ramp, work lights on its floor
  if (M.mine && view.visible(M.mine.x, M.mine.z, M.mine.r + 3)) {
    const m = M.mine, steps = 4;
    ctx.save();
    flat(view, ctx, m.x, m.z, m.r + 0.3); ctx.fillStyle = 'rgba(120,116,108,0.4)'; ctx.fill();
    for (let k = 0; k < steps; k++) {
      const r = m.r * (1 - k / (steps + 0.6)), y = -k * 0.12;
      flat(view, ctx, m.x, m.z, r, y); ctx.fillStyle = `rgb(${62 - k * 9},${60 - k * 9},${56 - k * 8})`; ctx.fill();
      ctx.lineWidth = Math.max(1, z); ctx.strokeStyle = 'rgba(150,145,135,0.35)'; ctx.stroke();
    }
    const t = performance.now() / 1000;
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, q = view.P(m.x + Math.cos(a) * m.r * 0.45, m.z + Math.sin(a) * m.r * 0.45, -0.36); ctx.fillStyle = (Math.floor(t * 1.5) + i) % 4 ? 'rgba(255,190,90,0.55)' : '#ffd27a'; ctx.beginPath(); ctx.arc(q.sx, q.sy, 1.8 * z, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }

  // stones (after the craters so the bowls have them too)
  ctx.save();
  for (const s of D.stones) {
    if (!view.visible(s.x, s.z, 0.5)) continue;
    const p = view.P(s.x, s.z), rx = s.r * TILE_W * 0.5 * z;
    ctx.fillStyle = s.k < 0.6 ? 'rgba(28,27,25,0.55)' : 'rgba(140,136,128,0.5)'; ctx.fillRect(p.sx - rx, p.sy - rx * 0.5, rx * 2, rx);
  }
  ctx.restore();

  // landing pads: dark plate, a painted ring and cross, blinking edge lights
  const t = performance.now() / 1000;
  for (const pad of M.pads) {
    if (!view.visible(pad.x, pad.z, pad.r + 2)) continue;
    const p = view.P(pad.x, pad.z), rx = pad.r * TILE_W * 0.5 * z * Math.SQRT2;
    ctx.save(); ctx.translate(p.sx, p.sy); ctx.scale(1, 0.5);
    ctx.fillStyle = '#2b2e33'; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 * z; ctx.strokeStyle = 'rgba(222,186,64,0.85)'; ctx.beginPath(); ctx.arc(0, 0, rx * 0.93, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2 * z; ctx.strokeStyle = 'rgba(232,236,240,0.6)'; ctx.beginPath(); ctx.arc(0, 0, rx * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(232,236,240,0.55)'; ctx.fillRect(-rx * 0.35, -rx * 0.05, rx * 0.7, rx * 0.1); ctx.fillRect(-rx * 0.05, -rx * 0.35, rx * 0.1, rx * 0.7);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, on = (Math.floor(t * 2) + i) % 3 === 0; ctx.fillStyle = on ? '#7dff6a' : 'rgba(125,255,106,0.25)'; ctx.beginPath(); ctx.arc(Math.cos(a) * rx, Math.sin(a) * rx, (on ? 2.6 : 1.8) * z, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
}
