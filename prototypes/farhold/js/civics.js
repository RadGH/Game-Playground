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

  /**
   * R28 — THE TRADE POST'S "VAULT" IS GONE. It was a second 2 000 kg hold that nothing ever put a
   * single good into (`civics.vault` had no caller), so the report showed an empty bar for ever.
   * A Trade Post's goods are whatever its stores hold — the same pool every machine beside it uses.
   * An old save's `vault` field is simply ignored.
   */

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
    out.resent = [];
    out.stopped = [];
    for (const r of moved.arrived) say(r.line);
    for (const r of moved.lost) say(r.line);
    // R28 — standing runs: the cart that just got back re-loads and goes again (see `resend`)
    // every arrived standing run, not only this tick's: a cart that got back during the away
    // catch-up (`away` below) waits, arrived, for the first live tick to send it on again
    let purse = gold;
    for (const r of trade.list()) {
      if (r.state !== 'arrived' || !r.repeat || r.resentOnce) continue;
      r.resentOnce = true;
      purse += r.revenue || 0;
      const again = resend(r, { day, gold: purse, at, rng });
      if (again.ok) {
        purse -= again.spent || 0;
        out.resent.push({ from: r.id, route: again.route, spent: again.spent || 0 });
        say(`${again.route.carrierName} loads up again for ${again.route.toName}.`);
      } else {
        r.repeat = false;
        out.stopped.push({ id: r.id, why: again.why });
        say(again.why);
      }
    }
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
      /**
       * R28 — NO DRILLS IN THIS LOOP, AND THAT IS ON PURPOSE. js/main.js runs `away.resume()`
       * (js/logistics.js `createAwayClock`) over the whole window FIRST, and that clock digs: every
       * drill has dug and delivered its window before this loop starts. Running them again here
       * would dig the same hours twice. What this pass adds is the LABOUR the first one cannot see,
       * so a bench a citizen kept lit gets to spend the ore the drills already brought in.
       * tests/round28-automation.test.js pins the order in main.js.
       */
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

  // ------------------------------------------------------------------ sending a cart (R28)

  /**
   * R28 — A CART ROUTE HAS A WAY IN.
   *
   * js/trade.js could plan a run, open it, move it down the road, roll the ambush and pay out on
   * arrival — and js/main.js already collected the gold — but nothing anywhere called `plan` or
   * `open`, so the Trade tab's "On the road" pane was empty in every game ever played. These three
   * are the join: which carriers you can send, what a draft run would pay, and the send itself.
   * The goods come out of the stores beside the Trade Post first and your own hold second.
   */

  /**
   * Which carriers you can send, each with the sentence that says why not. The data's `from`
   * field decides it: a porter is hired at any post; a pack mule needs a Drover in residence; a
   * drone needs a Hauler Post standing; a cart or a wagon is built at the post itself.
   */
  function cartCarriers({ day = 1, gold = 0 } = {}) {
    const here = new Set(vendors.board(facts({ day, gold })).filter(v => v.state === 'here').map(v => v.id));
    const keys = new Set(entries.map(e => e.key));
    return (data?.carriers || []).map(c => {
      let why = null;
      if (c.key === 'pack_mule' && !here.has('drover')) why = 'A pack mule is bought from a Drover, and none lives here yet.';
      if (c.key === 'hauler_drone' && !keys.has('hauler_drone')) why = 'A drone needs a Hauler Post standing.';
      return {
        key: c.key, name: c.name, hold: c.hold, speed: c.speed, upkeep: c.upkeep || 0,
        guardsMax: c.guardsMax || 0, blurb: c.blurb || '', feed: { ...(c.feed || {}) }, ok: !why, why,
      };
    });
  }

  /** The trade goods a post can send, and how many: the stores beside it plus your own hold. */
  function cartGoods(postId) {
    const post = tradePosts.find(p => p.id === postId) || null;
    const pool = post && stores?.poolAt ? stores.poolAt(post.x, post.z) : null;
    return (goods?.goods || []).map(g => {
      const atPost = pool ? Math.floor(stores.count(pool, g.id) || 0) : 0;
      const onBack = Math.floor(hold.count(g.id) || 0);
      return { id: g.id, name: g.name, weight: g.weight, base: g.base, atPost, onBack, n: atPost + onBack };
    }).filter(g => g.n > 0);
  }

  const asPlace = p => (p ? { ...p, x: p.x ?? p.wx ?? 0, z: p.z ?? p.wz ?? 0 } : null);

  /**
   * A draft run, priced. `draft = { postId, to, carrier, guards, manifest }` where `to` is a place
   * (`{ id, name, x, z, size, biome, race, market }`). Nothing leaves.
   */
  function cartPlan(draft = {}, { day = 1, roadShare = 0, danger = 0.35 } = {}) {
    const post = tradePosts.find(p => p.id === draft.postId) || null;
    if (!post) return { ok: false, why: 'A cart leaves from a Trade Post. Build one first.' };
    const from = { id: post.id, name: post.name || 'your Trade Post', x: post.x, z: post.z, market: false };
    const c = cartCarriers({ day }).find(x => x.key === draft.carrier);
    if (c && !c.ok) return { ok: false, why: c.why };
    const have = new Map(cartGoods(post.id).map(g => [g.id, g.n]));
    for (const [id, n] of Object.entries(draft.manifest || {})) {
      if (n > (have.get(id) || 0)) return { ok: false, why: `There ${have.get(id) ? `are only ${have.get(id)}` : 'is no'} ${(trade.good(id)?.name || id).toLowerCase()} at ${from.name} or on your back.` };
    }
    return trade.plan({
      from, to: asPlace(draft.to), carrier: draft.carrier || 'porter', guards: draft.guards || 0,
      manifest: draft.manifest || {}, day, roadShare, danger,
    });
  }

  /**
   * R28 — WHAT A CARRIER EATS. data/colony.json has given the pack mule `feed: { grain: 4 }` since
   * the carriers were written ("faster than the cart and it eats") and nothing ever charged it, so
   * the mule was simply the best carrier under the wagon. It is charged per trip, out of the stores
   * beside the Trade Post (where the animal is kept), and a send with no grain there is refused.
   */
  function feedFor(carrierKey) {
    return { ...((data?.carriers || []).find(c => c.key === carrierKey)?.feed || {}) };
  }

  function poolOfPost(postId) {
    const post = tradePosts.find(x => x.id === postId);
    return post && stores?.poolAt ? stores.poolAt(post.x, post.z) : null;
  }

  /** Is the feed there? `null` when it is, otherwise the sentence. */
  function feedRefusal(carrierKey, postId) {
    const feed = feedFor(carrierKey);
    const pool = poolOfPost(postId);
    for (const [res, n] of Object.entries(feed)) {
      const have = pool ? Math.floor(stores.count(pool, res) || 0) : 0;
      if (have < n) {
        const name = (resources?.materials?.[res]?.name || res).toLowerCase();
        const who = (data?.carriers || []).find(c => c.key === carrierKey)?.name?.toLowerCase() || 'carrier';
        return `A ${who} eats ${n} ${name} a trip, and the stores at the Trade Post hold ${have ? `only ${have}` : 'none'}. The post itself takes trade goods only: put the ${name} in a box beside it.`;
      }
    }
    return null;
  }

  /** A hand into the post's stores and then your hold, which remembers what it lifted. */
  function lifter(postId) {
    const pool = poolOfPost(postId);
    const lifted = [];
    const take = (id, n) => {
      const a = pool ? stores.take(pool, id, n) : 0;
      const b = a < n ? hold.take(id, n - a) : 0;
      lifted.push({ id, a, b });
      return a + b;
    };
    const putBack = () => { for (const l of lifted) { if (l.a && pool) stores.put(pool, l.id, l.a); if (l.b) hold.put(l.id, l.b); } };
    return { take, putBack, pool };
  }

  function eat(carrierKey, postId) {
    const pool = poolOfPost(postId);
    const feed = feedFor(carrierKey);
    for (const [res, n] of Object.entries(feed)) if (pool) stores.take(pool, res, n);
    return feed;
  }

  /**
   * Send it: the goods leave, the upkeep is paid, the feed is eaten, and the gold comes back on
   * arrival (`tick`). `draft.repeat` makes it a standing run that re-loads at the post when it gets
   * back and goes again (see `tick`).
   */
  function sendCart(draft = {}, { day = 1, gold = 0, at = 0, rng = Math.random, roadShare = 0, danger = 0.35 } = {}) {
    const p = cartPlan(draft, { day, roadShare, danger });
    if (!p.ok) return p;
    if (gold < p.upkeep) return { ok: false, why: `The trip costs ${p.upkeep} gold in upkeep and you have ${Math.floor(gold)}.` };
    const hungry = feedRefusal(p.carrier, draft.postId);
    if (hungry) return { ok: false, why: hungry };
    const hand = lifter(draft.postId);
    const out = trade.open({ ...p, repeat: !!draft.repeat }, { take: hand.take, gold, at, rng });
    if (!out.ok) { hand.putBack(); return out; }          // js/trade.js refuses a half-filled cart
    // what `restand` needs to send it again: where it leaves from and where it is going
    out.route.postId = draft.postId;
    out.route.toPlace = asPlace(draft.to);
    out.route.fed = eat(p.carrier, draft.postId);
    return out;
  }

  /** Turn a route's standing order on or off — the "Repeat" toggle on an On-the-road row. */
  function setRepeat(id, on) {
    const r = trade.get(id);
    if (!r) return { ok: false, why: 'That cart is not on the road any more.' };
    if (on && !r.postId) return { ok: false, why: 'Only a cart sent from your own Trade Post can run again.' };
    r.repeat = !!on;
    return { ok: true, route: r };
  }

  /**
   * R28 — A STANDING RUN GOES AGAIN. `trade.restand` was written for exactly this and never had a
   * caller. An arrived repeat cart re-loads the same manifest at its post and sets off; it stops,
   * and SAYS WHY, when the goods, the feed or the upkeep are not there, or the load no longer clears
   * its upkeep at the far end. `gold` is what you will have once this trip has paid.
   */
  function resend(r, { day = 1, gold = 0, at = 0, rng = Math.random } = {}) {
    const post = tradePosts.find(x => x.id === r.postId);
    if (!post || !r.toPlace) return { ok: false, stopped: true, why: `The ${r.carrierName.toLowerCase()} came home to no Trade Post. The run has stopped.` };
    const hungry = feedRefusal(r.carrier, r.postId);
    if (hungry) return { ok: false, stopped: true, why: `${hungry} The run has stopped.` };
    const short = cartPlan({ postId: r.postId, to: r.toPlace, carrier: r.carrier, guards: r.guards, manifest: r.manifest }, { day });
    if (!short.ok) return { ok: false, stopped: true, why: `${short.why} The run to ${r.toName} has stopped.` };
    if (gold < short.upkeep) return { ok: false, stopped: true, why: `The run to ${r.toName} needs ${short.upkeep} gold upkeep and you have ${Math.floor(gold)}. It has stopped.` };
    const hand = lifter(r.postId);
    const from = { id: post.id, name: post.name || 'your Trade Post', x: post.x, z: post.z, market: false };
    const out = trade.restand(r, { from, to: r.toPlace, day, take: hand.take, gold, rng, at, clears: 'revenue' });
    if (!out.ok) { hand.putBack(); return { ...out, stopped: true }; }
    out.route.postId = r.postId;
    out.route.toPlace = r.toPlace;
    out.route.fed = eat(r.carrier, r.postId);
    return out;
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
      routes: trade.list(),
      tradePosts: tradePosts.map(e => ({ id: e.id, name: e.name, x: e.x, z: e.z })),
      posts: postSlots,
      installed,
    };
  }

  return {
    housing, vendors, hold, trade, muster,
    rebuild, tick, away, report, facts, stationAt, madeOf,
    // R28 — the cart route's way in (the Trade tab's "Send a cart")
    cartCarriers, cartGoods, cartPlan, sendCart, setRepeat, resend, feedRefusal,
    holdCapacity: opts => holdCapacity({ data, carriers: data?.carriers || [], ...opts }),
    get spent() { return spent; },
    addSpend(n) { spent += Math.max(0, n); return spent; },
    get tradePosts() { return tradePosts; },
    get posts() { return postSlots; },
    toJSON() {
      return {
        v: 1, spent, lastVendorDay,
        housing: housing.toJSON(), vendors: vendors.toJSON(),
        hold: hold.toJSON(),
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
      trade.loadJSON(json.trade);
      muster.loadJSON(json.muster);
    },
  };
}
