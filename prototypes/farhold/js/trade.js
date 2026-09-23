// Farhold — what a thing is worth somewhere else, and the cart that takes it there.
//
// PURE JavaScript: no DOM, no Three.js, no clock of its own. Everything here is arithmetic over
// data, which is what lets `node --test` run a four-kilometre round trip in a millisecond.
//
//   import { installTradeGoods, createTrade } from './trade.js';
//   installTradeGoods(resourceData, refiningData, tradeGoodsData);   // once, at boot
//   const trade = createTrade({ goods, data: colonyJson, seed });
//   trade.priceAt('ingot_bundle', ironmoor, day);
//   const plan = trade.plan({ from: ironmoor, to: greenhollow, carrier: 'hand_cart', manifest: { ingot_bundle: 11 } });
//   trade.open(plan);
//
// THE PITCH (§7). Ore goes to a town, a person who lives there smelts it, what comes out is worth
// more somewhere else, and a cart takes it there while you are asleep. Farhold already had every
// piece of that except a PRICE: js/caravans.js is already a caravan — a vehicle, some guards and a
// manifest travelling a real polyline between real settlements, with four states you can meet it in
// — and it has never carried anything of the player's.
//
// TWO LINES OF POLICY CARRY THE WHOLE ECONOMY (§7.3):
//   * a place never both needs and makes the same tag — `makes` wins;
//   * `need` is capped at two tags, so no town wants everything.
//
// AND ONE CLAMP. The whole spread a player can ever see on one good is about 3.4× (0.55 to 1.85 of
// base) — enough to be worth a cart, never enough to be a slot machine. The wobble moves on a
// six-day step, so a price board is worth re-reading about once a week and never mid-run.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const clamp01 = n => clamp(n, 0, 1);
const round2 = n => Math.round(n * 100) / 100;

/** The same small stable hash the perk lattice, the territory records and the colony all use. */
export function hash(...parts) {
  let h = 2166136261 >>> 0;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  }
  return h >>> 0;
}

/** The eight tags, and no more. A demand model with twenty axes is unreadable. */
export const TRADE_TAGS = ['food', 'cloth', 'metal', 'building', 'tools', 'light', 'chemical', 'fine'];

/**
 * WHAT A PLOT MAKES, IN TAGS.
 *
 * Every settlement in Farhold already carries the `want` list its own town plan gave it
 * (proctown's `WANT_ORDER`), so what a place produces is knowable without one line of authored
 * per-settlement data. That is the whole reason this model is affordable.
 */
export const PLOT_MAKES = {
  forge: ['metal', 'tools'], smithy: ['metal', 'tools'],
  mill: ['food'], granary: ['food'], farm: ['food'], bakery: ['food'],
  tannery: ['cloth'], loom: ['cloth'], weaver: ['cloth'],
  quarry: ['building'], mason: ['building'], sawmill: ['building'],
  chapel: ['fine'], shrine: ['fine'], jeweller: ['fine'],
  alchemist: ['chemical'], apothecary: ['chemical'],
  chandler: ['light'],
};

/** What a culture is good at, and what it never bothers with. */
export const CULTURE_TRADE = {
  dwarf: { makes: ['metal', 'building'], needs: ['food', 'cloth'] },
  elf: { makes: ['fine', 'cloth'], needs: ['metal', 'tools'] },
  human: { makes: ['food'], needs: ['tools', 'fine'] },
  halfling: { makes: ['food', 'cloth'], needs: ['metal', 'tools'] },
  orc: { makes: [], needs: ['metal', 'food'] },
  undead: { makes: ['chemical'], needs: ['cloth', 'light'] },
  desert: { makes: ['fine'], needs: ['food', 'building'] },
};

/** What the ground itself is short of. A desert wants food; the tundra wants light and cloth. */
export const BIOME_NEEDS = {
  desert: ['food'], badlands: ['food'], ashPlain: ['food', 'building'],
  tundra: ['light', 'cloth'], ice: ['light', 'cloth'], snowyPeaks: ['light', 'food'], seaIce: ['light', 'food'],
  volcanic: ['food', 'building'], glimmerwaste: ['food'], veiledHills: ['food'],
  marsh: ['building', 'chemical'], savanna: ['tools'], grassland: ['tools'],
  coast: ['metal'], beach: ['metal'], lake: ['metal'],
  temperateForest: ['metal'], rainforest: ['tools'], hills: ['cloth'], mountains: ['food', 'cloth'],
};

