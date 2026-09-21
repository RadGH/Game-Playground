// Farhold — work is a unit, not a timer.
//
// PURE JavaScript: no DOM, no Three.js. The node tests drive exactly the code the game does.
//
//   import { WorkBoard, createOrder, addWork } from './work.js';
//   const board = new WorkBoard();
//   board.post(createOrder({ id: 'o1', tag: 'refine', stationId: 'furnace_1', units: 10 }));
//   board.swing('o1');                                  // the player, by hand
//   board.runMachines([{ id: 'drill_1', stationId: 'furnace_1', unitsPerHour: 4 }], 1);
//   addWork(board.get('o1'), { units: 3, source: 'citizen', by: 'c7', byName: 'Marwen' });
//
// WHY THIS EXISTS, AND WHY IT IS A UNIT.
//
//   "We should incorporate a 'work' system where you need 10 units of work at a machine, either by
//    the player working manually, by automating with a machine, or by assigning an npc."
//
// The obvious way to build a furnace is a timer: put ore in, wait forty seconds, take an ingot out.
// That has one source of progress and the player is never part of it. A UNIT has three, and they
// are the same unit — a swing of the player's arm, an hour of a powered machine, and an hour of a
// citizen's shift all put the identical thing into the identical counter. Nothing in this file
// knows or cares which of the three filled an order, except the ledger, which exists purely so the
// screen can say where the ten came from.
//
// (Design reference, for Claude and nobody in the game: Colony Survival's jobs are the model for
// citizens showing up and working a station. The unit itself is ours.)
//
// THE THREE RULES THAT MAKE THEM INTERCHANGEABLE
//
//   1. There is one function that adds work — `addWork` — and all three sources call it. There is
//      no `playerSwing()` that quietly does something different.
//   2. An order records only `units` and `done`. It has no notion of a preferred source, no
//      "machine only" flag, no source-specific multiplier. A tag says what KIND of work it is; it
//      never says who may do it.
//   3. Effort is never silently lost. If a citizen has 1.4 units of shift left and the order needs
//      0.3, `addWork` applies 0.3 and hands back 1.1 as `spare`, so the caller can walk them to the
//      next order. A unit that evaporated would make the sources stop being equivalent.

/** The three ways a unit of work can come into being. `name` is what the UI shows. */
export const WORK_SOURCES = {
  player:  { id: 'player',  name: 'By hand',  credit: 'by hand',  blurb: 'You, swinging at it.' },
  machine: { id: 'machine', name: 'Machine',  credit: 'machine',  blurb: 'A powered machine, running while you are elsewhere.' },
  citizen: { id: 'citizen', name: 'Worker',   credit: 'worker',   blurb: 'A citizen you assigned to the station.' },
};

/** Order of the ledger rows on screen, and the only source ids `addWork` will accept. */
export const SOURCE_IDS = ['player', 'machine', 'citizen'];

/** The default a station asks for, so "ten units of work at a machine" is the shape by default. */
export const DEFAULT_UNITS = 10;

/** Float dust is the enemy of `done >= units`. Everything stored is rounded to this. */
const round4 = n => Math.round(n * 1e4) / 1e4;
const EPS = 1e-6;

let nextId = 1;

/**
 * One job of work that somebody, or something, has to do.
 *
 * `tag` is the KIND of work ('refine', 'build', 'harvest', 'replant', 'mine', 'haul'…). A job's
 * tags in data/colony.json decide which orders a citizen will pick up. It deliberately does NOT
 * decide who is allowed to do the work: the player can always swing at anything, and a machine
 * that claims the tag can always run it. An order that said "citizens only" would break rule 2.
 */
