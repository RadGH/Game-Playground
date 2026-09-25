// Farhold — the Civilization layer, assembled.
//
// PURE JavaScript: no DOM, no Three.js. One module so that js/main.js — 6 700 lines and shared with
// every other screen in the game — has ONE thing to construct and ONE thing to tick.
//
//   import { createCivics } from './civics.js';
//   const civics = createCivics({ data: colonyJson, goods: tradeGoodsJson, raids: raidsJson,
//                                 colony, works, board, stores, farm, bestiary, seed });
//   civics.rebuild(build.entries, build.defOf);     // whenever a piece goes up or comes down
//   civics.tick(dt, { day, hour, gold, spent });    // in the frame loop
//   civics.away({ seconds, away });                 // on landing, or on load
//
// WHAT IT JOINS, IN THE ORDER THE ROUND WAS WRITTEN:
//
//   §2 housing   js/housing.js  — houses, utilities, comfort, and the real walk to work
//   §3 labour    js/refine.js   — a machine with a bound worker and enough units runs on its own
//   §4 away      js/logistics.js's away clock, plus the half it never covered: the PEOPLE
//   §5 vendors   js/vendors.js  — twelve traders, each with a condition, a bed and a comfort floor
//   §6 goods     js/trade.js + js/hold.js — twenty-two products in one weight-capped container
//   §7 routes    js/trade.js    — real prices per town, so buying low and selling high is real
//   §8 guards    js/colony.js + js/defence.js — a post is a structure, a guard is a person in it
//   §9 muster    js/muster.js   — a wave defence you ask for, with nothing at stake if you lose
//
// THE ONE RULE ALL OF IT FOLLOWS: a machine is "simple and calculable without any physics or
// rendering" — pure data plus a tick. Nothing in this file or anything it imports has ever seen a
// frame.

import { createHousing } from './housing.js';
import { createVendors } from './vendors.js';
import { createHold, holdCapacity } from './hold.js';
import { createTrade, installTradeGoods } from './trade.js';
import { createMuster } from './muster.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

