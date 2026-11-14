// Particles, lights, shockwaves and screen shake. The sim's events become visuals here.

import { RARITY_BY_ID, MATERIALS, DAMAGE } from '../data/types.js';
import { crewText } from '../sim/world.js';
import { CELL } from '../sim/grid.js';
import { ALL_WEAPONS } from '../data/weapons.js';

const mk = (w, h) => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }));

/** Soft round glow sprites, one per colour (cached). */
const glowCache = new Map();
export function glowSprite(color, hard = 0.0) {
  const key = color + hard;
  let c = glowCache.get(key); if (c) return c;
  c = mk(64, 64); const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.12 + hard * 0.3, color); gr.addColorStop(0.45 + hard * 0.2, hexA(color, 0.35)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  glowCache.set(key, c); return c;
}
/** Plain coloured blob for the light canvas (no white core). */
const lightCache = new Map();
export function lightSprite(color) {
  let c = lightCache.get(color); if (c) return c;
  c = mk(64, 64); const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.4, hexA(color, 0.45)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  lightCache.set(color, c); return c;
}
const hexRgb = hex => { const n = parseInt(hex.slice(1, 7), 16); return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export function hexA(hex, a) {
  if (hex.startsWith('rgb')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function createFx(quality = 1) {
  const fx = {
    parts: [], lights: [], waves: [], texts: [], shake: 0, flash: 0, flashColor: [1, 0.85, 0.6], quality, max: 2600, shieldFlash: new Map(),
    scorches: [], deathFlash: [],
    // combat feel (2026-11-13): shakeMul = the player's screen-shake setting (main.js may set it from settings.shake);
    // focus = where the player's ship was last drawn (render/draw.js), so far-off blasts shake less;
    // hurt = a short red pulse round the screen edge when your own hull takes a heavy hit (render/post.js)
    shakeMul: 1, focus: null, hurt: 0,
  };
  return fx;
}

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Particle budget. Hard cap: fx.max x quality (2600 desktop, 1300 on the low setting phones use). Cosmetic emitters
 * also thin out as the pool fills: full counts below 55%, sliding to 30% at the cap, so a big fight never stalls a phone.
 */
function room(fx) {
  const k = fx.parts.length / (fx.max * fx.quality);
  return k < 0.55 ? 1 : Math.max(0.3, 1 - (k - 0.55) / 0.45 * 0.7);
}
const count = (fx, n) => Math.ceil(n * fx.quality * room(fx));

function add(fx, p) {
  if (fx.parts.length >= fx.max * fx.quality) { if (p.prio !== 1) return; fx.parts.shift(); }
  p.age = 0; fx.parts.push(p);
}
export function light(fx, x, y, r, color, life = 0.1, k = 1) { if (fx.lights.length < 260) fx.lights.push({ x, y, r, color, life, max: life, k }); }
export function wave(fx, x, y, maxR, strength = 0.03, life = 0.7) { if (fx.waves.length < 16) fx.waves.push({ x, y, maxR, strength, life, age: 0 }); }
/** Screen shake that fades with distance from your ship (full within ~300, none past ~1600), times the shake setting. */
export function shakeAt(fx, x, y, amt) {
  let k = 1;
  if (fx.focus) { const d = Math.hypot(x - fx.focus[0], y - fx.focus[1]); k = Math.max(0, Math.min(1, 1 - (d - 300) / 1300)); }
  else k = 0.35;   // no ship of yours (title screen): keep it gentle
  fx.shake = Math.max(fx.shake, amt * k * (fx.shakeMul ?? 1));
}

export function sparks(fx, x, y, color, n, speed = 300, life = 0.4, vx = 0, vy = 0, dir = null, spread = Math.PI) {
  n = count(fx, n);
  for (let i = 0; i < n; i++) {
    const a = dir == null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread * 2;
    const s = speed * (0.3 + Math.random() * 0.9);
    add(fx, { k: 'spark', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: life * rand(0.5, 1.2), color, w: rand(1, 2.2), drag: 0.9 });
  }
}
export function glows(fx, x, y, color, n, size, speed, life, vx = 0, vy = 0) {
  n = count(fx, n);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * Math.random(); add(fx, { k: 'glow', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: life * rand(0.6, 1.2), color, size: size * rand(0.6, 1.3), drag: 0.92, grow: 0.6 }); }
}
/** Smoke puffs. `al` = how opaque (0.35 was the old fixed value; explosions now use ~0.16-0.2 — owner: "less smoke"). */
export function smoke(fx, x, y, n, size, life, vx = 0, vy = 0, color = '#2a2622', al = 0.35) {
  n = count(fx, n);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 30 * Math.random(); add(fx, { k: 'smoke', x: x + rand(-size, size) * 0.3, y: y + rand(-size, size) * 0.3, vx: vx * 0.5 + Math.cos(a) * s, vy: vy * 0.5 + Math.sin(a) * s, life: life * rand(0.7, 1.3), color, size: size * rand(0.6, 1.2), drag: 0.96, grow: 1.4, rot: Math.random() * 6, al }); }
}
/** Tumbling debris. `dir`/`spread` aim the spray (e.g. back out of the hole a shot made); hot ones glow orange first. */
export function chips(fx, x, y, color, n, speed, vx = 0, vy = 0, size = 3, dir = null, spread = Math.PI, hot = 0.5) {
  n = count(fx, n);
  for (let i = 0; i < n; i++) { const a = dir == null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread * 2, s = speed * rand(0.3, 1); add(fx, { k: 'chip', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: rand(0.8, 2.2), color, size: size * rand(0.5, 1.3), drag: 0.985, rot: Math.random() * 6, vr: rand(-12, 12), hot: Math.random() < hot }); }
}
export function fireball(fx, x, y, r, vx = 0, vy = 0, color = '#ff8a2a') {
  const n = Math.ceil((4 + r / 8) * fx.quality * room(fx));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.5, s = r * rand(0.6, 2.2);
    add(fx, { k: 'fire', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: vx * 0.6 + Math.cos(a) * s, vy: vy * 0.6 + Math.sin(a) * s, life: rand(0.35, 0.9) * (0.7 + r / 120), size: r * rand(0.35, 0.8), drag: 0.9, grow: 1.1, color, prio: 1 });
  }
}
export function ring(fx, x, y, r, color, life = 0.4, w = 3) { add(fx, { k: 'ring', x, y, vx: 0, vy: 0, r0: r * 0.1, r1: r, life, color, w, prio: 1 }); }
export function text(fx, x, y, str, color, size = 13, life = 1.4) { fx.texts.push({ x, y, str, color, size, life, age: 0, vy: -30 }); if (fx.texts.length > 40) fx.texts.shift(); }
/** A directional muzzle flare: a bright cone along `a` (len x wid world units). */
function flare(fx, x, y, a, len, wid, color, life = 0.07) { add(fx, { k: 'flare', x, y, vx: 0, vy: 0, a, len, wid, color, life }); }
/** The struck block lights up for a moment and moves with its ship (hit flash / plasma scorch / laser burn). */
function blockFlash(fx, e, color, life = 0.12, al = 0.9) {
  if (e.bx == null) return;
  add(fx, { k: 'bflash', x: e.bx, y: e.by, vx: e.bvx || 0, vy: e.bvy || 0, a: e.ba || 0, s: (e.bn || 1) * CELL, color, life, al, prio: 1 });
}
/** A ripple that runs round a shield bubble from the impact point. */
function ripple(fx, cx, cy, R, an, color, life = 0.45, w = 2.5) { add(fx, { k: 'ripple', x: cx, y: cy, vx: 0, vy: 0, R, an, color, life, w, prio: 1 }); }

