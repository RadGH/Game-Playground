// Farhold — storage pools, and why distance costs you something.
//
// BUILDING_EXPANSION §8.1–8.3. The idea is lifted wholesale from `prototypes/frontier-foundry`
// (`js/production.js` `recomputeLinks`/`pull`/`push`), because it is the right one and writing it
// twice would be daft: **stores whose reach overlaps form one pool, and everything in a pool is
// shared for free.** A machine standing inside a pool draws from and delivers to every store in it
// without anybody carrying anything. Anything outside every pool needs a cart, a mule or a drone,
// and the round trip is a real cost you can read off a number.
//
// That is the mechanism behind the whole §1 node trade-off. A mother lode across the valley is only
// worth what it looks like if you are willing to move the pool out to it — plant a logistics pole,
// drop a crate, and the walk goes away. Until then the walk is the price of the richness.
//
//   import { createStoreNetwork } from './stores.js';
//   const net = createStoreNetwork({ power, materials });
//   net.add({ id: 'crate1', type: 'storage_crate', x: 0, z: 0 });
//   net.add({ id: 'pole1',  type: 'logistics_pole', x: 18, z: 0 });
//   net.shares('crate1', 'crate2');          // one pool, or two?
//   net.put(net.poolAt(0, 0), 'iron_ore', 30);
//
// Pure: no DOM, no Three.js, no timers. The base overview panel in the HUD only draws what
// `overview()` says.

/** Straight-line distance on the ground. Farhold is a sphere, but a base is not. */
export const dist2d = (a, b) => Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0));

/**
 * How far two stores reach towards each other. Either one's radius will do — a big relay mast
 * pulls a plain crate into the pool without the crate needing a radius of its own.
 */
export const reachBetween = (a, b) => Math.max(a.linkRadius || 0, b.linkRadius || 0);

/**
 * One store, one pole, or one machine's own buffer. `cap` 0 with a `linkRadius` is a relay: it holds
 * nothing and joins everything, which is exactly what a logistics pole is.
 */
export class Store {
  constructor({ id, type = 'storage_crate', name = '', x = 0, z = 0, cap = 0, linkRadius = 0, accepts = null, inv = {} }) {
    this.id = id;
    this.type = type;
    this.name = name || type;
    this.x = x; this.z = z;
    this.cap = cap;
    this.linkRadius = linkRadius;
    this.accepts = accepts;          // null = anything solid; ['fluid'], ['gas'], ['bulk']
    this.inv = { ...inv };
    this.pool = -1;
  }
  get load() { let n = 0; for (const k in this.inv) n += this.inv[k]; return n; }
  get free() { return Math.max(0, this.cap - this.load); }
  get isRelay() { return this.cap <= 0 && this.linkRadius > 0; }
  toJSON() { return { id: this.id, type: this.type, name: this.name, x: this.x, z: this.z, cap: this.cap, linkRadius: this.linkRadius, accepts: this.accepts, inv: { ...this.inv } }; }
}

/**
 * The store network.
 *
 * `power` is data/power.json (for the storage and pole tables and the share caps); `materials` is
 * data/resources.json's `materials` block, because whether a crate will take a thing depends on
 * what kind of thing it is.
 */
