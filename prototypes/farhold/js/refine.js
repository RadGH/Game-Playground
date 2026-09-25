// Farhold — refining: raw stuff into useful stuff, in three tiers, while you are somewhere else.
//
// BUILDING_EXPANSION §2. Every recipe and every machine lives in `data/refining.json`; this file is
// only the engine that runs them. Three rules shape it:
//
//   §2.19 EVERYTHING QUEUES. You set a job and walk away. `catchUp(seconds)` runs a machine forward
//         when you come back from a fight, so "set it going and leave" is the intended way to use
//         the place rather than something you get away with.
//   §2.18 RECIPES UNLOCK BY DOING. Smelt iron ten times and the alloy forge's steel appears. There
//         is no tech-tree screen for tier one; `completed` counts what you have made and
//         `available()` tells you what that has opened up.
//   §2.20 REFINING IS WHERE POWER STARTS TO MATTER. Tier 0 burns fuel and does not care about the
//         grid. Tier 1 runs slowly by hand and properly on power. Tier 2 does not run at all
//         without it — and the refinery will not even start without coolant in the pool.
//
//   import { createWorks } from './refine.js';
//   const works = createWorks({ refining, resources, stores, grid, log });
//   works.place({ id: 'furnace1', type: 'furnace', x: 4, z: 2 });
//   works.queue('furnace1', 'smelt_iron', 10);
//   works.tick(1 / 60);              // in the frame loop
//   works.catchUp(600);              // ten minutes passed while you were in a dungeon
//
// Pure: no DOM, no Three.js, no clock of its own. The machine's badge, the job list and the
// progress bar are drawn from `snapshot()`.

// R16 — the ledger's own sentence, so a machine can say who kept it lit last shift. This is the
// only thing refine.js takes from js/work.js, and it takes nothing back: work.js still knows
// nothing about machines.
import { creditLine, progressFraction } from './work.js';

/**
 * `stores` is a js/stores.js network — a machine draws from and delivers to the pool it stands in,
 * which is the whole point of §8: a machine outside every pool has nothing to work with.
 * `grid` is a js/power.js grid, or null for a base that has not got that far yet.
 */
