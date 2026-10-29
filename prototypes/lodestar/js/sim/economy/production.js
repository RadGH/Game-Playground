// Production: camps, drills, refiners and generators, keep-in-stock, power and the three jam lamps (PLAN M3). PURE.
//
// Every `economy.every` ticks each finished producer either runs its batch or says why it can't on one of its lamps:
//   POWER  — the base draws more than it makes; every powered machine runs at supply ÷ demand (they slow evenly).
//   INPUT  — something its recipe needs is not in its pool (named), or there is nothing left in reach to dig.
//   OUTPUT — its store is full (a camp out in the open with nobody fetching).
// KEEP-IN-STOCK: a producer with keep { res: n } stops while the whole base holds at least n of res and starts again
// below it. Every producer has one by default (recipes.json `keep`), so automation is the normal state, not a chore.
//
// Mining takes its lump at the START of a batch: a camp lifts one `amt` step (unitsPerAmt units) from the nearest ore
// cell in reach and the cell's amt falls by one — at zero the cell turns into its `becomes` material (a scar). A
// lumber camp fells a whole tree cell (it becomes stumps). A drill standing on a known deposit drills the deposit.
//
// Extension points: `sim.hooks.workFactor(b)` (M7: staffing × morale; default 1) multiplies every producer's speed.

import { SUB } from '../entities.js';
import { cell } from '../../world/grid.js';