export function createStoreNetwork({ power = {}, materials = {} } = {}) {
  const STORAGE = power.storage || {};
  const POLES = power.poles || {};
  const SHARE = power.storeShare || { perResource: 0.25, rawTotal: 0.5, rawKinds: [] };
  const RAW = new Set(SHARE.rawKinds || []);
  const HAULERS = power.haulers || {};

  const stores = new Map();
  let pools = [];                    // [{ id, members: [Store], totals: {} }]
  let dirty = true;

  /** The defaults for a type, whether it is a store, a pole, or something a caller invented. */
  function defFor(type) {
    return STORAGE[type] || POLES[type] || null;
  }

  function add(spec) {
    const def = defFor(spec.type) || {};
    const s = spec instanceof Store ? spec : new Store({
      ...spec,
      name: spec.name || def.name || spec.type,
      cap: spec.cap ?? def.cap ?? 0,
      linkRadius: spec.linkRadius ?? def.linkRadius ?? 0,
      accepts: spec.accepts ?? def.accepts ?? null,
    });
    stores.set(s.id, s);
    dirty = true;
    return s;
  }
  function remove(id) { const had = stores.delete(id); dirty = true; return had; }
  function get(id) { return stores.get(id) || null; }

  /**
   * Rebuild the pools: union-find over every pair of stores whose reach overlaps, the same shape as
   * Frontier Foundry's `recomputeLinks`. A base of forty crates is nothing to walk twice, so there
   * is no cleverness here beyond marking it dirty and only doing it when something moved.
   */
  function rebuild() {
    const list = [...stores.values()];
    const parent = new Map(list.map(s => [s.id, s.id]));
    const find = a => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const r = reachBetween(list[i], list[j]);
        if (r <= 0) continue;
        if (dist2d(list[i], list[j]) <= r) {
          const ra = find(list[i].id), rb = find(list[j].id);
          if (ra !== rb) parent.set(ra, rb);
        }
      }
    }
    const byRoot = new Map();
    for (const s of list) {
      const root = find(s.id);
      s.pool = root;
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root).push(s);
    }
    pools = [...byRoot.entries()].map(([id, members]) => makePool(id, members));
    dirty = false;
    return pools;
  }

  function makePool(id, members) {
    const totals = Object.create(null);
    let cap = 0;
    for (const s of members) { cap += s.cap; for (const k in s.inv) totals[k] = (totals[k] || 0) + s.inv[k]; }
    const cx = members.reduce((a, s) => a + s.x, 0) / members.length;
    const cz = members.reduce((a, s) => a + s.z, 0) / members.length;
    return { id, members, totals, cap, x: cx, z: cz, name: members.find(s => !s.isRelay)?.name || members[0].name };
  }

  const all = () => { if (dirty) rebuild(); return pools; };
  const poolOf = id => { const s = get(id); if (!s) return null; all(); return pools.find(p => p.id === s.pool) || null; };

  /**
   * The pool that reaches a point — a machine, a node, a player standing somewhere.
   *
   * This is the one call the rest of the game makes most: "if I mine here, does it go straight into
   * the pile, or am I carrying it?" Nearest overlapping pool wins; null means you are carrying it.
   */
  function poolAt(x, z) {
    let best = null, bestD = Infinity;
    for (const p of all()) {
      for (const s of p.members) {
        const d = Math.hypot(s.x - x, s.z - z) - (s.linkRadius || 0);
        if (d <= 0 && d < bestD) { bestD = d; best = p; }
      }
    }
    return best;
  }

  /** Are these two in the same pool? The whole §8.1 rule, as one question. */
  function shares(aId, bId) {
    const a = get(aId), b = get(bId);
    if (!a || !b) return false;
    all();
    return a.pool === b.pool;
  }

  const kindOf = res => materials[res]?.kind || 'refined';

  /**
   * Will this store take that at all?
   *
   * A crate is not fussy about solids but it cannot hold water — pour a fluid into a wooden box and
   * you have a wet box. A silo is bulk only, a tank is fluid only, a gas tank is the only thing a
   * vent collector can deliver into at all.
   */
  const FLUIDS = new Set(['acid', 'coolant', 'lye', 'lift_fuel']);
  function accepts(store, res) {
    if (store.cap <= 0) return false;
    const kind = kindOf(res);
    const isFluid = kind === 'fluid' || FLUIDS.has(res);
    const list = store.accepts;
    if (!list || !list.length) return !isFluid && kind !== 'gas';
    if (list.includes('bulk')) return ['ore', 'stone', 'wood'].includes(kind) || res === 'coal' || res === 'gravel';
    if (list.includes('fluid')) return isFluid;
    if (list.includes('gas')) return kind === 'gas';
    return list.includes(kind);
  }

  /**
   * How much MORE of one thing this store will take.
   *
   * The caps are Frontier Foundry's and they exist because of a deadlock, not a design: without
   * them three drills fill every crate with ore, the smelters have nowhere to put their ingots, and
   * the base jams on eight iron it can no longer make. A silo or a tank holds one kind of thing
   * anyway, so the caps do not apply to them.
   */
  function roomFor(store, res) {
    if (!accepts(store, res)) return 0;
    const free = store.free;
    const single = store.accepts && store.accepts.length === 1;
    if (single || !RAW.has(kindOf(res))) return free;
    let rawLoad = 0;
    for (const k in store.inv) if (RAW.has(kindOf(k))) rawLoad += store.inv[k];
    return Math.max(0, Math.min(
      free,
      store.cap * (SHARE.rawTotal ?? 0.5) - rawLoad,
      store.cap * (SHARE.perResource ?? 0.25) - (store.inv[res] || 0),
    ));
  }

  /** Accept a pool object, a pool id, or the id of any store in one. */
  const asPool = p => {
    if (!p) return null;
    if (typeof p !== 'string') return p;
    all();
    return pools.find(x => x.id === p) || poolOf(p);
  };

  /** How much of a thing the pool can see. */
  function count(pool, res) {
    const p = asPool(pool);
    if (!p) return 0;
    all();
    return p.totals[res] || 0;
  }

  /** Put goods in. Returns how many actually fitted — the rest is still in your arms. */
  function put(pool, res, n) {
    const p = asPool(pool);
    if (!p || n <= 0) return 0;
    let left = n;
    // fullest-first would silt the big silo up; emptiest-first spreads a delivery sensibly
    const targets = p.members.filter(s => s.cap > 0).sort((a, b) => b.free - a.free);
    for (const s of targets) {
      if (left <= 0) break;
      const k = Math.min(left, roomFor(s, res));
      if (k > 0) { s.inv[res] = (s.inv[res] || 0) + k; left -= k; }
    }
    const stored = n - left;
    if (stored > 0) p.totals[res] = (p.totals[res] || 0) + stored;
    return stored;
  }

  /** Take goods out of anywhere in the pool. Returns how many it found. */
  function take(pool, res, n) {
    const p = asPool(pool);
    if (!p || n <= 0) return 0;
    let got = 0;
    for (const s of p.members) {
      if (got >= n) break;
      const have = s.inv[res] || 0;
      if (have <= 0) continue;
      const k = Math.min(n - got, have);
      s.inv[res] = have - k;
      if (s.inv[res] <= 1e-9) delete s.inv[res];
      got += k;
    }
    if (got > 0) p.totals[res] = Math.max(0, (p.totals[res] || 0) - got);
    return got;
  }

  /** Every line of `cost` covered by this pool? */
  function canAfford(pool, cost) { return Object.entries(cost || {}).every(([id, n]) => count(pool, id) >= n); }

  /** Take a whole cost, or nothing at all. Half-paid is worse than unpaid. */
  function spend(pool, cost) {
    if (!canAfford(pool, cost)) return false;
    for (const [id, n] of Object.entries(cost || {})) take(pool, id, n);
    return true;
  }

  /** What is short, for the "needs 4 more Brick" line under a button. */
  function missing(pool, cost) {
    const out = {};
    for (const [id, n] of Object.entries(cost || {})) {
      const short = n - count(pool, id);
      if (short > 0) out[id] = short;
    }
    return out;
  }

  // ------------------------------------------------------------------ hauling

  /**
   * The shortest gap between two pools: the closest pair of members, minus what they each reach.
   * Zero or less means they would already be one pool.
   */
  function gapBetween(a, b) {
    const pa = asPool(a), pb = asPool(b);
    if (!pa || !pb) return Infinity;
    if (pa.id === pb.id) return 0;
    let best = Infinity;
    for (const s of pa.members) for (const t of pb.members) {
      best = Math.min(best, dist2d(s, t) - reachBetween(s, t));
    }
    return Math.max(0, best);
  }

  /**
   * Units a hauler delivers per second over a gap of `metres`.
   *
   * One round trip is: load, drive out, unload, drive back. So
   *
   *     perSecond = capacity / (loadSeconds * 2 + 2 * metres / speed)
   *
   * Double the distance and the delivery roughly halves. That is the same sum js/resources.js does
   * for a player on foot, deliberately — the game should only ever teach this lesson once.
   */
  function haulThroughput(metres, haulerKey = 'hand_cart') {
    const h = HAULERS[haulerKey] || HAULERS.hand_cart || { capacity: 100, speed: 3, loadSeconds: 10 };
    const cycle = (h.loadSeconds || 0) * 2 + 2 * Math.max(0, metres) / Math.max(0.1, h.speed || 1);
    return { hauler: h.name || haulerKey, capacity: h.capacity, cycleSeconds: cycle, perSecond: h.capacity / cycle, perMinute: 60 * h.capacity / cycle, powerUse: h.powerUse || 0 };
  }

  /**
   * "Should these two pools be one?" — the answer the base overview gives you.
   *
   * A relay mast costs a handful of steel and makes the gap free forever; a cart costs nothing and
   * makes it cost a trip. This says which is which, in the numbers rather than in advice.
   */
  function linkAdvice(a, b, haulerKey = 'hand_cart') {
    const gap = gapBetween(a, b);
    if (gap <= 0) return { joined: true, gap: 0, text: 'One pool already — everything in it is shared.' };
    const mast = POLES.relay_mast?.supplyRadius || POLES.relay_mast?.linkRadius || 34;
    const poles = Math.max(1, Math.ceil(gap / (2 * mast)));
    const haul = haulThroughput(gap, haulerKey);
    return {
      joined: false,
      gap: +gap.toFixed(1),
      polesToJoin: poles,
      haul,
      text: `${Math.round(gap)} m apart. A ${haul.hauler} moves ${haul.perMinute.toFixed(1)}/min across it, or ${poles} relay mast${poles === 1 ? '' : 's'} joins them into one pool and the trip stops existing.`,
    };
  }

  /** Everything the base overview panel wants (§8.9), in one call and with no drawing in it. */
  function overview() {
    return all().map(p => ({
      id: p.id,
      name: p.name,
      stores: p.members.filter(s => !s.isRelay).length,
      relays: p.members.filter(s => s.isRelay).length,
      cap: p.cap,
      load: Object.values(p.totals).reduce((a, n) => a + n, 0),
      x: p.x, z: p.z,
      totals: { ...p.totals },
    }));
  }

  function toJSON() { return { stores: [...stores.values()].map(s => s.toJSON()) }; }
  function load(json) {
    stores.clear();
    for (const s of json?.stores || []) add(s);
    dirty = true;
    return all();
  }

  return {
    Store, add, remove, get, rebuild, pools: all, poolOf, poolAt, shares,
    accepts, roomFor, count, put, take, canAfford, spend, missing,
    gapBetween, haulThroughput, linkAdvice, overview, toJSON, load,
    get size() { return stores.size; },
  };
}
