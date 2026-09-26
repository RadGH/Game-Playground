// The CPU light grid (canon v2 §13 "Light"): the one gameplay truth for how lit a spot is. 1/8 resolution,
// rebuilt every 4 ticks from the same light list the renderer draws. Occlusion by a coarse opacity map
// (a coarse cell is opaque when most of its 8x8 cells are opaque). Tiers: dark < 0.2, dim 0.2-0.5,
// lit >= 0.5, bright >= 0.8. lightTier counts all light; ambientTier leaves out the player's own lantern.
import { CLS } from './materials.js';

export const TIER = { dark: 0, dim: 1, lit: 2, bright: 3 };
export const tierOf = v => v >= 0.8 ? 'bright' : v >= 0.5 ? 'lit' : v >= 0.2 ? 'dim' : 'dark';

export function createLightGrid(grid, { res = 8, floor = 0.08 } = {}) {
  const GW = Math.ceil(grid.W / res), GH = Math.ceil(grid.H / res);
  const L = { res, GW, GH, opaque: new Float32Array(GW * GH), all: new Float32Array(GW * GH), amb: new Float32Array(GW * GH), floor, ambient: 0.15, ambientBottom: 0.09, t: 0 };
  L.rebuildOpacity = function () {
    const mats = grid.mats;
    for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
      let o = 0, n = 0;
      for (let y = gy * res; y < Math.min(grid.H, gy * res + res); y += 2) for (let x = gx * res; x < Math.min(grid.W, gx * res + res); x += 2) { const m = grid.mat[y * grid.W + x]; o += 1 - mats.transmit[m]; n++; }
      L.opaque[gy * GW + gx] = n ? o / n : 1;
    }
  };
  L.rebuildOpacity();
  function trace(x0, y0, x1, y1) { // transmittance along a line through the coarse grid (DDA-ish, fixed steps)
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    let tr = 1;
    for (let k = 1; k < n; k++) { const gx = Math.floor(x0 + dx * k / n), gy = Math.floor(y0 + dy * k / n); if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue; tr *= 1 - L.opaque[gy * GW + gx] * 0.85; if (tr < 0.03) return 0; }
    return tr;
  }
  /** lights: [{ x, y, r, color:[r,g,b], i, own? }] (own = the player's lantern) */
  L.update = function (lights) {
    L.t++;
    for (let gy = 0; gy < GH; gy++) { const a = L.ambient + (L.ambientBottom - L.ambient) * (gy / Math.max(1, GH - 1)); for (let gx = 0; gx < GW; gx++) { L.all[gy * GW + gx] = a; L.amb[gy * GW + gx] = a; } }
    for (const l of lights) {
      if (l.negative) continue;
      const lum = (l.color[0] * 0.3 + l.color[1] * 0.55 + l.color[2] * 0.15) * (l.i ?? 1);
      const cx = l.x / res, cy = l.y / res, r = l.r / res;
      const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(GW - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(GH - 1, Math.ceil(cy + r));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const d = Math.hypot(gx + 0.5 - cx, gy + 0.5 - cy); if (d > r) continue;
        const t = d / r, fall = (1 - t * t) ** 2; const tr = l.shadow === false ? 1 : trace(cx, cy, gx + 0.5, gy + 0.5);
        const v = lum * fall * tr * 1.4; L.all[gy * GW + gx] += v; if (!l.own) L.amb[gy * GW + gx] += v;
      }
    }
  };
  L.at = (x, y, own = true) => { const gx = Math.floor(x / res), gy = Math.floor(y / res); if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) return L.floor; return Math.max(L.floor, (own ? L.all : L.amb)[gy * GW + gx]); };
  L.tier = (x, y) => tierOf(L.at(x, y, true));
  L.ambientTier = (x, y) => tierOf(L.at(x, y, false));
  return L;
}

/** The world's light list (static room lights, lamp-posts, the player's lantern, flashes). Pure. */
export function collectLights(game) {
  const out = [], hex = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
  for (const t of game.room.things) {
    if (t.t === 'light' && !(game.roomState?.[t.id]?.off)) out.push({ x: t.at[0], y: t.at[1], r: t.r || 64, color: hex(t.color || '#ffc46a'), i: t.intensity ?? 1, shadow: t.shadow !== false, flicker: t.flicker || 0 });
    else if (t.t === 'lamp_post') out.push({ x: t.at[0], y: t.at[1] - 22, r: 96, color: [1, 0.77, 0.42], i: 1.2, shadow: true, flicker: 0.04 });
    else if (t.t === 'great_lamp' && game.flags?.[`lamp_${t.act}`]) out.push({ x: t.at[0], y: t.at[1] - 40, r: 360, color: [1, 0.8, 0.5], i: 2.2, shadow: true, flicker: 0.02 });
  }
  const p = game.player;
  if (p && !p.dead && p.lantern && !p.lanternOut) out.push({ x: p.lantern.x, y: p.lantern.y + 2, r: game.lanternRadius || 72, color: game.flameColor || [1, 0.54, 0.16], i: p.hooded ? 0.35 : 1.1, shadow: true, flicker: 0.05, own: true });
  for (const f of game.flashes || []) out.push({ x: f.x, y: f.y, r: f.r, color: f.color, i: f.i * (f.t / f.max), shadow: false });
  for (const e of game.entities) if (e.light && !e.dead) out.push({ x: e.x, y: e.y - e.h / 2, r: e.light.r, color: e.light.color, i: e.light.i ?? 0.8, shadow: false });
  for (const l of game.extraLights || []) out.push(l);
  return out;
}
