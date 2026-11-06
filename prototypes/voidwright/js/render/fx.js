// Particles, lights, shockwaves and screen shake. The sim's events become visuals here.

import { RARITY_BY_ID, MATERIALS, DAMAGE } from '../data/types.js';

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
export function hexA(hex, a) {
  if (hex.startsWith('rgb')) return hex.replace('rgb(', 'rgba(').replace(')', `,${a})`);
  const n = parseInt(hex.slice(1, 7), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

export function createFx(quality = 1) {
  const fx = {
    parts: [], lights: [], waves: [], texts: [], shake: 0, flash: 0, flashColor: [1, 0.85, 0.6], quality, max: 2600, shieldFlash: new Map(),
    scorches: [], deathFlash: [],
  };
  return fx;
}

const rand = (a, b) => a + Math.random() * (b - a);

function add(fx, p) {
  if (fx.parts.length >= fx.max * fx.quality) { if (p.prio !== 1) return; fx.parts.shift(); }
  p.age = 0; fx.parts.push(p);
}
export function light(fx, x, y, r, color, life = 0.1, k = 1) { fx.lights.push({ x, y, r, color, life, max: life, k }); }
export function wave(fx, x, y, maxR, strength = 0.03, life = 0.7) { if (fx.waves.length < 16) fx.waves.push({ x, y, maxR, strength, life, age: 0 }); }

export function sparks(fx, x, y, color, n, speed = 300, life = 0.4, vx = 0, vy = 0, dir = null, spread = Math.PI) {
  n = Math.ceil(n * fx.quality);
  for (let i = 0; i < n; i++) {
    const a = dir == null ? Math.random() * Math.PI * 2 : dir + (Math.random() - 0.5) * spread * 2;
    const s = speed * (0.3 + Math.random() * 0.9);
    add(fx, { k: 'spark', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: life * rand(0.5, 1.2), color, w: rand(1, 2.2), drag: 0.9 });
  }
}
export function glows(fx, x, y, color, n, size, speed, life, vx = 0, vy = 0) {
  n = Math.ceil(n * fx.quality);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * Math.random(); add(fx, { k: 'glow', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: life * rand(0.6, 1.2), color, size: size * rand(0.6, 1.3), drag: 0.92, grow: 0.6 }); }
}
export function smoke(fx, x, y, n, size, life, vx = 0, vy = 0, color = '#2a2622') {
  n = Math.ceil(n * fx.quality);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 30 * Math.random(); add(fx, { k: 'smoke', x: x + rand(-size, size) * 0.3, y: y + rand(-size, size) * 0.3, vx: vx * 0.5 + Math.cos(a) * s, vy: vy * 0.5 + Math.sin(a) * s, life: life * rand(0.7, 1.3), color, size: size * rand(0.6, 1.2), drag: 0.96, grow: 1.4, rot: Math.random() * 6 }); }
}
export function chips(fx, x, y, color, n, speed, vx = 0, vy = 0, size = 3) {
  n = Math.ceil(n * fx.quality);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = speed * rand(0.3, 1); add(fx, { k: 'chip', x, y, vx: vx + Math.cos(a) * s, vy: vy + Math.sin(a) * s, life: rand(0.8, 2.2), color, size: size * rand(0.5, 1.3), drag: 0.985, rot: Math.random() * 6, vr: rand(-12, 12), hot: Math.random() < 0.5 }); }
}
export function fireball(fx, x, y, r, vx = 0, vy = 0, color = '#ff8a2a') {
  const n = Math.ceil((4 + r / 8) * fx.quality);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * r * 0.5, s = r * rand(0.6, 2.2);
    add(fx, { k: 'fire', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: vx * 0.6 + Math.cos(a) * s, vy: vy * 0.6 + Math.sin(a) * s, life: rand(0.35, 0.9) * (0.7 + r / 120), size: r * rand(0.35, 0.8), drag: 0.9, grow: 1.1, color, prio: 1 });
  }
}
export function ring(fx, x, y, r, color, life = 0.4, w = 3) { add(fx, { k: 'ring', x, y, vx: 0, vy: 0, r0: r * 0.1, r1: r, life, color, w, prio: 1 }); }
export function text(fx, x, y, str, color, size = 13, life = 1.4) { fx.texts.push({ x, y, str, color, size, life, age: 0, vy: -30 }); if (fx.texts.length > 40) fx.texts.shift(); }

