// Buildings: where they may stand, how they are drawn in cells, being raised and pulled down (PLAN M3). PURE.
//
// A building is an entity of kind `building` (§3.2) whose centre (x, y) is in 1/256 cells and whose footprint is
// w × h cells from (x0, y0). Placing one turns the footprint into a building SITE at once (blueprint placed at once);
// builders then carry its cost from the stores and work it up; when it is done the footprint is stamped with the
// building's look from data/buildings.json — floor paving with roofs, crates, furnaces and lamps on it, all ordinary
// cells (flagged `owned`), so the building is pixels with light like everything else and its roofs really block
// walking. Every building has a DOOR: the first cell outside its south edge (else another side) a person can stand on.

import { SUB } from '../entities.js';
import { OWNED, ROAD, BRIDGE, EDGE, cell } from '../../world/grid.js';
import { walkable } from '../../world/edges.js';

export function footprint(def, x, y) {
  const [w, h] = def.size;
  const x0 = Math.round(x) - (w >> 1), y0 = Math.round(y) - (h >> 1);
  return { x0, y0, w, h, cx: x0 + w / 2, cy: y0 + h / 2 };
}

/** Why a cell cannot take a building (or null). Shared with the console's BUILD ghost (same rule both sides). */
export function cellRefusalOf(M, c) {
  const m = c & 255;
  if (c & EDGE) return 'a cliff';
  if (c & OWNED) return 'another building';
  if (c & (ROAD | BRIDGE)) return 'a road';
  if (M.water[m]) return 'water';
  if (M.hot[m]) return 'lava';
  if (M.ore[m]) return 'an outcrop (build beside it, not on it)';
  if (!M.walk[m]) return 'ground that cannot be built on';
  return null;
}

/** The console's quick check for the BUILD ghost: footprint on the map, on seen ground, every cell buildable. */
export function ghostCheck({ def, x, y, cellAt, M, W, H, fogAt, allow = null }) {
  const fp = footprint(def, x, y);
  if (fp.x0 < 1 || fp.y0 < 1 || fp.x0 + fp.w > W - 1 || fp.y0 + fp.h > H - 1) return { ok: false, why: 'off the map', fp };
  if (fogAt && fogAt(Math.floor(fp.cx), Math.floor(fp.cy)) === 0) return { ok: false, why: 'never seen', fp };
  for (let yy = fp.y0; yy < fp.y0 + fp.h; yy++) for (let xx = fp.x0; xx < fp.x0 + fp.w; xx++) {
    const c = cellAt(xx, yy), why = cellRefusalOf(M, c);
    if (why && !(allow && allow(c))) return { ok: false, why, fp, at: [xx, yy] }; // allow: M4 (a tower on a wall from Wall III)
  }
  return { ok: true, why: '', fp };
}