export function createWorks({ refining = {}, resources = {}, stores = null, grid = null, log = null, rareElement = null, labour = null,
  /**
   * R26 — THE PACK ON YOUR BACK, AS A LAST RESORT.
   *
   *   "I built a furnace and queued up 2 iron ingot. However it just says '2 min of work banked'…
   *    It is not making the iron, and I cannot add or remove items."
   *
   * A machine used to draw ONLY from the storage pool it stood in. With no box in reach there was
   * no pool, `see()` answered 0 for everything, and a furnace with a full work bank sat starved for
   * iron ore while the ore was in the player's pack two metres away. The screen's one way to move
   * it — "Load it from your pack" — tipped the pack into the stores, and with no stores it put
   * everything straight back in the pack. So nothing could ever go in.
   *
   * `bag` is `{ count(id), take(id, n) -> taken, put(id, n) -> put }` (js/main.js hands in the
   * materials bag). A machine takes from its pool first and then from the bag, and puts what it
   * makes into the pool first and then the bag. The bag is used when there is NO pool at all (then
   * the pack is the only place anything can be), or when `bagReach(machine)` says yes — main.js
   * answers "the player is standing at it", so a furnace far from you never quietly eats your pack.
   * Omit it and the module is the one every older test drives.
   */
  bag = null, bagReach = null,
} = {}) {
  const MACHINES = refining.machines || {};
  const RECIPES = Object.fromEntries((refining.recipes || []).map(r => [r.id, r]));
  const BY_MACHINE = {};
  for (const r of refining.recipes || []) (BY_MACHINE[r.machine] ||= []).push(r);
  const MATS = resources.materials || {};
  /**
   * THE EXCHANGE RATE, AND IT IS FIXED IN ONE PLACE.
   *
   * The Civilization Expansion §3. js/work.js deliberately says nothing about what a work unit
   * BUYS — that is the caller's business, and it is why the unit is interchangeable between your
   * arm, a citizen's shift and a powered machine. Here is where this game decides: **one work unit
   * buys thirty seconds of a tended machine's running time.**
   *
   * A smelter at mood 0.7 puts about 10.6 units in over an 11-hour shift, which is 319 seconds of
   * furnace out of a 412-second working day — the furnace is lit for about three-quarters of the
   * shift and dark all night. That is the readable number the whole round hangs on: **one worker is
   * one furnace.** Two furnaces and one smelter is two half-lit furnaces, and the panel says so.
   */
  const LAB = {
    secondsPerUnit: 30, bankSeconds: 120, orderUnits: 4,
    /**
     * R16 — WHAT YOUR OWN TWO HANDS ARE WORTH, per REAL second.
     *
     *   "Players can contribute work by holding E… NPCs can also work automatically and the player
     *    can jump in to help make it go faster."
     *
     * `stand` is the rate R15 already gave you for being in the room: one unit every thirty seconds,
     * which is thirty machine-seconds every thirty seconds — you attending a furnace keeps it lit
     * exactly 1:1 and no better. `hold` is three times that, which is the whole point of holding the
     * key: jumping in genuinely speeds it up rather than being a fancier way to stand still.
     *
     * A citizen is about 1.1 units an hour of game time and the game runs fifteen times real time,
     * so a smelter is putting in roughly 0.0046 units a real second. You, holding E, are 0.1 — about
     * twenty of them. That is deliberate and it is not a balance problem: you can only be at one
     * machine, and only while you are standing there doing nothing else.
     */
    handStandPerSecond: 1 / 30,
    handHoldPerSecond: 0.1,
    ...(refining.handWork || {}),
    ...(labour || {}),
  };
  /**
   * …AND IT IS OFF UNTIL SOMEBODY IS THERE TO SWITCH IT ON.
   *
   * Passing the `labour` block (data/colony.json's `labour`) is what turns the rule on. That is not
   * squeamishness about the feature — it is that a machine which refuses to run without a worker is
   * only fair in a game that HAS workers, a work board and a screen saying so. A caller that has
   * not wired the colony (an old save path, a node test about smelting, the balance harness) gets
   * the module it has always had, and the one that has wired it gets the furnace that goes cold at
   * six. One argument, and the sentence in the panel is the same either way.
   */
  const LABOUR_ON = !!labour;

  const machines = new Map();
  /** How many times each recipe has been completed, ever. This is the whole unlock system. */
  const completed = Object.create(null);
  const justUnlocked = [];

  const nameOf = id => MATS[id]?.name || id;

  // ---------------------------------------------------------------- building one

  function place({ id, type, x = 0, z = 0, name = null }) {
    const def = MACHINES[type];
    if (!def) return { ok: false, why: `there is no such machine as "${type}"` };
    const m = {
      id, type, def, x, z,
      name: name || def.name,
      queue: [],                 // [{ recipe, left, done }]
      crafting: false, progress: 0,
      // R18 — what a finished-but-blocked batch still owes the pool; see the grant loop in `step`
      pending: null,
      fuelSeconds: 0, fuelRes: null,
      state: 'idle', starvedFor: null, made: 0,
      /**
       * SECONDS OF WORK PAID FOR IN ADVANCE, AND NOT ONE SECOND MORE.
       *
       * Capped at `labour.bankSeconds` so a furnace cannot be charged for a week and left. A machine
       * that runs out mid-batch keeps its progress AND its inputs and simply stops; when somebody
       * turns up it carries on from where it was.
       */
      workBank: 0,
      workedSeconds: 0,
      /**
       * R16 — THE SWITCH. `enabled` has been read by `step`, by `postLabour` and by `toJSON` since
       * the building expansion landed, and there has never been a way to set it. Classic Farhold:
       * a finished rule with no door. `setEnabled` is the door — see the note on it below.
       */
      enabled: true,
      /**
       * R16 — HOW BADLY THIS ONE WANTS A WORKER, 0 / 1 / 2.
       *
       * It is the `priority` on the machine's own work order and nothing else, so it is sorted by
       * js/work.js `nextFor` — which already put priority first and had nothing ever setting it
       * above the default. A base with six benches and two smelters finally has a way to say which
       * two of them get tended first.
       */
      priority: 1,
      /** The ledger's sentence for the last four units this machine was paid — see `collectLabour`. */
      lastCredit: '',
    };
    machines.set(id, m);
    // tell the grid about it so load shedding can find it. A tier-0 machine has no draw at all,
    // which is exactly why you can build one the hour you land.
    if (grid && (def.powerUse || 0) > 0) {
      grid.add({ id, type, x, z, draw: def.powerUse, priority: def.priority || 'refining', name: m.name });
    }
    return { ok: true, machine: m };
  }
  function removeMachine(id) { grid?.remove(id); return machines.delete(id); }
  const get = id => machines.get(id) || null;

  // ---------------------------------------------------------------- what you may make

  /** Has this recipe been earned yet? §2.18 — you earn it by doing the one before it. */
  function isUnlocked(recipeId) {
    const r = RECIPES[recipeId];
    if (!r) return false;
    if (!r.unlock) return true;
    return (completed[r.unlock.recipe] || 0) >= (r.unlock.times || 1);
  }

  /** How close you are to earning it, for the "3 more and this appears" line. */
  function unlockProgress(recipeId) {
    const r = RECIPES[recipeId];
    if (!r?.unlock) return { locked: false, done: 0, need: 0, text: '' };
    const done = completed[r.unlock.recipe] || 0, need = r.unlock.times || 1;
    const via = RECIPES[r.unlock.recipe];
    return {
      locked: done < need, done, need,
      text: done >= need ? '' : `${need - done} more ${via?.name || r.unlock.recipe} and this turns up`,
    };
  }

  /** Every recipe this machine can run right now. */
  function available(machineType) {
    return (BY_MACHINE[machineType] || []).filter(r => isUnlocked(r.id));
  }
  /** Every recipe this machine has, unlocked or not, so the UI can grey out the rest. */
  function board(machineType) {
    return (BY_MACHINE[machineType] || []).map(r => ({ ...r, unlock: unlockProgress(r.id), unlocked: isUnlocked(r.id) }));
  }

  /**
   * The real input list for a recipe. `rareInput` is a count rather than an id: which rare element
   * a recipe eats depends on what this planet holds (§9.6), and on a world that holds none the
   * recipe honestly cannot be run here.
   */
  function inputsOf(recipe) {
    const ins = { ...(recipe.inputs || {}) };
    if (recipe.rareInput) {
      if (!rareElement) return null;
      ins[rareElement] = (ins[rareElement] || 0) + recipe.rareInput;
    }
    return ins;
  }

  // ---------------------------------------------------------------- the queue

  /** Put a job on a machine. `count` 0 or less means "keep going until told otherwise". */
  function queue(machineId, recipeId, count = 1) {
    const m = get(machineId);
    if (!m) return { ok: false, why: 'no such machine' };
    const r = RECIPES[recipeId];
    if (!r) return { ok: false, why: 'no such recipe' };
    if (r.machine !== m.type) return { ok: false, why: `${m.name} cannot run ${r.name}` };
    if (!isUnlocked(recipeId)) return { ok: false, why: unlockProgress(recipeId).text || 'not learned yet' };
    if (r.rareInput && !rareElement) return { ok: false, why: 'this world holds no rare element — you will have to go and find one' };
    /**
     * R26 — THE SAME RECIPE TWICE IS ONE ROW, NOT TWO.
     *
     * "Smelt Iron is still listed as 0/1 two times." Clicking ×1 twice pushed two jobs of one each,
     * which read as two separate orders that were each stuck. If the LAST job on the queue is the
     * same recipe, the new count goes onto it — "0/2" — and a standing order swallows any count.
     */
    const last = m.queue[m.queue.length - 1];
    if (last && last.recipe === recipeId) {
      if (count <= 0) last.left = Infinity;
      else if (last.left !== Infinity) last.left += count;
      return { ok: true, job: last, merged: true };
    }
    m.queue.push({ recipe: recipeId, left: count > 0 ? count : Infinity, done: 0 });
    return { ok: true, job: m.queue[m.queue.length - 1] };
  }
  /**
   * R26 — change how many a queued job still has to make, from the screen's − and + buttons.
   * Down to zero takes the job off; the one being made right now is never un-made.
   */
  function adjust(machineId, index = 0, delta = 0) {
    const m = get(machineId);
    const job = m?.queue[index];
    if (!job || job.left === Infinity) return false;
    const floor = index === 0 && m.crafting ? 1 : 0;
    job.left = Math.max(floor, job.left + Math.round(delta));
    if (job.left <= 0) cancel(machineId, index);
    return true;
  }
  function cancel(machineId, index = 0) {
    const m = get(machineId);
    if (!m || !m.queue[index]) return false;
    m.queue.splice(index, 1);
    if (index === 0) { m.crafting = false; m.progress = 0; }
    return true;
  }
  function clear(machineId) { const m = get(machineId); if (!m) return false; m.queue.length = 0; m.crafting = false; m.progress = 0; return true; }

  // ---------------------------------------------------------------- the pool it stands in

  function poolFor(m) { return stores ? stores.poolAt(m.x, m.z) : null; }
  /** R26 — may this machine reach the pack right now? See the `bag` note at the top. */
  function bagOpen(m, pool = poolFor(m)) {
    if (!bag) return false;
    if (!pool) return true;
    try { return !!bagReach?.(m); } catch { return false; }
  }
  function see(m, res) {
    const p = poolFor(m);
    return (p ? stores.count(p, res) : 0) + (bagOpen(m, p) ? (bag.count?.(res) || 0) : 0);
  }
  function takeFrom(m, res, n) {
    const p = poolFor(m);
    let got = p ? stores.take(p, res, n) : 0;
    if (got < n - 1e-9 && bagOpen(m, p)) got += bag.take?.(res, n - got) || 0;
    return got;
  }
  function putInto(m, res, n) {
    const p = poolFor(m);
    let put = p ? stores.put(p, res, n) : 0;
    if (put < n - 1e-9 && bagOpen(m, p)) put += bag.put?.(res, n - put) || 0;
    return put;
  }

  // ---------------------------------------------------------------- fuel, for the tier-0 lot

  /**
   * Keep a fuel-burning machine lit. `fuels` says how many SECONDS of work one unit buys, so a log
   * is worth eighteen seconds in a furnace and coal is worth seventy — which is the whole reason
   * coal matters before power does.
   */
  function stoke(m) {
    const fuels = m.def.fuels || {};
    if (!Object.keys(fuels).length) return true;
    if (m.fuelSeconds > 0) return true;
    // best first: the fuel that buys the most seconds, so nobody burns beams by accident
    const order = Object.entries(fuels).sort((a, b) => b[1] - a[1]);
    for (const [res, seconds] of order) {
      if (see(m, res) >= 1 && takeFrom(m, res, 1) >= 1) { m.fuelSeconds += seconds; m.fuelRes = res; return true; }
    }
    m.fuelRes = null;
    return false;
  }

  /** How fast this machine runs right now: 0 means it is not running at all, and why. */
  function speedOf(m) {
    const def = m.def;
    let factor = 1;
    if ((def.powerUse || 0) > 0) {
      const powered = grid ? grid.poweredOf(m.id) : 0;
      if (def.needsPower) {
        if (powered < 0.05) return { speed: 0, why: grid ? (grid.stateOf(m.id) === 'unpowered' ? 'unpowered' : 'shed') : 'unpowered' };
        factor = powered;
      } else {
        // it turns by hand at a fraction of the speed, which is what makes a sawmill worth having
        // before the grid is
        factor = powered >= 0.05 ? powered : (def.unpoweredSpeed ?? 0.35);
      }
    }
    return { speed: (def.speed ?? 1) * factor, why: '' };
  }

  // ---------------------------------------------------------------- somebody has to work it

  /**
   * HOW MANY SECONDS OF WORK ONE UNIT BUYS AT THIS MACHINE, OR 0 FOR "NOBODY IS NEEDED".
   *
   * The Civilization Expansion §3.2. Three answers, and the data decides which:
   *
   *   * no `labour` block, or `secondsPerUnit: 0` — a tier-2 machine. Power is the whole cost and
   *     always was (INDUSTRY.md §3); a refinery is unaffected by any of this.
   *   * `auto: false` — tier 0. Somebody stands at it. **This is the user's furnace.**
   *   * `auto: true` — tier 1. A pair of hands turns it, and POWER TURNS IT FOR YOU: the moment the
   *     grid is actually carrying the bench it pays its own labour. That is exactly the promotion
   *     INDUSTRY.md §1 makes of the drill, applied to a bench, and it is why a wired sawmill is
   *     worth more than a second sawmill.
   */
  function labourNeed(m) {
    if (!LABOUR_ON) return 0;
    const L = m.def.labour;
    const per = L?.secondsPerUnit || 0;
    if (per <= 0) return 0;
    if (L.auto && grid && grid.poweredOf(m.id) >= 0.05) return 0;
    return per;
  }

  /** How deep the bank may go, in seconds, for this machine. */
  const bankCap = m => m.def.labour?.bankSeconds ?? LAB.bankSeconds;

  /**
   * Work units, turned into machine seconds.
   *
   * The ONLY way the bank fills. `units` came off an ordinary work order on js/work.js's board, so
   * it makes no difference at all whether the player swung at it, a citizen filled it on their
   * shift, or a Tender Arm ground through it while everyone was asleep — which is the whole
   * interchangeability claim, finally pointed at a machine.
   */
  function credit(machineId, units = 1) {
    const m = get(machineId);
    if (!m) return 0;
    const per = m.def.labour?.secondsPerUnit || LAB.secondsPerUnit;
    const before = m.workBank;
    m.workBank = Math.min(bankCap(m), m.workBank + Math.max(0, units) * per);
    return m.workBank - before;
  }

  /**
   * Put one small order per machine that wants tending on the board, and take it off again when it
   * does not.
   *
   * §3.3. This is the join — js/refine.js posts ORDINARY work orders and nothing else, so all three
   * sources already work and not one line of js/work.js changes. The smelter job's tags in
   * data/colony.json are already `["refine", "craft"]` and the order's tag is `refine`: **they
   * already matched.** That is how close this join has been since the colony landed.
   *
   * Four units is two minutes of furnace — about eight iron ingots — which is a small enough grain
   * that a citizen's shift reads as a stream of completions and a large enough one that the board
   * is not a thousand rows.
   */
  function postLabour(board, { at = 0, units = LAB.orderUnits } = {}) {
    if (!board) return 0;
    let posted = 0;
    for (const m of machines.values()) {
      const need = labourNeed(m);
      const id = `lab_${m.id}`;
      const open = board.get(id);
      const live = open && !open.complete && !open.cancelled;
      if (!need || !m.queue.length || !m.enabled) {
        if (open && !open.complete) board.cancel(id);
        continue;
      }
      if (m.workBank >= bankCap(m) - 1e-6) continue;
      // R16 — an order already up follows the machine's switch: changing the priority on a bench
      // that somebody is already walking towards has to mean something NOW, not in four units' time
      if (live) { open.priority = m.priority ?? 1; continue; }        // one open order per machine
      board.postJob({
        id, tag: 'refine', stationId: m.id,
        name: `Work the ${m.name}`, units, priority: m.priority ?? 1, postedAt: at,
        meta: { machine: m.id, seconds: units * need },
      });
      posted++;
    }
    /**
     * R16 — AN ORDER FOR A MACHINE THAT IS NO LONGER THERE.
     *
     * The loop above can only see machines that exist, so a bench you took down left its `lab_*`
     * order on the board for ever: citizens would walk to a patch of grass and pour their shift
     * into a counter nothing would ever collect. It could not happen before this round because the
     * board never survived a load; it can now, and a drill or a bench being taken down is an
     * ordinary thing to do.
     */
    for (const o of board.open?.() || []) {
      if (!o.meta?.machine || machines.has(o.meta.machine)) continue;
      board.cancel(o.id);
    }
    return posted;
  }

  /**
   * Sweep a board and pay the machines for the work that has gone into their orders.
   *
   * Safe to run more than once: an order remembers how many of its units have been paid for, so a
   * caller that also sweeps for its own reasons cannot pay a furnace twice for the same four units.
   *
   * R16 — IT PAYS AS THE WORK GOES IN, NOT ONLY WHEN THE ORDER FINISHES.
   *
   * It used to wait for the whole four units. That was invisible while the player's own effort went
   * straight into the bank round the side of the board (R15 called `credit` directly) — but now
   * that standing at a bench goes through an ORDER like everybody else's effort does, waiting for
   * the order meant a furnace you were attending stood cold for two full minutes and then ran for
   * two minutes off a lump sum. Same throughput, and it reads as broken.
   *
   * Paying the delta fixes it for citizens too: a worker halfway through their order used to buy
   * the machine nothing at all, so a bench with one person on it ran in two-minute pulses.
   */
  function collectLabour(board) {
    if (!board) return 0;
    let units = 0;
    for (const o of [...(board.finished || []), ...(board.open?.() || [])]) {
      if (!o?.meta?.machine) continue;
      const owed = Math.max(0, (o.done || 0) - (o._labourPaidUnits || 0));
      if (owed <= 1e-6) continue;
      o._labourPaidUnits = o.done;
      credit(o.meta.machine, owed);
      units += owed;
      /**
       * R16 — WHO KEPT IT LIT. `creditLine` has existed in js/work.js since the day it was written,
       * with the comment "3 by Marwen is the sentence that makes a citizen feel like a person", and
       * nothing has ever rendered it. The machine remembers its last shift and the bench panel
       * prints it: "4 by hand" when you did it all, "2.5 by hand, 1.5 by Marwen" when you helped.
       */
      const m = get(o.meta.machine);
      if (m && o.complete) m.lastCredit = creditLine(o);
    }
    return units;
  }

  /**
   * R16 — THE SWITCH, AND THE THREE PLACES THAT ALREADY READ IT.
   *
   * `m.enabled` is checked at the top of `step` (a switched-off machine does not run), in
   * `postLabour` (it does not ask for a worker either, so nobody walks to it) and in `toJSON` (it
   * survives a save). All three were written when the machine was. NOTHING HAS EVER SET IT — there
   * was no `setEnabled`, no button, no key. This is the twelve-finished-modules-with-no-door fault
   * this project keeps finding, in miniature, and it matters more now than it did: a bench you are
   * not using still posts a labour order every second, so your one smelter splits their shift
   * between the furnace you care about and the loom you built and forgot.
   *
   * Turning one off is NOT the same as clearing its queue: the queue, the half-finished batch and
   * the bank all stay exactly where they are, and it carries on from there when you switch it back.
   */
  function setEnabled(machineId, on = true) {
    const m = get(machineId);
    if (!m) return null;
    m.enabled = !!on;
    if (!m.enabled) {
      // it stops being 'running' the instant it is off, or the badge lies until the next frame
      m.state = 'idle';
      grid?.setBusy(m.id, false);
    }
    return m.enabled;
  }

  /** R16 — 0 low, 1 normal, 2 high. See the note on `place`'s `priority` field. */
  function setPriority(machineId, p = 1) {
    const m = get(machineId);
    if (!m) return null;
    m.priority = Math.max(0, Math.min(2, Math.round(Number(p) || 0)));
    return m.priority;
  }

  /** The word for a priority, so the panel and the log say the same thing. */
  const PRIORITY_WORDS = ['when there is nothing else', 'normal', 'first'];

  // ---------------------------------------------------------------- one machine, one step

  function step(m, dt) {
    if (!m.enabled) { m.state = 'idle'; grid?.setBusy(m.id, false); return; }
    const job = m.queue[0];
    if (!job) { m.state = 'idle'; m.crafting = false; grid?.setBusy(m.id, false); return; }
    const recipe = RECIPES[job.recipe];
    if (!recipe) { m.queue.shift(); return; }

    const { speed, why } = speedOf(m);
    if (speed <= 0) { m.state = why || 'unpowered'; grid?.setBusy(m.id, false); return; }

    /**
     * NOBODY IS WORKING THIS, SO IT IS NOT WORKING.
     *
     * §3.2, and the ordering is the ordering this file already uses for coolant below: **labour is
     * checked before the inputs are consumed**, because a machine that has already eaten two iron
     * ore cannot then be told nobody was there to do it. Progress and inputs are held exactly where
     * they were; when somebody turns up it carries on.
     */
    const labourSeconds = labourNeed(m);
    if (labourSeconds > 0 && m.workBank <= 1e-6) {
      if (m.state !== 'unworked') log?.(`${m.name} is standing cold. Nobody is working it.`);
      m.state = 'unworked';
      m.starvedFor = null;
      if (m.coldSince == null) m.coldSince = m.workedSeconds;
      grid?.setBusy(m.id, false);
      return;
    }
    m.coldSince = null;

    let budget = dt;
    let guard = 0;
    while (budget > 1e-9 && guard++ < 10000) {
      if (!m.crafting) {
        const ins = inputsOf(recipe);
        if (!ins) { m.state = 'starved'; m.starvedFor = 'a rare element this world does not hold'; break; }
        let short = null;
        for (const [res, n] of Object.entries(ins)) if (see(m, res) < n) { short = res; break; }
        if (short) {
          if (m.state !== 'starved') log?.(`${m.name} has stopped: no ${nameOf(short)}.`);
          m.state = 'starved'; m.starvedFor = short;
          grid?.setBusy(m.id, false);
          break;
        }
        for (const [res, n] of Object.entries(ins)) takeFrom(m, res, n);
        m.crafting = true; m.progress = 0; m.starvedFor = null;
      }

      // a fuel burner needs to be lit; a coolant machine needs coolant every second it runs
      if (Object.keys(m.def.fuels || {}).length && !stoke(m)) {
        if (m.state !== 'starved') log?.(`${m.name} has gone out: nothing left to burn.`);
        m.state = 'starved'; m.starvedFor = 'fuel';
        grid?.setBusy(m.id, false);
        break;
      }

      // real seconds to finish, never negative — a slice that ran backwards used to wind the
      // progress bar down and let a machine finish a job it had been refusing to run
      const need = Math.max(0, (recipe.time - m.progress) / speed);
      // …and never longer than the work that has actually been paid for. Without this clamp a
      // 20-second catch-up slice would run a furnace with three seconds in the bank for the whole
      // twenty, which is the one way a machine could produce something nobody worked for.
      const slice = Math.max(0, Math.min(budget, need, labourSeconds > 0 ? m.workBank : Infinity));

      // coolant is taken BEFORE the work is credited, because a machine that has already done the
      // work cannot then be told it was not allowed to
      if (m.def.coolant) {
        let dry = null;
        for (const [res, perSec] of Object.entries(m.def.coolant)) {
          const want = perSec * slice;
          if (want <= 0) continue;
          if (takeFrom(m, res, want) < want - 1e-9) { dry = res; break; }
        }
        if (dry) {
          if (m.state !== 'starved') log?.(`${m.name} is out of ${nameOf(dry)} and has shut down.`);
          m.state = 'starved'; m.starvedFor = dry;
          grid?.setBusy(m.id, false);
          return;
        }
      }

      m.progress += slice * speed;
      budget -= slice;
      m.workedSeconds += slice;
      // a tended machine spends its bank at one second a second, whatever speed it is running at:
      // a worker's hour buys machine TIME, not machine output, so wiring a bench to the grid makes
      // the same hour go further rather than making the hour cheaper
      if (labourSeconds > 0) {
        m.workBank = Math.max(0, m.workBank - slice);
        if (m.workBank <= 1e-6) { m.state = 'unworked'; grid?.setBusy(m.id, false); break; }
      }
      if (m.fuelSeconds > 0) m.fuelSeconds = Math.max(0, m.fuelSeconds - slice);
      m.state = 'running';
      grid?.setBusy(m.id, true);

      if (m.progress + 1e-9 < recipe.time) break;

      /**
       * Finished: everything has to fit somewhere or the machine holds the batch and says so.
       *
       * R18 — A BLOCKED MACHINE USED TO RE-GRANT WHATEVER DID FIT, EVERY SINGLE TICK.
       *
       * The old loop poured the whole of `recipe.outputs` into the pool and set `blocked` if any
       * of it was refused — but the parts that FITTED had already gone in, while `m.crafting` and
       * `m.progress` were left at "finished". So the next `step()` fell straight past
       * `if (m.progress + 1e-9 < recipe.time) break;` and ran this loop AGAIN, depositing the
       * fitting outputs a second time. `works.tick` runs every frame, so that is sixty free
       * batches a second for as long as the pool will take them.
       *
       * Measured: a Sawmill on `tap_resin` (2 log → 3 resin + 1 plank) beside a store that was
       * full of resin turned 2 logs into 90 planks in two seconds.
       *
       * It only became reachable when round 18 fixed `createStoreNetwork`'s `materials` argument:
       * before that `kindOf` answered `'refined'` for everything, so `roomFor` never capped
       * anything and a store never refused a delivery at all.
       *
       * `pending` is what the batch still owes. It is created once when the batch finishes, and a
       * retry only ever tries the remainder — so the outputs of one batch are granted exactly once
       * however many ticks it spends blocked.
       */
      if (!m.pending) m.pending = { ...(recipe.outputs || {}) };
      let allOut = true;
      for (const res of Object.keys(m.pending)) {
        const owed = m.pending[res];
        if (owed <= 1e-9) { delete m.pending[res]; continue; }
        const left = owed - putInto(m, res, owed);
        if (left > 1e-9) { m.pending[res] = left; allOut = false; } else delete m.pending[res];
      }
      if (!allOut) {
        // …and say it ONCE, on the way in. This used to log every frame it stayed blocked.
        if (m.state !== 'blocked') log?.(`${m.name} has finished and there is nowhere to put it.`);
        m.state = 'blocked';
        m.progress = recipe.time;
        grid?.setBusy(m.id, false);
        break;
      }
      m.pending = null;
      m.crafting = false; m.progress = 0; m.made++;
      job.done++;
      completed[recipe.id] = (completed[recipe.id] || 0) + 1;
      noteUnlocks(recipe.id);
      if (job.left !== Infinity) job.left--;
      if (job.left <= 0) { m.queue.shift(); if (!m.queue.length) { m.state = 'idle'; grid?.setBusy(m.id, false); break; } }
    }
  }

  /** Anything this completion just opened up gets announced once, not every tick. */
  function noteUnlocks(justDone) {
    for (const r of refining.recipes || []) {
      if (r.unlock?.recipe !== justDone) continue;
      if ((completed[justDone] || 0) !== (r.unlock.times || 1)) continue;     // exactly on the step
      justUnlocked.push(r.id);
      log?.(`You have the hang of it: ${r.name} is now on the ${MACHINES[r.machine]?.name || r.machine}.`);
    }
  }

  /** One frame. */
  function tick(dt) {
    for (const m of machines.values()) step(m, dt);
    const opened = justUnlocked.splice(0, justUnlocked.length);
    return { unlocked: opened };
  }

  /**
   * Catch every machine up after time has passed elsewhere — a fight, a dungeon, a night's sleep.
   *
   * Chopped into slices rather than run as one enormous step, because a machine can go from running
   * to starved to blocked inside the window and the fuel, the coolant and the pool all have to see
   * that happen in order. The slice is deliberately coarse: this is a catch-up, not a simulation.
   */
  function catchUp(seconds, { slice = 5 } = {}) {
    let left = Math.max(0, seconds);
    const opened = [];
    let guard = 0;
    while (left > 1e-6 && guard++ < 20000) {
      const dt = Math.min(slice, left);
      opened.push(...tick(dt).unlocked);
      left -= dt;
    }
    return { unlocked: [...new Set(opened)] };
  }

  // ---------------------------------------------------------------- telling the player

  /** What to draw on one machine: its badge, its job, and how far through it is. */
  /**
   * R18 — WHAT THIS BASE IS ACTUALLY MAKING, per minute.
   *
   * `js/defence.js` `baseOf()` has called `getWorks().throughputPerMinute()` since the colony
   * landed and this module never exported it, so `|| 0` swallowed it and data/raids.json's
   * `notoriety.perRefineryThroughput: 0.6` contributed nothing — a base with a full refining chain
   * was exactly as noticeable to the world as a bare claim stone.
   *
   * Counted from what is STANDING and RUNNING rather than from history: a machine with a job and
   * the inputs to do it contributes `60 / recipe.time` finished items a minute, scaled by how fast
   * it is actually going. That is the number a raider could plausibly notice — smoke now, not smoke
   * last week — and it falls to zero when the base goes quiet, which a lifetime count never would.
   */
  function throughputPerMinute() {
    let per = 0;
    for (const m of machines.values()) {
      if (!m.enabled || m.state !== 'running') continue;
      const job = m.queue[0];
      const recipe = job && RECIPES[job.recipe];
      if (!recipe?.time) continue;
      const outs = Object.values(recipe.outputs || {}).reduce((n, v) => n + v, 0) || 1;
      per += (60 / recipe.time) * outs * (m.def.speed ?? 1);
    }
    return Math.round(per * 10) / 10;
  }

  function snapshot(id) {
    const m = get(id);
    if (!m) return null;
    const job = m.queue[0];
    const recipe = job ? RECIPES[job.recipe] : null;
    return {
      id: m.id, name: m.name, type: m.type, tier: m.def.tier,
      state: m.state,
      stateText: stateText(m),
      declared: stateDeclared(m),       // R19 — data/power.json's `machineStates` knows this word
      recipe: recipe?.id || null,
      recipeName: recipe?.name || '',
      progress: recipe ? Math.min(1, m.progress / recipe.time) : 0,
      queued: m.queue.map(j => ({ recipe: j.recipe, name: RECIPES[j.recipe]?.name || j.recipe, left: j.left, done: j.done })),
      fuel: m.fuelRes ? { resource: m.fuelRes, name: nameOf(m.fuelRes), seconds: +m.fuelSeconds.toFixed(1) } : null,
      made: m.made,
      pooled: !!poolFor(m),
      // the Civilization Expansion §3: who is keeping this lit, and for how much longer
      needsWorking: labourNeed(m) > 0,
      workBank: Math.round(m.workBank),
      workBankMax: bankCap(m),
      minutesLeft: Math.round((m.workBank / 60) * 10) / 10,
      // R16 — the switch, the queue order, and who did the last shift
      enabled: m.enabled !== false,
      priority: m.priority ?? 1,
      priorityWord: PRIORITY_WORDS[m.priority ?? 1] || 'normal',
      lastCredit: m.lastCredit || '',
    };
  }

  /** The line under the badge. Plain language: a player should never have to guess. */
  function stateText(m) {
    // R16 — the switch answers before anything else, because "Nothing queued" on a bench you turned
    // off yourself is the game blaming you for a state you chose
    if (m.enabled === false) return 'Switched off';
    switch (m.state) {
      case 'running': return `Working${m.fuelRes ? ` — burning ${nameOf(m.fuelRes)}` : ''}`;
      case 'idle': return m.queue.length ? 'Waiting' : 'Nothing queued';
      // R26 — say where it looked, so "Waiting for Iron Ore" is not a riddle
      case 'starved': return m.starvedFor === 'fuel'
        ? `Out of fuel — nothing to burn ${poolFor(m) ? 'in the stores here' : 'in your pack'}`
        : `Waiting for ${nameOf(m.starvedFor)} — none ${poolFor(m) ? (bagOpen(m) ? 'here or in your pack' : 'in the stores here') : 'in your pack'}`;
      case 'blocked': return 'Finished, and nowhere to put it';
      case 'unworked': return 'Standing cold — nobody is working this. Stand beside it, or hold E at it';
      case 'unpowered': return 'No power reaches this';
      case 'shed': return 'Grid is short — this was switched off to keep the important things on';
      default:
        /**
         * R19 — A BADGE THE DATA NEVER DECLARED IS A BUG, NOT A WORD TO PRINT AT THE PLAYER.
         *
         * data/power.json's `machineStates` is the list of what a machine may show, and the grid
         * now hands it over as `isState`. Until R19 nothing read that list, so the enumeration and
         * the code drifted the moment §3 invented `unworked` — and this branch's `return m.state`
         * meant the drift came out as a raw key in the station panel rather than as anything
         * anybody would report. `declared` on the snapshot is the same check for a screen that
         * would rather not print the sentence.
         */
        if (grid?.isState && !grid.isState(m.state)) {
          return `Something is wrong with this machine: nothing knows what "${m.state}" means.`;
        }
        return m.state;
    }
  }

  /**
   * R26 — WHAT THIS MACHINE IS WAITING FOR, AS A CHECKLIST.
   *
   * "It is not making the iron… I'm not sure why, it is unintuitive, and I'm not sure if its
   * because I don't have a storage crate." The badge said one word at a time — and only the FIRST
   * thing wrong — so a furnace with no ore, no fuel and nobody at it read "Waiting for Iron Ore"
   * and the other two were a surprise each. This is every condition at once, each with `ok` and a
   * sentence that says what to do. js/station-ui.js draws it at the top of the screen.
   *
   *   [{ key: 'job'|'input'|'fuel'|'work'|'power'|'store', ok, text }]
   */
  function needs(machineId) {
    const m = get(machineId);
    if (!m) return [];
    const out = [];
    const pool = poolFor(m);
    const pack = bagOpen(m, pool);
    const from = pool ? (pack ? 'here and in your pack' : 'in the stores here') : (pack ? 'in your pack' : 'anywhere it can reach');
    const job = m.queue[0];
    const recipe = job ? RECIPES[job.recipe] : null;
    if (m.enabled === false) out.push({ key: 'job', ok: false, text: 'Switched off — press Running to turn it back on.' });
    if (!recipe) {
      out.push({ key: 'job', ok: false, text: 'Nothing queued — pick something to make below.' });
    } else {
      const left = job.left === Infinity ? 'on a standing order' : `${job.left} to go`;
      out.push({ key: 'job', ok: true, text: `Making ${recipe.name} — ${left}.` });
      const ins = inputsOf(recipe);
      if (!ins) out.push({ key: 'input', ok: false, text: 'Needs a rare element this world does not hold.' });
      else if (!m.crafting) {
        for (const [res, n] of Object.entries(ins)) {
          const got = see(m, res);
          out.push({
            key: 'input', ok: got >= n,
            text: got >= n
              ? `${nameOf(res)}: ${fmtN(got)} ${from} (${fmtN(n)} a batch).`
              : `${nameOf(res)}: needs ${fmtN(n)} a batch, ${got > 0 ? `only ${fmtN(got)}` : 'none'} ${from}.`,
          });
        }
      } else {
        out.push({ key: 'input', ok: true, text: 'This batch is loaded and under way.' });
      }
    }
    const fuels = m.def.fuels || {};
    if (Object.keys(fuels).length) {
      const names = Object.keys(fuels).map(nameOf).join(', ');
      const on = Object.keys(fuels).find(r => see(m, r) >= 1);
      out.push({
        key: 'fuel', ok: m.fuelSeconds > 0 || !!on,
        text: m.fuelSeconds > 0 ? `Fuel: burning ${nameOf(m.fuelRes)}, ${Math.ceil(m.fuelSeconds)}s left${on ? ` · ${fmtN(see(m, on))} ${nameOf(on)} ${from}` : ''}.`
          : on ? `Fuel: ${fmtN(see(m, on))} ${nameOf(on)} ${from}.`
          : `Fuel: nothing to burn ${from} — it burns ${names}.`,
      });
    }
    const need = labourNeed(m);
    if (need > 0) {
      const secs = Math.round(m.workBank);
      out.push({
        key: 'work', ok: secs > 0,
        text: secs > 0 ? `Work: ${secs}s paid for — it runs while somebody stands at it. Hold E to go three times faster.`
          : 'Work: nobody is working it. Stand beside it, or hold E at it.',
      });
    }
    if ((m.def.powerUse || 0) > 0 && m.def.needsPower) {
      const sp = speedOf(m);
      out.push({ key: 'power', ok: sp.speed > 0, text: sp.speed > 0 ? 'Power: on.' : 'Power: none reaches this — build a generator and poles.' });
    }
    out.push({
      key: 'store', ok: true,
      text: pool
        ? (pack ? 'Takes from the stores here first, then your pack. What it makes goes into the stores.'
          : 'Takes from and fills the stores here. Stand beside it and it can use your pack too.')
        : bag ? 'No store in reach, so it takes from your pack and what it makes goes into your pack. A Storage Box beside it (six logs) lets it keep working while you are away.'
          : 'No store in reach: it cannot get at anything. Build a Storage Box (six logs) beside it.',
    });
    return out;
  }
  const fmtN = n => (Math.round(n * 10) / 10).toString();

  /** R19 — is this machine showing a state data/power.json declares? True with no grid to ask. */
  function stateDeclared(m) { return grid?.isState ? grid.isState(m.state) : true; }

  /** Every machine at once, for the base overview (§8.9) and the one shared job list (§3.19). */
  function allJobs() {
    const out = [];
    for (const m of machines.values()) {
      for (let i = 0; i < m.queue.length; i++) {
        const j = m.queue[i];
        out.push({
          machine: m.id, machineName: m.name, index: i,
          recipe: j.recipe, name: RECIPES[j.recipe]?.name || j.recipe,
          left: j.left, done: j.done,
          progress: i === 0 && RECIPES[j.recipe] ? Math.min(1, m.progress / RECIPES[j.recipe].time) : 0,
          state: i === 0 ? m.state : 'queued',
        });
      }
    }
    return out;
  }

  function toJSON() {
    return {
      completed: { ...completed },
      machines: [...machines.values()].map(m => ({
        id: m.id, type: m.type, x: m.x, z: m.z, enabled: m.enabled,
        queue: m.queue.map(j => ({ recipe: j.recipe, left: j.left === Infinity ? -1 : j.left, done: j.done })),
        progress: m.progress, crafting: m.crafting, pending: m.pending, fuelSeconds: m.fuelSeconds, fuelRes: m.fuelRes, made: m.made,
        workBank: m.workBank, workedSeconds: m.workedSeconds,
        priority: m.priority ?? 1, lastCredit: m.lastCredit || '',
      })),
    };
  }
  function load(json) {
    machines.clear();
    for (const k in completed) delete completed[k];
    Object.assign(completed, json?.completed || {});
    for (const spec of json?.machines || []) {
      const { machine } = place(spec);
      if (!machine) continue;
      machine.enabled = spec.enabled !== false;
      machine.progress = spec.progress || 0;
      machine.crafting = !!spec.crafting;
      // without this a save made while a machine was blocked re-grants the batch on load
      machine.pending = spec.pending || null;
      machine.fuelSeconds = spec.fuelSeconds || 0;
      machine.fuelRes = spec.fuelRes || null;
      machine.made = spec.made || 0;
      machine.workBank = spec.workBank || 0;
      machine.workedSeconds = spec.workedSeconds || 0;
      // A save made before R16 has neither of these, and the defaults are what it has always done.
      machine.priority = spec.priority == null ? 1 : Math.max(0, Math.min(2, spec.priority | 0));
      machine.lastCredit = spec.lastCredit || '';
      machine.queue = (spec.queue || []).map(j => ({ recipe: j.recipe, left: j.left < 0 ? Infinity : j.left, done: j.done || 0 }));
    }
    return machines.size;
  }

  /**
   * THE TENDER ARMS, AND WHY THEY COME OUT OF `machines()`.
   *
   * js/main.js's tick has called `board.runMachines(works.machines?.() || [], hours)` since the
   * building expansion landed, and `works.machines` did not exist — so the third work source,
   * the one js/work.js:284 was written for, has never once run. The Civilization Expansion's
   * Tender Arm (§3.6) is exactly that source: a powered arm on a post that works whatever bench it
   * can reach. `setTenders` is how the game layer hands them over (it knows what is built; this
   * file must not), and `machines()` is the list that dead call site was always asking for.
   *
   * A record is js/work.js's own shape — `{ id, name, stationId, tags, unitsPerHour, powered }` —
   * so `machineUnits` already returns 0 for an unpowered one and the arm dies with the grid with no
   * new rule anywhere.
   */
  let tenders = [];
  function setTenders(list = []) { tenders = list.filter(Boolean); return tenders.length; }

  /** Every machine at once, for the Holding screen's Work tab. */
  function labourBoard() {
    return [...machines.values()].map(m => ({
      id: m.id, name: m.name, type: m.type,
      state: m.state, stateText: stateText(m),
      needsWorking: labourNeed(m) > 0,
      auto: !!m.def.labour?.auto,
      secondsPerUnit: m.def.labour?.secondsPerUnit || 0,
      workBank: Math.round(m.workBank), workBankMax: bankCap(m),
      queued: m.queue.length,
      lit: m.workedSeconds > 0 && m.state === 'running',
      enabled: m.enabled !== false,
      priority: m.priority ?? 1,
      priorityWord: PRIORITY_WORDS[m.priority ?? 1] || 'normal',
      lastCredit: m.lastCredit || '',
    }));
  }

  return {
    place, remove: removeMachine, get, queue, cancel, clear, tick, catchUp,
    // R26 — the − / + on a queued job, the checklist, and whether the pack is in reach
    adjust, needs, bagOpen: id => { const m = get(id); return m ? bagOpen(m) : false; },
    isUnlocked, unlockProgress, available, board, inputsOf, snapshot, stateText, allJobs,
    // the Civilization Expansion §3 — work runs the machines
    labourNeed, credit, postLabour, collectLabour, labourBoard, setTenders,
    // R16 — the switch, the queue order, and the words for them
    setEnabled, setPriority, PRIORITY_WORDS,
    machines: () => tenders,
    all: () => [...machines.values()],
    labour: LAB,
    recipes: RECIPES, machineDefs: MACHINES, completed,
    set rare(key) { rareElement = key; },
    get rare() { return rareElement; },
    // R18 — read by js/defence.js `baseOf()`, which has been asking for it since the colony landed
    throughputPerMinute,
    toJSON, load,
    get size() { return machines.size; },
  };
}

