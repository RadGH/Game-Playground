// Farhold — taking ore out of the ground, and getting it home.
//
// BUILDING_EXPANSION §1 and the user's goal for build mode: "set up resources to be mined at a
// location, route between them determines transfer rate."
//
// Three ways a resource moves, and they are deliberately the same three sums:
//
//   1. YOU SWING AT IT. js/resources.js `mine()` gives the ore; you are carrying it, so getting it
//      home costs the walk. `haulReport` already does that arithmetic.
//   2. A DRILL SITS ON IT. `drillRate()` per second, straight into the storage pool the drill is
//      standing in — if it is standing in one.
//   3. IT IS NOT IN A POOL, SO SOMETHING HAS TO CARRY IT. That is a ROUTE, and its rate is
//      `haulThroughput(distance)` from js/stores.js: double the distance and the delivery roughly
//      halves. Same sum as the walk in (1), on purpose — the game should only teach this once.
//
// The point of all three agreeing is the trade-off the user asked for: a rich seam far away and a
// poor one at your feet should be comparable in one number, and they are — ore delivered per second.
//
// No Three.js and no DOM.
//
//   import { createMining } from './mining.js';
//   const mining = createMining({ data, ore, stores, grid, log });
//   mining.bindDrill(entry, node);        // a drill was built on a seam
//   mining.route(fromId, toPoolId);       // lay a haul route
//   mining.tick(dt);                      // run every drill and every route
//   mining.swing(node, seconds, ctx);     // you, with a pick

import { mine, drillRate, haulReport, faceRate } from './resources.js';

