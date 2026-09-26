// Void zones (docs/05 §8): patches that hurt while you stand in them. Lit rim pulsing at 2 Hz, translucent
// fill, a warm-up (rim only, no damage) of >= 500 ms, damage per second applied in 4 ticks per second,
// never on the entry frame, fade over the last 500 ms. Shapes: circle, rect, column, pool (real liquid
// cells like molten wax), ring, band. Pure.
import { dealDamage } from './damage.js';
import { hexToRgb01 } from '../core/math.js';
const DT = 1 / 60;

export function spawnVoidZone(game, id, x, y, opts = {}) {
  const def = { ...(game.data.enemies?.voidZones?.[id] || game.data.bosses?.voidZones?.[id] || {}), ...opts };
  const z = { id, x, y, shape: def.shape || 'circle', r: def.r || 16, w: def.w || 24, h: def.h || 8, warmup: Math.max(0.5, (def.warmup ?? 500) / 1000), duration: (def.duration ?? 3000) / 1000,
    dps: (def.dps ?? 6) * (game.difficulty?.voidDamage ?? 1), flame: def.flame || 'physical', rim: hexToRgb01(def.rim || '#ff3b30'), t: 0, tickT: 0, source: opts.source || { id: 'void', name: 'Void zone' }, inside: new Set(), slow: def.slow || 0, hitsEnemies: !!def.hitsEnemies };
  if (z.shape === 'pool' && def.mat) { // real liquid cells that fill low spots
    const m = game.data.mats.byKey[def.mat]; for (let k = 0; k < (def.cells || 12); k++) { const cx = Math.round(x + (k % def.w) - def.w / 2), cy = Math.round(y - 1 - Math.floor(k / def.w)); if (game.grid.get(cx, cy) === 0) game.grid.set(cx, cy, m); }
  }
  (game.voidZones || (game.voidZones = [])).push(z);
  game.bus?.emit('voidzone.spawn', { id, x, y });
  return z;
}
export function inZone(z, e) {
  const cx = e.x, cy = e.y - (e.h || 12) / 2;
  switch (z.shape) {
    case 'circle': case 'pool': return Math.hypot(cx - z.x, cy - z.y) <= (z.shape === 'pool' ? Math.max(z.w, 6) : z.r);
    case 'ring': { const d = Math.hypot(cx - z.x, cy - z.y); return d <= z.r && d >= z.r - (z.thick || 8); }
    case 'rect': case 'band': return cx >= z.x - z.w / 2 && cx <= z.x + z.w / 2 && cy >= z.y - z.h && cy <= z.y;
    case 'column': return Math.abs(cx - z.x) <= z.w / 2;
  }
  return false;
}
export function stepVoidZones(game) {
  if (!game.voidZones?.length) return;
  for (const z of game.voidZones) {
    z.t += DT; if (z.t < z.warmup) continue;
    const live = [game.player, ...(z.hitsEnemies ? game.entities : [])].filter(e => e && !e.dead);
    const nowIn = new Set(live.filter(e => inZone(z, e)).map(e => e.id));
    z.tickT += DT;
    if (z.tickT >= 0.25) { z.tickT -= 0.25; for (const e of live) if (nowIn.has(e.id) && z.inside.has(e.id)) { // never on the entry frame
      const invuln = e.invuln; if (e === game.player) e.invuln = 0; // void ticks ignore hit-invulnerability but never grant it
      dealDamage(game, { source: z.source, target: e, amount: z.dps * 0.25, flame: z.flame, via: `void:${z.id}`, viaName: `${z.source.name} — ${z.id.replace(/^vz_/, '').replace(/_/g, ' ')}`, dot: true });
      if (e === game.player) e.invuln = invuln; } }
    z.inside = nowIn;
  }
  game.voidZones = game.voidZones.filter(z => z.t < z.warmup + z.duration);
}
/** Overlay quads for the renderer: rims pulse at 2 Hz and ignore light (pillar 5). */
export function voidZoneVisuals(game, overlays, additive, lights) {
  for (const z of game.voidZones || []) {
    const warm = z.t < z.warmup, left = z.warmup + z.duration - z.t, fade = Math.min(1, left / 0.5), pulse = 0.6 + 0.4 * Math.sin(z.t * Math.PI * 4);
    const a = (warm ? 0.6 : 1) * fade * pulse, c = z.rim;
    const dot = (x, y) => additive.push({ x, y, w: 1, h: 1, tint: [c[0], c[1], c[2], a], emit: 1.5 });
    if (z.shape === 'circle' || z.shape === 'pool' || z.shape === 'ring') { const r = z.shape === 'pool' ? Math.max(z.w, 6) : z.r; const n = Math.max(12, Math.round(r * 5)); for (let k = 0; k < n; k++) { const t = k / n * Math.PI * 2; dot(z.x + Math.cos(t) * r, z.y + Math.sin(t) * r * (z.shape === 'pool' ? 0.3 : 1)); } if (!warm) overlays.push({ x: z.x - r, y: z.y - r * (z.shape === 'pool' ? 0.3 : 1), w: r * 2, h: r * (z.shape === 'pool' ? 0.6 : 2), tint: [c[0], c[1], c[2], 0.12 * fade] }); }
    else { const x0 = z.shape === 'column' ? z.x - z.w / 2 : z.x - z.w / 2, y0 = z.shape === 'column' ? 0 : z.y - z.h, w = z.w, h = z.shape === 'column' ? game.grid.H : z.h; for (let x = x0; x <= x0 + w; x += 1) { dot(x, y0); dot(x, y0 + h); } for (let y = y0; y <= y0 + h; y += 1) { dot(x0, y); dot(x0 + w, y); } if (!warm) overlays.push({ x: x0, y: y0, w, h, tint: [c[0], c[1], c[2], 0.12 * fade] }); }
    lights.push({ x: z.x, y: z.y, r: (z.r || z.w) + 10, color: c, i: 0.5 * a, shadow: false });
  }
}
