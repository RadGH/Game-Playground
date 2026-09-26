// Compile a room file into a world (docs/10 §6.9): blocks -> back wall -> ops -> decorator -> things'
// cells -> derived data -> settle. Pure; the same code runs in the browser, the room checker and tests.
import { createGrid, F } from './grid.js';
import { CLS } from './materials.js';
import { decorate } from './decor.js';
import { createRng, hashSeed } from '../core/rng.js';
import { stepCells } from './cellsim.js';
import { stepThermal } from './thermal.js';
import { stepLiquids, createBasin } from './liquids.js';

export const ROOM_FORMAT = 1;

/** Parse the legend (defaults + room overrides) into { char: { mat, pin, cracked, sky, bg, skin } }. */
function legendFor(room, data) {
  const out = {};
  const add = (ch, v) => { out[ch] = typeof v === 'string' ? { mat: v } : { ...v }; };
  for (const [ch, v] of Object.entries(data.legend.chars)) add(ch, v);
  for (const [ch, v] of Object.entries(room.legend || {})) add(ch, v);
  return out;
}

export function validateRoomShape(room, data) {
  const errs = [];
  if (!room.id) errs.push('missing id');
  const [w, h] = room.size || [0, 0], b = room.block || 8;
  if (w % b || h % b) errs.push(`size ${w}x${h} not a multiple of block ${b}`);
  const rows = room.map || [];
  if (rows.length !== h / b) errs.push(`map has ${rows.length} rows, expected ${h / b}`);
  const leg = legendFor(room, data);
  rows.forEach((r, k) => { if (r.length !== w / b) errs.push(`map row ${k} has ${r.length} chars, expected ${w / b}`); for (const ch of r) if (!leg[ch]) errs.push(`row ${k}: unknown legend char '${ch}'`); });
  return [...new Set(errs)];
}

/**
 * @param room   room JSON
 * @param data   { mats, legend, themes }
 * @returns { grid, room, things, wires, basins, entries, exits, skyTop, lights, meta, errors }
 */