/** Jagged lightning path between points, with forks. */
export function bolt(fx, pts, color, life = 0.18, width = 2, branch = true) {
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; const L = Math.hypot(x1 - x0, y1 - y0); const segs = Math.max(3, Math.round(L / 18));
    const nx = -(y1 - y0) / (L || 1), ny = (x1 - x0) / (L || 1);
    for (let k = 0; k <= segs; k++) { const t = k / segs; const j = (k === 0 || k === segs) ? 0 : (Math.random() - 0.5) * Math.min(28, L * 0.12); path.push([x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j]); }
    if (branch && Math.random() < 0.7) {
      const bi = Math.floor(path.length * 0.6); const [bx, by] = path[bi] || [x0, y0]; const ba = Math.atan2(y1 - y0, x1 - x0) + rand(-1, 1);
      const bp = [[bx, by]]; let cx = bx, cy = by; for (let k = 0; k < 4; k++) { cx += Math.cos(ba) * 14 + rand(-8, 8); cy += Math.sin(ba) * 14 + rand(-8, 8); bp.push([cx, cy]); }
      add(fx, { k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, pts: bp, color, life: life * 0.8, w: width * 0.6, prio: 1 });
    }
  }
  add(fx, { k: 'bolt', x: 0, y: 0, vx: 0, vy: 0, pts: path, color, life, w: width, prio: 1 });
}

