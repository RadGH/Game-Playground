// Turns game state into a render frame: sprites, lights, overlays (docs/06 §14, §16). Browser-side but
// DOM-free.
import { PK } from '../entities/particles.js';
import { drawBoss } from '../ai/bosses.js';
import { hexToRgb01 } from '../core/math.js';
import { collectLights } from '../world/lightgrid.js';
import { voidZoneVisuals } from '../rpg/voidzones.js';

const rgb = n => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

export function buildFrame(game, cam, atlas, alpha) {
  const sprites = [], overlays = [], additive = [], lights = [];
  const p = game.player, room = game.room;
  // world lights (the same list the CPU light grid uses), minus the lantern which is drawn below
  for (const l of collectLights(game)) if (!l.own) lights.push(l);
  // player
  if (p && !p.hidden) {
    const x = p.px + (p.x - p.px) * alpha, y = p.py + (p.y - p.py) * alpha;
    const r = atlas.rect('hero', p.anim, p.animT) || atlas.rect('hero', 'idle', 0);
    const an = atlas.meta.hero.anchor;
    const flame = game.flameColor || [1, 0.54, 0.16];
    if (r) {
      const flip = p.facing < 0;
      const sx = flip ? x - (r[2] - an[0]) : x - an[0];
      sprites.push({ x: sx, y: y - r[3], w: r[2], h: r[3], src: r, flip, emit: 0.18, tint: p.hurtT > 0 && (game.tick >> 2) & 1 ? [2, 0.6, 0.6, 1] : [1, 1, 1, 1] });
    }
    // the pole and lantern (drawn by code so its colour follows the selected flame)
    const lp = lanternPos(p, x, y);
    const poleCol = [0.42, 0.35, 0.27, 1];
    const hx = x + p.facing * 2, hy = y - 7;
    const steps = Math.ceil(Math.hypot(lp.x - hx, lp.y - hy));
    for (let s = 0; s <= steps; s++) sprites.push({ x: Math.round(hx + (lp.x - hx) * s / steps), y: Math.round(hy + (lp.y - hy) * s / steps), w: 1, h: 1, tint: poleCol });
    sprites.push({ x: Math.round(lp.x) - 1, y: Math.round(lp.y), w: 3, h: 1, tint: [0.12, 0.12, 0.15, 1] });
    sprites.push({ x: Math.round(lp.x) - 1, y: Math.round(lp.y) + 1, w: 3, h: 3, tint: [flame[0], flame[1], flame[2], 1], emit: 1.4 });
    sprites.push({ x: Math.round(lp.x), y: Math.round(lp.y) + 2, w: 1, h: 1, tint: [1, 1, 0.9, 1], emit: 2 });
    if (!p.lanternOut) lights.push({ x: lp.x, y: lp.y + 2, r: game.lanternRadius || 72, color: flame, i: p.hooded ? 0.35 : 1.1, shadow: true, flicker: 0.05 });
    game._lantern = lp;
  }
  // particles
  const P = game.particles;
  for (let i = 0; i < P.n; i++) {
    const k = P.kind[i], c = rgb(P.col[i]);
    if (k === PK.RAIN) overlays.push({ x: P.x[i], y: P.y[i] - 3, w: 1, h: 3, tint: [c[0], c[1], c[2], 0.5] });
    else if (k === PK.SPLASH || k === PK.DRIP) overlays.push({ x: P.x[i], y: P.y[i], w: 1, h: k === PK.DRIP ? 2 : 1, tint: [c[0], c[1], c[2], 0.8] });
    else if (k === PK.SPARK || k === PK.EMBER || k === PK.GLINT) additive.push({ x: P.x[i], y: P.y[i], w: 1, h: 1, tint: [c[0], c[1], c[2], Math.min(1, P.life[i] / P.max[i] * 2)], emit: 1 });
    else if (k === PK.MOTH) additive.push({ x: P.x[i], y: P.y[i], w: 2, h: 1, tint: [0.9, 0.9, 0.8, 0.8] });
    else sprites.push({ x: P.x[i], y: P.y[i], w: 1, h: 1, tint: [c[0], c[1], c[2], 1] });
  }
  spellVisuals(game, { sprites, additive, lights, overlays }, atlas);
  voidZoneVisuals(game, overlays, additive, lights);
  game.things?.draw({ sprites, additive, lights, overlays }, atlas);
  game.builder?.draw({ overlays });
  // falling fragments: one quad per cell, coloured from the material ramp
  if (game.fragments) { const R = game.data.mats.ramps; for (const f of game.fragments.list) for (let r = 0; r < f.h; r++) for (let c = 0; c < f.w; c++) { const k = r * f.w + c, m = f.mat[k]; if (!m) continue; const ramp = R[m], col = ramp[(f.shade[k] & 7) % ramp.length]; sprites.push({ x: f.x + c, y: f.fy + r, w: 1, h: 1, tint: [col[0] / 255, col[1] / 255, col[2] / 255, 1] }); } }
  // actors (enemies, npcs, dummies): sprite if the atlas has one, else a lit block
  drawBoss(game, { sprites, additive, lights, overlays }, alpha);
  for (const e of game.entities) {
    if (e.kind === 'boss') continue;
    const x = e.px + (e.x - e.px) * alpha, y = e.py + (e.y - e.py) * alpha;
    const spr = e.sprite && atlas.rect(e.sprite, e.anim || 'idle', e.animT || 0);
    const flash = e.hurtFlash > 0 ? [3, 3, 3, 1] : e.statuses?.frozen ? [0.7, 1.2, 1.5, 1] : [1, 1, 1, e.dead ? Math.max(0, 1 - e.deadT) : 1];
    if (spr) { const an = atlas.meta[e.sprite].anchor; const flip = e.facing > 0 === !!e.flipSprite; sprites.push({ x: flip ? x - (spr[2] - an[0]) : x - an[0], y: y - spr[3], w: spr[2], h: spr[3], src: spr, flip, tint: flash, emit: 0.1 }); }
    else sprites.push({ x: x - e.w / 2, y: y - e.h, w: e.w, h: e.h, tint: e.color ? [...e.color, flash[3]].map((v, i) => i < 3 ? v * flash[i] : v) : flash });
    if (e.eyes && !e.dead) { overlays.push({ x: x + (e.facing > 0 ? 1 : -2), y: y - e.h + (e.eyeY ?? 2), w: 1, h: 1, tint: [...e.eyes, 1], emit: 1 }); lights.push({ x, y: y - e.h + 2, r: 10, color: e.eyes, i: 0.4, shadow: false }); }
    if (e.statuses?.burn) lights.push({ x, y: y - e.h / 2, r: 18, color: [1, 0.5, 0.15], i: 0.8, shadow: false, flicker: 0.3 });
    if (e.telegraph && !e.dead) { // readable danger: the telegraph glows through any darkness (unlit overlay)
      const T = e.telegraph, c = T.color, k = Math.min(1, T.t), a = 0.4 + 0.6 * k;
      if (T.part === 'line' && T.aim) { const len = Math.hypot(T.aim.x - x, T.aim.y - (y - e.h / 2)); for (let s2 = 0; s2 < len; s2 += 2) additive.push({ x: x + (T.aim.x - x) * s2 / len, y: y - e.h / 2 + (T.aim.y - (y - e.h / 2)) * s2 / len, w: 1, h: 1, tint: [c[0], c[1], c[2], a * 0.8], emit: 1.5 }); }
      else { const ox = T.part === 'head' ? 0 : 0, oy = T.part === 'head' ? -e.h + 1 : T.part === 'body' ? -e.h / 2 : -e.h + 2; additive.push({ x: x - e.w / 2 - 1, y: y + oy - 1, w: e.w + 2, h: T.part === 'body' ? e.h / 2 : 3, tint: [c[0], c[1], c[2], a * 0.5], emit: 1.5 }); }
      lights.push({ x, y: y - e.h / 2, r: 16 + 12 * k, color: c, i: 0.9 * k, shadow: false });
    }
  }
  for (const s of game.extraSprites || []) sprites.push(s);
  for (const l of game.extraLights || []) lights.push(l);
  for (const o of game.extraOverlays || []) overlays.push(o);
  return { sprites, overlays, additive, lights };
}