// ---------------------------------------------------------------------------- your own two hands

/**
 * R16 — HOLD E AT A BENCH AND YOU ARE THE WORKER.
 *
 *   "Drills and similar resource extraction devices should be on their own building menu and are
 *    automated, separate from manufacturing devices which require work to be done by the player or
 *    NPC. Players can contribute work by holding E, and the progress bar should be indicated over
 *    the structure. NPCs can also work automatically and the player can jump in to help make it go
 *    faster."
 *
 * THE ONE RULE THIS FILE EXISTS TO KEEP: your units go into the SAME ORDER a citizen fills.
 *
 * R15 already let you work a machine by standing near it, and it did it by calling `works.credit`
 * directly — straight into the machine's bank, round the side of the board. That worked, and it was
 * a parallel system: your effort never appeared in an order, never appeared in `ledgerRows`, never
 * appeared in `creditLine`, and a citizen walking to the same furnace could not tell you had been
 * there. "The player can jump in to help" has to mean helping with the job they are doing, not
 * running a second invisible one beside it. So this goes through `board.swing`, which is
 * `addWork(source: 'player')`, which is the identical function `colony._doWork` and the Tender Arm
 * call — and the bar you see over the structure is that order's REAL fraction, not a local clock.
 *
 * It is not js/tools.js's `createGathering`, deliberately, and this is the one place that module's
 * "the same object can run a seam, a tree and a manufacturing structure" header does not hold. A
 * gather owns a clock and fires once at the end; this owns nothing and finishes nothing — the order
 * is shared with two other kinds of worker who may fill it while you are stood there, and a bar
 * driven by `elapsed / total` would be a lie the moment a citizen turned up to help.
 *
 *   const hand = createHandWork({ works, board, machineAt: () => nearestMachineEntry(), speed });
 *   hand.tick(dt, { at: elapsed, holding: keys.has('KeyE') });
 *   hud.workBar(hand.bar(), camera);
 *
 * Pure: no DOM, no Three.js. `machineAt()` hands back a build entry — `{ id, name, x, y, z, h }` —
 * because this file has no idea where the player is standing.
 */