export function createOrder({
  id = null, tag = 'work', stationId = null, station = null, name = null,
  units = DEFAULT_UNITS, out = null, priority = 1, postedAt = 0, meta = null,
} = {}) {
  return {
    id: id || `w${nextId++}`,
    tag,
    stationId,
    station: station || stationId,
    name: name || tag,
    units: Math.max(1e-3, units),
    done: 0,
    // Where the work came from, so the panel can say so. This is the ONLY place a source is
    // remembered, and nothing reads it back to change behaviour.
    ledger: { player: 0, machine: 0, citizen: 0 },
    credits: [],            // last few contributions, named, for "3 by Marwen"
    complete: false,
    completedAt: null,
    cancelled: false,
    priority,
    postedAt,
    out,                    // { good, count } the caller grants on completion; work.js never touches stores
    meta: meta || {},
  };
}

/** How much is left to do. */
export function workLeft(order) {
  if (!order || order.complete) return 0;
  return Math.max(0, round4(order.units - order.done));
}

/**
 * Put work into an order. THE one way progress happens, for all three sources.
 *
 * Returns `{ applied, spare, complete, order }`. `spare` is the effort that did not fit, which the
 * caller should carry to the next order rather than drop — see rule 3 at the top.
 */
export function addWork(order, { units = 1, source = 'player', by = null, byName = null, at = 0 } = {}) {
  const want = Number(units) || 0;
  if (!order || order.complete || order.cancelled || want <= 0) {
    return { applied: 0, spare: Math.max(0, want), complete: !!order?.complete, order };
  }
  // An unknown source is a wiring mistake, not a gameplay state — refuse it loudly-ish rather than
  // inventing a fourth kind of worker in the ledger.
  const src = SOURCE_IDS.includes(source) ? source : null;
  if (!src) return { applied: 0, spare: want, complete: false, order, why: `unknown work source "${source}"` };

  const left = workLeft(order);
  const applied = round4(Math.min(want, left));
  if (applied <= 0) return { applied: 0, spare: want, complete: order.complete, order };

  order.done = round4(order.done + applied);
  order.ledger[src] = round4(order.ledger[src] + applied);
  // Merge runs from the same pair of hands rather than pushing a row a quarter-hour. A citizen's
  // shift is dozens of small contributions, and a capped list of them would make `creditLine` quietly
  // under-report who did the work — which is the one thing the ledger exists to get right.
  const last = order.credits[order.credits.length - 1];
  if (last && last.source === src && last.by === by) { last.units = round4(last.units + applied); last.at = at; }
  else order.credits.push({ source: src, by, byName, units: applied, at });
  if (order.credits.length > 24) order.credits.splice(0, order.credits.length - 24);

  if (order.done >= order.units - EPS) {
    order.done = order.units;
    order.complete = true;
    order.completedAt = at;
  }
  return { applied, spare: round4(want - applied), complete: order.complete, order };
}

/** "7 / 10" for a progress bar's label. */
export function progressText(order) {
  if (!order) return '';
  const done = Math.round(order.done * 10) / 10;
  const units = Math.round(order.units * 10) / 10;
  return `${done} / ${units}`;
}

/** 0..1 for the bar itself. */
export function progressFraction(order) {
  if (!order || !order.units) return 0;
  return Math.max(0, Math.min(1, order.done / order.units));
}

/** The ledger as rows a panel can draw: [{ source, name, units, share }] , biggest first. */
export function ledgerRows(order) {
  if (!order) return [];
  const total = SOURCE_IDS.reduce((sum, s) => sum + (order.ledger[s] || 0), 0);
  return SOURCE_IDS
    .map(s => ({ source: s, name: WORK_SOURCES[s].name, units: round4(order.ledger[s] || 0), share: total ? (order.ledger[s] || 0) / total : 0 }))
    .filter(r => r.units > 0)
    .sort((a, b) => b.units - a.units);
}

/**
 * One line saying where the work came from: "6 by hand, 3 by Marwen, 1 by the sawmill".
 *
 * Named contributors win over the generic word, because "3 by Marwen" is the sentence that makes a
 * citizen feel like a person rather than a production rate.
 */