export function createMining({ data = {}, ore: oreIn = null, stores = null, grid = null, log = null, bag = null } = {}) {
  const say = (t, k) => { if (log) log(t, k); };
  let ore = oreIn;

  /** entry id -> { entry, nodeId, stock } — a drill and the seam it was built on. */
  const drills = new Map();
  /**
   * Routes, as `{ id, fromId, toPoolId, hauler, carried }`.
   *
   * A route holds no rate of its own: the rate is recomputed from where its ends ARE every tick, so
   * moving a crate or joining two pools with a relay mast changes the throughput without anybody
   * having to remember to tell the route about it. This is the same decision js/work.js made about
   * orders holding no source.
   */
  let routes = [];
  let seq = 0;

  /** What a drill has dug and not yet handed over. Capped, so an unrouted drill eventually stops. */
  const STOCK_CAP = 200;

  function poolAt(x, z) { return stores?.poolAt?.(x, z) || null; }

  /**
   * §1 — a drill on a seam.
   *
   * Refused with a sentence rather than silently: a drill is an expensive thing to put in the wrong
   * place, and "nothing happened" is the worst possible answer to having done so.
   */
  function bindDrill(entry, node) {
    if (!entry) return { ok: false, why: 'No drill there.' };
    if (!node) return { ok: false, why: 'A drill has to stand on a seam. Nothing here to dig.' };
    if (drills.has(entry.id)) return { ok: false, why: 'That drill is already working.' };
    for (const d of drills.values()) {
      if (d.nodeId === node.id) return { ok: false, why: 'Something is already drilling that seam.' };
    }
    drills.set(entry.id, { entry, nodeId: node.id, stock: 0, resource: node.resource });
    return { ok: true, drill: drills.get(entry.id), node };
  }

  function unbindDrill(entryId) { return drills.delete(entryId); }

  /**
   * Lay a route between something that makes ore and somewhere that keeps it.
   *
   * `fromId` is a drill; `toPoolId` is a storage pool. Both ends are looked up fresh every tick, so
   * a route to a pool that is later knocked down simply stops delivering rather than throwing.
   */
  function route(fromId, toPoolId, hauler = 'hand_cart') {
    const drill = drills.get(fromId);
    if (!drill) return { ok: false, why: 'Routes start at a drill.' };
    const pool = stores?.pools?.().find(p => p.id === toPoolId);
    if (!pool) return { ok: false, why: 'No storage there to route to.' };
    if (routes.some(r => r.fromId === fromId)) return { ok: false, why: 'That drill already has a route.' };
    const r = { id: `r${++seq}`, fromId, toPoolId, hauler, carried: 0 };
    routes.push(r);
    const rate = rateOf(r);
    say(`Route laid. ${rate.perMinute.toFixed(1)}/min over ${Math.round(rate.metres)} m.`, 'good');
    return { ok: true, route: r, rate };
  }

  function unroute(id) {
    const before = routes.length;
    routes = routes.filter(r => r.id !== id);
    return routes.length !== before;
  }

  /**
   * THE NUMBER THE USER ASKED FOR: what a route moves, decided by how long it is.
   *
   * If the drill happens to be standing IN the target pool, the trip does not exist and the rate is
   * unlimited — which is the whole argument for relay masts, and why `linkAdvice` says so in
   * metres rather than in advice.
   */
  function rateOf(r) {
    const drill = drills.get(r.fromId);
    const pool = stores?.pools?.().find(p => p.id === r.toPoolId);
    if (!drill || !pool) return { perSecond: 0, perMinute: 0, metres: 0, direct: false, why: 'One end of this route is gone.' };
    const here = poolAt(drill.entry.x, drill.entry.z);
    if (here && here.id === pool.id) {
      return { perSecond: Infinity, perMinute: Infinity, metres: 0, direct: true, why: 'The drill is in the pool. No trip to make.' };
    }
    const metres = Math.hypot(pool.x - drill.entry.x, pool.z - drill.entry.z);
    const haul = stores.haulThroughput(metres, r.hauler);
    return { perSecond: haul.perSecond, perMinute: haul.perMinute, metres, direct: false, hauler: haul.hauler, why: '' };
  }

  /** Everything a panel wants to draw, with no drawing in it. */
  function overview() {
    return [...drills.values()].map(d => {
      const node = ore?.byId(d.nodeId) || null;
      const r = routes.find(x => x.fromId === d.entry.id) || null;
      const rate = r ? rateOf(r) : null;
      const dig = node ? drillRate(node, { data, powered: d.entry.powered ? 1 : 0 }) : 0;
      return {
        id: d.entry.id,
        name: d.entry.name,
        resource: d.resource,
        resourceName: data.materials?.[d.resource]?.name || d.resource,
        seam: node ? node.band : null,
        digPerSecond: +dig.toFixed(3),
        digPerMinute: +(dig * 60).toFixed(1),
        stock: Math.round(d.stock),
        powered: !!d.entry.powered,
        remaining: node ? (node.infinite ? Infinity : node.amount) : 0,
        route: r ? { id: r.id, to: r.toPoolId, perMinute: rate.perMinute, metres: Math.round(rate.metres), direct: rate.direct } : null,
        /**
         * The bottleneck, in one word, which is the only thing anybody actually reads.
         *
         * A drill digging faster than its route can carry is the interesting failure — it looks
         * like it is working, the stock climbs, and nothing arrives. Saying "hauling" is worth more
         * than any number beside it.
         */
        limit: !d.entry.powered ? 'power'
          : !node || node.depleted ? 'seam'
          : !r ? 'no route'
          : d.stock >= STOCK_CAP ? 'hauling'
          : rate && rate.perSecond < dig ? 'hauling'
          : 'digging',
      };
    });
  }

  return {
    bindDrill, unbindDrill, route, unroute, rateOf, overview,
    /** A new world means new seams under the same drills — see main.js's buildPlanet. */
    setOre(next) { ore = next; drills.clear(); routes = []; },
    get drills() { return [...drills.values()]; },
    get routes() { return routes.map(r => ({ ...r, rate: rateOf(r) })); },

    /**
     * You, with a pick. Returns what you got and where it went.
     *
     * The ore goes into the pool you are standing in if there is one, and into your bag if there is
     * not — which is exactly the walk cost, paid by having to carry it, rather than a number
     * subtracted somewhere the player cannot see.
     */
    swing(node, seconds = 1, ctx = {}) {
      if (!node) return { got: 0, why: 'Nothing here to dig.' };
      const out = mine(node, seconds, { data, ...ctx });
      if (out.got > 0) {
        const pool = poolAt(node.x, node.z);
        if (pool) stores.put(pool, node.resource, out.got);
        else bag?.add?.(node.resource, out.got);
        ore?.noteWorked?.(node);
      }
      return { ...out, resource: node.resource, intoPool: !!poolAt(node.x, node.z) };
    },

    /** What this seam is worth from where you are standing — the rich-and-far trade-off, in one number. */
    report(node, origin, ctx = {}) {
      return haulReport(node, { data, origin, stores, ...ctx });
    },
    faceRate: (node, ctx = {}) => faceRate(node, { data, ...ctx }),

    /**
     * Run every drill and every route.
     *
     * Digging and hauling are separate on purpose: a drill fills its own stock, and the route
     * drains it at whatever the distance allows. That is what makes a long route VISIBLE — the
     * stock sits there climbing — instead of silently scaling the drill down.
     */
    tick(dt) {
      if (dt <= 0) return;
      for (const d of drills.values()) {
        const node = ore?.byId(d.nodeId);
        if (!node) continue;
        if (!d.entry.powered) continue;
        if (d.stock >= STOCK_CAP) continue;
        const out = mine(node, dt, { data, drill: true, rate: drillRate(node, { data, powered: 1 }) });
        if (out.got > 0) { d.stock += out.got; ore?.noteWorked?.(node); }
      }
      for (const r of routes) {
        const d = drills.get(r.fromId);
        if (!d || d.stock <= 0) continue;
        const pool = stores?.pools?.().find(p => p.id === r.toPoolId);
        if (!pool) continue;
        const rate = rateOf(r);
        const moved = Math.min(d.stock, rate.direct ? d.stock : rate.perSecond * dt);
        if (moved <= 0) continue;
        const fitted = stores.put(pool, d.resource, moved);
        d.stock -= fitted;
        r.carried += fitted;
      }
    },

    toJSON() {
      return {
        drills: [...drills.values()].map(d => ({ id: d.entry.id, nodeId: d.nodeId, stock: d.stock, resource: d.resource })),
        routes: routes.map(r => ({ ...r })),
        seq,
      };
    },
    /** `entryOf` turns a saved drill id back into the live build entry — main.js owns those. */
    load(json, entryOf) {
      drills.clear();
      for (const d of json?.drills || []) {
        const entry = entryOf ? entryOf(d.id) : null;
        if (entry) drills.set(d.id, { entry, nodeId: d.nodeId, stock: d.stock || 0, resource: d.resource });
      }
      routes = (json?.routes || []).filter(r => drills.has(r.fromId)).map(r => ({ ...r }));
      seq = json?.seq || routes.length;
    },
  };
}
