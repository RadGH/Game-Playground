// Blasts and lightning. PURE.
//
// blast(x, y, radius, power): every cell inside breaks if the push there beats its hardness.
// Broken solids fly off as DEBRIS particles on arcs (burning ones light whatever they land on),
// liquids splash, floors scorch, the height map is dug into a crater, everything is heated, and a
// 'blast' event tells the creatures (damage + knock-back) and the game (sound, shake).
//
// lightning(x, y, power): a jagged bolt from the sky. Heat + fire at the point; in water the charge
// runs through every connected water cell (CHARGED — creatures standing in it are hit); sand
// becomes glass; mana crystal and runestone go off.

import { BURN, CHARGED, setCell, ignite, WET } from './world.js';
import { spawn, burst, P } from './particles.js';
import { addGas, GAS } from './gas.js';

export function createBlast(w, ps, rng, api) {
  const M = w.M, W = w.W, H = w.H;
  const ID = M.id;

  function blast(x, y, r, power, opts = {}) {
    r = Math.max(1, r);
    const r2 = r * r;
    let broke = 0;
    const crater = opts.crater ?? 0;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const dx = xx - x, dy = yy - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const i = yy * W + xx;
        if (w.shield && w.shield[i] && !opts.ignoreShield) continue;
        const f = 1 - Math.sqrt(d2) / r;
        const push = power * f * 70 + 10;
        const m = w.mat[i];
        if (m !== 0) {
          if (M.liquid[m]) {
            if (rng() < 0.25) spawn(ps, { kind: P.drop, mat: m, x: xx + 0.5, y: yy + 0.5, z: 1, vx: dx * 0.08 + (rng() - 0.5) * 0.3, vy: dy * 0.08 + (rng() - 0.5) * 0.3, vz: 0.5 + rng() * f, grav: 0.05, life: 60, rgb: [M.r[m], M.g[m], M.b[m]], glow: m === ID.lava ? 1 : 0 });
            w.life[i] = Math.max(0, w.life[i] - Math.round(f * 10));
            if (w.life[i] === 0) setCell(w, i, 0);
            if (m === ID.water && f > 0.4) { addGas(w, xx, yy, GAS.steam, 30); }
          } else if (push > M.hard[m] && m !== ID.vent) {
            broke++;
            const into = M.blastTo[m] !== 255 ? M.blastTo[m] : m;
            if (M.arcane[m] > 0 && !opts.arcaneChain) {
              // mana crystal / runestone blow up in turn
              setCell(w, i, 0);
              api.later(() => blast(xx, yy, M.arcane[m] * 0.5, M.arcane[m] / 9, { by: 'arcane', arcaneChain: false }));
              api.discover('arcane-burst', xx, yy, true);
              continue;
            }
            if (M.explode[m] > 0) { setCell(w, i, 0); api.later(() => blast(xx, yy, M.explode[m] * 2.2, M.explode[m], { by: 'powder', fire: true })); api.discover('chain-blast', xx, yy, true); continue; }
            if (rng() < (opts.debris ?? 0.22) && into !== 0) {
              const hot = (w.flag[i] & BURN) || (opts.fire && rng() < 0.5 && M.ignite[into]);
              const sp = 0.25 + f * 0.9 * (opts.throwScale ?? 1);
              const a = Math.atan2(dy, dx) + (rng() - 0.5) * 0.9;
              spawn(ps, { kind: P.debris, mat: into === ID.boulder ? ID.rubble : into, x: xx + 0.5, y: yy + 0.5, z: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.6 + rng() * 1.2 * f + 0.3, grav: 0.06, life: 200, rgb: hot ? [255, 140, 40] : [M.r[into], M.g[into], M.b[into]], glow: hot ? 0.9 : 0 });
            }
            setCell(w, i, f < 0.35 && M.blastTo[m] !== 255 ? M.blastTo[m] : 0);
          } else if (M.ignite[m]) {
            w.temp[i] = Math.min(255, w.temp[i] + f * 160);
          }
        }
        // floor and heat
        if (f > 0.25) {
          const g = w.ground[i];
          if (g !== ID.sand && g !== ID.snow && g !== ID.rock && g !== ID.basalt && g !== ID.cobble) w.ground[i] = f > 0.6 && crater ? ID.rock : ID.scorched;
          else if (g === ID.snow) { w.ground[i] = ID.dirt; }
        }
        const heat = (opts.heat ?? 1) * f * 190;
        w.temp[i] = Math.min(255, w.temp[i] + heat);
        if (opts.fire && f > 0.15 && rng() < 0.45) ignite(w, i, true);
        if (opts.frost) { w.temp[i] = Math.max(0, w.temp[i] - f * 200); if (w.flag[i] & BURN) w.flag[i] &= ~BURN; }
        if (crater) w.height[i] = Math.max(0, w.height[i] - Math.round(crater * f * f * (0.8 + rng() * 0.4)));
        w.touch(i);
      }
    }
    if (crater) w.heightVer++;
    // the flash, a shockwave ring and the sparks
    const big = Math.min(1, power / 6);
    if (!opts.quiet && power >= 1) { w.rings = w.rings || []; w.rings.push({ x, y, max: r * 1.7 + 3, ttl: 14, life: 14, color: opts.color || [255, 210, 140] }); }
    w.lights.push({ x, y, r: opts.color?.[0] ?? 255, g: opts.color?.[1] ?? 170, b: opts.color?.[2] ?? 70, rad: r * 3.5, ttl: 10 + big * 14, max: 10 + big * 14 });
    if (!opts.quiet) {
      burst(ps, rng, x, y, Math.round((10 + r * 5) * (opts.sparkScale ?? 1)), { kind: P.spark, speed: (0.6 + power * 0.25) * (opts.sparkScale ? 1.6 : 1), life: opts.sparkScale ? 34 : 18, palette: opts.palette || [[255, 230, 120], [255, 140, 40], [255, 90, 20], [255, 255, 220]], glow: 1.2, spread: r * 0.5 });
      if (opts.fire !== false) burst(ps, rng, x, y, Math.round(r * 2), { kind: P.ember, speed: 0.4 + power * 0.15, up: 0.9, grav: 0.035, life: 70, palette: [[255, 160, 40], [255, 100, 20]], glow: 1 });
    }
    addGas(w, x, y, GAS.smoke, Math.min(255, 60 + power * 30));
    w.shake = Math.min(14, w.shake + power * 1.2);
    w.emit('blast', { x, y, r, power, by: opts.by || 'blast', owner: opts.owner, quiet: !!opts.quiet, frost: !!opts.frost });
    return broke;
  }

  /** A bolt from the sky. */
  function lightning(x, y, power = 1, opts = {}) {
    x = Math.max(0, Math.min(W - 1, x | 0)); y = Math.max(0, Math.min(H - 1, y | 0));
    const pts = [];
    let px = x + (rng() - 0.5) * 30, py = y - 70;
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      pts.push([px + (x - px) * t + (s < steps ? (rng() - 0.5) * 6 : 0), py + (y - py) * t]);
    }
    w.bolts = w.bolts || [];
    w.bolts.push({ pts, ttl: 8, color: opts.color || [190, 220, 255] });
    w.lights.push({ x, y, r: 170, g: 200, b: 255, rad: 34 * power, ttl: 10, max: 10 });
    w.flashSky = Math.max(w.flashSky || 0, 0.55 * power);
    const i = y * W + x;
    const m = w.mat[i];
    if (M.liquid[m] && M.conducts[m]) {
      // charge runs through the connected water
      const seen = new Set([i]);
      const q = [i];
      let n = 0;
      while (q.length && n < 2400 * power) {
        const c = q.shift();
        w.flag[c] |= CHARGED; w.touch(c); n++;
        const cx = c % W, cy = (c / W) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (seen.has(j)) continue;
          seen.add(j);
          if (M.conducts[w.mat[j]] && M.liquid[w.mat[j]]) q.push(j);
        }
      }
      w.emit('shock', { cells: seen, power, x, y });
      api.discover('charged-water', x, y);
    }
    for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x - 2; xx <= x + 2; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = yy * W + xx;
      const mm = w.mat[j];
      w.temp[j] = Math.min(255, w.temp[j] + 120 * power);
      if (w.ground[j] === ID.sand && mm === 0 && rng() < 0.6) { setCell(w, j, ID.glass); api.discover('glass', xx, yy); }
      if (M.arcane[mm] > 0) { setCell(w, j, 0); api.later(() => blast(xx, yy, M.arcane[mm] * 0.6, M.arcane[mm] / 8, { by: 'arcane', color: [190, 100, 255], palette: [[220, 140, 255], [160, 80, 255], [255, 255, 255]] })); api.discover('arcane-burst', xx, yy); }
      else if (rng() < 0.5) ignite(w, j);
      w.touch(j);
    }
    burst(ps, rng, x, y, 26, { kind: P.spark, speed: 1.1, life: 14, palette: [[220, 240, 255], [150, 200, 255], [255, 255, 255]], glow: 1.2 });
    w.shake = Math.min(14, w.shake + 3 * power);
    w.emit('lightning', { x, y, power, by: opts.by || 'lightning' });
  }

  return { blast, lightning };
}