export function creditLine(order) {
  if (!order) return '';
  const byName = new Map();
  for (const c of order.credits) {
    const key = c.byName || WORK_SOURCES[c.source].credit;
    byName.set(key, round4((byName.get(key) || 0) + c.units));
  }
  const parts = [...byName.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([who, units]) => `${Math.round(units * 10) / 10} ${who.startsWith('by ') ? who : 'by ' + who}`);
  return parts.join(', ');
}

/**
 * A machine's contribution for a stretch of time.
 *
 * A machine is `{ id, name, stationId, unitsPerHour, tags?, powered?, enabled? }`. An unpowered or
 * switched-off machine produces nothing — that is the whole hook the power grid needs, and it lives
 * here rather than in power.js so this file stays the only place a unit is minted.
 */
export function machineUnits(machine, hours) {
  if (!machine || machine.enabled === false) return 0;
  if (machine.powered === false) return 0;
  const rate = Number(machine.unitsPerHour) || 0;
  return round4(Math.max(0, rate * Math.max(0, hours)));
}

/** Does this machine or worker's tag list cover this order? No tags at all means "anything". */
export function tagsMatch(tags, order) {
  if (!tags || !tags.length) return true;
  return tags.includes(order.tag);
}

/**
 * The board of everything waiting to be done.
 *
 * A base has one. Stations post to it, citizens pull from it, the player swings at whatever they
 * are standing in front of, and machines chew through whatever is at their own station.
 */
export class WorkBoard {
  /**
   * R16 — A BOARD BUILT FROM A SAVE KEEPS ITS ORDERS.
   *
   * `toJSON` has always written the open orders out and the constructor has always thrown them
   * away: `new WorkBoard(save.work)` read `now` and nothing else, and `WorkBoard.fromJSON` — which
   * does read them — is called by nobody in the game. So every load emptied the board. For a
   * machine's `lab_*` order that was invisible (js/refine.js re-posts within the second), but a
   * harvest or a build order posted by something that only posts once was simply lost, and the
   * half a shift a citizen had already put into one went with it.
   *
   * Taking `orders` in the constructor rather than fixing every call site means the game's own
   * `new WorkBoard(save?.work || {})` starts working with no change anywhere else, and a caller
   * that passes nothing gets exactly the empty board it always got.
   */
  constructor({ now = 0, keepDone = 40, orders = null } = {}) {
    this.orders = [];
    this.finished = [];
    this.now = now;
    this.keepDone = keepDone;
    // Anything already finished or cancelled in the save is not an open order; drop it rather than
    // resurrecting a row the player has seen the end of.
    if (Array.isArray(orders)) {
      for (const o of orders) {
        if (!o || o.complete || o.cancelled) continue;
        // a saved order is a plain object, so fill in anything a newer field added
        this.orders.push({ ledger: { player: 0, machine: 0, citizen: 0 }, credits: [], meta: {}, ...o });
      }
    }
  }

  post(order) {
    if (!order) return null;
    if (order.postedAt == null || order.postedAt === 0) order.postedAt = this.now;
    this.orders.push(order);
    return order;
  }

  /** Post from a plain description, which is what most callers actually want. */
  postJob(spec) { return this.post(createOrder({ postedAt: this.now, ...spec })); }

  get(id) { return this.orders.find(o => o.id === id) || this.finished.find(o => o.id === id) || null; }

  /** Everything still wanting work. */
  open() { return this.orders.filter(o => !o.complete && !o.cancelled); }

  openAt(stationId) { return this.open().filter(o => o.stationId === stationId); }
  openTagged(tag) { return this.open().filter(o => o.tag === tag); }

  cancel(id) {
    const o = this.get(id);
    if (o) o.cancelled = true;
    return o;
  }