/** Jagged lightning path between points, with forks. `after` adds a wide, dim afterglow of the same path. */
export function bolt(fx, pts, color, life = 0.18, width = 2, branch = true, after = false) {
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const L = Math.hypot(x1 - x0, y1 - y0); const segs = Math.max(3, Math.round(L / 18));
    const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
    for (let k = 0; k <= segs; k++) { const t = k / segs; const j = (k === 0 || k === segs) ? 0 : (Math.random() - 0.5) * Math.min(28, L * 0.12); path.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]); }
    // forks: up to two per jump, each a short crooked twig that splits again at its tip
    const forks = branch ? (Math.random() < 0.75 ? 1 : 0) + (L > 120 && Math.random() < 0.5 ? 1 : 0) : 0;
    for (let f = 0; f < forks; f++) {
      const bi = Math.floor(path.length * rand(0.35, 0.8)); const [bx, by] = path[bi] || [x0, y0]; const ba = Math.atan2(y1 - y0, x1 - x0) + rand(-1.1, 1.1);
      const bp = [[bx, by]]; let cx = bx, cy = by; const nseg = 3 + Math.floor(Math.random() * 3);
      for (let k = 0; k < nseg; k++) { cx += Math.cos(ba) * 13 + rand(-8, 8); cy += Math.sin(ba) * 13 + rand(-8, 8); bp.push([cx, cy]); }
      add(fx, { k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, pts: bp, color, life: life * 0.8, w: width * 0.55, prio: 1 });
      if (Math.random() < 0.5) { const tw = [[cx, cy]]; const ta = ba + rand(-0.9, 0.9); for (let k = 0; k < 2; k++) tw.push([tw[k][0] + Math.cos(ta) * 11 + rand(-5, 5), tw[k][1] + Math.sin(ta) * 11 + rand(-5, 5)]); add(fx, { k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, pts: tw, color, life: life * 0.6, w: width * 0.35, prio: 1 }); }
    }
  }
  add(fx, { k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, pts: path, color, life, w: width, prio: 1 });
  if (after) add(fx, { k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, pts: path, color, life: life * 3, w: width * 2.2, soft: true, prio: 1 });
}

/** A strong projectile's impact (render/draw.js calls this when a vis 1+ shot vanishes early). */
export function impactFx(fx, x, y, color, v, rc) {
  const c = rc || color;
  add(fx, { k: 'glow', x, y, vx: 0, vy: 0, life: 0.14 + v * 0.03, color: '#ffffff', size: 8 + v * 6, drag: 1, grow: 0.4 });
  glows(fx, x, y, c, 1 + v, 6 + v * 2, 60 + v * 25, 0.3 + v * 0.05);
  sparks(fx, x, y, c, 2 + v * 2, 200 + v * 50, 0.3);
  light(fx, x, y, 60 + v * 35, c, 0.12 + v * 0.03, 1 + v * 0.15);
  if (v >= 3) { ring(fx, x, y, 18 + v * 7, c, 0.25, 2); if (v >= 4) wave(fx, x, y, 60 + v * 15, 0.008, 0.3); }
}

const SIZE_K = { s: 1, m: 1.5, l: 2.2 };
/** How a weapon fires: its proj kind and hit size (the event carries them; older events fall back to the table). */
const wInfo = e => { const W = ALL_WEAPONS[e.w]; return { proj: e.proj || W?.proj || 'bolt', size: e.size || W?.size || 's', W }; };

