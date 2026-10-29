// The Noise and Glow fields (PLAN M4). PURE. Quarter-res, one byte per 4×4 cells (js/world/grid.js `noise`, `glow`).
//
// Noise: every running machine, drill and camp, the HQ, gunfire, explosions and the town (M7: town.noisePerPerson)
// puts a level into the field at its spot; the level falls by `fall` a quarter-cell and by `forest` more for every
// quarter-cell of woods it passes (the forest soaks it up). Nests are fed by the noise that reaches them and raids
// go for the loudest thing in range. Glow is the same for magic (M6 feeds it — spells, the refinery, batteries —
// through sim.hooks.glow and sim.defence.pulse('glow', ...); Wall V adds its own); some families hunt it.
// The field is rebuilt every `every` ticks by a max-spread from all sources (a bucket queue, cost = cells touched).
//
// Sources: sim.hooks.noise / sim.hooks.glow are lists of fn() → [{ x, y, level }] (cells, 0-255) other milestones
// append to; pulse(kind, x, y, level, ticks) adds a short-lived source (a blast, a burst of gunfire, a spell).

import { SUB } from '../entities.js';

export function createFields(sim, DD) {
  const g = sim.world.g, M = sim.world.M;
  const QW = g.QW, QH = g.QH, N = QW * QH;
  const bal = DD.bal;
  const forest = new Uint8Array(N); // trees in each 4×4 (0-16)
  let forestAt = -1e9;
  const pulses = [];
  const tree = M.id.tree;
  // bucket queue scratch
  const buckets = Array.from({ length: 256 }, () => []);
  sim.hooks.noise ??= [];
  sim.hooks.glow ??= [];

  function refreshForest() {
    forestAt = sim.tick;
    for (let qy = 0; qy < QH; qy++) for (let qx = 0; qx < QW; qx++) {
      let n = 0;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) if ((g.cells[g.idx(qx * 4 + dx, qy * 4 + dy)] & 255) === tree) n++;
      forest[qy * QW + qx] = n;
    }
  }

  /** Noise each building puts out (0 while a machine stands idle). */
  function buildingNoise(b) {
    const lv = bal.noise.byType[b.type];
    if (!lv || b.built < 1) return 0;
    const def = sim.data.B[b.type];
    // machines with recipes are loud only while they run; the HQ and towers hum all the time
    if ((def.recipes && !b.batch) || (def.power?.fuel && !b.running)) return Math.round(lv * 0.25);
    return lv;
  }

  function sources(kind) {
    const out = [];
    if (kind === 'noise') {
      for (const b of sim.ents.list('building')) { const n = buildingNoise(b); if (n) out.push({ x: b.fp.cx, y: b.fp.cy, level: n }); }
      for (const f of sim.hooks.noise) out.push(...f());
    } else {
      for (const f of sim.hooks.glow) out.push(...f());
      out.push(...sim.defence.walls.glowSources());
    }
    for (const p of pulses) if (p.kind === kind) out.push({ x: p.x, y: p.y, level: Math.round(p.level * (p.left / p.ticks)) });
    return out;
  }

  /** Rebuild one field from its sources: a max-spread over the quarter-res grid. */
  function spread(field, src, fall, forestCost) {
    field.fill(0);
    let top = 0;
    for (const s of src) {
      const lv = Math.max(0, Math.min(255, Math.round(s.level)));
      if (!lv) continue;
      const qx = Math.max(0, Math.min(QW - 1, Math.floor(s.x) >> 2)), qy = Math.max(0, Math.min(QH - 1, Math.floor(s.y) >> 2));
      const k = qy * QW + qx;
      if (lv <= field[k]) continue;
      field[k] = lv; buckets[lv].push(k);
      if (lv > top) top = lv;
    }
    for (let v = top; v > 0; v--) {
      const b = buckets[v];
      while (b.length) {
        const k = b.pop();
        if (field[k] !== v) continue;
        const x = k % QW, y = (k / QW) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= QW || ny >= QH) continue;
          const nk = ny * QW + nx;
          const nv = v - fall - Math.round((forest[nk] * forestCost) / 16);
          if (nv > field[nk]) { field[nk] = nv; buckets[nv].push(nk); }
        }
      }
    }
  }

  let ver = 0;
  function step() {
    if (sim.tick - forestAt > 1200) refreshForest();
    for (let i = pulses.length - 1; i >= 0; i--) { pulses[i].left -= bal.noise.every; if (pulses[i].left <= 0) pulses.splice(i, 1); }
    spread(g.noise, sources('noise'), bal.noise.fall, bal.noise.forest);
    spread(g.glow, sources('glow'), bal.glow.fall, bal.glow.forest);
    ver++;
  }

  /** A short-lived source: kind 'noise' | 'glow', at cell (x, y), `level` 0-255 fading over `ticks`. */
  function pulse(kind, x, y, level, ticks = bal.noise.blastTicks) {
    // a burst near an existing pulse tops it up instead of piling up thousands of sources
    for (const p of pulses) if (p.kind === kind && Math.abs(p.x - x) < 8 && Math.abs(p.y - y) < 8) { p.level = Math.min(255, Math.max(p.level * (p.left / p.ticks), level)); p.left = p.ticks = Math.max(ticks, 1); return; }
    if (pulses.length > 400) pulses.shift();
    pulses.push({ kind, x, y, level: Math.min(255, level), ticks: Math.max(1, ticks), left: Math.max(1, ticks) });
  }

  const at = (field, x, y) => { const qx = Math.max(0, Math.min(QW - 1, Math.floor(x) >> 2)), qy = Math.max(0, Math.min(QH - 1, Math.floor(y) >> 2)); return field[qy * QW + qx]; };
  return {
    step, pulse, buildingNoise, refreshForest, forest,
    noiseAt: (x, y) => at(g.noise, x, y), glowAt: (x, y) => at(g.glow, x, y),
    get ver() { return ver; },
    entNoise: (e) => at(g.noise, e.x / SUB, e.y / SUB),
  };
}
