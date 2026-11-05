// Blasts, falling columns and lightning on the chunked, wrapping world. PURE. Adapted from
// Kindlewild's prototypes/kindlewild/js/sim/blast.js (copied, not imported). Used by the ruler
// powers now, and meant for walls, sieges and monsters later.
//
//   const B = blastOf(sim);
//   B.blast(x, y, r, power, { fire, crater, debris, heat, by })   → how many cells broke
//   B.breakCell(x, y, { push, fling })                           → break one cell, columns fall
//   B.dropColumn(x, y, tall)                                     → a column's height falls straight down
//   B.lightning(x, y, power)                                     → heat + fire at a point (+ a small blast)
//
// Every cell inside a blast breaks if the push there (power x closeness x 70 + 10) beats its
// hardness (`hard` in data/materials.json). A broken cell may fly off as DEBRIS on an arc (it lands
// as rubble, or sets a fire if it was burning). A broken cell that stood TALL (a tower, a tree, a
// wall) drops its height as debris falling STRAIGHT DOWN around it — owner: collapses go straight
// down, no toppling. Liquids splash and thin out (and stop being "still", so they flow back in),
// floors scorch, a crater digs the height map, everything inside is heated.
//
// Never touched: roads and bridges (PLAN §0.3), lava vents and wellsprings (`hard` 255).
// Every chunk changed is marked: c.dirty + store.markEdited + sim.wake.

import { BURN, STILL } from './cells.js';
import { debrisOf, P } from './particles.js';

export function blastOf(sim) {
  if (!sim.blaster) sim.blaster = createBlast(sim);
  return sim.blaster;
}