/** Muzzle effects, one look per kind of shot. Sized by hit size (s/m/l), mount size (e.n) and how grand the part is (vis). */
function muzzle(fx, e, ctx) {
  const c = e.color, v = e.vis || 0, a = e.a, tint = e.rc || c;
  const { proj, size } = wInfo(e);
  const sz = (SIZE_K[size] || 1) * (e.n >= 4 ? 1.8 : e.n >= 2 ? 1.35 : 1) * (1 + v * 0.15);
  const ca = Math.cos(a), sa = Math.sin(a), mine = ctx.isPlayer(e.owner);
  if (String(e.w).startsWith('drone_')) { flare(fx, e.x, e.y, a, 7, 3, c, 0.05); light(fx, e.x, e.y, 40, c, 0.06); return; }
  switch (proj) {
    case 'bolt': case 'pulse': case 'lance':
      flare(fx, e.x, e.y, a, 12 * sz, 4 * sz, c, 0.06);
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.07, color: c, size: 7 * sz, drag: 1, grow: 0 });
      light(fx, e.x, e.y, 60 * sz, c, 0.07);
      if (proj === 'pulse' && size !== 's') sparks(fx, e.x, e.y, '#e0e8ff', 3, 160, 0.12, 0, 0, a, 0.6);   // ion pulse: a crackle
      break;
    case 'bullet':
      flare(fx, e.x, e.y, a, 9 * sz, 4 * sz, '#ffe0a0', 0.045);
      if (Math.random() < 0.5 * fx.quality) add(fx, { k: 'chip', x: e.x, y: e.y, vx: Math.cos(a + 1.6) * 80, vy: Math.sin(a + 1.6) * 80, life: 0.6, color: '#d8b060', size: 1.6, drag: 0.97, rot: 0, vr: 20 });
      light(fx, e.x, e.y, 45 * sz, '#ffd27a', 0.05);
      break;
    case 'shell':
      flare(fx, e.x, e.y, a, 16 * sz, 8 * sz, '#ffc070', 0.08);
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.08, color: '#ffffff', size: 6 * sz, drag: 1, grow: 0 });
      sparks(fx, e.x, e.y, c, 2 + sz, 280, 0.14, 0, 0, a, 0.35);
      add(fx, { k: 'chip', x: e.x, y: e.y, vx: Math.cos(a + 1.6) * 70 + rand(-15, 15), vy: Math.sin(a + 1.6) * 70 + rand(-15, 15), life: 0.9, color: '#d8b060', size: 1.4 + sz * 0.6, drag: 0.97, rot: 0, vr: 16 });
      smoke(fx, e.x + ca * 6 * sz, e.y + sa * 6 * sz, 1, 5 * sz, 0.45, ca * 50, sa * 50, '#5a544e', 0.2);
      light(fx, e.x, e.y, 70 * sz, '#ffb060', 0.09);
      if (size === 'l') ring(fx, e.x, e.y, 10 * sz, '#ffe0b0', 0.16, 1.5);
      break;
    case 'slug': case 'rail':
      // a coil gun: long white-hot spear of a flash, a shock ring and side jets from the coils
      flare(fx, e.x, e.y, a, 26 * sz, 5 * sz, '#ffffff', 0.08);
      flare(fx, e.x, e.y, a, 18 * sz, 9 * sz, tint, 0.12);
      ring(fx, e.x, e.y, 14 * sz, tint, 0.22, 2);
      sparks(fx, e.x, e.y, tint, 3, 220, 0.18, 0, 0, a + Math.PI / 2, 0.25); sparks(fx, e.x, e.y, tint, 3, 220, 0.18, 0, 0, a - Math.PI / 2, 0.25);
      light(fx, e.x, e.y, 110 * sz, tint, 0.12);
      wave(fx, e.x, e.y, (e.n >= 2 ? 160 : 90) * (proj === 'rail' ? 1.3 : 1), 0.012, 0.35);
      shakeAt(fx, e.x, e.y, mine ? 3 + sz : 1);
      break;
    case 'plasma':
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.14, color: c, size: 10 * sz, drag: 1, grow: 0.8 });
      flare(fx, e.x, e.y, a, 12 * sz, 7 * sz, c, 0.08);
      glows(fx, e.x, e.y, c, 2, 3 * sz, 90, 0.2, ca * 80, sa * 80);   // droplets thrown off the muzzle
      light(fx, e.x, e.y, 80 * sz, c, 0.12);
      break;
    case 'arc':
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.1, color: c, size: 9 * sz, drag: 1, grow: 0.4 });
      for (let i = 0; i < 2; i++) { const an = a + rand(-1.4, 1.4), L = rand(8, 16) * sz; bolt(fx, [[e.x, e.y], [e.x + Math.cos(an) * L, e.y + Math.sin(an) * L]], c, 0.08, 1, false); }
      light(fx, e.x, e.y, 70 * sz, c, 0.1);
      break;
    case 'missile': case 'rocket': case 'torpedo': {
      // launch: a hot blast out of the tube, a backblast the other way, a little smoke
      flare(fx, e.x, e.y, a, 9 * sz, 5 * sz, '#ffd090', 0.07);
      flare(fx, e.x, e.y, a + Math.PI, 14 * sz, 6 * sz, '#ff9a4a', 0.12);
      smoke(fx, e.x - ca * 5, e.y - sa * 5, proj === 'torpedo' ? 2 : 1, 7 * sz, 0.6, -ca * 40, -sa * 40, '#5a5550', 0.22);
      light(fx, e.x, e.y, 70 * sz, '#ff9a4a', 0.1);
      break;
    }
    case 'flak':
      flare(fx, e.x, e.y, a, 10 * sz, 5 * sz, '#ffd08a', 0.05);
      light(fx, e.x, e.y, 50 * sz, '#ffc36b', 0.06);
      break;
    case 'mine': ring(fx, e.x, e.y, 10, c, 0.2, 1.2); break;
    default:
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.08, color: c, size: 10 * sz, drag: 1, grow: 0 });
      light(fx, e.x, e.y, 60 * sz, c, 0.08);
  }
  // stronger guns (higher tier / rarer part): a hotter core and, at 3+, a ring in the rarity colour
  if (v >= 1) { add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.06, color: '#ffffff', size: 5 + v * 3, drag: 1, grow: 0 }); sparks(fx, e.x, e.y, tint, 1 + v, 220 + v * 40, 0.14, 0, 0, a, 0.35); }
  if (v >= 3) ring(fx, e.x, e.y, 14 + v * 4, tint, 0.18, 1.5);
  if (e.w === 'siege_cannon' || e.w === 'lance_battery' || e.w === 'forge_battery') shakeAt(fx, e.x, e.y, mine ? 6 : 3);
}