export function createCivics({
  data = null,              // data/colony.json
  goods = null,             // data/tradegoods.json
  raids = null,             // data/raids.json
  resources = null,         // data/resources.json  — trade goods are injected into it at boot
  refining = null,          // data/refining.json   — and their recipes into it
  colony = null, works = null, board = null, stores = null, farm = null, bestiary = null,
  dayLengthSeconds = 900,
  /**
   * R19 — `powerAt(place)` -> spare kW on the grid there, or null where there is no grid.
   * Only the Hauler Drone asks (`powerAtOrigin` in data/colony.json); everything else ignores it.
   */
  powerAt = null,
  seed = 1, log = null,
} = {}) {
  /**
   * INJECT THE GOODS FIRST, BEFORE ANYTHING READS EITHER FILE.
   *
   * `installTradeGoods` copies the twenty-two goods into the live `resources.materials` map and
   * pushes one recipe each into the live `refining.recipes` array. It is safe to run twice, and it
   * NEVER writes to disk — see js/trade.js for why a shared data file is never edited in place.
   */
  const installed = installTradeGoods(resources, refining, goods);

  const housing = createHousing({ data });
  const vendors = createVendors({ data });
  const hold = createHold({ goods: goods?.goods || [], capacity: data?.hold?.onBack ?? 40 });
  const trade = createTrade({ goods: goods?.goods || [], data, seed, powerAt });
  const muster = createMuster({ data: raids, civics: { ...(data || {}), dayLengthSeconds }, bestiary, saved: null });

  const AWAY = data?.away || { rate: { away: 1, closed: 0.55 }, capSeconds: 28800, mercyDays: 3, sliceSeconds: 20, minCardSeconds: 900 };
  const FOOD = data?.food || {};
  const say = t => { if (log) log(t); };

  /** Everything standing that this layer cares about, refreshed by `rebuild`. */
  let entries = [];
  let defOf = null;
  let tradePosts = [];
  let postSlots = [];
  let spent = 0;            // gold spent at this holding, ever — the Gambler's condition
  let lastVendorDay = 0;

  /** The Trade Post's own hold, which is 2 000 kg and does not go anywhere. */
  const vault = createHold({ goods: goods?.goods || [], capacity: data?.hold?.tradePost ?? 2000 });

  const defFor = key => (defOf ? defOf(key) : null);

  /**
   * Re-read what is standing.
   *
   * Called whenever a piece goes up or comes down — never per frame. Everything downstream is
   * worked out from the geometry rather than declared, which is round 14's rule (js/outposts.js)
   * applied to houses, posts, benches and trade posts alike.
   */
  function rebuild(list = [], lookup = null) {
    entries = list || [];
    defOf = lookup || defOf;
    housing.rebuild(entries, defOf);
    tradePosts = entries.filter(e => defFor(e.key)?.tradePost);
    postSlots = entries
      .filter(e => defFor(e.key)?.post)
      .map(e => ({ id: e.id, name: e.name || e.key, slots: defFor(e.key).post.slots || 1, x: e.x, z: e.z }));
    colony?.setPosts?.(postSlots);
    colony?.setHousing?.(housing);
    /**
     * THE TENDER ARMS, HANDED TO THE ONE CALL SITE THAT WAS ALWAYS ASKING FOR THEM.
     *
     * js/main.js has called `board.runMachines(works.machines?.() || [], hours)` since the building
     * expansion landed and `works.machines` did not exist, so js/work.js's third source — the whole
     * reason `runMachines` was written — has never run. A Tender Arm IS that source: twelve units
     * an hour is 360 seconds of machine per game hour, so one arm keeps about ten benches lit round
     * the clock for eight kilowatts. It is meant to be a big, expensive, late convenience — steel,
     * machine parts and wire — and it dies with the grid, which `machineUnits` already handles by
     * returning 0 for `powered: false`. Not one line of js/work.js changes.
     */
    const arms = entries
      .filter(e => defFor(e.key)?.tender)
      .map(e => {
        const t = defFor(e.key).tender;
        const bench = nearestBench(e, t.range || 6);
        return {
          id: e.id, name: 'Tender Arm',
          stationId: bench?.id || null,
          tags: ['refine'],
          unitsPerHour: t.unitsPerHour ?? (data?.labour?.tenderUnitsPerHour ?? 12),
          powered: e.powered !== false,
        };
      })
      .filter(m => m.stationId);
    works?.setTenders?.(arms);
    return { houses: housing.report(), posts: postSlots.length, tradePosts: tradePosts.length, arms: arms.length };
  }

  /** The machine an arm can actually reach. An arm with nothing in range does nothing at all. */
  function nearestBench(arm, range) {
    let best = null, bestD = range;
    for (const e of entries) {
      if (!works?.get?.(e.id)) continue;
      const d = Math.hypot(e.x - arm.x, e.z - arm.z);
      if (d <= bestD) { bestD = d; best = e; }
    }
    return best;
  }

  /** Where a station is, so a citizen's walk to work is a real number of metres. */
  function stationAt(id) {
    const m = works?.get?.(id);
    if (m) return { x: m.x, z: m.z };
    const e = entries.find(x => x.id === id);
    return e ? { x: e.x, z: e.z } : null;
  }

  /** How many of a material this holding has ever produced — the vendors' `made` conditions. */
  function madeOf(res) {
    if (!works?.completed || !works?.recipes) return 0;
    let n = 0;
    for (const [id, times] of Object.entries(works.completed)) {
      const out = works.recipes[id]?.outputs?.[res];
      if (out) n += out * times;
    }
    return n;
  }

  /** What the vendor board needs to know, in one object, so nothing has its own private counter. */
  function facts({ day = 1, gold = 0, rng = Math.random } = {}) {
    return {
      day, rng, gold,
      housing,
      keys: new Set(entries.map(e => e.key)),
      citizens: colony?.citizens?.length || 0,
      plots: farm?.plots?.length || 0,
      posted: colony?.stationed?.() || 0,
      turnover: trade.turnover,
      spent,
      made: madeOf,
      nameOf: key => defFor(key)?.name || (resources?.materials?.[key]?.name) || String(key).replace(/_/g, ' '),
    };
  }

  // ------------------------------------------------------------------ the frame loop

  let sinceLabour = 0;

  /**
   * One tick. Everything in here is cheap and most of it is on a timer rather than per frame.
   *
   * The labour orders are the one thing that has to be regular: `postLabour` puts at most one small
   * order per machine on the board and takes it off again when the machine does not want tending,
   * and the sweep pays each finished order into the machine it was for. Together they are the join
   * the whole round is about — *ore goes to a town and somebody who lives there smelts it.*
   */
  function tick(dt = 0, { day = 1, hour = 12, gold = 0, rng = Math.random, at = 0 } = {}) {
    const out = { labour: 0, credited: 0, vendor: null, arrived: [], lost: [] };
    sinceLabour += dt;
    if (board && works?.postLabour && sinceLabour >= 1) {
      sinceLabour = 0;
      out.labour = works.postLabour(board, { at });
      out.credited = works.collectLabour(board);
    }
    // the carts on the long roads between settlements — js/trade.js
    const moved = trade.tick(dt, { day, rng });
    out.arrived = moved.arrived;
    out.lost = moved.lost;
    for (const r of moved.arrived) say(r.line);
    for (const r of moved.lost) say(r.line);
    // once a game day: does anybody want to move in?
    if (day !== lastVendorDay) {
      lastVendorDay = day;
      vendors.expire(24);
      const res = vendors.check(facts({ day, gold, rng }));
      if (res?.offer) { out.vendor = res.offer; say(res.offer.text); }
    }
    return out;
  }

  // ------------------------------------------------------------------ while you were away

  /**
   * THE HALF js/logistics.js's AWAY CLOCK DOES NOT COVER.
   *
   * `createAwayClock` already runs the grid, the machines and the shipments forward and hands back
   * a diff of what the crates hold — correctly, and in slices, so a supply chain three hops long
   * still fills up. What it has never run is the PEOPLE: nobody woke, nobody walked to work, nobody
   * ate, nobody filled a labour order, and no tax was collected. Before this round that did not
   * matter, because a citizen's work never made a single ingot. It matters now.
   *
   * So this is deliberately NOT a second away clock. It takes the window that one already decided
   * on (cap included) and runs the colony, the fields and the trade routes across the same seconds,
   * in the same order the live loop uses:
   *
   *   1. the machines and the carts   (the away clock, called by the caller first)
   *   2. the fields ripen and post harvest orders
   *   3. the people wake, walk, fill orders — including the `lab_*` ones — eat, sleep and pay
   *   4. the machines spend the bank the people just filled                     (a second pass)
   *
   * THE MERCY (`away.mercyDays`). Hunger climbs normally for the first three game days and then
   * holds at the grumbling rung for the rest of the window. Nobody walks out while you are
   * off-world. The reason is the reason raids are gated on defences: **losing your village because
   * you took a flight is a punishment for playing.** You come back to a place that has downed
   * tools, is paying you nothing and is furious — a problem you can fix in an afternoon, and you
   * are told about it in the first line of the card. Anybody who was ALREADY packing when you left
   * is still gone; that one you were warned about before you went.
   */
  function away({ seconds = 0, rng = Math.random, day = 1 } = {}) {
    const window = Math.min(Math.max(0, seconds), AWAY.capSeconds ?? 28800);
    if (window < 1) return null;
    const before = poolTally();
    const hoursPerSecond = 24 / dayLengthSeconds;
    const mercyAfter = (AWAY.mercyDays ?? 3) * dayLengthSeconds;
    const grumble = FOOD.rungs?.grumbling ?? 0.55;
    const leaves = FOOD.rungs?.leaves ?? 1;
    /**
     * WHO WAS ALREADY PACKING WHEN YOU LEFT.
     *
     * They still go. That one you were warned about before you went, and a mercy that saved
     * somebody who was on the doorstep would make the warning meaningless.
     *
     * (The design said hunger "climbs normally for the first three game days and then holds at
     * grumbling". Taken literally that does nothing at all: at `hungerPerDay: 0.5` an unfed citizen
     * reaches the leaving rung on day two, so everybody would be gone before the mercy ever
     * applied. What the mercy is FOR is the stated outcome — nobody walks out while you are
     * off-world — so during the window hunger may climb as far as downing tools, which is visible
     * and painful, and no further; past `mercyDays` it eases back to grumbling.)
     */
    const alreadyGoing = new Set((colony?.citizens || []).filter(c => (c.hunger || 0) >= leaves).map(c => c.id));
    const slice = AWAY.sliceSeconds ?? 20;
    const events = [];
    const ranOut = [];
    let done = 0, guard = 0;

    while (done < window - 1e-6 && guard++ < 20000) {
      const dt = Math.min(slice, window - done);
      farm?.tick?.(dt * hoursPerSecond);
      if (board && works?.postLabour) { works.postLabour(board, { at: done }); works.collectLabour(board); }
      events.push(...(colony?.tick?.(dt * hoursPerSecond) || []));
      works?.catchUp?.(dt, { slice });
      trade.tick(dt, { day, rng });
      done += dt;
      // the mercy, in one line: not past downing tools while you are gone, and back to grumbling
      // once the window is old enough that a player would rather come home to a problem than a hole
      const ceiling = done > mercyAfter ? grumble : leaves - 0.02;
      for (const c of colony?.citizens || []) {
        if (alreadyGoing.has(c.id)) continue;
        if (c.hunger > ceiling) c.hunger = ceiling;
      }
      // "ran out of, and when" is the most useful line on the card and costs one field
      for (const m of works?.all?.() || []) {
        if ((m.state === 'starved' || m.state === 'unworked') && !ranOut.some(r => r.id === m.id)) {
          ranOut.push({ id: m.id, name: m.name, state: m.state, what: m.starvedFor, at: done });
        }
      }
    }

    const after = poolTally();
    const made = [];
    for (const [k, v] of Object.entries(after)) {
      const gain = v - (before[k] || 0);
      if (gain > 0.5) made.push({ res: k, name: nameOfRes(k), n: Math.round(gain) });
    }
    made.sort((a, b) => b.n - a.n);
    const tax = events.filter(e => e.kind === 'tax');
    return card({ seconds: window, capped: seconds > (AWAY.capSeconds ?? 28800) + 1, made, ranOut, events, tax });
  }

  function poolTally() {
    const out = Object.create(null);
    for (const p of stores?.pools?.() || []) {
      for (const [k, v] of Object.entries(p.totals || {})) out[k] = (out[k] || 0) + v;
    }
    return out;
  }
  const nameOfRes = res => resources?.materials?.[res]?.name || String(res).replace(/_/g, ' ');

  /**
   * "While you were away" — the card.
   *
   * Every line is a real diff collected as the window ran, never a rate multiplied by a time. That
   * is also the reason a week away cannot print a mountain of iron however the numbers are tuned:
   * **there is no branch anywhere in this design that invents an input.** A furnace with forty ore
   * in reach makes twenty ingots and then says it is waiting for ore.
   */
  function card({ seconds, capped, made, ranOut, events, tax }) {
    const days = seconds / dayLengthSeconds;
    const gold = tax.reduce((s, t) => s + (t.gold || 0), 0);
    const taxOnly = tax.reduce((s, t) => s + (t.tax ?? t.gold ?? 0), 0);
    const rent = tax.reduce((s, t) => s + (t.rent || 0), 0);
    const wages = tax.reduce((s, t) => s + (t.wages || 0), 0);
    const left = events.filter(e => e.kind === 'departed');
    const rungs = {};
    for (const c of colony?.citizens || []) rungs[c.rung] = (rungs[c.rung] || 0) + 1;
    const dry = ranOut[0];
    return {
      seconds, days: Math.round(days * 10) / 10, capped,
      made, ranOut, gold, tax: taxOnly, rent, wages,
      departed: left.map(e => e.name),
      rungs,
      lines: [
        `${Math.round(days)} day${Math.round(days) === 1 ? '' : 's'} passed here${capped ? ` (capped at ${Math.round((AWAY.capSeconds ?? 28800) / dayLengthSeconds)} days)` : ''}.`,
        made.length ? `Made ${made.slice(0, 4).map(m => `${m.n} ${m.name.toLowerCase()}`).join(' · ')}` : 'Nothing was made.',
        dry ? `${dry.name} ${dry.state === 'unworked' ? 'stood cold — nobody was working it' : `ran out of ${nameOfRes(dry.what || '')}`}, on day ${Math.max(1, Math.round(dry.at / dayLengthSeconds))}.` : null,
        `Tax ${taxOnly} gold · rent ${rent} · wages −${wages}`,
        left.length ? `${left.map(e => e.name).join(', ')} left.` : 'Nobody left.',
      ].filter(Boolean),
    };
  }

  // ------------------------------------------------------------------ the panels

  function report({ day = 1, gold = 0 } = {}) {
    const h = housing.report();
    return {
      housing: h,
      people: colony?.roster?.() || [],
      colony: colony?.report?.() || null,
      machines: works?.labourBoard?.() || [],
      traders: vendors.board(facts({ day, gold })),
      hold: hold.bar(),
      holdRows: hold.rows(),
      vault: vault.bar(),
      routes: trade.list(),
      tradePosts: tradePosts.map(e => ({ id: e.id, name: e.name, x: e.x, z: e.z })),
      posts: postSlots,
      installed,
    };
  }

  return {
    housing, vendors, hold, vault, trade, muster,
    rebuild, tick, away, report, facts, stationAt, madeOf,
    holdCapacity: opts => holdCapacity({ data, carriers: data?.carriers || [], ...opts }),
    get spent() { return spent; },
    addSpend(n) { spent += Math.max(0, n); return spent; },
    get tradePosts() { return tradePosts; },
    get posts() { return postSlots; },
    toJSON() {
      return {
        v: 1, spent, lastVendorDay,
        housing: housing.toJSON(), vendors: vendors.toJSON(),
        hold: hold.toJSON(), vault: vault.toJSON(),
        trade: trade.toJSON(), muster: muster.toJSON(),
      };
    },
    loadJSON(json) {
      if (!json) return;
      spent = json.spent || 0;
      lastVendorDay = json.lastVendorDay || 0;
      housing.load(json.housing);
      vendors.loadJSON(json.vendors);
      hold.loadJSON(json.hold);
      vault.loadJSON(json.vault);
      trade.loadJSON(json.trade);
      muster.loadJSON(json.muster);
    },
  };
}
