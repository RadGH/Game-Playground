// Farhold — farming, where the player breaks the ground and the colony keeps it.
//
// PURE JavaScript: no DOM, no Three.js. `data/crops.json` carries every number.
//
//   import { createFarm } from './farm.js';
//   const farm = createFarm({ data: cropsJson, board });
//   farm.layPlot({ x, z, crop: 'grain', by: 'player' });   // only ever the player
//   farm.tick(12);                                          // growth, then orders on the board
//   board.work(order.id, { source: 'citizen', byName: 'Marwen', units: 3 });
//
// THE ASYMMETRY IS THE DESIGN. Say it plainly, because it is the one rule that must survive every
// later change:
//
//   "they don't plant new crops but they will harvest and replant existing crops, this way the
//    player still has to set up the crops in the first place but they maintain it after that."
//
// (Design reference, comments only: Necesse's farmers work exactly like this.) A citizen can put a
// seed back in a hole the player dug. A citizen can NEVER dig a hole. If they could, a farm would
// grow on its own while you were on another continent and the field you laid out would stop being
// something you made. `layPlot` is the only way a plot comes into existence and it refuses every
// source but the player — there is no second door, and `tests/colony.test.js` walks a farmer for a
// month to prove no plot appears.
//
// HARVEST AND REPLANT ARE ORDINARY WORK ORDERS. They go on the same board as smelting and building
// (js/work.js), which means the player can scythe their own field by hand, a farmer can do it on
// their shift, or a harvester machine can do it while nobody is home. Same unit, three sources —
// the farm does not get a special worker type.

import { createOrder, workLeft } from './work.js';

/**
 * A safety net so a page that forgot to load the JSON still runs. `data/crops.json` is the real
 * file and the only one the game should ever use — nothing here should be tuned.
 */
const FALLBACK = {
  soil: { start: 1, wearPerHarvest: 0.04, restorePerReplant: 0.02, fallowRestorePerDay: 0.06, min: 0.45, max: 1.2 },
  work: { harvestUnits: 3, replantUnits: 2, harvestTag: 'harvest', replantTag: 'replant' },
  spoil: { afterHours: 96, yieldFloor: 0.35, perHourAfter: 0.01 },
  cook: { tag: 'cook', units: 3, batch: 4, multiplier: 1.6, stopAtMeals: 60 },
  crops: [{ key: 'grain', name: 'Pale Grain', good: 'grain', growHours: 72, yield: 4, food: 1, seedCost: 2, biomes: ['any'] }],
};

const round2 = n => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** Which crops will take on this ground. `any` in the crop's list means anywhere. */
export function cropsFor(data, biome = 'any') {
  const list = (data?.crops || FALLBACK.crops);
  const ground = String(biome || 'any').toLowerCase();
  return list.filter(c => (c.biomes || ['any']).some(b => b === 'any' || ground.includes(b)));
}

/**
 * Is this source allowed to create a plot? Exported so a build-mode UI can grey the tool out for
 * the right reason rather than guessing, and so the rule is testable on its own.
 */
export function canBreakGround(source) { return source === 'player'; }