/** A shot strikes armour: a flash on the block, then a look per damage type in that type's colour. */
function armourHit(fx, e, ctx) {
  const dc = DAMAGE[e.type]?.color || e.color; const c = e.color || dc;
  const big = e.size === 'l', med = e.size === 'm'; const S = big ? 2.2 : med ? 1.5 : 1;
  const back = (e.a ?? 0) + Math.PI;   // debris and sparks spray back out of the hole, toward the shooter
  const bvx = e.bvx || 0, bvy = e.bvy || 0;
  blockFlash(fx, e, e.type === 'kinetic' ? '#fff4d8' : c, 0.1 + S * 0.03, 0.38 + S * 0.12);
  switch (e.type) {
    case 'kinetic': {
      const slug = e.kind === 'slug' || e.kind === 'shell';
      sparks(fx, e.x, e.y, '#ffe2a0', big ? 12 : med ? 7 : 3, 300, 0.32, bvx, bvy, back, 0.9);
      chips(fx, e.x, e.y, '#8a8c92', big ? 4 : med ? 2 : (Math.random() < 0.35 ? 1 : 0), 120, bvx, bvy, 2 + S * 0.5, back, 0.8, 0.6);
      if (slug) { add(fx, { k: 'glow', x: e.x, y: e.y, vx: bvx, vy: bvy, life: 0.1, color: '#ffffff', size: 8 * S, drag: 1, grow: 0.3 }); if (big) ring(fx, e.x, e.y, 16 * S, '#ffe0b0', 0.2, 2); }
      break;
    }
    case 'laser':
      // a bright burn on the plate that cools from white to the beam colour, and thin molten sparks
      blockFlash(fx, e, c, 0.35, 0.3);
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: bvx, vy: bvy, life: 0.18, color: c, size: 6 * S, drag: 1, grow: 0.2 });
      sparks(fx, e.x, e.y, c, med || big ? 5 : 3, 200, 0.25, bvx, bvy, back, 1.1);
      break;
    case 'plasma':
      // a splash of plasma that clings and burns: a scorch on the block, a bloom, molten droplets
      blockFlash(fx, e, c, 0.8, 0.45);
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: bvx, vy: bvy, life: 0.55, color: c, size: 12 * S, drag: 1, grow: 0.5 });
      glows(fx, e.x, e.y, c, 3 + S, 3 + S, 140, 0.45, bvx, bvy);
      glows(fx, e.x, e.y, '#ffffff', 1, 4 * S, 40, 0.2, bvx, bvy);
      break;
    case 'lightning':
      bolt(fx, [[e.x, e.y], [e.x + rand(-22, 22) * S, e.y + rand(-22, 22) * S]], c, 0.12, 1.4, false, true);
      sparks(fx, e.x, e.y, '#e8e0ff', 3, 180, 0.2, bvx, bvy);
      break;
    default: sparks(fx, e.x, e.y, dc, 5, 220, 0.3, bvx, bvy, back, 1.2); glows(fx, e.x, e.y, dc, 1, 6 * S, 40, 0.25, bvx, bvy);
  }
  light(fx, e.x, e.y, (big ? 130 : med ? 90 : 60) * (e.type === 'plasma' ? 1.3 : 1), c, e.type === 'plasma' ? 0.3 : 0.12);
  // your hull took a real blow: the screen kicks with the push, and the edges pulse red for a big one
  if (ctx.isPlayer(e.tgt)) {
    fx.shake = Math.max(fx.shake, Math.min(7, 1 + (e.kb || 0) * 0.08 + (big ? 2 : 0)) * (fx.shakeMul ?? 1));
    if (big || (e.kb || 0) > 25) fx.hurt = Math.min(1, fx.hurt + 0.35);
  } else if (big) shakeAt(fx, e.x, e.y, 1.5);
}

