// Farhold — goods that take time to arrive, and a base that keeps working while you are not there.
//
// Two halves of one idea, which is why they share a file.
//
// **The user's words:** *"Resources should take time to move unless in the immediate vicinity, and
// should be able to greatly improve that time by building roads or potentially upgrading delivery
// vehicles later (no vehicles right now, materials can just teleport after a delay)."* And:
// *"Production and manufacturing should continue even if you leave a planet."*
//
// ## The rule, in three lines
//
//   1. **Inside one pool, nothing moves.** js/stores.js already says so: stores whose reach overlaps
//      are one pile and everything in it is shared for free. That is unchanged and it is the reward
//      for planting a logistics pole.
//   2. **Between two pools, goods take a real trip.** The distance is the ground a hauler can
//      actually WALK (js/haulpath.js A*, not the crow flight through the hill), the time is that
//      distance over the hauler's speed, and the goods leave one pool now and land in the other when
//      the clock says so. Nothing is drawn, nothing is simulated, nothing collides — a shipment is
//      four numbers and a timer, exactly as asked for.
//   3. **A road makes it much faster.** `roadFactor` is how much quicker a made surface is, and it
//      is applied in proportion to how much of the route actually runs on one. A track you laid the
//      whole way is the full speed-up; half a track is half of it. This is the one number that makes
//      the Road tool worth the stone.
//
// ## Why the away clock is in the same file
//
// Because it is the same question with the clock turned up: when you fly to another planet, the
// furnaces at home do not stop, and neither do the carts. `createAwayClock` stamps the time you
// left, and on your return it runs the refining and this file's shipments forward by however long
// you were gone — capped, so a week away does not print a mountain of iron — and hands back a plain
// summary of what turned up.
//
//   import { createLogistics, createAwayClock } from './logistics.js';
//   const ship = createLogistics({ stores, terrain, roads, power: powerData, log: hud.log });
//   ship.link(minePool.id, homePool.id);        // a standing order: send what the mine makes home
//   ship.tick(dt);                              // in the frame loop
//
//   const away = createAwayClock({ works, logistics: ship, stores });
//   away.mark();                                // on save, or on leaving orbit
//   const back = away.resume();                 // on load, or on landing
//   back.text  // "You were away 4 h. 240 iron ingot, 96 brick. 3 deliveries arrived."
//
// Pure: no Three.js, no DOM, no clock of its own — `now` is injected so `node --test` can make four
// hours pass in a millisecond.

import { findHaulPath } from './haulpath.js';

/** What a shipment costs before it even starts moving: loading and unloading, in seconds. */
export const HANDLING = 8;

/** Defaults, overridden by the `travel` block in data/power.json. */
export const TRAVEL_DEFAULTS = {
  /** A made road is this many times quicker than open ground. */
  roadFactor: 2.6,
  /** Nothing ever arrives faster than this, so a 12 m hop is still a trip and not a teleport. */
  minSeconds: 5,
  /** Past this, there is no route worth laying and the delivery is refused with a sentence. */
  maxMetres: 4000,
  /** A standing order ships when the source pool holds at least this much of something. */
  batch: 20,
  /** …and never more than this in one load, because a hauler has a back. */
  loadCap: 200,
};

/**
 * `stores` is a js/stores.js network. `roads` is a js/roadplan.js book (optional — no book means no
 * road speed-up, which is correct for a base that has not laid any). `power` is data/power.json, for
 * the hauler table and the `travel` block.
 */
