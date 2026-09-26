// Thermal pass (docs/06 §7): heat diffusion, state changes (melt/freeze/boil) and burning, run only in
// "hot" chunks, every 2nd tick. Pure.
import { CLS } from './materials.js';
import { CHUNK, F, AMBIENT_TEMP } from './grid.js';
import { ignite } from './cellsim.js';

export function stepThermal(world) {
  const g = world.grid; if (g.tick & 1) { // off tick: carry hot flags forward
    for (let c = 0; c < g.NC; c++) if (g.hot[c]) g.hotNext[c] = 1;
    return 0;
  }
  let n = 0;
  for (let c = 0; c < g.NC; c++) if (g.hot[c]) { n++; thermalChunk(world, g, c); }
  return n;
}

function thermalChunk(world, g, c) {
  const W = g.W, H = g.H, mats = g.mats, cls = mats.cls, mat = g.mat, temp = g.temp, flags = g.flags, life = g.life;
  const x0 = (c % g.CW) * CHUNK, y0 = ((c / g.CW) | 0) * CHUNK, x1 = Math.min(W, x0 + CHUNK), y1 = Math.min(H, y0 + CHUNK);
  let stillHot = false;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x; let m = mat[i]; let t = temp[i];
      // diffusion (4 neighbours; outside = ambient)
      const tl = x > 0 ? temp[i - 1] : AMBIENT_TEMP, tr = x < W - 1 ? temp[i + 1] : AMBIENT_TEMP;
      const tu = y > 0 ? temp[i - W] : AMBIENT_TEMP, td = y < H - 1 ? temp[i + W] : AMBIENT_TEMP;
      const avg = (tl + tr + tu + td) * 0.25;
      let nt = t + (avg - t) * mats.conduct[m] * 0.5 + (AMBIENT_TEMP - t) * 0.004;
      // burning
      if (flags[i] & F.BURNING) {
        stillHot = true;
        if (nt < 450) nt = 450; else if (nt > 800) nt = 800;
        if ((g.tick >> 1) % Math.max(1, mats.burnRate[m] >> 1) === 0) {
          if (life[i] > 1) life[i]--;
          else { burnOut(world, g, i, x, y, m); continue; }
        }
        if (y > 0 && g.rand() < 0.35) { const u = i - W; if (mat[u] === 0) g.set(x, y - 1, 32); else if (x > 0 && mat[i - 1] === 0 && g.rand() < 0.5) g.set(x - 1, y, 32); }
        // spread to flammable neighbours
        for (let k = 0; k < 4; k++) {
          const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0), ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = ny * W + nx, tm = mat[j];
          if (tm === 22 || tm === 9) { flags[i] &= ~F.BURNING; break; }
          if (mats.flam[tm] && !(flags[j] & F.BURNING) && g.rand() < mats.flam[tm] / 100 * ((flags[j] & F.WET) ? 0.25 : 1) * 0.6) ignite(g, j, nx, ny);
          if (temp[j] < 600) temp[j] += 6;
        }
        g.touchGfx(x, y);
      }
      nt = Math.round(nt);
      if (nt !== t) { temp[i] = nt; t = nt; if (t > 350) g.touchGfx(x, y); }
      if (t > AMBIENT_TEMP + 4 || t < AMBIENT_TEMP - 4) stillHot = true;
      if (m === 0) continue;
      // state changes
      if (t >= mats.igniteAt[m] && !(flags[i] & F.BURNING)) { ignite(g, i, x, y); continue; }
      if (t >= mats.meltAt[m]) {
        if (m === 9) { if (g.rand() < 0.045) change(world, g, i, x, y, m, 22, t); continue; }
        change(world, g, i, x, y, m, mats.meltTo[m], Math.max(t, mats.temp0[mats.meltTo[m]])); continue;
      }
      if (t >= mats.boilAt[m]) { change(world, g, i, x, y, m, mats.boilTo[m], Math.max(t, 110)); continue; }
      if (t <= mats.freezeAt[m]) {
        if (m === 29) { if (life[i] < 60 && g.rand() < 0.05) { if ((world.steamDebt || 0) > 0 && g.rand() < 0.25) { world.steamDebt--; g.set(x, y, 22, { flags: F.FROM_WATER, temp: t }); } else g.set(x, y, 0, { temp: t }); } continue; }
        change(world, g, i, x, y, m, mats.freezeTo[m], t); continue;
      }
      if (mats.emit[m * 4 + 3] > 0.5) stillHot = true;
    }
  }
  if (stillHot) g.hotNext[c] = 1;
}

function change(world, g, i, x, y, from, to, t) {
  let flags = 0;
  if (from === 22 && (to === 29 || to === 9)) { flags = F.FROM_WATER; if (to === 29) world.steamDebt = (world.steamDebt || 0) + 1; }
  if (from === 9 && (g.flags[i] & F.FROM_WATER)) to = 22;
  g.set(x, y, to, { temp: t, flags });
}

function burnOut(world, g, i, x, y, m) {
  const list = g.mats.burnsTo[m];
  let to = 0;
  if (list && list.length) { let r = g.rand(); for (const b of list) { r -= b.p; if (r < 0) { to = b.to; break; } } }
  g.set(x, y, to, { temp: 400 });
}