export function createProduction(sim) {
  const { g, M } = sim.world;
  const D = sim.data;
  const every = D.econ.every;

  function poolFor(b) { return sim.stores.poolOf(b.id); }
  const isProducer = (def) => !!(def.recipes || def.power?.supply);

  /** Fuel row this producer would burn now: the first of `fuel` its pool holds, else the first one. */
  function pickFuel(fuel, p) {
    const keys = Object.keys(fuel);
    for (const k of keys) if (p && sim.stores.stock(p, k) >= fuel[k]) return k;
    return keys[0];
  }

  function setLamp(b, lamp, why) {
    const cur = b.lamps[lamp];
    if (cur === why) return;
    b.lamps[lamp] = why;
    sim.dirty.add(b.id);
    if (why) {
      b.jamSince = b.jamSince || {};
      b.jamSince[lamp] = sim.tick;
    } else if (b.jamTold) delete b.jamTold[lamp];
  }
  /** Tell the teletype about a lamp that has stayed lit for `jamDebounce` ticks (once per lighting). */
  function report(b) {
    for (const lamp of ['power', 'input', 'output']) {
      const why = b.lamps[lamp];
      if (!why) continue;
      b.jamTold = b.jamTold || {};
      b.jamAt = b.jamAt || {};
      if (b.jamTold[lamp] === why) continue;
      if (sim.tick - (b.jamSince?.[lamp] ?? sim.tick) < D.econ.jamDebounce) continue;
      // the same lamp for the same reason is not reported again for a while (a busy camp flickers OUTPUT)
      if (b.jamAt[lamp + why] !== undefined && sim.tick - b.jamAt[lamp + why] < D.econ.jamRepeat) { b.jamTold[lamp] = why; continue; }
      b.jamTold[lamp] = why; b.jamAt[lamp + why] = sim.tick;
      sim.events.push({ e: 'jam', tick: sim.tick, base: sim.base, id: b.id, type: b.type, lamp, why, x: Math.round(b.fp.cx), y: Math.round(b.fp.cy) });
    }
  }

  // ---- power: one number per base
  function powerStep() {
    let demand = 0, supply = 0;
    for (const b of sim.ents.list('building')) {
      if (b.built < 1) continue;
      const def = D.B[b.type];
      if (def.power?.draw && b.wants) demand += def.power.draw;
    }
    for (const b of sim.ents.list('building')) {
      const pw = D.B[b.type].power;
      if (b.built >= 1 && pw?.supply && !pw.fuel) supply += pw.supply;
    }
    for (const b of sim.ents.list('building')) {
      if (b.built < 1) continue;
      const def = D.B[b.type], pw = def.power;
      if (!pw?.supply || !pw.fuel) continue;
      // a generator burns only while the base draws more than what is already supplied
      if (demand <= supply) { setLamp(b, 'input', null); b.running = false; continue; }
      if (b.fuelLeft <= 0) {
        const p = poolFor(b);
        const f = pickFuel(pw.fuel, p);
        const store = p ? sim.stores.stock(p, f) : 0;
        if (store >= pw.fuel[f]) {
          sim.stores.take(p, f, pw.fuel[f]);
          b.fuelLeft = pw.burnTicks;
          sim.used(f, pw.fuel[f]);
          setLamp(b, 'input', null);
        } else setLamp(b, 'input', `no ${fuelWords(pw.fuel)} to burn`);
      }
      if (b.fuelLeft > 0) { supply += pw.supply; b.fuelLeft -= every; b.running = true; } else b.running = false;
      report(b);
    }
    sim.power.demand = demand; sim.power.supply = supply;
    sim.power.factor = demand > 0 ? Math.min(1, supply / demand) : 1;
  }

  const fuelWords = (fuel) => Object.keys(fuel).map((k) => D.R[k].name.toLowerCase()).join(' or ');

  /** Is this producer held off by keep-in-stock? */
  function stocked(b) {
    for (const [r, n] of Object.entries(b.keep || {})) {
      if (n === null || n === undefined || n < 0) continue; // no limit
      const have = (sim.baseStock[r] || 0) + (sim.carried[r] || 0);
      if (have >= n) return true;
    }
    return false;
  }

  function digTarget(b, r) {
    const def = D.B[b.type];
    const src = D.sources[r.dig];
    if (def.id === 'drill') {
      const dep = sim.survey.depositUnder(b.fp.cx, b.fp.cy, r.dig);
      if (dep) return { deposit: dep };
    }
    // nearest ore cell in reach still holding something; the list is cached and walked forward
    const mats = sim.survey.matsOf[r.dig];
    if (!b.digList || b.digRes !== r.dig) { b.digList = sim.buildings.digCells(b.fp, def.reach, mats); b.digRes = r.dig; b.digAt = 0; }
    while (b.digAt < b.digList.length) {
      const [x, y] = b.digList[b.digAt];
      const c = g.cells[g.idx(x, y)];
      if (mats.has(c & 255) && (src.yield || ((c >>> 16) & 255) > 0)) return { cell: [x, y] };
      b.digAt++;
    }
    return null;
  }

  /** Take one lump out of the ground (or a deposit). Returns the units dug. */
  function dig(b, r, t) {
    const src = D.sources[r.dig];
    if (t.deposit) {
      const n = Math.min(t.deposit.amt, r.out[r.dig]);
      t.deposit.amt -= n;
      sim.surveyVer++;
      if (t.deposit.amt <= 0) sim.events.push({ e: 'depleted', tick: sim.tick, base: sim.base, id: t.deposit.id, res: t.deposit.res, x: t.deposit.cx, y: t.deposit.cy, what: 'deposit' });
      return n;
    }
    const [x, y] = t.cell;
    const i = g.idx(x, y);
    const c = g.cells[i];
    const becomes = M.id[src.becomes];
    let n;
    if (src.yield) {
      n = src.yield;
      g.cells[i] = cell(becomes, (c >>> 8) & 255, 0, (c & 0xff000000) & ~(1 << 24));
    } else {
      const a = ((c >>> 16) & 255) - 1;
      n = D.unitsPerAmt;
      g.cells[i] = a > 0 ? ((c & ~0xff0000) | (a << 16)) >>> 0 : cell(becomes, (c >>> 8) & 255, 0, c & 0xff000000);
      const o = sim.survey.outcropAt(x, y);
      if (o) { o.dirty = true; o.worked = true; }
    }
    g.ver[i >>> 12]++;
    if (M.regrow[g.cells[i] & 255] !== 255) g.regrowHint[i >>> 12] = 1;
    return n;
  }

  function runProducer(b, def) {
    const r = D.RECIPE[b.recipe];
    const p = poolFor(b);
    if (!r || !p) return;
    if (b.wants === undefined) b.wants = !stocked(b);
    const speed = (def.power?.draw ? sim.power.factor : 1) * sim.hooks.workFactor(b);
    setLamp(b, 'power', def.power?.draw && b.wants && sim.power.factor < 1 ? `power short: ${Math.round(sim.power.supply)} of ${Math.round(sim.power.demand)}` : null);
    if (b.batch) {
      b.batch.left -= every * speed;
      if (b.batch.left > 0) return;
      // done: put the output in the pool
      const outTotal = Object.values(b.batch.out).reduce((a, v) => a + v, 0);
      if (sim.stores.space(p) < outTotal) { setLamp(b, 'output', 'the store is full'); b.batch.left = 0; return; }
      for (const [k, n] of Object.entries(b.batch.out)) { sim.stores.put(p, k, n); sim.made(k, n); sim.baseStock[k] = (sim.baseStock[k] || 0) + n; }
      b.batch = null;
      setLamp(b, 'output', null);
      b.made = (b.made || 0) + 1;
    }
    b.wants = !stocked(b);
    if (!b.wants) { setLamp(b, 'input', null); return; }
    // start a new batch
    const outTotal = Object.values(r.out).reduce((a, v) => a + v, 0);
    if (sim.stores.space(p) < outTotal) { setLamp(b, 'output', 'the store is full'); return; }
    setLamp(b, 'output', null);
    const missing = [];
    for (const [k, n] of Object.entries(r.in || {})) if (sim.stores.stock(p, k) < n || sim.free(k) < n) missing.push(D.R[k].name.toLowerCase());
    let fuel = null;
    if (r.fuel) {
      fuel = pickFuel(r.fuel, p);
      if (sim.stores.stock(p, fuel) < r.fuel[fuel] || sim.free(fuel) < r.fuel[fuel]) missing.push(fuelWords(r.fuel));
    }
    if (r.dig) {
      const t = digTarget(b, r);
      if (!t) { setLamp(b, 'input', `nothing left to dig in reach`); if (!b.toldEmpty) { b.toldEmpty = true; sim.events.push({ e: 'depleted', tick: sim.tick, base: sim.base, id: b.id, res: r.dig, x: Math.round(b.fp.cx), y: Math.round(b.fp.cy), what: 'reach' }); } report(b); return; }
      setLamp(b, 'input', null);
      const n = dig(b, r, t);
      b.batch = { left: r.ticks, out: { [r.dig]: n } };
      return;
    }
    if (missing.length) { setLamp(b, 'input', `no ${missing.join(', ')}`); report(b); return; }
    setLamp(b, 'input', null);
    for (const [k, n] of Object.entries(r.in || {})) { sim.stores.take(p, k, n); sim.used(k, n); }
    if (fuel) { sim.stores.take(p, fuel, r.fuel[fuel]); sim.used(fuel, r.fuel[fuel]); }
    b.batch = { left: r.ticks, out: { ...r.out } };
  }

  function step() {
    sim.refreshTotals();
    powerStep();
    for (const b of sim.ents.list('building')) {
      if (b.built < 1) continue;
      const def = D.B[b.type];
      if (def.recipes) { runProducer(b, def); report(b); }
    }
  }

  /** Change what a producer makes (its keep-in-stock follows the new recipe's first output). */
  function setRecipe(b, rid) {
    const def = D.B[b.type];
    if (!def.recipes?.includes(rid)) return `A ${def.name.toLowerCase()} cannot ${D.RECIPE[rid]?.name.toLowerCase() || 'do that'}.`;
    if (b.recipe === rid) return null;
    b.recipe = rid; b.batch = null; b.digList = null; b.toldEmpty = false;
    const r = D.RECIPE[rid], first = Object.keys(r.out)[0];
    b.keep = { [first]: r.keep };
    sim.dirty.add(b.id);
    return null;
  }

  return { step, setRecipe, stocked, isProducer, pickFuel };
}
