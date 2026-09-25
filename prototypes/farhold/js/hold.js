// Farhold — the hold: the one container in the game with a weight limit in it.
//
// PURE JavaScript: thirty lines of arithmetic, no DOM, no Three.js.
//
//   import { createHold } from './hold.js';
//   const hold = createHold({ goods: tradeGoods.goods, capacity: 40 });
//   hold.put('ingot_bundle', 7);     // -> 2, because two is all that fitted
//   hold.rows();                     // what the panel draws
//
// WHY A FOURTH CONTAINER (§6.1).
//
// Farhold already has three places to put something and the split between them is right:
//
//   player.bag        items      — swords, rings, quivers        capped by nothing
//   craft.materials   materials  — ingots, planks, ore           capped by nothing, DELIBERATELY
//                                  ("materials are a currency, not luggage")
//   stores pools      everything at an outpost                   capped per store
//
// A trade good is none of those. It is a PRODUCT: made once, moved far, sold whole. It gets the
// fourth container, and the fourth container is the only one in the game with a weight limit —
// because the weight limit is the entire reason trade is interesting. *How much can this cart
// carry* is the question a trade run is made of.
//
// THERE IS NO ENCUMBRANCE (§6.5). Going over the limit is impossible rather than slow: `put`
// returns how many actually fitted and the panel says *"The cart is full. 3 of 7 went in."* A speed
// penalty here would fight js/player.js's `walkSpeedFor`, which already slows you down for the
// MATERIALS you are carrying — that is a different and older lesson, and teaching it twice in two
// different currencies would just be confusing.

// R17: a quantity of a material is printed with one decimal, never raw.
import { mat } from '../../../shared/format.js';

const round2 = n => Math.round(n * 100) / 100;

export function createHold({ goods = [], capacity = 40 } = {}) {
  const BY_ID = new Map((goods || []).map(g => [g.id, g]));
  const inv = Object.create(null);
  let cap = Math.max(0, capacity);

  const weightOf = id => BY_ID.get(id)?.weight ?? 1;
  const valueOf = id => BY_ID.get(id)?.base ?? 0;

  function load() {
    let kg = 0;
    for (const id in inv) kg += inv[id] * weightOf(id);
    return round2(kg);
  }

  /** How many more of this would fit. Never negative, never a fraction of a crate. */
  function room(id) {
    const w = weightOf(id);
    if (w <= 0) return Infinity;
    return Math.max(0, Math.floor((cap - load() + 1e-9) / w));
  }

  /** Put some in. Returns HOW MANY FITTED, which is never more than you asked for. */
  function put(id, n = 1) {
    const want = Math.floor(Number(n) || 0);
    if (want <= 0 || !BY_ID.has(id)) return 0;
    const fits = Math.min(want, room(id));
    if (fits <= 0) return 0;
    inv[id] = (inv[id] || 0) + fits;
    return fits;
  }

  /** Take some out. Returns how many it found. */
  function take(id, n = 1) {
    const want = Math.floor(Number(n) || 0);
    if (want <= 0) return 0;
    const got = Math.min(want, inv[id] || 0);
    if (got <= 0) return 0;
    inv[id] -= got;
    if (inv[id] <= 0) delete inv[id];
    return got;
  }

  function count(id) { return inv[id] || 0; }

  /** Rows for the panel, heaviest first — the thing you would drop to make room. */
  function rows() {
    return Object.keys(inv).map(id => {
      const g = BY_ID.get(id) || {};
      return {
        id, name: g.name || id, n: inv[id],
        each: weightOf(id), kg: round2(inv[id] * weightOf(id)),
        value: valueOf(id) * inv[id],
        tags: g.tags || [],
      };
    }).sort((a, b) => b.kg - a.kg);
  }

  /** "118 / 160 kg" plus the bar fraction, for the one HUD readout. */
  function bar() {
    const used = load();
    return { used, cap, fraction: cap > 0 ? Math.min(1, used / cap) : 0, text: `${Math.round(used)} / ${Math.round(cap)} kg` };
  }

  /**
   * Move goods between two holds — your back and a Trade Post, most of the time.
   *
   * It takes only what the far end will actually accept, so nothing is ever destroyed in transit.
   * The sentence the panel prints comes back with it, because "3 of 7 went in" is the whole
   * interface of a weight limit.
   */
  function moveTo(other, id, n = 1) {
    if (!other) return { moved: 0, why: 'Nowhere to put it.' };
    const fits = Math.min(Math.floor(n) || 0, count(id), other.room(id));
    if (fits <= 0) {
      return { moved: 0, why: count(id) <= 0 ? 'You have none of those.' : 'There is no room at the other end.' };
    }
    take(id, fits);
    other.put(id, fits);
    const name = BY_ID.get(id)?.name || id;
    return { moved: fits, why: fits < n ? `${mat(fits)} of ${mat(n)} ${name.toLowerCase()} went in. That is all that fitted.` : null };
  }

  return {
    put, take, count, room, rows, bar, moveTo,
    load,
    get capacity() { return cap; },
    set capacity(n) { cap = Math.max(0, n); },
    /** Recomputed when you mount, garage something, or walk up to a Trade Post. */
    setCapacity(n) { cap = Math.max(0, n); return cap; },
    get empty() { return Object.keys(inv).length === 0; },
    all() { return { ...inv }; },
    clear() { for (const k in inv) delete inv[k]; },
    toJSON() { return { v: 1, cap, inv: { ...inv } }; },
    loadJSON(json) {
      for (const k in inv) delete inv[k];
      Object.assign(inv, json?.inv || {});
      if (Number.isFinite(json?.cap)) cap = json.cap;
      return inv;
    },
  };
}

/**
 * How much you can carry right now, out of what you are travelling with.
 *
 * `data/colony.json` `hold`. On your back is the same forty kilograms `data/resources.json`'s haul
 * block already uses, so the two numbers can never drift apart.
 */
export function holdCapacity({ data = null, mount = false, cart = null, vehicle = null, carriers = [] } = {}) {
  const H = data?.hold || { onBack: 40, mountPack: 120, tradePost: 2000, vehicles: {} };
  if (cart) {
    const row = (carriers || []).find(c => c.key === cart);
    if (row) return row.hold;
  }
  let kg = H.onBack ?? 40;
  if (mount) kg += H.mountPack ?? 120;
  if (vehicle && H.vehicles?.[vehicle]) kg += H.vehicles[vehicle];
  return kg;
}