export function createLogistics({
  stores = null,
  terrain = null,
  roads = null,
  power = {},
  log = null,
  materials = {},
} = {}) {
  const HAULERS = power.haulers || {};
  const T = { ...TRAVEL_DEFAULTS, ...(power.travel || {}) };

  /** Shipments in the air. `left` is seconds still to run. */
  let loads = [];
  /** Standing orders: "everything this pool makes goes to that one." */
  let links = [];
  let seq = 0;

  const nameOf = res => materials[res]?.name || res.replace(/_/g, ' ');
  const haulerOf = key => HAULERS[key] || HAULERS.hand_cart || { name: 'Hand Cart', capacity: 160, speed: 3.4, loadSeconds: 12 };

  /** Accept a pool object, a pool id, or a point. Everything below speaks pool objects. */
  function asPool(p) {
    if (!p) return null;
    if (typeof p === 'string') return (stores?.pools() || []).find(x => x.id === p) || null;
    if (p.members) return p;
    if (Number.isFinite(p.x) && Number.isFinite(p.z)) return stores?.poolAt(p.x, p.z) || null;
    return null;
  }

  /**
   * HOW LONG A LOAD TAKES, AND WHY.
   *
   * One way, not a round trip. js/stores.js `haulThroughput` measures a repeating cart run and
   * divides by the cycle; this is a single delivery that leaves and arrives, so the player watches
   * one clock and not a rate. The two do not disagree — they are answering different questions, and
   * a standing order that ships every batch settles at roughly the same throughput either way.
   *
   *     seconds = handling + metres / (speed x roadBoost)
   *     roadBoost = 1 + roadFraction x (roadFactor - 1)
   *
   * A route entirely on your own road runs at `roadFactor` times the speed; a route with none of it
   * on a road runs at walking pace. That is the whole of *"greatly improve that time by building
   * roads"*, and it is deliberately a multiplier on the moving part only — loading a cart takes as
   * long on cobbles as it does in a field.
   */
  function quote({ from, to, hauler = 'hand_cart' } = {}) {
    const a = asPool(from), b = asPool(to);
    if (!a || !b) return { ok: false, why: 'One end of that route is not a store.' };
    if (a.id === b.id) {
      return { ok: true, instant: true, metres: 0, seconds: 0, roadFraction: 1, text: 'Same pool — nothing has to move at all.' };
    }
    const h = haulerOf(hauler);
    const path = findHaulPath({ from: a, to: b, terrain });
    if (!path.ok) return { ok: false, why: 'Nothing can get from there to there on foot. Lay a road, or move a store.' };
    if (path.metres > T.maxMetres) {
      return { ok: false, why: `That is ${Math.round(path.metres)} m of walking. Put a store somewhere in between.` };
    }
    const roadFraction = roads?.fractionOnRoad ? roads.fractionOnRoad(path.points) : 0;
    const boost = 1 + roadFraction * (T.roadFactor - 1);
    const speed = Math.max(0.2, (h.speed || 3.4) * boost);
    const seconds = Math.max(T.minSeconds, HANDLING + path.metres / speed);
    return {
      ok: true, instant: false,
      metres: path.metres,
      crow: Math.hypot(b.x - a.x, b.z - a.z),
      roadFraction, boost, speed, seconds,
      hauler: h.name,
      path,
      text: `${Math.round(path.metres)} m — about ${secsText(seconds)} a load`
        + (roadFraction > 0.05 ? `, ${Math.round(roadFraction * 100)}% of it on your road` : ', none of it on a road'),
    };
  }

  /** "2 m 10 s". One place, so every screen says it the same way. */
  function secsText(s) {
    if (s < 60) return `${Math.round(s)} s`;
    const m = Math.floor(s / 60);
    const r = Math.round(s % 60);
    return r ? `${m} m ${r} s` : `${m} m`;
  }

  /**
   * Send goods. They leave the source pool NOW and land in the destination when the clock runs out.
   *
   * Taking them out at once is the part that makes this honest: while a load is on the road it is in
   * neither pool, so a base cannot spend the same ore twice by shipping it and smelting it.
   */
  function send({ from, to, res, n, hauler = 'hand_cart' } = {}) {
    const a = asPool(from), b = asPool(to);
    if (!a || !b) return { ok: false, why: 'One end of that route is not a store.' };
    if (!(n > 0)) return { ok: false, why: 'Nothing to send.' };
    const q = quote({ from: a, to: b, hauler });
    if (!q.ok) return q;

    if (q.instant) {
      const put = stores.put(b, res, Math.min(n, stores.count(a, res)));
      return { ok: true, instant: true, delivered: put };
    }

    const h = haulerOf(hauler);
    const want = Math.min(n, h.capacity || T.loadCap, T.loadCap);
    const took = stores.take(a, res, want);
    if (took <= 0) return { ok: false, why: `There is no ${nameOf(res)} in ${a.name} to send.` };

    const load = {
      id: 'sh' + (++seq),
      res, n: took, hauler,
      fromPoolId: a.id, toPoolId: b.id,
      fromName: a.name, toName: b.name,
      total: q.seconds, left: q.seconds,
      metres: q.metres, roadFraction: q.roadFraction,
      waiting: false,
    };
    loads.push(load);
    return { ok: true, instant: false, load, seconds: q.seconds, text: q.text };
  }

  /**
   * A STANDING ORDER: *"send the output back to my base using a travel route."*
   *
   * The player should not have to press a button per cartload. A link says "whatever piles up in
   * this pool goes to that one", and the tick below ships a batch whenever there is one. `only`
   * narrows it to named resources, for a mine that should send ore home but keep its own coal.
   */
  function link(fromPoolId, toPoolId, { only = null, hauler = 'hand_cart', batch = null, keep = 0 } = {}) {
    const a = asPool(fromPoolId), b = asPool(toPoolId);
    if (!a || !b) return { ok: false, why: 'A route needs a store at each end.' };
    if (a.id === b.id) return { ok: false, why: 'Those two are already one pool — nothing needs carrying.' };
    links = links.filter(l => !(l.from === a.id && l.to === b.id));
    const row = { id: 'lk' + (++seq), from: a.id, to: b.id, only: only ? [...only] : null, hauler, batch: batch || T.batch, keep };
    links.push(row);
    const q = quote({ from: a, to: b, hauler });
    return { ok: true, link: row, quote: q };
  }

  function unlink(id) {
    const before = links.length;
    links = links.filter(l => l.id !== id && !(l.from === id));
    return links.length !== before;
  }

  /** What the panel draws: every load on the road, with how long is left on it. */
  function pending() {
    return loads.map(l => ({
      id: l.id, res: l.res, name: nameOf(l.res), n: l.n,
      from: l.fromName, to: l.toName,
      left: Math.max(0, l.left), total: l.total,
      progress: l.total > 0 ? 1 - Math.max(0, l.left) / l.total : 1,
      waiting: l.waiting,
      text: l.waiting
        ? `${l.n} ${nameOf(l.res)} waiting at ${l.toName} — nowhere to put it`
        : `${l.n} ${nameOf(l.res)} → ${l.toName}, ${secsText(Math.max(0, l.left))}`,
    }));
  }

  /** Fire the standing orders: anything over the batch size gets loaded up and sent. */
  function runLinks() {
    const sent = [];
    for (const l of links) {
      const a = asPool(l.from), b = asPool(l.to);
      if (!a || !b) continue;
      // one load in the air per link at a time, or a rich mine floods the road with carts
      if (loads.some(x => x.fromPoolId === a.id && x.toPoolId === b.id)) continue;
      const totals = a.totals || {};
      let best = null;
      for (const [res, have] of Object.entries(totals)) {
        if (l.only && !l.only.includes(res)) continue;
        const spare = have - (l.keep || 0);
        if (spare < l.batch) continue;
        if (!best || spare > best.spare) best = { res, spare };
      }
      if (!best) continue;
      const res = send({ from: a, to: b, res: best.res, n: best.spare, hauler: l.hauler });
      if (res.ok && res.load) sent.push(res.load);
    }
    return sent;
  }

  /**
   * One frame — or one slice of a catch-up, which is the same code.
   *
   * A load that arrives at a full pool does not vanish and does not bounce back: it sits at the gate
   * marked `waiting` and tries again every tick. Anything else loses the player's ore for reasons
   * they cannot see, which is the worst thing a logistics system can do.
   */
  function tick(dt) {
    const arrived = [];
    const gained = Object.create(null);
    for (const l of loads) {
      if (!l.waiting) l.left -= dt;
      if (l.left > 0) continue;
      const pool = asPool(l.toPoolId);
      if (!pool) { l.waiting = true; continue; }
      const put = stores.put(pool, l.res, l.n);
      if (put >= l.n - 1e-9) {
        l.done = true;
        gained[l.res] = (gained[l.res] || 0) + l.n;
        arrived.push({ res: l.res, name: nameOf(l.res), n: l.n, to: l.toName });
      } else {
        l.n -= put;
        if (put > 0) gained[l.res] = (gained[l.res] || 0) + put;
        if (!l.waiting) log?.(`${l.n} ${nameOf(l.res)} is stuck at ${l.toName} — the stores there are full.`);
        l.waiting = true;
      }
    }
    if (loads.some(l => l.done)) loads = loads.filter(l => !l.done);
    const sent = runLinks();
    return { arrived, sent, gained };
  }

  /**
   * Run the road forward by a lot of seconds at once.
   *
   * Sliced, for the same reason js/refine.js slices: a load can arrive, unblock a full crate, and
   * let the next one in, and that has to happen in order or a base comes back from a dungeon with
   * everything stuck at the gate.
   */
  function catchUp(seconds, { slice = 5 } = {}) {
    let left = Math.max(0, seconds);
    const arrived = [], gained = Object.create(null);
    let guard = 0;
    while (left > 1e-6 && guard++ < 20000) {
      const dt = Math.min(slice, left);
      const r = tick(dt);
      arrived.push(...r.arrived);
      for (const [k, v] of Object.entries(r.gained)) gained[k] = (gained[k] || 0) + v;
      left -= dt;
    }
    return { arrived, gained, deliveries: arrived.length };
  }

  function toJSON() {
    return {
      v: 1, seq,
      loads: loads.map(l => ({ ...l, left: Math.round(l.left * 100) / 100 })),
      links: links.map(l => ({ ...l })),
    };
  }
  function load(json) {
    loads = (json?.loads || []).map(l => ({ ...l }));
    links = (json?.links || []).map(l => ({ ...l }));
    seq = json?.seq || loads.length + links.length;
    return loads.length;
  }

  return {
    quote, send, link, unlink, tick, catchUp, pending, secsText,
    get loads() { return loads; },
    get links() { return links; },
    get travel() { return { ...T }; },
    toJSON, load,
  };
}