export function lanternPos(p, x, y) {
  const bob = Math.sin((p.animT || 0) * (p.anim === 'run' ? 14 : p.anim === 'walk' ? 10 : 2)) * 0.8;
  if (p.anim === 'swim' || p.anim === 'swim_under') return { x: x + p.facing * 6, y: y - 10 };
  if (p.anim === 'climb' || p.anim === 'climb_idle') return { x: x + p.facing * 4, y: y - 16 };
  if (p.crouched) return { x: x + p.facing * 7, y: y - 7 };
  return { x: x + p.facing * 6, y: y - 17 + bob };
}

/** Spells, fields, flashes, chain arcs and actors -> sprites/overlays/lights (called by buildFrame). */
export function spellVisuals(game, out, atlas) {
  const { sprites, additive, lights, overlays } = out;
  const col = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  for (const I of game.spells) {
    const P = I.plan, c = col(P.color), L = P.light || { r: 24, i: 1 };
    const light = (x, y, r, i) => lights.push({ x, y, r, color: L.negative ? [0.4, 0.15, 0.6] : c, i: L.negative ? 0.35 : i, shadow: false, flicker: P.light?.flicker?.[0] || 0 });
    switch (I.shape) {
      case 'bolt': case 'lob': {
        const s = Math.max(2, Math.min(5, P.size + 1));
        additive.push({ x: I.x - s / 2, y: I.y - s / 2, w: s, h: s, tint: [c[0], c[1], c[2], 1], emit: 2 });
        additive.push({ x: I.x - 0.5, y: I.y - 0.5, w: 1, h: 1, tint: [1, 1, 1, 1], emit: 3 });
        for (let k = 1; k <= 4; k++) additive.push({ x: I.x - I.vx / 60 * k * 0.5 - 0.5, y: I.y - I.vy / 60 * k * 0.5 - 0.5, w: 1, h: 1, tint: [c[0], c[1], c[2], 0.6 - k * 0.12], emit: 1 });
        light(I.x, I.y, L.r, L.i); break;
      }
      case 'arc': {
        const r = P.size, half = (P.sweep || 150) / 2 * Math.PI / 180, fade = 1 - I.t / I.life;
        for (let k = 0; k <= 24; k++) { const a = I.ang - half + (2 * half) * k / 24; for (const rr of [r * 0.7, r * 0.85, r]) additive.push({ x: I.x + Math.cos(a) * rr, y: I.y + Math.sin(a) * rr, w: 1, h: 1, tint: [c[0], c[1], c[2], fade], emit: 1.5 }); }
        light(I.x + Math.cos(I.ang) * r * 0.6, I.y + Math.sin(I.ang) * r * 0.6, L.r, L.i * fade); break;
      }
      case 'ring': {
        const n = Math.max(16, Math.round(I.radius * 1.5));
        for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; for (const d of [0, -2]) additive.push({ x: I.x + Math.cos(a) * (I.radius + d), y: I.y + Math.sin(a) * (I.radius + d), w: 1, h: 1, tint: [c[0], c[1], c[2], d ? 0.5 : 1], emit: 1.5 }); }
        for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; light(I.x + Math.cos(a) * I.radius, I.y + Math.sin(a) * I.radius, 20, L.i * 0.5); } break;
      }
      case 'beam': {
        if (I.ex == null) break; const len = Math.hypot(I.ex - I.x, I.ey - I.y), warm = I.t < (P.castTime || 0.15);
        for (let s = 0; s < len; s++) { const x = I.x + (I.ex - I.x) * s / len, y = I.y + (I.ey - I.y) * s / len; const w = warm ? 1 : (P.size || 3); additive.push({ x: x - w / 2 + (Math.random() - 0.5) * 0.6, y: y - w / 2, w, h: w, tint: [c[0], c[1], c[2], warm ? 0.4 : 0.8], emit: 1.4 }); if (!warm && s % 3 === 0) additive.push({ x, y, w: 1, h: 1, tint: [1, 1, 1, 1], emit: 2 }); }
        for (let s = 0; s < len; s += 12) light(I.x + (I.ex - I.x) * s / len, I.y + (I.ey - I.y) * s / len, 18, L.i * 0.6); break;
      }
      case 'rune': {
        const armed = I.armT <= 0, pulse = armed ? 0.6 + 0.4 * Math.sin(game.time * 4) : 0.3;
        for (let k = -6; k <= 6; k++) additive.push({ x: I.x + k, y: I.y + ((k & 1) ? -1 : 0), w: 1, h: 1, tint: [c[0], c[1], c[2], pulse], emit: 1 });
        for (const [dx, dy] of [[-3, -3], [0, -4], [3, -3]]) additive.push({ x: I.x + dx, y: I.y + dy, w: 1, h: 1, tint: [c[0], c[1], c[2], pulse], emit: 1 });
        light(I.x, I.y - 3, armed ? 14 : 10, pulse); break;
      }
      case 'wave': {
        const h = P.size || 12;
        for (let y = 0; y < h; y++) for (let x = 0; x < 4; x++) if (Math.random() < 0.6) additive.push({ x: I.x - I.dir * x * 2, y: I.y - y, w: 1, h: 1, tint: [c[0], c[1], c[2], 0.9 - x * 0.2], emit: 1.3 });
        light(I.x, I.y - h / 2, L.r, L.i); break;
      }
      case 'tether': {
        const len = Math.hypot(I.bx - I.ax, I.by - I.ay);
        for (let s = 0; s <= len; s++) sprites.push({ x: I.ax + (I.bx - I.ax) * s / len, y: I.ay + (I.by - I.ay) * s / len, w: 1, h: 1, tint: [c[0] * 0.7 + 0.2, c[1] * 0.7 + 0.15, c[2] * 0.7 + 0.1, 1], emit: 0.8 });
        for (let s = 0; s < len; s += 16) light(I.ax + (I.bx - I.ax) * s / len, I.ay + (I.by - I.ay) * s / len, 12, L.i * 0.6); break;
      }
    }
  }
  for (const f of game.fields) { const c = col(f.color); for (let k = 0; k < 10; k++) { const a = Math.random() * Math.PI * 2, r = Math.random() * f.r; additive.push({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r * 0.5, w: 1, h: 1, tint: [c[0], c[1], c[2], 0.6], emit: 1 }); } lights.push({ x: f.x, y: f.y, r: f.r + 8, color: c, i: 0.6, shadow: false, flicker: 0.3 }); }
  for (const a of game.arcs) { const c = col(a.color); const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0); let jx = 0; for (let s = 0; s <= len; s++) { jx += (Math.random() - 0.5) * 1.5; jx *= 0.8; additive.push({ x: a.x0 + (a.x1 - a.x0) * s / len + jx, y: a.y0 + (a.y1 - a.y0) * s / len + jx, w: 1, h: 1, tint: [c[0], c[1], c[2], 1], emit: 2 }); } lights.push({ x: (a.x0 + a.x1) / 2, y: (a.y0 + a.y1) / 2, r: 30, color: c, i: 1, shadow: false }); }
}
