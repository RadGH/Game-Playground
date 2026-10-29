// Mana crystal clusters grow back (PLAN M6: "crystal clusters regrow if not stripped"). PURE.
//
// A cluster is one of the map's crystal outcrops (js/sim/economy/survey.js). Its BED is every cell inside its area that
// was crystal when the map was made. Every `crystal.regrowEvery` ticks each cluster that still has at least one crystal
// cell tries `regrowTries` bed cells: a crystal below its full size grows one step (`amt` + 1), a worked-out bed cell
// (scar) beside a living crystal sprouts a new one. A cluster stripped bare stays bare for good — leave a few.
// Harvesters near a cluster that grew are told to look again (their dig list is cached).

import { OWNED } from '../../world/grid.js';

export function createCrystals(sim, cfg) {
  const { g, M } = sim.world;
  const rng = sim.rng.split('mana.crystals');
  const CRY = M.id.crystal, SCAR = M.id.scar;
  const full = M.amtHi ? M.amtHi[CRY] : 3;
  const clusters = [];
  for (const o of sim.survey.outcrops) {
    if (o.res !== 'crystal') continue;
    const R = Math.ceil(o.r * 1.5) + 1, bed = [];
    for (let y = o.y - R; y <= o.y + R; y++) for (let x = o.x - R; x <= o.x + R; x++) {
      if (g.inside(x, y) && (g.cells[g.idx(x, y)] & 255) === CRY) bed.push(g.idx(x, y));
    }
    if (bed.length) clusters.push({ o, bed, stripped: false });
  }

  const alive = (i) => (g.cells[i] & 255) === CRY && ((g.cells[i] >>> 16) & 255) > 0;
  function besideLiving(i) {
    const [cx, cy] = xyOf(i);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = cx + dx, yy = cy + dy;
      if (g.inside(xx, yy) && alive(g.idx(xx, yy))) return true;
    }
    return false;
  }
  // g.idx lays the map out chunk by chunk: undo it
  function xyOf(i) {
    const ci = i >>> 12, li = i & 4095;
    return [((ci % g.CW) << 6) + (li & 63), (((ci / g.CW) | 0) << 6) + (li >> 6)];
  }

  function step() {
    for (const c of clusters) {
      if (c.stripped) continue;
      let living = 0;
      for (const i of c.bed) if (alive(i)) living++;
      if (!living) { c.stripped = true; sim.events.push({ e: 'clusterStripped', tick: sim.tick, base: sim.base, id: c.o.id, x: c.o.x, y: c.o.y }); continue; }
      let grew = 0;
      for (let k = 0; k < cfg.regrowTries; k++) {
        const i = c.bed[rng.int(c.bed.length)];
        const v = g.cells[i], m = v & 255;
        if (v & OWNED) continue;
        let nv = v;
        if (m === CRY) {
          const a = (v >>> 16) & 255;
          if (a > 0 && a < full) nv = ((v & ~0xff0000) | ((a + 1) << 16)) >>> 0;
        } else if (m === SCAR && besideLiving(i)) {
          nv = ((v & 0xff000000 & ~(1 << 24)) | CRY | (M.ambient << 8) | (1 << 16)) >>> 0;
        }
        if (nv !== v) { g.cells[i] = nv; grew++; g.ver[i >>> 12]++; g.emitHint[i >>> 12] = 1; }
      }
      if (grew) {
        c.o.dirty = true;
        for (const b of sim.ents.list('building')) {
          if (b.digRes !== 'crystal') continue;
          const dx = b.fp.cx - c.o.x, dy = b.fp.cy - c.o.y, R = (sim.data.B[b.type].reach || 0) + c.o.r * 1.5 + 2;
          if (dx * dx + dy * dy <= R * R) { b.digList = null; b.toldEmpty = false; }
        }
      }
    }
  }

  /** Crystal units left in a cluster (cells × amt × unitsPerAmt), and whether it is stripped. */
  function state(id) {
    const c = clusters.find((k) => k.o.id === id);
    if (!c) return null;
    let units = 0, cells = 0;
    for (const i of c.bed) if (alive(i)) { cells++; units += ((g.cells[i] >>> 16) & 255) * sim.data.unitsPerAmt; }
    return { units, cells, stripped: c.stripped, bed: c.bed.length };
  }

  /** Tests and later milestones: add a cluster painted after the map was made (an outcrop record from survey). */
  function adopt(o) {
    const R = Math.ceil(o.r * 1.5) + 1, bed = [];
    for (let y = o.y - R; y <= o.y + R; y++) for (let x = o.x - R; x <= o.x + R; x++) if (g.inside(x, y) && (g.cells[g.idx(x, y)] & 255) === CRY) bed.push(g.idx(x, y));
    clusters.push({ o, bed, stripped: false });
  }

  return { step, state, adopt, clusters };
}
