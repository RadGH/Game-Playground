// Current zones and floodlines (canon v2 §13; docs/06 floods/currents). Cells carry no speed, so gameplay
// flow is authored: a `current` thing is a rect + velocity that pushes entities (the player at 60%),
// loose cells and particles. A floodline raises or lowers real water one row at a time over a rect, so
// only the surface band ever moves (no scene holds more than 60k awake liquid cells). Pure.
import { CLS } from './materials.js';
const DT = 1 / 60;

export function createCurrents(things) {
  return things.filter(t => t.t === 'current').map(t => ({ id: t.id, rect: t.rect, v: t.v || [60, 0], on: t.on !== false, share: t.share ?? 0.6, cells: t.cells !== false }));
}
export function stepCurrents(game, currents) {
  const g = game.grid;
  for (const c of currents) {
    if (!c.on) continue;
    const [rx, ry, rw, rh] = c.rect;
    for (const e of [game.player, ...game.entities]) {
      if (!e || e.dead || e.flying) continue;
      if (e.x < rx || e.x > rx + rw || e.y - e.h / 2 < ry || e.y - e.h / 2 > ry + rh) continue;
      const share = e === game.player ? c.share : 1;
      // steer velocity toward the flow (a drag toward the current's speed)
      const k = 1 - Math.exp(-3 * DT);
      e.vx += (c.v[0] * share - e.vx) * k * (e === game.player && game.player.grounded ? 0.5 : 1);
      if (c.v[1]) e.vy += (c.v[1] * share - e.vy) * k;
      e.inCurrent = c.id;
    }
    // loose cells drift with the flow: a few random swaps per tick
    if (c.cells) {
      const dir = Math.sign(c.v[0]); if (!dir) continue;
      for (let k = 0; k < Math.min(60, rw * rh / 200); k++) {
        const x = rx + ((g.rand() * rw) | 0), y = ry + ((g.rand() * rh) | 0); if (!g.inside(x, y) || !g.inside(x + dir, y)) continue;
        const i = y * g.W + x, m = g.mat[i], cl = g.mats.cls[m]; if (cl !== CLS.POWDER && cl !== CLS.LIQUID) continue;
        const j = i + dir, t = g.mat[j]; if (t === m) continue; const ct = g.mats.cls[t];
        if (t === 0 || (ct === CLS.LIQUID && cl === CLS.POWDER)) g.swap(i, j, x, y, x + dir, y);
      }
    }
  }
}

/**
 * A floodline over rect [x, y, w, h]: level is the surface row (y grows down). rise(rowsPerSecond) raises it,
 * fall() lowers it. Writes water into air cells in the level row only; drains the surface row only.
 */
export function createFloodline(spec) {
  const [x, y, w, h] = spec.rect;
  return { id: spec.id, rect: spec.rect, level: spec.level ?? y + h, target: spec.target ?? spec.level ?? y + h, rate: spec.rate ?? 8, mat: spec.mat ?? 22, acc: 0, mode: 'idle' };
}
export function stepFloodline(game, f) {
  const g = game.grid, [rx, ry, rw, rh] = f.rect;
  if (f.level === f.target) { f.mode = 'idle'; return; }
  f.acc += f.rate * DT;
  while (f.acc >= 1 && f.level !== f.target) {
    f.acc -= 1;
    if (f.target < f.level) { // rise: fill the row above the current surface
      const y = f.level - 1; if (y < ry) { f.target = f.level; break; }
      for (let x = rx; x < rx + rw; x++) { const i = y * g.W + x; const m = g.mat[i]; if (m === 0 || g.mats.cls[m] === CLS.GAS) g.set(x, y, f.mat); }
      f.level = y; f.mode = 'rise';
    } else { // fall: remove the surface row
      const y = f.level; if (y >= ry + rh) { f.target = f.level; break; }
      for (let x = rx; x < rx + rw; x++) { const i = y * g.W + x; if (g.mats.cls[g.mat[i]] === CLS.LIQUID) g.set(x, y, 0); }
      f.level = y + 1; f.mode = 'fall';
    }
  }
}