  /**
   * The next order a worker (or machine) with these tags should pick up.
   *
   * Highest priority, then oldest — so a base does not thrash and a job posted an hour ago does not
   * sit behind one posted a second ago. `stationId` narrows it to one machine's own station, which
   * is how a furnace only ever smelts its own queue.
   */
  nextFor({ tags = null, stationId = null } = {}) {
    let best = null;
    for (const o of this.orders) {
      if (o.complete || o.cancelled) continue;
      if (stationId && o.stationId !== stationId) continue;
      if (!tagsMatch(tags, o)) continue;
      if (!best) { best = o; continue; }
      if (o.priority !== best.priority) { if (o.priority > best.priority) best = o; continue; }
      if (o.postedAt < best.postedAt) best = o;
    }
    return best;
  }

  /**
   * The player swings at something. One unit by default; a better tool is worth more per swing, and
   * that is the ONLY thing a tool changes — the unit it produces is the same unit.
   */
  swing(orderId, { units = 1, by = 'player', byName = null } = {}) {
    const order = typeof orderId === 'string' ? this.get(orderId) : orderId;
    if (!order) return { applied: 0, spare: units, complete: false, order: null };
    const res = addWork(order, { units, source: 'player', by, byName, at: this.now });
    this._sweep(res);
    return res;
  }

  /** An assigned citizen works. Called by js/colony.js; identical path to `swing`. */
  work(orderId, { units = 1, source = 'citizen', by = null, byName = null } = {}) {
    const order = typeof orderId === 'string' ? this.get(orderId) : orderId;
    if (!order) return { applied: 0, spare: units, complete: false, order: null };
    const res = addWork(order, { units, source, by, byName, at: this.now });
    this._sweep(res);
    return res;
  }

  /**
   * Run every machine for `hours`. Each machine takes its own station's queue first and, if its
   * station is quiet, anything matching its tags — a drill with nothing to drill should not idle
   * next to a pile of hauling.
   *
   * Returns the orders that completed, so the caller can grant their `out`.
   */
  runMachines(machines = [], hours = 0, { at = null } = {}) {
    const when = at == null ? this.now : at;
    const finished = [];
    for (const m of machines) {
      let budget = machineUnits(m, hours);
      let guard = 0;
      while (budget > EPS && guard++ < 64) {
        const order = this.nextFor({ tags: m.tags, stationId: m.stationId })
          || (m.roam ? this.nextFor({ tags: m.tags }) : null);
        if (!order) break;
        const res = addWork(order, { units: budget, source: 'machine', by: m.id, byName: m.name || null, at: when });
        if (res.applied <= 0) break;
        budget = res.spare;
        if (res.complete) finished.push(order);
      }
    }
    this._sweepAll(finished);
    return finished;
  }

  /** Move the clock on. The board itself does no work — time alone never completes an order. */
  tick(hours = 0) { this.now = round4(this.now + Math.max(0, hours)); return this; }

  _sweep(res) { if (res && res.complete && res.order) this._sweepAll([res.order]); }

  _sweepAll(orders) {
    for (const o of orders) {
      const i = this.orders.indexOf(o);
      if (i >= 0) this.orders.splice(i, 1);
      this.finished.push(o);
    }
    // Also clear anything cancelled or completed by a direct addWork() call.
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      if (o.complete || o.cancelled) { this.orders.splice(i, 1); this.finished.push(o); }
    }
    if (this.finished.length > this.keepDone) this.finished.splice(0, this.finished.length - this.keepDone);
  }

  /** A summary line for the base overview panel. */
  summary() {
    const open = this.open();
    const units = open.reduce((s, o) => s + workLeft(o), 0);
    return { orders: open.length, unitsLeft: round4(units), finished: this.finished.length };
  }

  toJSON() { return { now: this.now, orders: this.orders, finished: this.finished.map(o => o.id) }; }

  static fromJSON(data) {
    const board = new WorkBoard({ now: data?.now || 0 });
    if (Array.isArray(data?.orders)) board.orders = data.orders;
    return board;
  }
}