export function createBuildings(sim) {
  const { g, M } = sim.world;
  const D = sim.data;

  const cellRefusal = (c) => cellRefusalOf(M, c);

  /** Cells within `reach` of a footprint's centre whose material is one of `mats` (ids), nearest first. */
  function digCells(fp, reach, mats) {
    const out = [];
    const cx = fp.cx, cy = fp.cy, r = reach, r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (!g.inside(x, y)) continue;
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      if (mats.has(g.cells[g.idx(x, y)] & 255)) out.push([d2, x, y]);
    }
    out.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
    return out.map(([, x, y]) => [x, y]);
  }

  /** Which dig recipes a camp/drill at this footprint could run, with how much ground each has in reach. */
  function digOptions(def, fp) {
    const opts = [];
    for (const rid of def.recipes || []) {
      const r = D.RECIPE[rid];
      if (!r.dig) continue;
      const src = D.sources[r.dig];
      const mats = new Set(src.mats.map((id) => M.id[id]));
      const cells = digCells(fp, def.reach, mats);
      let units = 0;
      for (const [x, y] of cells) units += src.yield ?? ((g.cells[g.idx(x, y)] >>> 16) & 255) * D.unitsPerAmt;
      const dep = def.id === 'drill' ? sim.survey.depositUnder(fp.cx, fp.cy, r.dig) : null;
      if (dep) units += dep.amt;
      if (units > 0) opts.push({ recipe: rid, res: r.dig, cells: cells.length, units, deposit: dep?.id ?? null });
    }
    opts.sort((a, b) => (b.deposit ? 1 : 0) - (a.deposit ? 1 : 0) || b.units - a.units);
    return opts;
  }

  /**
   * Can `type` go at (x, y) (cells, the centre)? Returns { ok, why, fp, dig } — `why` in plain words.
   * Rules: on the ledger, one HQ, inside the map, on ground you have seen, every footprint cell buildable, a camp
   * beside ground it can work, and the base can pay for it after what other sites are already waiting for.
   */
  function canPlace(type, x, y, { free = false } = {}) {
    const def = D.B[type];
    if (!def) return { ok: false, why: 'There are no plans for that building.' };
    if (!free && !sim.unlocked.has(type)) {
      const node = D.NODE[def.unlock];
      return { ok: false, why: `${def.name} plans arrive with ${node ? node.name : 'research'}.` };
    }
    const hasHq = sim.ents.list('building').some((b) => b.type === 'hq');
    if (type === 'hq' && hasHq) return { ok: false, why: 'There is only one headquarters.' };
    if (type !== 'hq' && !hasHq) return { ok: false, why: 'Raise the headquarters first.' };
    const fp = footprint(def, x, y);
    if (fp.x0 < 1 || fp.y0 < 1 || fp.x0 + fp.w > g.W - 1 || fp.y0 + fp.h > g.H - 1) return { ok: false, why: `The ${def.name.toLowerCase()} would hang off the edge of the map.`, fp };
    if (!free && g.fog[g.qIdx(Math.floor(fp.cx), Math.floor(fp.cy))] === 0) return { ok: false, why: 'The crews will not build where the scope has never seen.', fp };
    if (type !== 'hq') {
      for (let yy = fp.y0; yy < fp.y0 + fp.h; yy++) for (let xx = fp.x0; xx < fp.x0 + fp.w; xx++) {
        const c = g.cells[g.idx(xx, yy)], why = cellRefusal(c);
        if (why && (sim.hooks.placeOn || []).some((f) => f(def, c))) continue; // M4: a tower may stand on a wall from Wall III
        if (why) return { ok: false, why: `The ${def.name.toLowerCase()} would stand on ${why}.`, fp, at: [xx, yy] };
      }
    }
    // never on another building's door (its porters and builders would be walled in)
    for (const o of sim.ents.list('building')) {
      const d = o.door;
      if (d && d[0] >= fp.x0 - 1 && d[0] <= fp.x0 + fp.w && d[1] >= fp.y0 - 1 && d[1] <= fp.y0 + fp.h) return { ok: false, why: `The ${def.name.toLowerCase()} would block the door of the ${D.B[o.type].name.toLowerCase()}.`, fp };
    }
    // extra placement rules from later milestones (M7: a fishery must stand on a bank): fn(def, fp) → why | null
    for (const f of sim.hooks.place || []) { const why = f(def, fp); if (why) return { ok: false, why, fp }; }
    let dig = null;
    if (def.reach) {
      const opts = digOptions(def, fp);
      if (!opts.length) return { ok: false, why: def.id === 'lumber' ? 'No trees within reach — put the lumber camp at the edge of a wood.' : `Nothing to dig within reach — put the ${def.name.toLowerCase()} right beside an outcrop${def.id === 'drill' ? ' or on a deposit the thumper found' : ''}.`, fp };
      dig = opts;
    }
    if (!free) {
      const short = sim.shortOf(def.cost);
      if (short) return { ok: false, why: `The ${def.name.toLowerCase()} needs ${short}.`, fp };
    }
    return { ok: true, why: '', fp, dig };
  }

  /** Find the door: a walkable cell just outside the footprint, south side first, nearest the middle. */
  function findDoor(fp) {
    const sides = [
      (i) => [fp.x0 + (fp.w >> 1) + i, fp.y0 + fp.h],
      (i) => [fp.x0 + fp.w, fp.y0 + (fp.h >> 1) + i],
      (i) => [fp.x0 - 1, fp.y0 + (fp.h >> 1) + i],
      (i) => [fp.x0 + (fp.w >> 1) + i, fp.y0 - 1],
    ];
    for (const side of sides) for (let k = 0; k < 2 * Math.max(fp.w, fp.h); k++) {
      const i = (k & 1 ? 1 : -1) * ((k + 1) >> 1);
      const [x, y] = side(i);
      if (g.inside(x, y) && walkable(M, g.cells[g.idx(x, y)])) return [x, y];
    }
    return [fp.x0 + (fp.w >> 1), fp.y0 + fp.h];
  }

  function paintRect(x0, y0, w, h, mi, extraFlags = 0) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!g.inside(x, y)) continue;
      const i = g.idx(x, y);
      const c = g.cells[i];
      g.cells[i] = cell(mi, M.hot[mi] || M.ambient, 0, OWNED | (c & (1 << 31)) | extraFlags);
      g.ver[i >>> 12]++;
      if (M.emits[mi]) g.emitHint[i >>> 12] = 1;
      g.wakeAt(x, y);
    }
  }

  /** Stamp a site (blueprint ground) or the finished look into the footprint cells. */
  function stamp(b, finished) {
    const def = D.B[b.type];
    const { x0, y0, w, h } = b.fp;
    paintRect(x0, y0, w, h, finished ? M.id.floor : M.id.site);
    if (!finished) return;
    for (const [mat, fx, fy, fw, fh] of def.look || []) {
      const mi = M.id[mat];
      if (mi === undefined) throw new Error(`buildings: ${def.id} look uses unknown material ${mat}`);
      paintRect(x0 + fx, y0 + fy, fw, fh, mi);
    }
  }

  function place(type, x, y, opts = {}) {
    const chk = canPlace(type, x, y, opts);
    if (!chk.ok) return chk;
    const def = D.B[type];
    const fp = chk.fp;
    const b = sim.ents.add('building', {
      type, x: Math.round(fp.cx * SUB), y: Math.round(fp.cy * SUB), w: fp.w, h: fp.h, rot: 0, fp,
      built: 0, work: 0, delivered: {}, incoming: {}, need: { ...(def.cost || {}) },
      jobs: def.jobs || 0, workers: def.jobs || 0, // M7 fills workers from the town; until then every job is filled
      recipe: null, keep: {}, lamps: { power: null, input: null, output: null },
      hp: 1, hpMax: 1, placed: sim.tick, team: 0,
    });
    b.door = findDoor(fp);
    if (def.store) { b.store = {}; b.cap = def.store; }
    if (def.recipes) {
      b.recipe = def.autoRecipe && chk.dig ? chk.dig[0].recipe : def.recipes[0];
      const r = D.RECIPE[b.recipe];
      const first = Object.keys(r.out)[0];
      b.keep = { [first]: r.keep };
    }
    for (const [r, n] of Object.entries(def.cost || {})) sim.committed[r] = (sim.committed[r] || 0) + n;
    stamp(b, false);
    sim.routeVer++;
    sim.dirty.add(b.id);
    if (opts.instant || !def.work) complete(b);
    else sim.sites.push({ kind: 'building', id: b.id }), sim.events.push({ e: 'placed', tick: sim.tick, base: sim.base, id: b.id, type, x: Math.round(fp.cx), y: Math.round(fp.cy) });
    return { ok: true, id: b.id, b };
  }

  function complete(b) {
    const def = D.B[b.type];
    for (const [r, n] of Object.entries(def.cost || {})) {
      sim.committed[r] = Math.max(0, (sim.committed[r] || 0) - (n - (b.delivered[r] || 0) - (b.incoming[r] || 0)));
    }
    b.built = 1; b.need = {}; b.delivered = {}; b.incoming = {};
    stamp(b, true);
    b.door = findDoor(b.fp);
    for (const e of [...sim.ents.list('vehicle'), ...sim.ents.list('worker')]) {
      const x = e.x / SUB, y = e.y / SUB, f = b.fp;
      if (x >= f.x0 && y >= f.y0 && x < f.x0 + f.w && y < f.y0 + f.h) { e.x = Math.round((b.door[0] + 0.5) * SUB); e.y = Math.round((b.door[1] + 0.5) * SUB); e.route = null; e.blocked = true; }
    }
    sim.routeVer++;
    sim.poolsDirty = true;
    sim.dirty.add(b.id);
    for (const [kind, n] of Object.entries(def.crew || {})) for (let i = 0; i < n; i++) sim.spawnCarrier(kind, b);
    if (def.power?.supply && def.power.fuel) b.fuelLeft = 0;
    if (def.survey) b.pulseIn = def.survey.every;
    if (b.type === 'hq' && b.store) for (const [r, n] of Object.entries(sim.data.balance.start.stock)) b.store[r] = (b.store[r] || 0) + n;
    sim.events.push({ e: 'built', tick: sim.tick, base: sim.base, id: b.id, type: b.type, name: def.name, x: Math.round(b.fp.cx), y: Math.round(b.fp.cy) });
    if (b.type === 'hq') sim.events.push({ e: 'machineUnlocked', tick: sim.tick, base: sim.base, machine: 'ledger' });
    for (const h of sim.hooks.built) h(b);
  }

  /** Pull a building down. Half its cost (all of it within `undoTicks` of placing, or if it never finished) comes back. */
  function demolish(b, { undo = false } = {}) {
    const def = D.B[b.type];
    if (b.type === 'hq') return { ok: false, why: 'The headquarters cannot be pulled down.' };
    const back = {};
    if (b.built < 1) {
      for (const [r, n] of Object.entries(b.delivered)) back[r] = n;
      for (const [r, n] of Object.entries(def.cost || {})) sim.committed[r] = Math.max(0, (sim.committed[r] || 0) - (n - (b.delivered[r] || 0) - (b.incoming[r] || 0)));
    } else {
      const share = undo ? 1 : sim.data.econ.refund;
      for (const [r, n] of Object.entries(def.cost || {})) { const k = Math.floor(n * share); if (k) back[r] = k; }
    }
    if (b.store) for (const [r, n] of Object.entries(b.store)) back[r] = (back[r] || 0) + n;
    // the ground comes back as cleared gravel
    paintRect(b.fp.x0, b.fp.y0, b.fp.w, b.fp.h, M.id.gravel);
    for (let y = b.fp.y0; y < b.fp.y0 + b.fp.h; y++) for (let x = b.fp.x0; x < b.fp.x0 + b.fp.w; x++) { const i = g.idx(x, y); g.cells[i] = (g.cells[i] & ~OWNED) >>> 0; }
    sim.ents.remove(b.id);
    sim.routeVer++;
    sim.poolsDirty = true;
    sim.dirty.add(b.id);
    sim.retireCrew(b);
    if (Object.keys(back).length) sim.dropPile(b.fp.cx, b.fp.cy, back, b.door);
    sim.events.push({ e: 'destroyed', tick: sim.tick, base: sim.base, id: b.id, type: b.type, name: def.name, x: Math.round(b.fp.cx), y: Math.round(b.fp.cy), by: 'demolish' });
    return { ok: true };
  }

  /** The building whose footprint holds cell (x, y), if any. */
  function at(x, y) {
    for (const b of sim.ents.list('building')) {
      const f = b.fp;
      if (x >= f.x0 && y >= f.y0 && x < f.x0 + f.w && y < f.y0 + f.h) return b;
    }
    return null;
  }

  return { canPlace, place, complete, demolish, at, digCells, digOptions, footprint, findDoor, stamp };
}
