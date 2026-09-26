// Falling rigid fragments (docs/06 §10.4-10.6): a detached group is lifted out of the grid, falls straight
// (no rotation), pushes liquid aside, crushes entities, and is written back on landing, shattering by
// fall height. Too big or too many -> "powderise" fallback. Pure.
import { CLS } from './materials.js';
import { F } from './grid.js';

const DT = 1 / 60, MAX_FRAGS = 24, MAX_CELLS = 6000;

export function createFragments(world) {
  const g = world.grid, W = g.W, mats = g.mats;
  const Fr = { list: [], lowDetail: false };

  Fr.detach = function (cells) {
    if (!cells.length) return null;
    if (cells.length > MAX_CELLS || Fr.lowDetail) { powderise(cells); return null; }
    if (Fr.list.length >= MAX_FRAGS) landFragment(Fr.list.shift());
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of cells) { const x = i % W, y = (i / W) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const f = { x: x0, y: y0, fy: y0, vy: 0, vx: 0, w, h, mat: new Uint8Array(w * h), shade: new Uint8Array(w * h), temp: new Int16Array(w * h), flags: new Uint8Array(w * h), bottom: new Int16Array(w).fill(-1), top: new Int16Array(w).fill(32767), mass: cells.length, fallen: 0, hitEntities: new Set() };
    for (const i of cells) {
      const x = i % W, y = (i / W) | 0, k = (y - y0) * w + (x - x0);
      f.mat[k] = g.mat[i]; f.shade[k] = g.shade[i]; f.temp[k] = g.temp[i]; f.flags[k] = g.flags[i] & ~F.PINNED;
      if (y - y0 > f.bottom[x - x0]) f.bottom[x - x0] = y - y0; if (y - y0 < f.top[x - x0]) f.top[x - x0] = y - y0;
    }
    const q = g.supportQueue; for (const i of cells) g.set(i % W, (i / W) | 0, 0); g.supportQueue = q.filter(i => g.mat[i] !== 0); // removing them must not re-queue themselves
    Fr.list.push(f);
    world.game?.bus?.emit('fragment.detach', { x: x0 + w / 2, y: y0 + h / 2, mass: f.mass });
    return f;
  };

  function powderise(cells) {
    for (const i of cells) { const m = g.mat[i]; const to = mats.brokenTo[m]; const cls = mats.cls[to]; g.set(i % W, (i / W) | 0, cls === CLS.POWDER || cls === CLS.LIQUID ? to : (g.rand() < 0.6 ? 20 : 0)); }
  }

  function blocked(f, dy) { // would moving down by dy hit a solid/powder?
    for (let c = 0; c < f.w; c++) { const b = f.bottom[c]; if (b < 0) continue; const x = f.x + c, y = Math.floor(f.fy) + b + dy; if (y >= g.H) return true; const m = g.mat[y * W + x]; const cl = mats.cls[m]; if (cl === CLS.STATIC || cl === CLS.POWDER) return true; }
    return false;
  }
  function displaceLiquid(f, yRow) { // push liquid in the row under the fragment up above it (budgeted)
    let n = 0;
    for (let c = 0; c < f.w; c++) { const b = f.bottom[c]; if (b < 0) continue; const x = f.x + c, y = yRow + b; if (y >= g.H) continue; const i = y * W + x, m = g.mat[i]; if (mats.cls[m] !== CLS.LIQUID) continue;
      // find the first air above the fragment top in this column
      let ty = Math.floor(f.fy) + (f.top[c] === 32767 ? 0 : f.top[c]) - 1; while (ty > 0 && g.mat[ty * W + x] !== 0) ty--;
      if (ty > 0 && n < 400) { g.set(x, ty, m); n++; } g.set(x, y, 0);
      if (n >= 400 && world.game?.particles) world.game.particles.spawn(3, x, y - 2, (g.rand() - 0.5) * 120, -150 - g.rand() * 100, 1.5, 0x3a6aa0, m, 900);
    }
    return n;
  }
  function landFragment(f) {
    const shatter = Math.max(0, Math.min(0.9, (f.fallen - 4) / 30));
    const yb = Math.floor(f.fy);
    for (let r = 0; r < f.h; r++) for (let c = 0; c < f.w; c++) {
      const k = r * f.w + c, m = f.mat[k]; if (!m) continue;
      let x = f.x + c, y = yb + r; while (y > 0 && g.mat[y * W + x] !== 0 && mats.cls[g.mat[y * W + x]] !== CLS.GAS && mats.cls[g.mat[y * W + x]] !== CLS.LIQUID) y--;
      const broken = g.rand() < shatter ? mats.brokenTo[m] : m;
      g.set(x, y, broken, { shade: f.shade[k], temp: f.temp[k], flags: f.flags[k] & (F.BUILT | F.FROM_WATER | F.WET) });
      if (broken === m) g.supportQueue.push(y * W + x);
    }
    world.game?.bus?.emit('fragment.land', { x: f.x + f.w / 2, y: yb + f.h, mass: f.mass, fallen: f.fallen });
    world.game?.shake?.(Math.min(0.4, f.mass / 2000));
  }

  Fr.step = function (entities = []) {
    for (let k = Fr.list.length - 1; k >= 0; k--) {
      const f = Fr.list[k];
      f.vy = Math.min(480, f.vy + 900 * DT);
      const target = f.fy + f.vy * DT; let landed = false;
      while (Math.floor(f.fy) < Math.floor(target)) {
        if (blocked(f, 1)) { landed = true; break; }
        displaceLiquid(f, Math.floor(f.fy) + 1);
        f.fy += 1; f.fallen++;
      }
      if (!landed) f.fy = Math.max(f.fy, target - 0.999); // sub-cell remainder
      f.y = Math.floor(f.fy);
      // crush entities entering the fragment box
      for (const e of entities) {
        if (e.dead || f.hitEntities.has(e.id || e)) continue;
        const ex0 = e.x - e.w / 2, ey0 = e.y - e.h;
        if (ex0 < f.x + f.w && ex0 + e.w > f.x && ey0 < f.y + f.h && e.y > f.y + f.h - 3) {
          f.hitEntities.add(e.id || e); const dmg = f.mass * f.vy * 0.004;
          if (dmg > 1 && world.game?.crush) world.game.crush(e, dmg);
        }
      }
      if (landed || blocked(f, 1)) { landFragment(f); Fr.list.splice(k, 1); }
    }
  };
  /** Is (x, y) inside a live fragment's solid cells? (entities stand on falling fragments) */
  Fr.solidAt = function (x, y) {
    for (const f of Fr.list) { const c = x - f.x, r = y - f.y; if (c >= 0 && r >= 0 && c < f.w && r < f.h && f.mat[r * f.w + c]) return true; }
    return false;
  };
  return Fr;
}