/**
 * INJECT THE GOODS, NEVER WRITE THEM INTO THE FILE.
 *
 * `data/resources.json` is read by the scanner, the seam generator and the store-share caps, and
 * twenty-two manufactured goods have no business in any of them; `data/refining.json` is the
 * machine engine's own file and it already queues, starves, unlocks-by-doing, slices and catches up
 * — so a second recipe engine for trade goods would be a join nobody made. The two are stitched
 * here, at boot, in memory.
 *
 * This is the rule `data/items.json` taught when it turned out to be shared with Emberveil: a
 * shared data file is never edited in place. It applies here for the same reason.
 *
 * Safe to run more than once — the second call adds no duplicate recipe.
 */
export function installTradeGoods(resources, refining, tradegoods) {
  const goods = tradegoods?.goods || [];
  if (!resources || !refining) return { materials: 0, recipes: 0 };
  resources.materials ||= {};
  refining.recipes ||= [];
  const have = new Set(refining.recipes.map(r => r.id));
  let mats = 0, recs = 0;
  for (const g of goods) {
    if (!resources.materials[g.id]) {
      resources.materials[g.id] = {
        name: g.name,
        // `kind: 'trade'` is what keeps a finished good out of the raw-share caps in js/stores.js
        // and out of a silo: `RAW` does not list it and `accepts` will not take it in a bulk store.
        kind: 'trade', tier: g.tier || 1,
        weight: g.weight, value: g.base, stack: g.stack || 10,
        colour: '#b08a52', desc: g.desc,
      };
      mats++;
    }
    const id = `make_${g.id}`;
    if (have.has(id)) continue;
    refining.recipes.push({
      id, machine: g.machine, name: g.name, time: g.time,
      inputs: { ...g.inputs }, outputs: { [g.id]: 1 },
      unlock: g.unlock || null, trade: true, desc: g.desc,
    });
    have.add(id);
    recs++;
  }
  return { materials: mats, recipes: recs };
}

/**
 * `powerAt(place)` answers "how many kW are spare on the grid at this place", or null when there is
 * no grid there and null when the caller has not supplied one at all. See `powerNeed` below.
 */