export function compileRoom(room, data, opts = {}) {
  const errors = validateRoomShape(room, data);
  if (errors.length && !opts.lenient) throw new Error(`room ${room.id}: ${errors.join('; ')}`);
  const mats = data.mats, id = k => mats.byKey[k] ?? 0;
  const [W, H] = room.size, B = room.block || 8;
  const g = createGrid(W, H, mats);
  const theme = data.themes.themes[room.theme] || data.themes.themes.bench;
  const seed = room.seed ?? hashSeed(room.id);
  g.rngState = hashSeed(seed, 'cells') || 1;
  const leg = legendFor(room, data);
  const backWall = id(theme.backWall || 'stone');
  const sky = new Uint8Array((W / B) * (H / B));
  // 2. blocks
  room.map.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const L = leg[row[c]] || { mat: 'air' }, m = id(L.mat);
      if (L.sky) sky[r * (W / B) + c] = 1;
      for (let y = r * B; y < r * B + B; y++) for (let x = c * B; x < c * B + B; x++) {
        const i = y * W + x; g.mat[i] = m; g.life[i] = mats.cls[m] === CLS.GAS ? 1 : mats.hp[m]; g.temp[i] = mats.temp0[m];
        // shade is filled by the seeded pass below
        if (L.pin) g.flags[i] |= F.PINNED;
        if (L.cracked) g.life[i] = Math.max(1, g.life[i] >> 1);
        g.bg[i] = L.sky ? 0 : (L.bg ? id(L.bg) : backWall);
        if (L.skin && y === r * B) g.aux[i] = 99; // marker: skin applied after ops
      }
    }
  });
  // seeded shade for every cell
  { const rng = createRng(hashSeed(seed, 'shade')); for (let i = 0; i < g.n; i++) g.shade[i] = (rng.next() * 256) | 0; }
  if (room.back) room.back.forEach((row, r) => { for (let c = 0; c < row.length; c++) { const L = leg[row[c]]; if (!L) continue; const m = L.sky ? 0 : id(L.mat); for (let y = r * B; y < r * B + B; y++) for (let x = c * B; x < c * B + B; x++) g.bg[y * W + x] = m; } });
  // 4. ops
  const keepOut = [], basins = [], ropes = [];
  const put = (x, y, m, op) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (op.only && !op.only.includes(mats.list[g.mat[i]]?.key)) return;
    if (op.back) { g.bg[i] = m; return; }
    g.mat[i] = m; g.life[i] = mats.hp[m]; g.temp[i] = mats.temp0[m]; g.flags[i] = op.pin ? F.PINNED : 0;
  };
  for (const op of room.ops || []) {
    const m = op.mat ? id(op.mat) : 0, u = op.unit === 'block' ? B : 1;
    const R = op.rect ? op.rect.map(v => v * u) : null;
    switch (op.op) {
      case 'rect': for (let y = R[1]; y < R[1] + R[3]; y++) for (let x = R[0]; x < R[0] + R[2]; x++) put(x, y, m, op); break;
      case 'frame': { const t = op.thick || 2; for (let y = R[1]; y < R[1] + R[3]; y++) for (let x = R[0]; x < R[0] + R[2]; x++) if (x < R[0] + t || x >= R[0] + R[2] - t || y < R[1] + t || y >= R[1] + R[3] - t) put(x, y, m, op); break; }
      case 'circle': case 'ellipse': { const [cx, cy] = op.at.map(v => v * u), rx = (op.rx ?? op.r) * u, ry = (op.ry ?? op.r) * u;
        for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) put(x, y, m, op); break; }
      case 'poly': { const pts = op.points.map(p => p.map(v => v * u)); const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) if (pointInPoly(x + 0.5, y + 0.5, pts)) put(x, y, m, op); break; }
      case 'line': case 'vein': { const [x0, y0] = op.from.map(v => v * u), [x1, y1] = op.to.map(v => v * u), t = op.thick || 2; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
        const rng = createRng(hashSeed(seed, 'vein', x0, y0)); let wob = 0;
        for (let s = 0; s <= n; s++) { if (op.op === 'vein') wob += (rng.next() - 0.5) * 0.8, wob = Math.max(-(op.wobble || 4), Math.min(op.wobble || 4, wob)); const x = x0 + (x1 - x0) * s / n, y = y0 + (y1 - y0) * s / n + wob;
          for (let dy = -t / 2; dy < t / 2; dy++) for (let dx = -t / 2; dx < t / 2; dx++) put(Math.round(x + dx), Math.round(y + dy), m, op); } break; }
      case 'stairs': { let [x, y] = op.from.map(v => v * u); const dir = op.dir === 'l' ? -1 : 1;
        for (let s = 0; s < op.steps; s++) { const top = y - op.rise * (s + 1) + 1; for (let yy = top; yy <= y; yy++) for (let k = 0; k < op.run; k++) put(x + dir * (s * op.run + k), yy, m, op); } break; }
      case 'arch': { const [x, y, w, h] = R, t = op.thick || 3, cx = x + w / 2, rx = w / 2, cy = y + h, ry = h;
        for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { const d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2; const di = ((xx - cx) / Math.max(1, rx - t)) ** 2 + ((yy - cy) / Math.max(1, ry - t)) ** 2; if (d <= 1 && di > 1) put(xx, yy, m, op); } break; }
      case 'carve': { const nz = op.noise || { scale: 20, threshold: 0.55, octaves: 2 }; const f = noiseFn(hashSeed(seed, 'carve', R[0], R[1]));
        for (let y = R[1]; y < R[1] + R[3]; y++) for (let x = R[0]; x < R[0] + R[2]; x++) { let v = 0, amp = 1, tot = 0, sc = nz.scale; for (let o = 0; o < (nz.octaves || 1); o++) { v += f(x / sc, y / sc) * amp; tot += amp; amp *= 0.5; sc /= 2; } if (v / tot > nz.threshold) put(x, y, m, { ...op, only: op.only }); }
        if (op.keepFloor) { /* simple: nothing extra — carve thresholds keep most floors */ } break; }
      case 'fill': { const [fx, fy] = op.at; let n = 0; const max = op.max || 1e6, stack = [[fx, fy]]; const seen = new Uint8Array(W * H);
        while (stack.length && n < max) { const [x, y] = stack.pop(); if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (seen[i] || g.mat[i] !== 0 || y < op.level) continue; seen[i] = 1; g.mat[i] = m; g.life[i] = 0; g.temp[i] = mats.temp0[m]; n++; stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); } break; }
      case 'scatter': { const rng = createRng(hashSeed(seed, 'scatter', R[0], R[1]));
        for (let k = 0; k < op.count; k++) { const r = rng.int(op.size?.[0] || 3, op.size?.[1] || 8), cx = rng.int(R[0], R[0] + R[2]), cy = rng.int(R[1], R[1] + R[3]); for (let y = cy - r; y <= cy; y++) for (let x = cx - r; x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 * 3 <= r * r && x >= 0 && y >= 0 && x < W && y < H && g.mat[y * W + x] === 0) put(x, y, m, op); } break; }
      case 'strata': { const [a, b] = (op.mats || ['stone', 'dirt']).map(id), [ba, bb] = op.bands || [8, 3];
        for (let y = R[1]; y < R[1] + R[3]; y++) for (let x = R[0]; x < R[0] + R[2]; x++) { const i = y * W + x; if (mats.cls[g.mat[i]] !== CLS.STATIC) continue; const yy = y + (op.tilt || 0) * x; if ((((yy % (ba + bb)) + ba + bb) % (ba + bb)) >= ba) put(x, y, b, op); } break; }
      case 'basin': basins.push(createBasin({ ...op, rect: op.rect })); break;
      case 'rope': { const [x, y] = op.from; for (let k = 0; k < op.length; k++) { if (y + k >= H) break; const i = (y + k) * W + x; if (g.mat[i] !== 0 && k > 0) break; put(x, y + k, id(op.mat || 'rope'), op); } ropes.push(op); break; }
      case 'tunnel': { const r = op.r || 8; const pts = op.points; for (let s = 0; s < pts.length - 1; s++) { const [x0, y0] = pts[s], [x1, y1] = pts[s + 1]; const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let k = 0; k <= n; k++) { const cx = x0 + (x1 - x0) * k / n, cy = y0 + (y1 - y0) * k / n; for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, 0, op); } } break; }
      case 'copy': { const [sx, sy, sw, sh] = R, [tx, ty] = op.to; const buf = []; for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) buf.push(g.mat[(sy + y) * W + sx + x]); for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const m2 = buf[y * sw + (op.flipX ? sw - 1 - x : x)]; put(tx + x, ty + y, m2, {}); } break; }
      case 'clear_decor': keepOut.push(R); break;
      default: errors.push(`unknown op '${op.op}'`);
    }
    if (op.exact && R) keepOut.push(R);
  }
  // keep things' surroundings exact
  for (const t of room.things || []) {
    if (t.rect) keepOut.push([t.rect[0] - 2, t.rect[1] - 2, t.rect[2] + 4, t.rect[3] + 4]);
    else if (t.at) keepOut.push([t.at[0] - 6, t.at[1] - 16, 12, 18]);
  }
  // 5. decorator
  const decorSpec = { ...(theme.decor || {}), ...(room.decor || {}) };
  if (!opts.noDecor) decorate(g, decorSpec, hashSeed(seed, 'decor'), keepOut);
  // skins marked by the legend (moss / glowmoss on the top row of a block that has air above)
  for (let i = 0; i < g.n; i++) if (g.aux[i] === 99) { g.aux[i] = 0; const y = (i / W) | 0; if (y > 0 && g.mat[i - W] === 0) { const ch = Object.values(leg).find(L => L.skin); g.mat[i] = id('moss'); g.life[i] = mats.hp[g.mat[i]]; } }
  // counters, hot chunks, sky columns
  g.counters.waterCells = 0; for (let i = 0; i < g.n; i++) { if (g.mat[i] === 22) g.counters.waterCells++; }
  const skyTop = new Int16Array(W).fill(H);
  for (let x = 0; x < W; x++) { const c = (x / B) | 0; for (let y = 0; y < H; y++) { const r = (y / B) | 0; if (!sky[r * (W / B) + c] && g.mat[y * W + x] === 0) { skyTop[x] = -1; break; } if (g.mat[y * W + x] !== 0) { skyTop[x] = y; break; } } }
  // edges: drains
  if (room.edges?.drain?.length) {
    g.drainMask = new Uint8Array(W + H * 2);
    for (const d of room.edges.drain) { for (let v = d.from; v <= d.to; v++) { if (d.side === 's') g.drainMask[v] = 1; else if (d.side === 'w') g.drainMask[W + v] = 1; else if (d.side === 'e') g.drainMask[W + H + v] = 1; } }
  }
  g.wakeAll(); g.allGfxDirty();
  for (let c = 0; c < g.NC; c++) g.hotNext[c] = 1;
  const world = { grid: g, steamDebt: 0, wind: room.rain?.wind ?? 0, basins, room };
  // 8. settle
  const settle = opts.settle ?? 30; // v2: rooms must settle within 30 ticks (room-check enforces)
  for (let k = 0; k < settle; k++) { stepCells(world, null); stepThermal(world); stepLiquids(world); }
  g.allGfxDirty();
  const things = (room.things || []).map(t => ({ ...t }));
  const entries = {}; for (const t of things) if (t.t === 'entry') entries[t.id] = t;
  return { world, grid: g, room, theme, things, wires: room.wires || [], basins, entries, exits: things.filter(t => t.t === 'exit'), skyTop, keepOut, errors };
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
  return inside;
}
function noiseFn(seed) {
  const h = (x, y) => { let n = (x * 374761393 + y * 668265263 + seed) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; };
}