export function createFarm({ data = null, board = null, seed = 1, id = 'farm' } = {}) {
  const D = data || FALLBACK;
  const soilCfg = D.soil || FALLBACK.soil;
  const workCfg = D.work || FALLBACK.work;
  const spoilCfg = D.spoil || FALLBACK.spoil;
  const cookCfg = D.cook || FALLBACK.cook;
  const crops = D.crops || FALLBACK.crops;
  const cropBy = key => crops.find(c => c.key === key) || crops[0];

  let plotSeq = 1;

  const farm = {
    id,
    data: D,
    crops,
    board,
    now: 0,
    plots: [],
    /** Raw crop, by `good`. Meals are cooked food and are eaten first. */
    store: {},
    meals: 0,
    log: [],
    _applied: new Set(),   // orders already cashed in, so a board sweep cannot double-count

    /**
     * BREAK NEW GROUND. The player, and only the player.
     *
     * `by` defaults to 'player' because the only thing that ever calls this is a tool in the
     * player's hands — but it is checked rather than assumed, so a future caller that wires a
     * citizen into it gets a refusal instead of a farm that grows itself.
     *
     * Returns `{ ok, plot }` or `{ ok: false, why }` — a refusal carries a sentence the UI can show
     * straight to the player, because "nothing happened" is the worst possible answer.
     */
    layPlot({ x = 0, z = 0, crop = null, by = 'player', biome = 'any', at = null } = {}) {
      if (!canBreakGround(by)) {
        return { ok: false, why: 'Only you can break new ground. Your folk will work a field, not start one.' };
      }
      const allowed = cropsFor(D, biome);
      const want = crop ? cropBy(crop) : allowed[0];
      if (!want) return { ok: false, why: 'Nothing will grow on this ground.' };
      if (crop && allowed.length && !allowed.some(c => c.key === want.key)) {
        return { ok: false, why: `${want.name} will not take on this ground.` };
      }
      const plot = {
        id: `${id}_p${plotSeq++}`,
        x, z,
        crop: want.key,
        cropName: want.name,
        good: want.good,
        state: 'growing',
        grown: 0,
        soil: soilCfg.start,
        harvests: 0,
        laidBy: 'player',         // recorded for ever: this field exists because a person dug it
        laidAt: at == null ? farm.now : at,
        ripeAt: null,
        orderId: null,
        lastTendedBy: null,
      };
      farm.plots.push(plot);
      return { ok: true, plot };
    },

    /** Take a plot back out. Also player-only, for the same reason. */
    removePlot(plotId, by = 'player') {
      if (!canBreakGround(by)) return { ok: false, why: 'Your folk will not tear up a field you laid.' };
      const i = farm.plots.findIndex(p => p.id === plotId);
      if (i < 0) return { ok: false, why: 'No such plot.' };
      const [plot] = farm.plots.splice(i, 1);
      if (plot.orderId && board) board.cancel(plot.orderId);
      return { ok: true, plot };
    },

    /** What a ripe plot is actually worth right now, soil and standing-too-long included. */
    yieldOf(plot) {
      const crop = cropBy(plot.crop);
      const standing = plot.ripeAt == null ? 0 : Math.max(0, farm.now - plot.ripeAt);
      const over = Math.max(0, standing - (spoilCfg.afterHours || 96));
      const keep = clamp(1 - over * (spoilCfg.perHourAfter || 0.01), spoilCfg.yieldFloor ?? 0.35, 1);
      return Math.max(1, Math.round(crop.yield * plot.soil * keep));
    },

    /**
     * Move the farm on. Growth first, then the orders that growth created, then whatever finished.
     *
     * Nothing here does work — it only ever POSTS work. A field with nobody to reap it stands ripe
     * until somebody, or something, turns up.
     */
    tick(hours = 0, { at = null } = {}) {
      const dt = Math.max(0, hours);
      farm.now = at == null ? round2(farm.now + dt) : at;
      const events = [];

      for (const plot of farm.plots) {
        const crop = cropBy(plot.crop);
        if (plot.state === 'growing') {
          plot.grown = round2(plot.grown + dt);
          if (plot.grown >= crop.growHours) {
            plot.state = 'ripe';
            plot.ripeAt = farm.now;
            events.push({ kind: 'ripe', plot: plot.id, crop: crop.name });
          }
        } else {
          // Ripe or stubble and nobody has come: the ground gets a rest out of it, at least.
          plot.soil = clamp(plot.soil + (soilCfg.fallowRestorePerDay || 0) * (dt / 24), soilCfg.min, soilCfg.max);
        }
      }

      if (board) {
        // Cash in before posting. The other way round, a plot whose harvest finished this very tick
        // is still 'ripe' when the posting pass looks at it, and gets a second harvest order for a
        // crop that has already been carried away.
        events.push(...farm._collect());
        farm._postOrders();
      }
      return events;
    },

    /** Put harvest and replant on the board for anything that wants one and has not got one. */
    _postOrders() {
      for (const plot of farm.plots) {
        if (farm._liveOrder(plot)) continue;
        if (plot.state === 'ripe') {
          const order = board.post(createOrder({
            tag: workCfg.harvestTag || 'harvest',
            stationId: plot.id,
            name: `Bring in the ${plot.cropName}`,
            units: workCfg.harvestUnits ?? 3,
            priority: 2,                      // ripe food beats almost anything else on the board
            postedAt: farm.now,
            meta: { farm: id, plotId: plot.id, kind: 'harvest' },
          }));
          plot.orderId = order.id;
        } else if (plot.state === 'stubble') {
          const order = board.post(createOrder({
            tag: workCfg.replantTag || 'replant',
            stationId: plot.id,
            name: `Put the ${plot.cropName} back in`,
            units: workCfg.replantUnits ?? 2,
            priority: 1,
            postedAt: farm.now,
            meta: { farm: id, plotId: plot.id, kind: 'replant' },
          }));
          plot.orderId = order.id;
        }
      }
      farm._postCookOrder();
    },

    _liveOrder(plot) {
      if (!plot.orderId || !board) return null;
      const o = board.get(plot.orderId);
      return o && !o.complete && !o.cancelled ? o : null;
    },

    /** A pot on the fire, if there is enough raw crop to be worth cooking. */
    _postCookOrder() {
      if (!board) return;
      if (farm.meals >= (cookCfg.stopAtMeals ?? 60)) return;
      if (board.open().some(o => o.meta?.farm === id && o.meta?.kind === 'cook')) return;
      const batch = cookCfg.batch ?? 4;
      const pick = farm._richestFood(batch);
      if (!pick) return;
      board.post(createOrder({
        tag: cookCfg.tag || 'cook',
        stationId: `${id}_pot`,
        name: `Cook ${batch} ${pick.name}`,
        units: cookCfg.units ?? 3,
        priority: 1,
        postedAt: farm.now,
        meta: { farm: id, kind: 'cook', good: pick.good, batch },
      }));
    },

    _richestFood(batch) {
      let best = null;
      for (const crop of crops) {
        if (!crop.food) continue;
        if ((farm.store[crop.good] || 0) < batch) continue;
        if (!best || crop.food > best.food) best = crop;
      }
      return best;
    },

    /** Cash in every finished farm order the board has swept up. */
    _collect() {
      const events = [];
      for (const order of board.finished) {
        if (!order.complete || order.meta?.farm !== id) continue;
        if (farm._applied.has(order.id)) continue;
        farm._applied.add(order.id);
        events.push(...farm.applyOrder(order));
      }
      if (farm._applied.size > 400) farm._applied = new Set([...farm._applied].slice(-200));
      return events;
    },

    /**
     * What a finished order did. Split out so a caller that runs its own board can hand orders in
     * directly, and so the node tests can drive one step at a time.
     */
    applyOrder(order) {
      const events = [];
      const kind = order.meta?.kind;
      if (kind === 'cook') {
        const crop = crops.find(c => c.good === order.meta.good);
        const batch = order.meta.batch ?? 4;
        if (crop && (farm.store[crop.good] || 0) >= batch) {
          farm.store[crop.good] -= batch;
          const meals = Math.round(batch * crop.food * (cookCfg.multiplier ?? 1.6));
          farm.meals += meals;
          events.push({ kind: 'cooked', good: crop.good, meals, by: creditOf(order) });
        }
        return events;
      }

      const plot = farm.plots.find(p => p.id === order.meta?.plotId);
      if (!plot) return events;
      plot.orderId = null;
      plot.lastTendedBy = creditOf(order);

      if (kind === 'harvest' && plot.state === 'ripe') {
        const got = farm.yieldOf(plot);
        farm.store[plot.good] = (farm.store[plot.good] || 0) + got;
        plot.harvests++;
        plot.soil = clamp(plot.soil - (soilCfg.wearPerHarvest || 0), soilCfg.min, soilCfg.max);
        // Stubble, not empty. The hole stays; only what is in it changed. This is the whole reason
        // a farmer can carry on for ever without ever breaking ground.
        plot.state = 'stubble';
        plot.ripeAt = null;
        events.push({ kind: 'harvested', plot: plot.id, good: plot.good, count: got, by: plot.lastTendedBy });
      } else if (kind === 'replant' && plot.state === 'stubble') {
        plot.state = 'growing';
        plot.grown = 0;
        plot.soil = clamp(plot.soil + (soilCfg.restorePerReplant || 0), soilCfg.min, soilCfg.max);
        events.push({ kind: 'replanted', plot: plot.id, crop: plot.crop, by: plot.lastTendedBy });
      }
      return events;
    },

    /** Meals available, counting raw crop at its own food value. */
    foodUnits() {
      let total = farm.meals;
      for (const crop of crops) total += (farm.store[crop.good] || 0) * (crop.food || 0);
      return round2(total);
    },

    /**
     * Eat. Cooked meals first (they were made to be eaten), then raw crop cheapest-first so the
     * gourds are still there next week. Returns how many meals were actually found.
     */
    takeFood(meals = 1) {
      let want = Math.max(0, meals);
      let got = 0;
      const take = Math.min(farm.meals, want);
      farm.meals -= take; want -= take; got += take;
      const order = crops.filter(c => c.food > 0).sort((a, b) => a.food - b.food);
      for (const crop of order) {
        while (want > 0 && (farm.store[crop.good] || 0) > 0) {
          farm.store[crop.good]--;
          // A gourd worth four meals eaten by one hungry person is still a whole gourd gone. The
          // surplus is waste, and that is exactly why cooking and cheap crops are worth having.
          got += Math.min(crop.food, want);
          want -= crop.food;
        }
        if (want <= 0) break;
      }
      return round2(got);
    },

    /** Whole days of food in the store, at this many mouths. For the overview panel and migration. */
    foodDays(mouths = 1, perCitizenPerDay = 2) {
      const need = Math.max(0.001, mouths * perCitizenPerDay);
      return round2(farm.foodUnits() / need);
    },

    /** What the panel draws. */
    report() {
      const byState = { growing: 0, ripe: 0, stubble: 0 };
      for (const p of farm.plots) byState[p.state] = (byState[p.state] || 0) + 1;
      const waiting = board ? board.open().filter(o => o.meta?.farm === id).reduce((s, o) => s + workLeft(o), 0) : 0;
      return {
        plots: farm.plots.length,
        ...byState,
        meals: farm.meals,
        store: { ...farm.store },
        foodUnits: farm.foodUnits(),
        unitsWaiting: round2(waiting),
      };
    },

    toJSON() {
      return { id, now: farm.now, plots: farm.plots, store: farm.store, meals: farm.meals, plotSeq };
    },
  };

  farm.load = data2 => {
    if (!data2) return farm;
    farm.now = data2.now || 0;
    farm.plots = data2.plots || [];
    farm.store = data2.store || {};
    farm.meals = data2.meals || 0;
    plotSeq = data2.plotSeq || farm.plots.length + 1;
    return farm;
  };

  return farm;
}

/** Who to thank on the plot: the name if there was one, otherwise the kind of hands. */
function creditOf(order) {
  const last = order.credits?.[order.credits.length - 1];
  if (!last) return null;
  return last.byName || (last.source === 'player' ? 'your own hands' : last.source === 'machine' ? 'a machine' : 'a worker');
}
