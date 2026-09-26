// Turns game state into a render frame: sprites, lights, overlays (docs/06 §14, §16). Browser-side but
// DOM-free.
import { PK } from '../entities/particles.js';
import { hexToRgb01 } from '../core/math.js';

const rgb = n => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

export function buildFrame(game, cam, atlas, alpha) {
  const sprites = [], overlays = [], additive = [], lights = [];
  const p = game.player, room = game.room;
  // static lights from the room
  for (const t of room.things) if (t.t === 'light') lights.push({ x: t.at[0], y: t.at[1], r: t.r || 64, color: hexToRgb01(t.color || '#ffc46a'), i: t.intensity ?? 1, shadow: t.shadow !== false, flicker: t.flicker || 0 });
  for (const t of room.things) if (t.t === 'lamp_post') lights.push({ x: t.at[0], y: t.at[1] - 22, r: 96, color: [1, 0.77, 0.42], i: 1.2, shadow: true, flicker: 0.04 });
  // player
  if (p) {
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
    lights.push({ x: lp.x, y: lp.y + 2, r: game.lanternRadius || 72, color: flame, i: 1.1, shadow: true, flicker: 0.05 });
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
