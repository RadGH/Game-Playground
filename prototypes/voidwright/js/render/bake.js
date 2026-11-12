// Bake a block grid into a picture (and a glow picture for the lit bits).
//
// The hull is built from squares, but the outline is smoothed afterwards (PLAN §0 #5): every outside
// corner is cut at 45° and every inside corner is filled at 45°, so staircases read as slopes — the
// same idea as a pixel-art upscaler. The slopes are cosmetic: hits and collisions use the square grid.

import { CELL } from '../sim/grid.js';
import { ARMOR } from '../data/types.js';
import { FACTIONS } from '../data/factions.js';
import { hash, rng } from '../core/math.js';

const mk = (w, h) => { const c = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return c; };

export const PLAYER_PALETTE = { hull: '#46566e', trim: '#ffb84a', light: '#6fd0ff', dark: '#10141e' };

export function paletteFor(s) {
  if (s.team === 'player' || s.faction === 'player') return s.palette || PLAYER_PALETTE;
  const F = FACTIONS[s.fromFaction || s.faction];
  if (!F) return { hull: '#5d544c', trim: '#8a7a6a', light: '#ffcc88', dark: '#2a2420' };
  return { hull: F.style.hull, trim: F.style.trim, light: F.style.light, dark: '#101418' };
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; } else { r *= 1 + k; g *= 1 + k; b *= 1 + k; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const r = ((na >> 16) * (1 - t) + (nb >> 16) * t) | 0, g = (((na >> 8) & 255) * (1 - t) + ((nb >> 8) & 255) * t) | 0, bl = ((na & 255) * (1 - t) + (nb & 255) * t) | 0;
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

/** Pixels per cell for a grid so big things don't make giant canvases. */
export function cellPx(g) { return Math.max(3, Math.min(16, Math.floor(1800 / Math.max(g.w, g.h)))); }

/**
 * Which corners get smoothed, as plain data (tested in tests/bake-corners.test.mjs).
 *   fills: wedges added to EMPTY cell (x, y) at its corner toward (dx, dy), where both side neighbours are filled.
 *   cuts:  triangles removed from FILLED cell (x, y) at its corner toward (dx, dy), where all three cells around
 *          that corner are empty.
 * A triangle sits at the cell corner on the (dx, dy) side, with legs of c cells running back along -dx and -dy, so
 * every wedge and every cut faces away from the filled cells. Ships use half-cell legs everywhere so neighbouring
 * slopes line up into one straight edge; a big block's own outer corner gets a full-cell cut only when no wedge
 * touches either end of it (otherwise the two slopes would not line up and leave a notch). Rocks use the same sizes:
 * their old lumpier ones (wedges 0.85, cuts 0.75) did not line up either, and every step of an asteroid's rim showed
 * a little tooth jutting out (owner, iPhone, 2026-11-12).
 */
export function cornerPlan(g) {
  const filled = (x, y) => { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0; const v = g.cells[y * g.w + x]; return v ? g.blocks[v - 1] : 0; };
  const DIRS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  const fills = [], cuts = [];
  for (let y = -1; y <= g.h; y++) for (let x = -1; x <= g.w; x++) {
    if (filled(x, y)) continue;
    for (const [dx, dy] of DIRS) if (filled(x + dx, y) && filled(x, y + dy)) fills.push({ x, y, dx, dy, c: 0.5 });
  }
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const b = filled(x, y); if (!b) continue;
    for (const [dx, dy] of DIRS) {
      if (filled(x + dx, y) || filled(x, y + dy) || filled(x + dx, y + dy)) continue;
      const k = b.def.size || 1;
      const atCorner = k > 1 && (dx < 0 ? x === b.x : x === b.x + k - 1) && (dy < 0 ? y === b.y : y === b.y + k - 1);
      // a full-cell cut ends at the far corners of this cell; a wedge there would meet it at a different line
      const clear = atCorner && !filled(x - dx, y + dy) && !filled(x + dx, y - dy);
      cuts.push({ x, y, dx, dy, c: clear ? 1 : 0.5 });
    }
  }
  return { fills, cuts };
}