/** Turn a sim event into visuals. `snd` is the sound player (may be null). */
export function handleEvent(fx, e, ctx) {
  switch (e.t) {
    case 'fire': muzzle(fx, e, ctx); break;
    case 'hit': armourHit(fx, e, ctx); break;
    case 'spark': sparks(fx, e.x, e.y, DAMAGE[e.type]?.color || '#ffd27a', 2, 160, 0.25, e.vx || 0, e.vy || 0); if (ctx.isPlayer(e.tgt) && e.amt > 20) fx.hurt = Math.min(1, fx.hurt + 0.15); break;
    case 'shieldhit': {
      // shields look nothing like armour: no debris, a ripple that runs round the bubble both ways, and sparks that
      // skate off along the surface instead of digging in
      fx.shieldFlash.set(e.id, { t: 0.5, x: e.x, y: e.y, color: e.color, r: e.r, sx: e.sx, sy: e.sy });
      add(fx, { k: 'shard', x: e.x, y: e.y, vx: 0, vy: 0, cx: e.sx, cy: e.sy, R: e.r, life: 0.35, color: e.color, prio: 1, w: Math.min(26, 6 + e.amt) });
      const an = Math.atan2(e.y - e.sy, e.x - e.sx); const hard = Math.min(1, e.amt / 40);
      ripple(fx, e.sx, e.sy, e.r, an, e.color, 0.35 + hard * 0.25, 1.5 + hard * 2.5);
      if (hard > 0.4) ripple(fx, e.sx, e.sy, e.r * 0.94, an, '#ffffff', 0.25, 1.2);
      sparks(fx, e.x, e.y, e.color, 1 + Math.round(hard * 3), 220, 0.22, 0, 0, an + Math.PI / 2, 0.25);
      sparks(fx, e.x, e.y, e.color, 1 + Math.round(hard * 3), 220, 0.22, 0, 0, an - Math.PI / 2, 0.25);
      light(fx, e.x, e.y, 90 + hard * 60, e.color, 0.12);
      if (e.missile) { ring(fx, e.x, e.y, 24, e.color, 0.3, 2.5); sparks(fx, e.x, e.y, e.color, 6, 200, 0.3); }   // #66: a shield visibly swats a missile
      break;
    }
    // #66: an enemy launcher locking on — a red pulse on the launcher; on you, a red ring round your ship too
    case 'lockwarn': ring(fx, e.x, e.y, 26, '#ff4040', 0.5, 2.5); light(fx, e.x, e.y, 80, '#ff3030', 0.3); if (e.onPlayer) ring(fx, e.tx, e.ty, 70, '#ff5050', 0.45, 2); break;
    case 'decoy': sparks(fx, e.x, e.y, '#fff0b0', 10 + e.n * 3, 260, 0.5); light(fx, e.x, e.y, 160, '#ffe080', 0.25); break;
    case 'shielddown': ring(fx, e.x, e.y, e.r * 1.2, '#9fd8ff', 0.5, 5); sparks(fx, e.x, e.y, '#9fd8ff', 30, e.r * 2, 0.6); wave(fx, e.x, e.y, e.r * 1.6, 0.02, 0.5); break;
    case 'blockdie': {
      const sz = 10 * e.size;
      // debris flies out away from the ship's middle, tumbling; ships' chips start red-hot
      const out = e.sx != null ? Math.atan2(e.y - e.sy, e.x - e.sx) : null;
      if (e.kind === 'rock') { chips(fx, e.x, e.y, e.ore ? MATERIALS[e.ore]?.color || e.color : e.color, 4 + e.size * 3, 120, e.vx, e.vy, 2.5 * Math.sqrt(e.size)); smoke(fx, e.x, e.y, 2, sz * 1.3, 1.0, e.vx, e.vy, '#5a5048', 0.28); if (e.ore) glows(fx, e.x, e.y, MATERIALS[e.ore]?.color || '#fff', 3, 8, 60, 0.6); }
      else {
        chips(fx, e.x, e.y, e.color, 5 + e.size * 3, 170, e.vx, e.vy, 2.6 * Math.sqrt(e.size), out, 1.3, 0.7);
        fireball(fx, e.x, e.y, sz * 1.4, e.vx, e.vy);
        add(fx, { k: 'glow', x: e.x, y: e.y, vx: e.vx, vy: e.vy, life: 0.12, color: '#fff2d0', size: sz * 1.6, drag: 1, grow: 0.2 });
        smoke(fx, e.x, e.y, 1, sz * 1.1, 0.8, e.vx, e.vy, '#2a2622', 0.16);
        sparks(fx, e.x, e.y, '#ffb050', 8, 260, 0.5, e.vx, e.vy, out, 1.6);
        light(fx, e.x, e.y, 70 + sz * 3, '#ff8a3a', 0.35);
        if (ctx.isPlayer(e.tgt)) { fx.hurt = Math.min(1, fx.hurt + 0.25); fx.shake = Math.max(fx.shake, 3 * (fx.shakeMul ?? 1)); }
      }
      break;
    }
    case 'boom': {
      const r = e.r; const W = ALL_WEAPONS[e.wid];
      // flak: a sharp, star-shaped air burst — a white pop, an even shell of sparks, almost no smoke
      if (W?.proj === 'flak') {
        add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.1, color: '#fff6dc', size: r * 0.7, drag: 1, grow: 0.2 });
        const n = count(fx, 12); for (let i = 0; i < n; i++) { const an = i / n * Math.PI * 2 + rand(-0.15, 0.15), sp = r * rand(5, 7); add(fx, { k: 'spark', x: e.x, y: e.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, life: rand(0.18, 0.3), color: i % 3 ? '#ffd08a' : '#ffffff', w: 1.6, drag: 0.88 }); }
        ring(fx, e.x, e.y, r * 0.9, '#ffd08a', 0.18, 1.5);
        smoke(fx, e.x, e.y, 1, r * 0.35, 0.5, 0, 0, '#3a3430', 0.14);
        light(fx, e.x, e.y, r * 3, '#ffc36b', 0.12);
        break;
      }
      // missile warheads (#57) burst in their own way
      if (e.wh === 'ram') { add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.12, color: '#ffffff', size: 26, drag: 1, grow: 0 }); sparks(fx, e.x, e.y, '#cfe8ff', 14, 420, 0.35); chips(fx, e.x, e.y, '#9aa4ae', 5, 160); ring(fx, e.x, e.y, 30, '#cfe8ff', 0.2, 2); light(fx, e.x, e.y, 110, '#cfe8ff', 0.12); shakeAt(fx, e.x, e.y, 2.5); break; }
      if (e.wh === 'emp') { ring(fx, e.x, e.y, r * 1.5, '#8fb4ff', 0.45, 3); ring(fx, e.x, e.y, r * 0.9, '#e0e8ff', 0.3, 2); for (let i = 0; i < 4; i++) { const an = Math.random() * 6.3, ln = r * (0.7 + Math.random() * 0.7); bolt(fx, [[e.x, e.y], [e.x + Math.cos(an) * ln, e.y + Math.sin(an) * ln]], '#9fc0ff', 0.2, 1.6, true, i < 2); } light(fx, e.x, e.y, r * 4, '#8fb4ff', 0.3, 1.3); if (r > 30) wave(fx, e.x, e.y, r * 2.4, 0.012, 0.4); shakeAt(fx, e.x, e.y, 2); break; }
      if (e.wh === 'fire') { fireball(fx, e.x, e.y, r * 0.8, 0, 0, '#ff6a1a'); glows(fx, e.x, e.y, '#ff7a2a', 6 + r / 8, 10, r * 1.2, 1.4); glows(fx, e.x, e.y, '#ffc040', 3, 8, r * 0.8, 1.0); smoke(fx, e.x, e.y, 1 + r / 40, r * 0.8, 1.1, 0, 0, '#3a2a22', 0.18); light(fx, e.x, e.y, r * 4, '#ff7a2a', 0.6, 1.2); shakeAt(fx, e.x, e.y, 2.5); break; }
      if (e.wh === 'he' && !e.shield) { shakeAt(fx, e.x, e.y, 6); fireball(fx, e.x, e.y, r * 0.7, 0, 0, '#ffd060'); wave(fx, e.x, e.y, r * 3.6, 0.03, 0.6); ring(fx, e.x, e.y, r * 2.2, '#fff0c0', 0.35, 3); }
      const col = e.type === 'plasma' ? (W?.color || '#40e8ff') : e.type === 'lightning' ? '#b48cff' : '#ff8a2a';
      // a bright flash, a fireball, hot embers and a ring; smoke is now a thin, quick wisp (was 2 + r/15 thick puffs
      // living 1.8 s — owner 2026-11-13: "use less smoke for explosions")
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.16, color: '#fff2c0', size: r * 1.6, drag: 1, grow: 0, prio: 1 });
      fireball(fx, e.x, e.y, r, 0, 0, col);
      sparks(fx, e.x, e.y, '#ffd080', 6 + r / 6, r * 5, 0.5);
      glows(fx, e.x, e.y, col === '#ff8a2a' ? '#ffb050' : col, 2 + r / 25, 2.5, r * 4, 0.6);   // embers that fly out and fade
      if (!e.shield) smoke(fx, e.x, e.y, 1 + Math.floor(r / 40), r * 0.7, 0.9, 0, 0, '#2a2622', 0.18);
      light(fx, e.x, e.y, r * 4, col, 0.35, 1.4);
      if (r > 22) ring(fx, e.x, e.y, r * 1.4, '#ffc890', 0.28, r > 60 ? 3 : 2);
      if (r > 30) wave(fx, e.x, e.y, r * 3, 0.015 + Math.min(0.03, r / 3000), 0.5);
      shakeAt(fx, e.x, e.y, e.big ? 6 : Math.min(4, r / 20));
      break;
    }
    case 'death': {
      const r = e.r; const s = Math.min(1, r / 120);
      // flash, fire, a ring, a ripple through space, debris, then delayed secondary blasts
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3, color: '#ffffff', size: r * 3.5, drag: 1, grow: 0.3, prio: 1 });
      fireball(fx, e.x, e.y, r * 1.2, e.vx, e.vy);
      fireball(fx, e.x, e.y, r * 0.8, e.vx, e.vy, e.color);
      sparks(fx, e.x, e.y, '#ffe0a0', 30 + r / 2, 300 + r * 4, 1.0, e.vx, e.vy);
      sparks(fx, e.x, e.y, e.color, 20, 200 + r * 3, 0.8, e.vx, e.vy);
      chips(fx, e.x, e.y, '#7a7a80', 12 + r / 6, 160 + r, e.vx, e.vy, 3);
      chips(fx, e.x, e.y, e.color, 6 + r / 10, 220 + r * 1.5, e.vx, e.vy, 4, null, Math.PI, 0.7);   // hull plates in the ship's colours
      smoke(fx, e.x, e.y, 2 + Math.floor(r / 40), r * 0.8, 1.4, e.vx, e.vy, '#2a2622', 0.18);   // was 8 + r/10 puffs, r x 1.2, 3 s, 0.35 alpha
      ring(fx, e.x, e.y, r * 4, '#ffd8a0', 0.6, 4); ring(fx, e.x, e.y, r * 2.5, e.color, 0.45, 3);
      wave(fx, e.x, e.y, r * 6 + 200, 0.035 + s * 0.03, 0.9);
      light(fx, e.x, e.y, r * 8 + 200, '#ffb060', 0.9, 2);
      if (e.player) fx.shake = Math.max(fx.shake, (8 + s * 14) * (fx.shakeMul ?? 1)); else shakeAt(fx, e.x, e.y, 6 + s * 18);
      fx.flash = Math.max(fx.flash, 0.08 + s * 0.25);
      for (let i = 0; i < 2 + Math.floor(s * 6); i++) fx.deathFlash.push({ at: rand(0.1, 0.9 + s), x: e.x + rand(-r, r), y: e.y + rand(-r, r), r: r * rand(0.3, 0.7), vx: e.vx, vy: e.vy });
      break;
    }
    case 'arc': {
      // a forked bolt with a lingering afterglow, and a crackle of sparks where it lands on each target
      bolt(fx, e.pts, e.color, e.big ? 0.25 : 0.16, e.big ? 3.5 : 2, true, true);
      for (let i = 0; i < e.pts.length; i++) { const [x, y] = e.pts[i]; light(fx, x, y, e.big ? 160 : 90, e.color, 0.15); if (i > 0) { sparks(fx, x, y, i % 2 ? '#ffffff' : e.color, e.big ? 4 : 2, 200, 0.2); add(fx, { k: 'glow', x, y, vx: 0, vy: 0, life: 0.2, color: e.color, size: e.big ? 16 : 10, drag: 1, grow: 0.3 }); } }
      break;
    }
    case 'rail': {
      add(fx, { k: 'line', x: e.x, y: e.y, x2: e.x2, y2: e.y2, vx: 0, vy: 0, life: e.big ? 0.6 : 0.35, color: e.color, w: e.big ? 14 : 5, prio: 1 });
      const L = Math.hypot(e.x2 - e.x, e.y2 - e.y); const n = Math.min(30, L / 30);
      const ang = Math.atan2(e.y2 - e.y, e.x2 - e.x);
      // a thin ion trail left hanging in space (lighter than before: 1 puff in 4 points, half as opaque)
      for (let i = 0; i < n; i++) { const t = Math.random(); const x = e.x + (e.x2 - e.x) * t, y = e.y + (e.y2 - e.y) * t; if (Math.random() < 0.25) smoke(fx, x, y, 1, 5, 0.7, 0, 0, '#3a4048', 0.2); light(fx, x, y, 60, e.color, 0.2); }
      add(fx, { k: 'line', x: e.x, y: e.y, x2: e.x2, y2: e.y2, vx: 0, vy: 0, life: (e.big ? 0.6 : 0.35) * 2.5, color: e.color, w: (e.big ? 14 : 5) * 2.4, soft: true });   // afterglow
      ring(fx, e.x, e.y, e.big ? 60 : 30, e.color, 0.3, 2.5);   // shock ring at the muzzle
      // every body it tore through: a white flash on the block, a ring, sparks out the far side and torn plating
      for (const h of e.hits || []) {
        blockFlash(fx, h, '#ffffff', 0.16, 0.95);
        ring(fx, h.x, h.y, 22 + h.n * 6, e.color, 0.25, 2);
        sparks(fx, h.x, h.y, '#ffffff', 6 + h.n * 2, 420, 0.35, h.bvx || 0, h.bvy || 0, ang, 0.5);
        chips(fx, h.x, h.y, '#9aa0a8', 2 + h.n, 200, h.bvx || 0, h.bvy || 0, 2.5, ang, 0.6, 0.8);
        light(fx, h.x, h.y, 140, e.color, 0.2);
        if (ctx.isPlayer(e.owner)) fx.shake = Math.max(fx.shake, 2.5 * (fx.shakeMul ?? 1));
      }
      glows(fx, e.x2, e.y2, e.color, 4, 14, 100, 0.4); sparks(fx, e.x2, e.y2, '#ffffff', 10, 400, 0.4);
      if (e.big) { wave(fx, e.x2, e.y2, 220, 0.03, 0.6); shakeAt(fx, e.x2, e.y2, 10); }
      break;
    }
    case 'pop': glows(fx, e.x, e.y, e.color || '#fff', 2, 8, 60, 0.2); light(fx, e.x, e.y, 40, e.color || '#fff', 0.08); break;
    case 'zap': add(fx, { k: 'line', x: e.x, y: e.y, x2: e.x2, y2: e.y2, vx: 0, vy: 0, life: 0.08, color: e.color, w: 1.5 }); break;
    case 'drop': {
      // common/uncommon/rare stay modest so the big ones stand out (owner: "I want to be more impressed by rare loot")
      const R = RARITY_BY_ID[e.rarity]; if (!R || R.index < 1) break;
      const i = R.index;
      ring(fx, e.x, e.y, 24 + i * 14, R.color, 0.5, 2 + (i >= 3 ? 2 : 0));
      glows(fx, e.x, e.y, R.color, 2 + i * 2, 8, 90, 0.7);
      if (i >= 3) {
        // epic and up: a white flash, a tall pillar of light shooting up, a double shockwave ripple and a spray of sparks
        const k = i - 2;   // 1 epic, 2 legendary, 3 relic
        add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.3 + k * 0.08, color: '#ffffff', size: 28 + k * 16, drag: 1, grow: 0.5, prio: 1 });
        add(fx, { k: 'pillar', x: e.x, y: e.y, vx: 0, vy: 0, life: 1.4 + k * 0.4, color: R.color, h: 420 + k * 260, w: 10 + k * 6, prio: 1 });
        ring(fx, e.x, e.y, 120 + k * 70, R.color, 0.7, 4); ring(fx, e.x, e.y, 70 + k * 40, '#ffffff', 0.4, 2);
        wave(fx, e.x, e.y, 220 + k * 120, 0.025 + k * 0.01, 0.7); if (k >= 2) wave(fx, e.x, e.y, 120 + k * 60, 0.02, 0.5);
        sparks(fx, e.x, e.y, R.color, 14 + k * 10, 320 + k * 80, 0.9);
        sparks(fx, e.x, e.y, '#ffffff', 6 + k * 4, 260, 0.6);
        light(fx, e.x, e.y, 220 + k * 90, R.color, 1.0, 1.1);
        fx.flash = Math.max(fx.flash, 0.03 + k * 0.03); fx.flashColor = hexRgb(R.color);
      }
      break;
    }
    case 'collect': {
      const col = e.kind === 'item' ? RARITY_BY_ID[e.rarity]?.color : e.kind === 'mat' ? MATERIALS[e.mat]?.color : e.kind === 'cr' ? '#ffd84a' : '#ffffff';
      ring(fx, e.x, e.y, 26, col || '#fff', 0.3, 2);
      const label = e.kind === 'cr' ? `+${e.n} cr` : e.kind === 'mat' ? `+${e.n} ${MATERIALS[e.mat]?.name || e.mat}` : e.kind === 'pod' ? crewText(e.n) : e.kind === 'specimen' ? 'Specimen recovered' : e.item?.name || 'Item';
      text(fx, e.x, e.y - 12, label, col || '#fff', e.kind === 'item' ? 15 : 12);
      break;
    }
    case 'scanpulse': add(fx, { k: 'scan', x: e.x, y: e.y, vx: 0, vy: 0, life: 1.1, r: e.r || 1500, a0: Math.random() * 6, prio: 1 }); light(fx, e.x, e.y, 160, '#7af7ff', 0.3); break;
    case 'launch': ring(fx, e.x, e.y, 20, e.color, 0.3, 2); break;
    case 'hook': sparks(fx, e.x, e.y, '#ffffff', 10, 220, 0.3); ring(fx, e.x, e.y, 24, '#d0d8e0', 0.25, 2); shakeAt(fx, e.x, e.y, 3); break;
    case 'snap': sparks(fx, e.x, e.y, '#d0d8e0', 14, 260, 0.4); break;
    case 'unhook': break;
    case 'clang': sparks(fx, e.x, e.y, '#ffe0a0', Math.min(30, e.v / 8), e.v * 1.5, 0.5); shakeAt(fx, e.x, e.y, Math.min(12, e.v / 30)); light(fx, e.x, e.y, 80, '#ffd080', 0.15); break;
    case 'dust': smoke(fx, e.x, e.y, 4, e.r * 0.8, 1.6, 0, 0, '#5a5048', 0.28); break;
    case 'fizzle': smoke(fx, e.x, e.y, 2, e.r * 0.5, 1.0, 0, 0, '#2a2622', 0.2); break;
    case 'scorch': if (Math.random() < 0.3) { sparks(fx, e.x, e.y, '#ffb060', 2, 160, 0.3); smoke(fx, e.x, e.y, 1, 10, 1, 0, 0, '#3a3530', 0.25); } fx.scorches.push(e); break;
    case 'rebuilt': glows(fx, e.x, e.y, '#6fff8a', 3, 8, 40, 0.5); ring(fx, e.x, e.y, 14, '#6fff8a', 0.3, 1.5); break;
    case 'burn': add(fx, { k: 'fire', x: e.x, y: e.y, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.5, size: 8, drag: 0.95, grow: 1.2, color: '#ff7a2a' }); light(fx, e.x, e.y, 50, '#ff6a2a', 0.2); break;
    case 'break': shakeAt(fx, e.x, e.y, 2); break;
  }
}

