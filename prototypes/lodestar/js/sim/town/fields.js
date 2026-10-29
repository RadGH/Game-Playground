// Farm fields, fisheries and chimneys (PLAN M7). PURE.
//
// FARM: the footprint is a field of ordinary cells (pixels with light like everything else) apart from the barn and
// crates in its look. The crop's stage is drawn from the batch the farm is running (balance.town.farm.stages: tilled
// → young → ripe), so a field visibly greens and turns gold, then goes back to tilled earth at harvest. Crop cells
// BURN (materials.json): fire takes them to scorched ground, and the farm's food comes in proportion to the share of
// its field that is still crop. A staffed farm replants `farm.replant` burnt cells a step (back to tilled earth).
//
// FISHERY: may only stand where at least `fishing.minWater` water cells lie within `fishing.reach` of its centre.
//
// CHIMNEYS (balance.town.chimneys): running smelters and generators, and lived-in houses, puff smoke into the gas
// layer — real smoke that drifts with the wind, so a smelter upwind of the houses smokes them out (morale) and one
// downwind does not.

import { cell, BURN } from '../../world/grid.js';
import { puff, GAS_SMOKE } from '../../world/gas.js';

const CROP = ['field', 'crop_young', 'crop_ripe'];

export function createFields(sim, town) {
  const { g, M } = sim.world;
  const D = sim.data;
  const cfg = town.cfg;
  const crop = new Set(CROP.map((id) => M.id[id]));
  const stageMat = CROP.map((id) => M.id[id]);

  /** Is (x, y) inside one of the farm look's non-field rectangles (barn, crates)? */
  function fixture(def, b, x, y) {
    for (const [mat, fx, fy, fw, fh] of def.look) {
      if (mat === 'field') continue;
      const lx = x - b.fp.x0, ly = y - b.fp.y0;
      if (lx >= fx && ly >= fy && lx < fx + fw && ly < fy + fh) return true;
    }
    return false;
  }

  /** The stage a farm's field should show now: 0 tilled, 1 young, 2 ripe. */
  function stageOf(b) {
    if (!b.batch || !b.workers) return 0;
    const r = D.RECIPE[b.recipe];
    const p = 1 - b.batch.left / r.ticks;
    const [a, c] = cfg.farm.stages;
    return p < a ? 0 : p < c ? 1 : 2;
  }

  function farmStep(b, def) {
    const stage = stageOf(b);
    const repaint = stage !== b.stage;
    let fieldCells = 0, cropCells = 0, replant = b.workers ? cfg.farm.replant : 0;
    const want = stageMat[stage];
    for (let y = b.fp.y0; y < b.fp.y0 + b.fp.h; y++) for (let x = b.fp.x0; x < b.fp.x0 + b.fp.w; x++) {
      if (fixture(def, b, x, y)) continue;
      fieldCells++;
      const i = g.idx(x, y), c = g.cells[i], m = c & 255;
      if (c & BURN) continue;
      if (crop.has(m)) {
        cropCells++;
        if (repaint && m !== want) { g.cells[i] = cell(want, M.ambient, 0, c & 0xff000000); g.ver[i >>> 12]++; }
        continue;
      }
      // burnt (scorched, ash, regrown grass…): replant a few a step while the farm has hands
      if (replant > 0 && !(c & BURN) && M.walk[m]) {
        g.cells[i] = cell(stageMat[0], M.ambient, 0, (c & 0xff000000) & ~BURN);
        g.ver[i >>> 12]++;
        replant--; cropCells++;
      }
    }
    b.stage = stage;
    const share = fieldCells ? cropCells / fieldCells : 0;
    if (share !== b.cropShare) { b.cropShare = share; sim.dirty.add(b.id); }
  }

  /** Placement rule (sim.hooks.place): a fishery needs open water in reach. */
  function placeRule(def, fp) {
    const f = def.fishing;
    if (!f) return null;
    const n = waterNear(fp.cx, fp.cy, f.reach);
    if (n >= f.minWater) return null;
    return `The ${def.name.toLowerCase()} needs open water close by — put it on the bank of a river or lake.`;
  }
  function waterNear(cx, cy, r) {
    let n = 0;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!g.inside(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy > r * r) continue;
      if (M.water[g.cells[g.idx(x, y)] & 255]) n++;
    }
    return n;
  }

  /** Is this producer working right now (so its chimney smokes)? */
  const running = (b) => !!b.batch && b.wants !== false && sim.hooks.workFactor(b) > 0;

  function chimneys() {
    const C = cfg.chimneys;
    for (const b of sim.ents.list('building')) {
      const ch = C[b.type];
      if (!ch || b.built < 1 || sim.tick % ch.every >= cfg.every) continue;
      const def = D.B[b.type];
      const lit = def.beds ? (b.residents || 0) > 0 : running(b);
      if (!lit) continue;
      const [ox, oy] = def.chimney || [b.fp.w >> 1, b.fp.h >> 1];
      puff(g, b.fp.x0 + ox, b.fp.y0 + oy, ch.r, GAS_SMOKE, ch.amount);
    }
  }

  function step() {
    for (const b of sim.ents.list('building')) {
      if (b.built < 1) continue;
      const def = D.B[b.type];
      if (def.field) farmStep(b, def);
    }
    chimneys();
  }

  /** Share of a farm's field that is crop (1 for anything that is not a farm). */
  const share = (b) => (D.B[b.type].field ? (b.cropShare ?? 1) : 1);

  return { step, placeRule, share, waterNear, running };
}