/**
 * @returns {{ hull: Canvas, glow: Canvas, px: number, w: number, h: number }}
 *   drawn so that the grid's (0,0) corner is at (pad, pad).
 */
export function bakeBody(s, opts = {}) {
  const g = s.grid; const P = cellPx(g); const pad = P * 2;
  const W = g.w * P + pad * 2, H = g.h * P + pad * 2;
  const pal = paletteFor(s);
  const wreck = s.kind === 'wreck'; const rock = s.kind === 'rock';
  const filled = (x, y) => { if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 0; const v = g.cells[y * g.w + x]; return v ? g.blocks[v - 1] : 0; };

  // --- silhouette mask with smoothed corners
  // Cells are filled exactly (no overlap): the old "+0.5 px" overlap left a half-pixel strip past every right/bottom
  // cut, which the dark outline pass then thickened into little square stubs sticking out of the slopes (report #30).
  const mask = mk(W, H); const m = mask.getContext('2d');
  m.fillStyle = '#fff';
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (filled(x, y)) m.fillRect(pad + x * P, pad + y * P, P, P);
  const plan = cornerPlan(g);
  const tri = (x, y, dx, dy, c) => {
    const cx = pad + (x + (dx > 0 ? 1 : 0)) * P, cy = pad + (y + (dy > 0 ? 1 : 0)) * P; const k = c * P;
    m.beginPath(); m.moveTo(cx, cy); m.lineTo(cx - dx * k, cy); m.lineTo(cx, cy - dy * k); m.closePath(); m.fill();
  };
  // inside corners: a 45° wedge into empty cells that sit in an L of filled ones
  for (const f of plan.fills) tri(f.x, f.y, f.dx, f.dy, f.c);
  // outside corners: cut them at 45°
  m.globalCompositeOperation = 'destination-out';
  for (const f of plan.cuts) tri(f.x, f.y, f.dx, f.dy, f.c);
  m.globalCompositeOperation = 'source-over';

  // --- block art
  const art = mk(W, H); const a = art.getContext('2d');
  const glow = mk(W, H); const gl = glow.getContext('2d');
  a.fillStyle = wreck ? shade(pal.hull, -0.45) : rock ? '#4d453f' : pal.hull; a.fillRect(0, 0, W, H);   // concave wedges take the hull colour
  const r = rng(hash(s.seed || s.id, g.w, g.h));
  for (const b of g.blocks) {
    if (!b.alive) continue;
    drawBlock(a, gl, b, pad + b.x * P, pad + b.y * P, (b.def.size || 1) * P, pal, r, wreck, rock);
  }
  // mask the art to the silhouette
  a.globalCompositeOperation = 'destination-in'; a.drawImage(mask, 0, 0); a.globalCompositeOperation = 'source-over';
  gl.globalCompositeOperation = 'destination-in'; gl.drawImage(mask, 0, 0); gl.globalCompositeOperation = 'source-over';

  // --- outline rim + soft inner edge light
  const out = mk(W, H); const o = out.getContext('2d');
  o.globalAlpha = 1;
  const rim = mk(W, H); const rc = rim.getContext('2d'); rc.drawImage(mask, 0, 0); rc.globalCompositeOperation = 'source-in'; rc.fillStyle = rock ? '#1a1612' : pal.dark || '#0a0d12'; rc.fillRect(0, 0, W, H);
  const lw = Math.max(1, P * 0.14);
  for (const [dx, dy] of [[-lw, 0], [lw, 0], [0, -lw], [0, lw], [-lw, -lw], [lw, lw], [lw, -lw], [-lw, lw]]) o.drawImage(rim, dx, dy);
  o.drawImage(art, 0, 0);
  // top-left highlight along the silhouette edge (light from the upper left)
  const hl = mk(W, H); const hc = hl.getContext('2d');
  hc.drawImage(mask, 0, 0); hc.globalCompositeOperation = 'destination-out'; hc.drawImage(mask, lw * 1.2, lw * 1.2);
  hc.globalCompositeOperation = 'source-in'; hc.fillStyle = 'rgba(255,255,255,0.35)'; hc.fillRect(0, 0, W, H);
  o.drawImage(hl, 0, 0);
  const sh = mk(W, H); const sc = sh.getContext('2d');
  sc.drawImage(mask, 0, 0); sc.globalCompositeOperation = 'destination-out'; sc.drawImage(mask, -lw * 1.4, -lw * 1.4);
  sc.globalCompositeOperation = 'source-in'; sc.fillStyle = 'rgba(0,0,0,0.45)'; sc.fillRect(0, 0, W, H);
  o.drawImage(sh, 0, 0);
  if (opts.ghost) { o.globalCompositeOperation = 'source-in'; o.fillStyle = 'rgba(120,200,255,0.5)'; o.fillRect(0, 0, W, H); }
  return { hull: out, glow, px: P, pad, w: W, h: H, mask };
}