/** Advance particles and timers. */
export function stepFx(fx, dt, onSecondary) {
  for (const p of fx.parts) {
    p.age += dt;
    if (p.drag != null && p.drag < 1) { const k = Math.pow(p.drag, dt * 60); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.vr) p.rot += p.vr * dt;
  }
  fx.parts = fx.parts.filter(p => p.age < p.life);
  for (const l of fx.lights) l.life -= dt;
  fx.lights = fx.lights.filter(l => l.life > 0);
  for (const w of fx.waves) w.age += dt;
  fx.waves = fx.waves.filter(w => w.age < w.life);
  for (const t of fx.texts) { t.age += dt; t.y += t.vy * dt; t.vy *= 0.97; }
  fx.texts = fx.texts.filter(t => t.age < t.life);
  fx.shake = Math.max(0, fx.shake - dt * 30); fx.flash = Math.max(0, fx.flash - dt * 1.5); fx.hurt = Math.max(0, fx.hurt - dt * 2.2);
  for (const [k, v] of fx.shieldFlash) { v.t -= dt; if (v.t <= 0) fx.shieldFlash.delete(k); }
  for (const d of fx.deathFlash) { d.at -= dt; if (d.at <= 0) { d.done = true; onSecondary?.(d); handleEvent(fx, { t: 'boom', x: d.x, y: d.y, r: d.r, type: 'explosive' }, { isPlayer: () => false }); } }
  fx.deathFlash = fx.deathFlash.filter(d => !d.done);
}