export function createBlast(sim) {
  const { M } = sim;
  const ID = M.id;
  const D = debrisOf(sim);
  const rng = () => sim.rng();
  const mark = D.mark;
  const isRoad = (c, i) => M.flag.road[c.ground[i]] || (c.mat[i] && M.flag.road[c.mat[i]]);
  const queue = [];          // chain blasts (powder, mana crystal) run after the one that set them off

  /** A column's height falls straight down around its cell as debris (it lands as rubble). */
  function dropColumn(x, y, tall, rgb = [120, 112, 104]) {
    const n = Math.min(8, Math.max(1, Math.round(tall * 0.6)));
    for (let k = 0; k < n; k++) {
      D.spawn({ kind: P.debris, mat: ID.rubble, x: x + 0.5 + (rng() - 0.5) * 2.4, y: y + 0.5 + (rng() - 0.5) * 1.6,
        z: 1 + (tall - 1) * (k + 1) / n, vx: (rng() - 0.5) * 0.02, vy: (rng() - 0.5) * 0.02, vz: 0, grav: 0.04, life: 400, rgb });
    }
  }

  /**
   * Break the thing standing at (x, y). push = how hard it was hit (compared with `hard`); fling =
   * { vx, vy, vz } for a flying piece, or null for none. Returns the material that broke, or 0.
   */
  function breakCell(x, y, { push = 999, fling = null, into = null, hot = false } = {}) {
    const at = sim.cell(x, y); if (!at) return 0;
    const { c, i } = at;
    const m = c.mat[i];
    if (!m || M.liquid[m] || isRoad(c, i) || M.hard[m] >= 255 || M.source[m] !== 255) return 0;
    if (push <= M.hard[m]) return 0;
    const tall = c.tall[i];
    const rgb = [M.r[m], M.g[m], M.b[m]];
    const burning = (c.flag[i] & BURN) || hot;
    if (tall > 1) dropColumn(x, y, tall, rgb);
    if (fling) D.spawn({ kind: P.debris, mat: ID.rubble, x: x + 0.5, y: y + 0.5, z: fling.z ?? 1, vx: fling.vx, vy: fling.vy, vz: fling.vz, grav: fling.grav ?? 0.05, life: 300,
      rgb: burning ? [255, 140, 40] : rgb, glow: burning ? 0.9 : 0 });
    const to = into ?? 0;
    c.mat[i] = to; c.tall[i] = to ? Math.min(M.tall[to] || 1, 1) : 0; c.hp[i] = to && M.hard[to] ? 255 : 0;
    c.life[i] = to ? M.fuel[to] : 0; c.part[i] = 0; c.flag[i] &= ~BURN;
    mark(c);
    if (M.explode[m] > 0) queue.push([x, y, M.explode[m] * 2.2, M.explode[m], { fire: true, by: 'powder' }]);
    else if (M.arcane[m] > 0) queue.push([x, y, M.arcane[m] * 0.4, M.arcane[m] / 9, { by: 'arcane' }]);
    return m;
  }

  function blast(x, y, r, power, o = {}) {
    r = Math.max(1, r);
    const r2 = r * r, crater = o.crater ?? 0;
    let broke = 0;
    for (let yy = Math.floor(y - r); yy <= Math.ceil(y + r); yy++) {
      for (let xx = Math.floor(x - r); xx <= Math.ceil(x + r); xx++) {
        const dx = xx + 0.5 - x, dy = yy + 0.5 - y, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const at = sim.cell(xx, yy); if (!at) continue;
        const { c, i } = at;
        const f = 1 - Math.sqrt(d2) / r;
        const push = power * f * 70 + 10;
        const m = c.mat[i];
        if (m && M.liquid[m]) {
          // splash: thin it out and let it flow again
          if (rng() < 0.2) D.spawn({ kind: P.drop, x: xx + 0.5, y: yy + 0.5, z: 1, vx: dx * 0.06 + (rng() - 0.5) * 0.3, vy: dy * 0.06 + (rng() - 0.5) * 0.3, vz: 0.4 + rng() * f, grav: 0.05, life: 60, rgb: [M.r[m], M.g[m], M.b[m]], glow: m === ID.lava ? 1 : 0 });
          // still sea and river water only splashes: thinning it would leave a hole nothing refills
          if (!(c.flag[i] & STILL)) {
            c.life[i] = Math.max(0, c.life[i] - Math.round(f * 6));
            if (!c.life[i]) { c.mat[i] = 0; c.tall[i] = 0; }
            mark(c);
          }
        } else if (m && M.built[m] && sim.damage) {
          // built things (walls, houses) have hit points: a blast wears them down, then they fall
          // (js/sim/walls.js damage → collapse straight down), so stone walls survive small blasts
          if (sim.damage(xx, yy, push * 0.8, { blast: true })) broke++;
        } else if (m && push > M.hard[m]) {
          const hot = (c.flag[i] & BURN) || (o.fire && rng() < 0.5 && M.ignite[m]);
          let fling = null;
          if (rng() < (o.debris ?? 0.22)) {
            const sp = (0.2 + f * 0.8) * (o.throwScale ?? 1), a = Math.atan2(dy, dx) + (rng() - 0.5) * 0.9;
            fling = { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 0.5 + rng() * 1.1 * f + 0.3 };
          }
          const into = f < 0.35 && M.blastTo[m] !== 255 ? M.blastTo[m] : 0;
          if (breakCell(xx, yy, { push, fling, into, hot })) broke++;
        } else if (m && M.ignite[m]) {
          c.temp[i] = Math.min(255, c.temp[i] + f * 160);
        }
        // the floor: scorched, dug into a crater (roads are never damaged)
        const g = c.ground[i];
        if (!M.flag.road[g]) {
          if (f > 0.25 && o.scorch !== false && g !== ID.rock && g !== ID.basalt && g !== ID.sand && g !== ID.fissure) c.ground[i] = f > 0.6 && crater ? ID.rock : (g === ID.snow ? ID.dirt : ID.scorched);
          if (crater) c.height[i] = Math.max(1, c.height[i] - Math.round(crater * f * f * (0.8 + rng() * 0.4)));
        }
        c.temp[i] = Math.min(255, c.temp[i] + (o.heat ?? 1) * f * 190);
        if (o.fire && f > 0.15 && rng() < 0.45) sim.rules.ignite(c, i);
        mark(c);
      }
    }
    if (!o.quiet) {
      D.burst(rng, x, y, Math.min(80, Math.round(8 + r * 4)), { kind: P.spark, speed: 0.4 + power * 0.12, life: 16, palette: [[255, 230, 120], [255, 140, 40], [255, 90, 20], [255, 255, 220]], glow: 1.2, spread: r * 0.5 });
      if (o.fire !== false) D.burst(rng, x, y, Math.min(40, Math.round(r * 2)), { kind: P.cinder, speed: 0.3 + power * 0.08, up: 0.8, grav: 0.035, life: 70, palette: [[255, 160, 40], [255, 100, 20]], glow: 1 });
      D.burst(rng, x, y, Math.min(40, Math.round(r * 2)), { kind: P.dust, speed: 0.25 + power * 0.05, up: 0.3, grav: 0.01, life: 80, palette: [[120, 110, 100], [90, 84, 78]], spread: r });
    }
    sim.events.push({ t: 'blast', x, y, r, power, by: o.by || 'blast' });
    // chain blasts: powder and mana crystal go off in turn (a few at most per call)
    let n = 0;
    while (queue.length && n++ < 8) { const [qx, qy, qr, qp, qo] = queue.shift(); broke += blast(qx, qy, qr, qp, qo); }
    queue.length = 0;
    return broke;
  }

  /** A lightning strike: heat, fire on whatever will burn, sand to glass, and a small blast. */
  function lightning(x, y, power = 1, r = 2) {
    const R = Math.ceil(r);
    for (let yy = Math.floor(y) - R; yy <= Math.floor(y) + R; yy++) for (let xx = Math.floor(x) - R; xx <= Math.floor(x) + R; xx++) {
      const at = sim.cell(xx, yy); if (!at) continue;
      const { c, i } = at;
      c.temp[i] = Math.min(255, c.temp[i] + 120 * power);
      if (c.ground[i] === ID.sand && !c.mat[i] && rng() < 0.5) { c.mat[i] = ID.glass; c.tall[i] = M.tall[ID.glass]; c.hp[i] = 255; }
      else if (rng() < 0.6) sim.rules.ignite(c, i);
      mark(c);
    }
    const broke = blast(x, y, Math.max(1.5, r * 0.8), power, { fire: true, debris: 0.3, heat: 0.6 });
    D.burst(rng, x, y, 24, { kind: P.spark, speed: 0.9, life: 12, palette: [[220, 240, 255], [150, 200, 255], [255, 255, 255]], glow: 1.2 });
    sim.events.push({ t: 'lightning', x, y, power });
    return broke;
  }

  return { blast, lightning, breakCell, dropColumn };
}
