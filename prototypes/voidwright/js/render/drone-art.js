// Drone pictures (report #44, owner: "Drones look like neon arrows… can they be designed to look more like gnats?
// Maybe they could be at 0.5x0.5 size?"). Each drone kind is a tiny ship built from real blocks — the same bake as
// every other hull (cosmetic slopes, bevels, rim light) — drawn with each cell at half a block (DRONE_CELL world
// units), and tinted in the drone's own colour so a Prospector and a Lancer read apart at a glance.

import { createGrid, place, CELL } from '../sim/grid.js';
import { BLOCKS } from '../data/blocks.js';
import { DRONES } from '../data/drones.js';
import { bakeBody, mix } from './bake.js';
import { drawTurret } from './turret-art.js';
import { hash } from '../core/math.js';

/** World units per drone cell: half a ship block. */
export const DRONE_CELL = CELL / 2;

// Rows run top to bottom; column 0 is the stern (engines), the last column the nose. One letter = one 1×1 block.
const KEY = {
  E: 'thruster', G: 'gnat_core', F: 'frame', A: 'steel', C: 'cargo', B: 'shield_bubble', S: 'shield_arc', P: 'repair_bay',
  L: 'pulse_laser', K: 'gatling', M: 'mining_laser', R: 'rocket_pod', H: 'missile_rack', T: 'tesla_coil', X: 'plasma_cannon', D: 'pd_laser',
};
/** One small layout per drone kind (tested: every letter is a real block, every layout is 2-4 cells long). */
export const DRONE_LAYOUTS = {
  dart:      [' F ', 'EGL', ' F '],
  hornet:    ['EA ', 'EGK', 'EA '],
  miner:     ['F  ', 'EGM', 'F  '],
  excavator: ['EFM', 'EGC', 'EFM'],
  quarrier:  ['EFFM', 'EGCF', 'EFFM'],
  mender:    [' P ', 'EGF', ' P '],
  warden:    ['EF ', 'EGD', 'EF '],
  wasp:      ['ER ', 'EGF', 'ER '],
  spark:     [' F ', 'EGT', ' F '],
  lancer:    ['EA  ', 'EGAX', 'EA  '],
  bulwark:   ['EAA', 'EGB', 'EAA'],
  hunter:    ['EH ', 'EGF', 'EH '],
  lattice_mite: [' F ', 'EGT', ' F '],
  vesh_spawn:   [' F ', 'EGX', ' F '],
};
export const blockForLetter = ch => KEY[ch] || null;

/** The block grid for a drone kind (pure data: no canvas). */
export function droneGrid(kind) {
  const rows = DRONE_LAYOUTS[kind] || DRONE_LAYOUTS.dart;
  const g = createGrid(Math.max(...rows.map(r => r.length)), rows.length);
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const id = KEY[ch]; if (id && BLOCKS[id]) place(g, id, x, y, 0); }));
  return g;
}

/** The drone's hull colours: dark plating shaded toward its kind colour, trim and lights in that colour. */
export function dronePalette(kind) {
  const col = DRONES[kind]?.color || '#9fd8ff';
  return { hull: mix('#3a4252', col, 0.32), trim: col, light: col, dark: '#0a0d12' };
}

const cache = new Map();
/** Baked picture for a drone kind: { hull, glow, px, cx, cy, w, h } (cx, cy = the grid centre in canvas pixels). */
export function droneArt(kind) {
  let a = cache.get(kind); if (a) return a;
  const grid = droneGrid(kind); const pal = dronePalette(kind);
  const art = bakeBody({ grid, kind: 'ship', team: 'player', palette: pal, seed: hash('drone', kind) });
  const P = art.px;
  // bake the guns in, pointing forward (a drone turns its whole body to aim)
  const c = art.hull.getContext('2d');
  for (const b of grid.blocks) if (b.def.cat === 'weapon') {
    c.save(); c.translate(art.pad + (b.x + 0.5) * P, art.pad + (b.y + 0.5) * P);
    drawTurret(c, b.def.weapon || b.id, P, 0, 0, pal, null);
    c.restore();
  }
  a = { ...art, cx: art.pad + grid.w * P / 2, cy: art.pad + grid.h * P / 2, gw: grid.w, gh: grid.h };
  cache.set(kind, a);
  return a;
}

/** A small canvas of a drone for cards and lists (CSS sizes it). */
export function droneIcon(kind, px = 64) {
  const a = droneArt(kind);
  const cv = document.createElement('canvas'); cv.width = px; cv.height = px; cv.className = 'drone-icon';
  const c = cv.getContext('2d'); const k = (px * 0.8) / Math.max(a.gw, a.gh) / a.px;
  c.translate(px / 2, px / 2); c.scale(k, k); c.translate(-a.cx, -a.cy);
  c.drawImage(a.hull, 0, 0); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.8; c.drawImage(a.glow, 0, 0);
  return cv;
}