/** Turn a sim event into visuals. `snd` is the sound player (may be null). */
export function handleEvent(fx, e, ctx) {
  const q = fx.quality;
  switch (e.t) {
    case 'fire': {
      const c = e.color; const big = (e.n || 1) >= 2;
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.08, color: c, size: big ? 26 : 12, drag: 1, grow: 0 });
      light(fx, e.x, e.y, big ? 140 : 70, c, 0.08);
      if (e.w === 'gatling' || e.w === 'autocannon' || e.w === 'howitzer' || e.w === 'siege_cannon') {
        // spent casings fly out the side
        if (Math.random() < 0.5 * q) add(fx, { k: 'chip', x: e.x, y: e.y, vx: Math.cos(e.a + 1.6) * 80, vy: Math.sin(e.a + 1.6) * 80, life: 0.6, color: '#d8b060', size: 1.6, drag: 0.97, rot: 0, vr: 20 });
        sparks(fx, e.x, e.y, c, 2, 260, 0.12, 0, 0, e.a, 0.3);
        if (e.w !== 'gatling') smoke(fx, e.x + Math.cos(e.a) * 6, e.y + Math.sin(e.a) * 6, 2, 8, 0.6, Math.cos(e.a) * 40, Math.sin(e.a) * 40, '#4a4440');
      }
      if (e.w === 'mass_driver' || e.w === 'railgun' || e.w === 'forge_hammer' || e.w === 'siege_cannon' || e.w === 'lance_battery') { wave(fx, e.x, e.y, big ? 160 : 90, 0.012, 0.35); fx.shake = Math.max(fx.shake, ctx.isPlayer(e.owner) ? 4 : 1); ring(fx, e.x, e.y, 30, c, 0.25, 2); }
      if (e.w === 'missile_rack' || e.w === 'rocket_pod' || e.w === 'swarm_pod' || e.w === 'torpedo_tube' || e.w === 'spore_launcher') smoke(fx, e.x, e.y, 3, 10, 0.8, 0, 0, '#5a5550');
      break;
    }
    case 'hit': {
      const c = e.color; const big = e.size === 'l';
      switch (e.type) {
        case 'kinetic': sparks(fx, e.x, e.y, '#ffd27a', big ? 10 : 4, 260, 0.35); chips(fx, e.x, e.y, '#888', big ? 4 : 1, 90); break;
        case 'laser': glows(fx, e.x, e.y, c, 2, 10, 40, 0.25); sparks(fx, e.x, e.y, c, 3, 180, 0.25); break;
        case 'plasma': glows(fx, e.x, e.y, c, 5, 12, 80, 0.5); add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.6, color: c, size: 22, drag: 1, grow: 0.5 }); break;
        case 'lightning': bolt(fx, [[e.x, e.y], [e.x + rand(-20, 20), e.y + rand(-20, 20)]], c, 0.12, 1.4, false); break;
        default: sparks(fx, e.x, e.y, c, 4, 200, 0.3);
      }
      light(fx, e.x, e.y, big ? 120 : 60, c, 0.12);
      break;
    }
    case 'spark': sparks(fx, e.x, e.y, DAMAGE[e.type]?.color || '#ffd27a', 2, 160, 0.25); break;
    case 'shieldhit': {
      fx.shieldFlash.set(e.id, { t: 0.5, x: e.x, y: e.y, color: e.color, r: e.r, sx: e.sx, sy: e.sy });
      add(fx, { k: 'shard', x: e.x, y: e.y, vx: 0, vy: 0, cx: e.sx, cy: e.sy, R: e.r, life: 0.35, color: e.color, prio: 1, w: Math.min(26, 6 + e.amt) });
      light(fx, e.x, e.y, 90, e.color, 0.12);
      break;
    }
    case 'shielddown': ring(fx, e.x, e.y, e.r * 1.2, '#9fd8ff', 0.5, 5); sparks(fx, e.x, e.y, '#9fd8ff', 30, e.r * 2, 0.6); wave(fx, e.x, e.y, e.r * 1.6, 0.02, 0.5); break;
    case 'blockdie': {
      const sz = 10 * e.size;
      chips(fx, e.x, e.y, e.ore ? MATERIALS[e.ore]?.color || e.color : e.color, 4 + e.size * 3, 120, e.vx, e.vy, 2.5 * Math.sqrt(e.size));
      if (e.kind === 'rock') { smoke(fx, e.x, e.y, 3, sz * 1.5, 1.2, e.vx, e.vy, '#5a5048'); if (e.ore) glows(fx, e.x, e.y, MATERIALS[e.ore]?.color || '#fff', 3, 8, 60, 0.6); }
      else { fireball(fx, e.x, e.y, sz * 1.4, e.vx, e.vy); smoke(fx, e.x, e.y, 3, sz * 1.6, 1.6, e.vx, e.vy); sparks(fx, e.x, e.y, '#ffb050', 6, 240, 0.5, e.vx, e.vy); light(fx, e.x, e.y, 70 + sz * 3, '#ff8a3a', 0.35); }
      break;
    }
    case 'boom': {
      const r = e.r; const col = e.type === 'plasma' ? '#40e8ff' : e.type === 'lightning' ? '#b48cff' : '#ff8a2a';
      fireball(fx, e.x, e.y, r, 0, 0, col);
      sparks(fx, e.x, e.y, '#ffd080', 6 + r / 6, r * 5, 0.5);
      smoke(fx, e.x, e.y, 2 + r / 15, r * 0.9, 1.8);
      add(fx, { k: 'glow', x: e.x, y: e.y, vx: 0, vy: 0, life: 0.18, color: '#fff2c0', size: r * 1.6, drag: 1, grow: 0 });
      light(fx, e.x, e.y, r * 4, col, 0.35, 1.4);
      if (r > 30) { wave(fx, e.x, e.y, r * 3, 0.015 + Math.min(0.03, r / 3000), 0.5); ring(fx, e.x, e.y, r * 1.4, '#ffc890', 0.3, 2); }
      if (e.big) fx.shake = Math.max(fx.shake, 6);
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
      smoke(fx, e.x, e.y, 8 + r / 10, r * 1.2, 3, e.vx, e.vy);
      ring(fx, e.x, e.y, r * 4, '#ffd8a0', 0.6, 4); ring(fx, e.x, e.y, r * 2.5, e.color, 0.45, 3);
      wave(fx, e.x, e.y, r * 6 + 200, 0.035 + s * 0.03, 0.9);
      light(fx, e.x, e.y, r * 8 + 200, '#ffb060', 0.9, 2);
      fx.shake = Math.max(fx.shake, 6 + s * 18);
      fx.flash = Math.max(fx.flash, 0.08 + s * 0.25);
      for (let i = 0; i < 2 + Math.floor(s * 6); i++) fx.deathFlash.push({ at: rand(0.1, 0.9 + s), x: e.x + rand(-r, r), y: e.y + rand(-r, r), r: r * rand(0.3, 0.7), vx: e.vx, vy: e.vy });
      break;
    }
    case 'arc': bolt(fx, e.pts, e.color, e.big ? 0.25 : 0.16, e.big ? 3.5 : 2); for (const [x, y] of e.pts) light(fx, x, y, e.big ? 160 : 90, e.color, 0.15); break;
    case 'rail': {
      add(fx, { k: 'line', x: e.x, y: e.y, x2: e.x2, y2: e.y2, vx: 0, vy: 0, life: e.big ? 0.6 : 0.35, color: e.color, w: e.big ? 14 : 5, prio: 1 });
      const L = Math.hypot(e.x2 - e.x, e.y2 - e.y); const n = Math.min(30, L / 30);
      for (let i = 0; i < n; i++) { const t = Math.random(); const x = e.x + (e.x2 - e.x) * t, y = e.y + (e.y2 - e.y) * t; if (Math.random() < 0.5) smoke(fx, x, y, 1, 6, 0.8, 0, 0, '#3a4048'); light(fx, x, y, 60, e.color, 0.2); }
      glows(fx, e.x2, e.y2, e.color, 4, 14, 100, 0.4); sparks(fx, e.x2, e.y2, '#ffffff', 10, 400, 0.4);
      if (e.big) { wave(fx, e.x2, e.y2, 220, 0.03, 0.6); fx.shake = Math.max(fx.shake, 10); }
      break;
    }
    case 'pop': glows(fx, e.x, e.y, e.color || '#fff', 2, 8, 60, 0.2); light(fx, e.x, e.y, 40, e.color || '#fff', 0.08); break;
    case 'zap': add(fx, { k: 'line', x: e.x, y: e.y, x2: e.x2, y2: e.y2, vx: 0, vy: 0, life: 0.08, color: e.color, w: 1.5 }); break;
    case 'drop': {
      const R = RARITY_BY_ID[e.rarity]; if (!R || R.index < 1) break;
      ring(fx, e.x, e.y, 30 + R.index * 18, R.color, 0.6, 3);
      glows(fx, e.x, e.y, R.color, 4 + R.index * 3, 10, 120, 0.8);
      if (R.index >= 3) { wave(fx, e.x, e.y, 140, 0.02, 0.6); light(fx, e.x, e.y, 260, R.color, 0.6); }
      break;
    }
    case 'collect': {
      const col = e.kind === 'item' ? RARITY_BY_ID[e.rarity]?.color : e.kind === 'mat' ? MATERIALS[e.mat]?.color : e.kind === 'cr' ? '#ffd84a' : '#ffffff';
      ring(fx, e.x, e.y, 26, col || '#fff', 0.3, 2);
      const label = e.kind === 'cr' ? `+${e.n} cr` : e.kind === 'mat' ? `+${e.n} ${MATERIALS[e.mat]?.name || e.mat}` : e.kind === 'pod' ? `+${e.n} crew rescued` : e.kind === 'specimen' ? 'Specimen recovered' : e.item?.name || 'Item';
      text(fx, e.x, e.y - 12, label, col || '#fff', e.kind === 'item' ? 15 : 12);
      break;
    }
    case 'launch': ring(fx, e.x, e.y, 20, e.color, 0.3, 2); break;
    case 'hook': sparks(fx, e.x, e.y, '#ffffff', 10, 220, 0.3); ring(fx, e.x, e.y, 24, '#d0d8e0', 0.25, 2); fx.shake = Math.max(fx.shake, 3); break;
    case 'snap': sparks(fx, e.x, e.y, '#d0d8e0', 14, 260, 0.4); break;
    case 'unhook': break;
    case 'clang': sparks(fx, e.x, e.y, '#ffe0a0', Math.min(30, e.v / 8), e.v * 1.5, 0.5); fx.shake = Math.max(fx.shake, Math.min(12, e.v / 30)); light(fx, e.x, e.y, 80, '#ffd080', 0.15); break;
    case 'dust': smoke(fx, e.x, e.y, 6, e.r * 0.8, 2, 0, 0, '#5a5048'); break;
    case 'fizzle': smoke(fx, e.x, e.y, 3, e.r * 0.5, 1.5); break;
    case 'scorch': if (Math.random() < 0.3) { sparks(fx, e.x, e.y, '#ffb060', 2, 160, 0.3); smoke(fx, e.x, e.y, 1, 10, 1, 0, 0, '#3a3530'); } fx.scorches.push(e); break;
    case 'rebuilt': glows(fx, e.x, e.y, '#6fff8a', 3, 8, 40, 0.5); ring(fx, e.x, e.y, 14, '#6fff8a', 0.3, 1.5); break;
    case 'burn': add(fx, { k: 'fire', x: e.x, y: e.y, vx: rand(-10, 10), vy: rand(-10, 10), life: 0.5, size: 8, drag: 0.95, grow: 1.2, color: '#ff7a2a' }); light(fx, e.x, e.y, 50, '#ff6a2a', 0.2); break;
    case 'break': fx.shake = Math.max(fx.shake, 2); break;
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
  fx.shake = Math.max(0, fx.shake - dt * 30); fx.flash = Math.max(0, fx.flash - dt * 1.5);
  for (const [k, v] of fx.shieldFlash) { v.t -= dt; if (v.t <= 0) fx.shieldFlash.delete(k); }
  for (const d of fx.deathFlash) { d.at -= dt; if (d.at <= 0) { d.done = true; onSecondary?.(d); handleEvent(fx, { t: 'boom', x: d.x, y: d.y, r: d.r, type: 'explosive' }, { isPlayer: () => false }); } }
  fx.deathFlash = fx.deathFlash.filter(d => !d.done);
}