/** Draw one block's art into a square at (x, y) of side S. */
function drawBlock(a, gl, b, x, y, S, pal, r, wreck, rock) {
  const d = b.def; const cat = d.cat;
  const hpR = b.hp / b.maxHp;
  const inset = S * 0.06;
  const armorCol = ARMOR[d.armor]?.color || '#888';
  const base = rock ? (d.ore ? mix('#4d453f', d.color, 0.25) : mix('#5d544c', '#6d625a', r())) : cat === 'armor' ? mix(pal.hull, armorCol, 0.55) : pal.hull;
  const col = wreck ? shade(base, -0.5) : base;
  a.fillStyle = col; a.fillRect(x, y, S, S);
  if (rock) {
    // rock: lumpy shading + ore crystals that glow faintly
    a.fillStyle = shade(col, -0.25); for (let i = 0; i < 3; i++) a.fillRect(x + r() * S * 0.7, y + r() * S * 0.7, S * 0.3, S * 0.3);
    a.fillStyle = shade(col, 0.15); a.fillRect(x + r() * S * 0.6, y + r() * S * 0.6, S * 0.25, S * 0.2);
    if (d.ore) {
      for (let i = 0; i < 3; i++) {
        const cx = x + S * (0.2 + r() * 0.6), cy = y + S * (0.2 + r() * 0.6), cs = S * (0.12 + r() * 0.16);
        a.fillStyle = d.color; a.beginPath(); a.moveTo(cx, cy - cs); a.lineTo(cx + cs * 0.7, cy); a.lineTo(cx, cy + cs); a.lineTo(cx - cs * 0.7, cy); a.closePath(); a.fill();
        a.fillStyle = 'rgba(255,255,255,0.6)'; a.fillRect(cx - cs * 0.15, cy - cs * 0.6, cs * 0.3, cs * 0.3);
        if (d.tier >= 2) { gl.fillStyle = d.color; gl.globalAlpha = 0.5 + d.tier * 0.08; gl.beginPath(); gl.arc(cx, cy, cs * 1.1, 0, Math.PI * 2); gl.fill(); gl.globalAlpha = 1; }
      }
    }
    return;
  }
  // bevel
  a.fillStyle = 'rgba(255,255,255,0.10)'; a.fillRect(x, y, S, inset); a.fillRect(x, y, inset, S);
  a.fillStyle = 'rgba(0,0,0,0.22)'; a.fillRect(x, y + S - inset, S, inset); a.fillRect(x + S - inset, y, inset, S);
  const lit = (c, alpha = 1) => { if (wreck) return; gl.globalAlpha = alpha; gl.fillStyle = c; };
  const cx = x + S / 2, cy = y + S / 2;
  switch (cat) {
    case 'frame': {
      a.strokeStyle = 'rgba(0,0,0,0.25)'; a.lineWidth = Math.max(1, S * 0.04);
      a.strokeRect(x + S * 0.18, y + S * 0.18, S * 0.64, S * 0.64);
      if (r() < 0.25) { a.fillStyle = shade(pal.trim, -0.2); a.fillRect(x + S * 0.1, y + S * 0.45, S * 0.8, S * 0.1); }
      break;
    }
    case 'armor': {
      const n = d.size || 1; const k = S / Math.max(1, n);
      a.strokeStyle = 'rgba(0,0,0,0.3)'; a.lineWidth = Math.max(1, S * 0.03 / n);
      for (let i = 1; i < n * 2; i++) { a.beginPath(); a.moveTo(x + (i * k) / 2, y + inset); a.lineTo(x + (i * k) / 2, y + S - inset); a.stroke(); }
      a.fillStyle = 'rgba(0,0,0,0.35)';
      const rv = Math.max(0.8, S * 0.04);
      for (const [px, py] of [[0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) { a.beginPath(); a.arc(x + S * px, y + S * py, rv, 0, 7); a.fill(); }
      if (d.armor === 'chitin') { a.fillStyle = 'rgba(200,255,120,0.18)'; a.beginPath(); a.ellipse(cx, cy, S * 0.4, S * 0.3, r() * 3, 0, 7); a.fill(); }
      if (d.armor === 'lattice') { a.strokeStyle = 'rgba(127,230,255,0.4)'; a.beginPath(); a.moveTo(x, y); a.lineTo(x + S, y + S); a.moveTo(x + S, y); a.lineTo(x, y + S); a.stroke(); lit('#7fe6ff', 0.25); gl.fillRect(cx - S * 0.05, cy - S * 0.05, S * 0.1, S * 0.1); }
      if (d.armor === 'prism') { a.fillStyle = 'rgba(255,200,255,0.35)'; a.beginPath(); a.moveTo(cx, y + inset); a.lineTo(x + S - inset, cy); a.lineTo(cx, y + S - inset); a.lineTo(x + inset, cy); a.fill(); lit('#ff9ef0', 0.3); gl.fillRect(cx - S * 0.1, cy - S * 0.1, S * 0.2, S * 0.2); }
      if (d.armor === 'basalt') { lit('#ff6a1a', 0.5); gl.fillRect(x + r() * S * 0.7, y + r() * S * 0.7, S * 0.25, S * 0.05); }
      break;
    }
    case 'core': {
      a.fillStyle = shade(pal.hull, -0.4); a.beginPath(); a.arc(cx, cy, S * 0.38, 0, 7); a.fill();
      a.fillStyle = '#0c1824'; a.beginPath(); a.ellipse(cx + S * 0.05, cy, S * 0.3, S * 0.22, 0, 0, 7); a.fill();
      a.fillStyle = 'rgba(160,220,255,0.7)'; a.beginPath(); a.ellipse(cx + S * 0.12, cy - S * 0.07, S * 0.1, S * 0.05, -0.4, 0, 7); a.fill();
      lit(pal.light, 0.8); gl.beginPath(); gl.ellipse(cx + S * 0.05, cy, S * 0.3, S * 0.22, 0, 0, 7); gl.fill();
      break;
    }
    case 'power': {
      a.fillStyle = shade(pal.hull, -0.35); a.fillRect(x + S * 0.15, y + S * 0.15, S * 0.7, S * 0.7);
      a.fillStyle = '#ffe08a'; a.beginPath(); a.arc(cx, cy, S * 0.22, 0, 7); a.fill();
      a.strokeStyle = 'rgba(0,0,0,0.4)'; a.lineWidth = Math.max(1, S * 0.05);
      for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + 0.785; a.beginPath(); a.moveTo(cx + Math.cos(an) * S * 0.24, cy + Math.sin(an) * S * 0.24); a.lineTo(cx + Math.cos(an) * S * 0.38, cy + Math.sin(an) * S * 0.38); a.stroke(); }
      lit('#ffd060', 0.95); gl.beginPath(); gl.arc(cx, cy, S * 0.26, 0, 7); gl.fill();
      break;
    }
    case 'engine': {
      a.fillStyle = shade(pal.hull, -0.3); a.fillRect(x + S * 0.2, y + S * 0.12, S * 0.7, S * 0.76);
      a.fillStyle = '#20242c'; a.beginPath(); a.moveTo(x, y + S * 0.18); a.lineTo(x + S * 0.3, y + S * 0.28); a.lineTo(x + S * 0.3, y + S * 0.72); a.lineTo(x, y + S * 0.82); a.fill();
      lit(pal.light, 0.9); gl.fillRect(x, y + S * 0.3, S * 0.18, S * 0.4);
      break;
    }
    case 'gyro': {
      a.strokeStyle = shade(pal.trim, -0.1); a.lineWidth = Math.max(1, S * 0.1); a.beginPath(); a.arc(cx, cy, S * 0.3, 0, 7); a.stroke();
      a.fillStyle = shade(pal.hull, -0.4); a.beginPath(); a.arc(cx, cy, S * 0.12, 0, 7); a.fill();
      break;
    }
    case 'cpu': {
      a.fillStyle = '#152018'; a.fillRect(x + S * 0.18, y + S * 0.18, S * 0.64, S * 0.64);
      a.strokeStyle = '#d0b050'; a.lineWidth = Math.max(0.6, S * 0.03);
      for (let i = 0; i < 3; i++) { a.beginPath(); a.moveTo(x + S * 0.18, y + S * (0.3 + i * 0.2)); a.lineTo(x + S * 0.05, y + S * (0.3 + i * 0.2)); a.moveTo(x + S * 0.82, y + S * (0.3 + i * 0.2)); a.lineTo(x + S * 0.95, y + S * (0.3 + i * 0.2)); a.stroke(); }
      lit('#5fff8a', 0.9); for (let i = 0; i < 3; i++) gl.fillRect(x + S * (0.28 + i * 0.16), y + S * 0.45, S * 0.08, S * 0.08);
      break;
    }
    case 'crew': {
      const n = d.size || 1; const rows = 2 * n, cols = 3 * n;
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const wx = x + S * (0.12 + i * 0.76 / cols), wy = y + S * (0.2 + j * 0.6 / rows); const ww = S * 0.6 / cols, wh = S * 0.35 / rows;
        a.fillStyle = '#1a1410'; a.fillRect(wx, wy, ww, wh);
        if (r() < 0.75) { lit('#ffd8a0', 0.8); gl.fillRect(wx, wy, ww, wh); }
      }
      break;
    }
    case 'cargo': {
      a.fillStyle = shade('#a08050', wreck ? -0.5 : 0); a.fillRect(x + S * 0.12, y + S * 0.12, S * 0.76, S * 0.76);
      a.fillStyle = 'rgba(0,0,0,0.3)'; a.fillRect(x + S * 0.12, y + S * 0.47, S * 0.76, S * 0.06); a.fillRect(x + S * 0.47, y + S * 0.12, S * 0.06, S * 0.76);
      a.fillStyle = '#e8c040'; a.fillRect(x + S * 0.12, y + S * 0.12, S * 0.76, S * 0.07);
      break;
    }
    case 'shield': {
      a.fillStyle = shade(pal.hull, -0.4); a.beginPath(); a.arc(cx, cy, S * 0.36, 0, 7); a.fill();
      a.fillStyle = '#8fd8ff'; a.beginPath(); a.arc(cx, cy, S * 0.18, 0, 7); a.fill();
      if (d.shield.kind === 'arc') { const an = b.rot * Math.PI / 4; a.strokeStyle = '#bfe8ff'; a.lineWidth = Math.max(1, S * 0.08); a.beginPath(); a.arc(cx, cy, S * 0.34, an - 0.9, an + 0.9); a.stroke(); }
      lit('#7fd0ff', 0.9); gl.beginPath(); gl.arc(cx, cy, S * 0.22, 0, 7); gl.fill();
      break;
    }
    case 'weapon': {
      a.fillStyle = shade(pal.hull, -0.45); a.beginPath(); a.arc(cx, cy, S * 0.42, 0, 7); a.fill();
      a.strokeStyle = shade(pal.trim, -0.2); a.lineWidth = Math.max(1, S * 0.05); a.beginPath(); a.arc(cx, cy, S * 0.42, 0, 7); a.stroke();
      break;
    }
    case 'drone': {
      a.fillStyle = '#1a1e24'; a.fillRect(x + S * 0.15, y + S * 0.2, S * 0.7, S * 0.6);
      a.fillStyle = '#e8c040';
      for (let i = 0; i < 4; i++) a.fillRect(x + S * (0.18 + i * 0.17), y + S * 0.2, S * 0.08, S * 0.6);
      lit('#ffb040', 0.6); gl.fillRect(x + S * 0.15, y + S * 0.78, S * 0.7, S * 0.05);
      break;
    }
    case 'utility': {
      a.fillStyle = shade(pal.hull, -0.35); a.fillRect(x + S * 0.16, y + S * 0.16, S * 0.68, S * 0.68);
      const ic = d.repair ? '#6fff8a' : d.scan ? '#ffe060' : d.jump ? '#c080ff' : d.magnet ? '#ff7060' : d.cloak ? '#80a0ff' : '#ffffff';
      a.fillStyle = ic;
      if (d.repair) { a.fillRect(cx - S * 0.06, cy - S * 0.22, S * 0.12, S * 0.44); a.fillRect(cx - S * 0.22, cy - S * 0.06, S * 0.44, S * 0.12); }
      else if (d.scan) { a.beginPath(); a.arc(cx, cy, S * 0.22, Math.PI * 0.8, Math.PI * 2.2); a.lineWidth = S * 0.08; a.strokeStyle = ic; a.stroke(); }
      else { a.beginPath(); a.arc(cx, cy, S * 0.16, 0, 7); a.fill(); }
      lit(ic, 0.7); gl.beginPath(); gl.arc(cx, cy, S * 0.12, 0, 7); gl.fill();
      break;
    }
  }
  gl.globalAlpha = 1;
  // damage: scorch and cracks
  if (hpR < 0.65) {
    a.fillStyle = `rgba(10,6,4,${(0.65 - hpR) * 0.9})`; a.beginPath(); a.arc(x + S * (0.3 + r() * 0.4), y + S * (0.3 + r() * 0.4), S * 0.4, 0, 7); a.fill();
    a.strokeStyle = 'rgba(0,0,0,0.6)'; a.lineWidth = Math.max(0.7, S * 0.04); a.beginPath();
    let px = x + S * r(), py = y + S * r(); a.moveTo(px, py);
    for (let i = 0; i < 3; i++) { px += (r() - 0.5) * S * 0.6; py += (r() - 0.5) * S * 0.6; a.lineTo(px, py); }
    a.stroke();
    if (hpR < 0.3 && !wreck) { gl.fillStyle = '#ff6020'; gl.globalAlpha = 0.6; gl.fillRect(px - S * 0.06, py - S * 0.06, S * 0.12, S * 0.12); gl.globalAlpha = 1; }
  }
}

/** A cheap number that changes when blocks change enough to need a new picture. */
export function bakeKey(s) {
  let k = s.grid.version * 131;
  for (const b of s.grid.blocks) if (b.alive) k += Math.floor(b.hp / b.maxHp * 3) * ((b.idx % 17) + 1);
  return k;
}

export { shade, mix };
export const CELL_PX = CELL;