export function createTrade({ goods = [], data = null, seed = 1, caravans = null, territory = null, standings = null, powerAt = null } = {}) {
  const GOODS = Array.isArray(goods) ? goods : (goods?.goods || []);
  const BY_ID = new Map(GOODS.map(g => [g.id, g]));
  const T = data?.trade || {};
  const CARRIERS = data?.carriers || [];
  const NEED_W = T.needWeight ?? 0.45;
  const MAKE_W = T.makesWeight ?? 0.35;
  const DRIFT_W = T.driftWeight ?? 0.18;
  const DRIFT_DAYS = T.driftDays ?? 6;
  const LO = T.clamp?.[0] ?? 0.55;
  const HI = T.clamp?.[1] ?? 1.85;
  const SPREAD = T.spread ?? 0.05;
  const SWING = T.standingSwing ?? 0.08;
  const ROAD = T.roadBonus ?? 0.6;
  const MAX_NEEDS = T.maxNeeds ?? 2;

  const carrierOf = key => CARRIERS.find(c => c.key === key) || CARRIERS[0] || { key: 'porter', name: 'Porter', hold: 40, speed: 2.6, upkeep: 6, guardsMax: 0 };

  /** Your open routes, by id. */
  const routes = new Map();
  let seq = 1;
  /** Gold turned over here, ever — the Factor's move-in condition reads it (§5.1). */
  let turnover = 0;

  // ------------------------------------------------------------------ what a place is

  const profiles = new Map();

  /**
   * What this settlement makes and what it is short of, worked out from what it already is.
   *
   * No authored data per settlement anywhere: the plots come from its own town plan, the biome and
   * the size come from the world node, the culture comes from its race, and a zone the faction
   * layer says is short gets `food` pushed up. A besieged town paying over the odds for grain is
   * the faction layer finally doing something to a price.
   */
  function profileFor(place) {
    if (!place) return { makes: [], needs: [] };
    const key = place.id ?? place.name ?? 'nowhere';
    if (profiles.has(key)) return profiles.get(key);

    const makes = new Set();
    for (const want of place.plots || place.wants || []) {
      for (const tag of PLOT_MAKES[want] || []) makes.add(tag);
    }
    const culture = CULTURE_TRADE[place.culture || place.race] || CULTURE_TRADE.human;
    for (const tag of culture.makes) makes.add(tag);

    const wants = [];
    const push = tag => { if (tag && !makes.has(tag) && !wants.includes(tag)) wants.push(tag); };
    // the ground first — it is the least arbitrary of the four
    for (const tag of BIOME_NEEDS[place.biome] || []) push(tag);
    const size = place.size ?? 2;
    if (size >= 4) { push('fine'); push('chemical'); }
    if (size <= 1) { push('tools'); }
    for (const tag of culture.needs) push(tag);
    if (place.short || territory?.of?.(place.zoneId)?.incidents?.some?.(i => i.kind === 'hunger')) {
      wants.unshift('food');
    }
    // a city never wants the cheap things and a hamlet never wants the dear ones
    const filtered = wants.filter(t => (size >= 4 ? true : t !== 'fine'));
    const out = { makes: [...makes], needs: filtered.slice(0, MAX_NEEDS) };
    profiles.set(key, out);
    return out;
  }

  /** −1..1, on a six-day step, stable for a place and a good. */
  function driftFor(place, goodId, day = 1) {
    const step = Math.floor((day || 1) / DRIFT_DAYS);
    return (hash(seed, place?.id ?? place?.name ?? '', goodId, step) / 4294967296) * 2 - 1;
  }

  /**
   * priceAt = base × clamp(1 + 0.45·need − 0.35·makes + 0.18·drift, 0.55, 1.85)
   *
   * `need` and `makes` are the SHARE of the good's tags this place wants or produces, so a good
   * tagged both `metal` and `building` sold into a town that needs metal and makes neither reads
   * half a need rather than a whole one. That is what stops a two-tag good being worth more than a
   * one-tag good for no reason a player could ever see.
   */
  function multiplierAt(goodId, place, day = 1) {
    const g = BY_ID.get(goodId);
    if (!g) return 1;
    const prof = profileFor(place);
    const tags = g.tags || [];
    const share = (list) => (tags.length ? tags.filter(t => list.includes(t)).length / tags.length : 0);
    const need = share(prof.needs);
    const makes = share(prof.makes);
    const drift = driftFor(place, goodId, day);
    return clamp(1 + NEED_W * need - MAKE_W * makes + DRIFT_W * drift, LO, HI);
  }

  function priceAt(goodId, place, day = 1) {
    const g = BY_ID.get(goodId);
    if (!g) return 0;
    return Math.round(g.base * multiplierAt(goodId, place, day));
  }

  /**
   * What you actually pay and what you actually get.
   *
   * The Factor's cut is 5% each way and your standing with whoever holds the place moves it ±8%. A
   * place with no Factor and no market — a hamlet, your own outpost — trades at base flat with a
   * 12% cut, which is the "a wandering merchant will take it off your hands" price and is
   * deliberately poor.
   */
  function youPay(goodId, place, { day = 1, standing = 0 } = {}) {
    if (!place?.market) return Math.round((BY_ID.get(goodId)?.base || 0) * (1 + (T.noMarketCut ?? 0.12)));
    return Math.round(priceAt(goodId, place, day) * (1 + SPREAD) * (1 - SWING * clamp01(standing)));
  }

  function youGet(goodId, place, { day = 1, standing = 0 } = {}) {
    if (!place?.market) return Math.round((BY_ID.get(goodId)?.base || 0) * (1 - (T.noMarketCut ?? 0.12)));
    return Math.round(priceAt(goodId, place, day) * (1 - SPREAD) * (1 + SWING * clamp01(standing)));
  }

  /** The price board for everywhere you have been. */
  function markets(places = [], day = 1) {
    return places.map(p => ({
      id: p.id, name: p.name, size: p.size ?? 2, market: !!p.market,
      ...profileFor(p),
      rows: GOODS.map(g => ({
        id: g.id, name: g.name, weight: g.weight, base: g.base,
        price: priceAt(g.id, p, day),
        buy: youPay(g.id, p, { day }),
        sell: youGet(g.id, p, { day }),
        multiplier: round2(multiplierAt(g.id, p, day)),
      })).sort((a, b) => b.multiplier - a.multiplier),
    }));
  }

  /** One good, one pair of places: is this run worth making? */
  function quote({ good, from, to, n = 1, day = 1, standing = 0 } = {}) {
    const g = BY_ID.get(good);
    if (!g) return { ok: false, why: 'There is no such thing.' };
    const buy = youPay(good, from, { day, standing });
    const sell = youGet(good, to, { day, standing });
    const kg = round2(g.weight * n);
    return {
      ok: true, good, name: g.name, n, kg,
      buy, sell, each: sell - buy,
      gross: (sell - buy) * n,
      perKg: kg > 0 ? round2(((sell - buy) * n) / kg) : 0,
    };
  }

  // ------------------------------------------------------------------ the road

  /**
   * How long the trip takes.
   *
   *   hours = metres / (speed × (1 + 0.6 × roadShare)) / 3600
   *
   * `roadShare` is how much of the route runs on a made surface, and it applies to a road YOU laid
   * with the Road tool exactly as it applies to a world road, because `terrain.roadAt` does not
   * care who painted it. A player who lays road between their outpost and the nearest town cuts the
   * trip by up to 37%, for a few cut stone a metre. This is the road payoff the user asked for.
   */
  function hoursFor(metres, carrier, roadShare = 0) {
    const c = typeof carrier === 'string' ? carrierOf(carrier) : carrier;
    const speed = (c.speed || 2.6) * (1 + ROAD * clamp01(roadShare));
    return (metres || 0) / speed / 3600;
  }

  /**
   * AMBUSH IS A ROLL NOW, NOT A CERTAINTY.
   *
   * js/caravans.js ambushed EVERY unescorted caravan, unconditionally. That is right for flavour
   * and wrong as a rule the player is betting money on, so it becomes a chance made once at
   * dispatch:
   *
   *   0.34 × danger × (1 − 0.18 × guards) × (1 − 0.25 × escorted), floored at 3% and capped at 70%
   *
   * A hand cart with two guards through a quiet zone is 7.6%. Through a contested one with none it
   * is 31%. Losing a full wagon is 620 kg of goods and it should hurt, which is why the wagon takes
   * four guards and why the drone — faster than anything that wants to rob it — takes none.
   */
  function ambushChance({ danger = 0.35, guards = 0, escorted = false } = {}) {
    const A = T.ambush || {};
    const cut = (data?.guard?.routeGuardAmbushCut ?? 0.18);
    const raw = (A.base ?? 0.34) * clamp01(danger)
      * (1 - cut * guards)
      * (1 - (A.escortCut ?? 0.25) * (escorted ? 1 : 0));
    return round2(clamp(raw, A.floor ?? 0.03, A.ceiling ?? 0.7));
  }

  /** Plan a run. Nothing is spent and nothing leaves until `open` is called on it. */
  function plan({ from, to, carrier = 'hand_cart', manifest = {}, guards = 0, metres = null, roadShare = 0, day = 1, standing = 0, danger = 0.35, repeat = false } = {}) {
    const c = carrierOf(carrier);
    if (!from || !to) return { ok: false, why: 'A route needs two ends.' };
    if (from.id === to.id) return { ok: false, why: 'That is the same place.' };
    const dist = metres != null ? metres : Math.hypot((to.x || 0) - (from.x || 0), (to.z || 0) - (from.z || 0));
    let kg = 0, cost = 0, revenue = 0;
    const rows = [];
    for (const [good, n] of Object.entries(manifest)) {
      const g = BY_ID.get(good);
      if (!g || n <= 0) continue;
      const q = quote({ good, from, to, n, day, standing });
      kg += g.weight * n; cost += q.buy * n; revenue += q.sell * n;
      rows.push(q);
    }
    if (!rows.length) return { ok: false, why: 'The cart is empty.' };
    if (kg > c.hold + 1e-9) {
      return { ok: false, why: `That is ${Math.round(kg)} kg and a ${c.name.toLowerCase()} carries ${c.hold}.`, kg, hold: c.hold };
    }
    /**
     * R19 — `powerAtOrigin`, WHICH data/colony.json HAS STATED SINCE THE HAULER DRONE LANDED.
     *
     * The drone's row is the only carrier with `upkeep: 0`, and its own blurb says why — "it dies
     * with the grid". It costs power instead of money: 12 kW drawn at the END IT LEAVES FROM, which
     * is the distinction that makes it interesting, because the far end of a route is usually
     * somebody else's town with no grid of yours in it at all. None of that was read. A Hauler
     * Drone was simply the fastest carrier in the game, free to run, with no condition on it.
     *
     * `powerAt` is optional: with no grid wired in (a node test, the away catch-up, a save being
     * replayed) the check is skipped rather than refusing every route, because a drone that cannot
     * be dispatched at all is worse than one that is not yet gated.
     */
    const need = c.powerAtOrigin || 0;
    const spare = need > 0 && powerAt ? powerAt(from) : null;
    if (need > 0 && spare != null && spare < need) {
      return {
        ok: false,
        kg: round2(kg), hold: c.hold,
        why: spare <= 0
          ? `A ${c.name.toLowerCase()} runs on the grid and there is no power at ${from.name}.`
          : `A ${c.name.toLowerCase()} draws ${need} kW and ${from.name} has ${Math.round(spare)} spare.`,
        needsPower: need, sparePower: Math.round(spare),
      };
    }

    const g = Math.max(0, Math.min(guards, c.guardsMax || 0));
    const guardGold = g * (data?.guard?.routeGuardGold ?? 10);
    const upkeep = (c.upkeep || 0) + guardGold;
    const hours = hoursFor(dist, c, roadShare);
    return {
      ok: true,
      fromId: from.id, fromName: from.name, toId: to.id, toName: to.name,
      // the origin's position rides on the plan so `tick` can ask the grid about it later —
      // without it `powerAt` got a place with no x/z, answered null, and nothing ever grounded
      fromX: from.x ?? null, fromZ: from.z ?? null,
      carrier: c.key, carrierName: c.name,
      manifest: { ...manifest }, rows,
      kg: round2(kg), hold: c.hold,
      guards: g, guardsMax: c.guardsMax || 0,
      metres: Math.round(dist), roadShare: round2(roadShare),
      hours: round2(hours), seconds: Math.round(hours * 3600),
      upkeep, cost, revenue,
      profit: revenue - cost - upkeep,
      risk: ambushChance({ danger, guards: g }),
      repeat: !!repeat,
      /** kW this carrier draws at the end it leaves from — 0 for everything but the drone. */
      needsPower: need,
      why: null,
    };
  }

  /**
   * Send it. The goods leave now and the gold arrives when it arrives.
   *
   * `take(good, n)` is the caller's hand into whatever is holding the manifest — a Trade Post, or
   * the hold on your back. It returns how many it actually found, and a route that could not be
   * filled is refused rather than half-loaded.
   */
  function open(p, { take = null, gold = Infinity, at = 0, rng = Math.random } = {}) {
    if (!p?.ok) return { ok: false, why: p?.why || 'There is no plan.' };
    if (gold < p.upkeep) return { ok: false, why: `The trip costs ${p.upkeep} gold in upkeep and you have ${Math.floor(gold)}.` };
    const loaded = {};
    if (take) {
      for (const [good, n] of Object.entries(p.manifest)) {
        const got = take(good, n);
        if (got < n) {
          // put back whatever we already lifted rather than sending a half cart
          return { ok: false, why: `There is not enough ${BY_ID.get(good)?.name?.toLowerCase() || good} at ${p.fromName}.`, loaded };
        }
        loaded[good] = got;
      }
    } else Object.assign(loaded, p.manifest);

    const row = {
      id: `rt${seq++}`,
      ...p, manifest: loaded,
      state: 'travelling',
      openedAt: at, left: p.seconds, elapsed: 0,
      ambushed: false,
      robbed: rng() < p.risk,          // decided once, at dispatch — never re-rolled on the road
      paid: 0,
      ledger: [],
    };
    routes.set(row.id, row);
    if (caravans?.dispatch && p.zone && p.route) {
      row.caravan = caravans.dispatch(p.zone, p.route, { cargo: null, escorted: p.guards > 0 })?.id || null;
    }
    return { ok: true, route: row, spent: p.upkeep };
  }

  /**
   * Move every route on. Returns whatever arrived, went missing, or set off again.
   *
   * One clock for every route, ticked by the game loop AND by the away catch-up, so a cart on the
   * road when you leave the planet is a cart that is further along when you come back.
   */
  function tick(seconds = 0, { day = 1, rng = Math.random } = {}) {
    const out = { arrived: [], lost: [], repeated: [], grounded: [], flying: [] };
    for (const r of routes.values()) {
      if (r.state !== 'travelling') continue;
      /**
       * R19 — "IT DIES WITH THE GRID", which is the second half of `powerAtOrigin`.
       *
       * A drone that needed the grid to set off needs it to keep going, so a brownout at home
       * lands it where it stands and it goes on when the power comes back. It LANDS rather than
       * being lost: losing a full hold to a cloudy afternoon is a reload, not a lesson, and the
       * player has no warning a route is about to strand. Nothing else in the carrier table has a
       * `powerAtOrigin`, so nothing else is affected by any of this.
       */
      if (r.needsPower > 0 && powerAt) {
        const spare = powerAt({ id: r.fromId, name: r.fromName, x: r.fromX, z: r.fromZ });
        const down = spare != null && spare < r.needsPower;
        if (down && !r.grounded) {
          r.grounded = true;
          r.line = `${r.carrierName} set down short of ${r.toName}: no power at ${r.fromName}.`;
          out.grounded.push(r);
        } else if (!down && r.grounded) {
          r.grounded = false;
          r.line = `${r.carrierName} is up again and on its way to ${r.toName}.`;
          out.flying.push(r);
        }
        if (r.grounded) continue;         // the clock stops too — it is not travelling
      }
      r.elapsed += seconds;
      r.left = Math.max(0, r.left - seconds);
      if (r.robbed && !r.ambushed && r.elapsed >= r.seconds * 0.65) {
        r.ambushed = true;
        /**
         * GUARDS GET ONE ROLL AGAINST THE RAIDERS.
         *
         *   survive = guards / (guards + 2)
         *
         * So two guards save a cart half the time and four save a wagon two-thirds of the time. A
         * guard is never a guarantee, which is what keeps the wagon a real decision rather than a
         * tax you pay and stop thinking about.
         */
        const survive = r.guards / (r.guards + 2);
        if (rng() < survive) { r.robbed = false; r.ledger.push('The guards saw them off.'); }
        else {
          r.state = 'lost';
          r.line = `${r.carrierName} was taken on the ${r.toName} road. The load is gone.`;
          out.lost.push(r);
          continue;
        }
      }
      if (r.left <= 1e-6) {
        r.state = 'arrived';
        r.paid = r.revenue;
        turnover += r.revenue;
        r.line = `${r.carrierName} reached ${r.toName}. ${r.revenue} gold, less ${r.upkeep} upkeep.`;
        out.arrived.push(r);
      }
    }
    return out;
  }

  /** Take the money. An arrived route pays exactly what `quote` said it would. */
  function collect(id) {
    const r = routes.get(id);
    if (!r) return { ok: false, why: 'No such route.' };
    if (r.state === 'lost') { routes.delete(id); return { ok: true, gold: 0, lost: true, line: r.line }; }
    if (r.state !== 'arrived') return { ok: false, why: 'It is still on the road.' };
    routes.delete(id);
    return { ok: true, gold: r.paid, route: r, line: r.line };
  }

  function close(id) { const r = routes.get(id); routes.delete(id); return r || null; }

  /**
   * A STANDING ROUTE NEVER SPENDS GOLD YOU DO NOT HAVE AND NEVER REPORTS A LOSS SILENTLY.
   *
   * It re-dispatches on arrival as long as the manifest still clears at a profit, and it stops
   * itself and SAYS WHY when it does not: the price at the far end fell under the cost at the
   * origin plus upkeep, the origin is empty and nothing is making more, the carrier was robbed, or
   * the grid at the origin cannot carry a drone.
   */
  function restand(r, { from, to, day = 1, standing = 0, take = null, gold = Infinity, rng = Math.random, at = 0 } = {}) {
    if (!r?.repeat) return { ok: false, why: 'That route was a one-off.' };
    const next = plan({
      from, to, carrier: r.carrier, manifest: r.manifest, guards: r.guards,
      metres: r.metres, roadShare: r.roadShare, day, standing, repeat: true,
    });
    if (!next.ok) return { ok: false, why: next.why, stopped: true };
    if (next.profit <= 0) {
      const worst = next.rows.slice().sort((a, b) => a.gross - b.gross)[0];
      return { ok: false, stopped: true, why: `${worst?.name || 'The load'} no longer covers the trip at ${to.name}. The run has stopped.` };
    }
    return open(next, { take, gold, at, rng });
  }

  return {
    // §6.3
    goods: GOODS,
    good: id => BY_ID.get(id) || null,
    // §7.2–7.3
    profileFor, priceAt, multiplierAt, youPay, youGet, markets, quote, driftFor,
    // §7.5–7.7
    carriers: CARRIERS, carrierOf, hoursFor, ambushChance, plan, open, tick, collect, close, restand,
    list: () => [...routes.values()],
    get(id) { return routes.get(id) || null; },
    get turnover() { return turnover; },
    addTurnover(n) { turnover += Math.max(0, n); return turnover; },
    toJSON() { return { v: 1, turnover, routes: [...routes.values()], seq }; },
    loadJSON(json) {
      routes.clear();
      for (const r of json?.routes || []) routes.set(r.id, r);
      turnover = json?.turnover || 0;
      seq = json?.seq || routes.size + 1;
      return routes.size;
    },
  };
}
