// The simulator's bot. It is not an opponent and it is not clever - it exists so the balance sim
// can play a real game end to end and report where the numbers hurt.
//
//   import { Bot } from './ai.js';
//   const bot = new Bot(game);
//   for (let t = 0; t < hours * 3600; t++) { game.tick(1); bot.tick(1); }
//
// How it plays, in order of what matters:
//
// 1. **It works backwards from what it wants.** `DEMANDS` is a list of "I want this many of these a
//    second". `ensure()` walks the recipe tree behind each one, counts the machines already making
//    it, and builds one more when the throughput is short - all the way down to putting another
//    drill on the ore. That is what stops the old bot's failure mode, where it ran a fixed number of
//    smelters forever and starved one input at a time.
// 2. **It builds in one lump.** Everything goes inside `compactRadius` of the landing pod, which has
//    a 34-tile link range, so the whole base is a single storage pool and no machine can be cut off
//    from its inputs. A drill out on a far patch gets a chain of crates back to the pool (a crate is
//    five plate and reaches ten tiles), and anything further than that gets a truck.
// 3. **It spends ahead of the wave clock**, not after it: turret count is driven by the wave number
//    and by how long is left on `nextWaveAt`, and the turrets go on the map edges the attacks
//    actually come from.
// 4. **It researches down a fixed line** towards the rocket, and takes anything else that is cheap.
//
// PLAN (one-off buildings), DEMANDS (throughput targets) and RESEARCH_ORDER are plain data, so
// tuning the bot means editing a list rather than the logic. Everything else it needs is in
// `data/balance.json -> bot`.

import { available } from './build.js';
import { recomputeLinks, recomputePower, isStore } from './production.js';
import { BALANCE } from './rules.js';
import { nextTier, garageFor, vehiclesFor } from './logistics.js';

/**
 * One-off buildings, in the order they are worth having. `after` is a research id that has to be
 * done first; steps whose building is not researched yet are skipped and picked up later.
 * (Exported as PLAN as well, because the sim's `--why` output and the tests read it.)
 */
export const INFRA = [
  { build: 'storage_crate', n: 2 },
  { build: 'lab', n: 3 },
  { build: 'scanner_tower', n: 2 },
  { build: 'builder_yard', n: 2 },
  { build: 'lab', n: 8, after: 't_masonry' },
  { build: 'workshop', n: 2, after: 't_masonry' },
  { build: 'storage_crate', n: 5 },
  { build: 'scanner_tower', n: 3, after: 't_masonry' },
  { build: 'lab', n: 12, after: 't_steel' },
  { build: 'warehouse', n: 2, after: 't_haulage' },
  { build: 'truck_garage', n: 2, after: 't_haulage' },
  { build: 'loading_dock', n: 1, after: 't_haulage' },
  { build: 'repair_bay', n: 4, after: 't_field_repair' },
  { build: 'dormitory', n: 2, after: 't_settlement' },
  { build: 'short_radar', n: 1, after: 't_radar' },
  { build: 'silo', n: 2, after: 't_masonry' },
  { build: 'lab', n: 14, after: 't_chemistry' },
  { build: 'fluid_tank', n: 3, after: 't_fluids' },
  { build: 'tanker_bay', n: 1, after: 't_fluids' },
  { build: 'warehouse', n: 4, after: 't_chemistry' },
  // a garage is three trucks, and the outposts that gate the rocket chain are further out than a
  // chain of stores can reach; see outposts()
  { build: 'truck_garage', n: 4, after: 't_chemistry' },
  { build: 'archive', n: 1, after: 't_research_methods' },
  { build: 'lab', n: 18, after: 't_research_methods' },
  { build: 'research_station', n: 4, after: 't_research_methods' },
  { build: 'battery_bank', n: 4, after: 't_batteries' },
  { build: 'substation', n: 4, after: 't_highvoltage' },
  { build: 'gas_tank', n: 2, after: 't_gasworks' },

  { build: 'long_radar', n: 2, after: 't_long_range_scan' },
  { build: 'research_station', n: 8, after: 't_astronomy' },
  { build: 'shield_generator', n: 2, after: 't_shields' },
  // `saveFor` marks the handful of buildings the whole run is for. They are the lumpiest costs in
  // the game - a rocket assembly is thirty *alloy* plate, eight machine frames and four advanced
  // parts - and a base that spends alloy plate on heat shields as fast as it rolls will never have
  // thirty of it at once. They book their materials ahead of anything else (see the ledger), which
  // is the difference between a launch pad standing next to nothing and a rocket.
  { build: 'launch_pad', n: 1, after: 't_rocketry', saveFor: true },
  { build: 'rocket_assembly', n: 1, after: 't_rocketry', saveFor: true },
  { build: 'satellite_uplink', n: 1, after: 't_satellites', saveFor: true },
  { build: 'satellite_launcher', n: 1, after: 't_satellites', saveFor: true },
  { build: 'probe_launcher', n: 1, after: 't_probes' },
  { build: 'orbital_lift', n: 1, after: 't_orbital_station' },
  { build: 'beacon', n: 1, after: 't_beacon', saveFor: true },
];
export const PLAN = INFRA;

/**
 * Throughput the bot tries to keep standing, in units a second. `after` gates the line on a recipe
 * being researched. `ensure()` turns each of these into "how many machines and drills is that".
 */
export const DEMANDS = [
  { res: 'stone', rate: 0.5 },
  { res: 'coal', rate: 1.2 },
  { res: 'iron_plate', rate: 1.0 },
  { res: 'gear', rate: 0.35 },
  { res: 'copper_wire', rate: 0.6 },
  { res: 'pack_basic', rate: 0.22 },
  { res: 'concrete', rate: 0.45, after: 'calcine_lime' },
  { res: 'pack_logistics', rate: 0.18, after: 'pack_logistics' },
  { res: 'steel_plate', rate: 0.45, after: 'make_steel_plate' },
  { res: 'glass', rate: 0.22, after: 'make_glass' },
  { res: 'circuit', rate: 0.3, after: 'make_circuit' },
  { res: 'sulfuric_acid', rate: 0.35, after: 'make_acid' },
  { res: 'pack_chem', rate: 0.2, after: 'pack_chem' },
  { res: 'fuel', rate: 0.3, after: 'refine_oil' },
  // lubricant is never a recipe input - it is a *building* cost, for assembler mk2 and the better
  // drills. Nothing pulled it into the plan, so the bot never built a refinery and the whole tier
  // three tree stayed locked behind an assembler it could not pay for.
  { res: 'lubricant', rate: 0.12, after: 'refine_oil' },
  { res: 'polymer', rate: 0.3, after: 'make_polymer' },
  { res: 'resin', rate: 0.2, after: 'make_resin' },
  { res: 'lens', rate: 0.06, after: 'grind_lens' },
  { res: 'machine_frame', rate: 0.05, after: 'make_machine_frame' },
  { res: 'pack_military', rate: 0.08, after: 'pack_military' },
  { res: 'battery_cell', rate: 0.18, after: 'make_battery' },
  { res: 'solar_cell', rate: 0.15, after: 'make_solar_cell' },
  { res: 'advanced_circuit', rate: 0.2, after: 'make_advanced_circuit' },
  { res: 'pack_energy', rate: 0.16, after: 'pack_energy' },
  { res: 'control_unit', rate: 0.05, after: 'make_control_unit' },
  { res: 'alloy_plate', rate: 0.2, after: 'make_alloy_plate' },
  { res: 'superalloy', rate: 0.06, after: 'make_superalloy' },
  { res: 'advanced_part', rate: 0.04, after: 'make_advanced_part' },
  { res: 'heat_shield', rate: 0.025, after: 'make_heat_shield' },
  { res: 'rocket_fuel', rate: 0.3, after: 'make_rocket_fuel' },
  { res: 'oxidizer', rate: 0.2, after: 'make_oxidizer' },
  { res: 'pack_space', rate: 0.08, after: 'pack_space' },
  { res: 'rocket_part', rate: 0.02, after: 'make_rocket_part' },
  { res: 'satellite', rate: 0.004, after: 'make_satellite' },
  { res: 'probe', rate: 0.004, after: 'make_probe' },
  { res: 'station_module', rate: 0.004, after: 'make_station_module' },
  { res: 'beacon_core', rate: 0.004, after: 'make_beacon_core' },
];

/** The line to the rocket, plus the cheap detours worth taking on the way. */
export const RESEARCH_ORDER = [
  // The opening: dig it, smelt it, build with it.
  't_masonry', 't_alloys', 't_haulage', 't_electronics', 't_steel',
  // The wave clock does not wait for the factory. Guns, then the pack that pays for the rest of the
  // defence tree, then walls - all of this used to sit *after* rocketry, and the run reliably died
  // around wave fifteen with nothing but watchtowers standing.
  't_ballistics', 't_ordnance', 't_fortification',
  // Wind is cheap (one pack, and only t_landfall behind it) and it is the only power this game has
  // that does not eat something a drill had to dig. It used to sit near the end of this list, and on
  // a world where coal is thin - volcanic digs fourteen small seams - the grid stopped at the three
  // generators the starting coal could feed, every machine on it ran at a quarter speed, and the run
  // never recovered. It is an opening move now.
  't_wind',
  't_drilling2', 't_glass', 't_machining', 't_field_repair', 't_assembly2',
  // the middle: fluids, oil and chemistry open the third pack and everything above it
  't_settlement', 't_fluids', 't_oil', 't_chemistry', 't_polymers', 't_optics',
  // t_solar sits here, not down with the endgame, because an energy pack is two battery cells, one
  // advanced circuit and one *solar cell*. It used to be researched after t_refractory - the first
  // node that has to be paid for in energy packs - so the bot arrived at the middle of the tree
  // holding two thirds of a pack it could never finish, and every run on every world stopped at
  // "stalled on packs" with the whole rocket half of the tree behind it.
  // ...and t_highvoltage with it, because that is the node that unlocks the *recipe* for an energy
  // pack. It used to be researched after t_refractory, which is the first node that has to be paid
  // for in energy packs - a plain deadlock in this list: the bot could not research the thing that
  // taught it to build the thing the research needed. Every world stopped at the same place,
  // "47 nodes, stalled on packs", with the whole rocket half of the tree behind it.
  't_incendiary', 't_logic', 't_batteries', 't_solar', 't_highvoltage',
  't_research_methods', 't_hardened_defence',
  // the climb to the rocket, with the two big defence upgrades taken on the way past
  't_titanium', 't_controls', 't_refractory', 't_lasers',
  't_electrolysis', 't_explosives', 't_missiles', 't_reentry',
  't_assembly3', 't_precision', 't_superalloy', 't_drilling3', 't_deep_boring', 't_rocketry',
  // then what makes the endgame affordable, and the detours worth taking
  't_long_range_scan', 't_satellites', 't_probes', 't_field_tech', 't_shields', 't_artillery',
  't_roads', 't_paving', 't_crushing', 't_radar', 't_scouting',
  't_heavy_haulage', 't_gasworks', 't_atmospherics', 't_centrifuge', 't_biofuel',
  't_nanofabrication', 't_fission', 't_survey', 't_astronomy', 't_cold_ops', 't_orbital_station', 't_beacon',
];

const RAW_KINDS = new Set(['ore', 'mineral', 'fluid', 'gas', 'organic', 'rare']);
/**
 * Offsets around a point, nearest first, computed once. `RING_AT[r]` is the first index at radius r,
 * so a search can start at a given distance without walking the rings inside it.
 */
// The table has to reach as far as the bot is ever allowed to build. It used to stop at 90 tiles
// while `maxReach` is 121 on the sim's 288-tile map (and about 200 on the interface's 480): once the
// ground inside 90 tiles was full, `spot()` could not see a single legal tile past it. On arid that
// was the launch pad - researched, affordable, 356 legal 6x6 spots clear of patches between 96 and
// 121 tiles out, and `spot()` returned null for the last two and a half hours of the run.
const RING_MAX = 205;
const RING = (() => {
  const out = [];
  for (let dy = -RING_MAX; dy <= RING_MAX; dy++) for (let dx = -RING_MAX; dx <= RING_MAX; dx++) {
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 2 && d <= RING_MAX) out.push([dx, dy, d]);
  }
  return out.sort((a, b) => a[2] - b[2]);
})();
const RING_AT = (() => {
  const at = new Int32Array(RING_MAX + 3).fill(RING.length);
  for (let k = RING.length - 1; k >= 0; k--) at[Math.ceil(RING[k][2])] = k;
  for (let r = RING_MAX; r >= 0; r--) if (at[r] === RING.length) at[r] = at[r + 1] ?? RING.length;
  at[0] = at[1] = at[2] = 0;
  return at;
})();
const ringStart = r => RING_AT[Math.max(0, Math.min(RING_MAX + 2, Math.floor(r)))] ?? 0;