export function createHandWork({
  works = null, board = null, machineAt = () => null,
  speed = () => 1, onLog = null, byName = 'You',
} = {}) {
  let bar = null;
  /** The machine the last complaint was about, so a refusal is said once and not sixty times. */
  let said = '';
  let atId = null;

  const say = (id, text, kind = '') => {
    const key = `${id}:${text}`;
    if (said === key) return;
    said = key;
    onLog?.(text, kind);
  };

  /** The machine's own live order, posting one if the once-a-second sweep has not got to it yet. */
  function orderFor(m, at) {
    const id = `lab_${m.id}`;
    let o = board.get(id);
    if (!o || o.complete || o.cancelled) {
      // safe to run more than once: `postLabour` refuses to post a second order for a machine that
      // already has one open
      works.postLabour?.(board, { at });
      o = board.get(id);
    }
    return o && !o.complete && !o.cancelled ? o : null;
  }

  /**
   * One frame. `holding` is simply whether the key is down — there is no channel to interrupt and
   * nothing to cancel, because walking away IS the cancel: `machineAt` stops returning the bench.
   */
  function tick(dt = 0, { at = 0, holding = false, machine: given = null } = {}) {
    bar = null;
    if (!works || !board) return null;
    const entry = given || machineAt();
    if (!entry) { atId = null; return null; }
    if (entry.id !== atId) { atId = entry.id; said = ''; }
    const m = works.get(entry.id);
    if (!m) return null;

    if (m.enabled === false) {
      if (holding) say(m.id, `The ${m.name} is switched off. Turn it back on before you work it.`, 'warn');
      return null;
    }
    const need = works.labourNeed(m);
    if (need <= 0) {
      // Not a refusal — this is the automated half of the split, and saying so is the whole of
      // "make that VISIBLE". A tier-2 machine on the grid genuinely does not want your help.
      if (holding) say(m.id, `The ${m.name} runs itself. It wants power, not hands.`, '');
      return null;
    }
    if (!m.queue.length) {
      if (holding) say(m.id, `The ${m.name} has nothing queued. Press B and pick what it should make.`, 'warn');
      return null;
    }
    const cap = m.def.labour?.bankSeconds ?? works.labour.bankSeconds;
    if (m.workBank >= cap - 1e-6) {
      if (holding) say(m.id, `The ${m.name} has all the work it can hold — ${Math.round(m.workBank / 60)} minutes of it.`, '');
      return null;
    }

    const order = orderFor(m, at);
    if (!order) return null;

    const rate = holding ? works.labour.handHoldPerSecond : works.labour.handStandPerSecond;
    const units = Math.max(0, rate) * Math.max(0.25, speed()) * Math.max(0, dt);
    const res = units > 0 ? board.swing(order, { units, by: 'player', byName }) : { applied: 0 };
    /**
     * Pay it out NOW rather than waiting for js/civics.js's once-a-second sweep. The sweep is still
     * the thing that runs for citizens and for benches you are nowhere near; this is here so that
     * the frame you put work in is the frame the furnace starts burning. `collectLabour` only ever
     * pays the units it has not paid for yet, so the two callers cannot double up.
     */
    if (res.applied > 0) works.collectLabour(board);

    // The bar is only up while you are actually holding the key. Standing near a bench keeps it
    // ticking over — that is R15's rule and it stays — but a bar that is up whenever you walk past
    // a furnace would be on screen for most of the game.
    if (holding) {
      bar = {
        x: entry.x, y: (entry.y ?? 0) + (entry.h ?? 2) + 0.6, z: entry.z,
        fraction: progressFraction(order),
        label: `Working the ${m.name}`,
        machine: m.id, order: order.id,
      };
      said = '';                                  // you are working it; nothing to complain about
    }
    return { machine: m, order, units: res.applied || 0, bar };
  }

  return {
    tick,
    /** What js/hud.js's `workBar` wants, or null. `pos` is built by the caller — this file is pure. */
    bar() { return bar; },
    get at() { return atId; },
    cancel() { bar = null; said = ''; },
  };
}