// ---------------------------------------------------------------------------- the away clock

/** Six hours. Past this, coming back is a windfall rather than a base that ran itself. */
export const AWAY_CAP_SECONDS = 6 * 3600;

/**
 * How long you were gone, what happened while you were, and a sentence about it.
 *
 * *"Production and manufacturing should continue even if you leave a planet."* They do, and this is
 * the honest way to make that true without running a second copy of the game in the background:
 * stamp the wall clock on the way out, and on the way back run the machines and the carts forward by
 * the difference.
 *
 * **The cap is not a balance knob, it is a promise.** Without one, a player who leaves the game open
 * over a weekend comes back to a hundred thousand ingots and the whole progression is gone. Six
 * hours of a base running itself is a generous reward for setting one up and an amount the player
 * could plausibly have sat and watched.
 *
 * `works` is js/refine.js, `logistics` is above, `stores` is js/stores.js, `grid` is js/power.js. Any
 * of them may be null — a base with no refining still has carts on the road, and vice versa.
 *
 * The grid is in the list because leaving it out would be a quiet cheat: `works.speedOf` asks the
 * grid how much power a machine is getting, and with nobody ticking the grid the generators would
 * run for six hours on no fuel at all. `daylight` is the average share of the window that was
 * daytime — half, near enough, and it is what stops a solar base producing all night.
 */