/** Footprint offsets around a patch centre, nearest first. */
const OFFSETS = (() => {
  const out = [];
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) out.push([dx, dy]);
  return out.sort((a, b) => (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
})();
const EXTRACTOR_FOR = { fluid: ['fluid_pump'], gas: ['gas_extractor'], ice: ['ice_harvester'] };

/** How much of a thing is worth stockpiling before the machine making it should idle. */
export const STOCK_TARGET = {
  iron_ore: 1200, copper_ore: 900, coal: 2500, stone: 1200, sand: 500, crude_oil: 2500, water: 3000,
  biomass: 400, sulfur: 600, ice: 800, brine: 1200, natural_gas: 2000, nitrogen: 1500, hydrogen: 1500,
  titanium_ore: 800, tungsten_ore: 600, platinum_ore: 400, gold_ore: 500, lithium_ore: 500, silver_ore: 400,
  iron_ingot: 600, copper_ingot: 450, steel_ingot: 600, titanium_ingot: 300, tungsten_bar: 200,
  iron_plate: 1400, steel_plate: 900, copper_wire: 800, gear: 600, circuit: 600, advanced_circuit: 350,
  glass: 400, concrete: 900, polymer: 500, sulfuric_acid: 600, fuel: 700, lubricant: 300, resin: 400,
  battery_cell: 300, solar_cell: 300, machine_frame: 160, control_unit: 120, alloy_plate: 400,
  superalloy: 160, advanced_part: 80, heat_shield: 40, lens: 120, rocket_fuel: 400, oxidizer: 300,
  pack_basic: 800, pack_logistics: 700, pack_chem: 700, pack_military: 400, pack_energy: 500, pack_space: 300,
  rocket_part: 8, satellite: 2, probe: 2, station_module: 6, beacon_core: 1,
};
const stockTarget = res => STOCK_TARGET[res] ?? 400;

// ------------------------------------------------------------------ the reservation ledger
/**
 * **Booking materials for a build the bot has already decided on.**
 *
 * Every spender in this file used to ask one question - "can I afford this right now" - against
 * everything in the stores, and whoever asked first won. On a world where the base spends what it
 * makes that is a deadlock rather than a race: volcanic makes 2.2 steel plate a second and holds
 * zero, because `defence()` buys a wall with each plate as it lands. A chemical plant is sixteen
 * steel plate, so it was never affordable, so the base never made sulfuric acid, never made a
 * chemical pack, and the research tree stopped at 29 nodes with the whole middle of the game behind
 * it. The same shape stopped the rocket on the worlds that did survive: a rocket assembly is thirty
 * *alloy* plate in one lump, and alloy plate was being spent on heat shields as fast as it appeared.
 *
 * So a job the bot has committed to books what it needs, and everyone else spends around it.
 *
 *  - **The ledger is keyed by owner** - one booking per job, `infra:<building>` for a step of the
 *    build programme and `chain:<recipe>` for a machine the chain planner wants. Booking again with
 *    the same owner refreshes it rather than stacking a second one.
 *  - **Free stock, not stock.** `have(res)` - which is what `affordable()` and therefore every
 *    placement in this file goes through - returns what is in the stores *minus* what is booked for
 *    someone else. Defence, expansion, power, logistics, the crate chains and the pod's workbench
 *    all read the same number, so a booking genuinely accumulates.
 *  - **Priority decides who may ignore a booking.** A spender carries a priority and only sees the
 *    bookings at or above it. Ordinary spending is 0 and so respects everything; a build-programme
 *    step books at 50, the chain planner at 60, putting a drill on a patch spends at 62, the grid
 *    books at 65 and the rocket buildings at 70, which also decides which booking is dropped when the
 *    ledger is full; and defence spends at 99 -
 *    ignoring every booking in the ledger - while the opening guns are missing, while the pod has
 *    been hit in the last 90 seconds, or while a wave is close and the gun line is less than half
 *    what the wave clock wants. Defence and the grid also *book*: the next gun while the line is
 *    short in an emergency, the next generator while the grid is short. A base that saves up for a
 *    chemical plant while the pod is being eaten has not understood the assignment.
 *  - **Only a real shortage books.** A job has to have been unaffordable for `reserveAfter`
 *    (`reservePowerAfter` for the grid) before it books, and nothing books a material the base is
 *    not making or digging at all - that is a missing chain, and `plan()` turns it into demand.
 *  - **Nothing books for ever.** A booking is dropped when its job is no longer wanted (`still()`),
 *    when the materials have not moved towards it for `reserveStallFor` seconds - which is what
 *    happens when the base simply cannot make the stuff - or when it has been open for
 *    `reserveTtl`. A dropped booking cools off for `reserveCoolFor` before the same owner may book
 *    again, so an unreachable target cannot pin the base's output in a loop - and a booking dropped
 *    because nothing arrived puts the materials it was short of on the same cool-off for *every*
 *    owner, or three different owners take turns holding the same six gear for ever.
 *  - **At most `maxReservations` at once** (one, in `balance.json`), so the ledger can never hold
 *    the whole factory still. A new booking only displaces an open one of strictly lower priority.
 *
 * The knobs are in `data/balance.json -> bot`; the rule is written up in `DESIGN.md` §11 under
 * "The reservation ledger".
 */
// `power` sits above the chain planner and below the rocket: a grid at a quarter of its draw runs
// every machine in the base at a quarter speed, so a generator is worth more than any one new machine
// `extract` - putting a drill or a pump on a patch - sits just above the chain planner, because
// nothing the planner books can ever be paid for if the ore under it is not being dug.
export const RESERVE = { routine: 0, plan: 50, chain: 60, extract: 62, power: 65, rocket: 70, emergency: 99 };
const EXTRACT = { owner: 'extract', priority: RESERVE.extract };

class Ledger {
  constructor(bot) {
    this.bot = bot;
    this.book = new Map();          // owner -> booking
    this.cool = new Map();          // owner -> the time it may book again
    this.shortCool = new Map();     // resource -> the time a booking short of it may be made again
    this.dropped = [];              // for the sim's --why output
  }

  get cfg() { return this.bot.cfg; }
  get max() { return this.cfg.maxReservations ?? 3; }
  get list() { return [...this.book.values()]; }

  /**
   * Book (or refresh) the materials for one job. `cost` is a plain {resource: n}; `still` is asked
   * every sweep whether the job is still wanted. Returns the booking, or null if it was refused.
   */
  /**
   * Could the base ever pay this off? A line that is short, that nothing is making and that nothing
   * is digging, is not something to save up for - it is something to go and fix. Booking it anyway
   * is how a ledger deadlocks a base: on temperate the bot booked a battery bank for seven minutes
   * at a time, over and over, while holding no battery cell and having nothing that made one.
   */
  reachable(cost) {
    for (const [res, n] of Object.entries(cost)) {
      if (this.bot.onHand(res) >= n) continue;
      if (this.bot.capacityOf(res) > 0) continue;
      return false;
    }
    return true;
  }

  reserve(owner, cost, { priority = RESERVE.plan, why = '', still = null } = {}) {
    const now = this.bot.g.time;
    if (!cost || !Object.keys(cost).length) return null;
    let r = this.book.get(owner);
    if (!r) {
      if ((this.cool.get(owner) ?? -1e9) > now) return null;
      // The cool-off is per *material* as well as per owner. Per owner alone was a loop: on temperate a
      // crusher booking starved on gear, was dropped, and a glassworks booked the same six gear the
      // next cycle, then a rubble sorter, round and round for two hours - and with six gear always
      // spoken for, no drill and no generator could ever be paid for. Emergency defence is exempt.
      if (priority < RESERVE.emergency) {
        for (const [res, n] of Object.entries(cost)) {
          if (this.bot.onHand(res) < n && (this.shortCool.get(res) ?? -1e9) > now) return null;
        }
      }
      if (!this.reachable(cost)) return null;
      if (this.book.size >= this.max && !this.evict(priority)) return null;
      r = { owner, cost, priority, why, still, madeAt: now, moveAt: now, paidAt: null, best: 0 };
      this.book.set(owner, r);
      this.bot.mark('reserve:' + owner);
    }
    r.cost = cost; r.priority = priority; r.why = why || r.why;
    if (still) r.still = still;
    return r;
  }

  /** The job was built (or given up on by its owner): let go of the materials. */
  release(owner, reason = 'built') {
    const r = this.book.get(owner);
    if (!r) return false;
    this.book.delete(owner);
    if (reason !== 'built') this.cool.set(owner, this.bot.g.time + (this.cfg.reserveCoolFor ?? 600));
    // starved rather than unwanted: whatever it was waiting on is not arriving, so nobody else may
    // start saving up for it either until the cool-off has passed
    if (reason.startsWith('nothing arrived')) {
      for (const [res, n] of Object.entries(r.cost)) {
        if (this.bot.onHand(res) < n) this.shortCool.set(res, this.bot.g.time + (this.cfg.reserveCoolFor ?? 600));
      }
    }
    this.dropped.push({ owner, reason, at: Math.round(this.bot.g.time) });
    if (this.dropped.length > 20) this.dropped.shift();
    return true;
  }

  /** Make room for a more important booking by dropping the least important open one. */
  evict(priority) {
    let worst = null;
    for (const r of this.book.values()) if (!worst || r.priority < worst.priority || (r.priority === worst.priority && r.madeAt < worst.madeAt)) worst = r;
    if (!worst || worst.priority >= priority) return false;
    this.release(worst.owner, 'made way for something more important');
    return true;
  }

  /** How much of a resource is booked away from a spender of this priority. */
  held(res, priority = 0, owner = null) {
    let n = 0;
    for (const r of this.book.values()) {
      if (r.owner === owner || r.priority < priority) continue;
      n += r.cost[res] || 0;
    }
    return n;
  }

  /** How close a booking is to being paid for, 0..1 - the worst-served line of its cost. */
  fill(r) {
    let worst = 1;
    for (const res of Object.keys(r.cost)) {
      const need = r.cost[res];
      if (need <= 0) continue;
      worst = Math.min(worst, this.bot.onHand(res) / need);
    }
    return worst;
  }

  /** Once a cycle: drop what is finished, what is no longer wanted, and what is going nowhere. */
  sweep() {
    const now = this.bot.g.time;
    const stall = this.cfg.reserveStallFor ?? 420;
    const ttl = this.cfg.reserveTtl ?? 1800;
    for (const r of [...this.book.values()]) {
      if (r.still && !r.still()) { this.release(r.owner, 'no longer wanted'); continue; }
      const f = this.fill(r);
      if (f >= 1) {
        // Paid for, and still not built: it is not the materials that are missing, it is the ground
        // or the crew. Holding the stock any longer only starves the rest of the base.
        if (r.paidAt == null) r.paidAt = now;
        if (now - r.paidAt > (this.cfg.reservePaidFor ?? 180)) this.release(r.owner, 'paid for, but it never got built');
        continue;
      }
      r.paidAt = null;
      if (f > r.best + 0.02) { r.best = f; r.moveAt = now; continue; }
      if (now - r.moveAt > stall) { this.release(r.owner, `nothing arrived in ${Math.round(stall / 60)} minutes`); continue; }
      if (now - r.madeAt > ttl) this.release(r.owner, 'open too long');
    }
    for (const [owner, until] of this.cool) if (until < now) this.cool.delete(owner);
    for (const [res, until] of this.shortCool) if (until < now) this.shortCool.delete(res);
  }
}

export class Bot {
  constructor(game, { every = 5, verbose = false } = {}) {
    this.g = game;
    this.every = every;
    this.verbose = verbose;
    this.acc = 0;
    this.marks = {};
    this.log = [];
    this.feas = new Map();
    this.roadTiles = 0;
    this.builds = 0;
    this.spotHint = new Map();
    this.spotFail = new Map();
    // materials booked for builds the bot has committed to; see the block above the class
    this.ledger = new Ledger(this);
    const pod = game.hq();
    // A four-tile lattice leaves one lane between rows for poles, crates and roads. Five looks
    // tidier and wastes sixty per cent of the ground: at five the base had filled every legal 4x4
    // within seventy tiles of the pod by hour three and the chemistry line was never built.
    const stride = BALANCE.bot?.latticeStride ?? 4;
    this.lattice = { ax: ((pod?.x ?? 0) % stride + stride) % stride, ay: ((pod?.y ?? 0) % stride + stride) % stride, stride };
    // how far out the bot is willing to build. It starts tight - inside the pod's link range the
    // whole base is one storage pool - and only widens when nothing will fit any more.
    this.reach = (BALANCE.bot?.compactRadius ?? 26);
    // how far it will ever spread. A fixed 72 was fine on a single 96-tile chunk and a hard ceiling
    // on the 288- and 480-tile grids the game actually runs: the bot filled its disc, stopped
    // building at seven hundred structures and the run went quiet with two thirds of the map empty.
    this.maxReach = BALANCE.bot?.maxReach ?? Math.max(72, Math.round(Math.min(game.map.width, game.map.height) * 0.42));
  }

  get cfg() { return BALANCE.bot || {}; }

  mark(key) {
    if (this.marks[key] != null) return;
    this.marks[key] = this.g.time;
    this.log.push({ t: Math.round(this.g.time), key });
    if (this.verbose) console.log(Math.round(this.g.time) + 's', key);
  }

  tick(dt = 1) {
    this.acc += dt;
    if (this.acc < this.every) return;
    this.acc = 0;
    const g = this.g;
    if (g.lost || g.won) return;
    // each phase gets its own build allowance, so one deep chain cannot spend the whole cycle and
    // leave the labs unbuilt - which is exactly what the first version of this bot did
    this.recipeCache = new Map();
    this.refreshInventory();
    this.queuedNow = 0;
    for (const st of g.structures) if (st.state !== 'done') this.queuedNow++;
    this.ledger.sweep();
    this.research();
    this.podWork();
    this.crew();
    this.budget = 2; this.power();
    this.budget = 3; this.infrastructure();
    this.budget = 5; this.supply();
    this.budget = 2; this.defence();
    this.budget = 2; this.logistics();
    if (this.g.ticks % 12 === 0) this.scanMore();          // keep looking: hidden patches gate whole chains
    this.explore();
    this.space();
    this.upkeep();
  }

  // ------------------------------------------------------------------ placement
  hub() { return this.g.hq() || this.g.structures[0] || { x: 10, y: 10, w: 4, h: 4 }; }
  hubCentre() { const h = this.hub(); return { x: h.x + (h.w || 4) / 2, y: h.y + (h.h || 4) / 2 }; }

  /**
   * **How many outlines the crew can actually be working on.**
   *
   * An outline costs its materials the moment it is put down, not when it is finished, and the bot
   * places from a dozen places every five seconds while four builders work through the queue one
   * job at a time. On volcanic that ended with **597 outlines standing unbuilt** - three arc
   * furnaces, three assemblers, 287 power poles - with every one of them holding the materials it
   * had been paid for. That is the same disease as spending a reservation: the base had made the
   * steel plate, and it was sitting in a rectangle on the ground that nobody would ever walk to.
   *
   * So the bot queues what its crew can get through and no more. The queue drains in seconds, so
   * this throttles rather than blocks, and everything that is not placed this cycle is placed the
   * next one - by which time the plan may have changed its mind, which is usually an improvement.
   */
  queueCap() {
    const g = this.g;
    let crew = 0;
    for (const u of g.units) if (u.alive && u.def.buildRate) crew++;
    for (const v of g.vehicles) if (v.alive && v.def.buildRate) crew++;
    return Math.max(4, Math.round(crew * (this.cfg.queuePerBuilder ?? 5)));
  }
  mayPlace() { return this.queuedNow < this.queueCap(); }

  /**
   * Put an outline down through the queue guard. `queueFree` is for swaps - replacing a drill with
   * a bigger one is not new work for the crew, it is the same building again.
   */
  place(type, x, y, { queueFree = false } = {}) {
    if (!queueFree && !this.mayPlace()) return null;
    const out = this.g.place(type, x, y);
    if (!out.ok) return null;
    this.queuedNow++;
    // an outline is paid for the moment it is put down, so the free-stock sums are stale until the
    // inventory is counted again - and every spender after this one is about to ask about them
    this.refreshInventory();
    return out;
  }

  /**
   * Nearest legal spot for a structure, spiralling out from (cx,cy). Keeping this radius inside the
   * pod's link range is what makes the base one storage pool instead of five.
   */
  spot(type, cx, cy, maxR = null) {
    const g = this.g;
    const def = g.data.structure[type];
    const fkey = def.size.w + 'x' + def.size.h + ':' + Math.round(cx) + ':' + Math.round(cy);
    if (g.time - (this.spotFail.get(fkey) ?? -1e9) < 40) return null;   // nothing fitted a moment ago
    // Machines go on a five-tile lattice. Dropping them wherever they fit fills the ground with
    // one- and two-tile holes, and then the first 4x4 building has nowhere to go on a map that is
    // still half empty. Five leaves a lane between every row for poles, crates and roads, and makes
    // the search twenty-five times cheaper as a bonus. Small things are placed off-grid, in the lanes.
    const L0 = this.lattice;
    const snap = !def.roadTier && (def.size.w >= 3 || def.size.h >= 3) && Math.max(def.size.w, def.size.h) <= L0.stride;
    const L = this.lattice;
    const keepClear = !def.requiresNode && !def.roadTier;
    // the base spreads only as fast as it fills: a tight base is one storage pool
    const hard = maxR ?? this.reach;
    const key = def.size.w + 'x' + def.size.h;
    // Start the search where a building of this size last fitted. The inner rings of a compact base
    // are solid, and walking them from scratch for every placement was most of the bot's cost.
    const hint = maxR != null ? 2 : Math.max(2, Math.min(hard - 8, (this.spotHint.get(key) || 2) - 4));
    // Try the lattice first, then anywhere: broken ground means a rigid grid alone would reject
    // nine cells in ten, but preferring it keeps the base a base rather than a rash.
    // A patch built over is a chain lost for the rest of the run. The bot used to have a last-ditch
    // pass that ignored patches when nothing else fitted, and by hour three it had paved its own
    // sulfur, oil and titanium - which is every science pack above the second tier. So the last pass
    // is only offered to things that *want* to be on a patch (drills, pumps) and to roads.
    const passes = snap
      ? [[hint, hard, true, true], [2, hint, true, true], [hint, hard, false, true], [2, hint, false, true]]
      : [[hint, hard, false, true], [2, hint, false, true]];
    if (!keepClear) passes.push([2, hard, false, false]);
    for (const [lo, hi, onGrid, avoidPatches] of passes) {
      if (hi <= lo) continue;
      let tried = 0;                                  // per pass, so a full outer ring never eats the inner one
      for (let k = ringStart(lo); k < RING.length; k++) {
        const e = RING[k];
        if (e[2] > hi) break;
        const x = Math.round(cx) + e[0], y = Math.round(cy) + e[1];
        if (onGrid && (((x - L.ax) % L.stride + L.stride) % L.stride || ((y - L.ay) % L.stride + L.stride) % L.stride)) continue;
        if (keepClear && avoidPatches && this.onPatch(x, y, def.size.w, def.size.h)) continue;
        if (++tried > 20000) break;
        if (!g.canPlace(type, x, y, { ignoreCost: true }).ok) continue;
        if (maxR == null) this.spotHint.set(key, e[2]);
        return { x, y };
      }
    }
    // nothing fitted anywhere: forget where this size last went, so the next try scans from scratch,
    // and do not try again for a little while
    this.spotHint.delete(key);
    this.spotFail.set(fkey, g.time);
    if (maxR == null) this.reach = Math.min(this.maxReach, this.reach + 6);
    return null;
  }

  /**
   * Is any of this footprint sitting on a resource patch? Putting a lab on the coal seam is the
   * single most expensive mistake this bot can make - the patch is gone for the rest of the run.
   * The last placement pass ignores this: a patch lost is cheaper than a machine never built.
   */
  onPatch(x, y, w, h) {
    const map = this.g.map;
    // one tile of margin: a drill is 3x3 and has to be able to sit somewhere on the disc, so a
    // building flush against the edge of a patch can still be the thing that blocks it
    for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= map.width || yy >= map.height) continue;
      const k = map.nodeAt[yy * map.width + xx];
      if (k >= 0 && !map.nodes[k].depleted) return true;
    }
    return false;
  }

  /**
   * Everything in every store, cached for the cycle. `available()` walks every building, and
   * affordability is asked hundreds of times a cycle while the bot looks for somewhere to put
   * things - on a 400-building base that was most of the simulator's running time.
   */
  refreshInventory() { this.inv = this.g.inventory(); return this.inv; }
  /** Everything in the stores, whoever it is spoken for. */
  onHand(res) { return (this.inv || this.refreshInventory())[res] || 0; }
  /**
   * What a spender may actually touch: what is in the stores minus what is booked for someone else.
   * `spend` is `{ owner, priority }` - the owner of a booking may spend its own, and a spender with
   * a high enough priority (defence with a wave inbound) ignores the ledger entirely.
   */
  have(res, spend = null) {
    const n = this.onHand(res);
    if (!this.ledger || !this.ledger.book.size) return n;
    return n - this.ledger.held(res, spend ? spend.priority ?? 0 : 0, spend ? spend.owner ?? null : null);
  }

  affordable(type, spend = null) {
    const def = this.g.data.structure[type];
    if (!def) return false;
    for (const [res, n] of Object.entries(def.cost || {})) if (this.have(res, spend) < n) return false;
    return true;
  }

  /**
   * "I want that building, and I am prepared to wait for it." Books its cost, so every other
   * spender works around the materials until it is up (or the ledger gives up on it).
   */
  wantToBuild(owner, type, { priority = RESERVE.plan, still = null } = {}) {
    const def = this.g.data.structure[type];
    if (!def || !this.g.isUnlocked(type)) return null;
    if (def.planetRequirement && !this.g.planetHas(def.planetRequirement)) return null;
    return this.ledger.reserve(owner, def.cost || {}, { priority, why: type, still });
  }

  /**
   * **Is this job worth booking for, or is it just short of change this minute?**
   *
   * Most of the time a build the bot cannot pay for is a build it will be able to pay for in twenty
   * seconds - the opening hour is nothing but that, and the first version of this booked three
   * opening smelters while the base held eleven plate and then could not build the drills that would
   * have made more. A structural shortage looks different: it does not clear. So a job has to have
   * been unaffordable continuously for `reserveAfter` before it may book anything, which the
   * transient ones never are and the chemical plant on volcanic always is.
   *
   * Call it every cycle with whether the job could be paid for; it keeps the clock.
   */
  wantedFor(owner, blocked, type = null) {
    this.blockedAt ||= new Map();
    this.shortBuilds ||= new Map();
    if (!blocked) { this.blockedAt.delete(owner); this.shortBuilds.delete(owner); return 0; }
    if (type) this.shortBuilds.set(owner, { type, at: this.g.time });
    const now = this.g.time;
    const since = this.blockedAt.get(owner);
    if (since == null) { this.blockedAt.set(owner, now); return 0; }
    return now - since;
  }

  /**
   * Place one building near the hub (or a given point), wire it up and make sure it has a store.
   *
   * `spend` is `{ owner, priority }`: the booking this build is paying for (so it may spend its own
   * reserved materials), and how much of the ledger it is allowed to ignore.
   */
  build(type, cx = null, cy = null, r = null, spend = null) {
    const g = this.g;
    if (!g.isUnlocked(type)) return null;
    const def = g.data.structure[type];
    if (def.planetRequirement && !g.planetHas(def.planetRequirement)) return null;
    if (!this.affordable(type, spend)) return null;
    const c = this.hubCentre();
    const p = this.spot(type, cx ?? c.x, cy ?? c.y, r);
    if (!p) return null;
    // A build the base has been saving up for goes in whether the queue is busy or not: it is the
    // thing everything else has been working around, and on volcanic three fully-paid bookings sat
    // open for a quarter of an hour because the queue was full of power poles.
    const booked = !!(spend && spend.owner && this.ledger.book.has(spend.owner));
    const out = this.place(type, p.x, p.y, { queueFree: booked });
    if (!out) return null;
    this.builds++;
    if (spend && spend.owner) { this.ledger.release(spend.owner); this.blockedAt?.delete(spend.owner); this.shortBuilds?.delete(spend.owner); }
    this.refreshInventory();
    this.connect(out.structure);
    this.ensureStore(out.structure);
    // a building the main pool cannot reach is a building that starves, however tidy it looks
    // an outline has no storage pool yet - pools are only worked out for finished buildings - so the
    // check that it can actually reach the base happens in upkeep() once it is standing
    if (out.structure.def.researchRate || g.data.recipesFor[type]?.length || out.structure.def.extractRate) this.chainToPool(out.structure);
    return out.structure;
  }

  /**
   * Is a power supplier's circle already over this spot? An outline has no network yet - networks
   * are only worked out for finished buildings - so asking the geometry is the only way to avoid
   * laying a line of poles to somewhere that is already covered.
   */
  powerReaches(s) {
    const cx = s.x + (s.w ?? s.def.size.w) / 2, cy = s.y + (s.h ?? s.def.size.h) / 2;
    const half = Math.max(s.w ?? s.def.size.w, s.h ?? s.def.size.h) / 2;
    return this.g.structures.some(p => p.state !== 'dead' && p.def.supplyRadius
      && Math.hypot(p.x + p.w / 2 - cx, p.y + p.h / 2 - cy) - half <= p.def.supplyRadius);
  }

  /** Same question for stores: will anything be able to hand this machine its inputs? */
  storeReaches(s) {
    const cx = s.x + (s.w ?? s.def.size.w) / 2, cy = s.y + (s.h ?? s.def.size.h) / 2;
    const half = Math.max(s.w ?? s.def.size.w, s.h ?? s.def.size.h) / 2;
    return this.g.structures.some(t => t.state !== 'dead' && isStore(t.def)
      && Math.hypot(t.x + t.w / 2 - cx, t.y + t.h / 2 - cy) <= (t.def.linkRadius || 0) + half + Math.max(t.w, t.h) / 2);
  }

  /** Run a line of poles from the nearest live supplier so a new building actually has power. */
  connect(s) {
    const g = this.g;
    if (!s.def.powerUse && !s.def.powerGen) return;
    if (!g.isUnlocked('power_pole')) return;
    if (g.time - (s.lastConnect ?? -1e9) < 20) return;
    s.lastConnect = g.time;
    if (this.powerReaches(s)) return;
    const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
    let from = null, bestD = Infinity;
    for (const p of g.structures) {
      if (p.state !== 'done' || !p.def.supplyRadius) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bestD) { bestD = d; from = p; }
    }
    if (!from) return;
    const fx = from.x + from.w / 2, fy = from.y + from.h / 2;
    const steps = Math.max(1, Math.ceil(bestD / (this.cfg.poleSpacing ?? 8)));
    const poleType = g.isUnlocked('substation') && this.affordable('substation') ? 'substation' : 'power_pole';
    for (let k = 1; k <= steps; k++) {
      const x = Math.round(fx + (cx - fx) * k / steps), y = Math.round(fy + (cy - fy) * k / steps);
      if (g.structures.some(p => p.def.supplyRadius && Math.hypot(p.x - x, p.y - y) < 6)) continue;
      const type = this.affordable(poleType) ? poleType : 'power_pole';
      const p = this.spot(type, x, y, 5);
      // Past the queue guard: a pole line is part of the building it powers, and that building was
      // already let into the queue. Through the guard, every line was dropped whenever the queue was
      // full - which is most of a mid-game run - and on arid at 03:20 seventeen finished machines
      // stood on no grid at all, among them the only tungsten drill, fourteen tiles from a pole.
      if (p) this.place(type, p.x, p.y, { queueFree: true });
    }
    g.dirty.power = true;
    recomputePower(g);
  }

  /** Every machine needs a store within reach or it jams on its own output. */
  /** The cheapest store that will actually join things up: a warehouse reaches twice as far. */
  /**
   * How many stores the bot will keep standing, scaled to the map. The caps are about ground and
   * clutter around the base, so they were written for one 96-tile chunk; on the 288- and 480-tile
   * grids the game actually runs they were spent by hour four and then *every* outpost built after
   * that was stranded - see `storeBudgetLeft`.
   */
  storeCap(type) {
    const tiles = this.g.map.width * this.g.map.height;
    const scale = Math.max(1, tiles / (96 * 96 * 4));       // 1 at the sim's 288x288, 2.8 at the UI's 480
    // Crates scale with the map; warehouses only with its square root. A crate is six iron plate and
    // a warehouse is eighteen *steel* plate, and steel is the material the mid-game is actually short
    // of - scaling both alike put most of a steel-poor world's entire steel output into storage.
    if (type === 'warehouse') return Math.round((this.cfg.maxWarehouses ?? 24) * Math.sqrt(scale));
    return Math.round((this.cfg.maxCrates ?? 36) * scale);
  }

  storeType() {
    const g = this.g;
    // a warehouse is 8000 units and reaches twice as far for four tiles more ground - always worth
    // it over another crate once it is researched
    if (g.isUnlocked('warehouse') && this.affordable('warehouse') && this.countBuild('warehouse') < this.storeCap('warehouse')) return 'warehouse';
    return 'storage_crate';
  }

  /**
   * Is there room in the store budget for another one?
   *
   * `connecting` is the important half. These caps stop the bot paving the base with crates it only
   * wants for capacity, and that is a fair thing to cap - but a crate laid to join a drill back to
   * the factory is not capacity, it is the whole reason the drill exists. On temperate the base
   * spent the last crate at about hour four, and from then on every lithium and titanium drill it
   * sank stood in a private pool of its own filling its hopper: 200 units mined in six hours, the
   * battery line never ran, the energy pack never ran, and research stopped dead at 47 nodes with
   * the planner reading 3.45 lithium a second of "capacity". Connection work gets triple the
   * allowance, because an unconnected outpost is worse than no outpost at all.
   */
  storeBudgetLeft(connecting = false) {
    const crates = this.countBuild('storage_crate');
    return crates < this.storeCap('crate') * (connecting ? 3 : 1);
  }

  /**
   * `rescue` is for a finished extractor no store reaches at all. It gets the connection budget
   * rather than the capacity budget and goes past the build-queue cap: the ordinary call quietly
   * gave up when the crate budget was spent or the queue was full, and temperate's two platinum
   * drills stood storeless for the rest of the run, so no truck could ever be sent for them.
   */
  ensureStore(s, { rescue = false } = {}) {
    const g = this.g;
    if (s.cap > 0 && isStore(s.def)) return;
    if (!s.def.recipes && !s.def.extractRate && !s.def.fuelInput && !s.def.researchRate && !g.data.recipesFor[s.type]?.length) return;
    // it is not enough for *a* store to reach this machine - it has to be a store joined up to the
    // rest of the base, or the machine sits in a private pool of one crate and starves
    const hq = g.hq();
    if (hq && this.poolReaches(s, hq)) return;
    const type = this.storeType();
    if (type === 'storage_crate' && !this.storeBudgetLeft(rescue)) return;
    const p = this.spot(type, s.x, s.y, 8);
    if (p && this.affordable(type)) { this.place(type, p.x, p.y, { queueFree: rescue }); g.dirty.links = true; }
  }

  /**
   * Join an outpost back to the main pool with a line of crates. A crate is five plate and reaches
   * ten tiles, so this is much cheaper than a truck for anything inside about fifty tiles - and it
   * is the difference between a drill feeding the factory and a drill filling its own hopper.
   */
  chainToPool(s) {
    const g = this.g;
    const hq = g.hq();
    if (!hq) return;
    if (g.dirty.links) recomputeLinks(g);
    const sx = s.x + (s.w ?? s.def.size.w) / 2, sy = s.y + (s.h ?? s.def.size.h) / 2;
    // the nearest store that is already part of the main pool - that is what we have to reach
    let anchor = null, bestD = Infinity;
    for (const t of g.structures) {
      if (t.state !== 'done' || !isStore(t.def) || t.pool !== hq.pool) continue;
      const d = Math.hypot(t.x + t.w / 2 - sx, t.y + t.h / 2 - sy) - (t.def.linkRadius || 0);
      if (d < bestD) { bestD = d; anchor = t; }
    }
    if (!anchor || bestD <= 0) return;                    // nothing to join to, or already joined
    // A warehouse reaches twice as far as a crate, so a long run wants warehouses even when the
    // base has had its fill of them: eight crates is 64 tiles and the ore that gates the rocket
    // chain sits 85 to 190 tiles out on a 288-tile map.
    const ax = anchor.x + anchor.w / 2, ay = anchor.y + anchor.h / 2;
    const far = Math.hypot(sx - ax, sy - ay) > 60;
    const type = far && g.isUnlocked('warehouse') && this.affordable('warehouse') ? 'warehouse' : this.storeType();
    const reach = (g.data.structure[type].linkRadius || 10) * 0.8;
    const n = Math.ceil(Math.hypot(sx - ax, sy - ay) / reach);
    // 14 hops of warehouse is 224 tiles - the far corner of the sim's map. Past that a truck is the
    // honest answer, and `outposts()` books one.
    if (n > 14) return;
    for (let k = 1; k <= n; k++) {
      if (!this.affordable(type)) return;
      if (type === 'storage_crate' && !this.storeBudgetLeft(true)) return;
      const x = Math.round(ax + (sx - ax) * k / n), y = Math.round(ay + (sy - ay) * k / n);
      // something already standing (or going up) here does the job
      if (g.structures.some(p => isStore(p.def) && Math.hypot(p.x - x, p.y - y) < reach * 0.6)) continue;
      const p = this.spot(type, x, y, 7);
      if (p) { this.place(type, p.x, p.y); g.dirty.links = true; }
    }
    recomputeLinks(g);
  }

  // ------------------------------------------------------------------ counting
  /**
   * A cheap stamp of "has anything been built or taken down since". A removal changes the length of
   * the building list, a placement always burns an id, and an upgrade does both - so a swap that
   * leaves the count where it was still changes the stamp. Everything memoised below is keyed on it,
   * which makes the memo safe to keep across a whole cycle rather than throwing it away per phase.
   */
  get stamp() { return this.g.structures.length + ':' + this.g.nextId; }

  /**
   * How many of this building are standing. Tallied once per build stamp rather than per question:
   * `infrastructure()` alone asks it thirty-five times a cycle, and on a thousand-building base
   * that was a thousand-element scan each time.
   */
  countBuild(type) {
    const key = this.stamp;
    if (this.typeTallyAt !== key) {
      this.typeTally = new Map();
      this.typeTallyAt = key;
      for (const s of this.g.structures) this.typeTally.set(s.type, (this.typeTally.get(s.type) || 0) + 1);
    }
    return this.typeTally.get(type) || 0;
  }
  countRecipe(id) { return this.g.structures.filter(s => s.recipe === id && s.state !== 'dead').length; }
  /** Every extractor standing on a live patch of this, grouped once per build stamp. */
  drillsOn(res) {
    const g = this.g;
    if (this.drillAt !== this.stamp) {
      this.drillMemo = new Map();
      this.drillAt = this.stamp;
      for (const s of g.structures) {
        const n = s.nodeId ? g.nodeById(s.nodeId) : null;
        if (!n || n.depleted) continue;
        const list = this.drillMemo.get(n.resource);
        if (list) list.push(s); else this.drillMemo.set(n.resource, [s]);
      }
    }
    return this.drillMemo.get(res) || [];
  }

  /**
   * Units a second every extractor on this resource can manage between them.
   *
   * Memoised on the build stamp. `plan()` walks about fifty resources and asks this for each of
   * them, every cycle; on a fifteen-hundred-building base that was the single most expensive thing
   * the bot did, and the answer cannot change unless something was built or taken down.
   */
  extractionOf(res) {
    const g = this.g;
    if (this.extractAt !== this.stamp) { this.extractMemo = new Map(); this.extractAt = this.stamp; }
    if (this.extractMemo.has(res)) return this.extractMemo.get(res);
    let rate = 0;
    for (const s of this.drillsOn(res)) {
      if (this.cannotRun(s)) continue;
      const n = g.nodeById(s.nodeId);
      rate += (s.def.extractRate || 0) * (n?.richness ?? 1) * g.diff.extract * g.techEffect('extractRate', 1);
    }
    // the quarry and the biomass harvester take from the ground rather than a node
    for (const s of g.structures) {
      if (s.state === 'dead' || !s.def.extractRate) continue;
      if (s.def.yields?.[res]) rate += s.def.extractRate * s.def.yields[res] * g.diff.extract;
      else if (s.def.harvestsTerrain && res === 'biomass') rate += s.def.extractRate * g.diff.extract;
    }
    this.extractMemo.set(res, rate);
    return rate;
  }

  /** Unlocked recipes that make this resource, best machine first. */
  producersOf(res, onlyUnlocked = true) {
    const g = this.g;
    return g.data.recipes.filter(r => (r.outputs || {})[res] > 0 && (!onlyUnlocked || g.isUnlocked(r.id)))
      .filter(r => r.machines.some(m => g.isUnlocked(m) && (!g.data.structure[m].planetRequirement || g.planetHas(g.data.structure[m].planetRequirement))) || !onlyUnlocked);
  }

  /** Could this world ever produce this resource, researched or not? Memoised per run. */
  feasible(res, depth = 0) {
    if (this.feas.has(res)) return this.feas.get(res);
    if (depth > 8) return false;
    const g = this.g;
    if (g.planetHas(res)) { this.feas.set(res, true); return true; }
    this.feas.set(res, false);                             // break cycles while we look
    let ok = false;
    for (const r of this.producersOf(res, false)) {
      if (Object.keys(r.inputs || {}).every(i => this.feasible(i, depth + 1))) { ok = true; break; }
    }
    this.feas.set(res, ok);
    return ok;
  }

  /** Units a second one machine of this type makes of this resource. */
  machineRate(recipe, res, machineType) {
    const def = this.g.data.structure[machineType];
    const speed = (def?.speed ?? 1) * this.g.techEffect('craftSpeed', 1);
    return (recipe.outputs[res] || 0) / (recipe.time / Math.max(0.05, speed));
  }

  /** The machine type to build for a recipe: the fastest one that is researched and legal here. */
  machineFor(recipe) {
    const g = this.g;
    const usable = recipe.machines
      .filter(m => g.isUnlocked(m) && (!g.data.structure[m].planetRequirement || g.planetHas(g.data.structure[m].planetRequirement)))
      .sort((a, b) => (g.data.structure[a].speed || 1) - (g.data.structure[b].speed || 1));
    for (let i = usable.length - 1; i >= 0; i--) if (this.affordable(usable[i])) return usable[i];
    return usable[0] || null;
  }

  // ------------------------------------------------------------------ the chain planner
  /**
   * Two passes, once every bot cycle.
   *
   * **Plan** walks the recipe tree behind every demand and adds up how much of every intermediate
   * and every ore that actually implies. Doing the adding up first is the whole point: three
   * different demands all want copper wire, and the drill count has to cover the total rather than
   * whichever branch happened to be walked last.
   *
   * **Act** then works from the raw end inwards - a smelter with no ore is worth nothing - and
   * builds at most a handful of things per cycle so the base grows rather than lurching.
   */
  supply() {
    const { need, depth } = this.plan();
    // most starved first. "How far below what I need am I" is the whole widening rule: the thing
    // every machine is waiting on has the worst ratio, so it gets the next drill or the next
    // machine, and the jam clears from the bottom up.
    const cap = this.capacityTable();
    const ratio = res => (cap.get(res) || 0) / Math.max(1e-6, need.get(res));
    const scored = [...need.keys()].map(res => [res, ratio(res), depth.get(res) || 0]);
    scored.sort((a, b) => a[1] - b[1] || b[2] - a[2]);
    // Tried and rejected: reserving part of the budget for the shallow end (the finished goods).
    // It sounds right - the deep ore chains can never catch up, so they win every cycle - but the
    // sim says the opposite. Building an assembler before the plate line can feed it just moves the
    // jam up a level, and the run went from 65 research nodes in six hours to 28.
    for (const [res] of scored) {
      if (this.budget <= 0) return;
      this.provide(res, need.get(res));
    }
  }

  /**
   * Units a second the base can currently manage of every resource, dug and made, in one pass.
   * One walk of the building list instead of one per resource.
   */
  capacityTable() {
    const g = this.g;
    const cap = new Map();
    const add = (res, n) => cap.set(res, (cap.get(res) || 0) + n);
    const techBonus = g.techEffect('extractRate', 1);
    for (const s of g.structures) {
      if (s.state === 'dead') continue;
      // A finished machine that cannot run is not capacity. Counting it was how arid's only tungsten
      // drill - no power, never dug a unit - read as 1.7x the tungsten the plan wanted, so the planner
      // never built another one and the launch pad never got its seven bars.
      if (this.cannotRun(s)) continue;
      if (s.def.extractRate) {
        if (s.nodeId) { const n = g.nodeById(s.nodeId); if (n && !n.depleted) add(n.resource, s.def.extractRate * (n.richness ?? 1) * g.diff.extract * techBonus); }
        else if (s.def.yields) for (const [r, share] of Object.entries(s.def.yields)) add(r, s.def.extractRate * share * g.diff.extract);
        else if (s.def.harvestsTerrain) add('biomass', s.def.extractRate * g.diff.extract);
      }
      if (!s.recipe) continue;
      const r = g.data.recipe[s.recipe];
      if (!r) continue;
      for (const res of Object.keys(r.outputs || {})) add(res, this.machineRate(r, res, s.type));
    }
    this.cap = cap;
    return cap;
  }
  capacityOf(res) { return (this.cap || this.capacityTable()).get(res) || 0; }

  /**
   * A finished building that will produce nothing however long it stands: it needs power and is on
   * no grid, or it makes or digs things and no store at all can take them. Outlines are not counted
   * here - they are on their way - and neither is a machine in an outpost pool of its own, which is
   * what a truck route is for.
   */
  cannotRun(s) {
    if (s.state !== 'done') return false;
    if (s.def.powerUse && (s.net == null || s.net < 0)) return true;
    if ((s.def.extractRate || s.recipe) && !isStore(s.def) && (s.pool == null || s.pool < 0)) return true;
    return false;
  }

  /**
   * Demands are what a finished base wants. Asking for all of it in the first ten minutes just
   * builds twelve smelters with no coal, so the whole table ramps up with the research count.
   */
  get ramp() { return Math.min(1, 0.35 + this.g.research.done.length * 0.045); }

  /** Add up what every demand really implies, all the way down to the ore. */
  plan() {
    const g = this.g;
    const need = new Map(), depth = new Map();
    const visit = (res, rate, d, path) => {
      if (d > 9 || rate <= 1e-6 || path.has(res)) return;
      need.set(res, (need.get(res) || 0) + rate);
      depth.set(res, Math.max(depth.get(res) || 0, d));
      const def = g.data.resource[res];
      if (!def) return;
      if (RAW_KINDS.has(def.kind) && g.planetHas(res) && this.extractionOf(res) >= rate * 0.5) return;
      if (RAW_KINDS.has(def.kind) && g.planetHas(res) && this.diggable(res)) return;
      const recipe = this.bestRecipe(res);
      if (!recipe) return;
      const p = new Set(path); p.add(res);
      for (const [inp, n] of Object.entries(recipe.inputs || {})) visit(inp, rate * n / recipe.outputs[res], d + 1, p);
    };
    const ramp = this.ramp;
    for (const dmd of DEMANDS) {
      if (dmd.after && !g.isUnlocked(dmd.after)) continue;
      visit(dmd.res, dmd.rate * ramp, 0, new Set());
    }
    // A generator is a customer too. Nine combustion generators burn 2.25 coal a second between
    // them, which was every scrap the drills could dig - so the smelters starved, the plate line
    // stopped, and the run died with a full power bar. Whatever is standing gets counted.
    for (const [res, rate] of this.fuelDemand()) visit(res, rate, 0, new Set());
    // and so are the labs
    for (const [res, rate] of this.packDemand()) visit(res, rate, 0, new Set());
    // And so is a building the bot has decided on and cannot pay for. Recipes are the only thing
    // DEMANDS walks, and a handful of materials are only ever a *building* cost: tungsten bar (the
    // alloy foundry, the launch pad), control units and machine frames (the rocket buildings). On
    // temperate nothing ever asked for tungsten bar, so no tungsten smelter was built, so the alloy
    // foundry could never be paid for, so alloy plate stayed at zero and there was never a launch
    // pad - and the ledger refused to book any of it, correctly, because nothing was making it. The
    // shortfall of every blocked build is demand, spread over `shortfallHorizon` seconds.
    const horizon = this.cfg.shortfallHorizon ?? 600;
    for (const [owner, want] of this.shortBuilds || []) {
      if (g.time - want.at > 120) { this.shortBuilds.delete(owner); continue; }
      for (const [res, n] of Object.entries(g.data.structure[want.type]?.cost || {})) {
        const short = n - this.onHand(res);
        if (short > 0) visit(res, Math.max(0.02, short / horizon), 1, new Set());
      }
    }
    return { need, depth };
  }

  /**
   * Science packs the labs standing right now will actually draw, per second.
   *
   * The fixed rates in DEMANDS were written for three labs and never moved: by the time eighteen
   * labs were up they wanted about three chemical packs a second and the bot was building a factory
   * for a fifth of one. Research is the factory's throughput in this game, so the pack line has to
   * be sized off the lab line, not off a constant.
   */
  packDemand() {
    const g = this.g;
    const out = new Map();
    let rate = 0;
    for (const s of g.structures) if (s.state !== 'dead' && s.def.researchRate) rate += s.def.researchRate;
    rate *= g.techEffect('researchRate', 1) * g.diff.research;
    if (rate <= 0) return out;
    // what the next few nodes on the list cost per unit of work - the mix shifts up a tier at a time
    const next = RESEARCH_ORDER.filter(id => !g.research.done.includes(id))
      .map(id => g.data.tech[id]).filter(t => t && g.canResearch(t.id).ok || t && (t.requires || []).every(r => g.research.done.includes(r)))
      .slice(0, 6);
    const pool = next.length ? next : [g.data.tech[g.research.current]].filter(Boolean);
    // clamped, and ramped with the research count: asking for the full three packs a second the
    // labs could eat pulls an ore demand the opening base cannot begin to serve, and the planner
    // then spends every build on the deepest starving chain while the plate line sits at twelve
    const cap = (this.cfg.maxPackRate ?? 0.6) * this.ramp;
    for (const t of pool) for (const [res, n] of Object.entries(t.cost || {})) {
      out.set(res, Math.min(cap, Math.max(out.get(res) || 0, rate * n / Math.max(1, t.work) * this.ramp)));
    }
    return out;
  }

  /**
   * What the generators (and the fuel-burning trucks) will want per second if they all run flat out,
   * with a little headroom. Returned as [resource, rate] pairs so plan() can walk the chain behind
   * each one - a base burning refined fuel needs an oil chain, not another coal drill.
   */
  fuelDemand() {
    const g = this.g;
    const out = new Map();
    const add = (res, n) => out.set(res, (out.get(res) || 0) + n);
    for (const s of g.structures) {
      if (s.state === 'dead' || !s.def.powerGen) continue;
      const fuels = Object.entries({ ...(s.def.fuelInput || {}), ...(s.def.altFuel || {}) });
      // what it is burning now; failing that, whatever this world can simply dig, because a
      // combustion generator on a world with no oil yet is a coal customer, not a fuel customer
      const choice = (s.fuelChoice && [s.fuelChoice[0], s.fuelChoice[1]])
        || fuels.find(([res]) => g.planetHas(res) && this.diggable(res))
        || fuels[0];
      if (choice) add(choice[0], choice[1] * (this.cfg.fuelHeadroom ?? 1.15));
      for (const [res, perSec] of Object.entries(s.def.coolant || {})) add(res, perSec);
    }
    for (const v of g.vehicles) {
      if (!v.alive || !v.def.fuelUse) continue;
      add('fuel', v.def.fuelUse);                 // every truck in the game burns refined fuel
    }
    return out;
  }

  /** Is there a scanned patch of this we could still put a drill on (or one already running)? */
  diggable(res) {
    if (this.digAt !== this.stamp) { this.digMemo = new Map(); this.digAt = this.stamp; }
    if (this.digMemo.has(res)) return this.digMemo.get(res);
    const out = this.diggableUncached(res);
    this.digMemo.set(res, out);
    return out;
  }

  diggableUncached(res) {
    const g = this.g;
    if (this.drillsOn(res).length) return true;
    // a patch we own no machine for is not a patch: biomass sits in "organic" nodes that no drill
    // and no pump will ever claim, and treating it as diggable is how the bot starved its
    // generators of the one fuel this world grows back
    return g.map.nodes.some(n => n.resource === res && n.scanned
      && this.extractorTypes(n).some(t => g.isUnlocked(t)) && (!n.depleted || g.isUnlocked('deep_bore')));
  }

  /**
   * A machine that takes this out of the ground with no node at all - the quarry for stone and sand,
   * the biomass harvester for the growth around it. Renewable fuel is the answer to a coal patch
   * running dry, and the bot could not reach it until this existed.
   */
  terrainExtractorFor(res) {
    const g = this.g;
    const rate = d => (d.extractRate || 0) * (d.yields?.[res] ?? 1);
    return g.data.structures
      .filter(d => (d.yields?.[res] > 0) || (d.harvestsTerrain && res === 'biomass'))
      .filter(d => g.isUnlocked(d.id) && (!d.planetRequirement || g.planetHas(d.planetRequirement)))
      .sort((a, b) => rate(b) - rate(a))[0] || null;
  }

  /** Put one of those down: a harvester wants growth under it, a quarry only wants room. */
  addTerrainExtractor(def) {
    const g = this.g;
    if (!this.affordable(def.id)) return false;
    let at = null;
    if (def.harvestsTerrain) {
      const c = this.hubCentre();
      let best = -1;
      for (let k = 0; k < RING.length && RING[k][2] <= 44; k += 3) {
        const x = Math.round(c.x + RING[k][0]), y = Math.round(c.y + RING[k][1]);
        if (x < 2 || y < 2 || x >= g.map.width - 2 || y >= g.map.height - 2) continue;
        let trees = 0;
        const r = def.harvestRadius || 8;
        for (let dy = -r; dy <= r; dy += 2) for (let dx = -r; dx <= r; dx += 2) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= g.map.width || yy >= g.map.height) continue;
          if (g.map.forest[yy * g.map.width + xx]) trees++;
        }
        if (trees > best && g.canPlace(def.id, x, y, { ignoreCost: true }).ok) { best = trees; at = { x, y }; }
      }
      if (best <= 0) return false;
    }
    const s = at ? this.build(def.id, at.x, at.y, 8) : this.build(def.id);
    if (!s) return false;
    this.mark('harvest:' + def.id);
    this.budget--;
    return true;
  }

  /** The recipe this bot would use to make a resource here: researched, feasible, least strained. */
  bestRecipe(res) {
    this.recipeCache ||= new Map();
    if (this.recipeCache.has(res)) return this.recipeCache.get(res);
    const options = this.producersOf(res).filter(r => Object.keys(r.inputs || {}).every(i => this.feasible(i)));
    options.sort((a, b) => this.recipeStrain(a) - this.recipeStrain(b));
    const pick = options[0] || null;
    this.recipeCache.set(res, pick);
    return pick;
  }

  /** Make sure this world can actually manage `rate` a second of one resource. */
  provide(res, rate) {
    const g = this.g;
    const def = g.data.resource[res];
    if (!def) return;
    // Anything the ground here still holds gets dug, not crafted. Letting the planner fall back to a
    // recipe while there are patches left is how the sim ended up with thirteen rock crushers
    // grinding stone into iron ore next to five iron patches nobody had put a drill on.
    if (RAW_KINDS.has(def.kind) && g.planetHas(res) && this.diggable(res)) {
      if (this.extractionOf(res) >= rate * 1.05) return;    // enough is already coming out of the ground
      const dug = this.extractionOf(res);
      this.addExtractor(res);                               // another patch, or a bigger drill on one
      if (this.extractionOf(res) > dug) return;             // digging is getting somewhere; leave it to it
      // Digging is the first answer and usually the only one. But when there is no unclaimed patch
      // left *and* the drills are still under half of what the plan wants, a recipe that makes the
      // same thing out of something plentiful is worth building alongside them. Two cases matter:
      //
      //  - sulfur, which gates sulfuric acid, which gates the chemical pack. Every world that failed
      //    in this pass failed the same way - research stopped dead at 29 nodes, so no steel plate
      //    and no circuits, so nothing but watchtowers, so the wave-20 boss walked in. Sulfur comes
      //    in two or three small scarce patches; "Sweeten Crude" pulls it out of oil, which every
      //    world has, and the bot could never reach that recipe while `diggable` was true.
      //  - iron on an ore-poor world, where the rock crusher is the only way past the patch count.
      //
      // The guard is what stops this becoming the old bug of thirteen crushers grinding stone into
      // iron ore next to five patches nobody had drilled: if `addExtractor` managed to raise the dig
      // rate at all this cycle, digging is still the answer and we leave it alone. Asking instead
      // whether an unclaimed patch *exists* was not enough - volcanic is rough ground, and a scanned
      // patch that no 3x3 drill will fit on stays unclaimed for ever, so the bot waited on it for
      // the whole run and never built the one recipe that would have unstuck the tree.
      if (this.extractionOf(res) >= rate * 0.5) return;
    } else
    // no patch this world can dig, but perhaps a machine that simply eats the ground
    if (RAW_KINDS.has(def.kind) && this.extractionOf(res) < rate * 1.05) {
      const ground = this.terrainExtractorFor(res);
      if (ground && (g.structures.filter(x => x.type === ground.id && x.state !== 'dead').length < (this.cfg.maxHarvesters ?? 14))) {
        if (this.addTerrainExtractor(ground)) return;
      }
    }
    const recipe = this.bestRecipe(res);
    if (!recipe) return;
    const type = this.machineFor(recipe);
    if (!type) return;
    const per = this.machineRate(recipe, res, type);
    if (per <= 0) return;
    const want = Math.min(this.cfg.maxPerRecipe ?? 20, Math.ceil(rate / per));
    const have = g.structures.filter(s => s.recipe === recipe.id).length;
    if (have >= want) return;
    // one machine for a recipe nothing is feeding is a diagnosis; six of them is a jam
    if (have > 0 && !Object.keys(recipe.inputs || {}).every(i => this.arriving(i))) return;
    const idle = g.structures.find(s => s.state === 'done' && !s.recipe && s.type === type);
    if (idle) { g.setRecipe(idle.id, recipe.id); this.mark('recipe:' + recipe.id); return; }
    const spend = { owner: 'chain:' + recipe.id, priority: RESERVE.chain };
    const built = this.build(type, null, null, null, spend);
    if (built) { g.setRecipe(built.id, recipe.id); this.mark('recipe:' + recipe.id); this.budget--; return; }
    // `supply()` walks the plan worst-served first, so the machine that cannot be paid for here is
    // the one the whole base is waiting behind - a chemical plant on a world that spends its steel
    // plate as fast as it rolls. Book it.
    const blocked = !this.affordable(type, spend);
    if (this.wantedFor(spend.owner, blocked, type) > (this.cfg.reserveAfter ?? 120)) {
      this.wantToBuild(spend.owner, type, {
        priority: RESERVE.chain,
        still: () => this.countRecipe(recipe.id) < want && this.g.isUnlocked(type),
      });
    }
  }

  /**
   * Can a chain of stores already get from here back to the pod? Union-find over the stores, but
   * only the ones near the line - an outline has no pool of its own yet.
   */
  poolReaches(s, hq) {
    const g = this.g;
    const cx = s.x + (s.w ?? s.def.size.w) / 2, cy = s.y + (s.h ?? s.def.size.h) / 2;
    // *any* store of the main pool that reaches this machine will do. Asking only about the nearest
    // store was why the bot ended a run with a hundred and twenty crates: a private crate a tile
    // closer than the warehouse answered "no" and it built another one, every time.
    for (const t of g.structures) {
      if (t.state !== 'done' || !isStore(t.def) || t.pool !== hq.pool) continue;
      if (Math.hypot(t.x + t.w / 2 - cx, t.y + t.h / 2 - cy) - (t.def.linkRadius || 0) <= 0) return true;
    }
    return false;
  }

  /** Is this resource actually turning up - in a store, out of the ground, or off a machine? */
  arriving(res) {
    const g = this.g;
    if (available(g, res) > 0) return true;
    if (this.extractionOf(res) > 0) return true;
    // a machine that has never finished a craft is not a supply, it is a symptom
    return g.structures.some(s => s.recipe && s.crafted > 0 && (g.data.recipe[s.recipe]?.outputs || {})[res] > 0);
  }

  /** How short of its inputs a recipe currently is - used to pick between two ways of making a thing. */
  recipeStrain(recipe) {
    const g = this.g;
    let strain = 0;
    for (const inp of Object.keys(recipe.inputs || {})) {
      if (!this.feasible(inp)) return 1e6;
      if (available(g, inp) < 10) strain += 1;
    }
    return strain;
  }

  /**
   * Put an extractor on this resource. Nearest unclaimed patch first; when everything is claimed it
   * upgrades the drill on the richest patch instead, which is the only way to get more out of a
   * resource whose patches are all taken.
   */
  addExtractor(res) {
    const g = this.g;
    if (!this.affordableAnyDrill()) return false;
    // clear anything sitting on an empty patch first
    for (const s of g.structures) {
      const n = s.nodeId ? g.nodeById(s.nodeId) : null;
      if (n && n.depleted && s.def.extractRate && !s.def.infinite) g.removeStructure(s.id, { refund: 0.8, reason: 'node ran dry' });
    }
    const canBore = g.isUnlocked('deep_bore');
    const nodes = g.map.nodes.filter(n => n.scanned && n.resource === res && n.claimedBy == null && (!n.depleted || canBore));
    const hq = g.hq();
    if (!hq) return false;
    if (!nodes.length) {
      if (this.upgradeDrill(res)) return true;
      return this.scanMore();
    }
    // near the base beats rich, but not by much - a rich patch is worth a crate chain
    nodes.sort((a, b) => (Math.hypot(a.x - hq.x, a.y - hq.y) / Math.max(0.4, a.richness)) - (Math.hypot(b.x - hq.x, b.y - hq.y) / Math.max(0.4, b.richness)));
    for (const node of nodes.slice(0, 10)) {
      const types = this.extractorTypes(node);
      for (const type of types) {
        if (!g.isUnlocked(type) || !this.affordable(type, EXTRACT)) continue;
        const def = g.data.structure[type];
        // dead centre of the patch first. Working out from a corner is how the old bot kept dropping
        // a drill meant for coal onto the stone patch next door - the footprint claims whichever
        // node covers most of it.
        for (const [dx, dy] of OFFSETS) {
          const x = node.x - (def.size.w >> 1) + dx, y = node.y - (def.size.h >> 1) + dy;
          if (!g.canPlace(type, x, y).ok) continue;
          const out = this.place(type, x, y);
          if (!out) continue;
          if (out.structure.nodeId !== node.id) {              // it grabbed the wrong patch
            const got = g.nodeById(out.structure.nodeId);
            if (!got || got.resource !== res) { g.removeStructure(out.structure.id, { refund: 1, reason: 'wrong patch' }); continue; }
          }
          this.builds++;
          this.connect(out.structure);
          this.ensureStore(out.structure);
          this.chainToPool(out.structure);
          this.mark('drill:' + res);
          this.budget--;
          return true;
        }
      }
    }
    return false;
  }

  extractorTypes(node) {
    const list = EXTRACTOR_FOR[node.kind];
    if (list) return list;
    if (node.resource === 'magma') return ['geothermal_tap'];
    if (node.kind === 'organic') return [];               // nothing claims a growth patch; see terrainExtractorFor
    // A patch that is nearly out gets the bore that follows the seam instead of a drill that will
    // be standing on nothing in twenty minutes. Patches run dry around hour five otherwise, and a
    // coal patch running dry takes the generators - and with them the whole factory - down with it.
    if (node.depleted) return ['deep_bore'];
    if (node.amount < node.initial * 0.4) return ['deep_bore', 'drill_mk3', 'drill_mk2', 'drill_mk1'];
    return ['drill_mk3', 'drill_mk2', 'drill_mk1'];
  }
  affordableAnyDrill() {
    return ['drill_mk1', 'drill_mk2', 'drill_mk3', 'deep_bore', 'fluid_pump', 'gas_extractor', 'ice_harvester']
      .some(t => this.g.isUnlocked(t) && this.affordable(t, EXTRACT));
  }

  /** Every patch of this ore is taken - put a bigger drill on the richest one instead. */
  upgradeDrill(res) {
    const g = this.g;
    // once a seam is half gone the bore is worth more than a faster drill, whatever the rate says
    const running = this.drillsOn(res).filter(s => s.state === 'done');
    const thin = running.every(s => (g.nodeById(s.nodeId)?.amount ?? 0) < (g.nodeById(s.nodeId)?.initial ?? 1) * 0.5);
    const order = thin && g.isUnlocked('deep_bore') ? ['deep_bore', 'drill_mk3', 'drill_mk2'] : ['drill_mk3', 'drill_mk2'];
    const better = order.find(t => g.isUnlocked(t) && this.affordable(t, EXTRACT));
    if (!better) return false;
    const cur = running
      .filter(s => s.type !== better && ((s.def.extractRate || 0) < g.data.structure[better].extractRate || g.data.structure[better].infinite))
      .sort((a, b) => (g.nodeById(a.nodeId)?.richness ?? 0) - (g.nodeById(b.nodeId)?.richness ?? 0));
    const target = cur[cur.length - 1];
    if (!target) return false;
    const { x, y } = target;
    g.removeStructure(target.id, { refund: 0.9, reason: 'upgraded' });
    const out = this.place(better, x, y, { queueFree: true });
    if (!out) { this.place(target.type, x, y, { queueFree: true }); return false; }
    this.connect(out.structure); this.ensureStore(out.structure); this.chainToPool(out.structure);
    this.mark('upgrade:' + res + ':' + better);
    this.budget--;
    return true;
  }

  /**
   * Is the bot planning for something this world holds but nothing has ever seen? That is the only
   * reason worth spending plate on towers past the ordinary budget - and it is a real one, because
   * a single unfound seam closes a whole branch of the tree for the rest of the run. Cached for a
   * minute: it walks the plan and the node list, and the answer does not change quickly.
   */
  wantsUnfoundOre() {
    const g = this.g;
    if (g.time - (this.huntAt ?? -1e9) < 60) return this.hunting;
    this.huntAt = g.time;
    this.hunting = false;
    const { need } = this.plan();
    for (const res of need.keys()) {
      const def = g.data.resource[res];
      if (!def || !RAW_KINDS.has(def.kind) || !g.planetHas(res)) continue;
      // Enough already coming out of the ground is the only real answer to "should I keep looking".
      // Asking instead whether *a* patch had ever been scanned was far too weak: on volcanic one of
      // the four sulfur patches was scanned and drilled, which gave 0.99 sulfur a second against the
      // 4.7 the plan wanted, the bot counted sulfur as "found" and stopped sweeping, and the acid
      // line - and with it the chemical pack, and with it the whole middle of the research tree -
      // never ran. The other three patches sat in the dark for the whole run.
      //
      // The threshold has to be low, though. At 0.6 the answer was "yes" for something almost all the
      // time on a mid-game base, the scanner budget stayed doubled for the whole run, and ninety-odd
      // towers at 35 kW each took arid's grid and its plate with them. A quarter of what is wanted
      // means a chain that is genuinely closed, not one that is merely behind.
      if (this.extractionOf(res) >= need.get(res) * (this.cfg.huntBelow ?? 0.25)) continue;
      // something scanned and unclaimed is a patch to drill, not a reason to go looking for more
      if (g.map.nodes.some(n => n.resource === res && n.scanned && n.claimedBy == null && !n.depleted)) continue;
      this.hunting = true;
      break;
    }
    return this.hunting;
  }

  /**
   * Sweep the map for patches, systematically rather than randomly: the next tower goes wherever
   * the existing ones do not reach. Everything underground is hidden until something looks at it,
   * so a chain that needs sulfur on a world with no sulfur in the opening ring is stuck until this
   * has covered enough ground to find some.
   */
  scanMore() {
    const g = this.g;
    if (g.fog.everything) return false;
    const towers = g.structures.filter(s => s.def.scanRadius);
    // Scaled to the map, not a constant. Patches are hidden until something looks at them, so
    // scanning coverage is the real cap on how much ore the base can ever dig - and eight towers
    // that covered a 96-tile chunk leave two thirds of a 288-tile grid dark.
    //
    // There are two caps, and which one applies depends on whether the bot is actually missing
    // something. A tower is 10 plate and 35 kW, and simply raising the cap so the far corners get
    // covered spends the opening hour's plate on towers instead of guns: the base died at 01:42 on
    // temperate with 96 scanners up. So the normal budget stays modest, and the bot is only allowed
    // to keep sweeping while a resource it has planned for has no scanned patch anywhere - which on
    // temperate is titanium, whose only two patches are 172 and 188 tiles out.
    const area = g.map.width * g.map.height;
    const perTower = this.cfg.tilesPerScanner ?? 1850;
    const soft = Math.min(this.cfg.maxScanners ?? 48, Math.max(8, Math.round(area / perTower)));
    const cap = this.wantsUnfoundOre() ? Math.min(this.cfg.maxScannersHunting ?? 96, Math.round(soft * 2)) : soft;
    if (towers.length >= cap) return false;
    if (g.time - (this.lastScanBuild ?? -1e9) < 25) return false;
    const long = g.isUnlocked('long_radar') && this.affordable('long_radar');
    const type = long ? 'long_radar' : 'scanner_tower';
    if (!g.isUnlocked(type) || !this.affordable(type)) return false;
    // asked once, not once per tower per map cell: inside the loop below this was a fifth of a whole
    // simulator run once the tower count reached the forties
    const scanBonus = g.techEffect('scanRadius', 1);
    const r = g.data.structure[type].scanRadius * scanBonus;
    // the uncovered spot with the most map around it
    let best = null, bestScore = -Infinity;
    for (let y = 6; y < g.map.height - 6; y += 6) for (let x = 6; x < g.map.width - 6; x += 6) {
      let covered = false;
      for (const t of towers) {
        const tr = t.def.scanRadius * scanBonus;
        if (Math.hypot(t.x - x, t.y - y) < tr * 0.85) { covered = true; break; }
      }
      if (covered) continue;
      const hq = g.hq();
      const score = -Math.hypot(x - (hq?.x ?? 0), y - (hq?.y ?? 0));   // nearest uncovered ground first
      if (score > bestScore) { bestScore = score; best = { x, y }; }
    }
    if (!best) return false;
    this.lastScanBuild = g.time;
    const s = this.build(type, best.x, best.y, 12);
    if (s) { this.mark('scan:' + towers.length); return true; }
    return false;
  }

  // ------------------------------------------------------------------ one-off buildings
  infrastructure() {
    const g = this.g;
    // labs, radars and yards are worth having, but not at the price of the plate line - a base that
    // spends its landing kit on buildings that make nothing never recovers
    if (this.have('iron_plate') < 60 && this.capacityOf('iron_plate') < 0.5) return;
    for (const step of INFRA) {
      if (this.budget <= 0) return;
      if (step.after && !g.research.done.includes(step.after)) continue;
      if (!g.isUnlocked(step.build)) continue;
      if (this.countBuild(step.build) >= step.n) continue;
      const spend = { owner: 'infra:' + step.build, priority: step.saveFor ? RESERVE.rocket : RESERVE.plan };
      const s = this.build(step.build, null, null, null, spend);
      if (s) { this.mark('build:' + step.build); this.budget--; continue; }
      // Could not pay for it. The launch pad is eighty concrete and forty steel plate, and the
      // rocket assembly thirty *alloy* plate: lumps like that never turn up in a base that spends
      // everything it makes, so the step books its materials and the rest of the bot works around
      // them. If it were only the ground that was missing there is nothing to save up for, so this
      // asks about the money rather than about the build.
      const blocked = !this.affordable(step.build, spend);
      if (this.wantedFor(spend.owner, blocked, step.build) > (this.cfg.reserveAfter ?? 120)) {
        this.wantToBuild(spend.owner, step.build, { priority: spend.priority, still: () => this.countBuild(step.build) < step.n });
      }
    }
  }

  /**
   * Keep the building crew alive in numbers.
   *
   * Nothing replaced a dead builder. The bot spawned guards when it wanted them and left the four it
   * landed with to wear out, which is invisible on a quiet world and fatal on a hazardous one: on
   * volcanic the heat and the ashfall had killed all four by 01:15, and from that moment the base
   * could not finish another outline. The bot went on placing them - two hundred and thirty-four
   * placements against a hundred and thirty-five finished buildings - and the run sat at a hundred
   * and thirty-five buildings until the pod came down. A builder is four plate.
   */
  crew() {
    const g = this.g;
    if (g.time - (this.lastCrew ?? -1e9) < 20) return;
    this.lastCrew = g.time;
    const hq = g.hq();
    if (!hq) return;
    const builders = g.units.filter(u => u.alive && u.def.buildRate).length;
    // leave a little headroom so `defence()` can still field its guards
    const want = Math.min(this.cfg.wantBuilders ?? 6, Math.max(2, g.crewCap() - 5));
    // More hands when the queue is what the base is waiting on. A builder yard is sixteen plate and
    // twenty stone, it raises the crew ceiling by two and it walks two builders out when it opens -
    // and the crew ceiling is the real brake on a world like volcanic, where a dormitory needs
    // polymer the base cannot make yet and the four crew it landed with have to build everything.
    // It is placed past the queue guard on purpose: a yard is the one outline that shortens the
    // queue it is standing in.
    if (this.queuedNow >= this.queueCap() && g.crewUsed() >= g.crewCap() - 1) {
      const yards = this.countBuild('builder_yard');
      if (yards < (this.cfg.maxBuilderYards ?? 8) && this.affordable('builder_yard')) {
        const c = this.hubCentre();
        const p = this.spot('builder_yard', c.x, c.y);
        const out = p ? this.place('builder_yard', p.x, p.y, { queueFree: true }) : null;
        if (out) { this.mark('crew:yard:' + yards); this.refreshInventory(); return; }
      }
    }
    if (builders >= want) return;
    if (g.crewUsed() >= g.crewCap()) return;
    if (this.have('iron_plate') < 30) return;               // plate this short is needed elsewhere
    if (g.spawnUnit('builder', hq.x, hq.y)) this.mark('crew:builder');
  }

  /**
   * The pod has a workbench in it. Keeping it busy on whatever basic part is short is what stops the
   * run deadlocking on "you need plates to build the thing that makes plates".
   */
  podWork() {
    const g = this.g;
    const pod = g.hq();
    if (!pod) return;
    const inv = g.inventory();
    // Priority order - plate, then gear, then wire - with one carefully bounded exception.
    //
    // Plain first-under-the-floor deadlocked the whole run on volcanic: plate sat just under its floor of
    // 120 because the base kept spending it, so the workbench made plate and only plate - and gear,
    // which every early generator needs ten of, stayed at one. No gear meant no generator, which
    // meant a 480 kW grid under a 1890 kW draw, which throttled the smelters to a quarter speed,
    // which is what kept the plate under its floor. The base stopped at 101 buildings and lost the
    // pod at wave seven. But ranking on shortfall alone is just as bad the other way: copper wire
    // starts at zero, so it is always the furthest below its floor, and a bot that simply serves the
    // worst shortfall parks the workbench on wire from the first minute - with no copper ingot in
    // the base to make it from - and stops making the plate everything else is built out of. Both
    // worlds then died inside half an hour with three plate in the base. So the order stands, and
    // only a job that is genuinely at zero, that the bench can run, and that has nothing unstocked
    // above it, is allowed past it.
    const jobs = [['iron_plate', 120, 'make_iron_plate'], ['gear', 60, 'make_gear'], ['copper_wire', 80, 'make_wire']];
    const runnable = recipe => Object.keys(g.data.recipe[recipe]?.inputs || {}).every(i => (inv[i] || 0) > 0);
    // One job may jump the queue: one that is all but out, when everything above it is comfortably
    // stocked and the bench can actually run it.
    for (let i = 0; i < jobs.length; i++) {
      const [res, floor, recipe] = jobs[i];
      if ((inv[res] || 0) > floor * 0.1) continue;
      if (!runnable(recipe)) continue;
      if (!jobs.slice(0, i).every(([r, f]) => (inv[r] || 0) >= f * 0.5)) continue;
      if (pod.recipe !== recipe) g.setRecipe(pod.id, recipe);
      return;
    }
    // otherwise the plain order: the construction material first, always
    for (const [res, floor, recipe] of jobs) {
      if ((inv[res] || 0) >= floor) continue;
      if (pod.recipe !== recipe) g.setRecipe(pod.id, recipe);
      return;
    }
    if (!pod.recipe) g.setRecipe(pod.id, 'make_iron_plate');
  }

  // ------------------------------------------------------------------ power
  power() {
    const g = this.g;
    const head = this.cfg.powerHeadroom ?? 1.25;
    const want = g.stats.power.use * head + 80;
    if (g.stats.power.gen >= want) { this.wantedFor('power', false); return; }
    // The grid is a spender like any other, and it used to be the one that never booked anything.
    // On arid at the one-hour mark the base had made 1800 gear and was holding none: forty-four
    // assemblers had taken every one as it rolled, so no generator was ever affordable, and 767 kW
    // under a 3200 kW draw ran the whole factory at a quarter speed for two hours. `power` books
    // above the chain planner for as long as the grid is short.
    const spend = { owner: 'power', priority: RESERVE.power };
    const gens = g.structures.filter(s => s.def.powerGen && s.state !== 'dead');
    // Same flat-cap disease as the guns and the stores: forty-four generators is a sensible ceiling
    // for a three-hundred-building base and a brownout for a nine-hundred-building one. The real
    // brake on generator spam is the `installed >= want` test above; this is only a backstop, so it
    // grows with what it is powering.
    // Only past the size the flat cap was written for, though: relaxing it from the first building
    // let the opening hour buy generators instead of guns and the run died on the wave-10 boss.
    const standing = g.structures.filter(s => s.state === 'done').length;
    const extra = Math.max(0, standing - (this.cfg.generatorCapFrom ?? 500)) / (this.cfg.structuresPerGenerator ?? 30);
    const installed = gens.reduce((a, s) => a + (s.def.powerGen || 0), 0);
    // The cap exists to stop generators being piled up that have nothing to burn, so it only binds
    // while the grid is fuel-limited - live output well under what is installed. On arid at 02:45
    // every one of 29 combustion generators was fuelled, 28 000 coal sat in the stores, the draw was
    // 19.4 MW against 8.3 MW installed - and the bot had stopped at a cap of 61 generators.
    const fuelLimited = g.stats.power.gen < installed * 0.85;
    if (fuelLimited && gens.length > Math.round((this.cfg.maxGenerators ?? 44) + extra)) return;
    // What is *installed*, not what is coming out right now. stats.power.gen is the fuel- and
    // weather-limited figure, so a coal shortage read as "not enough generators" and the bot built
    // another twenty of them - forty-nine generators on a base drawing four hundred kilowatts, and
    // the ground they stood on was the ground the chemistry line needed.
    if (installed >= want) return;
    const shortOfFuel = available(g, 'coal') < 120 && available(g, 'fuel') < 60;
    const order = shortOfFuel
      ? ['fission_reactor', 'geothermal_plant', 'solar_array', 'wind_turbine', 'storm_anchor', 'gas_turbine', 'combustion_generator']
      : ['fission_reactor', 'geothermal_plant', 'gas_turbine', 'solar_array', 'combustion_generator', 'storm_anchor', 'wind_turbine'];
    let blockedOn = null;
    for (const type of order) {
      if (!g.isUnlocked(type)) continue;
      if (type === 'gas_turbine' && available(g, 'natural_gas') < 300) continue;
      if (type === 'solar_array' && available(g, 'solar_cell') < 6) continue;
      if (type === 'fission_reactor' && available(g, 'fuel_rod') < 2) continue;
      if (type === 'geothermal_plant' && !g.planetHas('magma')) continue;
      // twenty wind turbines is a wind farm; eighty is a way of filling the map with buildings
      if (gens.filter(x => x.type === type).length >= Math.round((this.cfg.maxPerGenerator ?? 18) + extra)) continue;
      const s = this.build(type, null, null, null, spend);
      if (s) { this.mark('power:' + type); this.budget--; return; }
      if (!blockedOn && !this.affordable(type, spend)) blockedOn = type;
    }
    // the best generator this world can run that was only short of materials gets booked, once the
    // shortage has lasted long enough to be structural rather than a busy minute
    if (this.wantedFor('power', !!blockedOn, blockedOn) > (this.cfg.reservePowerAfter ?? 60)) {
      this.wantToBuild('power', blockedOn, {
        priority: RESERVE.power,
        still: () => this.g.stats.power.gen < this.g.stats.power.use * head + 80,
      });
    }
  }

  // ------------------------------------------------------------------ defence
  /** The map edges attacks actually walk in from, nearest the base first. */
  approachSides() {
    const g = this.g;
    const done = g.structures.filter(s => s.state === 'done');
    const cx = done.reduce((a, s) => a + s.x, 0) / Math.max(1, done.length);
    const cy = done.reduce((a, s) => a + s.y, 0) / Math.max(1, done.length);
    return [
      { dx: 0, dy: -1, d: cy },
      { dx: 0, dy: 1, d: g.map.height - cy },
      { dx: -1, dy: 0, d: cx },
      { dx: 1, dy: 0, d: g.map.width - cx },
    ].sort((a, b) => a.d - b.d);
  }

  defence() {
    const g = this.g;
    const wave = g.waveNumber;
    const soon = g.nextWaveAt != null ? g.nextWaveAt - g.time : Infinity;
    const per = this.cfg.turretsPerWave ?? 2.2;
    // The cap is what a base of this size can carry without the factory noticing it. Thirty-six guns
    // is about right for the two-hundred-building base of hour two and far too few for the
    // eight-hundred-building base of hour five: on arid the line hit the flat cap at wave 15, held
    // fourteen more waves on upgrades alone and then lost the pod at wave 30. It scales with what is
    // standing, so the guns grow with the thing they are guarding rather than with the clock.
    const standing = g.structures.filter(s => s.state === 'done').length;
    const cap = Math.round((this.cfg.maxTurrets ?? 36) + standing / (this.cfg.structuresPerTurret ?? 40));
    // spend ahead of the clock: one wave's worth extra when the next one is close
    const want = Math.min(cap, Math.round(3 + (wave + (soon < 200 ? 1.5 : 0)) * per));
    const turrets = g.structures.filter(s => s.def.dps && s.def.category === 'defence');
    const labs = g.structures.filter(s => s.def.researchRate).length;
    const hasSteel = g.structures.some(x => x.state === 'done' && x.recipe === 'make_steel_plate');
    // The opening guns are never optional - a base with none is dead by wave three - but past a
    // small line, plate spent on more watchtowers is plate the steel line never gets, and forty
    // watchtowers is a base that holds wave 20 and has not researched chemistry.
    // Six from the first wave on, not four. Nests start letting wanderers out the moment wave one
    // lands, two at a time, and on volcanic two nests' worth of ash stalkers is 280 damage a second
    // into the pod against 15 a watchtower does through their armour. Four towers lost the pod at
    // minute 24 with eighty plate in the stores that the opening rule had stopped spending.
    const opening = turrets.length < Math.min(6, 2 + wave * 4);
    // The opening floor has to be sized to the gun, not to a round number. A watchtower is ten plate
    // and twelve stone; a floor of fifty meant that on a world where the base spends plate as fast as
    // it makes it - volcanic sits at about forty - the first six guns were never built at all, and
    // the run ended at wave two with a hundred and fifty buildings and nothing shooting.
    const floor = opening ? 24 : labs < 2 ? 120 : hasSteel ? (wave > 0 ? 60 : 100) : 240;

    // What defence is allowed to spend through. A booking is materials set aside for a build the
    // base has decided on, and normally the gun line waits its turn like everything else - that is
    // the whole point, and it is what lets a world that spends every plate ever afford a chemical
    // plant. But a base that saves up while the pod is being eaten has saved up for nothing, so two
    // cases spend straight through the ledger: the opening guns, which are never optional, and a
    // wave that is close (or already on the ground) with less than two thirds of the line standing.
    //
    // "Inbound" has to mean the pod is actually in danger, not merely that the wave clock is
    // running - on a hostile world there is nearly always something on the ground somewhere, and a
    // defence phase that treats that as an emergency spends through the ledger for the whole run,
    // which is the same as having no ledger. So: a wave due inside the window, or something already
    // inside the base, or the pod taking damage.
    const c = this.hubCentre();
    const atTheGates = g.enemies.some(e => e.alive && Math.abs(e.x - c.x) < 40 && Math.abs(e.y - c.y) < 40);
    const pod = g.hq();
    // "The pod is being hit right now", not "the pod is below full": nothing repairs the pod in the
    // opening, so a test on its hit points stays true for the rest of the run after one scratch and
    // defence would spend through the ledger for ever.
    if (pod && this.lastPodHp != null && pod.hp < this.lastPodHp - 1) this.podHitAt = g.time;
    this.lastPodHp = pod?.hp ?? null;
    const underAttack = g.time - (this.podHitAt ?? -1e9) < 90;
    const inbound = soon < (this.cfg.emergencyWindow ?? 150) || atTheGates || underAttack;
    const emergency = opening || underAttack || (inbound && turrets.length < want * 0.5);
    const spend = { owner: 'defence', priority: emergency ? RESERVE.emergency : RESERVE.routine };
    if (emergency && this.ledger.book.size) this.mark('defence-breaks-reservation');
    // under attack the only floor is the price of a gun: a plate kept back for the steel line is no
    // use to a base whose pod is gone
    if (this.have('iron_plate', spend) < (underAttack ? 16 : floor)) return;

    // crew: guards fill the gaps a turret ring leaves
    if (g.isUnlocked('guard') && g.units.filter(u => u.alive && u.type === 'guard').length < 4 && g.crewUsed() < g.crewCap() - 1) {
      const hq = g.hq(); if (hq) g.spawnUnit('guard', hq.x, hq.y);
    }
    // things that fly go straight over a gun line, so a missile battery is not optional
    if (g.isUnlocked('missile_battery') && this.countBuild('missile_battery') < 3 && this.affordable('missile_battery', spend)) {
      const s = this.build('missile_battery', null, null, null, spend); if (s) { this.mark('air-defence'); this.budget--; return; }
    }
    // artillery shells nests without anything having to walk out there
    if (g.isUnlocked('artillery') && this.countBuild('artillery') < 3 && this.affordable('artillery', spend)) {
      const s = this.build('artillery', null, null, null, spend); if (s) { this.mark('artillery'); this.budget--; return; }
    }
    if (turrets.length >= want) { this.upgradeTurret(turrets, spend); this.walls(spend); return; }
    // A line that is mostly watchtowers is not a line once armour turns up. Swapping only happened
    // when the line was already at full count, and on a base that never quite reaches the count the
    // guns were never swapped at all: arid met four hull breakers (19 armour, so 3 damage a second
    // from a watchtower) at wave 16 with twenty-eight watchtowers and not one gun turret.
    const weak = turrets.filter(s => s.state === 'done' && s.def.dps < 30).length;
    if (wave >= 6 && weak > turrets.length * 0.5 && this.upgradeTurret(turrets, spend)) return;

    // A ring around the pod, not a gun line on one edge. The old version put every turret on the
    // two nearest map edges at 13-21 tiles out; anything that walked in from a third side reached
    // the pod without ever being shot at, and 8000 hp went in twenty minutes with four turrets
    // standing. The ring covers the pod from every angle and thickens on the approach sides.
    for (const type of ['laser_turret', 'gun_turret', 'flame_turret', 'watchtower']) {
      if (!g.isUnlocked(type)) continue;
      if (type === 'laser_turret' && g.stats.power.gen < 1200) continue;
      if (!this.affordable(type, spend)) continue;
      const p = this.turretSpot(type);
      if (!p) continue;
      // Past the queue guard, like a booked build. A gun is one outline, and on arid the queue was
      // full of poles and crates for the last twelve minutes of the run: the turret count sat at 28
      // against the 34 the wave clock wanted, with fourteen hundred plate in the stores, until a
      // double push walked through the watchtowers.
      const out = this.place(type, p.x, p.y, { queueFree: true });
      if (!out) continue;
      this.builds++;
      this.refreshInventory();
      this.connect(out.structure);
      this.mark('turret:' + turrets.length);
      this.budget--;
      this.ledger.release('defence');
      return;
    }
    // Nothing went up. If that is because the base spent the plate, and the line is still short of
    // its opening guns (or the pod is being hit), defence books the cheapest gun it can build - the
    // one booking in the ledger that is about survival rather than growth. On volcanic the labs and
    // a workshop took the stores from 105 plate to 5 in two minutes while four towers were all that
    // stood between two nests and the pod.
    if (emergency) {
      const gun = ['watchtower', 'gun_turret'].find(t => g.isUnlocked(t));
      if (gun && !this.affordable(gun, spend)) {
        this.ledger.reserve('defence', g.data.structure[gun].cost, {
          priority: RESERVE.emergency, why: gun,
          still: () => {
            const n = this.g.structures.filter(s => s.def.dps && s.def.category === 'defence').length;
            return n < Math.min(6, 2 + this.g.waveNumber * 4) || this.g.time - (this.podHitAt ?? -1e9) < 90;
          },
        });
      }
    }
  }

  /**
   * Where the next turret goes: the tile in a ring around the pod with the thinnest cover, leaning
   * towards the edge attacks come from.
   *
   * This used to aim at one point worked out from the turret count and let `spot()` spiral outwards
   * from it. Two things went wrong. If the count never moved - because that one tile was water - it
   * asked for the same impossible tile forever. And when it did fit, the spiral put the gun fifteen
   * to twenty-three tiles out, which is outside a watchtower's thirteen-tile range of the pod: a
   * burrower could stand on the landing pod and chew through eight thousand hit points with
   * seventeen turrets standing and not one of them able to see it. Searching the ring itself fixes
   * both - if there is a legal tile that covers the pod, this finds it.
   */
  turretSpot(type) {
    const g = this.g;
    const c = this.hubCentre();
    const range = g.data.structure[type].range || 12;
    const R0 = Math.max(4, Math.round(range * 0.45));
    const turrets = g.structures.filter(s => s.state !== 'dead' && s.def.dps && s.def.category === 'defence');
    const sides = this.approachSides();
    const bias = Math.atan2(sides[0].dy, sides[0].dx);
    // Widen the ring only when the inner one is genuinely full, so the guns stay over the pod - but
    // keep widening until the base itself runs out, not until a multiple of the gun's range runs out.
    // Stopping at 2.2x range meant that once the base had filled the ground within about thirty tiles
    // of the pod, `turretSpot` returned null for every gun type and `defence()` quietly built nothing
    // at all: arid reached wave 21 with fourteen hundred plate banked and **one** watchtower standing.
    // A gun out on the perimeter is worth much more than a gun that was never built.
    const rings = [Math.round(range * 0.95), Math.round(range * 1.5), Math.round(range * 2.2)];
    for (const extra of [0, range, range * 2]) rings.push(Math.round(this.reach + extra));
    for (const R1 of rings) {
      let best = null, bestScore = -Infinity;
      for (let dy = -R1; dy <= R1; dy++) for (let dx = -R1; dx <= R1; dx++) {
        const d = Math.hypot(dx, dy);
        if (d < R0 || d > R1) continue;
        const x = Math.round(c.x + dx), y = Math.round(c.y + dy);
        let gap = 999;
        for (const t of turrets) { const dd = Math.hypot(t.x - x, t.y - y); if (dd < gap) gap = dd; }
        const a = Math.atan2(dy, dx);
        const da = Math.abs(((a - bias + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
        const score = Math.min(gap, 24) - da * 2.5;
        if (score <= bestScore) continue;
        if (!g.canPlace(type, x, y, { ignoreCost: true }).ok) continue;
        bestScore = score; best = { x, y };
      }
      if (best) return best;
    }
    return null;
  }

  /**
   * Swap the weakest gun on the line for the best one the tree allows.
   *
   * Without this the bot hit its turret cap on watchtowers and stayed there: forty-two rifles at
   * 18 dps against a hull breaker with 19 armour is 2 damage a shot, and the run died at wave twenty
   * with every one of them standing and firing.
   */
  upgradeTurret(turrets, spend = null) {
    const g = this.g;
    if (g.time - (this.lastTurretSwap ?? -1e9) < 25) return false;
    const best = ['laser_turret', 'gun_turret', 'flame_turret']
      .find(t => g.isUnlocked(t) && this.affordable(t, spend) && !(t === 'laser_turret' && g.stats.power.gen < 1200));
    if (!best) return false;
    const bdps = g.data.structure[best].dps;
    const worst = turrets
      .filter(s => s.state === 'done' && s.def.dps < bdps * 0.7)
      .sort((a, b) => a.def.dps - b.def.dps)[0];
    if (!worst) return false;
    this.lastTurretSwap = g.time;
    const { x, y } = worst;
    g.removeStructure(worst.id, { refund: 0.8, reason: 'upgraded' });
    this.refreshInventory();
    const out = this.place(best, x, y, { queueFree: true });
    if (!out) {
      const p = this.turretSpot(best);
      if (p) this.place(best, p.x, p.y, { queueFree: true });
      return true;
    }
    this.connect(out.structure);
    this.mark('turret-upgrade:' + best);
    return true;
  }

  /** A short run of wall in front of the newest turrets, on the sides attacks come from. */
  walls(spend = null) {
    const g = this.g;
    const type = ['reinforced_wall', 'steel_wall', 'wooden_wall'].find(t => g.isUnlocked(t) && this.affordable(t, spend));
    if (!type) return;
    const walls = g.structures.filter(s => s.def.blocks).length;
    if (walls > 10 + g.waveNumber * 2) return;
    const turret = g.structures.filter(s => s.def.dps && s.def.category === 'defence' && !s.walled)[0];
    if (!turret) return;
    turret.walled = true;
    const c = this.hubCentre();
    const a = Math.atan2(turret.y - c.y, turret.x - c.x);
    for (let k = -3; k <= 3; k++) {
      const ax = a + Math.PI / 2;
      const x = Math.round(turret.x + Math.cos(a) * 3 + Math.cos(ax) * k);
      const y = Math.round(turret.y + Math.sin(a) * 3 + Math.sin(ax) * k);
      if (!this.affordable(type, spend)) return;
      if (g.canPlace(type, x, y).ok) this.place(type, x, y);
    }
  }

  /**
   * Drills that dig into their own hopper because nothing joins them to the factory.
   *
   * `chainToPool` handles anything a line of stores can reach, and `upkeep` retries it. What is left
   * is the genuinely distant patch - past fourteen warehouses of chain - and the one the chain could
   * not be paid for. Both get a truck instead, and the resource is picked because the base is short
   * of it rather than because the hopper happens to be full: the lithium that stalled research on
   * temperate sat 85 and 107 tiles out with two hundred units mined in six hours.
   */
  outposts() {
    const g = this.g;
    const hub = g.hq();
    if (!hub || hub.pool == null) return;
    if (g.time - (this.lastOutpost ?? -1e9) < 45) return;
    if (!g.isUnlocked('hauler')) return;
    const max = this.cfg.maxRoutes ?? 10;
    // At the cap this no longer simply gives up - see the swap at the bottom. It used to, and on
    // temperate all ten routes were hauling iron ore and coal the base held full stockpiles of while
    // eleven advanced-circuit printers stood idle "short of gold" with 450 gold in an outpost store.
    const full = g.routes.length >= max;
    // pay the clock here, not at the bottom: the walk below costs a plan() and a capacity table, and
    // on a quiet base it would otherwise run every five seconds and find nothing every time
    this.lastOutpost = g.time;
    // what the factory is actually waiting on, worst first
    const { need } = this.plan();
    const cap = this.capacityTable();
    const stranded = [];
    for (const s of g.structures) {
      if (s.state !== 'done' || !s.def.extractRate || !s.nodeId) continue;
      if (s.pool === hub.pool) continue;                     // already joined up
      const node = g.nodeById(s.nodeId);
      if (!node || node.depleted) continue;
      const res = node.resource;
      if (!need.has(res)) continue;                          // nothing wants it
      if ((cap.get(res) || 0) > need.get(res) * 3) continue; // plenty of it arriving elsewhere
      // the store this drill actually fills - a route has to start from a store, not the drill
      const from = g.structures.find(t => t.state === 'done' && isStore(t.def) && t.pool === s.pool
        && Math.hypot(t.x - s.x, t.y - s.y) <= (t.def.linkRadius || 10));
      if (!from || g.routes.some(r => r.from === from.id && r.resource === res)) continue;
      stranded.push([from, res, (cap.get(res) || 0) / Math.max(1e-6, need.get(res))]);
    }
    if (!stranded.length) return;
    // what a machine in the main base is standing idle for right now - that beats any ratio
    const starved = new Set();
    for (const s of g.structures) if (s.state === 'done' && s.pool === hub.pool && s.starvedFor) starved.add(s.starvedFor);
    stranded.sort((a, b) => (starved.has(b[1]) - starved.has(a[1])) || a[2] - b[2]);
    const [from, res] = stranded[0];
    if (full) {
      // Swap, rather than wait for a slot that never comes: retire the route hauling whatever the
      // base already holds a full stockpile of, but only for something a machine is starving for.
      if (!starved.has(res)) return;
      const main = g.poolTotals?.get(hub.pool) || {};
      const spare = g.routes
        .filter(r => r.to === hub.id && !starved.has(r.resource) && (main[r.resource] || 0) >= stockTarget(r.resource))
        .sort((a, b) => (main[b.resource] || 0) / stockTarget(b.resource) - (main[a.resource] || 0) / stockTarget(a.resource))[0];
      if (!spare) return;
      g.removeRoute(spare.id);
      this.mark('route-swap:' + spare.resource + '->' + res);
    }
    // a truck needs a garage slot; the plan only ever built one garage, which is three trucks
    if (!garageFor(g, vehiclesFor(g, res)[0] || {})) {
      if (this.affordable('truck_garage')) this.build('truck_garage');
      return;
    }
    const out = g.addRoute({ from: from.id, to: hub.id, resource: res });
    if (out.ok) this.mark('outpost-route:' + res);
  }

  // ------------------------------------------------------------------ hauling and roads
  logistics() {
    const g = this.g;
    this.roads();
    this.upgradeTrucks();
    if (!g.structures.some(s => s.state === 'done' && s.type === 'truck_garage')) return;
    const hub = g.hq();
    if (!hub) return;
    if (g.dirty.links) recomputeLinks(g);
    this.outposts();
    // one crate run from the furthest outpost, so a truck is actually exercised
    if (g.isUnlocked('hauler') && g.routes.filter(r => r.resource !== 'water').length < 3) {
      const far = g.structures
        .filter(s => s.state === 'done' && isStore(s.def) && s.id !== hub.id && Math.hypot(s.x - hub.x, s.y - hub.y) > 16)
        .filter(s => !g.routes.some(r => r.from === s.id))
        .sort((a, b) => Math.hypot(b.x - hub.x, b.y - hub.y) - Math.hypot(a.x - hub.x, a.y - hub.y))[0];
      if (far) {
        const best = Object.entries(far.inv).sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] > 40) {
          const out = g.addRoute({ from: far.id, to: hub.id, resource: best[0] });
          if (out.ok) { this.mark('route:' + best[0]); return; }
        }
      }
    }
    // and one tanker run, because liquids will not ride in a crate truck
    if (g.isUnlocked('tanker') && !g.routes.some(r => g.vehicles.find(v => v.id === r.vehicle)?.type === 'tanker')) {
      const tanks = g.structures.filter(s => s.state === 'done' && s.type === 'fluid_tank');
      const src = tanks.find(t => Object.values(t.inv).some(n => n > 40));
      const dst = tanks.find(t => t !== src && Math.hypot(t.x - hub.x, t.y - hub.y) < 20);
      if (src && dst) {
        const res = Object.entries(src.inv).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (res) { const out = g.addRoute({ from: src.id, to: dst.id, resource: res, vehicle: 'tanker' }); if (out.ok) this.mark('route:tanker'); }
      }
    }
  }

  /** Lay the best road the tech allows along the runs that carry the most. */
  roads() {
    const g = this.g;
    // dirt paths are barely faster than bare ground and each one is a building in the way;
    // the bot waits for gravel
    const type = ['paved_road', 'gravel_road'].find(t => g.isUnlocked(t) && this.affordable(t));
    if (!type) return;
    const cap = this.cfg.maxRoadTiles ?? 260;
    if (this.roadTiles >= cap) return;
    // roads are a throughput upgrade, not an opening move - they come after there is something to
    // drive on them and stone to spare
    if (g.research.done.length < 6 && !g.routes.length) return;
    if (type !== 'paved_road' && available(g, 'stone') < 300) return;
    if (type === 'paved_road' && available(g, 'concrete') < 200) return;
    if (g.time - (this.lastRoad ?? -1e9) < 25) return;
    this.lastRoad = g.time;
    // the busiest runs are the routes, then the line from the hub out to each drill
    let path = null;
    const route = g.routes.find(r => r.path && r.path.length > 4 && !r.paved);
    if (route) { path = route.path; route.paved = true; }
    else {
      const hub = this.hubCentre();
      const drill = g.structures
        .filter(s => s.state === 'done' && s.nodeId && !s.roaded && Math.hypot(s.x - hub.x, s.y - hub.y) > 10)
        .sort((a, b) => Math.hypot(a.x - hub.x, a.y - hub.y) - Math.hypot(b.x - hub.x, b.y - hub.y))[0];
      if (!drill) return;
      drill.roaded = true;
      path = [];
      const n = Math.round(Math.hypot(drill.x - hub.x, drill.y - hub.y));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(hub.x + (drill.x - hub.x) * k / n), y = Math.round(hub.y + (drill.y - hub.y) * k / n);
        path.push(y * g.map.width + x);
      }
    }
    const c = this.hubCentre();
    let laid = 0;
    for (const i of path) {
      if (laid >= 26 || this.roadTiles >= cap) break;
      const x = i % g.map.width, y = (i / g.map.width) | 0;
      if (g.map.road[i] >= (g.data.structure[type].roadTier || 1)) continue;
      if (Math.hypot(x - c.x, y - c.y) < 9) continue;            // not through the middle of the base
      if (!this.affordable(type)) break;
      if (!g.canPlace(type, x, y).ok) continue;
      if (this.place(type, x, y)) { laid++; this.roadTiles++; }
    }
    if (laid) { this.mark('road:' + type); g.dirty.routes = true; }
  }

  upgradeTrucks() {
    const g = this.g;
    if (g.time - (this.lastTruck ?? -1e9) < 120) return;
    this.lastTruck = g.time;
    for (const v of g.vehicles) {
      if (!v.alive) continue;
      const step = nextTier(g, v);
      if (!step) continue;
      if (Object.entries(step.cost || {}).some(([r, n]) => available(g, r) < n * 4)) continue;
      if (g.upgradeVehicle(v.id).ok) { this.mark('vehicle:' + v.type + ':' + v.tier); return; }
    }
  }

  // ------------------------------------------------------------------ scouting and space
  explore() {
    const g = this.g;
    if (g.exploredRegions.length >= 6 || g.pendingSurveys.length) return;
    if (!g.units.some(u => u.alive && u.type === 'scout')) {
      if (g.isUnlocked('scout') && g.crewUsed() < g.crewCap()) { const hq = g.hq(); if (hq) g.spawnUnit('scout', hq.x, hq.y); }
      else if (g.isUnlocked('dormitory') && this.countBuild('dormitory') < 4) this.build('dormitory');
      return;
    }
    for (const r of g.knownRegions()) if (g.exploreRegion(r.id).ok) { this.mark('explore:' + g.exploredRegions.length); return; }
  }

  space() {
    const g = this.g;
    if (g.space.satellites === 0 && g.launchSatellite().ok) { this.mark('satellite'); return; }
    if (!g.space.probes.length && !g.space.surveyed.length) {
      const target = g.planets.list().find(p => p.id !== g.planet.id);
      if (target && g.launchProbe(target.id).ok) { this.mark('probe'); return; }
    }
    const st = g.rocketStatus();
    if (st.hasPad && !st.ready) { if (g.assembleRocket().ok) this.mark('rocket:assembled'); return; }
    if (st.ready && !g.space.launched) {
      const target = g.planets.list().find(p => p.id !== g.planet.id);
      if (!target) return;
      const inv = g.inventory();
      const cargo = {};
      for (const r of ['iron_plate', 'steel_plate', 'gear', 'copper_wire', 'concrete', 'circuit', 'alloy_plate']) {
        const n = Math.min(200, Math.floor((inv[r] || 0) * 0.4));
        if (n > 0) cargo[r] = n;
      }
      if (g.launchRocket({ to: target.id, cargo, crew: 4 }).ok) this.mark('rocket:launched');
      return;
    }
    if (g.isUnlocked('orbital_lift') && g.stationStatus().hasLift && g.liftStationModule().ok) this.mark('station:' + g.space.stationModules);
  }

  research() {
    const g = this.g;
    // A node whose packs the factory cannot make yet will sit at zero forever, and the whole run
    // stops behind it. Watch the progress; if it has not moved in a few minutes, take something
    // else off the list and come back later.
    if (g.research.current) {
      if (g.research.progress > (this.lastProgress ?? -1)) { this.lastProgress = g.research.progress; this.stuckSince = g.time; return; }
      if (g.time - (this.stuckSince ?? g.time) < 200) return;
      const stuck = g.research.current;
      const alt = g.availableTechs()
        .filter(t => t.id !== stuck && Object.entries(t.cost || {}).every(([r, n]) => available(g, r) >= n * 0.2))
        .sort((a, b) => a.work - b.work)[0];
      if (!alt) { this.stuckSince = g.time; return; }
      g.startResearch(alt.id);
      this.stuckSince = g.time; this.lastProgress = -1;
      this.mark('research-detour:' + alt.id);
      return;
    }
    this.lastProgress = -1; this.stuckSince = g.time;
    for (const id of RESEARCH_ORDER) {
      if (g.research.done.includes(id)) continue;
      if (g.canResearch(id).ok) { g.startResearch(id); this.mark('research:' + id); return; }
    }
    // then anything else that is legal here, cheapest first (this is where the planet-only nodes land)
    const next = g.availableTechs().sort((a, b) => a.work - b.work)[0];
    if (next) { g.startResearch(next.id); this.mark('research:' + next.id); }
  }

  // ------------------------------------------------------------------ housekeeping
  upkeep() {
    const g = this.g;
    const housekeeping = g.time - (this.lastKeep ?? -1e9) >= 30;
    if (housekeeping) this.lastKeep = g.time;

    // throttle anything that has made far more than the base can use, or its output silts up every
    // crate and the rest of the factory jams behind it
    const inv = g.inventory();
    // "stop making gears, I need plates": while the construction material is short, anything else
    // competing for the same ingots gets switched off. This is the difference between a base that
    // bootstraps and one that eats its own starting kit.
    const plateShort = (inv.iron_plate || 0) < 80 && this.capacityOf('iron_plate') < 1.6;
    // The same rule for gear, the other thing every building is made of. Science packs eat two or
    // three gear apiece, and on temperate the pack assemblers took all 3100 gear the base made in its
    // first hour - so no drill (six gear) and no generator (nine) could be paid for, the coal ran out
    // under six generators and the gear assemblers sat at 8 % power. While gear is below the floor,
    // whatever eats gear without making it stands down.
    const gearShort = (inv.gear || 0) < (this.cfg.gearFloor ?? 40);
    // Stockpile limits count what the main base can actually use. The base-wide total also counts
    // ore sitting in the hopper of a drill that no store reaches, and on temperate the two platinum
    // drills - 107 and 188 tiles out, hoppers full at 200 each - read as "400 platinum, stockpile
    // full" and switched *themselves* off, while three superalloy furnaces starved for platinum.
    const hqPool = g.hq()?.pool;
    const usable = (hqPool != null && hqPool >= 0 && g.poolTotals?.get(hqPool)) || inv;
    // A booking stops other *builds* spending a material, but a machine eating it as an input used to
    // walk straight past the ledger. On arid the launch pad booked seven tungsten bar and sat at 0 %
    // for an hour while two smelters made tungsten and the superalloy line ate every bar as it landed.
    // So while a rocket-priority booking is short of something, machines that eat it without making
    // it stand down - the same rule as the plate and gear floors, for the things the run is for.
    const saving = new Set();
    for (const r of this.ledger.book.values()) {
      if (r.priority < RESERVE.rocket) continue;
      for (const [res, n] of Object.entries(r.cost)) if ((inv[res] || 0) < n) saving.add(res);
    }
    for (const m of g.structures) {
      if (m.state !== 'done') continue;
      if (plateShort && m.recipe) {
        const r = g.data.recipe[m.recipe];
        if (r && r.inputs?.iron_ingot && !r.outputs?.iron_plate) { m.enabled = false; continue; }
      }
      if (gearShort && m.recipe) {
        const r = g.data.recipe[m.recipe];
        if (r && r.inputs?.gear && !r.outputs?.gear) { m.enabled = false; continue; }
      }
      if (saving.size && m.recipe) {
        const r = g.data.recipe[m.recipe];
        if (r && Object.keys(r.inputs || {}).some(i => saving.has(i)) && !Object.keys(r.outputs || {}).some(o => saving.has(o))) { m.enabled = false; continue; }
      }
      let outs = null;
      if (m.recipe) outs = Object.keys(g.data.recipe[m.recipe]?.outputs || {});
      else if (m.def.extractRate) {
        outs = m.def.yields ? Object.keys(m.def.yields)
          : m.nodeId ? [g.nodeById(m.nodeId)?.resource].filter(Boolean)
            : m.def.harvestsTerrain ? ['biomass'] : [];
      }
      if (!outs || !outs.length) continue;
      m.enabled = !outs.every(o => (usable[o] || 0) >= stockTarget(o));
    }

    if (!housekeeping) return;
    // anything that fell off the grid gets wired back on
    // A few a pass, rotating through all of them - the first four in building order, every pass, is
    // the same trap the stray list fell into: four that cannot be reached are retried for ever and
    // the tungsten drill behind them never is.
    const dark = g.structures.filter(s => s.state === 'done' && s.net < 0 && (s.def.powerUse || s.def.powerGen));
    if (dark.length) {
      const from = dark.length > 6 ? (this.darkCursor = ((this.darkCursor ?? -6) + 6) % dark.length) : 0;
      for (const s of (dark.length > 6 ? [...dark, ...dark].slice(from, from + 6) : dark)) this.connect(s);
    }
    if (g.dirty.links) recomputeLinks(g);
    // a machine outside the main pool cannot reach its inputs; crate it back in
    const hq = g.hq();
    if (hq && hq.pool != null) {
      // every machine outside the main pool is a machine that cannot see the base's inputs; bridge
      // a few of them back every housekeeping pass
      // Three a pass, but not always the *same* three. Taking the first three in building order meant
      // three strays that could never be joined up were retried for ever and nothing behind them was
      // ever looked at: on volcanic the only lithium drill stood 85 tiles out with no store in reach
      // at all, its hopper full at 200 units, for four hours - no battery cell, no energy pack, and
      // research stopped at 46 nodes. Extractors go first, and a stranded one gets a store of its own
      // before the chain is tried, because `outposts()` can only send a truck to a store.
      const allStrays = g.structures.filter(s => s.state === 'done' && (s.recipe || s.def.extractRate || s.def.researchRate) && s.pool !== hq.pool)
        .sort((a, b) => (b.def.extractRate ? 1 : 0) - (a.def.extractRate ? 1 : 0));
      const start = allStrays.length > 3 ? (this.strayCursor = ((this.strayCursor ?? -3) + 3) % allStrays.length) : 0;
      const strays = allStrays.length > 3 ? [...allStrays, ...allStrays].slice(start, start + 3) : allStrays;
      for (const stray of strays) {
        if (stray.def.extractRate && (stray.pool == null || stray.pool < 0)) { this.ensureStore(stray, { rescue: true }); if (g.dirty.links) recomputeLinks(g); }
        this.chainToPool(stray);
        if (g.dirty.links) recomputeLinks(g);
        // if nothing at all can reach it, it is a machine that will never run: take it back
        if ((stray.pool == null || stray.pool < 0) && !stray.def.extractRate) {
          g.removeStructure(stray.id, { refund: 1, reason: 'nothing could reach it' });
          this.refreshInventory();
        }
      }
    }
    // Take the hunting towers down again. A patch stays scanned once something has looked at it, so
    // the towers that went up to find the far seams are, the moment they have found them, 35 kW each
    // of pure overhead - ninety-six of them is 3.4 MW, which on temperate was most of an 8 MW draw
    // against 4 MW of generators, and everything in the base was throttled. Sold back one a pass,
    // furthest from the pod first, down to the ordinary sweep budget.
    if (!this.wantsUnfoundOre()) {
      const towers = g.structures.filter(s => s.state === 'done' && s.def.scanRadius);
      const area = g.map.width * g.map.height;
      const soft = Math.min(this.cfg.maxScanners ?? 48, Math.max(8, Math.round(area / (this.cfg.tilesPerScanner ?? 1850))));
      if (towers.length > soft) {
        const c = this.hubCentre();
        const spare = towers.sort((a, b) => Math.hypot(b.x - c.x, b.y - c.y) - Math.hypot(a.x - c.x, a.y - c.y))[0];
        if (spare) { g.removeStructure(spare.id, { refund: 0.8, reason: 'nothing left to find' }); this.refreshInventory(); }
      }
    }
    // a machine that finished a craft with nowhere to put it needs a store, right there
    const jammed = g.structures.find(s => s.state === 'done' && s.blocked && s.recipe);
    if (jammed) {
      const type = this.storeType();
      const p = this.affordable(type) ? this.spot(type, jammed.x, jammed.y, 9) : null;
      if (p) { this.place(type, p.x, p.y); g.dirty.links = true; this.mark('unjam'); }
    }
    // keep store space ahead of the output
    const stores = g.structures.filter(s => s.state === 'done' && isStore(s.def));
    const cap = stores.reduce((a, s) => a + s.cap, 0);
    const used = stores.reduce((a, s) => a + Object.values(s.inv).reduce((x, y) => x + y, 0), 0);
    if (used > cap * 0.75 && (this.storeType() !== 'storage_crate' || this.storeBudgetLeft())) {
      const c = this.hubCentre();
      this.build(this.storeType(), c.x, c.y);
    }
  }

  /** Kept for the sim's --why output: what the bot would do about one infrastructure step. */
  doStep(step) {
    const g = this.g;
    if (step.after && !g.research.done.includes(step.after)) return 'skip';
    if (!g.isUnlocked(step.build)) return 'skip';
    if (this.countBuild(step.build) >= step.n) return 'done';
    return this.affordable(step.build) ? 'ready' : 'wait';
  }
}