export function createAwayClock({
  works = null,
  logistics = null,
  stores = null,
  grid = null,
  materials = {},
  cap = AWAY_CAP_SECONDS,
  daylight = 0.55,
  wind = 1,
  now = () => Date.now(),
} = {}) {
  let leftAt = null;
  let last = null;

  const nameOf = res => materials[res]?.name || res.replace(/_/g, ' ');

  /** Everything every pool holds, as one flat map. The before-and-after of the summary. */
  function tally() {
    const out = Object.create(null);
    for (const p of stores?.pools?.() || []) {
      for (const [k, v] of Object.entries(p.totals || {})) out[k] = (out[k] || 0) + v;
    }
    return out;
  }

  /** Stamp the clock. Called when the game saves, and when the ship leaves the atmosphere. */
  function mark(at = null) {
    leftAt = at ?? now();
    return leftAt;
  }

  /** How long has passed since the stamp, before the cap is applied. */
  function elapsed(at = null) {
    if (leftAt == null) return 0;
    return Math.max(0, ((at ?? now()) - leftAt) / 1000);
  }

  /**
   * Come back. Runs the base forward and returns what it did.
   *
   * The summary is a DIFF of what the stores hold, not a log of what the machines say they made,
   * because the number the player cares about is what is in the crates — a furnace that smelted
   * forty ingots into a full crate and then jammed has made nothing as far as anyone can tell.
   */
  function resume(at = null) {
    const raw = elapsed(at);
    const seconds = Math.min(raw, cap);
    const before = tally();
    let deliveries = 0;
    let unlocked = [];
    if (seconds > 1) {
      /**
       * SHIPMENTS AND MACHINES TAKE TURNS, IN SLICES.
       *
       * Running all the refining first and then all the hauling is wrong in a way that shows: a mine
       * that ships ore home so the smelters can eat it would smelt nothing, because the ore only
       * arrives after the smelting is over. A quarter-hour slice is coarse enough to be instant and
       * fine enough that a supply chain three hops long still fills up.
       */
      const slice = Math.min(900, Math.max(60, seconds / 24));
      let left = seconds, guard = 0;
      while (left > 1e-6 && guard++ < 5000) {
        const dt = Math.min(slice, left);
        // the grid first: a machine's speed comes from what power reached it this slice
        if (grid?.tick) grid.tick(dt, { daylight, wind });
        if (works?.catchUp) unlocked.push(...(works.catchUp(dt).unlocked || []));
        if (logistics?.catchUp) deliveries += logistics.catchUp(dt).deliveries || 0;
        left -= dt;
      }
    }
    const after = tally();
    const made = [];
    for (const [k, v] of Object.entries(after)) {
      const gain = v - (before[k] || 0);
      if (gain > 0.5) made.push({ res: k, name: nameOf(k), n: Math.round(gain) });
    }
    made.sort((a, b) => b.n - a.n);
    last = {
      seconds, rawSeconds: raw, capped: raw > cap + 1,
      made, deliveries, unlocked: [...new Set(unlocked)],
      text: summaryText(seconds, raw > cap + 1, made, deliveries),
    };
    leftAt = now();
    return last;
  }

  /** The line the HUD prints. Plain language, no numbers nobody asked for. */
  function summaryText(seconds, capped, made, deliveries) {
    if (seconds < 60) return '';
    const away = seconds >= 3600
      ? `${(seconds / 3600).toFixed(1).replace(/\.0$/, '')} hours`
      : `${Math.round(seconds / 60)} minutes`;
    const top = made.slice(0, 4).map(m => `${m.n} ${m.name.toLowerCase()}`).join(', ');
    const bits = [];
    if (top) bits.push(`Your works turned out ${top}`);
    if (deliveries) bits.push(`${deliveries} load${deliveries === 1 ? '' : 's'} came in off the road`);
    if (!bits.length) return `Nothing happened here in the ${away} you were gone.`;
    return `You were away ${away}${capped ? ' (your works ran for six hours of it)' : ''}. ${bits.join('. ')}.`;
  }

  return {
    mark, resume, elapsed,
    get leftAt() { return leftAt; },
    get last() { return last; },
    get cap() { return cap; },
    toJSON() { return { v: 1, leftAt }; },
    load(json) { leftAt = json?.leftAt ?? null; return leftAt; },
  };
}
